'use strict';

// Das "Denken" des Telefon-Retters: eine Dialog-Sitzung pro Anruf.
// Claude versteht den Wunsch, entscheidet und ruft Werkzeuge auf
// (Verfuegbarkeit pruefen, reservieren, Rueckruf notieren, bestellen).
//
// Stufenplan (per STUFE in .env, Standard 1):
//   Stufe 1: Reservierung + Rueckruf-Fallback
//   Stufe 2: + Infos beantworten (Oeffnungszeiten, Speisekarte, Anfahrt)
//   Stufe 3: + Bestellung (Abholung & Lieferung, mit Vorlesen + Bestaetigung)
//
// Sicherheits-Regeln (nicht verhandelbar):
//   - Telefon-Reservierung laeuft durch DIESELBE Verfuegbarkeitspruefung wie online.
//   - Bei Unsicherheit KEINE falsche Zusage -> Rueckrufwunsch aufnehmen.
//   - Jede Bestellung wird komplett vorgelesen und muss bestaetigt werden.
//   - Quelle wird als 'telefon' markiert.

const { pruefeSlot, lokalesDatum, normalisiereUhrzeit } = require('./verfuegbarkeit');

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// --- Live-Streaming: sprechen, WAEHREND Claude noch denkt --------------------
// SatzSammler bekommt Text-Stueckchen (Deltas) und meldet fertige Saetze
// SOFORT weiter - so liegt der erste Satz schon auf der Telefonleitung,
// bevor die Antwort komplett geschrieben ist.
class SatzSammler {
  constructor(onSatz) {
    this.onSatz = onSatz;
    this.puffer = '';
  }

  fuettere(stueck) {
    this.puffer += stueck;
    // Satzgrenze = .!? gefolgt von Leerraum. Punkt-Stuecke unter 15 Zeichen
    // (Abkuerzungen wie "z.B.", Zahlen) reifen weiter, "Gerne!" darf sofort raus.
    const grenze = /[.!?]+\s+/g;
    let start = 0;
    let m;
    while ((m = grenze.exec(this.puffer))) {
      const kandidat = this.puffer.slice(start, m.index + m[0].length).trim();
      if (kandidat.length >= 15 || /[!?]$/.test(kandidat)) {
        this.onSatz(kandidat);
        start = m.index + m[0].length;
      }
    }
    this.puffer = this.puffer.slice(start);
  }

  spuelen() {
    const rest = this.puffer.trim();
    this.puffer = '';
    if (rest) this.onSatz(rest);
  }
}

// Server-Sent-Events der Claude-API einsammeln und zur gewohnten Antwort-Form
// zusammensetzen. Text-Deltas gehen SOFORT an onDelta (-> SatzSammler),
// Werkzeug-Aufrufe werden vollstaendig gesammelt wie im Nicht-Streaming-Fall.
async function parseSseAntwort(strom, onDelta) {
  const decoder = new TextDecoder();
  const bloecke = [];
  let stopReason = null;
  let rest = '';
  for await (const chunk of strom) {
    rest += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = rest.indexOf('\n')) !== -1) {
      const zeile = rest.slice(0, idx).trim();
      rest = rest.slice(idx + 1);
      if (!zeile.startsWith('data:')) continue;
      let ev;
      try { ev = JSON.parse(zeile.slice(5)); } catch (_e) { continue; }
      if (ev.type === 'content_block_start') {
        bloecke[ev.index] = Object.assign({}, ev.content_block);
        if (bloecke[ev.index].type === 'tool_use') bloecke[ev.index].__json = '';
      } else if (ev.type === 'content_block_delta') {
        const b = bloecke[ev.index];
        if (!b) continue;
        if (ev.delta.type === 'text_delta') {
          b.text = (b.text || '') + ev.delta.text;
          if (onDelta) onDelta(ev.delta.text);
        } else if (ev.delta.type === 'input_json_delta') {
          b.__json += ev.delta.partial_json;
        } else if (ev.delta.type === 'thinking_delta') {
          // Denk-Bloecke des Modells ebenfalls zusammensetzen - sie gehoeren
          // vollstaendig in den Gespraechsverlauf, sonst lehnt die API die
          // naechste Runde ab. Gesprochen wird davon natuerlich nichts.
          b.thinking = (b.thinking || '') + ev.delta.thinking;
        } else if (ev.delta.type === 'signature_delta') {
          b.signature = (b.signature || '') + ev.delta.signature;
        }
      } else if (ev.type === 'content_block_stop') {
        const b = bloecke[ev.index];
        if (b && b.type === 'tool_use') {
          try { b.input = b.__json ? JSON.parse(b.__json) : (b.input || {}); } catch (_e) { b.input = b.input || {}; }
          delete b.__json;
        }
      } else if (ev.type === 'message_delta' && ev.delta && ev.delta.stop_reason) {
        stopReason = ev.delta.stop_reason;
      } else if (ev.type === 'error') {
        throw new Error('Claude-Stream: ' + JSON.stringify(ev.error).slice(0, 200));
      }
    }
  }
  return { content: bloecke.filter(Boolean), stop_reason: stopReason };
}

