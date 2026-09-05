// Obrazovka výkazů (worklog.feature, PRD-10).
//
// Server je zamockovaný, takže se tu ověřuje jen to, co obrazovka doopravdy
// dělá sama: co ukáže, co seskupí a co odfiltruje. Pravidla, která drží
// server, jsou ve `WorkLogApiTests.fs`.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkLogPage } from './WorkLogPage';
import { at, entry, mockWorkLog, project } from './worklogHarness';

/**
 * Období je „tento měsíc", takže záznamy testu musí ležet v aktuálním měsíci —
 * jinak by je odfiltroval rozsah ještě před vykreslením.
 */
function todayAt(time: string): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return at(`${now.getFullYear()}-${month}-${day}`, time);
}

function renderPage() {
  return render(<WorkLogPage onBack={vi.fn()} />);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('seznam výkazů', () => {
  // @scenario: worklog.feature > Ručně zapsaný záznam ukáže strávený čas
  it('u záznamu je vidět rozdíl časů, ne jen od–do', async () => {
    mockWorkLog({
      entries: [
        entry({
          id: 'a',
          title: 'Code review',
          startedAt: todayAt('09:00'),
          endedAt: todayAt('10:30'),
        }),
      ],
    });
    renderPage();

    // Hledá se uvnitř řádku: mezisoučet dne má u jediného záznamu stejnou
    // hodnotu, takže samotné `getByText('1:30')` by našlo dva prvky.
    const row = (await screen.findByText('Code review')).parentElement as HTMLElement;
    expect(within(row).getByText('1:30')).toBeInTheDocument();
    expect(within(row).getByText('09:00 – 10:30')).toBeInTheDocument();
  });

  // @scenario: worklog.feature > Záznamy jsou seskupené po dnech s mezisoučtem
  it('den má mezisoučet ze svých záznamů', async () => {
    mockWorkLog({
      entries: [
        entry({ id: 'a', startedAt: todayAt('09:00'), endedAt: todayAt('11:00') }),
        entry({ id: 'b', startedAt: todayAt('13:00'), endedAt: todayAt('14:30') }),
      ],
    });
    renderPage();

    const total = await screen.findByTitle(/^Součet za /);
    expect(total).toHaveTextContent('3:30');
  });

  // @scenario: worklog.feature > Běžící činnost je v seznamu poznat
  it('běžící činnost je označená a místo konce má narostlý čas', async () => {
    const running = entry({
      id: 'r',
      title: 'Ladění importu',
      startedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      endedAt: undefined,
    });
    mockWorkLog({ entries: [running], running });
    renderPage();

    expect(await screen.findByTitle(/^Běží — /)).toHaveTextContent('0:45');
    // Bez konce se místo času ukazuje výpustka, ne prázdno.
    expect(screen.getByText(/– …/)).toBeInTheDocument();
  });

  // @scenario: worklog.feature > Filtr podle tagu
  it('filtr podle tagu nechá jen záznamy s tím tagem', async () => {
    mockWorkLog({
      entries: [
        entry({
          id: 'a',
          title: 'Code review',
          startedAt: todayAt('09:00'),
          endedAt: todayAt('10:00'),
        }),
        entry({
          id: 'b',
          title: 'Noční zásah',
          tags: ['pohotovost'],
          startedAt: todayAt('20:00'),
          endedAt: todayAt('21:00'),
        }),
      ],
      tags: ['pohotovost'],
    });
    renderPage();

    await screen.findByText('Code review');
    await userEvent.selectOptions(screen.getByLabelText('Filtr podle tagu'), 'pohotovost');

    expect(screen.getByText('Noční zásah')).toBeInTheDocument();
    expect(screen.queryByText('Code review')).not.toBeInTheDocument();
  });

  // @scenario: worklog.feature > Hledání v názvu i popisu
  it('hledá i v popisu, nejen v názvu', async () => {
    mockWorkLog({
      entries: [
        entry({
          id: 'a',
          title: 'Code review',
          description: 'PR 412',
          startedAt: todayAt('09:00'),
          endedAt: todayAt('10:00'),
        }),
        entry({
          id: 'b',
          title: 'Schůzka',
          startedAt: todayAt('11:00'),
          endedAt: todayAt('12:00'),
        }),
      ],
    });
    renderPage();

    await screen.findByText('Schůzka');
    await userEvent.type(screen.getByLabelText('Hledat'), '412');

    expect(screen.getByText('Code review')).toBeInTheDocument();
    expect(screen.queryByText('Schůzka')).not.toBeInTheDocument();
  });
});

describe('formulář záznamu', () => {
  // @scenario: worklog.feature > Formulář našeptává dřív použité tagy
  it('našeptá tag z historie podle rozepsané předpony', async () => {
    mockWorkLog({ tags: ['pohotovost', 'dovolená'] });
    renderPage();

    await userEvent.click(await screen.findByText('+ Nový záznam'));
    await userEvent.type(screen.getByLabelText('Tagy'), 'poho');

    // Nabídka je tlačítko, ne text: kliknutím se tag přidá, takže „pohotovost"
    // a „Pohotovost" nevzniknou jako dva různé štítky.
    const suggestion = await screen.findByRole('button', { name: 'pohotovost' });
    await userEvent.click(suggestion);

    expect(screen.getByLabelText('Odebrat tag pohotovost')).toBeInTheDocument();
  });

  it('projekt je nepovinný a nabízí „Bez projektu"', async () => {
    mockWorkLog({ projects: [project('p1', 'Backend refaktoring')] });
    renderPage();

    await userEvent.click(await screen.findByText('+ Nový záznam'));

    const select = await screen.findByLabelText('Projekt');
    expect(within(select).getByRole('option', { name: 'Bez projektu' })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(select).getByRole('option', { name: 'Backend refaktoring' })
      ).toBeInTheDocument()
    );
  });
});

describe('přehled', () => {
  it('přepnutí záložky přesune i zvýraznění', async () => {
    mockWorkLog();
    renderPage();

    const tab = (name: string) => screen.getByRole('button', { name });
    await waitFor(() => expect(tab('Záznamy')).toHaveAttribute('aria-pressed', 'true'));

    await userEvent.click(tab('Přehled'));

    expect(tab('Přehled')).toHaveAttribute('aria-pressed', 'true');
    expect(tab('Záznamy')).toHaveAttribute('aria-pressed', 'false');
    expect(tab('Přehled').className).toContain('btn-active');
    expect(tab('Záznamy').className).not.toContain('btn-active');
  });

  it('průměr na den u sebe má, z čeho se počítá', async () => {
    mockWorkLog({
      entries: [entry({ id: 'a', startedAt: todayAt('08:00'), endedAt: todayAt('16:00') })],
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Přehled' }));

    expect(screen.getByText('Průměr na den')).toBeInTheDocument();
    expect(screen.getByText('ze dnů, ve kterých je aspoň jeden záznam')).toBeInTheDocument();
  });

  it('rozpad podle tagů přiznává, že se díly překrývají', async () => {
    mockWorkLog({
      entries: [
        entry({
          id: 'a',
          tags: ['pohotovost', 'víkend'],
          startedAt: todayAt('08:00'),
          endedAt: todayAt('09:00'),
        }),
      ],
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Přehled' }));

    expect(screen.getByText(/součet může přesáhnout odpracovaný čas/)).toBeInTheDocument();
  });
});
