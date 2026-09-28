// Die Datenbank-Regeln gegen eine ECHTE Postgres-Instanz (PGlite) prüfen –
// nicht gegen den Quelltext. Die teuersten Fehler bei Kiek mol in standen
// in RLS-Regeln, die im Code richtig aussahen und live [] lieferten.
//
// Nachgebaut wird nur, was Supabase drumherum stellt: auth.uid(), die
// Rolle "authenticated" und storage.foldername(). Die Migrationen laufen
// unverändert.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';
import { chargenFortschreiben, type Charge } from '../supabase/functions/_shared/logik/chargen.ts';

const MIG = (n: string) => readFileSync(new URL(`../supabase/migrations/${n}`, import.meta.url), 'utf8');

const SUPABASE_NACHBAU = `
  create role authenticated nologin;
  create role anon nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  grant usage on schema public to authenticated, anon;
  alter default privileges in schema public grant all on tables to authenticated;
  alter default privileges in schema public grant all on functions to authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant all on storage.objects to authenticated;
`;

let db: PGlite;
const ID = {
  chefA: '00000000-0000-0000-0000-00000000000a',
  chefB: '00000000-0000-0000-0000-00000000000b',
  halil: '00000000-0000-0000-0000-0000000000c1',
  fremd: '00000000-0000-0000-0000-0000000000ff',
};

/** Als Nutzer ausführen – wie eine Anfrage mit dessen Anmeldung. */
async function als<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec('set role authenticated');
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
}
async function fehlerText(p: Promise<unknown>) {
  try { await p; return ''; } catch (e) { return String((e as Error).message); }
}

let betriebA = '', betriebB = '', kuehlhausA = '', tomatenA = '', joghurtA = '';

beforeAll(async () => {
  db = new PGlite();
  await db.exec('create extension if not exists pgcrypto').catch(() => {});
  await db.exec(SUPABASE_NACHBAU);
  // pgcrypto fehlt in PGlite; gen_random_uuid() ist in Postgres 13+ eingebaut.
  await db.exec(MIG('0001_grundlage.sql').replace('create extension if not exists pgcrypto;', ''));
  await db.exec(MIG('0002_speicher.sql'));
  await db.exec(MIG('0004_ios_push.sql'));
  await db.exec(MIG('0005_weggeworfen_offline.sql'));
  for (const id of Object.values(ID)) await db.query('insert into auth.users (id) values ($1)', [id]);

  betriebA = (await als<{ id: string }>(ID.chefA, `select betrieb_anlegen('ÖZ KEBAB', 'Mehmet', 'tr') as id`))[0].id;
  betriebB = (await als<{ id: string }>(ID.chefB, `select betrieb_anlegen('Pizzeria B', 'Luigi', 'de') as id`))[0].id;

  kuehlhausA = (await als<{ id: string }>(ID.chefA,
    `insert into bereiche (betrieb_id, namen, art) values ($1, '{"de":"Kühlhaus","tr":"Soğuk oda"}', 'kuehlhaus') returning id`, [betriebA]))[0].id;
  tomatenA = (await als<{ id: string }>(ID.chefA,
    `insert into produkte (betrieb_id, namen, zaehleinheit, mindestbestand, standard_haltbarkeit_tage, preis_pro_einheit)
     values ($1, '{"de":"Tomaten"}', 'kiste', 6, 7, 12) returning id`, [betriebA]))[0].id;
  joghurtA = (await als<{ id: string }>(ID.chefA,
    `insert into produkte (betrieb_id, namen, zaehleinheit, mindestbestand)
     values ($1, '{"de":"Joghurt"}', 'becher', 20) returning id`, [betriebA]))[0].id;
  await als(ID.chefB, `insert into produkte (betrieb_id, namen) values ($1, '{"de":"Mozzarella"}')`, [betriebB]);
});

describe('Mandanten sind getrennt', () => {
  it('Chef A sieht seine Produkte – die Regel ist also nicht einfach "alles leer"', async () => {
    const r = await als(ID.chefA, 'select namen from produkte');
    expect(r.length).toBe(2);
  });
  it('Chef A sieht NICHT die Produkte von B', async () => {
    const r = await als<{ namen: { de: string } }>(ID.chefA, 'select namen from produkte');
    expect(r.map((x) => x.namen.de)).not.toContain('Mozzarella');
  });
  it('Chef A kann nichts in Betrieb B schreiben', async () => {
    const f = await fehlerText(als(ID.chefA, `insert into produkte (betrieb_id, namen) values ($1, '{"de":"X"}')`, [betriebB]));
    expect(f).toMatch(/row-level security/);
  });
  it('Wer zu keinem Betrieb gehört, sieht nichts', async () => {
    expect((await als(ID.fremd, 'select * from produkte')).length).toBe(0);
    expect((await als(ID.fremd, 'select * from betriebe')).length).toBe(0);
  });
  it('Ohne Anmeldung sieht niemand etwas', async () => {
    expect((await als(null, 'select * from produkte')).length).toBe(0);
  });
});

