"use client";

import React, { useEffect, useState, useRef } from "react";
import "leaflet/dist/leaflet.css";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  Marker,
  Popup,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import {
  normalizeSiteMapData,
  NormalizedSiteMap,
  ParsedZone,
  ParsedSensorNode,
  ParsedCameraNode,
  DEFAULT_SITE_MAP,
} from "@/lib/mapUtils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Layers,
  MapPin,
  Eye,
  Radio,
  Video,
  ShieldAlert,
  Maximize2,
  Compass,
  CheckCircle2,
  Crosshair,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

// Fix standard Leaflet default icon URLs in case fallback is ever used
if (typeof window !== "undefined") {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  });
}

// Custom CSS / SVG DivIcons
const createSensorMarker = (sensor: ParsedSensorNode, isSelected = false) => {
  const size = isSelected ? 36 : 28;
  const innerSize = isSelected ? 28 : 22;
  return L.divIcon({
    className: "custom-sensor-marker",
    html: `
      <div style="position:relative; width:${size}px; height:${size}px; display:flex; align-items:center; justify-content:center;">
        <span style="position:absolute; inset:0; border-radius:50%; background:#3b82f6; opacity:${isSelected ? "0.75" : "0.4"}; animation:${isSelected ? "ping 1.2s cubic-bezier(0,0,0.2,1) infinite" : "ping 2.5s infinite"};"></span>
        ${isSelected ? '<span style="position:absolute; inset:-4px; border-radius:50%; border:2px solid #60a5fa; animation:pulse 1s infinite;"></span>' : ""}
        <div style="background:${isSelected ? "#1d4ed8" : "#2563eb"}; width:${innerSize}px; height:${innerSize}px; border-radius:50%; border:2px solid #ffffff; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(0,0,0,0.6); font-family:monospace; font-size:${isSelected ? "11px" : "9px"}; font-weight:900; color:#ffffff;">
          S
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const createCameraMarker = (cam: ParsedCameraNode, isSelected = false) => {
  const size = isSelected ? 36 : 28;
  const innerSize = isSelected ? 28 : 22;
  return L.divIcon({
    className: "custom-camera-marker",
    html: `
      <div style="position:relative; width:${size}px; height:${size}px; display:flex; align-items:center; justify-content:center;">
        <span style="position:absolute; inset:0; border-radius:50%; background:#f59e0b; opacity:${isSelected ? "0.8" : "0.35"}; animation:${isSelected ? "pulse 1.2s infinite" : "pulse 2.5s infinite"};"></span>
        ${isSelected ? '<span style="position:absolute; inset:-4px; border-radius:50%; border:2px solid #fbbf24; animation:pulse 1s infinite;"></span>' : ""}
        <div style="background:${isSelected ? "#b45309" : "#d97706"}; width:${innerSize}px; height:${innerSize}px; border-radius:50%; border:2px solid #ffffff; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(0,0,0,0.6); font-family:monospace; font-size:${isSelected ? "11px" : "9px"}; font-weight:900; color:#ffffff;">
          C
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Map click listener for drawing geofence
function MapDrawingHandler({
  isDrawing,
  onAddPoint,
}: {
  isDrawing: boolean;
  onAddPoint: (pt: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      if (isDrawing) {
        onAddPoint([e.latlng.lat, e.latlng.lng]);
      }
    },
  });
  return null;
}

// Invalidate size on load & handle centering
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

interface SiteMapLeafletProps {
  mapData?: any;
  selectedZone?: ParsedZone | null;
  selectedCamera?: ParsedCameraNode | null;
  selectedSensor?: ParsedSensorNode | null;
  onSelectZone: (zone: ParsedZone) => void;
  onSelectCamera?: (camera: ParsedCameraNode) => void;
  onSelectSensor?: (sensor: ParsedSensorNode) => void;
  isDrawingMode?: boolean;
  onDrawingPointsChange?: (points: [number, number][]) => void;
}

export default function SiteMapLeaflet({
  mapData,
  selectedZone,
  selectedCamera,
  selectedSensor,
  onSelectZone,
  onSelectCamera,
  onSelectSensor,
  isDrawingMode = false,
  onDrawingPointsChange,
}: SiteMapLeafletProps) {
  const [mounted, setMounted] = useState(false);
  const [tileProvider, setTileProvider] = useState<"satellite" | "dark" | "osm">("satellite");
  const [viewMode, setViewMode] = useState<"gis" | "blueprint">("gis");
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);

  // Layer visibility toggles
  const [showZones, setShowZones] = useState(true);
  const [showSensors, setShowSensors] = useState(true);
  const [showCameras, setShowCameras] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  const data: NormalizedSiteMap = normalizeSiteMapData(mapData);

  const handleAddDrawingPoint = (pt: [number, number]) => {
    const updated = [...drawingPoints, pt];
    setDrawingPoints(updated);
    if (onDrawingPointsChange) {
      onDrawingPointsChange(updated);
    }
    toast.info(`Geofence vertex #${updated.length} anchored at [${pt[0].toFixed(5)}, ${pt[1].toFixed(5)}]`);
  };

  const clearDrawing = () => {
    setDrawingPoints([]);
    if (onDrawingPointsChange) onDrawingPointsChange([]);
  };

  if (!mounted) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-zinc-950 font-mono text-xs text-zinc-400 space-y-2">
        <div className="h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <span>Initializing WebGL GIS Cartographic Engine...</span>
      </div>
    );
  }

  // 100% Free, Public GIS Basemaps without watermarks or required API keys
  const TILE_CONFIGS = {
    satellite: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: "&copy; Esri &mdash; Maxar, Earthstar Geographics",
      maxNativeZoom: 19,
    },
    dark: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      attribution: "&copy; Esri &mdash; DeLorme, NAVTEQ",
      maxNativeZoom: 16,
    },
    osm: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "&copy; OpenStreetMap contributors",
      maxNativeZoom: 19,
    },
  };

  return (
    <div className="relative h-full w-full select-none overflow-hidden">
      {/* Top Floating Control Bar - Must be z-[1001] to float above Leaflet's z-index: 400-1000 layers */}
      <div className="absolute top-3 left-3 right-3 z-[1001] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left: View Mode Toggle & Drawing Indicator */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <div className="p-1 rounded-lg bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-xs flex items-center gap-1 shadow-2xl">
            <Button
              variant={viewMode === "gis" ? "amber" : "ghost"}
              size="sm"
              onClick={() => setViewMode("gis")}
              className="h-7 px-2.5 text-xs font-bold"
            >
              <Compass className="h-3.5 w-3.5 mr-1" />
              GIS Satellite
            </Button>
            <Button
              variant={viewMode === "blueprint" ? "amber" : "ghost"}
              size="sm"
              onClick={() => setViewMode("blueprint")}
              className="h-7 px-2.5 text-xs font-bold"
            >
              <Layers className="h-3.5 w-3.5 mr-1" />
              CAD Blueprint
            </Button>
          </div>

          {isDrawingMode && (
            <div className="px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 text-xs font-mono font-bold flex items-center gap-2 shadow-2xl animate-pulse">
              <Crosshair className="h-3.5 w-3.5" />
              <span>Click Map to Place Geofence Vertices ({drawingPoints.length})</span>
              {drawingPoints.length > 0 && (
                <button
                  onClick={clearDrawing}
                  className="ml-1 text-[10px] underline cursor-pointer hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Basemap Selector & Layer Toggles */}
        <div className="flex items-center gap-1.5 pointer-events-auto flex-wrap">
          {viewMode === "gis" && (
            <>
              {/* Basemaps */}
              <div className="p-1 rounded-lg bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-xs flex items-center gap-1 shadow-2xl">
                <button
                  type="button"
                  onClick={() => setTileProvider("satellite")}
                  className={`px-2 py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
                    tileProvider === "satellite"
                      ? "bg-amber-500 text-zinc-950 font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Satellite (ESRI)
                </button>
                <button
                  type="button"
                  onClick={() => setTileProvider("dark")}
                  className={`px-2 py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
                    tileProvider === "dark"
                      ? "bg-amber-500 text-zinc-950 font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Dark Canvas
                </button>
                <button
                  type="button"
                  onClick={() => setTileProvider("osm")}
                  className={`px-2 py-1 rounded text-[11px] font-mono font-semibold transition-colors ${
                    tileProvider === "osm"
                      ? "bg-amber-500 text-zinc-950 font-bold"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  Street (OSM)
                </button>
              </div>

              {/* Layer Toggles */}
              <div className="p-1 rounded-lg bg-zinc-950/90 backdrop-blur-md border border-zinc-800 text-xs flex items-center gap-1 shadow-2xl">
                <button
                  type="button"
                  onClick={() => setShowZones((v) => !v)}
                  className={`px-2 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 ${
                    showZones
                      ? "bg-zinc-800 text-amber-400 font-bold"
                      : "text-zinc-500 hover:text-zinc-300 opacity-60"
                  }`}
                  title="Toggle Geofence Zones Layer"
                >
                  <span className="h-2 w-2 rounded-sm bg-amber-500" />
                  Zones
                </button>
                <button
                  type="button"
                  onClick={() => setShowCameras((v) => !v)}
                  className={`px-2 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 ${
                    showCameras
                      ? "bg-zinc-800 text-amber-400 font-bold"
                      : "text-zinc-500 hover:text-zinc-300 opacity-60"
                  }`}
                  title="Toggle CCTV Cameras Layer"
                >
                  <Video className="h-3 w-3 text-amber-500" />
                  CCTV
                </button>
                <button
                  type="button"
                  onClick={() => setShowSensors((v) => !v)}
                  className={`px-2 py-1 rounded text-[11px] font-mono transition-colors flex items-center gap-1 ${
                    showSensors
                      ? "bg-zinc-800 text-blue-400 font-bold"
                      : "text-zinc-500 hover:text-zinc-300 opacity-60"
                  }`}
                  title="Toggle IoT Sensors Layer"
                >
                  <Radio className="h-3 w-3 text-blue-400" />
                  Sensors
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Map View: Leaflet GIS Engine */}
      {viewMode === "gis" ? (
        <MapContainer
          center={data.center}
          zoom={data.zoom}
          zoomControl={false}
          style={{ height: "100%", width: "100%", background: "#09090b" }}
          className="h-full w-full"
        >
          <ZoomControl position="bottomright" />
          <MapController center={data.center} />
          <MapDrawingHandler isDrawing={isDrawingMode} onAddPoint={handleAddDrawingPoint} />

          <TileLayer
            key={tileProvider}
            attribution={TILE_CONFIGS[tileProvider].attribution}
            url={TILE_CONFIGS[tileProvider].url}
            maxNativeZoom={TILE_CONFIGS[tileProvider].maxNativeZoom}
            maxZoom={20}
          />

          {/* Site Outer Boundary Polygon */}
          {showBoundary && data.boundary.length > 0 && (
            <Polygon
              positions={data.boundary}
              pathOptions={{
                color: "#64748b",
                fillColor: "#334155",
                fillOpacity: 0.08,
                dashArray: "6, 6",
                weight: 2,
              }}
            >
              <Popup>
                <div className="p-1 font-mono text-xs">
                  <span className="font-bold text-zinc-900 block">{data.site_name}</span>
                  <span className="text-[10px] text-zinc-500">Site Cadastral Perimeter</span>
                </div>
              </Popup>
            </Polygon>
          )}

          {/* Active Geofence Zones */}
          {showZones &&
            data.zones.map((zone) => {
              const isSelected = selectedZone?.id === zone.id;
              return (
                <Polygon
                  key={zone.id}
                  positions={zone.coordinates}
                  pathOptions={{
                    color: zone.color,
                    fillColor: zone.color,
                    fillOpacity: isSelected ? 0.45 : 0.22,
                    weight: isSelected ? 3 : 2,
                  }}
                  eventHandlers={{
                    click: () => onSelectZone(zone),
                  }}
                >
                  <Popup>
                    <div className="p-1 space-y-1.5 text-xs font-sans">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-zinc-900 block">{zone.name}</span>
                        <span
                          className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-bold text-white"
                          style={{ backgroundColor: zone.color }}
                        >
                          {zone.zone_type}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-600 font-mono">
                        Classification: {zone.risk_level.toUpperCase()} RISK
                      </div>
                      <div className="flex gap-1 pt-1 border-t border-zinc-200">
                        {zone.requires_hard_hat && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[9px] font-bold">
                            Hard Hat Required
                          </span>
                        )}
                        {zone.requires_vest && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[9px] font-bold">
                            Hi-Vis Required
                          </span>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Polygon>
              );
            })}

          {/* Drawing Polyline Preview */}
          {isDrawingMode && drawingPoints.length > 0 && (
            <>
              <Polyline positions={drawingPoints} pathOptions={{ color: "#f59e0b", weight: 3, dashArray: "4, 4" }} />
              {drawingPoints.map((pt, idx) => (
                <Marker
                  key={idx}
                  position={pt}
                  icon={L.divIcon({
                    className: "drawing-vertex",
                    html: `<div style="background:#f59e0b; width:10px; height:10px; border-radius:50%; border:2px solid #ffffff;"></div>`,
                    iconSize: [10, 10],
                    iconAnchor: [5, 5],
                  })}
                />
              ))}
            </>
          )}

          {/* IoT Sensor Markers */}
          {showSensors &&
            data.sensors.map((sensor) => {
              const isSelected = selectedSensor?.id === sensor.id;
              return (
                <Marker
                  key={sensor.id}
                  position={[sensor.lat, sensor.lng]}
                  icon={createSensorMarker(sensor, isSelected)}
                  eventHandlers={{
                    click: () => onSelectSensor?.(sensor),
                  }}
                >
                  <Popup>
                    <div className="p-1 text-xs space-y-1.5 font-sans min-w-[160px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-zinc-900">{sensor.name}</span>
                        <span className="font-mono text-[10px] text-zinc-400">{sensor.code}</span>
                      </div>
                      <div className="font-mono text-base font-black text-blue-600">
                        {sensor.value} {sensor.unit}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                        <span>Battery: {sensor.battery_level}%</span>
                        <span className="text-emerald-600 font-bold uppercase">{sensor.status}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onSelectSensor?.(sensor)}
                        className="w-full mt-1 py-1 rounded bg-blue-600 text-white text-[10px] font-bold text-center hover:bg-blue-700 transition-colors"
                      >
                        Inspect Live Telemetry &rarr;
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          {/* CCTV Camera Markers */}
          {showCameras &&
            data.cameras.map((cam) => {
              const isSelected = selectedCamera?.id === cam.id;
              return (
                <Marker
                  key={cam.id}
                  position={[cam.lat, cam.lng]}
                  icon={createCameraMarker(cam, isSelected)}
                  eventHandlers={{
                    click: () => onSelectCamera?.(cam),
                  }}
                >
                  <Popup>
                    <div className="p-1 text-xs space-y-1.5 font-sans min-w-[180px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-zinc-900">{cam.name}</span>
                        <span className="font-mono text-[10px] text-amber-600 font-bold">{cam.code}</span>
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500">
                        {cam.resolution} • {cam.fps} FPS
                      </div>
                      <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold uppercase">
                        Stream Active (YOLOv8 CV)
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectCamera?.(cam)}
                        className="w-full mt-1 py-1 rounded bg-amber-500 text-zinc-950 text-[10px] font-bold text-center hover:bg-amber-400 transition-colors"
                      >
                        Open Live Stream & Analysis &rarr;
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
        </MapContainer>
      ) : (
        /* Vector Blueprint Mode (CAD-style Site Layout) */
        <div className="h-full w-full bg-[#0a0f1d] p-6 overflow-hidden flex flex-col justify-between font-mono relative">
          {/* Blueprint Grid Lines Background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:32px_32px] opacity-40 pointer-events-none" />

          {/* Blueprint Header */}
          <div className="relative z-10 flex items-center justify-between text-xs border-b border-zinc-800 pb-3">
            <div>
              <span className="text-[10px] text-amber-500 uppercase font-bold tracking-widest block">
                CAD ARCHITECTURAL SITE PLAN • LEVEL 0 FOUNDATION
              </span>
              <h3 className="text-sm font-bold text-white mt-0.5">{data.site_name}</h3>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-zinc-400">
              <span>Scale: 1:500</span>
              <span>•</span>
              <span>Grid: WGS84 Universal</span>
              <span>•</span>
              <span className="text-emerald-400">Datum: Lat 28.5562 N, Lon 77.1000 E</span>
            </div>
          </div>

          {/* SVG Site Blueprint Graphic */}
          <div className="relative z-10 my-auto h-[480px] w-full flex items-center justify-center">
            <svg viewBox="0 0 900 480" className="w-full h-full">
              {/* Site Perimeter Box */}
              <rect
                x="80"
                y="40"
                width="740"
                height="400"
                fill="none"
                stroke="#64748b"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
              <text x="90" y="60" fill="#94a3b8" fontSize="11" fontWeight="bold">
                SITE PERIMETER BOUNDARY (SITE-NORTH-01)
              </text>

              {/* Zone 1: Excavation Pit (Red) */}
              <g
                className="cursor-pointer transition-opacity hover:opacity-85"
                onClick={() => onSelectZone(data.zones[0])}
              >
                <polygon
                  points="120,90 380,90 380,240 120,240"
                  fill="rgba(239, 68, 68, 0.22)"
                  stroke="#ef4444"
                  strokeWidth="2.5"
                />
                <text x="135" y="125" fill="#fca5a5" fontSize="12" fontWeight="bold">
                  ZONE 1: EXCAVATION PIT A (HIGH RISK)
                </text>
                <text x="135" y="145" fill="#f87171" fontSize="10">
                  Mandatory: Hard Hat, Safety Boots, Harness
                </text>
              </g>

              {/* Zone 2: Scaffolding Zone B (Amber) */}
              <g
                className="cursor-pointer transition-opacity hover:opacity-85"
                onClick={() => onSelectZone(data.zones[1])}
              >
                <polygon
                  points="440,90 760,90 760,240 440,240"
                  fill="rgba(245, 158, 11, 0.22)"
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                />
                <text x="455" y="125" fill="#fde68a" fontSize="12" fontWeight="bold">
                  ZONE 2: SCAFFOLDING FAÇADE B (ACTIVE WORK)
                </text>
                <text x="455" y="145" fill="#fbbf24" fontSize="10">
                  Mandatory: Hi-Vis Vest, Fall Arrest Tether
                </text>
              </g>

              {/* Zone 3: Logistics Yard (Green) */}
              <g
                className="cursor-pointer transition-opacity hover:opacity-85"
                onClick={() => onSelectZone(data.zones[2])}
              >
                <polygon
                  points="120,270 440,270 440,410 120,410"
                  fill="rgba(16, 185, 129, 0.18)"
                  stroke="#10b981"
                  strokeWidth="2.5"
                />
                <text x="135" y="305" fill="#a7f3d0" fontSize="12" fontWeight="bold">
                  ZONE 3: LOGISTICS & STAGING DEPOT
                </text>
                <text x="135" y="325" fill="#34d399" fontSize="10">
                  Speed Limit 10 km/h • Vehicle Biometrics
                </text>
              </g>

              {/* Zone 4: Core Slipform (Purple) */}
              <g
                className="cursor-pointer transition-opacity hover:opacity-85"
                onClick={() => onSelectZone(data.zones[3])}
              >
                <polygon
                  points="480,270 760,270 760,410 480,410"
                  fill="rgba(139, 92, 246, 0.2)"
                  stroke="#8b5cf6"
                  strokeWidth="2.5"
                />
                <text x="495" y="305" fill="#ddd6fe" fontSize="12" fontWeight="bold">
                  ZONE 4: CORE JUMPFORM L28
                </text>
                <text x="495" y="325" fill="#a78bfa" fontSize="10">
                  Hydraulic Jacking • Restricted Access
                </text>
              </g>

              {/* Sensor Node Beacons */}
              {data.sensors.map((s, idx) => {
                const cx = 160 + idx * 160;
                const cy = 200 + (idx % 2 === 0 ? -40 : 40);
                return (
                  <g key={s.id} className="cursor-pointer">
                    <circle cx={cx} cy={cy} r="14" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="2" />
                    <text x={cx} y={cy + 4} textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                      S{idx + 1}
                    </text>
                    <text x={cx} y={cy + 24} textAnchor="middle" fill="#93c5fd" fontSize="9">
                      {s.code}
                    </text>
                  </g>
                );
              })}

              {/* Camera Anchors */}
              {data.cameras.slice(0, 4).map((c, idx) => {
                const cx = 100 + idx * 210;
                const cy = 60;
                return (
                  <g key={c.id} className="cursor-pointer">
                    <polygon
                      points={`${cx},${cy} ${cx - 20},${cy + 30} ${cx + 20},${cy + 30}`}
                      fill="rgba(245, 158, 11, 0.25)"
                      stroke="#f59e0b"
                      strokeWidth="1"
                    />
                    <circle cx={cx} cy={cy} r="6" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
                    <text x={cx} y={cy - 10} textAnchor="middle" fill="#fcd34d" fontSize="9" fontWeight="bold">
                      {c.code}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Blueprint Footer */}
          <div className="relative z-10 flex items-center justify-between text-[11px] text-zinc-400 border-t border-zinc-800 pt-3">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              CAD Vector layer synced with BIM Level 0 Foundation model
            </span>
            <span>4 Geofence Zones Active • 4 IoT Sensors Anchored • 8 CCTV Nodes</span>
          </div>
        </div>
      )}
    </div>
  );
}
