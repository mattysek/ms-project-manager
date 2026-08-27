#!/usr/bin/env node
// Kontrola, že klient volá hub metody se správným počtem argumentů.
//
// Vzniklo z chyby, která shodila celou aplikaci a přitom byla neviditelná:
// hub má `SendCommand(projectId, command)`, ale klient posílal jen `command`.
// SignalR váže argumenty podle počtu, takže **každý** command skončil
// `InvalidDataException` a nic se nedalo uložit. Testy to nechytily — .NET
// testovací klient posílá oba argumenty, takže na serveru bylo vše zelené.
//
// Doplněk k `protocol-contract.mjs`: ten hlídá tvar zpráv, tenhle jejich volání.
import { readFileSync } from 'node:fs';

const HUB = 'src/server/MSProjectManager.Server/Realtime/ProjectHub.fs';
const CHANNEL = 'src/client/hooks/useProjectChannel.ts';

/** `member this.Name(a: T, b: U)` → počet parametrů. */
function hubMethods() {
  const source = readFileSync(HUB, 'utf8');
  const methods = new Map();
  for (const match of source.matchAll(/member\s+(?:this|_)\.(\w+)\s*\(([^)]*)\)/g)) {
    const [, name, params] = match;
    if (name.startsWith('On') || methods.has(name)) continue;
    const count = params.trim() === '' ? 0 : params.split(',').length;
    methods.set(name, count);
  }
  return methods;
}

/** `HUB_METHODS = { key: 'Name' }` → mapa klíč → název hub metody. */
function methodNames(source) {
  const block = source.match(/const HUB_METHODS = \{([\s\S]*?)\}/)?.[1] ?? '';
  const names = new Map();
  for (const match of block.matchAll(/(\w+):\s*'(\w+)'/g)) names.set(match[1], match[2]);
  return names;
}

/** `invoke(HUB_METHODS.x, a, b)` → počet předaných argumentů. */
function clientCalls() {
  const source = readFileSync(CHANNEL, 'utf8');
  const names = methodNames(source);
  const calls = [];
  for (const match of source.matchAll(/invoke(?:<[^>]*>)?\(\s*HUB_METHODS\.(\w+)([^)]*)\)/g)) {
    const [, key, rest] = match;
    const args = rest.split(',').filter((part) => part.trim() !== '').length;
    calls.push({ method: names.get(key) ?? key, args });
  }
  return calls;
}

const methods = hubMethods();
const mismatches = clientCalls().filter(({ method, args }) => methods.get(method) !== args);

if (mismatches.length > 0) {
  console.error('\x1b[31m✗ Klient volá hub metody se špatným počtem argumentů:\x1b[0m');
  for (const { method, args } of mismatches) {
    console.error(`  — ${method}: klient posílá ${args}, hub čeká ${methods.get(method) ?? '?'}`);
  }
  console.error('\nSignalR váže argumenty podle počtu — nesoulad = InvalidDataException.');
  process.exit(1);
}

console.log('\x1b[32m✓ Volání hub metod souhlasí s jejich signaturami.\x1b[0m');
