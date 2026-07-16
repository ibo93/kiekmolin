'use strict';

// Teil B - Google-Business-Beitraege (monatlich pro Kunde):
// Regelmaessige Beitraege im Google-Business-Profil sind ein wichtiger
// lokaler Ranking-Faktor - Wirte haben dafuer keine Zeit. Dieses Modul
// erzeugt jeden Monat fertige Entwuerfe zum Copy-Pasten:
//   1. baueGbpPosts            - 4 Beitrags-Entwuerfe (Gericht, Saison, Reservierung, Bestellung)
//   2. baueBewertungsAntworten - 3 Antwort-Vorlagen auf Gaestebewertungen
//   3. bauePostsMarkdown       - alles zusammen als huebsches Markdown
//
// Wichtig: Der Monat kommt IMMER als Parameter rein (optionen.monat),
// nie ueber new Date() - nur so bleiben die Funktionen rein und testbar.
// Und: Es werden KEINE Fakten erfunden (keine Terrasse, kein "taeglich
// geoeffnet") - nur das, was wirklich in den Daten steht.

const { erkenneKategorie } = require('./fragen');

const MONATSNAMEN = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];

// --- Hilfsfunktionen ---------------------------------------------------------

function pruefeMonat(optionen) {
  const monat = optionen && optionen.monat;
  if (!Number.isInteger(monat) || monat < 1 || monat > 12) {
    throw new TypeError('optionen.monat muss eine ganze Zahl von 1 bis 12 sein');
  }
  return monat;
}

function monatsName(monat) {
  return MONATSNAMEN[monat - 1];
}

// Winter: Dez-Feb, Fruehling: Maerz-Mai, Sommer: Juni-Aug, Herbst: Sep-Nov
function saisonFuerMonat(monat) {
  if (monat >= 3 && monat <= 5) return 'fruehling';
  if (monat >= 6 && monat <= 8) return 'sommer';
  if (monat >= 9 && monat <= 11) return 'herbst';
  return 'winter';
}

function kiekmolinLink(restaurant) {
  return 'kiekmolin.de/' + (restaurant.slug || '...');
}

function formatPreis(gericht) {
  const preis = gericht.base_price != null ? gericht.base_price : gericht.price;
  if (preis == null) return null;
  return Number(preis).toFixed(2).replace('.', ',') + ' €';
}

// Beschreibungen aus der Datenbank koennen lang sein - fuer den Post
// reicht der Anfang (sauber am Wortende gekuerzt).
function kuerze(text, maxLaenge) {
  const t = String(text || '').trim();
  if (t.length <= maxLaenge) return t;
  const geschnitten = t.slice(0, maxLaenge);
  const letztesLeerzeichen = geschnitten.lastIndexOf(' ');
  return (letztesLeerzeichen > 0 ? geschnitten.slice(0, letztesLeerzeichen) : geschnitten) + ' …';
}

// Sorgt dafuer, dass ein Textbaustein mit Satzzeichen endet -
// Menue-Beschreibungen aus der Datenbank tun das oft nicht.
function alsSatz(text) {
  const t = String(text || '').trim();
  if (!t) return t;
  return /[.!?…]$/.test(t) ? t : t + '.';
}

// --- 1. Die 4 Monats-Beitraege --------------------------------------------------

