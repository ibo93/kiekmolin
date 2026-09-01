'use strict';

// Datenquelle fuer Betriebe OHNE Kiek mol in.
//
// Der Telefon-Retter soll auch allein verkaufbar sein: ein Wirt mit eigener
// Webseite, der nur seine verpassten Anrufe retten will. Dann gibt es keine
// Kiek-mol-in-Datenbank, in die man schreiben koennte.
//
// Diese Ablage bietet GENAU dieselben Funktionen wie lib/supabase.js
// (reservierungenAm, anzahlAktiveTische, neueReservierung, neueBestellung,
// neuerBestellArtikel) - der Dialog merkt keinen Unterschied. Gespeichert
// wird in einer JSONL-Datei pro Betrieb, und jede Buchung geht sofort per
// SMS/E-Mail an den Wirt.
//
// GOLDENE REGEL bleibt: An der Kiek-mol-in-Datenbank wird hier nichts
// angefasst. Diese Kunden liegen komplett getrennt.

const fs = require('fs');
const path = require('path');
const { melde } = require('./benachrichtigung');

const ORDNER = path.join(__dirname, '..', 'kunden-daten');

function datei(slug) {
  return path.join(ORDNER, String(slug).replace(/[^a-z0-9-]/gi, '_') + '.jsonl');
}

function schreibe(slug, eintrag) {
  fs.mkdirSync(ORDNER, { recursive: true });
  fs.appendFileSync(datei(slug), JSON.stringify(eintrag) + '\n');
}

/* Telefonnummern vergleichbar machen: 0491/123, +49491123 und 0491 123 sind
   derselbe Gast. Sonst erkennt man Stammgaeste nicht wieder und sagt die
   falsche Reservierung ab. */
function nummerSchluessel(nummer) {
  const roh = String(nummer || '').replace(/[^0-9+]/g, '');
  if (!roh) return '';
  return roh.replace(/^\+49/, '0').replace(/^0049/, '0');
}

function liesAlle(slug) {
  let zeilen;
  try {
    zeilen = fs.readFileSync(datei(slug), 'utf8').split('\n').filter(Boolean)
      .map((z) => { try { return JSON.parse(z); } catch (_e) { return null; } })
      .filter(Boolean);
  } catch (_e) {
    return []; // noch keine Buchung - kein Fehler
  }

  /* Die Datei wird nur angehaengt, nie umgeschrieben. Eine Absage kommt
     deshalb als eigener Eintrag dazu - und muss hier auf die zugehoerige
     Reservierung angewandt werden. Ohne das bliebe der Tisch belegt,
     obwohl der Gast abgesagt hat. */
  const storniert = new Set(
    zeilen.filter((e) => e.art === 'storno').map((e) => e.storniert)
  );
  return zeilen
    .filter((e) => e.art !== 'storno')
    .map((e) => (storniert.has(e.zeit) ? Object.assign({}, e, { status: 'cancelled' }) : e));
}

function uhrzeitText(zeit) {
  return String(zeit || '').slice(0, 5);
}

function euro(n) {
  return Number(n || 0).toFixed(2).replace('.', ',') + ' EUR';
}

