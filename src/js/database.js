// localStorage-based Database Manager for CogNotez
const fs = require('fs');
const path = require('path');
let electronApp = null;
try {
    const electron = require('electron');
    electronApp = electron && electron.app ? electron.app : null;
} catch (_) {
    electronApp = null;
}
class DatabaseManager {
    constructor() {
        this.initialized = false;
        this.data = {
            notes: {},
            ai_conversations: {},
            settings: {},
            tags: {},
            note_tags: {},
            encryption: {
                enabled: false,
                passphrase: null,
                saltBase64: null,
                iterations: 210000
            },
            sync: {
                enabled: false,
                provider: null, // 'google-drive', 'dropbox', etc.
                lastSync: null,
                lastSyncVersion: null,
                remoteFileId: null,
                localChecksum: null,
                remoteChecksum: null,
                syncConflicts: [],
                autoSync: false,
                syncInterval: 300000 // 5 minutes in milliseconds
            },
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

            // Load existing data from localStorage (only if available)
            this.loadFromLocalStorage();

            // Ensure data structure exists
            this.ensureDataStructure();

            this.initialized = true;
            console.log('[DEBUG] localStorage database initialized successfully');
            console.log('[DEBUG] Database loaded with', Object.keys(this.data.notes).length, 'notes');

            return true;
        } catch (error) {
            console.error('[DEBUG] Database initialization failed:', error);
            throw error;
        }
    }

    loadFromLocalStorage() {
        try {
            // Check if localStorage is available (only in renderer process)
            if (typeof localStorage !== 'undefined') {
                const storedData = localStorage.getItem('cognotez_data');
                if (storedData) {
                    const parsedData = JSON.parse(storedData);
                    this.data = { ...this.data, ...parsedData };
                    console.log('[DEBUG] Loaded data from localStorage');
                }
            } else {
                // In main process: attempt to load from persisted file
                const filePath = this.getPersistenceFilePath();
                try {
                    if (fs.existsSync(filePath)) {
                        const content = fs.readFileSync(filePath, 'utf8');
                        if (content) {
                            const parsed = JSON.parse(content);
                            this.data = { ...this.data, ...parsed };
                            console.log('[DEBUG] Loaded data from file:', filePath);
                        }
                    } else {
                        console.log('[DEBUG] No persisted data file at', filePath);
                    }
                } catch (fileError) {
                    console.warn('[DEBUG] Failed to load data file:', fileError.message);
                }
            }
        } catch (error) {
            console.warn('[DEBUG] Failed to load data from localStorage:', error);
            // Reset to default structure if corrupted
            this.ensureDataStructure();
        }
    }

    saveToLocalStorage() {
        try {
            // Check if localStorage is available (only in renderer process)
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('cognotez_data', JSON.stringify(this.data));
                console.log('[DEBUG] Data saved to localStorage');
            } else {
                // In main process: persist to file under userData
                const filePath = this.getPersistenceFilePath();
                try {
                    const dir = path.dirname(filePath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    fs.writeFileSync(filePath, JSON.stringify(this.data, null, 2), 'utf8');
                    console.log('[DEBUG] Data saved to file:', filePath);
                } catch (fileError) {
                    console.error('[DEBUG] Failed to save data file:', fileError);
                }
            }
        } catch (error) {
            console.error('[DEBUG] Failed to save data to localStorage:', error);
            throw error;
        }
    }

    getPersistenceFilePath() {
        try {
            const baseDir = electronApp && typeof electronApp.getPath === 'function'
                ? electronApp.getPath('userData')
                : (process.env.HOME || process.cwd());
            return path.join(baseDir, 'cognotez_data.json');
        } catch (_) {
            return path.join(process.cwd(), 'cognotez_data.json');
        }
    }

