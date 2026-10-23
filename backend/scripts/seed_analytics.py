import asyncio
import logging
import math
from pathlib import Path
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pymongo
from sqlalchemy import select, and_, delete
from sqlalchemy.dialects.postgresql import insert

from app.core.config import settings
from app.core.logging import setup_logging
from app.db.mongo import get_mongo_db
from app.db.postgres import AsyncSessionLocal
from app.db.models.project import Project, Site, Zone
from app.db.models.sensor import Sensor
from app.db.models.camera import Camera
from app.db.models.rule import Rule, AlertSeverity
from app.db.models.alert import Alert, AlertStatus
from app.db.models.incident import Incident, IncidentStatus
from app.db.models.rollup import KpiRollup, AlertCountTs, PPEComplianceTs, ReportMetadata
from app.db.models.user import User

logger = logging.getLogger("seed_analytics")


async def seed_analytics_data():
    setup_logging(settings.LOG_LEVEL)
    logger.info("Starting comprehensive Analytics & Telemetry data seed...")

    mongo_db = get_mongo_db()
    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    history_days = 14  # 14 days of rich history

    async with AsyncSessionLocal() as session:
        # 1. Fetch Demo Site
        site_res = await session.execute(select(Site).where(Site.code == "SITE-NORTH-01"))
        site = site_res.scalar_one_or_none()
        if not site:
            # Fallback to any active site
            site_res = await session.execute(select(Site).where(Site.status == "active").limit(1))
            site = site_res.scalar_one_or_none()
        if not site:
            logger.error("No active site found. Please run initial seed first.")
            return

        logger.info(f"Seeding analytics data for site: {site.name} [{site.id}]")

        # 2. Fetch or create Zones
        zones_res = await session.execute(select(Zone).where(Zone.site_id == site.id))
        zones = zones_res.scalars().all()
        z1 = zones[0] if zones else None
        z2 = zones[1] if len(zones) > 1 else z1

        # 3. Ensure the 7 Core Universal Sensors exist
        target_sensors = [
            ("TEMP-001", "Ambient Concrete Temp Sensor", "temperature", "°C", -10.0, 45.0, 95.6, 34.2, z1.id if z1 else None),
            ("NOISE-001", "Perimeter Acoustic Sound Meter", "noise", "dB", 30.0, 85.0, 93.3, 65.4, z2.id if z2 else None),
            ("VIB-001", "Sheet Pile Vibration Monitor", "vibration", "mm/s", 0.0, 15.0, 86.7, 3.3, z2.id if z2 else None),
            ("GAS-001", "Sub-surface Hazardous Gas Detector", "gas", "ppm", 0.0, 50.0, 93.3, 10.3, z1.id if z1 else None),
            ("GAS-A9Q3", "asdasd", "gas", "ppm", 0.0, 50.0, 93.5, 10.6, z1.id if z1 else None),
            ("GAS-WCSC", "ddsf", "gas", "ppm", 0.0, 50.0, 94.5, 11.0, z2.id if z2 else None),
            ("GAS-A2QP", "dfd", "gas", "ppm", 0.0, 50.0, 93.4, 10.8, z1.id if z1 else None),
        ]

        active_sensors: List[Sensor] = []
        for code, name, stype, unit, min_t, max_t, battery, live_val, zid in target_sensors:
            s_res = await session.execute(select(Sensor).where(and_(Sensor.site_id == site.id, Sensor.sensor_code == code)))
            sensor = s_res.scalar_one_or_none()
            if not sensor:
                sensor = Sensor(
                    site_id=site.id,
                    zone_id=zid,
                    sensor_code=code,
                    name=name,
                    sensor_type=stype,
                    unit=unit,
                    min_threshold=min_t,
                    max_threshold=max_t,
                    location_geojson={"type": "Point", "coordinates": [77.0990, 28.5550]},
                    status="active",
                    battery_level=battery,
                    last_seen_at=now,
                )
                session.add(sensor)
                await session.flush()
                logger.info(f"Created sensor {code}: {name} [{sensor.id}]")
            else:
                sensor.name = name
                sensor.sensor_type = stype
                sensor.unit = unit
                sensor.status = "active"
                sensor.battery_level = battery
                sensor.last_seen_at = now
                sensor.deleted_at = None
                await session.flush()
            active_sensors.append(sensor)

        # Also get any other active sensors on the site
        all_sensors_res = await session.execute(
            select(Sensor).where(and_(Sensor.site_id == site.id, Sensor.deleted_at.is_(None)))
        )
        all_sensors = all_sensors_res.scalars().all()
        for s in all_sensors:
            if s.id not in [x.id for x in active_sensors]:
                s.status = "active"
                s.last_seen_at = now
                active_sensors.append(s)

        await session.commit()
        logger.info(f"Verified {len(active_sensors)} active sensors in database.")

        # 4. Fetch Cameras
        cams_res = await session.execute(select(Camera).where(Camera.site_id == site.id))
        cameras = cams_res.scalars().all()

        # 5. Fetch Rules
        rules_res = await session.execute(select(Rule).where(Rule.site_id == site.id))
        rules = rules_res.scalars().all()

        # 6. Fetch Admin user for audit/attribution
        admin_res = await session.execute(select(User).limit(1))
        admin_user = admin_res.scalar_one_or_none()
        admin_id = admin_user.id if admin_user else None

    # =========================================================================
    # 7. SEED TELEMETRY READINGS INTO MONGODB
    # =========================================================================
    logger.info("Generating high-resolution time-series telemetry in MongoDB...")
    total_minutes = history_days * 24 * 60
    # Step every 2 minutes = 720 points/day = ~10,080 points per sensor over 14 days
    step_minutes = 2
    timestamps = [
        now - timedelta(minutes=m)
        for m in range(total_minutes, -1, -step_minutes)
    ]

    target_live_map = {
        "TEMP-001": 34.2,
        "NOISE-001": 65.4,
        "VIB-001": 3.3,
        "GAS-001": 10.3,
        "GAS-A9Q3": 10.6,
        "GAS-WCSC": 11.0,
        "GAS-A2QP": 10.8,
    }

    # Delete old readings for these sensors to ensure clean, consistent data
    sensor_id_strs = [str(s.id) for s in active_sensors]
    await mongo_db.sensor_readings.delete_many({"meta.sensor_id": {"$in": sensor_id_strs}})
    logger.info(f"Cleaned previous sensor_readings for {len(sensor_id_strs)} sensors.")

    rng = random.Random(42)

    for sensor in active_sensors:
        stype = sensor.sensor_type.lower()
        code = sensor.sensor_code
        target_live = target_live_map.get(code)
        readings_batch = []

        logger.info(f"Synthesizing ~{len(timestamps)} telemetry records for {code} ({stype})...")

        for idx, ts in enumerate(timestamps):
            is_last = (idx == len(timestamps) - 1)
            # Diurnal progress 0..1 over 24 hours
            hour_float = ts.hour + ts.minute / 60.0
            day_rad = (hour_float / 24.0) * 2 * math.pi

            if "temp" in stype:
                # Coldest at 05:00 (hour 5), hottest at 14:00 (hour 14)
                # peak around 14:00: cos((hour - 14) * 2pi/24)
                base = 27.0 + 8.5 * math.cos((hour_float - 14.0) * 2 * math.pi / 24.0)
                noise = rng.gauss(0, 0.4)
                # Occasional hot concrete cure heat spike in day 3 and 10
                spike = 6.0 if (ts.day % 4 == 0 and 13 <= ts.hour <= 15) else 0.0
                val = round(base + noise + spike, 2)
                if is_last and target_live is not None:
                    val = target_live

            elif "noise" in stype or "sound" in stype:
                # Work hours (07:00 - 18:00) vs night
                if 7 <= ts.hour <= 18:
                    base = 72.0 + 5.0 * math.sin(day_rad * 2)
                    noise = rng.gauss(0, 2.5)
                    spike = 15.0 if rng.random() < 0.02 else 0.0  # Curfew/threshold breach burst
                else:
                    base = 48.0
                    noise = rng.gauss(0, 1.2)
                    spike = 0.0
                val = round(max(35.0, base + noise + spike), 1)
                if is_last and target_live is not None:
                    val = target_live

            elif "vibr" in stype:
                # Active heavy machinery hours
                if 8 <= ts.hour <= 17:
                    base = 3.5 + 1.2 * math.sin(day_rad * 3)
                    noise = rng.gauss(0, 0.5)
                    spike = 17.0 if (rng.random() < 0.015 and 9 <= ts.hour <= 16) else 0.0
                else:
                    base = 0.4
                    noise = abs(rng.gauss(0, 0.15))
                    spike = 0.0
                val = round(max(0.1, base + noise + spike), 2)
                if is_last and target_live is not None:
                    val = target_live

            else:
                # Gas detectors
                base = 9.8 + (hash(code) % 5) * 0.3
                noise = rng.gauss(0, 0.6)
                # Occasional localized pocket release
                spike = 42.0 if (rng.random() < 0.008) else 0.0
                if code == "GAS-001" and ts.day % 5 == 0 and ts.hour == 11 and ts.minute <= 10:
                    spike = 95.0  # Critical gas spike
                val = round(max(0.2, base + noise + spike), 1)
                if is_last and target_live is not None:
                    val = target_live

            battery_pct = round(max(70.0, (sensor.battery_level or 95.0) - (len(timestamps) - idx) * 0.0005), 1)

            readings_batch.append({
                "ts": ts,
                "meta": {
                    "sensor_id": str(sensor.id),
                    "site_id": str(site.id),
                    "type": stype,
                    "zone_id": str(sensor.zone_id) if sensor.zone_id else None,
                },
                "value": float(val),
                "unit": sensor.unit,
                "battery": battery_pct,
                "location": sensor.location_geojson,
            })

            # Bulk insert in chunks of 5000 for fast throughput
            if len(readings_batch) >= 5000:
                await mongo_db.sensor_readings.insert_many(readings_batch, ordered=False)
                readings_batch = []

        if readings_batch:
            await mongo_db.sensor_readings.insert_many(readings_batch, ordered=False)

        # Upsert into sensor_latest
        final_val = target_live if target_live is not None else val
        await mongo_db.sensor_latest.update_one(
            {"sensor_id": str(sensor.id)},
            {
                "$set": {
                    "sensor_id": str(sensor.id),
                    "site_id": str(site.id),
                    "type": stype,
                    "value": float(final_val),
                    "unit": sensor.unit,
                    "ts": now,
                    "zone_id": str(sensor.zone_id) if sensor.zone_id else None,
                    "battery": sensor.battery_level,
                    "location": sensor.location_geojson,
                    "updated_at": now,
                }
            },
            upsert=True,
        )

    logger.info("Successfully seeded time-series telemetry records into MongoDB.")

    # =========================================================================
    # 8. SEED CV PPE DETECTIONS INTO MONGODB
    # =========================================================================
    logger.info("Seeding CV PPE frame detections into MongoDB...")
    await mongo_db.cv_detections.delete_many({"site_id": str(site.id)})

    cv_docs = []
    # Sample every 15 minutes over 14 days = 96 frames/day = ~1,344 frames per camera
    cam_list = cameras if cameras else [None]
    cv_timestamps = [now - timedelta(minutes=m) for m in range(total_minutes, -1, -15)]

    for ts in cv_timestamps:
        # Only simulate work hours (06:00 to 19:00)
        if not (6 <= ts.hour <= 19):
            continue

        for cam in cam_list[:3]:  # First 3 primary concourse/excavation cameras
            # 94.5% compliance rate
            is_compliant = (rng.random() < 0.945)
            persons = rng.randint(2, 6)
            violating = 0 if is_compliant else 1
            violations = []
            if not is_compliant:
                violations.append({
                    "type": rng.choice(["missing_hard_hat", "missing_hi_vis_vest", "missing_safety_gloves"]),
                    "confidence": round(rng.uniform(0.85, 0.98), 2),
                    "box": [100, 150, 220, 380],
                })

            cv_docs.append({
                "camera_id": str(cam.id) if cam else str(uuid.uuid4()),
                "site_id": str(site.id),
                "detector": "yolo_ppe",
                "ts": ts,
                "compliant": is_compliant,
                "persons_count": persons,
                "violating_persons": violating,
                "violations": violations,
                "detections": [{"class": "person", "confidence": 0.94} for _ in range(persons)],
                "zone_id": str(cam.zone_id) if cam and cam.zone_id else None,
                "snapshot_url": None,
            })

            if len(cv_docs) >= 5000:
                await mongo_db.cv_detections.insert_many(cv_docs, ordered=False)
                cv_docs = []

    if cv_docs:
        await mongo_db.cv_detections.insert_many(cv_docs, ordered=False)
    logger.info("Successfully seeded CV detections.")

    # =========================================================================
    # 9. SEED ALERTS & INCIDENTS INTO POSTGRESQL (7x24 HEATMAP MATRIX)
    # =========================================================================
    logger.info("Seeding realistic alerts & incidents for 7x24 hazard heatmap in PostgreSQL...")
    async with AsyncSessionLocal() as session:
        # Clean existing test alerts for this site
        await session.execute(delete(Alert).where(Alert.site_id == site.id))
        await session.execute(delete(Incident).where(Incident.site_id == site.id))
        await session.flush()

        alert_records: List[Alert] = []
        incident_records: List[Incident] = []

        # We will generate ~250 alerts distributed across all 7 days of the week (Monday through Sunday)
        # and across all 24 hours of each day
        rule_map = {r.sensor_type: r for r in rules}

        for day_offset in range(14, -1, -1):
            day_date = (now - timedelta(days=day_offset)).date()

            for hour in range(24):
                # Work hours (08:00 - 18:00) have higher probability of activity
                is_work_hour = (8 <= hour <= 18)
                alert_prob = 0.55 if is_work_hour else 0.15

                if rng.random() < alert_prob:
                    # Decide severity and sensor
                    stype = rng.choice(["temperature", "gas", "vibration", "noise"])
                    sens = next((s for s in active_sensors if s.sensor_type == stype), active_sensors[0])
                    rule = rule_map.get(stype)

                    is_crit = rng.random() < 0.20
                    is_warn = (not is_crit) and (rng.random() < 0.65)
                    sev = AlertSeverity.CRITICAL if is_crit else (AlertSeverity.WARNING if is_warn else AlertSeverity.INFO)

                    alert_time = datetime(
                        day_date.year, day_date.month, day_date.day,
                        hour, rng.randint(0, 59), rng.randint(0, 59),
                        tzinfo=timezone.utc
                    )
                    # Don't create alerts in the future
                    if alert_time > now:
                        continue

                    # Older alerts are resolved; recent alerts may be active
                    age_hours = (now - alert_time).total_seconds() / 3600.0
                    if age_hours < 2:
                        alert_status = AlertStatus.ACTIVE if rng.random() < 0.7 else AlertStatus.ACKNOWLEDGED
                    elif age_hours < 12:
                        alert_status = AlertStatus.ACKNOWLEDGED if rng.random() < 0.5 else AlertStatus.RESOLVED
                    else:
                        alert_status = AlertStatus.RESOLVED

                    val_str = "43.2" if stype == "temperature" else ("108.5" if stype == "gas" else ("21.4" if stype == "vibration" else "88.0"))

                    alert = Alert(
                        site_id=site.id,
                        rule_id=rule.id if rule else None,
                        sensor_id=sens.id,
                        zone_id=sens.zone_id,
                        alert_type="sensor_threshold",
                        severity=sev,
                        status=alert_status,
                        message=f"[{sev.value.upper()}] Sensor {sens.sensor_code} recorded {val_str} {sens.unit} exceeding safe operational boundary ({rule.name if rule else 'Threshold Breach'}).",
                        reading_value=float(val_str),
                        threshold_value=rule.threshold_val1 if rule and rule.threshold_val1 else 40.0,
                        details={"sensor_code": sens.sensor_code, "unit": sens.unit, "rule_name": rule.name if rule else None},
                        created_at=alert_time,
                    )
                    if alert_status in (AlertStatus.ACKNOWLEDGED, AlertStatus.RESOLVED):
                        alert.acknowledged_at = alert_time + timedelta(minutes=rng.randint(3, 15))
                        alert.acknowledged_by = admin_id
                    if alert_status == AlertStatus.RESOLVED:
                        alert.resolved_at = alert_time + timedelta(hours=rng.uniform(1.0, 3.5))
                        alert.resolved_by = admin_id

                    session.add(alert)
                    await session.flush()
                    alert_records.append(alert)

                    # For critical alerts, optionally create an incident
                    if is_crit and rng.random() < 0.6:
                        inc_status = IncidentStatus.RESOLVED if age_hours > 6 else (
                            IncidentStatus.INVESTIGATING if age_hours > 1 else IncidentStatus.OPEN
                        )
                        inc_num = f"INC-{alert_time.strftime('%Y%m%d')}-{len(incident_records)+1:04d}"
                        inc = Incident(
                            incident_number=inc_num,
                            site_id=site.id,
                            zone_id=sens.zone_id,
                            alert_id=alert.id,
                            title=f"Site Safety Incident: {sens.sensor_code} Breach",
                            description=f"Automated hazard escalation triggered by critical sensor breach on {sens.sensor_code}.",
                            severity=AlertSeverity.CRITICAL if is_crit else AlertSeverity.WARNING,
                            status=inc_status,
                            created_at=alert_time,
                            reported_by=admin_id,
                        )
                        if inc_status == IncidentStatus.RESOLVED:
                            inc.resolved_at = alert.resolved_at or (alert_time + timedelta(hours=2.5))
                            inc.resolution_notes = "Field inspection verified condition cleared. Equipment calibrated."
                        session.add(inc)
                        incident_records.append(inc)

        # Ensure active alerts and open incidents exist right now for realistic KPIs and risk scores
        recent_active_configs = [
            ("gas", AlertSeverity.CRITICAL, "Critical Toxic Gas Spike Alert", "102.5", z1.id if z1 else None),
            ("vibration", AlertSeverity.WARNING, "Excessive Pile Driving Vibration", "18.4", z2.id if z2 else None),
            ("temperature", AlertSeverity.WARNING, "High Heat Stress Duration Condition", "42.8", z1.id if z1 else None),
            ("noise", AlertSeverity.INFO, "Perimeter Noise Curfew Breach", "86.2", z2.id if z2 else None),
        ]
        for stype, sev, rname, val_str, zid in recent_active_configs:
            sens = next((s for s in active_sensors if s.sensor_type == stype), active_sensors[0])
            rule = rule_map.get(stype)
            al = Alert(
                site_id=site.id,
                rule_id=rule.id if rule else None,
                sensor_id=sens.id,
                zone_id=zid or sens.zone_id,
                alert_type="sensor_threshold",
                severity=sev,
                status=AlertStatus.ACTIVE,
                message=f"[{sev.value.upper()}] Sensor {sens.sensor_code} recorded {val_str} {sens.unit} exceeding safe operational boundary ({rname}).",
                reading_value=float(val_str),
                threshold_value=rule.threshold_val1 if rule and rule.threshold_val1 else 40.0,
                details={"sensor_code": sens.sensor_code, "unit": sens.unit, "rule_name": rname},
                created_at=now - timedelta(minutes=rng.randint(5, 45)),
            )
            session.add(al)
            await session.flush()
            alert_records.append(al)

            if sev == AlertSeverity.CRITICAL and len([i for i in incident_records if i.status in (IncidentStatus.OPEN, IncidentStatus.INVESTIGATING)]) < 2:
                inc = Incident(
                    incident_number=f"INC-{now.strftime('%Y%m%d')}-{len(incident_records)+1:04d}",
                    site_id=site.id,
                    zone_id=zid or sens.zone_id,
                    alert_id=al.id,
                    title=f"Site Safety Incident: {sens.sensor_code} Critical Breach",
                    description=f"Active critical alert requiring emergency ventilation and hazard perimeter clearance.",
                    severity=AlertSeverity.CRITICAL,
                    status=IncidentStatus.INVESTIGATING,
                    created_at=now - timedelta(minutes=25),
                    reported_by=admin_id,
                )
                session.add(inc)
                incident_records.append(inc)

        # Ensure Manpower for today
        from app.db.models.project_data import Manpower
        from datetime import date
        today = date.today()
        mp_res = await session.execute(
            select(Manpower).where(and_(Manpower.project_id == site.project_id, Manpower.date == today))
        )
        if not mp_res.scalars().first():
            session.add(Manpower(
                project_id=site.project_id,
                date=today,
                trade="Steel Fixers & Welders",
                planned_headcount=45,
                actual_headcount=42,
                shift="day",
            ))
            session.add(Manpower(
                project_id=site.project_id,
                date=today,
                trade="Carpenters & Riggers",
                planned_headcount=30,
                actual_headcount=30,
                shift="day",
            ))

        await session.commit()
        logger.info(f"Seeded {len(alert_records)} alerts and {len(incident_records)} incidents into PostgreSQL.")

    # =========================================================================
    # 10. SEED HOURLY ROLLUPS INTO POSTGRESQL (TRENDS & FORECASTING)
    # =========================================================================
    logger.info("Seeding materialized rollups (KpiRollup, PPEComplianceTs, AlertCountTs) into PostgreSQL...")
    async with AsyncSessionLocal() as session:
        # Clean existing rollups for this site
        await session.execute(delete(KpiRollup).where(KpiRollup.site_id == site.id))
        await session.execute(delete(PPEComplianceTs).where(PPEComplianceTs.site_id == site.id))
        await session.execute(delete(AlertCountTs).where(AlertCountTs.site_id == site.id))
        await session.flush()

        # Generate 14 days of hourly buckets
        hourly_buckets = [now - timedelta(hours=h) for h in range(14 * 24, -1, -1)]

        for b in hourly_buckets:
            # Diurnal sinusoid
            hour_float = b.hour + b.minute / 60.0
            day_rad = (hour_float / 24.0) * 2 * math.pi

            # PPE Compliance Trend: 91.5% to 96.8%
            base_ppe = 94.2 + 2.0 * math.sin(day_rad) + rng.gauss(0, 0.5)
            ppe_rate = round(min(98.5, max(89.0, base_ppe)), 2)
            total_det = rng.randint(140, 260)
            comp_det = int(round(total_det * ppe_rate / 100.0))

            # 1. PPE Compliance TS
            ppe_rollup = PPEComplianceTs(
                site_id=site.id,
                camera_id=None,
                bucket=b,
                resolution="1h",
                total_detections=total_det,
                compliant_detections=comp_det,
                compliance_rate=ppe_rate,
            )
            session.add(ppe_rollup)

            # 2. Alert Count TS
            # Hourly alert distribution by severity
            is_work = (8 <= b.hour <= 18)
            crit_count = rng.choice([0, 0, 0, 1]) if is_work else 0
            warn_count = rng.randint(0, 3) if is_work else rng.choice([0, 0, 1])
            info_count = rng.randint(0, 2) if is_work else 0

            session.add(AlertCountTs(site_id=site.id, bucket=b, resolution="1h", severity="critical", count=crit_count))
            session.add(AlertCountTs(site_id=site.id, bucket=b, resolution="1h", severity="warning", count=warn_count))
            session.add(AlertCountTs(site_id=site.id, bucket=b, resolution="1h", severity="info", count=info_count))

            # 3. KPI Rollup
            uptime_pct = round(min(100.0, 97.5 + 2.0 * math.cos(day_rad) + rng.gauss(0, 0.3)), 2)
            kpi = KpiRollup(
                site_id=site.id,
                bucket=b,
                resolution="1h",
                sensor_readings_count=rng.randint(700, 1200),
                sensor_uptime_pct=uptime_pct,
                ppe_compliance_pct=ppe_rate,
                active_alerts_count=warn_count + crit_count,
                incidents_count=crit_count,
                metrics={
                    "mttr_hours": round(rng.uniform(1.8, 3.2), 1),
                    "open_incidents": 2 if b == hourly_buckets[-1] else 0,
                    "compliance_score": ppe_rate,
                },
            )
            session.add(kpi)

        # Also add recent 1m rollups for the past 2 hours
        for m in range(120, -1, -1):
            m_time = now - timedelta(minutes=m)
            session.add(KpiRollup(
                site_id=site.id,
                bucket=m_time,
                resolution="1m",
                sensor_readings_count=rng.randint(15, 30),
                sensor_uptime_pct=98.5,
                ppe_compliance_pct=94.5,
                active_alerts_count=3,
                incidents_count=1,
                metrics={"mttr_hours": 2.2},
            ))

        await session.commit()
        logger.info(f"Seeded {len(hourly_buckets)} hourly rollups (PPE, Alert counts, KPI Rollups) into PostgreSQL.")

    logger.info("All Analytics & Telemetry intelligence data seeded successfully!")


if __name__ == "__main__":
    asyncio.run(seed_analytics_data())
