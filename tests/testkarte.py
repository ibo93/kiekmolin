# Erzeugt die Testkarte fuer tests/beweis-echt.js und tests/beweis-pruefung.js.
#
# Braucht Pillow:  pip install Pillow
# Aufruf:          python3 tests/testkarte.py /tmp/karten
#
# Legt zwei Dateien an:
#   karte.jpg     sauberer Scan
#   foto.jpg      dasselbe als schlechtes Handyfoto (schief, unscharf, dunkel)
#   wahrheit.json was WIRKLICH auf der Karte steht -- Grundlage jeder Messung
# Erzeugt eine realistische zweispaltige deutsche Speisekarte als Foto-aehnliches
# JPEG -- inklusive Gerichtnummern, Allergen-Klammern, Groessenvarianten und
# gedrehtem/leicht schiefem Scan, so wie ein Handyfoto aussieht.
import json, os, sys
# Zielordner als Argument, Standard /tmp/karten.
ZIEL = sys.argv[1] if len(sys.argv) > 1 else '/tmp/karten'
os.makedirs(ZIEL, exist_ok=True)
from PIL import Image, ImageDraw, ImageFont

F = '/usr/share/fonts/truetype/liberation/'
def f(n, s): return ImageFont.truetype(F + n, s)

H1   = f('LiberationSerif-Bold.ttf', 46)
KAT  = f('LiberationSerif-Bold.ttf', 34)
NAME = f('LiberationSans-Bold.ttf', 25)
BESCH= f('LiberationSans-Italic.ttf', 20)
PREIS= f('LiberationSans-Bold.ttf', 25)

# (nr, name, beschreibung, preis, allergen-klammer)
KARTE = [
 ('VORSPEISEN', [
   ('1',  'Bruschetta',        'geröstetes Brot, Tomaten, Basilikum, Knoblauch', '6,50', '(a,g)'),
   ('2',  'Vitello Tonnato',   'Kalbfleisch, Thunfischcreme, Kapern',            '12,90','(c,d,j)'),
   ('3',  'Caprese',           'Tomaten, Mozzarella, Basilikum',                 '8,90', '(g)'),
   ('4',  'Knoblauchbrot',     '',                                               '4,50', '(a,g)'),
 ]),
 ('SUPPEN', [
   ('5',  'Ostfriesische Fischsuppe', 'mit Nordseekrabben und Sahne',            '9,80', '(b,d,g,i)'),
   ('6',  'Tomatencremesuppe', 'mit Croûtons',                                   '6,20', '(a,g,i)'),
 ]),
 ('PIZZEN', [
   ('10', 'Margherita',        'Tomaten, Mozzarella',                            '8,50', '(a,g)'),
   ('11', 'Salami',            'Tomaten, Mozzarella, Salami',                    '9,50', '(a,g,2)'),
   ('12', 'Prosciutto e Funghi','Tomaten, Mozzarella, Schinken, Champignons',    '10,50','(a,g,2,3)'),
   ('13', 'Diavolo',           'scharfe Salami, Peperoni, Zwiebeln',             '10,90','(a,g,2)'),
   ('14', 'Tonno',             'Thunfisch, Zwiebeln',                            '10,90','(a,d,g)'),
   ('15', 'Quattro Formaggi',  'vier Käsesorten',                                '11,50','(a,g)'),
 ]),
 ('VOM GRILL', [
   ('20', 'Rumpsteak 250g',    'mit Kräuterbutter und Pommes',                   '26,90','(g,j)'),
   ('21', 'Lammkoteletts',     'mit Rosmarinkartoffeln',                         '24,50','(9)'),
   ('22', 'Hähnchenbrustfilet','mit Gemüse der Saison',                          '18,90','(g)'),
 ]),
 ('VON DE WATERKANT', [
   ('30', 'Backfisch',         'Nordseescholle im Bierteig, Remoulade',          '17,90','(a,c,d,j)'),
   ('31', 'Matjes "Hausfrauenart"','mit Bratkartoffeln',                         '14,50','(c,d,g,j)'),
   ('32', 'Krabbenbrot',       'Nordseekrabben auf Bauernbrot',                  '16,90','(a,b,c,g)'),
 ]),
 ('DESSERTS', [
   ('40', 'Rote Grütze',       'mit Vanillesauce',                               '6,50', '(c,g)'),
   ('41', 'Tiramisu',          'hausgemacht',                                    '6,90', '(a,c,g)'),
 ]),
 ('GETRÄNKE', [
   ('',   'Cola 0,3 l',        '',                                               '3,20', '(1,3)'),
   ('',   'Cola 0,5 l',        '',                                               '4,40', '(1,3)'),
   ('',   'Apfelschorle 0,3 l','',                                               '3,00', ''),
   ('',   'Pils vom Fass 0,3 l','',                                              '3,50', ''),
   ('',   'Pils vom Fass 0,5 l','',                                              '4,60', ''),
   ('',   'Ostfriesentee',     'mit Kluntje und Sahne',                          '3,40', '(g)'),
   ('',   'Espresso',          '',                                               '2,40', ''),
   ('',   'Cappuccino',        '',                                               '3,20', '(g)'),
 ]),
]

