"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Crosshair, Loader2, MapPin, Plug, Radio, Video, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api/client";
import { isPointInPolygon, ParsedZone } from "@/lib/mapUtils";
import { toast } from "sonner";

export type DeviceKind = "sensor" | "camera";

const SENSOR_TYPES: { value: string; label: string; unit: string }[] = [
  { value: "temperature", label: "Temperature", unit: "°C" },
  { value: "humidity", label: "Humidity", unit: "%" },
  { value: "gas", label: "Gas", unit: "ppm" },
  { value: "noise", label: "Noise", unit: "dB" },
  { value: "vibration", label: "Vibration", unit: "mm/s" },
  { value: "dust", label: "Dust", unit: "ug/m3" },
  { value: "tilt", label: "Tilt", unit: "deg" },
];

const inputClass = "h-9 text-sm";
const labelClass = "text-xs font-medium text-zinc-600 dark:text-zinc-400";

function shortId() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

function ZoneSelect({
  zones,
  value,
  onChange,
}: {
  zones: ParsedZone[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2.5 text-sm"
    >
      <option value="">No zone</option>
      {zones.map((z) => (
        <option key={z.id} value={z.id}>
          {z.name}
        </option>
      ))}
    </select>
  );
}

/**
 * Step 1 asks for a map click; step 2 registers the sensor or camera at that point.
 */
export function AddDevicePanel({
  kind,
  siteId,
  point,
  zones,
  initialZoneId,
  onCancel,
  onCreated,
}: {
  kind: DeviceKind;
  siteId: string;
  point: [number, number] | null;
  zones: ParsedZone[];
  /** Zone chosen up front (e.g. "Add camera here" from a zone); overrides detection */
  initialZoneId?: string;
  onCancel: () => void;
  onCreated: (kind: DeviceKind, id: string) => void;
}) {
  const queryClient = useQueryClient();
  const zoneAtPoint = useMemo(
    () => (point ? zones.find((z) => isPointInPolygon(point, z.coordinates))?.id ?? "" : ""),
    [point, zones]
  );
  const [zoneOverride, setZoneOverride] = useState<string | null>(null);
  // Precedence: explicit choice, then the zone containing the point, then the zone we started from
  const zoneId = zoneOverride ?? (zoneAtPoint || initialZoneId || "");

  // Sensor fields
  const [sensorType, setSensorType] = useState("gas");
  const [unit, setUnit] = useState("ppm");
  const [minThreshold, setMinThreshold] = useState("");
  const [maxThreshold, setMaxThreshold] = useState("");

  // Camera fields
  const [streamUrl, setStreamUrl] = useState("");
  const [fps, setFps] = useState(2);
  const [cvEnabled, setCvEnabled] = useState(true);
  const [testResult, setTestResult] = useState<any | null>(null);

  // Shared
  const [name, setName] = useState("");
  const [code, setCode] = useState(() => `${kind === "camera" ? "CAM" : "GAS"}-${shortId()}`);

  const Icon = kind === "camera" ? Video : Radio;
  const location = point ? { type: "Point", coordinates: [point[1], point[0]] } : null;

  const testConnection = useMutation({
    mutationFn: () => apiClient.post<any>("/api/v1/cameras/test-connection", { stream_url: streamUrl.trim() }),
    onSuccess: (res) => setTestResult(res),
    onError: (err: any) => setTestResult({ ok: false, error: err.message }),
  });

  const create = useMutation({
    mutationFn: () => {
      const common = {
        name: name.trim(),
        zone_id: zoneId || undefined,
        location_geojson: location,
      };
      if (kind === "sensor") {
        return apiClient.post<any>(`/api/v1/sites/${siteId}/sensors`, {
          ...common,
          sensor_code: code.trim(),
          sensor_type: sensorType,
          unit: unit.trim(),
          min_threshold: minThreshold === "" ? undefined : Number(minThreshold),
          max_threshold: maxThreshold === "" ? undefined : Number(maxThreshold),
        });
      }
      return apiClient.post<any>(`/api/v1/sites/${siteId}/cameras`, {
        ...common,
        camera_code: code.trim(),
        stream_url: streamUrl.trim(),
        fps,
        is_cv_enabled: cvEnabled,
      });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["site-map", siteId] });
      toast.success(`${kind === "camera" ? "Camera" : "Sensor"} "${created.name}" added`);
      onCreated(kind, created.id);
    },
    onError: (err: any) => toast.error(err.message || "Could not save"),
  });

  const canSave =
    Boolean(point) && name.trim() && code.trim() && (kind === "sensor" ? unit.trim() : streamUrl.trim()) && !create.isPending;

  return (
    <Card className="border-amber-500/50">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 p-4 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="h-4 w-4 text-amber-500" />
            Add {kind}
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            {point ? "Location set. Click the map again to move it." : "Click the map where the device is installed."}
          </CardDescription>
        </div>
        <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white" aria-label="Cancel">
          <X className="h-4 w-4" />
        </button>
      </CardHeader>

      <CardContent className="space-y-3 p-4 pt-0">
        {!point ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-4 text-sm text-zinc-600 dark:text-zinc-300">
            <Crosshair className="h-5 w-5 shrink-0 text-amber-500" />
            Waiting for a map click…
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {point[0].toFixed(6)}, {point[1].toFixed(6)}
            </div>

            <Field label="Name">
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === "camera" ? "e.g. North gate camera" : "e.g. Basement gas detector"}
                className={inputClass}
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Code" hint="Unique on this system">
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={`${inputClass} font-mono`} />
              </Field>
              <Field label="Zone" hint={zoneOverride === null && zoneId ? (zoneAtPoint ? "Detected from location" : "Zone you started from") : undefined}>
                <ZoneSelect zones={zones} value={zoneId} onChange={setZoneOverride} />
              </Field>
            </div>

            {kind === "sensor" ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Type">
                    <select
                      value={sensorType}
                      onChange={(e) => {
                        const t = SENSOR_TYPES.find((x) => x.value === e.target.value);
                        setSensorType(e.target.value);
                        if (t) setUnit(t.unit);
                        if (/^[A-Z]+-[A-Z0-9]{4}$/.test(code)) {
                          setCode(`${e.target.value.slice(0, 4).toUpperCase()}-${code.split("-")[1]}`);
                        }
                      }}
                      className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2.5 text-sm"
                    >
                      {SENSOR_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Unit">
                    <Input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Min threshold (optional)">
                    <Input type="number" value={minThreshold} onChange={(e) => setMinThreshold(e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Max threshold (optional)">
                    <Input type="number" value={maxThreshold} onChange={(e) => setMaxThreshold(e.target.value)} className={inputClass} />
                  </Field>
                </div>
              </>
            ) : (
              <>
                <Field label="Stream URL" hint="rtsp://user:pass@ip:554/stream, http(s):// MJPEG/HLS, or a /videos/… file">
                  <div className="flex gap-2">
                    <Input
                      value={streamUrl}
                      onChange={(e) => {
                        setStreamUrl(e.target.value);
                        setTestResult(null);
                      }}
                      placeholder="rtsp://192.168.1.100:554/stream"
                      className={`${inputClass} font-mono`}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection.mutate()}
                      disabled={!streamUrl.trim() || testConnection.isPending}
                      className="h-9 shrink-0"
                    >
                      {testConnection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test"}
                    </Button>
                  </div>
                </Field>
                {testResult && (
                  <div
                    className={`rounded-lg px-3 py-2 text-xs ${
                      testResult.ok
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-red-500/10 text-red-700 dark:text-red-400"
                    }`}
                  >
                    {testResult.ok
                      ? `Connected: ${testResult.width}×${testResult.height}${testResult.fps ? ` @ ${testResult.fps} fps` : ""}`
                      : `Failed: ${testResult.error}`}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Analysis rate" hint="Frames per second sent to PPE detection">
                    <select
                      value={fps}
                      onChange={(e) => setFps(Number(e.target.value))}
                      className="h-9 w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2.5 text-sm"
                    >
                      {[1, 2, 3, 5].map((v) => (
                        <option key={v} value={v}>
                          {v} fps
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex items-center justify-between gap-2 self-start pt-6">
                    <span className={labelClass}>PPE detection</span>
                    <Switch checked={cvEnabled} onCheckedChange={setCvEnabled} />
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="amber" size="sm" onClick={() => create.mutate()} disabled={!canSave} className="gap-1.5">
                {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save {kind}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CopyField({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed; select the text instead");
    }
  };
  return (
    <div className="space-y-1">
      <span className={labelClass}>{label}</span>
      <div className="flex items-start gap-1.5">
        <pre
          className={`min-w-0 flex-1 rounded-md bg-zinc-100 dark:bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] text-zinc-800 dark:text-zinc-200 ${
            multiline ? "whitespace-pre-wrap break-all" : "truncate"
          }`}
          title={value}
        >
          {value}
        </pre>
        <Button variant="ghost" size="icon" onClick={copy} className="h-7 w-7 shrink-0" aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function StatusLine({ live, waiting, error }: { live: string | null; waiting: string; error?: string | null }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
        live ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
      }`}
    >
      {live ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />}
      <span>
        {live ?? waiting}
        {!live && error && <span className="block text-red-600 dark:text-red-400">Last error: {error}</span>}
      </span>
    </div>
  );
}

/**
 * How to connect a registered device, plus a live check that data is arriving.
 */
export function DeviceConnectionPanel({ kind, id, onClose }: { kind: DeviceKind; id: string; onClose: () => void }) {
  const [openedAt] = useState(() => Date.now());

  const { data: info } = useQuery<any>({
    queryKey: ["sensor-connection", id],
    queryFn: () => apiClient.get<any>(`/api/v1/sensors/${id}/connection`),
    enabled: kind === "sensor",
    refetchInterval: 5000,
  });

  const { data: camStatus, dataUpdatedAt } = useQuery<any>({
    queryKey: ["camera-status", id],
    queryFn: () => apiClient.get<any>(`/api/v1/cameras/${id}/status`),
    enabled: kind === "camera",
    refetchInterval: 4000,
  });

  const sensorLive =
    info?.last_seen_at && new Date(info.last_seen_at).getTime() > openedAt - 5 * 60 * 1000
      ? `Receiving data, last reading ${new Date(info.last_seen_at).toLocaleTimeString()}`
      : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 p-4 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Plug className="h-4 w-4 text-amber-500" />
            Connect {kind === "camera" ? "camera" : info?.sensor_code ?? "sensor"}
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            {kind === "sensor"
              ? "Configure the device to publish readings using either method below."
              : "The video handler opens the stream and runs PPE detection."}
          </CardDescription>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </CardHeader>

      <CardContent className="space-y-3 p-4 pt-0">
        {kind === "sensor" ? (
          !info ? (
            <p className="text-xs text-zinc-500">Loading connection details…</p>
          ) : (
            <>
              <StatusLine live={sensorLive} waiting="Waiting for the first reading…" />

              <p className="pt-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Option A: MQTT</p>
              <CopyField label="Broker" value={`${info.mqtt_host}:${info.mqtt_port}`} />
              <CopyField label="Topic" value={info.mqtt_topic} />
              <CopyField label="Payload (JSON)" value={JSON.stringify({ value: 12.5, unit: info.unit }, null, 0)} />
              <CopyField
                label="Test from a terminal"
                multiline
                value={`mosquitto_pub -h ${info.mqtt_host} -p ${info.mqtt_port}${
                  info.mqtt_requires_auth ? " -u <user> -P <password>" : ""
                } -t '${info.mqtt_topic}' -m '{"value": 12.5, "unit": "${info.unit}"}'`}
              />

              <p className="pt-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Option B: HTTP</p>
              <CopyField
                label="Request"
                multiline
                value={`curl -X POST '${info.http_ingest_url}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-API-Key: ${
                  info.http_requires_api_key ? "<INGEST_API_KEY>" : "<set INGEST_API_KEY in backend .env>"
                }' \\\n  -d '${JSON.stringify({ ...info.example_payload, value: 12.5, ts: undefined })}'`}
              />
              <p className="text-[11px] text-zinc-500">
                Add an ISO-8601 <code>ts</code> field with the device&apos;s measurement time; otherwise arrival time is used.
              </p>
            </>
          )
        ) : (
          <>
            <StatusLine
              live={camStatus?.stream_active ? "Streaming, frames are arriving" : null}
              waiting={
                camStatus?.status === "inactive"
                  ? "Camera is stopped"
                  : "Waiting for the video handler to open the stream (checks every 10 s)…"
              }
              error={camStatus?.last_error}
            />
            {camStatus?.stream_active && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/proxy/api/v1/cameras/${id}/snapshot?t=${dataUpdatedAt}`}
                alt="Latest frame from the camera"
                className="aspect-video w-full rounded-lg bg-black object-contain"
              />
            )}
            {!camStatus?.stream_active && (
              <p className="text-[11px] text-zinc-500">
                Frames are read by the <code>video-handler</code> process (started by <code>start.sh</code>). If this
                never turns green, check that it is running and that this machine can reach the camera.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
