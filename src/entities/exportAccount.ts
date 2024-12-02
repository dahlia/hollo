import { exportActorProfile } from "@interop/wallet-export-ts";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import db from "../db";
import * as schema from "../schema";
import { serializeAccount } from "./account";
import { serializeList } from "./list";
import { getPostRelations, serializePost } from "./status";

// Account Exporter class to handle data loading and serialization
export class AccountExporter {
  actorId: string;

  constructor(actorId: string) {
    this.actorId = actorId;
  }

  async loadAccount() {
    return db.query.accounts.findFirst({
      where: eq(schema.accounts.id, this.actorId),
      with: { owner: true },
    });
  }

  async loadPosts() {
    return db.query.posts.findMany({
      where: eq(schema.posts.accountId, this.actorId),
      with: getPostRelations(this.actorId), // Fetch related data using getPostRelations
    });
  }

  async loadFollows(type: "following" | "follower") {
    return db.query.follows.findMany({
      where: eq(schema.follows[`${type}Id`], this.actorId),
    });
  }

  async loadBookmarks() {
    return db.query.bookmarks.findMany({
      where: eq(schema.bookmarks.accountOwnerId, this.actorId),
    });
  }

  async loadLists() {
    return db.query.lists.findMany({
      where: eq(schema.lists.accountOwnerId, this.actorId),
    });
  }

  async loadLikes() {
    return db.query.likes.findMany({
      where: eq(schema.likes.accountId, this.actorId),
    });
  }

  async loadBloks() {
    return db.query.blocks.findMany({
      where: eq(schema.blocks.accountId, this.actorId),
    });
  }

  async loadMutes() {
    return db.query.mutes.findMany({
      where: eq(schema.mutes.accountId, this.actorId),
    });
  }

  serializeBookmarks(bookmarks: schema.Bookmark[]) {
    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: "bookmarks.json",
      type: "OrderedCollection",
      orderedItems: bookmarks,
    };
  }

  serializeFollowing(followingAccounts: schema.Follow[]) {
    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: "following_accounts.json",
      type: "OrderedCollection",
      orderedItems: followingAccounts.map((follower) => ({
        followingId: follower.followingId,
        followerId: follower.followerId,
        created: follower.created,
        languages: follower.languages,
        approved: follower.approved,
        iri: follower.iri,
        shares: follower.shares,
        notify: follower.notify,
      })),
    };
  }

  serializeFollowers(followers: schema.Follow[]) {
    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: "followers.json",
      type: "OrderedCollection",
      orderedItems: followers.map((follower) => ({
        followingId: follower.followingId,
        followerId: follower.followerId,
        created: follower.created,
        languages: follower.languages,
        approved: follower.approved,
        iri: follower.iri,
        shares: follower.shares,
        notify: follower.notify,
      })),
    };
  }

  serializeMutes(mutes: schema.Mute[]) {
    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: "muted_accounts.json",
      type: "OrderedCollection",
      orderedItems: mutes.map((mute) => ({
        id: mute.id,
        accountId: mute.accountId,
        mutedAccountId: mute.mutedAccountId,
        notifications: mute.notifications,
        duration: mute.duration,
        created: mute.created,
      })),
    };
  }

  serializeBlocks(blocks: schema.Block[]) {
    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: "blocked_accounts.json",
      type: "OrderedCollection",
      orderedItems: blocks.map((block) => ({
        accountId: block.accountId,
        blockedAccountId: block.blockedAccountId,
        created: block.created,
      })),
    };
  }

  serializeLikes(likes: schema.Like[]) {
    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: "likes.json",
      type: "OrderedCollection",
      orderedItems: likes.map((like) => ({
        postId: like.postId,
        accountId: like.accountId,
        created: like.created,
      })),
    };
  }

  async exportData(c: Context) {
    const account = await this.loadAccount();
    if (!account) return c.json({ error: "Actor not found" }, 404);

    // Load and serialize posts
    const postsData = await this.loadPosts();
    const serializedPosts = postsData.map((post) =>
      serializePost(post, { id: account.owner.id }, c.req.url),
    );

    const lists = await this.loadLists();
    const serializedLists = lists.map((list) => serializeList(list));

    const followers = await this.loadFollows("follower");
    const serializedFollowers = this.serializeFollowers(followers);

    const followingAccounts = await this.loadFollows("following");

    const serializedFollowing = this.serializeFollowing(followingAccounts);

    const bookmarks = await this.loadBookmarks();
    const serializedBookmarks = this.serializeBookmarks(bookmarks);

    const mutes = await this.loadMutes();
    const serializedMutes = this.serializeMutes(mutes);

    const blocks = await this.loadBloks();
    const serializedBlocks = this.serializeBlocks(blocks);

    const likes = await this.loadLikes();
    const serializedLikes = this.serializeLikes(likes);

    const exportTarballStream = exportActorProfile({
      actorProfile: serializeAccount(
        { ...account, successor: null },
        c.req.url,
      ),
      outbox: serializedPosts,
      lists: serializedLists,
      followers: serializedFollowers,
      followingAccounts: serializedFollowing,
      bookmarks: serializedBookmarks,
      mutedAccounts: serializedMutes,
      blockedAccounts: serializedBlocks,
      likes: serializedLikes,
    });

    // @ts-ignore-next-line
    return c.body(exportTarballStream, 200, {
      "Content-Type": "application/x-tar",
      "Content-Disposition": `attachment; filename="account_export_${this.actorId}.tar"`,
    });
  }
}
