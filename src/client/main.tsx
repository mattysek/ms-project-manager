import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Import fonts locally (offline support)
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-mono/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import App from './App';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Chybí element #root — zkontroluj index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
