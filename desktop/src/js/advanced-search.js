// Advanced Search and Filtering Module
class AdvancedSearchManager {
    constructor(app) {
        this.app = app;
        this.panel = null;
        this.isOpen = false;
        this.currentFilters = {
            text: '',
            tags: [],
            dateFrom: null,
            dateTo: null,
            favoritesOnly: false,
            pinnedOnly: false,
            protectedOnly: false,
            sortBy: 'updated_at',
            sortOrder: 'DESC'
        };
    }

    async initialize() {
        console.log('[AdvancedSearch] Initializing advanced search manager...');
        this.panel = document.getElementById('advanced-search-panel');
        this.setupEventListeners();
        await this.populateTagsFilter();
        console.log('[AdvancedSearch] Advanced search initialized');
    }

    setupEventListeners() {
        // Toggle button
        const toggleBtn = document.getElementById('advanced-search-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggle());
        }

        // Close button
        const closeBtn = document.getElementById('advanced-search-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Apply filters button
        const applyBtn = document.getElementById('apply-filters-btn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applyFilters());
        }

        // Clear filters button
        const clearBtn = document.getElementById('clear-filters-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearFilters());
        }

        // Close on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });

        // Real-time filter updates (optional)
        const filterText = document.getElementById('filter-text');
        if (filterText) {
            filterText.addEventListener('input', () => {
                this.currentFilters.text = filterText.value;
            });
        }
    }

    async populateTagsFilter() {
        const tagsSelect = document.getElementById('filter-tags');
        if (!tagsSelect) return;

        try {
            const db = this.app.notesManager?.db;
            if (!db || !db.initialized) return;

            const tags = db.getAllTags();
            tagsSelect.innerHTML = '';

            if (tags.length === 0) {
                const option = document.createElement('option');
                option.disabled = true;
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                option.textContent = t('tags.noTagsAvailable');
                tagsSelect.appendChild(option);
                return;
            }

            tags.forEach(tag => {
                const option = document.createElement('option');
                option.value = tag.id;
                option.textContent = tag.name;
                tagsSelect.appendChild(option);
            });
        } catch (error) {
            console.error('[AdvancedSearch] Failed to populate tags:', error);
        }
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        if (!this.panel) return;

        this.panel.classList.remove('hidden');
        this.isOpen = true;

        // Add active class to toggle button
        const toggleBtn = document.getElementById('advanced-search-btn');
        if (toggleBtn) {
            toggleBtn.classList.add('active');
        }

        // Refresh tags in case they've changed
        this.populateTagsFilter();
    }

    close() {
        if (!this.panel) return;

        this.panel.classList.add('hidden');
        this.isOpen = false;

        // Remove active class from toggle button
        const toggleBtn = document.getElementById('advanced-search-btn');
        if (toggleBtn) {
            toggleBtn.classList.remove('active');
        }
    }

    async applyFilters() {
        console.log('[AdvancedSearch] Applying filters...');

        // Collect filter values from UI
        const filterText = document.getElementById('filter-text')?.value || '';
        const filterTags = Array.from(document.getElementById('filter-tags')?.selectedOptions || [])
            .map(opt => opt.value);
        const dateFrom = document.getElementById('filter-date-from')?.value || null;
        const dateTo = document.getElementById('filter-date-to')?.value || null;
        const favoritesOnly = document.getElementById('filter-favorites')?.checked || false;
        const pinnedOnly = document.getElementById('filter-pinned')?.checked || false;
        const protectedOnly = document.getElementById('filter-protected')?.checked || false;
        const sortValue = document.getElementById('filter-sort')?.value || 'updated_at_desc';

        // Parse sort value
        const [sortBy, sortOrder] = this.parseSortValue(sortValue);

        // Update current filters
        this.currentFilters = {
            text: filterText,
            tags: filterTags,
            dateFrom: dateFrom ? new Date(dateFrom) : null,
            dateTo: dateTo ? new Date(dateTo) : null,
            favoritesOnly,
            pinnedOnly,
            protectedOnly,
            sortBy,
            sortOrder
        };

        // Apply filters via database query
        await this.executeSearch();
    }

    parseSortValue(sortValue) {
        const parts = sortValue.split('_');
        const order = parts.pop(); // 'asc' or 'desc'
        const field = parts.join('_'); // remaining parts form the field name
        return [field, order.toUpperCase()];
    }

    async executeSearch() {
        try {
            const db = this.app.notesManager?.db;
            if (!db || !db.initialized) {
                console.warn('[AdvancedSearch] Database not initialized');
                return;
            }

            // Build search options
            const options = {
                sortBy: this.currentFilters.sortBy,
                sortOrder: this.currentFilters.sortOrder
            };

            // Add text search if provided
            if (this.currentFilters.text) {
                options.search = this.currentFilters.text;
            }

            // Add favorites filter if checked
            if (this.currentFilters.favoritesOnly) {
                options.isFavorite = true;
            }

            // Get all notes first
            let notes = await db.getAllNotes(options);

            // Apply additional filters that aren't in database query
            notes = this.applyAdditionalFilters(notes);

            // Update results count
            this.updateResultsCount(notes.length);

            // Render filtered notes
            await this.renderFilteredNotes(notes);

            console.log(`[AdvancedSearch] Found ${notes.length} notes matching filters`);

        } catch (error) {
            console.error('[AdvancedSearch] Search failed:', error);
            this.app.showNotification?.('Search failed: ' + error.message, 'error');
        }
    }

    applyAdditionalFilters(notes) {
        let filtered = notes;

        // Filter by tags
        if (this.currentFilters.tags.length > 0) {
            filtered = filtered.filter(note => {
                if (!note.tags || note.tags.length === 0) return false;
                return this.currentFilters.tags.some(tagId => note.tags.includes(tagId));
            });
        }

        // Filter by date range
        if (this.currentFilters.dateFrom || this.currentFilters.dateTo) {
            filtered = filtered.filter(note => {
                const noteDate = new Date(note.updated_at || note.created_at);
                
                if (this.currentFilters.dateFrom && noteDate < this.currentFilters.dateFrom) {
                    return false;
                }
                
                if (this.currentFilters.dateTo) {
                    // Include the entire day of dateTo
                    const dateToEnd = new Date(this.currentFilters.dateTo);
                    dateToEnd.setHours(23, 59, 59, 999);
                    if (noteDate > dateToEnd) {
                        return false;
                    }
                }
                
                return true;
            });
        }

        // Filter by pinned status
        if (this.currentFilters.pinnedOnly) {
            filtered = filtered.filter(note => note.pinned === true);
        }

        // Filter by password protected
        if (this.currentFilters.protectedOnly) {
            filtered = filtered.filter(note => note.password_protected === true);
        }

        return filtered;
    }

    updateResultsCount(count) {
        const countElement = document.getElementById('search-results-count');
        if (countElement) {
            const t = (key, fallback, params = {}) => window.i18n ? window.i18n.t(key, params) : fallback;
            const plural = count !== 1 ? 's' : '';
            const text = t('advancedSearch.searchResultsCount', `${count} note${plural} found`, { count, plural });
            countElement.textContent = text;
        }
    }

    async renderFilteredNotes(notes) {
        // Use the existing notes rendering system
        if (this.app.notesManager) {
            this.app.notesManager.currentNotes = notes;
            const notesList = document.getElementById('notes-list');
            if (notesList) {
                notesList.innerHTML = '';
                
                if (notes.length === 0) {
                    this.app.notesManager.renderEmptyState();
                } else {
                    notes.forEach(note => {
                        const noteElement = this.app.notesManager.createNoteElement(note);
                        notesList.appendChild(noteElement);
                    });
                }
            }
        }
    }

    clearFilters() {
        console.log('[AdvancedSearch] Clearing all filters...');

        // Reset UI inputs
        const filterText = document.getElementById('filter-text');
        if (filterText) filterText.value = '';

        const filterTags = document.getElementById('filter-tags');
        if (filterTags) {
            Array.from(filterTags.options).forEach(opt => opt.selected = false);
        }

        const dateFrom = document.getElementById('filter-date-from');
        if (dateFrom) dateFrom.value = '';

        const dateTo = document.getElementById('filter-date-to');
        if (dateTo) dateTo.value = '';

        const favoritesCheck = document.getElementById('filter-favorites');
        if (favoritesCheck) favoritesCheck.checked = false;

        const pinnedCheck = document.getElementById('filter-pinned');
        if (pinnedCheck) pinnedCheck.checked = false;

        const protectedCheck = document.getElementById('filter-protected');
        if (protectedCheck) protectedCheck.checked = false;

        const sortSelect = document.getElementById('filter-sort');
        if (sortSelect) sortSelect.value = 'updated_at_desc';

        // Reset current filters
        this.currentFilters = {
            text: '',
            tags: [],
            dateFrom: null,
            dateTo: null,
            favoritesOnly: false,
            pinnedOnly: false,
            protectedOnly: false,
            sortBy: 'updated_at',
            sortOrder: 'DESC'
        };

        // Refresh notes list with no filters
        if (this.app.notesManager) {
            this.app.notesManager.renderNotesList();
        }

        this.updateResultsCount(0);
    }

    // Get current active filters as a readable string
    getActiveFiltersDescription() {
        const parts = [];

        if (this.currentFilters.text) {
            parts.push(`Text: "${this.currentFilters.text}"`);
        }

        if (this.currentFilters.tags.length > 0) {
            parts.push(`${this.currentFilters.tags.length} tag(s)`);
        }

        if (this.currentFilters.dateFrom || this.currentFilters.dateTo) {
            const from = this.currentFilters.dateFrom ? 
                this.currentFilters.dateFrom.toLocaleDateString() : 'any';
            const to = this.currentFilters.dateTo ? 
                this.currentFilters.dateTo.toLocaleDateString() : 'any';
            parts.push(`Date: ${from} to ${to}`);
        }

        if (this.currentFilters.favoritesOnly) parts.push('Favorites');
        if (this.currentFilters.pinnedOnly) parts.push('Pinned');
        if (this.currentFilters.protectedOnly) parts.push('Protected');

        return parts.length > 0 ? parts.join(', ') : 'No filters active';
    }

    hasActiveFilters() {
        return this.currentFilters.text !== '' ||
               this.currentFilters.tags.length > 0 ||
               this.currentFilters.dateFrom !== null ||
               this.currentFilters.dateTo !== null ||
               this.currentFilters.favoritesOnly ||
               this.currentFilters.pinnedOnly ||
               this.currentFilters.protectedOnly;
    }
}

// Export for use in main app
if (typeof window !== 'undefined') {
    window.AdvancedSearchManager = AdvancedSearchManager;
}
