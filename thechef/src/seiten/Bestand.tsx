// Bestand.dc.html – Warenwert, Ampel (nie nur Farbe), läuft bald ab, alles nach Bereichen.
import { useState } from 'react';
import { ampelZaehlen, laeuftBaldAb, warenwert, type Ampel } from '../../supabase/functions/_shared/logik/lager.ts';
import { useT } from '../i18n/i18n.tsx';
import { ChefNavigation, Fehler, Laden, MhdPlakette, ProduktBild } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';
import { mengeText, useLager } from './lager.ts';

const SYMBOL: Record<Ampel, string> = { gut: '✓', knapp: '↓', sofort: '!' };

export function BestandSeite() {
  const tt = useT();
  const { t, name, geld, wann } = tt;
  const { daten: d, fehler, laedt, nochmal } = useLager();
  const [filter, setFilter] = useState<Ampel | null>(null);
  if (laedt && !d) return <><Laden /><ChefNavigation aktiv="bestand" /></>;

  const zaehl = d ? ampelZaehlen(d.staende) : { gut: 0, knapp: 0, sofort: 0 };
  const wert = d ? warenwert(d.staende) : null;
  const bald = d ? laeuftBaldAb(d.staende) : [];
  const letzter = d?.bestand.slice().sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt))[0];

  return (
    <main className="seite">
      <div className="stapel einblenden" style={{ gap: 6, padding: '0 4px' }}>
        <h1 className="titel">{t('nav.bestand')}</h1>
        <div className="leise" style={{ fontSize: 15, fontWeight: 600 }}>
          <Icon name="uhr" groesse={15} style={{ verticalAlign: '-2px' }} /> {t('bestand.letzter_scan', { wann: wann(letzter?.zeitpunkt) })}
        </div>
      </div>
      {fehler != null && <Fehler fehler={fehler} nochmal={nochmal} />}

      {/* Bestand.dc.html: eine Kopfkarte – Warenwert groß, Weggeworfen daneben, Ampel als Filter darunter. */}
      <section className="karte kopf-karte einblenden" style={{ animationDelay: '.04s' }}>
        <div className="reihe" style={{ justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <span className="stapel" style={{ gap: 2, minWidth: 0 }}>
            <span className="klein">{t('bestand.ware_im_lager')}</span>
            <span className="zahl gross">{wert ? geld(wert.eur) : '–'}</span>
          </span>
          <a href="#/c/verlust" className="stapel weg-wert" style={{ gap: 2 }}>
            <span className="klein">{t('bestand.weggeworfen_monat', { monat: tt.monat(new Date().getMonth() + 1) })}</span>
            <span className="zahl" style={{ color: 'var(--rot-text)' }}>{d ? geld(d.wegMonat) : '–'}</span>
          </a>
        </div>
        {wert && wert.produkte_ohne_preis > 0 && <span className="klein" style={{ fontWeight: 600 }}>{t('bestand.ohne_preis', { n: wert.produkte_ohne_preis })}</span>}
        <div className="raster-3" role="group" aria-label={t('bestand.ampel')}>
          {(['gut', 'knapp', 'sofort'] as Ampel[]).map((a) => (
            <button key={a} className={`ampel-pille ${a}`} aria-pressed={filter === a} aria-label={`${t(`ampel.${a}`)}: ${zaehl[a]}`} onClick={() => setFilter(filter === a ? null : a)}>
              <span className="wort" aria-hidden="true">{SYMBOL[a]} {t(`ampel.kurz.${a}`)}</span>
              <span className="zahl">{zaehl[a]}</span>
            </button>
          ))}
        </div>
      </section>

      {bald.length > 0 && !filter && (
        <section className="einblenden" style={{ animationDelay: '.12s' }}>
          <h2 className="abschnitt">{t('bestand.laeuft_bald_ab')}</h2>
          <div className="wisch" style={{ marginTop: 10 }}>
            {bald.map((s) => (
              <div key={s.produkt.id} className="bald-karte">
                <div style={{ position: 'relative' }}>
                  <ProduktBild produkt={s.produkt} groesse="gross" />
                  <span style={{ position: 'absolute', top: 8, insetInlineStart: 8 }}><MhdPlakette tage={s.tage_bis_mhd} /></span>
                </div>
                <strong>{name(s.produkt.namen)}</strong>
                <span className="leise">{mengeText(tt, s.produkt, s.menge_mhd)}</span>
                {s.mhd_quelle === 'berechnet' && <span className="leise" style={{ fontSize: 12 }}>{t('bestand.mhd_berechnet')}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <h2 className="abschnitt einblenden" style={{ animationDelay: '.16s' }}>{filter ? t(`ampel.${filter}`) : t('bestand.alles')}</h2>
      {(d?.bereiche ?? []).map((b) => {
        const hier = (d?.staende ?? []).filter((s) => s.bereiche.some((x) => x.bereich_id === b.id) || (s.bereiche.length === 0 && s.produkt.bereich_ids[0] === b.id))
          .filter((s) => !filter || s.ampel === filter);
        if (!hier.length) return null;
        const scan = hier.flatMap((s) => s.bereiche.filter((x) => x.bereich_id === b.id).map((x) => x.zeitpunkt)).sort().at(-1);
        return (
          <section key={b.id} className="karte einblenden" style={{ gap: 0, paddingTop: 14, paddingBottom: 6 }}>
            <div className="reihe" style={{ justifyContent: 'space-between', paddingBottom: 6 }}>
              <strong style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name={b.art} groesse={20} /> {name(b.namen)}</strong>
              <span className="leise" style={{ fontSize: 14, fontWeight: 600 }}>{t('bestand.scan', { wann: wann(scan) })}</span>
            </div>
            {hier.map((s) => {
              const menge = s.bereiche.find((x) => x.bereich_id === b.id)?.menge ?? 0;
              return (
                <div key={s.produkt.id} className="zeile">
                  <ProduktBild produkt={s.produkt} />
                  <span className="mitte">
                    <span className="name">{name(s.produkt.namen)}</span>
                    <span className="klein">{s.produkt.mindestbestand > 0 ? t('bestand.mindestens', { menge: mengeText(tt, s.produkt, s.produkt.mindestbestand) }) : ' '}</span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className="menge">{mengeText(tt, s.produkt, menge)}</span>
                    <MhdPlakette tage={s.tage_bis_mhd} fehlt={s.fehlt > 0} />
                  </span>
                </div>
              );
            })}
          </section>
        );
      })}
      {d && d.produkte.length === 0 && (
        <div className="karte"><strong>{t('bestand.leer')}</strong><a className="knopf akzent" href="#/einrichtung/produkte">{t('bestand.produkte_anlegen')}</a></div>
      )}
      <ChefNavigation aktiv="bestand" />
    </main>
  );
}
