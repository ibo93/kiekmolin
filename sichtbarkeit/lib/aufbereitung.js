'use strict';

// Teil A - Aufbereitung (einmalig pro Kunde):
// Aus den Supabase-Daten werden maschinenlesbare Bausteine erzeugt,
// die Google UND KI-Assistenten lesen koennen:
//   1. Schema.org/JSON-LD-Markup (zum Einbau in jede Website)
//   2. Klare Betriebsbeschreibung als Text
//   3. Speisekarte als sauberer, gut lesbarer Text
//   4. Google-Business-Profil-Checkliste (personalisiert)

const { erkenneKategorie } = require('./fragen');

// --- 1. JSON-LD ---------------------------------------------------------------
function baueJsonLd(restaurant, menue) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: restaurant.name
  };
  if (restaurant.description) ld.description = restaurant.description;
  if (restaurant.image || restaurant.logo) ld.image = restaurant.image || restaurant.logo;
  if (restaurant.phone) ld.telephone = restaurant.phone;
  if (restaurant.website || restaurant.website_url) ld.url = restaurant.website || restaurant.website_url;
  if (restaurant.address || restaurant.city) {
    ld.address = {
      '@type': 'PostalAddress',
      streetAddress: restaurant.address || '',
      postalCode: restaurant.zip || restaurant.postal_code || '',
      addressLocality: restaurant.city || '',
      addressCountry: 'DE'
    };
  }
  if (restaurant.lat && restaurant.lng) {
    ld.geo = { '@type': 'GeoCoordinates', latitude: restaurant.lat, longitude: restaurant.lng };
  }
  const kuechen = [];
  if (restaurant.cuisine) kuechen.push(restaurant.cuisine);
  if (Array.isArray(restaurant.cuisine_type)) restaurant.cuisine_type.forEach((c) => c && kuechen.push(c));
  if (kuechen.length) ld.servesCuisine = [...new Set(kuechen)];
  if (restaurant.price_range) ld.priceRange = restaurant.price_range;

  // Speisekarte als hasMenu (die wichtigsten/beliebtesten Artikel)
  if (menue && menue.length) {
    const sektionen = {};
    for (const artikel of menue) {
      const kat = (artikel.menu_categories && artikel.menu_categories.name) || 'Speisen';
      (sektionen[kat] = sektionen[kat] || []).push(artikel);
    }
    ld.hasMenu = {
      '@type': 'Menu',
      hasMenuSection: Object.entries(sektionen).map(([kat, artikel]) => ({
        '@type': 'MenuSection',
        name: kat,
        hasMenuItem: artikel.slice(0, 25).map((a) => {
          const item = { '@type': 'MenuItem', name: a.name };
          if (a.description) item.description = a.description;
          const preis = a.base_price != null ? a.base_price : a.price;
          if (preis != null) item.offers = { '@type': 'Offer', price: String(preis), priceCurrency: 'EUR' };
          return item;
        })
      }))
    };
  }
  return ld;
}

// --- 2. Beschreibung ------------------------------------------------------------
function baueBeschreibung(restaurant) {
  const kat = erkenneKategorie(restaurant);
  const stadt = restaurant.city || 'Ostfriesland';
  const teile = [];
  teile.push(`${restaurant.name} ist ${kat.nennform} in ${stadt}.`);
  if (restaurant.description) teile.push(restaurant.description.trim());
  if (restaurant.address) teile.push(`Adresse: ${restaurant.address}, ${restaurant.zip || ''} ${stadt}.`.replace('  ', ' '));
  if (restaurant.phone) teile.push(`Telefonisch erreichbar unter ${restaurant.phone}.`);
  teile.push(`Online reservieren und bestellen: ueber Kiek mol in (kiekmolin.de).`);
  return teile.join(' ');
}

// --- 3. Speisekarte als Text ------------------------------------------------------
function baueSpeisekartenText(restaurant, menue) {
  const zeilen = ['SPEISEKARTE - ' + restaurant.name + (restaurant.city ? ' (' + restaurant.city + ')' : ''), ''];
  if (!menue || !menue.length) {
    zeilen.push('(Keine Speisekarte in der Datenbank hinterlegt.)');
    return zeilen.join('\n');
  }
  const sektionen = {};
  for (const artikel of menue) {
    const kat = (artikel.menu_categories && artikel.menu_categories.name) || 'Speisen';
    (sektionen[kat] = sektionen[kat] || []).push(artikel);
  }
  for (const [kat, artikel] of Object.entries(sektionen)) {
    zeilen.push('== ' + kat + ' ==');
    for (const a of artikel) {
      const preis = a.base_price != null ? a.base_price : a.price;
      const preisText = preis != null ? '  ' + Number(preis).toFixed(2).replace('.', ',') + ' EUR' : '';
      zeilen.push('- ' + a.name + preisText + (a.is_popular ? '  (beliebt)' : ''));
      if (a.description) zeilen.push('  ' + a.description);
    }
    zeilen.push('');
  }
  return zeilen.join('\n');
}

// --- 4. Google-Business-Profil-Checkliste -----------------------------------------
function baueGbpCheckliste(restaurant) {
  const kat = erkenneKategorie(restaurant);
  const stadt = restaurant.city || 'Ostfriesland';
  return `# Google-Business-Profil - Checkliste fuer ${restaurant.name}

Einmal sauber durchgehen, danach monatlich kurz pruefen.

## Grunddaten
- [ ] Profil beansprucht & verifiziert (business.google.com)
- [ ] Name exakt "${restaurant.name}" (keine Zusaetze wie "beste Pizza!!")
- [ ] Hauptkategorie: "${kat.label}" - plus 2-3 passende Nebenkategorien
- [ ] Adresse & Einzugsgebiet korrekt (${restaurant.address || 'Adresse pruefen'}, ${stadt})
- [ ] Telefonnummer = die Nummer, die auch der Telefon-Retter betreut${restaurant.phone ? ' (' + restaurant.phone + ')' : ''}
- [ ] Website-Link gesetzt (eigene Seite oder kiekmolin.de/${restaurant.slug || '...'})

## Oeffnungszeiten
- [ ] Regulaere Zeiten vollstaendig & aktuell
- [ ] Feiertage/Ferien als Sonderzeiten gepflegt (haeufigster Grund fuer schlechte Bewertungen!)

## Fotos (mind. 10, alle 1-2 Monate neue)
- [ ] Aussenansicht (findet man den Laden?)
- [ ] Innenraum / Atmosphaere
- [ ] 5+ Gerichte-Fotos (echte Fotos, keine Stock-Bilder)
- [ ] Team-Foto (baut Vertrauen)

## Inhalte
- [ ] Beschreibung eingetragen (siehe beschreibung.txt aus diesem Ordner)
- [ ] Speisekarte hinterlegt oder als Link (siehe speisekarte.txt)
- [ ] Attribute gepflegt: Terrasse, vegan, Lieferung, Reservierung, Zahlungsarten

## Bewertungen (laufend)
- [ ] JEDE Bewertung beantworten - auch die guten (kurz & persoenlich)
- [ ] Bei Kritik: sachlich, loesung anbieten, nie rechtfertigen
- [ ] Zufriedene Gaeste aktiv um Bewertung bitten (QR-Code auf dem Bon)

## Beitraege
- [ ] 1-2 Google-Beitraege pro Monat (Tagesgericht, Aktion, Saisonales)
`;
}

module.exports = { baueJsonLd, baueBeschreibung, baueSpeisekartenText, baueGbpCheckliste };
