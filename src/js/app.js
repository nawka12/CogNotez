// Main application entry point for CogNotez
const { ipcRenderer } = require('electron');

// Import marked library for markdown rendering
const { marked } = require('marked');

// Configure marked options for better rendering
marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
});

// Enhanced markdown renderer using marked library
function renderMarkdown(text) {
    if (!text) return '';

    // Use marked library for comprehensive markdown rendering
    return marked.parse(text);
}

// Find and Replace Dialog
class FindReplaceDialog {
    constructor(app) {
        this.app = app;
        this.isVisible = false;
        this.findText = '';
        this.replaceText = '';
        this.currentMatchIndex = -1;
        this.matches = [];
        this.caseSensitive = false;
        this.wholeWord = false;
        this.regex = false;
        this.element = null;
    }

    createDialog() {
        const dialog = document.createElement('div');
        dialog.id = 'find-replace-dialog';
        dialog.className = 'find-replace-dialog';
        const findReplaceTitle = window.i18n ? window.i18n.t('findReplace.findReplace') : 'Find & Replace';
        const findLabel = window.i18n ? window.i18n.t('findReplace.find') : 'Find:';
        const replaceLabel = window.i18n ? window.i18n.t('findReplace.replace') : 'Replace:';
        const searchTextPlaceholder = window.i18n ? window.i18n.t('findReplace.searchText') : 'Search text...';
        const replaceWithPlaceholder = window.i18n ? window.i18n.t('findReplace.replaceWith') : 'Replace with...';
        const noMatches = window.i18n ? window.i18n.t('notes.noMatches') : 'No matches';
        
        dialog.innerHTML = `
            <div class="find-replace-header">
                <h3>${findReplaceTitle}</h3>
                <button id="find-replace-close" class="find-replace-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="find-replace-body">
                <div class="find-disclaimer">
                    <i class="fas fa-info-circle"></i>
                    <span>Find only works in edit mode. Preview mode support coming soon.</span>
                </div>
                <div class="find-section">
                    <label for="find-input">${findLabel}</label>
                    <input type="text" id="find-input" class="find-input" placeholder="${searchTextPlaceholder}">
                </div>
                <div class="replace-section">
                    <label for="replace-input">${replaceLabel}</label>
                    <input type="text" id="replace-input" class="replace-input" placeholder="${replaceWithPlaceholder}">
                </div>
                <div class="options-section">
                    <label><input type="checkbox" id="case-sensitive"> Case sensitive</label>
                    <label><input type="checkbox" id="whole-word"> Whole word</label>
                    <label><input type="checkbox" id="use-regex"> Regular expression</label>
                </div>
                <div class="results-section">
                    <span id="match-count">${noMatches}</span>
                </div>
                <div class="buttons-section">
                    <button id="find-prev" class="btn-secondary">Previous</button>
                    <button id="find-next" class="btn-secondary">Next</button>
                    <button id="replace-next" class="btn-primary">Replace</button>
                    <button id="replace-all" class="btn-primary">Replace All</button>
                </div>
            </div>
        `;

        // Style the dialog (positioning handled by CSS)
        Object.assign(dialog.style, {
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            zIndex: '1000',
            fontSize: '14px',
            display: 'none'
        });

        document.body.appendChild(dialog);
        this.element = dialog;
        this.setupEventListeners();
    }

    setupEventListeners() {
        if (!this.element) return;

        // Close button
        this.element.querySelector('#find-replace-close').addEventListener('click', () => {
            this.hide();
        });

        // Make dialog draggable
        this.setupDragAndDrop();

        // Find input
        const findInput = this.element.querySelector('#find-input');
        findInput.addEventListener('input', (e) => {
            this.findText = e.target.value;
            this.findMatches();
        });

        findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.findNext();
                // Focus will be handled by findNext() -> selectCurrentMatch(true)
            } else if (e.key === 'Escape') {
                this.hide();
            }
        });

        // Replace input
        const replaceInput = this.element.querySelector('#replace-input');
        replaceInput.addEventListener('input', (e) => {
            this.replaceText = e.target.value;
        });

        replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hide();
            }
        });

        // Options
        this.element.querySelector('#case-sensitive').addEventListener('change', (e) => {
            this.caseSensitive = e.target.checked;
            this.findMatches();
        });

        this.element.querySelector('#whole-word').addEventListener('change', (e) => {
            this.wholeWord = e.target.checked;
            this.findMatches();
        });

        this.element.querySelector('#use-regex').addEventListener('change', (e) => {
            this.regex = e.target.checked;
            this.findMatches();
        });

        // Buttons
        this.element.querySelector('#find-prev').addEventListener('click', () => this.findPrevious());
        this.element.querySelector('#find-next').addEventListener('click', () => this.findNext());
        this.element.querySelector('#replace-next').addEventListener('click', () => this.replaceNext());
        this.element.querySelector('#replace-all').addEventListener('click', () => this.replaceAll());
    }

    setupDragAndDrop() {
        const header = this.element.querySelector('.find-replace-header');
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        header.style.cursor = 'move';
        header.style.userSelect = 'none';

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = this.element.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            let newLeft = startLeft + deltaX;
            let newTop = startTop + deltaY;

            // Keep dialog within viewport bounds
            const rect = this.element.getBoundingClientRect();
            const maxLeft = window.innerWidth - rect.width;
            const maxTop = window.innerHeight - rect.height;

            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));

            this.element.style.left = `${newLeft}px`;
            this.element.style.top = `${newTop}px`;
            this.element.style.right = 'auto'; // Remove auto positioning
            this.element.style.transform = 'none'; // Remove transform
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
            }
        });
    }

    show(findOnly = false) {
        if (!this.element) {
            this.createDialog();
        }

        this.isVisible = true;
        this.element.style.display = 'block';

        // Set initial position for dragging (center the dialog)
        if (this.element.style.left === '' || this.element.style.top === '') {
            const rect = this.element.getBoundingClientRect();
            const centerX = (window.innerWidth - rect.width) / 2;
            const centerY = (window.innerHeight - rect.height) / 2;
            this.element.style.left = `${Math.max(0, centerX)}px`;
            this.element.style.top = `${Math.max(0, centerY)}px`;
            this.element.style.right = 'auto';
            this.element.style.transform = 'none';
        }

        this.element.querySelector('#find-input').focus();

        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        if (findOnly) {
            this.element.querySelector('.replace-section').style.display = 'none';
            this.element.querySelector('#replace-next').style.display = 'none';
            this.element.querySelector('#replace-all').style.display = 'none';
            this.element.querySelector('h3').textContent = t('findReplace.find');
        } else {
            this.element.querySelector('.replace-section').style.display = 'block';
            this.element.querySelector('#replace-next').style.display = 'inline-block';
            this.element.querySelector('#replace-all').style.display = 'inline-block';
            this.element.querySelector('h3').textContent = t('findReplace.findReplace');
        }

        // Pre-fill with selected text
        const editor = document.getElementById('note-editor');
        if (editor && editor.selectionStart !== editor.selectionEnd) {
            const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
            this.element.querySelector('#find-input').value = selectedText;
            this.findText = selectedText;
            this.findMatches();
            // Don't focus editor when dialog opens with pre-filled text
        }
    }

    hide() {
        if (this.element) {
            this.isVisible = false;
            this.element.style.display = 'none';
            this.clearHighlights();
        }
    }

    findMatches() {
        const editor = document.getElementById('note-editor');
        const preview = document.getElementById('markdown-preview');
        const isPreviewMode = preview && !preview.classList.contains('hidden');
        
        if (!editor || !this.findText) {
            this.matches = [];
            this.currentMatchIndex = -1;
            this.updateMatchCount();
            this.clearHighlights();
            return;
        }

        // Find functionality is currently only supported in edit mode
        // Preview mode is disabled until next version
        if (isPreviewMode) {
            this.matches = [];
            this.currentMatchIndex = -1;
            this.updateMatchCount();
            this.clearHighlights();
            return;
        }

        const content = editor.value;
        this.matches = [];
        let searchText = this.findText;

        if (!this.regex) {
            // Escape special regex characters for literal search
            searchText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        if (this.wholeWord) {
            searchText = `\\b${searchText}\\b`;
        }

        const flags = this.caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(searchText, flags);

        let match;
        while ((match = regex.exec(content)) !== null) {
            this.matches.push({
                start: match.index,
                end: match.index + match[0].length,
                text: match[0]
            });
        }

        this.currentMatchIndex = this.matches.length > 0 ? 0 : -1;
        this.updateMatchCount();
        this.highlightMatches();
        this.selectCurrentMatch(false); // Don't focus editor during typing
    }

    highlightMatches() {
        const editor = document.getElementById('note-editor');
        const preview = document.getElementById('markdown-preview');
        const isPreviewMode = preview && !preview.classList.contains('hidden');

        // If no matches, clear highlights and return
        if (this.matches.length === 0) {
            this.clearHighlights();
            return;
        }

        // Always select the current match in the textarea for consistency
        if (editor) {
            this.selectCurrentMatch();
        }

        // Find functionality is currently only supported in edit mode
        // Preview mode highlighting is disabled until next version
        if (isPreviewMode) {
            // Clear any existing highlights in preview mode
            this.clearHighlights();
            // Note: No highlighting in preview mode for now
        } else if (editor && !isPreviewMode) {
            // In edit mode, apply visual highlighting wrapper to textarea
            this.highlightInEditor();
        }
    }

    async clearHighlights() {
        // Reset preview to normal content
        const preview = document.getElementById('markdown-preview');
        const editor = document.getElementById('note-editor');
        
        if (editor) {
            // Remove find mode class
            editor.classList.remove('find-mode-active');
        }
        
        if (preview && editor) {
            // Process media URLs before rendering
            let content = editor.value;
            if (this.app.richMediaManager && this.app.richMediaManager.processContentForPreview) {
                try {
                    content = await this.app.richMediaManager.processContentForPreview(content);
                } catch (error) {
                    console.warn('[Preview] Failed to process media URLs in clearHighlights:', error);
                }
            }
            preview.innerHTML = marked.parse(content);
        }
    }

    async highlightInPreview() {
        if (this.matches.length === 0) return;

        const preview = document.getElementById('markdown-preview');
        const editor = document.getElementById('note-editor');
        if (!preview || !editor) return;

        const editorText = editor.value;

        try {
            // Process media URLs before rendering
            let content = editorText;
            if (this.app.richMediaManager && this.app.richMediaManager.processContentForPreview) {
                try {
                    content = await this.app.richMediaManager.processContentForPreview(content);
                } catch (error) {
                    console.warn('[Preview] Failed to process media URLs in highlightInPreview:', error);
                }
            }

            // Use marker-based approach: Insert unique markers before markdown parsing
            // This preserves exact match positions even after markdown transformation
            const markerPrefix = '\u200B\u200C'; // Zero-width non-joiner + Zero-width joiner (safe markers)
            const markerSuffix = '\u200D\u200E'; // Zero-width joiner + Left-to-right mark
            
            let markedContent = content;
            let offset = 0;
            
            // Insert markers in reverse order to preserve positions
            for (let i = this.matches.length - 1; i >= 0; i--) {
                const match = this.matches[i];
                const adjustedStart = match.start + offset;
                const adjustedEnd = match.end + offset;
                
                const beforeMatch = markedContent.substring(0, adjustedStart);
                const matchText = markedContent.substring(adjustedStart, adjustedEnd);
                const afterMatch = markedContent.substring(adjustedEnd);
                
                // Create unique marker that won't interfere with markdown
                const marker = `${markerPrefix}${i}_${i === this.currentMatchIndex ? 'C' : 'N'}${markerSuffix}`;
                markedContent = beforeMatch + marker + matchText + marker + afterMatch;
                
                // Update offset for next iteration
                offset += marker.length * 2;
            }
            
            // Parse markdown with markers
            let html = marked.parse(markedContent);
            
            // Create a temporary container
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            // Get all text nodes
            const getAllTextNodes = (node) => {
                const textNodes = [];
                const walker = document.createTreeWalker(
                    node,
                    NodeFilter.SHOW_TEXT,
                    null
                );
                
                let textNode;
                while (textNode = walker.nextNode()) {
                    textNodes.push(textNode);
                }
                return textNodes;
            };
            
            const textNodes = getAllTextNodes(tempDiv);
            const replacements = [];
            
            // Find and replace markers in text nodes
            for (const textNode of textNodes) {
                if (!textNode.parentNode) continue;
                
                const text = textNode.textContent;
                
                // Find marker pattern: markerPrefix + matchIndex + C/N + markerSuffix
                const markerPattern = new RegExp(
                    markerPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 
                    '(\\d+)_([CN])' + 
                    markerSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                    'g'
                );
                
                let match;
                const matchesToProcess = [];
                
                while ((match = markerPattern.exec(text)) !== null) {
                    const matchIdx = parseInt(match[1]);
                    const isCurrentMarker = match[2] === 'C';
                    matchesToProcess.push({
                        index: match.index,
                        matchIdx: matchIdx,
                        isCurrentMarker: isCurrentMarker,
                        fullMatch: match[0]
                    });
                }
                
                // Process matches in reverse order to preserve indices
                for (let i = matchesToProcess.length - 1; i >= 0; i--) {
                    const markerMatch = matchesToProcess[i];
                    const markerStart = markerMatch.index;
                    const markerEnd = markerStart + markerMatch.fullMatch.length;
                    
                    // Find the corresponding closing marker right after the match text
                    // The closing marker has the same format: prefix + matchIdx + C/N + suffix
                    const afterMarker = text.substring(markerEnd);
                    const closingMarkerStr = markerPrefix + markerMatch.matchIdx + '_' + (markerMatch.isCurrentMarker ? 'C' : 'N') + markerSuffix;
                    const closingMarkerIndex = afterMarker.indexOf(closingMarkerStr);
                    
                    if (closingMarkerIndex >= 0) {
                        const textStart = markerEnd;
                        const textEnd = markerEnd + closingMarkerIndex;
                        const beforeMatch = text.substring(0, markerStart);
                        const matched = text.substring(textStart, textEnd);
                        const afterMatch = text.substring(textEnd + closingMarkerStr.length);
                        
                        const isCurrent = markerMatch.matchIdx === this.currentMatchIndex;
                        
                        replacements.push({
                            textNode: textNode,
                            start: markerStart,
                            end: textEnd + closingMarkerStr.length,
                            matchIndex: markerMatch.matchIdx,
                            isCurrent: isCurrent,
                            before: beforeMatch,
                            matched: matched,
                            after: afterMatch
                        });
                    }
                }
            }

            // Sort replacements in reverse order (end to start) to preserve indices
            replacements.sort((a, b) => {
                if (a.textNode !== b.textNode) {
                    const position = a.textNode.compareDocumentPosition(b.textNode);
                    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
                    if (position & Node.DOCUMENT_POSITION_PRECEDING) return -1;
                }
                return b.end - a.end;
            });

            // Apply replacements
            for (const replacement of replacements) {
                if (!replacement.textNode.parentNode) continue; // Already processed

                const highlightClass = replacement.isCurrent ? 'find-highlight find-highlight-current' : 'find-highlight';
                const highlightSpan = document.createElement('mark');
                highlightSpan.className = highlightClass;
                highlightSpan.textContent = replacement.matched;

                const fragment = document.createDocumentFragment();
                if (replacement.before) fragment.appendChild(document.createTextNode(replacement.before));
                fragment.appendChild(highlightSpan);
                if (replacement.after) fragment.appendChild(document.createTextNode(replacement.after));

                replacement.textNode.parentNode.replaceChild(fragment, replacement.textNode);
            }

            preview.innerHTML = tempDiv.innerHTML;

            // Scroll the current highlight into view with better positioning
            const currentHighlight = preview.querySelector('.find-highlight-current');
            if (currentHighlight) {
                // Use better scroll options for smaller screens
                const rect = currentHighlight.getBoundingClientRect();
                const previewRect = preview.getBoundingClientRect();
                const headerHeight = 64; // Approximate header height
                
                // Calculate if highlight is visible
                const isVisible = rect.top >= previewRect.top + headerHeight && 
                                 rect.bottom <= previewRect.bottom;
                
                if (!isVisible) {
                    // Scroll with offset to account for header
                    const scrollTop = preview.scrollTop + rect.top - previewRect.top - (window.innerHeight / 3);
                    preview.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
                }
            } else {
                // Fallback: try to find any highlight
                const firstHighlight = preview.querySelector('.find-highlight');
                if (firstHighlight) {
                    firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
                }
            }
        } catch (error) {
            console.warn('Error highlighting in preview:', error);
            // Fallback to normal rendering
            let content = editor.value;
            if (this.app.richMediaManager && this.app.richMediaManager.processContentForPreview) {
                try {
                    content = await this.app.richMediaManager.processContentForPreview(content);
                } catch (e) {
                    // Ignore
                }
            }
            preview.innerHTML = marked.parse(content);
        }
    }

    highlightInEditor() {
        // For textarea, we can't directly add HTML highlights, but we can:
        // 1. Ensure the selection is visible (handled by selectCurrentMatch)
        // 2. Add a wrapper element with visual indicator
        // Since textarea doesn't support HTML, we rely on the selection being visible
        // The CSS will make the selection more prominent
        const editor = document.getElementById('note-editor');
        if (!editor) return;

        // Add a class to indicate find mode is active
        editor.classList.add('find-mode-active');
        
        // Scroll to the current match with better calculation for smaller screens
        if (this.currentMatchIndex >= 0 && this.currentMatchIndex < this.matches.length) {
            const match = this.matches[this.currentMatchIndex];
            
            // Use a more accurate scroll calculation
            const textBeforeMatch = editor.value.substring(0, match.start);
            const lines = textBeforeMatch.split('\n').length;
            
            // Get actual line height
            const style = getComputedStyle(editor);
            const lineHeight = parseInt(style.lineHeight) || parseInt(style.fontSize) * 1.5 || 20;
            const paddingTop = parseInt(style.paddingTop) || 0;
            
            // Calculate the target scroll position
            // Account for viewport height and header on smaller screens
            const editorRect = editor.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const headerHeight = 64; // Approximate header + editor header height
            const availableHeight = viewportHeight - headerHeight;
            
            // Calculate line position of match
            const targetLinePosition = (lines - 1) * lineHeight;
            
            // Ideal scroll position: center the match in the visible area
            // But on smaller screens, we want it closer to the top
            const idealScrollTop = targetLinePosition - (availableHeight / 2) + paddingTop;
            
            // Ensure we don't scroll past the top
            const minScrollTop = 0;
            // Calculate max scroll (content height - visible height)
            const contentHeight = editor.scrollHeight;
            const visibleHeight = editorRect.height;
            const maxScrollTop = Math.max(0, contentHeight - visibleHeight);
            
            // For smaller screens, prefer showing match near top
            const isSmallScreen = viewportHeight < 800;
            const scrollOffset = isSmallScreen ? availableHeight * 0.2 : availableHeight * 0.4;
            const finalScrollTop = Math.max(minScrollTop, Math.min(maxScrollTop, targetLinePosition - scrollOffset + paddingTop));
            
            editor.scrollTop = finalScrollTop;
            
            // Ensure cursor/selection is visible after scroll
            // Small delay to let scroll complete
            setTimeout(() => {
                const selectionStart = editor.selectionStart;
                const selectionEnd = editor.selectionEnd;
                
                // Check if selection is visible
                const textBeforeStart = editor.value.substring(0, selectionStart);
                const startLine = textBeforeStart.split('\n').length;
                const startLineTop = (startLine - 1) * lineHeight;
                const startLineBottom = startLineTop + lineHeight;
                
                if (startLineTop < editor.scrollTop || startLineBottom > editor.scrollTop + visibleHeight) {
                    // Selection not visible, adjust scroll
                    editor.scrollTop = Math.max(0, startLineTop - scrollOffset);
                }
            }, 50);
        }
    }

    selectCurrentMatch(focusEditor = false) {
        if (this.currentMatchIndex >= 0 && this.currentMatchIndex < this.matches.length) {
            const editor = document.getElementById('note-editor');
            const match = this.matches[this.currentMatchIndex];
            editor.setSelectionRange(match.start, match.end);

            if (focusEditor) {
                editor.focus();
            }

            // Scroll into view
            const lineHeight = parseInt(getComputedStyle(editor).lineHeight);
            const lines = editor.value.substring(0, match.start).split('\n').length;
            editor.scrollTop = (lines - 1) * lineHeight;
        }
    }

    findNext() {
        if (this.matches.length === 0) return;

        this.currentMatchIndex = (this.currentMatchIndex + 1) % this.matches.length;
        this.updateMatchCount();
        this.highlightMatches();
        this.selectCurrentMatch(true); // Focus editor when navigating
    }

    findPrevious() {
        if (this.matches.length === 0) return;

        this.currentMatchIndex = this.currentMatchIndex <= 0 ?
            this.matches.length - 1 : this.currentMatchIndex - 1;
        this.updateMatchCount();
        this.highlightMatches();
        this.selectCurrentMatch(true); // Focus editor when navigating
    }

    replaceNext() {
        if (this.currentMatchIndex < 0 || this.currentMatchIndex >= this.matches.length) return;

        const editor = document.getElementById('note-editor');
        const match = this.matches[this.currentMatchIndex];
        const before = editor.value.substring(0, match.start);
        const after = editor.value.substring(match.end);
        const newContent = before + this.replaceText + after;

        editor.value = newContent;

        // Track history
        if (!this.app.ignoreHistoryUpdate) {
            const cursorPos = match.start + this.replaceText.length;
            this.app.historyManager.pushState(newContent, cursorPos, cursorPos, cursorPos);
        }

        // Update current note
        if (this.app.currentNote) {
            this.app.currentNote.content = newContent;
            this.app.saveCurrentNote();
        }

        // Update preview
        this.app.updateNotePreview();

        // Re-find matches with updated content
        this.findMatches();

        // Adjust current index if necessary
        if (this.currentMatchIndex >= this.matches.length) {
            this.currentMatchIndex = Math.max(0, this.matches.length - 1);
        }

        this.selectCurrentMatch(true); // Focus editor after replacement
    }

    replaceAll() {
        if (this.matches.length === 0) return;

        const editor = document.getElementById('note-editor');
        let content = editor.value;
        let offset = 0;

        // Replace all matches
        this.matches.forEach(match => {
            const before = content.substring(0, match.start + offset);
            const after = content.substring(match.end + offset);
            content = before + this.replaceText + after;
            offset += this.replaceText.length - match.text.length;
        });

        editor.value = content;

        // Track history
        if (!this.app.ignoreHistoryUpdate) {
            this.app.historyManager.pushState(content, 0, 0, 0);
        }

        // Update current note
        if (this.app.currentNote) {
            this.app.currentNote.content = content;
            this.app.saveCurrentNote();
        }

        // Update preview
        this.app.updateNotePreview();

        // Clear matches
        this.matches = [];
        this.currentMatchIndex = -1;
        this.updateMatchCount();
        this.clearHighlights();
    }

    updateMatchCount() {
        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        const countElement = this.element.querySelector('#match-count');
        if (this.matches.length === 0) {
            countElement.textContent = t('findReplace.noMatches');
        } else {
            countElement.textContent = t('findReplace.matchCount', { 
                current: this.currentMatchIndex + 1, 
                total: this.matches.length 
            });
        }
    }
}

// History Manager for undo/redo functionality
class HistoryManager {
    constructor(maxHistorySize = 100) {
        this.history = [];
        this.currentIndex = -1;
        this.maxHistorySize = maxHistorySize;
    }

    // Add a new state to history
    pushState(content, cursorPosition = 0, selectionStart = 0, selectionEnd = 0) {
        const state = {
            content: content,
            cursorPosition: cursorPosition,
            selectionStart: selectionStart,
            selectionEnd: selectionEnd,
            timestamp: Date.now()
        };

        // Remove any history after current index (for when we're not at the end)
        this.history = this.history.slice(0, this.currentIndex + 1);

        // Add new state
        this.history.push(state);
        this.currentIndex++;

        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.currentIndex--;
        }
    }

    // Get current state
    getCurrentState() {
        if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
            return this.history[this.currentIndex];
        }
        return null;
    }

    // Check if undo is available
    canUndo() {
        return this.currentIndex > 0;
    }

    // Check if redo is available
    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }

    // Perform undo operation
    undo() {
        if (!this.canUndo()) return null;

        this.currentIndex--;
        return this.history[this.currentIndex];
    }

    // Perform redo operation
    redo() {
        if (!this.canRedo()) return null;

        this.currentIndex++;
        return this.history[this.currentIndex];
    }

    // Clear all history
    clear() {
        this.history = [];
        this.currentIndex = -1;
    }

    // Get history statistics
    getStats() {
        return {
            totalStates: this.history.length,
            currentIndex: this.currentIndex,
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        };
    }
}

class CogNotezApp {
    constructor() {
        this.currentNote = null;
        this.notes = [];
        this.theme = localStorage.getItem('theme') || 'light';
        this.aiPanelVisible = false;
        this.selectedText = '';
        this.selectionStart = -1;
        this.selectionEnd = -1;
        this.preserveSelection = false; // Flag to preserve selection during AI operations
        this.notesManager = null;
        this.aiManager = null;
        this.backendAPI = null;
        this.uiManager = null;
        this.historyManager = new HistoryManager();
        this.ignoreHistoryUpdate = false; // Flag to prevent history updates during undo/redo
        this.findReplaceDialog = new FindReplaceDialog(this);
        this.syncManager = null; // Sync status manager
        this.syncStatus = {
            isAuthenticated: false,
            syncEnabled: false,
            lastSync: null,
            inProgress: false
        };

		// Cache of passwords for unlocked notes (noteId -> password)
		this.notePasswordCache = {};

		// Interval for updating note date in real-time
		this.noteDateUpdateInterval = null;

        // Phase 5 managers
        this.advancedSearchManager = null;
        this.templatesManager = null;
        this.richMediaManager = null;

        // Debounced history tracking
        this.historyDebounceTimer = null;
        this.historyDebounceDelay = 500; // 500ms delay for batching history updates

        // Live preview state
        this.previewMode = 'preview'; // 'edit', 'preview', or 'split'
        this.livePreviewDebounce = null;
        this.livePreviewListener = null;
        this.syncScrollEnabled = true;
        this.syncScrollTimeout = null;
        this.syncScrollSource = null; // Track which pane initiated scroll

        // AI operation cancellation
        this.currentAIAbortController = null;
        this.isAIOperationCancelled = false;

        // Multi-tab system
        this.openTabs = []; // Array of { noteId, title, unsaved } objects
        this.maxTabs = 10; // Maximum number of tabs allowed
        this._ignoreNextInputForUnsaved = false; // Flag to prevent marking tab unsaved during note load
        this._draggedTabIndex = null; // Index of tab being dragged for reordering

        // Folder/Category navigation
        this.currentFolder = localStorage.getItem('currentFolder') || 'all'; // Current active folder: 'all', 'untagged', or a tag ID

        this.init();
    }

    async init() {
        console.log('[DEBUG] Starting CogNotez application initialization...');
        const startTime = performance.now();

        // Show splash screen immediately
        this.showSplashScreen();
        this.updateSplashVersion();
        this.updateSplashProgress('splash.startingUp', 5);

        try {
            // Phase 1: Core initialization (required before app can function)
            console.log('[DEBUG] Initializing backend API...');
            this.updateSplashProgress('splash.connectingServices', 15);
            this.backendAPI = new BackendAPI();
            this.backendAPI.setAppReference(this);

            // Run backend and notes manager init in parallel
            const [, ] = await Promise.all([
                this.backendAPI.initialize(),
                (async () => {
            console.log('[DEBUG] Initializing notes manager...');
            this.notesManager = new NotesManager(this);
            await this.notesManager.initialize();
                })()
            ]);
            this.updateSplashProgress('splash.loadingNotes', 40);

            // Start auto-save if enabled in settings
            this.initializeAutoSave();

            // Phase 2: UI and features (can run in parallel)
            console.log('[DEBUG] Initializing managers...');
            this.updateSplashProgress('splash.preparingInterface', 55);
            
            // Initialize AI manager, UI manager, and Phase 5 features in parallel
            await Promise.all([
                (async () => {
            this.aiManager = new AIManager(this);
            await this.aiManager.initialize();
                })(),
                (async () => {
            this.uiManager = new UIManager(this);
            this.uiManager.initialize();
                })(),
                this.initializePhase5Features()
            ]);

            // Register IPC listeners before any sync
            this.setupIPC();

            // Phase 3: Sync setup (quick, just registers - doesn't sync yet)
            console.log('[DEBUG] Setting up sync...');
            this.updateSplashProgress('splash.settingUpSync', 75);
            await this.initializeSync();

            // Phase 4: Final UI setup
            console.log('[DEBUG] Setting up event listeners and UI...');
            this.updateSplashProgress('splash.almostReady', 90);
            this.setupEventListeners();
            this.loadTheme();
            this.syncPreviewModeUI();
            await this.loadNotes();

            // Show welcome message in AI panel
            const messagesContainer = document.getElementById('ai-messages');
            if (messagesContainer.children.length === 0 || messagesContainer.querySelector('.ai-messages-empty')) {
                this.showWelcomeMessage();
            }

            // Setup external link handling
            this.setupExternalLinkHandling();

            // Mark as ready and hide splash quickly
            this.updateSplashProgress('splash.ready', 100);
            const elapsed = Math.round(performance.now() - startTime);
            console.log(`[DEBUG] CogNotez initialized in ${elapsed}ms`);

            // Short delay to show completion, then hide
            setTimeout(() => {
                this.hideSplashScreen();
                
                // Run startup sync in BACKGROUND after app is visible
                this.runBackgroundStartupSync();
            }, 300);

        } catch (error) {
            console.error('[DEBUG] Failed to initialize application:', error);
            // Continue with basic functionality even if database fails
            console.log('[DEBUG] Continuing with basic functionality...');
            this.updateSplashProgress('splash.loadingBasics', 60);
            this.setupEventListeners();
            this.setupIPC();
            this.loadTheme();
            this.loadNotes();

            // Start auto-save if enabled in settings (fallback mode)
            this.initializeAutoSave();

            this.updateSplashProgress('splash.ready', 100);
            this.setupExternalLinkHandling();

            setTimeout(() => {
                this.hideSplashScreen();
            }, 300);
        }
    }

    // Run startup sync in background after app is visible
    async runBackgroundStartupSync() {
        try {
            const syncMeta = (this.notesManager && this.notesManager.db) ? this.notesManager.db.getSyncMetadata() : {};
            if (syncMeta && syncMeta.syncOnStartup && this.syncStatus && this.syncStatus.isAuthenticated) {
                // Small delay to ensure app is fully interactive first
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Check if we're online before attempting startup sync
                const isOnline = await window.networkUtils.checkGoogleDriveConnectivity(2000);
                if (isOnline) {
                    console.log('[Sync] Running background startup sync...');
                    await this.manualSync();
                } else {
                    console.log('[Sync] Skipping startup sync - device is offline');
                }
            }
        } catch (e) {
            console.warn('[Sync] Background startup sync failed:', e.message);
        }
    }

    // Initialize auto-save based on settings
    initializeAutoSave() {
        if (!this.notesManager) return;

        const autoSaveEnabled = localStorage.getItem('autoSave') !== 'false'; // Default to true
        if (autoSaveEnabled) {
            if (!this.notesManager.autoSaveInterval) {
                console.log('[DEBUG] Starting auto-save...');
                this.notesManager.startAutoSave();
            }
        } else {
            if (this.notesManager.autoSaveInterval) {
                console.log('[DEBUG] Auto-save disabled in settings, stopping...');
                this.notesManager.stopAutoSave();
            }
        }
    }

    setupEventListeners() {
        // Header buttons
        document.getElementById('new-note-btn').addEventListener('click', () => this.createNewNote());
        document.getElementById('ai-toggle-btn').addEventListener('click', () => this.toggleAIPanel());
        
        // Header overflow menu toggle
        document.getElementById('header-overflow-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleHeaderOverflowMenu();
        });
        
        // Close overflow menu when clicking any menu item (except language selector)
        document.querySelectorAll('.header-overflow-item').forEach(item => {
            if (!item.classList.contains('language-selector-item')) {
                item.addEventListener('click', () => {
                    const menu = document.getElementById('header-overflow-menu');
                    menu.classList.add('hidden');
                });
            }
        });
        
        // Language selector
        const languageSelector = document.getElementById('language-selector');
        if (languageSelector) {
            // Set current language
            const currentLang = window.i18n ? window.i18n.getLanguage() : 'en';
            languageSelector.value = currentLang;
            
            // Handle language change
            languageSelector.addEventListener('change', async (e) => {
                const newLang = e.target.value;
                if (window.i18n) {
                    await window.i18n.setLanguage(newLang);
                }
            });
            
            // Listen for language changes to update selector and notify main process
            window.addEventListener('languageChanged', (e) => {
                languageSelector.value = e.detail.language;
                // Notify main process to update menu language
                if (ipcRenderer) {
                    ipcRenderer.send('menu-language-changed', e.detail.language);
                }
            });
        }
        
        // Menu items that were moved to overflow
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('mobile-search-btn').addEventListener('click', () => this.toggleMobileSearch());
        document.getElementById('advanced-search-btn').addEventListener('click', () => {
            if (this.advancedSearchManager) {
                this.advancedSearchManager.togglePanel();
            }
        });
        document.getElementById('templates-btn').addEventListener('click', () => this.showTemplateChooser());
        
        // Mobile-specific overflow menu items
        const mobileThemeToggle = document.getElementById('mobile-theme-toggle');
        if (mobileThemeToggle) {
            mobileThemeToggle.addEventListener('click', () => this.toggleTheme());
        }
        const mobileAIToggle = document.getElementById('mobile-ai-toggle');
        if (mobileAIToggle) {
            mobileAIToggle.addEventListener('click', () => this.toggleAIPanel());
        }
        const syncSettingsBtn = document.getElementById('sync-settings-btn');
        if (syncSettingsBtn) {
            syncSettingsBtn.addEventListener('click', () => this.showSyncSettings());
        }
        
