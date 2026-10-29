import { useState } from "react";
import { formatWhen } from "@/lib/format";
import { sendMail, smtpFromProfile } from "@/lib/mail";
import { useApp } from "@/lib/store";
import { Button, Field, inputClass, Panel } from "@/components/ui";

export function Reporting() {
  const profiles = useApp((s) => s.profiles);
  const customers = useApp((s) => s.customers);
  const sites = useApp((s) => s.sites);
  const devices = useApp((s) => s.devices);
  const customerId = useApp((s) => s.selectedCustomerId);
  const updateProfile = useApp((s) => s.updateProfile);
  const createProfile = useApp((s) => s.createProfile);
  const sendTest = useApp((s) => s.sendTest);
  const messages = useApp((s) => s.messages);
  const actor = useApp((s) => s.session?.name ?? "admin");
  const admin = useApp((s) => s.session?.role === "admin");
  const [mailNote, setMailNote] = useState<string | null>(null);
  const [mailOk, setMailOk] = useState(false);
  const customer = customers.find((item) => item.id === customerId);
  const profile = profiles.find((item) => item.customerId === customerId);
  if (!profile) {
    return (
      <Panel title="Reporting">
        <p className="text-sm text-muted">This customer does not have an email or Teams template yet.</p>
        <Button className="mt-3" tone="primary" disabled={!admin} onClick={() => createProfile(customerId)}>
          Create profile
        </Button>
      </Panel>
    );
  }

  const site = sites.find((item) => item.customerId === customerId);
  const device = devices.find((item) => item.siteId === site?.id);
  const preview = profile.template
    .replaceAll("{{severity}}", "Warning")
    .replaceAll("{{customer.name}}", customer?.name ?? "Customer")
    .replaceAll("{{site.name}}", site?.name ?? "Site")
    .replaceAll("{{device.name}}", device?.name ?? "SBCE")
    .replaceAll("{{cert.name}}", "trunk-genesis")
    .replaceAll("{{cert.expires}}", "in 4 days")
    .replaceAll("{{cert.days_remaining}}", "4")
    .replaceAll("{{tls_profiles}}", "TLS-Trunk-Genesis");
  const sent = messages.filter((message) => message.channel === profile.teamsChannel);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={profile.name}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Warn at (days)">
              <input
                className={inputClass}
                type="number"
                min={1}
                value={profile.warnDays}
                disabled={!admin}
                onChange={(e) => updateProfile(profile.id, { warnDays: Number(e.target.value) })}
              />
            </Field>
            <Field label="Critical at (days)">
              <input
                className={inputClass}
                type="number"
                min={1}
                value={profile.criticalDays}
                disabled={!admin}
                onChange={(e) => updateProfile(profile.id, { criticalDays: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Teams channel">
            <input
              className={inputClass}
              value={profile.teamsChannel}
              disabled={!admin}
              onChange={(e) => updateProfile(profile.id, { teamsChannel: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              className={inputClass}
              value={profile.emailTo}
              disabled={!admin}
              onChange={(e) => updateProfile(profile.id, { emailTo: e.target.value })}
            />
          </Field>
          <p className="text-xs text-muted">SMTP for this customer. Leave the host blank to use the server .env.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SMTP host">
              <input className={inputClass} value={profile.smtpHost ?? ""} disabled={!admin} onChange={(e) => updateProfile(profile.id, { smtpHost: e.target.value })} placeholder="smtp.example.com" />
            </Field>
            <Field label="Port">
              <input className={inputClass} type="number" value={profile.smtpPort ?? 587} disabled={!admin} onChange={(e) => updateProfile(profile.id, { smtpPort: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SMTP user">
              <input className={inputClass} value={profile.smtpUser ?? ""} disabled={!admin} onChange={(e) => updateProfile(profile.id, { smtpUser: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="SMTP password">
              <input className={inputClass} type="password" value={profile.smtpPass ?? ""} disabled={!admin} onChange={(e) => updateProfile(profile.id, { smtpPass: e.target.value })} autoComplete="new-password" />
            </Field>
          </div>
          <Field label="From address">
            <input className={inputClass} value={profile.smtpFrom ?? ""} disabled={!admin} onChange={(e) => updateProfile(profile.id, { smtpFrom: e.target.value })} placeholder="alerts@example.com" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(profile.smtpSecure) || profile.smtpPort === 465}
              disabled={!admin}
              onChange={(e) => updateProfile(profile.id, { smtpSecure: e.target.checked })}
            />
            Use implicit TLS (port 465)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={profile.quietHours}
              disabled={!admin}
              onChange={(e) => updateProfile(profile.id, { quietHours: e.target.checked })}
            />
            Hold non-critical alerts during quiet hours
          </label>
          <Field label="Message template">
            <textarea
              className={inputClass}
              rows={5}
              disabled={!admin}
              value={profile.template}
              onChange={(e) => updateProfile(profile.id, { template: e.target.value })}
            />
          </Field>
          <Button
            tone="primary"
            disabled={!admin}
            onClick={async () => {
              setMailNote(null);
              if (!profile.emailTo.trim()) {
                setMailOk(false);
                setMailNote("Add an email address first.");
                return;
              }
              const failure = await sendMail({
                to: profile.emailTo.trim(),
                subject: `Certificate alert test · ${customer?.name ?? "Customer"}`,
                text: preview,
                smtp: smtpFromProfile(profile),
              });
              if (failure) {
                setMailOk(false);
                setMailNote(failure);
                return;
              }
              sendTest(profile.id, actor);
              setMailOk(true);
              setMailNote(`Sent to ${profile.emailTo.trim()}.`);
            }}
          >
            Send test email
          </Button>
          <Button
            disabled={!admin}
            onClick={async () => {
              setMailNote(null);
              if (!profile.emailTo.trim()) {
                setMailOk(false);
                setMailNote("Add the address that should receive the SMTP test.");
                return;
              }
              const smtp = smtpFromProfile(profile);
              const failure = await sendMail({
                to: profile.emailTo.trim(),
                subject: `SMTP test · ${customer?.name ?? "Customer"}`,
                text: smtp
                  ? `SMTP test for ${customer?.name ?? "this customer"} using ${smtp.host}:${smtp.port}.`
                  : `SMTP test for ${customer?.name ?? "this customer"} using the host .env.`,
                smtp,
              });
              setMailOk(!failure);
              setMailNote(failure ?? `SMTP accepted a test message for ${profile.emailTo.trim()}${smtp ? ` via ${smtp.host}` : " via the host .env"}.`);
            }}
          >
            Test SMTP
          </Button>
          {mailNote ? <p className={mailOk ? "text-sm text-ok" : "text-sm text-danger"}>{mailNote}</p> : null}
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel title="Adaptive card preview">
          <article className="rounded-md border border-line bg-raised p-4">
            <p className="text-xs text-muted">{profile.teamsChannel}</p>
            <h3 className="mt-1 font-medium">Certificate expiration</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm">{preview}</p>
            <div className="mt-4 flex gap-2">
              <span className="rounded-md bg-brass px-2 py-1 text-xs text-ink">Open in console</span>
              <span className="rounded-md border border-line px-2 py-1 text-xs">Snooze 7 days</span>
            </div>
          </article>
          <p className="mt-3 text-xs text-muted">
            After an Entra sign-in, Send uses that same Microsoft login to ask for permission to post to this group. The card is not sent until that permission is granted.
          </p>
        </Panel>
        <Panel title="Sent">
          {sent.length === 0 ? (
            <p className="text-sm text-muted">No test messages yet.</p>
          ) : (
            <ul className="space-y-3">
              {sent.map((message) => (
                <li key={message.id} className="border-b border-line pb-3 last:border-0">
                  <p className="text-xs text-muted">
                    {formatWhen(message.at)} · {message.channel}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{message.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
