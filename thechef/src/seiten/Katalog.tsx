// Einrichtung der Stammdaten: Bereiche, Foto-Positionen (mit Referenzfoto), Produktkatalog.
// Wird aus der geführten Einrichtung UND aus den Einstellungen benutzt.
import { useEffect, useRef, useState } from 'react';
import type { Basiseinheit, Bereich, Kategorie, Namen, Position, Produkt, Sprache, Zaehleinheit } from '../../supabase/functions/_shared/logik/typen.ts';
import { mindestbestandVorschlag, REICHWEITE_TAGE, verbrauchSchaetzen } from '../../supabase/functions/_shared/logik/verbrauch.ts';
import { useApp, useFehlerText, useLaden } from '../app/kontext.tsx';
import { SPRACHEN, useT } from '../i18n/i18n.tsx';
import { KATALOG_KANTE, verkleinern } from '../lib/bild.ts';
import { Fehler, KopfMitte, Laden, ProduktBild, Sheet } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';

/** Sinnvolle Vorschläge für die Haltbarkeit je Kategorie (Tage) – pro Produkt änderbar. */
export const HALTBARKEIT: Record<Kategorie, number> = {
  fleisch: 3, fisch: 2, gemuese: 5, obst: 5, milch: 7, brot: 2, tiefkuehl: 90, trocken: 180, getraenke: 180, sonstiges: 7,
};
const KATEGORIEN = Object.keys(HALTBARKEIT) as Kategorie[];
const EINHEITEN: Zaehleinheit[] = ['kiste', 'packung', 'stueck', 'becher', 'beutel', 'flasche', 'dose', 'eimer', 'sack', 'karton', 'glas', 'netz', 'spiess'];

export function Katalog({ teil }: { teil?: string }) {
  const { t } = useT();
  return (
    <main className="seite ohne-nav">
      <KopfMitte titel={teil === 'produkte' ? t('katalog.produkte') : t('katalog.bereiche')} ziel="/c/einstellungen" />
      {teil === 'produkte' ? <ProdukteBearbeiten /> : <BereicheBearbeiten />}
    </main>
  );
}

// ─────────────────────────────── Foto wählen (Kamera oder Galerie)

export function FotoKnopf({ onFoto, text }: { onFoto(b: Blob): void; text: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        if (f) onFoto((await verkleinern(f, KATALOG_KANTE)).blob);
        e.target.value = '';
      }} />
      <button type="button" className="knopf" onClick={() => ref.current?.click()}><Icon name="kamera" groesse={18} /> {text}</button>
    </>
  );
}

// ─────────────────────────────── Namen in allen Sprachen (KI schlägt vor, Chef bestätigt)

export function NamenFelder({ namen, setNamen, bestaetigt, setBestaetigt }: {
  namen: Namen; setNamen(n: Namen): void; bestaetigt?: string[]; setBestaetigt?(b: string[]): void;
}) {
  const { t, sprache } = useT();
  const { api, toast } = useApp();
  const fehlerText = useFehlerText();
  const [laedt, setLaedt] = useState(false);
  const basis = namen[sprache] ?? '';
  async function vorschlagen() {
    setLaedt(true);
    try {
      const v = await api.namenVorschlagen(basis, sprache);
      // Nur leere Felder füllen – was der Chef geschrieben hat, bleibt.
      const neu = { ...namen };
      for (const [k, w] of Object.entries(v)) if (w && !neu[k as Sprache]) neu[k as Sprache] = w;
      setNamen(neu);
    } catch (e) { toast(fehlerText(e)); } finally { setLaedt(false); }
  }
  const andere = SPRACHEN.filter((s) => s.fertig && s.code !== sprache);
  return (
    <div className="stapel" style={{ gap: 10 }}>
      <label className="feld"><span>{t('katalog.name')}</span>
        <input className="eingabe" required value={basis} onChange={(e) => setNamen({ ...namen, [sprache]: e.target.value })} /></label>
      <button type="button" className="knopf klein akzent-text" style={{ alignSelf: 'flex-start' }} disabled={!basis.trim() || laedt} onClick={vorschlagen}>
        {laedt ? <span className="laden" style={{ width: 18, height: 18 }} /> : <Icon name="funkeln" groesse={16} />} {t('katalog.uebersetzen')}
      </button>
      {andere.map((s) => {
        const vonKi = namen[s.code] && bestaetigt && !bestaetigt.includes(s.code);
        return (
          <label key={s.code} className="feld" dir={s.dir}>
            <span>{s.eigen}{vonKi && <em style={{ fontStyle: 'normal', color: 'var(--gelb-text)' }}> · {t('katalog.vorschlag')}</em>}</span>
            <input className="eingabe" lang={s.code} value={namen[s.code] ?? ''} onChange={(e) => {
              setNamen({ ...namen, [s.code]: e.target.value });
              if (bestaetigt && setBestaetigt && !bestaetigt.includes(s.code)) setBestaetigt([...bestaetigt, s.code]);
            }} onFocus={() => { if (vonKi && bestaetigt && setBestaetigt) setBestaetigt([...bestaetigt, s.code]); }} />
          </label>
        );
      })}
    </div>
  );
}

