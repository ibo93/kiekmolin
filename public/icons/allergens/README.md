# Kiek-mol-in Icon-Paket

Dicke, gefuellte SVG-Icons fuer Lebensmittel, Allergene und Speisekarten-Hinweise. Alle Icons haben dieselbe `viewBox="0 0 64 64"`, sind als einzelne Dateien gespeichert und verwenden `currentColor`. Dadurch sind sie standardmaessig schwarz, koennen aber per CSS beliebig eingefarbt werden.

## Struktur

```text
public/icons/allergens/
├── eu-allergens/
├── meat/
├── seafood/
├── foods/
├── icons.json
└── README.md
```

## Einbau in Claude Code / Website

1. Den Ordner `public/icons/allergens/` in dein Projekt kopieren.
2. Icons in HTML oder JSX als Bild einbinden:

```html
<img src="/icons/allergens/eu-allergens/gluten.svg" alt="Gluten" class="food-icon" />
```

3. Einheitliche Groesse setzen:

```css
.food-icon {
  width: 24px;
  height: 24px;
  display: inline-block;
  vertical-align: middle;
}
```

4. Wenn du die Farbe per CSS steuern willst, nutze die SVGs inline oder lade sie als React-Komponente. Die Icons verwenden `currentColor`.

Beispiel-Prompt fuer Claude Code:

> Verwende die SVG-Icons aus `/public/icons/allergens/` fuer die Lebensmittel- und Allergenkennzeichnung. Zeige die Icons klein und einheitlich neben den jeweiligen Angaben an. Nutze die Datei `icons.json` als Uebersicht fuer Namen, Kategorien und Pfade.

## Enthaltene Icons

Insgesamt: 44 SVG-Dateien.

### EU-Allergene

| Icon | Datei |
| --- | --- |
| Gluten | `eu-allergens/gluten.svg` |
| Krebstiere | `eu-allergens/crustaceans.svg` |
| Eier | `eu-allergens/eggs.svg` |
| Fisch | `eu-allergens/fish.svg` |
| Erdnuesse | `eu-allergens/peanuts.svg` |
| Soja | `eu-allergens/soy.svg` |
| Milch Laktose | `eu-allergens/milk-lactose.svg` |
| Schalenfruechte | `eu-allergens/tree-nuts.svg` |
| Sellerie | `eu-allergens/celery.svg` |
| Senf | `eu-allergens/mustard.svg` |
| Sesam | `eu-allergens/sesame.svg` |
| Schwefeldioxid Sulfite | `eu-allergens/sulfites.svg` |
| Lupinen | `eu-allergens/lupin.svg` |
| Weichtiere | `eu-allergens/molluscs.svg` |

### Fleischarten

| Icon | Datei |
| --- | --- |
| Rind | `meat/beef.svg` |
| Schwein | `meat/pork.svg` |
| Lamm | `meat/lamb.svg` |
| Huhn | `meat/chicken.svg` |
| Pute | `meat/turkey.svg` |
| Ente | `meat/duck.svg` |
| Wild | `meat/game.svg` |
| Pferd | `meat/horse.svg` |

### Meerestiere

| Icon | Datei |
| --- | --- |
| Garnelen | `seafood/shrimp.svg` |
| Tintenfisch | `seafood/squid.svg` |
| Muscheln | `seafood/mussels.svg` |
| Austern | `seafood/oysters.svg` |
| Schnecken | `seafood/snails.svg` |

### Weitere Lebensmittel

| Icon | Datei |
| --- | --- |
| Knoblauch | `foods/garlic.svg` |
| Zwiebel | `foods/onion.svg` |
| Pilze | `foods/mushrooms.svg` |
| Mais | `foods/corn.svg` |
| Reis | `foods/rice.svg` |
| Chili | `foods/chili.svg` |
| Tomate | `foods/tomato.svg` |
| Paprika | `foods/bell-pepper.svg` |
| Honig | `foods/honey.svg` |
| Zucker | `foods/sugar.svg` |
| Schokolade | `foods/chocolate.svg` |
| Vanille | `foods/vanilla.svg` |
| Hefe | `foods/yeast.svg` |
| Sojasauce | `foods/soy-sauce.svg` |
| Pflanzliches Oel | `foods/plant-oil.svg` |
| Butter | `foods/butter.svg` |
| Ananas | `foods/pineapple.svg` |
