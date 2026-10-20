import { PublicClientApplication, type AccountInfo } from "@azure/msal-browser";
import type { Session } from "@/lib/types";

export interface EntraConfig {
  configured: boolean;
  clientId: string;
  tenantId: string;
  redirectUri: string;
  allowedDomain: string;
}

let client: PublicClientApplication | null = null;
let clientKey = "";

export async function loadEntraConfig(): Promise<EntraConfig> {
  const response = await fetch("/api/auth-config");
  if (!response.ok) {
    return { configured: false, clientId: "", tenantId: "", redirectUri: "", allowedDomain: "" };
  }
  return (await response.json()) as EntraConfig;
}

export async function entraClient(config: EntraConfig) {
  if (!config.configured) throw new Error("Entra ID is not configured on this host.");
  const key = `${config.tenantId}:${config.clientId}:${config.redirectUri}`;
  if (!client || clientKey !== key) {
    client = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        redirectUri: config.redirectUri,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    clientKey = key;
    await client.initialize();
  }
  return client;
}

export function isAllowedAccount(account: AccountInfo, domain: string) {
  const suffix = `@${domain.trim().toLowerCase().replace(/^@/, "")}`;
  if (suffix === "@") return false;
  const claims = account.idTokenClaims ?? {};
  const candidates = [account.username, claims.preferred_username, claims.email, claims.upn].filter(
    (value): value is string => typeof value === "string",
  );
  return candidates.some((value) => value.toLowerCase().endsWith(suffix));
}

export function sessionFromAccount(account: AccountInfo): Session {
  const claims = account.idTokenClaims ?? {};
  const username = account.username || String(claims.preferred_username ?? "");
  const name = account.name || username;
  return { mode: "entra", name, username, role: "admin", port: 443, customerIds: [] };
}
