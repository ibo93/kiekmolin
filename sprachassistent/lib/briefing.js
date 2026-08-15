'use strict';

// DAS ANRUF-BRIEFING — zwanzig Sekunden, bevor du auf "Anrufen" drueckst.
//
// Ibo ruft einen Kunden an und weiss im ersten Satz nicht mehr, worueber
// sie zuletzt geredet haben, was der Report gezeigt hat und was jetzt
// eigentlich ansteht. Das steht alles schon auf der Platte - nur an vier
// verschiedenen Stellen:
//
//   CM       wer das ist, was vereinbart ist, wann zuletzt Kontakt war
//   Agentur  Ampel, fehlende Reports
//   Beweis   die Zahlen des letzten Monats (Gaeste, Wert, Sichtbarkeit)
//   Saison   was jetzt verkauft werden muss, damit es rechtzeitig fertig ist
//
// Hier wird daraus EIN Briefing. Und zwar keins, das alles vorliest,
// sondern eins mit vier Antworten:
//
//   WER       damit du weisst, mit wem du redest
//   AUFHAENGER die eine Zahl, die du bringen kannst
//   VORSICHT  das eine, was schieflaeuft
//   VORSCHLAG was du ihm verkaufen wuerdest
//
// Alles lesend. Und: nichts erfunden. Fehlt eine Zahl, sagt das Briefing,
// dass sie fehlt - ein Anruf mit einer geratenen Zahl ist schlimmer als
// einer ohne Zahlen.

const crm = require('./crm');
const agentur = require('./agentur');
const beweis = require('./beweis');
const saison = require('./saison');

// ------------------------------------------------------ Kunden zuordnen ---

// Gesprochene Namen treffen nie ganz. "la piazza", "La Piazza Emden" und
// der Ordnername "la-piazza" muessen zusammenfinden.
function passt(a, b) {
  const x = crm.flach(a);
  const y = crm.flach(b);
  if (!x || !y) return false;
  return x === y || x.indexOf(y) > -1 || y.indexOf(x) > -1;
}

// Welcher Report-Ordner gehoert zu dem Namen? Der Slug ist der Schluessel
// zu allen Zahlen - ohne ihn gibt es nur das, was im CM steht.
function slugFuer(name, kunde) {
  const gesucht = [name, kunde && kunde.name].filter(Boolean);
  for (const slug of agentur.kundenSlugs()) {
    const lesbar = agentur.nameAus(slug);
    for (const g of gesucht) {
      if (passt(g, lesbar) || passt(g, slug)) return slug;
    }
  }
  return null;
}

// ------------------------------------------------------ Zusammentragen ----

async function fuerKunden(name, jetzt) {
  const gesucht = String(name || '').trim();
  if (!gesucht) return null;

  const stand = await crm.standAsync(jetzt);
  const treffer = crm.suche(gesucht, stand.kunden);
  const kunde = treffer.length ? treffer[0] : null;

  const slug = slugFuer(gesucht, kunde);
  const zahlen = slug ? beweis.fuerKunden(slug) : null;

  let ampel = null;
  if (slug) {
    try {
      ampel = agentur.stand(jetzt).kunden.find((k) => k.slug === slug) || null;
    } catch (_e) { /* ohne Agentur-Daten eben ohne Ampel */ }
  }

  return {
    gesucht: gesucht,
    name: (kunde && kunde.name) || (slug && agentur.nameAus(slug)) || gesucht,
    gefunden: !!(kunde || slug),
    mehrdeutig: treffer.length > 1 ? treffer.map((k) => k.name) : null,
    kunde: kunde,
    slug: slug,
    zahlen: zahlen,
    ampel: ampel,
    saison: saison.anstehend(jetzt),
    jetzt: jetzt || new Date()
  };
}

// ----------------------------------------------------------- Die vier -----

