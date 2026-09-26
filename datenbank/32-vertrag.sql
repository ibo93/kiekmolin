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
-- AM 25.09.2026: UMLAUTE UND NEUE FASSUNGSNUMMER
-- -----------------------------------------------
-- Die Texte standen durchgehend ohne Umlaute da -- "Gaeste", "fuer",
-- "Verguetung", 157 Stellen. In einem Papier, das ein Kunde
-- unterschreibt, sieht das schlecht aus. Korrigiert mit
-- werkzeug/vertrag-umlaute.js: Wort fuer Wort aus einer festen Liste,
-- nicht per Muster -- "Dauer", "aktuell", "vertrauen" und
-- "Umsatzsteuer" enthalten die Buchstabenfolge zufaellig und waeren
-- sonst zu "Daür", "aktüll" und "vertraün" geworden.
--
-- Die Fassung heisst deshalb jetzt 2026-09-2 statt -1. Der Insert
-- unten hat "on conflict (art, fassung) do nothing": mit der alten
-- Nummer waere der korrigierte Text bei niemandem angekommen, der die
-- Datei schon einmal eingespielt hat. Die alte Fassung bleibt als
-- Entwurf liegen und stoert nicht.
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
values ('dienstleistung', '2026-09-2',
'Nutzungsvertrag Kiek mol in',
$text$
NUTZUNGSVERTRAG

zwischen

[[ANBIETER: Firmierung, Inhaber, Anschrift, Kontakt]]
- nachfolgend "Kiek mol in" -

und dem im Unterschriftenblock genannten Gastronomiebetrieb
- nachfolgend "der Betrieb" -


§ 1 Gegenstand des Vertrages

(1) Kiek mol in betreibt unter kiekmolin.de eine Online-Plattform, über die
Gäste die Speisekarte eines Betriebes ansehen, Bestellungen aufgeben und
Tische reservieren können.

(2) Kiek mol in stellt dem Betrieb diese Plattform zur Nutzung bereit.
Kiek mol in wird nicht Partei der Verträge zwischen Gast und Betrieb. Der
Vertrag über Speisen, Getränke und deren Lieferung kommt ausschließlich
zwischen dem Gast und dem Betrieb zustande. Kiek mol in schuldet weder die
Zubereitung noch die Lieferung.

(3) Kiek mol in ist kein Lieferdienst und stellt kein Personal.


§ 2 Leistungen von Kiek mol in

Kiek mol in stellt dem Betrieb während der Vertragslaufzeit zur Verfügung:

a) eine eigene Seite des Betriebes auf kiekmolin.de mit Stammdaten,
   Öffnungszeiten und Speisekarte,
b) die Annahme von Online-Bestellungen zur Abholung, Lieferung und zum
   Verzehr vor Ort, soweit der Betrieb die jeweilige Bestellart aktiviert,
c) die Annahme von Tischreservierungen,
d) ein Dashboard zur Verwaltung von Bestellungen, Reservierungen und
   Speisekarte,
e) Bestätigungs-E-Mails an Gäste,
f) die Übergabe eingehender Bestellungen an einen Bondrucker oder ein
   Kassensystem, soweit der Betrieb ein unterstütztes Gerät einsetzt,
g) die erstmalige Einrichtung einschließlich der Erfassung der
   Speisekarte.

Der Funktionsumfang wird fortlaufend weiterentwickelt. Einzelne Funktionen
können hinzukommen oder ersetzt werden, solange der Vertragszweck nach
Absatz 1 gewahrt bleibt.


§ 3 Vergütung

(1) Die Vergütung beträgt 59,90 EUR je angefangenem Kalendermonat.
[[UMSATZSTEUER: "zzgl. gesetzlicher Umsatzsteuer" ODER "Es wird keine
Umsatzsteuer ausgewiesen (Kleinunternehmer nach § 19 UStG)" -- eines von
beiden muss hier stehen]]

