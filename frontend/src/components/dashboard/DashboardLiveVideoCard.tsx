"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Video,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Camera,
  PlugZap,
  Radio,
  Layers,
  Sparkles,
  Settings2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
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
import { StatusDot } from "@/components/common/StatusDot";
import { toast } from "sonner";
import { ALL_CONSTRUCTION_CAMERAS } from "@/lib/constants/cameras";

interface CameraPreset {
  id: string;
  name: string;
  location: string;
  sourceType: "local" | "webcam" | "custom";
  url?: string;
  fps: number;
  resolution: string;
}

const PRESET_CHANNELS: CameraPreset[] = [
  ...ALL_CONSTRUCTION_CAMERAS.map((cam) => ({
    id: cam.id,
    name: cam.name,
    location: cam.location,
    sourceType: "local" as const,
    url: cam.url,
    fps: cam.fps,
    resolution: cam.resolution,
  })),
  {
    id: "cam-webcam",
    name: "Live Local Device / Hardware Camera",
    location: "Active Operator Webcam Feed",
    sourceType: "webcam",
    fps: 30,
    resolution: "Direct Sensor Passthrough",
  },
];

export function DashboardLiveVideoCard() {
  const [selectedChannel, setSelectedChannel] = useState<CameraPreset>(PRESET_CHANNELS[0]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState("");
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [customName, setCustomName] = useState("Custom Hardware RTSP Node");

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);

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

  // Handle stream source switching
  useEffect(() => {
    // Stop any existing webcam track
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      webcamStreamRef.current = null;
    }

    if (!videoRef.current) return;

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
              toast.success("Connected to local device camera feed!");
            }
          })
          .catch((err) => {
            toast.error("Camera access denied or unavailable: " + err.message);
            // Fall back to preset 0
            setSelectedChannel(PRESET_CHANNELS[0]);
          });
      } else {
        toast.error("Webcam media devices API not supported in this browser.");
      }
    } else {
      if (videoRef.current.srcObject) {
        videoRef.current.srcObject = null;
      }
      videoRef.current.src = selectedChannel.url || "/sample-stream.mp4";
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [selectedChannel]);


  const togglePlay = () => {
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
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUri = canvas.toDataURL("image/jpeg");
      const a = document.createElement("a");
      a.href = dataUri;
      a.download = `buildtrack-snapshot-${Date.now()}.jpg`;
      a.click();
      toast.success("Snapshot saved from live camera feed!");
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
      toast.error("Please enter a valid RTSP, HLS, or HTTP stream URL");
      return;
    }

    const newChannel: CameraPreset = {
      id: `cam-custom-${Date.now()}`,
      name: customName || "Custom RTSP Edge Node",
      location: "External Integration Endpoint",
      sourceType: "custom",
      url: customUrl,
      fps: 24,
      resolution: "User Ingested Feed",
    };

    setSelectedChannel(newChannel);
    setIsConnectModalOpen(false);
    toast.success(`Connected to custom stream: ${newChannel.name}`);
  };

  return (
    <>
      <Card className="overflow-hidden border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-md">
        {/* Card Header & Channel Selector */}
        <CardHeader className="p-4 sm:p-5 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-zinc-950 font-bold">
                <Video className="h-4 w-4" />
              </div>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Site Camera Viewer
                <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                  {selectedChannel.sourceType === "webcam" ? "WEBCAM" : "VIDEO FILE"}
                </Badge>
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Plays the configured camera sources (local video files or your webcam). Video is not analysed in the
              browser; computer-vision results are on the Safety page.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {/* Camera Preset Dropdown */}
            <select
              value={selectedChannel.id}
              onChange={(e) => {
                const found = PRESET_CHANNELS.find((c) => c.id === e.target.value);
                if (found) setSelectedChannel(found);
              }}
              className="h-8 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2.5 text-xs font-mono font-medium text-zinc-800 dark:text-zinc-200 outline-none focus:ring-1 focus:ring-amber-500"
            >
              {PRESET_CHANNELS.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name}
                </option>
              ))}
            </select>

            {/* Connect Custom Source Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConnectModalOpen(true)}
              className="h-8 text-xs gap-1.5 font-bold border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-850 hover:border-amber-500"
            >
              <PlugZap className="h-3.5 w-3.5 text-amber-500" />
              <span className="hidden sm:inline">Connect Source</span>
            </Button>
          </div>
        </CardHeader>

        {/* Video Player Display Container */}
        <CardContent className="p-0">
          <div
            ref={containerRef}
            className="relative aspect-video w-full bg-zinc-950 overflow-hidden flex items-center justify-center select-none group"
          >
            {/* HTML5 Real Video Feed */}
            <video
              ref={videoRef}
              src={selectedChannel.url || "/sample-stream.mp4"}
              autoPlay
              loop
              muted={isMuted}
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Scanline CRT overlay for industrial control room aesthetic */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.22)_50%)] bg-[size:100%_4px] pointer-events-none opacity-60" />


            {/* Top-Left: Live Stream & Rec Indicator */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-md border border-white/10 text-white font-mono text-[11px] font-bold shadow-lg">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span>{selectedChannel.sourceType === "webcam" ? "LIVE" : "PLAYBACK"}</span>
              </div>
              <div className="hidden sm:flex items-center px-2 py-1 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-mono text-zinc-300 border border-white/5">
                {selectedChannel.location}
              </div>
            </div>

            {/* Top-Right: Time & Bitstream Diagnostics */}
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
              <span>{selectedChannel.resolution}</span>
            </div>

            {/* Control Bar Overlay (appears on hover / always accessible) */}
            <div className="absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2.5 px-3 flex items-center justify-between text-white text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white"
                  title={isPlaying ? "Pause Stream" : "Resume Stream"}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                </button>
                <button
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
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white"
                  title="Fullscreen"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Interactive 8-Camera Quick Channel Strip */}
          <div className="p-3 bg-zinc-50 dark:bg-zinc-950/80 border-t border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 font-mono flex items-center gap-1.5">
                <Camera className="h-3.5 w-3.5 text-amber-500" />
                Available Video Sources (8 Streams + Hardware Camera)
              </span>
              <span className="text-[10px] text-zinc-400 font-mono hidden sm:inline">
                Click any camera node to switch live feed
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {PRESET_CHANNELS.slice(0, 8).map((ch, idx) => {
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
                      <span className={`text-[10px] font-black font-mono uppercase ${
                        isSelected ? "text-amber-600 dark:text-amber-400" : "text-zinc-600 dark:text-zinc-400"
                      }`}>
                        {`CAM-0${idx + 1}`}
                      </span>
                      <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? "bg-emerald-500 animate-pulse" : "bg-zinc-300 dark:bg-zinc-700"}`} />
                    </div>
                    <div className="mt-1">
                      <p className="text-[10px] font-medium text-zinc-800 dark:text-zinc-200 line-clamp-1 leading-tight">
                        {ch.name.split(": ")[1] || ch.name}
                      </p>
                      <p className="text-[9px] text-zinc-400 font-mono truncate mt-0.5">
                        {ch.fps} FPS • {ch.resolution.includes("4K") ? "4K" : "1080p"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
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
              Integrate your on-site IP camera, RTSP gateway, HLS stream, or local network video encoder.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConnectCustomSource} className="space-y-4 pt-2 text-xs">
            {/* Quick-select from the 8 available site feeds */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 block">
                Quick-Select Available On-Site Stream:
              </span>
              <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                {ALL_CONSTRUCTION_CAMERAS.map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => {
                      setCustomName(cam.name);
                      setCustomUrl(cam.url);
                    }}
                    className="p-1.5 text-left rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:border-amber-500 text-[10px] transition-colors"
                  >
                    <span className="font-bold text-zinc-800 dark:text-zinc-200 block truncate">{cam.camera_code}</span>
                    <span className="text-zinc-500 truncate block">{cam.name.split(": ")[1]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Camera / Feed Label</label>
              <Input
                placeholder="e.g. Scaffolding Gate Camera 04"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                Stream Endpoint URL (RTSP / HTTP / HLS)
              </label>
              <Input
                placeholder="rtsp://admin:pass@192.168.1.120:554/live or /videos/...mp4"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-mono text-zinc-900 dark:text-zinc-100"
                required
              />
              <span className="text-[10px] text-zinc-500 block pt-0.5">
                Supports RTSP-over-WebSocket, HLS (.m3u8), MP4 HTTP stream, or local edge proxy.
              </span>
            </div>

            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
              <div className="flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-200">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Hardware Camera Ready
              </div>
              <p>
                You can also switch to <b>&quot;Live Local Device / Hardware Camera&quot;</b> in the channel dropdown anytime to use your laptop or connected USB inspection camera directly.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsConnectModalOpen(false)}
                className="border-zinc-300 dark:border-zinc-700"
              >
                Cancel
              </Button>
              <Button type="submit" variant="amber" size="sm" className="font-bold">
                Connect Stream
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
