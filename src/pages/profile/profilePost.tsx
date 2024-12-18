import { and, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import { Layout } from "../../components/Layout.tsx";
import { Post as PostView } from "../../components/Post.tsx";
import db from "../../db.ts";
import {
  type Account,
  type Medium,
  type Poll,
  type PollOption,
  type Post,
  type Reaction,
  accountOwners,
  posts,
} from "../../schema.ts";
import { isUuid } from "../../uuid.ts";

const profilePost = new Hono();

profilePost.get<"/:handle{@[^/]+}/:id{[-a-f0-9]+}">(async (c) => {
  let handle = c.req.param("handle");
  const postId = c.req.param("id");
  if (!isUuid(postId)) return c.notFound();
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
      poll: { with: { options: true } },
      sharing: {
        with: {
          account: true,
          media: true,
          poll: { with: { options: true } },
          replyTarget: { with: { account: true } },
          quoteTarget: {
            with: {
              account: true,
              media: true,
              poll: { with: { options: true } },
              replyTarget: { with: { account: true } },
              reactions: true,
            },
          },
          reactions: true,
        },
      },
      replyTarget: { with: { account: true } },
      quoteTarget: {
        with: {
          account: true,
          media: true,
          poll: { with: { options: true } },
          replyTarget: { with: { account: true } },
          reactions: true,
        },
      },
      replies: {
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
              quoteTarget: {
                with: {
                  account: true,
                  media: true,
                  poll: { with: { options: true } },
                  replyTarget: { with: { account: true } },
                  reactions: true,
                },
              },
              reactions: true,
            },
          },
          replyTarget: { with: { account: true } },
          quoteTarget: {
            with: {
              account: true,
              media: true,
              poll: { with: { options: true } },
              replyTarget: { with: { account: true } },
              reactions: true,
            },
          },
          reactions: true,
        },
      },
      reactions: true,
    },
  });
  if (post == null) return c.notFound();
  return c.html(<PostPage post={post} />);
});

interface PostPageProps {
  readonly post: Post & {
    account: Account;
    media: Medium[];
    poll: (Poll & { options: PollOption[] }) | null;
    sharing:
      | (Post & {
          account: Account;
          media: Medium[];
          poll: (Poll & { options: PollOption[] }) | null;
          replyTarget: (Post & { account: Account }) | null;
          quoteTarget:
            | (Post & {
                account: Account;
                media: Medium[];
                poll: (Poll & { options: PollOption[] }) | null;
                replyTarget: (Post & { account: Account }) | null;
                reactions: Reaction[];
              })
            | null;
          reactions: Reaction[];
        })
      | null;
    replyTarget: (Post & { account: Account }) | null;
    quoteTarget:
      | (Post & {
          account: Account;
          media: Medium[];
          poll: (Poll & { options: PollOption[] }) | null;
          replyTarget: (Post & { account: Account }) | null;
          reactions: Reaction[];
        })
      | null;
    replies: (Post & {
      account: Account;
      media: Medium[];
      poll: (Poll & { options: PollOption[] }) | null;
      sharing:
        | (Post & {
            account: Account;
            media: Medium[];
            poll: (Poll & { options: PollOption[] }) | null;
            replyTarget: (Post & { account: Account }) | null;
            quoteTarget:
              | (Post & {
                  account: Account;
                  media: Medium[];
                  poll: (Poll & { options: PollOption[] }) | null;
                  replyTarget: (Post & { account: Account }) | null;
                  reactions: Reaction[];
                })
              | null;
            reactions: Reaction[];
          })
        | null;
      replyTarget: (Post & { account: Account }) | null;
      quoteTarget:
        | (Post & {
            account: Account;
            media: Medium[];
            poll: (Poll & { options: PollOption[] }) | null;
            replyTarget: (Post & { account: Account }) | null;
            reactions: Reaction[];
          })
        | null;
      reactions: Reaction[];
    })[];
    reactions: Reaction[];
  };
}

function PostPage({ post }: PostPageProps) {
  const summary =
    post.summary ??
    ((post.content ?? "").length > 30
      ? `${(post.content ?? "").substring(0, 30)}…`
      : (post.content ?? ""));
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
}

export default profilePost;
