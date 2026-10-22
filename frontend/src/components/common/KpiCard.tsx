import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
  sparklineData?: number[];
  status?: "default" | "warning" | "critical" | "success";
  description?: string;
}

export function KpiCard({
  title,
  value,
  unit,
  change,
  trend = "neutral",
  icon,
  sparklineData,
  status = "default",
  description,
}: KpiCardProps) {
  // Generate simple responsive SVG sparkline path
  const renderSparkline = () => {
    if (!sparklineData || sparklineData.length < 2) return null;
    const min = Math.min(...sparklineData);
    const max = Math.max(...sparklineData);
    const range = max - min || 1;
    const width = 80;
    const height = 28;

    const points = sparklineData
      .map((val, idx) => {
        const x = (idx / (sparklineData.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 6) - 3;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    const strokeColor =
      trend === "up" ? "#10b981" : trend === "down" ? "#ef4444" : "#f59e0b";

    return (
      <svg className="w-20 h-7 overflow-visible opacity-80" viewBox={`0 0 ${width} ${height}`}>
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  };

  return (
    <Card
      className={cn("relative overflow-hidden", {
        "border-red-500/40": status === "critical",
        "border-amber-500/40": status === "warning",
      })}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{title}</span>
          {icon && <span className="text-zinc-400">{icon}</span>}
        </div>

        <div className="mt-2 flex items-baseline justify-between">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums text-zinc-900 dark:text-zinc-50">
              {value}
            </span>
            {unit && (
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {unit}
              </span>
            )}
          </div>
          {renderSparkline()}
        </div>

        {(change || description) && (
          <div className="mt-1.5 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            {change && (
              <span
                className={cn("inline-flex items-center gap-1 font-medium", {
                  "text-emerald-600 dark:text-emerald-400": trend === "up",
                  "text-red-600 dark:text-red-400": trend === "down",
                  "text-zinc-500 dark:text-zinc-400 font-normal": trend === "neutral",
                })}
              >
                {trend === "up" && <TrendingUp className="h-3.5 w-3.5" />}
                {trend === "down" && <TrendingDown className="h-3.5 w-3.5" />}
                {change}
              </span>
            )}
            {description && <span className="truncate">{description}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
