import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

/*
 * Filesystem bridge — characters and the custom catalog.
 *
 * A browser page cannot write to disk on its own, so this dev-only middleware
 * (Vite's dev server is itself a `connect` app, so req/res below are plain
 * Node objects) exposes worldbuilding/Vault/ as a tiny REST surface: GET to
 * list/read, PUT to upsert, DELETE to remove.
 *
 * `configureServer` only runs under `vite dev`, never `vite build`/`preview`
 * — correct here, since this is development plumbing, not something a built
 * app should ship with.
 *
 * Path safety is the entire point of this file. Every id (and, for the
 * catalog, every domain) is validated before it touches the filesystem, and
 * the resulting path is re-verified to still be inside its vault directory
 * before any read, write, or delete. Vault/ sits in a git-tracked Obsidian
 * vault next to ~280 lore notes; a traversal bug here is a real way to lose
 * or corrupt someone's writing.
 *
 * Every kind of thing the table authors gets its own vault directory —
 * character-vault, species-vault, trait-vault, and so on — one JSON file per
 * entry, named by id. This mirrors how a GM already thinks about their own
 * material (a folder of NPCs, a folder of homebrew items) rather than
 * burying everything in one opaque blob file.
 */

const vaultsDir = path.resolve(__dirname, '../../worldbuilding/Vault');
const charactersDir = path.resolve(vaultsDir, 'character-vault');

/*
 * The catalog domains the engine understands (character/catalogs.ts's
 * CatalogDomain). Not imported from @nenworld/engine — this file is dev
 * server config, not application code, and hardcoding stable strings here
 * is cheaper than giving the config loader a reason to resolve the whole
 * package graph. If the engine ever adds another domain, add it here too;
 * nothing here derives the list automatically.
 */
const CATALOG_DOMAINS = [
  'species',
  'clan',
  'trait',
  'technique',
  'skill',
  'condition',
  'injury',
  'item',
  'body-part',
  'special-point',
] as const;

type CatalogDomain = (typeof CATALOG_DOMAINS)[number];

function isCatalogDomain(value: string): value is CatalogDomain {
  return (CATALOG_DOMAINS as readonly string[]).includes(value);
}

function catalogVaultDir(domain: CatalogDomain): string {
  return path.resolve(vaultsDir, `${domain}-vault`);
}

// Only lowercase letters, digits, and hyphens survive. Anything else — path
// separators, dots, unicode tricks — is rejected outright rather than
// stripped, so a bad id fails loudly instead of silently mapping to a
// different file than the caller expected.
const VALID_ID = /^[a-z0-9-]+$/;

// Shared by every vault: id -> the one file it may read, write, or delete,
// or null if the id is not safe to use as a filename. `dir` must already be
// one of this file's own vault constants — never a path built from request
// input — since the containment check below only re-verifies the *id*
// portion, not that `dir` itself is trustworthy.
function entryPathFor(dir: string, id: string): string | null {
  if (!VALID_ID.test(id)) return null;

  const target = path.resolve(dir, `${id}.json`);

  // Belt and suspenders on top of the regex: confirms the resolved path
  // still lives inside dir before it is ever used.
  if (!target.startsWith(dir + path.sep)) return null;

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

// Every *.json file directly inside dir, parsed. A malformed entry is
// omitted rather than taking the whole listing down — same posture as a
// malformed character sheet.
async function listEntries(dir: string): Promise<unknown[]> {
  let filenames: string[];

  try {
    filenames = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const entries: unknown[] = [];

  for (const filename of filenames) {
    if (!filename.endsWith('.json')) continue;

    const raw = await fs.readFile(path.join(dir, filename), 'utf-8');

    try {
      entries.push(JSON.parse(raw));
    } catch {
      // Surfacing this is future UI work, same note as listSheets below.
    }
  }

  return entries;
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
            sendJson(res, 200, await listEntries(charactersDir));
            return;
          }

          if (req.method === 'GET' && id) {
            const target = entryPathFor(charactersDir, id);
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
            const target = entryPathFor(charactersDir, id);
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
            const target = entryPathFor(charactersDir, id);
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
 * Custom catalog bridge — one vault directory per domain, one file per
 * entry, named by id.
 *
 * GET /__catalog/:domain      -> every entry in that domain's vault
 * PUT /__catalog/:domain      -> replace that domain's vault wholesale
 *
 * "Wholesale" means the request body is the domain's complete entry array;
 * the handler writes one file per entry and deletes any vault file whose id
 * is no longer present. The client (state/catalog.ts) already holds the
 * engine's full registry in memory and calls this after every change, so a
 * partial-update protocol would buy nothing and add a merge conflict to
 * reason about — this is the same wholesale contract the old single-file
 * catalog had, just re-pointed at eight directories instead of one file.
 */
function catalogPlugin(): Plugin {
  return {
    name: 'nenworld-custom-catalog',

    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/__catalog')) return next();

        const pathname = url.split('?')[0] ?? url;
        const segments = pathname.split('/').filter(Boolean); // ['__catalog', ':domain'?]
        const domainSegment = segments[1] ? decodeURIComponent(segments[1]) : null;

        if (domainSegment === null || !isCatalogDomain(domainSegment)) {
          return sendError(
            res,
            400,
            `Unknown or missing catalog domain: ${String(domainSegment)}`,
          );
        }

        const domain = domainSegment;
        const dir = catalogVaultDir(domain);

        await fs.mkdir(dir, { recursive: true });

        try {
          if (req.method === 'GET') {
            sendJson(res, 200, await listEntries(dir));
            return;
          }

          if (req.method === 'PUT') {
            const body = await readJsonBody(req);
            if (!Array.isArray(body)) {
              return sendError(res, 400, 'Request body must be a JSON array of entries.');
            }

            const paths = new Map<string, string>(); // id -> target path

            for (const entry of body) {
              const entryId =
                typeof entry === 'object' && entry !== null && 'id' in entry
                  ? String((entry as { id: unknown }).id)
                  : null;

              const target = entryId ? entryPathFor(dir, entryId) : null;
              if (!target) {
                return sendError(
                  res,
                  400,
                  `Entry has a missing or invalid id: ${JSON.stringify(entry)}`,
                );
              }

              paths.set(entryId as string, target);
            }

            // Wholesale replace: write everything the client sent, then
            // remove any file on disk for an id the client no longer has —
            // that is what makes deleting an entry in the Workbench actually
            // remove it from the vault instead of leaving an orphan file.
            for (let i = 0; i < body.length; i++) {
              const entry = body[i];
              const entryId = String((entry as { id: unknown }).id);
              const target = paths.get(entryId)!;

              await fs.writeFile(target, JSON.stringify(entry, null, 2) + '\n', 'utf-8');
            }

            const existing = await fs.readdir(dir).catch(() => [] as string[]);
            const keep = new Set([...paths.values()].map((p) => path.basename(p)));

            for (const filename of existing) {
              if (filename.endsWith('.json') && !keep.has(filename)) {
                await fs.unlink(path.join(dir, filename));
              }
            }

            sendJson(res, 200, body);
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

export default defineConfig({
  plugins: [react(), characterSheetPlugin(), catalogPlugin()],
  // The engine is a linked workspace package shipping raw TypeScript.
  // Excluding it from dep pre-bundling keeps edits hot-reloading correctly.
  optimizeDeps: { exclude: ['@nenworld/engine'] },
  server: { port: 5180 },
});
