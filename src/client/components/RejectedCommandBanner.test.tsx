// Hláška o odmítnutém commandu (project-management.feature).
//
// `useProjectChannel` `ErrorOccurred` vždycky zpracovával — vrátil stav na
// poslední potvrzený — ale `lastError` nikdo nevykresloval. Odmítnutá změna se
// tak uživateli beze slova vrátila zpátky a důvod, který zná jen server,
// se nikam nedostal.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RejectedCommandBanner } from './RejectedCommandBanner';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('RejectedCommandBanner', () => {
  // @scenario: project-management.feature > Odmítnutý command uživatel uvidí
  it('zobrazí hlášku serveru jako alert', () => {
    render(
      <RejectedCommandBanner
        error={{
          message: 'Nedostatečná oprávnění: pouze PM může mazat úkoly',
          commandType: 'delete_task',
          source: 'server',
        }}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Nedostatečná oprávnění: pouze PM může mazat úkoly'
    );
  });

  it('bez chyby nekreslí nic', () => {
    render(<RejectedCommandBanner error={null} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('selhání přenosu neukazuje — je to surová hláška ze SignalR', () => {
    // Stav spojení nese hlavička a nedoručené commandy offline banner; tahle
    // věta uživateli nic neřekne a ještě je anglicky.
    render(
      <RejectedCommandBanner
        error={{
          message: "Cannot send data if the connection is not in the 'Connected' State.",
          commandType: 'update_task',
          source: 'transport',
        }}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('po chvíli se schová sama', () => {
    // Je to reakce na akci, ne trvalý stav — trvalý pruh by po pár odmítnutích
    // zabral vršek obrazovky a uživatel by ho přestal číst.
    render(
      <RejectedCommandBanner
        error={{ message: 'Projekt je archivovaný', commandType: 'update_task', source: 'server' }}
      />
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(6000));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('nové odmítnutí hlášku ukáže znovu', () => {
    const { rerender } = render(
      <RejectedCommandBanner
        error={{ message: 'První', commandType: 'update_task', source: 'server' }}
      />
    );
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerender(
      <RejectedCommandBanner
        error={{ message: 'Druhé', commandType: 'delete_task', source: 'server' }}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Druhé');
  });
});
