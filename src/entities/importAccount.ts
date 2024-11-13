import { importActorProfile } from "@interop/wallet-export-ts";
import { getLogger } from "@logtape/logtape";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import db from "../db";
import * as schema from "../schema";

// AccountImporter class with refined typing using interfaces
export class AccountImporter {
  actorId: string;

  constructor(actorId: string) {
    this.actorId = actorId;
  }

  async importData(tarBuffer: Buffer, c: Context) {
    const importedData = await importActorProfile(tarBuffer);
    const logger = getLogger(["AccountImporter"]);

    logger.info(
      "🚀 ~ AccountImporter ~ importData ~ importedData:",
      importedData,
    );

    if (importedData["activitypub/actor.json"]) {
      // Import actor profile
      try {
        await this.importAccount(
          importedData["activitypub/actor.json"] as ActorProfile,
        );
      } catch (error) {
        logger.error("Error importing account profile:", error);
        return c.json({ error: "Failed to import account profile" }, 500);
      }
    }

    return c.json({ message: "Data imported successfully" }, 200);
  }

  async importAccount(profileData: ActorProfile) {
    const logger = getLogger(["AccountImporter"]);
    const {
      id,
      acct: handle,
      display_name: name,
      locked: protectedAccount,
      bot,
      created_at: published,
      note: bioHtml,
      url,
      avatar: avatarUrl,
      header: coverUrl,
      followers_count: followersCount,
      following_count: followingCount,
      statuses_count: postsCount,
      emojis,
      fields,
    } = profileData;

    // Convert fields and emojis arrays
    const fieldHtmls = fields.reduce(
      (acc, field) => {
        acc[field.name] = field.value;
        return acc;
      },
      {} as Record<string, string>,
    );

    const emojiMap = emojis.reduce(
      (acc, emoji) => {
        acc[emoji.shortcode] = emoji.url;
        return acc;
      },
      {} as Record<string, string>,
    );

    // Construct the account data object
    const accountData = {
      iri: url,
      handle,
      name,
      protected: protectedAccount,
      bioHtml,
      url,
      avatarUrl,
      coverUrl,
      followersCount,
      followingCount,
      postsCount,
      fieldHtmls,
      emojis: emojiMap,
      published: new Date(published),
    };

    try {
      // Check if the account already exists in the database
      const existingAccount = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, id),
      });
      console.log(
        "🚀 ~ AccountImporter ~ importAccount ~ existingAccount:",
        existingAccount,
      );
      console.log(`Searching for existing account with ID: ${this.actorId}`);
      if (this.actorId !== profileData.id) {
        console.log(
          `Mismatch between actorId (${this.actorId}) and profileData.id (${profileData.id})`,
        );
      } else {
        console.log(
          `Found existing account with ID: ${this.actorId}. Updating...`,
        );
      }

      if (existingAccount) {
        // Update existing account
        await db
          .update(schema.accounts)
          .set(accountData)
          .where(eq(schema.accounts.id, id));
        logger.info(`Updated existing account with ID: ${id}`);
      } else {
        // Insert new account
        await db.insert(schema.accounts).values(accountData);
        logger.info(`Inserted new account with ID: ${id}`);
      }
    } catch (error) {
      logger.error("Database operation failed:", error);
      throw error; // Re-throw the error to be caught in importData
    }
  }
}
