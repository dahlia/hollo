import { type DocumentLoader, isActor, lookupObject } from "@fedify/fedify";
import { hashtag } from "@fedify/markdown-it-hashtag";
import { mention } from "@fedify/markdown-it-mention";
import { getLogger } from "@logtape/logtape";
import * as cheerio from "cheerio";
import { type ExtractTablesWithRelations, inArray } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import MarkdownIt from "markdown-it";
import replaceLink from "markdown-it-replace-link";
import { persistAccount } from "./federation/account";
import * as schema from "./schema";

export interface FormatResult {
  html: string;
  mentions: string[];
  hashtags: string[];
  previewLink: string | null;
}

interface Env {
  hashtags: string[];
  previewLink: string | null;
}

export async function formatText(
  db: PgDatabase<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >,
  text: string,
  options: {
    url: URL | string;
    contextLoader?: DocumentLoader;
    documentLoader?: DocumentLoader;
  },
): Promise<FormatResult> {
  // List all mentions:
  const draft = new MarkdownIt({ linkify: true })
    .use(mention, {})
    .use(hashtag, {});
  const draftEnv: { mentions: string[] } = { mentions: [] };
  draft.render(text, draftEnv);

  // Collect already persisted accounts:
  const handles: Record<string, { id: string; href: string }> = {};
  const handleList =
    draftEnv.mentions.length > 0
      ? await db
          .select({
            handle: schema.accounts.handle,
            id: schema.accounts.id,
            url: schema.accounts.url,
            iri: schema.accounts.iri,
          })
          .from(schema.accounts)
          .where(inArray(schema.accounts.handle, draftEnv.mentions))
      : [];
  for (const { handle, id, url, iri } of handleList) {
    handles[handle] = { href: url ?? iri, id };
  }

  // Persist new accounts:
  for (const mention of draftEnv.mentions) {
    if (mention in handles) continue;
    const actor = await lookupObject(mention, options);
    if (!isActor(actor) || actor.id == null) continue;
    const account = await persistAccount(db, actor, options);
    if (account == null) continue;
    handles[account.handle] = {
      href: account.url ?? account.iri,
      id: account.id,
    };
  }

  // Render the final HTML:
  const md = new MarkdownIt({ linkify: true })
    .use(mention, {
      link(handle) {
        if (handle in handles) return handles[handle].href;
        return null;
      },
      linkAttributes(handle: string) {
        return {
          "data-account-id": handles[handle].id,
          "data-account-handle": handle,
          translate: "no",
          class: "h-card u-url mention",
        };
      },
      label(handle: string) {
        const bareHandle = handle.replaceAll(/(?:^@)|(?:@[^@]+$)/g, "");
        return `@<span>${Bun.escapeHTML(bareHandle)}</span>`;
      },
    })
    .use(hashtag, {
      link(tag) {
        return new URL(
          `/tags/${encodeURIComponent(tag.substring(1))}`,
          options.url,
        ).href;
      },
      linkAttributes(tag: string) {
        return {
          "data-tag": tag.substring(1),
          class: "mention hashtag",
          rel: "tag",
        };
      },
      label(tag: string) {
        return `#<span>${Bun.escapeHTML(tag.substring(1))}</span>`;
      },
    })
    // biome-ignore lint/suspicious/noExplicitAny: untyped
    .use(replaceLink as any, {
      processHTML: false,
      replaceLink(link: string, env: Env) {
        if (link.startsWith("http://") || link.startsWith("https://")) {
          env.previewLink = link;
          return link;
        }
        return new URL(link, new URL("/", options.url)).href;
      },
    });
  const env: Env = {
    hashtags: [],
    previewLink: null,
  };
  const html = md.render(text, env);
  getLogger(["hollo", "text"]).debug("Markdown-It environment: {env}", { env });
  return {
    html: html,
    mentions: Object.values(handles).map((v) => v.id),
    hashtags: env.hashtags,
    previewLink: env.previewLink,
  };
}

export function extractPreviewLink(html: string): string | null {
  const $ = cheerio.load(html);
  return $("a[href]:not([rel=tag]):not(.mention):last").attr("href") ?? null;
}

export function extractText(html: string | null): string | null {
  if (html == null) return null;
  const $ = cheerio.load(html);
  return $(":root").text();
}

// cSpell: ignore linkify
