from typing import Any, Dict, List, Optional, Sequence

# PPE every person must wear
REQUIRED_PPE_CLASSES = ["helmet", "vest"]
OPTIONAL_PPE_CLASSES = ["gloves", "boots", "mask"]

# Public construction-PPE datasets name the same things differently
# (e.g. "Hardhat" / "NO-Hardhat" / "Safety Vest"). Map them onto one vocabulary.
CLASS_ALIASES = {
    "person": "person",
    "worker": "person",
    "helmet": "helmet",
    "hardhat": "helmet",
    "hard_hat": "helmet",
    "with_helmet": "helmet",
    "vest": "vest",
    "safety_vest": "vest",
    "with_vest": "vest",
    "no_helmet": "no_helmet",
    "no_hardhat": "no_helmet",
    "without_helmet": "no_helmet",
    "head": "no_helmet",  # SHWD-style datasets label a bare head as "head"
    "no_vest": "no_vest",
    "no_safety_vest": "no_vest",
    "without_vest": "no_vest",
}
NEGATIVE_CLASSES = {"no_helmet": "helmet", "no_vest": "vest"}

# A helmet must sit in the top part of the person box to count as worn
HELMET_MAX_RELATIVE_HEIGHT = 0.4


def normalize_class(name: str) -> str:
    key = str(name).strip().lower().replace("-", "_").replace(" ", "_")
    return CLASS_ALIASES.get(key, key)


def _center(bbox: Sequence[float]):
    x1, y1, x2, y2 = bbox
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0


def _inside(point, bbox: Sequence[float]) -> bool:
    x, y = point
    x1, y1, x2, y2 = bbox
    return x1 <= x <= x2 and y1 <= y <= y2


def _belongs_to(item_cls: str, item_bbox: Sequence[float], person_bbox: Sequence[float]) -> bool:
    cx, cy = _center(item_bbox)
    if not _inside((cx, cy), person_bbox):
        return False
    if item_cls in ("helmet", "no_helmet"):
        _, py1, _, py2 = person_bbox
        return cy <= py1 + (py2 - py1) * HELMET_MAX_RELATIVE_HEIGHT
    return True


def evaluate_frame_ppe(detections: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Per-person PPE compliance for one frame.

    Each PPE item (or explicit "no-PPE" detection) is assigned to the person box that
    contains its centre; a person is compliant only if every REQUIRED_PPE_CLASSES item
    is assigned to them and no negative class is. This avoids the frame-level error
    where one worker's helmet masks another worker's bare head.

    If the model detects no person boxes (head/PPE-only models), each negative
    detection is counted as one violating person.

    Returns dict: compliant, missing_ppe, persons_count, violating_persons, persons.
    """
    normalized = []
    for d in detections:
        bbox = d.get("bbox")
        if not bbox or len(bbox) != 4:
            continue
        normalized.append((normalize_class(d.get("class_name", "")), [float(v) for v in bbox]))

    person_boxes = [b for c, b in normalized if c == "person"]
    items = [(c, b) for c, b in normalized if c != "person"]

    persons: List[Dict[str, Any]] = []
    for pbox in person_boxes:
        worn = {c for c, b in items if c in REQUIRED_PPE_CLASSES and _belongs_to(c, b, pbox)}
        flagged = {NEGATIVE_CLASSES[c] for c, b in items if c in NEGATIVE_CLASSES and _belongs_to(c, b, pbox)}
        missing = sorted({req for req in REQUIRED_PPE_CLASSES if req not in worn} | flagged)
        persons.append({"bbox": pbox, "missing_ppe": [f"missing_{m}" for m in missing]})

    if not person_boxes:
        for c, b in items:
            if c in NEGATIVE_CLASSES:
                persons.append({"bbox": b, "missing_ppe": [f"missing_{NEGATIVE_CLASSES[c]}"]})

    violating = [p for p in persons if p["missing_ppe"]]
    missing_all = sorted({m for p in violating for m in p["missing_ppe"]})
    return {
        "compliant": not violating,
        "missing_ppe": missing_all,
        "persons_count": len(persons),
        "violating_persons": len(violating),
        "persons": persons,
    }


def required_classes_supported(model_class_names: Optional[Sequence[str]]) -> bool:
    """True if a detector's label set can express every required PPE item."""
    if not model_class_names:
        return False
    names = {normalize_class(n) for n in model_class_names}
    return all(req in names or f"no_{req}" in names for req in REQUIRED_PPE_CLASSES)
