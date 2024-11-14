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

  async loadFollows(type: "following" | "followers") {
    const column = type === "following" ? "followerId" : "followingId";
    return db.query.follows.findMany({
      where: eq(schema.follows[column], this.actorId),
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

  serializeBookmarks(bookmarks: schema.Bookmark[]) {
    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: "bookmarks.json",
      type: "OrderedCollection",
      orderedItems: bookmarks.map((bookmark) => bookmark.postId),
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

  async exportData(c: Context) {
    const account = await this.loadAccount();
    if (!account) return c.json({ error: "Actor not found" }, 404);

    // Load and serialize posts
    const postsData = await this.loadPosts();
    const serializedPosts = postsData.map((post) =>
      serializePost(post, { id: account.owner.id }, c.req.url),
    );

    // Load and serialize lists
    const lists = await this.loadLists();
    console.log("🚀 ~ AccountExporter ~ exportData ~ lists:", lists);
    const serializedLists = lists.map((list) => serializeList(list));
    console.log(
      "🚀 ~ AccountExporter ~ exportData ~ serializedLists:",
      serializedLists,
    );

    // Load and serialize followers
    const followers = await this.loadFollows("followers");
    const serializedFollowers = this.serializeFollowers(followers);

    // Load and serialize following
    const followingAccounts = await this.loadFollows("following");
    console.log(
      "🚀 ~ AccountExporter ~ exportData ~ followingAccounts:",
      followingAccounts,
    );
    const serializedFollowing = this.serializeFollowing(followingAccounts);
    console.log(
      "🚀 ~ AccountExporter ~ exportData ~ serializedFollowing:",
      serializedFollowing,
    );

    // Load and serialize bookmarks
    const bookmarks = await this.loadBookmarks();
    const serializedBookmarks = this.serializeBookmarks(bookmarks);

    // Generate export tarball
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
    });

    // @ts-ignore-next-line
    return c.body(exportTarballStream, 200, {
      "Content-Type": "application/x-tar",
      "Content-Disposition": `attachment; filename="account_export_${this.actorId}.tar"`,
    });
  }
}
