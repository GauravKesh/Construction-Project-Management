import { create } from "zustand";

export interface ProjectItem {
  id: string;
  name: string;
  code: string;
}

export interface SiteItem {
  id: string;
  project_id: string;
  name: string;
  code: string;
}

interface ProjectState {
  activeProjectId: string;
  activeSiteId: string;
  currentProject: ProjectItem | null;
  currentSite: SiteItem | null;
  setActiveProject: (projectId: string) => void;
  setActiveSite: (siteId: string) => void;
  setCurrentProject: (proj: ProjectItem | null) => void;
  setCurrentSite: (site: SiteItem | null) => void;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, val: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(val)}; path=/; max-age=31536000; SameSite=Lax`;
}

const DEFAULT_PROJECT_ID = "4921c420-b413-48f3-b935-8fecf7708ce3";
const DEFAULT_SITE_ID = "0907d5cb-7682-48b7-b78d-c999ce138f34";

export const useProjectStore = create<ProjectState>((set) => ({
  activeProjectId: DEFAULT_PROJECT_ID,
  activeSiteId: DEFAULT_SITE_ID,
  currentProject: null,
  currentSite: null,

  setActiveProject: (projectId) => {
    setCookie("bt_selected_project_id", projectId);
    set({ activeProjectId: projectId });
  },

  setActiveSite: (siteId) => {
    setCookie("bt_selected_site_id", siteId);
    set({ activeSiteId: siteId });
  },

  setCurrentProject: (proj) => {
    if (proj) {
      setCookie("bt_selected_project_id", proj.id);
      set({ currentProject: proj, activeProjectId: proj.id });
    } else {
      set({ currentProject: null });
    }
  },

  setCurrentSite: (site) => {
    if (site) {
      setCookie("bt_selected_site_id", site.id);
      set({ currentSite: site, activeSiteId: site.id });
    } else {
      set({ currentSite: null });
    }
  },
}));
