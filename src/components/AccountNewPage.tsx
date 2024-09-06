import type { PostVisibility } from "../schema.ts";
import { AccountForm } from "./AccountForm.tsx";
import { Layout } from "./Layout.tsx";

export interface NewAccountPageProps {
  values?: {
    username?: string;
    name?: string;
    bio?: string;
    protected?: boolean;
    language?: string;
    visibility?: PostVisibility;
  };
  errors?: {
    username?: string;
    name?: string;
    bio?: string;
  };
}

export function NewAccountPage(props: NewAccountPageProps) {
  return (
    <Layout title="Hollo: New account">
      <hgroup>
        <h1>Create a new account</h1>
        <p>You can create a new account by filling out the form below.</p>
      </hgroup>
      <AccountForm
        action="/accounts"
        values={props.values}
        errors={props.errors}
        submitLabel="Create a new account"
      />
    </Layout>
  );
}