// WER: mit wem redest du da eigentlich?
function werSatz(b) {
  const teile = [b.name];
  const k = b.kunde;

  if (k && k.produkt) teile.push('hat ' + k.produkt);
  else if (b.zahlen && b.zahlen.telefon.hatDaten) teile.push('hat den Telefon-Retter');

  if (k && k.wert) teile.push(Math.round(k.wert).toLocaleString('de-DE') + ' Euro im Monat');
  if (b.zahlen && b.zahlen.monateDabei > 1) teile.push('seit ' + b.zahlen.monateDabei + ' Monaten dabei');
  else if (k && k.status) teile.push('Status ' + k.status);

  return teile.join(', ') + '.';
}

// AUFHAENGER: die EINE Zahl, mit der du ins Gespraech gehst. Nicht drei.
function aufhaengerSatz(b) {
  const z = b.zahlen;
  if (!z) {
    return b.kunde
      ? 'Zahlen habe ich zu ihm keine - frag ihn, wie es laeuft, statt etwas zu behaupten.'
      : '';
  }

  // Gestiegene Sichtbarkeit schlaegt alles: das ist die Zahl, fuer die er
  // bezahlt, und sie ist gemessen, nicht geschaetzt.
  const q = z.quote;
  if (q.jetzt !== null && q.jetzt !== undefined && q.vorher !== null && q.vorher !== undefined && q.jetzt > q.vorher) {
    return 'Aufhaenger: seine Sichtbarkeit ist von ' + q.vorher + ' auf ' + q.jetzt +
      ' hoch. Die Zahl kannst du bringen.';
  }

  if (z.telefon.gaeste > 0) {
    return 'Aufhaenger: der Telefon-Retter hat ihm im ' + z.monatWort + ' ' + z.telefon.gaeste +
      ' Gaeste gebracht' + (z.geschaetzterWert > 0 ? ', geschaetzt rund ' + beweis.euro(z.geschaetzterWert) : '') + '.';
  }

  if (z.telefon.rueckrufe > 0) {
    return 'Aufhaenger: ' + z.telefon.rueckrufe + ' Rueckrufwuensche im ' + z.monatWort +
      ' - Anrufe, die sonst ins Leere gelaufen waeren.';
  }

  return 'Aufhaenger habe ich keinen - im ' + z.monatWort + ' stehen keine Zahlen. Frag lieber, wie es laeuft.';
}

// VORSICHT: das EINE, was schieflaeuft. In der Reihenfolge, in der es weh tut.
function vorsichtSatz(b) {
  const z = b.zahlen;
  const k = b.kunde;

  // Gesunkene Sichtbarkeit zuerst: darauf spricht er dich selbst an.
  if (z && z.quote.jetzt !== null && z.quote.vorher !== null &&
      z.quote.jetzt !== undefined && z.quote.vorher !== undefined && z.quote.jetzt < z.quote.vorher) {
    return 'Vorsicht: seine Sichtbarkeit ist von ' + z.quote.vorher + ' auf ' + z.quote.jetzt +
      ' runter. Darauf spricht er dich vielleicht an - sag es besser selbst zuerst.';
  }

  if (b.ampel && b.ampel.stufe === 'rot') {
    const grund = b.ampel.gruende && b.ampel.gruende[0] ? ' - ' + agentur.grundWort(b.ampel.gruende[0], b.jetzt) : '';
    return 'Vorsicht: er steht auf Rot' + grund + '.';
  }

  if (b.ampel && !b.ampel.reportDiesenMonat) {
    return 'Vorsicht: der Report fuer diesen Monat fehlt noch. Versprich ihm keinen, den du nicht bis morgen schaffst.';
  }

  if (k && k.wiedervorlage) {
    const tage = crm.tageSeit(k.wiedervorlage, b.jetzt);
    if (tage !== null && tage > 14) {
      return 'Vorsicht: die Wiedervorlage war ' + crm.datumWort(k.wiedervorlage, b.jetzt) +
        ' - du bist spaet dran, das merkt er.';
    }
  }

  if (k && k.letzterKontakt) {
    const tage = crm.tageSeit(k.letzterKontakt, b.jetzt);
    if (tage !== null && tage >= crm.STILL_AB_TAGEN) {
      return 'Vorsicht: letzter Kontakt ' + crm.datumWort(k.letzterKontakt, b.jetzt) +
        '. Fang nicht mit dem Verkaufen an.';
    }
  }

  return '';
}

