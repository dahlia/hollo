import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  json,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const credentials = pgTable("credentials", {
  email: varchar("email", { length: 254 }).primaryKey(),
  passwordHash: text("password_hash").notNull(),
  created: timestamp("created", { withTimezone: true }).notNull().defaultNow(),
});

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;

export const accountTypeEnum = pgEnum("account_type", [
  "Application",
  "Group",
  "Organization",
  "Person",
  "Service",
]);

export type AccountType = (typeof accountTypeEnum.enumValues)[number];

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey(),
  iri: text("iri").notNull().unique(),
  type: accountTypeEnum("type").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  handle: text("handle").notNull().unique(),
  bioHtml: text("bio_html"),
  url: text("url"),
  protected: boolean("protected").notNull().default(false),
  avatarUrl: text("avatar_url"),
  coverUrl: text("cover_url"),
  inboxUrl: text("inbox_url").notNull(),
  followersUrl: text("followers_url"),
  sharedInboxUrl: text("shared_inbox_url"),
  followingCount: bigint("following_count", { mode: "number" }).default(0),
  followersCount: bigint("followers_count", { mode: "number" }).default(0),
  postsCount: bigint("posts_count", { mode: "number" }).default(0),
  fieldHtmls: json("field_htmls")
    .notNull()
    .default({})
    .$type<Record<string, string>>(),
  published: timestamp("published", { withTimezone: true }),
  updated: timestamp("updated", { withTimezone: true }).notNull().defaultNow(),
});

export const accountRelations = relations(accounts, ({ one, many }) => ({
  owner: one(accountOwners, {
    fields: [accounts.id],
    references: [accountOwners.id],
  }),
  following: many(follows, { relationName: "following" }),
  followers: many(follows, { relationName: "follower" }),
  posts: many(posts),
  mentions: many(mentions),
  likes: many(likes),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export const accountOwners = pgTable("account_owners", {
  id: uuid("id")
    .primaryKey()
    .references(() => accounts.id),
  handle: text("handle").notNull().unique(),
  privateKeyJwk: jsonb("private_key_jwk").$type<JsonWebKey>().notNull(),
  publicKeyJwk: jsonb("public_key_jwk").$type<JsonWebKey>().notNull(),
  fields: json("fields").notNull().default({}).$type<Record<string, string>>(),
  bio: text("bio"),
});

export type AccountOwner = typeof accountOwners.$inferSelect;
export type NewAccountOwner = typeof accountOwners.$inferInsert;

export const accountOwnerRelations = relations(
  accountOwners,
  ({ one, many }) => ({
    account: one(accounts, {
      fields: [accountOwners.id],
      references: [accounts.id],
    }),
    accessTokens: many(accessTokens),
  }),
);

export const follows = pgTable(
  "follows",
  {
    iri: text("iri").notNull().unique(),
    followingId: uuid("following_id")
      .notNull()
      .references(() => accounts.id),
    followerId: uuid("follower_id")
      .notNull()
      .references(() => accounts.id),
    shares: boolean("shares").notNull().default(true),
    notify: boolean("notify").notNull().default(false),
    languages: text("languages").array(),
    created: timestamp("created", { withTimezone: true })
      .notNull()
      .defaultNow(),
    approved: timestamp("approved", { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.followingId, table.followerId] }),
  }),
);

export type Follow = typeof follows.$inferSelect;
export type NewFollow = typeof follows.$inferInsert;

export const followRelations = relations(follows, ({ one }) => ({
  following: one(accounts, {
    fields: [follows.followingId],
    references: [accounts.id],
    relationName: "follower",
  }),
  follower: one(accounts, {
    fields: [follows.followerId],
    references: [accounts.id],
    relationName: "following",
  }),
}));

export const scopeEnum = pgEnum("scope", [
  "read",
  "read:accounts",
  "read:blocks",
  "read:bookmarks",
  "read:favourites",
  "read:filters",
  "read:follows",
  "read:lists",
  "read:mutes",
  "read:notifications",
  "read:search",
  "read:statuses",
  "write",
  "write:accounts",
  "write:blocks",
  "write:bookmarks",
  "write:conversations",
  "write:favourites",
  "write:filters",
  "write:follows",
  "write:lists",
  "write:media",
  "write:mutes",
  "write:notifications",
  "write:reports",
  "write:statuses",
  "follow",
  "push",
]);

export type Scope = (typeof scopeEnum.enumValues)[number];

export const applications = pgTable("applications", {
  id: uuid("id").primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  redirectUris: text("redirect_uris").array().notNull(),
  scopes: scopeEnum("scopes").array().notNull(),
  website: text("website"),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret").notNull(),
  created: timestamp("created", { withTimezone: true }).notNull().defaultNow(),
});

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;

export const applicationRelations = relations(applications, ({ many }) => ({
  accessTokens: many(accessTokens),
}));

export const grantTypeEnum = pgEnum("grant_type", [
  "authorization_code",
  "client_credentials",
]);

export type GrantType = (typeof grantTypeEnum.enumValues)[number];

export const accessTokens = pgTable("access_tokens", {
  code: text("code").primaryKey(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id),
  accountOwnerId: uuid("account_owner_id").references(() => accountOwners.id),
  grant_type: grantTypeEnum("grant_type")
    .notNull()
    .default("authorization_code"),
  scopes: scopeEnum("scopes").array().notNull(),
  created: timestamp("created", { withTimezone: true }).notNull().defaultNow(),
});

export type AccessToken = typeof accessTokens.$inferSelect;
export type NewAccessToken = typeof accessTokens.$inferInsert;

export const accessTokenRelations = relations(accessTokens, ({ one }) => ({
  application: one(applications, {
    fields: [accessTokens.applicationId],
    references: [applications.id],
  }),
  accountOwner: one(accountOwners, {
    fields: [accessTokens.accountOwnerId],
    references: [accountOwners.id],
  }),
}));

export const postTypeEnum = pgEnum("post_type", ["Article", "Note"]);

export type PostType = (typeof postTypeEnum.enumValues)[number];

export const postVisibilityEnum = pgEnum("post_visibility", [
  "public",
  "unlisted",
  "private",
  "direct",
]);

export type PostVisibility = (typeof postVisibilityEnum.enumValues)[number];

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey(),
  iri: text("iri").notNull().unique(),
  type: postTypeEnum("type").notNull(),
  accountId: uuid("actor_id")
    .notNull()
    .references(() => accounts.id),
  applicationId: uuid("application_id").references(() => applications.id, {
    onDelete: "set null",
  }),
  replyTargetId: uuid("reply_target_id").references(
    (): AnyPgColumn => posts.id,
    { onDelete: "set null" },
  ),
  sharingId: uuid("sharing_id").references((): AnyPgColumn => posts.id, {
    onDelete: "cascade",
  }),
  visibility: postVisibilityEnum("visibility").notNull(),
  summaryHtml: text("summary_html"),
  contentHtml: text("content_html"),
  language: text("language"),
  tags: jsonb("tags").notNull().default({}).$type<Record<string, string>>(),
  sensitive: boolean("sensitive").notNull().default(false),
  url: text("url"),
  repliesCount: bigint("replies_count", { mode: "number" }).default(0),
  sharesCount: bigint("shares_count", { mode: "number" }).default(0),
  likesCount: bigint("likes_count", { mode: "number" }).default(0),
  published: timestamp("published", { withTimezone: true }),
  updated: timestamp("updated", { withTimezone: true }).notNull().defaultNow(),
});

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