describe('Einladung und Rollen', () => {
  let code = '';
  it('Chef erstellt einen lesbaren Code (6 Zeichen, ohne 0/O/1/I)', async () => {
    code = (await als<{ c: string }>(ID.chefA, `select einladung_erstellen() as c`))[0].c;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
  it('Halil tritt mit dem Code bei und ist Mitarbeiter', async () => {
    const b = (await als<{ b: string }>(ID.halil, `select einladung_annehmen($1, 'Halil', 'ku') as b`, [code.toLowerCase()]))[0].b;
    expect(b).toBe(betriebA);
    const me = (await als<{ rolle: string; sprache: string }>(ID.halil, 'select rolle, sprache from nutzer where id = auth.uid()'))[0];
    expect(me).toEqual({ rolle: 'mitarbeiter', sprache: 'ku' });
  });
  it('Derselbe Code geht nicht zweimal', async () => {
    const f = await fehlerText(als(ID.fremd, `select einladung_annehmen($1, 'X')`, [code]));
    expect(f).toMatch(/ungültig/);
  });
  it('Mitarbeiter darf seine Sprache ändern …', async () => {
    await als(ID.halil, `update nutzer set sprache = 'ar' where id = auth.uid()`);
    const r = await als<{ sprache: string }>(ID.halil, 'select sprache from nutzer where id = auth.uid()');
    expect(r[0].sprache).toBe('ar');
  });
  it('… sich aber nicht zum Chef machen', async () => {
    const f = await fehlerText(als(ID.halil, `update nutzer set rolle = 'chef' where id = auth.uid()`));
    expect(f).toMatch(/permission denied/);
  });
  it('Mitarbeiter darf den Produktkatalog nicht ändern', async () => {
    const f = await fehlerText(als(ID.halil, `insert into produkte (betrieb_id, namen) values ($1, '{"de":"X"}')`, [betriebA]));
    expect(f).toMatch(/row-level security/);
    // Update auf fremde Zeilen ist bei RLS still (0 Zeilen) – daher Wirkung prüfen:
    await als(ID.halil, `update produkte set mindestbestand = 999 where id = $1`, [tomatenA]);
    const r = await als<{ m: string }>(ID.chefA, 'select mindestbestand::text as m from produkte where id = $1', [tomatenA]);
    expect(r[0].m).toBe('6');
  });
  it('Mitarbeiter sieht die KI-Kosten nicht', async () => {
    await db.query(`insert into ki_kosten (betrieb_id, art, modell, kosten_eur) values ($1, 'scan', 'm', 0.02)`, [betriebA]);
    expect((await als(ID.halil, 'select * from ki_kosten')).length).toBe(0);
    expect((await als(ID.chefA, 'select * from ki_kosten')).length).toBe(1);
  });
  it('Mitarbeiter kann keinen Einladungscode erzeugen', async () => {
    const f = await fehlerText(als(ID.halil, `select einladung_erstellen()`));
    expect(f).toMatch(/nur der Chef/);
  });
});

describe('Scan bestätigen → Bestand', () => {
  async function scan(lokal: string, positionen: unknown[]) {
    const s = (await als<{ id: string }>(ID.halil,
      `insert into scans (betrieb_id, bereich_id, nutzer_id, lokal_id) values ($1, $2, auth.uid(), $3) returning id`,
      [betriebA, kuehlhausA, lokal]))[0].id;
    await als(ID.halil, `select scan_bestaetigen($1, $2::jsonb)`, [s, JSON.stringify(positionen)]);
    return s;
  }
  it('Mitarbeiter scannt: 4 Kisten Tomaten, 18 Becher Joghurt mit MHD vom Etikett', async () => {
    await scan('s1', [
      { produkt_id: tomatenA, anzahl: 4 },
      { produkt_id: joghurtA, anzahl: 18, mhd: '2026-09-28' },
    ]);
    const r = await als<{ produkt_id: string; menge_einheiten: string; mhd: string | null; mhd_quelle: string | null }>(ID.chefA,
      `select produkt_id, menge_einheiten::text, mhd::text, mhd_quelle from aktueller_bestand order by aktueller_bestand.menge_einheiten`);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ produkt_id: tomatenA, menge_einheiten: '4', mhd_quelle: 'berechnet' });
    expect(r[1]).toMatchObject({ produkt_id: joghurtA, menge_einheiten: '18', mhd: '2026-09-28', mhd_quelle: 'etikett' });
  });
  it('Zwei Fotos im selben Bereich werden addiert', async () => {
    await scan('s2', [{ produkt_id: tomatenA, anzahl: 2 }, { produkt_id: tomatenA, anzahl: 3 }, { produkt_id: joghurtA, anzahl: 18 }]);
    const r = await als<{ m: string }>(ID.chefA, `select menge_einheiten::text as m from aktueller_bestand where produkt_id = $1`, [tomatenA]);
    expect(r[0].m).toBe('5');
  });
  it('Nicht mehr gesehen = 0 (und nicht still der alte Wert)', async () => {
    await scan('s3', [{ produkt_id: tomatenA, anzahl: 5 }]);
    const r = await als<{ m: string }>(ID.chefA, `select menge_einheiten::text as m from aktueller_bestand where produkt_id = $1`, [joghurtA]);
    expect(r[0].m).toBe('0');
  });
  it('Doppelt bestätigt ändert nichts', async () => {
    const s = await scan('s4', [{ produkt_id: tomatenA, anzahl: 1 }]);
    const r = await als<{ e: { schon_bestaetigt?: boolean } }>(ID.halil, `select scan_bestaetigen($1, '[{"produkt_id":"${tomatenA}","anzahl":99}]') as e`, [s]);
    expect(r[0].e.schon_bestaetigt).toBe(true);
    const m = await als<{ m: string }>(ID.chefA, `select menge_einheiten::text as m from aktueller_bestand where produkt_id = $1`, [tomatenA]);
    expect(m[0].m).toBe('1');
  });
  it('Chef B sieht vom Bestand in A nichts', async () => {
    expect((await als(ID.chefB, 'select * from aktueller_bestand')).length).toBe(0);
    expect((await als(ID.chefB, 'select * from bestand')).length).toBe(0);
  });
  it('Derselbe Offline-Scan kann nicht zweimal angelegt werden', async () => {
    const f = await fehlerText(als(ID.halil,
      `insert into scans (betrieb_id, bereich_id, lokal_id) values ($1, $2, 's1')`, [betriebA, kuehlhausA]));
    expect(f).toMatch(/duplicate key|unique/);
  });
});

