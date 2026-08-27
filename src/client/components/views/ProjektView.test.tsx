// Milníky v Project view — `role-permissions.feature`.
//
// Přetažení milníku je HTML5 drag-and-drop; jsdom nemá nativní `DataTransfer`,
// takže se podvrhuje minimální náhrada (stejný postup jako v `SeznamView.test.tsx`).
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjektView } from './ProjektView';
import type { MemberRole } from '../../types/protocol';
import { computeWeeks } from '../../utils';
import type { Milestone, Project } from '../../types';

const M1: Milestone = {
  id: 'm1',
  title: 'M1 — Alpha release',
  weekIndex: 3,
  checkItems: [],
};

const PROJECT: Project = {
  name: 'Backend refaktoring',
  startDate: '2026-01-05',
  endDate: '2026-06-26',
  budget: 100,
  milestones: [M1],
  notes: '',
  changelog: [],
};

/** jsdom `DataTransfer` nemá — stačí `setData`/`getData` nad jednou hodnotou. */
function fakeDataTransfer() {
  let payload = '';
  return {
    effectAllowed: '',
    setData: (_type: string, value: string) => {
      payload = value;
    },
    getData: () => payload,
  };
}

function renderProjekt() {
  const setMilestones = vi.fn();
  // Proměnná místo literálu: Biome by `role="pm"` v JSX vyhodnotil jako ARIA
  // atribut (`useValidAriaRole`), i když jde o doménový prop (ADR-006).
  const pmRole: MemberRole = 'pm';
  render(
    <ProjektView
      project={PROJECT}
      updateProject={vi.fn()}
      changeDates={vi.fn()}
      setMilestones={setMilestones}
      weeks={computeWeeks(PROJECT.startDate, PROJECT.endDate, [])}
      role={pmRole}
    />
  );
  return { setMilestones };
}

afterEach(() => vi.restoreAllMocks());

describe('ProjektView — milníky', () => {
  // @scenario: role-permissions.feature > PM může přidat a smazat milník
  it('přetažení uloží milník na cílový týden a smazání ho po potvrzení odstraní', () => {
    const { setMilestones } = renderProjekt();

    // Chip v tabulce má před názvem znak vlajky, proto ne `getByText` na název.
    const handle = [...document.querySelectorAll<HTMLElement>('[draggable="true"]')].find((el) =>
      el.textContent?.includes(M1.title)
    );
    if (!handle) throw new Error('Chip milníku nenalezen');

    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(handle, { dataTransfer });

    // Řádky týdnů jsou drop zóny; W8 je devátý (indexováno od nuly).
    const weekRows = document.querySelectorAll('[data-week-index]');
    const target = weekRows[8];
    expect(target).toBeDefined();

    fireEvent.drop(target, { dataTransfer });

    expect(setMilestones).toHaveBeenCalledWith([{ ...M1, weekIndex: 8 }]);

    setMilestones.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByLabelText('Smazat milník — M1 — Alpha release'));

    expect(setMilestones).toHaveBeenCalledWith([]);
  });

  it('bez potvrzení dialogu milník nesmaže', () => {
    const { setMilestones } = renderProjekt();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    fireEvent.click(screen.getByLabelText('Smazat milník — M1 — Alpha release'));

    expect(setMilestones).not.toHaveBeenCalled();
  });
});

describe('ProjektView — oprávnění k metadatům', () => {
  // @scenario: role-permissions.feature > Dev nemůže editovat metadata projektu
  it('Dev vidí název, datumy i rozpočet jen ke čtení', () => {
    const devRole: MemberRole = 'dev';
    render(
      <ProjektView
        project={PROJECT}
        updateProject={vi.fn()}
        changeDates={vi.fn()}
        setMilestones={vi.fn()}
        weeks={computeWeeks(PROJECT.startDate, PROJECT.endDate, [])}
        role={devRole}
      />
    );

    // Server to vynucuje taky, ale UI dřív tvrdilo opak: pole šla editovat
    // a změna se odrolovala až po odmítnutí serverem.
    for (const label of ['Název', 'Začátek', 'Konec', 'Budget (MD)']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('readonly');
    }
  });

  it('PM má stejná pole editovatelná', () => {
    const pmRole: MemberRole = 'pm';
    render(
      <ProjektView
        project={PROJECT}
        updateProject={vi.fn()}
        changeDates={vi.fn()}
        setMilestones={vi.fn()}
        weeks={computeWeeks(PROJECT.startDate, PROJECT.endDate, [])}
        role={pmRole}
      />
    );

    expect(screen.getByLabelText('Název')).not.toHaveAttribute('readonly');
  });
});
