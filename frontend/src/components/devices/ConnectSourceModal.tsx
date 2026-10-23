"use client";

import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  PlugZap,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ClipboardPaste,
  Plus,
} from "lucide-react";
import { useProjectStore } from "@/stores/projectStore";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/audio/soundEffects";

export function ConnectSourceModal({
  trigger,
}: {
  trigger?: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sourceType, setSourceType] = useState<"rtsp" | "http" | "mqtt" | "poll">("rtsp");

  // Camera Form States
  const [rtspUrl, setRtspUrl] = useState("");
  const [cameraName, setCameraName] = useState("");
  const [cameraCode, setCameraCode] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    width?: number;
    height?: number;
    fps?: number;
    error?: string;
  } | null>(null);
  const [isAddingCamera, setIsAddingCamera] = useState(false);

  // IoT Sensor Form states
  const [deviceName, setDeviceName] = useState("My Field IoT Sensor");
  const [sensorType, setSensorType] = useState("pm25");
  const [deviceEndpoint, setDeviceEndpoint] = useState("https://my-sensor.local/api/v1/readings");
  const activeSiteId = useProjectStore((s) => s.activeSiteId);
  const ingestKey = "buildtrack_ingest_secret_key_2026";

  const [mqttTopic, setMqttTopic] = useState(
    `sites/${activeSiteId || "0907d5cb-7682-48b7-b78d-c999ce138f34"}/sensors/gas/f7cbf373-22c9-414e-82e1-0cc7e60b55fe`
  );
  const [copied, setCopied] = useState(false);

  const curlExample = `curl -X POST "http://localhost:8000/api/v1/telemetry/ingest" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${ingestKey}" \\
  -d '{
    "sensor_id": "f7cbf373-22c9-414e-82e1-0cc7e60b55fe",
    "site_id": "${activeSiteId || "0907d5cb-7682-48b7-b78d-c999ce138f34"}",
    "type": "${sensorType}",
    "value": 12.5,
    "unit": "${sensorType === "pm25" ? "µg/m³" : sensorType === "noise" ? "dB" : sensorType === "gas" ? "ppm" : "°C"}",
    "battery": 96
  }'`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Command copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestCamera = async () => {
    if (!rtspUrl.trim()) {
      toast.error("Please paste or enter a stream URL first");
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await apiClient.post<any>("/api/v1/cameras/test-connection", {
        stream_url: rtspUrl.trim(),
      });
      setTestResult(res);
      if (res.ok) {
        toast.success(`Stream reachable! (${res.width}x${res.height} @ ${res.fps || 10} FPS)`);
      } else {
        toast.error(`Connection failed: ${res.error || "Unable to reach stream"}`);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Connection test failed";
      setTestResult({ ok: false, error: msg });
      toast.error(msg);
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnectCamera = async () => {
    if (!rtspUrl.trim()) {
      toast.error("Please enter a camera stream URL");
      return;
    }
    if (!activeSiteId) {
      toast.error("No active site selected");
      return;
    }

    const derivedName =
      cameraName.trim() ||
      (rtspUrl.includes("excavation")
        ? "Excavation Pit Camera"
        : rtspUrl.includes("tower-crane")
        ? "Tower Crane Camera"
        : rtspUrl.includes("north-gate")
        ? "North Perimeter Gate"
        : rtspUrl.includes("concrete-deck")
        ? "Concrete Pour Deck"
        : rtspUrl.includes("synthetic-yard")
        ? "Synthetic Construction Yard"
        : `Camera ${rtspUrl.split("/").pop()?.replace(".mjpg", "") || "Feed"}`);

    const derivedCode =
      cameraCode.trim() || `CAM-${Math.floor(1000 + Math.random() * 9000)}`;

    setIsAddingCamera(true);
    try {
      await apiClient.post(`/api/v1/sites/${activeSiteId}/cameras`, {
        name: derivedName,
        camera_code: derivedCode,
        stream_url: rtspUrl.trim(),
        fps: testResult?.fps ? Math.round(testResult.fps) : 10,
        is_cv_enabled: true,
      });

      playNotificationSound("success");
      toast.success(`Camera "${derivedName}" connected to site!`);
      await queryClient.invalidateQueries({ queryKey: ["cameras", activeSiteId] });
      await queryClient.invalidateQueries({ queryKey: ["sites", activeSiteId] });
      setOpen(false);
      setRtspUrl("");
      setCameraName("");
      setCameraCode("");
      setTestResult(null);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Failed to register camera";
      toast.error(msg);
    } finally {
      setIsAddingCamera(false);
    }
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
                Connect External Hardware & Camera Streams
              </DialogTitle>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Paste your camera feed URL or ingest telemetry from field sensors.
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Protocol selector tabs */}
          <Tabs value={sourceType} onValueChange={(v) => setSourceType(v as any)}>
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="rtsp" className="text-xs gap-1.5 font-semibold">
                <Video className="h-3.5 w-3.5" />
                <span>Camera Feed</span>
              </TabsTrigger>
              <TabsTrigger value="http" className="text-xs gap-1.5 font-semibold">
                <Globe className="h-3.5 w-3.5" />
                <span>REST / POST</span>
              </TabsTrigger>
              <TabsTrigger value="mqtt" className="text-xs gap-1.5 font-semibold">
                <Radio className="h-3.5 w-3.5" />
                <span>MQTT Broker</span>
              </TabsTrigger>
              <TabsTrigger value="poll" className="text-xs gap-1.5 font-semibold">
                <Terminal className="h-3.5 w-3.5" />
                <span>API Polling</span>
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: RTSP / MJPEG Camera Feed */}
            <TabsContent value="rtsp" className="space-y-4 pt-3 text-xs">
              {/* Endpoint URL Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Video className="h-3.5 w-3.5 text-amber-500" />
                    Camera Stream URL (MJPEG / RTSP)
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        const clip = await navigator.clipboard.readText();
                        if (clip) {
                          setRtspUrl(clip.trim());
                          setTestResult(null);
                          toast.info("Pasted URL from clipboard");
                        }
                      } catch {
                        toast.info("Paste your endpoint directly into the input");
                      }
                    }}
                    className="h-6 px-2 text-[11px] gap-1 text-zinc-500 hover:text-amber-500 cursor-pointer"
                  >
                    <ClipboardPaste className="h-3 w-3" />
                    <span>Paste URL</span>
                  </Button>
                </div>
                <Input
                  value={rtspUrl}
                  onChange={(e) => {
                    setRtspUrl(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder="Paste stream URL (e.g. http://localhost:8090/cameras/excavation.mjpg)"
                  className="font-mono text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                />
                <span className="text-[11px] text-zinc-500">
                  Accepts HTTP MJPEG (<code className="font-mono text-amber-500">.mjpg</code>) or RTSP streams from the device simulator or network cameras.
                </span>
              </div>

              {/* Camera Name and Code */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Camera Display Name
                  </label>
                  <Input
                    value={cameraName}
                    onChange={(e) => setCameraName(e.target.value)}
                    placeholder="e.g. Excavation Pit Gate 1"
                    className="h-8 text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Camera ID / Code
                  </label>
                  <Input
                    value={cameraCode}
                    onChange={(e) => setCameraCode(e.target.value)}
                    placeholder="e.g. CAM-01 (or auto-generated)"
                    className="h-8 text-xs font-mono bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                  />
                </div>
              </div>

              {/* Test Connection Result Box */}
              {testResult && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                    testResult.ok
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-red-500/10 border-red-500/30 text-red-400"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testResult.ok ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    <div className="font-mono text-[11px]">
                      {testResult.ok ? (
                        <span>
                          Stream Verified: {testResult.width}x{testResult.height} @ {testResult.fps || 10} FPS
                        </span>
                      ) : (
                        <span>Error: {testResult.error || "Connection failed"}</span>
                      )}
                    </div>
                  </div>
                  {testResult.ok && (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 font-mono text-[10px]">
                      Ready
                    </Badge>
                  )}
                </div>
              )}

              {/* Live Preview Box if URL is entered */}
              {rtspUrl && (rtspUrl.includes(".mjpg") || rtspUrl.includes(":8090")) && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="font-mono">Live Stream Preview</span>
                    <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Streaming
                    </span>
                  </div>
                  <div className="relative aspect-video w-full max-h-44 rounded-lg overflow-hidden bg-black border border-zinc-800 flex items-center justify-center">
                    <img
                      src={rtspUrl}
                      alt="Stream test preview"
                      className="w-full h-full object-cover"
                      onError={() => {
                        // Keep image container clean on error
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Connection Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTestCamera}
                  disabled={isTesting || !rtspUrl.trim()}
                  className="h-8 text-xs border-zinc-300 dark:border-zinc-700 cursor-pointer"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                      Testing...
                    </>
                  ) : (
                    "Test Stream"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="amber"
                  size="sm"
                  onClick={handleConnectCamera}
                  disabled={isAddingCamera || !rtspUrl.trim()}
                  className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
                >
                  {isAddingCamera ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      Connect & Add Camera
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* Tab 2: HTTP Ingestion */}
            <TabsContent value="http" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 gap-3 text-xs mb-2">
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
                    <option value="gas">Hazardous Gas (ppm)</option>
                    <option value="vibration">Vibration (mm/s)</option>
                    <option value="wind_speed">Wind Speed (km/h)</option>
                  </select>
                </div>
              </div>

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
                    cURL Test Command
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

            {/* Tab 3: MQTT Broker */}
            <TabsContent value="mqtt" className="space-y-3 pt-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">
                  MQTT Ingestion Topic Pattern
                </label>
                <Input
                  value={mqttTopic}
                  onChange={(e) => setMqttTopic(e.target.value)}
                  className="font-mono text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
                />
                <span className="text-[11px] text-zinc-500">
                  Broker Address: <b className="font-mono text-zinc-300">mqtt://localhost:1883</b> (Mosquitto) • Topic: <code className="font-mono text-amber-500">sites/&#123;site_id&#125;/sensors/&#123;type&#125;/&#123;sensor_id&#125;</code>
                </span>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-zinc-400">Publish Test Reading via CLI</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      handleCopy(
                        `mosquitto_pub -h localhost -p 1883 -t '${mqttTopic}' -m '{"value": 12.5, "unit": "ppm"}'`
                      )
                    }
                    className="h-6 px-2 text-[11px] gap-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre className="p-3 rounded-lg bg-zinc-950 text-amber-400 font-mono text-[11px] overflow-x-auto border border-zinc-800">
                  {`mosquitto_pub -h localhost -p 1883 -t '${mqttTopic}' -m '{"value": 12.5, "unit": "ppm"}'`}
                </pre>
              </div>
            </TabsContent>

            {/* Tab 4: API Polling */}
            <TabsContent value="poll" className="space-y-3 pt-3 text-xs">
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
              Status: Ready to connect
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