// ─────────────────────────────── Bereiche + Positionen

const VORLAGEN: Array<{ art: Bereich['art']; key: string }> = [
  { art: 'kuehlhaus', key: 'vorlage.kuehlhaus' }, { art: 'tiefkuehler', key: 'vorlage.tiefkuehler' }, { art: 'trocken', key: 'vorlage.trocken' },
];

export function BereicheBearbeiten() {
  const tt = useT();
  const { t, name, sprache } = tt;
  const { api, toast, geaendert } = useApp();
  const fehlerText = useFehlerText();
  const { daten, fehler, laedt, nochmal } = useLaden(async (a) => ({ bereiche: await a.bereiche(), positionen: await a.positionen() }));
  const [pos, setPos] = useState<(Partial<Position> & { bereich_id: string; namen: Namen }) | null>(null);
  const [posFoto, setPosFoto] = useState<Blob | null>(null);
  const [neuName, setNeuName] = useState('');
  if (laedt && !daten) return <Laden />;

  async function bereichNeu(art: Bereich['art'], n: string) {
    if (!n.trim()) return;
    try {
      const namen = await api.namenVorschlagen(n.trim(), sprache).catch(() => ({ [sprache]: n.trim() }));
      const b = await api.bereichSpeichern({ namen: { ...namen, [sprache]: n.trim() }, art, reihenfolge: daten?.bereiche.length ?? 0 });
      // Jeder Bereich startet mit einer Position – "ganzes Regal"
      await api.positionSpeichern({ bereich_id: b.id, namen: { de: 'Regal', tr: 'Raf', ku: 'Refik', ar: 'الرف', en: 'Shelf' }, reihenfolge: 0 });
      setNeuName('');
      geaendert();
    } catch (e) { toast(fehlerText(e)); }
  }
  async function posSpeichern() {
    if (!pos) return;
    try { await api.positionSpeichern(pos, posFoto ?? undefined); setPos(null); setPosFoto(null); geaendert(); } catch (e) { toast(fehlerText(e)); }
  }

  return (
    <div className="stapel">
      {fehler != null && <Fehler fehler={fehler} nochmal={nochmal} />}
      <p className="leise" style={{ margin: 0 }}>{t('katalog.bereiche_erklaerung')}</p>
      {daten?.bereiche.map((b) => (
        <section key={b.id} className="karte">
          <div className="reihe" style={{ justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 19, display: 'flex', gap: 8, alignItems: 'center' }}><Icon name={b.art} /> {name(b.namen)}</strong>
            <button className="knopf klein gefahr" onClick={async () => { if (confirm(t('katalog.wirklich_loeschen'))) { await api.bereichLoeschen(b.id); geaendert(); } }} aria-label={t('allg.loeschen')}><Icon name="muell" groesse={18} /></button>
          </div>
          <span className="etikett leise">{t('katalog.positionen')}</span>
          {daten.positionen.filter((p) => p.bereich_id === b.id).map((p) => (
            <button key={p.id} className="zeile" onClick={() => { setPos(p); setPosFoto(null); }}>
              <PositionsBild pfad={p.referenzfoto_pfad} />
              <span className="mitte"><span className="name">{name(p.namen)}</span><span className="klein">{p.referenzfoto_pfad ? t('katalog.mit_foto') : t('katalog.ohne_foto')}</span></span>
              <Icon name="stift" groesse={18} />
            </button>
          ))}
          <button className="knopf klein" onClick={() => setPos({ bereich_id: b.id, namen: {}, reihenfolge: daten.positionen.filter((p) => p.bereich_id === b.id).length })}>
            <Icon name="plus" groesse={18} /> {t('katalog.position_neu')}
          </button>
        </section>
      ))}
      <section className="karte">
        <strong>{t('katalog.bereich_neu')}</strong>
        <div className="chips">
          {VORLAGEN.filter((v) => !daten?.bereiche.some((b) => b.art === v.art)).map((v) => (
            <button key={v.art} className="chip" onClick={() => bereichNeu(v.art, t(v.key))}><Icon name={v.art} groesse={18} /> {t(v.key)}</button>
          ))}
        </div>
        <form className="reihe" onSubmit={(e) => { e.preventDefault(); bereichNeu('sonstig', neuName); }}>
          <input className="eingabe" placeholder={t('katalog.eigener_bereich')} value={neuName} onChange={(e) => setNeuName(e.target.value)} />
          <button className="knopf akzent" disabled={!neuName.trim()} aria-label={t('allg.hinzufuegen')}><Icon name="plus" /></button>
        </form>
      </section>

      <Sheet offen={!!pos} zu={() => setPos(null)} titel={t('katalog.position')}>
        {pos && (
          <>
            <NamenFelder namen={pos.namen} setNamen={(n) => setPos({ ...pos, namen: n })} />
            <p className="leise" style={{ margin: 0 }}>{t('katalog.referenzfoto_erklaerung')}</p>
            {posFoto ? <img src={URL.createObjectURL(posFoto)} alt="" style={{ borderRadius: 16 }} /> : <PositionsBild pfad={pos.referenzfoto_pfad ?? null} gross />}
            <FotoKnopf text={t('katalog.referenzfoto')} onFoto={setPosFoto} />
            <button className="knopf-haupt" onClick={posSpeichern} disabled={!Object.values(pos.namen).some(Boolean)}>{t('allg.speichern')}</button>
            {pos.id && <button className="knopf gefahr" onClick={async () => { await api.positionLoeschen(pos.id!); setPos(null); geaendert(); }}>{t('allg.loeschen')}</button>}
          </>
        )}
      </Sheet>
    </div>
  );
}

