// Text dokončovacího tlačítka karty rizika/příležitosti — nové ještě nepotvrzené
// položce píše "Přidat", rozpracované editaci existující "Uložit".
export function editButtonLabel(isEditing: boolean, isNew: boolean): string {
  if (!isEditing) return '✎ Edit';
  return isNew ? '+ Přidat' : '✓ Uložit';
}