(2) Kiek mol in erhebt KEINE Provision und keine Beteiligung am Umsatz des
Betriebes. Der Betrag nach Absatz 1 ist unabhängig von der Anzahl der
Bestellungen und der Höhe des über die Plattform erzielten Umsatzes.

(3) Der erste Kalendermonat ist vergütungsfrei.

(4) Die Vergütung ist monatlich im Voraus fällig.

(5) Kiek mol in kann die Vergütung mit einer Ankündigungsfrist von acht
Wochen zum Monatsende anpassen. Der Betrieb kann den Vertrag in diesem Fall
bis zum Wirksamwerden der Anpassung zum selben Zeitpunkt kündigen; darauf
wird in der Ankündigung hingewiesen.


§ 4 Pflichten des Betriebes

(1) Der Betrieb hält die von ihm eingestellten Angaben aktuell und
zutreffend, insbesondere Preise, Öffnungszeiten, Liefergebiet,
Mindestbestellwert sowie Angaben zu Zutaten, Allergenen und
Zusatzstoffen.

(2) Die Einhaltung lebensmittel-, preis- und gewerberechtlicher Pflichten
obliegt allein dem Betrieb. Das gilt insbesondere für die Kennzeichnung
nach der Lebensmittelinformationsverordnung und die Preisangabenverordnung.
Kiek mol in prüft die Angaben des Betriebes nicht auf inhaltliche
Richtigkeit.

(3) Der Betrieb bearbeitet eingehende Bestellungen und Reservierungen in
angemessener Zeit und hält während seiner Öffnungszeiten ein geeignetes
Gerät zum Empfang bereit.

(4) Zugangsdaten zum Dashboard sind vertraulich zu behandeln und nicht an
Dritte außerhalb des Betriebes weiterzugeben.


§ 5 Laufzeit und Kündigung

(1) Der Vertrag läuft auf unbestimmte Zeit. Eine Mindestlaufzeit besteht
nicht.

(2) Beide Seiten können mit einer Frist von einem Tag zum Ende eines
Kalendermonats kündigen.

(3) Die Kündigung bedarf der Textform; eine E-Mail genügt.

(4) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt
unberührt.

(5) Nach Vertragsende wird die Seite des Betriebes abgeschaltet. Für die
Behandlung personenbezogener Daten gilt die Anlage 1 (Auftragsverarbeitung).


§ 6 Verfügbarkeit

(1) Kiek mol in betreibt die Plattform mit der Sorgfalt eines ordentlichen
Kaufmanns, schuldet aber keine ununterbrochene Verfügbarkeit.
Unterbrechungen durch Wartung, Störungen bei Vorleistern oder höhere
Gewalt begründen keinen Anspruch auf Minderung, soweit sie einen
unerheblichen Umfang nicht überschreiten.

(2) Kiek mol in sagt KEINE bestimmte Anzahl von Bestellungen, Gästen oder
Umsätzen zu. Angaben hierzu sind unverbindlich.


§ 7 Haftung

(1) Kiek mol in haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit
sowie bei der Verletzung von Leben, Körper oder Gesundheit.

(2) Bei einfacher Fahrlässigkeit haftet Kiek mol in nur bei Verletzung
einer Pflicht, deren Erfüllung die ordnungsgemäße Durchführung des
Vertrages überhaupt erst ermöglicht und auf deren Einhaltung der Betrieb
regelmäßig vertrauen darf (Kardinalpflicht). Die Haftung ist in diesem
Fall auf den vertragstypischen, vorhersehbaren Schaden begrenzt.

(3) Eine Haftung für entgangenen Gewinn oder ausgebliebene Bestellungen
ist im Rahmen des Absatzes 2 ausgeschlossen.

(4) Ansprüche nach dem Produkthaftungsgesetz bleiben unberührt.


§ 8 Personenbezogene Daten

