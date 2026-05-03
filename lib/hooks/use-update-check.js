"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// Polls /api/updates/check (which itself caches the upstream GitHub
// response for 6h). One query key for the whole app — every consumer
// shares the cached result.
export function useUpdateCheck(enabled = true) {
  return useQuery({
    queryKey: ["opira", "update-check"],
    queryFn: () => fetchJson("/api/updates/check"),
    enabled,
    staleTime: SIX_HOURS_MS,
    gcTime: SIX_HOURS_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 0,
  });
}
