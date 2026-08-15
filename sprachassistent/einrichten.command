#!/bin/bash
# KURANI · Sprachassistent — EINRICHTEN (einmalig)
#
# Doppelklick im Finder. (Beim allerersten Mal meckert macOS:
# Rechtsklick -> Oeffnen -> Oeffnen.)
#
# Danach reicht start.command zum Starten. Dieses Skript hier ist der
# Handgriff davor: es legt an, was noch fehlt, und sucht die Sachen, die
# auf DIESEM Rechner liegen - deine Ordner und dein CM.
#
# Was es NICHT tut: eine vorhandene .env ueberschreiben, Schluessel
# anzeigen, oder etwas ohne Rueckfrage in deine Dateien schreiben.

cd "$(dirname "$0")" || exit 1

BLAU='\033[1m'
AUS='\033[0m'

sag() { printf "  %b\n" "$1"; }
titel() { printf "\n${BLAU}  %s${AUS}\n" "$1"; }

# Fragt ja/nein. Ohne Terminal (z.B. aus einem Skript) gilt: nein.
frage() {
  if [ ! -t 0 ]; then return 1; fi
  printf "  %s [j/n] " "$1"
  read -r antwort
  case "$antwort" in [jJyY]*) return 0 ;; *) return 1 ;; esac
}

printf "\n${BLAU}  KURANI · Sprachassistent — Einrichten${AUS}\n"
sag "================================================"

# ------------------------------------------------------------------ Node ---
titel "1. Node"
if ! command -v node >/dev/null 2>&1; then
  sag "Node ist nicht installiert."
  sag "-> nodejs.org oeffnen, LTS holen, dann nochmal doppelklicken."
  [ -t 0 ] && read -r -p "  Mit Enter schliessen..."
  exit 1
fi
sag "ok  $(node --version)"

# ----------------------------------------------------------- Claude Code ---
titel "2. Claude Code"
if command -v claude >/dev/null 2>&1; then
  sag "ok  $(claude --version 2>/dev/null | head -1)"
else
  sag "-- Der Befehl \"claude\" liegt nicht im Pfad."
  sag "   Finde ihn mit:  which claude"
  sag "   und trag ihn spaeter als SPRACH_CLAUDE_BEFEHL in die .env ein."
fi

# ------------------------------------------------------- Abhaengigkeiten ---
titel "3. Abhaengigkeit (ws, fuer das Live-Gespraech)"
if [ -d node_modules/ws ]; then
  sag "ok  ist schon da"
else
  sag "hole sie einmalig ..."
  if npm install --no-audit --no-fund --silent; then
    sag "ok  fertig"
  else
    sag "!!  npm install hat nicht geklappt. Alles ausser Live laeuft trotzdem."
  fi
fi

# -------------------------------------------------------------- .env ------
titel "4. Einstellungen (.env)"
if [ -f .env ]; then
  sag "ok  .env gibt es schon - ich fasse sie nicht an"
else
  cp .env.example .env
  sag "ok  .env angelegt (aus der Vorlage)"
  sag "    Du musst da NICHTS ausfuellen, damit es laeuft."
fi

# --------------------------------------------------------- ordner.json ----
titel "5. Deine Ordner (ordner.json)"

# Die Vorlage enthaelt Ordner, die es auf DIESEM Rechner vielleicht gar
# nicht gibt (~/Kurani/Buero und so). Sie einfach zu kopieren, laesst die
# Selbstpruefung mit drei Fehlern enden, obwohl nichts kaputt ist. Also
# wird nur uebernommen, was wirklich da ist - der Rest steht als Hinweis.
node -e '
const fs = require("fs"), os = require("os"), path = require("path");

function voll(p) {
  const t = String(p || "");
  if (t === "." || t === "./") return path.resolve("..");
  if (t.startsWith("~")) return path.join(os.homedir(), t.slice(1));
  return path.isAbsolute(t) ? t : path.resolve("..", t);
}

if (fs.existsSync("ordner.json")) {
  let k;
  try { k = JSON.parse(fs.readFileSync("ordner.json", "utf8")); }
  catch (e) { console.log("  !!  ordner.json ist kaputt: " + e.message); process.exit(0); }
  console.log("  ok  ordner.json gibt es schon - ich fasse sie nicht an");
  for (const o of (k.ordner || [])) {
    const p = voll(o.pfad);
    console.log(fs.existsSync(p) ? "  ok  " + o.name + ": " + p
                                 : "  --  " + o.name + ": gibt es nicht -> " + p);
  }
  process.exit(0);
}

const roh = JSON.parse(fs.readFileSync("ordner.json.example", "utf8"));
const behalten = [], fehlen = [];
for (const o of (roh.ordner || [])) {
  if (fs.existsSync(voll(o.pfad))) behalten.push(o);
  else fehlen.push(o);
}

const standard = behalten.some((o) => o.name === roh.standard) ? roh.standard
  : (behalten[0] ? behalten[0].name : "app");
fs.writeFileSync("ordner.json", JSON.stringify({ standard: standard, ordner: behalten }, null, 2) + "\n");