function normalisiere(s) {
  return String(s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function euro(betrag) {
  return Number(betrag).toFixed(2).replace('.', ',') + ' Euro';
}

function datumHeute() {
  return lokalesDatum();
}

// --- Was darf dieser Agent ueberhaupt? -------------------------------------------
// Nicht jeder Wirt will alles. Einer nimmt NUR Bestellungen (Lieferdienst),
// ein anderer NUR Reservierungen. Das steuert "kann" in nummern.json.
// Ohne Angabe gilt wie bisher die Stufe: Reservierungen immer,
// Bestellungen ab Stufe 3.
function baueFaehigkeiten(stufe, kann, restaurant) {
  const s = stufe || 1;
  /* Durchstellen geht nur, wenn im CRM eine Nummer hinterlegt wurde. */
  const weiterleitung = !!(restaurant && restaurant.weiterleitung);
  if (!kann) return { reservierung: true, bestellung: s >= 3, infos: s >= 2, weiterleitung };
  const liste = (Array.isArray(kann) ? kann : [kann]).map((k) => String(k).toLowerCase().trim());
  const hat = (name) => liste.some((k) => k.startsWith(name));
  const f = {
    reservierung: hat('reservier'),
    bestellung: hat('bestell') || hat('liefer'),
    infos: hat('info') || s >= 2,
    weiterleitung
  };
  // Bestellungen ohne Speisekarten-Zugriff waeren blind - Infos dann immer an
  if (f.bestellung) f.infos = true;
  // Kann er nichts, kann er wenigstens Rueckrufe aufnehmen (nie stumm sein)
  if (!f.reservierung && !f.bestellung) f.nurRueckruf = true;
  return f;
}

// --- Werkzeug-Definitionen fuer Claude -------------------------------------------
function baueTools(stufe, kann, restaurant) {
  const f = baueFaehigkeiten(stufe, kann, restaurant);
  const tools = [
    {
      name: 'pruefe_verfuegbarkeit',
      description: 'Prueft, ob zum gewuenschten Zeitpunkt ein Tisch frei ist. IMMER vor einer Reservierung aufrufen.',
      input_schema: {
        type: 'object',
        properties: {
          datum: { type: 'string', description: 'Datum im Format JJJJ-MM-TT' },
          uhrzeit: { type: 'string', description: 'Uhrzeit im Format HH:MM' },
          personen: { type: 'integer', description: 'Anzahl der Gaeste' }
        },
        required: ['datum', 'uhrzeit', 'personen']
      }
    },
    {
      name: 'reserviere_tisch',
      description: 'Traegt die Reservierung fest ein. NUR aufrufen, wenn pruefe_verfuegbarkeit frei gemeldet hat und Name + Datum + Uhrzeit + Personenzahl bekannt sind.',
      input_schema: {
        type: 'object',
        properties: {
          gast_name: { type: 'string' },
          telefon: { type: 'string', description: 'Rueckrufnummer des Gastes (Anrufernummer, falls nicht anders genannt)' },
          datum: { type: 'string', description: 'JJJJ-MM-TT' },
          uhrzeit: { type: 'string', description: 'HH:MM' },
          personen: { type: 'integer' },
          hinweise: { type: 'string', description: 'Sonderwuensche wie Kinderstuhl, Terrasse, Anlass (optional)' }
        },
        required: ['gast_name', 'telefon', 'datum', 'uhrzeit', 'personen']
      }
    },
    {
      name: 'rueckruf_wunsch',
      description: 'Nimmt einen Rueckrufwunsch auf, wenn du unsicher bist oder der Wunsch nicht ins Schema passt. Lieber Rueckruf als falsche Zusage!',
      input_schema: {
        type: 'object',
        properties: {
          telefon: { type: 'string' },
          name: { type: 'string' },
          anliegen: { type: 'string', description: 'Kurze Zusammenfassung, worum es geht' }
        },
        required: ['telefon', 'anliegen']
      }
    },
    {
      name: 'gespraech_beenden',
      description: 'Beendet das Gespraech, nachdem alles erledigt ist und du dich verabschiedet hast.',
      input_schema: {
        type: 'object',
        properties: {
          abschiedsgruss: { type: 'string', description: 'Der letzte Satz, der noch gesprochen wird' }
        },
        required: ['abschiedsgruss']
      }
    }
  ];

  /* Nur anbieten, wenn wirklich eine Nummer hinterlegt ist – sonst
     verspricht der Assistent ein Durchstellen, das nirgends ankommt. */
  if (f.weiterleitung) {
    tools.push({
      name: 'weiterleiten',
      description: 'Stellt den Anruf an einen Menschen im Betrieb durch. Vorher ankuendigen, '
        + 'z.B. "Einen Moment, ich stelle Sie durch."',
      input_schema: {
        type: 'object',
        properties: {
          ansage: { type: 'string', description: 'Was du sagst, bevor durchgestellt wird.' },
          grund:  { type: 'string', description: 'Kurz, warum durchgestellt wird.' }
        },
        required: ['ansage']
      }
    });
  }

  if (f.infos) {
    tools.push({
      name: 'speisekarten_frage',
      description: 'Sucht in der Speisekarte, z.B. nach veganen Gerichten, Pizza, Preisen. Nutze das statt zu raten.',
      input_schema: {
        type: 'object',
        properties: {
          suchbegriff: { type: 'string', description: 'Wonach der Gast fragt, z.B. "vegan", "pizza", "salat". Leer = Ueberblick.' }
        },
        required: []
      }
    });
  }

  if (f.bestellung) {
    tools.push({
      name: 'pruefe_bestellung',
      description: 'Prueft die gewuenschten Artikel gegen die Speisekarte und rechnet die Summe aus. IMMER vor speichere_bestellung aufrufen. Das Ergebnis liest du dem Gast KOMPLETT vor.',
      input_schema: {
        type: 'object',
        properties: {
          typ: { type: 'string', enum: ['abholung', 'lieferung'] },
          artikel: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Gericht, so wie der Gast es nennt' },
                menge: { type: 'integer' },
                extras: { type: 'string', description: 'Sonderwuensche wie "ohne Zwiebeln" (optional)' }
              },
              required: ['name', 'menge']
            }
          }
        },
        required: ['typ', 'artikel']
      }
    });
    tools.push({
      name: 'speichere_bestellung',
      description: 'Speichert die Bestellung. NUR aufrufen, nachdem du die komplette Bestellung mit Summe laut vorgelesen hast und der Gast ausdruecklich JA gesagt hat.',
      input_schema: {
        type: 'object',
        properties: {
          typ: { type: 'string', enum: ['abholung', 'lieferung'] },
          artikel: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                menge: { type: 'integer' },
                extras: { type: 'string' }
              },
              required: ['name', 'menge']
            }
          },
          kunde_name: { type: 'string' },
          telefon: { type: 'string' },
          adresse: { type: 'string', description: 'Lieferadresse - PFLICHT bei Lieferung' },
          vorgelesen_und_bestaetigt: { type: 'boolean', description: 'true NUR wenn die Bestellung komplett vorgelesen und vom Gast bestaetigt wurde' }
        },
        required: ['typ', 'artikel', 'kunde_name', 'telefon', 'vorgelesen_und_bestaetigt']
      }
    });
  }

  // Wer keine Reservierungen annimmt, bekommt die Werkzeuge dafuer gar nicht
  // erst - so kann Claude sie auch nicht versehentlich anbieten.
  return f.reservierung
    ? tools
    : tools.filter((t) => t.name !== 'pruefe_verfuegbarkeit' && t.name !== 'reserviere_tisch');
}

