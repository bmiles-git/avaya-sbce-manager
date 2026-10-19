import type { Certificate } from "@/lib/types";

export interface ParsedLeaf {
  cn: string;
  sans: string[];
  notBefore: Date;
  notAfter: Date;
  key: "RSA" | "ECDSA" | "unknown";
}

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

export function buildSamplePem(input: {
  cn: string;
  sans: string[];
  key: "RSA" | "ECDSA";
  notBefore?: Date;
  notAfter?: Date;
}): string {
  const notBefore = input.notBefore ?? new Date(Date.now() - 86400000);
  const notAfter = input.notAfter ?? new Date(Date.now() + 90 * 86400000);
  const names = input.sans.length ? input.sans : [input.cn];
  const san = tlv(
    0x30,
    names.flatMap((name) => tlv(0x82, ascii(name))),
  );
  const extension = tlv(0x30, [...encodeOid("2.5.29.17"), ...tlv(0x04, san)]);
  const keyOid = input.key === "ECDSA" ? "1.2.840.10045.2.1" : "1.2.840.113549.1.1.1";
  const tbs = tlv(0x30, [
    ...tlv(0xa0, tlv(0x02, [0x02])),
    ...tlv(0x02, [0x01]),
    ...tlv(0x30, encodeOid("1.2.840.113549.1.1.11")),
    ...tlv(0x30, rdn("2.5.4.3", "Preview CA")),
    ...tlv(0x30, [...utcTime(notBefore), ...utcTime(notAfter)]),
    ...tlv(0x30, rdn("2.5.4.3", input.cn)),
    ...tlv(0x30, [...tlv(0x30, encodeOid(keyOid)), ...tlv(0x03, [0x00, 0x01])]),
    ...tlv(0xa3, tlv(0x30, extension)),
  ]);
  const cert = tlv(0x30, [...tbs, ...tlv(0x30, encodeOid("1.2.840.113549.1.1.11")), ...tlv(0x03, [0x00, 0x00])]);
  return pemWrap("CERTIFICATE", cert);
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

export function parseLeaf(pem: string): ParsedLeaf | { error: string } {
  if (/BEGIN (RSA |EC )?PRIVATE KEY/.test(pem) || /BEGIN PRIVATE KEY/.test(pem)) {
    return { error: "This file contains a private key. Send only the certificate." };
  }
  if (/BEGIN CERTIFICATE REQUEST/.test(pem) && !/BEGIN CERTIFICATE-----/.test(pem)) {
    return { error: "This is the CSR, not the signed certificate." };
  }
  const blocks = pemBlocks(pem, "CERTIFICATE");
  if (!blocks.length) return { error: "No CERTIFICATE block was found." };
  let bytes: Uint8Array;
  try {
    bytes = bytesFromB64(blocks[0]);
  } catch {
    return { error: "The certificate PEM is not valid base64." };
  }
  try {
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
    const extensions = fields.find((node) => node.tag === 0xa3);
    if (extensions) {
      const list = children(bytes, readNode(bytes, extensions.start));
      for (const ext of list) sans.push(...dnsNames(bytes, ext));
    }
    return {
      cn: commonName(bytes, subject),
      sans,
      notBefore: parseUtc(bytes, times[0]),
      notAfter: parseUtc(bytes, times[1]),
      key: keyOid === "1.2.840.10045.2.1" ? "ECDSA" : keyOid.startsWith("1.2.840.113549.1.1") ? "RSA" : "unknown",
    };
  } catch {
    return { error: "The certificate could not be read as X.509." };
  }
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
    "Have your CA sign the CSR below. Paste the leaf certificate first, then any intermediates. Do not send the private key or the CSR.",
    `The leaf CN must be ${cn}.`,
    `The leaf must include these DNS SANs: ${sans}.`,
    `The key must be ${key}.`,
    "It must already be valid, and it must last at least 30 days.",
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

export function checkReplacement(pem: string, cert: Certificate): { ok: boolean; checks: CheckResult[] } {
  const parsed = parseLeaf(pem);
  if ("error" in parsed) return { ok: false, checks: [{ ok: false, text: parsed.error }] };
  const cn = wantedCn(cert.subject);
  const requiredSans = [...new Set([...cert.sans, cert.requirements?.fqdn ?? ""].map((item) => item.trim()).filter(Boolean))];
  const have = new Set(parsed.sans.map((item) => item.toLowerCase()));
  const missing = requiredSans.filter((name) => !have.has(name.toLowerCase()));
  const wantedKey = cert.requirements?.keyAlgorithm.startsWith("ECDSA") ? "ECDSA" : "RSA";
  const soon = parsed.notAfter.getTime() < Date.now() + 30 * 86400000;
  const notYet = parsed.notBefore.getTime() > Date.now() + 5 * 60000;
  const checks: CheckResult[] = [
    { ok: parsed.cn.toLowerCase() === cn.toLowerCase(), text: `Subject CN is ${cn}.` },
    { ok: missing.length === 0, text: missing.length ? `Missing SAN ${missing.join(", ")}.` : `SANs include ${requiredSans.join(", ") || cn}.` },
    { ok: parsed.key === wantedKey, text: `Key algorithm is ${wantedKey}. Read ${parsed.key}.` },
    { ok: !notYet && !soon, text: soon ? "Certificate expires within 30 days, so it is not a useful replacement." : notYet ? "Certificate is not valid yet." : `Valid through ${parsed.notAfter.toISOString().slice(0, 10)}.` },
  ];
  if (cert.requirements?.use === "teams-direct-routing") {
    checks.push({ ok: parsed.key === "ECDSA", text: "Teams Direct Routing needs an ECDSA key." });
  }
  return { ok: checks.every((item) => item.ok), checks };
}
