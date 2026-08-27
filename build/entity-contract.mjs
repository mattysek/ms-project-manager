#!/usr/bin/env node
//
// Kontrola, že doménové entity mají na obou stranách drátu stejná pole.
//
// `protocol-contract.mjs` hlídá jen NÁZVY commandů a diffů, tedy tag zprávy.
// Uvnitř zprávy ale jede celá entita, a její tvar nehlídalo nic — což stačilo
// na tuhle chybu: F# `Person` má `UserId: string | null` jako běžné pole,
// zatímco TypeScript ho měl jako `userId?`, a klient ho při zakládání osoby
// vůbec neposílal. `FSharp.SystemTextJson` pole nenašel, SignalR odmítl vazbu
// argumentů (`InvalidDataException`) a v Kapacitě nešlo přidat člověka.
// Nespadl přitom žádný test: obě strany si samy o sobě byly konzistentní.
//
// Pravidlo, které se kontroluje: co je na F# straně povinné pole (tj. není
// `option`), musí být na TS straně povinné taky. Volitelnost navíc na F#
// straně vadí méně — `option` unese chybějící i `null` hodnotu.
//
// Použití: node build/entity-contract.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Entity, které klient nikdy nekonstruuje — vznikají na serveru a klient je
 * jen zobrazuje, takže chybějící pole na jeho straně nemůže rozbít příkaz.
 *
 * `FileRef` vytváří REST endpoint z nahraného souboru (ADR-010): velikost,
 * čas a autora zná jen server.
 */
const SERVER_BUILT = new Set(["FileRef"]);

/** `UserId` → `userId`; přesně tak pole pojmenuje serializer na drátu. */
function camel(name) {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * Záznamové typy z `Domain/Types.fs` i s poli.
 *
 * Bere jen víceřádkový zápis `type X =\n  {\n    Pole: typ\n  }`; jednořádkové
 * záznamy (`type AdoNote = { Ts: string; Text: string }`) klient nekonstruuje
 * a parsovat je kvůli tomu nemá cenu.
 */
function parseFSharpRecords(source) {
  const records = new Map();
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const header = /^type\s+(\w+)\s*=\s*$/.exec(lines[i]);
    if (!header || !/^\s*\{\s*$/.test(lines[i + 1] ?? "")) continue;

    const fields = new Map();
    for (let j = i + 2; j < lines.length && !/^\s*\}/.test(lines[j]); j++) {
      const field = /^\s{4,}(\w+)\s*:\s*(.+?)\s*$/.exec(lines[j]);
      if (field) fields.set(camel(field[1]), { optional: /\boption$/.test(field[2]) });
    }
    if (fields.size > 0) records.set(header[1], fields);
  }
  return records;
}

/** Rozhraní z `types/index.ts` — název pole a jestli je `?`. */
function parseTsInterfaces(source) {
  const interfaces = new Map();
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const header = /^export interface (\w+)\s*\{/.exec(lines[i]);
    if (!header) continue;

    const fields = new Map();
    for (let j = i + 1; j < lines.length && !/^\}/.test(lines[j]); j++) {
      const field = /^\s{2,}(\w+)(\??)\s*:/.exec(lines[j]);
      if (field) fields.set(field[1], { optional: field[2] === "?" });
    }
    interfaces.set(header[1], fields);
  }
  return interfaces;
}

const fsharp = parseFSharpRecords(
  readFileSync(join(ROOT, "src/server/MSProjectManager.Server/Domain/Types.fs"), "utf8"),
);
const ts = parseTsInterfaces(readFileSync(join(ROOT, "src/client/types/index.ts"), "utf8"));

const problems = [];
let checked = 0;

for (const [name, serverFields] of fsharp) {
  if (SERVER_BUILT.has(name)) continue;
  const clientFields = ts.get(name);
  if (!clientFields) continue; // typ, který klient nezná pod stejným jménem
  checked++;

  for (const [field, { optional }] of serverFields) {
    if (optional) continue;
    const onClient = clientFields.get(field);
    if (!onClient) {
      problems.push(`${name}.${field} — povinné na serveru, na klientovi chybí`);
    } else if (onClient.optional) {
      problems.push(`${name}.${field} — povinné na serveru, na klientovi volitelné (\`?\`)`);
    }
  }
}

console.log(c.bold("\nKontrakt doménových entit\n"));

if (problems.length === 0) {
  console.log(c.green(`✓ ${checked} entit má na obou stranách stejná povinná pole.\n`));
  process.exit(0);
}

for (const problem of problems) console.log(`  ${c.red("✗")} ${problem}`);
console.log(
  c.dim(
    "\nPole povinné na serveru musí klient vždycky poslat — jinak selže vazba\n" +
      "argumentů v SignalR a celý command se zahodí.\n",
  ),
);
process.exit(1);
