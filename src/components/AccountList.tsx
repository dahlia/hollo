import xss from "xss";
import type { Account, AccountOwner } from "../schema";
import { renderCustomEmojis } from "../text";

export interface AccountListProps {
  accountOwners: (AccountOwner & { account: Account })[];
}

export function AccountList({ accountOwners }: AccountListProps) {
  return (
    <>
      {accountOwners.map((account) => (
        <AccountItem accountOwner={account} />
      ))}
    </>
  );
}

interface AccountItemProps {
  accountOwner: AccountOwner & { account: Account };
}

function AccountItem({ accountOwner: { account } }: AccountItemProps) {
  const nameHtml = renderCustomEmojis(
    Bun.escapeHTML(account.name),
    account.emojis,
  );
  const bioHtml = renderCustomEmojis(
    xss(account.bioHtml ?? ""),
    account.emojis,
  );
  return (
    <article>
      <header>
        <hgroup>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: xss protected */}
          <h2 dangerouslySetInnerHTML={{ __html: nameHtml }} />
          <p style="user-select: all;">{account.handle}</p>
        </hgroup>
      </header>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: xss protected */}
      <div dangerouslySetInnerHTML={{ __html: bioHtml }} />
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
            <time dateTime={account.updated.toISOString()}>
              {account.updated.toLocaleDateString()}
            </time>
            .
          </small>
        )}
      </p>
      <footer>
        <form
          className="grid"
          action={`/accounts/${account.id}/delete`}
          method="post"
          onsubmit="return confirm('Are you sure you want to delete this account?')"
        >
          <div>
            <a
              href={`/accounts/${account.id}`}
              role="button"
              className="contrast"
              style="display: block;"
            >
              Edit
            </a>
          </div>
          <button type="submit" className="contrast">
            Delete
          </button>
        </form>
      </footer>
    </article>
  );
}
