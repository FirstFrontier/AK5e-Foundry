/** Return source ranges occupied by Homebrewery monster blocks. */
export function monsterBlockRanges(text) {
  return [...text.matchAll(/^\{\{monster[^\n]*\n[\s\S]*?^}}\s*$/gm)]
    .map(match => ({ start: match.index, end: match.index + match[0].length }));
}

/** Find Markdown headings while ignoring headings embedded in monster blocks. */
export function sourceHeadings(text, level) {
  const ranges = monsterBlockRanges(text);
  const marker = "#".repeat(level);
  return [...text.matchAll(new RegExp(`^${marker} (.+)$`, "gm"))]
    .filter(match => !ranges.some(range => match.index >= range.start && match.index < range.end))
    .map(match => ({ index: match.index, name: match[1].trim(), match }));
}

/** Split a source string at headings, stopping at the next same or higher heading. */
export function splitSourceSections(text, level) {
  const headings = sourceHeadings(text, level);
  const higherHeadings = Array.from({ length: Math.max(0, level - 1) }, (_, index) => sourceHeadings(text, index + 1))
    .flat()
    .sort((left, right) => left.index - right.index);
  return headings.map((heading, index) => {
    const nextSame = headings[index + 1]?.index ?? text.length;
    const nextHigher = higherHeadings.find(candidate => candidate.index > heading.index)?.index ?? text.length;
    return {
      index: heading.index,
      name: heading.name,
      raw: text.slice(heading.index, Math.min(nextSame, nextHigher)).trim()
    };
  });
}
