"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Kanban,
  Table as TableIcon,
  Search,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SeverityBadge } from "@/components/common/SeverityBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProjectStore } from "@/stores/projectStore";
import { apiClient } from "@/lib/api/client";
import { normalizeList } from "@/lib/utils";
import { toast } from "sonner";

interface IncidentItem {
  id: string;
  incident_number?: string;
  site_id: string;
  zone_id?: string;
  title: string;
  description: string;
  status: "open" | "acknowledged" | "investigating" | "resolved" | "closed" | string;
  severity: "critical" | "high" | "medium" | "low" | string;
  assigned_to?: string;
  reported_by?: string;
  location?: string;
  created_at: string;
  updated_at: string;
}

// Aligned with backend IncidentStatus enum: open, acknowledged, investigating, resolved, closed
const KANBAN_COLUMNS = [
  { id: "open", label: "Open / Reported", color: "#f59e0b" },
  { id: "acknowledged", label: "Acknowledged", color: "#38bdf8" },
  { id: "investigating", label: "Under Investigation", color: "#a855f7" },
  { id: "resolved", label: "Resolved", color: "#10b981" },
  { id: "closed", label: "Closed", color: "#64748b" },
];

function normalizeIncidentStatus(status?: string): string {
  if (!status) return "open";
  const s = status.toLowerCase();
  if (s === "reported") return "open";
  if (s === "action_required") return "acknowledged";
  if (s === "under_investigation") return "investigating";
  return s;
}

