const { app, BrowserWindow, Menu, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { autoUpdater } = require('electron-updater');

// Keep a global reference of the window object
let mainWindow;
// App-level quit guards for sync-before-exit
let isQuittingAfterSync = false;
let appQuittingRequested = false;

// Log version information for debugging
console.log('Node.js version:', process.version);
console.log('Electron version:', process.versions.electron);
console.log('Chrome version:', process.versions.chrome);

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets', 'icon.svg'),
    titleBarStyle: 'default',
    show: false // Don't show until ready
  });

  // Load the app
  mainWindow.loadFile('src/index.html');

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Handle window close event to sync before closing if auto-sync is enabled
  let isClosingWithSync = false;
  mainWindow.on('close', async (event) => {
    try {
      // If app quit has already been requested and handled at app-level, allow close
      if (appQuittingRequested || isQuittingAfterSync) {
        return;
      }
      // Check if auto-sync is enabled and we should sync before closing
      if (global.databaseManager && global.databaseManager.isAutoSyncEnabled() && !isClosingWithSync) {
        console.log('[Main] Auto-sync enabled, syncing before closing...');

        // Prevent the window from closing immediately
        event.preventDefault();
        isClosingWithSync = true;

        try {
          // Trigger sync
          await performSyncBeforeClose();

          // After sync completes, close the window
          console.log('[Main] Sync completed, closing window...');
          mainWindow.destroy();
        } catch (error) {
          console.error('[Main] Sync failed before close, proceeding with close anyway:', error);
          // Even if sync fails, allow the window to close
          mainWindow.destroy();
        }
      }
    } catch (error) {
      console.error('[Main] Error during close event handling:', error);
      // Always allow the window to close if there's an error
      mainWindow.destroy();
    }
  });

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Configure auto-updater
function setupAutoUpdater() {
  try {
    // Configure auto-updater for GitHub releases
    autoUpdater.autoDownload = false; // Don't download automatically, let user choose

    // Auto-updater event handlers
    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for update...');
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-checking');
      }
    });

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info.version);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-available', info);
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('Update not available. Current version:', info.version);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-not-available', info);
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('Update error:', err);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-error', err.message);
      }
    });

    autoUpdater.on('download-progress', (progressObj) => {
      let log_message = "Download speed: " + progressObj.bytesPerSecond;
      log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
      log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
      console.log(log_message);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('download-progress', progressObj);
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info.version);
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('update-downloaded', info);
      }

      // Show dialog asking user to restart
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Update Ready',
          message: 'A new version has been downloaded. Restart the application to apply the update?',
          buttons: ['Restart', 'Later']
        }).then((result) => {
          if (result.response === 0) {
            autoUpdater.quitAndInstall();
          }
        });
      }
    });

    // Check for updates (only in production)
    if (process.env.NODE_ENV !== 'development') {
      setTimeout(() => {
        autoUpdater.checkForUpdates();
      }, 3000); // Wait 3 seconds after app start
    }
  } catch (error) {
    console.warn('Auto-updater setup failed:', error.message);
  }
}

// Function to perform sync before closing the application
async function performSyncBeforeClose() {
  try {
    // Check if Google Drive is authenticated
    if (!global.googleAuthManager || !global.googleAuthManager.isAuthenticated) {
      console.log('[Main] Google Drive not authenticated, skipping sync before close');
      return;
    }

    // Initialize Google Drive sync manager if not already done
    if (!global.googleDriveSyncManager) {
      const { GoogleDriveSyncManager } = require('./src/js/google-drive-sync.js');
      const encryptionSettings = global.databaseManager ? global.databaseManager.getEncryptionSettings() : null;
      global.googleDriveSyncManager = new GoogleDriveSyncManager(global.googleAuthManager, encryptionSettings);
    }

    // Check if sync is already in progress
    if (global.googleDriveSyncManager.syncInProgress) {
      console.log('[Main] Sync already in progress, waiting for it to complete...');
      // Wait for the existing sync to complete (with a timeout)
      let attempts = 0;
      while (global.googleDriveSyncManager.syncInProgress && attempts < 60) { // Wait up to 30 seconds
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }

      if (global.googleDriveSyncManager.syncInProgress) {
        console.warn('[Main] Sync still in progress after timeout, proceeding with close');
        return; // Don't start another sync
      }
    }

    // Get local data for sync
    if (!global.databaseManager) {
      throw new Error('Database manager not available');
    }

    const localData = global.databaseManager.exportDataForSync();
    const dbSyncMeta = global.databaseManager.getSyncMetadata();
    const lastSyncToUse = dbSyncMeta && dbSyncMeta.lastSync ? dbSyncMeta.lastSync : null;

    console.log('[Main] Performing sync before close...');

    // Show sync progress to user (if mainWindow still exists)
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('sync-status-update', {
        inProgress: true,
        message: 'Syncing before closing...'
      });
    }

    // Perform sync operation
    const syncResult = await global.googleDriveSyncManager.sync({
      localData: localData.data,
      strategy: 'merge',
      lastSync: lastSyncToUse
    });

    // Update sync status
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('sync-status-update', {
        inProgress: false,
        message: syncResult.success ? 'Sync completed' : 'Sync failed'
      });
    }

    if (syncResult.success) {
      // Update sync metadata in database
      global.databaseManager.updateSyncMetadata({
        lastSync: new Date().toISOString(),
        lastSyncVersion: localData.data.metadata.version,
        localChecksum: localData.checksum
      });

      // Note: The sync manager already handles downloading and applying data
      // for 'download' and 'merge' actions, so no additional import is needed here

      console.log('[Main] Sync before close completed successfully');
    } else {
      throw new Error(syncResult.error || 'Sync failed');
    }

  } catch (error) {
    console.error('[Main] Sync before close failed:', error);
    throw error;
  }
}

