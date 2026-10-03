/**
 * Kein Netz – oder ein echter Fehler? Nur das Erste darf in eine Warteschlange
 * oder auf alten Speicher ausweichen. Ein echter Fehler (z. B. RLS) muss sichtbar
 * werden, sonst sieht er aus wie "alles gut" (CLAUDE.md, Regel 6).
 * Safari meldet "Load failed", Chrome "Failed to fetch", Firefox "NetworkError".
 */
export function istNetzFehler(e: unknown): boolean {
  return !navigator.onLine || /Failed to fetch|NetworkError|Load failed|network/i.test(String((e as Error)?.message ?? e));
}
