'use strict';

// INSTAGRAM — Zahlen, Kommentare, Reels posten. Per Sprache bedienbar.
//
// "Wie lief das letzte Reel?" · "Was schreiben die Leute drunter?" ·
// "Poste das Reel mit dem Text ..." — der Sprachassistent ruft dafuer
// das Werkzeug sprachassistent/instagram.js auf, das hier drunter liegt.
//
// Offizieller Weg ueber die Instagram-Graph-API (kein Browser-Roboter, der
// sich als du einloggt - das fliegt frueher oder spaeter auf und kostet im
// Zweifel den Account). Dafuer braucht Instagram:
//   - ein Profi-Konto (Business oder Creator)
//   - einen Zugriffs-Schluessel (INSTAGRAM_TOKEN in der .env)
// Die Einrichtung steht im README.

const BASIS = process.env.INSTAGRAM_BASIS_URL || 'https://graph.instagram.com';

function schluessel() {
  const t = process.env.INSTAGRAM_TOKEN;
  if (!t) throw new Error('INSTAGRAM_TOKEN fehlt - Einrichtung steht im README (Abschnitt Instagram)');
  return t;
}

// Eine Anfrage an Instagram. Fehler kommen als klarer Satz zurueck, nicht
// als JSON-Wust - der Assistent liest das schliesslich vor.
async function hole(pfad, params, methode) {
  const url = new URL(BASIS.replace(/\/$/, '') + '/' + String(pfad).replace(/^\//, ''));
  const suche = Object.assign({ access_token: schluessel() }, params || {});
  for (const [k, v] of Object.entries(suche)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const antwort = await fetch(url, { method: methode || 'GET', signal: AbortSignal.timeout(30000) });
  const text = await antwort.text();
  let daten;
  try { daten = JSON.parse(text); } catch (_e) { daten = null; }

  if (!antwort.ok || (daten && daten.error)) {
    throw new Error(fehlerSatz(antwort.status, daten));
  }
  return daten || {};
}

// Aus einem API-Fehler einen Satz machen, der weiterhilft.
function fehlerSatz(status, daten) {
  const f = (daten && daten.error) || {};
  const meldung = f.message || ('HTTP ' + status);
  if (/expired|session|OAuth|token/i.test(meldung)) {
    return 'Instagram sagt: der Zugriffs-Schluessel gilt nicht mehr. Neuen Token holen und in die .env eintragen. (' + meldung + ')';
  }
  if (/permission|scope/i.test(meldung)) {
    return 'Instagram sagt: dafuer fehlt eine Berechtigung im Meta-Konto. (' + meldung + ')';
  }
  return 'Instagram sagt: ' + meldung;
}

// ------------------------------------------------------------- Abrufen ----

async function konto() {
  return hole('me', { fields: 'id,username,account_type,media_count,followers_count,follows_count' });
}

// Die letzten Beitraege mit ihren Zahlen.
async function beitraege(anzahl) {
  const d = await hole('me/media', {
    fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
    limit: Math.min(50, anzahl || 10)
  });
  return (d.data || []).map(aufbereitenBeitrag);
}

// Zahlen zu EINEM Beitrag (Reels zaehlen anders als Bilder).
async function beitragsZahlen(mediaId, istReel) {
  const metriken = istReel
    ? 'views,reach,likes,comments,shares,saved,total_interactions'
    : 'reach,likes,comments,saved,total_interactions';
  const d = await hole(mediaId + '/insights', { metric: metriken });
  const zahlen = {};
  for (const eintrag of (d.data || [])) {
    const wert = eintrag.values && eintrag.values[0] ? eintrag.values[0].value : 0;
    zahlen[eintrag.name] = wert;
  }
  return zahlen;
}

async function kommentare(mediaId, anzahl) {
  const d = await hole(mediaId + '/comments', {
    fields: 'id,text,username,timestamp,like_count',
    limit: Math.min(50, anzahl || 20)
  });
  return d.data || [];
}

async function antworte(kommentarId, text) {
  if (!String(text || '').trim()) throw new Error('Ohne Text keine Antwort');
  return hole(kommentarId + '/replies', { message: text }, 'POST');
}

// --------------------------------------------------------------- Posten ----

// Reel veroeffentlichen. Instagram HOLT sich das Video - es muss also unter
// einer oeffentlichen Adresse liegen (Netlify oder Supabase-Storage reichen).
// Ablauf: Behaelter anlegen -> warten bis fertig -> veroeffentlichen.
async function posteReel({ videoUrl, text, coverUrl, warte }) {
  if (!/^https?:\/\//.test(String(videoUrl || ''))) {
    throw new Error('Das Video braucht eine oeffentliche Adresse (https://...). Erst hochladen, dann posten.');
  }
  const behaelter = await hole('me/media', {
    media_type: 'REELS',
    video_url: videoUrl,
    caption: text || '',
    cover_url: coverUrl || undefined
  }, 'POST');

  const id = behaelter.id;
  if (!id) throw new Error('Instagram hat keinen Behaelter angelegt');

  const bereit = await warteAufBehaelter(id, warte || 300);
  if (!bereit.fertig) {
    throw new Error('Instagram ist mit dem Video noch nicht durch (' + bereit.status + '). Spaeter nochmal veroeffentlichen: creation_id ' + id);
  }

  const ergebnis = await hole('me/media_publish', { creation_id: id }, 'POST');
  return { id: ergebnis.id, behaelter: id };
}

async function warteAufBehaelter(id, sekunden) {
  const ende = Date.now() + sekunden * 1000;
  let status = 'IN_PROGRESS';
  while (Date.now() < ende) {
    const d = await hole(id, { fields: 'status_code,status' });
    status = d.status_code || 'IN_PROGRESS';
    if (status === 'FINISHED') return { fertig: true, status: status };
    if (status === 'ERROR' || status === 'EXPIRED') return { fertig: false, status: status + (d.status ? ' - ' + d.status : '') };
    await new Promise((r) => setTimeout(r, 5000));
  }
  return { fertig: false, status: status };
}

// ---------------------------------------------------- Fuer die Stimme -----

function aufbereitenBeitrag(b) {
  return {
    id: b.id,
    art: b.media_product_type === 'REELS' || b.media_type === 'VIDEO' ? 'Reel' : 'Beitrag',
    text: kurzText(b.caption, 80),
    datum: (b.timestamp || '').slice(0, 10),
    likes: b.like_count || 0,
    kommentare: b.comments_count || 0,
    link: b.permalink || ''
  };
}

function kurzText(text, laenge) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > laenge ? t.slice(0, laenge - 1) + '…' : t;
}

function zahl(n) {
  const z = Number(n || 0);
  if (z >= 1000) return (z / 1000).toFixed(1).replace('.', ',') + ' Tausend';
  return String(z);
}

// Ein Satz, den man vorlesen kann: "Das letzte Reel vom 12.08. hat ..."
function satzZuBeitrag(beitrag, zahlen) {
  const teile = [];
  const datum = beitrag.datum ? beitrag.datum.split('-').reverse().join('.') : '';
  teile.push(beitrag.art + (datum ? ' vom ' + datum : ''));
  if (beitrag.text) teile.push('"' + beitrag.text + '"');

  const werte = [];
  if (zahlen && zahlen.views) werte.push(zahl(zahlen.views) + ' Aufrufe');
  else if (zahlen && zahlen.reach) werte.push(zahl(zahlen.reach) + ' erreichte Leute');
  werte.push(zahl(beitrag.likes) + ' Likes');
  if (beitrag.kommentare) werte.push(zahl(beitrag.kommentare) + ' Kommentare');
  if (zahlen && zahlen.saved) werte.push(zahl(zahlen.saved) + ' Speicherungen');

  return teile.join(': ') + ' — ' + werte.join(', ') + '.';
}

// Kurzfassung fuers Konto.
function satzZuKonto(k) {
  return 'Dein Konto ' + (k.username ? '@' + k.username : '') + ' hat ' + zahl(k.followers_count) +
    ' Follower und ' + zahl(k.media_count) + ' Beitraege.';
}

module.exports = {
  konto, beitraege, beitragsZahlen, kommentare, antworte, posteReel,
  satzZuBeitrag, satzZuKonto, aufbereitenBeitrag, kurzText, zahl, fehlerSatz, hole
};
