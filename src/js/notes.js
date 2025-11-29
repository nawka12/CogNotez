// Notes management module
class NotesManager {
    constructor(app) {
        this.app = app;
        this.notesListElement = document.getElementById('notes-list');
        this.db = null;
        this.currentNotes = [];
    }

    async initialize() {
        try {
            this.db = new DatabaseManager();
            await this.db.initialize();
            console.log('Notes manager initialized with SQLite database');
        } catch (error) {
            console.error('Failed to initialize notes database:', error);
            // Fallback to localStorage if database fails
            console.warn('Falling back to localStorage');
        }
    }

    async renderNotesList(searchQuery = '', folderFilter = null) {
        try {
            let notes;
            if (this.db && this.db.initialized) {
                // Use database
                notes = await this.getNotesFromDatabase(searchQuery);
                console.log('[DEBUG] NotesManager.renderNotesList got', notes.length, 'notes from database');
            } else {
                // Fallback to localStorage
                notes = this.getNotesFromLocalStorage();
                if (searchQuery) {
                    notes = this.filterNotesBySearch(notes, searchQuery);
                }
                console.log('[DEBUG] NotesManager.renderNotesList got', notes.length, 'notes from localStorage fallback');
            }

            // Apply folder/tag filter
            if (folderFilter) {
                notes = this.filterNotesByFolder(notes, folderFilter);
                console.log('[DEBUG] After folder filter:', notes.length, 'notes for folder:', folderFilter);
            }

            this.currentNotes = notes;
            this.notesListElement.innerHTML = '';

            if (notes.length === 0) {
                this.renderEmptyState(folderFilter);
                return;
            }

            notes.forEach(note => {
                const noteElement = this.createNoteElement(note);
                this.notesListElement.appendChild(noteElement);
            });
            
            // Update folder counts after rendering
            this.updateFolderCounts();
        } catch (error) {
            console.error('Error rendering notes list:', error);
            this.renderEmptyState(folderFilter);
        }
    }

    // Filter notes by folder (tag or special folder)
    filterNotesByFolder(notes, folderFilter) {
        if (!folderFilter || folderFilter === 'all') {
            return notes;
        }

        if (folderFilter === 'untagged') {
            return notes.filter(note => !note.tags || note.tags.length === 0);
        }

        // Filter by specific tag ID
        return notes.filter(note => note.tags && note.tags.includes(folderFilter));
    }

    // Update folder counts in the sidebar
    async updateFolderCounts() {
        try {
            let allNotes;
            if (this.db && this.db.initialized) {
                allNotes = await this.db.getAllNotes();
            } else {
                allNotes = this.getNotesFromLocalStorage();
            }

            // Update "All Notes" count
            const allCountEl = document.getElementById('folder-count-all');
            if (allCountEl) {
                allCountEl.textContent = allNotes.length;
            }

            // Update "Untagged" count
            const untaggedCountEl = document.getElementById('folder-count-untagged');
            if (untaggedCountEl) {
                const untaggedCount = allNotes.filter(note => !note.tags || note.tags.length === 0).length;
                untaggedCountEl.textContent = untaggedCount;
            }

            // Update tag folder counts
            const tagCounts = {};
            allNotes.forEach(note => {
                if (note.tags && note.tags.length > 0) {
                    note.tags.forEach(tagId => {
                        tagCounts[tagId] = (tagCounts[tagId] || 0) + 1;
                    });
                }
            });

            // Update each tag folder count element
            Object.entries(tagCounts).forEach(([tagId, count]) => {
                const countEl = document.querySelector(`.tag-folder-item[data-tag-id="${tagId}"] .tag-folder-count`);
                if (countEl) {
                    countEl.textContent = count;
                }
            });

            return { total: allNotes.length, tagCounts };
        } catch (error) {
            console.error('Error updating folder counts:', error);
        }
    }

