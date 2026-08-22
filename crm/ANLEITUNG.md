# Kurani CRM

Dein Agentur-System: Kunden, Projekte, Rechnungen, Mahnwesen, Zeiten, Ausgaben, Steuer,
Kampagnen und die Frage, was sich eigentlich lohnt.

## Starten

Doppelklick auf **index.html**. Fertig – kein Server, kein Login, kein Internet nötig.
Am besten als Lesezeichen ablegen: jeden Morgen ein Klick.

## Wo liegen die Daten?

**Standard: nur in deinem Browser, auf deinem Rechner.** Nichts geht ins Netz.
Der Preis dafür: löschst du deine Browserdaten, ist alles weg.

→ **Einmal die Woche unten links auf „Backup sichern"** klicken. Diese JSON-Datei ist deine
Versicherung. Zusätzlich legt das CRM automatisch einen Tages-Snapshot an (letzte 5 Tage,
siehe Einstellungen).

Wenn du **Handy-Sync** einschaltest (siehe unten), liegt zusätzlich eine Kopie in deiner
eigenen Supabase – hinter Login und Zeilenschutz.

---

## Der laufende Monat

Ganz oben auf der Übersicht steht die schwarze Karte mit den drei Zahlen, die zählen:

| Zahl | Was drinsteckt |
|---|---|
| **Eingenommen** | Was diesen Monat wirklich auf dem Konto war – nur bezahlte Rechnungen, am Tag des Geldeingangs |
| **Ausgegeben** | Belege plus Fahrtkosten (0,30 € je km) |
| **Bleibt dir** | Die Differenz, plus der Hinweis, wieviel davon für die Steuer weg sollte |

Dazu der Vergleich zum Vormonat in Prozent und – ab dem fünften Tag – eine Hochrechnung
aufs Monatsende, falls es so weiterläuft.

Steht bei „Bleibt dir" wenig, obwohl du viel gearbeitet hast: Wahrscheinlich sind Rechnungen
raus, aber nicht bezahlt. Das steht in der Zeile darunter.

Bei Regelbesteuerung wird mit **Netto** gerechnet – die Umsatzsteuer gehört dem Finanzamt
und ist kein Umsatz von dir.

---

## Diagramme

Auf der **Übersicht** siehst du den Jahresverlauf: die Fläche ist dieses Jahr, die
gepunktete Linie das Vorjahr, die grüne Linie dein Monatsziel. Darunter Balken für
rein und raus. Wenn du mit der Maus über einen Monat fährst, steht der genaue Wert da.

In der **Auswertung** kommen dazu: das Jahresziel als Ring, der Gewinnverlauf, wer das
Geld bringt und womit du es verdienst – alles mit Prozentangaben.

Die Diagramme sind gezeichnet, nicht als Bild eingebaut. Deshalb bleiben sie auf jedem
Bildschirm scharf, funktionieren ohne Internet und drucken sauber mit.

---

## Der tägliche Ablauf

1. **„Was ist dran"** öffnen. Da steht alles, was heute wirklich ansteht: überfällige
   Rechnungen mit der passenden Mahnstufe, fertige Projekte die abgerechnet werden müssen,
   fällige Abos, Deadlines, Nachfass-Termine, Saison-Themen, Jahrestage.
2. Knopf drücken. Text ist fertig formuliert – Mail oder WhatsApp öffnet sich mit allem drin.
3. Fertig.

---

## Assistent

Ein Chat, der deine Zahlen kennt. Kunden, Rechnungen, Projekte, Zeiten, Termine – alles,
was im CRM steht, hat er im Kopf, wenn du fragst.

**Was du ihn fragen kannst:**

- *Was ist heute das Wichtigste?*
- *Wie stehe ich dieses Jahr da?*
- *Welche Rechnung hängt am längsten und was schreibe ich dazu?*
- *Habe ich nächste Woche noch Zeit für einen neuen Auftrag?*
- *Was kostet eine Speisekarte wie die von La Piazza?* – er schaut in deine Preis-Historie
- *Schreib eine Antwort an den Kunden* – fertig zum Kopieren, ohne Platzhalter

