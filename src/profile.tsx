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
    <Layout
      title={accountOwner.account.name}
      url={accountOwner.account.url ?? accountOwner.account.iri}
      description={accountOwner.bio}
      imageUrl={accountOwner.account.avatarUrl}
    >
      <Profile accountOwner={accountOwner} />
      {posts.map((post) => (
        <PostView post={post} />
      ))}
    </Layout>
  );
};

app.get("/:id", async (c) => {
  let handle = c.req.param("handle");
  const postId = c.req.param("id");
  if (handle == null) return c.notFound();
  if (handle.startsWith("@")) handle = handle.substring(1);
  const post = await db.query.posts.findFirst({
    where: and(
      eq(
        posts.accountId,
        db
          .select({ id: accountOwners.id })
          .from(accountOwners)
          .where(eq(accountOwners.handle, handle)),
      ),
      eq(posts.id, postId),
      or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted")),
    ),
    with: { account: true },
  });
  if (post == null) return c.notFound();
  return c.html(<PostPage post={post} />);
});

export interface PostPageProps {
  post: Post & { account: Account };
}

export const PostPage: FC<PostPageProps> = ({ post }) => {
  const summary =
    post.summary ??
    ((post.content ?? "").length > 30
      ? `${(post.content ?? "").substring(0, 30)}…`
      : post.content ?? "");
  return (
    <Layout
      title={`${summary} — ${post.account.name}`}
      shortTitle={summary}
      description={post.summary ?? post.content}
      imageUrl={post.account.avatarUrl}
      url={post.url ?? post.iri}
    >
      {<PostView post={post} />}
    </Layout>
  );
};

export default app;
