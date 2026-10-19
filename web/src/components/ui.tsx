import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  tone = "default",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "default" | "primary" | "ghost" | "danger" }) {
  const tones = {
    default: "border border-line bg-raised text-fg hover:border-brass",
    primary: "bg-brass font-semibold text-ink hover:opacity-90",
    ghost: "text-muted hover:bg-raised hover:text-fg",
    danger: "border border-danger text-danger hover:bg-danger hover:text-ink",
  } as const;
  return (
    <button
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-brass";

export function Pill({
  tone,
  children,
}: {
  tone: "ok" | "warning" | "critical" | "muted" | "brass";
  children: ReactNode;
}) {
  const tones = {
    ok: "bg-ok/15 text-ok",
    warning: "bg-warn/15 text-warn",
    critical: "bg-danger/15 text-danger",
    muted: "bg-raised text-muted",
    brass: "bg-brass/15 text-brass",
  } as const;
  return (
    <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-md border border-line bg-surface", className)}>
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-medium">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-bg/80 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-md border border-line bg-surface shadow-none">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-medium">{title}</h2>
          <Button tone="ghost" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
