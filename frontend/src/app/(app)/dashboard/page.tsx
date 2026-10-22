"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  HardHat,
  Radio,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
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
  { type: "temperature", label: "Temperature" },
  { type: "humidity", label: "Humidity" },
  { type: "gas", label: "Gas" },
  { type: "noise", label: "Noise" },
  { type: "vibration", label: "Vibration" },
  { type: "dust", label: "Dust" },
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

  const { data: sitesData } = useQuery<any>({
    queryKey: ["project-sites", activeProjectId],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${activeProjectId}/sites`),
    enabled: Boolean(activeProjectId),
    staleTime: 30000,
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
    enabled: Boolean(activeProjectId),
    staleTime: 30000,
  });

  // Fetch active project BOQ
  const { data: boqData, refetch: refetchBoq } = useQuery<any>({
    queryKey: ["project-boq", activeProjectId],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${activeProjectId}/boq`),
    enabled: Boolean(activeProjectId),
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

  const activeAlerts = alerts.filter((a) => a.status === "active");
  const healthProblem = healthError || (health && unhealthyDeps.length > 0);
  const siteName = normalizeList<any>(sitesData).find((st) => st.id === activeSiteId)?.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={siteName ? `Live overview for ${siteName}` : "Live overview of the selected site"}
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
          className="gap-1.5"
          disabled={isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </PageHeader>

      {/* Only shown when something needs attention */}
      {healthProblem && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-300">
          <span className="flex items-center gap-2">
            <StatusDot status="warning" size="sm" />
            {healthError ? "Backend health check unavailable" : `Degraded: ${unhealthyDeps.join(", ")}`}
          </span>
          <Link href="/admin" className="inline-flex items-center gap-1 font-medium hover:underline">
            Details <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* KPIs (all from the backend; "—" means no data) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          title="Open alerts"
          value={fmtNumber(summary?.active_alerts_count, 0)}
          change={hasCritical ? "Includes a critical alert" : "No critical alerts"}
          trend={hasCritical ? "down" : "neutral"}
          icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          status={hasCritical ? "critical" : summary?.active_alerts_count ? "warning" : "default"}
        />
        <KpiCard
          title="PPE compliance"
          value={fmtPct(summary?.ppe_compliance_pct)}
          change={hasValue(summary?.ppe_compliance_pct) ? "Share of compliant camera frames" : "No camera data yet"}
          icon={<HardHat className="h-4 w-4 text-emerald-500" />}
          status={
            !hasValue(summary?.ppe_compliance_pct) ? "default" : summary.ppe_compliance_pct >= 95 ? "success" : "warning"
          }
        />
        <KpiCard
          title="Sensors online"
          value={
            hasValue(summary?.total_sensors_count) && summary.total_sensors_count > 0
              ? `${summary.online_sensors_count} / ${summary.total_sensors_count}`
              : NO_DATA
          }
          change="Reported in the last 5 minutes"
          icon={<Radio className="h-4 w-4 text-sky-500" />}
        />
        <KpiCard
          title="Headcount today"
          value={fmtNumber(siteKpis?.manpower_present, 0)}
          change="From the daily manpower log"
          icon={<Users className="h-4 w-4 text-amber-500" />}
        />
      </div>

      {/* What needs action */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between p-5 pb-3">
            <CardTitle className="text-sm font-semibold">Active alerts</CardTitle>
            <Link href="/alerts" className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {activeAlerts.length === 0 ? (
              <EmptyRow icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} text="No active alerts" />
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {activeAlerts.slice(0, 5).map((alert) => (
                  <li key={alert.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={alert.severity} />
                        <span className="text-xs text-zinc-500">{new Date(alert.created_at).toLocaleString()}</span>
                      </div>
                      <p className="truncate text-sm text-zinc-800 dark:text-zinc-200">{alert.message}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleAcknowledge(alert.id)} className="shrink-0">
                      Acknowledge
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between p-5 pb-3">
            <CardTitle className="text-sm font-semibold">Recent incidents</CardTitle>
            <Link href="/incidents" className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {incidents.length === 0 ? (
              <EmptyRow icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />} text="No incidents reported" />
            ) : (
              <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {incidents.slice(0, 5).map((inc) => (
                  <li key={inc.id}>
                    <Link
                      href={`/incidents/${inc.id}`}
                      className="group flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <span className="font-mono">{inc.incident_number ?? String(inc.id).slice(0, 8)}</span>
                          <span>·</span>
                          <span>{new Date(inc.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="truncate text-sm text-zinc-800 group-hover:text-amber-600 dark:text-zinc-200 dark:group-hover:text-amber-400">
                          {inc.title}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium capitalize text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {String(inc.status ?? "open").replace(/_/g, " ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live conditions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between p-5 pb-3">
            <div>
              <CardTitle className="text-sm font-semibold">Live sensor readings</CardTitle>
              <CardDescription className="text-xs">Latest value per sensor type, pushed over the live connection</CardDescription>
            </div>
            <Link href="/live" className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline">
              Open live view
            </Link>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {TELEMETRY_TILES.map(({ type, label }) => {
                const reading = latestByType(sensorLatest, type);
                return (
                  <div key={type} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">{label}</span>
                      <StatusDot status={reading ? "healthy" : "idle"} size="sm" />
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-1">
                      <span className="font-mono text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                        {fmtNumber(reading?.value, 2)}
                      </span>
                      <span className="text-xs text-zinc-500">{reading?.unit}</span>
                    </div>
                    <span className="mt-0.5 block text-[11px] text-zinc-400">
                      {reading ? new Date(reading.ts).toLocaleTimeString() : "No reading yet"}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-2">
            <CardTitle className="text-sm font-semibold">Site safety index</CardTitle>
            <CardDescription className="text-xs">
              Heuristic from active alerts and PPE violations (hand-set weights, not a validated model)
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center p-5 pt-0">
            {hasValue(risk?.overall_risk_score) ? (
              <RiskGauge score={risk.overall_risk_score} size={160} />
            ) : (
              <p className="py-8 text-sm text-zinc-500">No risk data for this site</p>
            )}
            <Link
              href="/safety"
              className="mt-2 flex w-full items-center gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-left hover:border-amber-500/50"
            >
              <HardHat className="h-5 w-5 shrink-0 text-amber-500" />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-zinc-800 dark:text-zinc-200">PPE detector</span>
                <span className="block text-xs text-zinc-500">
                  {cvConfig
                    ? cvConfig.cv_mode === "yolo"
                      ? `YOLO · ${cvConfig.model_path}`
                      : "Mock detector: results are synthetic"
                    : "Status unavailable"}
                </span>
              </span>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-zinc-400" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <DashboardLiveVideoCard />

      <ProjectStatusCard project={currentProject} schedules={schedules} boq={boq} availableProjects={projects} />
    </div>
  );
}

function EmptyRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 px-3 py-4 text-sm text-zinc-500">
      {icon}
      {text}
    </div>
  );
}
