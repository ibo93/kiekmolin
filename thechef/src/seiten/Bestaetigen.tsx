// Rueckfrage.dc.html + Bestaetigen.dc.html
//
// 1. Wo die KI unsicher war: KURZE FRAGE, eine nach der anderen.
// 2. Kachel-Raster mit Ausschnitt aus dem Foto, Menge, Plakette. Tippen = ändern.
// 3. Ein Tipp: "Alles richtig – speichern".
//
// Genauigkeits-Test (Einstellung des Chefs): Der Mitarbeiter sieht die
// KI-Zahl NICHT und zählt selbst – sonst misst man nur, wie oft jemand
// "stimmt schon" tippt.
import { useMemo, useState } from 'react';
import { anzeigeMenge, tageZwischen, tagIn } from '../../supabase/functions/_shared/logik/lager.ts';
import type { Erkennung, Produkt } from '../../supabase/functions/_shared/logik/typen.ts';
import { useApp, useFehlerText, useIch, useLaden } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { haptik } from '../lib/geraet.ts';
import { geheZu } from '../lib/router.ts';
import { alleScans, scanEntfernen } from '../lib/warteschlange.ts';
import { Fehler, Laden, MhdPlakette, ProduktBild, Sheet, ZahlEingabe } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';

/** Unter diesem Wert fragt die App nach, statt zu raten. */
export const SICHER_AB = 0.75;

type Posten = {
  produkt: Produkt;
  erkannt: number | null; // null = von Hand dazu
  anzahl: number | null; // null = noch nicht gezählt (Test-Modus)
  sicherheit: number;
  mhd: string | null;
  box: Erkennung['box'];
  fotoId: string | null;
  geprueft: boolean;
  unsicher: boolean; // "Weiß ich nicht"
};

