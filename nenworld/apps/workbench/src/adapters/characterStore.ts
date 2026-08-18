/*
 * characterStore — the only file that talks to the /__characters filesystem
 * bridge (see vite.config.ts).
 *
 * Mirrors adapters/pipeline.ts, which is the only file that talks to the
 * engine: one narrow surface per external boundary. Nothing else in the app
 * should call fetch('/__characters...') directly — the state layer built on
 * top of this is what the rest of the UI reads from.
 */

import type { CharacterSheet } from '../state/sheet';

async function parseOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return body;
}

export async function listCharacterSheets(): Promise<CharacterSheet[]> {
  const response = await fetch('/__characters');
  return (await parseOrThrow(response)) as CharacterSheet[];
}

export async function loadCharacterSheet(id: string): Promise<CharacterSheet> {
  const response = await fetch(`/__characters/${encodeURIComponent(id)}`);
  return (await parseOrThrow(response)) as CharacterSheet;
}

export async function saveCharacterSheet(sheet: CharacterSheet): Promise<void> {
  const response = await fetch(`/__characters/${encodeURIComponent(sheet.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sheet),
  });

  await parseOrThrow(response);
}

export async function deleteCharacterSheet(id: string): Promise<void> {
  const response = await fetch(`/__characters/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  await parseOrThrow(response);
}
