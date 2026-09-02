'use strict';
// ============================================================
//  Mail-Vorlagen
//
//  Der Wirt liest diese Mail auf dem Handy, meistens im Stehen
//  und zwischen zwei Handgriffen. Er braucht drei Dinge in einer
//  Sekunde: WANN, WIE VIELE, WER. Alles andere ist Beiwerk.
//
//  Darum: Datum und Uhrzeit gross, die Personenzahl daneben, die
//  Telefonnummer als Wahl-Link. Kein Logo-Balken, keine Farben-
//  spielerei - eine Reservierungsmeldung ist kein Newsletter.
//
//  Jede Mail geht als HTML UND als reiner Text raus. Wer in einem
//  Textprogramm liest oder HTML abgeschaltet hat, sieht sonst
//  eine leere Nachricht.
// ============================================================

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/* "2026-09-05" -> "Freitag, 5. September". Das Jahr nur, wenn es nicht das
   laufende ist - sonst liest man ueber die wichtige Zahl hinweg. */
function datumLang(iso, heute) {
  if (!iso) return '';
  const t = String(iso).split('-');
  if (t.length !== 3) return String(iso);
  const d = new Date(Number(t[0]), Number(t[1]) - 1, Number(t[2]));
  if (isNaN(d)) return String(iso);
  const jahr = (heute && heute.getFullYear()) !== d.getFullYear() ? ' ' + d.getFullYear() : '';
  return WOCHENTAGE[d.getDay()] + ', ' + d.getDate() + '. ' + MONATE[d.getMonth()] + jahr;
}

function uhrzeit(s) {
  const t = String(s || '').match(/^(\d{1,2}):(\d{2})/);
  return t ? t[1].padStart(2, '0') + ':' + t[2] : String(s || '');
}

/* Nur Ziffern und ein fuehrendes Plus - alles andere macht tel:-Links kaputt. */
function waehlbar(nummer) {
  const n = String(nummer || '').replace(/[^\d+]/g, '');
  return n.length >= 6 ? n : '';
}

/* ---------------------------------------------------------------
   Der Rahmen. Bewusst mit Tabellen und Inline-Stilen: Mailprogramme
   werfen <style>-Bloecke weg, und Outlook kann kein flexbox.
   --------------------------------------------------------------- */
/* Die Fusszeile ist die einzige Werbeflaeche, die taeglich bei Wirten landet -
   und zwar in einer Mail, die sie ohnehin oeffnen. Deshalb: dezent, zwei
   Zeilen, kein Banner. Wer eine Reservierungsmeldung liest, will keinen
   Prospekt; wer aber gerade merkt, dass der Assistent ihm Arbeit abnimmt,
   schaut eher, was es sonst noch gibt.

   Abschaltbar ueber MAIL_WERBUNG=0 - bei einem Kunden, der Kiek mol in
   schon nutzt, waere der erste Hinweis nur Rauschen. */
function eigenwerbung(zeigen) {
  if (!zeigen) return '';
  return '<div style="margin-top:12px;line-height:1.7">'
    + '<a href="https://kiekmolin.de" style="color:#1f7a3d;text-decoration:none">Kiek mol in</a>'
    + ' <span style="color:#b0b0b0">·</span> Bestellungen und Tischreservierung online<br>'
    + '<a href="https://instagram.com/kurani_design" style="color:#1f7a3d;text-decoration:none">Kurani Design</a>'
    + ' <span style="color:#b0b0b0">·</span> Schilder, Speisekarten, Fahrzeugbeschriftung'
    + '</div>';
}

function rahmen(inhalt, fuss) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
       style="max-width:520px;background:#ffffff;border-radius:10px;
              font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
              color:#1a1a1a">
${inhalt}
${fuss ? `<tr><td style="padding:14px 26px 22px;border-top:1px solid #ececec;
        font-size:12px;line-height:1.6;color:#8a8a8a">${fuss}${
          eigenwerbung(process.env.MAIL_WERBUNG !== '0')}</td></tr>` : ''}
