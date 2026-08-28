// Přepínač plovoucího panelu v horní liště — Poznámky a Trezor.
//
// Společné ze stejného důvodu jako `FloatingPanel`: obě tlačítka mají říkat
// totéž („tenhle panel je právě otevřený") a když si to každé kreslilo po
// svém, nešlo je od sebe odlišit. Otevřený smí být jen jeden (`useOpenPanel`),
// takže zvýrazněné je vždy nanejvýš jedno.
interface PanelToggleButtonProps {
  /** Je panel právě otevřený? */
  active: boolean;
  /** Ikona před popiskem — mění se i podle stavu (zamčený trezor). */
  icon: string;
  label: string;
  /** Vlastní přístupné jméno; bez něj stačí ikona + popisek. */
  ariaLabel?: string;
  title: string;
  onClick: () => void;
}

export function PanelToggleButton({
  active,
  icon,
  label,
  ariaLabel,
  title,
  onClick,
}: PanelToggleButtonProps) {
  return (
    <button
      type="button"
      className="btn"
      onClick={onClick}
      // `aria-pressed` je tu to podstatné: přepínač musí i bez barev říct,
      // který panel je zapnutý — odečítači obrazovky i testu.
      aria-pressed={active}
      aria-label={ariaLabel}
      title={title}
      style={{
        background: active ? '#0d1f38' : '#161b27',
        // Plná barva okraje, ne průhledná: aktivní tlačítko má být poznat
        // na první pohled, ne po zaostření.
        borderColor: active ? '#4f9cf9' : '#2d3748',
        color: active ? '#bfdbfe' : '#94a3b8',
        fontWeight: active ? 700 : 400,
      }}
    >
      {icon} {label}
    </button>
  );
}
