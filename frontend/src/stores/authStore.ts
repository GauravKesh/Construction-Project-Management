import { create } from "zustand";
import { UserProfile, UserRole, hasRole } from "@/lib/rbac";

interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      set({ user: null, isLoading: false });
      window.location.href = "/login";
    }
  },
}));

export function useCan(allowedRoles: UserRole[]): boolean {
  const user = useAuthStore((state) => state.user);
  return hasRole(user?.role, allowedRoles);
}
