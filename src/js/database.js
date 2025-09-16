// localStorage-based Database Manager for CogNotez
class DatabaseManager {
    constructor() {
        this.initialized = false;
        this.data = {
            notes: {},
            ai_conversations: {},
            settings: {},
            tags: {},
            note_tags: {},
            metadata: {
                version: '1.0',
                lastBackup: null,
                created: new Date().toISOString()
            }
        };
    }

    async initialize() {
        try {
            console.log('[DEBUG] Initializing localStorage-based database...');

            // Load existing data from localStorage
            this.loadFromLocalStorage();

            // Ensure data structure exists
            this.ensureDataStructure();

            this.initialized = true;
            console.log('[DEBUG] localStorage database initialized successfully');

            return true;
        } catch (error) {
            console.error('[DEBUG] Database initialization failed:', error);
            throw error;
        }
    }

    loadFromLocalStorage() {
        try {
            const storedData = localStorage.getItem('cognotez_data');
            if (storedData) {
                const parsedData = JSON.parse(storedData);
                this.data = { ...this.data, ...parsedData };
                console.log('[DEBUG] Loaded data from localStorage');
            }
        } catch (error) {
            console.warn('[DEBUG] Failed to load data from localStorage:', error);
            // Reset to default structure if corrupted
            this.ensureDataStructure();
        }
    }

    saveToLocalStorage() {
        try {
            localStorage.setItem('cognotez_data', JSON.stringify(this.data));
            console.log('[DEBUG] Data saved to localStorage');
        } catch (error) {
            console.error('[DEBUG] Failed to save data to localStorage:', error);
            throw error;
        }
    }

    ensureDataStructure() {
        if (!this.data.notes) this.data.notes = {};
        if (!this.data.ai_conversations) this.data.ai_conversations = {};
        if (!this.data.settings) this.data.settings = {};
        if (!this.data.tags) this.data.tags = {};
        if (!this.data.note_tags) this.data.note_tags = {};
        if (!this.data.metadata) {
            this.data.metadata = {
                version: '1.0',
                lastBackup: null,
                created: new Date().toISOString()
            };
        }
    }

    // Note operations
    createNote(noteData) {
        const id = noteData.id || this.generateId();
        const now = new Date().toISOString();

        const wordCount = this.calculateWordCount(noteData.content || '');
        const charCount = (noteData.content || '').length;

        const note = {
            id: id,
            title: noteData.title || 'Untitled Note',
            content: noteData.content || '',
            preview: noteData.preview || '',
            tags: noteData.tags || [],
            category: noteData.category || null,
            is_favorite: noteData.is_favorite || false,
            is_archived: noteData.is_archived || false,
            word_count: wordCount,
            char_count: charCount,
            created_at: now,
            updated_at: now,
            created: new Date(now),
            modified: new Date(now)
        };

        this.data.notes[id] = note;
        this.saveToLocalStorage();

        return id;
    }

    getNote(id) {
        const note = this.data.notes[id];
        if (note && !note.is_archived) {
            // Ensure proper date objects
            if (typeof note.created === 'string') {
                note.created = new Date(note.created_at || note.created);
                note.modified = new Date(note.updated_at || note.modified);
            }
            return note;
        }
        return null;
    }

    getAllNotes(options = {}) {
        let notes = Object.values(this.data.notes).filter(note => !note.is_archived);

        // Apply filters
        if (options.category) {
            notes = notes.filter(note => note.category === options.category);
        }

        if (options.search) {
            const searchTerm = options.search.toLowerCase();
            notes = notes.filter(note =>
                note.title.toLowerCase().includes(searchTerm) ||
                note.content.toLowerCase().includes(searchTerm) ||
                (note.preview && note.preview.toLowerCase().includes(searchTerm))
            );
        }

        if (options.isFavorite !== undefined) {
            notes = notes.filter(note => note.is_favorite === options.isFavorite);
        }

        // Sorting
        const sortBy = options.sortBy || 'updated_at';
        const sortOrder = options.sortOrder || 'DESC';

        notes.sort((a, b) => {
            let aVal = a[sortBy];
            let bVal = b[sortBy];

            if (sortBy === 'created_at' || sortBy === 'updated_at') {
                aVal = new Date(aVal).getTime();
                bVal = new Date(bVal).getTime();
            }

            if (sortOrder === 'DESC') {
                return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
            } else {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            }
        });

        // Pagination
        if (options.offset) {
            notes = notes.slice(options.offset);
        }

        if (options.limit) {
            notes = notes.slice(0, options.limit);
        }

        // Ensure proper date objects
        return notes.map(note => ({
            ...note,
            created: typeof note.created === 'string' ? new Date(note.created_at || note.created) : note.created,
            modified: typeof note.modified === 'string' ? new Date(note.updated_at || note.modified) : note.modified
        }));
    }

