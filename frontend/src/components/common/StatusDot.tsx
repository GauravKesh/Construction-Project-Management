import React from "react";
import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: "online" | "connected" | "healthy" | "streaming" | "warning" | "error" | "offline" | "disconnected" | "reconnecting" | string;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
}

export function StatusDot({ status, size = "md", pulse = true, className }: StatusDotProps) {
  const norm = (status || "").toLowerCase();
  const isGood = norm === "online" || norm === "connected" || norm === "healthy" || norm === "streaming" || norm === "ready";
  const isWarn = norm === "warning" || norm === "reconnecting" || norm === "connecting" || norm === "action_required";
  const isBad = norm === "error" || norm === "offline" || norm === "disconnected" || norm === "critical";

  return (
    <span className={cn("relative inline-flex items-center justify-center", className)}>
      {pulse && isGood && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      )}
      {pulse && isWarn && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
      )}
      {pulse && isBad && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
      )}
      <span
        className={cn("relative inline-block rounded-full", {
          "h-2 w-2": size === "sm",
          "h-2.5 w-2.5": size === "md",
          "h-3.5 w-3.5": size === "lg",
          "bg-emerald-500": isGood,
          "bg-amber-500": isWarn,
          "bg-red-500": isBad,
          "bg-zinc-400 dark:bg-zinc-600": !isGood && !isWarn && !isBad,
        })}
      />
    </span>
  );
}
