// Capacitor: dieselbe App als echte iPhone-App (Xcode / App Store).
// Bundle-ID bei Bedarf in Xcode anpassen – sie muss zu deinem Apple-Entwicklerkonto passen.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.kiekmolin.thechef',
  appName: 'The Chef',
  webDir: 'dist',
  backgroundColor: '#1F4FD1',
  ios: {
    contentInset: 'never',
    // Kamera & Mikrofon laufen über den WebView (getUserMedia); die Texte dafür stehen in Info.plist.
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
