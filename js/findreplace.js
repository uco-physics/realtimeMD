/**
 * findreplace.js — Find/Replace for plain textarea editor
 * Overlay-based highlighting, keyboard navigation, replace/replace-all.
 */
export class FindReplace {
    constructor(editor) {
        this.editor = editor;
        this.textarea = editor.textarea;

        // State
        this.isOpen = false;
        this.mode = 'find'; // 'find' | 'replace'
        this.query = '';
        this.replacement = '';
        this.matchCase = false;
        this.wholeWord = false;
        this.useRegex = false;
        this.matches = [];       // Array of { start, end }
        this.currentIdx = -1;

        // Debounce
        this._searchTimer = null;

        // DOM refs (set in _initDOM)
        this.bar = null;
        this.findInput = null;
        this.replaceInput = null;
        this.replaceRow = null;
        this.countEl = null;
        this.overlay = null;

        this._initDOM();
        this._bindEvents();
    }

    // ── DOM Setup ──

    _initDOM() {
        // Find/Replace bar
        this.bar = document.getElementById('find-replace-bar');
        this.findInput = document.getElementById('fr-find');
        this.replaceInput = document.getElementById('fr-replace');
        this.replaceRow = document.getElementById('fr-replace-row');
        this.countEl = document.getElementById('fr-count');

        // Toggle checkboxes
        this.caseCheck = document.getElementById('fr-case');
        this.wordCheck = document.getElementById('fr-word');
        this.regexCheck = document.getElementById('fr-regex');

        // Create highlight overlay inside editor-wrapper
        this.overlay = document.createElement('div');
        this.overlay.className = 'find-highlight-overlay';
        this.overlay.setAttribute('aria-hidden', 'true');
        // Insert overlay before textarea so it renders behind
        this.textarea.parentNode.insertBefore(this.overlay, this.textarea);
    }