    createNoteElement(note) {
        const element = document.createElement('div');
        element.className = 'note-item';
        element.dataset.id = note.id;

        if (this.app.currentNote && this.app.currentNote.id === note.id) {
            element.classList.add('active');
        }

        if (note.pinned) {
            element.classList.add('pinned');
        }

        // Generate tags HTML if tags exist
        let tagsHtml = '';
        if (note.tags && note.tags.length > 0) {
            tagsHtml = '<div class="note-item-tags">';
            // Limit to first 3 tags for display
            const displayTags = note.tags.slice(0, 3);
            displayTags.forEach(tagId => {
                // Get tag name from database if available, otherwise show tag ID
                const tagName = this.getTagName(tagId);
                tagsHtml += `<span class="note-tag">${this.escapeHtml(tagName)}</span>`;
            });
            if (note.tags.length > 3) {
                tagsHtml += `<span class="note-tag more-tags">+${note.tags.length - 3} more</span>`;
            }
            tagsHtml += '</div>';
        }

        const passwordProtectedTitle = window.i18n ? window.i18n.t('notes.passwordProtected') : 'Password protected';
        const pinTitle = note.pinned ? (window.i18n ? window.i18n.t('notes.unpinNote') : 'Unpin note') : (window.i18n ? window.i18n.t('notes.pinNote') : 'Pin note');
        const deleteTitle = window.i18n ? window.i18n.t('notes.deleteNote') : 'Delete note';
        
        element.innerHTML = `
            <div class="note-item-content">
                <div class="note-item-title">
                    ${note.password_protected ? `<i class="fas fa-lock note-lock-icon" title="${passwordProtectedTitle}"></i>` : ''}
                    ${this.escapeHtml(note.title)}
                </div>
                <div class="note-item-preview">${this.escapeHtml(note.password_protected ? '' : (note.preview || ''))}</div>
                ${tagsHtml}
                <div class="note-item-date">${new Date(note.modified).toLocaleDateString()}</div>
            </div>
            <button class="note-pin-btn ${note.pinned ? 'pinned' : ''}" data-note-id="${note.id}" title="${pinTitle}"><i class="fas fa-thumbtack"></i></button>
            <button class="note-delete-btn" data-note-id="${note.id}" title="${deleteTitle}"><i class="fas fa-trash"></i></button>
        `;

        // Note selection is now handled by the app.js delegate event listener
        // This prevents duplicate event handlers and double warnings

        // Delete button functionality
        const deleteBtn = element.querySelector('.note-delete-btn');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering the note selection
            this.deleteNote(note.id);
        });

        // Pin button functionality
        const pinBtn = element.querySelector('.note-pin-btn');
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering the note selection
            this.togglePinNote(note.id);
        });

        return element;
    }

    renderEmptyState(folderFilter = null) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        
        let icon = 'fa-sticky-note';
        let title = 'No notes yet';
        let subtitle = 'Click the + button to create your first note';

        if (folderFilter === 'untagged') {
            icon = 'fa-file-alt';
            title = 'No untagged notes';
            subtitle = 'All your notes have been organized with tags';
        } else if (folderFilter && folderFilter !== 'all') {
            icon = 'fa-folder-open';
            const tagName = this.getTagName(folderFilter);
            title = `No notes in "${tagName}"`;
            subtitle = 'Add this tag to notes to see them here';
        }

        emptyState.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-tertiary);">
                <div style="font-size: 48px; margin-bottom: 16px;"><i class="fas ${icon}"></i></div>
                <div style="font-size: 16px; margin-bottom: 8px;">${title}</div>
                <div style="font-size: 14px;">${subtitle}</div>
            </div>
        `;
        this.notesListElement.appendChild(emptyState);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Helper method to get tag name from tag ID
    getTagName(tagId) {
        try {
            if (this.db && this.db.initialized) {
                const tag = this.db.data.tags[tagId];
                return tag ? tag.name : tagId;
            } else {
                // Fallback: check if we have tag data from fallback loading
                if (this.db && this.db.data && this.db.data.tags) {
                    const tag = this.db.data.tags[tagId];
                    return tag ? tag.name : tagId;
                }

                // Final fallback: try to find in app's notes data
                for (const note of this.app.notes || []) {
                    if (note.tags && note.tags.includes(tagId)) {
                        // Return the tagId itself as we don't have tag names in old localStorage format
                        return tagId;
                    }
                }
                return tagId;
            }
        } catch (error) {
            console.warn('Error getting tag name:', error);
            return tagId;
        }
    }

    // Database methods
    async getNotesFromDatabase(searchQuery = '') {
        const options = {
            sortBy: 'updated_at',
            sortOrder: 'DESC'
        };

        if (searchQuery) {
            options.search = searchQuery;
        }

        return await this.db.getAllNotes(options);
    }

    getNotesFromLocalStorage() {
        try {
            const savedNotes = localStorage.getItem('notes');
            const notes = savedNotes ? JSON.parse(savedNotes) : [];

            // Load tag data for fallback compatibility
            const tagDataString = localStorage.getItem('cognotez_fallback_tags');
            if (tagDataString) {
                try {
                    const tagData = JSON.parse(tagDataString);
                    if (this.db && !this.db.initialized) {
                        // Initialize minimal tag data structure for fallback
                        this.db.data = this.db.data || {};
                        this.db.data.tags = tagData.tags || {};
                        this.db.data.note_tags = tagData.note_tags || {};
                    }
                } catch (tagError) {
                    console.warn('Error loading tag data from localStorage:', tagError);
                }
            }

            // Synchronize with main app's notes array
            this.app.notes = notes;

            return notes;
        } catch (error) {
            console.error('Error loading notes from localStorage:', error);
            // Return empty array and reset main app notes if parsing fails
            this.app.notes = [];
            return [];
        }
    }

    filterNotesBySearch(notes, query) {
        if (!query.trim()) return notes;

        const searchTerm = query.toLowerCase();
        return notes.filter(note => {
            // Search in title, content, and preview
            const textMatch = note.title.toLowerCase().includes(searchTerm) ||
                            note.content.toLowerCase().includes(searchTerm) ||
                            note.preview.toLowerCase().includes(searchTerm);

            // Search in tags
            let tagMatch = false;
            if (note.tags && note.tags.length > 0) {
                for (const tagId of note.tags) {
                    const tagName = this.getTagName(tagId);
                    if (tagName.toLowerCase().includes(searchTerm)) {
                        tagMatch = true;
                        break;
                    }
                }
            }

            return textMatch || tagMatch;
        });
    }

    // Note operations
    async deleteNote(noteId) {
        try {
            if (this.db && this.db.initialized) {
                const note = await this.db.getNote(noteId);
                if (!note) return;

                // Use custom modal instead of native confirm() to avoid focus/rendering issues
                const shouldDelete = await this.showDeleteConfirmation(note.title);
                
                if (shouldDelete) {
                    await this.db.deleteNote(noteId);

                    // Close any open tab for this note
                    if (this.app && typeof this.app.closeTab === 'function') {
                        this.app.closeTab(noteId, true);
                    }

                    if (this.app.currentNote && this.app.currentNote.id === noteId) {
                        this.app.currentNote = null;
                        this.clearEditor();
                        this.app.showNoNotePlaceholder();
                    }

                    await this.renderNotesList('', this.app.currentFolder);
                    
                    // Update folder counts
                    await this.app.renderTagFolders();
                    
                    // Force a reflow/repaint to ensure UI is responsive
                    this.forceReflow();
                }
            } else {
                // Fallback to localStorage
                const index = this.app.notes.findIndex(note => note.id === noteId);
                if (index === -1) return;

                const note = this.app.notes[index];
                
                // Use custom modal instead of native confirm() to avoid focus/rendering issues
                const shouldDelete = await this.showDeleteConfirmation(note.title);
                
                if (shouldDelete) {
                    this.app.notes.splice(index, 1);

                    // Close any open tab for this note
                    if (this.app && typeof this.app.closeTab === 'function') {
                        this.app.closeTab(noteId, true);
                    }

                    if (this.app.currentNote && this.app.currentNote.id === noteId) {
                        this.app.currentNote = null;
                        this.clearEditor();
                        this.app.showNoNotePlaceholder();
                    }

                    this.app.saveNotes();
                    this.renderNotesList('', this.app.currentFolder);
                    
                    // Update folder counts
                    this.app.renderTagFolders();
                    
                    // Force a reflow/repaint to ensure UI is responsive
                    this.forceReflow();
                }
            }
        } catch (error) {
            console.error('Error deleting note:', error);
        }
    }

    // Show delete confirmation using custom modal (avoids native confirm() focus issues)
    showDeleteConfirmation(noteTitle) {
        return new Promise((resolve) => {
            const content = `
                <div style="padding: 10px 0;">
                    <p style="margin: 0 0 20px 0; color: var(--text-primary);">
                        Delete "<strong>${this.app.escapeHtml(noteTitle)}</strong>"?
                    </p>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">
                        This action cannot be undone.
                    </p>
                </div>
            `;

            const modal = this.app.createModal('Delete Note', content, [
                { text: 'Delete', type: 'primary', action: 'delete', callback: () => resolve(true) },
                { text: 'Cancel', type: 'secondary', action: 'cancel', callback: () => resolve(false) }
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

    // Force browser reflow to fix rendering/focus issues (fixes bug where DevTools reopen was needed)
    forceReflow() {
        // Trigger a forced reflow by reading offsetHeight
        const body = document.body;
        void body.offsetHeight;
        
        // Also ensure focus is properly managed
        setTimeout(() => {
            // Clear any stuck focus
            if (document.activeElement && document.activeElement.tagName !== 'BODY') {
                const activeEl = document.activeElement;
                // Only blur if it's not a text input we want to keep focused
                if (!activeEl.matches('input[type="text"], textarea')) {
                    activeEl.blur();
                }
            }
            
            // Re-enable event propagation by forcing a focus cycle
            document.body.focus();
            document.body.blur();
        }, 50);
    }

    async duplicateNote(noteId) {
        try {
            let originalNote;
            if (this.db && this.db.initialized) {
                originalNote = await this.db.getNote(noteId);
            } else {
                originalNote = this.app.notes.find(note => note.id === noteId);
            }

            if (!originalNote) return;

            const duplicate = {
                id: Date.now().toString(),
                title: `${originalNote.title} (Copy)`,
                content: originalNote.password_protected ? '' : originalNote.content,
                preview: originalNote.password_protected ? '' : (originalNote.preview || ''),
                tags: originalNote.tags || [],
                category: originalNote.category,
                password_protected: originalNote.password_protected || false,
                password_hash: originalNote.password_hash || null,
                encrypted_content: originalNote.encrypted_content || null
            };

            if (this.db && this.db.initialized) {
                await this.db.createNote(duplicate);
                await this.renderNotesList('', this.app.currentFolder);
                const newNote = await this.db.getNote(duplicate.id);
                this.app.displayNote(newNote);
                await this.app.renderTagFolders();
            } else {
                duplicate.created = new Date();
                duplicate.modified = new Date();
                this.app.notes.unshift(duplicate);
                this.app.saveNotes();
                this.renderNotesList('', this.app.currentFolder);
                this.app.displayNote(duplicate);
                this.app.renderTagFolders();
            }
        } catch (error) {
            console.error('Error duplicating note:', error);
        }
    }

    async togglePinNote(noteId) {
        try {
            let note;
            let allNotes;

            if (this.db && this.db.initialized) {
                note = await this.db.getNote(noteId);
                allNotes = await this.db.getAllNotes();
            } else {
                note = this.app.notes.find(n => n.id === noteId);
                allNotes = this.app.notes;
            }

            if (!note) return;

            const currentlyPinned = note.pinned || false;
            const pinnedCount = allNotes.filter(n => n.pinned).length;

            if (!currentlyPinned && pinnedCount >= 3) {
                // Cannot pin more than 3 notes
                await this.app.showAlert('Pin Limit Reached', 'You can only pin up to 3 notes. Please unpin another note first.');
                return;
            }

            // Toggle the pinned status
            const newPinnedStatus = !currentlyPinned;

            if (this.db && this.db.initialized) {
                await this.db.updateNote(noteId, { pinned: newPinnedStatus });
            } else {
                note.pinned = newPinnedStatus;
                this.app.saveNotes();
            }

            // Re-render the notes list to reflect the change
            await this.renderNotesList('', this.app.currentFolder);
        } catch (error) {
            console.error('Error toggling pin status:', error);
        }
    }

    clearEditor() {
        document.getElementById('note-title').value = '';
        document.getElementById('note-editor').value = '';
        document.getElementById('note-date').textContent = '';
    }

    // Search and filter
    filterNotes(query) {
        if (!query.trim()) {
            return this.app.notes;
        }

        const searchTerm = query.toLowerCase();
        return this.app.notes.filter(note =>
            note.title.toLowerCase().includes(searchTerm) ||
            note.content.toLowerCase().includes(searchTerm) ||
            note.preview.toLowerCase().includes(searchTerm)
        );
    }

    sortNotes(criteria = 'modified') {
        const sortFunction = (a, b) => {
            // Pinned notes always come first
            const aPinned = a.pinned || false;
            const bPinned = b.pinned || false;

            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;

            // Within pinned or unpinned groups, sort by the specified criteria
            switch (criteria) {
                case 'modified':
                    return new Date(b.modified) - new Date(a.modified);
                case 'created':
                    return new Date(b.created) - new Date(a.created);
                case 'title':
                    return a.title.localeCompare(b.title);
                default:
                    return new Date(b.modified) - new Date(a.modified);
            }
        };

        this.app.notes.sort(sortFunction);
        this.renderNotesList();
    }

    // Import/Export helpers
    importNote(content, title = null) {
        const noteTitle = title || this.extractTitleFromContent(content);
        const note = {
            id: Date.now().toString(),
            title: noteTitle,
            content: content,
            created: new Date(),
            modified: new Date(),
            preview: this.app.generatePreview(content)
        };

        this.app.notes.unshift(note);
        this.app.saveNotes();
        this.renderNotesList();
        this.app.displayNote(note);
        return note;
    }

    extractTitleFromContent(content) {
        const lines = content.split('\n').filter(line => line.trim());
        return lines.length > 0 ? lines[0].substring(0, 50) : 'Imported Note';
    }

    // Auto-save functionality
    startAutoSave() {
        // Time-based autosave every 15 seconds
        this.autoSaveInterval = setInterval(() => {
            if (this.app.currentNote && this.hasUnsavedChanges()) {
                console.log('[DEBUG] Time-based autosave triggered');
                this.app.saveCurrentNote(true); // Pass true to indicate auto-save
            }
        }, 15000); // Auto-save every 15 seconds for better responsiveness

        // Autosave when window loses focus
        this.blurTimeout = null;
        window.addEventListener('blur', () => {
            if (this.app.currentNote && this.hasUnsavedChanges()) {
                // Delay autosave slightly to avoid conflicts
                this.blurTimeout = setTimeout(() => {
                    console.log('[DEBUG] Window blur autosave triggered');
                    this.app.saveCurrentNote(true); // Pass true to indicate auto-save
                }, 500);
            }
        });

        // Clear blur timeout when window regains focus
        window.addEventListener('focus', () => {
            if (this.blurTimeout) {
                clearTimeout(this.blurTimeout);
                this.blurTimeout = null;
            }
        });

        // Autosave after user stops typing for 3 seconds
        this.typingTimeout = null;
        const handleTyping = () => {
            if (this.typingTimeout) {
                clearTimeout(this.typingTimeout);
            }
            this.typingTimeout = setTimeout(() => {
                if (this.app.currentNote && this.hasUnsavedChanges()) {
                    console.log('[DEBUG] Typing pause autosave triggered');
                    this.app.saveCurrentNote(true); // Pass true to indicate auto-save
                }
            }, 500); // Save after 0.5 seconds of no typing
        };

        // Immediate autosave for title changes
        const handleTitleChange = () => {
            if (this.app.currentNote && this.hasUnsavedChanges()) {
                console.log('[DEBUG] Title change autosave triggered');
                this.app.saveCurrentNote(true); // Pass true to indicate auto-save
            }
        };

        // Attach typing listeners to title and content inputs
        document.getElementById('note-title').addEventListener('input', handleTitleChange);
        document.getElementById('note-editor').addEventListener('input', handleTyping);
    }

    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
        if (this.blurTimeout) {
            clearTimeout(this.blurTimeout);
            this.blurTimeout = null;
        }
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = null;
        }
    }

    hasUnsavedChanges() {
        if (!this.app.currentNote) return false;

        const currentTitle = document.getElementById('note-title').value;
        const currentContent = document.getElementById('note-editor').value;

        return currentTitle !== this.app.currentNote.title ||
               currentContent !== this.app.currentNote.content;
    }

    // Context menu for notes
    showNoteContextMenu(noteId, x, y) {
        const existingMenu = document.querySelector('.note-context-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Get the note to check if it's pinned
        let note;
        if (this.db && this.db.initialized) {
            note = this.db.getNote(noteId);
        } else {
            note = this.app.notes.find(n => n.id === noteId);
        }

        const isPinned = note ? (note.pinned || false) : false;
        const pinText = isPinned ? 'Unpin' : 'Pin';

        const isPasswordProtected = note ? (note.password_protected || false) : false;
        const passwordText = isPasswordProtected ? 'Remove Password' : 'Add Password';

        const menu = document.createElement('div');
        menu.className = 'note-context-menu context-menu';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        menu.innerHTML = `
            <div class="context-menu-item" data-action="open">Open</div>
            <div class="context-menu-item" data-action="password">${passwordText}</div>
            <div class="context-menu-item" data-action="pin">${pinText}</div>
            <div class="context-menu-item" data-action="duplicate">Duplicate</div>
            <div class="context-menu-item" data-action="export">Export</div>
            <div class="context-menu-item" data-action="delete" style="color: #dc3545;">Delete</div>
        `;

        document.body.appendChild(menu);

        // Handle menu item clicks
        menu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action) {
                this.handleNoteContextAction(action, noteId);
                menu.remove();
            }
        });

        // Remove menu when clicking elsewhere
        document.addEventListener('click', function removeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', removeMenu);
            }
        });
    }

    handleNoteContextAction(action, noteId) {
        switch (action) {
            case 'open':
                this.app.switchToNoteWithWarning(noteId);
                break;
            case 'password':
                this.handlePasswordProtection(noteId);
                break;
            case 'pin':
                this.togglePinNote(noteId);
                break;
            case 'duplicate':
                this.duplicateNote(noteId);
                break;
            case 'export':
                const exportNote = this.app.notes.find(n => n.id === noteId);
                if (exportNote) {
                    this.app.currentNote = exportNote;
                    this.app.exportNote();
                }
                break;
            case 'delete':
                this.deleteNote(noteId);
                break;
        }
    }

    async handlePasswordProtection(noteId) {
        let note;
        if (this.db && this.db.initialized) {
            note = await this.db.getNote(noteId);
        } else {
            note = this.app.notes.find(n => n.id === noteId);
        }

        if (!note) return;

        // Store the current note temporarily
        const currentNote = this.app.currentNote;

        // Switch to the note to enable password management
        this.app.currentNote = note;
        this.app.displayNote(note);

        // Show password protection dialog
        this.app.showPasswordProtectionDialog();

        // Note: The dialog will handle updating the UI and refreshing the notes list
    }
}

// Export for use in main app
window.NotesManager = NotesManager;
