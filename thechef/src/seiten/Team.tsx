// Mitarbeiter einladen: Code + Link, per WhatsApp teilbar. Kein Passwort für Mitarbeiter.
import { useState } from 'react';
import { useApp, useFehlerText, useIch, useLaden } from '../app/kontext.tsx';
import { SPRACHEN, useT } from '../i18n/i18n.tsx';
import { whatsappLink } from '../lib/geraet.ts';
import { Fehler, KopfMitte, Laden } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';
import { oeffentlicheAdresse } from '../lib/geraet.ts';

export function Team() {
  const { t } = useT();
  return <main className="seite ohne-nav"><KopfMitte titel={t('team.titel')} ziel="/c/einstellungen" /><TeamInhalt /></main>;
}

export function TeamInhalt() {
  const { t } = useT();
  const { api, toast, geaendert } = useApp();
  const { nutzer, betrieb } = useIch();
  const fehlerText = useFehlerText();
  const { daten, fehler, laedt, nochmal } = useLaden((a) => a.team());
  const [code, setCode] = useState<string | null>(null);
  const [laedtCode, setLaedtCode] = useState(false);

  async function einladen() {
    setLaedtCode(true);
    try { setCode(await api.einladungErstellen()); } catch (e) { toast(fehlerText(e)); } finally { setLaedtCode(false); }
  }
  // In der iPhone-App ist location.origin „capacitor://localhost“ – ein Link
  // dorthin führt auf keinem anderen Handy irgendwohin. Dann nur der Code.
  const adresse = oeffentlicheAdresse();
  const link = code && adresse ? `${adresse}/#/beitreten/${code}` : '';
  const text = !code ? '' : link
    ? t('team.einladung_text', { betrieb: betrieb.name, code, link })
    : t('team.einladung_text_code', { betrieb: betrieb.name, code });

  return (
    <div className="stapel">
      {fehler != null && <Fehler fehler={fehler} nochmal={nochmal} />}
      {laedt && !daten && <Laden />}
      <section className="karte" style={{ gap: 0, paddingTop: 6, paddingBottom: 6 }}>
        {daten?.map((n) => (
          <div key={n.id} className="zeile">
            <span className="icon-rund"><Icon name={n.rolle === 'chef' ? 'muetze' : 'team'} groesse={20} /></span>
            <span className="mitte"><span className="name">{n.name || '—'}</span><span className="klein">{t(`team.${n.rolle}`)} · {SPRACHEN.find((s) => s.code === n.sprache)?.eigen}</span></span>
            {n.id !== nutzer.id && n.rolle !== 'chef' && (
              <button className="knopf klein gefahr" aria-label={t('team.entfernen')} onClick={async () => {
                if (!confirm(t('team.wirklich_entfernen', { name: n.name }))) return;
                try { await api.teamEntfernen(n.id); geaendert(); } catch (e) { toast(fehlerText(e)); }
              }}><Icon name="x" groesse={18} /></button>
            )}
          </div>
        ))}
      </section>
      {!code ? (
        <button className="knopf-haupt" onClick={einladen} disabled={laedtCode}>{laedtCode ? <span className="laden" /> : <><Icon name="plus" /> {t('team.einladen')}</>}</button>
      ) : (
        <section className="karte" style={{ alignItems: 'center', textAlign: 'center' }}>
          <span className="leise">{t('team.code_ist')}</span>
          <span className="zahl" style={{ fontSize: 44, letterSpacing: 6 }}>{code}</span>
          <span className="leise" style={{ fontSize: 14 }}>{t('team.code_gueltig')}</span>
          <a className="knopf-haupt gruen" href={whatsappLink(text)} target="_blank" rel="noopener"><Icon name="whatsapp" /> {t('team.per_whatsapp')}</a>
          <button className="knopf" onClick={() => navigator.clipboard?.writeText(link || code || '').then(() => toast(t('team.kopiert')))}>{link ? t('team.link_kopieren') : t('team.code_kopieren')}</button>
        </section>
      )}
    </div>
  );
}
