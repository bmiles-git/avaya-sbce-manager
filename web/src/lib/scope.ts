import type { Device, Site } from "@/lib/types";

export function haPeer(devices: Device[], device: Device | undefined) {
  if (!device?.haPairId) return undefined;
  return devices.find((item) => item.haPairId === device.haPairId && item.id !== device.id);
}

export function isHaStandby(device: Device | undefined) {
  return device?.role === "ha-standby";
}

export function devicesFor(sites: Site[], devices: Device[], customerId: string | null): Device[] {
  const siteIds = new Set(sites.filter((site) => site.customerId === customerId).map((site) => site.id));
  return devices.filter((device) => siteIds.has(device.siteId));
}
