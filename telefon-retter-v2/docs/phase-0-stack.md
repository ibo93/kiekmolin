# Phase 0 — Stack-Vergleich, Kosten, Latenz

Stand: **01.10.2026**. Alle Preise netto.

**Wie belastbar die Zahlen sind:** Die meisten Herstellerseiten sperrt der
Proxy dieser Sitzung. Die Werte stammen deshalb überwiegend aus
Suchergebnissen, die die offiziellen Preisseiten zitieren, und aus dem
öffentlichen Preis-Datensatz `mahimailabs/voice-prices` auf GitHub. Direkt
gelesen habe ich: Googles Vertex-Preisseite, Apples Entwicklerseiten,
Supabases Doku-Quelltext, AWS-Modellkarte, GitHub-Runner-Ankündigung.
**Gemessen ist noch nichts** — keine Latenz, keine Sprachqualität. Das
kommt in Phase 2 mit echten Testanrufen. Vor jedem Vertrag die Preisseite
selbst öffnen.

Dollar-Beträge sind Dollar. Wo ich in Euro umrechne, steht die Annahme
dabei (1 $ ≈ 0,86 € — **Kurs nicht geprüft**).

---

## 1. Die Grundfrage: drei Bauweisen

| | **A. Eigene Kaskade** | **B. Sprache-zu-Sprache** | **C. Fertige Plattform** |
|---|---|---|---|
| Wie | Spracherkennung → Sprachmodell mit Werkzeugen → Stimme, jedes Teil austauschbar | Ein Modell hört und spricht direkt (OpenAI Realtime, Gemini Live) | Anbieter macht alles, wir liefern Prompt + Werkzeuge (ElevenLabs Agents, Vapi, Retell, sipgate Flow) |
| Kosten / Gesprächsminute | **≈ 0,02–0,055 $** | ≈ 0,02–0,11 $ | ≈ 0,10–0,25 $ |
| Antwortzeit | 0,8–1,3 s (**Schätzung**, Budget unten) | 1,18–1,21 s bis zum ersten Ton (Artificial Analysis, Benchmark mit Reasoning) | laut Anbieter < 0,5–0,7 s (**Herstellerangabe**) |
| Preise wortgenau | **Ja** — die Zusammenfassung kommt als fester Text aus der Datenbank, die Stimme liest nur vor | **Nein** — das Modell formuliert immer selbst | je nach Plattform |
| EU-Hosting | **Ja**, für jedes Teil möglich | OpenAI: EU nur mit Freigabe und +10 %; Gemini: Vertex EU | meist nur im Enterprise-Vertrag |
| Stimme frei wählbar | Ja | Nein (feste Stimmen) | Ja / teils |
| Aufwand für uns | am höchsten (Unterbrechen, Sprecherwechsel, Latenz) — ein Framework nimmt das meiste ab | mittel | am niedrigsten |
| Abhängigkeit | gering | hoch | sehr hoch |

### Empfehlung: **A — eigene Kaskade**

1. **Preise werden nie erfunden.** Das ist die wichtigste Pflicht aus dem
   Auftrag. In der Kaskade spricht die Stimme bei der Zusammenfassung einen
   Text, den die Datenbank erzeugt hat. Ein Sprache-zu-Sprache-Modell
   formuliert immer selbst — es kann sich versprechen.
2. **Sie ist nicht langsamer.** Die Sprache-zu-Sprache-Modelle liegen im
   Benchmark bei ~1,2 s bis zum ersten Ton. Die Kaskade schafft das auch,
   mit Tricks unter 1 s (siehe Latenz-Budget). Gemessen wird in Phase 2.
3. **Alles in der EU** — Server in Frankfurt, Spracherkennung mit
   EU-Endpunkt, Claude über AWS in der EU, Stimme wahlweise Azure in
   Frankfurt.
4. **Billig genug.** ≈ 0,055 $ pro Minute in der Qualitätsvariante; bei 750
   Agent-Minuten im Monat ≈ 41 $ (≈ 35 €) bei einem Kundenpreis von 199 €.
5. **Austauschbar.** Die Branche dreht sich gerade monatlich: Ultravox wurde
   am 30.09. verkauft, OpenAI hat seit Juli das dritte Realtime-Modell.
   Jedes Teil der Kaskade lässt sich tauschen, ohne den Rest anzufassen.
6. **Ein Gehirn für alle Kanäle.** Derselbe Dialog-Kern bedient Telefon,
   den Text-Simulator für die 20+ Testgespräche und später WhatsApp.

