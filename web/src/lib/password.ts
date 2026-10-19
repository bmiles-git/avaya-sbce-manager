export async function hashPassword(username: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`${username.trim().toLowerCase()}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
