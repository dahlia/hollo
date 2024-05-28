import type { FC } from "hono/jsx";
import type { Account, Post as DbPost } from "../schema";

export interface PostProps {
  post: DbPost & { account: Account };
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
      {post.summaryHtml == null ? (
        post.contentHtml && (
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: xss
            dangerouslySetInnerHTML={{ __html: post.contentHtml }}
            lang={post.language ?? undefined}
          />
        )
      ) : (
        <details>
          <summary
            // biome-ignore lint/security/noDangerouslySetInnerHtml: xss
            dangerouslySetInnerHTML={{ __html: post.summaryHtml }}
            lang={post.language ?? undefined}
          />
          {post.contentHtml && (
            <div
              // biome-ignore lint/security/noDangerouslySetInnerHtml: xss
              dangerouslySetInnerHTML={{ __html: post.contentHtml }}
              lang={post.language ?? undefined}
            />
          )}
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

export default Post;
