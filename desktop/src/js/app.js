
// Main application entry point for CogNotez
const { ipcRenderer } = require('electron');

// Shared helpers
const { t, setSafeInnerHTML, renderMarkdown } = require('./js/shared');
const FindReplaceDialog = require('./js/find-replace');
// History Manager for undo/redo functionality
const HistoryManager = require('./js/history');
// AI Settings module
const { showAISettings } = require('./js/ai-settings');
// General Settings module
const { showGeneralSettings } = require('./js/general-settings');
// Advanced Settings module
const { showAdvancedSettings } = require('./js/advanced-settings');
// Sync Settings module
const { showSyncSettings, initializeModalEncryptionHandlers, initializeModalSyncHandlers, updateModalSyncStatus } = require('./js/sync-settings');
// Share Options module
const { showShareOptions } = require('./js/share-options');
// Event Listeners module
const { setupEventListeners } = require('./js/event-listeners');
const ModalManager = require('./js/modal-manager');
const TabManager = require('./js/tab-manager');
const TagFolderManager = require('./js/tag-folder-manager');

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

        // Quick model switcher state (desktop)
        this.modelSwitcher = {
            isOpen: false,
            activeBackend: null,
            items: [],
            allItems: [],
            selectedIndex: -1,
            overlay: null,
            input: null,
            list: null,
            status: null,
            empty: null,
            backendLabel: null,
            hint: null
        };

        // AI operation cancellation
        this.currentAIAbortController = null;
        this.isAIOperationCancelled = false;

        // Module managers
        this.modalManager = new ModalManager(this);
        this.tabManager = new TabManager(this);
        this.tagFolderManager = new TagFolderManager(this);

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
            const [,] = await Promise.all([
                this.backendAPI.initialize(),
                (async () => {
                    console.log('[DEBUG] Initializing notes manager...');
                    this.notesManager = new NotesManager(this);
                    await this.notesManager.initialize();

                    // Memory optimization: prune old AI conversations (>30 days old)
                    if (this.notesManager.db && this.notesManager.db.initialized) {
                        this.notesManager.db.pruneOldConversations(30);
                    }
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
            console.log(`[DEBUG] CogNotez initialized in ${elapsed} ms`);

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

    /**
     * Cleanup method for memory management - called before app unloads
     */
    cleanup() {
        console.log('[App] Running cleanup...');

        // Clear all intervals
        if (this.noteDateUpdateInterval) {
            clearInterval(this.noteDateUpdateInterval);
            this.noteDateUpdateInterval = null;
        }
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
        if (this.notesManager?.autoSaveInterval) {
            clearInterval(this.notesManager.autoSaveInterval);
            this.notesManager.autoSaveInterval = null;
        }

        // Clear debounce timers
        if (this.historyDebounceTimer) {
            clearTimeout(this.historyDebounceTimer);
            this.historyDebounceTimer = null;
        }
        if (this.livePreviewDebounce) {
            clearTimeout(this.livePreviewDebounce);
            this.livePreviewDebounce = null;
        }
        if (this.syncScrollTimeout) {
            clearTimeout(this.syncScrollTimeout);
            this.syncScrollTimeout = null;
        }

        // Revoke all blob URLs to free memory
        if (this.richMediaManager) {
            this.richMediaManager.revokeAllBlobUrls();
        }

        console.log('[App] Cleanup completed');
    }

    /**
     * Get memory statistics for debugging
     * @returns {Object} Memory usage statistics
     */
    getMemoryStats() {
        const stats = {
            historyStates: this.historyManager?.history?.length || 0,
            historyMemory: this.historyManager?.getMemoryEstimate?.() || 0,
            openTabs: this.openTabs?.length || 0,
            notesLoaded: this.notes?.length || 0,
            richMedia: this.richMediaManager?.getMemoryStats?.() || null
        };

        console.log('[App] Memory stats:', stats);
        return stats;
    }

    setupEventListeners() {
        setupEventListeners(this);
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
        ipcRenderer.on('sync-closing-show', () => this.showSyncClosingOverlay());
        ipcRenderer.on('sync-closing-hide', () => this.hideSyncClosingOverlay());

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

        // Update find/replace dialog after mode switch
        if (this.findReplaceDialog && this.findReplaceDialog.isVisible) {
            // Update UI elements (replace buttons, disclaimer)
            this.findReplaceDialog.updateUIForMode();
            // Re-run search and highlighting
            if (this.findReplaceDialog.findText) {
                this.findReplaceDialog.findMatches();
            }
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
            const startWritingText = t('editor.startWriting', 'Start writing your note...');
            const safeStart = this.escapeHtml(startWritingText);
            setSafeInnerHTML(preview, `<p style="color: var(--text-tertiary); font-style: italic;">${safeStart}</p>`);
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
        setSafeInnerHTML(preview, renderedHTML);

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
                switch (e.key) {
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

        // Memory optimization: clean up blob URLs from previous note and evict old attachment caches
        if (this.richMediaManager) {
            this.richMediaManager.revokeAllBlobUrls();
            this.richMediaManager.evictOldAttachments(note.id);
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
                dateStr = `${day}/${month}/${year} `;
                if (includeTime) {
                    timeStr = `${String(hours).padStart(2, '0')}:${minutes} `;
                }
                break;
            case 'ja': // Japanese: YYYY/MM/DD, 24-hour
                dateStr = `${year}/${month}/${day} `;
                if (includeTime) {
                    timeStr = `${String(hours).padStart(2, '0')}:${minutes} `;
                }
                break;
            default: // English: MM/DD/YYYY, 12-hour with AM/PM
                dateStr = `${month}/${day}/${year} `;
                if (includeTime) {
                    const hours12 = hours % 12 || 12;
                    const ampm = hours >= 12 ? 'PM' : 'AM';
                    timeStr = `${hours12}:${minutes} ${ampm} `;
                }
                break;
        }

        return includeTime ? `${dateStr} ${timeStr} ` : dateStr;
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
        noteDateElement.textContent = `${modifiedLabel}: ${formattedDateTime} `;
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

    // =====================================================
    // DELEGATION: Tab Manager
    // =====================================================

    get openTabs() { return this.tabManager.openTabs; }
    set openTabs(val) { this.tabManager.openTabs = val; }
    get maxTabs() { return this.tabManager.maxTabs; }
    get _ignoreNextInputForUnsaved() { return this.tabManager._ignoreNextInputForUnsaved; }
    set _ignoreNextInputForUnsaved(val) { this.tabManager._ignoreNextInputForUnsaved = val; }
    get _draggedTabIndex() { return this.tabManager._draggedTabIndex; }
    set _draggedTabIndex(val) { this.tabManager._draggedTabIndex = val; }

    addNoteToTabs(...args) { return this.tabManager.addNoteToTabs(...args); }
    closeTab(...args) { return this.tabManager.closeTab(...args); }
    setActiveTab(...args) { return this.tabManager.setActiveTab(...args); }
    markTabUnsaved(...args) { return this.tabManager.markTabUnsaved(...args); }
    updateTabTitle(...args) { return this.tabManager.updateTabTitle(...args); }
    renderTabs() { return this.tabManager.renderTabs(); }
    reorderTab(...args) { return this.tabManager.reorderTab(...args); }
    switchToTab(...args) { return this.tabManager.switchToTab(...args); }
    closeOtherTabs(...args) { return this.tabManager.closeOtherTabs(...args); }
    closeAllTabs(...args) { return this.tabManager.closeAllTabs(...args); }
    initializeTabsEventListeners() { return this.tabManager.initializeTabsEventListeners(); }

    // =====================================================
    // DELEGATION: Tag/Folder Manager
    // =====================================================

    get currentFolder() { return this.tagFolderManager.currentFolder; }
    set currentFolder(val) { this.tagFolderManager.currentFolder = val; }

    displayNoteTags(...args) { return this.tagFolderManager.displayNoteTags(...args); }
    showTagManager() { return this.tagFolderManager.showTagManager(); }
    setupTagManagerEvents() { return this.tagFolderManager.setupTagManagerEvents(); }
    addNewTag() { return this.tagFolderManager.addNewTag(); }
    addTagToNote(...args) { return this.tagFolderManager.addTagToNote(...args); }
    removeTagFromNote(...args) { return this.tagFolderManager.removeTagFromNote(...args); }
    refreshTagManager() { return this.tagFolderManager.refreshTagManager(); }
    setupFolderNavigation() { return this.tagFolderManager.setupFolderNavigation(); }
    setupTagsListToggle() { return this.tagFolderManager.setupTagsListToggle(); }
    toggleTagsList() { return this.tagFolderManager.toggleTagsList(); }
    updateFolderActiveState() { return this.tagFolderManager.updateFolderActiveState(); }
    switchFolder(...args) { return this.tagFolderManager.switchFolder(...args); }
    renderTagFolders() { return this.tagFolderManager.renderTagFolders(); }
    showCreateTagDialog() { return this.tagFolderManager.showCreateTagDialog(); }
    createTagFromDialog() { return this.tagFolderManager.createTagFromDialog(); }
    showTagFolderContextMenu(...args) { return this.tagFolderManager.showTagFolderContextMenu(...args); }
    renameTagFolder(...args) { return this.tagFolderManager.renameTagFolder(...args); }
    deleteTagFolder(...args) { return this.tagFolderManager.deleteTagFolder(...args); }

    // =====================================================
    // DELEGATION: Modal Manager
    // =====================================================

    createModal(...args) { return this.modalManager.createModal(...args); }
    closeModal(...args) { return this.modalManager.closeModal(...args); }
    closeAllModals() { return this.modalManager.closeAllModals(); }
    showConfirmation(...args) { return this.modalManager.showConfirmation(...args); }
    showInputPrompt(...args) { return this.modalManager.showInputPrompt(...args); }
    showAboutDialog() { return this.modalManager.showAboutDialog(); }
    showAlert(...args) { return this.modalManager.showAlert(...args); }



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
            setSafeInnerHTML(bubble, renderMarkdown(message));
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

    showSyncClosingOverlay() {
        const syncClosingOverlay = document.getElementById('sync-closing-overlay');
        if (syncClosingOverlay) {
            // Ensure translation is applied (i18n system handles data-i18n automatically, but update manually as backup)
            if (window.i18n) {
                const textElement = syncClosingOverlay.querySelector('.loading-text');
                if (textElement && textElement.hasAttribute('data-i18n')) {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    textElement.textContent = t('settings.sync.syncClosingMessage');
                }
            }
            syncClosingOverlay.classList.remove('hidden');
        }
    }

    hideSyncClosingOverlay() {
        const syncClosingOverlay = document.getElementById('sync-closing-overlay');
        if (syncClosingOverlay) {
            syncClosingOverlay.classList.add('hidden');
        }
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

    setupModelSwitcher() {
        const overlay = document.getElementById('model-switcher');
        if (!overlay) return;

        this.modelSwitcher.overlay = overlay;
        this.modelSwitcher.input = document.getElementById('model-switcher-input');
        this.modelSwitcher.list = document.getElementById('model-switcher-list');
        this.modelSwitcher.status = document.getElementById('model-switcher-status');
        this.modelSwitcher.empty = document.getElementById('model-switcher-empty');
        this.modelSwitcher.backendLabel = document.getElementById('model-switcher-backend');
        this.modelSwitcher.hint = document.getElementById('model-switcher-hint');

        const closeBtn = document.getElementById('model-switcher-close');
        const updateHint = () => {
            if (!this.modelSwitcher.hint) return;
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            this.modelSwitcher.hint.textContent = isMac ? '⌘⇧Space' : 'Ctrl+Shift+Space';
        };
        updateHint();

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeModelSwitcher();
            }
        });

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModelSwitcher());
        }

        if (this.modelSwitcher.input) {
            this.modelSwitcher.input.addEventListener('input', (e) => this.applyModelSwitcherFilter(this.modelSwitcher.allItems, e.target.value));
            this.modelSwitcher.input.addEventListener('keydown', (e) => this.handleModelSwitcherKeys(e));
        }

        overlay.addEventListener('keydown', (e) => {
            if (!this.modelSwitcher.isOpen) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                this.closeModelSwitcher();
            }
        });
    }

    async openModelSwitcher(prefill = '') {
        if (!this.modelSwitcher.overlay || !this.modelSwitcher.input) return;
        if (this.uiManager && this.uiManager.isMobile && this.uiManager.isMobile()) return;

        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

        if (!this.aiManager) {
            this.showNotification(t('notifications.aiNotAvailable'), 'error');
            return;
        }

        this.modelSwitcher.activeBackend = this.aiManager.backend;

        try {
            this.modelSwitcher.overlay.classList.remove('hidden');
            this.modelSwitcher.overlay.setAttribute('aria-hidden', 'false');
            this.modelSwitcher.isOpen = true;

            if (this.modelSwitcher.backendLabel) {
                this.modelSwitcher.backendLabel.textContent = this.formatBackendLabel(this.modelSwitcher.activeBackend);
            }

            this.modelSwitcher.input.value = prefill || '';
            setTimeout(() => {
                this.modelSwitcher.input.focus();
                this.modelSwitcher.input.select();
            }, 0);

            await this.refreshModelSwitcherList(prefill || '');
        } catch (error) {
            console.error('Failed to open model switcher:', error);
            this.showNotification(error.message || t('notifications.modelSwitcherLoadFailed', 'Could not open model switcher'), 'error');
            this.closeModelSwitcher();
        }
    }

    closeModelSwitcher() {
        if (!this.modelSwitcher.overlay) return;
        this.modelSwitcher.overlay.classList.add('hidden');
        this.modelSwitcher.overlay.setAttribute('aria-hidden', 'true');
        this.modelSwitcher.isOpen = false;
        this.modelSwitcher.items = [];
        this.modelSwitcher.allItems = [];
        this.modelSwitcher.selectedIndex = -1;
    }

    async refreshModelSwitcherList(query = '') {
        if (!this.aiManager) return;

        const backend = this.aiManager.backend;
        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

        if (this.modelSwitcher.backendLabel) {
            this.modelSwitcher.backendLabel.textContent = this.formatBackendLabel(backend);
        }

        if (this.modelSwitcher.status) {
            const statusText = this.aiManager.isConnected
                ? t('modelSwitcher.statusConnected', `${this.formatBackendLabel(backend)} is connected. Use arrows then Enter to switch.`)
                : t('modelSwitcher.statusOffline', `${this.formatBackendLabel(backend)} might be offline. Using cached model list.`);
            this.modelSwitcher.status.textContent = statusText;
        }

        try {
            if (!Array.isArray(this.aiManager.availableModels) || this.aiManager.availableModels.length === 0) {
                await this.aiManager.loadAvailableModels();
            }

            const items = this.buildModelSwitcherItems(backend);
            this.modelSwitcher.allItems = items;
            this.applyModelSwitcherFilter(items, query);
        } catch (error) {
            console.error('Failed to load models for switcher:', error);
            const fallbackItems = this.buildModelSwitcherItems(backend, true);
            this.modelSwitcher.allItems = fallbackItems;
            this.applyModelSwitcherFilter(fallbackItems, query);
            const message = error.message || t('notifications.modelSwitcherLoadFailed', 'Could not load models. Check your AI settings.');
            if (this.modelSwitcher.status) {
                this.modelSwitcher.status.textContent = message;
            }
            this.showNotification(message, 'error');
        }
    }

    buildModelSwitcherItems(backend, fallbackOnly = false) {
        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        const items = [];
        const currentModel = backend === 'ollama' ? this.aiManager.ollamaModel : this.aiManager.openRouterModel;

        if (!fallbackOnly && Array.isArray(this.aiManager.availableModels)) {
            for (const model of this.aiManager.availableModels) {
                const id = backend === 'ollama' ? model.name : model.id;
                if (!id) continue;
                const label = backend === 'ollama' ? model.name : (model.name || model.id);

                const details = [];
                if (backend === 'ollama') {
                    if (model.details?.parameter_size) details.push(model.details.parameter_size);
                    if (model.details?.family) details.push(model.details.family);
                } else {
                    if (model.description) details.push(model.description);
                    if (model.context_length) details.push(`${model.context_length} ctx`);
                }

                items.push({
                    id,
                    label,
                    backend,
                    description: details.join(' • '),
                    isCurrent: currentModel === id
                });
            }
        }

        if (currentModel && !items.some(item => item.id === currentModel)) {
            items.unshift({
                id: currentModel,
                label: currentModel,
                backend,
                description: t('modelSwitcher.currentFallback', 'Current model (cached)'),
                isCurrent: true
            });
        }

        return items;
    }

    applyModelSwitcherFilter(items = [], query = '') {
        const normalized = (query || '').trim().toLowerCase();
        const filtered = normalized
            ? items.filter(item =>
                item.label.toLowerCase().includes(normalized) ||
                (item.description && item.description.toLowerCase().includes(normalized)))
            : items;

        this.modelSwitcher.items = filtered;

        // Prefer highlighting the current model when opening or filtering
        const currentModelId = this.modelSwitcher.activeBackend === 'ollama'
            ? this.aiManager?.ollamaModel
            : this.aiManager?.openRouterModel;
        const currentIndex = filtered.findIndex(item => item.id === currentModelId);

        if (filtered.length === 0) {
            this.modelSwitcher.selectedIndex = -1;
        } else if (currentIndex >= 0) {
            this.modelSwitcher.selectedIndex = currentIndex;
        } else {
            this.modelSwitcher.selectedIndex = 0;
        }

        this.renderModelSwitcherList();
    }

    renderModelSwitcherList() {
        const listEl = this.modelSwitcher.list;
        if (!listEl) return;

        listEl.innerHTML = '';

        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

        if (this.modelSwitcher.items.length === 0) {
            if (this.modelSwitcher.empty) {
                this.modelSwitcher.empty.classList.remove('hidden');
                this.modelSwitcher.empty.textContent = t('modelSwitcher.noResults', 'No models match your search. Check AI Settings if models are missing.');
            }
            return;
        }

        if (this.modelSwitcher.empty) {
            this.modelSwitcher.empty.classList.add('hidden');
        }

        this.modelSwitcher.items.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = `model-switcher-item ${index === this.modelSwitcher.selectedIndex ? 'active' : ''}`;
            row.dataset.index = index;
            row.innerHTML = `
                <div class="model-switcher-meta">
                    <span class="model-switcher-name">${item.label}</span>
                    <span class="model-switcher-pill">${this.formatBackendLabel(item.backend)}</span>
                    ${item.isCurrent ? `<span class="model-switcher-pill current">${t('modelSwitcher.current', 'Current')}</span>` : ''}
                </div>
                <div class="model-switcher-desc">${item.description || ''}</div>
            `;

            row.addEventListener('click', () => this.selectModelSwitcherItem(index));
            listEl.appendChild(row);
        });

        this.scrollActiveModelIntoView();
    }

    handleModelSwitcherKeys(e) {
        if (!this.modelSwitcher.isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (this.modelSwitcher.selectedIndex < this.modelSwitcher.items.length - 1) {
                    this.modelSwitcher.selectedIndex++;
                    this.renderModelSwitcherList();
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (this.modelSwitcher.selectedIndex > 0) {
                    this.modelSwitcher.selectedIndex--;
                    this.renderModelSwitcherList();
                }
                break;
            case 'Enter':
                e.preventDefault();
                this.selectModelSwitcherItem(this.modelSwitcher.selectedIndex);
                break;
            case 'Tab':
                // Keep focus inside the input while open
                e.preventDefault();
                this.modelSwitcher.input?.focus();
                break;
        }
    }

    scrollActiveModelIntoView() {
        const listEl = this.modelSwitcher.list;
        if (!listEl) return;
        const active = listEl.querySelector('.model-switcher-item.active');
        if (active && active.scrollIntoView) {
            active.scrollIntoView({ block: 'nearest' });
        }
    }

    async selectModelSwitcherItem(index) {
        if (!this.aiManager) return;
        const item = this.modelSwitcher.items[index];
        if (!item) return;

        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;

        try {
            if (item.backend === 'ollama') {
                await this.aiManager.updateOllamaModel(item.id);
            } else {
                await this.aiManager.updateOpenRouterModel(item.id);
            }

            const successMsg = t('modelSwitcher.switched', 'Switched to {model} on {backend}')
                .replace('{model}', item.label)
                .replace('{backend}', this.formatBackendLabel(item.backend));
            this.showNotification(successMsg, 'success');
            this.closeModelSwitcher();
        } catch (error) {
            console.error('Failed to switch model:', error);
            this.showNotification(error.message || t('notifications.modelSwitchFailed', 'Could not switch model'), 'error');
        }
    }

    formatBackendLabel(backend) {
        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        if (backend === 'openrouter') {
            return t('settings.ai.backendOpenRouter', 'OpenRouter');
        }
        return t('settings.ai.backendOllama', 'Ollama');
    }

    handleKeyboardShortcuts(e) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdOrCtrl = e.ctrlKey || (isMac && e.metaKey);

        // When model switcher is open, keep keyboard focus inside it
        if (this.modelSwitcher.isOpen) {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.closeModelSwitcher();
            }
            return;
        }

        // Spotlight-like quick switcher (desktop)
        if (cmdOrCtrl && e.shiftKey && (e.code === 'Space' || (e.key && e.key.toLowerCase() === 'm'))) {
            if (!this.uiManager || !this.uiManager.isMobile || !this.uiManager.isMobile()) {
                e.preventDefault();
                this.openModelSwitcher();
                return;
            }
        }

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
            { key: 'Ctrl+Shift+Space', description: t('keyboard.quickModelSwitcher', 'Open quick model switcher') },
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
        showAISettings(this);
    }

    showGeneralSettings() {
        showGeneralSettings(this);
    }

    showAdvancedSettings() {
        showAdvancedSettings(this);
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
        showShareOptions(this);
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

            // Persist sync metadata to renderer's database for future syncs
            // This ensures lastSync and remoteSyncVersion survive across sessions
            if (syncResult && syncResult.success && syncResult.syncMetadata && this.notesManager && this.notesManager.db) {
                console.log('[Sync] Persisting sync metadata to renderer database:', syncResult.syncMetadata);
                this.notesManager.db.updateSyncMetadata(syncResult.syncMetadata);
            }

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
                icon.className = 'fas fa-cloud';
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
        showSyncSettings(this);
    }

    async initializeModalSyncHandlers(modal) {
        await initializeModalSyncHandlers(this, modal);
    }

    async updateModalSyncStatus(modal) {
        await updateModalSyncStatus(this, modal);
    }

    async initializeModalEncryptionHandlers(modal) {
        await initializeModalEncryptionHandlers(this, modal);
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

            const modalTitle = t('modals.encryptedDataDetected', 'Encrypted Cloud Data');
            const safeMessage = this.escapeHtml(message);
            const passphraseLabel = t('settings.sync.passphraseLabel', 'Passphrase');
            const passphrasePlaceholder = t('placeholder.enterEncryptionPassphrase', 'Enter your passphrase');

            const content = `
                <div style="max-width: 520px;">
                    <h4 style="margin: 0 0 12px 0; color: var(--text-primary);"><i class="fas fa-lock"></i> ${modalTitle}</h4>
                    <p style="margin: 0 0 12px 0; color: var(--text-secondary); font-size: 0.95rem;">${safeMessage}</p>
                    <div style="margin-top: 12px;">
                        <label for="modal-passphrase-input" style="display: block; margin-bottom: 6px; color: var(--text-primary); font-weight: 500;">${passphraseLabel}</label>
                        <input type="password" id="modal-passphrase-input" placeholder="${passphrasePlaceholder}" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-color);">
                        <div id="modal-passphrase-error" style="margin-top: 6px; font-size: 0.85rem; color: var(--error-color);"></div>
                    </div>
                </div>
            `;

            const modal = this.createModal(modalTitle, content, [
                { text: t('modals.cancel', 'Cancel'), type: 'secondary', action: 'cancel-passphrase' },
                { text: t('modals.decrypt', 'Decrypt'), type: 'primary', action: 'confirm-passphrase' }
            ]);

            const input = modal.querySelector('#modal-passphrase-input');
            const errorText = modal.querySelector('#modal-passphrase-error');

            const onConfirm = async () => {
                const passphrase = input.value;
                if (!passphrase || passphrase.length < 8) {
                    errorText.textContent = t('encryption.passphraseMinLength', 'Passphrase must be at least 8 characters');
                    return;
                }

                // Derive salt from passphrase
                const saltResult = await ipcRenderer.invoke('derive-salt-from-passphrase', passphrase);
                if (!saltResult.success) {
                    errorText.textContent = saltResult.error || t('encryption.failedToDeriveSalt', undefined, { error: '' }).replace(': ', '');
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
                this.showNotification(t('settings.sync.passphraseSetRetrying'), 'info');
                try {
                    await this.manualSync();
                } catch (e) {
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

            const syncMetadata = (this.notesManager && this.notesManager.db) ? this.notesManager.db.getSyncMetadata() : {};
            const lastSync = syncMetadata.lastSync || null;
            const lastSeenRemoteSyncVersion = syncMetadata.remoteSyncVersion || 0;
            const result = await this.backendAPI.syncWithGoogleDrive({ localData, localChecksum, lastSync, lastSeenRemoteSyncVersion });

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
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize i18n first to ensure translations are available
    if (window.i18n) {
        await window.i18n.initialize();
        // Notify main process of initial language
        if (ipcRenderer) {
            ipcRenderer.send('menu-language-changed', window.i18n.getLanguage());
        }
    }

    window.cognotezApp = new CogNotezApp();
});

