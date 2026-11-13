// Bildschirmfotos der Demo im iPhone-Format – zum Anschauen und als Beleg, dass es rendert.
// Aufruf: node werkzeug/bilder.mjs <url> <zielordner>
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173';
const ziel = process.argv[3] ?? 'bilder';
mkdirSync(ziel, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const fehler = [];

async function seite(name, einrichten, weg, { dunkel = false, sprache = 'de', rolle = 'chef', warte = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: dunkel ? 'dark' : 'light', locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fehler.push(`${name}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && fehler.push(`${name}: ${m.text()}`));
  await p.addInitScript(({ sprache, rolle, einrichten }) => {
    localStorage.setItem('thechef-splash', '1');
    if (einrichten) {
      localStorage.setItem('thechef-sprache', sprache);
      const z = localStorage.getItem('thechef-demo-v1');
      if (!z && rolle) sessionStorage.setItem('rolle', rolle);
    }
  }, { sprache, rolle, einrichten });
  await p.goto(url + '/' + (weg ?? ''));
  if (einrichten && rolle) {
    // Demo: Rolle über die Startseite wählen
    await p.waitForTimeout(1300);
    const knopf = p.getByRole('button', { name: rolle === 'chef' ? /Chef|Şef|Serok|المدير|boss/i : /arbeite|çalışıyorum|dixebitim|أعمل|work here/i });
    if (await knopf.count()) { await knopf.first().click(); await p.waitForTimeout(1500); }
    if (weg) { await p.goto(url + '/' + weg); }
  }
  await p.waitForTimeout(warte);
  await p.screenshot({ path: `${ziel}/${name}.png` });
  await ctx.close();
}

await seite('01-splash', false, '', { warte: 2200 }).catch((e) => fehler.push(String(e)));
// Splash erneut zeigen: Flag entfernen
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(url); await p.waitForTimeout(2800); await p.screenshot({ path: `${ziel}/01-splash.png` }); await ctx.close();
}
await seite('02-sprache', false, '', { warte: 1500 });
await seite('03-mitarbeiter-start', true, '#/m', { rolle: 'mitarbeiter' });
await seite('04-assistent', true, '#/c', { warte: 1800 });
await seite('05-bestand', true, '#/c/bestand', { warte: 1500 });
await seite('06-einkauf', true, '#/c/einkauf', { warte: 1500 });
await seite('07-verlust', true, '#/c/verlust', { warte: 1500 });
await seite('08-einstellungen', true, '#/c/einstellungen');
await seite('09-weggeworfen', true, '#/weggeworfen', { rolle: 'mitarbeiter' });
await seite('10-assistent-dunkel', true, '#/c', { dunkel: true, warte: 1800 });
await seite('11-bestand-dunkel', true, '#/c/bestand', { dunkel: true, warte: 1500 });
await seite('12-frage', true, '#/c/frage?q=' + encodeURIComponent('Reicht das Hähnchen fürs Wochenende?'), { warte: 2500 });
await seite('13-produkte', true, '#/c/katalog/produkte');
await seite('14-mitarbeiter-arabisch', true, '#/m', { rolle: 'mitarbeiter', sprache: 'ar' });
await seite('15-chef-arabisch', true, '#/c/bestand', { sprache: 'ar', warte: 1500 });
await seite('16-produkt-sheet', true, '#/c/katalog/produkte', { warte: 1200 });
await browser.close();
console.log(fehler.length ? 'FEHLER:\n' + fehler.join('\n') : 'keine JS-Fehler');
