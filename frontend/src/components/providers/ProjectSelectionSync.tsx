"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { normalizeList } from "@/lib/utils";
import { useProjectStore } from "@/stores/projectStore";

/**
 * Keeps the active project/site pointing at records that exist in the connected
 * database, so a fresh or re-seeded database never leaves pages querying stale ids.
 */
export function ProjectSelectionSync() {
  const { activeProjectId, activeSiteId, setActiveProject, setActiveSite } = useProjectStore();

  const { data: projectsData, isSuccess: projectsLoaded } = useQuery<any>({
    queryKey: ["projects"],
    queryFn: () => apiClient.get<any>("/api/v1/projects"),
    staleTime: 30000,
  });
  const projects = normalizeList<any>(projectsData);

  useEffect(() => {
    if (!projectsLoaded || projects.length === 0) return;
    if (!projects.some((p) => p.id === activeProjectId)) {
      setActiveProject(projects[0].id);
    }
  }, [projectsLoaded, projects, activeProjectId, setActiveProject]);

  const { data: sitesData, isSuccess: sitesLoaded } = useQuery<any>({
    queryKey: ["project-sites", activeProjectId],
    queryFn: () => apiClient.get<any>(`/api/v1/projects/${activeProjectId}/sites`),
    enabled: Boolean(activeProjectId),
    staleTime: 30000,
  });
  const sites = normalizeList<any>(sitesData);

  useEffect(() => {
    if (!sitesLoaded || sites.length === 0) return;
    if (!sites.some((s) => s.id === activeSiteId)) {
      setActiveSite(sites[0].id);
    }
  }, [sitesLoaded, sites, activeSiteId, setActiveSite]);

  return null;
}
