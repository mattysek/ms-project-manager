import type {
  Project,
  Person,
  Task,
  Risk,
  Opportunity,
  Categories,
  SeverityConfigMap,
  Roles,
} from '../types';

// ── LAYOUT ───────────────────────────────────────────────────────────────────
export const CELL_W = 76;
export const LANE_H = 26;
export const LANE_G = 3;
export const NAME_W = 148;

// ── SEVERITY CONFIG ──────────────────────────────────────────────────────────
export const SEV_CFG: SeverityConfigMap = {
  high: { bg: '#2a1010', bd: '#f87171', tx: '#fca5a5', label: 'VYSOKÉ' },
  med: { bg: '#2a2010', bd: '#f59e0b', tx: '#fcd34d', label: 'STŘEDNÍ' },
  low: { bg: '#1a2a10', bd: '#34d399', tx: '#6ee7b7', label: 'NÍZKÉ' },
};

// ── INITIAL CATEGORIES ───────────────────────────────────────────────────────
export const INIT_CATS: Categories = {
  obecne: { bg: '#111827', bd: '#4b5563', tx: '#94a3b8', label: 'Obecné' },
};

// ── INITIAL ROLES ───────────────────────────────────────────────────────────
export const INIT_ROLES: Roles = {
  AR: { label: 'Solution Architect' },
  BE: { label: 'Back-end Developer' },
  FE: { label: 'Front-end Developer' },
  TE: { label: 'Tester' },
};

// ── PERSON COLORS ────────────────────────────────────────────────────────────
export const PERSON_COLORS = [
  '#4f9cf9',
  '#34d399',
  '#06b6d4',
  '#a78bfa',
  '#fbbf24',
  '#f87171',
  '#fb923c',
  '#e879f9',
  '#a3e635',
  '#38bdf8',
];

// ── INITIAL DATA ─────────────────────────────────────────────────────────────
export const INIT_PROJECT: Project = {
  name: 'Nový projekt',
  startDate: '',
  endDate: '',
  budget: 100,
  milestones: [],
  notes: '',
  changelog: [],
};

export const INIT_PEOPLE: Person[] = [];
export const INIT_TASKS: Task[] = [];
export const INIT_RISKS: Risk[] = [];
export const INIT_OPPS: Opportunity[] = [];

// ── MONTH NAMES ──────────────────────────────────────────────────────────────
export const MONTH_NAMES = [
  'Leden',
  'Únor',
  'Březen',
  'Duben',
  'Květen',
  'Červen',
  'Červenec',
  'Srpen',
  'Září',
  'Říjen',
  'Listopad',
  'Prosinec',
];

export const MONTH_COLORS = [
  '#1e3a5f',
  '#1a3a2e',
  '#3b1f00',
  '#1e2a3a',
  '#2a1a3a',
  '#0a2a1a',
  '#2a2a0a',
  '#1a1a2a',
  '#2a1a1a',
  '#1a2a2a',
  '#2a1a2a',
  '#0a1a2a',
];

// ── HOLIDAY NAMES ────────────────────────────────────────────────────────────
export const HOLIDAY_NAMES: Record<string, string> = {
  '01-01': 'Nový rok',
  '05-01': 'Svátek práce',
  '05-08': 'Den vítězství',
  '07-05': 'Cyril a Metoděj',
  '07-06': 'Jan Hus',
  '09-28': 'Den české státnosti',
  '10-28': 'Vznik ČSR',
  '11-17': 'Den svobody',
  '12-24': 'Štědrý den',
  '12-25': '1. svátek vánoční',
  '12-26': '2. svátek vánoční',
  GF: 'Velký pátek',
  EM: 'Velikonoční pondělí',
};

// ── TABS ─────────────────────────────────────────────────────────────────────
export const TABS: [string, string][] = [
  ['projekt', 'Projekt'],
  ['gantt', 'Harmonogram'],
  ['seznam', 'Úkoly'],
  ['kapacita', 'Kapacita'],
  ['rizika', 'Stav & Rizika'],
  ['ado', 'ADO Sync'],
  ['soubory', 'Soubory'],
  ['todo', 'TODO'],
  ['kb', 'Dokumentace'],
];
