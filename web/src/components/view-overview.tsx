import { daysLeft, formatDay, severityOf } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Panel, Pill } from "@/components/ui";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

export function Overview() {
  const certs = useApp((s) => s.certs);
  const devices = useApp((s) => s.devices);
  const sites = useApp((s) => s.sites);
  const customers = useApp((s) => s.customers);
  const profiles = useApp((s) => s.profiles);
  const acks = useApp((s) => s.acks);
  const ackAlert = useApp((s) => s.ackAlert);
  const openCert = useApp((s) => s.openCert);

  const rows = certs
    .filter((cert) => cert.kind === "identity")
    .map((cert) => {
      const device = devices.find((item) => item.id === cert.deviceId);
      const site = sites.find((item) => item.id === device?.siteId);
      const customer = customers.find((item) => item.id === site?.customerId);
      const profile = profiles.find((item) => item.customerId === customer?.id);
      const warn = profile?.warnDays ?? 30;
      const critical = profile?.criticalDays ?? 7;
      return { cert, device, site, customer, warn, critical, left: daysLeft(cert.notAfter) };
    })
    .filter((row) => row.left <= row.warn)
    .sort((a, b) => a.left - b.left);

  const buckets = [
    { name: "≤7d", count: rows.filter((row) => row.left <= 7).length },
    { name: "8–30d", count: rows.filter((row) => row.left > 7 && row.left <= 30).length },
    { name: "Inside window", count: rows.filter((row) => row.left > 30).length },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Blended across every customer. Opening an alarm switches into that customer.
      </p>
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="All customers" className="lg:col-span-2">
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
        <Panel
          title="Alarms"
          className="lg:col-span-3"
          action={<span className="text-xs text-muted">{rows.length} open</span>}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted">Nothing is inside a customer warning window.</p>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((row) => {
                const tone = severityOf(row.cert.notAfter, row.warn, row.critical);
                return (
                  <li key={row.cert.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                    <button
                      type="button"
                      className="min-h-11 min-w-0 flex-1 rounded-md px-2 text-left hover:bg-raised"
                      onClick={() => openCert(row.cert.id)}
                    >
                      <p className="text-sm">
                        {row.customer?.name} · {row.device?.name}
                      </p>
                      <p className="text-xs text-muted">
                        {row.site?.name} · {row.cert.name} · {formatDay(row.cert.notAfter)} · {row.left} days
                      </p>
                    </button>
                    <div className="flex items-center gap-2">
                      <Pill tone={tone}>{tone}</Pill>
                      <button
                        className="text-xs text-brass disabled:text-muted"
                        disabled={acks.includes(row.cert.id)}
                        onClick={() => ackAlert(row.cert.id)}
                      >
                        {acks.includes(row.cert.id) ? "Acked" : "Acknowledge"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
