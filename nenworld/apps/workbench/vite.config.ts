import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/*
 * Character sheet filesystem bridge.
 *
 * A browser page cannot write to disk on its own, so this dev-only middleware
 * (Vite's dev server is itself a `connect` app, so req/res below are plain
 * Node objects) exposes the worldbuilding/character-vault/ folder as a tiny REST
 * surface: GET to list/read, PUT to upsert, DELETE to remove.
 *
 * `configureServer` only runs under `vite dev`, never `vite build`/`preview`
 * — correct here, since this is development plumbing, not something a built
 * app should ship with.
 *
 * Path safety is the entire point of this file. Every id is slugified before
 * it touches the filesystem, and the resulting path is re-verified to still
 * be inside charactersDir before any read, write, or delete. This directory
 * sits in a git-tracked Obsidian vault next to ~280 lore notes; a traversal
 * bug here is a real way to lose or corrupt someone's writing.
 */

const charactersDir = path.resolve(__dirname, '../../worldbuilding/character-vault');

/*
 * The custom catalog: Species, Clans, Traits and the rest that this table
 * authored rather than the engine.
 *
 * One fixed file rather than a directory of them, and deliberately no
 * user-controlled path segment anywhere near it — the whole endpoint reads and
 * writes exactly this path, so none of the traversal reasoning above applies.
 * It sits beside the vault rather than inside it so listSheets() cannot
 * mistake it for a character.
 */
const catalogFile = path.resolve(__dirname, '../../worldbuilding/workbench-catalog.json');

// Only lowercase letters, digits, and hyphens survive. Anything else — path
// separators, dots, unicode tricks — is rejected outright rather than
// stripped, so a bad id fails loudly instead of silently mapping to a
// different file than the caller expected.
const VALID_ID = /^[a-z0-9-]+$/;

function sheetPathFor(id: string): string | null {
  if (!VALID_ID.test(id)) return null;

  const target = path.resolve(charactersDir, `${id}.json`);

  // Belt and suspenders on top of the regex: confirms the resolved path
  // still lives inside charactersDir before it is ever used.
  if (!target.startsWith(charactersDir + path.sep)) return null;

  return target;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(text);
}

function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

// Vite/connect does not parse request bodies by default. Reading the raw
// stream ourselves avoids pulling in body-parser/express for what is
// otherwise a ~100-line plugin.
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch {
        reject(new Error('Request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

async function listSheets(): Promise<unknown[]> {
  let entries: string[];

  try {
    entries = await fs.readdir(charactersDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const sheets: unknown[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;

    const raw = await fs.readFile(path.join(charactersDir, entry), 'utf-8');

    try {
      sheets.push(JSON.parse(raw));
    } catch {
      // A malformed sheet should not take the whole roster down; it is
      // simply omitted. (Step 3's UI can surface this as a diagnostic once
      // there is somewhere to show it.)
    }
  }

  return sheets;
}

function characterSheetPlugin(): Plugin {
  return {
    name: 'nenworld-character-sheets',

    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/__characters')) return next();

        // Ensures the directory exists before any operation touches it —
        // a fresh checkout of the vault may not have created it yet.
        await fs.mkdir(charactersDir, { recursive: true });

        const pathname = url.split('?')[0] ?? url;
        const segments = pathname.split('/').filter(Boolean); // ['__characters', ':id'?]
        const id = segments[1] ? decodeURIComponent(segments[1]) : null;

        try {
          if (req.method === 'GET' && segments.length === 1) {
            sendJson(res, 200, await listSheets());
            return;
          }

          if (req.method === 'GET' && id) {
            const target = sheetPathFor(id);
            if (!target) return sendError(res, 400, `Invalid character id: ${id}`);

            try {
              const raw = await fs.readFile(target, 'utf-8');
              sendJson(res, 200, JSON.parse(raw));
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                sendError(res, 404, `No character sheet for id: ${id}`);
              } else {
                throw error;
              }
            }
            return;
          }

          if (req.method === 'PUT' && id) {
            const target = sheetPathFor(id);
            if (!target) return sendError(res, 400, `Invalid character id: ${id}`);

            const body = await readJsonBody(req);
            if (typeof body !== 'object' || body === null) {
              return sendError(res, 400, 'Request body must be a JSON object.');
            }

            const sheet = body as { id?: unknown };
            if (sheet.id !== id) {
              return sendError(
                res,
                400,
                `Body id (${String(sheet.id)}) does not match URL id (${id}).`,
              );
            }

            await fs.writeFile(target, JSON.stringify(body, null, 2) + '\n', 'utf-8');
            sendJson(res, 200, body);
            return;
          }

          if (req.method === 'DELETE' && id) {
            const target = sheetPathFor(id);
            if (!target) return sendError(res, 400, `Invalid character id: ${id}`);

            try {
              await fs.unlink(target);
              sendJson(res, 200, { deleted: id });
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                sendError(res, 404, `No character sheet for id: ${id}`);
              } else {
                throw error;
              }
            }
            return;
          }

          sendError(res, 400, `Unsupported request: ${req.method} ${pathname}`);
        } catch (error) {
          sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
        }
      });
    },
  };
}

/*
 * Custom catalog bridge. GET returns the file (or an empty catalog if it has
 * never been written), PUT replaces it wholesale.
 *
 * Wholesale rather than per-entry because the client already holds the whole
 * catalog in memory and the engine registers it as a batch: a partial-update
 * protocol would buy nothing and add a merge conflict to reason about.
 */
function catalogPlugin(): Plugin {
  return {
    name: 'nenworld-custom-catalog',

    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/__catalog')) return next();

        try {
          if (req.method === 'GET') {
            try {
              const raw = await fs.readFile(catalogFile, 'utf-8');
              sendJson(res, 200, JSON.parse(raw));
            } catch (error) {
              // Never written yet is the normal first-run state, not an error.
              if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                sendJson(res, 200, null);
              } else {
                throw error;
              }
            }
            return;
          }

          if (req.method === 'PUT') {
            const body = await readJsonBody(req);
            if (typeof body !== 'object' || body === null) {
              return sendError(res, 400, 'Request body must be a JSON object.');
            }

            await fs.writeFile(
              catalogFile,
              JSON.stringify(body, null, 2) + '\n',
              'utf-8',
            );
            sendJson(res, 200, body);
            return;
          }

          sendError(res, 400, `Unsupported request: ${req.method} /__catalog`);
        } catch (error) {
          sendError(res, 500, error instanceof Error ? error.message : 'Unknown error');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), characterSheetPlugin(), catalogPlugin()],
  // The engine is a linked workspace package shipping raw TypeScript.
  // Excluding it from dep pre-bundling keeps edits hot-reloading correctly.
  optimizeDeps: { exclude: ['@nenworld/engine'] },
  server: { port: 5180 },
});
