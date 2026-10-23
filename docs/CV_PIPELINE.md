# Computer Vision (CV) Pipeline Documentation

BuildTrack uses a high-performance, multi-model Computer Vision pipeline tailored for construction site safety monitoring, Personal Protective Equipment (PPE) compliance, heavy machinery detection, and collision hazard avoidance.

---

## 1. Pipeline Architecture

The CV pipeline combines detection models into a unified inference and safety analysis engine:

```
[ Camera Stream / Video Feed ]
              │
    ┌─────────┴─────────┐
    ▼                   ▼
[ Live MJPEG Stream ] [ Dropped-Frame Queue (size=1) ]
  (zero-latency)        │ (decoupled async analysis)
                        ▼
                [ CVDetector Multi-Model ]
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
    [ Model 1: COCO ]         [ Model 2: PPE & Machinery ]
    (e.g., yolov8n.pt)        (e.g., construction_ppe.pt)
          │                           │
          └─────────────┬─────────────┘
                        ▼
            [ Detection Deduplication & NMS ]
                        │
                        ▼
            [ PPE & Proximity Rules Engine ]
             • Per-worker PPE compliance (helmet & vest)
             • Heavy machinery counts (excavators, dump trucks, cranes, etc.)
             • Worker-near-machinery proximity hazard calculation
                        │
                        ▼
            [ Alerts & Real-time Event Outbox ]
             • WARNING: PPE violation (missing helmet/vest)
             • CRITICAL: Worker in danger proximity of active machinery
```

---

## 2. Models & Pre-Trained Weights

Pre-trained weights are located in `backend/data/models/`:

| Model File | Source / Architecture | Primary Classes Detected |
| :--- | :--- | :--- |
| `data/models/yolov8n.pt` | Ultralytics COCO YOLOv8n (6.2 MB) | `person`, `truck`, `car`, `bus` |
| `data/models/construction_ppe.pt` | Fine-tuned Construction Safety YOLOv8 (6.25 MB) | `hardhat`, `safety vest`, `excavators`, `dump truck`, `wheel loader`, `no-hardhat`, `no-safety vest` |
| `data/models/hardhat_head.pt` | Keremberke Hard Hat Detection YOLOv8n (6.22 MB) | `Hardhat`, `NO-Hardhat` |

### Multi-Model Merge Logic
- **Person Deduplication**: If multiple models detect the same person (IoU $\ge 0.45$), the box with highest confidence is retained.
- **Machinery Specificity**: If a generic COCO model detects a `truck` and the construction model detects `excavators` or `dump truck` for the same bounding box, the specialized construction machinery class is retained.
- **PPE Association**: Helmets and vests are preserved and mapped directly to the enclosing worker bounding box.

---

## 3. Supported Classes & Canonical Vocabulary

Public construction datasets use varying labels. The rules engine normalizes them into a single canonical vocabulary:

- **Workers**: `person`, `worker`
- **Required PPE**: `helmet` (`hardhat`, `hard_hat`), `vest` (`safety_vest`)
- **Violations / Missing PPE**: `no_helmet` (`no_hardhat`, `head`), `no_vest` (`no_safety_vest`)
- **Optional PPE**: `gloves`, `mask`, `boots` (`safety_shoes`)
- **Heavy Machinery**:
  - `excavator` (`excavators`, `digger`, `backhoe`)
  - `crane` (`tower_crane`, `mobile_crane`, `gantry_crane`)
  - `dump_truck` (`dump_trucks`, `tipper`)
  - `truck` (`trucks`, `heavy_truck`, `concrete_truck`)
  - `loader` (`wheel_loader`, `front_loader`)
  - `bulldozer` (`dozer`)
  - `forklift`

---

## 4. Proximity Hazard Detection (`person_near_machinery`)

Whenever a worker's bounding box is within `MACHINERY_PROXIMITY_MARGIN_PX` (default: `60.0` px) or overlaps with active heavy machinery (`excavator`, `crane`, `dump_truck`, `loader`, `bulldozer`, `forklift`):

1. **Hazard Flagged**:
   - Computes minimum Euclidean distance between the bounding boxes.
   - Detects collision/overlap (`distance = 0.0px`).
2. **Visual Annotation**:
   - Bounding boxes for machinery are drawn in deep sky blue with class labels.
   - A bright red connecting line and distance badge are drawn between the worker and the vehicle.
   - A top alert banner `CRITICAL HAZARD: X WORKER(S) NEAR MACHINERY` is rendered.
3. **Automated Alerting**:
   - Stored in MongoDB `cv_detections` with `machinery_hazards` and `equipment_counts`.
   - Generates a **CRITICAL** severity `Alert` in PostgreSQL.
   - Publishes outbox event `machinery:proximity_hazard`.
   - Governed by Redis dedup cooldown (`MACHINERY_ALERT_COOLDOWN_SECONDS`, default: 180s).

---

## 5. Configuration & Dropping in Custom Weights

### Environment Configuration (`.env`)

```ini
# Computer Vision Mode: 'yolo' or 'mock'
CV_MODE=yolo

# Comma-separated paths to YOLO weights
CV_MODEL_PATHS=./data/models/yolov8n.pt,./data/models/construction_ppe.pt

# Minimum confidence threshold (0.1 to 1.0)
CV_CONFIDENCE_THRESHOLD=0.35

# Frame analysis target rate
CV_INFERENCE_FPS=2

# Alert cooldowns in seconds
PPE_ALERT_COOLDOWN_SECONDS=300
MACHINERY_ALERT_COOLDOWN_SECONDS=180

# Hazard proximity margin in pixels
MACHINERY_PROXIMITY_MARGIN_PX=60.0
```

### Adding New or Custom Trained Weights
1. Place your `.pt` file in `backend/data/models/` (e.g. `my_crane_model.pt`).
2. Add its path to `CV_MODEL_PATHS` in `.env`:
   ```ini
   CV_MODEL_PATHS=./data/models/yolov8n.pt,./data/models/construction_ppe.pt,./data/models/my_crane_model.pt
   ```
3. Restart or update configuration dynamically via the API (`PUT /api/v1/cv/config`).
4. If a model file cannot be loaded, the system logs an error and falls back gracefully to `mock-fallback` without crashing the application or stream.

---

## 6. Streaming Performance Optimizations

1. **Decoupled Asynchronous Queue**: The camera stream loop uses an `asyncio.Queue(maxsize=1)`. Frame grabbing and MJPEG streaming are never blocked by inference latency. If inference is busy, intermediate frames are dropped so live viewing remains at full FPS.
2. **Elimination of Re-Decode**: Raw video frames are decoded once upon capture and passed directly as in-memory numpy arrays (`frame_ndarray`), avoiding redundant JPEG compression and decompression before inference.
3. **Adaptive Downscaling**: High-resolution inputs (such as 4K video feeds) are downscaled to 1280px for inference, with bounding box coordinates rescaled back to the native resolution for annotations.
