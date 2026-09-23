// SignalR spojení k projektu — FR-COLLAB-01, 02, 03, 06, 08 (PRD-02), ADR-004.
//
// Transport nad `@microsoft/signalr` je schovaný za `ProjectChannelTransport`
// rozhraním (`start`/`stop`/`invoke`/`on`/`off`) — je to JEDINÉ místo v hooku,
// které o SignalR ví (`createSignalRTransport`). Testy injektují fake
// implementaci stejného tvaru přes `options.createTransport`, takže hook jde
// otestovat bez běžícího serveru.
//
// Presence (FR-COLLAB-04) se drží mimo `AppState` — viz ADR-004 doplněk,
// sekce „Presence není součástí AppState". `applyDiff` sám o sobě `presence`
// a `error` diffy ignoruje (nechává doménový stav beze změny); rollback při
// chybě proto řeší tento hook přes `lastConfirmedStateRef` (ADR-004, sekce
// „Optimistická aplikace").

import { HubConnectionBuilder } from '@microsoft/signalr';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyDiff } from '../state/applyDiff';
import type { AppState } from '../state/appState';
import type { PresenceEntry, ProjectCommand, ProjectDiff } from '../types/protocol';

export type ChannelConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface ProjectChannelError {
  message: string;
  commandType: string;
  /**
   * Odkud chyba přišla.
   *
   * `server` = command došel a byl odmítnut (`ErrorOccurred`) — důvod zná jen
   * server a uživateli se musí ukázat, protože jinak mu změna beze slova zmizí.
   *
   * `transport` = command vůbec neodešel. Hláška je surová a anglická
   * („Cannot send data if the connection is not in the 'Connected' State"),
   * takže se uživateli neukazuje: stav spojení už nese `HeaderConnectionStatus`
   * a nedoručené commandy `OfflineBanner` s frontou.
   */
  source: 'server' | 'transport';
}

/**
 * Injektovatelné rozhraní nad SignalR spojením. `on`/`off` pokrývají jak
 * doménové hub eventy (`ReceiveDiff`, …), tak lifecycle eventy spojení
 * (`close`, `reconnecting`, `reconnected`) — výchozí implementace je mapuje
 * na `connection.onclose`/`onreconnecting`/`onreconnected`.
 */
export interface ProjectChannelTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  invoke<T = void>(methodName: string, ...args: unknown[]): Promise<T>;
  // Heterogenní event bus — každý SignalR event (diff/fullState/presence/lifecycle)
  // nese jiný tvar payloadu; konkrétní typ handleru je vynucen na volajícím místě
  // (viz `HubEventHandlers` níže), tady jde jen o obecné (od)registrování posluchače.
  // biome-ignore lint/suspicious/noExplicitAny: viz komentář výše
  on(event: string, handler: (...args: any[]) => void): void;
  // biome-ignore lint/suspicious/noExplicitAny: viz komentář u `on` výše
  off(event: string, handler: (...args: any[]) => void): void;
}

export interface UseProjectChannelOptions {
  createTransport?: (projectId: string) => ProjectChannelTransport;
  /**
   * Pozorovatel KAŽDÉHO přijatého diffu (voláno před i po jeho aplikaci na
   * stav). Hook sám diff nijak neinterpretuje — slouží volajícímu (typicky
   * `useProjectSession`) k odvozeným efektům, které nejsou součástí `AppState`,
   * např. FR-COLLAB-07 notifikace „Hodnota pole X byla změněna jiným
   * uživatelem" (`src/state/fieldWrites.ts`).
   */
  onDiff?: (diff: ProjectDiff) => void;
}

