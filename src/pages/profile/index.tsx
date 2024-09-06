import { and, desc, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import Layout from "../../components/Layout.tsx";
import { Post as PostView } from "../../components/Post.tsx";
import { Profile } from "../../components/Profile.tsx";
import { db } from "../../db.ts";
import {
  type Account,
  type AccountOwner,
  type FeaturedTag,
  type Medium,
  type Poll,
  type PollOption,
  type Post,
  accountOwners,
  featuredTags,
  pinnedPosts,
  posts,
} from "../../schema.ts";

const profile = new Hono().basePath("/:handle{@[^/]+}");
profile.get("/", async (c) => {
  let handle = c.req.param("handle");
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
  const pinnedPostList = await db.query.pinnedPosts.findMany({
    where: and(eq(pinnedPosts.accountId, owner.id)),
    orderBy: desc(pinnedPosts.index),
    with: {
      post: {
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
      },
    },
  });
  const featuredTagList = await db.query.featuredTags.findMany({
    where: eq(featuredTags.accountOwnerId, owner.id),
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
      featuredTags={featuredTagList}
    />,
  );
});

interface ProfilePageProps {
  accountOwner: AccountOwner & { account: Account };
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
  pinnedPosts: (Post & {
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
  featuredTags: FeaturedTag[];
}

const ProfilePage = ({
  accountOwner,
  posts,
  pinnedPosts,
  featuredTags,
}: ProfilePageProps) => {
  return (
    <Layout
      title={accountOwner.account.name}
      url={accountOwner.account.url ?? accountOwner.account.iri}
      description={accountOwner.bio}
      imageUrl={accountOwner.account.avatarUrl}
    >
      <Profile accountOwner={accountOwner} />
      {featuredTags.length > 0 && (
        <p>
          Featured tags:{" "}
          {featuredTags.map((tag) => (
            <>
              <a
                href={`/tags/${encodeURIComponent(tag.name)}?handle=${
                  accountOwner.handle
                }`}
              >
                #{tag.name}
              </a>{" "}
            </>
          ))}
        </p>
      )}
      {pinnedPosts.map((post) => (
        <PostView post={post} pinned={true} />
      ))}
      {posts.map((post) => (
        <PostView post={post} />
      ))}
    </Layout>
  );
};

export default profile;
