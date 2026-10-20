import dns from "node:dns/promises";
import http from "node:http";
import net from "node:net";
import tls from "node:tls";
import nodemailer from "nodemailer";

const port = 8081;

function line(level, message) {
  return { at: new Date().toISOString(), level, message };
}

function parseTarget(raw) {
  const value = String(raw ?? "").trim();
  if (!value || /[\s/\\@]/.test(value) || value.includes("://")) {
    return { error: "Enter a host name or an IPv4 address. Not a URL." };
  }
  let host = value;
  let targetPort = 443;
  if (value.includes(":")) {
    const split = value.lastIndexOf(":");
    host = value.slice(0, split);
    targetPort = Number(value.slice(split + 1));
  }
  if (!Number.isInteger(targetPort) || targetPort !== 443) {
    return { error: "The SBCE management API is tcp/443. Other ports are refused." };
  }
  if (!/^[A-Za-z0-9.-]{1,253}$/.test(host)) {
    return { error: "That host is not a name or an IPv4 address." };
  }
  if (host === "localhost" || host.startsWith("127.") || host === "0.0.0.0" || host === "169.254.169.254") {
    return { error: "That address is on this host. The test will not connect to it." };
  }
  return { host, targetPort };
}

function tcpConnect(host, targetPort) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: targetPort });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, detail: "Timed out after 8s." });
    }, 8000);
    socket.once("connect", () => {
      clearTimeout(timer);
      const remote = socket.remoteAddress;
      socket.end();
      resolve({ ok: true, detail: `Connected to ${remote ?? host}:443.` });
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, detail: error.message });
    });
  });
}

function tlsConnect(host, targetPort) {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host,
      port: targetPort,
      servername: net.isIP(host) ? undefined : host,
      rejectUnauthorized: false,
      timeout: 8000,
    });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, detail: "TLS handshake timed out after 8s." });
    }, 8000);
    socket.once("secureConnect", () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate();
      const authorized = socket.authorized;
      socket.end();
      resolve({
        ok: true,
        authorized,
        subject: cert.subject?.CN || "(no CN)",
        issuer: cert.issuer?.CN || "(no issuer CN)",
        validTo: cert.valid_to || "",
        error: socket.authorizationError || "",
      });
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, detail: error.message });
    });
  });
}

async function probe(body) {
  const lines = [];
  const parsed = parseTarget(body.endpoint);
  const method = String(body.access ?? "public");
  lines.push(line("info", `Test from this host. Method ${method}.`));
  if (method === "customer-vpn" || method === "tunnel") {
    lines.push(line("info", "This test does not bring up a VPN or a tunnel. It uses whatever route this host already has."));
  }
  if (method === "sal") {
    lines.push(line("info", "SAL has no partner API. This checks the management address, not the hosted concentrator."));
  }
  if (parsed.error) {
    lines.push(line("fail", parsed.error));
    return { ok: false, lines };
  }
  lines.push(line("info", `Resolving ${parsed.host}.`));
  try {
    const looked = await dns.lookup(parsed.host, { all: true, verbatim: true });
    lines.push(line("ok", `Resolved ${looked.map((item) => item.address).join(", ")}.`));
  } catch (error) {
    lines.push(line("fail", `DNS failed: ${error.message}`));
    return { ok: false, lines };
  }
  lines.push(line("info", `Opening tcp/443 to ${parsed.host}.`));
  const tcp = await tcpConnect(parsed.host, parsed.targetPort);
  lines.push(line(tcp.ok ? "ok" : "fail", tcp.detail));
  if (!tcp.ok) return { ok: false, lines };
  lines.push(line("info", "Starting a TLS handshake. A private SBCE certificate is expected to be untrusted here."));
  const handshake = await tlsConnect(parsed.host, parsed.targetPort);
  if (!handshake.ok) {
    lines.push(line("fail", `TLS failed: ${handshake.detail}`));
    return { ok: false, lines };
  }
  lines.push(line("ok", `TLS complete. Subject ${handshake.subject}. Issuer ${handshake.issuer}. Not after ${handshake.validTo}.`));
  if (!handshake.authorized) {
    lines.push(line("info", `The certificate is not trusted by this host${handshake.error ? `: ${handshake.error}` : ""}. That does not mean the SBCE is down.`));
  }
  lines.push(line("ok", "The management address answered on tcp/443."));
  return { ok: true, lines };
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function sendMail(body) {
  const to = String(body.to ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const text = String(body.text ?? "");
  if (!/^[^\s@]+@[^\s@]+(\s*,\s*[^\s@]+@[^\s@]+)*$/.test(to)) {
    return { status: 400, payload: { ok: false, error: "That is not an email address." } };
  }
  if (!subject || !text.trim()) {
    return { status: 400, payload: { ok: false, error: "Subject and message are required." } };
  }
  const host = process.env.SMTP_HOST ?? "";
  const from = process.env.SMTP_FROM ?? "";
  if (!host || !from) {
    return {
      status: 503,
      payload: {
        ok: false,
        error: "SMTP is not configured on this host. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM in .env, then recreate the container.",
      },
    };
  }
  const portNumber = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || portNumber === 465;
  try {
    const transport = nodemailer.createTransport({
      host,
      port: portNumber,
      secure,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
    });
    const info = await transport.sendMail({ from, to, subject, text });
    return { status: 200, payload: { ok: true, id: info.messageId ?? "" } };
  } catch (error) {
    return { status: 502, payload: { ok: false, error: error instanceof Error ? error.message : "The mail server rejected the message." } };
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true });
    return;
  }
  if (req.method === "GET" && req.url === "/api/auth-config") {
    const clientId = process.env.ENTRA_CLIENT_ID ?? "";
    const tenantId = process.env.ENTRA_TENANT_ID ?? "";
    const redirectUri = process.env.ENTRA_REDIRECT_URI || (process.env.SITE_ADDRESS ? `https://${process.env.SITE_ADDRESS}` : "");
    const allowedDomain = (process.env.ENTRA_ALLOWED_DOMAIN || "gagetech.com").trim().replace(/^@/, "").toLowerCase();
    json(res, 200, {
      configured: Boolean(clientId && tenantId && redirectUri && allowedDomain),
      clientId,
      tenantId,
      redirectUri,
      allowedDomain,
    });
    return;
  }
  if (req.method !== "POST" || (req.url !== "/api/probe" && req.url !== "/api/mail")) {
    json(res, 404, { ok: false, error: "Not found." });
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20000) {
      json(res, 413, { ok: false, error: "Request was too large." });
      return;
    }
    chunks.push(chunk);
  }
  let body = {};
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    json(res, 400, { ok: false, error: "The request was not JSON." });
    return;
  }
  if (req.url === "/api/mail") {
    const result = await sendMail(body);
    json(res, result.status, result.payload);
    return;
  }
  const result = await probe(body);
  json(res, 200, result);
});

server.listen(port, "0.0.0.0");
