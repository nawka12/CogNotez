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

        this.init();
    }

    async init() {
        console.log('[DEBUG] Starting CogNotez application initialization...');
        try {
            // Initialize database and managers
            console.log('[DEBUG] Initializing backend API...');
            this.backendAPI = new BackendAPI();
            this.backendAPI.setAppReference(this);
            await this.backendAPI.initialize();

            console.log('[DEBUG] Initializing notes manager...');
            this.notesManager = new NotesManager(this);
            await this.notesManager.initialize();

            // Start auto-save if enabled in settings
            const autoSaveEnabled = localStorage.getItem('autoSave') !== 'false'; // Default to true
            if (autoSaveEnabled) {
                console.log('[DEBUG] Starting auto-save...');
                this.notesManager.startAutoSave();
            }

            console.log('[DEBUG] Initializing AI manager...');
            this.aiManager = new AIManager(this);
            await this.aiManager.initialize();

            console.log('[DEBUG] Initializing UI manager...');
            this.uiManager = new UIManager(this);
            this.uiManager.initialize();

            // Setup UI and event listeners
            console.log('[DEBUG] Setting up event listeners and UI...');
            this.setupEventListeners();
            this.setupIPC();
            this.loadTheme();
            await this.loadNotes();

            // Show welcome message in AI panel
            this.showAIMessage('Hello! I\'m your AI assistant. Select some text and right-click to use AI features.', 'assistant');

            console.log('[DEBUG] CogNotez application initialized successfully');
        } catch (error) {
            console.error('[DEBUG] Failed to initialize application:', error);
            // Continue with basic functionality even if database fails
            console.log('[DEBUG] Continuing with basic functionality...');
            this.setupEventListeners();
            this.setupIPC();
            this.loadTheme();
            this.loadNotes();

            // Start auto-save if enabled in settings (fallback mode)
            if (this.notesManager) {
                const autoSaveEnabled = localStorage.getItem('autoSave') !== 'false'; // Default to true
                if (autoSaveEnabled) {
                    console.log('[DEBUG] Starting auto-save in fallback mode...');
                    this.notesManager.startAutoSave();
                }
            }
        }
    }

    setupEventListeners() {
        // Header buttons
        document.getElementById('new-note-btn').addEventListener('click', () => this.createNewNote());
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('ai-toggle-btn').addEventListener('click', () => this.toggleAIPanel());
        document.getElementById('search-button').addEventListener('click', () => this.searchNotes());

        // Search input
        document.getElementById('search-input').addEventListener('input', (e) => this.searchNotes(e.target.value));
        document.getElementById('search-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.searchNotes();
        });

        // Note list click handler (delegate to notes manager)
        document.getElementById('notes-list').addEventListener('click', (e) => {
            const noteItem = e.target.closest('.note-item');
            if (noteItem) {
                const noteId = noteItem.dataset.id;
                this.loadNoteById(noteId);
            } else {
                // Clicked on empty space in notes list - clear selection
                if (this.currentNote) {
                    this.showNoNotePlaceholder();
                }
            }
        });

        // Main content area click handler - clear note selection when clicking on empty editor area
        document.querySelector('.main-content-area').addEventListener('click', (e) => {
            // Only clear if clicking on the main content area itself, not on child elements
            if (e.target === e.currentTarget && this.currentNote) {
                this.showNoNotePlaceholder();
            }
        });

        // Editor actions
        document.getElementById('preview-toggle-btn').addEventListener('click', () => this.togglePreview());
        document.getElementById('save-btn').addEventListener('click', () => this.saveCurrentNote());
        document.getElementById('ai-summary-btn').addEventListener('click', () => this.summarizeNote());
        document.getElementById('generate-tags-btn').addEventListener('click', () => this.generateTags());
        document.getElementById('manage-tags-btn').addEventListener('click', () => this.showTagManager());
        document.getElementById('export-btn').addEventListener('click', () => this.exportNote());
        document.getElementById('share-btn').addEventListener('click', () => this.showShareOptions());

        // Placeholder actions
        document.getElementById('create-first-note-btn').addEventListener('click', () => this.createNewNote());

        // Editor input for real-time preview updates
        document.getElementById('note-editor').addEventListener('input', () => {
            const preview = document.getElementById('markdown-preview');
            if (!preview.classList.contains('hidden')) {
                this.renderMarkdownPreview();
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
        document.getElementById('ai-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendAIMessage();
        });

        // Context menu
        document.addEventListener('contextmenu', (e) => {
            console.log('[DEBUG] Context menu event triggered');
            this.showContextMenu(e);
        });
        document.addEventListener('click', () => this.hideContextMenu());

        // Note editor
        const editor = document.getElementById('note-editor');
        editor.addEventListener('contextmenu', (e) => {
            console.log('[DEBUG] Editor context menu event triggered');
            // Use textarea selection properties instead of window.getSelection()
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            const selectedText = editor.value.substring(start, end).trim();
            console.log('[DEBUG] Selected text:', selectedText ? `"${selectedText.substring(0, 50)}..."` : 'none');
            console.log('[DEBUG] Selection range: start =', start, 'end =', end);
            if (selectedText) {
                e.preventDefault();
                e.stopPropagation();
                console.log('[DEBUG] Preventing default context menu and showing AI menu');
                // Store selection range for later use in replaceSelection
                this.selectionStart = start;
                this.selectionEnd = end;
                this.selectedText = selectedText; // Also store the selected text
                console.log('[DEBUG] Stored selection: start =', this.selectionStart, 'end =', this.selectionEnd);
                console.log('[DEBUG] Stored selected text:', this.selectedText.substring(0, 50) + '...');
                this.showAIContextMenu(e, selectedText);
            }
        });
        editor.addEventListener('input', () => {
            this.updateNotePreview();
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
        ipcRenderer.on('menu-open-note', () => this.openNoteDialog());
        ipcRenderer.on('menu-summarize', () => this.summarizeSelection());
        ipcRenderer.on('menu-ask-ai', () => this.askAIAboutSelection());
        ipcRenderer.on('menu-edit-ai', () => this.editSelectionWithAI());
        ipcRenderer.on('menu-export-markdown', () => this.exportNote('markdown'));
        ipcRenderer.on('menu-export-text', () => this.exportNote('text'));
        ipcRenderer.on('menu-export-json', () => this.exportAllNotesJSON());
        ipcRenderer.on('menu-create-backup', () => this.createFullBackup());

        // Import menu actions
        ipcRenderer.on('menu-import-note', () => this.importNote());
        ipcRenderer.on('menu-import-multiple', () => this.importMultipleFiles());
        ipcRenderer.on('menu-import-evernote', () => this.importFromEvernote());
        ipcRenderer.on('menu-import-onenote', () => this.importFromOneNote());
        ipcRenderer.on('menu-restore-backup', () => this.restoreFromBackup());
        ipcRenderer.on('menu-migration-wizard', () => this.showMigrationWizard());

        // New AI menu actions
        ipcRenderer.on('menu-rewrite', () => this.rewriteSelection());
        ipcRenderer.on('menu-key-points', () => this.extractKeyPoints());
        ipcRenderer.on('menu-generate-tags', () => this.generateTags());
        ipcRenderer.on('menu-ai-settings', () => this.showAISettings());
        ipcRenderer.on('menu-general-settings', () => this.showGeneralSettings());
    }

    // Theme management
    loadTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        this.updateThemeToggleButton();
    }

    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', this.theme);
        this.loadTheme();
    }

    updateThemeToggleButton() {
        const button = document.getElementById('theme-toggle');
        button.textContent = this.theme === 'light' ? '🌙' : '☀️';
    }

    // Preview/Edit mode toggle
    togglePreview() {
        const editor = document.getElementById('note-editor');
        const preview = document.getElementById('markdown-preview');
        const toggleBtn = document.getElementById('preview-toggle-btn');

        const isPreviewMode = !preview.classList.contains('hidden');

        if (isPreviewMode) {
            // Switch to edit mode
            preview.classList.add('hidden');
            editor.classList.remove('hidden');
            toggleBtn.textContent = '👁️';
            toggleBtn.title = 'Toggle Preview/Edit';
            toggleBtn.classList.remove('active');
        } else {
            // Switch to preview mode
            editor.classList.add('hidden');
            preview.classList.remove('hidden');
            this.renderMarkdownPreview();
            toggleBtn.textContent = '✏️';
            toggleBtn.title = 'Toggle Preview/Edit';
            toggleBtn.classList.add('active');
        }
    }

    renderMarkdownPreview() {
        const editor = document.getElementById('note-editor');
        const preview = document.getElementById('markdown-preview');

        if (!editor.value.trim()) {
            preview.innerHTML = '<p style="color: var(--text-tertiary); font-style: italic;">Start writing your note...</p>';
            return;
        }

        // Render markdown and sanitize for security
        const renderedHTML = renderMarkdown(editor.value);
        preview.innerHTML = renderedHTML;
    }

    // Note management
    async loadNotes() {
        if (this.notesManager) {
            await this.notesManager.renderNotesList();

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

    async loadNoteById(noteId) {
        if (!this.notesManager) return;

        try {
            // Auto-save current note before switching if there are unsaved changes
            if (this.currentNote && this.notesManager.hasUnsavedChanges()) {
                console.log('[DEBUG] Auto-saving current note before switching...');
                await this.saveCurrentNote();
            }

            let note;
            if (this.notesManager.db && this.notesManager.db.initialized) {
                note = await this.notesManager.db.getNote(noteId);
            } else {
                note = this.notes.find(n => n.id === noteId);
            }

            if (note) {
                this.displayNote(note);
            }
        } catch (error) {
            console.error('Error loading note:', error);
        }
    }

    async createNewNote() {
        if (!this.notesManager) return;

        const note = {
            id: Date.now().toString(),
            title: 'Untitled Note',
            content: '',
            preview: '',
            tags: []
        };

        try {
            if (this.notesManager.db && this.notesManager.db.initialized) {
                await this.notesManager.db.createNote(note);
                await this.notesManager.renderNotesList();
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

        document.getElementById('note-title').value = note.title;
        document.getElementById('note-editor').value = note.content;
        document.getElementById('note-date').textContent =
            `Modified: ${new Date(note.modified).toLocaleDateString()} ${new Date(note.modified).toLocaleTimeString()}`;

        // Display tags in the editor header
        this.displayNoteTags(note);

        // Update active note in sidebar
        document.querySelectorAll('.note-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === note.id);
        });

        // Trigger word count update since we set content programmatically
        const editor = document.getElementById('note-editor');
        const inputEvent = new Event('input', { bubbles: true });
        editor.dispatchEvent(inputEvent);

        // Load conversation history for this note
        this.loadConversationHistory(note.id);
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

        // Update sidebar to show no active note
        document.querySelectorAll('.note-item').forEach(item => {
            item.classList.remove('active');
        });
    }

    // Helper method to display tags in the note editor header
    displayNoteTags(note) {
        const tagsDisplay = document.getElementById('note-tags-display');

        if (!note.tags || note.tags.length === 0) {
            tagsDisplay.innerHTML = '';
            return;
        }

        let tagsHtml = '<div class="editor-note-tags">';
        note.tags.forEach(tagId => {
            const tagName = this.notesManager.getTagName(tagId);
            tagsHtml += `<span class="editor-note-tag">${this.escapeHtml(tagName)}</span>`;
        });
        tagsHtml += '</div>';

        tagsDisplay.innerHTML = tagsHtml;
    }

    // Helper method to escape HTML
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Show tag management dialog
    showTagManager() {
        if (!this.currentNote) {
            this.showNotification('Please select a note first', 'info');
            return;
        }

        const existingTags = this.currentNote.tags || [];
        const allTags = this.notesManager.db && this.notesManager.db.initialized ?
            this.notesManager.db.getAllTags() : [];

        // Create modal HTML
        const modalHtml = `
            <div id="tag-manager-modal" class="modal">
                <div class="modal-content tag-manager-content">
                    <div class="modal-header">
                        <h3>Manage Tags</h3>
                        <button id="tag-manager-close" class="modal-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <div class="tag-manager-section">
                            <h4>Current Tags</h4>
                            <div id="current-tags" class="current-tags">
                                ${existingTags.length > 0 ?
                                    existingTags.map(tagId => {
                                        const tagName = this.notesManager.getTagName(tagId);
                                        return `<span class="tag-item" data-tag-id="${tagId}">
                                            ${this.escapeHtml(tagName)}
                                            <button class="tag-remove" data-tag-id="${tagId}">×</button>
                                        </span>`;
                                    }).join('') :
                                    '<span class="no-tags">No tags assigned</span>'
                                }
                            </div>
                        </div>
                        <div class="tag-manager-section">
                            <h4>Add Tags</h4>
                            <div class="tag-input-section">
                                <input type="text" id="new-tag-input" placeholder="Enter tag name..." class="tag-input">
                                <button id="add-tag-btn" class="btn-primary">Add Tag</button>
                            </div>
                            <div class="available-tags">
                                <h5>Available Tags</h5>
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
        const input = document.getElementById('new-tag-input');
        const tagName = input.value.trim();

        if (!tagName) {
            this.showNotification('Please enter a tag name', 'warning');
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
                    tagId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                }
            }

            await this.addTagToNote(tagId);
            input.value = '';

        } catch (error) {
            console.error('Error adding tag:', error);
            this.showNotification('Failed to add tag', 'error');
        }
    }

    // Add existing tag to note
    async addTagToNote(tagId) {
        if (!this.currentNote) return;

        const updatedTags = [...(this.currentNote.tags || []), tagId];

        try {
            if (this.notesManager.db && this.notesManager.db.initialized) {
                await this.notesManager.db.updateNote(this.currentNote.id, { tags: updatedTags });
                this.currentNote = await this.notesManager.db.getNote(this.currentNote.id);
            } else {
                this.currentNote.tags = updatedTags;
                this.saveNotes();
            }

            // Update UI
            this.displayNoteTags(this.currentNote);
            await this.notesManager.renderNotesList();

            // Refresh the tag manager
            this.refreshTagManager();

            this.showNotification('Tag added successfully', 'success');
        } catch (error) {
            console.error('Error adding tag to note:', error);
            this.showNotification('Failed to add tag', 'error');
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
                this.saveNotes();
            }

            // Update UI
            this.displayNoteTags(this.currentNote);
            await this.notesManager.renderNotesList();

            // Refresh the tag manager
            this.refreshTagManager();

            this.showNotification('Tag removed successfully', 'success');
        } catch (error) {
            console.error('Error removing tag from note:', error);
            this.showNotification('Failed to remove tag', 'error');
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

    async saveCurrentNote() {
        if (!this.currentNote || !this.notesManager) return;

        const title = document.getElementById('note-title').value.trim();
        const content = document.getElementById('note-editor').value;

        try {
            const updateData = {
                title: title || 'Untitled Note',
                content: content,
                preview: this.generatePreview(content)
            };

            if (this.notesManager.db && this.notesManager.db.initialized) {
                await this.notesManager.db.updateNote(this.currentNote.id, updateData);
                // Refresh the current note data
                this.currentNote = await this.notesManager.db.getNote(this.currentNote.id);
            } else {
                // Fallback to localStorage
                this.currentNote.title = updateData.title;
                this.currentNote.content = updateData.content;
                this.currentNote.modified = new Date();
                this.currentNote.preview = updateData.preview;
                this.saveNotes();
            }

            await this.notesManager.renderNotesList();
            this.showNotification('Note saved successfully!');
        } catch (error) {
            console.error('Error saving note:', error);
            this.showNotification('Failed to save note', 'error');
        }
    }

    async renderNotesList() {
        if (this.notesManager) {
            await this.notesManager.renderNotesList();
        }
    }

    generatePreview(content) {
        return content.split('\n')[0].substring(0, 100) || 'Empty note';
    }

    updateNotePreview() {
        if (this.currentNote) {
            const content = document.getElementById('note-editor').value;
            this.currentNote.preview = this.generatePreview(content);
        }
    }

    updateNoteTitle() {
        if (this.currentNote) {
            this.currentNote.title = document.getElementById('note-title').value || 'Untitled Note';
        }
    }

    // Search functionality
    async searchNotes(query = '') {
        if (this.notesManager) {
            await this.notesManager.renderNotesList(query);
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
            localStorage.setItem('notes', JSON.stringify(this.notes));
            console.log(`[DEBUG] Saved ${this.notes.length} notes to localStorage`);
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
                    <div style="font-size: 48px; margin-bottom: 16px;">📝</div>
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
                <div class="note-item-date">${new Date(note.modified || note.created).toLocaleDateString()}</div>
            `;

            element.addEventListener('click', () => this.displayNote(note));
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

    async sendAIMessage() {
        const input = document.getElementById('ai-input');
        const message = input.value.trim();
        if (!message) return;

        console.log('[DEBUG] Sending AI message:', message);
        console.log('[DEBUG] Current note state - title:', this.currentNote?.title, 'content length:', this.currentNote?.content?.length);
        this.showAIMessage(message, 'user');
        input.value = '';

        // Show typing indicator
        this.showAIMessage('🤔 Thinking...', 'assistant');

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
                response = '🤖 AI features are currently offline. Please ensure Ollama is running locally.';
            }

            // Remove typing indicator and show actual response
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
            this.removeLastAIMessage();
            this.showAIMessage('❌ Sorry, I encountered an error. Please check your AI connection.', 'assistant');
        }
    }

    showAIMessage(message, type) {
        const messagesContainer = document.getElementById('ai-messages');
        const messageElement = document.createElement('div');
        messageElement.className = `ai-message ${type}`;

        // Render markdown for assistant messages, use plain text for user messages
        if (type === 'assistant') {
            messageElement.innerHTML = renderMarkdown(message);
        } else {
            messageElement.textContent = message;
        }

        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    removeLastAIMessage() {
        const messagesContainer = document.getElementById('ai-messages');
        const messages = messagesContainer.querySelectorAll('.ai-message');
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

        // Show welcome message
        this.showAIMessage('Hello! I\'m your AI assistant. Select some text and right-click to use AI features, or ask me anything about your note.', 'assistant');
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

                // Clear existing messages (keep welcome message if any)
                const welcomeMessages = messagesContainer.querySelectorAll('.ai-message');
                if (welcomeMessages.length === 1 && welcomeMessages[0].textContent.includes('Hello! I\'m your AI assistant')) {
                    // Keep the welcome message and add history below it
                } else {
                    messagesContainer.innerHTML = '';
                }

                // Add a separator for conversation history
                const separator = document.createElement('div');
                separator.className = 'ai-message history-separator';
                separator.textContent = `--- Previous Conversations (${conversations.length} messages) ---`;
                separator.style.fontStyle = 'italic';
                separator.style.color = 'var(--text-secondary)';
                separator.style.fontSize = '12px';
                separator.style.textAlign = 'center';
                separator.style.margin = '8px 0';
                messagesContainer.appendChild(separator);

                // Display conversations in chronological order (oldest first)
                conversations.reverse().forEach(conv => {
                    // Add user message (plain text)
                    const userMessage = document.createElement('div');
                    userMessage.className = 'ai-message user';
                    userMessage.textContent = conv.user_message;
                    messagesContainer.appendChild(userMessage);

                    // Add AI response (with markdown rendering)
                    const aiMessage = document.createElement('div');
                    aiMessage.className = 'ai-message assistant';
                    aiMessage.innerHTML = renderMarkdown(conv.ai_response);
                    messagesContainer.appendChild(aiMessage);
                });

                // Scroll to bottom to show latest messages
                messagesContainer.scrollTop = messagesContainer.scrollHeight;

                console.log('[DEBUG] Loaded', conversations.length, 'conversation messages');
            }
        } catch (error) {
            console.error('[DEBUG] Error loading conversation history:', error);
        }
    }

    // Context menu
    showContextMenu(e) {
        // Hide any existing context menus
        this.hideAIContextMenu();
        this.hideContextMenu();

        // Show regular context menu with basic options
        const menu = document.getElementById('context-menu');
        const x = e.pageX || (e.clientX + window.scrollX);
        const y = e.pageY || (e.clientY + window.scrollY);

        // Position the menu
        const menuWidth = 200;
        const menuHeight = 120;

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

        menu.style.position = 'fixed';
        menu.style.left = finalX + 'px';
        menu.style.top = finalY + 'px';
        menu.style.zIndex = '9999';
        menu.classList.remove('hidden');

        // Handle menu item clicks
        const handleClick = (e) => {
            const target = e.target.closest('.context-menu-item');
            if (target) {
                const action = target.dataset.action;
                if (action) {
                    this.handleContextAction(action);
                    this.hideContextMenu();
                }
            }
        };

        menu.addEventListener('click', handleClick, { once: true });

        // Close menu when clicking elsewhere
        setTimeout(() => {
            document.addEventListener('click', () => this.hideContextMenu(), { once: true });
            document.addEventListener('contextmenu', () => this.hideContextMenu(), { once: true });
        }, 10);
    }

    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) menu.classList.add('hidden');
    }

    handleContextAction(action) {
        switch (action) {
            case 'summarize':
                this.summarizeNote();
                break;
            case 'ask-ai':
                // Show AI dialog for asking questions about the current note
                this.showAIDialog('Ask AI About Current Note',
                    `Ask a question about the current note: "${this.currentNote ? this.currentNote.title : 'Untitled'}"`,
                    'ask-ai');
                break;
            case 'edit-ai':
                // This would need the full note content, maybe show a dialog
                this.showNotification('Please select text to edit with AI', 'info');
                break;
        }
    }

    // AI Context Menu
    showAIContextMenu(e, selectedText) {
        console.log('[DEBUG] Showing AI context menu for selected text:', selectedText);
        this.hideAIContextMenu(); // Hide any existing AI context menu
        this.selectedText = selectedText;
        // Preserve selection during AI context menu operations
        this.preserveSelection = true;
        console.log('[DEBUG] Set this.selectedText to:', this.selectedText);
        console.log('[DEBUG] Set preserveSelection to true');

        const menu = document.createElement('div');
        menu.id = 'ai-context-menu';
        menu.className = 'context-menu ai-context-menu';

        menu.innerHTML = `
            <div class="context-menu-item" data-action="summarize">
                📝 Summarize Selection
            </div>
            <div class="context-menu-item" data-action="ask-ai">
                🤖 Ask AI About Selection
            </div>
            <div class="context-menu-item" data-action="edit-ai">
                ✏️ Edit Selection with AI
            </div>
            <div class="context-menu-item" data-action="rewrite">
                🎨 Rewrite Selection
            </div>
            <div class="context-menu-item" data-action="key-points">
                📋 Extract Key Points
            </div>
            <div class="context-menu-item" data-action="generate-tags">
                🏷️ Generate Tags
            </div>
        `;

        // Position the menu at the mouse cursor with viewport bounds checking
        const x = e.pageX || (e.clientX + window.scrollX);
        const y = e.pageY || (e.clientY + window.scrollY);

        // Get menu dimensions (approximate)
        const menuWidth = 220;
        const menuHeight = 280;

        // Adjust position if menu would go off-screen
        let finalX = x;
        let finalY = y;

        if (x + menuWidth > window.innerWidth) {
            finalX = x - menuWidth;
        }

        if (y + menuHeight > window.innerHeight) {
            finalY = y - menuHeight;
        }

        // Ensure minimum positions
        finalX = Math.max(10, finalX);
        finalY = Math.max(10, finalY);

        menu.style.position = 'fixed'; // Use fixed positioning for better control
        menu.style.left = finalX + 'px';
        menu.style.top = finalY + 'px';
        menu.style.zIndex = '9999';

        console.log('[DEBUG] AI context menu positioned at:', x, y);

        // Handle menu item clicks
        menu.addEventListener('click', (e) => {
            const target = e.target.closest('.context-menu-item');
            if (target) {
                const action = target.dataset.action;
                console.log('[DEBUG] AI context menu action clicked:', action);
                if (action) {
                    this.handleAIContextAction(action);
                    this.hideAIContextMenu();
                }
            }
        });

        document.body.appendChild(menu);

        // Force layout and ensure menu is visible
        menu.offsetHeight; // Force reflow

        // Debug: Check if element was added and is visible
        console.log('[DEBUG] Context menu element added to DOM:', menu);
        console.log('[DEBUG] Context menu visibility:', getComputedStyle(menu).visibility);
        console.log('[DEBUG] Context menu display:', getComputedStyle(menu).display);
        console.log('[DEBUG] Context menu position:', menu.style.left, menu.style.top);

        // Ensure menu is visible with forced styles
        menu.style.display = 'block';
        menu.style.visibility = 'visible';
        menu.style.opacity = '1';

        // Additional debug after a short delay
        setTimeout(() => {
            console.log('[DEBUG] Context menu after delay - visibility:', getComputedStyle(menu).visibility);
            console.log('[DEBUG] Context menu after delay - display:', getComputedStyle(menu).display);
            console.log('[DEBUG] Context menu still in DOM:', document.body.contains(menu));
        }, 100);

        // Close menu when clicking elsewhere
        const closeMenu = () => {
            console.log('[DEBUG] Closing context menu');
            this.hideAIContextMenu();
        };

        // Use setTimeout to avoid immediate closing
        setTimeout(() => {
            document.addEventListener('click', closeMenu, { once: true });
            document.addEventListener('contextmenu', closeMenu, { once: true });
        }, 10);
    }

    hideAIContextMenu() {
        const menu = document.getElementById('ai-context-menu');
        if (menu) {
            menu.remove();
        }
        // Reset preserve selection flag when context menu is hidden
        // But only if we're not in an AI dialog
        if (!document.getElementById('ai-dialog').classList.contains('hidden')) {
            console.log('[DEBUG] AI dialog is open, keeping preserveSelection = true');
        } else {
            console.log('[DEBUG] Resetting preserveSelection to false');
            this.preserveSelection = false;
        }
    }

    handleOutsideClick(e) {
        const menu = document.getElementById('ai-context-menu');
        if (menu && !menu.contains(e.target)) {
            this.hideAIContextMenu();
        }
    }

    handleAIContextAction(action) {
        console.log('[DEBUG] handleAIContextAction called with action:', action);
        console.log('[DEBUG] handleAIContextAction: selectedText =', this.selectedText ? this.selectedText.substring(0, 50) + '...' : 'none');
        console.log('[DEBUG] handleAIContextAction: selectionStart =', this.selectionStart, 'selectionEnd =', this.selectionEnd);
        
        if (!this.aiManager) {
            console.error('[DEBUG] handleAIContextAction: AI manager not available');
            this.showNotification('AI manager not available', 'error');
            return;
        }

        if (!this.selectedText) {
            console.error('[DEBUG] handleAIContextAction: No selected text available');
            this.showNotification('No text selected', 'error');
            return;
        }

        try {
            switch (action) {
                case 'summarize':
                    console.log('[DEBUG] handleAIContextAction: calling summarizeSelection');
                    this.summarizeSelection();
                    break;
                case 'ask-ai':
                    console.log('[DEBUG] handleAIContextAction: calling askAIAboutSelection');
                    this.askAIAboutSelection();
                    break;
                case 'edit-ai':
                    console.log('[DEBUG] handleAIContextAction: calling editSelectionWithAI');
                    this.editSelectionWithAI();
                    break;
                case 'rewrite':
                    console.log('[DEBUG] handleAIContextAction: calling rewriteSelection');
                    this.rewriteSelection();
                    break;
                case 'key-points':
                    console.log('[DEBUG] handleAIContextAction: calling extractKeyPoints');
                    this.extractKeyPoints();
                    break;
                case 'generate-tags':
                    console.log('[DEBUG] handleAIContextAction: calling generateTags');
                    this.generateTags();
                    break;
                default:
                    console.error('[DEBUG] handleAIContextAction: Unknown action:', action);
            }
        } catch (error) {
            console.error('[DEBUG] handleAIContextAction error:', error);
            this.showNotification(`Failed to execute AI action: ${error.message}`, 'error');
        }
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
            submitBtn.textContent = 'Submit';
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
        this.showLoading();

        try {
            console.log('[DEBUG] processAIDialog: calling handleAIAction with action =', actionToProcess, 'input =', input);
            await this.handleAIAction(actionToProcess, input, customData);
            console.log('[DEBUG] processAIDialog: handleAIAction completed');
        } catch (error) {
            console.error('[DEBUG] processAIDialog: AI action failed:', error);
            this.showNotification('AI action failed. Please check your connection.', 'error');
        } finally {
            this.hideLoading();
        }
    }

    async handleAIAction(action, input, customData = {}) {
        console.log('[DEBUG] handleAIAction called with action:', action, 'input:', input);
        console.log('[DEBUG] handleAIAction: selectedText =', this.selectedText ? this.selectedText.substring(0, 50) + '...' : 'none');
        console.log('[DEBUG] handleAIAction: selectionStart =', this.selectionStart, 'selectionEnd =', this.selectionEnd);
        
        if (!this.aiManager) {
            console.error('[DEBUG] handleAIAction: AI manager not available');
            this.showNotification('AI manager not available', 'error');
            return;
        }

        if (!action) {
            console.error('[DEBUG] handleAIAction: No action specified');
            this.showNotification('No AI action specified', 'error');
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
                    await this.aiManager.handleEditText(this.selectedText, input);
                    break;

                case 'rewrite':
                    // Ensure AI panel is visible
                    if (!this.aiPanelVisible) {
                        this.toggleAIPanel();
                    }
                    this.showLoading();
                    try {
                        console.log('[DEBUG] handleAIAction rewrite: starting with selectedText:', this.selectedText.substring(0, 50) + '...');
                        const style = input || customData.style || 'professional';
                        console.log('[DEBUG] handleAIAction rewrite: using style:', style);
                        const response = await this.aiManager.rewriteText(this.selectedText, style);
                        console.log('[DEBUG] handleAIAction rewrite: got response:', response.substring(0, 50) + '...');
                        await this.aiManager.saveConversation(noteId, `Rewrite "${this.selectedText.substring(0, 50)}..." in ${style} style`, response, this.selectedText, 'rewrite');
                        this.replaceSelection(response);
                        this.showAIMessage('✅ Text rewritten successfully!', 'assistant');
                    } catch (error) {
                        console.error('[DEBUG] handleAIAction rewrite error:', error);
                        this.showAIMessage(`❌ Failed to rewrite text: ${error.message}`, 'assistant');
                    } finally {
                        this.hideLoading();
                    }
                    break;

                case 'key-points':
                    // Ensure AI panel is visible
                    if (!this.aiPanelVisible) {
                        this.toggleAIPanel();
                    }
                    this.showLoading();
                    try {
                        const keyPointsResponse = await this.aiManager.extractKeyPoints(this.selectedText);
                        await this.aiManager.saveConversation(noteId, `Extract key points from: "${this.selectedText.substring(0, 100)}..."`, keyPointsResponse, this.selectedText, 'key-points');
                        this.showAIMessage(`📋 **Key Points:**\n${keyPointsResponse}`, 'assistant');
                    } finally {
                        this.hideLoading();
                    }
                    break;

                case 'generate-tags':
                    // Ensure AI panel is visible
                    if (!this.aiPanelVisible) {
                        this.toggleAIPanel();
                    }
                    this.showLoading();
                    try {
                        const tagsResponse = await this.aiManager.generateTags(this.selectedText);
                        await this.aiManager.saveConversation(noteId, `Generate tags for: "${this.selectedText.substring(0, 100)}..."`, tagsResponse, this.selectedText, 'tags');
                        this.showAIMessage(`🏷️ **Suggested Tags:**\n${tagsResponse}`, 'assistant');
                    } finally {
                        this.hideLoading();
                    }
                    break;

            }
        } catch (error) {
            console.error('AI action error:', error);
            // Ensure AI panel is visible for error message
            if (!this.aiPanelVisible) {
                this.toggleAIPanel();
            }
            this.showAIMessage('❌ AI action failed. Please check your Ollama connection.', 'assistant');
            this.hideLoading();
        }
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

    // Export functionality
    async exportNote(format = 'markdown') {
        if (!this.currentNote || !this.backendAPI) return;

        try {
            const filePath = await this.backendAPI.exportNote(this.currentNote, format);
            if (filePath) {
                this.showNotification(`Note exported successfully to ${filePath}!`);
            }
        } catch (error) {
            console.error('Export failed:', error);
            this.showNotification('Failed to export note', 'error');
        }
    }

    // Enhanced data portability methods
    async exportAllNotesJSON() {
        if (!this.notes || !this.backendAPI) {
            this.showNotification('No notes available to export', 'warning');
            return;
        }

        if (this.notes.length === 0) {
            this.showNotification('No notes to export. Create some notes first!', 'info');
            return;
        }

        try {
            this.showLoading();
            this.updateLoadingText('Preparing notes for export...');

            this.updateLoadingText(`Exporting ${this.notes.length} notes...`);
            const filePath = await this.backendAPI.exportDatabaseJSON(this.notes, {});

            if (filePath) {
                const stats = this.notes.length > 1 ?
                    `${this.notes.length} notes (${this.notes.reduce((sum, n) => sum + (n.word_count || 0), 0)} words)` :
                    '1 note';
                this.showNotification(`✅ Successfully exported ${stats} to ${filePath}!`, 'success');
            } else {
                throw new Error('Export returned no file path');
            }
            this.hideLoading();
        } catch (error) {
            console.error('JSON export failed:', error);
            let errorMessage = 'Failed to export notes as JSON';

            if (error.message.includes('permission')) {
                errorMessage = 'Permission denied. Please choose a different location.';
            } else if (error.message.includes('disk')) {
                errorMessage = 'Not enough disk space for export.';
            } else if (error.message) {
                errorMessage = `Export failed: ${error.message}`;
            }

            this.showNotification(errorMessage, 'error');
            this.hideLoading();
        }
    }

    async createFullBackup() {
        if (!this.backendAPI) {
            this.showNotification('Backup functionality not available', 'error');
            return;
        }

        try {
            this.showLoading();
            this.updateLoadingText('Preparing backup...');

            const filePath = await this.backendAPI.createBackup();

            if (filePath) {
                this.showNotification(`✅ Full backup created successfully at ${filePath}!`, 'success');
            } else {
                this.showNotification('Backup cancelled or no location selected', 'info');
            }
        } catch (error) {
            console.error('Backup creation failed:', error);

            // Provide user-friendly error messages based on error content
            let errorMessage = 'Failed to create backup';
            if (error.message.includes('database file not found')) {
                errorMessage = 'Database file not found. Please ensure the application has been used to create notes.';
            } else if (error.message.includes('not writable')) {
                errorMessage = 'Cannot write to the selected location. Please choose a different directory.';
            } else if (error.message.includes('permission denied')) {
                errorMessage = 'Permission denied. Please check file permissions or run as administrator.';
            } else if (error.message.includes('disk space')) {
                errorMessage = 'Not enough disk space to create backup.';
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
                this.showNotification(`Note "${importedNote.title}" imported successfully!`);
            }
            this.hideLoading();
        } catch (error) {
            console.error('Import failed:', error);
            this.showNotification('Failed to import note', 'error');
            this.hideLoading();
        }
    }

    async importMultipleFiles() {
        if (!this.backendAPI) {
            this.showNotification('Import functionality not available', 'error');
            return;
        }

        try {
            this.showLoading();
            this.updateLoadingText('Preparing file selection...');

            const result = await this.backendAPI.importMultipleFiles();

            if (!result) {
                this.showNotification('No files selected for import', 'info');
                this.hideLoading();
                return;
            }

            if (result.notes.length === 0) {
                this.showNotification('No valid files found to import', 'warning');
                this.hideLoading();
                return;
            }

            this.updateLoadingText(`Processing ${result.notes.length} files...`);

            // Add imported notes
            this.notes.unshift(...result.notes);
            await this.saveNotes();
            this.renderNotesList();

            const successful = result.metadata.successfulImports;
            const failed = result.metadata.failedImports;
            const totalWords = result.notes.reduce((sum, note) => sum + (note.word_count || 0), 0);

            let message = `✅ Successfully imported ${successful} file${successful !== 1 ? 's' : ''}`;
            if (totalWords > 0) {
                message += ` (${totalWords} words)`;
            }
            if (failed > 0) {
                message += `. ${failed} file${failed !== 1 ? 's' : ''} failed to import.`;
            }

            this.showNotification(message, failed > 0 ? 'warning' : 'success');

        } catch (error) {
            console.error('Bulk import failed:', error);
            let errorMessage = 'Failed to import files';

            if (error.message.includes('permission')) {
                errorMessage = 'Permission denied. Please check file permissions.';
            } else if (error.message.includes('not found')) {
                errorMessage = 'Some files could not be found or accessed.';
            } else if (error.message.includes('format')) {
                errorMessage = 'Unsupported file format. Please select supported file types.';
            } else if (error.message) {
                errorMessage = `Import failed: ${error.message}`;
            }

            this.showNotification(errorMessage, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async importFromEvernote() {
        if (!this.backendAPI) return;

        try {
            this.showLoading();
            const result = await this.backendAPI.importFromEvernote();
            if (result && result.notes.length > 0) {
                this.notes.unshift(...result.notes);
                await this.saveNotes();
                this.renderNotesList();
                this.showNotification(`Imported ${result.notes.length} notes from Evernote!`);
            }
            this.hideLoading();
        } catch (error) {
            console.error('Evernote import failed:', error);
            this.showNotification('Failed to import from Evernote', 'error');
            this.hideLoading();
        }
    }

    async importFromOneNote() {
        if (!this.backendAPI) return;

        try {
            this.showLoading();
            const result = await this.backendAPI.importFromOneNote();
            if (result && result.notes.length > 0) {
                this.notes.unshift(...result.notes);
                await this.saveNotes();
                this.renderNotesList();
                this.showNotification(`Imported ${result.notes.length} notes from OneNote!`);
            }
            this.hideLoading();
        } catch (error) {
            console.error('OneNote import failed:', error);
            this.showNotification('Failed to import from OneNote', 'error');
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
            this.showNotification('Backup restore functionality not available', 'error');
            return;
        }

        try {
            this.showLoading();
            this.updateLoadingText('Preparing to restore backup...');

            const success = await this.backendAPI.restoreBackup();

            if (success) {
                this.updateLoadingText('Reloading application data...');

                // Refresh the legacy notes array from the restored database data
                await this.refreshLegacyNotesArray();

                // Reload all data after restore
                await this.loadNotes();
                this.showNotification('✅ Backup restored successfully! Application data has been reloaded.', 'success');

                // Note: In a production app, you might want to restart the app to ensure clean state
                // For now, just reload the notes list
                this.renderNotesList();
            } else {
                this.showNotification('Restore operation was cancelled', 'info');
            }
        } catch (error) {
            console.error('Backup restore failed:', error);

            // Provide user-friendly error messages
            let errorMessage = 'Failed to restore backup';
            if (error.message.includes('not a valid database backup')) {
                errorMessage = 'Invalid backup file. Please select a valid CogNotez database backup (.db file).';
            } else if (error.message.includes('not found or database location not writable')) {
                errorMessage = 'Cannot restore to the database location. Please check file permissions.';
            } else if (error.message.includes('empty or corrupted')) {
                errorMessage = 'The backup file appears to be corrupted or empty. Please select a different backup.';
            } else if (error.message.includes('permission denied')) {
                errorMessage = 'Permission denied. Please check file permissions or run as administrator.';
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

    async showMigrationWizard() {
        if (!this.backendAPI) return;

        const content = `
            <div style="max-width: 600px;">
                <div style="margin-bottom: 20px;">
                    <h4 style="margin: 0 0 12px 0; color: var(--text-primary);">🔄 Migration Wizard</h4>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">
                        Migrate your notes from another CogNotez installation or supported format.
                    </p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 16px;">
                    <div style="background: var(--context-menu-bg); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color);">
                        <h5 style="margin: 0 0 8px 0; color: var(--text-primary);">📁 From CogNotez JSON Export</h5>
                        <p style="margin: 0 0 12px 0; color: var(--text-secondary); font-size: 13px;">
                            Select a JSON file exported from another CogNotez installation.
                        </p>
                        <button class="migration-option-btn" data-action="migrate-json" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer;">
                            Choose JSON File
                        </button>
                    </div>

                    <div style="background: var(--context-menu-bg); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color);">
                        <h5 style="margin: 0 0 8px 0; color: var(--text-primary);">📋 From Other Apps</h5>
                        <p style="margin: 0 0 12px 0; color: var(--text-secondary); font-size: 13px;">
                            Import from Evernote, OneNote, or other note-taking applications.
                        </p>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <button class="migration-option-btn" data-action="migrate-evernote" style="padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer;">
                                Evernote
                            </button>
                            <button class="migration-option-btn" data-action="migrate-onenote" style="padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer;">
                                OneNote
                            </button>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 20px; padding: 12px; background: var(--context-menu-bg); border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4;">
                        <strong>💡 Tips:</strong><br>
                        • Always create a backup before migrating<br>
                        • Migration will merge notes with existing data<br>
                        • Settings can be migrated along with notes<br>
                        • Check the migration report for any issues
                    </div>
                </div>
            </div>
        `;

        const modal = this.showModal('Migration Wizard', content, 'migration-modal');

        // Add event listeners for migration options
        const migrationButtons = modal.querySelectorAll('.migration-option-btn');
        migrationButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.handleMigrationAction(action);
                this.closeModal(modal);
            });
        });
    }

    async handleMigrationAction(action) {
        switch (action) {
            case 'migrate-json':
                await this.performJSONMigration();
                break;

            case 'migrate-evernote':
                this.importFromEvernote();
                break;

            case 'migrate-onenote':
                this.importFromOneNote();
                break;

            default:
                console.warn('Unknown migration action:', action);
                this.showNotification('Unknown migration action', 'error');
        }
    }

    async performJSONMigration() {
        try {
            this.showLoading();
            this.updateLoadingText('Starting JSON migration...');

            this.updateLoadingText('Importing data from JSON file...');
            const importedData = await this.backendAPI.importDatabaseJSON();

            if (!importedData || !importedData.notes) {
                throw new Error('No valid data found in the selected file');
            }

            if (importedData.notes.length === 0) {
                this.showNotification('No notes found in the imported file', 'warning');
                this.hideLoading();
                return;
            }

            this.updateLoadingText(`Processing ${importedData.notes.length} notes...`);

            // Reload notes from the database since importDatabaseJSON already saved them
            await this.loadNotes();
            this.renderNotesList();

            // Show detailed results
            const successful = importedData.metadata?.totalNotesImported || importedData.notes.length;
            const warnings = importedData.metadata?.warnings || [];

            let message = `✅ Successfully migrated ${successful} note${successful !== 1 ? 's' : ''}`;
            const totalWords = importedData.notes.reduce((sum, n) => sum + (n.word_count || 0), 0);
            if (totalWords > 0) {
                message += ` (${totalWords} words)`;
            }

            if (warnings.length > 0) {
                message += ` Some notes had validation warnings (${warnings.length}).`;
                this.showNotification(message, 'warning');
            } else {
                this.showNotification(message, 'success');
            }

            // Show migration summary if there were issues
            if (warnings.length > 0) {
                setTimeout(() => {
                    this.showMigrationSummary(importedData, [], warnings);
                }, 3000);
            }

        } catch (error) {
            console.error('JSON migration failed:', error);

            let errorMessage = 'Migration failed';
            if (error.message.includes('No file selected')) {
                errorMessage = 'Please select a JSON file to migrate from.';
            } else if (error.message.includes('Invalid JSON')) {
                errorMessage = 'The selected file is not a valid CogNotez export. Please check the file format.';
            } else if (error.message.includes('permission')) {
                errorMessage = 'Permission denied. Please check file permissions or choose a different location.';
            } else if (error.message) {
                errorMessage = `Migration failed: ${error.message}`;
            }

            this.showNotification(errorMessage, 'error');
        } finally {
            this.hideLoading();
        }
    }

    showMigrationSummary(importData, conflicts, warnings) {
        const content = `
            <div style="max-width: 500px;">
                <h4 style="margin: 0 0 16px 0; color: var(--text-primary);">📊 Migration Summary</h4>

                <div style="background: var(--context-menu-bg); padding: 12px; border-radius: 6px; margin-bottom: 12px;">
                    <strong>Successfully migrated:</strong> ${importData.metadata?.totalNotesImported || 0} notes<br>
                    <strong>Total words:</strong> ${importData.notes.reduce((sum, n) => sum + (n.word_count || 0), 0)}<br>
                    <strong>Settings migrated:</strong> ${importData.settings ? 'Yes' : 'No'}
                </div>

                ${conflicts.length > 0 ? `
                    <div style="background: #fff3cd; color: #856404; padding: 12px; border-radius: 6px; margin-bottom: 12px; border: 1px solid #ffeaa7;">
                        <strong>⚠️ ID Conflicts:</strong> ${conflicts.length} notes had conflicting IDs and were assigned new IDs.
                    </div>
                ` : ''}

                ${warnings.length > 0 ? `
                    <div style="background: #f8d7da; color: #721c24; padding: 12px; border-radius: 6px; margin-bottom: 12px; border: 1px solid #f5c6cb;">
                        <strong>⚠️ Validation Warnings:</strong><br>
                        <small>${warnings.slice(0, 5).join('<br>')}${warnings.length > 5 ? `<br>... and ${warnings.length - 5} more` : ''}</small>
                    </div>
                ` : ''}

                <div style="background: var(--context-menu-bg); padding: 12px; border-radius: 6px;">
                    <strong>💡 Tips:</strong><br>
                    <small>• Check your notes to ensure everything migrated correctly<br>• You can find backups in your user data directory<br>• Settings have been merged with your existing preferences</small>
                </div>
            </div>
        `;

        this.showModal('Migration Complete', content);
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Utility methods
    showLoading() {
        document.getElementById('loading-overlay').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loading-overlay').classList.add('hidden');
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
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: '1001',
            maxWidth: '400px',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            animation: 'slideInRight 0.3s ease'
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

    handleKeyboardShortcuts(e) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdOrCtrl = e.ctrlKey || (isMac && e.metaKey);

        if (cmdOrCtrl) {
            switch (e.key) {
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
                    e.preventDefault();
                    document.getElementById('search-input').focus();
                    break;
                case 'o':
                    e.preventDefault();
                    this.openNoteDialog();
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
                case 'R': // Ctrl+Shift+R
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
        const shortcuts = [
            // Basic operations
            { key: 'Ctrl+N', description: 'Create new note' },
            { key: 'Ctrl+S', description: 'Save current note' },
            { key: 'Ctrl+O', description: 'Open note' },
            { key: 'Ctrl+/', description: 'Focus search' },

            // AI operations (all require text selection)
            { key: 'Ctrl+Shift+S', description: 'Summarize selected text' },
            { key: 'Ctrl+Shift+A', description: 'Ask AI about selected text' },
            { key: 'Ctrl+Shift+E', description: 'Edit selected text with AI' },
            { key: 'Ctrl+Shift+R', description: 'Rewrite selected text' },
            { key: 'Ctrl+Shift+K', description: 'Extract key points' },
            { key: 'Ctrl+Shift+T', description: 'Generate tags for selection' },

            // Other shortcuts
            { key: 'F1', description: 'Show this help dialog' },
            { key: 'Escape', description: 'Close menus/dialogs' },
            { key: 'Right-click', description: 'Show AI context menu on selected text' }
        ];

        const content = `
            <div style="max-height: 400px; overflow-y: auto;">
                <div style="margin-bottom: 16px;">
                    <h4 style="margin: 0 0 8px 0; color: var(--text-primary);">💡 Pro tip:</h4>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 13px;">
                        Select any text in your notes and use the keyboard shortcuts above, or right-click for a context menu.
                    </p>
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--border-color); font-weight: 600;">Shortcut</th>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--border-color); font-weight: 600;">Description</th>
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

        this.createModal('Keyboard Shortcuts & AI Features', content, [
            { text: 'Got it!', type: 'primary', action: 'close' }
        ]);
    }

    // Menu actions
    openNoteDialog() {
        // Placeholder for opening existing notes
        console.log('Open note dialog - to be implemented');
    }

    summarizeNote() {
        if (!this.currentNote || !this.currentNote.content) {
            this.showNotification('No note content to summarize', 'info');
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
                    this.showLoading();
                    response = await this.aiManager.extractKeyPoints(this.selectedText);
                    await this.aiManager.saveConversation(noteId, `Extract key points from: "${this.selectedText.substring(0, 100)}..."`, response, this.selectedText, 'key-points');
                    this.showAIMessage(`📋 **Key Points:**\n${response}`, 'assistant');
                    this.hideLoading();
                    break;

                case 'generate-tags':
                    // Ensure AI panel is visible
                    if (!this.aiPanelVisible) {
                        this.toggleAIPanel();
                    }
                    this.showLoading();
                    response = await this.aiManager.generateTags(this.selectedText);
                    await this.aiManager.saveConversation(noteId, `Generate tags for: "${this.selectedText.substring(0, 100)}..."`, response, this.selectedText, 'tags');

                    // Parse and save tags to the current note
                    const generatedTags = this.parseTagResponse(response);
                    await this.saveTagsToCurrentNote(generatedTags);

                    this.showAIMessage(`🏷️ **Suggested Tags:**\n${response}\n\n*Tags have been saved to this note*`, 'assistant');
                    this.hideLoading();
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
            this.showAIMessage('❌ AI action failed. Please check your Ollama connection.', 'assistant');
            this.hideLoading();
        }
    }

    summarizeSelection() {
        const editor = document.getElementById('note-editor');
        const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();

        if (!selectedText) {
            this.showNotification('Please select some text to summarize', 'info');
            return;
        }

        this.selectedText = selectedText;
        this.showAIDialog('Summarize Selection', `Selected text: ${selectedText.substring(0, 100)}...`, 'summarize');
    }

    askAIAboutSelection() {
        const editor = document.getElementById('note-editor');
        const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();

        if (!selectedText) {
            this.showNotification('Please select some text to ask about', 'info');
            return;
        }

        this.selectedText = selectedText;
        this.showAIDialog('Ask AI About Selection',
            `Selected text: "${selectedText.substring(0, 150)}${selectedText.length > 150 ? '...' : ''}"`,
            'ask-ai');
    }

    editSelectionWithAI() {
        console.log('[DEBUG] editSelectionWithAI called');
        
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
            this.showNotification('Please select some text to edit', 'info');
            return;
        }

        console.log('[DEBUG] editSelectionWithAI: Using selectedText:', selectedText.substring(0, 50) + '...');
        
        // Store selection for replacement (ensure we have the latest)
        this.selectedText = selectedText;
        this.selectionStart = start;
        this.selectionEnd = end;

        this.showAIDialog('Edit Selection with AI',
            `Selected text: "${selectedText.substring(0, 150)}${selectedText.length > 150 ? '...' : ''}"`,
            'edit-ai');
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
            this.showNotification('Please select some text to rewrite', 'info');
            return;
        }

        console.log('[DEBUG] rewriteSelection: Using selectedText:', selectedText.substring(0, 50) + '...');

        // Store selection for replacement (ensure we have the latest)
        this.selectedText = selectedText;
        this.selectionStart = start;
        this.selectionEnd = end;

        const styles = ['professional', 'casual', 'academic', 'simple', 'creative'];
        const styleOptions = styles.map(style => `<option value="${style}">${style.charAt(0).toUpperCase() + style.slice(1)}</option>`).join('');

        this.showCustomAIDialog('Rewrite Selection',
            `Selected text: "${selectedText.substring(0, 150)}${selectedText.length > 150 ? '...' : ''}"`,
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
            this.showNotification('Please select some text to extract key points from', 'info');
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
                this.showNotification('Please write some content or select text to generate tags for', 'info');
                return;
            }
            this.selectedText = noteContent;
        } else {
            this.selectedText = selectedText;
        }

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
                        // Fallback: create simple tag ID
                        tagId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    }
                }
                tagIds.push(tagId);
            }

            // Update note with tags
            const updatedTags = [...(this.currentNote.tags || []), ...tagIds];

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

            this.showNotification(`Added ${tags.length} tag(s) to note`, 'success');
        } catch (error) {
            console.error('Error saving tags to note:', error);
            this.showNotification('Failed to save tags to note', 'error');
        }
    }

    showAISettings() {
        if (!this.aiManager) {
            this.showNotification('AI manager not available', 'error');
            return;
        }

        const backendStatus = this.aiManager.backend === 'ollama' ?
            `Ollama ${this.aiManager.isConnected ? 'is running and ready' : 'is not available. Please start Ollama service.'}` :
            `OpenRouter ${this.aiManager.isConnected ? 'API key is valid' : 'API key is invalid or missing.'}`;

        const content = `
            <div style="max-width: 600px;">
                <div style="margin-bottom: 20px;">
                    <h4 style="margin: 0 0 12px 0; color: var(--text-primary);">🤖 AI Configuration</h4>
                    <div style="background: var(--context-menu-bg); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <div style="width: 8px; height: 8px; border-radius: 50%; background: ${this.aiManager.isConnected ? '#28a745' : '#dc3545'};"></div>
                            <span style="font-weight: 500;">Status: ${this.aiManager.isConnected ? 'Connected' : 'Disconnected'}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                            ${backendStatus}
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <label for="ai-backend" style="display: block; margin-bottom: 6px; font-weight: 500;">AI Backend:</label>
                    <select id="ai-backend" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                        <option value="ollama" ${this.aiManager.backend === 'ollama' ? 'selected' : ''}>Ollama (Local)</option>
                        <option value="openrouter" ${this.aiManager.backend === 'openrouter' ? 'selected' : ''}>OpenRouter (Cloud)</option>
                    </select>
                </div>

                <div id="ollama-settings" style="display: ${this.aiManager.backend === 'ollama' ? 'block' : 'none'};">
                    <div style="margin-bottom: 20px;">
                        <label for="ollama-endpoint" style="display: block; margin-bottom: 6px; font-weight: 500;">Ollama Endpoint:</label>
                        <input type="text" id="ollama-endpoint" value="${this.aiManager.ollamaEndpoint}"
                               style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary); font-family: monospace; font-size: 13px;">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label for="ollama-model" style="display: block; margin-bottom: 6px; font-weight: 500;">Ollama Model:</label>
                        <select id="ollama-model" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                            ${this.aiManager.availableModels && this.aiManager.backend === 'ollama' ? this.aiManager.availableModels.map(model =>
                                `<option value="${model.name}" ${model.name === this.aiManager.ollamaModel ? 'selected' : ''}>${model.name}</option>`
                            ).join('') : `<option value="${this.aiManager.ollamaModel}" selected>${this.aiManager.ollamaModel}</option>`}
                        </select>
                    </div>
                </div>

                <div id="openrouter-settings" style="display: ${this.aiManager.backend === 'openrouter' ? 'block' : 'none'};">
                    <div style="margin-bottom: 20px;">
                        <label for="openrouter-api-key" style="display: block; margin-bottom: 6px; font-weight: 500;">OpenRouter API Key:</label>
                        <input type="password" id="openrouter-api-key" value="${this.aiManager.openRouterApiKey}"
                               style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary); font-family: monospace; font-size: 13px;"
                               placeholder="sk-or-v1-...">
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label for="openrouter-model" style="display: block; margin-bottom: 6px; font-weight: 500;">OpenRouter Model:</label>
                        <select id="openrouter-model" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                            ${this.aiManager.availableModels && this.aiManager.backend === 'openrouter' ? this.aiManager.availableModels.map(model =>
                                `<option value="${model.id}" ${model.id === this.aiManager.openRouterModel ? 'selected' : ''}>${model.name || model.id}</option>`
                            ).join('') : `<option value="${this.aiManager.openRouterModel}" selected>${this.aiManager.openRouterModel}</option>`}
                        </select>
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: flex; align-items: center; gap: 8px; font-weight: 500;">
                            <input type="checkbox" id="searxng-enabled" ${this.aiManager.searxngEnabled ? 'checked' : ''}>
                            Enable SearXNG Web Search
                        </label>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                            Give the AI access to web search for current information. The AI is time-aware and will decide when to search the web (for current events, prices, weather, news, time-sensitive data, etc.) using SearXNG to get accurate, up-to-date results. Requires a self-hosted SearXNG instance.
                        </div>
                    </div>

                    <div id="searxng-options" style="display: ${this.aiManager.searxngEnabled ? 'block' : 'none'}; margin-left: 20px;">
                        <div style="margin-bottom: 15px;">
                            <label for="searxng-url" style="display: block; margin-bottom: 6px; font-weight: 500;">SearXNG URL:</label>
                            <input type="text" id="searxng-url" value="${this.aiManager.searxngUrl}"
                                   style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary); font-family: monospace; font-size: 13px;"
                                   placeholder="http://localhost:8080">
                        </div>

                        <div style="margin-bottom: 15px;">
                            <label for="searxng-max-results" style="display: block; margin-bottom: 6px; font-weight: 500;">Max Search Results:</label>
                            <select id="searxng-max-results" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                                <option value="3" ${this.aiManager.searxngMaxResults === 3 ? 'selected' : ''}>3 results</option>
                                <option value="5" ${this.aiManager.searxngMaxResults === 5 ? 'selected' : ''}>5 results</option>
                                <option value="10" ${this.aiManager.searxngMaxResults === 10 ? 'selected' : ''}>10 results</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div style="background: var(--context-menu-bg); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4;">
                        <strong>💡 Tips:</strong><br>
                        <div id="ollama-tips" style="display: ${this.aiManager.backend === 'ollama' ? 'block' : 'none'}">
                            • Default Ollama endpoint is usually <code>http://localhost:11434</code><br>
                            • Popular models: llama2, codellama, mistral<br>
                            • Use <code>ollama pull model_name</code> to download models<br>
                        </div>
                        <div id="openrouter-tips" style="display: ${this.aiManager.backend === 'openrouter' ? 'block' : 'none'}">
                            • Get your API key from <a href="https://openrouter.ai/keys" target="_blank" style="color: var(--accent-color);">OpenRouter</a><br>
                            • Popular models: GPT-4, Claude, Gemini<br>
                            • API key starts with <code>sk-or-v1-</code><br>
                            <div id="searxng-tip" style="display: ${this.aiManager.searxngEnabled ? 'block' : 'none'}">
                                • SearXNG provides privacy-focused web search<br>
                                • Install SearXNG: <code>pip install searxng</code><br>
                            </div>
                        </div>
                        • Right-click selected text for quick AI actions
                    </div>
                </div>
            </div>
        `;

        const modal = this.createModal('AI Settings', content, [
            { text: 'Test Connection', type: 'secondary', action: 'test-connection' },
            { text: 'Save Settings', type: 'primary', action: 'save-settings' },
            { text: 'Cancel', type: 'secondary', action: 'cancel' }
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

        // Add custom button handlers
        const testBtn = modal.querySelector('[data-action="test-connection"]');
        const saveBtn = modal.querySelector('[data-action="save-settings"]');

        testBtn.addEventListener('click', async () => {
            const backend = modal.querySelector('#ai-backend').value;

            this.showLoading();
            try {
                await this.aiManager.switchBackend(backend);
                await this.aiManager.loadAvailableModels();
                this.showNotification('✅ Connection test completed!', 'success');
                // Refresh the modal with updated model list
                this.closeModal(modal);
                setTimeout(() => this.showAISettings(), 100);
            } catch (error) {
                this.showNotification(`❌ Connection error: ${error.message}`, 'error');
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

                    await this.aiManager.updateOpenRouterApiKey(apiKey);
                    await this.aiManager.updateOpenRouterModel(model);
                    await this.aiManager.updateSearxngEnabled(searxngEnabled);
                    await this.aiManager.updateSearxngUrl(searxngUrl);
                    await this.aiManager.updateSearxngMaxResults(searxngMaxResults);
                }

                // Now switch backend (which will validate connection with the updated settings)
                await this.aiManager.switchBackend(backend);

                this.showNotification('✅ AI settings saved successfully!', 'success');
                this.closeModal(modal);
            } catch (error) {
                this.showNotification(`❌ Failed to save settings: ${error.message}`, 'error');
            }
        });
    }

    showGeneralSettings() {
        const currentAutoSave = localStorage.getItem('autoSave') !== 'false'; // Default to true
        const currentTheme = localStorage.getItem('theme') || 'light';
        const currentWordCount = localStorage.getItem('showWordCount') === 'true';

        const content = `
            <div style="max-width: 400px;">
                <div style="margin-bottom: 24px;">
                    <h4 style="margin: 0 0 16px 0; color: var(--text-primary);">⚙️ General Settings</h4>
                </div>

                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <div class="setting-item">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="auto-save-toggle" ${currentAutoSave ? 'checked' : ''} style="margin: 0;">
                            <span style="color: var(--text-primary); font-weight: 500;">Enable Auto-Save</span>
                        </label>
                        <div style="margin-top: 4px; color: var(--text-secondary); font-size: 12px;">
                            Automatically save your notes every 30 seconds when changes are detected
                        </div>
                    </div>

                    <div class="setting-item">
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="word-count-toggle" ${currentWordCount ? 'checked' : ''} style="margin: 0;">
                            <span style="color: var(--text-primary); font-weight: 500;">Show Word Count</span>
                        </label>
                        <div style="margin-top: 4px; color: var(--text-secondary); font-size: 12px;">
                            Display word count in the editor header
                        </div>
                    </div>

                    <div class="setting-item">
                        <label style="color: var(--text-primary); font-weight: 500;">Theme</label>
                        <select id="theme-select" style="width: 100%; padding: 8px; margin-top: 4px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                            <option value="light" ${currentTheme === 'light' ? 'selected' : ''}>Light</option>
                            <option value="dark" ${currentTheme === 'dark' ? 'selected' : ''}>Dark</option>
                        </select>
                    </div>
                </div>
            </div>
        `;

        const modal = this.createModal('General Settings', content, [
            { text: 'Save Settings', type: 'primary', action: 'save-general-settings' },
            { text: 'Cancel', type: 'secondary', action: 'cancel' }
        ]);

        const saveBtn = modal.querySelector('[data-action="save-general-settings"]');
        saveBtn.addEventListener('click', () => {
            const autoSaveEnabled = modal.querySelector('#auto-save-toggle').checked;
            const wordCountEnabled = modal.querySelector('#word-count-toggle').checked;
            const theme = modal.querySelector('#theme-select').value;

            // Save settings
            localStorage.setItem('autoSave', autoSaveEnabled.toString());
            localStorage.setItem('showWordCount', wordCountEnabled.toString());
            localStorage.setItem('theme', theme);

            // Apply theme immediately
            this.theme = theme;
            this.loadTheme();

            // Handle auto-save changes
            if (this.notesManager) {
                if (autoSaveEnabled && !this.notesManager.autoSaveInterval) {
                    this.notesManager.startAutoSave();
                    console.log('[DEBUG] Auto-save enabled');
                } else if (!autoSaveEnabled && this.notesManager.autoSaveInterval) {
                    this.notesManager.stopAutoSave();
                    console.log('[DEBUG] Auto-save disabled');
                }
            }

            this.showNotification('✅ General settings saved successfully!', 'success');
            this.closeModal(modal);
        });
    }

    showShareOptions() {
        if (!this.currentNote || !this.backendAPI) return;

        const content = `
            <div style="max-width: 400px;">
                <div style="margin-bottom: 20px;">
                    <h4 style="margin: 0 0 12px 0; color: var(--text-primary);">📢 Share "${this.currentNote.title}"</h4>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">
                        Choose how you want to share this note:
                    </p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <button class="share-option-btn" data-action="clipboard-markdown" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                        <span>📋</span>
                        <div>
                            <div style="font-weight: 500;">Copy to Clipboard (Markdown)</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">Share formatted content</div>
                        </div>
                    </button>

                    <button class="share-option-btn" data-action="clipboard-text" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                        <span>📄</span>
                        <div>
                            <div style="font-weight: 500;">Copy to Clipboard (Plain Text)</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">Share plain text content</div>
                        </div>
                    </button>

                    <button class="share-option-btn" data-action="export-markdown" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                        <span>📁</span>
                        <div>
                            <div style="font-weight: 500;">Export as Markdown File</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">Save to file for sharing</div>
                        </div>
                    </button>

                    <button class="share-option-btn" data-action="export-text" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                        <span>📄</span>
                        <div>
                            <div style="font-weight: 500;">Export as Text File</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">Save to file for sharing</div>
                        </div>
                    </button>
                </div>

                <div style="margin-top: 20px; padding: 12px; background: var(--context-menu-bg); border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4;">
                        <strong>💡 Tip:</strong> You can also right-click on selected text for quick AI-powered sharing options.
                    </div>
                </div>
            </div>
        `;

        const modal = this.createModal('Share Note', content, [
            { text: 'Close', type: 'secondary', action: 'close' }
        ]);

        // Add click handlers for share options
        modal.querySelectorAll('.share-option-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const action = e.currentTarget.dataset.action;
                await this.handleShareAction(action);
                this.closeModal(modal);
            });
        });
    }

    async handleShareAction(action) {
        if (!this.currentNote || !this.backendAPI) return;

        try {
            let success = false;
            let message = '';

            switch (action) {
                case 'clipboard-markdown':
                    success = await this.backendAPI.shareNoteToClipboard(this.currentNote, 'markdown');
                    message = 'Note copied to clipboard as Markdown!';
                    break;

                case 'clipboard-text':
                    success = await this.backendAPI.shareNoteToClipboard(this.currentNote, 'text');
                    message = 'Note copied to clipboard as plain text!';
                    break;

                case 'export-markdown':
                    const mdPath = await this.backendAPI.shareNoteAsFile(this.currentNote, 'markdown');
                    if (mdPath) {
                        message = `Note exported as Markdown: ${mdPath}`;
                        success = true;
                    }
                    break;

                case 'export-text':
                    const txtPath = await this.backendAPI.shareNoteAsFile(this.currentNote, 'text');
                    if (txtPath) {
                        message = `Note exported as Text: ${txtPath}`;
                        success = true;
                    }
                    break;
            }

            if (success) {
                this.showNotification(message, 'success');
            } else {
                this.showNotification('Failed to share note', 'error');
            }
        } catch (error) {
            console.error('Share error:', error);
            this.showNotification('Failed to share note', 'error');
        }
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
        submitBtn.textContent = 'Rewrite';

        document.getElementById('ai-dialog').classList.remove('hidden');
        this.currentAIAction = action;
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.cognotezApp = new CogNotezApp();
});
