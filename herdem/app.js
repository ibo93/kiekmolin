/* =====================================================================
   Herdem · App
   Bullet-proof Demo: no external image hosts, full i18n, real PWA hooks.
   ===================================================================== */

"use strict";

/* ---------- Product catalog ---------- */
let products = [
  { id: "sucuk",       category: "fleisch",   price: 7.99, oldPrice: 9.49,
    unit: "15,98 € / kg", popularity: 98, tags: ["Helal", "Angebot"],
    origin: "Helal Metzgerei", name: { de: "Egetürk Rinder Sucuk · Parmak 500g", tr: "Egetürk Dana Sucuk · Parmak 500g" },
    note:  { de: "Kräftig gewürzt, perfekt für Pfanne und Grill.", tr: "Yoğun baharatlı, tava ve mangal için ideal." }
  },
  { id: "huhn",        category: "fleisch",   price: 11.49,
    unit: "11,49 € / kg", popularity: 92, tags: ["Helal", "Frisch"],
    origin: "Frischetheke", name: { de: "Helal Hähnchenbrust · Tavuk Göğsü 1 kg", tr: "Helal Tavuk Göğsü · 1 kg" },
    note:  { de: "Mager geschnitten, ideal für Spieße und Pfanne.", tr: "Yağsız kesim, şiş ve tava için uygun." }
  },
  { id: "gemuese",     category: "obst",      price: 8.95,
    unit: "Saisonkorb", popularity: 88, tags: ["Frisch", "Vegan"],
    origin: "Tagesmarkt", name: { de: "Gemüsekorb Saison · Sebze Sepeti", tr: "Mevsim Sebze Sepeti" },
    note:  { de: "Knackig gepackt für Salat, Suppe und Mezze.", tr: "Salata, çorba ve meze için taze." }
  },
  { id: "fladenbrot",  category: "obst",      price: 1.59,
    unit: "1 Stück, ca. 320 g", popularity: 84, tags: ["Frisch", "Vegan"],
    origin: "Bäckerei", name: { de: "Frisches Fladenbrot · Pide", tr: "Taze Pide" },
    note:  { de: "Weich, luftig — am besten noch warm.", tr: "Yumuşak, kabarık — sıcakken servis edin." }
  },
  { id: "granatapfel", category: "obst",      price: 1.99,
    unit: "1 Stück", popularity: 74, tags: ["Frisch", "Vegan"],
    origin: "Tagesmarkt", name: { de: "Granatapfel · Nar", tr: "Nar" },
    note:  { de: "Süß-säuerlich für Salate, Desserts und Saft.", tr: "Salata, tatlı ve sular için." }
  },
  { id: "tomatenmark", category: "gewuerze",  price: 1.79, oldPrice: 2.29,
    unit: "830 g, 2,16 € / kg", popularity: 94, tags: ["Vegan", "Angebot"],
    origin: "Vorratskammer", name: { de: "Tomatenmark · Salça 830 g", tr: "Domates Salçası · 830 g" },
    note:  { de: "Basis für Menemen, Eintopf und Saucen.", tr: "Menemen, yahni ve soslar için." }
  },
  { id: "bulgur",      category: "gewuerze",  price: 1.49, oldPrice: 1.99,
    unit: "1 kg", popularity: 86, tags: ["Vegan", "Angebot"],
    origin: "Anatolische Küche", name: { de: "Köftelik Bulgur · Feine Körnung 1 kg", tr: "Köftelik Bulgur · İnce 1 kg" },
    note:  { de: "Feine Körnung für Köfte, Kısır und Salate.", tr: "Köfte, kısır ve salatalar için ince." }
  },
  { id: "oliven",      category: "gewuerze",  price: 4.99,
    unit: "900 g, 5,54 € / kg", popularity: 81, tags: ["Vegan", "Helal"],
    origin: "Gemlik", name: { de: "Schwarze Oliven · Gemlik 900 g", tr: "Siyah Zeytin · Gemlik 900 g" },
    note:  { de: "Dunkel, mild und glänzend — Klassiker der Meze-Platte.", tr: "Koyu, yumuşak ve parlak — meze klasiği." }
  },
  { id: "linsen",      category: "gewuerze",  price: 2.69,
    unit: "1 kg", popularity: 67, tags: ["Vegan"],
    origin: "Vorrat", name: { de: "Rote Linsen · Kırmızı Mercimek 1 kg", tr: "Kırmızı Mercimek · 1 kg" },
    note:  { de: "Für Mercimek Çorbası, Eintöpfe und Bowls.", tr: "Mercimek çorbası ve yahnilik." }
  },
  { id: "olivenoel",   category: "gewuerze",  price: 8.99,
    unit: "1 l", popularity: 84, tags: ["Vegan", "Beliebt"],
    origin: "Ägäis", name: { de: "Natives Olivenöl extra · Zeytinyağı 1 l", tr: "Sızma Zeytinyağı · 1 l" },
    note:  { de: "Fruchtig für Salate, Dips und warme Gerichte.", tr: "Salata, sos ve sıcak yemekler için." }
  },
  { id: "feta",        category: "milch",     price: 5.79,
    unit: "800 g, 7,24 € / kg", popularity: 83, tags: ["Kühlung", "Helal"],
    origin: "Kühlregal", name: { de: "Weichkäse in Salzlake · Beyaz Peynir 800 g", tr: "Beyaz Peynir · 800 g" },
    note:  { de: "Cremig, salzig — stark zum Frühstück.", tr: "Kremamsı, hafif tuzlu — kahvaltıya ideal." }
  },
  { id: "joghurt",     category: "milch",     price: 3.49,
    unit: "900 g, 3,88 € / kg", popularity: 79, tags: ["Kühlung", "Helal"],
    origin: "Kühlregal", name: { de: "Süzme Joghurt cremig 900 g", tr: "Süzme Yoğurt · 900 g" },
    note:  { de: "Dick, mild und perfekt für Cacık.", tr: "Yoğun ve hafif — cacık için ideal." }
  },
  { id: "ayran",       category: "getraenke", price: 0.79,
    unit: "250 ml, 3,16 € / l", popularity: 78, tags: ["Kühlung", "Helal"],
    origin: "Kühlregal", name: { de: "Ayran Joghurtgetränk 250 ml", tr: "Ayran · 250 ml" },
    note:  { de: "Eiskalt zum Lahmacun, Grillteller oder Börek.", tr: "Lahmacun ve mangal ile soğuk servis." }
  },
  { id: "tee",         category: "getraenke", price: 6.99, oldPrice: 7.99,
    unit: "1 kg", popularity: 73, tags: ["Vegan", "Angebot"],
    origin: "Çay-Regal", name: { de: "Schwarzer Tee · Türk Çayı 1 kg", tr: "Siyah Türk Çayı · 1 kg" },
    note:  { de: "Starker Aufguss für den Samowar.", tr: "Demli, semaver için güçlü demleme." }
  },
  { id: "baklava",     category: "snacks",    price: 8.49,
    unit: "500 g, 16,98 € / kg", popularity: 76, tags: ["Beliebt", "Helal"],
    origin: "Süßwaren", name: { de: "Baklava Pistazie · Fıstıklı 500 g", tr: "Fıstıklı Baklava · 500 g" },
    note:  { de: "Knusprig, süß und nussig zum Tee.", tr: "Çıtır, tatlı ve cevizli — çay ile." }
  },
  { id: "lahmacun",    category: "snacks",    price: 4.49, oldPrice: 5.29,
    unit: "4 Stück", popularity: 82, tags: ["Helal", "Angebot"],
    origin: "Tiefkühlung", name: { de: "Lahmacun · Türkische Pizza 4 Stück", tr: "Lahmacun · 4 Adet" },
    note:  { de: "Schnell im Ofen, stark mit Zitrone und Petersilie.", tr: "Hızlı fırın — limon ve maydanozla." }
  },
];

let bundles = {
  grillTable:  ["sucuk", "huhn", "gemuese", "ayran", "joghurt"],
  mezzeTable:  ["fladenbrot", "oliven", "feta", "gemuese", "olivenoel"],
  sweetTable:  ["baklava", "tee", "joghurt", "granatapfel"],
  breakfast:   ["fladenbrot", "feta", "oliven", "tee"],
};

let bundleMeta = {};

const FALLBACK_IMG = "assets/logo.svg";
const productImage = (idOrObj) => {
  if (typeof idOrObj === "object") return idOrObj.image || `assets/products/${idOrObj.id}.svg`;
  const p = products.find(x => x.id === idOrObj);
  return (p && p.image) || `assets/products/${idOrObj}.svg`;
};

/* ---------- CMS overrides (set by admin under /admin/) ---------- */
let cmsCopy = {};
let cmsSettings = {
  storeName: "Herdem",
  addrStreet: "Beispielstraße 1", addrZip: "60311", addrCity: "Frankfurt am Main",
  phone: "+49 69 0000 0000", email: "hallo@herdem.example.com",
  hours: "Mo–Sa 08:00–22:00",
  minOrder: 15, feeDelivery: 3.9, freeDelivery: 39, feeShipping: 4.9, freeShipping: 49,
  whatsappNumber: "", paypalHandle: "",
  iban: "", bic: "", accountHolder: "",
  zipList: ["60311","60313","60314","60316","60318","60320","60322","60325","60327","60329","60385","60486","60594","60596","63065","63067","63069","63071","63073","63075"],
  storeOpen: true,
  promos: [
    { code: "HERDEM10", type: "percent", value: 10, min: 0, max: 10 },
    { code: "FRISCH5",  type: "fixed",   value: 5,  min: 25, max: 5 },
  ],
};

function loadCms() {
  try {
    const sp = localStorage.getItem("herdem.cms.products");
    if (sp) {
      const arr = JSON.parse(sp);
      if (Array.isArray(arr) && arr.length) {
        products = arr.filter(p => p && p.id);
      }
    }
    const sb = localStorage.getItem("herdem.cms.bundles");
    if (sb) {
      const obj = JSON.parse(sb);
      if (obj && typeof obj === "object") {
        bundles = {};
        bundleMeta = {};
        Object.values(obj).forEach(b => {
          if (b && b.key) {
            bundles[b.key] = b.productIds || [];
            bundleMeta[b.key] = b;
          }
        });
      }
    }
    const sc = localStorage.getItem("herdem.cms.copy");
    if (sc) cmsCopy = JSON.parse(sc) || {};
    const ss = localStorage.getItem("herdem.cms.settings");
    if (ss) cmsSettings = { ...cmsSettings, ...(JSON.parse(ss) || {}) };
  } catch (e) {
    console.warn("CMS load failed:", e);
  }
}
loadCms();

/* Apply cmsCopy overrides into the i18n dicts */
function applyCmsCopyToI18n() {
  if (!cmsCopy) return;
  const map = {
    heroEyebrow: "heroEyebrow", heroTitle: "heroTitle", heroLead: "heroLead",
    promise1Title: "p1Title", promise1Text: "p1Text",
    promise2Title: "p2Title", promise2Text: "p2Text",
    promise3Title: "p3Title", promise3Text: "p3Text",
    footerTagline: "footerTagline",
    tagline: "storeTagline",
  };
  Object.entries(map).forEach(([i18nKey, cmsKey]) => {
    const de = cmsCopy[cmsKey + "De"];
    const tr = cmsCopy[cmsKey + "Tr"];
    if (de && i18n.de) i18n.de[i18nKey] = de;
    if (tr && i18n.tr) i18n.tr[i18nKey] = tr;
  });
  // Settings tagline override
  if (cmsSettings.storeTaglineDe) i18n.de.tagline = cmsSettings.storeTaglineDe;
  if (cmsSettings.storeTaglineTr) i18n.tr.tagline = cmsSettings.storeTaglineTr;
}

function activeProducts() { return products.filter(p => p.active !== false); }