describe('Push-Abos (Web und iPhone-App)', () => {
  it('iPhone-App: Geräte-Token ohne Web-Schlüssel wird gespeichert', async () => {
    await als(ID.chefA, `insert into push_abos (betrieb_id, nutzer_id, art, endpoint) values ($1, $2, 'apns', 'a1b2c3')`, [betriebA, ID.chefA]);
    const r = await als<{ art: string }>(ID.chefA, `select art from push_abos where endpoint = 'a1b2c3'`);
    expect(r).toEqual([{ art: 'apns' }]);
  });
  it('Web-Abo ohne Schlüssel wird abgelehnt – es käme nie an', async () => {
    const f = await fehlerText(als(ID.chefA, `insert into push_abos (betrieb_id, nutzer_id, endpoint) values ($1, $2, 'https://push.example/x')`, [betriebA, ID.chefA]));
    expect(f).toMatch(/push_web_hat_schluessel/);
  });
  it('fremder Betrieb: kein Abo auf fremden Namen', async () => {
    const f = await fehlerText(als(ID.chefA, `insert into push_abos (betrieb_id, nutzer_id, art, endpoint) values ($1, $2, 'apns', 'x9')`, [betriebB, ID.chefA]));
    expect(f).toMatch(/row-level security/);
  });
});

