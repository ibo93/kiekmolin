# Projekt: The Chef – KI-Lager-App mit Küchen-Assistent für kleine Gastronomie (kompletter Neubau)

Arbeitstitel "The Chef". Name vor dem Launch auf Markenschutz und App-Store-Sichtbarkeit prüfen.

## Ziel
Eine extrem einfache App für kleine Einzelbetriebe (Imbiss, Döner, Pizzeria, Asia).
Ein Mitarbeiter fotografiert das Lager/Kühlhaus, die KI erkennt was da ist und wie viel.
Der Chef sieht von zuhause jederzeit den Bestand, was bald abläuft und was er für morgen braucht.
Ein KI-Assistent denkt mit wie ein erfahrener Küchenchef und beantwortet Fragen zum Lager.

Die App hat ZWEI große Kerne, beide mit höchster Sorgfalt bauen:
  1. LAGER-SCAN
  2. KI-ASSISTENT

Entscheidend für den Erfolg: Die Zahlen müssen stimmen. Wenn der Chef den Zahlen
vertraut, verkauft sich die App. Deshalb hat Scan-Genauigkeit Vorrang vor allem anderen.

## Oberste Regel: EINFACHHEIT
Jeder Screen muss ohne Erklärung verständlich sein – auch für einen Mitarbeiter,
der wenig Deutsch kann und nie mit Apps arbeitet ("Halil-Regel").
- Große Buttons, wenig Text, klare Icons, Produktbilder statt nur Wörter
- Wird in der Küche mit nassen Händen oder Handschuhen benutzt → große Touch-Flächen,
  Zahlen auch per Sprache eingebbar
- Maximal 1 Hauptaktion pro Screen
- Wenn eine Funktion nicht einfach geht, lieber weglassen

## Zwei Rollen
1. MITARBEITER: sieht die Bereiche des Tages als große Karten (z. B. Kühlhaus,
   Tiefkühler, Trockenlager). Der nächste offene Bereich ist hervorgehoben und startet
   mit einem Tipp den Scan. Dazu ein kleiner Button "Weggeworfen".
2. CHEF: nutzt die App meist von zuhause.
   Startbildschirm des Chefs = KI-Assistent mit Abend-Briefing + großem Mikrofon,
   darunter Warenwert und Bestand.

## Kernfunktionen (MVP – nur das, nichts anderes)

### 0. EINRICHTUNG (einmalig, geführt, Schritt für Schritt)
- Sprache wählen, Betrieb anlegen, Mitarbeiter einladen
- BEREICHE anlegen (Kühlhaus, Tiefkühler, Trockenlager …)
- FESTE FOTO-POSITIONEN pro Bereich anlegen (z. B. "Kühlhaus – Regal links").
  Pro Position wird ein Referenzfoto gespeichert.
- PRODUKTKATALOG pro Betrieb: jedes Produkt einmal fotografieren und festlegen,
  WIE es gezählt wird (z. B. "Hähnchen: Kiste à 5 kg", "Joghurt: Becher").
  Die KI zählt später Einheiten und rechnet selbst in kg/Stück um.
  Preis pro Einheit optional (für Warenwert).
- Mindestbestand und Standard-Haltbarkeit pro Produkt (mit sinnvollen Vorschlägen)
- iPhone: Installation auf dem Home-Bildschirm Schritt für Schritt erklären,
  sonst funktionieren Push-Nachrichten auf iOS nicht

### 1. LAGER-SCAN (Kern 1)
- Mitarbeiter scannt Bereich für Bereich, Position für Position
- GEISTERBILD: Das letzte Foto dieser Position wird halb durchsichtig über die
  Kamera gelegt. Mitarbeiter richtet die Kamera daran aus → immer gleicher Winkel,
  genauere Erkennung, Vergleich mit dem letzten Scan möglich
- Blitz/Taschenlampe-Knopf in der Kamera (Kühlhäuser sind oft dunkel)
- KI (Claude Vision über Anthropic API) erkennt Produkte aus dem Produktkatalog und
  ZÄHLT EINHEITEN (Kisten, Packungen, Stück). Kein freies Schätzen von Gewicht.
