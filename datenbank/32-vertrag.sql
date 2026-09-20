-- SCHRITT 32: Vertraege -- Dienstleistungsvertrag und AVV, digital unterschrieben.
--
-- WARUM
-- Am 17.09.2026 nachgesehen: im ganzen Projekt gab es AGB nur fuer GAESTE
-- (das Haekchen beim Bestellen). Fuer die Wirte, die 59,90 EUR im Monat
-- zahlen, gab es KEINEN Vertrag. Und das Wort "Auftragsverarbeitung" kam
-- nirgends vor -- obwohl wir Gastdaten im Auftrag der Betriebe verarbeiten
-- und Art. 28 DSGVO dafuer einen schriftlichen Vertrag VERLANGT. Ohne den
-- haftet im Zweifel der Wirt fuer unsere Verarbeitung.
--
-- ZWEI TABELLEN, UND DAS HAT EINEN GRUND
-- Der TEXT und die UNTERSCHRIFT gehoeren getrennt. Aendern wir den Vertrag,
-- entsteht eine neue Fassung -- die alten Unterschriften zeigen weiter auf
-- den Text, der damals wirklich auf dem Bildschirm stand. Wer beides in eine
-- Tabelle legt, kann spaeter nicht mehr belegen, was unterschrieben wurde.
--
-- ENTWURF KANN MAN NICHT UNTERSCHREIBEN
-- Jede Fassung startet als 'entwurf'. Erst wenn sie jemand bewusst auf
-- 'aktiv' setzt, laesst die App eine Unterschrift zu. Sonst passiert genau
-- das, was sonst immer passiert: man sitzt beim Wirt, es ist eng, und er
-- unterschreibt etwas, das noch kein Anwalt gelesen hat.
--
-- DIESE TEXTE SIND EIN ENTWURF. Sie enthalten die Punkte, die reingehoeren,
-- und sind nach bestem Wissen geschrieben -- aber sie sind nicht
-- anwaltlich geprueft. Stellen, die nur der Betreiber kennt, stehen als
-- [[PLATZHALTER]] drin; solange einer davon im Text steht, verweigert die
-- App das Freischalten.


-- ---- TEIL A: ERST NACHSEHEN ------------------------------------------
select case when to_regclass('public.vertrag_fassungen') is null
            then 'Tabellen fehlen noch' else 'Tabellen sind da' end as stand;


-- ---- TEIL B: ANLEGEN --------------------------------------------------

create table if not exists public.vertrag_fassungen (
    id          uuid primary key default gen_random_uuid(),
    art         text        not null,
    fassung     text        not null,
    titel       text        not null,
    inhalt      text        not null,
    status      text        not null default 'entwurf',
    erstellt_am timestamptz not null default now(),
    aktiv_ab    timestamptz,
    unique (art, fassung)
);

alter table public.vertrag_fassungen drop constraint if exists vf_art_check;
alter table public.vertrag_fassungen
    add constraint vf_art_check check (art in ('dienstleistung', 'avv'));

alter table public.vertrag_fassungen drop constraint if exists vf_status_check;
alter table public.vertrag_fassungen
    add constraint vf_status_check check (status in ('entwurf', 'aktiv', 'abgeloest'));


create table if not exists public.vertraege (
    id                     uuid primary key default gen_random_uuid(),
    restaurant_id          uuid        not null,
    fassung_id             uuid        not null references public.vertrag_fassungen(id),
    unterzeichner_name     text        not null,
    unterzeichner_funktion text,
    -- Die gezeichnete Unterschrift als PNG (data:-URL). Klein halten:
    -- ein Strichbild auf weissem Grund, keine Fotos.
    unterschrift           text        not null,
    unterzeichnet_am       timestamptz not null default now(),
    -- DER ABDRUCK DES TEXTES, DER WIRKLICH DASTAND.
    --
    -- SHA-256 ueber den angezeigten Vertragstext. Damit laesst sich spaeter
    -- belegen, WAS unterschrieben wurde -- nicht nur "Fassung 1". Wuerde
    -- jemand den Text einer Fassung nachtraeglich aendern, passt der Abdruck
    -- nicht mehr, und das faellt auf.
    text_abdruck           text        not null,
    notiz                  text
);