W, HGT = 2000, 2700
img = Image.new('RGB', (W, HGT), (252, 250, 245))
d = ImageDraw.Draw(img)

d.text((W // 2, 70), 'Restaurant Deichblick', font=H1, fill=(30, 30, 30), anchor='mt')
d.text((W // 2, 128), 'Greetsiel · Speisekarte', font=BESCH, fill=(110, 110, 110), anchor='mt')
d.line([(120, 175), (W - 120, 175)], fill=(160, 140, 100), width=3)

# zwei Spalten
SP = [(120, 230), (1060, 230)]
sp = 0
y = SP[0][1]
GRENZE = HGT - 260

wahrheit = []
for kat, gerichte in KARTE:
    if y + 140 > GRENZE and sp == 0:
        sp = 1; y = SP[1][1]
    x = SP[sp][0]
    y += 22
    d.text((x, y), kat, font=KAT, fill=(120, 40, 30))
    y += 48
    d.line([(x, y), (x + 800, y)], fill=(200, 190, 170), width=2)
    y += 16
    for nr, name, besch, preis, alg in gerichte:
        if y + 70 > GRENZE and sp == 0:
            sp = 1; y = SP[1][1]; x = SP[sp][0]
            d.text((x, y), kat + ' (Fortsetzung)', font=KAT, fill=(120, 40, 30)); y += 64
        zeile = (nr + '  ' if nr else '') + name
        d.text((x, y), zeile, font=NAME, fill=(25, 25, 25))
        d.text((x + 800, y), preis + ' €', font=PREIS, fill=(25, 25, 25), anchor='ra')
        y += 30
        unten = (besch + ' ' + alg).strip()
        if unten:
            d.text((x + 16, y), unten, font=BESCH, fill=(105, 105, 105))
            y += 26
        y += 14
        wahrheit.append({'nr': nr, 'name': name, 'preis': preis.replace(',', '.'),
                         'kategorie': kat, 'klammer': alg})

d.text((120, HGT - 190), 'Zusatzstoffe: 1 = mit Farbstoff, 2 = mit Konservierungsstoff, 3 = mit Antioxidationsmittel,',
       font=BESCH, fill=(120, 120, 120))
d.text((120, HGT - 160), '9 = mit Süßungsmitteln.   Allergene: a = Gluten, b = Krebstiere, c = Eier, d = Fisch,',
       font=BESCH, fill=(120, 120, 120))
d.text((120, HGT - 130), 'g = Milch, i = Sellerie, j = Senf.', font=BESCH, fill=(120, 120, 120))

# leicht schief + minimal weichgezeichnet, damit es nach Handyfoto aussieht
img = img.rotate(-0.6, resample=Image.BICUBIC, fillcolor=(252, 250, 245))
img.save(ZIEL + '/karte.jpg',
         quality=90)
json.dump(wahrheit, open(ZIEL + '/wahrheit.json', 'w'),
          ensure_ascii=False, indent=1)
print('Karte erzeugt:', len(wahrheit), 'Gerichte,', img.size)


# --- Zweite Fassung: so sieht es aus, wenn jemand die Karte schnell mit dem
# --- Handy abfotografiert. Genau daran zeigt sich, was der Scanner taugt.
from PIL import ImageFilter, ImageEnhance
im = Image.open(ZIEL + '/karte.jpg')
w2, h2 = im.size
im = im.transform((w2, h2), Image.PERSPECTIVE,
    (1.0, 0.055, -70, 0.02, 1.03, -40, 0.00004, 0.00002),
    resample=Image.BICUBIC, fillcolor=(240, 238, 232))
im = im.rotate(-2.4, resample=Image.BICUBIC, fillcolor=(240, 238, 232))
im = im.filter(ImageFilter.GaussianBlur(1.1))
im = ImageEnhance.Brightness(im).enhance(0.82)
im = ImageEnhance.Contrast(im).enhance(0.88)
grad = Image.linear_gradient('L').resize((w2, h2)).rotate(35, fillcolor=128)
im = Image.composite(im, ImageEnhance.Brightness(im).enhance(1.35), grad)
im = im.resize((1600, int(1600 * h2 / w2)), Image.LANCZOS)
im.save(ZIEL + '/foto.jpg', quality=62)
print('Handyfoto erzeugt:', im.size)
