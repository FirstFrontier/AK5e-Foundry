import { createHash } from "node:crypto";

export function parseTable(text, headingIndex, expected, formula) {
  const headerAt = text.indexOf("|", headingIndex);
  if (headerAt < 0) throw new Error(`Missing table after source heading at ${lineNumber(text, headingIndex)}.`);
  const lines = text.slice(headerAt).split("\n");
  if (!/^\|[^\n]+\|$/.test(lines[0]) || !/^\|\s*:?-{3,}/.test(lines[1] ?? "")) {
    throw new Error(`Malformed table after source heading at ${lineNumber(text, headingIndex)}.`);
  }
  const rows = [];
  for (const line of lines.slice(2)) {
    if (!line.startsWith("|")) break;
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
    if (cells.length !== 2) throw new Error(`Unexpected row in ${formula} table: ${line}`);
    const roll = Number(cells[0]);
    if (!Number.isInteger(roll)) throw new Error(`Unexpected roll value in table: ${cells[0]}`);
    rows.push({ roll, text: cells[1] });
  }
  const end = headerAt + lines.slice(0, rows.length + 2).join("\n").length;
  if (rows.length !== expected.length || rows.some((row, i) => row.text !== expected[i])) {
    throw new Error(`Unexpected rows in ${formula} table at source line ${lineNumber(text, headingIndex)}. Expected ${expected.length}, found ${rows.length}.`);
  }
  const start = formula === "2d10" ? 2 : 1;
  if (rows.some((row, i) => row.roll !== start + i)) throw new Error(`Unexpected/non-contiguous roll ranges in ${formula} table.`);
  return { rows, end };
}

function lineNumber(text, offset) { return text.slice(0, offset).split("\n").length; }

export function deterministicResultId(tableId, roll) {
  return createHash("sha256").update(`${tableId}\0${roll}`).digest("hex").slice(0, 16);
}
