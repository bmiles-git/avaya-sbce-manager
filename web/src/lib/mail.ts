export interface MailSmtp {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

export function smtpFromProfile(profile: {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  smtpSecure?: boolean;
} | null | undefined): MailSmtp | undefined {
  if (!profile?.smtpHost?.trim()) return undefined;
  return {
    host: profile.smtpHost.trim(),
    port: Number(profile.smtpPort) || 587,
    user: profile.smtpUser?.trim() ?? "",
    pass: profile.smtpPass ?? "",
    from: profile.smtpFrom?.trim() ?? "",
    secure: Boolean(profile.smtpSecure) || Number(profile.smtpPort) === 465,
  };
}

export async function sendMail(input: { to: string; subject: string; text: string; smtp?: MailSmtp }): Promise<string | null> {
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
