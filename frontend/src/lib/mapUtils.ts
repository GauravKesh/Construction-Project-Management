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
  value: number;
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
  fps: number;
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

// Default fallback construction site data
export const DEFAULT_SITE_MAP: NormalizedSiteMap = {
  site_id: "0907d5cb-7682-48b7-b78d-c999ce138f34",
  site_name: "Terminal 3 East Wing Capital Site",
  center: [28.5562, 77.1000],
  zoom: 17,
  boundary: [
    [28.5540, 77.0980],
    [28.5540, 77.1020],
    [28.5580, 77.1020],
    [28.5580, 77.0980],
  ],
  zones: [
    {
      id: "zone-1",
      name: "Excavation Pit Sector 4",
      zone_type: "hazard",
      risk_level: "high",
      color: "#ef4444",
      coordinates: [
        [28.5545, 77.0985],
        [28.5545, 77.1000],
        [28.5560, 77.1000],
        [28.5560, 77.0985],
      ],
      requires_hard_hat: true,
      requires_vest: true,
      area_sqm: 2450,
      active_workers: 18,
      safety_score: 96.5,
    },
    {
      id: "zone-2",
      name: "Scaffolding Facade Zone B",
      zone_type: "work",
      risk_level: "medium",
      color: "#f59e0b",
      coordinates: [
        [28.5562, 77.1002],
        [28.5562, 77.1018],
        [28.5578, 77.1018],
        [28.5578, 77.1002],
      ],
      requires_hard_hat: true,
      requires_vest: true,
      area_sqm: 1820,
      active_workers: 12,
      safety_score: 98.8,
    },
    {
      id: "zone-3",
      name: "Logistics Yard & Heavy Plant Depot",
      zone_type: "safe",
      risk_level: "low",
      color: "#10b981",
      coordinates: [
        [28.5542, 77.1002],
        [28.5542, 77.1018],
        [28.5558, 77.1018],
        [28.5558, 77.1002],
      ],
      requires_hard_hat: false,
      requires_vest: true,
      area_sqm: 3100,
      active_workers: 8,
      safety_score: 100.0,
    },
    {
      id: "zone-4",
      name: "Superstructure Tower Core & Jumpform",
      zone_type: "hazard",
      risk_level: "high",
      color: "#8b5cf6",
      coordinates: [
        [28.5565, 77.0982],
        [28.5565, 77.0998],
        [28.5578, 77.0998],
        [28.5578, 77.0982],
      ],
      requires_hard_hat: true,
      requires_vest: true,
      area_sqm: 1650,
      active_workers: 24,
      safety_score: 94.2,
    },
  ],
  sensors: [
    {
      id: "s-1",
      name: "Ambient Concrete Temp Sensor",
      code: "TEMP-001",
      zone_id: "zone-1",
      zone_name: "Excavation Pit Sector 4",
      sensor_type: "temperature",
      lat: 28.5550,
      lng: 77.0990,
      unit: "°C",
      status: "active",
      battery_level: 95,
      value: 29.4,
      min_threshold: 10.0,
      max_threshold: 42.0,
      history: [27.8, 28.1, 28.3, 28.6, 28.9, 29.1, 29.3, 29.4, 29.4, 29.5],
      trend: "rising",
      description: "Curing mass concrete core thermal gradient monitoring node.",
    },
    {
      id: "s-2",
      name: "Sub-surface Hazardous Gas Detector",
      code: "GAS-001",
      zone_id: "zone-1",
      zone_name: "Excavation Pit Sector 4",
      sensor_type: "gas",
      lat: 28.5555,
      lng: 77.0995,
      unit: "ppm",
      status: "active",
      battery_level: 88,
      value: 12.8,
      min_threshold: 0.0,
      max_threshold: 50.0,
      history: [8.5, 9.2, 10.1, 11.4, 11.8, 12.0, 12.4, 12.6, 12.7, 12.8],
      trend: "stable",
      description: "Confined space basement methane (CH4) and hydrogen sulfide (H2S) telemetry.",
    },
    {
      id: "s-3",
      name: "Sheet Pile Vibration Monitor",
      code: "VIB-001",
      zone_id: "zone-2",
      zone_name: "Scaffolding Facade Zone B",
      sensor_type: "vibration",
      lat: 28.5565,
      lng: 77.1005,
      unit: "mm/s",
      status: "active",
      battery_level: 92,
      value: 2.4,
      min_threshold: 0.0,
      max_threshold: 15.0,
      history: [1.2, 1.8, 3.1, 2.7, 2.2, 1.9, 2.8, 3.4, 2.6, 2.4],
      trend: "stable",
      description: "Tri-axial geophone accelerometer measuring sheet pile structural excitation.",
    },
    {
      id: "s-4",
      name: "Perimeter Acoustic Sound Meter",
      code: "NOISE-001",
      zone_id: "zone-2",
      zone_name: "Scaffolding Facade Zone B",
      sensor_type: "noise",
      lat: 28.5570,
      lng: 77.1010,
      unit: "dB",
      status: "active",
      battery_level: 97,
      value: 71.5,
      min_threshold: 30.0,
      max_threshold: 85.0,
      history: [68.0, 69.5, 73.0, 75.4, 72.1, 70.8, 69.4, 72.8, 71.0, 71.5],
      trend: "stable",
      description: "Environmental boundary noise pollution compliance dosimeter.",
    },
  ],
  cameras: [
    {
      id: "cam-01",
      name: "CAM-01: Main Concourse & Gate",
      code: "CAM-01",
      zone_id: "zone-1",
      zone_name: "Excavation Pit Sector 4",
      lat: 28.5546,
      lng: 77.0986,
      status: "streaming",
      fps: 30,
      resolution: "1080p @ 30fps",
      video_url: "/videos/19241054-hd_1920_1080_30fps.mp4",
      is_cv_enabled: true,
      workers_detected: 6,
      ppe_compliance_pct: 100,
      active_hazards: ["Heavy Vehicle Reversing"],
    },
    {
      id: "cam-02",
      name: "CAM-02: Tower Crane Mast & Hook",
      code: "CAM-02",
      zone_id: "zone-1",
      zone_name: "Excavation Pit Sector 4",
      lat: 28.5552,
      lng: 77.0992,
      status: "streaming",
      fps: 25,
      resolution: "1080p @ 25fps",
      video_url: "/videos/19832492-hd_1920_1080_25fps.mp4",
      is_cv_enabled: true,
      workers_detected: 4,
      ppe_compliance_pct: 100,
      active_hazards: ["Suspended Load Overhead"],
    },
    {
      id: "cam-03",
      name: "CAM-03: Excavation & Structural Foundation",
      code: "CAM-03",
      zone_id: "zone-1",
      zone_name: "Excavation Pit Sector 4",
      lat: 28.5558,
      lng: 77.0995,
      status: "streaming",
      fps: 30,
      resolution: "1080p @ 30fps",
      video_url: "/videos/5674342-hd_1920_1080_30fps.mp4",
      is_cv_enabled: true,
      workers_detected: 8,
      ppe_compliance_pct: 94,
      active_hazards: ["Deep Trench Proximity"],
    },
    {
      id: "cam-04",
      name: "CAM-04: High-Rise Superstructure & Deck",
      code: "CAM-04",
      zone_id: "zone-2",
      zone_name: "Scaffolding Facade Zone B",
      lat: 28.5565,
      lng: 77.1005,
      status: "streaming",
      fps: 50,
      resolution: "4K UHD @ 50fps",
      video_url: "/videos/13751987_3840_2160_50fps.mp4",
      is_cv_enabled: true,
      workers_detected: 14,
      ppe_compliance_pct: 98,
      active_hazards: ["Fall Arrest Harness Verified"],
    },
    {
      id: "cam-05",
      name: "CAM-05: Heavy Earthmoving & Fleet Depot",
      code: "CAM-05",
      zone_id: "zone-3",
      zone_name: "Logistics Yard & Heavy Plant Depot",
      lat: 28.5548,
      lng: 77.0990,
      status: "streaming",
      fps: 24,
      resolution: "4K UHD @ 24fps",
      video_url: "/videos/12229456_3840_2160_24fps.mp4",
      is_cv_enabled: true,
      workers_detected: 5,
      ppe_compliance_pct: 100,
      active_hazards: ["Excavator Track Rotation"],
    },
    {
      id: "cam-06",
      name: "CAM-06: Scaffold Perimeter & Safety Netting",
      code: "CAM-06",
      zone_id: "zone-2",
      zone_name: "Scaffolding Facade Zone B",
      lat: 28.5572,
      lng: 77.1012,
      status: "streaming",
      fps: 30,
      resolution: "4K UHD @ 30fps",
      video_url: "/videos/8792814-uhd_3840_2160_30fps.mp4",
      is_cv_enabled: true,
      workers_detected: 7,
      ppe_compliance_pct: 100,
      active_hazards: ["Tie-off Anchor Active"],
    },
    {
      id: "cam-07",
      name: "CAM-07: Vertical Slipform Core & Hoist Shaft",
      code: "CAM-07",
      zone_id: "zone-4",
      zone_name: "Superstructure Tower Core & Jumpform",
      lat: 28.5568,
      lng: 77.1008,
      status: "streaming",
      fps: 60,
      resolution: "4K @ 60fps",
      video_url: "/videos/13387809_2160_3840_60fps.mp4",
      is_cv_enabled: true,
      workers_detected: 11,
      ppe_compliance_pct: 92,
      active_hazards: ["Hoist Gate Interlock OK"],
    },
    {
      id: "cam-08",
      name: "CAM-08: Structural Steel Assembly & Deck",
      code: "CAM-08",
      zone_id: "zone-4",
      zone_name: "Superstructure Tower Core & Jumpform",
      lat: 28.5575,
      lng: 77.1015,
      status: "streaming",
      fps: 24,
      resolution: "4K UHD @ 24fps",
      video_url: "/videos/13261762_3840_2160_24fps.mp4",
      is_cv_enabled: true,
      workers_detected: 9,
      ppe_compliance_pct: 100,
      active_hazards: ["Hot Work Permit Active"],
    },
  ],
};

