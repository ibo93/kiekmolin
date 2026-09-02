'use strict';
// ============================================================
//  Telefon-Wache
//
//  Beantwortet fuer JEDEN betreuten Betrieb die Frage, die man
//  sonst erst stellt, wenn der Wirt anruft: Laeuft es gerade?
//
//  Warum das noetig ist: Der Assistent kann auf drei Arten
//  ausfallen, und keine davon meldet sich von selbst.
//    1. Der Server ist weg          -> niemand nimmt ab
//    2. Der Webhook zeigt woandershin -> Twilio ruft ins Leere
//    3. Das Guthaben ist alle       -> Twilio nimmt keine Anrufe an
//  Alle drei sehen fuer den Wirt gleich aus: Es klingelt, und
//  nichts passiert. Deshalb prueft die Wache alle drei getrennt
//  und sagt, welche zutrifft.
//
//  Die Anrufzahlen kommen von Twilio, nicht aus unseren Logs.
//  Grund: Wenn der Assistent abstuerzt, schreibt er auch kein
//  Log mehr - dann saehe die Wache null Anrufe und meldete
//  "alles ruhig", waehrend in Wirklichkeit Gaeste anriefen und
//  niemand ranging. Twilio zaehlt unabhaengig von uns.
// ============================================================

const https = require('https');

/* Twilio antwortet auf einen einfachen GET. Kein SDK - eine Abhaengigkeit
   weniger, und wir brauchen genau zwei Abfragen. */
function twilioGet(pfad, sid, token) {
  return new Promise((fertig, fehler) => {
    const anfrage = https.request(
      { hostname: 'api.twilio.com', path: pfad, method: 'GET',
        auth: sid + ':' + token, timeout: 12000 },
      (antwort) => {
        let text = '';
        antwort.on('data', (d) => { text += d; });
        antwort.on('end', () => {
          try {
            const daten = JSON.parse(text);
            if (antwort.statusCode >= 400) {
              fehler(new Error(daten.message || ('HTTP ' + antwort.statusCode)));
            } else {
              fertig(daten);
            }
          } catch (e) { fehler(new Error('Antwort unlesbar: ' + e.message)); }
        });
      }
    );
    anfrage.on('timeout', () => { anfrage.destroy(); fehler(new Error('Twilio antwortet nicht')); });
    anfrage.on('error', fehler);
    anfrage.end();
  });
}

const ziffern = (s) => String(s || '').replace(/\D/g, '');

/* Zwei Nummern sind dieselbe, wenn die letzten neun Ziffern passen.
   +49, 0049 und die fuehrende Null stoeren sonst jeden Vergleich. */
function gleicheNummer(a, b) {
  const x = ziffern(a), y = ziffern(b);
  if (!x || !y) return false;
  return x.slice(-9) === y.slice(-9);
}

