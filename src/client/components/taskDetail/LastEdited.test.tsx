// Razítko „naposledy změnil" v patičce detailu úkolu (tasks.feature).
//
// Hodnoty plní server při každé mutaci; klient je jen zobrazuje. Test proto
// nesahá na commandy — ověřuje, že se razítko vykreslí, a hlavně že úkol bez
// razítka (založený před zavedením pole) nic nezobrazí.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeTask } from '../../state/testFixtures';
import { LastEdited } from './ModalChrome';

describe('LastEdited', () => {
  // @scenario: tasks.feature > Detail úkolu ukazuje, kdo ho naposledy změnil
  it('zobrazí autora i čas poslední změny', () => {
    render(
      <LastEdited
        task={makeTask({
          updatedBy: 'Petra Kolářová',
          updatedAt: '2026-08-17T09:30:00.000Z',
        })}
      />
    );

    expect(screen.getByText(/Naposledy změnil Petra Kolářová/)).toBeInTheDocument();
  });

  // @scenario: tasks.feature > Úkol založený před zavedením razítka nemá autora
  it('bez razítka nevykreslí nic', () => {
    const { container } = render(<LastEdited task={makeTask()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('zvládne razítko bez času', () => {
    render(<LastEdited task={makeTask({ updatedBy: 'Jan Novák' })} />);
    expect(screen.getByText('Naposledy změnil Jan Novák')).toBeInTheDocument();
  });
});
