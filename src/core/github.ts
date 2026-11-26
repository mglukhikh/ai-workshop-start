import { AtlasError } from './errors.ts';
import { SKILL_ROOTS } from './find.ts';
import type { ScanTarget, Source } from './scan.ts';

/** The part of `fetch` the core uses, so tests and the browser can pass their own. */
export type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

export type GitHubOptions = {
  fetch: Fetch;
  signal?: AbortSignal;
  onOrganizationProgress?(progress: { completed: number; total?: number; current?: string }): void;
  /** With a token, skills are found through code search; without it, through the tree. */
  token?: string;
};

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

/**
 * `https://github.com/owner/repo`, with or without the scheme, a trailing slash or `.git`;
 * `…/tree/<commit or branch>` for that commit, or the branch's latest one.
 */
export function parseGitHubUrl(input: string): { owner: string; repo: string; ref?: string } | undefined {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^\s?#]+?))?\/?$/i.exec(input.trim());
  return match ? { owner: match[1], repo: match[2], ref: match[3] } : undefined;
}

export function parseGitHubOrganization(input: string): string | undefined {
  return /^(?:https?:\/\/)?(?:www\.)?github\.com\/(?:orgs\/)?([a-z\d][a-z\d-]*)\/?$/i.exec(input.trim())?.[1];
}

type GitHubRepository = { full_name: string; default_branch: string; private?: boolean };

export async function openGitHubTarget(input: string, options: GitHubOptions): Promise<ScanTarget> {
  const organization = parseGitHubOrganization(input);
  if (!organization) return openGitHub(input, options);
  const deadline = AbortSignal.timeout(180_000);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  const scanOptions = { ...options, signal };
  const github = client(scanOptions);
  const url = `https://github.com/${organization}`;
  return {
    repository: { id: organization, organization, name: organization, url, commit: '' },
    deadline,
    async *sources() {
      options.onOrganizationProgress?.({ completed: 0 });
      const seen = new Set<string>();
      let total: number | undefined;
      for (let page = 1; ; page++) {
        const notFound = `Organization not found: ${url}`;
        const repos = await github.json<GitHubRepository[] | undefined>(
          `${API}/orgs/${organization}/repos?per_page=100&page=${page}`,
          notFound,
          [404],
          page === 1 ? 404 : undefined,
          (response, repositories) => {
            const lastLink = response.headers.get('link')?.split(',').find((link) => /;\s*rel="last"/.test(link));
            const lastPage = Number(lastLink?.match(/[?&]page=(\d+)(?:&|>)/)?.[1]);
            if (Number.isSafeInteger(lastPage * 100) && lastPage > page) total = lastPage * 100;
            const remaining = response.headers.get('x-ratelimit-remaining');
            const unscanned = new Set((repositories as GitHubRepository[])
              .map((repo) => repo.full_name).filter((id) => !seen.has(id)));
            if (remaining !== null && 2 * unscanned.size > Number(remaining)) {
              throw new AtlasError(options.token
                ? 'GitHub rate limit too low to scan this organization; try again after it resets'
                : 'GitHub rate limit too low to scan this organization; set GITHUB_TOKEN and retry');
            }
          },
        );
        if (!repos) {
          const account = await github.json<{ type: string } | undefined>(
            `${API}/users/${organization}`, notFound, [404], 404,
          );
          throw new AtlasError(account?.type === 'User'
            ? `GitHub user accounts are unsupported for organization scans: ${url}`
            : notFound);
        }
        if (repos.length < 100) total = new Set([...seen, ...repos.map((repo) => repo.full_name)]).size;
        for (const repo of repos) {
          if (seen.has(repo.full_name)) continue;
          signal.throwIfAborted();
          options.onOrganizationProgress?.({ completed: seen.size, total, current: repo.full_name });
          seen.add(repo.full_name);
          const source = await openRepository(client(scanOptions), repo, undefined, false, true);
          if (source) yield source;
          options.onOrganizationProgress?.({ completed: seen.size, total });
        }
        if (repos.length < 100) return;
      }
    },
  };
}

/** Resolves the commit, the URL's or the default branch's latest, and lists the files that may be skills. */
export async function openGitHub(input: string, options: GitHubOptions): Promise<Source> {
  const name = parseGitHubUrl(input);
  if (!name) throw new AtlasError(`Not a GitHub repository URL: ${input}`);
  const github = client(options);
  const info = await github.json<GitHubRepository>(
    `${API}/repos/${name.owner}/${name.repo}`,
    `Repository not found: https://github.com/${name.owner}/${name.repo}`,
  );
  return (await openRepository(github, info, name.ref, Boolean(options.token)))!;
}

async function openRepository(
  github: Client, info: GitHubRepository, requestedRef: string | undefined, token: boolean, organizationScan = false,
): Promise<Source | undefined> {
  const id = info.full_name;
  const ref = requestedRef ?? info.default_branch;
  const commit = await github.json<{ sha: string } | undefined>(
    `${API}/repos/${id}/commits/${encodePath(ref)}`,
    `No commit or branch ${ref} in https://github.com/${id}`,
    [404, 422],
    organizationScan ? 409 : undefined,
  );
  if (!commit) return undefined;
  const { sha } = commit;
  const warnings: string[] = [];
  // Code search sees only the default branch: a commit of the URL is listed through its tree.
  const search = token && !requestedRef;
  const hint = requestedRef || organizationScan ? '' : ' (GITHUB_TOKEN searches everywhere)';
  const paths = search ? await searchPaths(github, id) : await treePaths(github, id, sha, warnings, hint);
  const [organization, repo] = id.split('/');
  return {
    repository: { id, organization, name: repo, url: `https://github.com/${id}`, commit: sha },
    paths,
    warnings,
    read: (path) => info.private
      ? github.raw(`${API}/repos/${id}/contents/${encodePath(path)}?ref=${sha}`, true)
      : github.raw(`${RAW}/${id}/${sha}/${encodePath(path)}`),
  };
}

