const { app, BrowserWindow, Menu, ipcMain, dialog, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { autoUpdater } = require('electron-updater');

// Keep a global reference of the window object
let mainWindow;
// App-level quit guards for sync-before-exit
let isQuittingAfterSync = false;
let appQuittingRequested = false;
// Global sync lock to prevent concurrent sync operations across IPC handlers
let globalSyncInProgress = false;

// Log version information for debugging
console.log('Node.js version:', process.version);
console.log('Electron version:', process.versions.electron);
console.log('Chrome version:', process.versions.chrome);

// Helper function to get MIME type from file extension
function getMimeTypeFromExtension(ext) {
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json'
  };
  
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

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

  // Prevent navigation and open external links in default browser
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow navigation to the app's own files
    if (url.startsWith('file://') || url.startsWith('cognotez-media://')) {
      return;
    }
    // Prevent navigation and open in external browser instead
    event.preventDefault();
    shell.openExternal(url);
  });

  // Handle new window requests (e.g., target="_blank")
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in the user's default browser
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
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

      // First, check if sync is already in progress - prevent closing during sync
      if (globalSyncInProgress || (global.googleDriveSyncManager && global.googleDriveSyncManager.syncInProgress)) {
        console.log('[Main] Sync in progress, preventing window close...');
        event.preventDefault();
        
        // Show loading screen to user
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('sync-closing-show');
        }
        
        // Wait for sync to complete (with a reasonable timeout)
        let attempts = 0;
        while ((globalSyncInProgress || (global.googleDriveSyncManager && global.googleDriveSyncManager.syncInProgress)) && attempts < 120) { // Wait up to 60 seconds
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        
        // Hide loading screen
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('sync-closing-hide');
        }
        
        if (globalSyncInProgress || (global.googleDriveSyncManager && global.googleDriveSyncManager.syncInProgress)) {
          console.warn('[Main] Sync still in progress after timeout, but allowing close to prevent hang');
          // After timeout, allow close to prevent the app from hanging
          return;
        }
        
        // Sync completed, now close the window since user already requested close
        console.log('[Main] Sync completed, closing window...');
        mainWindow.destroy();
        return;
      }

      // Check if auto-sync is enabled and we should sync before closing
      if (global.databaseManager && global.databaseManager.isAutoSyncEnabled() && !isClosingWithSync) {
        console.log('[Main] Auto-sync enabled, syncing before closing...');

        // Prevent the window from closing immediately
        event.preventDefault();
        isClosingWithSync = true;

        // Show loading screen to user
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('sync-closing-show');
        }

        try {
          // Trigger sync
          await performSyncBeforeClose();

          // Hide loading screen
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('sync-closing-hide');
          }

          // After sync completes, close the window
          console.log('[Main] Sync completed, closing window...');
          mainWindow.destroy();
        } catch (error) {
          // Hide loading screen even on error
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('sync-closing-hide');
          }
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

    // Check if sync is already in progress (check both global and manager-level locks)
    if (globalSyncInProgress || global.googleDriveSyncManager.syncInProgress) {
      console.log('[Main] Sync already in progress, waiting for it to complete...');
      // Wait for the existing sync to complete (with a timeout)
      let attempts = 0;
      while ((globalSyncInProgress || global.googleDriveSyncManager.syncInProgress) && attempts < 60) { // Wait up to 30 seconds
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      }

      if (globalSyncInProgress || global.googleDriveSyncManager.syncInProgress) {
        console.warn('[Main] Sync still in progress after timeout, proceeding with close');
        return; // Don't start another sync
      }
    }

    // Set global lock
    globalSyncInProgress = true;

    // Get local data for sync
    if (!global.databaseManager) {
      throw new Error('Database manager not available');
    }

    const localData = global.databaseManager.exportDataForSync();
    const dbSyncMeta = global.databaseManager.getSyncMetadata();
    const lastSyncToUse = dbSyncMeta && dbSyncMeta.lastSync ? dbSyncMeta.lastSync : null;
    const lastSeenRemoteSyncVersion = dbSyncMeta.remoteSyncVersion || 0;

    console.log('[Main] Performing sync before close...');
    console.log('[Main] Using lastSync:', lastSyncToUse, 'lastSeenRemoteSyncVersion:', lastSeenRemoteSyncVersion);

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
      lastSync: lastSyncToUse,
      lastSeenRemoteSyncVersion: lastSeenRemoteSyncVersion
    });

    // Update sync status
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('sync-status-update', {
        inProgress: false,
        message: syncResult.success ? 'Sync completed' : 'Sync failed'
      });
    }

    if (syncResult.success) {
      // Update sync metadata in database - include remoteSyncVersion for future conflict detection
      const syncMetaToSave = {
        lastSync: syncResult.syncMetadata?.lastSync || new Date().toISOString(),
        lastSyncVersion: localData.data.metadata?.version || '1.0',
        localChecksum: syncResult.syncMetadata?.localChecksum || localData.checksum
      };
      
      // Persist remoteSyncVersion so we can detect new remote versions on next sync
      if (typeof syncResult.syncMetadata?.remoteSyncVersion === 'number') {
        syncMetaToSave.remoteSyncVersion = syncResult.syncMetadata.remoteSyncVersion;
        console.log('[Main] Persisting remoteSyncVersion (before close):', syncMetaToSave.remoteSyncVersion);
      }
      
      global.databaseManager.updateSyncMetadata(syncMetaToSave);

      // Note: The sync manager already handles downloading and applying data
      // for 'download' and 'merge' actions, so no additional import is needed here

      console.log('[Main] Sync before close completed successfully');
    } else {
      throw new Error(syncResult.error || 'Sync failed');
    }

  } catch (error) {
    console.error('[Main] Sync before close failed:', error);
    throw error;
  } finally {
    // Always release the global sync lock
    globalSyncInProgress = false;
    console.log('[Main] Released global sync lock (performSyncBeforeClose)');
  }
}