/* ---------- i18n ---------- */
const i18n = {
  de: {
    addressLabel: "Lieferadresse", addressEmpty: "Adresse wählen",
    serviceDelivery: "Lieferung", servicePickup: "Abholung", serviceShipping: "Versand",
    storeOpen: "Heute bis 22 Uhr lieferbar", storeClosed: "Pause · Abholung in Filiale möglich",
    tagline: "Türkisch-mediterrane Frische",
    searchPlaceholder: "Sucuk, Oliven, Bulgur suchen…",
    cart: "Warenkorb", clearCart: "Leeren",
    favorites: "Gemerkte",
    heroEyebrow: "Heute frisch gepackt",
    heroTitle: "Türkisch-mediterrane Frische, geliefert in 38 Minuten.",
    heroLead: "Helal-Fleisch von der Theke, knackiges Gemüse vom Tagesmarkt, Baklava aus der Süßwarenecke — eine App, ein sauberer Flow.",
    heroCtaPrimary: "Jetzt einkaufen", heroCtaSecondary: "Angebote ansehen",
    trustHelal: "Helal geprüft", trustCold: "Kühlkette gesichert", trustLocal: "Frankfurt & Offenbach",
    promise1Title: "Frischetheke", promise1Text: "Fleisch, Brot und Gemüse täglich vorbereitet",
    promise2Title: "Helal Sortiment", promise2Text: "Klare Kennzeichnung, ausgewählte Marken",
    promise3Title: "Drei Wege, ein Flow", promise3Text: "Lieferung, Abholung oder Versand in einem Klick",
    catAll: "Alle", catAllSub: "Shop",
    catOffers: "Angebote", catOffersSub: "heute",
    catProduce: "Obst & Gemüse", catProduceSub: "frisch",
    catMeat: "Fleisch & Helal", catMeatSub: "Theke",
    catDairy: "Milchprodukte", catDairySub: "Kühlung",
    catPantry: "Gewürze & Öl", catPantrySub: "Vorrat",
    catSnacks: "Snacks & Süßes", catSnacksSub: "Baklava",
    catDrinks: "Getränke", catDrinksSub: "Ayran & Tee",
    catSaved: "Gemerkte",
    resultPopular: "Beliebt heute",
    filterAll: "Alle", filterFresh: "Frisch", filterDeals: "Deals",
    sortLabel: "Sortierung", sortPopular: "Beliebtheit", sortAsc: "Preis aufsteigend", sortDesc: "Preis absteigend",
    bundlesEyebrow: "Schnell ein ganzer Tisch", bundlesTitle: "Pakete für den Anlass",
    bundleGrillTitle: "Grillabend", bundleGrillText: "Sucuk, Hähnchen, Salatgemüse, Ayran & Joghurt.",
    bundleMezzeTitle: "Mezze-Tisch", bundleMezzeText: "Fladenbrot, Oliven, Feta, Gemüse, Olivenöl.",
    bundleTeaTitle: "Teezeit", bundleTeaText: "Baklava, Çay, Joghurt, Granatapfel.",
    bundleBreakfastTitle: "Frühstück", bundleBreakfastText: "Fladenbrot, Feta, Oliven und Çay.",
    bundleAdd: "Paket hinzufügen",
    recentEyebrow: "Weiter einkaufen", recentTitle: "Zuletzt angesehen",
    cartEyebrow: "Deine Bestellung",
    slotLabel: "Lieferzeit",
    prefSubstitute: "Ersatzartikel erlauben",
    prefContactless: "Kontaktlos liefern",
    noteLabel: "Hinweis für den Fahrer",
    notePlaceholder: "z. B. Bitte nicht klingeln.",
    cartEmptyTitle: "Noch nichts im Korb",
    cartEmptyText: "Tippe bei einem Produkt auf das Plus.",
    upsellHead: "Passt dazu", upsellTitle: "Mach den Einkauf komplett", upsellStart: "Schnell starten",
    apply: "Einlösen",
    promoHint: "Codes: HERDEM10 (10 %) oder FRISCH5 (5 € ab 25 €)",
    promoActive: (c) => `${c} aktiv`,
    promoNotFound: "Gutschein nicht gefunden",
    promoMin: "FRISCH5 gilt ab 25,00 € Warenwert",
    tipLabel: "Trinkgeld für den Fahrer",
    subtotal: "Zwischensumme", discount: "Gutschein", tipShort: "Trinkgeld",
    serviceFee: "Service & Lieferung", grandTotal: "Gesamt",
    free: "Kostenlose Lieferung erreicht",
    freeRemaining: (rest) => `Noch ${rest} bis kostenlose Lieferung`,
    freePickup: "Abholung ohne Servicegebühr",
    freeBase: "Kostenlose Lieferung ab dem Mindestwert",
    toCheckout: "Zur Kasse",
    secureNote: "Sicher: Preise, Ersatzartikel und Slot bleiben bis zur Bestellung sichtbar.",
    free_amount: "Kostenlos",
    saved: (a) => `${a} gespart`,
    items: (n) => `${n} ${n === 1 ? "Artikel" : "Artikel"}`,
    trust1Title: "Helal geprüft", trust1Text: "Markierte Fleisch- und Wurstwaren. Nachweis im Filialaushang.",
    trust2Title: "Kühlkette", trust2Text: "Frischeprodukte werden separat in Isolierboxen verpackt.",
    trust3Title: "Lokale Auswahl", trust3Text: "Bäcker, Metzger und Hofläden aus dem Rhein-Main-Gebiet.",
    trust4Title: "Live-Status", trust4Text: "Vom Korb bis an die Tür: jeder Schritt sichtbar.",
    pulse1: "frische Körbe heute", pulse2: "Verfügbarkeit im Sortiment", pulse3: "Ø Ankunft", pulse4: "aus 312 Bewertungen",
    deliveryEyebrow: "Liefergebiet",
    deliveryTitle: "Wir liefern dort, wo der Kunde wirklich wohnt.",
    deliveryText: "Frankfurt Innenstadt, Westend, Nordend und Offenbach Zentrum. Mindestbestellwert 15 €. Servicegebühr 3,90 € — ab 39 € gratis.",
    check: "Prüfen",
    zipDefault: "Frankfurt und Offenbach sind aktiv. Heute lieferbar bis 22 Uhr.",
    zipActive: (p) => `${p} ist im Liefergebiet — heute lieferbar.`,
    zipInactive: (p) => `${p} ist (noch) nicht im Liefergebiet. Abholung bleibt möglich.`,
    zipEmpty: "Bitte eine 5-stellige PLZ eingeben.",
    installTitle: "Auf dem Homescreen, ohne Store",
    installText: "Schneller Start, Offline-Hülle und Bestell-Verlauf direkt in der App.",
    installCta: "App installieren",
    installReady: "App ist installiert oder schon vorbereitet.",
    installNoSupport: "Dein Browser unterstützt die Installation nicht.",
    installSuccess: "Herdem wurde installiert.",
    installDismiss: "Installation abgebrochen.",
    footerService: "Service", footerShop: "Sortiment", footerHelp: "Hilfe & Kontakt", footerAccount: "Konto",
    footerLegal: "Rechtliches", footerContact: "Kontakt",
    footerTagline: "Türkisch-mediterrane Frische, geliefert in 38 Minuten.",
    footerNote: "Frische, ehrlich gepackt.",
    dockHome: "Start", dockSearch: "Suche", dockFav: "Favoriten", dockAccount: "Konto", dockHelp: "Hilfe", dockCart: "Korb",
    stripPopular: "Beliebte Klassiker", stripFresh: "Frisch heute",
    stripAllPopular: "Alle ansehen →", stripAllFresh: "Alles frische →",
    addrDialogTitle: "Wohin liefern wir?",
    addrStreet: "Straße & Hausnummer",
    addrCity: "PLZ & Stadt",
    addrSave: "Adresse übernehmen",
    addrSaved: "Adresse gespeichert",
    accTitle: "Mein Herdem",
    clubLabel: "Herdem Club", clubPoints: "Punkte gesammelt",
    clubReward: "Bei der nächsten Bestellung 5,00 € Bonus.",
    savedAddress: "Gespeicherte Adresse", noAddress: "Noch keine Adresse",
    favService: "Lieblings-Service", evening: "Lieferung am Abend",
    lastOrder: "Letzte Bestellung",
    reorder: "Bestellung erneut",
    reorderDone: "Letzte Bestellung wurde hinzugefügt.",
    supTitle: "Wir helfen weiter",
    supWelcome: "Merhaba! Wähle ein Thema — Lieferzeit, Zahlung, Frische oder Reklamation.",
    supContactText: "Lieber persönlich?",
    supDelivery: "Lieferzeit", supPayment: "Zahlung", supFresh: "Frische", supRefund: "Reklamation",
    supAnswerDelivery: "Heute liefern wir zwischen 18:00 und 22:00 Uhr. Wähle deinen Slot im Warenkorb.",
    supAnswerPayment: "Du kannst mit Karte, PayPal, Klarna oder bar bei Lieferung zahlen.",
    supAnswerFresh: "Frischeartikel werden gekühlt verpackt und mit Qualitätssiegel versehen.",
    supAnswerRefund: "Schreib uns das Problem — wir erstatten oder ersetzen unkompliziert innerhalb von 24 h.",
    coTitle: "Bestellung abschließen",
    stepCart: "Warenkorb", stepAddr: "Adresse", stepPay: "Zahlung",
    coName: "Name", coPhone: "Telefon", coHint: "Hinweis für den Fahrer",
    payCard: "Karte", payCash: "Bar bei Lieferung",
    payWhatsapp: "WhatsApp", payTransfer: "Überweisung", payPaypal: "PayPal.me",
    payHintCash: "Du bezahlst dem Fahrer bei Lieferung — bitte den Betrag möglichst passend bereithalten.",
    payHintWhatsapp: "Wir öffnen WhatsApp mit deiner Bestellung. Du sendest die Nachricht ab, der Shop bestätigt und liefert.",
    payHintTransfer: "Du bekommst nach der Bestellung Kontodaten und Bestellnummer als Verwendungszweck. Lieferung startet nach Zahlungseingang.",
    payHintPaypal: "Du wirst zu PayPal.me mit dem Betrag weitergeleitet. Schließe die Zahlung dort ab.",
    trTitle: "Überweisung", trIntro: "Bitte den Betrag auf folgendes Konto überweisen — wichtig: Bestellnummer als Verwendungszweck angeben, sonst kann die Bestellung nicht zugeordnet werden.",
    trHolder: "Kontoinhaber", trAmount: "Betrag", trRef: "Verwendungszweck",
    trCopy: "Kopieren", trCopied: "Kopiert ✓", trDone: "Überweisung erledigt",
    waOrderHeader: (code) => `Hallo Herdem, ich möchte folgende Bestellung aufgeben (Code: ${code}):`,
    waOrderFooter: (slot, address) => `\nLieferzeit: ${slot}\nAdresse: ${address}`,
    waNotConfigured: "WhatsApp-Bestellung ist aktuell nicht hinterlegt. Bitte Bar oder Überweisung wählen.",
    paypalNotConfigured: "PayPal.me ist aktuell nicht hinterlegt. Bitte Bar oder Überweisung wählen.",
    transferNotConfigured: "Kontodaten für Überweisung sind aktuell nicht hinterlegt. Bitte Bar wählen.",
    coOverview: "Übersicht",
    coPlace: "Bestellung abschicken",
    coLegal: "Mit der Bestellung akzeptierst du die AGB.",
    okEyebrow: "Bestätigt", okTitle: "Danke, deine Bestellung läuft.",
    okText: "Wir packen frisch und schicken den Fahrer los, sobald alles bereit ist.",
    tlConfirmed: "Bestätigt", tlConfirmedSub: "Warenkorb geprüft",
    tlPacking: "Wird gepackt", tlPackingSub: "Frischetheke und Lager",
    tlOnway: "Unterwegs", tlOnwaySub: "Fahrer auf Route",
    tlDelivered: "Geliefert", tlDeliveredSub: "Afiyet olsun",
    receipt: "Beleg als Datei",
    finish: "Schließen",
    toastAdded: "Hinzugefügt", toastRemoved: "Entfernt",
    toastSaved: "Gemerkt", toastUnsaved: "Aus Merkliste entfernt",
    toastCleared: "Warenkorb geleert",
    toastBundle: "Paket hinzugefügt",
    toastPromo: "Gutschein eingelöst",
    toastPaused: "Shop wurde pausiert", toastResumed: "Shop ist wieder offen",
    toastLang: "Deutsch aktiv",
    toastOffline: "Du bist offline — gespeicherte Inhalte werden angezeigt.",
    toastOnline: "Wieder online.",
    storeClosedAlert: "Der Shop ist gerade pausiert. Du kannst sammeln und später bestellen.",
    trackOrder: "Verfolgen",
    deliveryArriving: (code, min) => `Bestellung ${code} unterwegs`,
    deliveryInMin: (min) => `Ankunft in ${min} min`,
    deliveryArrivedSoon: "Fahrer ist gleich da",
    deliveryArrived: "Geliefert · Afiyet olsun",
    actBought: (n, q, p, ago) => `${n} hat gerade ${q}× ${p} bestellt · vor ${ago} min`,
    actDelivered: (n, ago) => `${n} hat die Bestellung erhalten · vor ${ago} min`,
    actRated: (n, p, ago) => `${n} hat ${p} mit 5★ bewertet · vor ${ago} min`,
    detailAllergens: "Allergene", detailStorage: "Lagerung", detailOrigin: "Herkunft",
    allergenDairy: "Milch/Laktose möglich", allergenCheck: "Bitte Etikett prüfen",
    storageCool: "Gekühlt lagern (2–7 °C)", storageMeat: "Gekühlt verarbeiten", storageDry: "Trocken und dunkel lagern",
    detailMore: "Noch eins hinzufügen", detailAdd: "In den Warenkorb",
  },
  tr: {
    addressLabel: "Teslimat adresi", addressEmpty: "Adres seç",
    serviceDelivery: "Teslimat", servicePickup: "Mağazadan Al", serviceShipping: "Kargo",
    storeOpen: "Bugün 22:00'ye kadar açık", storeClosed: "Mola · Mağazadan alabilirsin",
    tagline: "Türk-Akdeniz tazeliği",
    searchPlaceholder: "Sucuk, zeytin, bulgur ara…",
    cart: "Sepet", clearCart: "Boşalt",
    favorites: "Favoriler",
    heroEyebrow: "Bugün taze paketlendi",
    heroTitle: "Türk-Akdeniz tazeliği, 38 dakikada kapına.",
    heroLead: "Helal et, tezgâhtan; taze sebze, günlük pazardan; baklava, tatlı köşesinden — tek bir akış.",
    heroCtaPrimary: "Hemen alışveriş", heroCtaSecondary: "Fırsatları gör",
    trustHelal: "Helal sertifikalı", trustCold: "Soğuk zincir", trustLocal: "Frankfurt & Offenbach",
    promise1Title: "Taze Tezgâh", promise1Text: "Et, ekmek ve sebze her gün hazırlanır",
    promise2Title: "Helal Ürün Yelpazesi", promise2Text: "Açık etiketleme, seçilmiş markalar",
    promise3Title: "Üç yol, tek akış", promise3Text: "Teslimat, mağazadan al veya kargo — tek tıkla",
    catAll: "Tümü", catAllSub: "Mağaza",
    catOffers: "Fırsatlar", catOffersSub: "bugün",
    catProduce: "Meyve & Sebze", catProduceSub: "taze",
    catMeat: "Et & Helal", catMeatSub: "Tezgâh",
    catDairy: "Süt Ürünleri", catDairySub: "Soğuk",
    catPantry: "Baharat & Yağ", catPantrySub: "Kiler",
    catSnacks: "Atıştırmalık & Tatlı", catSnacksSub: "Baklava",
    catDrinks: "İçecekler", catDrinksSub: "Ayran & Çay",
    catSaved: "Favoriler",
    resultPopular: "Bugünün favorileri",
    filterAll: "Tümü", filterFresh: "Taze", filterDeals: "Fırsat",
    sortLabel: "Sıralama", sortPopular: "Popülerlik", sortAsc: "Fiyat artan", sortDesc: "Fiyat azalan",
    bundlesEyebrow: "Hızlı bir sofra", bundlesTitle: "Anına göre paketler",
    bundleGrillTitle: "Mangal akşamı", bundleGrillText: "Sucuk, tavuk, sebze, ayran & yoğurt.",
    bundleMezzeTitle: "Meze sofrası", bundleMezzeText: "Pide, zeytin, beyaz peynir, sebze, zeytinyağı.",
    bundleTeaTitle: "Çay saati", bundleTeaText: "Baklava, çay, yoğurt, nar.",
    bundleBreakfastTitle: "Kahvaltı", bundleBreakfastText: "Pide, beyaz peynir, zeytin ve çay.",
    bundleAdd: "Paketi ekle",
    recentEyebrow: "Alışverişe devam", recentTitle: "Son baktıkların",
    cartEyebrow: "Sipariş",
    slotLabel: "Teslimat saati",
    prefSubstitute: "Yedek ürüne izin ver",
    prefContactless: "Temassız teslimat",
    noteLabel: "Kuryeye not",
    notePlaceholder: "Örn. Lütfen zili çalmayın.",
    cartEmptyTitle: "Sepetin boş",
    cartEmptyText: "Bir ürünün artı düğmesine dokun.",
    upsellHead: "Yanına gider", upsellTitle: "Tamamla", upsellStart: "Hızlı başla",
    apply: "Kullan",
    promoHint: "Kodlar: HERDEM10 (%10) veya FRISCH5 (25 € üzeri 5 €)",
    promoActive: (c) => `${c} aktif`,
    promoNotFound: "Kupon bulunamadı",
    promoMin: "FRISCH5 en az 25,00 € içindir",
    tipLabel: "Kurye için bahşiş",
    subtotal: "Ara toplam", discount: "Kupon", tipShort: "Bahşiş",
    serviceFee: "Servis & Teslimat", grandTotal: "Toplam",
    free: "Ücretsiz teslimat eşiği aşıldı",
    freeRemaining: (rest) => `Ücretsiz teslimata ${rest} kaldı`,
    freePickup: "Mağazadan alımda servis ücreti yok",
    freeBase: "Asgari tutardan itibaren ücretsiz teslimat",
    toCheckout: "Ödemeye geç",
    secureNote: "Güvenli: Fiyat, yedek ürün ve slot sipariş anına kadar görünür.",
    free_amount: "Ücretsiz",
    saved: (a) => `${a} tasarruf`,
    items: (n) => `${n} ürün`,
    trust1Title: "Helal sertifikalı", trust1Text: "Etiketli et ve şarküteri. Mağazada belge.",
    trust2Title: "Soğuk zincir", trust2Text: "Taze ürünler termal kutuda ayrı paketlenir.",
    trust3Title: "Yerel seçim", trust3Text: "Rhein-Main bölgesinden fırın, kasap, çiftçi.",
    trust4Title: "Canlı durum", trust4Text: "Sepetten kapıya kadar her adım görünür.",
    pulse1: "bugünkü taze sepet", pulse2: "ürün bulunabilirlik", pulse3: "ortalama varış", pulse4: "312 değerlendirme",
    deliveryEyebrow: "Teslimat bölgesi",
    deliveryTitle: "Müşterinin yaşadığı yere teslim ediyoruz.",
    deliveryText: "Frankfurt merkez, Westend, Nordend ve Offenbach. Asgari 15 €. Servis 3,90 € — 39 € üzerinde ücretsiz.",
    check: "Sorgula",
    zipDefault: "Frankfurt ve Offenbach aktif. Bugün 22:00'ye kadar.",
    zipActive: (p) => `${p} teslimat bölgesinde — bugün teslim edilir.`,
    zipInactive: (p) => `${p} henüz teslimat bölgemizde değil. Mağazadan alabilirsin.`,
    zipEmpty: "Lütfen 5 haneli posta kodu girin.",
    installTitle: "Mağazasız, ana ekranda",
    installText: "Hızlı başlangıç, çevrim dışı kabuk ve sipariş geçmişi uygulamada.",
    installCta: "Uygulamayı yükle",
    installReady: "Uygulama yüklendi veya hazır.",
    installNoSupport: "Tarayıcın yüklemeyi desteklemiyor.",
    installSuccess: "Herdem yüklendi.",
    installDismiss: "Yükleme iptal edildi.",
    footerService: "Servis", footerShop: "Mağaza", footerHelp: "Yardım & İletişim", footerAccount: "Hesap",
    footerLegal: "Hukuki", footerContact: "İletişim",
    footerTagline: "Türk-Akdeniz tazeliği, 38 dakikada teslim.",
    footerNote: "Taze, dürüstçe paketlenmiş.",
    dockHome: "Ana", dockSearch: "Ara", dockFav: "Favoriler", dockAccount: "Hesap", dockHelp: "Yardım", dockCart: "Sepet",
    stripPopular: "Popüler Klasikler", stripFresh: "Bugün taze",
    stripAllPopular: "Tümünü gör →", stripAllFresh: "Hepsi taze →",
    addrDialogTitle: "Nereye teslim?",
    addrStreet: "Sokak ve numara",
    addrCity: "Posta kodu ve şehir",
    addrSave: "Adresi kaydet",
    addrSaved: "Adres kaydedildi",
    accTitle: "Hesabım",
    clubLabel: "Herdem Club", clubPoints: "puan toplandı",
    clubReward: "Bir sonraki siparişte 5,00 € bonus.",
    savedAddress: "Kayıtlı adres", noAddress: "Henüz adres yok",
    favService: "Tercih edilen servis", evening: "Akşam teslimatı",
    lastOrder: "Son sipariş",
    reorder: "Tekrar sipariş ver",
    reorderDone: "Son sipariş sepete eklendi.",
    supTitle: "Yardımcı olalım",
    supWelcome: "Merhaba! Bir konu seç — teslimat, ödeme, tazelik veya iade.",
    supContactText: "Kişisel iletişim?",
    supDelivery: "Teslimat saati", supPayment: "Ödeme", supFresh: "Tazelik", supRefund: "İade",
    supAnswerDelivery: "Bugün 18:00–22:00 arası teslim ediyoruz. Slotu sepette seç.",
    supAnswerPayment: "Kart, PayPal, Klarna veya kapıda nakit ödeme.",
    supAnswerFresh: "Taze ürünler soğuk paketlenir ve kalite mührü taşır.",
    supAnswerRefund: "Sorunu yaz — 24 saat içinde iade veya değişim.",
    coTitle: "Siparişi tamamla",
    stepCart: "Sepet", stepAddr: "Adres", stepPay: "Ödeme",
    coName: "Ad Soyad", coPhone: "Telefon", coHint: "Kuryeye not",
    payCard: "Kart", payCash: "Kapıda nakit",
    payWhatsapp: "WhatsApp", payTransfer: "Havale", payPaypal: "PayPal.me",
    payHintCash: "Tutarı kuryeye teslimde ödersin — mümkünse net hazır bulundur.",
    payHintWhatsapp: "Siparişin WhatsApp'ta açılır. Mesajı gönder, mağaza onaylar ve hazırlar.",
    payHintTransfer: "Sipariş sonrası hesap bilgileri ve sipariş kodu açıklama olarak gösterilir. Ödeme alındıktan sonra teslimat başlar.",
    payHintPaypal: "PayPal.me sayfasına tutarla yönlendirileceksin. Ödemeyi orada tamamla.",
    trTitle: "Havale", trIntro: "Lütfen tutarı aşağıdaki hesaba gönder — sipariş kodunu açıklamaya yazmayı unutma, aksi halde sipariş eşleştirilemez.",
    trHolder: "Hesap sahibi", trAmount: "Tutar", trRef: "Açıklama",
    trCopy: "Kopyala", trCopied: "Kopyalandı ✓", trDone: "Havaleyi gönderdim",
    waOrderHeader: (code) => `Merhaba Herdem, şu siparişi vermek istiyorum (Kod: ${code}):`,
    waOrderFooter: (slot, address) => `\nTeslimat zamanı: ${slot}\nAdres: ${address}`,
    waNotConfigured: "WhatsApp siparişi şu an aktif değil. Lütfen kapıda nakit veya havale seç.",
    paypalNotConfigured: "PayPal.me şu an aktif değil. Lütfen kapıda nakit veya havale seç.",
    transferNotConfigured: "Havale için hesap bilgileri henüz girilmedi. Lütfen kapıda nakit seç.",
    coOverview: "Özet",
    coPlace: "Siparişi gönder",
    coLegal: "Sipariş vererek koşulları kabul edersin.",
    okEyebrow: "Onaylandı", okTitle: "Teşekkürler, siparişin hazırlanıyor.",
    okText: "Taze paketleyip kuryeyi yolluyoruz.",
    tlConfirmed: "Onaylandı", tlConfirmedSub: "Sepet kontrol edildi",
    tlPacking: "Hazırlanıyor", tlPackingSub: "Tezgâh ve depo",
    tlOnway: "Yolda", tlOnwaySub: "Kurye yolda",
    tlDelivered: "Teslim edildi", tlDeliveredSub: "Afiyet olsun",
    receipt: "Fişi indir",
    finish: "Kapat",
    toastAdded: "Eklendi", toastRemoved: "Çıkarıldı",
    toastSaved: "Favorilere eklendi", toastUnsaved: "Favorilerden çıkarıldı",
    toastCleared: "Sepet boşaltıldı",
    toastBundle: "Paket eklendi",
    toastPromo: "Kupon kullanıldı",
    toastPaused: "Mağaza moladır", toastResumed: "Mağaza tekrar açık",
    toastLang: "Türkçe aktif",
    toastOffline: "Çevrim dışısın — kayıtlı içerik gösteriliyor.",
    toastOnline: "Tekrar çevrim içi.",
    storeClosedAlert: "Mağaza şu anda molada. Sepeti dolduran sonra sipariş verebilir.",
    trackOrder: "Takip et",
    deliveryArriving: (code, min) => `${code} yolda`,
    deliveryInMin: (min) => `${min} dk sonra varır`,
    deliveryArrivedSoon: "Kurye birazdan kapında",
    deliveryArrived: "Teslim edildi · Afiyet olsun",
    actBought: (n, q, p, ago) => `${n} ${q}× ${p} sipariş etti · ${ago} dk önce`,
    actDelivered: (n, ago) => `${n} siparişini aldı · ${ago} dk önce`,
    actRated: (n, p, ago) => `${n} ${p} ürününe 5★ verdi · ${ago} dk önce`,
    detailAllergens: "Alerjenler", detailStorage: "Saklama", detailOrigin: "Menşe",
    allergenDairy: "Süt/laktoz içerebilir", allergenCheck: "Etiketi kontrol et",
    storageCool: "Soğukta sakla (2–7 °C)", storageMeat: "Soğukta işle", storageDry: "Kuru ve karanlıkta sakla",
    detailMore: "Bir tane daha ekle", detailAdd: "Sepete ekle",
  }
};

