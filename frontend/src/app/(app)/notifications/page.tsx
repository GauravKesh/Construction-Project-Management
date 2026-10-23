"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Send,
  Volume2,
  VolumeX,
  Play,
  AlertTriangle,
  ShieldAlert,
  Info,
  Check,
  Radio,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { apiClient } from "@/lib/api/client";
import { normalizeList } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { soundManager, playNotificationSound, NotificationSoundType } from "@/lib/audio/soundEffects";
import { toast } from "sonner";

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const userId = useAuthStore((st) => st.user?.id);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(0.7);
  const [playingType, setPlayingType] = useState<string | null>(null);

  useEffect(() => {
    setSoundEnabled(soundManager.isEnabled());
    setSoundVolume(soundManager.getVolume());

    const handleAudioChange = () => {
      setSoundEnabled(soundManager.isEnabled());
      setSoundVolume(soundManager.getVolume());
    };
    window.addEventListener("buildtrack:audio_settings_changed", handleAudioChange);
    return () => window.removeEventListener("buildtrack:audio_settings_changed", handleAudioChange);
  }, []);

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
      playNotificationSound("success");
      toast.success(res?.message || "All notifications marked as read");
    },
  });

  const sendTest = useMutation({
    mutationFn: () => apiClient.post<any>("/api/v1/notifications/test", undefined, { params: { channel: "console" } }),
    onSuccess: (res) => {
      playNotificationSound("info");
      toast.info(res?.message || "Test notification dispatched");
    },
    onError: (err: any) => {
      playNotificationSound("critical");
      toast.error(err.message || "Test dispatch failed");
    },
  });

  const handleToggleSound = (checked: boolean) => {
    soundManager.setEnabled(checked);
    setSoundEnabled(checked);
    if (checked) {
      playNotificationSound("info", true);
      toast.success("Notification audio chimes enabled");
    } else {
      toast.info("Notification audio chimes muted");
    }
  };

  const handleVolumeChange = (vals: number[]) => {
    const val = vals[0] / 100;
    soundManager.setVolume(val);
    setSoundVolume(val);
  };

  const handlePreviewSound = (type: NotificationSoundType) => {
    setPlayingType(type);
    playNotificationSound(type, true); // Force play even if muted so user can audition
    setTimeout(() => setPlayingType(null), 800);
  };

  const handleEnablePush = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setPushEnabled(true);
        playNotificationSound("success");
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
        description="Configure desktop push notifications, multi-channel dispatch routing, and distinctive auditory alert profiles."
      >
        <Button variant="outline" size="sm" onClick={() => sendTest.mutate()} className="gap-1.5 border-zinc-700">
          <Send className="h-3.5 w-3.5 text-amber-500" />
          Test Dispatch
        </Button>
        <Button variant="amber" size="sm" onClick={() => markAllRead.mutate()} className="font-bold">
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          Mark All Read
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Notifications List */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Notification Stream ({notifications.length})
              </h3>
              <span className="text-[11px] text-zinc-400 font-mono">Real-time socket synced</span>
            </div>

            <div className="space-y-2">
              {notifications.length === 0 && (
                <div className="py-12 text-center text-xs text-zinc-500">
                  No notifications recorded for this session.
                </div>
              )}
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

        {/* Right: Sound Profiles & Dispatch Preferences */}
        <div className="space-y-4">
          {/* Distinct Auditory Alert Profiles Card */}
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                  {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-red-400" />}
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                    Auditory Alert Profiles
                  </h3>
                  <p className="text-[11px] text-zinc-500">Distinct sound chimes per notification type</p>
                </div>
              </div>
              <Switch checked={soundEnabled} onCheckedChange={handleToggleSound} />
            </div>

            {/* Volume Slider */}
            <div className="space-y-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-600 dark:text-zinc-300">Master Sound Volume</span>
                <span className="font-mono text-amber-500 font-bold">{Math.round(soundVolume * 100)}%</span>
              </div>
              <Slider
                value={[Math.round(soundVolume * 100)]}
                max={100}
                min={5}
                step={5}
                disabled={!soundEnabled}
                onValueChange={handleVolumeChange}
                className="py-1"
              />
            </div>

            {/* Individual Sound Profiles with Audition / Preview Buttons */}
            <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold block">
                Sound Signatures (Click to Audition)
              </span>

              {/* 1. Critical Hazard Alarm */}
              <div className="p-2.5 rounded-lg border border-red-500/20 bg-red-500/5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 text-[11px]">
                      Critical Hazard / Emergency
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    Urgent 880Hz/660Hz rapid pulsating siren
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreviewSound("critical")}
                  className={`h-7 px-2.5 text-[11px] gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10 cursor-pointer ${
                    playingType === "critical" ? "ring-2 ring-red-500" : ""
                  }`}
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>Play</span>
                </Button>
              </div>

              {/* 2. Warning / PPE Violation Chime */}
              <div className="p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 text-[11px]">
                      Warning / PPE Violation
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    Sharp 440Hz → 587Hz cautionary double chime
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreviewSound("warning")}
                  className={`h-7 px-2.5 text-[11px] gap-1 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 cursor-pointer ${
                    playingType === "warning" ? "ring-2 ring-amber-500" : ""
                  }`}
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>Play</span>
                </Button>
              </div>

              {/* 3. General Information Ping */}
              <div className="p-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 text-blue-500" />
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 text-[11px]">
                      General Information
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    Gentle 523Hz modern droplet ping
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreviewSound("info")}
                  className={`h-7 px-2.5 text-[11px] gap-1 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 cursor-pointer ${
                    playingType === "info" ? "ring-2 ring-blue-500" : ""
                  }`}
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>Play</span>
                </Button>
              </div>

              {/* 4. Success / Approval Chord */}
              <div className="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 text-[11px]">
                      Success & Completed Tasks
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    Ascending C5-E5-G5 major triad chord
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreviewSound("success")}
                  className={`h-7 px-2.5 text-[11px] gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 cursor-pointer ${
                    playingType === "success" ? "ring-2 ring-emerald-500" : ""
                  }`}
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>Play</span>
                </Button>
              </div>
            </div>
          </Card>

          {/* Dispatch Preferences Card */}
          <Card className="border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4 text-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Dispatch Channels
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
