#!/usr/bin/env node
//
// Kontrola, že wire protokol serveru a klienta se neroze­šel.
//
// ADR-004 mezi negativními důsledky přímo jmenuje, že typy `ProjectCommand`
// a `ProjectDiff` musí být na obou stranách udržované ručně a hrozí
// desynchronizace. Ta se neprojeví ani jako chyba překladu, ani jako spadlý
// test — klient prostě tiše zahodí diff, kterému nerozumí, a uživatel vidí
// zastaralá data. Přesně tak vypadly `alloc_updated`,
// `milestone_checklist_updated` a přejmenování `file_updated`
// → `file_note_updated`.
//
// Skript porovná názvy case v F# DU s literály v `src/client/types/protocol.ts`.
// Tagy na wire vznikají z názvů case převodem na snake_case (viz `tagOf`
// v `Protocol/Json.fs`), pokud je nepřepisuje atribut `JsonName`.
//
// Použití: node build/protocol-contract.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Commandy, které klient **nikdy** posílat nebude — vznikají uvnitř serveru.
 *
 * Obsah souboru jde podle ADR-010 přes REST, protože multipart nejde poslat
 * přes SignalR; REST handler pak commandem nakrmí actor, aby změna prošla
 * stejnou cestou jako všechno ostatní a rozeslala se jako diff. Týká se to
 * ale jen BLOBu — `update_file_note` je obyčejný text a chodí normálním
 * command kanálem jako cokoli jiného.
 */
const SERVER_INTERNAL = {
  add_file: "upload jde přes REST (ADR-010), command posílá server sám sobě",
  delete_file: "mazání jde přes REST (ADR-010)",
};

/**
 * Case, které na klientovi vědomě **zatím** nejsou, protože migrace ještě
 * neproběhla. Na rozdíl od `SERVER_INTERNAL` mají tenhle seznam jednou
 * opustit — každá položka je dluh, ne rozhodnutí.
 */
const PENDING = {
  update_milestone_checklist: "UI checklistu zatím posílá set_milestones",
};

/** Obaly skupin commandů — na wire se neobjeví. */
const GROUP_WRAPPERS = new Set([
  "TaskCmd",
  "PeopleCmd",
  "ProjectMetaCmd",
  "RiskCmd",
  "KnowledgeCmd",
  "PersonalCmd",
  "FileCmd",
  "AdoCmd",
  "SessionCmd",
]);

const snake = (name) => name.replace(/(?<!^)(?=[A-Z])/g, "_").toLowerCase();

/** Wire tagy z case v daném úseku F# zdroje, i s přepisem přes [<JsonName>]. */
function tagsIn(body) {
  const tags = new Set();
  for (const line of body.split("\n")) {
    const match = line.match(/^\s*\|\s*(?:\[<JsonName\s+"([a-z_]+)">\]\s*)?([A-Z][A-Za-z0-9]*)/);
    if (!match) continue;
    const [, jsonName, caseName] = match;
    if (GROUP_WRAPPERS.has(caseName)) continue;
    tags.add(jsonName ?? snake(caseName));
  }
  return tags;
}

/** Case jednoho pojmenovaného DU. */
function fsharpCases(source, typeName) {
  const start = source.indexOf(`type ${typeName}`);
  if (start === -1) throw new Error(`Typ ${typeName} v F# zdroji nenalezen`);

  // DU končí prvním modulovým `let` nebo dalším `type` na začátku řádku.
  const rest = source.slice(start);
  const end = rest.search(/\n(let|type|\/\/\s*──)/);
  return tagsIn(end === -1 ? rest : rest.slice(0, end));
}

/**
 * `ProjectCommand` je jen obal nad skupinovými DU (`TaskCommand`,
 * `AdoCommand`…) — plochý DU se 40 case by v dispatchi porušil limit
 * složitosti z ADR-012. Na wire se ale posílá plochý tvar, takže tagy sbíráme
 * ze všech skupin.
 */
function commandTags(source) {
  return tagsIn(source);
}

function compare(label, serverTags, clientTags) {
  const missingOnClient = [...serverTags].filter((tag) => !clientTags.has(tag)).sort();
  const unknownToServer = [...clientTags].filter((tag) => !serverTags.has(tag)).sort();

  const unexcused = missingOnClient.filter(
    (tag) => !(tag in PENDING) && !(tag in SERVER_INTERNAL)
  );
  const pending = missingOnClient.filter((tag) => tag in PENDING);
  const internal = missingOnClient.filter((tag) => tag in SERVER_INTERNAL);

  console.log(c.bold(`\n${label}`));
  console.log(`  server ${serverTags.size}  ·  klient ${clientTags.size}`);

  if (internal.length > 0) {
    console.log(c.dim(`  ${internal.length} jen interních na serveru (návrhem)`));
  }
  if (pending.length > 0) {
    console.log(c.yellow(`  ${pending.length} čeká na migraci klienta`));
  }

  for (const tag of unexcused) {
    console.log(c.red(`  ✗ ${tag} — server posílá, klient nezná`));
  }
  for (const tag of unknownToServer) {
    console.log(c.red(`  ✗ ${tag} — klient očekává, server neposílá`));
  }

  return unexcused.length + unknownToServer.length;
}

function main() {
  const commandsFs = readFileSync(
    join(ROOT, "src/server/MSProjectManager.Server/Domain/Commands.fs"),
    "utf8"
  );
  const diffsFs = readFileSync(join(ROOT, "src/server/MSProjectManager.Server/Domain/Diffs.fs"), "utf8");
  const protocolTs = readFileSync(join(ROOT, "src/client/types/protocol.ts"), "utf8");

  const clientCommands = new Set([...protocolTs.matchAll(/type: '([a-z_]+)'/g)].map((m) => m[1]));
  const clientDiffs = new Set([...protocolTs.matchAll(/op: '([a-z_]+)'/g)].map((m) => m[1]));

  let failures = 0;
  failures += compare("Commandy (klient → server)", commandTags(commandsFs), clientCommands);
  failures += compare("Diffy (server → klient)", fsharpCases(diffsFs, "ProjectDiff"), clientDiffs);

  // Položka, která se mezitím doplnila, musí ze seznamu výjimek zmizet —
  // jinak by seznam tiše zakrýval budoucí rozpory.
  const stale = [...Object.keys(PENDING), ...Object.keys(SERVER_INTERNAL)].filter(
    (tag) => clientCommands.has(tag) || clientDiffs.has(tag)
  );
  if (stale.length > 0) {
    console.log(c.yellow(`\nZbytečné výjimky (klient je už zná): ${stale.join(", ")}`));
    failures += stale.length;
  }

  if (failures > 0) {
    console.log(c.red(`\n✗ Protokol se rozešel — ${failures} rozporů.\n`));
    process.exit(1);
  }
  console.log(c.green("\n✓ Protokol serveru a klienta souhlasí.\n"));
}

main();
