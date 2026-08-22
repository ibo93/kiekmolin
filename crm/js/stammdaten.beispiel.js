/* ============================================================
   Kurani CRM – persoenliche Daten (Vorlage)

   Kopiere diese Datei nach js/stammdaten.js und trag deine
   eigenen Daten ein. Die echte Datei steht in .gitignore und
   verlaesst diesen Rechner nicht.

   Ohne sie startet die App trotzdem – dann eben leer.
   ============================================================ */

const FIRMENDATEN = {
  firma:        '',
  inhaber:      '',
  strasse:      '',
  plz:          '',
  ort:          '',
  telefon:      '',
  email:        '',
  steuernummer: '',
  iban:         '',
  bic:          '',
  bank:         '',
  glaeubigerId: '',
  // Adresse des eigenen Supabase-Projekts fuer den Handy-Sync.
  // Der Schluessel gehoert NICHT hierher – den traegt jedes Geraet selbst ein.
  syncUrl:      '',
  // Zugang zu Kiek mol in, falls du die Akquiseliste nutzt
  kmiUrl:       '',
  kmiKey:       ''
};

const STAMMKUNDEN = [
  // { nr: 1001, firma: 'Beispiel GmbH', ansprechpartner: 'Vorname Name',
  //   strasse: '', plz: '', ort: '', telefon: '', email: '' }
];
