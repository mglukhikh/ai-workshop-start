// The local web view: a page with a field for the repository, its skills and their SKILL.md.
// The same scan as the CLI, over HTTP on this machine only. Nothing is stored.
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { AtlasError } from './core/errors.ts';
import type { GitHubOptions } from './core/github.ts';
import { skillLink } from './core/model.ts';
import { scan, type ScanTarget } from './core/scan.ts';

export type WebOptions = {
  /** Opens what the user asked to scan, as the CLI does. */
  open(input: string, options: Pick<GitHubOptions, 'signal' | 'onOrganizationProgress'>): Promise<ScanTarget>;
  /** 0: any free port. */
  port: number;
};

const PAGE = new URL('./web.html', import.meta.url);

/** Starts the server on 127.0.0.1; resolves to its address, `http://127.0.0.1:<port>`. */
export async function serve({ open, port }: WebOptions): Promise<{ url: string; close(): Promise<void> }> {
  const page = await readFile(PAGE, 'utf8');
  const server = createServer((request, response) => {
    handle(request, response, page, open).catch((error) => {
      send(response, 500, { error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) =>
      reject(error.code === 'EADDRINUSE' ? new AtlasError(`Port ${port} is in use; try another: skill-atlas serve <port>`) : error),
    );
    server.listen(port, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

async function handle(request: IncomingMessage, response: ServerResponse, page: string, open: WebOptions['open']) {
  // Only this machine's own pages: another site's page, through DNS rebinding, names its own host.
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host ?? '')) return send(response, 403, { error: 'Forbidden host' });
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method !== 'GET') return send(response, 405, { error: 'Only GET' });
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return void response.end(page);
  }
  if (url.pathname === '/api/scan') {
    const repo = url.searchParams.get('repo')?.trim();
    if (!repo) return send(response, 400, { error: 'A GitHub URL or a directory, please' });
    const controller = new AbortController();
    response.once('close', () => controller.abort());
    const stream = url.searchParams.get('progress') === '1';
    const write = (event: unknown) => {
      if (!controller.signal.aborted) response.write(JSON.stringify(event) + '\n');
    };
    if (stream) {
      response.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8' });
      response.flushHeaders();
    }
    try {
      const result = await scan(await open(repo, {
        signal: controller.signal,
        onOrganizationProgress: stream ? (progress) => write({ progress }) : undefined,
      }));
      if (controller.signal.aborted) return;
      const skills = result.skills.map((skill) => ({ ...skill, link: skillLink(result.repository, skill) }));
      const body = { repository: result.repository, skills, warnings: result.warnings };
      if (!stream) return send(response, 200, body);
      write({ result: body });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (!stream) {
        if (error instanceof AtlasError) return send(response, 400, { error: error.message });
        throw error;
      }
      write({ error: error instanceof AtlasError ? error.message : 'Unexpected scan error' });
    }
    response.end();
    return;
  }
  send(response, 404, { error: 'Not found' });
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
