// Rich Media Support Manager
class RichMediaManager {
    constructor(app) {
        this.app = app;
        this.attachments = new Map(); // noteId -> attachments array
        this.maxFileSize = 50 * 1024 * 1024; // 50MB max file size
        this.supportedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
        this.supportedVideoTypes = ['video/mp4', 'video/webm', 'video/ogg'];
        this.supportedAudioTypes = ['audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/wav'];
        this.mediaDirectory = null; // Will be set during initialization
        this.useFileSystem = true; // Use file system instead of base64
    }

    async initialize() {
        console.log('[RichMedia] Initializing rich media manager...');
        await this.initializeMediaDirectory();
        await this.loadAttachments();
        this.setupEventListeners();
        this.createMediaToolbar();
        console.log('[RichMedia] Rich media initialized');
    }

    async initializeMediaDirectory() {
        try {
            // Get media directory path from main process
            let ipcRenderer = null;
            
            // Try window.electron first (if preload script sets it)
            if (window.electron && window.electron.ipcRenderer) {
                ipcRenderer = window.electron.ipcRenderer;
            } else {
                // Try to require electron directly (works with nodeIntegration: true)
                try {
                    const electron = require('electron');
                    ipcRenderer = electron.ipcRenderer;
                } catch (err) {
                    console.log('[RichMedia] Electron not available, will use IndexedDB');
                }
            }
            
            if (ipcRenderer) {
                this.mediaDirectory = await ipcRenderer.invoke('get-media-directory');
                console.log('[RichMedia] Media directory:', this.mediaDirectory);
                this.useFileSystem = true;
            } else {
                // Fallback: use IndexedDB for web version
                this.useFileSystem = false;
                console.log('[RichMedia] Using IndexedDB for media storage');
                await this.initializeIndexedDB();
            }
        } catch (error) {
            console.error('[RichMedia] Failed to initialize media directory, using IndexedDB fallback:', error);
            this.useFileSystem = false;
            await this.initializeIndexedDB();
        }
    }