// a) Gericht des Monats: nimmt ein beliebtes Gericht (oder das erste)
//    mit echtem Namen, Preis und Beschreibung. Nichts wird erfunden.
function baueGerichtPost(restaurant, menue, monat) {
  const stadt = restaurant.city || 'Ostfriesland';
  const link = kiekmolinLink(restaurant);
  const mName = monatsName(monat);

  // Fallback, wenn (noch) keine Speisekarte hinterlegt ist:
  // ein allgemeiner Willkommens-Post - ohne erfundene Gerichte.
  if (!menue || !menue.length) {
    const kat = erkenneKategorie(restaurant);
    const teile = [];
    teile.push(`Moin und schön, dass Du uns hier gefunden hast! ${restaurant.name} ist ${kat.nennform} in ${stadt}.`);
    if (restaurant.description) teile.push(alsSatz(kuerze(restaurant.description, 180)));
    teile.push(`Auf diesem Profil halten wir Dich ab jetzt regelmäßig auf dem Laufenden – mit Neuigkeiten, Empfehlungen aus der Küche und allem, was bei uns im ${mName} ansteht.`);
    teile.push(`Einen Tisch reservierst Du am einfachsten online auf ${link} – kostenlos und mit sofortiger Bestätigung, ganz ohne Anruf.`);
    teile.push('Unsere aktuellen Öffnungszeiten findest Du hier im Profil. Bis bald – wir freuen uns auf Dich!');
    return {
      titel: `Moin aus ${stadt}!`,
      text: teile.join(' '),
      hinweis: 'Mit einem freundlichen Foto vom Team oder vom Eingang posten – das baut Vertrauen auf.'
    };
  }

  const gericht = menue.find((g) => g.is_popular) || menue[0];
  const preisText = formatPreis(gericht);
  const teile = [];
  teile.push(`Unser Tipp im ${mName}: ${gericht.name}${preisText ? ` für ${preisText}` : ''}.`);
  if (gericht.description) teile.push(alsSatz(kuerze(gericht.description, 180)));
  if (gericht.is_popular) {
    teile.push('Dieses Gericht gehört zu den beliebtesten auf unserer Karte – wer es einmal probiert hat, bestellt es oft wieder.');
  } else {
    teile.push('Eine ehrliche Empfehlung aus unserer Küche – und ein guter Einstieg für alle, die uns noch nicht kennen.');
  }
  teile.push(`Wenn Du es noch nicht kennst: Der ${mName} ist ein guter Monat, um es nachzuholen.`);
  teile.push(`Die komplette Speisekarte mit allen Preisen findest Du online auf ${link} – dort kannst Du direkt zur Abholung bestellen oder einen Tisch bei uns in ${stadt} reservieren, kostenlos und mit sofortiger Bestätigung.`);
  teile.push('Wir freuen uns auf Dich!');
  return {
    titel: `Gericht des Monats: ${gericht.name}`,
    text: teile.join(' '),
    hinweis: 'Mit einem echten Foto vom Gericht posten – Beiträge mit Foto bekommen deutlich mehr Klicks.'
  };
}

// b) Saisonaler Post: passend zur Jahreszeit, mit Stadt und Kategorie.
//    Bewusst neutral formuliert - wir behaupten KEINE Ausstattung
//    (keine Terrasse, kein Kamin), die wir nicht kennen.
function baueSaisonPost(restaurant, monat) {
  const stadt = restaurant.city || 'Ostfriesland';
  const kat = erkenneKategorie(restaurant);
  const link = kiekmolinLink(restaurant);
  const mName = monatsName(monat);
  const saison = saisonFuerMonat(monat);

  const gemeinsamerSchluss = `Die Speisekarte findest Du online auf ${link} – dort kannst Du auch direkt einen Tisch reservieren oder zur Abholung bestellen. Unsere aktuellen Öffnungszeiten stehen hier im Profil. Wir freuen uns auf Dich!`;

  const varianten = {
    winter: {
      titel: `Gemütlich einkehren in ${stadt}`,
      text: `Draußen wird es früh dunkel, der Wind pfeift und so richtig warm ist es nirgends – die beste Zeit im Jahr, um gemütlich einzukehren. Nach einem Spaziergang durch ${stadt} wartet bei uns etwas Warmes: ${restaurant.name} ist ${kat.nennform} in ${stadt}, und im ${mName} tut ${kat.gericht} einfach doppelt gut. Komm vorbei, taut auf und lass Dir Zeit – oder nimm Dir Dein Essen bequem mit nach Hause. ${gemeinsamerSchluss}`
    },
    fruehling: {
      titel: `Frühling in ${stadt}`,
      text: `Die Tage werden länger, die Sonne zeigt sich wieder öfter – und ${stadt} wird spürbar lebendiger. Genau die richtige Zeit, mal wieder essen zu gehen, statt selbst am Herd zu stehen. ${restaurant.name} ist ${kat.nennform} in ${stadt}: Ob nach dem ersten Ausflug des Jahres oder einfach nach Feierabend – im ${mName} ist ${kat.gericht} bei uns eine gute Idee. ${gemeinsamerSchluss}`
    },
    sommer: {
      titel: `Sommer in ${stadt}`,
      text: `Sommer in ${stadt} – die schönste Zeit des Jahres. Egal ob Du hier Urlaub machst oder zu Hause bist: Nach einem langen Tag draußen schmeckt ${kat.gericht} doppelt gut, und kochen muss dann wirklich niemand mehr. ${restaurant.name} ist ${kat.nennform} in ${stadt} und im ${mName} für Dich da – komm vorbei oder nimm Dir Dein Essen einfach mit dorthin, wo Du den Abend verbringst. ${gemeinsamerSchluss}`
    },
    herbst: {
      titel: `Herbst in ${stadt}`,
      text: `Der Herbst ist da: Die Abende werden länger, das Wetter wird rauer – und der Appetit auf etwas Richtiges wächst. Nach einem stürmischen Tag in ${stadt} gibt es kaum etwas Besseres, als sich irgendwo hinzusetzen, wo es gut riecht und jemand anderes kocht. ${restaurant.name} ist ${kat.nennform} in ${stadt}, und ${kat.gericht} passt im ${mName} einfach perfekt. ${gemeinsamerSchluss}`
    }
  };

  const v = varianten[saison];
  return {
    titel: v.titel,
    text: v.text,
    hinweis: 'Als normaler Neuigkeiten-Beitrag mit einem aktuellen Foto aus dem Lokal – kein Stock-Bild.'
  };
}

