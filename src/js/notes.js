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

    async renderNotesList(searchQuery = '') {
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

            this.currentNotes = notes;
            this.notesListElement.innerHTML = '';

            if (notes.length === 0) {
                this.renderEmptyState();
                return;
            }

            notes.forEach(note => {
                const noteElement = this.createNoteElement(note);
                this.notesListElement.appendChild(noteElement);
            });
        } catch (error) {
            console.error('Error rendering notes list:', error);
            this.renderEmptyState();
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

        element.innerHTML = `
            <div class="note-item-content">
                <div class="note-item-title">
                    ${note.password_protected ? '<i class="fas fa-lock note-lock-icon" title="Password protected"></i>' : ''}
                    ${this.escapeHtml(note.title)}
                </div>
                <div class="note-item-preview">${this.escapeHtml(note.preview)}</div>
                ${tagsHtml}
                <div class="note-item-date">${new Date(note.modified).toLocaleDateString()}</div>
            </div>
            <button class="note-pin-btn ${note.pinned ? 'pinned' : ''}" data-note-id="${note.id}" title="${note.pinned ? 'Unpin note' : 'Pin note'}"><i class="fas fa-thumbtack"></i></button>
            <button class="note-delete-btn" data-note-id="${note.id}" title="Delete note"><i class="fas fa-trash"></i></button>
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

    renderEmptyState() {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-tertiary);">
                <div style="font-size: 48px; margin-bottom: 16px;"><i class="fas fa-sticky-note"></i></div>
                <div style="font-size: 16px; margin-bottom: 8px;">No notes yet</div>
                <div style="font-size: 14px;">Click the + button to create your first note</div>
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
                // Fallback: try to find in app's notes data
                for (const note of this.app.notes || []) {
                    if (note.tags && note.tags.includes(tagId)) {
                        // For now, return the tagId itself as we don't have tag names in localStorage
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

                if (confirm(`Delete "${note.title}"? This action cannot be undone.`)) {
                    await this.db.deleteNote(noteId);

                    if (this.app.currentNote && this.app.currentNote.id === noteId) {
                        this.app.currentNote = null;
                        this.clearEditor();
                        this.app.showNoNotePlaceholder();
                    }

                    await this.renderNotesList();
                }
            } else {
                // Fallback to localStorage
                const index = this.app.notes.findIndex(note => note.id === noteId);
                if (index === -1) return;

                const note = this.app.notes[index];
                if (confirm(`Delete "${note.title}"? This action cannot be undone.`)) {
                    this.app.notes.splice(index, 1);

                    if (this.app.currentNote && this.app.currentNote.id === noteId) {
                        this.app.currentNote = null;
                        this.clearEditor();
                        this.app.showNoNotePlaceholder();
                    }

                    this.app.saveNotes();
                    this.renderNotesList();
                }
            }
        } catch (error) {
            console.error('Error deleting note:', error);
        }
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
                content: originalNote.content,
                preview: originalNote.preview || '',
                tags: originalNote.tags || [],
                category: originalNote.category
            };

            if (this.db && this.db.initialized) {
                await this.db.createNote(duplicate);
                await this.renderNotesList();
                const newNote = await this.db.getNote(duplicate.id);
                this.app.displayNote(newNote);
            } else {
                duplicate.created = new Date();
                duplicate.modified = new Date();
                this.app.notes.unshift(duplicate);
                this.app.saveNotes();
                this.renderNotesList();
                this.app.displayNote(duplicate);
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
                alert('You can only pin up to 3 notes. Please unpin another note first.');
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
            await this.renderNotesList();
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
