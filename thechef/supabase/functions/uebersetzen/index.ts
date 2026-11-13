// Produkt-/Bereichsnamen in alle Sprachen vorschlagen. Der Chef bestätigt –
// in der App sind KI-Vorschläge markiert, bis er sie angefasst hat.
import { admin, aufrufer, bedienen, fehler, json } from '../_shared/http.ts';
import { anfrage, kostenBuchen, textAus, type Nutzung } from '../_shared/claude.ts';

const SPRACHEN = ['de', 'tr', 'ku', 'ar', 'en'];

bedienen(async (req) => {
  const { betrieb } = await aufrufer(req);
  const { name, von } = await req.json();
  if (!name || typeof name !== 'string' || name.length > 120) return fehler('name fehlt');
  const m = await anfrage({
    system: 'Du übersetzt Namen von Lebensmitteln und Lagerorten für eine Restaurantküche. Kurz, wie man es in der Küche sagt, ohne Erklärungen. ku = Kurdisch Kurmancî in lateinischer Schrift. ar = Arabisch (Hocharabisch, wie in Restaurants in Deutschland üblich).',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: SPRACHEN, properties: Object.fromEntries(SPRACHEN.map((s) => [s, { type: 'string' }])) } } },
    messages: [{ role: 'user', content: `Name (${von}): ${name}` }],
  });
  const namen = JSON.parse(textAus(m));
  namen[von] = name; // Das Original des Chefs bleibt, wie er es geschrieben hat
  await kostenBuchen(admin(), betrieb.id, 'uebersetzung', m.usage as Nutzung);
  return json({ namen });
});
