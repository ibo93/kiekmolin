# Recht & Datenschutz

Stand 01.10.2026. **Das ist keine Rechtsberatung**, sondern eine
Recherche, damit das Gespräch mit dem Anwalt kurz wird. Primärquellen
(EUR-Lex, gesetze-im-internet.de) hat der Proxy gesperrt; die Aussagen
stammen aus Zusammenfassungen von Kanzleien und Fachseiten. Wo die Lage
unklar ist, steht das dabei.

## Was wir von Anfang an einbauen

| Pflicht | Wie wir sie erfüllen |
|---|---|
| **KI-Hinweis** (AI Act Art. 50 Abs. 1, gilt seit 02.08.2026, **nicht verschoben**) | Erster Satz jeder Begrüßung; nicht abschaltbar; pro Gespräch protokolliert (`ai_notice_played`). Laut Kommissions-Leitlinien vom 20.07.2026: gesprochen, am Anfang, bei langen Gesprächen wiederholen; ein Signalton reicht nicht |
| **Wer ist „Anbieter“ im Sinne des AI Act?** | Vermutlich du (Kurani Design baut das System), der Wirt ist „Betreiber“. Zuständig in Deutschland: Bundesnetzagentur (KI-MIG seit 29.07.2026) |
| **Aufnahme** (§ 201 StGB) | **Standard aus.** Nur mit Hinweis + Einwilligung im Gespräch. Audio wird sonst nur im Speicher verarbeitet, nie abgelegt |
| **Transkript** (DSGVO) | Standard an, mit Löschfrist (30 Tage), abschaltbar. Die Rechtsgrundlage ist **umstritten** (siehe unten) |
| **Datenminimierung** | Kein Gäste-Profil in v1; Kontaktdaten nur an Bestellung/Reservierung; Löschfristen pro Betrieb |
| **EU-Hosting** | Supabase Frankfurt, Agent-Server Frankfurt, Claude über AWS EU, Spracherkennung mit EU-Endpunkt |
| **Auftragsverarbeitung** (Art. 28) | AVV zwischen dir und jedem Betrieb, mit Liste der Unterauftragsverarbeiter und Widerspruchsrecht bei neuen |
| **SMS-Bestätigung** | Rein sachlich (Bestellung/Reservierung) braucht keine Werbe-Einwilligung — **sobald Werbung drinsteht, auch eine Bitte um Bewertung, schon** (BGH VI ZR 225/17, für E-Mail entschieden) |
| **Allergene am Telefon** | Nur aus der gepflegten Karte (schriftliche Dokumentation, § 4 LMIDV). Bei fehlender Angabe: „Das kann ich Ihnen nicht sicher sagen“ |

## Wo die Rechtslage unklar ist

1. **Transkript ohne Aufnahme — fällt das unter § 201 StGB?** Die meisten
   Fachautoren sagen: Echtzeit-Transkription ohne gespeichertes Audio ist
   keine „Aufnahme“. Eine Minderheit sieht ein Wort-für-Wort-Transkript wie
   eine Aufnahme. **Kein Urteil gefunden.**
2. **Rechtsgrundlage fürs Transkript.** Der Europäische
   Datenschutzausschuss (Leitlinien 02/2021) sieht Verarbeitung zur
   Erfüllung des Gast-Wunsches unter Art. 6 Abs. 1 b. Die sächsische
   Aufsicht verlangt für Wort-für-Wort-Transkripte eine Einwilligung, eine
   Zusammenfassung ginge über berechtigtes Interesse. → Darum ist das
   Transkript pro Betrieb abschaltbar, und die Zusammenfassung geht auch
   ohne.
3. **Fernmeldegeheimnis (§ 3 TDDDG).** Ob du als „geschäftsmäßiger“
   Telekommunikationsanbieter giltst oder nur Endpunkt im Auftrag des
   Restaurants bist: nichts dazu gefunden.
4. **Allergene beim Fernabsatz (Art. 14 LMIV).** Die Information muss
   *vor* Abschluss der Bestellung verfügbar sein. Gerichte haben bezweifelt,
   dass eine Telefon-Hotline reicht (LG Berlin 16 O 304/17). Ob eine KI,
   die auf Nachfrage vorliest, genügt: ungeklärt.
