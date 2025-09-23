// AI Edit Approval System - Similar to Cursor IDE
class AIEditApproval {
    constructor(app) {
        this.app = app;
        this.dialog = null;
        this.originalText = '';
        this.editedText = '';
        this.currentText = '';
        this.diffLines = [];
        this.diffBlocks = [];
        this.approvedBlocks = new Set();
        this.rejectedBlocks = new Set();
        this.aiPanelWasVisible = false;
        this.editorWasVisible = false;
        this.previewWasVisible = false;
        this.processedBlocks = new Set(); // Track which blocks have been handled
        this.selectionStart = -1; // original selection start in editor
        this.selectionEnd = -1;   // original selection end in editor
        this.isApplying = false;  // guard against rapid re-entrant clicks
    }

    /**
     * Show the AI edit approval dialog
     * @param {string} originalText - The original selected text
     * @param {string} editedText - The AI-edited text
     * @param {string} instruction - The edit instruction given to AI
     */
    showApprovalDialog(originalText, editedText, instruction) {
        this.originalText = originalText;
        this.editedText = editedText;
        this.currentText = originalText; // working text that reflects accepted edits
        this.approvedBlocks.clear();
        this.rejectedBlocks.clear();
        this.processedBlocks.clear();

        console.log('[DEBUG] AI Edit Approval - showing dialog');

        // Capture the current selection range from the app or editor so that
        // we can consistently replace within the same region for every apply
        const editor = document.getElementById('note-editor');
        const appStart = (this.app && typeof this.app.selectionStart === 'number') ? this.app.selectionStart : -1;
        const appEnd = (this.app && typeof this.app.selectionEnd === 'number') ? this.app.selectionEnd : -1;
        const domStart = editor ? editor.selectionStart : -1;
        const domEnd = editor ? editor.selectionEnd : -1;
        this.selectionStart = (appStart >= 0 && appEnd >= 0) ? appStart : domStart;
        this.selectionEnd = (appStart >= 0 && appEnd >= 0) ? appEnd : domEnd;

        // Create dialog if it doesn't exist
        if (!this.dialog) {
            this.createDialog();
        }

        // Generate diff
        this.generateDiff();
        this.renderDiff();

        // Show inline approval interface
        this.dialog.classList.remove('hidden');

        // Debug container dimensions
        setTimeout(() => {
            const approvalBody = this.dialog.querySelector('.ai-edit-approval-body');
            const diffContainer = this.dialog.querySelector('.ai-edit-diff-container');
            console.log('[DEBUG] Approval body height:', approvalBody?.offsetHeight, 'scroll height:', approvalBody?.scrollHeight);
            console.log('[DEBUG] Diff container height:', diffContainer?.offsetHeight, 'scroll height:', diffContainer?.scrollHeight);
            console.log('[DEBUG] Dialog height:', this.dialog.offsetHeight, 'scroll height:', this.dialog.scrollHeight);
        }, 100);

        // Hide the editor and show the approval interface
        const editorContainer = document.getElementById('editor-container');
        const noteEditor = document.getElementById('note-editor');
        const markdownPreview = document.getElementById('markdown-preview');
        const aiPanel = document.getElementById('ai-panel');

        if (editorContainer) {
            editorContainer.classList.add('approval-mode');
        }

        // Track which mode was active before showing approval interface
        if (noteEditor) {
            this.editorWasVisible = !noteEditor.classList.contains('hidden');
            noteEditor.classList.add('hidden');
        }
        if (markdownPreview) {
            this.previewWasVisible = !markdownPreview.classList.contains('hidden');
            markdownPreview.classList.add('hidden');
        }

        // Hide AI panel if visible to avoid conflicts
        if (aiPanel && !aiPanel.classList.contains('hidden')) {
            aiPanel.classList.add('hidden');
            this.aiPanelWasVisible = true;
        } else {
            this.aiPanelWasVisible = false;
        }

        // Set up event listeners
        this.setupEventListeners();
    }

    createDialog() {
        this.dialog = document.getElementById('ai-edit-approval-inline');
        if (!this.dialog) {
            throw new Error('AI edit approval container not found in DOM');
        }
    }

