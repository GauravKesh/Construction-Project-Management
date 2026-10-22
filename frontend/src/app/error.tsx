"use client";

import React, { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Control Room UI runtime error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-zinc-950 p-6 text-center text-zinc-100">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-500 mb-4 border border-red-500/20">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h1 className="font-mono text-2xl font-black text-white">System Render Exception</h1>
      <p className="mt-2 text-xs text-zinc-400 max-w-md font-mono">
        {error.message || "An unexpected error disrupted telemetry presentation."}
      </p>
      <Button
        variant="amber"
        size="sm"
        onClick={() => reset()}
        className="mt-6 gap-2 font-bold"
      >
        <RefreshCw className="h-4 w-4" />
        Reload Component
      </Button>
    </div>
  );
}
