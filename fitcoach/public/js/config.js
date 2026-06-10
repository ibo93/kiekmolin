// Supabase-Zugangsdaten (öffentlich, nur Anon-Key – Sicherheit kommt von RLS).
// Nach dem Anlegen des Supabase-Projekts hier eintragen.
export const SUPABASE_URL = 'https://xhqucheyqhxaaaoqoohm.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhocXVjaGV5cWh4YWFhb3Fvb2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODA2NDgsImV4cCI6MjA5NjY1NjY0OH0.wIMCHp8Iq4KPPqClJFLJMKh_4NCxIyUaDcMs11Rmf1E';

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
