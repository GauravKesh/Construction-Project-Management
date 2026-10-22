"""Configuration file loading (JSON, so no extra dependency is needed)."""
import json
from pathlib import Path
from typing import Any, Dict

DEFAULTS: Dict[str, Any] = {
    "server": {"host": "127.0.0.1", "port": 8090, "advertise_host": "localhost"},
    "mqtt": {"enabled": True, "host": "localhost", "port": 1883, "username": None, "password": None},
    "buildtrack": {"api": "http://localhost:8000", "site_id": None},
    "seed": 2026,
    "labels_csv": None,
    # Every video file in this folder becomes a camera feed (named after the file).
    # The running server rescans it, so dropping in new videos adds cameras.
    "video_library": {
        "dir": None,
        "extensions": [".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm"],
        "rescan_seconds": 15,
        "fps": 10,
        "width": 960,
        "registered": {},
    },
    "sensors": [],
    "cameras": [],
}


def load_config(path: str) -> Dict[str, Any]:
    cfg_path = Path(path)
    data = json.loads(cfg_path.read_text())
    cfg = {**DEFAULTS, **data}
    for section in ("server", "mqtt", "buildtrack", "video_library"):
        cfg[section] = {**DEFAULTS[section], **(data.get(section) or {})}

    names = set()
    for kind in ("sensors", "cameras"):
        for dev in cfg[kind]:
            if "name" not in dev:
                raise ValueError(f"Every entry in '{kind}' needs a name")
            if dev["name"] in names:
                raise ValueError(f"Duplicate device name '{dev['name']}'")
            names.add(dev["name"])
    for dev in cfg["cameras"]:
        src = dev.get("source", "synthetic")
        # Relative video paths are resolved against the config file's folder
        if not src.startswith("synthetic") and not Path(src).is_absolute():
            dev["source"] = str((cfg_path.parent / src).resolve())
    lib_dir = cfg["video_library"].get("dir")
    if lib_dir and not Path(lib_dir).is_absolute():
        cfg["video_library"]["_resolved_dir"] = str((cfg_path.parent / lib_dir).resolve())
    elif lib_dir:
        cfg["video_library"]["_resolved_dir"] = lib_dir
    cfg["_path"] = str(cfg_path.resolve())
    return cfg


def save_config(cfg: Dict[str, Any]) -> None:
    """Write back (e.g. after `register` filled in BuildTrack ids), keeping relative video paths readable."""
    path = Path(cfg["_path"])
    out = {k: v for k, v in cfg.items() if not k.startswith("_")}
    out["video_library"] = {k: v for k, v in cfg["video_library"].items() if not k.startswith("_")}
    for dev in out["cameras"]:
        src = dev.get("source", "")
        try:
            dev["source"] = str(Path(src).relative_to(path.parent)) if Path(src).is_absolute() else src
        except ValueError:
            try:
                import os

                dev["source"] = os.path.relpath(src, path.parent)
            except ValueError:
                pass
    path.write_text(json.dumps(out, indent=2) + "\n")
