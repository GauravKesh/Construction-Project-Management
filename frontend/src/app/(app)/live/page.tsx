"use client";

import React, { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Video,
  Search,
  Maximize2,
  Camera,
  Battery,
  X,
  Play,
  Pause,
  Sparkles,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusDot } from "@/components/common/StatusDot";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useLiveStore, CVDetectionItem } from "@/stores/liveStore";
import { useProjectStore } from "@/stores/projectStore";
import { apiClient } from "@/lib/api/client";
import { normalizeList } from "@/lib/utils";
import { toast } from "sonner";
import { ConnectSourceModal } from "@/components/devices/ConnectSourceModal";
import { ALL_CONSTRUCTION_CAMERAS } from "@/lib/constants/cameras";
import { LiveClock } from "@/components/common/LiveClock";

interface SensorItem {
  id: string;
  name: string;
  type: string;
  unit: string;
  current_value: number;
  battery: number;
  status: string;
  zone: string;
}

interface CameraItem {
  id: string;
  camera_code?: string;
  name: string;
  location: string;
  rtsp_url: string;
  status: string;
  fps: number;
  resolution: string;
  is_cv_enabled: boolean;
  zone?: string;
}

export default function LiveMonitoringPage() {
  const activeSiteId = useProjectStore((s) => s.activeSiteId);
  const sensorLatest = useLiveStore((s) => s.sensorLatest);
  const sensorHistory = useLiveStore((s) => s.sensorHistory);
  const isPaused = useLiveStore((s) => s.isPaused);
  const togglePause = useLiveStore((s) => s.togglePause);
  const cameraStatus = useLiveStore((s) => s.cameraStatus);
  const latestDetections = useLiveStore((s) => s.latestDetections);

  const [activeTab, setActiveTab] = useState<"sensors" | "cameras">("cameras");
  const [selectedSensor, setSelectedSensor] = useState<SensorItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [gridPreset, setGridPreset] = useState<"1x1" | "2x2" | "3x3" | "4x4">("4x4");
  const queryClient = useQueryClient();

  const handleDisconnectCamera = async (cameraId: string, name: string) => {
    if (!confirm(`Disconnect camera "${name}" from this site?`)) return;
    try {
      await apiClient.delete(`/api/v1/cameras/${cameraId}`);
      toast.success(`Camera "${name}" disconnected`);
      await queryClient.invalidateQueries({ queryKey: ["cameras", activeSiteId] });
      await queryClient.invalidateQueries({ queryKey: ["sites", activeSiteId] });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to disconnect camera");
    }
  };

  // Fetch sensors
  const { data: sensorsData } = useQuery<any>({
    queryKey: ["sensors", activeSiteId],
    queryFn: () => apiClient.get<any>(`/api/v1/sites/${activeSiteId}/sensors`),
    enabled: Boolean(activeSiteId),
    staleTime: 15000,
  });

  // Fetch cameras from backend
  const { data: camerasData } = useQuery<any>({
    queryKey: ["cameras", activeSiteId],
    queryFn: () => apiClient.get<any>(`/api/v1/sites/${activeSiteId}/cameras`),
    enabled: Boolean(activeSiteId),
    staleTime: 15000,
  });

  const sensors = normalizeList<SensorItem>(sensorsData);
  const fetchedCameras = normalizeList<CameraItem>(camerasData);

  // Use only connected cameras from backend API / device simulator
  const cameras: CameraItem[] = fetchedCameras.map((c: any) => ({
    id: c.id,
    camera_code: c.camera_code || `CAM-${c.id.slice(0, 4)}`,
    name: c.name || `Camera ${c.camera_code}`,
    location:
      c.zone_name ||
      (c.location_geojson?.coordinates
        ? `Coordinates [${c.location_geojson.coordinates[1].toFixed(4)}, ${c.location_geojson.coordinates[0].toFixed(4)}]`
        : "Live Hardware Source"),
    zone: c.zone_name || "Active Worksite Zone",
    rtsp_url: c.stream_url || `/api/v1/cameras/${c.id}/stream`,
    status: c.status || "active",
    fps: c.fps || 2,
    resolution: c.resolution || "HD 1080p",
    is_cv_enabled: c.is_cv_enabled ?? true,
  }));

  const sensorTypes = Array.from(new Set(sensors.map((s) => s.type)));

  const filteredSensors = sensors.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.zone.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType === "all" || s.type === selectedType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live Monitoring & Control Wall"
        description="Synchronized real-time telemetry sensor grid and multi-stream computer vision CCTV wall."
      >
        <div className="flex items-center gap-2">
          <ConnectSourceModal />
          <Button
            variant={isPaused ? "destructive" : "outline"}
            size="sm"
            onClick={togglePause}
            className="gap-1.5 border-zinc-200 dark:border-zinc-800"
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {isPaused ? "Resume Live Stream" : "Pause Stream"}
          </Button>
        </div>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 pb-3">
          <TabsList>
            <TabsTrigger value="sensors" className="gap-2">
              <Activity className="h-4 w-4" />
              <span>Sensors Telemetry ({sensors.length})</span>
            </TabsTrigger>
            <TabsTrigger value="cameras" className="gap-2">
              <Video className="h-4 w-4" />
              <span>CCTV & CV Camera Wall ({cameras.length})</span>
            </TabsTrigger>
          </TabsList>

          {activeTab === "cameras" && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400 mr-2 font-mono">Grid:</span>
              {(["1x1", "2x2", "3x3", "4x4"] as const).map((preset) => (
                <Button
                  key={preset}
                  variant={gridPreset === preset ? "amber" : "outline"}
                  size="sm"
                  onClick={() => setGridPreset(preset)}
                  className="h-7 px-2 text-xs font-mono"
                >
                  {preset}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Tab 1: Sensors Grid */}
        <TabsContent value="sensors" className="space-y-4 pt-2">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <Input
                placeholder="Search sensors by name or zone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto w-full pb-1 sm:pb-0">
              <Button
                variant={selectedType === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedType("all")}
                className="h-8 text-xs shrink-0"
              >
                All Types
              </Button>
              {sensorTypes.map((type) => (
                <Button
                  key={type}
                  variant={selectedType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedType(type)}
                  className="h-8 text-xs capitalize shrink-0"
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          {/* Sensors Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredSensors.map((sensor) => {
              const live = sensorLatest[sensor.id];
              const displayVal = live ? live.value : sensor.current_value;
              const history = sensorHistory[sensor.id] || [];

              return (
                <Card
                  key={sensor.id}
                  onClick={() => setSelectedSensor(sensor)}
                  className="cursor-pointer border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50 transition-all p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium capitalize text-zinc-400">
                        {sensor.type}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center text-[11px] text-zinc-400 gap-1 font-mono">
                          <Battery className="h-3 w-3 text-emerald-500" />
                          {live?.battery ?? sensor.battery}%
                        </span>
                        <StatusDot status={sensor.status} size="sm" pulse />
                      </div>
                    </div>

                    <h4 className="mt-2 font-semibold text-sm text-zinc-900 dark:text-zinc-100 line-clamp-1">
                      {sensor.name}
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                      {sensor.zone}
                    </p>

                    <div className="mt-4 flex items-baseline justify-between">
                      <div className="flex items-baseline gap-1">
                        <span className="font-mono text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
                          {displayVal}
                        </span>
                        <span className="text-xs text-zinc-500 font-medium">
                          {sensor.unit}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {live ? "Live" : "Idle"}
                      </span>
                    </div>
                  </div>

                  {/* Sparkline track */}
                  <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400">
                    <span>Click for 30-pt telemetry drawer</span>
                    <Sparkles className="h-3 w-3 text-amber-500" />
                  </div>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 2: Camera Wall */}
        <TabsContent value="cameras" className="space-y-4 pt-2">
          {cameras.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="p-3 rounded-full bg-amber-500/10 text-amber-500 mb-3">
                <Video className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">No Live Cameras Connected</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mt-1 mb-4">
                Only cameras connected via RTSP, HTTP/MJPEG (e.g. device simulator on port 8090), or registered on this site are shown.
              </p>
              <ConnectSourceModal
                trigger={
                  <Button size="sm" variant="amber" className="text-xs">
                    Connect Camera Source
                  </Button>
                }
              />
            </div>
          ) : (
            <div
              className={`grid gap-4 ${
                gridPreset === "1x1"
                  ? "grid-cols-1"
                  : gridPreset === "2x2" || cameras.length <= 2
                  ? "grid-cols-1 sm:grid-cols-2"
                  : gridPreset === "3x3"
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
              }`}
            >
              {cameras.map((camera) => (
                <CameraFeedTile
                  key={camera.id}
                  camera={camera}
                  status={cameraStatus[camera.id]}
                  detection={latestDetections[camera.id]}
                  onDisconnect={() => handleDisconnectCamera(camera.id, camera.name)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Sensor Detail Slide-over Drawer */}
      {selectedSensor && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="h-full w-full max-w-md bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 p-6 overflow-y-auto flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
                <div>
                  <span className="text-xs capitalize font-medium text-amber-500">
                    {selectedSensor.type} Telemetry Stream
                  </span>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                    {selectedSensor.name}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedSensor(null)}
                  className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Sensor stats */}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-850">
                  <span className="text-xs text-zinc-400 capitalize font-semibold">Current Value</span>
                  <div className="font-mono text-xl font-black mt-1">
                    {sensorLatest[selectedSensor.id]?.value ?? selectedSensor.current_value} {selectedSensor.unit}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-850">
                  <span className="text-xs text-zinc-400 capitalize font-semibold">Battery State</span>
                  <div className="font-mono text-xl font-black mt-1 text-emerald-500">
                    {selectedSensor.battery}%
                  </div>
                </div>
              </div>

              {/* Real-time ring buffer list */}
              <div className="mt-6">
                <h4 className="text-xs font-medium capitalize text-zinc-400 mb-3">
                  Recent Telemetry Buffer (Last 30 Readings)
                </h4>
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {(sensorHistory[selectedSensor.id] || []).slice().reverse().map((pt, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-md bg-zinc-50 dark:bg-zinc-850/50 text-xs font-mono"
                    >
                      <span className="text-zinc-400">
                        {new Date(pt.ts).toLocaleTimeString()}
                      </span>
                      <span className="font-bold text-zinc-100">
                        {pt.val} {selectedSensor.unit}
                      </span>
                    </div>
                  ))}
                  {(!sensorHistory[selectedSensor.id] || sensorHistory[selectedSensor.id].length === 0) && (
                    <div className="py-8 text-center text-xs text-zinc-400">
                      Collecting sub-second points from live socket...
                    </div>
                  )}
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => setSelectedSensor(null)}
              className="w-full mt-6"
            >
              Close Drawer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Camera Canvas Tile with Real-time CV Bounding Box Renderer
function CameraFeedTile({
  camera,
  status,
  detection,
  onDisconnect,
}: {
  camera: CameraItem;
  status?: { status: string; fps: number };
  detection?: any;
  onDisconnect?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [streamError, setStreamError] = useState(false);

  const isMjpegStream = Boolean(
    camera.rtsp_url &&
    (camera.rtsp_url.includes(".mjpg") ||
     camera.rtsp_url.includes("/stream") ||
     camera.rtsp_url.includes(":8090") ||
     camera.rtsp_url.startsWith("http://") ||
     camera.rtsp_url.startsWith("https://")) &&
    !camera.rtsp_url.endsWith(".mp4")
  );

  // Render CV detections onto HTML5 Canvas overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear previous frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detection?.detections && Array.isArray(detection.detections)) {
      detection.detections.forEach((item: CVDetectionItem) => {
        const [ymin, xmin, ymax, xmax] = item.bbox;
        const x = xmin * canvas.width;
        const y = ymin * canvas.height;
        const w = (xmax - xmin) * canvas.width;
        const h = (ymax - ymin) * canvas.height;

        const isViolation = item.is_violation || item.class_name.includes("no_");

        ctx.lineWidth = 2;
        ctx.strokeStyle = isViolation ? "#ef4444" : "#10b981";
        ctx.strokeRect(x, y, w, h);

        // Label background
        ctx.fillStyle = isViolation ? "rgba(239, 68, 68, 0.85)" : "rgba(16, 185, 129, 0.85)";
        const labelText = `${item.class_name.toUpperCase()} ${(item.confidence * 100).toFixed(0)}%`;
        ctx.font = "bold 10px monospace";
        const textWidth = ctx.measureText(labelText).width;
        ctx.fillRect(x, Math.max(0, y - 16), textWidth + 8, 16);

        // Label text
        ctx.fillStyle = "#ffffff";
        ctx.fillText(labelText, x + 4, Math.max(12, y - 4));
      });
    }
  }, [detection]);

  const togglePlay = () => {
    if (isMjpegStream) {
      setIsPlaying((prev) => !prev);
    } else if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  const handleCaptureSnapshot = () => {
    const c = document.createElement("canvas");
    if (isMjpegStream && imgRef.current) {
      c.width = imgRef.current.naturalWidth || 960;
      c.height = imgRef.current.naturalHeight || 540;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.drawImage(imgRef.current, 0, 0, c.width, c.height);
        const a = document.createElement("a");
        a.href = c.toDataURL("image/jpeg");
        a.download = `${camera.camera_code || camera.id}-snapshot-${Date.now()}.jpg`;
        a.click();
      }
    } else if (videoRef.current) {
      c.width = videoRef.current.videoWidth || 1280;
      c.height = videoRef.current.videoHeight || 720;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, c.width, c.height);
        const a = document.createElement("a");
        a.href = c.toDataURL("image/jpeg");
        a.download = `${camera.camera_code || camera.id}-snapshot-${Date.now()}.jpg`;
        a.click();
      }
    }
    toast.success(`Snapshot captured from ${camera.name}`, {
      description: "Downloaded high-res frame to your device.",
    });
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <Card
      ref={containerRef}
      className="overflow-hidden border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col justify-between shadow-sm"
    >
      {/* Tile Header */}
      <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={status?.status || camera.status} size="sm" pulse />
          <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">{camera.name}</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
          <span>{status?.fps ?? camera.fps} FPS</span>
          <Badge variant="warning" className="text-[9px] px-1 py-0 font-mono">
            AI CV
          </Badge>
          {onDisconnect && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDisconnect();
              }}
              title="Disconnect / Remove camera"
              className="text-zinc-400 hover:text-red-500 transition-colors p-0.5 rounded cursor-pointer ml-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Video Stream + CV Canvas Overlay */}
      <div className="relative aspect-video w-full bg-zinc-950 overflow-hidden flex items-center justify-center">
        {/* Live Video / MJPEG Stream Feed */}
        {isMjpegStream ? (
          isPlaying ? (
            <img
              ref={imgRef}
              src={streamError ? `/api/v1/cameras/${camera.id}/snapshot` : camera.rtsp_url}
              alt={camera.name}
              onError={() => setStreamError(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 text-zinc-400 text-xs font-mono">
              Stream Paused
            </div>
          )
        ) : (
          <video
            ref={videoRef}
            src={camera.rtsp_url}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Canvas bounding box overlay */}
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Live timestamp overlay */}
        <div className="absolute top-2 left-2 z-20 font-mono text-[10px] text-emerald-400 bg-black/70 backdrop-blur-xs px-2 py-0.5 rounded border border-white/5 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>
            LIVE • <LiveClock />
          </span>
        </div>

        {/* Top-Right Resolution Tag */}
        <div className="absolute top-2 right-2 z-20 font-mono text-[9px] text-zinc-300 bg-black/60 px-2 py-0.5 rounded">
          {camera.resolution}
        </div>

        {/* Camera Location Tag */}
        <div className="absolute bottom-2 left-2 z-20 font-mono text-[10px] text-zinc-300 bg-black/70 backdrop-blur-xs px-2 py-0.5 rounded border border-white/5">
          {camera.location}
        </div>
      </div>

      {/* Footer Controls */}
      <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
        <span className="text-[10px] text-zinc-600 dark:text-zinc-400 font-mono">
          {detection?.compliant === false ? (
            <span className="text-red-500 dark:text-red-400 font-bold">⚠️ PPE Violation Flagged</span>
          ) : (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ PPE Compliant</span>
          )}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={togglePlay}
            className="h-7 w-7 p-0 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
            title={isPlaying ? "Pause Stream" : "Play Stream"}
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCaptureSnapshot}
            className="h-7 px-2 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white gap-1"
            title="Download Snapshot Frame"
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-[11px]">Snapshot</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="h-7 w-7 p-0 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
            title="Expand Fullscreen"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
