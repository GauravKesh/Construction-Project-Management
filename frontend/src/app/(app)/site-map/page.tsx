"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin,
  Layers,
  ShieldAlert,
  Plus,
  Eye,
  CheckCircle2,
  HardHat,
  X,
  Radio,
  Video,
  Crosshair,
  RotateCcw,
  Sparkles,
  Trash2,
  Loader2,
  Activity,
  Users,
  Compass,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useProjectStore } from "@/stores/projectStore";
import { apiClient } from "@/lib/api/client";
import {
  normalizeSiteMapData,
  ParsedZone,
  ParsedSensorNode,
  ParsedCameraNode,
  NormalizedSiteMap,
} from "@/lib/mapUtils";
import { CameraLiveFeedCard } from "@/components/map/CameraLiveFeedCard";
import { SensorTelemetryCard } from "@/components/map/SensorTelemetryCard";
import { toast } from "sonner";
import { NO_DATA, fmtNumber } from "@/lib/format";

// Dynamic import with ssr: false to prevent Leaflet window errors during Next.js SSR
const SiteMapLeaflet = dynamic(() => import("@/components/map/SiteMapLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex flex-col items-center justify-center bg-zinc-950 font-mono text-xs text-zinc-500 gap-3">
      <div className="h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      <span>Initializing Leaflet GIS Cartographic Engine...</span>
    </div>
  ),
});

