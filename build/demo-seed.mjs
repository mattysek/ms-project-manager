// Naplní běžící instanci demo daty — spouští ho `build/demo-seed.sh`.
//
// Jede přes **veřejné rozhraní**, ne přes SQL: účty a projekty přes REST, obsah
// projektů přes SignalR jako kterýkoli klient. Ruční zápis do `state_json` by
// obešel reducer i autorizaci a hlavně by se rozešel s actorem, který stav drží
// v paměti (ADR-002) — seed by tak „fungoval" a po prvním commandu by se jeho
// data ztratila. Takhle projde přesně tou cestou, kterou používá aplikace.
//
// Přílohy jdou REST multipartem (ADR-010): obsah souboru se do stavu projektu
// nikdy neposílá.
import * as signalR from '@microsoft/signalr';

const BASE = process.env.SEED_BASE ?? 'http://127.0.0.1:8080';

const ADMIN = { userName: 'admin', displayName: 'Správce systému', password: 'Admin5678' };
const PASSWORD = 'Heslo1234';

const USERS = [
  { userName: 'jan.novak', displayName: 'Jan Novák' },
  { userName: 'petra.kolarova', displayName: 'Petra Kolářová' },
  { userName: 'tomas.vondracek', displayName: 'Tomáš Vondráček' },
  { userName: 'lucie.dvorakova', displayName: 'Lucie Dvořáková' },
];

// ── HTTP s ruční správou cookie ─────────────────────────────────────────────
//
// Node `fetch` cookies mezi voláními nedrží, a hub je potřebuje v hlavičce —
// posílá se stejná session, jakou by měl prohlížeč.

function createSession() {
  let cookie = '';

  async function request(method, path, body, isForm = false) {
    const headers = { ...(cookie ? { Cookie: cookie } : {}) };
    if (body && !isForm) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });

    const setCookie = response.headers.getSetCookie?.() ?? [];
    if (setCookie.length > 0) cookie = setCookie.map((c) => c.split(';')[0]).join('; ');

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${path} → ${response.status} ${text.slice(0, 200)}`);
    }
    return response.status === 204 ? null : response.json().catch(() => null);
  }

  return {
    get cookie() {
      return cookie;
    },
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    postForm: (path, form) => request('POST', path, form, true),
  };
}

/** Přihlásí uživatele; vrací session s jeho cookie. */
async function login(userName, password) {
  const session = createSession();
  await session.post('/auth/login', { userName, password });
  return session;
}

// ── SignalR ─────────────────────────────────────────────────────────────────

/**
 * Připojí se k hubu pod danou session a vrátí odesílač příkazů.
 *
 * Příkazy se posílají **sériově**. Actor je sice sám o sobě serializuje, ale
 * seed staví stav krok po kroku (osoba → její úkol) a paralelní odeslání by
 * pořadí neuhlídalo.
 */
async function connectHub(session, projectId) {
  const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${BASE}/hubs/project?projectId=${encodeURIComponent(projectId)}`, {
      headers: { Cookie: session.cookie },
    })
    .build();

  // Odmítnutý příkaz jinak zmizí beze stopy — server hlásí chybu diffem, ne
  // výjimkou z `invoke`.
  connection.on('ReceiveDiff', (diff) => {
    if (diff?.op === 'error') {
      console.error(`  ! server odmítl ${diff.commandType}: ${diff.message}`);
    }
  });

  await connection.start();
  await connection.invoke('JoinProject', projectId);

  return {
    send: async (command) => connection.invoke('SendCommand', projectId, command),
    stop: () => connection.stop(),
  };
}

// ── Data ────────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 10);

const CATS = {
  analyza: { bg: '#1e1b4b', bd: '#6366f1', tx: '#a5b4fc', label: 'Analýza' },
  vyvoj: { bg: '#0c1a2e', bd: '#3b82f6', tx: '#93c5fd', label: 'Vývoj' },
  testovani: { bg: '#2a1a08', bd: '#f59e0b', tx: '#fcd34d', label: 'Testování' },
  nasazeni: { bg: '#0d2210', bd: '#34d399', tx: '#6ee7b7', label: 'Nasazení' },
};

const ROLES = {
  AR: { label: 'Solution Architect' },
  BE: { label: 'Back-end Developer' },
  FE: { label: 'Front-end Developer' },
  QA: { label: 'Tester' },
};

