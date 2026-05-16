import { expect, test } from "@playwright/test";

const PROJECT_ID = process.env.E2E_PROJECT_ID || "";
const PROJECT_LABEL = PROJECT_ID || ":projectId";

const CORE_PAGES = [
  { path: "/", title: /opira|openproject|sign in/i },
  { path: "/sign-in", title: /sign in/i },
];

const PROJECT_PAGES = [
  { path: (id) => `/projects/${id}/board`, title: /board/i },
  { path: (id) => `/projects/${id}/backlog`, title: /backlog/i },
  { path: (id) => `/projects/${id}/overview`, title: /overview/i },
  { path: (id) => `/projects/${id}/reports`, title: /reports/i },
  { path: (id) => `/projects/${id}/timeline`, title: /timeline/i },
  { path: (id) => `/projects/${id}/milestones`, title: /milestones/i },
  { path: (id) => `/projects/${id}/documents`, title: /documents/i },
  { path: (id) => `/projects/${id}/members`, title: /members/i },
  { path: (id) => `/projects/${id}/tags`, title: /tags/i },
];

async function assertNoViewportOverflow(page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      overflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
    };
  });
  expect(
    overflow.overflowPx,
    `Unexpected horizontal overflow: ${overflow.overflowPx}px`,
  ).toBeLessThanOrEqual(1);
}

async function openAndCheck(page, path, titlePattern) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(titlePattern);
  await assertNoViewportOverflow(page);
}

test.describe("Responsive smoke", () => {
  for (const entry of CORE_PAGES) {
    test(`core route ${entry.path}`, async ({ page }) => {
      await openAndCheck(page, entry.path, entry.title);
    });
  }

  test.describe("project routes", () => {
    test.skip(!PROJECT_ID, "Set E2E_PROJECT_ID to run project page checks.");

    for (const entry of PROJECT_PAGES) {
      test(`project route ${entry.path(PROJECT_LABEL)}`, async ({ page }) => {
        await openAndCheck(page, entry.path(PROJECT_ID), entry.title);
      });
    }
  });
});
