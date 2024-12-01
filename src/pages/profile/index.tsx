import { and, desc, eq, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import xss from "xss";
import { Layout } from "../../components/Layout.tsx";
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
  type Reaction,
  accountOwners,
  featuredTags,
  pinnedPosts,
  posts,
} from "../../schema.ts";
import profilePost from "./profilePost.tsx";

const profile = new Hono();

profile.route("/:id{[-a-f0-9]+}", profilePost);

const WINDOW = 30;

profile.get<"/:handle">(async (c) => {
  let handle = c.req.param("handle");
  if (handle.startsWith("@")) handle = handle.substring(1);
  const owner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.handle, handle),
    with: { account: true },
  });
  if (owner == null) return c.notFound();
  const contStr = c.req.query("cont");
  const cont = contStr == null || contStr.trim() === "" ? undefined : contStr;
  const postList = await db.query.posts.findMany({
    where: and(
      eq(posts.accountId, owner.id),
      or(eq(posts.visibility, "public"), eq(posts.visibility, "unlisted")),
      ...(cont == null ? [] : [lte(posts.id, cont)]),
    ),
    orderBy: desc(posts.id),
    limit: WINDOW + 1,
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
  });
  const pinnedPostList =
    cont == null
      ? await db.query.pinnedPosts.findMany({
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
          },
        })
      : [];
  const featuredTagList = await db.query.featuredTags.findMany({
    where: eq(featuredTags.accountOwnerId, owner.id),
  });
  const atomUrl = new URL(c.req.url);
  atomUrl.pathname += "/atom.xml";
  atomUrl.search = "";
  const olderUrl =
    postList.length > WINDOW ? `?cont=${postList[WINDOW].id}` : undefined;
  return c.html(
    <ProfilePage
      accountOwner={owner}
      posts={postList.slice(0, WINDOW)}
      pinnedPosts={pinnedPostList
        .map((p) => p.post)
        .filter(
          (p) => p.visibility === "public" || p.visibility === "unlisted",
        )}
      featuredTags={featuredTagList}
      atomUrl={atomUrl.href}
      olderUrl={olderUrl}
    />,
  );
});

interface ProfilePageProps {
  readonly accountOwner: AccountOwner & { account: Account };
  readonly posts: (Post & {
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
  readonly pinnedPosts: (Post & {
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
  readonly featuredTags: FeaturedTag[];
  readonly atomUrl: string;
  readonly olderUrl?: string;
}

function ProfilePage({
  accountOwner,
  posts,
  pinnedPosts,
  featuredTags,
  atomUrl,
  olderUrl,
}: ProfilePageProps) {
  return (
    <Layout
      title={accountOwner.account.name}
      url={accountOwner.account.url ?? accountOwner.account.iri}
      description={accountOwner.bio}
      imageUrl={accountOwner.account.avatarUrl}
      links={[
        { rel: "alternate", type: "application/atom+xml", href: atomUrl },
      ]}
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
      <div style="text-align: right;">
        {olderUrl && <a href={olderUrl}>Older &rarr;</a>}
      </div>
    </Layout>
  );
}

profile.get("/atom.xml", async (c) => {
  let handle = c.req.param("handle");
  if (handle == null) return c.notFound();
  if (handle.startsWith("@")) handle = handle.substring(1);
  const owner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.handle, handle),
    with: { account: true },
  });
  if (owner == null) return c.notFound();
  const postList = await db.query.posts.findMany({
    with: { account: true },
    where: eq(posts.accountId, owner.id),
    orderBy: desc(posts.published),
    limit: 100,
  });
  const canonicalUrl = new URL(c.req.url);
  canonicalUrl.search = "";
  const response = await c.html(
    <feed xmlns="http://www.w3.org/2005/Atom">
      <id>urn:uuid:{owner.id}</id>
      <title>{owner.account.name}</title>
      <link rel="self" type="application/atom+xml" href={canonicalUrl.href} />
      <link
        rel="alternate"
        type="text/html"
        href={owner.account.url ?? owner.account.iri}
      />
      <link
        rel="alternate"
        type="application/activity+json"
        href={owner.account.iri}
      />
      <author>
        <name>{owner.account.name}</name>
        <uri>{owner.account.url ?? owner.account.iri}</uri>
      </author>
      <updated>
        {(postList[0]?.updated ?? owner.account.updated).toISOString()}
      </updated>
      {postList.map((post) => {
        const title = xss(post.contentHtml ?? "", {
          allowCommentTag: false,
          whiteList: {},
          stripIgnoreTag: true,
          stripBlankChar: false,
        })
          .trimStart()
          .replace(/\r?\n.*$/, "");
        return (
          <entry>
            <id>urn:uuid:{post.id}</id>
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: xss protected */}
            <title dangerouslySetInnerHTML={{ __html: title }} />
            <link
              rel="alternate"
              type="text/html"
              href={post.url ?? post.iri}
            />
            <link
              rel="alternate"
              type="application/activity+json"
              href={post.iri}
            />
            <author>
              <name>{post.account.name}</name>
              <uri>{post.account.url ?? post.account.iri}</uri>
            </author>
            <content type="html">{post.contentHtml}</content>
            {post.published && (
              <published>{post.published.toISOString()}</published>
            )}
            <updated>{post.updated.toISOString()}</updated>
          </entry>
        );
      })}
    </feed>,
  );
  response.headers.set("Content-Type", "application/atom+xml");
  return response;
});

export default profile;