    updateNote(id, noteData) {
        const note = this.data.notes[id];
        if (!note) return false;

        const now = new Date().toISOString();

        if (noteData.title !== undefined) {
            note.title = noteData.title;
        }

        if (noteData.content !== undefined) {
            note.content = noteData.content;
            // Update word and character counts
            note.word_count = this.calculateWordCount(noteData.content || '');
            note.char_count = (noteData.content || '').length;
        }

        if (noteData.preview !== undefined) {
            note.preview = noteData.preview;
        }

        if (noteData.tags !== undefined) {
            note.tags = noteData.tags;
        }

        if (noteData.category !== undefined) {
            note.category = noteData.category;
        }

        if (noteData.isFavorite !== undefined) {
            note.is_favorite = noteData.isFavorite;
        }

        if (noteData.is_archived !== undefined) {
            note.is_archived = noteData.is_archived;
        }

        // Update timestamps
        note.updated_at = now;
        note.modified = new Date(now);

        this.saveToLocalStorage();
        return true;
    }

    deleteNote(id) {
        if (this.data.notes[id]) {
            delete this.data.notes[id];
            this.saveToLocalStorage();
            return true;
        }
        return false;
    }

    archiveNote(id, archive = true) {
        const note = this.data.notes[id];
        if (note) {
            note.is_archived = archive;
            note.updated_at = new Date().toISOString();
            this.saveToLocalStorage();
            return true;
        }
        return false;
    }

    // AI conversation operations
    saveAIConversation(conversationData) {
        const id = conversationData.id || this.generateId();
        const now = new Date().toISOString();

        const conversation = {
            id: id,
            note_id: conversationData.noteId || null,
            user_message: conversationData.userMessage,
            ai_response: conversationData.aiResponse,
            context: conversationData.context || null,
            action_type: conversationData.actionType,
            created_at: now,
            created: new Date(now)
        };

        this.data.ai_conversations[id] = conversation;
        this.saveToLocalStorage();

        return id;
    }

    getAIConversations(noteId = null, limit = 50) {
        let conversations = Object.values(this.data.ai_conversations);

        if (noteId) {
            conversations = conversations.filter(conv => conv.note_id === noteId);
        }

        // Sort by created date (most recent first)
        conversations.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // Apply limit
        if (limit) {
            conversations = conversations.slice(0, limit);
        }

        // Ensure proper date objects
        return conversations.map(conv => ({
            ...conv,
            created: typeof conv.created === 'string' ? new Date(conv.created_at) : conv.created
        }));
    }

    deleteAIConversations(noteId) {
        if (!noteId) return false;

        let deletedCount = 0;
        const conversationsToDelete = Object.keys(this.data.ai_conversations).filter(id => {
            return this.data.ai_conversations[id].note_id === noteId;
        });

        conversationsToDelete.forEach(id => {
            delete this.data.ai_conversations[id];
            deletedCount++;
        });

        if (deletedCount > 0) {
            this.saveToLocalStorage();
        }

        return deletedCount;
    }

    // Settings operations
    setSetting(key, value) {
        this.data.settings[key] = {
            value: value,
            updated_at: new Date().toISOString()
        };
        this.saveToLocalStorage();
    }

    getSetting(key, defaultValue = null) {
        const setting = this.data.settings[key];
        if (setting) {
            return setting.value;
        }
        return defaultValue;
    }

