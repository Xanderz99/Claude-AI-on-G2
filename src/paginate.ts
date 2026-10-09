import { getTextWidth } from '@evenrealities/pretext';

/** Width measurer, injectable so tests don't depend on firmware font metrics. */
export type Measure = (text: string) => number;

/**
 * Strip Markdown that the glasses can't render (they show plain text only).
 * Claude is asked for plain text, but this catches anything that slips through.
 */
export function toPlainText(md: string): string {
  return md
    .replace(/```[a-zA-Z0-9]*\n?/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/^>\s?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Break one paragraph into display lines no wider than maxWidth pixels. */
export function wrapLine(paragraph: string, maxWidth: number, measure: Measure = getTextWidth): string[] {
  if (paragraph === '') return [''];
  const words = paragraph.split(/(\s+)/).filter((w) => w !== '');
  const lines: string[] = [];
  let line = '';

  const pushHardBroken = (word: string) => {
    // A single word wider than the display: split it by characters.
    let chunk = '';
    for (const ch of Array.from(word)) {
      if (measure(chunk + ch) > maxWidth && chunk !== '') {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    return chunk;
  };

  for (const word of words) {
    const isSpace = /^\s+$/.test(word);
    if (line === '' && isSpace) continue;
    const candidate = line + (isSpace ? ' ' : word);
    if (measure(candidate.trimEnd()) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (isSpace) continue; // wrap point; drop the trailing space
    if (line.trim() !== '') lines.push(line.trimEnd());
    line = measure(word) > maxWidth ? pushHardBroken(word) : word;
  }
  if (line.trim() !== '' || lines.length === 0) lines.push(line.trimEnd());
  return lines;
}

/** Split text into pages of at most linesPerPage wrapped lines. */
export function paginate(
  text: string,
  maxWidth: number,
  linesPerPage: number,
  measure: Measure = getTextWidth,
): string[] {
  const lines = text.split('\n').flatMap((p) => wrapLine(p, maxWidth, measure));
  const pages: string[] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    // Don't start a page with a blank line.
    const page = lines.slice(i, i + linesPerPage);
    while (page.length > 1 && page[0] === '') page.shift();
    pages.push(page.join('\n'));
  }
  return pages.length > 0 ? pages : [''];
}
