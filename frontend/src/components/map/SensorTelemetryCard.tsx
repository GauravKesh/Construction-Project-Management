"use client";

import React, { useState, useEffect } from "react";
import {
  Radio,
  Activity,
  Battery,
  Wifi,
  Clock,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  MapPin,
  X,
  Gauge,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ParsedSensorNode, ParsedZone } from "@/lib/mapUtils";
import { useLiveStore } from "@/stores/liveStore";
import { NO_DATA, fmtNumber, fmtPct } from "@/lib/format";
import { toast } from "sonner";

interface SensorTelemetryCardProps {
  sensor: ParsedSensorNode;
  zone?: ParsedZone | null;
  onSelectZone?: (zoneId: string) => void;
  onClose: () => void;
}

export function SensorTelemetryCard({
  sensor,
  zone,
  onSelectZone,
  onClose,
}: SensorTelemetryCardProps) {
  // Real readings only: latest/history from the Socket.IO live store, else the map payload
  const live = useLiveStore((st) => st.sensorLatest[sensor.id]);
  const livePoints = useLiveStore((st) => st.sensorHistory[sensor.id]);
  const liveValue: number | null = live?.value ?? sensor.value;
  const history: number[] = livePoints?.length ? livePoints.map((p) => p.val) : sensor.history ?? [];
  const lastUpdate = live ? new Date(live.ts).toLocaleTimeString() : null;

  const minThresh = sensor.min_threshold;
  const maxThresh = sensor.max_threshold;
  const hasEnvelope = minThresh !== undefined && maxThresh !== undefined && maxThresh > minThresh;
  const pct =
    hasEnvelope && liveValue !== null
      ? Math.min(100, Math.max(0, ((liveValue - minThresh) / (maxThresh - minThresh)) * 100))
      : 0;

  // Status relative to the sensor's configured thresholds (if any)
  const isHigh = hasEnvelope && liveValue !== null && liveValue >= maxThresh * 0.85;
  const isCritical = hasEnvelope && liveValue !== null && liveValue >= maxThresh;

  // Generate SVG sparkline points
  const sparkWidth = 260;
  const sparkHeight = 65;
  const minH = history.length ? Math.min(...history) * 0.95 : 0;
  const maxH = history.length ? Math.max(...history) * 1.05 || minH + 1 : 1;
  const points = history
    .map((val, idx) => {
      const x = (idx / (history.length - 1 || 1)) * sparkWidth;
      const y = sparkHeight - ((val - minH) / (maxH - minH)) * (sparkHeight - 14) - 7;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <Card className="border-blue-500/50 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden font-sans">
      <CardHeader className="p-4 pb-2.5 flex flex-row items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
            <span className="text-[10px] uppercase font-mono font-bold text-blue-500 tracking-wider">
              IoT Real-Time Telemetry Node
            </span>
          </div>
          <CardTitle className="text-sm font-bold text-zinc-900 dark:text-zinc-50 mt-0.5">
            {sensor.name}
          </CardTitle>
          <CardDescription className="text-[11px] font-mono text-zinc-500">
            Node ID: {sensor.code}
          </CardDescription>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white p-1 rounded-md"
        >
          <X className="h-4 w-4" />
        </button>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Large Primary Readout */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-blue-500/10 via-zinc-50 to-white dark:from-blue-950/30 dark:via-zinc-900 dark:to-zinc-900 border border-blue-500/30 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-zinc-500 block">
              Current Live Value
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-3xl font-black font-mono text-blue-600 dark:text-blue-400">
                {fmtNumber(liveValue, 2)}
              </span>
              <span className="text-sm font-bold text-zinc-500 font-mono">
                {sensor.unit}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-zinc-500">
              <Activity className="h-3 w-3 text-emerald-500 animate-pulse" />
              <span>{lastUpdate ? `Last reading: ${lastUpdate}` : "No live reading yet"}</span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <Badge
              variant={isCritical ? "destructive" : isHigh ? "warning" : hasEnvelope ? "success" : "outline"}
              className="text-[10px] font-mono uppercase px-2 py-0.5"
            >
              {!hasEnvelope || liveValue === null
                ? "NO THRESHOLDS"
                : isCritical
                ? "ABOVE MAX"
                : isHigh
                ? "NEAR MAX"
                : "WITHIN RANGE"}
            </Badge>
          </div>
        </div>

        {/* Operating Envelope Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500">
            <span>Min: {fmtNumber(minThresh)} {sensor.unit}</span>
            <span className="font-bold text-zinc-700 dark:text-zinc-300">
              {hasEnvelope && liveValue !== null ? `${pct.toFixed(0)}% of range` : NO_DATA}
            </span>
            <span>Max: {fmtNumber(maxThresh)} {sensor.unit}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden relative">
            <div
              className={`h-full transition-all duration-500 ${
                isCritical
                  ? "bg-red-500"
                  : isHigh
                  ? "bg-amber-500"
                  : "bg-blue-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Live Sparkline Waveform */}
        <div className="p-3 rounded-lg bg-zinc-100/70 dark:bg-zinc-850/80 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span className="flex items-center gap-1">
              <Gauge className="h-3 w-3 text-blue-500" />
              Recent readings ({history.length})
            </span>
            <span className="text-zinc-500 font-bold uppercase">{live ? "Live" : "Idle"}</span>
          </div>
          <div className="h-[70px] w-full flex items-center justify-center">
            <svg viewBox={`0 0 ${sparkWidth} ${sparkHeight}`} className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="sensorGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Fill area */}
              {history.length > 1 && (
                <polygon
                  points={`0,${sparkHeight} ${points} ${sparkWidth},${sparkHeight}`}
                  fill="url(#sensorGrad)"
                />
              )}
              {/* Stroke line */}
              {history.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={points}
                />
              )}
              {/* Last point circle */}
              {history.length > 0 && (
                <circle
                  cx={sparkWidth}
                  cy={sparkHeight - ((history[history.length - 1] - minH) / (maxH - minH)) * (sparkHeight - 14) - 7}
                  r="4"
                  fill="#60a5fa"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              )}
            </svg>
          </div>
        </div>

        {/* Hardware Diagnostics */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-850/50 border border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
            <Battery className="h-4 w-4 text-emerald-500" />
            <div>
              <span className="text-[10px] text-zinc-400 block font-mono">Battery Reserve</span>
              <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                {fmtPct(live?.battery ?? sensor.battery_level, 0)}
              </span>
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-850/50 border border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <div>
              <span className="text-[10px] text-zinc-400 block font-mono">Last Reading</span>
              <span className="font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                {lastUpdate ?? NO_DATA}
              </span>
            </div>
          </div>
        </div>

        {/* Stationed Zone Link */}
        {sensor.zone_name && (
          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <div>
                <span className="text-[10px] text-zinc-500 uppercase font-mono block">
                  Stationed Geofence Zone
                </span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {sensor.zone_name}
                </span>
              </div>
            </div>
            {sensor.zone_id && onSelectZone && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelectZone(sensor.zone_id!)}
                className="h-7 text-[10px] border-blue-500/50 text-blue-500 hover:bg-blue-500 hover:text-white font-bold"
              >
                Inspect Zone
              </Button>
            )}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            toast.success(`Broadcasting calibrate signal to telemetry sensor ${sensor.code}`);
          }}
          className="w-full h-8 text-xs gap-1.5 border-zinc-300 dark:border-zinc-700 font-semibold"
        >
          <ShieldAlert className="h-3.5 w-3.5 text-blue-500" />
          Broadcast Sensor Diagnostics
        </Button>
      </CardContent>
    </Card>
  );
}
