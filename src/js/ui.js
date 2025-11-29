// UI utilities and enhancements
class UIManager {
    constructor(app) {
        this.app = app;
        this.notifications = [];
    }

    // Notification system
    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button class="notification-close">×</button>
        `;

        // Style the notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : 'var(--accent-color)',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: '1000',
            maxWidth: '400px',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            animation: 'slideInRight 0.3s ease'
        });

        document.body.appendChild(notification);
        this.notifications.push(notification);

        // Close button
        notification.querySelector('.notification-close').addEventListener('click', () => {
            this.removeNotification(notification);
        });

        // Auto remove
        if (duration > 0) {
            setTimeout(() => {
                this.removeNotification(notification);
            }, duration);
        }

        return notification;
    }

    removeNotification(notification) {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
            this.notifications = this.notifications.filter(n => n !== notification);
        }, 300);
    }

    // Loading states
    showGlobalLoader() {
        let loader = document.getElementById('global-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'global-loader';
            loader.innerHTML = `
                <div class="global-loader-backdrop">
                    <div class="global-loader-content">
                        <div class="loading-spinner"></div>
                        <div class="loading-text">Processing...</div>
                    </div>
                </div>
            `;

            // Style the loader
            const backdrop = loader.querySelector('.global-loader-backdrop');
            Object.assign(backdrop.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: '2000',
                backdropFilter: 'blur(2px)'
            });

            document.body.appendChild(loader);
        }
        loader.style.display = 'block';
    }

    hideGlobalLoader() {
        const loader = document.getElementById('global-loader');
        if (loader) {
            loader.style.display = 'none';
        }
    }

    // Modal management
    createModal(title, content, buttons = []) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close">×</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                ${buttons.length > 0 ? `
                    <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color); display: flex; gap: 12px; justify-content: flex-end;">
                        ${buttons.map(btn => `<button class="btn-${btn.type || 'secondary'}" data-action="${btn.action}">${btn.text}</button>`).join('')}
                    </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        const closeBtn = modal.querySelector('.modal-close');
        closeBtn.addEventListener('click', () => this.closeModal(modal));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });

        // Button actions
        buttons.forEach(btn => {
            const btnElement = modal.querySelector(`[data-action="${btn.action}"]`);
            if (btnElement) {
                btnElement.addEventListener('click', () => {
                    if (btn.callback) btn.callback();
                    this.closeModal(modal);
                });
            }
        });

        return modal;
    }

    closeModal(modal) {
        modal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    }

    // Context menu enhancements
    enhanceContextMenu() {
        const contextMenu = document.getElementById('context-menu');

        // Add keyboard navigation
        let selectedIndex = -1;
        const items = contextMenu.querySelectorAll('.context-menu-item');

        document.addEventListener('keydown', (e) => {
            if (contextMenu.classList.contains('hidden')) return;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                    this.updateContextMenuSelection(items, selectedIndex);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    selectedIndex = Math.max(selectedIndex - 1, 0);
                    this.updateContextMenuSelection(items, selectedIndex);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (selectedIndex >= 0) {
                        items[selectedIndex].click();
                    }
                    break;
                case 'Escape':
                    this.app.hideContextMenu();
                    break;
            }
        });
    }

    updateContextMenuSelection(items, selectedIndex) {
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === selectedIndex);
        });
    }

    // Sidebar enhancements
    enhanceSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const toggle = document.getElementById('sidebar-toggle');

        // Track collapsed state as instance property
        this.sidebarCollapsed = false;

        // Collapsible sidebar (desktop-only)
        toggle.addEventListener('click', () => {
            // Ignore collapse on mobile; the sidebar is a full-screen overlay there
            if (window.innerWidth <= 768) {
                return;
            }

            this.sidebarCollapsed = !this.sidebarCollapsed;
            sidebar.style.width = this.sidebarCollapsed ? '60px' : '';
            
            // Add/remove collapsed class for CSS styling (hides resize handle)
            sidebar.classList.toggle('collapsed', this.sidebarCollapsed);

            // Hide/show sidebar content (including folders section)
            const content = sidebar.querySelectorAll('.sidebar-header h2, .sidebar-folders, .notes-list');
            content.forEach(el => {
                el.style.display = this.sidebarCollapsed ? 'none' : '';
            });

            toggle.innerHTML = this.sidebarCollapsed ? '<i class="fas fa-bars"></i>' : '<i class="fas fa-chevron-left"></i>';
        });

        // Resizable sidebar (desktop-only)
        this.setupSidebarResize();

        // Note drag and drop (placeholder)
        this.setupDragAndDrop();
    }

    // Setup sidebar resize functionality
    setupSidebarResize() {
        const sidebar = document.getElementById('sidebar');
        const resizeHandle = document.getElementById('sidebar-resize-handle');
        
        if (!sidebar || !resizeHandle) return;

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        // Min and max width constraints
        const MIN_WIDTH = 260;
        const MAX_WIDTH = 600;
        const DEFAULT_WIDTH = 320;

        // Restore saved width from localStorage
        const savedWidth = localStorage.getItem('sidebarWidth');
        if (savedWidth && window.innerWidth > 768) {
            const width = parseInt(savedWidth, 10);
            if (width >= MIN_WIDTH && width <= MAX_WIDTH) {
                sidebar.style.width = `${width}px`;
            }
        }

        const startResize = (e) => {
            // Only allow resize on desktop and when not collapsed
            if (window.innerWidth <= 768) return;
            if (this.sidebarCollapsed) return;
            
            isResizing = true;
            startX = e.clientX || e.touches?.[0]?.clientX || 0;
            startWidth = sidebar.offsetWidth;
            
            sidebar.classList.add('resizing');
            document.body.classList.add('sidebar-resizing');
            
            // Prevent text selection during resize
            e.preventDefault();
        };

        const doResize = (e) => {
            if (!isResizing) return;
            
            const currentX = e.clientX || e.touches?.[0]?.clientX || 0;
            const diff = currentX - startX;
            let newWidth = startWidth + diff;
            
            // Clamp to min/max
            newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
            
            sidebar.style.width = `${newWidth}px`;
        };

        const stopResize = () => {
            if (!isResizing) return;
            
            isResizing = false;
            sidebar.classList.remove('resizing');
            document.body.classList.remove('sidebar-resizing');
            
            // Save the width to localStorage
            const currentWidth = sidebar.offsetWidth;
            localStorage.setItem('sidebarWidth', currentWidth.toString());
        };

        // Mouse events
        resizeHandle.addEventListener('mousedown', startResize);
        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);

        // Touch events for tablet
        resizeHandle.addEventListener('touchstart', startResize, { passive: false });
        document.addEventListener('touchmove', doResize, { passive: false });
        document.addEventListener('touchend', stopResize);

        // Double-click to reset to default width (only when not collapsed)
        resizeHandle.addEventListener('dblclick', () => {
            if (window.innerWidth <= 768) return;
            if (this.sidebarCollapsed) return;
            sidebar.style.width = `${DEFAULT_WIDTH}px`;
            localStorage.setItem('sidebarWidth', DEFAULT_WIDTH.toString());
        });
    }

    setupDragAndDrop() {
        const notesList = document.getElementById('notes-list');

        // Basic drag and drop setup (can be enhanced)
        let draggedElement = null;

        notesList.addEventListener('dragstart', (e) => {
            draggedElement = e.target;
            e.target.style.opacity = '0.5';
        });

        notesList.addEventListener('dragend', (e) => {
            e.target.style.opacity = '1';
            draggedElement = null;
        });

        notesList.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        notesList.addEventListener('drop', (e) => {
            e.preventDefault();
            // Implement reordering logic here
        });
    }

    // Editor enhancements
    enhanceEditor() {
        const editor = document.getElementById('note-editor');

        // Handle scrolling properly for textarea
        editor.addEventListener('keydown', (e) => {
            // Handle Tab key to insert tab character instead of moving focus
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = editor.selectionStart;
                const end = editor.selectionEnd;
                const tab = '\t';
                
                // Insert tab at cursor position
                editor.value = editor.value.substring(0, start) + tab + editor.value.substring(end);
                
                // Move cursor to after the inserted tab
                editor.selectionStart = editor.selectionEnd = start + tab.length;
                
                // Trigger input event for autosave
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }
            
            // Handle arrow keys for scrolling
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                // Check if content overflows and we're at the boundaries
                const atTop = editor.scrollTop === 0;
                const atBottom = editor.scrollTop + editor.clientHeight >= editor.scrollHeight;

                if ((e.key === 'ArrowUp' && atTop) || (e.key === 'ArrowDown' && atBottom)) {
                    // If we're at the boundary, let the event bubble up to parent elements
                    // This allows page scrolling when textarea is at its limits
                    return;
                }

                // If content overflows, handle scrolling within textarea
                if (editor.scrollHeight > editor.clientHeight) {
                    // Prevent event from bubbling to avoid page scrolling
                    e.stopPropagation();
                }
            }
        });

        // Handle scrolling for markdown preview as well
        const preview = document.getElementById('markdown-preview');
        if (preview) {
            preview.addEventListener('keydown', (e) => {
                // Handle arrow keys for scrolling in preview mode
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                    // Check if content overflows and we're at the boundaries
                    const atTop = preview.scrollTop === 0;
                    const atBottom = preview.scrollTop + preview.clientHeight >= preview.scrollHeight;

                    if ((e.key === 'ArrowUp' && atTop) || (e.key === 'ArrowDown' && atBottom)) {
                        // If we're at the boundary, let the event bubble up to parent elements
                        return;
                    }

                    // If content overflows, handle scrolling within preview
                    if (preview.scrollHeight > preview.clientHeight) {
                        // Prevent event from bubbling to avoid page scrolling
                        e.stopPropagation();
                    }
                }
            });
        }

        // Syntax highlighting (basic implementation)
        this.setupSyntaxHighlighting();

        // Word count
        this.setupWordCount();
    }

    setupSyntaxHighlighting() {
        // Basic syntax highlighting for common patterns
        const editor = document.getElementById('note-editor');

        const highlightPatterns = [
            { regex: /#{1,6}\s+.*/g, class: 'heading' },
            { regex: /\*\*.*?\*\*/g, class: 'bold' },
            { regex: /\*.*?\*/g, class: 'italic' },
            { regex: /`.*?`/g, class: 'code' },
            { regex: /\[.*?\]\(.*?\)/g, class: 'link' }
        ];

        // This is a basic implementation - a more robust solution would use a proper syntax highlighter
        editor.addEventListener('input', () => {
            let content = editor.value;
            // Reset highlighting
            content = content.replace(/<span class="[^"]*">|<\/span>/g, '');

            highlightPatterns.forEach(pattern => {
                content = content.replace(pattern.regex, (match) => {
                    return `<span class="${pattern.class}">${match}</span>`;
                });
            });

            // Update editor content with highlighting (this would need more sophisticated handling)
        });
    }

    setupWordCount() {
        // Check if word count should be shown according to settings
        const showWordCount = localStorage.getItem('showWordCount') !== 'false'; // Default to true if not set
        if (!showWordCount) {
            return; // Don't create word count if disabled in settings
        }

        const editor = document.getElementById('note-editor');
        const aiPanel = document.getElementById('ai-panel');
        const wordCountElement = document.createElement('div');
        wordCountElement.id = 'word-count';
        wordCountElement.style.cssText = `
            position: absolute;
            bottom: 15px;
            right: 15px;
            font-size: 12px;
            color: var(--text-tertiary);
            background: var(--bg-primary);
            padding: 4px 8px;
            border-radius: 4px;
            border: 1px solid var(--border-color);
            z-index: 100;
            pointer-events: none;
        `;

        document.querySelector('.editor-wrapper').appendChild(wordCountElement);

        const updateWordCountPosition = () => {
            // Position the word count with adequate margin from the edge
            // The editor-wrapper has padding: 20px, so we use a smaller right value
            wordCountElement.style.right = '15px';
        };

        const updateWordCount = () => {
            const text = editor.value;
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            const chars = text.length;
            wordCountElement.textContent = `${words} words, ${chars} chars`;
            updateWordCountPosition(); // Update position when content changes
        };

        // Listen for AI panel visibility changes
        const aiToggleBtn = document.getElementById('ai-toggle-btn');
        if (aiToggleBtn) {
            aiToggleBtn.addEventListener('click', () => {
                // Delay position update to allow panel visibility to change
                setTimeout(updateWordCountPosition, 100);
            });
        }

        // Initial position update
        updateWordCountPosition();

        editor.addEventListener('input', updateWordCount);
        updateWordCount();

        // Store references for potential re-initialization
        this.wordCountElement = wordCountElement;
        this.updateWordCountPosition = updateWordCountPosition;
        this.updateWordCount = updateWordCount;
    }

    // Refresh word count based on settings
    refreshWordCount() {
        // Remove existing word count if it exists
        const existingWordCount = document.getElementById('word-count');
        if (existingWordCount) {
            existingWordCount.remove();
        }

        // Clear stored references
        this.wordCountElement = null;
        this.updateWordCountPosition = null;
        this.updateWordCount = null;

        // Re-initialize word count with new settings
        this.setupWordCount();
    }

    // Theme animations
    animateThemeTransition() {
        const app = document.getElementById('app');
        app.style.transition = 'background-color 0.3s ease, color 0.3s ease';

        // Add a subtle animation to the theme toggle
        const toggle = document.getElementById('theme-toggle');
        toggle.style.transform = 'rotate(180deg)';
        setTimeout(() => {
            toggle.style.transform = 'rotate(0deg)';
        }, 300);
    }

    // Keyboard shortcuts help
    showKeyboardShortcuts() {
        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        const shortcuts = [
            { key: 'Ctrl+N', description: t('keyboard.newNote', 'New Note') },
            { key: 'Ctrl+S', description: t('keyboard.saveNote', 'Save Note') },
            { key: 'Ctrl+O', description: t('keyboard.openNote', 'Open Note') },
            { key: 'Ctrl+/', description: t('keyboard.focusSearch', 'Focus Search') },
            { key: 'Ctrl+Shift+S', description: t('keyboard.summarizeSelection', 'Summarize Selection') },
            { key: 'Ctrl+Shift+A', description: t('keyboard.askAISelection', 'Ask AI About Selection') },
            { key: 'Ctrl+Shift+E', description: t('keyboard.editSelectionAI', 'Edit Selection with AI') }
        ];

        const content = `
            <div style="max-height: 400px; overflow-y: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--border-color);">${t('keyboard.shortcutHeader', 'Shortcut')}</th>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--border-color);">${t('keyboard.descriptionHeader', 'Description')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shortcuts.map(shortcut => `
                            <tr>
                                <td style="padding: 8px; border-bottom: 1px solid var(--border-color); font-family: monospace;">${shortcut.key}</td>
                                <td style="padding: 8px; border-bottom: 1px solid var(--border-color);">${shortcut.description}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        this.createModal('Keyboard Shortcuts', content, [
            { text: 'Close', type: 'secondary', action: 'close' }
        ]);
    }

    // Test responsive design with different screen sizes (for debugging)
    testResponsiveDesign() {
        const testSizes = [
            { width: 1920, height: 1080, name: 'Full HD Desktop' },
            { width: 1366, height: 768, name: 'Laptop' },
            { width: 1024, height: 768, name: 'Tablet Landscape' },
            { width: 768, height: 1024, name: 'Tablet Portrait' },
            { width: 375, height: 667, name: 'iPhone 6/7/8' },
            { width: 360, height: 640, name: 'Small Mobile' }
        ];

        console.log('🧪 Testing responsive design across different screen sizes:');
        console.table(testSizes.map(size => ({
            'Screen Size': size.name,
            'Width': size.width,
            'Height': size.height,
            'AI Panel Width': this.getResponsiveAIWidth(size.width),
            'Layout': size.width <= 768 ? 'Stacked' : 'Side-by-side',
            'Scenario': this.detectScenario(size.width, size.height)
        })));

        console.log('💡 Tips for testing:');
        console.log('- Resize your browser window to test different breakpoints');
        console.log('- Use browser dev tools to simulate different devices');
        console.log('- Check that AI panel and editor maintain proper proportions');
    }

    getResponsiveAIWidth(viewportWidth) {
        if (viewportWidth >= 1440) return '400px';
        if (viewportWidth >= 1024) return '350px';
        if (viewportWidth >= 769) return '320px';
        if (viewportWidth >= 650 && viewportWidth <= 768) return '260px (split-screen optimized)';
        return '100% (full width)';
    }

    // Detect common screen resolutions and split-screen scenarios
    detectScreenScenario() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        // 1366x768 split-screen detection (approximately 683px width)
        if (width >= 650 && width <= 720 && height >= 700 && height <= 800) {
            return '1366x768-split';
        }

        // Standard 1366x768 detection
        if (width >= 1350 && width <= 1380 && height >= 750 && height <= 780) {
            return '1366x768-full';
        }

        // Other common split-screen scenarios
        if (width >= 600 && width <= 800 && height >= 700) {
            return 'laptop-split';
        }

        return 'standard';
    }

    // Helper method for testing (takes width and height parameters)
    detectScenario(width, height) {
        // 1366x768 split-screen detection (approximately 683px width)
        if (width >= 650 && width <= 720 && height >= 700 && height <= 800) {
            return '1366x768-split';
        }

        // Standard 1366x768 detection
        if (width >= 1350 && width <= 1380 && height >= 750 && height <= 780) {
            return '1366x768-full';
        }

        // Other common split-screen scenarios
        if (width >= 600 && width <= 800 && height >= 700) {
            return 'laptop-split';
        }

        return 'standard';
    }

    // Handle window resize for responsive design
    handleWindowResize() {
        const updateResponsiveElements = () => {
            // Update word count position if it exists
            if (this.updateWordCountPosition) {
                this.updateWordCountPosition();
            }

            // Update AI panel height based on screen size
            const aiPanel = document.getElementById('ai-panel');
            const aiMessages = document.getElementById('ai-messages');

            if (aiPanel && aiMessages && !aiPanel.classList.contains('hidden')) {
                const viewportHeight = window.innerHeight;
                const isSmallScreen = viewportHeight < 600;

                if (isSmallScreen) {
                    aiMessages.style.maxHeight = `${viewportHeight - 280}px`;
                } else {
                    aiMessages.style.maxHeight = `${viewportHeight - 220}px`;
                }
            }

            // Update editor and preview heights
            const noteEditor = document.getElementById('note-editor');
            const markdownPreview = document.getElementById('markdown-preview');

            if (noteEditor) {
                const viewportHeight = window.innerHeight;
                // Match markdown-preview calculation for consistency, with extra room for bottom padding
                const editorHeight = Math.max(300, viewportHeight - 200);
                noteEditor.style.height = `${editorHeight}px`;
                noteEditor.style.maxHeight = `${editorHeight}px`;
            }

            if (markdownPreview) {
                const viewportHeight = window.innerHeight;
                const previewHeight = Math.max(200, viewportHeight - 180);
                markdownPreview.style.maxHeight = `${previewHeight}px`;

                // Handle text overflow for long lines in view mode
                const viewportWidth = window.innerWidth;
                const previewViewportHeight = window.innerHeight;

                // Special handling for 1366x768 screens and split-screen scenarios
                if (viewportWidth < 768) {
                    // On mobile, ensure long lines can scroll horizontally
                    markdownPreview.style.overflowX = 'auto';
                    markdownPreview.style.whiteSpace = 'pre-wrap';
                    markdownPreview.style.wordBreak = 'break-word';
                } else if (viewportWidth >= 650 && viewportWidth <= 768) {
                    // Split-screen optimization for 1366x768 screens
                    markdownPreview.style.overflowX = 'auto';
                    markdownPreview.style.whiteSpace = 'pre-wrap';
                    markdownPreview.style.wordBreak = 'break-word';
                    markdownPreview.style.fontSize = '14px'; // Slightly smaller font for split screens
                } else {
                    // On larger screens, allow normal wrapping
                    markdownPreview.style.overflowX = 'hidden';
                    markdownPreview.style.whiteSpace = 'normal';
                    markdownPreview.style.fontSize = '15px'; // Standard font size
                }

                // Handle low-height screens (like 1366x768)
                if (previewViewportHeight <= 800 && viewportWidth >= 1024) {
                    // Optimize for low-height desktop screens
                    if (noteEditor) {
                        noteEditor.style.fontSize = '14px'; // Slightly smaller font
                        noteEditor.style.lineHeight = '1.5'; // Better line spacing
                    }
                }
            }

            // Normalize sidebar across breakpoints to avoid overflow from inline widths
            const sidebar = document.getElementById('sidebar');
            if (sidebar) {
                if (window.innerWidth <= 768) {
                    // Clear desktop inline widths and restore content visibility for mobile overlay
                    sidebar.style.width = '';
                    const content = sidebar.querySelectorAll('.sidebar-header h2, .sidebar-folders, .notes-list');
                    content.forEach(el => { el.style.display = ''; });
                }
            }
        };

        // Initial call
        updateResponsiveElements();

        // Debounced resize handler
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(updateResponsiveElements, 100);
        });
    }

    // Mobile UI Handlers
    initializeMobileUI() {
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const sidebar = document.getElementById('sidebar');
        const sidebarBackdrop = document.getElementById('sidebar-backdrop');
        const searchButton = document.getElementById('search-button');
        const searchContainer = document.getElementById('search-container');

        // Set CSS viewport variable for mobile height accuracy
        const setViewportHeightVar = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        setViewportHeightVar();

        // Update on resize and orientation changes
        window.addEventListener('resize', setViewportHeightVar, { passive: true });
        window.addEventListener('orientationchange', setViewportHeightVar, { passive: true });

        // Mobile menu toggle
        if (mobileMenuToggle) {
            mobileMenuToggle.addEventListener('click', () => {
                this.toggleMobileSidebar();
            });
        }

        // Sidebar backdrop click
        if (sidebarBackdrop) {
            sidebarBackdrop.addEventListener('click', () => {
                this.closeMobileSidebar();
            });
        }

        // Close sidebar when clicking a note on mobile
        if (sidebar) {
            sidebar.addEventListener('click', (e) => {
                if (e.target.closest('.note-item') && window.innerWidth <= 768) {
                    this.closeMobileSidebar();
                }
            });
        }

        // Mobile search toggle (if needed)
        if (searchButton && window.innerWidth <= 768) {
            // On mobile, search might need special handling
            // This is handled by the main app, but we can enhance it here if needed
        }

        // Close mobile search when clicking outside
        document.addEventListener('click', (e) => {
            const searchContainer = document.getElementById('search-container');
            const mobileSearchBtn = document.getElementById('mobile-search-btn');
            if (searchContainer && searchContainer.classList.contains('mobile-active')) {
                // Don't close if clicking inside search container or on the mobile search button
                if (!searchContainer.contains(e.target) && e.target !== mobileSearchBtn) {
                    searchContainer.classList.remove('mobile-active');
                }
            }
        });

        // Handle orientation changes
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.handleOrientationChange();
                setViewportHeightVar();
            }, 100);
        });

        // Close mobile overlays on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (sidebar && sidebar.classList.contains('mobile-open')) {
                    this.closeMobileSidebar();
                }
                // Close mobile search
                const searchContainer = document.getElementById('search-container');
                if (searchContainer && searchContainer.classList.contains('mobile-active')) {
                    searchContainer.classList.remove('mobile-active');
                }
            }
        });

        // Prevent body scroll when sidebar is open on mobile
        const preventScroll = (e) => {
            if (sidebar && sidebar.classList.contains('mobile-open') && window.innerWidth <= 768) {
                if (!e.target.closest('.sidebar')) {
                    e.preventDefault();
                }
            }
        };

        document.addEventListener('touchmove', preventScroll, { passive: false });

        // Swipe gestures for mobile
        this.initializeSwipeGestures();
    }

    toggleMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        
        if (sidebar && backdrop) {
            const isOpen = sidebar.classList.toggle('mobile-open');
            backdrop.classList.toggle('active', isOpen);
            
            // Prevent body scroll when sidebar is open
            if (isOpen) {
                // Ensure mobile overlay uses responsive width (clear any desktop inline width)
                if (window.innerWidth <= 768) {
                    sidebar.style.width = '';
                    const content = sidebar.querySelectorAll('.sidebar-header h2, .sidebar-folders, .notes-list');
                    content.forEach(el => { el.style.display = ''; });
                }
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        }
    }

    closeMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        
        if (sidebar && backdrop) {
            sidebar.classList.remove('mobile-open');
            backdrop.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    openMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        
        if (sidebar && backdrop) {
            sidebar.classList.add('mobile-open');
            backdrop.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    handleOrientationChange() {
        // Close any open mobile overlays on orientation change
        this.closeMobileSidebar();
        
        // Update responsive elements
        if (this.updateWordCountPosition) {
            this.updateWordCountPosition();
        }

        // Adjust AI panel if needed
        const aiPanel = document.getElementById('ai-panel');
        if (aiPanel && !aiPanel.classList.contains('hidden')) {
            // Force a reflow to ensure proper positioning
            aiPanel.style.display = 'none';
            setTimeout(() => {
                aiPanel.style.display = '';
            }, 100);
        }
    }

    initializeSwipeGestures() {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;

        const mainContent = document.querySelector('.main-content-area');
        if (!mainContent) return;

        mainContent.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        mainContent.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            this.handleSwipeGesture(touchStartX, touchStartY, touchEndX, touchEndY);
        }, { passive: true });
    }

    handleSwipeGesture(startX, startY, endX, endY) {
        // Only on mobile
        if (window.innerWidth > 768) return;

        const diffX = endX - startX;
        const diffY = endY - startY;
        const minSwipeDistance = 50;

        // Horizontal swipe is dominant
        if (Math.abs(diffX) > Math.abs(diffY)) {
            // Swipe right from left edge - open sidebar
            if (diffX > minSwipeDistance && startX < 50) {
                this.openMobileSidebar();
            }
            // Swipe left - close sidebar
            else if (diffX < -minSwipeDistance) {
                const sidebar = document.getElementById('sidebar');
                if (sidebar && sidebar.classList.contains('mobile-open')) {
                    this.closeMobileSidebar();
                }
            }
        }
    }

    // Optimize touch interactions
    optimizeTouchInteractions() {
        // Add touch-friendly ripple effect to buttons
        const buttons = document.querySelectorAll('button, .action-btn, .note-item');
        
        buttons.forEach(button => {
            button.addEventListener('touchstart', function(e) {
                // Add visual feedback for touch
                this.style.opacity = '0.7';
            }, { passive: true });

            button.addEventListener('touchend', function(e) {
                // Remove visual feedback
                setTimeout(() => {
                    this.style.opacity = '';
                }, 100);
            }, { passive: true });
        });
    }

    // Check if device is mobile
    isMobile() {
        return window.innerWidth <= 768 || 
               /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // Check if device is tablet
    isTablet() {
        return window.innerWidth > 768 && window.innerWidth <= 1024;
    }

    // Initialize all UI enhancements
    initialize() {
        this.enhanceContextMenu();
        this.enhanceSidebar();
        this.enhanceEditor();
        this.handleWindowResize();
        this.initializeMobileUI();
        this.optimizeTouchInteractions();

        // Add keyboard shortcuts help to menu
        if (typeof ipcRenderer !== 'undefined') {
            ipcRenderer.on('show-shortcuts', () => this.showKeyboardShortcuts());
        }

        // Expose test function globally for debugging
        window.testResponsiveDesign = () => this.testResponsiveDesign();

        // Add CSS animations
        this.injectStyles();

        // Expose mobile helpers
        window.isMobileDevice = () => this.isMobile();
        window.isTabletDevice = () => this.isTablet();
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }

    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }

    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }

    .notification.selected {
        background: var(--accent-color-dark) !important;
    }

    .context-menu-item.selected {
        background: var(--context-menu-hover-bg);
        font-weight: bold;
    }

    /* Password Dialog Styles */
    .password-dialog {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
        animation: fadeIn 0.3s ease;
    }

    .password-dialog-content {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        padding: 24px;
        max-width: 400px;
        width: 90%;
        animation: slideIn 0.3s ease;
    }

    .password-dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
    }

    .password-dialog-header h3 {
        margin: 0;
        color: var(--text-primary);
        font-size: 18px;
    }

    .password-dialog-close {
        background: none;
        border: none;
        color: var(--text-secondary);
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
    }

    .password-dialog-close:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }

    .password-dialog-body {
        margin-bottom: 20px;
    }

    .password-field {
        margin-bottom: 16px;
    }

    .password-field label {
        display: block;
        margin-bottom: 6px;
        font-weight: 500;
        color: var(--text-primary);
    }

    .password-input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--bg-secondary);
        color: var(--text-primary);
        font-size: 14px;
        box-sizing: border-box;
    }

    .password-input:focus {
        outline: none;
        border-color: var(--accent-color);
        box-shadow: 0 0 0 2px rgba(62, 207, 142, 0.2);
    }

    .password-strength {
        margin-top: 4px;
        font-size: 12px;
        display: none;
    }

    .password-strength.weak { color: #dc3545; }
    .password-strength.medium { color: #ffc107; }
    .password-strength.strong { color: #28a745; }

    .password-dialog-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
    }

    .btn-secondary, .btn-primary {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .btn-secondary {
        background: var(--bg-secondary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
    }

    .btn-secondary:hover {
        background: var(--bg-hover);
    }

    .btn-primary {
        background: var(--accent-color);
        color: white;
    }

    .btn-primary:hover {
        background: var(--accent-color-dark);
    }

    .btn-danger {
        background: #dc3545;
        color: white;
    }

    .btn-danger:hover {
        background: #c82333;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    @keyframes slideIn {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
`;
        document.head.appendChild(style);
    }

    // Password Dialog Methods
    showPasswordDialog(options = {}) {
        const defaultTitle = window.i18n ? window.i18n.t('password.enterPassword') : 'Enter Password';
        const passwordLabel = window.i18n ? window.i18n.t('password.password') : 'Password:';
        const confirmPasswordLabel = window.i18n ? window.i18n.t('password.confirmPassword') : 'Confirm Password:';
        const passwordPlaceholder = window.i18n ? window.i18n.t('password.enterPasswordPlaceholder') : 'Enter password';
        const confirmPasswordPlaceholder = window.i18n ? window.i18n.t('password.confirmPasswordPlaceholder') : 'Confirm password';
        const cancelText = window.i18n ? window.i18n.t('modals.cancel') : 'Cancel';
        const submitText = window.i18n ? window.i18n.t('modals.submit') : 'Submit';
        
        const {
            title = defaultTitle,
            message = '',
            requireConfirmation = false,
            showStrength = false,
            onSubmit,
            onCancel
        } = options;

        // Remove existing dialog
        this.closePasswordDialog();

        const dialog = document.createElement('div');
        dialog.className = 'password-dialog';
        dialog.innerHTML = `
            <div class="password-dialog-content">
                <div class="password-dialog-header">
                    <h3>${title}</h3>
                    <button class="password-dialog-close">×</button>
                </div>
                <div class="password-dialog-body">
                    ${message ? `<p style="margin-bottom: 16px; color: var(--text-secondary);">${message}</p>` : ''}
                    <div class="password-field">
                        <label for="password-input">${passwordLabel}</label>
                        <input type="password" id="password-input" class="password-input" placeholder="${passwordPlaceholder}">
                        <div class="password-strength" id="password-strength"></div>
                    </div>
                    ${requireConfirmation ? `
                    <div class="password-field">
                        <label for="confirm-password-input">${confirmPasswordLabel}</label>
                        <input type="password" id="confirm-password-input" class="password-input" placeholder="${confirmPasswordPlaceholder}">
                    </div>
                    ` : ''}
                </div>
                <div class="password-dialog-actions">
                    <button class="btn-secondary" id="password-cancel">${cancelText}</button>
                    <button class="btn-primary" id="password-submit">${submitText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
        this.currentPasswordDialog = dialog;

        const passwordInput = dialog.querySelector('#password-input');
        const confirmInput = dialog.querySelector('#confirm-password-input');
        const strengthIndicator = dialog.querySelector('#password-strength');
        const submitBtn = dialog.querySelector('#password-submit');
        const cancelBtn = dialog.querySelector('#password-cancel');
        const closeBtn = dialog.querySelector('.password-dialog-close');

        // Focus password input
        setTimeout(() => passwordInput.focus(), 100);

        // Show strength indicator if requested
        if (showStrength) {
            strengthIndicator.style.display = 'block';
            passwordInput.addEventListener('input', () => {
                const strength = this.calculatePasswordStrength(passwordInput.value);
                const strengthLabel = window.i18n ? window.i18n.t('password.passwordStrength') : 'Password strength';
                const levelKey = `password.${strength.level.toLowerCase()}`;
                const levelLabel = window.i18n ? window.i18n.t(levelKey) : strength.level;
                strengthIndicator.textContent = `${strengthLabel}: ${levelLabel}`;
                strengthIndicator.className = `password-strength ${strength.level.toLowerCase()}`;
            });
        }

        // Handle submit
        const handleSubmit = () => {
            const password = passwordInput.value;
            const confirmPassword = confirmInput ? confirmInput.value : password;

            if (requireConfirmation && password !== confirmPassword) {
                this.showNotification('Passwords do not match', 'error');
                return;
            }

            if (!password.trim()) {
                this.showNotification('Password cannot be empty', 'error');
                return;
            }

            if (onSubmit) {
                onSubmit(password);
            }
            this.closePasswordDialog();
        };

        // Handle cancel
        const handleCancel = () => {
            if (onCancel) {
                onCancel();
            }
            this.closePasswordDialog();
        };

        // Event listeners
        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);

        // Keyboard events
        passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (requireConfirmation && confirmInput && document.activeElement !== confirmInput) {
                    confirmInput.focus();
                } else {
                    handleSubmit();
                }
            } else if (e.key === 'Escape') {
                handleCancel();
            }
        });

        if (confirmInput) {
            confirmInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                } else if (e.key === 'Escape') {
                    handleCancel();
                }
            });
        }

        // Click outside to close
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                handleCancel();
            }
        });

        return dialog;
    }

    closePasswordDialog() {
        if (this.currentPasswordDialog) {
            this.currentPasswordDialog.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                if (this.currentPasswordDialog && this.currentPasswordDialog.parentNode) {
                    this.currentPasswordDialog.parentNode.removeChild(this.currentPasswordDialog);
                }
                this.currentPasswordDialog = null;
            }, 300);
        }
    }

    calculatePasswordStrength(password) {
        let score = 0;
        let feedback = [];

        if (password.length >= 8) score++;
        else feedback.push('At least 8 characters');

        if (/[a-z]/.test(password)) score++;
        else feedback.push('Lowercase letter');

        if (/[A-Z]/.test(password)) score++;
        else feedback.push('Uppercase letter');

        if (/\d/.test(password)) score++;
        else feedback.push('Number');

        if (/[^a-zA-Z\d]/.test(password)) score++;
        else feedback.push('Special character');

        let level = 'Weak';
        if (score >= 4) level = 'Strong';
        else if (score >= 3) level = 'Medium';

        return { level, score, feedback };
    }
}

// Export for use in main app
window.UIManager = UIManager;
