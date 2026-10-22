"use client";

import React, { useState } from "react";
import { User, Key } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);

  const [fullName, setFullName] = useState(user?.full_name || "Gaurav Sharma");
  const [phone, setPhone] = useState("+91 98765 43210");
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Profile credentials updated successfully");
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPass || !newPass) {
      toast.error("Please enter current and new passwords");
      return;
    }
    toast.success("Password changed successfully");
    setCurrentPass("");
    setNewPass("");
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Operator Profile & Security"
        description="Manage your authorized credentials, personal notification channels, and session security."
      />

      {/* Operator Card */}
      <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-zinc-950 font-black text-2xl uppercase shadow-lg shadow-amber-500/20">
          {fullName.charAt(0)}
        </div>
        <div className="space-y-1 text-center sm:text-left flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{fullName}</h2>
            <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/40 text-[10px] font-mono uppercase self-center sm:self-auto">
              {user?.role?.replace("_", " ") || "Admin"}
            </Badge>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 font-mono">{user?.email || "admin@buildtrack.com"}</p>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block pt-1 font-mono">
            ● Active Session • Multi-Factor Authentication Enforced
          </span>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal Details Form */}
        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <User className="h-4 w-4 text-amber-500" />
            Personal Contact Details
          </h3>
          <form onSubmit={handleUpdateProfile} className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Full Name</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Email Address</label>
              <Input
                value={user?.email || "admin@buildtrack.com"}
                disabled
                className="bg-zinc-100 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 opacity-70 font-mono text-zinc-700 dark:text-zinc-300"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Emergency Phone</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 font-mono text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <Button type="submit" variant="amber" size="sm" className="font-bold w-full mt-2">
              Save Contact Updates
            </Button>
          </form>
        </Card>

        {/* Change Password Form */}
        <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <Key className="h-4 w-4 text-amber-500" />
            Security & Password Change
          </h3>
          <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">Current Password</label>
              <Input
                type="password"
                placeholder="••••••••••••"
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
                className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-zinc-700 dark:text-zinc-300">New Password</label>
              <Input
                type="password"
                placeholder="••••••••••••"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <Button type="submit" variant="outline" size="sm" className="font-semibold w-full mt-2 border-zinc-300 dark:border-zinc-700">
              Update Security Password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