</table>
</td></tr></table>
</body></html>`;
}

function kopf(titel, farbe) {
  return `<tr><td style="padding:22px 26px 4px">
    <div style="font-size:12px;letter-spacing:.09em;text-transform:uppercase;
                color:${farbe};font-weight:600">${esc(titel)}</div>
  </td></tr>`;
}

/* Die drei Angaben, auf die es ankommt - gross genug, um sie im
   Vorbeigehen zu lesen. */
function eckdaten(datum, zeit, personen) {
  return `<tr><td style="padding:6px 26px 18px">
    <div style="font-size:23px;font-weight:600;line-height:1.35">${esc(datum)}</div>
    <div style="font-size:23px;font-weight:600;line-height:1.35">${esc(zeit)} Uhr
      <span style="color:#6a6a6a;font-weight:400">· ${esc(personen)}</span></div>
  </td></tr>`;
}

function zeile(bez, wert) {
  if (!wert) return '';
  return `<tr><td style="padding:0 26px 7px">
    <span style="display:inline-block;min-width:78px;color:#8a8a8a;font-size:13px">${esc(bez)}</span>
    <span style="font-size:14px">${wert}</span>
  </td></tr>`;
}

/* ============================================================
   Neue Reservierung - an den Wirt
   ============================================================ */
function reservierung({ betrieb, name, telefon, datum, zeit, personen, hinweise }, heute) {
  const wann = datumLang(datum, heute || new Date());
  const uhr = uhrzeit(zeit);
  const wer = (personen || 2) + (Number(personen) === 1 ? ' Person' : ' Personen');
  const tel = waehlbar(telefon);

  const betreff = `Reservierung ${uhr} Uhr · ${wer} · ${name || 'Gast'}`;

  const text = [
    'Neue Reservierung für ' + (betrieb || 'Ihren Betrieb') + ':',
    '',
    '  ' + wann,
    '  ' + uhr + ' Uhr, ' + wer,
    '',
    '  Name:    ' + (name || '-'),
    '  Telefon: ' + (telefon || '-'),
    hinweise ? '  Hinweis: ' + hinweise : '',
    '',
    'Aufgenommen vom Telefon-Assistenten.'
  ].filter(Boolean).join('\n');

  const html = rahmen(
    kopf('Neue Reservierung', '#1f7a3d')
    + eckdaten(wann, uhr, wer)
    + zeile('Name', esc(name || '–'))
    + (tel
        ? zeile('Telefon', `<a href="tel:${esc(tel)}" style="color:#1a5fb4;text-decoration:none">${esc(telefon)}</a>`)
        : zeile('Telefon', '–'))
    + (hinweise ? zeile('Hinweis', esc(hinweise)) : '')
    + '<tr><td style="height:8px"></td></tr>',
    'Aufgenommen vom Telefon-Assistenten für ' + esc(betrieb || '') + '.'
  );

  return { betreff, text, html };
}

/* ============================================================
   Absage - an den Wirt
   ============================================================ */
function absage({ betrieb, name, datum, zeit, personen }, heute) {
  const wann = datumLang(datum, heute || new Date());
  const uhr = uhrzeit(zeit);
  const wer = (personen || 2) + (Number(personen) === 1 ? ' Person' : ' Personen');

  return {
    betreff: `Absage ${uhr} Uhr · ${name || 'Gast'}`,
    text: [
      'Eine Reservierung wurde telefonisch abgesagt:',
      '',
      '  ' + wann,
      '  ' + uhr + ' Uhr, ' + wer,
      '  Name: ' + (name || '-'),
      '',
      'Der Tisch ist wieder frei.'
    ].join('\n'),
    html: rahmen(
      kopf('Reservierung abgesagt', '#b3261e')
      + eckdaten(wann, uhr, wer)
      + zeile('Name', esc(name || '–'))
      + `<tr><td style="padding:10px 26px 18px;font-size:14px;color:#1f7a3d">
           Der Tisch ist wieder frei.</td></tr>`,
      'Abgesagt über den Telefon-Assistenten für ' + esc(betrieb || '') + '.'
    )
  };
}

/* ============================================================
   Bestätigung - an den Gast

   Andere Aufgabe als die Wirt-Mail: Der Gast will schwarz auf weiss,
   dass sein Tisch steht, und einen Weg, kurzfristig abzusagen. Der
   Absagelink ist kein Zugestaendnis - eine Absage am Vormittag ist
   dem Wirt tausendmal lieber als ein leerer Tisch am Abend.
   ============================================================ */
function bestaetigung({ betrieb, name, datum, zeit, personen, telefonBetrieb }, heute) {
  const wann = datumLang(datum, heute || new Date());
  const uhr = uhrzeit(zeit);
  const wer = (personen || 2) + (Number(personen) === 1 ? ' Person' : ' Personen');
  const tel = waehlbar(telefonBetrieb);

  return {
    betreff: `Ihr Tisch am ${wann.split(',')[0]} um ${uhr} Uhr – ${betrieb || ''}`.trim(),
    text: [
      (name ? 'Hallo ' + name + ',' : 'Guten Tag,'),
      '',
      'Ihr Tisch ist reserviert:',
      '',
      '  ' + (betrieb || ''),
      '  ' + wann,
      '  ' + uhr + ' Uhr, ' + wer,
      '',
      telefonBetrieb
        ? 'Wenn etwas dazwischenkommt, rufen Sie kurz an: ' + telefonBetrieb
        : 'Wenn etwas dazwischenkommt, sagen Sie uns bitte kurz Bescheid.',
      '',
      'Wir freuen uns auf Sie.'
    ].join('\n'),
    html: rahmen(
      kopf('Ihr Tisch ist reserviert', '#1f7a3d')
      + `<tr><td style="padding:2px 26px 10px;font-size:15px">${
          name ? 'Hallo ' + esc(name) + ',' : 'Guten Tag,'}</td></tr>`
      + eckdaten(wann, uhr, wer)
      + zeile('Wo', esc(betrieb || '–'))
      + `<tr><td style="padding:14px 26px 20px;font-size:14px;line-height:1.65;color:#4a4a4a">
          ${tel
            ? 'Wenn etwas dazwischenkommt, rufen Sie kurz an: '
              + `<a href="tel:${esc(tel)}" style="color:#1a5fb4;text-decoration:none">${esc(telefonBetrieb)}</a>.`
            : 'Wenn etwas dazwischenkommt, sagen Sie uns bitte kurz Bescheid.'}
          <br>Wir freuen uns auf Sie.
         </td></tr>`,
      'Diese Bestätigung wurde automatisch verschickt, nachdem Sie angerufen haben.'
    )
  };
}

module.exports = { reservierung, absage, bestaetigung, datumLang, uhrzeit, waehlbar };