const t = (key, ...args) => {
  const dict = i18n[state.lang] || i18n.de;
  const value = dict[key];
  if (typeof value === "function") return value(...args);
  return value ?? key;
};

/* ---------- Storage helpers (safe parse) ---------- */
const safeJSON = (raw, fallback) => {
  try { return raw == null ? fallback : JSON.parse(raw); }
  catch { return fallback; }
};

const lsGet = (key, fallback) => safeJSON(localStorage.getItem(key), fallback);
const lsSet = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* quota/private */ }
};

/* ---------- State ---------- */
const params = new URLSearchParams(location.search);
const detectLang = () => {
  const fromUrl = params.get("lang");
  if (fromUrl === "de" || fromUrl === "tr") return fromUrl;
  const stored = localStorage.getItem("herdem.lang");
  if (stored === "de" || stored === "tr") return stored;
  return (navigator.language || "de").toLowerCase().startsWith("tr") ? "tr" : "de";
};

const state = {
  category: "all",
  query: "",
  sort: "popular",
  tag: "all",
  service: "delivery",
  cart: lsGet("herdem.cart", {}),
  favorites: lsGet("herdem.favorites", []),
  recent: lsGet("herdem.recent", []),
  promo: localStorage.getItem("herdem.promo") || "",
  tip: Number(localStorage.getItem("herdem.tip") || 0),
  lang: detectLang(),
  address: lsGet("herdem.address", null),
  slot: localStorage.getItem("herdem.slot") || "",
  pay: localStorage.getItem("herdem.pay") || "cash",
  storeOpen: cmsSettings.storeOpen !== false,
  installPrompt: null,
  toastTimer: 0,
  lastReceipt: null,
};

