// Sekce „Členové projektu" — FR-ROLE-02, FR-ROLE-04.
//
// Členství je REST zdroj pravdy (ne command protokol), takže se mockuje
// `membersApi`. Pravidla „PM nesmí odebrat sám sebe" a „projekt musí mít
// aspoň jednoho PM" vynucuje server — testy ověřují, že je UI srozumitelně
// zobrazí, ne že si je klient počítá sám.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectMembersSection } from './ProjectMembersSection';
import * as membersApi from '../../api/membersApi';

vi.mock('../../api/membersApi');

const JAN = {
  userId: 'u-jan',
  displayName: 'Jan Novák',
  role: 'pm' as const,
  joinedAt: '2026-01-05',
};
const PETRA = {
  userId: 'u-petra',
  displayName: 'Petra Kolářová',
  role: 'dev' as const,
  joinedAt: '2026-01-06',
};
const TOMAS = { userId: 'u-tomas', displayName: 'Tomáš Vondráček' };

function mockApi(members = [JAN, PETRA], candidates = [TOMAS]): void {
  vi.mocked(membersApi.listMembers).mockResolvedValue(members);
  vi.mocked(membersApi.listCandidates).mockResolvedValue(candidates);
  vi.mocked(membersApi.addMember).mockResolvedValue(undefined);
  vi.mocked(membersApi.setMemberRole).mockResolvedValue(undefined);
  vi.mocked(membersApi.removeMember).mockResolvedValue(undefined);
}

function renderAsPm() {
  // biome-ignore lint/a11y/useValidAriaRole: `role` je doménová prop projektové role (pm/dev), ne ARIA role
  return render(<ProjectMembersSection projectId="p1" role="pm" currentUserId={JAN.userId} />);
}

beforeEach(() => mockApi());
afterEach(() => vi.resetAllMocks());

describe('ProjectMembersSection — PM', () => {
  // @scenario: role-permissions.feature > PM může spravovat členy projektu
  it('zobrazí členy s rolemi a nabídne akce pro správu', async () => {
    renderAsPm();

    expect(await screen.findByText('Jan Novák')).toBeInTheDocument();
    expect(screen.getByText('Petra Kolářová')).toBeInTheDocument();
    expect(screen.getByLabelText('Změnit roli — Petra Kolářová')).toHaveValue('dev');
    expect(screen.getByRole('button', { name: 'Přidat člena' })).toBeInTheDocument();
    expect(screen.getByLabelText('Odebrat — Petra Kolářová')).toBeInTheDocument();
  });

  // @scenario: project-management.feature > Přidání člena do projektu (PM)
  it('přidá vybraného uživatele s vybranou rolí', async () => {
    renderAsPm();
    await screen.findByText('Jan Novák');

    await userEvent.selectOptions(screen.getByLabelText('Uživatel k přidání'), TOMAS.userId);
    await userEvent.selectOptions(screen.getByLabelText('Role nového člena'), 'dev');
    await userEvent.click(screen.getByRole('button', { name: 'Přidat člena' }));

    expect(membersApi.addMember).toHaveBeenCalledWith('p1', TOMAS.userId, 'dev');
  });

  // @scenario: project-management.feature > Změna role člena projektu
  it('změní roli člena', async () => {
    renderAsPm();
    await screen.findByText('Petra Kolářová');

    await userEvent.selectOptions(screen.getByLabelText('Změnit roli — Petra Kolářová'), 'pm');

    expect(membersApi.setMemberRole).toHaveBeenCalledWith('p1', PETRA.userId, 'pm');
  });

  // @scenario: project-management.feature > Odebrání člena z projektu (PM)
  it('odebere člena po potvrzení dialogu', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderAsPm();
    await screen.findByText('Petra Kolářová');

    await userEvent.click(screen.getByLabelText('Odebrat — Petra Kolářová'));

    expect(confirmSpy).toHaveBeenCalledWith('Opravdu odebrat Petra Kolářová z projektu?');
    expect(membersApi.removeMember).toHaveBeenCalledWith('p1', PETRA.userId);
  });

  it('bez potvrzení dialogu člena neodebere', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAsPm();
    await screen.findByText('Petra Kolářová');

    await userEvent.click(screen.getByLabelText('Odebrat — Petra Kolářová'));

    expect(membersApi.removeMember).not.toHaveBeenCalled();
  });

  // @scenario: project-management.feature > PM se nemůže odebrat jako poslední PM
  it('sám sebe odebrat nelze a serverovou hlášku o posledním PM zobrazí', async () => {
    renderAsPm();
    await screen.findByText('Jan Novák');

    // Tlačítko u sebe sama je neaktivní — server by to odmítl tak jako tak.
    expect(screen.getByLabelText('Odebrat — Jan Novák')).toBeDisabled();

    // Degradace posledního PM na dev je druhá cesta k témuž a tu hlídá server.
    vi.mocked(membersApi.setMemberRole).mockRejectedValue(
      new Error('Projekt musí mít alespoň jednoho Project Managera')
    );
    await userEvent.selectOptions(screen.getByLabelText('Změnit roli — Jan Novák'), 'dev');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Projekt musí mít alespoň jednoho Project Managera'
    );
  });
});

describe('ProjectMembersSection — Dev', () => {
  // @scenario: role-permissions.feature > Dev nevidí sekci správy členů
  it('vidí jen read-only přehled bez akčních prvků', async () => {
    // biome-ignore lint/a11y/useValidAriaRole: `role` je doménová prop projektové role (pm/dev), ne ARIA role
    render(<ProjectMembersSection projectId="p1" role="dev" currentUserId={PETRA.userId} />);

    expect(await screen.findByText('Petra Kolářová')).toBeInTheDocument();
    expect(screen.getByText('Jan Novák')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Přidat člena' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Odebrat — Jan Novák')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Změnit roli — Jan Novák')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Uživatel k přidání')).not.toBeInTheDocument();
  });
});
