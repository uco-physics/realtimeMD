/**
 * editor.js — Editor Component
 * Full-featured textarea editor with line numbers, shortcuts, and toolbar actions.
 */
export class Editor {
    constructor(app) {
        this.app = app;
        this.textarea = document.getElementById('editor-textarea');
        this.lineNumbers = document.getElementById('line-numbers');
        this.unsavedDot = document.getElementById('editor-unsaved-dot');
        this.fileNameEl = document.getElementById('editor-file-name');
        this.undoStack = [];
        this.redoStack = [];
        this._lastSavedContent = '';
        this._debounceTimer = null;
        this._init();
    }

    _init() {
        this.textarea.addEventListener('input', () => this._onInput());
        this.textarea.addEventListener('scroll', () => this._syncLineNumbers());
        this.textarea.addEventListener('keydown', (e) => this._onKeyDown(e));
        this._updateLineNumbers();
    }

    getValue() {
        return this.textarea.value;
    }

    setValue(value, pushUndo = false) {
        if (pushUndo) {
            this._pushUndo();
        }
        this.textarea.value = value;
        this._onInput();
    }

    setFileName(name) {
        this.fileNameEl.textContent = name || 'untitled.md';
    }

    markSaved() {
        this._lastSavedContent = this.textarea.value;
        this.unsavedDot.classList.remove('visible');
    }

    _onInput() {
        this._updateLineNumbers();
        this._checkUnsaved();

        // Debounced auto-save & preview update
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this.app.eventBus.emit('editor:change', this.textarea.value);
        }, 80);

        // Immediate preview update for responsiveness
        this.app.eventBus.emit('editor:input', this.textarea.value);
    }

    _checkUnsaved() {
        const dirty = this.textarea.value !== this._lastSavedContent;
        this.unsavedDot.classList.toggle('visible', dirty);
    }

    _updateLineNumbers() {
        const lines = this.textarea.value.split('\n');
        const count = lines.length;
        let html = '';
        for (let i = 1; i <= count; i++) {
            html += `<span class="line-num">${i}</span>`;
        }
        this.lineNumbers.innerHTML = html;
    }

    _syncLineNumbers() {
        this.lineNumbers.scrollTop = this.textarea.scrollTop;
    }

    _pushUndo() {
        this.undoStack.push({
            value: this.textarea.value,
            selectionStart: this.textarea.selectionStart,
            selectionEnd: this.textarea.selectionEnd
        });
        if (this.undoStack.length > 100) this.undoStack.shift();
        this.redoStack = [];
    }

    undo() {
        if (this.undoStack.length === 0) return;
        this.redoStack.push({
            value: this.textarea.value,
            selectionStart: this.textarea.selectionStart,
            selectionEnd: this.textarea.selectionEnd
        });
        const state = this.undoStack.pop();
        this.textarea.value = state.value;
        this.textarea.selectionStart = state.selectionStart;
        this.textarea.selectionEnd = state.selectionEnd;
        this._onInput();
    }

    redo() {
        if (this.redoStack.length === 0) return;
        this.undoStack.push({
            value: this.textarea.value,
            selectionStart: this.textarea.selectionStart,
            selectionEnd: this.textarea.selectionEnd
        });
        const state = this.redoStack.pop();
        this.textarea.value = state.value;
        this.textarea.selectionStart = state.selectionStart;
        this.textarea.selectionEnd = state.selectionEnd;
        this._onInput();
    }

    // Insert text at cursor, wrapping selection if wrap provided
    insertAtCursor(before, after = '') {
        this._pushUndo();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const selected = this.textarea.value.substring(start, end);
        const replacement = before + selected + after;
        this.textarea.setRangeText(replacement, start, end, 'select');
        this.textarea.focus();
        this.textarea.selectionStart = start + before.length;
        this.textarea.selectionEnd = start + before.length + selected.length;
        this._onInput();
    }

    // Insert text at current line start
    insertAtLineStart(prefix) {
        this._pushUndo();
        const start = this.textarea.selectionStart;
        const val = this.textarea.value;
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        this.textarea.setRangeText(prefix, lineStart, lineStart, 'end');
        this.textarea.focus();
        this._onInput();
    }

    _onKeyDown(e) {
        // Tab key — indent
        if (e.key === 'Tab') {
            e.preventDefault();
            this._pushUndo();
            const start = this.textarea.selectionStart;
            const end = this.textarea.selectionEnd;

            if (e.shiftKey) {
                // Outdent
                const val = this.textarea.value;
                const lineStart = val.lastIndexOf('\n', start - 1) + 1;
                const line = val.substring(lineStart);
                if (line.startsWith('  ')) {
                    this.textarea.setRangeText('', lineStart, lineStart + 2, 'end');
                }
            } else {
                // Indent
                this.textarea.setRangeText('  ', start, start, 'end');
            }
            this._onInput();
            return;
        }

        // Ctrl/Cmd + shortcuts
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'b':
                    e.preventDefault();
                    this.insertAtCursor('**', '**');
                    break;
                case 'i':
                    e.preventDefault();
                    this.insertAtCursor('*', '*');
                    break;
                case 'k':
                    e.preventDefault();
                    this.insertAtCursor('[', '](url)');
                    break;
                case 's':
                    e.preventDefault();
                    this.app.eventBus.emit('editor:save');
                    break;
                case 'z':
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                    break;
                case 'y':
                    e.preventDefault();
                    this.redo();
                    break;
            }
        }

        // Enter key — auto-indent and continue list
        if (e.key === 'Enter') {
            const val = this.textarea.value;
            const pos = this.textarea.selectionStart;
            const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
            const currentLine = val.substring(lineStart, pos);

            // Continue list markers
            const listMatch = currentLine.match(/^(\s*)([-*+]|\d+\.)\s+/);
            if (listMatch) {
                // If current line content after marker is empty, remove marker
                const afterMarker = currentLine.substring(listMatch[0].length).trim();
                if (afterMarker === '') {
                    e.preventDefault();
                    this._pushUndo();
                    this.textarea.setRangeText('\n', lineStart, pos, 'end');
                    this._onInput();
                    return;
                }

                e.preventDefault();
                this._pushUndo();

                let nextMarker = listMatch[2];
                // Increment number for ordered lists
                const numMatch = nextMarker.match(/^(\d+)\.$/);
                if (numMatch) {
                    nextMarker = (parseInt(numMatch[1]) + 1) + '.';
                }

                const insert = '\n' + listMatch[1] + nextMarker + ' ';
                this.textarea.setRangeText(insert, pos, pos, 'end');
                this._onInput();
                return;
            }

            // Auto-indent
            const indentMatch = currentLine.match(/^(\s+)/);
            if (indentMatch) {
                e.preventDefault();
                this._pushUndo();
                this.textarea.setRangeText('\n' + indentMatch[1], pos, pos, 'end');
                this._onInput();
            }
        }
    }

    getCursorInfo() {
        const val = this.textarea.value;
        const pos = this.textarea.selectionStart;
        const before = val.substring(0, pos);
        const line = (before.match(/\n/g) || []).length + 1;
        const col = pos - before.lastIndexOf('\n');
        return { line, col, pos };
    }

    getWordCount() {
        const text = this.textarea.value.trim();
        if (!text) return { words: 0, chars: 0, lines: 0 };
        return {
            words: text.split(/\s+/).length,
            chars: text.length,
            lines: text.split('\n').length
        };
    }

    focus() {
        this.textarea.focus();
    }

    destroy() {
        clearTimeout(this._debounceTimer);
    }
}
