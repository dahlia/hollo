import type { FC } from "hono/jsx";

export interface NewAccountForm {
  method?: string;
  action: string;
  values?: {
    username?: string;
    name?: string;
    bio?: string;
    protected?: boolean;
  };
  errors?: {
    username?: string;
    name?: string;
    bio?: string;
  };
}

export const NewAccountForm: FC<NewAccountForm> = (props) => {
  return (
    <form method={props.method ?? "post"} action={props.action}>
      <fieldset>
        <label>
          Username{" "}
          <input
            type="text"
            name="username"
            required={true}
            placeholder="john"
            value={props.values?.username}
            aria-invalid={props.errors?.username != null ? true : undefined}
            pattern="^[\\p{L}\\p{N}._\\-]+$"
          />
          <small>
            {props.errors?.username == null
              ? "Your username will a part of your fediverse handle."
              : props.errors.username}
          </small>
        </label>
        <label>
          Display name{" "}
          <input
            type="text"
            name="name"
            required={true}
            placeholder="John Doe"
            value={props.values?.name}
            aria-invalid={props.errors?.name != null ? true : undefined}
          />
          <small>
            {props.errors?.name == null
              ? "Your display name will be shown on your profile."
              : props.errors.name}
          </small>
        </label>
        <label>
          Bio{" "}
          <textarea
            name="bio"
            placeholder="A software engineer in Seoul, and a father of two kids."
            aria-invalid={props.errors?.bio != null ? true : undefined}
          >
            {props.values?.bio}
          </textarea>
          <small>
            {props.errors?.bio == null
              ? "A short description of yourself. Markdown is supported."
              : props.errors.bio}
          </small>
        </label>
        <label>
          <input
            type="checkbox"
            name="protected"
            value="true"
            checked={props.values?.protected}
          />{" "}
          Protect your account &mdash; only approved followers can see your
          posts
        </label>
      </fieldset>
      <button type="submit">Create a new account</button>
    </form>
  );
};