-- Ein Betrieb unterschreibt jede Fassung hoechstens einmal.
create unique index if not exists vertraege_einmal_idx
    on public.vertraege (restaurant_id, fassung_id);

create index if not exists vertraege_haus_idx
    on public.vertraege (restaurant_id, unterzeichnet_am desc);


-- ---- TEIL C: WER DARF WAS --------------------------------------------
--
-- KEIN anon. Nirgends. Ein Vertrag ist nichts, was ein Gast sehen oder
-- anlegen koennen darf -- und in der Unterschrift steht ein Klarname.
alter table public.vertrag_fassungen enable row level security;
alter table public.vertraege          enable row level security;

drop policy if exists "Angemeldete duerfen Vertragstexte lesen" on public.vertrag_fassungen;
create policy "Angemeldete duerfen Vertragstexte lesen"
    on public.vertrag_fassungen for select to authenticated
    using (true);

drop policy if exists "Angemeldete duerfen Vertraege lesen" on public.vertraege;
create policy "Angemeldete duerfen Vertraege lesen"
    on public.vertraege for select to authenticated
    using (true);

-- Unterschreiben ja, aber NUR auf einer freigeschalteten Fassung.
-- Die Schranke steht bewusst in der Datenbank und nicht nur im Browser:
-- was im Browser steht, kann jeder umgehen, der die Konsole oeffnet.
drop policy if exists "Angemeldete duerfen unterschreiben" on public.vertraege;
create policy "Angemeldete duerfen unterschreiben"
    on public.vertraege for insert to authenticated
    with check (
        exists (
            select 1 from public.vertrag_fassungen f
             where f.id = fassung_id and f.status = 'aktiv'
        )
    );

-- Bewusst KEINE update- und KEINE delete-Regel auf vertraege.
-- Eine Unterschrift, die sich nachtraeglich aendern laesst, ist keine.


-- ---- TEIL D: DIE TEXTE (ENTWURF) --------------------------------------

insert into public.vertrag_fassungen (art, fassung, titel, inhalt, status)
values ('dienstleistung', '2026-09-1',
'Nutzungsvertrag Kiek mol in',
$text$
NUTZUNGSVERTRAG

zwischen

[[ANBIETER: Firmierung, Inhaber, Anschrift, Kontakt]]
- nachfolgend "Kiek mol in" -

und dem im Unterschriftenblock genannten Gastronomiebetrieb
- nachfolgend "der Betrieb" -


§ 1 Gegenstand des Vertrages

(1) Kiek mol in betreibt unter kiekmolin.de eine Online-Plattform, ueber die
Gaeste die Speisekarte eines Betriebes ansehen, Bestellungen aufgeben und
Tische reservieren koennen.

(2) Kiek mol in stellt dem Betrieb diese Plattform zur Nutzung bereit.
Kiek mol in wird nicht Partei der Vertraege zwischen Gast und Betrieb. Der
Vertrag ueber Speisen, Getraenke und deren Lieferung kommt ausschliesslich
zwischen dem Gast und dem Betrieb zustande. Kiek mol in schuldet weder die
Zubereitung noch die Lieferung.

(3) Kiek mol in ist kein Lieferdienst und stellt kein Personal.


§ 2 Leistungen von Kiek mol in

Kiek mol in stellt dem Betrieb waehrend der Vertragslaufzeit zur Verfuegung:

a) eine eigene Seite des Betriebes auf kiekmolin.de mit Stammdaten,
   Oeffnungszeiten und Speisekarte,
b) die Annahme von Online-Bestellungen zur Abholung, Lieferung und zum
   Verzehr vor Ort, soweit der Betrieb die jeweilige Bestellart aktiviert,
