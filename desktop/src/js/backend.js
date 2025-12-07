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

    async exportNoteAsPDF(note) {
        const { ipcRenderer } = require('electron');
        
        try {
            console.log('[PDF] Starting PDF export for note:', note.title);
            
            // Process note content to resolve media URLs
            let processedContent;
            try {
                // Add timeout to media processing
                processedContent = await Promise.race([
                    this.processContentForPDF(note),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Media processing timeout')), 10000)
                    )
                ]);
            } catch (mediaError) {
                console.warn('[PDF] Media processing failed, using simplified content:', mediaError);
                // Fallback: create simplified content without media
                processedContent = this.simplifyContentForPDF(note.content);
            }
            
            // Create HTML content for PDF generation
            console.log('[PDF] Creating HTML content...');
            const htmlContent = this.createHTMLForPDF(note, processedContent);
            
            // Generate PDF using Electron's printToPDF
            console.log('[PDF] Calling PDF generation handler...');
            const result = await ipcRenderer.invoke('generate-pdf-from-html', {
                html: htmlContent,
                filename: `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`
            });
            
            if (result.success) {
                console.log('[PDF] PDF generation successful:', result.filePath);
                return result.filePath;
            } else if (result.canceled) {
                console.log('[PDF] PDF generation canceled by user');
                return null; // User canceled
            } else {
                console.error('[PDF] PDF generation failed:', result.error);
                throw new Error(result.error || 'PDF generation failed');
            }
        } catch (error) {
            console.error('[PDF] Error exporting note as PDF:', error);
            throw error;
        }
    }

    async processContentForPDF(note) {
        console.log('[PDF] Processing content for PDF...');
        
        if (!note.content) {
            console.log('[PDF] No content to process');
            return note.content;
        }

        // Find all cognotez-media:// URLs
        const mediaUrlPattern = /cognotez-media:\/\/[a-z0-9]+/gi;
        const matches = note.content.match(mediaUrlPattern);
        
        if (!matches || matches.length === 0) {
            console.log('[PDF] No media files found in content');
            return note.content;
        }

        console.log(`[PDF] Found ${matches.length} media files to process`);
        
        let processedContent = note.content;
        const { ipcRenderer } = require('electron');
        
        // Convert media URLs to temporary file paths for PDF embedding
        for (const cognotezUrl of matches) {
            try {
                console.log(`[PDF] Processing media file: ${cognotezUrl}`);
                const fileId = cognotezUrl.replace('cognotez-media://', '');
                
                // Add timeout for media file processing
                const mediaData = await Promise.race([
                    ipcRenderer.invoke('copy-media-file-for-pdf', fileId),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Media processing timeout')), 5000)
                    )
                ]);
                
                if (mediaData && mediaData.tempPath) {
                    // Check if it's a video file
                    if (mediaData.mimeType && mediaData.mimeType.startsWith('video/')) {
                        console.log(`[PDF] Replacing video with placeholder: ${mediaData.filename}`);
                        // For videos, create a placeholder with video icon and filename
                        const fileName = mediaData.filename || `video_${fileId}`;
                        const videoPlaceholder = `<div style="background-color: #f8f9fa; border: 2px dashed #dee2e6; border-radius: 8px; padding: 20px; text-align: center; margin: 15px 0;">
                            <div style="font-size: 24px; margin-bottom: 10px;">🎥</div>
                            <div style="font-weight: bold; color: #495057;">Video File</div>
                            <div style="color: #6c757d; font-size: 14px; margin-top: 5px;">${fileName}</div>
                            <div style="color: #6c757d; font-size: 12px; margin-top: 5px;">(Video files are not playable in PDF format)</div>
                        </div>`;
                        processedContent = processedContent.replace(cognotezUrl, videoPlaceholder);
                    } else {
                        console.log(`[PDF] Replacing image with temp path: ${mediaData.tempPath}`);
                        // For images, use the temporary file path with file:// protocol
                        const fileUrl = `file://${mediaData.tempPath}`;
                        processedContent = processedContent.replace(cognotezUrl, fileUrl);
                    }
                } else {
                    console.warn(`[PDF] No media data returned for: ${cognotezUrl}`);
                    const placeholder = `<div style="background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 10px; margin: 10px 0; color: #6c757d; font-style: italic;">
                        Media file data unavailable
                    </div>`;
                    processedContent = processedContent.replace(cognotezUrl, placeholder);
                }
            } catch (error) {
                console.warn(`[PDF] Failed to process media file ${cognotezUrl}:`, error);
                // Replace with placeholder if processing fails
                const placeholder = `<div style="background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 10px; margin: 10px 0; color: #6c757d; font-style: italic;">
                    Media file unavailable (${error.message})
                </div>`;
                processedContent = processedContent.replace(cognotezUrl, placeholder);
            }
        }

        console.log('[PDF] Content processing completed');
        return processedContent;
    }

    simplifyContentForPDF(content) {
        console.log('[PDF] Simplifying content for PDF (removing media)...');
        
        if (!content) return content;
        
        // Replace all cognotez-media:// URLs with placeholders
        const mediaUrlPattern = /cognotez-media:\/\/[a-z0-9]+/gi;
        const simplifiedContent = content.replace(mediaUrlPattern, (match) => {
            const fileId = match.replace('cognotez-media://', '');
            return `[Media File: ${fileId}]`;
        });
        
        console.log('[PDF] Content simplified');
        return simplifiedContent;
    }

    createHTMLForPDF(note, content) {
        console.log('[PDF] Creating HTML content...');
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
        }
        h1 {
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        h2 {
            color: #34495e;
            margin-top: 30px;
            margin-bottom: 15px;
        }
        h3 {
            color: #7f8c8d;
            margin-top: 25px;
            margin-bottom: 10px;
        }
        p {
            margin-bottom: 15px;
        }
        img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            margin: 15px 0;
            display: block;
        }
        blockquote {
            border-left: 4px solid #3498db;
            margin: 20px 0;
            padding: 10px 20px;
            background-color: #f8f9fa;
            border-radius: 0 4px 4px 0;
        }
        code {
            background-color: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Consolas', monospace;
        }
        pre {
            background-color: #f4f4f4;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
        }
        ul, ol {
            margin-bottom: 15px;
        }
        li {
            margin-bottom: 5px;
        }
        .metadata {
            color: #7f8c8d;
            font-size: 0.9em;
            margin-bottom: 30px;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <h1>${this.escapeHtml(note.title)}</h1>
    
    <div class="metadata">
        <strong>Created:</strong> ${note.created ? new Date(note.created).toLocaleDateString() : 'Unknown'}<br>
        <strong>Modified:</strong> ${note.modified ? new Date(note.modified).toLocaleDateString() : 'Unknown'}<br>
        <strong>Exported:</strong> ${new Date().toLocaleDateString()}
    </div>
    
    <div class="content">
        ${this.markdownToHtml(content)}
    </div>
</body>
</html>`;
        
        console.log('[PDF] HTML content created, length:', html.length);
        return html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    markdownToHtml(markdown) {
        // Use the marked library for proper markdown parsing
        const { marked } = require('marked');
        
        // Configure marked for better HTML output
        marked.setOptions({
            breaks: true,
            gfm: true,
            sanitize: false, // We trust our content
            smartLists: true,
            smartypants: true
        });

        return marked.parse(markdown);
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
                throw new Error('The selected file is not a valid JSON file.');
            } else {
                throw new Error(`Import failed: ${error.message}`);
            }
        }
    }

    // Clear all AI conversations
    async clearOrphanedAIConversations() {
        try {
            if (!this.app || !this.app.notesManager || !this.app.notesManager.db) {
                throw new Error('Database not available');
            }

            const db = this.app.notesManager.db;
            const deletedCount = db.clearOrphanedAIConversations();

            console.log(`[Backend] Cleared ${deletedCount} AI conversations`);
            return {
                success: true,
                deletedCount: deletedCount,
                message: `Successfully cleared ${deletedCount} AI conversations`
            };

        } catch (error) {
            console.error('[Backend] Failed to clear AI conversations:', error);
            return {
                success: false,
                error: error.message
            };
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
        if (!content || !content.trim()) return 'Empty note';

        // Split content into lines
        const lines = content.split('\n');
        
        for (let line of lines) {
            line = line.trim();
            
            // Skip empty lines
            if (!line) continue;
            
            // Skip image markdown: ![alt](url) or ![alt][ref]
            if (/^!\[.*?\](\(.*?\)|\[.*?\])/.test(line)) continue;
            
            // Skip HTML image tags: <img src="..." />
            if (/^<img\s+.*?>/.test(line)) continue;
            
            // Skip standalone HTML tags without content
            if (/^<[^>]+>$/.test(line)) continue;
            
            // Skip video/audio markdown embeds
            if (/^<(video|audio|iframe)\s+.*?>/.test(line)) continue;
            
            // Clean the line for preview
            let preview = line;
            
            // Remove markdown headers (# ## ### etc)
            preview = preview.replace(/^#+\s*/, '');
            
            // Remove HTML tags but keep content
            preview = preview.replace(/<[^>]+>/g, '');
            
            // Convert markdown links [text](url) to just text
            preview = preview.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
            
            // Convert markdown bold/italic to plain text
            preview = preview.replace(/\*\*([^\*]+)\*\*/g, '$1'); // bold
            preview = preview.replace(/\*([^\*]+)\*/g, '$1'); // italic
            preview = preview.replace(/__([^_]+)__/g, '$1'); // bold
            preview = preview.replace(/_([^_]+)_/g, '$1'); // italic
            
            // Remove inline code backticks
            preview = preview.replace(/`([^`]+)`/g, '$1');
            
            // Remove remaining markdown image syntax if any
            preview = preview.replace(/!\[.*?\]\(.*?\)/g, '');
            
            // Clean up extra whitespace
            preview = preview.trim();
            
            // If we have actual content after cleaning, use it
            if (preview) {
                return preview.length > 100 ? preview.substring(0, 100) + '...' : preview;
            }
        }
        
        // If no meaningful content found, return fallback
        return 'Empty note';
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
        if (format === 'pdf') {
            return await this.exportNoteAsPDF(note);
        }
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

    async shareNoteOnGoogleDrive(note, permissions = { view: true, comment: false, edit: false }, email = null) {
        try {
            // Call IPC handler in main process
            const { ipcRenderer } = require('electron');
            const result = await ipcRenderer.invoke('google-drive-share-note', {
                note: note,
                permissions: permissions,
                email: email
            });

            if (!result.success) {
                throw new Error(result.error || 'Failed to share note on Google Drive');
            }

            return result;
        } catch (error) {
            console.error('Error sharing note on Google Drive:', error);
            throw error;
        }
    }

    async revokeGoogleDriveShare(fileId, noteId) {
        try {
            const { ipcRenderer } = require('electron');
            const result = await ipcRenderer.invoke('google-drive-revoke-share', {
                fileId: fileId,
                noteId: noteId
            });

            if (!result.success) {
                throw new Error(result.error || 'Failed to revoke share');
            }

            return result;
        } catch (error) {
            console.error('Error revoking Google Drive share:', error);
            throw error;
        }
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

    // Google Drive sync methods
    async connectGoogleDrive() {
        try {
            const { ipcRenderer } = require('electron');
            const result = await ipcRenderer.invoke('google-drive-authenticate');

            if (result.success) {
                // Enable sync in database
                if (this.app && this.app.notesManager && this.app.notesManager.db) {
                    this.app.notesManager.db.enableSync('google-drive');
                }
                console.log('[Backend] Google Drive connected successfully');
                return { success: true, message: result.message };
            } else {
                console.error('[Backend] Google Drive authentication failed:', result.error);
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('[Backend] Failed to connect Google Drive:', error);
            return { success: false, error: error.message };
        }
    }

    async disconnectGoogleDrive() {
        try {
            const { ipcRenderer } = require('electron');
            const result = await ipcRenderer.invoke('google-drive-disconnect');

            if (result.success) {
                console.log('[Backend] Google Drive disconnected successfully');
                return { success: true };
            } else {
                console.error('[Backend] Failed to disconnect Google Drive:', result.error);
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('[Backend] Failed to disconnect Google Drive:', error);
            return { success: false, error: error.message };
        }
    }

    async getGoogleDriveAuthStatus() {
        try {
            const { ipcRenderer } = require('electron');
            const status = await ipcRenderer.invoke('google-drive-get-auth-status');
            return status;
        } catch (error) {
            console.error('[Backend] Failed to get Google Drive auth status:', error);
            return { isAuthenticated: false, error: error.message };
        }
    }

    async syncWithGoogleDrive(options = {}) {
        try {
            const { ipcRenderer } = require('electron');

            // If localData is provided, use it instead of getting from main process database
            if (options.localData) {
                console.log('[Backend] Using provided localData for sync');
                if (options.localChecksum) {
                    console.log('[Backend] Using provided localChecksum:', options.localChecksum.substring(0, 16) + '...');
                }
            }

            const result = await ipcRenderer.invoke('google-drive-sync', options);

            if (result.success) {
                console.log('[Backend] Google Drive sync completed successfully');
                return result;
            } else {
                console.error('[Backend] Google Drive sync failed:', result.error);
                return result;
            }
        } catch (error) {
            console.error('[Backend] Failed to sync with Google Drive:', error);
            return { success: false, error: error.message };
        }
    }

    async uploadToGoogleDrive() {
        try {
            const { ipcRenderer } = require('electron');
            const result = await ipcRenderer.invoke('google-drive-upload');

            if (result.success) {
                console.log('[Backend] Upload to Google Drive completed successfully');
                return result;
            } else {
                console.error('[Backend] Upload to Google Drive failed:', result.error);
                return result;
            }
        } catch (error) {
            console.error('[Backend] Failed to upload to Google Drive:', error);
            return { success: false, error: error.message };
        }
    }

    async downloadFromGoogleDrive() {
        try {
            const { ipcRenderer } = require('electron');
            const result = await ipcRenderer.invoke('google-drive-download');

            if (result.success) {
                console.log('[Backend] Download from Google Drive completed successfully');
                return result;
            } else {
                console.error('[Backend] Download from Google Drive failed:', result.error);
                return result;
            }
        } catch (error) {
            console.error('[Backend] Failed to download from Google Drive:', error);
            return { success: false, error: error.message };
        }
    }

    async getGoogleDriveSyncStatus() {
        try {
            const { ipcRenderer } = require('electron');
            const status = await ipcRenderer.invoke('google-drive-get-sync-status');
            return status;
        } catch (error) {
            console.error('[Backend] Failed to get Google Drive sync status:', error);
            return { error: error.message };
        }
    }

    async setupGoogleDriveCredentials(credentialsPath) {
        try {
            const { ipcRenderer } = require('electron');
            const result = await ipcRenderer.invoke('google-drive-setup-credentials', credentialsPath);

            if (result.success) {
                console.log('[Backend] Google Drive credentials setup successfully');
                return result;
            } else {
                console.error('[Backend] Failed to setup Google Drive credentials:', result.error);
                return result;
            }
        } catch (error) {
            console.error('[Backend] Failed to setup Google Drive credentials:', error);
            return { success: false, error: error.message };
        }
    }

    // Enhanced data synchronization
    async syncWithExternalSource(sourceConfig) {
        try {
            if (sourceConfig.provider === 'google-drive') {
                return await this.syncWithGoogleDrive(sourceConfig.options || {});
            } else {
                // Future support for other providers like Dropbox, etc.
                console.log(`[Backend] Sync provider '${sourceConfig.provider}' not yet implemented`);
                return { success: false, message: `Sync provider '${sourceConfig.provider}' not yet implemented` };
            }
        } catch (error) {
            console.error('[Backend] External sync failed:', error);
            return { success: false, error: error.message };
        }
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
// Use window for renderer process, module.exports for main process
if (typeof window !== 'undefined') {
    window.BackendAPI = BackendAPI;
} else {
    module.exports = { BackendAPI };
}