/* ---------- Formatters ---------- */
const moneyFmt = () => new Intl.NumberFormat(state.lang === "tr" ? "tr-TR" : "de-DE",
  { style: "currency", currency: "EUR" });
const money = (n) => moneyFmt().format(n);

const dateFmt = () => new Intl.DateTimeFormat(state.lang === "tr" ? "tr-TR" : "de-DE",
  { weekday: "short", day: "2-digit", month: "2-digit" });
const timeRange = (h1, h2) => `${String(h1).padStart(2,"0")}:00 – ${String(h2).padStart(2,"0")}:00`;

/* ---------- DOM ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

const els = {
  grid: $("#productGrid"),
  recent: $("#recentSection"),
  recentGrid: $("#recentGrid"),
  search: $("#searchInput"),
  searchClear: $("#searchClear"),
  sort: $("#sortSelect"),
  cartItems: $("#cartItems"),
  emptyCart: $("#emptyCart"),
  upsell: $("#cartUpsell"),
  subtotal: $("#subtotal"),
  fee: $("#deliveryFee"),
  grand: $("#grandTotal"),
  cartPill: $("#cartTotalPill"),
  cartBadge: $("#cartCountBadge"),
  cartCountText: $("#cartCountText"),
  cartSavings: $("#cartSavings"),
  checkout: $("#checkoutButton"),
  freeLine: $("#freeLine"),
  discount: $("#discountTotal"),
  tipTotal: $("#tipTotal"),
  promo: $("#promoInput"),
  promoMsg: $("#promoMessage"),
  progress: $("#progressFill"),
  cartPanel: $("#cartPanel"),
  backdrop: $("#cartBackdrop"),
  addressDialog: $("#addressDialog"),
  productDialog: $("#productDialog"),
  checkoutDialog: $("#checkoutDialog"),
  successDialog: $("#successDialog"),
  accountDialog: $("#accountDialog"),
  supportDialog: $("#supportDialog"),
  productDetail: $("#productDetail"),
  checkoutSummary: $("#checkoutSummary"),
  addressLabel: $("#addressLabel"),
  toast: $("#toast"),
  storeStatus: $("#storeStatus"),
  langToggle: $("#langToggle"),
  favoriteCount: $("#favoriteCount"),
  slot: $("#slotSelect"),
  dockCart: $("#dockCartCount"),
  installBtn: $("#installButton"),
  zipInput: $("#zipInput"),
  zipResult: $("#zipResult"),
  copyYear: $("#copyYear"),
  stickyBar: $("#stickyCartBar"),
  scbCount: $("#scbCount"),
  scbTotal: $("#scbTotal"),
  scbGo: $("#scbGo"),
  deliveryTracker: $("#deliveryTracker"),
  dtTitle: $("#dtTitle"),
  dtSub: $("#dtSub"),
  dtMin: $("#dtMin"),
  dtTrack: $("#dtTrack"),
  dtClose: $("#dtClose"),
  activityMsg: $("#activityMsg"),
};

/* ---------- Slot generation ---------- */
function buildSlots() {
  const slots = [];
  const now = new Date();
  const hour = now.getHours();
  const dFmt = dateFmt();
  const todayLabel = dFmt.format(now);
  const slotRanges = [[10,12],[12,14],[14,16],[16,18],[18,20],[20,22]];
  for (const [a, b] of slotRanges) {
    if (hour + 1 < a) slots.push({ value: `today-${a}`, label: `${todayLabel}, ${timeRange(a,b)}` });
  }
  const tomorrow = new Date(now.getTime() + 24*3600*1000);
  const tomorrowLabel = dFmt.format(tomorrow);
  for (const [a, b] of slotRanges) {
    slots.push({ value: `tomorrow-${a}`, label: `${tomorrowLabel}, ${timeRange(a,b)}` });
  }
  els.slot.innerHTML = slots.map(s => `<option value="${s.value}">${s.label}</option>`).join("");
  // restore if available, otherwise default first
  if (state.slot && slots.some(s => s.value === state.slot)) els.slot.value = state.slot;
  else state.slot = slots[0]?.value || "";
}

/* ---------- i18n DOM apply ---------- */
function applyI18n() {
  document.documentElement.lang = state.lang;
  $$("[data-i18n]").forEach(node => {
    const key = node.getAttribute("data-i18n");
    const val = t(key);
    if (typeof val === "string") node.textContent = val;
  });
  $$("[data-i18n-attr]").forEach(node => {
    const spec = node.getAttribute("data-i18n-attr");
    spec.split(",").forEach(pair => {
      const [attr, key] = pair.split(":").map(s => s.trim());
      const val = t(key);
      if (typeof val === "string") node.setAttribute(attr, val);
    });
  });
  els.langToggle.textContent = state.lang === "de" ? "TR" : "DE";
  els.copyYear.textContent = new Date().getFullYear();
}

/* ---------- Store state visuals ---------- */
function renderStoreStatus() {
  document.body.classList.toggle("store-paused", !state.storeOpen);
  els.storeStatus.lastChild && (els.storeStatus.lastChild.nodeValue = " " + (state.storeOpen ? t("storeOpen") : t("storeClosed")));
}

