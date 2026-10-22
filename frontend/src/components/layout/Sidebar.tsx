"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  HardHat,
  MapPin,
  Bell,
  AlertTriangle,
  BarChart3,
  Sliders,
  FolderGit2,
  Users,
  User,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveStore } from "@/stores/liveStore";
import { StatusDot } from "@/components/common/StatusDot";
import { useCan } from "@/stores/authStore";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: import("@/lib/rbac").UserRole[];
  badge?: number;
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const connectionStatus = useLiveStore((s) => s.connectionStatus);
  const liveAlerts = useLiveStore((s) => s.liveAlerts);
  const activeAlertsCount = liveAlerts.length;

  const isAdmin = useCan(["admin"]);

  const navItems: NavItem[] = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Live Monitoring", href: "/live", icon: Activity },
    { name: "Safety & PPE", href: "/safety", icon: HardHat },
    { name: "Site Map", href: "/site-map", icon: MapPin },
    { name: "Alerts", href: "/alerts", icon: Bell, badge: activeAlertsCount > 0 ? activeAlertsCount : undefined },
    { name: "Incidents", href: "/incidents", icon: AlertTriangle },
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Rules Engine", href: "/rules", icon: Sliders },
    { name: "Projects & Plan", href: "/projects", icon: FolderGit2 },
    { name: "Notifications", href: "/notifications", icon: Bell },
    ...(isAdmin ? [{ name: "Admin & Audit", href: "/admin", icon: Users }] : []),
    { name: "Profile", href: "/profile", icon: User },
  ];

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-all duration-300 z-30 select-none",
        collapsed ? "w-20" : "w-72"
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-zinc-200 dark:border-zinc-800">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-zinc-950 font-black shadow-md shadow-amber-500/20">
              <ShieldAlert className="h-5.5 w-5.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-black tracking-tight text-zinc-900 dark:text-zinc-50 font-mono">
                BUILD<span className="text-amber-500">TRACK</span>
              </span>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">
                Control Room v2.4
              </span>
            </div>
          </Link>
        )}

        {collapsed && (
          <Link href="/dashboard" className="mx-auto">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-zinc-950 font-black shadow-md shadow-amber-500/20">
              <ShieldAlert className="h-5.5 w-5.5" />
            </div>
          </Link>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "hidden md:flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer transition-colors",
            collapsed && "mx-auto mt-2"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.name : undefined}
              className={cn(
                "group flex items-center rounded-xl transition-all duration-150",
                collapsed
                  ? "justify-center p-3"
                  : "gap-3.5 px-3.5 py-2.5 text-[13.5px] font-medium",
                isActive
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/30 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-colors",
                  isActive
                    ? "text-amber-500"
                    : "text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300"
                )}
              />
              {!collapsed && <span className="truncate tracking-tight">{item.name}</span>}
              {!collapsed && item.badge !== undefined && (
                <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white px-2 py-0.5 min-w-5 h-5 shadow-xs">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Telemetry Status Footer */}
      <div className="p-3.5 border-t border-zinc-200 dark:border-zinc-800">
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800 p-2.5 text-xs",
            collapsed && "justify-center p-2.5"
          )}
        >
          <StatusDot status={connectionStatus} size="md" pulse />
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 dark:text-zinc-400">
                Telemetry Link
              </span>
              <span className="capitalize font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                {connectionStatus}
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