// Register custom protocol for media files
function registerMediaProtocol() {
  protocol.registerFileProtocol('cognotez-media', async (request, callback) => {
    try {
      const fileId = request.url.replace('cognotez-media://', '');
      const mediaDir = path.join(app.getPath('userData'), 'media');
      
      // Find file with this ID (could have any extension)
      const files = await fs.readdir(mediaDir);
      const matchingFile = files.find(file => file.startsWith(fileId));
      
      if (matchingFile) {
        const filePath = path.join(mediaDir, matchingFile);
        callback({ path: filePath });
      } else {
        console.error('[Media Protocol] File not found:', fileId);
        callback({ error: -6 }); // FILE_NOT_FOUND
      }
    } catch (error) {
      console.error('[Media Protocol] Error:', error);
      callback({ error: -2 }); // FAILED
    }
  });
  
  console.log('[Media Protocol] Registered cognotez-media:// protocol');
}

// This method will be called when Electron has finished initialization
async function initApp() {
  // Register custom protocol for media files
  registerMediaProtocol();
  
  createWindow();
  setupAutoUpdater();
  createMenu();

  // Initialize database manager for Google Drive sync
  try {
    console.log('[Main] Initializing database manager for sync...');
    const { DatabaseManager } = require('./src/js/database.js');
    global.databaseManager = new DatabaseManager();
    await global.databaseManager.initialize();
    console.log('[Main] Database manager initialized successfully');
  } catch (error) {
    console.error('[Main] Failed to initialize database manager:', error);
    // Continue without database - sync features will be disabled
  }

  // Initialize Google Auth Manager to ensure OAuth credentials are available on startup
  try {
    console.log('[Main] Initializing Google Auth Manager...');
    const { GoogleAuthManager } = require('./src/js/google-auth.js');
    global.googleAuthManager = new GoogleAuthManager();
    await global.googleAuthManager.initialize();
    console.log('[Main] Google Auth Manager initialized successfully');
  } catch (error) {
    console.error('[Main] Failed to initialize Google Auth Manager:', error);
    // Continue without Google Auth - OAuth features will be disabled
  }
}

