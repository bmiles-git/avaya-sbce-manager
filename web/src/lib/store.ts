import { create } from "zustand";
import { persist } from "zustand/middleware";
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
} from "@/lib/seed";
import type {
  AuditEvent,
  Certificate,
  CertRequest,
  ChannelMessage,
  Customer,
  Device,
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
  messages: ChannelMessage[];
  acks: string[];
}

interface AppState extends DataSlice {
  session: Session | null;
  view: ViewId;
  selectedDeviceId: string | null;
  focusCertId: string | null;
  toasts: Toast[];
  signInLocal: (username: string, password: string) => string | null;
  signInEntra: () => void;
  signOut: () => void;
  setView: (view: ViewId) => void;
  selectDevice: (id: string | null) => void;
  openCert: (certId: string) => void;
  dismissToast: (id: string) => void;
  addCustomer: (input: Omit<Customer, "id">) => void;
  addSite: (input: Omit<Site, "id">) => void;
  addDevice: (input: Omit<Device, "id">) => void;
  toggleLock: (id: string) => void;
  toggleMaintenance: (id: string) => void;
  setAccess: (id: string, access: Device["access"], endpoint: string) => void;
  renewCert: (certId: string, actor: string, sequentialHa: boolean) => string | null;
  restoreSnapshot: (snapshotId: string, actor: string) => string | null;
  labelSnapshot: (snapshotId: string) => void;
  createRequest: (deviceId: string, certName: string, notes: string, actor: string) => string;
  markSent: (id: string, actor: string) => void;
  extendRequest: (id: string, actor: string) => void;
  reissueRequest: (id: string, actor: string) => void;
  cancelRequest: (id: string, actor: string) => void;
  uploadSigned: (token: string, pem: string) => string | null;
  applyRequest: (id: string, actor: string) => string | null;
  updateProfile: (id: string, patch: Partial<ReportProfile>) => void;
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
    messages: seedMessages,
    acks: [],
  };
}

