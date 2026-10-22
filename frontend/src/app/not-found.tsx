import React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-zinc-950 p-6 text-center text-zinc-100">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 mb-4 border border-amber-500/20">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <h1 className="font-mono text-3xl font-black text-white">404 — Site Sector Not Found</h1>
      <p className="mt-2 text-xs text-zinc-400 max-w-sm">
        The requested monitoring sector or telemetry endpoint does not exist or has been relocated.
      </p>
      <Link href="/dashboard" className="mt-6">
        <Button variant="amber" size="sm" className="gap-2 font-bold">
          <ArrowLeft className="h-4 w-4" />
          Return to Control Room
        </Button>
      </Link>
    </div>
  );
}