// --- System-Prompt ---------------------------------------------------------------
function baueSystemPrompt(restaurant, stufe, anrufer, kann) {
  const f = baueFaehigkeiten(stufe, kann, restaurant);
  const jetzt = new Date();
  const heute = datumHeute();
  const zeilen = [
    'Du bist der freundliche Telefon-Assistent des Restaurants "' + restaurant.name + '"' +
    (restaurant.city ? ' in ' + restaurant.city : '') + '. Du sprichst Deutsch, kurz und natuerlich - wie ein guter Mitarbeiter am Telefon.',
    '',
    'HEUTE ist ' + WOCHENTAGE[jetzt.getDay()] + ', der ' + heute + ', Uhrzeit ' +
    String(jetzt.getHours()).padStart(2, '0') + ':' + String(jetzt.getMinutes()).padStart(2, '0') + ' Uhr.',
    'Nummer des Anrufers: ' + (anrufer || 'unbekannt') + '.',
    '',
    'FAKTEN ZUM RESTAURANT (nur diese nennen, nichts erfinden):'
  ];
  if (restaurant.address) zeilen.push('- Adresse: ' + restaurant.address + (restaurant.zip ? ', ' + restaurant.zip : '') + (restaurant.city ? ' ' + restaurant.city : ''));
  if (restaurant.phone) zeilen.push('- Telefon: ' + restaurant.phone);
  if (restaurant.opening_time || restaurant.closing_time) {
    zeilen.push('- Oeffnungszeiten: ' + (restaurant.opening_time || '?').slice(0, 5) + ' bis ' + (restaurant.closing_time || '?').slice(0, 5) + ' Uhr' +
      (restaurant.opening_hours && restaurant.opening_hours.pause_enabled !== false
        ? ', Pause ' + (restaurant.opening_hours && restaurant.opening_hours.pause_start || '14:00') + ' bis ' + (restaurant.opening_hours && restaurant.opening_hours.pause_end || '17:00') + ' Uhr'
        : ''));
  }
  if (restaurant.description) zeilen.push('- Beschreibung: ' + restaurant.description);
  if (restaurant.delivery_fee != null) zeilen.push('- Liefergebuehr: ' + euro(restaurant.delivery_fee));

  zeilen.push('', 'DEINE AUFGABEN:');
  let nummer = 1;
  if (f.reservierung) {
    zeilen.push(nummer++ + '. Tischreservierungen aufnehmen: Datum, Uhrzeit, Personenzahl und Name erfragen (einzeln, nicht alles auf einmal). Relative Angaben wie "heute", "morgen", "Freitag" rechnest du selbst in ein Datum um. VOR jeder Zusage pruefe_verfuegbarkeit aufrufen. Nach reserviere_tisch die Reservierung in einem Satz bestaetigen.');
  } else {
    // Wichtig: sonst verspricht er Tische, die er nicht buchen kann
    zeilen.push(nummer++ + '. Reservierungen nimmst du NICHT auf - dieser Betrieb macht das selbst. Fragt jemand nach einem Tisch: freundlich einen Rueckruf notieren (rueckruf_wunsch).');
  }
  if (f.infos) {
    zeilen.push(nummer++ + '. Fragen beantworten (Oeffnungszeiten, Anfahrt, Speisekarte). Fuer Gerichte/Preise IMMER speisekarten_frage nutzen - nie raten.');
  } else {
    zeilen.push(nummer++ + '. Bei Fragen zur Speisekarte oder Bestellwuenschen: freundlich sagen, dass du dafuer einen Rueckruf notierst (rueckruf_wunsch).');
  }
  if (f.bestellung) {
    zeilen.push(nummer++ + '. Bestellungen fuer Abholung und Lieferung aufnehmen: Artikel einzeln erfragen, bei Unklarheit NACHFRAGEN statt raten. Dann pruefe_bestellung aufrufen und dem Gast ALLES vorlesen: jeden Artikel mit Menge und Extras, die Summe' +
      ', bei Lieferung die Adresse. Erst wenn der Gast JA sagt: speichere_bestellung mit vorgelesen_und_bestaetigt=true.',
    nummer++ + '. Liefert pruefe_bestellung einen zusatz_vorschlag, frage EINMAL beilaeufig-freundlich, ob das noch dazu soll (z.B. "Darf es noch ein Tiramisu fuer 5,90 dazu sein?"). Sagt der Gast Nein, sofort weitermachen - nie nachhaken, nie mehrmals anbieten.');
  } else if (f.infos) {
    zeilen.push(nummer++ + '. Bestellungen nimmst du NICHT auf - dafuer Rueckrufwunsch notieren.');
  }

  zeilen.push('',
    'EISERNE REGELN:',
    '- NIE etwas zusagen, was du nicht per Werkzeug geprueft hast. Bei Unsicherheit, Sonderfaellen (Gruppen ueber 10, Feiern, Reklamationen) oder wenn der Gast einen Menschen verlangt: rueckruf_wunsch nutzen und sauber verabschieden.',
    '- Antworten kurz halten: 1-2 Saetze, eine Frage pro Antwort. Keine Listen, keine Emojis - es wird vorgelesen.',
    '- Wo es passt, mit einer kurzen Bestaetigung beginnen ("Gerne.", "Alles klar.", "Einen Moment.") - so hoert der Gast sofort eine Reaktion.',
    '- Uhrzeiten wie "19:30" als "halb acht abends" oder "19 Uhr 30" aussprechen.',
    /* Am Telefon wird jedes Zeichen vorgelesen. "Herr/Frau Kuran" klingt wie
       ein ausgefuelltes Formular - und das Geschlecht kann der Assistent aus
       einem Namen ohnehin nicht wissen. Also gar keine Anrede. */
    '- NIEMALS "Herr/Frau" oder "Herr oder Frau" sagen. Das Geschlecht kennst du nicht.',
    '  Nutze den Namen allein ("Alles klar, Herr Kuran" nur wenn der Gast sich selbst so',
    '  vorgestellt hat) oder lass die Anrede ganz weg ("Alles klar, der Tisch ist reserviert").',
    '- Keine Schraegstriche, Klammern oder Abkuerzungen im Gesagten - alles wird vorgelesen.',
    '- Wenn alles erledigt ist: freundlich verabschieden und gespraech_beenden aufrufen.',
    '- Du bist ehrlich: auf Wunsch sagst du, dass du ein digitaler Assistent bist.');

  /* Anrede: im CRM eingestellt. Beim Doerpskrog duzt man, im Sternehaus
     nicht - und das falsche Wort merkt der Gast im ersten Satz. */
  if (restaurant.anrede === 'du') {
    zeilen.push('- Du duzt den Gast durchgehend ("du", "dir", "dein") - der Betrieb wuenscht das so. Trotzdem hoeflich bleiben.');
  } else {
    zeilen.push('- Du siezt den Gast durchgehend ("Sie", "Ihnen", "Ihr").');
  }

  /* Wissensbasis: im CRM gepflegte Fragen und Antworten. Ohne die sagt der
     Assistent bei allem ausserhalb von Karte und Oeffnungszeiten "das weiss
     ich nicht" - was den Gast genauso weit bringt wie ein Freizeichen. */
  const wissen = Array.isArray(restaurant.wissen) ? restaurant.wissen : [];
  if (wissen.length) {
    zeilen.push('');
    zeilen.push('HAEUFIGE FRAGEN (so beantworten, nicht abwandeln):');
    wissen.slice(0, 40).forEach((w) => {
      zeilen.push('- Frage: ' + w.frage + '  Antwort: ' + w.antwort);
    });
  }

  /* Weiterleitung: nur erwaehnen, wenn eine Nummer hinterlegt ist. Sonst
     verspricht der Assistent etwas, das er nicht halten kann. */
  if (restaurant.weiterleitung) {
    zeilen.push('');
    if (restaurant.weiterWann === 'unklar') {
      zeilen.push('WEITERLEITEN: Wenn du eine Frage nicht beantworten kannst oder der Gast '
        + 'jemanden sprechen moechte, biete an durchzustellen und rufe dann weiterleiten auf.');
    } else {
      zeilen.push('WEITERLEITEN: Nur wenn der Gast ausdruecklich einen Menschen sprechen moechte, '
        + 'biete an durchzustellen und rufe dann weiterleiten auf. Von dir aus bietest du es nicht an.');
    }
  }

  return zeilen.join('\n');
}

