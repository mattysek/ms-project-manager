#!/usr/bin/env node
//
// Kontrola pokrytí Gherkin scénářů testy.
//
// docs/features/*.feature jsou akceptační kritéria. Tenhle skript ověří, že
// každý scénář má někde v testech svůj protějšek — a naopak že žádný test
// neodkazuje na scénář, který mezitím z feature souboru zmizel.
//
// Vazba se dělá značkou v komentáři testu (syntaxe je stejná v TS i v F#):
//
//     // @scenario: auth.feature > Úspěšné přihlášení
//
// Pokud je feature soubor spouštěný přímo Gherkin runnerem (TickSpec), patří
// blok značek k modulu se step definitions — runner sám ohlídá, že kroky mají
// vazbu, tenhle skript hlídá, že nechybí celý scénář.
//
// Použití:
//   node build/scenario-coverage.mjs           — report + exit 1 při mezerách
//   node build/scenario-coverage.mjs --summary — jen souhrnná tabulka

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FEATURES_DIR = join(ROOT, "docs/features");

/** Adresáře prohledávané na značky @scenario. */
//
// Klient i server žijí pod src/ (src/client, src/server). `e2e/` je tu taky,
// protože některé scénáře nejdou pokrýt jinde — proklik z přehledu do projektu
// je celý o routingu mezi obrazovkami a v jednotkovém testu by z něj zbyla jen
// kontrola, že se zavolal callback.
//
// Pozor na důsledek: `build.sh test` E2E NESPOUŠTÍ. Scénář pokrytý jen
// značkou v `e2e/` je tedy v téhle bráně zelený, i když ho poslední běh
// `build.sh test` neprovedl — ověří ho až `./e2e/run.sh`.
const TEST_ROOTS = ["src", "e2e"];
const TEST_EXTENSIONS = [".ts", ".tsx", ".fs", ".fsx"];
const IGNORED_DIRS = new Set(["node_modules", "bin", "obj", "dist", "wwwroot", ".git"]);

const SCENARIO_RE = /^\s*Scenario(?:\s+Outline)?:\s*(.+?)\s*$/;
const MARKER_RE = /@scenario:\s*([\w.-]+\.feature)\s*>\s*(.+?)\s*$/;

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/** Klíč scénáře — název sám o sobě není unikátní napříč soubory. */
const key = (feature, scenario) => `${feature} > ${scenario}`;

function readFeatures() {
  const byFeature = new Map();
  for (const file of readdirSync(FEATURES_DIR).filter((f) => f.endsWith(".feature")).sort()) {
    const scenarios = readFileSync(join(FEATURES_DIR, file), "utf8")
      .split("\n")
      .map((line) => line.match(SCENARIO_RE))
      .filter(Boolean)
      .map((m) => m[1]);
    byFeature.set(file, scenarios);
  }
  return byFeature;
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (TEST_EXTENSIONS.some((ext) => entry.endsWith(ext))) yield full;
  }
}

function readMarkers() {
  const markers = new Map(); // klíč scénáře → seznam souborů, které si ho nárokují
  for (const root of TEST_ROOTS) {
    for (const file of walk(join(ROOT, root))) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (const line of lines) {
        const m = line.match(MARKER_RE);
        if (!m) continue;
        const k = key(basename(m[1]), m[2]);
        if (!markers.has(k)) markers.set(k, []);
        markers.get(k).push(relative(ROOT, file));
      }
    }
  }
  return markers;
}

function main() {
  const summaryOnly = process.argv.includes("--summary");
  const features = readFeatures();
  const markers = readMarkers();

  const missing = [];
  let total = 0;
  let covered = 0;

  const rows = [];
  for (const [feature, scenarios] of features) {
    const gaps = scenarios.filter((s) => !markers.has(key(feature, s)));
    total += scenarios.length;
    covered += scenarios.length - gaps.length;
    rows.push({ feature, done: scenarios.length - gaps.length, total: scenarios.length });
    for (const s of gaps) missing.push(key(feature, s));
  }

  const known = new Set([...features].flatMap(([f, ss]) => ss.map((s) => key(f, s))));
  const orphans = [...markers.keys()].filter((k) => !known.has(k));

  console.log(c.bold("\nPokrytí Gherkin scénářů\n"));
  const width = Math.max(...rows.map((r) => r.feature.length));
  for (const { feature, done, total: t } of rows) {
    const full = done === t;
    const bar = `${String(done).padStart(3)}/${String(t).padEnd(3)}`;
    const paint = full ? c.green : done === 0 ? c.red : c.yellow;
    console.log(`  ${feature.padEnd(width)}  ${paint(bar)}  ${full ? "✓" : ""}`);
  }
  const pct = total === 0 ? 0 : Math.round((covered / total) * 100);
  console.log(`\n  ${c.bold("celkem".padEnd(width))}  ${covered}/${total}  (${pct} %)\n`);

  if (!summaryOnly && missing.length > 0) {
    console.log(c.red(`Bez testu (${missing.length}):`));
    for (const m of missing) console.log(`  ${c.dim("—")} ${m}`);
    console.log();
  }

  if (orphans.length > 0) {
    console.log(c.yellow(`Značka odkazuje na neexistující scénář (${orphans.length}):`));
    for (const o of orphans) console.log(`  ${c.dim("—")} ${o}  ${c.dim(markers.get(o).join(", "))}`);
    console.log();
  }

  if (missing.length > 0 || orphans.length > 0) process.exit(1);
  console.log(c.green(`✓ Všech ${total} scénářů má vazbu na test.\n`));
}

main();
