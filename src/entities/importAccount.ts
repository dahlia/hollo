import { importActorProfile } from "@interop/wallet-export-ts";
import { and, eq } from "drizzle-orm";
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
        await Promise.all(
          (importedData["activitypub/outbox.json"] as Post[]).map(
            (post: Post) => this.importOutbox(post),
          ),
        );
        await Promise.all(
          (
            importedData["activitypub/followers.json"] as FollowersData
          ).orderedItems.map((follower: Follower) => {
            this.importFollower(follower);
          }),
        );
        await Promise.all(
          (
            importedData["activitypub/following.json"] as FollowersData
          ).orderedItems.map((follower: Follower) => {
            this.importFollowing(follower);
          }),
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
      console.error(
        `Account ID mismatch: ${this.actorId} !== ${profileData.id}`,
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

  async importFollower(follower: Follower) {
    console.info("Importing followers data:", follower);

    try {
      // Check if both follower and following accounts exist
      const actor = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, this.actorId),
      });
      if (!actor) {
        console.error(`Cannot find actor with ID: ${this.actorId}`);
        throw new Error("Actor not found");
      }

      const following = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, follower.followingId),
      });
      if (!following) {
        console.error(`Cannot find following with ID: ${follower.followingId}`);
        throw new Error("Following not found");
      }

      // Convert created and approved dates as needed
      const createdDate = new Date(follower.created as string); // Convert from string to Date
      const approvedDate =
        follower.approved instanceof Date ? follower.approved : null;

      // Check if a follow relationship already exists
      const existingFollow = await db.query.follows.findFirst({
        where: eq(schema.follows.followerId, this.actorId),
      });

      if (existingFollow) {
        // Update existing follow relationship
        await db
          .update(schema.follows)
          .set({
            created: createdDate,
            approved: approvedDate,
            iri: follower.iri,
            shares: follower.shares,
            notify: follower.notify,
            languages: follower.languages,
          })
          .where(eq(schema.follows.followerId, this.actorId));
        console.info(
          `Updated follow relationship for follower ID: ${this.actorId}`,
        );
      }
    } catch (error) {
      console.error("Database operation failed:", error);
      throw error; // Re-throw the error to be caught in importData
    }
  }

  async importFollowing(following: Follower) {
    console.info("Importing following data:", following);

    try {
      // Check if both follower and following accounts exist
      const actor = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, following.followerId),
      });
      if (!actor) {
        console.error(`Cannot find actor with ID: ${following.followerId}`);
        throw new Error("Actor not found");
      }

      const followingAccount = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, this.actorId),
      });
      if (!followingAccount) {
        console.error(`Cannot find following with ID: ${this.actorId}`);
        throw new Error("Following not found");
      }

      // Convert created and approved dates as needed
      const createdDate = new Date(following.created as string); // Convert from string to Date
      const approvedDate =
        following.approved instanceof Date ? following.approved : null;

      // Check if a follow relationship already exists
      const existingFollow = await db.query.follows.findFirst({
        where: eq(schema.follows.followingId, this.actorId),
      });

      if (existingFollow) {
        // Update existing follow relationship
        await db
          .update(schema.follows)
          .set({
            created: createdDate,
            approved: approvedDate,
            iri: following.iri,
            shares: following.shares,
            notify: following.notify,
            languages: following.languages,
          })
          .where(eq(schema.follows.followingId, this.actorId));
        console.info(
          `Updated follow relationship for follower ID: ${this.actorId}`,
        );
      }
    } catch (error) {
      console.error(
        `Failed to import follow relationship for follower ID: ${following.followerId} following ID: ${following.followingId}`,
        error,
      );
    }
  }
}
