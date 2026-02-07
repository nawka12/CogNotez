
// Tag & Folder Manager - Extracted from app.js
// Manages tag CRUD, folder navigation, and tag-note associations

class TagFolderManager {
    constructor(app) {
        this.app = app;
        this.currentFolder = localStorage.getItem('currentFolder') || 'all';
    }

    // Helper method to display tags in the note editor header
    displayNoteTags(note) {
        const tagsDisplay = document.getElementById('note-tags-display');
        const noteDate = document.getElementById('note-date');
        const noteInfo = document.querySelector('.note-info');

        // Defensive check: ensure required elements exist
        if (!tagsDisplay) {
            console.warn('[displayNoteTags] note-tags-display element not found');
            return;
        }

        if (!note.tags || note.tags.length === 0) {
            tagsDisplay.innerHTML = '';
            // Unwrap tags and date if they were wrapped
            const wrapper = document.querySelector('.tags-date-wrapper');
            if (wrapper && noteInfo) {
                // Move tagsDisplay back to noteInfo before removing wrapper
                if (tagsDisplay.parentElement === wrapper) {
                    noteInfo.appendChild(tagsDisplay);
                }
                // Move noteDate back to noteInfo before removing wrapper
                if (noteDate && noteDate.parentElement === wrapper) {
                    noteInfo.appendChild(noteDate);
                }
                wrapper.remove();
            }
            return;
        }

        let tagsHtml = '<div class="editor-note-tags">';
        note.tags.forEach(tagId => {
            const tagName = this.app.notesManager.getTagName(tagId);
            tagsHtml += `<span class="editor-note-tag">${this.app.escapeHtml(tagName)}</span>`;
        });
        tagsHtml += '</div>';

        tagsDisplay.innerHTML = tagsHtml;

        // Wrap tags and date in a flex container for inline layout when tags exist
        const existingWrapper = document.querySelector('.tags-date-wrapper');
        if (!existingWrapper && noteDate && noteInfo && noteDate.parentElement === noteInfo) {
            const wrapper = document.createElement('div');
            wrapper.className = 'tags-date-wrapper';
            noteInfo.insertBefore(wrapper, tagsDisplay.nextSibling);
            wrapper.appendChild(tagsDisplay);
            wrapper.appendChild(noteDate);
        }
    }

    // Show tag management dialog
    showTagManager() {
        if (!this.app.currentNote) {
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            this.app.showNotification(t('notifications.pleaseSelectNote', 'Please select a note first'), 'info');
            return;
        }

        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        const existingTags = this.app.currentNote.tags || [];
        const allTags = this.app.notesManager.db && this.app.notesManager.db.initialized ?
            this.app.notesManager.db.getAllTags() : [];

        // Create modal HTML
        const modalHtml = `
    <div id="tag-manager-modal" class="modal">
        <div class="modal-content tag-manager-content">
            <div class="modal-header">
                <h3>${t('editor.manageTags', 'Manage Tags')}</h3>
                <button id="tag-manager-close" class="modal-close"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <div class="tag-manager-section">
                    <h4>${t('tags.currentTags', 'Current Tags')}</h4>
                    <div id="current-tags" class="current-tags">
                        ${existingTags.length > 0 ?
                existingTags.map(tagId => {
                    const tagName = this.app.notesManager.getTagName(tagId);
                    return `<span class="tag-item" data-tag-id="${tagId}">
                                            ${this.app.escapeHtml(tagName)}
                                            <button class="tag-remove" data-tag-id="${tagId}">×</button>
                                        </span>`;
                }).join('') :
                `<span class="no-tags">${t('tags.noTagsAssigned', 'No tags assigned')}</span>`
            }
                    </div>
                </div>
                <div class="tag-manager-section">
                    <h4>${t('tags.addTags', 'Add Tags')}</h4>
                    <div class="tag-input-section">
                        <input type="text" id="new-tag-input" placeholder="${t('tags.enterTagName', 'Enter tag name...')}" class="tag-input">
                            <button id="add-tag-btn" class="btn-primary">${t('tags.addTag', 'Add Tag')}</button>
                    </div>
                    <div class="available-tags">
                        <h5>${t('tags.availableTags', 'Available Tags')}</h5>
                        <div id="available-tags-list" class="available-tags-list">
                            ${allTags.filter(tag => !existingTags.includes(tag.id)).map(tag =>
                `<span class="available-tag" data-tag-id="${tag.id}">
                                            ${this.app.escapeHtml(tag.name)}
                                        </span>`
            ).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>
            </div>
    `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Set up event listeners
        this.setupTagManagerEvents();
    }

