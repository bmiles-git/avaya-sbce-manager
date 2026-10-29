import { useApp } from "@/lib/store";

export function BrandMark({ tone = "ink" }: { tone?: "ink" | "paper" }) {
  const logoUrl = useApp((s) => s.logoUrl);
  if (logoUrl) {
    return <img src={logoUrl} alt="" className="h-8 max-w-[11rem] object-contain object-left" />;
  }
  return (
    <p className={tone === "paper" ? "text-sm font-semibold tracking-tight text-paper" : "text-sm font-semibold tracking-tight"}>
      SBCE Control
    </p>
  );
}
