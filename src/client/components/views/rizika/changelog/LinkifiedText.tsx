/** Vykreslí text s klikatelnými odkazy — URL rozpozná a obalí `<a>`. */
export function LinkifiedText({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      // Reset regex lastIndex
      urlRegex.lastIndex = 0;
      return (
        <a
          // parts vznikají split()em pevného textu vždy znovu od nuly (žádné
          // mazání/přeuspořádání existujícího seznamu), odkazy nemají vlastní
          // stav — pozice v textu spolu s obsahem je dostatečně stabilní identita.
          // biome-ignore lint/suspicious/noArrayIndexKey: viz komentář výše
          key={`${index}-${part}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#4f9cf9',
            textDecoration: 'none',
            wordBreak: 'break-all',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