export const postRelations = relations(posts, ({ one, many }) => ({
  account: one(accounts, {
    fields: [posts.accountId],
    references: [accounts.id],
  }),
  application: one(applications, {
    fields: [posts.applicationId],
    references: [applications.id],
  }),
  replyTarget: one(posts, {
    fields: [posts.replyTargetId],
    references: [posts.id],
    relationName: "reply",
  }),
  replies: many(posts, {
    relationName: "reply",
  }),
  likes: many(likes),
  sharing: one(posts, {
    fields: [posts.sharingId],
    references: [posts.id],
    relationName: "share",
  }),
  shares: many(posts, {
    relationName: "share",
  }),
  mentions: many(mentions),
}));

export const mentions = pgTable(
  "mentions",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId, table.accountId] }),
  }),
);

export type Mention = typeof mentions.$inferSelect;
export type NewMention = typeof mentions.$inferInsert;

export const mentionRelations = relations(mentions, ({ one }) => ({
  post: one(posts, {
    fields: [mentions.postId],
    references: [posts.id],
  }),
  account: one(accounts, {
    fields: [mentions.accountId],
    references: [accounts.id],
  }),
}));

export const likes = pgTable(
  "likes",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    created: timestamp("created", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId, table.accountId] }),
  }),
);

export type Like = typeof likes.$inferSelect;
export type NewLike = typeof likes.$inferInsert;

export const likeRelations = relations(likes, ({ one }) => ({
  post: one(posts, {
    fields: [likes.postId],
    references: [posts.id],
  }),
  account: one(accounts, {
    fields: [likes.accountId],
    references: [accounts.id],
  }),
}));
