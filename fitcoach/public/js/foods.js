// Eingebaute Lebensmittel-Datenbank – funktioniert komplett offline, kein API-Call.
// Werte pro 100 g (verzehrbarer Anteil), Quelle: Standard-Nährwerttabellen (BLS/USDA).
// Format: [Name, kcal, Protein g, Carbs g, Fett g, übliche Portion in g]
// Die Portion ist nur die Vorbelegung – der User passt die Menge an, alles rechnet mit.

export const FOODS = [
  // ---------- Obst ----------
  ['Apfel', 52, 0.3, 11.4, 0.2, 150],
  ['Banane', 89, 1.1, 20.0, 0.3, 120],
  ['Orange', 47, 0.9, 8.3, 0.2, 150],
  ['Mandarine', 50, 0.8, 10.1, 0.3, 80],
  ['Erdbeeren', 32, 0.7, 5.5, 0.4, 150],
  ['Himbeeren', 43, 1.3, 4.8, 0.3, 125],
  ['Blaubeeren / Heidelbeeren', 57, 0.7, 12.1, 0.3, 125],
  ['Weintrauben', 70, 0.7, 15.6, 0.3, 150],
  ['Wassermelone', 30, 0.6, 7.6, 0.2, 200],
  ['Honigmelone', 36, 0.5, 8.3, 0.1, 200],
  ['Kiwi', 61, 1.1, 10.5, 0.5, 75],
  ['Ananas', 50, 0.5, 11.6, 0.1, 150],
  ['Mango', 60, 0.8, 12.5, 0.4, 150],
  ['Birne', 57, 0.4, 12.0, 0.1, 160],
  ['Pfirsich', 39, 0.9, 8.4, 0.3, 150],
  ['Nektarine', 44, 1.1, 8.9, 0.3, 140],
  ['Pflaume', 46, 0.7, 10.0, 0.3, 60],
  ['Kirschen', 63, 1.1, 12.8, 0.2, 125],
  ['Granatapfel', 83, 1.7, 14.0, 1.2, 100],
  ['Avocado', 160, 2.0, 1.8, 14.7, 100],
  ['Zitrone', 29, 1.1, 3.2, 0.3, 60],
  ['Datteln (getrocknet)', 282, 2.5, 63.0, 0.4, 25],
  ['Rosinen', 299, 3.1, 68.0, 0.5, 30],
  ['Feige (frisch)', 74, 0.8, 16.0, 0.3, 50],

  // ---------- Gemüse & Salat ----------
  ['Tomate', 18, 0.9, 2.6, 0.2, 120],
  ['Cherrytomaten', 20, 1.0, 3.0, 0.2, 100],
  ['Gurke', 12, 0.6, 1.8, 0.1, 150],
  ['Paprika (rot)', 31, 1.0, 4.7, 0.3, 150],
  ['Zucchini', 17, 1.2, 2.2, 0.3, 200],
  ['Aubergine', 25, 1.0, 3.0, 0.2, 200],
  ['Brokkoli', 34, 2.8, 4.0, 0.4, 200],
  ['Blumenkohl', 25, 1.9, 2.7, 0.3, 200],
  ['Karotte / Möhre', 41, 0.9, 6.7, 0.2, 100],
  ['Zwiebel', 40, 1.1, 7.3, 0.1, 80],
  ['Knoblauch', 149, 6.4, 28.0, 0.5, 5],
  ['Champignons', 22, 3.1, 0.6, 0.3, 150],
  ['Spinat', 23, 2.9, 0.6, 0.4, 150],
  ['Eisbergsalat', 14, 0.9, 1.8, 0.1, 100],
  ['Kopfsalat', 15, 1.2, 1.3, 0.2, 100],
  ['Rucola', 25, 2.6, 2.1, 0.7, 50],
  ['Feldsalat', 21, 1.8, 0.7, 0.4, 75],
  ['Mais (Dose)', 81, 2.9, 14.3, 1.2, 100],
  ['Erbsen', 81, 5.4, 12.3, 0.4, 150],
  ['Grüne Bohnen', 31, 1.8, 5.0, 0.2, 200],
  ['Rote Bete', 43, 1.6, 8.4, 0.2, 100],
  ['Kürbis (Hokkaido)', 63, 1.7, 12.6, 0.5, 200],
  ['Sauerkraut', 19, 1.3, 2.4, 0.2, 150],
  ['Oliven (grün)', 145, 1.0, 3.0, 15.0, 30],
  ['Oliven (schwarz)', 185, 1.4, 4.0, 18.0, 30],
  ['Spargel', 20, 2.2, 2.0, 0.1, 300],
  ['Lauch / Porree', 31, 1.5, 5.4, 0.3, 100],
  ['Staudensellerie', 18, 0.7, 3.0, 0.2, 100],
  ['Rotkohl', 27, 1.4, 5.0, 0.2, 200],
  ['Weißkohl', 25, 1.3, 4.2, 0.2, 200],
  ['Chinakohl', 13, 1.2, 1.9, 0.2, 150],
  ['Kohlrabi', 27, 1.7, 6.2, 0.1, 150],
  ['Radieschen', 16, 0.7, 1.9, 0.1, 50],
  ['Ingwer', 80, 1.8, 15.8, 0.8, 10],

  // ---------- Kartoffeln & Beilagen ----------
  ['Kartoffeln (gekocht)', 70, 1.9, 14.8, 0.1, 250],
  ['Süßkartoffel', 86, 1.6, 20.0, 0.1, 200],
  ['Pommes frites', 312, 3.4, 41.0, 15.0, 150],
  ['Bratkartoffeln', 120, 2.0, 18.0, 4.5, 250],
  ['Kartoffelpüree', 92, 2.0, 13.0, 3.4, 250],
  ['Reis (gekocht)', 130, 2.7, 28.0, 0.3, 200],
  ['Reis (roh/trocken)', 350, 7.0, 78.0, 0.6, 75],
  ['Basmati-Reis (gekocht)', 121, 3.0, 25.0, 0.4, 200],
  ['Nudeln (gekocht)', 155, 5.5, 30.0, 0.9, 250],
  ['Nudeln (roh/trocken)', 360, 12.0, 72.0, 1.8, 100],
  ['Vollkornnudeln (gekocht)', 145, 6.0, 27.0, 1.3, 250],
  ['Couscous (gekocht)', 112, 3.8, 23.0, 0.2, 200],
  ['Bulgur (gekocht)', 110, 3.5, 22.0, 0.3, 200],
  ['Quinoa (gekocht)', 120, 4.4, 21.0, 1.9, 200],
  ['Gnocchi', 160, 4.0, 32.0, 1.0, 250],
  ['Spätzle (gekocht)', 150, 5.5, 28.0, 2.0, 250],
  ['Kartoffelknödel', 120, 2.5, 25.0, 0.8, 180],

  // ---------- Hülsenfrüchte & Vegetarisch ----------
  ['Linsen (gekocht)', 116, 9.0, 16.9, 0.4, 200],
  ['Kichererbsen (gekocht/Dose)', 130, 7.5, 18.0, 2.6, 150],
  ['Kidneybohnen (Dose)', 110, 7.7, 16.0, 0.5, 150],
  ['Hummus', 230, 7.0, 12.0, 16.0, 50],
  ['Falafel', 330, 13.0, 30.0, 17.0, 120],
  ['Tofu', 125, 13.0, 1.5, 7.5, 150],

  // ---------- Fleisch & Geflügel ----------
  ['Hähnchenbrust (roh)', 110, 23.0, 0.0, 1.2, 150],
  ['Hähnchenbrust (gegart)', 165, 31.0, 0.0, 3.6, 150],
  ['Hähnchenschenkel (mit Haut, gegart)', 232, 24.0, 0.0, 15.0, 150],
  ['Hähnchenflügel', 220, 20.0, 0.0, 15.0, 150],
  ['Putenbrust (roh)', 105, 24.0, 0.0, 1.0, 150],
  ['Rinderhack (gegart)', 250, 26.0, 0.0, 16.0, 125],
  ['Gemischtes Hack (gegart)', 265, 25.0, 0.0, 18.0, 125],
  ['Rinderfilet', 121, 21.0, 0.0, 4.0, 200],
  ['Rumpsteak', 130, 22.0, 0.0, 4.5, 200],
  ['Entrecôte / Ribeye', 190, 20.0, 0.0, 12.0, 250],
  ['Schweinefilet', 105, 22.0, 0.0, 2.0, 150],
  ['Schweineschnitzel (paniert, gebraten)', 235, 19.0, 14.0, 11.0, 180],
  ['Schnitzel (natur)', 110, 22.0, 0.0, 2.5, 180],
  ['Schweinebauch', 290, 16.0, 0.0, 25.0, 150],
  ['Kassler', 130, 20.0, 0.5, 5.5, 150],
  ['Lammkotelett', 250, 17.0, 0.0, 20.0, 150],
  ['Bratwurst', 290, 13.0, 2.0, 26.0, 120],
  ['Wiener Würstchen', 280, 12.0, 1.5, 25.0, 50],
  ['Frikadelle', 240, 14.0, 7.0, 17.0, 100],
  ['Leberkäse', 280, 12.0, 3.0, 25.0, 125],
  ['Speck / Bacon (gebraten)', 470, 34.0, 1.0, 37.0, 25],
  ['Chicken Nuggets', 260, 14.0, 15.0, 16.0, 100],
  ['Cordon bleu', 230, 16.0, 12.0, 13.0, 180],
  ['Gyros', 215, 17.0, 2.0, 16.0, 150],
  ['Köfte', 250, 16.0, 6.0, 18.0, 150],
  ['Adana Kebap', 270, 16.0, 2.0, 22.0, 150],
  ['Sucuk', 450, 19.0, 2.0, 41.0, 50],

  // ---------- Wurst & Aufschnitt ----------
  ['Salami', 370, 22.0, 1.0, 31.0, 30],
  ['Putensalami', 130, 20.0, 1.0, 5.0, 30],
  ['Kochschinken', 110, 19.0, 1.0, 3.5, 30],
  ['Roher Schinken (Serrano/Parma)', 230, 28.0, 0.5, 13.0, 30],
  ['Leberwurst', 330, 13.0, 1.0, 30.0, 30],
  ['Mortadella', 310, 13.0, 1.0, 28.0, 30],

  // ---------- Fisch & Meeresfrüchte ----------
  ['Lachs', 200, 20.0, 0.0, 13.0, 150],
  ['Räucherlachs', 180, 22.0, 0.0, 10.0, 75],
  ['Thunfisch (Dose, in Wasser)', 105, 24.0, 0.0, 1.0, 100],
  ['Thunfisch (Dose, in Öl, abgetropft)', 190, 25.0, 0.0, 10.0, 100],
  ['Forelle', 105, 20.0, 0.0, 2.7, 200],
  ['Kabeljau', 80, 18.0, 0.0, 0.7, 150],
  ['Seelachs', 82, 18.0, 0.0, 0.8, 150],
  ['Zander', 83, 19.0, 0.0, 0.7, 150],
  ['Dorade', 100, 19.0, 0.0, 2.5, 250],
  ['Fischstäbchen', 200, 12.0, 18.0, 9.0, 90],
  ['Backfisch', 190, 13.0, 14.0, 10.0, 150],
  ['Garnelen', 90, 19.0, 0.5, 1.0, 100],
  ['Matjes / Hering', 220, 16.0, 0.0, 17.0, 90],
  ['Calamari (frittiert)', 180, 13.0, 12.0, 9.0, 150],

  // ---------- Eier & Milchprodukte ----------
  ['Ei (ganz)', 140, 12.6, 0.7, 9.7, 60],
  ['Eiweiß / Eiklar', 48, 11.0, 0.7, 0.2, 33],
  ['Eigelb', 322, 16.0, 0.6, 27.0, 18],
  ['Rührei (mit Butter)', 170, 11.0, 1.0, 13.0, 120],
  ['Vollmilch 3,5 %', 64, 3.3, 4.8, 3.5, 200],
  ['Milch 1,5 %', 47, 3.4, 4.9, 1.5, 200],
  ['Hafermilch', 45, 1.0, 6.5, 1.5, 200],
  ['Mandelmilch (ungesüßt)', 13, 0.4, 0.1, 1.1, 200],
  ['Magerquark', 67, 12.0, 4.0, 0.2, 250],
  ['Quark 20 %', 109, 12.5, 2.7, 5.0, 250],
  ['Skyr', 63, 11.0, 4.0, 0.2, 150],
  ['Griechischer Joghurt 10 %', 121, 4.0, 4.0, 10.0, 150],
  ['Joghurt 3,5 %', 66, 3.9, 4.9, 3.5, 150],
  ['Joghurt 1,5 %', 49, 4.3, 4.5, 1.5, 150],
  ['Buttermilch', 37, 3.5, 4.0, 0.5, 250],
  ['Kefir', 52, 3.4, 4.1, 2.0, 250],
  ['Hüttenkäse / Körniger Frischkäse', 98, 13.0, 2.6, 4.3, 200],
  ['Sahne 30 %', 290, 2.4, 3.2, 30.0, 30],
  ['Schmand', 240, 2.8, 3.4, 24.0, 30],
  ['Crème fraîche', 290, 2.4, 2.9, 30.0, 30],
  ['Butter', 741, 0.7, 0.6, 82.0, 10],
  ['Margarine', 720, 0.2, 0.4, 80.0, 10],

  // ---------- Käse ----------
  ['Gouda 48 %', 356, 22.5, 0.0, 29.0, 30],
  ['Gouda light 30 %', 270, 29.0, 0.0, 17.0, 30],
  ['Emmentaler', 380, 29.0, 0.0, 29.0, 30],
  ['Mozzarella', 250, 18.0, 1.0, 19.0, 125],
  ['Mozzarella light', 160, 19.0, 1.0, 9.0, 125],
  ['Feta / Schafskäse', 270, 14.0, 1.0, 23.0, 50],
  ['Hirtenkäse light', 180, 15.0, 1.0, 13.0, 50],
  ['Parmesan', 400, 33.0, 0.0, 29.0, 15],
  ['Frischkäse', 250, 6.0, 3.0, 24.0, 30],
  ['Frischkäse light', 110, 9.0, 4.0, 6.0, 30],
  ['Camembert', 300, 21.0, 0.5, 24.0, 30],
  ['Halloumi', 320, 22.0, 2.0, 25.0, 100],

  // ---------- Brot & Backwaren ----------
  ['Brötchen (Weizen)', 270, 8.5, 53.0, 1.5, 55],
  ['Körnerbrötchen', 280, 10.0, 45.0, 6.0, 60],
  ['Vollkornbrot', 200, 7.0, 36.0, 1.5, 50],
  ['Roggenmischbrot / Graubrot', 220, 6.5, 44.0, 1.2, 45],
  ['Toastbrot', 250, 8.0, 47.0, 3.0, 25],
  ['Vollkorntoast', 230, 9.0, 40.0, 3.0, 25],
  ['Baguette', 270, 9.0, 53.0, 1.5, 60],
  ['Croissant', 400, 8.0, 45.0, 21.0, 65],
  ['Laugenbrezel', 215, 7.0, 44.0, 1.5, 85],
  ['Knäckebrot', 330, 10.0, 65.0, 1.5, 13],
  ['Pumpernickel', 180, 4.5, 38.0, 1.0, 50],
  ['Fladenbrot', 260, 9.0, 52.0, 1.5, 100],
  ['Wrap / Tortilla', 300, 8.0, 50.0, 7.0, 65],
  ['Zwieback', 390, 10.0, 73.0, 5.0, 10],
  ['Reiswaffel', 380, 8.0, 80.0, 3.0, 9],

  // ---------- Frühstück & Getreide ----------
  ['Haferflocken', 370, 13.5, 59.0, 7.0, 50],
  ['Müsli (ungesüßt)', 360, 10.0, 60.0, 7.0, 60],
  ['Cornflakes', 380, 7.0, 84.0, 0.9, 40],
  ['Honig', 304, 0.3, 75.0, 0.0, 20],
  ['Nutella / Nuss-Nougat-Creme', 539, 6.0, 57.0, 31.0, 20],
  ['Marmelade', 250, 0.3, 60.0, 0.1, 20],
  ['Erdnussbutter', 600, 26.0, 12.0, 50.0, 20],
  ['Mandelmus', 620, 22.0, 5.0, 56.0, 20],

  // ---------- Nüsse & Samen ----------
  ['Mandeln', 590, 21.0, 5.5, 52.0, 25],
  ['Walnüsse', 670, 15.0, 6.0, 65.0, 25],
  ['Cashews', 570, 18.0, 27.0, 44.0, 25],
  ['Erdnüsse', 580, 26.0, 8.0, 48.0, 25],
  ['Haselnüsse', 640, 14.0, 6.0, 62.0, 25],
  ['Pistazien', 580, 21.0, 15.0, 48.0, 25],
  ['Chiasamen', 450, 17.0, 5.0, 31.0, 15],
  ['Leinsamen', 480, 22.0, 3.0, 36.0, 15],
  ['Sonnenblumenkerne', 580, 21.0, 12.0, 49.0, 20],
  ['Kürbiskerne', 560, 30.0, 5.0, 46.0, 20],
  ['Sesam', 570, 18.0, 10.0, 50.0, 10],
  ['Kokosraspeln', 660, 6.0, 8.0, 64.0, 15],

  // ---------- Öle, Saucen & Dips ----------
  ['Olivenöl', 884, 0.0, 0.0, 100.0, 10],
  ['Rapsöl', 884, 0.0, 0.0, 100.0, 10],
  ['Kokosöl', 890, 0.0, 0.0, 100.0, 10],
  ['Mayonnaise', 720, 1.0, 2.0, 79.0, 20],
  ['Mayonnaise light', 260, 1.0, 9.0, 24.0, 20],
  ['Ketchup', 100, 1.2, 22.0, 0.2, 20],
  ['Senf', 90, 6.0, 6.0, 4.0, 10],
  ['BBQ-Sauce', 160, 1.0, 38.0, 0.3, 20],
  ['Tzatziki', 110, 4.0, 3.0, 9.0, 50],
  ['Joghurtsauce (Döner)', 130, 3.0, 5.0, 11.0, 40],
  ['Knoblauchsauce', 330, 1.5, 6.0, 33.0, 40],
  ['Sojasauce', 60, 8.0, 6.0, 0.0, 10],
  ['Pesto', 460, 5.0, 6.0, 45.0, 30],
  ['Tomatensauce', 50, 1.5, 7.0, 1.5, 150],
  ['Bolognese-Sauce', 110, 7.0, 6.0, 6.5, 200],
  ['Sahnesauce', 150, 2.0, 5.0, 13.0, 100],
  ['Guacamole', 150, 2.0, 6.0, 13.0, 50],
  ['Balsamico', 90, 0.5, 17.0, 0.0, 10],
  ['Zucker', 405, 0.0, 100.0, 0.0, 5],
  ['Ahornsirup', 260, 0.0, 67.0, 0.0, 20],

  // ---------- Süßes, Snacks & Gebäck ----------
  ['Milchschokolade', 535, 7.0, 57.0, 30.0, 25],
  ['Zartbitterschokolade 85 %', 580, 9.0, 19.0, 46.0, 25],
  ['Gummibärchen', 340, 7.0, 77.0, 0.2, 30],
  ['Chips', 530, 6.0, 50.0, 33.0, 50],
  ['Salzstangen', 380, 9.0, 78.0, 3.0, 30],
  ['Popcorn (süß)', 400, 6.0, 70.0, 10.0, 50],
  ['Butterkekse', 470, 7.0, 70.0, 17.0, 25],
  ['Donut', 420, 6.0, 49.0, 22.0, 70],
  ['Muffin', 400, 5.0, 50.0, 20.0, 110],
  ['Brownie', 450, 5.0, 55.0, 24.0, 70],
  ['Berliner / Krapfen', 350, 6.0, 48.0, 15.0, 75],
  ['Waffel', 300, 7.0, 38.0, 14.0, 75],
  ['Pfannkuchen', 220, 6.0, 26.0, 10.0, 100],
  ['Vanilleeis', 200, 3.5, 23.0, 11.0, 75],
  ['Magnum / Eis am Stiel', 330, 4.0, 33.0, 20.0, 80],
  ['Apfelkuchen', 240, 3.0, 34.0, 10.0, 120],
  ['Käsekuchen', 320, 9.0, 30.0, 18.0, 120],
  ['Tiramisu', 290, 5.0, 32.0, 16.0, 125],
  ['Milchreis', 120, 3.5, 21.0, 2.5, 200],
  ['Pudding', 110, 3.0, 18.0, 3.0, 125],
  ['Proteinriegel', 360, 30.0, 35.0, 12.0, 55],
  ['Müsliriegel', 420, 6.0, 65.0, 14.0, 30],
  ['Whey-Protein (Pulver)', 380, 78.0, 6.0, 5.0, 30],

  // ---------- Getränke ----------
  ['Cola', 42, 0.0, 10.6, 0.0, 330],
  ['Cola Zero / light', 0, 0.0, 0.0, 0.0, 330],
  ['Fanta / Limonade', 39, 0.0, 9.5, 0.0, 330],
  ['Apfelsaft', 46, 0.1, 11.0, 0.1, 200],
  ['Orangensaft', 45, 0.7, 10.0, 0.2, 200],
  ['Apfelschorle', 25, 0.0, 6.0, 0.0, 300],
  ['Eistee', 30, 0.0, 7.0, 0.0, 330],
  ['Energy Drink', 45, 0.0, 11.0, 0.0, 250],
  ['Energy Drink (zuckerfrei)', 3, 0.0, 0.0, 0.0, 250],
  ['Alkoholfreies Bier (0,0 %)', 25, 0.4, 5.0, 0.0, 500],
  ['Kokoswasser', 19, 0.7, 3.7, 0.2, 330],
  ['Ayran', 38, 1.7, 2.8, 2.0, 250],
  ['Latte Macchiato (Vollmilch)', 55, 3.0, 4.5, 2.8, 250],
  ['Cappuccino', 35, 1.7, 3.0, 1.7, 180],
  ['Kaffee (schwarz)', 1, 0.1, 0.0, 0.0, 200],
  ['Kakao', 85, 3.5, 12.0, 3.0, 250],
  ['Smoothie (Frucht)', 55, 0.6, 12.0, 0.3, 250],

  // ---------- Fitness & High Protein ----------
  ['Harzer Käse', 126, 30.0, 0.0, 0.7, 50],
  ['Eiweißbrot', 250, 22.0, 9.0, 13.0, 40],
  ['High-Protein-Pudding', 80, 10.0, 8.5, 1.5, 200],
  ['High-Protein-Joghurt', 68, 10.0, 5.0, 0.3, 200],
  ['Proteinshake (Fertigdrink)', 64, 10.0, 4.0, 1.0, 250],
  ['Casein-Protein (Pulver)', 370, 75.0, 8.0, 2.0, 30],
  ['Beef Jerky', 270, 50.0, 8.0, 4.0, 25],
  ['Putenbrust-Aufschnitt', 100, 20.0, 1.5, 1.5, 30],
  ['Hähnchenbrust-Aufschnitt', 105, 20.0, 1.0, 2.0, 30],
  ['Tatar / Mageres Rinderhack 5 %', 115, 21.0, 0.0, 3.5, 125],
  ['Thunfischsteak (frisch)', 110, 24.0, 0.0, 1.0, 150],
  ['Edamame (gegart)', 125, 12.0, 7.0, 5.0, 100],
  ['Seitan', 144, 28.0, 4.0, 1.5, 150],
  ['Tempeh', 195, 19.0, 9.0, 11.0, 150],
  ['Vollkornreis / Naturreis (gekocht)', 124, 2.6, 25.5, 1.0, 200],
  ['Hirse (gekocht)', 114, 3.5, 22.0, 1.0, 200],
  ['Haferkleie', 350, 17.0, 50.0, 7.0, 20],
  ['Grünkohl', 45, 4.3, 2.5, 0.9, 150],
  ['Pak Choi', 13, 1.5, 1.2, 0.2, 150],
  ['Apfelmus (ungesüßt)', 50, 0.2, 11.5, 0.2, 100],
  ['Magermilch 0,1 %', 35, 3.5, 5.0, 0.1, 200],
  ['Sojajoghurt (ungesüßt)', 50, 4.0, 2.5, 2.5, 150],
  ['Griechischer Joghurt 2 %', 73, 6.5, 4.0, 2.0, 150],

  // ---------- Fast Food, Imbiss & Gerichte ----------
  ['Döner Kebab (Tasche)', 215, 12.0, 19.0, 10.0, 350],
  ['Hähnchendöner', 200, 15.0, 18.0, 8.0, 350],
  ['Dürüm Döner', 220, 11.0, 22.0, 9.0, 450],
  ['Lahmacun', 230, 10.0, 30.0, 8.0, 160],
  ['Pide mit Käse', 250, 10.0, 32.0, 9.0, 300],
  ['Börek (Sigara)', 290, 9.0, 28.0, 16.0, 100],
  ['Menemen', 110, 6.0, 4.0, 8.0, 300],
  ['Currywurst mit Soße', 270, 10.0, 10.0, 21.0, 200],
  ['Pizza Margherita', 250, 11.0, 30.0, 10.0, 350],
  ['Pizza Salami', 270, 12.0, 28.0, 13.0, 380],
  ['Pizza Funghi', 230, 10.0, 28.0, 9.0, 400],
  ['Pizzabrötchen', 290, 8.0, 45.0, 8.0, 30],
  ['Hamburger', 250, 13.0, 26.0, 10.0, 110],
  ['Cheeseburger', 263, 15.0, 25.0, 12.0, 120],
  ['Big Mac', 257, 12.0, 19.0, 14.0, 219],
  ['Chicken Burger', 230, 12.0, 27.0, 8.0, 180],
  ['Spaghetti Bolognese', 140, 7.0, 17.0, 4.5, 400],
  ['Spaghetti Carbonara', 180, 7.0, 18.0, 8.5, 400],
  ['Lasagne', 150, 8.0, 12.0, 7.5, 400],
  ['Sushi (Maki, gemischt)', 145, 4.5, 28.0, 1.5, 200],
  ['Sushi (Nigiri Lachs)', 150, 7.0, 24.0, 2.5, 150],
  ['Frühlingsrolle', 190, 5.0, 22.0, 9.0, 80],
  ['Gebratener Reis', 165, 4.5, 25.0, 5.0, 350],
  ['Gebratene Nudeln', 175, 5.0, 24.0, 6.5, 350],
  ['Ente süß-sauer', 180, 12.0, 14.0, 8.5, 350],
  ['Hähnchen-Curry', 130, 10.0, 7.0, 7.0, 400],
  ['Chili con Carne', 110, 8.0, 9.0, 4.5, 400],
  ['Gulasch', 110, 12.0, 3.0, 5.5, 350],
  ['Kartoffelsalat (mit Mayo)', 145, 2.0, 13.0, 9.0, 200],
  ['Nudelsalat', 180, 4.0, 18.0, 10.0, 200],
  ['Krautsalat', 90, 1.0, 8.0, 6.0, 150],
  ['Caesar Salad', 130, 7.0, 6.0, 8.5, 300],
  ['Griechischer Salat', 105, 4.0, 4.0, 8.0, 300],
  ['Linsensuppe', 60, 3.5, 8.0, 1.5, 400],
  ['Tomatensuppe', 45, 1.5, 6.0, 1.8, 400],
  ['Kürbissuppe', 55, 1.5, 7.0, 2.5, 400],
  ['Hühnersuppe', 50, 4.0, 4.0, 2.0, 400],
  ['Erbsensuppe', 70, 4.5, 8.0, 2.2, 400],
];

