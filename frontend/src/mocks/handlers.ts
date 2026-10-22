import { http, HttpResponse } from "msw";

export const MOCK_PROJECT_ID = "4921c420-b413-48f3-b935-8fecf7708ce3";
export const MOCK_SITE_ID = "0907d5cb-7682-48b7-b78d-c999ce138f34";

export const handlers = [
  // Auth Me
  http.get("*/api/v1/auth/me", () => {
    return HttpResponse.json({
      id: "usr-admin-01",
      email: "admin@buildtrack.com",
      full_name: "Gaurav Sharma (Admin)",
      role: "admin",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
    });
  }),

  // Dashboard summary
  http.get("*/api/v1/dashboard/summary", ({ request }) => {
    return HttpResponse.json({
      site_id: MOCK_SITE_ID,
      site_name: "East Wing Commercial Site",
      project_name: "Transit Hub Project",
      safety_score: 94.2,
      active_workers: 142,
      open_alerts_count: 3,
      critical_alerts_count: 1,
      incidents_this_month: 2,
      sensor_health_pct: 98.5,
      weather: {
        temp_c: 28.5,
        humidity_pct: 58,
        wind_speed_kmh: 12.4,
        air_quality_index: "Moderate",
        condition: "Partly Cloudy",
      },
      kpis: [
        { key: "safe_man_hours", label: "Safe Man-Hours", value: "148,250", change: "+12.4%", trend: "up" },
        { key: "active_permits", label: "Active Permits", value: "8", change: "0%", trend: "neutral" },
        { key: "ppe_compliance", label: "PPE Compliance", value: "96.4%", change: "+2.1%", trend: "up" },
        { key: "schedule_variance", label: "Schedule Variance", value: "-1.5 days", change: "On Track", trend: "up" },
      ],
      system_health: {
        postgres: "healthy",
        mongodb: "healthy",
        redis: "healthy",
        storage: "healthy",
        cv_engine: "healthy",
        mqtt_broker: "healthy",
      },
    });
  }),

  // Projects list
  http.get("*/api/v1/projects", () => {
    return HttpResponse.json([
      {
        id: MOCK_PROJECT_ID,
        name: "Transit Hub & Commercial Center",
        code: "TH-2026-A",
        status: "active",
        client_name: "Metropolitan Infrastructure Authority",
        budget: 45000000,
        start_date: "2025-06-01",
        target_end_date: "2027-12-31",
        completion_pct: 38.5,
        created_at: "2025-06-01T00:00:00Z",
      },
      {
        id: "proj-residential-02",
        name: "Skyline Heights Residential Towers",
        code: "SH-2026-B",
        status: "active",
        client_name: "Vertex Realty Group",
        budget: 28000000,
        start_date: "2025-09-15",
        target_end_date: "2027-06-30",
        completion_pct: 22.0,
        created_at: "2025-09-15T00:00:00Z",
      },
    ]);
  }),

  // Project sites
  http.get("*/api/v1/projects/:id/sites", () => {
    return HttpResponse.json([
      {
        id: MOCK_SITE_ID,
        project_id: MOCK_PROJECT_ID,
        name: "East Wing Commercial Site",
        code: "SITE-EW-01",
        latitude: 28.6139,
        longitude: 77.209,
        address: "Sector 14, Urban Corridor",
        is_active: true,
      },
      {
        id: "site-nw-02",
        project_id: MOCK_PROJECT_ID,
        name: "North Platform & Interchange",
        code: "SITE-NP-02",
        latitude: 28.6185,
        longitude: 77.214,
        address: "Platform Concourse Area",
        is_active: true,
      },
    ]);
  }),

  // Site map data
  http.get("*/api/v1/sites/:id/map", () => {
    return HttpResponse.json({
      site_id: MOCK_SITE_ID,
      center: [28.6139, 77.209],
      zoom: 17,
      zones: [
        {
          id: "zone-excavation",
          name: "Deep Excavation Zone (Hazard Level High)",
          zone_type: "hazard",
          color: "#ef4444",
          coordinates: [
            [28.6145, 77.2085],
            [28.6146, 77.2098],
            [28.6138, 77.2099],
            [28.6137, 77.2086],
          ],
          requires_hard_hat: true,
          requires_vest: true,
          requires_harness: true,
        },
        {
          id: "zone-steel-assembly",
          name: "Steel Structure Assembly Area",
          zone_type: "work",
          color: "#f59e0b",
          coordinates: [
            [28.6136, 77.2085],
            [28.6135, 77.2097],
            [28.6128, 77.2096],
            [28.6129, 77.2084],
          ],
          requires_hard_hat: true,
          requires_vest: true,
          requires_harness: false,
        },
        {
          id: "zone-office-safe",
          name: "Site Office & Staging Yard",
          zone_type: "safe",
          color: "#10b981",
          coordinates: [
            [28.6148, 77.2075],
            [28.6149, 77.2083],
            [28.6135, 77.2083],
            [28.6134, 77.2074],
          ],
          requires_hard_hat: false,
          requires_vest: true,
          requires_harness: false,
        },
      ],
      sensors: [
        { id: "s-pm25-01", name: "Dust Monitor 01 (PM2.5)", type: "pm25", lat: 28.6142, lng: 77.2092, value: 45.2, unit: "µg/m³", status: "healthy" },
        { id: "s-noise-01", name: "Acoustic Sensor 01", type: "noise", lat: 28.614, lng: 77.2088, value: 76.5, unit: "dB", status: "healthy" },
        { id: "s-vib-01", name: "Structural Vibration 01", type: "vibration", lat: 28.6132, lng: 77.2091, value: 0.15, unit: "mm/s", status: "healthy" },
        { id: "s-gas-01", name: "CO Gas Detector", type: "gas_co", lat: 28.6144, lng: 77.2095, value: 1.2, unit: "ppm", status: "healthy" },
      ],
      cameras: [
        { id: "cam-main-gate", name: "North Gate Entrance (CV Enabled)", lat: 28.6147, lng: 77.2082, status: "streaming", resolution: "1080p", fps: 25 },
        { id: "cam-crane-01", name: "Tower Crane Hook Cam", lat: 28.6141, lng: 77.2093, status: "streaming", resolution: "1080p", fps: 24 },
        { id: "cam-excavation", name: "Excavation Pit Overview", lat: 28.6143, lng: 77.2087, status: "streaming", resolution: "720p", fps: 20 },
        { id: "cam-perimeter", name: "East Boundary Fence", lat: 28.6134, lng: 77.2098, status: "streaming", resolution: "720p", fps: 15 },
      ],
    });
  }),

  // Sensors list
  http.get("*/api/v1/sites/:id/sensors", () => {
    return HttpResponse.json([
      { id: "s-pm25-01", name: "PM2.5 Dust Monitor 01", type: "pm25", unit: "µg/m³", current_value: 42.5, battery: 94, status: "healthy", zone: "Excavation Zone" },
      { id: "s-pm10-01", name: "PM10 Coarse Dust Monitor", type: "pm10", unit: "µg/m³", current_value: 68.2, battery: 91, status: "healthy", zone: "Excavation Zone" },
      { id: "s-noise-01", name: "Perimeter Noise Level Sensor", type: "noise", unit: "dB", current_value: 74.8, battery: 88, status: "healthy", zone: "Boundary Wall" },
      { id: "s-temp-01", name: "Ambient Thermal Sensor", type: "temperature", unit: "°C", current_value: 29.4, battery: 99, status: "healthy", zone: "Central Yard" },
      { id: "s-hum-01", name: "Relative Humidity Sensor", type: "humidity", unit: "%", current_value: 62.0, battery: 99, status: "healthy", zone: "Central Yard" },
      { id: "s-gas-01", name: "CO Gas Leak Detector", type: "gas_co", unit: "ppm", current_value: 1.4, battery: 85, status: "healthy", zone: "Generator Shed" },
      { id: "s-vib-01", name: "Retaining Wall Vibration Monitor", type: "vibration", unit: "mm/s", current_value: 0.12, battery: 92, status: "healthy", zone: "Retaining Wall B" },
      { id: "s-wind-01", name: "Anemometer Wind Speed Sensor", type: "wind_speed", unit: "km/h", current_value: 14.5, battery: 78, status: "healthy", zone: "Crane Jib Top" },
    ]);
  }),

  // Cameras list
  http.get("*/api/v1/sites/:id/cameras", () => {
    return HttpResponse.json([
      { id: "cam-main-gate", name: "Main Entry Gate (CV Active)", location: "Security Post 1", rtsp_url: "rtsp://mock-cam/gate", status: "streaming", fps: 24, resolution: "1920x1080", is_cv_enabled: true },
      { id: "cam-crane-01", name: "Tower Crane Hook Camera", location: "Crane 01 Jib", rtsp_url: "rtsp://mock-cam/crane", status: "streaming", fps: 25, resolution: "1920x1080", is_cv_enabled: true },
      { id: "cam-excavation", name: "Pit Excavation Overview", location: "Mast 4", rtsp_url: "rtsp://mock-cam/pit", status: "streaming", fps: 20, resolution: "1280x720", is_cv_enabled: true },
      { id: "cam-perimeter", name: "South Perimeter Yard", location: "Pole 8", rtsp_url: "rtsp://mock-cam/south", status: "streaming", fps: 15, resolution: "1280x720", is_cv_enabled: false },
    ]);
  }),

  // Alerts
  http.get("*/api/v1/alerts", () => {
    return HttpResponse.json([
      {
        id: "alt-001",
        site_id: MOCK_SITE_ID,
        title: "High Particulate Dust Concentration (PM2.5)",
        message: "PM2.5 reading exceeded 65 µg/m³ threshold for 15 minutes at Excavation Zone.",
        severity: "critical",
        status: "active",
        reading_value: 78.4,
        threshold_value: 65.0,
        sensor_id: "s-pm25-01",
        created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        acknowledged_at: null,
        acknowledged_by: null,
      },
      {
        id: "alt-002",
        site_id: MOCK_SITE_ID,
        title: "Perimeter Noise Exceedance",
        message: "Noise sensor registered 84 dB exceeding maximum boundary allowance of 80 dB.",
        severity: "warning",
        status: "acknowledged",
        reading_value: 84.1,
        threshold_value: 80.0,
        sensor_id: "s-noise-01",
        created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
        acknowledged_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
        acknowledged_by: "safety@buildtrack.com",
      },
      {
        id: "alt-003",
        site_id: MOCK_SITE_ID,
        title: "PPE Violation: Missing Hard Hat",
        message: "Computer vision flagged worker without required helmet in High Hazard Zone.",
        severity: "warning",
        status: "active",
        reading_value: null,
        threshold_value: null,
        sensor_id: null,
        created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        acknowledged_at: null,
        acknowledged_by: null,
      },
      {
        id: "alt-004",
        site_id: MOCK_SITE_ID,
        title: "Crane Wind Speed Advisory",
        message: "Wind gust reached 32 km/h. Approaching operational hold threshold (38 km/h).",
        severity: "info",
        status: "resolved",
        reading_value: 32.2,
        threshold_value: 30.0,
        sensor_id: "s-wind-01",
        created_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
        acknowledged_at: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
        acknowledged_by: "pm@buildtrack.com",
      },
    ]);
  }),

  // Incidents list
  http.get("*/api/v1/incidents", () => {
    return HttpResponse.json([
      {
        id: "inc-101",
        site_id: MOCK_SITE_ID,
        title: "Hydraulic Fluid Spill near Crane 01",
        description: "Approximately 15 liters of hydraulic oil leaked during crane routine maintenance. Spill kit deployed.",
        status: "under_investigation",
        severity: "medium",
        assigned_to: "Vikram Mehta (Field Engineer)",
        reported_by: "safety@buildtrack.com",
        location: "Crane Staging Bay 3",
        created_at: new Date(Date.now() - 1000 * 3600 * 6).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 3600 * 2).toISOString(),
      },
      {
        id: "inc-102",
        site_id: MOCK_SITE_ID,
        title: "Unsecured Scaffolding Planks on Level 4",
        description: "Wind caused loose wooden planks to rattle. Shift halted on West facade until toe-boards secured.",
        status: "action_required",
        severity: "high",
        assigned_to: "Rajesh Kumar (Scaffolding Lead)",
        reported_by: "safety@buildtrack.com",
        location: "Block B - West Facade L4",
        created_at: new Date(Date.now() - 1000 * 3600 * 18).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 3600 * 12).toISOString(),
      },
      {
        id: "inc-103",
        site_id: MOCK_SITE_ID,
        title: "Excavation Perimeter Barricade Breach",
        description: "Delivery truck backed into temporary barrier pole. Barrier replaced with concrete blocks.",
        status: "resolved",
        severity: "low",
        assigned_to: "Sunil Verma (Site Supervisor)",
        reported_by: "pm@buildtrack.com",
        location: "Gate 2 Access Ramp",
        created_at: new Date(Date.now() - 1000 * 3600 * 48).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 3600 * 24).toISOString(),
      },
      {
        id: "inc-104",
        site_id: MOCK_SITE_ID,
        title: "Electrical Panel Water Ingress Report",
        description: "Heavy rain splashed temporary distribution board. Power isolated, sealed enclosure installed.",
        status: "closed",
        severity: "high",
        assigned_to: "Deepak Joshi (Master Electrician)",
        reported_by: "safety@buildtrack.com",
        location: "Basement 1 Electrical Room",
        created_at: new Date(Date.now() - 1000 * 3600 * 96).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 3600 * 72).toISOString(),
      },
    ]);
  }),

  // Safety PPE Summary
  http.get("*/api/v1/safety/ppe/summary", () => {
    return HttpResponse.json({
      site_id: MOCK_SITE_ID,
      compliance_rate: 96.4,
      total_detections_today: 1840,
      violations_today: 12,
      breakdown: {
        hard_hat: { compliant: 98.2, violations: 5 },
        hi_vis_vest: { compliant: 97.4, violations: 7 },
        safety_boots: { compliant: 99.1, violations: 2 },
        harness: { compliant: 95.8, violations: 1 },
      },
      hourly_trend: [
        { hour: "08:00", compliance: 98.1 },
        { hour: "10:00", compliance: 97.5 },
        { hour: "12:00", compliance: 94.2 },
        { hour: "14:00", compliance: 95.0 },
        { hour: "16:00", compliance: 96.8 },
      ],
    });
  }),

  // Safety PPE Violations gallery
  http.get("*/api/v1/safety/ppe/violations", () => {
    return HttpResponse.json([
      {
        id: "viol-1",
        camera_id: "cam-main-gate",
        camera_name: "Main Entry Gate",
        violation_type: "missing_hardhat",
        confidence: 0.94,
        ts: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        image_url: "https://images.unsplash.com/photo-1541888946425-d0fbb186156a?w=800&auto=format&fit=crop&q=60",
        bbox: [0.18, 0.22, 0.35, 0.31],
        status: "flagged",
      },
      {
        id: "viol-2",
        camera_id: "cam-excavation",
        camera_name: "Pit Excavation Overview",
        violation_type: "missing_vest",
        confidence: 0.91,
        ts: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
        image_url: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&auto=format&fit=crop&q=60",
        bbox: [0.32, 0.45, 0.65, 0.58],
        status: "reviewed",
      },
      {
        id: "viol-3",
        camera_id: "cam-crane-01",
        camera_name: "Tower Crane Hook Camera",
        violation_type: "missing_hardhat",
        confidence: 0.88,
        ts: new Date(Date.now() - 1000 * 120 * 60).toISOString(),
        image_url: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=800&auto=format&fit=crop&q=60",
        bbox: [0.25, 0.38, 0.42, 0.5],
        status: "dismissed",
      },
    ]);
  }),

  // Rules list
  http.get("*/api/v1/rules", () => {
    return HttpResponse.json([
      {
        id: "rule-1",
        name: "Dust PM2.5 Hazard Threshold",
        sensor_type: "pm25",
        operator: ">",
        threshold: 65,
        unit: "µg/m³",
        duration_minutes: 10,
        severity: "critical",
        is_active: true,
        action: "create_alert_and_notify",
        description: "Triggers critical alert and notifies site safety manager when PM2.5 exceeds 65 µg/m³ for 10 continuous minutes.",
      },
      {
        id: "rule-2",
        name: "Perimeter Noise Decibel Ceiling",
        sensor_type: "noise",
        operator: ">",
        threshold: 80,
        unit: "dB",
        duration_minutes: 5,
        severity: "warning",
        is_active: true,
        action: "create_alert",
        description: "Monitors boundary noise levels to ensure compliance with municipal environmental limits.",
      },
      {
        id: "rule-3",
        name: "Tower Crane High Wind Advisory",
        sensor_type: "wind_speed",
        operator: ">",
        threshold: 35,
        unit: "km/h",
        duration_minutes: 1,
        severity: "critical",
        is_active: true,
        action: "create_alert_and_halt_lift",
        description: "Requires immediate radio alert to crane operator when wind gusts exceed safety threshold.",
      },
      {
        id: "rule-4",
        name: "Structural Vibration Guard",
        sensor_type: "vibration",
        operator: ">",
        threshold: 0.8,
        unit: "mm/s",
        duration_minutes: 2,
        severity: "warning",
        is_active: true,
        action: "create_alert",
        description: "Detects excessive foundation vibration during sheet piling and heavy compaction work.",
      },
    ]);
  }),

  // CV Config
  http.get("*/api/v1/cv/config", () => {
    return HttpResponse.json({
      model_version: "yolov8m-construction-ppe-v2.1",
      confidence_threshold: 0.65,
      iou_threshold: 0.45,
      classes_enabled: {
        person: true,
        hardhat: true,
        no_hardhat: true,
        hi_vis_vest: true,
        no_hi_vis_vest: true,
        safety_boots: true,
        heavy_machinery: true,
      },
      alert_on_missing_hardhat: true,
      alert_on_missing_vest: true,
      sampling_rate_fps: 2,
    });
  }),

  // Analytics KPIs & Risk score
  http.get("*/api/v1/analytics/risk-score", () => {
    return HttpResponse.json({
      overall_risk_score: 24, // low risk (0-100)
      risk_category: "Low",
      safety_index: 94,
      environmental_index: 88,
      equipment_index: 92,
      trend_direction: "improving",
      factors: [
        { name: "Dust / Air Quality", impact_pct: 35, status: "moderate" },
        { name: "Working at Height", impact_pct: 25, status: "safe" },
        { name: "Heavy Equipment Movement", impact_pct: 20, status: "safe" },
        { name: "Weather Conditions", impact_pct: 20, status: "safe" },
      ],
    });
  }),

  http.get("*/api/v1/analytics/trends", () => {
    return HttpResponse.json({
      daily_metrics: [
        { date: "2026-10-16", dust_avg: 38, noise_avg: 71, violations: 4, incident_count: 0 },
        { date: "2026-10-17", dust_avg: 44, noise_avg: 74, violations: 6, incident_count: 1 },
        { date: "2026-10-18", dust_avg: 52, noise_avg: 76, violations: 5, incident_count: 0 },
        { date: "2026-10-19", dust_avg: 49, noise_avg: 72, violations: 3, incident_count: 0 },
        { date: "2026-10-20", dust_avg: 41, noise_avg: 69, violations: 2, incident_count: 0 },
        { date: "2026-10-21", dust_avg: 46, noise_avg: 73, violations: 5, incident_count: 1 },
        { date: "2026-10-22", dust_avg: 42, noise_avg: 70, violations: 2, incident_count: 0 },
      ],
    });
  }),

  // Project schedules (Gantt)
  http.get("*/api/v1/projects/:id/schedules", () => {
    return HttpResponse.json([
      { id: "sch-1", name: "Site Clearance & Bulk Excavation", start_date: "2025-06-01", end_date: "2025-10-15", progress_pct: 100, status: "completed", critical: true },
      { id: "sch-2", name: "Foundation Piling & Raft Slab", start_date: "2025-09-01", end_date: "2026-03-31", progress_pct: 100, status: "completed", critical: true },
      { id: "sch-3", name: "Substructure Concrete Pour (Basements 1-3)", start_date: "2026-02-15", end_date: "2026-08-30", progress_pct: 82, status: "in_progress", critical: true },
      { id: "sch-4", name: "Superstructure Steel Erection (Podium)", start_date: "2026-07-01", end_date: "2026-12-15", progress_pct: 45, status: "in_progress", critical: true },
      { id: "sch-5", name: "MEP Services & Drainage Rough-in", start_date: "2026-09-01", end_date: "2027-04-30", progress_pct: 20, status: "in_progress", critical: false },
      { id: "sch-6", name: "Facade Curtain Wall Installation", start_date: "2026-11-01", end_date: "2027-08-15", progress_pct: 0, status: "planned", critical: false },
    ]);
  }),

  // Project BOQ
  http.get("*/api/v1/projects/:id/boq", () => {
    return HttpResponse.json([
      { id: "boq-1", item_code: "03-3000", description: "Cast-in-Place Concrete C35/45", unit: "m³", estimated_qty: 18500, actual_qty: 11200, unit_price: 135, total_budget: 2497500, spent: 1512000 },
      { id: "boq-2", item_code: "05-1200", description: "Structural Steel Framing (Grade 350)", unit: "MT", estimated_qty: 2400, actual_qty: 1050, unit_price: 1850, total_budget: 4440000, spent: 1942500 },
      { id: "boq-3", item_code: "02-4116", description: "Earthwork Bulk Excavation", unit: "m³", estimated_qty: 62000, actual_qty: 62000, unit_price: 28, total_budget: 1736000, spent: 1736000 },
      { id: "boq-4", item_code: "03-2100", description: "Reinforcing Steel Deformed Bars (TMT)", unit: "MT", estimated_qty: 3200, actual_qty: 2100, unit_price: 920, total_budget: 2944000, spent: 1932000 },
    ]);
  }),

  // Health ready
  http.get("*/health/ready", () => {
    return HttpResponse.json({
      status: "ready",
      components: {
        postgres: { status: "up", latency_ms: 2.1 },
        mongodb: { status: "up", latency_ms: 1.4 },
        redis: { status: "up", latency_ms: 0.8 },
        storage: { status: "up", latency_ms: 1.2 },
        cv_engine: { status: "up", latency_ms: 4.5 },
      },
    });
  }),
];
