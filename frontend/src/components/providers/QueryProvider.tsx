"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30s
            gcTime: 5 * 60 * 1000, // 5m
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.status === 404) return false;
              if (error instanceof ApiError && error.status === 401) return false;
              if (error instanceof ApiError && error.status === 403) return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: false,
          },
          mutations: {
            onError: (error) => {
              const msg =
                error instanceof ApiError
                  ? error.message
                  : "An unexpected error occurred. Please try again.";
              toast.error(msg);
            },
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