// VORSCHLAG: was verkaufst du ihm? Was saisonal JETZT dran ist - und was
// er sich beim letzten Mal selbst gewuenscht hat.
function vorschlagSatz(b) {
  const teile = [];

  const dran = (b.saison || []).filter((a) => a.knappWird)[0] || (b.saison || [])[0];
  if (dran) {
    teile.push('Vorschlag: ' + dran.name + ' - in ' + (dran.wochen <= 1 ? 'unter zwei Wochen' : dran.wochen + ' Wochen') +
      ' ist es soweit' + (dran.knappWird ? ', der Vorlauf wird knapp' : '') + '.');
  }

  // Was er beim letzten Mal gesagt hat, ist der beste Aufhaenger ueberhaupt.
  if (b.kunde && b.kunde.notiz) {
    teile.push('Beim letzten Mal ging es um: ' + String(b.kunde.notiz).replace(/\s+/g, ' ').slice(0, 140) + '.');
  }

  return teile.join(' ');
}

// ------------------------------------------------------- Zum Vorlesen -----

// Das ganze Briefing, gesprochen. Kurz - er sitzt schon am Telefon.
function briefingSatz(b) {
  if (!b) return 'Welchen Kunden rufst du an?';
  if (!b.gefunden) {
    return 'Zu "' + b.gesucht + '" finde ich nichts - weder im CM noch bei den Reports. ' +
      'Ruf ihn an und frag, statt dass ich etwas erfinde.';
  }

  const saetze = [werSatz(b)];

  if (b.kunde && b.kunde.letzterKontakt) {
    saetze.push('Zuletzt geredet: ' + crm.datumWort(b.kunde.letzterKontakt, b.jetzt) + '.');
  }

  for (const satz of [aufhaengerSatz(b), vorsichtSatz(b), vorschlagSatz(b)]) {
    if (satz) saetze.push(satz);
  }

  if (b.mehrdeutig) {
    saetze.push('Achtung, auf den Namen passen mehrere: ' + b.mehrdeutig.slice(0, 4).join(', ') + '.');
  }

  return saetze.join(' ');
}

// Fuer die Kommandozeile: dasselbe, aber untereinander - und mit der
// Nummer, damit man sie abtippen kann.
function alsText(b) {
  if (!b) return 'Welchen Kunden? node briefing.js la piazza';
  if (!b.gefunden) return 'Zu "' + b.gesucht + '" steht nichts im CM und es gibt keine Reports.';

  const zeilen = ['ANRUF-BRIEFING · ' + b.name, ''];
  zeilen.push('  ' + werSatz(b));

  if (b.kunde && b.kunde.telefon) zeilen.push('  Nummer: ' + b.kunde.telefon);
  if (b.kunde && b.kunde.letzterKontakt) {
    zeilen.push('  Zuletzt: ' + crm.datumWort(b.kunde.letzterKontakt, b.jetzt) + ' (' + b.kunde.letzterKontakt + ')');
  }
  if (b.kunde && b.kunde.wiedervorlage) {
    zeilen.push('  Wiedervorlage: ' + crm.datumWort(b.kunde.wiedervorlage, b.jetzt) + ' (' + b.kunde.wiedervorlage + ')');
  }

  for (const [titel, satz] of [['', aufhaengerSatz(b)], ['', vorsichtSatz(b)], ['', vorschlagSatz(b)]]) {
    if (satz) zeilen.push('', '  ' + titel + satz);
  }

  if (b.mehrdeutig) zeilen.push('', '  Mehrere Treffer: ' + b.mehrdeutig.join(', '));
  return zeilen.join('\n');
}

module.exports = {
  fuerKunden, briefingSatz, alsText,
  werSatz, aufhaengerSatz, vorsichtSatz, vorschlagSatz, slugFuer
};
