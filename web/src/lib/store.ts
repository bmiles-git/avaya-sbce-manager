import { create } from "zustand";
import { persist } from "zustand/middleware";
import { hashPassword } from "@/lib/password";
import { defaultRequirements } from "@/lib/cert-requirements";
import { blankAcme, buildManagedChain, checkReplacement } from "@/lib/cert-check";
function sharedCert(source: Certificate) {
  return {
    subject: source.subject,
    sans: source.sans,
    notAfter: source.notAfter,
    tlsProfiles: source.tlsProfiles,
    autoRenew: source.autoRenew,
    kind: source.kind,
    issuance: source.issuance,
    requirements: source.requirements,
    acme: source.acme,
  };
}

function copyOntoPeer(certs: Certificate[], devices: Device[], source: Certificate): Certificate[] {
  const device = devices.find((item) => item.id === source.deviceId);
  if (!device?.haPairId) return certs;
  const peer = devices.find((item) => item.haPairId === device.haPairId && item.id !== device.id);
  if (!peer) return certs;
  const shared = sharedCert(source);
  const existing = certs.find((item) => item.deviceId === peer.id && item.name === source.name);
  if (!existing) return [...certs, { ...source, ...shared, id: `${source.id}_peer`, deviceId: peer.id }];
  return certs.map((item) => (item.id === existing.id ? { ...item, ...shared } : item));
}

function syncHaCerts(certs: Certificate[], devices: Device[]): Certificate[] {
  let next = certs.map((cert) => {
    if (cert.id === "cert_a1_pub" && /sbc-a1\.umcsn\.example/.test(cert.subject)) {
      return {
        ...cert,
        subject: "CN=sip.umcsn.example",
        sans: ["sip.umcsn.example"],
        requirements: { ...cert.requirements, fqdn: "sip.umcsn.example" },
      };
    }
    return cert;
  });
  for (const device of devices.filter((item) => item.role === "ha-active")) {
    for (const cert of next.filter((item) => item.deviceId === device.id)) {
      const current = next.find((item) => item.id === cert.id) ?? cert;
      next = copyOntoPeer(next, devices, current);
    }
  }
  return next;
}
import { fakeCsr, isoInDays, uid } from "@/lib/format";
import {
  seedAudits,
  seedCerts,
  seedCustomers,
  seedDevices,
  seedMessages,
  seedProfiles,
  seedRequests,
  seedSites,
  seedSnapshots,
  seedUsers,
  defaultTemplate,
} from "@/lib/seed";
import type {
  AcmeConfig,
  AuditEvent,
  AuditStep,
  AccessConfig,
  Certificate,
  CertRequest,
  CertRequirements,
  ChannelMessage,
  Customer,
  Device,
  LocalUser,
  ReportProfile,
  Session,
  Site,
  Snapshot,
  Toast,
  ViewId,
} from "@/lib/types";

interface DataSlice {
  customers: Customer[];
  sites: Site[];
  devices: Device[];
  certs: Certificate[];
  snapshots: Snapshot[];
  requests: CertRequest[];
  profiles: ReportProfile[];
  audits: AuditEvent[];
  users: LocalUser[];
  messages: ChannelMessage[];
  acks: string[];
}

interface AppState extends DataSlice {
  session: Session | null;
  view: ViewId;
  selectedCustomerId: string;
  selectedDeviceId: string | null;
  focusCertId: string | null;
  focusRequestId: string | null;
  toasts: Toast[];
  signInLocal: (username: string, password: string) => Promise<string | null>;
  signInEntra: (account: string) => string | null;
  signOut: () => void;
  createUser: (input: { username: string; name: string; password: string; role: LocalUser["role"]; customerIds: string[] }) => Promise<string | null>;
  setUserPassword: (id: string, password: string) => Promise<string | null>;
  updateUser: (id: string, patch: { role?: LocalUser["role"]; customerIds?: string[]; name?: string }) => string | null;
  removeUser: (id: string) => string | null;
  setView: (view: ViewId) => void;
  selectCustomer: (id: string) => void;
  selectDevice: (id: string | null) => void;
  openCert: (certId: string) => void;
  dismissToast: (id: string) => void;
  addCustomer: (input: Omit<Customer, "id">) => void;
  removeCustomer: (id: string) => string | null;
  addSite: (input: Omit<Site, "id">) => void;
  addDevice: (input: Omit<Device, "id">) => void;
  updateDevice: (
    id: string,
    patch: Partial<Pick<Device, "name" | "endpoint" | "role" | "apiUser" | "tags">>,
    peerId: string | null,
  ) => string | null;
  toggleLock: (id: string) => void;
  toggleMaintenance: (id: string) => void;
  setAccess: (id: string, access: Device["access"], endpoint: string, config: AccessConfig) => void;
  renewCert: (certId: string, actor: string, sequentialHa: boolean) => string | null;
  renewManaged: (certId: string, actor: string) => string | null;
  updateCert: (
    certId: string,
    patch: Partial<Pick<Certificate, "subject" | "sans" | "issuance">> & { requirements?: Partial<CertRequirements>; acme?: Partial<AcmeConfig> },
  ) => void;
  restoreSnapshot: (snapshotId: string, actor: string) => string | null;
  labelSnapshot: (snapshotId: string) => void;
  createRequest: (certId: string, notes: string, actor: string) => string | null;
  markSent: (id: string, actor: string) => void;
  extendRequest: (id: string, actor: string) => void;
  reissueRequest: (id: string, actor: string) => void;
  cancelRequest: (id: string, actor: string) => void;
  uploadSigned: (token: string, pem: string) => string | null;
  recordOpen: (token: string) => void;
  updateRequest: (id: string, patch: Partial<Pick<CertRequest, "customerEmail" | "remind">>) => void;
  sendReminder: (id: string, actor: string) => string | null;
  acceptTrust: (id: string, actor: string) => string | null;
  applyRequest: (id: string, actor: string) => string | null;
  updateProfile: (id: string, patch: Partial<ReportProfile>) => void;
  createProfile: (customerId: string) => void;
  sendTest: (profileId: string, actor: string) => void;
  ackAlert: (key: string) => void;
  resetDemo: () => void;
}

