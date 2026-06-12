// Sichtbare App-Version (eine Quelle – wird beim Start in die UI geschrieben).
export const APP_VERSION = '17';

// Supabase-Zugangsdaten (öffentlich, nur Anon-Key – Sicherheit kommt von RLS).
export const SUPABASE_URL = 'https://xhqucheyqhxaaaoqoohm.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhocXVjaGV5cWh4YWFhb3Fvb2htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwODA2NDgsImV4cCI6MjA5NjY1NjY0OH0.wIMCHp8Iq4KPPqClJFLJMKh_4NCxIyUaDcMs11Rmf1E';

// Kein Login: Die App meldet sich automatisch anonym an (siehe app.js).
// Dafür muss in Supabase einmalig „Anonymous sign-ins" aktiviert sein:
// Authentication → Sign In / Providers → Anonymous sign-ins → einschalten.
