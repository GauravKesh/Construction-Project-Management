import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50",
        {
          "border-transparent bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900":
            variant === "default",
          "border-transparent bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100":
            variant === "secondary",
          "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400":
            variant === "destructive",
          "border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-300":
            variant === "outline",
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400":
            variant === "success",
          "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-400":
            variant === "warning",
          "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400":
            variant === "info",
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
