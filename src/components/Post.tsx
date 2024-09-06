import type {
  Account,
  Medium as DbMedium,
  Poll as DbPoll,
  Post as DbPost,
  PollOption,
} from "../schema";

export interface PostProps {
  post: DbPost & {
    account: Account;
    media: DbMedium[];
    poll: (DbPoll & { options: PollOption[] }) | null;
    sharing:
      | (DbPost & {
          account: Account;
          media: DbMedium[];
          poll: (DbPoll & { options: PollOption[] }) | null;
          replyTarget: (DbPost & { account: Account }) | null;
        })
      | null;
    replyTarget: (DbPost & { account: Account }) | null;
  };
  pinned?: boolean;
}

export const Post = ({ post, pinned }: PostProps) => {
  if (post.sharing != null)
    return <Post post={{ ...post.sharing, sharing: null }} />;
  const account = post.account;
  return (
    <article style={pinned ? "border: 1px solid gray;" : ""}>
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
            {post.replyTarget != null && (
              <>
                {" "}
                &middot;{" "}
                <small>
                  Reply to{" "}
                  <a href={post.replyTarget.url ?? post.replyTarget.iri}>
                    {post.replyTarget.account.name}'s post
                  </a>
                </small>{" "}
              </>
            )}
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
          <small>
            {" "}
            &middot; 👍{" "}
            {`${post.likesCount} ${
              post.likesCount === null || post.likesCount < 2 ? "like" : "likes"
            }`}
          </small>
          <small>
            {" "}
            &middot; 🔁{" "}
            {`${post.sharesCount} ${
              post.sharesCount === null || post.sharesCount < 2
                ? "share"
                : "shares"
            }`}
          </small>
          {pinned ? <small> &middot; Pinned</small> : ""}
        </p>
      </footer>
    </article>
  );
};

interface PostContentProps {
  readonly post: DbPost & {
    media: DbMedium[];
    poll: (DbPoll & { options: PollOption[] }) | null;
  };
}

const PostContent = ({ post }: PostContentProps) => {
  return (
    <>
      {post.contentHtml && (
        <div
          // biome-ignore lint/security/noDangerouslySetInnerHtml: xss
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
          lang={post.language ?? undefined}
        />
      )}
      {post.poll != null && <Poll poll={post.poll} />}
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

interface PollProps {
  poll: DbPoll & { options: PollOption[] };
}

const Poll = ({ poll }: PollProps) => {
  const options = poll.options;
  options.sort((a, b) => (a.index < b.index ? -1 : 1));
  const totalVotes = options.reduce(
    (acc, option) => acc + option.votesCount,
    0,
  );
  return (
    <table>
      <thead>
        <tr>
          <th>Option</th>
          <th>Voters</th>
        </tr>
      </thead>
      <tbody>
        {options.map((option) => {
          const percent =
            option.votesCount <= 0
              ? 0
              : Math.round((option.votesCount / totalVotes) * 100);
          return (
            <tr key={option.index}>
              <td>{option.title}</td>
              <td>
                <span
                  style={`display: block; width: ${percent}%; white-space: nowrap; border: 1px solid white; border-radius: 5px; padding: 3px 5px; background-color: black; color: white; text-shadow: 0 0 2px black;`}
                >
                  {option.votesCount} ({percent}%)
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

interface MediumProps {
  medium: DbMedium;
}

const Medium = ({ medium }: MediumProps) => {
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
