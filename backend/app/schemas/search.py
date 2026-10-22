from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class SearchResultItem(BaseModel):
    id: str
    type: str  # incident, alert, audit
    title: str
    description: Optional[str] = None
    created_at: datetime
    metadata: Dict[str, Any] = {}


class SearchResponse(BaseModel):
    query: str
    total_results: int
    results: List[SearchResultItem]
