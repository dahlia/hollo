import { and, desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import type { FC } from "hono/jsx";
import Layout from "./components/Layout";
import { Post as PostView } from "./components/Post";
import { Profile } from "./components/Profile";
import { db } from "./db";
import {
  type Account,
  type AccountOwner,
  type Post,
  accountOwners,
  posts,
} from "./schema";

const app = new Hono();

app.get("/", async (c) => {
  let handle = c.req.param("handle");
  if (handle == null) return c.notFound();
  if (handle.startsWith("@")) handle = handle.substring(1);
  const owner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.handle, handle),
    with: { account: true },
  });
  if (owner == null) return c.notFound();
  const postList = await db.query.posts.findMany({
    where: and(
      eq(posts.accountId, owner.id),
      or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted")),
    ),
    orderBy: desc(posts.id),
    with: { account: true },
  });
  return c.html(<ProfilePage accountOwner={owner} posts={postList} />);
});

export interface ProfilePageProps {
  accountOwner: AccountOwner & { account: Account };
  posts: (Post & { account: Account })[];
}

export const ProfilePage: FC<ProfilePageProps> = ({ accountOwner, posts }) => {
  return (
    <Layout title={accountOwner.account.name}>
      <Profile accountOwner={accountOwner} />
      {posts.map((post) => (
        <PostView post={post} />
      ))}
    </Layout>
  );
};

export default app;
