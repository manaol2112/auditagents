import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ApiError, errorMessage, session } from "../api/client.ts";
import type { SessionUser } from "../api/schema.ts";
import { IconLock, Mark } from "./icons.tsx";
import { Field, describe } from "./ui.tsx";

export type SignedOutReason = "expired" | "signed_out" | "password_changed" | null;

export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <main className="auth-card">
        <div className="brand">
          <Mark />
          <div>
            <div className="brand-name">Planning Workforce</div>
            <div className="brand-sub">SOX ITGC audit planning</div>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

export function SignIn({ reason, onSignedIn }: { reason: SignedOutReason; onSignedIn: (u: SessionUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capsLock, setCapsLock] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  useEffect(() => { userRef.current?.focus(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;   // no duplicate submissions
    if (!username.trim() || !password) {
      setError("Enter your user name and password.");
      (username.trim() ? passRef : userRef).current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await session.signIn(username, password);
      setPassword("");
      onSignedIn(user);
    } catch (err) {
      setPassword("");   // never keep a rejected password around
      setError(err instanceof ApiError && err.kind === "unauthenticated" ? "The user name or password is not correct." : errorMessage(err));
      setBusy(false);
      passRef.current?.focus();
    }
  }

  const caps = (e: KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState("CapsLock"));

  return (
    <AuthCard>
      <h1>Sign in</h1>
      <p>Use the account your administrator set up for you. You will see only the engagements you are a member of.</p>

      {reason === "expired" && <div className="alert alert-warning" role="status">Your session ended. Sign in again to continue where you left off.</div>}
      {reason === "signed_out" && <div className="alert" role="status">You have signed out.</div>}

      {/* method="post": if script ever failed, the browser would never put the password in a URL (the CSP also blocks
          form navigation outright with form-action 'none'). */}
      <form method="post" onSubmit={submit} noValidate>
        <Field id="signin-user" label="User name">
          <input ref={userRef} id="signin-user" className="input" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off"
            spellCheck={false} maxLength={100} value={username} onChange={(e) => setUsername(e.target.value)} disabled={busy} {...describe("signin", error)} />
        </Field>
        <Field id="signin-pass" label="Password" hint={capsLock ? "Caps Lock is on." : undefined}>
          <input ref={passRef} id="signin-pass" className="input" type="password" name="password" autoComplete="current-password" maxLength={1024}
            value={password} onChange={(e) => setPassword(e.target.value)} onKeyUp={caps} onKeyDown={caps} disabled={busy}
            {...describe("signin", error)} />
        </Field>
        {error && <p className="alert alert-danger" id="signin-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy} aria-busy={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>

      <p className="auth-foot"><IconLock /> Sessions end after 12 hours without activity. Every sign-in is recorded in the audit trail.</p>
    </AuthCard>
  );
}