// --- Die Dialog-Sitzung ------------------------------------------------------------
class DialogSitzung {
  // datenquelle muss bieten: reservierungenAm, anzahlAktiveTische,
  // neueReservierung, neueBestellung, neuerBestellArtikel (siehe lib/supabase.js)
  constructor({ restaurant, menue, stufe, anrufer, datenquelle, kann, log }) {
    this.restaurant = restaurant;
    this.menue = menue || [];
    this.stufe = stufe || 1;
    this.anrufer = anrufer || '';
    this.daten = datenquelle;
    this.kann = kann || null; // was dieser Wirt annehmen will (nummern.json)
    this.log = log || (() => {});
    this.nachrichten = [];
    this.tools = baueTools(this.stufe, this.kann, this.restaurant);
    this.system = baueSystemPrompt(restaurant, this.stufe, this.anrufer, this.kann);
    this.beendet = false;
    this.letztePruefung = null; // Merker: zuletzt als frei geprueft
    this.buchungenGezaehlt = 0; // Reservierungen+Bestellungen in DIESEM Anruf
    this.maxBuchungen = parseInt(process.env.MAX_BUCHUNGEN_PRO_ANRUF || '3', 10);
    this.zusatzVorgeschlagen = false; // Zusatzverkauf: hoechstens EIN Vorschlag pro Anruf
    // Ergebnis dieses Anrufs - Grundlage fuer den Umsatz-Nachweis im Monats-Report
    this.statistik = { reservierungen: 0, gaeste: 0, bestellungen: 0, bestellwert: 0, rueckrufe: 0 };
  }

