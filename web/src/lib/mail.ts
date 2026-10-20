export async function sendMail(input: { to: string; subject: string; text: string }): Promise<string | null> {
  try {
    const response = await fetch("/api/mail", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok || body.ok === false) {
      return body.error || `The mail server returned ${response.status}.`;
    }
    return null;
  } catch {
    return "Could not reach the mail service. Use port 8443, then recreate the container so /api/mail is running.";
  }
}
