import { defineConfig, devices } from "@playwright/test";

// Base URL to drive:
//   http://localhost:3000  the vite dev server (pnpm start in ui/v2.5) — default
//   http://localhost:9999  a running stash instance directly
// Set STASH_BASE to switch; nothing in the specs hardcodes a target.
const baseURL = process.env.STASH_BASE ?? "http://localhost:3000";

export default defineConfig({
  testDir: ".",
  // Real browser, real timing: these UI bugs only fire on trusted input events
  // and actual React commit/paint, so keep workers serial-ish and give opens a
  // moment to settle (waitForLightbox handles the explicit cases).
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // The default 30s per-test cap is tight for multi-step gallery flows against a
  // cold-cache backend (cover generation). 60s is comfortable without hiding hangs.
  timeout: 60_000,
  retries: 0,
  // One worker: the suite drives a single shared backend (:9999) whose galleries
  // have fixed contents; parallel specs would race each other's lightbox state.
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL,
    // No explicit viewport: the device descriptors below govern it. Desktop
    // presets are 1280x720 (the Playwright/CI convention, comfortably above
    // Stash's xl=1200 breakpoint); mobile presets carry real device metrics.
    // Retain a replayable trace + screenshot on failure (open with pnpm report).
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Touch devices can't run the hover-based desktop specs (no hover on touch),
  // so split by filename: desktop projects skip *.mobile.spec.ts, touch projects
  // run only those. Add touch coverage as *.mobile.spec.ts files.
  projects: [
    // --- Desktop (mouse + hover) ---
    { name: "chromium", testIgnore: /\.mobile\.spec\.ts$/, use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", testIgnore: /\.mobile\.spec\.ts$/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testIgnore: /\.mobile\.spec\.ts$/, use: { ...devices["Desktop Safari"] } },
    // --- Tablet (touch; layout close to desktop) — webkit engine ---
    { name: "ipad", testMatch: /\.mobile\.spec\.ts$/, use: { ...devices["iPad (gen 11)"] } },
    // --- Phone (touch; collapsed layout) — both mobile engines ---
    // iPhone => webkit, Pixel => chromium. (Firefox has no mobile emulation.)
    { name: "iphone", testMatch: /\.mobile\.spec\.ts$/, use: { ...devices["iPhone 17"] } },
    { name: "pixel", testMatch: /\.mobile\.spec\.ts$/, use: { ...devices["Pixel 10"] } },
  ],
  // NOTE: no webServer here on purpose. These tests run against an already-
  // running UI dev server (ui/v2.5 `pnpm start`) talking to a stash backend, so
  // the server is started manually rather than auto-spawned. See README.md.
});
