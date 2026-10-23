"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Search, Maximize, Bell, LogOut, User, Building2, MapPin, ChevronDown, Menu, PlugZap, Volume2, VolumeX } from "lucide-react";
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
import { useUiStore } from "@/stores/uiStore";
import { StatusDot } from "@/components/common/StatusDot";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { ConnectSourceModal } from "@/components/devices/ConnectSourceModal";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { normalizeList } from "@/lib/utils";
import { toast } from "sonner";
import { soundManager } from "@/lib/audio/soundEffects";

const iconButton = "h-9 w-9 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300";

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
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const [audioEnabled, setAudioEnabled] = React.useState(true);

  React.useEffect(() => {
    setAudioEnabled(soundManager.isEnabled());
    const handleAudioChange = () => setAudioEnabled(soundManager.isEnabled());
    window.addEventListener("buildtrack:audio_settings_changed", handleAudioChange);
    return () => window.removeEventListener("buildtrack:audio_settings_changed", handleAudioChange);
  }, []);

  const toggleAudio = () => {
    const next = !audioEnabled;
    soundManager.setEnabled(next);
    setAudioEnabled(next);
    toast.info(next ? "Notification audio alerts enabled" : "Notification audio alerts muted");
  };

  const { data: projectsData } = useQuery<any>({
    queryKey: ["projects"],
    queryFn: () => apiClient.get<any>("/api/v1/projects"),
  });
  const projects = normalizeList<any>(projectsData);
  const currentProject = projects.find((p) => p.id === activeProjectId);

  const { data: sitesData } = useQuery<any>({
    queryKey: ["project-sites", activeProjectId],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${activeProjectId}/sites`),
    enabled: Boolean(activeProjectId),
  });
  const sites = normalizeList<any>(sitesData);
  const currentSite = sites.find((s) => s.id === activeSiteId);

  const handleLogout = async () => {
    toast.info("Signing out…");
    await logout();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const openSearch = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  };

  return (
    <header className="flex h-14 w-full shrink-0 items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/90 px-3 sm:px-4 backdrop-blur-md z-20">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setMobileNavOpen(true)}
        className="h-9 w-9 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Context: project / site */}
      <div className="flex min-w-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 min-w-0 gap-2 px-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 shrink-0 text-amber-500" />
              <span className="truncate max-w-[110px] sm:max-w-[220px]">
                {currentProject?.name ?? (projects.length ? "Select project" : "No projects")}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Projects</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => setActiveProject(p.id)}
                className={p.id === activeProjectId ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold" : ""}
              >
                <div className="flex flex-col">
                  <span>{p.name}</span>
                  <span className="text-[11px] text-zinc-400 font-mono">{p.code}</span>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/projects")} className="text-xs font-medium">
              Manage projects…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="hidden sm:inline text-zinc-300 dark:text-zinc-700">/</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="hidden sm:flex h-9 min-w-0 gap-2 px-2 text-sm">
              <MapPin className="h-4 w-4 shrink-0 text-zinc-400" />
              <span className="truncate max-w-[180px]">
                {currentSite?.name ?? (sites.length ? "Select site" : "No sites")}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>Sites</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {sites.length === 0 && <div className="px-2 py-3 text-xs text-zinc-500">This project has no sites.</div>}
            {sites.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => setActiveSite(s.id)}
                className={s.id === activeSiteId ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold" : ""}
              >
                {s.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Actions */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <button
          onClick={openSearch}
          className="hidden md:flex h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 px-3 text-xs text-zinc-500 hover:border-zinc-300 dark:hover:border-zinc-700"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Search</span>
          <kbd className="rounded bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>
        <Button variant="outline" size="icon" onClick={openSearch} className={`md:hidden ${iconButton}`} aria-label="Search">
          <Search className="h-4 w-4" />
        </Button>

        <span className="hidden sm:flex h-9 w-6 items-center justify-center" title={`Live updates: ${connectionStatus}`}>
          <StatusDot status={connectionStatus} size="sm" pulse={connectionStatus === "connected"} />
        </span>

        <div className="hidden md:block">
          <ConnectSourceModal
            trigger={
              <Button variant="outline" size="icon" className={iconButton} title="Connect a data source">
                <PlugZap className="h-4 w-4" />
              </Button>
            }
          />
        </div>

        <ThemeToggle />

        <Button
          variant="outline"
          size="icon"
          onClick={toggleAudio}
          title={audioEnabled ? "Mute alert chimes" : "Unmute alert chimes"}
          className={iconButton}
          aria-label={audioEnabled ? "Mute alert sounds" : "Unmute alert sounds"}
        >
          {audioEnabled ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4 text-red-500" />
          )}
        </Button>

        <Button
          variant="outline"
          size="icon"
          onClick={toggleFullscreen}
          title="Fullscreen (wall display)"
          className={`hidden xl:inline-flex ${iconButton}`}
        >
          <Maximize className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className={`relative ${iconButton}`} aria-label="Recent alerts">
              <Bell className="h-4 w-4" />
              {liveAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {liveAlerts.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-2">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs font-semibold text-zinc-500">Recent alerts</span>
              <button onClick={() => router.push("/alerts")} className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:underline">
                View all
              </button>
            </div>
            <DropdownMenuSeparator />
            {liveAlerts.length === 0 ? (
              <div className="py-6 text-center text-xs text-zinc-500">No new alerts this session</div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1">
                {liveAlerts.slice(0, 5).map((a) => (
                  <button
                    key={a.alert_id}
                    onClick={() => router.push("/alerts")}
                    className="w-full rounded-md p-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold capitalize ${a.severity === "critical" ? "text-red-500" : "text-amber-500"}`}>
                        {a.severity}
                      </span>
                      <span className="text-[11px] text-zinc-400">{new Date(a.ts).toLocaleTimeString()}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-zinc-700 dark:text-zinc-300">{a.message}</p>
                  </button>
                ))}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-1 xl:pr-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              aria-label="Account menu"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-xs font-bold uppercase text-zinc-950">
                {user?.full_name?.charAt(0) ?? "?"}
              </span>
              <span className="hidden xl:flex flex-col text-left leading-tight">
                <span className="max-w-[120px] truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  {user?.full_name ?? "…"}
                </span>
                <span className="text-[11px] capitalize text-zinc-500">{user?.role?.replace(/_/g, " ") ?? ""}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{user?.full_name ?? "Signed in"}</span>
                <span className="text-xs font-normal text-zinc-500">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/profile")}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-500">
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
