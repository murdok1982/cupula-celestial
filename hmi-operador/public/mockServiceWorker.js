/* eslint-disable */
/* tslint:disable */

/**
 * Mock Service Worker (placeholder).
 * En produccion se sobrescribe ejecutando: pnpm msw:init
 *
 * Este archivo se incluye para que el primer `pnpm dev` no falle si el
 * desarrollador olvida ejecutar `msw init`. El MSW v2 detecta version
 * incompatible y aborta con un mensaje claro indicando al usuario que
 * ejecute `pnpm msw:init`.
 *
 * Marca de version manejada por la libreria MSW. Si el cliente MSW detecta
 * que este archivo no esta actualizado, registra un warning visible.
 */
const PACKAGE_VERSION = '2.4.9';
const INTEGRITY_CHECKSUM = 'placeholder';

self.addEventListener('install', () => {
  // Activa el worker inmediatamente
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', async (event) => {
  const clientId = event.source && event.source.id;
  if (!clientId || !self.clients) return;
  const client = await self.clients.get(clientId);
  if (!client) return;

  switch (event.data && event.data.type) {
    case 'KEEPALIVE_REQUEST':
      client.postMessage({ type: 'KEEPALIVE_RESPONSE' });
      break;
    case 'INTEGRITY_CHECK_REQUEST':
      client.postMessage({
        type: 'INTEGRITY_CHECK_RESPONSE',
        payload: { packageVersion: PACKAGE_VERSION, checksum: INTEGRITY_CHECKSUM },
      });
      break;
    case 'MOCK_ACTIVATE':
      client.postMessage({ type: 'MOCKING_ENABLED', payload: true });
      break;
    case 'MOCK_DEACTIVATE':
    case 'CLIENT_CLOSED':
      // no-op
      break;
  }
});

// Sin handlers fetch: el cliente MSW v2 inyecta los handlers en runtime.
// Este archivo solo proporciona el contrato de mensajeria minimo.
