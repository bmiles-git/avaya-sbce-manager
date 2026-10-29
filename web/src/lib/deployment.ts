export interface Deployment {
  mode: "single" | "multiple";
  customerName: string;
}

export async function loadDeployment(): Promise<Deployment> {
  try {
    const response = await fetch("/api/deployment");
    if (!response.ok) return { mode: "multiple", customerName: "" };
    const body = (await response.json()) as { mode?: string; customerName?: string };
    return {
      mode: body.mode === "single" ? "single" : "multiple",
      customerName: String(body.customerName ?? "").trim(),
    };
  } catch {
    return { mode: "multiple", customerName: "" };
  }
}
