// STEMPELKARTE: datenbank/46-stempelkarte.sql in einer ECHTEN Postgres-Datenbank.
//
// Die Quelltext-Tests sehen nicht, ob ein Trigger feuert, ob ein Stempel
// doppelt kommt oder ob eine Absage ihn zurueckholt. Dieses Werkzeug startet
// Postgres im Speicher (PGlite), baut die Tabellen nach, die es in Supabase
// schon gibt (restaurants, orders, customers, die alte loyalty_stamps), spielt
// die Datei ein und spielt echte Ablaeufe durch.
//
// GRENZE: nachgebaute Tabellen, nicht die echten. Spalten, die es in Supabase
// anders gibt, sieht dieses Werkzeug nicht. Und RLS greift hier nur so weit,
// wie die Rollen nachgebaut sind.
//
// AUFRUF   npm i @electric-sql/pglite@0.2.17 && node werkzeug/stempelkarte-sql-pruefen.js
'use strict';
var path = require('path'), fs = require('fs');
var PGlite;
try { PGlite = require('@electric-sql/pglite').PGlite; } catch (e) {
    try { PGlite = require(process.env.PGLITE_PFAD || '@electric-sql/pglite').PGlite; } catch (e2) { console.log('PGlite fehlt: npm i @electric-sql/pglite@0.2.17'); process.exit(0); }
}
var SQL = fs.readFileSync(path.join(__dirname, '..', 'datenbank', '46-stempelkarte.sql'), 'utf8');
var A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';