  begruessung() {
    // Gibt sich sofort als KI zu erkennen (Transparenzpflicht, EU AI Act).
    // Gesprochene Texte IMMER mit echten Umlauten (Aussprache!).

    /* Im CRM kann eine eigene Begruessung hinterlegt werden. Enthaelt sie
       keinen Hinweis auf die KI, haengen wir ihn an – die Transparenzpflicht
       gilt auch dann, wenn der Wirt sie beim Formulieren vergisst. */
    const eigen = String(this.restaurant.begruessung || '').trim();
    if (eigen) {
      return /assistent|k\.?i\.?\b|künstlich|digital|computer|automat/i.test(eigen)
        ? eigen
        : eigen + ' Ich bin übrigens ein digitaler Assistent.';
    }

    return 'Moin, hier ist der digitale KI-Assistent von ' + this.restaurant.name +
      '. Das Team ist gerade nicht am Apparat, aber ich kann für Sie reservieren oder eine Nachricht aufnehmen. Was kann ich für Sie tun?';
  }

  // Ein Gespraechsschritt: Nutzertext rein -> gesprochene Antwort raus.
  //
  // Mit onSatz (Telefon): fertige Saetze werden SOFORT gemeldet, waehrend
  // Claude noch schreibt - der Anrufer hoert die Antwort fast ohne Pause.
  // Der Aufrufer spricht dann NUR die onSatz-Saetze; der Rueckgabe-Text
  // dient als Protokoll. Ohne onSatz (Simulator, Browser-Demo): wie gehabt.
  async antwortAuf(nutzerText, onSatz) {
    this.nachrichten.push({ role: 'user', content: nutzerText });
    let beenden = false;
    const gesagte = [];
    let sofortGesagt = false;
    const sammler = onSatz ? new SatzSammler((satz) => { sofortGesagt = true; onSatz(satz); }) : null;

    // Werkzeug-Schleife: Claude darf mehrere Tools nacheinander nutzen
    for (let runde = 0; runde < 6; runde++) {
      const antwort = await this.claudeAnfrage(sammler ? (t) => sammler.fuettere(t) : null);
      if (sammler) sammler.spuelen(); // Restsatz vor Werkzeug-Lauf/Ende raus
      const textTeile = antwort.content.filter((b) => b.type === 'text').map((b) => b.text);
      const toolAufrufe = antwort.content.filter((b) => b.type === 'tool_use');
      this.nachrichten.push({ role: 'assistant', content: antwort.content });

      if (textTeile.length) gesagte.push(textTeile.join(' '));
      if (!toolAufrufe.length) break;

      const ergebnisse = [];
      for (const aufruf of toolAufrufe) {
        this.log('TOOL ' + aufruf.name + ' ' + JSON.stringify(aufruf.input));
        let ergebnis;
        try {
          ergebnis = await this.fuehreToolAus(aufruf.name, aufruf.input);
        } catch (e) {
          ergebnis = { fehler: 'Technisches Problem: ' + e.message + '. Biete dem Gast einen Rueckruf an.' };
        }
        if (ergebnis && ergebnis.__beenden) {
          beenden = true;
          if (ergebnis.abschiedsgruss) {
            gesagte.push(ergebnis.abschiedsgruss);
            // Abschied kommt aus dem Werkzeug, nicht aus Text-Deltas -
            // im Streaming-Fall also direkt weiterreichen.
            if (onSatz) { sofortGesagt = true; onSatz(ergebnis.abschiedsgruss); }
          }
          ergebnis = { ok: true };
        }
        this.log('  -> ' + JSON.stringify(ergebnis).slice(0, 300));
        ergebnisse.push({ type: 'tool_result', tool_use_id: aufruf.id, content: JSON.stringify(ergebnis) });
      }
      this.nachrichten.push({ role: 'user', content: ergebnisse });
      if (beenden) break;
    }

    if (beenden) this.beendet = true;
    const text = gesagte.join(' ').trim() || 'Entschuldigung, das habe ich nicht verstanden. Können Sie das wiederholen?';
    // Streaming-Fall ohne ein einziges Delta (z.B. leere Antwort): den
    // Fallback-Satz trotzdem hoerbar machen.
    if (onSatz && !sofortGesagt) onSatz(text);
    return { text, beenden };
  }

