-- 29 — Der Mittagstisch, den der Wirt JEDEN TAG neu einträgt.
--
-- Ibo am 07.09.2026: "menü erstellen ist doch kein mittagstisch ... mittagstisch
-- was der gastronom heute anbietet 5 gerichte beispiel vorspeise, hauptgericht,
-- dessert oder mehrere hauptgerichte -- da ändert sich ständig."
--
-- ER HAT RECHT, UND DAS WAR MEIN FEHLER.
-- Was ich im September als "Mittagstisch" gebaut habe, war eine Kategorie mit
-- Zeitfenster. Die loest "nur von 11 bis 14 Uhr sichtbar" -- aber nicht
-- "heute diese fuenf, morgen andere". Das Taegliche fehlte komplett.
--
-- NACHGESEHEN STATT NEU GEBAUT: die Tabelle daily_specials kann das laengst.
-- Sie hat eine date-Spalte, also eine Zeile pro Gericht pro Tag, und die
-- Gastseite liest sie schon -- mehrere, mit Zeitfenster. Was fehlte, war nur
-- der schnelle Weg, fuenf Zeilen auf einmal einzutragen: das Formular legt
-- genau EINES an, und danach ist es wieder leer.
--
-- WOZU DIESE SPALTE
-- Beim Veroeffentlichen muss der Mittagstisch von gestern weg, sonst stehen
-- morgen zehn Gerichte da. "Alle Zeilen dieses Tages loeschen" waere aber zu
-- grob -- ein normales Tagesangebot ("Schnitzel-Tag") liegt in derselben
-- Tabelle am selben Datum und wuerde stillschweigend mit verschwinden.
--
-- Also bekommt der Mittagstisch ein Merkmal. Ersetzt wird nur, was er selbst
-- angelegt hat. Alles ohne Merkmal bleibt unangetastet.

alter table public.daily_specials
    add column if not exists sorte text;

comment on column public.daily_specials.sorte is
    'Woher die Zeile stammt: "mittagstisch" fuer die Tagesliste, leer fuer ein einzelnes Tagesangebot. Beim Veroeffentlichen wird nur die eigene Sorte ersetzt.';
