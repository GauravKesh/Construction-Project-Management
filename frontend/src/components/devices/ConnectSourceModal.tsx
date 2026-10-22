"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Radio,
  Video,
  Globe,
  Terminal,
  Copy,
  Check,
  Send,
  Plus,
  PlugZap,
  Sparkles,
} from "lucide-react";
import { useLiveStore } from "@/stores/liveStore";
import { useProjectStore } from "@/stores/projectStore";
import { toast } from "sonner";
import { ALL_CONSTRUCTION_CAMERAS } from "@/lib/constants/cameras";

export function ConnectSourceModal({
  trigger,
}: {
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [sourceType, setSourceType] = useState<"http" | "mqtt" | "rtsp" | "poll">("http");

  // Form states
  const [deviceName, setDeviceName] = useState("My Field IoT Sensor");
  const [sensorType, setSensorType] = useState("pm25");
  const [deviceEndpoint, setDeviceEndpoint] = useState("https://my-sensor.local/api/v1/readings");
  const [mqttTopic, setMqttTopic] = useState("construction/site-01/custom-sensor-01/telemetry");
  const [rtspUrl, setRtspUrl] = useState("rtsp://admin:pass@192.168.1.100:554/live/ch0");
  const [copied, setCopied] = useState(false);

  const activeSiteId = useProjectStore((s) => s.activeSiteId);
  // Devices authenticate with the backend's INGEST_API_KEY (see backend/.env.example)
  const ingestKeyPlaceholder = "<INGEST_API_KEY from backend .env>";

  const curlExample = `curl -X POST "http://localhost:8000/api/v1/telemetry/ingest" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${ingestKeyPlaceholder}" \\
  -d '{
    "sensor_id": "custom-${sensorType}-01",
    "site_id": "${activeSiteId || "site-default"}",
    "type": "${sensorType}",
    "value": 42.8,
    "unit": "${sensorType === "pm25" ? "µg/m³" : sensorType === "noise" ? "dB" : "°C"}",
    "battery": 96
  }'`;

  const pythonExample = `import requests, time

URL = "http://localhost:8000/api/v1/telemetry/ingest"
HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": "${ingestKeyPlaceholder}"
}

payload = {
    "sensor_id": "custom-${sensorType}-01",
    "site_id": "${activeSiteId || "site-default"}",
    "type": "${sensorType}",
    "value": 48.5,
    "unit": "${sensorType === "pm25" ? "µg/m³" : "dB"}",
    "battery": 92
}

response = requests.post(URL, json=payload, headers=HEADERS)
print("Ingest status:", response.status_code)`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Command copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs font-semibold border-amber-500/40 text-amber-500 hover:bg-amber-500/10 cursor-pointer"
          >
            <PlugZap className="h-3.5 w-3.5" />
            <span>Connect Source</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 p-0 overflow-hidden shadow-2xl">
        <DialogHeader className="p-6 pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-zinc-950 font-bold">
              <PlugZap className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold font-mono">
                Connect Custom Hardware & Ingestion Source
              </DialogTitle>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Stream real telemetry from your own IoT sensors, edge microcontroller, or RTSP cameras.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Protocol selector tabs */}
          <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="http" className="text-xs gap-1.5 font-semibold">
                <Globe className="h-3.5 w-3.5" />
                <span>REST / POST</span>
              </TabsTrigger>
              <TabsTrigger value="mqtt" className="text-xs gap-1.5 font-semibold">
                <Radio className="h-3.5 w-3.5" />
                <span>MQTT Broker</span>
              </TabsTrigger>
              <TabsTrigger value="rtsp" className="text-xs gap-1.5 font-semibold">
                <Video className="h-3.5 w-3.5" />
                <span>RTSP Stream</span>
              </TabsTrigger>
              <TabsTrigger value="poll" className="text-xs gap-1.5 font-semibold">
                <Terminal className="h-3.5 w-3.5" />
                <span>API Polling</span>
              </TabsTrigger>
            </TabsList>

            {/* General parameters */}
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Device Label</label>
                <Input
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g. Tower B Dust Monitor"
                  className="h-8 text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Telemetry Metric Type</label>
                <select
                  value={sensorType}
                  onChange={(e) => setSensorType(e.target.value)}
                  className="w-full h-8 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 text-xs font-mono"
                >
                  <option value="pm25">Particulate Matter (PM2.5)</option>
                  <option value="pm10">Coarse Dust (PM10)</option>
                  <option value="noise">Acoustic Noise (dB)</option>
                  <option value="temperature">Temperature (°C)</option>
                  <option value="humidity">Relative Humidity (%)</option>
                  <option value="gas_co">Carbon Monoxide (ppm)</option>
                  <option value="vibration">Vibration (mm/s)</option>
                  <option value="wind_speed">Wind Speed (km/h)</option>
                </select>
              </div>
            </div>

            {/* Tab 1: HTTP Ingestion */}
            <TabsContent value="http" className="space-y-3 pt-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Direct Ingestion Endpoint
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px] text-amber-500 border-amber-500/30">
                    POST JSON
                  </Badge>
                </div>
                <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-xs text-zinc-800 dark:text-zinc-200 flex items-center justify-between">
                  <span className="truncate">/api/v1/telemetry/ingest</span>
                  <span className="text-[10px] text-zinc-400">Port 8000 / 3000</span>
                </div>
              </div>

              {/* Code Snippet Box */}
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Terminal className="h-3.5 w-3.5 text-amber-500" />
                    Copy-Paste Terminal cURL Test
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(curlExample)}
                    className="h-6 px-2 text-[11px] gap-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre className="p-3 rounded-lg bg-zinc-950 text-amber-400 font-mono text-[11px] overflow-x-auto border border-zinc-800">
                  {curlExample}
                </pre>
              </div>
            </TabsContent>

            {/* Tab 2: MQTT Broker */}
            <TabsContent value="mqtt" className="space-y-3 pt-2 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                  MQTT Ingestion Topic
                </label>
                <Input
                  value={mqttTopic}
                  onChange={(e) => setMqttTopic(e.target.value)}
                  className="font-mono text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                />
                <span className="text-[11px] text-zinc-500">
                  Broker Address: <b className="font-mono text-zinc-300">mqtt://localhost:1883</b> (Mosquitto / EMQX)
                </span>
              </div>
            </TabsContent>

            {/* Tab 3: RTSP Camera Feed */}
            <TabsContent value="rtsp" className="space-y-4 pt-2 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                  RTSP Video Feed Stream URL
                </label>
                <Input
                  value={rtspUrl}
                  onChange={(e) => setRtspUrl(e.target.value)}
                  placeholder="rtsp://user:pass@192.168.1.100:554/stream or /videos/...mp4"
                  className="font-mono text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                />
                <span className="text-[11px] text-zinc-500">
                  Frames are sampled at 24-60 FPS and analyzed for PPE compliance automatically.
                </span>
              </div>

              {/* 8 Available Video Streams Grid */}
              <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                    <Video className="h-3.5 w-3.5 text-amber-500" />
                    Available On-Site Video Sources (8 Streams Ready):
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    Click to select source
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {ALL_CONSTRUCTION_CAMERAS.map((cam) => {
                    const isSelected = rtspUrl === cam.url;
                    return (
                      <button
                        key={cam.id}
                        type="button"
                        onClick={() => {
                          setRtspUrl(cam.url);
                          setDeviceName(cam.name);
                        }}
                        className={`p-2 text-left rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30"
                            : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[11px] text-amber-600 dark:text-amber-400">
                            {cam.camera_code}
                          </span>
                          <span className="text-[9px] font-mono text-zinc-400">
                            {cam.fps} FPS
                          </span>
                        </div>
                        <p className="font-medium text-zinc-900 dark:text-zinc-100 text-[11px] truncate mt-1">
                          {cam.name.split(": ")[1] || cam.name}
                        </p>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                          {cam.location}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* Tab 4: API Polling */}
            <TabsContent value="poll" className="space-y-3 pt-2 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                  Your Device HTTP Endpoint (BuildTrack Polls Every 5s)
                </label>
                <Input
                  value={deviceEndpoint}
                  onChange={(e) => setDeviceEndpoint(e.target.value)}
                  className="font-mono text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Action Footer */}
          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-[11px] text-zinc-500 font-mono">
              Status: Ready to ingest packets
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                className="text-xs border-zinc-300 dark:border-zinc-700"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
