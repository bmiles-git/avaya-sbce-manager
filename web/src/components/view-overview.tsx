import { daysLeft, formatDay, severityOf } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Panel, Pill } from "@/components/ui";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

export function Overview() {
  const certs = useApp((s) => s.certs);
  const devices = useApp((s) => s.devices);
  const requests = useApp((s) => s.requests);
  const audits = useApp((s) => s.audits);
  const profiles = useApp((s) => s.profiles);
  const acks = useApp((s) => s.acks);
  const ackAlert = useApp((s) => s.ackAlert);
  const openCert = useApp((s) => s.openCert);
  const setView = useApp((s) => s.setView);
  const profile = profiles[0];
  const warn = profile?.warnDays ?? 30;
  const critical = profile?.criticalDays ?? 7;

  const buckets = [
    { name: "≤7d", count: certs.filter((c) => daysLeft(c.notAfter) <= critical).length },
    { name: "8–30d", count: certs.filter((c) => daysLeft(c.notAfter) > critical && daysLeft(c.notAfter) <= warn).length },
    { name: "Later", count: certs.filter((c) => daysLeft(c.notAfter) > warn).length },
  ];

  const upcoming = [...certs]
    .filter((c) => c.kind === "identity")
    .sort((a, b) => daysLeft(a.notAfter) - daysLeft(b.notAfter))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Devices", String(devices.length), "inventory"],
          ["Critical certs", String(buckets[0].count), "certificates"],
          ["Open requests", String(requests.filter((r) => !["completed", "cancelled"].includes(r.status)).length), "requests"],
          ["Locked", String(devices.filter((d) => d.locked).length), "inventory"],
        ].map(([label, value, view]) => (
          <button
            key={label}
            onClick={() => setView(view as "inventory")}
            className="rounded-md border border-line bg-surface px-4 py-3 text-left hover:border-brass"
          >
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 font-mono text-2xl">{value}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="Expiration window" className="lg:col-span-2">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets}>
                <XAxis dataKey="name" stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} stroke="var(--color-muted)" fontSize={12} tickLine={false} axisLine={false} width={24} />
                <Bar dataKey="count" fill="var(--color-brass)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Needs attention" className="lg:col-span-3" action={<span className="text-xs text-muted">Identity certificates</span>}>
          <ul className="divide-y divide-line">
            {upcoming.map((cert) => {
              const device = devices.find((d) => d.id === cert.deviceId);
              const tone = severityOf(cert.notAfter, warn, critical);
              const key = cert.id;
              return (
                <li key={cert.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    className="min-h-11 min-w-0 flex-1 rounded-md px-2 text-left hover:bg-raised"
                    onClick={() => openCert(cert.id)}
                  >
                    <p className="text-sm">{device?.name}</p>
                    <p className="text-xs text-muted">
                      {cert.name} · {formatDay(cert.notAfter)} · {daysLeft(cert.notAfter)} days
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    <Pill tone={tone}>{tone}</Pill>
                    <button
                      className="text-xs text-brass disabled:text-muted"
                      disabled={acks.includes(key)}
                      onClick={() => ackAlert(key)}
                    >
                      {acks.includes(key) ? "Acked" : "Acknowledge"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel title="Recent audit">
        <ul className="space-y-2">
          {audits.slice(0, 4).map((event) => (
            <li key={event.id} className="flex flex-wrap justify-between gap-2 text-sm">
              <span>
                <span className="font-mono text-xs text-brass">{event.action}</span>
                <span className="mx-2 text-muted">{event.target}</span>
              </span>
              <span className="text-xs text-muted">{event.actor}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