c) die Annahme von Tischreservierungen,
d) ein Dashboard zur Verwaltung von Bestellungen, Reservierungen und
   Speisekarte,
e) Bestaetigungs-E-Mails an Gaeste,
f) die Uebergabe eingehender Bestellungen an einen Bondrucker oder ein
   Kassensystem, soweit der Betrieb ein unterstuetztes Geraet einsetzt,
g) die erstmalige Einrichtung einschliesslich der Erfassung der
   Speisekarte.

Der Funktionsumfang wird fortlaufend weiterentwickelt. Einzelne Funktionen
koennen hinzukommen oder ersetzt werden, solange der Vertragszweck nach
Absatz 1 gewahrt bleibt.


§ 3 Verguetung

(1) Die Verguetung betraegt 59,90 EUR je angefangenem Kalendermonat.
[[UMSATZSTEUER: "zzgl. gesetzlicher Umsatzsteuer" ODER "Es wird keine
Umsatzsteuer ausgewiesen (Kleinunternehmer nach § 19 UStG)" -- eines von
beiden muss hier stehen]]

(2) Kiek mol in erhebt KEINE Provision und keine Beteiligung am Umsatz des
Betriebes. Der Betrag nach Absatz 1 ist unabhaengig von der Anzahl der
Bestellungen und der Hoehe des ueber die Plattform erzielten Umsatzes.

(3) Der erste Kalendermonat ist verguetungsfrei.

(4) Die Verguetung ist monatlich im Voraus faellig.

(5) Kiek mol in kann die Verguetung mit einer Ankuendigungsfrist von acht
Wochen zum Monatsende anpassen. Der Betrieb kann den Vertrag in diesem Fall
bis zum Wirksamwerden der Anpassung zum selben Zeitpunkt kuendigen; darauf
wird in der Ankuendigung hingewiesen.


§ 4 Pflichten des Betriebes

(1) Der Betrieb haelt die von ihm eingestellten Angaben aktuell und
zutreffend, insbesondere Preise, Oeffnungszeiten, Liefergebiet,
Mindestbestellwert sowie Angaben zu Zutaten, Allergenen und
Zusatzstoffen.

(2) Die Einhaltung lebensmittel-, preis- und gewerberechtlicher Pflichten
obliegt allein dem Betrieb. Das gilt insbesondere fuer die Kennzeichnung
nach der Lebensmittelinformationsverordnung und die Preisangabenverordnung.
Kiek mol in prueft die Angaben des Betriebes nicht auf inhaltliche
Richtigkeit.

(3) Der Betrieb bearbeitet eingehende Bestellungen und Reservierungen in
angemessener Zeit und haelt waehrend seiner Oeffnungszeiten ein geeignetes
Geraet zum Empfang bereit.

(4) Zugangsdaten zum Dashboard sind vertraulich zu behandeln und nicht an
Dritte ausserhalb des Betriebes weiterzugeben.


§ 5 Laufzeit und Kuendigung

(1) Der Vertrag laeuft auf unbestimmte Zeit. Eine Mindestlaufzeit besteht
nicht.

(2) Beide Seiten koennen mit einer Frist von einem Tag zum Ende eines
Kalendermonats kuendigen.

(3) Die Kuendigung bedarf der Textform; eine E-Mail genuegt.

(4) Das Recht zur ausserordentlichen Kuendigung aus wichtigem Grund bleibt
unberuehrt.

(5) Nach Vertragsende wird die Seite des Betriebes abgeschaltet. Fuer die
Behandlung personenbezogener Daten gilt die Anlage 1 (Auftragsverarbeitung).


§ 6 Verfuegbarkeit

(1) Kiek mol in betreibt die Plattform mit der Sorgfalt eines ordentlichen
Kaufmanns, schuldet aber keine ununterbrochene Verfuegbarkeit.
Unterbrechungen durch Wartung, Stoerungen bei Vorleistern oder hoehere
Gewalt begruenden keinen Anspruch auf Minderung, soweit sie einen
unerheblichen Umfang nicht ueberschreiten.