Er ändert nie etwas an deinen Daten. Er rechnet, erklärt und schreibt Vorschläge –
abschicken tust du selbst.

**Einrichten (einmalig):**

1. Auf **console.anthropic.com** anmelden
2. Guthaben aufladen – 5 € reichen für sehr lange
3. Unter **API Keys** einen Schlüssel erzeugen (fängt mit `sk-ant-` an)
4. In den Einstellungen unter *Assistent* eintragen

**Was das kostet:** Eine normale Frage liegt bei ungefähr einem halben Cent. Zehn Fragen
am Tag kosten im Monat also gut einen Euro. In den Einstellungen siehst du den laufenden
Monat mit. Wenn dir das zu viel wird, stell dort auf *Sonnet 5* oder *Haiku 4.5* um –
das ist günstiger und für normale Fragen völlig ausreichend.

**Dein Schlüssel:** liegt nur in dem Browser, in dem du ihn eingetragen hast. Er kommt
nicht ins Backup und nicht in den Handy-Sync – aufs Handy musst du ihn also einmal
separat eintragen.

**Was rausgeht:** Bei jeder Frage geht dein aktueller Stand an Anthropic – Kundennamen,
Umsätze, offene Rechnungen. Wenn das für einen bestimmten Fall nicht sein soll, frag
nicht den Assistenten, sondern schau selbst in die Zahlen.

Bei einer Mahnung oder Rechnung findest du im Senden-Fenster drei Knöpfe:
*Freundlicher*, *Bestimmter*, *Kürzer*. Damit schreibt er dir den Text neu.

---

## Kontoabgleich

Kontoauszug bei der Bank als CSV herunterladen, hier reinziehen. Das CRM sucht zu jedem
Geldeingang die passende Rechnung.

- Steht die Rechnungsnummer im Verwendungszweck, ist die Sache klar.
- Sonst wird über Betrag und Kundenname gesucht.
- Gehört die Zahlung zu einer Rechnung, die schon auf *bezahlt* steht, sagt er das –
  damit du nichts doppelt buchst.
- Abbuchungen kannst du direkt als Betriebsausgabe übernehmen.

Gebucht wird nur, was du bestätigst. Eindeutige Fälle kannst du mit einem Knopf
gesammelt buchen. Ein Auszug, den du zweimal einliest, wird nicht zweimal gebucht.

Sparkasse, Volksbank und die meisten anderen Formate werden erkannt – Semikolon oder
Komma, deutsche oder englische Beträge, mit oder ohne Anführungszeichen.

---

## Kunden-Ampel

Was jeder Kunde einbringt, gemessen an dem, was er kostet.

| Spalte | Bedeutung |
|---|---|
| **Kosten** | Material, Druck und Fremdleistungen auf den Aufträgen des Kunden |
| **Marge** | Umsatz minus diese Kosten – was für deine Arbeit übrig bleibt |
| **pro Stunde** | die Marge geteilt durch die gebuchten Stunden |
| **zahlt nach** | Tage zwischen Fälligkeit und Geldeingang, im Schnitt |

**Kosten eintragen:** In jeder Zeile steht rechts **+ Kosten**. Dort trägst du Material,
Druck oder Fremdleistung direkt ein – während du tippst, siehst du sofort, was das mit
deiner Marge macht. Der Auftrag ist vorausgewählt; ohne Auftrag lässt sich eine Ausgabe
keinem Kunden zurechnen.

Denselben Knopf gibt es beim Kunden selbst, in der Karte *Material & Fremdkosten*.
Dort stehen auch alle einzelnen Posten mit Händler und Auftrag.

Grün heißt: passt. Gelb: ein Wert kippt. Rot: rechnet sich so nicht – Preis anheben
oder Grenzen setzen. Ein Kunde wird erst bewertet, wenn mindestens zwei dieser Werte
vorliegen; vorher steht *zu wenig Daten*.

