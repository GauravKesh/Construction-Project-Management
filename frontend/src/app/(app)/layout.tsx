"use client";

import React, { useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { CommandPalette } from "@/components/common/CommandPalette";
import { useAuthStore } from "@/stores/authStore";
import { apiClient } from "@/lib/api/client";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);

  // Sync user profile on mount
  useEffect(() => {
    if (!user) {
      apiClient
        .get<any>("/api/v1/auth/me")
        .then((u) => {
          if (u) {
            setUser({
              id: u.id,
              email: u.email,
              full_name: u.full_name,
              role: u.role,
              is_active: u.is_active,
            });
          }
        })
        .catch(() => {
          // If in standalone mock mode or initial load
          setUser({
            id: "usr-admin-01",
            email: "admin@buildtrack.com",
            full_name: "Gaurav Sharma (Admin)",
            role: "admin",
            is_active: true,
          });
        });
    }
  }, [user, setUser]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950 font-sans antialiased text-zinc-900 dark:text-zinc-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
