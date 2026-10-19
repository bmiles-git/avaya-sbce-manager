import { useState } from "react";
import { formatDay } from "@/lib/format";
import { devicesFor } from "@/lib/scope";
import { useApp } from "@/lib/store";
import { Button, Field, inputClass, Panel, Pill } from "@/components/ui";

const openStatuses = new Set(["draft", "csr_generated", "sent", "awaiting_upload", "uploaded", "applied"]);

export function Requests() {
  const requests = useApp((s) => s.requests);
  const allDevices = useApp((s) => s.devices);
  const sites = useApp((s) => s.sites);
  const customerId = useApp((s) => s.selectedCustomerId);
  const devices = devicesFor(sites, allDevices, customerId);
  const createRequest = useApp((s) => s.createRequest);
  const markSent = useApp((s) => s.markSent);
  const extendRequest = useApp((s) => s.extendRequest);
  const reissueRequest = useApp((s) => s.reissueRequest);
  const cancelRequest = useApp((s) => s.cancelRequest);
  const applyRequest = useApp((s) => s.applyRequest);
  const actor = useApp((s) => s.session?.name ?? "admin");
  const admin = useApp((s) => s.session?.role === "admin");
  const [deviceId, setDeviceId] = useState(devices[0]?.id ?? "");
  const [certName, setCertName] = useState("trunk-public");
  const [notes, setNotes] = useState("Send to the customer PKI admin.");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const deviceIds = new Set(devices.map((device) => device.id));
  const deviceIdSafe = deviceIds.has(deviceId) ? deviceId : (devices[0]?.id ?? "");
  const visible = requests.filter((req) => deviceIds.has(req.deviceId));

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Panel title="New CSR request" className="lg:col-span-2">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!admin) return;
            createRequest(deviceIdSafe, certName.trim(), notes.trim(), actor);
          }}
        >
          <Field label="Device">
            <select className={inputClass} value={deviceIdSafe} onChange={(e) => setDeviceId(e.target.value)}>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Certificate name">
            <input className={inputClass} value={certName} onChange={(e) => setCertName(e.target.value)} required />
          </Field>
          <Field label="Note to customer">
            <textarea className={inputClass} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Button tone="primary" type="submit" disabled={!admin}>
            Generate CSR
          </Button>
        </form>
      </Panel>

      <div className="space-y-3 lg:col-span-3">
        {visible.length === 0 ? <p className="text-sm text-muted">No CSR requests for this customer.</p> : null}
        {visible.map((req) => {
          const device = devices.find((d) => d.id === req.deviceId);
          const link = `${window.location.origin}${window.location.pathname}#/upload/${req.token}`;
          return (
            <Panel
              key={req.id}
              title={req.certName}
              action={<Pill tone={req.status === "completed" ? "ok" : req.status === "cancelled" ? "muted" : "brass"}>{req.status.replaceAll("_", " ")}</Pill>}
            >
              <p className="text-sm">
                {device?.name} · link expires {formatDay(req.tokenExpires)}
              </p>
              <p className="mt-1 text-sm text-muted">{req.notes}</p>
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
                <Button tone="ghost" disabled={!admin} onClick={() => extendRequest(req.id, actor)}>
                  Extend 7 days
                </Button>
                <Button tone="ghost" disabled={!admin} onClick={() => reissueRequest(req.id, actor)}>
                  Reissue link
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
