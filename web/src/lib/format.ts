import { differenceInCalendarDays, format, parseISO } from "date-fns";

export function daysLeft(iso: string) {
  return differenceInCalendarDays(parseISO(iso), new Date());
}

export function severityOf(iso: string, warn = 30, critical = 7): "ok" | "warning" | "critical" {
  const days = daysLeft(iso);
  if (days <= critical) return "critical";
  if (days <= warn) return "warning";
  return "ok";
}

export function formatWhen(iso: string) {
  return format(parseISO(iso), "MMM d, yyyy HH:mm");
}

export function formatDay(iso: string) {
  return format(parseISO(iso), "MMM d, yyyy");
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function isoInDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function fakeCsr(input: {
  name: string;
  subject: string;
  sans: string[];
  device: string;
  profiles: string[];
  keyAlgorithm?: string;
  use?: string;
}) {
  const san = input.sans.length ? input.sans.map((name) => `DNS:${name}`).join(", ") : "none";
  const body = [
    "SBCE Control sample CSR. Preview only, not a real PKCS#10.",
    `Certificate: ${input.name}`,
    input.use ? `Use: ${input.use}` : "",
    `Device: ${input.device}`,
    `Subject: ${input.subject}`,
    `SubjectAltName: ${san}`,
    input.keyAlgorithm ? `Key: ${input.keyAlgorithm}` : "",
    `TLS profiles: ${input.profiles.join(", ") || "none"}`,
    `Generated: ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join("\n");
  return `-----BEGIN CERTIFICATE REQUEST-----\n${body}\n-----END CERTIFICATE REQUEST-----\n`;
}

export function looksLikeCert(pem: string) {
  return pem.includes("BEGIN CERTIFICATE") && pem.includes("END CERTIFICATE");
}
