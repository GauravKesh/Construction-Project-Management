"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  HardHat,
  MapPin,
  Bell,
  BellRing,
  AlertTriangle,
  BarChart3,
  Sliders,
  FolderGit2,
  Users,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveStore } from "@/stores/liveStore";
import { useUiStore } from "@/stores/uiStore";
import { StatusDot } from "@/components/common/StatusDot";
import { useCan } from "@/stores/authStore";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const CONNECTION_LABEL: Record<string, string> = {
  connected: "Live updates on",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  disconnected: "Live updates off",
};

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const connectionStatus = useLiveStore((s) => s.connectionStatus);
  const activeAlertsCount = useLiveStore((s) => s.liveAlerts.length);
  const isAdmin = useCan(["admin"]);

  // Close the mobile drawer after navigating
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, setMobileNavOpen]);

  const sections: NavSection[] = [
    {
      label: "Monitor",
      items: [
        { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
        { name: "Live Monitoring", href: "/live", icon: Activity },
        { name: "Alerts", href: "/alerts", icon: Bell, badge: activeAlertsCount || undefined },
        { name: "Incidents", href: "/incidents", icon: AlertTriangle },
        { name: "Safety & PPE", href: "/safety", icon: HardHat },
        { name: "Site Map", href: "/site-map", icon: MapPin },
      ],
    },
    {
      label: "Analyze",
      items: [
        { name: "Analytics", href: "/analytics", icon: BarChart3 },
        { name: "Rules", href: "/rules", icon: Sliders },
      ],
    },
    {
      label: "Manage",
      items: [
        { name: "Projects", href: "/projects", icon: FolderGit2 },
        { name: "Notifications", href: "/notifications", icon: BellRing },
        ...(isAdmin ? [{ name: "Admin", href: "/admin", icon: Users }] : []),
      ],
    },
  ];

  // The drawer is always expanded; only the desktop rail collapses
  const isCollapsed = collapsed && !mobileNavOpen;

  return (
    <>
      {/* Backdrop for the mobile drawer */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 select-none",
          // Mobile: off-canvas drawer. Desktop: static rail.
          "fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:transition-[width]",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "lg:w-[72px]" : "lg:w-60"
        )}
        aria-label="Main navigation"
      >
        {/* Brand */}
        <div className={cn("flex h-14 items-center gap-2 px-4", isCollapsed && "justify-center px-0")}>
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-zinc-950">
              <ShieldAlert className="h-4.5 w-4.5" />
            </div>
            {!isCollapsed && (
              <span className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                Build<span className="text-amber-500">Track</span>
              </span>
            )}
          </Link>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
          {sections.map((section) => (
            <div key={section.label}>
              {!isCollapsed ? (
                <p className="px-2.5 pb-1.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                  {section.label}
                </p>
              ) : (
                <div className="mx-auto mb-2 h-px w-6 bg-zinc-200 dark:bg-zinc-800" />
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={isCollapsed ? item.name : undefined}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center rounded-lg text-[13.5px] transition-colors",
                        isCollapsed ? "justify-center h-10" : "gap-3 px-2.5 h-9",
                        isActive
                          ? "bg-zinc-100 text-zinc-900 font-semibold dark:bg-zinc-900 dark:text-zinc-50"
                          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/60 dark:hover:text-zinc-100"
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-amber-500" aria-hidden="true" />
                      )}
                      <Icon
                        className={cn(
                          "h-4.5 w-4.5 shrink-0",
                          isActive ? "text-amber-500" : "text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
                        )}
                      />
                      {!isCollapsed && <span className="truncate">{item.name}</span>}
                      {item.badge !== undefined &&
                        (isCollapsed ? (
                          <span className="absolute top-1.5 right-3 h-2 w-2 rounded-full bg-red-500" />
                        ) : (
                          <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[11px] font-semibold leading-5 text-white min-w-5 text-center">
                            {item.badge}
                          </span>
                        ))}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer: live connection + collapse control */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 p-3 space-y-2">
          <div
            className={cn("flex items-center gap-2.5 px-2.5 py-1.5 text-xs", isCollapsed && "justify-center px-0")}
            title={CONNECTION_LABEL[connectionStatus] ?? connectionStatus}
          >
            <StatusDot status={connectionStatus} size="sm" pulse={connectionStatus === "connected"} />
            {!isCollapsed && (
              <span className="text-zinc-500 dark:text-zinc-400">{CONNECTION_LABEL[connectionStatus] ?? connectionStatus}</span>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "hidden lg:flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
              isCollapsed && "justify-center px-0"
            )}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            {!isCollapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
