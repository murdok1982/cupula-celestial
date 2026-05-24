import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { env } from './env';
import './styles/globals.css';
import './i18n';
// Importa el authStore para registrar el accessor del cliente API
import './store/authStore';

async function bootstrap(): Promise<void> {
  if (env.VITE_USE_MOCKS) {
    const { worker } = await import('./mocks/browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: '/mockServiceWorker.js' },
    });
    // Carga escenario default al arrancar para que el dashboard tenga datos
    const { loadScenario } = await import('./mocks/scenarios');
    setTimeout(() => loadScenario('single-hostile'), 200);
  }

  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('No se encontro el elemento #root');

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
