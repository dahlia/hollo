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
    uri: url.host,
    title: url.host,
    short_description: `A Hollo instance at ${url.host}`,
    description: `A Hollo instance at ${url.host}`,
    email: credential.email,
    version: metadata.version,
    urls: {}, // TODO
    stats: {
      user_count: 0, // TODO
      status_count: 0, // TODO
      domain_count: 0, // TODO
    },
    thumbnail: null, // TODO
    languages: languages.map(({ language }) => language),
    registrations: false,
    approval_required: true,
    invites_enabled: false,
    configuration: {
      statuses: {
        // TODO
        max_characters: 4096,
        max_media_attachments: 8,
        characters_reserved_per_url: 256,
      },
      media_attachments: {
        supported_mime_types: [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
        ],
        image_size_limit: 1024 * 1024 * 32, // 32MiB
        image_matrix_limit: 16_777_216,
        // TODO
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
    },
    contact_account: serializeAccountOwner(accountOwner, c.req.url),
    rules: [],
  });
});

export default app;
