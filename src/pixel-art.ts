/**
 * Pixel art renderer for terminal.
 *
 * Uses Unicode half-block characters (▀▄█) to pack 2 vertical pixels
 * per terminal character cell, with foreground/background colors.
 *
 * Pixel format: each character in the grid maps to a color.
 *   .  = transparent (background)
 *   #  = white
 *   R  = red
 *   G  = green
 *   B  = blue
 *   Y  = yellow
 *   C  = cyan
 *   M  = magenta
 *   W  = white
 *   K  = black
 *   O  = orange (256-color)
 *   P  = purple (256-color)
 *   0-9 = grayscale (0=black, 9=white)
 */

const RESET = '\x1b[0m';

// Foreground colors (for ▀ upper half — top pixel)
const FG: Record<string, string> = {
  '.': '',
  '#': '\x1b[97m',
  'R': '\x1b[91m',
  'G': '\x1b[92m',
  'B': '\x1b[94m',
  'Y': '\x1b[93m',
  'C': '\x1b[96m',
  'M': '\x1b[95m',
  'W': '\x1b[97m',
  'K': '\x1b[30m',
  'O': '\x1b[38;5;208m',
  'P': '\x1b[38;5;129m',
  '0': '\x1b[38;5;232m',
  '1': '\x1b[38;5;235m',
  '2': '\x1b[38;5;238m',
  '3': '\x1b[38;5;241m',
  '4': '\x1b[38;5;244m',
  '5': '\x1b[38;5;247m',
  '6': '\x1b[38;5;250m',
  '7': '\x1b[38;5;253m',
  '8': '\x1b[38;5;255m',
  '9': '\x1b[97m',
};

// Background colors (for ▀ lower half — bottom pixel)
const BG: Record<string, string> = {
  '.': '',
  '#': '\x1b[107m',
  'R': '\x1b[101m',
  'G': '\x1b[102m',
  'B': '\x1b[104m',
  'Y': '\x1b[103m',
  'C': '\x1b[106m',
  'M': '\x1b[105m',
  'W': '\x1b[107m',
  'K': '\x1b[40m',
  'O': '\x1b[48;5;208m',
  'P': '\x1b[48;5;129m',
  '0': '\x1b[48;5;232m',
  '1': '\x1b[48;5;235m',
  '2': '\x1b[48;5;238m',
  '3': '\x1b[48;5;241m',
  '4': '\x1b[48;5;244m',
  '5': '\x1b[48;5;247m',
  '6': '\x1b[48;5;250m',
  '7': '\x1b[48;5;253m',
  '8': '\x1b[48;5;255m',
  '9': '\x1b[107m',
};

/**
 * Render a pixel art grid to terminal lines using half-block characters.
 * Input: array of strings where each char is a color code.
 * Output: array of terminal-ready strings (each covers 2 pixel rows).
 */
export function renderPixelArt(grid: string[], noColor: boolean = false): string[] {
  if (grid.length === 0) return [];

  // Pad rows to same length
  const maxWidth = Math.max(...grid.map(r => r.length));
  const rows = grid.map(r => r.padEnd(maxWidth, '.'));

  // Pad to even number of rows
  if (rows.length % 2 !== 0) {
    rows.push('.'.repeat(maxWidth));
  }

  const lines: string[] = [];

  for (let y = 0; y < rows.length; y += 2) {
    const topRow = rows[y];
    const bottomRow = rows[y + 1];
    let line = '  '; // indent

    if (noColor) {
      // No-color fallback: use characters directly
      for (let x = 0; x < maxWidth; x++) {
        const top = topRow[x] || '.';
        const bot = bottomRow[x] || '.';
        if (top === '.' && bot === '.') line += ' ';
        else if (top !== '.' && bot !== '.') line += '█';
        else if (top !== '.') line += '▀';
        else line += '▄';
      }
    } else {
      for (let x = 0; x < maxWidth; x++) {
        const top = (topRow[x] || '.').toUpperCase();
        const bot = (bottomRow[x] || '.').toUpperCase();

        if (top === '.' && bot === '.') {
          line += ' ';
        } else if (top === bot) {
          // Same color top and bottom — full block with fg color
          line += `${FG[top] || FG['#']}█${RESET}`;
        } else if (bot === '.') {
          // Only top pixel — upper half block with fg
          line += `${FG[top] || FG['#']}▀${RESET}`;
        } else if (top === '.') {
          // Only bottom pixel — lower half block with fg
          line += `${FG[bot] || FG['#']}▄${RESET}`;
        } else {
          // Two different colors — upper half with fg=top, bg=bottom
          line += `${FG[top] || FG['#']}${BG[bot] || BG['#']}▀${RESET}`;
        }
      }
    }

    lines.push(line);
  }

  return lines;
}

/**
 * Parse a pixel art code block content into a grid.
 * Strips empty leading/trailing lines.
 */
export function parsePixelGrid(content: string): string[] {
  const lines = content.split('\n');
  // Trim empty lines from start and end
  let start = 0;
  while (start < lines.length && lines[start].trim() === '') start++;
  let end = lines.length - 1;
  while (end >= start && lines[end].trim() === '') end--;
  return lines.slice(start, end + 1);
}
