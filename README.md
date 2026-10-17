# Reimagining Urban India 2026 — Event Website

Static event website for the 41st National Convention of Architectural Engineers.

## Free deployment

### GitHub Pages
1. Create a public GitHub repository.
2. Upload all files and folders from this package to the repository root.
3. Open Settings > Pages.
4. Under Build and deployment choose "Deploy from a branch".
5. Select `main` and `/(root)`, then Save.

### Cloudflare Pages
1. Keep the same GitHub repository as the source of truth.
2. In Cloudflare Pages, connect the GitHub repository.
3. Framework preset: None.
4. Build command: leave blank.
5. Build output directory: `/`
6. Deploy.

Every future commit to GitHub can automatically update the live site.

## Updating
- Registration URL is currently: https://forms.gle/h6vjtddPrpSRH6zD8
- Main content: index.html
- Visual design: style.css
- Countdown/mobile menu: script.js
- Brochure and images: assets/

## Local testing
Requires Node.js 18+.

```bash
npm install          # one-time setup (installs into node_modules/ only)
npm start            # serve the site at http://localhost:8080 and open it
npm test             # run the smoke tests on desktop + mobile viewports
npx playwright install chromium   # first time only, if no browser is installed
npm run clean        # remove node_modules and test output
```

The tests check that the page loads without JavaScript errors, every local
file it links to (CSS, JS, images, brochure) exists, the countdown renders,
and the mobile menu opens.