// Normalize raw API payload (GeoJSON FeatureCollection or structured dict)
export function normalizeSiteMapData(raw: any): NormalizedSiteMap {
  if (!raw) return DEFAULT_SITE_MAP;

  let center: [number, number] = DEFAULT_SITE_MAP.center;
  if (raw.center) {
    center = toLatLng(raw.center);
  }

  // Parse GeoJSON FeatureCollection from backend /api/v1/sites/{site_id}/map
  if (Array.isArray(raw.features) && raw.features.length > 0) {
    let boundary: [number, number][] = DEFAULT_SITE_MAP.boundary;
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
            area_sqm: Math.round(zCoords.length * 450),
            active_workers: Math.floor(Math.random() * 12) + 5,
            safety_score: rLevel === "high" ? 95.4 : 99.2,
          });
        }
      } else if (layer === "sensor" && geom.type === "Point") {
        const pt = toLatLng(geom.coordinates);
        const sType = f.properties?.sensor_type || "generic";
        const val =
          f.properties?.value ??
          (sType === "temperature" ? 29.4 : sType === "gas" ? 12.8 : sType === "vibration" ? 2.4 : 71.5);
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
          battery_level: f.properties?.battery_level ?? 92,
          value: Number(val),
          min_threshold: f.properties?.min_threshold ?? (sType === "temperature" ? 10.0 : 0.0),
          max_threshold: f.properties?.max_threshold ?? (sType === "temperature" ? 42.0 : sType === "gas" ? 50.0 : sType === "vibration" ? 15.0 : 85.0),
          history: [val * 0.94, val * 0.96, val * 0.98, val * 0.97, val * 0.99, val * 1.01, val * 1.0, val],
          trend: "stable",
        });
      } else if (layer === "camera" && geom.type === "Point") {
        const pt = toLatLng(geom.coordinates);
        const idx = cameras.length % LOCAL_CONSTRUCTION_VIDEOS.length;
        const videoUrl = f.properties?.stream_url || LOCAL_CONSTRUCTION_VIDEOS[idx];
        cameras.push({
          id: String(f.id || `cam-${cameras.length + 1}`),
          name: f.properties?.name || `CAM-0${cameras.length + 1}: Site Stream`,
          code: f.properties?.code || `CAM-0${cameras.length + 1}`,
          zone_id: f.properties?.zone_id,
          lat: pt[0],
          lng: pt[1],
          status: f.properties?.status || "streaming",
          fps: f.properties?.fps || 30,
          resolution: f.properties?.resolution || "1080p @ 30fps",
          video_url: videoUrl,
          is_cv_enabled: f.properties?.is_cv_enabled ?? true,
          workers_detected: Math.floor(Math.random() * 8) + 3,
          ppe_compliance_pct: 98,
          active_hazards: ["Perimeter Clear"],
        });
      }
    }

    // Associate cameras & sensors with zones via point-in-polygon if zone_id wasn't assigned
    const finalZones = zones.length > 0 ? zones : DEFAULT_SITE_MAP.zones;
    const finalCameras = cameras.length > 0 ? cameras : DEFAULT_SITE_MAP.cameras;
    const finalSensors = sensors.length > 0 ? sensors : DEFAULT_SITE_MAP.sensors;

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
      site_id: raw.site_id || DEFAULT_SITE_MAP.site_id,
      site_name: raw.site_name || DEFAULT_SITE_MAP.site_name,
      center,
      zoom: raw.zoom || 17,
      boundary,
      zones: finalZones,
      sensors: finalSensors,
      cameras: finalCameras,
    };
  }

  return DEFAULT_SITE_MAP;
}
