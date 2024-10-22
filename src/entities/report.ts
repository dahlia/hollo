import { type Post, type Report, type Account } from "../schema"; 
import { serializeAccount } from "./account";

// biome-ignore lint/suspicious/noExplicitAny: JSON
export function serializeReport(
  report: Report,
  targetAccount: Account & { successor: Account | null },
  baseUrl: URL | string
): Record<string, any> {
  return {
    id: report.id,
    comment: report.comment ?? "",
    created_at: report.created,
    target_account: serializeAccount(targetAccount, baseUrl),
    status_ids: Array.isArray(report.posts) ? report.posts : [],
    // Additional properties in the Mastodon API which don't make sense on Hollo
    // just yet as we're not receiving reports, but we always forward them
    forwarded: true,
    category: "other",
    rule_ids: null,
  }
};
