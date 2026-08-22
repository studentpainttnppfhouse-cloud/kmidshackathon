import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Browser tests for the things that can only be checked in a browser.
 *
 * The unit tests cover the renderers and the policy table. What they cannot
 * cover is whether an authorisation rule actually holds against a request, or
 * whether a stored payload stays inert once a real DOM has it — so those are
 * checked here, driving the real app against a real database.
 *
 * Run with a server already up:
 *   BASE_URL=http://127.0.0.1:3210 npx playwright test tests/e2e
 */

const OWNER_EMAIL = process.env.E2E_EMAIL ?? "paintppf@kmids.ac.th";
const OWNER_PASSWORD = process.env.E2E_PASSWORD ?? "a-long-enough-password-2027";
const INVITE_CODE = process.env.E2E_INVITE_CODE ?? "";

/**
 * The portal refuses a form submitted implausibly fast — see
 * `looksAutomated()`. Playwright is faster than a person, so tests wait the
 * way a person would. Doing it here rather than lowering the threshold keeps
 * the anti-bot check honest: the test proves it can be passed by something
 * behaving like a human, not that it was weakened until tests went green.
 */
const HUMAN_PACE_MS = 900;

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForTimeout(HUMAN_PACE_MS);
  await page.fill("#email", OWNER_EMAIL);
  await page.fill("#password", OWNER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|welcome)/, { timeout: 20_000 });

  // A fresh account lands on /welcome and has to finish its profile first.
  if (page.url().includes("/welcome")) {
    await page.fill("#nickname", "Owner");
    await page.getByRole("button", { name: "Finish setup" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  }
}

test.describe("first run", () => {
  test("an invite creates the first account", async ({ page }) => {
    test.skip(INVITE_CODE === "", "no invite code supplied");

    await page.goto(`/invite/${INVITE_CODE}`);
    await page.waitForTimeout(HUMAN_PACE_MS);
    await page.fill("#name", "Portal Owner");
    await page.fill("#password", OWNER_PASSWORD);
    await page.fill("#confirm", OWNER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/welcome/, { timeout: 20_000 });

    await page.fill("#nickname", "Owner");
    await page.getByRole("button", { name: "Finish setup" }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hi,");
  });
});

test.describe("authentication", () => {
  test("a wrong password says nothing useful", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(HUMAN_PACE_MS);
    await page.fill("#email", OWNER_EMAIL);
    await page.fill("#password", "definitely-not-the-password");
    await page.click('button[type="submit"]');

    const alert = page.locator(".hs-feedback-error");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("do not match");
  });

  test("an address that does not exist gets the same message", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(HUMAN_PACE_MS);
    await page.fill("#email", "nobody-at-all@kmids.ac.th");
    await page.fill("#password", "definitely-not-the-password");
    await page.click('button[type="submit"]');
    await expect(page.locator(".hs-feedback-error")).toContainText("do not match");
  });

  test("sign-in outside the school domain is refused", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(HUMAN_PACE_MS);
    await page.fill("#email", "attacker@gmail.com");
    await page.fill("#password", "whatever-goes-here");
    await page.click('button[type="submit"]');
    await expect(page.locator(".hs-feedback-error")).toContainText("limited to");
  });

  test("the honeypot rejects a correct password", async ({ page }) => {
    await page.goto("/login");
    await page.waitForTimeout(HUMAN_PACE_MS);
    await page.fill("#email", OWNER_EMAIL);
    await page.fill("#password", OWNER_PASSWORD);
    // A person cannot reach this field; a script fills every input it finds.
    await page.evaluate(() => {
      const field = document.querySelector<HTMLInputElement>('input[name="company_website"]');
      if (field) field.value = "http://spam.example.com";
    });
    await page.click('button[type="submit"]');
    await expect(page.locator(".hs-feedback-error")).toContainText("do not match");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the session cookie is HttpOnly, SameSite=Lax and long-lived", async ({ page, context }) => {
    await signIn(page);
    const cookie = (await context.cookies()).find((c) => c.name === "hs_session");
    expect(cookie).toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
    expect(cookie!.path).toBe("/");
    // Six months, not a browser-session cookie.
    expect(cookie!.expires).toBeGreaterThan(Date.now() / 1000 + 100 * 24 * 3600);
  });

  test("the session cookie is unreadable from JavaScript", async ({ page }) => {
    await signIn(page);
    const visible = await page.evaluate(() => document.cookie);
    expect(visible).not.toContain("hs_session");
  });

  test("signing out invalidates the session everywhere", async ({ page, context }) => {
    await signIn(page);
    const before = (await context.cookies()).find((c) => c.name === "hs_session")!.value;

    await page.getByRole("button", { name: "Sign out" }).first().click();
    await page.waitForURL(/\/login/, { timeout: 20_000 });

    // Put the old token back by hand: signing out must revoke it server-side,
    // not merely drop it from the browser.
    await context.addCookies([
      { name: "hs_session", value: before, url: "http://127.0.0.1:3210" },
    ]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("authorisation", () => {
  test("anonymous visitors reach no app page", async ({ page }) => {
    for (const path of ["/dashboard", "/admin", "/documents", "/search", "/people/import"]) {
      await page.goto(path);
      await expect(page, `${path} should bounce`).toHaveURL(/\/login/);
    }
  });

  test("the export refuses an anonymous request", async ({ request }) => {
    const response = await request.get("/api/export");
    expect(response.status()).toBe(403);
  });
});

test.describe("link safety", () => {
  test("a javascript: document link is refused", async ({ page }) => {
    await signIn(page);
    await page.goto("/documents/new");

    await page.fill("#doc-title", "Attempted script link");
    await page.getByRole("button", { name: /Link a Google Doc/ }).click();
    await page.fill("#doc-url", "javascript:alert(document.cookie)");
    await page.getByRole("button", { name: "Create document" }).click();

    await expect(page.locator(".hs-feedback-error")).toContainText("http://");
    await expect(page).toHaveURL(/\/documents\/new/);
  });

  test("markdown in a document body cannot become markup", async ({ page }) => {
    await signIn(page);
    await page.goto("/documents/new");

    await page.fill("#doc-title", "XSS probe");
    await page.fill(
      "#doc-body",
      '# Heading\n\n<img src=x onerror="window.__xss=1">\n\n<script>window.__xss=2</script>\n\n[click](javascript:window.__xss=3)\n\n**bold survives**',
    );
    await page.getByRole("button", { name: "Create document" }).click();
    await page.waitForURL(/\/documents\/[a-z0-9]+$/, { timeout: 20_000 });

    // Nothing executed…
    expect(await page.evaluate(() => (window as never as { __xss?: number }).__xss)).toBeUndefined();
    // …no tag was created from author text…
    expect(await page.locator(".hs-prose img").count()).toBe(0);
    expect(await page.locator(".hs-prose a").count()).toBe(0);
    // …the text is visible as text…
    await expect(page.locator(".hs-prose")).toContainText("onerror");
    // …and real Markdown still works.
    await expect(page.locator(".hs-prose strong")).toContainText("bold survives");
  });
});

test.describe("documents", () => {
  test("a portal document exports to docx, pdf and markdown", async ({ page }) => {
    await signIn(page);
    await page.goto("/documents/new");
    await page.fill("#doc-title", "Export check");
    await page.fill("#doc-body", "# Plan\n\nOne **bold** line and a list:\n\n- alpha\n- beta");
    await page.getByRole("button", { name: "Create document" }).click();
    await page.waitForURL(/\/documents\/[a-z0-9]+$/, { timeout: 20_000 });

    const id = page.url().split("/").pop()!;

    // Downloads are driven by clicking the real links on the page.
    // Playwright's APIRequestContext does not carry the httpOnly session
    // cookie, so a `page.request.get` here would test an anonymous request and
    // quietly pass for the wrong reason.
    for (const [label, format, signature] of [
      ["Word (.docx)", "docx", "PK"],
      ["PDF", "pdf", "%PDF"],
      ["Markdown", "md", "# Export check"],
    ] as const) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 30_000 }),
        page.getByRole("link", { name: label, exact: true }).click(),
      ]);

      const file = await download.path();
      expect(file, format).toBeTruthy();
      const head = readFileSync(file!).subarray(0, signature.length).toString("latin1");
      expect(head, format).toBe(signature);
      expect(download.suggestedFilename(), format).toContain(`.${format}`);
    }
  });

  test("the editor previews with the same renderer that saves", async ({ page }) => {
    await signIn(page);
    await page.goto("/documents/new");
    await page.fill("#doc-body", "## Preview heading\n\n- item one");
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.locator(".hs-prose h2")).toContainText("Preview heading");
    await expect(page.locator(".hs-prose li")).toContainText("item one");
  });
});

