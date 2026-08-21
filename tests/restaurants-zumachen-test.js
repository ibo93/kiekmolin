// Prueft das SQL, das die offene Tuer bei restaurants schliesst.
//
// Ausfuehren laesst sich das hier nicht -- es gibt keine Datenbank. Was
// sich pruefen laesst, ist die Bauart: dass die richtige Regel weggeht,
// dass die falsche nicht mitgeht, und dass jede neue Regel eine Bedingung
// hat. Eine Regel ohne Bedingung ist genau das Problem, das wir gerade
// beseitigen -- die darf hier nicht versehentlich wieder entstehen.

var fs = require('fs');
var path = require('path');

var n = 0, ok = 0;
function t(l, c, x) { n++; var g = c === true; if (g) ok++; console.log((g ? 'OK  ' : 'FAIL') + ' | ' + l + (g ? '' : '  -> ' + x)); }

var sql = fs.readFileSync(path.join(__dirname, '..', 'datenbank', '02-restaurants-zumachen.sql'), 'utf8');
var code = sql.split('\n').filter(function (z) { return !/^\s*--/.test(z); }).join('\n');

console.log('\n-- Was weg muss --');

t('die offene ALL-Regel wird geloescht',
  /drop policy if exists "Allow all for restaurants" on public\.restaurants/.test(code));
t('die offene INSERT-Regel wird geloescht',
  /drop policy if exists "Insert restaurants"\s+on public\.restaurants/.test(code));

console.log('\n-- Was bleiben muss --');

// Die Gastansicht haengt an dieser Regel. Faellt sie, sieht kein Besucher
// mehr ein einziges Restaurant.
t('die oeffentliche Leseregel wird NICHT geloescht',
  !/drop policy[^\n]*Restaurants sind/i.test(code));
t('sie wird auch nicht neu angelegt (also nicht versehentlich veraendert)',
  !/create policy[^\n]*Restaurants sind/i.test(code));

console.log('\n-- Keine neue offene Tuer --');

// Jede neue Regel braucht eine Bedingung. Ausnahme: das Anlegen, denn
// dort gibt es noch keine Zeile, an der man etwas pruefen koennte -- die
// Einschraenkung steckt dort im "to authenticated".
var regeln = code.split(/create policy/).slice(1);
t('vier neue Regeln', regeln.length === 4, regeln.length);

regeln.forEach(function (r) {
    var name = (r.match(/"([^"]+)"/) || [])[1] || '?';
    var istInsert = /for insert/.test(r);
    var hatBedingung = /kmi_meine_haeuser\(\)|kmi_ist_superadmin\(\)|kmi_email\(\)/.test(r);
    t('"' + name + '" ist an eine Person gebunden',
      istInsert ? /to authenticated/.test(r) : hatBedingung,
      r.slice(0, 90));
});

t('keine neue Regel gilt fuer alle (public/anon)',
  regeln.every(function (r) { return !/to\s+(public|anon)\b/.test(r); }));
t('keine neue Regel ist eine ALL-Regel -- die war der Fehler',
  regeln.every(function (r) { return !/for\s+all\b/i.test(r); }));

console.log('\n-- Aendern: beide Seiten --');

var aendern = regeln.filter(function (r) { return /for update/.test(r); })[0] || '';
t('beim Aendern wird "using" geprueft (welche Zeile darf ich anfassen)', /using\s*\(/.test(aendern));
t('und "with check" (wie darf sie danach aussehen)', /with check\s*\(/.test(aendern));
// Ohne with_check koennte man sein eigenes Haus per Update auf eine fremde
// restaurant_id umschreiben und es damit uebernehmen.
t('beide pruefen dasselbe',
  (aendern.match(/kmi_meine_haeuser\(\)/g) || []).length === 2, aendern);

console.log('\n-- Loeschen --');

var loeschen = regeln.filter(function (r) { return /for delete/.test(r); })[0] || '';
t('loeschen darf nur der Superadmin',
  /kmi_ist_superadmin\(\)/.test(loeschen) && !/kmi_meine_haeuser/.test(loeschen), loeschen);

console.log('\n-- Der Fall, der die Registrierung gerettet hat --');

// Bei der Registrierung entsteht das Haus, BEVOR die customers-Zeile da
// ist. PostgREST gibt die neue Zeile zurueck und braucht dafuer Leserecht
// auf genau diese Zeile -- ueber kmi_meine_haeuser() findet es sie in dem
// Moment noch nicht.
var lesen = regeln.filter(function (r) { return /for select/.test(r); })[0] || '';
t('die Leseregel greift auch ueber die E-Mail des Hauses',
  /lower\(coalesce\(email, ''\)\)\s*=\s*public\.kmi_email\(\)/.test(lesen), lesen);
t('und ueber die eigenen Haeuser', /kmi_meine_haeuser\(\)/.test(lesen));
t('und der Superadmin sieht alles', /kmi_ist_superadmin\(\)/.test(lesen));

console.log('\n-- Die Helfer --');

['kmi_email', 'kmi_ist_superadmin', 'kmi_meine_haeuser'].forEach(function (f) {
    var block = (code.split('create or replace function public.' + f)[1] || '').split('$$;')[0];
    t(f + ' laeuft mit den Rechten des Besitzers (security definer)',
      /security definer/.test(block), block.slice(0, 80));
    // Ohne festen search_path koennte jemand eine eigene customers-Tabelle
    // unterschieben und sich selbst zum Superadmin machen.
    t(f + ' hat einen festen search_path', /set search_path\s*=\s*public/.test(block));
    t(f + ' ist stable, nicht volatile', /\bstable\b/.test(block));
});

t('leere E-Mail wird zu NULL, nicht zu ""', /nullif\(lower\(coalesce\(auth\.jwt\(\)/.test(code));
t('die Helfer sind fuer die App freigegeben',
  (code.match(/grant execute on function public\.kmi_/g) || []).length === 3);

console.log('\n-- Was es nicht tun darf --');

t('RLS wird nicht abgeschaltet', !/disable\s+row\s+level\s+security/i.test(code));
t('keine Tabelle wird geaendert oder geleert',
  !/\b(alter\s+table|truncate|drop\s+table|delete\s+from)\b/i.test(code));

console.log('\n-- Reihenfolge und Vorsicht --');

t('es steht drin, dass PR #176 vorher deployed sein muss', /PR #176/.test(sql));
t('der NULL-Fall bei is_active ist benannt', /is_active is null|NULL ist nicht gleich true/i.test(sql));
t('am Ende steht eine Gegenprobe', /from pg_policies[\s\S]*tablename = 'restaurants'/.test(code));
t('die Gegenprobe warnt bei Regeln ohne Bedingung', /OHNE BEDINGUNG/.test(code));

console.log('\n' + (ok === n ? `Alle ${n} Tests bestanden.` : `${n - ok} von ${n} FEHLGESCHLAGEN.`));
process.exit(ok === n ? 0 : 1);