// Register custom protocol for media files
function registerMediaProtocol() {
  protocol.registerFileProtocol('cognotez-media', async (request, callback) => {
    try {
      const fileId = request.url.replace('cognotez-media://', '');
      const mediaDir = path.join(app.getPath('userData'), 'media');

      // Ensure media directory exists
      try {
        await fs.mkdir(mediaDir, { recursive: true });
      } catch (error) {
        // Directory might already exist, that's fine
      }

      // Find file with this ID (could have any extension)
      const files = await fs.readdir(mediaDir);
      const matchingFile = files.find(file => file.startsWith(fileId));

      if (matchingFile) {
        const filePath = path.join(mediaDir, matchingFile);
        callback({ path: filePath });
      } else {
        console.error('[Media Protocol] File not found:', fileId, 'in directory:', mediaDir);
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
  // Load default language (en) and create menu
  createMenu('en').catch(err => {
    console.error('[Main] Failed to create menu:', err);
  });

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
    await global.googleAuthManager._initPromise;
    console.log('[Main] Google Auth Manager initialized successfully');
  } catch (error) {
    console.error('[Main] Failed to initialize Google Auth Manager:', error);
    // Continue without Google Auth - OAuth features will be disabled
  }
}

// Request single instance lock to prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this instance
  console.log('[Main] Another instance is already running. Exiting...');
  app.quit();
} else {
  // This is the first instance, set up event handlers
  
  // Handle second instance attempts - focus the existing window
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('[Main] Second instance detected, focusing existing window');
    // If we have a window, focus it
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      mainWindow.show();
    }
  });
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
      if (globalSyncInProgress || (global.googleDriveSyncManager && global.googleDriveSyncManager.syncInProgress)) {
        console.log('[Main] Sync in progress, preventing app quit...');
        
        // Show loading screen to user
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('sync-closing-show');
        }
        
        let attempts = 0;
        while ((globalSyncInProgress || (global.googleDriveSyncManager && global.googleDriveSyncManager.syncInProgress)) && attempts < 120) { // up to ~60s
          event.preventDefault();
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        
        // Hide loading screen
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('sync-closing-hide');
        }
        
        if (!globalSyncInProgress && (!global.googleDriveSyncManager || !global.googleDriveSyncManager.syncInProgress)) {
          console.log('[Main] Sync completed, allowing quit to proceed');
          return; // existing sync finished; let quit proceed
        }
        // If still in progress after timeout, log warning but continue with quit to prevent hang
        console.warn('[Main] Sync still in progress after timeout, proceeding with quit to prevent hang');
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

  // PDF generation handlers
  ipcMain.handle('generate-pdf-from-html', async (event, { html, filename }) => {
    let tempHtmlPath = null;
    let tempWindow = null;
    let timeoutId = null;
    
    try {
      console.log('[PDF] Starting PDF generation...');
      
      // Show save dialog for PDF
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: filename,
        filters: [
          { name: 'PDF', extensions: ['pdf'] }
        ]
      });

      if (result.canceled) {
        console.log('[PDF] User canceled PDF generation');
        return { success: false, canceled: true };
      }

      console.log('[PDF] Creating temporary HTML file...');
      
      // Create temporary HTML file instead of using data URL
      const tempDir = path.join(app.getPath('temp'), 'cognotez-pdf');
      try {
        await fs.mkdir(tempDir, { recursive: true });
      } catch (mkdirError) {
        console.error('[PDF] Failed to create temp directory:', mkdirError);
        throw new Error('Failed to create temporary directory');
      }
      
      tempHtmlPath = path.join(tempDir, `temp-${Date.now()}.html`);
      await fs.writeFile(tempHtmlPath, html, 'utf8');
      console.log('[PDF] HTML file created:', tempHtmlPath);
      console.log('[PDF] HTML content preview:', html.substring(0, 500) + '...');
      
      // Verify the file was written correctly
      try {
        const fileStats = await fs.stat(tempHtmlPath);
        console.log('[PDF] HTML file size:', fileStats.size, 'bytes');
        const readBack = await fs.readFile(tempHtmlPath, 'utf8');
        console.log('[PDF] HTML file verification: file can be read back, length:', readBack.length);
      } catch (verifyError) {
        console.error('[PDF] HTML file verification failed:', verifyError);
      }

      // Create a temporary window to render the HTML
      console.log('[PDF] Creating temporary window...');
      tempWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false // Allow loading local files
        }
      });

      // Set up timeout for the entire process
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('PDF generation timed out after 30 seconds'));
        }, 30000);
      });

      // Load the HTML file with timeout
      console.log('[PDF] Loading HTML content...');
      
      // Set up content loading promise BEFORE loading the file
      const contentLoadPromise = new Promise((resolve, reject) => {
        let loadFinished = false;
        
        tempWindow.webContents.once('did-finish-load', () => {
          if (loadFinished) return;
          loadFinished = true;
          console.log('[PDF] Content loaded successfully');
          
          // Simple approach: just wait a bit for images and proceed
          setTimeout(() => {
            console.log('[PDF] Proceeding with PDF generation after content load');
            resolve();
          }, 3000); // Wait 3 seconds for images to load
        });
        
        tempWindow.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
          if (loadFinished) return;
          loadFinished = true;
          reject(new Error(`Failed to load content: ${errorDescription}`));
        });
      });
      
      // Add debugging for the load process
      tempWindow.webContents.on('did-start-loading', () => {
        console.log('[PDF] Started loading HTML content');
      });
      
      tempWindow.webContents.on('did-stop-loading', () => {
        console.log('[PDF] Stopped loading HTML content');
      });
      
      tempWindow.webContents.on('did-finish-load', () => {
        console.log('[PDF] HTML content finished loading');
      });
      
      tempWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error('[PDF] HTML content failed to load:', errorCode, errorDescription, validatedURL);
      });
      
      const loadPromise = tempWindow.loadFile(tempHtmlPath);
      
      // Race between loading and timeout
      await Promise.race([loadPromise, timeoutPromise]);
      console.log('[PDF] HTML file load completed');

      // Wait for content to load and images to be ready
      console.log('[PDF] Waiting for content to load...');
      await Promise.race([contentLoadPromise, timeoutPromise]);

      // Generate PDF
      console.log('[PDF] Generating PDF...');
      const pdfData = await Promise.race([
        tempWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: {
            marginType: 'printableArea'
          }
        }),
        timeoutPromise
      ]);

      // Write PDF to file
      console.log('[PDF] Writing PDF file...');
      await fs.writeFile(result.filePath, pdfData);

      console.log(`[PDF] Generated PDF: ${result.filePath}`);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      console.error('[PDF] Failed to generate PDF:', error);
      return { success: false, error: error.message };
    } finally {
      // Clear timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Clean up
      if (tempWindow) {
        try {
          tempWindow.close();
        } catch (closeError) {
          console.warn('[PDF] Failed to close temp window:', closeError);
        }
      }
      
      if (tempHtmlPath) {
        try {
          await fs.unlink(tempHtmlPath);
        } catch (cleanupError) {
          console.warn('[PDF] Failed to cleanup temp HTML file:', cleanupError);
        }
      }
      
      // Clean up temporary media files
      try {
        const tempMediaDir = path.join(app.getPath('temp'), 'cognotez-pdf-media');
        if (await fs.access(tempMediaDir).then(() => true).catch(() => false)) {
          const files = await fs.readdir(tempMediaDir);
          for (const file of files) {
            try {
              await fs.unlink(path.join(tempMediaDir, file));
            } catch (fileError) {
              console.warn(`[PDF] Failed to cleanup temp media file ${file}:`, fileError);
            }
          }
        }
      } catch (cleanupError) {
        console.warn('[PDF] Failed to cleanup temp media files:', cleanupError);
      }
    }
  });

  ipcMain.handle('get-media-file-as-base64', async (event, fileId) => {
    try {
      const mediaDir = path.join(app.getPath('userData'), 'media');
      
      // Find file with this ID (could have any extension)
      const files = await fs.readdir(mediaDir);
      const matchingFile = files.find(file => file.startsWith(fileId));

      if (!matchingFile) {
        throw new Error(`Media file not found: ${fileId}`);
      }

      const filePath = path.join(mediaDir, matchingFile);
      const fileBuffer = await fs.readFile(filePath);
      const mimeType = getMimeTypeFromExtension(path.extname(matchingFile));
      const base64 = fileBuffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;

      return { dataUrl, mimeType, size: fileBuffer.length, filename: matchingFile };
    } catch (error) {
      console.error('[PDF] Failed to get media file as base64:', error);
      throw error;
    }
  });

  ipcMain.handle('copy-media-file-for-pdf', async (event, fileId) => {
    try {
      console.log(`[PDF] Copying media file for PDF: ${fileId}`);
      
      const mediaDir = path.join(app.getPath('userData'), 'media');
      
      // Check if media directory exists
      try {
        await fs.access(mediaDir);
      } catch (accessError) {
        throw new Error(`Media directory not found: ${mediaDir}`);
      }
      
      // Find file with this ID (could have any extension)
      const files = await fs.readdir(mediaDir);
      const matchingFile = files.find(file => file.startsWith(fileId));

      if (!matchingFile) {
        console.error(`[PDF] Media file not found: ${fileId} in directory: ${mediaDir}`);
        throw new Error(`Media file not found: ${fileId}`);
      }

      const sourcePath = path.join(mediaDir, matchingFile);
      const mimeType = getMimeTypeFromExtension(path.extname(matchingFile));
      
      console.log(`[PDF] Found media file: ${matchingFile}, MIME type: ${mimeType}`);
      
      // Create temporary directory for PDF media files
      const tempDir = path.join(app.getPath('temp'), 'cognotez-pdf-media');
      try {
        await fs.mkdir(tempDir, { recursive: true });
      } catch (mkdirError) {
        throw new Error(`Failed to create temp media directory: ${mkdirError.message}`);
      }
      
      // Copy file to temporary location
      const tempPath = path.join(tempDir, matchingFile);
      await fs.copyFile(sourcePath, tempPath);
      
      console.log(`[PDF] Successfully copied media file to: ${tempPath}`);
      return { tempPath, mimeType, filename: matchingFile };
    } catch (error) {
      console.error('[PDF] Failed to copy media file for PDF:', error);
      throw error;
    }
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

  // App restart handler
  // Instead of a full process restart (which causes FUSE mount conflicts on
  // AppImage and SIGTRAP on relaunch), reset main-process auth/sync state and
  // reload the renderer. This is sufficient for all current restart triggers
  // (Google Drive connect/disconnect, API key change).
  ipcMain.on('restart-app', () => {
    console.log('[Main] Soft-restarting: clearing auth state and reloading renderer...');
    global.googleAuthManager = null;
    global.googleDriveSyncManager = null;
    globalSyncInProgress = false;
    if (mainWindow) {
      mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
    }
  });

  // Google Drive sync IPC handlers
  ipcMain.handle('google-drive-authenticate', async () => {
    try {
      // Lazy load Google Auth Manager to avoid issues if not used
      if (!global.googleAuthManager) {
        const { GoogleAuthManager } = require('./src/js/google-auth.js');
        global.googleAuthManager = new GoogleAuthManager();
      }
      await global.googleAuthManager._initPromise;

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
      // Check global sync lock to prevent concurrent sync operations
      if (globalSyncInProgress) {
        console.warn('[Sync] Sync already in progress globally, rejecting concurrent request');
        return { success: false, error: 'Sync operation already in progress' };
      }

      if (!global.googleAuthManager || !global.googleAuthManager.isAuthenticated) {
        throw new Error('Not authenticated with Google Drive');
      }

      if (!global.googleDriveSyncManager) {
        const { GoogleDriveSyncManager } = require('./src/js/google-drive-sync.js');
        const encryptionSettings = global.databaseManager ? global.databaseManager.getEncryptionSettings() : null;
        global.googleDriveSyncManager = new GoogleDriveSyncManager(global.googleAuthManager, encryptionSettings);
      }

      // Set global lock
      globalSyncInProgress = true;

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
      // Get last seen remote syncVersion for improved deletion inference
      const lastSeenRemoteSyncVersion = dbSyncMeta.remoteSyncVersion || 0;
      console.log('[Sync] Using lastSync:', lastSyncToUse, 'lastSeenRemoteSyncVersion:', lastSeenRemoteSyncVersion);
      let syncResult;
      try {
        syncResult = await global.googleDriveSyncManager.sync({
          localData: localData.data,
          strategy: options.strategy || 'merge',
          lastSync: lastSyncToUse,
          lastSeenRemoteSyncVersion: lastSeenRemoteSyncVersion
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
        // Update sync metadata in database - include remoteSyncVersion for future conflict detection
        const syncMetaToSave = {
          lastSync: syncResult.syncMetadata?.lastSync || new Date().toISOString(),
          lastSyncVersion: localData.data.metadata?.version || '1.0',
          localChecksum: syncResult.syncMetadata?.localChecksum || localData.checksum,
          remoteChecksum: syncResult.syncMetadata?.remoteChecksum,
          remoteFileId: syncResult.syncMetadata?.remoteFileId
        };
        
        // Persist remoteSyncVersion so we can detect new remote versions on next sync
        if (typeof syncResult.syncMetadata?.remoteSyncVersion === 'number') {
          syncMetaToSave.remoteSyncVersion = syncResult.syncMetadata.remoteSyncVersion;
          console.log('[Sync] Persisting remoteSyncVersion:', syncMetaToSave.remoteSyncVersion);
        }
        
        global.databaseManager.updateSyncMetadata(syncMetaToSave);

        // If we downloaded data, apply it
        if (syncResult.action === 'download' && syncResult.remoteData) {
          // Use the remote data that was already downloaded during sync
          console.log('[Sync] Applying downloaded data to main process database');
          const importResult = global.databaseManager.importDataFromSync(syncResult.remoteData, {
            mergeStrategy: 'merge',
            force: false,
            preserveSyncMeta: true,
            mergeTags: true,
            mergeConversations: true
          });

          // Check if import succeeded
          if (!importResult.success) {
            console.error('[Sync] Failed to import downloaded data:', importResult.error);
            throw new Error(`Failed to import downloaded data: ${importResult.error || 'Unknown error'}`);
          }
          console.log('[Sync] Successfully imported downloaded data');
        } else if (syncResult.action === 'merge' && syncResult.mergedData) {
          // For merge operations, import the merged data directly
          console.log('[Sync] Applying merged data to main process database');
          const importResult = global.databaseManager.importDataFromSync(syncResult.mergedData, {
            mergeStrategy: 'replace', // Replace with merged data
            force: true,
            preserveSyncMeta: true,
            mergeTags: true,
            mergeConversations: true
          });

          // Check if import succeeded
          if (!importResult.success) {
            console.error('[Sync] Failed to import merged data:', importResult.error);
            throw new Error(`Failed to import merged data: ${importResult.error || 'Unknown error'}`);
          }
          console.log('[Sync] Successfully imported merged data');
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
    } finally {
      // Always release the global sync lock
      globalSyncInProgress = false;
      console.log('[Sync] Released global sync lock');
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
        const now = new Date().toISOString();
        const uploadedSyncVersion = uploadResult.syncVersion || 0;
        
        global.databaseManager.updateSyncMetadata({
          lastSync: now,
          lastSyncVersion: localData.data.metadata?.version || '1.0',
          remoteFileId: uploadResult.fileId,
          localChecksum: localData.checksum,
          remoteSyncVersion: uploadedSyncVersion
        });
        
        console.log('[Sync] Upload completed, persisting remoteSyncVersion:', uploadedSyncVersion);
        
        // Add syncMetadata to result for renderer persistence
        uploadResult.syncMetadata = {
          lastSync: now,
          localChecksum: localData.checksum,
          remoteFileId: uploadResult.fileId,
          remoteSyncVersion: uploadedSyncVersion
        };
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

  // Share note on Google Drive
  ipcMain.handle('google-drive-share-note', async (event, { note, permissions, email }) => {
    try {
      if (!global.googleAuthManager || !global.googleAuthManager.isAuthenticated) {
        throw new Error('Not authenticated with Google Drive. Please connect Google Drive in Sync Settings.');
      }

      if (!global.googleDriveSyncManager) {
        const { GoogleDriveSyncManager } = require('./src/js/google-drive-sync.js');
        const encryptionSettings = global.databaseManager ? global.databaseManager.getEncryptionSettings() : null;
        global.googleDriveSyncManager = new GoogleDriveSyncManager(global.googleAuthManager, encryptionSettings);
      }

      console.log('[Google Drive] Sharing note:', note.title);
      const result = await global.googleDriveSyncManager.shareNoteOnDrive(note, permissions, email);
      console.log('[Google Drive] Share result:', result);
      
      // Update note in database with share information
      if (result.success && global.databaseManager) {
        const noteData = global.databaseManager.data.notes[note.id];
        if (noteData) {
          if (!noteData.collaboration) {
            noteData.collaboration = {
              is_shared: false,
              shared_with: [],
              last_edited_by: null,
              edit_history: [],
              google_drive_file_id: null,
              google_drive_share_link: null
            };
          }
          noteData.collaboration.is_shared = true;
          noteData.collaboration.google_drive_file_id = result.fileId;
          noteData.collaboration.google_drive_share_link = result.shareLink;
          // Update timestamp so sync knows this version is newer
          noteData.updated_at = new Date().toISOString();
          global.databaseManager.saveToLocalStorage();
          console.log('[Google Drive] Updated note with share information');
          
          // Return the updated collaboration data so renderer can update its database
          result.updatedCollaboration = {
            is_shared: true,
            shared_with: noteData.collaboration.shared_with || [],
            last_edited_by: noteData.collaboration.last_edited_by,
            edit_history: noteData.collaboration.edit_history || [],
            google_drive_file_id: result.fileId,
            google_drive_share_link: result.shareLink
          };
        }
      }
      
      return result;
    } catch (error) {
      console.error('[Google Drive] Share note failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Revoke share (delete shared note from Google Drive)
  ipcMain.handle('google-drive-revoke-share', async (event, { fileId, noteId }) => {
    try {
      if (!global.googleAuthManager || !global.googleAuthManager.isAuthenticated) {
        throw new Error('Not authenticated with Google Drive');
      }

      // Check if note already has no collaboration data (might have been revoked on another device)
      if (global.databaseManager) {
        const noteData = global.databaseManager.data.notes[noteId];
        if (noteData && noteData.collaboration) {
          // If fileId is null or collaboration is already not shared, just update local state
          if (!fileId || !noteData.collaboration.google_drive_file_id || !noteData.collaboration.is_shared) {
            console.log('[Google Drive] Note already not shared, clearing collaboration data');
            noteData.collaboration.is_shared = false;
            noteData.collaboration.google_drive_file_id = null;
            noteData.collaboration.google_drive_share_link = null;
            noteData.updated_at = new Date().toISOString();
            global.databaseManager.saveToLocalStorage();
            return { 
              success: true,
              updatedCollaboration: {
                is_shared: false,
                shared_with: [],
                last_edited_by: null,
                edit_history: [],
                google_drive_file_id: null,
                google_drive_share_link: null
              }
            };
          }
        }
      }

      if (!global.googleDriveSyncManager) {
        const { GoogleDriveSyncManager } = require('./src/js/google-drive-sync.js');
        const encryptionSettings = global.databaseManager ? global.databaseManager.getEncryptionSettings() : null;
        global.googleDriveSyncManager = new GoogleDriveSyncManager(global.googleAuthManager, encryptionSettings);
      }

      // Get note data to extract media files for deletion
      let noteData = null;
      if (global.databaseManager && noteId) {
        noteData = global.databaseManager.data.notes[noteId];
      }

      console.log('[Google Drive] Revoking share for file:', fileId);
      const result = await global.googleDriveSyncManager.stopSharingNote(fileId, noteData);
      
      // Update note in database to remove share information
      if (result && global.databaseManager && noteData) {
        if (noteData.collaboration) {
          noteData.collaboration.is_shared = false;
          noteData.collaboration.google_drive_file_id = null;
          noteData.collaboration.google_drive_share_link = null;
          // Update timestamp so sync knows this version is newer
          noteData.updated_at = new Date().toISOString();
          global.databaseManager.saveToLocalStorage();
          console.log('[Google Drive] Removed share information from note');
        }
      }
      
      return { 
        success: true,
        updatedCollaboration: {
          is_shared: false,
          shared_with: [],
          last_edited_by: null,
          edit_history: [],
          google_drive_file_id: null,
          google_drive_share_link: null
        }
      };
    } catch (error) {
      console.error('[Google Drive] Revoke share failed:', error);
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
        await global.googleAuthManager._initPromise;
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

  // Read media file directly from filesystem (for synced files)
  ipcMain.handle('read-media-file', async (event, filePath) => {
    try {
      // Ensure the file exists before reading
      await fs.access(filePath);

      const buffer = await fs.readFile(filePath);
      console.log(`[Media] Successfully read media file: ${filePath} (${buffer.length} bytes)`);
      return buffer;
    } catch (error) {
      console.error(`[Media] Failed to read media file: ${filePath}`, error);
      throw error;
    }
  });

  // Find and read media file by ID (intelligent file discovery)
  ipcMain.handle('find-and-read-media-file', async (event, fileId) => {
    try {
      const mediaDir = path.join(app.getPath('userData'), 'media');

      // 1. Try the fileId as-is (for backwards compatibility)
      let filePath = path.join(mediaDir, fileId);
      try {
        await fs.access(filePath);
        const buffer = await fs.readFile(filePath);
        console.log(`[Media] Successfully read media file: ${fileId} (${buffer.length} bytes)`);
        return { buffer, filename: fileId };
      } catch (error) {
        // File not found, continue to intelligent discovery
      }

      // 2. Use intelligent file discovery - find files that start with the fileId
      try {
        const files = await fs.readdir(mediaDir);

        // Find files that start with the fileId followed by a dot (extension)
        const matchingFiles = files.filter(file => {
          // Check if file starts with fileId + '.' (e.g., "fileId.png", "fileId.jpg")
          return file.startsWith(fileId + '.');
        });

        if (matchingFiles.length > 0) {
          // Use the first matching file (there should typically be only one)
          const filename = matchingFiles[0];
          filePath = path.join(mediaDir, filename);
          const buffer = await fs.readFile(filePath);
          console.log(`[Media] Successfully read media file: ${filename} (${buffer.length} bytes)`);
          return { buffer, filename };
        }

        // 3. As a last resort, try to find files that start with the fileId (without requiring extension)
        const looseMatches = files.filter(file => file.startsWith(fileId));
        if (looseMatches.length > 0) {
          const filename = looseMatches[0];
          filePath = path.join(mediaDir, filename);
          const buffer = await fs.readFile(filePath);
          console.log(`[Media] Successfully read media file (loose match): ${filename} (${buffer.length} bytes)`);
          return { buffer, filename };
        }

      } catch (error) {
        console.warn(`[Media] Failed to list media directory: ${mediaDir}`, error);
      }

      throw new Error(`Media file not found: ${fileId}`);
    } catch (error) {
      console.error(`[Media] Failed to find and read media file: ${fileId}`, error);
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

  // Handle language change from renderer
  ipcMain.on('menu-language-changed', async (event, lang) => {
    try {
      await updateMenuLanguage(lang);
      console.log(`[Menu] Menu language updated to: ${lang}`);
    } catch (error) {
      console.error('[Menu] Failed to update menu language:', error);
    }
  });

} else {
  console.error('ipcMain not available - Electron may not be properly initialized');
}

// Load translations for menu
let menuTranslations = {};
let currentMenuLanguage = 'en';

const loadMenuTranslations = async (lang = 'en') => {
  try {
    const localePath = path.join(__dirname, 'src', 'locales', `${lang}.json`);
    const localeContent = await fs.readFile(localePath, 'utf8');
    const locale = JSON.parse(localeContent);
    menuTranslations = locale.menu || {};
    currentMenuLanguage = lang;
    return menuTranslations;
  } catch (error) {
    console.error(`[Menu] Failed to load translations for ${lang}:`, error);
    // Fallback to English if loading fails
    if (lang !== 'en') {
      return loadMenuTranslations('en');
    }
    return {};
  }
};

// Helper function to get translated menu label
const t = (key) => {
  return menuTranslations[key] || key;
};

// Create application menu
const createMenu = async (lang = 'en') => {
  // Load translations if language changed
  if (lang !== currentMenuLanguage) {
    await loadMenuTranslations(lang);
  }
  
  const template = [
      {
        label: t('file'),
        submenu: [
          {
            label: t('newNote'),
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              mainWindow.webContents.send('menu-new-note');
            }
          },
          { type: 'separator' },
          {
            label: t('export'),
            submenu: [
              {
                label: t('exportMarkdown'),
                click: () => {
                  mainWindow.webContents.send('menu-export-markdown');
                }
              },
              {
                label: t('exportText'),
                click: () => {
                  mainWindow.webContents.send('menu-export-text');
                }
              },
              {
                label: t('sharePDF'),
                click: () => {
                  mainWindow.webContents.send('menu-export-pdf');
                }
              },
              { type: 'separator' },
              {
                label: t('createFullBackup'),
                click: () => {
                  mainWindow.webContents.send('menu-create-backup');
                }
              }
            ]
          },
          {
            label: t('import'),
            submenu: [
              {
                label: t('importNote'),
                click: () => {
                  mainWindow.webContents.send('menu-import-note');
                }
              },
              {
                label: t('importMultipleFiles'),
                click: () => {
                  mainWindow.webContents.send('menu-import-multiple');
                }
              },
              { type: 'separator' },
              {
                label: t('restoreFromBackup'),
                click: () => {
                  mainWindow.webContents.send('menu-restore-backup');
                }
              }
            ]
          },
        { type: 'separator' },
        {
          label: t('quit'),
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: async () => {
            try {
              appQuittingRequested = true;
              
              // First, check if sync is already in progress - wait for it to complete
              if (globalSyncInProgress || (global.googleDriveSyncManager && global.googleDriveSyncManager.syncInProgress)) {
                console.log('[Main] Sync in progress, waiting before quit...');
                
                // Show loading screen to user
                if (mainWindow && mainWindow.webContents) {
                  mainWindow.webContents.send('sync-closing-show');
                }
                
                // Wait for sync to complete (with a reasonable timeout)
                let attempts = 0;
                while ((globalSyncInProgress || (global.googleDriveSyncManager && global.googleDriveSyncManager.syncInProgress)) && attempts < 120) { // Wait up to 60 seconds
                  await new Promise(resolve => setTimeout(resolve, 500));
                  attempts++;
                }
                
                // Hide loading screen
                if (mainWindow && mainWindow.webContents) {
                  mainWindow.webContents.send('sync-closing-hide');
                }
                
                if (globalSyncInProgress || (global.googleDriveSyncManager && global.googleDriveSyncManager.syncInProgress)) {
                  console.warn('[Main] Sync still in progress after timeout, proceeding with quit to prevent hang');
                } else {
                  console.log('[Main] Sync completed, proceeding with quit...');
                }
              }
              
              // Check if auto-sync is enabled and we should sync before quitting
              if (global.databaseManager && global.databaseManager.isAutoSyncEnabled()) {
                console.log('[Main] Auto-sync enabled, syncing before quit...');

                // Show loading screen to user
                if (mainWindow && mainWindow.webContents) {
                  mainWindow.webContents.send('sync-closing-show');
                }

                try {
                  // Trigger sync
                  await performSyncBeforeClose();
                  console.log('[Main] Sync completed, quitting...');
                } catch (error) {
                  console.error('[Main] Sync failed before quit, proceeding with quit anyway:', error);
                  // Even if sync fails, allow the app to quit
                } finally {
                  // Hide loading screen
                  if (mainWindow && mainWindow.webContents) {
                    mainWindow.webContents.send('sync-closing-hide');
                  }
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
      label: t('edit'),
      submenu: [
        { role: 'undo', label: t('undo') },
        { role: 'redo', label: t('redo') },
        { type: 'separator' },
        { role: 'cut', label: t('cut') },
        { role: 'copy', label: t('copy') },
        { role: 'paste', label: t('paste') },
        { role: 'selectall', label: t('selectAll') }
      ]
    },
    {
      label: t('ai'),
      submenu: [
        {
          label: t('summarizeSelection'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => {
            mainWindow.webContents.send('menu-summarize');
          }
        },
        {
          label: t('askAIAboutSelection'),
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => {
            mainWindow.webContents.send('menu-ask-ai');
          }
        },
        {
          label: t('editSelectionWithAI'),
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            mainWindow.webContents.send('menu-edit-ai');
          }
        },
        {
          label: t('generateContentWithAI'),
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => {
            mainWindow.webContents.send('menu-generate-ai');
          }
        },
        { type: 'separator' },
        {
          label: t('rewriteSelection'),
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => {
            mainWindow.webContents.send('menu-rewrite');
          }
        },
        {
          label: t('extractKeyPoints'),
          accelerator: 'CmdOrCtrl+Shift+K',
          click: () => {
            mainWindow.webContents.send('menu-key-points');
          }
        },
        {
          label: t('generateTags'),
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            mainWindow.webContents.send('menu-generate-tags');
          }
        },
        
      ]
    },
    {
      label: t('view'),
      submenu: [
        { role: 'reload', label: t('reload') },
        { role: 'forcereload', label: t('forceReload') },
        { role: 'toggledevtools', label: t('toggleDevTools') },
        { type: 'separator' },
        { role: 'resetzoom', label: t('resetZoom') },
        { role: 'zoomin', label: t('zoomIn') },
        { role: 'zoomout', label: t('zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t('toggleFullscreen') }
      ]
    },
    {
      label: t('settings'),
      submenu: [
        {
          label: t('generalSettings'),
          click: () => {
            mainWindow.webContents.send('menu-general-settings');
          }
        },
        {
          label: t('cloudSyncSettings'),
          click: () => {
            mainWindow.webContents.send('menu-sync-settings');
          }
        },
        { type: 'separator' },
        {
          label: t('aiSettings'),
          click: () => {
            mainWindow.webContents.send('menu-ai-settings');
          }
        },
        {
          label: t('advancedSettings'),
          click: () => {
            mainWindow.webContents.send('menu-advanced-settings');
          }
        }
      ]
    },
    {
      label: t('help'),
      submenu: [
        {
          label: t('checkForUpdates'),
          click: () => {
            mainWindow.webContents.send('menu-check-updates');
          }
        },
        { type: 'separator' },
        {
          label: t('aboutCogNotez'),
          click: () => {
            mainWindow.webContents.send('menu-about');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

// Update menu when language changes
const updateMenuLanguage = async (lang) => {
  try {
    await createMenu(lang);
  } catch (error) {
    console.error('[Menu] Failed to update menu language:', error);
  }
};

// Menu is created when app is ready (handled in app.on('ready') callback above)
