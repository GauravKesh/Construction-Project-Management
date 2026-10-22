"use client";

import React from "react";
import { UserRole } from "@/lib/rbac";
import { useCan } from "@/stores/authStore";

interface CanProps {
  roles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function Can({ roles, children, fallback = null }: CanProps) {
  const allowed = useCan(roles);

  if (!allowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
