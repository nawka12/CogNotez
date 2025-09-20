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

        // Collapsible sidebar
        let isCollapsed = false;
        toggle.addEventListener('click', () => {
            isCollapsed = !isCollapsed;
            sidebar.style.width = isCollapsed ? '60px' : '280px';

            // Hide/show sidebar content
            const content = sidebar.querySelectorAll('.sidebar-header h2, .notes-list');
            content.forEach(el => {
                el.style.display = isCollapsed ? 'none' : 'block';
            });

            toggle.innerHTML = isCollapsed ? '<i class="fas fa-bars"></i>' : '<i class="fas fa-chevron-left"></i>';
        });

        // Note drag and drop (placeholder)
        this.setupDragAndDrop();
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
        const shortcuts = [
            { key: 'Ctrl+N', description: 'New Note' },
            { key: 'Ctrl+S', description: 'Save Note' },
            { key: 'Ctrl+O', description: 'Open Note' },
            { key: 'Ctrl+/', description: 'Focus Search' },
            { key: 'Ctrl+Shift+S', description: 'Summarize Selection' },
            { key: 'Ctrl+Shift+A', description: 'Ask AI About Selection' },
            { key: 'Ctrl+Shift+E', description: 'Edit Selection with AI' }
        ];

        const content = `
            <div style="max-height: 400px; overflow-y: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--border-color);">Shortcut</th>
                            <th style="text-align: left; padding: 8px; border-bottom: 1px solid var(--border-color);">Description</th>
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
                const editorHeight = Math.max(300, viewportHeight - 150);
                const maxEditorHeight = viewportHeight - 120;
                noteEditor.style.height = `${Math.min(editorHeight, maxEditorHeight)}px`;
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

    // Initialize all UI enhancements
    initialize() {
        this.enhanceContextMenu();
        this.enhanceSidebar();
        this.enhanceEditor();
        this.handleWindowResize();

        // Add keyboard shortcuts help to menu
        if (typeof ipcRenderer !== 'undefined') {
            ipcRenderer.on('show-shortcuts', () => this.showKeyboardShortcuts());
        }

        // Expose test function globally for debugging
        window.testResponsiveDesign = () => this.testResponsiveDesign();
    }
}

// Add CSS animations
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
`;
document.head.appendChild(style);

// Export for use in main app
window.UIManager = UIManager;
