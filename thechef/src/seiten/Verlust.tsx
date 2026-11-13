// Verlust.dc.html – Weggeworfen im Monat: Betrag, Vergleich zum Vormonat, größte Verluste als Balken, Tipp vom Assistenten.
import { useState } from 'react';
import type { AssistentAntwort } from '../daten/api.ts';
import { useApp, useFehlerText, useLaden } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { Fehler, KopfMitte, Laden, ProduktBild } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';

export function VerlustSeite() {
  const { t, name, geld, monat, sprache } = useT();
  const { api } = useApp();
  const fehlerText = useFehlerText();
  const jetzt = new Date();
  const anfang = new Date(jetzt.getFullYear(), jetzt.getMonth(), 1);
  const vorher = new Date(jetzt.getFullYear(), jetzt.getMonth() - 1, 1);
  const { daten, fehler, laedt, nochmal } = useLaden(async (a) => {
    const [produkte, diesen, letzten] = await Promise.all([
      a.produkte(), a.weggeworfen(anfang.toISOString(), new Date(Date.now() + 864e5).toISOString()), a.weggeworfen(vorher.toISOString(), anfang.toISOString()),
    ]);
    const summe = (l: typeof diesen) => l.reduce((s, w) => s + (w.wert_eur ?? 0), 0);
    const jeProdukt = new Map<string, number>();
    diesen.forEach((w) => jeProdukt.set(w.produkt_id, (jeProdukt.get(w.produkt_id) ?? 0) + (w.wert_eur ?? 0)));
    const top = [...jeProdukt.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([id, eur]) => ({ p: produkte.find((x) => x.id === id)!, eur })).filter((x) => x.p);
    return { summe: summe(diesen), vormonat: summe(letzten), top, ohneWert: diesen.filter((w) => w.wert_eur == null).length };
  });
  const [tipp, setTipp] = useState<AssistentAntwort | 'laedt' | string | null>(null);

  async function tippHolen() {
    setTipp('laedt');
    try { setTipp(await api.fragen(t('verlust.tipp_frage'), sprache)); } catch (e) { setTipp(fehlerText(e)); }
  }
  if (laedt && !daten) return <Laden />;
  const diff = daten ? daten.summe - daten.vormonat : 0;
  const max = Math.max(1, ...(daten?.top.map((x) => x.eur) ?? [1]));

  return (
    <main className="seite ohne-nav">
      <KopfMitte titel={t('mitarbeiter.weggeworfen')} ziel="/c" />
      {fehler != null && <Fehler fehler={fehler} nochmal={nochmal} />}
      <div className="leise einblenden" style={{ fontSize: 15, fontWeight: 700, padding: '0 4px' }}>{monat(jetzt.getMonth() + 1, jetzt.getFullYear())}</div>
      <div className="karte einblenden" style={{ gap: 4 }}>
        <span className="leise" style={{ fontSize: 14, fontWeight: 700 }}>{t('verlust.wert')}</span>
        <span className="zahl" style={{ fontSize: 56, lineHeight: 1.05, color: 'var(--rot-text)' }}>{geld(daten?.summe ?? 0)}</span>
        {daten && daten.vormonat > 0 && (
          <span style={{ fontSize: 15, fontWeight: 700, color: diff <= 0 ? 'var(--gruen-text)' : 'var(--rot-text)' }}>
            {diff <= 0 ? '↓' : '↑'} {t('verlust.vergleich', { betrag: geld(Math.abs(diff)), monat: monat(vorher.getMonth() + 1) })}
          </span>
        )}
        {daten && daten.ohneWert > 0 && <span className="leise" style={{ fontSize: 13 }}>{t('verlust.ohne_preis', { n: daten.ohneWert })}</span>}
      </div>
      {daten && daten.top.length > 0 && (
        <section className="karte einblenden" style={{ animationDelay: '.06s' }}>
          <strong style={{ fontSize: 18 }}>{t('verlust.am_meisten')}</strong>
          {daten.top.map(({ p, eur }) => (
            <div key={p.id} className="reihe" style={{ gap: 12 }}>
              <ProduktBild produkt={p} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="reihe" style={{ justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>{name(p.namen)}</span><span className="zahl">{geld(eur)}</span></div>
                <div style={{ height: 10, borderRadius: 5, background: 'var(--flaeche)' }}>
                  <div style={{ width: `${(eur / max) * 100}%`, height: 10, borderRadius: 5, background: 'var(--rot)' }} />
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
      <div className="dunkelkarte einblenden" style={{ animationDelay: '.1s' }}>
        <span className="icon-rund"><Icon name="funkeln" groesse={18} /></span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          <span className="etikett">{t('verlust.tipp')}</span>
          {tipp == null && <button className="knopf" style={{ alignSelf: 'flex-start', background: 'var(--dunkelkarte-fl)', color: '#fff' }} onClick={tippHolen}>{t('verlust.tipp_holen')}</button>}
          {tipp === 'laedt' && <span style={{ opacity: 0.7 }}>…</span>}
          {typeof tipp === 'string' && tipp !== 'laedt' && <span style={{ opacity: 0.85 }}>{tipp}</span>}
          {tipp && typeof tipp === 'object' && <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>{tipp.satz} {tipp.text}</span>}
        </span>
      </div>
    </main>
  );
}
