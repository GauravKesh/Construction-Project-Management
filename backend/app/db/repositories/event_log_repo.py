from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
import pymongo
from app.db.mongo import get_mongo_db


class EventLogRepository:
    def __init__(self, db: Optional[AsyncIOMotorDatabase] = None):
        self.db = db if db is not None else get_mongo_db()

    async def log_event(
        self,
        event_type: str,
        site_id: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        severity: str = "info",
        correlation_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        doc = {
            "event_type": event_type,
            "site_id": site_id,
            "severity": severity,
            "payload": payload or {},
            "correlation_id": correlation_id,
            "ts": datetime.now(timezone.utc),
        }
        await self.db.event_log.insert_one(doc)
        return doc

    async def list_events(
        self,
        site_id: Optional[str] = None,
        event_type: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {}
        if site_id:
            query["site_id"] = site_id
        if event_type:
            query["event_type"] = event_type

        cursor = (
            self.db.event_log.find(query, {"_id": 0})
            .sort("ts", pymongo.DESCENDING)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)