(2) Kiek mol in sagt KEINE bestimmte Anzahl von Bestellungen, Gaesten oder
Umsaetzen zu. Angaben hierzu sind unverbindlich.


§ 7 Haftung

(1) Kiek mol in haftet unbeschraenkt bei Vorsatz und grober Fahrlaessigkeit
sowie bei der Verletzung von Leben, Koerper oder Gesundheit.

(2) Bei einfacher Fahrlaessigkeit haftet Kiek mol in nur bei Verletzung
einer Pflicht, deren Erfuellung die ordnungsgemaesse Durchfuehrung des
Vertrages ueberhaupt erst ermoeglicht und auf deren Einhaltung der Betrieb
regelmaessig vertrauen darf (Kardinalpflicht). Die Haftung ist in diesem
Fall auf den vertragstypischen, vorhersehbaren Schaden begrenzt.

(3) Eine Haftung fuer entgangenen Gewinn oder ausgebliebene Bestellungen
ist im Rahmen des Absatzes 2 ausgeschlossen.

(4) Ansprueche nach dem Produkthaftungsgesetz bleiben unberuehrt.


§ 8 Personenbezogene Daten

(1) Verantwortlicher im Sinne der DSGVO fuer die Daten der Gaeste des
Betriebes ist der Betrieb. Kiek mol in verarbeitet diese Daten
weisungsgebunden als Auftragsverarbeiter.

(2) Die Einzelheiten regelt die Anlage 1 (Vertrag zur Auftragsverarbeitung
nach Art. 28 DSGVO). Sie ist wesentlicher Bestandteil dieses Vertrages.


§ 9 Schlussbestimmungen

(1) Aenderungen und Ergaenzungen dieses Vertrages beduerfen der Textform.

(2) Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Uebrigen
wirksam.

(3) Es gilt deutsches Recht.

(4) Ist der Betrieb Kaufmann, juristische Person des oeffentlichen Rechts
oder oeffentlich-rechtliches Sondervermoegen, ist Gerichtsstand
[[GERICHTSSTAND: Ort]].
$text$,
'entwurf')
on conflict (art, fassung) do nothing;


