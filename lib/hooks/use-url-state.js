"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";

/**
 * Sync the four pieces of UI state we care about to query params:
 *   ?p=<projectId>   current project
 *   ?v=<view>        overview | board | backlog | hierarchy | timeline | reports
 *   ?wp=<wpId>       open work package modal (e.g. wp-12345)
 *   ?s=<sprintId>    sprint filter (id | "all" | "backlog")
 *
 * Returns the hydrated values + a single setter that takes a partial patch
 * and writes the URL. `replace: true` keeps history clean for non-navigational
 * changes (filter chips, view tabs); `false` pushes a new entry (project
 * switch, opening a WP modal) so browser back works as expected.
 */
export function useUrlState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const projectId = params.get("p") || null;
  const view = params.get("v") || null;
  const taskId = params.get("wp") || null;
  const sprint = params.get("s") || null;

  const set = (patch, { replace = true } = {}) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === "") {
        next.delete(k);
      } else {
        next.set(k, String(v));
      }
    }
    const qs = next.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  };

  return { projectId, view, taskId, sprint, set };
}