describe('Weggeworfen aus der Offline-Warteschlange', () => {
  it('dieselbe Meldung zweimal hochgeladen zählt nur einmal', async () => {
    const neu = `insert into weggeworfen (betrieb_id, produkt_id, menge_einheiten, lokal_id, zeitpunkt)
      values ($1, $2, 2, '11111111-2222-3333-4444-555555555555', '2026-09-28T06:10:00Z') on conflict (lokal_id) do nothing`;
    await als(ID.chefA, neu, [betriebA, tomatenA]);
    await als(ID.chefA, neu, [betriebA, tomatenA]);
    const r = await als<{ n: number; z: string }>(ID.chefA,
      `select count(*)::int as n, min(zeitpunkt)::text as z from weggeworfen where lokal_id = '11111111-2222-3333-4444-555555555555'`);
    expect(r[0].n).toBe(1);
    expect(r[0].z).toMatch(/^2026-09-28 06:10:00/);
  });
});

describe('Foto-Speicher', () => {
  it('Eigener Ordner: hochladen erlaubt', async () => {
    await als(ID.halil, `insert into storage.objects (bucket_id, name) values ('scan-fotos', $1)`, [`${betriebA}/s1/f1.jpg`]);
    expect((await als(ID.chefA, `select * from storage.objects`)).length).toBe(1);
  });
  it('Fremder Ordner: verboten, und fremde Fotos unsichtbar', async () => {
    const f = await fehlerText(als(ID.halil, `insert into storage.objects (bucket_id, name) values ('scan-fotos', $1)`, [`${betriebB}/x.jpg`]));
    expect(f).toMatch(/row-level security/);
    expect((await als(ID.chefB, `select * from storage.objects`)).length).toBe(0);
  });
});

describe('Chargen (FIFO) – SQL und TypeScript rechnen gleich', () => {
  const jetzt = '2026-09-27T20:00:00Z';
  const faelle: Array<{ name: string; alt: Charge[]; menge: number; etikett: string | null; halt: number | null }> = [
    { name: 'leer → neu mit Haltbarkeit', alt: [], menge: 4, etikett: null, halt: 3 },
    { name: 'leer → neu mit Etikett', alt: [], menge: 4, etikett: '2026-10-01', halt: 3 },
    { name: 'Nachschub', alt: [{ menge: 2, eingang: '2026-09-20', mhd: '2026-09-23', quelle: 'berechnet' }], menge: 5, etikett: null, halt: 3 },
    { name: 'Verbrauch nimmt älteste zuerst', alt: [
      { menge: 2, eingang: '2026-09-20', mhd: '2026-09-23', quelle: 'berechnet' },
      { menge: 3, eingang: '2026-09-25', mhd: '2026-09-28', quelle: 'berechnet' }], menge: 4, etikett: null, halt: 3 },
    { name: 'Verbrauch über eine ganze Charge', alt: [
      { menge: 2, eingang: '2026-09-20', mhd: '2026-09-23', quelle: 'berechnet' },
      { menge: 3, eingang: '2026-09-25', mhd: '2026-09-28', quelle: 'berechnet' }], menge: 1, etikett: null, halt: 3 },
    { name: 'Etikett ersetzt berechnetes MHD der ältesten', alt: [
      { menge: 3, eingang: '2026-09-25', mhd: '2026-09-28', quelle: 'berechnet' }], menge: 3, etikett: '2026-09-30', halt: 3 },
    { name: 'ohne Haltbarkeit kein MHD', alt: [], menge: 2, etikett: null, halt: null },
    { name: 'alles weg', alt: [{ menge: 3, eingang: '2026-09-25', mhd: '2026-09-28', quelle: 'berechnet' }], menge: 0, etikett: null, halt: 3 },
  ];
  for (const f of faelle) {
    it(f.name, async () => {
      const sql = (await db.query<{ c: Charge[] }>(
        `select chargen_fortschreiben($1::jsonb, $2, $3::timestamptz, $4::date, $5) as c`,
        [JSON.stringify(f.alt), f.menge, jetzt, f.etikett, f.halt])).rows[0].c;
      const ts = chargenFortschreiben(f.alt, f.menge, new Date(jetzt), f.etikett, f.halt);
      expect(ts).toEqual(sql.map((c) => ({ ...c, menge: Number(c.menge) })));
      expect(ts.reduce((s, c) => s + c.menge, 0)).toBe(f.menge);
    });
  }
  it('Test prüft wirklich: älteste Charge wird zuerst verbraucht', () => {
    const r = chargenFortschreiben(faelle[3].alt, 4, new Date(jetzt), null, 3);
    expect(r).toEqual([
      { menge: 1, eingang: '2026-09-20', mhd: '2026-09-23', quelle: 'berechnet' },
      { menge: 3, eingang: '2026-09-25', mhd: '2026-09-28', quelle: 'berechnet' },
    ]);
  });
});
