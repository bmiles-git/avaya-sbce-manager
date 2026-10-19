export type Role = "admin" | "operator";
export type AuthMode = "entra" | "local";
export type ViewId =
  | "overview"
  | "inventory"
  | "certificates"
  | "requests"
  | "reporting"
  | "snapshots"
  | "access"
  | "audit";

export type DeviceRole = "standalone" | "ems" | "ha-active" | "ha-standby";
export type AccessMethod = "public" | "tunnel" | "customer-vpn";
export type CertKind = "identity" | "ca";
export type RequestStatus =
  | "draft"
  | "csr_generated"
  | "sent"
  | "awaiting_upload"
  | "uploaded"
  | "applied"
  | "completed"
  | "expired"
  | "cancelled";

export interface Session {
  mode: AuthMode;
  name: string;
  role: Role;
  port: 443 | 8443;
}

export interface Customer {
  id: string;
  name: string;
  code: string;
  locale: string;
  timezone: string;
}

export interface Site {
  id: string;
  customerId: string;
  name: string;
  location: string;
  timezone: string;
}

export interface Device {
  id: string;
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
}

export type CertUse = "teams-direct-routing" | "remote-worker" | "itsp-trunk" | "config-https" | "ems" | "ca";
export type KeyAlgorithm = "ECDSA-P256" | "ECDSA-P384" | "RSA-2048" | "RSA-4096";
export type PeerCheck = "none" | "required";

export interface CertRequirements {
  use: CertUse;
  keyAlgorithm: KeyAlgorithm;
  issuer: string;
  publicTrusted: boolean;
  avayaDemo: boolean;
  tlsVersion: "1.2" | "1.3";
  sipDomain: string;
  extendedHostnameValidation: boolean;
  customHostnames: string;
  serverPeerVerification: PeerCheck;
  clientPeerVerification: PeerCheck;
  peerCaImported: boolean;
  fqdn: string;
  m365Domain: boolean;
  signalingPort: number;
  httpsPort: number;
  srtp: boolean;
  srtcp: boolean;
  mki: boolean;
  ciphers: string[];
}

export interface Certificate {
  id: string;
  deviceId: string;
  name: string;
  kind: CertKind;
  subject: string;
  sans: string[];
  notAfter: string;
  tlsProfiles: string[];
  autoRenew: boolean;
  requirements: CertRequirements;
}

export interface Snapshot {
  id: string;
  deviceId: string;
  label: string;
  trigger: "manual" | "pre-change" | "post-change" | "scheduled";
  createdAt: string;
  summary: string;
  knownGood: boolean;
}

export interface CertRequest {
  id: string;
  deviceId: string;
  certId: string | null;
  certName: string;
  status: RequestStatus;
  csrPem: string;
  signedPem: string;
  token: string;
  tokenExpires: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportProfile {
  id: string;
  customerId: string;
  name: string;
  warnDays: number;
  criticalDays: number;
  teamsChannel: string;
  emailTo: string;
  quietHours: boolean;
  template: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

export interface ChannelMessage {
  id: string;
  at: string;
  channel: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
}

export interface Toast {
  id: string;
  text: string;
  tone: "ok" | "warn" | "danger";
}

export interface PlanStep {
  title: string;
  detail: string;
}