/* ---------- Filter / sort ---------- */
function normalize(str) {
  return String(str || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const TAG_CLASS = {
  "Helal": "helal", "Angebot": "angebot", "Vegan": "vegan",
  "Frisch": "frisch", "Kühlung": "kuhlung", "Beliebt": "beliebt"
};

function filteredProducts() {
  const q = normalize(state.query.trim());
  const items = activeProducts().filter(p => {
    const inCat =
      state.category === "all" ||
      (state.category === "favorites" && state.favorites.includes(p.id)) ||
      p.category === state.category ||
      (state.category === "angebote" && p.tags.includes("Angebot"));
    const inTag = state.tag === "all" || p.tags.includes(state.tag);
    if (!q) return inCat && inTag;
    const hay = normalize([p.name.de, p.name.tr, p.note.de, p.note.tr, p.origin, p.tags.join(" ")].join(" "));
    return inCat && inTag && hay.includes(q);
  });
  if (state.sort === "price-asc") items.sort((a,b) => a.price - b.price);
  else if (state.sort === "price-desc") items.sort((a,b) => b.price - a.price);
  else items.sort((a,b) => b.popularity - a.popularity);
  return items;
}

/* ---------- Render: products grid ---------- */
function renderProducts() {
  const list = filteredProducts();
  $("#resultKicker").textContent = t({
    all: "catAll", angebote: "catOffers", obst: "catProduce", fleisch: "catMeat",
    milch: "catDairy", gewuerze: "catPantry", snacks: "catSnacks", getraenke: "catDrinks",
    favorites: "catSaved"
  }[state.category] || "catAll");

  $("#resultTitle").textContent =
    state.category === "favorites" ? t("catSaved") :
    state.query ? `${list.length} ${state.lang === "tr" ? "sonuç" : "Treffer"}` :
    t("resultPopular");

  updateFavoriteBadges();

  if (!list.length) {
    els.grid.innerHTML = `
      <div class="grid-empty">
        <strong>${state.category === "favorites"
          ? (state.lang === "tr" ? "Henüz favorin yok." : "Noch keine gemerkten Produkte.")
          : (state.lang === "tr" ? "Sonuç bulunamadı." : "Keine Produkte gefunden.")}</strong>
        <span>${state.category === "favorites"
          ? (state.lang === "tr" ? "Bir ürünün kalbine dokun, hızlı bul." : "Tippe auf das Herz, dann findest du es schneller wieder.")
          : (state.lang === "tr" ? "Başka arama veya kategori dene." : "Versuche eine andere Suche oder Kategorie.")}</span>
      </div>`;
    renderRecent();
    return;
  }

  const frag = document.createDocumentFragment();
  for (const p of list) {
    frag.appendChild(buildCard(p));
  }
  els.grid.replaceChildren(frag);
  renderRecent();
}

function buildCard(p) {
  const q = state.cart[p.id] || 0;
  const isFav = state.favorites.includes(p.id);
  const card = document.createElement("article");
  card.className = "card" + (isFav ? " is-saved" : "");
  card.dataset.id = p.id;
  const rating = (4.6 + (p.popularity % 4) / 10).toFixed(1);
  card.innerHTML = `
    <div class="card-media">
      <img src="${productImage(p.id)}" alt="" width="220" height="220" loading="lazy" decoding="async"
           onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
      <div class="badge-row">
        ${p.tags.map(tag => `<span class="badge ${TAG_CLASS[tag] || ""}">${tag}</span>`).join("")}
      </div>
      <button class="save-btn" type="button" data-favorite="${p.id}" aria-label="${isFav ? t("toastUnsaved") : t("toastSaved")} – ${p.name[state.lang]}" aria-pressed="${isFav}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.5-7-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6.5-9 11-9 11z" fill="${isFav ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.6"/></svg>
      </button>
      <button class="detail-btn" type="button" data-detail="${p.id}">Details</button>
    </div>
    <div class="card-body">
      <span class="card-origin">${p.origin}</span>
      <h3 class="card-title">${p.name[state.lang]}</h3>
      <p class="card-note">${p.note[state.lang]}</p>
      <div class="card-trust">
        <span>${rating} ★</span>
        <span>${state.lang === "tr" ? "Bugün taze" : "Heute frisch"}</span>
      </div>
      <span class="card-unit">${p.unit}</span>
      <div class="card-price">
        <span class="price">${money(p.price)}</span>
        ${p.oldPrice ? `<span class="old">${money(p.oldPrice)}</span>` : ""}
      </div>
      <div class="card-add">
        ${q ? `
          <div class="stepper" aria-label="Menge">
            <button type="button" data-decrease="${p.id}" aria-label="−">−</button>
            <span data-qty="${p.id}">${q}</span>
            <button type="button" data-increase="${p.id}" aria-label="+">+</button>
          </div>
          <button class="add-btn" type="button" data-increase="${p.id}">+1</button>
        ` : `
          <button class="add-btn" type="button" data-increase="${p.id}">${state.lang === "tr" ? "Sepete ekle" : "In den Warenkorb"}</button>
        `}
      </div>
    </div>
  `;
  return card;
}

/* ---------- Render: cart ---------- */
function cartEntries() {
  return Object.entries(state.cart)
    .map(([id, qty]) => ({ ...products.find(p => p.id === id), qty }))
    .filter(e => e.id && e.qty > 0);
}

function serviceFee(subtotal) {
  if (!state.storeOpen) return 0;
  if (state.service === "pickup") return 0;
  if (subtotal === 0) return 0;
  const limit = state.service === "shipping" ? (cmsSettings.freeShipping ?? 49) : (cmsSettings.freeDelivery ?? 39);
  if (subtotal >= limit) return 0;
  return state.service === "shipping" ? (cmsSettings.feeShipping ?? 4.9) : (cmsSettings.feeDelivery ?? 3.9);
}

function findPromo(code) {
  return (cmsSettings.promos || []).find(p => p.code === code);
}

function promoDiscount(subtotal) {
  if (!state.promo) return 0;
  const promo = findPromo(state.promo);
  if (!promo) return 0;
  if (subtotal < (promo.min || 0)) return 0;
  if (promo.type === "percent") {
    const raw = subtotal * (promo.value / 100);
    return promo.max ? Math.min(raw, promo.max) : raw;
  }
  return promo.value; // fixed
}

function totals() {
  const entries = cartEntries();
  const subtotal = entries.reduce((s, e) => s + e.price * e.qty, 0);
  const itemCount = entries.reduce((s, e) => s + e.qty, 0);
  const savings = entries.reduce((s, e) => s + ((e.oldPrice || e.price) - e.price) * e.qty, 0);
  const fee = serviceFee(subtotal);
  const discount = promoDiscount(subtotal);
  const tip = state.tip;
  const total = Math.max(0, subtotal - discount) + fee + tip;
  return { entries, subtotal, itemCount, savings, fee, discount, tip, total };
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderCuratedStrips() {
  const popular = activeProducts()
    .slice()
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 4);
  const fresh = activeProducts().filter(p => p.tags.includes("Frisch")).slice(0, 8);

  const popEl = document.getElementById("stripPopular");
  if (popEl) {
    popEl.innerHTML = popular.map(p => {
      const inCart = state.cart[p.id] || 0;
      return `
        <article class="strip-card" data-id="${p.id}">
          <a class="sc-image" href="#" data-detail="${p.id}" aria-label="${esc(p.name[state.lang] || p.name.de)}">
            <img src="${productImage(p.id)}" alt="" width="180" height="180" loading="lazy" decoding="async"
                 onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
          </a>
          <div class="sc-body">
            <p class="sc-name">${esc(p.name[state.lang] || p.name.de)}</p>
            <div class="sc-foot">
              <span class="sc-price">${money(p.price)}</span>
              ${inCart
                ? `<div class="sc-step">
                    <button class="sc-mini" data-decrease="${p.id}" aria-label="−">−</button>
                    <span>${inCart}</span>
                    <button class="sc-mini sc-plus" data-increase="${p.id}" aria-label="+">+</button>
                   </div>`
                : `<button class="sc-add" type="button" data-increase="${p.id}" aria-label="${state.lang === "tr" ? "Sepete ekle" : "In den Warenkorb"}">+</button>`
              }
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  const freshEl = document.getElementById("stripFresh");
  if (freshEl) {
    freshEl.innerHTML = fresh.map(p => {
      const isFav = state.favorites.includes(p.id);
      return `
        <article class="strip-h-card" role="listitem" data-id="${p.id}">
          <div class="shc-media">
            <a class="shc-image" href="#" data-detail="${p.id}" aria-label="${esc(p.name[state.lang] || p.name.de)}">
              <img src="${productImage(p.id)}" alt="" width="200" height="160" loading="lazy" decoding="async"
                   onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
            </a>
            <button class="shc-fav ${isFav ? "is-fav" : ""}" type="button" data-favorite="${p.id}" aria-label="Favorit" aria-pressed="${isFav}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.5-9.5-9C1.2 8.6 2.4 5 6 5c1.9 0 3.4 1 4 2 .6-1 2.1-2 4-2 3.6 0 4.8 3.6 3.5 6-2.5 4.5-9.5 9-9.5 9z" fill="${isFav ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
            </button>
            <span class="shc-tag">${state.lang === "tr" ? "Bugün taze" : "Heute frisch"}</span>
          </div>
          <div class="shc-body">
            <p class="shc-name">${esc(p.name[state.lang] || p.name.de)}</p>
            <div class="shc-foot">
              <span class="shc-price">${money(p.price)}</span>
              <button class="shc-add" type="button" data-increase="${p.id}">${state.lang === "tr" ? "Sepete ekle" : "In den Warenkorb"}</button>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }
}

function renderCart() {
  const T = totals();

  // Items
  els.cartItems.innerHTML = T.entries.map(e => `
    <div class="cart-item">
      <img src="${productImage(e.id)}" alt="" width="56" height="56" loading="lazy" decoding="async"
           onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
      <div class="cart-item-body">
        <strong>${e.name[state.lang]}</strong>
        <div class="cart-line">
          <div class="mini-stepper" aria-label="${e.name[state.lang]}">
            <button type="button" data-decrease="${e.id}" aria-label="−">−</button>
            <span>${e.qty}</span>
            <button type="button" data-increase="${e.id}" aria-label="+">+</button>
          </div>
          <strong>${money(e.price * e.qty)}</strong>
        </div>
      </div>
    </div>
  `).join("");
  els.emptyCart.hidden = T.entries.length > 0;

  // Upsell
  const cartIds = T.entries.map(e => e.id);
  const upsells = products.filter(p => !cartIds.includes(p.id))
    .sort((a,b) => b.popularity - a.popularity).slice(0, 3);
  if (upsells.length) {
    els.upsell.hidden = false;
    els.upsell.innerHTML = `
      <div class="upsell-head">
        <span>${t("upsellHead")}</span>
        <strong>${T.entries.length ? t("upsellTitle") : t("upsellStart")}</strong>
      </div>
      ${upsells.map(p => `
        <button class="upsell-item" type="button" data-increase="${p.id}">
          <img src="${productImage(p.id)}" alt="" width="38" height="38" loading="lazy" decoding="async">
          <span>${p.name[state.lang]}</span>
          <strong>${money(p.price)}</strong>
        </button>
      `).join("")}
    `;
  } else {
    els.upsell.hidden = true;
  }

  // Totals
  els.subtotal.textContent = money(T.subtotal);
  els.discount.textContent = T.discount ? `−${money(T.discount)}` : money(0);
  els.tipTotal.textContent = money(T.tip);
  els.fee.textContent = T.fee ? money(T.fee) : t("free_amount");
  els.grand.textContent = money(T.total);
  els.cartPill.textContent = money(T.subtotal);
  els.cartBadge.hidden = T.itemCount === 0;
  els.cartBadge.textContent = T.itemCount;
  els.dockCart.hidden = T.itemCount === 0;
  els.dockCart.textContent = T.itemCount;
  els.cartCountText.textContent = t("items", T.itemCount);
  els.cartSavings.textContent = t("saved", money(T.savings));

  // Promo state
  els.promo.value = state.promo;
  if (state.promo && T.discount > 0) {
    els.promoMsg.textContent = t("promoActive", state.promo);
    els.promoMsg.classList.add("is-active");
    els.promoMsg.classList.remove("is-error");
  } else if (state.promo && T.discount === 0) {
    // Promo set but not currently valid (e.g. cart shrunk under threshold)
    els.promoMsg.textContent = t("promoMin");
    els.promoMsg.classList.add("is-error");
    els.promoMsg.classList.remove("is-active");
  } else {
    els.promoMsg.textContent = t("promoHint");
    els.promoMsg.classList.remove("is-active", "is-error");
  }

  // Tip buttons
  $$("[data-tip]").forEach(b => b.classList.toggle("is-active", Number(b.dataset.tip) === state.tip));

  // Progress + free line
  const limit = state.service === "shipping" ? 49 : 39;
  const pct = state.service === "pickup" ? 100 : Math.min(100, (T.subtotal / limit) * 100);
  els.progress.style.width = pct + "%";

  els.freeLine.classList.remove("free");
  if (state.service === "pickup") {
    els.freeLine.textContent = t("freePickup");
  } else if (T.subtotal === 0) {
    els.freeLine.textContent = t("freeBase");
  } else if (T.subtotal >= limit) {
    els.freeLine.textContent = t("free");
    els.freeLine.classList.add("free");
  } else {
    els.freeLine.textContent = t("freeRemaining", money(limit - T.subtotal));
  }

  // Checkout button: disabled if empty OR store paused
  els.checkout.disabled = T.entries.length === 0 || !state.storeOpen;
  els.checkout.textContent = !state.storeOpen
    ? (state.lang === "tr" ? "Mağaza molada" : "Shop pausiert")
    : t("toCheckout");

  // Persist
  lsSet("herdem.cart", state.cart);
  updateStickyBar?.();
}

/* ---------- Render: recent ---------- */
function renderRecent() {
  const items = state.recent.map(id => products.find(p => p.id === id)).filter(Boolean);
  els.recent.hidden = items.length === 0;
  els.recentGrid.innerHTML = items.map(p => `
    <button class="recent-card" type="button" data-detail="${p.id}">
      <img src="${productImage(p.id)}" alt="" width="50" height="50" loading="lazy" decoding="async">
      <div>
        <strong>${p.name[state.lang]}</strong>
        <span>${money(p.price)}</span>
      </div>
    </button>
  `).join("");
}

/* ---------- Mutations (partial update for perf) ---------- */
function setQuantity(id, qty) {
  if (qty <= 0) delete state.cart[id];
  else state.cart[id] = qty;
}

function changeQty(id, delta) {
  const current = state.cart[id] || 0;
  const next = Math.max(0, current + delta);
  setQuantity(id, next);

  // Partial update: only mutate the matching card if it exists
  const card = els.grid.querySelector(`.card[data-id="${id}"]`);
  if (card) {
    const p = products.find(x => x.id === id);
    const fresh = buildCard(p);
    card.replaceWith(fresh);
  }
  // Refresh curated strips' steppers (if the changed product is shown there)
  if (document.getElementById("stripPopular")?.querySelector(`[data-id="${id}"]`) ||
      document.getElementById("stripFresh")?.querySelector(`[data-id="${id}"]`)) {
    renderCuratedStrips();
  }
  renderCart();
  lsSet("herdem.cart", state.cart);
}

function addBundle(id) {
  const ids = bundles[id] || [];
  ids.forEach(pid => state.cart[pid] = (state.cart[pid] || 0) + 1);
  renderProducts();
  renderCart();
  if (window.innerWidth <= 1200) openCart();
  showToast(t("toastBundle"));
  lsSet("herdem.cart", state.cart);
}

function setActiveDock(name) {
  $$(".mobile-dock [data-dock]").forEach(b => b.classList.toggle("is-active", b.dataset.dock === name));
}

function updateFavoriteBadges() {
  const n = state.favorites.length;
  if (els.favoriteCount) els.favoriteCount.textContent = n;
  const dock = document.getElementById("dockFavCount");
  if (dock) { dock.textContent = n; dock.hidden = n === 0; }
}

function toggleFavorite(id) {
  const was = state.favorites.includes(id);
  state.favorites = was ? state.favorites.filter(x => x !== id) : [...state.favorites, id];
  lsSet("herdem.favorites", state.favorites);
  updateFavoriteBadges();
  const card = els.grid.querySelector(`.card[data-id="${id}"]`);
  if (card) {
    const p = products.find(x => x.id === id);
    card.replaceWith(buildCard(p));
  }
  showToast(was ? t("toastUnsaved") : t("toastSaved"));
}

function rememberProduct(id) {
  state.recent = [id, ...state.recent.filter(x => x !== id)].slice(0, 6);
  lsSet("herdem.recent", state.recent);
  renderRecent();
}

/* ---------- Product detail ---------- */
function openProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  rememberProduct(id);
  const q = state.cart[p.id] || 0;
  const rating = (4.6 + (p.popularity % 4) / 10).toFixed(1);
  const allergens = (p.category === "milch" || p.tags.includes("Kühlung"))
    ? t("allergenDairy") : t("allergenCheck");
  const storage = p.tags.includes("Kühlung") ? t("storageCool")
    : p.category === "fleisch" ? t("storageMeat") : t("storageDry");

  els.productDetail.innerHTML = `
    <div class="detail-layout">
      <img src="${productImage(p.id)}" alt="${p.name[state.lang]}" width="400" height="400" loading="lazy" decoding="async"
           onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">
      <div class="detail-info">
        <span class="card-origin">${p.origin}</span>
        <h2>${p.name[state.lang]}</h2>
        <p>${p.note[state.lang]}</p>
        <div class="detail-tags">
          ${p.tags.map(tag => `<span>${tag}</span>`).join("")}
          <span>${rating} ★</span>
        </div>
        <div class="info-grid">
          <div><strong>${t("detailAllergens")}</strong><span>${allergens}</span></div>
          <div><strong>${t("detailStorage")}</strong><span>${storage}</span></div>
          <div><strong>${t("detailOrigin")}</strong><span>${p.origin}</span></div>
        </div>
        <div class="detail-price">
          <strong>${money(p.price)}</strong>
          <span>${p.unit}</span>
        </div>
        <button class="btn-checkout" type="button" data-increase="${p.id}" data-close-after="1">
          ${q ? t("detailMore") : t("detailAdd")}
        </button>
      </div>
    </div>
  `;
  els.productDialog.showModal();
}

/* ---------- Checkout summary ---------- */
function renderCheckoutSummary() {
  const T = totals();
  const contactless = $("#contactlessToggle").checked
    ? (state.lang === "tr" ? "Temassız" : "Kontaktlos")
    : (state.lang === "tr" ? "Kişisel" : "Persönlich");
  const subs = $("#substituteToggle").checked
    ? (state.lang === "tr" ? "Yedek ürün ok" : "Ersatz erlaubt")
    : (state.lang === "tr" ? "Yedek ürün yok" : "Kein Ersatz");
  const note = $("#orderNote").value.trim();
  const slotLabel = els.slot.selectedOptions[0]?.textContent || "";
  const addr = els.addressLabel.textContent;

  els.checkoutSummary.innerHTML = `
    <div class="checkout-card">
      ${T.entries.map(e => `
        <div class="checkout-line">
          <span>${e.qty} × ${e.name[state.lang]}</span>
          <strong>${money(e.price * e.qty)}</strong>
        </div>
      `).join("")}
    </div>
    <div class="checkout-total">
      <div class="line"><span>${t("subtotal")}</span><strong>${money(T.subtotal)}</strong></div>
      <div class="line"><span>${t("discount")}</span><strong>${T.discount ? `−${money(T.discount)}` : money(0)}</strong></div>
      <div class="line"><span>${t("tipShort")}</span><strong>${money(T.tip)}</strong></div>
      <div class="line"><span>${t("serviceFee")}</span><strong>${T.fee ? money(T.fee) : t("free_amount")}</strong></div>
      <div class="line line-total"><span>${t("grandTotal")}</span><strong>${money(T.total)}</strong></div>
    </div>
    <div class="delivery-note">
      <strong>${slotLabel}</strong>
      <span>${addr !== t("addressEmpty") ? addr : t("noAddress")}</span>
      <span>${contactless} · ${subs}</span>
      ${note ? `<span>${note}</span>` : ""}
    </div>
  `;
}

/* ---------- Receipt ---------- */
function receiptText(r) {
  const lines = r.entries.map(e => `${e.qty}× ${e.name[state.lang]} — ${money(e.price * e.qty)}`);
  return [
    "Herdem · Beleg",
    `Bestellung: ${r.code}`,
    `Zeit: ${r.slot}`,
    `Adresse: ${r.address}`,
    "",
    ...lines,
    "",
    `Zwischensumme: ${money(r.subtotal)}`,
    `Gutschein: ${r.discount ? `−${money(r.discount)}` : money(0)}`,
    `Trinkgeld: ${money(r.tip)}`,
    `Lieferung: ${r.fee ? money(r.fee) : "0,00 €"}`,
    `Gesamt: ${money(r.total)}`,
  ].join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- Toast (debounced per-message) ---------- */
let lastToast = "";
let lastToastAt = 0;
function showToast(msg) {
  const now = Date.now();
  if (msg === lastToast && now - lastToastAt < 1200) return;
  lastToast = msg; lastToastAt = now;
  els.toast.textContent = msg;
  els.toast.classList.add("is-visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 1800);
}

/* ---------- Cart drawer (mobile) ---------- */
function isMobileCart() { return window.matchMedia("(max-width: 1200px)").matches; }
function openCart() {
  if (!isMobileCart()) {
    els.cartPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  els.cartPanel.classList.add("is-open");
  els.backdrop.classList.add("is-on");
  els.backdrop.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeCart() {
  els.cartPanel.classList.remove("is-open");
  els.backdrop.classList.remove("is-on");
  document.body.style.overflow = "";
  setTimeout(() => { if (!els.cartPanel.classList.contains("is-open")) els.backdrop.hidden = true; }, 220);
}

/* ---------- Category / filter setters ---------- */
function setCategory(cat) {
  state.category = cat;
  // Smart reset: switching category should clear the query so user isn't stuck on "0 Treffer"
  if (state.query) {
    state.query = "";
    els.search.value = "";
    els.searchClear.hidden = true;
  }
  $$(".cat").forEach(b => b.classList.toggle("is-active", b.dataset.category === cat));
  renderProducts();
  // Scroll into view on mobile when navigated via dock or hero CTA
  const shopEl = $("#shop");
  if (shopEl && window.innerWidth <= 820) shopEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setFilter(tag) {
  state.tag = tag;
  $$("[data-filter]").forEach(b => b.classList.toggle("is-active", b.dataset.filter === tag));
  renderProducts();
}

/* ---------- Promo ---------- */
function applyPromo() {
  const code = els.promo.value.trim().toUpperCase();
  if (!code) { state.promo = ""; localStorage.removeItem("herdem.promo"); renderCart(); return; }
  const T = totals();
  if (code === "HERDEM10" || (code === "FRISCH5" && T.subtotal >= 25)) {
    state.promo = code;
    localStorage.setItem("herdem.promo", code);
    renderCart();
    showToast(t("toastPromo"));
  } else if (code === "FRISCH5") {
    els.promoMsg.textContent = t("promoMin");
    els.promoMsg.classList.add("is-error");
    els.promoMsg.classList.remove("is-active");
  } else {
    els.promoMsg.textContent = t("promoNotFound");
    els.promoMsg.classList.add("is-error");
    els.promoMsg.classList.remove("is-active");
  }
}

/* ---------- Address ---------- */
function applyAddress(street, city) {
  const label = [street, city].filter(Boolean).join(", ") || t("addressEmpty");
  els.addressLabel.textContent = label;
  state.address = { street, city };
  lsSet("herdem.address", state.address);
  const accAddr = $("#accountAddress"); if (accAddr) accAddr.textContent = label;
}

/* ---------- ZIP check ---------- */
function checkZip() {
  const v = els.zipInput.value.trim();
  if (!/^\d{5}$/.test(v)) {
    els.zipResult.textContent = t("zipEmpty");
    els.zipResult.classList.add("error");
    return;
  }
  const list = cmsSettings.zipList || [];
  if (list.includes(v)) {
    els.zipResult.textContent = t("zipActive", v);
    els.zipResult.classList.remove("error");
  } else {
    els.zipResult.textContent = t("zipInactive", v);
    els.zipResult.classList.add("error");
  }
}

/* ---------- Event delegation ---------- */
document.addEventListener("click", (ev) => {
  const t1 = ev.target.closest("[data-increase]");
  if (t1) {
    // Fly-to-cart only on initial-add gestures from product cards (not mini-stepper in cart)
    if (t1.closest(".card") || t1.closest(".upsell-item") || t1.closest(".recent-card")) {
      flyToCart(t1);
    }
    changeQty(t1.dataset.increase, 1);
    showToast(t("toastAdded"));
    if (t1.dataset.closeAfter === "1") els.productDialog.close();
    return;
  }
  const t2 = ev.target.closest("[data-decrease]");
  if (t2) { changeQty(t2.dataset.decrease, -1); return; }

  const cj = ev.target.closest("[data-category-jump]");
  if (cj) { setCategory(cj.dataset.categoryJump); return; }

  const qq = ev.target.closest("[data-query]");
  if (qq) {
    state.query = qq.dataset.query;
    els.search.value = state.query;
    els.searchClear.hidden = !state.query;
    renderProducts();
    $("#shop")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const bn = ev.target.closest("[data-bundle]");
  if (bn) { addBundle(bn.dataset.bundle); return; }

  const dt = ev.target.closest("[data-detail]");
  if (dt) { openProduct(dt.dataset.detail); return; }

  const fav = ev.target.closest("[data-favorite]");
  if (fav) { toggleFavorite(fav.dataset.favorite); return; }

  const fl = ev.target.closest("[data-filter]");
  if (fl) { setFilter(fl.dataset.filter); return; }

  const jump = ev.target.closest("[data-jump]");
  if (jump) {
    const el = document.getElementById(jump.dataset.jump);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const dock = ev.target.closest("[data-dock]");
  if (dock) {
    ev.preventDefault();
    const a = dock.dataset.dock;
    if (a === "top") window.scrollTo({ top: 0, behavior: "smooth" });
    if (a === "search") { els.search.focus(); els.search.scrollIntoView({ block: "center" }); }
    if (a === "cart") openCart();
    if (a === "account") els.accountDialog.showModal();
    if (a === "favorites") {
      state.category = "favorites";
      renderProducts();
      $$('[data-category]').forEach(b => b.classList.toggle("is-selected", b.dataset.category === "favorites"));
      const grid = document.querySelector(".product-grid, .shop-grid, .shop");
      if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setActiveDock(a);
    return;
  }

  const act = ev.target.closest("[data-action]");
  if (act) {
    ev.preventDefault();
    if (act.dataset.action === "openAccount") els.accountDialog.showModal();
    if (act.dataset.action === "openSupport") els.supportDialog.showModal();
    return;
  }

  const sup = ev.target.closest("[data-support]");
  if (sup) {
    const reply = {
      delivery: t("supAnswerDelivery"),
      payment: t("supAnswerPayment"),
      fresh: t("supAnswerFresh"),
      refund: t("supAnswerRefund"),
    }[sup.dataset.support];
    $("#supportMessages").insertAdjacentHTML("beforeend", `<div class="bubble is-answer">${reply}</div>`);
    $("#supportMessages").scrollTop = $("#supportMessages").scrollHeight;
    return;
  }

  const pay = ev.target.closest("[data-pay]");
  if (pay) {
    state.pay = pay.dataset.pay;
    localStorage.setItem("herdem.pay", state.pay);
    $$("[data-pay]").forEach(b => b.classList.toggle("is-selected", b === pay));
    updatePayHint();
    return;
  }

  const cpy = ev.target.closest("[data-copy]");
  if (cpy) {
    const target = document.getElementById(cpy.dataset.copy);
    if (!target) return;
    const txt = target.textContent.trim();
    if (!txt || txt === "—") return;
    (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => {
      const orig = cpy.textContent;
      cpy.textContent = t("trCopied");
      cpy.classList.add("is-copied");
      setTimeout(() => { cpy.textContent = orig; cpy.classList.remove("is-copied"); }, 1400);
    }).catch(() => {
      // Fallback: select the text so user can manually copy
      const r = document.createRange(); r.selectNodeContents(target);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      showToast(t("trCopy"));
    });
    return;
  }

  const addr = ev.target.closest("[data-address]");
  if (addr) {
    const presets = {
      Frankfurt: ["Kaiserstraße 12", "60311 Frankfurt"],
      Offenbach: ["Berliner Straße 80", "63065 Offenbach"],
      Abholung: ["Beispielstraße 1", "60311 Frankfurt (Abholung)"]
    };
    const [s, c] = presets[addr.dataset.address] || [];
    $("#streetInput").value = s; $("#cityInput").value = c;
    if (addr.dataset.address === "Abholung") {
      state.service = "pickup";
      $$(".service-tab").forEach(tab => tab.classList.toggle("is-active", tab.dataset.service === "pickup"));
      $$(".service-tab").forEach(tab => tab.setAttribute("aria-selected", tab.dataset.service === "pickup"));
    }
    return;
  }
});

/* Service-tab clicks */
$$(".service-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    state.service = tab.dataset.service;
    $$(".service-tab").forEach(other => {
      other.classList.toggle("is-active", other === tab);
      other.setAttribute("aria-selected", other === tab ? "true" : "false");
    });
    const heading = $("#cartHeading");
    const key = state.service === "pickup" ? "servicePickup"
              : state.service === "shipping" ? "serviceShipping" : "cart";
    heading.dataset.i18n = key;
    heading.textContent = t(key);
    renderCart();
  });
});

/* Category buttons */
$$(".cat").forEach(b => b.addEventListener("click", () => setCategory(b.dataset.category)));

/* Search */
let searchDebounce;
els.search.addEventListener("input", (e) => {
  state.query = e.target.value;
  els.searchClear.hidden = !state.query;
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(renderProducts, 80);
});
els.searchClear.addEventListener("click", () => {
  state.query = ""; els.search.value = ""; els.searchClear.hidden = true; renderProducts();
});

/* Sort */
els.sort.addEventListener("change", (e) => { state.sort = e.target.value; renderProducts(); });

/* Cart open/close */
$("#openCart").addEventListener("click", openCart);
$("#closeCart").addEventListener("click", closeCart);
els.backdrop.addEventListener("click", closeCart);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.cartPanel.classList.contains("is-open")) closeCart();
});

/* Clear cart */
$("#clearCart").addEventListener("click", () => {
  state.cart = {}; state.promo = ""; state.tip = 0;
  lsSet("herdem.cart", state.cart);
  localStorage.removeItem("herdem.promo");
  localStorage.setItem("herdem.tip", "0");
  renderProducts(); renderCart();
  showToast(t("toastCleared"));
});

/* Tip */
$$("[data-tip]").forEach(b => b.addEventListener("click", () => {
  state.tip = Number(b.dataset.tip);
  localStorage.setItem("herdem.tip", String(state.tip));
  renderCart();
}));

/* Promo */
$("#applyPromo").addEventListener("click", applyPromo);
els.promo.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } });

/* Cart pref toggles trigger re-render of fees in checkout (no totals change directly) */
$("#substituteToggle").addEventListener("change", renderCart);
$("#contactlessToggle").addEventListener("change", renderCart);

/* Slot persistence */
els.slot.addEventListener("change", () => {
  state.slot = els.slot.value;
  localStorage.setItem("herdem.slot", state.slot);
});

/* Address dialog */
$("#addressButton").addEventListener("click", () => els.addressDialog.showModal());
$("#saveAddress").addEventListener("click", (e) => {
  const street = $("#streetInput").value.trim();
  const city = $("#cityInput").value.trim();
  if (!street && !city) return;
  applyAddress(street, city);
  showToast(t("addrSaved"));
});

/* ZIP check */
$("#checkZip").addEventListener("click", checkZip);
els.zipInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); checkZip(); } });

