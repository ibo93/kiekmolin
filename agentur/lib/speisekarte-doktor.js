'use strict';

// Speisekarten-Doktor: legt die Speisekarte neben die echten Bestellungen
// und sagt, wo Geld liegen bleibt.
//
// Warum das kein Kunde selbst macht: Ein Wirt kennt seine Karte im Gefuehl,
// aber nicht in Zahlen. Dass das Gericht mit den meisten Bestellungen ganz
// unten auf Seite 3 steht - oder dass zwoelf Gerichte seit Monaten NIE
// bestellt wurden - sieht man nur, wenn man beides nebeneinanderlegt.
//
// Reine Rechnung, kein KI-Aufruf: nachvollziehbar und kostenlos.
// EHRLICH: Bestell-Befunde gibt es erst ab genug Bestellungen. Bei duenner
// Datenlage nennen wir nur das, was man auch ohne Zahlen sehen kann
// (fehlende Beschreibungen, zu lange Karte) - und sagen das auch dazu.

const MIN_BESTELLUNGEN = 20;   // darunter keine Aussage ueber Renner/Ladenhueter
const KARTE_ZU_LANG = 40;      // ab so vielen Gerichten wird die Auswahl zur Qual
const TEUER_GENUG = 0.85;      // Bestseller unter 85 % des Kategorie-Schnitts = zu billig

function preisVon(gericht) {
  const p = Number(gericht.base_price);
  if (Number.isFinite(p) && p > 0) return p;
  const p2 = Number(gericht.price);
  return Number.isFinite(p2) && p2 > 0 ? p2 : 0;
}

function kategorieVon(gericht) {
  const k = gericht.menu_categories;
  const name = k && (Array.isArray(k) ? (k[0] || {}).name : k.name);
  return String(name || 'Ohne Kategorie');
}

