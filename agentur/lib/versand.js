'use strict';

// Report-Versand per E-Mail (Resend-API) - der letzte Schritt des
// Autopiloten: Der fertige Monats-Report erreicht den Wirt ohne
// Handarbeit. Kein Ausdrucken, kein manuelles Anhaengen, kein Vergessen.
//
// Aufbau bewusst zweigeteilt:
//   baueReportMail()  reine Funktion (kein Netz, keine Uhr) - Betreff,
//                     Text und HTML sind damit ohne API-Key testbar.
//   sendeReportMail() spricht mit https://api.resend.com/emails und
//                     gibt IMMER ein Ergebnis-Objekt zurueck ({ ok, ... }),
//                     wirft nie - der Server darf am Versand nicht sterben.
//
// Ehrlichkeit: Ohne RESEND_API_KEY wird nichts versprochen und nichts
// gesendet - istKonfiguriert() sagt der Oberflaeche klar Bescheid.

const fs = require('fs');
const path = require('path');

const RESEND_URL = 'https://api.resend.com/emails';
const MAX_ANHANG_BYTES = 8 * 1024 * 1024; // Resend-Limit liegt hoeher, aber Mail-Postfaecher nicht

// Ist der Versand ueberhaupt eingerichtet?
function istKonfiguriert() {
  return Boolean(process.env.RESEND_API_KEY);
}

// Euro-Betrag deutsch formatieren: 1234.5 -> '1.234,50 €' (ohne Intl,
// damit es auf jedem Node-Build gleich aussieht)
function euro(betrag) {
  const n = Math.round((Number(betrag) || 0) * 100) / 100;
  const [ganz, dezi] = n.toFixed(2).split('.');
  return ganz.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dezi + ' €';
}

// Nutzer-Daten koennen alles enthalten - fuers HTML entschaerfen
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Mail-Inhalt bauen - reine Funktion, KEIN Netz.
//   kunde      { name, ... }
//   monatLabel z.B. 'Juni 2026'
//   quote      { prozent, gefunden, getestet } oder null
//   telefon    { gesamtGeschaetzt, reservierungen, gaeste, bestellungen,
//                bestellwert, rueckrufe } oder null
// -> { betreff, text, html }
function baueReportMail({ kunde, monatLabel, quote, telefon } = {}) {
  const name = (kunde && kunde.name) || 'Ihr Restaurant';
  const monat = monatLabel || 'diesen Monat';
  const betreff = 'Ihr Sichtbarkeits-Report für ' + monat + ' – ' + name;

  // Absaetze erst als schlichte Text-Zeilen sammeln, HTML entsteht daraus.
  const absaetze = [];
  absaetze.push('Guten Tag,');
  absaetze.push('anbei finden Sie den Sichtbarkeits-Report für ' + name +
    ' (' + monat + ') als Anhang.');

  // Telefon-Zahlen nur erwaehnen, wenn der Assistent wirklich etwas getan hat
  const t = telefon || {};
  const telefonAktiv = (t.reservierungen || 0) + (t.bestellungen || 0) + (t.rueckrufe || 0) > 0;
  if (telefon && telefonAktiv) {
    let satz = 'Ihr Telefon-Assistent hat ' + (t.reservierungen || 0) +
      ' Reservierungen (' + (t.gaeste || 0) + ' Gäste) und ' +
      (t.bestellungen || 0) + ' Bestellungen über ' + euro(t.bestellwert) +
      ' angenommen – geschätzter Mehrumsatz: ' + euro(t.gesamtGeschaetzt) + '.';
    if (t.rueckrufe > 0) {
      satz += ' Dazu kamen ' + t.rueckrufe + ' Rückruf-Wünsche.';
    }
    absaetze.push(satz);
  }

  if (quote) {
    absaetze.push('Ihre Sichtbarkeits-Quote liegt bei ' + quote.prozent +
      ' % – ' + quote.gefunden + ' von ' + quote.getestet +
      ' geprüften Einträgen gefunden. Die Details stehen im Report.');
  }

  absaetze.push('Wenn Sie Fragen zu den Zahlen haben, antworten Sie einfach auf diese E-Mail.');
  absaetze.push('Freundliche Grüße\nIhre KI-Agentur');

  const text = absaetze.join('\n\n') + '\n';

  // Schlichtes HTML mit Inline-CSS - ein Akzent (#f59e0b), keine Bilder
  const p = (inhalt) =>
    '    <p style="margin:0 0 16px;">' + inhalt + '</p>';
  const htmlAbsaetze = absaetze
    .map((a) => p(escapeHtml(a).replace(/\n/g, '<br>')))
    .join('\n');
  const html = [
    '<div style="max-width:560px;margin:0 auto;padding:24px;',
    'font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">',
    '  <div style="border-top:3px solid #f59e0b;padding-top:16px;">',
    '    <p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Sichtbarkeits-Report · ' + escapeHtml(monat) + '</p>',
    '    <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">' + escapeHtml(name) + '</h1>',
    htmlAbsaetze,
    '  </div>',
    '</div>'
  ].join('\n');

  return { betreff, text, html };
}

