// Renders the listing images: node docs/assets/src/render.mjs
import { createRequire } from "node:module";
// Playwright is not a project dependency; resolve it from a global install.
const { chromium } = createRequire(import.meta.url)("playwright");
import path from "node:path";

const dir = path.dirname(new URL(import.meta.url).pathname);
const out = path.resolve(dir, "..");
const browser = await chromium.launch();
for (const [name, w, h] of [["icon", 1200, 1200], ["feature", 1600, 900]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`file://${dir}/${name}.html`);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(`${out}/${name}.png`);
}
await browser.close();
