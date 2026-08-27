// Testy PresenceAvatars — FR-COLLAB-04.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresenceAvatars } from './PresenceAvatars';
import type { PresenceEntry } from '../types/protocol';

function user(overrides: Partial<PresenceEntry>): PresenceEntry {
  return {
    userId: 'u1',
    displayName: 'Petra Kolářová',
    view: 'seznam',
    color: '#f00',
    ...overrides,
  };
}

describe('PresenceAvatars', () => {
  // @scenario: real-time-collaboration.feature > Presence — zobrazení kdo je v projektu
  it('zobrazí iniciály a tooltip "Jméno — Záložka"', () => {
    render(<PresenceAvatars users={[user({ displayName: 'Petra Kolářová', view: 'seznam' })]} />);

    const avatar = screen.getByTitle('Petra Kolářová — Úkoly');
    expect(avatar).toHaveTextContent('PK');
  });

  // @scenario: real-time-collaboration.feature > Presence se aktualizuje při změně záložky
  it('tooltip se změní se změnou view uživatele', () => {
    const { rerender } = render(
      <PresenceAvatars users={[user({ displayName: 'Jan Novák', view: 'gantt' })]} />
    );
    expect(screen.getByTitle('Jan Novák — Harmonogram')).toBeInTheDocument();

    rerender(<PresenceAvatars users={[user({ displayName: 'Jan Novák', view: 'kapacita' })]} />);

    expect(screen.getByTitle('Jan Novák — Kapacita')).toBeInTheDocument();
  });

  it('nezobrazí nic, pokud je projekt prázdný (nikdo online)', () => {
    const { container } = render(<PresenceAvatars users={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('nad 5 uživatelů zobrazí "+N"', () => {
    const users = Array.from({ length: 7 }, (_, i) =>
      user({ userId: `u${i}`, displayName: `U ${i}` })
    );
    render(<PresenceAvatars users={users} />);

    expect(screen.getByTitle('+2 dalších')).toHaveTextContent('+2');
  });
});
