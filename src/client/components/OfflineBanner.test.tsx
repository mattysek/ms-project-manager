// Testy OfflineBanner — FR-OFFLINE-02, FR-OFFLINE-05, FR-OFFLINE-08, FR-COLLAB-07.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';

const noop = vi.fn();

function renderBanner(overrides: Partial<Parameters<typeof OfflineBanner>[0]> = {}) {
  return render(
    <OfflineBanner
      isOffline={false}
      pendingCount={0}
      syncMessage={null}
      purgedNotice={null}
      queueFullWarning={null}
      collabNotice={null}
      onDismissSyncMessage={noop}
      onDismissPurgedNotice={noop}
      onDismissQueueFullWarning={noop}
      onDismissCollabNotice={noop}
      {...overrides}
    />
  );
}

describe('OfflineBanner', () => {
  // @scenario: offline.feature > Zobrazení offline indikátoru při výpadku sítě
  it('zobrazí offline banner s přesným textem, když je isOffline', () => {
    renderBanner({ isOffline: true });
    expect(
      screen.getByText(
        /Offline — pracujete bez připojení\. Změny budou uloženy při obnovení spojení\./
      )
    ).toBeInTheDocument();
  });

  // @scenario: offline.feature > Změny jsou ukládány lokálně při offline
  it('zobrazí počet čekajících změn v jednotném čísle', () => {
    renderBanner({ isOffline: true, pendingCount: 1 });
    expect(screen.getByText(/1 čekající změna/)).toBeInTheDocument();
  });

  // @scenario: offline.feature > Více změn se kumuluje v pending queue
  it('zobrazí počet čekajících změn v množném čísle', () => {
    renderBanner({ isOffline: true, pendingCount: 5 });
    expect(screen.getByText(/5 čekajících změn/)).toBeInTheDocument();
  });

  it('banner zmizí, když isOffline je false', () => {
    renderBanner({ isOffline: false });
    expect(screen.queryByText(/Offline —/)).not.toBeInTheDocument();
  });

  // @scenario: offline.feature > Seamless synchronizace při reconnectu bez konfliktů
  it('zobrazí syncMessage', () => {
    renderBanner({ syncMessage: '✓ Synchronizováno — 1 změna přenesena' });
    expect(screen.getByText('✓ Synchronizováno — 1 změna přenesena')).toBeInTheDocument();
  });

  // @scenario: offline.feature > Automatické zahození starých pending commandů
  it('zobrazí notifikaci o zahozených starých commandech', () => {
    renderBanner({ purgedNotice: 1 });
    expect(
      screen.getByText('1 starý čekající změna byla odstraněna (starší než 48 hodin)')
    ).toBeInTheDocument();
  });

  // @scenario: real-time-collaboration.feature > Conflict při simultánní editaci stejného pole — last-write-wins
  it('zobrazí diskrétní kolaborační notifikaci', () => {
    renderBanner({ collabNotice: 'Hodnota pole MD byla změněna jiným uživatelem' });
    expect(screen.getByText('Hodnota pole MD byla změněna jiným uživatelem')).toBeInTheDocument();
  });
});
