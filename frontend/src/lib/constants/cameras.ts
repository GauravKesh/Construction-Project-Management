export interface ConstructionCamera {
  id: string;
  camera_code: string;
  name: string;
  location: string;
  zone: string;
  url: string;
  rtsp_url: string;
  resolution: string;
  fps: number;
  status: "active" | "streaming" | "inactive";
  is_cv_enabled: boolean;
  description: string;
}

export const ALL_CONSTRUCTION_CAMERAS: ConstructionCamera[] = [
  {
    id: "cam-01",
    camera_code: "CAM-01",
    name: "CAM-01: Main Concourse & Gate",
    location: "North Perimeter Entry #1",
    zone: "Gate 1 Checkpoint",
    url: "/videos/19241054-hd_1920_1080_30fps.mp4",
    rtsp_url: "/videos/19241054-hd_1920_1080_30fps.mp4",
    resolution: "1920x1080 @ 30fps",
    fps: 30,
    status: "active",
    is_cv_enabled: true,
    description: "Main worker gate access, turnstiles, and biometric PPE checkpoint",
  },
  {
    id: "cam-02",
    camera_code: "CAM-02",
    name: "CAM-02: Tower Crane Mast & Hook",
    location: "Crane Hub Tower B - L42",
    zone: "Tower Crane Radius",
    url: "/videos/19832492-hd_1920_1080_25fps.mp4",
    rtsp_url: "/videos/19832492-hd_1920_1080_25fps.mp4",
    resolution: "1920x1080 @ 25fps",
    fps: 25,
    status: "active",
    is_cv_enabled: true,
    description: "High-elevation hook load tracking, blind spot visual, and jib radius sweep",
  },
  {
    id: "cam-03",
    camera_code: "CAM-03",
    name: "CAM-03: Excavation & Structural Foundation",
    location: "Basement Sub-grade Sector 4",
    zone: "Excavation Pit A",
    url: "/videos/5674342-hd_1920_1080_30fps.mp4",
    rtsp_url: "/videos/5674342-hd_1920_1080_30fps.mp4",
    resolution: "1920x1080 @ 30fps",
    fps: 30,
    status: "active",
    is_cv_enabled: true,
    description: "Sheet piling, sub-grade foundation pit, and shoring wall slope stability",
  },
  {
    id: "cam-04",
    camera_code: "CAM-04",
    name: "CAM-04: High-Rise Superstructure & Deck",
    location: "Level 18 Formwork Concourse",
    zone: "Superstructure Deck",
    url: "/videos/13751987_3840_2160_50fps.mp4",
    rtsp_url: "/videos/13751987_3840_2160_50fps.mp4",
    resolution: "3840x2160 4K UHD @ 50fps",
    fps: 50,
    status: "active",
    is_cv_enabled: true,
    description: "Formwork deck, rebar grid tying, and active concrete pump discharge",
  },
  {
    id: "cam-05",
    camera_code: "CAM-05",
    name: "CAM-05: Heavy Earthmoving & Fleet Depot",
    location: "South Gate Logistics Yard",
    zone: "Heavy Plant Yard",
    url: "/videos/12229456_3840_2160_24fps.mp4",
    rtsp_url: "/videos/12229456_3840_2160_24fps.mp4",
    resolution: "3840x2160 4K UHD @ 24fps",
    fps: 24,
    status: "active",
    is_cv_enabled: true,
    description: "Excavators, articulated dumpers, and heavy earthmoving vehicle routes",
  },
  {
    id: "cam-06",
    camera_code: "CAM-06",
    name: "CAM-06: Scaffold Perimeter & Safety Netting",
    location: "East Facade Safety Curtain",
    zone: "Scaffolding Zone B",
    url: "/videos/8792814-uhd_3840_2160_30fps.mp4",
    rtsp_url: "/videos/8792814-uhd_3840_2160_30fps.mp4",
    resolution: "3840x2160 4K UHD @ 30fps",
    fps: 30,
    status: "active",
    is_cv_enabled: true,
    description: "External multi-tier suspended scaffolding, harness anchors, and perimeter netting",
  },
  {
    id: "cam-07",
    camera_code: "CAM-07",
    name: "CAM-07: Vertical Slipform Core & Hoist Shaft",
    location: "Central Core Jumpform L28",
    zone: "Core Slipform Lift",
    url: "/videos/13387809_2160_3840_60fps.mp4",
    rtsp_url: "/videos/13387809_2160_3840_60fps.mp4",
    resolution: "2160x3840 4K @ 60fps",
    fps: 60,
    status: "active",
    is_cv_enabled: true,
    description: "Hydraulic jumpform core tower, construction hoist vertical shaft, and drop zones",
  },
  {
    id: "cam-08",
    camera_code: "CAM-08",
    name: "CAM-08: Structural Steel Assembly & Deck",
    location: "Western Span Girders Bay 3",
    zone: "Structural Steel Frame",
    url: "/videos/13261762_3840_2160_24fps.mp4",
    rtsp_url: "/videos/13261762_3840_2160_24fps.mp4",
    resolution: "3840x2160 4K UHD @ 24fps",
    fps: 24,
    status: "active",
    is_cv_enabled: true,
    description: "Heavy steel truss erection, high-strength torque bolting, and welding deck",
  },
];
