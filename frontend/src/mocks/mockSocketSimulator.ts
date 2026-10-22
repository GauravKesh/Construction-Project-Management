import { useLiveStore } from "@/stores/liveStore";
import { toast } from "sonner";

class MockSocketSimulator {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  start(siteId: string) {
    if (this.isRunning) return;
    this.isRunning = true;
    useLiveStore.getState().setConnectionStatus("connected");

    // Seed mock sensors
    const initialSensors = [
      { sensor_id: "s-pm25-01", site_id: siteId, type: "pm25", value: 42.5, unit: "µg/m³", ts: new Date().toISOString(), battery: 94, status: "healthy", lastUpdated: Date.now() },
      { sensor_id: "s-pm10-01", site_id: siteId, type: "pm10", value: 68.2, unit: "µg/m³", ts: new Date().toISOString(), battery: 91, status: "healthy", lastUpdated: Date.now() },
      { sensor_id: "s-noise-01", site_id: siteId, type: "noise", value: 74.8, unit: "dB", ts: new Date().toISOString(), battery: 88, status: "healthy", lastUpdated: Date.now() },
      { sensor_id: "s-temp-01", site_id: siteId, type: "temperature", value: 29.4, unit: "°C", ts: new Date().toISOString(), battery: 99, status: "healthy", lastUpdated: Date.now() },
      { sensor_id: "s-hum-01", site_id: siteId, type: "humidity", value: 62.0, unit: "%", ts: new Date().toISOString(), battery: 99, status: "healthy", lastUpdated: Date.now() },
      { sensor_id: "s-gas-01", site_id: siteId, type: "gas_co", value: 1.4, unit: "ppm", ts: new Date().toISOString(), battery: 85, status: "healthy", lastUpdated: Date.now() },
      { sensor_id: "s-vib-01", site_id: siteId, type: "vibration", value: 0.12, unit: "mm/s", ts: new Date().toISOString(), battery: 92, status: "healthy", lastUpdated: Date.now() },
      { sensor_id: "s-wind-01", site_id: siteId, type: "wind_speed", value: 14.5, unit: "km/h", ts: new Date().toISOString(), battery: 78, status: "healthy", lastUpdated: Date.now() },
    ];
    useLiveStore.getState().applySensorUpdates(initialSensors);

    let tick = 0;
    this.timer = setInterval(() => {
      tick++;
      const nowIso = new Date().toISOString();

      // Random jitter for sensors
      const updates = [
        {
          sensor_id: "s-pm25-01",
          site_id: siteId,
          type: "pm25",
          value: Math.max(15, Math.min(120, +(40 + Math.sin(tick / 5) * 20 + (Math.random() * 8 - 4)).toFixed(1))),
          unit: "µg/m³",
          ts: nowIso,
          battery: 94,
          status: "healthy",
          lastUpdated: Date.now(),
        },
        {
          sensor_id: "s-noise-01",
          site_id: siteId,
          type: "noise",
          value: Math.max(50, Math.min(105, +(72 + Math.cos(tick / 4) * 12 + (Math.random() * 6 - 3)).toFixed(1))),
          unit: "dB",
          ts: nowIso,
          battery: 88,
          status: "healthy",
          lastUpdated: Date.now(),
        },
        {
          sensor_id: "s-temp-01",
          site_id: siteId,
          type: "temperature",
          value: +(29 + Math.sin(tick / 10) * 2 + (Math.random() * 0.4 - 0.2)).toFixed(1),
          unit: "°C",
          ts: nowIso,
          battery: 99,
          status: "healthy",
          lastUpdated: Date.now(),
        },
        {
          sensor_id: "s-wind-01",
          site_id: siteId,
          type: "wind_speed",
          value: Math.max(2, +(14 + Math.sin(tick / 3) * 6 + (Math.random() * 4 - 2)).toFixed(1)),
          unit: "km/h",
          ts: nowIso,
          battery: 78,
          status: "healthy",
          lastUpdated: Date.now(),
        },
      ];
      useLiveStore.getState().applySensorUpdates(updates);

      // Periodic CV detection update (every 4 seconds)
      if (tick % 4 === 0) {
        const isViolation = Math.random() < 0.25;
        useLiveStore.getState().updateCVDetection({
          camera_id: "cam-main-gate",
          site_id: siteId,
          ts: nowIso,
          persons_count: 3,
          compliant: !isViolation,
          missing_ppe: isViolation ? ["hardhat"] : [],
          detections: [
            { class_name: "person", confidence: 0.94, bbox: [0.2, 0.15, 0.85, 0.35], is_violation: false },
            { class_name: isViolation ? "no_hardhat" : "hardhat", confidence: 0.91, bbox: [0.2, 0.2, 0.32, 0.3], is_violation: isViolation },
            { class_name: "hi_vis_vest", confidence: 0.88, bbox: [0.35, 0.16, 0.6, 0.34], is_violation: false },
            { class_name: "person", confidence: 0.96, bbox: [0.25, 0.5, 0.9, 0.72], is_violation: false },
            { class_name: "hardhat", confidence: 0.92, bbox: [0.25, 0.55, 0.38, 0.67], is_violation: false },
            { class_name: "hi_vis_vest", confidence: 0.89, bbox: [0.4, 0.52, 0.68, 0.7], is_violation: false },
          ],
        });

        useLiveStore.getState().updateCameraStatus("cam-main-gate", "streaming", 24);
        useLiveStore.getState().updateCameraStatus("cam-crane-01", "streaming", 25);
        useLiveStore.getState().updateCameraStatus("cam-excavation", "streaming", 20);
        useLiveStore.getState().updateCameraStatus("cam-perimeter", "streaming", 15);
      }

      // Occasional alert injection (every 25 seconds)
      if (tick % 25 === 0) {
        const mockAlert = {
          alert_id: `alt-mock-${Date.now()}`,
          site_id: siteId,
          severity: (Math.random() > 0.5 ? "warning" : "critical") as "warning" | "critical",
          message: `Threshold breached: Noise level ${Math.floor(85 + Math.random() * 10)} dB at Zone A`,
          reading_value: 88.5,
          ts: nowIso,
        };
        useLiveStore.getState().addLiveAlert(mockAlert);
        toast.warning(mockAlert.message, {
          description: `Severity: ${mockAlert.severity.toUpperCase()}`,
        });
      }
    }, 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    useLiveStore.getState().setConnectionStatus("disconnected");
  }
}

export const mockSocketSimulator = new MockSocketSimulator();