    /**
     * Generate line-based diff showing each changed line as separate block
     */
    generateDiff() {
        this.diffBlocks = [];

        // Split into lines and find changes
        const originalLines = this.originalText.split('\n');
        const editedLines = this.editedText.split('\n');

        let blockId = 1;

        for (let i = 0; i < Math.max(originalLines.length, editedLines.length); i++) {
            const originalLine = originalLines[i] || '';
            const editedLine = editedLines[i] || '';

            // If this specific line changed, create a block for it
            if (originalLine !== editedLine) {
                this.diffBlocks.push({
                    id: `block-${blockId}`,
                    originalLines: [originalLine],
                    editedLines: [editedLine],
                    startLine: i + 1,
                    type: 'modified'
                });
                blockId++;
            }
        }

        // If no changes were found, treat as one unchanged block
        if (this.diffBlocks.length === 0) {
            this.diffBlocks.push({
                id: 'block-1',
                originalLines: originalLines,
                editedLines: editedLines,
                startLine: 1,
                type: 'unchanged'
            });
        }
    }

    /**
     * Render the diff blocks
     */
    renderDiff() {
        const diffContent = document.getElementById('ai-edit-diff-content');
        if (!diffContent) return;

        diffContent.innerHTML = '';

        this.diffBlocks.forEach((block, index) => {
            const blockElement = document.createElement('div');
            blockElement.className = `diff-block diff-block-${block.type}`;
            blockElement.dataset.index = index;

            if (block.type === 'modified') {
                // Show this specific changed line
                const originalLine = block.originalLines[0];
                const editedLine = block.editedLines[0];

                blockElement.innerHTML = `
                    <div class="diff-original-section">
                        <div class="diff-section-title">Original:</div>
                        <div class="diff-lines">
                            <div class="diff-line-original">${this.escapeHtml(originalLine)}</div>
                        </div>
                    </div>
                    <div class="diff-edited-section">
                        <div class="diff-section-title">AI Edit:</div>
                        <div class="diff-lines">
                            <div class="diff-line-edited">${this.escapeHtml(editedLine)}</div>
                        </div>
                    </div>
                    <div class="diff-controls">
                        <button class="diff-btn accept-btn" data-action="accept" data-index="${index}" title="Accept this change">
                            <i class="fas fa-check"></i> Accept
                        </button>
                        <button class="diff-btn reject-btn" data-action="reject" data-index="${index}" title="Reject this change">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    </div>
                `;
            } else {
                // Unchanged - just show the text
                const linesHtml = block.originalLines.map((line, lineIndex) =>
                    `<div class="diff-line-unchanged">${this.escapeHtml(line)}</div>`
                ).join('');

                blockElement.innerHTML = `
                    <div class="diff-unchanged-section">
                        <div class="diff-lines">${linesHtml}</div>
                    </div>
                `;
            }

            diffContent.appendChild(blockElement);
        });
    }

    /**
     * Handle block approval/rejection
     */
    handleBlockAction(index, action) {
        if (this.isApplying) return; // prevent re-entrant apply
        const block = this.diffBlocks[index];
        if (!block || block.type !== 'modified') return;

        // Mark this block as processed
        this.processedBlocks.add(index);

        if (action === 'accept') {
            // Immediately apply the change
            this.isApplying = true;
            try {
                this.applySingleBlockChange(block);
            } finally {
                this.isApplying = false;
            }
            // Update UI to show this block is accepted
            this.updateBlockVisualState(index, 'accepted');
            // Remove processed block from the list to minimize scrolling
            this.removeProcessedBlock(index);
        } else if (action === 'reject') {
            // Update UI to show this block is rejected
            this.updateBlockVisualState(index, 'rejected');
            // Remove processed block from the list to minimize scrolling
            this.removeProcessedBlock(index);
        }

        // Check if all changeable blocks have been processed
        const changeableBlocks = this.getChangeableBlocks();
        const processedCount = changeableBlocks.filter((blk) =>
            this.processedBlocks.has(this.diffBlocks.indexOf(blk))
        ).length;

        // Only close if all changeable blocks have been processed
        if (processedCount === changeableBlocks.length) {
            this.closeDialog();
        } else {
            // Update the remaining unprocessed blocks
            this.updateRemainingBlocks();
        }
    }

    /**
     * Remove a processed block element from the UI
     */
    removeProcessedBlock(blockIndex) {
        const blockElement = document.querySelector(`[data-index="${blockIndex}"]`);
        if (blockElement && blockElement.parentElement) {
            blockElement.parentElement.removeChild(blockElement);
        }
    }

