#!/usr/bin/env node
/**
 * Clink brand assets, from one set of shapes.
 *
 * Writes the SVG sources to assets/brand/ and renders the PNGs the app and
 * README use (icon, adaptive icon, monochrome icon, splash, favicon, README
 * hero) with headless Chrome. Run after changing a shape or colour:
 *
 *   node scripts/brand-assets.mjs
 *
 * Set CHROME=/path/to/chrome if it isn't google-chrome on your PATH.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME || "google-chrome";

/** Keep in step with src/ui/theme.ts. */
export const PALETTE = {
  gold: "#FFB020",
  ink: "#14110F",
  cream: "#FBF6EC",
  moneyIn: "#1FA463",
  moneyOut: "#F0644B",
};

// -- shapes (1024 x 1024, centred on 512) -------------------------------------------

/** Two coins meeting edge to edge, tilted like two glasses touching. */
const COINS = [
  { cx: 318, cy: 590 },
  { cx: 706, cy: 434 },
];
const COIN_R = 209;
const RIM_R = 150;
const RIM_W = 22;
/** The spark where they touch. */
const SPARK = "M512 382 Q526 498 642 512 Q526 526 512 642 Q498 526 382 512 Q498 498 512 382 Z";
const HALO_W = 26;

const scaled = (s, body) => `<g transform="translate(512 512) scale(${s}) translate(-512 -512)">${body}</g>`;

function mark({ coin = PALETTE.ink, cut = PALETTE.gold, spark = PALETTE.cream } = {}) {
  const coins = COINS.map(
    ({ cx, cy }) =>
      `<circle cx="${cx}" cy="${cy}" r="${COIN_R}" fill="${coin}"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${RIM_R}" fill="none" stroke="${cut}" stroke-width="${RIM_W}"/>`,
  ).join("");
  return coins + `<path d="${SPARK}" fill="${spark}" stroke="${cut}" stroke-width="${HALO_W}" stroke-linejoin="round" paint-order="stroke"/>`;
}

/** One colour, with the rims and halo cut out: Android 13+ themed icons. */
function monoMark(s) {
  return (
    `<defs><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">` +
    `<rect width="1024" height="1024" fill="#000"/>${scaled(s, mark({ coin: "#fff", cut: "#000", spark: "#fff" }))}</mask></defs>` +
    `<rect width="1024" height="1024" fill="#fff" mask="url(#m)"/>`
  );
}

/** Rounded gold tile with the mark: the logo wherever the background is unknown. */
function tile(x, y, size) {
  const k = size / 1024;
  return (
    `<g transform="translate(${x} ${y}) scale(${k})">` +
    `<rect width="1024" height="1024" rx="230" fill="${PALETTE.gold}"/>${scaled(0.86, mark())}</g>`
  );
}

/** Lowercase monoline "clink"; the dot on the i is a gold coin. viewBox 0 0 540 220. */
function wordmarkBody(ink) {
  return (
    `<g transform="translate(14 0)" fill="none" stroke="${ink}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M100 116 A50 50 0 1 0 100 184"/>` +
    `<path d="M158 30 V200"/>` +
    `<path d="M218 106 V200"/>` +
    `<path d="M278 200 V106 M278 150 A50 50 0 0 1 378 150 V200"/>` +
    `<path d="M438 30 V200 M500 106 L440 160 M462 142 L506 200"/>` +
    `</g><circle cx="232" cy="48" r="21" fill="${PALETTE.gold}"/>`
  );
}
const WORD_W = 540;
const WORD_H = 220;

function wordmark(x, y, width, ink) {
  const k = width / WORD_W;
  return `<g transform="translate(${x} ${y}) scale(${k})">${wordmarkBody(ink)}</g>`;
}

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;

// -- files ----------------------------------------------------------------------------

const brand = join(ROOT, "assets/brand");
mkdirSync(brand, { recursive: true });

