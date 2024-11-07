export interface LoginFormProps {
  method?: "get" | "post" | "dialog";
  action: string;
  next?: string;
  values?: {
    email?: string;
  };
  errors?: {
    email?: string;
    password?: string;
  };
}

export function LoginForm(props: LoginFormProps) {
  return (
    <form method={props.method ?? "post"} action={props.action}>
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
        {props.errors?.email && <small>{props.errors.email}</small>}
      </label>
      <label>
        Password{" "}
        <input
          type="password"
          name="password"
          required={true}
          minLength={6}
          aria-invalid={props.errors?.password != null ? true : undefined}
        />
        {props.errors?.password && <small>{props.errors.password}</small>}
      </label>
      {props.next && <input type="hidden" name="next" value={props.next} />}
      <button type="submit">Sign in</button>
    </form>
  );
}
