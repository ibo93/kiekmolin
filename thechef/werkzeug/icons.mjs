// Erzeugt icon-192/512 und apple-touch-icon aus public/icon.svg (Chromium rendert das SVG).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [name, g] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  const p = await b.newPage({ viewport: { width: g, height: g } });
  await p.setContent(`<style>html,body{margin:0}svg{width:${g}px;height:${g}px;display:block}</style>${svg}`);
  await p.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname });
  await p.close();
}
await b.close();
console.log('Icons erzeugt');
