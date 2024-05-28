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
          // biome-ignore lint/security/noDangerouslySetInnerHtml: xss
          <div dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
        )
      ) : (
        <details>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: xss */}
          <summary dangerouslySetInnerHTML={{ __html: post.summaryHtml }} />
          {post.contentHtml && (
            // biome-ignore lint/security/noDangerouslySetInnerHtml: xss
            <div dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
          )}
        </details>
      )}
    </article>
  );
};

export default Post;