/** Code search looks at the whole default branch, 100 results a page. */
async function searchPaths(github: Client, id: string): Promise<string[]> {
  const paths = new Set<string>(); // pages can repeat a result
  // GitHub returns at most 1000 results: ten pages.
  for (let page = 1; page <= 10; page++) {
    const result = await github.json<{ total_count: number; items: { path: string }[] }>(
      `${API}/search/code?q=filename:SKILL.md+repo:${id}&per_page=100&page=${page}`,
    );
    for (const item of result.items) paths.add(item.path);
    if (result.items.length < 100 || page * 100 >= result.total_count) break;
  }
  return [...paths];
}

type Tree = { truncated: boolean; tree: { path: string; mode: string; type: string; sha: string }[] };

/** The whole tree at once, or only the skill roots when it is too large for one answer. */
async function treePaths(github: Client, id: string, sha: string, warnings: string[], hint: string): Promise<string[]> {
  const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${sha}?recursive=1`);
  if (!tree.truncated) return files(tree);
  warnings.push(`the tree is too large to list at once; looked only in ${SKILL_ROOTS.join(', ')}${hint}`);
  const paths: string[] = [];
  for (const root of SKILL_ROOTS) {
    const rootSha = await directory(github, id, sha, root);
    if (!rootSha) continue;
    const subtree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${rootSha}?recursive=1`);
    paths.push(...files(subtree).map((path) => `${root}/${path}`));
  }
  return paths;
}

/** Walks down one level at a time; the directory's tree, or undefined if it does not exist. */
async function directory(github: Client, id: string, sha: string, path: string): Promise<string | undefined> {
  let current = sha;
  for (const segment of path.split('/')) {
    const tree = await github.json<Tree>(`${API}/repos/${id}/git/trees/${current}`);
    const entry = tree.tree.find((item) => item.path === segment && item.type === 'tree');
    if (!entry) return undefined;
    current = entry.sha;
  }
  return current;
}

/** Regular files only: a symbolic link's content is its target, not a SKILL.md. */
function files(tree: Tree): string[] {
  return tree.tree.filter((item) => item.type === 'blob' && item.mode !== '120000').map((item) => item.path);
}

type Client = ReturnType<typeof client>;

function client({ fetch, token, signal: scanSignal }: GitHubOptions) {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const answers = new Map<string, Promise<unknown>>(); // the root tree is asked for once per skill root

  async function get<T>(
    url: string,
    requestHeaders: Record<string, string> | undefined,
    read: (response: Response, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const timeout = AbortSignal.timeout(15_000);
    const signal = scanSignal ? AbortSignal.any([scanSignal, timeout]) : timeout;
    try {
      signal.throwIfAborted();
      const response = await fetch(url, { headers: requestHeaders, signal });
      return await read(response, signal);
    } catch (error) {
      scanSignal?.throwIfAborted();
      if (error instanceof AtlasError) throw error;
      throw new AtlasError(`Cannot reach GitHub: ${describe(error)}`);
    }
  }

  async function request(url: string, notFound: string, notFoundStatuses: number[], emptyStatus?: number, onSuccess?: (response: Response, body: unknown) => void): Promise<unknown> {
    return get(url, headers, async (response, signal) => {
      if (response.ok) {
        const body: unknown = await response.json();
        onSuccess?.(response, body);
        return body;
      }
      if (response.status === emptyStatus) return undefined;
      const body: unknown = await response.json().catch((error: unknown) => {
        if (signal.aborted) throw error;
        return undefined;
      });
      const message = (body as { message?: unknown } | undefined)?.message;
      const text = typeof message === 'string' ? message : '';
      if (notFoundStatuses.includes(response.status)) throw new AtlasError(notFound);
      if ((response.status === 403 || response.status === 429) && /rate limit/i.test(text)) {
        throw new AtlasError(`GitHub rate limit reached; ${token ? 'try again in a minute' : 'set GITHUB_TOKEN'}`);
      }
      if (response.status === 401) throw new AtlasError('GitHub rejected the token in GITHUB_TOKEN');
      throw new AtlasError(`GitHub answered ${response.status} for ${url}${text && `: ${text}`}`);
    });
  }

  return {
    /** A GitHub API answer; `notFound` explains a 404, or the other `notFoundStatuses`. */
    json<T>(url: string, notFound = `Not found on GitHub: ${url}`, notFoundStatuses = [404], emptyStatus?: number, onSuccess?: (response: Response, body: unknown) => void): Promise<T> {
      if (!answers.has(url)) answers.set(url, request(url, notFound, notFoundStatuses, emptyStatus, onSuccess));
      return answers.get(url) as Promise<T>;
    },
    /** A file's bytes at the scanned commit, or undefined if it is not there. */
    async raw(url: string, authenticated = false): Promise<Uint8Array | undefined> {
      const requestHeaders = authenticated ? { ...headers, Accept: 'application/vnd.github.raw+json' } : undefined;
      return get(url, requestHeaders, async (response) => {
        if (response.status === 404) return undefined;
        if (!response.ok) throw new AtlasError(`GitHub answered ${response.status} for ${url}`);
        return new Uint8Array(await response.arrayBuffer());
      });
    },
  };
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}
