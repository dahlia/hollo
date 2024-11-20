import { importActorProfile } from "@interop/wallet-export-ts";
import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import db from "../db";
import * as schema from "../schema";

export class AccountImporter {
  actorId: string;

  constructor(actorId: string) {
    this.actorId = actorId;
  }

  async importData(tarBuffer: Buffer, c: Context) {
    const importedData = await importActorProfile(tarBuffer);

    try {
      await this.importIfExists(
        importedData,
        "activitypub/actor.json",
        this.importAccount.bind(this),
      );
      await this.importCollection(
        importedData,
        "activitypub/outbox.json",
        this.importOutbox.bind(this),
      );
      await this.importOrderedItems(
        importedData,
        "activitypub/likes.json",
        this.importLike.bind(this),
      );
      await this.importOrderedItems(
        importedData,
        "activitypub/blocked_accounts.json",
        this.importBlock.bind(this),
      );
      await this.importOrderedItems(
        importedData,
        "activitypub/muted_accounts.json",
        this.importMute.bind(this),
      );
      await this.importOrderedItems(
        importedData,
        "activitypub/followers.json",
        this.importFollower.bind(this),
      );
      await this.importOrderedItems(
        importedData,
        "activitypub/following.json",
        this.importFollowing.bind(this),
      );
      await this.importOrderedItems(
        importedData,
        "activitypub/bookmarks.json",
        this.importBookmark.bind(this),
      );
      await this.importCollection(
        importedData,
        "activitypub/lists.json",
        this.importList.bind(this),
      );
    } catch (error) {
      console.error("Error importing account profile:", { error });
      return c.json({ error: "Failed to import account profile" }, 500);
    }

    return c.json({ message: "Data imported successfully" }, 200);
  }

  async importIfExists<T>(
    data: Record<string, unknown>,
    key: string,
    handler: (item: T) => Promise<void>,
  ) {
    if (key in data) {
      await handler(data[key] as T);
    }
  }

  async importCollection<T>(
    data: Record<string, unknown>,
    key: string,
    handler: (item: T) => Promise<void>,
  ) {
    if (Array.isArray(data[key])) {
      await Promise.all((data[key] as T[]).map(handler));
    }
  }

  async importOrderedItems<T>(
    data: Record<string, unknown>,
    key: string,
    handler: (item: T) => Promise<void>,
  ) {
    if (
      key in data &&
      typeof data[key] === "object" &&
      data[key] !== null &&
      "orderedItems" in (data[key] as Record<string, unknown>)
    ) {
      const orderedItems = (data[key] as { orderedItems: T[] }).orderedItems;
      await Promise.all(orderedItems.map(handler));
    }
  }

  async importAccount(profileData: ActorProfile) {
    const accountData = {
      iri: profileData.url,
      handle: profileData.acct,
      name: profileData.display_name,
      protected: profileData.locked,
      bioHtml: profileData.note,
      url: profileData.url,
      avatarUrl: profileData.avatar,
      coverUrl: profileData.header,
      followersCount: profileData.followers_count,
      followingCount: profileData.following_count,
      postsCount: profileData.statuses_count,
      fieldHtmls: profileData.fields.reduce(
        (acc, field) => {
          acc[field.name] = field.value;
          return acc;
        },
        {} as Record<string, string>,
      ),
      emojis: profileData.emojis.reduce(
        (acc, emoji) => {
          acc[emoji.shortcode] = emoji.url;
          return acc;
        },
        {} as Record<string, string>,
      ),
      published: new Date(profileData.created_at),
    };

    const existingAccount = await db.query.accounts.findFirst({
      where: eq(schema.accounts.id, profileData.id),
    });

    if (!existingAccount || this.actorId !== profileData.id) {
      throw new Error("Account mismatch or not found");
    }

    await db
      .update(schema.accounts)
      .set(accountData)
      .where(eq(schema.accounts.id, profileData.id));
  }

