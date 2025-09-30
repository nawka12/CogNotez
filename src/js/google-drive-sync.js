// Google Drive Sync Manager for CogNotez
// Handles synchronization of notes data with Google Drive

const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const encryptionManager = require('./encryption');

// Check if we're in Electron main process or renderer process
const isMainProcess = typeof window === 'undefined';

class GoogleDriveSyncManager {
    constructor(authManager, encryptionSettings = null) {
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

        // Encryption settings
        this.encryptionEnabled = encryptionSettings?.enabled || false;
        this.encryptionPassphrase = encryptionSettings?.passphrase || null;
        this.encryptionSalt = encryptionSettings?.saltBase64 || null;
        this.encryptionIterations = encryptionSettings?.iterations || 210000;

        this.initialize();
    }

    /**
     * Update encryption settings
     * @param {Object} settings - Encryption settings
     */
    updateEncryptionSettings(settings) {
        this.encryptionEnabled = settings?.enabled || false;
        this.encryptionPassphrase = settings?.passphrase || null;
        this.encryptionSalt = settings?.saltBase64 || this.encryptionSalt;
        this.encryptionIterations = settings?.iterations || this.encryptionIterations;

        console.log('[GoogleDriveSync] Encryption settings updated:', {
            enabled: this.encryptionEnabled,
            hasPassphrase: !!this.encryptionPassphrase,
            hasSalt: !!this.encryptionSalt
        });
    }

