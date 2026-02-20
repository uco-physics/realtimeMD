/**
 * markdown.js — Self-contained Markdown Parser
 * Supports GFM-like features: HTML passthrough, MathJax delimiters, Mermaid blocks.
 * No external dependencies. Converts Markdown string → HTML string.
 *
 * Design decisions:
 * - HTML blocks are extracted before escaping and reinserted after parsing.
 * - Sanitization is NOT done here — it is done in preview.js via DOMPurify.
 * - Math delimiters \( ... \) and \[ ... \] are protected from escaping.
 * - Mermaid fenced code blocks produce <div class="mermaid">...</div> elements.
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

    // === Phase 1: Extract protected blocks before HTML escaping ===

    // Extract fenced code blocks (including mermaid)
    const codeBlocks = [];
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const placeholder = `\x00CODEBLOCK${codeBlocks.length}\x00`;
      codeBlocks.push({ lang, code: code.trimEnd() });
      return placeholder;
    });

    // Extract inline code spans
    const inlineCode = [];
    html = html.replace(/`([^`\n]+)`/g, (match, code) => {
      const placeholder = `\x00INLINECODE${inlineCode.length}\x00`;
      inlineCode.push(code);
      return placeholder;
    });

    // Handle escaped dollar signs: \$ → placeholder, restored later as literal $
    const ESCAPED_DOLLAR = '\x00ESCAPEDDOLLAR\x00';
    html = html.replace(/\\\$/g, ESCAPED_DOLLAR);

    // Extract display math: $$ ... $$ (may span lines)
    const mathBlocks = [];
    html = html.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
      const placeholder = `\x00MATHBLOCK${mathBlocks.length}\x00`;
      mathBlocks.push(math.trim());
      return placeholder;
    });

    // Extract inline math: $...$ (single line, non-greedy, must have closing $ on same line)
    const inlineMath = [];
    html = html.replace(/\$([^$\n]+?)\$/g, (match, math) => {
      const placeholder = `\x00INLINEMATH${inlineMath.length}\x00`;
      inlineMath.push(math);
      return placeholder;
    });

    // Extract raw HTML blocks (block-level HTML: starts with < at line beginning)
    const htmlBlocks = [];
    html = html.replace(/^(<(?:div|section|article|aside|header|footer|nav|main|details|summary|figure|figcaption|p|ul|ol|li|dl|dt|dd|table|thead|tbody|tfoot|tr|th|td|caption|colgroup|col|form|fieldset|legend|select|option|label|input|button|textarea|output|progress|meter|video|audio|source|picture|canvas|map|area|svg|math|del|ins|sub|sup|mark|abbr|time|cite|dfn|ruby|rt|rp|bdi|bdo|wbr|hr|br|img|a|em|strong|small|s|u|b|i|span|blockquote|pre|code)[\s>][\s\S]*?)$/gm, (match, block) => {
      const placeholder = `\x00HTMLBLOCK${htmlBlocks.length}\x00`;
      htmlBlocks.push(block);
      return placeholder;
    });

    // Also extract inline HTML tags like <kbd>, <mark>, <sub>, <sup>, <br>, etc.
    const inlineHtml = [];
    html = html.replace(/<(\/?)(\w+)([^>]*)>/g, (match) => {
      const placeholder = `\x00INLINEHTML${inlineHtml.length}\x00`;
      inlineHtml.push(match);
      return placeholder;
    });

    // === Phase 2: Escape remaining HTML entities (XSS prevention for plain text) ===
    html = this._escapeHtml(html);

    // === Phase 3: Parse block-level Markdown elements ===
    html = this._parseBlockquotes(html);
    html = this._parseTables(html);
    html = this._parseHorizontalRules(html);
    html = this._parseHeadings(html);
    html = this._parseLists(html);
    html = this._parseParagraphs(html);

    // === Phase 4: Parse inline Markdown elements ===
    html = this._parseImages(html);
    html = this._parseLinks(html);
    html = this._parseBoldItalic(html);
    html = this._parseStrikethrough(html);
    html = this._parseLineBreaks(html);

    // === Phase 5: Restore protected blocks ===

    // Restore inline HTML
    for (let i = 0; i < inlineHtml.length; i++) {
      html = html.replace(`\x00INLINEHTML${i}\x00`, inlineHtml[i]);
    }

    // Restore HTML blocks
    for (let i = 0; i < htmlBlocks.length; i++) {
      html = html.replace(`\x00HTMLBLOCK${i}\x00`, htmlBlocks[i]);
    }

    // Restore inline code
    for (let i = 0; i < inlineCode.length; i++) {
      html = html.replace(`\x00INLINECODE${i}\x00`, `<code>${this._escapeHtml(inlineCode[i])}</code>`);
    }

    // Restore code blocks — special handling for mermaid
    for (let i = 0; i < codeBlocks.length; i++) {
      const { lang, code } = codeBlocks[i];
      let replacement;
      if (lang === 'mermaid') {
        // Mermaid blocks: use div with class for rendering
        replacement = `<div class="mermaid">${code}</div>`;
      } else {
        const langAttr = lang ? ` class="language-${lang}"` : '';
        replacement = `<pre><code${langAttr}>${this._escapeHtml(code)}</code></pre>`;
      }
      html = html.replace(`\x00CODEBLOCK${i}\x00`, replacement);
    }

    // Restore display math (output \[ \] for MathJax)
    for (let i = 0; i < mathBlocks.length; i++) {
      html = html.replace(`\x00MATHBLOCK${i}\x00`, `<div class="math-display">\\[${mathBlocks[i]}\\]</div>`);
    }

    // Restore inline math (output \( \) for MathJax)
    for (let i = 0; i < inlineMath.length; i++) {
      html = html.replace(`\x00INLINEMATH${i}\x00`, `<span class="math-inline">\\(${inlineMath[i]}\\)</span>`);
    }

    // Restore escaped dollar signs as literal $
    html = html.replace(new RegExp(ESCAPED_DOLLAR.replace(/\x00/g, '\\x00'), 'g'), '$');

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

      const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
      if (ulMatch) {
        listLines.push({
          indent: ulMatch[1].length,
          type: 'ul',
          content: ulMatch[2]
        });
        continue;
      }

      const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
      if (olMatch) {
        listLines.push({
          indent: olMatch[1].length,
          type: 'ol',
          content: olMatch[2]
        });
        continue;
      }

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
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
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
      // Don't wrap block-level elements or placeholders in <p>
      if (/^<(h[1-6]|ul|ol|li|blockquote|pre|table|thead|tbody|tr|th|td|hr|div|p|section|article|aside|header|footer|nav|main|details|summary|figure|figcaption)[\s>]/i.test(block)) {
        return block;
      }
      // Don't wrap placeholder tokens
      if (/^\x00/.test(block)) {
        return block;
      }
      return `<p>${block}</p>`;
    }).join('\n');
  }

  _parseLineBreaks(html) {
    html = html.replace(/  \n/g, '<br>\n');
    html = html.replace(/\\\n/g, '<br>\n');
    return html;
  }
}