function data(): DataSlice {
  return {
    customers: seedCustomers,
    sites: seedSites,
    devices: seedDevices,
    certs: seedCerts,
    snapshots: seedSnapshots,
    requests: seedRequests,
    profiles: seedProfiles,
    audits: seedAudits,
    users: seedUsers,
    messages: seedMessages,
    acks: [],
  };
}

function audit(actor: string, action: string, target: string, detail: string, steps?: AuditStep[]): AuditEvent {
  const outcome = steps?.some((step) => step.status === "failed") ? "failed" : "done";
  return { id: uid("aud"), at: new Date().toISOString(), actor, action, target, detail, outcome: steps ? outcome : "done", steps };
}

function snapshotFor(device: Device, trigger: Snapshot["trigger"], summary: string, label = ""): Snapshot {
  return {
    id: uid("snap"),
    deviceId: device.id,
    label,
    trigger,
    createdAt: new Date().toISOString(),
    summary,
    knownGood: false,
  };
}

function toast(text: string, tone: Toast["tone"]): Toast {
  return { id: uid("tst"), text, tone };
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      ...data(),
      session: null,
      view: "overview",
      selectedCustomerId: "c_umcsn",
      selectedDeviceId: "d_a1",
      focusCertId: null,
      focusRequestId: null,
      toasts: [],

      signInLocal: async (username, password) => {
        const key = username.trim().toLowerCase();
        const account = get().users.find((item) => item.username === key);
        const passwordHash = await hashPassword(key, password);
        if (!account || passwordHash !== account.passwordHash) return "Unknown local account.";
        const allowed = account.customerIds.length ? account.customerIds : get().customers.map((item) => item.id);
        const selected = allowed.includes(get().selectedCustomerId) ? get().selectedCustomerId : allowed[0];
        set({
          session: {
            mode: "local",
            name: account.name,
            username: account.username,
            role: account.role,
            port: 8443,
            customerIds: account.customerIds,
          },
          selectedCustomerId: selected ?? get().selectedCustomerId,
          toasts: [toast(account.customerIds.length ? `Signed in for ${account.customerIds.length} customer(s).` : "Signed in on the local admin listener.", "ok")],
        });
        return null;
      },

      signInEntra: (account) => {
        const username = account.trim().toLowerCase();
        if (!username || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
          return "Enter the Entra ID email address for this person.";
        }
        const name = username
          .split("@")[0]
          .replace(/[._-]+/g, " ")
          .replace(/\b\w/g, (letter) => letter.toUpperCase());
        set({
          session: { mode: "entra", name, username, role: "admin", port: 443, customerIds: [] },
          toasts: [toast(`Signed in as ${username}.`, "ok")],
        });
        return null;
      },

      signOut: () => set({ session: null, view: "overview" }),

      createUser: async (input) => {
        if (get().session?.role !== "admin") return "Only an administrator can add a user.";
        const username = input.username.trim().toLowerCase();
        if (!/^[a-z][a-z0-9._-]{2,31}$/.test(username)) return "Use 3–32 characters: a letter, then letters, numbers, dots, or hyphens.";
        if (get().users.some((item) => item.username === username)) return "That username already exists.";
        if (input.password.length < 8) return "Use at least 8 characters.";
        if (input.role === "operator" && input.customerIds.length === 0) return "Assign an operator to at least one customer.";
        const row: LocalUser = {
          id: uid("user"),
          username,
          name: input.name.trim() || username,
          role: input.role,
          customerIds: input.role === "admin" && input.customerIds.length === 0 ? [] : input.customerIds,
          passwordHash: await hashPassword(username, input.password),
        };
        set({
          users: [...get().users, row],
          audits: [audit(get().session?.name ?? "admin", "user.create", username, row.customerIds.length ? row.customerIds.join(", ") : "all customers"), ...get().audits],
          toasts: [toast(`${username} can sign in on port 8443.`, "ok"), ...get().toasts],
        });
        return null;
      },

      setUserPassword: async (id, password) => {
        const actor = get().session;
        const account = get().users.find((item) => item.id === id);
        if (!actor || actor.role !== "admin") return "Only an administrator can set a password.";
        if (!account) return "User not found.";
        if (password.length < 8) return "Use at least 8 characters.";
        const passwordHash = await hashPassword(account.username, password);
        set({
          users: get().users.map((item) => (item.id === id ? { ...item, passwordHash } : item)),
          audits: [audit(actor.name, "user.password", account.username, "Password changed"), ...get().audits],
          toasts: [toast(`Password updated for ${account.username}.`, "ok"), ...get().toasts],
        });
        return null;
      },

      updateUser: (id, patch) => {
        const actor = get().session;
        const account = get().users.find((item) => item.id === id);
        if (!actor || actor.role !== "admin") return "Only an administrator can change a user.";
        if (!account) return "User not found.";
        const role = patch.role ?? account.role;
        const customerIds = patch.customerIds ?? account.customerIds;
        if (role === "operator" && customerIds.length === 0) return "Assign an operator to at least one customer.";
        if (account.role === "admin" && role !== "admin" && get().users.filter((item) => item.role === "admin").length < 2) {
          return "Keep at least one administrator.";
        }
        set({
          users: get().users.map((item) =>
            item.id === id ? { ...item, role, customerIds, name: patch.name?.trim() || item.name } : item,
          ),
          audits: [audit(actor.name, "user.update", account.username, customerIds.length ? customerIds.join(", ") : "all customers"), ...get().audits],
        });
        return null;
      },

      removeUser: (id) => {
        const actor = get().session;
        const account = get().users.find((item) => item.id === id);
        if (!actor || actor.role !== "admin") return "Only an administrator can remove a user.";
        if (!account) return "User not found.";
        if (account.username === actor.username) return "You cannot remove the account you are signed in as.";
        if (account.role === "admin" && get().users.filter((item) => item.role === "admin").length < 2) return "Keep at least one administrator.";
        set({
          users: get().users.filter((item) => item.id !== id),
          audits: [audit(actor.name, "user.remove", account.username, ""), ...get().audits],
          toasts: [toast(`${account.username} removed.`, "ok"), ...get().toasts],
        });
        return null;
      },
      setView: (view) => set({ view }),
      selectCustomer: (id) => {
        const scope = get().session?.customerIds ?? [];
        if (scope.length > 0 && !scope.includes(id)) return;
        const siteIds = new Set(get().sites.filter((site) => site.customerId === id).map((site) => site.id));
        const devices = get().devices.filter((device) => siteIds.has(device.siteId));
        const current = get().selectedDeviceId;
        set({
          selectedCustomerId: id,
          selectedDeviceId: devices.some((device) => device.id === current) ? current : (devices[0]?.id ?? null),
          focusCertId: null,
          focusRequestId: null,
        });
      },
      selectDevice: (id) => {
        const device = get().devices.find((item) => item.id === id);
        const site = get().sites.find((item) => item.id === device?.siteId);
        set({
          selectedDeviceId: id,
          selectedCustomerId: site?.customerId ?? get().selectedCustomerId,
          view: "inventory",
        });
      },
      openCert: (certId) => {
        const cert = get().certs.find((item) => item.id === certId);
        const device = get().devices.find((item) => item.id === cert?.deviceId);
        const site = get().sites.find((item) => item.id === device?.siteId);
        set({
          focusCertId: certId,
          selectedDeviceId: cert?.deviceId ?? get().selectedDeviceId,
          selectedCustomerId: site?.customerId ?? get().selectedCustomerId,
          view: "certificates",
        });
      },
      dismissToast: (id) => set({ toasts: get().toasts.filter((item) => item.id !== id) }),

      addCustomer: (input) => {
        const row: Customer = { ...input, id: uid("c") };
        const actor = get().session?.name ?? "admin";
        const profile: ReportProfile = {
          id: uid("rp"),
          customerId: row.id,
          name: `${row.name} alerts`,
          warnDays: 30,
          criticalDays: 7,
          teamsChannel: "",
          emailTo: "",
          quietHours: true,
          template: defaultTemplate,
        };
        set({
          customers: [...get().customers, row],
          profiles: [...get().profiles, profile],
          selectedCustomerId: row.id,
          selectedDeviceId: null,
          audits: [audit(actor, "customer.create", row.name, `Code ${row.code}`), ...get().audits],
          toasts: [toast(`Customer ${row.name} added.`, "ok"), ...get().toasts],
        });
      },

      removeCustomer: (id) => {
        const customer = get().customers.find((item) => item.id === id);
        if (!customer) return "That customer is not in the list.";
        const siteIds = new Set(get().sites.filter((site) => site.customerId === id).map((site) => site.id));
        const deviceIds = new Set(get().devices.filter((device) => siteIds.has(device.siteId)).map((device) => device.id));
        const remaining = get().customers.filter((item) => item.id !== id);
        const actor = get().session?.name ?? "admin";
        set({
          customers: remaining,
          sites: get().sites.filter((site) => site.customerId !== id),
          devices: get().devices.filter((device) => !deviceIds.has(device.id)),
          certs: get().certs.filter((cert) => !deviceIds.has(cert.deviceId)),
          snapshots: get().snapshots.filter((snap) => !deviceIds.has(snap.deviceId)),
          requests: get().requests.filter((request) => !deviceIds.has(request.deviceId)),
          profiles: get().profiles.filter((profile) => profile.customerId !== id),
          users: get().users.map((user) => ({
            ...user,
            customerIds: user.customerIds.filter((customerId) => customerId !== id),
          })),
          selectedCustomerId: get().selectedCustomerId === id ? (remaining[0]?.id ?? "") : get().selectedCustomerId,
          selectedDeviceId: deviceIds.has(get().selectedDeviceId ?? "") ? null : get().selectedDeviceId,
          audits: [
            audit(actor, "customer.remove", customer.name, "Removed the customer, its sites, devices, and certificates."),
            ...get().audits,
          ],
          toasts: [toast(`${customer.name} removed.`, "ok"), ...get().toasts],
        });
        return null;
      },

      addSite: (input) => {
        const row: Site = { ...input, id: uid("s") };
        set({
          sites: [...get().sites, row],
          audits: [audit(get().session?.name ?? "admin", "site.create", row.name, row.location), ...get().audits],
        });
      },

      addDevice: (input) => {
        const row: Device = { ...input, id: uid("d") };
        set({
          devices: [...get().devices, row],
          selectedDeviceId: row.id,
          audits: [
            audit(get().session?.name ?? "admin", "device.create", row.name, row.endpoint),
            ...get().audits,
          ],
          toasts: [toast(`${row.name} is ready for an API connection test.`, "ok"), ...get().toasts],
        });
      },

      updateDevice: (id, patch, peerId) => {
        const device = get().devices.find((item) => item.id === id);
        if (!device) return "That device is not in the list.";
        const name = patch.name?.trim() || device.name;
        const endpoint = patch.endpoint?.trim() || device.endpoint;
        if (!name || !endpoint) return "Name and management address are required.";
        const peer = peerId ? get().devices.find((item) => item.id === peerId) : undefined;
        if (peerId && (!peer || peer.id === id)) return "Pick a different device as the HA peer.";
        const pair = peer ? device.haPairId || peer.haPairId || `ha_${id}` : null;
        let devices = get().devices.map((item) => (item.id === id ? { ...item, ...patch, name, endpoint, haPairId: pair } : item));
        if (peer && pair) {
          devices = devices.map((item) => (item.id === peer.id ? { ...item, haPairId: pair } : item));
        }
        if (!peer && device.haPairId) {
          const still = devices.filter((item) => item.haPairId === device.haPairId && item.id !== id);
          if (still.length === 1) {
            devices = devices.map((item) => (item.id === still[0].id ? { ...item, haPairId: null } : item));
          }
        }
        set({
          devices,
          audits: [audit(get().session?.name ?? "admin", "device.update", name, endpoint), ...get().audits],
          toasts: [toast(`${name} saved.`, "ok"), ...get().toasts],
        });
        return null;
      },

      toggleLock: (id) => {
        const device = get().devices.find((item) => item.id === id);
        if (!device) return;
        const locked = !device.locked;
        set({
          devices: get().devices.map((item) => (item.id === id ? { ...item, locked } : item)),
          audits: [
            audit(get().session?.name ?? "admin", locked ? "device.lock" : "device.unlock", device.name, ""),
            ...get().audits,
          ],
        });
      },

      toggleMaintenance: (id) => {
        set({
          devices: get().devices.map((item) =>
            item.id === id ? { ...item, maintenance: !item.maintenance } : item,
          ),
        });
      },

      setAccess: (id, access, endpoint, config) => {
        const device = get().devices.find((item) => item.id === id);
        if (!device) return;
        set({
          devices: get().devices.map((item) =>
            item.id === id ? { ...item, access, endpoint, accessConfig: config, apiUser: config.apiUser || item.apiUser } : item,
          ),
          audits: [
            audit(get().session?.name ?? "admin", "access.update", device.name, `${access} → ${endpoint}`),
            ...get().audits,
          ],
          toasts: [toast(`Reachability for ${device.name} saved.`, "ok"), ...get().toasts],
        });
      },

      renewCert: (certId, actor, sequentialHa) => {
        const cert = get().certs.find((item) => item.id === certId);
        const device = cert && get().devices.find((item) => item.id === cert.deviceId);
        if (!cert || !device) return "Certificate not found.";
        if (device.locked) {
          set({
            audits: [
              audit(actor, "cert.renew", `${device.name} / ${cert.name}`, `${device.name} is locked.`, [
                { name: "Confirm unlocked", status: "failed", detail: `${device.name} is locked.` },
              ]),
              ...get().audits,
            ],
          });
          return `${device.name} is locked.`;
        }
        if (device.maintenance) {
          set({
            audits: [
              audit(actor, "cert.renew", `${device.name} / ${cert.name}`, `${device.name} is in maintenance mode.`, [
                { name: "Confirm not in maintenance", status: "failed", detail: `${device.name} is in maintenance mode.` },
              ]),
              ...get().audits,
            ],
          });
          return `${device.name} is in maintenance mode.`;
        }
        const pre = snapshotFor(device, "pre-change", `Before replacing ${cert.name}`);
        const nextExpiry = isoInDays(90);
        const peer = device.haPairId
          ? get().devices.find((item) => item.haPairId === device.haPairId && item.id !== device.id)
          : undefined;
        const updated = syncHaCerts(
          get().certs.map((item) => (item.id === certId ? { ...item, notAfter: nextExpiry } : item)),
          get().devices,
        );
        const extra: Snapshot[] = [pre, snapshotFor(device, "post-change", `Installed ${cert.name}, expires in 90 days`)];
        const events = [
          audit(actor, "cert.renew", `${device.name} / ${cert.name}`, "Identity installed and TLS profiles updated.", [
            { name: "Authenticate", status: "done", detail: `Signed in to ${device.name}.` },
            { name: "Pre-change snapshot", status: "done", detail: pre.summary },
            { name: "Upload identity", status: "done", detail: `${cert.name} overwritten by name.` },
            { name: "Point TLS profiles", status: "done", detail: cert.tlsProfiles.join(", ") || "No TLS profile on this certificate." },
            { name: "Re-read certificate", status: "done", detail: "notAfter moved out 90 days." },
            peer
              ? peer.locked || peer.maintenance
                ? { name: `Standby ${peer.name}`, status: "failed" as const, detail: peer.locked ? `${peer.name} is locked.` : `${peer.name} is in maintenance.` }
                : { name: `Standby ${peer.name}`, status: "done" as const, detail: "Same certificate installed after the health check." }
              : { name: "Standby", status: "skipped" as const, detail: "This SBCE is not part of an HA pair." },
          ]),
        ];
        if (peer && !peer.locked && !peer.maintenance) {
          extra.push(snapshotFor(peer, "post-change", `Standby ${peer.name} updated with the same ${cert.name}`));
        }
        set({
          certs: updated,
          snapshots: [...extra, ...get().snapshots],
          audits: [...events, ...get().audits],
          toasts: [toast(`${cert.name} renewed for 90 days on ${device.name}${peer ? ` and ${peer.name}` : ""}.`, "ok"), ...get().toasts],
        });
        return null;
      },

      renewManaged: (certId, actor) => {
        const cert = get().certs.find((item) => item.id === certId);
        const device = cert && get().devices.find((item) => item.id === cert.deviceId);
        if (!cert || !device) return "Certificate not found.";
        if (cert.kind !== "identity") return "Only an identity certificate is issued this way.";
        if (cert.issuance !== "managed-acme") return "This trunk uses the customer CA. Generate a CSR instead.";
        if (device.locked) return `${device.name} is locked.`;
        if (device.maintenance) return `${device.name} is in maintenance mode.`;
        if (!cert.requirements?.fqdn) return "Set the public FQDN before a DNS-01 renewal.";
        const pem = buildManagedChain(cert);
        const result = checkReplacement(pem, cert);
        if (!result.ok) {
          const steps = result.checks.map((item) => ({ name: item.ok ? "Check passed" : "Check failed", status: item.ok ? "done" as const : "failed" as const, detail: item.text }));
          set({
            audits: [audit(actor, "acme.issue", `${device.name} / ${cert.name}`, "DNS-01 renewal did not match this trunk.", steps), ...get().audits],
          });
          return result.checks.filter((item) => !item.ok).map((item) => item.text).join(" ");
        }
        const row: CertRequest = {
          id: uid("req"),
          deviceId: device.id,
          certId: cert.id,
          certName: cert.name,
          status: result.trustChange ? "chain_review" : "uploaded",
          csrPem: "",
          signedPem: pem,
          token: uid("upl"),
          tokenExpires: isoInDays(7),
          notes: "Let's Encrypt DNS-01 renewal. HTTP-01 is not used.",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          openCount: 0,
          firstOpenedAt: null,
          lastOpenedAt: null,
          customerEmail: "",
          remind: "us",
          lastRemindedAt: null,
          reminderCount: 0,
          chainNote: result.chainNote,
        };
        set({
          requests: [row, ...get().requests],
          audits: [
            audit(actor, "acme.issue", `${device.name} / ${cert.name}`, result.chainNote, [
              { name: "DNS-01 order", status: "done", detail: `Challenge name _acme-challenge.${cert.requirements.fqdn}.` },
              { name: "Issued leaf and intermediate", status: "done", detail: result.chainNote },
              {
                name: "Trust decision",
                status: "done",
                detail: result.trustChange ? "New root is held until an operator accepts it." : "Root is already trusted for this trunk.",
              },
            ]),
            ...get().audits,
          ],
        });
        if (result.trustChange) return "The root is not a known Let's Encrypt root. It is held until you accept it.";
        return get().applyRequest(row.id, actor);
      },

      updateCert: (certId, patch) => {
        const devices = get().devices;
        const certs = get().certs.map((item) => {
          if (item.id !== certId) return item;
          return {
            ...item,
            subject: patch.subject ?? item.subject,
            sans: patch.sans ?? item.sans,
            issuance: patch.issuance ?? item.issuance ?? "customer-ca",
            acme: { ...(item.acme ?? blankAcme(item.id)), ...patch.acme },
            requirements: { ...(item.requirements ?? defaultRequirements(item)), ...patch.requirements },
          };
        });
        set({ certs: syncHaCerts(certs, devices) });
      },

      restoreSnapshot: (snapshotId, actor) => {
        const snap = get().snapshots.find((item) => item.id === snapshotId);
        const device = snap && get().devices.find((item) => item.id === snap.deviceId);
        if (!snap || !device) return "Snapshot not found.";
        if (device.locked) return `${device.name} is locked.`;
        set({
          audits: [audit(actor, "snapshot.restore", device.name, snap.label || snap.trigger), ...get().audits],
          toasts: [toast(`Restored ${snap.label || snap.trigger} onto ${device.name}.`, "ok"), ...get().toasts],
        });
        return null;
      },

      labelSnapshot: (snapshotId) => {
        set({
          snapshots: get().snapshots.map((item) =>
            item.id === snapshotId ? { ...item, knownGood: true, label: item.label || "known good" } : item,
          ),
        });
      },

      createRequest: (certId, notes, actor) => {
        const cert = get().certs.find((item) => item.id === certId);
        const device = cert && get().devices.find((item) => item.id === cert.deviceId);
        const site = device && get().sites.find((item) => item.id === device.siteId);
        if (!cert || !device) return "That trunk is not in the inventory.";
        if (cert.issuance === "managed-acme") return "This trunk is renewed by Let's Encrypt. Use Renew now on the certificate.";
        if (device.locked) return `${device.name} is locked. Unlock it before generating a CSR.`;
        const row: CertRequest = {
          id: uid("req"),
          deviceId: device.id,
          certId: cert.id,
          certName: cert.name,
          status: "csr_generated",
          csrPem: fakeCsr({
            name: cert.name,
            subject: cert.subject,
            sans: cert.sans,
            device: device.name,
            profiles: cert.tlsProfiles,
            keyAlgorithm: cert.requirements?.keyAlgorithm,
            use: cert.requirements?.use,
          }),
          signedPem: "",
          token: uid("upl"),
          tokenExpires: isoInDays(7),
          notes: notes.trim() || `Replacement for ${cert.name} (${cert.subject}).`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          openCount: 0,
          firstOpenedAt: null,
          lastOpenedAt: null,
          customerEmail: "",
          remind: "us",
          lastRemindedAt: null,
          reminderCount: 0,
          chainNote: "",
        };
        set({
          requests: [row, ...get().requests],
          view: "requests",
          focusRequestId: row.id,
          selectedDeviceId: device.id,
          selectedCustomerId: site?.customerId ?? get().selectedCustomerId,
          audits: [
            audit(actor, "request.create", `${device.name} / ${cert.name}`, cert.subject),
            ...get().audits,
          ],
          toasts: [toast(`Sample CSR ready for ${device.name} / ${cert.name}.`, "ok"), ...get().toasts],
        });
        return null;
      },

      markSent: (id, actor) => {
        set({
          requests: get().requests.map((item) =>
            item.id === id ? { ...item, status: "awaiting_upload", updatedAt: new Date().toISOString() } : item,
          ),
          audits: [audit(actor, "request.sent", id, "Customer notified"), ...get().audits],
        });
      },

      extendRequest: (id, actor) => {
        set({
          requests: get().requests.map((item) =>
            item.id === id
              ? { ...item, tokenExpires: isoInDays(7), status: item.status === "expired" ? "awaiting_upload" : item.status, updatedAt: new Date().toISOString() }
              : item,
          ),
          audits: [audit(actor, "request.extend", id, "Temporary login extended 7 days"), ...get().audits],
          toasts: [toast("Temporary upload window extended by 7 days.", "ok"), ...get().toasts],
        });
      },

      reissueRequest: (id, actor) => {
        const token = uid("upl");
        set({
          requests: get().requests.map((item) =>
            item.id === id
              ? {
                  ...item,
                  token,
                  tokenExpires: isoInDays(7),
                  status: "awaiting_upload",
                  updatedAt: new Date().toISOString(),
                  openCount: 0,
                  firstOpenedAt: null,
                  lastOpenedAt: null,
                }
              : item,
          ),
          audits: [audit(actor, "request.reissue", id, "Previous link revoked"), ...get().audits],
          toasts: [toast("New upload link issued. The previous token no longer works.", "ok"), ...get().toasts],
        });
      },

      cancelRequest: (id, actor) => {
        set({
          requests: get().requests.map((item) =>
            item.id === id ? { ...item, status: "cancelled", updatedAt: new Date().toISOString() } : item,
          ),
          audits: [audit(actor, "request.cancel", id, ""), ...get().audits],
        });
      },

      uploadSigned: (token, pem) => {
        const row = get().requests.find((item) => item.token === token);
        if (!row) return "This upload link is not valid.";
        if (row.status === "cancelled") return "This request was cancelled.";
        if (new Date(row.tokenExpires).getTime() < Date.now()) return "This upload link has expired.";
        const cert =
          get().certs.find((item) => item.id === row.certId) ??
          get().certs.find((item) => item.deviceId === row.deviceId && item.name === row.certName);
        if (!cert) return "The trunk this link replaces is no longer in inventory.";
        const result = checkReplacement(pem, cert);
        if (!result.ok) {
          set({
            audits: [
              audit(
                "customer-upload",
                "request.upload",
                `${row.certName}`,
                "Returned certificate was rejected.",
                result.checks.map((item) => ({ name: item.ok ? "Check passed" : "Check failed", status: item.ok ? "done" as const : "failed" as const, detail: item.text })),
              ),
              ...get().audits,
            ],
          });
          return result.checks.filter((item) => !item.ok).map((item) => item.text).join(" ");
        }
        set({
          requests: get().requests.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  signedPem: pem,
                  status: result.trustChange ? "chain_review" : "uploaded",
                  chainNote: result.chainNote,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
          audits: [
            audit("customer-upload", result.trustChange ? "request.trust-change" : "request.upload", row.certName, result.chainNote, [
              ...result.checks.filter((item) => item.ok).map((item) => ({ name: "Check passed", status: "done" as const, detail: item.text })),
              {
                name: "Trust decision",
                status: "done",
                detail: result.trustChange ? "New root held for acceptance." : "Supplier already trusted.",
              },
            ]),
            ...get().audits,
          ],
        });
        return null;
      },

      recordOpen: (token) => {
        const row = get().requests.find((item) => item.token === token);
        if (!row || row.status === "cancelled") return;
        const now = Date.now();
        if (row.lastOpenedAt && now - new Date(row.lastOpenedAt).getTime() < 5000) return;
        const at = new Date().toISOString();
        set({
          requests: get().requests.map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  openCount: (item.openCount ?? 0) + 1,
                  firstOpenedAt: item.firstOpenedAt ?? at,
                  lastOpenedAt: at,
                }
              : item,
          ),
          audits: [audit("customer", "request.open", `${row.certName}`, "Customer opened the upload link"), ...get().audits],
        });
      },

      updateRequest: (id, patch) => {
        set({
          requests: get().requests.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)),
        });
      },

      sendReminder: (id, actor) => {
        const row = get().requests.find((item) => item.id === id);
        if (!row) return "Request not found.";
        const remind = row.remind ?? "us";
        if ((remind === "customer" || remind === "both") && !row.customerEmail?.trim()) {
          return "Add the customer email before reminding them.";
        }
        const seen = (row.openCount ?? 0) > 0;
        const who = remind === "us" ? "operators" : remind === "customer" ? row.customerEmail : `operators and ${row.customerEmail}`;
        const detail = seen
          ? `Customer opened the link ${row.openCount} time(s). Last ${row.lastOpenedAt}.`
          : "Customer has not opened the link.";
        set({
          requests: get().requests.map((item) =>
            item.id === id
              ? { ...item, reminderCount: (item.reminderCount ?? 0) + 1, lastRemindedAt: new Date().toISOString() }
              : item,
          ),
          audits: [audit(actor, "request.remind", row.certName, `${who}. ${detail}`), ...get().audits],
          toasts: [toast(`Reminder sent to ${who}. ${detail}`, seen ? "ok" : "warn"), ...get().toasts],
        });
        return null;
      },

      acceptTrust: (id, actor) => {
        const row = get().requests.find((item) => item.id === id);
        const cert = row && (get().certs.find((item) => item.id === row.certId) ?? get().certs.find((item) => item.deviceId === row.deviceId && item.name === row.certName));
        if (!row || !cert) return "Request not found.";
        if (row.status !== "chain_review") return "No new root is waiting for acceptance.";
        const supplier = (row.chainNote.match(/Root: ([^.]+)/)?.[1] ?? "new supplier").split(" ")[0];
        set({
          certs: syncHaCerts(
            get().certs.map((item) =>
              item.id === cert.id ? { ...item, requirements: { ...item.requirements, issuer: supplier, peerCaImported: true } } : item,
            ),
            get().devices,
          ),
          requests: get().requests.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "uploaded",
                  chainNote: item.chainNote.replace("Held for operator acceptance.", `Operator accepted ${supplier}.`),
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
          audits: [audit(actor, "request.accept-trust", `${cert.name}`, `Trusted supplier is now ${supplier}`), ...get().audits],
          toasts: [toast(`${supplier} is now the trusted supplier for ${cert.name}. The chain can be applied.`, "ok"), ...get().toasts],
        });
        return null;
      },

      applyRequest: (id, actor) => {
        const row = get().requests.find((item) => item.id === id);
        const device = row && get().devices.find((item) => item.id === row.deviceId);
        if (!row || !device) return "Request not found.";
        if (row.status === "chain_review") {
          set({
            audits: [
              audit(actor, "request.apply", `${device.name} / ${row.certName}`, "A new root is waiting.", [
                { name: "Accept supplier", status: "failed", detail: "The new root has not been accepted." },
                { name: "Install", status: "skipped", detail: "Nothing was written to the SBCE." },
              ]),
              ...get().audits,
            ],
          });
          return "A new root is waiting. Accept the supplier change before applying it.";
        }
        if (row.status !== "uploaded") return "A signed certificate has not been uploaded yet.";
        if (device.locked) {
          set({
            audits: [
              audit(actor, "request.apply", `${device.name} / ${row.certName}`, `${device.name} is locked.`, [
                { name: "Confirm unlocked", status: "failed", detail: `${device.name} is locked.` },
              ]),
              ...get().audits,
            ],
          });
          return `${device.name} is locked.`;
        }
        const match = get().certs.find((item) => item.deviceId === device.id && item.name === row.certName);
        const managed = match?.issuance === "managed-acme";
        const days = managed ? 90 : 365;
        const peer = device.haPairId ? get().devices.find((item) => item.haPairId === device.haPairId && item.id !== device.id) : undefined;
        const installed = get().certs.map((item) =>
          match && item.id === match.id
            ? {
                ...item,
                notAfter: isoInDays(days),
                requirements: managed ? { ...item.requirements, issuer: "Let's Encrypt", publicTrusted: true } : item.requirements,
                acme: managed ? { ...(item.acme ?? blankAcme(item.id)), status: "ready" as const, lastError: "" } : item.acme,
              }
            : item,
        );
        set({
          certs: syncHaCerts(installed, get().devices),
          requests: get().requests.map((item) =>
            item.id === id ? { ...item, status: "completed", updatedAt: new Date().toISOString() } : item,
          ),
          snapshots: [
            snapshotFor(device, "pre-change", `Before applying returned cert ${row.certName}`),
            snapshotFor(device, "post-change", managed ? `Applied Let's Encrypt chain for ${row.certName}` : `Applied customer-signed ${row.certName}`),
            ...(peer && !peer.locked ? [snapshotFor(peer, "post-change", `Standby ${peer.name} received the same ${row.certName}`)] : []),
            ...get().snapshots,
          ],
          audits: [
            audit(actor, "request.apply", `${device.name} / ${row.certName}`, managed ? "Let's Encrypt leaf and intermediate installed." : "TLS profiles updated.", [
              { name: "Pre-change snapshot", status: "done", detail: `Saved ${device.name} before the write.` },
              { name: "Upload chain", status: "done", detail: managed ? "Leaf and Let's Encrypt intermediate uploaded." : "Customer chain uploaded." },
              { name: "Point TLS profiles", status: "done", detail: match?.tlsProfiles.join(", ") || row.certName },
              { name: "Re-read certificate", status: "done", detail: `notAfter moved out ${days} days.` },
              peer
                ? peer.locked
                  ? { name: `Standby ${peer.name}`, status: "failed" as const, detail: `${peer.name} is locked.` }
                  : { name: `Standby ${peer.name}`, status: "done" as const, detail: "Same certificate installed after the health check." }
                : { name: "Standby", status: "skipped" as const, detail: "This SBCE is not part of an HA pair." },
            ]),
            ...get().audits,
          ],
          toasts: [toast(managed ? `Let's Encrypt certificate applied to ${device.name}${peer ? ` and ${peer.name}` : ""} for 90 days.` : `Applied signed certificate to ${device.name}${peer ? ` and ${peer.name}` : ""}.`, "ok"), ...get().toasts],
        });
        return null;
      },

      updateProfile: (id, patch) => {
        set({
          profiles: get().profiles.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        });
      },

      createProfile: (customerId) => {
        if (get().profiles.some((item) => item.customerId === customerId)) return;
        const customer = get().customers.find((item) => item.id === customerId);
        const profile: ReportProfile = {
          id: uid("rp"),
          customerId,
          name: `${customer?.name ?? "Customer"} alerts`,
          warnDays: 30,
          criticalDays: 7,
          teamsChannel: "",
          emailTo: "",
          quietHours: true,
          template: defaultTemplate,
        };
        set({ profiles: [...get().profiles, profile] });
      },

      sendTest: (profileId, actor) => {
        const profile = get().profiles.find((item) => item.id === profileId);
        if (!profile) return;
        const message: ChannelMessage = {
          id: uid("msg"),
          at: new Date().toISOString(),
          channel: profile.teamsChannel,
          title: "Test · Certificate alert",
          severity: "warning",
          body: profile.template
            .replace("{{severity}}", "Warning")
            .replace("{{customer.name}}", "UMCSN")
            .replace("{{site.name}}", "HDC")
            .replace("{{device.name}}", "UMCSN-SBCE-A1")
            .replace("{{cert.name}}", "trunk-genesis")
            .replace("{{cert.expires}}", "in 12 days")
            .replace("{{cert.days_remaining}}", "12")
            .replace("{{tls_profiles}}", "TLS-Trunk-Genesis, TLS-Trunk-Infinity"),
        };
        set({
          messages: [message, ...get().messages],
          audits: [audit(actor, "notify.test", profile.name, profile.teamsChannel), ...get().audits],
          toasts: [toast(`Test email recorded for ${profile.emailTo || profile.name}.`, "ok"), ...get().toasts],
        });
      },

      ackAlert: (key) => {
        if (get().acks.includes(key)) return;
        set({ acks: [...get().acks, key] });
      },

      resetDemo: () => {
        const session = get().session;
        set({
          ...data(),
          session,
          view: "overview",
          selectedCustomerId: "c_umcsn",
          selectedDeviceId: "d_a1",
          focusCertId: null,
          focusRequestId: null,
          toasts: [toast("Demo data restored.", "ok")],
        });
      },
    }),
    {
      name: "sbce-control-v3",
      skipHydration: true,
      partialize: (state) => ({
        session: state.session,
        view: state.view,
        selectedCustomerId: state.selectedCustomerId,
        selectedDeviceId: state.selectedDeviceId,
        customers: state.customers,
        sites: state.sites,
        devices: state.devices,
        certs: state.certs,
        snapshots: state.snapshots,
        requests: state.requests,
        profiles: state.profiles,
        audits: state.audits,
        users: state.users,
        messages: state.messages,
        acks: state.acks,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<AppState>;
        const profiles = saved.profiles ?? current.profiles;
        const scoped = profiles.every((item) => Boolean(item.customerId));
        const incoming = saved.certs ?? [];
        const known = new Map(current.certs.map((cert) => [cert.id, cert]));
        const certs = incoming.length
          ? [
              ...incoming.map((cert) => {
                const seeded = known.get(cert.id);
                return {
                  ...cert,
                  issuance: cert.issuance ?? seeded?.issuance ?? "customer-ca",
                  acme: cert.acme ?? seeded?.acme ?? blankAcme(cert.id),
                  requirements: cert.requirements ?? seeded?.requirements ?? defaultRequirements(cert),
                };
              }),
              ...current.certs.filter((cert) => !incoming.some((item) => item.id === cert.id)),
            ]
          : current.certs;
        return {
          ...current,
          ...saved,
          certs: syncHaCerts(certs, saved.devices ?? current.devices),
          audits: [
            ...current.audits.filter((event) => !(saved.audits ?? []).some((item) => item.id === event.id)),
            ...(saved.audits ?? current.audits),
          ],
          users: saved.users?.length ? saved.users : current.users,
          session: saved.session
            ? { ...saved.session, username: saved.session.username ?? saved.session.name, customerIds: saved.session.customerIds ?? [] }
            : null,
          profiles: scoped ? profiles : current.profiles,
          selectedCustomerId: saved.selectedCustomerId || current.selectedCustomerId,
        };
      },
    },
  ),
);
