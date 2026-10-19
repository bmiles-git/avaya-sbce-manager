import { useState } from "react";
import { useApp } from "@/lib/store";
import { Button, Field, inputClass } from "@/components/ui";

export function LoginScreen() {
  const signInLocal = useApp((s) => s.signInLocal);
  const signInEntra = useApp((s) => s.signInEntra);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function entra() {
    setBusy(true);
    window.setTimeout(() => {
      signInEntra();
      setBusy(false);
    }, 700);
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-slate p-8 text-paper lg:border-r lg:border-paper/10">
        <img src="/gage-logo-light.svg" alt="Gage Technologies" className="h-10 w-auto self-start" />
        <div className="my-10 max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight">Certificate changes with a way back.</h1>
          <p className="mt-3 text-paper/75">
            Inventory, snapshots, customer CSR handoff, and expiration reporting for every managed border controller.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-paper/80">
            <li className="border-l-2 border-brass pl-3">Snapshot before every certificate or profile write.</li>
            <li className="border-l-2 border-paper/30 pl-3">Temporary upload links that never open the rest of the console.</li>
            <li className="border-l-2 border-paper/30 pl-3">Entra ID on 443. Local admin stays on 8443 if Entra is down.</li>
          </ul>
        </div>
        <p className="text-xs text-paper/60">Preview uses simulated SBCE API responses so every workflow can be exercised.</p>
      </section>

      <section className="flex flex-col justify-center gap-4 p-6 sm:p-10">
        <article className="rounded-md border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Entra ID</h2>
            <span className="font-mono text-xs text-muted">:443</span>
          </div>
          <p className="mb-4 text-sm text-muted">Primary path. Completes a delegated sign-in as Bryan Miles.</p>
          <Button tone="primary" className="w-full" onClick={entra} disabled={busy}>
            {busy ? "Contacting Entra ID…" : "Continue with Entra ID"}
          </Button>
        </article>

        <article className="rounded-md border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Local admin</h2>
            <span className="font-mono text-xs text-muted">:8443</span>
          </div>
          <p className="mb-4 text-sm text-muted">Break-glass listener. Use the account an administrator created for you.</p>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void signInLocal(username, password).then(setError);
            }}
          >
            <Field label="Username">
              <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </Field>
            <Field label="Password">
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button type="submit" className="w-full">
              Sign in locally
            </Button>
          </form>
        </article>
      </section>
    </main>
  );
}
