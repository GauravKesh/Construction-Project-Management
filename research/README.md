# BuildTrack — Team Guide for the Project Report and Research Paper

This folder helps the team turn the BuildTrack project into (a) a **project report** and (b) a **research paper**. It does not replace the root [README.md](../README.md), which explains how to run the system.

| File | What it is | Who reads it |
|---|---|---|
| `README.md` (this file) | How to work: reading order, task split, evidence checklist, rules | Everyone |
| [report_research.md](report_research.md) | The full content bank: every section of the report and the paper, with facts taken from the code, and `[TODO]` slots for numbers we still have to measure | Everyone writing text |

---

## 1. The one rule that matters

**Only write claims the project can back up.** The code is honest about its own limits, and the report must be too. Three things are easy to get wrong:

1. **The computer-vision detector is a mock by default** (`CV_MODE=mock`). It ignores the image, reports one person, and injects a missing-helmet violation on every 4th frame. Its output is labelled `detector: mock`. *Never* report mock output as detection accuracy, PPE compliance, or a CV result.
2. **All sensor data is simulated** (`backend/scripts/mqtt_sensor_simulator.py` and `device-simulator/`). Spikes are chosen to exceed the seeded rule thresholds. This tests the *pipeline*, not the *rules*.
3. **No PPE-trained YOLO weights ship with the repo.** The default `yolov8n.pt` is a COCO model with no helmet or vest classes.

If a number in the report did not come from a run we can reproduce (commit hash + seed + config), it does not go in. Use the `[TODO: measure]` markers in `report_research.md` as the to-do list.

---

## 2. Suggested reading order (about 90 minutes)

1. Root [README.md](../README.md): architecture diagram, processing guarantees, section 6 "Research use".
2. [run.md](../run.md): how to start everything with `./start.sh`.
3. [audit/report.md](../audit/report.md) and [audit/auditreport_Test.md](../audit/auditreport_Test.md): feature and test audits. Their "Corrections" notes at the top matter. Several older numbers were wrong (see section 6 below).
4. [device-simulator/README.md](../device-simulator/README.md): how the synthetic data is made.
5. [report_research.md](report_research.md): the content bank.
6. Skim the code in this order: `backend/app/processing/` (validation, rule engine, anomaly, analytics), `backend/app/cv/` (PPE logic), `backend/app/workers/stream_worker.py`, `backend/app/realtime/`.

---

## 3. Where the facts live (so you can verify, not trust)

| Topic | Source of truth |
|---|---|
| System architecture, data stores | root `README.md` §1, `backend/app/db/` |
| Validation ranges, dedup | `backend/app/processing/validation.py` |
| Rule engine (operators, duration, cooldown, event time) | `backend/app/processing/rule_engine.py` |
| Anomaly detection (rolling z-score) | `backend/app/processing/anomaly.py` |
| Cross-event correlation | `backend/app/processing/event_processor.py` |
| PPE per-person logic | `backend/app/cv/ppe_rules.py` |
| Detector (mock vs YOLO) | `backend/app/cv/detector.py`, `mock_detector.py` |
| Intrusion / tamper detection | `backend/app/cv/security.py` |
| Camera audio analysis | `backend/app/ingestion/audio_analyzer.py` |
| Risk score, KPIs, forecast, reports | `backend/app/processing/analytics.py` |
| Stream worker, retries, DLQ | `backend/app/workers/stream_worker.py` |
| Transactional outbox, Socket.IO | `backend/app/realtime/` |
| Auth, RBAC, rate limit | `backend/app/core/security.py`, `backend/app/gateway/rbac.py`, `backend/app/core/rate_limit.py` |
| All settings and defaults | `backend/app/core/config.py` |
| Seed data (sites, sensors, rules, cameras) | `backend/scripts/seed.py` |
| API surface | `backend/docs/openapi.json` (79 paths, 112 operations) |
| Tests | `backend/tests/`, `frontend/src/tests/`, `device-simulator/tests/` |
| Prometheus metrics | `backend/app/core/metrics.py` |

---

## 4. Two documents, two audiences

