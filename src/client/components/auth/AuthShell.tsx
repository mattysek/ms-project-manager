// Sdílený layout přihlašovacích stránek (Login, Setup, Registrace) — drží styl
// konzistentní s LandingPage a nemá logiku, jen rám.
//
// Třídy si bere z `AppStyles`, aby existovaly jen jednou; vlastní `<style>`
// blok dopisuje pouze to, čím se přihlašovací stránky vědomě liší — větší
// vstupní pole, protože je to jediný obsah na obrazovce.
import { AppStyles } from '../AppStyles';

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'IBM Plex Mono','Courier New',monospace",
        background: '#0f1117',
        minHeight: '100vh',
        color: '#e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <AppStyles />
      {/* Jediná vědomá odchylka: na přihlašovací obrazovce je formulář jediný
          obsah, takže snese větší pole než hustý layout uvnitř aplikace. */}
      <style>{`
        .inp{font-size:12px;padding:7px 10px}
      `}</style>
      <div
        style={{
          width: '100%',
          maxWidth: 340,
          border: '1px solid #1e2533',
          borderRadius: 12,
          padding: 28,
          background: '#0c1018',
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: '#4f9cf9',
            marginBottom: 4,
            fontFamily: "'IBM Plex Sans',sans-serif",
          }}
        >
          📊 MS Project Manager
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}
