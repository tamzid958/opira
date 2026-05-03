// Public runtime configuration — values that need to reach client code but
// must be read at request time (not baked into the build) so the same Docker
// image can be deployed across environments.
//
// Server reads `process.env` directly. The client receives the resolved
// shape via React context (see `components/config-provider.jsx`). The root
// layout calls `getServerPublicConfig()` per request and passes the result
// into `<Providers>`, which wraps the tree in `<ConfigProvider>`.
//
// `version` is the one exception to the runtime-config rule: it's a property
// of *this* image, not the deployment, so reading from package.json at
// process start is correct. The version banner uses it to compare against
// the latest GitHub release.

import pkg from "../package.json";

export const PUBLIC_CONFIG_DEFAULTS = Object.freeze({
  openprojectUrl: "",
  storyPointsField: "storyPoints",
  workingDays: null,
  version: "0.0.0",
});

const trimTrailingSlash = (s) => (s || "").replace(/\/$/, "");

export function getServerPublicConfig() {
  return Object.freeze({
    openprojectUrl: trimTrailingSlash(process.env.OPENPROJECT_URL),
    storyPointsField:
      process.env.OPENPROJECT_STORY_POINTS_FIELD || "storyPoints",
    workingDays: process.env.OPENPROJECT_WORKING_DAYS || null,
    version: pkg.version || "0.0.0",
  });
}