**Gegen C spricht vor allem der Preis:** 0,10–0,25 $/Min fressen bei 199 €
pro Monat die Marge, EU-Hosting gibt es meist nur im Enterprise-Vertrag.
Und gut zu wissen: **sipgate AI Agents** ist ein direkter Konkurrent mit
einem fertigen Telefonassistenten für 0,15–0,30 €/Min.

---

## 2. Die Teile der Kaskade

### Telefonie

| Anbieter | Nummer | Eingehend | Audio zum Server | SMS | EU |
|---|---|---|---|---|---|
| **Twilio** | 1,35 $/Monat (Ortsnetz) | 0,0100 $/Min | Media Streams 0,0044 $/Min | 0,112 $ | Region Irland (IE1) mit Voice + Media Streams |
| **sipgate trunking** | 3 Nummern 4,95 €/Monat | in Kanalpauschale: 10 Kanäle 16,77 €/Monat | über die Open-Source-Brücke `sipgate-sip-stream-bridge` (spricht dasselbe Protokoll wie Twilio) | 9,9 ct | Frankfurt + Düsseldorf |
| Telnyx | ab 1,00 $/Monat | DE-Preis nicht belegt | 0,0035 $/Min | nicht belegt | SIP in Frankfurt |
| Vonage | nur auf Anfrage | nicht belegt | 0,005 $/Min | – | **Weiterverkauf von Nummern verboten** |

**Empfehlung:** In Phase 2 mit **Twilio (Region Irland)** starten — die
Testnummer ist per API in Minuten da, Media Streams gehen direkt an
unseren Server, die Doku ist die beste. Weil die sipgate-Brücke dasselbe
Protokoll spricht, ist der **Wechsel zu sipgate** ohne Umbau möglich, sobald
es sich lohnt (ab ~10 Betrieben: spart ~0,014 $ pro Minute, deutscher
Anbieter).

Zwei Dinge, die für jeden Anbieter gelten:
- **Ortsnetz-Nummern brauchen eine Adresse im selben Ortsnetz** (BNetzA).
  Pro Kunde wird die Nummer auf das Restaurant registriert —
  Gewerbeanmeldung nötig. Für die Testnummer reicht Kurani Design in Norden.
- **Die Umleitung zahlt das Restaurant** als abgehendes Gespräch. Auf eine
  *Festnetznummer* ist das in den üblichen Festnetz-Flatrates drin, auf
  eine Handynummer nicht. Deshalb: Ortsnetz-Nummer, keine 032, kein Handy.

### Spracherkennung (Streaming)

| Modell | $/Min | DE / TR / AR, Sprachwechsel | EU |
|---|---|---|---|
| **Deepgram Nova-3 multi** | 0,0058 | 10 Sprachen mit Wechsel inkl. DE; **TR und AR nur einzeln** | EU-Endpunkt (GA) |
| **Soniox RT** | ~0,0020 | 60+ inkl. DE/TR/AR, Wechsel im Gespräch | EU-Region |
| Speechmatics RT | 0,0040–0,0072 | 55+ inkl. TR/AR | EU |
| Gladia Solaria-1 | ab 0,0042 (Vorauszahlung) | 100+, Wechsel | EU (Frankreich) |
| ElevenLabs Scribe v2 RT | 0,0065 | 90+, Wechsel | EU nur Enterprise |
| Azure (Frankfurt) | 0,0217 inkl. Spracherkennung | ja | Germany West Central |

**Empfehlung:** Start mit **Deepgram Nova-3** (am meisten erprobt für
deutsche Telefon-Audio, EU-Endpunkt), in Phase 2 **Soniox daneben messen** —
wegen Türkisch/Arabisch mit automatischer Erkennung. Unabhängige
Messungen für 8-kHz-Telefon-Deutsch habe ich keine gefunden; entscheiden
werden unsere eigenen Testanrufe.

### Sprachmodell (das „Gehirn“)

| Modell | Eingabe / Ausgabe pro 1 Mio. Tokens | Zwischengespeichert | ≈ $/Gesprächsminute |
|---|---|---|---|
| **Claude Haiku 4.5** | 1 $ / 5 $ | 0,10 $ | **≈ 0,015** |
| Claude Sonnet 5.5 | 2 $ / 10 $ | 0,20 $ | ≈ 0,03 |

Rechnung für ein 3-Minuten-Bestellgespräch: Speisekarte + Regeln
≈ 7,5–11,5 Tausend Tokens, die bei jedem der ~16 Modellaufrufe mitgehen —
zu ~90 % aus dem Zwischenspeicher. Pro Gesprächsminute ≈ 45–65 Tausend
Eingabe-Tokens und ≈ 250 Ausgabe-Tokens. Damit der Zwischenspeicher
greift, steht die Karte immer **byte-gleich am Anfang**; Uhrzeit und
Anrufernummer kommen ans Ende.