/* Checkout button */
els.checkout.addEventListener("click", () => {
  if (!state.storeOpen) { showToast(t("storeClosedAlert")); return; }
  renderCheckoutSummary();
  els.checkoutDialog.showModal();
});

/* ---------- Payment helpers ---------- */
function updatePayHint() {
  const hintEl = document.getElementById("payHint");
  if (!hintEl) return;
  const key = "payHint" + state.pay.charAt(0).toUpperCase() + state.pay.slice(1);
  const text = t(key);
  hintEl.textContent = text || t("payHintCash");
}

function syncPaySelection() {
  $$("[data-pay]").forEach(b => b.classList.toggle("is-selected", b.dataset.pay === state.pay));
  updatePayHint();
}

function buildWhatsAppOrderText(receipt) {
  const header = t("waOrderHeader", receipt.code);
  const lines = receipt.entries.map(e => `• ${e.qty}× ${e.name[state.lang] || e.name.de} — ${money(e.price * e.qty)}`);
  const total = `\n${state.lang === "tr" ? "Toplam" : "Gesamt"}: ${money(receipt.total)}`;
  const footer = t("waOrderFooter", receipt.slot, receipt.address);
  return [header, "", ...lines, total, footer].join("\n");
}

function buildWhatsAppUrl(receipt) {
  const num = (cmsSettings.whatsappNumber || "").replace(/[^\d]/g, "");
  if (!num) return null;
  const text = encodeURIComponent(buildWhatsAppOrderText(receipt));
  return `https://wa.me/${num}?text=${text}`;
}

