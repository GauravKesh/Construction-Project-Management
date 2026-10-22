"""
Sensor streams: generate readings on a schedule, publish them over MQTT and keep
recent history for the HTTP endpoints.
"""
import csv
import json
import logging
import threading
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Deque, Dict, List, Optional
from .profiles import SignalGenerator

logger = logging.getLogger("simulator.sensors")


class SensorStream:
    def __init__(
        self,
        name: str,
        sensor_type: str,
        interval_seconds: float = 2.0,
        seed: int = 0,
        topic: Optional[str] = None,
        sensor_id: Optional[str] = None,
        site_id: Optional[str] = None,
        unit: Optional[str] = None,
        overrides: Optional[Dict[str, float]] = None,
        history: int = 300,
    ):
        self.name = name
        self.sensor_type = sensor_type
        self.interval = max(0.1, float(interval_seconds))
        self.generator = SignalGenerator(sensor_type, seed=seed, overrides=overrides or {})
        self.unit = unit or self.generator.unit
        self.sensor_id = sensor_id or name
        self.site_id = site_id
        # BuildTrack convention: sites/{site_id}/sensors/{type}/{sensor_id}
        self.topic = topic or (f"sites/{site_id}/sensors/{sensor_type}/{self.sensor_id}" if site_id else None)
        self.history: Deque[dict] = deque(maxlen=history)
        self._subscribers: List[Callable[[dict], None]] = []
        self._lock = threading.Lock()

    def reading(self, ts: datetime) -> dict:
        value, anomaly, battery = self.generator.next(ts)
        return {
            "sensor_id": self.sensor_id,
            "site_id": self.site_id,
            "type": self.sensor_type,
            "value": value,
            "unit": self.unit,
            "ts": ts.isoformat().replace("+00:00", "Z"),
            "battery": battery,
            # Ground truth for evaluation; BuildTrack ignores unknown fields
            "injected_anomaly": anomaly,
        }

    def subscribe(self, callback: Callable[[dict], None]) -> Callable[[], None]:
        with self._lock:
            self._subscribers.append(callback)

        def unsubscribe():
            with self._lock:
                if callback in self._subscribers:
                    self._subscribers.remove(callback)

        return unsubscribe

    def emit(self, ts: datetime) -> dict:
        reading = self.reading(ts)
        with self._lock:
            self.history.append(reading)
            subscribers = list(self._subscribers)
        for cb in subscribers:
            try:
                cb(reading)
            except Exception:
                logger.exception("Sensor subscriber failed")
        return reading

    @property
    def latest(self) -> Optional[dict]:
        with self._lock:
            return self.history[-1] if self.history else None

    def describe(self) -> dict:
        return {
            "name": self.name,
            "type": self.sensor_type,
            "unit": self.unit,
            "interval_seconds": self.interval,
            "sensor_id": self.sensor_id,
            "site_id": self.site_id,
            "mqtt_topic": self.topic,
            "latest": self.latest,
        }


class MqttPublisher:
    """Thin wrapper around paho-mqtt; publishing is skipped (with a warning) when unavailable."""

    def __init__(self, host: str, port: int = 1883, username: Optional[str] = None, password: Optional[str] = None):
        self.host, self.port = host, port
        self.connected = False
        self._client = None
        try:
            import paho.mqtt.client as mqtt
        except ImportError:
            logger.warning("paho-mqtt is not installed; MQTT publishing disabled")
            return
        self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="buildtrack-device-simulator")
        if username:
            self._client.username_pw_set(username, password)
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.reconnect_delay_set(min_delay=1, max_delay=30)

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        self.connected = not reason_code.is_failure
        if self.connected:
            logger.info(f"Connected to MQTT broker {self.host}:{self.port}")
        else:
            logger.error(f"MQTT connection refused: {reason_code}")

    def _on_disconnect(self, client, userdata, flags, reason_code, properties=None):
        self.connected = False
        logger.warning(f"Disconnected from MQTT broker ({reason_code}); retrying")

    def start(self) -> None:
        if not self._client:
            return
        try:
            self._client.connect_async(self.host, self.port, keepalive=30)
            self._client.loop_start()
        except Exception as e:
            logger.error(f"Could not start MQTT client: {e}")

    def publish(self, topic: str, payload: dict) -> bool:
        if not (self._client and self.connected and topic):
            return False
        info = self._client.publish(topic, json.dumps(payload), qos=1)
        return info.rc == 0

    def stop(self) -> None:
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()


class SensorScheduler(threading.Thread):
    """Ticks every sensor on its own interval and fans readings out to MQTT and CSV."""

    def __init__(self, sensors: List[SensorStream], publisher: Optional[MqttPublisher], labels_path: Optional[str] = None):
        super().__init__(daemon=True, name="sensor-scheduler")
        self.sensors = sensors
        self.publisher = publisher
        self._stop = threading.Event()
        self.published = 0
        self._labels_file = None
        self._labels = None
        if labels_path:
            Path(labels_path).parent.mkdir(parents=True, exist_ok=True)
            self._labels_file = open(labels_path, "w", newline="")
            self._labels = csv.writer(self._labels_file)
            self._labels.writerow(["ts", "name", "sensor_id", "type", "value", "unit", "injected_anomaly", "published"])

    def run(self) -> None:
        import time

        next_due = {s.name: time.monotonic() for s in self.sensors}
        while not self._stop.is_set():
            now = time.monotonic()
            for s in self.sensors:
                if now >= next_due[s.name]:
                    next_due[s.name] = now + s.interval
                    reading = s.emit(datetime.now(timezone.utc))
                    ok = bool(self.publisher and s.topic and self.publisher.publish(s.topic, reading))
                    self.published += ok
                    if self._labels:
                        self._labels.writerow([
                            reading["ts"], s.name, s.sensor_id, s.sensor_type, reading["value"],
                            reading["unit"], int(reading["injected_anomaly"]), int(ok),
                        ])
            if self._labels_file:
                self._labels_file.flush()
            wait = min(next_due.values()) - time.monotonic() if next_due else 1.0
            self._stop.wait(max(0.05, min(wait, 1.0)))
        # Closed here, by the writing thread, so stop() never races a write
        if self._labels_file:
            self._labels_file.close()

    def stop(self) -> None:
        self._stop.set()
