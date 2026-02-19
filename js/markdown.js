/**
 * markdown.js — Self-contained Markdown Parser
 * No external dependencies. Converts Markdown string → HTML string.
 */
export class MarkdownParser {
  constructor(options = {}) {
    this.resolveImagePath = options.resolveImagePath || (src => src);
  }

  parse(md) {
    if (!md) return '';
    let html = md;

    // Normalize line endings
    html = html.replace(/\r\n/g, '\n');

    // Escape HTML entities first (prevent XSS)
    html = this._escapeHtml(html);

    // Parse block-level elements
    html = this._parseCodeBlocks(html);
    html = this._parseBlockquotes(html);
    html = this._parseTables(html);
    html = this._parseHorizontalRules(html);
    html = this._parseHeadings(html);
    html = this._parseLists(html);
    html = this._parseParagraphs(html);

    // Parse inline elements
    html = this._parseInlineCode(html);
    html = this._parseImages(html);
    html = this._parseLinks(html);
    html = this._parseBoldItalic(html);
    html = this._parseStrikethrough(html);
    html = this._parseLineBreaks(html);

    return html.trim();
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _unescapeForAttr(str) {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
  }

  _parseCodeBlocks(html) {
    // Fenced code blocks: ```lang\n...\n```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const langAttr = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${langAttr}>${code.trimEnd()}</code></pre>`;
    });
    return html;
  }

  _parseInlineCode(html) {
    // Inline code: `code` (but not inside <pre>)
    return html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  }

  _parseBlockquotes(html) {
    const lines = html.split('\n');
    const result = [];
    let inBlockquote = false;
    let bqLines = [];

    const flushBlockquote = () => {
      if (bqLines.length > 0) {
        const content = bqLines.join('\n');
        result.push(`<blockquote><p>${content}</p></blockquote>`);
        bqLines = [];
      }
      inBlockquote = false;
    };

    for (const line of lines) {
      if (/^&gt;\s?(.*)$/.test(line)) {
        inBlockquote = true;
        const match = line.match(/^&gt;\s?(.*)$/);
        bqLines.push(match[1]);
      } else {
        if (inBlockquote) flushBlockquote();
        result.push(line);
      }
    }
    if (inBlockquote) flushBlockquote();

    return result.join('\n');
  }

  _parseHeadings(html) {
    html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
    return html;
  }

  _parseHorizontalRules(html) {
    return html.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr>');
  }

  _parseTables(html) {
    const lines = html.split('\n');
    const result = [];
    let i = 0;

    while (i < lines.length) {
      // Detect table: current line has pipes, next line is separator
      if (
        i + 1 < lines.length &&
        /^\|(.+)\|$/.test(lines[i].trim()) &&
        /^\|[\s\-:|]+\|$/.test(lines[i + 1].trim())
      ) {
        const headerCells = this._parseTableRow(lines[i]);
        const alignments = this._parseTableAlignments(lines[i + 1]);
        let tableHtml = '<table><thead><tr>';
        headerCells.forEach((cell, idx) => {
          const align = alignments[idx] ? ` style="text-align:${alignments[idx]}"` : '';
          tableHtml += `<th${align}>${cell.trim()}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';

        i += 2;
        while (i < lines.length && /^\|(.+)\|$/.test(lines[i].trim())) {
          const cells = this._parseTableRow(lines[i]);
          tableHtml += '<tr>';
          cells.forEach((cell, idx) => {
            const align = alignments[idx] ? ` style="text-align:${alignments[idx]}"` : '';
            tableHtml += `<td${align}>${cell.trim()}</td>`;
          });
          tableHtml += '</tr>';
          i++;
        }
        tableHtml += '</tbody></table>';
        result.push(tableHtml);
      } else {
        result.push(lines[i]);
        i++;
      }
    }

    return result.join('\n');
  }

  _parseTableRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  }

  _parseTableAlignments(line) {
    return this._parseTableRow(line).map(cell => {
      const c = cell.trim();
      if (/^:-+:$/.test(c)) return 'center';
      if (/^-+:$/.test(c)) return 'right';
      if (/^:-+$/.test(c)) return 'left';
      return '';
    });
  }

  _parseLists(html) {
    const lines = html.split('\n');
    const result = [];
    let listStack = []; // [{type, indent}]
    let listLines = [];

    const flushList = () => {
      if (listLines.length === 0) return;

      let listHtml = '';
      let currentStack = [];

      for (const item of listLines) {
        const { indent, type, content, checked } = item;

        while (currentStack.length > 0 && currentStack[currentStack.length - 1].indent >= indent
          && currentStack[currentStack.length - 1].indent !== indent) {
          const popped = currentStack.pop();
          listHtml += popped.type === 'ol' ? '</ol>' : '</ul>';
        }

        if (currentStack.length === 0 || currentStack[currentStack.length - 1].indent < indent) {
          currentStack.push({ indent, type });
          listHtml += type === 'ol' ? '<ol>' : '<ul>';
        } else if (currentStack[currentStack.length - 1].type !== type) {
          const popped = currentStack.pop();
          listHtml += popped.type === 'ol' ? '</ol>' : '</ul>';
          currentStack.push({ indent, type });
          listHtml += type === 'ol' ? '<ol>' : '<ul>';
        }

        if (checked !== undefined) {
          const checkedAttr = checked ? ' checked disabled' : ' disabled';
          listHtml += `<li><input type="checkbox"${checkedAttr}> ${content}</li>`;
        } else {
          listHtml += `<li>${content}</li>`;
        }
      }

      while (currentStack.length > 0) {
        const popped = currentStack.pop();
        listHtml += popped.type === 'ol' ? '</ol>' : '</ul>';
      }

      result.push(listHtml);
      listLines = [];
    };

    for (const line of lines) {
      // Checkbox list: - [x] or - [ ]
      const checkMatch = line.match(/^(\s*)-\s+\[(x| )\]\s+(.*)$/);
      if (checkMatch) {
        listLines.push({
          indent: checkMatch[1].length,
          type: 'ul',
          content: checkMatch[3],
          checked: checkMatch[2] === 'x'
        });
        continue;
      }

      // Unordered list: - or * or +
      const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
      if (ulMatch) {
        listLines.push({
          indent: ulMatch[1].length,
          type: 'ul',
          content: ulMatch[2]
        });
        continue;
      }

      // Ordered list: 1. 2. etc
      const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
      if (olMatch) {
        listLines.push({
          indent: olMatch[1].length,
          type: 'ol',
          content: olMatch[2]
        });
        continue;
      }

      // Not a list line
      flushList();
      result.push(line);
    }

    flushList();
    return result.join('\n');
  }

  _parseImages(html) {
    return html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
      const resolvedSrc = this.resolveImagePath(this._unescapeForAttr(src));
      const safeAlt = alt;
      return `<img src="${resolvedSrc}" alt="${safeAlt}" loading="lazy">`;
    });
  }

  _parseLinks(html) {
    return html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, href) => {
      const safeHref = this._unescapeForAttr(href);
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });
  }

  _parseBoldItalic(html) {
    // Bold + Italic: ***text*** or ___text___
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    // Bold: **text** or __text__
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    // Italic: *text* or _text_
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    return html;
  }

  _parseStrikethrough(html) {
    return html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  }

  _parseParagraphs(html) {
    const lines = html.split('\n\n');
    return lines.map(block => {
      block = block.trim();
      if (!block) return '';
      // Don't wrap block-level elements in <p>
      if (/^<(h[1-6]|ul|ol|li|blockquote|pre|table|thead|tbody|tr|th|td|hr|div|p)[\s>]/i.test(block)) {
        return block;
      }
      return `<p>${block}</p>`;
    }).join('\n');
  }

  _parseLineBreaks(html) {
    // Two trailing spaces or backslash at end of line → <br>
    html = html.replace(/  \n/g, '<br>\n');
    html = html.replace(/\\\n/g, '<br>\n');
    return html;
  }
}