function PositionsBild({ pfad, gross }: { pfad: string | null; gross?: boolean }) {
  const { api } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (pfad) api.bildUrl(pfad).then(setUrl).catch(() => {}); }, [api, pfad]);
  const stil = gross ? { width: '100%', height: 'auto', aspectRatio: '4 / 3', borderRadius: 16 } : undefined;
  return url ? <span className="produktbild" style={{ ...stil, backgroundImage: `url("${url}")` }} /> : <span className="produktbild" style={stil}><Icon name="foto" /></span>;
}

// ─────────────────────────────── Produkte

export function ProdukteBearbeiten() {
  const tt = useT();
  const { t, name, einheit, geldGenau } = tt;
  const { api, toast, geaendert } = useApp();
  const fehlerText = useFehlerText();
  const { daten, fehler, laedt, nochmal } = useLaden(async (a) => ({ produkte: await a.produkte(), bereiche: await a.bereiche() }));
  const [p, setP] = useState<(Partial<Produkt> & { namen: Namen }) | null>(null);
  const [foto, setFoto] = useState<Blob | null>(null);
  const [speichert, setSpeichert] = useState(false);
  if (laedt && !daten) return <Laden />;

  function neu() {
    setFoto(null);
    setP({
      namen: {}, namen_bestaetigt: [], kategorie: 'sonstiges', zaehleinheit: 'kiste', basiseinheit: 'stueck', menge_pro_einheit: null,
      mindestbestand: 2, standard_haltbarkeit_tage: HALTBARKEIT.sonstiges, preis_pro_einheit: null, bereich_ids: daten?.bereiche[0] ? [daten.bereiche[0].id] : [],
    });
  }
  async function speichern() {
    if (!p) return;
    setSpeichert(true);
    try {
      const eigene = tt.sprache;
      await api.produktSpeichern({ ...p, namen_bestaetigt: [...new Set([...(p.namen_bestaetigt ?? []), eigene])] }, foto ?? undefined);
      setP(null); setFoto(null); geaendert();
    } catch (e) { toast(fehlerText(e)); } finally { setSpeichert(false); }
  }
  const zahlFeld = (wert: number | null | undefined, set: (n: number | null) => void, label: string, schritt = '1') => (
    <label className="feld"><span>{label}</span>
      <input className="eingabe" type="number" inputMode="decimal" min="0" step={schritt} value={wert ?? ''} onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))} /></label>
  );

  return (
    <div className="stapel">
      {fehler != null && <Fehler fehler={fehler} nochmal={nochmal} />}
      <p className="leise" style={{ margin: 0 }}>{t('katalog.produkte_erklaerung')}</p>
      <button className="knopf-haupt" onClick={neu}><Icon name="plus" /> {t('katalog.produkt_neu')}</button>
      <section className="karte" style={{ gap: 0, paddingTop: 6, paddingBottom: 6 }}>
        {daten?.produkte.filter((x) => x.aktiv).map((x) => (
          <button key={x.id} className="zeile" onClick={() => { setP(x); setFoto(null); }}>
            <ProduktBild produkt={x} />
            <span className="mitte">
              <span className="name">{name(x.namen)}</span>
              <span className="klein">
                {einheit(x.zaehleinheit, 1)}{x.menge_pro_einheit ? ` à ${tt.zahl(x.menge_pro_einheit)} ${x.basiseinheit}` : ''} · {t('bestand.mindestens', { menge: tt.menge(x.mindestbestand, x.zaehleinheit) })}
                {x.preis_pro_einheit != null && ` · ${geldGenau(x.preis_pro_einheit)}`}
              </span>
            </span>
            <Icon name="stift" groesse={18} />
          </button>
        ))}
        {daten?.produkte.filter((x) => x.aktiv).length === 0 && <p className="leise">{t('katalog.noch_keine')}</p>}
      </section>

      <Sheet offen={!!p} zu={() => setP(null)} titel={p?.id ? name(p.namen) : t('katalog.produkt_neu')}>
        {p && (
          <>
            <div className="reihe" style={{ gap: 14 }}>
              {foto ? <span className="produktbild mittel" style={{ backgroundImage: `url("${URL.createObjectURL(foto)}")` }} /> : <ProduktBild produkt={{ kategorie: p.kategorie ?? 'sonstiges', namen: p.namen, referenzfoto_pfad: p.referenzfoto_pfad ?? null }} groesse="mittel" />}
              <div className="stapel" style={{ gap: 4, flex: 1 }}>
                <FotoKnopf text={t('katalog.foto')} onFoto={setFoto} />
                <span className="leise" style={{ fontSize: 13 }}>{t('katalog.foto_warum')}</span>
              </div>
            </div>
            <NamenFelder namen={p.namen} setNamen={(n) => setP({ ...p, namen: n })} bestaetigt={p.namen_bestaetigt ?? []} setBestaetigt={(b) => setP({ ...p, namen_bestaetigt: b })} />

            <label className="feld"><span>{t('katalog.kategorie')}</span>
              <select className="eingabe" value={p.kategorie} onChange={(e) => {
                const k = e.target.value as Kategorie;
                // Haltbarkeit mitziehen, solange der Chef sie nicht selbst geändert hat
                const warVorschlag = p.standard_haltbarkeit_tage == null || p.standard_haltbarkeit_tage === HALTBARKEIT[p.kategorie ?? 'sonstiges'];
                setP({ ...p, kategorie: k, standard_haltbarkeit_tage: warVorschlag ? HALTBARKEIT[k] : p.standard_haltbarkeit_tage });
              }}>
                {KATEGORIEN.map((k) => <option key={k} value={k}>{t(`kategorie.${k}`)}</option>)}
              </select></label>

            <div className="karte" style={{ background: 'var(--flaeche)' }}>
              <strong>{t('katalog.wie_zaehlen')}</strong>
              <span className="leise" style={{ fontSize: 14 }}>{t('katalog.wie_zaehlen_unter')}</span>
              <label className="feld"><span>{t('katalog.zaehleinheit')}</span>
                <select className="eingabe" value={p.zaehleinheit} onChange={(e) => setP({ ...p, zaehleinheit: e.target.value as Zaehleinheit })}>
                  {EINHEITEN.map((e) => <option key={e} value={e}>{einheit(e, 1)}</option>)}
                </select></label>
              <div className="raster-2">
                {zahlFeld(p.menge_pro_einheit, (n) => setP({ ...p, menge_pro_einheit: n }), t('katalog.inhalt'), '0.1')}
                <label className="feld"><span>{t('katalog.basiseinheit')}</span>
                  <select className="eingabe" value={p.basiseinheit} onChange={(e) => setP({ ...p, basiseinheit: e.target.value as Basiseinheit })}>
                    <option value="kg">kg</option><option value="l">l</option><option value="stueck">{einheit('stueck', 2)}</option>
                  </select></label>
              </div>
              {p.menge_pro_einheit && p.basiseinheit !== 'stueck' && (
                <span className="meldung info" style={{ padding: '8px 12px' }}>{t('katalog.beispiel', { einheit: einheit(p.zaehleinheit ?? 'kiste', 1), menge: tt.zahl(p.menge_pro_einheit), basis: p.basiseinheit ?? '' })}</span>
              )}
            </div>

            <div className="raster-2">
              {zahlFeld(p.mindestbestand, (n) => setP({ ...p, mindestbestand: n ?? 0 }), t('katalog.mindestbestand', { einheit: einheit(p.zaehleinheit ?? 'stueck', 2) }))}
              {zahlFeld(p.standard_haltbarkeit_tage, (n) => setP({ ...p, standard_haltbarkeit_tage: n }), t('katalog.haltbarkeit'))}
            </div>
            {p.id && <MindestVorschlag produktId={p.id} zaehleinheit={p.zaehleinheit ?? 'stueck'} aktuell={p.mindestbestand ?? 0} setzen={(n) => setP({ ...p, mindestbestand: n })} />}
            {zahlFeld(p.preis_pro_einheit, (n) => setP({ ...p, preis_pro_einheit: n }), t('katalog.preis', { einheit: einheit(p.zaehleinheit ?? 'stueck', 1) }), '0.01')}

            <span className="etikett leise">{t('katalog.wo')}</span>
            <div className="chips">
              {daten?.bereiche.map((b) => {
                const an = (p.bereich_ids ?? []).includes(b.id);
                return <button type="button" key={b.id} className="chip" aria-pressed={an} onClick={() => setP({ ...p, bereich_ids: an ? p.bereich_ids!.filter((x) => x !== b.id) : [...(p.bereich_ids ?? []), b.id] })}><Icon name={b.art} groesse={16} /> {name(b.namen)}</button>;
              })}
            </div>
            <button className="knopf-haupt" onClick={speichern} disabled={speichert || !Object.values(p.namen).some(Boolean)}>{speichert ? <span className="laden" /> : t('allg.speichern')}</button>
            {p.id && <button className="knopf gefahr" onClick={async () => { if (confirm(t('katalog.wirklich_loeschen'))) { await api.produktLoeschen(p.id!); setP(null); geaendert(); } }}>{t('allg.loeschen')}</button>}
          </>
        )}
      </Sheet>
    </div>
  );
}

