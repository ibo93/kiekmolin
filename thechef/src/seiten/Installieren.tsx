// iPhone: auf den Home-Bildschirm legen – sonst gibt es auf iOS keine Push-Nachrichten.
import { useIch } from '../app/kontext.tsx';
import { useT } from '../i18n/i18n.tsx';
import { istInstalliert, istIos } from '../lib/geraet.ts';
import { KopfMitte } from '../ui/bausteine.tsx';
import { Icon } from '../ui/Icon.tsx';

export function Installieren() {
  const { t } = useT();
  const { nutzer } = useIch();
  return <main className="seite ohne-nav"><KopfMitte titel={t('installieren.titel')} ziel={nutzer.rolle === 'chef' ? '/c/einstellungen' : '/m'} /><InstallierenInhalt /></main>;
}

export function InstallierenInhalt() {
  const { t } = useT();
  if (istInstalliert()) return <div className="meldung ok"><Icon name="haken" />{t('installieren.schon')}</div>;
  const schritte = istIos()
    ? [['hochladen', 'installieren.ios_1'], ['plus', 'installieren.ios_2'], ['haken', 'installieren.ios_3'], ['muetze', 'installieren.ios_4']]
    : [['regler', 'installieren.andere_1'], ['plus', 'installieren.andere_2'], ['muetze', 'installieren.ios_4']];
  return (
    <div className="stapel">
      <p className="leise" style={{ margin: 0, fontSize: 17 }}>{istIos() ? t('installieren.warum_ios') : t('installieren.warum')}</p>
      <ol className="stapel" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {schritte.map(([icon, key], i) => (
          <li key={key} className="karte" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <span className="zahl" style={{ fontSize: 28, color: 'var(--akzent)', width: 22 }}>{i + 1}</span>
            <span className="icon-rund"><Icon name={icon} groesse={20} /></span>
            <span style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>{t(key)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
