'use strict';

// REDEN OHNE UMWEG — der schnelle Weg.
//
// Gemessen: Claude Code braucht auf diesem Rechner rund vier Sekunden,
// bis das erste Wort kommt. Nicht weil das Modell langsam waere, sondern
// weil bei JEDEM Satz der ganze Werkzeugkasten hochfaehrt: Hooks,
// Plugins, MCP-Server, CLAUDE.md-Dateien, Skills.
//
// Fuer "schreib die Rechnung fuer La Piazza" ist das genau richtig - da
// wird der Werkzeugkasten gebraucht. Fuer "Moin" ist es absurd. Und weil
// die meisten Saetze in einem Gespraech eben "Moin" sind und nicht
// "schreib die Rechnung", faellt es dauernd auf.
//
// Also zwei Wege:
//
//   PLAUDERN   direkt ans Modell, ohne Werkzeuge. Erstes Wort in unter
//              einer Sekunde. Kann nichts tun - nur reden.
//   ARBEITEN   Claude Code mit allem, was dazugehoert. Dauert, kann alles.
//
// Entschieden wird VORHER am Satz (siehe istPlauderei), nicht vom Modell
// - eine Rueckfrage waere schon wieder eine Sekunde.
//
// Das ist bewusst kein Ersatz fuer Claude Code, sondern die Trennung
// zwischen Reden und Arbeiten. Wer ein Werkzeug braucht, kriegt eins.

const MODELL = process.env.SPRACH_PLAUDER_MODELL || 'claude-haiku-4-5-20251001';

// Wie viele Zuege des Gespraechs bleiben im Kopf? Genug fuer "und was
// war nochmal mit dem anderen?", wenig genug, dass es schnell bleibt.
const GEDAECHTNIS = 12;

function kannPlaudern() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ------------------------------------------------------- Wer ist dran? ----

// Saetze, bei denen etwas GETAN werden soll. Die gehen an Claude Code -
// der schnelle Weg hat keine Werkzeuge und wuerde nur behaupten, es
// erledigt zu haben. Das waere schlimmer als langsam.
const TUN = new RegExp([
  '\\b(schreib|erstell|bau|mach|leg|aender|ändere|korrigier|loesch|lösch|entfern)',
  '\\b(schneid|rendere|exportier|konvertier|lade hoch|poste|veroeffentlich|veröffentlich|sende|verschick|maile)',
  '\\b(oeffne|öffne|starte|fuehr aus|führ aus|installier|deploy|committe|push)',
  '\\b(guck|schau|sieh) (dir |mal |in )',
  // Kein \\b am Ende: sonst faellt jede Mehrzahl durch. "Rechnung" wuerde
  // treffen, "Rechnungen" nicht - und genau so fragt man auf Deutsch.
  '\\b(rechnung|angebot|kostenvoranschlag|mahnung|briefing|drehplan|speisekarte|reel|report)\\w*',
  '\\b(datei|ordner|verzeichnis|repositor|code|fehler im|bug)\\w*'
].join('|'), 'i');

// Fragen nach Zahlen, die in Dateien stehen und nicht im Kopf.
//
// Wetter, Datum, faellige Wiedervorlagen und die Liste von heute stehen
// NICHT mehr hier: die traegt das Lagebild vorher zusammen, damit genau
// diese Alltagsfragen schnell beantwortet werden koennen.
const NACHSCHLAGEN = /\b(wie viel|wieviel|welche kunden|offene posten|umsatz\w*|rechnung\w*|bezahlt|unbezahlt|betrag|preis\w*|schuldet)/i;

// Ist das ein Satz, den man einfach beantworten kann?
//
// Im Zweifel NEIN: lieber einmal zu oft den gruendlichen Weg nehmen als
// eine erfundene Antwort in einer halben Sekunde.
function istPlauderei(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (t.length > 220) return false;              // lange Ansagen sind Auftraege
  if (TUN.test(t)) return false;
  if (NACHSCHLAGEN.test(t)) return false;
  return true;
}

// ------------------------------------------------------------ Der Kopf ----

// Wie er sich im Gespraech verhaelt. Kurz gehalten: jedes Wort hier
// kostet Zeit, bevor das erste Wort der Antwort kommt.
function haltung(extra) {
  const teile = [
    'Du bist Kurani, der Sprach-Assistent von Ibo (Kurani Design, Ostfriesland).',
    'Deine Antwort wird VORGELESEN: hoechstens zwei kurze Saetze, keine Listen,',
    'keine Aufzaehlungen, kein Markdown, keine Emojis. Sprich ihn mit "du" an.',
    'Du redest gerade nur - du hast KEINE Werkzeuge und kannst nichts oeffnen,',
    'schreiben oder nachsehen. Willst du etwas tun oder brauchst du eine Zahl',
    'aus seinen Unterlagen, sag in EINEM Satz: "Das mach ich - sag es nochmal',
    'mit \'mach\' davor." Erfinde niemals Zahlen, Termine oder Kundendaten.'
  ];
  if (extra) teile.push(extra);
  return teile.join(' ');
}

