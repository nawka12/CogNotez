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
        dialog.innerHTML = `
            <div class="find-replace-header">
                <h3>Find & Replace</h3>
                <button id="find-replace-close" class="find-replace-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="find-replace-body">
                <div class="find-section">
                    <label for="find-input">Find:</label>
                    <input type="text" id="find-input" class="find-input" placeholder="Search text...">
                </div>
                <div class="replace-section">
                    <label for="replace-input">Replace:</label>
                    <input type="text" id="replace-input" class="replace-input" placeholder="Replace with...">
                </div>
                <div class="options-section">
                    <label><input type="checkbox" id="case-sensitive"> Case sensitive</label>
                    <label><input type="checkbox" id="whole-word"> Whole word</label>
                    <label><input type="checkbox" id="use-regex"> Regular expression</label>
                </div>
                <div class="results-section">
                    <span id="match-count">No matches</span>
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

        if (findOnly) {
            this.element.querySelector('.replace-section').style.display = 'none';
            this.element.querySelector('#replace-next').style.display = 'none';
            this.element.querySelector('#replace-all').style.display = 'none';
            this.element.querySelector('h3').textContent = 'Find';
        } else {
            this.element.querySelector('.replace-section').style.display = 'block';
            this.element.querySelector('#replace-next').style.display = 'inline-block';
            this.element.querySelector('#replace-all').style.display = 'inline-block';
            this.element.querySelector('h3').textContent = 'Find & Replace';
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
        if (!editor || !this.findText) {
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
        this.clearHighlights();
        if (this.matches.length === 0) return;

        const editor = document.getElementById('note-editor');
        const preview = document.getElementById('markdown-preview');

        // Always select the match in the textarea for consistency
        if (editor) {
            this.selectCurrentMatch();
        }

        // If in preview mode, also highlight in the markdown preview
        if (preview && !preview.classList.contains('hidden') && this.currentMatchIndex >= 0) {
            this.highlightInPreview();
        }
    }

    async clearHighlights() {
        // Reset preview to normal content
        const preview = document.getElementById('markdown-preview');
        const editor = document.getElementById('note-editor');
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

    highlightInPreview() {
        if (this.currentMatchIndex < 0 || this.currentMatchIndex >= this.matches.length) return;

        const preview = document.getElementById('markdown-preview');
        const editor = document.getElementById('note-editor');
        if (!preview || !editor) return;

        const match = this.matches[this.currentMatchIndex];
        const editorText = editor.value;

        // Find the corresponding text in the rendered HTML
        // This is a simplified approach - we'll wrap the matched text in a highlight span
        try {
            const beforeMatch = editorText.substring(0, match.start);
            const matchText = editorText.substring(match.start, match.end);
            const afterMatch = editorText.substring(match.end);

            // Render the content with the match highlighted
            const highlightedText = beforeMatch +
                `<mark class="find-highlight">${matchText}</mark>` +
                afterMatch;

            preview.innerHTML = marked.parse(highlightedText);

            // Scroll the highlight into view
            const highlightElement = preview.querySelector('.find-highlight');
            if (highlightElement) {
                highlightElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } catch (error) {
            console.warn('Error highlighting in preview:', error);
            // Fallback to normal rendering
            preview.innerHTML = marked.parse(editor.value);
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
        this.highlightMatches();
        this.selectCurrentMatch(true); // Focus editor when navigating
    }

    findPrevious() {
        if (this.matches.length === 0) return;

        this.currentMatchIndex = this.currentMatchIndex <= 0 ?
            this.matches.length - 1 : this.currentMatchIndex - 1;
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
        const countElement = this.element.querySelector('#match-count');
        if (this.matches.length === 0) {
            countElement.textContent = 'No matches';
        } else {
            countElement.textContent = `${this.currentMatchIndex + 1} of ${this.matches.length} matches`;
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

        // Phase 5 managers
        this.advancedSearchManager = null;
        this.templatesManager = null;
        this.richMediaManager = null;

        this.init();
    }

    async init() {
        console.log('[DEBUG] Starting CogNotez application initialization...');

        // Show splash screen immediately
        this.showSplashScreen();
        this.updateSplashVersion();
        this.updateSplashProgress('Starting CogNotez...', 5);

        try {
            // Initialize database and managers
            console.log('[DEBUG] Initializing backend API...');
            this.updateSplashProgress('Initializing backend services...', 15);
            this.backendAPI = new BackendAPI();
            this.backendAPI.setAppReference(this);
            await this.backendAPI.initialize();

            console.log('[DEBUG] Initializing notes manager...');
            this.updateSplashProgress('Loading notes database...', 30);
            this.notesManager = new NotesManager(this);
            await this.notesManager.initialize();

            // Start auto-save if enabled in settings
            this.initializeAutoSave();

            console.log('[DEBUG] Initializing AI manager...');
            this.updateSplashProgress('Setting up AI features...', 50);
            this.aiManager = new AIManager(this);
            await this.aiManager.initialize();

            console.log('[DEBUG] Initializing UI manager...');
            this.updateSplashProgress('Preparing user interface...', 70);
            this.uiManager = new UIManager(this);
            this.uiManager.initialize();

            // Initialize Phase 5 features
            console.log('[DEBUG] Initializing Phase 5 features...');
            this.updateSplashProgress('Loading advanced features...', 75);
            await this.initializePhase5Features();

            // Register IPC listeners before any sync to ensure we catch startup sync events
            this.setupIPC();

            console.log('[DEBUG] Initializing sync manager...');
            this.updateSplashProgress('Setting up cloud sync...', 80);
            await this.initializeSync();

            // Setup UI and event listeners
            console.log('[DEBUG] Setting up event listeners and UI...');
            this.updateSplashProgress('Finalizing setup...', 85);
            this.setupEventListeners();
            this.loadTheme();
            await this.loadNotes();
            // After UI loads notes, run startup sync if enabled
            try {
                const syncMeta = (this.notesManager && this.notesManager.db) ? this.notesManager.db.getSyncMetadata() : {};
                if (syncMeta && syncMeta.syncOnStartup && this.syncStatus && this.syncStatus.isAuthenticated) {
                    // Check if we're online before attempting startup sync
                    const isOnline = await window.networkUtils.checkGoogleDriveConnectivity(2000);
                    if (isOnline) {
                        console.log('[Sync] Running startup sync after initial note load...');
                        await this.manualSync();
                    } else {
                        console.log('[Sync] Skipping startup sync - device is offline');
                        this.showNotification('Startup sync skipped - no internet connection', 'info');
                    }
                }
            } catch (e) {
                console.warn('[Sync] Post-load startup sync failed:', e.message);
            }

            // Show welcome message in AI panel
            this.showAIMessage('Hello! I\'m your AI assistant. Select some text and right-click to use AI features.', 'assistant');

            this.updateSplashProgress('Ready!', 100);
            console.log('[DEBUG] CogNotez application initialized successfully');

            // Setup external link handling
            this.setupExternalLinkHandling();

            // Hide splash screen with a small delay to show completion
            setTimeout(() => {
                this.hideSplashScreen();
            }, 800);

        } catch (error) {
            console.error('[DEBUG] Failed to initialize application:', error);
            // Continue with basic functionality even if database fails
            console.log('[DEBUG] Continuing with basic functionality...');
            this.updateSplashProgress('Loading basic features...', 60);
            this.setupEventListeners();
            this.setupIPC();
            this.loadTheme();
            this.loadNotes();

            // Start auto-save if enabled in settings (fallback mode)
            this.initializeAutoSave();

            this.updateSplashProgress('Ready!', 100);

            // Setup external link handling even in fallback mode
            this.setupExternalLinkHandling();

            setTimeout(() => {
                this.hideSplashScreen();
            }, 800);
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
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('ai-toggle-btn').addEventListener('click', () => this.toggleAIPanel());
        document.getElementById('templates-btn').addEventListener('click', () => this.showTemplateChooser());
        const syncSettingsBtn = document.getElementById('sync-settings-btn');
        if (syncSettingsBtn) {
            syncSettingsBtn.addEventListener('click', () => this.showSyncSettings());
        }
        document.getElementById('sync-manual-btn').addEventListener('click', () => this.manualSync());
        document.getElementById('search-button').addEventListener('click', () => this.searchNotes());

        // Network online/offline event listeners
        window.addEventListener('online', () => {
            console.log('[Network] Device is now ONLINE');
            this.showNotification('Connection restored', 'success');
            this.updateSyncUI();
            // Clear network cache when coming back online
            if (window.networkUtils) {
                window.networkUtils.clearCache();
            }
        });

        window.addEventListener('offline', () => {
            console.log('[Network] Device is now OFFLINE');
            this.showNotification('No internet connection', 'warning');
            this.updateSyncUI();
        });

        // Search input
        document.getElementById('search-input').addEventListener('input', (e) => this.searchNotes(e.target.value));
        document.getElementById('search-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.searchNotes();
        });

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
        document.getElementById('ai-summary-btn').addEventListener('click', () => this.summarizeNote());
        document.getElementById('generate-tags-btn').addEventListener('click', () => this.generateTags());
        document.getElementById('manage-tags-btn').addEventListener('click', () => this.showTagManager());
        document.getElementById('export-btn').addEventListener('click', () => this.exportNote());
        document.getElementById('share-btn').addEventListener('click', () => this.showShareOptions());
        document.getElementById('password-lock-btn').addEventListener('click', () => this.showPasswordProtectionDialog());

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
            
            this.showContextMenu(e, selectedText);
        });
        editor.addEventListener('input', () => {
            this.updateNotePreview();
            // Track history for undo/redo functionality
            if (!this.ignoreHistoryUpdate) {
                const cursorPos = editor.selectionStart;
                this.historyManager.pushState(editor.value, cursorPos, cursorPos, cursorPos);
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
        ipcRenderer.on('menu-open-note', () => this.openNoteDialog());
        ipcRenderer.on('menu-summarize', () => this.summarizeSelection());
        ipcRenderer.on('menu-ask-ai', () => this.askAIAboutSelection());
        ipcRenderer.on('menu-edit-ai', () => this.editSelectionWithAI());
        ipcRenderer.on('menu-generate-ai', () => this.generateContentWithAI());
        ipcRenderer.on('menu-export-markdown', () => this.exportNote('markdown'));
        ipcRenderer.on('menu-export-text', () => this.exportNote('text'));
        ipcRenderer.on('menu-export-json', () => this.exportAllNotesJSON());
        ipcRenderer.on('menu-create-backup', () => this.createFullBackup());

        // Import menu actions
        ipcRenderer.on('menu-import-note', () => this.importNote());
        ipcRenderer.on('menu-import-multiple', () => this.importMultipleFiles());
        ipcRenderer.on('menu-restore-backup', () => this.restoreFromBackup());
        ipcRenderer.on('menu-migration-wizard', () => this.showMigrationWizard());

        // New AI menu actions
        ipcRenderer.on('menu-rewrite', () => this.rewriteSelection());
        ipcRenderer.on('menu-key-points', () => this.extractKeyPoints());
        ipcRenderer.on('menu-generate-tags', () => this.generateTags());
        ipcRenderer.on('menu-ai-settings', () => this.showAISettings());
        ipcRenderer.on('menu-general-settings', () => this.showGeneralSettings());
        ipcRenderer.on('menu-sync-settings', () => this.showSyncSettings());

        // Update-related menu actions
        ipcRenderer.on('menu-check-updates', () => this.checkForUpdates());

        // Update-related IPC events
        ipcRenderer.on('update-checking', () => this.showUpdateStatus('Checking for updates...'));
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
            this.showNotification(data.message || 'Google Drive authentication successful', 'success');
            // Refresh sync status to show connected state
            this.updateSyncStatus();
        });

        ipcRenderer.on('google-drive-auth-error', (event, data) => {
            let errorMessage = 'Google Drive authentication failed';
            if (data.error) {
                if (data.error.includes('credentials not found') || data.error.includes('Google Drive credentials')) {
                    errorMessage = 'Google Drive credentials file not found. Please upload your Google Drive credentials JSON file first by clicking "Import Credentials" in the sync settings.';
                } else if (data.error.includes('access_denied') || data.error.includes('403')) {
                    errorMessage = 'Google Drive access denied. Your email needs to be added as a test user in Google Cloud Console → OAuth consent screen → Audience → Test users → ADD USERS.';
                } else {
                    errorMessage = `Google Drive authentication failed: ${data.error}`;
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
        this.updateThemeToggleButton();
    }

    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', this.theme);
        this.loadTheme();
    }

    updateThemeToggleButton() {
        const button = document.getElementById('theme-toggle');
        button.innerHTML = this.theme === 'light' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
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
            toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
            toggleBtn.title = 'Toggle Preview/Edit';
        } else {
            // Switch to preview mode
            editor.classList.add('hidden');
            preview.classList.remove('hidden');
            this.renderMarkdownPreview();
            toggleBtn.innerHTML = '<i class="fas fa-edit"></i>';
            toggleBtn.title = 'Toggle Preview/Edit';
        }

        // Update find highlighting after mode switch
        if (this.findReplaceDialog && this.findReplaceDialog.isVisible && this.findReplaceDialog.findText) {
            this.findReplaceDialog.highlightMatches();
        }
    }

    async renderMarkdownPreview() {
        const editor = document.getElementById('note-editor');
        const preview = document.getElementById('markdown-preview');

        if (!editor.value.trim()) {
            preview.innerHTML = '<p style="color: var(--text-tertiary); font-style: italic;">Start writing your note...</p>';
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
            const content = `
                <div style="padding: 10px 0;">
                    <p style="margin: 0 0 20px 0; color: var(--text-primary);">
                        You have unsaved changes in the current note.
                    </p>
                    <p style="margin: 0 0 20px 0; color: var(--text-secondary); font-size: 14px;">
                        What would you like to do?
                    </p>
                </div>
            `;

            const modal = this.createModal('Unsaved Changes', content, [
                { text: 'Save and Switch', type: 'primary', action: 'save-switch' },
                { text: 'Discard Changes', type: 'secondary', action: 'discard-switch' },
                { text: 'Cancel', type: 'secondary', action: 'cancel' }
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
                    this.showNotification('❌ Failed to save note', 'error');
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
            this.uiManager.showPasswordDialog({
                title: 'Enter Password',
                message: `Enter the password to unlock "${note.title}"`,
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
									this.showNotification('Error decrypting note', 'error');
									resolve(false);
									return;
								}
							}
							this.displayNote(note);
                            this.showNotification('Note unlocked successfully', 'success');
                            resolve(true);
                        } else {
                            this.showNotification('Incorrect password', 'error');
                            // Re-prompt for password
                            setTimeout(() => this.promptForNotePassword(note), 500);
                        }
                    } catch (error) {
                        console.error('Error verifying password:', error);
                        this.showNotification('Error unlocking note', 'error');
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
            this.showNotification('No note selected', 'error');
            return;
        }

        const isCurrentlyProtected = this.currentNote.password_protected;
        const title = isCurrentlyProtected ? 'Remove Password Protection' : 'Add Password Protection';
        const message = isCurrentlyProtected
            ? 'Enter the current password to remove protection from this note.'
            : 'Enter a password to protect this note.';

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
                            this.showNotification('Password protection removed', 'success');
                        } else {
                            this.showNotification('Incorrect password', 'error');
                            return;
                        }
                    } else {
                        // Add protection - set new password
                        await this.setPasswordProtection(this.currentNote, password);
                        this.showNotification('Password protection added', 'success');
                    }

                    // Update the lock icon in the UI
                    this.updatePasswordLockIcon();
                    // Refresh notes list to show lock icon
                    if (this.notesManager) {
                        await this.notesManager.renderNotesList();
                    }
                } catch (error) {
                    console.error('Error managing password protection:', error);
                    this.showNotification('Error managing password protection', 'error');
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
			this.showNotification('Failed to enable protection', 'error');
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
				this.showNotification('Failed to remove protection', 'error');
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
            lockBtn.title = 'Remove Password Protection';
        } else {
            icon.className = 'fas fa-lock';
            lockBtn.title = 'Add Password Protection';
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

        // Initialize history for undo/redo functionality
        this.initializeHistoryForNote(note.content);

        // Display tags in the editor header
        this.displayNoteTags(note);

        // Update password lock icon
        this.updatePasswordLockIcon();

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
                        <button id="tag-manager-close" class="modal-close"><i class="fas fa-times"></i></button>
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

        } catch (error) {
            console.error('Error adding tag:', error);
            this.showNotification('Failed to add tag', 'error');
        }
    }

    // Add existing tag to note
    async addTagToNote(tagId) {
        if (!this.currentNote) return;

        const currentTags = this.currentNote.tags || [];
        if (currentTags.length >= 3) {
            this.showNotification('Maximum 3 tags per note reached', 'warning');
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

                // Also remove note_tags relationship in fallback mode
                if (this.notesManager.db && this.notesManager.db.data && this.notesManager.db.data.note_tags) {
                    const noteTagKey = `${this.currentNote.id}_${tagId}`;
                    delete this.notesManager.db.data.note_tags[noteTagKey];
                }

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

	async saveCurrentNote(isAutoSave = false) {
        if (!this.currentNote || !this.notesManager) return;

        const title = document.getElementById('note-title').value.trim();
        const content = document.getElementById('note-editor').value;

        try {
			let updateData = {
				title: title || 'Untitled Note',
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
				updateData = {
					title: title || 'Untitled Note',
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

            await this.notesManager.renderNotesList();

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
                this.showNotification('Note saved successfully!');
            }
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
                <div class="note-item-date">${new Date(note.modified || note.created).toLocaleDateString()}</div>
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
            this.showNotification('Templates are not available', 'error');
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
                const backend = this.aiManager ? this.aiManager.backend : 'ollama';
                if (backend === 'ollama') {
                    response = `<i class="fas fa-robot"></i> AI features are currently offline.