    ensureDataStructure() {
        if (!this.data.notes) this.data.notes = {};
        if (!this.data.ai_conversations) this.data.ai_conversations = {};
        if (!this.data.settings) this.data.settings = {};
        if (!this.data.tags) this.data.tags = {};
        if (!this.data.note_tags) this.data.note_tags = {};
        if (!this.data.encryption) {
            this.data.encryption = {
                enabled: false,
                passphrase: null,
                saltBase64: null,
                iterations: 210000
            };
        }
        if (!this.data.sync) {
            this.data.sync = {
                enabled: false,
                provider: null,
                lastSync: null,
                lastSyncVersion: null,
                remoteFileId: null,
                localChecksum: null,
                remoteChecksum: null,
                syncConflicts: [],
                autoSync: false,
                syncInterval: 300000
            };
        }
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
            pinned: noteData.pinned || false,
            password_protected: noteData.password_protected || false,
            password_hash: noteData.password_hash || null,
			encrypted_content: noteData.encrypted_content || null,
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
        console.log('[DEBUG] getAllNotes called, found', notes.length, 'non-archived notes');

        // Apply filters
        if (options.category) {
            notes = notes.filter(note => note.category === options.category);
        }

        if (options.search) {
            const searchTerm = options.search.toLowerCase();
            notes = notes.filter(note => {
                // Search in title, and only in content/preview if not password protected
                const safeContent = note.password_protected ? '' : (note.content || '');
                const safePreview = note.password_protected ? '' : (note.preview || '');
                const textMatch = note.title.toLowerCase().includes(searchTerm) ||
                                safeContent.toLowerCase().includes(searchTerm) ||
                                safePreview.toLowerCase().includes(searchTerm);

                // Search in tags
                let tagMatch = false;
                if (note.tags && note.tags.length > 0) {
                    for (const tagId of note.tags) {
                        const tag = this.data.tags[tagId];
                        if (tag && tag.name.toLowerCase().includes(searchTerm)) {
                            tagMatch = true;
                            break;
                        }
                    }
                }

                return textMatch || tagMatch;
            });
        }

        if (options.isFavorite !== undefined) {
            notes = notes.filter(note => note.is_favorite === options.isFavorite);
        }

        // Sorting - pinned notes always come first
        const sortBy = options.sortBy || 'updated_at';
        const sortOrder = options.sortOrder || 'DESC';

        notes.sort((a, b) => {
            // Pinned notes always come first
            const aPinned = a.pinned || false;
            const bPinned = b.pinned || false;

            if (aPinned && !bPinned) return -1;
            if (!aPinned && bPinned) return 1;

            // Within pinned or unpinned groups, sort by the specified criteria
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

        if (noteData.pinned !== undefined) {
            note.pinned = noteData.pinned;
        }

        if (noteData.password_protected !== undefined) {
            note.password_protected = noteData.password_protected;
        }

        if (noteData.password_hash !== undefined) {
            note.password_hash = noteData.password_hash;
        }

		if (noteData.encrypted_content !== undefined) {
			note.encrypted_content = noteData.encrypted_content;
		}

        // Update timestamps
        note.updated_at = now;
        note.modified = new Date(now);

        this.saveToLocalStorage();
        return true;
    }

    deleteNote(id) {
        if (this.data.notes[id]) {
            // Delete associated AI conversations first
            this.deleteAIConversations(id);

            // Then delete the note itself
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

    // Clear orphaned AI conversations (conversations for notes that no longer exist)
    clearOrphanedAIConversations() {
        const existingNoteIds = new Set(Object.keys(this.data.notes));
        let deletedCount = 0;

        const conversationsToDelete = Object.keys(this.data.ai_conversations).filter(id => {
            const conversation = this.data.ai_conversations[id];
            // Check if the conversation has a note_id and if that note still exists
            return conversation.note_id && !existingNoteIds.has(conversation.note_id);
        });

        conversationsToDelete.forEach(id => {
            delete this.data.ai_conversations[id];
            deletedCount++;
        });

        if (deletedCount > 0) {
            this.saveToLocalStorage();
            console.log(`[Database] Cleared ${deletedCount} orphaned AI conversations`);
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

    // Encryption operations
    setEncryptionSettings(settings) {
        console.log('[Database] Setting encryption settings:', {
            enabled: settings.enabled,
            hasPassphrase: !!settings.passphrase,
            hasSalt: !!settings.saltBase64,
            iterations: settings.iterations
        });

        // Generate new salt if enabling encryption and no salt provided
        if (settings.enabled && !settings.saltBase64 && !this.data.encryption.saltBase64) {
            if (!settings.passphrase) {
                throw new Error('Passphrase is required to derive encryption salt');
            }
            // Use global encryptionManager (available after encryption.js loads)
            if (typeof window !== 'undefined' && window.encryptionManager) {
                settings.saltBase64 = window.encryptionManager.deriveSaltFromPassphrase(settings.passphrase);
            } else {
                throw new Error('Encryption manager not available');
            }
        }

        // Validate settings before applying
        if (settings.passphrase) {
            if (typeof window !== 'undefined' && window.encryptionManager) {
                const validation = window.encryptionManager.validateSettings({
                    passphrase: settings.passphrase,
                    saltBase64: settings.saltBase64
                });

                if (!validation.isValid) {
                    throw new Error(`Invalid encryption settings: ${validation.errors.join(', ')}`);
                }
            } else {
                throw new Error('Encryption manager not available for validation');
            }
        }

        // When disabling, clear passphrase and salt to avoid stale values
        const isEnabling = settings.enabled === true;
        this.data.encryption = {
            enabled: isEnabling,
            passphrase: isEnabling ? (settings.passphrase || null) : null,
            saltBase64: isEnabling ? (settings.saltBase64 || this.data.encryption.saltBase64) : null,
            iterations: settings.iterations || this.data.encryption.iterations
        };

        console.log('[Database] Final encryption settings:', {
            enabled: this.data.encryption.enabled,
            hasPassphrase: !!this.data.encryption.passphrase,
            hasSalt: !!this.data.encryption.saltBase64,
            iterations: this.data.encryption.iterations
        });

        this.saveToLocalStorage();
        console.log('[DEBUG] Encryption settings updated:', {
            enabled: this.data.encryption.enabled,
            hasPassphrase: !!this.data.encryption.passphrase,
            hasSalt: !!this.data.encryption.saltBase64
        });
    }

    getEncryptionSettings() {
        return { ...this.data.encryption };
    }

    isEncryptionEnabled() {
        return this.data.encryption.enabled === true;
    }

    getEncryptionStatus() {
        return {
            enabled: this.data.encryption.enabled,
            hasPassphrase: !!this.data.encryption.passphrase,
            hasSalt: !!this.data.encryption.saltBase64,
            iterations: this.data.encryption.iterations
        };
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

    // Sync-related methods
    enableSync(provider = 'google-drive') {
        this.data.sync.enabled = true;
        this.data.sync.provider = provider;
        this.saveToLocalStorage();
        console.log(`[DEBUG] Sync enabled for provider: ${provider}`);
    }

    disableSync() {
        this.data.sync.enabled = false;
        this.data.sync.provider = null;
        this.saveToLocalStorage();
        console.log('[DEBUG] Sync disabled');
    }

    isSyncEnabled() {
        return this.data.sync.enabled === true;
    }

    getSyncProvider() {
        return this.data.sync.provider;
    }

    updateSyncMetadata(syncData) {
        if (syncData.lastSync) this.data.sync.lastSync = syncData.lastSync;
        if (syncData.lastSyncVersion) this.data.sync.lastSyncVersion = syncData.lastSyncVersion;
        if (syncData.remoteFileId) this.data.sync.remoteFileId = syncData.remoteFileId;
        if (syncData.localChecksum) this.data.sync.localChecksum = syncData.localChecksum;
        if (syncData.remoteChecksum) this.data.sync.remoteChecksum = syncData.remoteChecksum;
        if (typeof syncData.syncOnStartup === 'boolean') this.data.sync.syncOnStartup = syncData.syncOnStartup;
        this.saveToLocalStorage();
    }

    getSyncMetadata() {
        return { ...this.data.sync };
    }

    setAutoSync(enabled, interval = 300000) {
        this.data.sync.autoSync = enabled;
        this.data.sync.syncInterval = interval;
        this.saveToLocalStorage();
    }

    isAutoSyncEnabled() {
        return this.data.sync.autoSync === true;
    }

    getSyncInterval() {
        return this.data.sync.syncInterval || 300000;
    }

    addSyncConflict(conflict) {
        this.data.sync.syncConflicts.push({
            ...conflict,
            id: this.generateId(),
            timestamp: new Date().toISOString(),
            resolved: false
        });
        this.saveToLocalStorage();
    }

    getSyncConflicts() {
        // Ensure sync structure exists before accessing
        this.ensureDataStructure();

        // Handle case where syncConflicts might not be an array
        if (!Array.isArray(this.data.sync.syncConflicts)) {
            this.data.sync.syncConflicts = [];
        }

        return this.data.sync.syncConflicts.filter(conflict => !conflict.resolved);
    }

    resolveSyncConflict(conflictId, resolution = 'local') {
        // Ensure sync structure exists before accessing
        this.ensureDataStructure();

        // Handle case where syncConflicts might not be an array
        if (!Array.isArray(this.data.sync.syncConflicts)) {
            this.data.sync.syncConflicts = [];
        }

        const conflict = this.data.sync.syncConflicts.find(c => c.id === conflictId);
        if (conflict) {
            conflict.resolved = true;
            conflict.resolution = resolution;
            conflict.resolvedAt = new Date().toISOString();
            this.saveToLocalStorage();
            return true;
        }
        return false;
    }

    clearResolvedConflicts() {
        // Ensure sync structure exists before accessing
        this.ensureDataStructure();

        // Handle case where syncConflicts might not be an array
        if (!Array.isArray(this.data.sync.syncConflicts)) {
            this.data.sync.syncConflicts = [];
        }

        this.data.sync.syncConflicts = this.data.sync.syncConflicts.filter(conflict => !conflict.resolved);
        this.saveToLocalStorage();
    }

    // Enhanced export for sync (excludes local-only settings and secrets)
    exportDataForSync() {
        const exportData = {
            notes: this.data.notes,
            ai_conversations: this.data.ai_conversations,
            tags: this.data.tags,
            note_tags: this.data.note_tags,
            metadata: {
                ...this.data.metadata,
                exportedForSync: true,
                exportedAt: new Date().toISOString(),
                exportVersion: '1.0'
            }
        };

        // Calculate checksum based on content only (exclude sync state and timestamp metadata)
        // This ensures checksum consistency across devices when content hasn't changed
        const contentOnlyData = {
            notes: this.data.notes,
            ai_conversations: this.data.ai_conversations,
            tags: this.data.tags,
            note_tags: this.data.note_tags,
            metadata: {
                ...this.data.metadata,
                exportVersion: '1.0'
                // Exclude exportedForSync and exportedAt from checksum calculation
            }
            // Exclude sync object entirely as it contains sync-specific state
        };

        const jsonString = JSON.stringify(exportData);
        const contentJsonString = JSON.stringify(contentOnlyData);
        const checksum = this.calculateChecksum(contentJsonString);

        return {
            data: exportData,
            checksum: checksum,
            jsonString: jsonString
        };
    }

    // Import data from sync (with conflict detection)
    importDataFromSync(syncData, options = {}) {
        try {
            const importData = syncData.data || syncData;

            // Validate import data
            if (!importData.notes || typeof importData.notes !== 'object') {
                throw new Error('Invalid sync data: missing notes');
            }

            // Never import settings, encryption, or sync objects from cloud
            if (importData.settings) delete importData.settings;
            if (importData.encryption) delete importData.encryption;
            if (importData.sync) delete importData.sync;

            // Check for potential conflicts
            const conflicts = this.detectSyncConflicts(importData);

            if (conflicts.length > 0 && !options.force) {
                // Return conflicts for resolution
                return {
                    success: false,
                    conflicts: conflicts,
                    requiresResolution: true
                };
            }

            // Preserve local sync settings that should not be overridden by remote
            const localSyncSettings = { ...(this.data && this.data.sync ? this.data.sync : {}) };

            // Apply sync data
            if (options.mergeStrategy === 'replace') {
                // Complete replacement but preserve local-only data (settings, encryption)
                const preservedSettings = { ...(this.data.settings || {}) };
                const preservedEncryption = { ...(this.data.encryption || {}) };
                this.data = importData;
                // Restore preserved local-only fields
                this.data.settings = preservedSettings;
                this.data.encryption = preservedEncryption;
            } else {
                // Merge strategy (default)
                this.mergeSyncData(importData, options);
            }

            // Update sync metadata if provided
            if (syncData.syncMetadata) {
                this.updateSyncMetadata(syncData.syncMetadata);
            }

            // Restore local sync controls and metadata (do not let remote toggle your sync settings)
            // Preserve user toggles and existing sync metadata like lastSync/remoteFileId
            if (!this.data.sync) this.data.sync = {};
            const preservedToggles = {
                enabled: localSyncSettings.enabled === true,
                provider: localSyncSettings.provider || null,
                autoSync: localSyncSettings.autoSync === true,
                syncOnStartup: localSyncSettings.syncOnStartup === true,
                syncInterval: localSyncSettings.syncInterval || 300000
            };
            this.data.sync = {
                ...this.data.sync,
                ...preservedToggles
            };

            // Optionally preserve sync metadata if explicitly requested (used in main process)
            if (options && options.preserveSyncMeta) {
                this.data.sync.lastSync = localSyncSettings.lastSync || this.data.sync.lastSync || null;
                this.data.sync.lastSyncVersion = localSyncSettings.lastSyncVersion || this.data.sync.lastSyncVersion || this.data.metadata?.version || '1.0';
                this.data.sync.remoteFileId = localSyncSettings.remoteFileId || this.data.sync.remoteFileId || null;
                this.data.sync.localChecksum = localSyncSettings.localChecksum || this.data.sync.localChecksum || null;
                this.data.sync.remoteChecksum = localSyncSettings.remoteChecksum || this.data.sync.remoteChecksum || null;
            }

            this.saveToLocalStorage();

            return {
                success: true,
                conflicts: conflicts,
                mergedNotes: Object.keys(importData.notes).length
            };

        } catch (error) {
            console.error('[DEBUG] Sync import failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    detectSyncConflicts(remoteData) {
        const conflicts = [];
        const localNotes = this.data.notes;
        const remoteNotes = remoteData.notes || {};

        // Check for conflicting notes
        const allNoteIds = new Set([...Object.keys(localNotes), ...Object.keys(remoteNotes)]);

        for (const noteId of allNoteIds) {
            const localNote = localNotes[noteId];
            const remoteNote = remoteNotes[noteId];

            if (localNote && remoteNote) {
                // Both have the note - check for conflicts
                const localModified = new Date(localNote.updated_at || localNote.created_at);
                const remoteModified = new Date(remoteNote.updated_at || remoteNote.created_at);

                // If both were modified after last sync and content differs
                if (this.hasContentChanged(localNote, remoteNote)) {
                    conflicts.push({
                        type: 'note',
                        id: noteId,
                        localTitle: localNote.title,
                        remoteTitle: remoteNote.title,
                        localModified: localModified,
                        remoteModified: remoteModified,
                        canMerge: true
                    });
                }
            }
        }

        return conflicts;
    }

    mergeSyncData(remoteData, options = {}) {
        // Merge notes
        if (remoteData.notes) {
            for (const [noteId, remoteNote] of Object.entries(remoteData.notes)) {
                const localNote = this.data.notes[noteId];

                if (!localNote) {
                    // New note from remote
                    this.data.notes[noteId] = { ...remoteNote };
                } else {
                    // Existing note - merge based on timestamps
                    const localTime = new Date(localNote.updated_at || localNote.created_at);
                    const remoteTime = new Date(remoteNote.updated_at || remoteNote.created_at);

                    if (remoteTime > localTime) {
                        // Remote is newer
                        this.data.notes[noteId] = { ...remoteNote };
                    }
                    // If local is newer or same time, keep local
                }
            }
        }

        // Merge other data types (keep local versions for settings, tags, etc.)
        // This is a simplified approach - you might want more sophisticated merging
        if (remoteData.ai_conversations && options.mergeConversations) {
            Object.assign(this.data.ai_conversations, remoteData.ai_conversations);
        }

        if (remoteData.tags && options.mergeTags) {
            Object.assign(this.data.tags, remoteData.tags);
        }

        if (remoteData.note_tags && options.mergeTags) {
            Object.assign(this.data.note_tags, remoteData.note_tags);
        }
    }

    hasContentChanged(localNote, remoteNote) {
        // Compare relevant fields
        const fieldsToCompare = ['title', 'content', 'tags', 'is_favorite', 'is_archived'];

        for (const field of fieldsToCompare) {
            if (JSON.stringify(localNote[field]) !== JSON.stringify(remoteNote[field])) {
                return true;
            }
        }

        return false;
    }

    calculateChecksum(data) {
        // Simple checksum calculation
        let hash = 0;
        const str = typeof data === 'string' ? data : JSON.stringify(data);

        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        return hash.toString(16);
    }

    // Get data summary for sync status
    getSyncDataSummary() {
        const notes = Object.values(this.data.notes);
        const aiConversations = Object.values(this.data.ai_conversations);

        return {
            totalNotes: notes.length,
            totalConversations: aiConversations.length,
            lastModified: notes.length > 0 ?
                Math.max(...notes.map(n => new Date(n.updated_at || n.created_at).getTime())) :
                null,
            checksum: this.calculateChecksum(JSON.stringify(this.data))
        };
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
// Use window for renderer process, module.exports for main process
if (typeof window !== 'undefined') {
    window.DatabaseManager = DatabaseManager;
} else {
    module.exports = { DatabaseManager };
}
