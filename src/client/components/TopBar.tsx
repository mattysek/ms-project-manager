// Uživatelský účet + Quick Notes — nad `Header`/`LandingPage`, ne uvnitř nich.
//
// `Header.tsx` má už dnes hraniční počet props (PRD-07 nejsilnější signál
// špatné dekompozice v codebase) a navíc ho nevidí LandingPage vůbec — kdyby
// UserMenu/QuickNotes žily uvnitř Header, panel by podle FR-QN-01 nešel
// zobrazit „i na LandingPage bez otevřeného projektu". Fixní lišta nad obsahem
// je proto společné místo pro obě stránky beze změny Header.tsx/LandingPage.tsx.
import type { ReactNode } from 'react';
import type { CurrentUser } from '../api/authApi';
import type { MemberRole } from '../types/protocol';
import { UserMenu } from './auth/UserMenu';
import { LAYERS } from '../constants/layers';

interface TopBarProps {
  user: CurrentUser;
  role: MemberRole | null;
  onLogout: () => void;
  onOpenAdmin: () => void;
  quickNotes: ReactNode;
  /** Trezor hesel (PRD-09) — vedle poznámek, ze stejného důvodu: musí být
      dostupný i na LandingPage bez otevřeného projektu. */
  vault: ReactNode;
}

/**
 * Výška lišty; obsah pod ní si o ni odsazuje vršek (`AuthenticatedApp`).
 *
 * Lišta je `fixed`, takže sama o sobě v layoutu nezabírá místo. Dokud si ho
 * obsah nerezervoval, sedělo pravé křídlo hlavičky projektu přesně pod ní a
 * uživatelské menu (z-index 4000) polykalo kliknutí na „⬆ Import" a
 * „⬇ Export" — obě tlačítka byla fakticky nefunkční, v každém rozlišení.
 */
export const TOP_BAR_HEIGHT = 48;

export function TopBar({ user, role, onLogout, onOpenAdmin, quickNotes, vault }: TopBarProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: TOP_BAR_HEIGHT,
        paddingRight: 14,
        // Neprůhledné pozadí: obsah se pod lištou roluje a bez něj by se
        // prosvítal skrz jméno uživatele.
        background: '#0f1117',
        borderBottom: '1px solid #1e2533',
        zIndex: LAYERS.topBar,
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {vault}
      {quickNotes}
      <UserMenu user={user} role={role} onLogout={onLogout} onOpenAdmin={onOpenAdmin} />
    </div>
  );
}