insert into public.vertrag_fassungen (art, fassung, titel, inhalt, status)
values ('avv', '2026-09-1',
'Anlage 1 – Auftragsverarbeitung (Art. 28 DSGVO)',
$text$
VERTRAG ZUR AUFTRAGSVERARBEITUNG
nach Art. 28 DSGVO – Anlage 1 zum Nutzungsvertrag

zwischen dem im Unterschriftenblock genannten Gastronomiebetrieb
- nachfolgend "Verantwortlicher" -

und

[[ANBIETER: Firmierung, Inhaber, Anschrift, Kontakt]]
- nachfolgend "Auftragsverarbeiter" -


1. Gegenstand und Dauer

Gegenstand ist die Verarbeitung personenbezogener Daten durch den
Auftragsverarbeiter im Rahmen des Nutzungsvertrages. Die Dauer entspricht
der Laufzeit des Nutzungsvertrages.


2. Art und Zweck der Verarbeitung

Betrieb einer Online-Plattform zur Darstellung der Speisekarte, zur
Entgegennahme und Weiterleitung von Bestellungen und Tischreservierungen,
zur Benachrichtigung der Gaeste sowie zur Bereitstellung eines Dashboards
fuer den Verantwortlichen. Die Verarbeitung erfolgt ausschliesslich in
Mitgliedstaaten der EU, im EWR oder auf Grundlage von Ziffer 8.


3. Art der personenbezogenen Daten

- Name des Gastes
- Telefonnummer
- E-Mail-Adresse
- Lieferanschrift
- Inhalt und Zeitpunkt der Bestellung, Bestellart, Zahlungsart
- Hinweise und Sonderwuensche des Gastes zur Bestellung
- Daten der Tischreservierung (Datum, Uhrzeit, Personenzahl, Anmerkungen)
- abgegebene Bewertungen
- technische Kennungen zur Auslieferung von Benachrichtigungen


4. Kategorien betroffener Personen

- Gaeste des Verantwortlichen
- Beschaeftigte des Verantwortlichen, soweit sie Zugaenge zum Dashboard
  nutzen


5. Weisungen

(1) Der Auftragsverarbeiter verarbeitet die Daten ausschliesslich auf
dokumentierte Weisung des Verantwortlichen. Dieser Vertrag und der
Nutzungsvertrag stellen die urspruengliche Weisung dar. Weitere Weisungen
ergehen in Textform.

(2) Haelt der Auftragsverarbeiter eine Weisung fuer rechtswidrig, teilt er
dies unverzueglich mit und darf die Ausfuehrung bis zur Bestaetigung
aussetzen.


6. Vertraulichkeit

Der Auftragsverarbeiter setzt zur Verarbeitung nur Personen ein, die zur
Vertraulichkeit verpflichtet wurden oder einer angemessenen gesetzlichen
Verschwiegenheitspflicht unterliegen.


7. Technische und organisatorische Massnahmen (Art. 32 DSGVO)

Der Auftragsverarbeiter trifft insbesondere folgende Massnahmen:

a) Verschluesselung saemtlicher Uebertragungen (TLS),
b) Verschluesselung der Daten im Ruhezustand beim Datenbankanbieter,
c) Zugriffsbeschraenkung auf Datenbankebene, sodass ein Betrieb
   ausschliesslich die ihm zugeordneten Daten lesen kann
   (Mandantentrennung),
d) personenbezogene Zugaenge zum Dashboard, keine Sammelkonten auf
   Anbieterseite,
e) getrennte Schluessel fuer oeffentliche und administrative Zugriffe,
   administrative Schluessel ausschliesslich serverseitig,
f) Protokollierung der Zugriffe auf die Schnittstelle,
g) regelmaessige automatisierte Pruefung der Gastwege und Meldung von
   Stoerungen,
h) automatisierte Sicherungen durch den Datenbankanbieter,
i) Loeschkonzept nach Ziffer 10.

Die Massnahmen werden dem Stand der Technik angepasst. Eine Verringerung
des Schutzniveaus ist unzulaessig.


8. Unterauftragsverarbeiter

(1) Der Verantwortliche stimmt dem Einsatz der nachfolgenden
Unterauftragsverarbeiter zu:

[[UNTERAUFTRAGSVERARBEITER: die folgende Liste vor dem Freischalten
pruefen und je Anbieter Firmierung, Sitz, Verarbeitungsort und
Uebermittlungsgrundlage ergaenzen]]

- Supabase – Datenbank, Authentifizierung, Datei-Speicher
- Netlify – Auslieferung der Website und serverseitige Funktionen
- Resend – Versand von Bestaetigungs-E-Mails an Gaeste
- Stripe – Abwicklung der Verguetung nach § 3 des Nutzungsvertrages
- PayPal – Abwicklung von Gastzahlungen, soweit der Betrieb diese Zahlart
  aktiviert

(2) Der Auftragsverarbeiter schliesst mit jedem Unterauftragsverarbeiter
Vereinbarungen, die den Anforderungen des Art. 28 DSGVO entsprechen.

(3) Erfolgt eine Verarbeitung ausserhalb der EU oder des EWR, stellt der
Auftragsverarbeiter eine Uebermittlungsgrundlage nach Kapitel V DSGVO
sicher, insbesondere Standardvertragsklauseln oder einen
Angemessenheitsbeschluss.

(4) Wechsel oder Hinzufuegung eines Unterauftragsverarbeiters teilt der
Auftragsverarbeiter mindestens vier Wochen im Voraus in Textform mit. Der
Verantwortliche kann aus wichtigem Grund widersprechen; in diesem Fall
koennen beide Seiten den Nutzungsvertrag zum Wirksamwerden der Aenderung
kuendigen.


