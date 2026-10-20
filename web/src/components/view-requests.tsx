import { useState } from "react";
import { buildSampleChain } from "@/lib/cert-check";
import { formatDay, formatWhen } from "@/lib/format";
import { sendMail, smtpFromProfile } from "@/lib/mail";
import { devicesFor, isHaStandby } from "@/lib/scope";
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
  const profiles = useApp((s) => s.profiles);
  const acceptTrust = useApp((s) => s.acceptTrust);
  const actor = useApp((s) => s.session?.name ?? "admin");
  const admin = useApp((s) => s.session?.role === "admin");
  const [certId, setCertId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [mailNote, setMailNote] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const deviceIds = new Set(devices.map((device) => device.id));
  const trunks = certs.filter((cert) => {
    const device = allDevices.find((item) => item.id === cert.deviceId);
    return cert.kind === "identity" && deviceIds.has(cert.deviceId) && !isHaStandby(device);
  });
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
                {cert?.sans.length ? ` · ${cert.sans.join(", ")}` : ""}
              </p>
              <p className="mt-1 text-sm text-muted">
                {(req.openCount ?? 0) === 0
                  ? "Not opened yet."
                  : `Opened ${req.openCount} time${req.openCount === 1 ? "" : "s"}, last ${formatWhen(req.lastOpenedAt ?? req.updatedAt)}.`}
                {" "}Link good through {formatDay(req.tokenExpires)}.
              </p>
              {req.chainNote ? <p className="mt-2 text-sm">{req.chainNote}</p> : null}
              {req.notes ? <p className="mt-1 text-sm text-muted">{req.notes}</p> : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field label="Customer email">
                  <input
                    className={inputClass}
                    value={req.customerEmail ?? ""}
                    disabled={!admin}
                    onChange={(e) => updateRequest(req.id, { customerEmail: e.target.value })}
                  />
                </Field>
                <Field label="If they have not opened it, remind">
                  <select
                    className={inputClass}
                    value={req.remind ?? "us"}
                    disabled={!admin}
                    onChange={(e) => updateRequest(req.id, { remind: e.target.value as "us" | "customer" | "both" })}
                  >
                    <option value="us">Us</option>
                    <option value="customer">The customer</option>
                    <option value="both">Both</option>
                  </select>
                </Field>
              </div>
              {(req.reminderCount ?? 0) > 0 && req.lastRemindedAt ? (
                <p className="mt-1 text-xs text-muted">Last reminder {formatWhen(req.lastRemindedAt)}.</p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {req.status === "chain_review" ? (
                  <Button tone="primary" disabled={!admin} onClick={() => setError(acceptTrust(req.id, actor))}>
                    Accept new root
                  </Button>
                ) : null}
                {req.status === "uploaded" ? (
                  <Button tone="primary" disabled={!admin} onClick={() => setError(applyRequest(req.id, actor))}>
                    Install on the SBCE
                  </Button>
                ) : null}
                <Button
                  disabled={!admin}
                  onClick={async () => {
                    const remind = req.remind ?? "us";
                    const profile = profiles.find((item) => item.customerId === customerId);
                    const recipients: string[] = [];
                    if (remind === "us" || remind === "both") {
                      if (!profile?.emailTo.trim()) {
                        setMailNote({ id: req.id, ok: false, text: "Add the reporting email for this customer before reminding operators." });
                        return;
                      }
                      recipients.push(profile.emailTo.trim());
                    }
                    if (remind === "customer" || remind === "both") {
                      if (!req.customerEmail?.trim()) {
                        setMailNote({ id: req.id, ok: false, text: "Add the customer email before reminding them." });
                        return;
                      }
                      recipients.push(req.customerEmail.trim());
                    }
                    const failure = await sendMail({
                      to: recipients.join(", "),
                      subject: `Certificate reminder: ${req.certName}`,
                      text: `The upload link for ${req.certName} is still open.\nOpened ${req.openCount ?? 0} time(s).\n${link}`,
                      smtp: smtpFromProfile(profile),
                    });
                    if (failure) {
                      setMailNote({ id: req.id, ok: false, text: failure });
                      return;
                    }
                    const recorded = sendReminder(req.id, actor);
                    setMailNote({
                      id: req.id,
                      ok: !recorded,
                      text: recorded ?? `Sent to ${recipients.join(", ")}.`,
                    });
                  }}
                >
                  Send reminder
                </Button>
                {mailNote?.id === req.id ? (
                  <p className={mailNote.ok ? "w-full text-sm text-ok" : "w-full text-sm text-danger"}>{mailNote.text}</p>
                ) : null}
                <Button
                  tone="ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(link);
                    setCopied(req.id);
                  }}
                >
                  {copied === req.id ? "Link copied" : "Copy customer link"}
                </Button>
                <Button
                  tone="ghost"
                  disabled={!admin || !openStatuses.has(req.status)}
                  onClick={() => {
                    markSent(req.id, actor);
                    window.location.hash = `#/upload/${req.token}`;
                  }}
                >
                  Preview
                </Button>
              </div>
              {error && copied === req.id ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-muted">CSR and test files</summary>
                <pre className="mt-2 max-h-28 overflow-auto rounded-md bg-bg p-3 font-mono text-xs">{req.csrPem || "No CSR. This was a managed renewal."}</pre>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button tone="ghost" disabled={!req.csrPem} onClick={() => navigator.clipboard.writeText(req.csrPem)}>
                    Copy CSR
                  </Button>
                  <Button
                    tone="ghost"
                    disabled={!cert}
                    onClick={async () => {
                      if (!cert) return;
                      const cn = cert.subject.match(/CN=([^,/]+)/i)?.[1]?.trim() ?? cert.subject;
                      const key = cert.requirements?.keyAlgorithm.startsWith("ECDSA") ? "ECDSA" : "RSA";
                      const sans = cert.sans.length ? cert.sans : [cert.requirements?.fqdn ?? cn].filter(Boolean);
                      await navigator.clipboard.writeText(buildSampleChain({ cn, sans, key, supplier: cert.requirements?.issuer || "DigiCert" }));
                    }}
                  >
                    Copy matching chain
                  </Button>
                  <Button
                    tone="ghost"
                    disabled={!cert}
                    onClick={async () => {
                      if (!cert) return;
                      const cn = cert.subject.match(/CN=([^,/]+)/i)?.[1]?.trim() ?? cert.subject;
                      const key = cert.requirements?.keyAlgorithm.startsWith("ECDSA") ? "ECDSA" : "RSA";
                      const sans = cert.sans.length ? cert.sans : [cert.requirements?.fqdn ?? cn].filter(Boolean);
                      await navigator.clipboard.writeText(buildSampleChain({ cn, sans, key, supplier: "Sectigo" }));
                    }}
                  >
                    Copy chain from another CA
                  </Button>
                </div>
              </details>
              <div className="mt-3 flex gap-4 text-sm">
                <button type="button" className="text-muted disabled:opacity-40" disabled={!admin} onClick={() => extendRequest(req.id, actor)}>
                  Extend 7 days
                </button>
                <button type="button" className="text-muted disabled:opacity-40" disabled={!admin} onClick={() => reissueRequest(req.id, actor)}>
                  New link
                </button>
                <button
                  type="button"
                  className="text-danger disabled:opacity-40"
                  disabled={!admin || req.status === "cancelled" || req.status === "completed"}
                  onClick={() => cancelRequest(req.id, actor)}
                >
                  Cancel
                </button>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
