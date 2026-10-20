import { useEffect, useRef } from "react";
import {
  Activity,
  Bell,
  FileKey,
  History,
  LayoutDashboard,
  LogOut,
  Network,
  Server,
  Shield,
  Users,
} from "lucide-react";
import { useApp } from "@/lib/store";
import type { ViewId } from "@/lib/types";
import { Button, cx } from "@/components/ui";
import { Overview } from "@/components/view-overview";
import { Inventory } from "@/components/view-inventory";
import { Certificates } from "@/components/view-certs";
import { Requests } from "@/components/view-requests";
import { Reporting } from "@/components/view-reporting";
import { AccessView, AuditView, Snapshots } from "@/components/view-ops";
import { UsersView } from "@/components/view-users";
import { customersFor } from "@/lib/scope";

const NAV: { id: ViewId; label: string; icon: typeof Server }[] = [
  { id: "inventory", label: "Devices", icon: Server },
  { id: "certificates", label: "Certificates", icon: Shield },
  { id: "requests", label: "CSR requests", icon: FileKey },
  { id: "reporting", label: "Reporting", icon: Bell },
  { id: "snapshots", label: "Snapshots", icon: History },
  { id: "access", label: "VPN / SAL", icon: Network },
  { id: "audit", label: "Audit", icon: Activity },
  { id: "users", label: "Users", icon: Users },
];

export function Console() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const session = useApp((s) => s.session);
  const customers = useApp((s) => s.customers);
  const customerId = useApp((s) => s.selectedCustomerId);
  const selectCustomer = useApp((s) => s.selectCustomer);
  const signOut = useApp((s) => s.signOut);
  const resetDemo = useApp((s) => s.resetDemo);
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  const armed = useRef(new Set<string>());
  useEffect(() => {
    for (const item of toasts) {
      if (armed.current.has(item.id)) continue;
      armed.current.add(item.id);
      window.setTimeout(() => dismiss(item.id), 15000);
    }
  }, [toasts, dismiss]);
  const customer = customers.find((item) => item.id === customerId) ?? null;
  const visibleCustomers = customersFor(customers, session?.customerIds);
  const nav = NAV.filter((item) => item.id !== "users" || session?.role === "admin");
  const page = view === "overview" ? "Alarms" : (NAV.find((item) => item.id === view)?.label ?? "SBCE Control");

  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-paper/10 bg-slate text-paper md:flex">
          <div className="px-4 py-4">
            <img src="/gage-logo-light.svg" alt="Gage Technologies" className="h-8 w-auto" />
            <p className="mt-2 text-xs text-paper/60">SBCE Control</p>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-2">
            <button
              onClick={() => setView("overview")}
              className={cx(
                "flex min-h-11 items-center gap-2 rounded-md px-3 text-left text-sm",
                view === "overview" ? "bg-paper/15 text-paper" : "text-paper/70 hover:bg-paper/10 hover:text-paper",
              )}
            >
              <LayoutDashboard size={16} />
              Alarms
            </button>
            <p className="mt-4 px-3 text-[10px] uppercase tracking-wide text-paper/50">Customer</p>
            <select
              className="mb-2 min-h-11 rounded-md border border-paper/20 bg-slate px-2 text-sm text-paper"
              value={customerId}
              onChange={(e) => selectCustomer(e.target.value)}
            >
              {visibleCustomers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {nav.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={cx(
                    "flex min-h-11 items-center gap-2 rounded-md px-3 text-left text-sm",
                    active ? "bg-paper/15 text-paper" : "text-paper/70 hover:bg-paper/10 hover:text-paper",
                  )}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="border-t border-paper/10 px-4 py-3">
            <p className="truncate text-sm text-paper">{session?.name}</p>
            <p className="truncate font-mono text-xs text-paper/70">{session?.username}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-paper/50">
              {session?.mode === "entra" ? "Entra ID" : "Local"} · port {session?.port}
            </p>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
            <div className="flex items-center gap-3">
              <img src="/gage-logo.svg" alt="Gage Technologies" className="h-8 w-auto md:hidden" />
              <div>
                <p className="text-sm font-medium">{page}</p>
                <p className="text-xs text-muted">
                  {view === "overview"
                    ? "All customers"
                    : `${customer?.name ?? "No customer"} · ${customer?.timezone ?? ""}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm">{session?.name}</p>
                <p className="font-mono text-xs text-muted">{session?.username}</p>
              </div>
              <Button tone="ghost" onClick={resetDemo}>
                Reset demo
              </Button>
              <Button tone="ghost" onClick={signOut}>
                <LogOut size={16} />
                Sign out
              </Button>
            </div>
          </header>
          <div className="flex flex-col gap-2 border-b border-line px-2 py-2 md:hidden">
            <select
              className="min-h-11 rounded-md border border-line bg-surface px-2 text-sm"
              value={customerId}
              onChange={(e) => selectCustomer(e.target.value)}
            >
              {visibleCustomers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2 overflow-x-auto">
              <button
                onClick={() => setView("overview")}
                className={cx(
                  "shrink-0 rounded-md px-3 py-2 text-sm",
                  view === "overview" ? "bg-brass text-ink" : "bg-surface text-muted",
                )}
              >
                Alarms
              </button>
              {nav.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={cx(
                    "shrink-0 rounded-md px-3 py-2 text-sm",
                    view === item.id ? "bg-brass text-ink" : "bg-surface text-muted",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <main className="flex-1 p-4 md:p-6">
            {view === "overview" ? <Overview /> : null}
            {view === "inventory" ? <Inventory /> : null}
            {view === "certificates" ? <Certificates /> : null}
            {view === "requests" ? <Requests /> : null}
            {view === "reporting" ? <Reporting /> : null}
            {view === "snapshots" ? <Snapshots /> : null}
            {view === "access" ? <AccessView /> : null}
            {view === "audit" ? <AuditView /> : null}
            {view === "users" ? <UsersView /> : null}
          </main>
        </div>
      </div>
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.slice(0, 3).map((item) => (
          <button
            key={item.id}
            onClick={() => dismiss(item.id)}
            className={cx(
              "pointer-events-auto rounded-md border px-3 py-2 text-left text-sm",
              item.tone === "ok" && "border-ok bg-surface text-fg",
              item.tone === "warn" && "border-warn bg-surface",
              item.tone === "danger" && "border-danger bg-surface",
            )}
          >
            {item.text}
          </button>
        ))}
      </div>
    </div>
  );
}
