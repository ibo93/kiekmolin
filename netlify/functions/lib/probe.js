// WAS EINE PROBE IST -- AN GENAU EINER STELLE.
//
// Die Gastweg-Wache legt alle 15 Minuten echte Bestellungen an, um zu
// sehen, ob die Tuer fuer Gaeste offen ist. Die Proben leben ein paar
// Sekunden und werden danach geloescht.
//
// EIN PAAR SEKUNDEN SIND GENUG, UM IN EINER ECHTEN KUECHE ANZUKOMMEN.
//
// Am 06.10.2026 nachgesehen, beim Bau der Tisch-Probe: vier Stellen holen
// neue Bestellungen ab und reichen sie an echte Geraete weiter --
//
//   pos-print     der Bondrucker in der Kueche (holt alle paar Sekunden
//                 die aelteste ungedruckte Bestellung)
//   pos-orders    die Schnittstelle, an der Kassensysteme abholen
//   winorder      die WinOrder-Kasse
//   index.html    das Dashboard: Ton, Hinweis, Vollbild-Alarm, Push
//
// KEINE davon hat Proben uebersprungen. Ob es je passiert ist, laesst sich
// von hier nicht messen -- in den Protokollen steht kein Bestellinhalt.
// Aber der Weg war offen, seit die Wache am 25.08.2026 angefangen hat,
// und eine dritte Probe (Tisch 99) haette ihn breiter gemacht.
//
// Ein Wirt, dem jede Viertelstunde eine Bestellung ueber 0 Euro "Tisch 99"
// aus dem Drucker kommt, schaltet zuerst den Drucker aus und danach die
// App. Das waere der teuerste Kanarienvogel der Welt.
//
// WARUM AM NAMEN UND NICHT AN EINER SPALTE
// Eine eigene Spalte (is_probe) muesste es in der Datenbank erst geben --
// und fehlt sie, wirft der selbstheilende Insert in order-save sie still
// heraus. Dann waere die Probe wieder eine ganz normale Bestellung, ohne
// dass es irgendwer merkt. Der Name kommt immer an.

'use strict';

// Steht beim Anlegen (gastweg-wache), beim Aufraeumen und ueberall, wo
// Proben uebersprungen werden. Wer ihn aendert, aendert ihn hier.
var PROBE_NAME = '[Probe] Gastweg-Wache';

// Am Anfang erkennen, nicht irgendwo im Namen: ein Gast, der sich
// "Max [Probe]" nennt, ist trotzdem ein Gast und bekommt seinen Bon.
var KENNZEICHEN = '[Probe]';

function istProbe(bestellung) {
    if (!bestellung || typeof bestellung !== 'object') return false;
    var name = bestellung.customer_name != null ? bestellung.customer_name : bestellung.guest_name;
    return String(name == null ? '' : name).indexOf(KENNZEICHEN) === 0;
}

module.exports = { PROBE_NAME: PROBE_NAME, KENNZEICHEN: KENNZEICHEN, istProbe: istProbe };
