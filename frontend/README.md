# BuildTrack Frontend — Control Room Web Application

Production-grade real-time IoT monitoring, AI computer vision safety, and construction operations platform built with **Next.js 16 (App Router)** and **React 19**.

---

## 1. Technology Stack

- **Framework**: Next.js `16.4.2` (App Router, Turbopack, standalone output)
- **Runtime**: React `19.3.0` + TypeScript 5 (Strict Mode)
- **Styling**: Tailwind CSS v4 + Radix UI Primitives + Lucide Icons
- **Real-Time Telemetry**: Socket.IO Client (`/live` namespace) + Zustand (30-point ring buffer)
- **Server State & Caching**: TanStack React Query v5
- **GIS Cartography**: Leaflet + React-Leaflet (GeoJSON geofences, sensor & camera markers)
- **Charts & Visualizations**: Recharts + Custom SVG Sparklines & Speedometer Risk Gauges
- **Form & Schema Validation**: React Hook Form + Zod
- **Testing**: Vitest + JSDOM + React Testing Library

---

## 2. Quickstart (Local Development)

```bash
# 1. Enter frontend directory
cd frontend

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Start local development server
npm run dev
```

Visit **`http://localhost:3000`** in your browser.

### Demo Accounts for Fast Sign-In:

| Role | Email | Password | Access Scope |
|---|---|---|---|
| **Admin** | `admin@buildtrack.com` | `Admin@123456` | Full system access, RBAC, and audit logs |
| **Safety Officer** | `safety@buildtrack.com` | `Safety@123456` | Live CCTV wall, PPE lightbox, alert acknowledgment |
| **Project Manager**| `pm@buildtrack.com` | `Manager@123456` | Project Gantt schedules, BOQ, materials |

---

## 3. Environment Configuration

All environment variables are strictly validated at runtime with Zod in `src/env.ts`.

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_APP_NAME` | `BuildTrack` | App branding name |
| `API_BASE_URL` | `http://127.0.0.1:8000` | Backend FastAPI server URL (BFF only) |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:8000` | WebSocket / Socket.IO server URL |
| `NEXT_PUBLIC_USE_MOCKS` | `false` | Enable standalone telemetry simulator |
| `SESSION_COOKIE_SECURE` | `false` | Cookie secure attribute (`true` in production) |

---

## 4. Key Functional Areas

1. **Branded Auth** (`/login`, `/forgot-password`):
   - Secure httpOnly session cookies (`bt_access_token`, `bt_refresh_token`).
   - 1-click demo role selector buttons.
2. **Dashboard Overview** (`/dashboard`):
   - Executive KPIs with dynamic SVG sparklines.
   - Real-time 0-100 risk speedometer gauge.
   - Meteorological weather station diagnostics.
   - Subsystem operational health banner (Postgres, Mongo, Redis, Storage, CV, MQTT).
   - Live threshold alert stream with inline 1-click acknowledgment.
3. **Live Monitoring & CCTV Wall** (`/live`):
   - **Sensors Grid**: Sub-second live telemetry cards (PM2.5, Noise, CO, Temp, Humidity, Vibration, Wind).
   - **Slide-over Historical Drawer**: 30-point live ring buffer.
   - **Camera Wall**: 1x1, 2x2, 3x3, 4x4 grid presets.
   - **HTML5 Canvas CV Overlay**: Real-time bounding boxes with class confidence scores and violation highlights.
4. **Safety & PPE Compliance** (`/safety`):
   - Compliance percentage gauges.
   - Violation snapshot gallery with enlarged lightbox modal.
   - Drag-and-drop interactive test image analyzer.
   - CV model confidence threshold and alert rule tuning.
5. **Interactive Site Map** (`/site-map`):
   - Leaflet GIS cartography with polygon hazard zones.
   - Real-time sensor & camera hardware markers.
   - Zone inspector and geofence creation editor.
6. **Alerts Center** (`/alerts`):
   - Filter by active, acknowledged, resolved, or severity.
   - Bulk acknowledgment and detailed timeline context drawer.
7. **Incident Management & Kanban** (`/incidents`, `/incidents/[id]`):
   - 5-column drag-and-drop Kanban lifecycle board.
   - Ticket detail page with timeline comments, root-cause notes, and file attachments.
8. **Automated Rules Engine** (`/rules`):
   - Declarative predicate builder (Metric, Operator, Threshold, Window).
   - Live plain-English sentence preview.
   - Dry-run test simulator with instant evaluation feedback.
9. **Projects & Schedule** (`/projects`, `/projects/[id]`):
   - Work Breakdown Structure (WBS) with interactive Gantt timeline visualizer.
   - Bill of Quantities (BOQ) with variance and spend tracking.
   - Manpower daily trade attendance and logistics delivery tracking.
   - Architectural & Structural drawings repository with revision tags.
10. **Notification Center** (`/notifications`):
    - Desktop Web Push notification registration.
    - Test alert dispatch and multi-channel preferences.
11. **Admin & Security Audit** (`/admin`):
    - Role-Based Access Control (RBAC) operator directory.
    - Immutable security audit logs.
    - Component health diagnostics with round-trip latency.
12. **Control Room Utilities**:
    - Global Cmd+K spotlight palette (`<CommandPalette />`).
    - Fullscreen TV Wall mode.
    - Error boundary (`/error`), 403 Forbidden (`/403`), 404 (`/not-found`), and Offline status (`/offline`).
    - Component design system catalog (`/dev/components`).

---

## 5. Verification & Testing

```bash
# Run unit tests (Zustand store, RBAC, Rule predicates)
npm test

# Run TypeScript strict type-check
npx tsc --noEmit

# Compile production standalone build
npm run build
```

---

## 6. Docker-Ready Deployment

Refer to [`docs/DOCKER_LATER.md`](docs/DOCKER_LATER.md) for the multi-stage production Dockerfile and container health check configuration.
