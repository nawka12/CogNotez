const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { autoUpdater } = require('electron-updater');

// Keep a global reference of the window object
let mainWindow;

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

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Configure auto-updater
function setupAutoUpdater() {
  // Configure auto-updater for GitHub releases
  autoUpdater.autoDownload = false; // Don't download automatically, let user choose

  // Auto-updater event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
    mainWindow.webContents.send('update-checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    mainWindow.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available. Current version:', info.version);
    mainWindow.webContents.send('update-not-available', info);
  });

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err);
    mainWindow.webContents.send('update-error', err.message);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log(log_message);
    mainWindow.webContents.send('download-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    mainWindow.webContents.send('update-downloaded', info);

    // Show dialog asking user to restart
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
  });

  // Check for updates (only in production)
  if (process.env.NODE_ENV !== 'development') {
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 3000); // Wait 3 seconds after app start
  }
}

// This method will be called when Electron has finished initialization
async function initApp() {
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
          // Listen for navigation to callback URL
          authWindow.webContents.on('will-navigate', async (event, url) => {
            // Handle OAuth callback URLs from any localhost port (common Google OAuth redirect)
            if (url.includes('code=') && (url.includes('localhost') || url.includes('127.0.0.1'))) {
              event.preventDefault();

              // Extract authorization code from URL
              const urlObj = new URL(url);
              const code = urlObj.searchParams.get('code');

              if (code) {
                try {
                  await global.googleAuthManager.handleAuthCallback(code);
                  authWindow.close();

                  // Notify frontend of successful authentication
                  mainWindow.webContents.send('google-drive-auth-success', {
                    message: 'Successfully connected to Google Drive!'
                  });

                  resolve({ success: true, message: 'Authentication successful' });
                } catch (error) {
                  authWindow.close();

                  // Don't send error notification here - let the outer handler handle it
                  reject({ success: false, error: error.message });
                }
              } else {
                authWindow.close();
                reject({ success: false, error: 'No authorization code received' });
              }
            }
          });

          // Also listen for did-navigate events in case will-navigate doesn't catch it
          authWindow.webContents.on('did-navigate', async (event, url) => {
            if (url.includes('code=') && (url.includes('localhost') || url.includes('127.0.0.1'))) {
              // Extract authorization code from URL
              const urlObj = new URL(url);
              const code = urlObj.searchParams.get('code');

              if (code) {
                try {
                  await global.googleAuthManager.handleAuthCallback(code);
                  authWindow.close();

                  // Notify frontend of successful authentication
                  mainWindow.webContents.send('google-drive-auth-success', {
                    message: 'Successfully connected to Google Drive!'
                  });

                  resolve({ success: true, message: 'Authentication successful' });
                } catch (error) {
                  authWindow.close();
                  reject({ success: false, error: error.message });
                }
              }
            }
          });

          // Handle window close without completing auth
          authWindow.on('closed', () => {
            reject({ success: false, error: 'Authentication cancelled' });
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
        global.googleDriveSyncManager = new GoogleDriveSyncManager(global.googleAuthManager);
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

      // Perform sync
      const syncResult = await global.googleDriveSyncManager.sync({
        localData: localData.data,
        strategy: options.strategy || 'merge'
      });

      if (syncResult.success) {
        // Update sync metadata in database
        global.databaseManager.updateSyncMetadata({
          lastSync: new Date().toISOString(),
          lastSyncVersion: localData.data.metadata.version
        });

        // If we downloaded data, apply it
        if (syncResult.action === 'download' || syncResult.action === 'merge') {
          // Get the remote data that was downloaded
          const remoteData = await global.googleDriveSyncManager.downloadData();
          const importResult = global.databaseManager.importDataFromSync(remoteData.data, {
            mergeStrategy: 'merge',
            force: false
          });

          if (importResult.success) {
            // Send updated data back to renderer process to update localStorage
            const updatedData = global.databaseManager.exportDataAsJSON();
            event.sender.send('sync-data-updated', {
              data: updatedData,
              action: syncResult.action,
              stats: syncResult.stats
            });
          }
        } else {
          // For upload-only syncs, still send updated data to refresh UI
          // (sync metadata may have been updated, or other local changes need to be reflected)
          const updatedData = global.databaseManager.exportDataAsJSON();
          event.sender.send('sync-data-updated', {
            data: updatedData,
            action: syncResult.action,
            stats: syncResult.stats
          });
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
        global.googleDriveSyncManager = new GoogleDriveSyncManager(global.googleAuthManager);
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
        global.googleDriveSyncManager = new GoogleDriveSyncManager(global.googleAuthManager);
      }

      if (!global.databaseManager) {
        throw new Error('Database manager not available');
      }

      const downloadResult = await global.googleDriveSyncManager.downloadData();

      if (downloadResult.data) {
        const importResult = global.databaseManager.importDataFromSync(downloadResult.data, {
          mergeStrategy: 'merge',
          force: false
        });

        return {
          success: true,
          ...downloadResult,
          importResult: importResult
        };
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
        inProgress: false
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
          click: () => {
            app.quit();
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