5. **Datenübermittlung in die USA.** Das EU-US Data Privacy Framework hat
   das EuG am 03.09.2025 bestätigt; die Berufung (C-703/25 P) läuft. Fällt
   es, braucht jeder US-Dienst (Twilio, ElevenLabs, Anthropic/AWS) einen
   Plan B. Darum: wo möglich EU-Anbieter oder EU-Region.

## Verbraucherrecht bei Telefonbestellungen

- Telefonbestellung ist Fernabsatz — **außer** das Restaurant liefert
  selbst im Rahmen häufiger, regelmäßiger Fahrten („Pizzaklausel“, § 312
  Abs. 2 Nr. 8 BGB).
- Kein Widerrufsrecht für verderbliche Ware (§ 312g Abs. 2 Nr. 2).
- Am Telefon mindestens: wesentliche Merkmale, wer der Verkäufer ist,
  Gesamtpreis (Art. 246a § 3 EGBGB). Der Rest per SMS/E-Mail;
  Bestätigung auf dauerhaftem Datenträger (§ 312f Abs. 2). → Unsere
  Zusammenfassung nennt Restaurant, Positionen und Gesamtpreis; die
  SMS-Bestätigung ist der dauerhafte Datenträger.

## Liste für den Anwalt

1. Reicht Echtzeit-Transkription ohne gespeichertes Audio, um § 201 StGB
   nicht zu berühren — auch wenn ein Anbieter kurz zwischenspeichert? Macht
   ein Hinweis am Gesprächsanfang die Verarbeitung „befugt“?
2. Rechtsgrundlage und Löschfrist für Wort-für-Wort-Transkripte gegenüber
   strukturierten Bestelldaten (EDPB vs. sächsische Aufsicht).
3. Genauer Wortlaut der Begrüßung: KI-Hinweis (Art. 50) **und**
   Datenschutz-Information (Art. 13 DSGVO) in wenigen Sekunden — geht ein
   Kurzhinweis mit Verweis (z. B. auf SMS/Webseite)?
4. Deine Rollen: AI-Act-Anbieter und DSGVO-Auftragsverarbeiter; AVV-Vorlage;
   darfst du Gesprächsdaten zur Verbesserung nutzen?
5. Übermittlung an US-Dienste: DPF oder Standardvertragsklauseln +
   Folgenabschätzung; Plan B, falls C-703/25 P das DPF kippt.
6. Gilt § 3 TDDDG oder eine Meldepflicht nach TKG für dich?
7. Allergen-Auskunft durch eine KI am Telefon: genügt das Art. 14 LMIV /
   § 4 LMIDV — und wer haftet bei einer falschen Auskunft?
8. Pizzaklausel je Betrieb, Informations- und Bestätigungspflichten.
9. Braucht es eine Datenschutz-Folgenabschätzung (DSFA)?
10. Haftungsbegrenzung und Versicherung in deinen B2B-AGB als
    Einzelunternehmer (Fehlbestellung, entgangene Reservierung).

## Quellen

- AI Act Art. 50: ai-act-law.eu/article/50 · activemind.legal · White & Case (Omnibus, VO 2026/1744) · Bird & Bird / Faegre Drinker / Stephenson Harwood (Leitlinien 20.07.2026) · bundesnetzagentur.de/1112336
- § 201 StGB: dejure.org · haufe.de · unternehmensstrafrecht.de · BB 2026, 1100
- EDPB-Leitlinien 02/2021 (virtuelle Sprachassistenten) · datenschutz-notizen.de (sächsische Aufsicht)
- TDDDG §§ 3, 15: dejure.org
- BGH VI ZR 225/17 · IHK Rhein-Neckar
- DPF: curia.europa.eu (Pressemitteilung T-553/23) · WilmerHale · digitalpolicyalert.org
- LMIDV/LMIV: lgl.bayern.de · it-recht-kanzlei.de · vzbv.de
- Fernabsatz: koehrer.de (Pizzaklausel) · lxgesetze.de (Art. 246a § 3 EGBGB)
