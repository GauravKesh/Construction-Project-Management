"use client";

import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, LineChart, FileSpreadsheet, Download, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api/client";
import { useProjectStore } from "@/stores/projectStore";
import { NO_DATA, fmtNumber, fmtPct } from "@/lib/format";
import { toast } from "sonner";

const TREND_METRICS = [
  { value: "ppe_compliance", label: "PPE compliance (%)" },
  { value: "uptime", label: "Sensor uptime (%)" },
  { value: "alerts", label: "Active alerts" },
];

const FORECAST_METRICS = [
  { value: "ppe_compliance", label: "PPE compliance (%)" },
  { value: "uptime", label: "Sensor uptime (%)" },
  { value: "incidents", label: "Open incidents" },
];

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5">
      <span className="text-[10px] font-mono font-bold uppercase text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="font-mono text-3xl font-black text-zinc-900 dark:text-zinc-100 mt-2">{value}</div>
      {note && <span className="text-xs text-zinc-500 mt-1 block">{note}</span>}
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

  const siteParams = { site_id: activeSiteId };
  const enabled = Boolean(activeSiteId);

  const { data: kpis } = useQuery<any>({
    queryKey: ["analytics-kpis", activeSiteId],
    queryFn: () => apiClient.get<any>("/api/v1/analytics/kpis", { params: siteParams }),
    enabled,
  });

  const { data: trends, isLoading: trendsLoading } = useQuery<any>({
    queryKey: ["analytics-trends", activeSiteId, trendMetric],
    queryFn: () =>
      apiClient.get<any>("/api/v1/analytics/trends", {
        params: { ...siteParams, metric: trendMetric, resolution: "1h" },
      }),
    enabled,
  });

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
        // download_url is an /api/v1/... path signed by the backend; fetch it through the proxy
        window.open(`/api/proxy${report.download_url}`, "_blank", "noopener");
      }
      toast.success("Report generated", { description: report?.title });
    },
    onError: (err: any) => toast.error("Report generation failed", { description: err?.message }),
  });

  const points: any[] = trends?.data_points ?? [];
  const zones: any[] = risk?.zones ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Site KPIs, historical trends from rollups, a linear-trend forecast, and exportable reports."
      />

      {!enabled && (
        <Card className="p-4 text-xs text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/5">
          Select a site to view analytics.
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="trends" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            <span>7-Day Trends</span>
          </TabsTrigger>
          <TabsTrigger value="predictions" className="gap-1.5">
            <LineChart className="h-4 w-4" />
            <span>Forecast & Risk</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" />
            <span>Reports</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview: live KPIs for the selected site */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat
              label="PPE Compliance"
              value={fmtPct(kpis?.ppe_compliance_pct)}
              note={kpis?.ppe_compliance_pct == null ? "No CV frames recorded" : "Share of compliant frames"}
            />
            <Stat
              label="Sensor Uptime"
              value={fmtPct(kpis?.sensor_uptime_pct)}
              note={
                kpis?.metrics
                  ? `${kpis.metrics.online_sensors ?? 0} of ${kpis.metrics.total_sensors ?? 0} sensors seen in 5 min`
                  : undefined
              }
            />
            <Stat
              label="Open Incidents"
              value={fmtNumber(kpis?.open_incidents, 0)}
              note={kpis ? `${kpis.resolved_incidents} resolved` : undefined}
            />
            <Stat
              label="Mean Time to Resolve"
              value={kpis?.resolved_incidents ? `${fmtNumber(kpis.mttr_hours)} h` : NO_DATA}
              note={kpis?.resolved_incidents ? undefined : "No resolved incidents yet"}
            />
          </div>
        </TabsContent>

        {/* Trends: straight from the rollup tables */}
        <TabsContent value="trends" className="space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Hourly rollups, last 7 days
                </h3>
                <span className="text-xs text-zinc-500">Only buckets with data are shown.</span>
              </div>
              <select
                value={trendMetric}
                onChange={(e) => setTrendMetric(e.target.value)}
                className="h-8 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2 text-xs"
              >
                {TREND_METRICS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {trendsLoading ? (
              <p className="text-xs text-zinc-500">Loading…</p>
            ) : points.length === 0 ? (
              <p className="text-xs text-zinc-500">No rollup data for this metric yet.</p>
            ) : (
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-xs text-left font-mono">
                  <thead className="bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] uppercase">
                    <tr>
                      <th className="p-3">Bucket (local time)</th>
                      <th className="p-3">Series</th>
                      <th className="p-3 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {points.map((p, idx) => (
                      <tr key={`${p.bucket}-${p.metric}-${idx}`}>
                        <td className="p-3">{new Date(p.bucket).toLocaleString()}</td>
                        <td className="p-3 text-zinc-500">{p.metric}</td>
                        <td className="p-3 text-right font-bold">{fmtNumber(p.value, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Forecast & heuristic risk */}
        <TabsContent value="predictions" className="space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Linear-trend forecast
                </h3>
                <span className="text-xs text-zinc-500">
                  OLS fit on hourly rollups (last 14 days) with a 95% prediction interval. Needs at least 3
                  observations.
                </span>
              </div>
              <div className="flex gap-2">
                <select
                  value={forecastMetric}
                  onChange={(e) => setForecastMetric(e.target.value)}
                  className="h-8 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2 text-xs"
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
                  className="h-8 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2 text-xs"
                >
                  {[1, 3, 7, 14].map((d) => (
                    <option key={d} value={d}>
                      {d}-day horizon
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {prediction?.trend_direction === "insufficient_data" || !prediction ? (
              <p className="text-xs text-zinc-500">
                Not enough history to forecast ({prediction?.n_observations ?? 0} observation
                {prediction?.n_observations === 1 ? "" : "s"}).
              </p>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
                <div>
                  <span className="text-zinc-500 block">Current</span>
                  <span className="text-lg font-bold">{fmtNumber(prediction.current_value, 2)}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Forecast (+{prediction.horizon_days} d)</span>
                  <span className="text-lg font-bold">{fmtNumber(prediction.forecast_value, 2)}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">95% interval</span>
                  <span className="text-lg font-bold">
                    {prediction.confidence_interval
                      ? `${fmtNumber(prediction.confidence_interval[0], 2)} – ${fmtNumber(
                          prediction.confidence_interval[1],
                          2
                        )}`
                      : NO_DATA}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Trend (n={prediction.n_observations})</span>
                  <Badge variant="outline" className="uppercase">
                    {prediction.trend_direction}
                  </Badge>
                </div>
              </div>
            )}
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  Zone risk (heuristic)
                </h3>
                <span className="text-xs text-zinc-500">
                  Hand-weighted from active alerts and site PPE compliance; an ordinal indicator, not a validated
                  model.
                  {risk && ` Site score: ${fmtNumber(risk.overall_risk_score)} (${risk.risk_level}).`}
                </span>
              </div>
            </div>

            {zones.length === 0 ? (
              <p className="text-xs text-zinc-500">No zones configured for this site.</p>
            ) : (
              <div className="space-y-3">
                {zones.map((z) => (
                  <div
                    key={z.zone_id ?? z.zone_name}
                    className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">{z.zone_name}</span>
                      <span className="font-mono font-bold text-amber-500">
                        {fmtNumber(z.risk_score)} / 100 · {z.risk_level}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, z.risk_score)}%` }} />
                    </div>
                    <ul className="text-[11px] text-zinc-500 list-disc pl-4">
                      {z.contributing_factors.map((f: string) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Reports: generated server-side from the same KPIs */}
        <TabsContent value="reports" className="space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 max-w-xl p-5 space-y-4 text-xs">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              Export KPI Report
            </h3>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Report type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full h-9 rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100"
              >
                <option value="safety_audit">Safety audit</option>
                <option value="ppe_compliance">PPE compliance</option>
                <option value="daily_summary">Daily summary</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Format</label>
              <div className="grid grid-cols-3 gap-2">
                {["pdf", "xlsx", "csv"].map((f) => (
                  <Button
                    key={f}
                    variant={reportFormat === f ? "amber" : "outline"}
                    size="sm"
                    onClick={() => setReportFormat(f)}
                    className="font-bold uppercase font-mono"
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
              {generateReport.isPending ? "Generating…" : "Generate & Download"}
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
