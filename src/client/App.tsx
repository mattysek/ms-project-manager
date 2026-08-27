// Kořen aplikace — jen skládá autentizaci (`AuthGate`, PRD-01) s vlastní
// aplikací (`AuthenticatedApp`). Zbytek stavu žije v obou vytažených
// komponentách/hoocích, viz jejich komentáře.
import { AuthGate } from './components/auth/AuthGate';
import { AuthenticatedApp } from './components/AuthenticatedApp';

export default function App() {
  return <AuthGate>{(auth) => <AuthenticatedApp auth={auth} />}</AuthGate>;
}
