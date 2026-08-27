// Přílohy (ADR-010) — REST klient. Obsah souboru nikdy neprochází stavem
// projektu ani SignalR broadcastem (multipart nejde poslat přes SignalR);
// `server/.../Api/FilesApi.fs` po uploadu/smazání pošle metadata jako diff
// (`file_added`/`file_deleted`) sám sobě, takže se rozešlou stejnou cestou
// jako ostatní změny — klient je jako commandy neposílá (viz `useFilesCommand.ts`).
//
// Limit 25 MB a MIME whitelist vynucuje server (`FilesApi.upload`); tenhle
// modul jen srozumitelně předá jeho chybovou hlášku dál, žádnou validaci
// neduplikuje.
import type { FileRef } from '../types';

export class FilesApiError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'FilesApiError';
  }
}

async function errorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `${response.status} ${response.statusText}`;
  try {
    const parsed = JSON.parse(text) as { message?: string };
    return parsed.message || text;
  } catch {
    return text;
  }
}

async function assertOk(response: Response): Promise<Response> {
  if (!response.ok) throw new FilesApiError(await errorMessage(response), response.status);
  return response;
}

function fileUrl(fileId: string, inline: boolean): string {
  return `/api/files/${encodeURIComponent(fileId)}${inline ? '?inline=true' : ''}`;
}

export interface UploadedFile {
  file: FileRef;
  totalSize: number;
}

/** `POST /api/projects/{id}/files` — multipart; `fetch` sám doplní boundary do `Content-Type`. */
export async function uploadFile(projectId: string, file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.append('file', file);
  const response = await assertOk(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
  );
  return (await response.json()) as UploadedFile;
}

/** URL pro přímý `<img src>`/`<iframe src>` — cookie auth funguje i mimo `fetch` (ADR-010 preview flow). */
export function inlinePreviewUrl(fileId: string): string {
  return fileUrl(fileId, true);
}

/** Obsah pro klientský parsing (Excel/Word/text náhled) — `?inline=true`, žádné stažení do souborů. */
export async function fetchFileArrayBuffer(fileId: string): Promise<ArrayBuffer> {
  const response = await assertOk(await fetch(fileUrl(fileId, true), { credentials: 'include' }));
  return response.arrayBuffer();
}

export async function fetchFileText(fileId: string): Promise<string> {
  const response = await assertOk(await fetch(fileUrl(fileId, true), { credentials: 'include' }));
  return response.text();
}

/** `GET /api/files/{id}` ke stažení — server pošle `Content-Disposition: attachment`. */
export async function fetchFileBlob(fileId: string): Promise<Blob> {
  const response = await assertOk(await fetch(fileUrl(fileId, false), { credentials: 'include' }));
  return response.blob();
}

/** `DELETE /api/files/{id}` — smí jen PM; server ověří, klient tlačítko jen skryje (ADR-006). */
export async function deleteFile(fileId: string): Promise<void> {
  await assertOk(await fetch(fileUrl(fileId, false), { method: 'DELETE', credentials: 'include' }));
}
