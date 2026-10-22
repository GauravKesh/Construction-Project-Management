import React from "react";
import Link from "next/link";
import { ShieldX, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[500px] w-full flex-col items-center justify-center text-center p-6 text-zinc-100">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-500 mb-4 border border-red-500/20">
        <ShieldX className="h-8 w-8" />
      </div>
      <h1 className="font-mono text-2xl font-black text-white">403 — Restricted Sector</h1>
      <p className="mt-2 text-xs text-zinc-400 max-w-sm">
        Your assigned RBAC role does not have authorization to view or manipulate this operational module.
      </p>
      <Link href="/dashboard" className="mt-6">
        <Button variant="outline" size="sm" className="gap-2 border-zinc-700">
          <ArrowLeft className="h-4 w-4" />
          Return to Dashboard
        </Button>
      </Link>
    </div>
  );
}
