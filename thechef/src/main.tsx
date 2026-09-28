import { createRoot } from 'react-dom/client';
import './stil/tokens.css';
import './stil/ui.css';
import { App } from './app/App.tsx';
import { swRegistrieren } from './lib/sw.ts';
import { tastaturBeobachten } from './lib/tastatur.ts';

createRoot(document.getElementById('app')!).render(<App />);
swRegistrieren();
tastaturBeobachten();