| | Project report | Research paper |
|---|---|---|
| Question it answers | *What did we build and does it work?* | *What did we learn that others can reuse?* |
| Reader | Examiner, guide, client | Reviewers, researchers |
| Length | 40 to 70 pages | 6 to 10 pages (conference) |
| Weight | Breadth: requirements, design, implementation, testing | Depth: one or two research questions, method, results, threats to validity |
| Contribution claim | "We implemented X" | "We show Y, measured by Z" |

`report_research.md` Part A is the report (chapter by chapter). Part B is the paper (section by section). Part C is the evidence you must still collect. Part D is reference material (tables, glossary, citations to verify).

**Recommended paper angle** (the most defensible one given what exists): *a reproducible, event-time, event-driven architecture for construction-site monitoring, evaluated for correctness (replay determinism, at-least-once delivery, idempotence), latency, and alert quality on labelled synthetic streams, with a PPE-detection component evaluated on a public dataset.* Do not pitch it as a new deep-learning model.

---

## 5. Work split (adjust to your team size)

| Role | Owns | Main inputs | Output |
|---|---|---|---|
| **Lead / integrator** | Abstract, introduction, conclusion, final consistency pass | Everything | Final PDF/DOCX |
| **Architecture writer** | Chapters 4 to 6 (design, data, pipeline) | `report_research.md` Part A.4 to A.6, code | Diagrams + text |
| **Backend/data writer** | Ingestion, validation, rules, anomaly, outbox | `backend/app/processing`, `workers` | Algorithm descriptions + pseudo-code |
| **CV/ML writer** | PPE logic, detector, dataset, training, evaluation | `backend/app/cv/`, public PPE dataset | Section 7 + results table |
| **Frontend/UX writer** | UI modules, screenshots, RBAC views | `frontend/src/app` | Chapter 8 + figures |
| **Experiments owner** | Latency, throughput, replay, alert-quality runs | Part C of `report_research.md` | CSVs, plots, results tables |
| **Literature owner** | Related work, references | Part D.4 | `.bib` file with *verified* citations |

Agree one person to run experiments so every number comes from one machine and one configuration.

---

## 6. Known inconsistencies in the repo documents (fix or cite carefully)

Verified against the code on 2026-10-23. Check again before submission.

| Claim in a document | What the code shows |
|---|---|
| Root README / run.md: "63 backend tests" | `pytest --collect-only` reports **82** tests |
| `audit/report.md`: "27 tables" (also `backend/README.md`) | **26** `__tablename__` definitions in `backend/app/db/models/` |
| `audit/report.md`: JWT access token 15 min | `ACCESS_TOKEN_EXPIRE_MINUTES = 60` in `config.py` (refresh 7 days) |
| `audit/report.md`: roles include `CONTRACTOR` | `UserRole` has `admin`, `project_manager`, `safety_officer`, `site_engineer`, `viewer` |
| `audit/report.md`: lists tables like `boq_items`, `daily_logs`, `cost_codes`, `budget_items`, `expenses` | Not all exist as models; the models include `boq_items`, `manpower`, `materials`, `drawings`, `schedules`, `kpi_rollups`, `ppe_compliance_ts`, `alert_counts_ts`, `device_tokens`, `report_metadata`, `notification_preferences` |
| `audit/report.md`: "Detects gloves, boots, goggles" | The required PPE set is **helmet + vest**; gloves, boots, mask are optional classes and unused in the compliance decision |
| `audit/report.md`: MQTT topic `construction/+/+/telemetry` | Default subscription is `sites/+/sensors/#`; topic scheme is `sites/{site_id}/sensors/{type}/{sensor_id}` |
| `backend/app/core/metrics.py` defines an alert-latency histogram and a validation-error counter | `ALERT_CREATION_LATENCY_SECONDS` and `VALIDATION_ERRORS_TOTAL` are **never recorded** anywhere in `app/`; do not cite them as measurements |
| `event_processor.py` has `check_anomaly_zscore` | Dead code; the worker uses `processing/anomaly.py` (`score_reading`) |
| `audit/report.md`: email and webhook notifications | Providers default to `console`; SMTP/Twilio/FCM are configured but not verified end to end |
| `audit/report.md`: "ML predictive risk factor weights" | Risk score is a hand-weighted heuristic; forecast is OLS linear regression |
| Default `INGEST_API_KEY` is a hard-coded string in `config.py` | Fine for a demo; say so, and do not call it production security |

