"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Tv,
  Bell,
  LogOut,
  User,
  Building2,
  MapPin,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/authStore";
import { useProjectStore } from "@/stores/projectStore";
import { useLiveStore } from "@/stores/liveStore";
import { StatusDot } from "@/components/common/StatusDot";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { ConnectSourceModal } from "@/components/devices/ConnectSourceModal";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { normalizeList } from "@/lib/utils";
import { toast } from "sonner";

export function TopBar() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const activeSiteId = useProjectStore((s) => s.activeSiteId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setActiveSite = useProjectStore((s) => s.setActiveSite);
  const connectionStatus = useLiveStore((s) => s.connectionStatus);
  const liveAlerts = useLiveStore((s) => s.liveAlerts);

  // Fetch real projects from backend
  const { data: projectsData } = useQuery<any>({
    queryKey: ["projects"],
    queryFn: () => apiClient.get<any>("/api/v1/projects"),
  });
  const projectsList = normalizeList<any>(projectsData);
  const projects =
    projectsList.length > 0
      ? projectsList
      : [
          {
            id: "4921c420-b413-48f3-b935-8fecf7708ce3",
            name: "Transit Hub Capital Project",
            code: "TH-2026-A",
          },
        ];

  const currentProject = projects.find((p) => p.id === activeProjectId) || projects[0];

  // Fetch real sites for the selected project
  const { data: sitesData } = useQuery<any>({
    queryKey: ["project-sites", currentProject?.id],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${currentProject?.id}/sites`),
    enabled: Boolean(currentProject?.id),
  });
  const sitesList = normalizeList<any>(sitesData);
  const sites =
    sitesList.length > 0
      ? sitesList
      : [
          {
            id: "0907d5cb-7682-48b7-b78d-c999ce138f34",
            name: "East Wing Commercial Site",
            code: "EW-01",
          },
        ];

  const currentSite = sites.find((s) => s.id === activeSiteId) || sites[0];

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    logout();
    router.push("/login");
    toast.info("Logged out successfully");
  };

  const toggleTvMode = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      toast.success("Entered TV Wall Mode");
    } else {
      document.exitFullscreen().catch(() => {});
      toast.info("Exited TV Wall Mode");
    }
  };

  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 px-4 backdrop-blur-md z-20">
      {/* Left: Project & Site Selectors */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Project Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 px-3 font-medium text-xs border-zinc-200 dark:border-zinc-800"
            >
              <Building2 className="h-3.5 w-3.5 text-amber-500" />
              <span className="hidden sm:inline font-semibold">{currentProject.name}</span>
              <span className="sm:hidden font-mono">{currentProject.code}</span>
              <ChevronDown className="h-3 w-3 text-zinc-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Active Project</span>
              <span className="text-[10px] text-zinc-400 font-mono">({projects.length})</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => {
                  setActiveProject(p.id);
                  toast.success(`Active project switched to: ${p.name}`);
                }}
                className={p.id === currentProject.id ? "bg-amber-500/10 text-amber-500 font-semibold" : ""}
              >
                <div className="flex flex-col">
                  <span>{p.name}</span>
                  <span className="text-[10px] text-zinc-400 font-mono">{p.code}</span>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/projects")}
              className="text-amber-500 text-xs font-semibold cursor-pointer"
            >
              Manage / Register Projects &rarr;
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-zinc-300 dark:text-zinc-700">/</span>

        {/* Site Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2 px-3 font-medium text-xs border-zinc-200 dark:border-zinc-800"
            >
              <MapPin className="h-3.5 w-3.5 text-zinc-400" />
              <span className="truncate max-w-[140px] sm:max-w-[200px]">
                {currentSite?.name || "Select Site"}
              </span>
              <ChevronDown className="h-3 w-3 text-zinc-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Site Zone / Sector</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sites.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => {
                  setActiveSite(s.id);
                  toast.success(`Active site switched to: ${s.name}`);
                }}
                className={s.id === currentSite?.id ? "bg-amber-500/10 text-amber-500 font-semibold" : ""}
              >
                <span>{s.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Right Action Bar */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Search trigger */}
        <button
          onClick={() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
          }}
          className="hidden md:flex items-center gap-2 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-xs text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Quick search...</span>
          <kbd className="text-[10px] font-mono bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">
            ⌘K
          </kbd>
        </button>

        {/* Real-time Link Pill */}
        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs font-mono">
          <StatusDot status={connectionStatus} size="sm" pulse />
          <span className="text-[11px] text-zinc-600 dark:text-zinc-400 uppercase">
            {connectionStatus}
          </span>
        </div>

        {/* Connect Own Source Button */}
        <ConnectSourceModal />

        {/* Light / Dark Mode Toggle */}
        <ThemeToggle />

        {/* TV Mode Toggle */}
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTvMode}
          title="Fullscreen TV Wall Mode"
          className="border-zinc-200 dark:border-zinc-800"
        >
          <Tv className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
        </Button>

        {/* Alerts Bell Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="relative border-zinc-200 dark:border-zinc-800"
            >
              <Bell className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
              {liveAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {liveAlerts.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-2">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Recent Alerts ({liveAlerts.length})
              </span>
              <button
                onClick={() => router.push("/alerts")}
                className="text-xs font-semibold text-amber-500 hover:underline cursor-pointer"
              >
                View all
              </button>
            </div>
            <DropdownMenuSeparator />
            {liveAlerts.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-400">
                No active alerts right now
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1.5">
                {liveAlerts.slice(0, 5).map((a) => (
                  <div
                    key={a.alert_id}
                    onClick={() => router.push("/alerts")}
                    className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-850 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs cursor-pointer"
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className={a.severity === "critical" ? "text-red-500" : "text-amber-500"}>
                        {a.severity.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {new Date(a.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-zinc-700 dark:text-zinc-300 line-clamp-2 mt-0.5">
                      {a.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500 text-zinc-950 font-bold text-xs uppercase">
                {user?.full_name?.charAt(0) || "U"}
              </div>
              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[100px]">
                  {user?.full_name || "User"}
                </span>
                <span className="text-[9px] text-zinc-400 capitalize -mt-0.5">
                  {user?.role?.replace("_", " ") || "Admin"}
                </span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-xs font-semibold">{user?.full_name || "Gaurav Sharma"}</span>
                <span className="text-[11px] text-zinc-400">{user?.email || "admin@buildtrack.com"}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/profile")}>
              <User className="mr-2 h-4 w-4" />
              <span>User Profile</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-500">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
