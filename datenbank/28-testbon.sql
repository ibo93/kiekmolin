-- 28 — Ein Testbon, den der Wirt selbst auslösen kann.
--
-- Ibo am 07.09.2026: "Es ist auch alle eingetragen alles ist auch gut aber
-- kein bon kommt raus."
--
-- Gemessen ist alles bis zur Uebergabe in Ordnung: Bestellung 16:56:26 rein,
-- Bon 16:56:33 vom Drucker abgeholt. Der Drucker nimmt ihn und wirft ihn weg.
--
-- Warum, kann ich von hier nicht sehen. Und ich kann auch nicht in seinen
-- Drucker schauen. Also muss er es selbst messen koennen -- mit EINEM Knopf,
-- nicht mit einer Anleitung.
--
-- DER GEDANKE DAHINTER:
--   Testbon EINFACH  -> nur "TEST" und abschneiden. Keine Schriftgroessen,
--                       kein QR, keine Umlaute. Kommt der raus, ist das
--                       Geraet in Ordnung und unser Bon-Inhalt schuld.
--   Testbon ECHT     -> derselbe Bon wie im Betrieb, mit allem drin.
--                       Kommt der EINFACHE raus und dieser nicht, wissen
--                       wir auf einen Schlag, dass es am XML liegt.
--
-- Genau dieser Fehler war schon einmal da: ein lang="de" im Bon, das der
-- Epson nicht kennt. Ein einziges unzulaessiges Attribut macht das ganze
-- Dokument ungueltig, und der Drucker verwirft es wortlos.
--
-- EINE SPALTE, KEINE TABELLE. Sie wird im ohnehin vorhandenen SELECT
-- mitgelesen -- null zusaetzliche Anfragen bei 24.000 Abrufen am Tag.
--
-- WICHTIG: pos-print.js loescht den Wert, BEVOR es den Testbon ausliefert.
-- Bliebe er stehen, druckte das Geraet alle paar Sekunden erneut und waere
-- in einer Viertelstunde durch die ganze Rolle.

alter table public.restaurants
    add column if not exists printer_test_art text;

comment on column public.restaurants.printer_test_art is
    'Angefordeter Testbon: "einfach" oder "echt". Wird beim naechsten Abruf des Druckers ausgeliefert und sofort auf null gesetzt.';