const PERSON_COLORS = ['#4f9cf9', '#34d399', '#f59e0b', '#a78bfa'];

/** Osoba s plnou alokací; `userId` ji váže na účet (ADR-006). */
function person(name, role, colorIndex, userId = null) {
  return {
    id: uid(),
    userId,
    name,
    role,
    color: PERSON_COLORS[colorIndex % PERSON_COLORS.length],
    weekAlloc: Array(26).fill(100),
  };
}

function task(personId, name, cat, s, e, md, progress, desc = '') {
  return {
    id: uid(),
    p: personId,
    name,
    cat,
    s,
    e,
    md,
    progress,
    desc,
    links: [],
  };
}

function kbPage(title, content, tags) {
  const now = new Date().toISOString();
  return { id: uid(), title, content, createdAt: now, updatedAt: now, tags };
}

/** Textová příloha jako multipart — na obsahu nezáleží, jde o to, že tam je. */
function attachment(name, mimeType, content) {
  const form = new FormData();
  form.append('file', new Blob([content], { type: mimeType }), name);
  return form;
}

// ── Naplnění jednoho projektu ───────────────────────────────────────────────

async function seedBackendProject(session, projectId, accounts) {
  const hub = await connectHub(session, projectId);

  const petra = person('Petra Kolářová', 'BE', 1, accounts['petra.kolarova']);
  const tomas = person('Tomáš Vondráček', 'FE', 2, accounts['tomas.vondracek']);
  const jan = person('Jan Novák', 'AR', 0, accounts['jan.novak']);
  const externista = person('Externí konzultant', 'QA', 3);

  await hub.send({
    type: 'update_project',
    fields: {
      startDate: '2026-01-05',
      endDate: '2026-07-03',
      budget: 240,
      notes:
        '## Kontakty\n\n- **Zadavatel:** oddělení Provozu\n- [Wiki projektu](https://wiki.firma.cz/backend)\n\n' +
        '## Otevřené otázky\n\n1. Kdo přebírá migraci historických dat?\n2. Termín akceptace UAT.',
    },
  });

  await hub.send({ type: 'set_roles', roles: ROLES });
  await hub.send({ type: 'set_cats', cats: CATS });

  for (const p of [jan, petra, tomas, externista]) {
    await hub.send({ type: 'add_person', person: p });
  }

  // Rozdělená alokace: Petra je půl projektu na půl úvazku — v Kapacitě je pak
  // vidět, že sloupce nejsou všude stejné.
  for (let week = 12; week < 20; week++) {
    await hub.send({ type: 'update_alloc', personId: petra.id, weekIdx: week, pct: 50 });
  }

  const tasks = [
    task(jan.id, 'Návrh cílové architektury', 'analyza', 1, 3, 12, 100, 'Rozpad na moduly, ADR.'),
    task(petra.id, 'Refaktoring API vrstvy', 'vyvoj', 2, 6, 20, 60, 'Sjednotit chybové odpovědi.'),
    task(petra.id, 'Migrace historických dat', 'vyvoj', 7, 11, 18, 10),
    task(tomas.id, 'Nové UI seznamu objednávek', 'vyvoj', 3, 8, 22, 45),
    task(tomas.id, 'Přepis formulářů', 'vyvoj', 9, 12, 14, 0),
    task(externista.id, 'Zátěžové testy', 'testovani', 13, 15, 8, 0),
    task(petra.id, 'Oprava nálezů z testů', 'vyvoj', 16, 18, 10, 0),
    task(jan.id, 'Nasazení do produkce', 'nasazeni', 24, 26, 6, 0),
    // Backlog — nepřiřazený úkol, ať je vidět i ta sekce.
    task('', 'Automatizace release pipeline', 'nasazeni', 20, 22, 9, 0),
  ];
  for (const t of tasks) await hub.send({ type: 'add_task', task: t });

  await hub.send({
    type: 'set_milestones',
    milestones: [
      {
        id: uid(),
        title: 'Schválená architektura',
        weekIndex: 2,
        checkItems: [
          { id: uid(), text: 'ADR odsouhlaseno', completed: true },
          { id: uid(), text: 'Odhad pracnosti', completed: true },
        ],
      },
      {
        id: uid(),
        title: 'Alfa verze',
        weekIndex: 11,
        checkItems: [
          { id: uid(), text: 'API hotové', completed: false },
          { id: uid(), text: 'UI hotové', completed: false },
        ],
      },
      { id: uid(), title: 'UAT', weekIndex: 18, checkItems: [] },
      { id: uid(), title: 'Produkce', weekIndex: 25, checkItems: [] },
    ],
  });

  for (const risk of [
    {
      id: uid(),
      sev: 'high',
      who: 'Petra Kolářová',
      title: 'Neznámý objem historických dat',
      detail: 'Migrace může přesáhnout odhad; chybí analýza produkční databáze.',
    },
    {
      id: uid(),
      sev: 'med',
      who: 'Tomáš Vondráček',
      title: 'Závislost na designu',
      detail: 'Návrhy obrazovek nejsou finální, hrozí předělávky.',
    },
    {
      id: uid(),
      sev: 'low',
      who: 'Jan Novák',
      title: 'Dovolené v létě',
      detail: 'Červenec může snížit kapacitu týmu.',
    },
  ]) {
    await hub.send({ type: 'add_risk', risk });
  }

  for (const opp of [
    {
      id: uid(),
      title: 'Sdílení komponent s mobilní aplikací',
      detail: 'Nové UI komponenty se dají použít i v mobilním klientovi.',
    },
    {
      id: uid(),
      title: 'Zrychlení buildu',
      detail: 'Při refaktoringu jde zkrátit CI o několik minut.',
    },
  ]) {
    await hub.send({ type: 'add_opportunity', opp });
  }

  for (const page of [
    kbPage(
      'Onboarding vývojáře',
      '# Onboarding\n\n1. Získat přístup do repozitáře\n2. `./build/build.sh all`\n3. Projít [architekturu](https://wiki.firma.cz/backend)\n\n' +
        '> Zeptej se Jana, pokud něco nesedí.',
      ['onboarding', 'návod']
    ),
    kbPage(
      'Konvence API',
      '## Chybové odpovědi\n\nVšechny chyby vrací `{ "message": "..." }`.\n\n' +
        '| Kód | Význam |\n|---|---|\n| 400 | Neplatný vstup |\n| 403 | Chybí oprávnění |',
      ['api', 'konvence']
    ),
    kbPage(
      'Postup nasazení',
      '## Produkce\n\n- Zálohovat `data/` **i** `keys/`\n- Spustit instalační skript\n- Ověřit přihlášení',
      ['provoz']
    ),
  ]) {
    await hub.send({ type: 'add_kb_page', page });
  }

  // TODO a připomínky jsou per-user (server je posílá jen odesílateli),
  // takže patří přihlášenému účtu — tady Janovi.
  for (const todo of [
    { id: uid(), title: 'Projít pull request od Petry', completed: false, createdAt: new Date().toISOString() },
    { id: uid(), title: 'Připravit podklady pro řídicí výbor', completed: false, createdAt: new Date().toISOString() },
    { id: uid(), title: 'Objednat licence pro testovací prostředí', completed: true, createdAt: new Date().toISOString() },
  ]) {
    await hub.send({ type: 'add_todo', todo });
  }

  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const mondayIso = monday.toISOString().slice(0, 10);

  for (const reminder of [
    {
      id: uid(),
      title: 'Týdenní status meeting',
      description: 'Projít postup a rizika s týmem.',
      startDate: mondayIso,
      recurrence: 'weekly',
      enabled: true,
    },
    {
      id: uid(),
      title: 'Reporting pro vedení',
      description: 'Odeslat souhrn za uplynulý měsíc.',
      startDate: mondayIso,
      recurrence: 'monthly',
      enabled: true,
    },
  ]) {
    await hub.send({ type: 'add_reminder', reminder });
  }

  await hub.stop();

  // Přílohy až po odpojení — jdou REST multipartem, ne přes hub (ADR-010).
  await session.postForm(
    `/api/projects/${projectId}/files`,
    attachment('specifikace.txt', 'text/plain', 'Funkční specifikace — pracovní verze.')
  );
  await session.postForm(
    `/api/projects/${projectId}/files`,
    attachment('zapis-z-porady.txt', 'text/plain', 'Zápis z kickoff porady 5. 1. 2026.')
  );
}

