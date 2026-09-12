/** Convert the retained Homebrewery-flavoured source into conservative Foundry-safe HTML. */
export function sourceToHtml(raw) {
  const cleaned = String(raw ?? "")
    .replace(/^\s*\{\{image[^\n]*[\s\S]*?^\s*}}\s*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)\s*\{[^}]*}/g, "")
    .replace(/<img[\s\S]*?\/>/g, "")
    .replace(/\{\{bonus\s+([^}]+)}}/g, "$1")
    .replace(/\n:\n/g, "\n");

  const html = [];
  const wrappers = [];
  let paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inline(paragraph.join("<br>"))}</p>`);
    paragraph = [];
  };

  for (const originalLine of cleaned.split("\n")) {
    const line = originalLine.trim();
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
    if (line.startsWith("|")) {
      flush();
      html.push(`<pre>${escapeHtml(line)}</pre>`);
      continue;
    }
    if (/^[-*] /.test(line)) {
      flush();
      html.push(`<p>• ${inline(line.slice(2))}</p>`);
      continue;
    }
    paragraph.push(line);
  }
  flush();
  while (wrappers.length) {
    const wrapper = wrappers.pop();
    if (wrapper === "aside") html.push("</aside>");
    if (wrapper === "blockquote") html.push("</blockquote>");
  }
  return html.join("\n");
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