        // Simplified sync button
        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => this.manualSync());
        }
        
        // Initialize tabs system
        this.initializeTabsEventListeners();
        
        // Initialize folder navigation
        this.setupFolderNavigation();
        
        // Update search shortcut for platform
        const searchShortcut = document.getElementById('search-shortcut');
        if (searchShortcut) {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            searchShortcut.textContent = isMac ? '⌘K' : 'Ctrl+K';
        }

        // Network online/offline event listeners
        window.addEventListener('online', () => {
            console.log('[Network] Device is now ONLINE');
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.connectionRestored'), 'success');
            this.updateSyncUI();
            // Clear network cache when coming back online
            if (window.networkUtils) {
                window.networkUtils.clearCache();
            }
        });

        window.addEventListener('offline', () => {
            console.log('[Network] Device is now OFFLINE');
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.noInternet'), 'warning');
            this.updateSyncUI();
        });

        // Search input
        const searchInputEl = document.getElementById('search-input');
        const searchClearBtn = document.getElementById('search-clear-btn');

        if (searchInputEl) {
            searchInputEl.addEventListener('input', (e) => {
                this.searchNotes(e.target.value);
            });
            searchInputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.searchNotes();
            });
        }

        if (searchClearBtn && searchInputEl) {
            searchClearBtn.addEventListener('click', () => {
                searchInputEl.value = '';
                this.searchNotes('');
                searchInputEl.focus();
            });
        }

        // Note list click handler (delegate to notes manager)
        document.getElementById('notes-list').addEventListener('click', async (e) => {
            const noteItem = e.target.closest('.note-item');
            if (noteItem) {
                const noteId = noteItem.dataset.id;
                await this.switchToNoteWithWarning(noteId);
            } else {
                // Clicked on empty space in notes list - clear selection
                // Check for unsaved changes before clearing
                if (this.currentNote && this.notesManager && this.notesManager.hasUnsavedChanges()) {
                    const shouldClear = await this.showUnsavedChangesWarning();
                    if (shouldClear) {
                        this.showNoNotePlaceholder();
                    }
                } else {
                    this.showNoNotePlaceholder();
                }
            }
        });

        // Main content area click handler - clear note selection when clicking on empty editor area
        document.querySelector('.main-content-area').addEventListener('click', async (e) => {
            // Only clear if clicking on the main content area itself, not on child elements
            if (e.target === e.currentTarget && this.currentNote) {
                // Check for unsaved changes before clearing
                if (this.notesManager && this.notesManager.hasUnsavedChanges()) {
                    const shouldClear = await this.showUnsavedChangesWarning();
                    if (shouldClear) {
                        this.showNoNotePlaceholder();
                    }
                } else {
                    this.showNoNotePlaceholder();
                }
            }
        });

        // Editor actions
        document.getElementById('undo-btn').addEventListener('click', () => this.undo());
        document.getElementById('redo-btn').addEventListener('click', () => this.redo());
        document.getElementById('find-btn').addEventListener('click', () => this.showFindDialog());
        document.getElementById('replace-btn').addEventListener('click', () => this.showReplaceDialog());
        document.getElementById('preview-toggle-btn').addEventListener('click', () => this.togglePreview());
        document.getElementById('save-btn').addEventListener('click', () => this.saveCurrentNote());
        
        // Editor overflow menu toggle
        document.getElementById('editor-overflow-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleEditorOverflowMenu();
        });
        
        // Close overflow menu when clicking any menu item
        document.querySelectorAll('.overflow-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const menu = document.getElementById('editor-overflow-menu');
                menu.classList.add('hidden');
            });
        });
        document.getElementById('ai-summary-btn').addEventListener('click', () => this.summarizeNote());
        document.getElementById('generate-tags-btn').addEventListener('click', () => this.generateTags());
        document.getElementById('manage-tags-btn').addEventListener('click', () => this.showTagManager());
        document.getElementById('export-btn').addEventListener('click', () => this.exportNote());
        document.getElementById('share-btn').addEventListener('click', () => this.showShareOptions());
        document.getElementById('password-lock-btn').addEventListener('click', () => this.showPasswordProtectionDialog());

        // Placeholder actions
        document.getElementById('create-first-note-btn').addEventListener('click', () => this.createNewNote());

        // Editor input for real-time preview updates and unsaved tracking
        document.getElementById('note-editor').addEventListener('input', () => {
            const preview = document.getElementById('markdown-preview');
            if (!preview.classList.contains('hidden')) {
                this.renderMarkdownPreview();
            }
            // Mark tab as unsaved when content changes (skip if loading note)
            if (this.currentNote && !this._ignoreNextInputForUnsaved) {
                this.markTabUnsaved(this.currentNote.id, true);
            }
            this._ignoreNextInputForUnsaved = false;
        });
        
        // Also track title changes for unsaved indicator and update tab title
        document.getElementById('note-title').addEventListener('input', (e) => {
            if (this.currentNote && !this._ignoreNextInputForUnsaved) {
                this.markTabUnsaved(this.currentNote.id, true);
                // Update tab title live
                this.updateTabTitle(this.currentNote.id, e.target.value || 'Untitled');
            }
        });

        // AI Panel
        document.getElementById('ai-panel-close').addEventListener('click', () => {
            console.log('[DEBUG] AI panel close button clicked');
            this.toggleAIPanel();
        });
        document.getElementById('ai-reset-btn').addEventListener('click', () => {
            console.log('[DEBUG] AI panel reset button clicked');
            this.resetAIConversation();
        });
        document.getElementById('ai-send-btn').addEventListener('click', () => this.sendAIMessage());
        const aiInput = document.getElementById('ai-input');
        aiInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendAIMessage();
            }
        });
        aiInput.addEventListener('input', () => {
            this.autoResizeTextarea(aiInput);
        });

        // Global context menu closer
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('context-menu');
            if (menu && !menu.contains(e.target)) {
                this.hideContextMenu();
            }
        });

        // Note editor context menu
        const editor = document.getElementById('note-editor');
        editor.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            const selectedText = editor.value.substring(start, end);
            
            // Store selection range for operations
            this.selectionStart = start;
            this.selectionEnd = end;
            this.selectedText = selectedText;
            this.contextElement = editor;
            
            this.showContextMenu(e, selectedText);
        });

        // Preview mode context menu
        const preview = document.getElementById('markdown-preview');
        preview.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const selection = window.getSelection();
            const selectedText = selection.toString();

            this.selectedText = selectedText;
            this.contextElement = preview;

            // Check if right-clicked on media element
            const target = e.target.closest('img, video, audio');
            if (target) {
                this.contextMediaElement = target;
            } else {
                this.contextMediaElement = null;
            }

            this.showContextMenu(e, selectedText);
        });
        editor.addEventListener('input', () => {
            this.updateNotePreview();
            // Track history for undo/redo functionality with debouncing
            if (!this.ignoreHistoryUpdate) {
                this.debouncedPushHistory(editor);
            }
            // Clear stored selection when user types
            this.selectionStart = -1;
            this.selectionEnd = -1;
        });

        // Clear stored selection when editor loses focus or when clicking elsewhere
        // But preserve selection during AI operations
        editor.addEventListener('blur', () => {
            if (!this.preserveSelection) {
                this.selectionStart = -1;
                this.selectionEnd = -1;
            }
        });

        // Modal dialogs
        document.getElementById('ai-dialog-close').addEventListener('click', () => this.hideAIDialog());
        document.getElementById('ai-dialog-cancel').addEventListener('click', () => this.hideAIDialog());
        document.getElementById('ai-dialog-submit').addEventListener('click', () => this.processAIDialog());

        // Note title
        document.getElementById('note-title').addEventListener('input', () => this.updateNoteTitle());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    setupIPC() {
        // Menu actions from main process
        ipcRenderer.on('menu-new-note', () => this.createNewNote());
        ipcRenderer.on('menu-summarize', () => this.summarizeSelection());
        ipcRenderer.on('menu-ask-ai', () => this.askAIAboutSelection());
        ipcRenderer.on('menu-edit-ai', () => this.editSelectionWithAI());
        ipcRenderer.on('menu-generate-ai', () => this.generateContentWithAI());
        ipcRenderer.on('menu-export-markdown', () => this.exportNote('markdown'));
        ipcRenderer.on('menu-export-text', () => this.exportNote('text'));
        ipcRenderer.on('menu-export-pdf', () => this.exportNote('pdf'));
        ipcRenderer.on('menu-create-backup', () => this.createFullBackup());

        // Import menu actions
        ipcRenderer.on('menu-import-note', () => this.importNote());
        ipcRenderer.on('menu-import-multiple', () => this.importMultipleFiles());
        ipcRenderer.on('menu-restore-backup', () => this.restoreFromBackup());

        // New AI menu actions
        ipcRenderer.on('menu-rewrite', () => this.rewriteSelection());
        ipcRenderer.on('menu-key-points', () => this.extractKeyPoints());
        ipcRenderer.on('menu-generate-tags', () => this.generateTags());
        ipcRenderer.on('menu-ai-settings', () => this.showAISettings());
        ipcRenderer.on('menu-general-settings', () => this.showGeneralSettings());
        ipcRenderer.on('menu-sync-settings', () => this.showSyncSettings());
        ipcRenderer.on('menu-advanced-settings', () => this.showAdvancedSettings());

        // Update-related menu actions
        ipcRenderer.on('menu-check-updates', () => this.checkForUpdates());
        ipcRenderer.on('menu-about', () => this.showAboutDialog());

        // Update-related IPC events
        ipcRenderer.on('update-checking', () => {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showUpdateStatus(t('notifications.checkingForUpdates'));
        });
        ipcRenderer.on('update-available', (event, info) => this.showUpdateAvailable(info));
        ipcRenderer.on('update-not-available', (event, info) => this.showUpdateNotAvailable(info));
        ipcRenderer.on('update-error', (event, error) => this.showUpdateError(error));
        ipcRenderer.on('download-progress', (event, progress) => this.showDownloadProgress(progress));
        ipcRenderer.on('update-downloaded', (event, info) => this.showUpdateDownloaded(info));

        // Sync-related IPC events
        ipcRenderer.on('sync-data-updated', (event, syncData) => this.handleSyncDataUpdated(syncData));
        ipcRenderer.on('sync-completed', (event, syncResult) => this.handleSyncCompleted(syncResult));
        ipcRenderer.on('sync-requires-passphrase', (event, payload) => this.promptForDecryptionPassphrase(payload));

        // Encryption-related IPC events
        ipcRenderer.on('encryption-settings-updated', (event, settings) => this.handleEncryptionSettingsUpdated(settings));

        // Google Drive authentication IPC handlers
        ipcRenderer.on('google-drive-auth-success', (event, data) => {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(data.message || t('notifications.googleDriveAuthSuccess'), 'success');
            // Refresh sync status to show connected state
            this.updateSyncStatus();
        });

        ipcRenderer.on('google-drive-auth-error', (event, data) => {
            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
            let errorMessage = t('notifications.googleDriveAuthFailed');
            if (data.error) {
                if (data.error.includes('credentials not found') || data.error.includes('Google Drive credentials')) {
                    errorMessage = t('notifications.googleDriveCredentialsNotFound');
                } else if (data.error.includes('access_denied') || data.error.includes('403')) {
                    errorMessage = t('notifications.googleDriveAccessDenied');
                } else {
                    errorMessage = t('notifications.googleDriveAuthFailedError', { error: data.error });
                }
            }
            this.showNotification(errorMessage, 'error');
            // Refresh sync status to show error state
            this.updateSyncStatus();
        });

    }

    // Theme management
    loadTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        // CSS automatically handles button appearance through data-theme attribute
    }

    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', this.theme);
        this.loadTheme();
    }

    // Update preview toggle button icon to reflect current mode
    updatePreviewToggleIcon() {
        const toggleBtn = document.getElementById('preview-toggle-btn');
        if (!toggleBtn) return;

        const t = (key) => window.i18n ? window.i18n.t(key) : key;

        switch (this.previewMode) {
            case 'edit':
                toggleBtn.innerHTML = '<i class="fas fa-edit"></i>';
                toggleBtn.title = t('editor.editMode');
                break;
            case 'preview':
                toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
                toggleBtn.title = t('editor.previewMode');
                break;
            case 'split':
                toggleBtn.innerHTML = '<i class="fas fa-columns"></i>';
                toggleBtn.title = t('editor.splitMode');
                break;
        }
    }

    // Sync UI visibility with current preview mode
    syncPreviewModeUI() {
        const editor = document.getElementById('note-editor');
        const preview = document.getElementById('markdown-preview');
        const wrapper = document.querySelector('.editor-wrapper');
        
        if (!editor || !preview || !wrapper) return;

        switch (this.previewMode) {
            case 'edit':
                editor.classList.remove('hidden');
                preview.classList.add('hidden');
                wrapper.classList.remove('split-mode');
                this.removeLivePreview();
                this.removeSyncScroll();
                break;
            case 'preview':
                editor.classList.add('hidden');
                preview.classList.remove('hidden');
                wrapper.classList.remove('split-mode');
                this.removeLivePreview();
                this.removeSyncScroll();
                break;
            case 'split':
                editor.classList.remove('hidden');
                preview.classList.remove('hidden');
                wrapper.classList.add('split-mode');
                this.setupLivePreview();
                this.setupSyncScroll();
                break;
        }
        
        this.updatePreviewToggleIcon();
    }

    // Preview/Edit mode toggle - cycles through three states: edit → preview → split
    togglePreview() {
        const editor = document.getElementById('note-editor');
        const preview = document.getElementById('markdown-preview');
        const toggleBtn = document.getElementById('preview-toggle-btn');
        const wrapper = document.querySelector('.editor-wrapper');

        // Cycle through three states: edit → preview → split → edit
        if (this.previewMode === 'edit') {
            // State 1 → State 2: Switch to preview only
            this.previewMode = 'preview';
            editor.classList.add('hidden');
            preview.classList.remove('hidden');
            wrapper.classList.remove('split-mode');
            this.removeLivePreview();
            this.renderMarkdownPreview();
        } else if (this.previewMode === 'preview') {
            // State 2 → State 3: Switch to live split
            this.previewMode = 'split';
            editor.classList.remove('hidden');
            preview.classList.remove('hidden');
            wrapper.classList.add('split-mode');
            this.renderMarkdownPreview();
            this.setupLivePreview();
            this.setupSyncScroll();
        } else {
            // State 3 → State 1: Switch to edit only
            this.previewMode = 'edit';
            editor.classList.remove('hidden');
            preview.classList.add('hidden');
            wrapper.classList.remove('split-mode');
            this.removeLivePreview();
            this.removeSyncScroll();
            toggleBtn.classList.remove('active');
        }

        // Update button icon to reflect current mode
        this.updatePreviewToggleIcon();

        // Update find highlighting after mode switch
        if (this.findReplaceDialog && this.findReplaceDialog.isVisible && this.findReplaceDialog.findText) {
            this.findReplaceDialog.highlightMatches();
        }
    }

    // Setup live preview with debouncing for performance
    setupLivePreview() {
        const editor = document.getElementById('note-editor');
        
        // Remove old listener if exists
        if (this.livePreviewListener) {
            editor.removeEventListener('input', this.livePreviewListener);
        }
        
        // Create new listener with debouncing
        this.livePreviewListener = () => {
            clearTimeout(this.livePreviewDebounce);
            this.livePreviewDebounce = setTimeout(() => {
                this.renderMarkdownPreview();
            }, 300); // 300ms debounce for smooth typing experience
        };
        
        editor.addEventListener('input', this.livePreviewListener);
        console.log('[DEBUG] Live preview enabled');
    }

    // Remove live preview listener
    removeLivePreview() {
        const editor = document.getElementById('note-editor');
        if (this.livePreviewListener) {
            editor.removeEventListener('input', this.livePreviewListener);
            this.livePreviewListener = null;
        }
        clearTimeout(this.livePreviewDebounce);
        console.log('[DEBUG] Live preview disabled');
    }

    // Setup synchronized scrolling between editor and preview
    setupSyncScroll() {
        const editor = document.getElementById('note-editor');
        const preview = document.getElementById('markdown-preview');
        
        if (!editor || !preview) return;

        // Track which element is being scrolled to prevent feedback loops
        this.syncScrollSource = null;
        this.syncScrollTimeout = null;

        // Editor scroll handler
        this.editorScrollHandler = () => {
            if (!this.syncScrollEnabled) return;
            
            // If preview initiated the scroll, ignore
            if (this.syncScrollSource === 'preview') return;
            
            // Mark editor as the scroll source
            this.syncScrollSource = 'editor';
            
            // Clear any existing timeout
            if (this.syncScrollTimeout) {
                clearTimeout(this.syncScrollTimeout);
            }
            
            // Calculate scroll percentage
            const scrollPercentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight);
            
            // Apply to preview (with bounds check)
            if (isFinite(scrollPercentage) && scrollPercentage >= 0) {
                preview.scrollTop = scrollPercentage * (preview.scrollHeight - preview.clientHeight);
            }
            
            // Reset source after smooth scroll animation completes (300ms for smooth behavior)
            this.syncScrollTimeout = setTimeout(() => {
                this.syncScrollSource = null;
            }, 350);
        };

        // Preview scroll handler
        this.previewScrollHandler = () => {
            if (!this.syncScrollEnabled) return;
            
            // If editor initiated the scroll, ignore
            if (this.syncScrollSource === 'editor') return;
            
            // Mark preview as the scroll source
            this.syncScrollSource = 'preview';
            
            // Clear any existing timeout
            if (this.syncScrollTimeout) {
                clearTimeout(this.syncScrollTimeout);
            }
            
            // Calculate scroll percentage
            const scrollPercentage = preview.scrollTop / (preview.scrollHeight - preview.clientHeight);
            
            // Apply to editor (with bounds check)
            if (isFinite(scrollPercentage) && scrollPercentage >= 0) {
                editor.scrollTop = scrollPercentage * (editor.scrollHeight - editor.clientHeight);
            }
            
            // Reset source after smooth scroll animation completes (300ms for smooth behavior)
            this.syncScrollTimeout = setTimeout(() => {
                this.syncScrollSource = null;
            }, 350);
        };

        // Attach listeners
        editor.addEventListener('scroll', this.editorScrollHandler, { passive: true });
        preview.addEventListener('scroll', this.previewScrollHandler, { passive: true });
        
        console.log('[DEBUG] Synchronized scrolling enabled');
    }

    // Remove synchronized scrolling
    removeSyncScroll() {
        const editor = document.getElementById('note-editor');
        const preview = document.getElementById('markdown-preview');
        
        if (editor && this.editorScrollHandler) {
            editor.removeEventListener('scroll', this.editorScrollHandler);
            this.editorScrollHandler = null;
        }
        
        if (preview && this.previewScrollHandler) {
            preview.removeEventListener('scroll', this.previewScrollHandler);
            this.previewScrollHandler = null;
        }
        
        // Clear sync scroll timeout and source
        if (this.syncScrollTimeout) {
            clearTimeout(this.syncScrollTimeout);
            this.syncScrollTimeout = null;
        }
        this.syncScrollSource = null;
        
        console.log('[DEBUG] Synchronized scrolling disabled');
    }

    // Toggle editor overflow menu
    toggleEditorOverflowMenu() {
        const menu = document.getElementById('editor-overflow-menu');
        const isHidden = menu.classList.contains('hidden');

        if (isHidden) {
            // Show menu
            menu.classList.remove('hidden');
            
            // Add click listener to close menu when clicking outside
            setTimeout(() => {
                document.addEventListener('click', this.closeEditorOverflowMenu.bind(this), { once: true });
            }, 0);
        } else {
            // Hide menu
            menu.classList.add('hidden');
        }
    }

    // Close editor overflow menu
    closeEditorOverflowMenu(e) {
        const menu = document.getElementById('editor-overflow-menu');
        const overflowBtn = document.getElementById('editor-overflow-btn');
        
        // Don't close if clicking inside the menu or on the overflow button
        if (menu && !menu.contains(e?.target) && e?.target !== overflowBtn) {
            menu.classList.add('hidden');
        }
    }

    // Toggle header overflow menu
    toggleHeaderOverflowMenu() {
        const menu = document.getElementById('header-overflow-menu');
        const isHidden = menu.classList.contains('hidden');

        if (isHidden) {
            // Show menu
            menu.classList.remove('hidden');
            
            // Add click listener to close menu when clicking outside
            setTimeout(() => {
                document.addEventListener('click', this.closeHeaderOverflowMenu.bind(this), { once: true });
            }, 0);
        } else {
            // Hide menu
            menu.classList.add('hidden');
        }
    }

    // Close header overflow menu
    closeHeaderOverflowMenu(e) {
        const menu = document.getElementById('header-overflow-menu');
        const overflowBtn = document.getElementById('header-overflow-btn');

        // Don't close if clicking inside the menu or on the overflow button
        if (menu && !menu.contains(e?.target) && e?.target !== overflowBtn) {
            menu.classList.add('hidden');
        }
    }

    // Toggle mobile search
    toggleMobileSearch() {
        const searchContainer = document.getElementById('search-container');
        const isActive = searchContainer.classList.contains('mobile-active');

        if (isActive) {
            // Hide search
            searchContainer.classList.remove('mobile-active');
        } else {
            // Show search and focus input
            searchContainer.classList.add('mobile-active');
            setTimeout(() => {
                const searchInput = document.getElementById('search-input');
                if (searchInput) {
                    searchInput.focus();
                }
            }, 300); // Wait for animation to complete
        }
    }

    async renderMarkdownPreview() {
        const editor = document.getElementById('note-editor');
        const preview = document.getElementById('markdown-preview');

        if (!editor.value.trim()) {
            const startWritingText = window.i18n ? window.i18n.t('editor.startWriting') : 'Start writing your note...';
            preview.innerHTML = `<p style="color: var(--text-tertiary); font-style: italic;">${startWritingText}</p>`;
            return;
        }

        // Process content to resolve media URLs if needed
        let content = editor.value;
        if (this.richMediaManager && this.richMediaManager.processContentForPreview) {
            try {
                content = await this.richMediaManager.processContentForPreview(content);
            } catch (error) {
                console.warn('[Preview] Failed to process media URLs:', error);
                // Continue with original content if processing fails
            }
        }

        // Render markdown and sanitize for security
        const renderedHTML = renderMarkdown(content);
        preview.innerHTML = renderedHTML;
        
        // Setup horizontal scroll functionality
        this.setupHorizontalScroll(preview);
        
        // Ensure external links open in default browser (renderer-side handling)
        this.setupExternalLinkHandling(preview);
    }

    // Setup horizontal scroll functionality for markdown preview
    setupHorizontalScroll(container) {
        if (!container) return;
        
        // Wrap tables in scrollable containers
        const tables = container.querySelectorAll('table');
        tables.forEach(table => {
            if (!table.parentElement.classList.contains('table-container')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'table-container';
                table.parentNode.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }
        });
        
        // Check for horizontal scroll and add visual indicators
        const checkHorizontalScroll = () => {
            const hasHorizontalScroll = container.scrollWidth > container.clientWidth;
            container.classList.toggle('scrollable-x', hasHorizontalScroll);
        };
        
        // Initial check
        checkHorizontalScroll();
        
        // Check on resize
        const resizeObserver = new ResizeObserver(checkHorizontalScroll);
        resizeObserver.observe(container);
        
        // Check on content changes
        const mutationObserver = new MutationObserver(checkHorizontalScroll);
        mutationObserver.observe(container, { 
            childList: true, 
            subtree: true, 
            attributes: true 
        });
        
        // Add keyboard navigation for horizontal scrolling
        container.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'ArrowLeft':
                        e.preventDefault();
                        container.scrollBy({ left: -100, behavior: 'smooth' });
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        container.scrollBy({ left: 100, behavior: 'smooth' });
                        break;
                }
            }
        });
        
        // Store observers for cleanup
        container._horizontalScrollObservers = { resizeObserver, mutationObserver };
    }

    // Setup link handling to open external links in default browser
    setupExternalLinkHandling(container) {
        if (!container) return;
        
        // Remove any existing listeners to avoid duplicates
        const oldHandler = container._linkClickHandler;
        if (oldHandler) {
            container.removeEventListener('click', oldHandler);
        }
        
        // Create new handler
        const linkClickHandler = (event) => {
            const target = event.target;
            
            // Check if the clicked element is a link or is inside a link
            const link = target.closest('a');
            if (!link) return;
            
            const href = link.getAttribute('href');
            if (!href) return;
            
            // Only handle external links (http/https)
            if (href.startsWith('http://') || href.startsWith('https://')) {
                event.preventDefault();
                
                // Use Electron's shell to open in default browser
                if (typeof require !== 'undefined') {
                    try {
                        const { shell } = require('electron');
                        shell.openExternal(href);
                    } catch (error) {
                        console.error('Failed to open external link:', error);
                        // Fallback: try window.open as last resort
                        window.open(href, '_blank');
                    }
                }
            }
            // Allow internal links (anchors, etc.) to work normally
        };
        
        // Store handler reference for cleanup
        container._linkClickHandler = linkClickHandler;
        
        // Add event listener
        container.addEventListener('click', linkClickHandler);
    }

    // Note management
    async loadNotes() {
        if (this.notesManager) {
            // Respect current search query and folder when loading notes
            const searchInput = document.getElementById('search-input');
            const searchQuery = searchInput ? (searchInput.value || '') : '';
            await this.notesManager.renderNotesList(searchQuery, this.currentFolder);
            
            // Render tag folders in sidebar
            await this.renderTagFolders();

            // Check if there are any notes and show placeholder if none exist
            let totalNotes = 0;
            if (this.notesManager.db && this.notesManager.db.initialized) {
                const options = { limit: 1 };
                const notes = await this.notesManager.db.getAllNotes(options);
                totalNotes = notes.length;
            } else {
                totalNotes = this.notes.length;
            }

            // If no notes exist, show the placeholder
            if (totalNotes === 0) {
                this.showNoNotePlaceholder();
            } else {
                // If we have notes but none is currently selected, still show placeholder
                if (!this.currentNote) {
                    this.showNoNotePlaceholder();
                }
            }
        }
    }

    // Check for unsaved changes and show warning before switching notes
    async switchToNoteWithWarning(noteId) {
        if (!this.notesManager) return;

        // If no current note or no unsaved changes, switch immediately
        if (!this.currentNote || !this.notesManager.hasUnsavedChanges()) {
            await this.loadNoteById(noteId);
            return;
        }

        // Show warning dialog for unsaved changes
        const shouldSwitch = await this.showUnsavedChangesWarning();
        if (shouldSwitch) {
            await this.loadNoteById(noteId);
        }
    }

    // Show warning dialog for unsaved changes
    async showUnsavedChangesWarning() {
        return new Promise((resolve) => {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            const content = `
                <div style="padding: 10px 0;">
                    <p style="margin: 0 0 20px 0; color: var(--text-primary);">
                        You have unsaved changes in the current note.
                    </p>
                    <p style="margin: 0 0 20px 0; color: var(--text-secondary); font-size: 14px;">
                        ${t('modals.unsavedChangesMessage')}
                    </p>
                </div>
            `;
            const modal = this.createModal(t('modals.unsavedChanges'), content, [
                { text: t('modals.saveAndSwitch'), type: 'primary', action: 'save-switch' },
                { text: t('modals.discardChanges'), type: 'secondary', action: 'discard-switch' },
                { text: t('modals.cancel'), type: 'secondary', action: 'cancel' }
            ]);

            const saveBtn = modal.querySelector('[data-action="save-switch"]');
            const discardBtn = modal.querySelector('[data-action="discard-switch"]');
            const cancelBtn = modal.querySelector('[data-action="cancel"]');

            saveBtn.addEventListener('click', async () => {
                try {
                    await this.saveCurrentNote();
                    this.closeModal(modal);
                    resolve(true);
                } catch (error) {
                    console.error('Error saving note:', error);
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(t('notifications.saveFailed'), 'error');
                    resolve(false);
                }
            });

            discardBtn.addEventListener('click', () => {
                this.closeModal(modal);
                resolve(true);
            });

            cancelBtn.addEventListener('click', () => {
                this.closeModal(modal);
                resolve(false);
            });
        });
    }

    async loadNoteById(noteId) {
        if (!this.notesManager) return;

        try {
            let note;
            if (this.notesManager.db && this.notesManager.db.initialized) {
                note = await this.notesManager.db.getNote(noteId);
            } else {
                note = this.notes.find(n => n.id === noteId);
            }

            if (note) {
                // Check if note is password protected
                if (note.password_protected) {
                    await this.promptForNotePassword(note);
                } else {
                    this.displayNote(note);
                }
            }
        } catch (error) {
            console.error('Error loading note:', error);
        }
    }

    async promptForNotePassword(note) {
        return new Promise((resolve) => {
            const title = window.i18n ? window.i18n.t('password.enterPassword') : 'Enter Password';
            const message = window.i18n ? window.i18n.t('password.unlockNote', { title: note.title }) : `Enter the password to unlock "${note.title}"`;
            
            this.uiManager.showPasswordDialog({
                title: title,
                message: message,
                onSubmit: async (password) => {
                    try {
						const isValid = await this.verifyNotePassword(note, password);
                        if (isValid) {
							// Decrypt content for this session and cache password
							if (note.encrypted_content && window.encryptionManager) {
								try {
									const envelope = JSON.parse(note.encrypted_content);
									const decrypted = window.encryptionManager.decryptData(envelope, password);
									note.content = decrypted.content || '';
									this.cacheNotePassword(note.id, password);
								} catch (e) {
									console.error('Failed to decrypt note content:', e);
									const t = (key) => window.i18n ? window.i18n.t(key) : key;
									this.showNotification(t('notifications.errorDecryptingNote'), 'error');
									resolve(false);
									return;
								}
							}
							this.displayNote(note);
                            const t = (key) => window.i18n ? window.i18n.t(key) : key;
                            this.showNotification(t('notifications.noteUnlocked'), 'success');
                            resolve(true);
                        } else {
                            const t = (key) => window.i18n ? window.i18n.t(key) : key;
                            this.showNotification(t('notifications.incorrectPassword'), 'error');
                            // Re-prompt for password
                            setTimeout(() => this.promptForNotePassword(note), 500);
                        }
                    } catch (error) {
                        console.error('Error verifying password:', error);
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        this.showNotification(t('notifications.errorUnlockingNote'), 'error');
                        resolve(false);
                    }
                },
                onCancel: () => {
                    resolve(false);
                }
            });
        });
    }

	// Password cache helpers
	cacheNotePassword(noteId, password) {
		this.notePasswordCache[noteId] = password;
	}

	getCachedNotePassword(noteId) {
		return this.notePasswordCache[noteId] || null;
	}

	clearCachedNotePassword(noteId) {
		if (this.notePasswordCache[noteId]) {
			delete this.notePasswordCache[noteId];
		}
	}

    async verifyNotePassword(note, password) {
        if (!note.password_protected || !note.password_hash) {
            return true; // Not password protected
        }

        try {
            if (!window.encryptionManager) {
                throw new Error('Encryption manager not available');
            }
            const hashParts = JSON.parse(note.password_hash);

            return window.encryptionManager.verifyPassword(
                password,
                hashParts.hashBase64,
                hashParts.saltBase64,
                hashParts.iterations
            );
        } catch (error) {
            console.error('Error verifying note password:', error);
            return false;
        }
    }

	async showPasswordProtectionDialog() {
        if (!this.currentNote) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.noNoteSelected'), 'error');
            return;
        }

        const isCurrentlyProtected = this.currentNote.password_protected;
        const titleKey = isCurrentlyProtected ? 'password.removePasswordProtection' : 'password.addPasswordProtection';
        const messageKey = isCurrentlyProtected ? 'password.removePasswordMessage' : 'password.protectNote';
        
        const title = window.i18n ? window.i18n.t(titleKey) : (isCurrentlyProtected ? 'Remove Password Protection' : 'Add Password Protection');
        const message = window.i18n ? window.i18n.t(messageKey) : (isCurrentlyProtected ? 'Enter the current password to remove protection from this note.' : 'Enter a password to protect this note.');

        this.uiManager.showPasswordDialog({
            title: title,
            message: message,
            requireConfirmation: !isCurrentlyProtected,
            showStrength: !isCurrentlyProtected,
            onSubmit: async (password) => {
                try {
                    if (isCurrentlyProtected) {
                        // Remove protection - verify current password
                        const isValid = await this.verifyNotePassword(this.currentNote, password);
                        if (isValid) {
							await this.removePasswordProtection(this.currentNote, password);
                            const t = (key) => window.i18n ? window.i18n.t(key) : key;
                            this.showNotification(t('notifications.passwordProtectionRemoved'), 'success');
                        } else {
                            const t = (key) => window.i18n ? window.i18n.t(key) : key;
                            this.showNotification(t('notifications.incorrectPassword'), 'error');
                            return;
                        }
                    } else {
                        // Add protection - set new password
                        await this.setPasswordProtection(this.currentNote, password);
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        this.showNotification(t('notifications.passwordProtectionAdded'), 'success');
                    }

                    // Update the lock icon in the UI
                    this.updatePasswordLockIcon();
                    // Refresh notes list to show lock icon without clearing filters
                    if (this.notesManager) {
                        const searchInput = document.getElementById('search-input');
                        const searchQuery = searchInput ? (searchInput.value || '') : '';
                        await this.notesManager.renderNotesList(searchQuery, this.currentFolder);
                    }
                } catch (error) {
                    console.error('Error managing password protection:', error);
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(t('notifications.errorManagingPassword'), 'error');
                }
            }
        });
    }

	async setPasswordProtection(note, password) {
        if (!window.encryptionManager) {
            throw new Error('Encryption manager not available');
        }
        const hashResult = window.encryptionManager.hashPassword(password);

		// Encrypt current content and clear plaintext
		let envelopeString = null;
		try {
			const envelope = window.encryptionManager.encryptData({ content: note.content || '' }, password);
			envelopeString = JSON.stringify(envelope);
		} catch (e) {
			console.error('Failed to encrypt note during protection enable:', e);
			const t = (key) => window.i18n ? window.i18n.t(key) : key;
			this.showNotification(t('notifications.failedToEnableProtection'), 'error');
			throw e;
		}

		const updateData = {
            password_protected: true,
			password_hash: JSON.stringify(hashResult),
			encrypted_content: envelopeString,
			content: '',
			preview: ''
        };

        if (this.notesManager && this.notesManager.db && this.notesManager.db.initialized) {
            await this.notesManager.db.updateNote(note.id, updateData);
            // Update the current note object
			Object.assign(note, updateData);
			// Keep decrypted content in memory for current session
			note.content = note.content || '';
        } else {
            // Fallback to localStorage
            Object.assign(note, updateData);
            this.saveNotes();
        }

		// Cache the password for future saves in this session
		this.cacheNotePassword(note.id, password);
    }

	async removePasswordProtection(note, password = null) {
		// If a password isn't provided, try cached
		let passToUse = password || this.getCachedNotePassword(note.id);
		if (!passToUse) {
			// Ask user for password
			const unlocked = await this.promptForNotePassword(note);
			if (!unlocked) return;
			passToUse = this.getCachedNotePassword(note.id);
		}

		// Decrypt existing content
		let plaintext = note.content || '';
		if (!plaintext && note.encrypted_content && window.encryptionManager) {
			try {
				const envelope = JSON.parse(note.encrypted_content);
				const decrypted = window.encryptionManager.decryptData(envelope, passToUse);
				plaintext = decrypted.content || '';
			} catch (e) {
				console.error('Failed to decrypt while removing protection:', e);
				const t = (key) => window.i18n ? window.i18n.t(key) : key;
				this.showNotification(t('notifications.failedToRemoveProtection'), 'error');
				return;
			}
		}

		const updateData = {
			password_protected: false,
			password_hash: null,
			encrypted_content: null,
			content: plaintext,
			preview: this.generatePreview(plaintext)
		};

		if (this.notesManager && this.notesManager.db && this.notesManager.db.initialized) {
			await this.notesManager.db.updateNote(note.id, updateData);
			// Update the current note object
			Object.assign(note, updateData);
		} else {
			// Fallback to localStorage
			Object.assign(note, updateData);
			this.saveNotes();
		}

		// Clear cached password
		this.clearCachedNotePassword(note.id);
	}

    updatePasswordLockIcon() {
        const lockBtn = document.getElementById('password-lock-btn');
        if (!lockBtn || !this.currentNote) return;

        const icon = lockBtn.querySelector('i');
        if (this.currentNote.password_protected) {
            icon.className = 'fas fa-lock-open';
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            lockBtn.title = t('tooltips.removePasswordProtection');
        } else {
            icon.className = 'fas fa-lock';
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            lockBtn.title = t('tooltips.addPasswordProtection');
        }
    }

    async createNewNote() {
        if (!this.notesManager) return;

        const untitledTitle = window.i18n ? window.i18n.t('editor.untitledNoteTitle') : 'Untitled Note';
        const note = {
            id: Date.now().toString(),
            title: untitledTitle,
            content: '',
            preview: '',
            tags: []
        };

        try {
            if (this.notesManager.db && this.notesManager.db.initialized) {
                await this.notesManager.db.createNote(note);
                await this.notesManager.renderNotesList('', this.currentFolder);
                const createdNote = await this.notesManager.db.getNote(note.id);
                this.displayNote(createdNote);
            } else {
                // Fallback to localStorage
                note.created = new Date();
                note.modified = new Date();
                this.notes.unshift(note);
                this.saveNotes();
                this.renderNotesList();
                this.displayNote(note);
            }
            
            // Update folder counts
            await this.renderTagFolders();
        } catch (error) {
            console.error('Error creating note:', error);
        }
    }

    displayNote(note) {
        if (!note) {
            this.showNoNotePlaceholder();
            return;
        }

        this.currentNote = note;
        this.showNoteEditor();

        // Add to tabs if not already open
        this.addNoteToTabs(note.id);

        document.getElementById('note-title').value = note.title;
        document.getElementById('note-editor').value = note.content;
        this.updateNoteDate();

        // Initialize history for undo/redo functionality
        this.initializeHistoryForNote(note.content);

        // Display tags in the editor header (this will also handle wrapping tags+date)
        this.displayNoteTags(note);

        // Update password lock icon
        this.updatePasswordLockIcon();

        // Update active note in sidebar
        document.querySelectorAll('.note-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === note.id);
        });

        // Trigger word count update since we set content programmatically
        // Use a flag to prevent this from marking the tab as unsaved
        this._ignoreNextInputForUnsaved = true;
        const editor = document.getElementById('note-editor');
        const inputEvent = new Event('input', { bubbles: true });
        editor.dispatchEvent(inputEvent);

        // Load conversation history for this note
        this.loadConversationHistory(note.id);

        // Start real-time date updates
        this.startNoteDateUpdates();

        // Update preview if we're in preview or split mode
        if (this.previewMode === 'preview' || this.previewMode === 'split') {
            this.renderMarkdownPreview();
        }
        
        // Ensure tab is marked as saved after loading (not unsaved)
        this.markTabUnsaved(note.id, false);
    }

    // Show the note editor interface
    showNoteEditor() {
        const editorContainer = document.getElementById('editor-container');
        const placeholder = document.getElementById('no-note-placeholder');

        if (editorContainer) {
            editorContainer.style.display = 'flex';
            editorContainer.classList.remove('hidden');
        }
        if (placeholder) {
            placeholder.style.display = 'none';
            placeholder.classList.add('hidden');
        }
    }

    // Show the no-note placeholder
    showNoNotePlaceholder() {
        const editorContainer = document.getElementById('editor-container');
        const placeholder = document.getElementById('no-note-placeholder');

        if (editorContainer) {
            editorContainer.style.display = 'none';
            editorContainer.classList.add('hidden');
        }
        if (placeholder) {
            placeholder.style.display = 'flex';
            placeholder.classList.remove('hidden');
        }

        // Clear current note
        this.currentNote = null;

        // Stop date updates
        this.stopNoteDateUpdates();

        // Clear date display
        const noteDateElement = document.getElementById('note-date');
        if (noteDateElement) {
            noteDateElement.textContent = '';
        }

        // Update sidebar to show no active note
        document.querySelectorAll('.note-item').forEach(item => {
            item.classList.remove('active');
        });
    }

    // =====================================================
    // MULTI-TAB SYSTEM
    // =====================================================

    // Add a note to the tabs bar
    addNoteToTabs(noteId) {
        // Normalize ID to string for consistent comparison
        const normalizedId = String(noteId);
        
        // Check if tab already exists
        const existingTab = this.openTabs.find(tab => String(tab.noteId) === normalizedId);
        if (existingTab) {
            // Update tab title from currentNote if available
            if (this.currentNote && String(this.currentNote.id) === normalizedId) {
                existingTab.title = this.currentNote.title || 'Untitled';
            }
            this.setActiveTab(normalizedId);
            return;
        }

        // Check max tabs limit
        if (this.openTabs.length >= this.maxTabs) {
            // Close the oldest non-active tab that isn't unsaved
            const currentId = this.currentNote ? String(this.currentNote.id) : null;
            const tabToClose = this.openTabs.find(tab => 
                String(tab.noteId) !== currentId && !tab.unsaved
            );
            if (tabToClose) {
                this.closeTab(tabToClose.noteId, true);
            } else {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.maxTabsReached'), 'warning');
                return;
            }
        }

        // Get title from currentNote if it matches
        let title = 'Untitled';
        if (this.currentNote && String(this.currentNote.id) === normalizedId) {
            title = this.currentNote.title || 'Untitled';
        } else {
            // Try to find in notes array
            const note = this.notes.find(n => String(n.id) === normalizedId);
            if (note) {
                title = note.title || 'Untitled';
            }
        }

        // Add new tab with normalized ID and title
        this.openTabs.push({ noteId: normalizedId, title: title, unsaved: false });
        this.renderTabs();
        this.setActiveTab(normalizedId);
    }

    // Remove a note from tabs
    closeTab(noteId, silent = false) {
        const noteIdStr = String(noteId);
        const tabIndex = this.openTabs.findIndex(tab => String(tab.noteId) === noteIdStr);
        if (tabIndex === -1) return;

        const tab = this.openTabs[tabIndex];
        
        // If tab has unsaved changes and not silent, show confirmation
        if (tab.unsaved && !silent) {
            const noteName = tab.title || 'Untitled';
            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
            const confirmMessage = t('notes.tabCloseConfirm', { title: noteName });
            if (!confirm(confirmMessage)) {
                return;
            }
        }

        // Remove from openTabs array
        this.openTabs.splice(tabIndex, 1);

        // If we're closing the active tab, switch to another tab
        if (this.currentNote && String(this.currentNote.id) === noteIdStr) {
            if (this.openTabs.length > 0) {
                // Switch to the nearest tab
                const newIndex = Math.min(tabIndex, this.openTabs.length - 1);
                const newTab = this.openTabs[newIndex];
                this.switchToTab(newTab.noteId);
                return; // switchToTab will call renderTabs via displayNote
            } else {
                // No tabs left, show placeholder
                this.showNoNotePlaceholder();
            }
        }

        this.renderTabs();
    }

    // Set a tab as active
    setActiveTab(noteId) {
        this.renderTabs();
    }

    // Mark a tab as having unsaved changes
    markTabUnsaved(noteId, unsaved = true) {
        const noteIdStr = String(noteId);
        const tab = this.openTabs.find(tab => String(tab.noteId) === noteIdStr);
        if (tab && tab.unsaved !== unsaved) {
            tab.unsaved = unsaved;
            this.renderTabs();
        }
    }

    // Update tab title
    updateTabTitle(noteId, title) {
        const noteIdStr = String(noteId);
        const tab = this.openTabs.find(tab => String(tab.noteId) === noteIdStr);
        if (tab && tab.title !== title) {
            tab.title = title || 'Untitled';
            this.renderTabs();
        }
    }

    // Render all tabs
    renderTabs() {
        const tabsBar = document.getElementById('note-tabs-bar');
        const tabsContainer = document.getElementById('note-tabs-container');
        
        if (!tabsBar || !tabsContainer) return;

        // Show/hide tabs bar based on whether we have tabs
        if (this.openTabs.length > 0) {
            tabsBar.classList.add('has-tabs');
        } else {
            tabsBar.classList.remove('has-tabs');
            tabsContainer.innerHTML = '';
            return;
        }

        // Build tabs HTML
        let tabsHtml = '';
        this.openTabs.forEach(tab => {
            const tabIdStr = String(tab.noteId);
            const isActive = this.currentNote && String(this.currentNote.id) === tabIdStr;
            
            // For active tab, use currentNote title and update stored title
            // For inactive tabs, use stored title
            let title;
            if (isActive && this.currentNote) {
                title = this.currentNote.title || 'Untitled';
                // Update stored title
                tab.title = title;
            } else {
                // Use stored title from tab
                title = tab.title || 'Untitled';
            }
            
            const unsavedClass = tab.unsaved ? 'unsaved' : '';
            const activeClass = isActive ? 'active' : '';

            tabsHtml += `
                <div class="note-tab ${activeClass} ${unsavedClass}" data-note-id="${tab.noteId}">
                    <span class="note-tab-title" title="${this.escapeHtml(title)}">${this.escapeHtml(title)}</span>
                    <button class="note-tab-close" data-note-id="${tab.noteId}" title="Close tab">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        });

        tabsContainer.innerHTML = tabsHtml;

        // Add event listeners to tabs
        tabsContainer.querySelectorAll('.note-tab').forEach((tabEl, index) => {
            const noteId = tabEl.dataset.noteId;
            
            // Make tab draggable
            tabEl.setAttribute('draggable', 'true');
            
            // Click on tab to switch
            tabEl.addEventListener('click', (e) => {
                if (!e.target.closest('.note-tab-close')) {
                    this.switchToTab(noteId);
                }
            });

            // Middle click to close
            tabEl.addEventListener('auxclick', (e) => {
                if (e.button === 1) { // Middle click
                    e.preventDefault();
                    this.closeTab(noteId);
                }
            });
            
            // Drag start
            tabEl.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', noteId);
                tabEl.classList.add('dragging');
                this._draggedTabIndex = index;
            });
            
            // Drag end
            tabEl.addEventListener('dragend', () => {
                tabEl.classList.remove('dragging');
                // Clear all drag-over states
                tabsContainer.querySelectorAll('.note-tab').forEach(t => {
                    t.classList.remove('drag-over', 'drag-over-right');
                });
                this._draggedTabIndex = null;
            });
            
            // Drag over
            tabEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                if (this._draggedTabIndex === null || this._draggedTabIndex === index) return;
                
                // Determine if dropping before or after this tab
                const rect = tabEl.getBoundingClientRect();
                const midpoint = rect.left + rect.width / 2;
                
                // Clear previous states
                tabEl.classList.remove('drag-over', 'drag-over-right');
                
                if (e.clientX < midpoint) {
                    tabEl.classList.add('drag-over');
                } else {
                    tabEl.classList.add('drag-over-right');
                }
            });
            
            // Drag leave
            tabEl.addEventListener('dragleave', () => {
                tabEl.classList.remove('drag-over', 'drag-over-right');
            });
            
            // Drop
            tabEl.addEventListener('drop', (e) => {
                e.preventDefault();
                tabEl.classList.remove('drag-over', 'drag-over-right');
                
                if (this._draggedTabIndex === null || this._draggedTabIndex === index) return;
                
                // Determine drop position
                const rect = tabEl.getBoundingClientRect();
                const midpoint = rect.left + rect.width / 2;
                let targetIndex = e.clientX < midpoint ? index : index + 1;
                
                // Adjust if dragging from before the target
                if (this._draggedTabIndex < targetIndex) {
                    targetIndex--;
                }
                
                this.reorderTab(this._draggedTabIndex, targetIndex);
            });
        });

        // Add event listeners to close buttons
        tabsContainer.querySelectorAll('.note-tab-close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const noteId = closeBtn.dataset.noteId;
                this.closeTab(noteId);
            });
        });
    }
    
    // Reorder a tab from one position to another
    reorderTab(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        if (fromIndex < 0 || fromIndex >= this.openTabs.length) return;
        if (toIndex < 0 || toIndex >= this.openTabs.length) return;
        
        // Remove tab from old position and insert at new position
        const [movedTab] = this.openTabs.splice(fromIndex, 1);
        this.openTabs.splice(toIndex, 0, movedTab);
        
        this.renderTabs();
    }

    // Switch to a specific tab
    async switchToTab(noteId) {
        const noteIdStr = String(noteId);
        if (this.currentNote && String(this.currentNote.id) === noteIdStr) return;

        // Only save current note if there are unsaved changes
        if (this.currentNote && this.notesManager && this.notesManager.hasUnsavedChanges()) {
            await this.saveCurrentNote(true); // Pass true to indicate it's an auto-save (no notification)
        }

        // Try to find note in array first
        let note = this.notes.find(n => String(n.id) === noteIdStr);
        
        // If not found in array, try to fetch from database
        if (!note && this.notesManager && this.notesManager.db) {
            try {
                note = await this.notesManager.db.getNote(noteId);
            } catch (e) {
                console.warn('[switchToTab] Failed to get note from database:', e);
            }
        }
        
        if (note) {
            // Handle password-protected notes
            if (note.password_protected) {
                const cachedPassword = this.getCachedNotePassword(note.id);
                if (cachedPassword && note.encrypted_content && window.encryptionManager) {
                    // Try to decrypt with cached password
                    try {
                        const envelope = JSON.parse(note.encrypted_content);
                        const decrypted = window.encryptionManager.decryptData(envelope, cachedPassword);
                        note.content = decrypted.content || '';
                        this.displayNote(note);
                    } catch (e) {
                        console.warn('[switchToTab] Failed to decrypt with cached password:', e);
                        // Password might have changed, clear cache and prompt
                        this.clearCachedNotePassword(note.id);
                        await this.promptForNotePassword(note);
                    }
                } else {
                    // No cached password, prompt for it
                    await this.promptForNotePassword(note);
                }
            } else {
                this.displayNote(note);
            }
        } else {
            console.warn('[switchToTab] Note not found:', noteId);
            // Remove the tab if note doesn't exist
            this.closeTab(noteId, true);
        }
    }

    // Close all tabs except the current one
    closeOtherTabs() {
        const currentId = this.currentNote ? String(this.currentNote.id) : null;
        const tabsToClose = this.openTabs.filter(tab => String(tab.noteId) !== currentId);
        
        // Check for unsaved changes
        const unsavedTabs = tabsToClose.filter(tab => tab.unsaved);
        if (unsavedTabs.length > 0) {
            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
            const confirmMessage = t('notes.tabsCloseConfirm', { count: unsavedTabs.length });
            if (!confirm(confirmMessage)) {
                return;
            }
        }

        this.openTabs = this.openTabs.filter(tab => String(tab.noteId) === currentId);
        this.renderTabs();
    }

    // Close all tabs
    closeAllTabs() {
        const unsavedTabs = this.openTabs.filter(tab => tab.unsaved);
        if (unsavedTabs.length > 0) {
            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
            const confirmMessage = t('notes.tabsCloseConfirm', { count: unsavedTabs.length });
            if (!confirm(confirmMessage)) {
                return;
            }
        }

        this.openTabs = [];
        this.showNoNotePlaceholder();
        this.renderTabs();
    }

    // Initialize tabs event listeners (called during setup)
    initializeTabsEventListeners() {
        // Initial render
        this.renderTabs();
    }

    // Helper method to display tags in the note editor header
    displayNoteTags(note) {
        const tagsDisplay = document.getElementById('note-tags-display');
        const noteDate = document.getElementById('note-date');
        const noteInfo = document.querySelector('.note-info');

        // Defensive check: ensure required elements exist
        if (!tagsDisplay) {
            console.warn('[displayNoteTags] note-tags-display element not found');
            return;
        }

        if (!note.tags || note.tags.length === 0) {
            tagsDisplay.innerHTML = '';
            // Unwrap tags and date if they were wrapped
            const wrapper = document.querySelector('.tags-date-wrapper');
            if (wrapper && noteInfo) {
                // Move tagsDisplay back to noteInfo before removing wrapper
                if (tagsDisplay.parentElement === wrapper) {
                    noteInfo.appendChild(tagsDisplay);
                }
                // Move noteDate back to noteInfo before removing wrapper
                if (noteDate && noteDate.parentElement === wrapper) {
                    noteInfo.appendChild(noteDate);
                }
                wrapper.remove();
            }
            return;
        }

        let tagsHtml = '<div class="editor-note-tags">';
        note.tags.forEach(tagId => {
            const tagName = this.notesManager.getTagName(tagId);
            tagsHtml += `<span class="editor-note-tag">${this.escapeHtml(tagName)}</span>`;
        });
        tagsHtml += '</div>';

        tagsDisplay.innerHTML = tagsHtml;

        // Wrap tags and date in a flex container for inline layout when tags exist
        const existingWrapper = document.querySelector('.tags-date-wrapper');
        if (!existingWrapper && noteDate && noteInfo && noteDate.parentElement === noteInfo) {
            const wrapper = document.createElement('div');
            wrapper.className = 'tags-date-wrapper';
            noteInfo.insertBefore(wrapper, tagsDisplay.nextSibling);
            wrapper.appendChild(tagsDisplay);
            wrapper.appendChild(noteDate);
        }
    }

    // Helper method to escape HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Format date and time according to current language
     * @param {Date} date - Date object to format
     * @param {boolean} includeTime - Whether to include time
     * @returns {string} Formatted date string
     */
    formatLocalizedDateTime(date, includeTime = true) {
        if (!date) return '';
        
        const lang = window.i18n ? window.i18n.getLanguage() : 'en';
        const d = new Date(date);
        
        // Get date components
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        
        let dateStr, timeStr;
        
        switch (lang) {
            case 'id': // Indonesian: DD/MM/YYYY, 24-hour
                dateStr = `${day}/${month}/${year}`;
                if (includeTime) {
                    timeStr = `${String(hours).padStart(2, '0')}:${minutes}`;
                }
                break;
            case 'ja': // Japanese: YYYY/MM/DD, 24-hour
                dateStr = `${year}/${month}/${day}`;
                if (includeTime) {
                    timeStr = `${String(hours).padStart(2, '0')}:${minutes}`;
                }
                break;
            default: // English: MM/DD/YYYY, 12-hour with AM/PM
                dateStr = `${month}/${day}/${year}`;
                if (includeTime) {
                    const hours12 = hours % 12 || 12;
                    const ampm = hours >= 12 ? 'PM' : 'AM';
                    timeStr = `${hours12}:${minutes} ${ampm}`;
                }
                break;
        }
        
        return includeTime ? `${dateStr} ${timeStr}` : dateStr;
    }

    // Update note date display
    updateNoteDate() {
        if (!this.currentNote) return;

        const noteDateElement = document.getElementById('note-date');
        if (!noteDateElement) return;

        // Try to get the latest note data from database if available
        let modifiedDate;
        if (this.notesManager && this.notesManager.db && this.notesManager.db.initialized) {
            const latestNote = this.notesManager.db.getNote(this.currentNote.id);
            if (latestNote && latestNote.modified) {
                modifiedDate = new Date(latestNote.modified);
                // Update currentNote with latest modified date
                this.currentNote.modified = latestNote.modified;
            } else {
                modifiedDate = this.currentNote.modified ? new Date(this.currentNote.modified) : new Date();
            }
        } else {
            modifiedDate = this.currentNote.modified ? new Date(this.currentNote.modified) : new Date();
        }
        
        // Format the date according to current language
        const formattedDateTime = this.formatLocalizedDateTime(modifiedDate, true);
        const modifiedLabel = window.i18n ? window.i18n.t('editor.modified') : 'Modified';
        noteDateElement.textContent = `${modifiedLabel}: ${formattedDateTime}`;
    }

    // Start real-time date updates
    startNoteDateUpdates() {
        // Clear any existing interval
        this.stopNoteDateUpdates();

        // Update immediately
        this.updateNoteDate();

        // Update every 30 seconds to feel more real-time
        this.noteDateUpdateInterval = setInterval(() => {
            this.updateNoteDate();
        }, 30000);
    }

    // Stop real-time date updates
    stopNoteDateUpdates() {
        if (this.noteDateUpdateInterval) {
            clearInterval(this.noteDateUpdateInterval);
            this.noteDateUpdateInterval = null;
        }
    }

    // Show tag management dialog
    showTagManager() {
        if (!this.currentNote) {
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            this.showNotification(t('notifications.pleaseSelectNote', 'Please select a note first'), 'info');
            return;
        }

        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        const existingTags = this.currentNote.tags || [];
        const allTags = this.notesManager.db && this.notesManager.db.initialized ?
            this.notesManager.db.getAllTags() : [];

        // Create modal HTML
        const modalHtml = `
            <div id="tag-manager-modal" class="modal">
                <div class="modal-content tag-manager-content">
                    <div class="modal-header">
                        <h3>${t('editor.manageTags', 'Manage Tags')}</h3>
                        <button id="tag-manager-close" class="modal-close"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <div class="tag-manager-section">
                            <h4>${t('tags.currentTags', 'Current Tags')}</h4>
                            <div id="current-tags" class="current-tags">
                                ${existingTags.length > 0 ?
                                    existingTags.map(tagId => {
                                        const tagName = this.notesManager.getTagName(tagId);
                                        return `<span class="tag-item" data-tag-id="${tagId}">
                                            ${this.escapeHtml(tagName)}
                                            <button class="tag-remove" data-tag-id="${tagId}">×</button>
                                        </span>`;
                                    }).join('') :
                                    `<span class="no-tags">${t('tags.noTagsAssigned', 'No tags assigned')}</span>`
                                }
                            </div>
                        </div>
                        <div class="tag-manager-section">
                            <h4>${t('tags.addTags', 'Add Tags')}</h4>
                            <div class="tag-input-section">
                                <input type="text" id="new-tag-input" placeholder="${t('tags.enterTagName', 'Enter tag name...')}" class="tag-input">
                                <button id="add-tag-btn" class="btn-primary">${t('tags.addTag', 'Add Tag')}</button>
                            </div>
                            <div class="available-tags">
                                <h5>${t('tags.availableTags', 'Available Tags')}</h5>
                                <div id="available-tags-list" class="available-tags-list">
                                    ${allTags.filter(tag => !existingTags.includes(tag.id)).map(tag =>
                                        `<span class="available-tag" data-tag-id="${tag.id}">
                                            ${this.escapeHtml(tag.name)}
                                        </span>`
                                    ).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Set up event listeners
        this.setupTagManagerEvents();
    }

    // Set up tag manager event listeners
    setupTagManagerEvents() {
        const modal = document.getElementById('tag-manager-modal');
        const closeBtn = document.getElementById('tag-manager-close');
        const addBtn = document.getElementById('add-tag-btn');
        const tagInput = document.getElementById('new-tag-input');

        // Close modal
        closeBtn.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Add new tag
        addBtn.addEventListener('click', () => this.addNewTag());
        tagInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addNewTag();
        });

        // Remove tag
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-remove')) {
                const tagId = e.target.dataset.tagId;
                this.removeTagFromNote(tagId);
            }
        });

        // Add existing tag
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('available-tag')) {
                const tagId = e.target.dataset.tagId;
                this.addTagToNote(tagId);
            }
        });
    }

    // Add a new tag to the note
    async addNewTag() {
        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        const input = document.getElementById('new-tag-input');
        const tagName = input.value.trim();

        if (!tagName) {
            this.showNotification(t('notifications.pleaseEnterTagName', 'Please enter a tag name'), 'warning');
            return;
        }

        try {
            // Check if tag already exists
            let existingTag = null;
            if (this.notesManager.db && this.notesManager.db.initialized) {
                const allTags = this.notesManager.db.getAllTags();
                existingTag = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
            }

            let tagId;
            if (existingTag) {
                tagId = existingTag.id;
            } else {
                // Create new tag
                if (this.notesManager.db && this.notesManager.db.initialized) {
                    tagId = this.notesManager.db.createTag({ name: tagName });
                } else {
                    // Fallback: create tag ID and save tag definition
                    tagId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

                    // Initialize fallback tag data structure if needed
                    if (this.notesManager.db) {
                        this.notesManager.db.data = this.notesManager.db.data || {};
                        this.notesManager.db.data.tags = this.notesManager.db.data.tags || {};
                        this.notesManager.db.data.note_tags = this.notesManager.db.data.note_tags || {};

                        // Save tag definition
                        this.notesManager.db.data.tags[tagId] = {
                            id: tagId,
                            name: tagName,
                            color: '#BDABE3',
                            created_at: new Date().toISOString()
                        };
                    }
                }
            }

            await this.addTagToNote(tagId);
            input.value = '';
            
            // Refresh folder navigation to show new tag
            await this.renderTagFolders();

        } catch (error) {
            console.error('Error adding tag:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('tags.addTagFailed'), 'error');
        }
    }

    // Add existing tag to note
    async addTagToNote(tagId) {
        if (!this.currentNote) return;

        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        const currentTags = this.currentNote.tags || [];
        if (currentTags.length >= 3) {
            this.showNotification(t('tags.maxTagsReached', 'Maximum 3 tags per note reached'), 'warning');
            return;
        }

        const updatedTags = [...currentTags, tagId];

        try {
            if (this.notesManager.db && this.notesManager.db.initialized) {
                await this.notesManager.db.updateNote(this.currentNote.id, { tags: updatedTags });
                this.currentNote = await this.notesManager.db.getNote(this.currentNote.id);
            } else {
                this.currentNote.tags = updatedTags;

                // Also update note_tags relationship in fallback mode
                if (this.notesManager.db) {
                    this.notesManager.db.data = this.notesManager.db.data || {};
                    this.notesManager.db.data.note_tags = this.notesManager.db.data.note_tags || {};

                    const noteTagKey = `${this.currentNote.id}_${tagId}`;
                    this.notesManager.db.data.note_tags[noteTagKey] = {
                        note_id: this.currentNote.id,
                        tag_id: tagId
                    };
                }

                this.saveNotes();
            }

            // Update UI
            this.displayNoteTags(this.currentNote);
            await this.notesManager.renderNotesList('', this.currentFolder);

            // Refresh the tag manager and folder navigation
            this.refreshTagManager();
            await this.renderTagFolders();

            this.showNotification(t('notifications.tagAdded', 'Tag added successfully'), 'success');
        } catch (error) {
            console.error('Error adding tag to note:', error);
            this.showNotification(t('tags.addTagFailed', 'Failed to add tag'), 'error');
        }
    }

    // Remove tag from note
    async removeTagFromNote(tagId) {
        if (!this.currentNote) return;

        const updatedTags = (this.currentNote.tags || []).filter(id => id !== tagId);

        try {
            if (this.notesManager.db && this.notesManager.db.initialized) {
                await this.notesManager.db.updateNote(this.currentNote.id, { tags: updatedTags });
                this.currentNote = await this.notesManager.db.getNote(this.currentNote.id);
            } else {
                this.currentNote.tags = updatedTags;

                // Also remove note_tags relationship in fallback mode
                if (this.notesManager.db && this.notesManager.db.data && this.notesManager.db.data.note_tags) {
                    const noteTagKey = `${this.currentNote.id}_${tagId}`;
                    delete this.notesManager.db.data.note_tags[noteTagKey];
                }

                this.saveNotes();
            }

            // Update UI
            this.displayNoteTags(this.currentNote);
            await this.notesManager.renderNotesList('', this.currentFolder);

            // Refresh the tag manager and folder navigation
            this.refreshTagManager();
            await this.renderTagFolders();

            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.tagRemoved'), 'success');
        } catch (error) {
            console.error('Error removing tag from note:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.tagRemoveFailed'), 'error');
        }
    }

    // Refresh the tag manager UI
    refreshTagManager() {
        const modal = document.getElementById('tag-manager-modal');
        if (!modal) return;

        const existingTags = this.currentNote.tags || [];
        const allTags = this.notesManager.db && this.notesManager.db.initialized ?
            this.notesManager.db.getAllTags() : [];

        // Update current tags
        const currentTagsEl = document.getElementById('current-tags');
        currentTagsEl.innerHTML = existingTags.length > 0 ?
            existingTags.map(tagId => {
                const tagName = this.notesManager.getTagName(tagId);
                return `<span class="tag-item" data-tag-id="${tagId}">
                    ${this.escapeHtml(tagName)}
                    <button class="tag-remove" data-tag-id="${tagId}">×</button>
                </span>`;
            }).join('') :
            '<span class="no-tags">No tags assigned</span>';

        // Update available tags
        const availableTagsEl = document.getElementById('available-tags-list');
        availableTagsEl.innerHTML = allTags.filter(tag => !existingTags.includes(tag.id)).map(tag =>
            `<span class="available-tag" data-tag-id="${tag.id}">
                ${this.escapeHtml(tag.name)}
            </span>`
        ).join('');
    }

	async saveCurrentNote(isAutoSave = false) {
        if (!this.currentNote || !this.notesManager) return;

        // Flush any pending debounced history before saving
        if (this.historyDebounceTimer) {
            clearTimeout(this.historyDebounceTimer);
            this.historyDebounceTimer = null;
            const editor = document.getElementById('note-editor');
            if (editor && !this.ignoreHistoryUpdate) {
                const cursorPos = editor.selectionStart;
                this.historyManager.pushState(editor.value, cursorPos, cursorPos, cursorPos);
            }
        }

        const title = document.getElementById('note-title').value.trim();
        const content = document.getElementById('note-editor').value;

        try {
			const untitledTitle = window.i18n ? window.i18n.t('editor.untitledNoteTitle') : 'Untitled Note';
			let updateData = {
				title: title || untitledTitle,
				content: content,
				preview: this.generatePreview(content)
			};

			// If note is protected, encrypt content and avoid persisting plaintext
			if (this.currentNote.password_protected) {
				if (!window.encryptionManager) {
					throw new Error('Encryption manager not available');
				}
				const cached = this.getCachedNotePassword(this.currentNote.id);
				if (!cached) {
					// For auto-save without password, skip encrypting to avoid prompts
					if (isAutoSave) {
						return; // silently skip auto-save to prevent plaintext leak
					}
					const ok = await this.promptForNotePassword(this.currentNote);
					if (!ok) return;
				}
				const pass = this.getCachedNotePassword(this.currentNote.id);
				const envelope = window.encryptionManager.encryptData({ content }, pass);
				const untitledTitle = window.i18n ? window.i18n.t('editor.untitledNoteTitle') : 'Untitled Note';
				updateData = {
					title: title || untitledTitle,
					content: '',
					preview: '',
					encrypted_content: JSON.stringify(envelope)
				};
			}

            if (this.notesManager.db && this.notesManager.db.initialized) {
                await this.notesManager.db.updateNote(this.currentNote.id, updateData);
				// Refresh the current note data
				const updatedFromDb = await this.notesManager.db.getNote(this.currentNote.id);
				// Preserve decrypted content in memory for protected notes
				if (updatedFromDb && this.currentNote.password_protected) {
					const plaintext = content;
					this.currentNote = { ...updatedFromDb, content: plaintext };
				} else {
					this.currentNote = updatedFromDb;
				}
            } else {
                // Fallback to localStorage
                this.currentNote.title = updateData.title;
                this.currentNote.content = updateData.content;
                this.currentNote.modified = new Date();
                this.currentNote.preview = updateData.preview;
                this.saveNotes();
            }

            // Preserve current search and folder filters when refreshing the list
            const searchInput = document.getElementById('search-input');
            const searchQuery = searchInput ? (searchInput.value || '') : '';
            await this.notesManager.renderNotesList(searchQuery, this.currentFolder);

            // Update note date display after saving
            this.updateNoteDate();

            // After saving, recompute local checksum and update UI readiness if remote differs
            try {
                if (this.notesManager && this.notesManager.db) {
                    const exportResult = this.notesManager.db.exportDataForSync();
                    // Keep last known local checksum in syncStatus for comparison
                    this.syncStatus = this.syncStatus || {};
                    this.syncStatus.localChecksum = exportResult.checksum;
                    // If remoteChecksum known and differs, reflect "Ready to sync"
                    if (this.syncStatus.remoteChecksum && this.syncStatus.localChecksum !== this.syncStatus.remoteChecksum) {
                        // Force re-render of sync UI with readiness state
                        this.updateSyncUI();
                    }
                }
            } catch (e) {
                console.warn('[Sync] Failed to update local checksum after save:', e.message);
            }

            // Only show notification for manual saves, not auto-saves
            if (!isAutoSave) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.noteSavedSuccess'));
            }

            // Clear unsaved flag on tab
            if (this.currentNote) {
                this.markTabUnsaved(this.currentNote.id, false);
            }

            // Auto-update shared notes on Google Drive
            if (this.currentNote.collaboration?.is_shared && 
                this.currentNote.collaboration?.google_drive_file_id) {
                this.updateSharedNoteOnDrive(this.currentNote).catch(error => {
                    console.error('[Google Drive] Failed to auto-update shared note:', error);
                    // Don't show notification for auto-update failures to avoid spam
                });
            }
        } catch (error) {
            console.error('Error saving note:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.saveFailed'), 'error');
        }
    }

    async updateSharedNoteOnDrive(note) {
        // Silent update of shared note on Google Drive
        try {
            if (!this.backendAPI) return;
            
            // Check if Google Drive is authenticated
            const syncStatus = await this.backendAPI.getGoogleDriveSyncStatus();
            if (!syncStatus || !syncStatus.isAuthenticated) {
                return; // Silently skip if not authenticated
            }

            // Update the shared note
            await this.backendAPI.shareNoteOnGoogleDrive(
                note,
                { view: true, comment: false, edit: false }, // Maintain existing permissions
                null // No email, just update existing share
            );
            
            console.log('[Google Drive] Shared note auto-updated:', note.title);
        } catch (error) {
            console.error('[Google Drive] Failed to auto-update shared note:', error);
            // Don't throw, just log the error
        }
    }

    async renderNotesList() {
        if (this.notesManager) {
            const searchInput = document.getElementById('search-input');
            const searchQuery = searchInput ? (searchInput.value || '') : '';
            await this.notesManager.renderNotesList(searchQuery, this.currentFolder);
        }
    }

    generatePreview(content) {
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        if (!content || !content.trim()) return t('notes.emptyNote');

        // Split content into lines
        const lines = content.split('\n');
        
        for (let line of lines) {
            line = line.trim();
            
            // Skip empty lines
            if (!line) continue;
            
            // Skip image markdown: ![alt](url) or ![alt][ref]
            if (/^!\[.*?\](\(.*?\)|\[.*?\])/.test(line)) continue;
            
            // Skip HTML image tags: <img src="..." />
            if (/^<img\s+.*?>/.test(line)) continue;
            
            // Skip standalone HTML tags without content
            if (/^<[^>]+>$/.test(line)) continue;
            
            // Skip video/audio markdown embeds
            if (/^<(video|audio|iframe)\s+.*?>/.test(line)) continue;
            
            // Clean the line for preview
            let preview = line;
            
            // Remove markdown headers (# ## ### etc)
            preview = preview.replace(/^#+\s*/, '');
            
            // Remove HTML tags but keep content
            preview = preview.replace(/<[^>]+>/g, '');
            
            // Convert markdown links [text](url) to just text
            preview = preview.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
            
            // Convert markdown bold/italic to plain text
            preview = preview.replace(/\*\*([^\*]+)\*\*/g, '$1'); // bold
            preview = preview.replace(/\*([^\*]+)\*/g, '$1'); // italic
            preview = preview.replace(/__([^_]+)__/g, '$1'); // bold
            preview = preview.replace(/_([^_]+)_/g, '$1'); // italic
            
            // Remove inline code backticks
            preview = preview.replace(/`([^`]+)`/g, '$1');
            
            // Remove remaining markdown image syntax if any
            preview = preview.replace(/!\[.*?\]\(.*?\)/g, '');
            
            // Clean up extra whitespace
            preview = preview.trim();
            
            // If we have actual content after cleaning, use it
            if (preview) {
                return preview.length > 100 ? preview.substring(0, 100) + '...' : preview;
            }
        }
        
        // If no meaningful content found, return fallback
        return t('notes.emptyNote');
    }

    updateNotePreview() {
        if (this.currentNote) {
            const content = document.getElementById('note-editor').value;
            this.currentNote.preview = this.generatePreview(content);
        }
    }

    updateNoteTitle() {
        if (this.currentNote) {
            const untitledTitle = window.i18n ? window.i18n.t('editor.untitledNoteTitle') : 'Untitled Note';
            this.currentNote.title = document.getElementById('note-title').value || untitledTitle;
        }
    }

    // Search functionality
    async searchNotes(query = '') {
        if (this.notesManager) {
            await this.notesManager.renderNotesList(query, this.currentFolder);
        }
    }

    // Folder/Category Navigation
    setupFolderNavigation() {
        const foldersContainer = document.getElementById('sidebar-folders');
        if (!foldersContainer) return;

        // Handle folder item clicks (All Notes, Untagged)
        foldersContainer.addEventListener('click', async (e) => {
            const folderItem = e.target.closest('.folder-item');
            const tagFolderItem = e.target.closest('.tag-folder-item');
            const createFolderBtn = e.target.closest('#create-folder-btn');

            if (createFolderBtn) {
                this.showCreateTagDialog();
                return;
            }

            if (folderItem) {
                const folder = folderItem.dataset.folder;
                await this.switchFolder(folder);
            } else if (tagFolderItem) {
                const tagId = tagFolderItem.dataset.tagId;
                await this.switchFolder(tagId);
            }
        });

        // Right-click context menu for tag folders
        foldersContainer.addEventListener('contextmenu', (e) => {
            const tagFolderItem = e.target.closest('.tag-folder-item');
            if (tagFolderItem) {
                e.preventDefault();
                const tagId = tagFolderItem.dataset.tagId;
                this.showTagFolderContextMenu(tagId, e.clientX, e.clientY);
            }
        });

        // Setup tags list toggle (collapsible)
        this.setupTagsListToggle();

        // Set initial active state based on saved folder
        this.updateFolderActiveState();

        // Render tag folders on load
        this.renderTagFolders();
    }

    // Setup collapsible tags list toggle
    setupTagsListToggle() {
        const toggleBtn = document.getElementById('tags-toggle-btn');
        const tagFoldersList = document.getElementById('tag-folders-list');
        const tagsDivider = document.getElementById('tags-divider');
        
        if (!toggleBtn || !tagFoldersList) return;

        // Restore collapsed state from localStorage
        const isCollapsed = localStorage.getItem('tagsListCollapsed') === 'true';
        if (isCollapsed) {
            toggleBtn.classList.add('collapsed');
            tagFoldersList.classList.add('collapsed');
        }

        // Toggle button click
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleTagsList();
        });

        // Also allow clicking the "Tags" text to toggle
        tagsDivider.addEventListener('click', (e) => {
            // Don't toggle if clicking on the create button
            if (e.target.closest('#create-folder-btn')) return;
            this.toggleTagsList();
        });
    }

    toggleTagsList() {
        const toggleBtn = document.getElementById('tags-toggle-btn');
        const tagFoldersList = document.getElementById('tag-folders-list');
        
        if (!toggleBtn || !tagFoldersList) return;

        const isCollapsed = toggleBtn.classList.toggle('collapsed');
        tagFoldersList.classList.toggle('collapsed', isCollapsed);
        
        // Save state to localStorage
        localStorage.setItem('tagsListCollapsed', isCollapsed.toString());
    }

    // Update folder active state in UI
    updateFolderActiveState() {
        document.querySelectorAll('.folder-item, .tag-folder-item').forEach(item => {
            item.classList.remove('active');
        });

        const activeItem = document.querySelector(`.folder-item[data-folder="${this.currentFolder}"]`) ||
                          document.querySelector(`.tag-folder-item[data-tag-id="${this.currentFolder}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        } else {
            // If saved folder no longer exists (e.g., deleted tag), default to "all"
            this.currentFolder = 'all';
            localStorage.setItem('currentFolder', 'all');
            const allItem = document.querySelector('.folder-item[data-folder="all"]');
            if (allItem) allItem.classList.add('active');
        }
    }

    async switchFolder(folder) {
        this.currentFolder = folder;
        
        // Save to localStorage for persistence
        localStorage.setItem('currentFolder', folder);

        // Update active state in UI
        document.querySelectorAll('.folder-item, .tag-folder-item').forEach(item => {
            item.classList.remove('active');
        });

        const activeItem = document.querySelector(`.folder-item[data-folder="${folder}"]`) ||
                          document.querySelector(`.tag-folder-item[data-tag-id="${folder}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }

        // Re-render notes list with folder filter
        const searchQuery = document.getElementById('search-input').value || '';
        if (this.notesManager) {
            await this.notesManager.renderNotesList(searchQuery, folder);
        }

        // Close mobile sidebar after selecting folder
        if (window.innerWidth <= 768 && this.uiManager) {
            this.uiManager.closeMobileSidebar();
        }
    }

    async renderTagFolders() {
        const tagFoldersList = document.getElementById('tag-folders-list');
        if (!tagFoldersList) return;

        try {
            let tags = [];
            if (this.notesManager && this.notesManager.db && this.notesManager.db.initialized) {
                tags = this.notesManager.db.getAllTags();
            }

            if (tags.length === 0) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                tagFoldersList.innerHTML = `<div class="tag-folders-empty">${t('tags.noTagsCreated')}</div>`;
                return;
            }

            // Get note counts for each tag
            let allNotes = [];
            if (this.notesManager && this.notesManager.db && this.notesManager.db.initialized) {
                allNotes = await this.notesManager.db.getAllNotes();
            }

            const tagCounts = {};
            allNotes.forEach(note => {
                if (note.tags && note.tags.length > 0) {
                    note.tags.forEach(tagId => {
                        tagCounts[tagId] = (tagCounts[tagId] || 0) + 1;
                    });
                }
            });

            tagFoldersList.innerHTML = tags.map(tag => {
                const count = tagCounts[tag.id] || 0;
                const isActive = this.currentFolder === tag.id;
                return `
                    <div class="tag-folder-item${isActive ? ' active' : ''}" data-tag-id="${tag.id}">
                        <div class="tag-folder-color" style="background: ${tag.color || '#BDABE3'}"></div>
                        <span class="tag-folder-name">${this.escapeHtml(tag.name)}</span>
                        <span class="tag-folder-count">${count}</span>
                    </div>
                `;
            }).join('');

            // Update main folder counts
            if (this.notesManager) {
                this.notesManager.updateFolderCounts();
            }
            
            // Ensure active state is properly set (handles case where saved folder was a tag)
            this.updateFolderActiveState();
        } catch (error) {
            console.error('Error rendering tag folders:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            tagFoldersList.innerHTML = `<div class="tag-folders-empty">${t('tags.errorLoadingTags')}</div>`;
        }
    }

    showCreateTagDialog() {
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        const content = `
            <div class="create-tag-form">
                <div class="form-group" style="margin-bottom: 16px;">
                    <label for="new-folder-tag-name" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('tags.tagName')}</label>
                    <input type="text" id="new-folder-tag-name" placeholder="${t('placeholder.enterTagName')}" 
                           class="filter-input" style="width: 100%; padding: 10px 12px; border-radius: 6px;">
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500;">Tag Color</label>
                    <div class="color-options" style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="color-option active" data-color="#BDABE3" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #BDABE3; cursor: pointer;"></button>
                        <button class="color-option" data-color="#3ECF8E" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #3ECF8E; cursor: pointer;"></button>
                        <button class="color-option" data-color="#F59E0B" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #F59E0B; cursor: pointer;"></button>
                        <button class="color-option" data-color="#EF4444" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #EF4444; cursor: pointer;"></button>
                        <button class="color-option" data-color="#3B82F6" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #3B82F6; cursor: pointer;"></button>
                        <button class="color-option" data-color="#8B5CF6" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #8B5CF6; cursor: pointer;"></button>
                        <button class="color-option" data-color="#EC4899" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #EC4899; cursor: pointer;"></button>
                        <button class="color-option" data-color="#06B6D4" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #06B6D4; cursor: pointer;"></button>
                    </div>
                </div>
            </div>
        `;

        const modal = this.createModal(t('modals.createNewTag'), content, [
            { text: t('modals.create'), type: 'primary', action: 'create', callback: () => this.createTagFromDialog() },
            { text: t('modals.cancel'), type: 'secondary', action: 'cancel' }
        ]);

        // Setup color selection
        const colorOptions = modal.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.preventDefault();
                colorOptions.forEach(o => {
                    o.classList.remove('active');
                    o.style.borderColor = 'transparent';
                });
                option.classList.add('active');
                option.style.borderColor = 'var(--text-primary)';
            });
        });

        // Focus the input
        setTimeout(() => {
            const input = document.getElementById('new-folder-tag-name');
            if (input) input.focus();
        }, 100);

        // Handle Enter key to create
        const input = document.getElementById('new-folder-tag-name');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.createTagFromDialog();
                    modal.remove();
                }
            });
        }
    }

    async createTagFromDialog() {
        const nameInput = document.getElementById('new-folder-tag-name');
        const selectedColor = document.querySelector('.color-option.active');

        if (!nameInput || !nameInput.value.trim()) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.pleaseEnterTagName'), 'error');
            return;
        }

        const tagName = nameInput.value.trim();
        const tagColor = selectedColor ? selectedColor.dataset.color : '#BDABE3';

        try {
            if (this.notesManager && this.notesManager.db && this.notesManager.db.initialized) {
                // Check if tag with same name exists
                const existingTags = this.notesManager.db.getAllTags();
                if (existingTags.some(t => t.name.toLowerCase() === tagName.toLowerCase())) {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(t('notifications.tagAlreadyExists'), 'warning');
                    return;
                }

                this.notesManager.db.createTag({ name: tagName, color: tagColor });
                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                this.showNotification(t('notifications.tagAdded'), 'success');
                await this.renderTagFolders();
            } else {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.databaseNotAvailable'), 'error');
            }
        } catch (error) {
            console.error('Error creating tag:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.failedToCreateTag'), 'error');
        }
    }

    showTagFolderContextMenu(tagId, x, y) {
        // Remove existing context menu
        const existingMenu = document.querySelector('.tag-folder-context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'tag-folder-context-menu context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            z-index: 1000;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            padding: 4px;
            min-width: 150px;
        `;

        menu.innerHTML = `
            <div class="context-menu-item" data-action="rename"><i class="fas fa-edit"></i> Rename</div>
            <div class="context-menu-item" data-action="delete" style="color: #dc3545;"><i class="fas fa-trash"></i> Delete</div>
        `;

        document.body.appendChild(menu);

        // Handle menu item clicks
        menu.addEventListener('click', async (e) => {
            const action = e.target.closest('.context-menu-item')?.dataset.action;
            if (action === 'rename') {
                await this.renameTagFolder(tagId);
            } else if (action === 'delete') {
                await this.deleteTagFolder(tagId);
            }
            menu.remove();
        });

        // Close on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    async renameTagFolder(tagId) {
        if (!this.notesManager || !this.notesManager.db) return;

        const tag = this.notesManager.db.data.tags[tagId];
        if (!tag) return;

        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        const promptText = t('tags.enterTagNamePrompt');
        const newName = prompt(promptText, tag.name);
        if (!newName || newName.trim() === '' || newName.trim() === tag.name) return;

        try {
            this.notesManager.db.data.tags[tagId].name = newName.trim();
            this.notesManager.db.saveToLocalStorage();
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.tagAdded'), 'success');
            await this.renderTagFolders();
            await this.notesManager.renderNotesList('', this.currentFolder);
        } catch (error) {
            console.error('Error renaming tag:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.failedToRenameTag'), 'error');
        }
    }

    async deleteTagFolder(tagId) {
        if (!this.notesManager || !this.notesManager.db) return;

        const tag = this.notesManager.db.data.tags[tagId];
        if (!tag) return;

        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        const confirmText = t('tags.deleteTagConfirm', { name: tag.name });
        const confirmDelete = confirm(confirmText);
        if (!confirmDelete) return;

        try {
            // Remove tag from all notes
            const notes = await this.notesManager.db.getAllNotes();
            for (const note of notes) {
                if (note.tags && note.tags.includes(tagId)) {
                    const updatedTags = note.tags.filter(t => t !== tagId);
                    await this.notesManager.db.updateNote(note.id, { tags: updatedTags });
                }
            }

            // Delete the tag itself
            delete this.notesManager.db.data.tags[tagId];

            // Remove from note_tags associations
            const noteTagsToDelete = [];
            Object.keys(this.notesManager.db.data.note_tags || {}).forEach(key => {
                if (this.notesManager.db.data.note_tags[key].tag_id === tagId) {
                    noteTagsToDelete.push(key);
                }
            });
            noteTagsToDelete.forEach(key => {
                delete this.notesManager.db.data.note_tags[key];
            });

            this.notesManager.db.saveToLocalStorage();

            // If we were viewing this tag, switch back to all notes
            if (this.currentFolder === tagId) {
                await this.switchFolder('all');
            }

            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
            this.showNotification(t('notifications.tagDeleted', { name: tag.name }), 'success');
            await this.renderTagFolders();
            await this.notesManager.renderNotesList('', this.currentFolder);

            // Update current note's tag display if open
            if (this.currentNote) {
                this.displayNoteTags(this.currentNote);
            }
        } catch (error) {
            console.error('Error deleting tag:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.failedToDeleteTag'), 'error');
        }
    }

    // Fallback methods for localStorage
    saveNotes() {
        try {
            // Ensure we have a valid notes array before saving
            if (!Array.isArray(this.notes)) {
                console.warn('Notes array is not valid, resetting to empty array');
                this.notes = [];
            }

            // Save notes to localStorage
            localStorage.setItem('notes', JSON.stringify(this.notes));
            console.log(`[DEBUG] Saved ${this.notes.length} notes to localStorage`);

            // Also save tag data if available (for fallback compatibility)
            if (this.notesManager && this.notesManager.db && this.notesManager.db.data) {
                const tagData = {
                    tags: this.notesManager.db.data.tags || {},
                    note_tags: this.notesManager.db.data.note_tags || {}
                };
                localStorage.setItem('cognotez_fallback_tags', JSON.stringify(tagData));
                console.log(`[DEBUG] Saved tag data to localStorage fallback`);
            }
        } catch (error) {
            console.error('Error saving notes to localStorage:', error);
            // Try to save with error handling
            try {
                localStorage.setItem('notes', '[]');
                console.warn('Reset localStorage to empty array due to save error');
            } catch (fallbackError) {
                console.error('Critical error: Cannot save to localStorage at all:', fallbackError);
            }
        }
    }

    // Legacy renderNotesList for localStorage fallback
    renderNotesList(notes = null) {
        const notesToRender = notes || this.notes;
        const notesListElement = document.getElementById('notes-list');
        notesListElement.innerHTML = '';

        if (notesToRender.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--text-tertiary);">
                    <div style="font-size: 48px; margin-bottom: 16px;"><i class="fas fa-sticky-note"></i></div>
                    <div style="font-size: 16px; margin-bottom: 8px;">No notes yet</div>
                    <div style="font-size: 14px;">Click the + button to create your first note</div>
                </div>
            `;
            notesListElement.appendChild(emptyState);
            return;
        }

        notesToRender.forEach(note => {
            const element = document.createElement('div');
            element.className = 'note-item';
            element.dataset.id = note.id;

            if (this.currentNote && this.currentNote.id === note.id) {
                element.classList.add('active');
            }

            element.innerHTML = `
                <div class="note-item-title">${this.escapeHtml(note.title)}</div>
                <div class="note-item-preview">${this.escapeHtml(note.preview || '')}</div>
                <div class="note-item-date">${this.formatLocalizedDateTime(note.modified || note.created, false)}</div>
            `;

            element.addEventListener('click', () => this.switchToNoteWithWarning(note.id));
            notesListElement.appendChild(element);
        });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Modal creation utility
    createModal(title, content, buttons = []) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close">×</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                ${buttons.length > 0 ? `
                    <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color); display: flex; gap: 12px; justify-content: flex-end;">
                        ${buttons.map(btn => `<button class="btn-${btn.type || 'secondary'}" data-action="${btn.action}">${btn.text}</button>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        const closeBtn = modal.querySelector('.modal-close');
        closeBtn.addEventListener('click', () => this.closeModal(modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });

        // Button actions
        buttons.forEach(btn => {
            const btnElement = modal.querySelector(`[data-action="${btn.action}"]`);
            if (btnElement) {
                btnElement.addEventListener('click', () => {
                    if (btn.callback) btn.callback();
                    this.closeModal(modal);
                });
            }
        });

        return modal;
    }

    closeModal(modal) {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    }

    closeAllModals() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        });
    }

    // Show confirmation dialog (replaces native confirm())
    showConfirmation(title, message) {
        return new Promise((resolve) => {
            const content = `
                <div style="padding: 10px 0;">
                    <p style="margin: 0; color: var(--text-primary); white-space: pre-line;">
                        ${this.escapeHtml(message)}
                    </p>
                </div>
            `;

            const modal = this.createModal(title, content, [
                { text: 'Cancel', type: 'secondary', action: 'cancel', callback: () => resolve(false) },
                { text: 'Confirm', type: 'primary', action: 'confirm', callback: () => resolve(true) }
            ]);

            // Also handle clicking outside or pressing Escape
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    resolve(false);
                }
            });

            // Handle escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleEscape);
                    resolve(false);
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }

    // Show input prompt dialog (replaces native prompt())
    showInputPrompt(title, message, defaultValue = '', placeholder = '') {
        return new Promise((resolve) => {
            const inputId = 'prompt-input-' + Date.now();
            const content = `
                <div style="padding: 10px 0;">
                    ${message ? `<p style="margin: 0 0 16px 0; color: var(--text-primary);">${this.escapeHtml(message)}</p>` : ''}
                    <input type="text" 
                           id="${inputId}" 
                           class="ai-dialog-input" 
                           placeholder="${this.escapeHtml(placeholder)}" 
                           value="${this.escapeHtml(defaultValue)}"
                           style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-size: 14px;">
                </div>
            `;

            const modal = this.createModal(title, content, [
                { text: 'Cancel', type: 'secondary', action: 'cancel', callback: () => resolve(null) },
                { text: 'OK', type: 'primary', action: 'confirm', callback: () => {
                    const input = modal.querySelector(`#${inputId}`);
                    resolve(input ? input.value.trim() : null);
                }}
            ]);

            // Focus input on mount
            setTimeout(() => {
                const input = modal.querySelector(`#${inputId}`);
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 100);

            // Handle Enter key
            const handleEnter = (e) => {
                if (e.key === 'Enter') {
                    const input = modal.querySelector(`#${inputId}`);
                    const okBtn = modal.querySelector('[data-action="confirm"]');
                    if (okBtn && input) {
                        e.preventDefault();
                        okBtn.click();
                    }
                }
            };
            modal.addEventListener('keydown', handleEnter);

            // Also handle clicking outside or pressing Escape
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    resolve(null);
                }
            });

            // Handle escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleEscape);
                    resolve(null);
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }

    // Show About dialog
    async showAboutDialog() {
        try {
            const version = await ipcRenderer.invoke('get-app-version');
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            const content = `
                <div style="padding: 20px 0; text-align: center;">
                    <div style="margin-bottom: 24px;">
                        <h2 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 24px; font-weight: 600;">
                            CogNotez
                        </h2>
                        <p style="margin: 0; color: var(--text-secondary); font-size: 16px;">
                            ${t('about.subtitle', 'AI-Powered Note App')}
                        </p>
                    </div>
                    <div style="margin-bottom: 24px; padding: 16px; background: var(--bg-secondary, rgba(128, 128, 128, 0.1)); border-radius: 8px;">
                        <p style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 14px;">
                            <strong>${t('about.versionLabel', 'Version:')}</strong> ${this.escapeHtml(version)}
                        </p>
                        <p style="margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6;">
                            ${t('about.descriptionLine1', 'An offline-first note-taking application')}<br>
                            ${t('about.descriptionLine2', 'with local LLM integration.')}
                        </p>
                    </div>
                    <div style="margin-top: 20px; color: var(--text-secondary); font-size: 12px;">
                        <p style="margin: 0;">© 2025 KayfaHaarukku/nawka12</p>
                    </div>
                </div>
            `;

            this.createModal(t('about.title', 'About CogNotez'), content, [
                { text: window.i18n ? window.i18n.t('modals.close') : 'Close', type: 'primary', action: 'close' }
            ]);
        } catch (error) {
            console.error('Error showing about dialog:', error);
            // Fallback if version retrieval fails
            const content = `
                <div style="padding: 20px 0; text-align: center;">
                    <div style="margin-bottom: 24px;">
                        <h2 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 24px; font-weight: 600;">
                            CogNotez
                        </h2>
                        <p style="margin: 0; color: var(--text-secondary); font-size: 16px;">
                            AI-Powered Note App
                        </p>
                    </div>
                    <div style="margin-bottom: 24px; padding: 16px; background: var(--bg-secondary, rgba(128, 128, 128, 0.1)); border-radius: 8px;">
                        <p style="margin: 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6;">
                            An offline-first note-taking application<br>
                            with local LLM integration.
                        </p>
                    </div>
                    <div style="margin-top: 20px; color: var(--text-secondary); font-size: 12px;">
                        <p style="margin: 0;">© 2025 KayfaHaarukku/nawka12</p>
                    </div>
                </div>
            `;

            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.createModal(t('about.title'), content, [
                { text: t('modals.close'), type: 'primary', action: 'close' }
            ]);
        }
    }

    // Show alert dialog (replaces native alert())
    showAlert(title, message) {
        return new Promise((resolve) => {
            const content = `
                <div style="padding: 10px 0;">
                    <p style="margin: 0; color: var(--text-primary); white-space: pre-line;">
                        ${this.escapeHtml(message)}
                    </p>
                </div>
            `;

            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            const modal = this.createModal(title, content, [
                { text: t('modals.ok'), type: 'primary', action: 'ok', callback: () => resolve() }
            ]);

            // Also handle clicking outside or pressing Escape
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    resolve();
                }
            });

            // Handle escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', handleEscape);
                    resolve();
                }
            };
            document.addEventListener('keydown', handleEscape);
        });
    }

    // AI functionality
    toggleAIPanel() {
        const panel = document.getElementById('ai-panel');
        console.log('[DEBUG] AI Panel: Current visibility state:', this.aiPanelVisible);
        this.aiPanelVisible = !this.aiPanelVisible;
        console.log('[DEBUG] AI Panel: New visibility state:', this.aiPanelVisible);
        panel.classList.toggle('hidden', !this.aiPanelVisible);

        // If opening the panel, ensure it's visible and scroll to bottom
        if (this.aiPanelVisible) {
            panel.style.display = 'flex'; // Ensure it's displayed as flex
            const messagesContainer = document.getElementById('ai-messages');
            if (messagesContainer) {
                setTimeout(() => {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 100);
            }
        } else {
            panel.style.display = 'none'; // Explicitly hide when closing
        }
    }

    showTemplateChooser() {
        if (this.templatesManager) {
            this.templatesManager.show();
        } else {
            console.error('[Templates] Templates manager not initialized');
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.templatesUnavailable'), 'error');
        }
    }

    async sendAIMessage() {
        const input = document.getElementById('ai-input');
        const message = input.value.trim();
        if (!message) return;

        console.log('[DEBUG] Sending AI message:', message);
        console.log('[DEBUG] Current note state - title:', this.currentNote?.title, 'content length:', this.currentNote?.content?.length);
        this.showAIMessage(message, 'user');
        input.value = '';
        this.autoResizeTextarea(input);

        // Show typing indicator instead of "Thinking..." message
        this.showTypingIndicator();

        try {
            // Prepare the AI prompt with note context and conversation history
            let prompt;
            let conversationHistory = '';

            // Get current conversation from UI (messages currently displayed, excluding the message we just added)
            const allMessages = Array.from(document.querySelectorAll('#ai-messages .ai-message'))
                .filter(msg => !msg.classList.contains('history-separator'));

            // Find the user message we just added (should be the last one)
            const userMessageIndex = allMessages.length - 1;
            const previousMessages = allMessages.slice(0, userMessageIndex)
                .map(msg => ({
                    type: msg.classList.contains('user') ? 'user' : 'assistant',
                    content: msg.textContent
                }))
                .slice(-19); // Last 19 messages to avoid token limits (saving room for current message)

            if (previousMessages.length > 0) { // We have previous conversation
                const conversationText = previousMessages
                    .map(msg => `${msg.type === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
                    .join('\n\n');
                conversationHistory = `\n\nRecent conversation:\n${conversationText}`;
            }

            // Also get stored conversation history if available
            if (this.currentNote && this.notesManager && this.notesManager.db && this.notesManager.db.initialized) {
                try {
                    const storedConversations = this.notesManager.db.getAIConversations(this.currentNote.id, 5); // Last 5 stored conversations
                    if (storedConversations.length > 0 && !conversationHistory) {
                        conversationHistory = '\n\nPrevious conversation history:\n' +
                            storedConversations.reverse().map(conv =>
                                `User: ${conv.user_message}\nAssistant: ${conv.ai_response}`
                            ).join('\n\n');
                    }
                } catch (error) {
                    console.log('[DEBUG] Could not load stored conversation history:', error);
                }
            }

            if (this.currentNote && this.currentNote.content) {
                prompt = `You are a helpful AI assistant for a note-taking application. The user is currently working on a note titled "${this.currentNote.title}".

Here is the full content of their note for context:

${this.currentNote.content}${conversationHistory}

The user asked: ${message}

Please provide a helpful response based on the note content and conversation history. Be conversational and maintain context for future messages.`;
            } else {
                prompt = `You are a helpful AI assistant for a note-taking application with access to web search for current information.${conversationHistory}The user asked: ${message}`;
            }

            let response;
            if (this.aiManager && this.aiManager.isConnected) {
                console.log('[DEBUG] AI Manager is connected, processing message...');
                console.log('[DEBUG] Current note title:', this.currentNote?.title);
                console.log('[DEBUG] Current note content:', this.currentNote?.content);
                console.log('[DEBUG] Full AI prompt being sent:', prompt);
                response = await this.aiManager.processWithAI(
                    prompt,
                    '',
                    { temperature: 0.7, max_tokens: 4096 }
                );
                console.log('[DEBUG] AI response received:', response.substring(0, 200) + '...');
            } else {
                console.log('[DEBUG] AI Manager not connected, showing offline message');
                const backend = this.aiManager ? this.aiManager.backend : 'ollama';
                if (backend === 'ollama') {
                    response = `<i class="fas fa-robot"></i> AI features are currently offline.

**To enable Ollama:**
• Start Ollama: Run "ollama serve" in terminal
• Pull a model: "ollama pull llama2"
• Or switch to OpenRouter in AI Settings`;
                } else {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    response = `<i class="fas fa-robot"></i> ${t('notifications.aiFeaturesOffline')}`;
                }
            }

            // Remove typing indicator and show actual response
                this.hideTypingIndicator();
                this.removeLastAIMessage();
                this.showAIMessage(response, 'assistant');

            // Save conversation to database
            if (this.aiManager && this.currentNote) {
                await this.aiManager.saveConversation(
                    this.currentNote.id,
                    message,
                    response,
                    this.currentNote.content,
                    'chat'
                );
                console.log('[DEBUG] Conversation saved to database');
            }
        } catch (error) {
            console.error('[DEBUG] Error sending AI message:', error);
            // Remove typing indicator and show error
            this.hideTypingIndicator();
            const backend = this.aiManager ? this.aiManager.backend : 'ollama';
            let errorMsg = '❌ Sorry, I encountered an error. ';
            if (backend === 'ollama') {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                errorMsg += t('notifications.checkOllamaRunning');
            } else {
                errorMsg += t('notifications.checkInternetAndOpenRouter');
            }
            this.showAIMessage(errorMsg, 'assistant');
        }
    }

    showAIMessage(message, type, options = {}) {
        const messagesContainer = document.getElementById('ai-messages');
        
        // Remove empty state if it exists
        const emptyState = messagesContainer.querySelector('.ai-messages-empty');
        if (emptyState) {
            emptyState.remove();
        }

        const messageElement = document.createElement('div');
        messageElement.className = `ai-message ${type}`;

        // Create avatar
        const avatar = document.createElement('div');
        avatar.className = 'ai-message-avatar';
        if (type === 'user') {
            avatar.innerHTML = '<i class="fas fa-user"></i>';
        } else {
            avatar.innerHTML = '<i class="fas fa-robot"></i>';
        }

        // Create message content wrapper
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'ai-message-content';

        // Create message bubble
        const bubble = document.createElement('div');
        bubble.className = 'ai-message-bubble';

        // Render markdown for assistant messages, use plain text for user messages
        if (type === 'assistant') {
            bubble.innerHTML = renderMarkdown(message);
        } else {
            bubble.textContent = message;
        }

        // Create message meta (timestamp and actions)
        const meta = document.createElement('div');
        meta.className = 'ai-message-meta';

        const timestamp = document.createElement('div');
        timestamp.className = 'ai-message-timestamp';
        const now = new Date();
        timestamp.textContent = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        const actions = document.createElement('div');
        actions.className = 'ai-message-actions';

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'ai-message-action';
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        copyBtn.title = t('tooltips.copyMessage');
        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const textToCopy = type === 'assistant' ? message : bubble.textContent;
            navigator.clipboard.writeText(textToCopy).then(() => {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.copiedToClipboard'), 'success');
                copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy:', err);
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.copyFailed'), 'error');
            });
        });

        actions.appendChild(copyBtn);

        // Add regenerate button for assistant messages (if not a welcome message)
        if (type === 'assistant' && !options.isWelcome && !message.includes('Hello! I\'m your AI assistant')) {
            const regenerateBtn = document.createElement('button');
            regenerateBtn.className = 'ai-message-action';
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            regenerateBtn.title = t('tooltips.regenerateResponse');
            regenerateBtn.innerHTML = '<i class="fas fa-redo"></i>';
            
            // Capture app instance for use in event listener
            const appInstance = this;
            
            regenerateBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                // Find the user message that prompted this response
                const messages = Array.from(messagesContainer.querySelectorAll('.ai-message'));
                const currentIndex = messages.indexOf(messageElement);
                let userMessage = null;
                
                // Look backwards for the user message
                for (let i = currentIndex - 1; i >= 0; i--) {
                    if (messages[i].classList.contains('user')) {
                        userMessage = messages[i].querySelector('.ai-message-bubble').textContent;
                        break;
                    }
                }

                if (userMessage) {
                    // Remove current assistant message
                    messageElement.remove();
                    // Show typing indicator
                    appInstance.showTypingIndicator();
                    // Regenerate response
                    try {
                        const response = await appInstance.aiManager.askQuestion(userMessage, appInstance.currentNote?.content || '');
                        appInstance.hideTypingIndicator();
                        appInstance.showAIMessage(response, 'assistant');
                    } catch (error) {
                        appInstance.hideTypingIndicator();
                        appInstance.showAIMessage(`❌ Failed to regenerate: ${error.message}`, 'assistant');
                    }
                }
            });
            actions.appendChild(regenerateBtn);
        }

        meta.appendChild(timestamp);
        meta.appendChild(actions);

        // Assemble message structure
        contentWrapper.appendChild(bubble);
        contentWrapper.appendChild(meta);
        messageElement.appendChild(avatar);
        messageElement.appendChild(contentWrapper);

        messagesContainer.appendChild(messageElement);
        
        // Smooth scroll to bottom
        setTimeout(() => {
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
    }

    showTypingIndicator() {
        const messagesContainer = document.getElementById('ai-messages');
        const typingElement = document.createElement('div');
        typingElement.className = 'ai-message assistant';
        typingElement.id = 'ai-typing-indicator';
        
        const avatar = document.createElement('div');
        avatar.className = 'ai-message-avatar';
        avatar.innerHTML = '<i class="fas fa-robot"></i>';
        
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'ai-message-content';
        
        const bubble = document.createElement('div');
        bubble.className = 'ai-message-bubble';
        
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'ai-typing-indicator';
        typingIndicator.innerHTML = '<div class="ai-typing-dot"></div><div class="ai-typing-dot"></div><div class="ai-typing-dot"></div>';
        
        bubble.appendChild(typingIndicator);
        contentWrapper.appendChild(bubble);
        typingElement.appendChild(avatar);
        typingElement.appendChild(contentWrapper);
        
        messagesContainer.appendChild(typingElement);
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'smooth'
        });
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('ai-typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    showWelcomeMessage() {
        const messagesContainer = document.getElementById('ai-messages');
        messagesContainer.innerHTML = '';
        
        const emptyState = document.createElement('div');
        emptyState.className = 'ai-messages-empty';
        emptyState.innerHTML = `
            <div class="ai-messages-empty-icon">
                <i class="fas fa-robot"></i>
            </div>
            <div class="ai-messages-empty-title">${window.i18n ? window.i18n.t('ai.assistant') : 'AI Assistant'}</div>
            <div class="ai-messages-empty-description">
                ${window.i18n ? window.i18n.t('ai.welcomeMessage') : "I'm here to help! Select text and right-click for AI features, or ask me anything about your note."}
            </div>
        `;
        
        messagesContainer.appendChild(emptyState);
    }

    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    removeLastAIMessage() {
        const messagesContainer = document.getElementById('ai-messages');
        const messages = messagesContainer.querySelectorAll('.ai-message:not(#ai-typing-indicator)');
        if (messages.length > 0) {
            messages[messages.length - 1].remove();
        }
    }

    resetAIConversation() {
        console.log('[DEBUG] Resetting AI conversation');

        // Delete conversations from database for current note
        if (this.currentNote && this.notesManager && this.notesManager.db && this.notesManager.db.initialized) {
            const deletedCount = this.notesManager.db.deleteAIConversations(this.currentNote.id);
            console.log(`[DEBUG] Deleted ${deletedCount} AI conversations for note: ${this.currentNote.id}`);
        }

        // Clear all messages from the UI
        const messagesContainer = document.getElementById('ai-messages');
        messagesContainer.innerHTML = '';

        // Show welcome message with empty state
        this.showWelcomeMessage();
    }

    async loadConversationHistory(noteId) {
        if (!noteId || !this.notesManager || !this.notesManager.db || !this.notesManager.db.initialized) {
            console.log('[DEBUG] Cannot load conversation history: no note ID or database not initialized');
            return;
        }

        try {
            console.log('[DEBUG] Loading conversation history for note:', noteId);
            const conversations = this.notesManager.db.getAIConversations(noteId, 20); // Load last 20 conversations

            if (conversations.length > 0) {
                const messagesContainer = document.getElementById('ai-messages');

                // Clear existing messages and empty state
                messagesContainer.innerHTML = '';

                // Display conversations in chronological order (oldest first)
                conversations.reverse().forEach(conv => {
                    // Add user message
                    this.showAIMessage(conv.user_message, 'user');
                    
                    // Add AI response
                    this.showAIMessage(conv.ai_response, 'assistant');
                });

                // Scroll to bottom to show latest messages
                setTimeout(() => {
                    messagesContainer.scrollTo({
                        top: messagesContainer.scrollHeight,
                        behavior: 'smooth'
                    });
                }, 100);

                console.log('[DEBUG] Loaded', conversations.length, 'conversation messages');
            }
        } catch (error) {
            console.error('[DEBUG] Error loading conversation history:', error);
        }
    }

    // Unified Context Menu
    showContextMenu(e, selectedText = '') {
        this.hideContextMenu();
        
        const menu = document.getElementById('context-menu');
        const hasSelection = selectedText.length > 0;
        
        // Show/hide menu items based on context
        const aiItems = menu.querySelectorAll('.context-menu-ai');
        const generateItem = menu.querySelector('[data-action="generate-ai"]');
        const editItem = menu.querySelector('[data-action="edit-ai"]');
        const summarizeItem = menu.querySelector('[data-action="summarize"]');
        const askItem = menu.querySelector('[data-action="ask-ai"]');
        const cutItem = menu.querySelector('[data-action="cut"]');
        const copyItem = menu.querySelector('[data-action="copy"]');
        const pasteItem = menu.querySelector('[data-action="paste"]');
        const downloadItem = menu.querySelector('[data-action="download-media"]');
        const separator = menu.querySelector('.context-menu-separator');

        // Check if context menu was triggered from editor (textarea)
        // Content-modifying operations (edit, generate) only work when right-clicking on the editor
        const isEditorContext = this.contextElement && this.contextElement.tagName === 'TEXTAREA';
        
        // AI items that modify content (edit, generate) only work when clicking on editor
        // AI items that don't modify content (summarize, ask) work everywhere

        // Edit AI: only when text selected AND clicking on editor (textarea)
        if (editItem) {
            const shouldShow = hasSelection && isEditorContext;
            editItem.style.display = shouldShow ? 'flex' : 'none';
            if (!isEditorContext) {
                editItem.classList.add('disabled');
            } else {
                editItem.classList.remove('disabled');
            }
        }

        // Generate AI: only when NO text selected AND clicking on editor (textarea)
        if (generateItem) {
            const shouldShow = !hasSelection && isEditorContext;
            generateItem.style.display = shouldShow ? 'flex' : 'none';
            if (!isEditorContext) {
                generateItem.classList.add('disabled');
            } else {
                generateItem.classList.remove('disabled');
            }
        }

        // Summarize and Ask AI work in both edit and preview modes when text is selected
        if (summarizeItem) {
            const shouldShow = hasSelection;
            summarizeItem.style.display = shouldShow ? 'flex' : 'none';
            // These don't modify content, so they work in preview mode
        }

        if (askItem) {
            const shouldShow = hasSelection;
            askItem.style.display = shouldShow ? 'flex' : 'none';
            // These don't modify content, so they work in preview mode
        }

        separator.style.display = hasSelection ? 'block' : 'none';
        
        // Cut/Copy enabled only when text is selected
        if (cutItem) {
            if (hasSelection && this.contextElement && this.contextElement.tagName === 'TEXTAREA') {
                cutItem.classList.remove('disabled');
            } else {
                cutItem.classList.add('disabled');
            }
        }
        
        if (copyItem) {
            copyItem.classList.toggle('disabled', !hasSelection);
        }
        
        // Paste only works in editor mode (textarea)
        if (pasteItem) {
            if (this.contextElement && this.contextElement.tagName === 'TEXTAREA') {
                pasteItem.classList.remove('disabled');
            } else {
                pasteItem.classList.add('disabled');
            }
        }

        // Show download option when right-clicking on media elements in preview pane
        if (downloadItem) {
            const hasMediaElement = this.contextMediaElement && !isEditorContext;
            downloadItem.style.display = hasMediaElement ? 'flex' : 'none';

            if (hasMediaElement) {
                // Enable download item if we have a media element
                downloadItem.classList.remove('disabled');
            }
        }
        
        // Position the menu
        const x = e.clientX;
        const y = e.clientY;
        const menuWidth = 250;
        const menuHeight = hasSelection ? 300 : 150;
        
        let finalX = x;
        let finalY = y;
        
        if (x + menuWidth > window.innerWidth) {
            finalX = x - menuWidth;
        }
        
        if (y + menuHeight > window.innerHeight) {
            finalY = y - menuHeight;
        }
        
        finalX = Math.max(10, finalX);
        finalY = Math.max(10, finalY);
        
        menu.style.left = finalX + 'px';
        menu.style.top = finalY + 'px';
        menu.classList.remove('hidden');
        
        // Handle menu item clicks
        const handleClick = (e) => {
            const target = e.target.closest('.context-menu-item');
            if (target && !target.classList.contains('disabled')) {
                const action = target.dataset.action;
                if (action) {
                    this.handleContextAction(action);
                    this.hideContextMenu();
                }
            }
        };
        
        menu.addEventListener('click', handleClick, { once: true });
    }

    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) menu.classList.add('hidden');
    }

    async handleContextAction(action) {
        const editor = document.getElementById('note-editor');
        
        switch (action) {
            case 'cut':
                if (this.selectedText && this.contextElement === editor) {
                    await navigator.clipboard.writeText(this.selectedText);
                    // Replace selection with empty string
                    const before = editor.value.substring(0, this.selectionStart);
                    const after = editor.value.substring(this.selectionEnd);
                    editor.value = before + after;
                    editor.setSelectionRange(this.selectionStart, this.selectionStart);
                    this.updateNotePreview();
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(t('notifications.textCut'), 'success');
                }
                break;
                
            case 'copy':
                if (this.selectedText) {
                    await navigator.clipboard.writeText(this.selectedText);
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(t('notifications.textCopied'), 'success');
                }
                break;
                
            case 'paste':
                if (this.contextElement === editor) {
                    try {
                        const text = await navigator.clipboard.readText();
                        const before = editor.value.substring(0, this.selectionStart);
                        const after = editor.value.substring(this.selectionEnd);
                        editor.value = before + text + after;
                        const newPos = this.selectionStart + text.length;
                        editor.setSelectionRange(newPos, newPos);
                        this.updateNotePreview();
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        this.showNotification(t('notifications.textPasted'), 'success');
                    } catch (err) {
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        this.showNotification(t('notifications.failedToPaste'), 'error');
                    }
                }
                break;
                
            case 'summarize':
                if (this.selectedText) {
                    this.preserveSelection = true;
                    await this.summarizeSelection();
                } else {
                    await this.summarizeNote();
                }
                break;
                
            case 'ask-ai':
                this.preserveSelection = true;
                if (this.selectedText) {
                    const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                    this.showAIDialog(t('ai.askAboutSelection'),
                        t('ai.askAboutSelectionMessage', { text: this.selectedText.substring(0, 50) + (this.selectedText.length > 50 ? '...' : '') }),
                        'ask-ai');
                } else {
                    const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                    this.showAIDialog(t('ai.askAboutNote'),
                        t('ai.askAboutNoteMessage', { title: this.currentNote ? this.currentNote.title : 'Untitled' }),
                        'ask-ai');
                }
                break;
                
            case 'edit-ai':
                if (this.selectedText) {
                    this.preserveSelection = true;
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showAIDialog(t('ai.editSelectionWithAI'),
                        t('ai.howToEditText'),
                        'edit-ai');
                } else {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(t('notifications.selectTextToEditAI'), 'info');
                }
                break;

            case 'generate-ai':
                this.generateContentWithAI();
                break;

            case 'download-media':
                if (this.contextMediaElement) {
                    await this.downloadMediaFromElement(this.contextMediaElement);
                }
                break;
        }
    }

    /**
     * Download media file from a media element (img, video, audio)
     * @param {HTMLElement} mediaElement - The media element to download from
     */
    async downloadMediaFromElement(mediaElement) {
        try {
            const src = mediaElement.src || mediaElement.querySelector('source')?.src;

            if (!src) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.mediaSourceNotFound'), 'error');
                return;
            }

            // Extract file ID from cognotez-media:// URL
            if (src.startsWith('cognotez-media://')) {
                const fileId = src.replace('cognotez-media://', '');

                if (this.richMediaManager) {
                    // First try to get media reference from RichMediaManager (for local files)
                    let mediaRef = await this.richMediaManager.getMediaReference(fileId);

                    if (mediaRef) {
                        // Use the existing downloadAttachment method for tracked files
                        await this.richMediaManager.downloadAttachment(mediaRef);
                        return;
                    }

                    // If not found in RichMediaManager, try direct filesystem access for synced files
                    try {
                        const fileResult = await this.downloadMediaFromFilesystem(fileId);
                        if (fileResult) {
                            // Get filename from the result (includes extension)
                            const filename = fileResult.filename || fileId;

                            // Create a blob and trigger download
                            const blob = new Blob([fileResult.buffer]);
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = filename;
                            a.click();
                            URL.revokeObjectURL(url);
                            const t = (key) => window.i18n ? window.i18n.t(key) : key;
                            this.showNotification(t('notifications.mediaDownloaded'), 'success');
                            return;
                        }
                    } catch (error) {
                        console.warn('[App] Filesystem download failed, trying alternative methods:', error);
                    }

                    // Fallback: try to get original filename from attachments or use fileId
                    const attachments = this.richMediaManager.getAttachmentsForNote ? this.richMediaManager.getAttachmentsForNote('downloaded_media') : [];
                    const attachment = attachments.find(att => att.id === fileId);
                    const originalName = attachment?.name || fileId;

                    const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                    this.showNotification(t('notifications.mediaFileNotFound', { name: originalName }), 'error');
                } else {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(t('notifications.mediaManagerNotAvailable'), 'error');
                }
            } else {
                // For external URLs, use browser download
                const link = document.createElement('a');
                link.href = src;
                link.download = mediaElement.alt || mediaElement.title || 'media';
                link.click();
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.downloadingMedia'), 'success');
            }
        } catch (error) {
            console.error('[App] Failed to download media:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.mediaDownloadFailed'), 'error');
        }
    }

    /**
     * Download media file directly from filesystem for synced files
     * @param {string} fileId - The media file ID
     * @returns {Promise<Object|null>} - Object with buffer and filename, or null if not found
     */
    async downloadMediaFromFilesystem(fileId) {
        try {
            // First try to get the original filename from RichMediaManager
            if (this.richMediaManager) {
                try {
                    const mediaRef = await this.richMediaManager.getMediaReference(fileId);
                    if (mediaRef && mediaRef.name) {
                        // Use the original filename from the media reference
                        const electron = require('electron');
                        const mediaDir = await electron.ipcRenderer.invoke('get-media-directory');
                        const filePath = `${mediaDir}/${mediaRef.name}`;

                        try {
                            const fileData = await electron.ipcRenderer.invoke('read-media-file', filePath);
                            if (fileData) {
                                console.log(`[App] Successfully read media file using original filename: ${mediaRef.name}`);
                                return {
                                    buffer: fileData,
                                    filename: mediaRef.name
                                };
                            }
                        } catch (error) {
                            console.warn(`[App] Failed to read file with original filename: ${mediaRef.name}`, error);
                        }
                    }
                } catch (error) {
                    console.warn(`[App] Failed to get media reference for: ${fileId}`, error);
                }
            }

            // Fallback: Use intelligent file discovery
            const electron = require('electron');
            const result = await electron.ipcRenderer.invoke('find-and-read-media-file', fileId);

            if (result && result.buffer) {
                console.log(`[App] Successfully read media file from filesystem: ${result.filename}`);
                return result;
            }

            return null;
        } catch (error) {
            console.warn(`[App] Failed to read media file from filesystem: ${fileId}`, error);
            return null;
        }
    }

    // Legacy methods kept for backward compatibility with keyboard shortcuts
    // These now redirect to the main methods
    rewriteSelection() {
        if (!this.selectedText) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.noTextSelected'), 'info');
            return;
        }
        this.preserveSelection = true;
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        this.showAIDialog(t('ai.rewriteSelection'),
            t('ai.howToRewriteText'),
            'rewrite');
    }

    extractKeyPoints() {
        if (!this.selectedText) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.noTextSelected'), 'info');
            return;
        }
        this.preserveSelection = true;
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        this.showAIDialog(t('ai.extractKeyPoints'),
            t('ai.extractingKeyPoints'),
            'key-points');
    }

    // AI Dialog
    showAIDialog(title, context, action) {
        // Preserve selection during AI dialog operations
        this.preserveSelection = true;
        document.getElementById('ai-dialog-title').textContent = title;
        document.getElementById('ai-dialog-context').textContent = context;
        document.getElementById('ai-dialog-input').value = '';
        document.getElementById('ai-dialog-input').focus();
        document.getElementById('ai-dialog').classList.remove('hidden');
        this.currentAIAction = action;
    }

    hideAIDialog() {
        document.getElementById('ai-dialog').classList.add('hidden');

        // Clean up custom content
        const customDiv = document.querySelector('.custom-content');
        if (customDiv) {
            customDiv.remove();
        }

        // Reset input field visibility
        const input = document.getElementById('ai-dialog-input');
        if (input) {
            input.style.display = 'block';
            input.value = '';
        }

        // Reset submit button text
        const submitBtn = document.getElementById('ai-dialog-submit');
        if (submitBtn) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            submitBtn.textContent = t('modals.submit');
        }

        // Clear selection preservation flag
        this.preserveSelection = false;
        this.currentAIAction = null;
    }

    async processAIDialog() {
        console.log('[DEBUG] processAIDialog called');
        console.log('[DEBUG] processAIDialog: currentAIAction =', this.currentAIAction);
        
        // Save the action before hiding the dialog (which clears currentAIAction)
        const actionToProcess = this.currentAIAction;
        let input = document.getElementById('ai-dialog-input').value.trim();
        console.log('[DEBUG] processAIDialog: input =', input);
        let customData = {};

        // Handle custom dialogs (like rewrite with style selection)
        if (actionToProcess === 'rewrite') {
            const styleSelect = document.getElementById('rewrite-style');
            if (styleSelect) {
                customData.style = styleSelect.value;
                input = customData.style; // Use style as input for rewrite
            }
        }
        
        this.hideAIDialog();
        // Create abort controller for this AI operation
        this.currentAIAbortController = new AbortController();
        this.isAIOperationCancelled = false; // Reset cancellation flag
        this.showLoading(null, true); // Show cancel button for AI operations

        try {
            console.log('[DEBUG] processAIDialog: calling handleAIAction with action =', actionToProcess, 'input =', input);
            await this.handleAIAction(actionToProcess, input, customData);
            console.log('[DEBUG] processAIDialog: handleAIAction completed');
        } catch (error) {
            // Don't show error if operation was cancelled
            if (error.name === 'AbortError' || error.message?.includes('aborted') || this.isAIOperationCancelled) {
                console.log('[DEBUG] processAIDialog: AI operation was cancelled');
                return;
            }
            console.error('[DEBUG] processAIDialog: AI action failed:', error);
            const backend = this.aiManager ? this.aiManager.backend : 'ollama';
            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
            const connectionType = backend === 'ollama' ? t('notifications.ollamaService') : t('notifications.internetConnectionAndApiKey');
            this.showNotification(t('notifications.aiActionFailed', { connectionType }), 'error');
        } finally {
            this.hideLoading();
            this.isAIOperationCancelled = false; // Reset flag
        }
    }

    async handleAIAction(action, input, customData = {}) {
        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        console.log('[DEBUG] handleAIAction called with action:', action, 'input:', input);
        console.log('[DEBUG] handleAIAction: selectedText =', this.selectedText ? this.selectedText.substring(0, 50) + '...' : 'none');
        console.log('[DEBUG] handleAIAction: selectionStart =', this.selectionStart, 'selectionEnd =', this.selectionEnd);
        
        if (!this.aiManager) {
            console.error('[DEBUG] handleAIAction: AI manager not available');
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.aiNotAvailable'), 'error');
            return;
        }

        // Check if AI manager is properly initialized
        if (!this.aiManager.isInitialized) {
            console.error('[DEBUG] handleAIAction: AI manager not fully initialized - edit approval system missing');
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.aiInitializing'), 'error');
            return;
        }

        if (!action) {
            console.error('[DEBUG] handleAIAction: No action specified');
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.noAiAction'), 'error');
            return;
        }

        const noteId = this.currentNote ? this.currentNote.id : null;

        try {
            // Use the AI manager's handler methods which include proper loading UI and error handling
            switch (action) {
                case 'summarize':
                    console.log('[DEBUG] handleAIAction: Processing summarize action, selectedText:', this.selectedText);
                    await this.aiManager.handleSummarize(this.selectedText);
                    break;

                case 'ask-ai':
                    console.log('[DEBUG] handleAIAction: Processing ask-ai action');
                    await this.aiManager.handleAskAI(input, this.selectedText);
                    break;

                case 'edit-ai':
                    console.log('[DEBUG] handleAIAction: Processing edit-ai action');
                    // Create abort controller for this AI operation
                    this.currentAIAbortController = new AbortController();
                    this.isAIOperationCancelled = false; // Reset cancellation flag
                    await this.aiManager.handleEditText(this.selectedText, input);
                    break;

                case 'generate-ai':
                    console.log('[DEBUG] handleAIAction: Processing generate-ai action');
                    // Create abort controller for this AI operation
                    this.currentAIAbortController = new AbortController();
                    this.isAIOperationCancelled = false; // Reset cancellation flag
                    await this.aiManager.handleGenerateContent(input);
                    break;

                case 'rewrite':
                    // Ensure AI panel is visible
                    if (!this.aiPanelVisible) {
                        this.toggleAIPanel();
                    }
                    // Create abort controller for this AI operation
                    this.currentAIAbortController = new AbortController();
                    this.isAIOperationCancelled = false; // Reset cancellation flag
                    this.updateLoadingText(t('ai.rewritingText'));
                    this.showLoading(null, true); // Show cancel button for AI operations
                    try {
                        console.log('[DEBUG] handleAIAction rewrite: starting with selectedText:', this.selectedText.substring(0, 50) + '...');
                        const style = input || customData.style || 'professional';
                        console.log('[DEBUG] handleAIAction rewrite: using style:', style);
                        const response = await this.aiManager.rewriteText(this.selectedText, style);
                        
                        // Check if operation was cancelled before applying result
                        if (this.isAIOperationCancelled) {
                            console.log('[DEBUG] handleAIAction rewrite: Operation was cancelled, not applying result');
                            return;
                        }
                        
                        console.log('[DEBUG] handleAIAction rewrite: got response:', response.substring(0, 50) + '...');
                        await this.aiManager.saveConversation(noteId, `Rewrite "${this.selectedText.substring(0, 50)}..." in ${style} style`, response, this.selectedText, 'rewrite');
                        this.replaceSelection(response);
                        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                        this.showAIMessage(`✅ ${t('notifications.textRewrittenSuccess')}`, 'assistant');
                    } catch (error) {
                        console.error('[DEBUG] handleAIAction rewrite error:', error);
                        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                        this.showAIMessage(`❌ ${t('notifications.textRewriteFailed', { error: error.message })}`, 'assistant');
                    } finally {
                        this.hideLoading();
                        this.isAIOperationCancelled = false; // Reset flag
                    }
                    break;

                case 'key-points':
                    // Ensure AI panel is visible
                    if (!this.aiPanelVisible) {
                        this.toggleAIPanel();
                    }
                    // Create abort controller for this AI operation
                    this.currentAIAbortController = new AbortController();
                    this.isAIOperationCancelled = false; // Reset cancellation flag
                    this.updateLoadingText(t('ai.extractingKeyPointsLoading'));
                    this.showLoading(null, true); // Show cancel button for AI operations
                    try {
                        const keyPointsResponse = await this.aiManager.extractKeyPoints(this.selectedText);
                        
                        // Check if operation was cancelled before applying result
                        if (this.isAIOperationCancelled) {
                            console.log('[DEBUG] handleAIAction key-points: Operation was cancelled, not applying result');
                            return;
                        }
                        
                        await this.aiManager.saveConversation(noteId, `Extract key points from: "${this.selectedText.substring(0, 100)}..."`, keyPointsResponse, this.selectedText, 'key-points');
                        this.showAIMessage(`<i class="fas fa-clipboard-list"></i> **Key Points:**\n${keyPointsResponse}`, 'assistant');
                    } finally {
                        this.hideLoading();
                        this.isAIOperationCancelled = false; // Reset flag
                    }
                    break;

                case 'generate-tags':
                    // Ensure AI panel is visible
                    if (!this.aiPanelVisible) {
                        this.toggleAIPanel();
                    }
                    // Create abort controller for this AI operation
                    this.currentAIAbortController = new AbortController();
                    this.isAIOperationCancelled = false; // Reset cancellation flag
                    this.updateLoadingText(t('ai.generatingTags'));
                    this.showLoading(null, true); // Show cancel button for AI operations
                    try {
                        // Include note title for better tag generation context
                        const noteTitle = this.currentNote ? this.currentNote.title : document.getElementById('note-title').value;
                        const tagsResponse = await this.aiManager.generateTags(this.selectedText, { noteTitle });
                        
                        // Check if operation was cancelled before applying result
                        if (this.isAIOperationCancelled) {
                            console.log('[DEBUG] handleAIAction generate-tags: Operation was cancelled, not applying result');
                            return;
                        }
                        
                        await this.aiManager.saveConversation(noteId, `Generate tags for: "${this.selectedText.substring(0, 100)}..."`, tagsResponse, this.selectedText, 'tags');
                        this.showAIMessage(`<i class="fas fa-tags"></i> **Suggested Tags:**\n${tagsResponse}`, 'assistant');
                    } finally {
                        this.hideLoading();
                        this.isAIOperationCancelled = false; // Reset flag
                    }
                    break;

            }
        } catch (error) {
            // Don't show error if operation was cancelled
            if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('cancelled') || this.isAIOperationCancelled) {
                console.log('[AI] Operation was cancelled');
                return;
            }
            console.error('AI action error:', error);
            // Ensure AI panel is visible for error message
            if (!this.aiPanelVisible) {
                this.toggleAIPanel();
            }
            const backend = this.aiManager ? this.aiManager.backend : 'ollama';
            let errorMsg = '❌ AI action failed. ';
            if (backend === 'ollama') {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                errorMsg += t('notifications.ensureOllamaRunning');
            } else {
                errorMsg += t('notifications.checkInternetAndApiKey');
            }
            this.showAIMessage(errorMsg, 'assistant');
            this.hideLoading();
        }
    }

    // Debounced history push to prevent bloat from rapid typing
    debouncedPushHistory(editor) {
        // Clear any existing timer
        if (this.historyDebounceTimer) {
            clearTimeout(this.historyDebounceTimer);
        }

        // Set a new timer
        this.historyDebounceTimer = setTimeout(() => {
            const cursorPos = editor.selectionStart;
            this.historyManager.pushState(editor.value, cursorPos, cursorPos, cursorPos);
            console.log('[DEBUG] History state saved (debounced)');
        }, this.historyDebounceDelay);
    }

    // Undo/Redo functionality
    undo() {
        const editor = document.getElementById('note-editor');
        if (!editor) return;

        // Clear any pending debounced history push
        if (this.historyDebounceTimer) {
            clearTimeout(this.historyDebounceTimer);
            this.historyDebounceTimer = null;
        }

        const previousState = this.historyManager.undo();
        if (previousState) {
            this.ignoreHistoryUpdate = true;
            editor.value = previousState.content;
            editor.selectionStart = previousState.selectionStart;
            editor.selectionEnd = previousState.selectionEnd;
            editor.focus();

            // Update current note content
            if (this.currentNote) {
                this.currentNote.content = previousState.content;
                this.saveCurrentNote(true); // Pass true to indicate this is not a manual save
            }

            this.updateNotePreview();
            
            // Update markdown preview if visible (preview or split mode)
            const preview = document.getElementById('markdown-preview');
            if (preview && !preview.classList.contains('hidden')) {
                this.renderMarkdownPreview();
            }
            
            this.ignoreHistoryUpdate = false;

            console.log('[DEBUG] Undo operation completed');
        }
    }

    redo() {
        const editor = document.getElementById('note-editor');
        if (!editor) return;

        // Clear any pending debounced history push
        if (this.historyDebounceTimer) {
            clearTimeout(this.historyDebounceTimer);
            this.historyDebounceTimer = null;
        }

        const nextState = this.historyManager.redo();
        if (nextState) {
            this.ignoreHistoryUpdate = true;
            editor.value = nextState.content;
            editor.selectionStart = nextState.selectionStart;
            editor.selectionEnd = nextState.selectionEnd;
            editor.focus();

            // Update current note content
            if (this.currentNote) {
                this.currentNote.content = nextState.content;
                this.saveCurrentNote(true); // Pass true to indicate this is not a manual save
            }

            this.updateNotePreview();
            
            // Update markdown preview if visible (preview or split mode)
            const preview = document.getElementById('markdown-preview');
            if (preview && !preview.classList.contains('hidden')) {
                this.renderMarkdownPreview();
            }
            
            this.ignoreHistoryUpdate = false;

            console.log('[DEBUG] Redo operation completed');
        }
    }

    // Initialize history when loading a note
    initializeHistoryForNote(content = '') {
        this.historyManager.clear();
        const editor = document.getElementById('note-editor');
        if (editor) {
            this.historyManager.pushState(content, 0, 0, 0);
        }
    }

    // Find and Replace methods
    showFindDialog() {
        this.findReplaceDialog.show(true); // Find only
    }

    showReplaceDialog() {
        this.findReplaceDialog.show(false); // Find and replace
    }

    hideFindReplaceDialog() {
        this.findReplaceDialog.hide();
    }

    // Selection helpers
    replaceSelection(replacement) {
        console.log('[DEBUG] replaceSelection called with:', replacement.substring(0, 100) + '...');
        const editor = document.getElementById('note-editor');

        if (!editor) {
            console.error('[DEBUG] replaceSelection: note-editor element not found');
            throw new Error('Note editor not found');
        }

        // Use stored selection range if available (from context menu), otherwise use current selection
        const start = (this.selectionStart >= 0 && this.selectionEnd >= 0) ? this.selectionStart : editor.selectionStart;
        const end = (this.selectionStart >= 0 && this.selectionEnd >= 0) ? this.selectionEnd : editor.selectionEnd;

        console.log('[DEBUG] replaceSelection: start =', start, 'end =', end);
        console.log('[DEBUG] replaceSelection: stored selection start =', this.selectionStart, 'end =', this.selectionEnd);
        console.log('[DEBUG] replaceSelection: current editor selection start =', editor.selectionStart, 'end =', editor.selectionEnd);

        // Replace the text
        const newContent = editor.value.substring(0, start) + replacement + editor.value.substring(end);
        editor.value = newContent;
        console.log('[DEBUG] replaceSelection: updated editor content');

        // Track history for undo/redo
        if (!this.ignoreHistoryUpdate) {
            const cursorPos = start + replacement.length;
            this.historyManager.pushState(newContent, cursorPos, cursorPos, cursorPos);
        }

        // Dispatch input event to trigger word count update and other listeners
        const inputEvent = new Event('input', { bubbles: true });
        editor.dispatchEvent(inputEvent);
        console.log('[DEBUG] replaceSelection: dispatched input event for word count update');

        // Update current note content
        if (this.currentNote) {
            this.currentNote.content = newContent;
            console.log('[DEBUG] replaceSelection: updated currentNote content');
            // Auto-save the changes
            this.saveCurrentNote();
        } else {
            console.warn('[DEBUG] replaceSelection: no currentNote to update');
        }

        // Clear stored selection and set new cursor position
        this.selectionStart = -1;
        this.selectionEnd = -1;
        this.preserveSelection = false; // Reset preservation flag after successful replacement
        editor.selectionStart = editor.selectionEnd = start + replacement.length;
        editor.focus();
        console.log('[DEBUG] replaceSelection: completed successfully, preserveSelection reset to false');
    }

    insertTextAtCursor(text) {
        console.log('[DEBUG] insertTextAtCursor called with:', text.substring(0, 100) + '...');

        const editor = document.getElementById('note-editor');
        if (!editor) {
            console.error('[DEBUG] insertTextAtCursor: note-editor element not found');
            return;
        }

        const start = editor.selectionStart;
        const end = editor.selectionEnd;

        console.log('[DEBUG] insertTextAtCursor: start =', start, 'end =', end);
        console.log('[DEBUG] insertTextAtCursor: current editor content length =', editor.value.length);

        // Insert the text at the cursor position
        const before = editor.value.substring(0, start);
        const after = editor.value.substring(end);
        editor.value = before + text + after;

        // Update the cursor position to after the inserted text
        const newCursorPosition = start + text.length;
        editor.setSelectionRange(newCursorPosition, newCursorPosition);

        // Ensure editor maintains focus after insertion
        editor.focus();

        console.log('[DEBUG] insertTextAtCursor: updated editor content length =', editor.value.length);

        // Dispatch input event to trigger autosave and word count update
        // Note: We intentionally do NOT update this.currentNote.content here
        // to allow the autosave mechanism to detect the change properly
        const inputEvent = new Event('input', { bubbles: true });
        editor.dispatchEvent(inputEvent);

        console.log('[DEBUG] insertTextAtCursor: completed successfully');
    }

    // Export functionality
    async exportNote(format = 'markdown') {
        if (!this.currentNote || !this.backendAPI) return;

        try {
            const filePath = await this.backendAPI.exportNote(this.currentNote, format);
            if (filePath) {
                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                this.showNotification(t('notifications.noteExportedSuccess', { path: filePath }));
            }
        } catch (error) {
            console.error('Export failed:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.exportFailed'), 'error');
        }
    }

    // Enhanced data portability methods
    async createFullBackup() {
        if (!this.backendAPI) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.backupUnavailable'), 'error');
            return;
        }

        try {
            this.showLoading();
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.updateLoadingText(t('loading.preparingBackup'));

            const filePath = await this.backendAPI.createBackup();

            if (filePath) {
                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                this.showNotification(t('notifications.backupCreatedSuccess', { path: filePath }), 'success');
            } else {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.backupCancelled'), 'info');
            }
        } catch (error) {
            console.error('Backup creation failed:', error);

            // Provide user-friendly error messages based on error content
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            let errorMessage = t('notifications.failedToCreateBackup');
            if (error.message.includes('database file not found')) {
                errorMessage = t('notifications.databaseFileNotFound');
            } else if (error.message.includes('not writable')) {
                errorMessage = t('notifications.cannotWriteToLocation');
            } else if (error.message.includes('permission denied')) {
                errorMessage = t('notifications.permissionDeniedCheckPermissions');
            } else if (error.message.includes('disk space')) {
                errorMessage = t('notifications.notEnoughDiskSpace');
            } else if (error.message) {
                errorMessage = error.message;
            }

            this.showNotification(errorMessage, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async importNote() {
        if (!this.backendAPI) return;

        try {
            this.showLoading();
            const importedNote = await this.backendAPI.importNote();
            if (importedNote) {
                // Add to notes and save
                this.notes.unshift(importedNote);
                await this.saveNotes();
                this.renderNotesList();
                this.displayNote(importedNote);
                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                this.showNotification(t('notifications.noteImportedSuccess', { title: importedNote.title }));
            }
            this.hideLoading();
        } catch (error) {
            console.error('Import failed:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.importFailed'), 'error');
            this.hideLoading();
        }
    }

    async importMultipleFiles() {
        if (!this.backendAPI) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.importUnavailable'), 'error');
            return;
        }

        try {
            this.showLoading();
            this.updateLoadingText(t('loading.preparingFileSelection'));

            const result = await this.backendAPI.importMultipleFiles();

            if (!result) {
                this.showNotification(t('notifications.noFilesForImport'), 'info');
                this.hideLoading();
                return;
            }

            if (result.notes.length === 0) {
                this.showNotification(t('notifications.noValidFiles'), 'warning');
                this.hideLoading();
                return;
            }

                this.updateLoadingText(t('loading.processingFiles', { count: result.notes.length }));

            // Add imported notes
            this.notes.unshift(...result.notes);
            await this.saveNotes();
            this.renderNotesList();

            const successful = result.metadata.successfulImports;
            const failed = result.metadata.failedImports;
            const totalWords = result.notes.reduce((sum, note) => sum + (note.word_count || 0), 0);

            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
            let message = `✅ ${t('notifications.filesImportedSuccess', { count: successful, plural: successful !== 1 ? 's' : '' })}`;
            if (totalWords > 0) {
                const wordsLabel = window.i18n ? window.i18n.t('editor.words') : 'words';
                message += ` (${totalWords} ${wordsLabel})`;
            }
            if (failed > 0) {
                message += `. ${t('notifications.filesImportFailed', { count: failed, plural: failed !== 1 ? 's' : '' })}`;
            }

            this.showNotification(message, failed > 0 ? 'warning' : 'success');

        } catch (error) {
            console.error('Bulk import failed:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            let errorMessage = t('notifications.failedToImportFiles');

            if (error.message.includes('permission')) {
                errorMessage = t('notifications.permissionDeniedCheckFilePermissions');
            } else if (error.message.includes('not found')) {
                errorMessage = t('notifications.someFilesNotFound');
            } else if (error.message.includes('format')) {
                errorMessage = t('notifications.unsupportedFileFormat');
            } else if (error.message) {
                errorMessage = `Import failed: ${error.message}`;
            }

            this.showNotification(errorMessage, 'error');
        } finally {
            this.hideLoading();
        }
    }



    // Refresh the legacy notes array from database data (for backward compatibility)
    async refreshLegacyNotesArray() {
        try {
            if (this.notesManager && this.notesManager.db && this.notesManager.db.initialized) {
                // Get all notes from the database
                const notesFromDb = await this.notesManager.db.getAllNotes();
                // Update the legacy notes array
                this.notes = notesFromDb.map(note => ({
                    id: note.id,
                    title: note.title,
                    content: note.content,
                    preview: note.preview,
                    created: note.created,
                    modified: note.modified,
                    tags: note.tags || [],
                    is_favorite: note.is_favorite || false,
                    is_archived: note.is_archived || false,
                    word_count: note.word_count || 0,
                    char_count: note.char_count || 0
                }));
                console.log('[DEBUG] Refreshed legacy notes array with', this.notes.length, 'notes');
            } else {
                // Fallback: try to load from localStorage if database is not available
                console.warn('[DEBUG] Database not available, falling back to localStorage for legacy notes array');
                const storedNotes = localStorage.getItem('notes');
                if (storedNotes) {
                    try {
                        this.notes = JSON.parse(storedNotes);
                        console.log('[DEBUG] Loaded notes from localStorage fallback');
                    } catch (parseError) {
                        console.warn('[DEBUG] Failed to parse notes from localStorage:', parseError);
                        this.notes = [];
                    }
                } else {
                    this.notes = [];
                }
            }
        } catch (error) {
            console.error('[DEBUG] Failed to refresh legacy notes array:', error);
            // Reset to empty array as fallback
            this.notes = [];
        }
    }

    async restoreFromBackup() {
        if (!this.backendAPI) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.backupRestoreUnavailable'), 'error');
            return;
        }

        try {
            this.showLoading();
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.updateLoadingText(t('loading.preparingToRestore'));

            const success = await this.backendAPI.restoreBackup();

            if (success) {
                this.updateLoadingText(t('loading.reloadingApplicationData'));

                // Refresh the legacy notes array from the restored database data
                await this.refreshLegacyNotesArray();

                // Reload all data after restore
                await this.loadNotes();
                this.showNotification(t('notifications.backupRestored'), 'success');

                // Note: In a production app, you might want to restart the app to ensure clean state
                // For now, just reload the notes list
                this.renderNotesList();
            } else {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.restoreCancelled'), 'info');
            }
        } catch (error) {
            console.error('Backup restore failed:', error);

            // Provide user-friendly error messages
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            let errorMessage = t('notifications.failedToRestoreBackup');
            if (error.message.includes('not a valid database backup')) {
                errorMessage = t('notifications.invalidBackupFile');
            } else if (error.message.includes('not found or database location not writable')) {
                errorMessage = t('notifications.cannotRestoreToLocation');
            } else if (error.message.includes('empty or corrupted')) {
                errorMessage = t('notifications.backupFileCorrupted');
            } else if (error.message.includes('permission denied')) {
                errorMessage = t('notifications.permissionDeniedRestore');
            } else if (error.message.includes('disk space')) {
                errorMessage = 'Not enough disk space to restore backup.';
            } else if (error.message) {
                errorMessage = error.message;
            }

            this.showNotification(errorMessage, 'error');
        } finally {
            this.hideLoading();
        }
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Splash screen methods
    showSplashScreen() {
        const splash = document.getElementById('splash-screen');
        const app = document.getElementById('app');
        if (splash) {
            splash.style.display = 'flex';
            splash.style.opacity = '1';
            splash.style.visibility = 'visible';
            splash.classList.remove('hiding', 'ready');
        }
        if (app) {
            app.classList.add('app-hidden');
            app.classList.remove('app-visible');
        }
    }

    hideSplashScreen() {
        const splash = document.getElementById('splash-screen');
        const app = document.getElementById('app');
        
        if (splash) {
            // Add ready state first
            splash.classList.add('ready');
            
            // Update status to show completion
            const statusText = splash.querySelector('.status-text');
            if (statusText) statusText.textContent = window.i18n ? window.i18n.t('splash.ready') : 'Ready';
            
            // Short delay to show ready state, then animate out
            setTimeout(() => {
                splash.classList.add('hiding');
                
                // Remove from DOM after animation
            setTimeout(() => {
                splash.style.display = 'none';
                }, 400);
            }, 100);
        }
        
        if (app) {
            app.classList.remove('app-hidden');
            app.classList.add('app-visible');
        }
    }

    async updateSplashVersion() {
        try {
            const version = await ipcRenderer.invoke('get-app-version');
            const versionElement = document.getElementById('splash-version');
            if (versionElement) {
                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                versionElement.textContent = t('splash.version', { version });
            }
        } catch (error) {
            console.warn('Failed to get app version for splash screen:', error);
        }
    }

    updateSplashProgress(text, percentage = null) {
        const progressText = document.getElementById('progress-text');
        const progressFill = document.getElementById('progress-fill');
        const progressPercent = document.getElementById('progress-percent');
        const progressGlow = document.querySelector('.progress-glow');
        const statusText = document.querySelector('.status-text');

        if (progressText && text) {
            // Translate if it's a translation key (starts with "splash.") or use text directly
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            const translatedText = text.startsWith('splash.') ? t(text) : text;
            progressText.textContent = translatedText;
        }

        if (percentage !== null) {
            const percent = Math.min(100, Math.max(0, percentage));
            
            if (progressFill) {
                progressFill.style.width = `${percent}%`;
            }
            
            if (progressGlow) {
                progressGlow.style.width = `${percent}%`;
            }
            
            if (progressPercent) {
                progressPercent.textContent = `${Math.round(percent)}%`;
            }
            
            // Update status text based on progress
            if (statusText) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                if (percent >= 100) {
                    statusText.textContent = t('splash.ready');
                } else if (percent >= 75) {
                    statusText.textContent = t('splash.almostThere');
                } else if (percent >= 50) {
                    statusText.textContent = t('splash.loading');
                } else {
                    statusText.textContent = t('splash.starting');
                }
            }
        }
    }

    // Utility methods
    showLoading(text = null, showCancel = false) {
        const loadingOverlay = document.getElementById('loading-overlay');
        const cancelBtn = document.getElementById('loading-cancel-btn');
        
        loadingOverlay.classList.remove('hidden');
        
        if (text) {
            this.updateLoadingText(text);
        }
        
        // Show/hide cancel button for AI operations
        if (showCancel) {
            cancelBtn.classList.remove('hidden');
            // Set up cancel handler if not already set
            if (!cancelBtn.hasAttribute('data-handler-attached')) {
                cancelBtn.addEventListener('click', () => this.cancelAIOperation());
                cancelBtn.setAttribute('data-handler-attached', 'true');
            }
        } else {
            cancelBtn.classList.add('hidden');
        }
    }

    hideLoading() {
        const loadingOverlay = document.getElementById('loading-overlay');
        const cancelBtn = document.getElementById('loading-cancel-btn');
        
        loadingOverlay.classList.add('hidden');
        cancelBtn.classList.add('hidden');
        
        // Clear abort controller when hiding loading (but keep cancellation flag until operation completes)
        // The flag will be cleared when the operation finishes or is cancelled
    }

    cancelAIOperation() {
        console.log('[AI] Cancelling current AI operation...');
        
        // Set cancellation flag
        this.isAIOperationCancelled = true;
        
        if (this.currentAIAbortController) {
            this.currentAIAbortController.abort();
            this.currentAIAbortController = null;
        }
        
        this.hideLoading();
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        this.showNotification(t('notifications.aiOperationCancelled'), 'info');
        
        // Clear any pending AI operations
        if (this.aiManager) {
            // Reset any AI manager state if needed
        }
    }

    updateLoadingText(text) {
        const loadingText = document.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = text;
        }
    }

    showNotification(message, type = 'info') {
        console.log(`Notification (${type}):`, message);
        
        // Create a visual notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button class="notification-close">×</button>
        `;

        // Style the notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '80px',
            right: '20px',
            background: type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#17a2b8',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '6px',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            zIndex: '10000', // Increased to appear above all modals and overlays
            maxWidth: '400px',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            animation: 'slideInRight 0.3s ease',
            pointerEvents: 'auto' // Ensure it can be interacted with
        });

        // Close button functionality
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.style.cssText = 'background: none; border: none; color: white; font-size: 18px; cursor: pointer; margin-left: 12px;';
        closeBtn.addEventListener('click', () => {
            this.removeNotification(notification);
        });

        document.body.appendChild(notification);

        // Auto remove after 5 seconds for info/success, 8 seconds for errors
        const duration = type === 'error' ? 8000 : 5000;
        setTimeout(() => {
            this.removeNotification(notification);
        }, duration);
    }

    removeNotification(notification) {
        if (notification && notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }

    setupExternalLinkHandling() {
        // Handle clicks on external links to open in default browser
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a[href^="http"]');
            if (link) {
                const href = link.getAttribute('href');
                // Check if it's an external link that should open in browser
                if (href && (href.includes('google.com') || href.includes('cloud.google') || href.includes('console.cloud.google'))) {
                    event.preventDefault();
                    const { shell } = require('electron');
                    shell.openExternal(href);
                }
            }
        });
    }

    handleKeyboardShortcuts(e) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdOrCtrl = e.ctrlKey || (isMac && e.metaKey);

        if (cmdOrCtrl) {
            switch (e.key) {
                // Undo/Redo operations
                case 'z':
                    if (!e.shiftKey) {
                        e.preventDefault();
                        this.undo();
                    } else {
                        // Ctrl+Shift+Z is also redo
                        e.preventDefault();
                        this.redo();
                    }
                    break;
                case 'y':
                    e.preventDefault();
                    this.redo();
                    break;

                // Basic note operations
                case 's':
                    e.preventDefault();
                    this.saveCurrentNote();
                    break;
                case 'n':
                    e.preventDefault();
                    this.createNewNote();
                    break;
                case '/':
                case 'k':
                    e.preventDefault();
                    document.getElementById('search-input').focus();
                    break;
                case 'o':
                    e.preventDefault();
                    this.openNoteDialog();
                    break;
                case 'f':
                    e.preventDefault();
                    this.showFindDialog();
                    break;
                case 'h':
                    e.preventDefault();
                    this.showReplaceDialog();
                    break;
                case 'p':
                    e.preventDefault();
                    this.togglePreview();
                    break;

                // AI shortcuts (with Shift)
                case 'S': // Ctrl+Shift+S
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.summarizeSelection();
                    }
                    break;
                case 'A': // Ctrl+Shift+A
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.askAIAboutSelection();
                    }
                    break;
                case 'E': // Ctrl+Shift+E
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.editSelectionWithAI();
                    }
                    break;
                case 'G': // Ctrl+Shift+G
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.generateContentWithAI();
                    }
                    break;
                case 'W': // Ctrl+Shift+W
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.rewriteSelection();
                    }
                    break;
                case 'K': // Ctrl+Shift+K
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.extractKeyPoints();
                    }
                    break;
                case 'T': // Ctrl+Shift+T
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.generateTags();
                    }
                    break;
            }
        }

        // Non-command shortcuts
        switch (e.key) {
            case 'Escape':
                // Close any open menus or dialogs
                this.hideAIContextMenu();
                this.hideAIDialog();
                break;
            case 'F1':
                e.preventDefault();
                this.showKeyboardShortcutsHelp();
                break;
        }
    }

    showKeyboardShortcutsHelp() {
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        const shortcuts = [
            // Basic operations
            { key: 'Ctrl+N', description: t('keyboard.createNewNote') },
            { key: 'Ctrl+S', description: t('keyboard.saveCurrentNote') },
            { key: 'Ctrl+O', description: t('keyboard.openNoteDesc') },
            { key: 'Ctrl+/', description: t('keyboard.focusSearchDesc') },

            // Text editing operations
            { key: 'Ctrl+Z', description: t('keyboard.undoLastChange') },
            { key: 'Ctrl+Y', description: t('keyboard.redoLastUndoneChange') },
            { key: 'Ctrl+F', description: t('keyboard.findTextInNote') },
            { key: 'Ctrl+H', description: t('keyboard.findAndReplaceText') },
            { key: 'Ctrl+P', description: t('keyboard.togglePreviewMode') },

            // AI operations (all require text selection)
            { key: 'Ctrl+Shift+S', description: t('keyboard.summarizeSelectedText') },
            { key: 'Ctrl+Shift+A', description: t('keyboard.askAIAboutSelectedText') },
            { key: 'Ctrl+Shift+E', description: t('keyboard.editSelectedTextWithAI') },
            { key: 'Ctrl+Shift+G', description: t('keyboard.generateContentWithAI') },
            { key: 'Ctrl+Shift+W', description: t('keyboard.rewriteSelectedText') },
            { key: 'Ctrl+Shift+K', description: t('keyboard.extractKeyPoints') },
            { key: 'Ctrl+Shift+T', description: t('keyboard.generateTagsForSelection') },

            // Other shortcuts
            { key: 'F1', description: t('keyboard.showThisHelpDialog') },
            { key: 'Escape', description: t('keyboard.closeMenusDialogs') },
            { key: 'Right-click', description: t('keyboard.showAIContextMenu') }
        ];

        const content = `
            <div style="max-height: 400px; overflow-y: auto;">
                <div style="margin-bottom: 16px;">
                    <h4 style="margin: 0 0 8px 0; color: var(--text-primary);">${t('keyboard.proTip')}</h4>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 13px;">
                        ${t('keyboard.proTipDescription')}
                    </p>
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--border-color); font-weight: 600;">${t('keyboard.shortcutHeader')}</th>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--border-color); font-weight: 600;">${t('keyboard.descriptionHeader')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shortcuts.map(shortcut => `
                            <tr>
                                <td style="padding: 8px; border-bottom: 1px solid var(--border-color-light); font-family: 'Monaco', 'Menlo', monospace; font-size: 12px; background: var(--input-bg); border-radius: 3px;">${shortcut.key}</td>
                                <td style="padding: 8px; border-bottom: 1px solid var(--border-color-light);">${shortcut.description}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        this.createModal(t('keyboard.shortcutsAndAIFeatures'), content, [
            { text: t('keyboard.gotIt'), type: 'primary', action: 'close' }
        ]);
    }

    // Menu actions
    summarizeNote() {
        if (!this.currentNote || !this.currentNote.content) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.noContentToSummarize'), 'info');
            return;
        }
        this.selectedText = this.currentNote.content;
        // Process immediately without dialog since we have all the content
        this.processAIActionWithoutDialog('summarize-note');
    }

    async processAIActionWithoutDialog(action) {
        if (!this.aiManager) return;

        if ((action === 'summarize-note' || action === 'key-points' || action === 'generate-tags') && !this.selectedText) return;

        try {
            const noteId = this.currentNote ? this.currentNote.id : null;
            let response;

            switch (action) {
                case 'key-points':
                    // Ensure AI panel is visible
                    if (!this.aiPanelVisible) {
                        this.toggleAIPanel();
                    }
                    // Create abort controller for this AI operation
                    this.currentAIAbortController = new AbortController();
                    this.isAIOperationCancelled = false; // Reset cancellation flag
                    this.updateLoadingText(t('ai.extractingKeyPointsLoading'));
                    this.showLoading(null, true); // Show cancel button for AI operations
                    response = await this.aiManager.extractKeyPoints(this.selectedText);
                    
                    // Check if operation was cancelled before applying result
                    if (this.isAIOperationCancelled) {
                        console.log('[DEBUG] processAIActionWithoutDialog key-points: Operation was cancelled, not applying result');
                        return;
                    }
                    
                    await this.aiManager.saveConversation(noteId, `Extract key points from: "${this.selectedText.substring(0, 100)}..."`, response, this.selectedText, 'key-points');
                    this.showAIMessage(`<i class="fas fa-clipboard-list"></i> **Key Points:**\n${response}`, 'assistant');
                    this.hideLoading();
                    this.isAIOperationCancelled = false; // Reset flag
                    break;

                case 'generate-tags':
                    // Ensure AI panel is visible
                    if (!this.aiPanelVisible) {
                        this.toggleAIPanel();
                    }
                    // Create abort controller for this AI operation
                    this.currentAIAbortController = new AbortController();
                    this.isAIOperationCancelled = false; // Reset cancellation flag
                    this.updateLoadingText(t('ai.generatingTags'));
                    this.showLoading(null, true); // Show cancel button for AI operations
                    // Include note title for better tag generation context
                    response = await this.aiManager.generateTags(this.selectedText, { noteTitle: this.noteTitle });
                    
                    // Check if operation was cancelled before applying result
                    if (this.isAIOperationCancelled) {
                        console.log('[DEBUG] processAIActionWithoutDialog generate-tags: Operation was cancelled, not applying result');
                        return;
                    }
                    
                    await this.aiManager.saveConversation(noteId, `Generate tags for: "${this.selectedText.substring(0, 100)}..."`, response, this.selectedText, 'tags');

                    // Parse and save tags to the current note
                    const generatedTags = this.parseTagResponse(response);
                    await this.saveTagsToCurrentNote(generatedTags);

                    this.showAIMessage(`<i class="fas fa-tags"></i> **Suggested Tags:**\n${response}\n\n*Tags have been saved to this note*`, 'assistant');
                    this.hideLoading();
                    this.isAIOperationCancelled = false; // Reset flag
                    break;

                case 'summarize-note':
                    await this.aiManager.handleSummarize(this.selectedText);
                    break;
            }
        } catch (error) {
            console.error('AI action error:', error);
            // Ensure AI panel is visible for error message
            if (!this.aiPanelVisible) {
                this.toggleAIPanel();
            }
            const backend = this.aiManager ? this.aiManager.backend : 'ollama';
            let errorMsg = '❌ AI action failed. ';
            if (backend === 'ollama') {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                errorMsg += t('notifications.ensureOllamaRunning');
            } else {
                errorMsg += t('notifications.checkInternetAndApiKey');
            }
            this.showAIMessage(errorMsg, 'assistant');
            this.hideLoading();
        }
    }

    summarizeSelection() {
        let selectedText = '';

        // Check if in preview mode
        const preview = document.getElementById('markdown-preview');
        const isPreviewMode = preview && !preview.classList.contains('hidden');

        if (isPreviewMode) {
            // In preview mode, try to get selected text from preview element
            const selection = window.getSelection();
            selectedText = selection.toString().trim();

            if (!selectedText) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.selectTextInPreviewToSummarize'), 'info');
                return;
            }
        } else {
            // In edit mode, get selected text from editor
            const editor = document.getElementById('note-editor');
            selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();

            if (!selectedText) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.selectTextToSummarize'), 'info');
                return;
            }
        }

        this.selectedText = selectedText;
        // Directly summarize without requiring user interaction
        if (this.aiManager) {
            this.aiManager.handleSummarize(selectedText);
        } else {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.aiNotAvailable'), 'error');
        }
    }

    askAIAboutSelection() {
        let selectedText = '';

        // Check if in preview mode
        const preview = document.getElementById('markdown-preview');
        const isPreviewMode = preview && !preview.classList.contains('hidden');

        if (isPreviewMode) {
            // In preview mode, try to get selected text from preview element
            const selection = window.getSelection();
            selectedText = selection.toString().trim();

            if (!selectedText) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.selectTextInPreviewToAsk'), 'info');
                return;
            }
        } else {
            // In edit mode, get selected text from editor
            const editor = document.getElementById('note-editor');
            selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();

            if (!selectedText) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.selectTextToAsk'), 'info');
                return;
            }
        }

        this.selectedText = selectedText;
        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        this.showAIDialog(t('ai.askAboutSelection'),
            t('ai.selectedText', { text: selectedText.substring(0, 150) + (selectedText.length > 150 ? '...' : '') }),
            'ask-ai');
    }

    editSelectionWithAI() {
        console.log('[DEBUG] editSelectionWithAI called');

        // Check if in preview mode - Edit AI modifies content so it shouldn't work in preview
        const preview = document.getElementById('markdown-preview');
        const isPreviewMode = preview && !preview.classList.contains('hidden');

        if (isPreviewMode) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.editInPreviewNotAvailable'), 'info');
            return;
        }

        // Use stored selection if available, otherwise get current selection
        let selectedText = this.selectedText;
        let start = this.selectionStart;
        let end = this.selectionEnd;
        
        if (!selectedText || start === -1 || end === -1) {
            console.log('[DEBUG] editSelectionWithAI: No stored selection, getting current selection');
            const editor = document.getElementById('note-editor');
            selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();
            start = editor.selectionStart;
            end = editor.selectionEnd;
        }

        if (!selectedText) {
            console.log('[DEBUG] editSelectionWithAI: No text selected');
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.selectTextToEdit'), 'info');
            return;
        }

        console.log('[DEBUG] editSelectionWithAI: Using selectedText:', selectedText.substring(0, 50) + '...');
        
        // Store selection for replacement (ensure we have the latest)
        this.selectedText = selectedText;
        this.selectionStart = start;
        this.selectionEnd = end;

        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        this.showAIDialog(t('ai.editSelectionWithAI'),
            t('ai.selectedText', { text: selectedText.substring(0, 150) + (selectedText.length > 150 ? '...' : '') }),
            'edit-ai');
    }

    generateContentWithAI() {
        console.log('[DEBUG] generateContentWithAI called');

        // Check if in preview-only mode (preview visible AND editor hidden)
        const preview = document.getElementById('markdown-preview');
        const editor = document.getElementById('note-editor');
        const isPreviewOnlyMode = preview && !preview.classList.contains('hidden') && 
                                  editor && editor.classList.contains('hidden');

        if (isPreviewOnlyMode) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.generateInPreviewNotAvailable'), 'info');
            return;
        }

        // For generate with AI, we don't need selected text - we're generating new content
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        this.showAIDialog(t('ai.generateContentWithAI'),
            t('ai.whatToGenerate'),
            'generate-ai');
    }

    rewriteSelection() {
        console.log('[DEBUG] rewriteSelection called');
        
        // Use stored selection if available, otherwise get current selection
        let selectedText = this.selectedText;
        let start = this.selectionStart;
        let end = this.selectionEnd;
        
        if (!selectedText || start === -1 || end === -1) {
            console.log('[DEBUG] rewriteSelection: No stored selection, getting current selection');
            const editor = document.getElementById('note-editor');
            selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();
            start = editor.selectionStart;
            end = editor.selectionEnd;
        }

        if (!selectedText) {
            console.log('[DEBUG] rewriteSelection: No text selected');
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.selectTextToRewrite'), 'info');
            return;
        }

        console.log('[DEBUG] rewriteSelection: Using selectedText:', selectedText.substring(0, 50) + '...');

        // Store selection for replacement (ensure we have the latest)
        this.selectedText = selectedText;
        this.selectionStart = start;
        this.selectionEnd = end;

        const styles = ['professional', 'casual', 'academic', 'simple', 'creative'];
        const styleOptions = styles.map(style => `<option value="${style}">${style.charAt(0).toUpperCase() + style.slice(1)}</option>`).join('');

        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        this.showCustomAIDialog(t('ai.rewriteSelection'),
            t('ai.selectedText', { text: selectedText.substring(0, 150) + (selectedText.length > 150 ? '...' : '') }),
            'rewrite',
            `
            <div style="margin-bottom: 12px;">
                <label for="rewrite-style" style="display: block; margin-bottom: 4px; font-weight: 500;">Choose writing style:</label>
                <select id="rewrite-style" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                    ${styleOptions}
                </select>
            </div>
            `
        );
    }

    extractKeyPoints() {
        const editor = document.getElementById('note-editor');
        const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();

        if (!selectedText) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.selectTextToExtract'), 'info');
            return;
        }

        this.selectedText = selectedText;
        // Process immediately without dialog
        this.processAIActionWithoutDialog('key-points');
    }

    generateTags() {
        const editor = document.getElementById('note-editor');
        const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();

        // Use whole note content if no text is selected, otherwise use selected text
        if (!selectedText) {
            // Use the entire note content
            const noteContent = editor.value.trim();
            if (!noteContent) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.writeContentOrSelectText'), 'info');
                return;
            }
            this.selectedText = noteContent;
        } else {
            this.selectedText = selectedText;
        }

        // Store the note title for tag generation context
        this.noteTitle = this.currentNote ? this.currentNote.title : document.getElementById('note-title').value;

        // Process immediately without dialog
        this.processAIActionWithoutDialog('generate-tags');
    }

    // Helper method to parse tag response from AI
    parseTagResponse(response) {
        // Extract tags from the response, handling various formats
        const tags = [];
        const lines = response.split('\n');

        for (const line of lines) {
            // Look for tags in various formats:
            // - Lines starting with "- " or "* "
            // - Comma-separated lists
            // - Numbered lists
            const trimmedLine = line.trim();

            if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
                const tag = trimmedLine.substring(2).trim();
                if (tag) tags.push(tag);
            } else if (trimmedLine.match(/^\d+\./)) {
                const tag = trimmedLine.replace(/^\d+\.\s*/, '').trim();
                if (tag) tags.push(tag);
            } else if (trimmedLine.includes(',')) {
                // Handle comma-separated tags
                const commaTags = trimmedLine.split(',').map(t => t.trim()).filter(t => t);
                tags.push(...commaTags);
            } else if (trimmedLine && !trimmedLine.includes('Tags:') && !trimmedLine.includes('Suggested tags:')) {
                // Direct tag if it's a single word/phrase
                tags.push(trimmedLine);
            }
        }

        // Remove duplicates and clean up tags
        return [...new Set(tags)].map(tag => tag.replace(/^["']|["']$/g, '')).filter(tag => tag.length > 0);
    }

    // Helper method to save tags to the current note
    async saveTagsToCurrentNote(tags) {
        if (!this.currentNote || !tags || tags.length === 0) return;

        try {
            // Create or get existing tags in the database
            const tagIds = [];
            for (const tagName of tags) {
                let existingTag = null;

                // Check if tag already exists
                if (this.notesManager.db && this.notesManager.db.initialized) {
                    const allTags = await this.notesManager.db.getAllTags();
                    existingTag = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
                }

                let tagId;
                if (existingTag) {
                    tagId = existingTag.id;
                } else {
                    // Create new tag
                    if (this.notesManager.db && this.notesManager.db.initialized) {
                        tagId = await this.notesManager.db.createTag({ name: tagName });
                    } else {
                        // Fallback: create tag ID and save tag definition
                        tagId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

                        // Initialize fallback tag data structure if needed
                        if (this.notesManager.db) {
                            this.notesManager.db.data = this.notesManager.db.data || {};
                            this.notesManager.db.data.tags = this.notesManager.db.data.tags || {};
                            this.notesManager.db.data.note_tags = this.notesManager.db.data.note_tags || {};

                            // Save tag definition
                            this.notesManager.db.data.tags[tagId] = {
                                id: tagId,
                                name: tagName,
                                color: '#BDABE3',
                                created_at: new Date().toISOString()
                            };
                        }
                    }
                }
                tagIds.push(tagId);
            }

            // Update note with tags (replace existing tags, maximum 3)
            const updatedTags = tagIds.slice(0, 3);

            if (this.notesManager.db && this.notesManager.db.initialized) {
                await this.notesManager.db.updateNote(this.currentNote.id, { tags: updatedTags });
                this.currentNote = await this.notesManager.db.getNote(this.currentNote.id);
            } else {
                // Fallback to localStorage
                this.currentNote.tags = updatedTags;
                this.saveNotes();
            }

            // Re-render notes list to show updated tags
            await this.notesManager.renderNotesList();

            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
            this.showNotification(t('notifications.tagsSavedToNote', { count: Math.min(tags.length, 3) }), 'success');
        } catch (error) {
            console.error('Error saving tags to note:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('settings.sync.failedToSaveTags'), 'error');
        }
    }

    showAISettings() {
        if (!this.aiManager) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            const msg = t('notifications.aiNotAvailable');
            this.showNotification(msg, 'error');
            return;
        }

        const t = (key, fallback, params = {}) => window.i18n ? window.i18n.t(key, params) : fallback;

        const backendStatus = this.aiManager.backend === 'ollama'
            ? (this.aiManager.isConnected
                ? t('settings.ai.ollamaStatusReady', 'Ollama is running and ready')
                : t('settings.ai.ollamaStatusNotAvailable', 'Ollama is not available. Please start Ollama service.'))
            : (this.aiManager.isConnected
                ? t('settings.ai.openRouterStatusValid', 'OpenRouter API key is valid')
                : t('settings.ai.openRouterStatusInvalid', 'OpenRouter API key is invalid or missing.'));

        const content = `
            <div style="max-width: 600px;">
                <div style="margin-bottom: 20px;">
                    <h4 style="margin: 0 0 12px 0; color: var(--text-primary);"><i class="fas fa-robot"></i> ${t('settings.ai.configurationTitle', 'AI Configuration')}</h4>
                    <div style="background: var(--context-menu-bg); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${this.aiManager.isConnected ? '#28a745' : '#dc3545'};"></div>
                            <span style="font-weight: 500;">${t('settings.ai.statusLabel', 'Status')}: ${this.aiManager.isConnected ? t('settings.ai.statusConnected', 'Connected') : t('settings.ai.statusDisconnected', 'Disconnected')}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                            ${backendStatus}
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <label for="ai-backend" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.backendLabel', 'AI Backend')}:</label>
                    <select id="ai-backend" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                        <option value="ollama" ${this.aiManager.backend === 'ollama' ? 'selected' : ''}>${t('settings.ai.backendOllama', 'Ollama (Local)')}</option>
                        <option value="openrouter" ${this.aiManager.backend === 'openrouter' ? 'selected' : ''}>${t('settings.ai.backendOpenRouter', 'OpenRouter (Cloud)')}</option>
                    </select>
                </div>

                <div id="ollama-settings" style="display: ${this.aiManager.backend === 'ollama' ? 'block' : 'none'};">
                    <div style="margin-bottom: 20px;">
                        <label for="ollama-endpoint" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.ollamaEndpoint', 'Ollama Endpoint')}:</label>
                        <input type="text" id="ollama-endpoint" value="${this.aiManager.ollamaEndpoint}"
                               style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary); font-family: monospace; font-size: 13px;">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label for="ollama-model" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.ollamaModel', 'Ollama Model')}:</label>
                        <select id="ollama-model" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                            ${this.aiManager.availableModels && this.aiManager.backend === 'ollama' ? this.aiManager.availableModels.map(model =>
                                `<option value="${model.name}" ${model.name === this.aiManager.ollamaModel ? 'selected' : ''}>${model.name}</option>`
                            ).join('') : `<option value="${this.aiManager.ollamaModel}" selected>${this.aiManager.ollamaModel}</option>`}
                        </select>
                    </div>
                </div>

                <div id="openrouter-settings" style="display: ${this.aiManager.backend === 'openrouter' ? 'block' : 'none'};">
                    <div style="margin-bottom: 20px;">
                        <label for="openrouter-api-key" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.openRouterApiKey', 'OpenRouter API Key')}:</label>
                        <input type="password" id="openrouter-api-key" value="${this.aiManager.openRouterApiKey}"
                               style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary); font-family: monospace; font-size: 13px;"
                               placeholder="sk-or-v1-...">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label for="openrouter-model-search" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.openRouterModel', 'OpenRouter Model')}:</label>
                        <div id="openrouter-model-container" style="position: relative;">
                            <input type="text" id="openrouter-model-search" 
                                   placeholder="${t('settings.ai.searchModels', 'Search models...')}" 
                                   value="${this.aiManager.availableModels && this.aiManager.backend === 'openrouter' ? (this.aiManager.availableModels.find(m => m.id === this.aiManager.openRouterModel)?.name || this.aiManager.openRouterModel) : this.aiManager.openRouterModel}"
                                   style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary); padding-right: 30px; box-sizing: border-box;">
                            <input type="hidden" id="openrouter-model" value="${this.aiManager.openRouterModel}">
                            <div id="openrouter-model-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; max-height: 300px; overflow-y: auto; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; margin-top: 4px; z-index: 1000; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);">
                            </div>
                        </div>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; align-items: center; gap: 8px; font-weight: 500;">
                            <input type="checkbox" id="searxng-enabled" ${this.aiManager.searxngEnabled ? 'checked' : ''}>
                            ${t('settings.ai.enableSearxng', 'Enable SearXNG Web Search')}
                        </label>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                            ${t('settings.ai.searxngDescription', 'Give the AI access to web search for current information using your SearXNG instance.')}
                        </div>
                    </div>

                    <div id="searxng-options" style="display: ${this.aiManager.searxngEnabled ? 'block' : 'none'}; margin-left: 20px;">
                        <div style="margin-bottom: 15px;">
                            <label for="searxng-url" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.searxngUrl', 'SearXNG URL')}:</label>
                            <input type="text" id="searxng-url" value="${this.aiManager.searxngUrl}"
                                   style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary); font-family: monospace; font-size: 13px;"
                                   placeholder="http://localhost:8080">
                        </div>

                        <div style="margin-bottom: 15px;">
                            <label for="searxng-max-results" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.searxngMaxResults', 'Max Search Results')}:</label>
                            <select id="searxng-max-results" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                                <option value="3" ${this.aiManager.searxngMaxResults === 3 ? 'selected' : ''}>${t('settings.ai.searxngResultsOption', '3 results', { count: 3 })}</option>
                                <option value="5" ${this.aiManager.searxngMaxResults === 5 ? 'selected' : ''}>${t('settings.ai.searxngResultsOption', '5 results', { count: 5 })}</option>
                                <option value="10" ${this.aiManager.searxngMaxResults === 10 ? 'selected' : ''}>${t('settings.ai.searxngResultsOption', '10 results', { count: 10 })}</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div style="background: var(--context-menu-bg); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4;">
                        <strong>${t('settings.ai.tips', '💡 Tips:')}</strong><br>
                        <div id="ollama-tips" style="display: ${this.aiManager.backend === 'ollama' ? 'block' : 'none'}">
                            • ${t('settings.ai.ollamaTipEndpoint', 'Default Ollama endpoint is usually')} <code>http://localhost:11434</code><br>
                            • ${t('settings.ai.ollamaTipPopularModels', 'Popular models: llama2, codellama, mistral')}<br>
                            • ${t('settings.ai.ollamaTipDownload', 'Use')} <code>ollama pull model_name</code> ${t('settings.ai.ollamaTipDownloadCommand', 'to download models')}<br>
                        </div>
                        <div id="openrouter-tips" style="display: ${this.aiManager.backend === 'openrouter' ? 'block' : 'none'}">
                            • ${t('settings.ai.openRouterTipGetKey', 'Get your API key from')} <a href="https://openrouter.ai/keys" target="_blank" style="color: var(--accent-color);">OpenRouter</a><br>
                            • ${t('settings.ai.openRouterTipPopularModels', 'Popular models: GPT-4, Claude, Gemini')}<br>
                            • ${t('settings.ai.openRouterTipKeyFormat', 'API key starts with')} <code>sk-or-v1-</code><br>
                            <div id="searxng-tip" style="display: ${this.aiManager.searxngEnabled ? 'block' : 'none'}">
                                • ${t('settings.ai.searxngTipPrivacy', 'SearXNG provides privacy-focused web search')}<br>
                                • ${t('settings.ai.searxngTipInstall', 'Install SearXNG:')} <code>pip install searxng</code><br>
                                ${this.aiManager.backend === 'ollama' ? `• <strong>${t('settings.ai.note', 'Note:')}</strong> ${t('settings.ai.ollamaToolCallingNote', 'Ollama tool calling may not work with all models. If you experience issues, try a different model or use OpenRouter.')}` : ''}
                            </div>
                        </div>
                        • ${t('settings.ai.tipRightClick', 'Right-click selected text for quick AI actions')}
                    </div>
                </div>
            </div>
        `;

        const modal = this.createModal(t('settings.ai.title', 'AI Settings'), content, [
            { text: t('settings.ai.testConnection', 'Test Connection'), type: 'secondary', action: 'test-connection' },
            { text: t('settings.general.saveButton', 'Save Settings'), type: 'primary', action: 'save-settings' },
            { text: window.i18n ? window.i18n.t('modals.cancel') : 'Cancel', type: 'secondary', action: 'cancel' }
        ]);

        // Add backend switching handler
        const backendSelect = modal.querySelector('#ai-backend');
        const ollamaSettings = modal.querySelector('#ollama-settings');
        const openrouterSettings = modal.querySelector('#openrouter-settings');
        const ollamaTips = modal.querySelector('#ollama-tips');
        const openrouterTips = modal.querySelector('#openrouter-tips');

        backendSelect.addEventListener('change', (e) => {
            const selectedBackend = e.target.value;
            if (selectedBackend === 'ollama') {
                ollamaSettings.style.display = 'block';
                openrouterSettings.style.display = 'none';
                ollamaTips.style.display = 'block';
                openrouterTips.style.display = 'none';
            } else {
                ollamaSettings.style.display = 'none';
                openrouterSettings.style.display = 'block';
                ollamaTips.style.display = 'none';
                openrouterTips.style.display = 'block';
            }
        });

        // Add SearXNG toggle handler
        const searxngCheckbox = modal.querySelector('#searxng-enabled');
        const searxngOptions = modal.querySelector('#searxng-options');
        const searxngTip = modal.querySelector('#searxng-tip');

        searxngCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                searxngOptions.style.display = 'block';
                searxngTip.style.display = 'block';
            } else {
                searxngOptions.style.display = 'none';
                searxngTip.style.display = 'none';
            }
        });

        // Initialize searchable OpenRouter model dropdown
        if (this.aiManager.backend === 'openrouter' && this.aiManager.availableModels && this.aiManager.availableModels.length > 0) {
            const modelSearchInput = modal.querySelector('#openrouter-model-search');
            const modelDropdown = modal.querySelector('#openrouter-model-dropdown');
            const modelHiddenInput = modal.querySelector('#openrouter-model');
            const modelContainer = modal.querySelector('#openrouter-model-container');
            
            let filteredModels = [...this.aiManager.availableModels];
            
            // Function to render dropdown items
            const renderDropdown = (models) => {
                if (models.length === 0) {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    const noModelsText = t('settings.advanced.noModelsFound');
                    modelDropdown.innerHTML = `<div style="padding: 12px; color: var(--text-secondary); text-align: center;">${noModelsText}</div>`;
                    return;
                }
                
                modelDropdown.innerHTML = models.map(model => {
                    const displayName = model.name || model.id;
                    const isSelected = model.id === this.aiManager.openRouterModel;
                    return `
                        <div class="model-dropdown-item" data-model-id="${model.id}" data-model-name="${displayName}" 
                             style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border-color); 
                                    ${isSelected ? 'background: var(--accent-color); color: white;' : 'background: var(--bg-primary); color: var(--text-primary);'}
                                    transition: background 0.2s;">
                            <div style="font-weight: ${isSelected ? '600' : '500'}; font-size: 14px;">${displayName}</div>
                            ${model.id !== displayName ? `<div style="font-size: 12px; opacity: 0.7; margin-top: 2px;">${model.id}</div>` : ''}
                        </div>
                    `;
                }).join('');
                
                // Add click handlers
                modelDropdown.querySelectorAll('.model-dropdown-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const modelId = item.dataset.modelId;
                        const modelName = item.dataset.modelName;
                        modelHiddenInput.value = modelId;
                        modelSearchInput.value = modelName;
                        modelDropdown.style.display = 'none';
                        
                        // Update selected state
                        modelDropdown.querySelectorAll('.model-dropdown-item').forEach(i => {
                            i.style.background = i.dataset.modelId === modelId ? 'var(--accent-color)' : 'var(--bg-primary)';
                            i.style.color = i.dataset.modelId === modelId ? 'white' : 'var(--text-primary)';
                        });
                    });
                    
                    item.addEventListener('mouseenter', function() {
                        if (this.dataset.modelId !== modelHiddenInput.value) {
                            this.style.background = 'var(--bg-hover)';
                        }
                    });
                    
                    item.addEventListener('mouseleave', function() {
                        if (this.dataset.modelId !== modelHiddenInput.value) {
                            this.style.background = 'var(--bg-primary)';
                        }
                    });
                });
            };
            
            // Initial render
            renderDropdown(filteredModels);
            
            // Search functionality
            modelSearchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase().trim();
                
                if (searchTerm === '') {
                    filteredModels = [...this.aiManager.availableModels];
                } else {
                    filteredModels = this.aiManager.availableModels.filter(model => {
                        const name = (model.name || model.id).toLowerCase();
                        const id = model.id.toLowerCase();
                        return name.includes(searchTerm) || id.includes(searchTerm);
                    });
                }
                
                renderDropdown(filteredModels);
                modelDropdown.style.display = filteredModels.length > 0 ? 'block' : 'none';
            });
            
            // Show dropdown on focus
            modelSearchInput.addEventListener('focus', () => {
                if (filteredModels.length > 0) {
                    modelDropdown.style.display = 'block';
                }
            });
            
            // Hide dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!modelContainer.contains(e.target)) {
                    modelDropdown.style.display = 'none';
                }
            });
            
            // Handle keyboard navigation
            let selectedIndex = -1;
            modelSearchInput.addEventListener('keydown', (e) => {
                const items = modelDropdown.querySelectorAll('.model-dropdown-item');
                
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    // Reset previous selection
                    if (selectedIndex >= 0 && items[selectedIndex]) {
                        const prevModelId = items[selectedIndex].dataset.modelId;
                        items[selectedIndex].style.background = prevModelId === modelHiddenInput.value ? 'var(--accent-color)' : 'var(--bg-primary)';
                    }
                    selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                    if (items[selectedIndex]) {
                        items[selectedIndex].scrollIntoView({ block: 'nearest' });
                        items[selectedIndex].style.background = 'var(--bg-hover)';
                    }
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    // Reset previous selection
                    if (selectedIndex >= 0 && items[selectedIndex]) {
                        const prevModelId = items[selectedIndex].dataset.modelId;
                        items[selectedIndex].style.background = prevModelId === modelHiddenInput.value ? 'var(--accent-color)' : 'var(--bg-primary)';
                    }
                    selectedIndex = Math.max(selectedIndex - 1, 0);
                    if (items[selectedIndex]) {
                        items[selectedIndex].scrollIntoView({ block: 'nearest' });
                        items[selectedIndex].style.background = 'var(--bg-hover)';
                    }
                } else if (e.key === 'Enter' && selectedIndex >= 0 && items[selectedIndex]) {
                    e.preventDefault();
                    items[selectedIndex].click();
                    selectedIndex = -1;
                } else if (e.key === 'Escape') {
                    modelDropdown.style.display = 'none';
                    selectedIndex = -1;
                } else {
                    // Reset selection when typing
                    selectedIndex = -1;
                }
            });
        }

        // Add custom button handlers
        const testBtn = modal.querySelector('[data-action="test-connection"]');
        const saveBtn = modal.querySelector('[data-action="save-settings"]');

        testBtn.addEventListener('click', async () => {
            const backend = modal.querySelector('#ai-backend').value;

            // Create abort controller for this AI operation
            this.currentAIAbortController = new AbortController();
            this.isAIOperationCancelled = false; // Reset cancellation flag
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.updateLoadingText(t('loading.testingAIConnection'));
            this.showLoading(null, true); // Show cancel button for AI operations
            try {
                await this.aiManager.switchBackend(backend);
                await this.aiManager.loadAvailableModels();
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(`✅ ${t('settings.sync.connectionTestCompleted')}`, 'success');
                // Refresh the modal with updated model list
                this.closeModal(modal);
                setTimeout(() => this.showAISettings(), 100);
            } catch (error) {
                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                this.showNotification(`❌ ${t('encryption.connectionError', { error: error.message })}`, 'error');
            } finally {
                this.hideLoading();
            }
        });

        saveBtn.addEventListener('click', async () => {
            const backend = modal.querySelector('#ai-backend').value;

            try {
                // Set backend-specific settings first
                if (backend === 'ollama') {
                    const endpoint = modal.querySelector('#ollama-endpoint').value;
                    const model = modal.querySelector('#ollama-model').value;
                    await this.aiManager.updateOllamaEndpoint(endpoint);
                    await this.aiManager.updateOllamaModel(model);
                } else {
                    const apiKey = modal.querySelector('#openrouter-api-key').value.trim();
                    const model = modal.querySelector('#openrouter-model').value;
                    const searxngEnabled = modal.querySelector('#searxng-enabled').checked;
                    const searxngUrl = modal.querySelector('#searxng-url').value.trim();
                    const searxngMaxResults = modal.querySelector('#searxng-max-results').value;

                    const restartTriggered = await this.aiManager.updateOpenRouterApiKey(apiKey);
                    await this.aiManager.updateOpenRouterModel(model);
                    await this.aiManager.updateSearxngEnabled(searxngEnabled);
                    await this.aiManager.updateSearxngUrl(searxngUrl);
                    await this.aiManager.updateSearxngMaxResults(searxngMaxResults);

                    // If API key changed and restart was triggered, show message and return early
                    if (restartTriggered) {
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        this.showNotification(`✅ ${t('settings.sync.openRouterApiKeyUpdated')}`, 'success');
                        this.closeModal(modal);
                        // Small delay before restart to allow notification to show
                        setTimeout(() => {
                            ipcRenderer.send('restart-app');
                        }, 1000);
                        return;
                    }
                }

                // Now switch backend (which will validate connection with the updated settings)
                await this.aiManager.switchBackend(backend);

                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(`✅ ${t('settings.sync.aiSettingsSaved')}`, 'success');
                this.closeModal(modal);
            } catch (error) {
                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                this.showNotification(t('notifications.failedToSaveSettings', { error: error.message }), 'error');
            }
        });
    }

    showGeneralSettings() {
        const currentAutoSave = localStorage.getItem('autoSave') !== 'false'; // Default to true
        const currentTheme = localStorage.getItem('theme') || 'light';
        const currentWordCount = localStorage.getItem('showWordCount') === 'true';

        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

        const content = `
            <div style="max-width: 400px;">
                <div style="margin-bottom: 24px;">
                    <h4 style="margin: 0 0 16px 0; color: var(--text-primary);"><i class="fas fa-cog"></i> ${t('settings.general.title', 'General Settings')}</h4>
                </div>

                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <div class="setting-item">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="auto-save-toggle" ${currentAutoSave ? 'checked' : ''} style="margin: 0;">
                            <span style="color: var(--text-primary); font-weight: 500;">${t('settings.general.autoSaveLabel', 'Enable Auto-Save')}</span>
                        </label>
                        <div style="margin-top: 4px; color: var(--text-secondary); font-size: 12px;">
                            ${t('settings.general.autoSaveDescription', 'Automatically save your notes every 30 seconds when changes are detected')}
                        </div>
                    </div>

                    <div class="setting-item">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="word-count-toggle" ${currentWordCount ? 'checked' : ''} style="margin: 0;">
                            <span style="color: var(--text-primary); font-weight: 500;">${t('settings.general.wordCountLabel', 'Show Word Count')}</span>
                        </label>
                        <div style="margin-top: 4px; color: var(--text-secondary); font-size: 12px;">
                            ${t('settings.general.wordCountDescription', 'Display word count in the editor header')}
                        </div>
                    </div>

                    <div class="setting-item">
                        <label style="color: var(--text-primary); font-weight: 500;">${t('settings.general.themeLabel', 'Theme')}</label>
                        <select id="theme-select" style="width: 100%; padding: 8px; margin-top: 4px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                            <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>${t('settings.general.themeLight', 'Light')}</option>
                            <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>${t('settings.general.themeDark', 'Dark')}</option>
                        </select>
                    </div>
                </div>
            </div>
        `;

        const modal = this.createModal(t('settings.general.title', 'General Settings'), content, [
            { text: t('settings.general.saveButton', 'Save Settings'), type: 'primary', action: 'save-general-settings' },
            { text: window.i18n ? window.i18n.t('modals.cancel') : 'Cancel', type: 'secondary', action: 'cancel' }
        ]);

        const saveBtn = modal.querySelector('[data-action="save-general-settings"]');
        saveBtn.addEventListener('click', () => {
            const autoSaveEnabled = modal.querySelector('#auto-save-toggle').checked;
            const wordCountEnabled = modal.querySelector('#word-count-toggle').checked;
            const theme = modal.querySelector('#theme-select').value;

            // Track if auto-save setting changed
            const previousAutoSave = localStorage.getItem('autoSave') === 'true';
            const autoSaveChanged = previousAutoSave !== autoSaveEnabled;

            // Save settings
            localStorage.setItem('autoSave', autoSaveEnabled.toString());
            localStorage.setItem('showWordCount', wordCountEnabled.toString());
            localStorage.setItem('theme', theme);

            // Apply theme immediately
            this.theme = theme;
            this.loadTheme();

            // Refresh word count display based on new settings
            if (this.uiManager) {
                this.uiManager.refreshWordCount();
            }

            // Handle auto-save changes
            if (this.notesManager) {
                if (autoSaveEnabled) {
                    // Ensure autosave is running
                    if (!this.notesManager.autoSaveInterval) {
                        this.notesManager.startAutoSave();
                        console.log('[DEBUG] Auto-save enabled');
                    }
                } else {
                    // Ensure autosave is stopped
                    if (this.notesManager.autoSaveInterval) {
                        this.notesManager.stopAutoSave();
                        console.log('[DEBUG] Auto-save disabled');
                    }
                }
            }

            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(`✅ ${t('settings.sync.generalSettingsSaved')}`, 'success');
            this.closeModal(modal);

            // Show restart dialog if auto-save setting changed
            if (autoSaveChanged) {
                setTimeout(() => {
                    this.showRestartDialog('Auto-save setting requires an app restart to take full effect.');
                }, 500);
            }
        });
    }

    showAdvancedSettings() {
        // Get current tag statistics
        const allTags = this.notesManager.db ? this.notesManager.db.getAllTags() : [];
        const totalTags = allTags.length;

        const t = (key, fallback, params = {}) => window.i18n ? window.i18n.t(key, params) : fallback;

        const content = `
            <div style="max-width: 500px;">
                <div class="settings-section">
                    <h4 style="margin: 0 0 16px 0; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                        <i class="fas fa-cog"></i> ${t('settings.advanced.advancedOptions', 'Advanced Options')}
                    </h4>

                    <!-- Tag Management -->
                    <div class="setting-item" style="margin-bottom: 24px;">
                        <div style="margin-bottom: 12px;">
                            <label style="color: var(--text-primary); font-weight: 500; display: block; margin-bottom: 4px;">
                                <i class="fas fa-tags"></i> ${t('settings.advanced.tagManagement', 'Tag Management')}
                            </label>
                            <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 12px;">
                                ${t('settings.advanced.totalTags', 'Total tags: {{count}}', { count: totalTags })}
                            </div>
                        </div>
                        
                        <button id="clear-unused-tags-btn" class="advanced-action-btn" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 8px; justify-content: center; transition: all 0.2s;">
                            <i class="fas fa-broom"></i>
                            <span>${t('settings.advanced.clearUnusedTags', 'Clear Unused Tags')}</span>
                        </button>
                        <div style="margin-top: 6px; color: var(--text-secondary); font-size: 11px; line-height: 1.4;">
                            ${t('settings.advanced.clearUnusedTagsDescription', 'Remove tags that are not associated with any notes. This helps keep your tag list clean and organized.')}
                        </div>
                    </div>

                    <!-- AI Data Management -->
                    <div class="setting-item" style="margin-bottom: 24px;">
                        <div style="margin-bottom: 12px;">
                            <label style="color: var(--text-primary); font-weight: 500; display: block; margin-bottom: 4px;">
                                <i class="fas fa-robot"></i> ${t('settings.advanced.aiDataManagement', 'AI Data Management')}
                            </label>
                            <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 12px;">
                                ${t('settings.advanced.aiDataDescription', 'Manage AI conversation history and data')}
                            </div>
                        </div>
                        
                        <button id="clear-all-ai-conversations-btn" class="advanced-action-btn" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 8px; justify-content: center; transition: all 0.2s;">
                            <i class="fas fa-trash"></i>
                            <span>${t('settings.advanced.clearAllAIConversations', 'Clear All AI Conversations')}</span>
                        </button>
                        <div style="margin-top: 6px; color: var(--text-secondary); font-size: 11px; line-height: 1.4;">
                            ${t('settings.advanced.clearAllAIConversationsDescription', 'Delete all AI conversations for all notes. This action cannot be undone. Note content will not be affected.')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modal = this.createModal(t('settings.advanced.title', 'Advanced Settings'), content, [
            { text: t('settings.advanced.close', 'Close'), type: 'secondary', action: 'cancel' }
        ]);

        // Handle Clear Unused Tags button
        const clearTagsBtn = modal.querySelector('#clear-unused-tags-btn');
        clearTagsBtn.addEventListener('click', async () => {
            if (!this.notesManager.db || !this.notesManager.db.initialized) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.databaseNotInitialized'), 'error');
                return;
            }

            // Confirm action
            const confirmClear = await this.showConfirmation(
                t('settings.advanced.confirmClearUnusedTitle', 'Clear Unused Tags'),
                t('settings.advanced.confirmClearUnusedMessage', 'Are you sure you want to remove all unused tags?\n\nThis will permanently delete tags that are not associated with any notes.')
            );
            if (!confirmClear) return;

            try {
                clearTagsBtn.disabled = true;
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                clearTagsBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${t('settings.advanced.clearing')}</span>`;

                const result = this.notesManager.db.clearUnusedTags();

                if (result.deletedCount > 0) {
                    const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                    const plural = result.deletedCount > 1 ? 's' : '';
                    const pluralRemaining = result.remainingCount !== 1 ? 's' : '';
                    const message = `✅ ${t('settings.advanced.clearUnusedTagsSuccess', { 
                        deletedCount: result.deletedCount, 
                        plural,
                        remainingCount: result.remainingCount,
                        pluralRemaining
                    })}`;
                    this.showNotification(message, 'success');
                    console.log('[Advanced Settings] Cleared unused tags:', result);
                    
                    // Close modal and refresh if needed
                    this.closeModal(modal);
                } else {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(`ℹ️ ${t('settings.advanced.noUnusedTagsFound')}`, 'info');
                    clearTagsBtn.disabled = false;
                    clearTagsBtn.innerHTML = `<i class="fas fa-broom"></i> <span>${t('settings.advanced.clearUnusedTags')}</span>`;
                }
            } catch (error) {
                console.error('[Advanced Settings] Error clearing unused tags:', error);
                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                const errorMsg = t('notifications.failedToClearUnusedTags', { error: error.message });
                this.showNotification(`❌ ${errorMsg}`, 'error');
                clearTagsBtn.disabled = false;
                clearTagsBtn.innerHTML = `<i class="fas fa-broom"></i> <span>${t('settings.advanced.clearUnusedTags')}</span>`;
            }
        });

        // Handle Clear All AI Conversations button
        const clearAIConversationsBtn = modal.querySelector('#clear-all-ai-conversations-btn');
        clearAIConversationsBtn.addEventListener('click', async () => {
            // Confirm action
            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
            const confirmed = await this.showConfirmation(
                t('settings.advanced.clearAIConversationsConfirmTitle'),
                t('settings.advanced.clearAIConversationsConfirmMessage')
            );
            if (!confirmed) return;

            try {
                clearAIConversationsBtn.disabled = true;
                clearAIConversationsBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${t('settings.advanced.clearing')}</span>`;

                const result = await this.backendAPI.clearOrphanedAIConversations();

                if (result.success) {
                    const message = result.message || `✅ ${t('settings.advanced.allAIConversationsCleared')}`;
                    this.showNotification(message, 'success');
                    console.log('[Advanced Settings] Cleared AI conversations:', result);
                    
                    // Close modal
                    this.closeModal(modal);
                } else {
                    const errorMsg = result.error || `❌ ${t('notifications.failedToClearAIConversations', { error: '' })}`;
                    this.showNotification(errorMsg, 'error');
                    clearAIConversationsBtn.disabled = false;
                    clearAIConversationsBtn.innerHTML = `<i class="fas fa-trash"></i> <span>${t('settings.advanced.clearAllAIConversations')}</span>`;
                }
            } catch (error) {
                console.error('[Advanced Settings] Error clearing AI conversations:', error);
                const errorMsg = t('notifications.failedToClearAIConversations', { error: error.message });
                this.showNotification(`❌ ${errorMsg}`, 'error');
                clearAIConversationsBtn.disabled = false;
                clearAIConversationsBtn.innerHTML = `<i class="fas fa-trash"></i> <span>${t('settings.advanced.clearAllAIConversations')}</span>`;
            }
        });

        // Add hover effect for the button
        const style = document.createElement('style');
        style.textContent = `
            .advanced-action-btn:hover:not(:disabled) {
                background: var(--accent-color, #3ECF8E) !important;
                color: white !important;
                border-color: var(--accent-color, #3ECF8E) !important;
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .advanced-action-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
        `;
        document.head.appendChild(style);
    }

    showRestartDialog(message = null) {
        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        // Default message if none provided
        const defaultMessage = t('modals.restartMessage', 'This change requires an app restart to take full effect.');
        const displayMessage = message || defaultMessage;
        
        const content = `
            <div style="padding: 10px 0;">
                <p style="margin: 0 0 20px 0; color: var(--text-primary);">
                    <i class="fas fa-exclamation-circle" style="color: var(--warning-color, #ff9800); margin-right: 8px;"></i>
                    ${this.escapeHtml(displayMessage)}
                </p>
                <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">
                    ${this.escapeHtml(t('modals.restartQuestion', 'Would you like to restart CogNotez now?'))}
                </p>
            </div>
        `;

        const modal = this.createModal(t('modals.restartRequired', 'Restart Required'), content, [
            { text: t('modals.restartNow', 'Restart Now'), type: 'primary', action: 'restart', callback: () => this.restartApp() },
            { text: t('modals.later', 'Later'), type: 'secondary', action: 'cancel' }
        ]);
    }

    restartApp() {
        console.log('[DEBUG] Restarting application...');
        
        // Try to use Electron's app.relaunch if available
        try {
            if (typeof ipcRenderer !== 'undefined') {
                // Request main process to relaunch the app
                ipcRenderer.send('restart-app');
                
                // Fallback to reload if restart message doesn't work after 1 second
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                // Not in Electron, just reload the page
                window.location.reload();
            }
        } catch (error) {
            console.error('[DEBUG] Failed to restart via IPC, falling back to reload:', error);
            // Fallback: Simple page reload
            window.location.reload();
        }
    }

    showShareOptions() {
        if (!this.currentNote || !this.backendAPI) return;

        const t = (key, fallback, params = {}) => window.i18n ? window.i18n.t(key, params) : fallback;

        // Always refresh current note from database to get latest collaboration status
        if (this.notesManager && this.notesManager.db) {
            const freshNote = this.notesManager.db.getNote(this.currentNote.id);
            if (freshNote) {
                // Preserve decrypted content if note is password protected
                if (this.currentNote.password_protected && this.currentNote.content) {
                    freshNote.content = this.currentNote.content;
                }
                this.currentNote = freshNote;
            }
        }

        const isShared = this.currentNote.collaboration?.is_shared;
        const shareLink = this.currentNote.collaboration?.google_drive_share_link;

        let sharedStatusHtml = '';
        if (isShared && shareLink) {
            sharedStatusHtml = `
                <div style="margin-bottom: 20px; padding: 16px; background: var(--context-menu-bg); border-radius: 8px; border: 1px solid var(--accent-primary);">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <i class="fas fa-check-circle" style="color: var(--accent-primary);"></i>
                        <span style="font-weight: 500; color: var(--accent-primary);">${t('notifications.noteSharedOnGoogleDrive', 'Note is currently shared on Google Drive')}</span>
                    </div>
                    <div style="margin-bottom: 12px;">
                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">${t('notifications.shareLink', 'Share Link:')}</div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input type="text" id="current-share-link" readonly value="${shareLink}" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-primary); color: var(--text-primary); font-family: monospace; font-size: 11px;">
                            <button id="copy-share-link-btn" class="btn-secondary" style="padding: 8px 12px;" title="${t('notifications.copyLink', 'Copy link')}">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                    <button id="revoke-share-btn" class="btn-secondary" style="width: 100%; padding: 10px; background: var(--error-color); color: white; border: none;">
                        <i class="fas fa-times-circle"></i> ${t('notifications.revokeShare', 'Revoke Share')}
                    </button>
                </div>
            `;
        }

        const content = `
            <div style="max-width: 500px;">
                <div style="margin-bottom: 20px;">
                    <h4 style="margin: 0 0 12px 0; color: var(--text-primary);"><i class="fas fa-share"></i> ${t('editor.shareNoteTitle', 'Share "{{title}}"', { title: this.currentNote.title })}</h4>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">
                        ${t('editor.shareNoteDescription', 'Choose how you want to share this note:')}
                    </p>
                </div>

                ${sharedStatusHtml}

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 8px;">
                        <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 8px;">${t('notifications.collaboration', 'Collaboration')}</div>
                        
                        <button class="share-option-btn" data-action="share-google-drive" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                            <span><i class="fab fa-google-drive" style="color: #4285F4;"></i></span>
                            <div>
                                <div style="font-weight: 500;">${isShared ? t('notifications.updateGoogleDriveShare', 'Update Google Drive Share') : t('notifications.shareViaGoogleDrive', 'Share via Google Drive')}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">${isShared ? t('notifications.updateGoogleDriveShareDescription', 'Update existing shared note on Google Drive') : t('notifications.shareViaGoogleDriveDescription', 'Upload and share on Google Drive with permissions')}</div>
                            </div>
                        </button>
                    </div>

                    <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 8px;">
                        <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 8px;">${t('notifications.exportSection', 'Export')}</div>
                        
                        <button class="share-option-btn" data-action="clipboard-markdown" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                            <span><i class="fas fa-clipboard"></i></span>
                            <div>
                                <div style="font-weight: 500;">${t('notifications.copyToClipboardMarkdown', 'Copy to Clipboard (Markdown)')}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">${t('notifications.copyToClipboardMarkdownDesc', 'Share formatted content')}</div>
                            </div>
                        </button>

                        <button class="share-option-btn" data-action="clipboard-text" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                            <span>📄</span>
                            <div>
                                <div style="font-weight: 500;">${t('notifications.copyToClipboardText', 'Copy to Clipboard (Plain Text)')}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">${t('notifications.copyToClipboardTextDesc', 'Share plain text content')}</div>
                            </div>
                        </button>

                        <button class="share-option-btn" data-action="export-markdown" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                            <span>📁</span>
                            <div>
                                <div style="font-weight: 500;">${t('notifications.exportAsMarkdownFile', 'Export as Markdown File')}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">${t('notifications.exportAsMarkdownFileDesc', 'Save to file for sharing')}</div>
                            </div>
                        </button>

                        <button class="share-option-btn" data-action="export-text" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                            <span>📄</span>
                            <div>
                                <div style="font-weight: 500;">${t('notifications.exportAsTextFile', 'Export as Text File')}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">${t('notifications.exportAsTextFileDesc', 'Save to file for sharing')}</div>
                            </div>
                        </button>

                        <button class="share-option-btn" data-action="export-pdf" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                            <span>📋</span>
                            <div>
                                <div style="font-weight: 500;">${t('notifications.shareAsPDF', 'Share as PDF')}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">${t('notifications.shareAsPDFDesc', 'Preserves media and formatting')}</div>
                            </div>
                        </button>
                    </div>
                </div>

                <div style="margin-top: 20px; padding: 12px; background: var(--context-menu-bg); border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4;">
                        ${t('notifications.shareTip', '💡 Tip: Google Drive sharing enables cloud-based collaboration with permission control. Export options let you share files directly.')}
                    </div>
                </div>
            </div>
        `;

        const modal = this.createModal(t('editor.shareNote', 'Share Note'), content, [
            { text: t('modals.close', 'Close'), type: 'secondary', action: 'close' }
        ]);

        // Handle copy link button
        if (isShared && shareLink) {
            const copyBtn = modal.querySelector('#copy-share-link-btn');
            copyBtn?.addEventListener('click', () => {
                const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                const linkInput = modal.querySelector('#current-share-link');
                linkInput.select();
                document.execCommand('copy');
                this.showNotification(t('notifications.linkCopiedToClipboard', 'Link copied to clipboard!'), 'success');
            });

            // Handle revoke share button
            const revokeBtn = modal.querySelector('#revoke-share-btn');
            revokeBtn?.addEventListener('click', async () => {
                const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                if (confirm(t('notifications.revokeShareConfirm', 'Are you sure you want to revoke this share? The Google Drive file will be deleted.'))) {
                    try {
                        this.showLoading(t('notifications.revokingShare', 'Revoking share...'));
                        const result = await this.backendAPI.revokeGoogleDriveShare(
                            this.currentNote.collaboration.google_drive_file_id,
                            this.currentNote.id
                        );
                        this.hideLoading();
                        this.showNotification(t('notifications.shareRevokedSuccessfully', 'Share revoked successfully'), 'success');
                        
                        // Update the note's collaboration data in renderer's database
                        if (result.success && result.updatedCollaboration && this.notesManager && this.notesManager.db) {
                            const noteData = this.notesManager.db.data.notes[this.currentNote.id];
                            if (noteData) {
                                noteData.collaboration = result.updatedCollaboration;
                                // Update timestamp so sync knows this version is newer
                                noteData.updated_at = new Date().toISOString();
                                this.notesManager.db.saveToLocalStorage();
                                this.currentNote = this.notesManager.db.getNote(this.currentNote.id);
                            }
                        }
                        // Close ALL modals (in case there are multiple stacked)
                        this.closeAllModals();
                        
                        // Reload the share options to reflect updated state
                        setTimeout(() => this.showShareOptions(), 300);
                    } catch (error) {
                        this.hideLoading();
                        const t = (key, fallback, params = {}) => window.i18n ? window.i18n.t(key, params) : fallback;
                        this.showNotification(t('notifications.failedToRevokeShare', 'Failed to revoke share: {{error}}', { error: error.message }), 'error');
                    }
                }
            });
        }

        // Add click handlers for share options
        modal.querySelectorAll('.share-option-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = e.currentTarget.dataset.action;
                await this.handleShareAction(action);
                if (action !== 'share-google-drive') {
                    this.closeModal(modal);
                }
            });
        });
    }

    async handleShareAction(action) {
        if (!this.currentNote || !this.backendAPI) return;

        const t = (key, fallback, params = {}) => window.i18n ? window.i18n.t(key, params) : fallback;

        try {
            let success = false;
            let message = '';

            switch (action) {
                case 'share-google-drive':
                    await this.showGoogleDriveShareDialog();
                    return; // Don't close modal yet

                case 'clipboard-markdown':
                    success = await this.backendAPI.shareNoteToClipboard(this.currentNote, 'markdown');
                    message = t('notifications.noteCopiedToClipboardMarkdown', 'Note copied to clipboard as Markdown!');
                    break;

                case 'clipboard-text':
                    success = await this.backendAPI.shareNoteToClipboard(this.currentNote, 'text');
                    message = t('notifications.noteCopiedToClipboardText', 'Note copied to clipboard as plain text!');
                    break;

                case 'export-markdown':
                    const mdPath = await this.backendAPI.shareNoteAsFile(this.currentNote, 'markdown');
                    if (mdPath) {
                        message = t('notifications.noteExportedAsMarkdown', 'Note exported as Markdown: {{path}}', { path: mdPath });
                        success = true;
                    }
                    break;

                case 'export-text':
                    const txtPath = await this.backendAPI.shareNoteAsFile(this.currentNote, 'text');
                    if (txtPath) {
                        message = t('notifications.noteExportedAsText', 'Note exported as Text: {{path}}', { path: txtPath });
                        success = true;
                    }
                    break;

                case 'export-pdf':
                    const pdfPath = await this.backendAPI.shareNoteAsFile(this.currentNote, 'pdf');
                    if (pdfPath) {
                        message = t('notifications.noteExportedAsPDF', 'Note exported as PDF: {{path}}', { path: pdfPath });
                        success = true;
                    }
                    break;
            }

            if (success) {
                this.showNotification(message, 'success');
            } else {
                const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                this.showNotification(t('notifications.failedToShareNote', 'Failed to share note'), 'error');
            }
        } catch (error) {
            console.error('Share error:', error);
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            this.showNotification(t('notifications.failedToShareNote', 'Failed to share note'), 'error');
        }
    }

    async showGoogleDriveShareDialog() {
        // Check if user is authenticated with Google Drive
        try {
            const syncStatus = await this.backendAPI.getGoogleDriveSyncStatus();
            if (!syncStatus || !syncStatus.isAuthenticated) {
                const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                this.showNotification(t('notifications.pleaseAuthenticateGoogleDrive', 'Please authenticate with Google Drive first. Go to Sync Settings and click "Connect Google Drive".'), 'error');
                return;
            }
        } catch (error) {
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            this.showNotification(t('notifications.googleDriveSyncNotSetup', 'Google Drive sync is not set up. Please connect Google Drive in Sync Settings.'), 'error');
            return;
        }

        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        const content = `
            <div style="max-width: 500px;">
                <div style="margin-bottom: 20px;">
                    <h4 style="margin: 0 0 12px 0; color: var(--text-primary);"><i class="fab fa-google-drive"></i> ${t('notifications.shareViaGoogleDriveTitle', 'Share via Google Drive')}</h4>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">
                        ${t('notifications.shareViaGoogleDriveSubtitle', 'Upload and share this note on Google Drive:')}
                    </p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; gap: 8px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); cursor: pointer;">
                        <input type="radio" name="gd-perm" value="view" checked style="cursor: pointer;">
                        <div>
                            <div style="font-weight: 500; color: var(--text-primary);">${t('notifications.viewOnly', 'View Only')}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${t('notifications.viewOnlyDesc', 'Recipients can only view')}</div>
                        </div>
                    </label>

                    <label style="display: flex; align-items: center; gap: 8px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); cursor: pointer;">
                        <input type="radio" name="gd-perm" value="comment" style="cursor: pointer;">
                        <div>
                            <div style="font-weight: 500; color: var(--text-primary);">${t('notifications.comment', 'Comment')}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${t('notifications.commentDesc', 'Recipients can view and comment')}</div>
                        </div>
                    </label>

                    <label style="display: flex; align-items: center; gap: 8px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); cursor: pointer;">
                        <input type="radio" name="gd-perm" value="edit" style="cursor: pointer;">
                        <div>
                            <div style="font-weight: 500; color: var(--text-primary);">${t('notifications.edit', 'Edit')}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${t('notifications.editDesc', 'Recipients can view and edit')}</div>
                        </div>
                    </label>
                </div>

                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text-primary);">${t('notifications.shareWithEmail', 'Share with email (optional):')}</label>
                    <input type="email" id="gd-email" placeholder="${t('notifications.shareWithEmailPlaceholder', 'user@example.com')}" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary);">
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">${t('notifications.shareWithEmailHint', 'Leave empty to create a public link')}</div>
                </div>

                <div id="gd-share-result" style="display: none; margin-bottom: 20px; padding: 12px; background: var(--context-menu-bg); border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">${t('notifications.googleDriveLink', 'Google Drive Link:')}</div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="text" id="gd-link-input" readonly style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-primary); color: var(--text-primary); font-family: monospace; font-size: 12px;">
                        <button id="copy-gd-link-btn" class="btn-secondary" style="padding: 8px 12px;">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        const modal = this.createModal(t('notifications.shareViaGoogleDriveTitle', 'Share via Google Drive'), content, [
            { text: t('modals.cancel', 'Cancel'), type: 'secondary', action: 'close' },
            { text: t('notifications.shareViaGoogleDrive', 'Share'), type: 'primary', action: 'share-gd' }
        ]);

        // Handle share button
        const shareBtn = modal.querySelector('[data-action="share-gd"]');
        shareBtn.addEventListener('click', async () => {
            const permValue = modal.querySelector('input[name="gd-perm"]:checked').value;
            const email = modal.querySelector('#gd-email').value.trim();

            const permissions = {
                view: true,
                comment: permValue === 'comment' || permValue === 'edit',
                edit: permValue === 'edit'
            };

            try {
                const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                this.showLoading(t('notifications.sharingNoteOnGoogleDrive', 'Sharing note on Google Drive...'));
                const result = await this.backendAPI.shareNoteOnGoogleDrive(
                    this.currentNote,
                    permissions,
                    email || null
                );

                this.hideLoading();

                if (result.success) {
                    // Update the note's collaboration data in renderer's database
                    if (result.success && result.updatedCollaboration && this.notesManager && this.notesManager.db) {
                        const noteData = this.notesManager.db.data.notes[this.currentNote.id];
                        if (noteData) {
                            noteData.collaboration = result.updatedCollaboration;
                            // Update timestamp so sync knows this version is newer
                            noteData.updated_at = new Date().toISOString();
                            this.notesManager.db.saveToLocalStorage();
                            this.currentNote = this.notesManager.db.getNote(this.currentNote.id);
                            console.log('[Share] Updated note collaboration data:', this.currentNote.collaboration);
                        }
                    }

                    const message = result.isUpdate ? 
                        t('notifications.sharedNoteUpdatedSuccessfully', 'Shared note updated successfully on Google Drive!') : 
                        t('notifications.noteSharedSuccessfully', 'Note shared on Google Drive successfully!');
                    this.showNotification(message, 'success');

                    // Close ALL modals (including parent Share Note dialog) and reopen
                    this.closeAllModals();
                    
                    // Reload the share options to reflect updated state
                    setTimeout(() => this.showShareOptions(), 300);
                }
            } catch (error) {
                this.hideLoading();
                console.error('Error sharing on Google Drive:', error);
                const t = (key, fallback, params = {}) => window.i18n ? window.i18n.t(key, params) : fallback;
                this.showNotification(t('notifications.failedToShareOnGoogleDrive', 'Failed to share on Google Drive: {{error}}', { error: error.message }), 'error');
            }
        });
    }




    showCustomAIDialog(title, context, action, customContent) {
        document.getElementById('ai-dialog-title').textContent = title;
        document.getElementById('ai-dialog-context').textContent = context;

        // Add custom content before the input
        const contextDiv = document.getElementById('ai-dialog-context');
        let customDiv = contextDiv.nextElementSibling;
        if (!customDiv || !customDiv.classList.contains('custom-content')) {
            customDiv = document.createElement('div');
            customDiv.className = 'custom-content';
            contextDiv.parentNode.insertBefore(customDiv, contextDiv.nextSibling);
        }
        customDiv.innerHTML = customContent;

        // Hide the regular input if not needed
        const input = document.getElementById('ai-dialog-input');
        input.style.display = 'none';

        // Update submit button text
        const submitBtn = document.getElementById('ai-dialog-submit');
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        submitBtn.textContent = t('ai.rewrite');

        document.getElementById('ai-dialog').classList.remove('hidden');
        this.currentAIAction = action;
    }

    // Update-related methods
    async checkForUpdates() {
        try {
            console.log('Checking for updates...');
            await ipcRenderer.invoke('check-for-updates');
        } catch (error) {
            console.error('Failed to check for updates:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.failedToCheckForUpdates'), 'error');
        }
    }

    showUpdateStatus(message) {
        this.showNotification(message, 'info');
    }

    showUpdateAvailable(info) {
        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        const dialog = document.createElement('div');
        dialog.className = 'update-dialog';
        dialog.innerHTML = `
            <div class="update-dialog-content">
                <h3>${t('notifications.updateAvailable')}</h3>
                <p>${t('notifications.updateAvailableMessage', { version: info.version })}</p>
                <div class="update-dialog-buttons">
                    <button id="download-update" class="btn-primary">${t('notifications.downloadUpdate')}</button>
                    <button id="cancel-update" class="btn-secondary">${t('notifications.updateLater')}</button>
                </div>
            </div>
        `;

        // Style the dialog
        Object.assign(dialog.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: '10000'
        });

        // Style the content
        const content = dialog.querySelector('.update-dialog-content');
        Object.assign(content.style, {
            background: 'var(--bg-primary)',
            padding: '24px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            maxWidth: '400px',
            width: '90%'
        });

        // Style buttons
        const buttons = dialog.querySelector('.update-dialog-buttons');
        Object.assign(buttons.style, {
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            marginTop: '20px'
        });

        document.body.appendChild(dialog);

        // Event listeners
        dialog.querySelector('#download-update').addEventListener('click', async () => {
            try {
                await ipcRenderer.invoke('download-update');
                dialog.remove();
            } catch (error) {
                console.error('Failed to start download:', error);
                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                this.showNotification(t('notifications.updateDownloadFailed'), 'error');
            }
        });

        dialog.querySelector('#cancel-update').addEventListener('click', () => {
            dialog.remove();
        });
    }

    showUpdateNotAvailable(info) {
        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        this.showNotification(t('notifications.updateLatestVersion', { version: info.version }), 'success');
    }

    showUpdateError(error) {
        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        this.showNotification(t('notifications.updateCheckFailed', { error: error }), 'error');
    }

    showDownloadProgress(progress) {
        const percent = Math.round(progress.percent);
        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        this.showNotification(t('notifications.downloadingUpdate', { percent }), 'info');
    }

    showUpdateDownloaded(info) {
        // This is handled by the main process with a dialog
        console.log('Update downloaded:', info);
    }

    // Sync-related methods
    async initializePhase5Features() {
        try {
            console.log('[Phase5] Initializing advanced features...');

            // Initialize Advanced Search Manager
            if (window.AdvancedSearchManager) {
                this.advancedSearchManager = new window.AdvancedSearchManager(this);
                await this.advancedSearchManager.initialize();
                console.log('[Phase5] Advanced Search initialized');
            }

            // Initialize Templates Manager
            if (window.TemplatesManager) {
                this.templatesManager = new window.TemplatesManager(this);
                await this.templatesManager.initialize();
                console.log('[Phase5] Templates initialized');
            }

            // Initialize Rich Media Manager
            if (window.RichMediaManager) {
                this.richMediaManager = new window.RichMediaManager(this);
                await this.richMediaManager.initialize();
                console.log('[Phase5] Rich Media initialized');
            }

            console.log('[Phase5] All Phase 5 features initialized successfully');

        } catch (error) {
            console.error('[Phase5] Failed to initialize Phase 5 features:', error);
            // Continue even if Phase 5 features fail
        }
    }

    async initializeSync() {
        try {
            // Quick offline check to avoid slow sync initialization when offline
            if (!navigator.onLine) {
                console.log('[Sync] Device is offline, skipping sync initialization');
                return;
            }

            // Check if sync is enabled
            if (this.notesManager && this.notesManager.db) {
                const syncEnabled = this.notesManager.db.isSyncEnabled();
                if (syncEnabled) {
                    // Initialize sync status with timeout to prevent blocking startup
                    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2000));
                    await Promise.race([this.updateSyncStatus(), timeoutPromise]);

                    // Show sync button and divider
                    const syncBtn = document.getElementById('sync-btn');
                    const syncDivider = document.querySelector('.sync-divider');
                    if (syncBtn) {
                        syncBtn.classList.remove('hidden');
                    }
                    if (syncDivider) {
                        syncDivider.classList.remove('hidden');
                    }

                    // Set up auto-sync if enabled
                    if (this.notesManager.db.isAutoSyncEnabled()) {
                        this.startAutoSync();
                    }

                    // Note: Startup sync is handled after initial note load to avoid duplicate triggers
                    // See post-load startup sync in init()
                }
            }
        } catch (error) {
            console.error('[Sync] Failed to initialize sync:', error);
        }
    }

    async updateSyncStatus() {
        try {
            if (!this.backendAPI) return;

            const status = await this.backendAPI.getGoogleDriveSyncStatus();
            console.log('[UI] Received sync status:', status);
            this.syncStatus = { ...this.syncStatus, ...status };

            // Prefer renderer DB for syncEnabled state to reflect user's choice in the UI
            if (this.notesManager && this.notesManager.db) {
                if (this.notesManager.db.isSyncEnabled()) {
                    this.syncStatus.syncEnabled = true;
                }
            }

            this.updateSyncUI();
        } catch (error) {
            console.error('[Sync] Failed to update sync status:', error);
        }
    }

    async handleSyncDataUpdated(syncData) {
        try {
            console.log('[Sync] Received updated data from sync, updating local data...');

            // Update localStorage with the new data
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('cognotez_data', syncData.data);

                // Also update the renderer process's database instance if it exists
                if (this.notesManager && this.notesManager.db && this.notesManager.db.initialized) {
                    console.log('[Sync] Updating renderer database with sync data');
                    let parsedData = null;
                    try {
                        parsedData = typeof syncData.data === 'string' ? JSON.parse(syncData.data) : (syncData.data || syncData);
                    } catch (e) {
                        console.warn('[Sync] Failed to parse sync data JSON, attempting raw import', e);
                    }

                    // Prefer importing parsed object to ensure DB gets updated
                    const importResult = parsedData
                        ? this.notesManager.db.importDataFromSync(parsedData, { mergeStrategy: 'replace', force: true, preserveSyncMeta: false })
                        : { success: this.notesManager.db.importDataFromJSON(syncData.data) };
                    if (!importResult.success) {
                        console.warn('[Sync] Failed to update renderer database:', importResult.error);
                    }
                }

                // Reload notes from the updated data
                await this.loadNotes();

                // Update UI to reflect the changes
                this.updateSyncStatus();

                // Notification is handled centrally in handleSyncCompleted to avoid duplicates

            } else {
                console.error('[Sync] localStorage not available in renderer process');
            }

        } catch (error) {
            console.error('[Sync] Failed to handle sync data update:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('settings.sync.failedToUpdateLocalData'), 'error');
        }
    }

    async handleSyncCompleted(syncResult) {
        try {
            console.log('[Sync] Sync completed, refreshing UI...');

            // Refresh notes list
            await this.loadNotes();

            // Update sync status UI
            this.updateSyncStatus();

            // If sync failed, show a single error notification and exit
            if (syncResult && syncResult.success === false) {
                const errorMessage = syncResult.error
                    ? (window.i18n ? window.i18n.t('notifications.syncFailed', { error: syncResult.error }) : `Sync failed: ${syncResult.error}`)
                    : (window.i18n ? window.i18n.t('notifications.syncFailedGeneric') : 'Sync failed');
                this.showNotification(errorMessage, 'error');
                return;
            }

            // Show notification about the sync completion
            const baseMessage = window.i18n ? window.i18n.t('notifications.syncCompleted') : 'Sync completed successfully';
            let message = baseMessage;
            if (syncResult.action) {
                message += ` - ${syncResult.action}`;
            }
            if (syncResult.stats) {
                const stats = syncResult.stats;
                if (stats.downloaded > 0) {
                    const dl = window.i18n
                        ? window.i18n.t('notifications.syncStatsDownloaded', { count: stats.downloaded })
                        : `${stats.downloaded} downloaded`;
                    message += ` (${dl})`;
                }
                if (stats.uploaded > 0) {
                    const ul = window.i18n
                        ? window.i18n.t('notifications.syncStatsUploaded', { count: stats.uploaded })
                        : `${stats.uploaded} uploaded`;
                    message += ` (${ul})`;
                }
            }
            this.showNotification(message, 'success');

            console.log('[Sync] UI refreshed after sync completion');
        } catch (error) {
            console.error('[Sync] Failed to handle sync completion:', error);
            const msg = window.i18n
                ? window.i18n.t('notifications.syncRefreshFailed')
                : 'Sync completed but UI refresh failed';
            this.showNotification(msg, 'warning');
        }
    }

    handleEncryptionSettingsUpdated(settings) {
        try {
            console.log('[Encryption] handleEncryptionSettingsUpdated called with:', {
                enabled: settings.enabled,
                hasPassphrase: !!settings.passphrase,
                hasSalt: !!settings.saltBase64
            });

            // Update any open modal with the new settings
            const openModal = document.querySelector('.modal');
            if (openModal) {
                console.log('[Encryption] Updating modal with new settings');
                this.updateModalEncryptionStatus(openModal, settings);
            } else {
                console.log('[Encryption] No open modal found to update');
            }

            // Show notification about the change
            const statusText = settings.enabled ? 'enabled' : 'disabled';
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            const statusKey = settings.enabled ? 'notifications.encryptionEnabled' : 'notifications.encryptionDisabled';
            this.showNotification(t(statusKey), 'success');

        } catch (error) {
            console.error('[Encryption] Failed to handle settings update:', error);
        }
    }

    updateSyncUI() {
        const syncBtn = document.getElementById('sync-btn');
        const icon = document.getElementById('sync-btn-icon');
        const text = document.getElementById('sync-btn-text');

        if (!syncBtn || !icon || !text) return;

        console.log('[UI] Updating sync UI with status:', {
            isAuthenticated: this.syncStatus.isAuthenticated,
            syncEnabled: this.syncStatus.syncEnabled,
            inProgress: this.syncStatus.inProgress
        });

        // Check if we're offline
        const isOnline = navigator.onLine;

        // Determine if content is in sync using checksums when available
        const contentInSync = !!(this.syncStatus.localChecksum && this.syncStatus.remoteChecksum && this.syncStatus.localChecksum === this.syncStatus.remoteChecksum);

        // Reset all status classes
        syncBtn.classList.remove('connected', 'disconnected', 'syncing', 'error');

        const t = (key, fallback, params = {}) => window.i18n ? window.i18n.t(key, params) : fallback;

        // Update sync button based on status
        if (this.syncStatus.inProgress) {
            syncBtn.classList.add('syncing');
            icon.className = 'fas fa-sync-alt';
            text.textContent = t('settings.sync.statusSyncing', 'Syncing...');
            syncBtn.disabled = true;
            syncBtn.title = t('settings.sync.statusSyncingTooltip', 'Sync in progress...');
        } else if (!isOnline) {
            // Show offline state
            syncBtn.classList.add('disconnected');
            icon.className = 'fas fa-wifi-slash';
            text.textContent = t('settings.sync.statusOffline', 'Offline');
            syncBtn.disabled = true;
            syncBtn.title = t('notifications.noInternet', 'No internet connection');
        } else if (this.syncStatus.isAuthenticated) {
            if (contentInSync) {
                syncBtn.classList.add('connected');
                icon.className = 'fas fa-cloud-check';
                text.textContent = t('settings.sync.statusConnected', 'Synced');
                syncBtn.disabled = false;
                syncBtn.title = t('settings.sync.statusConnectedTooltip', 'In sync - Click to sync manually');
            } else {
                syncBtn.classList.add('disconnected');
                icon.className = 'fas fa-cloud-upload-alt';
                text.textContent = t('settings.sync.statusSyncAvailable', 'Sync');
                syncBtn.disabled = false;
                syncBtn.title = t('settings.sync.statusSyncAvailableTooltip', 'Click to sync with Google Drive');
            }
        } else {
            syncBtn.classList.add('disconnected');
            icon.className = 'fas fa-cloud-slash';
            text.textContent = t('settings.sync.statusNotConnected', 'Not connected');
            syncBtn.disabled = true;
            syncBtn.title = t('settings.sync.statusNotConnectedTooltip', 'Not connected to Google Drive');
        }

        // Update last sync time in settings modal if open
        const lastSyncElement = document.getElementById('google-drive-last-sync');
        if (lastSyncElement && this.syncStatus.lastSync) {
            const lastSyncDate = new Date(this.syncStatus.lastSync);
            const timeAgo = this.getTimeAgo(lastSyncDate);
            const label = window.i18n
                ? window.i18n.t('settings.sync.lastSynced', { timeAgo })
                : `Last synced: ${timeAgo}`;
            lastSyncElement.textContent = label;
        }
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) {
            return window.i18n ? window.i18n.t('settings.sync.timeJustNow', 'just now') : 'just now';
        }
        if (diffMins < 60) {
            return window.i18n ? window.i18n.t('settings.sync.timeMinutesAgo', { count: diffMins }) : `${diffMins}m ago`;
        }
        if (diffHours < 24) {
            return window.i18n ? window.i18n.t('settings.sync.timeHoursAgo', { count: diffHours }) : `${diffHours}h ago`;
        }
        if (diffDays < 7) {
            return window.i18n ? window.i18n.t('settings.sync.timeDaysAgo', { count: diffDays }) : `${diffDays}d ago`;
        }

        return this.formatLocalizedDateTime(date, false);
    }

    showSyncSettings() {
        try {
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            const content = `
                <div style="max-width: 700px;">
                    <div style="margin-bottom: 24px;">
                        <h4 style="margin: 0 0 16px 0; color: var(--text-primary);"><i class="fas fa-cloud"></i> ${t('settings.sync.title', 'Google Drive Sync Settings')}</h4>
                    </div>

                    <div id="sync-settings-content">
                        <!-- Status Section -->
                        <div class="sync-section" style="margin-bottom: 24px;">
                            <div id="sync-status-display">
                                <div class="sync-status-card" style="background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                                    <div class="sync-status-header" style="display: flex; align-items: center; margin-bottom: 12px;">
                                        <div class="sync-status-indicator" id="modal-sync-indicator" style="width: 12px; height: 12px; border-radius: 50%; margin-right: 8px;"></div>
                                        <span class="sync-status-text" id="modal-sync-status-text" style="font-weight: 500;">${t('settings.sync.statusLoading', 'Loading...')}</span>
                                    </div>
                                    <div class="sync-last-sync" id="modal-sync-last-sync" style="font-size: 0.9rem; color: var(--text-secondary);"></div>
                                    <div class="sync-buttons" style="margin-top: 12px;">
                                        <button id="modal-google-drive-connect-btn" class="sync-button" style="background: var(--accent-color); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; margin-right: 8px;">${t('settings.sync.connectGoogleDrive', 'Connect Google Drive')}</button>
                                        <button id="modal-google-drive-disconnect-btn" class="sync-button" style="background: var(--surface-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; margin-right: 8px; display: none;">${t('settings.sync.disconnect', 'Disconnect')}</button>
                                        <button id="modal-google-drive-sync-btn" class="sync-button" style="background: var(--surface-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem;" disabled>${t('settings.sync.syncNow', 'Sync Now')}</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Options Section -->
                        <div class="sync-section" style="margin-bottom: 24px;">
                            <h5 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;">${t('settings.sync.syncOptions', 'Sync Options')}</h5>
                            <div class="sync-options" style="display: grid; gap: 12px;">
                                <div class="sync-option" style="display: flex; align-items: center; padding: 12px; background: var(--surface-bg); border-radius: 6px; border: 1px solid var(--border-color);">
                                    <input type="checkbox" id="modal-auto-sync" style="margin-right: 12px;">
                                    <div>
                                        <label for="modal-auto-sync" style="cursor: pointer; color: var(--text-primary); font-weight: 500;">${t('settings.sync.autoSyncLabel', 'Automatic Sync')}</label>
                                        <div class="sync-option-description" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">${t('settings.sync.autoSyncDescription', 'Automatically sync changes every 5 minutes when connected')}</div>
                                    </div>
                                </div>
                                <div class="sync-option" style="display: flex; align-items: center; padding: 12px; background: var(--surface-bg); border-radius: 6px; border: 1px solid var(--border-color);">
                                    <input type="checkbox" id="modal-sync-on-startup" style="margin-right: 12px;">
                                    <div>
                                        <label for="modal-sync-on-startup" style="cursor: pointer; color: var(--text-primary); font-weight: 500;">${t('settings.sync.syncOnStartupLabel', 'Sync on Startup')}</label>
                                        <div class="sync-option-description" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">${t('settings.sync.syncOnStartupDescription', 'Sync data when the application starts')}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Encryption Section -->
                        <div class="sync-section" style="margin-bottom: 24px;">
                            <h5 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;"><i class="fas fa-lock"></i> ${t('settings.sync.encryptionSectionTitle', 'End-to-End Encryption')}</h5>
                            <div class="sync-encryption-section" style="background: var(--surface-bg); border-radius: 6px; padding: 16px; border: 1px solid var(--border-color);">
                                <div class="encryption-status" id="encryption-status" style="margin-bottom: 16px;">
                                    <div style="display: flex; align-items: center; margin-bottom: 8px;">
                                        <div id="encryption-indicator" style="width: 12px; height: 12px; border-radius: 50%; margin-right: 8px;"></div>
                                        <span id="encryption-status-text" style="font-weight: 500;"></span>
                                    </div>
                                    <div id="encryption-description" style="font-size: 0.85rem; color: var(--text-secondary);"></div>
                                </div>

                                <div class="encryption-controls" id="encryption-controls">
                                    <div class="sync-option" style="display: flex; align-items: center; padding: 12px; background: var(--surface-bg); border-radius: 6px; border: 1px solid var(--border-color); margin-bottom: 12px;">
                                        <input type="checkbox" id="modal-encryption-enabled" style="margin-right: 12px;">
                                        <div>
                                            <label for="modal-encryption-enabled" style="cursor: pointer; color: var(--text-primary); font-weight: 500;">${t('settings.sync.enableEncryption', 'Enable End-to-End Encryption')}</label>
                                            <div class="sync-option-description" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">${t('settings.sync.encryptionDescription', 'Encrypt your data before uploading to Google Drive. Your data will only be accessible with your passphrase.')}</div>
                                        </div>
                                    </div>

                                    <div class="encryption-passphrase-section" id="encryption-passphrase-section" style="display: none;">
                                        <div style="margin-bottom: 12px;">
                                            <label for="modal-encryption-passphrase" style="display: block; margin-bottom: 4px; color: var(--text-primary); font-weight: 500;">${t('settings.sync.passphraseLabel', 'Passphrase')}</label>
                                            <input type="password" id="modal-encryption-passphrase" placeholder="${t('settings.sync.passphrasePlaceholder', 'Enter your passphrase (min. 8 characters)')}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-color);">
                                            <div class="encryption-passphrase-help" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
                                                ${t('settings.sync.passphraseHelp', 'Your passphrase is used to encrypt and decrypt your data. Choose a strong passphrase and keep it safe.')}
                                            </div>
                                        </div>

                                        <div style="margin-bottom: 12px;">
                                            <label for="modal-encryption-passphrase-confirm" style="display: block; margin-bottom: 4px; color: var(--text-primary); font-weight: 500;">${t('settings.sync.confirmPassphraseLabel', 'Confirm Passphrase')}</label>
                                            <input type="password" id="modal-encryption-passphrase-confirm" placeholder="${t('settings.sync.confirmPassphrasePlaceholder', 'Confirm your passphrase')}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-color);">
                                        </div>

                                        <div class="encryption-buttons" style="display: flex; gap: 8px;">
                                            <button id="modal-encryption-save-btn" class="sync-button" style="background: var(--accent-color); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">${t('settings.sync.saveEncryption', 'Save Encryption Settings')}</button>
                                            <button id="modal-encryption-cancel-btn" class="sync-button" style="background: var(--surface-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">${t('settings.sync.cancel', 'Cancel')}</button>
                                        </div>

                                        <div id="encryption-validation" style="margin-top: 8px; font-size: 0.8rem;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Conflicts Section (hidden by default) -->
                        <div id="modal-conflicts-section" class="sync-section" style="display: none;">
                            <h5 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;">${t('settings.sync.conflictsTitle', 'Sync Conflicts')}</h5>
                            <div id="modal-conflicts-list" style="background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 16px;">
                                <!-- Conflicts will be populated here -->
                            </div>
                        </div>

                        <!-- Setup Section -->
                        <div class="sync-section">
                            <h5 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;">${t('settings.sync.setupInstructions', 'Setup Instructions')}</h5>
                            <div class="sync-setup-section" style="background: var(--surface-bg); border-radius: 6px; padding: 16px; border: 1px solid var(--border-color);">
                                <div class="sync-setup-steps" style="counter-reset: step-counter;">
                                    <div class="sync-setup-step" style="counter-increment: step-counter; margin-bottom: 12px; position: relative; padding-left: 32px;">
                                        <div style="position: absolute; left: 0; top: 0; width: 24px; height: 24px; background: var(--accent-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600;">1</div>
                                        <h6 style="margin: 0 0 4px 0; font-size: 0.9rem; color: var(--text-primary);">${t('settings.sync.step1Title', 'Create Google Cloud Project')}</h6>
                                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">${t('settings.sync.step1Description', 'Go to Google Cloud Console and create a new project.')}</p>
                                    </div>
                                    <div class="sync-setup-step" style="counter-increment: step-counter; margin-bottom: 12px; position: relative; padding-left: 32px;">
                                        <div style="position: absolute; left: 0; top: 0; width: 24px; height: 24px; background: var(--accent-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600;">2</div>
                                        <h6 style="margin: 0 0 4px 0; font-size: 0.9rem; color: var(--text-primary);">${t('settings.sync.step2Title', 'Enable Google Drive API')}</h6>
                                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">${t('settings.sync.step2Description', 'In the Cloud Console, enable the Google Drive API for your project.')}</p>
                                    </div>
                                    <div class="sync-setup-step" style="counter-increment: step-counter; margin-bottom: 12px; position: relative; padding-left: 32px;">
                                        <div style="position: absolute; left: 0; top: 0; width: 24px; height: 24px; background: var(--accent-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600;">3</div>
                                        <h6 style="margin: 0 0 4px 0; font-size: 0.9rem; color: var(--text-primary);">${t('settings.sync.step3Title', 'Import Credentials')}</h6>
                                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">${t('settings.sync.step3Description', 'Download your OAuth client credentials JSON and import it into CogNotez.')}</p>
                                    </div>
                                </div>

                                <div style="margin-top: 16px;">
                                    <button id="modal-import-credentials-btn" class="sync-button" style="background: var(--surface-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">${t('settings.sync.importCredentialsButton', 'Import Credentials File')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const modalTitle = t('settings.sync.cloudTitle', 'Cloud Sync Settings');
            const closeLabel = window.i18n ? window.i18n.t('modals.close') : 'Close';
            const modal = this.createModal(modalTitle, content, [
                { text: closeLabel, type: 'secondary', action: 'close-sync-settings' }
            ]);

            // Initialize sync status in modal
            this.initializeModalSyncHandlers(modal);

            // Initialize encryption status in modal
            this.initializeModalEncryptionHandlers(modal);

        } catch (error) {
            console.error('[Sync] Failed to show sync settings modal:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('settings.sync.failedToOpenSyncSettings'), 'error');
        }
    }

    async initializeModalSyncHandlers(modal) {
        try {
            // Get sync status and update modal
            await this.updateModalSyncStatus(modal);

            // Setup event listeners for modal buttons
            const connectBtn = modal.querySelector('#modal-google-drive-connect-btn');
            const disconnectBtn = modal.querySelector('#modal-google-drive-disconnect-btn');
            const syncBtn = modal.querySelector('#modal-google-drive-sync-btn');
            const importBtn = modal.querySelector('#modal-import-credentials-btn');
            const autoSyncCheckbox = modal.querySelector('#modal-auto-sync');
            const startupSyncCheckbox = modal.querySelector('#modal-sync-on-startup');

            // Encryption controls
            const encryptionEnabledCheckbox = modal.querySelector('#modal-encryption-enabled');
            const encryptionPassphraseInput = modal.querySelector('#modal-encryption-passphrase');
            const encryptionPassphraseConfirmInput = modal.querySelector('#modal-encryption-passphrase-confirm');
            const encryptionSaveBtn = modal.querySelector('#modal-encryption-save-btn');
            const encryptionCancelBtn = modal.querySelector('#modal-encryption-cancel-btn');
            const encryptionPassphraseSection = modal.querySelector('#encryption-passphrase-section');
            const encryptionStatus = modal.querySelector('#encryption-status');
            const encryptionIndicator = modal.querySelector('#encryption-indicator');
            const encryptionStatusText = modal.querySelector('#encryption-status-text');
            const encryptionDescription = modal.querySelector('#encryption-description');
            const encryptionValidation = modal.querySelector('#encryption-validation');

            // Connect button
            connectBtn.addEventListener('click', async () => {
                try {
                    connectBtn.disabled = true;
                    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                    connectBtn.textContent = t('settings.sync.statusConnecting', 'Connecting...');

                    const result = await this.backendAPI.connectGoogleDrive();

                    if (result.success) {
                        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                        this.showNotification(result.message || t('settings.sync.connectedSuccessfully', 'Successfully connected to Google Drive'), 'success');
                        await this.updateModalSyncStatus(modal);
                        await this.updateSyncStatus(); // Update main UI
                        
                        // Close the sync settings modal and show restart dialog
                        this.closeModal(modal);
                        setTimeout(() => {
                            this.showRestartDialog('Google Drive connection requires an app restart to sync properly.');
                        }, 500);
                    } else {
                        // Don't show notification here - let the IPC error event handler do it
                        // This prevents duplicate notifications
                        console.log('[Sync] Google Drive connection failed:', result.error);
                    }
                } catch (error) {
                    // Don't show notification here - let the IPC error event handler do it
                    // This prevents duplicate notifications
                    console.error('[Sync] Failed to connect Google Drive:', error);
                } finally {
                    connectBtn.disabled = false;
                    connectBtn.textContent = t('settings.sync.connectGoogleDrive', 'Connect Google Drive');
                }
            });

            // Disconnect button
            disconnectBtn.addEventListener('click', async () => {
                try {
                    disconnectBtn.disabled = true;
                    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                    disconnectBtn.textContent = t('settings.sync.statusDisconnecting', 'Disconnecting...');

                    const result = await this.backendAPI.disconnectGoogleDrive();

                    if (result.success) {
                        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                        this.showNotification(t('settings.sync.disconnectedSuccessfully', 'Successfully disconnected from Google Drive'), 'success');
                        await this.updateModalSyncStatus(modal);
                        await this.updateSyncStatus(); // Update main UI
                        
                        // Close the sync settings modal and show restart dialog
                        this.closeModal(modal);
                        setTimeout(() => {
                            this.showRestartDialog('Google Drive disconnection requires an app restart to complete.');
                        }, 500);
                    } else {
                        this.showNotification(result.error || 'Failed to disconnect from Google Drive', 'error');
                    }
                } catch (error) {
                    console.error('[Sync] Failed to disconnect Google Drive:', error);
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(t('settings.sync.failedToDisconnect'), 'error');
                } finally {
                    disconnectBtn.disabled = false;
                    disconnectBtn.textContent = t('settings.sync.disconnect', 'Disconnect');
                }
            });

            // Sync now button
            syncBtn.addEventListener('click', async () => {
                try {
                    syncBtn.disabled = true;
                    const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
                    syncBtn.textContent = t('settings.sync.statusSyncing', 'Syncing...');

                    // Export local data from the renderer process database manager
                    let localData = null;
                    let localChecksum = null;
                    if (this.notesManager && this.notesManager.db) {
                        const exportResult = this.notesManager.db.exportDataForSync();
                        localData = exportResult.data;
                        localChecksum = exportResult.checksum;
                    }

                    const lastSync = (this.notesManager && this.notesManager.db) ? this.notesManager.db.getSyncMetadata().lastSync : null;
                    const result = await this.backendAPI.syncWithGoogleDrive({ localData, localChecksum, lastSync });

                    if (result.success) {
                        // Success notification handled by sync-completed event
                        await this.updateModalSyncStatus(modal);
                        await this.updateSyncStatus(); // Update main UI
                    } else if (result && result.encryptionRequired) {
                        // Prompt for passphrase immediately
                        await this.promptForDecryptionPassphrase({ message: 'Cloud data is encrypted. Enter your passphrase to decrypt.' });
                    } else {
                        // Error notification handled by sync-completed event
                    }
                } catch (error) {
                    console.error('[Sync] Manual sync failed:', error);
                    // Error notification handled by sync-completed event
                } finally {
                    syncBtn.disabled = false;
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    syncBtn.textContent = t('settings.sync.syncNow');
                }
            });

            // Import credentials button
            importBtn.addEventListener('click', async () => {
                try {
                    const { ipcRenderer } = require('electron');

                    const result = await ipcRenderer.invoke('show-open-dialog', {
                        filters: [
                            { name: 'JSON Files', extensions: ['json'] },
                            { name: 'All Files', extensions: ['*'] }
                        ],
                        properties: ['openFile']
                    });

                    if (!result.canceled && result.filePaths.length > 0) {
                        importBtn.disabled = true;
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        importBtn.textContent = t('settings.sync.importing');

                        const credentialsPath = result.filePaths[0];
                        const setupResult = await this.backendAPI.setupGoogleDriveCredentials(credentialsPath);

                        if (setupResult.success) {
                            const t = (key) => window.i18n ? window.i18n.t(key) : key;
                            this.showNotification(t('settings.sync.credentialsImportedSuccess'), 'success');
                            // Update modal to show connection options
                            modal.querySelector('.sync-setup-section').style.display = 'none';
                        } else {
                            this.showNotification(setupResult.error || 'Failed to import credentials', 'error');
                        }
                    }
                } catch (error) {
                    console.error('[Sync] Failed to import credentials:', error);
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(t('settings.sync.failedToImportCredentials'), 'error');
                } finally {
                    importBtn.disabled = false;
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    importBtn.textContent = t('settings.sync.importCredentialsButton');
                }
            });

            // Auto sync checkbox
            autoSyncCheckbox.addEventListener('change', async () => {
                try {
                    const enabled = autoSyncCheckbox.checked;

                    if (!this.notesManager || !this.notesManager.db) {
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.databaseNotAvailable'), 'error');
                        return;
                    }

                    const db = this.notesManager.db;
                    db.setAutoSync(enabled);

                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    const syncKey = enabled ? 'notifications.autoSyncEnabled' : 'notifications.autoSyncDisabled';
                    this.showNotification(t(syncKey), 'info');

                    if (enabled) {
                        this.startAutoSync();
                    } else {
                        this.stopAutoSync();
                    }
                } catch (error) {
                    console.error('[Sync] Failed to toggle auto sync:', error);
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(t('settings.sync.failedToUpdateAutoSync'), 'error');
                }
            });

            // Sync on startup checkbox
            startupSyncCheckbox.addEventListener('change', async () => {
                try {
                    const enabled = startupSyncCheckbox.checked;

                    if (!this.notesManager || !this.notesManager.db) {
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.databaseNotAvailable'), 'error');
                        return;
                    }

                    const db = this.notesManager.db;
                    db.updateSyncMetadata({ syncOnStartup: enabled });

                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    const startupKey = enabled ? 'notifications.syncOnStartupEnabled' : 'notifications.syncOnStartupDisabled';
                    this.showNotification(t(startupKey), 'info');
                } catch (error) {
                    console.error('[Sync] Failed to toggle sync on startup:', error);
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(t('settings.sync.failedToUpdateSyncOnStartup'), 'error');
                }
            });

        } catch (error) {
            console.error('[Sync] Failed to initialize modal handlers:', error);
        }
    }

    async updateModalSyncStatus(modal) {
        try {
            if (!this.backendAPI) return;

            const status = await this.backendAPI.getGoogleDriveSyncStatus();

            const indicator = modal.querySelector('#modal-sync-indicator');
            const statusText = modal.querySelector('#modal-sync-status-text');
            const lastSync = modal.querySelector('#modal-sync-last-sync');
            const connectBtn = modal.querySelector('#modal-google-drive-connect-btn');
            const disconnectBtn = modal.querySelector('#modal-google-drive-disconnect-btn');
            const syncBtn = modal.querySelector('#modal-google-drive-sync-btn');
            const autoSyncCheckbox = modal.querySelector('#modal-auto-sync');
            const startupSyncCheckbox = modal.querySelector('#modal-sync-on-startup');

            if (!indicator || !statusText) return;

            // Initialize checkbox states from database (renderer)
            if (this.notesManager && this.notesManager.db) {
                const db = this.notesManager.db;
                const syncMetadata = db.getSyncMetadata();

                if (autoSyncCheckbox) {
                    autoSyncCheckbox.checked = syncMetadata.autoSync || false;
                }
                if (startupSyncCheckbox) {
                    startupSyncCheckbox.checked = syncMetadata.syncOnStartup || false;
                }
            }

            // Prefer renderer DB for syncEnabled since main-process DB doesn't persist localStorage
            const rendererSyncEnabled = (this.notesManager && this.notesManager.db) ? this.notesManager.db.isSyncEnabled() : false;

            // Update status indicator
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            if (status.isAuthenticated && (status.syncEnabled || rendererSyncEnabled)) {
                indicator.style.backgroundColor = 'var(--success-color)';
                statusText.textContent = t('settings.sync.statusConnectedLabel', 'Connected');
                connectBtn.style.display = 'none';
                disconnectBtn.style.display = 'inline-block';
                syncBtn.disabled = false;
            } else if (status.isAuthenticated) {
                indicator.style.backgroundColor = 'var(--warning-color)';
                statusText.textContent = t('settings.sync.statusReadyToSync', 'Ready to sync');
                connectBtn.style.display = 'none';
                disconnectBtn.style.display = 'inline-block';
                syncBtn.disabled = false;
            } else {
                indicator.style.backgroundColor = 'var(--error-color)';
                statusText.textContent = t('settings.sync.statusNotConnected', 'Not connected');
                connectBtn.style.display = 'inline-block';
                disconnectBtn.style.display = 'none';
                syncBtn.disabled = true;

                // Add a note about credentials if they're missing
                if (status.error && (status.error.includes('credentials not found') || status.error.includes('Google Drive credentials'))) {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    statusText.textContent = t('settings.sync.setupRequired');
                    lastSync.textContent = t('settings.sync.importCredentialsToStart');
                }
            }

            // Update last sync time
            if (status.lastSync) {
                const lastSyncDate = new Date(status.lastSync);
                const timeAgo = this.getTimeAgo(lastSyncDate);
                lastSync.textContent = window.i18n
                    ? window.i18n.t('settings.sync.lastSynced', { timeAgo })
                    : `Last synced: ${timeAgo}`;
            } else {
                lastSync.textContent = window.i18n
                    ? window.i18n.t('settings.sync.neverSynced')
                    : 'Never synced';
            }

            // Check for and display conflicts
            await this.displayModalConflicts(modal);

        } catch (error) {
            console.error('[Sync] Failed to update modal sync status:', error);
        }
    }

    async initializeModalEncryptionHandlers(modal) {
        try {
            const { ipcRenderer } = require('electron');

            // Get current encryption settings
            const encryptionResult = await ipcRenderer.invoke('get-encryption-settings');
            if (!encryptionResult.success) {
                console.error('[Encryption] Failed to get encryption settings:', encryptionResult.error);
                return;
            }

            const settings = encryptionResult.settings;
            this.updateModalEncryptionStatus(modal, settings);

            // Encryption enabled checkbox
            const encryptionEnabledCheckbox = modal.querySelector('#modal-encryption-enabled');
            const encryptionPassphraseSection = modal.querySelector('#encryption-passphrase-section');
            const encryptionPassphraseInput = modal.querySelector('#modal-encryption-passphrase');
            const encryptionPassphraseConfirmInput = modal.querySelector('#modal-encryption-passphrase-confirm');
            const encryptionSaveBtn = modal.querySelector('#modal-encryption-save-btn');
            const encryptionCancelBtn = modal.querySelector('#modal-encryption-cancel-btn');
            const encryptionValidation = modal.querySelector('#encryption-validation');

            // Enable/disable checkbox - remove existing listeners to prevent duplicates
            encryptionEnabledCheckbox.checked = settings.enabled;

            // Clone and replace the checkbox to remove all existing event listeners
            const newCheckbox = encryptionEnabledCheckbox.cloneNode(true);
            encryptionEnabledCheckbox.parentNode.replaceChild(newCheckbox, encryptionEnabledCheckbox);

            const updateEncryptionControlsUI = (isEnabled) => {
                // Always keep section visible so Save button is accessible
                encryptionPassphraseSection.style.display = 'block';

                if (isEnabled) {
                    // Show inputs when enabling
                    encryptionPassphraseInput.style.display = '';
                    encryptionPassphraseConfirmInput.style.display = '';
                    encryptionValidation.style.display = '';
                    encryptionSaveBtn.textContent = window.i18n
                        ? window.i18n.t('settings.sync.saveEncryption')
                        : 'Save Encryption Settings';
                } else {
                    // Hide inputs when disabling but keep Save button visible
                    encryptionPassphraseInput.style.display = 'none';
                    encryptionPassphraseConfirmInput.style.display = 'none';
                    encryptionValidation.style.display = 'none';
                    encryptionPassphraseInput.value = '';
                    encryptionPassphraseConfirmInput.value = '';
                    encryptionValidation.textContent = '';
                    encryptionSaveBtn.textContent = window.i18n
                        ? window.i18n.t('settings.sync.disableEncryption', 'Disable Encryption')
                        : 'Disable Encryption';
                }
            };

            newCheckbox.addEventListener('change', () => {
                updateEncryptionControlsUI(newCheckbox.checked);
                if (newCheckbox.checked) {
                    encryptionPassphraseInput.focus();
                }
            });

            // Initialize controls based on current setting
            updateEncryptionControlsUI(settings.enabled);

            // Passphrase validation
            const validatePassphrases = () => {
                const passphrase = encryptionPassphraseInput.value;
                const confirmPassphrase = encryptionPassphraseConfirmInput.value;

                if (!passphrase) {
                    encryptionValidation.textContent = '';
                    return;
                }

                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                if (passphrase.length < 8) {
                    encryptionValidation.textContent = t('encryption.passphraseMinLengthLong');
                    encryptionValidation.style.color = 'var(--error-color)';
                    return;
                }

                if (passphrase !== confirmPassphrase) {
                    encryptionValidation.textContent = t('encryption.passphrasesDoNotMatch');
                    encryptionValidation.style.color = 'var(--error-color)';
                    return;
                }

                encryptionValidation.textContent = t('encryption.passphrasesMatch');
                encryptionValidation.style.color = 'var(--success-color)';
            };

            encryptionPassphraseInput.addEventListener('input', validatePassphrases);
            encryptionPassphraseConfirmInput.addEventListener('input', validatePassphrases);

            // Save button
            encryptionSaveBtn.addEventListener('click', async () => {
                try {
                    const passphrase = encryptionPassphraseInput.value;
                    const confirmPassphrase = encryptionPassphraseConfirmInput.value;
                    const enabled = newCheckbox.checked;

                    // Always compute a salt value to send (null if not used)
                    let saltToUse = settings.saltBase64 || null;

                    if (enabled) {
                        if (!passphrase) {
                            const t = (key) => window.i18n ? window.i18n.t(key) : key;
                            this.showNotification(t('encryption.passphraseRequired'), 'error');
                            return;
                        }

                        if (passphrase.length < 8) {
                            const t = (key) => window.i18n ? window.i18n.t(key) : key;
                            this.showNotification(t('encryption.passphraseMinLengthLong'), 'error');
                            return;
                        }

                        if (passphrase !== confirmPassphrase) {
                            const t = (key) => window.i18n ? window.i18n.t(key) : key;
                            this.showNotification(t('encryption.passphrasesDoNotMatch'), 'error');
                            return;
                        }

                        // Generate salt if needed for first-time encryption setup
                        if (!saltToUse) {
                            const saltResult = await ipcRenderer.invoke('derive-salt-from-passphrase', passphrase);
                            if (!saltResult.success) {
                                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                                this.showNotification(t('encryption.failedToDeriveSalt', { error: saltResult.error }), 'error');
                                return;
                            }
                            saltToUse = saltResult.saltBase64;
                        }

                        // Validate with backend
                        const validationResult = await ipcRenderer.invoke('validate-encryption-settings', {
                            passphrase: passphrase,
                            saltBase64: saltToUse
                        });

                        if (!validationResult.success || !validationResult.isValid) {
                            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                            this.showNotification(t('notifications.invalidEncryptionSettings', { errors: validationResult.errors?.join(', ') || 'Unknown error' }), 'error');
                            return;
                        }
                    }

                    encryptionSaveBtn.disabled = true;
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    encryptionSaveBtn.textContent = t('encryption.saving');

                    console.log('[Encryption] Sending settings:', {
                        enabled: enabled,
                        hasPassphrase: !!passphrase,
                        hasSalt: !!saltToUse,
                        iterations: settings.iterations
                    });

                    const saveResult = await ipcRenderer.invoke('set-encryption-settings', {
                        enabled: enabled,
                        // When disabling, explicitly clear passphrase to null so DB doesn't retain it
                        passphrase: enabled ? passphrase : null,
                        saltBase64: enabled ? saltToUse : null,
                        iterations: settings.iterations
                    });

                    console.log('[Encryption] Save result:', saveResult);

                    if (saveResult.success) {
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        this.showNotification(t('encryption.encryptionSettingsSaved'), 'success');
                        this.updateModalEncryptionStatus(modal, saveResult.settings);
                        await this.updateModalSyncStatus(modal); // Refresh sync status

                        // Reset form
                        encryptionPassphraseInput.value = '';
                        encryptionPassphraseConfirmInput.value = '';
                        encryptionValidation.textContent = '';
                        // Keep section visible; UI will reflect current state via updateModalEncryptionStatus
                    } else {
                        this.showNotification(saveResult.error || 'Failed to save encryption settings', 'error');
                    }
                } catch (error) {
                    console.error('[Encryption] Failed to save settings:', error);
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(t('encryption.failedToSaveEncryptionSettings'), 'error');
                } finally {
                    encryptionSaveBtn.disabled = false;
                    encryptionSaveBtn.textContent = window.i18n
                        ? window.i18n.t('settings.sync.saveEncryption')
                        : 'Save Encryption Settings';
                }
            });

            // Cancel button
            encryptionCancelBtn.addEventListener('click', () => {
                encryptionPassphraseInput.value = '';
                encryptionPassphraseConfirmInput.value = '';
                encryptionValidation.textContent = '';
                newCheckbox.checked = settings.enabled;
                updateEncryptionControlsUI(settings.enabled);
            });

        } catch (error) {
            console.error('[Encryption] Failed to initialize encryption handlers:', error);
        }
    }

    updateModalEncryptionStatus(modal, settings) {
        try {
            const encryptionIndicator = modal.querySelector('#encryption-indicator');
            const encryptionStatusText = modal.querySelector('#encryption-status-text');
            const encryptionDescription = modal.querySelector('#encryption-description');
            const encryptionEnabledCheckbox = modal.querySelector('#modal-encryption-enabled');
            const encryptionPassphraseSection = modal.querySelector('#encryption-passphrase-section');

            if (!encryptionEnabledCheckbox) return;

            if (settings.enabled) {
                encryptionIndicator.style.backgroundColor = 'var(--success-color)';
                encryptionStatusText.textContent = window.i18n ? window.i18n.t('encryption.enabledTitle') : 'Encryption Enabled';
                encryptionDescription.textContent = window.i18n ? window.i18n.t('encryption.enabledDescription') : 'Your data is encrypted before being uploaded to Google Drive.';
                encryptionEnabledCheckbox.checked = true;
            } else {
                encryptionIndicator.style.backgroundColor = 'var(--text-secondary)';
                encryptionStatusText.textContent = window.i18n ? window.i18n.t('encryption.disabledTitle') : 'Encryption Disabled';
                encryptionDescription.textContent = window.i18n ? window.i18n.t('encryption.disabledDescription') : 'Your data will be uploaded unencrypted to Google Drive.';
                encryptionEnabledCheckbox.checked = false;
            }

        } catch (error) {
            console.error('[Encryption] Failed to update modal encryption status:', error);
        }
    }

    async promptForDecryptionPassphrase(payload) {
        try {
            const { ipcRenderer } = require('electron');
            const message = (payload && payload.message) || 'Cloud data is encrypted. Enter your passphrase to decrypt.';

            const content = `
                <div style="max-width: 520px;">
                    <h4 style="margin: 0 0 12px 0; color: var(--text-primary);"><i class="fas fa-lock"></i> Encrypted Cloud Data</h4>
                    <p style="margin: 0 0 12px 0; color: var(--text-secondary); font-size: 0.95rem;">${message}</p>
                    <div style="margin-top: 12px;">
                        <label for="modal-passphrase-input" style="display: block; margin-bottom: 6px; color: var(--text-primary); font-weight: 500;">Passphrase</label>
                        const t = (key) => window.i18n ? window.i18n.t(key) : key;
                        <input type="password" id="modal-passphrase-input" placeholder="${t('placeholder.enterEncryptionPassphrase')}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-color);">
                        <div id="modal-passphrase-error" style="margin-top: 6px; font-size: 0.85rem; color: var(--error-color);"></div>
                    </div>
                </div>
            `;

            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            const modal = this.createModal(t('modals.encryptedDataDetected'), content, [
                { text: t('modals.cancel'), type: 'secondary', action: 'cancel-passphrase' },
                { text: t('modals.decrypt'), type: 'primary', action: 'confirm-passphrase' }
            ]);

            const input = modal.querySelector('#modal-passphrase-input');
            const errorText = modal.querySelector('#modal-passphrase-error');

            const onConfirm = async () => {
                const passphrase = input.value;
                if (!passphrase || passphrase.length < 8) {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    errorText.textContent = t('encryption.passphraseMinLength');
                    return;
                }

                // Derive salt from passphrase
                const saltResult = await ipcRenderer.invoke('derive-salt-from-passphrase', passphrase);
                if (!saltResult.success) {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    errorText.textContent = saltResult.error || t('encryption.failedToDeriveSalt', { error: '' }).replace(': ', '');
                    return;
                }

                // Set decryption passphrase for this session ONLY (do not enable E2EE globally)
                const sessionResult = await ipcRenderer.invoke('set-sync-decryption-passphrase', {
                    passphrase: passphrase,
                    saltBase64: saltResult.saltBase64
                });

                if (!sessionResult.success) {
                    errorText.textContent = sessionResult.error || 'Failed to set passphrase for sync';
                    return;
                }

                // Retry sync now that passphrase is set for this session
                modal.remove();
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('settings.sync.passphraseSetRetrying'), 'info');
                try {
                    await this.manualSync();
                } catch (e) {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.showNotification(t('settings.sync.syncFailedAfterPassphrase'), 'error');
                }
            };

            // Wire buttons
            const footer = modal.querySelector('.modal-footer');
            const buttons = footer ? footer.querySelectorAll('button') : [];
            if (buttons.length === 2) {
                buttons[0].addEventListener('click', () => modal.remove());
                buttons[1].addEventListener('click', onConfirm);
            }

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') onConfirm();
            });

            input.focus();
        } catch (error) {
            console.error('[Encryption] Failed to prompt for passphrase:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('settings.sync.encryptedDataDetected'), 'warning');
        }
    }

    async displayModalConflicts(modal) {
        try {
            if (!this.notesManager || !this.notesManager.db) {
                return;
            }

            const db = this.notesManager.db;
            const conflicts = db.getSyncConflicts();

            const conflictsSection = modal.querySelector('#modal-conflicts-section');
            const conflictsList = modal.querySelector('#modal-conflicts-list');

            if (conflicts.length === 0) {
                conflictsSection.style.display = 'none';
                return;
            }

            conflictsSection.style.display = 'block';
            conflictsList.innerHTML = '';

            conflicts.forEach(conflict => {
                const conflictElement = document.createElement('div');
                conflictElement.style.cssText = `
                    padding: 12px;
                    border: 1px solid var(--warning-color);
                    border-radius: 4px;
                    margin-bottom: 8px;
                    background: rgba(245, 158, 11, 0.1);
                `;

                const untitledTitle = window.i18n ? window.i18n.t('editor.untitledNoteTitle') : 'Untitled Note';
                conflictElement.innerHTML = `
                    <div style="font-weight: 500; color: var(--text-primary); margin-bottom: 4px;">${conflict.localTitle || untitledTitle}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px;">
                        Local: ${new Date(conflict.localModified).toLocaleString()}<br>
                        Remote: ${new Date(conflict.remoteModified).toLocaleString()}
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="sync-button" style="background: var(--success-color); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;" onclick="resolveModalConflict('${conflict.id}', 'local', '${modal.id}')">Use Local</button>
                        <button class="sync-button" style="background: var(--surface-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;" onclick="resolveModalConflict('${conflict.id}', 'remote', '${modal.id}')">Use Remote</button>
                        <button class="sync-button" style="background: var(--error-color); color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8rem;" onclick="resolveModalConflict('${conflict.id}', 'manual', '${modal.id}')">Resolve Manually</button>
                    </div>
                `;

                conflictsList.appendChild(conflictElement);
            });

        } catch (error) {
            console.error('[Sync] Failed to display modal conflicts:', error);
        }
    }

    resolveModalConflict(conflictId, resolution, modalId) {
        try {
            if (!this.notesManager || !this.notesManager.db) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('notifications.databaseNotAvailable'), 'error');
                return;
            }

            const db = this.notesManager.db;
            const success = db.resolveSyncConflict(conflictId, resolution);

            if (success) {
                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                this.showNotification(t('notifications.conflictResolved', { resolution }), 'success');

                // Refresh conflicts display
                const modal = document.getElementById(modalId);
                if (modal) {
                    this.displayModalConflicts(modal);
                }
            } else {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('settings.sync.failedToResolveConflict'), 'error');
            }

        } catch (error) {
            console.error('[Sync] Failed to resolve modal conflict:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.showNotification(t('notifications.failedToResolveConflict'), 'error');
        }
    }

    async manualSync() {
        try {
            if (!this.syncStatus.isAuthenticated) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('settings.sync.pleaseConnectGoogleDrive'), 'warning');
                return;
            }

            // Check if we're online before attempting sync
            const isOnline = await window.networkUtils.checkGoogleDriveConnectivity(3000);
            if (!isOnline) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.showNotification(t('settings.sync.cannotSyncNoInternet'), 'error');
                console.log('[Sync] Manual sync cancelled - device is offline');
                return;
            }

            this.syncStatus.inProgress = true;
            this.updateSyncUI();

            // Export local data from the renderer process database manager
            let localData = null;
            let localChecksum = null;
            if (this.notesManager && this.notesManager.db) {
                const exportResult = this.notesManager.db.exportDataForSync();
                localData = exportResult.data;
                localChecksum = exportResult.checksum;
                console.log('[UI] Exported local data for sync:', {
                    notesCount: Object.keys(localData.notes || {}).length,
                    conversationsCount: Object.keys(localData.ai_conversations || {}).length,
                    checksum: localChecksum.substring(0, 16) + '...'
                });
            }

            const lastSync = (this.notesManager && this.notesManager.db) ? this.notesManager.db.getSyncMetadata().lastSync : null;
            const result = await this.backendAPI.syncWithGoogleDrive({ localData, localChecksum, lastSync });

            if (result.success) {
                // Success notification handled by sync-completed event
                await this.updateSyncStatus();

                // Also sync media files if available
                try {
                    const electron = require('electron');
                    if (electron && electron.ipcRenderer) {
                        console.log('[Sync] Syncing media files to Google Drive...');
                        const mediaResult = await electron.ipcRenderer.invoke('sync-media-to-drive');
                        if (mediaResult.success) {
                            const { uploaded, skipped, deletedFromDrive, deletedFromLocal } = mediaResult;
                            console.log(`[Sync] Media sync: ${uploaded} uploaded, ${skipped} skipped, ${deletedFromDrive} deleted from Drive, ${deletedFromLocal} deleted from local`);
                            
                            // Show notification if files were deleted
                            const totalDeleted = (deletedFromDrive || 0) + (deletedFromLocal || 0);
                            if (totalDeleted > 0) {
                                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                                this.showNotification(t('notifications.cleanedUpUnusedMedia', { 
                                    total: totalDeleted, 
                                    plural: totalDeleted > 1 ? 's' : '',
                                    drive: deletedFromDrive,
                                    local: deletedFromLocal
                                }), 'info');
                            }
                        }
                    }
                } catch (mediaError) {
                    console.warn('[Sync] Media sync failed (non-critical):', mediaError);
                    // Don't fail the whole sync if media sync fails
                }
            } else {
                // Error notification handled by sync-completed event
            }

        } catch (error) {
            console.error('[Sync] Manual sync failed:', error);
            // Error notification handled by sync-completed event
        } finally {
            this.syncStatus.inProgress = false;
            this.updateSyncUI();
        }
    }

    startAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }

        const interval = this.notesManager && this.notesManager.db ?
            this.notesManager.db.getSyncInterval() : 300000; // 5 minutes default

        this.autoSyncInterval = setInterval(async () => {
            try {
                if (!this.syncStatus.inProgress && this.syncStatus.isAuthenticated && this.syncStatus.syncEnabled) {
                    // Check if we're online before attempting auto-sync
                    const isOnline = await window.networkUtils.checkGoogleDriveConnectivity(2000);
                    if (isOnline) {
                        console.log('[Sync] Running auto-sync...');
                        await this.manualSync();
                    } else {
                        console.log('[Sync] Skipping auto-sync - device is offline');
                        // Don't show notification for auto-sync failures to avoid spam
                    }
                }
            } catch (error) {
                console.error('[Sync] Auto-sync failed:', error);
            }
        }, interval);
    }

    stopAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
    }

}

// Global function for modal conflict resolution
function resolveModalConflict(conflictId, resolution, modalId) {
    if (window.cognotezApp) {
        window.cognotezApp.resolveModalConflict(conflictId, resolution, modalId);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.cognotezApp = new CogNotezApp();
});

