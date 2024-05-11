import { pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const credentials = pgTable("credentials", {
  email: varchar("email", { length: 254 }).primaryKey(),
  passwordHash: text("password_hash").notNull(),
  created: timestamp("created", { withTimezone: true }).notNull().defaultNow(),
});

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
