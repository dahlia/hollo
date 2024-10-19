import {
  Article,
  Block,
  ChatMessage,
  Emoji,
  EmojiReact,
  Follow,
  Image,
  type InboxContext,
  Like,
  Link,
  type Move,
  Note,
  Reject,
  Undo,
  isActor,
} from "@fedify/fedify";
import { getLogger } from "@logtape/logtape";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  type NewLike,
  accountOwners,
  blocks,
  follows,
  likes,
  reactions,
} from "../schema";
import { persistAccount } from "./account";
import { updatePostStats } from "./post";

const inboxLogger = getLogger(["hollo", "inbox"]);

export async function onBlocked(ctx: InboxContext<void>, block: Block) {
  const blocker = await block.getActor();
  if (blocker == null) return;
  const object = ctx.parseUri(block.objectId);
  if (block.objectId == null || object?.type !== "actor") return;
  const blocked = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.handle, object.identifier),
  });
  if (blocked == null) return;
  const blockerAccount = await persistAccount(db, blocker, ctx);
  if (blockerAccount == null) return;
  const result = await db
    .insert(blocks)
    .values({
      accountId: blockerAccount.id,
      blockedAccountId: blocked.id,
    })
    .onConflictDoNothing()
    .returning();
  if (result.length < 1) return;
  const following = await db
    .delete(follows)
    .where(
      and(
        eq(follows.followingId, blockerAccount.id),
        eq(follows.followerId, blocked.id),
      ),
    )
    .returning();
  if (following.length > 0) {
    await ctx.sendActivity(
      object,
      blocker,
      new Undo({
        id: new URL(`#unfollows/${crypto.randomUUID()}`, block.objectId),
        actor: block.objectId,
        object: new Follow({
          id: new URL(following[0].iri),
          actor: block.objectId,
          object: blocker.id,
        }),
      }),
    );
  }
  const follower = await db
    .delete(follows)
    .where(
      and(
        eq(follows.followingId, blockerAccount.id),
        eq(follows.followerId, blocked.id),
      ),
    )
    .returning();
  if (follower.length > 0) {
    await ctx.sendActivity(
      object,
      blocker,
      new Reject({
        id: new URL(`#reject/${crypto.randomUUID()}`, block.objectId),
        actor: block.objectId,
        object: new Follow({
          id: new URL(follower[0].iri),
          actor: blocker.id,
          object: block.objectId,
        }),
      }),
    );
  }
}

export async function onUnblocked(
  ctx: InboxContext<void>,
  undo: Undo,
): Promise<void> {
  const object = await undo.getObject();
  if (
    !(object instanceof Block) ||
    undo.actorId?.href !== object.actorId?.href
  ) {
    return;
  }
  const actor = await undo.getActor();
  if (actor == null) return;
  const blocker = await persistAccount(db, actor, ctx);
  if (blocker == null) return;
  const target = ctx.parseUri(object.objectId);
  if (target?.type !== "actor") return;
  await db
    .delete(blocks)
    .where(
      and(
        eq(blocks.accountId, blocker.id),
        eq(
          blocks.blockedAccountId,
          db
            .select({ accountId: accountOwners.id })
            .from(accountOwners)
            .where(eq(accountOwners.handle, target.identifier)),
        ),
      ),
    );
}

export async function onLiked(
  ctx: InboxContext<void>,
  like: Like,
): Promise<void> {
  if (like.content != null) {
    await onEmojiReactionAdded(ctx, like);
    return;
  }
  if (like.objectId == null) return;
  const parsed = ctx.parseUri(like.objectId);
  if (parsed == null) return;
  const { type } = parsed;
  if (
    type === "object" &&
    (parsed.class === Note ||
      parsed.class === Article ||
      parsed.class === ChatMessage)
  ) {
    const actor = await like.getActor();
    if (actor == null) return;
    const account = await persistAccount(db, actor, ctx);
    if (account == null) return;
    // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
    const postId = parsed.values["id"];
    await db.transaction(async (tx) => {
      await tx
        .insert(likes)
        .values({ postId, accountId: account.id } satisfies NewLike);
      await updatePostStats(tx, { id: postId });
    });
    await ctx.forwardActivity(
      // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
      { username: parsed.values["username"] },
      "followers",
      { skipIfUnsigned: true },
    );
  } else {
    inboxLogger.debug("Unsupported object on Like: {objectId}", {
      objectId: like.objectId?.href,
    });
  }
}

