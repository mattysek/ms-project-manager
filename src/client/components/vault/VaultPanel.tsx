// Panel trezoru — PRD-09.
//
// Skládá jednotlivé obrazovky podle stavu z `useVault`; sám nešifruje ani
// nevolá API. Rozdělení stavů je `if`/`else`, ne vnořený ternární výraz
// (style/noNestedTernary).
import { useState } from 'react';
import type { UseVaultResult, VaultEntry } from '../../hooks/useVault';
import { FloatingPanel } from '../FloatingPanel';
import { VaultSetupForm } from './VaultSetupForm';
import { VaultUnlockForm } from './VaultUnlockForm';
import { VaultEntryList } from './VaultEntryList';
import { VaultEntryForm } from './VaultEntryForm';
import { ChangeVaultPasswordDialog } from './ChangeVaultPasswordDialog';
import { DestroyVaultDialog } from './DestroyVaultDialog';

type Screen =
  | { kind: 'list' }
  | { kind: 'form'; entry?: VaultEntry }
  | { kind: 'password' }
  | { kind: 'destroy' };

interface VaultPanelProps {
  vault: UseVaultResult;
  onClose: () => void;
}

/** Patička odemčeného trezoru — zámek a správa samotného trezoru. */
function UnlockedFooter({
  onLock,
  onChangePassword,
  onDestroy,
}: {
  onLock: () => void;
  onChangePassword: () => void;
  onDestroy: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, borderTop: '1px solid #1e2533', paddingTop: 8 }}>
      <button type="button" className="btn" onClick={onLock} style={FOOTER_BUTTON}>
        Zamknout
      </button>
      <button type="button" className="btn" onClick={onChangePassword} style={FOOTER_BUTTON}>
        Změnit heslo trezoru
      </button>
      <button
        type="button"
        className="btn"
        onClick={onDestroy}
        style={{ ...FOOTER_BUTTON, color: '#fca5a5', borderColor: '#f8717144' }}
      >
        Zrušit trezor
      </button>
    </div>
  );
}

/** Odemčený trezor: seznam, formulář záznamu, změna hesla nebo zrušení. */
function UnlockedBody({
  vault,
  screen,
  setScreen,
}: {
  vault: UseVaultResult;
  screen: Screen;
  setScreen: (screen: Screen) => void;
}) {
  if (screen.kind === 'form') {
    return (
      <VaultEntryForm
        entry={screen.entry}
        onSave={vault.save}
        onCancel={() => setScreen({ kind: 'list' })}
      />
    );
  }
  if (screen.kind === 'password') {
    return (
      <ChangeVaultPasswordDialog
        onChange={vault.changePassword}
        onClose={() => setScreen({ kind: 'list' })}
      />
    );
  }
  if (screen.kind === 'destroy') {
    return (
      <DestroyVaultDialog onDestroy={vault.destroy} onClose={() => setScreen({ kind: 'list' })} />
    );
  }
  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => setScreen({ kind: 'form' })}
        style={{ ...FOOTER_BUTTON, alignSelf: 'flex-start', marginBottom: 8 }}
      >
        + Nový záznam
      </button>
      <VaultEntryList
        entries={vault.entries}
        onEdit={(entry) => setScreen({ kind: 'form', entry })}
        onDelete={(entry) => vault.remove(entry.id)}
      />
    </>
  );
}

export function VaultPanel({ vault, onClose }: VaultPanelProps) {
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });

  const lock = () => {
    vault.lock();
    setScreen({ kind: 'list' });
  };

  return (
    <FloatingPanel
      label="Trezor hesel"
      title={`${vault.status === 'unlocked' ? '🔓' : '🔐'} Trezor hesel`}
      closeLabel="Zavřít trezor"
      // Každý dotek posouvá odpočet automatického zámku (FR-VAULT-03).
      onInteraction={vault.touch}
      onClose={onClose}
    >
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
        {vault.status === 'loading' && (
          <div style={{ fontSize: 11, color: '#64748b' }}>Načítám…</div>
        )}
        {vault.status === 'absent' && <VaultSetupForm onCreate={vault.create} />}
        {vault.status === 'locked' && (
          <VaultUnlockForm
            onUnlock={vault.unlock}
            onDestroy={() => setScreen({ kind: 'destroy' })}
          />
        )}
        {vault.status === 'locked' && screen.kind === 'destroy' && (
          <DestroyVaultDialog
            onDestroy={vault.destroy}
            onClose={() => setScreen({ kind: 'list' })}
          />
        )}
        {vault.status === 'unlocked' && (
          <>
            <UnlockedBody vault={vault} screen={screen} setScreen={setScreen} />
            <UnlockedFooter
              onLock={lock}
              onChangePassword={() => setScreen({ kind: 'password' })}
              onDestroy={() => setScreen({ kind: 'destroy' })}
            />
          </>
        )}
      </div>
    </FloatingPanel>
  );
}

const FOOTER_BUTTON = {
  background: '#161b27',
  borderColor: '#2d3748',
  color: '#94a3b8',
  padding: '4px 9px',
  fontSize: 10,
} as const;
