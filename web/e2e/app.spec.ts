import { EXAMPLES, expect, expectAccessible, openWith, runAndWait, showRun, test } from "./fixtures";

test.describe("landing", () => {
  test("real HTML, the library as links, accessible in both themes", async ({ page, errors }) => {
    const response = await page.goto("/");
    expect(response!.status()).toBe(200);
    expect(response!.headers()["content-security-policy"]).toContain("script-src 'self' 'wasm-unsafe-eval'");
    await expect(page).toHaveTitle(/DryRun/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your code’s dry run, drawn on paper");
    await expect(page.locator(".examples a")).toHaveCount(20);
    // The hero steps through the real trace's three visits to line 11.
    await page.getByRole("button", { name: "Show another step" }).click();
    await expect(page.locator("#hero-caption")).toContainText("Step 8");
    await expect(page.locator("#hero-total")).toHaveText("16");
    // Pyodide is never loaded by the landing page.
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.waitForLoadState("networkidle");
    expect(requests.filter((u) => u.includes("/pyodide/"))).toEqual([]);
    await expectAccessible(page);
    void errors;
  });

  test("an unknown path is a real 404", async ({ page, errors }) => {
    const response = await page.goto("/no/such/page");
    expect(response!.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn’t in the notebook");
    // The browser logs the page's own 404 status as a console error; that one is the point.
    errors.splice(0, errors.length, ...errors.filter((e) => !e.includes("status of 404")));
  });
});

test.describe("app", () => {
  test("load, run, scrub, step with the keyboard, accessible after a run", async ({ page, errors }) => {
    await page.goto("/app#ex=01-two-pointers");
    await expect(page.locator(".where")).toContainText("step 1 of 21");
    await showRun(page);
    const array = page.locator('.view[data-kind="array"][data-name="nums"]');
    await expect(array).toBeVisible();
    await expect(array.locator(".pointer")).toHaveCount(0); // left and right don't exist before line 8 runs
    await page.locator("body").press("End");
    await expect(page.locator(".where")).toContainText("step 21 of 21, finished");
    await expect(page.locator(".returned")).toContainText("(1, 5)");
    const slider = page.getByRole("slider", { name: "Step" });
    await slider.fill("17");
    await expect(page.locator(".where")).toContainText("step 18 of 21");
    await expect(array.locator(".pointer")).toHaveCount(2);
    await expect(array).toContainText("left");
    await page.locator("body").press("ArrowLeft");
    await expect(page.locator(".where")).toContainText("step 17 of 21");
    await expectAccessible(page);
    void errors;
  });

  for (const ex of EXAMPLES) {
    test(`library: ${ex.id} draws a ${ex.expect}`, async ({ page, errors }) => {
      await page.goto(`/app#ex=${ex.id}`);
      await expect(page.locator(".where")).toContainText(/step 1 of \d+/, { timeout: 60_000 });
      await showRun(page);
      await page.locator("body").press("End");
      await expect(page.locator(`.view[data-kind="${ex.expect}"]`).first()).toBeVisible();
      await expect(page.locator(".banner")).toHaveCount(0);
      void errors;
    });
  }

  test("an infinite loop is capped, and says where", async ({ page, errors }) => {
    await openWith(page, { code: "i = 0\nwhile True:\n    i += 1\n" });
    await runAndWait(page);
    await showRun(page);
    await expect(page.locator(".banner.is-capped")).toContainText("step limit (5,000 steps)");
    await expect(page.locator(".banner.is-capped")).toContainText(/at line [23]/);
    void errors;
  });

  test("an exception is shown at its line with the traceback", async ({ page, errors }) => {
    await openWith(page, { code: "def f(x):\n    return 10 // x\nf(0)\n" });
    await runAndWait(page);
    await showRun(page);
    await expect(page.locator(".banner.is-error")).toContainText("Line 2 raised ZeroDivisionError");
    await expect(page.locator(".banner .tb")).toContainText("line 3, in <module>");
    void errors;
  });

  test("stdin and output", async ({ page, errors }) => {
    await openWith(page, { code: "n = int(input())\nfor i in range(n):\n    print(i * i)\n", stdin: "4\n" });
    await runAndWait(page);
    await showRun(page);
    await page.locator("body").press("End");
    await expect(page.locator(".output pre")).toHaveText("0\n1\n4\n9\n");
    void errors;
  });

  test("compare mode runs both and compares the counters", async ({ page, errors }) => {
    await openWith(page, {
      code: "def f(n):\n    return n * (n + 1) // 2\n",
      codeB: "def f(n):\n    t = 0\n    for i in range(n + 1):\n        t += i\n    return t\n",
      mode: "call",
      call: "f({n})",
    });
    await page.locator("body").press("c");
    await page.getByLabel("Function call").fill("f(10)");
    await runAndWait(page);
    await showRun(page);
    await expect(page.locator(".compare-table")).toContainText("steps");
    await expect(page.locator(".canvas-label")).toHaveText(["A", "B"]);
    const codeTab = page.getByRole("tab", { name: "Code" });
    if (await codeTab.isVisible()) await codeTab.click();
    await page.getByLabel("Function call").fill("f({n})");
    await page.getByRole("button", { name: "Measure growth" }).click();
    await showRun(page);
    await expect(page.locator(".growth figcaption")).toContainText("n = 32");
    void errors;
  });

  test("a share link round-trips the program", async ({ page, context, errors }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    await openWith(page, { code: "x = [3, 1, 2]\nx.sort()\nprint(x)\n" });
    await page.locator("body").press("s");
    await expect(page).toHaveURL(/#s=[A-Za-z0-9_-]+$/);
    const url = page.url();
    const other = await context.newPage();
    await other.goto(url);
    await expect(other.locator("#editor-a .cm-content")).toContainText("x.sort()");
    await expect(other.locator(".where")).toContainText(/step 1 of \d+/);
    await other.close();
    void errors;
  });

  test("a damaged share link explains itself", async ({ page, errors }) => {
    await page.goto("/app#s=AAAA");
    await expect(page.locator(".toast")).toContainText("damaged");
    void errors;
  });

  test("works offline after the first visit", async ({ page, context, errors }) => {
    await page.goto("/app#ex=09-memo-dp");
    await expect(page.locator(".where")).toContainText(/step 1 of \d+/, { timeout: 60_000 });
    // The service worker controls the page from its first activation (clients.claim).
    await expect
      .poll(() => page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return navigator.serviceWorker.controller ? "controlling" : reg ? `registered: ${reg.installing ? "installing" : reg.waiting ? "waiting" : reg.active?.state}` : "no registration";
      }), { timeout: 30_000 })
      .toBe("controlling");
    // A reload under the worker caches Python on the way through.
    await page.reload();
    await expect(page.locator(".where")).toContainText(/step 1 of \d+/, { timeout: 60_000 });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".where")).toContainText(/step 1 of \d+/, { timeout: 60_000 });
    await showRun(page);
    await expect(page.locator('.view[data-kind="recursion"]')).toBeVisible();
    await context.setOffline(false);
    void errors;
  });

  test("keyboard only: run, step, shortcuts sheet, library", async ({ page, errors, isMobile }) => {
    test.skip(isMobile, "keyboard use is a desktop scenario");
    await openWith(page, { code: "a = [5, 4, 3]\na.sort()\nb = sum(a)\n" });
    await page.keyboard.press("e");
    await expect(page.locator("#editor-a .cm-content")).toBeFocused();
    await page.keyboard.press("Control+Enter");
    await expect(page.locator(".where")).toContainText(/step 1 of \d+/, { timeout: 60_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /^Run/ })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".where")).toContainText("step 3 of");
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.keyboard.press("o");
    const lib = page.getByRole("dialog", { name: "Pattern library" });
    await expect(lib).toBeVisible();
    await lib.getByRole("button", { name: /Reverse a linked list/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('.view[data-kind="linked"]')).toBeVisible({ timeout: 60_000 });
    // Every control is reachable by Tab, with a visible focus ring.
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(outline).not.toBe("none");
    void errors;
  });

  test("theme toggle and dark mode stay accessible with a drawing on screen", async ({ page, errors }) => {
    await page.goto("/app#ex=10-grid-paths");
    await expect(page.locator(".where")).toContainText(/step 1 of \d+/, { timeout: 60_000 });
    await showRun(page);
    await page.getByRole("slider", { name: "Step" }).fill("60");
    await expect(page.locator('.view[data-kind="grid"] td.is-written, .view[data-kind="grid"] td.is-read').first()).toBeVisible();
    await expectAccessible(page);
    void errors;
  });
});
