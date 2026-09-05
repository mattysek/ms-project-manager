// Tagy z historie pro našeptávač v panelu (FR-WL-05).
//
// Vlastní hook proto, že panel v liště nepotřebuje seznam záznamů — stahovat
// kvůli našeptávači celý měsíc by bylo nepoměrné.
import { useEffect, useState } from 'react';
import { listTags } from '../../api/worklogApi';

export function useWorkLogTags(): string[] {
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void listTags()
      .then((loaded) => {
        if (alive) setTags(loaded);
      })
      .catch(() => {
        // Bez našeptávače se tag napíše ručně; chybová hláška by tu byla šum.
      });
    return () => {
      alive = false;
    };
  }, []);

  return tags;
}
