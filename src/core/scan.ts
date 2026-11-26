import { findSkills, type SkillFile } from './find.ts';
import { sortSkills, type Repository, type Skill } from './model.ts';
import { parseSkill } from './parse.ts';

/** A repository to scan: its files, and how to read them. */
export type Source = {
  repository: Repository;
  /** Every file path, relative to the repository root. */
  paths: string[];
  /** What listing the files had to leave out. */
  warnings: string[];
  /** The file's bytes, or undefined if it is not there. */
  read(path: string): Promise<Uint8Array | undefined>;
};

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

/** fetch → find → parse. Nothing is stored: the result is all there is. */
export async function scan(source: Source): Promise<ScanResult> {
  const found = findSkills(source.paths);
  // The skills are read at the same time: on GitHub, each file is a request.
  const results = await Promise.all(found.skills.map((file) => readSkill(source, file)));
  const ignored = found.ignored.length > 0 ? [`not in a skills folder, so not a skill: ${list(found.ignored)}`] : [];
  return {
    repository: source.repository,
    skills: sortSkills(results.flatMap((result) => (result.skill ? [result.skill] : []))),
    warnings: [...source.warnings, ...results.flatMap((result) => result.warnings), ...ignored],
  };
}

/** The original, or the first copy there is when the original is not at the scanned commit. */
async function readSkill(source: Source, file: SkillFile): Promise<{ skill?: Skill; warnings: string[] }> {
  const warnings: string[] = [];
  const [path, ...copies] = [file.path, ...file.copies];
  const bytes = await source.read(path);
  if (!bytes) {
    warnings.push(`${path}: listed, but not found at the scanned commit; skipped`);
    if (copies.length === 0) return { warnings };
    const rest = await readSkill(source, { ...file, path: copies[0], copies: copies.slice(1) });
    return { skill: rest.skill, warnings: [...warnings, ...rest.warnings] };
  }
  const parsed = parseSkill(new TextDecoder().decode(bytes));
  const skill: Skill = {
    id: `${source.repository.id}:${path}`,
    repository: source.repository.id,
    path,
    name: parsed.name ?? file.name,
    description: parsed.description,
    commit: source.repository.commit,
    copies,
  };
  if (parsed.warning) warnings.push(`${path}: ${parsed.warning}`);
  return { skill, warnings };
}

/** The first few paths, then how many more. */
function list(paths: string[], shown = 5): string {
  const more = paths.length - shown;
  return paths.slice(0, shown).join(', ') + (more > 0 ? ` and ${more} more` : '');
}
