// Stempelt den Service Worker bei jedem Build mit einer Versionsnummer aus
// dem Inhalt aller Dateien und trägt die Liste der App-Dateien ein.
//
// Bei Kiek mol in musste CACHE in sw.js von Hand hochgezählt werden – wer
// es vergaß, lieferte an die Geräte die alte App aus (25.08.2026). Hier
// gibt es nichts zu vergessen: jede Änderung ergibt eine neue Nummer.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

export function serviceWorker(): Plugin {
  return {
    name: 'chef-service-worker',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const dateien = Object.keys(bundle).filter((f) => !f.endsWith('.map')).sort();
      const hash = createHash('sha256');
      for (const f of dateien) {
        const b = bundle[f];
        hash.update(f);
        hash.update(b.type === 'chunk' ? b.code : typeof b.source === 'string' ? b.source : Buffer.from(b.source));
      }
      const version = hash.digest('hex').slice(0, 12);
      const vorlage = readFileSync(new URL('../src/sw-vorlage.js', import.meta.url), 'utf8');
      const code = vorlage
        .replace('__VERSION__', version)
        .replace('__DATEIEN__', JSON.stringify(['/', ...dateien.filter((f) => f !== 'index.html').map((f) => '/' + f)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: code });
      this.emitFile({ type: 'asset', fileName: 'version.txt', source: version + '\n' });
    },
  };
}
