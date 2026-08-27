// Testy TodoView — scénáře `docs/features/todo-reminders.feature`. Views
// zůstávají tenké prezentační komponenty (ADR-005); commandy se ověřují jako
// spy nad fake kanálem, stejný vzor jako KapacitaView.test.tsx.
//
// Scénář „TODO jsou soukromé per-user" tady NENÍ pokrytý — frontend žádnou
// izolaci sám neimplementuje (server posílá `todo_*`/`reminder_*` diffy jen
// odesílateli, ADR-004 doplněk „Routing diffů"), TodoView jen zobrazuje, co
// dostane. Pokrývá ho `ReducerTests.fs` (`AppState.forUser` projekce).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { makeReminder, makeTodo } from '../../state/testFixtures';
import { renderTodo } from './todoViewHarness';

afterEach(() => {
  vi.useRealTimers();
});

/** Outer bordered wrapper obsahující hlavičku, add-formulář i seznam TODO. */
function todoPanel(): HTMLElement {
  const heading = screen.getByText('✓ Rychlé úkoly');
  const wrapper = heading.closest('div')?.parentElement?.parentElement;
  if (!wrapper) throw new Error('Panel „Rychlé úkoly" nenalezen.');
  return wrapper as HTMLElement;
}

/** Outer bordered wrapper obsahující hlavičku, souhrny i seznam připomínek. */
function remindersPanel(): HTMLElement {
  const heading = screen.getByText('⏰ Opakující se upozornění');
  const wrapper = heading.closest('div')?.parentElement?.parentElement;
  if (!wrapper) throw new Error('Panel „Opakující se upozornění" nenalezen.');
  return wrapper as HTMLElement;
}

// ── TODO položky ─────────────────────────────────────────────────────────────

describe('TodoView — TODO položky', () => {
  // @scenario: todo-reminders.feature > Přidání nové TODO položky
  it('přidá novou nesplněnou položku a uloží ji commandem', () => {
    const { lastCommand } = renderTodo();

    fireEvent.change(screen.getByPlaceholderText(/Nový úkol/), {
      target: { value: 'Zkontrolovat pull request od Jana' },
    });
    fireEvent.click(within(todoPanel()).getByRole('button', { name: '+ Přidat' }));

    const checkbox = screen
      .getByText('Zkontrolovat pull request od Jana')
      .closest('div')
      ?.parentElement?.querySelector('input[type="checkbox"]');
    expect(checkbox).not.toBeChecked();
    expect(lastCommand('add_todo')?.todo).toMatchObject({
      title: 'Zkontrolovat pull request od Jana',
      completed: false,
    });
  });

  // @scenario: todo-reminders.feature > Označení TODO jako splněné
  it('zaškrtnutím se úkol přeškrtne a uloží jako completed=true', () => {
    const todo = makeTodo({
      id: 't1',
      title: 'Zkontrolovat pull request od Jana',
      completed: false,
    });
    const { lastCommand } = renderTodo({ todos: [todo] });

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByText('Zkontrolovat pull request od Jana')).toHaveStyle({
      textDecoration: 'line-through',
    });
    expect(lastCommand('update_todo')).toEqual({
      type: 'update_todo',
      todoId: 't1',
      fields: { completed: true },
    });
  });

  // @scenario: todo-reminders.feature > Odznačení TODO (vrácení na nesplněné)
  it('opětovným kliknutím se splněný úkol vrátí na nesplněný', () => {
    const todo = makeTodo({
      id: 't1',
      title: 'Zkontrolovat pull request od Jana',
      completed: true,
    });
    const { lastCommand } = renderTodo({ todos: [todo] });

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByText('Zkontrolovat pull request od Jana')).not.toHaveStyle({
      textDecoration: 'line-through',
    });
    expect(lastCommand('update_todo')).toEqual({
      type: 'update_todo',
      todoId: 't1',
      fields: { completed: false },
    });
  });

  // @scenario: todo-reminders.feature > Editace textu TODO
  it('úpravou textu a potvrzením se zobrazí aktualizovaný text', () => {
    const todo = makeTodo({ id: 't1', title: 'Zkontrolovat PR' });
    const { lastCommand } = renderTodo({ todos: [todo] });

    fireEvent.click(screen.getByTitle('Upravit'));
    fireEvent.change(screen.getByDisplayValue('Zkontrolovat PR'), {
      target: { value: 'Zkontrolovat PR #42 od Jana Nováka' },
    });
    fireEvent.click(screen.getByRole('button', { name: '✓' }));

    expect(screen.getByText('Zkontrolovat PR #42 od Jana Nováka')).toBeInTheDocument();
    expect(lastCommand('update_todo')).toEqual({
      type: 'update_todo',
      todoId: 't1',
      fields: { title: 'Zkontrolovat PR #42 od Jana Nováka' },
    });
  });

  // @scenario: todo-reminders.feature > Smazání TODO
  it('smaže položku a odešle delete_todo', () => {
    const todo = makeTodo({ id: 't1', title: 'Zastaralý úkol' });
    const { lastCommand } = renderTodo({ todos: [todo] });

    fireEvent.click(screen.getByTitle('Smazat'));

    expect(screen.queryByText('Zastaralý úkol')).not.toBeInTheDocument();
    expect(lastCommand('delete_todo')).toEqual({ type: 'delete_todo', todoId: 't1' });
  });
});

