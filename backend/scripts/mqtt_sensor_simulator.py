import argparse
import asyncio
import csv
import json
import logging
import random
import signal
import sys
from datetime import datetime, timezone
import aiomqtt
from sqlalchemy import select
from app.core.config import settings
from app.core.logging import setup_logging
from app.db.models.sensor import Sensor
from app.db.models.project import Site
from app.db.postgres import AsyncSessionLocal

logger = logging.getLogger("mqtt_simulator")


async def get_site_and_sensors():
    async with AsyncSessionLocal() as session:
        site_res = await session.execute(select(Site).limit(1))
        site = site_res.scalar_one_or_none()

        sensor_res = await session.execute(select(Sensor).where(Sensor.status == "active"))
        sensors = sensor_res.scalars().all()
        return site, sensors


async def run_simulator(
    interval: float = 2.0,
    spike_chance: float = 0.2,
    seed: int = 2026,
    labels_out: str = None,
    max_cycles: int = None,
):
    """
    Publishes synthetic telemetry. Every published reading is a ground-truth sample:
    with --labels-out, one CSV row per reading records whether a spike was injected,
    so alert precision/recall and detection delay can be computed afterwards.

    Spike values are chosen to exceed the seeded rule thresholds, so these labels test
    the pipeline end to end; they are not an independent benchmark of the rules.
    """
    setup_logging(settings.LOG_LEVEL)
    logger.info(f"Initializing IoT Sensor MQTT Simulator (seed={seed})...")
    rng = random.Random(seed)

    site, sensors = await get_site_and_sensors()
    if not site or not sensors:
        logger.error("No site or sensors found in database. Please run 'python -m app.cli seed' first.")
        sys.exit(1)

    site_id = str(site.id)
    logger.info(f"Loaded site '{site.name}' ({site_id}) with {len(sensors)} active sensors.")

    running = True
    labels_file = open(labels_out, "w", newline="") if labels_out else None
    labels = csv.writer(labels_file) if labels_file else None
    if labels:
        labels.writerow(["ts", "sensor_id", "sensor_code", "type", "value", "unit", "injected_spike", "seed"])

    def _sig_handler():
        nonlocal running
        logger.info("Stopping MQTT simulator...")
        running = False

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _sig_handler)
        except (NotImplementedError, RuntimeError):
            pass

    client_kwargs = {
        "hostname": settings.MQTT_BROKER_HOST,
        "port": settings.MQTT_BROKER_PORT,
    }
    if settings.MQTT_USERNAME and settings.MQTT_PASSWORD:
        client_kwargs["username"] = settings.MQTT_USERNAME
        client_kwargs["password"] = settings.MQTT_PASSWORD

    logger.info(f"Connecting to MQTT broker at {settings.MQTT_BROKER_HOST}:{settings.MQTT_BROKER_PORT}...")
    async with aiomqtt.Client(**client_kwargs) as client:
        logger.info("Connected to broker. Starting telemetry stream...")

        cycle = 0
        while running and (max_cycles is None or cycle < max_cycles):
            cycle += 1
            for sensor in sensors:
                stype = sensor.sensor_type.lower()
                is_spike = rng.random() < spike_chance

                # Base normal vs threshold-breaching spike values
                if "temp" in stype:
                    val = rng.uniform(43.0, 48.0) if is_spike else rng.uniform(22.0, 32.0)
                elif "gas" in stype:
                    # Gas rule warning: > 50, critical: > 100
                    val = rng.choice([55.0, 105.0]) if is_spike else rng.uniform(5.0, 20.0)
                elif "vib" in stype:
                    # Vibration rule critical: > 20
                    val = rng.uniform(21.0, 28.0) if is_spike else rng.uniform(1.0, 5.0)
                elif "noise" in stype:
                    # Noise rule: > 85
                    val = rng.uniform(88.0, 96.0) if is_spike else rng.uniform(45.0, 68.0)
                else:
                    val = rng.uniform(10.0, 50.0)

                payload = {
                    "sensor_id": str(sensor.id),
                    "sensor_code": sensor.sensor_code,
                    "site_id": site_id,
                    "zone_id": str(sensor.zone_id) if sensor.zone_id else None,
                    "type": stype,
                    "value": round(val, 2),
                    "unit": sensor.unit,
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "battery": max(10.0, round(float(sensor.battery_level or 90.0) - (cycle * 0.01), 1)),
                    "location": sensor.location_geojson,
                }

                # Topic convention: sites/{site_id}/sensors/{sensor_type}/{sensor_id}
                topic = f"sites/{site_id}/sensors/{stype}/{sensor.id}"
                await client.publish(topic, json.dumps(payload).encode("utf-8"))
                if labels:
                    labels.writerow([
                        payload["ts"], payload["sensor_id"], sensor.sensor_code, stype,
                        payload["value"], sensor.unit, int(is_spike), seed,
                    ])

                tag = " [SPIKE!]" if is_spike else ""
                logger.info(f"Published {sensor.sensor_code} ({stype}): {payload['value']} {sensor.unit}{tag} -> {topic}")

            if labels_file:
                labels_file.flush()
            await asyncio.sleep(interval)

    if labels_file:
        labels_file.close()
        logger.info(f"Ground-truth labels written to {labels_out}")
    logger.info("MQTT Simulator terminated.")


def main():
    parser = argparse.ArgumentParser(description="IoT Sensor MQTT Simulator")
    parser.add_argument("--interval", type=float, default=2.0, help="Publish interval in seconds (default: 2.0)")
    parser.add_argument("--spike-chance", type=float, default=0.2, help="Probability of threshold spike (default: 0.2)")
    parser.add_argument("--seed", type=int, default=2026, help="RNG seed for a reproducible run (default: 2026)")
    parser.add_argument("--labels-out", type=str, default=None, help="CSV path for per-reading ground-truth labels")
    parser.add_argument("--cycles", type=int, default=None, help="Stop after N publish cycles (default: run forever)")
    args = parser.parse_args()

    try:
        asyncio.run(run_simulator(
            interval=args.interval,
            spike_chance=args.spike_chance,
            seed=args.seed,
            labels_out=args.labels_out,
            max_cycles=args.cycles,
        ))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
