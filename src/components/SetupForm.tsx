export interface SetupFormProps {
  method?: "get" | "post" | "dialog";
  action: string;
  values?: {
    email?: string;
  };
  errors?: {
    email?: string;
    password?: string;
    passwordConfirm?: string;
  };
}

export function SetupForm(props: SetupFormProps) {
  return (
    <form method={props.method ?? "post"} action={props.action}>
      <fieldset>
        <label>
          Email{" "}
          <input
            type="email"
            name="email"
            required={true}
            placeholder="john@example.com"
            value={props.values?.email}
            aria-invalid={props.errors?.email != null ? true : undefined}
          />
          <small>
            {props.errors?.email == null
              ? "Your email address will be used to sign in to Hollo."
              : props.errors.email}
          </small>
        </label>
      </fieldset>
      <fieldset className="grid">
        <label>
          Password{" "}
          <input
            type="password"
            name="password"
            required={true}
            minLength={6}
            aria-invalid={props.errors?.password != null ? true : undefined}
          />
          <small>
            {props.errors?.password == null
              ? "Your password must be at least 6 characters long."
              : props.errors.password}
          </small>
        </label>
        <label>
          Password (again){" "}
          <input
            type="password"
            name="password_confirm"
            required={true}
            minLength={6}
            aria-invalid={
              props.errors?.passwordConfirm != null ? true : undefined
            }
          />
          <small>
            {props.errors?.passwordConfirm == null
              ? "Please enter the same password again for confirmation."
              : props.errors.passwordConfirm}
          </small>
        </label>
      </fieldset>
      <button type="submit">Start using Hollo</button>
    </form>
  );
}
