"""
BuildTrack device simulator.

  python -m simulator run      --config config.json   # stream sensors (MQTT + HTTP) and cameras (MJPEG)
  python -m simulator register --config config.json   # create these devices in BuildTrack, save their ids
  python -m simulator types                           # list supported sensor types
"""
import argparse
import getpass
import logging
import os
import signal
import sys
import threading
from typing import Dict
from .cameras import CameraFeed
from .library import VideoLibraryWatcher, library_feed, library_videos
from .config import load_config, save_config
from .profiles import PROFILES, supported_types
from .sensors import MqttPublisher, SensorScheduler, SensorStream
from .server import DeviceRegistry, serve

logger = logging.getLogger("simulator")


def build_sensors(cfg) -> Dict[str, SensorStream]:
    site_id = cfg["buildtrack"].get("site_id")
    sensors = {}
    for i, s in enumerate(cfg["sensors"]):
        sensors[s["name"]] = SensorStream(
            name=s["name"],
            sensor_type=s["type"],
            interval_seconds=s.get("interval_seconds", 2.0),
            seed=cfg["seed"] + i,  # distinct but reproducible per sensor
            topic=s.get("topic"),
            sensor_id=s.get("sensor_id"),
            site_id=s.get("site_id") or site_id,
            unit=s.get("unit"),
            overrides=s.get("overrides"),
        )
    return sensors


def build_cameras(cfg) -> Dict[str, CameraFeed]:
    return {
        c["name"]: CameraFeed(
            name=c["name"],
            source=c.get("source", "synthetic"),
            fps=c.get("fps", 10),
            width=c.get("width", 960),
            quality=c.get("quality", 80),
            label=c.get("label", True),
        )
        for c in cfg["cameras"]
    }


def cmd_run(args) -> int:
    cfg = load_config(args.config)
    if args.seed is not None:
        cfg["seed"] = args.seed
    host = args.host or cfg["server"]["host"]
    port = args.port or cfg["server"]["port"]

    sensors = build_sensors(cfg)
    cameras = build_cameras(cfg)
    library = library_videos(cfg)
    for name, path in library.items():
        cameras[name] = library_feed(cfg, name, path)
    if cfg["video_library"].get("_resolved_dir"):
        logger.info(f"Video library {cfg['video_library']['_resolved_dir']}: {len(library)} videos")
    publisher = None
    if cfg["mqtt"]["enabled"] and sensors:
        m = cfg["mqtt"]
        publisher = MqttPublisher(m["host"], m["port"], m.get("username"), m.get("password") or os.environ.get("MQTT_PASSWORD"))
        publisher.start()

    without_topic = [s.name for s in sensors.values() if not s.topic]
    if publisher and without_topic:
        logger.warning(
            f"No MQTT topic for {', '.join(without_topic)} (set buildtrack.site_id or run `register`); "
            "these sensors are HTTP-only"
        )

    scheduler = SensorScheduler(list(sensors.values()), publisher, args.labels or cfg.get("labels_csv"))
    scheduler.start()
    for cam in cameras.values():
        cam.start()

    registry = DeviceRegistry(sensors, cameras, publisher)
    httpd = serve(registry, host, port)
    watcher = None
    if cfg["video_library"].get("_resolved_dir"):
        watcher = VideoLibraryWatcher(cfg, registry, set(library))
        watcher.start()
    stop = threading.Event()

    def shutdown(*_):
        if not stop.is_set():
            stop.set()
            threading.Thread(target=httpd.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    logger.info(f"Serving {len(sensors)} sensors and {len(cameras)} cameras on http://{host}:{port}  (seed={cfg['seed']})")
    for cam in cameras.values():
        logger.info(f"  camera {cam.name}: http://{cfg['server']['advertise_host']}:{port}/cameras/{cam.name}.mjpg")
    for s in sensors.values():
        logger.info(f"  sensor {s.name} ({s.sensor_type}, every {s.interval}s): topic {s.topic or '-'}")
    try:
        httpd.serve_forever(poll_interval=0.5)
    finally:
        scheduler.stop()
        if watcher:
            watcher.stop_event.set()
        for cam in registry.camera_list():
            cam.stop()
        if publisher:
            publisher.stop()
        httpd.server_close()
        logger.info(f"Stopped. Published {scheduler.published} MQTT readings.")
    return 0


def cmd_register(args) -> int:
    from .buildtrack import BuildTrackError, register_devices

    cfg = load_config(args.config)
    if args.api:
        cfg["buildtrack"]["api"] = args.api
    password = args.password or os.environ.get("BUILDTRACK_PASSWORD") or getpass.getpass("BuildTrack password: ")
    try:
        register_devices(cfg, args.email, password, args.site)
    except BuildTrackError as e:
        logger.error(str(e))
        return 1
    save_config(cfg)
    logger.info(f"Saved device ids to {cfg['_path']}. Start streaming with: python -m simulator run --config {args.config}")
    return 0


def cmd_types(_args) -> int:
    for t in supported_types():
        p = PROFILES[t]
        print(f"{t:<12} unit={p.unit:<6} baseline={p.baseline:<6} anomaly_level={p.anomaly_level}")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="python -m simulator", description="BuildTrack IoT device simulator")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="stream sensor readings and camera feeds")
    run.add_argument("--config", default="config.json")
    run.add_argument("--host", help="bind address (default from config, 127.0.0.1)")
    run.add_argument("--port", type=int, help="HTTP port (default from config, 8090)")
    run.add_argument("--seed", type=int, help="override the RNG seed for a reproducible run")
    run.add_argument("--labels", help="CSV path for per-reading ground truth (injected anomalies)")
    run.set_defaults(func=cmd_run)

    reg = sub.add_parser("register", help="create the configured devices in BuildTrack")
    reg.add_argument("--config", default="config.json")
    reg.add_argument("--email", default=os.environ.get("BUILDTRACK_EMAIL", "admin@buildtrack.com"))
    reg.add_argument("--password", help="or set BUILDTRACK_PASSWORD; prompted if omitted")
    reg.add_argument("--site", help="BuildTrack site id (default: config, else the first site)")
    reg.add_argument("--api", help="BuildTrack API base URL (default from config)")
    reg.set_defaults(func=cmd_register)

    types = sub.add_parser("types", help="list supported sensor types")
    types.set_defaults(func=cmd_types)

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
