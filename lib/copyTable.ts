// Put a table on the clipboard in the shapes the places a flyer pastes it actually want.
//
// Everything Debrief produces can be downloaded, and for a while that was the whole answer.
// It isn't: a flyer comparing a launch day wants the numbers in the club's spreadsheet, or
// in an email, or in a cert document — and a spreadsheet's own answer to that is select,
// copy, paste. Making them save a CSV, find it, open it, select it and copy it is a
// round trip through the filesystem for something a table has done since 1985.
//
// Two flavours go on the clipboard at once, because the destination decides which it reads:
//   text/html  — a real table, so Sheets, Excel, Word, Docs and mail clients land it in cells
//   text/plain — tab-separated, which those same apps also accept, and which stays legible
//                pasted into a plain-text field
// Nothing here touches the network; the clipboard is the browser's own.

/** Escape for an HTML table cell — the values are the flyer's file names and figures. */
function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);
}

export function tableTsv(header: string[], rows: string[][]): string {
  // A tab or newline inside a cell would break the grid, and no figure or file name needs
  // one — a space keeps the cell in its column rather than silently splitting it.
  const cell = (s: string) => s.replace(/[\t\r\n]+/g, ' ');
  return [header, ...rows].map((r) => r.map(cell).join('\t')).join('\n');
}

export function tableHtml(header: string[], rows: string[][]): string {
  const th = header.map((h) => `<th>${esc(h)}</th>`).join('');
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * Copy a table, richest form first. Resolves false when the browser won't allow it (an
 * insecure context, a denied permission, or no clipboard API at all) so the caller can say
 * so plainly rather than pretending it worked.
 */
export async function copyTable(header: string[], rows: string[][]): Promise<boolean> {
  const tsv = tableTsv(header, rows);
  try {
    const Item = globalThis.ClipboardItem;
    if (Item && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new Item({
          'text/html': new Blob([tableHtml(header, rows)], { type: 'text/html' }),
          'text/plain': new Blob([tsv], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    // Fall through: a browser that refuses the rich write may still take plain text.
  }
  try {
    await navigator.clipboard.writeText(tsv);
    return true;
  } catch {
    return false;
  }
}