  async claudeAnfrage(onDelta) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY fehlt in .env');
    const antwort = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(30000), // haengt die API, nicht den ganzen Anruf blockieren
      body: JSON.stringify({
        model: process.env.CLAUDE_MODELL || 'claude-sonnet-5',
        max_tokens: 800, // genug fuer das komplette Vorlesen einer Bestellung (Stufe 3)
        /* Prompt-Caching: Systemprompt und Werkzeuge sind bei jedem Wortwechsel
           desselben Anrufs identisch - zusammen rund 1700 Token, die sonst
           sechs- bis achtmal voll bezahlt werden. Mit cache_control zahlt man
           sie einmal (plus 25 % fuers Anlegen) und danach zu einem Zehntel.
           Der Marker gehoert auf den system-Block: gecacht wird alles davor,
           also auch die Werkzeuge.

           Der Cache lebt fuenf Minuten - laenger als jedes Telefonat. Unter
           1024 Token ignoriert Anthropic ihn stillschweigend, das schadet
           nicht. Abschaltbar ueber PROMPT_CACHE=0, falls er je stoert. */
        system: process.env.PROMPT_CACHE === '0'
          ? this.system
          : [{ type: 'text', text: this.system, cache_control: { type: 'ephemeral' } }],
        tools: this.tools,
        stream: !!onDelta, // Telefon: Saetze schon beim Entstehen sprechen
        messages: this.nachrichten
      })
    });
    if (!antwort.ok) throw new Error('Claude-API ' + antwort.status + ': ' + (await antwort.text()).slice(0, 200));
    if (!onDelta) return antwort.json();
    return parseSseAntwort(antwort.body, onDelta);
  }

  // --- Werkzeuge -------------------------------------------------------------------
  async fuehreToolAus(name, input) {
    switch (name) {
      case 'pruefe_verfuegbarkeit': return this.toolPruefeVerfuegbarkeit(input);
      case 'reserviere_tisch': return this.toolReserviereTisch(input);
      case 'rueckruf_wunsch': return this.toolRueckruf(input);
      case 'speisekarten_frage': return this.toolSpeisekarte(input);
      case 'pruefe_bestellung': return this.toolPruefeBestellung(input);
      case 'speichere_bestellung': return this.toolSpeichereBestellung(input);
      case 'gespraech_beenden': return { __beenden: true, abschiedsgruss: input.abschiedsgruss || 'Vielen Dank für Ihren Anruf, bis bald!' };
      case 'weiterleiten': return {
        __weiterleiten: true,
        ansage: input.ansage || 'Einen Moment, ich stelle Sie durch.',
        grund: input.grund || ''
      };
      default: return { fehler: 'Unbekanntes Werkzeug ' + name };
    }
  }

  async toolPruefeVerfuegbarkeit({ datum, uhrzeit, personen }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(datum))) return { fehler: 'Datum bitte als JJJJ-MM-TT.' };
    if (String(datum) < datumHeute()) return { frei: false, grund: 'Das Datum liegt in der Vergangenheit.' };
    const [reservierungen, tische] = await Promise.all([
      this.daten.reservierungenAm(this.restaurant.id, datum),
      this.daten.anzahlAktiveTische(this.restaurant.id)
    ]);
    const ergebnis = pruefeSlot(this.restaurant, reservierungen, tische, datum, uhrzeit);
    if (ergebnis.frei) this.letztePruefung = datum + ' ' + normalisiereUhrzeit(uhrzeit);
    return {
      frei: ergebnis.frei,
      grund: ergebnis.grund,
      alternative_uhrzeiten: ergebnis.alternativen,
      hinweis_personen: personen > 8 ? 'Ueber 8 Personen: lieber Rueckruf anbieten, damit das Team plant.' : undefined
    };
  }

  async toolReserviereTisch({ gast_name, telefon, datum, uhrzeit, personen, hinweise }) {
    // Missbrauchsschutz: max. N Buchungen pro Anruf, danach nur noch Rueckruf.
    if (this.buchungenGezaehlt >= this.maxBuchungen) {
      return { gespeichert: false, fehler: 'Fuer weitere Reservierungen bitte einen Rueckruf anbieten (Limit pro Anruf erreicht).' };
    }
    // Sicherheitsnetz: direkt vor dem Schreiben NOCHMAL pruefen (kein Doppel-Booking,
    // auch wenn zwischen Pruefung und Zusage jemand online gebucht hat).
    const [reservierungen, tische] = await Promise.all([
      this.daten.reservierungenAm(this.restaurant.id, datum),
      this.daten.anzahlAktiveTische(this.restaurant.id)
    ]);
    const check = pruefeSlot(this.restaurant, reservierungen, tische, datum, uhrzeit);
    if (!check.frei) {
      return { gespeichert: false, grund: check.grund, alternative_uhrzeiten: check.alternativen };
    }
    const ergebnis = await this.daten.neueReservierung({
      restaurant_id: this.restaurant.id,
      reservation_date: datum,
      reservation_time: normalisiereUhrzeit(uhrzeit),
      guest_name: gast_name,
      guest_phone: telefon || this.anrufer || null,
      party_size: parseInt(personen, 10) || 2,
      status: process.env.RESERVIERUNG_STATUS || 'confirmed',
      source: 'telefon',
      notes: hinweise ? '[Telefon] ' + hinweise : '[Telefon]'
    });
    if (!ergebnis.ok) return { gespeichert: false, fehler: 'Speichern fehlgeschlagen (' + ergebnis.status + '). Biete einen Rueckruf an.' };
    this.buchungenGezaehlt++;
    this.statistik.reservierungen++;
    this.statistik.gaeste += parseInt(personen, 10) || 2;
    return { gespeichert: true, reservierung: { datum, uhrzeit: normalisiereUhrzeit(uhrzeit), personen, name: gast_name } };
  }

  async toolRueckruf({ telefon, name, anliegen }) {
    const nummer = telefon || this.anrufer || 'unbekannt';
    // Erst eigene callbacks-Tabelle versuchen; gibt es sie nicht, landet der
    // Wunsch als offene Anfrage in reservations (status pending) - so taucht
    // er sicher in den Dashboard-Benachrichtigungen auf.
    if (this.daten.resilienterInsert) {
      const direkt = await this.daten.resilienterInsert('callbacks', {
        restaurant_id: this.restaurant.id,
        phone: nummer,
        name: name || null,
        topic: anliegen,
        source: 'telefon',
        status: 'open'
      });
      if (direkt.ok) { this.statistik.rueckrufe++; return { notiert: true }; }
    }

    const fallback = await this.daten.neueReservierung({
      restaurant_id: this.restaurant.id,
      reservation_date: datumHeute(),
      reservation_time: '00:00',
      guest_name: (name || 'Anrufer') + ' (RUECKRUF)',
      guest_phone: nummer,
      party_size: 1,
      status: 'pending',
      source: 'telefon',
      notes: '[RUECKRUF ERBETEN] ' + anliegen + ' - Nummer: ' + nummer
    });
    if (!fallback.ok) return { notiert: false, fehler: 'Konnte nicht gespeichert werden - nenne dem Gast die Restaurantnummer ' + (this.restaurant.phone || '') };
    this.statistik.rueckrufe++;
    return { notiert: true };
  }

  toolSpeisekarte({ suchbegriff }) {
    if (!this.menue.length) return { treffer: [], hinweis: 'Keine Speisekarte hinterlegt - Rueckruf anbieten.' };
    const s = normalisiere(suchbegriff || '');
    const alle = this.menue.map((a) => ({
      name: a.name,
      preis: a.base_price != null ? a.base_price : a.price,
      beschreibung: a.description || '',
      kategorie: (a.menu_categories && a.menu_categories.name) || 'Speisen'
    }));
    if (!s) {
      const kategorien = {};
      alle.forEach((a) => { kategorien[a.kategorie] = (kategorien[a.kategorie] || 0) + 1; });
      return { ueberblick: Object.entries(kategorien).map(([k, n]) => k + ' (' + n + ' Gerichte)') };
    }
    const treffer = alle.filter((a) => normalisiere(a.name + ' ' + a.beschreibung + ' ' + a.kategorie).includes(s)).slice(0, 8);
    return { treffer };
  }

  // Artikel gegen die Speisekarte matchen (gemeinsam fuer pruefen + speichern)
  matcheArtikel(artikel) {
    const geprueft = [];
    const probleme = [];
    for (const a of artikel) {
      const gesucht = normalisiere(a.name);
      const kandidaten = this.menue.filter((m) => {
        const n = normalisiere(m.name);
        return n === gesucht || n.includes(gesucht) || gesucht.includes(n);
      });
      if (kandidaten.length === 0) {
        const aehnlich = this.menue
          .filter((m) => gesucht.split(' ').some((w) => w.length > 3 && normalisiere(m.name).includes(w)))
          .slice(0, 3).map((m) => m.name);
        probleme.push({ artikel: a.name, problem: 'Nicht auf der Speisekarte gefunden.', meintest_du: aehnlich });
        continue;
      }
      // Exakter Treffer gewinnt; sonst bei mehreren Kandidaten nachfragen lassen
      const exakt = kandidaten.find((m) => normalisiere(m.name) === gesucht);
      if (!exakt && kandidaten.length > 1) {
        probleme.push({ artikel: a.name, problem: 'Mehrdeutig - bitte beim Gast nachfragen.', kandidaten: kandidaten.slice(0, 4).map((m) => m.name) });
        continue;
      }
      const m = exakt || kandidaten[0];
      const einzelpreis = Number(m.base_price != null ? m.base_price : m.price) || 0;
      const menge = Math.max(1, parseInt(a.menge, 10) || 1);
      geprueft.push({ name: m.name, menge, einzelpreis, gesamt: einzelpreis * menge, extras: a.extras || '' });
    }
    return { geprueft, probleme };
  }

  // Zusatzverkauf: EIN passender Vorschlag (Dessert/Getraenk, sonst ein
  // beliebtes Gericht), das noch nicht in der Bestellung ist. Hoechstens
  // einmal pro Anruf - freundlich anbieten, ein Nein sofort akzeptieren.
  zusatzVorschlag(geprueft) {
    if (this.zusatzVorgeschlagen) return null;
    const bestellt = new Set(geprueft.map((a) => normalisiere(a.name)));
    const frei = this.menue.filter((m) => !bestellt.has(normalisiere(m.name)));
    const istZusatz = (m) => /getraenk|drink|dessert|nachspeise|nachtisch|eis|kuchen|suess/
      .test(normalisiere((m.menu_categories && m.menu_categories.name) || ''));
    const kandidaten = frei.filter(istZusatz);
    const wahl = kandidaten.find((m) => m.is_popular) || kandidaten[0] ||
      frei.find((m) => m.is_popular) || null;
    if (!wahl) return null;
    this.zusatzVorgeschlagen = true;
    const preis = Number(wahl.base_price != null ? wahl.base_price : wahl.price) || 0;
    return { name: wahl.name, preis: euro(preis) };
  }

  // DER MINDESTBESTELLWERT -- AUCH AM TELEFON.
  //
  // Gefragt am 26.08.2026 zu einer Lieferbestellung ueber 12,00 Euro bei
  // hinterlegten 15 Euro: "warum konnte er mit 12,00 liefern lassen".
  //
  // Der Wert steht in restaurants.min_order_value und liegt hier vor --
  // findeRestaurant() holt select=*. Benutzt hat ihn niemand. Die
  // Webseite prueft ihn im Browser, order-save seit heute auch auf dem
  // Server; der Telefon-Assistent schreibt aber DIREKT in die Tabelle,
  // an order-save vorbei. Fuer ihn galt die Regel nie.
  //
  // Am Telefon gehoert das nach VORN, nicht ans Ende: der Anrufer kann
  // etwas dazunehmen. Eine Absage, nachdem alles besprochen ist, waere
  // der schlechteste Weg -- und eine stille Annahme unter dem Mindestwert
  // laesst den Wirt umsonst losfahren.
  mindestbestellwert(typ) {
    if (typ !== 'lieferung') return 0;
    return Number(this.restaurant.min_order_value) || 0;
  }

  toolPruefeBestellung({ typ, artikel }) {
    if (!this.menue.length) return { fehler: 'Keine Speisekarte hinterlegt - Rueckruf anbieten.' };
    const { geprueft, probleme } = this.matcheArtikel(artikel || []);
    if (probleme.length) return { ok: false, probleme };
    const zwischensumme = geprueft.reduce((s, a) => s + a.gesamt, 0);
    const liefergebuehr = typ === 'lieferung' ? (Number(this.restaurant.delivery_fee) || 0) : 0;
    const summe = zwischensumme + liefergebuehr;
    const zusatz = this.zusatzVorschlag(geprueft);

    // Fehlt etwas zum Mindestbestellwert, erfaehrt der Assistent es HIER
    // -- also bevor er die Summe vorliest. Dann kann er fragen, ob noch
    // etwas dazu soll, statt am Ende absagen zu muessen.
    const mindest = this.mindestbestellwert(typ);
    const fehlt = mindest > 0 ? mindest - zwischensumme : 0;

    return {
      ok: true,
      mindestbestellwert: mindest > 0 ? {
        betrag: euro(mindest),
        erreicht: fehlt <= 0,
        fehlt: fehlt > 0 ? euro(fehlt) : null,
        hinweis: fehlt > 0
          ? ('Der Mindestbestellwert fuer Lieferung ist ' + euro(mindest) + '. Es fehlen noch '
             + euro(fehlt) + '. Dem Gast freundlich sagen und fragen, ob noch etwas dazu soll -- '
             + 'oder Abholung anbieten. NICHT speichern, solange es nicht erreicht ist.')
          : undefined
      } : undefined,
      zum_vorlesen: {
        artikel: geprueft.map((a) => a.menge + 'x ' + a.name + (a.extras ? ' (' + a.extras + ')' : '') + ' zu ' + euro(a.gesamt)),
        liefergebuehr: liefergebuehr ? euro(liefergebuehr) : null,
        gesamtsumme: euro(summe)
      },
      zusatz_vorschlag: zusatz
        ? { artikel: zusatz.name + ' fuer ' + zusatz.preis, hinweis: 'VOR dem Vorlesen EINMAL freundlich fragen, ob das noch dazu soll. Ein Nein sofort akzeptieren, nicht nachhaken.' }
        : undefined
    };
  }

  async toolSpeichereBestellung({ typ, artikel, kunde_name, telefon, adresse, vorgelesen_und_bestaetigt }) {
    if (this.buchungenGezaehlt >= this.maxBuchungen) {
      return { gespeichert: false, fehler: 'Fuer weitere Bestellungen bitte einen Rueckruf anbieten (Limit pro Anruf erreicht).' };
    }
    if (!vorgelesen_und_bestaetigt) {
      return { gespeichert: false, fehler: 'Erst die komplette Bestellung mit Summe vorlesen und den Gast bestaetigen lassen!' };
    }
    if (typ === 'lieferung' && !adresse) {
      return { gespeichert: false, fehler: 'Bei Lieferung ist die Adresse Pflicht - bitte erfragen.' };
    }
    const { geprueft, probleme } = this.matcheArtikel(artikel || []);
    if (probleme.length) return { gespeichert: false, probleme };
    if (!geprueft.length) return { gespeichert: false, fehler: 'Keine Artikel in der Bestellung.' };

    const zwischensumme = geprueft.reduce((s, a) => s + a.gesamt, 0);
    const liefergebuehr = typ === 'lieferung' ? (Number(this.restaurant.delivery_fee) || 0) : 0;
    const summe = zwischensumme + liefergebuehr;

    // UND HIER WIRD ES VERBINDLICH.
    // Die Meldung in toolPruefeBestellung ist ein Hinweis fuer den
    // Assistenten -- der kann sie ueberlesen. Das hier ist die Regel:
    // unter dem Mindestbestellwert wird nicht gespeichert. Gerechnet wird
    // gegen den Warenwert ohne Liefergebuehr, genau wie im Warenkorb der
    // Webseite -- sonst haette man zwei verschiedene Mindestwerte.
    const mindestSpeichern = this.mindestbestellwert(typ);
    if (mindestSpeichern > 0 && zwischensumme < mindestSpeichern) {
      return {
        gespeichert: false,
        fehler: 'Mindestbestellwert fuer Lieferung ist ' + euro(mindestSpeichern)
              + ', die Bestellung liegt bei ' + euro(zwischensumme)
              + '. Dem Gast sagen und anbieten, noch etwas dazuzunehmen oder abzuholen.'
      };
    }

    // GLEICHES Nummern-Format wie die Online-Bestellung (KI-JJMMTT-XXXXXX)
    const jetzt = new Date();
    const datumsCode = String(jetzt.getFullYear()).slice(-2) +
      String(jetzt.getMonth() + 1).padStart(2, '0') + String(jetzt.getDate()).padStart(2, '0');
    const bestellNummer = 'KI-' + datumsCode + '-' + String(Math.floor(Math.random() * 1000000)).padStart(6, '0');

    const ergebnis = await this.daten.neueBestellung({
      order_number: bestellNummer,
      restaurant_id: this.restaurant.id,
      restaurant_name: this.restaurant.name || '',
      status: 'received',
      order_type: typ === 'lieferung' ? 'delivery' : 'pickup',
      customer_name: kunde_name,
      customer_phone: telefon || this.anrufer || '',
      delivery_address: typ === 'lieferung' ? adresse : null,
      items: geprueft.map((a) => ({
        name: a.name, quantity: a.menge, price: a.gesamt, unit_price: a.einzelpreis, options: a.extras || ''
      })),
      subtotal: zwischensumme,
      delivery_fee: liefergebuehr,
      tip: 0,
      total: summe,
      payment_method: 'cash',
      customer_notes: '[Telefon] Bestellung telefonisch aufgenommen und vom Gast bestaetigt.',
      source: 'telefon'
    });
    if (!ergebnis.ok) return { gespeichert: false, fehler: 'Speichern fehlgeschlagen (' + ergebnis.status + '). Rueckruf anbieten.' };
    this.buchungenGezaehlt++;
    this.statistik.bestellungen++;
    this.statistik.bestellwert += summe;

    // order_items sekundaer speichern (Dashboard nutzt sonst die items-Spalte)
    const bestellId = ergebnis.daten && ergebnis.daten.id;
    if (bestellId) {
      for (const a of geprueft) {
        await this.daten.neuerBestellArtikel({
          order_id: bestellId,
          item_name: a.name,
          quantity: a.menge,
          base_price: a.einzelpreis,
          unit_price: a.einzelpreis,
          total_price: a.gesamt,
          selected_options: a.extras ? [{ option: a.extras }] : []
        }).catch(() => {});
      }
    }
    return { gespeichert: true, bestellnummer: bestellNummer, summe: euro(summe), typ };
  }
}

module.exports = {
  DialogSitzung, baueTools, baueSystemPrompt, baueFaehigkeiten, SatzSammler, parseSseAntwort
};
