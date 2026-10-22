export interface ParsedZone {
  id: string;
  name: string;
  zone_type: "hazard" | "work" | "safe" | "excavation" | "scaffolding" | string;
  risk_level: "high" | "medium" | "low" | string;
  color: string;
  coordinates: [number, number][]; // [lat, lng][]
  requires_hard_hat: boolean;
  requires_vest: boolean;
  area_sqm?: number;
  cameras_count?: number;
  sensors_count?: number;
  active_workers?: number;
  safety_score?: number;
}

export interface ParsedSensorNode {
  id: string;
  name: string;
  code: string;
  zone_id?: string;
  zone_name?: string;
  sensor_type: string;
  lat: number;
  lng: number;
  unit: string;
  status: string;
  battery_level?: number;
  value: number | null; // null = no reading yet
  min_threshold?: number;
  max_threshold?: number;
  history?: number[];
  trend?: "stable" | "rising" | "falling";
  description?: string;
}

export interface ParsedCameraNode {
  id: string;
  name: string;
  code: string;
  zone_id?: string;
  zone_name?: string;
  lat: number;
  lng: number;
  status: string;
  fps?: number;
  resolution?: string;
  video_url: string;
  is_cv_enabled?: boolean;
  workers_detected?: number;
  ppe_compliance_pct?: number;
  active_hazards?: string[];
}

export interface NormalizedSiteMap {
  site_id: string;
  site_name: string;
  center: [number, number]; // [lat, lng]
  zoom: number;
  boundary: [number, number][]; // [lat, lng][]
  zones: ParsedZone[];
  sensors: ParsedSensorNode[];
  cameras: ParsedCameraNode[];
}

// 8 Verified Local Construction Video Feeds
export const LOCAL_CONSTRUCTION_VIDEOS = [
  "/videos/19241054-hd_1920_1080_30fps.mp4",
  "/videos/19832492-hd_1920_1080_25fps.mp4",
  "/videos/5674342-hd_1920_1080_30fps.mp4",
  "/videos/13751987_3840_2160_50fps.mp4",
  "/videos/12229456_3840_2160_24fps.mp4",
  "/videos/8792814-uhd_3840_2160_30fps.mp4",
  "/videos/13387809_2160_3840_60fps.mp4",
  "/videos/13261762_3840_2160_24fps.mp4",
];

// Convert GeoJSON [lng, lat] coordinate to Leaflet [lat, lng]
export function toLatLng(coord: any): [number, number] {
  if (Array.isArray(coord) && coord.length >= 2) {
    const a = Number(coord[0]);
    const b = Number(coord[1]);
    // Heuristic: If coordinate 0 is longitude (> 50 in India/Asia) and coord 1 is latitude (< 40)
    if (a > 50 && b < 40) {
      return [b, a];
    }
    // If coordinate 0 is already latitude (< 40) and coord 1 is longitude (> 50)
    if (a < 40 && b > 50) {
      return [a, b];
    }
    // Standard GeoJSON [lng, lat] -> [lat, lng]
    return [b, a];
  }
  return [28.5562, 77.1000];
}

