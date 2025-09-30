// AI Generate Approval System - For inserting AI-generated content
class AIGenerateApproval {
    constructor(app) {
        this.app = app;
        this.dialog = null;
        this.generatedContent = '';
        this.prompt = '';
        this.aiPanelWasVisible = false;
        this.editorWasVisible = false;
        this.previewWasVisible = false;
        this.isApplying = false;  // guard against rapid re-entrant clicks
    }

    /**
     * Show the AI generate approval dialog
     * @param {string} generatedContent - The AI-generated content
     * @param {string} prompt - The generation prompt given to AI
     */
    showApprovalDialog(generatedContent, prompt) {
        this.generatedContent = generatedContent;
        this.prompt = prompt;

        console.log('[DEBUG] AI Generate Approval - showing dialog');

        // Create dialog if it doesn't exist
        if (!this.dialog) {
            this.createDialog();
        }

        // Populate the dialog with generated content
        this.populateDialog();

        // Show the approval interface
        this.dialog.classList.remove('hidden');

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
        console.log('[DEBUG] AI Generate Approval - creating dialog');

        // Create the dialog element
        this.dialog = document.createElement('div');
        this.dialog.id = 'ai-generate-approval-inline';
        this.dialog.className = 'ai-generate-approval-inline hidden';
        this.dialog.innerHTML = `
            <div class="ai-generate-approval-header">
                <h3><i class="fas fa-magic"></i> AI Content Generation</h3>
                <button id="ai-generate-approval-close" class="btn-secondary btn-small"><i class="fas fa-times"></i></button>
            </div>
            <div class="ai-generate-instructions">
                <div class="instruction-item">
                    <strong>Prompt:</strong> <span id="ai-generate-prompt-text">${this.escapeHtml(this.prompt)}</span>
                </div>
                <div class="instruction-item">
                    <strong>Status:</strong> <span class="status-ready">Ready to insert</span>
                </div>
            </div>
            <div class="ai-generate-approval-body">
                <div class="ai-generate-content-container">
                    <div class="ai-generate-section-title">Generated Content:</div>
                    <div id="ai-generate-content" class="ai-generate-content"></div>
                </div>
                <div class="ai-generate-actions">
                    <button id="ai-generate-insert" class="btn-primary"><i class="fas fa-plus"></i> Insert Content</button>
                    <button id="ai-generate-cancel" class="btn-secondary"><i class="fas fa-times"></i> Cancel</button>
                    <button id="ai-generate-help-btn" class="btn-secondary btn-small"><i class="fas fa-question"></i></button>
                </div>
            </div>
        `;

        // Insert the dialog into the DOM
        const editorContainer = document.getElementById('editor-container');
        if (editorContainer) {
            editorContainer.parentNode.insertBefore(this.dialog, editorContainer.nextSibling);
        } else {
            document.body.appendChild(this.dialog);
        }

        console.log('[DEBUG] AI Generate Approval - dialog created and inserted');
    }

    populateDialog() {
        if (!this.dialog) return;

        const contentElement = this.dialog.querySelector('#ai-generate-content');
        const promptElement = this.dialog.querySelector('#ai-generate-prompt-text');

        if (contentElement) {
            // Render the generated content with markdown support if available
            if (window.marked) {
                contentElement.innerHTML = marked.parse(this.generatedContent);
            } else {
                contentElement.textContent = this.generatedContent;
            }
        }

        if (promptElement) {
            promptElement.textContent = this.prompt;
        }
    }

    setupEventListeners() {
        if (!this.dialog) return;

        // Close button
        const closeBtn = this.dialog.querySelector('#ai-generate-approval-close');
        if (closeBtn) {
            closeBtn.removeEventListener('click', this.handleClose.bind(this));
            closeBtn.addEventListener('click', this.handleClose.bind(this));
        }

        // Cancel button
        const cancelBtn = this.dialog.querySelector('#ai-generate-cancel');
        if (cancelBtn) {
            cancelBtn.removeEventListener('click', this.handleCancel.bind(this));
            cancelBtn.addEventListener('click', this.handleCancel.bind(this));
        }

        // Insert button
        const insertBtn = this.dialog.querySelector('#ai-generate-insert');
        if (insertBtn) {
            insertBtn.removeEventListener('click', this.handleInsert.bind(this));
            insertBtn.addEventListener('click', this.handleInsert.bind(this));
        }

        // Help button
        const helpBtn = this.dialog.querySelector('#ai-generate-help-btn');
        if (helpBtn) {
            helpBtn.removeEventListener('click', this.showHelp.bind(this));
            helpBtn.addEventListener('click', this.showHelp.bind(this));
        }

        // Keyboard shortcuts
        document.removeEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
    }