**Empfehlung:** **Claude Haiku 4.5** für das Live-Gespräch — schnell,
günstig, gut mit Werkzeugen. In den 20+ Testgesprächen läuft **Sonnet 5.5
zum Vergleich**; gewählt wird nach gemessener Qualität und Antwortzeit.
EU: Haiku 4.5 läuft über **AWS Bedrock mit dem EU-Profil** (Frankfurt,
Paris, Stockholm …, Daten bleiben in der EU). Ob AWS dafür einen Aufschlag
nimmt: nicht geprüft.

### Stimme (Streaming)

| Modell | Preis | ≈ $/Gesprächsminute | Sprachen | erster Ton (Hersteller) | EU |
|---|---|---|---|---|---|
| **ElevenLabs Flash v2.5** | 0,05 $ / 1.000 Zeichen | 0,0188 | DE/TR/AR | ~75 ms | nur Enterprise |
| **Cartesia Sonic-3.6** | 1 Credit/Zeichen, ab 49 $/Monat | 0,014–0,019 | DE/TR/AR | 90 ms | EU-Endpunkt |
| **Azure Neural** | 15 $ / 1 Mio. Zeichen | 0,0056 | DE/TR/AR | < 300 ms | **Frankfurt** |
| Google Chirp 3 HD | 30 $ / 1 Mio. | 0,0113 | DE/TR/AR | nicht belegt | nicht belegt |
| Deepgram Aura-2 | 0,03 $ / 1.000 | 0,0113 | DE, **kein TR/AR** | 90–200 ms | ja |

Annahme: der Agent spricht die halbe Zeit, ~750 Zeichen pro Minute
eigener Rede → ~375 Zeichen pro Gesprächsminute.

**Empfehlung:** Die Stimme ist Gestaltung — **du entscheidest nach Gehör.**
In Phase 2 bekommst du dieselben drei Sätze in ElevenLabs, Cartesia und
Azure als Hörprobe übers echte Telefon. Die Architektur lässt alle drei zu.

### Steuerung der Pipeline (Framework)

| | **Pipecat** (Python, Open Source) | LiveKit Agents |
|---|---|---|
| Telefon | Twilio-Media-Streams direkt → passt zu Twilio **und** zur sipgate-Brücke | eigener SIP-Server, beliebiger Trunk |
| Sprecherwechsel | Smart Turn v3, offen, 23 Sprachen inkl. DE/TR/AR | Turn-Detector, 14 Sprachen inkl. DE/TR/AR |
| Betrieb | eigener Server in Frankfurt, keine Minutengebühr | selbst (mehr Teile) oder Cloud 0,01 $/Min + 0,004 $ SIP |

**Empfehlung:** **Pipecat auf einem eigenen Server in Frankfurt.** Weniger
Teile, keine Minutengebühr, und es spricht genau das Protokoll, das Twilio
und die sipgate-Brücke liefern.

### Backend und App

| Teil | Wahl | Kosten |
|---|---|---|
| Supabase | **eigenes Projekt in Frankfurt** (nicht das von Kiek mol in) | Pro 25 $/Monat inkl. 10 $ Rechenzeit (reicht für „Micro“); Realtime: 5 Mio. Nachrichten inkl. |
| Supabase Swift SDK | v2.55.3 (29.09.2026), braucht iOS 16+, Xcode 26+, Swift 6.2+ | – |
| Xcode | 27 (seit 14.09.2026), Swift 6.4, braucht macOS 26.6+; kleinstes Ziel iOS 17 | – |
| iOS-Simulator im Chat | GitHub-Runner `xcode-27` (iOS-27-Simulator, Vorschau) | 0 € — das Repo ist öffentlich |
| Apple Developer Program | für Push, Live Activities, TestFlight | 99 $/Jahr |
| Agent-Server Frankfurt | 4 Kerne / 8 GB | ca. 20–50 €/Monat (**Schätzung, nicht geprüft**) |

---

## 3. Was kostet ein Betrieb im Monat?

Annahme: **300 Anrufe × 2,5 Minuten = 750 Agent-Minuten** (Überlauf-Betrieb
einer gut laufenden Pizzeria; nicht gemessen — im Pilot messen wir das).

| Variante | $/Min | 750 Min | ≈ € (Kurs-Annahme) |
|---|---|---|---|
| **A Qualität** — Twilio + Deepgram + Haiku + ElevenLabs | 0,054 | 41 $ | ≈ 35 € |
| A Sparsam — sipgate + Soniox + Haiku + Azure | 0,023 (+ Kanalpauschale) | 17 $ + Anteil 16,77 € | ≈ 16–20 € |
| B OpenAI gpt-realtime-2.1 (+ SIP) | 0,06 (Dritte: bis 0,11) | 45–83 $ | ≈ 39–71 € |
| C ElevenLabs Agents | ≈ 0,10 | 77 $ | ≈ 66 € |
| C sipgate Flow (eigenes LLM) | ≈ 0,10 € | – | ≈ 75–85 € |
| C Vapi / Retell / Synthflow | 0,11–0,25 | 82–188 $ | ≈ 70–160 € |

