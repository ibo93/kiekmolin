// Anmelden. Zwei Wege, klar getrennt:
//   Chef        → E-Mail + Passwort (einmal), danach Betrieb anlegen
//   Mitarbeiter → nur den Code vom Chef eintippen oder den Link öffnen. Kein Passwort.
import { useState } from 'react';
import type { Sitzung } from '../daten/api.ts';
import { useApp, useFehlerText } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { geheZu, pfad } from '../lib/router.ts';
import { Icon } from '../ui/Icon.tsx';
import { Umschalter } from '../ui/bausteine.tsx';

export function Anmelden({ sitzung, fehler }: { sitzung: Sitzung | null; fehler: string | null }) {
  const { t, sprache } = useT();
  const { api } = useApp();
  const p = pfad();
  const codeAusLink = p[0] === 'beitreten' ? p[1] ?? '' : '';
  const [weg, setWeg] = useState<'start' | 'chef' | 'code'>(codeAusLink ? 'code' : 'start');

  if (sitzung?.art === 'ohne_betrieb') return <BetriebAnlegen />;

  return (
    <main className="seite ohne-nav" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 70px)' }}>
      <div className="einblenden" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="etikett" style={{ color: 'var(--akzent)' }}>THE CHEF</div>
        <h1 className="titel">{t('anmelden.titel')}</h1>
        <p className="leise" style={{ margin: 0, fontSize: 17 }}>{t('anmelden.unter')}</p>
      </div>
      {fehler && <div className="meldung fehler" role="alert"><Icon name="warnung" />{t('fehler.verbindung')} ({fehler})</div>}

      {weg === 'start' && (
        <div className="stapel" style={{ marginTop: 12 }}>
          <button className="start-karte" onClick={() => (api.demo ? api.anmelden('', '').then(() => location.reload()) : setWeg('chef'))}>
            <span className="icon-rund gross" style={{ background: 'var(--akzent)', color: '#fff' }}><Icon name="muetze" groesse={30} /></span>
            <span className="mitte"><strong>{t('anmelden.ich_chef')}</strong><small>{t('anmelden.ich_chef_unter')}</small></span>
            <Icon name="weiter" spiegeln />
          </button>
          <button className="start-karte" onClick={() => (api.demo ? api.beitreten('', 'Halil', sprache).then(() => location.reload()) : setWeg('code'))}>
            <span className="icon-rund gross"><Icon name="team" groesse={28} /></span>
            <span className="mitte"><strong>{t('anmelden.ich_mitarbeiter')}</strong><small>{t('anmelden.ich_mitarbeiter_unter')}</small></span>
            <Icon name="weiter" spiegeln />
          </button>
          {api.demo && <p className="meldung warnung" style={{ margin: 0 }}>{t('anmelden.demo_hinweis')}</p>}
        </div>
      )}
      {weg === 'chef' && <ChefAnmelden zurueck={() => setWeg('start')} />}
      {weg === 'code' && <CodeEingeben startCode={codeAusLink} zurueck={() => setWeg('start')} />}
    </main>
  );
}

function ChefAnmelden({ zurueck }: { zurueck(): void }) {
  const { t } = useT();
  const { api, neuLaden } = useApp();
  const fehlerText = useFehlerText();
  const [modus, setModus] = useState<'anmelden' | 'neu'>('anmelden');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [mail, setMail] = useState(false);

  async function los(e: React.FormEvent) {
    e.preventDefault();
    setLaedt(true);
    setFehler(null);
    try {
      if (modus === 'anmelden') await api.anmelden(email.trim(), pw);
      else {
        const r = await api.registrieren(email.trim(), pw);
        if (r.mailBestaetigen) { setMail(true); return; }
      }
      await neuLaden();
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaedt(false);
    }
  }
  if (mail) return <div className="meldung ok" role="status"><Icon name="mail" />{t('anmelden.mail_bestaetigen', { email })}</div>;
  return (
    <form className="stapel" onSubmit={los} style={{ marginTop: 8 }}>
      <Umschalter<'anmelden' | 'neu'> label={t('anmelden.titel')} wert={modus} setWert={setModus}
        optionen={[{ id: 'anmelden', text: t('anmelden.anmelden') }, { id: 'neu', text: t('anmelden.neu') }]} />
      <label className="feld"><span>{t('anmelden.email')}</span>
        <input className="eingabe" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="feld"><span>{t('anmelden.passwort')}</span>
        <input className="eingabe" type="password" autoComplete={modus === 'neu' ? 'new-password' : 'current-password'} minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      {fehler && <div className="meldung fehler" role="alert"><Icon name="warnung" />{fehler}</div>}
      <button className="knopf-haupt" disabled={laedt}>{laedt ? <span className="laden" /> : modus === 'anmelden' ? t('anmelden.anmelden') : t('anmelden.konto_anlegen')}</button>
      <button type="button" className="knopf leise" onClick={zurueck}>{t('allg.zurueck')}</button>
    </form>
  );
}

