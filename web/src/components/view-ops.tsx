import { useEffect, useState } from "react";
import { formatWhen } from "@/lib/format";
import { devicesFor } from "@/lib/scope";
import { useApp } from "@/lib/store";
import type { AccessConfig, AccessMethod, AuditEvent, AuditStep } from "@/lib/types";
import { Button, Field, inputClass, Panel, Pill } from "@/components/ui";

export function Snapshots() {
  const snapshots = useApp((s) => s.snapshots);
  const allDevices = useApp((s) => s.devices);
  const sites = useApp((s) => s.sites);
  const customerId = useApp((s) => s.selectedCustomerId);
  const devices = devicesFor(sites, allDevices, customerId);
  const deviceIds = new Set(devices.map((device) => device.id));
  const restore = useApp((s) => s.restoreSnapshot);
  const label = useApp((s) => s.labelSnapshot);
  const actor = useApp((s) => s.session?.name ?? "admin");
  const admin = useApp((s) => s.session?.role === "admin");
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel title="Snapshots" action={<span className="text-xs text-muted">Last captures stay restorable</span>}>
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      <ul className="divide-y divide-line">
        {snapshots.filter((snap) => deviceIds.has(snap.deviceId)).map((snap) => {
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

const emptyAccess: AccessConfig = {
  apiUser: "",
  vpnKind: "existing",
  vpnPeer: "",
  vpnNotes: "",
  tunnelAddress: "",
  tunnelPort: "51820",
  customerEndpoint: "",
  seid: "",
  bpLinkId: "",
  gatewayName: "",
  elementName: "",
  proxyHost: "",
  proxyPort: "443",
  sourceAddress: "",
  publicName: "",
  salChecked: false,
};

function asMethod(value: string): AccessMethod {
  return value === "lan" || value === "public" ? "lan" : "cloud";
}

export function AccessView() {
  const allDevices = useApp((s) => s.devices);
  const sites = useApp((s) => s.sites);
  const customers = useApp((s) => s.customers);
  const customerId = useApp((s) => s.selectedCustomerId);
  const devices = devicesFor(sites, allDevices, customerId);
  const setAccess = useApp((s) => s.setAccess);
  const setView = useApp((s) => s.setView);
  const admin = useApp((s) => s.session?.role === "admin");
  const customer = customers.find((item) => item.id === customerId) ?? null;
  const [picked, setPicked] = useState(devices[0]?.id ?? "");
  const device = devices.find((item) => item.id === picked) ?? devices[0];
  const [endpoint, setEndpoint] = useState(device?.endpoint ?? "");
  const [method, setMethod] = useState<AccessMethod>("lan");
  const [config, setConfig] = useState<AccessConfig>({ ...emptyAccess, ...device?.accessConfig, apiUser: device?.accessConfig?.apiUser || device?.apiUser || "" });

  useEffect(() => {
    if (!device) {
      setPicked("");
      return;
    }
    setPicked(device.id);
    setEndpoint(device.endpoint);
    setMethod(asMethod(device.access as string));
    setConfig({ ...emptyAccess, ...device.accessConfig, apiUser: device.accessConfig?.apiUser || device.apiUser || "" });
  }, [device]);

  function patch(next: Partial<AccessConfig>) {
    setConfig((current) => ({ ...current, ...next }));
  }

  function save(markChecked = false) {
    if (!device) return;
    const next = markChecked ? { ...config, salChecked: true } : config;
    if (markChecked) setConfig(next);
    setAccess(device.id, method, endpoint.trim(), next);
  }

  if (!device) {
    return (
      <Panel title="How this console reaches the controller">
        <p className="text-sm text-muted">
          {customer?.name ?? "This customer"} has no devices yet. Add one under Devices, then come back to set how this console reaches it.
        </p>
        <Button className="mt-3" onClick={() => setView("inventory")}>
          Go to devices
        </Button>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={`${customer?.name ?? "Customer"} · ${device.name}`}>
        <div className="space-y-3">
          <Field label="Device">
            <select
              className={inputClass}
              value={device.id}
              onChange={(e) => {
                const next = devices.find((item) => item.id === e.target.value);
                setPicked(e.target.value);
                if (!next) return;
                setEndpoint(next.endpoint);
                setMethod(asMethod(next.access as string));
                setConfig({ ...emptyAccess, ...next.accessConfig, apiUser: next.accessConfig?.apiUser || next.apiUser || "" });
              }}
            >
              {devices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="How we reach it">
            <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as AccessMethod)}>
              <option value="lan">Direct connect (LAN)</option>
              <option value="cloud">Cloud (SBCE reverse proxy)</option>
            </select>
          </Field>
          <Field label={method === "cloud" ? "Public name of the reverse proxy" : "Management address"}>
            <input className={inputClass} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder={method === "cloud" ? "sbce.customer.example" : "10.0.0.21"} />
          </Field>
          <Field label="API user">
            <input className={inputClass} value={config.apiUser} onChange={(e) => patch({ apiUser: e.target.value })} placeholder="api-cert" />
          </Field>
          <Field label={method === "cloud" ? "This container's public IP" : "This host's address on the LAN"}>
            <input className={inputClass} value={config.sourceAddress} onChange={(e) => patch({ sourceAddress: e.target.value })} placeholder={method === "cloud" ? "203.0.113.10/32" : "10.0.0.8/32"} />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button tone="primary" disabled={!admin} onClick={() => save(false)}>
              Save setup
            </Button>
          </div>
          <AccessTest endpoint={endpoint} access={method} />
        </div>
      </Panel>
      <Panel title="What has to be true">
        {method === "lan" ? (
          <ol className="list-decimal space-y-2 pl-4 text-sm text-muted">
            <li>This host and the SBCE share a network. The management address stays private.</li>
            <li>On the SBCE firewall, whitelist TCP port 443 from this host's address only. The source is an IP or CIDR, not a domain.</li>
            <li>Do not put the management interface on a public address.</li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-2 pl-4 text-sm text-muted">
            <li>Add a reverse proxy relay. Listen HTTPS on the public interface, on the name in the certificate. Connect HTTPS to the management address.</li>
            <li>Whitelist TCP port 443 from this container's public IP only. A domain cannot be the source.</li>
            <li>This console connects to that public name. Test access checks the TLS handshake.</li>
          </ol>
        )}
      </Panel>
    </div>
  );
}

export function AccessTest({ endpoint, access }: { endpoint: string; access: AccessMethod }) {
  const [lines, setLines] = useState<Array<{ at: string; level: string; message: string }>>([]);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setLines([{ at: new Date().toISOString(), level: "info", message: "Starting the test from this host." }]);
    try {
      const response = await fetch("/api/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint, access }),
      });
      const body = (await response.json()) as { lines?: Array<{ at: string; level: string; message: string }> };
      if (!response.ok || !body.lines) {
        setLines([
          { at: new Date().toISOString(), level: "fail", message: "The test service did not answer. Use port 8443 and rebuild the container." },
        ]);
      } else {
        setLines(body.lines);
      }
    } catch {
      setLines([
        {
          at: new Date().toISOString(),
          level: "fail",
          message: "Could not reach /api/probe. The test runs only on port 8443, from this host.",
        },
      ]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" disabled={running || !endpoint.trim()} onClick={run}>
        {running ? "Testing" : "Test access"}
      </Button>
      <pre className="max-h-64 overflow-auto rounded-md bg-slate p-3 font-mono text-xs leading-5 text-ink">
        {lines.length === 0
          ? "No test yet."
          : lines
              .map((item) => `${item.at.slice(11, 19)}  ${item.level.padEnd(4, " ")}  ${item.message}`)
              .join("\n")}
      </pre>
    </div>
  );
}

function stepsFor(event: AuditEvent): AuditStep[] {
  if (event.steps?.length) return event.steps;
  return [{ name: event.action, status: event.outcome ?? "done", detail: event.detail || "No further detail was recorded." }];
}

export function AuditView() {
  const audits = useApp((s) => s.audits);
  const customers = useApp((s) => s.customers);
  const sites = useApp((s) => s.sites);
  const devices = useApp((s) => s.devices);
  const customerId = useApp((s) => s.selectedCustomerId);
  const customer = customers.find((item) => item.id === customerId);
  const names = devicesFor(sites, devices, customerId).map((device) => device.name.toLowerCase());
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const needle = q.trim().toLowerCase();
  const rows = audits.filter((event) => {
    const blob = `${event.action} ${event.actor} ${event.target} ${event.detail} ${stepsFor(event).map((step) => `${step.name} ${step.detail}`).join(" ")}`.toLowerCase();
    const mine =
      (customer ? blob.includes(customer.name.toLowerCase()) : false) ||
      names.some((name) => name.length > 0 && blob.includes(name));
    if (!mine) return false;
    return !needle || blob.includes(needle);
  });
  return (
    <Panel title="Audit log" action={<input className={inputClass + " w-48"} placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />}>
      <p className="mb-2 text-sm text-muted">Click a process to see which steps finished and which failed.</p>
      <ul className="divide-y divide-line">
        {rows.length === 0 ? <li className="py-3 text-sm text-muted">No audit events for this customer.</li> : null}
        {rows.map((event) => {
          const open = openId === event.id;
          const steps = stepsFor(event);
          const failed = steps.filter((step) => step.status === "failed").length;
          const tone = event.outcome === "failed" || failed > 0 ? "critical" : "ok";
          return (
            <li key={event.id}>
              <button type="button" className="grid w-full gap-1 py-3 text-left sm:grid-cols-[9rem_7rem_1fr_auto]" onClick={() => setOpenId(open ? null : event.id)}>
                <span className="font-mono text-xs text-muted">{formatWhen(event.at)}</span>
                <span className="font-mono text-xs text-brass">{event.action}</span>
                <span className="text-sm">
                  {event.target}
                  <span className="mt-0.5 block text-xs text-muted">
                    {event.actor}
                    {event.detail ? ` · ${event.detail}` : ""}
                  </span>
                </span>
                <Pill tone={tone}>{failed > 0 ? `${failed} failed` : "Done"}</Pill>
              </button>
              {open ? (
                <ol className="mb-3 space-y-2 rounded-md bg-bg px-3 py-3">
                  {steps.map((step, index) => (
                    <li key={`${step.name}-${index}`} className="grid grid-cols-[5.5rem_1fr] gap-3 text-sm">
                      <Pill tone={step.status === "failed" ? "critical" : step.status === "skipped" ? "muted" : "ok"}>
                        {step.status === "failed" ? "Failed" : step.status === "skipped" ? "Skipped" : "Done"}
                      </Pill>
                      <span>
                        <span className="font-medium">{step.name}</span>
                        {step.detail ? <span className="mt-0.5 block text-muted">{step.detail}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
