import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { FC } from "hono/jsx";
import { Layout } from "./components/Layout";
import { Post as PostView } from "./components/Post";
import { db } from "./db";
import {
  type Account,
  type Medium,
  type Poll,
  type PollOption,
  type Post,
  accountOwners,
  posts,
} from "./schema";

const app = new Hono();

app.get("/:tag", async (c) => {
  const tag = c.req.param("tag");
  const handle = c.req.query("handle");
  const hashtag = `#${tag.toLowerCase()}`;
  const postList = await db.query.posts.findMany({
    where: and(
      sql`${posts.tags} ? ${hashtag}`,
      eq(posts.visibility, "public"),
      handle == null
        ? undefined
        : eq(
            posts.accountId,
            db
              .select({ id: accountOwners.id })
              .from(accountOwners)
              .where(eq(accountOwners.handle, handle)),
          ),
    ),
    orderBy: desc(posts.id),
    with: {
      account: true,
      media: true,
      poll: { with: { options: true } },
      sharing: {
        with: {
          account: true,
          media: true,
          poll: { with: { options: true } },
          replyTarget: { with: { account: true } },
        },
      },
      replyTarget: { with: { account: true } },
    },
  });
  return c.html(<TagPage tag={tag} posts={postList} />);
});

export interface TagPageProps {
  tag: string;
  posts: (Post & {
    account: Account;
    media: Medium[];
    poll: (Poll & { options: PollOption[] }) | null;
    sharing:
      | (Post & {
          account: Account;
          media: Medium[];
          poll: (Poll & { options: PollOption[] }) | null;
          replyTarget: (Post & { account: Account }) | null;
        })
      | null;
    replyTarget: (Post & { account: Account }) | null;
  })[];
}

export const TagPage: FC<TagPageProps> = ({ tag, posts }) => (
  <Layout title={`#${tag}`}>
    <h1>#{tag}</h1>
    {posts.map((post) => (
      <PostView post={post} />
    ))}
  </Layout>
);

export default app;