    async initializeIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('CogNotezMedia', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.mediaDB = request.result;
                console.log('[RichMedia] IndexedDB initialized');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('media')) {
                    db.createObjectStore('media', { keyPath: 'id' });
                }
            };
        });
    }

    createMediaToolbar() {
        // Add media buttons to existing editor actions toolbar
        const editorActions = document.querySelector('.editor-actions');
        if (!editorActions) return;

        // Create compact media buttons that match existing style
        const mediaButtons = `
            <button id="insert-image-btn" class="action-btn" title="Insert Image">
                <i class="fas fa-image"></i>
            </button>
            <button id="insert-video-btn" class="action-btn" title="Insert Video">
                <i class="fas fa-video"></i>
            </button>
        `;

        // Insert media buttons after the save button
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.insertAdjacentHTML('afterend', mediaButtons);
        } else {
            // Fallback: add at the end of editor actions
            editorActions.insertAdjacentHTML('beforeend', mediaButtons);
        }

        // Setup button handlers
        this.setupToolbarButtons();
    }

    setupToolbarButtons() {
        document.getElementById('insert-image-btn')?.addEventListener('click', () => this.showImageInsertDialog());
        document.getElementById('insert-video-btn')?.addEventListener('click', () => this.showVideoInsertDialog());
    }

    showImageInsertDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = this.supportedImageTypes.join(',');
        input.multiple = true;
        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            for (const file of files) {
                await this.insertImage(file);
            }
        };
        input.click();
    }

    showVideoInsertDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = this.supportedVideoTypes.join(',');
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) await this.insertVideo(file);
        };
        input.click();
    }


    setupEventListeners() {
        // Handle drag and drop for images
        const editor = document.getElementById('note-editor');
        if (editor) {
            editor.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });

            editor.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const files = Array.from(e.dataTransfer.files);
                await this.handleFilesDrop(files);
            });
        }

        // Handle paste events for images
        editor?.addEventListener('paste', async (e) => {
            const items = Array.from(e.clipboardData.items);
            const imageItems = items.filter(item => item.type.startsWith('image/'));
            
            if (imageItems.length > 0) {
                e.preventDefault();
                for (const item of imageItems) {
                    const file = item.getAsFile();
                    if (file) {
                        await this.insertImage(file);
                    }
                }
            }
        });
    }

    async handleFilesDrop(files) {
        for (const file of files) {
            if (this.supportedImageTypes.includes(file.type)) {
                await this.insertImage(file);
            } else if (this.supportedVideoTypes.includes(file.type)) {
                await this.insertVideo(file);
            }
        }
    }

    async insertImage(file) {
        if (!this.app.currentNote) {
            this.app.showNotification?.('Please select a note first', 'warning');
            return;
        }

        if (file.size > this.maxFileSize) {
            this.app.showNotification?.('File too large (max 50MB)', 'error');
            return;
        }

        try {
            // Save file and get reference
            const fileRef = await this.saveMediaFile(file, 'image');
            
            // Insert markdown image syntax with file reference
            const editor = document.getElementById('note-editor');
            if (editor) {
                const cursorPos = editor.selectionStart;
                const imageMarkdown = `\n![${file.name}](cognotez-media://${fileRef.id})\n`;
                
                const before = editor.value.substring(0, cursorPos);
                const after = editor.value.substring(cursorPos);
                editor.value = before + imageMarkdown + after;
                
                // Update cursor position
                editor.selectionStart = editor.selectionEnd = cursorPos + imageMarkdown.length;
                
                // Track this media in the note
                await this.trackMediaInNote(this.app.currentNote.id, fileRef);
                
                // Trigger save
                this.app.saveCurrentNote?.();
                this.app.updatePreview?.();
            }

            this.app.showNotification?.('Image inserted', 'success');

        } catch (error) {
            console.error('[RichMedia] Failed to insert image:', error);
            this.app.showNotification?.('Failed to insert image', 'error');
        }
    }

    async saveMediaFile(file, type) {
        const fileId = this.generateId();
        const fileExt = file.name.split('.').pop();
        const fileName = `${fileId}.${fileExt}`;

        if (this.useFileSystem) {
            // Use file system storage via Electron
            try {
                const electron = require('electron');
                const buffer = await file.arrayBuffer();
                const filePath = await electron.ipcRenderer.invoke('save-media-file', {
                    fileName,
                    buffer: Array.from(new Uint8Array(buffer)),
                    type
                });

                return {
                    id: fileId,
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    path: filePath,
                    storageType: 'filesystem',
                    createdAt: new Date().toISOString()
                };
            } catch (error) {
                console.error('[RichMedia] Filesystem save failed, falling back to IndexedDB:', error);
                this.useFileSystem = false;
                // Fall through to IndexedDB storage
            }
        }
        
        // Use IndexedDB storage
        const buffer = await file.arrayBuffer();
        const fileData = {
            id: fileId,
            name: file.name,
            type: file.type,
            size: file.size,
            data: buffer,
            storageType: 'indexeddb',
            createdAt: new Date().toISOString()
        };

        await this.saveToIndexedDB(fileData);
        return fileData;
    }

    async saveToIndexedDB(fileData) {
        return new Promise((resolve, reject) => {
            const transaction = this.mediaDB.transaction(['media'], 'readwrite');
            const store = transaction.objectStore('media');
            const request = store.put(fileData);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getMediaFile(fileId) {
        // Check if it's a file system reference
        const mediaRef = await this.getMediaReference(fileId);
        
        if (!mediaRef) {
            console.warn('[RichMedia] Media reference not found:', fileId);
            return null;
        }

        if (mediaRef.storageType === 'filesystem') {
            // Get file from file system
            try {
                const electron = require('electron');
                const fileData = await electron.ipcRenderer.invoke('get-media-file', mediaRef.path);
                return fileData;
            } catch (error) {
                console.error('[RichMedia] Filesystem read failed:', error);
                return null;
            }
        } else if (mediaRef.storageType === 'indexeddb') {
            // Get from IndexedDB
            return await this.getFromIndexedDB(fileId);
        }

        return null;
    }

    async getFromIndexedDB(fileId) {
        return new Promise((resolve, reject) => {
            const transaction = this.mediaDB.transaction(['media'], 'readonly');
            const store = transaction.objectStore('media');
            const request = store.get(fileId);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async trackMediaInNote(noteId, fileRef) {
        if (!this.attachments.has(noteId)) {
            this.attachments.set(noteId, []);
        }
        
        this.attachments.get(noteId).push(fileRef);
        await this.saveAttachments(noteId);
    }

    async getMediaReference(fileId) {
        // Get media reference from note attachments
        for (const [noteId, attachments] of this.attachments.entries()) {
            const media = attachments.find(a => a.id === fileId);
            if (media) return media;
        }
        return null;
    }

    /**
     * Resolve cognotez-media:// URL to actual file data URL
     * This is used for rendering in preview mode
     */
    async resolveMediaUrl(cognotezUrl) {
        try {
            // Extract file ID from URL
            const fileId = cognotezUrl.replace('cognotez-media://', '');
            
            if (this.useFileSystem) {
                // In Electron, the protocol handler will handle it
                // Just return the URL as-is, the protocol will intercept it
                return cognotezUrl;
            } else {
                // In browser mode, need to get from IndexedDB and convert to blob URL
                const fileData = await this.getFromIndexedDB(fileId);
                if (fileData && fileData.data) {
                    const blob = new Blob([fileData.data], { type: fileData.type });
                    return URL.createObjectURL(blob);
                }
            }
        } catch (error) {
            console.error('[RichMedia] Failed to resolve media URL:', error);
        }
        
        return cognotezUrl; // Return original if resolution fails
    }

    /**
     * Process note content to ensure all media URLs are resolved
     * This should be called before rendering markdown preview
     */
    async processContentForPreview(content) {
        if (!content) return content;

        // Find all cognotez-media:// URLs
        const mediaUrlPattern = /cognotez-media:\/\/[a-z0-9]+/gi;
        const matches = content.match(mediaUrlPattern);
        
        if (!matches || matches.length === 0) {
            return content;
        }

        let processedContent = content;
        
        // If using file system (Electron), URLs work as-is with protocol handler
        if (this.useFileSystem) {
            return processedContent;
        }

        // For IndexedDB (browser), need to convert to blob URLs
        for (const cognotezUrl of matches) {
            const resolvedUrl = await this.resolveMediaUrl(cognotezUrl);
            processedContent = processedContent.replace(cognotezUrl, resolvedUrl);
        }

        return processedContent;
    }

    async insertVideo(file) {
        if (!this.app.currentNote) {
            this.app.showNotification?.('Please select a note first', 'warning');
            return;
        }

        if (file.size > this.maxFileSize) {
            this.app.showNotification?.('File too large (max 50MB)', 'error');
            return;
        }

        try {
            const fileRef = await this.saveMediaFile(file, 'video');
            
            const editor = document.getElementById('note-editor');
            if (editor) {
                const cursorPos = editor.selectionStart;
                const videoHtml = `\n<video controls width="100%">\n  <source src="cognotez-media://${fileRef.id}" type="${file.type}">\n  Your browser does not support the video tag.\n</video>\n`;
                
                const before = editor.value.substring(0, cursorPos);
                const after = editor.value.substring(cursorPos);
                editor.value = before + videoHtml + after;
                
                editor.selectionStart = editor.selectionEnd = cursorPos + videoHtml.length;
                
                await this.trackMediaInNote(this.app.currentNote.id, fileRef);
                this.app.saveCurrentNote?.();
                this.app.updatePreview?.();
            }

            this.app.showNotification?.('Video inserted', 'success');

        } catch (error) {
            console.error('[RichMedia] Failed to insert video:', error);
            this.app.showNotification?.('Failed to insert video', 'error');
        }
    }

    async insertAudio(file) {
        if (!this.app.currentNote) {
            this.app.showNotification?.('Please select a note first', 'warning');
            return;
        }

        try {
            const fileRef = await this.saveMediaFile(file, 'audio');
            
            const editor = document.getElementById('note-editor');
            if (editor) {
                const cursorPos = editor.selectionStart;
                const audioHtml = `\n<audio controls>\n  <source src="cognotez-media://${fileRef.id}" type="${file.type}">\n  Your browser does not support the audio tag.\n</audio>\n`;
                
                const before = editor.value.substring(0, cursorPos);
                const after = editor.value.substring(cursorPos);
                editor.value = before + audioHtml + after;
                
                editor.selectionStart = editor.selectionEnd = cursorPos + audioHtml.length;
                
                await this.trackMediaInNote(this.app.currentNote.id, fileRef);
                this.app.saveCurrentNote?.();
                this.app.updatePreview?.();
            }

            this.app.showNotification?.('Audio inserted', 'success');

        } catch (error) {
            console.error('[RichMedia] Failed to insert audio:', error);
            this.app.showNotification?.('Failed to insert audio', 'error');
        }
    }

    async addAttachment(file) {
        if (!this.app.currentNote) {
            this.app.showNotification?.('Please select a note first', 'warning');
            return;
        }

        if (file.size > this.maxFileSize) {
            this.app.showNotification?.('File too large (max 50MB)', 'error');
            return;
        }

        try {
            const fileRef = await this.saveMediaFile(file, 'attachment');
            
            // Track as attachment
            await this.trackMediaInNote(this.app.currentNote.id, fileRef);

            this.app.showNotification?.(`Attachment "${file.name}" added`, 'success');
            console.log('[RichMedia] Attachment added:', file.name);

        } catch (error) {
            console.error('[RichMedia] Failed to add attachment:', error);
            this.app.showNotification?.('Failed to add attachment', 'error');
        }
    }

    async removeAttachment(noteId, attachmentId) {
        if (!this.attachments.has(noteId)) return;

        const attachments = this.attachments.get(noteId);
        const index = attachments.findIndex(a => a.id === attachmentId);
        
        if (index === -1) return;

        const attachment = attachments[index];
        attachments.splice(index, 1);

        await this.saveAttachments(noteId);
        
        this.app.showNotification?.(`Attachment "${attachment.name}" removed`, 'success');
    }

    getAttachmentsForNote(noteId) {
        return this.attachments.get(noteId) || [];
    }

    async loadAttachments() {
        try {
            const db = this.app.notesManager?.db;
            if (!db || !db.initialized) return;

            const attachmentsData = db.getSetting('note_attachments', {});
            
            // Convert plain object to Map
            for (const [noteId, attachments] of Object.entries(attachmentsData)) {
                this.attachments.set(noteId, attachments);
            }

            console.log('[RichMedia] Loaded attachments for', this.attachments.size, 'notes');

        } catch (error) {
            console.error('[RichMedia] Failed to load attachments:', error);
        }
    }

    /**
     * Display attachments for current note
     */
    displayAttachments(noteId) {
        const attachments = this.getAttachmentsForNote(noteId);
        
        // Find or create attachments container
        let container = document.getElementById('note-attachments-list');
        if (!container) {
            // Create container below the editor
            const editorWrapper = document.querySelector('.editor-wrapper');
            if (editorWrapper) {
                container = document.createElement('div');
                container.id = 'note-attachments-list';
                container.className = 'note-attachments-container';
                editorWrapper.parentNode.insertBefore(container, editorWrapper.nextSibling);
            }
        }

        if (!container) return;

        if (attachments.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        container.innerHTML = `
            <div class="attachments-header">
                <h4><i class="fas fa-paperclip"></i> Attachments (${attachments.length})</h4>
            </div>
            <div class="attachments-list">
                ${attachments.map(att => this.createAttachmentHTML(att)).join('')}
            </div>
        `;

        // Add download handlers
        attachments.forEach(att => {
            const downloadBtn = container.querySelector(`[data-attachment-id="${att.id}"]`);
            if (downloadBtn) {
                downloadBtn.addEventListener('click', () => this.downloadAttachment(att));
            }
        });
    }

    createAttachmentHTML(attachment) {
        const sizeStr = this.formatFileSize(attachment.size);
        const icon = this.getFileIcon(attachment.type);
        
        return `
            <div class="note-attachment">
                <div class="attachment-icon">${icon}</div>
                <div class="attachment-info">
                    <div class="attachment-name">${attachment.name}</div>
                    <div class="attachment-meta">${sizeStr} • ${new Date(attachment.createdAt).toLocaleDateString()}</div>
                </div>
                <div class="attachment-actions">
                    <button data-attachment-id="${attachment.id}" title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                </div>
            </div>
        `;
    }

    getFileIcon(mimeType) {
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('video/')) return '🎥';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.includes('pdf')) return '📄';
        if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
        return '📎';
    }

    async downloadAttachment(attachment) {
        try {
            // Get file data
            const fileData = await this.getMediaFile(attachment.id);
            
            if (!fileData) {
                this.app.showNotification?.('File not found', 'error');
                return;
            }

            // Trigger download
            const blob = new Blob([fileData.data || fileData]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = attachment.name;
            a.click();
            URL.revokeObjectURL(url);

            this.app.showNotification?.('Downloaded: ' + attachment.name, 'success');
        } catch (error) {
            console.error('[RichMedia] Failed to download attachment:', error);
            this.app.showNotification?.('Failed to download file', 'error');
        }
    }

    async saveAttachments(noteId) {
        try {
            const db = this.app.notesManager?.db;
            if (!db || !db.initialized) return;

            // Get all attachments as plain object
            const attachmentsData = db.getSetting('note_attachments', {});
            attachmentsData[noteId] = this.attachments.get(noteId) || [];
            
            db.setSetting('note_attachments', attachmentsData);

        } catch (error) {
            console.error('[RichMedia] Failed to save attachments:', error);
        }
    }

    // Utility functions
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    async insertImageFromUrl() {
        const url = prompt('Enter image URL:');
        if (!url) return;

        const editor = document.getElementById('note-editor');
        if (editor) {
            const cursorPos = editor.selectionStart;
            const imageMarkdown = `\n![Image](${url})\n`;
            
            const before = editor.value.substring(0, cursorPos);
            const after = editor.value.substring(cursorPos);
            editor.value = before + imageMarkdown + after;
            
            editor.selectionStart = editor.selectionEnd = cursorPos + imageMarkdown.length;
            
            this.app.saveCurrentNote?.();
            this.app.updatePreview?.();
        }
    }

}

// Export for use in main app
if (typeof window !== 'undefined') {
    window.RichMediaManager = RichMediaManager;
}
