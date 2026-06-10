// Supabase-Zugangsdaten (öffentlich, nur Anon-Key – Sicherheit kommt von RLS).
// Nach dem Anlegen des Supabase-Projekts hier eintragen.
export const SUPABASE_URL = 'https://DEIN-PROJEKT.supabase.co';
export const SUPABASE_ANON_KEY = 'DEIN-ANON-KEY';

// Single-User-Modus: Wenn true, meldet sich die App automatisch mit einem
// festen Konto an – kein Anmeldebildschirm. Ideal, wenn nur du die App nutzt.
// Auf false setzen, falls du die App mehreren Nutzern geben willst.
export const SINGLE_USER = true;

// Festes Konto für den Single-User-Modus. E-Mail kann frei erfunden sein
// (muss keine echte sein, wenn die E-Mail-Bestätigung in Supabase aus ist).
// Passwort: mind. 6 Zeichen, einmalig setzen – wird hier hinterlegt, damit
// die Anmeldung automatisch läuft und deine Daten auf jedem Gerät gleich sind.
export const AUTO_LOGIN = {
  email: 'ich@fitcoach.app',
  password: 'fitcoach-geheim-2024',
};