export default function IncidentsPage() {
  const activeSiteId = useProjectStore((s) => s.activeSiteId);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [siteScope, setSiteScope] = useState<"all" | "active">("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // New incident form state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newSeverity, setNewSeverity] = useState<"high" | "medium" | "low">("medium");
  const [newLocation, setNewLocation] = useState("");

  // Fetch incidents
  const {
    data: incidentsData,
    refetch,
    isFetching,
  } = useQuery<any>({
    queryKey: ["incidents", siteScope === "active" ? activeSiteId : "all"],
    queryFn: () => {
      const params = siteScope === "active" && activeSiteId ? { site_id: activeSiteId } : {};
      return apiClient.get<any>("/api/v1/incidents", { params });
    },
  });

  const incidents = normalizeList<IncidentItem>(incidentsData);

  // Status update mutation using POST /api/v1/incidents/{id}/status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiClient.post(`/api/v1/incidents/${id}/status`, {
        status,
        comment: `Lifecycle transitioned to ${status} via Kanban board`,
      });
    },
    onSuccess: (_, vars) => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      toast.success(`Incident moved to ${vars.status.replace("_", " ").toUpperCase()}`);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update incident status");
    },
  });

  // Create incident mutation using POST /api/v1/incidents
  const createIncidentMutation = useMutation({
    mutationFn: async (payload: any) => {
      return apiClient.post("/api/v1/incidents", payload);
    },
    onSuccess: (res: any) => {
      toast.success(`Incident Ticket ${res.incident_number || ""} logged successfully`);
      setIsCreateOpen(false);
      setNewTitle("");
      setNewDesc("");
      setNewLocation("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to log incident ticket");
    },
  });

  const handleUpdateStatus = (id: string, newStatus: string) => {
    updateStatusMutation.mutate({ id, status: newStatus });
  };

  const handleCreateIncident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      toast.error("Please enter an incident summary title");
      return;
    }

    const payload: any = {
      site_id: activeSiteId || "0907d5cb-7682-48b7-b78d-c999ce138f34",
      title: newTitle.trim(),
      description: newLocation ? `[Location: ${newLocation}] ${newDesc.trim()}` : newDesc.trim() || "Observed on site",
      severity: newSeverity,
    };

    createIncidentMutation.mutate(payload);
  };

  const filteredIncidents = incidents.filter((inc) => {
    const matchesSev =
      severityFilter === "all" ||
      inc.severity.toLowerCase() === severityFilter.toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      (inc.title || "").toLowerCase().includes(query) ||
      (inc.description || "").toLowerCase().includes(query) ||
      (inc.incident_number || "").toLowerCase().includes(query) ||
      (inc.location || "").toLowerCase().includes(query);
    return matchesSev && matchesSearch;
  });

  // Calculate Metrics
  const totalCount = incidents.length;
  const openCount = incidents.filter((i) => ["open", "reported"].includes(normalizeIncidentStatus(i.status))).length;
  const inProgressCount = incidents.filter((i) => ["acknowledged", "investigating"].includes(normalizeIncidentStatus(i.status))).length;
  const resolvedCount = incidents.filter((i) => ["resolved", "closed"].includes(normalizeIncidentStatus(i.status))).length;
  const highSevCount = incidents.filter((i) => ["critical", "high"].includes(i.severity.toLowerCase())).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Safety Incidents & Corrective Action Kanban"
        description="Lifecycle tracking of physical hazards, containment workflows, and engineering remediations."
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5 border-zinc-200 dark:border-zinc-800 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-100 dark:bg-zinc-900">
            <button
              onClick={() => setViewMode("kanban")}
              className={`p-1.5 rounded-md text-xs font-bold transition-colors ${
                viewMode === "kanban"
                  ? "bg-white dark:bg-zinc-800 text-amber-500 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
              }`}
              title="Kanban Board View"
            >
              <Kanban className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              className={`p-1.5 rounded-md text-xs font-bold transition-colors ${
                viewMode === "table"
                  ? "bg-white dark:bg-zinc-800 text-amber-500 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
              }`}
              title="Table View"
            >
              <TableIcon className="h-4 w-4" />
            </button>
          </div>

          <Button
            variant="amber"
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="gap-1.5 font-bold text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Report Incident
          </Button>
        </div>
      </PageHeader>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3.5">
          <span className="text-[10px] font-mono font-bold uppercase text-zinc-500 dark:text-zinc-400">
            Total Tickets
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 mt-1">
            {totalCount}
          </div>
          <span className="text-[10px] text-zinc-400 block mt-0.5">Across all sectors</span>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3.5">
          <span className="text-[10px] font-mono font-bold uppercase text-amber-600 dark:text-amber-400">
            Open / Reported
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-amber-500 mt-1">
            {openCount}
          </div>
          <span className="text-[10px] text-zinc-400 block mt-0.5">Awaiting triage</span>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3.5">
          <span className="text-[10px] font-mono font-bold uppercase text-sky-600 dark:text-sky-400">
            In Investigation
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-sky-500 mt-1">
            {inProgressCount}
          </div>
          <span className="text-[10px] text-zinc-400 block mt-0.5">Mitigation active</span>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3.5">
          <span className="text-[10px] font-mono font-bold uppercase text-emerald-600 dark:text-emerald-400">
            Resolved / Closed
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-emerald-500 mt-1">
            {resolvedCount}
          </div>
          <span className="text-[10px] text-zinc-400 block mt-0.5">Remediated & signed</span>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-3.5 col-span-2 sm:col-span-1">
          <span className="text-[10px] font-mono font-bold uppercase text-rose-600 dark:text-rose-400">
            Critical / High
          </span>
          <div className="text-xl sm:text-2xl font-black font-mono text-rose-500 mt-1">
            {highSevCount}
          </div>
          <span className="text-[10px] text-zinc-400 block mt-0.5">High hazard priority</span>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900/40 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <Input
            placeholder="Search by ID, title, description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-xs bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Site Scope Toggle */}
          <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-100 dark:bg-zinc-950 text-xs font-mono">
            <button
              onClick={() => setSiteScope("all")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                siteScope === "all"
                  ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
              }`}
            >
              All Project Sites
            </button>
            <button
              onClick={() => setSiteScope("active")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                siteScope === "active"
                  ? "bg-white dark:bg-zinc-800 text-amber-500 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
              }`}
            >
              Selected Site
            </button>
          </div>

          {/* Severity Filter Buttons */}
          <div className="flex items-center gap-1">
            {(["all", "high", "medium", "low"] as const).map((sev) => (
              <Button
                key={sev}
                variant={severityFilter === sev ? "amber" : "outline"}
                size="sm"
                onClick={() => setSeverityFilter(sev)}
                className="h-8 px-2.5 text-xs uppercase font-mono border-zinc-200 dark:border-zinc-800"
              >
                {sev}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Kanban Board View */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 min-h-[550px] overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map((col) => {
            const colIncidents = filteredIncidents.filter(
              (inc) => normalizeIncidentStatus(inc.status) === col.id
            );

            return (
              <div
                key={col.id}
                className="flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 p-3 space-y-3 min-w-[220px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2.5 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: col.color }}
                    />
                    <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100 font-mono">
                      {col.label}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className="font-mono text-[11px] font-bold text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700 px-1.5 py-0"
                  >
                    {colIncidents.length}
                  </Badge>
                </div>

                {/* Tickets list */}
                <div className="flex-1 space-y-3 overflow-y-auto max-h-[700px] pr-0.5">
                  {colIncidents.map((ticket) => {
                    const ticketCode =
                      ticket.incident_number ||
                      `INC-${ticket.id.slice(0, 8).toUpperCase()}`;

                    return (
                      <Card
                        key={ticket.id}
                        className="border-zinc-200 dark:border-zinc-800 hover:border-amber-500/60 bg-white dark:bg-zinc-900 shadow-sm hover:shadow transition-all p-3 space-y-2 cursor-pointer group"
                      >
                        <Link href={`/incidents/${ticket.id}`} className="block space-y-1.5">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-[11px] font-bold text-amber-500 group-hover:underline">
                              {ticketCode}
                            </span>
                            <SeverityBadge severity={ticket.severity} showDot={false} />
                          </div>

                          <h4 className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 line-clamp-2">
                            {ticket.title}
                          </h4>

                          <p className="text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-2">
                            {ticket.description}
                          </p>
                        </Link>

                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-2 text-[10px] text-zinc-500">
                          <span className="font-mono truncate max-w-[90px]">
                            {new Date(ticket.created_at).toLocaleDateString()}
                          </span>

                          <select
                            value={normalizeIncidentStatus(ticket.status)}
                            onChange={(e) => handleUpdateStatus(ticket.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded px-1.5 py-0.5 text-[10px] font-mono text-zinc-800 dark:text-zinc-200 outline-none focus:ring-1 focus:ring-amber-500"
                          >
                            {KANBAN_COLUMNS.map((c) => (
                              <option key={c.id} value={c.id}>
                                Move: {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </Card>
                    );
                  })}

                  {colIncidents.length === 0 && (
                    <div className="py-12 text-center text-xs text-zinc-400 dark:text-zinc-600 font-mono">
                      Empty column
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono uppercase text-[10px]">
                <tr>
                  <th className="p-3">Ticket ID</th>
                  <th className="p-3">Title & Summary</th>
                  <th className="p-3">Severity</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Reported Date</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-sans">
                {filteredIncidents.map((ticket) => {
                  const ticketCode =
                    ticket.incident_number ||
                    `INC-${ticket.id.slice(0, 8).toUpperCase()}`;

                  return (
                    <tr
                      key={ticket.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="p-3 font-mono font-bold text-amber-500">{ticketCode}</td>
                      <td className="p-3 max-w-sm">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100 block">
                          {ticket.title}
                        </span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                          {ticket.description}
                        </span>
                      </td>
                      <td className="p-3">
                        <SeverityBadge severity={ticket.severity} />
                      </td>
                      <td className="p-3">
                        <Badge
                          variant="outline"
                          className="capitalize font-mono text-[10px] text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700"
                        >
                          {normalizeIncidentStatus(ticket.status).replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-zinc-500">
                        {new Date(ticket.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <Link href={`/incidents/${ticket.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-amber-500 hover:text-amber-400 border-zinc-200 dark:border-zinc-800 font-medium"
                          >
                            Inspect <ArrowRight className="h-3 w-3 ml-1" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {filteredIncidents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-xs text-zinc-400 font-mono">
                      No safety incidents matching the search and severity filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Report New Incident Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold font-mono text-zinc-900 dark:text-white">
              Report Safety Hazard / Incident
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateIncident} className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Incident Title
              </label>
              <Input
                placeholder="e.g. Scaffolding loose toe-board on level 3"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Detailed Description & Immediate Containment
              </label>
              <textarea
                placeholder="Describe observations, immediate danger, and containment steps..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full h-24 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-amber-500/50"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Severity Level
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {(["low", "medium", "high"] as const).map((s) => (
                    <Button
                      type="button"
                      key={s}
                      variant={newSeverity === s ? "amber" : "outline"}
                      size="sm"
                      onClick={() => setNewSeverity(s)}
                      className="h-8 text-xs uppercase font-mono border-zinc-300 dark:border-zinc-700"
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Location / Zone
                </label>
                <Input
                  placeholder="e.g. Tower B - Floor 4"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                className="border-zinc-300 dark:border-zinc-700 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="amber"
                size="sm"
                disabled={createIncidentMutation.isPending}
                className="font-bold text-xs gap-1"
              >
                {createIncidentMutation.isPending && (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                )}
                Log Incident Ticket
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
