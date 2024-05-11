import type { FC } from "hono/jsx";
import xss from "xss";
import type { Account, AccountOwner } from "../schema";

export interface AccountListProps {
  accountOwners: (AccountOwner & { account: Account })[];
}

export const AccountList: FC<AccountListProps> = ({ accountOwners }) => {
  return (
    <>
      {accountOwners.map((account) => (
        <AccountItem accountOwner={account} />
      ))}
    </>
  );
};

export interface AccountItemProps {
  accountOwner: AccountOwner & { account: Account };
}

export const AccountItem: FC<AccountItemProps> = ({
  accountOwner: { account },
}) => {
  return (
    <article>
      <header>
        <hgroup>
          <h2>{account.name}</h2>
          <p style="user-select: all;">{account.handle}</p>
        </hgroup>
      </header>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: xss protected */}
      <div dangerouslySetInnerHTML={{ __html: xss(account.bioHtml ?? "") }} />
      <p>
        {account.published ? (
          <small>
            Created at{" "}
            <time dateTime={account.published.toISOString()}>
              {account.published.toLocaleDateString()}
            </time>
            .
          </small>
        ) : (
          <small>
            Fetched at{" "}
            <time dateTime={account.fetched.toISOString()}>
              {account.fetched.toLocaleDateString()}
            </time>
            .
          </small>
        )}
      </p>
      <footer>
        <form>
          <button type="submit" className="contrast">
            Delete
          </button>
        </form>
      </footer>
    </article>
  );
};