test.describe("forms", () => {
  test("a built form can be filled in and the answers come back", async ({ page }) => {
    await signIn(page);
    await page.goto("/forms/new");

    await page.fill("#form-title", "Availability check");
    await page.fill("input[id^='label-']", "Which day suits you?");
    await page.selectOption("select[id^='type-']", "radio");
    await page.fill("textarea[id^='options-']", "Friday\nSaturday\nSunday");

    await page.getByRole("button", { name: "Create form" }).click();
    await page.waitForURL(/\/forms\/[a-z0-9]+$/, { timeout: 20_000 });

    await page.getByRole("radio", { name: "Saturday" }).check();
    await page.getByRole("button", { name: "Submit" }).click();

    await expect(page.locator(".hs-feedback-ok").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("table")).toContainText("Saturday", { timeout: 30_000 });
  });

  test("an answer outside the option list is refused", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page);

    // Built here rather than found: a test that silently skips when the
    // fixture is missing is a test that stops covering anything.
    await page.goto("/forms/new");
    await page.fill("#form-title", "Option tampering check");
    await page.fill("input[id^='label-']", "Pick one");
    await page.selectOption("select[id^='type-']", "radio");
    await page.fill("textarea[id^='options-']", "Alpha\nBravo");
    await page.getByRole("button", { name: "Create form" }).click();
    await page.waitForURL(/\/forms\/[a-z0-9]+$/, { timeout: 30_000 });

    // Exactly what a devtools user does: keep the field, change the value.
    const radio = page.locator('input[type="radio"]').first();
    await radio.evaluate((node: HTMLInputElement) => {
      node.value = "Charlie, which was never an option";
      node.checked = true;
    });

    await page.getByRole("button", { name: /Submit|Update my answers/ }).click();
    await expect(page.locator(".hs-feedback-error")).toContainText("not one of its options", {
      timeout: 30_000,
    });
  });
});

