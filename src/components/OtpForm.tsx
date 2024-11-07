export interface OtpFormProps {
  method?: "get" | "post" | "dialog";
  action: string;
  next?: string;
  errors?: {
    token?: string;
  };
}

export function OtpForm(props: OtpFormProps) {
  return (
    <form method={props.method ?? "post"} action={props.action}>
      <fieldset role="group">
        <input
          type="text"
          name="token"
          inputMode="numeric"
          pattern="^[0-9]+$"
          required
          placeholder="123456"
          aria-invalid={props.errors?.token == null ? undefined : true}
        />
        <button type="submit">Verify</button>
      </fieldset>
      {props.errors?.token && <small>{props.errors.token}</small>}
      {props.next && <input type="hidden" name="next" value={props.next} />}
    </form>
  );
}
