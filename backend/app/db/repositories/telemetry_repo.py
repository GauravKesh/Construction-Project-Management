import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import pymongo
from app.db.mongo import get_mongo_db

logger = logging.getLogger(__name__)


class TelemetryRepository:
    def __init__(self, db: Optional[AsyncIOMotorDatabase] = None):
        self.db = db if db is not None else get_mongo_db()

    async def insert_reading(
        self,
        sensor_id: str,
        site_id: str,
        sensor_type: str,
        value: float,
        unit: str,
        ts: datetime,
        zone_id: Optional[str] = None,
        battery: Optional[float] = None,
        location: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Inserts a reading into the time-series collection 'sensor_readings'.
        """
        doc = {
            "ts": ts,
            "meta": {
                "sensor_id": sensor_id,
                "site_id": site_id,
                "type": sensor_type,
                "zone_id": zone_id,
            },
            "value": float(value),
            "unit": unit,
            "battery": battery,
            "location": location,
        }
        # Time-series collections cannot carry a unique index, so make retried
        # stream messages idempotent by checking for the (sensor_id, ts) pair first.
        existing = await self.db.sensor_readings.find_one(
            {"meta.sensor_id": sensor_id, "ts": ts}, {"_id": 1}
        )
        if existing is None:
            await self.db.sensor_readings.insert_one(doc)
        return doc

    async def count_readings(self, site_id: str, from_ts: datetime, to_ts: datetime) -> int:
        return await self.db.sensor_readings.count_documents(
            {"meta.site_id": site_id, "ts": {"$gte": from_ts, "$lt": to_ts}}
        )

    async def upsert_sensor_latest(
        self,
        sensor_id: str,
        site_id: str,
        sensor_type: str,
        value: float,
        unit: str,
        ts: datetime,
        zone_id: Optional[str] = None,
        battery: Optional[float] = None,
        location: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Upserts the latest sensor document in 'sensor_latest'.
        """
        update_doc = {
            "$set": {
                "sensor_id": sensor_id,
                "site_id": site_id,
                "type": sensor_type,
                "value": float(value),
                "unit": unit,
                "ts": ts,
                "zone_id": zone_id,
                "battery": battery,
                "location": location,
                "updated_at": datetime.now(timezone.utc),
            }
        }
        await self.db.sensor_latest.update_one(
            {"sensor_id": sensor_id},
            update_doc,
            upsert=True,
        )
        return update_doc["$set"]

    async def get_sensor_latest(self, sensor_id: str) -> Optional[Dict[str, Any]]:
        doc = await self.db.sensor_latest.find_one({"sensor_id": sensor_id}, {"_id": 0})
        return doc

    async def get_site_latest_readings(self, site_id: str) -> List[Dict[str, Any]]:
        cursor = self.db.sensor_latest.find({"site_id": site_id}, {"_id": 0})
        return await cursor.to_list(length=500)

    async def get_readings_range(
        self,
        sensor_id: str,
        from_ts: datetime,
        to_ts: datetime,
        interval: str = "5m",
        agg: str = "avg",
    ) -> List[Dict[str, Any]]:
        """
        Downsampled range query using MongoDB aggregation pipeline.
        Intervals: 1m, 5m, 1h, 1d.
        Aggregations: avg, min, max, count.
        """
        # Map interval to dateTrunc unit/binSize
        unit_map = {
            "1m": ("minute", 1),
            "5m": ("minute", 5),
            "1h": ("hour", 1),
            "1d": ("day", 1),
        }
        date_unit, bin_size = unit_map.get(interval, ("minute", 5))

        match_stage = {
            "$match": {
                "meta.sensor_id": sensor_id,
                "ts": {"$gte": from_ts, "$lte": to_ts},
            }
        }

        group_stage = {
            "$group": {
                "_id": {
                    "$dateTrunc": {
                        "date": "$ts",
                        "unit": date_unit,
                        "binSize": bin_size,
                    }
                },
                "avg_value": {"$avg": "$value"},
                "min_value": {"$min": "$value"},
                "max_value": {"$max": "$value"},
                "count": {"$sum": 1},
                "unit": {"$first": "$unit"},
            }
        }

        sort_stage = {"$sort": {"_id": 1}}

        pipeline = [match_stage, group_stage, sort_stage]
        cursor = self.db.sensor_readings.aggregate(pipeline)
        results = []
        async for doc in cursor:
            results.append({
                "bucket": doc["_id"].isoformat() if isinstance(doc["_id"], datetime) else str(doc["_id"]),
                "avg": round(doc.get("avg_value", 0.0), 2) if doc.get("avg_value") is not None else 0.0,
                "min": doc.get("min_value"),
                "max": doc.get("max_value"),
                "count": doc.get("count", 0),
                "unit": doc.get("unit"),
            })
        return results

    async def record_rejected_message(
        self, raw_payload: Any, reason: str, sensor_id: Optional[str] = None
    ) -> None:
        doc = {
            "payload": raw_payload,
            "reason": reason,
            "sensor_id": sensor_id,
            "ts": datetime.now(timezone.utc),
        }
        await self.db.rejected_messages.insert_one(doc)

    async def get_raw_readings(
        self, sensor_id: str, limit: int = 50
    ) -> List[Dict[str, Any]]:
        cursor = (
            self.db.sensor_readings.find({"meta.sensor_id": sensor_id}, {"_id": 0})
            .sort("ts", pymongo.DESCENDING)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)
