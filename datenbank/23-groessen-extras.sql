-- EXTRA-ZUTATEN AN EINE GROESSE BINDEN
--
-- Gemeldet am 03.09.2026 mit zwei Bildern der Bestellseite von Pizzeria
-- Pronto Riepe: bei der Pizza Margherita stehen ZWEI Extra-Listen
-- untereinander --
--
--     "Extra Zutaten"                 alle + 1,50 EUR
--     "Extra Zutaten kleine Pizza"    alle + 1,00 EUR
--
-- -- und zwar beide gleichzeitig, egal ob der Gast klein oder gross
-- gewaehlt hat. Er kann also zur grossen Pizza die Zutaten zum
-- Kleinpreis anklicken.
--
-- Ibo dazu: "ich will wenn ich klein oder gross waehle so muessen die
-- extra zutaten kommen".
--
-- Der Grund: die Groessen stehen im JSON-Feld menu_items.sizes, die
-- Extra-Gruppen in menu_option_groups. Zwischen beiden gab es KEINE
-- Verbindung -- die Zugehoerigkeit stand nur im Namen, und den liest
-- kein Code.
--
-- Diese Spalte stellt die Verbindung her.
--
--   size_name IS NULL  ->  Gruppe gilt fuer alle Groessen (wie bisher)
--   size_name = 'klein' ->  nur wenn die Groesse "klein" gewaehlt ist
--
-- Bewusst additiv: alle bestehenden Gruppen bleiben NULL und verhalten
-- sich damit genau wie heute. Es aendert sich erst etwas, wenn im
-- Dashboard bei einer Gruppe eine Groesse eingetragen wird.
--
-- Einspielen: Supabase -> SQL Editor -> einfuegen -> Run.

alter table menu_option_groups
  add column if not exists size_name text;

comment on column menu_option_groups.size_name is
  'Name der Groesse aus menu_items.sizes, fuer die diese Gruppe gilt. NULL = gilt fuer alle Groessen.';

-- Nachsehen, was jetzt drinsteht:
-- select name, size_name from menu_option_groups order by sort_order;
