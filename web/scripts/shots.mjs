#!/usr/bin/env node
// Captures review screenshots of the production build into ../.review/ (git-ignored): the
// landing page and the app on several library examples, desktop and phone, light and dark.
// CI uploads them as an artifact; the README's images are picked from them.
//
//   node scripts/shots.mjs [baseURL]   (default: serves dist on port 4174)
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("../../.review/", import.meta.url));
mkdirSync(out, { recursive: true });
let base = process.argv[2];
let server;
if (!base) {
  server = spawn(process.execPath, [fileURLToPath(new URL("serve.mjs", import.meta.url)), "4174"], { stdio: "ignore" });
  base = "http://localhost:4174";
  await new Promise((r) => setTimeout(r, 800));
}

const SHOTS = [
  // [name, path, step (fraction of the run, or "end"), viewport, scheme]
  ["landing-light", "/", null, "desktop", "light"],
  ["landing-dark", "/", null, "desktop", "dark"],
  ["landing-phone", "/", null, "phone", "light"],
  ["two-pointers", "/app#ex=01-two-pointers", 17, "desktop", "light"],
  ["sliding-window-dark", "/app#ex=02-sliding-window", 40, "desktop", "dark"],
  ["memo-recursion", "/app#ex=09-memo-dp", 45, "desktop", "light"],
  ["grid-paths", "/app#ex=10-grid-paths", 70, "desktop", "light"],
  ["lcs-dark", "/app#ex=11-lcs", 90, "desktop", "dark"],
  ["reverse-list", "/app#ex=12-reverse-list", 50, "desktop", "light"],
  ["tree-traversal", "/app#ex=14-tree-traversal", 200, "desktop", "light"],
  ["bfs-graph", "/app#ex=06-bfs", 30, "desktop", "light"],
  ["dijkstra-dark", "/app#ex=18-dijkstra", 45, "desktop", "dark"],
  ["heap", "/app#ex=16-heap-top-k", 25, "desktop", "light"],
  ["phone-run", "/app#ex=08-backtracking", 60, "phone", "light"],
  ["phone-run-dark", "/app#ex=05-monotonic-stack", 30, "phone", "dark"],
];

const browser = await chromium.launch();
for (const [name, path, step, device, scheme] of SHOTS) {
  const phone = device === "phone";
  const context = await browser.newContext({
    viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: phone ? 3 : 1,
    colorScheme: scheme,
    isMobile: phone,
    hasTouch: phone,
  });
  const page = await context.newPage();
  await page.goto(base + path);
  if (path.startsWith("/app")) {
    await page.locator(".where").filter({ hasText: /step \d+ of/ }).waitFor({ timeout: 90_000 });
    await page.getByRole("slider", { name: "Step" }).fill(String(step));
    if (phone) await page.getByRole("tab", { name: "Dry run" }).click();
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}${name}.png`, fullPage: path === "/" });
  await context.close();
  console.log(`shots: ${name}`);
}
await browser.close();
server?.kill();
