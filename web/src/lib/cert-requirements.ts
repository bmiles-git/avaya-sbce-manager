import type { Certificate, CertRequirements, CertUse } from "@/lib/types";

export const TEAMS_CIPHERS = [
  "TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
  "TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
  "TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA384",
  "TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256",
] as const;

export const USE_LABEL: Record<CertUse, string> = {
  "teams-direct-routing": "Teams Direct Routing",
  "remote-worker": "Remote worker",
  "itsp-trunk": "ITSP trunk",
  "config-https": "Config HTTPS",
  ems: "EMS",
  ca: "CA trust",
};

export function certRequirements(over: Partial<CertRequirements> = {}): CertRequirements {
  return {
    use: "itsp-trunk",
    keyAlgorithm: "RSA-2048",
    issuer: "DigiCert",
    publicTrusted: true,
    avayaDemo: false,
    tlsVersion: "1.2",
    sipDomain: "",
    extendedHostnameValidation: true,
    customHostnames: "",
    serverPeerVerification: "none",
    clientPeerVerification: "required",
    peerCaImported: true,
    fqdn: "",
    m365Domain: false,
    signalingPort: 5061,
    httpsPort: 443,
    srtp: true,
    srtcp: true,
    mki: false,
    ciphers: [],
    ...over,
  };
}

export function defaultRequirements(cert: Pick<Certificate, "name" | "kind" | "subject">): CertRequirements {
  const name = cert.name.toLowerCase();
  if (cert.kind === "ca" || name.includes("root") || name.includes("ca")) {
    return certRequirements({ use: "ca", publicTrusted: true, peerCaImported: true, issuer: "Imported CA" });
  }
  if (name.includes("team")) return certRequirements({ use: "teams-direct-routing", ciphers: [...TEAMS_CIPHERS] });
  if (name.includes("remote") || name.includes("rw")) return certRequirements({ use: "remote-worker" });
  if (name.includes("ems")) return certRequirements({ use: "ems", publicTrusted: false, issuer: "Internal" });
  return certRequirements();
}

export interface Finding {
  ok: boolean;
  text: string;
}

function hostInCert(cert: Certificate, fqdn: string) {
  const host = fqdn.trim().toLowerCase();
  if (!host) return false;
  const subject = cert.subject.toLowerCase();
  return subject.includes(host) || cert.sans.some((san) => san.toLowerCase() === host);
}

export function findingsFor(cert: Certificate): Finding[] {
  const req = cert.requirements ?? defaultRequirements(cert);
  const out: Finding[] = [];
  const check = (ok: boolean, text: string) => out.push({ ok, text });

  if (req.use === "ca") {
    check(req.peerCaImported, "CA is imported on the TLS client profile that must trust the peer.");
    check(!req.avayaDemo, "Production trust is not the Avaya demo CA.");
    return out;
  }

  if (req.use === "ems") {
    check(!req.avayaDemo, "EMS management certificate is not the Avaya demo certificate.");
    return out;
  }

  check(!req.avayaDemo && req.publicTrusted, "Identity is signed by a public CA. Avaya demo certificates stay out of production.");
  check(req.tlsVersion === "1.2", "Signaling TLS version is 1.2.");
  check(req.signalingPort === 5061, "SIP TLS listens on 5061.");
  check(
    !req.extendedHostnameValidation || req.customHostnames.trim().length > 0 || req.sipDomain.trim().length > 0,
    "Extended hostname validation has a custom hostname or a SIP domain.",
  );

  if (req.use === "teams-direct-routing") {
    check(req.keyAlgorithm.startsWith("ECDSA"), "Key is ECDSA. Teams Direct Routing requires the ECC cipher set.");
    check(
      req.ciphers.some((cipher) => (TEAMS_CIPHERS as readonly string[]).includes(cipher)),
      "At least one Teams ECC cipher is enabled.",
    );
    check(req.serverPeerVerification === "none", "Server profile peer verification is none. The SBC presents its certificate.");
    check(req.clientPeerVerification === "required", "Client profile verifies Microsoft and has the Teams CA imported.");
    check(req.peerCaImported, "Teams CA is installed (Teams download or openssl against sip.pstnhub.microsoft.com).");
    check(hostInCert(cert, req.fqdn), "Public FQDN is in the subject or SAN.");
    check(req.m365Domain, "The FQDN domain is registered in the Microsoft 365 tenant.");
    check(req.srtp && req.srtcp && !req.mki, "SRTP is on, SRTCP is on, and MKI is off.");
  }

  if (req.use === "remote-worker") {
    check(req.clientPeerVerification === "required", "Client profile toward Session Manager verifies the peer certificate.");
    check(req.httpsPort === 443, "Config file server can present this identity on HTTPS 443.");
    check(req.srtp, "Media toward remote workers is SRTP.");
    check(req.sipDomain.trim().length > 0, "SIP domain is set for the remote-worker signaling interface.");
  }

  if (req.use === "itsp-trunk") {
    check(req.clientPeerVerification === "required", "Client profile verifies the ITSP certificate.");
    check(req.peerCaImported, "ITSP CA chain (root and intermediate) is imported.");
    check(req.serverPeerVerification === "none" || req.serverPeerVerification === "required", "Server profile peer verification is set.");
  }

  if (req.use === "config-https") {
    check(req.httpsPort === 443, "HTTPS listen port is 443 and uses the server TLS profile.");
  }

  return out;
}
