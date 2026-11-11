import { useEffect, useRef, useState, type FormEvent } from "react";
import { formError, session } from "../api/client.ts";
import { Field, describe } from "./ui.tsx";

/** Change one's own password. Rules mirror the server's (12–128 characters, not containing the user name, not a common
 * or sequential password); the server is the authority and its message is shown when it refuses. */
export function ChangePasswordForm({ userName, onDone, onCancel, submitLabel = "Change password" }: {
  userName: string; onDone: () => void; onCancel?: () => void; submitLabel?: string;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ next?: string; confirm?: string }>({});
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);

  function check(): boolean {
    const f: { next?: string; confirm?: string } = {};
    if (next.length < 12) f.next = "Use at least 12 characters. A few unrelated words work well.";
    else if (next.length > 128) f.next = "Use at most 128 characters.";
    else if (userName.length >= 3 && next.toLowerCase().includes(userName.toLowerCase())) f.next = "Do not include your user name.";
    else if (next === current) f.next = "Choose a password different from the current one.";
    if (!f.next && confirm !== next) f.confirm = "The two new passwords do not match.";
    setFieldErr(f);
    return !f.next && !f.confirm;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!current) { setError("Enter your current password."); first.current?.focus(); return; }
    if (!check()) return;
    setBusy(true);
    try {
      await session.changePassword(current, next);
      setCurrent(""); setNext(""); setConfirm("");
      onDone();
    } catch (err) {
      setError(formError(err));
      setBusy(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} noValidate className="form-fields">
      {/* Lets password managers save the new password against the right account. */}
      <input type="text" name="username" autoComplete="username" value={userName} readOnly hidden />
      <Field id="pw-current" label="Current password">
        <input ref={first} id="pw-current" className="input" type="password" autoComplete="current-password" maxLength={200}
          value={current} onChange={(e) => setCurrent(e.target.value)} disabled={busy} />
      </Field>
      <Field id="pw-next" label="New password" hint="At least 12 characters. A passphrase of several unrelated words is easiest to remember." error={fieldErr.next}>
        <input id="pw-next" className="input" type="password" autoComplete="new-password" maxLength={200}
          value={next} onChange={(e) => setNext(e.target.value)} disabled={busy} {...describe("pw-next", fieldErr.next, true)} />
      </Field>
      <Field id="pw-confirm" label="Confirm new password" error={fieldErr.confirm}>
        <input id="pw-confirm" className="input" type="password" autoComplete="new-password" maxLength={200}
          value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} {...describe("pw-confirm", fieldErr.confirm)} />
      </Field>
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      <div className="page-actions">
        <button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? "Saving…" : submitLabel}</button>
        {onCancel && <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
    </form>
  );
}
