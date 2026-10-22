"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Search,
  LayoutDashboard,
  Activity,
  HardHat,
  MapPin,
  Bell,
  AlertTriangle,
  Sliders,
  FolderGit2,
  BarChart3,
  Users,
  Tv,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

interface CommandItem {
  id: string;
  title: string;
  category: "Navigation" | "Actions" | "Preferences";
  icon: React.ReactNode;
  onSelect: () => void;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const commands: CommandItem[] = [
    {
      id: "nav-dashboard",
      title: "Dashboard Overview",
      category: "Navigation",
      icon: <LayoutDashboard className="h-4 w-4" />,
      onSelect: () => router.push("/dashboard"),
      keywords: ["kpi", "overview", "home", "stats"],
    },
    {
      id: "nav-live",
      title: "Live Monitoring & Camera Wall",
      category: "Navigation",
      icon: <Activity className="h-4 w-4" />,
      onSelect: () => router.push("/live"),
      keywords: ["cctv", "sensors", "telemetry", "streaming", "video"],
    },
    {
      id: "nav-safety",
      title: "Safety & PPE Compliance",
      category: "Navigation",
      icon: <HardHat className="h-4 w-4" />,
      onSelect: () => router.push("/safety"),
      keywords: ["helmet", "vest", "cv", "violations", "yolo"],
    },
    {
      id: "nav-map",
      title: "Site Map & Geozones",
      category: "Navigation",
      icon: <MapPin className="h-4 w-4" />,
      onSelect: () => router.push("/site-map"),
      keywords: ["gis", "zones", "hazard", "leaflet", "gps"],
    },
    {
      id: "nav-alerts",
      title: "Alerts Center",
      category: "Navigation",
      icon: <Bell className="h-4 w-4" />,
      onSelect: () => router.push("/alerts"),
      keywords: ["critical", "warning", "threshold", "breach"],
    },
    {
      id: "nav-incidents",
      title: "Incidents & Kanban",
      category: "Navigation",
      icon: <AlertTriangle className="h-4 w-4" />,
      onSelect: () => router.push("/incidents"),
      keywords: ["safety", "spill", "hazard", "board"],
    },
    {
      id: "nav-analytics",
      title: "Analytics & Reports",
      category: "Navigation",
      icon: <BarChart3 className="h-4 w-4" />,
      onSelect: () => router.push("/analytics"),
      keywords: ["trends", "predictions", "export", "charts"],
    },
    {
      id: "nav-rules",
      title: "Automated Rules Engine",
      category: "Navigation",
      icon: <Sliders className="h-4 w-4" />,
      onSelect: () => router.push("/rules"),
      keywords: ["conditions", "automation", "triggers"],
    },
    {
      id: "nav-projects",
      title: "Projects & Schedules",
      category: "Navigation",
      icon: <FolderGit2 className="h-4 w-4" />,
      onSelect: () => router.push("/projects"),
      keywords: ["gantt", "boq", "materials", "manpower"],
    },
    {
      id: "nav-admin",
      title: "System Admin & Users",
      category: "Navigation",
      icon: <Users className="h-4 w-4" />,
      onSelect: () => router.push("/admin"),
      keywords: ["audit", "health", "rbac", "accounts"],
    },
    {
      id: "act-tv-mode",
      title: "Toggle Control Room TV Mode (Fullscreen)",
      category: "Preferences",
      icon: <Tv className="h-4 w-4" />,
      onSelect: () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
          toast.success("Entered TV Wall Mode");
        } else {
          document.exitFullscreen().catch(() => {});
          toast.info("Exited TV Wall Mode");
        }
      },
      keywords: ["wall", "fullscreen", "presentation"],
    },
    {
      id: "act-ack-all",
      title: "Acknowledge All Active Alerts",
      category: "Actions",
      icon: <CheckCircle2 className="h-4 w-4" />,
      onSelect: () => {
        toast.success("Batch acknowledged all visible alerts");
      },
      keywords: ["clear", "silence", "resolve"],
    },
  ];

  const filtered = commands.filter((cmd) => {
    const q = query.toLowerCase();
    if (!q) return true;
    return (
      cmd.title.toLowerCase().includes(q) ||
      cmd.category.toLowerCase().includes(q) ||
      cmd.keywords?.some((k) => k.toLowerCase().includes(q))
    );
  });

  const categories = Array.from(new Set(filtered.map((c) => c.category)));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-xl overflow-hidden border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl">
        <div className="flex items-center border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
          <Search className="h-4 w-4 text-zinc-400 mr-3 shrink-0" />
          <input
            type="text"
            placeholder="Type a command or search (e.g. 'cctv', 'rules', 'gantt')..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400 text-zinc-900 dark:text-zinc-100"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-4">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
              No matching commands found.
            </div>
          ) : (
            categories.map((cat) => (
              <div key={cat} className="space-y-1">
                <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {cat}
                </div>
                {filtered
                  .filter((c) => c.category === cat)
                  .map((cmd) => (
                    <button
                      key={cmd.id}
                      onClick={() => {
                        cmd.onSelect();
                        setOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors text-left cursor-pointer"
                    >
                      <span className="text-zinc-500 dark:text-zinc-400">{cmd.icon}</span>
                      <span>{cmd.title}</span>
                    </button>
                  ))}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <span>Navigation:</span>
            <kbd className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded">↑</kbd>
            <kbd className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded">↓</kbd>
            <span>Select:</span>
            <kbd className="bg-zinc-200 dark:bg-zinc-800 px-1 rounded">↵</kbd>
          </div>
          <span>BuildTrack Command Center</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
