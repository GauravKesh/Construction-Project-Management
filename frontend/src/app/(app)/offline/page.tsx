"use client";

import React from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <div className="flex min-h-[500px] w-full flex-col items-center justify-center text-center p-6 text-zinc-100">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 mb-4 border border-amber-500/20">
        <WifiOff className="h-8 w-8" />
      </div>
      <h1 className="font-mono text-2xl font-black text-white">Edge Gateway Disconnected</h1>
      <p className="mt-2 text-xs text-zinc-400 max-w-sm">
        The control room client lost network connectivity with the central MQTT & Socket.IO bridge.
      </p>
      <Button
        variant="amber"
        size="sm"
        onClick={() => window.location.reload()}
        className="mt-6 gap-2 font-bold"
      >
        <RefreshCw className="h-4 w-4" />
        Attempt Reconnection
      </Button>
    </div>
  );
}
