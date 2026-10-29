import { useState } from "react";
import { customersFor } from "@/lib/scope";
import { useApp } from "@/lib/store";
import type { Role } from "@/lib/types";
import { Button, Field, inputClass, Panel } from "@/components/ui";

export function UsersView() {
  const session = useApp((s) => s.session);
  const users = useApp((s) => s.users);
  const customers = useApp((s) => s.customers);
  const createUser = useApp((s) => s.createUser);
  const setUserPassword = useApp((s) => s.setUserPassword);
  const updateUser = useApp((s) => s.updateUser);
  const removeUser = useApp((s) => s.removeUser);
  const logoUrl = useApp((s) => s.logoUrl);
  const setLogo = useApp((s) => s.setLogo);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [nextPassword, setNextPassword] = useState("");
  const [logoError, setLogoError] = useState<string | null>(null);
  const visible = customersFor(customers, session?.customerIds);
  const single = useApp((s) => s.customerMode === "single");
  const customerId = useApp((s) => s.selectedCustomerId);

  if (session?.role !== "admin") {
    return <p className="text-sm text-muted">Only an administrator can manage accounts.</p>;
  }

  function toggleCustomer(id: string) {
    setCustomerIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <div className="space-y-4">
      <Panel title="Logo">
        <p className="mb-3 text-sm text-muted">This image replaces the name at the top of the console, the sign-in page, and customer upload links.</p>
        {logoUrl ? <img src={logoUrl} alt="" className="mb-3 h-10 max-w-xs object-contain object-left" /> : null}
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="text-sm"
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 500_000) {
                setLogoError("Use an image under 500 KB.");
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const value = typeof reader.result === "string" ? reader.result : "";
                if (!value.startsWith("data:image/")) {
                  setLogoError("That file is not an image.");
                  return;
                }
                setLogoError(null);
                setLogo(value);
              };
              reader.readAsDataURL(file);
            }}
          />
          {logoUrl ? (
            <Button type="button" tone="ghost" onClick={() => setLogo(null)}>
              Remove logo
            </Button>
          ) : null}
        </div>
        {logoError ? <p className="mt-2 text-sm text-danger">{logoError}</p> : null}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-5">
      <Panel title="Add a user" className="lg:col-span-2">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void createUser({
              username,
              name,
              password,
              role,
              customerIds: single && role === "operator" ? [customerId] : customerIds,
            }).then((message) => {
              setError(message);
              if (!message) {
                setUsername("");
                setName("");
                setPassword("");
                setCustomerIds([]);
              }
            });
          }}
        >
          <Field label="Username">
            <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Password">
            <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Role">
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="operator">Operator</option>
              <option value="admin">Administrator</option>
            </select>
          </Field>
          {single ? (
            <p className="text-xs text-muted">This installation has one customer. An operator is assigned to that customer.</p>
          ) : (
            <fieldset className="space-y-1">
              <legend className="text-xs text-muted">Customers</legend>
              {visible.map((customer) => (
                <label key={customer.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={customerIds.includes(customer.id)} onChange={() => toggleCustomer(customer.id)} />
                  {customer.name}
                </label>
              ))}
              <p className="text-xs text-muted">An administrator with none selected can see every customer. An operator needs at least one.</p>
            </fieldset>
          )}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button tone="primary" type="submit">
            Create user
          </Button>
        </form>
      </Panel>
      <div className="space-y-3 lg:col-span-3">
        {users.map((user) => {
          const assigned = user.customerIds.length
            ? user.customerIds.map((id) => customers.find((item) => item.id === id)?.name ?? id).join(", ")
            : "All customers";
          return (
            <Panel key={user.id} title={user.username} action={<span className="text-xs text-muted">{user.role}</span>}>
              <p className="text-sm">{user.name}</p>
              <p className="mt-1 text-sm text-muted">{single ? "This customer" : assigned}</p>
              {single ? null : (
              <div className="mt-3 flex flex-wrap gap-2">
                {visible.map((customer) => {
                  const on = user.customerIds.includes(customer.id);
                  return (
                    <Button
                      key={customer.id}
                      tone={on ? "primary" : "ghost"}
                      onClick={() => {
                        const customerIds = on ? user.customerIds.filter((id) => id !== customer.id) : [...user.customerIds, customer.id];
                        setError(updateUser(user.id, { customerIds }));
                      }}
                    >
                      {customer.name}
                    </Button>
                  );
                })}
              </div>
              )}
              {passwordFor === user.id ? (
                <form
                  className="mt-3 flex flex-wrap items-end gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void setUserPassword(user.id, nextPassword).then((message) => {
                      setError(message);
                      if (!message) {
                        setPasswordFor(null);
                        setNextPassword("");
                      }
                    });
                  }}
                >
                  <Field label="New password">
                    <input className={inputClass} type="password" value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} autoComplete="new-password" />
                  </Field>
                  <Button tone="primary" type="submit">
                    Save password
                  </Button>
                </form>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Button tone="ghost" onClick={() => { setPasswordFor(user.id); setNextPassword(""); setError(null); }}>
                    Set password
                  </Button>
                  <Button tone="danger" onClick={() => setError(removeUser(user.id))} disabled={user.username === session.username}>
                    Remove
                  </Button>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
