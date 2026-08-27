// Drobné stavební prvky ADO Sync view — sdílené napříč sekcemi.
import { LABEL } from './styles';

export function Badge({ text, tone }: { text: string; tone: 'warn' | 'muted' | 'alert' }) {
  const tones = {
    warn: { background: '#2a2010', color: '#fcd34d' },
    muted: { background: '#1a1a2a', color: '#94a3b8' },
    alert: { background: '#2a1010', color: '#fca5a5' },
  } as const;
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, ...tones[tone] }}>
      {text}
    </span>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
}

/** Input i s popiskem; popisek je `<label>` obalující input, takže patří k sobě i bez `id`. */
export function TextField({ label, value, onChange, placeholder, type = 'text' }: TextFieldProps) {
  return (
    <label style={LABEL}>
      {label}
      <input
        className="inp"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', marginTop: 4 }}
      />
    </label>
  );
}
