// Přepínač plovoucího panelu v horní liště — Poznámky, Trezor a Výkazy.
//
// Společné ze stejného důvodu jako `FloatingPanel`: všechna tři tlačítka mají
// říkat totéž („tenhle panel je právě otevřený") a když si to každé kreslilo
// po svém, nešlo je od sebe odlišit. Otevřený smí být jen jeden
// (`useOpenPanel`), takže zvýrazněné je vždy nanejvýš jedno.
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
      // `.btn-active` má plnou barvu okraje, ne průhlednou: zapnutý panel má
      // být poznat na první pohled, ne až po zaostření. Barvy bydlí
      // v `AppStyles`, aby se ten stav nekreslil v každé liště jinak.
      className={active ? 'btn btn-active' : 'btn'}
      onClick={onClick}
      // `aria-pressed` je tu to podstatné: přepínač musí i bez barev říct,
      // který panel je zapnutý — odečítači obrazovky i testu.
      aria-pressed={active}
      aria-label={ariaLabel}
      title={title}
    >
      {icon} {label}
    </button>
  );
}
