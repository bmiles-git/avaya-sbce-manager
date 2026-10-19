import { useState } from "react";
import { formatDay, looksLikeCert } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Button, inputClass } from "@/components/ui";

export function GuestUpload({ token }: { token: string }) {
  const request = useApp((s) => s.requests.find((item) => item.token === token));
  const device = useApp((s) => (request ? s.devices.find((item) => item.id === request.deviceId) : undefined));
  const upload = useApp((s) => s.uploadSigned);
  const [pem, setPem] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <img src="/gage-logo.svg" alt="Gage Technologies" className="h-10 w-auto" />
        <p className="mt-3 text-sm font-medium">Certificate return</p>
        <p className="text-xs text-muted">Scoped access. Nothing else in the console is available.</p>
      </div>
      {!request || !device ? (
        <p className="rounded-md border border-line bg-surface p-4 text-sm">This link is invalid or was reissued.</p>
      ) : request.status === "cancelled" ? (
        <p className="rounded-md border border-line bg-surface p-4 text-sm">This request was cancelled.</p>
      ) : new Date(request.tokenExpires).getTime() < Date.now() ? (
        <p className="rounded-md border border-line bg-surface p-4 text-sm">This link expired. Ask the operator to extend it.</p>
      ) : (
        <section className="space-y-4 rounded-md border border-line bg-surface p-5">
          <div>
            <h1 className="text-xl font-medium">{device.name}</h1>
            <p className="text-sm text-muted">
              {request.certName} · valid through {formatDay(request.tokenExpires)}
            </p>
            <p className="mt-2 text-sm">{request.notes}</p>
          </div>
          <pre className="max-h-36 overflow-auto rounded-md bg-bg p-3 font-mono text-xs text-muted">{request.csrPem}</pre>
          {done || request.status === "uploaded" || request.status === "completed" ? (
            <p className="text-sm text-ok">Signed certificate received. An operator still applies it to the SBCE.</p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!looksLikeCert(pem)) {
                  setMessage("Paste a PEM that includes BEGIN CERTIFICATE and END CERTIFICATE.");
                  return;
                }
                const result = upload(token, pem.trim());
                setMessage(result);
                if (!result) setDone(true);
              }}
            >
              <textarea
                className={inputClass}
                rows={8}
                placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                value={pem}
                onChange={(e) => setPem(e.target.value)}
              />
              {message ? <p className="text-sm text-danger">{message}</p> : null}
              <Button tone="primary" type="submit">
                Upload signed certificate
              </Button>
            </form>
          )}
          <button className="text-sm text-muted underline" onClick={() => { window.location.hash = ""; }}>
            Return to console sign-in
          </button>
        </section>
      )}
    </main>
  );
}
