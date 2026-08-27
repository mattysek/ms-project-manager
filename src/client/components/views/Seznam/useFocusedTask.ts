// Otevření detailu úkolu, na který se přišlo odjinud (proklik z „Moje práce").
import { useEffect, useRef } from 'react';
import type { Task } from '../../../types';

/**
 * Rozbalí detail úkolu, jakmile ten úkol dorazí do stavu.
 *
 * Čeká se schválně: po přepnutí projektu je `tasks` chvíli prázdný, dokud
 * nepřijde `full_state`. Kdyby se detail otevíral hned, byl by prázdný nebo
 * by se neotevřel vůbec.
 *
 * `handledRef` hlídá, že se otevře jednou. Bez něj by `openDetail` běžel při
 * každém překreslení a uživatel by nemohl detail zavřít.
 */
export function useFocusedTask(
  focusTaskId: string | null | undefined,
  onHandled: (() => void) | undefined,
  tasks: Task[],
  openDetail: (taskId: string) => void
): void {
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusTaskId || handledRef.current === focusTaskId) return;
    if (!tasks.some((task) => task.id === focusTaskId)) return;

    handledRef.current = focusTaskId;
    openDetail(focusTaskId);
    onHandled?.();
  }, [focusTaskId, tasks, openDetail, onHandled]);
}