const SVGS = {
  /** The mark alone, for print and press. */
  "mark.svg": svg(1024, 1024, mark()),
  "logo-tile.svg": svg(1024, 1024, tile(0, 0, 1024)),
  "wordmark.svg": svg(WORD_W, WORD_H, wordmarkBody(PALETTE.ink)),
  "wordmark-cream.svg": svg(WORD_W, WORD_H, wordmarkBody(PALETTE.cream)),
  /** iOS and the store: full-bleed gold, the OS rounds the corners. */
  "icon.svg": svg(1024, 1024, `<rect width="1024" height="1024" fill="${PALETTE.gold}"/>${scaled(0.86, mark())}`),
  /** Android foreground: inside the 66% safe circle; background colour comes from app.config.js. */
  "adaptive-icon.svg": svg(1024, 1024, scaled(0.7, mark())),
  "monochrome-icon.svg": svg(1024, 1024, monoMark(0.7)),
  "splash.svg": svg(1024, 1024, tile(352, 300, 320) + wordmark(392, 680, 240, PALETTE.ink)),
  "splash-dark.svg": svg(1024, 1024, tile(352, 300, 320) + wordmark(392, 680, 240, PALETTE.cream)),
  "favicon.svg": svg(48, 48, tile(0, 0, 48)),
};
for (const [name, body] of Object.entries(SVGS)) writeFileSync(join(brand, name), body);

const HERO = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1600px;height:800px;background:${PALETTE.cream};font-family:Lato,"Helvetica Neue",Arial,sans-serif;color:${PALETTE.ink};overflow:hidden}
  .wrap{display:flex;height:100%;align-items:center;padding:0 110px;box-sizing:border-box;gap:80px}
  .copy{flex:1}
  .brand{display:flex;align-items:center;gap:28px;margin-bottom:56px}
  h1{font-size:92px;line-height:1;font-weight:900;letter-spacing:-3px;margin:0 0 28px}
  p{font-size:32px;line-height:1.35;margin:0;color:#5E564C;max-width:640px}
  .moment{width:420px;height:640px;border-radius:56px;background:${PALETTE.gold};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;box-shadow:0 30px 80px rgba(20,17,15,.18)}
  .label{font-size:22px;font-weight:700;letter-spacing:3px;opacity:.75}
  .big{font-size:112px;font-weight:900;letter-spacing:-4px}
  .amt{font-size:52px;font-weight:900;letter-spacing:-1px}
  .from{font-size:26px;opacity:.75}
</style></head><body><div class="wrap">
  <div class="copy">
    <div class="brand">${svg(132, 132, tile(0, 0, 132))}${svg(270, 110, wordmark(0, 0, 270, PALETTE.ink))}</div>
    <h1>Money that<br>just works.</h1>
    <p>Add money, send it and cash it out with people near you. Hold it in dollars or bitcoin, on your own phone.</p>
  </div>
  <div class="moment">
    <div class="label">MONEY IN</div>
    <svg width="220" height="220" viewBox="0 0 1024 1024">${mark()}</svg>
    <div class="big">Clink!</div>
    <div class="amt">+ $25.00</div>
    <div class="from">from Ana</div>
  </div>
</div></body></html>`;

// -- render ---------------------------------------------------------------------------

const work = mkdtempSync(join(tmpdir(), "clink-brand-"));

function render(source, out, w, h) {
  execFileSync(
    CHROME,
    ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", `--window-size=${w},${h}`, "--default-background-color=00000000", `--screenshot=${out}`, pathToFileURL(source).href],
    { stdio: "ignore" },
  );
  console.log(`  ${out.replace(ROOT + "/", "")}`);
}

const PNGS = [
  ["icon.svg", "assets/icon.png", 1024],
  ["adaptive-icon.svg", "assets/adaptive-icon.png", 1024],
  ["monochrome-icon.svg", "assets/monochrome-icon.png", 1024],
  ["splash.svg", "assets/splash.png", 1024],
  ["splash-dark.svg", "assets/splash-dark.png", 1024],
  ["logo-tile.svg", "assets/brand/logo-tile.png", 1024],
];
for (const [src, out, size] of PNGS) render(join(brand, src), join(ROOT, out), size, size);

// Chrome won't open a window as small as a favicon, so draw it large in a page and crop by sizing.
const fav = join(work, "favicon.html");
writeFileSync(fav, `<!doctype html><body style="margin:0;background:transparent">${SVGS["favicon.svg"]}</body>`);
render(fav, join(ROOT, "assets/favicon.png"), 48, 48);

const hero = join(work, "hero.html");
writeFileSync(hero, HERO);
render(hero, join(ROOT, "docs/hero.png"), 1600, 800);