Dazu je Betrieb: Nummer (1,35 $ bzw. ~1,65 €), Anteil Server und Supabase.

**Achtung SMS:** Eine Bestätigungs-SMS kostet 0,10–0,11 €. Bei 300
Bestellungen/Reservierungen sind das **~30–34 € im Monat — so viel wie die
ganze KI.** Vorschlag: SMS bei Reservierungen an, bei Bestellungen
abschaltbar; ab Phase 4 WhatsApp als günstigere Bestätigung.

---

## 4. Latenz-Budget (geschätzt, nicht gemessen)

| Schritt | Zeit |
|---|---|
| Gast hört auf zu sprechen → Sprecherwechsel erkannt | 200–400 ms |
| letzter Text der Spracherkennung | läuft parallel, ~100 ms danach |
| Claude Haiku: erstes Wort (Karte aus dem Zwischenspeicher) | 300–700 ms |
| Stimme: erster Ton | 75–300 ms |
| Telefonnetz hin und zurück | 100–200 ms |
| **Summe** | **≈ 0,8–1,3 s** |

Tricks, die wir einbauen: Antwort satzweise sprechen, Begrüßung
vorproduziert, „Einen Moment, ich schaue nach“ wenn ein Werkzeug länger
braucht, Modell schon bei vorläufigem Text anstoßen. **Jeder Anruf
protokolliert seine echte Antwortzeit** (Gast still → erster Ton) — die
Zahl steht im Admin-Bereich, nicht im Prospekt.

---

## 5. Was ich für Phase 2 messen will

1. Antwortzeit pro Gesprächswechsel — Ziel: Median < 1 s, 90 % < 1,5 s.
2. Erkennung: 20 echte Testanrufe (auch mit Nuscheln, Lärm, Akzent),
   Deepgram gegen Soniox; gezählt werden falsch verstandene Gerichte,
   Nummern und Adressen.
3. Stimmen-Hörprobe: drei Anbieter, du entscheidest.
4. Kosten pro Anruf aus den echten Rechnungsdaten der Anbieter, nicht aus
   dieser Tabelle.

---

## Quellen (alle gesehen am 01.10.2026)

- Twilio: twilio.com/en-us/voice/pricing/de · /sip-trunking/pricing/de · /sms/pricing/de · /guidelines/de/regulatory · /changelog/media-streams-available-in-ie1-and-au1
- sipgate: sipgate.de Preisliste (Stand Mai 2026) · sipgatetrunking.de/rufnummern · sipgate.io/preise · sipgate.de/flow · help.sipgate.de (AI Agents Tarife) · github.com/sipgate/sipgate-sip-stream-bridge
- Telnyx: telnyx.com/pricing/voice-api · /pricing/voice-ai-agents · support.telnyx.com (DE-Anforderungen)
- Vonage: api.support.vonage.com (DE-Nummern)
- OpenAI: developers.openai.com/api/docs/models/gpt-realtime-2.1 · /pricing · /guides/your-data · /guides/realtime-sip
- Google: cloud.google.com/vertex-ai/generative-ai/pricing (direkt gelesen)
- Artificial Analysis (Latenz-Benchmark): x.com/ArtificialAnlys
- ElevenLabs: elevenlabs.io/pricing/agents · /pricing/api · /docs/overview/administration/data-residency
- Deepgram: deepgram.com/pricing · /learn/deepgram-eu-endpoint-now-generally-available
- Soniox: soniox.com/pricing · soniox.com/europe
- Cartesia: cartesia.ai/pricing
- Azure: github.com/MicrosoftDocs/azure-ai-docs (regions.md, 30.09.2026)
- Preis-Datensatz: github.com/mahimailabs/voice-prices (prices/data.json)
- Pipecat: daily.co/pricing/pipecat-cloud · github.com/pipecat-ai/smart-turn
- LiveKit: livekit.com/pricing · docs.livekit.io (Telefonnummern, Datenresidenz)
- Claude: Preise laut Anthropic-Modellübersicht (Stand 25.09.2026) · docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html
- Supabase: Doku-Quelltext auf GitHub · github.com/supabase/supabase-swift/releases
- Apple: developer.apple.com (Xcode 27, Live Activities, Benachrichtigungen)
- GitHub-Runner: github.com/actions/runner-images/issues/14404