export function Bestaetigen({ scanId }: { scanId: string }) {
  const { t, name, einheit, zahl, menge } = useT();
  const { api, geaendert } = useApp();
  const { betrieb } = useIch();
  const fehlerText = useFehlerText();
  const test = betrieb.genauigkeitstest;
  const heute = tagIn(betrieb.zeitzone);

  const { daten, fehler, laedt, nochmal } = useLaden(async (a) => {
    const [erk, fotos, produkte, scans] = await Promise.all([a.erkennungen(scanId), a.scanFotos(scanId), a.produkte(), a.scansSeit(new Date(Date.now() - 7 * 864e5).toISOString())]);
    return { erk, fotos, produkte, scan: scans.find((s) => s.id === scanId) ?? null };
  }, [scanId]);

  const [posten, setPosten] = useState<Posten[] | null>(null);
  const [frageNr, setFrageNr] = useState(0);
  const [bearbeiten, setBearbeiten] = useState<number | null>(null);
  const [hinzu, setHinzu] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [speicherFehler, setSpeicherFehler] = useState<string | null>(null);

  // Erkennungen → Posten (je Produkt summiert, bei mehreren Fotos)
  const start = useMemo(() => {
    if (!daten) return null;
    const m = new Map<string, Posten>();
    for (const e of daten.erk) {
      const p = daten.produkte.find((x) => x.id === e.produkt_id);
      if (!p) continue;
      const alt = m.get(p.id);
      if (alt) {
        alt.erkannt = (alt.erkannt ?? 0) + e.anzahl_erkannt;
        alt.anzahl = test ? null : alt.erkannt;
        alt.sicherheit = Math.min(alt.sicherheit, e.sicherheit);
        if (e.mhd && (!alt.mhd || e.mhd < alt.mhd)) alt.mhd = e.mhd;
      } else {
        m.set(p.id, {
          produkt: p, erkannt: e.anzahl_erkannt, anzahl: test ? null : e.anzahl_erkannt, sicherheit: e.sicherheit, mhd: e.mhd,
          box: e.box, fotoId: e.scan_foto_id, geprueft: false, unsicher: false,
        });
      }
    }
    return [...m.values()];
  }, [daten, test]);
  const liste = posten ?? start ?? [];
  const fragen = test ? [] : liste.map((p, i) => ({ p, i })).filter(({ p }) => p.sicherheit < SICHER_AB && !p.geprueft);
  const frage = fragen[0] && frageNr >= 0 ? fragen[0] : null;

  if (laedt && !daten) return <Laden />;
  if (fehler) return <main className="seite ohne-nav"><Fehler fehler={fehler} nochmal={nochmal} /></main>;
  if (daten?.scan?.status === 'bestaetigt') {
    return <main className="seite ohne-nav"><div className="meldung ok"><Icon name="haken" />{t('bestaetigen.schon_gespeichert')}</div><a className="knopf-haupt" href="#/m">{t('allg.weiter')}</a></main>;
  }

  const fotoUrl = (id: string | null) => daten?.fotos.find((f) => f.id === id)?.url ?? daten?.fotos[0]?.url ?? null;
  function aendern(i: number, p: Partial<Posten>) {
    setPosten(liste.map((x, j) => (j === i ? { ...x, ...p } : x)));
  }

  async function speichern() {
    if (liste.some((p) => p.anzahl == null)) return;
    setSpeichert(true);
    setSpeicherFehler(null);
    try {
      const r = await api.scanBestaetigen(scanId, liste.map((p) => ({ produkt_id: p.produkt.id, anzahl: p.anzahl!, mhd: p.mhd })));
      // Lokale Kopie wird nicht mehr gebraucht (das Geisterbild bleibt extra gespeichert)
      const lokal = (await alleScans().catch(() => [])).find((s) => s.scan_id === scanId);
      if (lokal) await scanEntfernen(lokal.lokal_id).catch(() => {});
      haptik(30);
      // Hinweise/Push an den Chef – ein Fehler hier darf das Speichern nicht rückgängig wirken lassen, wird aber gezeigt.
      api.nachScan(scanId).catch((e) => console.error('nach-scan', e));
      geaendert();
      geheZu(`/gespeichert/${scanId}/${r.produkte}`, true);
    } catch (e) {
      setSpeicherFehler(fehlerText(e));
    } finally {
      setSpeichert(false);
    }
  }

  // ─── Rückfrage (eine nach der anderen)
  const hinweise = daten?.scan?.erkennung_hinweise ?? { bildqualitaet: [], unbekannt: [] };
  const nochFoto = `#/scan/${daten?.scan?.bereich_id ?? ''}`;
  const qualitaet = hinweise.bildqualitaet.map((p) => (
    <div key={p} className="meldung warnung" role="status"><Icon name="warnung" />
      <div>{t(`bestaetigen.qualitaet_${p}`)}{' '}<a href={nochFoto} style={{ fontWeight: 700 }}>{t('bestaetigen.noch_foto')}</a></div>
    </div>
  ));

  if (frage) {
    const p = frage.p;
    const g = Math.round(p.anzahl ?? 0);
    const vorschlaege = [g - 2, g - 1, g, g + 1, g + 2].filter((x) => x >= 0).slice(0, 5);
    return (
      <main className="rueckfrage">
        <div className="rueckfrage-bild">
          <ProduktBild produkt={p.produkt} url={fotoUrl(p.fotoId)} box={p.box} groesse="gross" />
        </div>
        <div className="rueckfrage-blatt">
          <div className="griff" />
          {qualitaet}
          <div>
            <div className="etikett" style={{ color: 'var(--akzent)' }}>{t('rueckfrage.kurze_frage')}{fragen.length > 1 && ` · ${frageNr + 1}/${fragen.length + frageNr}`}</div>
            <h1 style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1.2 }}>
              {t('rueckfrage.wie_viele', { einheit: einheit(p.produkt.zaehleinheit, 2), produkt: name(p.produkt.namen) })}
            </h1>
          </div>
          <ZahlEingabe wert={p.anzahl ?? 0} setWert={(n) => aendern(frage.i, { anzahl: n })} einheit={einheit(p.produkt.zaehleinheit, p.anzahl ?? 0)} vorschlaege={vorschlaege} />
          <div className="fuss-knoepfe">
            <button className="knopf-haupt" onClick={() => { aendern(frage.i, { geprueft: true, sicherheit: 1 }); setFrageNr((n) => n + 1); }}>{t('allg.weiter')}</button>
            <button className="knopf leise" onClick={() => { aendern(frage.i, { geprueft: true, unsicher: true }); setFrageNr((n) => n + 1); }}>{t('rueckfrage.weiss_nicht')}</button>
          </div>
        </div>
      </main>
    );
  }

  const offen = liste.filter((p) => p.anzahl == null).length;
  const b = bearbeiten != null ? liste[bearbeiten] : null;

  return (
    <main className="seite ohne-nav" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 170px)' }}>
      <div className="einblenden" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px' }}>
        <h1 className="titel" style={{ fontSize: 32 }}>{test ? t('bestaetigen.test_titel') : t('bestaetigen.titel')}</h1>
        <div className="leise" style={{ fontSize: 16 }}>{test ? t('bestaetigen.test_unter') : t('bestaetigen.unter')}</div>
      </div>
      {liste.length === 0 && <div className="meldung warnung"><Icon name="warnung" />{t('bestaetigen.nichts_erkannt')}</div>}
      {/* Was die KI zu den Fotos gesagt hat – vorher weggeworfen (0006_scan_hinweise.sql) */}
      {qualitaet}
      {hinweise.unbekannt.length > 0 && (
        <div className="meldung info" role="status"><Icon name="funkeln" />
          {t('bestaetigen.unbekannt', { liste: hinweise.unbekannt.map((u) => u.beschreibung).join(', '), knopf: t('bestaetigen.fehlt_etwas') })}
        </div>
      )}
      <div className="raster-2 einblenden" style={{ animationDelay: '.08s' }}>
        {liste.map((p, i) => {
          const tage = p.mhd ? tageZwischen(heute, p.mhd) : null;
          const an = p.anzahl == null ? null : anzeigeMenge(p.produkt, p.anzahl);
          return (
            <button key={p.produkt.id} className="erkannt-kachel" onClick={() => setBearbeiten(i)}>
              <span style={{ position: 'relative', display: 'block' }}>
                <ProduktBild produkt={p.produkt} url={fotoUrl(p.fotoId)} box={p.box} groesse="gross" />
                <span style={{ position: 'absolute', top: 8, insetInlineEnd: 8 }}>
                  {p.unsicher ? <span className="plakette gelb">? {t('bestaetigen.unsicher')}</span> : p.erkannt == null ? <span className="plakette akzent">+ {t('bestaetigen.von_hand')}</span> : <MhdPlakette tage={tage} />}
                </span>
              </span>
              <span className="erkannt-text">
                <span style={{ fontSize: 16, fontWeight: 700 }}>{name(p.produkt.namen)}</span>
                <span className="zahl" style={{ fontSize: 22 }}>{an ? menge(an.zahl, an.einheit) : <span style={{ color: 'var(--akzent)' }}>? {t('bestaetigen.zaehlen')}</span>}</span>
              </span>
            </button>
          );
        })}
        <button className="erkannt-kachel dazu" onClick={() => setHinzu(true)}>
          <Icon name="plus" groesse={30} />
          <span style={{ fontSize: 16, fontWeight: 700 }}>{t('bestaetigen.fehlt_etwas')}</span>
        </button>
      </div>

      <div className="unten-fix">
        {speicherFehler && <div className="meldung fehler" role="alert"><Icon name="warnung" />{speicherFehler}</div>}
        <button className="knopf-haupt" disabled={speichert || offen > 0} onClick={speichern}>
          {speichert ? <span className="laden" /> : <><Icon name="haken" groesse={24} strich={2.6} /> {offen > 0 ? t('bestaetigen.noch_offen', { n: offen }) : t('bestaetigen.speichern')}</>}
        </button>
        <a className="knopf leise" href={`#/scan/${daten?.scan?.bereich_id ?? ''}`}>{t('bestaetigen.noch_foto')}</a>
      </div>

      <Sheet offen={b != null} zu={() => setBearbeiten(null)} titel={b ? name(b.produkt.namen) : ''}>
        {b && (
          <>
            <ZahlEingabe wert={b.anzahl ?? 0} setWert={(n) => aendern(bearbeiten!, { anzahl: n, unsicher: false })} einheit={einheit(b.produkt.zaehleinheit, b.anzahl ?? 0)} />
            {b.anzahl != null && anzeigeMenge(b.produkt, b.anzahl).basis && (
              <div className="leise" style={{ textAlign: 'center', fontWeight: 600 }}>≈ {menge(anzeigeMenge(b.produkt, b.anzahl).zahl, b.produkt.basiseinheit)}</div>
            )}
            <label className="feld"><span>{t('bestaetigen.mhd')}</span>
              <input className="eingabe" type="date" value={b.mhd ?? ''} onChange={(e) => aendern(bearbeiten!, { mhd: e.target.value || null })} /></label>
            <button className="knopf-haupt" onClick={() => { if (b.anzahl == null) aendern(bearbeiten!, { anzahl: 0 }); setBearbeiten(null); }}>{t('allg.fertig')}</button>
            <button className="knopf gefahr" onClick={() => { aendern(bearbeiten!, { anzahl: 0 }); setBearbeiten(null); }}>{t('bestaetigen.nicht_da', { zahl: zahl(0) })}</button>
          </>
        )}
      </Sheet>

      <Sheet offen={hinzu} zu={() => setHinzu(false)} titel={t('bestaetigen.fehlt_etwas')}>
        <div className="raster-3">
          {(daten?.produkte ?? []).filter((p) => p.aktiv && !liste.some((x) => x.produkt.id === p.id)).map((p) => (
            <button key={p.id} className="produkt-wahl" onClick={() => {
              setPosten([...liste, { produkt: p, erkannt: null, anzahl: test ? null : 1, sicherheit: 1, mhd: null, box: null, fotoId: null, geprueft: true, unsicher: false }]);
              setHinzu(false);
              setBearbeiten(liste.length);
            }}>
              <ProduktBild produkt={p} groesse="gross" />
              <span>{name(p.namen)}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </main>
  );
}
