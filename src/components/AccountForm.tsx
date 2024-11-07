import iso6391 from "iso-639-1";
import type { PostVisibility } from "../schema";

export interface AccountFormProps {
  method?: "get" | "post" | "dialog";
  action: string;
  readOnly?: {
    username?: boolean;
  };
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
  submitLabel: string;
}

export function AccountForm(props: AccountFormProps) {
  return (
    <form method={props.method ?? "post"} action={props.action}>
      <fieldset>
        <label>
          Username {props.readOnly?.username ? "(cannot change) " : ""}
          <input
            type="text"
            name="username"
            required={true}
            placeholder="john"
            readOnly={props.readOnly?.username}
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
      <fieldset class="grid">
        <label>
          Default language{" "}
          <select name="language">
            {iso6391
              .getAllCodes()
              .map((code) => [code, iso6391.getNativeName(code)])
              .sort(([_, nameA], [__, nameB]) => nameA.localeCompare(nameB))
              .map(([code, nativeName]) => (
                <option value={code} selected={props.values?.language === code}>
                  {nativeName} ({iso6391.getName(code)})
                </option>
              ))}
          </select>
        </label>
        <label>
          Default visibility{" "}
          <select name="visibility">
            <option
              value="public"
              selected={props.values?.visibility === "public"}
            >
              Public
            </option>
            <option
              value="unlisted"
              selected={props.values?.visibility === "unlisted"}
            >
              Unlisted
            </option>
            <option
              value="private"
              selected={props.values?.visibility === "private"}
            >
              Followers only
            </option>
            <option
              value="direct"
              selected={props.values?.visibility === "direct"}
            >
              Direct message
            </option>
          </select>
        </label>
      </fieldset>
      <fieldset>
        <label>
          <input
            type="checkbox"
            name="news"
            value="true"
            checked={props.values?.news}
          />{" "}
          Receive news and updates of Hollo by following the official Hollo
          account (<tt>{props.officialAccount}</tt>)
        </label>
      </fieldset>
      <button type="submit">{props.submitLabel}</button>
    </form>
  );
}
