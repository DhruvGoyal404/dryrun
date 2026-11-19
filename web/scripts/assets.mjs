#!/usr/bin/env node
// Renders the raster assets from HTML in Playwright's Chromium, in the app's own faces and
// palette, so they are reproducible: app icons (192, 512, maskable 512) and the Open Graph
// image (1200 x 630), which shows the same real step of the two-pointer example as the
// landing page. CI runs this before every build; the PNGs are not committed.
//
//   node scripts/assets.mjs   (writes public/*.png)
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("..", import.meta.url));
const font = (pkg, file) => readFileSync(`${web}node_modules/@fontsource-variable/${pkg}/files/${file}`).toString("base64");
const BASE = `
  @font-face { font-family: Plex; src: url(data:font/woff2;base64,${font("ibm-plex-sans", "ibm-plex-sans-latin-wght-normal.woff2")}) format("woff2"); font-weight: 100 700; }
  @font-face { font-family: Mono; src: url(data:font/woff2;base64,${font("jetbrains-mono", "jetbrains-mono-latin-wght-normal.woff2")}) format("woff2"); font-weight: 100 800; }
  @font-face { font-family: Hand; src: url(data:font/woff2;base64,${font("caveat", "caveat-latin-wght-normal.woff2")}) format("woff2"); font-weight: 400 700; }
  * { margin: 0; box-sizing: border-box; }
  body { background: #f6f3ea; color: #1c2433; font-family: Plex, sans-serif;
    background-image: linear-gradient(#e4e6e3 1px, transparent 1px), linear-gradient(90deg, #e4e6e3 1px, transparent 1px);
    background-size: 24px 24px; }`;

function icon(size, pad) {
  const s = size - pad * 2;
  return `<style>${BASE} body { width:${size}px; height:${size}px; display:grid; place-items:center; background-size:${size / 8}px ${size / 8}px; }</style>
  <svg width="${s}" height="${s}" viewBox="0 0 32 32"><path d="M4 9h24v11H4zM12 9v11M20 9v11" fill="#fcfaf4" stroke="#1c2433" stroke-width="2"/>
  <rect x="12" y="9" width="8" height="11" fill="#fbe7a1" stroke="#b42318" stroke-width="2"/>
  <path d="M16 29v-6M13 25.5l3-3 3 3" fill="none" stroke="#1f4fc4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const cells = [1, 3, 4, 6, 8, 11, 15];
const og = `<style>${BASE}
  body { width:1200px; height:630px; padding:56px 72px; display:grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items:center; }
  .mark { font-family: Hand; font-weight:700; font-size:56px; } .mark span { color:#b42318; }
  h1 { margin-top: 24px; font-size:60px; line-height:1.04; font-weight:600; letter-spacing:-0.02em; }
  p { margin-top: 20px; font-size: 26px; color:#575e6c; }
  .sheet { background:#fcfaf4; border:1px solid #857f72; border-radius:8px; box-shadow: 0 10px 30px rgb(28 36 51 / .16); overflow:hidden; }
  .code { font-family: Mono; font-size: 17px; line-height: 1.8; padding: 14px 0; border-bottom:1px solid #ddd8cb; white-space: pre; }
  .code div { padding-left: 16px; } .code .now { background: rgb(180 35 24 / .13); box-shadow: inset 4px 0 0 #b42318; }
  .paper { padding: 20px 24px 28px; }
  .name { font-family: Hand; font-weight:700; font-size: 36px; }
  .row { display:flex; margin-top: 12px; } .cell { width:58px; height:58px; display:grid; place-items:center; border:2px solid #1c2433; margin-right:-2px; font-family: Mono; font-size:22px; background:#fcfaf4; }
  .win { background:#e3e8f3; } .rd { background:#dde7fb; }
  .ptrs { position:relative; height: 64px; font-family: Hand; font-weight:700; font-size:30px; color:#1f4fc4; }
  .ptrs span { position:absolute; top: 8px; width:58px; text-align:center; } .ptrs span::before { content:"↑"; display:block; font-family: Plex; font-size: 24px; line-height: 1; }
  .foot { grid-column: 1 / -1; display:flex; justify-content:space-between; font-size:22px; color:#575e6c; }
</style>
<div><div class="mark">Dry<span>Run</span></div><h1>Your code's dry run, drawn on paper</h1><p>Your own Python, step by step in the browser.</p></div>
<div class="sheet">
  <div class="code"><div>while left &lt; right:</div><div>    total = nums[left] + nums[right]</div><div class="now">    if total == target:</div><div>        return (left, right)</div></div>
  <div class="paper"><div class="name">nums</div>
    <div class="row">${cells.map((v, i) => `<div class="cell ${i === 1 || i === 5 ? "rd" : i > 1 && i < 5 ? "win" : ""}">${v}</div>`).join("")}</div>
    <div class="ptrs"><span style="left:${56}px">left</span><span style="left:${56 * 5}px">right</span></div>
  </div>
</div>
<div class="foot"><span>Arrays, recursion trees, DP tables, lists, trees, graphs</span><b style="color:#1c2433">dryrun.dhruvgoyal.tech</b></div>`;

const browser = await chromium.launch();
const shots = [
  ["icon-192.png", icon(192, 12), 192, 192],
  ["icon-512.png", icon(512, 32), 512, 512],
  // Maskable: the platform may crop to a circle, so the mark sits inside the 80% safe zone.
  ["icon-maskable-512.png", icon(512, 96), 512, 512],
  ["og.png", og, 1200, 630],
];
for (const [name, html, width, height] of shots) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${web}public/${name}` });
  await page.close();
}
await browser.close();
console.log("assets: wrote public/icon-192.png, icon-512.png, icon-maskable-512.png, og.png");