    /**
     * Get current encryption status
     * @returns {Object} - Encryption status info
     */
    getEncryptionStatus() {
        return {
            enabled: this.encryptionEnabled,
            hasPassphrase: !!this.encryptionPassphrase,
            hasSalt: !!this.encryptionSalt,
            iterations: this.encryptionIterations
        };
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

    // Build a content-only snapshot for checksum comparisons (exclude sync state and volatile metadata)
    createContentOnlySnapshot(data) {
        const metadata = data.metadata || {};
        const snapshot = {
            notes: data.notes || {},
            ai_conversations: data.ai_conversations || {},
            tags: data.tags || {},
            note_tags: data.note_tags || {},
            metadata: {
                ...metadata,
                exportVersion: metadata.exportVersion || '1.0'
            }
        };
        // Remove exportedAt/exportedForSync and any sync object if present
        delete snapshot.metadata.exportedAt;
        delete snapshot.metadata.exportedForSync;
        delete snapshot.sync;
        return snapshot;
    }

    calculateContentChecksum(dataObject) {
        const contentSnapshot = this.createContentOnlySnapshot(dataObject);
        const str = JSON.stringify(contentSnapshot);
        // Simple 32-bit rolling hash to match DatabaseManager.calculateChecksum
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
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

    async uploadData(data, options = {}, retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = 1000 * Math.pow(2, retryCount); // Exponential backoff

        let progressCallback = () => {};
        try {
            // Ensure the sync manager is fully initialized before proceeding
            await this.ensureInitialized();

            if (!this.drive || !this.appFolderId) {
                const error = new Error('Drive API not initialized or app folder not found. Please reconnect Google Drive in Sync Settings.');
                error.notRetryable = true;
                throw error;
            }

            console.log('[GoogleDriveSync] Starting upload process...');
            console.log('[GoogleDriveSync] Upload data contains', Object.keys(data.notes || {}).length, 'notes');
            console.log('[GoogleDriveSync] Encryption enabled:', this.encryptionEnabled);

            // Encrypt data if encryption is enabled
            let dataToUpload = data;
            if (this.encryptionEnabled) {
                if (!this.encryptionPassphrase) {
                    throw new Error('Encryption is enabled but no passphrase is set');
                }

                try {
                    dataToUpload = encryptionManager.encryptData(data, this.encryptionPassphrase, {
                        saltBase64: this.encryptionSalt,
                        iterations: this.encryptionIterations
                    });
                    console.log('[GoogleDriveSync] Data encrypted successfully');
                } catch (error) {
                    console.error('[GoogleDriveSync] Encryption failed:', error);
                    throw new Error(`Encryption failed: ${error.message}`);
                }
            }

            const jsonData = JSON.stringify(dataToUpload, null, 2);
            // Content-only checksum for robust equality across devices
            const checksum = this.calculateContentChecksum(data);

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

            // Don't retry if explicitly marked as non-retryable
            if (error.notRetryable) {
                throw error;
            }

            // Check for network errors (offline state)
            const isNetworkError = error.message && (
                error.message.includes('Failed to fetch') ||
                error.message.includes('NetworkError') ||
                error.message.includes('ENOTFOUND') ||
                error.message.includes('ETIMEDOUT') ||
                error.code === 'ENOTFOUND' ||
                error.code === 'ETIMEDOUT'
            );

            // Network errors are retryable but should be handled differently
            if (isNetworkError) {
                console.log('[GoogleDriveSync] Network error detected - device may be offline');
                const networkError = new Error('No internet connection. Please check your network and try again.');
                networkError.isOffline = true;
                networkError.retryableWhenOnline = true;
                throw networkError;
            }

            // Categorize error types for better handling
            const isRetryableError = error.code === 429 || // Rate limit
                                   error.code === 500 || // Server error
                                   error.code === 502 || // Bad gateway
                                   error.code === 503 || // Service unavailable
                                   error.code === 504 || // Gateway timeout
                                   (error.code >= 520 && error.code <= 527); // Cloudflare errors

            // Retry for transient errors
            if (isRetryableError && retryCount < maxRetries) {
                console.log(`[GoogleDriveSync] Retrying upload in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return this.uploadData(data, options, retryCount + 1);
            }

            throw error;
        }
    }

    async downloadData(retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = 1000 * Math.pow(2, retryCount); // Exponential backoff

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
            let parsed = JSON.parse(jsonData);

            // Check if data is encrypted and decrypt if necessary
            if (encryptionManager.isEncrypted(parsed)) {
                console.log('[GoogleDriveSync] Downloaded data is encrypted, attempting decryption...');

                if (!this.encryptionPassphrase) {
                    const err = new Error('Downloaded data is encrypted and requires a passphrase');
                    err.encryptionRequired = true;
                    throw err;
                }

                try {
                    const decryptedData = encryptionManager.decryptData(parsed, this.encryptionPassphrase);
                    parsed = decryptedData;
                    console.log('[GoogleDriveSync] Data decrypted successfully');
                } catch (error) {
                    console.error('[GoogleDriveSync] Decryption failed:', error);
                    const err = new Error(`Decryption failed: ${error.message}. This may indicate an incorrect passphrase or corrupted data.`);
                    err.encryptionRequired = true;
                    throw err;
                }
            } else {
                console.log('[GoogleDriveSync] Downloaded data is not encrypted');
            }

            const checksum = this.calculateContentChecksum(parsed);

            console.log('[GoogleDriveSync] Download successful, size:', jsonData.length);

            return {
                data: parsed,
                checksum: checksum,
                size: jsonData.length,
                isEncrypted: encryptionManager.isEncrypted(JSON.parse(jsonData))
            };

        } catch (error) {
            console.error('[GoogleDriveSync] Download failed:', error);

            // If file not found, reset remote file ID (not retryable)
            if (error.code === 404) {
                this.syncMetadata.remoteFileId = null;
                throw error;
            }

            // Check for network errors (offline state)
            const isNetworkError = error.message && (
                error.message.includes('Failed to fetch') ||
                error.message.includes('NetworkError') ||
                error.message.includes('ENOTFOUND') ||
                error.message.includes('ETIMEDOUT') ||
                error.code === 'ENOTFOUND' ||
                error.code === 'ETIMEDOUT'
            );

            // Network errors are retryable but should be handled differently
            if (isNetworkError) {
                console.log('[GoogleDriveSync] Network error detected during download - device may be offline');
                const networkError = new Error('No internet connection. Please check your network and try again.');
                networkError.isOffline = true;
                networkError.retryableWhenOnline = true;
                throw networkError;
            }

            // Categorize error types for better handling
            const isRetryableError = error.code === 429 || // Rate limit
                                   error.code === 500 || // Server error
                                   error.code === 502 || // Bad gateway
                                   error.code === 503 || // Service unavailable
                                   error.code === 504 || // Gateway timeout
                                   (error.code >= 520 && error.code <= 527); // Cloudflare errors

            // Retry for transient errors
            if (isRetryableError && retryCount < maxRetries) {
                console.log(`[GoogleDriveSync] Retrying download in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return this.downloadData(retryCount + 1);
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
        let progressCallback = () => {};
        try {
            // Ensure the sync manager is fully initialized before proceeding
            await this.ensureInitialized();

            if (this.syncInProgress) {
                throw new Error('Sync already in progress');
            }

            this.syncInProgress = true;
            console.log('[GoogleDriveSync] Starting sync process');

            // Progress callback support
            progressCallback = typeof options.onProgress === 'function' ? options.onProgress : (() => {});

            progressCallback({ status: 'initializing', message: 'Preparing sync...' });

            const result = {
                success: false,
                action: null,
                conflicts: [],
                stats: {
                    uploaded: 0,
                    downloaded: 0,
                    conflicts: 0,
                    mediaFilesUploaded: 0,
                    mediaFilesDownloaded: 0
                }
            };

            progressCallback({ status: 'checking_remote', message: 'Checking for remote data...' });

            // Ensure we have the latest remote file info
            await this.findRemoteFile();

            progressCallback({ status: 'analyzing_local', message: 'Analyzing local data...' });

            // Get local data
            const localData = options.localData || await this.getLocalData();
            const localChecksum = this.calculateContentChecksum(localData);
            // Track local checksum for status reporting
            this.syncMetadata.localChecksum = localChecksum;

            console.log('[GoogleDriveSync] Local data summary:', {
                notesCount: Object.keys(localData.notes || {}).length,
                conversationsCount: Object.keys(localData.ai_conversations || {}).length,
                checksum: localChecksum.substring(0, 16) + '...'
            });

            let remoteData = null;
            let remoteChecksum = null;

            // Download remote data if it exists
            if (this.syncMetadata.remoteFileId) {
                progressCallback({ status: 'downloading', message: 'Downloading remote data...' });
                try {
                    const downloadResult = await this.downloadData();
                    remoteData = downloadResult.data;
                    remoteChecksum = downloadResult.checksum;
                    this.syncMetadata.remoteChecksum = remoteChecksum;

                    console.log('[GoogleDriveSync] Remote data summary:', {
                        notesCount: Object.keys(remoteData.notes || {}).length,
                        conversationsCount: Object.keys(remoteData.ai_conversations || {}).length,
                        checksum: remoteChecksum ? remoteChecksum.substring(0, 16) + '...' : 'none'
                    });
                } catch (error) {
                    console.warn('[GoogleDriveSync] Could not download remote data:', error.message);
                    if (error && error.encryptionRequired) {
                        // Propagate encryption requirement so caller can prompt user
                        throw error;
                    }
                    progressCallback({ status: 'error', message: 'Failed to download remote data' });
                }
            }

            // Handle media file synchronization
            progressCallback({ status: 'syncing_media', message: 'Synchronizing media files...' });
            const mediaSyncResult = await this.syncMediaFiles(localData, remoteData, progressCallback);
            result.stats.mediaFilesUploaded = mediaSyncResult.uploaded;
            result.stats.mediaFilesDownloaded = mediaSyncResult.downloaded;

            // Determine sync strategy
            progressCallback({ status: 'analyzing_changes', message: 'Analyzing data changes...' });
            console.log('[GoogleDriveSync] Comparing data - remoteData exists:', !!remoteData);

            if (!remoteData) {
                // First time sync - upload local data
                progressCallback({ status: 'uploading', message: 'Uploading data to Google Drive...' });
                console.log('[GoogleDriveSync] First time sync - uploading local data');
                console.log('[GoogleDriveSync] Uploading data with', Object.keys(localData.notes || {}).length, 'notes');
                await this.uploadData(localData);
                result.action = 'upload';
                result.stats.uploaded = 1;
                result.success = true;

            } else if (!this.hasLocalChanges(localData, remoteData)) {
                // No local changes - download remote data
                progressCallback({ status: 'applying_remote', message: 'Applying remote data...' });
                console.log('[GoogleDriveSync] No local changes - downloading remote data');
                await this.applyRemoteData(remoteData);
                result.action = 'download';
                result.stats.downloaded = 1;
                result.success = true;
                // After applying remote data, local content now matches remote
                this.syncMetadata.localChecksum = this.syncMetadata.remoteChecksum;

            } else {
                // Both have changes - handle conflicts
                progressCallback({ status: 'resolving_conflicts', message: 'Resolving data conflicts...' });
                console.log('[GoogleDriveSync] Both local and remote have changes - resolving conflicts');
                console.log('[GoogleDriveSync] Local notes:', Object.keys(localData.notes || {}).length);
                console.log('[GoogleDriveSync] Remote notes:', Object.keys(remoteData.notes || {}).length);
                console.log('[GoogleDriveSync] Conflict detection - hasLocalChanges:', this.hasLocalChanges(localData, remoteData));
                // Use the most recent known lastSync between renderer-provided and internal
                const providedLastSync = options.lastSync ? new Date(options.lastSync).getTime() : null;
                const internalLastSync = this.syncMetadata.lastSync ? new Date(this.syncMetadata.lastSync).getTime() : null;
                let effectiveLastSync = null;
                if (providedLastSync && internalLastSync) {
                    effectiveLastSync = new Date(Math.max(providedLastSync, internalLastSync)).toISOString();
                } else if (providedLastSync) {
                    effectiveLastSync = new Date(providedLastSync).toISOString();
                } else if (internalLastSync) {
                    effectiveLastSync = new Date(internalLastSync).toISOString();
                }
                console.log('[GoogleDriveSync] Using effective lastSync:', effectiveLastSync);
                const conflictResult = await this.resolveConflicts(localData, remoteData, options.strategy || 'merge', effectiveLastSync);

                if (conflictResult.resolved) {
                    // Upload merged data
                    progressCallback({ status: 'uploading', message: 'Uploading merged data...' });
                    console.log('[GoogleDriveSync] Uploading merged data after conflict resolution');
                    await this.uploadData(conflictResult.mergedData);
                    result.action = 'merge';
                    result.mergedData = conflictResult.mergedData; // Include merged data in result
                    result.stats.uploaded = 1;
                    result.success = true;
                } else {
                    progressCallback({ status: 'conflict_detected', message: 'Manual conflict resolution needed' });
                    console.log('[GoogleDriveSync] Conflicts detected and not auto-resolved');
                    result.action = 'conflict';
                    result.conflicts = conflictResult.conflicts;
                    result.stats.conflicts = conflictResult.conflicts.length;
                }
            }

            // Update sync metadata
            this.syncMetadata.lastSync = new Date().toISOString();
            this.syncMetadata.localChecksum = localChecksum;

            progressCallback({
                status: 'completed',
                message: `Sync completed: ${result.action}`,
                result: result
            });

            console.log('[GoogleDriveSync] Sync completed:', result);
            return result;

        } catch (error) {
            console.error('[GoogleDriveSync] Sync failed:', error);
            progressCallback({
                status: 'error',
                message: this._formatSyncErrorMessage(error),
                error: error
            });
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }

    _formatSyncErrorMessage(error) {
        try {
            if (!error) return 'Sync failed due to an unknown error';
            if (error.encryptionRequired) {
                return 'Cloud data is encrypted. Enter your E2EE passphrase to continue.';
            }
            
            // Network-related errors
            if (error.message && (
                error.message.includes('Failed to fetch') || 
                error.message.includes('NetworkError') ||
                error.message.includes('ENOTFOUND') ||
                error.message.includes('ETIMEDOUT') ||
                error.message.includes('network')
            )) {
                return 'No internet connection. Sync requires an active internet connection. Will retry when online.';
            }
            
            const code = error.code || error.status || '';
            if (code === 404) return 'Remote backup not found on Google Drive.';
            if (code === 401 || code === 403) return 'Google Drive access denied. Please reconnect your account in Sync Settings.';
            if (code === 429) return 'Google Drive rate limit reached. Auto-sync paused temporarily.';
            if (code === 500 || code === 502 || code === 503 || code === 504) {
                return 'Google Drive service temporarily unavailable. Will retry automatically.';
            }
            
            return `Sync failed: ${error.message || 'Unexpected error'}`;
        } catch (_) {
            return 'Sync failed due to an unknown error';
        }
    }

    async resolveConflicts(localData, remoteData, strategy = 'merge', lastSyncIso = null) {
        const conflicts = [];
        const mergedData = JSON.parse(JSON.stringify(localData)); // Deep clone

        console.log('[GoogleDriveSync] Starting conflict resolution with strategy:', strategy);
        console.log('[GoogleDriveSync] lastSyncIso:', lastSyncIso);
        console.log('[GoogleDriveSync] Local notes count:', Object.keys(localData.notes || {}).length);
        console.log('[GoogleDriveSync] Remote notes count:', Object.keys(remoteData.notes || {}).length);

        try {
            // Compare notes
            const localNotes = localData.notes || {};
            const remoteNotes = remoteData.notes || {};

            const allNoteIds = new Set([...Object.keys(localNotes), ...Object.keys(remoteNotes)]);

            const lastSyncTime = lastSyncIso ? new Date(lastSyncIso).getTime() : null;
            for (const noteId of allNoteIds) {
                const localNote = localNotes[noteId];
                const remoteNote = remoteNotes[noteId];

                if (!localNote && remoteNote) {
                    // Note missing locally. If we have a lastSync and the remote wasn't
                    // modified after lastSync, treat this as a local deletion and do NOT re-add.
                    const remoteModifiedTime = new Date(remoteNote.updated_at || remoteNote.modified || remoteNote.created_at).getTime();
                    console.log(`[GoogleDriveSync] Note ${noteId} missing locally, remote modified: ${new Date(remoteModifiedTime).toISOString()}, lastSync: ${lastSyncTime ? new Date(lastSyncTime).toISOString() : 'none'}`);
                    if (lastSyncTime && remoteModifiedTime <= lastSyncTime) {
                        console.log(`[GoogleDriveSync] Treating as local deletion - omitting from merged data`);
                        // Respect local deletion: do nothing (omit from merged)
                        continue;
                    }
                    console.log(`[GoogleDriveSync] Treating as new remote note - adding to merged data`);
                    // Otherwise, treat as new remote note (added elsewhere) and keep it
                    mergedData.notes[noteId] = remoteNote;
                } else if (localNote && !remoteNote) {
                    // Remote missing the note. If we have lastSync and local wasn't
                    // modified after lastSync, treat this as a remote deletion and drop it.
                    const localModifiedTime = new Date(localNote.updated_at || localNote.modified || localNote.created_at).getTime();
                    if (lastSyncTime && localModifiedTime <= lastSyncTime) {
                        // Respect remote deletion: remove from merged if present
                        if (mergedData.notes[noteId]) {
                            delete mergedData.notes[noteId];
                        }
                        continue;
                    }
                    // Otherwise, it's a new/updated local note since last sync; keep it
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
        // Check if local has meaningful content that would be lost by downloading remote data
        // This prevents treating empty local data as "changes" when remote has content

        const localNotesCount = Object.keys(localData.notes || {}).length;
        const localConversationsCount = Object.keys(localData.ai_conversations || {}).length;
        const remoteNotesCount = Object.keys(remoteData.notes || {}).length;
        const remoteConversationsCount = Object.keys(remoteData.ai_conversations || {}).length;

        // If local is empty but remote has data, don't treat this as "local changes"
        const localIsEmpty = localNotesCount === 0 && localConversationsCount === 0;
        const remoteHasData = remoteNotesCount > 0 || remoteConversationsCount > 0;

        if (localIsEmpty && remoteHasData) {
            return false; // No local changes - just download remote data
        }

        // Compare content only, excluding export-specific metadata
        // This prevents false positives due to export timestamps
        const { exportedForSync, exportedAt, ...localMetadata } = localData.metadata || {};
        const localContent = {
            notes: localData.notes,
            ai_conversations: localData.ai_conversations,
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
        // Note: Data application is handled by the main process after sync completion
        // This method is kept for interface consistency but actual data import
        // happens in main.js via databaseManager.importDataFromSync()
        console.log('[GoogleDriveSync] Remote data will be applied by main process database manager');
    }

    calculateChecksum(data) {
        // Legacy helper (not used for content equality)
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

    // ============================================================
    // PHASE 5: MEDIA FILE SYNC
    // ============================================================

    /**
     * Get or create media folder in Google Drive
     */
    async getMediaFolderId() {
        try {
            if (this.mediaFolderId) {
                return this.mediaFolderId;
            }

            // Search for existing media folder in app folder
            const response = await this.drive.files.list({
                q: `name='media' and '${this.appFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive'
            });

            if (response.data.files && response.data.files.length > 0) {
                this.mediaFolderId = response.data.files[0].id;
                console.log('[GoogleDriveSync] Found existing media folder:', this.mediaFolderId);
            } else {
                // Create media folder
                const folderMetadata = {
                    name: 'media',
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [this.appFolderId]
                };

                const folder = await this.drive.files.create({
                    resource: folderMetadata,
                    fields: 'id'
                });

                this.mediaFolderId = folder.data.id;
                console.log('[GoogleDriveSync] Created media folder:', this.mediaFolderId);
            }

            return this.mediaFolderId;
        } catch (error) {
            console.error('[GoogleDriveSync] Failed to get/create media folder:', error);
            throw error;
        }
    }

    /**
     * Upload media file to Google Drive
     * @param {string} fileName - Name of the file
     * @param {Buffer} fileData - File data as Buffer
     * @param {number} mtime - Optional modification time in milliseconds
     */
    async uploadMediaFile(fileName, fileData, mtime = null) {
        try {
            const mediaFolderId = await this.getMediaFolderId();
            
            // Convert Buffer to Stream (Google Drive API expects a stream)
            const { Readable } = require('stream');
            const bufferStream = Readable.from(fileData);

            // Check if file already exists
            const existing = await this.drive.files.list({
                q: `name='${fileName}' and '${mediaFolderId}' in parents and trashed=false`,
                fields: 'files(id, size, modifiedTime)',
                spaces: 'drive'
            });

            if (existing.data.files && existing.data.files.length > 0) {
                // File exists - update it
                const fileId = existing.data.files[0].id;
                const updateStream = Readable.from(fileData);
                
                const updateMetadata = {
                    name: fileName
                };
                
                // Set modification time if provided
                if (mtime) {
                    updateMetadata.modifiedTime = new Date(mtime).toISOString();
                }
                
                await this.drive.files.update({
                    fileId: fileId,
                    resource: updateMetadata,
                    media: {
                        mimeType: 'application/octet-stream',
                        body: updateStream
                    }
                });
                console.log('[GoogleDriveSync] Updated media file:', fileName);
            } else {
                // Create new file
                const fileMetadata = {
                    name: fileName,
                    parents: [mediaFolderId]
                };
                
                // Set modification time if provided
                if (mtime) {
                    fileMetadata.modifiedTime = new Date(mtime).toISOString();
                }

                await this.drive.files.create({
                    resource: fileMetadata,
                    media: {
                        mimeType: 'application/octet-stream',
                        body: bufferStream
                    },
                    fields: 'id'
                });
                console.log('[GoogleDriveSync] Uploaded media file:', fileName);
            }

            return true;
        } catch (error) {
            console.error('[GoogleDriveSync] Failed to upload media file:', error);
            throw error;
        }
    }

    /**
     * Download media file from Google Drive
     */
    async downloadMediaFile(fileId) {
        try {
            const response = await this.drive.files.get({
                fileId: fileId,
                alt: 'media'
            }, {
                responseType: 'arraybuffer'
            });

            return Buffer.from(response.data);
        } catch (error) {
            console.error('[GoogleDriveSync] Failed to download media file:', error);
            throw error;
        }
    }

    /**
     * List all media files in Google Drive
     */
    async listMediaFiles() {
        try {
            const mediaFolderId = await this.getMediaFolderId();

            const response = await this.drive.files.list({
                q: `'${mediaFolderId}' in parents and trashed=false`,
                fields: 'files(id, name, size, modifiedTime)',
                spaces: 'drive'
            });

            return response.data.files || [];
        } catch (error) {
            console.error('[GoogleDriveSync] Failed to list media files:', error);
            throw error;
        }
    }

    /**
     * Delete media file from Google Drive
     */
    async deleteMediaFile(fileId) {
        try {
            await this.drive.files.delete({
                fileId: fileId
            });
            console.log('[GoogleDriveSync] Deleted media file:', fileId);
            return true;
        } catch (error) {
            console.error('[GoogleDriveSync] Failed to delete media file:', error);
            throw error;
        }
    }

    /**
     * Extract media file IDs from note content
     * @param {Object} data - Notes data object
     * @returns {Set} Set of media file IDs found in notes
     */
    extractMediaFileIds(data) {
        const mediaFileIds = new Set();

        if (!data || !data.notes) {
            return mediaFileIds;
        }

        // Pattern to match cognotez-media:// URLs
        const mediaUrlPattern = /cognotez-media:\/\/([a-z0-9]+)/gi;

        for (const note of Object.values(data.notes)) {
            if (note.content) {
                const matches = note.content.match(mediaUrlPattern);
                if (matches) {
                    for (const match of matches) {
                        const fileId = match.replace('cognotez-media://', '');
                        mediaFileIds.add(fileId);
                    }
                }
            }
        }

        return mediaFileIds;
    }

    /**
     * Synchronize media files between local and remote storage
     * @param {Object} localData - Local notes data
     * @param {Object} remoteData - Remote notes data (null if no remote data)
     * @param {Function} progressCallback - Progress callback function
     * @returns {Object} Sync results with uploaded and downloaded counts
     */
    async syncMediaFiles(localData, remoteData, progressCallback) {
        const result = {
            uploaded: 0,
            downloaded: 0,
            errors: []
        };

        try {
            // Extract media file IDs from both local and remote data
            const localMediaIds = this.extractMediaFileIds(localData);
            const remoteMediaIds = remoteData ? this.extractMediaFileIds(remoteData) : new Set();

            console.log('[GoogleDriveSync] Media sync - Local files:', localMediaIds.size, 'Remote files:', remoteMediaIds.size);

            // Get list of remote media files
            let remoteMediaFiles = [];
            try {
                remoteMediaFiles = await this.listMediaFiles();
                console.log('[GoogleDriveSync] Found', remoteMediaFiles.length, 'remote media files');
            } catch (error) {
                console.warn('[GoogleDriveSync] Could not list remote media files:', error.message);
                // Continue with empty list - we'll handle missing files during download
            }

            // Create a map of remote file names to IDs for quick lookup
            const remoteFileMap = new Map();
            remoteMediaFiles.forEach(file => {
                remoteFileMap.set(file.name, file.id);
            });

            // This is a simplified sync approach:
            // 1. For files that exist locally but not remotely: upload them
            // 2. For files that exist remotely but not locally: download them
            // Note: In a full implementation, we'd also check modification times and handle conflicts

            // Upload new local media files
            for (const fileId of localMediaIds) {
                const fileName = `${fileId}`; // Files are stored by ID without extension in our current system

                if (!remoteFileMap.has(fileName)) {
                    try {
                        // Get file data from local storage
                        let fileData = null;
                        if (typeof window !== 'undefined' && window.RichMediaManager) {
                            // We're in renderer process - use RichMediaManager
                            fileData = await window.RichMediaManager.getMediaFile(fileId);
                        } else {
                            // We're in main process - use direct file access
                            const fs = require('fs').promises;
                            const mediaDir = await this.getMediaDirectory();
                            const filePath = `${mediaDir}/${fileName}`;

                            try {
                                fileData = await fs.readFile(filePath);
                            } catch (error) {
                                console.warn(`[GoogleDriveSync] Could not read local media file ${fileName}:`, error.message);
                                continue;
                            }
                        }

                        if (fileData) {
                            await this.uploadMediaFile(fileName, fileData);
                            result.uploaded++;
                            console.log('[GoogleDriveSync] Uploaded media file:', fileName);
                        }
                    } catch (error) {
                        console.error('[GoogleDriveSync] Failed to upload media file:', fileName, error);
                        result.errors.push(`Upload failed for ${fileName}: ${error.message}`);
                    }
                }
            }

            // Download missing remote media files
            for (const file of remoteMediaFiles) {
                const fileName = file.name;
                const fileId = fileName; // File name is the ID in our system

                // Check if this file is referenced in either local or remote notes
                if (localMediaIds.has(fileId) || remoteMediaIds.has(fileId)) {
                    // Check if file exists locally
                    let fileExistsLocally = false;

                    if (typeof window !== 'undefined' && window.RichMediaManager) {
                        // Renderer process - check if RichMediaManager can access the file
                        try {
                            await window.RichMediaManager.getMediaFile(fileId);
                            fileExistsLocally = true;
                        } catch (error) {
                            fileExistsLocally = false;
                        }
                    } else {
                        // Main process - check file system
                        try {
                            const fs = require('fs').promises;
                            const mediaDir = await this.getMediaDirectory();
                            const filePath = `${mediaDir}/${fileName}`;
                            await fs.access(filePath);
                            fileExistsLocally = true;
                        } catch (error) {
                            fileExistsLocally = false;
                        }
                    }

                    if (!fileExistsLocally) {
                        try {
                            // Download the file
                            const fileData = await this.downloadMediaFile(file.id);

                            // Save to local storage
                            if (typeof window !== 'undefined' && window.RichMediaManager) {
                                // Renderer process - use RichMediaManager to save and register
                                await window.RichMediaManager.saveDownloadedMediaFile(fileId, fileData);

                                // Also register the file in the media database for cognotez-media:// access
                                const mediaDir = await this.getMediaDirectory();
                                const mediaRef = {
                                    id: fileId,
                                    name: fileName,
                                    type: 'application/octet-stream', // Will be updated when file is actually accessed
                                    size: fileData.byteLength || fileData.length,
                                    storageType: 'filesystem',
                                    path: `${mediaDir}/${fileName}`,
                                    createdAt: new Date().toISOString()
                                };

                                // Track this as a downloaded media file
                                await window.RichMediaManager.trackDownloadedMedia(fileId, mediaRef);
                            } else {
                                // Main process - save directly to file system
                                const fs = require('fs').promises;
                                const mediaDir = await this.getMediaDirectory();
                                const filePath = `${mediaDir}/${fileName}`;

                                // Ensure media directory exists
                                await fs.mkdir(mediaDir, { recursive: true });
                                await fs.writeFile(filePath, fileData);
                            }

                            result.downloaded++;
                            console.log('[GoogleDriveSync] Downloaded media file:', fileName);
                        } catch (error) {
                            console.error('[GoogleDriveSync] Failed to download media file:', fileName, error);
                            result.errors.push(`Download failed for ${fileName}: ${error.message}`);
                        }
                    }
                }
            }

            console.log('[GoogleDriveSync] Media sync completed:', result);
            return result;

        } catch (error) {
            console.error('[GoogleDriveSync] Media sync failed:', error);
            result.errors.push(`Media sync failed: ${error.message}`);
            return result;
        }
    }

    /**
     * Get media directory path (main process only)
     */
    async getMediaDirectory() {
        // Use the existing IPC handler to get media directory
        if (typeof window !== 'undefined') {
            // We're in renderer process - use IPC
            const electron = require('electron');
            return await electron.ipcRenderer.invoke('get-media-directory');
        } else {
            // We're in main process - return the path directly
            const path = require('path');
            const app = require('electron').app;
            const mediaDir = path.join(app.getPath('userData'), 'media');
            return mediaDir;
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
