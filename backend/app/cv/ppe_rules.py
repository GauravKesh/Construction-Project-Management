from typing import Any, Dict, List, Optional, Sequence
import math

# PPE every person must wear
REQUIRED_PPE_CLASSES = ["helmet", "vest"]
OPTIONAL_PPE_CLASSES = ["gloves", "boots", "mask"]

# Public construction-PPE and heavy equipment datasets name things differently.
# Map them onto one canonical vocabulary.
CLASS_ALIASES = {
    # Persons / workers
    "person": "person",
    "worker": "person",
    # Helmets / hardhats
    "helmet": "helmet",
    "hardhat": "helmet",
    "hard_hat": "helmet",
    "with_helmet": "helmet",
    "no_helmet": "no_helmet",
    "no_hardhat": "no_helmet",
    "without_helmet": "no_helmet",
    "head": "no_helmet",  # SHWD-style datasets label a bare head as "head"
    # Vests / high-vis
    "vest": "vest",
    "safety_vest": "vest",
    "with_vest": "vest",
    "no_vest": "no_vest",
    "no_safety_vest": "no_vest",
    "without_vest": "no_vest",
    # Optional safety gear
    "gloves": "gloves",
    "mask": "mask",
    "safety_shoes": "boots",
    "boots": "boots",
    # Heavy machinery and site equipment
    "excavator": "excavator",
    "excavators": "excavator",
    "digger": "excavator",
    "backhoe": "excavator",
    "crane": "crane",
    "tower_crane": "crane",
    "mobile_crane": "crane",
    "gantry_crane": "crane",
    "dump_truck": "dump_truck",
    "dump_trucks": "dump_truck",
    "tipper": "dump_truck",
    "truck": "truck",
    "trucks": "truck",
    "heavy_truck": "truck",
    "concrete_truck": "truck",
    "loader": "loader",
    "wheel_loader": "loader",
    "front_loader": "loader",
    "bulldozer": "bulldozer",
    "dozer": "bulldozer",
    "forklift": "forklift",
    "machinery": "machinery",
    "barricade": "barricade",
    "dumpster": "dumpster",
    "safety_net": "safety_net",
}

NEGATIVE_CLASSES = {"no_helmet": "helmet", "no_vest": "vest"}

# Machinery categories that pose crushing / strike-by danger to workers on foot
HAZARD_MACHINERY_CLASSES = {
    "crane",
    "excavator",
    "dump_truck",
    "truck",
    "loader",
    "bulldozer",
    "forklift",
    "machinery",
}

# All equipment classes tracked for site inventory & counts
EQUIPMENT_CLASSES = HAZARD_MACHINERY_CLASSES | {"barricade", "dumpster", "safety_net"}

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


def box_distance(box1: Sequence[float], box2: Sequence[float]) -> float:
    """
    Calculates minimum Euclidean distance between two 2D axis-aligned bounding boxes.
    Returns 0.0 if the boxes intersect/overlap.
    """
    dx = max(0.0, max(box1[0] - box2[2], box2[0] - box1[2]))
    dy = max(0.0, max(box1[1] - box2[3], box2[1] - box1[3]))
    return math.hypot(dx, dy)


def evaluate_frame_ppe(
    detections: List[Dict[str, Any]],
    proximity_margin: float = 60.0,
) -> Dict[str, Any]:
    """
    Per-person PPE compliance and machinery proximity analysis for one frame.

    Each PPE item (or explicit "no-PPE" detection) is assigned to the person box that
    contains its centre; a person is compliant only if every REQUIRED_PPE_CLASSES item
    is assigned to them and no negative class is.

    Also calculates:
    - equipment_counts: map of equipment type -> count (e.g. excavator, dump_truck, crane)
    - machinery_hazards: person boxes within proximity_margin or overlapping hazard machinery.

    Returns dict: compliant, missing_ppe, persons_count, violating_persons, persons,
    equipment_counts, machinery_hazards, has_machinery_hazard.
    """
    normalized = []
    for d in detections:
        bbox = d.get("bbox")
        if not bbox or len(bbox) != 4:
            continue
        c_norm = normalize_class(d.get("class_name", ""))
        conf = float(d.get("confidence", 0.0))
        normalized.append((c_norm, [float(v) for v in bbox], conf))

    person_boxes = [b for c, b, conf in normalized if c == "person"]
    items = [(c, b, conf) for c, b, conf in normalized if c != "person"]

    # Calculate equipment counts
    equipment_counts: Dict[str, int] = {}
    machinery_boxes: List[Dict[str, Any]] = []
    for c, b, conf in items:
        if c in EQUIPMENT_CLASSES:
            equipment_counts[c] = equipment_counts.get(c, 0) + 1
        if c in HAZARD_MACHINERY_CLASSES:
            machinery_boxes.append({"class_name": c, "bbox": b, "confidence": conf})

    persons: List[Dict[str, Any]] = []
    for pbox in person_boxes:
        worn = {c for c, b, _ in items if c in REQUIRED_PPE_CLASSES and _belongs_to(c, b, pbox)}
        flagged = {NEGATIVE_CLASSES[c] for c, b, _ in items if c in NEGATIVE_CLASSES and _belongs_to(c, b, pbox)}
        missing = sorted({req for req in REQUIRED_PPE_CLASSES if req not in worn} | flagged)
        persons.append({"bbox": pbox, "missing_ppe": [f"missing_{m}" for m in missing]})

    # Head/PPE-only model fallback when no person boxes are found
    if not person_boxes:
        for c, b, _ in items:
            if c in NEGATIVE_CLASSES:
                persons.append({"bbox": b, "missing_ppe": [f"missing_{NEGATIVE_CLASSES[c]}"]})
            elif c == "helmet":
                # Positively worn helmet without person box counts as compliant person
                persons.append({"bbox": b, "missing_ppe": []})

    violating = [p for p in persons if p["missing_ppe"]]
    missing_all = sorted({m for p in violating for m in p["missing_ppe"]})

    # Proximity hazard detection: Person within danger margin of active machinery
    machinery_hazards: List[Dict[str, Any]] = []
    for p in persons:
        pbox = p["bbox"]
        for m in machinery_boxes:
            mbox = m["bbox"]
            dist = box_distance(pbox, mbox)
            if dist <= proximity_margin:
                machinery_hazards.append({
                    "person_bbox": pbox,
                    "machinery_bbox": mbox,
                    "machinery_type": m["class_name"],
                    "distance": round(dist, 2),
                    "overlapping": dist == 0.0,
                })

    return {
        "compliant": not violating,
        "missing_ppe": missing_all,
        "persons_count": len(persons),
        "violating_persons": len(violating),
        "persons": persons,
        "equipment_counts": equipment_counts,
        "machinery_hazards": machinery_hazards,
        "has_machinery_hazard": bool(machinery_hazards),
    }


def required_classes_supported(model_class_names: Optional[Sequence[str]]) -> bool:
    """True if a detector's label set can express every required PPE item."""
    if not model_class_names:
        return False
    names = {normalize_class(n) for n in model_class_names}
    return all(req in names or f"no_{req}" in names for req in REQUIRED_PPE_CLASSES)

