import asyncio
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import select, and_
from app.core.config import settings
from app.core.logging import setup_logging
from app.core.security import hash_password
from app.db.models.camera import Camera
from app.db.models.project import Project, ProjectMember, ProjectStatus, Site, Zone
from app.db.models.project_data import BoqItem, Manpower, Material, ProjectSchedule
from app.db.models.rule import AlertSeverity, Rule
from app.db.models.sensor import Sensor
from app.db.models.user import NotificationPreference, User, UserRole
from app.db.postgres import AsyncSessionLocal

logger = logging.getLogger("seed")


async def seed_data():
    setup_logging(settings.LOG_LEVEL)
    logger.info("Seeding initial demo data...")

    async with AsyncSessionLocal() as session:
        # 1. Admin & Demo Users
        admin_email = "admin@buildtrack.com"
        user_res = await session.execute(select(User).where(User.email == admin_email))
        admin = user_res.scalar_one_or_none()

        if not admin:
            admin = User(
                email=admin_email,
                hashed_password=hash_password("Admin@123456"),
                full_name="System Administrator",
                role=UserRole.ADMIN,
                is_active=True,
            )
            session.add(admin)
            await session.flush()
            pref = NotificationPreference(user_id=admin.id, email_enabled=True, sms_enabled=True, push_enabled=True)
            session.add(pref)
            logger.info(f"Created admin user: {admin_email} / Admin@123456")

        # Safety officer
        safety_email = "safety@buildtrack.com"
        safety_res = await session.execute(select(User).where(User.email == safety_email))
        safety_user = safety_res.scalar_one_or_none()
        if not safety_user:
            safety_user = User(
                email=safety_email,
                hashed_password=hash_password("Safety@123456"),
                full_name="Jane Doe (Safety Officer)",
                role=UserRole.SAFETY_OFFICER,
                is_active=True,
            )
            session.add(safety_user)
            await session.flush()
            session.add(NotificationPreference(user_id=safety_user.id))

        # Project manager
        pm_email = "pm@buildtrack.com"
        pm_res = await session.execute(select(User).where(User.email == pm_email))
        pm_user = pm_res.scalar_one_or_none()
        if not pm_user:
            pm_user = User(
                email=pm_email,
                hashed_password=hash_password("Manager@123456"),
                full_name="Bob Builder (Project Manager)",
                role=UserRole.PROJECT_MANAGER,
                is_active=True,
            )
            session.add(pm_user)
            await session.flush()
            session.add(NotificationPreference(user_id=pm_user.id))

        # 2. Demo Project
        proj_code = "PRJ-METRO-01"
        proj_res = await session.execute(select(Project).where(Project.code == proj_code))
        project = proj_res.scalar_one_or_none()

        if not project:
            project = Project(
                name="Metropolitan Transit Hub & Towers",
                code=proj_code,
                description="High-rise mixed-use construction with underground rail link",
                status=ProjectStatus.ACTIVE,
                budget=45000000.00,
                start_date=date(2026, 1, 15),
                end_date=date(2028, 6, 30),
            )
            session.add(project)
            await session.flush()

            # Membership
            session.add(ProjectMember(project_id=project.id, user_id=admin.id, project_role="administrator"))
            session.add(ProjectMember(project_id=project.id, user_id=pm_user.id, project_role="manager"))
            session.add(ProjectMember(project_id=project.id, user_id=safety_user.id, project_role="safety_lead"))
            logger.info(f"Created project: {project.name}")

        # 3. Demo Site
        site_code = "SITE-NORTH-01"
        site_res = await session.execute(select(Site).where(Site.code == site_code))
        site = site_res.scalar_one_or_none()

        if not site:
            site = Site(
                project_id=project.id,
                name="Terminal 3 East Wing Site",
                code=site_code,
                address="100 Metro Rail Boulevard, Sector 4",
                latitude=28.5562,
                longitude=77.1000,
                boundary_geojson={
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [77.0980, 28.5540],
                            [77.1020, 28.5540],
                            [77.1020, 28.5580],
                            [77.0980, 28.5580],
                            [77.0980, 28.5540],
                        ]
                    ],
                },
                status="active",
            )
            session.add(site)
            await session.flush()
            logger.info(f"Created site: {site.name}")

        # 4. Demo Zones
        z1_res = await session.execute(select(Zone).where(and_(Zone.site_id == site.id, Zone.name == "Excavation Pit A")))
        z1 = z1_res.scalar_one_or_none()
        if not z1:
            z1 = Zone(
                site_id=site.id,
                name="Excavation Pit A",
                zone_type="excavation",
                risk_level="high",
                polygon_geojson={
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [77.0985, 28.5545],
                            [77.1000, 28.5545],
                            [77.1000, 28.5560],
                            [77.0985, 28.5560],
                            [77.0985, 28.5545],
                        ]
                    ],
                },
            )
            session.add(z1)

        z2_res = await session.execute(select(Zone).where(and_(Zone.site_id == site.id, Zone.name == "Scaffolding Zone B")))
        z2 = z2_res.scalar_one_or_none()
        if not z2:
            z2 = Zone(
                site_id=site.id,
                name="Scaffolding Zone B",
                zone_type="scaffolding",
                risk_level="medium",
                polygon_geojson={
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [77.1002, 28.5562],
                            [77.1018, 28.5562],
                            [77.1018, 28.5578],
                            [77.1002, 28.5578],
                            [77.1002, 28.5562],
                        ]
                    ],
                },
            )
            session.add(z2)
        await session.flush()

        # 5. Demo Sensors
        sensors_data = [
            ("TEMP-001", "Ambient Concrete Temp Sensor", "temperature", "°C", -10.0, 45.0, 77.0990, 28.5550, z1.id),
            ("GAS-001", "Sub-surface Hazardous Gas Detector", "gas", "ppm", 0.0, 50.0, 77.0995, 28.5555, z1.id),
            ("VIB-001", "Sheet Pile Vibration Monitor", "vibration", "mm/s", 0.0, 15.0, 77.1005, 28.5565, z2.id),
            ("NOISE-001", "Perimeter Acoustic Sound Meter", "noise", "dB", 30.0, 85.0, 77.1010, 28.5570, z2.id),
        ]
        for code, name, stype, unit, min_t, max_t, lng, lat, zid in sensors_data:
            s_res = await session.execute(select(Sensor).where(Sensor.sensor_code == code))
            if not s_res.scalar_one_or_none():
                sensor = Sensor(
                    site_id=site.id,
                    zone_id=zid,
                    sensor_code=code,
                    name=name,
                    sensor_type=stype,
                    unit=unit,
                    min_threshold=min_t,
                    max_threshold=max_t,
                    location_geojson={"type": "Point", "coordinates": [lng, lat]},
                    status="active",
                    battery_level=95.0,
                    last_seen_at=datetime.now(timezone.utc),
                )
                session.add(sensor)
                logger.info(f"Created sensor: {code} ({stype})")

        # 6. Demo Cameras (8 Available Video Streams)
        cameras_data = [
            ("CAM-01", "CAM-01: Main Concourse & Gate", "/videos/19241054-hd_1920_1080_30fps.mp4", 30, z1.id, 77.0986, 28.5546),
            ("CAM-02", "CAM-02: Tower Crane Mast & Hook", "/videos/19832492-hd_1920_1080_25fps.mp4", 25, z1.id, 77.0992, 28.5552),
            ("CAM-03", "CAM-03: Excavation & Structural Foundation", "/videos/5674342-hd_1920_1080_30fps.mp4", 30, z1.id, 77.0995, 28.5558),
            ("CAM-04", "CAM-04: High-Rise Superstructure & Deck", "/videos/13751987_3840_2160_50fps.mp4", 50, z2.id, 77.1005, 28.5565),
            ("CAM-05", "CAM-05: Heavy Earthmoving & Fleet Depot", "/videos/12229456_3840_2160_24fps.mp4", 24, z1.id, 77.0990, 28.5548),
            ("CAM-06", "CAM-06: Scaffold Perimeter & Safety Netting", "/videos/8792814-uhd_3840_2160_30fps.mp4", 30, z2.id, 77.1012, 28.5572),
            ("CAM-07", "CAM-07: Vertical Slipform Core & Hoist Shaft", "/videos/13387809_2160_3840_60fps.mp4", 60, z2.id, 77.1008, 28.5568),
            ("CAM-08", "CAM-08: Structural Steel Assembly & Deck", "/videos/13261762_3840_2160_24fps.mp4", 24, z2.id, 77.1015, 28.5575),
        ]
        for cam_code, name, s_url, fps, zid, lng, lat in cameras_data:
            cam_res = await session.execute(select(Camera).where(Camera.camera_code == cam_code))
            if not cam_res.scalar_one_or_none():
                camera = Camera(
                    site_id=site.id,
                    zone_id=zid,
                    camera_code=cam_code,
                    name=name,
                    stream_url=s_url,
                    location_geojson={"type": "Point", "coordinates": [lng, lat]},
                    fps=fps,
                    status="active",
                    is_cv_enabled=True,
                )
                session.add(camera)
                logger.info(f"Created camera: {cam_code} ({name})")

        # 7. Demo Safety Rules
        rules_data = [
            ("Toxic Gas Exceedance Warning", "gas", ">", 50.0, None, 0, AlertSeverity.WARNING, 300, False),
            ("Critical Toxic Gas Spike Alert", "gas", ">", 100.0, None, 0, AlertSeverity.CRITICAL, 180, True),
            ("High Heat Stress Duration Condition", "temperature", ">", 42.0, None, 60, AlertSeverity.WARNING, 300, False),
            ("Excessive Pile Driving Vibration", "vibration", ">", 20.0, None, 0, AlertSeverity.CRITICAL, 240, True),
            ("Perimeter Noise Curfew Breach", "noise", ">", 85.0, None, 120, AlertSeverity.INFO, 600, False),
        ]
        for name, stype, op, val1, val2, dur, sev, cd, auto_inc in rules_data:
            r_res = await session.execute(select(Rule).where(and_(Rule.site_id == site.id, Rule.name == name)))
            if not r_res.scalar_one_or_none():
                rule = Rule(
                    site_id=site.id,
                    name=name,
                    sensor_type=stype,
                    operator=op,
                    threshold_val1=val1,
                    threshold_val2=val2,
                    duration_seconds=dur,
                    severity=sev,
                    is_enabled=True,
                    cooldown_seconds=cd,
                    auto_create_incident=auto_inc,
                )
                session.add(rule)
                logger.info(f"Created rule: {name}")

        # 8. Demo Schedules, BOQ, Manpower, Materials
        sched_res = await session.execute(select(ProjectSchedule).where(ProjectSchedule.project_id == project.id))
        if not sched_res.scalars().first():
            session.add(ProjectSchedule(
                project_id=project.id,
                task_name="Foundation Excavation and Piling",
                wbs_code="1.1",
                start_date=date(2026, 2, 1),
                end_date=date(2026, 5, 30),
                progress_percent=78.5,
                status="in_progress",
            ))
            session.add(ProjectSchedule(
                project_id=project.id,
                task_name="Retaining Wall Reinforced Concrete Pouring",
                wbs_code="1.2",
                start_date=date(2026, 4, 15),
                end_date=date(2026, 8, 15),
                progress_percent=42.0,
                status="in_progress",
            ))

        boq_res = await session.execute(select(BoqItem).where(BoqItem.project_id == project.id))
        if not boq_res.scalars().first():
            session.add(BoqItem(
                project_id=project.id,
                item_code="C35-CONC",
                description="Grade C35 Ready-Mix Concrete for Substructure",
                unit="m3",
                planned_quantity=12000.0,
                unit_rate=125.0,
                total_planned_cost=1500000.0,
                consumed_quantity=8450.0,
            ))
            session.add(BoqItem(
                project_id=project.id,
                item_code="FE-500-REBAR",
                description="High Tensile Thermo-Mechanically Treated Steel Rebar",
                unit="tons",
                planned_quantity=2500.0,
                unit_rate=850.0,
                total_planned_cost=2125000.0,
                consumed_quantity=1890.0,
            ))

        manpower_res = await session.execute(select(Manpower).where(Manpower.project_id == project.id))
        if not manpower_res.scalars().first():
            session.add(Manpower(
                project_id=project.id,
                date=date.today(),
                trade="Steel Fixers & Welders",
                planned_headcount=45,
                actual_headcount=42,
                shift="day",
            ))
            session.add(Manpower(
                project_id=project.id,
                date=date.today(),
                trade="Carpenters & Riggers",
                planned_headcount=30,
                actual_headcount=30,
                shift="day",
            ))

        mat_res = await session.execute(select(Material).where(Material.project_id == project.id))
        if not mat_res.scalars().first():
            session.add(Material(
                project_id=project.id,
                name="OPC 53 Grade Cement",
                unit="bags",
                total_ordered=25000.0,
                total_delivered=22000.0,
                total_used=18500.0,
                stock_on_hand=3500.0,
            ))

        await session.commit()
        logger.info("Demo data seed completed successfully!")

    # Seed rich analytics and telemetry data
    try:
        from scripts.seed_analytics import seed_analytics_data
        await seed_analytics_data()
    except Exception as e:
        logger.error(f"Failed to run seed_analytics_data: {e}")


if __name__ == "__main__":
    asyncio.run(seed_data())
