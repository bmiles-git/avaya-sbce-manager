import { useState } from "react";
import { formatWhen } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { AccessMethod } from "@/lib/types";
import { Button, Field, inputClass, Panel, Pill } from "@/components/ui";

export function Snapshots() {
  const snapshots = useApp((s) => s.snapshots);
  const devices = useApp((s) => s.devices);
  const restore = useApp((s) => s.restoreSnapshot);
  const label = useApp((s) => s.labelSnapshot);
  const actor = useApp((s) => s.session?.name ?? "admin");
  const admin = useApp((s) => s.session?.role === "admin");
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel title="Snapshots" action={<span className="text-xs text-muted">Last captures stay restorable</span>}>
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      <ul className="divide-y divide-line">
        {snapshots.map((snap) => {
          const device = devices.find((d) => d.id === snap.deviceId);
          return (
            <li key={snap.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm">
                  {device?.name} · {snap.label || snap.trigger}
                </p>
                <p className="text-xs text-muted">
                  {formatWhen(snap.createdAt)} · {snap.summary}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {snap.knownGood ? <Pill tone="ok">known good</Pill> : <Pill tone="muted">{snap.trigger}</Pill>}
                <Button tone="ghost" disabled={!admin} onClick={() => label(snap.id)}>
                  Mark known good
                </Button>
                <Button
                  disabled={!admin}
                  onClick={() => {
                    const message = restore(snap.id, actor);
                    setError(message);
                  }}
                >
                  Restore
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function AccessView() {
  const devices = useApp((s) => s.devices);
  const sites = useApp((s) => s.sites);
  const customers = useApp((s) => s.customers);
  const setAccess = useApp((s) => s.setAccess);
  const admin = useApp((s) => s.session?.role === "admin");
  const [picked, setPicked] = useState(devices[0]?.id ?? "");
  const device = devices.find((d) => d.id === picked);
  const [endpoint, setEndpoint] = useState(device?.endpoint ?? "");
  const [method, setMethod] = useState<AccessMethod>(device?.access ?? "tunnel");

  function download() {
    if (!device) return;
    const site = sites.find((s) => s.id === device.siteId);
    const customer = customers.find((c) => c.id === site?.customerId);
    const text = [
      "# SBCE Control outbound tunnel",
      `# Customer: ${customer?.name ?? "unknown"}`,
      `# Device: ${device.name}`,
      "",
      "[Interface]",
      "Address = 100.64.12.2/32",
      "DNS = 1.1.1.1",
      "",
      "[Peer]",
      "PublicKey = preview-only-not-a-real-key",
      "Endpoint = tunnel.sbce-control.example:51820",
      "AllowedIPs = " + (endpoint || device.endpoint) + "/32",
      "PersistentKeepalive = 25",
      "",
      "# Customer side initiates. No inbound port on the SBCE management network.",
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${device.name}-tunnel.conf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Customer reachability">
        <div className="space-y-3">
          <Field label="Device">
            <select
              className={inputClass}
              value={picked}
              onChange={(e) => {
                const next = devices.find((d) => d.id === e.target.value);
                setPicked(e.target.value);
                setEndpoint(next?.endpoint ?? "");
                setMethod(next?.access ?? "tunnel");
              }}
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Method">
            <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as AccessMethod)}>
              <option value="tunnel">Outbound tunnel</option>
              <option value="customer-vpn">Customer VPN</option>
              <option value="public">Public management</option>
            </select>
          </Field>
          <Field label="Reachable endpoint">
            <input className={inputClass} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              tone="primary"
              disabled={!admin || !device}
              onClick={() => device && setAccess(device.id, method, endpoint)}
            >
              Save endpoint
            </Button>
            <Button disabled={method !== "tunnel"} onClick={download}>
              Download tunnel config
            </Button>
          </div>
        </div>
      </Panel>
      <Panel title="What the customer does">
        <ol className="list-decimal space-y-2 pl-4 text-sm text-muted">
          <li>Install the tunnel config, or confirm their existing VPN route to the management address.</li>
          <li>The control plane stores that address and uses it for API calls, snapshots, and certificate writes.</li>
          <li>The temporary certificate upload page stays on the public console. Customers do not need the VPN to return a signed cert.</li>
        </ol>
      </Panel>
    </div>
  );
}

export function AuditView() {
  const audits = useApp((s) => s.audits);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = audits.filter((event) =>
    !needle
      ? true
      : `${event.action} ${event.actor} ${event.target} ${event.detail}`.toLowerCase().includes(needle),
  );
  return (
    <Panel title="Audit log" action={<input className={inputClass + " w-48"} placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />}>
      <ul className="divide-y divide-line">
        {rows.map((event) => (
          <li key={event.id} className="grid gap-1 py-3 sm:grid-cols-4">
            <span className="font-mono text-xs text-muted">{formatWhen(event.at)}</span>
            <span className="font-mono text-xs text-brass">{event.action}</span>
            <span className="text-sm">{event.target}</span>
            <span className="text-sm text-muted">
              {event.actor}
              {event.detail ? ` · ${event.detail}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
