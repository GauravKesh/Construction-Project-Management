import React from "react";
import { cn } from "@/lib/utils";

interface RiskGaugeProps {
  score: number; // 0 to 100
  title?: string;
  size?: number;
  className?: string;
}

export function RiskGauge({ score, title = "Site Risk Score", size = 180, className }: RiskGaugeProps) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  // Gauge colors and category
  let category = "Low Risk";
  let color = "#10b981"; // emerald
  let strokeClass = "text-emerald-500";
  if (clampedScore > 65) {
    category = "High Risk";
    color = "#ef4444"; // red
    strokeClass = "text-red-500";
  } else if (clampedScore > 35) {
    category = "Moderate Risk";
    color = "#f59e0b"; // amber
    strokeClass = "text-amber-500";
  }

  // Semi-circle arc math
  const strokeWidth = 14;
  const radius = 70;
  const circumference = Math.PI * radius; // Half-circle
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  return (
    <div className={cn("flex flex-col items-center justify-center p-3", className)}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size * 0.65 }}>
        <svg
          viewBox="0 0 160 95"
          className="w-full h-full overflow-visible"
        >
          {/* Background track */}
          <path
            d="M 15 85 A 65 65 0 0 1 145 85"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className="text-zinc-200 dark:text-zinc-800"
          />
          {/* Filled active arc */}
          <path
            d="M 15 85 A 65 65 0 0 1 145 85"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center reading */}
        <div className="absolute bottom-2 flex flex-col items-center">
          <span className="font-mono text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">
            {clampedScore}
          </span>
          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            / 100
          </span>
        </div>
      </div>

      <div className="mt-1 flex flex-col items-center">
        <span className={cn("text-xs font-bold uppercase tracking-wider", strokeClass)}>
          {category}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{title}</span>
      </div>
    </div>
  );
}