- Jede Erkennung hat einen Sicherheitswert. Ist die KI unsicher, fragt sie kurz nach
  ("Wie viele Kisten Tomaten sind das?") → Zahl eintippen ODER sagen ("vier")
- Liest MHD vom Etikett, wenn sichtbar
- Ergebnis als Kachel-Raster mit Produktbild (Ausschnitt aus dem Foto), Menge und
  Warn-Plakette ("heute", "2 Tage"). Tippen auf Kachel = ändern.
- Mitarbeiter bestätigt mit einem Tipp → Bestand ist aktualisiert
- Erfolgsmoment: "Gespeichert. Danke, Halil." + nächster offener Bereich
- OFFLINE-SCAN: Fotos werden auf dem Gerät gespeichert, wenn kein Netz da ist
  (Kühlhaus!), und automatisch hochgeladen, sobald wieder Verbindung besteht.
  Klare Anzeige "Wird hochgeladen, sobald Netz da ist".

### 2. BESTAND (Chef)
- Oben groß: Gesamter Warenwert ("1.240 € Ware im Lager") + Weggeworfen im Monat
- Drei Ampel-Kacheln: Alles gut / Wird knapp / Sofort (mit Anzahl)
- "Läuft bald ab" als waagerecht wischbare Karten mit Bild und Plakette
- "Alles im Lager" nach Bereichen gruppiert, pro Bereich Zeit des letzten Scans
- Ampel NIE nur über Farbe: immer auch Wort oder Symbol (Farbschwäche)
- Zeitpunkt des letzten Scans deutlich sichtbar

### 3. HALTBARKEIT
- MHD aus Etikett, wenn erkannt
- Frische Ware ohne Etikett (Fisch, Fleisch, Gemüse): Haltbarkeit aus Scan-/Lieferdatum
  + Standard-Haltbarkeit pro Produktkategorie berechnen (Werte pro Produkt änderbar)

### 4. KI-ASSISTENT (Kern 2)
Der Assistent ist wie ein erfahrener Küchenchef, der das Lager kennt.
Er kennt immer: aktuellen Bestand, Haltbarkeiten, Mindestbestände, Scan-Verlauf,
Warenwert, Weggeworfen-Daten.

a) FRAGEN & ANTWORTEN (Chat + Spracheingabe)
   - Chef fragt per Text oder Sprache, in seiner eigenen Sprache:
     "Was muss ich morgen bestellen?" · "Wie viel Hähnchen haben wir noch?" ·
     "Reicht der Fisch fürs Wochenende?" · "Was soll ich heute als Tagesgericht machen?" ·
     "Wie viel haben wir diesen Monat weggeworfen?"
   - Antwort: zuerst ein klarer Satz ("Nein, es fehlen etwa 10 kg."), dann die Zahlen
     als kleine Kacheln (Noch da / Brauchst du / Fehlt), dann die Quelle
     ("Geschätzt aus deinen Scans … Stand: Scan heute, 22:04"), dann eine passende
     Aktion ("10 kg auf Einkaufsliste")
   - Vorschlags-Fragen zum Antippen, Eingabefeld mit großem Mikrofon immer erreichbar

b) PROAKTIVE HINWEISE
   - Nach jedem Scan: kurze Zusammenfassung ("3 Dinge sind wichtig: ...")
   - Warnungen: läuft bald ab, wird knapp, fehlt für morgen
   - Maximal 3–5 Hinweise gleichzeitig, wichtigste zuerst, jeder mit einer Aktion
     ("Auf Einkaufsliste", "Erledigt")
   - Push-Benachrichtigung an den Chef für Wichtiges (abschaltbar)

c) ABEND-BRIEFING
   - Jeden Abend nach dem letzten Scan automatisch an den Chef
   - Genau 3 nummerierte Punkte, lesbar in 20 Sekunden, mit Vorlese-Knopf
   - Eigener, deutlich anderer Zustand, wenn heute NICHT gescannt wurde
     (nicht zu übersehen, mit Hinweis, welcher Bereich fehlt)

d) VORSCHLÄGE
   - Tagesgericht aus Ware, die bald abläuft
   - Fertige Einkaufsliste für morgen, mit einem Tipp teilbar (WhatsApp/Mail)

