import { useEffect, useState } from "react";
import { checkReplacement } from "@/lib/cert-check";
import type { CheckResult } from "@/lib/cert-check";
import { formatDay } from "@/lib/format";
import { haPeer } from "@/lib/scope";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui";

function commonName(subject: string) {
  return subject.match(/CN=([^,/]+)/i)?.[1]?.trim() ?? subject;
}

export function GuestUpload({ token }: { token: string }) {
  const request = useApp((s) => s.requests.find((item) => item.token === token));
  const device = useApp((s) => (request ? s.devices.find((item) => item.id === request.deviceId) : undefined));
  const peer = useApp((s) => haPeer(s.devices, device));
  const cert = useApp((s) =>
    request ? (s.certs.find((item) => item.id === request.certId) ?? s.certs.find((item) => item.deviceId === request.deviceId && item.name === request.certName)) : undefined,
  );
  const session = useApp((s) => s.session);
  const upload = useApp((s) => s.uploadSigned);
  const recordOpen = useApp((s) => s.recordOpen);
  const [pem, setPem] = useState("");
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  const [showCsr, setShowCsr] = useState(false);
  const [done, setDone] = useState<false | "accepted" | "held">(false);

  useEffect(() => {
    if (!session) recordOpen(token);
  }, [recordOpen, session, token]);

  const expired = request ? new Date(request.tokenExpires).getTime() < Date.now() : false;
  const closed = request?.status === "cancelled" || expired || !request || !device || !cert;
  const finished = Boolean(done || request?.status === "uploaded" || request?.status === "chain_review" || request?.status === "completed");
  const held = request?.status === "chain_review" || done === "held";
  const failed = checks?.filter((item) => !item.ok) ?? [];
  const cn = cert ? commonName(cert.subject) : "";
  const sans = cert?.sans.length ? cert.sans.join(", ") : cn;
  const key = cert?.requirements?.keyAlgorithm ?? "the key already on this trunk";

  async function readFile(file: File | undefined) {
    if (!file) return;
    setPem(await file.text());
    setChecks(null);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
      <p className="mb-8 text-sm font-semibold tracking-tight">SBCE Control</p>
      {closed ? (
        <section className="rounded-md border border-line bg-surface p-6">
          <h1 className="text-xl font-medium">This link is not usable</h1>
          <p className="mt-2 text-sm text-muted">
            {!request || !device || !cert
              ? "It is invalid, or it was replaced with a new link."
              : request.status === "cancelled"
                ? "The request was cancelled. Ask Gage for a new link if the certificate still needs to be replaced."
                : `It expired on ${formatDay(request.tokenExpires)}. Ask Gage to extend it.`}
          </p>
        </section>
      ) : (
        <section className="rounded-md border border-line bg-surface p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {device.name}
            {peer ? ` and ${peer.name}` : ""} · {request.certName}
          </p>
          <h1 className="mt-1 text-2xl font-medium">Return the signed certificate</h1>
          <p className="mt-2 text-sm text-muted">
            Link is good through {formatDay(request.tokenExpires)}. Paste the leaf, then each intermediate. Add the new root only if your CA supplier changed.
          </p>
          {session ? <p className="mt-3 text-xs text-muted">Operator preview. This visit is not counted.</p> : null}

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Common name</dt>
              <dd className="font-mono">{cn}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Key</dt>
              <dd>{key}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted">DNS names</dt>
              <dd className="font-mono">{sans}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted">Trusted supplier today</dt>
              <dd>{cert.requirements?.issuer || "the issuer already on this trunk"}</dd>
            </div>
          </dl>
          {request.notes ? <p className="mt-4 text-sm">{request.notes}</p> : null}

          <div className="mt-5 flex items-center justify-between gap-3">
            <button type="button" className="text-sm text-brass" onClick={() => setShowCsr((open) => !open)}>
              {showCsr ? "Hide CSR" : "Show CSR"}
            </button>
            <button
              type="button"
              className="text-sm text-brass"
              onClick={() => navigator.clipboard.writeText(request.csrPem)}
            >
              Copy CSR
            </button>
          </div>
          {showCsr ? <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-bg p-3 font-mono text-xs">{request.csrPem}</pre> : null}

          {finished ? (
            <p className={`mt-6 rounded-md px-3 py-3 text-sm ${held ? "bg-raised text-fg" : "bg-raised text-ok"}`}>
              {held
                ? "Received. The names match, but the signing root is new. Gage has to accept it before it can be installed."
                : "Received. The chain matches this trunk. Gage will install it."}
            </p>
          ) : (
            <form
              className="mt-6 space-y-3"
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
                setDone(result.trustChange ? "held" : "accepted");
              }}
            >
              <div
                className="rounded-md border border-dashed border-line bg-bg p-3"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  void readFile(event.dataTransfer.files[0]);
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted">Paste the PEM, or drop the file here</span>
                  <label className="cursor-pointer text-sm text-brass">
                    Choose file
                    <input
                      type="file"
                      accept=".pem,.crt,.cer,.txt"
                      className="hidden"
                      onChange={(event) => void readFile(event.target.files?.[0])}
                    />
                  </label>
                </div>
                <textarea
                  className="min-h-32 w-full resize-y bg-transparent font-mono text-xs outline-none"
                  rows={6}
                  aria-label="Signed certificate PEM"
                  placeholder="-----BEGIN CERTIFICATE-----"
                  value={pem}
                  onChange={(event) => {
                    setPem(event.target.value);
                    setChecks(null);
                  }}
                />
              </div>
              {failed.length > 0 ? (
                <ul className="space-y-1">
                  {failed.map((item) => (
                    <li key={item.text} className="text-sm text-danger">
                      {item.text}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button tone="primary" type="submit" disabled={!pem.trim()}>
                Submit certificate
              </Button>
            </form>
          )}
          {session ? (
            <button type="button" className="mt-4 text-sm text-muted" onClick={() => { window.location.hash = ""; }}>
              Back to the console
            </button>
          ) : null}
        </section>
      )}
    </main>
  );
}
