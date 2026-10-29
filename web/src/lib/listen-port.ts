export const recommendedListenPort = "9443";

const reserved: Record<number, string> = {
  80: "HTTP is used for redirects. Do not put the relay there.",
  443: "The management API defaults to 443, and the TURN profile example uses 443 for TCP/TLS.",
  3478: "TURN/STUN listens on UDP 3478.",
  5060: "SIP signaling examples use 5060.",
  5061: "SIP over TLS examples use 5061.",
};

export function checkListenPort(raw: string): { level: "block" | "warn" | "ok"; text: string } {
  const port = Number(String(raw).trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { level: "block", text: "Use a whole number from 1 to 65535." };
  }
  const known = reserved[port];
  if (known) return { level: "block", text: `${known} Pick another port. ${recommendedListenPort} is free in the 10.2 configuration.` };
  if (port >= 50000 && port <= 55000) {
    return { level: "block", text: `The TURN profile reserves ${port} inside the media relay range 50000–55000.` };
  }
  if (port === 8443 || port === 8080) {
    return { level: "warn", text: `${port} is a common management or proxy port. Use it only when nothing on this SBCE or EMS already listens there.` };
  }
  return { level: "ok", text: `${port} is not a SIP, TURN, media, or management port in the 10.2 configuration.` };
}
