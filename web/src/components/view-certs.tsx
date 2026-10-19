import { useEffect, useState } from "react";
import { daysLeft, formatDay, severityOf } from "@/lib/format";
import { devicesFor } from "@/lib/scope";
import { useApp } from "@/lib/store";
import type { Certificate } from "@/lib/types";
import { Button, Modal, Pill } from "@/components/ui";

export function Certificates() {
  const certs = useApp((s) => s.certs);
  const devices = useApp((s) => s.devices);
  const customers = useApp((s) => s.customers);
  const sites = useApp((s) => s.sites);
  const renew = useApp((s) => s.renewCert);
  const actor = useApp((s) => s.session?.name ?? "admin");
  const admin = useApp((s) => s.session?.role === "admin");
  const focusCertId = useApp((s) => s.focusCertId);
  const customerId = useApp((s) => s.selectedCustomerId);
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "auto">("all");
  const [plan, setPlan] = useState<{ cert: Certificate; dry: boolean } | null>(null);
  const [ha, setHa] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (focusCertId) setFilter("all");
  }, [focusCertId]);

  const scoped = new Set(devicesFor(sites, devices, customerId).map((device) => device.id));
  const focused = scoped.has(focusCertId ?? "") ? (certs.find((c) => c.id === focusCertId) ?? null) : null;

  const rows = certs
    .filter((c) => scoped.has(c.deviceId))
    .filter((c) => c.kind === "identity")
    .filter((c) => {
      const tone = severityOf(c.notAfter);
      if (filter === "critical") return tone === "critical";
      if (filter === "warning") return tone !== "ok";
      if (filter === "auto") return c.autoRenew;
      return true;
    })
    .sort((a, b) => daysLeft(a.notAfter) - daysLeft(b.notAfter));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["all", "critical", "warning", "auto"] as const).map((key) => (
          <Button key={key} tone={filter === key ? "primary" : "ghost"} onClick={() => setFilter(key)}>
            {key}
          </Button>
        ))}
      </div>
      {focused ? <CertEntity certId={focused.id} /> : null}
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-raised text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Device</th>
              <th className="px-3 py-2 font-medium">Certificate</th>
              <th className="px-3 py-2 font-medium">Expires</th>
              <th className="px-3 py-2 font-medium">TLS profiles</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cert) => {
              const device = devices.find((d) => d.id === cert.deviceId);
              const site = sites.find((s) => s.id === device?.siteId);
              const customer = customers.find((c) => c.id === site?.customerId);
              const tone = severityOf(cert.notAfter);
              return (
                <tr
                  key={cert.id}
                  className={cert.id === focusCertId ? "border-t border-brass bg-raised" : "border-t border-line"}
                >
                  <td className="px-3 py-3">
                    <div>{device?.name}</div>
                    <div className="text-xs text-muted">
                      {customer?.name} · {site?.name}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{cert.name}</div>
                    <div className="font-mono text-xs text-muted">{cert.subject}</div>
                  </td>
                  <td className="px-3 py-3">
                    <Pill tone={tone}>
                      {daysLeft(cert.notAfter)}d · {formatDay(cert.notAfter)}
                    </Pill>
                  </td>
                  <td className="px-3 py-3 text-xs text-muted">{cert.tlsProfiles.join(", ")}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button tone="ghost" onClick={() => { setError(null); setPlan({ cert, dry: true }); }}>
                        Dry run
                      </Button>
                      <Button
                        disabled={!admin}
                        onClick={() => {
                          setError(null);
                          setPlan({ cert, dry: false });
                        }}
                      >
                        Renew
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {plan ? (
        <Modal title={plan.dry ? "Dry run" : "Apply certificate"} onClose={() => setPlan(null)}>
          <ol className="mb-4 list-decimal space-y-2 pl-4 text-sm">
            <li>Authenticate to {devices.find((d) => d.id === plan.cert.deviceId)?.name} and confirm it is unlocked.</li>
            <li>Write a pre-change snapshot of networks, TLS profiles, and SIP flows.</li>
            <li>Upload the replacement PEM for {plan.cert.name} and overwrite by name.</li>
            <li>Point {plan.cert.tlsProfiles.join(", ") || "profiles"} at the new certificate.</li>
            <li>Re-read the certificate and confirm the notAfter date moved.</li>
            <li>Write the post-change snapshot. Keep the previous one for restore.</li>
          </ol>
          {devices.find((d) => d.id === plan.cert.deviceId)?.haPairId ? (
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={ha} onChange={(e) => setHa(e.target.checked)} />
              After a health check, repeat on the HA peer
            </label>
          ) : null}
          {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
          <div className="flex gap-2">
            {plan.dry ? (
              <Button tone="primary" onClick={() => setPlan(null)}>
                Close plan
              </Button>
            ) : (
              <Button
                tone="primary"
                onClick={() => {
                  const message = renew(plan.cert.id, actor, ha);
                  if (message) setError(message);
                  else setPlan(null);
                }}
              >
                Apply now
              </Button>
            )}
            <Button tone="ghost" onClick={() => setPlan(null)}>
              Cancel
            </Button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function CertEntity({ certId }: { certId: string }) {
  const cert = useApp((s) => s.certs.find((item) => item.id === certId));
  const device = useApp((s) => (cert ? s.devices.find((item) => item.id === cert.deviceId) : undefined));
  const site = useApp((s) => (device ? s.sites.find((item) => item.id === device.siteId) : undefined));
  const customer = useApp((s) => (site ? s.customers.find((item) => item.id === site.customerId) : undefined));
  const selectDevice = useApp((s) => s.selectDevice);
  if (!cert || !device) return null;
  return (
    <section className="rounded-md border border-brass bg-surface p-4">
      <p className="text-xs text-brass">
        {customer?.name} · {site?.name}
      </p>
      <h2 className="mt-1 text-lg font-medium">
        {device.name} / {cert.name}
      </h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Endpoint</dt>
          <dd className="font-mono">{device.endpoint}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Subject</dt>
          <dd className="font-mono">{cert.subject}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">TLS profiles</dt>
          <dd>{cert.tlsProfiles.join(", ") || "none"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">State</dt>
          <dd>
            {device.locked ? "locked" : "unlocked"}
            {device.maintenance ? " · maintenance" : ""} · {daysLeft(cert.notAfter)} days
          </dd>
        </div>
      </dl>
      <div className="mt-3">
        <Button tone="ghost" onClick={() => selectDevice(device.id)}>
          Open device
        </Button>
      </div>
    </section>
  );
}
