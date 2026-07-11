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

// --- Werkzeug-Definitionen fuer Claude -------------------------------------------
function baueTools(stufe) {
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

  if (stufe >= 2) {
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

  if (stufe >= 3) {
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

  return tools;
}

// --- System-Prompt ---------------------------------------------------------------
function baueSystemPrompt(restaurant, stufe, anrufer) {
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

  zeilen.push('',
    'DEINE AUFGABEN:',
    '1. Tischreservierungen aufnehmen: Datum, Uhrzeit, Personenzahl und Name erfragen (einzeln, nicht alles auf einmal). Relative Angaben wie "heute", "morgen", "Freitag" rechnest du selbst in ein Datum um. VOR jeder Zusage pruefe_verfuegbarkeit aufrufen. Nach reserviere_tisch die Reservierung in einem Satz bestaetigen.');
  if (stufe >= 2) {
    zeilen.push('2. Fragen beantworten (Oeffnungszeiten, Anfahrt, Speisekarte). Fuer Gerichte/Preise IMMER speisekarten_frage nutzen - nie raten.');
  } else {
    zeilen.push('2. Bei Fragen zur Speisekarte oder Bestellwuenschen: freundlich sagen, dass du dafuer einen Rueckruf notierst (rueckruf_wunsch).');
  }
  if (stufe >= 3) {
    zeilen.push('3. Bestellungen fuer Abholung und Lieferung aufnehmen: Artikel einzeln erfragen, bei Unklarheit NACHFRAGEN statt raten. Dann pruefe_bestellung aufrufen und dem Gast ALLES vorlesen: jeden Artikel mit Menge und Extras, die Summe' +
      ', bei Lieferung die Adresse. Erst wenn der Gast JA sagt: speichere_bestellung mit vorgelesen_und_bestaetigt=true.');
  } else if (stufe >= 2) {
    zeilen.push('3. Bestellungen nimmst du noch NICHT auf - dafuer Rueckrufwunsch notieren.');
  }

  zeilen.push('',
    'EISERNE REGELN:',
    '- NIE etwas zusagen, was du nicht per Werkzeug geprueft hast. Bei Unsicherheit, Sonderfaellen (Gruppen ueber 10, Feiern, Reklamationen) oder wenn der Gast einen Menschen verlangt: rueckruf_wunsch nutzen und sauber verabschieden.',
    '- Antworten kurz halten: 1-2 Saetze, eine Frage pro Antwort. Keine Listen, keine Emojis - es wird vorgelesen.',
    '- Uhrzeiten wie "19:30" als "halb acht abends" oder "19 Uhr 30" aussprechen.',
    '- Wenn alles erledigt ist: freundlich verabschieden und gespraech_beenden aufrufen.',
    '- Du bist ehrlich: auf Wunsch sagst du, dass du ein digitaler Assistent bist.');

  return zeilen.join('\n');
}

// --- Die Dialog-Sitzung ------------------------------------------------------------
class DialogSitzung {
  // datenquelle muss bieten: reservierungenAm, anzahlAktiveTische,
  // neueReservierung, neueBestellung, neuerBestellArtikel (siehe lib/supabase.js)
  constructor({ restaurant, menue, stufe, anrufer, datenquelle, log }) {
    this.restaurant = restaurant;
    this.menue = menue || [];
    this.stufe = stufe || 1;
    this.anrufer = anrufer || '';
    this.daten = datenquelle;
    this.log = log || (() => {});
    this.nachrichten = [];
    this.tools = baueTools(this.stufe);
    this.system = baueSystemPrompt(restaurant, this.stufe, this.anrufer);
    this.beendet = false;
    this.letztePruefung = null; // Merker: zuletzt als frei geprueft
    this.buchungenGezaehlt = 0; // Reservierungen+Bestellungen in DIESEM Anruf
    this.maxBuchungen = parseInt(process.env.MAX_BUCHUNGEN_PRO_ANRUF || '3', 10);
  }

  begruessung() {
    // Gibt sich sofort als KI zu erkennen (Transparenzpflicht, EU AI Act).
    return 'Moin, hier ist der digitale KI-Assistent von ' + this.restaurant.name +
      '. Das Team ist gerade nicht am Apparat, aber ich kann fuer Sie reservieren oder eine Nachricht aufnehmen. Was kann ich fuer Sie tun?';
  }

  // Ein Gespraechsschritt: Nutzertext rein -> gesprochene Antwort raus.
  async antwortAuf(nutzerText) {
    this.nachrichten.push({ role: 'user', content: nutzerText });
    let beenden = false;
    const gesagte = [];

    // Werkzeug-Schleife: Claude darf mehrere Tools nacheinander nutzen
    for (let runde = 0; runde < 6; runde++) {
      const antwort = await this.claudeAnfrage();
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
          if (ergebnis.abschiedsgruss) gesagte.push(ergebnis.abschiedsgruss);
          ergebnis = { ok: true };
        }
        this.log('  -> ' + JSON.stringify(ergebnis).slice(0, 300));
        ergebnisse.push({ type: 'tool_result', tool_use_id: aufruf.id, content: JSON.stringify(ergebnis) });
      }
      this.nachrichten.push({ role: 'user', content: ergebnisse });
      if (beenden) break;
    }

    if (beenden) this.beendet = true;
    return {
      text: gesagte.join(' ').trim() || 'Entschuldigung, das habe ich nicht verstanden. Koennen Sie das wiederholen?',
      beenden
    };
  }

  async claudeAnfrage() {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY fehlt in .env');
    const antwort = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(20000), // haengt die API, nicht den ganzen Anruf blockieren
      body: JSON.stringify({
        model: process.env.CLAUDE_MODELL || 'claude-sonnet-5',
        max_tokens: 800, // genug fuer das komplette Vorlesen einer Bestellung (Stufe 3)
        system: this.system,
        tools: this.tools,
        messages: this.nachrichten
      })
    });
    if (!antwort.ok) throw new Error('Claude-API ' + antwort.status + ': ' + (await antwort.text()).slice(0, 200));
    return antwort.json();
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
      case 'gespraech_beenden': return { __beenden: true, abschiedsgruss: input.abschiedsgruss || 'Vielen Dank fuer Ihren Anruf, bis bald!' };
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
      if (direkt.ok) return { notiert: true };
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

  toolPruefeBestellung({ typ, artikel }) {
    if (!this.menue.length) return { fehler: 'Keine Speisekarte hinterlegt - Rueckruf anbieten.' };
    const { geprueft, probleme } = this.matcheArtikel(artikel || []);
    if (probleme.length) return { ok: false, probleme };
    const zwischensumme = geprueft.reduce((s, a) => s + a.gesamt, 0);
    const liefergebuehr = typ === 'lieferung' ? (Number(this.restaurant.delivery_fee) || 0) : 0;
    const summe = zwischensumme + liefergebuehr;
    return {
      ok: true,
      zum_vorlesen: {
        artikel: geprueft.map((a) => a.menge + 'x ' + a.name + (a.extras ? ' (' + a.extras + ')' : '') + ' zu ' + euro(a.gesamt)),
        liefergebuehr: liefergebuehr ? euro(liefergebuehr) : null,
        gesamtsumme: euro(summe)
      }
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

module.exports = { DialogSitzung, baueTools, baueSystemPrompt };
