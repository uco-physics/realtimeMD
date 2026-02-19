/**
 * editor.js — Editor Component (Production)
 * Full-featured textarea editor with line numbers, proper undo/redo,
 * keyboard shortcuts, auto-indent, list continuation, and toolbar actions.
 */
export class Editor {
    constructor(app) {
        this.app = app;
        this.textarea = document.getElementById('editor-textarea');
        this.lineNumbers = document.getElementById('line-numbers');
        this.unsavedDot = document.getElementById('editor-unsaved-dot');
        this.fileNameEl = document.getElementById('editor-file-name');

        // Proper undo/redo with input-based snapshots
        this.undoStack = [];
        this.redoStack = [];
        this._lastSnapshot = '';
        this._snapshotTimer = null;

        this._lastSavedContent = '';
        this._debounceTimer = null;
        this._init();
    }

    _init() {
        this.textarea.addEventListener('input', () => this._onInput());
        this.textarea.addEventListener('scroll', () => this._syncLineNumbers());
        this.textarea.addEventListener('keydown', (e) => this._onKeyDown(e));
        this.textarea.addEventListener('focus', () => this._takeSnapshotIfNeeded());
        this._updateLineNumbers();
    }

    getValue() {
        return this.textarea.value;
    }

    setValue(value, pushUndo = false) {
        if (pushUndo) {
            this._pushSnapshot();
        }
        this.textarea.value = value;
        this._lastSnapshot = value;
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

        // Schedule a snapshot for undo (captures typing in batches)
        this._scheduleSnapshot();

        // Debounced auto-save
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this.app.eventBus.emit('editor:change', this.textarea.value);
        }, 150);

        // Immediate preview update
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

    // --- Undo/Redo System ---
    // Takes a snapshot of the current state if the content changed since the last snapshot
    _takeSnapshotIfNeeded() {
        if (this.textarea.value !== this._lastSnapshot) {
            this._pushSnapshot();
        }
    }

    // Schedule a snapshot after a pause in typing (500ms)
    _scheduleSnapshot() {
        clearTimeout(this._snapshotTimer);
        this._snapshotTimer = setTimeout(() => {
            this._takeSnapshotIfNeeded();
        }, 500);
    }

    // Push current state to undo stack
    _pushSnapshot() {
        const current = this.textarea.value;
        // Don't push duplicate
        if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1].value === current) {
            return;
        }
        // Also don't push if it's the same as _lastSnapshot and there's no real change
        this.undoStack.push({
            value: this._lastSnapshot,
            selectionStart: this.textarea.selectionStart,
            selectionEnd: this.textarea.selectionEnd
        });
        if (this.undoStack.length > 200) this.undoStack.shift();
        this.redoStack = [];
        this._lastSnapshot = current;
    }

    // Force push before an explicit edit action (toolbar, tab, enter)
    _pushUndoBeforeAction() {
        // Always snapshot before an explicit action
        this.undoStack.push({
            value: this.textarea.value,
            selectionStart: this.textarea.selectionStart,
            selectionEnd: this.textarea.selectionEnd
        });
        if (this.undoStack.length > 200) this.undoStack.shift();
        this.redoStack = [];
    }

    undo() {
        // First, flush any pending snapshot
        clearTimeout(this._snapshotTimer);
        this._takeSnapshotIfNeeded();

        if (this.undoStack.length === 0) return;

        // Save current state to redo stack
        this.redoStack.push({
            value: this.textarea.value,
            selectionStart: this.textarea.selectionStart,
            selectionEnd: this.textarea.selectionEnd
        });

        const state = this.undoStack.pop();
        this.textarea.value = state.value;
        this.textarea.selectionStart = state.selectionStart;
        this.textarea.selectionEnd = state.selectionEnd;
        this._lastSnapshot = state.value;
        this._updateLineNumbers();
        this._checkUnsaved();
        this.app.eventBus.emit('editor:input', this.textarea.value);
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
        this._lastSnapshot = state.value;
        this._updateLineNumbers();
        this._checkUnsaved();
        this.app.eventBus.emit('editor:input', this.textarea.value);
    }

    // Insert text at cursor, wrapping selection if wrap provided
    insertAtCursor(before, after = '') {
        this._pushUndoBeforeAction();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const val = this.textarea.value;
        const selected = val.substring(start, end);
        const replacement = before + selected + after;
        const newValue = val.substring(0, start) + replacement + val.substring(end);
        this.textarea.value = newValue;
        this.textarea.selectionStart = start + before.length;
        this.textarea.selectionEnd = start + before.length + selected.length;
        this._lastSnapshot = newValue;
        this.textarea.focus();
        this._onInput();
    }

    // Insert text at current line start
    insertAtLineStart(prefix) {
        this._pushUndoBeforeAction();
        const start = this.textarea.selectionStart;
        const val = this.textarea.value;
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        const newValue = val.substring(0, lineStart) + prefix + val.substring(lineStart);
        this.textarea.value = newValue;
        this.textarea.selectionStart = start + prefix.length;
        this.textarea.selectionEnd = start + prefix.length;
        this._lastSnapshot = newValue;
        this.textarea.focus();
        this._onInput();
    }

    _onKeyDown(e) {
        // Tab key — indent
        if (e.key === 'Tab') {
            e.preventDefault();
            this._pushUndoBeforeAction();
            const start = this.textarea.selectionStart;
            const end = this.textarea.selectionEnd;
            const val = this.textarea.value;

            if (start !== end) {
                // Multi-line indent/outdent
                const lineStart = val.lastIndexOf('\n', start - 1) + 1;
                const lineEnd = val.indexOf('\n', end);
                const endPos = lineEnd === -1 ? val.length : lineEnd;
                const selectedLines = val.substring(lineStart, endPos);

                if (e.shiftKey) {
                    const outdented = selectedLines.replace(/^  /gm, '');
                    const diff = selectedLines.length - outdented.length;
                    this.textarea.value = val.substring(0, lineStart) + outdented + val.substring(endPos);
                    this.textarea.selectionStart = start - (val.substring(lineStart, start).startsWith('  ') ? 2 : 0);
                    this.textarea.selectionEnd = end - diff;
                } else {
                    const indented = selectedLines.replace(/^/gm, '  ');
                    const diff = indented.length - selectedLines.length;
                    this.textarea.value = val.substring(0, lineStart) + indented + val.substring(endPos);
                    this.textarea.selectionStart = start + 2;
                    this.textarea.selectionEnd = end + diff;
                }
            } else {
                if (e.shiftKey) {
                    // Outdent current line
                    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
                    const line = val.substring(lineStart);
                    if (line.startsWith('  ')) {
                        this.textarea.value = val.substring(0, lineStart) + val.substring(lineStart + 2);
                        this.textarea.selectionStart = Math.max(lineStart, start - 2);
                        this.textarea.selectionEnd = Math.max(lineStart, start - 2);
                    }
                } else {
                    // Insert 2 spaces
                    this.textarea.value = val.substring(0, start) + '  ' + val.substring(start);
                    this.textarea.selectionStart = start + 2;
                    this.textarea.selectionEnd = start + 2;
                }
            }
            this._lastSnapshot = this.textarea.value;
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
            return;
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
                    this._pushUndoBeforeAction();
                    this.textarea.value = val.substring(0, lineStart) + '\n' + val.substring(pos);
                    this.textarea.selectionStart = lineStart + 1;
                    this.textarea.selectionEnd = lineStart + 1;
                    this._lastSnapshot = this.textarea.value;
                    this._onInput();
                    return;
                }

                e.preventDefault();
                this._pushUndoBeforeAction();

                let nextMarker = listMatch[2];
                // Increment number for ordered lists
                const numMatch = nextMarker.match(/^(\d+)\.$/);
                if (numMatch) {
                    nextMarker = (parseInt(numMatch[1]) + 1) + '.';
                }

                const insert = '\n' + listMatch[1] + nextMarker + ' ';
                this.textarea.value = val.substring(0, pos) + insert + val.substring(pos);
                const newPos = pos + insert.length;
                this.textarea.selectionStart = newPos;
                this.textarea.selectionEnd = newPos;
                this._lastSnapshot = this.textarea.value;
                this._onInput();
                return;
            }

            // Auto-indent (preserve leading whitespace)
            const indentMatch = currentLine.match(/^(\s+)/);
            if (indentMatch) {
                e.preventDefault();
                this._pushUndoBeforeAction();
                const insert = '\n' + indentMatch[1];
                this.textarea.value = val.substring(0, pos) + insert + val.substring(pos);
                const newPos = pos + insert.length;
                this.textarea.selectionStart = newPos;
                this.textarea.selectionEnd = newPos;
                this._lastSnapshot = this.textarea.value;
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
        clearTimeout(this._snapshotTimer);
    }
}
