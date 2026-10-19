import { useEffect, useState } from "react";
import { checkReplacement, replacementInstructions } from "@/lib/cert-check";
import type { CheckResult } from "@/lib/cert-check";
import { formatDay } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Button, inputClass } from "@/components/ui";

export function GuestUpload({ token }: { token: string }) {
  const request = useApp((s) => s.requests.find((item) => item.token === token));
  const device = useApp((s) => (request ? s.devices.find((item) => item.id === request.deviceId) : undefined));
  const cert = useApp((s) =>
    request ? s.certs.find((item) => item.id === request.certId) ?? s.certs.find((item) => item.deviceId === request.deviceId && item.name === request.certName) : undefined,
  );
  const session = useApp((s) => s.session);
  const upload = useApp((s) => s.uploadSigned);
  const recordOpen = useApp((s) => s.recordOpen);
  const [pem, setPem] = useState("");
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!session) recordOpen(token);
  }, [recordOpen, session, token]);

  const expired = request ? new Date(request.tokenExpires).getTime() < Date.now() : false;
  const instructions = cert && device ? replacementInstructions(cert, device.name) : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <img src="/gage-logo.svg" alt="Gage Technologies" className="h-10 w-auto" />
        <p className="mt-3 text-sm font-medium">Certificate return</p>
        <p className="text-xs text-muted">This page can only return the signed certificate for one trunk.</p>
      </div>
      {!request || !device || !cert ? (
        <p className="rounded-md border border-line bg-surface p-4 text-sm">This link is invalid or was reissued.</p>
      ) : request.status === "cancelled" ? (
        <p className="rounded-md border border-line bg-surface p-4 text-sm">This request was cancelled.</p>
      ) : expired ? (
        <p className="rounded-md border border-line bg-surface p-4 text-sm">This link expired. Ask the operator to extend it.</p>
      ) : (
        <section className="space-y-4 rounded-md border border-line bg-surface p-5">
          {session ? (
            <p className="rounded-md bg-raised px-3 py-2 text-sm text-muted">Operator preview. This visit is not counted as the customer opening the link.</p>
          ) : null}
          <div>
            <h1 className="text-xl font-medium">{device.name}</h1>
            <p className="text-sm text-muted">
              Replacing {request.certName} · link valid through {formatDay(request.tokenExpires)}
            </p>
          </div>
          <ol className="list-decimal space-y-2 pl-4 text-sm">
            {instructions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
          <div>
            <p className="mb-1 text-xs text-muted">CSR for your CA</p>
            <pre className="max-h-36 overflow-auto rounded-md bg-bg p-3 font-mono text-xs text-muted">{request.csrPem}</pre>
          </div>
          {request.notes ? <p className="text-sm text-muted">{request.notes}</p> : null}
          {done || request.status === "uploaded" || request.status === "completed" ? (
            <p className="text-sm text-ok">Signed certificate accepted. It matched this trunk. An operator still applies it to the SBCE.</p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const result = checkReplacement(pem.trim(), cert);
                setChecks(result.checks);
                if (!result.ok) return;
                const message = upload(token, pem.trim());
                if (message) {
                  setChecks([{ ok: false, text: message }]);
                  return;
                }
                setDone(true);
              }}
            >
              <textarea
                className={inputClass}
                rows={8}
                placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                value={pem}
                onChange={(e) => setPem(e.target.value)}
              />
              {checks ? (
                <ul className="space-y-1">
                  {checks.map((item) => (
                    <li key={item.text} className={item.ok ? "text-sm text-ok" : "text-sm text-danger"}>
                      {item.ok ? "Pass" : "Fail"} · {item.text}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button tone="primary" type="submit">
                Check and upload
              </Button>
            </form>
          )}
          <button className="text-sm text-muted underline" onClick={() => { window.location.hash = ""; }}>
            Close
          </button>
        </section>
      )}
    </main>
  );
}