function buildPaypalUrl(receipt) {
  const handle = (cmsSettings.paypalHandle || "").trim().replace(/^@/, "");
  if (!handle) return null;
  const amount = receipt.total.toFixed(2);
  return `https://www.paypal.me/${encodeURIComponent(handle)}/${amount}EUR`;
}

function openTransferDialog(receipt) {
  const holder = cmsSettings.accountHolder || cmsSettings.storeName || "";
  const iban = cmsSettings.iban || "";
  const bic = cmsSettings.bic || "";
  if (!iban || !holder) return false;
  document.getElementById("trHolder").textContent = holder;
  document.getElementById("trIban").textContent = iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
  document.getElementById("trBic").textContent = bic || "—";
  document.getElementById("trAmount").textContent = money(receipt.total);
  document.getElementById("trRef").textContent = receipt.code;
  document.getElementById("transferDialog").showModal();
  return true;
}

/* Place order */
$("#placeOrder").addEventListener("click", () => {
  const form = $("#checkoutForm");
  if (!form.reportValidity()) return;
  const T = totals();
  if (T.entries.length === 0) return;
  const code = "HDM-" + String(Math.floor(1000 + Math.random() * 9000));
  const receipt = {
    code,
    entries: T.entries.map(({ id, name, price, qty }) => ({ id, name, price, qty })),
    subtotal: T.subtotal, discount: T.discount, fee: T.fee, tip: T.tip, total: T.total,
    slot: els.slot.selectedOptions[0]?.textContent || "",
    address: els.addressLabel.textContent,
    payment: state.pay,
  };

  // Validate prerequisites per payment method
  if (state.pay === "whatsapp" && !cmsSettings.whatsappNumber) {
    showToast(t("waNotConfigured"));
    return;
  }
  if (state.pay === "paypal" && !cmsSettings.paypalHandle) {
    showToast(t("paypalNotConfigured"));
    return;
  }
  if (state.pay === "transfer" && (!cmsSettings.iban || !cmsSettings.accountHolder)) {
    showToast(t("transferNotConfigured"));
    return;
  }

  state.lastReceipt = receipt;
  $("#orderCode").textContent = code;
  pushOrderToCms(receipt);

  // Branch by payment method
  if (state.pay === "whatsapp") {
    const url = buildWhatsAppUrl(receipt);
    els.checkoutDialog.close();
    if (url) window.open(url, "_blank", "noopener");
    els.successDialog.showModal();
    setActiveDelivery(code);
    fireConfetti();
    return;
  }

  if (state.pay === "paypal") {
    const url = buildPaypalUrl(receipt);
    els.checkoutDialog.close();
    if (url) window.open(url, "_blank", "noopener");
    els.successDialog.showModal();
    setActiveDelivery(code);
    fireConfetti();
    return;
  }

  if (state.pay === "transfer") {
    els.checkoutDialog.close();
    if (!openTransferDialog(receipt)) {
      // Fallback if accidentally cleared between validate and open
      els.successDialog.showModal();
    }
    // Confetti + tracker fire only AFTER user confirms transfer (handled by trDone listener below)
    return;
  }

  // Default: cash on delivery
  els.checkoutDialog.close();
  els.successDialog.showModal();
  setActiveDelivery(code);
  fireConfetti();
});

/* After user confirms transfer, show success + tracker */
document.addEventListener("close", (ev) => {
  if (ev.target?.id === "transferDialog" && state.lastReceipt && state.pay === "transfer") {
    // returnValue is "ok" only when "Überweisung erledigt" submitted
    if (ev.target.returnValue === "ok") {
      els.successDialog.showModal();
      setActiveDelivery(state.lastReceipt.code);
      fireConfetti();
    }
  }
}, true);

/* Download receipt */
$("#downloadReceipt").addEventListener("click", () => {
  if (!state.lastReceipt) return;
  downloadText(`herdem-${state.lastReceipt.code}.txt`, receiptText(state.lastReceipt));
});

/* Finish order */
$("#finishOrder").addEventListener("click", () => {
  state.cart = {}; state.promo = ""; state.tip = 0;
  lsSet("herdem.cart", state.cart);
  localStorage.removeItem("herdem.promo");
  localStorage.setItem("herdem.tip", "0");
  state.lastReceipt = null;
  renderProducts(); renderCart();
});

/* Reorder last */
$("#reorderLast").addEventListener("click", () => {
  [...bundles.grillTable, ...bundles.sweetTable].forEach(pid => {
    state.cart[pid] = (state.cart[pid] || 0) + 1;
  });
  renderProducts(); renderCart();
  if (window.innerWidth <= 1200) openCart();
  showToast(t("reorderDone"));
});

/* Open account / support */
$("#openAccount").addEventListener("click", () => {
  const accAddr = $("#accountAddress");
  if (accAddr) accAddr.textContent = els.addressLabel.textContent !== t("addressEmpty")
    ? els.addressLabel.textContent : t("noAddress");
  els.accountDialog.showModal();
});

/* Language toggle */
els.langToggle.addEventListener("click", () => {
  state.lang = state.lang === "de" ? "tr" : "de";
  localStorage.setItem("herdem.lang", state.lang);
  applyI18n();
  buildSlots();
  renderBundlesGrid();
  renderCuratedStrips();
  renderProducts();
  renderCart();
  showToast(t("toastLang"));
});

