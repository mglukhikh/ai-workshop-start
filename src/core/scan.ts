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

export type ScanTarget = Source | { repository: Repository; deadline?: AbortSignal; sources(): AsyncIterable<Source> };

export type ScanResult = { repository: Repository; skills: Skill[]; warnings: string[] };

/** fetch → find → parse. Nothing is stored: the result is all there is. */
export async function scan(source: ScanTarget): Promise<ScanResult> {
  if ('sources' in source) {
    const skills: Skill[] = [];
    const warnings: string[] = [];
    try {
      for await (const repository of source.sources()) {
        const result = await scan(repository);
        source.deadline?.throwIfAborted();
        for (const skill of result.skills) skills.push(skill);
        for (const warning of result.warnings) warnings.push(`${repository.repository.id}: ${warning}`);
      }
    } catch (error) {
      if (!source.deadline?.aborted || error !== source.deadline.reason) throw error;
      warnings.push('Organization scan reached the 3-minute limit. Showing results from completed repositories.');
    }
    return { repository: source.repository, skills: sortSkills(skills), warnings };
  }
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
  const text = new TextDecoder().decode(bytes);
  const parsed = parseSkill(text);
  const skill: Skill = {
    id: `${source.repository.id}:${path}`,
    repository: source.repository.id,
    path,
    name: parsed.name ?? file.name,
    description: parsed.description,
    commit: source.repository.commit,
    copies,
    text,
  };
  if (parsed.warning) warnings.push(`${path}: ${parsed.warning}`);
  return { skill, warnings };
}

/** The first few paths, then how many more. */
function list(paths: string[], shown = 5): string {
  const more = paths.length - shown;
  return paths.slice(0, shown).join(', ') + (more > 0 ? ` and ${more} more` : '');
}
