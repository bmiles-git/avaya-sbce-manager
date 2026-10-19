import { useState } from "react";
import { buildSampleChain } from "@/lib/cert-check";
import { formatDay, formatWhen } from "@/lib/format";
import { devicesFor } from "@/lib/scope";
import { useApp } from "@/lib/store";
import { Button, Field, inputClass, Panel, Pill } from "@/components/ui";

const openStatuses = new Set(["draft", "csr_generated", "sent", "awaiting_upload", "uploaded", "chain_review", "applied"]);

export function Requests() {
  const requests = useApp((s) => s.requests);
  const certs = useApp((s) => s.certs);
  const allDevices = useApp((s) => s.devices);
  const sites = useApp((s) => s.sites);
  const customerId = useApp((s) => s.selectedCustomerId);
  const focusRequestId = useApp((s) => s.focusRequestId);
  const devices = devicesFor(sites, allDevices, customerId);
  const createRequest = useApp((s) => s.createRequest);
  const renewManaged = useApp((s) => s.renewManaged);
  const markSent = useApp((s) => s.markSent);
  const extendRequest = useApp((s) => s.extendRequest);
  const reissueRequest = useApp((s) => s.reissueRequest);
  const cancelRequest = useApp((s) => s.cancelRequest);
  const applyRequest = useApp((s) => s.applyRequest);
  const updateRequest = useApp((s) => s.updateRequest);
  const sendReminder = useApp((s) => s.sendReminder);
  const acceptTrust = useApp((s) => s.acceptTrust);
  const actor = useApp((s) => s.session?.name ?? "admin");
  const admin = useApp((s) => s.session?.role === "admin");
  const [certId, setCertId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const deviceIds = new Set(devices.map((device) => device.id));
  const trunks = certs.filter((cert) => cert.kind === "identity" && deviceIds.has(cert.deviceId));
  const certIdSafe = trunks.some((cert) => cert.id === certId) ? certId : (trunks[0]?.id ?? "");
  const selected = trunks.find((cert) => cert.id === certIdSafe);
  const selectedDevice = devices.find((device) => device.id === selected?.deviceId);
  const visible = requests.filter((req) => deviceIds.has(req.deviceId));

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Panel title="CSR for a trunk" className="lg:col-span-2">
        {trunks.length === 0 ? (
          <p className="text-sm text-muted">This customer has no identity certificates to replace.</p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!admin || !certIdSafe) return;
              const message = createRequest(certIdSafe, notes, actor);
              setError(message);
            }}
          >
            <Field label="Trunk">
              <select className={inputClass} value={certIdSafe} onChange={(e) => setCertId(e.target.value)}>
                {trunks.map((cert) => {
                  const device = devices.find((item) => item.id === cert.deviceId);
                  return (
                    <option key={cert.id} value={cert.id}>
                      {device?.name} · {cert.name}
                    </option>
                  );
                })}
              </select>
            </Field>
            {selected ? (
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="text-xs text-muted">Subject</dt>
                  <dd className="font-mono">{selected.subject}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">SANs</dt>
                  <dd className="font-mono">{selected.sans.join(", ") || "none"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">TLS profiles</dt>
                  <dd>{selected.tlsProfiles.join(", ") || "none"}</dd>
                </div>
                {selectedDevice?.locked ? <p className="text-danger">This device is locked.</p> : null}
              </dl>
            ) : null}
            {selected?.issuance === "managed-acme" ? (
              <div className="space-y-2 text-sm">
                <p>This trunk is managed with Let's Encrypt over DNS-01. There is no customer CSR.</p>
                <p className="text-xs text-muted">A new intermediate under ISRG Root X1 installs with the leaf. A different root still waits for acceptance.</p>
                <Button
                  tone="primary"
                  type="button"
                  disabled={!admin || selectedDevice?.locked}
                  onClick={() => setError(renewManaged(selected.id, actor))}
                >
                  Renew now
                </Button>
              </div>
            ) : (
              <>
            <Field label="Note to the customer PKI admin">
              <textarea className={inputClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional. Included with the CSR." />
            </Field>
            <Button tone="primary" type="submit" disabled={!admin || !certIdSafe || selectedDevice?.locked}>
              Generate sample CSR
            </Button>
              </>
            )}
            {error ? <p className="text-sm text-danger">{error}</p> : null}
          </form>
        )}
      </Panel>

      <div className="space-y-3 lg:col-span-3">
        {visible.length === 0 ? <p className="text-sm text-muted">No CSR requests for this customer.</p> : null}
        {visible.map((req) => {
          const device = devices.find((d) => d.id === req.deviceId);
          const cert = certs.find((item) => item.id === req.certId);
          const link = `${window.location.origin}${window.location.pathname}#/upload/${req.token}`;
          return (
            <Panel
              key={req.id}
              className={req.id === focusRequestId ? "ring-2 ring-brass" : undefined}
              title={`${device?.name ?? "Device"} · ${req.certName}`}
              action={<Pill tone={req.status === "completed" ? "ok" : req.status === "cancelled" ? "muted" : "brass"}>{req.status.replaceAll("_", " ")}</Pill>}
            >
              <p className="text-sm">
                {cert?.subject ?? req.certName}
                {cert?.sans.length ? ` · SAN ${cert.sans.join(", ")}` : ""}
              </p>
              <p className="mt-1 text-sm text-muted">
                Link expires {formatDay(req.tokenExpires)}. {req.notes}
              </p>
              <p className="mt-2 text-sm">
                {(req.openCount ?? 0) === 0
                  ? "Customer has not opened this link."
                  : `Customer opened it ${req.openCount} time${req.openCount === 1 ? "" : "s"}. First ${formatWhen(req.firstOpenedAt ?? req.updatedAt)}, last ${formatWhen(req.lastOpenedAt ?? req.updatedAt)}.`}
              </p>
              {req.chainNote ? <p className="mt-2 text-sm">{req.chainNote}</p> : null}
              {(req.reminderCount ?? 0) > 0 && req.lastRemindedAt ? (
                <p className="text-xs text-muted">Last reminder {formatWhen(req.lastRemindedAt)} · {req.reminderCount} sent.</p>
              ) : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Customer email">
                  <input
                    className={inputClass}
                    value={req.customerEmail ?? ""}
                    disabled={!admin}
                    onChange={(e) => updateRequest(req.id, { customerEmail: e.target.value })}
                  />
                </Field>
                <Field label="Remind">
                  <select
                    className={inputClass}
                    value={req.remind ?? "us"}
                    disabled={!admin}
                    onChange={(e) => updateRequest(req.id, { remind: e.target.value as "us" | "customer" | "both" })}
                  >
                    <option value="us">Us only</option>
                    <option value="customer">Customer only</option>
                    <option value="both">Us and the customer</option>
                  </select>
                </Field>
              </div>
              <pre className="mt-3 max-h-28 overflow-auto rounded-md bg-bg p-3 font-mono text-xs text-muted">{req.csrPem}</pre>
              {req.signedPem ? (
                <p className="mt-2 text-xs text-ok">Signed certificate is on file ({req.signedPem.length} characters).</p>
              ) : null}
              {error && copied === req.id ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  tone="ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(req.csrPem);
                    setCopied(req.id);
                  }}
                >
                  Copy CSR
                </Button>
                <Button
                  disabled={!admin || !openStatuses.has(req.status)}
                  onClick={() => {
                    markSent(req.id, actor);
                    window.location.hash = `#/upload/${req.token}`;
                  }}
                >
                  Open guest link
                </Button>
                <Button
                  tone="ghost"
                  disabled={!admin || !cert}
                  onClick={async () => {
                    if (!cert) return;
                    const cn = cert.subject.match(/CN=([^,/]+)/i)?.[1]?.trim() ?? cert.subject;
                    const key = cert.requirements?.keyAlgorithm.startsWith("ECDSA") ? "ECDSA" : "RSA";
                    const sans = cert.sans.length ? cert.sans : [cert.requirements?.fqdn ?? cn].filter(Boolean);
                    const supplier = cert.requirements?.issuer || "DigiCert";
                    await navigator.clipboard.writeText(buildSampleChain({ cn, sans, key, supplier }));
                    setCopied(req.id);
                    setError(null);
                  }}
                >
                  Copy same-supplier chain
                </Button>
                <Button
                  tone="ghost"
                  disabled={!admin || !cert}
                  onClick={async () => {
                    if (!cert) return;
                    const cn = cert.subject.match(/CN=([^,/]+)/i)?.[1]?.trim() ?? cert.subject;
                    const key = cert.requirements?.keyAlgorithm.startsWith("ECDSA") ? "ECDSA" : "RSA";
                    const sans = cert.sans.length ? cert.sans : [cert.requirements?.fqdn ?? cn].filter(Boolean);
                    await navigator.clipboard.writeText(buildSampleChain({ cn, sans, key, supplier: "Sectigo" }));
                    setCopied(req.id);
                    setError(null);
                  }}
                >
                  Copy new-supplier chain
                </Button>
                <Button
                  tone="ghost"
                  disabled={!admin}
                  onClick={() => {
                    const message = sendReminder(req.id, actor);
                    setCopied(req.id);
                    setError(message);
                  }}
                >
                  Send reminder
                </Button>
                <Button tone="ghost" disabled={!admin} onClick={() => extendRequest(req.id, actor)}>
                  Extend 7 days
                </Button>
                <Button tone="ghost" disabled={!admin} onClick={() => reissueRequest(req.id, actor)}>
                  Reissue link
                </Button>
                <Button
                  disabled={!admin || req.status !== "chain_review"}
                  tone="primary"
                  onClick={() => {
                    const message = acceptTrust(req.id, actor);
                    setCopied(req.id);
                    setError(message);
                  }}
                >
                  Accept new root
                </Button>
                <Button
                  disabled={!admin || req.status !== "uploaded"}
                  tone="primary"
                  onClick={() => {
                    const message = applyRequest(req.id, actor);
                    setCopied(req.id);
                    setError(message);
                  }}
                >
                  Apply to SBCE
                </Button>
                <Button tone="danger" disabled={!admin || req.status === "cancelled" || req.status === "completed"} onClick={() => cancelRequest(req.id, actor)}>
                  Cancel
                </Button>
              </div>
              <p className="mt-2 break-all font-mono text-xs text-muted">{link}</p>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