// PDF bevorzugt: Liegt neben der angegebenen Datei eine gleichnamige
// .pdf-Version, nehmen wir die (Wirte oeffnen PDF, kein HTML).
function bevorzugterAnhang(anhangPfad) {
  const alsPdf = anhangPfad.replace(/\.[^./\\]+$/, '.pdf');
  if (alsPdf !== anhangPfad && fs.existsSync(alsPdf)) return alsPdf;
  return anhangPfad;
}

// Mail wirklich senden. Gibt IMMER { ok, ... } zurueck, wirft nie.
//   an          Empfaenger-Adresse (String)
//   anhangPfad  optionaler Pfad zum Report (PDF bevorzugt)
// -> { ok, status?, fehler?, hinweis? }
async function sendeReportMail({ an, betreff, text, html, anhangPfad } = {}) {
  if (!istKonfiguriert()) {
    return { ok: false, fehler: 'RESEND_API_KEY fehlt in .env' };
  }

  const body = {
    from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
    to: an,
    subject: betreff,
    html,
    text
  };

  // Anhang nur, wenn die Datei existiert und nicht zu gross ist
  let hinweis = null;
  if (anhangPfad && fs.existsSync(anhangPfad)) {
    try {
      const pfad = bevorzugterAnhang(anhangPfad);
      if (fs.statSync(pfad).size > MAX_ANHANG_BYTES) {
        hinweis = 'Anhang zu groß - ohne Anhang gesendet';
      } else {
        body.attachments = [{
          filename: path.basename(pfad),
          content: fs.readFileSync(pfad).toString('base64')
        }];
      }
    } catch (e) {
      // Datei zwischendurch verschwunden o.ae. - dann eben ohne Anhang
      hinweis = 'Anhang nicht lesbar - ohne Anhang gesendet (' + e.message + ')';
    }
  }

  try {
    const antwort = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });

    if (!antwort.ok) {
      let detail = '';
      try { detail = (await antwort.json()).message || ''; } catch (_e) { /* egal */ }
      return {
        ok: false,
        status: antwort.status,
        fehler: 'Resend antwortete mit ' + antwort.status + (detail ? ': ' + detail : '')
      };
    }

    const ergebnis = { ok: true, status: antwort.status };
    if (hinweis) ergebnis.hinweis = hinweis;
    return ergebnis;
  } catch (e) {
    const fehler = e && e.name === 'TimeoutError'
      ? 'Zeitüberschreitung beim Versand (15 s)'
      : (e && e.message) || String(e);
    return { ok: false, fehler };
  }
}

module.exports = { istKonfiguriert, baueReportMail, sendeReportMail };