export interface UseProjectChannelResult {
  /** Optimisticky aplikovaný stav projektu; `null`, dokud nedorazí první `full_state`. */
  state: AppState | null;
  /**
   * Roste při každém přijatém `full_state` (join i reconnect). `useOfflineSync`
   * ho používá jako signál „dorazil čerstvý stav ze serveru, je čas na reconnect
   * replay" — `state` samo o sobě mezi diffem a full_state nerozliší.
   */
  fullStateVersion: number;
  presence: PresenceEntry[];
  connectionStatus: ChannelConnectionStatus;
  lastError: ProjectChannelError | null;
  /**
   * Pošle command na server. `applyOptimistic` (pokud je zadán) se aplikuje
   * na lokální stav OKAMŽITĚ, před potvrzením serveru — volající (typicky
   * slice setter v App.tsx) mu předá stejnou mutaci, kterou by dřív provedl
   * lokálně napřímo (ADR-004, „Optimistická aplikace").
   */
  sendCommand: (command: ProjectCommand, applyOptimistic?: (state: AppState) => AppState) => void;
  /**
   * Jako `sendCommand`, ale s výsledkem — promise selže, když odeslání
   * neprojde. Používá přehrávání offline fronty (ADR-009).
   */
  sendCommandAwaitable: (
    command: ProjectCommand,
    applyOptimistic?: (state: AppState) => AppState
  ) => Promise<void>;
  /** Poslední stav potvrzený serverem, bez rozpracovaných optimistických změn. */
  getLastConfirmedState: () => AppState | null;
  /**
   * Aplikuje mutaci na lokální stav BEZ odeslání na server a beze změny
   * `lastConfirmedState` — jediná cesta pro offline commandy (ADR-009):
   * offline nemá smysl volat `transport.invoke`, ten by stejně selhal a
   * vyvolal rollback, který by zahodil právě aplikovanou offline změnu.
   */
  applyLocal: (mutate: (state: AppState) => AppState) => void;
  /**
   * FR-OFFLINE-04: appka může startovat offline, ještě než dorazí (nebo
   * vůbec dorazí) první `full_state`. Volající (`useProjectSession`) tímhle
   * seedne `state` z `project_cache` — no-op, pokud mezitím už dorazil
   * skutečný `full_state` (ten má vždy přednost, seed ho nesmí přepsat).
   */
  seedFromCache: (cached: AppState) => void;
  /**
   * Vyžádá si od serveru čerstvý `full_state` (a tím i nový `fullStateVersion`).
   *
   * Potřebuje to `useOfflineSync`: appku umí do offline režimu poslat i pouhý
   * `navigator.onLine`, aniž by se hub spojení rozpadlo, takže po návratu
   * nepřijde žádný reconnect ani `full_state` a fronta by zůstala neodeslaná.
   */
  requestFullState: () => void;
}

// ── Hub kontrakt (ADR-004 + ADR-009 pseudokód pro `GetFullState`) ───────────

const HUB_METHODS = {
  sendCommand: 'SendCommand',
  getFullState: 'GetFullState',
  joinProject: 'JoinProject',
  leaveProject: 'LeaveProject',
} as const;

const HUB_EVENTS = {
  diff: 'ReceiveDiff',
  fullState: 'ReceiveFullState',
  presence: 'PresenceUpdate',
} as const;

const LIFECYCLE_EVENTS = {
  close: 'close',
  reconnecting: 'reconnecting',
  reconnected: 'reconnected',
} as const;

/** PRD-02, FR-COLLAB-06: exponential backoff, max 3 pokusy. */
const RECONNECT_DELAYS_MS = [1000, 3000, 8000];

