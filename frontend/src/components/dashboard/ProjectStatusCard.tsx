"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProjectStore } from "@/stores/projectStore";
import { NO_DATA, fmtNumber, fmtPct } from "@/lib/format";

export interface ScheduleItem {
  id: string;
  task_name?: string;
  name?: string;
  wbs_code?: string;
  start_date?: string;
  end_date?: string;
  progress_percent?: number;
  progress_pct?: number;
  status?: string;
  critical?: boolean;
  is_critical?: boolean;
}

interface BoqRow {
  id: string;
  item_code?: string;
  description?: string;
  unit?: string;
  planned_quantity?: number;
  consumed_quantity?: number;
  unit_rate?: number | string;
  total_planned_cost?: number | string;
}

interface ProjectStatusCardProps {
  project?: {
    id: string;
    name: string;
    code: string;
    status?: string;
    budget?: number;
    start_date?: string;
    end_date?: string;
    description?: string;
  };
  schedules?: ScheduleItem[];
  boq?: BoqRow[];
  availableProjects?: Array<{
    id: string;
    name: string;
    code: string;
  }>;
}

const scheduleProgress = (s: ScheduleItem) =>
  Math.min(100, Math.max(0, Number(s.progress_percent ?? s.progress_pct ?? 0)));

export function ProjectStatusCard({
  project,
  schedules = [],
  boq = [],
  availableProjects = [],
}: ProjectStatusCardProps) {
  const { activeProjectId, setActiveProject } = useProjectStore();
  const [activeTab, setActiveTab] = useState<"milestones" | "materials">("milestones");

  if (!project) {
    return (
      <Card className="border-zinc-200 dark:border-zinc-800 p-5 text-xs text-zinc-500">
        No project data available. Create a project or check the backend connection.
      </Card>
    );
  }

  // Unweighted mean of task progress; null when the project has no schedule tasks
  const meanProgress = schedules.length
    ? schedules.reduce((sum, s) => sum + scheduleProgress(s), 0) / schedules.length
    : null;

  // Cost figures derived only from BOQ rows (planned vs consumed quantity at unit rate)
  const boqPlanned = boq.reduce((sum, b) => sum + Number(b.total_planned_cost ?? 0), 0);
  const boqConsumed = boq.reduce(
    (sum, b) => sum + Number(b.consumed_quantity ?? 0) * Number(b.unit_rate ?? 0),
    0
  );
  const boqConsumedPct = boqPlanned > 0 ? (boqConsumed / boqPlanned) * 100 : null;

  const statusCounts = schedules.reduce<Record<string, number>>((acc, s) => {
    const key = s.status || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const tabClass = (tab: string) =>
    `px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
      activeTab === tab
        ? "bg-amber-500 text-zinc-950 font-bold"
        : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
    }`;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-4 sm:p-5 pb-3 border-b border-zinc-200 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-zinc-500">{project.code}</span>
            {project.status && (
              <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                {project.status.toUpperCase()}
              </Badge>
            )}
          </div>
          <CardTitle className="text-base font-semibold">{project.name}</CardTitle>
          {project.description && (
            <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">{project.description}</CardDescription>
          )}
        </div>

        <div className="flex items-center gap-2">
          {availableProjects.length > 1 && (
            <select
              value={activeProjectId}
              onChange={(e) => setActiveProject(e.target.value)}
              className="h-8 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-2.5 text-xs font-mono font-medium text-zinc-800 dark:text-zinc-200 outline-none focus:ring-1 focus:ring-amber-500"
            >
              {availableProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}: {p.name}
                </option>
              ))}
            </select>
          )}
          <Link href={`/projects/${project.id}`}>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
            >
              <span>Project Details</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Schedule progress */}
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Mean Task Progress
              </span>
              <span className="text-xs text-zinc-500">
                {project.end_date ? `Target: ${project.end_date}` : NO_DATA}
              </span>
            </div>
            <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">{fmtPct(meanProgress)}</div>
            <div className="mt-3 h-2.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${meanProgress ?? 0}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              Unweighted average over {schedules.length} schedule task{schedules.length === 1 ? "" : "s"}
            </p>
          </div>

          {/* Budget and BOQ value */}
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Budget & BOQ Consumption
            </span>
            <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">{fmtPct(boqConsumedPct)}</div>
            <div className="mt-3 h-2.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
              <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, boqConsumedPct ?? 0)}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">
              BOQ consumed {fmtNumber(boqConsumed, 0)} of {fmtNumber(boqPlanned || null, 0)} planned value · Budget{" "}
              {fmtNumber(project.budget, 0)}
            </p>
          </div>

          {/* Schedule status breakdown */}
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Schedule Task Status
            </span>
            {schedules.length === 0 ? (
              <p className="mt-3 text-xs text-zinc-500">No schedule tasks</p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-1.5 text-center text-xs">
                {Object.entries(statusCounts).map(([status, count]) => (
                  <div key={status} className="p-1.5 rounded bg-zinc-100 dark:bg-zinc-900">
                    <span className="text-[11px] text-zinc-500 block capitalize">{status.replace(/_/g, " ")}</span>
                    <span className="text-base font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setActiveTab("milestones")} className={tabClass("milestones")}>
                Schedule ({schedules.length})
              </button>
              <button type="button" onClick={() => setActiveTab("materials")} className={tabClass("materials")}>
                BOQ ({boq.length})
              </button>
            </div>
            <Link
              href={`/projects/${project.id}`}
              className="text-[11px] font-mono text-amber-500 hover:underline flex items-center gap-1"
            >
              <span>Open project</span>
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {activeTab === "milestones" &&
            (schedules.length === 0 ? (
              <p className="text-xs text-zinc-500">No schedule tasks for this project.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {schedules.map((sch) => {
                  const progress = scheduleProgress(sch);
                  const isCritical = Boolean(sch.critical || sch.is_critical);
                  return (
                    <div
                      key={sch.id}
                      className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold text-amber-500">
                          {sch.wbs_code ? `WBS ${sch.wbs_code}` : "TASK"}
                        </span>
                        {isCritical && (
                          <Badge variant="destructive" className="text-[9px] px-1 py-0 font-mono">
                            Critical Path
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 line-clamp-1">
                        {sch.task_name || sch.name || NO_DATA}
                      </h4>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                        {sch.start_date ?? NO_DATA} → {sch.end_date ?? NO_DATA}
                      </p>
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-zinc-500">{sch.status ?? ""}</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200">{progress}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${progress === 100 ? "bg-emerald-500" : "bg-sky-500"}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

          {activeTab === "materials" &&
            (boq.length === 0 ? (
              <p className="text-xs text-zinc-500">No BOQ items for this project.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {boq.map((b) => {
                  const planned = Number(b.planned_quantity ?? 0);
                  const consumed = Number(b.consumed_quantity ?? 0);
                  const pct = planned > 0 ? (consumed / planned) * 100 : null;
                  return (
                    <div
                      key={b.id}
                      className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold text-amber-500">{b.item_code}</span>
                        <span className="text-[10px] font-mono text-zinc-500">{fmtPct(pct)} consumed</span>
                      </div>
                      <p className="text-zinc-700 dark:text-zinc-300 line-clamp-1">{b.description}</p>
                      <div className="flex items-baseline gap-1 font-mono">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">
                          {fmtNumber(consumed, 1)} {b.unit}
                        </span>
                        <span className="text-zinc-500">
                          / {fmtNumber(planned, 1)} {b.unit} planned
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
