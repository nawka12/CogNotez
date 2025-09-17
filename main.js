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
function initApp() {
  createWindow();
  setupAutoUpdater();
  createMenu();
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
