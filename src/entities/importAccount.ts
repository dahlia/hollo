import { importActorProfile } from "@interop/wallet-export-ts";
import { Placeholder, SQL, eq } from "drizzle-orm";
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

    console.info(
      "🚀 ~ AccountImporter ~ importData ~ importedData:",
      importedData,
    );

    if (importedData["activitypub/actor.json"]) {
      // Import actor profile
      try {
        await this.importAccount(
          importedData["activitypub/actor.json"] as ActorProfile,
        );
        // for (const post of importedData["activitypub/outbox.json"]) {
        //   await this.importOutbox(post as Post[]);
        // }
        await Promise.all(
          (importedData["activitypub/outbox.json"] as Post[]).map(
            (post: Post) => this.importOutbox(post),
          ),
        );
      } catch (error) {
        console.error("Error importing account profile:", { error });
        return c.json({ error: "Failed to import account profile" }, 500);
      }
    }

    return c.json({ message: "Data imported successfully" }, 200);
  }

  async importAccount(profileData: ActorProfile) {
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

      if (!existingAccount) {
        console.error(`Cannot find existing account with ID: ${id}`);
        throw new Error("Account not found");
      }
      if (this.actorId !== profileData.id) {
        console.error(
          `Account ID mismatch: ${this.actorId} !== ${profileData.id}`,
        );
        throw new Error("Account ID mismatch");
      }
      // Update existing account
      await db
        .update(schema.accounts)
        .set(accountData)
        .where(eq(schema.accounts.id, id));
      console.info(`Updated existing account with ID: ${id}`);
    } catch (error) {
      console.error("Database operation failed:", error);
      throw error; // Re-throw the error to be caught in importData
    }
  }

  async importOutbox(post: Post) {
    console.info("Importing outbox data:", post.id);

    const postId = post.id;

    // Create post data for insertion or updating
    const postData = {
      id: postId,
      iri: post.uri, // Mapping uri to iri
      type: post.type,
      accountId: this.actorId, // Assuming accountId refers to actorId
      createdAt: post.created_at,
      inReplyToId: post.in_reply_to_id,
      sensitive: post.sensitive,
      spoilerText: post.spoiler_text,
      visibility: post.visibility,
      language: post.language,
      url: post.url,
      repliesCount: post.replies_count,
      reblogsCount: post.reblogs_count,
      favouritesCount: post.favourites_count,
      favourited: post.favourited,
      reblogged: post.reblogged,
      muted: post.muted,
      bookmarked: post.bookmarked,
      pinned: post.pinned,
      contentHtml: post.content,
      quoteId: post.quote_id,
    };

    try {
      // Check if the post already exists in the database
      const existingPost = await db.query.posts.findFirst({
        where: eq(schema.posts.id, postId),
      });

      if (!existingPost) {
        await db.insert(schema.posts).values(postData);
        console.info(`Inserted new post with ID: ${postId}`);
      } else {
        // Update existing post
        await db
          .update(schema.posts)
          .set(postData)
          .where(eq(schema.posts.id, postId));
        console.info(`Updated existing post with ID: ${postId}`);
      }
    } catch (error) {
      console.error(`Failed to import post with ID: ${postId}`, error);
    }

    console.info("Outbox data imported successfully.");
  }
}