(1) Verantwortlicher im Sinne der DSGVO für die Daten der Gäste des
Betriebes ist der Betrieb. Kiek mol in verarbeitet diese Daten
weisungsgebunden als Auftragsverarbeiter.

(2) Die Einzelheiten regelt die Anlage 1 (Vertrag zur Auftragsverarbeitung
nach Art. 28 DSGVO). Sie ist wesentlicher Bestandteil dieses Vertrages.


§ 9 Schlussbestimmungen

(1) Änderungen und Ergänzungen dieses Vertrages bedürfen der Textform.

(2) Sollte eine Bestimmung unwirksam sein, bleibt der Vertrag im Übrigen
wirksam.

(3) Es gilt deutsches Recht.

(4) Ist der Betrieb Kaufmann, juristische Person des öffentlichen Rechts
oder öffentlich-rechtliches Sondervermögen, ist Gerichtsstand
[[GERICHTSSTAND: Ort]].
$text$,
'entwurf')
on conflict (art, fassung) do nothing;


insert into public.vertrag_fassungen (art, fassung, titel, inhalt, status)
values ('avv', '2026-09-2',
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
zur Benachrichtigung der Gäste sowie zur Bereitstellung eines Dashboards
für den Verantwortlichen. Die Verarbeitung erfolgt ausschließlich in
Mitgliedstaaten der EU, im EWR oder auf Grundlage von Ziffer 8.


3. Art der personenbezogenen Daten

- Name des Gastes
- Telefonnummer
- E-Mail-Adresse
- Lieferanschrift
- Inhalt und Zeitpunkt der Bestellung, Bestellart, Zahlungsart
- Hinweise und Sonderwünsche des Gastes zur Bestellung
- Daten der Tischreservierung (Datum, Uhrzeit, Personenzahl, Anmerkungen)
- abgegebene Bewertungen
- technische Kennungen zur Auslieferung von Benachrichtigungen


4. Kategorien betroffener Personen

- Gäste des Verantwortlichen
- Beschäftigte des Verantwortlichen, soweit sie Zugänge zum Dashboard
  nutzen


5. Weisungen

(1) Der Auftragsverarbeiter verarbeitet die Daten ausschließlich auf
dokumentierte Weisung des Verantwortlichen. Dieser Vertrag und der
Nutzungsvertrag stellen die ursprüngliche Weisung dar. Weitere Weisungen
ergehen in Textform.

(2) Hält der Auftragsverarbeiter eine Weisung für rechtswidrig, teilt er
dies unverzüglich mit und darf die Ausführung bis zur Bestätigung
aussetzen.


6. Vertraulichkeit

Der Auftragsverarbeiter setzt zur Verarbeitung nur Personen ein, die zur
Vertraulichkeit verpflichtet wurden oder einer angemessenen gesetzlichen
Verschwiegenheitspflicht unterliegen.


7. Technische und organisatorische Maßnahmen (Art. 32 DSGVO)

Der Auftragsverarbeiter trifft insbesondere folgende Maßnahmen:

a) Verschlüsselung sämtlicher Übertragungen (TLS),
b) Verschlüsselung der Daten im Ruhezustand beim Datenbankanbieter,
c) Zugriffsbeschränkung auf Datenbankebene, sodass ein Betrieb
   ausschließlich die ihm zugeordneten Daten lesen kann
   (Mandantentrennung),
d) personenbezogene Zugänge zum Dashboard, keine Sammelkonten auf
   Anbieterseite,
e) getrennte Schlüssel für öffentliche und administrative Zugriffe,
   administrative Schlüssel ausschließlich serverseitig,
f) Protokollierung der Zugriffe auf die Schnittstelle,
g) regelmäßige automatisierte Prüfung der Gastwege und Meldung von
   Störungen,
h) automatisierte Sicherungen durch den Datenbankanbieter,
i) Löschkonzept nach Ziffer 10.

Die Maßnahmen werden dem Stand der Technik angepasst. Eine Verringerung
des Schutzniveaus ist unzulässig.