// Initialize app when ready
if (app) {
  app.on('ready', initApp);

  // Ensure sync runs before the app quits (menu, Ctrl+Q, OS signals)
  app.on('before-quit', async (event) => {
    try {
      // Prevent re-entry
      if (isQuittingAfterSync) return;

      appQuittingRequested = true;

      // If auto-sync not enabled or preconditions missing, allow quit
      if (!global.databaseManager || !global.databaseManager.isAutoSyncEnabled()) {
        return;
      }

      // If a sync is already running, wait briefly for it to finish
      if (global.googleDriveSyncManager && global.googleDriveSyncManager.syncInProgress) {
        let attempts = 0;
        while (global.googleDriveSyncManager.syncInProgress && attempts < 60) { // up to ~30s
          event.preventDefault();
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        if (!global.googleDriveSyncManager.syncInProgress) {
          return; // existing sync finished; let quit proceed
        }
      }

      // We will perform a quick sync before quitting
      event.preventDefault();
      console.log('[Main] Running sync before app quit...');
      try {
        await performSyncBeforeClose();
      } catch (e) {
        console.warn('[Main] Sync before quit failed, proceeding anyway:', e.message);
      }
      isQuittingAfterSync = true;
      app.quit();
    } catch (error) {
      console.error('[Main] Error in before-quit handler:', error);
      // Fail-open: proceed with quit
    }
  });

  // On macOS, re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Quit when all windows are closed, except on macOS
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
} else {
  console.error('Electron app not available');
}

// IPC handlers for main process communication
if (ipcMain) {
  ipcMain.handle('get-app-path', () => {
    return app.getPath('userData');
  });

  ipcMain.handle('show-save-dialog', async (event, options) => {
    return await dialog.showSaveDialog(mainWindow, options);
  });

  ipcMain.handle('show-open-dialog', async (event, options) => {
    return await dialog.showOpenDialog(mainWindow, options);
  });

  // Encryption IPC handlers
  ipcMain.handle('derive-salt-from-passphrase', async (event, passphrase) => {
    try {
      const encryptionManager = require('./src/js/encryption');

      if (!passphrase) {
        throw new Error('Passphrase is required');
      }

      const saltBase64 = encryptionManager.deriveSaltFromPassphrase(passphrase);
      return {
        success: true,
        saltBase64: saltBase64
      };
    } catch (error) {
      console.error('Failed to derive salt from passphrase:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-encryption-settings', async () => {
    try {
      if (!global.databaseManager) {
        throw new Error('Database manager not available');
      }

      const settings = global.databaseManager.getEncryptionSettings();
      return {
        success: true,
        settings: settings
      };
    } catch (error) {
      console.error('Failed to get encryption settings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('set-encryption-settings', async (event, settings) => {
    try {
      console.log('[Main] Received encryption settings:', {
        enabled: settings.enabled,
        hasPassphrase: !!settings.passphrase,
        hasSalt: !!settings.saltBase64,
        iterations: settings.iterations
      });

      if (!global.databaseManager) {
        throw new Error('Database manager not available');
      }

      global.databaseManager.setEncryptionSettings(settings);

      // Update encryption settings in sync manager if it exists
      if (global.googleDriveSyncManager) {
        global.googleDriveSyncManager.updateEncryptionSettings(global.databaseManager.getEncryptionSettings());
      }

      // Send updated settings to renderer process
      const updatedSettings = global.databaseManager.getEncryptionSettings();
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('encryption-settings-updated', updatedSettings);
      }

      return {
        success: true,
        settings: updatedSettings
      };
    } catch (error) {
      console.error('Failed to set encryption settings:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('validate-encryption-settings', async (event, settings) => {
    try {
      const encryptionManager = require('./src/js/encryption');

      const validation = encryptionManager.validateSettings(settings);

      return {
        success: true,
        isValid: validation.isValid,
        errors: validation.errors
      };
    } catch (error) {
      console.error('Failed to validate encryption settings:', error);
      return { success: false, error: error.message };
    }
  });

  // Set a temporary passphrase for decrypting cloud data during this session only
  ipcMain.handle('set-sync-decryption-passphrase', async (event, payload) => {
    try {
      const { passphrase, saltBase64, iterations } = payload || {};
      if (!passphrase || !saltBase64) {
        throw new Error('Passphrase and salt are required');
      }

      // Ensure auth exists
      if (!global.googleAuthManager || !global.googleAuthManager.isAuthenticated) {
        throw new Error('Not authenticated with Google Drive');
      }

      // Ensure sync manager exists
      if (!global.googleDriveSyncManager) {
        const { GoogleDriveSyncManager } = require('./src/js/google-drive-sync.js');
        const dbSettings = global.databaseManager ? global.databaseManager.getEncryptionSettings() : null;
        global.googleDriveSyncManager = new GoogleDriveSyncManager(global.googleAuthManager, dbSettings);
      }

      // Use DB enabled flag to avoid turning on encryption for uploads
      const dbEnc = global.databaseManager ? global.databaseManager.getEncryptionSettings() : { enabled: false, iterations: 210000 };

      global.googleDriveSyncManager.updateEncryptionSettings({
        enabled: dbEnc.enabled === true, // do not change enablement here
        passphrase: passphrase,
        saltBase64: saltBase64,
        iterations: iterations || dbEnc.iterations || 210000
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to set session passphrase for sync:', error);
      return { success: false, error: error.message };
    }
  });

  // Auto-updater IPC handlers
  ipcMain.handle('check-for-updates', () => {
    autoUpdater.checkForUpdates();
  });

  ipcMain.handle('download-update', () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.handle('quit-and-install', () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  // Google Drive sync IPC handlers
  ipcMain.handle('google-drive-authenticate', async () => {
    try {
      // Lazy load Google Auth Manager to avoid issues if not used
      if (!global.googleAuthManager) {
        const { GoogleAuthManager } = require('./src/js/google-auth.js');
        global.googleAuthManager = new GoogleAuthManager();
      }

      const authResult = await global.googleAuthManager.authenticate();

      if (authResult.needsAuth) {
        // Open browser window for authentication
        const authWindow = new BrowserWindow({
          width: 800,
          height: 600,
          parent: mainWindow,
          modal: true,
          show: false,
          title: 'Google Drive Authentication',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
          }
        });

        authWindow.loadURL(authResult.authUrl);
        authWindow.once('ready-to-show', () => {
          authWindow.show();
        });

        return new Promise((resolve, reject) => {
          let handled = false;

          const tryHandleAuthCallbackFromUrl = async (url, preventDefault) => {
            if (handled) return;
            try {
              const isCallback = url.includes('code=') && (url.includes('localhost') || url.includes('127.0.0.1'));
              if (!isCallback) return;
              if (preventDefault && typeof preventDefault === 'function') preventDefault();

              const urlObj = new URL(url);
              const code = urlObj.searchParams.get('code');
              if (!code) return;

              handled = true;
              await global.googleAuthManager.handleAuthCallback(code);
              authWindow.close();
              if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.send('google-drive-auth-success', { message: 'Successfully connected to Google Drive!' });
              }
              resolve({ success: true, message: 'Authentication successful' });
            } catch (error) {
              handled = true;
              try { authWindow.close(); } catch (_) {}
              reject({ success: false, error: error.message });
            }
          };

          // Listen for navigation to callback URL
          authWindow.webContents.on('will-navigate', async (event, url) => {
            tryHandleAuthCallbackFromUrl(url, () => event.preventDefault());
          });

          // Also listen for did-navigate events in case will-navigate doesn't catch it
          authWindow.webContents.on('did-navigate', async (event, url) => {
            tryHandleAuthCallbackFromUrl(url);
          });

          // Handle explicit redirect events (helps on Windows)
          authWindow.webContents.on('will-redirect', async (event, url) => {
            tryHandleAuthCallbackFromUrl(url, () => event.preventDefault());
          });

          // Fallback for older Electron redirect event
          authWindow.webContents.on('did-get-redirect-request', async (event, oldUrl, newUrl /*, isMainFrame, httpResponseCode, requestMethod, referrer, headers */) => {
            tryHandleAuthCallbackFromUrl(newUrl, () => event.preventDefault && event.preventDefault());
          });

          // Handle window close without completing auth
          authWindow.on('closed', () => {
            if (!handled) {
              reject({ success: false, error: 'Authentication cancelled' });
            }
          });
        });
      } else {
        return { success: true, message: 'Already authenticated' };
      }
    } catch (error) {
      console.error('Google Drive authentication failed:', error);

      // Enhance error message for access_denied errors
      let enhancedErrorMessage = error.message;
      if (error.message.includes('access_denied') || error.message.includes('403')) {
        enhancedErrorMessage = 'Google Drive access denied. Your email needs to be added as a test user in Google Cloud Console → OAuth consent screen → Audience → Test users → ADD USERS.';
      }

      // Notify frontend of the error
      mainWindow.webContents.send('google-drive-auth-error', {
        error: enhancedErrorMessage,
        details: error.stack
      });

      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('google-drive-get-auth-status', async () => {
    try {
      if (!global.googleAuthManager) {
        return { isAuthenticated: false };
      }

      const status = await global.googleAuthManager.getAuthStatus();
      return status;
    } catch (error) {
      console.error('Failed to get auth status:', error);
      return { isAuthenticated: false, error: error.message };
    }
  });

  ipcMain.handle('google-drive-disconnect', async () => {
    try {
      if (global.googleAuthManager) {
        await global.googleAuthManager.disconnect();
      }

      // Also disable sync in database
      if (global.databaseManager) {
        global.databaseManager.disableSync();
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to disconnect Google Drive:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('google-drive-sync', async (event, options = {}) => {
    try {
      if (!global.googleAuthManager || !global.googleAuthManager.isAuthenticated) {
        throw new Error('Not authenticated with Google Drive');
      }

      if (!global.googleDriveSyncManager) {
        const { GoogleDriveSyncManager } = require('./src/js/google-drive-sync.js');
        const encryptionSettings = global.databaseManager ? global.databaseManager.getEncryptionSettings() : null;
        global.googleDriveSyncManager = new GoogleDriveSyncManager(global.googleAuthManager, encryptionSettings);
      }

      // Get local data - use provided data or fallback to database manager
      let localData;
      if (options.localData) {
        console.log('[Sync] Using provided localData from renderer process');
        localData = {
          data: options.localData,
          checksum: options.localChecksum
        };
      } else {
        if (!global.databaseManager) {
          throw new Error('Database manager not available');
        }
        localData = global.databaseManager.exportDataForSync();
      }

      // Perform sync - use lastSync from renderer if provided, otherwise from main process DB
      const dbSyncMeta = global.databaseManager ? global.databaseManager.getSyncMetadata() : {};
      const lastSyncToUse = options.lastSync || (dbSyncMeta && dbSyncMeta.lastSync ? dbSyncMeta.lastSync : null);
      console.log('[Sync] Using lastSync:', lastSyncToUse);
      let syncResult;
      try {
        syncResult = await global.googleDriveSyncManager.sync({
          localData: localData.data,
          strategy: options.strategy || 'merge',
          lastSync: lastSyncToUse
        });
      } catch (error) {
        if (error && error.encryptionRequired) {
          // Notify renderer that remote data is encrypted and passphrase is required
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('sync-requires-passphrase', {
              message: 'Cloud data is encrypted. Enter your E2EE passphrase to continue.'
            });
          }
          // Stop sync and do not upload local data
          return { success: false, error: error.message, encryptionRequired: true };
        }
        // Improve generic error messaging back to renderer
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('sync-completed', {
            success: false,
            error: error.message || 'Sync failed due to an unknown error'
          });
        }
        throw error;
      }

      if (syncResult.success) {
        // Update sync metadata in database
        global.databaseManager.updateSyncMetadata({
          lastSync: new Date().toISOString(),
          lastSyncVersion: localData.data.metadata.version,
          localChecksum: localData.checksum
        });

        // If we downloaded data, apply it
        if (syncResult.action === 'download') {
          // Get the remote data that was downloaded
          const remoteData = await global.googleDriveSyncManager.downloadData();
          const importResult = global.databaseManager.importDataFromSync(remoteData.data, {
            mergeStrategy: 'merge',
            force: false,
            preserveSyncMeta: true,
            mergeTags: true,
            mergeConversations: true
          });
        } else if (syncResult.action === 'merge' && syncResult.mergedData) {
          // For merge operations, import the merged data directly
          console.log('[Sync] Applying merged data to main process database');
          const importResult = global.databaseManager.importDataFromSync(syncResult.mergedData, {
            mergeStrategy: 'replace', // Replace with merged data
            force: true,
            preserveSyncMeta: true
          });
        }

        // Send updated data back to renderer process to update localStorage
        const updatedData = global.databaseManager.exportDataAsJSON();
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('sync-data-updated', {
                data: updatedData,
                action: syncResult.action,
                stats: syncResult.stats
            });
            // Notify renderer process that sync completed successfully
            mainWindow.webContents.send('sync-completed', syncResult);
        }
      }

      return syncResult;
    } catch (error) {
      console.error('Google Drive sync failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('google-drive-upload', async () => {
    try {
      if (!global.googleAuthManager || !global.googleAuthManager.isAuthenticated) {
        throw new Error('Not authenticated with Google Drive');
      }

      if (!global.googleDriveSyncManager) {
        const { GoogleDriveSyncManager } = require('./src/js/google-drive-sync.js');
        const encryptionSettings = global.databaseManager ? global.databaseManager.getEncryptionSettings() : null;
        global.googleDriveSyncManager = new GoogleDriveSyncManager(global.googleAuthManager, encryptionSettings);
      }

      if (!global.databaseManager) {
        throw new Error('Database manager not available');
      }

      const localData = global.databaseManager.exportDataForSync();
      const uploadResult = await global.googleDriveSyncManager.uploadData(localData.data);

      if (uploadResult.success) {
        global.databaseManager.updateSyncMetadata({
          lastSync: new Date().toISOString(),
          lastSyncVersion: localData.data.metadata.version,
          remoteFileId: uploadResult.fileId,
          localChecksum: localData.checksum
        });
      }

      // Notify renderer process that upload completed successfully
      if (uploadResult.success) {
        // Send updated data to refresh localStorage in renderer process
        const updatedData = global.databaseManager.exportDataAsJSON();
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('sync-data-updated', {
                data: updatedData,
                action: 'upload',
                stats: { uploaded: 1 }
            });
            mainWindow.webContents.send('sync-completed', uploadResult);
        }
      }

      return uploadResult;
    } catch (error) {
      console.error('Google Drive upload failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('google-drive-download', async () => {
    try {
      if (!global.googleAuthManager || !global.googleAuthManager.isAuthenticated) {
        throw new Error('Not authenticated with Google Drive');
      }

      if (!global.googleDriveSyncManager) {
        const { GoogleDriveSyncManager } = require('./src/js/google-drive-sync.js');
        const encryptionSettings = global.databaseManager ? global.databaseManager.getEncryptionSettings() : null;
        global.googleDriveSyncManager = new GoogleDriveSyncManager(global.googleAuthManager, encryptionSettings);
      }

      if (!global.databaseManager) {
        throw new Error('Database manager not available');
      }

      const downloadResult = await global.googleDriveSyncManager.downloadData();

      if (downloadResult.data) {
        const importResult = global.databaseManager.importDataFromSync(downloadResult.data, {
          mergeStrategy: 'merge',
          force: false,
          mergeTags: true,
          mergeConversations: true
        });

        const result = {
          success: true,
          ...downloadResult,
          importResult: importResult
        };

        // After importing, update localChecksum to current content-only checksum
        try {
          const currentExport = global.databaseManager.exportDataForSync();
          global.databaseManager.updateSyncMetadata({
            lastSync: new Date().toISOString(),
            lastSyncVersion: currentExport.data.metadata.version,
            localChecksum: currentExport.checksum
          });
        } catch (e) {
          console.warn('[Sync] Failed to update local checksum after download:', e.message);
        }

        // Notify renderer process that download completed successfully
        // Send updated data to refresh localStorage in renderer process
        const updatedData = global.databaseManager.exportDataAsJSON();
        if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('sync-data-updated', {
                data: updatedData,
                action: 'download',
                stats: { downloaded: 1 }
            });
            mainWindow.webContents.send('sync-completed', result);
        }

        return result;
      }

      return downloadResult;
    } catch (error) {
      console.error('Google Drive download failed:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('google-drive-get-sync-status', async () => {
    try {
      const status = {
        isAuthenticated: false,
        syncEnabled: false,
        lastSync: null,
        provider: null,
        inProgress: false,
        localChecksum: null,
        remoteChecksum: null
      };

      if (global.googleAuthManager) {
        const authStatus = await global.googleAuthManager.getAuthStatus();
        console.log('[SyncStatus] Auth status:', { isAuthenticated: authStatus.isAuthenticated, hasCredentials: authStatus.hasCredentials });
        status.isAuthenticated = authStatus.isAuthenticated;
      }

      if (global.databaseManager) {
        status.syncEnabled = global.databaseManager.isSyncEnabled();
        status.provider = global.databaseManager.getSyncProvider();
        const syncMetadata = global.databaseManager.getSyncMetadata();
        status.lastSync = syncMetadata.lastSync;
      }

      if (global.googleDriveSyncManager) {
        const syncStatus = global.googleDriveSyncManager.getSyncStatus();
        status.inProgress = syncStatus.inProgress;
        status.remoteChecksum = syncStatus.remoteChecksum || null;
        // Prefer databaseManager for local checksum if available
        if (!status.localChecksum && global.databaseManager) {
          const meta = global.databaseManager.getSyncMetadata();
          status.localChecksum = meta.localChecksum || null;
        } else {
          status.localChecksum = syncStatus.localChecksum || null;
        }
      } else if (global.databaseManager) {
        const meta = global.databaseManager.getSyncMetadata();
        status.localChecksum = meta.localChecksum || null;
      }

      return status;
    } catch (error) {
      console.error('Failed to get sync status:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('google-drive-setup-credentials', async (event, credentialsPath) => {
    try {
      if (!global.googleAuthManager) {
        const { GoogleAuthManager } = require('./src/js/google-auth.js');
        global.googleAuthManager = new GoogleAuthManager();
      }

      // Read credentials file
      const fs = require('fs').promises;
      const credentialsContent = await fs.readFile(credentialsPath, 'utf8');
      const credentials = JSON.parse(credentialsContent);

      // Validate credentials structure before saving
      // Handle both direct OAuth2 format and nested "installed" format
      let clientId, clientSecret, redirectUris;

      if (credentials.installed) {
        // OAuth2 client credentials format (nested under "installed")
        clientId = credentials.installed.client_id;
        clientSecret = credentials.installed.client_secret;
        redirectUris = credentials.installed.redirect_uris;
      } else if (credentials.client_id && credentials.client_secret) {
        // Direct OAuth2 format
        clientId = credentials.client_id;
        clientSecret = credentials.client_secret;
        redirectUris = credentials.redirect_uris;
      } else {
        throw new Error('Invalid credentials file: missing client_id or client_secret. Please ensure you have downloaded OAuth2 client credentials (not service account credentials) from Google Cloud Console.');
      }

      // Check if it's a service account key instead of OAuth2 client credentials
      if (credentials.type === 'service_account') {
        throw new Error('You have uploaded service account credentials, but OAuth2 client credentials are required. Please go to Google Cloud Console → APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client IDs → Web application.');
      }

      // Validate required fields
      if (!clientId || !clientSecret) {
        throw new Error('Invalid credentials file: missing client_id or client_secret. Please ensure you have downloaded OAuth2 client credentials (not service account credentials) from Google Cloud Console.');
      }

      // For OAuth2 client credentials, redirect_uris should exist
      if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
        throw new Error('Invalid credentials file: missing or empty redirect_uris. Please ensure you have downloaded OAuth2 client credentials from Google Cloud Console.');
      }

      // Save credentials
      const success = await global.googleAuthManager.saveCredentials(credentials);

      if (success) {
        // Try to setup OAuth2 client
        await global.googleAuthManager.setupOAuth2Client();
      }

      return { success: success };
    } catch (error) {
      console.error('Failed to setup Google Drive credentials:', error);
      return { success: false, error: error.message };
    }
  });

  // ============================================================
  // PHASE 5: MEDIA FILE HANDLERS
  // ============================================================

  // Get media directory path
  ipcMain.handle('get-media-directory', async () => {
    try {
      const mediaDir = path.join(app.getPath('userData'), 'media');
      // Ensure media directory exists
      await fs.mkdir(mediaDir, { recursive: true });
      return mediaDir;
    } catch (error) {
      console.error('[Media] Failed to get media directory:', error);
      throw error;
    }
  });

  // Save media file to filesystem
  ipcMain.handle('save-media-file', async (event, { fileName, buffer, type }) => {
    try {
      const mediaDir = path.join(app.getPath('userData'), 'media');
      await fs.mkdir(mediaDir, { recursive: true });

      const filePath = path.join(mediaDir, fileName);
      const bufferData = Buffer.from(buffer);
      
      await fs.writeFile(filePath, bufferData);
      
      console.log(`[Media] Saved ${type} file: ${fileName} (${bufferData.length} bytes)`);
      return filePath;
    } catch (error) {
      console.error('[Media] Failed to save media file:', error);
      throw error;
    }
  });

  // Get media file from filesystem
  ipcMain.handle('get-media-file', async (event, filePath) => {
    try {
      const buffer = await fs.readFile(filePath);
      return {
        data: buffer,
        path: filePath,
        size: buffer.length
      };
    } catch (error) {
      console.error('[Media] Failed to get media file:', error);
      throw error;
    }
  });

  // Delete media file
  ipcMain.handle('delete-media-file', async (event, filePath) => {
    try {
      await fs.unlink(filePath);
      console.log('[Media] Deleted media file:', filePath);
      return { success: true };
    } catch (error) {
      console.error('[Media] Failed to delete media file:', error);
      return { success: false, error: error.message };
    }
  });

  // Save downloaded media file (used during sync)
  ipcMain.handle('save-downloaded-media-file', async (event, { fileId, fileData }) => {
    try {
      const mediaDir = path.join(app.getPath('userData'), 'media');
      await fs.mkdir(mediaDir, { recursive: true });

      const fileName = `${fileId}`;
      const filePath = path.join(mediaDir, fileName);
      const bufferData = Buffer.from(fileData);

      await fs.writeFile(filePath, bufferData);

      console.log(`[Media] Saved downloaded media file: ${fileName} (${bufferData.length} bytes)`);
      return filePath;
    } catch (error) {
      console.error('[Media] Failed to save downloaded media file:', error);
      throw error;
    }
  });

  // Sync media files to Google Drive (smart sync with orphan cleanup)
  ipcMain.handle('sync-media-to-drive', async () => {
    try {
      if (!global.googleDriveSyncManager) {
        throw new Error('Google Drive sync not initialized');
      }

      const mediaDir = path.join(app.getPath('userData'), 'media');
      
      // Check if media directory exists
      let localFiles = [];
      try {
        await fs.access(mediaDir);
        const files = await fs.readdir(mediaDir);
        for (const file of files) {
          const filePath = path.join(mediaDir, file);
          const stats = await fs.stat(filePath);
          if (stats.isFile()) {
            localFiles.push({
              name: file,
              path: filePath,
              mtime: stats.mtimeMs,
              size: stats.size
            });
          }
        }
      } catch {
        // No media directory yet, nothing to sync locally
        console.log('[Media] No local media directory found');
      }

      // Get list of media files from Google Drive
      const driveFiles = await global.googleDriveSyncManager.listMediaFiles();
      const driveFileMap = new Map(driveFiles.map(f => [f.name, f]));
      
      // Get referenced media IDs from all notes
      const referencedMediaIds = new Set();
      if (global.databaseManager && global.databaseManager.data.notes) {
        const notes = Object.values(global.databaseManager.data.notes);
        const mediaPattern = /cognotez-media:\/\/([a-z0-9]+)/gi;
        
        for (const note of notes) {
          if (note.content) {
            let match;
            while ((match = mediaPattern.exec(note.content)) !== null) {
              referencedMediaIds.add(match[1]);
            }
          }
        }
      }
      
      console.log(`[Media] Found ${referencedMediaIds.size} referenced media IDs in notes`);
      
      // Upload new or modified files
      let uploaded = 0;
      let skipped = 0;
      
      for (const localFile of localFiles) {
        // Extract media ID from filename (before the extension)
        const mediaId = localFile.name.split('.')[0];
        
        // Skip if not referenced in any note
        if (!referencedMediaIds.has(mediaId)) {
          console.log(`[Media] Skipping unreferenced file: ${localFile.name}`);
          skipped++;
          continue;
        }
        
        const driveFile = driveFileMap.get(localFile.name);
        
        // Upload if file doesn't exist on Drive or has different size
        if (!driveFile || driveFile.size !== String(localFile.size)) {
          const fileData = await fs.readFile(localFile.path);
          await global.googleDriveSyncManager.uploadMediaFile(localFile.name, fileData, localFile.mtime);
          uploaded++;
          console.log(`[Media] Uploaded: ${localFile.name}`);
        } else {
          skipped++;
        }
      }
      
      // Delete orphaned files from Google Drive (files not referenced in any note)
      let deletedFromDrive = 0;
      for (const driveFile of driveFiles) {
        const mediaId = driveFile.name.split('.')[0];
        
        if (!referencedMediaIds.has(mediaId)) {
          console.log(`[Media] Deleting orphaned file from Drive: ${driveFile.name}`);
          await global.googleDriveSyncManager.deleteMediaFile(driveFile.id);
          deletedFromDrive++;
        }
      }
      
      // Delete orphaned files from local filesystem (files not referenced in any note)
      let deletedFromLocal = 0;
      for (const localFile of localFiles) {
        const mediaId = localFile.name.split('.')[0];
        
        if (!referencedMediaIds.has(mediaId)) {
          console.log(`[Media] Deleting orphaned file from local: ${localFile.name}`);
          try {
            await fs.unlink(localFile.path);
            deletedFromLocal++;
          } catch (error) {
            console.warn(`[Media] Failed to delete local file ${localFile.name}:`, error.message);
          }
        }
      }

      console.log(`[Media] Sync complete: ${uploaded} uploaded, ${skipped} skipped, ${deletedFromDrive} deleted from Drive, ${deletedFromLocal} deleted from local`);
      return { 
        success: true, 
        uploaded,
        skipped,
        deletedFromDrive,
        deletedFromLocal,
        total: localFiles.length
      };
      
    } catch (error) {
      console.error('[Media] Failed to sync media to Drive:', error);
      return { success: false, error: error.message };
    }
  });

  // Download media files from Google Drive
  ipcMain.handle('download-media-from-drive', async () => {
    try {
      if (!global.googleDriveSyncManager) {
        throw new Error('Google Drive sync not initialized');
      }

      const mediaDir = path.join(app.getPath('userData'), 'media');
      await fs.mkdir(mediaDir, { recursive: true });

      // Download all media files from Google Drive
      const mediaFiles = await global.googleDriveSyncManager.listMediaFiles();
      let filesDownloaded = 0;

      for (const fileInfo of mediaFiles) {
        const fileData = await global.googleDriveSyncManager.downloadMediaFile(fileInfo.id);
        const filePath = path.join(mediaDir, fileInfo.name);
        await fs.writeFile(filePath, fileData);
        filesDownloaded++;
      }

      console.log(`[Media] Downloaded ${filesDownloaded} media files from Google Drive`);
      return { success: true, filesDownloaded };
      
    } catch (error) {
      console.error('[Media] Failed to download media from Drive:', error);
      return { success: false, error: error.message };
    }
  });

} else {
  console.error('ipcMain not available - Electron may not be properly initialized');
}

// Create application menu
const createMenu = () => {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-note');
          }
        },
        {
          label: 'Open Note',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow.webContents.send('menu-open-note');
          }
        },
        { type: 'separator' },
        {
          label: 'Export',
          submenu: [
            {
              label: 'Export as Markdown',
              click: () => {
                mainWindow.webContents.send('menu-export-markdown');
              }
            },
            {
              label: 'Export as Text',
              click: () => {
                mainWindow.webContents.send('menu-export-text');
              }
            },
            { type: 'separator' },
            {
              label: 'Export All Notes (JSON)',
              click: () => {
                mainWindow.webContents.send('menu-export-json');
              }
            },
            {
              label: 'Create Full Backup',
              click: () => {
                mainWindow.webContents.send('menu-create-backup');
              }
            }
          ]
        },
        {
          label: 'Import',
          submenu: [
            {
              label: 'Import Note',
              click: () => {
                mainWindow.webContents.send('menu-import-note');
              }
            },
            {
              label: 'Import Multiple Files',
              click: () => {
                mainWindow.webContents.send('menu-import-multiple');
              }
            },
            { type: 'separator' },
            {
              label: 'Restore from Backup',
              click: () => {
                mainWindow.webContents.send('menu-restore-backup');
              }
            },
            {
              label: 'Migration Wizard',
              click: () => {
                mainWindow.webContents.send('menu-migration-wizard');
              }
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: async () => {
            try {
              appQuittingRequested = true;
              // Check if auto-sync is enabled and we should sync before quitting
              if (global.databaseManager && global.databaseManager.isAutoSyncEnabled()) {
                console.log('[Main] Auto-sync enabled, syncing before quit...');

                try {
                  // Trigger sync
                  await performSyncBeforeClose();
                  console.log('[Main] Sync completed, quitting...');
                } catch (error) {
                  console.error('[Main] Sync failed before quit, proceeding with quit anyway:', error);
                  // Even if sync fails, allow the app to quit
                }
              }

              // Quit the application
              isQuittingAfterSync = true;
              app.quit();
            } catch (error) {
              console.error('[Main] Error during quit handling:', error);
              // Always allow the app to quit if there's an error
              isQuittingAfterSync = true;
              app.quit();
            }
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'AI',
      submenu: [
        {
          label: 'Summarize Selection',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            mainWindow.webContents.send('menu-summarize');
          }
        },
        {
          label: 'Ask AI About Selection',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => {
            mainWindow.webContents.send('menu-ask-ai');
          }
        },
        {
          label: 'Edit Selection with AI',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            mainWindow.webContents.send('menu-edit-ai');
          }
        },
        {
          label: 'Generate Content with AI',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => {
            mainWindow.webContents.send('menu-generate-ai');
          }
        },
        { type: 'separator' },
        {
          label: 'Rewrite Selection',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => {
            mainWindow.webContents.send('menu-rewrite');
          }
        },
        {
          label: 'Extract Key Points',
          accelerator: 'CmdOrCtrl+Shift+K',
          click: () => {
            mainWindow.webContents.send('menu-key-points');
          }
        },
        {
          label: 'Generate Tags',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            mainWindow.webContents.send('menu-generate-tags');
          }
        },
        
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Settings',
      submenu: [
        {
          label: 'General Settings',
          click: () => {
            mainWindow.webContents.send('menu-general-settings');
          }
        },
        {
          label: 'Cloud Sync Settings',
          click: () => {
            mainWindow.webContents.send('menu-sync-settings');
          }
        },
        { type: 'separator' },
        {
          label: 'AI Settings',
          click: () => {
            mainWindow.webContents.send('menu-ai-settings');
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            mainWindow.webContents.send('menu-check-updates');
          }
        },
        { type: 'separator' },
        {
          label: 'About CogNotez',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About CogNotez',
              message: 'CogNotez - AI-Powered Note App',
              detail: `Version ${app.getVersion()}\nAn offline-first note-taking application with local LLM integration.`
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

// Menu is created when app is ready (handled in app.on('ready') callback above)