    _bindEvents() {
        // Find input
        this.findInput.addEventListener('input', () => {
            this.query = this.findInput.value;
            this._debouncedSearch();
        });

        // Replace input
        this.replaceInput.addEventListener('input', () => {
            this.replacement = this.replaceInput.value;
        });

        // Buttons
        document.getElementById('fr-next')?.addEventListener('click', () => this.next());
        document.getElementById('fr-prev')?.addEventListener('click', () => this.prev());
        document.getElementById('fr-close')?.addEventListener('click', () => this.close());
        document.getElementById('fr-replace-btn')?.addEventListener('click', () => this.replace());
        document.getElementById('fr-replace-all')?.addEventListener('click', () => this.replaceAll());

        // Toggles
        this.caseCheck?.addEventListener('change', () => {
            this.matchCase = this.caseCheck.checked;
            this._search();
        });
        this.wordCheck?.addEventListener('change', () => {
            this.wholeWord = this.wordCheck.checked;
            this._search();
        });
        this.regexCheck?.addEventListener('change', () => {
            this.useRegex = this.regexCheck.checked;
            this._search();
        });

        // Keyboard in find input
        this.findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) this.prev(); else this.next();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            }
        });

        // Keyboard in replace input
        this.replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                this.replace();
            }
        });

        // Sync overlay scroll with textarea
        this.textarea.addEventListener('scroll', () => this._syncOverlayScroll());

        // Re-search on input changes in textarea (matches may shift)
        this.textarea.addEventListener('input', () => {
            if (this.isOpen && this.query) {
                this._debouncedSearch();
            }
        });
    }

    // ── Public API ──

    open(mode = 'find') {
        this.mode = mode;
        this.isOpen = true;
        this.bar.hidden = false;
        this.replaceRow.hidden = (mode !== 'replace');

        // Pre-fill find input with selection
        const sel = this.textarea.value.substring(
            this.textarea.selectionStart,
            this.textarea.selectionEnd
        );
        if (sel && sel.length < 200 && !sel.includes('\n')) {
            this.findInput.value = sel;
            this.query = sel;
        }

        this.findInput.focus();
        this.findInput.select();

        if (this.query) {
            this._search();
        }
    }

    close() {
        this.isOpen = false;
        this.bar.hidden = true;
        this.matches = [];
        this.currentIdx = -1;
        this._clearOverlay();
        this.textarea.focus();
    }

    next() {
        if (this.matches.length === 0) return;
        this.currentIdx = (this.currentIdx + 1) % this.matches.length;
        this._updateHighlight();
        this._scrollToCurrent();
        this._updateCount();
    }

    prev() {
        if (this.matches.length === 0) return;
        this.currentIdx = (this.currentIdx - 1 + this.matches.length) % this.matches.length;
        this._updateHighlight();
        this._scrollToCurrent();
        this._updateCount();
    }

    replace() {
        if (this.matches.length === 0 || this.currentIdx < 0) return;

        const match = this.matches[this.currentIdx];
        const val = this.textarea.value;

        // Push undo snapshot
        this.editor._pushUndoBeforeAction();

        // Replace the current match
        this.textarea.value = val.substring(0, match.start) + this.replacement + val.substring(match.end);
        this.editor._lastSnapshot = this.textarea.value;
        this.editor._onInput();

        // Re-search — currentIdx may need adjustment
        const oldIdx = this.currentIdx;
        this._search();

        // Try to stay at the same position
        if (this.matches.length > 0) {
            this.currentIdx = Math.min(oldIdx, this.matches.length - 1);
            this._updateHighlight();
            this._scrollToCurrent();
            this._updateCount();
        }
    }

    replaceAll() {
        if (this.matches.length === 0) return;

        // Push single undo snapshot for entire operation
        this.editor._pushUndoBeforeAction();

        const val = this.textarea.value;
        let result = '';
        let lastEnd = 0;

        for (const match of this.matches) {
            result += val.substring(lastEnd, match.start) + this.replacement;
            lastEnd = match.end;
        }
        result += val.substring(lastEnd);

        this.textarea.value = result;
        this.editor._lastSnapshot = this.textarea.value;
        this.editor._onInput();

        this._search();
    }

    // ── Search ──

    _debouncedSearch() {
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this._search(), 80);
    }

    _search() {
        this.matches = [];
        this.currentIdx = -1;

        if (!this.query) {
            this._clearOverlay();
            this._updateCount();
            return;
        }

        const text = this.textarea.value;

        try {
            let flags = 'g';
            if (!this.matchCase) flags += 'i';

            let pattern;
            if (this.useRegex) {
                pattern = new RegExp(this.query, flags);
            } else {
                let escaped = this.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (this.wholeWord) {
                    escaped = '\\b' + escaped + '\\b';
                }
                pattern = new RegExp(escaped, flags);
            }

            let m;
            while ((m = pattern.exec(text)) !== null) {
                if (m[0].length === 0) { pattern.lastIndex++; continue; } // avoid infinite loop
                this.matches.push({ start: m.index, end: m.index + m[0].length });
                if (this.matches.length > 10000) break; // safety cap
            }
        } catch (e) {
            // Invalid regex
            this.countEl.textContent = 'Invalid regex';
            this.countEl.classList.add('fr-error');
            this._clearOverlay();
            return;
        }

        this.countEl.classList.remove('fr-error');

        if (this.matches.length > 0) {
            // Find nearest match to cursor position
            const cursor = this.textarea.selectionStart;
            this.currentIdx = 0;
            for (let i = 0; i < this.matches.length; i++) {
                if (this.matches[i].start >= cursor) {
                    this.currentIdx = i;
                    break;
                }
            }

            this._updateHighlight();
            this._scrollToCurrent();
        } else {
            this._clearOverlay();
        }

        this._updateCount();
    }

    _updateCount() {
        if (!this.query) {
            this.countEl.textContent = '';
            return;
        }
        if (this.matches.length === 0) {
            this.countEl.textContent = 'No results';
            return;
        }
        this.countEl.textContent = `${this.currentIdx + 1} of ${this.matches.length}`;
    }

    // ── Overlay Highlighting ──

    _updateHighlight() {
        const text = this.textarea.value;
        let html = '';
        let lastEnd = 0;

        for (let i = 0; i < this.matches.length; i++) {
            const m = this.matches[i];
            // Text before this match (escaped)
            html += this._escapeHtml(text.substring(lastEnd, m.start));
            // The match
            const cls = (i === this.currentIdx) ? 'fr-match fr-current' : 'fr-match';
            html += `<mark class="${cls}">${this._escapeHtml(text.substring(m.start, m.end))}</mark>`;
            lastEnd = m.end;
        }
        // Remaining text
        html += this._escapeHtml(text.substring(lastEnd));
        // Ensure trailing newline so overlay height matches textarea
        if (!html.endsWith('\n')) html += '\n';

        this.overlay.innerHTML = html;
        this._syncOverlayScroll();
    }

    _clearOverlay() {
        this.overlay.innerHTML = '';
    }

    _syncOverlayScroll() {
        this.overlay.scrollTop = this.textarea.scrollTop;
        this.overlay.scrollLeft = this.textarea.scrollLeft;
    }

    _scrollToCurrent() {
        if (this.currentIdx < 0 || this.currentIdx >= this.matches.length) return;

        const match = this.matches[this.currentIdx];

        // Set textarea selection to current match
        this.textarea.setSelectionRange(match.start, match.end);

        // Scroll into view — compute approximate position
        const text = this.textarea.value;
        const textBefore = text.substring(0, match.start);
        const linesBefore = textBefore.split('\n').length - 1;
        const lineHeight = parseFloat(getComputedStyle(this.textarea).lineHeight) || 20;
        const targetScroll = linesBefore * lineHeight - this.textarea.clientHeight / 3;

        this.textarea.scrollTop = Math.max(0, targetScroll);
        this._syncOverlayScroll();
    }

    _escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
