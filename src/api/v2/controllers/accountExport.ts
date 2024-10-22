import { exportActorProfile } from "@interop/wallet-export-ts";
import { getLogger } from "@logtape/logtape";
import { eq } from "drizzle-orm";
import db from "../../../db";
import { serializeAccount } from "../../../entities/account";
import { serializeList } from "../../../entities/list";
import { getPostRelations, serializePost } from "../../../entities/status";
import * as schema from "../../../schema";

// Main controller for account export
export const exportController = async (c) => {
  const logger = getLogger(["hollo", "api", "v2", "accountExport"]);
  logger.info("Received account export request");

  const actorId = c.req.param("actorId");
  // const owner = c.get("token").accountOwner;

  // // Authorization check
  // if (owner == null) {
  //   return c.json({ error: "Unauthorized" }, 401);
  // }
  // if (owner.handle !== actorId) {
  //   return c.json({ error: "Forbidden" }, 403);
  // }

  try {
    const account = await loadAccount(actorId);
    if (!account) {
      return c.json({ error: "Actor not found" }, 404);
    }

    const postsData = await loadPosts(account.owner.id);
    const serializedPosts = postsData.map((post) =>
      serializePost(post, { id: account.owner.id }, c.req.url),
    );

    const lists = await loadLists(actorId);
    const serializeLists = lists.map((list) => serializeList(list));

    const followers = await loadFollowers(actorId);
    const followingAccounts = await loadFollowing(actorId);
    const likes = await loadLikes(actorId);
    const bookmarks = await loadBookmarks(actorId);
    const mutedAccounts = await loadMutedAccounts(actorId);

    const exportTarballStream = exportActorProfile({
      actorProfile: serializeAccount(account, c.req.url),
      outbox: serializedPosts,
      lists: serializeLists,
      followers, //? serialize followers
      followingAccounts, //? serialize following
      likes, //? serialize likes
      bookmarks, //? serialize bookmark
      mutedAccounts, //? serialize muted accounts
    });

    return c.body(exportTarballStream, 200, {
      "Content-Type": "application/x-tar",
      "Content-Disposition": `attachment; filename="account_export_${actorId}.tar"`,
    });
  } catch (error) {
    logger.error("Account export failed: {error}", { error });
    return c.json({ error: "Export failed" }, 500);
  }
};

async function loadAccount(actorId: string) {
  return db.query.accounts.findFirst({
    where: eq(schema.accounts.id, actorId),
    with: { owner: true },
  });
}

async function loadPosts(accountId: string) {
  const items = await db.query.posts.findMany({
    where: eq(schema.posts.accountId, accountId),
    with: getPostRelations(accountId), // Fetch related data using getPostRelations
  });

  return items;
}

async function loadFollowers(accountId: string) {
  return db.query.follows.findMany({
    where: eq(schema.follows.followingId, accountId),
  });
}

async function loadFollowing(accountId: string) {
  return db.query.follows.findMany({
    where: eq(schema.follows.followerId, accountId),
  });
}

async function loadLikes(accountId: string) {
  return db.query.likes.findMany({
    where: eq(schema.likes.accountId, accountId),
  });
}

async function loadBookmarks(accountId: string) {
  return db.query.bookmarks.findMany({
    where: eq(schema.bookmarks.accountOwnerId, accountId),
  });
}

async function loadLists(accountId: string) {
  return db.query.lists.findMany({
    where: eq(schema.lists.accountOwnerId, accountId),
  });
}
async function loadMutedAccounts(accountId: string) {
  return db.query.mutes.findMany({
    where: eq(schema.mutes.accountId, accountId),
  });
}
