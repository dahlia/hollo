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

  const href = account.url ?? account.iri;

  const downloadExport = async () => {
    // Create a FormData object to mimic form submission
    const formData = new FormData();
    formData.append("actorId", "12345"); // Add any required fields

    try {
      const response = await fetch(`/api/v2/12345/accountExport`, {
        method: "POST",
        body: formData, // FormData automatically sets the correct headers
      });

      if (!response.ok) {
        throw new Error(`Failed to export: ${response.statusText}`);
      }

      // Convert response to a Blob for file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      // Create an anchor element to trigger the download
      const a = document.createElement("a");
      a.href = url;
      a.download = `account_export_12345.tar`;
      document.body.appendChild(a);
      a.click();

      // Cleanup: Remove the anchor and revoke the object URL
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting account:", error);
    }
  };

  return (
    <article>
      <header>
        <hgroup>
          <h2>
            {/* biome-ignore lint/security/noDangerouslySetInnerHtml: xss protected */}
            <a dangerouslySetInnerHTML={{ __html: nameHtml }} href={href} />
          </h2>
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
          <div role="group">
            <a
              href={`/accounts/${account.id}`}
              role="button"
              style={{ display: 'block' }}
            >
              Edit
            </a>
            <a
              href={`/accounts/${account.id}/migrate`}
              role="button"
              className="contrast"
              style={{ display: 'block' }}
            >
              Migrate from/to
            </a>
            <button type="submit" className="secondary">
              Delete
            </button>
          </div>
        </form>
        {/* Export Account Button */}
        <button onClick={downloadExport}>Export Account</button>
      </footer>
    </article>
  );
}
