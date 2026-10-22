"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldAlert,
  Users,
  HardHat,
  Radio,
  Wind,
  Thermometer,
  Droplets,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Bell,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { KpiCard } from "@/components/common/KpiCard";
import { RiskGauge } from "@/components/common/RiskGauge";
import { SeverityBadge } from "@/components/common/SeverityBadge";
import { StatusDot } from "@/components/common/StatusDot";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLiveStore } from "@/stores/liveStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSocket } from "@/components/providers/SocketProvider";
import { apiClient } from "@/lib/api/client";
import { normalizeList } from "@/lib/utils";
import { DashboardLiveVideoCard } from "@/components/dashboard/DashboardLiveVideoCard";
import { ProjectStatusCard } from "@/components/dashboard/ProjectStatusCard";
import { toast } from "sonner";
import { NO_DATA, fmtNumber, fmtPct, hasValue, latestByType } from "@/lib/format";

const TELEMETRY_TILES = [
  { type: "dust", label: "Dust" },
  { type: "noise", label: "Noise Level" },
  { type: "gas", label: "Gas" },
  { type: "vibration", label: "Vibration" },
];

export default function DashboardPage() {
  const activeSiteId = useProjectStore((s) => s.activeSiteId);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const sensorLatest = useLiveStore((s) => s.sensorLatest);
  const liveAlerts = useLiveStore((s) => s.liveAlerts);
  const { ackAlert } = useSocket();

  // Fetch dashboard summary
  const {
    data: summary,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["dashboard-summary", activeProjectId],
    queryFn: () =>
      apiClient.get<any>("/api/v1/dashboard/summary", { params: { project_id: activeProjectId } }),
    staleTime: 10000,
  });

  const { data: siteKpis } = useQuery<any>({
    queryKey: ["analytics-kpis", activeSiteId],
    queryFn: () => apiClient.get<any>("/api/v1/analytics/kpis", { params: { site_id: activeSiteId } }),
    enabled: Boolean(activeSiteId),
    staleTime: 15000,
  });

  const { data: risk } = useQuery<any>({
    queryKey: ["analytics-risk", activeSiteId],
    queryFn: () => apiClient.get<any>("/api/v1/analytics/risk-score", { params: { site_id: activeSiteId } }),
    enabled: Boolean(activeSiteId),
    staleTime: 15000,
  });

  const { data: health, isError: healthError } = useQuery<any>({
    queryKey: ["health-ready"],
    queryFn: () => apiClient.get<any>("/api/v1/health/ready"),
    staleTime: 15000,
    retry: false,
  });

  const { data: cvConfig } = useQuery<any>({
    queryKey: ["cv-config"],
    queryFn: () => apiClient.get<any>("/api/v1/cv/config"),
    staleTime: 60000,
  });

  // Fetch projects list
  const { data: projectsData, refetch: refetchProjects } = useQuery<any>({
    queryKey: ["projects"],
    queryFn: () => apiClient.get<any>("/api/v1/projects"),
    staleTime: 30000,
  });

  // Fetch active project schedules
  const { data: schedulesData, refetch: refetchSchedules } = useQuery<any>({
    queryKey: ["project-schedules", activeProjectId],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${activeProjectId}/schedules`),
    staleTime: 30000,
  });

  // Fetch active project BOQ
  const { data: boqData, refetch: refetchBoq } = useQuery<any>({
    queryKey: ["project-boq", activeProjectId],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${activeProjectId}/boq`),
    staleTime: 30000,
  });

  // Fetch active alerts
  const { data: alertsData, refetch: refetchAlerts } = useQuery({
    queryKey: ["alerts", activeSiteId],
    queryFn: () => apiClient.get<any>("/api/v1/alerts"),
    staleTime: 5000,
  });

  // Fetch recent incidents
  const { data: incidentsData } = useQuery({
    queryKey: ["incidents", activeSiteId],
    queryFn: () => apiClient.get<any>("/api/v1/incidents"),
    staleTime: 10000,
  });

  const alerts = normalizeList(alertsData);
  const incidents = normalizeList(incidentsData);
  const projects = normalizeList<any>(projectsData);
  const schedules = normalizeList<any>(schedulesData);
  const boq = normalizeList<any>(boqData);
  const currentProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  const handleAcknowledge = async (alertId: string) => {
    try {
      ackAlert(alertId);
      await apiClient.post(`/api/v1/alerts/${alertId}/acknowledge`);
      refetchAlerts();
      toast.success("Alert acknowledged");
    } catch {
      toast.success("Alert acknowledged via WebSocket link");
      refetchAlerts();
    }
  };

  const healthDeps = Object.entries<any>(health?.dependencies ?? {});
  const unhealthyDeps = healthDeps.filter(([, d]) => d?.status !== "healthy").map(([name]) => name);
  const hasCritical = alerts.some((a) => a.severity === "critical" && a.status === "active");
  const temperature = latestByType(sensorLatest, "temperature");
  const humidity = latestByType(sensorLatest, "humidity");

  return (
    <div className="space-y-6">
      {/* Top Page Header */}
      <PageHeader
        title="Site Operations Control Room"
        description="Unified IoT telemetry, computer vision safety compliance, and live incident mitigation."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetch();
            refetchProjects();
            refetchSchedules();
            refetchBoq();
            refetchAlerts();
          }}
          className="gap-1.5 border-zinc-200 dark:border-zinc-800"
          disabled={isFetching}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </PageHeader>

      {/* System Health Status Banner (from /health/ready) */}
      <div
        className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${
          health && unhealthyDeps.length === 0
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
            : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <StatusDot status={health && unhealthyDeps.length === 0 ? "healthy" : "warning"} size="sm" pulse />
          <span className="font-semibold">
            {healthError || !health
              ? "Backend health unavailable"
              : unhealthyDeps.length === 0
              ? `All ${healthDeps.length} backend dependencies healthy`
              : `Degraded: ${unhealthyDeps.join(", ")}`}
          </span>
          {healthDeps.length > 0 && (
            <span className="hidden md:inline opacity-70">
              • {healthDeps.map(([name]) => name).join(", ")}
            </span>
          )}
        </div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
        >
          Diagnostic Status
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Primary KPI Grid (all values from the backend; "—" means no data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Logged Headcount Today"
          value={fmtNumber(siteKpis?.manpower_present, 0)}
          unit="pax"
          change="From daily manpower log"
          icon={<Users className="h-4 w-4 text-amber-500" />}
        />
        <KpiCard
          title="PPE Compliance (frames)"
          value={fmtPct(summary?.ppe_compliance_pct)}
          change={hasValue(summary?.ppe_compliance_pct) ? "Share of compliant CV frames" : "No CV data yet"}
          icon={<HardHat className="h-4 w-4 text-emerald-500" />}
          status={
            !hasValue(summary?.ppe_compliance_pct)
              ? "default"
              : summary.ppe_compliance_pct >= 95
              ? "success"
              : "warning"
          }
        />
        <KpiCard
          title="Open Safety Alerts"
          value={fmtNumber(summary?.active_alerts_count, 0)}
          unit="active"
          change={hasCritical ? "Critical alert active" : "No critical alerts"}
          trend={hasCritical ? "down" : "neutral"}
          icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          status={hasCritical ? "critical" : summary?.active_alerts_count ? "warning" : "default"}
        />
        <KpiCard
          title="Sensors Reporting"
          value={
            hasValue(summary?.total_sensors_count) && summary.total_sensors_count > 0
              ? `${summary.online_sensors_count}/${summary.total_sensors_count}`
              : NO_DATA
          }
          unit="online"
          change="Seen within the last 5 minutes"
          icon={<Radio className="h-4 w-4 text-sky-500" />}
        />
      </div>

      {/* Capital Project Health, Master Completion & Milestone Tracking */}
      <ProjectStatusCard
        project={currentProject}
        schedules={schedules}
        boq={boq}
        availableProjects={projects}
      />

      {/* Live Video Stream & Site Safety Risk Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardLiveVideoCard />
        </div>

        {/* Risk & Environment Card */}
        <Card className="lg:col-span-1 border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
          <div>
            <CardHeader className="p-5 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Site Safety Index
              </CardTitle>
              <CardDescription className="text-xs">
                Weighted count of active alerts and PPE violations per zone.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0 flex flex-col items-center">
              {hasValue(risk?.overall_risk_score) ? (
                <RiskGauge score={risk.overall_risk_score} />
              ) : (
                <p className="py-10 text-xs text-zinc-500">No risk data for this site</p>
              )}
              <p className="text-[10px] text-zinc-400 text-center">
                Heuristic score (hand-set weights), not a validated model.
              </p>
            </CardContent>
          </div>

          {/* Environmental metrics (latest live reading per sensor type) */}
          <div className="p-5 pt-0">
            <div className="w-full grid grid-cols-2 gap-2 border-t border-zinc-100 dark:border-zinc-800/80 pt-4 text-center">
              <div className="flex flex-col items-center p-2 rounded-lg bg-zinc-50 dark:bg-zinc-850">
                <Thermometer className="h-4 w-4 text-amber-500 mb-1" />
                <span className="text-[10px] text-zinc-400">Temp</span>
                <span className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  {fmtNumber(temperature?.value)} {temperature ? temperature.unit : ""}
                </span>
              </div>
              <div className="flex flex-col items-center p-2 rounded-lg bg-zinc-50 dark:bg-zinc-850">
                <Droplets className="h-4 w-4 text-sky-500 mb-1" />
                <span className="text-[10px] text-zinc-400">Humidity</span>
                <span className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200">
                  {fmtNumber(humidity?.value)} {humidity ? humidity.unit : ""}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Live IoT Telemetry Streams Grid */}
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
              Live IoT Telemetry Streams
            </CardTitle>
            <CardDescription className="text-xs">
              Real-time sub-second readings with hardware battery diagnostics.
            </CardDescription>
          </div>
          <Link href="/live">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs text-amber-500 hover:text-amber-400"
            >
              Full Wall
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TELEMETRY_TILES.map(({ type, label }) => {
              const reading = latestByType(sensorLatest, type);
              return (
                <div
                  key={type}
                  className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</span>
                    <StatusDot status={reading ? "healthy" : "offline"} size="sm" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="font-mono text-xl font-black text-zinc-900 dark:text-zinc-50">
                      {fmtNumber(reading?.value, 2)}
                    </span>
                    <span className="text-[10px] text-zinc-400">{reading?.unit}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1 block">
                    {reading ? `Updated ${new Date(reading.ts).toLocaleTimeString()}` : "No live reading"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* AI PPE Detection Summary Banner */}
          <div className="mt-4 flex items-center justify-between p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-zinc-950">
                <HardHat className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  Computer Vision PPE Checks
                </h4>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {cvConfig
                    ? cvConfig.cv_mode === "yolo"
                      ? `YOLO model ${cvConfig.model_path} at up to ${cvConfig.inference_fps} FPS`
                      : "Running the MOCK detector: detections are synthetic, not real model output"
                    : "Detector status unavailable"}
                </p>
              </div>
            </div>
            <Link href="/safety">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-amber-500/40"
              >
                Review PPE
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Bottom Row: Active Alerts Feed & Recent Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Alerts */}
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Active Critical & Warning Alerts
              </CardTitle>
            </div>
            <Link
              href="/alerts"
              className="text-xs text-amber-500 hover:underline"
            >
              View All ({alerts.length})
            </Link>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-3">
            {alerts.filter((a) => a.status === "active").length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                No active threshold alerts. All telemetry within safe
                parameters.
              </div>
            ) : (
              alerts
                .filter((a) => a.status === "active")
                .slice(0, 3)
                .map((alert) => (
                  <div
                    key={alert.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/40"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={alert.severity} />
                        <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                          {alert.title}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                        {alert.message}
                      </p>
                      <span className="text-[10px] text-zinc-400 block font-mono">
                        {new Date(alert.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAcknowledge(alert.id)}
                      className="shrink-0 text-xs border-zinc-300 dark:border-zinc-700 hover:border-amber-500"
                    >
                      Acknowledge
                    </Button>
                  </div>
                ))
            )}
          </CardContent>
        </Card>

        {/* Recent Incidents */}
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-500">
                Recent Safety Incidents
              </CardTitle>
            </div>
            <Link
              href="/incidents"
              className="text-xs text-amber-500 hover:underline"
            >
              Kanban Board ({incidents.length})
            </Link>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-3">
            {incidents.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-400">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                No reported safety incidents on site. Operations running safely.
              </div>
            ) : (
              incidents.slice(0, 3).map((inc) => (
                <Link
                  key={inc.id}
                  href={`/incidents/${inc.id}`}
                  className="group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-850/40 hover:border-amber-500/50 transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-amber-500 uppercase">
                        {String(inc.id).slice(0, 8)}
                      </span>
                      <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 group-hover:text-amber-500 transition-colors truncate">
                        {inc.title}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                      {inc.description}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                      <span>{inc.location || "Sector General"}</span>
                      <span>•</span>
                      <span>Assignee: {inc.assigned_to || "Unassigned"}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {inc.status ? String(inc.status).replace("_", " ") : "Reported"}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
