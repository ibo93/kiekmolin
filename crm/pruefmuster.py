"""Suchbegriffe fuer die Datenschutzpruefung, gezogen aus js/stammdaten.js.

Nur die wirklich heiklen Felder: Anschrift, Bankverbindung, Steuernummer,
Zugaenge und die Kundenliste. Firmenname und Ort bleiben draussen – die
stehen zu Recht im Quelltext (Briefkopf, Nachrichtenvorlagen) und wuerden
nur falschen Alarm ausloesen.
"""
import re, pathlib, sys

HEIKEL = ('strasse', 'plz', 'telefon', 'mobil', 'email', 'steuernummer',
          'iban', 'bic', 'bank', 'glaeubigerid', 'syncurl', 'synckey',
          'kmiurl', 'kmikey')

try:
    text = pathlib.Path('js/stammdaten.js').read_text()
except Exception:
    sys.exit(1)

def taugt(w):
    """Die Feldnamen sind schon ausgewaehlt – hier reicht eine Mindestlaenge."""
    return len(w) >= 4

muster = set()

# 1) Heikle Felder aus FIRMENDATEN – ueber den Feldnamen ausgewaehlt
for name, wert in re.findall(r"([A-Za-z]+)\s*:\s*'([^']{4,})'", text):
    if name.lower() not in HEIKEL: continue
    wert = wert.strip()
    if not taugt(wert): continue
    muster.add(re.escape(wert))
    treffer = re.search(r'https://([a-z0-9]{15,})\.supabase\.co', wert)
    if treffer: muster.add(re.escape(treffer.group(1)))

# 2) Auch die per Zuweisung nachgereichten Werte (FIRMENDATEN.iban = '...')
for name, wert in re.findall(r"FIRMENDATEN\.([A-Za-z]+)\s*=\s*'([^']{4,})'", text):
    if name.lower() not in HEIKEL: continue
    wert = wert.strip()
    if not taugt(wert): continue
    muster.add(re.escape(wert))
    treffer = re.search(r'https://([a-z0-9]{15,})\.supabase\.co', wert)
    if treffer: muster.add(re.escape(treffer.group(1)))

# 3) Kundennamen aus STAMMKUNDEN
# Die Kunden stehen als Zeilen-Arrays:
#   ['1001','kuerzel','Firma Name','Strasse','PLZ','Ort',true]
# Uns interessieren Firmenname (Feld 3) und Strasse (Feld 4).
block = re.search(r'STAMMKUNDEN\s*=\s*\[(.*?)\n\]', text, re.S)
if block:
    for zeile in re.findall(r"\[([^\]]+)\]", block.group(1)):
        felder = re.findall(r"'([^']*)'", zeile)
        for i in (2, 3):
            if len(felder) > i and len(felder[i]) >= 4:
                muster.add(re.escape(felder[i].strip()))

if not muster: sys.exit(1)
print('|'.join(sorted(muster)))