// ---------- Suche ----------

// Umlaute & Akzente normalisieren, damit "musli" auch "Müsli" findet
function norm(s) {
  return s.toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Vorberechnete Suchnamen (einmalig beim Laden)
const INDEX = FOODS.map((f) => norm(f[0]));

// Liefert die besten Treffer: jedes Suchwort muss vorkommen,
// Treffer am Wortanfang werden zuerst gelistet.
export function sucheLebensmittel(query, max = 8) {
  const teile = norm(query.trim()).split(/\s+/).filter(Boolean);
  if (!teile.length) return [];
  const treffer = [];
  for (let i = 0; i < INDEX.length; i++) {
    const name = INDEX[i];
    if (!teile.every((t) => name.includes(t))) continue;
    // Rang: 0 = exaktes erstes Wort ("ei" → "Ei (ganz)", nicht "Eisbergsalat"),
    // 1 = Name beginnt mit dem Suchwort, 2 = Wortanfang mittendrin, 3 = sonst
    const erstesWort = name.split(/[\s(/]/)[0];
    const rang = erstesWort === teile[0] ? 0
      : name.startsWith(teile[0]) ? 1
      : new RegExp(`(^|[\\s(/-])${teile[0]}`).test(name) ? 2 : 3;
    treffer.push({ rang, i });
  }
  treffer.sort((a, b) => a.rang - b.rang || a.i - b.i);
  return treffer.slice(0, max).map(({ i }) => {
    const [name, kcal, protein, carbs, fett, portion] = FOODS[i];
    return { name, kcal, protein, carbs, fett, portion };
  });
}

// Nährwerte für eine bestimmte Menge berechnen (Basis: pro 100 g)
export function naehrwerteFuer(food, gramm) {
  const faktor = gramm / 100;
  return {
    kalorien: Math.round(food.kcal * faktor),
    protein_g: Math.round(food.protein * faktor * 10) / 10,
    carbs_g: Math.round(food.carbs * faktor * 10) / 10,
    fett_g: Math.round(food.fett * faktor * 10) / 10,
  };
}
