from app.cv.detector import merge_model_detections
from app.cv.ppe_rules import box_distance, evaluate_frame_ppe, required_classes_supported


def _det(cls, bbox, conf=0.9):
    return {"class_name": cls, "confidence": conf, "bbox": bbox}


def test_one_workers_helmet_does_not_cover_another():
    # Worker A (left) wears helmet + vest; worker B (right) wears only a vest.
    detections = [
        _det("person", [0, 0, 100, 300]),
        _det("helmet", [30, 5, 70, 40]),
        _det("vest", [20, 80, 80, 180]),
        _det("person", [200, 0, 300, 300]),
        _det("vest", [220, 80, 280, 180]),
    ]
    result = evaluate_frame_ppe(detections)
    assert result["compliant"] is False
    assert result["persons_count"] == 2
    assert result["violating_persons"] == 1
    assert result["missing_ppe"] == ["missing_helmet"]


def test_fully_equipped_workers_are_compliant():
    detections = [
        _det("Person", [0, 0, 100, 300]),
        _det("Hardhat", [30, 5, 70, 40]),
        _det("Safety Vest", [20, 80, 80, 180]),
    ]
    result = evaluate_frame_ppe(detections)
    assert result["compliant"] is True
    assert result["persons_count"] == 1
    assert result["violating_persons"] == 0


def test_helmet_held_at_waist_is_not_worn():
    detections = [
        _det("person", [0, 0, 100, 300]),
        _det("helmet", [30, 200, 70, 240]),  # bottom part of the body box
        _det("vest", [20, 80, 80, 180]),
    ]
    assert evaluate_frame_ppe(detections)["missing_ppe"] == ["missing_helmet"]


def test_negative_classes_without_person_boxes_count_as_violations():
    detections = [_det("NO-Hardhat", [10, 10, 50, 50]), _det("NO-Safety Vest", [100, 100, 150, 200])]
    result = evaluate_frame_ppe(detections)
    assert result["compliant"] is False
    assert result["violating_persons"] == 2
    assert result["missing_ppe"] == ["missing_helmet", "missing_vest"]


def test_empty_frame_has_no_persons():
    result = evaluate_frame_ppe([])
    assert result["compliant"] is True
    assert result["persons_count"] == 0


def test_coco_labels_cannot_express_ppe():
    assert not required_classes_supported(["person", "bicycle", "car"])
    assert required_classes_supported(["Person", "Hardhat", "NO-Safety Vest"])


def test_equipment_counts_and_machinery_proximity_hazard():
    # Worker at [100, 100, 180, 300] is 30px away from excavator at [210, 100, 450, 400]
    detections = [
        _det("person", [100, 100, 180, 300]),
        _det("hardhat", [120, 105, 160, 140]),
        _det("safety_vest", [110, 145, 170, 240]),
        _det("excavators", [210, 100, 450, 400]),
        _det("dump_truck", [600, 100, 800, 400]),
    ]
    result = evaluate_frame_ppe(detections, proximity_margin=50.0)
    assert result["compliant"] is True
    assert result["equipment_counts"] == {"excavator": 1, "dump_truck": 1}
    assert result["has_machinery_hazard"] is True
    assert len(result["machinery_hazards"]) == 1
    hazard = result["machinery_hazards"][0]
    assert hazard["machinery_type"] == "excavator"
    assert hazard["distance"] == 30.0
    assert hazard["overlapping"] is False


def test_worker_overlapping_machinery_triggers_collision_hazard():
    detections = [
        _det("person", [100, 100, 200, 300]),
        _det("crane", [150, 150, 400, 500]),
    ]
    result = evaluate_frame_ppe(detections)
    assert result["has_machinery_hazard"] is True
    hazard = result["machinery_hazards"][0]
    assert hazard["overlapping"] is True
    assert hazard["distance"] == 0.0


def test_worker_at_safe_distance_has_no_machinery_hazard():
    detections = [
        _det("person", [0, 0, 50, 100]),
        _det("wheel_loader", [300, 300, 500, 500]),
    ]
    result = evaluate_frame_ppe(detections, proximity_margin=60.0)
    assert result["has_machinery_hazard"] is False
    assert result["equipment_counts"] == {"loader": 1}


def test_multi_model_merge_deduplicates_overlapping_persons():
    raw_detections = [
        _det("person", [100, 100, 200, 350], conf=0.92),  # COCO model
        _det("person", [102, 98, 201, 348], conf=0.78),   # PPE model
        _det("hardhat", [120, 102, 180, 145], conf=0.88), # PPE model
        _det("safety_vest", [110, 150, 190, 260], conf=0.85),
    ]
    merged = merge_model_detections(raw_detections)
    person_dets = [d for d in merged if d["class_name"] == "person"]
    assert len(person_dets) == 1
    assert person_dets[0]["confidence"] == 0.92
    assert any(d["class_name"] == "hardhat" for d in merged)
    assert any(d["class_name"] == "safety_vest" for d in merged)


def test_multi_model_merge_prioritizes_specific_equipment_over_truck():
    raw_detections = [
        _det("truck", [200, 200, 600, 500], conf=0.80),       # Generic COCO
        _det("dump_truck", [205, 195, 595, 505], conf=0.88),  # Construction model
    ]
    merged = merge_model_detections(raw_detections)
    assert len(merged) == 1
    assert merged[0]["class_name"] == "dump_truck"


def test_head_only_model_counts_compliant_workers():
    detections = [
        _det("helmet", [10, 10, 50, 50]),
        _det("no_helmet", [100, 10, 150, 50]),
    ]
    result = evaluate_frame_ppe(detections)
    assert result["persons_count"] == 2
    assert result["violating_persons"] == 1
    assert result["compliant"] is False

