// Renders assets/icon.svg into the PNG app icons. Run: node tools/render-icons.js
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");
const inner = fs.readFileSync(path.join(ROOT, "assets/icon.svg"), "utf8")
  .replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const BG = "#FFB703";

// "any": the rounded tile fills the canvas. "maskable": square solid bg, art scaled to the 80% safe zone.
const svgFor = (maskable) => maskable
  ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${BG}"/><g transform="translate(6.4 6.4) scale(.8)">${inner}</g></svg>`
  : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${inner}</svg>`;

(async () => {
  const browser = await chromium.launch();
  for (const [file, size, maskable] of [["icon-192.png", 192, false], ["icon-512.png", 512, false], ["icon-maskable-512.png", 512, true]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svgFor(maskable)}`);
    await page.screenshot({ path: path.join(ROOT, "assets", file), omitBackground: true });
    await page.close();
    console.log("wrote assets/" + file);
  }
  await browser.close();
})();
