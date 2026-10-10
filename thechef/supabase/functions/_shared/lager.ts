// Lagerdaten eines Betriebs laden und mit der gemeinsamen Logik auswerten.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { einkaufsliste, produktStaende, tagIn } from './logik/lager.ts';
import type { Bereich, BestandZeile, Betrieb, EinkaufEintrag, Produkt } from './logik/typen.ts';

function pruefe<T>(r: { data: T | null; error: { message: string } | null }, was: string): T {
  if (r.error) throw new Error(`${was}: ${r.error.message}`);
  return (r.data ?? []) as T;
}

export async function lagerLaden(db: SupabaseClient, betrieb: Betrieb) {
  const heute = tagIn(betrieb.zeitzone);
  const [p, b, br, e] = await Promise.all([
    db.from('produkte').select('*').eq('betrieb_id', betrieb.id),
    db.from('aktueller_bestand').select('*').eq('betrieb_id', betrieb.id),
    db.from('bereiche').select('*').eq('betrieb_id', betrieb.id).eq('aktiv', true).order('reihenfolge'),
    db.from('einkauf_eintraege').select('*').eq('betrieb_id', betrieb.id).eq('datum', heute),
  ]);
  const produkte = pruefe(p, 'Produkte').map((x: Produkt) => ({ ...x, mindestbestand: Number(x.mindestbestand), menge_pro_einheit: x.menge_pro_einheit == null ? null : Number(x.menge_pro_einheit), preis_pro_einheit: x.preis_pro_einheit == null ? null : Number(x.preis_pro_einheit) })) as Produkt[];
  const bestand = pruefe(b, 'Bestand').map((z: BestandZeile) => ({ ...z, menge_einheiten: Number(z.menge_einheiten), chargen: (z.chargen ?? []).map((c) => ({ ...c, menge: Number(c.menge) })) })) as BestandZeile[];
  const bereiche = pruefe(br, 'Bereiche') as Bereich[];
  const eintraege = pruefe(e, 'Einkauf').map((x: EinkaufEintrag) => ({ ...x, menge_extra: Number(x.menge_extra) })) as EinkaufEintrag[];
  const staende = produktStaende(produkte, bestand, heute);
  return { heute, produkte, bestand, bereiche, eintraege, staende, einkauf: einkaufsliste(staende, eintraege) };
}
