// Prueft das SQL, das orders, order_items, reservations und customers
// zumacht. Das ist der Schritt, um den es die ganze Zeit ging: in diesen
// vier Tabellen stehen Name, Telefon, E-Mail, Lieferadresse und
// Bestellhistorie jedes Gastes -- und sie waren fuer jeden lesbar, der
// den oeffentlichen Schluessel aus dem Seitenquelltext kennt.
//
// Ausfuehren laesst sich das hier nicht, es gibt keine Datenbank. Was
// sich pruefen laesst, ist die Bauart. Und die hat eine Falle: Policies
// sind ein ODER. Bleibt eine einzige offene Regel stehen, war die ganze
// Arbeit umsonst -- deshalb wird zuerst alles weggeraeumt.

var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var datei = path.join(__dirname, '..', 'datenbank', '04-gaestedaten-zumachen.sql');
var sql = fs.readFileSync(datei, 'utf8');
// Ohne Kommentare pruefen: sonst zaehlt eine Erklaerung als Regel.
var code = sql.split('\n').filter(function (z) { return !/^\s*--/.test(z); }).join('\n');

var TABELLEN = ['orders', 'order_items', 'reservations', 'customers'];

console.log('\n-- 1. RLS ist ueberhaupt an --');
TABELLEN.forEach(function (tab) {
    t(tab + ': row level security wird eingeschaltet',
      new RegExp('alter table public\\.' + tab + ' enable row level security').test(code), tab);
});

console.log('\n-- 2. Alte Regeln werden restlos weggeraeumt --');
// Der entscheidende Punkt. Eine gezielte Loeschung nach Namen haette
// jede Regel stehen lassen, die heute anders heisst als erwartet.
TABELLEN.forEach(function (tab) {
    var muster = new RegExp("for r in select policyname from pg_policies[\\s\\S]{0,200}?tablename = '" + tab + "'[\\s\\S]{0,200}?drop policy %I on public\\." + tab);
    t(tab + ': ALLE bestehenden Regeln werden geloescht, nicht nur bekannte',
      muster.test(code), tab);
});

console.log('\n-- 3. Lesen ist zu --');
// Keine SELECT-Regel darf anon enthalten. Genau das war das Loch.
var bloecke = code.split(/create policy/).slice(1);
// Vier Tabellen, je eine Regel fuer select/insert/update/delete.
t('es gibt 16 Regeln -- vier pro Tabelle', bloecke.length === 16, bloecke.length);