    // Tag operations
    createTag(tagData) {
        const id = tagData.id || this.generateId();

        const tag = {
            id: id,
            name: tagData.name,
            color: tagData.color || '#BDABE3',
            created_at: new Date().toISOString()
        };

        this.data.tags[id] = tag;
        this.saveToLocalStorage();

        return id;
    }

    getAllTags() {
        const tags = Object.values(this.data.tags);
        return tags.sort((a, b) => a.name.localeCompare(b.name));
    }

    addTagToNote(noteId, tagId) {
        const noteTagKey = `${noteId}_${tagId}`;
        this.data.note_tags[noteTagKey] = {
            note_id: noteId,
            tag_id: tagId
        };
        this.saveToLocalStorage();
    }

    removeTagFromNote(noteId, tagId) {
        const noteTagKey = `${noteId}_${tagId}`;
        if (this.data.note_tags[noteTagKey]) {
            delete this.data.note_tags[noteTagKey];
            this.saveToLocalStorage();
        }
    }

    // Statistics
    getStats() {
        const notes = Object.values(this.data.notes);
        const noteStats = {
            total_notes: notes.length,
            favorite_notes: notes.filter(n => n.is_favorite).length,
            archived_notes: notes.filter(n => n.is_archived).length,
            total_words: notes.reduce((sum, n) => sum + (n.word_count || 0), 0),
            total_chars: notes.reduce((sum, n) => sum + (n.char_count || 0), 0)
        };

        const conversations = Object.values(this.data.ai_conversations);
        const uniqueNoteIds = new Set(conversations.map(c => c.note_id).filter(id => id));
        const aiStats = {
            total_conversations: conversations.length,
            notes_with_ai: uniqueNoteIds.size
        };

        return {
            notes: noteStats,
            ai: aiStats
        };
    }

    // Utility methods
    calculateWordCount(text) {
        if (!text) return 0;
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Backup and restore (localStorage-based)
    async backup(backupPath) {
        try {
            // For localStorage, we export the data as JSON
            const backupData = {
                ...this.data,
                metadata: {
                    ...this.data.metadata,
                    lastBackup: new Date().toISOString(),
                    backupVersion: '1.0'
                }
            };

            const jsonData = JSON.stringify(backupData, null, 2);
            await fs.promises.writeFile(backupPath, jsonData, 'utf8');

            console.log('[DEBUG] Backup created successfully at:', backupPath);
            return true;
        } catch (error) {
            console.error('[DEBUG] Backup failed:', error);
            return false;
        }
    }

    async restore(backupPath) {
        try {
            const backupContent = await fs.promises.readFile(backupPath, 'utf8');
            const backupData = JSON.parse(backupContent);

            // Validate backup data structure
            if (!backupData.notes || typeof backupData.notes !== 'object') {
                throw new Error('Invalid backup file: missing or invalid notes data');
            }

            // Restore the data
            this.data = backupData;
            this.saveToLocalStorage();

            console.log('[DEBUG] Backup restored successfully from:', backupPath);
            return true;
        } catch (error) {
            console.error('[DEBUG] Restore failed:', error);
            return false;
        }
    }

    // Export data as JSON string (for localStorage-based backup)
    exportDataAsJSON() {
        const exportData = {
            ...this.data,
            metadata: {
                ...this.data.metadata,
                exportedAt: new Date().toISOString(),
                exportVersion: '1.0'
            }
        };
        return JSON.stringify(exportData, null, 2);
    }

    // Import data from JSON string
    importDataFromJSON(jsonString) {
        try {
            const importData = JSON.parse(jsonString);

            // Validate import data
            if (!importData.notes || typeof importData.notes !== 'object') {
                throw new Error('Invalid import data: missing notes');
            }

            this.data = importData;
            this.saveToLocalStorage();

            return true;
        } catch (error) {
            console.error('[DEBUG] Import failed:', error);
            return false;
        }
    }

    // Cleanup
    close() {
        // For localStorage, we don't need to close connections
        // Just save any pending changes
        this.saveToLocalStorage();
        this.initialized = false;
    }
}

// Export for use in main app
window.DatabaseManager = DatabaseManager;
