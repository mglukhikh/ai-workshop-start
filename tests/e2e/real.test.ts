// End to end: the real ./skill-atlas on real GitHub repositories, each at a fixed commit, so the
// answers do not change. They need the network; GITHUB_TOKEN, if set, raises the rate limit.
// `npm run test:e2e`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ATLAS = fileURLToPath(new URL('../../skill-atlas', import.meta.url));

function scan(repository: string, commit: string) {
  const result = spawnSync(ATLAS, ['scan', `github.com/JetBrains/${repository}/tree/${commit}`], { encoding: 'utf8', timeout: 60_000 });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

const blob = (repository: string, commit: string, path: string) => `  https://github.com/JetBrains/${repository}/blob/${commit}/${path}`;

test('JetBrains/koog: skills in .claude/skills; skills in test resources are not project skills', () => {
  const commit = '709079e4a34d6c9234583352550e6a2b88a0bb85';
  const result = scan('koog', commit);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    result.stdout,
    [
      'JetBrains/koog · 2 skills',
      'add-java-code-snippets-in-docs — Use when the user asks to add Java tabs/examples to mkdocs docs that already have Kotlin examples (files under docs/docs/**.md using === "Kotlin" / Knit INCLUDE+SUFFIX blocks).',
      blob('koog', commit, '.claude/skills/add-java-code-snippets-in-docs/SKILL.md'),
      // A multi-line description: its first sentence.
      'split-jvm-nonjvm — Splits a class or several classes in the common source set commonMain into JVM and non-JVM parts into jvmCommonMain and nonJvmCommonMain.',
      blob('koog', commit, '.claude/skills/split-jvm-nonjvm/SKILL.md'),
      '',
    ].join('\n'),
  );
  assert.equal(
    result.stderr,
    'warning: not in a skills folder, so not a skill: integration-tests/src/jvmTest/resources/skills/arithmetic-evaluator/SKILL.md, integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md\n',
  );
});

/** The skill directories in .agents/skills of JetBrains/MPS at MPS_COMMIT, each copied to .claude/skills. */
const MPS_COMMIT = '1cbf7f783dbc5c74c8e5231d31f61b02829143de';
const MPS_SKILLS = `actions bugfix-workflow code-style commits debugging mps-aspect-accessories mps-aspect-actions
  mps-aspect-behavior mps-aspect-constraints mps-aspect-dataflow mps-aspect-editor-menus-and-keymaps mps-aspect-editor
  mps-aspect-generation-plan mps-aspect-generator mps-aspect-intentions mps-aspect-migrations
  mps-aspect-structure-concepts mps-aspect-textgen mps-aspect-typesystem mps-baselanguage mps-build-language
  mps-collections-and-closures mps-console mps-distribution-build mps-dsl-memory mps-ide-plugin mps-lang-core-xml
  mps-language-analysis mps-language-aspects-overview mps-language-inheritance mps-language-modularity mps-mcp-workflow
  mps-model-manipulation mps-node-editing mps-project-management mps-quotations mps-run-configurations mps-tests
  registry skill-optimization-study ssr study-run-cleanup teamcity-cli`.split(/\s+/);

test('JetBrains/MPS: every skill once, from .agents/skills, with its copy in .claude/skills', () => {
  const result = scan('MPS', MPS_COMMIT);
  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines[0], `JetBrains/MPS · ${MPS_SKILLS.length} skills`);
  const skills = [];
  for (let i = 1; i < lines.length; i += 3) skills.push({ title: lines[i], link: lines[i + 1], copies: lines[i + 2] });
  assert.equal(skills.length, MPS_SKILLS.length);
  assert.deepEqual(
    skills.map((skill) => [skill.link, skill.copies]).sort(),
    MPS_SKILLS.map((dir) => [blob('MPS', MPS_COMMIT, `.agents/skills/${dir}/SKILL.md`), `  also in .claude/skills/${dir}/SKILL.md`]).sort(),
  );
  // Sorted by name, each with a description.
  const names = skills.map((skill) => skill.title.split(' — ')[0]);
  assert.deepEqual(names, [...names].sort());
  for (const skill of skills) assert.match(skill.title, /^\S+ — \S/);
  assert.equal(
    result.stderr,
    'warning: the tree is too large to list at once; looked only in .agents/skills, .claude/skills, .github/skills, agent/skills\n',
  );
});

test('JetBrains/android: no project skills; a skill.md is not a SKILL.md', () => {
  const result = scan('android', '294d4c098cb833f7a457cd891a125de82d4e1715');
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, 'JetBrains/android · 0 skills\n');
  assert.equal(
    result.stderr,
    'warning: the tree is too large to list at once; looked only in .agents/skills, .claude/skills, .github/skills, agent/skills\n',
  );
});