function tagesBeginn(jetzt) {
  const d = new Date(jetzt);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* Anrufe eines Zeitraums holen. Twilio filtert selbst nach Datum, das
   spart Uebertragung - und die Seitengroesse deckelt Ausreisser. */
async function holeAnrufe(sid, token, seit) {
  const datum = seit.toISOString().slice(0, 10);
  const d = await twilioGet(
    '/2010-04-01/Accounts/' + sid + '/Calls.json'
    + '?StartTime%3E=' + datum + '&PageSize=200',
    sid, token
  );
  return (d.calls || []).map((c) => ({
    von: c.from, an: c.to,
    zeit: c.start_time, dauer: Number(c.duration || 0),
    zustand: c.status, richtung: c.direction,
    preis: c.price ? Math.abs(Number(c.price)) : 0
  }));
}

/* Ist der Assistent erreichbar, und welche Betriebe kennt er?

   Zwei Versuche, nicht einer: Ein einzelner langsamer Aufruf hat im Test
   sofort "nicht erreichbar" gemeldet, obwohl der Server lief. Eine Wache,
   die bei jedem Netzhaenger Alarm schlaegt, wird nach einer Woche
   weggeklickt - und meldet dann auch den echten Ausfall an niemanden. */
async function einmalFragen(basisUrl, msFrist) {
  const steuer = new AbortController();
  const t = setTimeout(() => steuer.abort(), msFrist);
  try {
    const antwort = await fetch(basisUrl + '/health', { signal: steuer.signal });
    if (!antwort.ok) return { erreichbar: false, grund: 'HTTP ' + antwort.status };
    const d = await antwort.json();
    return {
      erreichbar: true,
      betriebe: Array.isArray(d.restaurants) ? d.restaurants : [],
      stufe: d.stufe
    };
  } catch (e) {
    return { erreichbar: false, grund: e.name === 'AbortError' ? 'antwortet nicht' : e.message };
  } finally {
    clearTimeout(t);
  }
}

async function assistentZustand(basisUrl) {
  const erster = await einmalFragen(basisUrl, 6000);
  if (erster.erreichbar) return erster;
  await new Promise((w) => setTimeout(w, 1200));
  const zweiter = await einmalFragen(basisUrl, 6000);
  /* Erst wenn beide Versuche scheitern, gilt er als weg. */
  return zweiter;
}

/* Eine Zahl, die man ohne Nachdenken lesen kann. */
function stundenSeit(zeitIso, jetzt) {
  if (!zeitIso) return null;
  const t = new Date(zeitIso).getTime();
  if (isNaN(t)) return null;
  return Math.floor((jetzt - t) / 3600000);
}

/* ============================================================
   Der Hauptaufruf: ein Bild ueber alle Betriebe.
   ============================================================ */
/*  telefonUrl    - wie WIR den Assistenten erreichen (im Compose-Netz
                    z.B. http://telefon-retter:3100)
    oeffentlicheUrl - wie TWILIO ihn erreicht (https://telefon.kiekmolin.de)
    Die beiden sind nicht dieselbe Adresse. Wer sie verwechselt, prueft den
    Webhook gegen eine Adresse, die von aussen nie erreichbar waere. */
async function wache({ sid, token, telefonUrl, oeffentlicheUrl, kunden, jetzt }) {
  const nun = jetzt || Date.now();
  const heuteAb = tagesBeginn(nun);
  const wocheAb = new Date(nun - 7 * 86400000);

  const ergebnis = {
    zeit: new Date(nun).toISOString(),
    gesamt: { erreichbar: false, guthaben: null, waehrung: '', warnungen: [] },
    betriebe: []
  };

  /* --- Laeuft der Assistent ueberhaupt? --- */
  const az = await assistentZustand(telefonUrl);
  ergebnis.gesamt.erreichbar = az.erreichbar;
  ergebnis.gesamt.stufe = az.stufe;
  if (!az.erreichbar) {
    ergebnis.gesamt.warnungen.push({
      schwere: 'schwer',
      text: 'Der Assistent ist nicht erreichbar (' + (az.grund || 'unbekannt') + '). '
          + 'Solange nimmt bei KEINEM Betrieb jemand ab.'
    });
  }

  /* --- Guthaben und Anrufe von Twilio --- */
  let anrufe = [];
  let nummern = [];
  if (sid && token) {
    try {
      const g = await twilioGet('/2010-04-01/Accounts/' + sid + '/Balance.json', sid, token);
      ergebnis.gesamt.guthaben = Number(g.balance);
      ergebnis.gesamt.waehrung = g.currency || 'USD';
      /* Unter zwei Dollar reicht es fuer keinen vollen Tag mehr. */
      if (ergebnis.gesamt.guthaben < 2) {
        ergebnis.gesamt.warnungen.push({
          schwere: 'schwer',
          text: 'Twilio-Guthaben fast leer (' + g.balance + ' ' + g.currency
              + '). Ist es aufgebraucht, nimmt Twilio keine Anrufe mehr an.'
        });
      } else if (ergebnis.gesamt.guthaben < 5) {
        ergebnis.gesamt.warnungen.push({
          schwere: 'mittel',
          text: 'Twilio-Guthaben wird knapp (' + g.balance + ' ' + g.currency + ').'
        });
      }
    } catch (e) {
      ergebnis.gesamt.warnungen.push({ schwere: 'mittel', text: 'Guthaben nicht abrufbar: ' + e.message });
    }

    try { anrufe = await holeAnrufe(sid, token, wocheAb); }
    catch (e) {
      ergebnis.gesamt.warnungen.push({ schwere: 'mittel', text: 'Anrufliste nicht abrufbar: ' + e.message });
    }

    try {
      const d = await twilioGet('/2010-04-01/Accounts/' + sid + '/IncomingPhoneNumbers.json?PageSize=100', sid, token);
      nummern = (d.incoming_phone_numbers || []).map((n) => ({
        nummer: n.phone_number, webhook: n.voice_url || '', name: n.friendly_name || ''
      }));
    } catch (_e) { /* ohne Nummernliste faellt nur die Webhook-Pruefung weg */ }
  }

  /* --- Je Betrieb --- */
  const erwarteterWebhook = oeffentlicheUrl
    ? String(oeffentlicheUrl).replace(/\/$/, '') + '/anruf' : null;
  if (!erwarteterWebhook) {
    /* Ohne die oeffentliche Adresse laesst sich nicht sagen, ob ein Webhook
       richtig zeigt. Das offen sagen, statt stillschweigend alles gruen. */
    ergebnis.gesamt.warnungen.push({
      schwere: 'mittel',
      text: 'BASE_URL fehlt - die Webhooks lassen sich nicht pruefen.'
    });
  }

  for (const k of (kunden || [])) {
    const seine = anrufe.filter((a) => gleicheNummer(a.an, k.nummer));
    const heute = seine.filter((a) => new Date(a.zeit) >= heuteAb);
    const letzter = seine.length
      ? seine.slice().sort((a, b) => new Date(b.zeit) - new Date(a.zeit))[0] : null;

    const nummerBeiTwilio = nummern.find((n) => gleicheNummer(n.nummer, k.nummer));
    const warnungen = [];

    /* Ohne bekannte oeffentliche Adresse ist der Webhook nicht pruefbar.
       Das darf nicht als "alles gut" durchgehen - ungeprueft ist gelb,
       nicht gruen. Eine Wache, die Unwissen fuer Ordnung haelt, ist
       schlimmer als keine. */
    if (!erwarteterWebhook) {
      warnungen.push({
        schwere: 'mittel',
        text: 'Ob der Webhook richtig zeigt, laesst sich nicht pruefen (BASE_URL fehlt).'
      });
    }

    if (!nummerBeiTwilio && nummern.length) {
      warnungen.push({
        schwere: 'schwer',
        text: 'Die Nummer gehoert nicht zu diesem Twilio-Konto. Kein Anruf kann ankommen.'
      });
    } else if (nummerBeiTwilio && erwarteterWebhook
               && nummerBeiTwilio.webhook !== erwarteterWebhook) {
      warnungen.push({
        schwere: 'schwer',
        text: 'Der Webhook zeigt auf "' + (nummerBeiTwilio.webhook || 'nichts')
            + '" statt auf den Assistenten. Es klingelt, aber niemand geht ran.'
      });
    }

    if (az.erreichbar && az.betriebe && az.betriebe.length
        && k.name && !az.betriebe.some((n) => String(n).toLowerCase() === String(k.name).toLowerCase())) {
      warnungen.push({
        schwere: 'mittel',
        text: 'Der Assistent kennt diesen Betrieb nicht. Anrufe landen beim Standard-Betrieb.'
      });
    }

    /* Kein Anruf seit ueber einer Woche ist bei einem Restaurant
       ungewoehnlich - meist stimmt dann die Umleitung nicht mehr. */
    const stunden = letzter ? stundenSeit(letzter.zeit, nun) : null;
    if (seine.length === 0) {
      warnungen.push({
        schwere: 'hinweis',
        text: 'In den letzten sieben Tagen kein einziger Anruf. Steht die Rufumleitung beim Wirt noch?'
      });
    }

    const angenommen = seine.filter((a) => a.dauer > 0).length;

    ergebnis.betriebe.push({
      name: k.name,
      nummer: k.nummer,
      stufe: k.stufe ?? null,
      webhook: nummerBeiTwilio ? nummerBeiTwilio.webhook : null,
      webhookRichtig: !!(nummerBeiTwilio && erwarteterWebhook && nummerBeiTwilio.webhook === erwarteterWebhook),
      anrufeHeute: heute.length,
      anrufeWoche: seine.length,
      angenommen,
      /* Die Quote sagt mehr als die Zahl: 20 Anrufe, davon 2 angenommen,
         ist ein Problem - 20 von 20 ist ein guter Tag. */
      quote: seine.length ? Math.round(angenommen / seine.length * 100) : null,
      schnittSekunden: angenommen
        ? Math.round(seine.filter((a) => a.dauer > 0).reduce((s, a) => s + a.dauer, 0) / angenommen) : 0,
      letzterAnruf: letzter ? { zeit: letzter.zeit, von: letzter.von, dauer: letzter.dauer, zustand: letzter.zustand } : null,
      stundenSeitLetztem: stunden,
      /* Fuer die Tageskurve: welche Stunde wie viele Anrufe. */
      stunden: verteilungNachStunde(seine),
      warnungen,
      ampel: !az.erreichbar || warnungen.some((w) => w.schwere === 'schwer') ? 'rot'
           : warnungen.some((w) => w.schwere === 'mittel') ? 'gelb' : 'gruen'
    });
  }

  /* Anrufe auf Nummern, die keinem Betrieb zugeordnet sind - sonst
     verschwinden sie lautlos aus der Statistik. */
  const zugeordnet = (kunden || []).map((k) => k.nummer);
  const fremde = anrufe.filter((a) => !zugeordnet.some((n) => gleicheNummer(a.an, n)));
  if (fremde.length) {
    ergebnis.gesamt.warnungen.push({
      schwere: 'hinweis',
      text: fremde.length + ' Anruf(e) auf Nummern, die keinem Betrieb zugeordnet sind.'
    });
  }

  return ergebnis;
}

/* Anrufe je Stunde (0-23). Zeigt, wann der Assistent wirklich gebraucht
   wird - und ob die Nachtruhe richtig sitzt. */
function verteilungNachStunde(anrufe) {
  const eimer = new Array(24).fill(0);
  for (const a of anrufe) {
    const d = new Date(a.zeit);
    if (!isNaN(d)) eimer[d.getHours()]++;
  }
  return eimer;
}

module.exports = { wache, gleicheNummer, verteilungNachStunde, stundenSeit };
