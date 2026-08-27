// Nahrání příloh z importovaného ZIPu na server.
//
// Přílohy do `full_state_import` **nepatří**: obsah souborů leží mimo
// `AppState` (ADR-010) a `ImportedFile` navíc nemá `addedBy`, které je na
// serveru povinné pole `FileRef`. Poslat je uvnitř stavu tedy neznamená
// „přílohy se neuloží", ale „celý command spadne na vazbě argumentů a
// neimportuje se nic" — přesně to se dělo u ZIP importu z LandingPage.
//
// Správné pořadí je: naimportovat projekt bez příloh, pak je nahrát přes REST
// a nechat si je vrátit jako `file_added` diffy.
import { uploadFile } from '../api/filesApi';
import type { ImportedFile } from '../utils/importExport';

/** Base64 ze ZIPu zpět na `File`, aby šel poslat multipartem. */
function toFile(imported: ImportedFile): File {
  const binary = atob(imported.content);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], imported.name, { type: imported.mimeType });
}

/** Nahraje přílohy; vrací názvy těch, které se nepodařilo uložit. */
export async function uploadImported(
  projectId: string,
  files: ImportedFile[]
): Promise<string[]> {
  const failed: string[] = [];
  for (const imported of files) {
    try {
      await uploadFile(projectId, toFile(imported));
    } catch {
      failed.push(imported.name);
    }
  }
  return failed;
}
