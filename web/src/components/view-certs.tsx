import { useEffect, useState } from "react";
import { daysLeft, formatDay, severityOf } from "@/lib/format";
import { devicesFor, haPeer, isHaStandby } from "@/lib/scope";
import { useApp } from "@/lib/store";
import type { Certificate } from "@/lib/types";
import { CertDetail } from "@/components/cert-detail";
import { Button, Modal, Pill } from "@/components/ui";
import { USE_LABEL } from "@/lib/cert-requirements";

export function Certificates() {
  const certs = useApp((s) => s.certs);
  const devices = useApp((s) => s.devices);
  const customers = useApp((s) => s.customers);
  const sites = useApp((s) => s.sites);
  const renew = useApp((s) => s.renewCert);
  const createRequest = useApp((s) => s.createRequest);
  const renewManaged = useApp((s) => s.renewManaged);
  const actor = useApp((s) => s.session?.name ?? "admin");
  const admin = useApp((s) => s.session?.role === "admin");
  const focusCertId = useApp((s) => s.focusCertId);
  const customerId = useApp((s) => s.selectedCustomerId);
  const [filter, setFilter] = useState<"all" | "critical" | "warning" | "auto">("all");
  const [plan, setPlan] = useState<{ cert: Certificate; dry: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (focusCertId) setFilter("all");
  }, [focusCertId]);

  const scoped = new Set(devicesFor(sites, devices, customerId).map((device) => device.id));

  const rows = certs
    .filter((c) => scoped.has(c.deviceId))
    .filter((c) => !isHaStandby(devices.find((device) => device.id === c.deviceId)))
    .filter((c) => (filter === "all" ? true : c.kind === "identity"))
    .filter((c) => {
      const tone = severityOf(c.notAfter);
      if (filter === "critical") return tone === "critical";
      if (filter === "warning") return tone !== "ok";
      if (filter === "auto") return c.autoRenew;
      return true;
    })
    .sort((a, b) => daysLeft(a.notAfter) - daysLeft(b.notAfter));

  const selectedId = rows.some((cert) => cert.id === picked)
    ? picked
    : rows.some((cert) => cert.id === focusCertId)
      ? focusCertId
      : (rows[0]?.id ?? null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["all", "critical", "warning", "auto"] as const).map((key) => (
          <Button key={key} tone={filter === key ? "primary" : "ghost"} onClick={() => setFilter(key)}>
            {key}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted">Select a certificate to read or change the requirements from the Teams and remote-worker notes.</p>
      <div className="grid items-start gap-4 xl:grid-cols-5">
      <div className="overflow-x-auto rounded-md border border-line xl:col-span-3">
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
              const peer = haPeer(devices, device);
              const peerSite = sites.find((s) => s.id === peer?.siteId);
              const place = peerSite && peerSite.id !== site?.id ? `${site?.name} / ${peerSite.name}` : site?.name;
              return (
                <tr
                  key={cert.id}
                  onClick={() => setPicked(cert.id)}
                  className={cert.id === selectedId ? "cursor-pointer border-t border-brass bg-raised" : "cursor-pointer border-t border-line"}
                >
                  <td className="px-3 py-3">
                    <div>{peer ? `${device?.name} + ${peer.name}` : device?.name}</div>
                    <div className="text-xs text-muted">
                      {customer?.name} · {place}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{cert.name}</div>
                    <div className="text-xs text-muted">
                      {cert.requirements ? USE_LABEL[cert.requirements.use] : "Unread"}
                      {" · "}
                      {cert.issuance === "managed-acme" ? "Let's Encrypt" : "Outside CA"}
                    </div>
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
                      <Button
                        tone="primary"
                        disabled={!admin || device?.locked || cert.kind !== "identity"}
                        onClick={(event) => {
                          event.stopPropagation();
                          const message = cert.issuance === "managed-acme" ? renewManaged(cert.id, actor) : createRequest(cert.id, "", actor);
                          setError(message);
                        }}
                      >
                        {cert.issuance === "managed-acme" ? "Renew" : "CSR"}
                      </Button>
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
      <div className="xl:col-span-2">{selectedId ? <CertDetail certId={selectedId} /> : null}</div>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {plan ? (
        <Modal title={plan.dry ? "Dry run" : "Apply certificate"} onClose={() => setPlan(null)}>
          <ol className="mb-4 list-decimal space-y-2 pl-4 text-sm">
            <li>Authenticate to {devices.find((d) => d.id === plan.cert.deviceId)?.name} and confirm it is unlocked.</li>
            <li>Write a pre-change snapshot of networks, TLS profiles, and SIP flows.</li>
            <li>Upload the replacement PEM for {plan.cert.name} and overwrite by name.</li>
            <li>Point {plan.cert.tlsProfiles.join(", ") || "profiles"} at the new certificate.</li>
            <li>Install on the active SBCE. The standby has the same certificate, so the same file is installed there after the health check.</li>
            <li>Re-read the certificate on both nodes and confirm the notAfter date matches.</li>
            <li>Write the post-change snapshot. Keep the previous one for restore.</li>
          </ol>
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
                  const message = renew(plan.cert.id, actor, true);
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