function audit(actor: string, action: string, target: string, detail: string): AuditEvent {
  return { id: uid("aud"), at: new Date().toISOString(), actor, action, target, detail };
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
      selectedDeviceId: "d_a1",
      focusCertId: null,
      toasts: [],

      signInLocal: (username, password) => {
        const user = username.trim().toLowerCase();
        if (user === "admin" && password === "harbor-admin") {
          set({
            session: { mode: "local", name: "Local admin", role: "admin", port: 8443 },
            toasts: [toast("Signed in on the local admin listener.", "ok")],
          });
          return null;
        }
        if (user === "operator" && password === "lookout") {
          set({
            session: { mode: "local", name: "Local operator", role: "operator", port: 8443 },
            toasts: [toast("Signed in as operator. Changes that write to an SBCE stay locked.", "ok")],
          });
          return null;
        }
        return "Unknown local account. Use admin / harbor-admin or operator / lookout.";
      },

      signInEntra: () => {
        set({
          session: { mode: "entra", name: "Bryan Miles", role: "admin", port: 443 },
          toasts: [toast("Entra ID sign-in completed. Delegated admin session is active.", "ok")],
        });
      },

      signOut: () => set({ session: null, view: "overview" }),
      setView: (view) => set({ view }),
      selectDevice: (id) => set({ selectedDeviceId: id, view: "inventory" }),
      openCert: (certId) => {
        const cert = get().certs.find((item) => item.id === certId);
        set({
          focusCertId: certId,
          selectedDeviceId: cert?.deviceId ?? get().selectedDeviceId,
          view: "certificates",
        });
      },
      dismissToast: (id) => set({ toasts: get().toasts.filter((item) => item.id !== id) }),

      addCustomer: (input) => {
        const row: Customer = { ...input, id: uid("c") };
        const actor = get().session?.name ?? "admin";
        set({
          customers: [...get().customers, row],
          audits: [audit(actor, "customer.create", row.name, `Code ${row.code}`), ...get().audits],
          toasts: [toast(`Customer ${row.name} added.`, "ok"), ...get().toasts],
        });
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

      setAccess: (id, access, endpoint) => {
        const device = get().devices.find((item) => item.id === id);
        if (!device) return;
        set({
          devices: get().devices.map((item) => (item.id === id ? { ...item, access, endpoint } : item)),
          audits: [
            audit(get().session?.name ?? "admin", "access.update", device.name, `${access} → ${endpoint}`),
            ...get().audits,
          ],
          toasts: [toast(`Reachability for ${device.name} updated.`, "ok"), ...get().toasts],
        });
      },

      renewCert: (certId, actor, sequentialHa) => {
        const cert = get().certs.find((item) => item.id === certId);
        const device = cert && get().devices.find((item) => item.id === cert.deviceId);
        if (!cert || !device) return "Certificate not found.";
        if (device.locked) return `${device.name} is locked.`;
        if (device.maintenance) return `${device.name} is in maintenance mode.`;
        const pre = snapshotFor(device, "pre-change", `Before replacing ${cert.name}`);
        const nextExpiry = isoInDays(90);
        const updated = get().certs.map((item) => (item.id === certId ? { ...item, notAfter: nextExpiry } : item));
        const extra: Snapshot[] = [pre, snapshotFor(device, "post-change", `Installed ${cert.name}, expires in 90 days`)];
        const events = [
          audit(actor, "cert.renew", `${device.name} / ${cert.name}`, "Uploaded identity cert and updated TLS profiles"),
        ];
        if (sequentialHa && device.haPairId) {
          const peer = get().devices.find((item) => item.haPairId === device.haPairId && item.id !== device.id);
          const peerCert = peer && get().certs.find((item) => item.deviceId === peer.id && item.name === cert.name);
          if (peer && peerCert && !peer.locked && !peer.maintenance) {
            const idx = updated.findIndex((item) => item.id === peerCert.id);
            if (idx >= 0) updated[idx] = { ...updated[idx], notAfter: nextExpiry };
            extra.push(snapshotFor(peer, "post-change", `HA peer ${cert.name} updated after health check`));
            events.unshift(
              audit(actor, "cert.renew", `${peer.name} / ${peerCert.name}`, "Sequential HA follow-up after health check"),
            );
          }
        }
        set({
          certs: updated,
          snapshots: [...extra, ...get().snapshots],
          audits: [...events, ...get().audits],
          toasts: [toast(`${cert.name} on ${device.name} renewed for 90 days.`, "ok"), ...get().toasts],
        });
        return null;
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

      createRequest: (deviceId, certName, notes, actor) => {
        const device = get().devices.find((item) => item.id === deviceId);
        const subject = device ? `CN=${device.name.toLowerCase()}.example` : "CN=sbc.example";
        const row: CertRequest = {
          id: uid("req"),
          deviceId,
          certName,
          status: "csr_generated",
          csrPem: fakeCsr(certName, subject),
          signedPem: "",
          token: uid("upl"),
          tokenExpires: isoInDays(7),
          notes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set({
          requests: [row, ...get().requests],
          audits: [audit(actor, "request.create", `${device?.name ?? deviceId} / ${certName}`, "CSR generated"), ...get().audits],
        });
        return row.id;
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
              ? { ...item, token, tokenExpires: isoInDays(7), status: "awaiting_upload", updatedAt: new Date().toISOString() }
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
        set({
          requests: get().requests.map((item) =>
            item.id === row.id
              ? { ...item, signedPem: pem, status: "uploaded", updatedAt: new Date().toISOString() }
              : item,
          ),
          audits: [audit("customer-upload", "request.upload", row.certName, "Signed certificate received"), ...get().audits],
        });
        return null;
      },

      applyRequest: (id, actor) => {
        const row = get().requests.find((item) => item.id === id);
        const device = row && get().devices.find((item) => item.id === row.deviceId);
        if (!row || !device) return "Request not found.";
        if (row.status !== "uploaded") return "A signed certificate has not been uploaded yet.";
        if (device.locked) return `${device.name} is locked.`;
        const match = get().certs.find((item) => item.deviceId === device.id && item.name === row.certName);
        set({
          certs: get().certs.map((item) => (match && item.id === match.id ? { ...item, notAfter: isoInDays(365) } : item)),
          requests: get().requests.map((item) =>
            item.id === id ? { ...item, status: "completed", updatedAt: new Date().toISOString() } : item,
          ),
          snapshots: [
            snapshotFor(device, "pre-change", `Before applying returned cert ${row.certName}`),
            snapshotFor(device, "post-change", `Applied customer-signed ${row.certName}`),
            ...get().snapshots,
          ],
          audits: [audit(actor, "request.apply", `${device.name} / ${row.certName}`, "TLS profiles updated"), ...get().audits],
          toasts: [toast(`Applied signed certificate to ${device.name}.`, "ok"), ...get().toasts],
        });
        return null;
      },

      updateProfile: (id, patch) => {
        set({
          profiles: get().profiles.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        });
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
          toasts: [toast("Test card posted to the Teams channel preview.", "ok"), ...get().toasts],
        });
      },

      ackAlert: (key) => {
        if (get().acks.includes(key)) return;
        set({ acks: [...get().acks, key] });
      },

      resetDemo: () => {
        const session = get().session;
        set({ ...data(), session, view: "overview", selectedDeviceId: "d_a1", toasts: [toast("Demo data restored.", "ok")] });
      },
    }),
    {
      name: "sbce-control-v1",
      skipHydration: true,
      partialize: (state) => ({
        session: state.session,
        view: state.view,
        selectedDeviceId: state.selectedDeviceId,
        customers: state.customers,
        sites: state.sites,
        devices: state.devices,
        certs: state.certs,
        snapshots: state.snapshots,
        requests: state.requests,
        profiles: state.profiles,
        audits: state.audits,
        messages: state.messages,
        acks: state.acks,
      }),
    },
  ),
);
