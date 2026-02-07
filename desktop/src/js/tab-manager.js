
// Tab Manager - Extracted from app.js
// Manages the multi-tab note system

class TabManager {
    constructor(app) {
        this.app = app;
        this.openTabs = []; // Array of { noteId, title, unsaved } objects
        this.maxTabs = 10; // Maximum number of tabs allowed
        this._ignoreNextInputForUnsaved = false; // Flag to prevent marking tab unsaved during note load
        this._draggedTabIndex = null; // Index of tab being dragged for reordering
    }

    addNoteToTabs(noteId) {
        // Normalize ID to string for consistent comparison
        const normalizedId = String(noteId);

        // Check if tab already exists
        const existingTab = this.openTabs.find(tab => String(tab.noteId) === normalizedId);
        if (existingTab) {
            // Update tab title from currentNote if available
            if (this.app.currentNote && String(this.app.currentNote.id) === normalizedId) {
                existingTab.title = this.app.currentNote.title || 'Untitled';
            }
            this.setActiveTab(normalizedId);
            return;
        }

        // Check max tabs limit
        if (this.openTabs.length >= this.maxTabs) {
            // Close the oldest non-active tab that isn't unsaved
            const currentId = this.app.currentNote ? String(this.app.currentNote.id) : null;
            const tabToClose = this.openTabs.find(tab =>
                String(tab.noteId) !== currentId && !tab.unsaved
            );
            if (tabToClose) {
                this.closeTab(tabToClose.noteId, true);
            } else {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.app.showNotification(t('notifications.maxTabsReached'), 'warning');
                return;
            }
        }

        // Get title from currentNote if it matches
        let title = 'Untitled';
        if (this.app.currentNote && String(this.app.currentNote.id) === normalizedId) {
            title = this.app.currentNote.title || 'Untitled';
        } else {
            // Try to find in notes array
            const note = this.app.notes.find(n => String(n.id) === normalizedId);
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
        if (this.app.currentNote && String(this.app.currentNote.id) === noteIdStr) {
            if (this.openTabs.length > 0) {
                // Switch to the nearest tab
                const newIndex = Math.min(tabIndex, this.openTabs.length - 1);
                const newTab = this.openTabs[newIndex];
                this.switchToTab(newTab.noteId);
                return; // switchToTab will call renderTabs via displayNote
            } else {
                // No tabs left, show placeholder
                this.app.showNoNotePlaceholder();
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
            const isActive = this.app.currentNote && String(this.app.currentNote.id) === tabIdStr;

            // For active tab, use currentNote title and update stored title
            // For inactive tabs, use stored title
            let title;
            if (isActive && this.app.currentNote) {
                title = this.app.currentNote.title || 'Untitled';
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
                    <span class="note-tab-title" title="${this.app.escapeHtml(title)}">${this.app.escapeHtml(title)}</span>
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
        if (this.app.currentNote && String(this.app.currentNote.id) === noteIdStr) return;

        // Only save current note if there are unsaved changes
        if (this.app.currentNote && this.app.notesManager && this.app.notesManager.hasUnsavedChanges()) {
            await this.app.saveCurrentNote(true); // Pass true to indicate it's an auto-save (no notification)
        }

        // Try to find note in array first
        let note = this.app.notes.find(n => String(n.id) === noteIdStr);

        // If not found in array, try to fetch from database
        if (!note && this.app.notesManager && this.app.notesManager.db) {
            try {
                note = await this.app.notesManager.db.getNote(noteId);
            } catch (e) {
                console.warn('[switchToTab] Failed to get note from database:', e);
            }
        }

        if (note) {
            // Handle password-protected notes
            if (note.password_protected) {
                const cachedPassword = this.app.getCachedNotePassword(note.id);
                if (cachedPassword && note.encrypted_content && window.encryptionManager) {
                    // Try to decrypt with cached password
                    try {
                        const envelope = JSON.parse(note.encrypted_content);
                        const decrypted = window.encryptionManager.decryptData(envelope, cachedPassword);
                        note.content = decrypted.content || '';
                        this.app.displayNote(note);
                    } catch (e) {
                        console.warn('[switchToTab] Failed to decrypt with cached password:', e);
                        // Password might have changed, clear cache and prompt
                        this.app.clearCachedNotePassword(note.id);
                        await this.app.promptForNotePassword(note);
                    }
                } else {
                    // No cached password, prompt for it
                    await this.app.promptForNotePassword(note);
                }
            } else {
                this.app.displayNote(note);
            }
        } else {
            console.warn('[switchToTab] Note not found:', noteId);
            // Remove the tab if note doesn't exist
            this.closeTab(noteId, true);
        }
    }

    // Close all tabs except the current one
    closeOtherTabs() {
        const currentId = this.app.currentNote ? String(this.app.currentNote.id) : null;
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
        this.app.showNoNotePlaceholder();
        this.renderTabs();
    }

    // Initialize tabs event listeners (called during setup)
    initializeTabsEventListeners() {
        // Initial render
        this.renderTabs();
    }
}

module.exports = TabManager;