Damit das funktioniert, musst du Zeiten buchen. Ohne Zeiten kann niemand ausrechnen,
was eine Stunde bei dem Kunden wirklich bringt.

---

## Lastschrift – monatlich selbst einziehen

Für die Kiek-mol-in-Abos: Statt jeden Monat hinter 20 Restaurants herzutelefonieren,
ziehst du das Geld selbst ein. Kein Stripe, kein PayPal, keine Prozentgebühr –
die Sparkasse macht den Einzug für ein paar Cent pro Buchung.

**Das CRM bewegt kein Geld.** Es schreibt die Datei, die du im Online-Banking hochlädst.
Einziehen tut die Bank.

### Was du einmal brauchst

Eine **Gläubiger-Identifikationsnummer**. Kostenlos bei der Deutschen Bundesbank unter
`glaeubiger-id.bundesbank.de` – online beantragt, kommt per Mail, sieht aus wie
`DE98ZZZ09999999999`. Die trägst du in den Einstellungen bei den Firmendaten ein.

### Der Ablauf

1. **Mandat** – der Kunde unterschreibt, dass du einziehen darfst. Den Text druckst du
   über den Knopf *Mandatstext drucken*; der Wortlaut ist vorgeschrieben. **Heb das
   unterschriebene Blatt auf** – ohne Mandat kann der Kunde den Einzug noch 13 Monate
   später zurückholen.
2. **Mandat eintragen** – Kunde, IBAN, Datum der Unterschrift. Die IBAN wird sofort
   auf Tippfehler geprüft.
3. **Abo anlegen** unter *Abos* – was der Kunde monatlich zahlt.
4. **Einmal vorab Bescheid geben**, dass ab jetzt eingezogen wird. Das ist Pflicht.
5. **Monatslauf** drücken – alle fälligen Abos werden auf einen Schlag zu Rechnungen.
   Kunden ohne Mandat bekommen nur die Rechnung.
6. **Datei erzeugen**, im Online-Banking unter *Lastschrift → Datei einreichen*
   hochladen, freigeben.
7. Ein bis zwei Tage später ist das Geld da. Beim **Kontoabgleich** erkennt das CRM
   die Sammelbuchung und setzt alle Rechnungen des Laufs auf bezahlt.

### Basis oder Firmen-Lastschrift

**Basis (CORE)** ist der Normalfall und funktioniert mit jedem. Der Kunde kann acht
Wochen lang widersprechen.

**Firmen-Lastschrift (B2B)** kann nicht widerrufen werden – dafür muss der Kunde das
Mandat aber bei *seiner* Bank anmelden. Lohnt sich bei größeren Beträgen, macht aber
mehr Arbeit beim Einrichten.

### Wenn eine Lastschrift zurückkommt

Kommt vor: Konto nicht gedeckt, Kunde hat widersprochen. Du siehst das im Kontoauszug
als Abbuchung. Ein Klick auf *Erfassen*:

- die Rechnung steht wieder offen und taucht in *Was ist dran* auf
- die Rücklastschriftgebühr deiner Bank landet in den Ausgaben
- auf Wunsch wird das Mandat gesperrt, damit du bei dem nicht nochmal einziehst

### Dateiformat

Standard ist `pain.008.001.08` – damit kommen die meisten Banken klar. Wenn deine
Sparkasse die Datei ablehnt, stell beim Erzeugen auf `pain.008.001.02` um; das ist
die ältere Fassung.

Umlaute werden automatisch umgeschrieben (Café Grün → Cafe Gruen), weil SEPA nur
einen eingeschränkten Zeichensatz erlaubt. Sonst weist die Bank die Datei zurück.

---

## Rechnung, sobald ein Projekt fertig ist

Wenn du ein Projekt auf **fertig** setzt – im Editor oder per Ziehen im Kanban –
kommt sofort ein Rechnungsentwurf hoch:

- Steht ein Preis am Projekt, wird der genommen.
- Sonst werden die gebuchten Stunden mit deinem Stundensatz gerechnet, nach Tätigkeit
  zusammengefasst.
- Geleistete Anzahlungen zieht er automatisch ab.

