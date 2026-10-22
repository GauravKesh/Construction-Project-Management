import React from "react";
import { cn } from "@/lib/utils";

export type SeverityType = "critical" | "warning" | "info" | "ok" | "resolved" | "high" | "medium" | "low";

interface SeverityBadgeProps {
  severity: SeverityType | string;
  className?: string;
  showDot?: boolean;
}

export function SeverityBadge({ severity, className, showDot = true }: SeverityBadgeProps) {
  const norm = (severity || "info").toLowerCase();

  const isCritical = norm === "critical" || norm === "high" || norm === "danger";
  const isWarning = norm === "warning" || norm === "medium";
  const isOk = norm === "ok" || norm === "resolved" || norm === "healthy" || norm === "low";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase",
        {
          "border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400": isCritical,
          "border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400": isWarning,
          "border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400": isOk,
          "border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400":
            !isCritical && !isWarning && !isOk,
        },
        className
      )}
    >
      {showDot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", {
            "bg-red-500 animate-pulse": isCritical,
            "bg-amber-500": isWarning,
            "bg-emerald-500": isOk,
            "bg-sky-500": !isCritical && !isWarning && !isOk,
          })}
        />
      )}
      {norm}
    </span>
  );
}
