import React from "react";
import { ShieldAlert } from "lucide-react";
import { ThemeToggle } from "@/components/common/ThemeToggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8 transition-colors">
      {/* Theme toggle in top-right */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Background ambient grid & lighting */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#27272a15_1px,transparent_1px),linear-gradient(to_bottom,#27272a15_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-amber-500/10 blur-[120px] pointer-events-none" />

      {/* Header Brand */}
      <div className="relative z-10 mb-8 flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-zinc-950 shadow-lg shadow-amber-500/20">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-black tracking-tight text-zinc-900 dark:text-white font-mono">
          BUILD<span className="text-amber-500">TRACK</span>
        </h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
          Construction IoT & AI Safety Monitoring Platform
        </p>
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-md">
        {children}
      </div>

      {/* Footer */}
      <div className="relative z-10 mt-8 text-center text-xs text-zinc-500 dark:text-zinc-600">
        &copy; {new Date().getFullYear()} BuildTrack Systems. Production Control Room.
      </div>
    </div>
  );
}
