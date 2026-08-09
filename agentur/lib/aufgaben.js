'use strict';

// Monats-Aufgabenliste pro Kunde: leitet aus dem letzten Report die
// konkreten Handgriffe ab, die diesen Monat die Sichtbarkeit am staerksten
// heben. So sieht Ibo auf einen Blick, was zu tun ist - und hat nach dem
// Abhaken den Nachweis fuer den Wirt.
//
// Bewusst OHNE KI-Aufruf: schnell, kostenlos, immer gleich nachvollziehbar.
// Jede Aufgabe ist datengedeckt (kommt aus echten Report-Zahlen) und nennt
// den Hebel, den Aufwand und WARUM sie hilft.

// Stabile ID pro Aufgabentyp - damit "erledigt"-Haken monatsstabil sind.
function baueAufgaben(kontext) {
  const k = kontext || {};
  const erg = k.ergebnis || null;
  const fragen = (erg && erg.fragen) || [];
  const basis = (erg && erg.basis) || {};
  const aufgaben = [];

  const zaehle = (pruef, status) => fragen.filter((f) => f[pruef] && f[pruef].status === status).length;

  // --- Hebel 1: Maschinenlesbar im Netz (laeuft groesstenteils automatisch,
  //     aber Luecken in Website/Schema muss ein Mensch schliessen) ---
  if (basis.website && basis.website.status === 'manuell') {
    aufgaben.push({
      id: 'website-anlegen', hebel: 'Sichtbarkeit', prio: 'mittel', aufwand: '—',
      titel: 'Eigene Website / Landing-Page prüfen',
      warum: 'KI-Assistenten lesen bevorzugt eigene Seiten. Fehlt eine, hat der Betrieb weniger, worüber KI ihn empfehlen kann.'
    });
  } else if (basis.website && basis.website.jsonLd === false) {
    aufgaben.push({
      id: 'website-schema', hebel: 'Sichtbarkeit', prio: 'mittel', aufwand: '10 Min',
      titel: 'Schema.org-Markup in die Website einbauen',
      warum: 'Fertiges JSON-LD liegt im Ordner „Aufbereitung". Macht die Seite für Google und KI eindeutig lesbar.'
    });
  }
  if (basis.kiekmolin && basis.kiekmolin.jsonLd === false) {
    aufgaben.push({
      id: 'kiekmolin-schema', hebel: 'Sichtbarkeit', prio: 'mittel', aufwand: '5 Min',
      titel: 'Kiek-mol-in-Profil vervollständigen (Beschreibung, Speisekarte)',
      warum: 'Je vollständiger das Profil, desto mehr maschinenlesbarer Text – die Basis für jede KI-Empfehlung.'
    });
  }

  // --- Hebel 2: Google-Business-Profil (schnellster Hebel, monatlich) ---
  // Zeitkritische Anlaesse des Monats zuerst nennen - danach suchen Gaeste.
  const anlaesse = k.monatsZahl
    ? require('../../sichtbarkeit/lib/anlaesse').anlaesseFuerMonat(k.monatsZahl)
    : [];
  if (anlaesse.length) {
    aufgaben.push({
      id: 'anlass-post', hebel: 'Google', prio: 'hoch', aufwand: '5 Min',
      titel: 'Anlass-Beitrag posten: ' + anlaesse.map((a) => a.name).slice(0, 2).join(' / '),
      warum: anlaesse[0].aufhaenger + ' ' + anlaesse[0].tipp + ' (Fertiger Text in der Aufbereitung, ganz oben.)'
    });
  }
  aufgaben.push({
    id: 'google-posts', hebel: 'Google', prio: 'hoch', aufwand: '5 Min',
    titel: 'Google-Business-Beiträge einstellen',
    warum: 'Liegen fertig in „Aufbereitung erzeugen" (google-posts.md). Aktive Profile belohnt Google in Tagen – der schnellste Hebel.'
  });
  const googleWeg = zaehle('google', 'nicht-gefunden');
  if (googleWeg > 0) {
    aufgaben.push({
      id: 'gbp-optimieren', hebel: 'Google', prio: 'hoch', aufwand: '15 Min',
      titel: 'Google-Business-Profil schärfen (Kategorien, Fotos, Öffnungszeiten)',
      warum: 'Bei ' + googleWeg + ' von ' + fragen.length + ' Suchfragen noch nicht in den Top 10. Vollständige Profile ranken höher.'
    });
  }

  // --- Hebel 3: Bewertungen (mehr echte gute) ---
  aufgaben.push({
    id: 'bewertungen-sammeln', hebel: 'Bewertungen', prio: 'hoch', aufwand: '5 Min',
    titel: 'Bewertungs-Bitte an zufriedene Gäste verschicken',
    warum: 'Fertiger Text im Bewertungs-Retter. Mehr echte 5-Sterne = höher bei Google und mehr Vertrauen bei neuen Gästen.'
  });

  // --- KI-Sichtbarkeit gezielt heben ---
  const kiWeg = zaehle('ki', 'nicht-gefunden');
  if (kiWeg > 0) {
    aufgaben.push({
      id: 'ki-inhalte', hebel: 'Sichtbarkeit', prio: 'mittel', aufwand: '10 Min',
      titel: 'Maschinenlesbare Inhalte stärken (Beschreibung, Speisekarte als Text)',
      warum: 'Bei ' + kiWeg + ' von ' + fragen.length + ' KI-Fragen noch nicht genannt. Je mehr guter Text, desto eher empfiehlt die KI.'
    });
  }

  // Sortierung: hohe Prioritaet zuerst, dann nach Hebel gruppiert-stabil
  const prioRang = { hoch: 0, mittel: 1, niedrig: 2 };
  aufgaben.sort((a, b) => (prioRang[a.prio] - prioRang[b.prio]) || a.id.localeCompare(b.id));
  return aufgaben;
}

// Kurz-Bilanz fuer die Uebersicht: wie viele Aufgaben, wie viele mit hoher Prio.
function aufgabenBilanz(aufgaben) {
  return {
    gesamt: (aufgaben || []).length,
    hoch: (aufgaben || []).filter((a) => a.prio === 'hoch').length
  };
}

module.exports = { baueAufgaben, aufgabenBilanz };