e) REGELN FÜR DEN ASSISTENTEN (auch technisch absichern)
   - Antwortet nur auf Basis echter Bestandsdaten – erfindet NIE Mengen.
     Umsetzung: Der Assistent bekommt Zahlen ausschließlich über fest definierte
     Datenabfragen (Tools/Funktionen), nicht aus freiem Text.
   - Jede Antwort mit Mengen nennt den Zeitpunkt des letzten Scans
   - Sagt ehrlich, wenn Daten alt sind ("Letzter Scan vor 2 Tagen – bitte neu scannen")
   - Schätzungen (z. B. Verbrauch) immer als Schätzung kennzeichnen und die Grundlage
     nennen
   - Immer in der Sprache des Nutzers
   - Lieber nachfragen oder "bitte neu scannen" als raten

### 5. EINKAUFSLISTE FÜR MORGEN
- Bestand vs. Mindestbestand pro Produkt → was muss nachbestellt werden
- Pro Zeile: Produktbild, Menge "+13 kg", "Noch da / Mindestens", Abhaken
- Wird vom Assistenten erstellt und im Abend-Briefing mitgeschickt
- Teilen per WhatsApp und E-Mail

### 6. KLEINE EXTRAS (Teil des MVP)
- SCAN-ERINNERUNG: Push an Mitarbeiter zu einstellbarer Uhrzeit (Standard 22 Uhr).
  Chef sieht, ob heute gescannt wurde. Wenn nicht: Hinweis im Abend-Briefing.
- WARENWERT IN €: Gesamtwert des Lagers, sobald Preise pro Produkt bekannt sind.
- WEGGEWORFEN-BUTTON: Produkt als Bild antippen, Menge mit großen +/- Tasten oder per
  Sprache, speichern. Monatsübersicht für den Chef: Betrag, Vergleich zum Vormonat,
  Produkte mit dem höchsten Verlust als Balken, Tipp vom Assistenten.

## Später (NICHT im MVP bauen, aber Datenmodell darauf vorbereiten)
- Lieferschein fotografieren → Bestand automatisch erhöhen + Preise übernehmen
- Kassen-Anbindung + Rezepte → Verbrauch automatisch abziehen
- Wochenangebote passend zum Bestand
- Verbrauch pro Wochentag lernen
- HACCP: Thermometer-Foto beim Scan → automatisches Temperatur-Protokoll
- Einkaufsliste per WhatsApp direkt an Lieferanten senden
- Schwund-Erkennung (Scan-Vergleich vs. erwarteter Verbrauch)
- Wetter/Feiertage in Vorschläge einbeziehen
- Instagram-Post aus Tagesgericht-Vorschlag erstellen

## Mehrsprachigkeit
Von Anfang an i18n mit FÜNF Sprachen:
- Deutsch
- Türkisch
- Kurdisch (Kurmancî, lateinische Schrift). Sorani (arabische Schrift, RTL) im
  i18n-System bereits vorbereiten, aber noch nicht übersetzen.
- Arabisch (RTL! Komplettes Layout spiegeln: Navigation, Pfeile, Listen, Zahlenfelder)
- Englisch

Regeln:
- Beim ersten Start Sprache wählen (Screen `Sprache.dc.html`): Sprachen in ihrer
  eigenen Schrift anzeigen ("Türkçe", "Kurdî", "العربية"), darunter klein der deutsche
  Name. Die Begrüßung wechselt sofort in die gewählte Sprache.
- Jeder Nutzer hat seine eigene Sprache. Chef und Mitarbeiter können unterschiedliche
  Sprachen nutzen, die Daten sind dieselben.
- Assistent, Hinweise, Briefing, Push-Nachrichten, Einkaufsliste und Fehlermeldungen
  kommen in der Sprache des Nutzers.
- Produktnamen: pro Produkt ein Name je Sprache im Katalog speichern (z. B.
  Hähnchenbrust / Tavuk göğsü / Singê mirîşkê / صدر دجاج / Chicken breast). Fehlt eine
  Übersetzung, schlägt die KI eine vor, der Chef bestätigt.
