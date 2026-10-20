import { PublicClientApplication, type AccountInfo } from "@azure/msal-browser";
import type { Session } from "@/lib/types";

export interface EntraConfig {
  configured: boolean;
  clientId: string;
  tenantId: string;
  redirectUri: string;
}

let client: PublicClientApplication | null = null;
let clientKey = "";

export async function loadEntraConfig(): Promise<EntraConfig> {
  const response = await fetch("/api/auth-config");
  if (!response.ok) {
    return { configured: false, clientId: "", tenantId: "", redirectUri: "" };
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

export function sessionFromAccount(account: AccountInfo): Session {
  const claims = account.idTokenClaims ?? {};
  const username = account.username || String(claims.preferred_username ?? "");
  const name = account.name || username;
  const roles = Array.isArray(claims.roles) ? claims.roles.map(String) : [];
  const role = roles.length === 0 || roles.some((item) => item.toLowerCase() === "admin") ? "admin" : "operator";
  return { mode: "entra", name, username, role, port: 443, customerIds: [] };
}