8. Unterauftragsverarbeiter

(1) Der Verantwortliche stimmt dem Einsatz der nachfolgenden
Unterauftragsverarbeiter zu:

[[UNTERAUFTRAGSVERARBEITER: die folgende Liste vor dem Freischalten
prüfen und je Anbieter Firmierung, Sitz, Verarbeitungsort und
Übermittlungsgrundlage ergänzen]]

- Supabase – Datenbank, Authentifizierung, Datei-Speicher
- Netlify – Auslieferung der Website und serverseitige Funktionen
- Resend – Versand von Bestätigungs-E-Mails an Gäste
- Stripe – Abwicklung der Vergütung nach § 3 des Nutzungsvertrages
- PayPal – Abwicklung von Gastzahlungen, soweit der Betrieb diese Zahlart
  aktiviert

(2) Der Auftragsverarbeiter schließt mit jedem Unterauftragsverarbeiter
Vereinbarungen, die den Anforderungen des Art. 28 DSGVO entsprechen.

(3) Erfolgt eine Verarbeitung außerhalb der EU oder des EWR, stellt der
Auftragsverarbeiter eine Übermittlungsgrundlage nach Kapitel V DSGVO
sicher, insbesondere Standardvertragsklauseln oder einen
Angemessenheitsbeschluss.

(4) Wechsel oder Hinzufügung eines Unterauftragsverarbeiters teilt der
Auftragsverarbeiter mindestens vier Wochen im Voraus in Textform mit. Der
Verantwortliche kann aus wichtigem Grund widersprechen; in diesem Fall
können beide Seiten den Nutzungsvertrag zum Wirksamwerden der Änderung
kündigen.


9. Unterstützung des Verantwortlichen

(1) Der Auftragsverarbeiter unterstützt den Verantwortlichen bei der
Beantwortung von Anträgen betroffener Personen (Art. 12 bis 23 DSGVO).
Wendet sich eine betroffene Person unmittelbar an den
Auftragsverarbeiter, leitet dieser den Antrag unverzüglich weiter.

(2) Der Auftragsverarbeiter unterstützt den Verantwortlichen bei den
Pflichten nach Art. 32 bis 36 DSGVO.

(3) Der Auftragsverarbeiter meldet dem Verantwortlichen eine Verletzung des
Schutzes personenbezogener Daten unverzüglich, spätestens innerhalb von
24 Stunden nach Kenntnis, in Textform mit den ihm bekannten Angaben nach
Art. 33 Abs. 3 DSGVO.


10. Löschung und Rückgabe

(1) Nach Beendigung des Nutzungsvertrages löscht der Auftragsverarbeiter
die im Auftrag verarbeiteten personenbezogenen Daten innerhalb von 90
Tagen, sofern nicht eine gesetzliche Aufbewahrungspflicht entgegensteht.

(2) Der Verantwortliche kann vor Ablauf dieser Frist die Herausgabe der
Daten in einem gängigen Format verlangen.

(3) Daten, die einer gesetzlichen Aufbewahrungspflicht unterliegen, werden
bis zum Ablauf der Frist gesperrt und danach gelöscht.


11. Nachweise und Kontrollen

(1) Der Auftragsverarbeiter weist die Einhaltung der Pflichten aus diesem
Vertrag auf Anforderung nach, insbesondere durch Auskunft in Textform oder
durch Vorlage von Nachweisen der Unterauftragsverarbeiter.

(2) Der Verantwortliche ist berechtigt, sich nach vorheriger Ankündigung
mit angemessener Frist von der Einhaltung zu überzeugen. Die Kontrolle hat
den Betriebsablauf des Auftragsverarbeiters möglichst wenig zu stören.


12. Schlussbestimmungen

(1) Diese Anlage geht dem Nutzungsvertrag im Fall von Widersprüchen in
Fragen des Datenschutzes vor.

(2) Änderungen bedürfen der Textform.

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
