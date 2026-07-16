#!/usr/bin/env node
'use strict';

// Tests fuer die SEO-Seiten-Generierung. Laufen ohne Keys/Netz:
//   node test-seo.js
// Generierte Dateien landen in einem Temp-Ordner (SEO_OUT_DIR), nicht im Repo.

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-test-'));
process.env.SEO_OUT_DIR = OUT;
const seo = require('./build-seo-pages.js');

let tests = 0;
function test(name, fn) { tests++; fn(); console.log('  ok  ' + name); }

const rest = {
  id: 'r1', slug: 'la-piazza-emden', name: 'La Piazza', city: 'Emden',
  street: 'Neutorstraße 12', zip: '26721', phone: '+49 4921 123456',
  cuisine: 'italienisch', rating: 4.7, rating_count: 12, delivery_fee: 2.5,
  opening_time: '11:30:00', closing_time: '22:00:00',
  opening_hours: { pause_enabled: true, pause_start: '14:00', pause_end: '17:00' },
  updated_at: '2026-07-10T12:00:00Z'
};
const menue = [
  { name: 'Pizza Salami', base_price: 10.5, is_popular: true, menu_categories: { name: 'Pizza' } },
  { name: 'Lasagne al Forno', base_price: 12.9, is_popular: true, menu_categories: { name: 'Pasta' } },
  { name: 'Tiramisu', price: 5.9, menu_categories: { name: 'Dessert' } }
];
const reviews = [{ rating: 5, comment: 'Top!', author_name: 'Gast', created_at: '2026-07-14T10:00:00Z' }];

test('Oeffnungszeiten-Parser: App-Format (Pause), Wochentage, leer', () => {
  const oeff = seo.parseOeffnungszeiten(rest);
  assert.deepStrictEqual(oeff.specs, ['Mo-Su 11:30-14:00', 'Mo-Su 17:00-22:00']);
  assert.ok(oeff.text.includes('11:30–14:00') && oeff.text.includes('17:00–22:00'));
  assert.deepStrictEqual(seo.parseOeffnungszeiten({ opening_hours: { mon: { open: '10:00', close: '20:00' } } }).specs, ['Mo 10:00-20:00']);
  assert.deepStrictEqual(seo.parseOeffnungszeiten({}).specs, []);
});

test('Restaurant-FAQ nur mit echten Daten', () => {
  const faqs = seo.buildRestaurantFaqs(rest, 'La Piazza', 'Emden', 'Pizzeria', menue);
  assert.ok(faqs.length >= 4);
  assert.ok(faqs[0].q.includes('geöffnet') && faqs[0].a.includes('11:30'));
  assert.ok(faqs.some((f) => f.a.includes('oder Lieferung')), 'delivery_fee -> Lieferung erwaehnt');
  assert.ok(faqs.some((f) => f.a.includes('Pizza Salami')), 'beliebte Gerichte in der FAQ');
  const ohneDaten = seo.buildRestaurantFaqs({ slug: 'x', name: 'X' }, 'X', 'Norden', 'Café', []);
  assert.ok(!ohneDaten.some((f) => f.q.includes('geöffnet')), 'ohne Zeiten keine Zeiten-FAQ');
});

test('Restaurant-Seite: FAQ-Schema, sichtbare Oeffnungszeiten, ehrliches lastmod', () => {
  const ergebnis = seo.generateRestaurantPage(rest, menue, reviews);
  const html = fs.readFileSync(path.join(OUT, 'la-piazza-emden.html'), 'utf8');
  assert.ok(html.includes('"FAQPage"'));
  assert.ok(html.includes('Öffnungszeiten von La Piazza'));
  assert.ok(html.includes('Häufige Fragen zu La Piazza'));
  assert.ok(html.includes('"openingHours":["Mo-Su 11:30-14:00","Mo-Su 17:00-22:00"]'));
  assert.strictEqual(ergebnis.lastmod, '2026-07-14', 'lastmod = juengste Aenderung (hier: neueste Bewertung)');
});

test('Listen-Titel mit echter Anzahl und Jahr', () => {
  const r2 = Object.assign({}, rest, { slug: 'da-mario-emden', name: 'Da Mario' });
  const stadt = seo.CITIES.find((c) => c.slug === 'emden');
  seo.generateCityCategoryPage(stadt, seo.CATEGORIES[0], [rest, r2], 'de');
  const html = fs.readFileSync(path.join(OUT, 'pizzeria-emden.html'), 'utf8');
  assert.ok(/<title>Die 2 besten Pizzerien in Emden \(\d{4}\)/.test(html), String(html.match(/<title>[^<]*/)));
  assert.ok(html.includes('Die 2 besten Pizzerien in Emden</h1>'));
});

test('llms.txt fuer KI-Assistenten + robots.txt mit KI-Crawler-Freigabe', () => {
  seo.writeLlmsTxt([rest]);
  const llms = fs.readFileSync(path.join(OUT, 'llms.txt'), 'utf8');
  assert.ok(llms.includes('[La Piazza](https://kiekmolin.de/la-piazza-emden)'));
  assert.ok(llms.includes('geöffnet täglich 11:30–14:00'));
  assert.ok(llms.includes('## Orte') && llms.includes('## Kategorien'));
  seo.writeRobots();
  const robots = fs.readFileSync(path.join(OUT, 'robots.txt'), 'utf8');
  assert.ok(robots.includes('GPTBot') && robots.includes('ClaudeBot') && robots.includes('llms.txt'));
});

test('Sitemap nutzt echte lastmod-Daten', () => {
  seo.writeSitemap([{ url: 'https://kiekmolin.de/la-piazza-emden', restaurant: true, lastmod: '2026-07-14' }]);
  const xml = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
  assert.ok(xml.includes('<loc>https://kiekmolin.de/la-piazza-emden</loc><lastmod>2026-07-14</lastmod>'));
});

fs.rmSync(OUT, { recursive: true, force: true });
console.log('\n' + tests + ' Tests bestanden.');
