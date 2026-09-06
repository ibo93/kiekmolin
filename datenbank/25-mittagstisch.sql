-- SCHRITT 25: Zeitfenster an der Kategorie -- der Mittagstisch.
--
-- Ibo am 04.09.2026: "bei mittags ein komplettes menue mit mehre
-- gerichte das man es einfuegen -- oder einzeln bei angebot hat man nur
-- ein gericht".
--
-- Der EINZEL-Fall existiert schon (daily_specials, publishDailyOffer).
-- Was fehlte: MEHRERE Gerichte, zeitlich begrenzt. Das ist eine
-- Kategorie mit Zeitfenster -- der Wirt kennt Kategorien, kann Gerichte
-- hineinschieben und sie mit den Pfeilen sortieren.
--
-- Ohne diese Spalten laeuft alles unveraendert weiter: die App prueft
-- auf zeit_von/zeit_bis und behandelt eine Kategorie ohne Fenster als
-- "immer sichtbar". Das Anlegen mit Zeiten schlaegt dann fehl und sagt
-- es; die bestehenden Kategorien merken nichts davon.

-- 1. Vorher nachsehen.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name   = 'menu_categories'
 order by ordinal_position;

-- 2. Anlegen.
--
--    'time' und nicht 'timestamp': gemeint ist eine Uhrzeit, die JEDEN
--    Tag gilt, kein einzelner Zeitpunkt.
--
--    wochentage als integer[]: 0 = Montag ... 6 = Sonntag, so wie der
--    Wirt zaehlt. Leer oder NULL heisst "taeglich" -- der haeufigste
--    Fall braucht damit keinen Eintrag.
alter table public.menu_categories
  add column if not exists zeit_von   time,
  add column if not exists zeit_bis   time,
  add column if not exists wochentage integer[];

-- 3. Gegenprobe: die Spalten sind da, und keine bestehende Kategorie hat
--    aus Versehen ein Fenster bekommen.
select count(*) as kategorien,
       count(zeit_von) as mit_zeitfenster
  from public.menu_categories;

-- HINWEIS ZUM UEBER-MITTERNACHT-FALL
--
-- 22:00 bis 02:00 ist erlaubt und gewollt (Nachtangebot). Die App
-- rechnet das richtig: liegt "von" hinter "bis", gilt das Fenster ab
-- 22 Uhr ODER bis 2 Uhr. Eine Pruefung "von < bis" waere hier also
-- falsch und wird bewusst NICHT gesetzt.