export async function onUnliked(
  ctx: InboxContext<void>,
  undo: Undo,
): Promise<void> {
  const object = await undo.getObject();
  if (
    !(object instanceof Like) ||
    object.actorId?.href !== undo.actorId?.href
  ) {
    return;
  }
  const like = object;
  if (like.content != null) {
    await onEmojiReactionRemoved(ctx, undo);
    return;
  }
  if (like.objectId == null) return;
  const parsed = ctx.parseUri(like.objectId);
  if (parsed == null) return;
  const { type } = parsed;
  if (
    type === "object" &&
    (parsed.class === Note ||
      parsed.class === Article ||
      parsed.class === ChatMessage)
  ) {
    const actor = await like.getActor();
    if (actor == null) return;
    const account = await persistAccount(db, actor, ctx);
    if (account == null) return;
    // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
    const postId = parsed.values["id"];
    await db.transaction(async (tx) => {
      await tx
        .delete(likes)
        .where(and(eq(likes.postId, postId), eq(likes.accountId, account.id)));
      await updatePostStats(tx, { id: postId });
    });
    await ctx.forwardActivity(
      // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
      { username: parsed.values["username"] },
      "followers",
      { skipIfUnsigned: true },
    );
  } else {
    inboxLogger.debug("Unsupported object on Undo<Like>: {objectId}", {
      objectId: like.objectId?.href,
    });
  }
}

export async function onEmojiReactionAdded(
  ctx: InboxContext<void>,
  react: EmojiReact | Like,
): Promise<void> {
  if (react.content == null || react.objectId == null) return;
  const object = ctx.parseUri(react.objectId);
  if (
    object?.type !== "object" ||
    (object.class !== Note &&
      object.class !== Article &&
      object.class !== ChatMessage)
  ) {
    inboxLogger.debug("Unsupported object on EmojiReact: {objectId}", {
      objectId: react.objectId?.href,
    });
    return;
  }
  const { username, id } = object.values;
  const emoji = react.content.toString().trim();
  if (emoji === "") return;
  const actor = await react.getActor();
  if (actor == null) return;
  const account = await persistAccount(db, actor, ctx);
  if (account == null) return;
  let emojiIri: URL | null = null;
  let customEmoji: URL | null = null;
  if (emoji.startsWith(":") && emoji.endsWith(":")) {
    for await (const tag of react.getTags()) {
      if (
        tag.id == null ||
        !(tag instanceof Emoji) ||
        tag.name?.toString()?.trim() !== emoji
      ) {
        continue;
      }
      const icon = await tag.getIcon();
      if (!(icon instanceof Image) || icon.url == null) continue;
      customEmoji = icon.url instanceof Link ? icon.url.href : icon.url;
      emojiIri = tag.id;
      if (customEmoji != null) break;
    }
  }
  await db.insert(reactions).values({
    postId: id,
    accountId: account.id,
    emoji,
    customEmoji: customEmoji?.href,
    emojiIri: emojiIri?.href,
  });
  await ctx.forwardActivity({ username }, "followers", {
    skipIfUnsigned: true,
  });
}

export async function onEmojiReactionRemoved(
  ctx: InboxContext<void>,
  undo: Undo,
): Promise<void> {
  const object = await undo.getObject();
  if (
    !(object instanceof Like || object instanceof EmojiReact) ||
    object.actorId?.href !== undo.actorId?.href ||
    object.content == null
  ) {
    return;
  }
  const actor = await undo.getActor();
  if (actor == null) return;
  const account = await persistAccount(db, actor, ctx);
  if (account == null) return;
  const post = ctx.parseUri(object.objectId);
  if (
    post?.type !== "object" ||
    (post.class !== Note &&
      post.class !== Article &&
      post.class !== ChatMessage)
  ) {
    return;
  }
  const { username, id } = post.values;
  await db
    .delete(reactions)
    .where(
      and(
        eq(reactions.postId, id),
        eq(reactions.accountId, account.id),
        eq(reactions.emoji, object.content.toString().trim()),
      ),
    );
  await ctx.forwardActivity({ username }, "followers", {
    skipIfUnsigned: true,
  });
}

export async function onMove(
  ctx: InboxContext<void>,
  move: Move,
): Promise<void> {
  if (
    move.objectId == null ||
    move.targetId == null ||
    move.actorId?.href !== move.objectId.href
  ) {
    return;
  }
  const object = await move.getObject();
  if (!isActor(object)) return;
  const obj = await persistAccount(db, object, ctx);
  if (obj == null) return;
  const target = await move.getTarget();
  if (
    !isActor(target) ||
    target.aliasIds.every((a) => a.href !== object.id?.href)
  ) {
    return;
  }
  const tgt = await persistAccount(db, target, ctx);
  if (tgt == null) return;
  const followers = await db.query.follows.findMany({
    with: { follower: { with: { owner: true } } },
    where: eq(follows.followingId, obj.id),
  });
  for (const follower of followers) {
    if (follower.follower.owner == null) continue;
    const result = await db
      .insert(follows)
      .values({
        iri: new URL(`#follows/${crypto.randomUUID()}`, follower.follower.iri)
          .href,
        followingId: tgt.id,
        followerId: follower.followerId,
        shares: follower.shares,
        notify: follower.notify,
        languages: follower.languages,
        approved: tgt.owner == null || tgt.protected ? null : new Date(),
      })
      .onConflictDoNothing()
      .returning();
    if (tgt.owner != null || result.length < 1) continue;
    await ctx.sendActivity(
      { username: follower.follower.owner.handle },
      target,
      new Follow({
        id: new URL(result[0].iri),
        actor: new URL(follower.follower.iri),
        object: new URL(tgt.iri),
      }),
    );
  }
}
