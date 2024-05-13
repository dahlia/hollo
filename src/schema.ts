import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  jsonb,
  pgEnum,
  pgTable,
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
  following: bigint("following", { mode: "number" }).default(0),
  followers: bigint("followers", { mode: "number" }).default(0),
  posts: bigint("posts", { mode: "number" }).default(0),
  published: timestamp("published", { withTimezone: true }),
  updated: timestamp("updated", { withTimezone: true }).notNull().defaultNow(),
});

export const accountRelations = relations(accounts, ({ one }) => ({
  owner: one(accountOwners),
}));

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export const accountOwners = pgTable("account_owners", {
  id: uuid("id")
    .primaryKey()
    .references(() => accounts.id),
  privateKeyJwk: jsonb("private_key_jwk").$type<JsonWebKey>().notNull(),
  publicKeyJwk: jsonb("public_key_jwk").$type<JsonWebKey>().notNull(),
  bio: text("bio"),
});

export type AccountOwner = typeof accountOwners.$inferSelect;
export type NewAccountOwner = typeof accountOwners.$inferInsert;

export const accountOwnerRelations = relations(accountOwners, ({ one }) => ({
  account: one(accounts, {
    fields: [accountOwners.id],
    references: [accounts.id],
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
  redirectUri: text("redirect_uri").notNull(),
  scopes: scopeEnum("scopes").array().notNull(),
  website: text("website"),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret").notNull(),
});

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
