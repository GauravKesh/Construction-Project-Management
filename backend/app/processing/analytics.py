import io
import uuid
from datetime import datetime, date, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models.alert import Alert, AlertStatus, AlertSeverity
from app.db.models.incident import Incident, IncidentStatus
from app.db.models.project import Project, Site, Zone
from app.db.models.project_data import ProjectSchedule, Manpower
from app.db.models.sensor import Sensor
from app.db.repositories.alert_repo import AlertRepository
from app.db.repositories.cv_repo import CVRepository
from app.db.repositories.incident_repo import IncidentRepository
from app.db.repositories.rollup_repo import RollupRepository
from app.storage.base import StorageDriver


# Two-sided 95% Student-t critical values by degrees of freedom (normal beyond 30)
_T95 = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
    9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
    16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074,
    23: 2.069, 24: 2.064, 25: 2.060, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
}


def _t_critical_95(dof: int) -> float:
    return _T95.get(dof, 1.96) if dof > 0 else float("inf")


class AnalyticsEngine:
    def __init__(self):
        self.cv_repo = CVRepository()

    async def calculate_kpis(self, site_id: uuid.UUID, session: AsyncSession) -> Dict[str, Any]:
        """
        Calculates real-time KPIs for site.
        """
        # 1. Schedules progress
        site_res = await session.execute(select(Site).where(Site.id == site_id))
        site = site_res.scalar_one_or_none()
        progress_pct = 0.0
        if site:
            sched_res = await session.execute(
                select(func.avg(ProjectSchedule.progress_percent)).where(
                    ProjectSchedule.project_id == site.project_id
                )
            )
            progress_pct = float(sched_res.scalar() or 0.0)

        # 2. PPE Compliance
        ppe_sum = await self.cv_repo.get_ppe_summary(site_id=str(site_id))
        ppe_pct = ppe_sum.get("compliance_rate")  # None when there are no CV frames

        # 3. Sensor uptime
        sensor_res = await session.execute(
            select(Sensor).where(and_(Sensor.site_id == site_id, Sensor.deleted_at.is_(None)))
        )
        sensors = sensor_res.scalars().all()
        now = datetime.now(timezone.utc)
        online_count = 0
        for s in sensors:
            if s.last_seen_at and (now - s.last_seen_at).total_seconds() < 300:
                online_count += 1
        uptime_pct = (online_count / len(sensors) * 100.0) if sensors else None

        # 4. Active alerts & incidents
        active_alerts_res = await session.execute(
            select(func.count(Alert.id)).where(and_(Alert.site_id == site_id, Alert.status == AlertStatus.ACTIVE))
        )
        active_alerts = active_alerts_res.scalar() or 0

        open_inc_res = await session.execute(
            select(func.count(Incident.id)).where(
                and_(Incident.site_id == site_id, Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.ACKNOWLEDGED, IncidentStatus.INVESTIGATING]))
            )
        )
        open_incidents = open_inc_res.scalar() or 0

        res_inc_res = await session.execute(
            select(func.count(Incident.id)).where(
                and_(Incident.site_id == site_id, Incident.status.in_([IncidentStatus.RESOLVED, IncidentStatus.CLOSED]))
            )
        )
        resolved_incidents = res_inc_res.scalar() or 0

        # 5. Manpower present today
        today = date.today()
        manpower_res = await session.execute(
            select(func.sum(Manpower.actual_headcount)).where(
                and_(Manpower.project_id == site.project_id if site else False, Manpower.date == today)
            )
        )
        manpower_present = int(manpower_res.scalar() or 0)

        # 6. MTTR (Mean time to resolve) in hours
        resolved_times_res = await session.execute(
            select(Incident.created_at, Incident.resolved_at).where(
                and_(Incident.site_id == site_id, Incident.resolved_at.is_not(None))
            )
        )
        times = resolved_times_res.all()
        durations = [(r[1] - r[0]).total_seconds() / 3600.0 for r in times if r[0] and r[1]]
        mttr_hours = round(sum(durations) / len(durations), 1) if durations else 0.0

        return {
            "site_id": site_id,
            "overall_progress_pct": round(progress_pct, 1),
            "ppe_compliance_pct": round(ppe_pct, 1) if ppe_pct is not None else None,
            "sensor_uptime_pct": round(uptime_pct, 1) if uptime_pct is not None else None,
            "active_alerts": active_alerts,
            "open_incidents": open_incidents,
            "resolved_incidents": resolved_incidents,
            "manpower_present": manpower_present,
            "mttr_hours": mttr_hours,
            "metrics": {
                "total_sensors": len(sensors),
                "online_sensors": online_count,
            },
        }

    async def calculate_risk_scores(self, site_id: uuid.UUID, session: AsyncSession) -> Dict[str, Any]:
        """
        Calculates site and per-zone dynamic safety risk score (0-100).

        NOTE: this is a hand-weighted heuristic (weights below), not a learned or
        validated model. Treat scores as an ordinal indicator only.
        """
        zones_res = await session.execute(select(Zone).where(Zone.site_id == site_id))
        zones = zones_res.scalars().all()

        zone_scores = []
        overall_factors = []

        # Get active alerts for site
        alerts_res = await session.execute(
            select(Alert).where(and_(Alert.site_id == site_id, Alert.status == AlertStatus.ACTIVE))
        )
        alerts = alerts_res.scalars().all()

        # PPE summary
        ppe = await self.cv_repo.get_ppe_summary(site_id=str(site_id))
        comp_rate = ppe.get("compliance_rate")  # site-wide; None when no CV data

        for z in zones:
            z_alerts = [a for a in alerts if a.zone_id == z.id]
            crit_alerts = len([a for a in z_alerts if a.severity == AlertSeverity.CRITICAL])
            warn_alerts = len([a for a in z_alerts if a.severity == AlertSeverity.WARNING])

            # Base score from zone risk level
            base_multiplier = {"low": 1.0, "medium": 1.3, "high": 1.7}.get(z.risk_level.lower(), 1.0)
            factors = []

            score = 0.0
            if crit_alerts > 0:
                score += crit_alerts * 30.0
                factors.append(f"{crit_alerts} critical alert(s) active")
            if warn_alerts > 0:
                score += warn_alerts * 12.0
                factors.append(f"{warn_alerts} warning alert(s) active")
            if comp_rate is not None and comp_rate < 90.0:
                score += (100.0 - comp_rate) * 0.5
                factors.append(f"Sub-optimal PPE compliance ({comp_rate:.1f}%)")

            score = min(score * base_multiplier, 100.0)
            risk_label = "Low" if score < 30 else ("Medium" if score < 65 else ("High" if score < 85 else "Critical"))

            zone_scores.append({
                "zone_id": str(z.id),
                "zone_name": z.name,
                "risk_score": round(score, 1),
                "risk_level": risk_label,
                "contributing_factors": factors or ["Normal baseline operations"],
            })

        avg_score = (sum(zs["risk_score"] for zs in zone_scores) / len(zone_scores)) if zone_scores else 15.0
        overall_label = "Low" if avg_score < 30 else ("Medium" if avg_score < 65 else ("High" if avg_score < 85 else "Critical"))

        return {
            "site_id": site_id,
            "overall_risk_score": round(avg_score, 1),
            "risk_level": overall_label,
            "zones": zone_scores,
        }

    def predict_forecast(
        self, historical_values: List[float], horizon_steps: int = 7
    ) -> Dict[str, Any]:
        """
        Ordinary-least-squares linear trend on equally spaced observations, extrapolated
        `horizon_steps` steps past the last observation, with a 95% prediction interval
        (Student-t, n-2 degrees of freedom). The trend is reported as increasing or
        decreasing only when the slope's 95% confidence interval excludes zero.

        With fewer than 3 observations no forecast is produced (insufficient_data);
        nothing is fabricated.
        """
        values = [float(v) for v in historical_values if v is not None]
        n = len(values)
        if n < 3:
            return {
                "current_value": round(values[-1], 2) if values else None,
                "forecast_value": None,
                "trend_direction": "insufficient_data",
                "confidence_interval": None,
                "n_observations": n,
            }

        x = np.arange(n, dtype=float)
        y = np.array(values, dtype=float)
        slope, intercept = np.polyfit(x, y, 1)

        # Last observation is at x = n - 1, so h steps ahead is x0 = n - 1 + h
        x0 = (n - 1) + horizon_steps
        forecast = float(slope * x0 + intercept)

        residuals = y - (slope * x + intercept)
        dof = n - 2
        s_err = float(np.sqrt(np.sum(residuals ** 2) / dof)) if dof > 0 else 0.0
        x_mean = float(x.mean())
        sxx = float(np.sum((x - x_mean) ** 2))
        t_crit = _t_critical_95(dof)

        pred_se = s_err * np.sqrt(1.0 + 1.0 / n + (x0 - x_mean) ** 2 / sxx)
        lower = forecast - t_crit * pred_se
        upper = forecast + t_crit * pred_se

        slope_se = s_err / np.sqrt(sxx)
        if slope - t_crit * slope_se > 0:
            direction = "increasing"
        elif slope + t_crit * slope_se < 0:
            direction = "decreasing"
        else:
            direction = "stable"

        return {
            "current_value": round(float(y[-1]), 2),
            "forecast_value": round(forecast, 2),
            "trend_direction": direction,
            "confidence_interval": [round(float(lower), 2), round(float(upper), 2)],
            "n_observations": n,
        }

    async def generate_report_file(
        self,
        report_type: str,
        file_format: str,
        site_id: Optional[uuid.UUID],
        session: AsyncSession,
        storage: StorageDriver,
    ) -> Tuple[str, bytes]:
        """
        Generates PDF, CSV, or XLSX report and saves to storage.
        Returns (storage_key, file_bytes).
        """
        kpis = await self.calculate_kpis(site_id, session) if site_id else {}
        df = pd.DataFrame([{
            "Report Type": report_type,
            "Generated At": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
            "Site ID": str(site_id) if site_id else "All Sites",
            "Overall Progress (%)": kpis.get("overall_progress_pct", 0),
            "PPE Compliance (%)": kpis.get("ppe_compliance_pct", 0),
            "Sensor Uptime (%)": kpis.get("sensor_uptime_pct", 0),
            "Active Alerts": kpis.get("active_alerts", 0),
            "Open Incidents": kpis.get("open_incidents", 0),
            "MTTR (Hours)": kpis.get("mttr_hours", 0),
        }])

        fmt = file_format.lower()
        if fmt == "csv":
            content = df.to_csv(index=False).encode("utf-8")
            ext = "csv"
            ctype = "text/csv"
        elif fmt == "xlsx":
            out = io.BytesIO()
            df.to_excel(out, index=False, engine="openpyxl")
            content = out.getvalue()
            ext = "xlsx"
            ctype = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else:
            # PDF
            from reportlab.lib.pagesizes import letter
            from reportlab.pdfgen import canvas
            buffer = io.BytesIO()
            p = canvas.Canvas(buffer, pagesize=letter)
            p.setFont("Helvetica-Bold", 18)
            p.drawString(50, 750, f"BuildTrack - {report_type.replace('_', ' ').title()} Report")
            p.setFont("Helvetica", 11)
            p.drawString(50, 725, f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')} | Site: {site_id or 'Global'}")
            y = 680
            for col in df.columns:
                p.drawString(50, y, f"{col}: {df.iloc[0][col]}")
                y -= 25
            p.showPage()
            p.save()
            content = buffer.getvalue()
            ext = "pdf"
            ctype = "application/pdf"

        file_key = f"reports/{uuid.uuid4()}.{ext}"
        await storage.save_file("reports", file_key, content, content_type=ctype)
        return file_key, content


analytics_engine = AnalyticsEngine()
