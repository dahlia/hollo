import {
  Article,
  ChatMessage,
  Emoji,
  EmojiReact,
  Image,
  type InboxContext,
  Like,
  Link,
  Note,
  type Undo,
} from "@fedify/fedify";
import { getLogger } from "@logtape/logtape";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { type NewLike, likes, reactions } from "../schema";
import { persistAccount } from "./account";
import { updatePostStats } from "./post";

const inboxLogger = getLogger(["hollo", "inbox"]);

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
  let customEmoji: URL | null = null;
  if (emoji.startsWith(":") && emoji.endsWith(":")) {
    for await (const tag of react.getTags()) {
      if (!(tag instanceof Emoji) || tag.name?.toString()?.trim() !== emoji) {
        continue;
      }
      const icon = await tag.getIcon();
      if (!(icon instanceof Image) || icon.url == null) continue;
      customEmoji = icon.url instanceof Link ? icon.url.href : icon.url;
      if (customEmoji != null) break;
    }
  }
  await db.insert(reactions).values({
    postId: id,
    accountId: account.id,
    emoji,
    customEmoji: customEmoji?.href,
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
