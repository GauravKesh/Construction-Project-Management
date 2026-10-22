import { describe, it, expect, beforeEach } from "vitest";
import { useLiveStore } from "@/stores/liveStore";

describe("useLiveStore", () => {
  beforeEach(() => {
    useLiveStore.setState({
      connectionStatus: "disconnected",
      isPaused: false,
      sensorLatest: {},
      sensorHistory: {},
      cameraStatus: {},
      latestDetections: {},
      liveAlerts: [],
    });
  });

  it("updates connection status correctly", () => {
    useLiveStore.getState().setConnectionStatus("connected");
    expect(useLiveStore.getState().connectionStatus).toBe("connected");
  });

  it("applies sensor updates and maintains history ring buffer", () => {
    const reading = {
      sensor_id: "s-pm25-01",
      site_id: "site-01",
      type: "pm25",
      value: 45.5,
      unit: "µg/m³",
      ts: "2026-10-22T10:00:00Z",
      lastUpdated: Date.now(),
    };

    useLiveStore.getState().applySensorUpdates([reading]);

    expect(useLiveStore.getState().sensorLatest["s-pm25-01"].value).toBe(45.5);
    expect(useLiveStore.getState().sensorHistory["s-pm25-01"].length).toBe(1);
    expect(useLiveStore.getState().sensorHistory["s-pm25-01"][0].val).toBe(45.5);
  });

  it("ignores sensor updates when paused", () => {
    useLiveStore.getState().setPaused(true);

    const reading = {
      sensor_id: "s-pm25-01",
      site_id: "site-01",
      type: "pm25",
      value: 99.9,
      unit: "µg/m³",
      ts: "2026-10-22T10:00:00Z",
      lastUpdated: Date.now(),
    };

    useLiveStore.getState().applySensorUpdates([reading]);
    expect(useLiveStore.getState().sensorLatest["s-pm25-01"]).toBeUndefined();
  });

  it("adds and deduplicates live alerts", () => {
    const alert1 = {
      alert_id: "alt-101",
      site_id: "site-01",
      severity: "critical" as const,
      message: "Exceeded dust limit",
      ts: "2026-10-22T10:00:00Z",
    };

    useLiveStore.getState().addLiveAlert(alert1);
    expect(useLiveStore.getState().liveAlerts.length).toBe(1);

    // Duplicate add
    useLiveStore.getState().addLiveAlert(alert1);
    expect(useLiveStore.getState().liveAlerts.length).toBe(1);
  });
});