console.log("  ok  ordner.json angelegt - mit den Ordnern, die es hier wirklich gibt:");
for (const o of behalten) console.log("      " + o.name + ": " + voll(o.pfad));
if (fehlen.length) {
  console.log("  --  Nicht uebernommen (gibt es auf diesem Rechner nicht):");
  for (const o of fehlen) console.log("      " + o.name + " -> " + o.pfad);
  console.log("      Hast du die doch, nur woanders: in ordner.json nachtragen.");
  console.log("      Vorlage mit allen Beispielen: ordner.json.example");
}
'

# ------------------------------------------------- Kurani-Unterlagen ------
titel "6. Deine Kurani-Unterlagen"
node -e '
const k = require("./lib/kurani").finde();
if (!k.ordner.length) {
  console.log("  --  Keine gefunden. Er arbeitet dann nur im Repository.");
  console.log("      Ordner \"Kurani\" im Benutzerordner anlegen - oder");
  console.log("      SPRACH_ZUSATZ_ORDNER in der .env setzen.");
} else {
  for (const o of k.ordner) console.log("  ok  " + o);
  console.log("  ok  " + k.claudeDateien.length + " CLAUDE.md gefunden (deine Regeln je Kunde)");
}
'

# ---------------------------------------------------------------- CM ------
titel "7. Dein CM (die Kundenverwaltung)"
GEFUNDEN=$(node -e '
const crm = require("./lib/crm");
const q = crm.quellen().filter((e) => e.art === "datei" || e.art === "datenbank");
if (q.length) console.log(q.map((e) => e.pfad).join(","));
' 2>/dev/null)

if grep -q '^SPRACH_CRM=' .env 2>/dev/null; then
  sag "ok  In der .env steht schon ein Pfad - ich lasse ihn stehen."
elif [ -n "$GEFUNDEN" ]; then
  node -e '
  const crm = require("./lib/crm");
  const q = crm.quellen();
  const anzahl = crm.alleKunden(q).length;
  for (const e of q) console.log("  ok  " + e.pfad + (e.anzahl ? "  (" + e.anzahl + " Eintraege)" : ""));
  if (anzahl) console.log("  ->  macht " + anzahl + " Kunden, die er lesen kann.");
  '
  sag ""
  if frage "Soll ich den Pfad fest in die .env eintragen? (dann sucht er nicht jedes Mal)"; then
    {
      echo ""
      echo "# Von einrichten.command eingetragen: dein CM."
      echo "SPRACH_CRM=$GEFUNDEN"
    } >> .env
    sag "ok  eingetragen"
  else
    sag "ok  gut - er sucht dann jedes Mal selbst (dauert einen Wimpernschlag)"
  fi
else
  sag "--  Deine Kundenverwaltung finde ich nicht."
  sag "    Gesucht habe ich in ~/CRM, ~/CM, ~/Kurani und ~/Projekte."
  sag ""
  sag "    Wo liegt sie? Trag sie einmal in die .env ein:"
  sag "      SPRACH_CRM=~/Pfad/zu/deinem/CM"
  sag ""
  sag "    Erlaubt: eine Datei (.json, .jsonl, .csv), ein Ordner, eine"
  sag "    SQLite-Datenbank (.db) oder die Adresse deines laufenden CM"
  sag "    (z.B. http://localhost:3000/api/kunden)."
  sag "    Nachsehen, was er findet:  node crm.js quellen"
fi

# -------------------------------------------------------------- Stimme -----
titel "8. Die Stimme"
node -e '
require("./lib/env").ladeEnv();
const s = require("./lib/stimmen");
const weg = s.welcherWeg();
const a = s.aktuelle();
if (weg === "elevenlabs") console.log("  ok  ElevenLabs - die beste, die es gibt.");
else if (weg === "mac") console.log("  ok  " + a.name + " (im Mac eingebaut, kostet nichts)");
else {
  console.log("  --  Gerade spricht die Browser-Stimme. Die klingt blechern.");
  console.log("      Im Mac stecken deutlich bessere - und die kosten nichts.");
}
'
if [ -t 0 ] && [ "$(node -e 'require("./lib/env").ladeEnv();console.log(require("./lib/stimmen").welcherWeg())')" = "browser" ]; then
  if frage "Soll ich dir die deutschen Stimmen jetzt vorspielen?"; then
    node stimmen.js hoeren
    sag "Aussuchen mit:  node stimmen.js nimm <nummer>"
  else
    sag "Spaeter:  node stimmen.js hoeren"
  fi
fi

# --------------------------------------------------------- Selbstpruefung --
titel "9. Selbstpruefung"
node pruefe.js
ERGEBNIS=$?

echo ""
sag "================================================"
if [ $ERGEBNIS -eq 0 ]; then
  sag "Eingerichtet. Zum Starten: ${BLAU}start.command${AUS} doppelklicken."
  sag ""
  sag "Beim ersten Mal wuerde ich das hier sagen:"
  sag "  \"Moin\"                      - Wetter und was heute ansteht"
  sag "  \"Ich ruf gleich <Kunde> an\" - das Briefing vor dem Telefonat"
  sag "  \"Wer ist faellig?\"          - offene Wiedervorlagen aus dem CM"
else
  sag "Oben steht, was noch fehlt. Das in Ordnung bringen, dann"
  sag "einrichten.command nochmal starten."
fi
echo ""

[ -t 0 ] && read -r -p "  Mit Enter schliessen..."
exit 0
