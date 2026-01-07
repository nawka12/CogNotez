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

    /**
     * Generate a unique device identifier for tracking which device performed a sync.
     * Uses a combination of machine ID and random suffix for uniqueness.
     */
    _getDeviceIdentifier() {
        // Use a cached device ID if available
        if (this._deviceId) {
            return this._deviceId;
        }

        // Try to get a persistent device identifier
        let deviceId = 'unknown';
        try {
            if (isMainProcess) {
                // Main process - use machine-id or hostname
                const os = require('os');
                const hostname = os.hostname();
                deviceId = `${hostname}-${crypto.randomBytes(4).toString('hex')}`;
            } else if (typeof window !== 'undefined' && window.localStorage) {
                // Renderer process - use or create a persistent ID in localStorage
                let storedId = window.localStorage.getItem('cognotez_device_id');
                if (!storedId) {
                    storedId = `browser-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
                    window.localStorage.setItem('cognotez_device_id', storedId);
                }
                deviceId = storedId;
            }
        } catch (error) {
            console.warn('[GoogleDriveSync] Could not get device identifier:', error.message);
            deviceId = `fallback-${Date.now().toString(36)}`;
        }

        this._deviceId = deviceId;
        return deviceId;
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

        let progressCallback = () => { };
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

            // =====================================================
            // OPTIMISTIC LOCKING: Check remote version before upload
            // =====================================================
            if (this.syncMetadata.remoteFileId && options.expectedRemoteModifiedTime) {
                try {
                    const fileInfo = await this.drive.files.get({
                        fileId: this.syncMetadata.remoteFileId,
                        fields: 'modifiedTime'
                    });

                    const currentRemoteModifiedTime = fileInfo.data.modifiedTime;

                    if (currentRemoteModifiedTime !== options.expectedRemoteModifiedTime) {
                        console.warn('[GoogleDriveSync] Version conflict detected!');
                        console.warn('[GoogleDriveSync] Expected remote modifiedTime:', options.expectedRemoteModifiedTime);
                        console.warn('[GoogleDriveSync] Actual remote modifiedTime:', currentRemoteModifiedTime);

                        const conflictError = new Error('Version conflict: another device synced since last download');
                        conflictError.versionConflict = true;
                        conflictError.currentRemoteModifiedTime = currentRemoteModifiedTime;
                        throw conflictError;
                    }

                    console.log('[GoogleDriveSync] Version check passed - remote unchanged since download');
                } catch (error) {
                    if (error.versionConflict) {
                        throw error; // Re-throw version conflict errors
                    }
                    // If we can't check (e.g., network error), log warning but proceed
                    console.warn('[GoogleDriveSync] Could not verify remote version, proceeding with upload:', error.message);
                }
            }

            // Include syncVersion in the data being uploaded
            const dataWithVersion = {
                ...data,
                _syncMeta: {
                    syncVersion: options.syncVersion || (data._syncMeta?.syncVersion || 0) + 1,
                    uploadedAt: new Date().toISOString(),
                    uploadedBy: this._getDeviceIdentifier()
                }
            };

            // Encrypt data if encryption is enabled
            let dataToUpload = dataWithVersion;
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

            // Parse JSON with error handling
            let parsed;
            let isEncrypted = false;
            try {
                parsed = JSON.parse(jsonData);
                isEncrypted = encryptionManager.isEncrypted(parsed);
            } catch (parseError) {
                console.error('[GoogleDriveSync] Failed to parse downloaded JSON data:', parseError);
                throw new Error(`Downloaded data is not valid JSON: ${parseError.message}`);
            }

            // Check if data is encrypted and decrypt if necessary
            if (isEncrypted) {
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
                isEncrypted: isEncrypted
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
        let progressCallback = () => { };
        try {
            // Check if sync is already in progress BEFORE async initialization to prevent race conditions
            if (this.syncInProgress) {
                throw new Error('Sync already in progress');
            }

            // Set flag immediately to prevent concurrent sync attempts
            this.syncInProgress = true;

            // Ensure the sync manager is fully initialized before proceeding
            await this.ensureInitialized();

            console.log('[GoogleDriveSync] Starting sync process');

            // Progress callback support
            progressCallback = typeof options.onProgress === 'function' ? options.onProgress : (() => { });

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
            let remoteModifiedTime = null; // Track for optimistic locking

            // Download remote data if it exists
            if (this.syncMetadata.remoteFileId) {
                progressCallback({ status: 'downloading', message: 'Downloading remote data...' });
                try {
                    // Get remote file's modifiedTime for optimistic locking
                    try {
                        const fileInfo = await this.drive.files.get({
                            fileId: this.syncMetadata.remoteFileId,
                            fields: 'modifiedTime'
                        });
                        remoteModifiedTime = fileInfo.data.modifiedTime;
                        console.log('[GoogleDriveSync] Remote file modifiedTime:', remoteModifiedTime);
                    } catch (modifiedTimeError) {
                        console.warn('[GoogleDriveSync] Could not get remote modifiedTime:', modifiedTimeError.message);
                    }

                    const downloadResult = await this.downloadData();
                    remoteData = downloadResult.data;
                    remoteChecksum = downloadResult.checksum;
                    this.syncMetadata.remoteChecksum = remoteChecksum;

                    console.log('[GoogleDriveSync] Remote data summary:', {
                        notesCount: Object.keys(remoteData.notes || {}).length,
                        conversationsCount: Object.keys(remoteData.ai_conversations || {}).length,
                        checksum: remoteChecksum ? remoteChecksum.substring(0, 16) + '...' : 'none',
                        syncVersion: remoteData._syncMeta?.syncVersion || 'none'
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
                result.remoteData = remoteData; // Include remote data in result to avoid redundant download
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
                // CRITICAL: Use ONLY this device's last sync time, NOT cloud's global lastSync
                // Using cloud's lastSync would cause data loss for offline-created notes
                // Example: Device A synced at 7 AM, creates note at 8 AM offline
                //          Device B syncs at 8:30 AM
                //          Device A syncs at 9 AM - note created at 8 AM would be wrongly
                //          treated as "deleted" because 8 AM < 8:30 AM (cloud's lastSync)
                const internalLastSync = this.syncMetadata.lastSync ? new Date(this.syncMetadata.lastSync).getTime() : null;
                const effectiveLastSync = internalLastSync ? new Date(internalLastSync).toISOString() : null;

                console.log('[GoogleDriveSync] Using device-specific lastSync:', effectiveLastSync);
                console.log('[GoogleDriveSync] This prevents treating offline-created notes as deletions');
                const conflictResult = await this.resolveConflicts(localData, remoteData, options.strategy || 'merge', effectiveLastSync);

                if (conflictResult.resolved) {
                    // Upload merged data with version conflict detection and retry
                    progressCallback({ status: 'uploading', message: 'Uploading merged data...' });
                    console.log('[GoogleDriveSync] Uploading merged data after conflict resolution');

                    // =====================================================
                    // OPTIMISTIC LOCKING: Upload with version check and retry on conflict
                    // =====================================================
                    const maxVersionRetries = 3;
                    let versionRetryCount = 0;
                    let uploadSuccess = false;
                    let currentMergedData = conflictResult.mergedData;
                    let currentRemoteModifiedTime = remoteModifiedTime;

                    while (!uploadSuccess && versionRetryCount < maxVersionRetries) {
                        try {
                            await this.uploadData(currentMergedData, {
                                expectedRemoteModifiedTime: currentRemoteModifiedTime,
                                syncVersion: (remoteData?._syncMeta?.syncVersion || 0) + 1
                            });
                            uploadSuccess = true;
                            console.log('[GoogleDriveSync] Upload successful on attempt', versionRetryCount + 1);

                        } catch (uploadError) {
                            if (uploadError.versionConflict) {
                                versionRetryCount++;
                                console.warn(`[GoogleDriveSync] Version conflict on attempt ${versionRetryCount}, retrying...`);

                                if (versionRetryCount >= maxVersionRetries) {
                                    console.error('[GoogleDriveSync] Max version conflict retries exceeded');
                                    throw new Error('Sync conflict: another device is syncing. Please try again in a few seconds.');
                                }

                                // Exponential backoff before retry
                                const backoffDelay = 1000 * Math.pow(2, versionRetryCount - 1);
                                console.log(`[GoogleDriveSync] Waiting ${backoffDelay}ms before retry...`);
                                await new Promise(resolve => setTimeout(resolve, backoffDelay));

                                // Re-download remote data and re-merge
                                progressCallback({ status: 'resolving_version_conflict', message: 'Another device synced, re-merging...' });

                                // Get new remote modifiedTime
                                const newFileInfo = await this.drive.files.get({
                                    fileId: this.syncMetadata.remoteFileId,
                                    fields: 'modifiedTime'
                                });
                                currentRemoteModifiedTime = newFileInfo.data.modifiedTime;

                                // Re-download and re-merge
                                const newDownloadResult = await this.downloadData();
                                const newRemoteData = newDownloadResult.data;

                                console.log('[GoogleDriveSync] Re-merging with new remote data (syncVersion:', newRemoteData._syncMeta?.syncVersion || 'none', ')');

                                // Re-resolve conflicts with new remote data
                                const newConflictResult = await this.resolveConflicts(localData, newRemoteData, options.strategy || 'merge', effectiveLastSync);
                                currentMergedData = newConflictResult.mergedData;

                            } else {
                                // Non-version-conflict error, propagate
                                throw uploadError;
                            }
                        }
                    }

                    result.action = 'merge';
                    result.mergedData = currentMergedData; // Include merged data in result
                    result.stats.uploaded = 1;
                    result.stats.versionRetries = versionRetryCount;
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
            const t = (key, fallback, params = {}) => window.i18n ? window.i18n.t(key, params) : fallback;

            if (!error) return t('settings.sync.syncFailedUnknown', 'Sync failed due to an unknown error');
            if (error.encryptionRequired) {
                return t('settings.sync.syncFailedEncryptionRequired', 'Cloud data is encrypted. Enter your E2EE passphrase to continue.');
            }

            // Network-related errors
            if (error.message && (
                error.message.includes('Failed to fetch') ||
                error.message.includes('NetworkError') ||
                error.message.includes('ENOTFOUND') ||
                error.message.includes('ETIMEDOUT') ||
                error.message.includes('network')
            )) {
                return t('settings.sync.syncFailedNoInternet', 'No internet connection. Sync requires an active internet connection. Will retry when online.');
            }

            const code = error.code || error.status || '';
            if (code === 404) return t('settings.sync.syncFailedNotFound', 'Remote backup not found on Google Drive.');
            if (code === 401 || code === 403) return t('settings.sync.syncFailedAccessDenied', 'Google Drive access denied. Please reconnect your account in Sync Settings.');
            if (code === 429) return t('settings.sync.syncFailedRateLimit', 'Google Drive rate limit reached. Auto-sync paused temporarily.');
            if (code === 500 || code === 502 || code === 503 || code === 504) {
                return t('settings.sync.syncFailedServiceUnavailable', 'Google Drive service temporarily unavailable. Will retry automatically.');
            }

            return t('settings.sync.syncFailedGeneric', `Sync failed: ${error.message || 'Unexpected error'}`, { error: error.message || 'Unexpected error' });
        } catch (_) {
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            return t('settings.sync.syncFailedUnknown', 'Sync failed due to an unknown error');
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

                    // Check if content actually differs (prevents false overwrites)
                    const contentChanged = JSON.stringify(localNote.content) !== JSON.stringify(remoteNote.content) ||
                        JSON.stringify(localNote.title) !== JSON.stringify(remoteNote.title);

                    // Check if collaboration data differs (important for share revocation)
                    const localCollaboration = localNote.collaboration || {};
                    const remoteCollaboration = remoteNote.collaboration || {};
                    const collaborationChanged = JSON.stringify(localCollaboration.google_drive_file_id) !== JSON.stringify(remoteCollaboration.google_drive_file_id) ||
                        JSON.stringify(localCollaboration.is_shared) !== JSON.stringify(remoteCollaboration.is_shared);

                    if (localModified > remoteModified) {
                        // Local is newer - keep local content but merge collaboration data if remote revoked
                        // This ensures share revocations sync even when local content is newer
                        if (collaborationChanged && remoteCollaboration.google_drive_file_id === null && remoteCollaboration.is_shared === false) {
                            // Remote revoked the share - update collaboration data even though local is newer
                            console.log('[GoogleDriveSync] Merging collaboration revocation from remote (local content is newer):', localNote.title);
                            if (!mergedData.notes[noteId].collaboration) {
                                mergedData.notes[noteId].collaboration = {};
                            }
                            mergedData.notes[noteId].collaboration.is_shared = false;
                            mergedData.notes[noteId].collaboration.google_drive_file_id = null;
                            mergedData.notes[noteId].collaboration.google_drive_share_link = null;
                        }
                        continue;
                    } else if (remoteModified > localModified) {
                        // Remote timestamp is newer, but check for content conflicts
                        if (contentChanged && lastSyncTime) {
                            // Both versions have changes since last sync - potential offline edit conflict
                            const localChangedSinceSync = localModified.getTime() > lastSyncTime;
                            const remoteChangedSinceSync = remoteModified.getTime() > lastSyncTime;

                            if (localChangedSinceSync && remoteChangedSinceSync) {
                                // Both edited since last sync - this is a real conflict
                                console.log('[GoogleDriveSync] Real conflict detected - both devices edited since last sync:', localNote.title);
                                conflicts.push({
                                    type: 'note',
                                    id: noteId,
                                    title: localNote.title,
                                    localModified: localModified,
                                    remoteModified: remoteModified,
                                    reason: 'both_edited_offline'
                                });

                                // For safety, keep local content but merge collaboration data if remote revoked
                                if (collaborationChanged && remoteCollaboration.google_drive_file_id === null && remoteCollaboration.is_shared === false) {
                                    console.log('[GoogleDriveSync] Merging collaboration revocation from remote (content conflict):', localNote.title);
                                    if (!mergedData.notes[noteId].collaboration) {
                                        mergedData.notes[noteId].collaboration = {};
                                    }
                                    mergedData.notes[noteId].collaboration.is_shared = false;
                                    mergedData.notes[noteId].collaboration.google_drive_file_id = null;
                                    mergedData.notes[noteId].collaboration.google_drive_share_link = null;
                                }

                                // Remote version is not lost - it's still in cloud
                                console.log('[GoogleDriveSync] Keeping local version to prevent data loss');
                                continue;
                            }
                        }
                        // Remote is newer and no conflict detected - use remote
                        mergedData.notes[noteId] = remoteNote;
                    } else {
                        // Same modification time - check content
                        if (contentChanged) {
                            console.log('[GoogleDriveSync] Content conflict detected for note:', localNote.title);
                            conflicts.push({
                                type: 'note',
                                id: noteId,
                                title: localNote.title,
                                localModified: localModified,
                                remoteModified: remoteModified,
                                reason: 'same_timestamp_different_content'
                            });

                            // For merge strategy, keep local version but merge collaboration data
                            if (strategy === 'local') {
                                if (collaborationChanged && remoteCollaboration.google_drive_file_id === null && remoteCollaboration.is_shared === false) {
                                    console.log('[GoogleDriveSync] Merging collaboration revocation from remote (same timestamp):', localNote.title);
                                    if (!mergedData.notes[noteId].collaboration) {
                                        mergedData.notes[noteId].collaboration = {};
                                    }
                                    mergedData.notes[noteId].collaboration.is_shared = false;
                                    mergedData.notes[noteId].collaboration.google_drive_file_id = null;
                                    mergedData.notes[noteId].collaboration.google_drive_share_link = null;
                                }
                                continue;
                            } else if (strategy === 'remote') {
                                mergedData.notes[noteId] = remoteNote;
                            }
                            // For 'merge', we keep local as default but merge collaboration
                            if (collaborationChanged && remoteCollaboration.google_drive_file_id === null && remoteCollaboration.is_shared === false) {
                                console.log('[GoogleDriveSync] Merging collaboration revocation from remote (merge strategy):', localNote.title);
                                if (!mergedData.notes[noteId].collaboration) {
                                    mergedData.notes[noteId].collaboration = {};
                                }
                                mergedData.notes[noteId].collaboration.is_shared = false;
                                mergedData.notes[noteId].collaboration.google_drive_file_id = null;
                                mergedData.notes[noteId].collaboration.google_drive_share_link = null;
                            }
                        } else if (collaborationChanged) {
                            // Content is same but collaboration changed - merge collaboration data
                            if (remoteCollaboration.google_drive_file_id === null && remoteCollaboration.is_shared === false) {
                                console.log('[GoogleDriveSync] Merging collaboration revocation from remote (same content):', localNote.title);
                                if (!mergedData.notes[noteId].collaboration) {
                                    mergedData.notes[noteId].collaboration = {};
                                }
                                mergedData.notes[noteId].collaboration.is_shared = false;
                                mergedData.notes[noteId].collaboration.google_drive_file_id = null;
                                mergedData.notes[noteId].collaboration.google_drive_share_link = null;
                            } else if (remoteCollaboration.google_drive_file_id && remoteCollaboration.is_shared) {
                                // Remote shared the note - update collaboration data
                                console.log('[GoogleDriveSync] Merging collaboration share from remote (same content):', localNote.title);
                                if (!mergedData.notes[noteId].collaboration) {
                                    mergedData.notes[noteId].collaboration = {};
                                }
                                mergedData.notes[noteId].collaboration.is_shared = remoteCollaboration.is_shared;
                                mergedData.notes[noteId].collaboration.google_drive_file_id = remoteCollaboration.google_drive_file_id;
                                mergedData.notes[noteId].collaboration.google_drive_share_link = remoteCollaboration.google_drive_share_link;
                            }
                        }
                    }
                }
            }

            // Merge tags - respect local deletions
            // Local tags are the source of truth. We keep all local tags and only add remote tags
            // that don't conflict with local state. This ensures local deletions are preserved.
            if (remoteData.tags) {
                if (!mergedData.tags) {
                    mergedData.tags = {};
                }

                // Get all tag IDs that are currently used in notes (local state)
                const usedTagIds = new Set();
                Object.values(mergedData.notes || {}).forEach(note => {
                    if (note.tags && Array.isArray(note.tags)) {
                        note.tags.forEach(tagId => usedTagIds.add(tagId));
                    }
                });
                if (mergedData.note_tags) {
                    Object.values(mergedData.note_tags).forEach(noteTag => {
                        if (noteTag.tag_id) usedTagIds.add(noteTag.tag_id);
                    });
                }

                // Only add remote tags that are actually used in notes or already exist locally
                // This prevents re-adding tags that were intentionally deleted
                for (const [tagId, remoteTag] of Object.entries(remoteData.tags)) {
                    if (mergedData.tags[tagId] || usedTagIds.has(tagId)) {
                        mergedData.tags[tagId] = remoteTag;
                    }
                }
                console.log('[GoogleDriveSync] Merged tags (respecting local deletions):', Object.keys(mergedData.tags).length);
            }

            // Merge note_tags associations - respect local state
            // Only merge associations for notes that exist in merged data
            if (remoteData.note_tags) {
                if (!mergedData.note_tags) {
                    mergedData.note_tags = {};
                }

                const existingNoteIds = new Set(Object.keys(mergedData.notes || {}));

                // Only add remote note_tags if the note still exists
                for (const [noteTagKey, remoteNoteTag] of Object.entries(remoteData.note_tags)) {
                    if (existingNoteIds.has(remoteNoteTag.note_id)) {
                        // Only add if not already in local or if local doesn't have it
                        if (!mergedData.note_tags[noteTagKey]) {
                            mergedData.note_tags[noteTagKey] = remoteNoteTag;
                        }
                    }
                }
                console.log('[GoogleDriveSync] Merged note_tags (respecting local state):', Object.keys(mergedData.note_tags).length);
            }

            // Merge AI conversations - respect local deletions
            // Local AI conversation state is the source of truth. Only add remote conversations
            // for notes that still exist and if they don't conflict with local deletions.
            if (remoteData.ai_conversations) {
                if (!mergedData.ai_conversations) {
                    mergedData.ai_conversations = {};
                }

                const existingNoteIds = new Set(Object.keys(mergedData.notes || {}));

                // Only add remote conversations if:
                // 1. The conversation doesn't exist locally (new from remote)
                // 2. The associated note still exists
                // This prevents re-adding conversations that were intentionally cleared
                for (const [convId, remoteConv] of Object.entries(remoteData.ai_conversations)) {
                    const noteExists = !remoteConv.note_id || existingNoteIds.has(remoteConv.note_id);
                    if (!mergedData.ai_conversations[convId] && noteExists) {
                        mergedData.ai_conversations[convId] = remoteConv;
                    }
                }
                console.log('[GoogleDriveSync] Merged ai_conversations (respecting local deletions):', Object.keys(mergedData.ai_conversations).length);
            }

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
     * Get or create share folder in Google Drive (for shared note media files)
     */
    async getShareFolderId() {
        try {
            if (this.shareFolderId) {
                return this.shareFolderId;
            }

            // Search for existing share folder in app folder
            const response = await this.drive.files.list({
                q: `name='share' and '${this.appFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive'
            });

            if (response.data.files && response.data.files.length > 0) {
                this.shareFolderId = response.data.files[0].id;
                console.log('[GoogleDriveSync] Found existing share folder:', this.shareFolderId);
            } else {
                // Create share folder
                const folderMetadata = {
                    name: 'share',
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [this.appFolderId]
                };

                const folder = await this.drive.files.create({
                    resource: folderMetadata,
                    fields: 'id'
                });

                this.shareFolderId = folder.data.id;
                console.log('[GoogleDriveSync] Created share folder:', this.shareFolderId);
            }

            return this.shareFolderId;
        } catch (error) {
            console.error('[GoogleDriveSync] Failed to get/create share folder:', error);
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
            // Extract media file IDs from local data to determine what to upload
            const localMediaIds = this.extractMediaFileIds(localData);

            console.log('[GoogleDriveSync] Media sync - Local files:', localMediaIds.size);

            // Get list of remote media files
            let remoteMediaFiles = [];
            try {
                remoteMediaFiles = await this.listMediaFiles();
                console.log('[GoogleDriveSync] Found', remoteMediaFiles.length, 'remote media files');

                // Log remote file details for debugging
                remoteMediaFiles.forEach(file => {
                    console.log(`[GoogleDriveSync] Remote media file: ${file.name} (${file.size} bytes)`);
                });
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
                        let fileExists = false;

                        if (typeof window !== 'undefined' && window.RichMediaManager) {
                            // We're in renderer process - use RichMediaManager
                            try {
                                fileData = await window.RichMediaManager.getMediaFile(fileId);
                                fileExists = true;
                            } catch (error) {
                                console.warn(`[GoogleDriveSync] Media file ${fileId} not found in RichMediaManager:`, error.message);
                                fileExists = false;
                            }
                        } else {
                            // We're in main process - use direct file access
                            const fs = require('fs').promises;
                            const mediaDir = await this.getMediaDirectory();
                            const filePath = `${mediaDir}/${fileName}`;

                            try {
                                await fs.access(filePath);
                                fileData = await fs.readFile(filePath);
                                fileExists = true;
                            } catch (error) {
                                console.warn(`[GoogleDriveSync] Could not read local media file ${fileName}:`, error.message);
                                fileExists = false;
                            }
                        }

                        if (fileExists && fileData) {
                            await this.uploadMediaFile(fileName, fileData);
                            result.uploaded++;
                            console.log('[GoogleDriveSync] Uploaded media file:', fileName);
                        } else {
                            console.log(`[GoogleDriveSync] Skipping upload of ${fileName} - file not found locally`);
                        }
                    } catch (error) {
                        console.error('[GoogleDriveSync] Failed to upload media file:', fileName, error);
                        result.errors.push(`Upload failed for ${fileName}: ${error.message}`);
                    }
                }
            }

            // Download all remote media files that don't exist locally
            for (const file of remoteMediaFiles) {
                const fileName = file.name;
                const fileId = fileName; // File name is the ID in our system

                console.log(`[GoogleDriveSync] Processing remote media file: ${fileName} (${file.size} bytes)`);

                // Check if file exists locally
                let fileExistsLocally = false;

                if (typeof window !== 'undefined' && window.RichMediaManager) {
                    // Renderer process - check if RichMediaManager can access the file
                    try {
                        await window.RichMediaManager.getMediaFile(fileId);
                        fileExistsLocally = true;
                        console.log(`[GoogleDriveSync] File ${fileName} found in RichMediaManager`);
                    } catch (error) {
                        fileExistsLocally = false;
                        console.log(`[GoogleDriveSync] File ${fileName} not found in RichMediaManager`);
                    }
                } else {
                    // Main process - check file system
                    try {
                        const fs = require('fs').promises;
                        const mediaDir = await this.getMediaDirectory();
                        const filePath = `${mediaDir}/${fileName}`;

                        // Check if media directory exists first
                        try {
                            await fs.access(mediaDir);
                        } catch (dirError) {
                            // Media directory doesn't exist yet
                            console.log(`[GoogleDriveSync] Media directory doesn't exist: ${mediaDir}`);
                            fileExistsLocally = false;
                        }

                        if (!fileExistsLocally) {
                            await fs.access(filePath);
                            fileExistsLocally = true;
                            console.log(`[GoogleDriveSync] File ${fileName} found locally at: ${filePath}`);
                        }
                    } catch (error) {
                        // File doesn't exist or other error
                        console.log(`[GoogleDriveSync] Media file ${fileName} not found locally`);
                        fileExistsLocally = false;
                    }
                }

                if (!fileExistsLocally) {
                    try {
                        console.log(`[GoogleDriveSync] File ${fileName} not found locally, downloading...`);
                        // Download the file
                        const fileData = await this.downloadMediaFile(file.id);

                        // Save to local storage
                        if (isMainProcess) {
                            // Main process - save directly to file system
                            const fs = require('fs').promises;
                            const mediaDir = await this.getMediaDirectory();
                            const filePath = `${mediaDir}/${fileName}`;

                            // Ensure media directory exists
                            try {
                                await fs.mkdir(mediaDir, { recursive: true });
                                console.log(`[GoogleDriveSync] Created media directory: ${mediaDir}`);
                            } catch (error) {
                                // Directory might already exist, that's fine
                                console.log(`[GoogleDriveSync] Media directory already exists or created: ${mediaDir}`);
                            }

                            await fs.writeFile(filePath, fileData);
                            console.log(`[GoogleDriveSync] Saved downloaded media file to: ${filePath}`);

                            // Register the file for cognotez-media:// access
                            this.registerDownloadedMediaFile(fileId, fileName, fileData.byteLength || fileData.length);
                        } else {
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
                        }

                        result.downloaded++;
                        console.log(`[GoogleDriveSync] Downloaded media file: ${fileName} (${fileData.byteLength || fileData.length} bytes)`);
                    } catch (error) {
                        console.error('[GoogleDriveSync] Failed to download media file:', fileName, error);
                        result.errors.push(`Download failed for ${fileName}: ${error.message}`);
                    }
                } else {
                    console.log(`[GoogleDriveSync] File ${fileName} already exists locally, skipping download`);
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

    /**
     * Register downloaded media file for cognotez-media:// access (main process)
     * @param {string} fileId - Media file ID
     * @param {string} fileName - Media file name
     * @param {number} fileSize - Media file size
     */
    registerDownloadedMediaFile(fileId, fileName, fileSize) {
        // In main process, we need to ensure the file is tracked for the renderer process
        // For now, we'll log this and rely on the renderer to discover the file
        console.log(`[GoogleDriveSync] Registered downloaded media file for renderer access: ${fileId} (${fileSize} bytes)`);

        // The renderer process will discover this file when it tries to access it via cognotez-media://
        // The RichMediaManager will handle the file discovery automatically
    }

    // ============================================================
    // PHASE 1: COLLABORATION FEATURES - NOTE SHARING
    // ============================================================

    /**
     * Share a note on Google Drive with specific permissions
     * @param {Object} note - Note object to share
     * @param {Object} permissions - Sharing permissions { view: true, comment: false, edit: false }
     * @param {string} email - Email address to share with (optional, for direct sharing)
     * @returns {Object} Share result with fileId and shareLink
     */
    async shareNoteOnDrive(note, permissions = { view: true, comment: false, edit: false }, email = null) {
        try {
            await this.ensureInitialized();

            if (!this.drive || !this.appFolderId) {
                throw new Error('Drive API not initialized');
            }

            // Check if note is already shared and update existing file
            let fileId = null;
            let isUpdate = false;

            if (note.collaboration && note.collaboration.google_drive_file_id) {
                fileId = note.collaboration.google_drive_file_id;
                isUpdate = true;
                console.log('[GoogleDriveSync] Updating existing shared note:', fileId);
            }

            // Extract media file IDs from note content and upload them
            const mediaUrlPattern = /cognotez-media:\/\/([a-z0-9]+)/gi;
            const mediaMatches = note.content ? note.content.match(mediaUrlPattern) : [];
            const mediaFileMap = new Map(); // Maps cognotez-media:// URLs to Google Drive URLs

            if (mediaMatches && mediaMatches.length > 0) {
                console.log(`[GoogleDriveSync] Found ${mediaMatches.length} media files to upload`);

                for (const mediaUrl of mediaMatches) {
                    const mediaFileId = mediaUrl.replace('cognotez-media://', '');

                    try {
                        // Read media file from filesystem
                        let fileData = null;
                        let fileName = mediaFileId;
                        let mimeType = 'application/octet-stream';

                        if (typeof window !== 'undefined' && window.RichMediaManager) {
                            // Renderer process - use RichMediaManager
                            const mediaRef = await window.RichMediaManager.getMediaReference(mediaFileId);
                            if (mediaRef) {
                                fileName = mediaRef.name || mediaFileId;
                                mimeType = mediaRef.type || 'application/octet-stream';

                                if (mediaRef.storageType === 'filesystem' && mediaRef.path) {
                                    const electron = require('electron');
                                    const fileDataObj = await electron.ipcRenderer.invoke('get-media-file', mediaRef.path);
                                    fileData = fileDataObj.data;
                                } else if (mediaRef.storageType === 'indexeddb') {
                                    const fileDataObj = await window.RichMediaManager.getMediaFile(mediaFileId);
                                    fileData = fileDataObj ? fileDataObj.data : null;
                                }
                            }
                        } else {
                            // Main process - use direct file access
                            const mediaDir = await this.getMediaDirectory();

                            // Try to find the file (could have extension)
                            try {
                                const files = await fs.readdir(mediaDir);
                                const matchingFile = files.find(file => file.startsWith(mediaFileId));

                                if (matchingFile) {
                                    const filePath = path.join(mediaDir, matchingFile);
                                    fileData = await fs.readFile(filePath);
                                    fileName = matchingFile;

                                    // Try to determine MIME type from extension
                                    const ext = path.extname(matchingFile).toLowerCase();
                                    const mimeTypes = {
                                        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                                        '.png': 'image/png', '.gif': 'image/gif',
                                        '.webp': 'image/webp', '.svg': 'image/svg+xml',
                                        '.mp4': 'video/mp4', '.webm': 'video/webm',
                                        '.mp3': 'audio/mpeg', '.wav': 'audio/wav'
                                    };
                                    if (mimeTypes[ext]) {
                                        mimeType = mimeTypes[ext];
                                    }
                                }
                            } catch (error) {
                                console.warn(`[GoogleDriveSync] Could not read media file ${mediaFileId}:`, error.message);
                            }
                        }

                        if (fileData) {
                            // Upload media file to Google Drive in the share folder
                            const shareFolderId = await this.getShareFolderId();

                            // Check if media file already exists in Drive share folder
                            const existingMedia = await this.drive.files.list({
                                q: `name='${fileName}' and '${shareFolderId}' in parents and trashed=false`,
                                fields: 'files(id, webContentLink)',
                                spaces: 'drive'
                            });

                            let mediaDriveFileId;
                            let mediaDriveUrl;

                            if (existingMedia.data.files && existingMedia.data.files.length > 0) {
                                // File exists - update it
                                mediaDriveFileId = existingMedia.data.files[0].id;
                                const { Readable } = require('stream');
                                const bufferStream = Readable.from(fileData);

                                await this.drive.files.update({
                                    fileId: mediaDriveFileId,
                                    media: {
                                        mimeType: mimeType,
                                        body: bufferStream
                                    },
                                    fields: 'id,webContentLink'
                                });

                                // Get updated file info
                                const updatedFile = await this.drive.files.get({
                                    fileId: mediaDriveFileId,
                                    fields: 'webContentLink'
                                });
                                mediaDriveUrl = updatedFile.data.webContentLink;

                                console.log(`[GoogleDriveSync] Updated media file: ${fileName}`);
                            } else {
                                // Create new file
                                const { Readable } = require('stream');
                                const bufferStream = Readable.from(fileData);

                                const mediaFileMetadata = {
                                    name: fileName,
                                    parents: [shareFolderId],
                                    description: `Media file from shared note: ${note.title}`
                                };

                                const createResponse = await this.drive.files.create({
                                    resource: mediaFileMetadata,
                                    media: {
                                        mimeType: mimeType,
                                        body: bufferStream
                                    },
                                    fields: 'id,webContentLink'
                                });

                                mediaDriveFileId = createResponse.data.id;
                                mediaDriveUrl = createResponse.data.webContentLink;

                                // Make media file accessible to anyone with the link (same permissions as note)
                                await this.drive.permissions.create({
                                    fileId: mediaDriveFileId,
                                    requestBody: {
                                        role: 'reader',
                                        type: 'anyone'
                                    }
                                });

                                console.log(`[GoogleDriveSync] Uploaded media file: ${fileName}`);
                            }

                            // Map the cognotez-media URL to the Google Drive URL
                            mediaFileMap.set(mediaUrl, mediaDriveUrl);
                        } else {
                            console.warn(`[GoogleDriveSync] Media file ${mediaFileId} not found, skipping upload`);
                        }
                    } catch (error) {
                        console.error(`[GoogleDriveSync] Failed to upload media file ${mediaFileId}:`, error);
                        // Continue with other media files even if one fails
                    }
                }
            }

            // Format note as markdown text and replace media URLs
            let noteContent = `# ${note.title}\n\n`;
            if (note.tags && note.tags.length > 0) {
                // Convert tag IDs to tag names
                const tagNames = [];
                for (const tagId of note.tags) {
                    let tagName = tagId; // Fallback to ID if name not found

                    // Try to get tag name from database (main process)
                    if (typeof global !== 'undefined' && global.databaseManager && global.databaseManager.data && global.databaseManager.data.tags) {
                        const tag = global.databaseManager.data.tags[tagId];
                        if (tag && tag.name) {
                            tagName = tag.name;
                        }
                    }

                    tagNames.push(tagName);
                }
                noteContent += `**Tags:** ${tagNames.join(', ')}\n\n`;
            }
            noteContent += `**Created:** ${new Date(note.created_at).toLocaleString()}\n`;
            noteContent += `**Last Updated:** ${new Date(note.updated_at).toLocaleString()}\n\n`;
            noteContent += `---\n\n`;

            // Replace cognotez-media:// URLs with Google Drive URLs
            let processedContent = note.content || '';
            for (const [cognotezUrl, driveUrl] of mediaFileMap.entries()) {
                processedContent = processedContent.replace(new RegExp(cognotezUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), driveUrl);
            }

            noteContent += processedContent;

            const fileName = `${note.title.replace(/[^a-zA-Z0-9\s]/g, '_').substring(0, 50)}.md`;

            const media = {
                mimeType: 'text/markdown',
                body: noteContent
            };

            let response;

            // Get share folder ID for placing the note file
            const shareFolderId = await this.getShareFolderId();

            if (isUpdate) {
                // Update existing file
                const updateMetadata = {
                    name: fileName,
                    description: `Shared note: ${note.title}`
                };

                // Check if file is already in the share folder, if not, move it
                try {
                    const fileInfo = await this.drive.files.get({
                        fileId: fileId,
                        fields: 'parents'
                    });

                    const currentParents = fileInfo.data.parents || [];
                    const isInShareFolder = currentParents.includes(shareFolderId);

                    if (!isInShareFolder) {
                        // Move file to share folder
                        // Remove old parent and add share folder as parent
                        const previousParent = currentParents[0];
                        await this.drive.files.update({
                            fileId: fileId,
                            addParents: shareFolderId,
                            removeParents: previousParent,
                            fields: 'id'
                        });
                        console.log('[GoogleDriveSync] Moved shared note to share folder');
                    }
                } catch (error) {
                    console.warn('[GoogleDriveSync] Could not check/move file to share folder:', error.message);
                    // Continue with update even if move fails
                }

                response = await this.drive.files.update({
                    fileId: fileId,
                    resource: updateMetadata,
                    media: media,
                    fields: 'id,webViewLink,webContentLink'
                });
            } else {
                // Create new file in share folder
                const fileMetadata = {
                    name: fileName,
                    parents: [shareFolderId],
                    description: `Shared note: ${note.title}`
                };

                response = await this.drive.files.create({
                    resource: fileMetadata,
                    media: media,
                    fields: 'id,webViewLink,webContentLink'
                });

                fileId = response.data.id;
            }

            // Set sharing permissions (only if creating new file)
            if (!isUpdate) {
                if (email) {
                    // Share with specific email
                    await this.drive.permissions.create({
                        fileId: fileId,
                        requestBody: {
                            role: permissions.edit ? 'writer' : (permissions.comment ? 'commenter' : 'reader'),
                            type: 'user',
                            emailAddress: email
                        }
                    });
                } else {
                    // Make file accessible to anyone with the link
                    await this.drive.permissions.create({
                        fileId: fileId,
                        requestBody: {
                            role: permissions.edit ? 'writer' : (permissions.comment ? 'commenter' : 'reader'),
                            type: 'anyone'
                        }
                    });
                }
            }

            // Get shareable link
            const shareLink = response.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

            console.log('[GoogleDriveSync] Note shared successfully:', {
                noteId: note.id,
                fileId: fileId,
                shareLink: shareLink,
                isUpdate: isUpdate,
                mediaFilesUploaded: mediaFileMap.size
            });

            return {
                success: true,
                fileId: fileId,
                shareLink: shareLink,
                permissions: permissions,
                isUpdate: isUpdate,
                mediaFilesUploaded: mediaFileMap.size
            };

        } catch (error) {
            console.error('[GoogleDriveSync] Failed to share note:', error);
            throw error;
        }
    }

    /**
     * Update sharing permissions for a shared note
     * @param {string} fileId - Google Drive file ID
     * @param {Object} permissions - New permissions
     * @param {string} email - Email address (optional)
     */
    async updateNoteSharingPermissions(fileId, permissions, email = null) {
        try {
            await this.ensureInitialized();

            if (!this.drive) {
                throw new Error('Drive API not initialized');
            }

            // List existing permissions
            const existingPermissions = await this.drive.permissions.list({
                fileId: fileId,
                fields: 'permissions(id,type,emailAddress,role)'
            });

            // Update or create permission
            const role = permissions.edit ? 'writer' : (permissions.comment ? 'commenter' : 'reader');

            if (email) {
                // Find existing permission for this email
                const existingPerm = existingPermissions.data.permissions.find(
                    p => p.type === 'user' && p.emailAddress === email
                );

                if (existingPerm) {
                    // Update existing permission
                    await this.drive.permissions.update({
                        fileId: fileId,
                        permissionId: existingPerm.id,
                        requestBody: {
                            role: role
                        }
                    });
                } else {
                    // Create new permission
                    await this.drive.permissions.create({
                        fileId: fileId,
                        requestBody: {
                            role: role,
                            type: 'user',
                            emailAddress: email
                        }
                    });
                }
            } else {
                // Update 'anyone' permission
                const anyonePerm = existingPermissions.data.permissions.find(
                    p => p.type === 'anyone'
                );

                if (anyonePerm) {
                    await this.drive.permissions.update({
                        fileId: fileId,
                        permissionId: anyonePerm.id,
                        requestBody: {
                            role: role
                        }
                    });
                }
            }

            console.log('[GoogleDriveSync] Sharing permissions updated:', fileId);
            return true;

        } catch (error) {
            console.error('[GoogleDriveSync] Failed to update sharing permissions:', error);
            throw error;
        }
    }

    /**
     * Stop sharing a note (delete the file from Google Drive)
     * @param {string} fileId - Google Drive file ID
     * @param {Object} note - Optional note object to extract media files from
     */
    async stopSharingNote(fileId, note = null) {
        try {
            await this.ensureInitialized();

            if (!this.drive) {
                throw new Error('Drive API not initialized');
            }

            // Extract and delete media files if note is provided
            if (note && note.content) {
                const mediaUrlPattern = /cognotez-media:\/\/([a-z0-9]+)/gi;
                const mediaMatches = note.content.match(mediaUrlPattern);

                if (mediaMatches && mediaMatches.length > 0) {
                    console.log(`[GoogleDriveSync] Found ${mediaMatches.length} media files to delete`);

                    const shareFolderId = await this.getShareFolderId();
                    const mediaFileIds = new Set();

                    // Extract unique media file IDs
                    for (const mediaUrl of mediaMatches) {
                        const mediaFileId = mediaUrl.replace('cognotez-media://', '');
                        mediaFileIds.add(mediaFileId);
                    }

                    // Get list of files in share folder
                    const shareFiles = await this.drive.files.list({
                        q: `'${shareFolderId}' in parents and trashed=false`,
                        fields: 'files(id, name)',
                        spaces: 'drive'
                    });

                    // Find and delete matching media files
                    let deletedCount = 0;
                    for (const file of shareFiles.data.files || []) {
                        // Check if file name starts with any of the media file IDs
                        // Files are stored as "fileId" or "fileId.extension"
                        const matchesMediaId = Array.from(mediaFileIds).some(id =>
                            file.name === id || file.name.startsWith(id + '.')
                        );

                        if (matchesMediaId) {
                            try {
                                await this.drive.files.delete({
                                    fileId: file.id
                                });
                                deletedCount++;
                                console.log(`[GoogleDriveSync] Deleted media file: ${file.name}`);
                            } catch (error) {
                                // If file doesn't exist (404), that's okay - continue
                                if (error.code !== 404 && (!error.response || error.response.status !== 404)) {
                                    console.warn(`[GoogleDriveSync] Failed to delete media file ${file.name}:`, error.message);
                                }
                            }
                        }
                    }

                    console.log(`[GoogleDriveSync] Deleted ${deletedCount} media files from share folder`);
                }
            }

            // Delete the note file from Google Drive
            await this.drive.files.delete({
                fileId: fileId
            });

            console.log('[GoogleDriveSync] Shared note deleted:', fileId);
            return true;

        } catch (error) {
            // If file doesn't exist (404), treat it as already revoked
            // This can happen when the file was already deleted on another device
            if (error.code === 404 || (error.response && error.response.status === 404)) {
                console.log('[GoogleDriveSync] File already deleted (likely revoked on another device):', fileId);
                return true; // Return success since the goal (file not shared) is already achieved
            }

            console.error('[GoogleDriveSync] Failed to delete shared note:', error);
            throw error;
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
