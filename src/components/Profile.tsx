import type { Account, AccountOwner } from "../schema";

export interface ProfileProps {
  accountOwner: AccountOwner & { account: Account };
}

export const Profile = ({ accountOwner }: ProfileProps) => {
  const account = accountOwner.account;
  return (
    <>
      <hgroup>
        {account.avatarUrl && (
          <img
            src={account.avatarUrl}
            alt={`${account.name}'s avatar`}
            width={72}
            height={72}
            style="float: left; margin-right: 1em;"
          />
        )}
        <h1>
          <a href={account.url ?? account.iri}>{account.name}</a>
        </h1>
        <p>
          <span
            style="user-select: all;"
            data-tooltip="Use this handle to reach out to this account on your fediverse server!"
            data-placement="bottom"
          >
            {account.handle}
          </span>{" "}
          &middot; {`${account.followingCount} following `}
          &middot;{" "}
          {account.followersCount === 1
            ? "1 follower"
            : `${account.followersCount} followers`}
        </p>
      </hgroup>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: no xss */}
      <div dangerouslySetInnerHTML={{ __html: account.bioHtml ?? "" }} />
      {account.fieldHtmls && (
        <table>
          <thead>
            <tr>
              {Object.keys(account.fieldHtmls).map((key) => (
                <th>{key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {Object.values(account.fieldHtmls).map((value) => (
                <td
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: no xss
                  dangerouslySetInnerHTML={{ __html: value }}
                />
              ))}
            </tr>
          </tbody>
        </table>
      )}
    </>
  );
};