- Zahlen, Datum und Währung im jeweiligen Format der Sprache anzeigen.
- Schrift: Systemschrift, die Arabisch sauber darstellt; Zahlen-Schrift nur für Ziffern.
- Alle Übersetzungen (vor allem Kurdisch und Arabisch) vor dem Start von
  Muttersprachlern prüfen lassen. Übersetzungen in eigenen Sprachdateien, damit sie
  ohne Code-Änderung korrigiert werden können.

SPRACHEINGABE: Audio aufnehmen und serverseitig in Text umwandeln (Spracherkennungs-
dienst in einer Edge Function), NICHT über die Browser-Spracherkennung.
Kurdisch wird von Spracherkennungsdiensten deutlich schlechter unterstützt als die
anderen Sprachen. Deshalb: vor dem Bau testen, welcher Dienst Kurmancî am besten
erkennt. Wenn die Erkennung zu unsicher ist, zeigt die App das erkannte Ergebnis zur
Bestätigung an und bietet immer die Eingabe per Tippen an. Zahlen ("vier", "çar",
"أربعة") müssen in allen Sprachen zuverlässig funktionieren.

## Design
Im Ordner `design/` liegen die fertigen Design-Vorlagen als HTML-Mockups (siehe
`design/README.md`). Sie sind der Bauplan: Farben, Abstände, Radien, Schriften, Texte,
Aufbau und Animationen daraus ablesen und in React umsetzen.

Designsprache (übernommen von Summa, Layout eigenständig):
- Apple/iOS-27-Anmutung: ruhig, hochwertig, Liquid Glass NUR für Navigation,
  Toolbar-Knöpfe, Umschalter und Sheets. Inhalte auf klaren Karten.
  Im Browser Glas nachbilden (Transparenz, Unschärfe, helle Lichtkanten oben links),
  Inhalt läuft beim Scrollen unter dem Glas weiter.
- Hell: Hintergrund #F4F3EF, Karten #FFFFFF, Text #141413, Text sekundär #5F5E5A,
  Linien #EFEDE8, Flächen #F1F0EC
- Dunkel: Hintergrund #050506, Karten #1C1C1E, Text #F5F5F7, Text sekundär #A1A1A6,
  Flächen #2C2C2E
- Akzent: Blau #1F4FD1 (dunkel #2F6BFF). Bewusst NICHT Grün, weil Grün/Gelb/Rot die
  Ampel sind.
- Ampel: Grün #34C759 (Text #1B7A45), Gelb/Orange #FF9F0A (Text #8A5300),
  Rot #D92D4B (Text #C21F3D); im Dunkelmodus Apples Dunkel-Töne
- Schrift: System-Schrift (SF Pro auf Apple), große Zahlen in Bricolage Grotesque
  ExtraBold mit tabellarischen Ziffern
- Radien: große Karten 26–28, Kacheln 20–22, Buttons als Kapseln, Touch-Flächen ≥ 44 px,
  Hauptknöpfe 60–64 px hoch
- Navigation Chef: schwebende Glas-Tab-Leiste "Assistent · Bestand · Einkauf" plus
  separater runder Scan-Button. Beim Runterscrollen schrumpft die Leiste, beim
  Hochscrollen kommt sie zurück.

Start-Animation (beim allerersten Start ca. 3 Sekunden, danach max. 1 Sekunde,
antippen überspringt):
- Blauer Hintergrund, Glas-App-Symbol springt ins Bild, vier Scan-Ecken gleiten heran,
  eine leuchtende Scan-Linie fährt einmal darüber, die Kochmütze zeichnet sich Strich
  für Strich, grüner Haken ploppt auf, dann Wortmarke "THE / Chef" und Slogan
  "Dein Lager. Immer im Blick."

Darstellung (Einstellungen):
- Hell / Dunkel / Automatisch, Akzentfarbe wählbar (Standard Blau), Glas klar oder
  getönt, Bewegungen an/aus. Alles über zentrale Design-Tokens.
- Mitarbeiter-Ansicht standardmäßig hell (helle Küche), Chef-Ansicht folgt dem System.

Bewegung:
- Effekte bei Erfolgsmomenten (Gespeichert, Start-Animation), Ruhe im Alltag.
- Beim Öffnen gleiten Karten kurz nacheinander ein, danach bewegt sich nichts mehr
  (Ausnahme: der sanft pulsierende Haupt-Scan-Knopf).
