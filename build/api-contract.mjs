#!/usr/bin/env node
// Kontrola, že REST cesty volané klientem server skutečně mapuje.
//
// Vzniklo z chyby, kterou nemohl chytit žádný unit test: klient volal
// `/projects`, server mapoval `/api/projects`. Obě strany mají vlastní testy,
// ve kterých je ta druhá zamockovaná, takže obojí bylo „zelené" a landing
// page přitom proti skutečnému serveru nefungovala. `/projects` spadlo na SPA
// fallback, vrátilo `index.html` a chyba se ztratila v `alert`u.
//
// Stejný princip jako `protocol-contract.mjs`, jen pro REST místo SignalR.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CLIENT_API_DIR = 'src/client/api';
const ENDPOINTS = 'src/server/MSProjectManager.Server/Hosting/Endpoints.fs';

/** Cesty, které klient nevolá přes `api/` moduly (obsluhuje je prohlížeč sám). */
const CLIENT_INTERNAL = new Set(['/login']);

/** `${...}` i `{id}` → `{}`; případný query string se zahazuje. */
const normalize = (path) =>
  path
    // `${…}` může obsahovat vnořené závorky (ternární výraz v šabloně), takže
    // se cesta radši usekne na jeho začátku — dál je stejně jen parametr.
    .split('${')[0]
    .replace(/\{[^}]*\}/g, '{}')
    .split('?')[0]
    .replace(/\/$/, '');

/**
 * Odstraní komentáře, ať se cesty zmíněné v dokumentaci nepovažují za volání.
 */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

function serverRoutes() {
  const source = readFileSync(ENDPOINTS, 'utf8');
  const routes = new Set();
  for (const match of source.matchAll(/Map(?:Get|Post|Put|Patch|Delete)\("([^"]+)"/g)) {
    routes.add(normalize(match[1]));
  }
  return routes;
}

function clientCalls() {
  const calls = [];
  const files = readdirSync(CLIENT_API_DIR).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts')
  );

  for (const file of files) {
    const source = stripComments(readFileSync(join(CLIENT_API_DIR, file), 'utf8'));
    for (const match of source.matchAll(/['"`](\/(?:api|auth|admin|projects)[^'"`]*)['"`]/g)) {
      calls.push({ file, path: normalize(match[1]) });
    }
  }
  return calls;
}

const routes = serverRoutes();
/**
 * Cesta sedí, když ji server mapuje přesně, nebo je prefixem mapované cesty
 * s parametrem (`/api/files/` ↔ `/api/files/{}`).
 */
const isMapped = (path) =>
  routes.has(path) ||
  [...routes].some((route) => route.replace(/\{\}$/, '').replace(/\/$/, '') === path);

const missing = clientCalls().filter(({ path }) => !isMapped(path) && !CLIENT_INTERNAL.has(path));

if (missing.length > 0) {
  console.error('\x1b[31m✗ Klient volá cesty, které server nemapuje:\x1b[0m');
  for (const { file, path } of missing) console.error(`  — ${path}  \x1b[2m${file}\x1b[0m`);
  console.error('\nZkontroluj Hosting/Endpoints.fs a src/client/api/.');
  process.exit(1);
}

console.log(`\x1b[32m✓ Všech ${routes.size} serverových cest a volání klienta souhlasí.\x1b[0m`);