    // Set up tag manager event listeners
    setupTagManagerEvents() {
        const modal = document.getElementById('tag-manager-modal');
        const closeBtn = document.getElementById('tag-manager-close');
        const addBtn = document.getElementById('add-tag-btn');
        const tagInput = document.getElementById('new-tag-input');

        // Close modal
        closeBtn.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        // Add new tag
        addBtn.addEventListener('click', () => this.addNewTag());
        tagInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addNewTag();
        });

        // Remove tag
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-remove')) {
                const tagId = e.target.dataset.tagId;
                this.removeTagFromNote(tagId);
            }
        });

        // Add existing tag
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('available-tag')) {
                const tagId = e.target.dataset.tagId;
                this.addTagToNote(tagId);
            }
        });
    }

    // Add a new tag to the note
    async addNewTag() {
        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        const input = document.getElementById('new-tag-input');
        const tagName = input.value.trim();

        if (!tagName) {
            this.app.showNotification(t('notifications.pleaseEnterTagName', 'Please enter a tag name'), 'warning');
            return;
        }

        try {
            // Check if tag already exists
            let existingTag = null;
            if (this.app.notesManager.db && this.app.notesManager.db.initialized) {
                const allTags = this.app.notesManager.db.getAllTags();
                existingTag = allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
            }

            let tagId;
            if (existingTag) {
                tagId = existingTag.id;
            } else {
                // Create new tag
                if (this.app.notesManager.db && this.app.notesManager.db.initialized) {
                    tagId = this.app.notesManager.db.createTag({ name: tagName });
                } else {
                    // Fallback: create tag ID and save tag definition
                    tagId = Date.now().toString() + Math.random().toString(36).substr(2, 9);

                    // Initialize fallback tag data structure if needed
                    if (this.app.notesManager.db) {
                        this.app.notesManager.db.data = this.app.notesManager.db.data || {};
                        this.app.notesManager.db.data.tags = this.app.notesManager.db.data.tags || {};
                        this.app.notesManager.db.data.note_tags = this.app.notesManager.db.data.note_tags || {};

                        // Save tag definition
                        this.app.notesManager.db.data.tags[tagId] = {
                            id: tagId,
                            name: tagName,
                            color: '#BDABE3',
                            created_at: new Date().toISOString()
                        };
                    }
                }
            }

            await this.addTagToNote(tagId);
            input.value = '';

            // Refresh folder navigation to show new tag
            await this.renderTagFolders();

        } catch (error) {
            console.error('Error adding tag:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.app.showNotification(t('tags.addTagFailed'), 'error');
        }
    }

    // Add existing tag to note
    async addTagToNote(tagId) {
        if (!this.app.currentNote) return;

        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        const currentTags = this.app.currentNote.tags || [];
        if (currentTags.length >= 3) {
            this.app.showNotification(t('tags.maxTagsReached', 'Maximum 3 tags per note reached'), 'warning');
            return;
        }

        const updatedTags = [...currentTags, tagId];

        try {
            if (this.app.notesManager.db && this.app.notesManager.db.initialized) {
                await this.app.notesManager.db.updateNote(this.app.currentNote.id, { tags: updatedTags });
                this.app.currentNote = await this.app.notesManager.db.getNote(this.app.currentNote.id);
            } else {
                this.app.currentNote.tags = updatedTags;

                // Also update note_tags relationship in fallback mode
                if (this.app.notesManager.db) {
                    this.app.notesManager.db.data = this.app.notesManager.db.data || {};
                    this.app.notesManager.db.data.note_tags = this.app.notesManager.db.data.note_tags || {};

                    const noteTagKey = `${this.app.currentNote.id}_${tagId} `;
                    this.app.notesManager.db.data.note_tags[noteTagKey] = {
                        note_id: this.app.currentNote.id,
                        tag_id: tagId
                    };
                }

                this.app.saveNotes();
            }

            // Update UI
            this.displayNoteTags(this.app.currentNote);
            await this.app.notesManager.renderNotesList('', this.currentFolder);

            // Refresh the tag manager and folder navigation
            this.refreshTagManager();
            await this.renderTagFolders();

            this.app.showNotification(t('notifications.tagAdded', 'Tag added successfully'), 'success');
        } catch (error) {
            console.error('Error adding tag to note:', error);
            this.app.showNotification(t('tags.addTagFailed', 'Failed to add tag'), 'error');
        }
    }

    // Remove tag from note
    async removeTagFromNote(tagId) {
        if (!this.app.currentNote) return;

        const updatedTags = (this.app.currentNote.tags || []).filter(id => id !== tagId);

        try {
            if (this.app.notesManager.db && this.app.notesManager.db.initialized) {
                await this.app.notesManager.db.updateNote(this.app.currentNote.id, { tags: updatedTags });
                this.app.currentNote = await this.app.notesManager.db.getNote(this.app.currentNote.id);
            } else {
                this.app.currentNote.tags = updatedTags;

                // Also remove note_tags relationship in fallback mode
                if (this.app.notesManager.db && this.app.notesManager.db.data && this.app.notesManager.db.data.note_tags) {
                    const noteTagKey = `${this.app.currentNote.id}_${tagId} `;
                    delete this.app.notesManager.db.data.note_tags[noteTagKey];
                }

                this.app.saveNotes();
            }

            // Update UI
            this.displayNoteTags(this.app.currentNote);
            await this.app.notesManager.renderNotesList('', this.currentFolder);

            // Refresh the tag manager and folder navigation
            this.refreshTagManager();
            await this.renderTagFolders();

            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.app.showNotification(t('notifications.tagRemoved'), 'success');
        } catch (error) {
            console.error('Error removing tag from note:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.app.showNotification(t('notifications.tagRemoveFailed'), 'error');
        }
    }

    // Refresh the tag manager UI
    refreshTagManager() {
        const modal = document.getElementById('tag-manager-modal');
        if (!modal) return;

        const existingTags = this.app.currentNote.tags || [];
        const allTags = this.app.notesManager.db && this.app.notesManager.db.initialized ?
            this.app.notesManager.db.getAllTags() : [];

        // Update current tags
        const currentTagsEl = document.getElementById('current-tags');
        currentTagsEl.innerHTML = existingTags.length > 0 ?
            existingTags.map(tagId => {
                const tagName = this.app.notesManager.getTagName(tagId);
                return `<span class="tag-item" data-tag-id="${tagId}">
                                            ${this.app.escapeHtml(tagName)}
                                            <button class="tag-remove" data-tag-id="${tagId}">×</button>
                                        </span>`;
            }).join('') :
            '<span class="no-tags">No tags assigned</span>';

        // Update available tags
        const availableTagsEl = document.getElementById('available-tags-list');
        availableTagsEl.innerHTML = allTags.filter(tag => !existingTags.includes(tag.id)).map(tag =>
            `<span class="available-tag" data-tag-id="${tag.id}">
                                            ${this.app.escapeHtml(tag.name)}
                                        </span>`
        ).join('');
    }

    // Folder/Category Navigation
    setupFolderNavigation() {
        const foldersContainer = document.getElementById('sidebar-folders');
        if (!foldersContainer) return;

        // Handle folder item clicks (All Notes, Untagged)
        foldersContainer.addEventListener('click', async (e) => {
            const folderItem = e.target.closest('.folder-item');
            const tagFolderItem = e.target.closest('.tag-folder-item');
            const createFolderBtn = e.target.closest('#create-folder-btn');

            if (createFolderBtn) {
                this.showCreateTagDialog();
                return;
            }

            if (folderItem) {
                const folder = folderItem.dataset.folder;
                await this.switchFolder(folder);
            } else if (tagFolderItem) {
                const tagId = tagFolderItem.dataset.tagId;
                await this.switchFolder(tagId);
            }
        });

        // Right-click context menu for tag folders
        foldersContainer.addEventListener('contextmenu', (e) => {
            const tagFolderItem = e.target.closest('.tag-folder-item');
            if (tagFolderItem) {
                e.preventDefault();
                const tagId = tagFolderItem.dataset.tagId;
                this.showTagFolderContextMenu(tagId, e.clientX, e.clientY);
            }
        });

        // Setup tags list toggle (collapsible)
        this.setupTagsListToggle();

        // Set initial active state based on saved folder
        this.updateFolderActiveState();

        // Render tag folders on load
        this.renderTagFolders();
    }

    // Setup collapsible tags list toggle
    setupTagsListToggle() {
        const toggleBtn = document.getElementById('tags-toggle-btn');
        const tagFoldersList = document.getElementById('tag-folders-list');
        const tagsDivider = document.getElementById('tags-divider');

        if (!toggleBtn || !tagFoldersList) return;

        // Restore collapsed state from localStorage
        const isCollapsed = localStorage.getItem('tagsListCollapsed') === 'true';
        if (isCollapsed) {
            toggleBtn.classList.add('collapsed');
            tagFoldersList.classList.add('collapsed');
        }

        // Toggle button click
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleTagsList();
        });

        // Also allow clicking the "Tags" text to toggle
        tagsDivider.addEventListener('click', (e) => {
            // Don't toggle if clicking on the create button
            if (e.target.closest('#create-folder-btn')) return;
            this.toggleTagsList();
        });
    }

    toggleTagsList() {
        const toggleBtn = document.getElementById('tags-toggle-btn');
        const tagFoldersList = document.getElementById('tag-folders-list');

        if (!toggleBtn || !tagFoldersList) return;

        const isCollapsed = toggleBtn.classList.toggle('collapsed');
        tagFoldersList.classList.toggle('collapsed', isCollapsed);

        // Save state to localStorage
        localStorage.setItem('tagsListCollapsed', isCollapsed.toString());
    }

    // Update folder active state in UI
    updateFolderActiveState() {
        document.querySelectorAll('.folder-item, .tag-folder-item').forEach(item => {
            item.classList.remove('active');
        });

        const activeItem = document.querySelector(`.folder-item[data-folder="${this.currentFolder}"]`) ||
            document.querySelector(`.tag-folder-item[data-tag-id="${this.currentFolder}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        } else {
            // If saved folder no longer exists (e.g., deleted tag), default to "all"
            this.currentFolder = 'all';
            localStorage.setItem('currentFolder', 'all');
            const allItem = document.querySelector('.folder-item[data-folder="all"]');
            if (allItem) allItem.classList.add('active');
        }
    }

    async switchFolder(folder) {
        this.currentFolder = folder;

        // Save to localStorage for persistence
        localStorage.setItem('currentFolder', folder);

        // Update active state in UI
        document.querySelectorAll('.folder-item, .tag-folder-item').forEach(item => {
            item.classList.remove('active');
        });

        const activeItem = document.querySelector(`.folder-item[data-folder="${folder}"]`) ||
            document.querySelector(`.tag-folder-item[data-tag-id="${folder}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }

        // Re-render notes list with folder filter
        const searchQuery = document.getElementById('search-input').value || '';
        if (this.app.notesManager) {
            await this.app.notesManager.renderNotesList(searchQuery, folder);
        }

        // Close mobile sidebar after selecting folder
        if (window.innerWidth <= 768 && this.app.uiManager) {
            this.app.uiManager.closeMobileSidebar();
        }
    }

    async renderTagFolders() {
        const tagFoldersList = document.getElementById('tag-folders-list');
        if (!tagFoldersList) return;

        try {
            let tags = [];
            if (this.app.notesManager && this.app.notesManager.db && this.app.notesManager.db.initialized) {
                tags = this.app.notesManager.db.getAllTags();
            }

            if (tags.length === 0) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                tagFoldersList.innerHTML = `<div class="tag-folders-empty">${t('tags.noTagsCreated')}</div>`;
                return;
            }

            // Get note counts for each tag
            let allNotes = [];
            if (this.app.notesManager && this.app.notesManager.db && this.app.notesManager.db.initialized) {
                allNotes = await this.app.notesManager.db.getAllNotes();
            }

            const tagCounts = {};
            allNotes.forEach(note => {
                if (note.tags && note.tags.length > 0) {
                    note.tags.forEach(tagId => {
                        tagCounts[tagId] = (tagCounts[tagId] || 0) + 1;
                    });
                }
            });

            tagFoldersList.innerHTML = tags.map(tag => {
                const count = tagCounts[tag.id] || 0;
                const isActive = this.currentFolder === tag.id;
                return `
                    <div class="tag-folder-item${isActive ? ' active' : ''}" data-tag-id="${tag.id}">
                        <div class="tag-folder-color" style="background: ${tag.color || '#BDABE3'}"></div>
                        <span class="tag-folder-name">${this.app.escapeHtml(tag.name)}</span>
                        <span class="tag-folder-count">${count}</span>
                    </div>
                `;
            }).join('');

            // Update main folder counts
            if (this.app.notesManager) {
                this.app.notesManager.updateFolderCounts();
            }

            // Ensure active state is properly set (handles case where saved folder was a tag)
            this.updateFolderActiveState();
        } catch (error) {
            console.error('Error rendering tag folders:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            tagFoldersList.innerHTML = `<div class="tag-folders-empty">${t('tags.errorLoadingTags')}</div>`;
        }
    }

    showCreateTagDialog() {
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        const content = `
            <div class="create-tag-form">
                <div class="form-group" style="margin-bottom: 16px;">
                    <label for="new-folder-tag-name" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('tags.tagName')}</label>
                    <input type="text" id="new-folder-tag-name" placeholder="${t('placeholder.enterTagName')}"
                           class="filter-input" style="width: 100%; padding: 10px 12px; border-radius: 6px;">
                </div>
                <div class="form-group">
                    <label style="display: block; margin-bottom: 6px; font-weight: 500;">Tag Color</label>
                    <div class="color-options" style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="color-option active" data-color="#BDABE3" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #BDABE3; cursor: pointer;"></button>
                        <button class="color-option" data-color="#3ECF8E" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #3ECF8E; cursor: pointer;"></button>
                        <button class="color-option" data-color="#F59E0B" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #F59E0B; cursor: pointer;"></button>
                        <button class="color-option" data-color="#EF4444" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #EF4444; cursor: pointer;"></button>
                        <button class="color-option" data-color="#3B82F6" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #3B82F6; cursor: pointer;"></button>
                        <button class="color-option" data-color="#8B5CF6" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #8B5CF6; cursor: pointer;"></button>
                        <button class="color-option" data-color="#EC4899" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #EC4899; cursor: pointer;"></button>
                        <button class="color-option" data-color="#06B6D4" style="width: 28px; height: 28px; border-radius: 50%; border: 2px solid transparent; background: #06B6D4; cursor: pointer;"></button>
                    </div>
                </div>
            </div>
        `;

        const modal = this.app.createModal(t('modals.createNewTag'), content, [
            { text: t('modals.create'), type: 'primary', action: 'create', callback: () => this.createTagFromDialog() },
            { text: t('modals.cancel'), type: 'secondary', action: 'cancel' }
        ]);

        // Setup color selection
        const colorOptions = modal.querySelectorAll('.color-option');
        colorOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.preventDefault();
                colorOptions.forEach(o => {
                    o.classList.remove('active');
                    o.style.borderColor = 'transparent';
                });
                option.classList.add('active');
                option.style.borderColor = 'var(--text-primary)';
            });
        });

        // Focus the input
        setTimeout(() => {
            const input = document.getElementById('new-folder-tag-name');
            if (input) input.focus();
        }, 100);

        // Handle Enter key to create
        const input = document.getElementById('new-folder-tag-name');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.createTagFromDialog();
                    modal.remove();
                }
            });
        }
    }

    async createTagFromDialog() {
        const nameInput = document.getElementById('new-folder-tag-name');
        const selectedColor = document.querySelector('.color-option.active');

        if (!nameInput || !nameInput.value.trim()) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.app.showNotification(t('notifications.pleaseEnterTagName'), 'error');
            return;
        }

        const tagName = nameInput.value.trim();
        const tagColor = selectedColor ? selectedColor.dataset.color : '#BDABE3';

        try {
            if (this.app.notesManager && this.app.notesManager.db && this.app.notesManager.db.initialized) {
                // Check if tag with same name exists
                const existingTags = this.app.notesManager.db.getAllTags();
                if (existingTags.some(t => t.name.toLowerCase() === tagName.toLowerCase())) {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    this.app.showNotification(t('notifications.tagAlreadyExists'), 'warning');
                    return;
                }

                this.app.notesManager.db.createTag({ name: tagName, color: tagColor });
                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                this.app.showNotification(t('notifications.tagAdded'), 'success');
                await this.renderTagFolders();
            } else {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                this.app.showNotification(t('notifications.databaseNotAvailable'), 'error');
            }
        } catch (error) {
            console.error('Error creating tag:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.app.showNotification(t('notifications.failedToCreateTag'), 'error');
        }
    }

    showTagFolderContextMenu(tagId, x, y) {
        // Remove existing context menu
        const existingMenu = document.querySelector('.tag-folder-context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'tag-folder-context-menu context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            z-index: 1000;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            padding: 4px;
            min-width: 150px;
        `;

        menu.innerHTML = `
            <div class="context-menu-item" data-action="rename"><i class="fas fa-edit"></i> Rename</div>
            <div class="context-menu-item" data-action="delete" style="color: #dc3545;"><i class="fas fa-trash"></i> Delete</div>
        `;

        document.body.appendChild(menu);

        // Handle menu item clicks
        menu.addEventListener('click', async (e) => {
            const action = e.target.closest('.context-menu-item')?.dataset.action;
            if (action === 'rename') {
                await this.renameTagFolder(tagId);
            } else if (action === 'delete') {
                await this.deleteTagFolder(tagId);
            }
            menu.remove();
        });

        // Close on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    async renameTagFolder(tagId) {
        if (!this.app.notesManager || !this.app.notesManager.db) return;

        const tag = this.app.notesManager.db.data.tags[tagId];
        if (!tag) return;

        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        const promptText = t('tags.enterTagNamePrompt');
        const newName = prompt(promptText, tag.name);
        if (!newName || newName.trim() === '' || newName.trim() === tag.name) return;

        try {
            this.app.notesManager.db.data.tags[tagId].name = newName.trim();
            this.app.notesManager.db.saveToLocalStorage();
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.app.showNotification(t('notifications.tagAdded'), 'success');
            await this.renderTagFolders();
            await this.app.notesManager.renderNotesList('', this.currentFolder);
        } catch (error) {
            console.error('Error renaming tag:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.app.showNotification(t('notifications.failedToRenameTag'), 'error');
        }
    }

    async deleteTagFolder(tagId) {
        if (!this.app.notesManager || !this.app.notesManager.db) return;

        const tag = this.app.notesManager.db.data.tags[tagId];
        if (!tag) return;

        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        const confirmText = t('tags.deleteTagConfirm', { name: tag.name });
        const confirmDelete = confirm(confirmText);
        if (!confirmDelete) return;

        try {
            // Remove tag from all notes
            const notes = await this.app.notesManager.db.getAllNotes();
            for (const note of notes) {
                if (note.tags && note.tags.includes(tagId)) {
                    const updatedTags = note.tags.filter(t => t !== tagId);
                    await this.app.notesManager.db.updateNote(note.id, { tags: updatedTags });
                }
            }

            // Delete the tag itself
            delete this.app.notesManager.db.data.tags[tagId];

            // Remove from note_tags associations
            const noteTagsToDelete = [];
            Object.keys(this.app.notesManager.db.data.note_tags || {}).forEach(key => {
                if (this.app.notesManager.db.data.note_tags[key].tag_id === tagId) {
                    noteTagsToDelete.push(key);
                }
            });
            noteTagsToDelete.forEach(key => {
                delete this.app.notesManager.db.data.note_tags[key];
            });

            this.app.notesManager.db.saveToLocalStorage();

            // If we were viewing this tag, switch back to all notes
            if (this.currentFolder === tagId) {
                await this.switchFolder('all');
            }

            const t2 = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
            this.app.showNotification(t2('notifications.tagDeleted', { name: tag.name }), 'success');
            await this.renderTagFolders();
            await this.app.notesManager.renderNotesList('', this.currentFolder);

            // Update current note's tag display if open
            if (this.app.currentNote) {
                this.displayNoteTags(this.app.currentNote);
            }
        } catch (error) {
            console.error('Error deleting tag:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.app.showNotification(t('notifications.failedToDeleteTag'), 'error');
        }
    }
}

module.exports = TagFolderManager;
