import {
  type Actor,
  type DocumentLoader,
  Link,
  PropertyValue,
  getActorHandle,
  getActorTypeName,
} from "@fedify/fedify";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { uuidv7 } from "uuidv7-js";
import * as schema from "../schema";
import { toDate } from "./date";

export async function persistAccount(
  db: PgDatabase<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >,
  actor: Actor,
  options: {
    contextLoader?: DocumentLoader;
    documentLoader?: DocumentLoader;
  } = {},
): Promise<schema.Account | null> {
  if (
    actor.id == null ||
    actor.inboxId == null ||
    (actor.name == null && actor.preferredUsername == null)
  ) {
    return null;
  }
  let handle: string;
  try {
    handle = await getActorHandle(actor);
  } catch (e) {
    if (e instanceof TypeError) return null;
    throw e;
  }
  const avatar = await actor.getIcon(options);
  const cover = await actor.getImage(options);
  const followers = await actor.getFollowers(options);
  const fieldHtmls: Record<string, string> = {};
  for await (const attachment of actor.getAttachments(options)) {
    if (
      attachment instanceof PropertyValue &&
      attachment.name != null &&
      attachment.value != null
    ) {
      fieldHtmls[attachment.name.toString()] = attachment.value.toString();
    }
  }
  const values: Omit<schema.NewAccount, "id" | "iri"> = {
    type: getActorTypeName(actor),
    name: actor?.name?.toString() ?? actor?.preferredUsername?.toString() ?? "",
    handle,
    bioHtml: actor.summary?.toString(),
    url: actor.url instanceof Link ? actor.url.href?.href : actor.url?.href,
    protected: actor.manuallyApprovesFollowers ?? false,
    avatarUrl:
      avatar?.url instanceof Link ? avatar.url.href?.href : avatar?.url?.href,
    coverUrl:
      cover?.url instanceof Link ? cover.url.href?.href : cover?.url?.href,
    inboxUrl: actor.inboxId.href,
    followersUrl: followers?.id?.href,
    sharedInboxUrl: actor.endpoints?.sharedInbox?.href,
    followingCount: (await actor.getFollowing(options))?.totalItems ?? 0,
    followersCount: followers?.totalItems ?? 0,
    postsCount: (await actor.getOutbox(options))?.totalItems ?? 0,
    fieldHtmls,
    published: toDate(actor.published),
  };
  const result = await db
    .insert(schema.accounts)
    .values({
      id: uuidv7(),
      iri: actor.id.href,
      ...values,
    } satisfies schema.NewAccount)
    .onConflictDoUpdate({
      target: schema.accounts.iri,
      set: values,
    })
    .returning();
  return result[0] ?? null;
}