// ------------------------------------------------------ Strom auswerten ---

// Eine SSE-Zeile der Messages-API auswerten. Reine Funktion -> pruefbar.
function verarbeiteZeile(zeile, zustand) {
  const roh = String(zeile || '').trim();
  if (!roh.startsWith('data:')) return [];
  const nutzlast = roh.slice(5).trim();
  if (!nutzlast || nutzlast === '[DONE]') return [];

  let d;
  try { d = JSON.parse(nutzlast); } catch (_e) { return []; }

  if (d.type === 'content_block_delta' && d.delta && d.delta.type === 'text_delta' && d.delta.text) {
    zustand.text += d.delta.text;
    return [{ art: 'happen', text: d.delta.text }];
  }

  if (d.type === 'message_delta' && d.usage) {
    zustand.tokenAus = d.usage.output_tokens || 0;
  }

  if (d.type === 'message_stop') {
    zustand.abgeschlossen = true;
    return [{ art: 'fertig', text: zustand.text.trim(), kosten: kosten(zustand) }];
  }

  if (d.type === 'error') {
    return [{ art: 'fehler', text: (d.error && d.error.message) || 'Fehler beim Plaudern' }];
  }

  if (d.type === 'message_start' && d.message && d.message.usage) {
    zustand.tokenEin = d.message.usage.input_tokens || 0;
  }

  return [];
}

// Grob, aber ehrlich: fuer den Tagesdeckel reicht die Groessenordnung.
// Haiku-Preise, Stand der Einrichtung - wer genau rechnen will, nimmt die
// Abrechnung von Anthropic.
function kosten(zustand) {
  const ein = (zustand.tokenEin || 0) / 1000000 * 1.0;
  const aus = (zustand.tokenAus || 0) / 1000000 * 5.0;
  return Math.round((ein + aus) * 1000000) / 1000000;
}

// --------------------------------------------------------- Die Plauderei --

class Plauderei {
  constructor(opts) {
    const o = opts || {};
    this.verlauf = [];
    // Kann ein Text sein oder eine Funktion. Als Funktion wird sie bei
    // JEDEM Zug gefragt - sonst waere die Uhrzeit die von vorhin.
    this.extra = o.extra || '';
    this.modell = o.modell || MODELL;
    this.maxWorte = parseInt(process.env.SPRACH_PLAUDER_TOKEN || '300', 10);
  }

  vergessen() {
    this.verlauf = [];
  }

  // Gibt { abbrechen } zurueck - gleiche Form wie kopf.starteAuftrag,
  // damit die Live-Sitzung nichts davon merken muss.
  frage(text, onEreignis) {
    const abbruch = new AbortController();
    const zustand = { text: '', tokenEin: 0, tokenAus: 0 };

    this.verlauf.push({ role: 'user', content: String(text) });
    if (this.verlauf.length > GEDAECHTNIS) this.verlauf = this.verlauf.slice(-GEDAECHTNIS);

    const fertig = (e) => {
      if (e.art === 'fertig' && e.text) this.verlauf.push({ role: 'assistant', content: e.text });
      onEreignis(e);
    };

    (async () => {
      try {
        const antwort = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: abbruch.signal,
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: this.modell,
            max_tokens: this.maxWorte,
            system: haltung(typeof this.extra === 'function' ? this.extra() : this.extra),
            messages: this.verlauf,
            stream: true
          })
        });

        if (!antwort.ok) {
          const grund = (await antwort.text()).slice(0, 160);
          return fertig({ art: 'fehler', text: 'Modell antwortet nicht (' + antwort.status + '): ' + grund });
        }

        const leser = antwort.body.getReader();
        const dekoder = new TextDecoder();
        let puffer = '';

        for (;;) {
          const { done, value } = await leser.read();
          if (done) break;
          puffer += dekoder.decode(value, { stream: true });
          const zeilen = puffer.split('\n');
          puffer = zeilen.pop();
          for (const zeile of zeilen) {
            for (const e of verarbeiteZeile(zeile, zustand)) fertig(e);
          }
        }

        // Strom zu Ende, ohne message_stop (abgeschnitten): trotzdem
        // abschliessen, damit niemand auf eine Antwort wartet.
        if (zustand.text && !zustand.abgeschlossen) {
          fertig({ art: 'fertig', text: zustand.text.trim(), kosten: kosten(zustand) });
        }
      } catch (e) {
        if (e.name === 'AbortError') return onEreignis({ art: 'abgebrochen', text: '' });
        fertig({ art: 'fehler', text: 'Plaudern ging nicht: ' + e.message });
      }
    })();

    return { abbrechen: () => abbruch.abort() };
  }
}

module.exports = { Plauderei, istPlauderei, kannPlaudern, verarbeiteZeile, haltung, TUN, MODELL };
