from app.cv.ppe_rules import evaluate_frame_ppe, required_classes_supported


def _det(cls, bbox):
    return {"class_name": cls, "confidence": 0.9, "bbox": bbox}


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
