# Kiek-mol-in Icon-Paket

Vorlagengetreue, dick gefuellte schwarze Lebensmittel- und Allergen-Icons im Stil der gelieferten Referenzgrafik. Die Icons enthalten keine sichtbaren Textbeschriftungen und liegen einzeln als SVG-Dateien vor.

Alle Icons nutzen:

- `viewBox="0 0 64 64"`
- `fill="currentColor"`
- transparente Flaeche
- einheitliche Dateinamen fuer Website/Claude Code

## Einbau

Kopiere den Ordner `public/icons/allergens/` in dein Projekt.

```html
<img src="/icons/allergens/eu-allergens/gluten.svg" alt="Gluten" class="food-icon" />
```

```css
.food-icon {
  width: 24px;
  height: 24px;
  display: inline-block;
  vertical-align: middle;
}
```

Wenn du die Farbe dynamisch steuern willst, nutze die SVGs inline oder als Komponente, da sie `currentColor` verwenden.

Die Datei `icons.json` enthaelt alle Namen, Kategorien und Pfade.

## Enthaltene Icons

Insgesamt: 57 SVG-Dateien.

### EU-Allergene

| Icon | Datei |
| --- | --- |
| Gluten | `eu-allergens/gluten.svg` |
| Eier | `eu-allergens/eggs.svg` |
| Milch Laktose | `eu-allergens/milk-lactose.svg` |
| Fisch | `eu-allergens/fish.svg` |
| Krebstiere | `eu-allergens/crustaceans.svg` |
| Erdnuesse | `eu-allergens/peanuts.svg` |
| Soja | `eu-allergens/soy.svg` |
| Lupinen | `eu-allergens/lupin.svg` |
| Nuesse | `eu-allergens/nuts.svg` |
| Sellerie | `eu-allergens/celery.svg` |
| Senf | `eu-allergens/mustard.svg` |
| Sesam | `eu-allergens/sesame.svg` |
| Schwefeldioxid Sulfite | `eu-allergens/sulfites.svg` |
| Weichtiere | `eu-allergens/molluscs.svg` |
| Schalenfruechte | `eu-allergens/tree-nuts.svg` |
### Nuesse

| Icon | Datei |
| --- | --- |
| Mandeln | `nuts/almonds.svg` |
| Walnuesse | `nuts/walnuts.svg` |
| Cashewnuesse | `nuts/cashews.svg` |
| Pecannuesse | `nuts/pecans.svg` |
| Pistazien | `nuts/pistachios.svg` |
| Macadamia Nuesse | `nuts/macadamia-nuts.svg` |
### Fleischarten

| Icon | Datei |
| --- | --- |
| Rindfleisch | `meat/beef.svg` |
| Schweinefleisch | `meat/pork.svg` |
| Lammfleisch | `meat/lamb.svg` |
| Ziegenfleisch | `meat/goat.svg` |
| Huehnerfleisch | `meat/chicken.svg` |
| Putenfleisch | `meat/turkey.svg` |
| Entenfleisch | `meat/duck.svg` |
| Wildfleisch | `meat/game.svg` |
| Pferdefleisch | `meat/horse.svg` |
### Meerestiere

| Icon | Datei |
| --- | --- |
| Schalentiere | `seafood/shellfish.svg` |
| Tintenfisch | `seafood/squid.svg` |
| Muscheln | `seafood/mussels.svg` |
| Austern | `seafood/oysters.svg` |
| Schnecken | `seafood/snails.svg` |
| Garnelen | `seafood/shrimp.svg` |
### Weitere Lebensmittel

| Icon | Datei |
| --- | --- |
| Knoblauch | `foods/garlic.svg` |
| Zwiebel | `foods/onion.svg` |
| Lauch | `foods/leek.svg` |
| Pilze | `foods/mushrooms.svg` |
| Algen | `foods/algae.svg` |
| Mais | `foods/corn.svg` |
| Honig | `foods/honey.svg` |
| Zucker | `foods/sugar.svg` |
| Schokolade | `foods/chocolate.svg` |
| Vanille | `foods/vanilla.svg` |
| Hefe | `foods/yeast.svg` |
| Zitrusfruechte | `foods/citrus.svg` |
| Tomaten | `foods/tomatoes.svg` |
| Paprika | `foods/bell-pepper.svg` |
| Chili | `foods/chili.svg` |
| Reis | `foods/rice.svg` |
| Sojasauce | `foods/soy-sauce.svg` |
| Pflanzliches Oel | `foods/plant-oil.svg` |
| Butter | `foods/butter.svg` |
| Ananas | `foods/pineapple.svg` |
| Tomate | `foods/tomato.svg` |
