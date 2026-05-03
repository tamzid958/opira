"use client";

import { createContext, useContext } from "react";
import { PUBLIC_CONFIG_DEFAULTS } from "@/lib/public-config";

const Ctx = createContext(PUBLIC_CONFIG_DEFAULTS);

export function ConfigProvider({ value, children }) {
  return <Ctx.Provider value={value || PUBLIC_CONFIG_DEFAULTS}>{children}</Ctx.Provider>;
}

export function usePublicConfig() {
  return useContext(Ctx);
}