export default function SiteMapPage() {
  const queryClient = useQueryClient();
  const activeSiteId = useProjectStore((s) => s.activeSiteId);
  const [selectedZone, setSelectedZone] = useState<ParsedZone | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<ParsedCameraNode | null>(null);
  const [selectedSensor, setSelectedSensor] = useState<ParsedSensorNode | null>(null);
  const [isCreatingZone, setIsCreatingZone] = useState(false);
  const [currentDrawnPoints, setCurrentDrawnPoints] = useState<[number, number][]>([]);
  const [activeTab, setActiveTab] = useState<"zones" | "cameras" | "sensors">("zones");

  // New zone form state
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneType, setNewZoneType] = useState<"hazard" | "work" | "safe">("hazard");
  const [newReqHardhat, setNewReqHardhat] = useState(true);
  const [newReqVest, setNewReqVest] = useState(true);

  // Fetch site map data
  const { data: rawMapData, refetch, isLoading } = useQuery({
    queryKey: ["site-map", activeSiteId],
    queryFn: () => apiClient.get<any>(`/api/v1/sites/${activeSiteId}/map`),
    enabled: Boolean(activeSiteId),
  });

  const normalizedMap: NormalizedSiteMap = useMemo(() => {
    return normalizeSiteMapData(rawMapData);
  }, [rawMapData]);

  // Mutation to persist new zone into database
  const createZoneMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      zone_type: string;
      risk_level: string;
      polygon_geojson: any;
    }) => {
      return apiClient.post<any>(`/api/v1/sites/${activeSiteId}/zones`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-map", activeSiteId] });
      refetch();
      toast.success(`Geofence Zone "${newZoneName}" saved to database!`, {
        description: "Polygon coordinates and safety rules committed to PostgreSQL.",
      });
      setIsCreatingZone(false);
      setNewZoneName("");
      setCurrentDrawnPoints([]);
    },
    onError: (err: any) => {
      toast.error("Failed to save geofence to database", {
        description: err.message || "An unexpected error occurred while writing to PostgreSQL.",
      });
    },
  });

  // Mutation to delete a zone from database
  const deleteZoneMutation = useMutation({
    mutationFn: async (zoneId: string) => {
      return apiClient.delete<any>(`/api/v1/zones/${zoneId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-map", activeSiteId] });
      refetch();
      setSelectedZone(null);
      toast.success("Geofence zone deleted from database");
    },
    onError: (err: any) => {
      toast.error("Failed to delete zone", {
        description: err.message || "An unexpected error occurred while deleting from PostgreSQL.",
      });
    },
  });

  const handleSaveNewZone = () => {
    if (!newZoneName.trim()) {
      toast.error("Please enter a zone designation name");
      return;
    }

    let coords: [number, number][];
    if (currentDrawnPoints.length >= 3) {
      coords = currentDrawnPoints;
    } else {
      const c = normalizedMap.center;
      coords = [
        [c[0] - 0.0008, c[1] - 0.0008],
        [c[0] - 0.0008, c[1] + 0.0008],
        [c[0] + 0.0008, c[1] + 0.0008],
        [c[0] + 0.0008, c[1] - 0.0008],
      ];
    }

    const ring: [number, number][] = coords.map((pt) => [
      Number(pt[1].toFixed(6)),
      Number(pt[0].toFixed(6)),
    ]);

    if (ring.length > 0) {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([first[0], first[1]]);
      }
    }

    const polygon_geojson = {
      type: "Polygon",
      coordinates: [ring],
    };

    createZoneMutation.mutate({
      name: newZoneName.trim(),
      zone_type: newZoneType,
      risk_level: newZoneType === "hazard" ? "high" : newZoneType === "safe" ? "low" : "medium",
      polygon_geojson,
    });
  };

  const handleDeleteZone = (zoneId: string, zoneName: string) => {
    if (confirm(`Are you sure you want to delete geofence "${zoneName}" from the database?`)) {
      deleteZoneMutation.mutate(zoneId);
    }
  };

  // Connected elements for the selected zone
  const zoneCameras = useMemo(() => {
    if (!selectedZone) return [];
    return normalizedMap.cameras.filter((c) => c.zone_id === selectedZone.id);
  }, [selectedZone, normalizedMap.cameras]);

  const zoneSensors = useMemo(() => {
    if (!selectedZone) return [];
    return normalizedMap.sensors.filter((s) => s.zone_id === selectedZone.id);
  }, [selectedZone, normalizedMap.sensors]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Interactive Site Map & GIS Geofencing"
        description="High-precision geospatial map with polygon exclusion zones, real-time sensor node anchors, and camera orientations."
      >
        <div className="flex items-center gap-2">
          {isCreatingZone ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsCreatingZone(false);
                setCurrentDrawnPoints([]);
              }}
              className="gap-1.5 text-xs text-zinc-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
              Cancel Drawing
            </Button>
          ) : (
            <Button
              variant="amber"
              size="sm"
              onClick={() => {
                setIsCreatingZone(true);
                setSelectedZone(null);
                setSelectedCamera(null);
                setSelectedSensor(null);
              }}
              className="gap-1.5 font-bold"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Geofence Zone
            </Button>
          )}
        </div>
      </PageHeader>

      {/* Drawing Instructions Banner when active */}
      {isCreatingZone && (
        <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 backdrop-blur-md flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-ping" />
            <div className="text-zinc-900 dark:text-zinc-100 font-sans">
              <span className="font-bold text-amber-500 uppercase tracking-wider text-[11px] mr-2">
                Drawing Mode Active:
              </span>
              Click anywhere on the map surface to place polygon vertices. 
              <span className="ml-1 text-zinc-500 dark:text-zinc-400">
                ({currentDrawnPoints.length} vertices placed)
              </span>
            </div>
          </div>
          {currentDrawnPoints.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentDrawnPoints([])}
              className="h-6 text-[10px] text-zinc-400 hover:text-white gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Vertices
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[740px]">
        {/* Left: GIS Map */}
        <div className="lg:col-span-2 h-full rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-md relative">
          <SiteMapLeaflet
            mapData={normalizedMap}
            selectedZone={selectedZone}
            selectedCamera={selectedCamera}
            selectedSensor={selectedSensor}
            onSelectZone={(zone) => {
              setSelectedZone(zone);
              setSelectedCamera(null);
              setSelectedSensor(null);
            }}
            onSelectCamera={(cam) => {
              setSelectedCamera(cam);
              setSelectedSensor(null);
              setSelectedZone(null);
            }}
            onSelectSensor={(sensor) => {
              setSelectedSensor(sensor);
              setSelectedCamera(null);
              setSelectedZone(null);
            }}
            isDrawingMode={isCreatingZone}
            onDrawingPointsChange={setCurrentDrawnPoints}
          />

          {/* Map floating legend - Elevated above Leaflet tiles */}
          <div className="absolute bottom-4 left-4 z-[1001] p-2.5 rounded-lg bg-white/95 dark:bg-zinc-950/90 border border-zinc-200 dark:border-zinc-800/80 backdrop-blur-md text-[11px] space-y-1.5 shadow-xl pointer-events-auto">
            <span className="font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[10px] block">
              Layer Legend
            </span>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
              <span className="text-zinc-700 dark:text-zinc-300">Hazard Zone (High PPE)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
              <span className="text-zinc-700 dark:text-zinc-300">Active Work Zone</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              <span className="text-zinc-700 dark:text-zinc-300">Safe Staging & Office</span>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-zinc-200 dark:border-zinc-800">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              <span className="text-zinc-700 dark:text-zinc-300">IoT Sensor Node</span>
              <span className="h-2 w-2 rounded-full bg-amber-500 ml-2" />
              <span className="text-zinc-700 dark:text-zinc-300">CCTV Node</span>
            </div>
          </div>
        </div>

        {/* Right: Connected Inspector / Directory Sidebar */}
        <div className="lg:col-span-1 h-full overflow-y-auto space-y-4">
          {/* 1. Zone Creation Mode */}
          {isCreatingZone && (
            <Card className="border-amber-500/50 bg-white dark:bg-zinc-900/90 shadow-xl">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1.5">
                    <Crosshair className="h-3.5 w-3.5" />
                    New Geofence Polygon
                  </CardTitle>
                  <CardDescription className="text-[11px] text-zinc-500 mt-0.5">
                    Click points on map or confirm default footprint
                  </CardDescription>
                </div>
                <button
                  onClick={() => setIsCreatingZone(false)}
                  className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                    Zone Name
                  </label>
                  <Input
                    placeholder="e.g. Scaffolding Bay 4 / Tower Crane Radius"
                    value={newZoneName}
                    onChange={(e) => setNewZoneName(e.target.value)}
                    className="h-8 text-xs bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                    Zone Classification
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["hazard", "work", "safe"] as const).map((t) => (
                      <Button
                        key={t}
                        type="button"
                        variant={newZoneType === t ? "amber" : "outline"}
                        size="sm"
                        onClick={() => setNewZoneType(t)}
                        className="h-7 text-[10px] uppercase font-mono"
                      >
                        {t}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 space-y-2 border-t border-zinc-200 dark:border-zinc-800 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-700 dark:text-zinc-300">Require Hard Hat</span>
                    <Switch checked={newReqHardhat} onCheckedChange={setNewReqHardhat} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-700 dark:text-zinc-300">Require Hi-Vis Vest</span>
                    <Switch checked={newReqVest} onCheckedChange={setNewReqVest} />
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-850/60 text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Vertices Placed:</span>
                    <span className="font-mono font-bold text-amber-500">
                      {currentDrawnPoints.length} points
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    {currentDrawnPoints.length >= 3
                      ? "Custom polygon boundary ready."
                      : "Click 3+ points on the map, or save to place standard perimeter."}
                  </p>
                </div>

                <Button
                  variant="amber"
                  size="sm"
                  disabled={createZoneMutation.isPending}
                  onClick={handleSaveNewZone}
                  className="w-full h-8 text-xs font-bold mt-2 gap-1.5"
                >
                  {createZoneMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving to PostgreSQL Database...
                    </>
                  ) : (
                    "Confirm & Save Zone to DB"
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 2. Live Camera Stream & AI Analysis Inspector */}
          {!isCreatingZone && selectedCamera && (
            <CameraLiveFeedCard
              camera={selectedCamera}
              zone={normalizedMap.zones.find((z) => z.id === selectedCamera.zone_id)}
              onSelectZone={(zid) => {
                const z = normalizedMap.zones.find((item) => item.id === zid);
                if (z) {
                  setSelectedZone(z);
                  setSelectedCamera(null);
                }
              }}
              onClose={() => setSelectedCamera(null)}
            />
          )}

          {/* 3. Live IoT Sensor Telemetry Inspector */}
          {!isCreatingZone && selectedSensor && (
            <SensorTelemetryCard
              sensor={selectedSensor}
              zone={normalizedMap.zones.find((z) => z.id === selectedSensor.zone_id)}
              onSelectZone={(zid) => {
                const z = normalizedMap.zones.find((item) => item.id === zid);
                if (z) {
                  setSelectedZone(z);
                  setSelectedSensor(null);
                }
              }}
              onClose={() => setSelectedSensor(null)}
            />
          )}

          {/* 4. Connected Zone Details Card */}
          {!isCreatingZone && !selectedCamera && !selectedSensor && selectedZone && (
            <Card className="border-zinc-200 dark:border-zinc-800 shadow-md">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-mono font-bold text-amber-500">
                    Geofence Sector Inspector
                  </span>
                  <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                    {selectedZone.name}
                  </CardTitle>
                </div>
                <button
                  onClick={() => setSelectedZone(null)}
                  className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3.5 text-xs">
                {/* Zone Safety Specs */}
                <div className="p-3 rounded-lg bg-zinc-100/70 dark:bg-zinc-850 space-y-1.5 font-sans">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-600 dark:text-zinc-400">Classification:</span>
                    <Badge
                      variant={
                        selectedZone.zone_type === "hazard"
                          ? "destructive"
                          : selectedZone.zone_type === "safe"
                          ? "success"
                          : "warning"
                      }
                      className="uppercase font-mono text-[9px]"
                    >
                      {selectedZone.zone_type}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Risk Level:</span>
                    <span className="font-mono font-semibold uppercase text-zinc-800 dark:text-zinc-200">
                      {selectedZone.risk_level}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Footprint Area:</span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200">
                      {selectedZone.area_sqm?.toLocaleString() || "—"} m²
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Active Workforce:</span>
                    <span className="font-mono font-bold text-emerald-500">
                      {fmtNumber(selectedZone.active_workers, 0)} Personnel on Site
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Hard Hat:</span>
                    <span
                      className={
                        selectedZone.requires_hard_hat
                          ? "text-emerald-500 dark:text-emerald-400 font-semibold"
                          : "text-zinc-500"
                      }
                    >
                      {selectedZone.requires_hard_hat ? "Mandatory" : "Optional"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Hi-Vis Vest:</span>
                    <span
                      className={
                        selectedZone.requires_vest
                          ? "text-emerald-500 dark:text-emerald-400 font-semibold"
                          : "text-zinc-500"
                      }
                    >
                      {selectedZone.requires_vest ? "Mandatory" : "Optional"}
                    </span>
                  </div>
                </div>

                {/* Connected CCTV Cameras in this Zone */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[10px] flex items-center gap-1">
                      <Video className="h-3.5 w-3.5 text-amber-500" />
                      Stationed CCTV Feeds ({zoneCameras.length})
                    </span>
                  </div>
                  {zoneCameras.length > 0 ? (
                    <div className="space-y-1.5">
                      {zoneCameras.map((cam) => (
                        <div
                          key={cam.id}
                          onClick={() => setSelectedCamera(cam)}
                          className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50 bg-zinc-50 dark:bg-zinc-850/60 cursor-pointer flex items-center justify-between transition-all group"
                        >
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            <div>
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100 block text-[11px] group-hover:text-amber-500">
                                {cam.name}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-mono">
                                {cam.resolution ?? NO_DATA} • {fmtNumber(cam.fps, 0)} FPS
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="amber"
                            size="sm"
                            className="h-6 text-[10px] px-2 font-bold"
                          >
                            Live Feed &rarr;
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-zinc-500 italic p-2 bg-zinc-50 dark:bg-zinc-850/40 rounded">
                      No cameras currently anchored in this boundary.
                    </p>
                  )}
                </div>

                {/* Connected IoT Sensors in this Zone */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[10px] flex items-center gap-1">
                      <Radio className="h-3.5 w-3.5 text-blue-500" />
                      Stationed IoT Sensors ({zoneSensors.length})
                    </span>
                  </div>
                  {zoneSensors.length > 0 ? (
                    <div className="space-y-1.5">
                      {zoneSensors.map((s) => (
                        <div
                          key={s.id}
                          onClick={() => setSelectedSensor(s)}
                          className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-blue-500/50 bg-zinc-50 dark:bg-zinc-850/60 cursor-pointer flex items-center justify-between transition-all group"
                        >
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
                            <div>
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100 block text-[11px] group-hover:text-blue-500">
                                {s.name}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-mono">
                                Batt: {s.battery_level}% • {s.code}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-bold font-mono text-blue-600 dark:text-blue-400 block text-xs">
                              {fmtNumber(s.value, 2)} {s.unit}
                            </span>
                            <span className="text-[9px] text-zinc-400 uppercase font-mono">
                              {s.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-zinc-500 italic p-2 bg-zinc-50 dark:bg-zinc-850/40 rounded">
                      No sensor nodes currently anchored in this boundary.
                    </p>
                  )}
                </div>

                <div className="flex gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      toast.success(`Broadcasting safety check alert for ${selectedZone.name}`);
                    }}
                    className="flex-1 h-8 text-xs gap-1 border-zinc-300 dark:border-zinc-700"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                    Broadcast Alert
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleteZoneMutation.isPending}
                    onClick={() => handleDeleteZone(selectedZone.id, selectedZone.name)}
                    className="h-8 px-2.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    title="Delete zone from database"
                  >
                    {deleteZoneMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 5. Default GIS Master Directory */}
          {!isCreatingZone && !selectedCamera && !selectedSensor && !selectedZone && (
            <Card className="border-zinc-200 dark:border-zinc-800">
              <CardHeader className="p-4 pb-2 space-y-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Site GIS Directory
                  </CardTitle>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {normalizedMap.site_name}
                  </span>
                </div>

                {/* Filter Tabs */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-100 dark:bg-zinc-850 rounded-lg text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => setActiveTab("zones")}
                    className={`py-1 rounded text-center font-bold transition-all ${
                      activeTab === "zones"
                        ? "bg-white dark:bg-zinc-900 text-amber-500 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                    }`}
                  >
                    Zones ({normalizedMap.zones.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("cameras")}
                    className={`py-1 rounded text-center font-bold transition-all ${
                      activeTab === "cameras"
                        ? "bg-white dark:bg-zinc-900 text-amber-500 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                    }`}
                  >
                    CCTV ({normalizedMap.cameras.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("sensors")}
                    className={`py-1 rounded text-center font-bold transition-all ${
                      activeTab === "sensors"
                        ? "bg-white dark:bg-zinc-900 text-amber-500 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                    }`}
                  >
                    Sensors ({normalizedMap.sensors.length})
                  </button>
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-1 space-y-2">
                {activeTab === "zones" && (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {normalizedMap.zones.map((zone) => (
                      <div
                        key={zone.id}
                        onClick={() => setSelectedZone(zone)}
                        className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50 bg-zinc-50/50 dark:bg-zinc-850/50 cursor-pointer transition-all space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                            {zone.name}
                          </span>
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: zone.color }}
                          />
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                          <span className="uppercase font-mono">{zone.zone_type}</span>
                          <span>•</span>
                          <span>{zone.coordinates?.length || 4} vertices</span>
                          {zone.area_sqm && (
                            <>
                              <span>•</span>
                              <span>{zone.area_sqm.toLocaleString()} m²</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center justify-between pt-1 border-t border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-500 font-mono">
                          <span>{zone.cameras_count || 0} CCTV Feeds</span>
                          <span>{zone.sensors_count || 0} Sensor Nodes</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "cameras" && (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {normalizedMap.cameras.map((cam) => (
                      <div
                        key={cam.id}
                        onClick={() => setSelectedCamera(cam)}
                        className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50 bg-zinc-50/50 dark:bg-zinc-850/50 cursor-pointer space-y-1.5 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 group-hover:text-amber-500">
                            <Video className="h-3 w-3 text-amber-500" />
                            {cam.name}
                          </span>
                          <Badge variant="outline" className="text-[9px] font-mono font-bold text-amber-500">
                            {cam.code}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                          <span>{cam.resolution ?? NO_DATA} • {fmtNumber(cam.fps, 0)} FPS</span>
                          <span className="text-emerald-500 font-bold uppercase flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live Stream
                          </span>
                        </div>
                        {cam.zone_name && (
                          <div className="text-[10px] text-zinc-400 font-sans flex items-center gap-1 pt-1 border-t border-zinc-200 dark:border-zinc-800">
                            <MapPin className="h-2.5 w-2.5 text-zinc-400" />
                            <span>Stationed: {cam.zone_name}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "sensors" && (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                    {normalizedMap.sensors.map((sensor) => (
                      <div
                        key={sensor.id}
                        onClick={() => setSelectedSensor(sensor)}
                        className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-blue-500/50 bg-zinc-50/50 dark:bg-zinc-850/50 cursor-pointer space-y-1.5 transition-all group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 group-hover:text-blue-500">
                            <Radio className="h-3 w-3 text-blue-500" />
                            {sensor.name}
                          </span>
                          <Badge variant="outline" className="text-[9px] font-mono text-blue-500">
                            {sensor.code}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-blue-500 font-bold text-xs">
                            {fmtNumber(sensor.value, 2)} {sensor.unit}
                          </span>
                          <span className="text-zinc-500">
                            Batt: {sensor.battery_level}% • {sensor.status.toUpperCase()}
                          </span>
                        </div>
                        {sensor.zone_name && (
                          <div className="text-[10px] text-zinc-400 font-sans flex items-center gap-1 pt-1 border-t border-zinc-200 dark:border-zinc-800">
                            <MapPin className="h-2.5 w-2.5 text-zinc-400" />
                            <span>Stationed: {sensor.zone_name}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
