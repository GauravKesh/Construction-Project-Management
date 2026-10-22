"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCircle2,
  Send,
  Smartphone,
  Mail,
  Sliders,
  ShieldAlert,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);

  const [notifications, setNotifications] = useState([
    {
      id: "n1",
      title: "Critical Acoustic Threshold Breached",
      message: "Noise sensor at Zone B recorded 84.1 dB exceeding environmental limit.",
      read: false,
      ts: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    },
    {
      id: "n2",
      title: "PPE Violation Flagged on North Gate CCTV",
      message: "Worker detected without mandatory safety helmet in vehicle pathway.",
      read: false,
      ts: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    },
    {
      id: "n3",
      title: "System Ready Health Check Verified",
      message: "All 6 backend microservices and databases communicating with sub-second latency.",
      read: true,
      ts: new Date(Date.now() - 1000 * 3600 * 4).toISOString(),
    },
  ]);

  const handleMarkAllRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
    toast.success("All notifications marked as read");
  };

  const handleSendTest = () => {
    const testItem = {
      id: `n-${Date.now()}`,
      title: "Test In-App Notification Push",
      message: "BuildTrack Web Push & WebSocket signaling channel verified operational.",
      read: false,
      ts: new Date().toISOString(),
    };
    setNotifications([testItem, ...notifications]);
    toast.info(testItem.title, { description: testItem.message });
  };

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
      toast.info("Browser notifications simulated");
      setPushEnabled(true);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Center & Alert Dispatch"
        description="Configure desktop push notifications, multi-channel dispatch routing, and review recent broadcast logs."
      >
        <Button variant="outline" size="sm" onClick={handleSendTest} className="gap-1.5 border-zinc-700">
          <Send className="h-3.5 w-3.5 text-amber-500" />
          Send Test Notification
        </Button>
        <Button variant="amber" size="sm" onClick={handleMarkAllRead} className="font-bold">
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          Mark All Read
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Notifications List */}
        <div className="lg:col-span-2 space-y-3">
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Notification Stream ({notifications.length})
            </h3>

            <div className="space-y-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3.5 rounded-xl border text-xs space-y-1 transition-all ${
                    n.read
                      ? "border-zinc-200 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-950/40 opacity-70"
                      : "border-amber-500/40 bg-amber-500/5 dark:bg-zinc-950"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">{n.title}</span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      {new Date(n.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-zinc-600 dark:text-zinc-400 text-[11px]">{n.message}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right: Preferences */}
        <div className="space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-5 text-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
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
                <Switch checked={emailAlerts} onCheckedChange={setEmailAlerts} />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <div>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 block">SMS Critical Broadcast</span>
                  <span className="text-[11px] text-zinc-500">High hazard evacuation alerts</span>
                </div>
                <Switch checked={smsAlerts} onCheckedChange={setSmsAlerts} />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
