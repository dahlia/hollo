import { and, inArray, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import metadata from "../../../package.json" with { type: "json" };
import { db } from "../../db";
import { serializeAccountOwner } from "../../entities/account";
import { accountOwners, posts } from "../../schema";

const app = new Hono();

app.get("/", async (c) => {
  const url = new URL(c.req.url);
  const credential = await db.query.credentials.findFirst();
  if (credential == null) return c.notFound();
  const accountOwner = await db.query.accountOwners.findFirst({
    with: { account: true },
  });
  if (accountOwner == null) return c.notFound();
  const languages = await db
    .select({ language: posts.language })
    .from(posts)
    .where(
      and(
        isNotNull(posts.language),
        inArray(
          posts.accountId,
          db.select({ id: accountOwners.id }).from(accountOwners),
        ),
      ),
    )
    .groupBy(posts.language);
  return c.json({
    domain: url.host,
    title: url.host,
    version: metadata.version,
    source_url: "https://github.com/dahlia/hollo",
    description: `A Hollo instance at ${url.host}`,
    usage: {
      users: {
        active_month: 0, // TODO
      },
    },
    // TODO: thumbnail
    languages: languages.map(({ language }) => language),
    configuration: {
      // TODO: urls
      accounts: {
        // TODO
        max_featured_tags: 0,
        max_pinned_statuses: 0,
      },
      statuses: {
        // TODO
        max_characters: 4096,
        max_media_attachments: 0,
        characters_reserved_per_url: 256,
      },
      media_attachments: {
        // TODO
        supported_mime_types: [],
        image_size_limit: 0,
        image_matrix_limit: 0,
        video_size_limit: 0,
        video_frame_rate_limit: 0,
        video_matrix_limit: 0,
      },
      polls: {
        // TODO
        max_options: 0,
        max_characters_per_option: 0,
        min_expiration: 0,
        max_expiration: 0,
      },
      translation: {
        enabled: false,
      },
      registrations: {
        enabled: false,
        approval_required: true,
        message: null,
      },
      contact: {
        email: credential.email,
        account: serializeAccountOwner(accountOwner, c.req.url),
      },
      rules: [],
    },
  });
});

export default app;
