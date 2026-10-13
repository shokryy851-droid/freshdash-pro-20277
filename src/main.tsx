import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './styles/index.css';
import { configErrors } from './lib/env';
import { ConfigErrorScreen } from './ui/ConfigErrorScreen';

const saved = localStorage.getItem('fdp-theme');
if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;

// Prompt-style update: never swap code under a user mid-checkout
const updateSW = registerSW({
  onNeedRefresh() {
    if (window.confirm('يتوفر تحديث جديد للتطبيق. التحديث الآن؟')) void updateSW(true);
  }
});

const root = createRoot(document.getElementById('root')!);

if (configErrors.length > 0) {
  console.error('[config] missing/invalid environment variables:', configErrors);
  root.render(<ConfigErrorScreen missing={configErrors} />);
} else {
  // Loaded only after configuration is known to be valid
  void import('./app/App').then(({ App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
}