describe('TodoView — hromadné akce a perzistence TODO', () => {
  // @scenario: todo-reminders.feature > Vymazání všech splněných TODO
  it('vymaže jen splněné položky, nesplněné zůstanou', () => {
    const todos = [
      makeTodo({ id: 'c1', title: 'Hotovo 1', completed: true }),
      makeTodo({ id: 'c2', title: 'Hotovo 2', completed: true }),
      makeTodo({ id: 'c3', title: 'Hotovo 3', completed: true }),
      makeTodo({ id: 'n1', title: 'Nehotovo 1', completed: false }),
      makeTodo({ id: 'n2', title: 'Nehotovo 2', completed: false }),
    ];
    const { commandsOf } = renderTodo({ todos });

    fireEvent.click(screen.getByRole('button', { name: 'Vymazat hotové' }));

    expect(commandsOf('delete_todo')).toHaveLength(3);
    expect(screen.queryByText('Hotovo 1')).not.toBeInTheDocument();
    expect(screen.getByText('Nehotovo 1')).toBeInTheDocument();
    expect(screen.getByText('Nehotovo 2')).toBeInTheDocument();
  });

  // @scenario: todo-reminders.feature > TODO přežijí reload stránky
  it('po znovunačtení (stav ze serveru) zůstává všech 5 položek zobrazeno', () => {
    const todos = Array.from({ length: 5 }, (_, i) =>
      makeTodo({ id: `t${i}`, title: `Úkol ${i + 1}` })
    );
    renderTodo({ todos });

    for (const t of todos) expect(screen.getByText(t.title)).toBeInTheDocument();
  });
});

// ── Opakující se připomínky ──────────────────────────────────────────────────