function nextRetryDelay(previousRetryCount: number): number | null {
  return previousRetryCount < RECONNECT_DELAYS_MS.length
    ? RECONNECT_DELAYS_MS[previousRetryCount]
    : null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Výchozí transport (@microsoft/signalr) ──────────────────────────────────

function createSignalRTransport(projectId: string): ProjectChannelTransport {
  const connection = new HubConnectionBuilder()
    .withUrl(`/hubs/project?projectId=${encodeURIComponent(projectId)}`)
    .withAutomaticReconnect({
      nextRetryDelayInMilliseconds: (ctx) => nextRetryDelay(ctx.previousRetryCount),
    })
    .build();

  // onclose/onreconnecting/onreconnected mají v @microsoft/signalr každý jinou
  // signaturu handleru — sjednoceno na `ProjectChannelTransport.on`.
  // biome-ignore lint/suspicious/noExplicitAny: viz komentář výše
  const lifecycleRegistrars: Record<string, (handler: (...args: any[]) => void) => void> = {
    [LIFECYCLE_EVENTS.close]: (h) => connection.onclose(h),
    [LIFECYCLE_EVENTS.reconnecting]: (h) => connection.onreconnecting(h),
    [LIFECYCLE_EVENTS.reconnected]: (h) => connection.onreconnected(h),
  };

  return {
    start: () => connection.start(),
    stop: () => connection.stop(),
    invoke: (methodName, ...args) => connection.invoke(methodName, ...args),
    on(event, handler) {
      const registerLifecycle = lifecycleRegistrars[event];
      if (registerLifecycle) registerLifecycle(handler);
      else connection.on(event, handler);
    },
    // SignalR nemá "off" pro lifecycle handlery — žijí s connection instancí,
    // která se zahodí spolu s `stop()` při odpojení/unmountu.
    off(event, handler) {
      if (!lifecycleRegistrars[event]) connection.off(event, handler);
    },
  };
}

// ── Napojení transportu na React stav ───────────────────────────────────────

interface TransportHandlers {
  onDiff: (diff: ProjectDiff) => void;
  onFullState: (state: AppState) => void;
  onPresence: (users: PresenceEntry[]) => void;
  onStatusChange: (status: ChannelConnectionStatus) => void;
}

/** Vrátí "dispose" funkci, která zaregistrované handlery zase odpojí (`transport.off`). */
function attachTransportHandlers(
  transport: ProjectChannelTransport,
  handlers: TransportHandlers,
  projectId: string
): () => void {
  const onClose = () => handlers.onStatusChange('disconnected');
  const onReconnecting = () => handlers.onStatusChange('reconnecting');
  const onReconnected = () => {
    handlers.onStatusChange('connected');
    // FR-COLLAB-06: po reconnectu klient vyžádá full_state a přepíše lokální stav.
    transport
      .invoke<AppState>(HUB_METHODS.getFullState, projectId)
      .then(handlers.onFullState)
      .catch(() => {});
  };

  transport.on(HUB_EVENTS.diff, handlers.onDiff);
  transport.on(HUB_EVENTS.fullState, handlers.onFullState);
  transport.on(HUB_EVENTS.presence, handlers.onPresence);
  transport.on(LIFECYCLE_EVENTS.close, onClose);
  transport.on(LIFECYCLE_EVENTS.reconnecting, onReconnecting);
  transport.on(LIFECYCLE_EVENTS.reconnected, onReconnected);

  return () => {
    transport.off(HUB_EVENTS.diff, handlers.onDiff);
    transport.off(HUB_EVENTS.fullState, handlers.onFullState);
    transport.off(HUB_EVENTS.presence, handlers.onPresence);
    transport.off(LIFECYCLE_EVENTS.close, onClose);
    transport.off(LIFECYCLE_EVENTS.reconnecting, onReconnecting);
    transport.off(LIFECYCLE_EVENTS.reconnected, onReconnected);
  };
}

interface ConnectionCtx {
  projectId: string;
  createTransport: () => ProjectChannelTransport;
  transportRef: { current: ProjectChannelTransport | null };
  handlers: TransportHandlers;
}

/**
 * Tělo connect efektu — vytaženo mimo hook, aby `useProjectChannel` zůstal
 * pod ADR-012 rozpočtem na délku funkce. Připojí transport, zavolá
 * `JoinProject` (ADR-004 doplněk) a vrátí cleanup (`LeaveProject` + `stop`).
 */
function setupProjectConnection(ctx: ConnectionCtx): () => void {
  const { projectId, createTransport, transportRef, handlers } = ctx;
  const transport = createTransport();
  transportRef.current = transport;
  handlers.onStatusChange('connecting');

  const detach = attachTransportHandlers(transport, handlers, projectId);

  transport
    .start()
    .then(() => {
      handlers.onStatusChange('connected');
      // ADR-004 doplněk, „Hub metody — úplný seznam": explicitní JoinProject
      // (ne projectId v query stringu) — server ověří členství, přidá spojení
      // do skupiny `project:{projectId}` a rovnou odpoví full_state.
      return transport.invoke<AppState | undefined>(HUB_METHODS.joinProject, projectId);
    })
    .then((joined) => {
      if (joined) handlers.onFullState(joined);
    })
    .catch(() => handlers.onStatusChange('disconnected'));

  return () => {
    transportRef.current = null;
    detach();
    // FR-COLLAB-08: opustí skupinu a odebere se z presence. Fire-and-forget —
    // spojení se zavírá hned za tím (`transport.stop()`), nečeká se na
    // potvrzení serveru.
    transport.invoke(HUB_METHODS.leaveProject, projectId).catch(() => {});
    transport.stop().catch(() => {});
  };
}

interface DiffReducerCtx {
  onDiffRef: { current: ((diff: ProjectDiff) => void) | undefined };
  setPresence: (users: PresenceEntry[]) => void;
  setLastError: (error: ProjectChannelError | null) => void;
  setState: (updater: (prev: AppState | null) => AppState | null) => void;
  lastConfirmedStateRef: { current: AppState | null };
}

/** Tělo `handleDiff` — vytaženo mimo hook, aby `useProjectChannel` zůstal pod ADR-012 rozpočtem. */
function reduceIncomingDiff(diff: ProjectDiff, ctx: DiffReducerCtx): void {
  const { onDiffRef, setPresence, setLastError, setState, lastConfirmedStateRef } = ctx;
  onDiffRef.current?.(diff);
  if (diff.op === 'presence') {
    setPresence(diff.users);
    return;
  }
  if (diff.op === 'error') {
    setLastError({ message: diff.message, commandType: diff.commandType, source: 'server' });
    setState(() => lastConfirmedStateRef.current);
    return;
  }
  // Potvrzený stav se posouvá NEZÁVISLE na zobrazeném.
  //
  // Dřív se `lastConfirmedState` nastavoval na výsledek `applyDiff(prev, …)`,
  // tedy na stav, ve kterém už byly zapracované vlastní optimistické změny.
  // Když server takovou změnu odmítl, rollback ji „vrátil" na stav, který ji
  // pořád obsahoval — a odmítnutá změna zůstala na obrazovce natrvalo.
  //
  // Vedlejší efekt: přiřazení do refu už není uvnitř `setState` updateru,
  // který má být čistý (a ve StrictMode se volá dvakrát).
  const confirmed = lastConfirmedStateRef.current;
  if (confirmed) lastConfirmedStateRef.current = applyDiff(confirmed, diff);

  setState((prev) => {
    const base = prev ?? lastConfirmedStateRef.current;
    if (!base) return prev;
    return applyDiff(base, diff);
  });
}

interface SendCommandCtx {
  /**
   * Hub má `SendCommand(projectId, command)` — projectId **musí** jít s sebou.
   * Server sice umí `null` doplnit z připojení (`ResolveProject`), ale SignalR
   * váže argumenty podle počtu: vynechaný parametr = `InvalidDataException`
   * a odmítnutý command. Žádná editace tudy dřív neprošla.
   */
  projectId: string | null;
  transportRef: { current: ProjectChannelTransport | null };
  setState: (updater: (prev: AppState | null) => AppState | null) => void;
  setLastError: (error: ProjectChannelError | null) => void;
  lastConfirmedStateRef: { current: AppState | null };
}

/** Tělo `sendCommand` — vytaženo mimo hook, aby `useProjectChannel` zůstal pod ADR-012 rozpočtem. */
/**
 * Odešle command a vrátí promise, která **selže**, když se odeslání nepovede.
 * Volající, kterému na výsledku nezáleží, ji ignoruje (`sendCommand`);
 * přehrávání offline fronty ji naopak potřebuje, aby command nesmazalo
 * z fronty dřív, než ho server skutečně přijal.
 */
function sendCommandViaTransport(
  command: ProjectCommand,
  applyOptimistic: ((state: AppState) => AppState) | undefined,
  ctx: SendCommandCtx
): Promise<void> {
  const { projectId, transportRef, setState, setLastError, lastConfirmedStateRef } = ctx;
  if (applyOptimistic) {
    setState((prev) => (prev ? applyOptimistic(prev) : prev));
  }
  const transport = transportRef.current;
  if (!transport) return Promise.reject(new Error('Není připojení k serveru'));

  return transport.invoke(HUB_METHODS.sendCommand, projectId, command).catch((err: unknown) => {
    setLastError({ message: errorMessage(err), commandType: command.type, source: 'transport' });
    setState(() => lastConfirmedStateRef.current);
    throw err;
  });
}

interface ChannelSetters {
  setState: React.Dispatch<React.SetStateAction<AppState | null>>;
  setFullStateVersion: React.Dispatch<React.SetStateAction<number>>;
  setPresence: React.Dispatch<React.SetStateAction<PresenceEntry[]>>;
  setConnectionStatus: React.Dispatch<React.SetStateAction<ChannelConnectionStatus>>;
  setLastError: React.Dispatch<React.SetStateAction<ProjectChannelError | null>>;
}

/**
 * Napojení na SignalR kanál — připojí se při změně `projectId` a při odpojení
 * uklidí. Settery jdou dovnitř jako jeden objekt; jsou z `useState`, takže
 * jejich identita je stabilní a efekt se kvůli nim znovu nespouští.
 */
function useChannelConnection({
  projectId,
  createTransportRef,
  transportRef,
  lastConfirmedStateRef,
  onDiffRef,
  setters,
}: {
  projectId: string | null;
  createTransportRef: React.MutableRefObject<(projectId: string) => ProjectChannelTransport>;
  transportRef: React.MutableRefObject<ProjectChannelTransport | null>;
  lastConfirmedStateRef: React.MutableRefObject<AppState | null>;
  onDiffRef: React.MutableRefObject<((diff: ProjectDiff) => void) | undefined>;
  setters: ChannelSetters;
}) {
  const { setState, setFullStateVersion, setPresence, setConnectionStatus, setLastError } = setters;

  const handleFullState = useCallback(
    (fullState: AppState) => {
      lastConfirmedStateRef.current = fullState;
      setState(fullState);
      setFullStateVersion((v) => v + 1);
    },
    [lastConfirmedStateRef, setState, setFullStateVersion]
  );

  const handleDiff = useCallback(
    (diff: ProjectDiff) =>
      reduceIncomingDiff(diff, {
        onDiffRef,
        setPresence,
        setLastError,
        setState,
        lastConfirmedStateRef,
      }),
    [onDiffRef, setPresence, setLastError, setState, lastConfirmedStateRef]
  );

  useEffect(() => {
    if (!projectId) {
      setConnectionStatus('disconnected');
      return;
    }
    setLastError(null);
    return setupProjectConnection({
      projectId,
      createTransport: () => createTransportRef.current(projectId),
      transportRef,
      handlers: {
        onDiff: handleDiff,
        onFullState: handleFullState,
        onPresence: setPresence,
        onStatusChange: setConnectionStatus,
      },
    });
  }, [
    projectId,
    handleDiff,
    handleFullState,
    createTransportRef,
    transportRef,
    setPresence,
    setConnectionStatus,
    setLastError,
  ]);

  return handleFullState;
}

/**
 * Akce nad kanálem — odeslání commandu, čtení potvrzeného stavu a lokální
 * mutace. Vytaženo z `useProjectChannel`, aby zůstal pod rozpočtem ADR-012.
 */
function useChannelActions(ctx: SendCommandCtx) {
  const { projectId, transportRef, lastConfirmedStateRef, setState, setLastError } = ctx;

  const sendCommandAwaitable = useCallback(
    (command: ProjectCommand, applyOptimistic?: (state: AppState) => AppState) =>
      sendCommandViaTransport(command, applyOptimistic, {
        projectId,
        transportRef,
        setState,
        setLastError,
        lastConfirmedStateRef,
      }),
    [projectId, transportRef, lastConfirmedStateRef, setState, setLastError]
  );

  // Běžná cesta výsledek neřeší — chybu už ohlásil `setLastError` a stav
  // vrátil rollback, takže neodchycený reject by jen zašuměl konzoli.
  const sendCommand = useCallback(
    (command: ProjectCommand, applyOptimistic?: (state: AppState) => AppState) => {
      void sendCommandAwaitable(command, applyOptimistic).catch(() => {});
    },
    [sendCommandAwaitable]
  );

  const getLastConfirmedState = useCallback(
    () => lastConfirmedStateRef.current,
    [lastConfirmedStateRef]
  );

  const applyLocal = useCallback(
    (mutate: (state: AppState) => AppState) => {
      setState((prev) => (prev ? mutate(prev) : prev));
    },
    [setState]
  );

  return { sendCommand, sendCommandAwaitable, getLastConfirmedState, applyLocal };
}

/**
 * Přepnutí projektu musí zahodit stav předchozího — a to už během renderu,
 * ne v efektu. Jinak by první commit s novým `projectId` nesl ještě starý
 * stav: `useProjectCacheSync` by ho uložil do cache NOVÉHO projektu,
 * `seedFromCache` (`prev ?? cached`) by cache nového projektu ignoroval
 * a UI by na okamžik vydávalo cizí projekt za otevřený.
 */
function useResetOnProjectSwitch(
  projectId: string | null,
  setState: React.Dispatch<React.SetStateAction<AppState | null>>,
  lastConfirmedStateRef: React.MutableRefObject<AppState | null>
): void {
  const [stateProjectId, setStateProjectId] = useState(projectId);
  if (stateProjectId !== projectId) {
    setStateProjectId(projectId);
    setState(null);
    lastConfirmedStateRef.current = null;
  }
}

export function useProjectChannel(
  projectId: string | null,
  options: UseProjectChannelOptions = {}
): UseProjectChannelResult {
  const { createTransport = createSignalRTransport, onDiff } = options;
  const onDiffRef = useRef(onDiff);
  onDiffRef.current = onDiff;

  const [state, setState] = useState<AppState | null>(null);
  const [fullStateVersion, setFullStateVersion] = useState(0);
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ChannelConnectionStatus>('disconnected');
  const [lastError, setLastError] = useState<ProjectChannelError | null>(null);

  const transportRef = useRef<ProjectChannelTransport | null>(null);
  const lastConfirmedStateRef = useRef<AppState | null>(null);

  useResetOnProjectSwitch(projectId, setState, lastConfirmedStateRef);

  // `createTransport` je typicky inline factory (testy, případná budoucí
  // App.tsx integrace) — bez refu by jeho nestabilní identita mezi rendery
  // spouštěla efekt (a tedy `transport.start()`) v nekonečné smyčce. Chceme
  // se znovu připojit jen při reálné změně `projectId`, ne při každém renderu.
  const createTransportRef = useRef(createTransport);
  createTransportRef.current = createTransport;

  const handleFullState = useChannelConnection({
    projectId,
    createTransportRef,
    transportRef,
    lastConfirmedStateRef,
    onDiffRef,
    setters: { setState, setFullStateVersion, setPresence, setConnectionStatus, setLastError },
  });

  /**
   * Vyžádá si čerstvý serverový stav (tj. i nový `fullStateVersion`).
   *
   * Používá to `useOfflineSync` po návratu z offline režimu, který spojení
   * nerozbil: bez `full_state` by se fronta porovnávala proti stavu, do kterého
   * se ještě nemusely stihnout promítnout cizí změny přijaté mezitím, a
   * detekce konfliktů by je přehlédla.
   */
  const requestFullState = useCallback(() => {
    const transport = transportRef.current;
    if (!projectId || !transport) return;
    transport
      .invoke<AppState>(HUB_METHODS.getFullState, projectId)
      .then(handleFullState)
      .catch(() => {});
  }, [projectId, handleFullState]);

  const { sendCommand, sendCommandAwaitable, getLastConfirmedState, applyLocal } =
    useChannelActions({ projectId, transportRef, lastConfirmedStateRef, setState, setLastError });

  const seedFromCache = useCallback((cached: AppState) => {
    setState((prev) => prev ?? cached);
  }, []);

  // Memoizované — bez toho by `useProjectChannel` vracel nový objekt na každý
  // render, a s ním nestabilní identitu `sendCommand`/`applyLocal` (i když ty
  // samotné jsou `useCallback` se stabilními closures). Konzumenti výš
  // (`useCommandDispatch`, `sendPresence` v `useProjectSession`) na tuhle
  // identitu spoléhají ve vlastních `useCallback` deps — bez memoizace by se
  // přepočítávali (a např. posílali `update_presence`) na každý render.
  return useMemo(
    () => ({
      state,
      fullStateVersion,
      presence,
      connectionStatus,
      lastError,
      sendCommand,
      sendCommandAwaitable,
      getLastConfirmedState,
      applyLocal,
      seedFromCache,
      requestFullState,
    }),
    [
      state,
      fullStateVersion,
      presence,
      connectionStatus,
      lastError,
      sendCommand,
      sendCommandAwaitable,
      getLastConfirmedState,
      applyLocal,
      seedFromCache,
      requestFullState,
    ]
  );
}
