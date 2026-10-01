// Die eine Schnittstelle zwischen Oberfläche und Daten.
// Zwei Umsetzungen: supabase.ts (echt) und demo.ts (ohne Server, zum Anschauen).
// Die Oberfläche kennt nur diese Datei.
import type { Antwort } from '../../supabase/functions/_shared/logik/antwort.ts';
import type {
  Bereich, BestandZeile, Betrieb, Briefing, EinkaufEintrag, Erkennung, Hinweis, Namen, Nutzer,
  Position, Produkt, Scan, Sprache, Weggeworfen,
} from '../../supabase/functions/_shared/logik/typen.ts';

export type Sitzung =
  | { art: 'fertig'; nutzer: Nutzer; betrieb: Betrieb }
  /** angemeldet, aber noch keinem Betrieb zugeordnet (Chef direkt nach der Registrierung) */
  | { art: 'ohne_betrieb'; email: string | null };

export type LokalerScan = { lokal_id: string; bereich_id: string; aufgenommen_am: string };
export type LokalesFoto = { id: string; position_id: string | null; blob: Blob; breite: number; hoehe: number; aufgenommen_am: string };

export type ScanFoto = { id: string; position_id: string | null; url: string | null; breite: number | null; hoehe: number | null };

export type AssistentAntwort = Antwort & { verworfen?: boolean; id?: string };

export type Kosten = { art: string; kosten_eur: number; tokens_ein: number; tokens_aus: number; zeitpunkt: string; betrieb_id: string | null; modell: string };
export type GenauigkeitsZeile = { scan_id: string; produkt_id: string; erkannt: number; bestaetigt: number; sicherheit: number; zeitpunkt: string; von_hand: boolean };

export interface Api {
  readonly demo: boolean;

  // Sitzung
  sitzung(): Promise<Sitzung | null>;
  anmelden(email: string, passwort: string): Promise<void>;
  registrieren(email: string, passwort: string): Promise<{ mailBestaetigen: boolean }>;
  abmelden(): Promise<void>;
  betriebAnlegen(name: string, nutzername: string, sprache: Sprache): Promise<void>;
  beitreten(code: string, name: string, sprache: Sprache): Promise<void>;
  einladungErstellen(): Promise<string>;
  profilAendern(p: Partial<Pick<Nutzer, 'name' | 'sprache' | 'darstellung' | 'push_an'>>): Promise<void>;
  betriebAendern(p: Partial<Omit<Betrieb, 'id'>>): Promise<void>;
  team(): Promise<Nutzer[]>;
  teamEntfernen(id: string): Promise<void>;

  // Einrichtung
  bereiche(): Promise<Bereich[]>;
  bereichSpeichern(b: Partial<Bereich> & { namen: Namen }): Promise<Bereich>;
  bereichLoeschen(id: string): Promise<void>;
  positionen(): Promise<Position[]>;
  positionSpeichern(p: Partial<Position> & { bereich_id: string; namen: Namen }, foto?: Blob): Promise<Position>;
  positionLoeschen(id: string): Promise<void>;
  produkte(): Promise<Produkt[]>;
  produktSpeichern(p: Partial<Produkt> & { namen: Namen }, foto?: Blob): Promise<Produkt>;
  produktLoeschen(id: string): Promise<void>;
  namenVorschlagen(name: string, von: Sprache): Promise<Namen>;
  bildUrl(pfad: string): Promise<string | null>;

  // Scan
  scansSeit(iso: string): Promise<Scan[]>;
  /** Legt den Scan an (idempotent über lokal_id) und lädt die Fotos hoch. */
  scanHochladen(scan: LokalerScan, fotos: LokalesFoto[]): Promise<string>;
  erkennen(scanId: string): Promise<void>;
  erkennungen(scanId: string): Promise<Erkennung[]>;
  scanFotos(scanId: string): Promise<ScanFoto[]>;
  letztesFotoUrl(positionId: string): Promise<string | null>;
  scanBestaetigen(
    scanId: string,
    positionen: Array<{ produkt_id: string; anzahl: number; mhd: string | null }>,
  ): Promise<{ produkte: number }>;
  nachScan(scanId: string): Promise<void>;

  // Bestand
  bestand(): Promise<BestandZeile[]>;
  /** Verlauf eines Produkts – Grundlage für Verbrauch und Mindestbestand-Vorschlag. */
  produktVerlauf(produktId: string, seitIso: string): Promise<{ bestand: Array<{ bereich_id: string; menge_einheiten: number; zeitpunkt: string }>; weggeworfen: Array<{ menge_einheiten: number; zeitpunkt: string }> }>;
  weggeworfen(vonIso: string, bisIso: string): Promise<Weggeworfen[]>;
  /** lokal: aus der Offline-Warteschlange – mit eigener Kennung und dem Zeitpunkt auf dem Handy. */
  wegwerfen(produktId: string, menge: number, lokal?: { lokal_id: string; zeitpunkt: string }): Promise<void>;
  einkaufEintraege(datum: string): Promise<EinkaufEintrag[]>;
  einkaufSetzen(e: EinkaufEintrag): Promise<void>;

  // Assistent
  fragen(frage: string, sprache: Sprache): Promise<AssistentAntwort>;
  verlauf(): Promise<Array<{ frage: string; antwort: AssistentAntwort; zeitpunkt: string }>>;
  briefing(datum: string): Promise<Briefing | null>;
  tagesgericht(sprache: Sprache): Promise<{ gericht: string; grund: string } | null>;
  hinweise(): Promise<Hinweis[]>;
  hinweisErledigt(id: string): Promise<void>;
  spracheZuText(audio: Blob, sprache: Sprache, dauerSekunden?: number): Promise<{ text: string }>;
  /** Web-Push-Abo ODER – in der iPhone-App – ein Apple-Geräte-Token. */
  pushSpeichern(abo: PushAbo): Promise<void>;

  // Auswertung
  kosten(seitIso: string): Promise<Kosten[]>;
  genauigkeit(seitIso: string): Promise<GenauigkeitsZeile[]>;
}

export type PushAbo = { art: 'web'; abo: PushSubscriptionJSON } | { art: 'apns'; token: string };

/** Fehler, die der Nutzer sehen soll – nie still schlucken. */
export class DatenFehler extends Error {
  constructor(public schluessel: string, public detail?: string) {
    super(detail ? `${schluessel}: ${detail}` : schluessel);
  }
}
