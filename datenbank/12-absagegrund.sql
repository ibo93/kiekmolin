-- Schritt 12 -- WARUM HAT DER GAST ABGESAGT?
--
-- Ich hatte nach Schritt 11 geschrieben: "es gibt keine 12". Das
-- stimmte fuer das Zusperren -- alle vier Tabellen sind zu und daran
-- aendert sich nichts mehr. Das hier ist keine Regel, sondern eine
-- Spalte.
--
--
-- WARUM
-- -----
-- Der Wirt sieht seit heute, DASS abgesagt wurde. Er fragte sofort das
-- Naheliegende nach: "und warum haben die abgesagt... das ist auch
-- wichtig".
--
-- Er hat recht, und zwar geschaeftlich: fuenf Absagen wegen Krankheit
-- sind ein Zufall. Fuenf Absagen mit "beim letzten Mal nicht
-- zufrieden" sind ein Problem, das er sonst nie erfaehrt -- weil
-- niemand anruft, um sich zu beschweren. Die Leute kommen einfach
-- nicht wieder.
--
--
-- WAS HIER PASSIERT
-- -----------------
-- Eine neue Spalte, die leer sein darf. Keine Regel wird angefasst,
-- keine bestehende Zeile veraendert. Bestehende Absagen bleiben ohne
-- Grund -- den kann niemand mehr nachtragen.
--
-- Gefuellt wird sie ausschliesslich von /.netlify/functions/res-cancel,
-- und die nimmt nur sechs feste Schluessel an. Freitext von aussen
-- kommt hier nicht herein: die Absageseite ist ueber einen Link
-- erreichbar, und ein offenes Textfeld an so einer Stelle landet
-- irgendwann als Werbung im Dashboard des Wirts.
--
--
-- RUECKNAHME (nur falls wirklich noetig -- loescht die gesammelten Gruende):
--     alter table public.reservations drop column if exists cancel_reason;

alter table public.reservations
    add column if not exists cancel_reason text;


-- Gegenprobe. Erwartet: eine Zeile, cancel_reason / text.
select column_name as spalte, data_type as art, is_nullable as darf_leer_sein
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'reservations'
   and column_name = 'cancel_reason';
