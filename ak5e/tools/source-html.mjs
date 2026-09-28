/** Convert the retained Homebrewery-flavoured source into conservative Foundry-safe HTML. */
export function sourceToHtml(raw) {
  const cleaned = String(raw ?? "")
    .replace(/^\s*\{\{image[^\n]*[\s\S]*?^\s*}}\s*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)\s*\{[^}]*}/g, "")
    .replace(/<img[\s\S]*?\/>/g, "")
    .replace(/\{\{bonus\s+([^}]+)}}/g, "$1");

  const html = [];
  const wrappers = [];
  let paragraph = [];
  let tableLines = [];
  const flush = () => {
    if (!paragraph.length) return;
    html.push(`<p class="ak5e-source-paragraph">${inline(paragraph.join("<br>"))}</p>`);
    paragraph = [];
  };
  const flushTable = () => {
    if (!tableLines.length) return;
    html.push(renderTable(tableLines));
    tableLines = [];
  };

  for (const originalLine of cleaned.split("\n")) {
    const line = originalLine.trim();
    if (line.startsWith("|")) {
      flush();
      tableLines.push(line);
      continue;
    }
    flushTable();
    if (!line || line === ":") {
      flush();
      continue;
    }
    if (/^\\(?:page|column)\b/.test(line) || /^:{2,}$/.test(line)) {
      flush();
      continue;
    }
    const attribution = line.match(/^\{\{attribution\s+(.+)}}$/);
    if (attribution) {
      flush();
      html.push(`<cite>${inline(attribution[1])}</cite>`);
      continue;
    }
    if (/^\{\{(?:pageNumber|frontCover)\b[^}]*}}$/.test(line)) {
      flush();
      continue;
    }
    if (/^\{\{note(?:,|\s|$)/.test(line)) {
      flush();
      wrappers.push("aside");
      html.push('<aside class="ak5e-note">');
      continue;
    }
    if (/^\{\{quote(?:,|\s|$)/.test(line)) {
      flush();
      wrappers.push("blockquote");
      html.push("<blockquote>");
      const remainder = line.replace(/^\{\{quote\s*/, "");
      if (remainder) paragraph.push(remainder);
      continue;
    }
    if (/^\{\{/.test(line)) {
      flush();
      if (!/}}$/.test(line)) wrappers.push("layout");
      continue;
    }
    if (line === "}}") {
      flush();
      const wrapper = wrappers.pop();
      if (wrapper === "aside") html.push("</aside>");
      if (wrapper === "blockquote") html.push("</blockquote>");
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length, 6);
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^[-*] /.test(line)) {
      flush();
      html.push(`<p class="ak5e-source-paragraph">• ${inline(line.slice(2))}</p>`);
      continue;
    }
    paragraph.push(line);
  }
  flushTable();
  flush();
  while (wrappers.length) {
    const wrapper = wrappers.pop();
    if (wrapper === "aside") html.push("</aside>");
    if (wrapper === "blockquote") html.push("</blockquote>");
  }
  return html.join("\n");
}

function tableCells(line) {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
}

function renderTable(lines) {
  const headers = tableCells(lines[0]);
  const separators = lines.length > 1 ? tableCells(lines[1]) : [];
  if (headers.length < 2 || separators.length !== headers.length ||
      !separators.every(cell => /^:?-{2,}:?$/.test(cell))) {
    return `<pre>${lines.map(escapeHtml).join("\n")}</pre>`;
  }

  const alignments = separators.map(cell => cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : "left");
  const renderCell = (tag, value, index, attributes = "") =>
    `<${tag}${attributes} class="ak5e-source-table__${alignments[index]}">${inline(escapeTableCell(value))}</${tag}>`;
  const bodies = [];
  let rows = [];
  for (const line of lines.slice(2)) {
    const cells = tableCells(line);
    if (cells.length === 1) {
      if (rows.length) bodies.push(rows);
      rows = [`<tr><th scope="rowgroup" colspan="${headers.length}">${inline(escapeTableCell(cells[0]))}</th></tr>`];
      continue;
    }
    // Chapter 3 Advanced Specialist Skills / Cluster Bombs has a redundant empty cell before Duration.
    if (cells.length === headers.length + 1 && cells[headers.length - 1] === "") {
      cells.splice(headers.length - 1, 1);
    }
    rows.push(`<tr>${cells.map((cell, index) => renderCell("td", cell, Math.min(index, headers.length - 1))).join("")}</tr>`);
  }
  if (rows.length) bodies.push(rows);
  return `<div class="ak5e-source-table-wrap"><table class="ak5e-source-table"><thead><tr>${headers.map((cell, index) => renderCell("th", cell, index, ' scope="col"')).join("")}</tr></thead>${bodies.map(rows => `<tbody>${rows.join("")}</tbody>`).join("")}</table></div>`;
}

function escapeTableCell(value) {
  return String(value)
    .replace(/&(?!(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(value) {
  return String(value)
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
