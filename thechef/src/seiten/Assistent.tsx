// Assistent.dc.html – Startbildschirm des Chefs:
// Abend-Briefing (3 Punkte, Vorlesen) · Hinweise · Tagesgericht-Idee · Warenwert · großes Mikrofon.
// Eigener, deutlich anderer Zustand, wenn heute NICHT gescannt wurde.
import { useEffect, useState } from 'react';
import { briefingPunkte, fehlendeBereiche, uhrzeitIn, warenwert } from '../../supabase/functions/_shared/logik/lager.ts';
import type { Briefing } from '../../supabase/functions/_shared/logik/typen.ts';
import { useApp, useIch, useLaden } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { stimmeFuer, vorlesen } from '../lib/geraet.ts';
import { geheZu } from '../lib/router.ts';
import { ChefNavigation, Fehler, Laden, MikroKnopf } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';
import { briefingText, hinweisText, useLager } from './lager.ts';

export function AssistentStart() {
  const tt = useT();
  const { t, name, geld, uhrzeit, sprache } = tt;
  const { api } = useApp();
  const { betrieb } = useIch();
  const lager = useLager();
  const zusatz = useLaden(async (a) => {
    const seit = new Date(Date.now() - 36 * 3600e3).toISOString();
    const [scans, hinweise, briefing] = await Promise.all([a.scansSeit(seit), a.hinweise(), a.briefing(lager.daten?.heute ?? '')]);
    return { scans, hinweise, briefing };
  }, [lager.daten?.heute]);
  const [frage, setFrage] = useState('');
  const [stimme, setStimme] = useState(false);
  useEffect(() => {
    const pruefen = () => setStimme(!!stimmeFuer(sprache));
    pruefen();
    speechSynthesis?.addEventListener?.('voiceschanged', pruefen);
    return () => speechSynthesis?.removeEventListener?.('voiceschanged', pruefen);
  }, [sprache]);

  if (lager.laedt && !lager.daten) return <><Laden /><ChefNavigation aktiv="assistent" /></>;
  const d = lager.daten;
  const z = zusatz.daten;
  const stunde = new Date().getHours();
  const gruss = stunde < 11 ? t('assistent.morgen') : stunde < 17 ? t('assistent.tag') : t('assistent.abend');

  // Heute gescannt?
  const bereichIds = (d?.bereiche ?? []).map((b) => b.id);
  const fehlen = d && z ? fehlendeBereiche(bereichIds, z.scans, betrieb.zeitzone, d.heute) : [];
  const letzterHeute = z?.scans.filter((s) => s.status === 'bestaetigt').sort((a, b) => (b.bestaetigt_am ?? '').localeCompare(a.bestaetigt_am ?? ''))[0];
  const wer = d?.team.find((n) => n.id === letzterHeute?.nutzer_id)?.name;
  const nachErinnerung = uhrzeitIn(betrieb.zeitzone) >= betrieb.scan_erinnerung_uhrzeit.slice(0, 5);
  const briefing: Briefing | null = z?.briefing ?? null;
  const nichtGescannt = (!!briefing?.gesendet_am && !briefing.gescannt) || (nachErinnerung && fehlen.length > 0);
  const punkte = briefing?.punkte?.length ? briefing.punkte : d ? briefingPunkte(d.staende, d.einkauf) : [];
  const bereichName = (id: string) => name(d?.bereiche.find((b) => b.id === id)?.namen);
  const texte = punkte.map((p) => briefingText(tt, p, d?.produkte ?? []));
  const farben = ['var(--rot)', 'var(--gelb)', 'var(--akzent)'];
  const wert = d ? warenwert(d.staende) : null;

  function fragen(q: string) {
    if (!q.trim()) return;
    geheZu(`/c/frage?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <main className="seite" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 230px)' }}>
      <div className="stapel einblenden" style={{ gap: 10, padding: '0 4px' }}>
        <div className="kopf" style={{ padding: 0 }}>
          <h1>{gruss}</h1>
          <a href="#/c/einstellungen" className="glas glas-knopf" aria-label={t('einstellungen.titel')}><Icon name="darstellung" /></a>
        </div>
        <div className="glas glas-pille" role="status">
          <span className={`punkt ${fehlen.length === 0 ? '' : nichtGescannt ? 'rot' : 'gelb'}`} />
          {fehlen.length === 0 && letzterHeute
            ? t('assistent.gescannt', { zeit: uhrzeit(letzterHeute.bestaetigt_am!), wer: wer ?? '' })
            : t('assistent.teilweise', { n: bereichIds.length - fehlen.length, von: bereichIds.length })}
        </div>
      </div>

      {lager.fehler != null && <Fehler fehler={lager.fehler} nochmal={lager.nochmal} />}
      {zusatz.fehler != null && <Fehler fehler={zusatz.fehler} nochmal={zusatz.nochmal} />}

      {nichtGescannt && (
        // Nicht zu übersehen: eigener Zustand, mit dem, was fehlt.
        <div className="karte nicht-gescannt einblenden" role="alert">
          <div className="reihe"><span className="icon-rund" style={{ background: 'var(--rot)', color: '#fff' }}><Icon name="warnung" /></span>
            <strong style={{ fontSize: 20 }}>{t('assistent.nicht_gescannt')}</strong></div>
          <div style={{ fontSize: 16 }}>{t('assistent.es_fehlt', { bereiche: fehlen.map(bereichName).join(', ') })}</div>
          <div className="leise" style={{ fontSize: 14 }}>{t('assistent.zahlen_alt', { wann: tt.wann(d?.letzterScan) })}</div>
          <a className="knopf akzent" href="#/m"><Icon name="kamera" groesse={18} /> {t('assistent.selbst_scannen')}</a>
        </div>
      )}

      <section className="karte einblenden" style={{ animationDelay: '.06s', gap: 14, opacity: nichtGescannt ? 0.8 : 1 }} aria-labelledby="briefing">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span id="briefing" className="etikett" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--akzent)' }}>
            <Icon name="funkeln" groesse={16} /> {briefing ? t('assistent.briefing') : t('assistent.stand_jetzt')}
          </span>
          {stimme && (
            <button className="icon-rund" style={{ width: 40, height: 40, borderRadius: 20, border: 'none' }} aria-label={t('assistent.vorlesen')}
              onClick={() => vorlesen(texte.map((x, i) => `${i + 1}. ${x.stark} ${x.leise}`).join(' '), sprache)}>
              <Icon name="vorlesen" groesse={20} />
            </button>
          )}
        </div>
        <ol className="briefing-liste">
          {texte.map((x, i) => (
            <li key={i}>
              <span className="zahl" style={{ color: farben[i] }}>{i + 1}</span>
              <span><strong>{x.stark}</strong> {x.leise && <span className="leise">{x.leise}</span>}</span>
            </li>
          ))}
        </ol>
        <div className="reihe" style={{ gap: 8 }}>
          <a href="#/c/einkauf" className="knopf akzent" style={{ flex: 1 }}><Icon name="einkauf" groesse={18} /> {t('nav.einkaufsliste')}</a>
          <a href="#/c/bestand" className="knopf" style={{ flex: 1 }}>{t('assistent.zum_bestand')}</a>
        </div>
      </section>

      {(z?.hinweise.length ?? 0) > 0 && (
        <section className="stapel einblenden" style={{ gap: 8, animationDelay: '.1s' }} aria-label={t('assistent.hinweise')}>
          {z!.hinweise.slice(0, 5).map((h) => {
            const x = hinweisText(tt, h, d?.produkte ?? [], bereichName);
            return (
              <div key={h.id} className="karte eng" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <span className={`punkt ${h.prioritaet >= 85 ? 'rot' : 'gelb'}`} style={{ width: 10, height: 10, borderRadius: 5 }} />
                <span style={{ flex: 1, minWidth: 0 }}><strong style={{ display: 'block' }}>{x.titel}</strong><span className="leise" style={{ fontSize: 14 }}>{x.unter}</span></span>
                {h.aktion === 'einkaufsliste' ? (
                  <button className="knopf klein akzent-text" onClick={async () => { await api.hinweisErledigt(h.id!); geheZu('/c/einkauf'); }}>{t('hinweis.zur_liste')}</button>
                ) : (
                  <button className="knopf klein" onClick={async () => { await api.hinweisErledigt(h.id!); zusatz.nochmal(); }}>{t('hinweis.erledigt')}</button>
                )}
              </div>
            );
          })}
        </section>
      )}

      <Tagesgericht />

      <div className="reihe einblenden" style={{ gap: 10, animationDelay: '.16s' }}>
        <a href="#/c/bestand" className="wert-kachel" style={{ flex: 1 }}>
          <span className="klein">{t('bestand.ware_im_lager')}</span>
          <span className="zahl">{wert ? geld(wert.eur) : '–'}</span>
        </a>
        <a href="#/c/verlust" className="wert-kachel" style={{ flex: 1 }}>
          <span className="klein">{t('bestand.weggeworfen_monat', { monat: tt.monat(new Date().getMonth() + 1) })}</span>
          <span className="zahl" style={{ color: 'var(--rot-text)' }}>{d ? geld(d.wegMonat) : '–'}</span>
        </a>
      </div>

      <div className="frage-bereich">
        <div className="wisch" style={{ margin: 0 }}>
          {['vorschlag.bestellen', 'vorschlag.haehnchen', 'vorschlag.weggeworfen', 'vorschlag.tagesgericht'].map((k) => (
            <button key={k} className="chip" style={{ flexShrink: 0, minHeight: 40 }} onClick={() => fragen(t(k))}>{t(k)}</button>
          ))}
        </div>
        <form className="frage-leiste glas" onSubmit={(e) => { e.preventDefault(); fragen(frage); }}>
          <input value={frage} onChange={(e) => setFrage(e.target.value)} placeholder={t('assistent.frag_mich')} aria-label={t('assistent.frag_mich')} enterKeyHint="send" />
          {frage.trim()
            ? <button className="mikro senden" aria-label={t('allg.senden')}><Icon name="senden" groesse={22} spiegeln /></button>
            : <MikroKnopf onText={(x) => setFrage(x)} />}
        </form>
      </div>
      <ChefNavigation aktiv="assistent" />
    </main>
  );
}

function Tagesgericht() {
  const { t, sprache } = useT();
  const { api } = useApp();
  const [idee, setIdee] = useState<{ gericht: string; grund: string } | null | 'laedt' | 'fehler'>('laedt');
  useEffect(() => {
    let aus = false;
    // Serverseitig einmal pro Tag und Sprache erzeugt und gespeichert – öffnen kostet nichts.
    api.tagesgericht(sprache).then((r) => !aus && setIdee(r)).catch(() => !aus && setIdee('fehler'));
    return () => { aus = true; };
  }, [api, sprache]);
  if (idee === null) return null;
  return (
    <div className="dunkelkarte einblenden" style={{ animationDelay: '.12s' }}>
      <span className="icon-rund"><Icon name="funkeln" groesse={18} /></span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span className="etikett">{t('assistent.tagesgericht')}</span>
        {idee === 'laedt' ? <span style={{ opacity: 0.7 }}>…</span>
          : idee === 'fehler' ? <span style={{ opacity: 0.8 }}>{t('assistent.tagesgericht_fehler')}</span>
            : <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>{idee.gericht} <span style={{ opacity: 0.75, fontWeight: 500 }}>{idee.grund}</span></span>}
      </span>
    </div>
  );
}
