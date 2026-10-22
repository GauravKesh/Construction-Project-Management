import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeList<T = any>(data: any): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  if (data.data && Array.isArray(data.data.items)) return data.data.items;
  if (data.data && Array.isArray(data.data.data)) return data.data.data;
  if (Array.isArray(data.rules)) return data.rules;
  if (Array.isArray(data.incidents)) return data.incidents;
  if (Array.isArray(data.alerts)) return data.alerts;
  if (Array.isArray(data.sensors)) return data.sensors;
  if (Array.isArray(data.cameras)) return data.cameras;
  if (Array.isArray(data.users)) return data.users;
  if (Array.isArray(data.projects)) return data.projects;
  if (Array.isArray(data.violations)) return data.violations;
  if (Array.isArray(data.zones)) return data.zones;
  return [];
}
