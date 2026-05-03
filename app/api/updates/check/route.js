// New-version check. Polls the GitHub Releases API for the configured
// repo and compares the latest tag against the running build's
// package.json version.
//
// Caching: `next.revalidate = 21600` (6h) puts the upstream response in
// Next's data cache, so concurrent client polls collapse to one outbound
// request per ~6h regardless of how many tabs are open across all users.
// GitHub's unauthenticated rate limit is 60/hr/IP — well clear of that.
//
// `repo` is hard-coded here rather than env-driven because the running
// image's version is meaningless against any other repo's release feed.

import { NextResponse } from "next/server";
import { getServerPublicConfig } from "@/lib/public-config";

const GH_REPO = "tamzid958/opira";
const SIX_HOURS = 21600;

// Lightweight semver compare (major.minor.patch). Treats anything with a
// pre-release suffix (`0.2.0-beta.1`) as older than its release peer so
// stable installs don't get nagged about betas. Returns true iff `latest`
// is a strictly newer release than `current`.
function isNewerRelease(latest, current) {
  const norm = (s) => String(s || "0.0.0").replace(/^v/i, "");
  const [latStable, latPre] = norm(latest).split("-");
  const [curStable, curPre] = norm(current).split("-");
  const a = latStable.split(".").map((n) => Number(n) || 0);
  const b = curStable.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  // Equal stable parts — current is "newer" if it has no pre-release tag
  // and latest does. Otherwise, no update.
  if (!latPre && curPre) return true;
  return false;
}

export async function GET() {
  const { version: current } = getServerPublicConfig();

  let res;
  try {
    res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": `opira/${current}`,
        },
        next: { revalidate: SIX_HOURS },
      },
    );
  } catch {
    return NextResponse.json(
      { current, latest: null, hasUpdate: false, error: "fetch_failed" },
      { status: 200 },
    );
  }

  // No release published yet (404), or any other non-2xx → treat as
  // "no update available", don't surface noise to the user.
  if (res.status === 404) {
    return NextResponse.json({ current, latest: null, hasUpdate: false });
  }
  if (!res.ok) {
    return NextResponse.json(
      { current, latest: null, hasUpdate: false, error: `github_${res.status}` },
      { status: 200 },
    );
  }

  const release = await res.json().catch(() => null);
  const tag = release?.tag_name || null;
  const latest = tag ? tag.replace(/^v/i, "") : null;
  const hasUpdate = !!latest && isNewerRelease(latest, current);

  return NextResponse.json({
    current,
    latest,
    hasUpdate,
    releaseUrl: release?.html_url || null,
    releaseName: release?.name || tag || null,
    publishedAt: release?.published_at || null,
  });
}
