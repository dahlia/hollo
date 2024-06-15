import type { FC } from "hono/jsx";
import type { Account, Medium as DbMedium, Post as DbPost } from "../schema";

export interface PostProps {
  post: DbPost & { account: Account; media: DbMedium[] };
}

export const Post: FC<PostProps> = ({ post }) => {
  const account = post.account;
  return (
    <article>
      <header>
        <hgroup>
          {account.avatarUrl && (
            <img
              src={account.avatarUrl}
              alt={`${account.name}'s avatar`}
              width={48}
              height={48}
              style="float: left; margin-right: .5em;"
            />
          )}
          <h5>
            <a href={account.url ?? account.iri}>{account.name}</a>
          </h5>
          <p>
            <small style="user-select: all;">{account.handle}</small>
          </p>
        </hgroup>
      </header>
      {post.summaryHtml == null || post.summaryHtml.trim() === "" ? (
        <PostContent post={post} />
      ) : (
        <details>
          <summary
            // biome-ignore lint/security/noDangerouslySetInnerHtml: xss
            dangerouslySetInnerHTML={{ __html: post.summaryHtml }}
            lang={post.language ?? undefined}
          />
          <PostContent post={post} />
        </details>
      )}
      <footer>
        <p>
          <a href={post.url ?? post.iri}>
            <small>
              <time dateTime={(post.published ?? post.updated).toISOString()}>
                {(post.published ?? post.updated).toLocaleString()}
              </time>
            </small>
          </a>
        </p>
      </footer>
    </article>
  );
};

interface PostContentProps {
  readonly post: DbPost & { media: DbMedium[] };
}

const PostContent: FC<PostContentProps> = ({ post }: PostContentProps) => {
  return (
    <>
      {post.contentHtml && (
        <div
          // biome-ignore lint/security/noDangerouslySetInnerHtml: xss
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
          lang={post.language ?? undefined}
        />
      )}
      {post.media.length > 0 && (
        <div>
          {post.media.map((medium) =>
            medium.description && medium.description.trim() !== "" ? (
              <figure>
                <Medium medium={medium} />
                <figcaption>{medium.description}</figcaption>
              </figure>
            ) : (
              <Medium medium={medium} />
            ),
          )}
        </div>
      )}
    </>
  );
};

interface MediumProps {
  medium: DbMedium;
}

const Medium: FC<MediumProps> = ({ medium }) => {
  return (
    <a href={medium.url}>
      <img
        key={medium.id}
        src={medium.thumbnailUrl}
        alt={medium.description ?? ""}
        width={medium.thumbnailWidth}
        height={medium.thumbnailHeight}
      />
    </a>
  );
};

export default Post;
