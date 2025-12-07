const { t } = require('./shared');

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

        // --- Header ---
        const header = document.createElement('div');
        header.className = 'find-replace-header';

        const title = document.createElement('h3');
        title.textContent = t('findReplace.findReplace');
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.id = 'find-replace-close';
        closeBtn.className = 'find-replace-close';
        const closeIcon = document.createElement('i');
        closeIcon.className = 'fas fa-times';
        closeBtn.appendChild(closeIcon);
        header.appendChild(closeBtn);

        dialog.appendChild(header);

        // --- Body ---
        const body = document.createElement('div');
        body.className = 'find-replace-body';

        // Disclaimer
        const disclaimer = document.createElement('div');
        disclaimer.className = 'find-disclaimer';
        const infoIcon = document.createElement('i');
        infoIcon.className = 'fas fa-info-circle';
        disclaimer.appendChild(infoIcon);
        const disclaimerText = document.createElement('span');
        disclaimerText.textContent = t('findReplace.disclaimerPreviewOnly');
        disclaimer.appendChild(disclaimerText);
        body.appendChild(disclaimer);

        // Find Section
        const findSection = document.createElement('div');
        findSection.className = 'find-section';
        const findLabel = document.createElement('label');
        findLabel.htmlFor = 'find-input';
        findLabel.textContent = t('findReplace.find');
        findSection.appendChild(findLabel);
        const findInput = document.createElement('input');
        findInput.type = 'text';
        findInput.id = 'find-input';
        findInput.className = 'find-input';
        findInput.placeholder = t('findReplace.searchText');
        findSection.appendChild(findInput);
        body.appendChild(findSection);

        // Replace Section
        const replaceSection = document.createElement('div');
        replaceSection.className = 'replace-section';
        const replaceLabel = document.createElement('label');
        replaceLabel.htmlFor = 'replace-input';
        replaceLabel.textContent = t('findReplace.replace');
        replaceSection.appendChild(replaceLabel);
        const replaceInput = document.createElement('input');
        replaceInput.type = 'text';
        replaceInput.id = 'replace-input';
        replaceInput.className = 'replace-input';
        replaceInput.placeholder = t('findReplace.replaceWith');
        replaceSection.appendChild(replaceInput);
        body.appendChild(replaceSection);

        // Options Section
        const optionsSection = document.createElement('div');
        optionsSection.className = 'options-section';

        const createCheckbox = (id, labelText) => {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = id;
            label.appendChild(input);
            label.appendChild(document.createTextNode(' ' + labelText));
            return label;
        };

        optionsSection.appendChild(createCheckbox('case-sensitive', t('findReplace.caseSensitive')));
        optionsSection.appendChild(createCheckbox('whole-word', t('findReplace.wholeWord')));
        optionsSection.appendChild(createCheckbox('use-regex', t('findReplace.regularExpression')));
        body.appendChild(optionsSection);

        // Results Section
        const resultsSection = document.createElement('div');
        resultsSection.className = 'results-section';
        const matchCount = document.createElement('span');
        matchCount.id = 'match-count';
        matchCount.textContent = t('findReplace.noMatches');
        resultsSection.appendChild(matchCount);
        body.appendChild(resultsSection);

        // Buttons Section
        const buttonsSection = document.createElement('div');
        buttonsSection.className = 'buttons-section';

        const createButton = (id, cls, text) => {
            const btn = document.createElement('button');
            btn.id = id;
            btn.className = cls;
            btn.textContent = text;
            return btn;
        };

        buttonsSection.appendChild(createButton('find-prev', 'btn-secondary', t('findReplace.previous')));
        buttonsSection.appendChild(createButton('find-next', 'btn-secondary', t('findReplace.next')));
        buttonsSection.appendChild(createButton('replace-next', 'btn-primary', t('findReplace.replaceButton')));
        buttonsSection.appendChild(createButton('replace-all', 'btn-primary', t('findReplace.replaceAll')));
        body.appendChild(buttonsSection);

        dialog.appendChild(body);

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

        const currentMode = this.app.previewMode || 'edit';
        const isPreviewOnly = currentMode === 'preview';

        // Update disclaimer based on mode
        this.updateDisclaimer();

        // In preview-only mode, force find-only (no replace)
        const effectiveFindOnly = findOnly || isPreviewOnly;

        if (effectiveFindOnly) {
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

        // Pre-fill with selected text (only if editor is accessible)
        const editor = document.getElementById('note-editor');
        if (!isPreviewOnly && editor && editor.selectionStart !== editor.selectionEnd) {
            const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
            this.element.querySelector('#find-input').value = selectedText;
            this.findText = selectedText;
            this.findMatches();
            // Don't focus editor when dialog opens with pre-filled text
        }
    }

    updateDisclaimer() {
        const disclaimer = this.element.querySelector('.find-disclaimer span');
        if (!disclaimer) return;

        const currentMode = this.app.previewMode || 'edit';

        switch (currentMode) {
            case 'edit':
                disclaimer.textContent = t('findReplace.disclaimerEdit');
                break;
            case 'preview':
                disclaimer.textContent = t('findReplace.disclaimerPreview');
                break;
            case 'split':
                disclaimer.textContent = t('findReplace.disclaimerSplit');
                break;
        }
    }

    // Update UI when view mode changes while dialog is open
    updateUIForMode() {
        if (!this.element) return;

        const currentMode = this.app.previewMode || 'edit';
        const isPreviewOnly = currentMode === 'preview';

        // Update disclaimer
        this.updateDisclaimer();

        // Show/hide replace elements based on mode
        if (isPreviewOnly) {
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
        const currentMode = this.app.previewMode || 'edit';

        if (!this.findText) {
            this.matches = [];
            this.currentMatchIndex = -1;
            this.updateMatchCount();
            this.clearHighlights();
            return;
        }

        // In preview-only mode, search in preview text content
        // In edit and split modes, search in editor value
        let content;
        if (currentMode === 'preview') {
            // Get text content from preview (rendered markdown)
            if (!preview) {
                this.matches = [];
                this.currentMatchIndex = -1;
                this.updateMatchCount();
                return;
            }
            content = editor.value; // Still search in source for accurate positioning
        } else {
            if (!editor) {
                this.matches = [];
                this.currentMatchIndex = -1;
                this.updateMatchCount();
                return;
            }
            content = editor.value;
        }
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
        const currentMode = this.app.previewMode || 'edit';

        // If no matches, clear highlights and return
        if (this.matches.length === 0) {
            this.clearHighlights();
            return;
        }

        switch (currentMode) {
            case 'edit':
                // Edit mode: highlight in editor only
                if (editor) {
                    this.selectCurrentMatch();
                    this.highlightInEditor();
                }
                break;
            case 'preview':
                // Preview mode: highlight in preview only (read-only)
                this.highlightInPreview();
                break;
            case 'split':
                // Split mode: highlight in both editor and preview
                if (editor) {
                    this.selectCurrentMatch();
                    this.highlightInEditor();
                }
                this.highlightInPreview();
                break;
        }
    }

    async clearHighlights() {
        const { setSafeInnerHTML, renderMarkdown } = require('./shared');
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
            // Use safe render from shared
            setSafeInnerHTML(preview, renderMarkdown(content));
        }
    }

    async highlightInPreview() {
        if (this.matches.length === 0) return;

        const preview = document.getElementById('markdown-preview');
        const editor = document.getElementById('note-editor');
        const { setSafeInnerHTML, renderMarkdown } = require('./shared');

        if (!preview || !editor) return;

        try {
            // First, render the markdown normally
            let content = editor.value;
            if (this.app.richMediaManager && this.app.richMediaManager.processContentForPreview) {
                try {
                    content = await this.app.richMediaManager.processContentForPreview(content);
                } catch (error) {
                    console.warn('[Preview] Failed to process media URLs in highlightInPreview:', error);
                }
            }

            // Parse markdown to HTML
            const html = renderMarkdown(content);

            // Create a temporary container
            const tempDiv = document.createElement('div');
            setSafeInnerHTML(tempDiv, html);

            // Build the search pattern from find settings
            let searchText = this.findText;
            if (!this.regex) {
                searchText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
            if (this.wholeWord) {
                searchText = `\\b${searchText}\\b`;
            }
            const flags = this.caseSensitive ? 'g' : 'gi';
            const searchRegex = new RegExp(searchText, flags);

            // Track which match we're on (to identify current match)
            let matchCounter = 0;

            // Function to highlight text in a text node
            const highlightTextNode = (textNode) => {
                const text = textNode.textContent;
                const parent = textNode.parentNode;

                if (!parent || !text) return;

                // Skip if inside a code block or pre tag
                let ancestor = parent;
                while (ancestor) {
                    if (ancestor.tagName === 'CODE' || ancestor.tagName === 'PRE') {
                        // Still search in code blocks but continue
                        break;
                    }
                    ancestor = ancestor.parentNode;
                }

                // Find all matches in this text node
                const matches = [];
                let match;
                searchRegex.lastIndex = 0; // Reset regex state
                while ((match = searchRegex.exec(text)) !== null) {
                    matches.push({
                        start: match.index,
                        end: match.index + match[0].length,
                        text: match[0],
                        globalIndex: matchCounter++
                    });
                }

                if (matches.length === 0) return;

                // Build new content with highlights
                const fragment = document.createDocumentFragment();
                let lastEnd = 0;

                for (const m of matches) {
                    // Add text before this match
                    if (m.start > lastEnd) {
                        fragment.appendChild(document.createTextNode(text.substring(lastEnd, m.start)));
                    }

                    // Add highlighted match
                    const highlightSpan = document.createElement('mark');
                    const isCurrent = m.globalIndex === this.currentMatchIndex;
                    highlightSpan.className = isCurrent ? 'find-highlight find-highlight-current' : 'find-highlight';
                    highlightSpan.textContent = m.text;
                    fragment.appendChild(highlightSpan);

                    lastEnd = m.end;
                }

                // Add remaining text after last match
                if (lastEnd < text.length) {
                    fragment.appendChild(document.createTextNode(text.substring(lastEnd)));
                }

                // Replace the text node with the fragment
                parent.replaceChild(fragment, textNode);
            };

            // Get all text nodes using TreeWalker
            const getTextNodes = (root) => {
                const textNodes = [];
                const walker = document.createTreeWalker(
                    root,
                    NodeFilter.SHOW_TEXT,
                    null
                );

                let node;
                while (node = walker.nextNode()) {
                    // Only process nodes with actual text content
                    if (node.textContent.trim() || node.textContent.includes(this.findText)) {
                        textNodes.push(node);
                    }
                }
                return textNodes;
            };

            // Collect text nodes first (to avoid modification during iteration)
            const textNodes = getTextNodes(tempDiv);

            // Process each text node
            for (const textNode of textNodes) {
                highlightTextNode(textNode);
            }

            // Update preview with highlighted content
            preview.innerHTML = tempDiv.innerHTML;

            // Scroll the current highlight into view
            const currentHighlight = preview.querySelector('.find-highlight-current');
            if (currentHighlight) {
                const rect = currentHighlight.getBoundingClientRect();
                const previewRect = preview.getBoundingClientRect();
                const headerHeight = 64;

                const isVisible = rect.top >= previewRect.top + headerHeight &&
                    rect.bottom <= previewRect.bottom;

                if (!isVisible) {
                    const scrollTop = preview.scrollTop + rect.top - previewRect.top - (window.innerHeight / 3);
                    preview.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
                }
            } else {
                const firstHighlight = preview.querySelector('.find-highlight');
                if (firstHighlight) {
                    firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
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
            setSafeInnerHTML(preview, renderMarkdown(content));
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
            const currentMode = this.app.previewMode || 'edit';
            const match = this.matches[this.currentMatchIndex];

            // In preview-only mode, we don't select in editor, just scroll preview
            if (currentMode === 'preview') {
                // Scroll to highlight in preview will be handled by highlightInPreview
                return;
            }

            // In edit and split modes, select in editor
            const editor = document.getElementById('note-editor');
            if (!editor) return;

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

        // Only focus editor if not in preview-only mode
        const currentMode = this.app.previewMode || 'edit';
        if (currentMode !== 'preview') {
            this.selectCurrentMatch(true); // Focus editor when navigating
        }
    }

    findPrevious() {
        if (this.matches.length === 0) return;

        this.currentMatchIndex = this.currentMatchIndex <= 0 ?
            this.matches.length - 1 : this.currentMatchIndex - 1;
        this.updateMatchCount();
        this.highlightMatches();

        // Only focus editor if not in preview-only mode
        const currentMode = this.app.previewMode || 'edit';
        if (currentMode !== 'preview') {
            this.selectCurrentMatch(true); // Focus editor when navigating
        }
    }

    replaceNext() {
        // Prevent replace in preview-only mode
        const currentMode = this.app.previewMode || 'edit';
        if (currentMode === 'preview') return;

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
        // Prevent replace in preview-only mode
        const currentMode = this.app.previewMode || 'edit';
        if (currentMode === 'preview') return;

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

module.exports = FindReplaceDialog;