(async function () {
    var db = new PGlite();
    var n = 0, rot = 0;
    function t(text, ok, mehr) { n++; if (!ok) rot++; console.log((ok ? 'OK  ' : 'FAIL') + ' | ' + text + (ok ? '' : '  -> ' + (mehr || ''))); }
    async function q(s, p) { return (await db.query(s, p || [])).rows; }
    async function karte(rid, tel) { return (await q('select stempel, guthaben, gesamt, eingeloest from stempelkarten where restaurant_id = $1 and telefon = kmi_tel($2)', [rid, tel]))[0] || null; }

    // ---- Nachbau dessen, was es in Supabase schon gibt ----
    await db.exec(`
        create role anon; create role authenticated;
        create table restaurants (id uuid primary key, name text, features jsonb default '[]');
        create table customers (email text, restaurant_id uuid, role text);
        create table orders (id uuid primary key default gen_random_uuid(), restaurant_id uuid, customer_name text, customer_phone text,
                             status text default 'received', created_at timestamptz default now());
        create table loyalty_stamps (customer_phone text, restaurant_id text, stamps_count int, free_meals_earned int, free_meals_used int,
                                     last_order_at timestamptz, last_push_at timestamptz);
        create function kmi_email() returns text language sql as $$ select current_setting('kmi.email', true) $$;
        create function kmi_ist_superadmin() returns boolean language sql as $$ select exists (select 1 from customers where role = 'superadmin' and lower(email) = kmi_email()) $$;
        create function kmi_meine_haeuser() returns setof uuid language sql as $$ select restaurant_id from customers where lower(email) = kmi_email() $$;
        insert into restaurants values ('${A}', 'Haus A', '["loyalty_points"]'), ('${B}', 'Haus B', '[]');
        insert into customers values ('wirt@a.de', '${A}', 'owner');
        -- alte Daten: echte Zeile, Muellzeile (Name als Restaurant), doppelte Nummer in anderer Schreibweise
        insert into loyalty_stamps values ('0491 12345', '${A}', 13, 1, 0, now(), null), ('${A}', 'Haus A', 1, 0, 0, now(), null), ('+49 491 12345', '${A}', 7, 0, 0, now(), null);
    `);

    // ---- Datei einspielen, zweimal (mehrfach muss gehen) ----
    var gegen = await db.exec(SQL);
    await db.exec(SQL);
    var letzte = gegen[gegen.length - 1].rows;
    t('Gegenprobe der Datei: alle Zeilen "ja"', letzte.every(function (r) { return r.ok === 'ja'; }), JSON.stringify(letzte));

    // ---- Umzug der alten Stempel ----
    var alt = await karte(A, '0491-12345');
    t('alte Stempel übernommen: 13 Bestellungen -> 3 auf der Karte, 1 Gratis offen (doppelte Nummer zusammengefasst)', alt && alt.stempel === 3 && alt.guthaben === 1 && alt.gesamt === 13, JSON.stringify(alt));
    t('Müllzeile (Name als Restaurant) ist NICHT übernommen', (await q('select count(*)::int as c from stempelkarten'))[0].c === 1, JSON.stringify(await q('select * from stempelkarten')));
    t('zweimal einspielen zählt nichts doppelt', (await karte(A, '049112345')).gesamt === 13, '');

    // ---- Stempel kommt erst beim Annehmen, genau einmal ----
    var o1 = (await q(`insert into orders (restaurant_id, customer_phone, customer_name) values ($1, '0176 5550001', 'Anna') returning id`, [A]))[0].id;
    t('Bestellung abgeschickt (received): noch kein Stempel', (await karte(A, '01765550001')) === null, JSON.stringify(await karte(A, '01765550001')));
    await q(`update orders set status = 'accepted' where id = $1`, [o1]);
    t('Wirt nimmt an: 1 Stempel', (await karte(A, '01765550001')).stempel === 1, JSON.stringify(await karte(A, '01765550001')));
    await q(`update orders set status = 'preparing' where id = $1`, [o1]);
    await q(`update orders set status = 'ready' where id = $1`, [o1]);
    await q(`update orders set status = 'accepted' where id = $1`, [o1]);
    t('weitere Status-Wechsel derselben Bestellung: kein zweiter Stempel', (await karte(A, '01765550001')).gesamt === 1, JSON.stringify(await karte(A, '01765550001')));

    // ---- Sofort bestätigt (Insert schon als accepted) ----
    await q(`insert into orders (restaurant_id, customer_phone, status) values ($1, '+49 176 5550001', 'accepted')`, [A]);
    t('sofort bestätigte Bestellung stempelt beim Anlegen (+49-Schreibweise = derselbe Gast)', (await karte(A, '01765550001')).gesamt === 2, JSON.stringify(await karte(A, '01765550001')));

    // ---- Absage nimmt den Stempel zurück ----
    var o3 = (await q(`insert into orders (restaurant_id, customer_phone, status) values ($1, '01765550001', 'accepted') returning id`, [A]))[0].id;
    await q(`update orders set status = 'cancelled' where id = $1`, [o3]);
    t('angenommen und dann abgesagt: Stempel zurück', (await karte(A, '01765550001')).gesamt === 2 && (await karte(A, '01765550001')).stempel === 2, JSON.stringify(await karte(A, '01765550001')));
    var o4 = (await q(`insert into orders (restaurant_id, customer_phone) values ($1, '01765550001') returning id`, [A]))[0].id;
    await q(`update orders set status = 'rejected' where id = $1`, [o4]);
    t('nie angenommen und abgelehnt: nichts passiert', (await karte(A, '01765550001')).gesamt === 2, JSON.stringify(await karte(A, '01765550001')));

    // ---- Karte voll -> Guthaben; zehnte Bestellung bringt das Gratis-Gericht erst beim nächsten Mal ----
    for (var i = 0; i < 8; i++) await q(`insert into orders (restaurant_id, customer_phone, status) values ($1, '01765550001', 'accepted')`, [A]);
    var voll = await karte(A, '01765550001');
    t('10 Stempel: Karte beginnt neu (0), 1 Guthaben', voll.stempel === 0 && voll.guthaben === 1 && voll.gesamt === 10, JSON.stringify(voll));

    // ---- Einlösen: atomar, nur mit Guthaben ----
    var e1 = (await q(`insert into orders (restaurant_id, customer_phone, stempel_einloesen) values ($1, '01765550001', true) returning id`, [A]))[0].id;
    var e2 = (await q(`insert into orders (restaurant_id, customer_phone, stempel_einloesen) values ($1, '01765550001', true) returning id`, [A]))[0].id;
    await q(`update orders set status = 'accepted' where id = $1`, [e1]);
    await q(`update orders set status = 'accepted' where id = $1`, [e2]);
    var erg = await q(`select id, stempel_ergebnis from orders where id in ($1, $2)`, [e1, e2]);
    var nachE = await karte(A, '01765550001');
    t('zweimal einlösen mit 1 Guthaben: genau einmal "eingeloest", einmal "kein_guthaben"',
      erg.filter(function (r) { return r.stempel_ergebnis === 'eingeloest'; }).length === 1 && erg.filter(function (r) { return r.stempel_ergebnis === 'kein_guthaben'; }).length === 1, JSON.stringify(erg));
    t('Guthaben nie negativ, eingelöst = 1, die Einlöse-Bestellungen stempeln trotzdem', nachE.guthaben === 0 && nachE.eingeloest === 1 && nachE.stempel === 2, JSON.stringify(nachE));
    await q(`update orders set status = 'cancelled' where id = $1`, [e1]);
    var zur = await karte(A, '01765550001');
    t('Einlöse-Bestellung abgesagt: Gratis-Gericht zurück aufs Guthaben, Stempel zurück', zur.guthaben === 1 && zur.eingeloest === 0 && zur.stempel === 1, JSON.stringify(zur));
    t('… und die Bestellung sagt "zurueck"', (await q(`select stempel_ergebnis from orders where id = $1`, [e1]))[0].stempel_ergebnis === 'zurueck', '');

    // ---- Haus ohne Stempelkarte ----
    await q(`insert into orders (restaurant_id, customer_phone, status) values ($1, '01765550001', 'accepted')`, [B]);
    t('Haus mit abgeschalteter Karte: kein Stempel', (await karte(B, '01765550001')) === null, '');

    // ---- Eine kaputte Bestellung blockiert nie ----
    await q(`alter table orders add column restaurant_text text`);
    var ok = true; try { await q(`insert into orders (restaurant_id, customer_phone, status) values ('33333333-3333-4333-8333-333333333333', '0176 5550009', 'accepted')`); } catch (e) { ok = false; }
    t('unbekanntes Restaurant (Fremdschlüssel schlägt fehl): Bestellung geht trotzdem durch', ok, 'Bestellung abgewiesen');
    var ohne = true; try { await q(`insert into orders (restaurant_id, customer_phone, status) values ($1, null, 'accepted')`, [A]); } catch (e) { ohne = false; }
    t('ohne Telefonnummer: Bestellung geht durch, kein Stempel', ohne, '');

    // ---- Gast-Funktionen ----
    var st = (await q(`select kmi_stempel_stand($1, '0176/5550001') as s`, [A]))[0].s;
    t('kmi_stempel_stand: Ziel, Belohnung, Stempel, Guthaben', st.aktiv === true && st.ziel === 10 && st.belohnung === 'ein Gratis-Gericht' && st.stempel === 1 && st.guthaben === 1, JSON.stringify(st));
    var neu = (await q(`select kmi_stempel_stand($1, '0999 000000') as s`, [A]))[0].s;
    t('unbekannter Gast: 0 Stempel, aber Karte bekannt (aktiv, Ziel)', neu.stempel === 0 && neu.aktiv === true && neu.ziel === 10, JSON.stringify(neu));
    var meine = (await q(`select kmi_stempel_meine('01765550001') as m`))[0].m;
    t('kmi_stempel_meine: alle Karten des Gastes', Array.isArray(meine) && meine.length === 1 && meine[0].restaurant_id === A, JSON.stringify(meine));
    t('kmi_stempel_meine mit zu kurzer Nummer: nichts', (await q(`select kmi_stempel_meine('12') as m`))[0].m.length === 0, '');

    // ---- Wirt-Funktionen: nur das eigene Haus ----
    var fremd = null; try { await q(`select set_config('kmi.email', 'fremd@x.de', false)`); await q(`select kmi_stempel_liste($1)`, [A]); } catch (e) { fremd = e.message; }
    t('fremder Nutzer bekommt die Liste NICHT', /keine Berechtigung/.test(fremd || ''), fremd);
    await q(`select set_config('kmi.email', 'wirt@a.de', false)`);
    var liste = (await q(`select kmi_stempel_liste($1) as l`, [A]))[0].l;
    t('Wirt sieht seine Stammgäste mit Namen aus der letzten Bestellung', liste.length === 2 && liste.some(function (z) { return z.telefon === '01765550001' && z.name === 'Anna'; }), JSON.stringify(liste));
    var hand = (await q(`select kmi_stempel_hand($1, '0176 5550001', 'einloesen') as s`, [A]))[0].s;
    t('Wirt löst an der Theke ein', hand.guthaben === 0, JSON.stringify(hand));
    var leer = null; try { await q(`select kmi_stempel_hand($1, '0176 5550001', 'einloesen')`, [A]); } catch (e) { leer = e.message; }
    t('ohne Guthaben einlösen: klare Fehlermeldung, nichts negativ', /kein Guthaben/.test(leer || '') && (await karte(A, '01765550001')).guthaben === 0, leer);
    var h2 = (await q(`select kmi_stempel_hand($1, '0176 5550077', 'stempel') as s`, [A]))[0].s;
    t('Wirt stempelt einen Gast im Lokal (neue Karte)', h2.stempel === 1, JSON.stringify(h2));

    // ---- Wirt ändert das Ziel ----
    await q(`update restaurants set stempel_ziel = 5, stempel_belohnung = 'ein Dessert' where id = $1`, [A]);
    for (var j = 0; j < 4; j++) await q(`select kmi_stempel_hand($1, '0176 5550077', 'stempel')`, [A]);
    var fuenf = await karte(A, '01765550077');
    t('Ziel 5: nach 5 Stempeln 1 Guthaben', fuenf.stempel === 0 && fuenf.guthaben === 1, JSON.stringify(fuenf));
    var falsch = null; try { await q(`update restaurants set stempel_ziel = 1 where id = $1`, [A]); } catch (e) { falsch = e.message; }
    t('Ziel 1 lehnt die Datenbank ab (3 bis 30)', !!falsch, 'angenommen');

    // ---- RLS: anon kommt nicht direkt heran ----
    await db.exec(`grant select, insert, update on stempelkarten to anon; set role anon;`);
    var anon = await q(`select count(*)::int as c from stempelkarten`);
    var schreib = null; try { await q(`insert into stempelkarten (restaurant_id, telefon, guthaben) values ($1, '0111111111', 999)`, [A]); } catch (e) { schreib = e.message; }
    await db.exec(`reset role;`);
    t('anon sieht keine Zeile (RLS ohne Regeln), selbst mit Tabellenrecht', anon[0].c === 0, JSON.stringify(anon));
    t('anon kann sich kein Guthaben eintragen', /row-level security/.test(schreib || ''), schreib);

    console.log('\n' + (rot ? rot + ' von ' + n + ' Prüfungen ROT.' : 'Alle ' + n + ' Prüfungen bestanden.'));
    process.exit(rot ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
