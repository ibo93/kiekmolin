import { describe, it, expect } from 'vitest';
import { hinweiseOhneErledigte, pushZusammenfassung } from '../supabase/functions/_shared/logik/lager.ts';
import type { Hinweis } from '../supabase/functions/_shared/logik/typen.ts';

const h = (art: Hinweis['art'], produkt_id: string, prioritaet: number): Hinweis => ({ art, prioritaet, daten: { produkt_id }, aktion: 'erledigt' });
const joghurt = h('laeuft_ab', 'joghurt', 90);
const haehnchen = h('leer', 'haehnchen', 85);
const tomaten = h('knapp', 'tomaten', 60);
const brot = h('abgelaufen', 'brot', 100);

describe('Hinweise nach dem Scan', () => {
  it('erledigt heißt erledigt – kommt beim nächsten Scan nicht wieder', () => {
    expect(hinweiseOhneErledigte([joghurt, tomaten], [{ art: 'laeuft_ab', daten: { produkt_id: 'joghurt' } }])).toEqual([tomaten]);
  });
  it('anderer Hinweis zum selben Produkt bleibt (z. B. jetzt leer statt knapp)', () => {
    expect(hinweiseOhneErledigte([h('leer', 'tomaten', 85)], [{ art: 'knapp', daten: { produkt_id: 'tomaten' } }])).toHaveLength(1);
  });
  it('EINE Nachricht mit höchstens 3 Punkten, Unwichtiges nicht', () => {
    const z = pushZusammenfassung([brot, joghurt, haehnchen, tomaten, h('leer', 'salat', 85)], new Set());
    expect(z?.neu.map((x) => x.daten.produkt_id)).toEqual(['brot', 'joghurt', 'haehnchen']);
    expect(z?.schluessel).toHaveLength(4); // alle vier gelten als gemeldet
  });
  it('schon Gemeldetes klingelt nicht nochmal (CLAUDE.md: 96 Mails in einer Nacht)', () => {
    expect(pushZusammenfassung([joghurt, tomaten], new Set(['laeuft_ab:joghurt']))).toBeNull();
  });
  it('etwas NEUES Wichtiges klingelt trotzdem', () => {
    expect(pushZusammenfassung([joghurt, haehnchen], new Set(['laeuft_ab:joghurt']))?.neu).toEqual([haehnchen]);
  });
});