function schluessel(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Aus den Bestellungen zaehlen, was wie oft ueber die Theke ging.
// bestellungen: [{ items: [{ name, quantity, price }] }]
function zaehleGerichte(bestellungen) {
  const zaehler = new Map();
  let bestellungenMitArtikeln = 0;
  for (const b of bestellungen || []) {
    const artikel = Array.isArray(b && b.items) ? b.items : [];
    if (artikel.length) bestellungenMitArtikeln++;
    for (const a of artikel) {
      if (!a || !a.name) continue;
      const s = schluessel(a.name);
      const menge = parseInt(a.quantity, 10) || 1;
      const vorhanden = zaehler.get(s) || { name: String(a.name).trim(), menge: 0 };
      vorhanden.menge += menge;
      zaehler.set(s, vorhanden);
    }
  }
  return { zaehler, bestellungenMitArtikeln };
}

// Die Untersuchung. karte kommt bereits in Karten-Reihenfolge (sort_order).
function analysiere(karte, bestellungen, optionen) {
  const o = optionen || {};
  const gerichte = Array.isArray(karte) ? karte : [];
  const { zaehler, bestellungenMitArtikeln } = zaehleGerichte(bestellungen);
  const genugDaten = bestellungenMitArtikeln >= (o.minBestellungen || MIN_BESTELLUNGEN);

  // Kategorie-Schnittpreise fuer den Unterpreis-Check
  const proKategorie = new Map();
  gerichte.forEach((g) => {
    const preis = preisVon(g);
    if (!preis) return;
    const k = kategorieVon(g);
    const e = proKategorie.get(k) || { summe: 0, anzahl: 0 };
    e.summe += preis; e.anzahl++;
    proKategorie.set(k, e);
  });
  const schnittFuer = (k) => {
    const e = proKategorie.get(k);
    return e && e.anzahl ? e.summe / e.anzahl : 0;
  };

  // Gerichte mit Verkaufszahl und Position anreichern
  const angereichert = gerichte.map((g, i) => {
    const treffer = zaehler.get(schluessel(g.name));
    return {
      name: String(g.name || '').trim(),
      kategorie: kategorieVon(g),
      preis: preisVon(g),
      position: i + 1,
      beschreibung: String(g.description || '').trim(),
      menge: treffer ? treffer.menge : 0
    };
  });

  const befunde = [];
  const gesamtMenge = angereichert.reduce((s, g) => s + g.menge, 0);

  if (genugDaten && gesamtMenge > 0) {
    const verkauft = angereichert.filter((g) => g.menge > 0).sort((a, b) => b.menge - a.menge);
    const bestsellerGrenze = Math.max(1, Math.ceil(verkauft.length * 0.2));
    const bestseller = verkauft.slice(0, bestsellerGrenze);
    const hinteHaelfte = Math.ceil(angereichert.length / 2);

    // 1. Versteckter Bestseller: laeuft super, steht aber weit unten
    for (const g of bestseller) {
      if (g.position > hinteHaelfte) {
        befunde.push({
          typ: 'versteckter-bestseller', gericht: g.name, aufwand: '5 Minuten', prio: 'hoch',
          text: g.name + ' ist einer der meistbestellten Artikel (' + g.menge + '×), steht aber erst an Position ' + g.position + ' von ' + angereichert.length + '.',
          empfehlung: 'In der Karte nach oben ziehen – am besten auf die ersten drei Plätze der Kategorie. Was oben steht, wird häufiger bestellt.'
        });
      }
    }

    // 2. Unterbepreister Bestseller: Nachfrage da, Preis unter Kategorie-Schnitt
    for (const g of bestseller) {
      const schnitt = schnittFuer(g.kategorie);
      if (!g.preis || !schnitt || g.preis >= schnitt * TEUER_GENUG) continue;
      const ziel = Math.round(schnitt * 100) / 100;
      const plus = Math.round((ziel - g.preis) * g.menge * 100) / 100;
      befunde.push({
        typ: 'unterpreis', gericht: g.name, aufwand: '5 Minuten', prio: 'hoch', potenzial: plus,
        text: g.name + ' läuft stark (' + g.menge + '×), kostet aber ' + euro(g.preis) + ' – der Schnitt in „' + g.kategorie + '" liegt bei ' + euro(ziel) + '.',
        empfehlung: 'Preis behutsam auf ' + euro(ziel) + ' anheben. Bei gleicher Nachfrage sind das rund ' + euro(plus) + ' mehr im gleichen Zeitraum. Gäste, die ein Gericht lieben, merken 50 Cent nicht.'
      });
    }

    // 3. Ladenhueter: steht auf der Karte, wird aber nie bestellt
    const nie = angereichert.filter((g) => g.menge === 0);
    if (nie.length) {
      befunde.push({
        typ: 'ladenhueter', aufwand: '15 Minuten', prio: nie.length > 5 ? 'hoch' : 'mittel',
        gerichte: nie.slice(0, 10).map((g) => g.name),
        text: nie.length + ' Gericht' + (nie.length === 1 ? '' : 'e') + ' auf der Karte ' + (nie.length === 1 ? 'wurde' : 'wurden') + ' im ausgewerteten Zeitraum kein einziges Mal bestellt: ' + nie.slice(0, 6).map((g) => g.name).join(', ') + (nie.length > 6 ? ' u. a.' : '') + '.',
        empfehlung: 'Streichen oder neu beschreiben. Jedes tote Gericht bindet Einkauf, Lagerplatz und Aufmerksamkeit – und macht die Entscheidung für den Gast schwerer.'
      });
    }
  } else {
    befunde.push({
      typ: 'zu-wenig-daten', aufwand: '–', prio: 'niedrig',
      text: 'Für Renner/Ladenhüter reichen die Bestelldaten noch nicht (' + bestellungenMitArtikeln + ' Bestellungen mit Artikeln, nötig sind ' + (o.minBestellungen || MIN_BESTELLUNGEN) + ').',
      empfehlung: 'Nichts behaupten, was die Zahlen nicht hergeben. Sobald mehr online bestellt wird, greift die Auswertung von selbst.'
    });
  }

  // 4. Ohne Beschreibung: der billigste Umsatz-Hebel ueberhaupt
  const ohneText = angereichert.filter((g) => !g.beschreibung);
  if (ohneText.length) {
    // Gut laufende zuerst - dort wirkt eine Beschreibung am meisten
    const sortiert = [...ohneText].sort((a, b) => b.menge - a.menge);
    befunde.push({
      typ: 'ohne-beschreibung', aufwand: '20 Minuten', prio: ohneText.length > 5 ? 'hoch' : 'mittel',
      gerichte: sortiert.slice(0, 10).map((g) => g.name),
      text: ohneText.length + ' von ' + angereichert.length + ' Gerichten haben keine Beschreibung – u. a. ' + sortiert.slice(0, 4).map((g) => g.name).join(', ') + '.',
      empfehlung: 'Ein Satz reicht: Herkunft, Zubereitung oder Beilage. Gäste bestellen, was sie sich vorstellen können – und die Suchmaschinen lesen den Text mit.'
    });
  }

  // 5. Zu lange Karte
  if (angereichert.length > (o.karteZuLang || KARTE_ZU_LANG)) {
    befunde.push({
      typ: 'zu-lang', aufwand: '30 Minuten', prio: 'mittel',
      text: 'Die Karte hat ' + angereichert.length + ' Gerichte. Ab etwa ' + (o.karteZuLang || KARTE_ZU_LANG) + ' fällt Gästen die Wahl schwer – sie greifen dann zum Bekannten statt zum Teuren.',
      empfehlung: 'Ausdünnen: Ladenhüter raus, ähnliche Gerichte zusammenlegen. Eine kürzere Karte verkauft besser und macht die Küche schneller.'
    });
  }

  const potenzial = befunde.reduce((s, b) => s + (b.potenzial || 0), 0);
  befunde.sort((a, b) => rang(b.prio) - rang(a.prio));

  return {
    gerichteGesamt: angereichert.length,
    bestellungenAusgewertet: bestellungenMitArtikeln,
    genugDaten,
    potenzial: Math.round(potenzial * 100) / 100,
    befunde,
    zusammenfassung: baueZusammenfassung(angereichert.length, befunde, potenzial, genugDaten)
  };
}

function rang(prio) {
  return prio === 'hoch' ? 3 : prio === 'mittel' ? 2 : 1;
}

function euro(n) {
  return Number(n || 0).toFixed(2).replace('.', ',') + ' €';
}

function baueZusammenfassung(anzahl, befunde, potenzial, genugDaten) {
  const echte = befunde.filter((b) => b.typ !== 'zu-wenig-daten');
  if (!echte.length) {
    return genugDaten
      ? 'Die Karte sieht sauber aus: Bestseller stehen weit oben, keine toten Gerichte, alles beschrieben. Nichts zu tun.'
      : 'Strukturell ist an der Karte nichts zu beanstanden. Für die Verkaufszahlen fehlen noch Bestelldaten.';
  }
  const teile = [anzahl + ' Gerichte geprüft, ' + echte.length + ' Punkt' + (echte.length === 1 ? '' : 'e') + ' gefunden.'];
  if (potenzial > 0) {
    teile.push('Allein die Preis-Anpassungen bringen rechnerisch rund ' + euro(potenzial) +
      ' mehr – bei gleicher Anzahl Bestellungen.');
  }
  return teile.join(' ');
}

module.exports = { zaehleGerichte, analysiere, MIN_BESTELLUNGEN };
