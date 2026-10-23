"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  TrendingUp,
  LineChart as LineChartIcon,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  Activity,
  Flame,
  Zap,
  Cpu,
  Layers,
  Calendar,
  Clock,
  Gauge,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api/client";
import { useProjectStore } from "@/stores/projectStore";
import { NO_DATA, fmtNumber, fmtPct } from "@/lib/format";
import { normalizeList } from "@/lib/utils";
import { toast } from "sonner";

const TREND_METRICS = [
  { value: "ppe_compliance", label: "PPE compliance (%)", color: "#10b981", unit: "%" },
  { value: "uptime", label: "Sensor uptime (%)", color: "#3b82f6", unit: "%" },
  { value: "alerts", label: "Active alerts", color: "#f59e0b", unit: "" },
];

const FORECAST_METRICS = [
  { value: "ppe_compliance", label: "PPE compliance (%)", color: "#10b981" },
  { value: "uptime", label: "Sensor uptime (%)", color: "#3b82f6" },
  { value: "incidents", label: "Open incidents", color: "#ef4444" },
];

const TIME_RANGES = [
  { label: "1 Hour", interval: "1m", hours: 1 },
  { label: "6 Hours", interval: "5m", hours: 6 },
  { label: "24 Hours", interval: "5m", hours: 24 },
  { label: "7 Days", interval: "1h", hours: 168 },
  { label: "30 Days", interval: "1d", hours: 720 },
];

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function StatCard({
  label,
  value,
  note,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: string;
  note?: string;
  icon?: any;
  variant?: "default" | "amber" | "emerald" | "rose" | "blue";
}) {
  const colorMap = {
    default: "text-zinc-900 dark:text-zinc-100",
    amber: "text-amber-500",
    emerald: "text-emerald-500",
    rose: "text-rose-500",
    blue: "text-blue-500",
  };

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold capitalize text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 text-zinc-400" />}
      </div>
      <div className={`font-mono text-3xl font-black mt-2 ${colorMap[variant]}`}>
        {value}
      </div>
      {note && <span className="text-xs text-zinc-500 mt-1 block font-mono">{note}</span>}
    </Card>
  );
}

