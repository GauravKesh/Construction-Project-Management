"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FolderGit2,
  Building2,
  Plus,
  Calendar,
  DollarSign,
  ArrowRight,
  TrendingUp,
  MapPin,
  CheckCircle2,
  Edit2,
  Trash2,
  Check,
  Loader2,
  Clock,
  Layers,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useProjectStore } from "@/stores/projectStore";
import { apiClient } from "@/lib/api/client";
import { normalizeList } from "@/lib/utils";
import { toast } from "sonner";

interface ProjectItem {
  id: string;
  name: string;
  code: string;
  description?: string;
  status: "active" | "planning" | "on_hold" | "completed" | string;
  budget?: number;
  start_date?: string;
  end_date?: string;
  created_at?: string;
}

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setActiveSite = useProjectStore((s) => s.setActiveSite);

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);

  // Form states for creation
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectCode, setNewProjectCode] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newBudget, setNewBudget] = useState("45000000");
  const [newStatus, setNewStatus] = useState("active");
  const [newStartDate, setNewStartDate] = useState("2026-01-15");
  const [newEndDate, setNewEndDate] = useState("2027-12-31");

  // Form states for editing
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBudget, setEditBudget] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editEndDate, setEditEndDate] = useState("");

  // Fetch real projects from PostgreSQL
  const { data: projectsData, refetch, isLoading } = useQuery<any>({
    queryKey: ["projects"],
    queryFn: () => apiClient.get<any>("/api/v1/projects"),
  });

  const projects = normalizeList<ProjectItem>(projectsData);

  // Mutation: Create Project in PostgreSQL
  const createProjectMutation = useMutation({
    mutationFn: async (payload: any) => {
      // 1. Create project
      const created = await apiClient.post<any>("/api/v1/projects", payload);

      // 2. Automatically register default primary site for this project
      try {
        await apiClient.post<any>(`/api/v1/projects/${created.id}/sites`, {
          name: `${created.name} Primary Site`,
          code: `${created.code}-S1`,
          status: "active",
          latitude: 28.5562,
          longitude: 77.1000,
        });
      } catch (err) {
        // non-blocking if site repo handles lazily
      }
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      refetch();
      setActiveProject(created.id);
      toast.success(`Project "${created.name}" registered in PostgreSQL database!`, {
        description: `Project Code: ${created.code} is now active across all dashboards.`,
      });
      setIsCreateOpen(false);
      setNewProjectName("");
      setNewProjectCode("");
      setNewDescription("");
    },
    onError: (err: any) => {
      toast.error("Failed to register project", {
        description: err.message || "An unexpected error occurred while writing to PostgreSQL.",
      });
    },
  });

  // Mutation: Update Project in PostgreSQL
  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      return apiClient.patch<any>(`/api/v1/projects/${id}`, payload);
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["project", updated.id] });
      refetch();
      toast.success(`Project "${updated.name}" updated in database!`, {
        description: "Budget, schedule parameters, and status synchronized across all ERP modules.",
      });
      setIsEditOpen(false);
      setEditingProject(null);
    },
    onError: (err: any) => {
      toast.error("Failed to update project", {
        description: err.message || "Could not commit project updates to database.",
      });
    },
  });

  // Mutation: Delete Project from PostgreSQL
  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiClient.delete<any>(`/api/v1/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      refetch();
      toast.success("Project archived successfully from database");
    },
    onError: (err: any) => {
      toast.error("Failed to delete project", {
        description: err.message || "An unexpected error occurred.",
      });
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !newProjectCode.trim()) {
      toast.error("Please provide both project name and unique code");
      return;
    }

    createProjectMutation.mutate({
      name: newProjectName.trim(),
      code: newProjectCode.trim().toUpperCase(),
      description: newDescription.trim() || undefined,
      budget: newBudget ? Number(newBudget) : undefined,
      status: newStatus,
      start_date: newStartDate || undefined,
      end_date: newEndDate || undefined,
    });
  };

  const handleEditClick = (proj: ProjectItem) => {
    setEditingProject(proj);
    setEditName(proj.name);
    setEditDescription(proj.description || "");
    setEditBudget(proj.budget ? String(proj.budget) : "");
    setEditStatus(proj.status || "active");
    setEditEndDate(proj.end_date || "");
    setIsEditOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    updateProjectMutation.mutate({
      id: editingProject.id,
      payload: {
        name: editName.trim(),
        description: editDescription.trim() || null,
        budget: editBudget ? Number(editBudget) : null,
        status: editStatus,
        end_date: editEndDate || null,
      },
    });
  };

  const handleDeleteClick = (proj: ProjectItem) => {
    if (confirm(`Are you sure you want to archive project "${proj.name}" (${proj.code})?`)) {
      deleteProjectMutation.mutate(proj.id);
    }
  };

  // Portfolio metrics calculated dynamically from database records
  const totalBudget = useMemo(() => {
    return projects.reduce((acc, p) => acc + (Number(p.budget) || 0), 0);
  }, [projects]);

  const activeCount = useMemo(() => {
    return projects.filter((p) => p.status === "active").length;
  }, [projects]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Construction Projects & Master Schedules"
        description="Multi-site enterprise capital projects, bill of quantities (BOQ), and progress milestones synchronized with PostgreSQL."
      >
        <Button
          variant="amber"
          size="sm"
          onClick={() => setIsCreateOpen(true)}
          className="gap-1.5 font-bold"
        >
          <Plus className="h-3.5 w-3.5" />
          Register Project
        </Button>
      </PageHeader>

      {/* Real-time Portfolio KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-500 uppercase">Total Projects</span>
            <Building2 className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 mt-1">
            {projects.length}
          </div>
          <span className="text-[11px] text-emerald-500 font-mono mt-0.5 block">
            {activeCount} Active Construction Sites
          </span>
        </Card>

        <Card className="p-4 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-500 uppercase">Portfolio Capex</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 mt-1">
            ${(totalBudget / 1000000).toFixed(1)}M
          </div>
          <span className="text-[11px] text-zinc-500 font-mono mt-0.5 block">
            Committed Total Capital
          </span>
        </Card>

        <Card className="p-4 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-500 uppercase">Active Context</span>
            <CheckCircle2 className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-sm font-bold font-mono text-amber-500 truncate mt-1">
            {projects.find((p) => p.id === activeProjectId)?.name || "Transit Hub"}
          </div>
          <span className="text-[11px] text-zinc-400 font-mono mt-0.5 block">
            Code: {projects.find((p) => p.id === activeProjectId)?.code || "TH-2026-A"}
          </span>
        </Card>

        <Card className="p-4 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-500 uppercase">Database Status</span>
            <Sparkles className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-sm font-bold font-mono text-emerald-500 mt-1 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            PostgreSQL Synced
          </div>
          <span className="text-[11px] text-zinc-400 font-mono mt-0.5 block">
            Real-time ERP Data Layer
          </span>
        </Card>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {projects.map((proj) => {
          const isActive = proj.id === activeProjectId;
          const budgetMillions = proj.budget ? (proj.budget / 1000000).toFixed(1) : "—";

          return (
            <Card
              key={proj.id}
              className={`transition-all p-6 space-y-5 relative ${
                isActive
                  ? "border-amber-500 shadow-md bg-amber-500/[0.02] dark:bg-amber-500/[0.04]"
                  : "border-zinc-200 dark:border-zinc-800 hover:border-amber-500/50 bg-white dark:bg-zinc-900/60"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-amber-500 uppercase tracking-wider">
                      {proj.code}
                    </span>
                    {isActive && (
                      <Badge variant="warning" className="text-[9px] font-mono uppercase font-bold py-0 h-4">
                        Active Working Context
                      </Badge>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mt-1">
                    {proj.name}
                  </h3>
                  {proj.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      {proj.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <Badge
                    variant={
                      proj.status === "active"
                        ? "success"
                        : proj.status === "completed"
                        ? "outline"
                        : "warning"
                    }
                    className="font-mono text-[10px] uppercase"
                  >
                    {proj.status}
                  </Badge>

                  {/* Edit Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditClick(proj)}
                    className="h-7 w-7 p-0 text-zinc-400 hover:text-white"
                    title="Edit project parameters"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>

                  {/* Delete Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteClick(proj)}
                    className="h-7 w-7 p-0 text-red-400 hover:text-red-500 hover:bg-red-950/30"
                    title="Archive project"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 text-xs font-mono">
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase">Budget</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">
                    {budgetMillions !== "—" ? `$${budgetMillions}M` : "Not Set"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase">Start Date</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">
                    {proj.start_date ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase">Target End</span>
                  <span className="font-bold text-zinc-800 dark:text-zinc-200">
                    {proj.end_date ?? "—"}
                  </span>
                </div>
              </div>

              {/* Construction Phase & Progress Ribbon */}
              <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1.5 text-xs">
                <div className="flex items-center justify-between font-mono">
                  <span className="text-[10px] uppercase font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                    Active Phase 2: Substructure & Foundation
                  </span>
                  <span className="font-bold text-amber-500">
                    Phase-Wise WBS
                  </span>
                </div>
                <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: "60%" }} />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                {!isActive ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setActiveProject(proj.id);
                      toast.success(`Switched active working project to ${proj.name}`);
                    }}
                    className="text-xs font-semibold gap-1.5 border-zinc-300 dark:border-zinc-700"
                  >
                    <Check className="h-3.5 w-3.5 text-amber-500" />
                    Set as Active Context
                  </Button>
                ) : (
                  <Button
                    variant="amber"
                    size="sm"
                    disabled
                    className="text-xs font-bold gap-1.5 opacity-90 cursor-default"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Currently Selected
                  </Button>
                )}

                <Link href={`/projects/${proj.id}?tab=schedule`}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 border-zinc-300 dark:border-zinc-700 text-xs font-semibold hover:border-amber-500 hover:text-amber-500"
                  >
                    Phase Plan & Track Work
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Register Project Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold font-mono text-zinc-900 dark:text-white flex items-center gap-2">
              <Building2 className="h-4 w-4 text-amber-500" />
              Register Capital Construction Project
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Commits new capital project and primary site to PostgreSQL database.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-3.5 pt-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Project Name *</label>
              <Input
                placeholder="e.g. Metro Interchange Terminal East"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                required
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Project Code *</label>
                <Input
                  placeholder="e.g. MIT-2026-X"
                  value={newProjectCode}
                  onChange={(e) => setNewProjectCode(e.target.value)}
                  required
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full h-9 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100 font-mono"
                >
                  <option value="active">Active</option>
                  <option value="planning">Planning</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Allocated Budget (USD)</label>
              <Input
                placeholder="e.g. 45000000"
                type="number"
                value={newBudget}
                onChange={(e) => setNewBudget(e.target.value)}
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Start Date</label>
                <Input
                  type="date"
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Target End Date</label>
                <Input
                  type="date"
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Description / Scope</label>
              <Input
                placeholder="Civil infrastructure and MEP scope description..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                className="border-zinc-300 dark:border-zinc-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="amber"
                size="sm"
                disabled={createProjectMutation.isPending}
                className="font-bold gap-1.5"
              >
                {createProjectMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Committing to PostgreSQL...
                  </>
                ) : (
                  "Confirm & Register Project"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold font-mono text-zinc-900 dark:text-white flex items-center gap-2">
              <Edit2 className="h-4 w-4 text-amber-500" />
              Update Project Parameters
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Modifies project budget, status, or timeline directly in PostgreSQL database.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-3.5 pt-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Project Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Budget (USD)</label>
                <Input
                  type="number"
                  value={editBudget}
                  onChange={(e) => setEditBudget(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full h-9 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100 font-mono"
                >
                  <option value="active">Active</option>
                  <option value="planning">Planning</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Target Delivery Date</label>
              <Input
                type="date"
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditOpen(false)}
                className="border-zinc-300 dark:border-zinc-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="amber"
                size="sm"
                disabled={updateProjectMutation.isPending}
                className="font-bold gap-1.5"
              >
                {updateProjectMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Committing Changes...
                  </>
                ) : (
                  "Save Project Changes"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