function CodeEingeben({ startCode, zurueck }: { startCode: string; zurueck(): void }) {
  const { t, sprache } = useT();
  const { api, neuLaden } = useApp();
  const fehlerText = useFehlerText();
  const [code, setCode] = useState(startCode.toUpperCase());
  const [name, setName] = useState('');
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  async function los(e: React.FormEvent) {
    e.preventDefault();
    setLaedt(true);
    setFehler(null);
    try {
      await api.beitreten(code.trim(), name.trim(), sprache);
      await neuLaden();
      geheZu('/m', true);
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaedt(false);
    }
  }
  return (
    <form className="stapel" onSubmit={los} style={{ marginTop: 8 }}>
      <label className="feld"><span>{t('anmelden.code')}</span>
        <input className="eingabe zahl" style={{ fontSize: 30, letterSpacing: 6, textAlign: 'center', minHeight: 72 }} autoCapitalize="characters" autoComplete="one-time-code"
          maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></label>
      <label className="feld"><span>{t('anmelden.dein_name')}</span>
        <input className="eingabe" autoComplete="given-name" required value={name} onChange={(e) => setName(e.target.value)} /></label>
      {fehler && <div className="meldung fehler" role="alert"><Icon name="warnung" />{fehler}</div>}
      <button className="knopf-haupt" disabled={laedt || code.length < 6 || !name.trim()}>{laedt ? <span className="laden" /> : t('allg.los')}</button>
      <button type="button" className="knopf leise" onClick={zurueck}>{t('allg.zurueck')}</button>
    </form>
  );
}

function BetriebAnlegen() {
  const { t, sprache } = useT();
  const { api, neuLaden } = useApp();
  const fehlerText = useFehlerText();
  const [betrieb, setBetrieb] = useState('');
  const [name, setName] = useState('');
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  async function los(e: React.FormEvent) {
    e.preventDefault();
    setLaedt(true);
    try {
      await api.betriebAnlegen(betrieb.trim(), name.trim(), sprache);
      await neuLaden();
      geheZu('/einrichtung/bereiche', true);
    } catch (err) {
      setFehler(fehlerText(err));
    } finally {
      setLaedt(false);
    }
  }
  return (
    <main className="seite ohne-nav">
      <form className="stapel" onSubmit={los}>
        <div className="etikett" style={{ color: 'var(--akzent)' }}>{t('einrichtung.schritt', { n: 1, von: 5 })}</div>
        <h1 className="titel">{t('einrichtung.betrieb_titel')}</h1>
        <label className="feld"><span>{t('einrichtung.betrieb_name')}</span>
          <input className="eingabe" required placeholder="ÖZ KEBAB" value={betrieb} onChange={(e) => setBetrieb(e.target.value)} /></label>
        <label className="feld"><span>{t('anmelden.dein_name')}</span>
          <input className="eingabe" required value={name} onChange={(e) => setName(e.target.value)} /></label>
        {fehler && <div className="meldung fehler" role="alert"><Icon name="warnung" />{fehler}</div>}
        <button className="knopf-haupt" disabled={laedt}>{laedt ? <span className="laden" /> : t('allg.weiter')}</button>
      </form>
    </main>
  );
}