/* ---------- PWA Install ---------- */
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  state.installPrompt = e;
  els.installBtn.disabled = false;
});
els.installBtn.addEventListener("click", async () => {
  if (!state.installPrompt) {
    showToast(t("installReady"));
    return;
  }
  state.installPrompt.prompt();
  const choice = await state.installPrompt.userChoice;
  showToast(choice.outcome === "accepted" ? t("installSuccess") : t("installDismiss"));
  state.installPrompt = null;
});
window.addEventListener("appinstalled", () => { showToast(t("installSuccess")); });
// Hide install when running as installed PWA
if (window.matchMedia("(display-mode: standalone)").matches) {
  document.getElementById("installSection").style.display = "none";
}

/* ---------- Online / offline notifications ---------- */
window.addEventListener("offline", () => showToast(t("toastOffline")));
window.addEventListener("online", () => showToast(t("toastOnline")));

/* ---------- Service worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => { /* no-op */ });
  });
}

/* ---------- Bundles render ---------- */
const DEFAULT_BUNDLE_ORDER = ["grillTable", "mezzeTable", "sweetTable", "breakfast"];
function renderBundlesGrid() {
  const grid = document.querySelector(".bundles-grid");
  if (!grid) return;
  const metaEntries = Object.values(bundleMeta);
  const keys = metaEntries.length
    ? metaEntries.map(m => m.key)
    : DEFAULT_BUNDLE_ORDER;
  grid.innerHTML = keys.map(k => {
    const m = bundleMeta[k];
    let eyebrow, title, desc;
    if (m) {
      eyebrow = m.eyebrow || "Paket";
      title = (state.lang === "tr" && m.titleTr) || m.titleDe || k;
      desc = (state.lang === "tr" && m.descTr) || m.descDe || "";
    } else {
      // i18n fallback
      const fallback = {
        grillTable: ["Grill", "bundleGrillTitle", "bundleGrillText"],
        mezzeTable: ["Mezze", "bundleMezzeTitle", "bundleMezzeText"],
        sweetTable: ["Teezeit", "bundleTeaTitle", "bundleTeaText"],
        breakfast:  ["Kahvaltı", "bundleBreakfastTitle", "bundleBreakfastText"],
      }[k] || ["Paket", "", ""];
      eyebrow = fallback[0];
      title = t(fallback[1]) || k;
      desc = t(fallback[2]) || "";
    }
    return `
      <article data-bundle="${k}">
        <span class="badge-soft">${eyebrow}</span>
        <h3>${title}</h3>
        <p>${desc}</p>
        <button class="btn-add" type="button" data-bundle="${k}">${t("bundleAdd")}</button>
      </article>
    `;
  }).join("");
}

/* ---------- Push order to CMS ---------- */
function pushOrderToCms(receipt) {
  try {
    const raw = localStorage.getItem("herdem.cms.orders");
    const arr = raw ? JSON.parse(raw) : [];
    arr.unshift({
      code: receipt.code,
      at: Date.now(),
      status: "new",
      entries: receipt.entries.map(e => ({ id: e.id, qty: e.qty, price: e.price, name: e.name })),
      subtotal: receipt.subtotal,
      discount: receipt.discount,
      tip: receipt.tip,
      fee: receipt.fee,
      total: receipt.total,
      slot: receipt.slot,
      address: receipt.address,
      note: $("#orderNote")?.value?.trim() || "",
    });
    localStorage.setItem("herdem.cms.orders", JSON.stringify(arr.slice(0, 200)));
  } catch (_) { /* quota */ }
}

/* =====================================================================
   DESIGN ENHANCEMENTS · Sticky bar, fly-to-cart, ticker, tracker, confetti
   ===================================================================== */

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Sticky cart bar (mobile) ---------- */
function updateStickyBar() {
  if (!els.stickyBar) return;
  const T = totals();
  if (T.itemCount === 0 || !state.storeOpen) {
    els.stickyBar.classList.remove("is-on");
    return;
  }
  els.stickyBar.hidden = false;
  els.scbCount.textContent = t("items", T.itemCount);
  els.scbTotal.textContent = money(T.total);
  const hero = document.querySelector(".hero");
  const past = hero ? window.scrollY > hero.offsetTop + hero.offsetHeight - 100 : true;
  els.stickyBar.classList.toggle("is-on", past);
}
els.scbGo?.addEventListener("click", () => {
  if (!state.storeOpen) { showToast(t("storeClosedAlert")); return; }
  renderCheckoutSummary();
  els.checkoutDialog.showModal();
});
let scrollRaf = 0;
window.addEventListener("scroll", () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; updateStickyBar(); });
}, { passive: true });

/* ---------- Fly-to-cart animation ---------- */
function flyToCart(triggerEl) {
  if (reducedMotion()) return;
  const card = triggerEl.closest(".card") || triggerEl.closest(".upsell-item") || triggerEl.closest(".recent-card");
  if (!card) return;
  const srcImg = card.querySelector("img");
  if (!srcImg || !srcImg.complete) return;
  const cartIcon = $("#openCart");
  if (!cartIcon) return;

  const srcRect = srcImg.getBoundingClientRect();
  const dstRect = cartIcon.getBoundingClientRect();
  if (!srcRect.width || !dstRect.width) return;

  const clone = document.createElement("img");
  clone.src = srcImg.src;
  clone.alt = "";
  clone.className = "fly-clone";
  Object.assign(clone.style, {
    left: srcRect.left + "px",
    top: srcRect.top + "px",
    width: srcRect.width + "px",
    height: srcRect.height + "px",
  });
  document.body.appendChild(clone);

  requestAnimationFrame(() => {
    const tx = dstRect.left + dstRect.width/2 - srcRect.left - srcRect.width/2;
    const ty = dstRect.top + dstRect.height/2 - srcRect.top - srcRect.height/2;
    clone.style.transform = `translate(${tx}px, ${ty}px) scale(0.18)`;
    clone.style.opacity = "0.4";
  });

  setTimeout(() => {
    clone.remove();
    cartIcon.classList.add("is-bumped");
    setTimeout(() => cartIcon.classList.remove("is-bumped"), 420);
  }, 620);
}

/* ---------- Activity ticker ---------- */
const TICKER_NAMES = ["Aylin", "Mehmet", "Yusuf", "Zeynep", "Emre", "Selin", "Burak", "Ayşe", "Cem", "Defne", "Ali", "Ece", "Berk", "Deniz", "Furkan", "Leyla"];
const TICKER_PRODUCTS = {
  de: ["Sucuk", "Baklava", "Ayran", "Tomatenmark", "Fladenbrot", "Olivenöl", "Granatapfel", "Çay", "Joghurt", "Lahmacun", "Feta", "Oliven"],
  tr: ["Sucuk", "Baklava", "Ayran", "Salça", "Pide", "Zeytinyağı", "Nar", "Çay", "Yoğurt", "Lahmacun", "Beyaz peynir", "Zeytin"],
};
let tickerIdx = Math.floor(Math.random() * TICKER_NAMES.length);
let tickerTimer = 0;
function tickActivity() {
  if (!els.activityMsg) return;
  const name = TICKER_NAMES[tickerIdx % TICKER_NAMES.length];
  const products = TICKER_PRODUCTS[state.lang] || TICKER_PRODUCTS.de;
  const product = products[(tickerIdx * 5) % products.length];
  const qty = 1 + (tickerIdx % 4);
  const ago = 1 + ((tickerIdx * 7) % 11);
  tickerIdx++;
  // Mix of verbs: 70% bought, 20% delivered, 10% rated
  const r = tickerIdx % 10;
  let msg;
  if (r < 7) msg = t("actBought", name, qty, product, ago);
  else if (r < 9) msg = t("actDelivered", name, ago);
  else msg = t("actRated", name, product, ago);
  els.activityMsg.classList.add("fade");
  setTimeout(() => {
    els.activityMsg.textContent = msg;
    els.activityMsg.classList.remove("fade");
  }, 280);
}

/* ---------- Active delivery tracker ---------- */
const DELIVERY_KEY = "herdem.activeDelivery";

function readActiveDelivery() {
  try {
    const d = JSON.parse(localStorage.getItem(DELIVERY_KEY) || "null");
    if (!d || d.dismissed) return null;
    const elapsedMin = Math.floor((Date.now() - d.placedAt) / 60000);
    if (elapsedMin > d.arrivalMinutes + 45) {
      localStorage.removeItem(DELIVERY_KEY);
      return null;
    }
    return { ...d, elapsedMin };
  } catch { return null; }
}

function setActiveDelivery(code) {
  const d = { code, placedAt: Date.now(), arrivalMinutes: 18 + Math.floor(Math.random() * 8), dismissed: false };
  localStorage.setItem(DELIVERY_KEY, JSON.stringify(d));
  renderDeliveryTracker();
}

function renderDeliveryTracker() {
  if (!els.deliveryTracker) return;
  const d = readActiveDelivery();
  if (!d) {
    els.deliveryTracker.classList.remove("is-on");
    setTimeout(() => { if (els.deliveryTracker) els.deliveryTracker.hidden = true; }, 280);
    return;
  }
  els.deliveryTracker.hidden = false;
  const remaining = Math.max(0, d.arrivalMinutes - d.elapsedMin);
  if (remaining > 0) {
    els.dtTitle.textContent = d.code + " · " + (state.lang === "tr" ? "yolda" : "unterwegs");
    els.dtSub.innerHTML = state.lang === "tr"
      ? `<em>${remaining}</em> dk sonra varır`
      : `Ankunft in <em>${remaining}</em> min`;
  } else if (d.elapsedMin <= d.arrivalMinutes + 5) {
    els.dtTitle.textContent = d.code + " · " + t("deliveryArrivedSoon");
    els.dtSub.textContent = state.lang === "tr" ? "Hazır olun" : "Bitte bereit halten";
  } else {
    els.dtTitle.textContent = d.code + " · " + t("deliveryArrived");
    els.dtSub.textContent = state.lang === "tr" ? "Afiyet olsun" : "Afiyet olsun";
  }
  requestAnimationFrame(() => els.deliveryTracker.classList.add("is-on"));
}

els.dtClose?.addEventListener("click", () => {
  const raw = localStorage.getItem(DELIVERY_KEY);
  if (raw) {
    try {
      const d = JSON.parse(raw);
      d.dismissed = true;
      localStorage.setItem(DELIVERY_KEY, JSON.stringify(d));
    } catch { /* ignore */ }
  }
  els.deliveryTracker.classList.remove("is-on");
  setTimeout(() => els.deliveryTracker.hidden = true, 280);
});

els.dtTrack?.addEventListener("click", () => {
  els.successDialog.showModal();
});

/* ---------- Confetti ---------- */
function fireConfetti() {
  if (reducedMotion()) return;
  const colors = ["#12784e", "#f0b429", "#c33d2e", "#2a6da3", "#fff", "#0a5335"];
  for (let i = 0; i < 50; i++) {
    const c = document.createElement("span");
    c.className = "confetti";
    c.style.left = (Math.random() * 100) + "vw";
    c.style.backgroundColor = colors[i % colors.length];
    c.style.animationDelay = (Math.random() * 250) + "ms";
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    c.style.width = (5 + Math.random() * 6) + "px";
    c.style.height = (10 + Math.random() * 8) + "px";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 3000);
  }
}

/* ---------- Init ---------- */
function init() {
  // Address restore
  if (state.address) {
    const s = state.address.street || ""; const c = state.address.city || "";
    if (s || c) {
      els.addressLabel.textContent = [s, c].filter(Boolean).join(", ");
      const accAddr = $("#accountAddress"); if (accAddr) accAddr.textContent = els.addressLabel.textContent;
    }
  }
  applyCmsCopyToI18n();
  buildSlots();
  applyI18n();
  renderStoreStatus();
  renderBundlesGrid();
  renderCuratedStrips();
  renderProducts();
  renderCart();
  updateFavoriteBadges();
  // Design enhancements
  tickActivity();
  tickerTimer = setInterval(tickActivity, 5500);
  renderDeliveryTracker();
  setInterval(renderDeliveryTracker, 60_000);
  updateStickyBar();
  syncPaySelection();
  // sync language URL param if explicit
  if (params.get("lang") && params.get("lang") !== state.lang) {
    history.replaceState(null, "", location.pathname + location.hash);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
