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

    try {
      if (importedData["activitypub/actor.json"]) {
        await this.importAccount(
          importedData["activitypub/actor.json"] as ActorProfile,
        );
      }
      if (importedData["activitypub/outbox.json"]) {
        await Promise.all(
          (importedData["activitypub/outbox.json"] as Post[]).map(
            (post: Post) => this.importOutbox(post),
          ),
        );
      }
      if (importedData["activitypub/likes.json"]) {
        await Promise.all(
          importedData["activitypub/likes.json"].orderedItems.map(
            (like: Like) => this.importLike(like),
          ),
        );
      }
      if (importedData["activitypub/blocked_accounts.json"]) {
        await Promise.all(
          importedData["activitypub/blocked_accounts.json"].orderedItems.map(
            (block: Block) => this.importBlock(block),
          ),
        );
      }
      if (importedData["activitypub/muted_accounts.json"]) {
        await Promise.all(
          importedData["activitypub/muted_accounts.json"].orderedItems.map(
            (mute: Mute) => this.importMute(mute),
          ),
        );
      }
      if (importedData["activitypub/followers.json"]) {
        await Promise.all(
          (
            importedData["activitypub/followers.json"] as FollowersData
          ).orderedItems.map((follower: Follower) => {
            this.importFollower(follower);
          }),
        );
      }
      if (importedData["activitypub/following.json"]) {
        await Promise.all(
          (
            importedData["activitypub/following.json"] as FollowersData
          ).orderedItems.map((follower: Follower) => {
            this.importFollowing(follower);
          }),
        );
      }
      if (importedData["activitypub/bookmarks.json"]) {
        await Promise.all(
          (
            importedData["activitypub/bookmarks.json"] as FollowersData
          ).orderedItems.map((bookmark: Bookmark) => {
            this.importBookmark(bookmark);
          }),
        );
      }
      if (importedData["activitypub/lists.json"]) {
        await Promise.all(
          (importedData["activitypub/lists.json"] as List[]).map((list: List) =>
            this.importList(list),
          ),
        );
      }
    } catch (error) {
      console.error("Error importing account profile:", { error });
      return c.json({ error: "Failed to import account profile" }, 500);
    }

    return c.json({ message: "Data imported successfully" }, 200);
  }

  async importAccount(profileData: ActorProfile) {
    const {
      id,
      acct: handle,
      display_name: name,
      locked: protectedAccount,
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
      const existingAccount = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, id),
      });

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

      await db
        .update(schema.accounts)
        .set(accountData)
        .where(eq(schema.accounts.id, id));
      console.info(`Updated existing account with ID: ${id}`);
    } catch (error) {
      console.error("Database operation failed:", error);
      throw error;
    }
  }

  async importOutbox(post: Post) {
    console.info("Importing outbox data:", post.id);

    const postId = post.id;

    const postData = {
      id: postId,
      iri: post.uri, // Mapping uri to iri
      type: post.type,
      accountId: this.actorId,
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
      const existingPost = await db.query.posts.findFirst({
        where: eq(schema.posts.id, postId),
      });

      if (!existingPost) {
        await db.insert(schema.posts).values(postData);
        console.info(`Inserted new post with ID: ${postId}`);
      } else {
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

  async importBookmark(bookmark: Bookmark) {
    try {
      const account = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, this.actorId),
      });
      if (!account) {
        console.error(`Cannot find account with ID: ${this.actorId}`);
        throw new Error("Account not found");
      }

      const existingBookmark = await db.query.bookmarks.findFirst({
        where: and(
          eq(schema.bookmarks.accountOwnerId, this.actorId),
          eq(schema.bookmarks.postId, bookmark.postId),
        ),
      });

      if (existingBookmark) {
        await db
          .update(schema.bookmarks)
          .set({
            created: new Date(bookmark.created as string),
            postId: bookmark.postId,
            accountOwnerId: this.actorId,
          })
          .where(
            and(
              eq(schema.bookmarks.accountOwnerId, this.actorId),
              eq(schema.bookmarks.postId, bookmark.postId),
            ),
          );
      } else {
        await db.insert(schema.bookmarks).values({
          created: bookmark.created,
          postId: bookmark.postId,
          accountOwnerId: this.actorId,
        });
      }
    } catch (error) {
      console.error(
        `Failed to import bookmark relationship for account ID: ${this.actorId} post ID: ${bookmark.postId}`,
        error,
      );
    }
  }
  async importFollower(follower: Follower) {
    console.info("Importing followers data:", follower);

    try {
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

      const createdDate = new Date(follower.created as string);
      const approvedDate =
        follower.approved instanceof Date ? follower.approved : null;

      const existingFollow = await db.query.follows.findFirst({
        where: eq(schema.follows.followerId, this.actorId),
      });

      if (existingFollow) {
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
      } else {
        await db.insert(schema.follows).values({
          created: createdDate,
          approved: approvedDate,
          iri: follower.iri,
          shares: follower.shares,
          notify: follower.notify,
          languages: follower.languages,
          followerId: this.actorId,
          followingId: follower.followingId,
        });
        console.info(
          `Inserted new follow relationship for follower ID: ${this.actorId} following ID: ${follower.followingId}`,
        );
      }
    } catch (error) {
      console.error("Database operation failed:", error);
      throw error;
    }
  }

  async importFollowing(following: Follower) {
    console.info("Importing following data:", following);

    try {
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

      const createdDate = new Date(following.created as string);
      const approvedDate =
        following.approved instanceof Date ? following.approved : null;

      const existingFollow = await db.query.follows.findFirst({
        where: eq(schema.follows.followingId, this.actorId),
      });

      if (existingFollow) {
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
      } else {
        await db.insert(schema.follows).values({
          created: createdDate,
          approved: approvedDate,
          iri: following.iri,
          shares: following.shares,
          notify: following.notify,
          languages: following.languages,
          followerId: following.followerId,
          followingId: this.actorId,
        });
        console.info(
          `Inserted new follow relationship for follower ID: ${following.followerId} following ID: ${this.actorId}`,
        );
      }
    } catch (error) {
      console.error(
        `Failed to import follow relationship for follower ID: ${following.followerId} following ID: ${following.followingId}`,
        error,
      );
      throw error;
    }
  }

  async importList(list: List) {
    console.info("Importing list data:", list);

    try {
      const actor = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, this.actorId),
      });
      if (!actor) {
        console.error(`Cannot find actor with ID: ${this.actorId}`);
        throw new Error("Actor not found");
      }

      const existingList = await db.query.lists.findFirst({
        where: eq(schema.lists.id, list.id),
      });

      if (existingList) {
        await db
          .update(schema.lists)
          .set({
            title: list.title,
            repliesPolicy: list.replies_policy,
            exclusive: list.exclusive,
          })
          .where(eq(schema.lists.id, list.id));
        console.info(`Updated list with ID: ${list}`);
      } else {
        await db.insert(schema.lists).values({
          id: list.id,
          title: list.title,
          repliesPolicy: list.replies_policy,
          exclusive: list.exclusive,
          accountOwnerId: this.actorId,
        });
        console.info(`Inserted new list with ID: ${list.id}`);
      }
    } catch (error) {
      console.error(`Failed to import list with ID: ${list.id}`, error);
      throw error;
    }
  }

  async importLike(like: Like) {
    console.info("Importing like data:", like);

    try {
      const actor = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, this.actorId),
      });
      if (!actor) {
        console.error(`Cannot find actor with ID: ${this.actorId}`);
        throw new Error("Actor not found");
      }

      const existingLike = await db.query.likes.findFirst({
        where: and(
          eq(schema.likes.accountId, this.actorId),
          eq(schema.likes.postId, like.postId),
        ),
      });

      const formattedCreated = new Date(like.created);

      if (existingLike) {
        await db
          .update(schema.likes)
          .set({
            created: formattedCreated,
            postId: like.postId,
            accountId: this.actorId,
          })
          .where(
            and(
              eq(schema.likes.accountId, this.actorId),
              eq(schema.likes.postId, like.postId),
            ),
          );
      } else {
        await db.insert(schema.likes).values({
          created: formattedCreated,
          postId: like.postId,
          accountId: this.actorId,
        });
      }
    } catch (error) {
      console.error(
        `Failed to import like relationship for account ID: ${this.actorId} post ID: ${like.postId}`,
        {
          created: like.created,
        },
        error,
      );
      throw error;
    }
  }

  async importBlock(block: Block) {
    console.info("Importing block data:", block);

    try {
      const actor = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, this.actorId),
      });
      if (!actor) {
        console.error(`Cannot find actor with ID: ${this.actorId}`);
        throw new Error("Actor not found");
      }

      const existingBlock = await db.query.blocks.findFirst({
        where: and(
          eq(schema.blocks.accountId, this.actorId),
          eq(schema.blocks.blockedAccountId, block.blockedAccountId),
        ),
      });

      if (existingBlock) {
        await db
          .update(schema.blocks)
          .set({
            created: new Date(block.created),
            accountId: this.actorId,
            blockedAccountId: block.blockedAccountId,
          })
          .where(
            and(
              eq(schema.blocks.accountId, this.actorId),
              eq(schema.blocks.blockedAccountId, block.blockedAccountId),
            ),
          );
      } else {
        await db.insert(schema.blocks).values({
          accountId: this.actorId,
          blockedAccountId: block.blockedAccountId,
        });
      }
    } catch (error) {
      console.error(
        `Failed to import block relationship for account ID: ${this.actorId} blocked account ID: ${block.blockedAccountId}`,
        error,
      );
      throw error;
    }
  }

  async importMute(mute: Mute) {
    console.info("Importing mute data:", mute);

    try {
      const actor = await db.query.accounts.findFirst({
        where: eq(schema.accounts.id, this.actorId),
      });
      if (!actor) {
        console.error(`Cannot find actor with ID: ${this.actorId}`);
        throw new Error("Actor not found");
      }

      const existingMute = await db.query.mutes.findFirst({
        where: and(
          eq(schema.mutes.accountId, this.actorId),
          eq(schema.mutes.mutedAccountId, mute.mutedAccountId),
        ),
      });

      if (existingMute) {
        await db
          .update(schema.mutes)
          .set({
            created: new Date(mute.created),
            notifications: mute.notifications,
            duration: mute.duration,
          })
          .where(
            and(
              eq(schema.mutes.accountId, this.actorId),
              eq(schema.mutes.mutedAccountId, mute.mutedAccountId),
            ),
          );
      } else {
        await db.insert(schema.mutes).values({
          id: mute.id, // Assuming you have a function to generate unique IDs
          accountId: this.actorId,
          mutedAccountId: mute.mutedAccountId,
          created: new Date(mute.created),
          notifications: mute.notifications,
          duration: mute.duration,
        });
      }
    } catch (error) {
      console.error(
        `Failed to import mute relationship for account ID: ${this.actorId} muted account ID: ${mute.mutedAccountId}`,
        error,
      );
      throw error;
    }
  }
}
