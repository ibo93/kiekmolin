-- Schritt 3a -- die Vorbereitung, damit orders zugemacht werden kann.
--
-- LAEUFT VOR dem Deploy des zugehoerigen Codes. Ohne die Spalte laeuft
-- alles weiter wie bisher (der selbstheilende Insert wirft sie weg), nur
-- entsteht dann kein Geheimnis und der Gast kann seine Bestellung
-- spaeter nicht mehr aufrufen.
--
--
-- Warum ueberhaupt
-- ----------------
-- Heute findet der Gast seine Bestellungen so:
--
--   orders?customer_phone=ilike.*<letzte 8 Ziffern>*
--
-- Das ist kein Nachweis, das ist eine Suche. Wer eine Telefonnummer kennt
-- -- oder acht Ziffern raet -- bekommt Name, Telefon und Lieferadresse
-- dieser Person. Ein Server-Endpunkt allein aendert daran nichts; er
-- verschiebt die Frage nur dorthin, wo sie hingehoert: woran erkennt der
-- Server, dass die Nummer dem Gast gehoert?
--
-- Die Antwort ist die Bestaetigungsmail. Die geht ohnehin raus, und sie
-- geht an eine Adresse, die nur der Gast liest. Bei allem ausser "vor Ort
-- am Tisch" ist sie Pflicht -- und vor Ort gibt es nichts zu verfolgen,
-- da ist die Tischnummer die Kennung.
--
-- Jede Bestellung bekommt deshalb ein Geheimnis. Es steht im Link der
-- Bestaetigungsmail und im Browser des Geraets, das bestellt hat. Wer es
-- hat, sieht genau diese eine Bestellung. Wer es nicht hat, sieht nichts
-- -- auch nicht mit der richtigen Telefonnummer.
--
-- Der Link in der Mail zeigt heute auf die Bestellnummer. Die ist
-- fortlaufend und damit geraten, sobald man eine kennt.


-- pgcrypto fuer gen_random_bytes. Auf Supabase ist die Erweiterung
-- vorhanden, aber nicht in jedem Projekt aktiviert.
create extension if not exists pgcrypto;

alter table orders add column if not exists track_token text;

-- Bestehende Bestellungen bekommen auch eins. Es erreicht ihre Gaeste
-- nicht mehr -- die Mails sind raus -- aber die Spalte bleibt so ohne
-- Luecken, und der Wirt kann einem Gast auf Nachfrage seinen Link geben.
update orders
   set track_token = encode(gen_random_bytes(16), 'hex')
 where track_token is null;

-- Der Endpunkt sucht ausschliesslich hierueber. Ohne Index waere das bei
-- wachsender Tabelle ein voller Durchlauf pro Aufruf.
create unique index if not exists orders_track_token_idx
    on orders (track_token)
    where track_token is not null;


-- Reservierungen haben dasselbe Problem: der Aktiv-Banner sucht sie ueber
-- guest_phone. Gleiche Loesung, gleiche Spalte.
alter table reservations add column if not exists track_token text;

update reservations
   set track_token = encode(gen_random_bytes(16), 'hex')
 where track_token is null;

create unique index if not exists reservations_track_token_idx
    on reservations (track_token)
    where track_token is not null;


-- Gegenprobe. Erwartet: zwei Zeilen, jeweils 0 ohne Geheimnis.
select 'orders' as tabelle,
       count(*) as gesamt,
       count(*) filter (where track_token is null) as ohne_geheimnis,
       count(distinct track_token) as verschiedene
from orders
union all
select 'reservations',
       count(*),
       count(*) filter (where track_token is null),
       count(distinct track_token)
from reservations;