async function seedMobileProject(session, projectId, accounts) {
  const hub = await connectHub(session, projectId);

  const petra = person('Petra Kolářová', 'BE', 1, accounts['petra.kolarova']);
  const lucie = person('Lucie Dvořáková', 'FE', 2, accounts['lucie.dvorakova']);

  await hub.send({
    type: 'update_project',
    fields: {
      startDate: '2026-02-02',
      endDate: '2026-06-26',
      budget: 90,
      notes: 'Menší projekt běžící souběžně — slouží k ukázce vytížení napříč projekty.',
    },
  });
  await hub.send({ type: 'set_roles', roles: ROLES });
  await hub.send({ type: 'set_cats', cats: CATS });

  for (const p of [petra, lucie]) await hub.send({ type: 'add_person', person: p });

  // Petra má úkoly v obou projektech ve stejných týdnech — právě to udělá
  // z „Moje práce" smysluplnou obrazovku.
  for (const t of [
    task(petra.id, 'Napojení na nové API', 'vyvoj', 2, 5, 12, 30),
    task(lucie.id, 'Přihlášení v aplikaci', 'vyvoj', 1, 4, 10, 70),
    task(lucie.id, 'Offline režim', 'vyvoj', 6, 9, 14, 0),
  ]) {
    await hub.send({ type: 'add_task', task: t });
  }

  await hub.send({
    type: 'set_milestones',
    milestones: [{ id: uid(), title: 'Beta pro testery', weekIndex: 9, checkItems: [] }],
  });

  await hub.send({
    type: 'add_kb_page',
    page: kbPage('Podporovaná zařízení', '- Android 12+\n- iOS 16+', ['mobil']),
  });

  await hub.stop();
}