export default function AnalyticsPage() {
  const activeSiteId = useProjectStore((s) => s.activeSiteId);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [activeTab, setActiveTab] = useState("overview");
  const [trendMetric, setTrendMetric] = useState("ppe_compliance");
  const [forecastMetric, setForecastMetric] = useState("ppe_compliance");
  const [horizonDays, setHorizonDays] = useState(7);
  const [reportType, setReportType] = useState("safety_audit");
  const [reportFormat, setReportFormat] = useState("pdf");

  // Telemetry sub-state
  const [selectedSensorId, setSelectedSensorId] = useState<string>("");
  const [telemetryRangeIdx, setTelemetryRangeIdx] = useState(2); // 24 Hours default
  const [telemetryAgg, setTelemetryAgg] = useState("avg");
  const [telemetrySearch, setTelemetrySearch] = useState("");
  const [hoveredCell, setHoveredCell] = useState<{ day: string; hour: number; count: number; level: string } | null>(null);

  // Hydration safety for Recharts
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const siteParams = useMemo(() => ({ site_id: activeSiteId }), [activeSiteId]);
  const enabled = Boolean(activeSiteId);

  // 1. Core KPIs
  const { data: kpis } = useQuery<any>({
    queryKey: ["analytics-kpis", activeSiteId],
    queryFn: () => apiClient.get<any>("/api/v1/analytics/kpis", { params: siteParams }),
    enabled,
  });

  // 2. Rollup Trends
  const { data: trends, isLoading: trendsLoading } = useQuery<any>({
    queryKey: ["analytics-trends", activeSiteId, trendMetric],
    queryFn: () =>
      apiClient.get<any>("/api/v1/analytics/trends", {
        params: { ...siteParams, metric: trendMetric, resolution: "1h" },
      }),
    enabled,
  });

  // 3. Predictions & Risk
  const { data: prediction } = useQuery<any>({
    queryKey: ["analytics-predictions", activeSiteId, forecastMetric, horizonDays],
    queryFn: () =>
      apiClient.get<any>("/api/v1/analytics/predictions", {
        params: { ...siteParams, metric: forecastMetric, horizon_days: horizonDays },
      }),
    enabled,
  });

  const { data: risk } = useQuery<any>({
    queryKey: ["analytics-risk", activeSiteId],
    queryFn: () => apiClient.get<any>("/api/v1/analytics/risk-score", { params: siteParams }),
    enabled,
  });

  // 4. Site Sensors List
  const { data: sensorsData } = useQuery<any>({
    queryKey: ["site-sensors", activeSiteId],
    queryFn: () => apiClient.get<any>(`/api/v1/sites/${activeSiteId}/sensors`),
    enabled,
  });
  const sensors = useMemo(() => normalizeList(sensorsData), [sensorsData]);

  // Set default selected sensor once sensors load
  useEffect(() => {
    if (sensors.length > 0 && !selectedSensorId) {
      setSelectedSensorId(sensors[0].id);
    }
  }, [sensors, selectedSensorId]);

  // 5. Site Latest Telemetry
  const { data: latestTelemetryData } = useQuery<any>({
    queryKey: ["site-latest-telemetry", activeSiteId],
    queryFn: () => apiClient.get<any>(`/api/v1/sites/${activeSiteId}/telemetry/latest`),
    enabled,
    refetchInterval: 5000,
  });
  const latestTelemetryList = useMemo(() => normalizeList(latestTelemetryData), [latestTelemetryData]);

  // Map of sensorId -> latest reading
  const latestMap = useMemo(() => {
    const map = new Map<string, any>();
    latestTelemetryList.forEach((item: any) => {
      if (item.sensor_id) map.set(item.sensor_id, item);
    });
    return map;
  }, [latestTelemetryList]);

  // 6. Selected Sensor Historical Telemetry Range
  const activeRange = TIME_RANGES[telemetryRangeIdx];
  const { data: telemetryHistoryData, isLoading: telemetryLoading, refetch: refetchTelemetry } = useQuery<any>({
    queryKey: ["sensor-telemetry-history", selectedSensorId, telemetryRangeIdx, telemetryAgg],
    queryFn: async () => {
      if (!selectedSensorId) return [];
      const now = new Date();
      const fromDate = new Date(now.getTime() - activeRange.hours * 60 * 60 * 1000);
      return apiClient.get<any>(`/api/v1/sensors/${selectedSensorId}/telemetry`, {
        params: {
          from: fromDate.toISOString(),
          to: now.toISOString(),
          interval: activeRange.interval,
          agg: telemetryAgg,
        },
      });
    },
    enabled: Boolean(selectedSensorId),
    refetchInterval: 10000,
  });
  const telemetryHistory = useMemo(() => normalizeList(telemetryHistoryData), [telemetryHistoryData]);

  // 7. Recent Alerts for Incident Heatmap
  const { data: alertsData } = useQuery<any>({
    queryKey: ["analytics-alerts-heatmap", activeSiteId],
    queryFn: () => apiClient.get<any>("/api/v1/alerts", { params: { limit: 200 } }),
    enabled,
  });
  const alertsList = useMemo(() => normalizeList(alertsData), [alertsData]);

  // Compute 7x24 Heatmap Matrix
  const heatmapMatrix = useMemo(() => {
    // 7 rows (0: Mon ... 6: Sun), 24 columns (0 ... 23 hours)
    const matrix: { count: number; incidents: number }[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ count: 0, incidents: 0 }))
    );

    alertsList.forEach((alert: any) => {
      if (!alert.created_at) return;
      const d = new Date(alert.created_at);
      // getDay: 0 is Sun, 1 is Mon ... convert to Mon=0, Sun=6
      const dayIdx = (d.getDay() + 6) % 7;
      const hour = d.getHours();
      if (dayIdx >= 0 && dayIdx < 7 && hour >= 0 && hour < 24) {
        matrix[dayIdx][hour].count += 1;
        if (alert.severity === "critical" || alert.severity === "CRITICAL") {
          matrix[dayIdx][hour].incidents += 1;
        }
      }
    });

    return matrix;
  }, [alertsList]);

  // Generate Report Mutation
  const generateReport = useMutation({
    mutationFn: () =>
      apiClient.post<any>("/api/v1/analytics/reports", {
        title: `${reportType.replace(/_/g, " ")} report`,
        report_type: reportType,
        file_format: reportFormat,
        site_id: activeSiteId || undefined,
        project_id: activeProjectId || undefined,
      }),
    onSuccess: (report) => {
      if (report?.download_url) {
        window.open(`/api/proxy${report.download_url}`, "_blank", "noopener");
      }
      toast.success("Report generated", { description: report?.title });
    },
    onError: (err: any) => toast.error("Report generation failed", { description: err?.message }),
  });

  const selectedSensor = useMemo(() => {
    return sensors.find((s: any) => s.id === selectedSensorId) || null;
  }, [sensors, selectedSensorId]);

  // Process Telemetry History into Recharts dataset
  const formattedChartData = useMemo(() => {
    return telemetryHistory.map((item: any) => {
      const date = new Date(item.bucket);
      return {
        timestamp: item.bucket,
        displayTime:
          activeRange.hours <= 24
            ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit" }),
        value: typeof item.avg === "number" ? Number(item.avg.toFixed(2)) : Number(item.value ?? 0),
        min: typeof item.min === "number" ? Number(item.min.toFixed(2)) : undefined,
        max: typeof item.max === "number" ? Number(item.max.toFixed(2)) : undefined,
        count: item.count,
        unit: item.unit || selectedSensor?.unit || "",
      };
    });
  }, [telemetryHistory, activeRange, selectedSensor]);

  // Summary statistics for selected sensor
  const sensorStats = useMemo(() => {
    if (formattedChartData.length === 0) return { avg: NO_DATA, min: NO_DATA, max: NO_DATA, count: 0 };
    const values = formattedChartData.map((d: any) => d.value).filter((v: number) => !isNaN(v));
    if (values.length === 0) return { avg: NO_DATA, min: NO_DATA, max: NO_DATA, count: 0 };
    const sum = values.reduce((acc: number, cur: number) => acc + cur, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return {
      avg: avg.toFixed(2),
      min: min.toFixed(2),
      max: max.toFixed(2),
      count: formattedChartData.length,
    };
  }, [formattedChartData]);

  // Rule threshold reference lines
  const ruleThresholds = useMemo(() => {
    if (!selectedSensor) return [];
    const type = selectedSensor.sensor_type?.toLowerCase();
    if (type === "gas") {
      return [
        { label: "Warning (50 ppm)", value: 50, color: "#f59e0b" },
        { label: "Critical (100 ppm)", value: 100, color: "#ef4444" },
      ];
    }
    if (type === "vibration") {
      return [{ label: "Critical (20 mm/s)", value: 20, color: "#ef4444" }];
    }
    if (type === "temperature") {
      return [{ label: "High Heat (42 °C)", value: 42, color: "#f59e0b" }];
    }
    if (type === "noise") {
      return [{ label: "Curfew Limit (85 dB)", value: 85, color: "#f59e0b" }];
    }
    return [];
  }, [selectedSensor]);

  // Filtered sensor list for selector
  const filteredSensors = useMemo(() => {
    if (!telemetrySearch.trim()) return sensors;
    const q = telemetrySearch.toLowerCase();
    return sensors.filter(
      (s: any) =>
        s.name?.toLowerCase().includes(q) ||
        s.sensor_type?.toLowerCase().includes(q) ||
        s.sensor_code?.toLowerCase().includes(q)
    );
  }, [sensors, telemetrySearch]);

  const points: any[] = trends?.data_points ?? [];
  const zones: any[] = risk?.zones ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics & Telemetry Intelligence"
        description="Comprehensive real-time telemetry graphs, site incident heatmaps, historical sensor inspection, and predictive forecasting."
      />

      {!enabled && (
        <Card className="p-4 text-xs text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/5">
          Please select an active site in the top bar to inspect telemetry and analytics.
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex flex-wrap gap-1 bg-zinc-100 dark:bg-zinc-950 p-1 border border-zinc-200 dark:border-zinc-800 rounded-xl">
          <TabsTrigger value="overview" className="gap-2 font-medium text-xs">
            <BarChart3 className="h-4 w-4" />
            <span>Overview & Heatmap</span>
          </TabsTrigger>
          <TabsTrigger value="telemetry" className="gap-2 font-medium text-xs">
            <Activity className="h-4 w-4 text-amber-500" />
            <span>Sensor Telemetry Hub</span>
          </TabsTrigger>
          <TabsTrigger value="trends" className="gap-2 font-medium text-xs">
            <TrendingUp className="h-4 w-4" />
            <span>Rollup Trends</span>
          </TabsTrigger>
          <TabsTrigger value="predictions" className="gap-2 font-medium text-xs">
            <LineChartIcon className="h-4 w-4" />
            <span>Forecast & Risk</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2 font-medium text-xs">
            <FileSpreadsheet className="h-4 w-4" />
            <span>Reports</span>
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 1: OVERVIEW & HEATMAP */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              label="PPE Compliance"
              value={fmtPct(kpis?.ppe_compliance_pct)}
              note={kpis?.ppe_compliance_pct == null ? "No CV frames" : "Share of compliant frames"}
              icon={CheckCircle2}
              variant="emerald"
            />
            <StatCard
              label="Sensor Uptime"
              value={fmtPct(kpis?.sensor_uptime_pct)}
              note={`${sensors.length} registered hardware nodes`}
              icon={Cpu}
              variant="blue"
            />
            <StatCard
              label="Active Alerts"
              value={fmtNumber(kpis?.active_alerts, 0)}
              note="Live threshold breaches"
              icon={AlertTriangle}
              variant="amber"
            />
            <StatCard
              label="Open Incidents"
              value={fmtNumber(kpis?.open_incidents, 0)}
              note={`${kpis?.resolved_incidents ?? 0} resolved to date`}
              icon={Flame}
              variant="rose"
            />
            <StatCard
              label="Site Risk Score"
              value={risk?.overall_risk_score != null ? `${risk.overall_risk_score}/100` : NO_DATA}
              note={`Risk Status: ${risk?.risk_level || "Normal"}`}
              icon={Gauge}
              variant={risk?.overall_risk_score > 60 ? "rose" : "default"}
            />
          </div>

          {/* 7x24 Site Activity & Incident Intensity Heatmap */}
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-amber-500" />
                  Site Hazard & Incident Intensity Heatmap (7 Days × 24 Hours)
                </h3>
                <p className="text-xs text-zinc-500">
                  Hourly distribution matrix mapping alerts, rule breaches, and incidents across days of the week.
                </p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                <span>Low</span>
                <span className="w-3.5 h-3.5 rounded bg-zinc-200 dark:bg-zinc-800 border border-zinc-700/30" />
                <span className="w-3.5 h-3.5 rounded bg-emerald-500/40 border border-emerald-500/60" />
                <span className="w-3.5 h-3.5 rounded bg-amber-500/60 border border-amber-500/80" />
                <span className="w-3.5 h-3.5 rounded bg-rose-500/80 border border-rose-500" />
                <span>Critical</span>
              </div>
            </div>

            {/* Matrix Container */}
            <div className="overflow-x-auto pt-2">
              <div className="min-w-[700px] space-y-1.5">
                {/* Hours Header */}
                <div className="grid grid-cols-[50px_repeat(24,1fr)] gap-1 text-[10px] font-mono text-zinc-400 text-center">
                  <div className="text-left font-semibold">Day</div>
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} className="truncate">
                      {h % 3 === 0 ? `${h}h` : "·"}
                    </div>
                  ))}
                </div>

                {/* Heatmap Rows */}
                {DAYS_OF_WEEK.map((dayName, dayIdx) => (
                  <div key={dayName} className="grid grid-cols-[50px_repeat(24,1fr)] gap-1 items-center">
                    <span className="text-xs font-semibold font-mono text-zinc-500 dark:text-zinc-400">
                      {dayName}
                    </span>
                    {heatmapMatrix[dayIdx].map((cell, hour) => {
                      const count = cell.count;
                      let bgClass = "bg-zinc-100 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-800";
                      let level = "Normal";

                      if (count > 5 || cell.incidents > 1) {
                        bgClass = "bg-rose-500 border-rose-600 text-white font-bold";
                        level = "Critical Breach Window";
                      } else if (count > 2) {
                        bgClass = "bg-amber-500/70 border-amber-600 text-white font-semibold";
                        level = "Elevated Alert Activity";
                      } else if (count > 0) {
                        bgClass = "bg-emerald-500/50 border-emerald-600 text-emerald-950 dark:text-white";
                        level = "Standard Activity";
                      }

                      return (
                        <div
                          key={hour}
                          onMouseEnter={() => setHoveredCell({ day: dayName, hour, count, level })}
                          onMouseLeave={() => setHoveredCell(null)}
                          className={`h-7 rounded cursor-pointer transition-all hover:scale-110 flex items-center justify-center text-[10px] font-mono border ${bgClass}`}
                        >
                          {count > 0 ? count : ""}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Hovered cell detail */}
            <div className="h-6 flex items-center text-xs font-mono text-zinc-500 dark:text-zinc-400">
              {hoveredCell ? (
                <span className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  <strong>{hoveredCell.day} at {String(hoveredCell.hour).padStart(2, "0")}:00</strong>:{" "}
                  {hoveredCell.count} recorded alert(s) —{" "}
                  <span className="text-amber-500 font-semibold">{hoveredCell.level}</span>
                </span>
              ) : (
                <span>Hover over any hour cell to inspect incident intensity.</span>
              )}
            </div>
          </Card>

          {/* Zone Risk Heatmap & Rollup Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-500" />
                Zone Risk Index Heatmap
              </h3>
              <p className="text-xs text-zinc-500">
                Composite hazard scoring by physical area based on sensor exceedance and PPE non-compliance.
              </p>

              {zones.length === 0 ? (
                <p className="text-xs text-zinc-500 py-4">No zone data available for this site.</p>
              ) : (
                <div className="space-y-3">
                  {zones.map((z: any) => {
                    const score = Math.round(z.risk_score);
                    const isHigh = score > 60;
                    const isMed = score > 30;
                    const badgeColor = isHigh
                      ? "bg-rose-500/20 text-rose-500 border-rose-500/30"
                      : isMed
                      ? "bg-amber-500/20 text-amber-500 border-amber-500/30"
                      : "bg-emerald-500/20 text-emerald-500 border-emerald-500/30";

                    return (
                      <div
                        key={z.zone_name}
                        className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                            {z.zone_name}
                          </span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${badgeColor}`}>
                            {z.risk_level} ({score}/100)
                          </span>
                        </div>
                        <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              isHigh ? "bg-rose-500" : isMed ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(score, 100)}%` }}
                          />
                        </div>
                        {z.contributing_factors && z.contributing_factors.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {z.contributing_factors.map((f: string, idx: number) => (
                              <span
                                key={idx}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 font-mono"
                              >
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Quick 7-Day Performance Curve */}
            <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                7-Day Site Performance Curve
              </h3>
              <p className="text-xs text-zinc-500">
                Rolling hourly rollups highlighting site-wide compliance stability.
              </p>

              {isMounted && points.length > 0 ? (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="ppeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.4} />
                      <XAxis
                        dataKey="bucket"
                        tickFormatter={(v) => new Date(v).toLocaleDateString([], { month: "numeric", day: "numeric" })}
                        tick={{ fill: "#71717a", fontSize: 10 }}
                      />
                      <YAxis tick={{ fill: "#71717a", fontSize: 10 }} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#09090b",
                          borderColor: "#27272a",
                          borderRadius: "0.5rem",
                          fontSize: "12px",
                        }}
                        labelFormatter={(v: any) => (v ? new Date(v as string).toLocaleString() : "")}
                        formatter={(val: any) => [`${Number(val).toFixed(1)}%`, "PPE Compliance"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#10b981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#ppeGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-xs text-zinc-500">
                  {trendsLoading ? "Loading trend data…" : "No 7-day rollup records found."}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 2: SENSOR TELEMETRY HUB & HISTORICAL INSPECTOR */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="telemetry" className="space-y-6">
          {/* Universal Sensor Matrix */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-amber-500" />
                  Universal Sensor Matrix ({sensors.length} Nodes)
                </h3>
                <p className="text-xs text-zinc-500">
                  Click any sensor card to inspect high-resolution historical telemetry graphs below.
                </p>
              </div>

              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter sensors by name/type…"
                  value={telemetrySearch}
                  onChange={(e) => setTelemetrySearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-3 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Universal Sensor Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredSensors.map((s: any) => {
                const isSelected = s.id === selectedSensorId;
                const live = latestMap.get(s.id);
                const currentVal = live ? live.value : s.current_value;
                const battery = live?.battery ?? s.battery_level ?? 100;

                return (
                  <Card
                    key={s.id}
                    onClick={() => setSelectedSensorId(s.id)}
                    className={`p-4 cursor-pointer transition-all duration-200 border ${
                      isSelected
                        ? "border-amber-500 ring-2 ring-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 shadow-lg"
                        : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-zinc-400 dark:hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] uppercase font-mono font-bold tracking-wider">
                        {s.sensor_type}
                      </Badge>
                      <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                        <Zap className="h-3 w-3 text-emerald-500" /> {battery}%
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mt-2 truncate">
                      {s.name}
                    </h4>
                    <span className="text-[10px] font-mono text-zinc-400 block truncate">
                      {s.sensor_code || s.id.slice(0, 8)}
                    </span>

                    <div className="mt-3 flex items-baseline justify-between border-t border-zinc-100 dark:border-zinc-800/80 pt-2">
                      <span className="font-mono text-2xl font-black text-zinc-900 dark:text-zinc-100">
                        {typeof currentVal === "number" ? currentVal.toFixed(1) : NO_DATA}
                      </span>
                      <span className="text-xs font-mono font-semibold text-zinc-400">
                        {s.unit}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Deep-Dive Historical Sensor Graph Inspector */}
          {selectedSensor && (
            <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6 space-y-6">
              {/* Header Controls */}
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                      {selectedSensor.name}
                    </h3>
                    <Badge variant="outline" className="text-xs uppercase font-mono">
                      {selectedSensor.sensor_type}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5">
                    ID: {selectedSensor.id} · Metric Unit: {selectedSensor.unit} · Resolution: {activeRange.interval}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Aggregation Mode */}
                  <select
                    value={telemetryAgg}
                    onChange={(e) => setTelemetryAgg(e.target.value)}
                    className="h-8 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2.5 text-xs text-zinc-800 dark:text-zinc-200 font-medium"
                  >
                    <option value="avg">Aggregation: Average</option>
                    <option value="max">Aggregation: Maximum</option>
                    <option value="min">Aggregation: Minimum</option>
                  </select>

                  {/* Time Range Selector */}
                  <div className="flex bg-zinc-100 dark:bg-zinc-950 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {TIME_RANGES.map((r, idx) => (
                      <Button
                        key={r.label}
                        variant={telemetryRangeIdx === idx ? "amber" : "ghost"}
                        size="sm"
                        onClick={() => setTelemetryRangeIdx(idx)}
                        className="h-6 text-xs font-mono px-2.5"
                      >
                        {r.label}
                      </Button>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchTelemetry()}
                    className="h-8 px-2.5 text-xs border-zinc-200 dark:border-zinc-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Stat Summary Row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 text-xs">
                  <span className="text-[10px] text-zinc-400 uppercase font-mono block">Current Live</span>
                  <span className="font-mono text-xl font-bold text-zinc-900 dark:text-zinc-100">
                    {typeof latestMap.get(selectedSensor.id)?.value === "number"
                      ? `${latestMap.get(selectedSensor.id).value.toFixed(1)} ${selectedSensor.unit}`
                      : NO_DATA}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 text-xs">
                  <span className="text-[10px] text-zinc-400 uppercase font-mono block">Window Average</span>
                  <span className="font-mono text-xl font-bold text-zinc-900 dark:text-zinc-100">
                    {sensorStats.avg} {selectedSensor.unit}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 text-xs">
                  <span className="text-[10px] text-zinc-400 uppercase font-mono block">Peak Recorded</span>
                  <span className="font-mono text-xl font-bold text-rose-500">
                    {sensorStats.max} {selectedSensor.unit}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 text-xs">
                  <span className="text-[10px] text-zinc-400 uppercase font-mono block">Lowest Recorded</span>
                  <span className="font-mono text-xl font-bold text-emerald-500">
                    {sensorStats.min} {selectedSensor.unit}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 text-xs">
                  <span className="text-[10px] text-zinc-400 uppercase font-mono block">Buckets Sampled</span>
                  <span className="font-mono text-xl font-bold text-amber-500">
                    {sensorStats.count}
                  </span>
                </div>
              </div>

              {/* Historical Time-Series Chart */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-mono">Time-Series Telemetry ({activeRange.label} window)</span>
                  {ruleThresholds.length > 0 && (
                    <div className="flex items-center gap-3 text-[11px] font-mono">
                      {ruleThresholds.map((rt) => (
                        <span key={rt.label} className="flex items-center gap-1.5" style={{ color: rt.color }}>
                          <span className="w-2.5 h-0.5" style={{ backgroundColor: rt.color }} />
                          {rt.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {isMounted && formattedChartData.length > 0 ? (
                  <div className="h-80 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={formattedChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="sensorAreaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.4} />
                        <XAxis
                          dataKey="displayTime"
                          tick={{ fill: "#71717a", fontSize: 10 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fill: "#71717a", fontSize: 10 }}
                          unit={` ${selectedSensor.unit}`}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#09090b",
                            borderColor: "#27272a",
                            borderRadius: "0.5rem",
                            fontSize: "12px",
                          }}
                          labelFormatter={(v) => `Bucket: ${v}`}
                          formatter={(val: any, name: any, props: any) => [
                            `${val} ${props.payload.unit} (samples: ${props.payload.count ?? 1})`,
                            selectedSensor.name,
                          ]}
                        />
                        {ruleThresholds.map((rt) => (
                          <ReferenceLine
                            key={rt.label}
                            y={rt.value}
                            stroke={rt.color}
                            strokeDasharray="4 4"
                            strokeWidth={1.5}
                            label={{
                              value: rt.label,
                              fill: rt.color,
                              fontSize: 10,
                              position: "insideTopRight",
                            }}
                          />
                        ))}
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#sensorAreaGradient)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-80 flex flex-col items-center justify-center text-xs text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <Activity className="h-8 w-8 text-zinc-600 mb-2 animate-pulse" />
                    <span>
                      {telemetryLoading
                        ? "Streaming historical telemetry readings from database…"
                        : "No telemetry records stored in this time window."}
                    </span>
                  </div>
                )}
              </div>

              {/* Raw Historical Readings Table */}
              <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider font-mono">
                    Historical Log Records ({formattedChartData.length} Buckets)
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const csvHeader = "Bucket,Value,Min,Max,Count,Unit\n";
                      const csvRows = formattedChartData
                        .map((d: any) => `${d.timestamp},${d.value},${d.min ?? ""},${d.max ?? ""},${d.count ?? 1},${d.unit}`)
                        .join("\n");
                      const blob = new Blob([csvHeader + csvRows], { type: "text/csv" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${selectedSensor.name}_telemetry_${activeRange.label}.csv`;
                      a.click();
                      toast.success("Telemetry exported to CSV");
                    }}
                    className="h-7 text-xs gap-1.5 border-zinc-200 dark:border-zinc-800"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </Button>
                </div>

                <div className="overflow-x-auto max-h-60 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-xs text-left font-mono">
                    <thead className="bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                      <tr>
                        <th className="p-2.5">Bucket Timestamp</th>
                        <th className="p-2.5 text-right">Value ({selectedSensor.unit})</th>
                        <th className="p-2.5 text-right">Min</th>
                        <th className="p-2.5 text-right">Max</th>
                        <th className="p-2.5 text-right">Samples</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
                      {formattedChartData.slice(-20).reverse().map((d: any, idx: number) => (
                        <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/40">
                          <td className="p-2.5 text-zinc-400">{new Date(d.timestamp).toLocaleString()}</td>
                          <td className="p-2.5 text-right font-bold text-zinc-900 dark:text-zinc-100">{d.value}</td>
                          <td className="p-2.5 text-right text-zinc-500">{d.min ?? d.value}</td>
                          <td className="p-2.5 text-right text-zinc-500">{d.max ?? d.value}</td>
                          <td className="p-2.5 text-right text-amber-500">{d.count ?? 1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 3: ROLLUP TRENDS */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="trends" className="space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold capitalize text-zinc-900 dark:text-zinc-100">
                  Hourly Site Rollup Trends (7-Day Range)
                </h3>
                <span className="text-xs text-zinc-500">
                  Materialized hourly rollups aggregating compliance, sensor uptime, and system alerts.
                </span>
              </div>
              <select
                value={trendMetric}
                onChange={(e) => setTrendMetric(e.target.value)}
                className="h-8 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100 font-medium"
              >
                {TREND_METRICS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Recharts Area Curve */}
            {isMounted && points.length > 0 ? (
              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={points} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="trendAreaGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.4} />
                    <XAxis
                      dataKey="bucket"
                      tickFormatter={(v) => new Date(v).toLocaleDateString([], { month: "numeric", day: "numeric" })}
                      tick={{ fill: "#71717a", fontSize: 10 }}
                    />
                    <YAxis tick={{ fill: "#71717a", fontSize: 10 }} domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#09090b",
                        borderColor: "#27272a",
                        borderRadius: "0.5rem",
                        fontSize: "12px",
                      }}
                      labelFormatter={(v: any) => (v ? new Date(v as string).toLocaleString() : "")}
                      formatter={(val: any) => [fmtNumber(val, 2), trendMetric.replace(/_/g, " ")]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#trendAreaGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-60 flex items-center justify-center text-xs text-zinc-500">
                {trendsLoading ? "Loading trend rollups…" : "No rollup data recorded for this metric yet."}
              </div>
            )}

            {/* Table of Rollup points */}
            {points.length > 0 && (
              <div className="overflow-x-auto max-h-60 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-xs text-left font-mono">
                  <thead className="bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                    <tr>
                      <th className="p-2.5">Bucket (Local Time)</th>
                      <th className="p-2.5">Metric</th>
                      <th className="p-2.5 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {points.map((p, idx) => (
                      <tr key={`${p.bucket}-${idx}`}>
                        <td className="p-2.5 text-zinc-400">{new Date(p.bucket).toLocaleString()}</td>
                        <td className="p-2.5 text-zinc-500">{p.metric}</td>
                        <td className="p-2.5 text-right font-bold text-zinc-900 dark:text-zinc-100">
                          {fmtNumber(p.value, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 4: FORECAST & RISK */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="predictions" className="space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  OLS Linear-Trend Forecast
                </h3>
                <span className="text-xs text-zinc-500">
                  Statistical trend model fit on historical hourly rollups with a 95% confidence interval band.
                </span>
              </div>
              <div className="flex gap-2">
                <select
                  value={forecastMetric}
                  onChange={(e) => setForecastMetric(e.target.value)}
                  className="h-8 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100 font-medium"
                >
                  {FORECAST_METRICS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <select
                  value={horizonDays}
                  onChange={(e) => setHorizonDays(Number(e.target.value))}
                  className="h-8 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100 font-medium"
                >
                  {[1, 3, 7, 14].map((d) => (
                    <option key={d} value={d}>
                      {d}-day horizon
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {prediction && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                  <span className="text-xs font-medium text-zinc-500">Current Base Value</span>
                  <div className="font-mono text-2xl font-black text-zinc-900 dark:text-zinc-100 mt-1">
                    {prediction.current_value != null ? fmtNumber(prediction.current_value, 2) : NO_DATA}
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                  <span className="text-xs font-medium text-zinc-500">Projected Value ({horizonDays}d)</span>
                  <div className="font-mono text-2xl font-black text-amber-500 mt-1">
                    {prediction.forecast_value != null ? fmtNumber(prediction.forecast_value, 2) : NO_DATA}
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
                  <span className="text-xs font-medium text-zinc-500">Trajectory Status</span>
                  <div className="font-mono text-2xl font-black text-zinc-900 dark:text-zinc-100 mt-1 capitalize">
                    {prediction.trend_direction}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 5: REPORTS */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="reports" className="space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 max-w-xl p-6 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              Export Site Intelligence Report
            </h3>
            <p className="text-xs text-zinc-500">
              Generate and download compliance audit digests or telemetry logs in PDF, XLSX, or CSV.
            </p>

            <div className="space-y-1.5 pt-2">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full h-9 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100"
              >
                <option value="safety_audit">Safety & PPE Compliance Audit</option>
                <option value="ppe_compliance">PPE Detailed Incident Rollup</option>
                <option value="daily_summary">Daily Operational & Sensor Summary</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Format</label>
              <div className="grid grid-cols-3 gap-2">
                {["pdf", "xlsx", "csv"].map((f) => (
                  <Button
                    key={f}
                    variant={reportFormat === f ? "amber" : "outline"}
                    size="sm"
                    onClick={() => setReportFormat(f)}
                    className="font-medium uppercase"
                  >
                    {f}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              variant="amber"
              size="sm"
              onClick={() => generateReport.mutate()}
              disabled={generateReport.isPending}
              className="w-full h-9 font-bold gap-2 mt-2"
            >
              <Download className="h-4 w-4" />
              {generateReport.isPending ? "Generating…" : "Generate & Download Report"}
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