9. Unterstuetzung des Verantwortlichen

(1) Der Auftragsverarbeiter unterstuetzt den Verantwortlichen bei der
Beantwortung von Antraegen betroffener Personen (Art. 12 bis 23 DSGVO).
Wendet sich eine betroffene Person unmittelbar an den
Auftragsverarbeiter, leitet dieser den Antrag unverzueglich weiter.

(2) Der Auftragsverarbeiter unterstuetzt den Verantwortlichen bei den
Pflichten nach Art. 32 bis 36 DSGVO.

(3) Der Auftragsverarbeiter meldet dem Verantwortlichen eine Verletzung des
Schutzes personenbezogener Daten unverzueglich, spaetestens innerhalb von
24 Stunden nach Kenntnis, in Textform mit den ihm bekannten Angaben nach
Art. 33 Abs. 3 DSGVO.


10. Loeschung und Rueckgabe

(1) Nach Beendigung des Nutzungsvertrages loescht der Auftragsverarbeiter
die im Auftrag verarbeiteten personenbezogenen Daten innerhalb von 90
Tagen, sofern nicht eine gesetzliche Aufbewahrungspflicht entgegensteht.

(2) Der Verantwortliche kann vor Ablauf dieser Frist die Herausgabe der
Daten in einem gaengigen Format verlangen.

(3) Daten, die einer gesetzlichen Aufbewahrungspflicht unterliegen, werden
bis zum Ablauf der Frist gesperrt und danach geloescht.


11. Nachweise und Kontrollen

(1) Der Auftragsverarbeiter weist die Einhaltung der Pflichten aus diesem
Vertrag auf Anforderung nach, insbesondere durch Auskunft in Textform oder
durch Vorlage von Nachweisen der Unterauftragsverarbeiter.

(2) Der Verantwortliche ist berechtigt, sich nach vorheriger Ankuendigung
mit angemessener Frist von der Einhaltung zu ueberzeugen. Die Kontrolle hat
den Betriebsablauf des Auftragsverarbeiters moeglichst wenig zu stoeren.


12. Schlussbestimmungen

(1) Diese Anlage geht dem Nutzungsvertrag im Fall von Widerspruechen in
Fragen des Datenschutzes vor.

(2) Aenderungen beduerfen der Textform.

(3) Es gilt deutsches Recht.
$text$,
'entwurf')
on conflict (art, fassung) do nothing;


-- ---- TEIL E: NACHSEHEN, OB ES GEKLAPPT HAT ---------------------------
select art, fassung, status,
       case when inhalt like '%[[%' then 'enthaelt noch Platzhalter'
            else 'keine Platzhalter mehr' end as platzhalter,
       length(inhalt) as zeichen
  from public.vertrag_fassungen
 order by art;
-- Erwartet: zwei Zeilen, beide status = 'entwurf', beide mit Platzhaltern.

select cmd as recht, policyname as regel,
       case when 'anon' = any(roles) then 'JA -- FEHLER' else 'nein' end as gilt_fuer_gaeste
  from pg_policies
 where schemaname = 'public' and tablename in ('vertraege','vertrag_fassungen')
 order by tablename, cmd;
-- Erwartet: KEINE Zeile mit "JA -- FEHLER". Ein Gast hat mit Vertraegen
-- nichts zu tun, und in einer Unterschrift steht ein Klarname.


-- ---- TEIL F: FREISCHALTEN (ERST NACH DER ANWALTSPRUEFUNG) ------------
-- Solange noch [[PLATZHALTER]] im Text stehen, weigert sich die App.
-- Wenn alles geprueft und ersetzt ist:
--
--   update public.vertrag_fassungen
--      set status = 'aktiv', aktiv_ab = now()
--    where fassung = '2026-09-1' and inhalt not like '%[[%';
