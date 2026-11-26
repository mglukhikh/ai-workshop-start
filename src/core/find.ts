/** A skill found in a repository: its SKILL.md, named after its directory, and its copies. */
export type SkillFile = { path: string; name: string; copies: string[] };

/** The project skills, and the other files named SKILL.md, which are not skills. */
export type Found = { skills: SkillFile[]; ignored: string[] };

/** Where agents keep a project's own skills; the first one holds the original of a copied skill. */
export const SKILL_ROOTS = ['.agents/skills', '.claude/skills', '.github/skills', 'agent/skills'];

/**
 * A project skill is `<project>/<skills folder>/<skill>/SKILL.md`, where `<project>` is the
 * repository root or any directory in it. The same `<project>/<skill>` in several skills folders
 * is one skill: the original in the first folder of SKILL_ROOTS, the others its copies.
 */
export function findSkills(paths: string[]): Found {
  const groups = new Map<string, { name: string; files: { path: string; rank: number }[] }>();
  const ignored: string[] = [];
  for (const path of paths) {
    if (path.split('/').at(-1) !== 'SKILL.md') continue;
    const location = locate(path);
    if (!location) {
      ignored.push(path);
      continue;
    }
    const key = `${location.project}\0${location.name}`;
    const group = groups.get(key) ?? { name: location.name, files: [] };
    group.files.push({ path, rank: location.rank });
    groups.set(key, group);
  }
  const skills = [...groups.values()].map(({ name, files }) => {
    const [original, ...copies] = files
      .sort((a, b) => a.rank - b.rank || compare(a.path, b.path))
      .map((file) => file.path);
    return { path: original, name, copies };
  });
  return { skills: skills.sort((a, b) => compare(a.path, b.path)), ignored: ignored.sort(compare) };
}

/** The project, the skill's directory name and the skills folder's rank; undefined if not a skill. */
function locate(path: string): { project: string; name: string; rank: number } | undefined {
  const segments = path.split('/');
  const name = segments.at(-2);
  const folder = segments.slice(0, -2).join('/');
  if (!name) return undefined;
  for (const [rank, root] of SKILL_ROOTS.entries()) {
    if (folder === root) return { project: '', name, rank };
    if (folder.endsWith(`/${root}`)) return { project: folder.slice(0, -root.length - 1), name, rank };
  }
  return undefined;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