describe('TodoView — přidání opakující se připomínky', () => {
  // Připomínky se zakládají s datem zahájení 2026-08-*; „dnes" pevně před
  // tímto datem, aby badge vždy ukazoval souhrn opakování, ne „K PROVEDENÍ"
  // (jinak by test záviselo na tom, kdy se skutečně spouští).
  const beforeAllReminderDates = new Date(2026, 0, 1);

  // @scenario: todo-reminders.feature > Přidání weekly opakující se připomínky
  it('uloží weekly připomínku a zobrazí „Každý týden od 17.8.2026"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(beforeAllReminderDates);
    const { commandsOf } = renderTodo();

    fireEvent.click(within(remindersPanel()).getByRole('button', { name: '+ Přidat' }));
    fireEvent.change(screen.getByDisplayValue('Nové upozornění'), {
      target: { value: 'Týdenní status meeting' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Popis/), {
      target: { value: 'Připravit status report a body k diskuzi' },
    });
    fireEvent.change(screen.getByLabelText('Začátek'), { target: { value: '2026-08-17' } });
    // Opakování je již defaultně „weekly" — výběr téže hodnoty proto nevyprodukuje
    // vlastní command (`reconcileList` mění jen skutečně odlišná pole), badge níž
    // ale i tak dokazuje, že se uložilo správně.
    fireEvent.change(screen.getByLabelText('Opakování'), { target: { value: 'weekly' } });
    fireEvent.click(screen.getByRole('button', { name: '✓ Zavřít' }));

    expect(screen.getByText('Každý týden od 17.8.2026')).toBeInTheDocument();
    expect(commandsOf('update_reminder').some((c) => c.fields.startDate === '2026-08-17')).toBe(
      true
    );
  });

  // @scenario: todo-reminders.feature > Přidání biweekly připomínky
  it('uloží biweekly připomínku a zobrazí „Každé 2 týdny od 17.8.2026"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(beforeAllReminderDates);
    renderTodo();

    fireEvent.click(within(remindersPanel()).getByRole('button', { name: '+ Přidat' }));
    fireEvent.change(screen.getByDisplayValue('Nové upozornění'), {
      target: { value: 'Retrospektiva' },
    });
    fireEvent.change(screen.getByLabelText('Začátek'), { target: { value: '2026-08-17' } });
    fireEvent.change(screen.getByLabelText('Opakování'), { target: { value: 'biweekly' } });
    fireEvent.click(screen.getByRole('button', { name: '✓ Zavřít' }));

    expect(screen.getByText('Každé 2 týdny od 17.8.2026')).toBeInTheDocument();
  });

  // @scenario: todo-reminders.feature > Přidání monthly připomínky
  it('uloží monthly připomínku a zobrazí „Každý měsíc od 1.8.2026"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(beforeAllReminderDates);
    renderTodo();

    fireEvent.click(within(remindersPanel()).getByRole('button', { name: '+ Přidat' }));
    fireEvent.change(screen.getByDisplayValue('Nové upozornění'), {
      target: { value: 'Měsíční reportování' },
    });
    fireEvent.change(screen.getByLabelText('Začátek'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('Opakování'), { target: { value: 'monthly' } });
    fireEvent.click(screen.getByRole('button', { name: '✓ Zavřít' }));

    expect(screen.getByText('Každý měsíc od 1.8.2026')).toBeInTheDocument();
  });
});

