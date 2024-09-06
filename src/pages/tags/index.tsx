import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { Layout } from "../../components/Layout.tsx";
import { Post as PostView } from "../../components/Post.tsx";
import { db } from "../../db.ts";
import {
  type Account,
  type Medium,
  type Poll,
  type PollOption,
  type Post,
  accountOwners,
  posts,
} from "../../schema.ts";

const tags = new Hono().basePath("/:tag");

tags.get(async (c) => {
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

interface TagPageProps {
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

const TagPage = ({ tag, posts }: TagPageProps) => (
  <Layout title={`#${tag}`}>
    <h1>#{tag}</h1>
    {posts.map((post) => (
      <PostView post={post} />
    ))}
  </Layout>
);

export default tags;
