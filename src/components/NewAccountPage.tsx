import type { PostVisibility } from "../schema.ts";
import { AccountForm } from "./AccountForm.tsx";
import { DashboardLayout } from "./DashboardLayout.tsx";

export interface NewAccountPageProps {
  values?: {
    username?: string;
    name?: string;
    bio?: string;
    protected?: boolean;
    language?: string;
    visibility?: PostVisibility;
    news?: boolean;
  };
  errors?: {
    username?: string;
    name?: string;
    bio?: string;
  };
  officialAccount: string;
}

export function NewAccountPage(props: NewAccountPageProps) {
  return (
    <DashboardLayout title="Hollo: New account" selectedMenu="accounts">
      <hgroup>
        <h1>Create a new account</h1>
        <p>You can create a new account by filling out the form below.</p>
      </hgroup>
      <AccountForm
        action="/accounts"
        values={props.values}
        errors={props.errors}
        submitLabel="Create a new account"
        officialAccount={props.officialAccount}
      />
    </DashboardLayout>
  );
}