  async importOutbox(post: Post) {
    const postData = {
      id: post.id,
      iri: post.uri,
      type: post.type,
      accountId: this.actorId,
      createdAt: new Date(post.created_at),
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

    const existingPost = await db.query.posts.findFirst({
      where: eq(schema.posts.id, post.id),
    });

    if (existingPost) {
      await db
        .update(schema.posts)
        .set(postData)
        .where(eq(schema.posts.id, post.id));
    } else {
      await db.insert(schema.posts).values(postData);
    }
  }

  async importBookmark(bookmark: Bookmark) {
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
          created: new Date(bookmark.created),
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
        created: new Date(bookmark.created),
        postId: bookmark.postId,
        accountOwnerId: this.actorId,
      });
    }
  }
  async importFollower(follower: Follower) {
    try {
      const existingFollow = await db.query.follows.findFirst({
        where: and(
          eq(schema.follows.followerId, this.actorId),
          eq(schema.follows.followingId, follower.followingId),
        ),
      });

      const followData = {
        created: new Date(follower.created),
        approved: follower.approved ? new Date(follower.approved) : null,
        iri: follower.iri,
        shares: follower.shares,
        notify: follower.notify,
        languages: follower.languages,
        followerId: this.actorId,
        followingId: follower.followingId,
      };

      if (existingFollow) {
        await db
          .update(schema.follows)
          .set(followData)
          .where(
            and(
              eq(schema.follows.followerId, this.actorId),
              eq(schema.follows.followingId, follower.followingId),
            ),
          );
      } else {
        await db.insert(schema.follows).values(followData);
      }
    } catch (error) {
      console.error(
        `Failed to import follow relationship for follower ID: ${this.actorId} following ID: ${follower.followingId}`,
        error,
      );
    }
  }

  async importFollowing(following: Follower) {
    try {
      const existingFollow = await db.query.follows.findFirst({
        where: and(
          eq(schema.follows.followerId, following.followerId),
          eq(schema.follows.followingId, this.actorId),
        ),
      });

      const followData = {
        created: new Date(following.created),
        approved: following.approved ? new Date(following.approved) : null,
        iri: following.iri,
        shares: following.shares,
        notify: following.notify,
        languages: following.languages,
        followerId: following.followerId,
        followingId: this.actorId,
      };

      if (existingFollow) {
        await db
          .update(schema.follows)
          .set(followData)
          .where(
            and(
              eq(schema.follows.followerId, following.followerId),
              eq(schema.follows.followingId, this.actorId),
            ),
          );
      } else {
        await db.insert(schema.follows).values(followData);
      }
    } catch (error) {
      console.error(
        `Failed to import follow relationship for follower ID: ${following.followerId} following ID: ${this.actorId}`,
        error,
      );
    }
  }

  async importList(list: List) {
    const existingList = await db.query.lists.findFirst({
      where: eq(schema.lists.id, list.id),
    });

    const listData = {
      title: list.title,
      repliesPolicy: list.replies_policy,
      exclusive: list.exclusive,
      accountOwnerId: this.actorId,
    };

    if (existingList) {
      await db
        .update(schema.lists)
        .set(listData)
        .where(eq(schema.lists.id, list.id));
    } else {
      await db.insert(schema.lists).values({ id: list.id, ...listData });
    }
  }

  async importLike(like: Like) {
    const existingLike = await db.query.likes.findFirst({
      where: and(
        eq(schema.likes.accountId, this.actorId),
        eq(schema.likes.postId, like.postId),
      ),
    });

    const likeData = {
      created: new Date(like.created),
      postId: like.postId,
      accountId: this.actorId,
    };

    if (existingLike) {
      await db
        .update(schema.likes)
        .set(likeData)
        .where(
          and(
            eq(schema.likes.accountId, this.actorId),
            eq(schema.likes.postId, like.postId),
          ),
        );
    } else {
      await db.insert(schema.likes).values(likeData);
    }
  }

  async importBlock(block: Block) {
    const existingBlock = await db.query.blocks.findFirst({
      where: and(
        eq(schema.blocks.accountId, this.actorId),
        eq(schema.blocks.blockedAccountId, block.blockedAccountId),
      ),
    });

    const blockData = {
      created: new Date(block.created),
      accountId: this.actorId,
      blockedAccountId: block.blockedAccountId,
    };

    if (existingBlock) {
      await db
        .update(schema.blocks)
        .set(blockData)
        .where(
          and(
            eq(schema.blocks.accountId, this.actorId),
            eq(schema.blocks.blockedAccountId, block.blockedAccountId),
          ),
        );
    } else {
      await db.insert(schema.blocks).values(blockData);
    }
  }

  async importMute(mute: Mute) {
    const existingMute = await db.query.mutes.findFirst({
      where: and(
        eq(schema.mutes.accountId, this.actorId),
        eq(schema.mutes.mutedAccountId, mute.mutedAccountId),
      ),
    });

    const muteData = {
      id: mute.id,
      created: new Date(mute.created),
      notifications: mute.notifications,
      duration: mute.duration,
      accountId: this.actorId,
      mutedAccountId: mute.mutedAccountId,
    };

    if (existingMute) {
      await db
        .update(schema.mutes)
        .set(muteData)
        .where(
          and(
            eq(schema.mutes.accountId, this.actorId),
            eq(schema.mutes.mutedAccountId, mute.mutedAccountId),
          ),
        );
    } else {
      await db.insert(schema.mutes).values(muteData);
    }
  }
}
