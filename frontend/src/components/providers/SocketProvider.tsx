"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { env } from "@/env";
import { useLiveStore, SensorLiveReading, CVDetectionEvent, LiveAlertEvent } from "@/stores/liveStore";
import { useProjectStore } from "@/stores/projectStore";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { mockSocketSimulator } from "@/mocks/mockSocketSimulator";

interface SocketContextValue {
  socket: Socket | null;
  ackAlert: (alertId: string) => void;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  ackAlert: () => {},
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  // Exposed through context; a ref read during render would always hand consumers null
  const [socket, setSocket] = useState<Socket | null>(null);
  const activeSiteId = useProjectStore((s) => s.activeSiteId);
  const queryClient = useQueryClient();

  useEffect(() => {
    // If mock mode is explicitly requested, run simulator
    if (env.NEXT_PUBLIC_USE_MOCKS) {
      mockSocketSimulator.start(activeSiteId || "site-default");
      return () => {
        mockSocketSimulator.stop();
      };
    }

    let isMounted = true;
    useLiveStore.getState().setConnectionStatus("connecting");

    // Fetch socket token from BFF
    fetch("/api/auth/socket-token")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to get socket token");
        }
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        const token = data.token;
        const wsUrl = env.NEXT_PUBLIC_WS_URL || (typeof window !== "undefined" ? window.location.origin : "");

        const socket = io(`${wsUrl}/live`, {
          path: "/socket.io",
          auth: { token },
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          timeout: 10000,
        });

        socketRef.current = socket;
        setSocket(socket);

        socket.on("connect", () => {
          useLiveStore.getState().setConnectionStatus("connected");
          if (activeSiteId) {
            socket.emit("subscribe", { site_id: activeSiteId });
          }
        });

        socket.on("reconnect_attempt", () => {
          useLiveStore.getState().setConnectionStatus("reconnecting");
        });

        socket.on("disconnect", () => {
          useLiveStore.getState().setConnectionStatus("disconnected");
        });

        socket.on("connect_error", (err) => {
          console.warn("Socket connection error:", err.message);
          // Never substitute simulated data for a failed connection: the UI shows "disconnected"
          useLiveStore.getState().setConnectionStatus("disconnected");
        });

        // Event listeners
        socket.on("sensor:update", (event: { data: SensorLiveReading | SensorLiveReading[] }) => {
          const payload = event?.data;
          if (Array.isArray(payload)) {
            useLiveStore.getState().applySensorUpdates(payload);
          } else if (payload) {
            useLiveStore.getState().applySensorUpdates([payload]);
          }
        });

        socket.on("alert:new", (event: { data: LiveAlertEvent }) => {
          const alert = event?.data;
          if (alert) {
            useLiveStore.getState().addLiveAlert(alert);
            queryClient.invalidateQueries({ queryKey: ["alerts"] });
            toast.warning(alert.message, {
              description: `New ${alert.severity?.toUpperCase()} alert triggered`,
            });
          }
        });

        socket.on("alert:updated", () => {
          queryClient.invalidateQueries({ queryKey: ["alerts"] });
        });

        socket.on("incident:new", () => {
          queryClient.invalidateQueries({ queryKey: ["incidents"] });
          toast.error("New safety incident reported!");
        });

        socket.on("incident:updated", () => {
          queryClient.invalidateQueries({ queryKey: ["incidents"] });
        });

        socket.on("cv:detection", (event: { data: CVDetectionEvent }) => {
          if (event?.data) {
            useLiveStore.getState().updateCVDetection(event.data);
          }
        });

        socket.on("camera:status", (event: { data: { camera_id: string; status: string; fps: number } }) => {
          if (event?.data) {
            useLiveStore.getState().updateCameraStatus(event.data.camera_id, event.data.status, event.data.fps);
          }
        });

        socket.on("notification:new", (event: { data: { title: string; message: string } }) => {
          if (event?.data) {
            toast.info(event.data.title, { description: event.data.message });
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }
        });
      })
      .catch((err) => {
        console.warn("Socket authentication failed; live updates disabled:", err);
        if (isMounted) useLiveStore.getState().setConnectionStatus("disconnected");
      });

    return () => {
      isMounted = false;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
      mockSocketSimulator.stop();
    };
  }, [activeSiteId, queryClient]);

  // When active site changes, subscribe to room
  useEffect(() => {
    if (socketRef.current?.connected && activeSiteId) {
      socketRef.current.emit("subscribe", { site_id: activeSiteId });
    }
  }, [activeSiteId]);

  const ackAlert = (alertId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("ack_alert", { alert_id: alertId });
    }
  };

  return (
    <SocketContext.Provider value={{ socket, ackAlert }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