**To enable Ollama:**
• Start Ollama: Run "ollama serve" in terminal
• Pull a model: "ollama pull llama2"
• Or switch to OpenRouter in AI Settings`;
                } else {
                    response = `<i class="fas fa-robot"></i> AI features are currently offline.

**To enable OpenRouter:**
• Check your internet connection
• Verify your API key in AI Settings
• Or switch to Ollama for offline AI`;
                }
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
            const backend = this.aiManager ? this.aiManager.backend : 'ollama';
            let errorMsg = '❌ Sorry, I encountered an error. ';
            if (backend === 'ollama') {
                errorMsg += 'Please check that Ollama is running and accessible.';
            } else {
                errorMsg += 'Please check your internet connection and OpenRouter settings.';
            }
            this.showAIMessage(errorMsg, 'assistant');
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
        const separator = menu.querySelector('.context-menu-separator');

        // Check if in preview mode
        const preview = document.getElementById('markdown-preview');
        const isPreviewMode = preview && !preview.classList.contains('hidden');

        // AI items that modify content (edit, generate) are disabled in preview mode
        // AI items that don't modify content (summarize, ask) work in both modes

        // Edit AI: only when text selected AND not in preview mode
        if (editItem) {
            const shouldShow = hasSelection && !isPreviewMode;
            editItem.style.display = shouldShow ? 'flex' : 'none';
            if (isPreviewMode) {
                editItem.classList.add('disabled');
            } else {
                editItem.classList.remove('disabled');
            }
        }

        // Generate AI: only when NO text selected AND not in preview mode
        if (generateItem) {
            const shouldShow = !hasSelection && !isPreviewMode;
            generateItem.style.display = shouldShow ? 'flex' : 'none';
            if (isPreviewMode) {
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
                    this.showNotification('Text cut to clipboard', 'success');
                }
                break;
                
            case 'copy':
                if (this.selectedText) {
                    await navigator.clipboard.writeText(this.selectedText);
                    this.showNotification('Text copied to clipboard', 'success');
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
                        this.showNotification('Text pasted', 'success');
                    } catch (err) {
                        this.showNotification('Failed to paste from clipboard', 'error');
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
                    this.showAIDialog('Ask AI About Selection',
                        `Ask a question about the selected text: "${this.selectedText.substring(0, 50)}${this.selectedText.length > 50 ? '...' : ''}"`,
                        'ask-ai');
                } else {
                    this.showAIDialog('Ask AI About Note',
                        `Ask a question about: "${this.currentNote ? this.currentNote.title : 'Untitled'}"`,
                        'ask-ai');
                }
                break;
                
            case 'edit-ai':
                if (this.selectedText) {
                    this.preserveSelection = true;
                    this.showAIDialog('Edit Selection with AI',
                        'How would you like to edit this text?',
                        'edit-ai');
                } else {
                    this.showNotification('Please select text to edit with AI', 'info');
                }
                break;

            case 'generate-ai':
                this.generateContentWithAI();
                break;
        }
    }

    // Legacy methods kept for backward compatibility with keyboard shortcuts
    // These now redirect to the main methods
    rewriteSelection() {
        if (!this.selectedText) {
            this.showNotification('No text selected', 'info');
            return;
        }
        this.preserveSelection = true;
        this.showAIDialog('Rewrite Selection',
            'How would you like to rewrite this text?',
            'rewrite');
    }

    extractKeyPoints() {
        if (!this.selectedText) {
            this.showNotification('No text selected', 'info');
            return;
        }
        this.preserveSelection = true;
        this.showAIDialog('Extract Key Points',
            'Extracting key points from selected text...',
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
            const backend = this.aiManager ? this.aiManager.backend : 'ollama';
            const connectionType = backend === 'ollama' ? 'Ollama service' : 'internet connection and API key';
            this.showNotification(`AI action failed. Please check your ${connectionType}.`, 'error');
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

        // Check if AI manager is properly initialized
        if (!this.aiManager.isInitialized) {
            console.error('[DEBUG] handleAIAction: AI manager not fully initialized - edit approval system missing');
            this.showNotification('AI system is still initializing. Please wait a moment and try again.', 'error');
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

                case 'generate-ai':
                    console.log('[DEBUG] handleAIAction: Processing generate-ai action');
                    await this.aiManager.handleGenerateContent(input);
                    break;

                case 'rewrite':
                    // Ensure AI panel is visible
                    if (!this.aiPanelVisible) {
                        this.toggleAIPanel();
                    }
                    this.updateLoadingText('Rewriting text...');
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
                    this.updateLoadingText('Extracting key points...');
                    this.showLoading();
                    try {
                        const keyPointsResponse = await this.aiManager.extractKeyPoints(this.selectedText);
                        await this.aiManager.saveConversation(noteId, `Extract key points from: "${this.selectedText.substring(0, 100)}..."`, keyPointsResponse, this.selectedText, 'key-points');
                        this.showAIMessage(`<i class="fas fa-clipboard-list"></i> **Key Points:**\n${keyPointsResponse}`, 'assistant');
                    } finally {
                        this.hideLoading();
                    }
                    break;

                case 'generate-tags':
                    // Ensure AI panel is visible
                    if (!this.aiPanelVisible) {
                        this.toggleAIPanel();
                    }
                    this.updateLoadingText('Generating tags...');
                    this.showLoading();
                    try {
                        const tagsResponse = await this.aiManager.generateTags(this.selectedText);
                        await this.aiManager.saveConversation(noteId, `Generate tags for: "${this.selectedText.substring(0, 100)}..."`, tagsResponse, this.selectedText, 'tags');
                        this.showAIMessage(`<i class="fas fa-tags"></i> **Suggested Tags:**\n${tagsResponse}`, 'assistant');
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
            const backend = this.aiManager ? this.aiManager.backend : 'ollama';
            let errorMsg = '❌ AI action failed. ';
            if (backend === 'ollama') {
                errorMsg += 'Please ensure Ollama is running ("ollama serve") and a model is loaded.';
            } else {
                errorMsg += 'Please check your internet connection and OpenRouter API key in AI Settings.';
            }
            this.showAIMessage(errorMsg, 'assistant');
            this.hideLoading();
        }
    }

    // Undo/Redo functionality
    undo() {
        const editor = document.getElementById('note-editor');
        if (!editor) return;

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
            this.ignoreHistoryUpdate = false;

            console.log('[DEBUG] Undo operation completed');
        }
    }

    redo() {
        const editor = document.getElementById('note-editor');
        if (!editor) return;

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

        // Dispatch input event for word count update
        const inputEvent = new Event('input', { bubbles: true });
        editor.dispatchEvent(inputEvent);

        // Update currentNote content if available
        if (this.currentNote) {
            this.currentNote.content = editor.value;
            console.log('[DEBUG] insertTextAtCursor: updated currentNote content');
        } else {
            console.warn('[DEBUG] insertTextAtCursor: no currentNote to update');
        }

        console.log('[DEBUG] insertTextAtCursor: completed successfully');
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
                    <h4 style="margin: 0 0 12px 0; color: var(--text-primary);"><i class="fas fa-exchange-alt"></i> Migration Wizard</h4>
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

        const modal = this.createModal('Migration Wizard', content);

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
                        <strong><i class="fas fa-exclamation-triangle"></i> ID Conflicts:</strong> ${conflicts.length} notes had conflicting IDs and were assigned new IDs.
                    </div>
                ` : ''}

                ${warnings.length > 0 ? `
                    <div style="background: #f8d7da; color: #721c24; padding: 12px; border-radius: 6px; margin-bottom: 12px; border: 1px solid #f5c6cb;">
                        <strong><i class="fas fa-exclamation-triangle"></i> Validation Warnings:</strong><br>
                        <small>${warnings.slice(0, 5).join('<br>')}${warnings.length > 5 ? `<br>... and ${warnings.length - 5} more` : ''}</small>
                    </div>
                ` : ''}

                <div style="background: var(--context-menu-bg); padding: 12px; border-radius: 6px;">
                    <strong>💡 Tips:</strong><br>
                    <small>• Check your notes to ensure everything migrated correctly<br>• You can find backups in your user data directory<br>• Settings have been merged with your existing preferences</small>
                </div>
            </div>
        `;

        this.createModal('Migration Complete', content);
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
            splash.style.opacity = '0';
            splash.style.visibility = 'hidden';
            setTimeout(() => {
                splash.style.display = 'none';
            }, 500);
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
                versionElement.textContent = `Version ${version}`;
            }
        } catch (error) {
            console.warn('Failed to get app version for splash screen:', error);
        }
    }

    updateSplashProgress(text, percentage = null) {
        const progressText = document.getElementById('progress-text');
        const progressFill = document.getElementById('progress-fill');

        if (progressText && text) {
            progressText.textContent = text;
        }

        if (progressFill && percentage !== null) {
            progressFill.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
        }
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
        const shortcuts = [
            // Basic operations
            { key: 'Ctrl+N', description: 'Create new note' },
            { key: 'Ctrl+S', description: 'Save current note' },
            { key: 'Ctrl+O', description: 'Open note' },
            { key: 'Ctrl+/', description: 'Focus search' },

            // Text editing operations
            { key: 'Ctrl+Z', description: 'Undo last change' },
            { key: 'Ctrl+Y', description: 'Redo last undone change' },
            { key: 'Ctrl+F', description: 'Find text in current note' },
            { key: 'Ctrl+H', description: 'Find and replace text' },

            // AI operations (all require text selection)
            { key: 'Ctrl+Shift+S', description: 'Summarize selected text' },
            { key: 'Ctrl+Shift+A', description: 'Ask AI about selected text' },
            { key: 'Ctrl+Shift+E', description: 'Edit selected text with AI' },
            { key: 'Ctrl+Shift+G', description: 'Generate content with AI' },
            { key: 'Ctrl+Shift+W', description: 'Rewrite selected text' },
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
                    this.updateLoadingText('Extracting key points...');
                    this.showLoading();
                    response = await this.aiManager.extractKeyPoints(this.selectedText);
                    await this.aiManager.saveConversation(noteId, `Extract key points from: "${this.selectedText.substring(0, 100)}..."`, response, this.selectedText, 'key-points');
                    this.showAIMessage(`<i class="fas fa-clipboard-list"></i> **Key Points:**\n${response}`, 'assistant');
                    this.hideLoading();
                    break;

                case 'generate-tags':
                    // Ensure AI panel is visible
                    if (!this.aiPanelVisible) {
                        this.toggleAIPanel();
                    }
                    this.updateLoadingText('Generating tags...');
                    this.showLoading();
                    response = await this.aiManager.generateTags(this.selectedText);
                    await this.aiManager.saveConversation(noteId, `Generate tags for: "${this.selectedText.substring(0, 100)}..."`, response, this.selectedText, 'tags');

                    // Parse and save tags to the current note
                    const generatedTags = this.parseTagResponse(response);
                    await this.saveTagsToCurrentNote(generatedTags);

                    this.showAIMessage(`<i class="fas fa-tags"></i> **Suggested Tags:**\n${response}\n\n*Tags have been saved to this note*`, 'assistant');
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
            const backend = this.aiManager ? this.aiManager.backend : 'ollama';
            let errorMsg = '❌ AI action failed. ';
            if (backend === 'ollama') {
                errorMsg += 'Please ensure Ollama is running ("ollama serve") and a model is loaded.';
            } else {
                errorMsg += 'Please check your internet connection and OpenRouter API key in AI Settings.';
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
                this.showNotification('Please select some text in the preview to summarize', 'info');
                return;
            }
        } else {
            // In edit mode, get selected text from editor
            const editor = document.getElementById('note-editor');
            selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();

            if (!selectedText) {
                this.showNotification('Please select some text to summarize', 'info');
                return;
            }
        }

        this.selectedText = selectedText;
        // Directly summarize without requiring user interaction
        if (this.aiManager) {
            this.aiManager.handleSummarize(selectedText);
        } else {
            this.showNotification('AI manager not available', 'error');
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
                this.showNotification('Please select some text in the preview to ask about', 'info');
                return;
            }
        } else {
            // In edit mode, get selected text from editor
            const editor = document.getElementById('note-editor');
            selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();

            if (!selectedText) {
                this.showNotification('Please select some text to ask about', 'info');
                return;
            }
        }

        this.selectedText = selectedText;
        this.showAIDialog('Ask AI About Selection',
            `Selected text: "${selectedText.substring(0, 150)}${selectedText.length > 150 ? '...' : ''}"`,
            'ask-ai');
    }

    editSelectionWithAI() {
        console.log('[DEBUG] editSelectionWithAI called');

        // Check if in preview mode - Edit AI modifies content so it shouldn't work in preview
        const preview = document.getElementById('markdown-preview');
        const isPreviewMode = preview && !preview.classList.contains('hidden');

        if (isPreviewMode) {
            this.showNotification('Edit with AI is not available in preview mode. Switch to edit mode first.', 'info');
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

    generateContentWithAI() {
        console.log('[DEBUG] generateContentWithAI called');

        // Check if in preview mode
        const preview = document.getElementById('markdown-preview');
        const isPreviewMode = preview && !preview.classList.contains('hidden');

        if (isPreviewMode) {
            this.showNotification('Generate with AI is not available in preview mode. Switch to edit mode first.', 'info');
            return;
        }

        // For generate with AI, we don't need selected text - we're generating new content
        this.showAIDialog('Generate Content with AI',
            'What would you like me to generate? (e.g., "a summary of quantum physics", "a todo list for project planning", etc.)',
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

            this.showNotification(`Saved ${Math.min(tags.length, 3)} tag(s) to note (max 3)`, 'success');
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
                    <h4 style="margin: 0 0 12px 0; color: var(--text-primary);"><i class="fas fa-robot"></i> AI Configuration</h4>
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
                                ${this.aiManager.backend === 'ollama' ? '• <strong>Note:</strong> Ollama tool calling may not work with all models. If you experience issues, try a different model or use OpenRouter.' : ''}
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

            this.updateLoadingText('Testing AI connection...');
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
                    <h4 style="margin: 0 0 16px 0; color: var(--text-primary);"><i class="fas fa-cog"></i> General Settings</h4>
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

            this.showNotification('✅ General settings saved successfully!', 'success');
            this.closeModal(modal);
        });
    }

    showShareOptions() {
        if (!this.currentNote || !this.backendAPI) return;

        const content = `
            <div style="max-width: 400px;">
                <div style="margin-bottom: 20px;">
                    <h4 style="margin: 0 0 12px 0; color: var(--text-primary);"><i class="fas fa-share"></i> Share "${this.currentNote.title}"</h4>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">
                        Choose how you want to share this note:
                    </p>
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <button class="share-option-btn" data-action="clipboard-markdown" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                        <span><i class="fas fa-clipboard"></i></span>
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

    // Update-related methods
    async checkForUpdates() {
        try {
            console.log('Checking for updates...');
            await ipcRenderer.invoke('check-for-updates');
        } catch (error) {
            console.error('Failed to check for updates:', error);
            this.showNotification('Failed to check for updates', 'error');
        }
    }

    showUpdateStatus(message) {
        this.showNotification(message, 'info');
    }

    showUpdateAvailable(info) {
        const dialog = document.createElement('div');
        dialog.className = 'update-dialog';
        dialog.innerHTML = `
            <div class="update-dialog-content">
                <h3>Update Available</h3>
                <p>A new version (${info.version}) is available. Would you like to download it?</p>
                <div class="update-dialog-buttons">
                    <button id="download-update" class="btn-primary">Download</button>
                    <button id="cancel-update" class="btn-secondary">Later</button>
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
                this.showNotification('Failed to start download', 'error');
            }
        });

        dialog.querySelector('#cancel-update').addEventListener('click', () => {
            dialog.remove();
        });
    }

    showUpdateNotAvailable(info) {
        this.showNotification(`You're running the latest version (${info.version})`, 'success');
    }

    showUpdateError(error) {
        this.showNotification(`Update check failed: ${error}`, 'error');
    }

    showDownloadProgress(progress) {
        const percent = Math.round(progress.percent);
        this.showNotification(`Downloading update: ${percent}%`, 'info');
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

                    // Show sync status container
                    const syncContainer = document.getElementById('sync-status-container');
                    if (syncContainer) {
                        syncContainer.style.display = 'flex';
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
            this.showNotification('Failed to update local data after sync', 'error');
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
                const errorMessage = syncResult.error ? `Sync failed: ${syncResult.error}` : 'Sync failed';
                this.showNotification(errorMessage, 'error');
                return;
            }

            // Show notification about the sync completion
            let message = 'Sync completed successfully';
            if (syncResult.action) {
                message += ` - ${syncResult.action}`;
            }
            if (syncResult.stats) {
                const stats = syncResult.stats;
                if (stats.downloaded > 0) {
                    message += ` (${stats.downloaded} downloaded)`;
                }
                if (stats.uploaded > 0) {
                    message += ` (${stats.uploaded} uploaded)`;
                }
            }
            this.showNotification(message, 'success');

            console.log('[Sync] UI refreshed after sync completion');
        } catch (error) {
            console.error('[Sync] Failed to handle sync completion:', error);
            this.showNotification('Sync completed but UI refresh failed', 'warning');
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
            this.showNotification(`End-to-end encryption ${statusText}`, 'success');

        } catch (error) {
            console.error('[Encryption] Failed to handle settings update:', error);
        }
    }

    updateSyncUI() {
        const indicator = document.getElementById('sync-status-indicator');
        const icon = document.getElementById('sync-status-icon');
        const text = document.getElementById('sync-status-text');
        const manualBtn = document.getElementById('sync-manual-btn');

        if (!indicator || !icon || !text) return;

        console.log('[UI] Updating sync UI with status:', {
            isAuthenticated: this.syncStatus.isAuthenticated,
            syncEnabled: this.syncStatus.syncEnabled,
            inProgress: this.syncStatus.inProgress
        });

        // Check if we're offline (quick sync check)
        const isOnline = navigator.onLine;

        // Determine if content is in sync using checksums when available
        const contentInSync = !!(this.syncStatus.localChecksum && this.syncStatus.remoteChecksum && this.syncStatus.localChecksum === this.syncStatus.remoteChecksum);

        // Update sync status indicator
        if (this.syncStatus.inProgress) {
            indicator.className = 'sync-status-indicator syncing';
            icon.className = 'fas fa-spinner fa-spin';
            text.textContent = 'Syncing...';
            manualBtn.disabled = true;
        } else if (!isOnline) {
            // Show offline state
            indicator.className = 'sync-status-indicator disconnected';
            icon.className = 'fas fa-wifi-slash';
            text.textContent = 'Offline';
            manualBtn.disabled = true;
        } else if (this.syncStatus.isAuthenticated) {
            if (contentInSync) {
                indicator.className = 'sync-status-indicator connected';
                icon.className = 'fas fa-cloud';
                text.textContent = 'Content in sync';
                manualBtn.disabled = false;
            } else {
                indicator.className = 'sync-status-indicator disconnected';
                icon.className = 'fas fa-cloud-upload';
                text.textContent = 'Ready to sync';
                manualBtn.disabled = false;
            }
        } else {
            indicator.className = 'sync-status-indicator disconnected';
            icon.className = 'fas fa-cloud-off';
            text.textContent = 'Not connected';
            manualBtn.disabled = true;
        }

        // Update last sync time
        const lastSyncElement = document.getElementById('google-drive-last-sync');
        if (lastSyncElement && this.syncStatus.lastSync) {
            const lastSyncDate = new Date(this.syncStatus.lastSync);
            const timeAgo = this.getTimeAgo(lastSyncDate);
            lastSyncElement.textContent = `Last synced: ${timeAgo}`;
        }
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;

        return date.toLocaleDateString();
    }

    showSyncSettings() {
        try {
            const content = `
                <div style="max-width: 700px;">
                    <div style="margin-bottom: 24px;">
                        <h4 style="margin: 0 0 16px 0; color: var(--text-primary);"><i class="fas fa-cloud"></i> Google Drive Sync Settings</h4>
                    </div>

                    <div id="sync-settings-content">
                        <!-- Status Section -->
                        <div class="sync-section" style="margin-bottom: 24px;">
                            <div id="sync-status-display">
                                <div class="sync-status-card" style="background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                                    <div class="sync-status-header" style="display: flex; align-items: center; margin-bottom: 12px;">
                                        <div class="sync-status-indicator" id="modal-sync-indicator" style="width: 12px; height: 12px; border-radius: 50%; margin-right: 8px;"></div>
                                        <span class="sync-status-text" id="modal-sync-status-text" style="font-weight: 500;">Loading...</span>
                                    </div>
                                    <div class="sync-last-sync" id="modal-sync-last-sync" style="font-size: 0.9rem; color: var(--text-secondary);"></div>
                                    <div class="sync-buttons" style="margin-top: 12px;">
                                        <button id="modal-google-drive-connect-btn" class="sync-button" style="background: var(--accent-color); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; margin-right: 8px;">Connect Google Drive</button>
                                        <button id="modal-google-drive-disconnect-btn" class="sync-button" style="background: var(--surface-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem; margin-right: 8px; display: none;">Disconnect</button>
                                        <button id="modal-google-drive-sync-btn" class="sync-button" style="background: var(--surface-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem;" disabled>Sync Now</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Options Section -->
                        <div class="sync-section" style="margin-bottom: 24px;">
                            <h5 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;">Sync Options</h5>
                            <div class="sync-options" style="display: grid; gap: 12px;">
                                <div class="sync-option" style="display: flex; align-items: center; padding: 12px; background: var(--surface-bg); border-radius: 6px; border: 1px solid var(--border-color);">
                                    <input type="checkbox" id="modal-auto-sync" style="margin-right: 12px;">
                                    <div>
                                        <label for="modal-auto-sync" style="cursor: pointer; color: var(--text-primary); font-weight: 500;">Automatic Sync</label>
                                        <div class="sync-option-description" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">Automatically sync changes every 5 minutes when connected</div>
                                    </div>
                                </div>
                                <div class="sync-option" style="display: flex; align-items: center; padding: 12px; background: var(--surface-bg); border-radius: 6px; border: 1px solid var(--border-color);">
                                    <input type="checkbox" id="modal-sync-on-startup" style="margin-right: 12px;">
                                    <div>
                                        <label for="modal-sync-on-startup" style="cursor: pointer; color: var(--text-primary); font-weight: 500;">Sync on Startup</label>
                                        <div class="sync-option-description" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">Sync data when the application starts</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Encryption Section -->
                        <div class="sync-section" style="margin-bottom: 24px;">
                            <h5 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;"><i class="fas fa-lock"></i> End-to-End Encryption</h5>
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
                                            <label for="modal-encryption-enabled" style="cursor: pointer; color: var(--text-primary); font-weight: 500;">Enable End-to-End Encryption</label>
                                            <div class="sync-option-description" style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">Encrypt your data before uploading to Google Drive. Your data will only be accessible with your passphrase.</div>
                                        </div>
                                    </div>

                                    <div class="encryption-passphrase-section" id="encryption-passphrase-section" style="display: none;">
                                        <div style="margin-bottom: 12px;">
                                            <label for="modal-encryption-passphrase" style="display: block; margin-bottom: 4px; color: var(--text-primary); font-weight: 500;">Passphrase</label>
                                            <input type="password" id="modal-encryption-passphrase" placeholder="Enter your passphrase (min. 8 characters)" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-color);">
                                            <div class="encryption-passphrase-help" style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
                                                Your passphrase is used to encrypt and decrypt your data. Choose a strong passphrase and keep it safe.
                                            </div>
                                        </div>

                                        <div style="margin-bottom: 12px;">
                                            <label for="modal-encryption-passphrase-confirm" style="display: block; margin-bottom: 4px; color: var(--text-primary); font-weight: 500;">Confirm Passphrase</label>
                                            <input type="password" id="modal-encryption-passphrase-confirm" placeholder="Confirm your passphrase" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-color);">
                                        </div>

                                        <div class="encryption-buttons" style="display: flex; gap: 8px;">
                                            <button id="modal-encryption-save-btn" class="sync-button" style="background: var(--accent-color); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Save Encryption Settings</button>
                                            <button id="modal-encryption-cancel-btn" class="sync-button" style="background: var(--surface-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Cancel</button>
                                        </div>

                                        <div id="encryption-validation" style="margin-top: 8px; font-size: 0.8rem;"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Conflicts Section (hidden by default) -->
                        <div id="modal-conflicts-section" class="sync-section" style="display: none;">
                            <h5 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;">Sync Conflicts</h5>
                            <div id="modal-conflicts-list" style="background: var(--surface-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 16px;">
                                <!-- Conflicts will be populated here -->
                            </div>
                        </div>

                        <!-- Setup Section -->
                        <div class="sync-section">
                            <h5 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;">Setup Instructions</h5>
                            <div class="sync-setup-section" style="background: var(--surface-bg); border-radius: 6px; padding: 16px; border: 1px solid var(--border-color);">
                                <div class="sync-setup-steps" style="counter-reset: step-counter;">
                                    <div class="sync-setup-step" style="counter-increment: step-counter; margin-bottom: 12px; position: relative; padding-left: 32px;">
                                        <div style="position: absolute; left: 0; top: 0; width: 24px; height: 24px; background: var(--accent-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600;">1</div>
                                        <h6 style="margin: 0 0 4px 0; font-size: 0.9rem; color: var(--text-primary);">Create Google Cloud Project</h6>
                                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">Go to <a href="https://console.cloud.google.com/" target="_blank" style="color: var(--accent-color);">Google Cloud Console</a> and create a new project.</p>
                                    </div>
                                    <div class="sync-setup-step" style="counter-increment: step-counter; margin-bottom: 12px; position: relative; padding-left: 32px;">
                                        <div style="position: absolute; left: 0; top: 0; width: 24px; height: 24px; background: var(--accent-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600;">2</div>
                                        <h6 style="margin: 0 0 4px 0; font-size: 0.9rem; color: var(--text-primary);">Enable Google Drive API</h6>
                                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">In the Cloud Console, enable the Google Drive API for your project.</p>
                                    </div>
                                    <div class="sync-setup-step" style="counter-increment: step-counter; margin-bottom: 12px; position: relative; padding-left: 32px;">
                                        <div style="position: absolute; left: 0; top: 0; width: 24px; height: 24px; background: var(--accent-color); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600;">3</div>
                                        <h6 style="margin: 0 0 4px 0; font-size: 0.9rem; color: var(--text-primary);">Import Credentials</h6>
                                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-secondary);">Use the button below to load your OAuth credentials file.</p>
                                    </div>
                                </div>

                                <div style="margin-top: 16px;">
                                    <button id="modal-import-credentials-btn" class="sync-button" style="background: var(--surface-bg); color: var(--text-color); border: 1px solid var(--border-color); padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">Import Credentials File</button>
                                </div>
                            </div>
                        </div>

                        <!-- Advanced Options Section -->
                        <div class="sync-section">
                            <h5 style="margin: 0 0 12px 0; color: var(--text-primary); font-size: 1rem;">Advanced Options</h5>
                            <div class="sync-advanced-options" style="background: var(--surface-bg); border-radius: 6px; padding: 16px; border: 1px solid var(--border-color);">
                                <div class="sync-buttons" style="display: flex; gap: 12px; flex-wrap: wrap;">
                                    <button id="modal-clear-orphaned-ai-btn" class="sync-button" style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">Clear All AI Conversations</button>
                                </div>
                                <div style="margin-top: 12px; font-size: 0.85rem; color: var(--text-secondary);">
                                    <strong>Clear All AI Conversations:</strong> Deletes all AI conversations for all notes. This action cannot be undone.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const modal = this.createModal('Cloud Sync Settings', content, [
                { text: 'Close', type: 'secondary', action: 'close-sync-settings' }
            ]);

            // Initialize sync status in modal
            this.initializeModalSyncHandlers(modal);

            // Initialize encryption status in modal
            this.initializeModalEncryptionHandlers(modal);

        } catch (error) {
            console.error('[Sync] Failed to show sync settings modal:', error);
            this.showNotification('Failed to open sync settings', 'error');
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
            const clearOrphanedAIBtn = modal.querySelector('#modal-clear-orphaned-ai-btn');

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
                    connectBtn.textContent = 'Connecting...';

                    const result = await this.backendAPI.connectGoogleDrive();

                    if (result.success) {
                        this.showNotification(result.message || 'Successfully connected to Google Drive', 'success');
                        await this.updateModalSyncStatus(modal);
                        await this.updateSyncStatus(); // Update main UI
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
                    connectBtn.textContent = 'Connect Google Drive';
                }
            });

            // Disconnect button
            disconnectBtn.addEventListener('click', async () => {
                try {
                    disconnectBtn.disabled = true;
                    disconnectBtn.textContent = 'Disconnecting...';

                    const result = await this.backendAPI.disconnectGoogleDrive();

                    if (result.success) {
                        this.showNotification('Successfully disconnected from Google Drive', 'success');
                        await this.updateModalSyncStatus(modal);
                        await this.updateSyncStatus(); // Update main UI
                    } else {
                        this.showNotification(result.error || 'Failed to disconnect from Google Drive', 'error');
                    }
                } catch (error) {
                    console.error('[Sync] Failed to disconnect Google Drive:', error);
                    this.showNotification('Failed to disconnect from Google Drive', 'error');
                } finally {
                    disconnectBtn.disabled = false;
                    disconnectBtn.textContent = 'Disconnect';
                }
            });

            // Sync now button
            syncBtn.addEventListener('click', async () => {
                try {
                    syncBtn.disabled = true;
                    syncBtn.textContent = 'Syncing...';

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
                    syncBtn.textContent = 'Sync Now';
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
                        importBtn.textContent = 'Importing...';

                        const credentialsPath = result.filePaths[0];
                        const setupResult = await this.backendAPI.setupGoogleDriveCredentials(credentialsPath);

                        if (setupResult.success) {
                            this.showNotification('Credentials imported successfully', 'success');
                            // Update modal to show connection options
                            modal.querySelector('.sync-setup-section').style.display = 'none';
                        } else {
                            this.showNotification(setupResult.error || 'Failed to import credentials', 'error');
                        }
                    }
                } catch (error) {
                    console.error('[Sync] Failed to import credentials:', error);
                    this.showNotification('Failed to import credentials', 'error');
                } finally {
                    importBtn.disabled = false;
                    importBtn.textContent = 'Import Credentials File';
                }
            });

            // Auto sync checkbox
            autoSyncCheckbox.addEventListener('change', async () => {
                try {
                    const enabled = autoSyncCheckbox.checked;

                    if (!this.notesManager || !this.notesManager.db) {
                        this.showNotification('Database not available', 'error');
                        return;
                    }

                    const db = this.notesManager.db;
                    db.setAutoSync(enabled);

                    this.showNotification(`Auto-sync ${enabled ? 'enabled' : 'disabled'}`, 'info');

                    if (enabled) {
                        this.startAutoSync();
                    } else {
                        this.stopAutoSync();
                    }
                } catch (error) {
                    console.error('[Sync] Failed to toggle auto sync:', error);
                    this.showNotification('Failed to update auto-sync setting', 'error');
                }
            });

            // Sync on startup checkbox
            startupSyncCheckbox.addEventListener('change', async () => {
                try {
                    const enabled = startupSyncCheckbox.checked;

                    if (!this.notesManager || !this.notesManager.db) {
                        this.showNotification('Database not available', 'error');
                        return;
                    }

                    const db = this.notesManager.db;
                    db.updateSyncMetadata({ syncOnStartup: enabled });

                    this.showNotification(`Sync on startup ${enabled ? 'enabled' : 'disabled'}`, 'info');
                } catch (error) {
                    console.error('[Sync] Failed to toggle sync on startup:', error);
                    this.showNotification('Failed to update sync on startup setting', 'error');
                }
            });

            // Clear all AI conversations button
            clearOrphanedAIBtn.addEventListener('click', async () => {
                try {
                    const confirmed = confirm('Are you sure you want to clear all AI conversations? This will delete ALL AI conversations for ALL notes and cannot be undone.');

                    if (!confirmed) return;

                    clearOrphanedAIBtn.disabled = true;
                    clearOrphanedAIBtn.textContent = 'Clearing...';

                    const result = await this.backendAPI.clearOrphanedAIConversations();

                    if (result.success) {
                        this.showNotification(result.message, 'success');
                    } else {
                        this.showNotification(result.error || 'Failed to clear AI conversations', 'error');
                    }
                } catch (error) {
                    console.error('[Sync] Failed to clear AI conversations:', error);
                    this.showNotification('Failed to clear AI conversations', 'error');
                } finally {
                    clearOrphanedAIBtn.disabled = false;
                    clearOrphanedAIBtn.textContent = 'Clear All AI Conversations';
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
            if (status.isAuthenticated && (status.syncEnabled || rendererSyncEnabled)) {
                indicator.style.backgroundColor = 'var(--success-color)';
                statusText.textContent = 'Connected';
                connectBtn.style.display = 'none';
                disconnectBtn.style.display = 'inline-block';
                syncBtn.disabled = false;
            } else if (status.isAuthenticated) {
                indicator.style.backgroundColor = 'var(--warning-color)';
                statusText.textContent = 'Ready to sync';
                connectBtn.style.display = 'none';
                disconnectBtn.style.display = 'inline-block';
                syncBtn.disabled = false;
            } else {
                indicator.style.backgroundColor = 'var(--error-color)';
                statusText.textContent = 'Not Connected';
                connectBtn.style.display = 'inline-block';
                disconnectBtn.style.display = 'none';
                syncBtn.disabled = true;

                // Add a note about credentials if they're missing
                if (status.error && (status.error.includes('credentials not found') || status.error.includes('Google Drive credentials'))) {
                    statusText.textContent = 'Setup Required';
                    lastSync.textContent = 'Import Google Drive credentials to get started';
                }
            }

            // Update last sync time
            if (status.lastSync) {
                const lastSyncDate = new Date(status.lastSync);
                const timeAgo = this.getTimeAgo(lastSyncDate);
                lastSync.textContent = `Last synced: ${timeAgo}`;
            } else {
                lastSync.textContent = 'Never synced';
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
                    encryptionSaveBtn.textContent = 'Save Encryption Settings';
                } else {
                    // Hide inputs when disabling but keep Save button visible
                    encryptionPassphraseInput.style.display = 'none';
                    encryptionPassphraseConfirmInput.style.display = 'none';
                    encryptionValidation.style.display = 'none';
                    encryptionPassphraseInput.value = '';
                    encryptionPassphraseConfirmInput.value = '';
                    encryptionValidation.textContent = '';
                    encryptionSaveBtn.textContent = 'Disable Encryption';
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

                if (passphrase.length < 8) {
                    encryptionValidation.textContent = 'Passphrase must be at least 8 characters long';
                    encryptionValidation.style.color = 'var(--error-color)';
                    return;
                }

                if (passphrase !== confirmPassphrase) {
                    encryptionValidation.textContent = 'Passphrases do not match';
                    encryptionValidation.style.color = 'var(--error-color)';
                    return;
                }

                encryptionValidation.textContent = '✓ Passphrases match';
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
                            this.showNotification('Please enter a passphrase', 'error');
                            return;
                        }

                        if (passphrase.length < 8) {
                            this.showNotification('Passphrase must be at least 8 characters long', 'error');
                            return;
                        }

                        if (passphrase !== confirmPassphrase) {
                            this.showNotification('Passphrases do not match', 'error');
                            return;
                        }

                        // Generate salt if needed for first-time encryption setup
                        if (!saltToUse) {
                            const saltResult = await ipcRenderer.invoke('derive-salt-from-passphrase', passphrase);
                            if (!saltResult.success) {
                                this.showNotification(`Failed to derive salt: ${saltResult.error}`, 'error');
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
                            this.showNotification(`Invalid encryption settings: ${validationResult.errors?.join(', ') || 'Unknown error'}`, 'error');
                            return;
                        }
                    }

                    encryptionSaveBtn.disabled = true;
                    encryptionSaveBtn.textContent = 'Saving...';

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
                        this.showNotification('Encryption settings saved successfully', 'success');
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
                    this.showNotification('Failed to save encryption settings', 'error');
                } finally {
                    encryptionSaveBtn.disabled = false;
                    encryptionSaveBtn.textContent = 'Save Encryption Settings';
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
                encryptionStatusText.textContent = 'Encryption Enabled';
                encryptionDescription.textContent = 'Your data is encrypted before being uploaded to Google Drive.';
                encryptionEnabledCheckbox.checked = true;
            } else {
                encryptionIndicator.style.backgroundColor = 'var(--text-secondary)';
                encryptionStatusText.textContent = 'Encryption Disabled';
                encryptionDescription.textContent = 'Your data will be uploaded unencrypted to Google Drive.';
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
                        <input type="password" id="modal-passphrase-input" placeholder="Enter your encryption passphrase" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-color);">
                        <div id="modal-passphrase-error" style="margin-top: 6px; font-size: 0.85rem; color: var(--error-color);"></div>
                    </div>
                </div>
            `;

            const modal = this.createModal('Encrypted Data Detected', content, [
                { text: 'Cancel', type: 'secondary', action: 'cancel-passphrase' },
                { text: 'Decrypt', type: 'primary', action: 'confirm-passphrase' }
            ]);

            const input = modal.querySelector('#modal-passphrase-input');
            const errorText = modal.querySelector('#modal-passphrase-error');

            const onConfirm = async () => {
                const passphrase = input.value;
                if (!passphrase || passphrase.length < 8) {
                    errorText.textContent = 'Passphrase must be at least 8 characters';
                    return;
                }

                // Derive salt from passphrase
                const saltResult = await ipcRenderer.invoke('derive-salt-from-passphrase', passphrase);
                if (!saltResult.success) {
                    errorText.textContent = saltResult.error || 'Failed to derive salt';
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
                this.showNotification('Passphrase set. Retrying sync...', 'info');
                try {
                    await this.manualSync();
                } catch (e) {
                    this.showNotification('Sync failed after setting passphrase', 'error');
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
            this.showNotification('Encrypted cloud data detected. Open Sync Settings to enter your passphrase.', 'warning');
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

                conflictElement.innerHTML = `
                    <div style="font-weight: 500; color: var(--text-primary); margin-bottom: 4px;">${conflict.localTitle || 'Untitled Note'}</div>
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
                this.showNotification('Database not available', 'error');
                return;
            }

            const db = this.notesManager.db;
            const success = db.resolveSyncConflict(conflictId, resolution);

            if (success) {
                this.showNotification(`Conflict resolved using ${resolution} version`, 'success');

                // Refresh conflicts display
                const modal = document.getElementById(modalId);
                if (modal) {
                    this.displayModalConflicts(modal);
                }
            } else {
                this.showNotification('Failed to resolve conflict', 'error');
            }

        } catch (error) {
            console.error('[Sync] Failed to resolve modal conflict:', error);
            this.showNotification('Failed to resolve conflict', 'error');
        }
    }

    async manualSync() {
        try {
            if (!this.syncStatus.isAuthenticated) {
                this.showNotification('Please connect to Google Drive first', 'warning');
                return;
            }

            // Check if we're online before attempting sync
            const isOnline = await window.networkUtils.checkGoogleDriveConnectivity(3000);
            if (!isOnline) {
                this.showNotification('Cannot sync - no internet connection', 'error');
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
                                this.showNotification(`Cleaned up ${totalDeleted} unused media file${totalDeleted > 1 ? 's' : ''} (${deletedFromDrive} from Drive, ${deletedFromLocal} from local)`, 'info');
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
