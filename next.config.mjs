import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  // Strip console.* from production bundles so the browser console stays
  // clean for end users. `error` / `warn` survive — those still flag real
  // problems worth surfacing in shipped builds. Dev builds are untouched.
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
};

export default nextConfig;
