const { test, expect } = require('@playwright/test');

test('page loads without console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
  await expect(page.locator('h1')).toBeVisible();
  expect(errors).toEqual([]);
});

test('local files referenced by the page exist', async ({ page, request }) => {
  await page.goto('/');
  const paths = await page.evaluate(() => {
    const urls = [...document.querySelectorAll('[href], [src]')]
      .map((el) => el.getAttribute('href') || el.getAttribute('src'));
    // Pull url(...) references out of same-origin stylesheets too.
    for (const sheet of document.styleSheets) {
      if (sheet.href && new URL(sheet.href).origin !== location.origin) continue;
      for (const rule of sheet.cssRules) {
        for (const [, u] of rule.cssText.matchAll(/url\("?([^")]+)"?\)/g)) {
          urls.push(new URL(u, sheet.href || location.href).pathname);
        }
      }
    }
    return [...new Set(urls)].filter((u) => !/^(#|https?:|mailto:|tel:|data:)/.test(u));
  });
  expect(paths.length).toBeGreaterThan(0);
  for (const p of paths) {
    const res = await request.get(p.startsWith('/') ? p : `/${p}`);
    expect(res.status(), p).toBe(200);
  }
});

test('countdown renders numbers', async ({ page }) => {
  await page.goto('/');
  for (const id of ['days', 'hours', 'minutes', 'seconds']) {
    await expect(page.locator(`#${id}`)).toHaveText(/^\d{2,}$/);
  }
});

test('mobile menu toggles', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'menu button is only shown on small screens');
  await page.goto('/');
  const button = page.locator('.menu-toggle');
  await button.click();
  await expect(page.locator('.nav')).toHaveClass(/open/);
  await expect(button).toHaveAttribute('aria-expanded', 'true');
});
