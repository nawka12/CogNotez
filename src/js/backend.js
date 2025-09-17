// Backend API module for CogNotez
// Handles server-side operations and external integrations

class BackendAPI {
    constructor() {
        this.baseURL = 'http://localhost:3000'; // For potential future backend server
        this.isConnected = false;
        this.app = null; // Reference to main app for database access
    }

    setAppReference(app) {
        this.app = app;
    }

    async initialize() {
        // Initialize backend connections if needed
        console.log('Backend API initialized');
    }

    // File operations (handled by Electron main process)
    async saveFile(content, filename, format = 'md') {
        const { ipcRenderer } = require('electron');

        try {
            const result = await ipcRenderer.invoke('show-save-dialog', {
                defaultPath: filename,
                filters: [
                    { name: format === 'md' ? 'Markdown' : 'Text', extensions: [format] }
                ]
            });

            if (!result.canceled) {
                const fs = require('fs').promises;
                await fs.writeFile(result.filePath, content, 'utf8');
                return result.filePath;
            }
        } catch (error) {
            console.error('Error saving file:', error);
            throw error;
        }
    }

    async loadFile() {
        const { ipcRenderer } = require('electron');

        try {
            const result = await ipcRenderer.invoke('show-open-dialog', {
                filters: [
                    { name: 'Markdown', extensions: ['md'] },
                    { name: 'Text', extensions: ['txt'] },
                    { name: 'JSON', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                ],
                properties: ['openFile']
            });

            if (!result.canceled && result.filePaths.length > 0) {
                const fs = require('fs').promises;
                const content = await fs.readFile(result.filePaths[0], 'utf8');
                const filename = require('path').basename(result.filePaths[0]);
                return { content, filename, path: result.filePaths[0] };
            }
        } catch (error) {
            console.error('Error loading file:', error);
            throw error;
        }
    }

    async loadBackupFile() {
        const { ipcRenderer } = require('electron');

        try {
            const result = await ipcRenderer.invoke('show-open-dialog', {
                filters: [
                    { name: 'CogNotez Backup', extensions: ['json'] },
                    { name: 'JSON Files', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                ],
                properties: ['openFile']
            });

            if (!result.canceled && result.filePaths.length > 0) {
                const fs = require('fs').promises;
                const content = await fs.readFile(result.filePaths[0], 'utf8');
                const filename = require('path').basename(result.filePaths[0]);
                return { content, filename, path: result.filePaths[0] };
            }
        } catch (error) {
            console.error('Error loading backup file:', error);
            throw error;
        }
    }

    // Export utilities
    async exportNote(note, format = 'markdown') {
        let content = '';
        let filename = '';

        if (format === 'markdown') {
            content = `# ${note.title}\n\n${note.content}`;
            filename = `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
        } else {
            content = `${note.title}\n\n${note.content}`;
            filename = `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
        }

        return await this.saveFile(content, filename, format === 'markdown' ? 'md' : 'txt');
    }

    async exportAllNotes(notes, format = 'markdown') {
        let content = '# All Notes Export\n\n';
        const timestamp = new Date().toISOString().split('T')[0];

        notes.forEach(note => {
            content += `## ${note.title}\n\n`;
            content += `*Created: ${note.created ? new Date(note.created).toLocaleDateString() : 'Unknown'}*\n`;
            content += `*Modified: ${note.modified ? new Date(note.modified).toLocaleDateString() : 'Unknown'}*\n\n`;
            content += `${note.content}\n\n`;
            content += `---\n\n`;
        });

        const filename = `cognotez_export_${timestamp}.${format === 'markdown' ? 'md' : 'txt'}`;
        return await this.saveFile(content, filename, format === 'markdown' ? 'md' : 'txt');
    }

    // Enhanced export with JSON format for full data portability
    async exportDatabaseJSON(notes, settings = {}) {
        // Get data from the database manager
        if (!this.app || !this.app.notesManager || !this.app.notesManager.db) {
            throw new Error('Database manager not available');
        }

        const dbManager = this.app.notesManager.db;
        const jsonData = dbManager.exportDataAsJSON();

        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `cognotez_backup_${timestamp}.json`;

        return await this.saveFile(jsonData, filename, 'json');
    }

    // Import utilities
    async importNote() {
        try {
            const fileData = await this.loadFile();
            if (fileData) {
                const title = this.extractTitleFromFilename(fileData.filename);
                return {
                    title: title,
                    content: fileData.content,
                    imported: true,
                    sourcePath: fileData.path
                };
            }
        } catch (error) {
            console.error('Error importing note:', error);
            throw error;
        }
    }

    // Enhanced import with JSON format support for full data portability
    async importDatabaseJSON() {
        try {
            console.log('[DEBUG] Starting JSON import process...');

            const fileData = await this.loadFile();
            if (!fileData) {
                throw new Error('No file selected for import');
            }

            if (!fileData.filename.endsWith('.json')) {
                throw new Error('Selected file is not a JSON file. Please select a .json file exported from CogNotez.');
            }

            console.log('[DEBUG] Parsing JSON data...');
            let importData;
            try {
                importData = JSON.parse(fileData.content);
            } catch (parseError) {
                throw new Error('Invalid JSON file format. The file may be corrupted or not a valid CogNotez export.');
            }

            // Validate import data structure
            if (!importData.notes || typeof importData.notes !== 'object') {
                throw new Error('Invalid import file: missing or invalid notes data. This doesn\'t appear to be a CogNotez export file.');
            }

            if (importData.app !== 'CogNotez' && importData.app !== undefined) {
                console.warn('[DEBUG] Import file app field:', importData.app);
                // Don't throw error, just warn - could be a manual export
            }

            console.log(`[DEBUG] Processing ${Object.keys(importData.notes).length} notes...`);

            // Get database manager
            if (!this.app || !this.app.notesManager || !this.app.notesManager.db) {
                throw new Error('Database manager not available');
            }

            const dbManager = this.app.notesManager.db;

            // Import the data directly to localStorage
            const success = dbManager.importDataFromJSON(fileData.content);

            if (!success) {
                throw new Error('Failed to import data to localStorage');
            }

            const notesCount = Object.keys(importData.notes).length;

            console.log(`[DEBUG] Successfully imported ${notesCount} notes`);

            const result = {
                notes: Object.values(importData.notes),
                settings: importData.settings || {},
                metadata: {
                    ...importData.metadata,
                    totalNotesImported: notesCount,
                    totalNotesInFile: notesCount,
                    validationErrors: [],
                    successful: true
                },
                version: importData.version || 'unknown'
            };

            console.log('[DEBUG] Import completed successfully');
            return result;

        } catch (error) {
            console.error('[DEBUG] Error importing JSON database:', error);
            // Enhance error message for user
            if (error.message.includes('No file selected')) {
                throw new Error('Please select a file to import.');
            } else if (error.message.includes('Invalid JSON')) {
                throw new Error('The selected file is not a valid JSON file. Please ensure it\'s a CogNotez export file.');
            } else if (error.message.includes('missing or invalid notes data')) {
                throw new Error('The selected file does not contain valid CogNotez data.');
            } else {
                throw new Error(`Import failed: ${error.message}`);
            }
        }
    }



    // Bulk import from multiple files
    async importMultipleFiles() {
        try {
            const { ipcRenderer } = require('electron');
            const fs = require('fs').promises;

            const result = await ipcRenderer.invoke('show-open-dialog', {
                filters: [
                    { name: 'All Supported Files', extensions: ['md', 'txt', 'json'] },
                    { name: 'Markdown', extensions: ['md'] },
                    { name: 'Text', extensions: ['txt'] },
                    { name: 'JSON', extensions: ['json'] }
                ],
                properties: ['openFile', 'multiSelections']
            });

            if (!result.canceled && result.filePaths.length > 0) {
                // Get database manager
                if (!this.app || !this.app.notesManager || !this.app.notesManager.db) {
                    throw new Error('Database manager not available');
                }

                const dbManager = this.app.notesManager.db;
                const importedNotes = [];
                const notes = {};

                for (const filePath of result.filePaths) {
                    try {
                        const content = await fs.readFile(filePath, 'utf8');
                        const filename = require('path').basename(filePath);

                        const title = this.extractTitleFromFilename(filename);
                        const noteId = this.generateId();

                        const note = {
                            id: noteId,
                            title: title,
                            content: content,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            preview: this.generatePreview(content),
                            tags: [],
                            category: null,
                            is_favorite: false,
                            is_archived: false,
                            word_count: this.calculateWordCount(content),
                            char_count: content.length,
                            created: new Date(),
                            modified: new Date(),
                            imported: true,
                            import_date: new Date().toISOString(),
                            source: 'bulk_import',
                            source_path: filePath
                        };

                        notes[noteId] = note;
                        importedNotes.push(note);
                    } catch (error) {
                        console.warn(`Failed to import ${filePath}:`, error.message);
                    }
                }

                // Add all notes to database
                Object.assign(dbManager.data.notes, notes);
                dbManager.saveToLocalStorage();

                return {
                    notes: importedNotes,
                    metadata: {
                        totalFiles: result.filePaths.length,
                        successfulImports: importedNotes.length,
                        failedImports: result.filePaths.length - importedNotes.length
                    }
                };
            }
        } catch (error) {
            console.error('Error in bulk import:', error);
            throw new Error(`Bulk import failed: ${error.message}`);
        }
    }

    extractTitleFromFilename(filename) {
        // Remove extension and convert to readable title
        const nameWithoutExt = filename.replace(/\.(md|txt|json|enex|one|onetoc2)$/i, '');
        return nameWithoutExt
            .replace(/[_-]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    generatePreview(content) {
        if (!content) return '';

        // Extract first non-empty line or first 100 characters
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length > 0) {
            const firstLine = lines[0].trim();
            return firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;
        }

        // Fallback to first 100 characters
        return content.substring(0, 100) + (content.length > 100 ? '...' : '');
    }

    calculateWordCount(content) {
        if (!content) return 0;

        // Remove markdown formatting and count words
        const cleanContent = content
            .replace(/[#*_`~\[\]()]/g, '') // Remove markdown symbols
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();

        return cleanContent ? cleanContent.split(' ').length : 0;
    }

    // Backup and restore (localStorage-based)
    async createBackup() {
        const { ipcRenderer } = require('electron');
        const fs = require('fs').promises;

        try {
            // Get data from the database manager
            if (!this.app || !this.app.notesManager || !this.app.notesManager.db) {
                throw new Error('Database manager not available');
            }

            const dbManager = this.app.notesManager.db;

            // Export data as JSON
            const jsonData = dbManager.exportDataAsJSON();

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFilename = `cognotez_backup_${timestamp}.json`;

            const result = await ipcRenderer.invoke('show-save-dialog', {
                defaultPath: backupFilename,
                filters: [{ name: 'CogNotez Backup', extensions: ['json'] }]
            });

            if (!result.canceled) {
                console.log('[DEBUG] Creating backup at:', result.filePath);
                await fs.writeFile(result.filePath, jsonData, 'utf8');

                // Verify the backup was created successfully
                const backupStats = await fs.stat(result.filePath);
                console.log('[DEBUG] Backup created successfully, size:', backupStats.size, 'bytes');

                return result.filePath;
            } else {
                console.log('[DEBUG] Backup cancelled by user');
                return null;
            }
        } catch (error) {
            console.error('[DEBUG] Error creating backup:', error);

            // Provide more specific error messages
            if (error.code === 'EACCES' || error.code === 'EPERM') {
                throw new Error('Permission denied: Cannot write to the selected backup location. Please choose a different directory.');
            } else if (error.code === 'ENOSPC') {
                throw new Error('Not enough disk space to create backup.');
            } else {
                throw new Error(`Backup failed: ${error.message}`);
            }
        }
    }

    async restoreBackup() {
        const fs = require('fs').promises;

        try {
            const fileData = await this.loadBackupFile();
            if (!fileData) {
                throw new Error('No backup file selected');
            }

            if (!fileData.filename.endsWith('.json')) {
                throw new Error('Selected file is not a valid CogNotez backup (.json file required)');
            }

            console.log('[DEBUG] Restoring backup from:', fileData.path);

            // Verify the backup file before restoring
            const backupStats = await fs.stat(fileData.path);
            console.log('[DEBUG] Backup file size:', backupStats.size, 'bytes');

            if (backupStats.size === 0) {
                throw new Error('Backup file is empty or corrupted');
            }

            // Read and validate backup content
            const backupContent = await fs.readFile(fileData.path, 'utf8');
            let backupData;

            try {
                backupData = JSON.parse(backupContent);
            } catch (parseError) {
                throw new Error('Backup file contains invalid JSON data');
            }

            // Validate backup structure
            if (!backupData.notes || typeof backupData.notes !== 'object') {
                throw new Error('Backup file does not contain valid CogNotez data');
            }

            // Get database manager
            if (!this.app || !this.app.notesManager || !this.app.notesManager.db) {
                throw new Error('Database manager not available');
            }

            const dbManager = this.app.notesManager.db;

            // Create a backup of current data before restoring
            const currentBackup = dbManager.exportDataAsJSON();
            console.log('[DEBUG] Created backup of current data before restore');

            // Restore the backup data
            console.log('[DEBUG] Restoring backup data to localStorage');
            const success = dbManager.importDataFromJSON(backupContent);

            if (!success) {
                throw new Error('Failed to import backup data');
            }

            console.log('[DEBUG] Backup restored successfully');

            return true;
        } catch (error) {
            console.error('[DEBUG] Error restoring backup:', error);

            // Provide more specific error messages
            if (error.code === 'ENOENT') {
                throw new Error('Backup file not found or inaccessible.');
            } else if (error.code === 'EACCES' || error.code === 'EPERM') {
                throw new Error('Permission denied: Cannot read backup file.');
            } else if (error.message.includes('Invalid JSON')) {
                throw new Error('Backup file is corrupted or contains invalid data.');
            } else if (error.message.includes('not contain valid CogNotez data')) {
                throw new Error('Selected file is not a valid CogNotez backup.');
            } else {
                throw new Error(`Restore failed: ${error.message}`);
            }
        }
    }

    // Settings management
    async exportSettings() {
        const settings = {
            theme: localStorage.getItem('theme') || 'light',
            exportFormat: localStorage.getItem('exportFormat') || 'markdown',
            autoSave: localStorage.getItem('autoSave') === 'true',
            wordCount: localStorage.getItem('showWordCount') === 'true'
        };

        const content = JSON.stringify(settings, null, 2);
        const filename = 'cognotez_settings.json';

        return await this.saveFile(content, filename, 'json');
    }

    async importSettings() {
        try {
            const fileData = await this.loadFile();
            if (fileData && fileData.filename.endsWith('.json')) {
                const settings = JSON.parse(fileData.content);

                if (settings.theme) localStorage.setItem('theme', settings.theme);
                if (settings.exportFormat) localStorage.setItem('exportFormat', settings.exportFormat);
                if (typeof settings.autoSave === 'boolean') localStorage.setItem('autoSave', settings.autoSave.toString());
                if (typeof settings.wordCount === 'boolean') localStorage.setItem('showWordCount', settings.wordCount.toString());

                return settings;
            }
        } catch (error) {
            console.error('Error importing settings:', error);
            throw error;
        }
    }

    // Statistics and analytics
    async generateReport(notes) {
        const report = {
            totalNotes: notes.length,
            totalWords: notes.reduce((sum, note) => sum + (note.word_count || 0), 0),
            totalChars: notes.reduce((sum, note) => sum + (note.char_count || 0), 0),
            favoriteNotes: notes.filter(note => note.is_favorite).length,
            archivedNotes: notes.filter(note => note.is_archived).length,
            recentNotes: notes.filter(note => {
                const daysSinceModified = (Date.now() - new Date(note.modified || note.updated_at)) / (1000 * 60 * 60 * 24);
                return daysSinceModified <= 7;
            }).length,
            generatedAt: new Date().toISOString()
        };

        const content = `# CogNotez Statistics Report

Generated on: ${new Date(report.generatedAt).toLocaleDateString()}

## Overview
- **Total Notes**: ${report.totalNotes}
- **Total Words**: ${report.totalWords.toLocaleString()}
- **Total Characters**: ${report.totalChars.toLocaleString()}
- **Favorite Notes**: ${report.favoriteNotes}
- **Archived Notes**: ${report.archivedNotes}
- **Recent Notes (7 days)**: ${report.recentNotes}

## Notes List

${notes.map(note => `- **${note.title}** (${note.word_count || 0} words) - ${new Date(note.modified || note.updated_at).toLocaleDateString()}`).join('\n')}
`;

        const filename = `cognotez_report_${new Date().toISOString().split('T')[0]}.md`;
        return await this.saveFile(content, filename, 'md');
    }

    // Sharing functionality
    async shareNoteToClipboard(note, format = 'markdown') {
        try {
            let content = '';

            if (format === 'markdown') {
                content = `# ${note.title}\n\n${note.content}`;
            } else {
                content = `${note.title}\n\n${note.content}`;
            }

            // Use Electron's clipboard API
            const { clipboard } = require('electron');
            clipboard.writeText(content);

            return true;
        } catch (error) {
            console.error('Error sharing to clipboard:', error);
            return false;
        }
    }

    async shareNoteAsFile(note, format = 'markdown') {
        return await this.exportNote(note, format);
    }

    async shareMultipleNotes(notes, format = 'markdown') {
        try {
            let content = '# Shared Notes\n\n';

            notes.forEach((note, index) => {
                content += `## ${note.title}\n\n`;
                content += `*Shared on: ${new Date().toLocaleDateString()}*\n\n`;
                content += `${note.content}\n\n`;
                if (index < notes.length - 1) {
                    content += '---\n\n';
                }
            });

            const filename = `shared_notes_${new Date().toISOString().split('T')[0]}.${format === 'markdown' ? 'md' : 'txt'}`;
            return await this.saveFile(content, filename, format === 'markdown' ? 'md' : 'txt');
        } catch (error) {
            console.error('Error sharing multiple notes:', error);
            throw error;
        }
    }

    // URL generation for sharing (future feature)
    generateShareableLink(note) {
        // This would generate a shareable link for web access
        // For now, return a placeholder
        const shareId = btoa(note.id).replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
        return `cognotez://share/${shareId}`;
    }

    // Migration wizard functionality
    async performMigration(sourcePath, targetPath, options = {}) {
        try {
            const migrationReport = {
                success: true,
                steps: [],
                errors: [],
                stats: {
                    notesMigrated: 0,
                    settingsMigrated: false,
                    aiConversationsMigrated: 0
                }
            };

            // Step 1: Validate source
            migrationReport.steps.push('Validating source file...');
            const sourceExists = await this.validateMigrationSource(sourcePath);
            if (!sourceExists) {
                throw new Error('Source file not found or invalid');
            }

            // Step 2: Backup current data
            if (options.createBackup) {
                migrationReport.steps.push('Creating backup of current data...');
                const backupResult = await this.createBackup();
                if (backupResult) {
                    migrationReport.steps.push('Backup created successfully');
                } else {
                    migrationReport.errors.push('Failed to create backup');
                }
            }

            // Step 3: Import data from source
            migrationReport.steps.push('Importing data from source...');
            const importResult = await this.importDatabaseJSON();

            if (importResult && importResult.notes) {
                migrationReport.stats.notesMigrated = importResult.notes.length;
                migrationReport.steps.push(`Imported ${importResult.notes.length} notes`);
            }

            // Step 4: Apply settings
            if (options.migrateSettings && importResult.settings) {
                migrationReport.steps.push('Migrating settings...');
                await this.applyMigratedSettings(importResult.settings);
                migrationReport.stats.settingsMigrated = true;
                migrationReport.steps.push('Settings migrated successfully');
            }

            // Step 5: Validate migration
            migrationReport.steps.push('Validating migration...');
            const validationResult = await this.validateMigration(importResult);
            if (validationResult.valid) {
                migrationReport.steps.push('Migration validation passed');
            } else {
                migrationReport.errors.push(...validationResult.errors);
            }

            migrationReport.steps.push('Migration completed');
            return migrationReport;

        } catch (error) {
            console.error('Migration failed:', error);
            return {
                success: false,
                steps: [],
                errors: [error.message],
                stats: { notesMigrated: 0, settingsMigrated: false, aiConversationsMigrated: 0 }
            };
        }
    }

    async validateMigrationSource(sourcePath) {
        try {
            const fs = require('fs').promises;
            await fs.access(sourcePath);

            const content = await fs.readFile(sourcePath, 'utf8');
            const data = JSON.parse(content);

            return data.notes && Array.isArray(data.notes) && data.app === 'CogNotez';
        } catch (error) {
            return false;
        }
    }

    async applyMigratedSettings(settings) {
        try {
            for (const [key, value] of Object.entries(settings)) {
                localStorage.setItem(key, JSON.stringify(value));
            }
        } catch (error) {
            console.error('Error applying migrated settings:', error);
        }
    }

    async validateMigration(importResult) {
        const errors = [];
        let valid = true;

        if (!importResult.notes || importResult.notes.length === 0) {
            errors.push('No notes found in imported data');
            valid = false;
        }

        // Check for required fields in notes
        importResult.notes.forEach((note, index) => {
            if (!note.title || !note.content) {
                errors.push(`Note ${index + 1} is missing required fields`);
                valid = false;
            }
        });

        return { valid, errors };
    }

    // Enhanced data synchronization
    async syncWithExternalSource(sourceConfig) {
        // Placeholder for future cloud sync functionality
        // This could integrate with services like Google Drive, Dropbox, etc.
        console.log('Sync functionality not yet implemented');
        return { success: false, message: 'Sync functionality not yet implemented' };
    }

    // Data integrity verification
    async verifyDataIntegrity(notes) {
        const report = {
            totalNotes: notes.length,
            validNotes: 0,
            corruptedNotes: 0,
            missingFields: [],
            issues: []
        };

        notes.forEach((note, index) => {
            let isValid = true;

            if (!note.id) {
                report.missingFields.push(`Note ${index + 1}: missing id`);
                isValid = false;
            }
            if (!note.title) {
                report.missingFields.push(`Note ${index + 1}: missing title`);
                isValid = false;
            }
            if (!note.content) {
                report.missingFields.push(`Note ${index + 1}: missing content`);
                isValid = false;
            }

            if (isValid) {
                report.validNotes++;
            } else {
                report.corruptedNotes++;
            }
        });

        return report;
    }

    // Utility methods
    async getAppInfo() {
        const { ipcRenderer } = require('electron');

        try {
            const appPath = await ipcRenderer.invoke('get-app-path');
            const packageInfo = require('../../../package.json');

            return {
                version: packageInfo.version,
                name: packageInfo.name,
                description: packageInfo.description,
                appPath: appPath,
                platform: process.platform,
                arch: process.arch
            };
        } catch (error) {
            console.error('Error getting app info:', error);
            return {};
        }
    }
}

// Export for use in main app
window.BackendAPI = BackendAPI;
