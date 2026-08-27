// Rozepsaný text, který má přežít přepnutí záložky, ale nepatří na server.
//
// Přepnutí view v `AppViews` komponentu odmountuje, takže `useState` uvnitř
// sekce zmizí i s obsahem. U statusové zprávy to znamenalo, že si ji uživatel
// nechal vygenerovat, upravil ji, přepnul se na Harmonogram ověřit číslo — a
// po návratu bylo pole prázdné, bez varování.
//
// `sessionStorage`, ne `localStorage`: koncept patří k rozdělané práci
// v jednom okně. Zavřením tabu končí, na server nepatří (není to stav projektu,
// je to podklad pro e-mail) a druhé okno má rozepsáno svoje.
import { useCallback, useState } from 'react';

function read(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    // Privátní režim nebo zaplněná kvóta — koncept se prostě nezachová.
    return '';
  }
}

/** Text svázaný s klíčem; čte se jednou při mountu, zapisuje při každé změně. */
export function useSessionDraft(key: string): [string, (value: string) => void] {
  const [value, setValue] = useState(() => read(key));

  const update = useCallback(
    (next: string) => {
      setValue(next);
      try {
        if (next) sessionStorage.setItem(key, next);
        else sessionStorage.removeItem(key);
      } catch {
        // Neuložený koncept nesmí shodit psaní — hodnota zůstává ve stavu.
      }
    },
    [key]
  );

  return [value, update];
}