- Tasten geben beim Drücken leicht nach. "Bewegung reduzieren" wird respektiert.

Mobile-first. Mitarbeiter-Ansicht = Handy. Chef-Ansicht = Handy, auch am Tablet/Desktop gut.

## Technik
- React + Vite, als PWA (installierbar, Kamera- und Mikrofon-Zugriff, Push)
- Von Anfang an so bauen, dass der Code später mit Capacitor als echte App in den
  App Store kann (bessere Push-Nachrichten, Kamerasteuerung, Haptik auf dem iPhone)
- Offline-fähig: Service Worker + lokale Warteschlange für Scan-Fotos
- Supabase: Auth, Datenbank, Storage für Scan-Fotos
- Anthropic API (Vision für Scan, Chat mit Tools für Assistent) NUR über Supabase
  Edge Functions – API-Key niemals im Frontend
- Assistent bekommt Bestandsdaten über definierte Tools, nicht als freien Text
- Bilder vor dem Upload verkleinern/komprimieren; Kosten pro Scan und pro Betrieb
  protokollieren und im Admin sichtbar machen
- Abend-Briefing und Scan-Erinnerung per geplanter Funktion (Cron) in Supabase
- Row Level Security: jeder Betrieb sieht nur seine eigenen Daten
- Mandantenfähig, ein Betrieb = mehrere Nutzer
- Datenschutz: Scan-Fotos nach einstellbarer Frist automatisch löschen
  (Standard 30 Tage), erkannte Daten bleiben. Auf Fotos können Mitarbeiter zu sehen sein.
- Deploy auf Netlify

## Datenmodell (Vorschlag, gern verbessern)
betriebe (name, scan_erinnerung_uhrzeit, foto_loeschfrist_tage),
nutzer (rolle: chef/mitarbeiter, sprache, darstellung),
bereiche (betrieb, name, reihenfolge),
scan_positionen (bereich, name, referenzfoto_url, reihenfolge),
produkte (name, kategorie, zaehleinheit, menge_pro_einheit, basiseinheit,
  referenzfoto_url, mindestbestand, standard_haltbarkeit_tage, preis_pro_einheit),
scans (bereich, nutzer, zeitpunkt, status: offline/hochgeladen/bestaetigt),
scan_fotos (scan, position, foto_url, loeschen_am),
scan_erkennungen (scan_foto, produkt, anzahl_einheiten, sicherheit, mhd, bestaetigt),
bestand (produkt, menge, mhd, quelle: scan/lieferschein/kasse, zeitpunkt),
weggeworfen (produkt, menge, wert_eur, zeitpunkt, nutzer),
hinweise (text, prioritaet, aktion, erledigt),
assistent_verlauf (nutzer, frage, antwort, zeitpunkt, genutzte_daten),
briefings (datum, inhalt, gescannt: ja/nein),
ki_kosten (betrieb, art, tokens, kosten_eur, zeitpunkt)
Vorbereiten für später: lieferanten, lieferscheine, rezepte, verkaeufe, temperatur_protokoll

## Arbeitsweise
1. Lies zuerst den Ordner `design/` und fasse mir die Designsprache kurz zusammen.
2. Mach mir einen Plan in Schritten, bevor du Code schreibst. Warte auf mein OK.
3. Bau Schritt für Schritt, nach jedem Schritt kurz zeigen, was läuft.
4. Scan-Erkennung zuerst mit echten Fotos testen – ich teste im ÖZ KEBAB.
   Miss dabei die Genauigkeit (erkannt vs. tatsächlich) und zeig mir das Ergebnis.
5. Wenn etwas unklar ist: fragen, nicht raten.
6. Keine Features einbauen, die nicht in dieser Liste stehen.

## Reihenfolge innerhalb des MVP
1. Einrichtung (Sprache, Bereiche, Foto-Positionen, Produktkatalog) + Lager-Scan + Bestand
   → erst weitermachen, wenn die Scan-Genauigkeit im ÖZ KEBAB überzeugt
2. KI-Assistent: Fragen & Antworten, Abend-Briefing, Einkaufsliste
3. Extras: Scan-Erinnerung, Warenwert, Weggeworfen, Darstellung, Start-Animation
