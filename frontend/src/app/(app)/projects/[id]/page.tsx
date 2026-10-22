"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Layers,
  Users,
  Truck,
  FileText,
  Radio,
  Plus,
  Download,
  CheckCircle2,
  AlertCircle,
  Video,
  PlugZap,
  Building2,
  MapPin,
  DollarSign,
  Edit3,
  Trash2,
  ExternalLink,
  Upload,
  Check,
  RefreshCw,
  HardHat,
  Eye,
  FileUp,
  Clock,
  Sparkles,
  ClipboardList,
  Sliders,
  ChevronRight,
  TrendingUp,
  Flame,
  Activity,
  History,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { normalizeList } from "@/lib/utils";
import { useProjectStore } from "@/stores/projectStore";
import { ConnectSourceModal } from "@/components/devices/ConnectSourceModal";
import { toast } from "sonner";
import { NO_DATA, fmtNumber, fmtPct } from "@/lib/format";

// Standard Construction Phases for Capital Projects
export interface ConstructionPhase {
  id: string;
  name: string;
  wbsPrefix: string;
  description: string;
  color: string;
  tag: string;
  isCustom?: boolean;
  startDate?: string;
  endDate?: string;
  milestoneScheduleId?: string;
}

export const COLOR_PALETTES = [
  { name: "Amber Gold", value: "#f59e0b" },
  { name: "Electric Blue", value: "#3b82f6" },
  { name: "Violet Purple", value: "#8b5cf6" },
  { name: "Cyan Teal", value: "#06b6d4" },
  { name: "Emerald Green", value: "#10b981" },
  { name: "Rose Pink", value: "#ec4899" },
  { name: "Indigo Night", value: "#6366f1" },
  { name: "Sunset Orange", value: "#f97316" },
];

const DEFAULT_CONSTRUCTION_PHASES: ConstructionPhase[] = [
  {
    id: "phase-1",
    name: "Phase 1: Mobilization, Earthwork & Shoring",
    wbsPrefix: "1.",
    description: "Site clearing, bulk excavation, perimeter soldier piles, shoring walls, and deep foundation piling.",
    color: "#f59e0b",
    tag: "Earthworks",
  },
  {
    id: "phase-2",
    name: "Phase 2: Substructure & Foundation",
    wbsPrefix: "2.",
    description: "Raft foundations, mass concrete pour, basement retaining walls, waterproofing membranes, and sumps.",
    color: "#3b82f6",
    tag: "Substructure",
  },
  {
    id: "phase-3",
    name: "Phase 3: Superstructure & Structural Framing",
    wbsPrefix: "3.",
    description: "RC columns, elevator core shear walls, post-tensioned slabs, structural steel framing, and tower cranes.",
    color: "#8b5cf6",
    tag: "Superstructure",
  },
  {
    id: "phase-4",
    name: "Phase 4: Building Envelope & Facade",
    wbsPrefix: "4.",
    description: "Unitized curtain wall glazing, architectural precast panels, roof insulation, and weatherproofing.",
    color: "#06b6d4",
    tag: "Facade",
  },
  {
    id: "phase-5",
    name: "Phase 5: MEP Rough-in & Primary Systems",
    wbsPrefix: "5.",
    description: "HVAC primary ductwork, high-voltage electrical switchgear, chilled water risers, and fire suppression.",
    color: "#ec4899",
    tag: "MEP Systems",
  },
  {
    id: "phase-6",
    name: "Phase 6: Interior Fitout & Architectural Finishes",
    wbsPrefix: "6.",
    description: "Drywall framing, acoustic ceilings, stone flooring, joinery, elevator cab finishes, and interior painting.",
    color: "#10b981",
    tag: "Fitout",
  },
  {
    id: "phase-7",
    name: "Phase 7: Testing, Commissioning & Handover",
    wbsPrefix: "7.",
    description: "TAB airflow balancing, emergency fire safety run, authority inspection signoffs, and tenant handover.",
    color: "#6366f1",
    tag: "Handover",
  },
];

export interface WorkLogEntry {
  id: string;
  task_id: string;
  task_name: string;
  wbs_code: string;
  date: string;
  description: string;
  output: string;
  contractor: string;
  manhours: number;
  new_progress: number;
  weather?: string;
  author: string;
  created_at: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.id as string;

  const initialTab = searchParams.get("tab") || "schedule";
  const [activeTab, setActiveTab] = useState(initialTab);

  const { activeProjectId, setActiveProject, setActiveSite } = useProjectStore();

  // Phase planning view state
  const [selectedPhaseFilter, setSelectedPhaseFilter] = useState("all");
  const [scheduleSubView, setScheduleSubView] = useState<"phases" | "logs">("phases");

  // Custom Phases State & Phase Creation Modal State
  const [customPhases, setCustomPhases] = useState<ConstructionPhase[]>([]);
  const [isCreatePhaseOpen, setIsCreatePhaseOpen] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState("");
  const [newPhaseTag, setNewPhaseTag] = useState("");
  const [newPhaseWbs, setNewPhaseWbs] = useState("");
  const [newPhaseDesc, setNewPhaseDesc] = useState("");
  const [newPhaseColor, setNewPhaseColor] = useState("#8b5cf6");
  const [newPhaseStart, setNewPhaseStart] = useState("");
  const [newPhaseEnd, setNewPhaseEnd] = useState("");
  const [newPhaseCreateInauguralTask, setNewPhaseCreateInauguralTask] = useState(true);

