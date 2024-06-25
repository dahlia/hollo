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
  type Medium,
  type Post,
  accountOwners,
  pinnedPosts,
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
    with: {
      account: true,
      media: true,
      sharing: {
        with: {
          account: true,
          media: true,
          replyTarget: { with: { account: true } },
        },
      },
      replyTarget: { with: { account: true } },
    },
  });
  const pinnedPostList = await db.query.pinnedPosts.findMany({
    where: and(eq(pinnedPosts.accountId, owner.id)),
    orderBy: desc(pinnedPosts.index),
    with: {
      post: {
        with: {
          account: true,
          media: true,
          sharing: {
            with: {
              account: true,
              media: true,
              replyTarget: { with: { account: true } },
            },
          },
          replyTarget: { with: { account: true } },
        },
      },
    },
  });
  return c.html(
    <ProfilePage
      accountOwner={owner}
      posts={postList}
      pinnedPosts={pinnedPostList
        .map((p) => p.post)
        .filter(
          (p) => p.visibility === "public" || p.visibility === "unlisted",
        )}
    />,
  );
});

export interface ProfilePageProps {
  accountOwner: AccountOwner & { account: Account };
  posts: (Post & {
    account: Account;
    media: Medium[];
    sharing:
      | (Post & {
          account: Account;
          media: Medium[];
          replyTarget: (Post & { account: Account }) | null;
        })
      | null;
    replyTarget: (Post & { account: Account }) | null;
  })[];
  pinnedPosts: (Post & {
    account: Account;
    media: Medium[];
    sharing:
      | (Post & {
          account: Account;
          media: Medium[];
          replyTarget: (Post & { account: Account }) | null;
        })
      | null;
    replyTarget: (Post & { account: Account }) | null;
  })[];
}

export const ProfilePage: FC<ProfilePageProps> = ({
  accountOwner,
  posts,
  pinnedPosts,
}) => {
  return (
    <Layout
      title={accountOwner.account.name}
      url={accountOwner.account.url ?? accountOwner.account.iri}
      description={accountOwner.bio}
      imageUrl={accountOwner.account.avatarUrl}
    >
      <Profile accountOwner={accountOwner} />
      {pinnedPosts.map((post) => (
        <PostView post={post} pinned={true} />
      ))}
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
    with: {
      account: true,
      media: true,
      sharing: {
        with: {
          account: true,
          media: true,
          replyTarget: { with: { account: true } },
        },
      },
      replyTarget: { with: { account: true } },
      replies: {
        with: {
          account: true,
          media: true,
          sharing: {
            with: {
              account: true,
              media: true,
              replyTarget: { with: { account: true } },
            },
          },
          replyTarget: { with: { account: true } },
        },
      },
    },
  });
  if (post == null) return c.notFound();
  return c.html(<PostPage post={post} />);
});

export interface PostPageProps {
  post: Post & {
    account: Account;
    media: Medium[];
    sharing:
      | (Post & {
          account: Account;
          media: Medium[];
          replyTarget: (Post & { account: Account }) | null;
        })
      | null;
    replyTarget: (Post & { account: Account }) | null;
    replies: (Post & {
      account: Account;
      media: Medium[];
      sharing:
        | (Post & {
            account: Account;
            media: Medium[];
            replyTarget: (Post & { account: Account }) | null;
          })
        | null;
      replyTarget: (Post & { account: Account }) | null;
    })[];
  };
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
      <PostView post={post} />
      {post.replies.map((reply) => (
        <PostView post={reply} />
      ))}
    </Layout>
  );
};

export default app;
