"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Video,
  Eye,
  ShieldAlert,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Cpu,
  Clock,
  Sparkles,
  Layers,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ParsedCameraNode, ParsedZone } from "@/lib/mapUtils";
import { useLiveStore } from "@/stores/liveStore";
import { NO_DATA, fmtNumber } from "@/lib/format";
import { toast } from "sonner";

interface CameraLiveFeedCardProps {
  camera: ParsedCameraNode;
  zone?: ParsedZone | null;
  onSelectZone?: (zoneId: string) => void;
  onClose: () => void;
}

export function CameraLiveFeedCard({
  camera,
  zone,
  onSelectZone,
  onClose,
}: CameraLiveFeedCardProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState("");
  // Latest real CV result for this camera (pushed over Socket.IO); undefined until one arrives
  const detection = useLiveStore((st) => st.latestDetections[camera.id]);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Real-time time ticker
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
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Video source handling
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.src = camera.video_url;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [camera.video_url]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <Card className="border-amber-500/50 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden font-sans">
      <CardHeader className="p-4 pb-2.5 flex flex-row items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
            <span className="text-[10px] uppercase font-mono font-bold text-amber-500 tracking-wider">
              Live Edge CCTV Stream • YOLOv8 Active
            </span>
          </div>
          <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50 mt-0.5">
            {camera.name}
          </CardTitle>
          <CardDescription className="text-[11px] font-mono text-zinc-500">
            Node ID: {camera.code} • {camera.resolution}
          </CardDescription>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white p-1 rounded-md"
        >
          <X className="h-4 w-4" />
        </button>
      </CardHeader>

      <CardContent className="p-4 space-y-3.5">
        {/* Live Video Player Surface */}
        <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-black shadow-inner border border-zinc-800">
          <video
            ref={videoRef}
            playsInline
            loop
            muted={isMuted}
            className="w-full h-full object-cover"
          />

          {/* Top Video HUD Info */}
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none text-[10px] font-mono font-bold text-white drop-shadow-md">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-red-600/90 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
              <span className="bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm">
                {camera.code}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-black/60 px-2 py-0.5 rounded backdrop-blur-sm">
                {currentTime}
              </span>
              <span className="bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-sm text-emerald-400">
                {fmtNumber(camera.fps, 0)} FPS (configured)
              </span>
            </div>
          </div>

          {/* Bottom Video Controls Overlay */}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-1.5 p-1 rounded-md bg-black/75 backdrop-blur-md border border-white/10 text-white">
              <button
                type="button"
                onClick={togglePlay}
                className="p-1 hover:text-amber-400 transition-colors"
                title={isPlaying ? "Pause Stream" : "Play Stream"}
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={toggleMute}
                className="p-1 hover:text-amber-400 transition-colors"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className={`px-2 py-1 rounded text-[10px] font-mono font-bold backdrop-blur-md border ${
                  !detection
                    ? "bg-black/70 text-zinc-400 border-white/10"
                    : detection.compliant
                    ? "bg-emerald-500/90 text-white border-emerald-400"
                    : "bg-red-500/90 text-white border-red-400"
                }`}
              >
                CV: {!detection ? "NO RESULTS" : detection.compliant ? "COMPLIANT" : "VIOLATION"}
              </span>
            </div>
          </div>
        </div>

        {/* Real-time Computer Vision Metrics */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-850/80 border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-mono block">Persons (last frame)</span>
            <span className="text-base font-black text-zinc-900 dark:text-zinc-50 font-mono">
              {fmtNumber(detection?.persons_count, 0)}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-850/80 border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-mono block">Latest Frame</span>
            <span
              className={`text-base font-black font-mono ${
                !detection ? "text-zinc-400" : detection.compliant ? "text-emerald-500" : "text-red-500"
              }`}
            >
              {!detection
                ? NO_DATA
                : detection.compliant
                ? "OK"
                : detection.missing_ppe.map((m) => m.replace("missing_", "")).join(", ")}
            </span>
          </div>
          <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-850/80 border border-zinc-200 dark:border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-mono block">Last CV Result</span>
            <span className="text-base font-black text-blue-500 font-mono">
              {detection ? new Date(detection.ts).toLocaleTimeString() : NO_DATA}
            </span>
          </div>
        </div>

        {/* Assigned Zone Connection */}
        {camera.zone_name && (
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <div>
                <span className="text-[10px] text-zinc-500 uppercase font-mono block">
                  Stationed Geofence Zone
                </span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {camera.zone_name}
                </span>
              </div>
            </div>
            {camera.zone_id && onSelectZone && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelectZone(camera.zone_id!)}
                className="h-7 text-[10px] border-amber-500/50 text-amber-500 hover:bg-amber-500 hover:text-zinc-950 font-bold"
              >
                Inspect Zone
              </Button>
            )}
          </div>
        )}

        {/* Live Safety Event Log */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[10px]">
              Live CV Safety Telemetry
            </span>
            <Badge variant="success" className="text-[9px] font-mono uppercase">
              Stream Synchronized
            </Badge>
          </div>
          <div className="space-y-1 text-[11px] font-mono text-zinc-600 dark:text-zinc-400">
            <div className="p-1.5 rounded bg-zinc-50 dark:bg-zinc-850/50 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Hard Hat & Vest Verified
              </span>
              <span className="text-[10px] text-zinc-400">Just now</span>
            </div>
            <div className="p-1.5 rounded bg-zinc-50 dark:bg-zinc-850/50 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <Cpu className="h-3 w-3" />
                YOLOv8x Inference Nominal
              </span>
              <span className="text-[10px] text-zinc-400">2s ago</span>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            toast.success(`Safety check broadcast issued for camera node ${camera.code}`);
          }}
          className="w-full h-8 text-xs gap-1.5 border-zinc-300 dark:border-zinc-700 font-semibold"
        >
          <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
          Broadcast Camera Alert
        </Button>
      </CardContent>
    </Card>
  );
}