/** Mindestbestand aus dem echten Verbrauch – mit der Rechnung dazu, damit der Chef sie prüfen kann. */
function MindestVorschlag({ produktId, zaehleinheit, aktuell, setzen }: { produktId: string; zaehleinheit: Zaehleinheit; aktuell: number; setzen(n: number): void }) {
  const tt = useT();
  const { t } = tt;
  const fehlerText = useFehlerText();
  const { daten, fehler, laedt } = useLaden(async (a) => {
    const v = await a.produktVerlauf(produktId, new Date(Date.now() - 28 * 864e5).toISOString());
    return mindestbestandVorschlag(verbrauchSchaetzen(v.bestand, v.weggeworfen));
  }, [produktId]);
  if (laedt) return null;
  if (fehler != null) return <span className="leise" style={{ fontSize: 13 }}>{fehlerText(fehler)}</span>;
  if (daten === null) return <span className="leise" style={{ fontSize: 13 }}>{t('katalog.mindest_zu_wenig')}</span>;
  return (
    <div className="meldung info" style={{ alignItems: 'center' }}>
      <Icon name="funkeln" />
      <span style={{ flex: 1 }}>{t('katalog.mindest_vorschlag', { menge: tt.menge(daten.menge, zaehleinheit), pro_tag: tt.menge(Math.round(daten.pro_tag * 10) / 10, zaehleinheit), tage: Math.round(daten.tage), reichweite: REICHWEITE_TAGE })}</span>
      {daten.menge !== aktuell && <button type="button" className="knopf klein" onClick={() => setzen(daten.menge)}>{t('katalog.uebernehmen')}</button>}
    </div>
  );
}