// ── Průběh ──────────────────────────────────────────────────────────────────

async function ensureAdmin() {
  const setup = await createSession().get('/auth/setup-required');
  if (setup?.required) {
    const session = createSession();
    await session.post('/auth/setup', ADMIN);
    return session;
  }
  return login(ADMIN.userName, ADMIN.password);
}

/** Účty; existující se přeskočí, aby druhý běh se `--keep` neshodil seed. */
async function ensureUsers(admin) {
  for (const user of USERS) {
    try {
      await admin.post('/admin/users', { ...user, password: PASSWORD });
    } catch {
      // Už existuje.
    }
  }
  const all = await admin.get('/admin/users');
  return Object.fromEntries(all.map((u) => [u.userName, u.id]));
}

async function main() {
  const admin = await ensureAdmin();
  const accounts = await ensureUsers(admin);

  const jan = await login('jan.novak', PASSWORD);

  const backend = await jan.post('/api/projects', { name: 'Backend refaktoring' });
  const mobile = await jan.post('/api/projects', { name: 'Mobilní klient' });
  const archived = await jan.post('/api/projects', { name: 'Migrace intranetu (2025)' });

  for (const [projectId, members] of [
    [backend.id, ['petra.kolarova', 'tomas.vondracek']],
    [mobile.id, ['petra.kolarova', 'lucie.dvorakova']],
  ]) {
    for (const userName of members) {
      await jan.post(`/api/projects/${projectId}/members`, {
        userId: accounts[userName],
        role: 'dev',
      });
    }
  }

  console.log('  ▸ Backend refaktoring');
  await seedBackendProject(jan, backend.id, accounts);
  console.log('  ▸ Mobilní klient');
  await seedMobileProject(jan, mobile.id, accounts);

  // Quick Notes jsou per-user a jdou REST, ne přes hub (PRD-04). Id posílá
  // klient, aby poznámka měla identitu ještě před dohráním (offline.feature).
  console.log('  ▸ Quick Notes');
  for (const note of [
    { content: 'Zeptat se Petry na stav migrace.', linkedProjectId: backend.id },
    { content: '**Nápad:** sjednotit chybové hlášky napříč službami.', linkedProjectId: null },
    { content: 'Objednat školení na nový build systém.', linkedProjectId: null },
  ]) {
    await jan.post('/api/quick-notes', { id: uid(), ...note });
  }

  // Archiv, ať je vidět i ta sekce na LandingPage a režim „jen ke čtení".
  await jan.post(`/api/projects/${archived.id}/archive`);
  console.log('  ▸ Migrace intranetu (2025) — archivováno');
}

main().catch((err) => {
  console.error(`✗ Seed selhal: ${err.message}`);
  process.exit(1);
});