    /**
     * Get all blocks that can be changed (not unchanged)
     */
    getChangeableBlocks() {
        return this.diffBlocks.filter(block => block.type !== 'unchanged');
    }

    /**
     * Update visual state of a processed block
     */
    updateBlockVisualState(blockIndex, status) {
        const blockElement = document.querySelector(`[data-index="${blockIndex}"]`);
        if (blockElement) {
            blockElement.classList.add(`block-${status}`);

            // Disable the buttons for this block
            const buttons = blockElement.querySelectorAll('.diff-btn');
            buttons.forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.5';
            });

            // Add status indicator
            const statusIndicator = document.createElement('div');
            statusIndicator.className = `block-status-indicator ${status}`;
            statusIndicator.textContent = status === 'accepted' ? '✅' : '❌';
            blockElement.appendChild(statusIndicator);
        }
    }

    /**
     * Update remaining unprocessed blocks
     */
    updateRemainingBlocks() {
        // Remove processed status from blocks that are no longer in processedBlocks
        this.diffBlocks.forEach((block, index) => {
            if (!this.processedBlocks.has(index)) {
                const blockElement = document.querySelector(`[data-index="${index}"]`);
                if (blockElement) {
                    blockElement.classList.remove('block-accepted', 'block-rejected');

                    // Re-enable buttons
                    const buttons = blockElement.querySelectorAll('.diff-btn');
                    buttons.forEach(btn => {
                        btn.disabled = false;
                        btn.style.opacity = '1';
                    });

                    // Remove status indicators
                    const indicators = blockElement.querySelectorAll('.block-status-indicator');
                    indicators.forEach(indicator => indicator.remove());
                }
            }
        });
    }

    /**
     * Handle accept all changes
     */
    handleAcceptAll() {
        if (this.isApplying) return;
        this.isApplying = true;
        const changeableBlocks = this.getChangeableBlocks()
            .slice()
            .sort((a, b) => a.startLine - b.startLine);

        if (changeableBlocks.length > 0) {
            const oldCurrentText = this.currentText;
            let lines = oldCurrentText.split('\n');
            changeableBlocks.forEach((block) => {
                const lineIndex = Math.max(0, (block.startLine || 1) - 1);
                const editedLine = (block.editedLines && block.editedLines[0] !== undefined) ? block.editedLines[0] : '';
                while (lines.length <= lineIndex) lines.push('');
                lines[lineIndex] = editedLine;
                this.processedBlocks.add(this.diffBlocks.indexOf(block));
            });
            this.currentText = lines.join('\n');

            const editor = document.getElementById('note-editor');
            if (editor) {
                const fullContent = editor.value;
                const beforeSelection = fullContent.substring(0, this.selectionStart);
                const afterSelection = fullContent.substring(this.selectionStart + oldCurrentText.length);
                const newContent = beforeSelection + this.currentText + afterSelection;
                editor.value = newContent;
                const inputEvent = new Event('input', { bubbles: true });
                editor.dispatchEvent(inputEvent);
                this.selectionEnd = this.selectionStart + this.currentText.length;
                editor.selectionStart = editor.selectionEnd = this.selectionEnd;
                editor.focus();
            }
        }

        this.isApplying = false;
        this.closeDialog();
    }

    /**
     * Handle reject all changes
     */
    handleRejectAll() {
        // Just close without applying changes
        this.closeDialog();
    }

    /**
     * Apply a single block change immediately
     */
    applySingleBlockChange(block) {
        const lineIndex = Math.max(0, (block.startLine || 1) - 1);
        const editedLine = (block.editedLines && block.editedLines[0] !== undefined) ? block.editedLines[0] : '';

        const oldCurrentText = this.currentText;
        let lines = oldCurrentText.split('\n');
        while (lines.length <= lineIndex) lines.push('');
        lines[lineIndex] = editedLine;
        this.currentText = lines.join('\n');

        const editor = document.getElementById('note-editor');
        if (editor) {
            const fullContent = editor.value;
            const beforeSelection = fullContent.substring(0, this.selectionStart);
            const afterSelection = fullContent.substring(this.selectionStart + oldCurrentText.length);
            const newContent = beforeSelection + this.currentText + afterSelection;
            editor.value = newContent;
            const inputEvent = new Event('input', { bubbles: true });
            editor.dispatchEvent(inputEvent);
            this.selectionEnd = this.selectionStart + this.currentText.length;
            editor.selectionStart = editor.selectionEnd = this.selectionEnd;
            editor.focus();
        }
    }

    /**
     * Legacy method - no longer used since we apply changes immediately
     */
    applyChanges() {
        // This method is deprecated since we now apply changes immediately
        // when Accept is clicked
        this.closeDialog();
    }

    /**
     * Close the approval interface
     */
    closeDialog() {
        if (this.dialog) {
            this.dialog.classList.add('hidden');
        }

        // Restore the editor view - only show the mode that was active before
        const editorContainer = document.getElementById('editor-container');
        const noteEditor = document.getElementById('note-editor');
        const markdownPreview = document.getElementById('markdown-preview');
        const aiPanel = document.getElementById('ai-panel');

        if (editorContainer) {
            editorContainer.classList.remove('approval-mode');
        }

        // Restore only the mode that was active before approval interface was shown
        if (noteEditor) {
            if (this.editorWasVisible) {
                noteEditor.classList.remove('hidden');
            } else {
                noteEditor.classList.add('hidden');
            }
        }
        if (markdownPreview) {
            if (this.previewWasVisible) {
                markdownPreview.classList.remove('hidden');
            } else {
                markdownPreview.classList.add('hidden');
            }
        }

        // Restore AI panel if it was visible before
        if (aiPanel && this.aiPanelWasVisible) {
            aiPanel.classList.remove('hidden');
        }
    }

    /**
     * Cancel all changes and close dialog
     */
    cancelChanges() {
        this.closeDialog();
    }

    /**
     * Show help dialog for keyboard shortcuts and features
     */
    showHelp() {
        const helpContent = `
            <div style="max-height: 400px; overflow-y: auto; line-height: 1.6;">
                <h4 style="margin-top: 0; color: var(--accent-color);">AI Edit Approval - Help</h4>

                <h5>How It Works:</h5>
                <ul>
                    <li><strong>Red boxes</strong> - Your original text that will be changed</li>
                    <li><strong>Green boxes</strong> - AI's suggested replacement text</li>
                    <li><strong>Accept</strong> - Apply this specific change (stays open for other changes)</li>
                    <li><strong>Reject</strong> - Keep your original text for this line (stays open for other changes)</li>
                </ul>

                <h5>Features:</h5>
                <ul>
                    <li><strong>Individual control</strong> - Accept or reject each changed line separately</li>
                    <li><strong>Only changed lines shown</strong> - Only see what actually changed</li>
                    <li><strong>Per-line decisions</strong> - Control each change individually</li>
                    <li><strong>Immediate application</strong> - Changes apply as soon as you accept</li>
                    <li><strong>Stays open</strong> - Interface remains open until all changes are handled</li>
                </ul>

                <h5>Keyboard Shortcuts:</h5>
                <ul>
                    <li><kbd>Escape</kbd> - Cancel (close without changes)</li>
                    <li><kbd>?</kbd> - Show this help dialog</li>
                </ul>

                <p style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border-color); font-style: italic;">
                    <strong>Tip:</strong> Each changed line is shown separately with its own Accept/Reject buttons.
                    The interface stays open until you've handled all changes, so you can process each line individually.
                    Accepted changes are applied immediately, and processed blocks are visually marked.
                </p>
            </div>
        `;

        // Create a simple modal for help (keeping modal for help since it's auxiliary)
        const helpModal = document.createElement('div');
        helpModal.className = 'modal';
        helpModal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>AI Edit Approval Help</h3>
                    <button class="modal-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body" style="padding: 20px;">
                    ${helpContent}
                </div>
                <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color); text-align: right;">
                    <button class="btn-primary" onclick="this.parentElement.parentElement.parentElement.remove()">Got it!</button>
                </div>
            </div>
        `;

        document.body.appendChild(helpModal);

        // Close button functionality
        const closeBtn = helpModal.querySelector('.modal-close');
        closeBtn.addEventListener('click', () => {
            helpModal.remove();
        });

        // Click outside to close
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.remove();
            }
        });
    }

    /**
     * Set up event listeners for the dialog
     */
    setupEventListeners() {
        // Close button
        const closeBtn = document.getElementById('ai-edit-approval-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.cancelChanges());
        }

        // Help button
        const helpBtn = document.getElementById('ai-edit-help-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => this.showHelp());
        }

        // Block action buttons
        const diffContent = document.getElementById('ai-edit-diff-content');
        if (diffContent) {
            diffContent.addEventListener('click', (e) => {
                const button = e.target.closest('.diff-btn');
                if (button) {
                    const action = button.dataset.action;
                    const index = parseInt(button.dataset.index);
                    this.handleBlockAction(index, action);
                }
            });
        }

        // Action buttons
        const acceptBtn = document.getElementById('accept-changes-btn');
        const rejectBtn = document.getElementById('reject-changes-btn');

        if (acceptBtn) acceptBtn.addEventListener('click', () => this.handleAcceptAll());
        if (rejectBtn) rejectBtn.addEventListener('click', () => this.handleRejectAll());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (this.dialog && !this.dialog.classList.contains('hidden')) {
                if (e.key === 'Escape') {
                    this.cancelChanges();
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    this.applyChanges();
                } else if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    this.showHelp();
                }
            }
        });
    }

    /**
     * Escape HTML characters
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Initialize the approval system
     */
    initialize() {
        // Add CSS styles
        this.addStyles();
    }

    /**
     * Add CSS styles for the approval dialog
     */
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .ai-edit-approval-inline {
                width: 100%;
                height: 100vh; /* Use viewport height instead of 100% */
                max-height: calc(100vh - 50px); /* Account for header */
                display: flex;
                flex-direction: column;
                background: var(--bg-primary);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                min-height: 0; /* Allow flex children to shrink */
                overflow: hidden; /* Ensure contained scrolling */
            }

            .editor-container.approval-mode .editor-wrapper {
                display: none;
            }

            .ai-edit-approval-inline.hidden {
                display: none;
            }

            .ai-edit-approval-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid var(--border-color);
                background: var(--bg-secondary);
                border-radius: 8px 8px 0 0;
            }

            .ai-edit-approval-header h3 {
                margin: 0;
                color: var(--text-primary);
                font-size: 16px;
                font-weight: 600;
            }

            .approval-header-actions {
                display: flex;
                gap: 8px;
                align-items: center;
            }

            .approval-help-btn {
                background: none;
                border: none;
                color: var(--text-tertiary);
                font-size: 16px;
                padding: 4px;
                cursor: pointer;
                border-radius: 3px;
                transition: color 0.2s;
            }

            .approval-help-btn:hover {
                color: var(--accent-color);
                background: rgba(0, 123, 255, 0.1);
            }

            .approval-close-btn {
                background: none;
                border: none;
                color: var(--text-tertiary);
                font-size: 16px;
                padding: 4px;
                cursor: pointer;
                border-radius: 3px;
                transition: color 0.2s;
            }

            .approval-close-btn:hover {
                color: var(--text-primary);
                background: rgba(220, 53, 69, 0.1);
            }

            .ai-edit-instructions {
                margin-bottom: 16px;
                padding: 16px 20px;
                border-bottom: 1px solid var(--border-color);
            }

            .legend {
                display: flex;
                gap: 16px;
                margin-top: 8px;
                font-size: 12px;
            }

            .legend-item {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .block-status {
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 10px;
                font-weight: bold;
                text-transform: uppercase;
            }

            .block-status.original {
                background: rgba(220, 53, 69, 0.2);
                color: #721c24;
            }

            .block-status.edited {
                background: rgba(40, 167, 69, 0.2);
                color: #155724;
            }

            .ai-edit-approval-body {
                flex: 1;
                display: flex;
                flex-direction: column;
                min-height: 0; /* Allow flex child to shrink below content size */
                position: relative; /* For sticky positioning context */
                overflow: hidden; /* Let diff container handle the scroll */
            }

            .ai-edit-diff-container {
                display: flex;
                flex: 1;
                flex-direction: column;
                min-height: 0; /* Allow flex child to shrink */
                overflow-y: auto; /* Main scroll area */
                overflow-x: hidden;
                padding-bottom: 80px; /* Leave space for sticky actions */
            }

            @media (max-height: 768px) {
                .ai-edit-diff-container {
                    padding-bottom: 70px; /* Adjust space for smaller screens */
                }
            }

            .diff-content {
                flex: 1;
                overflow: visible; /* Avoid nested scrollbars */
                padding: 16px 20px 20px; /* Regular padding, space handled by container */
            }

            .diff-block {
                margin-bottom: 24px;
                padding: 16px;
                border: 1px solid var(--border-color);
                border-radius: 8px;
            }

            .diff-block-modified {
                border-left: 4px solid var(--accent-color);
            }

            .diff-original-section, .diff-edited-section {
                margin-bottom: 16px;
            }

            .diff-section-title {
                font-weight: 600;
                margin-bottom: 8px;
                font-size: 12px;
                text-transform: uppercase;
                color: var(--text-tertiary);
            }

            .diff-lines {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .diff-line-original {
                background: rgba(220, 53, 69, 0.1);
                color: var(--error-color, #dc3545);
                padding: 8px 12px;
                border-radius: 4px;
                text-decoration: line-through;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 14px;
                white-space: pre-wrap;
            }

            .diff-line-edited {
                background: rgba(40, 167, 69, 0.1);
                color: var(--success-color, #28a745);
                padding: 8px 12px;
                border-radius: 4px;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 14px;
                white-space: pre-wrap;
            }

            .diff-line-unchanged {
                padding: 8px 12px;
                background: var(--bg-primary);
                border-radius: 4px;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 14px;
                white-space: pre-wrap;
                color: var(--text-tertiary);
            }

            .diff-controls {
                display: flex;
                gap: 12px;
                margin-top: 16px;
            }

            .diff-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: all 0.2s;
            }

            .accept-btn {
                background: var(--success-color, #28a745);
                color: white;
            }

            .accept-btn:hover {
                background: var(--success-color-dark, #218838);
            }

            .reject-btn {
                background: var(--error-color, #dc3545);
                color: white;
            }

            .reject-btn:hover {
                background: var(--error-color-dark, #c82333);
            }

            .diff-block.accepted .diff-original {
                opacity: 0.5;
            }

            .diff-block.rejected .diff-edited {
                opacity: 0.5;
            }

            /* Block processing states */
            .block-accepted {
                background-color: rgba(40, 167, 69, 0.1);
                border-left-color: #28a745;
            }

            .block-rejected {
                background-color: rgba(220, 53, 69, 0.1);
                border-left-color: #dc3545;
            }

            .block-status-indicator {
                position: absolute;
                top: 8px;
                right: 8px;
                font-size: 16px;
                font-weight: bold;
            }

            .block-status-indicator.accepted {
                color: #28a745;
            }

            .block-status-indicator.rejected {
                color: #dc3545;
            }

            .block-actions, .bulk-actions {
                display: flex;
                gap: 8px;
                margin: 12px 0;
                justify-content: center;
            }

            .bulk-actions .btn-success,
            .bulk-actions .btn-secondary {
                background: #28a745;
                color: white;
                border: none;
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                min-width: 110px;
            }

            .bulk-actions .btn-success:hover {
                background: #218838;
            }
            .bulk-actions .btn-secondary {
                background: #6c757d;
            }

            .bulk-actions .btn-secondary:hover {
                background: #5a6268;
            }

            .btn-success:disabled {
                background: #6c757d;
                cursor: not-allowed;
            }

            .modal-header-actions {
                display: flex;
                gap: 8px;
                align-items: center;
            }

            .modal-help-btn {
                background: none;
                border: none;
                color: var(--text-tertiary);
                font-size: 16px;
                padding: 4px;
                cursor: pointer;
                border-radius: 3px;
                transition: color 0.2s;
            }

            .modal-help-btn:hover {
                color: var(--accent-color);
                background: rgba(0, 123, 255, 0.1);
            }

            @media (max-width: 768px) {
                .ai-edit-approval-header {
                    padding: 12px 16px;
                }

                .ai-edit-instructions {
                    padding: 12px 16px;
                }


                .diff-controls {
                    flex-direction: column;
                    gap: 8px;
                }

                .diff-btn {
                    width: 100%;
                    justify-content: center;
                }

                .diff-lines {
                    gap: 2px;
                }

                .diff-content {
                    padding: 12px 16px;
                }

                .diff-block {
                    padding: 12px;
                    margin-bottom: 16px;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Export for use in main app
window.AIEditApproval = AIEditApproval;
