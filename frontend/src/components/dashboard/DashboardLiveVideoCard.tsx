"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Camera,
  PlugZap,
  Radio,
  Video,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useProjectStore } from "@/stores/projectStore";
import { normalizeList } from "@/lib/utils";
import { toast } from "sonner";
import { ConnectSourceModal } from "@/components/devices/ConnectSourceModal";

interface CameraChannel {
  id: string;
  name: string;
  code?: string;
  location: string;
  sourceType: "live" | "webcam" | "custom";
  url?: string;
  fps: number;
  resolution: string;
}

const WEBCAM_CHANNEL: CameraChannel = {
  id: "cam-webcam",
  name: "Operator Local Webcam",
  code: "WEBCAM",
  location: "Direct Device Input",
  sourceType: "webcam",
  fps: 30,
  resolution: "Direct Sensor Passthrough",
};

export function DashboardLiveVideoCard() {
  const activeSiteId = useProjectStore((s) => s.activeSiteId);

  // Fetch only real connected cameras from backend API
  const { data: camerasData, isLoading: isLoadingCameras } = useQuery<any>({
    queryKey: ["cameras", activeSiteId],
    queryFn: () => apiClient.get<any>(`/api/v1/sites/${activeSiteId}/cameras`),
    enabled: Boolean(activeSiteId),
    staleTime: 15000,
  });

  const siteChannels: CameraChannel[] = useMemo(() => {
    const list = normalizeList<any>(camerasData);
    return list.map((c) => ({
      id: c.id,
      name: c.name || `Camera ${c.camera_code}`,
      code: c.camera_code || `CAM-${c.id.slice(0, 4)}`,
      location:
        c.zone_name ||
        (c.location_geojson?.coordinates
          ? `Coords [${c.location_geojson.coordinates[1].toFixed(3)}, ${c.location_geojson.coordinates[0].toFixed(3)}]`
          : "Connected Hardware Stream"),
      sourceType: "live" as const,
      url: c.stream_url || `/api/v1/cameras/${c.id}/stream`,
      fps: c.fps || 10,
      resolution: c.resolution || "HD 1080p",
    }));
  }, [camerasData]);

  const [customChannels, setCustomChannels] = useState<CameraChannel[]>([]);

  const allChannels: CameraChannel[] = useMemo(() => {
    return [...siteChannels, ...customChannels, WEBCAM_CHANNEL];
  }, [siteChannels, customChannels]);

  const [selectedChannel, setSelectedChannel] = useState<CameraChannel>(WEBCAM_CHANNEL);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState("");
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [customName, setCustomName] = useState("Device Simulator Stream");
  const [streamError, setStreamError] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

  // Default to first site camera when available
  useEffect(() => {
    if (siteChannels.length > 0) {
      setSelectedChannel((prev) => {
        if (prev && allChannels.some((c) => c.id === prev.id && c.sourceType !== "webcam")) return prev;
        return siteChannels[0];
      });
    }
  }, [siteChannels, allChannels]);

  // Live real-time clock ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString("en-US", { month: "short", day: "2-digit" }) +
          " " +
          now.toLocaleTimeString("en-US", { hour12: false })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const isMjpegStream = Boolean(
    selectedChannel?.url &&
    (selectedChannel.url.includes(".mjpg") ||
     selectedChannel.url.includes("/stream") ||
     selectedChannel.url.includes(":8090") ||
     selectedChannel.url.startsWith("http://") ||
     selectedChannel.url.startsWith("https://")) &&
    !selectedChannel.url.endsWith(".mp4")
  );

  // Handle stream source switching
  useEffect(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      webcamStreamRef.current = null;
    }
    setStreamError(false);

    if (selectedChannel.sourceType === "webcam") {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
          .then((stream) => {
            webcamStreamRef.current = stream;
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              videoRef.current.play().catch(() => {});
              setIsPlaying(true);
              toast.success("Connected to local webcam feed!");
            }
          })
          .catch((err) => {
            toast.error("Camera access denied or unavailable: " + err.message);
            if (siteChannels.length > 0) {
              setSelectedChannel(siteChannels[0]);
            }
          });
      } else {
        toast.error("Webcam media devices API not supported in this browser.");
      }
    } else if (!isMjpegStream && videoRef.current) {
      if (videoRef.current.srcObject) {
        videoRef.current.srcObject = null;
      }
      videoRef.current.src = selectedChannel.url || "";
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [selectedChannel, isMjpegStream, siteChannels]);

  const togglePlay = () => {
    if (isMjpegStream) {
      setIsPlaying((prev) => !prev);
      return;
    }
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleCaptureSnapshot = () => {
    const canvas = document.createElement("canvas");
    if (isMjpegStream && imgRef.current) {
      canvas.width = imgRef.current.naturalWidth || 960;
      canvas.height = imgRef.current.naturalHeight || 540;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(imgRef.current, 0, 0, canvas.width, canvas.height);
        const dataUri = canvas.toDataURL("image/jpeg");
        const a = document.createElement("a");
        a.href = dataUri;
        a.download = `${selectedChannel.code || selectedChannel.id}-snapshot-${Date.now()}.jpg`;
        a.click();
        toast.success(`Snapshot saved from ${selectedChannel.name}`);
      }
    } else if (videoRef.current) {
      canvas.width = videoRef.current.videoWidth || 1280;
      canvas.height = videoRef.current.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUri = canvas.toDataURL("image/jpeg");
        const a = document.createElement("a");
        a.href = dataUri;
        a.download = `${selectedChannel.code || selectedChannel.id}-snapshot-${Date.now()}.jpg`;
        a.click();
        toast.success(`Snapshot saved from ${selectedChannel.name}`);
      }
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleConnectCustomSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl) {
      toast.error("Please enter a valid RTSP or HTTP/MJPEG stream URL");
      return;
    }

    const newChannel: CameraChannel = {
      id: `cam-custom-${Date.now()}`,
      name: customName || "Custom External Camera Node",
      code: "EXT-CAM",
      location: "Device Simulator / External Stream",
      sourceType: "custom",
      url: customUrl.trim(),
      fps: 15,
      resolution: "Live Stream Input",
    };

    setCustomChannels((prev) => [newChannel, ...prev]);
    setSelectedChannel(newChannel);
    setIsConnectModalOpen(false);
    toast.success(`Connected to external stream: ${newChannel.name}`);
  };

  return (
    <>
      <Card className="overflow-hidden">
        {/* Card Header & Channel Selector */}
        <CardHeader className="p-4 sm:p-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 space-y-0 border-b border-zinc-200 dark:border-zinc-800">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                Live Camera Feeds
                <Badge variant="outline" className="text-[11px] px-1.5 py-0 font-normal">
                  {selectedChannel.sourceType === "webcam"
                    ? "Webcam"
                    : isMjpegStream
                    ? "Live MJPEG Stream"
                    : "Video Stream"}
                </Badge>
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Real-time monitoring of connected worksite cameras and external device simulator streams.
            </CardDescription>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Camera Channel Dropdown */}
            <select
              value={selectedChannel.id}
              onChange={(e) => {
                const found = allChannels.find((c) => c.id === e.target.value);
                if (found) setSelectedChannel(found);
              }}
              className="h-8 min-w-0 max-w-[240px] rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none focus:ring-1 focus:ring-amber-500 font-mono"
            >
              {allChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.code ? `[${ch.code}] ` : ""}{ch.name}
                </option>
              ))}
            </select>

            {/* Connect Source Modal */}
            <ConnectSourceModal />
          </div>
        </CardHeader>

        {/* Video Player Display Container */}
        <CardContent className="p-0">
          <div
            ref={containerRef}
            className="relative aspect-video lg:aspect-[21/9] w-full bg-zinc-950 overflow-hidden flex items-center justify-center select-none group"
          >
            {/* Live MJPEG or HTML5 Video Stream */}
            {isMjpegStream ? (
              isPlaying ? (
                <img
                  ref={imgRef}
                  src={streamError ? `/api/v1/cameras/${selectedChannel.id}/snapshot` : selectedChannel.url}
                  alt={selectedChannel.name}
                  onError={() => setStreamError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-zinc-400 font-mono text-xs gap-1">
                  <span>STREAM PAUSED</span>
                  <span className="text-[10px] text-zinc-600">Click play button to resume live feed</span>
                </div>
              )
            ) : (
              <video
                ref={videoRef}
                src={selectedChannel.url || ""}
                autoPlay
                loop
                muted={isMuted}
                playsInline
                className="w-full h-full object-cover"
              />
            )}

            {/* Top-Left: Live Stream & Rec Indicator */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-md border border-white/10 text-white font-mono text-[11px] font-bold shadow-lg">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span>{selectedChannel.sourceType === "webcam" ? "LOCAL" : "LIVE FEED"}</span>
              </div>
              <div className="hidden sm:flex items-center px-2 py-1 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-mono text-zinc-300 border border-white/5">
                {selectedChannel.location}
              </div>
            </div>

            {/* Top-Right: Time & Diagnostics */}
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-md border border-white/10 text-emerald-400 font-mono text-[11px]">
                <span>{selectedChannel.fps} FPS</span>
                <span>•</span>
                <span>{currentTime}</span>
              </div>
            </div>

            {/* Bottom-Left: Camera Spec & Hardware Tag */}
            <div className="absolute bottom-12 left-3 z-20 hidden md:flex items-center gap-2 text-[10px] font-mono text-zinc-300 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded border border-white/10">
              <Radio className="h-3 w-3 text-amber-400" />
              <span>{selectedChannel.code || selectedChannel.id} • {selectedChannel.resolution}</span>
            </div>

            {/* Control Bar Overlay */}
            <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2.5 px-3 flex items-center justify-between text-white text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white"
                  title={isPlaying ? "Pause Stream" : "Resume Stream"}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                </button>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white"
                  title={isMuted ? "Unmute Audio" : "Mute Audio"}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCaptureSnapshot}
                  className="h-7 text-xs text-zinc-200 hover:text-white hover:bg-white/20 px-2"
                >
                  <Camera className="h-3.5 w-3.5 mr-1" />
                  Snapshot
                </Button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white"
                  title="Fullscreen"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Connected Cameras Channel Strip */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950/80 border-t border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium capitalize text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5 text-amber-500" />
                Connected Hardware Cameras ({siteChannels.length} active on site)
              </span>
              <span className="text-[10px] text-zinc-400 font-mono hidden sm:inline">
                Click any camera node to switch feed
              </span>
            </div>

            {siteChannels.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 text-center flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/40 dark:bg-zinc-900/40">
                <div className="text-left">
                  <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    No physical or simulated cameras currently registered for this site
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Run the external device simulator or register an RTSP node to view live construction feeds.
                  </p>
                </div>
                <ConnectSourceModal
                  trigger={
                    <Button size="sm" variant="amber" className="text-xs shrink-0 gap-1.5">
                      <PlugZap className="h-3.5 w-3.5" />
                      Connect Camera Source
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {allChannels.map((ch) => {
                  const isSelected = selectedChannel.id === ch.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setSelectedChannel(ch)}
                      className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? "bg-amber-500/10 border-amber-500 shadow-sm ring-1 ring-amber-500/30"
                          : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-mono font-bold ${isSelected ? "text-amber-600 dark:text-amber-400" : "text-zinc-600 dark:text-zinc-400"}`}>
                          {ch.code || "NODE"}
                        </span>
                        <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-emerald-500 animate-pulse" : "bg-zinc-300 dark:bg-zinc-700"}`} />
                      </div>
                      <div className="mt-1">
                        <p className="text-[10px] font-medium text-zinc-800 dark:text-zinc-200 line-clamp-1 leading-tight">
                          {ch.name}
                        </p>
                        <p className="text-[9px] text-zinc-400 font-mono truncate mt-0.5">
                          {ch.fps} FPS • {ch.sourceType === "webcam" ? "Webcam" : "Live"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Connect Custom Source Dialog */}
      <Dialog open={isConnectModalOpen} onOpenChange={setIsConnectModalOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold font-mono text-zinc-900 dark:text-white flex items-center gap-2">
              <PlugZap className="h-4 w-4 text-amber-500" />
              Connect Custom Video Stream
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Connect to your external device simulator (port 8090) or on-site RTSP camera.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConnectCustomSource} className="space-y-4 pt-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                Stream Label / Node Name
              </label>
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Device Simulator Excavation"
                className="text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                Stream URL (RTSP / HTTP MJPEG)
              </label>
              <Input
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="http://localhost:8090/cameras/excavation.mjpg"
                className="font-mono text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
              />
              <span className="text-[11px] text-zinc-500">
                Example: <code className="font-mono text-amber-500">http://localhost:8090/cameras/excavation.mjpg</code>
              </span>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsConnectModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="amber"
                size="sm"
                className="text-xs font-semibold gap-1.5"
              >
                <PlugZap className="h-3.5 w-3.5" />
                Connect Stream
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