describe('TodoView — nadcházející připomínky a jejich stav', () => {
  // @scenario: todo-reminders.feature > Zobrazení nadcházejících připomínek
  it('zobrazí připomínku v sekci Nadcházející s odpočtem „za 7 dní"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10));
    const reminder = makeReminder({
      id: 'r1',
      title: 'Týdenní status meeting',
      startDate: '2026-08-17',
      recurrence: 'weekly',
    });
    renderTodo({ reminders: [reminder] });

    const section = screen.getByText('Nadcházející připomínky').parentElement;
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText('Týdenní status meeting')).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText('17.8.2026 (za 7 dní)')).toBeInTheDocument();
  });

  // @scenario: todo-reminders.feature > Označení připomínky jako splněné (pro tento výskyt)
  it('po kliknutí na Hotovo nastaví lastCompleted a posune příští výskyt na 24.8.', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17));
    const reminder = makeReminder({
      id: 'r1',
      title: 'Týdenní status meeting',
      startDate: '2026-08-17',
      recurrence: 'weekly',
    });
    const { lastCommand } = renderTodo({ reminders: [reminder] });

    fireEvent.click(screen.getByRole('button', { name: 'Hotovo' }));

    expect(lastCommand('update_reminder')).toEqual({
      type: 'update_reminder',
      reminderId: 'r1',
      fields: { lastCompleted: '2026-08-17' },
    });
    const section = screen.getByText('Nadcházející připomínky').parentElement;
    expect(within(section as HTMLElement).queryByText(/17\.8\.2026/)).not.toBeInTheDocument();
    expect(within(section as HTMLElement).getByText(/24\.8\.2026/)).toBeInTheDocument();
  });

  // @scenario: todo-reminders.feature > Odškrtnutí připomínky zavře i její editaci
  it('nová připomínka se po Hotovo přepne z editace do čtení', () => {
    // `addR` otevírá novou připomínku rovnou k editaci, takže po zadání názvu
    // a kliknutí na „Hotovo" zůstávala s poli dokořán — jediná cesta ven bylo
    // najít ještě „✓ Zavřít".
    renderTodo({ reminders: [] });

    fireEvent.click(within(remindersPanel()).getByRole('button', { name: '+ Přidat' }));
    expect(screen.getByRole('button', { name: '✓ Zavřít' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hotovo' }));

    expect(screen.queryByRole('button', { name: '✓ Zavřít' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '✎ Edit' })).toBeInTheDocument();
  });

  // @scenario: todo-reminders.feature > Disable připomínky
  it('vypnutím zmizí z Nadcházejících a v seznamu zůstane s označením Vypnuto', () => {
    const reminder = makeReminder({ id: 'r1', title: 'Týdenní status meeting', enabled: true });
    renderTodo({ reminders: [reminder] });

    fireEvent.click(screen.getByRole('button', { name: 'Vypnout' }));

    expect(screen.getByText('Vypnuto')).toBeInTheDocument();
    const section = screen.getByText('Nadcházející připomínky').parentElement;
    expect(
      within(section as HTMLElement).queryByText('Týdenní status meeting')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Týdenní status meeting')).toBeInTheDocument();
  });

  // @scenario: todo-reminders.feature > Enable připomínky
  it('zapnutím se připomínka vrátí do sekce Nadcházejících', () => {
    const reminder = makeReminder({ id: 'r1', title: 'Týdenní status meeting', enabled: false });
    renderTodo({ reminders: [reminder] });

    fireEvent.click(screen.getByRole('button', { name: 'Zapnout' }));

    expect(screen.queryByText('Vypnuto')).not.toBeInTheDocument();
    const section = screen.getByText('Nadcházející připomínky').parentElement;
    expect(within(section as HTMLElement).getByText('Týdenní status meeting')).toBeInTheDocument();
  });

  // @scenario: todo-reminders.feature > Smazání připomínky
  it('po potvrzení dialogu trvale odstraní připomínku', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const reminder = makeReminder({ id: 'r1', title: 'Zastaralá připomínka' });
    const { lastCommand } = renderTodo({ reminders: [reminder] });

    fireEvent.click(screen.getByRole('button', { name: '✕' }));

    expect(screen.queryByText('Zastaralá připomínka')).not.toBeInTheDocument();
    expect(lastCommand('delete_reminder')).toEqual({ type: 'delete_reminder', reminderId: 'r1' });
  });
});

describe('TodoView — měsíční přehled výskytů', () => {
  // @scenario: todo-reminders.feature > Přehled připomínek pro aktuální měsíc
  it('zobrazí výskyty pro srpen a odliší proběhlé', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10));
    const reminder = makeReminder({
      id: 'r1',
      title: 'Status',
      startDate: '2026-08-03',
      recurrence: 'weekly',
    });
    renderTodo({ reminders: [reminder] });

    const section = screen.getByText('Přehled připomínek pro aktuální měsíc').parentElement;
    expect(section).not.toBeNull();
    const scoped = within(section as HTMLElement);
    expect(scoped.getByText(/17\.8\./)).toBeInTheDocument();
    expect(scoped.getByText(/24\.8\./)).toBeInTheDocument();
    expect(scoped.getByText(/31\.8\./)).toBeInTheDocument();
    expect(scoped.getByText(/3\.8\.\s*\(proběhlo\)/)).toBeInTheDocument();
    expect(scoped.getByText(/10\.8\.\s*\(proběhlo\)/)).toBeInTheDocument();
  });
});
