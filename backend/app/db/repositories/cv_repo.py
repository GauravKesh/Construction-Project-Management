from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import pymongo
from app.db.mongo import get_mongo_db


class CVRepository:
    def __init__(self, db: Optional[AsyncIOMotorDatabase] = None):
        self.db = db if db is not None else get_mongo_db()

    async def insert_detection(
        self,
        site_id: str,
        camera_id: str,
        ts: datetime,
        detections: List[Dict[str, Any]],
        persons_count: int,
        compliant: bool,
        missing_ppe: List[str],
        snapshot_key: Optional[str] = None,
        violating_persons: Optional[int] = None,
        detector: Optional[str] = None,
    ) -> Dict[str, Any]:
        doc = {
            "site_id": site_id,
            "camera_id": camera_id,
            "ts": ts,
            "detections": detections,
            "persons_count": persons_count,
            "compliant": compliant,
            "missing_ppe": missing_ppe,
            "snapshot_key": snapshot_key,
            "violating_persons": violating_persons,
            # Which detector produced this record (e.g. "mock", "yolo:<weights>"), so
            # synthetic and model-based detections can never be mixed up in analysis
            "detector": detector,
            "created_at": datetime.now(timezone.utc),
        }
        await self.db.cv_detections.insert_one(doc)
        return doc

    async def list_detections(
        self,
        site_id: Optional[str] = None,
        camera_id: Optional[str] = None,
        from_ts: Optional[datetime] = None,
        to_ts: Optional[datetime] = None,
        violation_only: bool = False,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {}
        if site_id:
            query["site_id"] = site_id
        if camera_id:
            query["camera_id"] = camera_id
        if violation_only:
            query["compliant"] = False

        if from_ts or to_ts:
            query["ts"] = {}
            if from_ts:
                query["ts"]["$gte"] = from_ts
            if to_ts:
                query["ts"]["$lte"] = to_ts

        cursor = (
            self.db.cv_detections.find(query, {"_id": 0})
            .sort("ts", pymongo.DESCENDING)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    async def get_ppe_summary(
        self,
        site_id: Optional[str] = None,
        from_ts: Optional[datetime] = None,
        to_ts: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        match_filter: Dict[str, Any] = {}
        if site_id:
            match_filter["site_id"] = site_id
        if from_ts or to_ts:
            match_filter["ts"] = {}
            if from_ts:
                match_filter["ts"]["$gte"] = from_ts
            if to_ts:
                match_filter["ts"]["$lte"] = to_ts

        pipeline = [
            {"$match": match_filter},
            {
                "$group": {
                    "_id": None,
                    "total_frames": {"$sum": 1},
                    "compliant_frames": {"$sum": {"$cond": ["$compliant", 1, 0]}},
                    "violations_frames": {"$sum": {"$cond": ["$compliant", 0, 1]}},
                    "total_persons": {"$sum": "$persons_count"},
                    "violating_persons": {"$sum": {"$ifNull": ["$violating_persons", 0]}},
                    "detectors": {"$addToSet": "$detector"},
                }
            },
        ]

        cursor = self.db.cv_detections.aggregate(pipeline)
        result = await cursor.to_list(length=1)
        if not result:
            # No frames means compliance is unknown, not 100%
            return {
                "total_frames": 0,
                "compliant_frames": 0,
                "violations_frames": 0,
                "compliance_rate": None,
                "total_persons": 0,
                "violating_persons": 0,
                "person_compliance_rate": None,
                "detectors": [],
            }

        data = result[0]
        total = data.get("total_frames", 0)
        compliant = data.get("compliant_frames", 0)
        persons = data.get("total_persons", 0)
        violating = data.get("violating_persons", 0)
        compliance_rate = round(compliant / total * 100.0, 2) if total > 0 else None
        person_rate = round((persons - violating) / persons * 100.0, 2) if persons > 0 else None

        return {
            "total_frames": total,
            "compliant_frames": compliant,
            "violations_frames": data.get("violations_frames", 0),
            "compliance_rate": compliance_rate,
            "total_persons": persons,
            "violating_persons": violating,
            "person_compliance_rate": person_rate,
            "detectors": sorted(d for d in data.get("detectors", []) if d),
        }

    async def record_frame_meta(self, camera_id: str, ts: datetime, fps: float) -> None:
        await self.db.camera_frames_meta.insert_one({
            "camera_id": camera_id,
            "ts": ts,
            "fps": fps,
        })
