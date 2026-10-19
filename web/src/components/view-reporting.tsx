import { formatWhen } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Button, Field, inputClass, Panel } from "@/components/ui";

export function Reporting() {
  const profiles = useApp((s) => s.profiles);
  const updateProfile = useApp((s) => s.updateProfile);
  const sendTest = useApp((s) => s.sendTest);
  const messages = useApp((s) => s.messages);
  const actor = useApp((s) => s.session?.name ?? "admin");
  const admin = useApp((s) => s.session?.role === "admin");
  const profile = profiles[0];
  if (!profile) return null;

  const preview = profile.template
    .replaceAll("{{severity}}", "Warning")
    .replaceAll("{{customer.name}}", "UMCSN")
    .replaceAll("{{site.name}}", "SDC")
    .replaceAll("{{device.name}}", "UMCSN-SBCE-B1")
    .replaceAll("{{cert.name}}", "trunk-genesis")
    .replaceAll("{{cert.expires}}", "in 4 days")
    .replaceAll("{{cert.days_remaining}}", "4")
    .replaceAll("{{tls_profiles}}", "TLS-Trunk-Genesis");

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
          <Button tone="primary" disabled={!admin} onClick={() => sendTest(profile.id, actor)}>
            Send test notification
          </Button>
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
            Production posts this card with MSAL delegated permissions to an existing channel. This preview does not call Graph.
          </p>
        </Panel>
        <Panel title="Sent">
          {messages.length === 0 ? (
            <p className="text-sm text-muted">No test messages yet.</p>
          ) : (
            <ul className="space-y-3">
              {messages.map((message) => (
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
