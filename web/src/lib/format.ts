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

export function csrRequestFromCert(input: {
  name: string;
  subject: string;
  sans: string[];
  device: string;
  keyAlgorithm?: string;
  fqdn?: string;
}) {
  const field = (key: string) => input.subject.match(new RegExp(`(?:^|,)\\s*${key}=([^,]+)`, "i"))?.[1]?.trim() ?? "";
  const commonName = field("CN") || input.fqdn || input.name;
  const names = (input.sans.length ? input.sans : [commonName]).slice(0, 10);
  const ecdsa = (input.keyAlgorithm ?? "").startsWith("ECDSA");
  const keySize = input.keyAlgorithm === "RSA-4096" ? 4096 : 2048;
  const body = {
    country: field("C") || "US",
    state: field("ST"),
    locality: field("L"),
    organization: field("O"),
    organizationalUnit: field("OU"),
    commonName,
    keySize,
    keyUsageExtensionList: ["DIGITAL_SIGNATURE", "KEY_ENCIPHERMENT"],
    extendedKeyUsageExtensionList: ["SERVER_AUTH", "CLIENT_AUTH"],
    subjectAltNameList: names,
    passphrase: "",
    contactName: "",
    contactEmail: "",
  };
  return [
    `Prepared from the certificate already stored for ${input.device} / ${input.name}.`,
    "When the controller is reachable this body is posted to POST /certificates/certificate-signing-request.",
    ecdsa ? "Avaya's CSR call only accepts RSA 2048 or 4096. An ECDSA Teams key cannot be requested through that call." : "",
    JSON.stringify(body, null, 2),
  ]
    .filter(Boolean)
    .join("\n");
}

export function looksLikeCert(pem: string) {
  return pem.includes("BEGIN CERTIFICATE") && pem.includes("END CERTIFICATE");
}
