import { useState } from "react";
import { daysLeft, severityOf } from "@/lib/format";
import { devicesFor } from "@/lib/scope";
import { useApp } from "@/lib/store";
import type { AccessMethod, DeviceRole } from "@/lib/types";
import { Button, Field, inputClass, Panel, Pill } from "@/components/ui";
import { AccessTest } from "@/components/view-ops";

export function Inventory() {
  const customers = useApp((s) => s.customers);
  const sites = useApp((s) => s.sites);
  const devices = useApp((s) => s.devices);
  const certs = useApp((s) => s.certs);
  const customerId = useApp((s) => s.selectedCustomerId);
  const selectedId = useApp((s) => s.selectedDeviceId);
  const selectDevice = useApp((s) => s.selectDevice);
  const addCustomer = useApp((s) => s.addCustomer);
  const removeCustomer = useApp((s) => s.removeCustomer);
  const addSite = useApp((s) => s.addSite);
  const addDevice = useApp((s) => s.addDevice);
  const toggleLock = useApp((s) => s.toggleLock);
  const toggleMaintenance = useApp((s) => s.toggleMaintenance);
  const updateDevice = useApp((s) => s.updateDevice);
  const role = useApp((s) => s.session?.role);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<"customer" | "site" | "device" | null>(null);
  const [removing, setRemoving] = useState(false);
  const [confirmCode, setConfirmCode] = useState("");
  const [removeError, setRemoveError] = useState<string | null>(null);

  const customer = customers.find((item) => item.id === customerId) ?? null;
  const customerSites = sites.filter((site) => site.customerId === customerId);
  const customerDevices = devicesFor(sites, devices, customerId);
  const selected = customerDevices.find((d) => d.id === selectedId) ?? customerDevices[0] ?? null;
  const q = query.trim().toLowerCase();
  const visibleSites = customerSites.filter((site) => {
    if (!q) return true;
    return (
      site.name.toLowerCase().includes(q) ||
      site.location.toLowerCase().includes(q) ||
      customerDevices.some(
        (device) =>
          device.siteId === site.id &&
          (device.name.toLowerCase().includes(q) || device.endpoint.includes(q)),
      )
    );
  });

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <div className="space-y-4 xl:col-span-3">
        <div className="flex flex-wrap gap-2">
          <input className={cxInput} placeholder="Search site, device, or endpoint" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Button onClick={() => setOpen(open === "customer" ? null : "customer")} disabled={role !== "admin"}>
            Add customer
          </Button>
          {customer ? (
            <Button
              tone="danger"
              disabled={role !== "admin"}
              onClick={() => {
                setOpen(null);
                setConfirmCode("");
                setRemoveError(null);
                setRemoving((current) => !current);
              }}
            >
              Remove customer
            </Button>
          ) : null}
          <Button onClick={() => setOpen(open === "device" ? null : "device")} disabled={role !== "admin"}>
            Add device
          </Button>
        </div>
        {open === "customer" ? <CustomerForm onClose={() => setOpen(null)} onSave={addCustomer} /> : null}
        {removing && customer ? (
          <Panel title={`Remove ${customer.name}`}>
            <p className="mb-3 text-sm text-muted">
              This deletes {customer.name}, its sites, devices, certificates, and CSR requests. Type {customer.code} to confirm.
            </p>
            {removeError ? <p className="mb-3 text-sm text-danger">{removeError}</p> : null}
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (confirmCode.trim().toUpperCase() !== customer.code.toUpperCase()) {
                  setRemoveError(`Type ${customer.code} to confirm.`);
                  return;
                }
                const message = removeCustomer(customer.id);
                if (message) setRemoveError(message);
                else setRemoving(false);
              }}
            >
              <Field label="Customer code">
                <input className={inputClass} value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} />
              </Field>
              <Button tone="danger" type="submit">
                Delete {customer.name}
              </Button>
              <Button type="button" tone="ghost" onClick={() => setRemoving(false)}>
                Cancel
              </Button>
            </form>
          </Panel>
        ) : null}
        {open === "device" ? (
          <DeviceForm
            sites={customerSites}
            onClose={() => setOpen(null)}
            onSave={addDevice}
            onNeedSite={() => setOpen("site")}
          />
        ) : null}
        {open === "site" ? (
          <SiteForm customers={customer ? [customer] : []} onClose={() => setOpen("device")} onSave={addSite} />
        ) : null}

        <Panel
          title={customer?.name ?? "Customer"}
          action={<span className="font-mono text-xs text-muted">{customer?.code} · {customer?.timezone}</span>}
        >
          {visibleSites.length === 0 ? (
            <p className="text-sm text-muted">No sites for this customer yet.</p>
          ) : (
            <div className="space-y-4">
              {visibleSites.map((site) => (
                <div key={site.id}>
                  <p className="mb-2 text-xs text-muted">
                    {site.name} · {site.location}
                  </p>
                  <ul className="space-y-2">
                    {customerDevices
                      .filter((d) => d.siteId === site.id)
                      .filter((d) => !q || d.name.toLowerCase().includes(q) || d.endpoint.includes(q) || site.name.toLowerCase().includes(q))
                      .map((device) => {
                        const soonest = certs
                          .filter((c) => c.deviceId === device.id && c.kind === "identity")
                          .sort((a, b) => daysLeft(a.notAfter) - daysLeft(b.notAfter))[0];
                        return (
                          <li key={device.id}>
                            <button
                              onClick={() => selectDevice(device.id)}
                              className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-left ${
                                selected?.id === device.id ? "border-brass bg-raised" : "border-line hover:border-brass"
                              }`}
                            >
                              <span>
                                <span className="block text-sm">{device.name}</span>
                                <span className="font-mono text-xs text-muted">{device.endpoint}</span>
                              </span>
                              <span className="flex flex-wrap gap-1">
                                <Pill tone="muted">{device.role}</Pill>
                                {device.locked ? <Pill tone="warning">locked</Pill> : null}
                                {device.maintenance ? <Pill tone="brass">maint</Pill> : null}
                                {soonest ? (
                                  <Pill tone={severityOf(soonest.notAfter)}>{daysLeft(soonest.notAfter)}d</Pill>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title={selected ? selected.name : "Device"} className="xl:col-span-2">
        {selected ? (
          <DeviceDetail
            deviceId={selected.id}
            admin={role === "admin"}
            peers={customerDevices.filter((item) => item.id !== selected.id)}
            onLock={() => toggleLock(selected.id)}
            onMaint={() => toggleMaintenance(selected.id)}
            onSave={(patch, peerId) => updateDevice(selected.id, patch, peerId)}
          />
        ) : (
          <p className="text-sm text-muted">Select a device.</p>
        )}
      </Panel>
    </div>
  );
}

const cxInput = inputClass + " min-w-0 flex-1";

function DeviceDetail({
  deviceId,
  admin,
  peers,
  onLock,
  onMaint,
  onSave,
}: {
  deviceId: string;
  admin: boolean;
  peers: { id: string; name: string }[];
  onLock: () => void;
  onMaint: () => void;
  onSave: (
    patch: { name: string; endpoint: string; role: DeviceRole; apiUser: string; tags: string[] },
    peerId: string | null,
  ) => string | null;
}) {
  const device = useApp((s) => s.devices.find((d) => d.id === deviceId));
  const allCerts = useApp((s) => s.certs);
  const devices = useApp((s) => s.devices);
  const certs = allCerts.filter((c) => c.deviceId === deviceId);
  const peer = device?.haPairId
    ? devices.find((d) => d.haPairId === device.haPairId && d.id !== device.id)
    : undefined;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device?.name ?? "");
  const [endpoint, setEndpoint] = useState(device?.endpoint ?? "");
  const [role, setRole] = useState<DeviceRole>(device?.role ?? "standalone");
  const [apiUser, setApiUser] = useState(device?.apiUser ?? "");
  const [tags, setTags] = useState(device?.tags.join(", ") ?? "");
  const [peerId, setPeerId] = useState(peer?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  if (!device) return null;

  function beginEdit() {
    setName(device?.name ?? "");
    setEndpoint(device?.endpoint ?? "");
    setRole(device?.role ?? "standalone");
    setApiUser(device?.apiUser ?? "");
    setTags(device?.tags.join(", ") ?? "");
    setPeerId(peer?.id ?? "");
    setError(null);
    setEditing(true);
  }

  return (
    <div className="space-y-4 text-sm">
      {editing ? (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const message = onSave(
              {
                name,
                endpoint,
                role,
                apiUser,
                tags: tags.split(",").map((item) => item.trim()).filter(Boolean),
              },
              peerId || null,
            );
            if (message) setError(message);
            else setEditing(false);
          }}
        >
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Management address">
            <input className={inputClass} value={endpoint} onChange={(event) => setEndpoint(event.target.value)} required />
          </Field>
          <Field label="Role">
            <select className={inputClass} value={role} onChange={(event) => setRole(event.target.value as DeviceRole)}>
              <option value="standalone">standalone</option>
              <option value="ems">ems</option>
              <option value="ha-active">ha-active</option>
              <option value="ha-standby">ha-standby</option>
            </select>
          </Field>
          <Field label="API user">
            <input className={inputClass} value={apiUser} onChange={(event) => setApiUser(event.target.value)} />
          </Field>
          <Field label="HA peer">
            <select className={inputClass} value={peerId} onChange={(event) => setPeerId(event.target.value)}>
              <option value="">None</option>
              {peers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tags">
            <input className={inputClass} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="production, sip-trunk" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button tone="primary" type="submit" disabled={!admin}>
              Save device
            </Button>
            <Button type="button" tone="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-muted">Endpoint</dt>
            <dd className="font-mono">{device.endpoint}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Access</dt>
            <dd>{device.access}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">API user</dt>
            <dd className="font-mono">{admin ? device.apiUser : "hidden"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">HA peer</dt>
            <dd>{peer?.name ?? "—"}</dd>
          </div>
        </dl>
      )}
      {peer && !editing ? (
        <p className="text-sm">This HA pair is one configuration. {device.name} and {peer.name} always carry the same certificates.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={beginEdit} disabled={!admin || editing}>
          Edit
        </Button>
        <Button onClick={onLock} disabled={!admin}>
          {device.locked ? "Unlock" : "Lock"}
        </Button>
        <Button onClick={onMaint} disabled={!admin}>
          {device.maintenance ? "Leave maintenance" : "Maintenance mode"}
        </Button>
      </div>
      <AccessTest endpoint={device.endpoint} access={device.access} />
      <div>
        <p className="mb-2 text-xs text-muted">Certificates</p>
        <ul className="space-y-2">
          {certs.map((cert) => (
            <li key={cert.id} className="flex items-center justify-between gap-2">
              <span>
                {cert.name}
                <span className="ml-2 text-xs text-muted">{cert.tlsProfiles.join(", ") || "no TLS profile"}</span>
              </span>
              <Pill tone={cert.kind === "ca" ? "muted" : severityOf(cert.notAfter)}>
                {cert.kind === "ca" ? "CA" : `${daysLeft(cert.notAfter)}d`}
              </Pill>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted">Tags: {device.tags.join(", ") || "none"}</p>
    </div>
  );
}

function CustomerForm({
  onSave,
  onClose,
}: {
  onSave: (input: { name: string; code: string; locale: string; timezone: string }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  return (
    <Panel title="New customer">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSave({
            name: name.trim(),
            code: (code || name).trim().slice(0, 8).toUpperCase(),
            locale: "en-US",
            timezone: "America/Los_Angeles",
          });
          onClose();
        }}
      >
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Code">
          <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <div className="flex gap-2 sm:col-span-2">
          <Button tone="primary" type="submit">
            Save customer
          </Button>
          <Button type="button" tone="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function SiteForm({
  customers,
  onSave,
  onClose,
}: {
  customers: { id: string; name: string }[];
  onSave: (input: { customerId: string; name: string; location: string; timezone: string }) => void;
  onClose: () => void;
}) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  return (
    <Panel title="New site">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ customerId, name, location, timezone: "America/Los_Angeles" });
          onClose();
        }}
      >
        <Field label="Customer">
          <select className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Site name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Location">
          <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} required />
        </Field>
        <Button tone="primary" type="submit">
          Save site
        </Button>
      </form>
    </Panel>
  );
}

function DeviceForm({
  sites,
  onSave,
  onClose,
}: {
  sites: { id: string; name: string }[];
  onSave: (input: {
    siteId: string;
    name: string;
    endpoint: string;
    role: DeviceRole;
    haPairId: string | null;
    locked: boolean;
    maintenance: boolean;
    tags: string[];
    access: AccessMethod;
    apiUser: string;
  }) => void;
  onClose: () => void;
  onNeedSite: () => void;
}) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [role, setRole] = useState<DeviceRole>("standalone");
  const [access, setAccess] = useState<AccessMethod>("tunnel");
  return (
    <Panel title="New device">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            siteId,
            name,
            endpoint,
            role,
            haPairId: null,
            locked: false,
            maintenance: false,
            tags: ["new"],
            access,
            apiUser: "api-cert",
          });
          onClose();
        }}
      >
        <Field label="Site">
          <select className={inputClass} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Role">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as DeviceRole)}>
            <option value="standalone">standalone</option>
            <option value="ems">ems</option>
            <option value="ha-active">ha-active</option>
            <option value="ha-standby">ha-standby</option>
          </select>
        </Field>
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Management endpoint">
          <input className={inputClass} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} required placeholder="10.0.0.21" />
        </Field>
        <Field label="Reachability">
          <select className={inputClass} value={access} onChange={(e) => setAccess(e.target.value as AccessMethod)}>
            <option value="public">public</option>
            <option value="tunnel">outbound tunnel</option>
            <option value="customer-vpn">customer VPN</option>
            <option value="ssl-proxy">SSL proxy</option>
          </select>
        </Field>
        <div className="flex items-end">
          <Button tone="primary" type="submit">
            Save device
          </Button>
        </div>
      </form>
    </Panel>
  );
}
