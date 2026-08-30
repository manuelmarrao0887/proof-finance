/* ════════════════════════════════════════════════════════════════════════
   markdown — renderer mínimo de markdown para HTML, usado nas respostas do
   assistente (via dangerouslySetInnerHTML). O texto do modelo é escapado
   PRIMEIRO com esc(); só depois é que a formatação é aplicada, para nada do
   que o modelo escreva poder injetar markup.

   Extraído de views/AIView.jsx sem alterações de comportamento.
   ════════════════════════════════════════════════════════════════════════ */

export function esc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMD(t) {
  if (!t) return '';
  let s = esc(t);
  // Tables: detect blocks of | ... | lines
  s = s.replace(/((?:^|\n)\|[^\n]+\|(?:\n\|[^\n]+\|)+)/g, function (m) {
    const lines = m.trim().split('\n');
    if (lines.length < 2) return m;
    const header = lines[0]
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c !== '');
    const sep = lines[1].match(/^\|?\s*[-:]+/);
    const bodyStart = sep ? 2 : 1;
    const rows = lines.slice(bodyStart).map((l) =>
      l
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c !== '')
    );
    let out =
      '<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:11px"><thead><tr>';
    header.forEach((h) => {
      out +=
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text2);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:0.04em">' +
        h +
        '</th>';
    });
    out += '</tr></thead><tbody>';
    rows.forEach((r) => {
      out += '<tr>';
      r.forEach((c) => {
        out +=
          '<td style="padding:6px 8px;border-bottom:1px solid var(--bg3);color:var(--text)">' +
          c +
          '</td>';
      });
      out += '</tr>';
    });
    return out + '</tbody></table>';
  });
  // Bold
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  // Inline code
  s = s.replace(
    /`([^`\n]+)`/g,
    '<code style="font-family:var(--mono);background:var(--bg3);padding:1px 5px;border-radius:4px;font-size:11px">$1</code>'
  );
  // Italics (avoid ** already replaced)
  s = s.replace(/(^|[^*])\*([^*\n]+)\*([^*]|$)/g, '$1<i>$2</i>$3');
  // Lists
  s = s.replace(
    /(^|\n)([-*])\s+(.+)/g,
    '$1<div style="padding:2px 0;padding-left:14px;position:relative"><span style="position:absolute;left:0;color:var(--blue)">&bull;</span>$3</div>'
  );
  // Headings (simple)
  s = s.replace(
    /(^|\n)#{1,3}\s+(.+)/g,
    '$1<div style="font-weight:700;margin-top:8px;margin-bottom:4px;font-size:13px">$2</div>'
  );
  // Line breaks (only outside tables, simple approach)
  s = s.replace(/\n\n/g, '<div style="height:6px"></div>');
  s = s.replace(/\n/g, '<br>');
  return s;
}
