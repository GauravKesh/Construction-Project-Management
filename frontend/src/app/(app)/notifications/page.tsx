"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Send } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api/client";
import { normalizeList } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const userId = useAuthStore((st) => st.user?.id);
  const [pushEnabled, setPushEnabled] = useState(false);

  const { data: notificationsData } = useQuery<any>({
    queryKey: ["notifications"],
    queryFn: () => apiClient.get<any>("/api/v1/notifications", { params: { page_size: 100 } }),
  });
  const notifications = normalizeList<any>(notificationsData);

  const prefsKey = ["notification-preferences", userId];
  const { data: prefs } = useQuery<any>({
    queryKey: prefsKey,
    queryFn: () => apiClient.get<any>(`/api/v1/users/${userId}/notification-preferences`),
    enabled: Boolean(userId),
  });
  const updatePrefs = useMutation({
    mutationFn: (patch: Record<string, boolean>) =>
      apiClient.put<any>(`/api/v1/users/${userId}/notification-preferences`, patch),
    onSuccess: (data) => queryClient.setQueryData(prefsKey, data),
    onError: (err: any) => toast.error(err.message || "Failed to save preference"),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiClient.post<any>("/api/v1/notifications/read-all"),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(res?.message || "All notifications marked as read");
    },
  });

  const sendTest = useMutation({
    mutationFn: () => apiClient.post<any>("/api/v1/notifications/test", undefined, { params: { channel: "console" } }),
    onSuccess: (res) => toast.info(res?.message || "Test notification dispatched"),
    onError: (err: any) => toast.error(err.message || "Test dispatch failed"),
  });

  const handleEnablePush = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setPushEnabled(true);
        toast.success("Web Push Notifications authorized by browser");
      } else {
        toast.warning("Web Push permission was dismissed or denied");
      }
    } else {
      toast.warning("This browser does not support notifications");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Center & Alert Dispatch"
        description="Configure desktop push notifications, multi-channel dispatch routing, and review recent broadcast logs."
      >
        <Button variant="outline" size="sm" onClick={() => sendTest.mutate()} className="gap-1.5 border-zinc-700">
          <Send className="h-3.5 w-3.5 text-amber-500" />
          Test Dispatch (console)
        </Button>
        <Button variant="amber" size="sm" onClick={() => markAllRead.mutate()} className="font-bold">
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          Mark All Read
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Notifications List */}
        <div className="lg:col-span-2 space-y-3">
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-3">
            <h3 className="text-xs font-medium capitalize text-zinc-500 dark:text-zinc-400">
              Notification Stream ({notifications.length})
            </h3>

            <div className="space-y-2">
              {notifications.length === 0 && <p className="text-xs text-zinc-500">No notifications.</p>}
              {notifications.map((n: any) => (
                <div
                  key={n.id}
                  className={`p-3.5 rounded-xl border text-xs space-y-1 transition-all ${
                    n.read_at
                      ? "border-zinc-200 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-950/40 opacity-70"
                      : "border-amber-500/40 bg-amber-500/5 dark:bg-zinc-950"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">{n.title}</span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">{n.body}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right: Preferences */}
        <div className="space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-5 text-xs">
            <h3 className="text-xs font-medium capitalize text-zinc-500 dark:text-zinc-400">
              Dispatch Preferences
            </h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">Web Push Notifications</span>
                  <span className="text-[11px] text-zinc-500">Alerts even when tab is backgrounded</span>
                </div>
                {pushEnabled ? (
                  <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                    Enabled
                  </Badge>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleEnablePush} className="h-7 text-xs border-zinc-300 dark:border-zinc-700">
                    Enable
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <div>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">Email Safety Digest</span>
                  <span className="text-[11px] text-zinc-500">Daily summary of incidents & violations</span>
                </div>
                <Switch
                  checked={Boolean(prefs?.email_enabled)}
                  disabled={!prefs || updatePrefs.isPending}
                  onCheckedChange={(v) => updatePrefs.mutate({ email_enabled: v })}
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <div>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">SMS Critical Broadcast</span>
                  <span className="text-[11px] text-zinc-500">High hazard evacuation alerts</span>
                </div>
                <Switch
                  checked={Boolean(prefs?.sms_enabled)}
                  disabled={!prefs || updatePrefs.isPending}
                  onCheckedChange={(v) => updatePrefs.mutate({ sms_enabled: v })}
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
