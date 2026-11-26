/** A Markdown heading: `#` is level 1, `##` level 2, `###` level 3. */
export type Heading = { level: 1 | 2 | 3; title: string; /** 1-based, in the whole file. */ line: number };

/**
 * The `#`, `##` and `###` headings of a SKILL.md, in order. Not in the front matter, not in
 * fenced code: a `# comment` in a shell block is not a title.
 */
export function outline(text: string): Heading[] {
  const lines = text.split(/\r?\n/);
  const headings: Heading[] = [];
  let start = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    if (end > 0) start = end + 1;
  }
  let fence: string | undefined;
  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      // Closed by the same character, at least as many times, and nothing else on the line.
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = undefined;
      continue;
    }
    if (marker) {
      fence = marker;
      continue;
    }
    const heading = /^ {0,3}(#{1,3})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(line);
    const title = heading?.[2]?.replace(/^#+$/, '').trim();
    if (heading && title) headings.push({ level: heading[1].length as Heading['level'], title, line: index + 1 });
  }
  return headings;
}
