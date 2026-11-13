// Gesprochene Zahlen in allen fünf Sprachen: "vier", "dört", "çar", "أربعة", "four".
//
// Die Spracherkennung liefert Text – oft als Wort, nicht als Ziffer. Und
// gerade bei Kurmancî ist die Erkennung unsicher. Deshalb wird die Zahl
// hier selbst gelesen und dem Mitarbeiter IMMER zur Bestätigung gezeigt.
//
// Unterstützt 0–999, halbe ("zweieinhalb", "iki buçuk", "du û nîv",
// "اثنين ونص", "two and a half") und Ziffern, auch arabisch-indische (٤).

const W: Record<string, number> = {};
function woerter(liste: string, start = 0) {
  liste.split(/\s+/).forEach((w, i) => { if (w && w !== '-') W[w] = start + i; });
}
function setze(werte: Record<string, number>) { Object.assign(W, werte); }

// Deutsch
woerter('null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn');
setze({ ein: 1, eine: 1, einen: 1, zwo: 2, fuenf: 5, zwoelf: 12, sechzehn: 16, siebzehn: 17,
  zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
  hundert: 100, einhundert: 100 });
// Türkisch
woerter('sıfır bir iki üç dört beş altı yedi sekiz dokuz on');
// ohne türkische Sonderzeichen, falls die Erkennung sie weglässt
setze({ sifir: 0, uc: 3, dort: 4, bes: 5, alti: 6, kirk: 40, altmis: 60, yetmis: 70, yuz: 100 });
setze({ yirmi: 20, otuz: 30, kırk: 40, elli: 50, altmış: 60, yetmiş: 70, seksen: 80, doksan: 90, yüz: 100 });
// Kurmancî
woerter('sifir yek du sê çar pênc şeş heft heşt neh deh yazdeh diwazdeh sêzdeh çardeh panzdeh şanzdeh hevdeh hejdeh nozdeh');
setze({ bîst: 20, sî: 30, çil: 40, pêncî: 50, şêst: 60, heftê: 70, heştê: 80, not: 90, sed: 100, dudu: 2 });
// Englisch
woerter('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen');
setze({ twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 });
// Arabisch (nach normalisieren(): ohne Hamza-Varianten, ة→ه, ى→ي, ohne Vokalzeichen)
setze({
  صفر: 0, واحد: 1, واحده: 1, اثنان: 2, اثنين: 2, اتنين: 2, اثنا: 2, اثنتان: 2, ثلاثه: 3, ثلاث: 3, تلاته: 3, تلات: 3,
  اربعه: 4, اربع: 4, خمسه: 5, خمس: 5, سته: 6, ست: 6, سبعه: 7, سبع: 7, ثمانيه: 8, ثمان: 8, ثماني: 8, تمانيه: 8, تمنيه: 8,
  تسعه: 9, تسع: 9, عشره: 10, عشر: 10, احد: 1, حدعش: 11, اطنعش: 12, عشرون: 20, عشرين: 20, ثلاثون: 30, ثلاثين: 30, تلاتين: 30,
  اربعون: 40, اربعين: 40, خمسون: 50, خمسين: 50, ستون: 60, ستين: 60, سبعون: 70, سبعين: 70, ثمانون: 80, ثمانين: 80, تمانين: 80,
  تسعون: 90, تسعين: 90, مئه: 100, مائه: 100, ميه: 100, ميت: 100,
});

const HALB = new Set(['halb', 'halbe', 'einhalb', 'buçuk', 'yarım', 'nîv', 'niv', 'نصف', 'نص', 'half']);
const UND = new Set(['und', 've', 'û', 'u', 'and', 'و', 'komma']);

function normalisieren(t: string): string {
  return t.toLowerCase();
}

function arabischNormal(t: string): string {
  return t
    .replace(/[ً-ْـ]/g, '') // Vokalzeichen, Tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

function ziffernWestlich(t: string): string {
  return t
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ',');
}

/** Ein Wort → Wert, inklusive deutscher Zusammensetzungen und arabischem "و"-Präfix. */
function wortWert(w: string): number | 'halb' | null {
  if (HALB.has(w)) return 'halb';
  if (w in W) return W[w];
  if (w === 'anderthalb') return 1.5;
  // deutsch: zweieinhalb, eineinhalb
  const halb = w.match(/^(.+?)einhalb$/);
  if (halb && halb[1] in W) return W[halb[1]] + 0.5;
  // deutsch: einundzwanzig, dreihundertvier
  const und = w.match(/^(.+?)und(.+)$/);
  if (und && und[1] in W && und[2] in W) return W[und[1]] + W[und[2]];
  const hundert = w.match(/^(.*?)hundert(.*)$/);
  if (hundert) {
    const vorne = hundert[1] ? wortWert(hundert[1]) : 1;
    const hinten = hundert[2] ? wortWert(hundert[2]) : 0;
    if (typeof vorne === 'number' && typeof hinten === 'number') return vorne * 100 + hinten;
  }
  // arabisch: "وعشرين" = "و" + "عشرين"
  if (w.startsWith('و') && w.length > 2) {
    const rest = wortWert(w.slice(1));
    if (rest != null) return rest;
  }
  return null;
}

/**
 * Liest EINE Menge aus einem Satz. null, wenn keine Zahl erkannt wurde –
 * dann wird nachgefragt, nie geraten.
 */
export function zahlLesen(eingabe: string): number | null {
  if (!eingabe) return null;
  let t = ziffernWestlich(eingabe.trim());
  // Ziffern haben Vorrang: "4", "4,5", "12.5"
  const z = t.match(/(\d+(?:[.,]\d+)?)/);
  if (z) {
    let n = Number(z[1].replace(',', '.'));
    if (/(buçuk|einhalb|\bhalb|and a half|û nîv|ونص|و نص)/i.test(t)) n += 0.5;
    return n;
  }
  t = arabischNormal(normalisieren(t)).replace(/[-–,.!?؟،]/g, ' ');
  const tokens = t.split(/\s+/).filter(Boolean);

  let summe = 0;
  let gefunden = false;
  let kommaFolgt = false;
  for (const tok of tokens) {
    if (tok === 'komma') { kommaFolgt = true; continue; }
    if (UND.has(tok)) continue;
    const v = wortWert(tok);
    if (v == null) continue;
    if (v === 'halb') { summe += 0.5; gefunden = true; continue; }
    if (kommaFolgt) { summe += v / 10 ** String(v).length; kommaFolgt = false; gefunden = true; continue; }
    if (v === 100 && gefunden && summe > 0 && summe < 100) summe *= 100;
    else summe += v;
    gefunden = true;
  }
  return gefunden ? Math.round(summe * 1000) / 1000 : null;
}
