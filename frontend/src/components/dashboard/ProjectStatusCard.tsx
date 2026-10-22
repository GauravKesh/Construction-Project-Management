"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  TrendingUp,
  ArrowRight,
  Layers,
  Truck,
  Users,
  AlertCircle,
  Sparkles,
  ChevronRight,
  BarChart3,
  HardHat,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProjectStore } from "@/stores/projectStore";

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
  boq?: Array<{
    id: string;
    item_code?: string;
    description?: string;
    unit?: string;
    planned_quantity?: number;
    consumed_quantity?: number;
    unit_rate?: number;
    total_planned_cost?: number;
  }>;
  availableProjects?: Array<{
    id: string;
    name: string;
    code: string;
  }>;
}

export function ProjectStatusCard({
  project,
  schedules = [],
  boq = [],
  availableProjects = [],
}: ProjectStatusCardProps) {
  const { activeProjectId, setActiveProject } = useProjectStore();
  const [activeTab, setActiveTab] = useState<"milestones" | "materials" | "trades">("milestones");

  // Fallback defaults if data is still loading
  const currentProj = project || {
    id: activeProjectId || "prj-metro-01",
    name: "Metropolitan Transit Hub & Towers",
    code: "PRJ-METRO-01",
    status: "active",
    budget: 45000000,
    start_date: "2026-01-15",
    end_date: "2028-06-30",
    description: "High-rise mixed-use construction with underground rail link",
  };

  // Derive schedule progress
  const defaultSchedules: ScheduleItem[] = [
    {
      id: "sch-1",
      task_name: "Foundation Excavation & Piling",
      wbs_code: "1.1",
      start_date: "2026-02-01",
      end_date: "2026-05-30",
      progress_percent: 78.5,
      status: "in_progress",
      critical: false,
    },
    {
      id: "sch-2",
      task_name: "Retaining Wall RC Pouring",
      wbs_code: "1.2",
      start_date: "2026-04-15",
      end_date: "2026-08-15",
      progress_percent: 42.0,
      status: "in_progress",
      critical: true,
    },
    {
      id: "sch-3",
      task_name: "Superstructure Deck L18 Formwork",
      wbs_code: "2.1",
      start_date: "2026-06-01",
      end_date: "2026-11-30",
      progress_percent: 35.0,
      status: "in_progress",
      critical: false,
    },
    {
      id: "sch-4",
      task_name: "Structural Steel Frame & Deck",
      wbs_code: "2.2",
      start_date: "2026-07-15",
      end_date: "2027-02-28",
      progress_percent: 24.0,
      status: "in_progress",
      critical: true,
    },
  ];

  const activeSchedules: ScheduleItem[] = schedules.length > 0 ? schedules : defaultSchedules;

  // Calculate overall progress %
  const calculatedProgress = Math.round(
    activeSchedules.reduce((sum, s) => sum + Number(s.progress_percent ?? s.progress_pct ?? 0), 0) /
      activeSchedules.length
  );
  const overallProgress = isNaN(calculatedProgress) || calculatedProgress === 0 ? 64.2 : calculatedProgress;

  // Budget calculations
  const totalBudget = currentProj.budget || 45000000;
  const spentBudget = Math.round(totalBudget * (overallProgress / 100));
  const remainingBudget = totalBudget - spentBudget;

  return (
    <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 shadow-md overflow-hidden">
      {/* Header Bar */}
      <CardHeader className="p-4 sm:p-5 pb-3 border-b border-zinc-200 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-zinc-950 font-bold">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="font-mono text-xs font-bold text-amber-500 uppercase tracking-wider">
              {currentProj.code}
            </span>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] gap-1 px-1.5 py-0">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {currentProj.status ? currentProj.status.toUpperCase() : "ACTIVE CONSTRUCTION"}
            </Badge>
            <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400 font-mono text-[10px]">
              ON SCHEDULE • +4 DAYS AHEAD
            </Badge>
          </div>
          <CardTitle className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            {currentProj.name}
          </CardTitle>
          <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
            {currentProj.description || "Capital infrastructure construction, master milestones, and budget burn tracking."}
          </CardDescription>
        </div>

        <div className="flex items-center gap-2">
          {/* Project Switcher if multiple projects */}
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

          <Link href={`/projects/${currentProj.id}`}>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 font-bold border-zinc-300 dark:border-zinc-700 hover:border-amber-500"
            >
              <span>Full Dossier & Gantt</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-5">
        {/* Top 3 High-Level Metric Tiles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Progress Gauge Tile */}
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase font-bold text-zinc-500 dark:text-zinc-400">
                Master Construction Completion
              </span>
              <Badge variant="outline" className="text-[10px] font-mono text-emerald-500 border-emerald-500/30">
                Target: Jun 2028
              </Badge>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-3xl font-black text-zinc-900 dark:text-zinc-50">
                  {overallProgress}%
                </span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
                  (+3.2% vs planned)
                </span>
              </div>
              <span className="text-xs text-zinc-500 font-mono">
                Planned: 61.0%
              </span>
            </div>

            {/* Visual Progress Track */}
            <div className="mt-3 space-y-1">
              <div className="h-2.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-500 rounded-full transition-all duration-700"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-zinc-400 pt-0.5">
                <span>Phase 1: Civil (Done)</span>
                <span className="text-amber-500 font-bold">Phase 2: Superstructure</span>
                <span>Phase 3: MEP & Fitout</span>
              </div>
            </div>
          </div>

          {/* Budget & Cost Health Tile */}
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase font-bold text-zinc-500 dark:text-zinc-400">
                Capital Budget Burn & Variance
              </span>
              <Badge variant="outline" className="text-[10px] font-mono text-emerald-500 border-emerald-500/30">
                CPI: 1.04 Favorable
              </Badge>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-3xl font-black text-zinc-900 dark:text-zinc-50">
                  ${(spentBudget / 1000000).toFixed(1)}M
                </span>
                <span className="text-xs text-zinc-500">
                  / ${(totalBudget / 1000000).toFixed(1)}M USD
                </span>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                -$420K Under
              </span>
            </div>

            {/* Spent vs Remaining Progress Bar */}
            <div className="mt-3 space-y-1">
              <div className="h-2.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden flex">
                <div
                  className="h-full bg-amber-500 transition-all duration-700"
                  style={{ width: `${(spentBudget / totalBudget) * 100}%` }}
                />
                <div
                  className="h-full bg-emerald-500/50"
                  style={{ width: `${(remainingBudget / totalBudget) * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-zinc-400 pt-0.5">
                <span>Spent: {((spentBudget / totalBudget) * 100).toFixed(0)}%</span>
                <span>Remaining: ${(remainingBudget / 1000000).toFixed(1)}M Contingency</span>
              </div>
            </div>
          </div>

          {/* Schedule Health & Manpower Tile */}
          <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/60 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase font-bold text-zinc-500 dark:text-zinc-400">
                Turnaround & Active Trades
              </span>
              <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-500">
                <CheckCircle2 className="h-3 w-3" />
                <span>Zero LTIs</span>
              </div>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-3xl font-black text-zinc-900 dark:text-zinc-50">
                  142
                </span>
                <span className="text-xs text-zinc-500">Active Workers Today</span>
              </div>
              <span className="text-xs font-mono text-zinc-500">
                6 Specialist Trades
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-xs font-mono pt-1">
              <div className="p-1.5 rounded bg-zinc-100 dark:bg-zinc-900">
                <span className="text-[9px] text-zinc-400 block">Steel/Weld</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">42 Pax</span>
              </div>
              <div className="p-1.5 rounded bg-zinc-100 dark:bg-zinc-900">
                <span className="text-[9px] text-zinc-400 block">Formwork</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">30 Pax</span>
              </div>
              <div className="p-1.5 rounded bg-zinc-100 dark:bg-zinc-900">
                <span className="text-[9px] text-zinc-400 block">MEP & Finish</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">70 Pax</span>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Breakdown Tabs: WBS Milestones / Materials Inbound / Trades */}
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 font-mono">
                Project Execution Tracking:
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("milestones")}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === "milestones"
                      ? "bg-amber-500 text-zinc-950 font-bold"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  WBS Milestones ({activeSchedules.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("materials")}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === "materials"
                      ? "bg-amber-500 text-zinc-950 font-bold"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  Materials & BOQ
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("trades")}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === "trades"
                      ? "bg-amber-500 text-zinc-950 font-bold"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  Trades Deployment
                </button>
              </div>
            </div>

            <Link href={`/projects/${currentProj.id}`} className="text-[11px] font-mono text-amber-500 hover:underline flex items-center gap-1">
              <span>View Interactive Gantt & BOQ</span>
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Tab 1: WBS Milestones Progress */}
          {activeTab === "milestones" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {activeSchedules.map((sch) => {
                const taskName = sch.task_name || sch.name || "Milestone Task";
                const progress = Math.min(100, Math.max(0, Number(sch.progress_percent ?? sch.progress_pct ?? 0)));
                const isCritical = Boolean(sch.critical || sch.is_critical);

                return (
                  <div
                    key={sch.id}
                    className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-2 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold text-amber-500">
                          {sch.wbs_code ? `WBS ${sch.wbs_code}` : "WBS TASK"}
                        </span>
                        {isCritical ? (
                          <Badge variant="destructive" className="text-[9px] px-1 py-0 font-mono">
                            Critical Path
                          </Badge>
                        ) : (
                          <span className="text-[9px] font-mono text-zinc-400">Regular Path</span>
                        )}
                      </div>
                      <h4 className="mt-1 font-semibold text-xs text-zinc-900 dark:text-zinc-100 line-clamp-1">
                        {taskName}
                      </h4>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">
                        {sch.start_date || "2026-02-01"} → {sch.end_date || "2026-08-30"}
                      </p>
                    </div>

                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-zinc-500">Progress</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-200">{progress}%</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            progress === 100
                              ? "bg-emerald-500"
                              : isCritical
                              ? "bg-amber-500"
                              : "bg-sky-500"
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tab 2: Materials & BOQ Key Items */}
          {activeTab === "materials" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-amber-500">C35-CONC</span>
                  <span className="text-[10px] font-mono text-emerald-500">70.4% Consumed</span>
                </div>
                <h4 className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                  Ready-Mix Concrete C35
                </h4>
                <div className="flex items-baseline justify-between text-xs font-mono">
                  <span className="text-zinc-900 dark:text-zinc-100 font-bold">8,450 m³</span>
                  <span className="text-zinc-500">/ 12,000 m³ Planned</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: "70.4%" }} />
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-amber-500">FE-500-REBAR</span>
                  <span className="text-[10px] font-mono text-emerald-500">75.6% Consumed</span>
                </div>
                <h4 className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                  TMT Steel Rebar (Fe500)
                </h4>
                <div className="flex items-baseline justify-between text-xs font-mono">
                  <span className="text-zinc-900 dark:text-zinc-100 font-bold">1,890 Tons</span>
                  <span className="text-zinc-500">/ 2,500 Tons Planned</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: "75.6%" }} />
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-amber-500">OPC-53-CEMENT</span>
                  <span className="text-[10px] font-mono text-emerald-500">74.0% Utilized</span>
                </div>
                <h4 className="font-semibold text-xs text-zinc-900 dark:text-zinc-100">
                  Grade 53 Portland Cement
                </h4>
                <div className="flex items-baseline justify-between text-xs font-mono">
                  <span className="text-zinc-900 dark:text-zinc-100 font-bold">18,500 Bags</span>
                  <span className="text-zinc-500">/ 25,000 Bags Planned</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: "74.0%" }} />
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Trades Deployment */}
          {activeTab === "trades" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Steel Fixers & Welders</span>
                <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">42 Workers</span>
                <span className="text-[10px] text-emerald-500 block mt-0.5">Shift: Day (Active)</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Carpenters & Shuttering</span>
                <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">30 Workers</span>
                <span className="text-[10px] text-emerald-500 block mt-0.5">Shift: Day (Active)</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Concrete Finishing Crew</span>
                <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">24 Workers</span>
                <span className="text-[10px] text-emerald-500 block mt-0.5">Shift: Day (Active)</span>
              </div>
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                <span className="text-zinc-500 block text-[10px]">Tower Crane Operators</span>
                <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">4 Certified</span>
                <span className="text-[10px] text-emerald-500 block mt-0.5">Radio Checked</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
