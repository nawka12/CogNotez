// Google Drive Sync Manager for CogNotez
// Handles synchronization of notes data with Google Drive

const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class GoogleDriveSyncManager {
    constructor(authManager) {
        this.authManager = authManager;
        this.drive = null;
        this.appFolderId = null;
        this.syncMetadata = {
            lastSync: null,
            lastSyncVersion: null,
            remoteFileId: null,
            localChecksum: null,
            remoteChecksum: null
        };

        this.syncInProgress = false;
        this.appFolderName = 'CogNotez_Backup';
        this.backupFileName = 'cognotez_sync_backup.json';
        this.initialized = false;

        this.initialize();
    }

    async initialize() {
        try {
            if (this.authManager && this.authManager.oauth2Client) {
                this.drive = google.drive({ version: 'v3', auth: this.authManager.oauth2Client });
                await this.ensureAppFolder();
                this.initialized = true;
                console.log('[GoogleDriveSync] Initialized successfully');
            } else {
                console.warn('[GoogleDriveSync] Auth manager not available');
            }
        } catch (error) {
            console.error('[GoogleDriveSync] Initialization failed:', error);
            this.initialized = false;
        }
    }

    async ensureInitialized() {
        if (!this.initialized) {
            console.log('[GoogleDriveSync] Waiting for initialization...');
            // Wait for initialization to complete
            let attempts = 0;
            while (!this.initialized && attempts < 30) { // Wait up to 3 seconds
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }

            if (!this.initialized) {
                throw new Error('Google Drive sync manager failed to initialize');
            }
        }
        return this.initialized;
    }

    async ensureAppFolder() {
        try {
            if (!this.drive) {
                throw new Error('Drive API not initialized');
            }

            // Check if app folder already exists
            const query = `name='${this.appFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            const response = await this.drive.files.list({
                q: query,
                fields: 'files(id,name)',
                spaces: 'drive'
            });

            if (response.data.files.length > 0) {
                this.appFolderId = response.data.files[0].id;
                console.log('[GoogleDriveSync] Found existing app folder:', this.appFolderId);
            } else {
                // Create app folder
                const folderMetadata = {
                    name: this.appFolderName,
                    mimeType: 'application/vnd.google-apps.folder'
                };

                const createResponse = await this.drive.files.create({
                    resource: folderMetadata,
                    fields: 'id'
                });

                this.appFolderId = createResponse.data.id;
                console.log('[GoogleDriveSync] Created new app folder:', this.appFolderId);
            }

            return true;
        } catch (error) {
            console.error('[GoogleDriveSync] Failed to ensure app folder:', error);
            throw error;
        }
    }

    async uploadData(data, options = {}) {
        try {
            // Ensure the sync manager is fully initialized before proceeding
            await this.ensureInitialized();

            if (!this.drive || !this.appFolderId) {
                throw new Error('Drive API not initialized or app folder not found');
            }

            console.log('[GoogleDriveSync] Starting upload process...');
            console.log('[GoogleDriveSync] Upload data contains', Object.keys(data.notes || {}).length, 'notes');

            const jsonData = JSON.stringify(data, null, 2);
            const checksum = this.calculateChecksum(jsonData);

            // Prepare file metadata
            const fileMetadata = {
                name: options.filename || this.backupFileName,
                parents: [this.appFolderId]
            };

            const media = {
                mimeType: 'application/json',
                body: jsonData
            };

            let response;

            if (this.syncMetadata.remoteFileId) {
                // Update existing file - remove parents field as it's not allowed in updates
                console.log('[GoogleDriveSync] Updating existing file:', this.syncMetadata.remoteFileId);
                const updateMetadata = { ...fileMetadata };
                delete updateMetadata.parents; // Remove parents field for updates

                response = await this.drive.files.update({
                    fileId: this.syncMetadata.remoteFileId,
                    resource: updateMetadata,
                    media: media,
                    fields: 'id,modifiedTime,size'
                });
            } else {
                // Create new file
                console.log('[GoogleDriveSync] Creating new file');
                response = await this.drive.files.create({
                    resource: fileMetadata,
                    media: media,
                    fields: 'id,modifiedTime,size'
                });

                // Store the file ID for future updates
                this.syncMetadata.remoteFileId = response.data.id;
            }

            // Update sync metadata
            this.syncMetadata.lastSync = new Date().toISOString();
            this.syncMetadata.lastSyncVersion = data.metadata?.version || '1.0';
            this.syncMetadata.remoteChecksum = checksum;

            console.log('[GoogleDriveSync] Upload successful!');
            console.log('[GoogleDriveSync] File ID:', response.data.id);
            console.log('[GoogleDriveSync] File size:', response.data.size, 'bytes');
            console.log('[GoogleDriveSync] Checksum:', checksum.substring(0, 16) + '...');

            return {
                success: true,
                fileId: response.data.id,
                checksum: checksum,
                size: response.data.size,
                modifiedTime: response.data.modifiedTime
            };

        } catch (error) {
            console.error('[GoogleDriveSync] Upload failed:', error);
            throw error;
        }
    }

    async downloadData() {
        try {
            // Ensure the sync manager is fully initialized before proceeding
            await this.ensureInitialized();

            if (!this.drive || !this.syncMetadata.remoteFileId) {
                throw new Error('Drive API not initialized or no remote file ID');
            }

            console.log('[GoogleDriveSync] Downloading file:', this.syncMetadata.remoteFileId);

            const response = await this.drive.files.get({
                fileId: this.syncMetadata.remoteFileId,
                alt: 'media'
            }, {
                responseType: 'text'
            });

            const jsonData = response.data;
            const checksum = this.calculateChecksum(jsonData);

            console.log('[GoogleDriveSync] Download successful, size:', jsonData.length);

            return {
                data: JSON.parse(jsonData),
                checksum: checksum,
                size: jsonData.length
            };

        } catch (error) {
            console.error('[GoogleDriveSync] Download failed:', error);

            // If file not found, reset remote file ID
            if (error.code === 404) {
                this.syncMetadata.remoteFileId = null;
            }

            throw error;
        }
    }

    async findRemoteFile() {
        try {
            if (!this.drive || !this.appFolderId) {
                return null;
            }

            const query = `name='${this.backupFileName}' and '${this.appFolderId}' in parents and trashed=false`;
            const response = await this.drive.files.list({
                q: query,
                fields: 'files(id,name,modifiedTime,size)',
                spaces: 'drive',
                orderBy: 'modifiedTime desc'
            });

            if (response.data.files.length > 0) {
                const file = response.data.files[0];
                console.log('[GoogleDriveSync] Found remote file:', file.id);

                this.syncMetadata.remoteFileId = file.id;
                return {
                    id: file.id,
                    name: file.name,
                    modifiedTime: file.modifiedTime,
                    size: file.size
                };
            }

            console.log('[GoogleDriveSync] No remote file found');
            return null;

        } catch (error) {
            console.error('[GoogleDriveSync] Failed to find remote file:', error);
            return null;
        }
    }

    async sync(options = {}) {
        try {
            // Ensure the sync manager is fully initialized before proceeding
            await this.ensureInitialized();

            if (this.syncInProgress) {
                throw new Error('Sync already in progress');
            }

            this.syncInProgress = true;
            console.log('[GoogleDriveSync] Starting sync process');

            const result = {
                success: false,
                action: null,
                conflicts: [],
                stats: {
                    uploaded: 0,
                    downloaded: 0,
                    conflicts: 0
                }
            };

            // Ensure we have the latest remote file info
            await this.findRemoteFile();

            // Get local data
            const localData = options.localData || await this.getLocalData();
            const localChecksum = options.localChecksum || this.calculateChecksum(JSON.stringify(localData));

            console.log('[GoogleDriveSync] Local data summary:', {
                notesCount: Object.keys(localData.notes || {}).length,
                conversationsCount: Object.keys(localData.ai_conversations || {}).length,
                checksum: localChecksum.substring(0, 16) + '...'
            });

            let remoteData = null;
            let remoteChecksum = null;

            // Download remote data if it exists
            if (this.syncMetadata.remoteFileId) {
                try {
                    const downloadResult = await this.downloadData();
                    remoteData = downloadResult.data;
                    remoteChecksum = downloadResult.checksum;

                    console.log('[GoogleDriveSync] Remote data summary:', {
                        notesCount: Object.keys(remoteData.notes || {}).length,
                        conversationsCount: Object.keys(remoteData.ai_conversations || {}).length,
                        checksum: remoteChecksum ? remoteChecksum.substring(0, 16) + '...' : 'none'
                    });
                } catch (error) {
                    console.warn('[GoogleDriveSync] Could not download remote data:', error.message);
                }
            }

            // Determine sync strategy
            console.log('[GoogleDriveSync] Comparing data - remoteData exists:', !!remoteData);
            if (!remoteData) {
                // First time sync - upload local data
                console.log('[GoogleDriveSync] First time sync - uploading local data');
                console.log('[GoogleDriveSync] Uploading data with', Object.keys(localData.notes || {}).length, 'notes');
                await this.uploadData(localData);
                result.action = 'upload';
                result.stats.uploaded = 1;
                result.success = true;

            } else if (!this.hasLocalChanges(localData, remoteData)) {
                // No local changes - download remote data
                console.log('[GoogleDriveSync] No local changes - downloading remote data');
                await this.applyRemoteData(remoteData);
                result.action = 'download';
                result.stats.downloaded = 1;
                result.success = true;

            } else {
                // Both have changes - handle conflicts
                console.log('[GoogleDriveSync] Both local and remote have changes - resolving conflicts');
                console.log('[GoogleDriveSync] Local notes:', Object.keys(localData.notes || {}).length);
                console.log('[GoogleDriveSync] Remote notes:', Object.keys(remoteData.notes || {}).length);
                console.log('[GoogleDriveSync] Conflict detection - hasLocalChanges:', this.hasLocalChanges(localData, remoteData));
                const conflictResult = await this.resolveConflicts(localData, remoteData, options.strategy || 'merge');

                if (conflictResult.resolved) {
                    // Upload merged data
                    console.log('[GoogleDriveSync] Uploading merged data after conflict resolution');
                    await this.uploadData(conflictResult.mergedData);
                    result.action = 'merge';
                    result.stats.uploaded = 1;
                    result.success = true;
                } else {
                    console.log('[GoogleDriveSync] Conflicts detected and not auto-resolved');
                    result.action = 'conflict';
                    result.conflicts = conflictResult.conflicts;
                    result.stats.conflicts = conflictResult.conflicts.length;
                }
            }

            // Update sync metadata
            this.syncMetadata.lastSync = new Date().toISOString();
            this.syncMetadata.localChecksum = localChecksum;

            console.log('[GoogleDriveSync] Sync completed:', result);
            return result;

        } catch (error) {
            console.error('[GoogleDriveSync] Sync failed:', error);
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }

    async resolveConflicts(localData, remoteData, strategy = 'merge') {
        const conflicts = [];
        const mergedData = JSON.parse(JSON.stringify(localData)); // Deep clone

        console.log('[GoogleDriveSync] Starting conflict resolution with strategy:', strategy);
        console.log('[GoogleDriveSync] Local notes count:', Object.keys(localData.notes || {}).length);
        console.log('[GoogleDriveSync] Remote notes count:', Object.keys(remoteData.notes || {}).length);

        try {
            // Compare notes
            const localNotes = localData.notes || {};
            const remoteNotes = remoteData.notes || {};

            const allNoteIds = new Set([...Object.keys(localNotes), ...Object.keys(remoteNotes)]);

            for (const noteId of allNoteIds) {
                const localNote = localNotes[noteId];
                const remoteNote = remoteNotes[noteId];

                if (!localNote && remoteNote) {
                    // Remote has new note
                    mergedData.notes[noteId] = remoteNote;
                } else if (localNote && !remoteNote) {
                    // Local has new note - keep it
                    continue;
                } else if (localNote && remoteNote) {
                    // Both have the note - check for conflicts
                    const localModified = new Date(localNote.updated_at || localNote.modified);
                    const remoteModified = new Date(remoteNote.updated_at || remoteNote.modified);

                    if (localModified > remoteModified) {
                        // Local is newer - keep local
                        continue;
                    } else if (remoteModified > localModified) {
                        // Remote is newer - use remote
                        mergedData.notes[noteId] = remoteNote;
                    } else {
                        // Same modification time - check content
                        if (JSON.stringify(localNote) !== JSON.stringify(remoteNote)) {
                            console.log('[GoogleDriveSync] Content conflict detected for note:', localNote.title);
                            conflicts.push({
                                type: 'note',
                                id: noteId,
                                title: localNote.title,
                                localModified: localModified,
                                remoteModified: remoteModified
                            });

                            // For merge strategy, keep local version
                            if (strategy === 'local') {
                                continue;
                            } else if (strategy === 'remote') {
                                mergedData.notes[noteId] = remoteNote;
                            }
                            // For 'merge', we keep local as default
                        }
                    }
                }
            }

            // Handle other data types (settings, tags, etc.) with similar logic
            // For simplicity, we'll prioritize local changes for non-note data

            console.log('[GoogleDriveSync] Conflict resolution complete:', {
                conflictsFound: conflicts.length,
                resolved: conflicts.length === 0 || strategy !== 'manual',
                strategy: strategy
            });

            return {
                resolved: conflicts.length === 0 || strategy !== 'manual',
                mergedData: mergedData,
                conflicts: conflicts
            };

        } catch (error) {
            console.error('[GoogleDriveSync] Conflict resolution failed:', error);
            return {
                resolved: false,
                mergedData: localData, // Fallback to local data
                conflicts: conflicts,
                error: error.message
            };
        }
    }

    hasLocalChanges(localData, remoteData) {
        // Compare content only, excluding export-specific metadata
        // This prevents false positives due to export timestamps

        // Create content-only versions for comparison
        const { exportedForSync, exportedAt, ...localMetadata } = localData.metadata || {};
        const localContent = {
            notes: localData.notes,
            ai_conversations: localData.ai_conversations,
            settings: localData.settings,
            tags: localData.tags,
            note_tags: localData.note_tags,
            metadata: {
                ...localMetadata,
                exportVersion: localData.metadata?.exportVersion || '1.0'
            }
            // Exclude sync object entirely as it contains sync-specific state
        };

        const { exportedForSync: remoteExportedForSync, exportedAt: remoteExportedAt, ...remoteMetadata } = remoteData.metadata || {};
        const remoteContent = {
            notes: remoteData.notes,
            ai_conversations: remoteData.ai_conversations,
            settings: remoteData.settings,
            tags: remoteData.tags,
            note_tags: remoteData.note_tags,
            metadata: {
                ...remoteMetadata,
                exportVersion: remoteData.metadata?.exportVersion || '1.0'
            }
            // Exclude sync object entirely as it contains sync-specific state
        };

        const localStr = JSON.stringify(localContent);
        const remoteStr = JSON.stringify(remoteContent);

        return localStr !== remoteStr;
    }

    async getLocalData() {
        // This method is only used when localData is not provided via options
        // In the main sync flow, localData is passed from the database manager
        console.warn('[GoogleDriveSync] getLocalData called but localData should be provided via options');
        return {
            notes: {},
            ai_conversations: {},
            settings: {},
            tags: {},
            note_tags: {},
            metadata: {
                version: '1.0',
                exportedAt: new Date().toISOString()
            }
        };
    }

    async applyRemoteData(remoteData) {
        // This should be implemented to apply downloaded data to the local database
        // For now, just log
        console.log('[GoogleDriveSync] Applying remote data to local database');
    }

    calculateChecksum(data) {
        return crypto.createHash('md5').update(data).digest('hex');
    }

    getSyncStatus() {
        return {
            inProgress: this.syncInProgress,
            lastSync: this.syncMetadata.lastSync,
            hasRemoteFile: !!this.syncMetadata.remoteFileId,
            localChecksum: this.syncMetadata.localChecksum,
            remoteChecksum: this.syncMetadata.remoteChecksum
        };
    }

    async deleteRemoteData() {
        try {
            if (!this.drive || !this.syncMetadata.remoteFileId) {
                return false;
            }

            await this.drive.files.delete({
                fileId: this.syncMetadata.remoteFileId
            });

            this.syncMetadata.remoteFileId = null;
            console.log('[GoogleDriveSync] Remote data deleted successfully');
            return true;

        } catch (error) {
            console.error('[GoogleDriveSync] Failed to delete remote data:', error);
            return false;
        }
    }
}

// Export for use in main app
// Use window for renderer process, module.exports for main process
if (typeof window !== 'undefined') {
    window.GoogleDriveSyncManager = GoogleDriveSyncManager;
} else {
    module.exports = { GoogleDriveSyncManager };
}
