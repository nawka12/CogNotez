/**
 * Event Listeners Module
 * Handles DOM event listener setup for CogNotez
 */

const { ipcRenderer } = require('electron');

/**
 * Setup all event listeners for the application
 * @param {Object} app - The CogNotezApp instance
 */
function setupEventListeners(app) {
    // Register cleanup on window unload
    window.addEventListener('beforeunload', () => app.cleanup());

    // Header buttons
    document.getElementById('new-note-btn').addEventListener('click', () => app.createNewNote());
    document.getElementById('ai-toggle-btn').addEventListener('click', () => app.toggleAIPanel());

    // Header overflow menu toggle
    document.getElementById('header-overflow-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        app.toggleHeaderOverflowMenu();
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
    document.getElementById('theme-toggle').addEventListener('click', () => app.toggleTheme());
    document.getElementById('mobile-search-btn').addEventListener('click', () => app.toggleMobileSearch());
    document.getElementById('advanced-search-btn').addEventListener('click', () => {
        if (app.advancedSearchManager) {
            app.advancedSearchManager.togglePanel();
        }
    });
    document.getElementById('templates-btn').addEventListener('click', () => app.showTemplateChooser());

    // Mobile-specific overflow menu items
    const mobileThemeToggle = document.getElementById('mobile-theme-toggle');
    if (mobileThemeToggle) {
        mobileThemeToggle.addEventListener('click', () => app.toggleTheme());
    }
    const mobileAIToggle = document.getElementById('mobile-ai-toggle');
    if (mobileAIToggle) {
        mobileAIToggle.addEventListener('click', () => app.toggleAIPanel());
    }
    const syncSettingsBtn = document.getElementById('sync-settings-btn');
    if (syncSettingsBtn) {
        syncSettingsBtn.addEventListener('click', () => app.showSyncSettings());
    }

    // Simplified sync button
    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => app.manualSync());
    }

    // Initialize tabs system
    app.initializeTabsEventListeners();

    // Initialize folder navigation
    app.setupFolderNavigation();

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
        app.showNotification(t('notifications.connectionRestored'), 'success');
        app.updateSyncUI();
        // Clear network cache when coming back online
        if (window.networkUtils) {
            window.networkUtils.clearCache();
        }
    });

    window.addEventListener('offline', () => {
        console.log('[Network] Device is now OFFLINE');
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        app.showNotification(t('notifications.noInternet'), 'warning');
        app.updateSyncUI();
    });

    // Search input
    const searchInputEl = document.getElementById('search-input');
    const searchClearBtn = document.getElementById('search-clear-btn');

    if (searchInputEl) {
        searchInputEl.addEventListener('input', (e) => {
            app.searchNotes(e.target.value);
        });
        searchInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') app.searchNotes();
        });
    }

    if (searchClearBtn && searchInputEl) {
        searchClearBtn.addEventListener('click', () => {
            searchInputEl.value = '';
            app.searchNotes('');
            searchInputEl.focus();
        });
    }

    // Note list click handler (delegate to notes manager)
    document.getElementById('notes-list').addEventListener('click', async (e) => {
        const noteItem = e.target.closest('.note-item');
        if (noteItem) {
            const noteId = noteItem.dataset.id;
            await app.switchToNoteWithWarning(noteId);
        } else {
            // Clicked on empty space in notes list - clear selection
            // Check for unsaved changes before clearing
            if (app.currentNote && app.notesManager && app.notesManager.hasUnsavedChanges()) {
                const shouldClear = await app.showUnsavedChangesWarning();
                if (shouldClear) {
                    app.showNoNotePlaceholder();
                }
            } else {
                app.showNoNotePlaceholder();
            }
        }
    });

    // Main content area click handler - clear note selection when clicking on empty editor area
    document.querySelector('.main-content-area').addEventListener('click', async (e) => {
        // Only clear if clicking on the main content area itself, not on child elements
        if (e.target === e.currentTarget && app.currentNote) {
            // Check for unsaved changes before clearing
            if (app.notesManager && app.notesManager.hasUnsavedChanges()) {
                const shouldClear = await app.showUnsavedChangesWarning();
                if (shouldClear) {
                    app.showNoNotePlaceholder();
                }
            } else {
                app.showNoNotePlaceholder();
            }
        }
    });

    // Editor actions
    document.getElementById('undo-btn').addEventListener('click', () => app.undo());
    document.getElementById('redo-btn').addEventListener('click', () => app.redo());
    document.getElementById('find-btn').addEventListener('click', () => app.showFindDialog());
    document.getElementById('replace-btn').addEventListener('click', () => app.showReplaceDialog());
    document.getElementById('preview-toggle-btn').addEventListener('click', () => app.togglePreview());
    document.getElementById('save-btn').addEventListener('click', () => app.saveCurrentNote());

    // Editor overflow menu toggle
    document.getElementById('editor-overflow-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        app.toggleEditorOverflowMenu();
    });

    // Close overflow menu when clicking any menu item
    document.querySelectorAll('.overflow-menu-item').forEach(item => {
        item.addEventListener('click', () => {
            const menu = document.getElementById('editor-overflow-menu');
            menu.classList.add('hidden');
        });
    });
    document.getElementById('ai-summary-btn').addEventListener('click', () => app.summarizeNote());
    document.getElementById('generate-tags-btn').addEventListener('click', () => app.generateTags());
    document.getElementById('manage-tags-btn').addEventListener('click', () => app.showTagManager());
    document.getElementById('export-btn').addEventListener('click', () => app.exportNote());
    document.getElementById('share-btn').addEventListener('click', () => app.showShareOptions());
    document.getElementById('password-lock-btn').addEventListener('click', () => app.showPasswordProtectionDialog());

    // Placeholder actions
    document.getElementById('create-first-note-btn').addEventListener('click', () => app.createNewNote());

    // Editor input for real-time preview updates and unsaved tracking
    document.getElementById('note-editor').addEventListener('input', () => {
        const preview = document.getElementById('markdown-preview');
        if (!preview.classList.contains('hidden')) {
            app.renderMarkdownPreview();
        }
        // Mark tab as unsaved when content changes (skip if loading note)
        if (app.currentNote && !app._ignoreNextInputForUnsaved) {
            app.markTabUnsaved(app.currentNote.id, true);
        }
        app._ignoreNextInputForUnsaved = false;
    });

    // Also track title changes for unsaved indicator and update tab title
    document.getElementById('note-title').addEventListener('input', (e) => {
        if (app.currentNote && !app._ignoreNextInputForUnsaved) {
            app.markTabUnsaved(app.currentNote.id, true);
            // Update tab title live
            app.updateTabTitle(app.currentNote.id, e.target.value || 'Untitled');
        }
    });

    // AI Panel
    document.getElementById('ai-panel-close').addEventListener('click', () => {
        console.log('[DEBUG] AI panel close button clicked');
        app.toggleAIPanel();
    });
    document.getElementById('ai-reset-btn').addEventListener('click', () => {
        console.log('[DEBUG] AI panel reset button clicked');
        app.resetAIConversation();
    });
    document.getElementById('ai-send-btn').addEventListener('click', () => app.sendAIMessage());
    const aiInput = document.getElementById('ai-input');
    aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            app.sendAIMessage();
        }
    });
    aiInput.addEventListener('input', () => {
        app.autoResizeTextarea(aiInput);
    });

    // Global context menu closer
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('context-menu');
        if (menu && !menu.contains(e.target)) {
            app.hideContextMenu();
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
        app.selectionStart = start;
        app.selectionEnd = end;
        app.selectedText = selectedText;
        app.contextElement = editor;

        app.showContextMenu(e, selectedText);
    });

    // Preview mode context menu
    const preview = document.getElementById('markdown-preview');
    preview.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const selection = window.getSelection();
        const selectedText = selection.toString();

        app.selectedText = selectedText;
        app.contextElement = preview;

        // Check if right-clicked on media element
        const target = e.target.closest('img, video, audio');
        if (target) {
            app.contextMediaElement = target;
        } else {
            app.contextMediaElement = null;
        }

        app.showContextMenu(e, selectedText);
    });
    editor.addEventListener('input', () => {
        app.updateNotePreview();
        // Track history for undo/redo functionality with debouncing
        if (!app.ignoreHistoryUpdate) {
            app.debouncedPushHistory(editor);
        }
        // Clear stored selection when user types
        app.selectionStart = -1;
        app.selectionEnd = -1;
    });

    // Clear stored selection when editor loses focus or when clicking elsewhere
    // But preserve selection during AI operations
    editor.addEventListener('blur', () => {
        if (!app.preserveSelection) {
            app.selectionStart = -1;
            app.selectionEnd = -1;
        }
    });

    // Modal dialogs
    document.getElementById('ai-dialog-close').addEventListener('click', () => app.hideAIDialog());
    document.getElementById('ai-dialog-cancel').addEventListener('click', () => app.hideAIDialog());
    document.getElementById('ai-dialog-submit').addEventListener('click', () => app.processAIDialog());

    // Note title
    document.getElementById('note-title').addEventListener('input', () => app.updateNoteTitle());

    // Quick model switcher (desktop)
    app.setupModelSwitcher();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => app.handleKeyboardShortcuts(e));
}

module.exports = { setupEventListeners };