// c) Reservierungs-Post: Tisch online reservieren ueber kiekmolin.de/<slug>.
function baueReservierungsPost(restaurant) {
  const stadt = restaurant.city || 'Ostfriesland';
  const link = kiekmolinLink(restaurant);
  const teile = [];
  teile.push(`Kein Anrufen, kein Warten: Deinen Tisch bei ${restaurant.name} in ${stadt} reservierst Du jetzt online auf ${link} – rund um die Uhr, kostenlos und mit sofortiger Bestätigung.`);
  teile.push('Du wählst einfach Datum, Uhrzeit und Personenzahl, wir kümmern uns um den Rest.');
  teile.push('Das klappt auch spontan – zum Beispiel dann, wenn wir gerade nicht ans Telefon gehen können, weil in der Küche viel los ist.');
  if (restaurant.phone) {
    teile.push(`Und wer lieber persönlich anruft, erreicht uns natürlich weiterhin unter ${restaurant.phone}.`);
  }
  teile.push('Probier es aus – Dein Tisch wartet. Wir freuen uns auf Deinen Besuch!');
  return {
    titel: 'Tisch online reservieren – in 30 Sekunden',
    text: teile.join(' '),
    hinweis: 'Als Beitrag mit Button „Reservieren“ anlegen und den kiekmolin-Link hinterlegen.'
  };
}

// d) Bestell-Post: Speisekarte online, Abholung ohne Portal-Aufschlag.
function baueBestellPost(restaurant) {
  const stadt = restaurant.city || 'Ostfriesland';
  const kat = erkenneKategorie(restaurant);
  const link = kiekmolinLink(restaurant);
  const teile = [];
  teile.push(`Lust auf ${kat.gericht}, aber keine Lust auf Portal-Aufschläge?`);
  teile.push(`Auf ${link} findest Du unsere komplette Speisekarte mit allen Preisen – und kannst Dein Essen direkt online zur Abholung bestellen.`);
  teile.push(`Ohne Umweg über die großen Lieferportale und ohne versteckte Aufschläge: Deine Bestellung landet direkt bei uns in der Küche, und Du holst sie frisch bei uns in ${stadt} ab.`);
  teile.push('So bleibt jeder Euro bei Deinem Restaurant um die Ecke statt bei einem Konzern – und Du zahlst nur das, was auch auf der Karte steht.');
  teile.push('Schau rein und probier es bei Deiner nächsten Bestellung aus!');
  return {
    titel: 'Online bestellen – ohne Portal-Aufschlag',
    text: teile.join(' '),
    hinweis: 'Als Angebots-Post mit Zeitraum (z. B. 4 Wochen) anlegen – so bleibt er länger sichtbar.'
  };
}