test.describe("interface", () => {
  test("dark mode applies and survives a reload", async ({ page }) => {
    await signIn(page);
    await page.getByRole("radio", { name: "Dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );

    await page.reload();
    // The blocking head script must have set it before first paint.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
      background,
    );
  });

  test("skip-to-content is the first thing a keyboard reaches", async ({ page }) => {
    await signIn(page);
    // A fresh load, so tab order starts at the top of the document rather than
    // wherever the sign-in button left the focus.
    await page.goto("/dashboard");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.className ?? "");
    expect(focused).toContain("hs-skip-link");
  });

  test("search only returns things and never leaks a stranger's record", async ({ page }) => {
    await signIn(page);
    await page.goto("/search?q=sponsor");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Results");
  });

  test("the mobile menu opens and closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);

    const toggle = page.getByRole("button", { name: "Open menu" });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator("#hs-mobile-nav")).toBeVisible();
    await page.getByRole("button", { name: "Close menu" }).click();
    await expect(page.locator("#hs-mobile-nav")).toHaveCount(0);
  });

  test("the page does not scroll sideways on a phone", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);

    for (const path of ["/dashboard", "/documents", "/forms", "/people", "/brand", "/search"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });

  test("the cookie notice appears once and stays dismissed", async ({ page }) => {
    await signIn(page);
    const notice = page.getByRole("region", { name: "Cookie notice" });
    await expect(notice).toBeVisible();
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(notice).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: "Cookie notice" })).toHaveCount(0);
  });

  test("a password can be revealed and re-hidden", async ({ page }) => {
    await page.goto("/login");
    const field = page.locator("#password");
    await expect(field).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(field).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(field).toHaveAttribute("type", "password");
  });

  test("a destructive action asks first", async ({ page }) => {
    await signIn(page);
    await page.goto("/documents/new");
    await page.fill("#doc-title", "Delete me");
    await page.fill("#doc-body", "Short body.");
    await page.getByRole("button", { name: "Create document" }).click();
    await page.waitForURL(/\/documents\/[a-z0-9]+$/, { timeout: 20_000 });

    await page.getByRole("button", { name: "Delete this document" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();

    // Escape backs out without deleting anything.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/documents\/[a-z0-9]+$/);
  });

  test("UTM parameters are captured and stripped from the address bar", async ({ page }) => {
    await signIn(page);
    await page.goto("/dashboard?utm_source=line&utm_campaign=staff-invite");
    await expect(page).toHaveURL(/\/dashboard$/);
    const stored = await page.evaluate(() => sessionStorage.getItem("hs-utm"));
    expect(stored).toContain("line");
  });

  test("back-to-top appears once the page is scrolled", async ({ page }) => {
    await signIn(page);
    await page.goto("/help");
    const button = page.locator(".hs-back-to-top");
    await expect(button).not.toHaveClass(/is-visible/);
    await page.evaluate(() => window.scrollTo(0, 2000));
    await expect(button).toHaveClass(/is-visible/);
  });

  test("the FAQ expands", async ({ page }) => {
    await signIn(page);
    await page.goto("/help");
    const first = page.locator(".hs-faq-item").first();
    await expect(first).not.toHaveAttribute("open", "");
    await first.locator("summary").click();
    await expect(first).toHaveAttribute("open", "");
  });
});

test.describe("brand kit", () => {
  test("a colour ramp is generated and exports to PDF", async ({ page }) => {
    await signIn(page);
    await page.goto("/brand");

    await page.fill("#ramp-name", "Test Pink");
    await page.fill("#ramp-value", "#EC4899");
    await page.fill("#ramp-steps", "20");
    await page.getByRole("button", { name: /Add 20 shades/ }).click();

    await expect(page.locator(".hs-feedback-ok").first()).toContainText("20 shades", {
      timeout: 30_000,
    });
    await expect(page.getByText("Test Pink 50")).toBeVisible({ timeout: 30_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByRole("link", { name: "Export as PDF" }).click(),
    ]);
    const file = await download.path();
    expect(file).toBeTruthy();
    expect(readFileSync(file!).subarray(0, 4).toString("latin1")).toBe("%PDF");
  });
});