// Ray-casting point-in-polygon helper
export function isPointInPolygon(pt: [number, number], poly: [number, number][]): boolean {
  if (!poly || poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
      (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Shown when the backend returns no map: an empty site, never invented assets
export const EMPTY_SITE_MAP: NormalizedSiteMap = {
  site_id: "",
  site_name: "",
  center: [28.5562, 77.1], // viewport only
  zoom: 16,
  boundary: [],
  zones: [],
  sensors: [],
  cameras: [],
};

/** Approximate area of a small [lat, lng] polygon in m² (equirectangular projection + shoelace). */
export function polygonAreaSqm(coords: [number, number][]): number | undefined {
  if (coords.length < 3) return undefined;
  const R = 6371008.8;
  const lat0 = (coords.reduce((acc, c) => acc + c[0], 0) / coords.length) * (Math.PI / 180);
  const pts = coords.map(([lat, lng]) => [
    R * lng * (Math.PI / 180) * Math.cos(lat0),
    R * lat * (Math.PI / 180),
  ]);
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.round(Math.abs(sum) / 2);
}

export function normalizeSiteMapData(raw: any): NormalizedSiteMap {
  if (!raw) return EMPTY_SITE_MAP;

  let center: [number, number] = EMPTY_SITE_MAP.center;
  if (raw.center) {
    center = toLatLng(raw.center);
  }

  // Parse GeoJSON FeatureCollection from backend /api/v1/sites/{site_id}/map
  if (Array.isArray(raw.features) && raw.features.length > 0) {
    let boundary: [number, number][] = EMPTY_SITE_MAP.boundary;
    const zones: ParsedZone[] = [];
    const sensors: ParsedSensorNode[] = [];
    const cameras: ParsedCameraNode[] = [];

    for (const f of raw.features) {
      const layer = f.properties?.layer;
      const geom = f.geometry;

      if (!geom) continue;

      if (layer === "site_boundary" && geom.type === "Polygon") {
        const ring = geom.coordinates?.[0];
        if (Array.isArray(ring)) {
          boundary = ring.map(toLatLng);
        }
      } else if (layer === "zone" && geom.type === "Polygon") {
        const ring = geom.coordinates?.[0];
        if (Array.isArray(ring)) {
          const zCoords = ring.map(toLatLng);
          const zType = f.properties?.zone_type || "work";
          const rLevel = f.properties?.risk_level || (zType === "hazard" ? "high" : "medium");
          const color =
            rLevel === "high" || zType === "hazard" || zType === "excavation"
              ? "#ef4444"
              : zType === "safe"
              ? "#10b981"
              : "#f59e0b";

          zones.push({
            id: String(f.id || f.properties?.id || `zone-${zones.length + 1}`),
            name: f.properties?.name || `Zone ${zones.length + 1}`,
            zone_type: zType,
            risk_level: rLevel,
            color,
            coordinates: zCoords,
            requires_hard_hat: zType !== "safe",
            requires_vest: true,
            area_sqm: polygonAreaSqm(zCoords),
          });
        }
      } else if (layer === "sensor" && geom.type === "Point") {
        const pt = toLatLng(geom.coordinates);
        const sType = f.properties?.sensor_type || "generic";
        const rawVal = f.properties?.value;
        const val = rawVal === null || rawVal === undefined ? null : Number(rawVal);
        sensors.push({
          id: String(f.id || `sensor-${sensors.length + 1}`),
          name: f.properties?.name || "Sensor",
          code: f.properties?.code || `S-0${sensors.length + 1}`,
          zone_id: f.properties?.zone_id,
          sensor_type: sType,
          lat: pt[0],
          lng: pt[1],
          unit: f.properties?.unit || (sType === "temperature" ? "°C" : sType === "gas" ? "ppm" : sType === "vibration" ? "mm/s" : "dB"),
          status: f.properties?.status || "active",
          battery_level: f.properties?.battery_level ?? undefined,
          value: val,
          min_threshold: f.properties?.min_threshold ?? undefined,
          max_threshold: f.properties?.max_threshold ?? undefined,
          history: Array.isArray(f.properties?.history) ? f.properties.history : [],
        });
      } else if (layer === "camera" && geom.type === "Point") {
        const pt = toLatLng(geom.coordinates);
        const videoUrl = f.properties?.stream_url || "";
        cameras.push({
          id: String(f.id || `cam-${cameras.length + 1}`),
          name: f.properties?.name || `CAM-0${cameras.length + 1}: Site Stream`,
          code: f.properties?.code || `CAM-0${cameras.length + 1}`,
          zone_id: f.properties?.zone_id,
          lat: pt[0],
          lng: pt[1],
          status: f.properties?.status || "streaming",
          fps: f.properties?.fps ?? undefined,
          resolution: f.properties?.resolution,
          video_url: videoUrl,
          is_cv_enabled: f.properties?.is_cv_enabled ?? false,
          active_hazards: [],
        });
      }
    }

    // Associate cameras & sensors with zones via point-in-polygon if zone_id wasn't assigned
    const finalZones = zones;
    const finalCameras = cameras;
    const finalSensors = sensors;

    // Cross-link zones, cameras, and sensors
    finalCameras.forEach((cam) => {
      if (!cam.zone_id) {
        const match = finalZones.find((z) => isPointInPolygon([cam.lat, cam.lng], z.coordinates));
        if (match) {
          cam.zone_id = match.id;
          cam.zone_name = match.name;
        }
      } else {
        const match = finalZones.find((z) => z.id === cam.zone_id);
        if (match) cam.zone_name = match.name;
      }
    });

    finalSensors.forEach((s) => {
      if (!s.zone_id) {
        const match = finalZones.find((z) => isPointInPolygon([s.lat, s.lng], z.coordinates));
        if (match) {
          s.zone_id = match.id;
          s.zone_name = match.name;
        }
      } else {
        const match = finalZones.find((z) => z.id === s.zone_id);
        if (match) s.zone_name = match.name;
      }
    });

    finalZones.forEach((z) => {
      z.cameras_count = finalCameras.filter((c) => c.zone_id === z.id).length;
      z.sensors_count = finalSensors.filter((s) => s.zone_id === z.id).length;
    });

    return {
      site_id: raw.site_id || "",
      site_name: raw.site_name || "",
      center,
      zoom: raw.zoom || 17,
      boundary,
      zones: finalZones,
      sensors: finalSensors,
      cameras: finalCameras,
    };
  }

  return EMPTY_SITE_MAP;
}
