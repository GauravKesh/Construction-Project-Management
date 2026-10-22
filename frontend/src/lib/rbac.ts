export type UserRole =
  | "admin"
  | "project_manager"
  | "safety_officer"
  | "site_engineer"
  | "contractor"
  | "viewer";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_url?: string;
  created_at?: string;
}

export function hasRole(userRole: UserRole | undefined | null, allowedRoles: UserRole[]): boolean {
  if (!userRole) return false;
  if (userRole === "admin") return true; // Superuser bypass
  return allowedRoles.includes(userRole);
}
