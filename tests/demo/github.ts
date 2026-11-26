// What GitHub answers in the demo tests: fixed organizations, repositories, commits and SKILL.md
// files. A test can hold a repository's requests until it releases them, so every progress state
// of an organization scan is shown and checked in order, whatever the machine's speed.
import type { Fetch } from '../../src/core/github.ts';
import { replay, type Recording } from '../../src/core/replay.ts';
import { EXAMPLE_COMMIT } from '../helpers.ts';

export const COMMIT = EXAMPLE_COMMIT;

type Repository = { name: string; skills?: Record<string, string>; empty?: boolean };

/** An organization's answers: the repository list, each default-branch commit, tree and SKILL.md. */
function organization(owner: string, repositories: Repository[]): Recording {
  return {
    [`https://api.github.com/orgs/${owner}/repos?per_page=100&page=1`]: {
      status: 200, body: repositories.map(({ name }) => ({ full_name: `${owner}/${name}`, default_branch: 'main' })),
    },
    ...Object.fromEntries(repositories.flatMap(({ name, skills = {}, empty }): [string, Recording[string]][] => {
      const repo = `${owner}/${name}`;
      if (empty) return [[`https://api.github.com/repos/${repo}/commits/main`, { status: 409, body: { message: 'Git Repository is empty.' } }]];
      return [
        [`https://api.github.com/repos/${repo}/commits/main`, { status: 200, body: { sha: COMMIT } }],
        [`https://api.github.com/repos/${repo}/git/trees/${COMMIT}?recursive=1`, {
          status: 200,
          body: { truncated: false, tree: Object.keys(skills).map((path) => ({ path, type: 'blob', mode: '100644' })) },
        }],
        ...Object.entries(skills).map(([path, text]): [string, Recording[string]] =>
          [`https://raw.githubusercontent.com/${repo}/${COMMIT}/${path}`, { status: 200, body: text }]),
      ];
    })),
  };
}

const skill = (name: string, description: string, body = '') =>
  `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n${body}`;

/** The organization of the organization-scan demo: five repositories, one of them empty. */
export const ORGANIZATION_SCAN = organization('JetBrains', [
  { name: 'kotlin', skills: {
    '.claude/skills/build-tools-bump-gradle-api/SKILL.md': skill('build-tools-bump-gradle-api',
      'Bumps the Gradle API version that Kotlin Gradle plugins are compiled against. Use when a new Gradle release is out.',
      '\n## Steps\n\n1. Update the version in the build settings.\n2. Run the compatibility tests.\n'),
    '.claude/skills/write-compiler-test/SKILL.md': skill('write-compiler-test',
      'Writes a diagnostic test for the Kotlin compiler. Use when a compiler change needs a test.'),
  } },
  { name: 'intellij-community', skills: {
    '.agents/skills/commits/SKILL.md': skill('commits',
      'Writes commit messages the way this repository does. Use for every commit.'),
    'platform/.agents/skills/inspection/SKILL.md': skill('inspection',
      'Adds a code inspection with a quick-fix. Use when a new inspection is requested.'),
    'docs/skills/sample/SKILL.md': skill('sample', 'Test data, not a skill.'),
  } },
  { name: 'archive', empty: true },
  { name: 'compose-multiplatform', skills: {
    '.github/skills/release-notes/SKILL.md': skill('release-notes',
      'Drafts release notes from the merged pull requests. Use before a release.'),
  } },
  { name: 'ktor', skills: {
    '.agents/skills/commits/SKILL.md': skill('commits',
      'Writes commit messages in the Ktor style. Use for every commit.'),
    '.agents/skills/plugin/SKILL.md': '---\nname: plugin\ndescription: [broken\n---\n# plugin\n',
  } },
]);
export const ORGANIZATION_SCAN_REPOSITORIES = ['kotlin', 'intellij-community', 'archive', 'compose-multiplatform', 'ktor']
  .map((name) => `JetBrains/${name}`);

/** The organization of the rate-limit demo: GitHub's quota ends after the first repository. */
export const RATE_LIMITED = organization('JetBrains', ['first', 'second'].map((name) => ({
  name, skills: { 'tools/.agents/skills/shared/SKILL.md': '---\nname: shared\ndescription: Shared skill.\n---\n' },
})));

/** A recorded GitHub whose requests a test can hold, per repository, and release one by one. */
export class SimulatedGitHub {
  private readonly answer: Fetch;
  private readonly held = new Map<string, PromiseWithResolvers<void>>();
  private readonly rateLimited = new Set<string>();

  constructor(recording: Recording) { this.answer = replay(recording); }

  /**
   * Holds every request about a repository, `owner/name`, or an organization's repository list,
   * `owner`, until `release` with the same name.
   */
  hold(...repositories: string[]) {
    for (const repository of repositories) this.held.set(repository, Promise.withResolvers());
  }

  release(repository: string) {
    this.held.get(repository)?.resolve();
    this.held.delete(repository);
  }

  /** GitHub answers 403 with no remaining quota to every request about `repository`. */
  rateLimit(repository: string) { this.rateLimited.add(repository); }

  readonly fetch: Fetch = async (url, init) => {
    const repository = url.match(/^https:\/\/(?:api\.github\.com\/repos|raw\.githubusercontent\.com)\/([^/]+\/[^/]+)\//)?.[1];
    const organization = url.match(/^https:\/\/api\.github\.com\/orgs\/([^/]+)\//)?.[1];
    const key = repository ?? organization;
    if (key) await this.held.get(key)?.promise;
    if (repository && this.rateLimited.has(repository)) {
      return new Response(null, { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
    }
    return this.answer(url, init);
  };
}