// Erzeugt die Datenquelle fuer EINEN externen Betrieb.
// kunde: { slug, name, tische, melden: { sms, email } }
function baueAblage(kunde, log) {
  const slug = kunde.slug;
  const sagen = log || (() => {});
  const melden = kunde.melden || {};

  // Nach dem Speichern den Wirt informieren - im Hintergrund, damit das
  // Gespraech nicht auf die SMS warten muss.
  const informiere = (betreff, text) => {
    melde(melden, betreff, text)
      .then((e) => {
        if (e.ok) sagen('Wirt benachrichtigt (' + e.wege.filter((w) => w.ok).map((w) => w.weg).join(', ') + ')');
        else sagen('ACHTUNG: Wirt NICHT benachrichtigt - ' + (e.grund || e.wege.map((w) => w.weg + ': ' + w.grund).join('; ')));
      })
      .catch((f) => sagen('Benachrichtigung fehlgeschlagen: ' + f.message));
  };

  return {
    extern: true,

    // Reservierungen eines Tages - im Format, das der Dialog erwartet
    async reservierungenAm(_restaurantId, datum) {
      /* Abgesagte zaehlen nicht mehr zur Belegung - sonst bleibt der Tisch
         blockiert, obwohl der Gast abgesagt hat. Genau dafuer gibt es die
         Absage. Der Status kommt aus liesAlle, das Stornos beruecksichtigt;
         frueher stand hier pauschal 'confirmed'. */
      return liesAlle(slug)
        .filter((e) => e.art === 'reservierung' && e.reservation_date === datum
                    && e.status !== 'cancelled')
        .map((e) => ({
          reservation_time: e.reservation_time, status: e.status || 'confirmed',
          table_id: null, party_size: e.party_size
        }));
    },

    // Wie viele Tische hat der Betrieb? Steht in der Kundendatei.
    // Ohne Angabe nehmen wir 8 - lieber vorsichtig als ueberbuchen.
    async anzahlAktiveTische() {
      const n = parseInt(kunde.tische, 10);
      return n > 0 ? n : 8;
    },

    async neueReservierung(payload) {
      const eintrag = Object.assign({ art: 'reservierung', zeit: new Date().toISOString() }, payload);
      try {
        schreibe(slug, eintrag);
      } catch (e) {
        return { ok: false, status: 0, text: 'Konnte nicht speichern: ' + e.message };
      }
      informiere(
        'Neue Reservierung: ' + (payload.guest_name || 'Gast'),
        [
          'Neue Reservierung fuer ' + (kunde.name || slug) + ':',
          '',
          'Name:     ' + (payload.guest_name || '-'),
          'Telefon:  ' + (payload.guest_phone || '-'),
          'Datum:    ' + (payload.reservation_date || '-'),
          'Uhrzeit:  ' + uhrzeitText(payload.reservation_time),
          'Personen: ' + (payload.party_size || '-'),
          payload.notes ? 'Hinweise: ' + payload.notes : '',
          '',
          'Aufgenommen vom Telefon-Assistenten.'
        ].filter(Boolean).join('\n')
      );
      return { ok: true, daten: { id: eintrag.zeit } };
    },

    /* Kennen wir diesen Anrufer? Dieselbe Logik wie bei Kiek-mol-in-Kunden,
       nur aus der lokalen Datei statt aus Supabase. Ohne das waeren
       Stammgaeste nur bei den Kiek-mol-in-Betrieben bekannt - also
       ausgerechnet nicht bei denen, die fuer den Assistenten zahlen. */
    async gastHistorie(_restaurantId, telefon) {
      const nummer = nummerSchluessel(telefon);
      if (!nummer) return null;

      const eigene = liesAlle(slug)
        .filter((e) => e.art === 'reservierung' && e.status !== 'cancelled'
                    && nummerSchluessel(e.guest_phone) === nummer)
        .sort((a, b) => String(b.reservation_date || '').localeCompare(String(a.reservation_date || '')));
      if (!eigene.length) return null;

      const zahlen = eigene.map((e) => parseInt(e.party_size, 10)).filter(Boolean);
      const haeufigste = zahlen.length
        ? Number(Object.entries(zahlen.reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {}))
            .sort((a, b) => b[1] - a[1])[0][0])
        : null;

      return {
        name: (eigene.find((e) => e.guest_name) || {}).guest_name || '',
        besuche: eigene.length,
        zuletzt: eigene[0].reservation_date || '',
        uebliche_personenzahl: haeufigste
      };
    },

    /* Kommende Reservierungen zu einer Rufnummer - Grundlage fuers Absagen. */
    async reservierungenZuNummer(_restaurantId, telefon, abDatum) {
      const nummer = nummerSchluessel(telefon);
      if (!nummer) return [];
      return liesAlle(slug)
        .filter((e) => e.art === 'reservierung' && e.status !== 'cancelled'
                    && nummerSchluessel(e.guest_phone) === nummer
                    && String(e.reservation_date || '') >= String(abDatum || ''))
        .sort((a, b) => String(a.reservation_date).localeCompare(String(b.reservation_date)))
        .slice(0, 5)
        .map((e) => ({
          id: e.zeit,               // die Zeit ist hier die Kennung (siehe neueReservierung)
          guest_name: e.guest_name,
          reservation_date: e.reservation_date,
          reservation_time: e.reservation_time,
          party_size: e.party_size,
          status: e.status || 'confirmed'
        }));
    },

    /* Absagen. Die JSONL-Datei wird nur angehaengt, nie umgeschrieben -
       deshalb kommt ein Storno-Eintrag dazu, den liesAlle beruecksichtigt.
       So bleibt nachvollziehbar, was wann abgesagt wurde. */
    async sageReservierungAb(id) {
      try {
        schreibe(slug, { art: 'storno', zeit: new Date().toISOString(), storniert: id });
      } catch (e) {
        return { ok: false, status: 0, text: 'Konnte nicht speichern: ' + e.message };
      }
      const weg = liesAlle(slug).find((e) => e.art === 'reservierung' && e.zeit === id);
      informiere(
        'Reservierung abgesagt: ' + ((weg && weg.guest_name) || 'Gast'),
        [
          'Eine Reservierung wurde telefonisch abgesagt:',
          '',
          'Name:     ' + ((weg && weg.guest_name) || '-'),
          'Datum:    ' + ((weg && weg.reservation_date) || '-'),
          'Uhrzeit:  ' + uhrzeitText(weg && weg.reservation_time),
          'Personen: ' + ((weg && weg.party_size) || '-'),
          '',
          'Der Tisch ist wieder frei.'
        ].join('\n')
      );
      return { ok: true };
    },

    async neueBestellung(payload) {
      const eintrag = Object.assign({ art: 'bestellung', zeit: new Date().toISOString() }, payload);
      try {
        schreibe(slug, eintrag);
      } catch (e) {
        return { ok: false, status: 0, text: 'Konnte nicht speichern: ' + e.message };
      }
      const artikel = Array.isArray(payload.items) ? payload.items : [];
      informiere(
        'Neue Bestellung: ' + euro(payload.total),
        [
          'Neue Bestellung fuer ' + (kunde.name || slug) + ':',
          '',
          'Name:    ' + (payload.customer_name || '-'),
          'Telefon: ' + (payload.customer_phone || '-'),
          'Art:     ' + (payload.order_type === 'delivery' ? 'LIEFERUNG' : 'Abholung'),
          payload.delivery_address ? 'Adresse: ' + payload.delivery_address : '',
          '',
          artikel.length
            ? artikel.map((a) => '  ' + (a.quantity || 1) + 'x ' + (a.name || '?') +
              (a.special_instructions ? ' (' + a.special_instructions + ')' : '')).join('\n')
            : '  (Artikel siehe Protokoll)',
          '',
          'Summe:   ' + euro(payload.total),
          '',
          'Aufgenommen vom Telefon-Assistenten.'
        ].filter(Boolean).join('\n')
      );
      return { ok: true, daten: { id: eintrag.zeit } };
    },

    // Einzelposten: schon in der Bestellung enthalten, hier nur mitschreiben
    async neuerBestellArtikel(payload) {
      try {
        schreibe(slug, Object.assign({ art: 'bestell-artikel', zeit: new Date().toISOString() }, payload));
        return { ok: true };
      } catch (e) {
        return { ok: false, status: 0, text: e.message };
      }
    },

    // Rueckruf-Wuensche: dieselbe Ablage, sofort raus an den Wirt.
    // Der Dialog nutzt diesen Weg ueber resilienterInsert('callbacks', ...).
    async resilienterInsert(tabelle, payload) {
      try {
        schreibe(slug, Object.assign({ art: tabelle, zeit: new Date().toISOString() }, payload));
      } catch (e) {
        return { ok: false, status: 0, text: e.message };
      }
      if (tabelle === 'callbacks') {
        informiere(
          'Rueckruf-Wunsch: ' + (payload.name || 'Anrufer'),
          [
            'Rueckruf-Wunsch fuer ' + (kunde.name || slug) + ':',
            '',
            'Name:     ' + (payload.name || '-'),
            'Telefon:  ' + (payload.phone || '-'),
            'Anliegen: ' + (payload.topic || '-'),
            '',
            'Bitte zurueckrufen.'
          ].join('\n')
        );
      }
      return { ok: true, daten: { id: new Date().toISOString() } };
    }
  };
}

module.exports = { baueAblage, liesAlle, datei, ORDNER };
