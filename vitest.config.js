import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["lib/**/*.test.js", "lib/**/*.test.jsx", "components/**/*.test.js", "components/**/*.test.jsx"],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // The data layer imports `server-only` to fail loudly if a client
      // bundle ever pulls server modules in. Tests run in node, so map it
      // to a noop.
      "server-only": path.resolve(__dirname, "lib/data/__test_helpers__/server-only-noop.js"),
    },
    extensions: [".jsx", ".js", ".json"],
  },
});
