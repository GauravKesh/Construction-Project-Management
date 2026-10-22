"""
Video library: every video file in a folder becomes a camera feed, and the folder is
rescanned while running so added or removed videos start/stop streaming.
"""
import logging
import threading
from typing import Dict
from .cameras import CameraFeed, discover_videos

logger = logging.getLogger("simulator.library")


def library_feed(cfg, name: str, path: str) -> CameraFeed:
    lib = cfg["video_library"]
    return CameraFeed(name=name, source=path, fps=lib.get("fps", 10), width=lib.get("width", 960))


def library_videos(cfg) -> Dict[str, str]:
    lib = cfg["video_library"]
    if not lib.get("_resolved_dir"):
        return {}
    explicit = {c["name"] for c in cfg["cameras"]}
    return {n: p for n, p in discover_videos(lib["_resolved_dir"], lib["extensions"]).items() if n not in explicit}


class VideoLibraryWatcher(threading.Thread):
    """Rescans the video folder so added or removed videos start/stop streaming without a restart."""

    def __init__(self, cfg, registry, managed: set):
        super().__init__(daemon=True, name="video-library-watcher")
        self.cfg, self.registry, self.managed = cfg, registry, managed
        self.stop_event = threading.Event()

    def run(self) -> None:
        interval = max(2, int(self.cfg["video_library"].get("rescan_seconds", 15)))
        while not self.stop_event.wait(interval):
            try:
                current = library_videos(self.cfg)
                for name in sorted(set(current) - self.managed):
                    feed = library_feed(self.cfg, name, current[name])
                    feed.start()
                    self.registry.add_camera(feed)
                    self.managed.add(name)
                    logger.info(f"New video found, streaming camera {name}: /cameras/{name}.mjpg")
                for name in sorted(self.managed - set(current)):
                    feed = self.registry.remove_camera(name)
                    if feed:
                        feed.stop()
                    self.managed.discard(name)
                    logger.info(f"Video removed, stopped camera {name}")
            except Exception:
                logger.exception("Video library rescan failed")