  // Edit Project State
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editBudget, setEditBudget] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");

  // Add Site State
  const [isAddSiteOpen, setIsAddSiteOpen] = useState(false);
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteCode, setNewSiteCode] = useState("");
  const [newSiteAddress, setNewSiteAddress] = useState("");
  const [newSiteLat, setNewSiteLat] = useState("28.6139");
  const [newSiteLng, setNewSiteLng] = useState("77.2090");
  const [newSiteStatus, setNewSiteStatus] = useState("active");

  // Add Task to Phase State
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [taskPhaseId, setTaskPhaseId] = useState("phase-1");
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskWbs, setNewTaskWbs] = useState("1.3");
  const [newTaskStart, setNewTaskStart] = useState("");
  const [newTaskEnd, setNewTaskEnd] = useState("");
  const [newTaskProgress, setNewTaskProgress] = useState("0");
  const [newTaskStatus, setNewTaskStatus] = useState("pending");
  const [newTaskCritical, setNewTaskCritical] = useState(false);

  // Log Work Progress State
  const [isLogWorkOpen, setIsLogWorkOpen] = useState(false);
  const [selectedTaskForLog, setSelectedTaskForLog] = useState<any>(null);
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [logDesc, setLogDesc] = useState("");
  const [logOutput, setLogOutput] = useState("");
  const [logContractor, setLogContractor] = useState("");
  const [logManhours, setLogManhours] = useState("40");
  const [logNewProgress, setLogNewProgress] = useState("50");
  const [logWeather, setLogWeather] = useState("Clear, 26°C");

  // BOQ / Materials / Drawings Modals
  const [isAddBoqOpen, setIsAddBoqOpen] = useState(false);
  const [newBoqCode, setNewBoqCode] = useState("");
  const [newBoqDesc, setNewBoqDesc] = useState("");
  const [newBoqUnit, setNewBoqUnit] = useState("m3");
  const [newBoqQty, setNewBoqQty] = useState("");
  const [newBoqRate, setNewBoqRate] = useState("");

  const [isAddManpowerOpen, setIsAddManpowerOpen] = useState(false);
  const [newManpowerDate, setNewManpowerDate] = useState(new Date().toISOString().split("T")[0]);
  const [newManpowerTrade, setNewManpowerTrade] = useState("Steel Fixers");
  const [newManpowerPlanned, setNewManpowerPlanned] = useState("30");
  const [newManpowerActual, setNewManpowerActual] = useState("28");
  const [newManpowerShift, setNewManpowerShift] = useState("day");

  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newMaterialUnit, setNewMaterialUnit] = useState("ton");
  const [newMaterialOrdered, setNewMaterialOrdered] = useState("");
  const [newMaterialDelivered, setNewMaterialDelivered] = useState("");
  const [newMaterialStock, setNewMaterialStock] = useState("");

  const [isAddDrawingOpen, setIsAddDrawingOpen] = useState(false);
  const [newDrawingNumber, setNewDrawingNumber] = useState("");
  const [newDrawingTitle, setNewDrawingTitle] = useState("");
  const [newDrawingDiscipline, setNewDrawingDiscipline] = useState("architectural");
  const [newDrawingVersion, setNewDrawingVersion] = useState("Rev-0");
  const [drawingFile, setDrawingFile] = useState<File | null>(null);

  const [isAddSensorOpen, setIsAddSensorOpen] = useState(false);
  const [newSensorName, setNewSensorName] = useState("");
  const [newSensorType, setNewSensorType] = useState("pm25");

  // Fetch Project Details
  const {
    data: project,
    isLoading: isProjectLoading,
    error: projectError,
    refetch: refetchProject,
  } = useQuery<any>({
    queryKey: ["project-detail", projectId],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${projectId}`),
  });

  // Fetch Sites
  const {
    data: sitesData,
    refetch: refetchSites,
  } = useQuery<any>({
    queryKey: ["project-sites", projectId],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${projectId}/sites`),
  });

  // Fetch Schedules (WBS Tasks)
  const {
    data: schedulesData,
    refetch: refetchSchedules,
  } = useQuery<any>({
    queryKey: ["project-schedules", projectId],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${projectId}/schedules`),
  });

  // Fetch BOQ
  const {
    data: boqData,
    refetch: refetchBoq,
  } = useQuery<any>({
    queryKey: ["project-boq", projectId],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${projectId}/boq`),
  });

  // Fetch Manpower
  const {
    data: manpowerData,
    refetch: refetchManpower,
  } = useQuery<any>({
    queryKey: ["project-manpower", projectId],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${projectId}/manpower`),
  });

  // Fetch Materials
  const {
    data: materialsData,
    refetch: refetchMaterials,
  } = useQuery<any>({
    queryKey: ["project-materials", projectId],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${projectId}/materials`),
  });

  // Fetch Drawings
  const {
    data: drawingsData,
    refetch: refetchDrawings,
  } = useQuery<any>({
    queryKey: ["project-drawings", projectId],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${projectId}/drawings`),
  });

  const sites = normalizeList<any>(sitesData);
  const schedules = normalizeList<any>(schedulesData);
  const boq = normalizeList<any>(boqData);
  const manpower = normalizeList<any>(manpowerData);
  const materials = normalizeList<any>(materialsData);
  const todayIso = new Date().toISOString().slice(0, 10);
  const manpowerToday = manpower.filter((m: any) => String(m.date).slice(0, 10) === todayIso);
  const manpowerTodayActual = manpowerToday.reduce((sum: number, m: any) => sum + Number(m.actual_headcount ?? 0), 0);
  const manpowerTodayPlanned = manpowerToday.reduce((sum: number, m: any) => sum + Number(m.planned_headcount ?? 0), 0);
  const drawings = normalizeList<any>(drawingsData);

  // Load custom phases from localStorage and sync with schedules
  useEffect(() => {
    if (!projectId) return;
    try {
      const stored = localStorage.getItem(`buildtrack_custom_phases_${projectId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCustomPhases(parsed);
        }
      }
    } catch (e) {
      console.warn("Failed to read custom phases from localStorage", e);
    }
  }, [projectId]);

  // Auto-discover any custom phase definitions stored in schedules dependencies
  useEffect(() => {
    if (!schedules || schedules.length === 0) return;
    const discovered: ConstructionPhase[] = [];
    schedules.forEach((sch: any) => {
      const deps = Array.isArray(sch.dependencies) ? sch.dependencies : [];
      deps.forEach((d: any) => {
        if (d && d.is_phase_definition && d.id) {
          discovered.push({
            id: d.id,
            name: d.name || sch.task_name?.replace(" [Phase Milestone]", "") || "Custom Phase",
            wbsPrefix: d.wbsPrefix || sch.wbs_code || "8.",
            description: d.description || "",
            color: d.color || "#8b5cf6",
            tag: d.tag || "Custom",
            isCustom: true,
            milestoneScheduleId: sch.id,
          });
        }
      });
    });

    if (discovered.length > 0) {
      setCustomPhases((prev) => {
        const combined = [...prev];
        discovered.forEach((disc) => {
          if (!combined.some((p) => p.id === disc.id || p.wbsPrefix === disc.wbsPrefix)) {
            combined.push(disc);
          }
        });
        try {
          localStorage.setItem(`buildtrack_custom_phases_${projectId}`, JSON.stringify(combined));
        } catch (_) {}
        return combined;
      });
    }
  }, [schedules, projectId]);

  // Combine Default standard phases with Custom user-created phases
  const allPhases = useMemo(() => {
    return [...DEFAULT_CONSTRUCTION_PHASES, ...customPhases];
  }, [customPhases]);

  // Group schedules into Construction Phases
  const phaseData = useMemo(() => {
    return allPhases.map((phase) => {
      // Match tasks whose wbs_code begins with prefix or task_name mentions phase
      const phaseTasks = schedules.filter((sch) => {
        const isDef = Array.isArray(sch.dependencies) && sch.dependencies.some((d: any) => d && d.is_phase_definition);
        if (isDef && sch.wbs_code === `${phase.wbsPrefix}0`) return false;

        const wbs = sch.wbs_code || "";
        const name = (sch.task_name || sch.name || "").toLowerCase();
        const prefixClean = phase.wbsPrefix.replace(".", "");
        return (
          wbs.startsWith(phase.wbsPrefix) ||
          (prefixClean && (wbs === prefixClean || wbs.startsWith(`${prefixClean}.`))) ||
          wbs.startsWith(phase.id.replace("phase-", "")) ||
          name.includes(`phase ${prefixClean}`) ||
          (phase.tag && name.includes(phase.tag.toLowerCase()))
        );
      });

      const avgProg =
        phaseTasks.length > 0
          ? Math.round(
              phaseTasks.reduce(
                (sum, t) => sum + Number(t.progress_percent ?? t.progress_pct ?? 0),
                0
              ) / phaseTasks.length
            )
          : 0;

      const isCompleted = phaseTasks.length > 0 && phaseTasks.every((t) => Number(t.progress_percent ?? 0) === 100);
      const isDelayed = phaseTasks.some((t) => t.status === "delayed");
      const isInProgress = phaseTasks.some((t) => Number(t.progress_percent ?? 0) > 0 || t.status === "in_progress");

      const phaseStatus = isCompleted
        ? "completed"
        : isDelayed
        ? "delayed"
        : isInProgress
        ? "in_progress"
        : "planned";

      return {
        ...phase,
        tasks: phaseTasks,
        progress: avgProg,
        status: phaseStatus,
      };
    });
  }, [allPhases, schedules]);

  // Currently active phase for KPI display
  const activePhaseItem = useMemo(() => {
    return (
      phaseData.find((p) => p.status === "in_progress") ||
      phaseData.find((p) => p.status === "delayed") ||
      phaseData[0]
    );
  }, [phaseData]);

  // Extract all work log entries from task dependencies
  const workLogs = useMemo<WorkLogEntry[]>(() => {
    const logs: WorkLogEntry[] = [];
    schedules.forEach((sch) => {
      const deps = Array.isArray(sch.dependencies) ? sch.dependencies : [];
      deps.forEach((d: any) => {
        if (d && (d.description || d.work_done || d.log)) {
          logs.push({
            id: d.id || `log-${Math.random()}`,
            task_id: sch.id,
            task_name: sch.task_name || sch.name || "Task",
            wbs_code: sch.wbs_code || "WBS",
            date: d.date || sch.updated_at?.split("T")[0] || new Date().toISOString().split("T")[0],
            description: d.description || d.work_done || d.log,
            output: d.output || d.quantity || "Completed work batch",
            contractor: d.contractor || d.crew || "Site Engineering Squad",
            manhours: Number(d.manhours || d.hours || 0),
            new_progress: Number(d.new_progress ?? sch.progress_percent ?? 0),
            weather: d.weather,
            author: d.author || "Site Engineer",
            created_at: d.created_at || new Date().toISOString(),
          });
        }
      });
    });
    return logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [schedules]);

  // Overall Project Progress
  const overallProgress = useMemo(() => {
    if (schedules.length === 0) return 0;
    const sum = schedules.reduce(
      (acc, s) => acc + Number(s.progress_percent ?? s.progress_pct ?? 0),
      0
    );
    return Math.round(sum / schedules.length);
  }, [schedules]);

  // Mutations
  const updateProjectMutation = useMutation({
    mutationFn: (payload: any) => apiClient.patch(`/api/v1/projects/${projectId}`, payload),
    onSuccess: () => {
      toast.success("Project parameters updated successfully");
      setIsEditProjectOpen(false);
      refetchProject();
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to update project"),
  });

  const createSiteMutation = useMutation({
    mutationFn: (payload: any) => apiClient.post(`/api/v1/projects/${projectId}/sites`, payload),
    onSuccess: (newSite: any) => {
      toast.success(`Site Sector "${newSite.name || newSiteCode}" registered`);
      setIsAddSiteOpen(false);
      setNewSiteName("");
      setNewSiteCode("");
      refetchSites();
      queryClient.invalidateQueries({ queryKey: ["topbar-sites"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to register site"),
  });

  // Create Task Mutation
  const createTaskMutation = useMutation({
    mutationFn: async (row: any) => {
      const csvHeader = "task_name,wbs_code,start_date,end_date,progress_percent,status\n";
      const csvLine = `"${row.task_name}","${row.wbs_code}","${row.start_date}","${row.end_date}",${row.progress_percent},"${row.status}"\n`;
      const blob = new Blob([csvHeader + csvLine], { type: "text/csv" });
      const formData = new FormData();
      formData.append("file", blob, "milestones.csv");
      return apiClient.post(`/api/v1/projects/${projectId}/schedules`, formData);
    },
    onSuccess: () => {
      toast.success(`Work task added to phase plan`);
      setIsAddTaskOpen(false);
      setNewTaskName("");
      refetchSchedules();
    },
    onError: (err: any) => toast.error(err.message || "Failed to add work task"),
  });

  // Update Task Mutation
  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, payload }: { taskId: string; payload: any }) => {
      return apiClient.patch(`/api/v1/projects/${projectId}/schedules/${taskId}`, payload);
    },
    onSuccess: () => {
      refetchSchedules();
      toast.success("Task progress and status updated");
    },
    onError: (err: any) => toast.error(err.message || "Failed to update task"),
  });

  // Delete Task Mutation
  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => apiClient.delete(`/api/v1/projects/${projectId}/schedules/${taskId}`),
    onSuccess: () => {
      refetchSchedules();
      toast.success("Work task removed from schedule");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete task"),
  });

  // Log Work Progress Mutation
  const logWorkMutation = useMutation({
    mutationFn: async ({ task, logEntry }: { task: any; logEntry: any }) => {
      const existingDeps = Array.isArray(task.dependencies) ? task.dependencies : [];
      const updatedDeps = [logEntry, ...existingDeps];
      return apiClient.patch(`/api/v1/projects/${projectId}/schedules/${task.id}`, {
        progress_percent: logEntry.new_progress,
        status: logEntry.new_progress === 100 ? "completed" : "in_progress",
        dependencies: updatedDeps,
      });
    },
    onSuccess: () => {
      toast.success("Daily work progress logged & task incremented");
      setIsLogWorkOpen(false);
      setLogDesc("");
      setLogOutput("");
      refetchSchedules();
    },
    onError: (err: any) => toast.error(err.message || "Failed to log work progress"),
  });

  // Phase Management Handlers
  const handleOpenCreatePhase = () => {
    const nextPhaseNum = allPhases.length + 1;
    setNewPhaseName(`Phase ${nextPhaseNum}: `);
    setNewPhaseTag(`Phase ${nextPhaseNum}`);
    setNewPhaseWbs(`${nextPhaseNum}.`);
    setNewPhaseDesc("");
    setNewPhaseColor(COLOR_PALETTES[(nextPhaseNum - 1) % COLOR_PALETTES.length].value);
    setNewPhaseStart(project?.start_date || new Date().toISOString().split("T")[0]);
    setNewPhaseEnd(project?.end_date || new Date().toISOString().split("T")[0]);
    setNewPhaseCreateInauguralTask(true);
    setIsCreatePhaseOpen(true);
  };

  const handleSaveNewPhase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhaseName.trim()) {
      toast.error("Phase title is required");
      return;
    }
    const cleanPrefix = newPhaseWbs.trim() || `${allPhases.length + 1}.`;
    const formattedPrefix = cleanPrefix.endsWith(".") ? cleanPrefix : `${cleanPrefix}.`;
    const phaseId = `phase-custom-${Date.now()}`;

    const newPhase: ConstructionPhase = {
      id: phaseId,
      name: newPhaseName.trim(),
      wbsPrefix: formattedPrefix,
      description: newPhaseDesc.trim() || `Deliverables and work packages for ${newPhaseName.trim()}`,
      color: newPhaseColor,
      tag: newPhaseTag.trim() || `P${formattedPrefix.replace(".", "")}`,
      isCustom: true,
      startDate: newPhaseStart,
      endDate: newPhaseEnd,
    };

    // 1. Update state & localStorage
    const updated = [...customPhases, newPhase];
    setCustomPhases(updated);
    try {
      localStorage.setItem(`buildtrack_custom_phases_${projectId}`, JSON.stringify(updated));
    } catch (err) {
      console.warn("Error storing custom phases", err);
    }

    // 2. Persist phase milestone & optional inaugural task to backend PostgreSQL
    try {
      const csvHeader = "task_name,wbs_code,start_date,end_date,progress_percent,status\n";
      let csvContent = csvHeader;
      // Milestone container task
      csvContent += `"${newPhase.name} [Phase Milestone]","${formattedPrefix}0","${newPhaseStart || '2026-01-15'}","${newPhaseEnd || '2027-12-31'}",0,"pending"\n`;

      if (newPhaseCreateInauguralTask) {
        csvContent += `"${newPhase.name} Kickoff & Mobilization","${formattedPrefix}1","${newPhaseStart || '2026-01-15'}","${newPhaseEnd || '2027-12-31'}",0,"pending"\n`;
      }

      const blob = new Blob([csvContent], { type: "text/csv" });
      const formData = new FormData();
      formData.append("file", blob, "phase_milestone.csv");
      await apiClient.post(`/api/v1/projects/${projectId}/schedules`, formData);
      refetchSchedules();
    } catch (err: any) {
      console.warn("Backend milestone sync failed, phase saved locally:", err);
    }

    toast.success(`Construction Phase "${newPhase.name}" established!`);
    setIsCreatePhaseOpen(false);
    setSelectedPhaseFilter(phaseId);
  };

  const handleDeletePhase = (phaseToDelete: ConstructionPhase) => {
    if (!confirm(`Are you sure you want to remove ${phaseToDelete.name}? Any tasks with WBS prefix ${phaseToDelete.wbsPrefix} will remain in schedule.`)) {
      return;
    }
    const updated = customPhases.filter((p) => p.id !== phaseToDelete.id);
    setCustomPhases(updated);
    try {
      localStorage.setItem(`buildtrack_custom_phases_${projectId}`, JSON.stringify(updated));
    } catch (err) {
      console.warn("Error updating custom phases", err);
    }
    if (selectedPhaseFilter === phaseToDelete.id) {
      setSelectedPhaseFilter("all");
    }
    toast.success(`Phase "${phaseToDelete.name}" removed`);
  };

  // Handlers
  const handleOpenAddTask = (phase?: any) => {
    if (phase) {
      setTaskPhaseId(phase.id);
      const prefix = (phase.wbsPrefix || "1.").replace(".", "");
      const nextNum = (phase.tasks?.length || 0) + 1;
      setNewTaskWbs(`${prefix}.${nextNum}`);
    } else {
      const firstPhase = allPhases[0] || DEFAULT_CONSTRUCTION_PHASES[0];
      setTaskPhaseId(firstPhase.id);
      const prefix = (firstPhase.wbsPrefix || "1.").replace(".", "");
      const nextNum = (phaseData[0]?.tasks?.length || 0) + 1;
      setNewTaskWbs(`${prefix}.${nextNum}`);
    }
    setNewTaskStart(project?.start_date || new Date().toISOString().split("T")[0]);
    setNewTaskEnd(project?.end_date || new Date().toISOString().split("T")[0]);
    setIsAddTaskOpen(true);
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) {
      toast.error("Task description is required");
      return;
    }
    createTaskMutation.mutate({
      task_name: newTaskName.trim(),
      wbs_code: newTaskWbs.trim() || "1.1",
      start_date: newTaskStart || new Date().toISOString().split("T")[0],
      end_date: newTaskEnd || new Date().toISOString().split("T")[0],
      progress_percent: parseFloat(newTaskProgress || "0"),
      status: newTaskStatus,
    });
  };

  const handleOpenLogWork = (task: any) => {
    setSelectedTaskForLog(task);
    setLogNewProgress(String(task.progress_percent ?? 0));
    setLogDesc(`Executed work shift for ${task.task_name}`);
    setLogOutput("100% inspection pass");
    setIsLogWorkOpen(true);
  };

  const handleSaveWorkLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForLog) return;
    if (!logDesc.trim()) {
      toast.error("Please enter a work summary");
      return;
    }

    const logEntry: WorkLogEntry = {
      id: `wl-${Date.now()}`,
      task_id: selectedTaskForLog.id,
      task_name: selectedTaskForLog.task_name || "Task",
      wbs_code: selectedTaskForLog.wbs_code || "WBS",
      date: logDate,
      description: logDesc.trim(),
      output: logOutput.trim() || "Work batch completed",
      contractor: logContractor.trim() || "General Engineering Squad",
      manhours: parseFloat(logManhours || "0"),
      new_progress: parseFloat(logNewProgress || "0"),
      weather: logWeather.trim(),
      author: "Site Supervisor",
      created_at: new Date().toISOString(),
    };

    logWorkMutation.mutate({ task: selectedTaskForLog, logEntry });
  };

  const handleQuickProgressUpdate = (task: any, newProg: number) => {
    const clamped = Math.min(100, Math.max(0, newProg));
    updateTaskMutation.mutate({
      taskId: task.id,
      payload: {
        progress_percent: clamped,
        status: clamped === 100 ? "completed" : clamped > 0 ? "in_progress" : "pending",
      },
    });
  };

  const handleQuickStatusChange = (task: any, newStatus: string) => {
    updateTaskMutation.mutate({
      taskId: task.id,
      payload: {
        status: newStatus,
        progress_percent: newStatus === "completed" ? 100 : task.progress_percent,
      },
    });
  };

  const handleOpenEditProject = () => {
    if (!project) return;
    setEditName(project.name || "");
    setEditCode(project.code || "");
    setEditStatus(project.status || "active");
    setEditBudget(project.budget ? String(project.budget) : "");
    setEditDescription(project.description || "");
    setEditStartDate(project.start_date || "");
    setEditEndDate(project.end_date || "");
    setIsEditProjectOpen(true);
  };

  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || !editCode.trim()) {
      toast.error("Project name and code are required");
      return;
    }
    updateProjectMutation.mutate({
      name: editName.trim(),
      code: editCode.trim().toUpperCase(),
      status: editStatus,
      budget: editBudget ? parseFloat(editBudget) : 0,
      description: editDescription.trim(),
      start_date: editStartDate || null,
      end_date: editEndDate || null,
    });
  };

  const handleOpenInMap = (siteId: string) => {
    setActiveProject(projectId);
    setActiveSite(siteId);
    toast.info("Navigating to GIS Site Map with selected site context...");
    router.push("/site-map");
  };

  const handleSetWorkingContext = () => {
    if (!project) return;
    setActiveProject(project.id);
    if (sites.length > 0) setActiveSite(sites[0].id);
    toast.success(`Active working context set to "${project.name}"`);
  };

  const isActiveWorkingProject = activeProjectId === projectId;

  if (isProjectLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="h-8 w-8 text-amber-500 animate-spin" />
        <p className="text-xs font-mono text-zinc-400">Loading project dossier and phase plans...</p>
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="space-y-6">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects Directory
        </Link>
        <Card className="border-red-500/30 bg-red-500/5 p-8 text-center space-y-4">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-zinc-100">Project Record Not Found</h2>
          <Button variant="outline" onClick={() => router.push("/projects")} className="border-zinc-700 text-xs">
            Return to Projects
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb */}
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Projects Directory
        </Link>
      </div>

      {/* Hero Dossier Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold text-amber-500 uppercase tracking-wider">
              {project.code || "PRJ-CODE"}
            </span>
            <Badge variant="outline" className="font-mono text-[10px] text-emerald-500 border-emerald-500/30 gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {project.status ? project.status.toUpperCase() : "ACTIVE STAGE"}
            </Badge>
            {isActiveWorkingProject ? (
              <Badge variant="warning" className="text-[10px] font-mono uppercase font-bold py-0.5">
                Active Working Context
              </Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSetWorkingContext}
                className="h-6 text-[11px] font-mono px-2 py-0 border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
              >
                Set as Active Context
              </Button>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white font-sans">
            {project.name}
          </h1>

          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-2xl">
            {project.description || "Capital infrastructure construction, master milestones, and phase planning."}
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-400 pt-1">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-amber-500" />
              {project.start_date ?? "—"} → {project.end_date ?? "—"}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              Budget: ${Number(project.budget || 0).toLocaleString()}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-sky-400" />
              {sites.length} Active {sites.length === 1 ? "Sector" : "Sectors"}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenEditProject}
            className="gap-1.5 text-xs font-bold border-zinc-300 dark:border-zinc-700"
          >
            <Edit3 className="h-3.5 w-3.5 text-amber-500" />
            Edit Parameters
          </Button>

          <Button
            variant="amber"
            size="sm"
            onClick={() => handleOpenAddTask()}
            className="gap-1.5 font-bold text-xs shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Work Package
          </Button>
        </div>
      </div>

      {/* KPI Overview Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4">
          <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 dark:text-zinc-400">
            Overall Completion
          </span>
          <div className="font-mono text-2xl font-black text-amber-500 mt-1 flex items-baseline gap-2">
            <span>{overallProgress}%</span>
            <span className="text-[10px] font-normal text-zinc-400">across {allPhases.length} Phases</span>
          </div>
          <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-amber-500 transition-all" style={{ width: `${overallProgress}%` }} />
          </div>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4">
          <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 dark:text-zinc-400">
            Active Construction Phase
          </span>
          <div className="font-mono text-lg font-black text-sky-500 dark:text-sky-400 mt-1 truncate">
            {activePhaseItem ? activePhaseItem.name.split(":")[0] + ": " + activePhaseItem.tag : "Phase 1: Mobilization"}
          </div>
          <span className="text-[11px] text-zinc-500 mt-0.5 block truncate">
            {activePhaseItem?.description || "Foundation & Site Execution"}
          </span>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4">
          <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 dark:text-zinc-400">
            Work Packages Tracked
          </span>
          <div className="font-mono text-2xl font-black text-zinc-900 dark:text-zinc-100 mt-1">
            {schedules.length} Tasks
          </div>
          <span className="text-[11px] text-zinc-500 mt-0.5 block">{workLogs.length} Field Work Logs</span>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4">
          <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 dark:text-zinc-400">
            Total Capital Allocation
          </span>
          <div className="font-mono text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
            ${Number(project.budget || 0).toLocaleString()}
          </div>
          <span className="text-[11px] text-zinc-500 mt-0.5 block">Under strict BOQ tracking</span>
        </Card>
      </div>

      {/* Main Tabs System */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1 bg-zinc-100 dark:bg-zinc-900/80 p-1">
          <TabsTrigger value="schedule" className="gap-1.5 text-xs py-1.5 font-bold">
            <ClipboardList className="h-3.5 w-3.5 text-amber-500" />
            <span>Phase Planning & Work Track ({schedules.length})</span>
          </TabsTrigger>
          <TabsTrigger value="sites" className="gap-1.5 text-xs py-1.5">
            <Building2 className="h-3.5 w-3.5 text-sky-400" />
            <span>Sites & Sectors ({sites.length})</span>
          </TabsTrigger>
          <TabsTrigger value="boq" className="gap-1.5 text-xs py-1.5">
            <Layers className="h-3.5 w-3.5 text-emerald-400" />
            <span>BOQ & Quantities ({boq.length})</span>
          </TabsTrigger>
          <TabsTrigger value="manpower" className="gap-1.5 text-xs py-1.5">
            <Users className="h-3.5 w-3.5 text-purple-400" />
            <span>Manpower & Trades</span>
          </TabsTrigger>
          <TabsTrigger value="materials" className="gap-1.5 text-xs py-1.5">
            <Truck className="h-3.5 w-3.5 text-orange-400" />
            <span>Materials Logistics</span>
          </TabsTrigger>
          <TabsTrigger value="drawings" className="gap-1.5 text-xs py-1.5">
            <FileText className="h-3.5 w-3.5 text-blue-400" />
            <span>Drawings (CAD/BIM)</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab: Master Phase Planning & Work Tracking */}
        <TabsContent value="schedule" className="space-y-5">
          {/* Sub-header controls */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Sliders className="h-4 w-4 text-amber-500" />
                Phase-Wise Construction Planning & Daily Work Tracker
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Organize deliverables by construction phase, track milestone completion, and log daily field progress.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-100 dark:bg-zinc-950 text-xs font-mono">
                <button
                  onClick={() => setScheduleSubView("phases")}
                  className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    scheduleSubView === "phases"
                      ? "bg-white dark:bg-zinc-800 text-amber-500 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
                  }`}
                >
                  Phase Work Packages
                </button>
                <button
                  onClick={() => setScheduleSubView("logs")}
                  className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    scheduleSubView === "logs"
                      ? "bg-white dark:bg-zinc-800 text-amber-500 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400"
                  }`}
                >
                  Work Activity Logs ({workLogs.length})
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenCreatePhase}
                className="gap-1.5 text-xs font-bold border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Create New Phase
              </Button>

              <Button
                variant="amber"
                size="sm"
                onClick={() => handleOpenAddTask()}
                className="gap-1.5 text-xs font-bold"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Work Package
              </Button>
            </div>
          </div>

          {/* SubView 1: Phase Work Packages */}
          {scheduleSubView === "phases" && (
            <div className="space-y-4">
              {/* Phase Quick Filters */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
                <Button
                  variant={selectedPhaseFilter === "all" ? "amber" : "outline"}
                  size="sm"
                  onClick={() => setSelectedPhaseFilter("all")}
                  className="h-7 px-3 text-[11px] border-zinc-200 dark:border-zinc-800 shrink-0"
                >
                  All {allPhases.length} Phases ({schedules.length})
                </Button>
                {allPhases.map((p) => {
                  const pItem = phaseData.find((pd) => pd.id === p.id);
                  const count = pItem?.tasks.length || 0;
                  return (
                    <Button
                      key={p.id}
                      variant={selectedPhaseFilter === p.id ? "amber" : "outline"}
                      size="sm"
                      onClick={() => setSelectedPhaseFilter(p.id)}
                      className="h-7 px-2.5 text-[11px] border-zinc-200 dark:border-zinc-800 shrink-0 gap-1.5"
                    >
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: p.color }}
                      />
                      <span>{p.tag}</span>
                      <span className="text-[10px] opacity-70">({count})</span>
                      {p.isCustom && (
                        <span className="text-[8px] bg-purple-500/20 text-purple-400 px-1 py-0.2 rounded font-sans uppercase">
                          Custom
                        </span>
                      )}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenCreatePhase}
                  className="h-7 px-2.5 text-[11px] border-dashed border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 shrink-0 gap-1 font-bold"
                  title="Create New Construction Phase"
                >
                  <Plus className="h-3 w-3" />
                  <span>New Phase</span>
                </Button>
              </div>

              {/* Phase Sections */}
              <div className="space-y-4">
                {phaseData
                  .filter((p) => selectedPhaseFilter === "all" || selectedPhaseFilter === p.id)
                  .map((phase) => {
                    return (
                      <Card
                        key={phase.id}
                        className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden shadow-sm"
                      >
                        {/* Phase Header Banner */}
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-950/60 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: phase.color }}
                              />
                              <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 font-sans">
                                {phase.name}
                              </h4>
                              {phase.isCustom && (
                                <Badge variant="outline" className="text-[9px] font-mono text-purple-400 border-purple-500/30">
                                  Custom Phase
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-mono uppercase ${
                                  phase.status === "completed"
                                    ? "text-emerald-500 border-emerald-500/30"
                                    : phase.status === "in_progress"
                                    ? "text-sky-500 border-sky-500/30"
                                    : phase.status === "delayed"
                                    ? "text-rose-500 border-rose-500/30"
                                    : "text-zinc-400 border-zinc-700"
                                }`}
                              >
                                {phase.status.replace("_", " ")}
                              </Badge>
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                              {phase.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            {/* Phase Progress Bar */}
                            <div className="w-36 text-right space-y-1">
                              <div className="flex justify-between text-xs font-mono">
                                <span className="text-zinc-500 text-[10px]">Phase Progress</span>
                                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                                  {phase.progress}%
                                </span>
                              </div>
                              <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full transition-all"
                                  style={{
                                    width: `${phase.progress}%`,
                                    backgroundColor: phase.color,
                                  }}
                                />
                              </div>
                            </div>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenAddTask(phase)}
                              className="h-8 text-xs font-bold gap-1 border-zinc-300 dark:border-zinc-700 shrink-0"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add Task
                            </Button>

                            {phase.isCustom && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeletePhase(phase)}
                                className="h-8 w-8 p-0 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 shrink-0"
                                title="Remove Custom Phase"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Phase Tasks List */}
                        <div className="p-4 space-y-3">
                          {phase.tasks.map((task) => {
                            const taskProg = Number(task.progress_percent ?? task.progress_pct ?? 0);
                            const isCritical = Boolean(task.critical || task.is_critical);
                            const taskLogs = Array.isArray(task.dependencies) ? task.dependencies : [];

                            return (
                              <div
                                key={task.id}
                                className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/40 hover:border-amber-500/50 transition-all space-y-3"
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-bold text-amber-500">
                                      {task.wbs_code || "WBS"}
                                    </span>
                                    <h5 className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100">
                                      {task.task_name}
                                    </h5>
                                    {isCritical && (
                                      <Badge variant="destructive" className="text-[9px] uppercase font-mono">
                                        Critical Path
                                      </Badge>
                                    )}
                                    {taskLogs.length > 0 && (
                                      <Badge variant="outline" className="text-[9px] font-mono text-sky-400 border-sky-500/30">
                                        {taskLogs.length} Work {taskLogs.length === 1 ? "Log" : "Logs"}
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                                    <span>
                                      {task.start_date ?? "—"} → {task.end_date ?? "—"}
                                    </span>
                                  </div>
                                </div>

                                {/* Progress Bar & Visual Stepper */}
                                <div className="space-y-1.5">
                                  <div className="flex justify-between text-xs font-mono">
                                    <div className="flex items-center gap-2">
                                      <span className="text-zinc-500">Status:</span>
                                      <select
                                        value={task.status || "in_progress"}
                                        onChange={(e) => handleQuickStatusChange(task, e.target.value)}
                                        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-1.5 py-0.5 text-[10px] font-mono text-zinc-800 dark:text-zinc-200"
                                      >
                                        <option value="pending">Pending</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="completed">Completed</option>
                                        <option value="delayed">Delayed</option>
                                      </select>
                                    </div>
                                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                                      {taskProg}% Completed
                                    </span>
                                  </div>

                                  <div className="h-2.5 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full transition-all ${
                                        taskProg === 100
                                          ? "bg-emerald-500"
                                          : task.status === "delayed"
                                          ? "bg-rose-500"
                                          : isCritical
                                          ? "bg-amber-500"
                                          : "bg-sky-500"
                                      }`}
                                      style={{ width: `${taskProg}%` }}
                                    />
                                  </div>
                                </div>

                                {/* Action Controls for Task */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800/60 text-xs">
                                  {/* Quick Progress Bumpers */}
                                  <div className="flex items-center gap-1 font-mono text-[11px]">
                                    <span className="text-zinc-400 text-[10px] mr-1">Quick Bump:</span>
                                    <button
                                      onClick={() => handleQuickProgressUpdate(task, taskProg + 10)}
                                      className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 hover:bg-amber-500 hover:text-zinc-950 transition-colors border border-zinc-200 dark:border-zinc-800 font-bold"
                                    >
                                      +10%
                                    </button>
                                    <button
                                      onClick={() => handleQuickProgressUpdate(task, taskProg + 25)}
                                      className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 hover:bg-amber-500 hover:text-zinc-950 transition-colors border border-zinc-200 dark:border-zinc-800 font-bold"
                                    >
                                      +25%
                                    </button>
                                    <button
                                      onClick={() => handleQuickProgressUpdate(task, 100)}
                                      className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white transition-colors border border-emerald-500/30 font-bold"
                                    >
                                      100% Done
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="amber"
                                      size="sm"
                                      onClick={() => handleOpenLogWork(task)}
                                      className="h-7 text-xs font-bold gap-1"
                                    >
                                      <Activity className="h-3 w-3" />
                                      Log Daily Work
                                    </Button>

                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => deleteTaskMutation.mutate(task.id)}
                                      className="h-7 w-7 p-0 text-zinc-400 hover:text-red-500"
                                      title="Delete task"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {phase.tasks.length === 0 && (
                            <div className="p-6 text-center border border-dashed border-zinc-300 dark:border-zinc-800 rounded-xl space-y-2">
                              <p className="text-xs text-zinc-400 font-mono">
                                No scheduled deliverables under {phase.name} yet.
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenAddTask(phase)}
                                className="h-7 text-xs font-bold gap-1 border-zinc-300 dark:border-zinc-700"
                              >
                                <Plus className="h-3.5 w-3.5 text-amber-500" />
                                Add First Deliverable
                              </Button>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
              </div>
            </div>
          )}

          {/* SubView 2: Work Activity Logs */}
          {scheduleSubView === "logs" && (
            <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                    <History className="h-4 w-4 text-amber-500" />
                    Field Work Logs & Verification Timeline
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Chronological audit of contractor output, concrete volumes, steel tonnages, and manhours.
                  </p>
                </div>
                <Badge variant="outline" className="font-mono text-xs text-amber-500 border-amber-500/30">
                  {workLogs.length} Recorded Entries
                </Badge>
              </div>

              <div className="space-y-3">
                {workLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-amber-500">
                          {log.wbs_code}
                        </span>
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">
                          {log.task_name}
                        </span>
                        <Badge variant="outline" className="text-[9px] font-mono text-emerald-400 border-emerald-500/30">
                          Progress: {log.new_progress}%
                        </Badge>
                      </div>
                      <span className="font-mono text-zinc-500">
                        {log.date}
                      </span>
                    </div>

                    <p className="text-zinc-700 dark:text-zinc-300 font-sans">
                      {log.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-zinc-400 pt-1 border-t border-zinc-200 dark:border-zinc-800/60">
                      <span>Delivered: <strong className="text-zinc-200">{log.output}</strong></span>
                      <span>•</span>
                      <span>Contractor: <strong className="text-zinc-200">{log.contractor}</strong></span>
                      <span>•</span>
                      <span>Manhours: <strong className="text-zinc-200">{log.manhours} hrs</strong></span>
                      {log.weather && (
                        <>
                          <span>•</span>
                          <span>Weather: <strong className="text-zinc-200">{log.weather}</strong></span>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {workLogs.length === 0 && (
                  <div className="p-8 text-center text-xs text-zinc-400 font-mono space-y-2">
                    <History className="h-8 w-8 text-zinc-600 mx-auto" />
                    <p>No daily work logs recorded yet.</p>
                    <p className="text-[11px] text-zinc-500">
                      Click &quot;Log Daily Work&quot; on any active task in the Phase view to record concrete, steel, or manhour entries.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Tab 2: Sites & Sectors */}
        <TabsContent value="sites" className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Registered Site Sectors & Geographic Boundaries
              </h3>
              <p className="text-xs text-zinc-500">
                Each site holds geofenced hazard zones, CCTV camera arrays, and environmental sensor nodes.
              </p>
            </div>
            <Button
              variant="amber"
              size="sm"
              onClick={() => setIsAddSiteOpen(true)}
              className="gap-1.5 text-xs font-bold"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Site / Sector
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map((site) => (
              <Card
                key={site.id}
                className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-4 space-y-3 relative hover:border-amber-500/50 transition-all flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-amber-500 uppercase">
                      {site.code || "SITE-SEC"}
                    </span>
                    <Badge variant="outline" className="text-[9px] font-mono uppercase text-emerald-500 border-emerald-500/30">
                      {site.status || "active"}
                    </Badge>
                  </div>

                  <h4 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {site.name}
                  </h4>

                  {site.address && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-start gap-1">
                      <MapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
                      <span>{site.address}</span>
                    </p>
                  )}

                  <div className="text-[11px] font-mono text-zinc-400 bg-zinc-50 dark:bg-zinc-950 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Latitude:</span>
                      <span className="font-bold text-zinc-300">{site.latitude ?? "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Longitude:</span>
                      <span className="font-bold text-zinc-300">{site.longitude ?? "—"}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <Button
                    variant="amber"
                    size="sm"
                    onClick={() => handleOpenInMap(site.id)}
                    className="w-full text-xs gap-1 font-bold"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Open on GIS Map
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: BOQ */}
        <TabsContent value="boq" className="space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Bill of Quantities Variance Tracking
                </h3>
                <span className="text-xs text-zinc-500">
                  {boq.length} Line items under CSI MasterFormat
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="amber"
                  size="sm"
                  onClick={() => setIsAddBoqOpen(true)}
                  className="h-8 text-xs gap-1 font-bold"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add BOQ Item
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.success("Exported BOQ to CSV format")}
                  className="h-8 text-xs gap-1 border-zinc-300 dark:border-zinc-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-100 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-mono text-[10px] uppercase">
                  <tr>
                    <th className="p-3">CSI Code</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Unit</th>
                    <th className="p-3">Estimated Qty</th>
                    <th className="p-3">Actual Qty</th>
                    <th className="p-3">Unit Price</th>
                    <th className="p-3">Budget</th>
                    <th className="p-3 text-right">Spent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-mono">
                  {boq.map((item) => {
                    const estQty = Number(item.planned_quantity ?? item.estimated_qty ?? 0);
                    const actQty = Number(item.consumed_quantity ?? item.actual_qty ?? 0);
                    const unitRate = Number(item.unit_rate ?? item.unit_price ?? 0);
                    const budget = Number(item.total_planned_cost ?? estQty * unitRate);
                    const spent = Number(item.spent ?? actQty * unitRate);

                    return (
                      <tr key={item.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                        <td className="p-3 text-amber-500 font-bold">{item.item_code}</td>
                        <td className="p-3 text-zinc-800 dark:text-zinc-200 font-sans font-medium">
                          {item.description}
                        </td>
                        <td className="p-3 text-zinc-500">{item.unit}</td>
                        <td className="p-3 text-zinc-700 dark:text-zinc-300">{estQty.toLocaleString()}</td>
                        <td className="p-3 text-zinc-900 dark:text-zinc-100 font-bold">
                          {actQty.toLocaleString()}
                        </td>
                        <td className="p-3 text-zinc-500">${unitRate.toLocaleString()}</td>
                        <td className="p-3 text-zinc-700 dark:text-zinc-300">${budget.toLocaleString()}</td>
                        <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                          ${spent.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                  {boq.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-zinc-400 font-sans text-xs">
                        No Bill of Quantities records found for this project.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* Tab 4: Manpower */}
        <TabsContent value="manpower" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Site Workforce & Subcontractor Headcount
            </h3>
            <Button
              variant="amber"
              size="sm"
              onClick={() => setIsAddManpowerOpen(true)}
              className="gap-1.5 text-xs font-bold"
            >
              <Plus className="h-3.5 w-3.5" />
              Log Daily Headcount
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5">
              <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 dark:text-zinc-400">
                Actual Headcount Today
              </span>
              <div className="font-mono text-3xl font-black text-amber-500 mt-2">
                {manpowerToday.length ? `${manpowerTodayActual} Pax` : NO_DATA}
              </div>
              <span className="text-xs text-zinc-500 mt-1 block">From today&apos;s manpower log entries</span>
            </Card>

            <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5">
              <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 dark:text-zinc-400">
                Trades Logged Today
              </span>
              <div className="font-mono text-3xl font-black text-zinc-900 dark:text-zinc-100 mt-2">
                {manpowerToday.length ? new Set(manpowerToday.map((m: any) => m.trade)).size : NO_DATA}
              </div>
              <span className="text-xs text-zinc-500 mt-1 block">Distinct trades with a headcount entry</span>
            </Card>

            <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5">
              <span className="text-[10px] uppercase font-mono font-bold text-zinc-500 dark:text-zinc-400">
                Plan Attainment
              </span>
              <div className="font-mono text-3xl font-black text-emerald-500 dark:text-emerald-400 mt-2">
                {fmtPct(manpowerTodayPlanned > 0 ? (manpowerTodayActual / manpowerTodayPlanned) * 100 : null, 0)}
              </div>
              <span className="text-xs text-zinc-500 mt-1 block">Actual vs planned headcount today</span>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 5: Materials */}
        <TabsContent value="materials" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Bulk Materials & Supply Chain Receipts
            </h3>
            <Button
              variant="amber"
              size="sm"
              onClick={() => setIsAddMaterialOpen(true)}
              className="gap-1.5 text-xs font-bold"
            >
              <Plus className="h-3.5 w-3.5" />
              Log Material Shipment
            </Button>
          </div>

          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Materials Register Summary
            </h3>
            {materials.length === 0 ? (
              <p className="text-xs text-zinc-500">No materials recorded for this project.</p>
            ) : (
              <div className="space-y-2 text-xs font-mono">
                {materials.map((m: any) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
                  >
                    <div>
                      <span className="text-amber-500 font-bold block">{m.name}</span>
                      <span className="text-zinc-600 dark:text-zinc-400 font-sans">
                        Delivered {fmtNumber(m.total_delivered)} of {fmtNumber(m.total_ordered)} {m.unit} ordered · used{" "}
                        {fmtNumber(m.total_used)} {m.unit}
                      </span>
                    </div>
                    <span className="font-bold text-zinc-800 dark:text-zinc-200">
                      Stock: {fmtNumber(m.stock_on_hand)} {m.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Tab 6: Drawings */}
        <TabsContent value="drawings" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Approved Construction Drawings & BIM Models
            </h3>
            <Button
              variant="amber"
              size="sm"
              onClick={() => setIsAddDrawingOpen(true)}
              className="gap-1.5 text-xs font-bold"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload CAD / PDF
            </Button>
          </div>

          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-3">
            <div className="space-y-2 text-xs">
              {[
                { name: "TH-ARCH-L0-REV-C.pdf", title: "Ground Floor Concourse Architectural", rev: "Rev C" },
                { name: "TH-STRUCT-RAFT-REV-B.pdf", title: "Foundation Raft Reinforcement Detail", rev: "Rev B" },
                { name: "TH-MEP-DRAIN-REV-A.pdf", title: "Substructure Stormwater & Drainage", rev: "Rev A" },
              ].map((doc, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-amber-500" />
                    <div>
                      <span className="font-bold text-zinc-900 dark:text-zinc-100 block">{doc.title}</span>
                      <span className="font-mono text-zinc-500 text-[10px]">{doc.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono text-[10px] text-zinc-600 dark:text-zinc-300">
                      {doc.rev}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toast.success(`Downloading ${doc.name}`)}
                      className="h-8 text-xs border-zinc-300 dark:border-zinc-700"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      PDF
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* MODAL 1: Add Work Package Task to Phase */}
      <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold font-mono text-zinc-900 dark:text-white">
              Add Work Package to Phase Plan
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTask} className="space-y-3 pt-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Target Phase</label>
              <select
                value={taskPhaseId}
                onChange={(e) => {
                  setTaskPhaseId(e.target.value);
                  const p = allPhases.find((cp) => cp.id === e.target.value);
                  if (p) {
                    const prefix = p.wbsPrefix.replace(".", "");
                    const count = (phaseData.find((pd) => pd.id === p.id)?.tasks.length || 0) + 1;
                    setNewTaskWbs(`${prefix}.${count}`);
                  }
                }}
                className="w-full h-9 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100"
              >
                {allPhases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.isCustom ? "(Custom)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Work Package / Task Title</label>
              <Input
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                placeholder="e.g. Diaphragm Wall Guide Wall Casting"
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">WBS Code</label>
                <Input
                  value={newTaskWbs}
                  onChange={(e) => setNewTaskWbs(e.target.value)}
                  placeholder="1.3"
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-mono text-xs"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Initial Status</label>
                <select
                  value={newTaskStatus}
                  onChange={(e) => setNewTaskStatus(e.target.value)}
                  className="w-full h-9 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="delayed">Delayed</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Start Date</label>
                <Input
                  type="date"
                  value={newTaskStart}
                  onChange={(e) => setNewTaskStart(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Target End Date</label>
                <Input
                  type="date"
                  value={newTaskEnd}
                  onChange={(e) => setNewTaskEnd(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="crit-task"
                checked={newTaskCritical}
                onChange={(e) => setNewTaskCritical(e.target.checked)}
                className="rounded border-zinc-700 text-amber-500 focus:ring-amber-500"
              />
              <label htmlFor="crit-task" className="text-xs text-zinc-700 dark:text-zinc-300 font-medium cursor-pointer">
                Critical Path Milestone (Delays will impact overall handover)
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddTaskOpen(false)}
                className="border-zinc-300 dark:border-zinc-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="amber"
                size="sm"
                disabled={createTaskMutation.isPending}
                className="font-bold gap-1"
              >
                {createTaskMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                Save Work Package
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: Log Daily Work Progress on Task */}
      <Dialog open={isLogWorkOpen} onOpenChange={setIsLogWorkOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold font-mono text-zinc-900 dark:text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-amber-500" />
              Log Daily Work & Progress Increment
            </DialogTitle>
          </DialogHeader>

          {selectedTaskForLog && (
            <div className="p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-500">Task:</span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">{selectedTaskForLog.task_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Current Progress:</span>
                <span className="text-amber-500 font-bold">{selectedTaskForLog.progress_percent}%</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSaveWorkLog} className="space-y-3 pt-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Shift Date</label>
                <Input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Subcontractor / Crew</label>
                <Input
                  value={logContractor}
                  onChange={(e) => setLogContractor(e.target.value)}
                  placeholder="e.g. Apex Formwork Squad"
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Work Completed Summary</label>
              <textarea
                value={logDesc}
                onChange={(e) => setLogDesc(e.target.value)}
                rows={2}
                placeholder="e.g. Installed 32m of rebar cage and poured 45 m³ C35 concrete"
                className="w-full rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-amber-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Physical Output Delivered</label>
                <Input
                  value={logOutput}
                  onChange={(e) => setLogOutput(e.target.value)}
                  placeholder="e.g. 45 m³, 12 MT, 8 bays"
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Manhours Expended</label>
                <Input
                  type="number"
                  value={logManhours}
                  onChange={(e) => setLogManhours(e.target.value)}
                  placeholder="40"
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1 bg-amber-500/5 dark:bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
              <div className="flex justify-between items-center mb-1">
                <label className="font-bold text-amber-600 dark:text-amber-400">
                  New Task Completion: {logNewProgress}%
                </label>
                <span className="text-[10px] text-zinc-500 font-mono">
                  From {selectedTaskForLog?.progress_percent || 0}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={logNewProgress}
                onChange={(e) => setLogNewProgress(e.target.value)}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsLogWorkOpen(false)}
                className="border-zinc-300 dark:border-zinc-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="amber"
                size="sm"
                disabled={logWorkMutation.isPending}
                className="font-bold gap-1"
              >
                {logWorkMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                Record Work Log
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: Edit Project Parameters */}
      <Dialog open={isEditProjectOpen} onOpenChange={setIsEditProjectOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold font-mono text-zinc-900 dark:text-white">
              Edit Project Parameters
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveProject} className="space-y-3 pt-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Project Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Project Code</label>
                <Input
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-mono text-xs uppercase"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full h-9 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100"
                >
                  <option value="planning">Planning</option>
                  <option value="active">Active</option>
                  <option value="on_hold">On Hold</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Budget ($ USD)</label>
              <Input
                type="number"
                value={editBudget}
                onChange={(e) => setEditBudget(e.target.value)}
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Start Date</label>
                <Input
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">End Date</label>
                <Input
                  type="date"
                  value={editEndDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 text-xs text-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditProjectOpen(false)}
                className="border-zinc-300 dark:border-zinc-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="amber"
                size="sm"
                disabled={updateProjectMutation.isPending}
                className="font-bold gap-1"
              >
                {updateProjectMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: Add Site Sector */}
      <Dialog open={isAddSiteOpen} onOpenChange={setIsAddSiteOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold font-mono text-zinc-900 dark:text-white">
              Register New Site Sector
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newSiteName.trim() || !newSiteCode.trim()) {
                toast.error("Site sector name and code are required");
                return;
              }
              createSiteMutation.mutate({
                name: newSiteName.trim(),
                code: newSiteCode.trim().toUpperCase(),
                address: newSiteAddress.trim() || "Main Access Sector",
                latitude: newSiteLat ? parseFloat(newSiteLat) : 28.6139,
                longitude: newSiteLng ? parseFloat(newSiteLng) : 77.2090,
                status: newSiteStatus,
              });
            }}
            className="space-y-3 pt-2 text-xs"
          >
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Site Sector Name</label>
              <Input
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                placeholder="e.g. North Concourse & Substructure"
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Site Code</label>
                <Input
                  value={newSiteCode}
                  onChange={(e) => setNewSiteCode(e.target.value)}
                  placeholder="SITE-NC-01"
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-mono text-xs uppercase"
                />
              </div>
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Status</label>
                <select
                  value={newSiteStatus}
                  onChange={(e) => setNewSiteStatus(e.target.value)}
                  className="w-full h-9 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-3 text-xs text-zinc-900 dark:text-zinc-100"
                >
                  <option value="active">Active</option>
                  <option value="planning">Planning</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Physical Address / Boundary</label>
              <Input
                value={newSiteAddress}
                onChange={(e) => setNewSiteAddress(e.target.value)}
                placeholder="e.g. 742 Industrial Expressway, Gate 3"
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsAddSiteOpen(false)}
                className="border-zinc-300 dark:border-zinc-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="amber"
                size="sm"
                disabled={createSiteMutation.isPending}
                className="font-bold gap-1"
              >
                {createSiteMutation.isPending && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                Create Site Sector
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 5: Create New Construction Phase */}
      <Dialog open={isCreatePhaseOpen} onOpenChange={setIsCreatePhaseOpen}>
        <DialogContent className="max-w-lg bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-base font-bold font-mono text-zinc-900 dark:text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Create Construction Phase
            </DialogTitle>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Establish a new capital phase, configure WBS prefix code, deliverables envelope, and visual branding.
            </p>
          </DialogHeader>

          <form onSubmit={handleSaveNewPhase} className="space-y-4 pt-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Phase Title / Name</label>
              <Input
                value={newPhaseName}
                onChange={(e) => setNewPhaseName(e.target.value)}
                placeholder="e.g. Phase 8: Solar Microgrid & Green Energy Facility"
                className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Filter Tag / Short Name</label>
                <Input
                  value={newPhaseTag}
                  onChange={(e) => setNewPhaseTag(e.target.value)}
                  placeholder="e.g. Solar & Microgrid"
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">WBS Code Prefix</label>
                <Input
                  value={newPhaseWbs}
                  onChange={(e) => setNewPhaseWbs(e.target.value)}
                  placeholder="8."
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-mono text-xs"
                  required
                />
                <span className="text-[10px] text-zinc-400 font-mono">Tasks with this prefix are grouped here</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Color Palette & Visual Theme</label>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {COLOR_PALETTES.map((color) => {
                  const isSelected = newPhaseColor === color.value;
                  return (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setNewPhaseColor(color.value)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono border transition-all ${
                        isSelected
                          ? "border-zinc-900 dark:border-white ring-2 ring-amber-500/50 bg-zinc-100 dark:bg-zinc-900 font-bold"
                          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 bg-white dark:bg-zinc-950"
                      }`}
                    >
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color.value }} />
                      <span className="text-zinc-700 dark:text-zinc-300">{color.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Target Start Date</label>
                <Input
                  type="date"
                  value={newPhaseStart}
                  onChange={(e) => setNewPhaseStart(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-700 dark:text-zinc-300">Target Completion Date</label>
                <Input
                  type="date"
                  value={newPhaseEnd}
                  onChange={(e) => setNewPhaseEnd(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Deliverables & Scope Summary</label>
              <textarea
                value={newPhaseDesc}
                onChange={(e) => setNewPhaseDesc(e.target.value)}
                rows={3}
                placeholder="e.g. Turnkey photovoltaic solar arrays, battery energy storage systems (BESS), substation transformers, and municipal grid connection."
                className="w-full rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
              <input
                type="checkbox"
                id="inaugural-task"
                checked={newPhaseCreateInauguralTask}
                onChange={(e) => setNewPhaseCreateInauguralTask(e.target.checked)}
                className="rounded border-zinc-700 text-amber-500 focus:ring-amber-500"
              />
              <label htmlFor="inaugural-task" className="text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                Automatically generate inaugural kickoff task under <strong className="font-mono text-amber-500">{newPhaseWbs || "8."}1</strong>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreatePhaseOpen(false)}
                className="border-zinc-300 dark:border-zinc-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="amber"
                size="sm"
                className="font-bold gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Establish Construction Phase
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