When these documents and the code disagree, **the code wins**. Fix the document or cite the code.

---

## 7. Evidence checklist (collect before writing results)

Create `research/evidence/` (git-ignored if large) and save everything with a run ID such as `2026-11-02_seed2026_a1b2c3d`.

- [ ] Commit hash (`git rev-parse --short HEAD`), OS, CPU, RAM, Python/Node versions
- [ ] The `.env` used (remove secrets)
- [ ] Architecture diagram (redraw from root README §1; do not paste ASCII)
- [ ] Screenshots: login, dashboard, live monitoring, safety/PPE, site map, alerts, incidents Kanban, rules builder, analytics, admin audit log (light and dark theme if relevant)
- [ ] Database ER diagram (generate from the models or Alembic schema)
- [ ] Sensor run: `python scripts/mqtt_sensor_simulator.py --seed 2026 --cycles 100 --labels-out runs/sensors_seed2026.csv`
- [ ] Alert export for the same window (to join with the labels)
- [ ] Latency measurements (end-to-end, p50/p95/p99), see Part C of `report_research.md`
- [ ] Throughput test (sustained messages/second until lag grows)
- [ ] Replay determinism test (same input twice gives identical alerts)
- [ ] Failure-injection results (kill worker mid-stream, restart broker)
- [ ] PPE model: dataset name and licence, split sizes, training config, per-class precision/recall/mAP
- [ ] Test output: `pytest -q`, `npm test` (screenshot or text)
- [ ] Anything from real hardware or real footage, with consent and licence notes

---

## 8. Ethics and licensing (do not skip)

- **Video files** in `videos/` have filenames that look like stock-video-site IDs. Confirm the licence of each before putting frames in a publication or a public repository.
- **Footage of real workers is personal data.** Real site video needs consent, a retention policy, anonymisation (face blurring), and, for a paper, ethics-committee or institute approval.
- **Datasets**: cite the dataset and respect its licence. State the train/validation/test split.
- **Demo credentials** (`admin@buildtrack.com` and others) are for local demos only. Do not print them in a published paper; use "demo accounts".
- **Do not overclaim safety**: this is a decision-support prototype, not a certified safety system. Say that in the report.

---

## 9. Writing rules

1. One claim, one source: a number, a code reference, or a citation.
2. Every figure and table is referenced in the text and has a caption saying what to conclude.
3. Name things as the code does (`stream:ingest`, `sensor_readings`, `rule_engine`) the first time, then use plain words.
4. Report limitations in the body, not only in the conclusion.
5. Terminology: say *simulated telemetry*, *mock detector*, *heuristic risk score*, *linear-trend forecast*. Do not say *AI-powered prediction* or *ML risk model*.
6. Keep one glossary (Part D.2) and one reference list; do not let each writer keep their own.
7. Write results with uncertainty: n, seed count, confidence interval or min/median/max.

---

## 10. Suggested timeline (4 weeks)

| Week | Goal |
|---|---|
| 1 | Everyone reads; split chapters; set up evidence folder; experiments owner fixes the test machine and config; literature owner starts the `.bib` |
| 2 | First drafts of design and implementation chapters; run latency, throughput, replay, failure experiments; start PPE dataset training |
| 3 | Results chapter and paper draft; CV evaluation; figures and tables finalised; related work |
| 4 | Integration pass, consistency check (numbers, names), plagiarism and citation check, proofreading, final export |

---

## 11. Before you submit — final checks

- [ ] No mock-detector output presented as a CV result
- [ ] Every number traceable to a run ID, a test, or a code reference
- [ ] Test counts re-run on the final commit (not copied from old docs)
- [ ] Every citation verified (title, authors, year, venue exist and say what you claim)
- [ ] Figures readable in greyscale and at print size
- [ ] Limitations and threats-to-validity sections present
- [ ] Licences and consent noted for videos and datasets
- [ ] No secrets or personal data in screenshots
- [ ] Team names, guide name, institute, and date correct on the title page
