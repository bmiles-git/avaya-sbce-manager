import type { Certificate } from "@/lib/types";

export interface CheckResult {
  ok: boolean;
  text: string;
}

function encodeLength(length: number): number[] {
  if (length < 128) return [length];
  const bytes: number[] = [];
  let n = length;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | bytes.length, ...bytes];
}

function tlv(tag: number, value: number[]): number[] {
  return [tag, ...encodeLength(value.length), ...value];
}

function encodeOid(oid: string): number[] {
  const parts = oid.split(".").map(Number);
  const body = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) {
    const chunk = [part & 0x7f];
    let n = part >> 7;
    while (n > 0) {
      chunk.unshift((n & 0x7f) | 0x80);
      n >>= 7;
    }
    body.push(...chunk);
  }
  return tlv(0x06, body);
}

function ascii(value: string): number[] {
  return [...value].map((char) => char.charCodeAt(0));
}

function utf8(value: string): number[] {
  return tlv(0x0c, ascii(value));
}

function utcTime(date: Date): number[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const text = `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return tlv(0x17, ascii(text));
}

function rdn(oid: string, value: string): number[] {
  return tlv(0x31, tlv(0x30, [...encodeOid(oid), ...utf8(value)]));
}

function pemWrap(label: string, body: number[]): string {
  const b64 = btoa(String.fromCharCode(...body));
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function rsaKey(bits: number): number[] {
  const modulus = new Array(bits / 8).fill(255);
  modulus[0] = 0x80;
  const body = tlv(0x30, [...tlv(0x02, [0x00, ...modulus]), ...tlv(0x02, [0x01, 0x00, 0x01])]);
  return tlv(0x30, [...tlv(0x30, encodeOid("1.2.840.113549.1.1.1")), ...tlv(0x03, [0x00, ...body])]);
}

function ecKey(): number[] {
  return tlv(0x30, [...tlv(0x30, encodeOid("1.2.840.10045.2.1")), ...tlv(0x03, [0x00, 0x04])]);
}

export function buildSamplePem(input: {
  cn: string;
  sans?: string[];
  key: "RSA" | "ECDSA";
  issuer?: string;
  ca?: boolean;
  keyBits?: number;
  notBefore?: Date;
  notAfter?: Date;
}): string {
  const notBefore = input.notBefore ?? new Date(Date.now() - 86400000);
  const notAfter = input.notAfter ?? new Date(Date.now() + 90 * 86400000);
  const issuer = input.issuer ?? input.cn;
  const names = input.sans ?? [];
  const extensions: number[] = [];
  if (names.length) {
    const san = tlv(0x30, names.flatMap((name) => tlv(0x82, ascii(name))));
    extensions.push(...tlv(0x30, [...encodeOid("2.5.29.17"), ...tlv(0x04, san)]));
  }
  if (input.ca) {
    const constraint = tlv(0x30, tlv(0x01, [0xff]));
    extensions.push(...tlv(0x30, [...encodeOid("2.5.29.19"), ...tlv(0x04, constraint)]));
  }
  const spki = input.key === "RSA" ? rsaKey(input.keyBits ?? 2048) : ecKey();
  const tbsBody = [
    ...tlv(0xa0, tlv(0x02, [0x02])),
    ...tlv(0x02, [0x01]),
    ...tlv(0x30, encodeOid("1.2.840.113549.1.1.11")),
    ...tlv(0x30, rdn("2.5.4.3", issuer)),
    ...tlv(0x30, [...utcTime(notBefore), ...utcTime(notAfter)]),
    ...tlv(0x30, rdn("2.5.4.3", input.cn)),
    ...spki,
  ];
  if (extensions.length) tbsBody.push(...tlv(0xa3, tlv(0x30, extensions)));
  const cert = tlv(0x30, [...tlv(0x30, tbsBody), ...tlv(0x30, encodeOid("1.2.840.113549.1.1.11")), ...tlv(0x03, [0x00, 0x00])]);
  return pemWrap("CERTIFICATE", cert);
}

export function buildSampleChain(input: {
  cn: string;
  sans: string[];
  key: "RSA" | "ECDSA";
  supplier: string;
}): string {
  const root = `${input.supplier} Root`;
  const intermediate = `${input.supplier} Intermediate`;
  return [
    buildSamplePem({ cn: input.cn, sans: input.sans, key: input.key, issuer: intermediate }),
    buildSamplePem({ cn: intermediate, key: input.key, issuer: root, ca: true }),
    buildSamplePem({ cn: root, key: input.key, issuer: root, ca: true }),
  ].join("");
}

function pemBlocks(pem: string, label: string): string[] {
  const pattern = new RegExp(`-----BEGIN ${label}-----([\\s\\S]*?)-----END ${label}-----`, "g");
  return [...pem.matchAll(pattern)].map((match) => match[1].replace(/\s+/g, ""));
}

function bytesFromB64(value: string): Uint8Array {
  const raw = atob(value);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

interface Node {
  tag: number;
  start: number;
  header: number;
  end: number;
}

function readNode(bytes: Uint8Array, offset: number): Node {
  const tag = bytes[offset];
  let length = bytes[offset + 1];
  let header = 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    length = 0;
    for (let i = 0; i < count; i += 1) length = (length << 8) | bytes[offset + 2 + i];
    header = 2 + count;
  }
  return { tag, start: offset + header, header, end: offset + header + length };
}

function children(bytes: Uint8Array, node: Node): Node[] {
  const list: Node[] = [];
  let cursor = node.start;
  while (cursor < node.end) {
    const child = readNode(bytes, cursor);
    list.push(child);
    cursor = child.end;
  }
  return list;
}

function oidOf(bytes: Uint8Array, node: Node): string {
  const raw = bytes.slice(node.start, node.end);
  const first = raw[0];
  const parts = [Math.floor(first / 40), first % 40];
  let value = 0;
  for (const byte of raw.slice(1)) {
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

function textOf(bytes: Uint8Array, node: Node): string {
  return new TextDecoder().decode(bytes.slice(node.start, node.end));
}

function parseUtc(bytes: Uint8Array, node: Node): Date {
  const text = textOf(bytes, node).replace("Z", "");
  const year = Number(text.slice(0, 2));
  const full = year >= 50 ? 1900 + year : 2000 + year;
  return new Date(Date.UTC(
    full,
    Number(text.slice(2, 4)) - 1,
    Number(text.slice(4, 6)),
    Number(text.slice(6, 8)),
    Number(text.slice(8, 10)),
    Number(text.slice(10, 12)),
  ));
}

function commonName(bytes: Uint8Array, name: Node): string {
  for (const set of children(bytes, name)) {
    for (const seq of children(bytes, set)) {
      const [oid, value] = children(bytes, seq);
      if (oid && oidOf(bytes, oid) === "2.5.4.3" && value) return textOf(bytes, value);
    }
  }
  return "";
}

function dnsNames(bytes: Uint8Array, extension: Node): string[] {
  const body = children(bytes, extension);
  const oid = body.find((node) => node.tag === 0x06);
  if (!oid || oidOf(bytes, oid) !== "2.5.29.17") return [];
  const octet = body.find((node) => node.tag === 0x04);
  if (!octet) return [];
  const wrapped = readNode(bytes, octet.start);
  const names: string[] = [];
  for (const general of children(bytes, wrapped)) {
    if (general.tag === 0x82) names.push(textOf(bytes, general));
  }
  return names;
}

export interface ParsedCert {
  cn: string;
  issuer: string;
  sans: string[];
  notBefore: Date;
  notAfter: Date;
  key: "RSA" | "ECDSA" | "unknown";
  keyBits: number | null;
  ca: boolean;
  selfSigned: boolean;
  role: "leaf" | "intermediate" | "root";
}

function keyBitsOf(bytes: Uint8Array, spki: Node): number | null {
  const bit = children(bytes, spki).find((node) => node.tag === 0x03);
  if (!bit || bit.start >= bit.end) return null;
  try {
    const inner = readNode(bytes, bit.start + 1);
    if (inner.tag !== 0x30) return null;
    const modulus = children(bytes, inner)[0];
    let raw = bytes.slice(modulus.start, modulus.end);
    if (raw[0] === 0x00) raw = raw.slice(1);
    return raw.length * 8;
  } catch {
    return null;
  }
}

function isCaExtension(bytes: Uint8Array, extension: Node): boolean {
  const body = children(bytes, extension);
  const oid = body.find((node) => node.tag === 0x06);
  if (!oid || oidOf(bytes, oid) !== "2.5.29.19") return false;
  const octet = body.find((node) => node.tag === 0x04);
  if (!octet) return false;
  const wrapped = readNode(bytes, octet.start);
  const boolean = children(bytes, wrapped).find((node) => node.tag === 0x01);
  return Boolean(boolean && bytes[boolean.start] !== 0);
}

function parseCertificate(bytes: Uint8Array): ParsedCert {
  const root = readNode(bytes, 0);
  const tbs = children(bytes, root)[0];
  let fields = children(bytes, tbs);
  if (fields[0]?.tag === 0xa0) fields = fields.slice(1);
  const validity = fields[3];
  const subject = fields[4];
  const spki = fields[5];
  const times = children(bytes, validity);
  const alg = children(bytes, children(bytes, spki)[0])[0];
  const keyOid = oidOf(bytes, alg);
  const sans: string[] = [];
  let ca = false;
  const extensions = fields.find((node) => node.tag === 0xa3);
  if (extensions) {
    const list = children(bytes, readNode(bytes, extensions.start));
    for (const ext of list) {
      sans.push(...dnsNames(bytes, ext));
      if (isCaExtension(bytes, ext)) ca = true;
    }
  }
  const cn = commonName(bytes, subject);
  const issuer = commonName(bytes, fields[2]);
  const selfSigned = cn.toLowerCase() === issuer.toLowerCase();
  const role = ca && selfSigned ? "root" : ca ? "intermediate" : "leaf";
  return {
    cn,
    issuer,
    sans,
    notBefore: parseUtc(bytes, times[0]),
    notAfter: parseUtc(bytes, times[1]),
    key: keyOid === "1.2.840.10045.2.1" ? "ECDSA" : keyOid.startsWith("1.2.840.113549.1.1") ? "RSA" : "unknown",
    keyBits: keyOid.startsWith("1.2.840.113549.1.1") ? keyBitsOf(bytes, spki) : null,
    ca,
    selfSigned,
    role,
  };
}

export function parseChain(pem: string): { error: string } | { certs: ParsedCert[] } {
  if (/BEGIN (RSA |EC )?PRIVATE KEY/.test(pem) || /BEGIN PRIVATE KEY/.test(pem)) {
    return { error: "This file contains a private key. Send only certificates." };
  }
  if (/BEGIN CERTIFICATE REQUEST/.test(pem) && !/BEGIN CERTIFICATE-----/.test(pem)) {
    return { error: "This is the CSR, not the signed certificate." };
  }
  const blocks = pemBlocks(pem, "CERTIFICATE");
  if (!blocks.length) return { error: "No CERTIFICATE block was found." };
  try {
    return { certs: blocks.map((block) => parseCertificate(bytesFromB64(block))) };
  } catch {
    return { error: "One of the certificates could not be read as X.509." };
  }
}

function sameSupplier(left: string, right: string) {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function wantedCn(subject: string): string {
  return subject.match(/CN=([^,/]+)/i)?.[1]?.trim() ?? subject.trim();
}

export function replacementInstructions(cert: Certificate, deviceName: string): string[] {
  const cn = wantedCn(cert.subject);
  const sans = cert.sans.length ? cert.sans.join(", ") : cn;
  const key = cert.requirements?.keyAlgorithm ?? "the key on the current certificate";
  const lines = [
    `This link is only for ${deviceName} / ${cert.name}. It replaces that certificate and no other.`,
    "Have your CA sign the CSR below. Paste the leaf first, then each intermediate, then the root if your CA supplier changed. Do not send a private key or the CSR.",
    `The leaf CN must be ${cn}.`,
    `The leaf must include these DNS SANs: ${sans}.`,
    `The key must be ${key}. RSA keys on Avaya SBC must be 2048 or 4096 bits.`,
    "It must already be valid, and it must last at least 30 days.",
    `The SBCE currently trusts ${cert.requirements?.issuer || "the issuer on this trunk"}. A leaf from that same supplier can be installed. A different root is held until an operator accepts it, because peer verification fails until that root is on the client profile.`,
    "A self-signed identity is rejected. Avaya SBC drops that TLS handshake.",
  ];
  if (cert.requirements?.use === "teams-direct-routing") {
    lines.push("This trunk is Microsoft Teams Direct Routing. The key has to be ECDSA, from a public CA, for an FQDN in the Microsoft 365 tenant.");
  }
  if (cert.requirements?.use === "remote-worker") {
    lines.push("This is the remote-worker server certificate. Phones see it on TLS 5061. It may also front the HTTPS config server.");
  }
  if (cert.requirements?.use === "itsp-trunk") {
    lines.push("This identity is presented to the ITSP. The names have to match the trunk the carrier expects.");
  }
  return lines;
}

export function checkReplacement(pem: string, cert: Certificate): { ok: boolean; trustChange: boolean; chainNote: string; rootCn: string; checks: CheckResult[] } {
  const parsed = parseChain(pem);
  if ("error" in parsed) return { ok: false, trustChange: false, chainNote: "", rootCn: "", checks: [{ ok: false, text: parsed.error }] };
  const leaf = parsed.certs.find((item) => item.role === "leaf") ?? parsed.certs[0];
  const intermediates = parsed.certs.filter((item) => item.role === "intermediate");
  const roots = parsed.certs.filter((item) => item.role === "root");
  const cn = wantedCn(cert.subject);
  const requiredSans = [...new Set([...cert.sans, cert.requirements?.fqdn ?? ""].map((item) => item.trim()).filter(Boolean))];
  const have = new Set(leaf.sans.map((item) => item.toLowerCase()));
  const missing = requiredSans.filter((name) => !have.has(name.toLowerCase()));
  const wantedKey = cert.requirements?.keyAlgorithm.startsWith("ECDSA") ? "ECDSA" : "RSA";
  const soon = leaf.notAfter.getTime() < Date.now() + 30 * 86400000;
  const notYet = leaf.notBefore.getTime() > Date.now() + 5 * 60000;
  const trusted = cert.requirements?.issuer ?? "";
  const anchored = !trusted || sameSupplier(leaf.issuer, trusted) || roots.some((item) => sameSupplier(item.cn, trusted));
  const checks: CheckResult[] = [
    { ok: !leaf.selfSigned, text: leaf.selfSigned ? "Self-signed identity. Avaya SBC rejects that TLS handshake." : "Identity is not self-signed." },
    { ok: leaf.cn.toLowerCase() === cn.toLowerCase(), text: `Subject CN is ${cn}.` },
    { ok: missing.length === 0, text: missing.length ? `Missing SAN ${missing.join(", ")}.` : `SANs include ${requiredSans.join(", ") || cn}.` },
    { ok: leaf.key === wantedKey, text: `Key algorithm is ${wantedKey}. Read ${leaf.key}.` },
    {
      ok: leaf.key !== "RSA" || leaf.keyBits === 2048 || leaf.keyBits === 4096,
      text: leaf.key === "RSA" ? `RSA key length is ${leaf.keyBits ?? "unreadable"}. Avaya SBC allows 2048 or 4096.` : "Key length rule applies to RSA. This key is not RSA.",
    },
    { ok: !notYet && !soon, text: soon ? "Certificate expires within 30 days, so it is not a useful replacement." : notYet ? "Certificate is not valid yet." : `Valid through ${leaf.notAfter.toISOString().slice(0, 10)}.` },
  ];
  if (cert.requirements?.use === "teams-direct-routing") {
    checks.push({ ok: leaf.key === "ECDSA", text: "Teams Direct Routing needs an ECDSA key." });
  }
  if (!leaf.selfSigned && !anchored && roots.length === 0) {
    checks.push({
      ok: false,
      text: `Issuer is ${leaf.issuer}. This SBCE trusts ${trusted}. Include the new intermediate and root so the supplier change can be reviewed.`,
    });
  }
  const identityOk = checks.every((item) => item.ok);
  const trustChange = identityOk && !anchored && roots.length > 0;
  const chainNote = [
    `Leaf ${leaf.cn} issued by ${leaf.issuer}.`,
    intermediates.length ? `Intermediates: ${intermediates.map((item) => item.cn).join(", ")}.` : "No intermediate was included.",
    roots.length ? `Root: ${roots.map((item) => item.cn).join(", ")}.` : "No root was included.",
    trustChange ? `Supplier change: ${trusted} -> ${roots[0]?.cn}. Held for operator acceptance.` : anchored ? "Chain ends at the supplier already trusted on this trunk." : "",
  ].filter(Boolean).join(" ");
  if (identityOk) checks.push({ ok: true, text: chainNote });
  return { ok: identityOk, trustChange, chainNote, rootCn: roots[0]?.cn ?? "", checks };
}
