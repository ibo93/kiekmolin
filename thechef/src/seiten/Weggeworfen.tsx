// Weggeworfen.dc.html – Produkt als Bild antippen, Menge mit großen +/- oder per Sprache, speichern.
import { useState } from 'react';
import { useApp, useFehlerText, useLaden } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { wegMelden } from '../lib/abgleich.ts';
import { haptik } from '../lib/geraet.ts';
import { istNetzFehler } from '../lib/netz.ts';
import { geheZu } from '../lib/router.ts';
import { wegAnlegen, wegEntfernen } from '../lib/warteschlange.ts';
import { Fehler, KopfMitte, Laden, ProduktBild, ZahlEingabe } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';

export function WeggeworfenSeite() {
  const { t, name, einheit } = useT();
  const { api, toast, geaendert } = useApp();
  const fehlerText = useFehlerText();
  const { daten, fehler, laedt, nochmal } = useLaden(async (a) => {
    // Die Liste der letzten 60 Tage bestimmt nur die Reihenfolge – ohne Netz einfach ohne Sortierung.
    const [produkte, weg] = await Promise.all([a.produkte(), a.weggeworfen(new Date(Date.now() - 60 * 864e5).toISOString(), new Date(Date.now() + 864e5).toISOString()).catch(() => [])]);
    // Was oft weggeworfen wird, steht vorne
    const oft = new Map<string, number>();
    weg.forEach((w) => oft.set(w.produkt_id, (oft.get(w.produkt_id) ?? 0) + 1));
    return produkte.filter((p) => p.aktiv).sort((a, b) => (oft.get(b.id) ?? 0) - (oft.get(a.id) ?? 0));
  });
  const [wahl, setWahl] = useState<string | null>(null);
  const [menge, setMenge] = useState(1);
  const [speichert, setSpeichert] = useState(false);
  const [fehlerS, setFehlerS] = useState<string | null>(null);
  const p = daten?.find((x) => x.id === wahl);

  async function speichern() {
    if (!p || menge <= 0) return;
    setSpeichert(true);
    setFehlerS(null);
    // Erst aufs Handy, dann ins Netz: im Kühlhaus ohne Empfang geht nichts verloren.
    const lokal = { lokal_id: crypto.randomUUID(), zeitpunkt: new Date().toISOString() };
    const gemerkt = await wegAnlegen({ ...lokal, produkt_id: p.id, menge }).then(() => true, () => false);
    try {
      await api.wegwerfen(p.id, menge, gemerkt ? lokal : undefined);
      if (gemerkt) await wegEntfernen(lokal.lokal_id).catch(() => {});
      toast(t('weg.gespeichert'));
    } catch (e) {
      if (!(gemerkt && istNetzFehler(e))) {
        if (gemerkt) await wegEntfernen(lokal.lokal_id).catch(() => {});
        setFehlerS(fehlerText(e));
        setSpeichert(false);
        return;
      }
      toast(t('weg.offline'));
    }
    await wegMelden();
    haptik(30);
    geaendert();
    setSpeichert(false);
    geheZu('/m', true);
  }

  return (
    <main className="seite ohne-nav">
      <KopfMitte titel={t('mitarbeiter.weggeworfen')} ziel="/m" />
      <h1 className="titel einblenden" style={{ fontSize: 28 }}>{t('weg.frage')}</h1>
      {laedt && !daten && <Laden />}
      {fehler != null && <Fehler fehler={fehler} nochmal={nochmal} />}
      <div className="raster-3 einblenden">
        {daten?.map((x) => (
          <button key={x.id} className="produkt-wahl" aria-pressed={wahl === x.id} onClick={() => { setWahl(x.id); setMenge(1); }}>
            <ProduktBild produkt={x} groesse="gross" />
            <span>{name(x.namen)}</span>
          </button>
        ))}
      </div>
      {p && (
        <div className="stapel einblenden">
          <h2 className="abschnitt">{t('weg.wie_viel')}</h2>
          <ZahlEingabe wert={menge} setWert={setMenge} einheit={einheit(p.zaehleinheit, menge)} />
          {fehlerS && <div className="meldung fehler" role="alert"><Icon name="warnung" />{fehlerS}</div>}
          <button className="knopf-haupt" disabled={speichert || menge <= 0} onClick={speichern}>
            {speichert ? <span className="laden" /> : <><Icon name="haken" groesse={24} strich={2.6} /> {t('allg.speichern')}</>}
          </button>
        </div>
      )}
    </main>
  );
}
