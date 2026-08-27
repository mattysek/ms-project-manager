// Odznak splatných připomínek u záložky TODO (todo-reminders.feature).
//
// Bez odznaku byly připomínky vidět až po otevření záložky, takže funkce
// fakticky nepřipomínala. Test jede přes `ProjectWorkspace`, protože počet
// splatných se počítá až tam ze stavu projektu.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import type { ChannelConnectionStatus } from '../hooks/useProjectChannel';

function renderHeader(dueReminders: number) {
  const connected: ChannelConnectionStatus = 'connected';
  render(
    <Header
      projectName="Backend refaktoring"
      startDate="2026-01-05"
      endDate="2026-07-03"
      budget={250}
      numWeeks={26}
      grand={126}
      planned={180}
      plannedDiff={-70}
      overallProgress={30}
      view="gantt"
      setView={vi.fn()}
      exportJSON={vi.fn()}
      onBack={vi.fn()}
      canUndo={false}
      canRedo={false}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      connectionStatus={connected}
      presence={[]}
      dueReminders={dueReminders}
    />
  );
}

describe('Header — odznak připomínek', () => {
  // @scenario: project-management.feature > Import do otevřeného projektu z hlavičky není
  it('hlavička nabízí jen export, import na ni nepatří', () => {
    // Import přepisoval celý stav otevřeného projektu jedním
    // `full_state_import` a stál vedle nenápadného „⬇ Export".
    renderHeader(0);

    expect(screen.getByRole('button', { name: /Export/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import/ })).not.toBeInTheDocument();
  });

  // @scenario: todo-reminders.feature > Odznak splatných připomínek v hlavičce
  it('u záložky TODO ukáže počet splatných připomínek', () => {
    renderHeader(2);
    expect(screen.getByLabelText('Splatné připomínky: 2')).toHaveTextContent('2');
  });

  // @scenario: todo-reminders.feature > Bez splatných připomínek se odznak nezobrazuje
  it('bez splatných připomínek žádný odznak není', () => {
    renderHeader(0);
    expect(screen.queryByLabelText(/Splatné připomínky/)).not.toBeInTheDocument();
  });
});