    handleClose() {
        console.log('[DEBUG] AI Generate Approval - handleClose');
        this.hideDialog();
    }

    handleCancel() {
        console.log('[DEBUG] AI Generate Approval - handleCancel');
        this.hideDialog();
    }

    handleInsert() {
        if (this.isApplying) {
            console.log('[DEBUG] AI Generate Approval - already applying, ignoring duplicate click');
            return;
        }

        console.log('[DEBUG] AI Generate Approval - handleInsert');
        this.isApplying = true;

        try {
            // Insert the generated content at the cursor position
            this.app.insertTextAtCursor(this.generatedContent);

            // Show success message
            this.app.showAIMessage('✅ Content inserted successfully!', 'assistant');

            // Close the dialog
            this.hideDialog();

        } catch (error) {
            console.error('[DEBUG] AI Generate Approval - insert failed:', error);
            this.app.showAIMessage(`❌ Failed to insert content: ${error.message}`, 'assistant');
        } finally {
            this.isApplying = false;
        }
    }

    handleKeyDown(e) {
        if (!this.dialog || this.dialog.classList.contains('hidden')) return;

        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                this.handleCancel();
                break;
            case 'Enter':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.handleInsert();
                }
                break;
        }
    }

    hideDialog() {
        console.log('[DEBUG] AI Generate Approval - hideDialog');

        if (this.dialog) {
            this.dialog.classList.add('hidden');
        }

        // Restore the editor and preview modes
        const editorContainer = document.getElementById('editor-container');
        const noteEditor = document.getElementById('note-editor');
        const markdownPreview = document.getElementById('markdown-preview');
        const aiPanel = document.getElementById('ai-panel');

        if (editorContainer) {
            editorContainer.classList.remove('approval-mode');
        }

        if (noteEditor && this.editorWasVisible) {
            noteEditor.classList.remove('hidden');
        }
        if (markdownPreview && this.previewWasVisible) {
            markdownPreview.classList.remove('hidden');
        }

        // Restore AI panel if it was visible
        if (aiPanel && this.aiPanelWasVisible) {
            aiPanel.classList.remove('hidden');
        }

        // Focus the editor
        if (noteEditor) {
            noteEditor.focus();
        }
    }

    showHelp() {
        console.log('[DEBUG] AI Generate Approval - showHelp');

        const helpContent = `
            <div style="padding: 16px;">
                <h4 style="margin-top: 0; color: var(--accent-color);"><i class="fas fa-magic"></i> AI Content Generation Help</h4>
                <p><strong>What is this?</strong><br>
                This dialog shows content generated by AI based on your prompt. You can review it before inserting it into your note.</p>

                <p><strong>How to use:</strong><br>
                • Review the generated content in the preview area<br>
                • Click "Insert Content" to add it to your note at the cursor position<br>
                • Click "Cancel" to discard the generated content</p>

                <p><strong>Keyboard shortcuts:</strong><br>
                • <kbd>Ctrl+Enter</kbd> or <kbd>Cmd+Enter</kbd>: Insert content<br>
                • <kbd>Escape</kbd>: Cancel</p>

                <p><strong>Tip:</strong> The content will be inserted exactly where your cursor was positioned when you requested AI generation.</p>
            </div>
        `;

        this.app.showModal('AI Content Generation Help', helpContent);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    initialize() {
        console.log('[DEBUG] AI Generate Approval - initializing');
        // Dialog will be created lazily when first needed
    }
}

// Export for use in main app
window.AIGenerateApproval = AIGenerateApproval;