function baueGbpPosts(restaurant, menue, optionen) {
  const monat = pruefeMonat(optionen);
  return [
    baueGerichtPost(restaurant, menue, monat),
    baueSaisonPost(restaurant, monat),
    baueReservierungsPost(restaurant),
    baueBestellPost(restaurant)
  ];
}

// --- 2. Antwort-Vorlagen auf Bewertungen ----------------------------------------
// Sie-Form, kurz, professionell und deeskalierend. Platzhalter:
//   [NAME]  = Name des Gastes
//   [PUNKT] = der konkret kritisierte Punkt (z. B. "die Wartezeit")
// Bewusst: KEINE Rechtfertigungen, KEINE Gutschein-Versprechen.
function baueBewertungsAntworten(restaurant) {
  const unterschrift = `Ihr Team vom ${restaurant.name}`;
  const kontakt = restaurant.phone
    ? `Bitte melden Sie sich direkt bei uns – telefonisch unter ${restaurant.phone} –, damit wir das persönlich mit Ihnen klären können.`
    : 'Bitte melden Sie sich direkt bei uns vor Ort oder telefonisch, damit wir das persönlich mit Ihnen klären können.';

  return [
    {
      fall: '5 Sterne mit Text',
      antwort: `Vielen Dank für die schöne Bewertung, [NAME]! Es freut uns sehr, dass es Ihnen bei uns gefallen hat. Wir geben Ihr Lob gern an das ganze Team weiter und freuen uns schon auf Ihren nächsten Besuch. ${unterschrift}`
    },
    {
      fall: '3-4 Sterne mit Kritik',
      antwort: `Vielen Dank für Ihre ehrliche Rückmeldung, [NAME]. Dass Sie mit [PUNKT] nicht ganz zufrieden waren, nehmen wir ernst und schauen es uns intern genau an. Wir würden uns freuen, Sie bald wieder bei uns begrüßen zu dürfen. ${unterschrift}`
    },
    {
      fall: '1-2 Sterne / Beschwerde',
      antwort: `Es tut uns aufrichtig leid, [NAME], dass Ihr Besuch bei uns nicht so verlaufen ist, wie Sie es verdient hätten – gerade [PUNKT] möchten wir besser verstehen. ${kontakt} ${unterschrift}`
    }
  ];
}

// --- 3. Alles zusammen als Markdown ----------------------------------------------
function bauePostsMarkdown(restaurant, menue, optionen) {
  const monat = pruefeMonat(optionen);
  const posts = baueGbpPosts(restaurant, menue, optionen);
  const antworten = baueBewertungsAntworten(restaurant);

  const zeilen = [];
  zeilen.push(`# Google-Business-Beiträge · ${restaurant.name} · ${monatsName(monat)}`);
  zeilen.push('');
  zeilen.push('Fertige Entwürfe zum Copy-Pasten – einmal im Monat einpflegen, dauert keine 10 Minuten.');
  zeilen.push('');

  for (const post of posts) {
    zeilen.push(`## ${post.titel}`);
    zeilen.push('');
    zeilen.push(`> ${post.text}`);
    zeilen.push('');
    zeilen.push(`*Hinweis: ${post.hinweis}*`);
    zeilen.push('');
  }

  zeilen.push('## Antworten auf Bewertungen');
  zeilen.push('');
  zeilen.push('Platzhalter [NAME] und [PUNKT] vor dem Absenden ersetzen.');
  zeilen.push('');
  for (const vorlage of antworten) {
    zeilen.push(`### ${vorlage.fall}`);
    zeilen.push('');
    zeilen.push(`> ${vorlage.antwort}`);
    zeilen.push('');
  }

  zeilen.push('## So einpflegen');
  zeilen.push('');
  zeilen.push('1. business.google.com öffnen und das Profil auswählen.');
  zeilen.push('2. „Beitrag erstellen“ wählen.');
  zeilen.push('3. Text einfügen, Foto dazu – veröffentlichen, fertig.');
  zeilen.push('');

  return zeilen.join('\n');
}

module.exports = { baueGbpPosts, baueBewertungsAntworten, bauePostsMarkdown };
