'use strict';

// DAS LAGEBILD — was er wissen muss, bevor er gefragt wird.
//
// Der schnelle Weg (lib/plauder) hat keine Werkzeuge. Ohne Hilfe muesste
// er bei "wie wird das Wetter" oder "was steht heute an" passen und an
// Claude Code abgeben - und da sind wir wieder bei vier Sekunden.
//
// Also andersherum: die paar Sachen, nach denen im Alltag staendig
// gefragt wird, liegen ohnehin auf der Platte. Die werden im Hintergrund
// eingesammelt und stehen dann schon im Kopf, wenn die Frage kommt.
// Antwort in unter einer Sekunde, mit echten Zahlen.
//
// Zwei Regeln:
//   1. KURZ. Jedes Wort hier verzoegert das erste Wort der Antwort.
//      Deshalb nur, was wirklich taeglich gebraucht wird.
//   2. Faellt eine Quelle aus, fehlt nur ihre Zeile. Ein Lagebild, das
//      wegen des Wetterdienstes ganz ausfaellt, waere schlechter als
//      eins ohne Wetter.

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONATE = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function zeitWort(jetzt) {
  const d = jetzt || new Date();
  return WOCHENTAGE[d.getDay()] + ', ' + d.getDate() + '. ' + MONATE[d.getMonth()] +
    ' ' + d.getFullYear() + ', ' + d.getHours() + ' Uhr ' +
    String(d.getMinutes()).padStart(2, '0');
}

class Lagebild {
  constructor(opts) {
    const o = opts || {};
    // Wetter aendert sich langsam, Notizen schnell. Ein Takt fuer alles
    // ist einfacher und reicht voellig.
    this.minuten = o.minuten === undefined ? 15 : o.minuten;
    this.stand = {};
    this.uhr = null;
  }

  async aktualisiere(jetzt) {
    const neu = {};

    try {
      const wetter = require('./wetter');
      const daten = await wetter.hole();
      neu.wetter = wetter.wetterSatz(daten);
    } catch (_e) { /* kein Netz - dann eben ohne Wetter */ }

    try {
      const notizen = require('./notizen');
      const heute = jetzt || new Date();
      const faellig = notizen.faelligBis(new Date(heute.getFullYear(), heute.getMonth(), heute.getDate(), 23, 59));
      if (faellig.length) neu.notizen = faellig.slice(0, 4).map((n) => n.text).join('; ');
      const offen = notizen.offene().length - faellig.length;
      if (offen > 0) neu.notizenOffen = offen;
    } catch (_e) { /* ohne Merkzettel */ }

    try {
      const crm = require('./crm');
      const s = crm.stand(jetzt);
      if (s.faellig.length) neu.wiedervorlagen = s.faellig.slice(0, 3).map((k) => k.name).join(', ');
    } catch (_e) { /* kein CM */ }

    try {
      const agentur = require('./agentur');
      const s = agentur.stand(jetzt);
      if (s.rot.length) neu.rot = s.rot.slice(0, 3).map((k) => k.name).join(', ');
      if (s.ohneReport.length) neu.reportsOffen = s.ohneReport.length;
    } catch (_e) { /* keine Agentur-Daten */ }

    this.stand = neu;
    this.geholt = jetzt || new Date();
    return neu;
  }

  // Der Text, der in den System-Prompt wandert. Kurz halten.
  alsText(jetzt) {
    const s = this.stand || {};
    const teile = ['Es ist ' + zeitWort(jetzt) + '.'];

    if (s.wetter) teile.push(s.wetter);
    if (s.notizen) teile.push('Auf Ibos Liste steht heute: ' + s.notizen + '.');
    else if (s.notizenOffen) teile.push(s.notizenOffen + ' Notizen ohne Termin liegen offen.');
    if (s.wiedervorlagen) teile.push('Faellige Wiedervorlagen: ' + s.wiedervorlagen + '.');
    if (s.rot) teile.push('Im roten Bereich: ' + s.rot + '.');
    if (s.reportsOffen) teile.push(s.reportsOffen + ' Monats-Reports fehlen noch.');

    teile.push('Diese Angaben sind aktuell - nutze sie, wenn er danach fragt, ' +
      'und erfinde nichts dazu. Nach allem anderen (Zahlen, Rechnungen, Dateien) ' +
      'musst du ihn bitten, es mit "mach" oder "guck nach" zu sagen.');

    return teile.join(' ');
  }

  start() {
    if (this.uhr || !this.minuten) return;
    this.aktualisiere().catch(() => { /* der erste Versuch darf danebengehen */ });
    this.uhr = setInterval(() => {
      this.aktualisiere().catch(() => { /* still weiter */ });
    }, this.minuten * 60000);
    if (this.uhr.unref) this.uhr.unref();
  }

  stop() {
    if (this.uhr) clearInterval(this.uhr);
    this.uhr = null;
  }
}

module.exports = { Lagebild, zeitWort };
