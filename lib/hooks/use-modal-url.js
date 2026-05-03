"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

// Patch URL search params without leaving the current path. `null` / `""`
// values delete the param. `replace` keeps history clean (good for filter
// chips, modal toggles); pass `{ replace: false }` to push a new history
// entry (project switch, opening a deep-link).
export function useUrlParams() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();

  const setParams = (patch, { replace = true } = {}) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === "") next.delete(k);
      else next.set(k, String(v));
    }
    const qs = next.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  };

  return { params, setParams };
}
