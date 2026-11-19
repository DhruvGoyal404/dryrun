import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";

/** Every test fails on a console error or an uncaught exception. */
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await use(errors);
    expect(errors, "console errors").toEqual([]);
  },
});

export { expect };

/** WCAG 2.1 AA via axe, in both themes. */
export async function expectAccessible(page: Page) {
  for (const scheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(result.violations.map((v) => `${scheme}: ${v.id} at ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  }
}

/** The pattern library, read from the same files the app bundles. */
export const EXAMPLES = readdirSync(new URL("../src/library/", import.meta.url))
  .filter((f) => f.endsWith(".py"))
  .sort()
  .map((f) => {
    const src = readFileSync(new URL(`../src/library/${f}`, import.meta.url), "utf8");
    return { id: f.replace(/\.py$/, ""), expect: /^# expect: (\w+)$/m.exec(src)![1]!, title: /^# title: (.*)$/m.exec(src)![1]! };
  });

/** Opens the app with this program as the saved draft, so tests never type into CodeMirror. */
export async function openWith(page: Page, draft: { code: string; mode?: "stdin" | "call"; stdin?: string; call?: string; codeB?: string }) {
  await page.addInitScript((d) => {
    localStorage.setItem("dryrun:draft", JSON.stringify({ mode: "stdin", stdin: "", call: "", codeB: "x = 1\n", ...d }));
  }, draft);
  await page.goto("/app");
}

/** Runs and waits for the trace: the step readout shows "step 1 of N". */
export async function runAndWait(page: Page) {
  await page.getByRole("button", { name: /^Run/ }).click();
  await expect(page.locator(".where")).toContainText(/step \d+ of \d+/, { timeout: 60_000 });
}

/** On a phone, the dry run is a tab of its own. */
export async function showRun(page: Page) {
  const tab = page.getByRole("tab", { name: "Dry run" });
  if (await tab.isVisible()) await tab.click();
}
