# Spracherkennung: welcher Dienst kann Kurmancî?

**Nicht gemessen.** THECHEF.md verlangt, das VOR dem Bau zu testen. Ohne
Audio-Aufnahmen von Muttersprachlern lässt es sich nicht beurteilen – also:

1. Halil (und ein zweiter Sprecher) spricht je Sprache 20 Sätze ein, die in
   der Küche vorkommen: Zahlen („çar“, „du kîlo“, „bîst û pênc“),
   Mengen mit Einheit („sê sindoq bacanên sor“), eine Frage an den Assistenten.
   Handy-Mikrofon, echte Küchengeräusche.
2. Jede Aufnahme durch beide Anbieter schicken (`STT_ANBIETER=openai` bzw.
   `elevenlabs`, Funktion `sprache`), Ergebnis neben den gesprochenen Text.
3. Zählen: Anteil der Sätze, bei denen `zahlLesen()` die richtige Zahl liefert,
   und Anteil wörtlich richtiger Sätze.

| Sprache | Anbieter | Zahl richtig | Satz richtig |
|---|---|---|---|
| ku | openai | – | – |
| ku | elevenlabs | – | – |
| tr / ar / de | … | – | – |

Entscheidung erst mit dieser Tabelle. Bis dahin gilt in der App: das Erkannte
wird IMMER angezeigt („„çar“ → 4“), Tippen geht immer.
