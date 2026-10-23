import { create } from "zustand";

export interface SensorPoint {
  ts: string;
  val: number;
}

export interface SensorLiveReading {
  sensor_id: string;
  site_id: string;
  type: string;
  value: number;
  unit: string;
  ts: string;
  battery?: number;
  status?: string;
  lastUpdated: number;
}

export interface CVDetectionItem {
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  is_violation?: boolean;
}

export interface CVDetectionEvent {
  camera_id: string;
  site_id: string;
  ts: string;
  persons_count: number;
  compliant: boolean;
  missing_ppe: string[];
  equipment_counts?: Record<string, number>;
  machinery_hazards?: Array<{
    person_bbox: [number, number, number, number];
    machinery_bbox: [number, number, number, number];
    machinery_type: string;
    distance: number;
    overlapping?: boolean;
  }>;
  detections: CVDetectionItem[];
  snapshot_url?: string;
  detector?: string;
}

export interface LiveAlertEvent {
  alert_id: string;
  site_id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  reading_value?: number;
  ts: string;
}

export type ConnectionStatus = "connected" | "connecting" | "reconnecting" | "disconnected";

interface LiveState {
  connectionStatus: ConnectionStatus;
  isPaused: boolean;
  sensorLatest: Record<string, SensorLiveReading>;
  sensorHistory: Record<string, SensorPoint[]>;
  cameraStatus: Record<string, { status: string; fps: number; last_frame_at?: string }>;
  latestDetections: Record<string, CVDetectionEvent>;
  liveAlerts: LiveAlertEvent[];

  setConnectionStatus: (status: ConnectionStatus) => void;
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  applySensorUpdates: (updates: SensorLiveReading[]) => void;
  updateCameraStatus: (camera_id: string, status: string, fps: number) => void;
  updateCVDetection: (detection: CVDetectionEvent) => void;
  addLiveAlert: (alert: LiveAlertEvent) => void;
}

const MAX_HISTORY_POINTS = 30;
const MAX_LIVE_ALERTS = 10;

export const useLiveStore = create<LiveState>((set, get) => ({
  connectionStatus: "disconnected",
  isPaused: false,
  sensorLatest: {},
  sensorHistory: {},
  cameraStatus: {},
  latestDetections: {},
  liveAlerts: [],

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
  setPaused: (isPaused) => set({ isPaused }),

  applySensorUpdates: (updates) => {
    if (get().isPaused || updates.length === 0) return;

    set((state) => {
      const nextLatest = { ...state.sensorLatest };
      const nextHistory = { ...state.sensorHistory };
      const now = Date.now();

      for (const u of updates) {
        nextLatest[u.sensor_id] = { ...u, lastUpdated: now };

        const currentPoints = nextHistory[u.sensor_id] || [];
        const newPoint = { ts: u.ts, val: u.value };
        nextHistory[u.sensor_id] = [...currentPoints.slice(-(MAX_HISTORY_POINTS - 1)), newPoint];
      }

      return {
        sensorLatest: nextLatest,
        sensorHistory: nextHistory,
      };
    });
  },

  updateCameraStatus: (camera_id, status, fps) => {
    set((state) => ({
      cameraStatus: {
        ...state.cameraStatus,
        [camera_id]: { status, fps, last_frame_at: new Date().toISOString() },
      },
    }));
  },

  updateCVDetection: (detection) => {
    if (get().isPaused) return;
    set((state) => ({
      latestDetections: {
        ...state.latestDetections,
        [detection.camera_id]: detection,
      },
    }));
  },

  addLiveAlert: (alert) => {
    set((state) => {
      // De-duplicate if already in top
      if (state.liveAlerts.some((a) => a.alert_id === alert.alert_id)) {
        return state;
      }
      return {
        liveAlerts: [alert, ...state.liveAlerts].slice(0, MAX_LIVE_ALERTS),
      };
    });
  },
}));