var leseRegeln = bloecke.filter(function (b) { return /\bfor select\b/.test(b); });
t('jede Tabelle hat eine Leseregel', leseRegeln.length === 4, leseRegeln.length);
leseRegeln.forEach(function (b) {
    var name = (b.match(/"([^"]+)"/) || [])[1] || '?';
    t('Leseregel "' + name + '" gilt NICHT fuer anon',
      /to authenticated\b/.test(b) && /\banon\b/.test(b) === false, b.slice(0, 120));
    t('Leseregel "' + name + '" hat eine Bedingung',
      /using \(/.test(b) && /using \(\s*true\s*\)/.test(b) === false, b.slice(0, 200));
});

console.log('\n-- 4. Bestellen und reservieren geht weiter --');
// Ohne diese drei Regeln kann kein Gast mehr bestellen. Das waere kein
// Datenschutz, das waere ein kaputter Laden.
[['orders', 'bestellen'], ['order_items', 'Positionen anlegen'], ['reservations', 'reservieren']]
.forEach(function (p) {
    var b = bloecke.filter(function (x) {
        return new RegExp('on public\\.' + p[0] + ' for insert').test(x);
    })[0];
    t(p[0] + ': es gibt eine Anlege-Regel', !!b, p[0]);
    if (b) {
        t(p[0] + ': Gaeste duerfen ' + p[1] + ' (anon ist dabei)',
          /to anon, authenticated/.test(b), b.slice(0, 150));
        // Nicht voellig blank: eine Bestellung ohne Haus kocht niemand.
        t(p[0] + ': die Anlege-Regel ist nicht bedingungslos',
          /with check \(\s*true\s*\)/.test(b) === false, b.slice(0, 200));
    }
});

// customers wird bewusst NICHT fuer anon geoeffnet: die Registrierung
// verlangt vorher einen Google-Login.
var cIns = bloecke.filter(function (x) { return /on public\.customers for insert/.test(x); })[0];
t('customers: Anlegen nur angemeldet, nicht fuer anon',
  !!cIns && /to authenticated/.test(cIns) && /\banon\b/.test(cIns) === false, cIns);

console.log('\n-- 5. Aendern und Loeschen sind zu --');
var aendern = bloecke.filter(function (b) { return /\bfor update\b/.test(b); });
t('jede Tabelle hat eine Aenderungsregel', aendern.length === 4, aendern.length);
aendern.forEach(function (b) {
    var name = (b.match(/"([^"]+)"/) || [])[1] || '?';
    t('"' + name + '" gilt nicht fuer anon', /\banon\b/.test(b) === false, b.slice(0, 120));
    // Beides noetig: "using" sagt, welche Zeilen man anfassen darf,
    // "with check", wie sie danach aussehen duerfen. Fehlt das zweite,
    // koennte ein Wirt eine Bestellung einem anderen Haus unterschieben.
    t('"' + name + '" hat using UND with check',
      /using \(/.test(b) && /with check \(/.test(b), b.slice(0, 300));
});

var loeschen = bloecke.filter(function (b) { return /\bfor delete\b/.test(b); });
t('jede Tabelle hat eine Loeschregel', loeschen.length === 4, loeschen.length);
loeschen.forEach(function (b) {
    var name = (b.match(/"([^"]+)"/) || [])[1] || '?';
    t('"' + name + '": nur der Superadmin',
      /using \(public\.kmi_ist_superadmin\(\)\)/.test(b), b.slice(0, 200));
});

console.log('\n-- 6. Der neue Helfer ist sauber gebaut --');
var helfer = (code.match(/create or replace function public\.kmi_bestellung_ist_meine[\s\S]*?\$\$;/) || [''])[0];
t('kmi_bestellung_ist_meine existiert', helfer.length > 0, 'fehlt');
// Ohne security definer laeuft der Helfer gegen die RLS von orders --
// also gegen genau die Sperre, die dieses Skript gerade setzt.
t('er ist security definer', /security definer/.test(helfer), helfer.slice(0, 200));
// Ohne festen search_path koennte jemand mit eigenem Schema eine falsche
// orders-Tabelle unterschieben.
t('er hat einen festen search_path',
  /set search_path = public, pg_temp/.test(helfer), helfer.slice(0, 300));
t('er ist stable (kein volatile)', /\bstable\b/.test(helfer), helfer.slice(0, 200));

console.log('\n-- 7. Die Reihenfolge steht drin --');
// Laeuft das Skript vor dem Deploy, sieht der Gast seine eigene
// Bestellung nicht mehr. Das muss oben stehen, nicht im Kleingedruckten.
t('die Abhaengigkeit von Schritt 03 ist vermerkt',
  /LAEUFT ERST, WENN 03 GELAUFEN/.test(sql), 'kein Hinweis');
t('der Dienstschluessel in Netlify ist vermerkt',
  /SUPABASE_SERVICE_KEY/.test(sql), 'kein Hinweis');
t('die Agentur-Werkzeuge sind vermerkt',
  /sichtbarkeit\//.test(sql) && /telefon-retter\//.test(sql), 'kein Hinweis');

console.log('\n-- 8. Es gibt eine Gegenprobe --');
t('die Regeln lassen sich hinterher auflisten',
  /from pg_policies/.test(code) && /where schemaname = 'public'/.test(code), 'keine Abfrage');
t('und ob RLS wirklich an ist',
  /relrowsecurity/.test(code), 'keine Abfrage');
// Die ehrlichste Probe: als Gast selbst versuchen, Namen zu lesen.
t('die Probe aufs Exempel steht dabei',
  /select=customer_name/.test(sql) && /LEERE Liste/.test(sql), 'fehlt');

console.log('\n-- 9. Die eine Schwaeche ist benannt, nicht verschwiegen --');
// customers ist danach nur noch fuer die eigene Zeile lesbar. Die
// Doppeltenpruefung bei der Registrierung wird dadurch schwaecher.
t('der schwaechere Doppelten-Check ist beschrieben',
  /submitGastroRegistration/.test(sql), 'nicht erwaehnt');
t('und es steht dabei, was der richtige Riegel waere',
  /create unique index[\s\S]{0,80}customers/.test(sql), 'kein Vorschlag');

console.log('\n' + ok + '/' + n + ' bestanden');
if (ok !== n) process.exit(1);
