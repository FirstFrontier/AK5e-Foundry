function cells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(value => value.trim());
}

function stripMarkup(value) {
  return String(value ?? "")
    .replace(/&emsp;/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\*+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse the first Markdown table following a source heading. */
export function parseSourceTable(text, heading, { level = 5 } = {}) {
  const marker = "#".repeat(level);
  const headingPattern = new RegExp(`^${marker} ${escapeRegExp(heading)}\\s*$`, "m");
  const headingMatch = headingPattern.exec(text);
  if (!headingMatch) throw new Error(`Missing source table: ${heading}`);

  const lines = text.slice(headingMatch.index + headingMatch[0].length).split("\n");
  const tableStart = lines.findIndex(line => line.trim().startsWith("|"));
  const tableLines = [];
  for (let index = tableStart; index >= 0 && index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith("|")) break;
    tableLines.push(lines[index]);
  }
  if (tableLines.length < 3) throw new Error(`Could not parse source table: ${heading}`);

  const headers = cells(tableLines[0]).map(cell => stripMarkup(cell).toLowerCase());
  let category = null;
  const rows = [];
  for (const raw of tableLines.slice(2)) {
    const values = cells(raw);
    if (values.length <= 1) {
      category = stripMarkup(values[0]);
      continue;
    }
    rows.push({
      category,
      raw: raw.trim(),
      cells: Object.fromEntries(headers.map((header, index) => [header, stripMarkup(values[index])]))
    });
  }
  return { heading, headers, rows };
}