Du siehst die Positionen und entscheidest: *Rechnung anlegen* oder *Später*.
Gibt es zu dem Projekt schon eine Rechnung, kommt gar nichts.

---

## Handy-Sync einrichten (einmalig)

Damit Mac und Handy denselben Stand haben. Drei Schritte, zusammen etwa 10 Minuten.

### 1. Tabelle in Supabase anlegen

Supabase-Dashboard → dein Projekt → **SQL Editor** → einfügen und ausführen:

```sql
create table if not exists public.crm_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  device     text
);

alter table public.crm_state enable row level security;

create policy "eigene zeile lesen"    on public.crm_state
  for select using (auth.uid() = user_id);
create policy "eigene zeile anlegen"  on public.crm_state
  for insert with check (auth.uid() = user_id);
create policy "eigene zeile ändern"   on public.crm_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Damit kommt **nur dein eingeloggter Benutzer** an deine Zeile – niemand sonst, auch nicht
mit dem öffentlichen anon-Key.

### 2. Benutzer anlegen

Supabase → **Authentication → Users → Add user** → deine E-Mail und ein Passwort,
das du dir merkst. „Auto Confirm User" anhaken.

### 3. Im CRM einschalten

Einstellungen → **Handy-Sync**. Dort stehen zwei Felder:

- **Projekt-URL** – im Supabase-Dashboard unter *Settings → API* („Project URL").
  Auf Ibos Rechner ist sie schon vorbelegt; sie steht in `js/stammdaten.js` und
  geht bewusst nicht mit ins Netz.
- **anon / public key** – am selben Ort, der Schlüssel mit der Bezeichnung
  **anon public** (bzw. *publishable*). **Nicht** den `service_role`-Schlüssel nehmen –
  der hebelt den Zeilenschutz aus.

Dann **Verbindung testen** (sagt dir sofort, ob Projekt und Tabelle stimmen) und
**Sync einschalten** → E-Mail und Passwort deines Supabase-Benutzers.

Auf dem Handy dieselben vier Angaben. Ab da gleicht sich alles automatisch ab: beim Öffnen,
beim Zurückkommen auf den Tab, und ein paar Sekunden nach jeder Änderung.

**Wenn auf beiden Geräten gleichzeitig etwas geändert wurde**, fragt das CRM nach, welcher
Stand gelten soll – und zeigt dir von beiden Seiten Datum und Anzahl der Einträge.
Automatisch zusammengeführt wird nichts, damit nichts stillschweigend verschwindet.

### Aufs Handy bekommen

Die Datei per Doppelklick geht nur am Rechner. Fürs Handy muss das CRM unter einer Adresse
liegen (z.B. über Netlify). Dann in Safari öffnen → Teilen → **Zum Home-Bildschirm**.
Icon und Vollbild sind schon vorbereitet.

---

## Rechnungen & KV

- **+ Rechnung** oder **+ KV** oben rechts. Nummer wird automatisch vergeben
  (`2026001`, `KV-2026-001`, `AB-2026-001`, `M-2026-001`).
- Positionen per Hand, aus dem **Leistungskatalog**, oder aus dem **Kalkulator**.
- §19 UStG steht automatisch drauf, Zahlungsziel 7 Tage, Fristen fallen nie auf Sa/So.
- **KV → Auftragsbestätigung → Rechnung** mit einem Klick, Positionen wandern mit.
- **Drucken / PDF** druckt im Kurani-Hausformat (schwarzer Titelblock, schwarze Tabellenkopf-
  zeile, grauer Summenblock, IBAN in der Fußzeile). Im Druckdialog „Als PDF sichern" wählen –
  und **Hintergrundgrafiken aktivieren**, sonst fehlen die schwarzen Blöcke.

## Das Rechnungs-PDF

Eine Rechnung passt auf **ein Blatt** – bis zu elf Positionen mit Beschreibungstext.
Dafür setzt der Druckbogen sich automatisch enger, je mehr draufmuss:

| Umfang | Was passiert |
|---|---|
| bis ~8 Zeilen | normale Fassung mit voller Luft |
| bis ~13 Zeilen | Abstände enger, Schrift minimal kleiner |
| darüber | maximal verdichtet, bleibt lesbar |

Konditionen und Summenblock stehen nebeneinander statt untereinander – das allein
spart eine Blockhöhe.

Die Fußzeile mit Bankverbindung und Steuernummer sitzt unten am Blatt wie auf einem
Briefbogen – nicht direkt unter dem Text.

Wird es doch mal länger als eine Seite, bricht es sauber um: Die Tabellenkopfzeile
wiederholt sich oben auf der zweiten Seite, keine Position wird mittendrin zerschnitten,
und Summenblock und Fußzeile bleiben zusammen.

### Als PDF speichern

In der geöffneten Rechnung auf **Als PDF speichern** (in der Liste: der Knopf **PDF**).
Beim ersten Mal erklärt dir das CRM den Weg durch den Druckdialog; danach geht es direkt.

Die Datei heißt automatisch richtig – zum Beispiel `Rechnung 2026042 Musterkunde.pdf`.

**Einmal im Druckdialog einstellen:** unter „Weitere Einstellungen" die **Kopf- und Fußzeilen
ausschalten** (sonst druckt der Browser Datum und Adresse mit auf den Bogen) und
**Hintergrundgrafiken** anhaken (sonst fehlen die schwarzen Balken).

---

## Mahnwesen

| Wann | Was |
|---|---|
| Tag 10–14 überfällig | Zahlungserinnerung – freundlich, ohne das Wort „Mahnung", keine Gebühr |
| Tag 21 | 1. Mahnung mit 5,00 € Mahngebühr, sachlicher Ton |
| Tag 35 | Letzte Mahnung, Frist 7 Tage |
| danach | **Stopp.** Du entscheidest. Nichts eskaliert von allein. |

- **Stammkunden** bekommen erst einen Anruf/WhatsApp vorgeschlagen, Erinnerung frühestens Tag 14.
- Liegt eine **Reklamation** im Posteingang, blockiert das CRM die Mahnung für diesen Kunden.
- Es wird nie eine Stufe übersprungen, auch bei nachgetragenen alten Rechnungen nicht.

## Posteingang (Mails & WhatsApp)

Die App kann von sich aus nicht in dein Postfach schauen. Zwei Wege rein:

1. **Text einfügen** – WhatsApp-Chat oder Mail kopieren, einfügen. Das CRM erkennt Kunde,
   Preis, Termin und Absicht (Anfrage / Zusage / Zahlung / Reklamation / dringend) und macht
   mit einem Klick Projekt, KV oder Aufgabe daraus.
2. **Über Claude** – „Lies meine Mails der letzten Tage und gib mir das JSON fürs CRM."
   Dann bei *Von Claude importieren* einfügen.

## Kalkulator (Folie, Plane, Schild)

Unter **Projekte → Kalkulator**, oder direkt im Dokument über den Chip *Kalkulator*.

Maße, Material, Verschnitt, Aufschlag, Gestaltungszeit, Anfahrt rein – raus kommt ein
Angebotspreis mit vollständiger Aufstellung. Warnt dich, wenn du unter deinen Stundensatz
rutschst oder unter der Mindestauftragsgröße landest. **Als Position übernehmen** setzt das
Ergebnis direkt ins Angebot.

Die Materialpreise sind Richtwerte (Einkauf inkl. Druck) – überschreib sie mit deinen echten
Einkaufspreisen, das Feld ist direkt editierbar.

## Was lohnt sich

Rechnet aus deinen eigenen Zahlen, was du **wirklich** pro Stunde verdienst – je Auftragsart:
Umsatz minus projektbezogenes Material, geteilt durch die gebuchten Stunden.

Dazu: Angebotsquote nach Preisklasse (über 80 % Zusagen heißt meist: zu billig) und dein
Verschätzungs-Faktor (brauchst du regelmäßig das 1,9-fache deiner Schätzung, gehört das in
die nächste Kalkulation).

Dafür müssen zwei Dinge gepflegt sein: **Zeiten buchen** und **Rechnungen einem Projekt
zuordnen**. Ohne das bleibt die Seite leer.

## Kampagnen

Der Jahreszyklus deiner Gastro-Kunden ist hinterlegt:

| Zeitraum | Thema |
|---|---|
| 08.01.–10.02. | Ruhige Zeit: Logo, Website, Kiek mol in |
| 10.02.–25.03. | Saisonkarte, Druck muss vor Ostern durch |
| 25.03.–15.05. | Terrassensaison: Aufsteller, Fahnen, Folie |
| 01.06.–25.08. | **Hochsaison – Füße still halten.** Keine Akquise. |
| 01.09.–30.09. | Nachsaison: Sommermaterial verwerten, Content-Abo |
| 01.10.–10.11. | Weihnachtskarte, Silvestermenü, Gutscheine |
| 25.11.–20.12. | Feiertags-Aushänge, Jahresabschluss |

Eine **Aktion** heißt: einmal Text schreiben, Zielgruppe wählen (Gastro, Stammkunden,
schlafend, ohne Abo …) – dann arbeitest du eine Liste ab, pro Kunde ein WhatsApp-Knopf mit
persönlicher Anrede und ein Status. Platzhalter: `{vorname}`, `{name}`, `{firma}`.

Dazu **Jahrestage**: Aufträge, die ungefähr ein Jahr her sind, mit passendem Anschreibtext.

## Ausgaben & Belege

Ausgabe erfassen, **Beleg fotografieren** (auf dem Handy geht direkt die Kamera auf – das
Bild wird auf ein paar Dutzend KB heruntergerechnet und hängt am Datensatz).

Wenn die Fotos zusammen über 2,5 MB gehen, sagt dir das CRM Bescheid: Backup machen, dann
Fotos vom Vorjahr aufräumen (Einstellungen).

## Fahrten

Jede betriebliche Fahrt mit dem privaten Wagen ist eine Betriebsausgabe – 0,30 €/km.
Eintragen: Datum, Von, Nach, Kilometer, Zweck. Häufige Strecken merkt sich das CRM und legt
sie als Ein-Klick-Knöpfe an. Wählst du einen Kunden, wird Ziel und Entfernung aus einer
früheren Fahrt übernommen.

Die Summe fließt automatisch in EÜR, Gewinn und Steuer-Export – als eigene Zeile, weil es
dafür keinen Beleg gibt, sondern nur die Aufzeichnung.

Fahrten zwischen Wohnung und einem festen Betriebssitz zählen anders (Entfernungspauschale).
Wenn dein Büro zu Hause ist, betrifft dich das meist nicht – im Zweifel mit dem Steuerberater klären.

## Termine & Bestellungen

**Woche**: Montage, Kundentermine, Aufmaß, Drehtage. Klick auf einen Tag legt dort einen Termin
an. Projekt-Deadlines und erwartete Lieferungen erscheinen automatisch mit – die musst du nicht
doppelt eintragen. Über **Kalender-Datei** bekommst du alles als `.ics`, das der iPhone-Kalender
importiert.

**Bestellungen**: was du wo bestellt hast, was es kostet, wann es kommen soll. Ist die Lieferung
überfällig, steht sie unter „Was ist dran". Beim Abhaken fragt das CRM, ob es den Betrag gleich
als Ausgabe buchen soll.

## Korrekturschleifen

Im Projekt trägst du jede Änderungsrunde ein. Zwei sind laut Einstellung im Preis enthalten –
ab der dritten meldet sich das CRM mit einem fertigen, freundlichen Text und dem Knopf
**Als Position berechnen**. Das ist die Arbeit, die sonst still verschwindet.

## Anzahlung, Schlussrechnung, Storno

- **Anzahlung**: aus einem KV heraus, Vorschlag 50 % des Auftragswerts.
- **Schlussrechnung**: listet die volle Leistung und zieht gezahlte Anzahlungen als Minusposition ab.
- **Stornieren**: rausgegangene Rechnungen werden nie gelöscht oder überschrieben. Entweder nur
  storniert oder storniert und korrigiert neu erstellt – mit dem Vermerk „ersetzt Rechnung Nr. X".
  So bleibt die Nummernfolge lückenlos.

## Kunden-Gedächtnis

Auf jeder Kundenseite: **Marke & Technik** (Hausfarben mit HEX zum Kopieren, Schriften, wo das
Logo liegt, welcher Lieferant, Besonderheiten) und **Maße vor Ort** (Fassadenschild, Fensterfront,
Fahrzeugseite). Einmal gemessen, nie wieder hinfahren.

**Preis-Historie** zeigt für jede Leistung, was du wem berechnet hast – mit Warnung, wenn die
Spanne groß ist. In Ostfriesland reden die Wirte miteinander.

**Vorlagen** für wiederkehrende Aufträge: Standardpositionen, typischer Aufwand und eine
Checkliste (Allergene geprüft, Freigabe eingeholt, Druckdaten mit Beschnitt …). Vier fertige
Vorlagen für Speisekarte, Folie, Logo und Banner kannst du mit einem Klick anlegen.

## Kiek mol in

Lädt die Restaurants aus deiner eigenen App und gleicht sie mit der Kundenkartei ab: wer ist
schon Kunde, wer noch nicht. Und – oft nützlicher – wo in deiner Kartei Telefonnummer, Mail
oder Adresse fehlen, die dort längst hinterlegt sind. **Kontaktdaten übernehmen** füllt nur
leere Felder, vorhandene bleiben unangetastet. Es wird nur gelesen, an Kiek mol in ändert sich nichts.

## Agentur

Zeigt die **Neukunden-Pipeline der Agentur-App**: welche Betriebe angerufen wurden, wo das
Gespräch steht, was der Website-Check gefunden hat. Und – der eigentliche Zweck – die zwei
Lücken zwischen beiden Systemen:

- **Gewonnen, aber nicht in der Kartei.** Ein Betrieb hat zugesagt, steht aber nicht als
  Kunde hier. Solange das so ist, bekommt er keine Rechnung und kein Abo. Ein Klick auf
  **Als Kunden anlegen** legt ihn mit Name, Ort, Telefon und den Gesprächsnotizen an.
- **Kunde hier, Fremder drüben.** Jemand, der dir seit Jahren Speisekarten zahlt, hängt in
  der Pipeline noch als kalter Interessent. Beim Laden meldet das CRM der Agentur, wer
  Kunde ist – danach steht dort seine Kundennummer und niemand ruft ihn kalt an.

Übertragen wird nur **Nummer, Name und Ort**. Keine Adresse, keine Bankverbindung, keine
Umsätze. Was nicht rausgeht, kann auch nicht aus Versehen irgendwo auftauchen.

### Das geht nur unter der richtigen Adresse

Die Agentur-App läuft auf deinem Mac. Eine Seite aus dem Netz darf deinen Rechner nicht
ansprechen – das ist eine Schutzregel des Browsers, keine Einstellung. Beide müssen also
unter **derselben** Adresse laufen:

1. **„Agentur starten.command"** doppelklicken
2. Im Browser **http://localhost:3200/crm/** öffnen

Dort ist das CRM angebunden. Öffnest du es woanders, steht auf der Agentur-Seite eine
Erklärung statt einer Fehlermeldung.

**Deine Daten sind dabei nicht weg.** Der Browser speichert pro Adresse getrennt – unter
der neuen Adresse fängt das CRM zunächst leer an. Zwei Wege:

- **Handy-Sync an?** Dann einmal anmelden, und der Stand ist da.
- **Sonst:** an der alten Adresse **Backup sichern**, unter der neuen einlesen
  (Einstellungen → Backup einlesen).

## Umsatzsteuer: § 19 oder Regelbesteuerung

**Einstellungen → Umsatzsteuer.** Heute läufst du als Kleinunternehmer nach § 19 – keine
Umsatzsteuer auf den Rechnungen. Wenn du später aufs Gewerbe mit Regelbesteuerung wechselst,
stellst du hier um:

- Jede Position bekommt einen Steuersatz (19 %, 7 % oder 0 %)
- Der Summenblock zeigt Nettobetrag, Umsatzsteuer und Gesamtbetrag
- Der § 19-Hinweis verschwindet, die USt-IdNr. kommt in die Fußzeile
- Du wählst, ob du Preise **netto** eingibst (üblich bei Geschäftskunden) oder **brutto**
- Die Steuer-Seite zeigt zusätzlich die vereinnahmte Umsatzsteuer und die
  Voranmeldungs-Fristen zum 10. nach jedem Quartal

**Wichtig:** Jede Rechnung merkt sich den Steuermodus, mit dem sie geschrieben wurde.
Eine Rechnung von heute bleibt für immer eine § 19-Rechnung, auch wenn du nächstes Jahr
umstellst. Rückwirkend ändert sich nichts – das muss so sein.

Den Zeitpunkt der Umstellung, ob monatliche oder vierteljährliche Voranmeldung, und ob
Ist- oder Soll-Versteuerung günstiger ist: das klärt der Steuerberater. Für deine
Restaurant-Kunden ändert sich übrigens nichts – die ziehen die Vorsteuer ab.

## Steuer

- Laufende EÜR: Einnahmen (nur was **bezahlt** wurde), Ausgaben inkl. Fahrtkosten, Gewinn.
- Rücklagen-Empfehlung (25 % vom Gewinn – zweites Konto, nach jeder Zahlung rüberschieben).
- §19-Grenzen 25.000 € Vorjahr / 100.000 € laufend mit Warnung, bevor es eng wird.
- Fristen und CSV-Export für den Steuerberater.

Rechenhilfe, kein Ersatz für den Steuerberater.

## Tastatur

`Cmd + K` – Suche über Kunden, Rechnungen, Projekte.

---

## Aufbau

```
index.html          Gerüst + Menü
manifest.json       Homescreen-Einstellungen
icon.png            App-Icon
css/app.css         Oberfläche
css/print.css       Druckbogen (Kurani-Hausformat v2)
js/utils.js         Datum, Geld, Fristen
js/store.js         Daten, Stammdaten, Kundenliste, Leistungskatalog
js/ui.js            Modals, Toasts, Badges
js/sync.js          Handy-Sync über Supabase
js/customers.js     Kunden
js/projects.js      Projekte, Zeiten, Kapazität
js/documents.js     Rechnungen, KV, Mahnwesen, Druck, Abos
js/inbox.js         Posteingang
js/finance.js       Ausgaben, Belegfotos, EÜR, Steuer, Auswertung
js/calc.js          Kalkulator Folie / Plane / Schild
js/trips.js         Fahrtenbuch
js/knowledge.js     Marken-Steckbrief, Maße, Preis-Historie, Vorlagen
js/calendar.js      Termine, Bestellungen, ICS-Export
js/kiekmolin.js     Abgleich mit der Kiek-mol-in-Datenbank
js/analysis.js      Was lohnt sich, Kunden-Ampel
js/bank.js          Kontoabgleich aus dem Kontoauszug
js/lastschrift.js   SEPA-Mandate, Monatslauf, Einzugsdatei
js/assistant.js     Assistent (Anbindung an Claude)
js/chart.js         Diagramme (SVG, ohne fremde Bibliothek)
js/sperre.js        Bildschirmsperre mit PIN
js/stammdaten.js    Deine Firmendaten und die Kundenliste (bleibt lokal)
js/campaigns.js     Saison und Kampagnen
js/growth.js        Wachstum
js/app.js           Router, Dashboard, Aufgaben-Automatik
```

Stammdaten, Preise und Materialkosten stehen oben in `js/store.js` bzw. `js/calc.js` –
Firmendaten und Konditionen lassen sich auch direkt in den **Einstellungen** ändern.

**Nach Code-Änderungen**: in `index.html` die Zahl in `?v=9` hochzählen, sonst zeigt der
Browser die alte Version aus dem Cache.
