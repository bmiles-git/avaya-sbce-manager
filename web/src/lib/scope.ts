import type { Device, Site } from "@/lib/types";

export function devicesFor(sites: Site[], devices: Device[], customerId: string | null): Device[] {
  const siteIds = new Set(sites.filter((site) => site.customerId === customerId).map((site) => site.id));
  return devices.filter((device) => siteIds.has(device.siteId));
}
