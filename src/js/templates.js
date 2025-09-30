// Note Templates Manager
class TemplatesManager {
    constructor(app) {
        this.app = app;
        this.templates = [];
        this.customTemplates = [];
        this.dialog = null;
    }

    async initialize() {
        console.log('[Templates] Initializing templates manager...');
        this.dialog = document.getElementById('template-chooser');
        this.loadDefaultTemplates();
        await this.loadCustomTemplates();
        this.setupEventListeners();
        console.log('[Templates] Templates initialized with', this.templates.length, 'templates');
    }

    loadDefaultTemplates() {
        this.templates = [
            {
                id: 'blank',
                name: 'Blank Note',
                description: 'Start with a clean slate',
                icon: '📝',
                content: '',
                isDefault: true
            },
            {
                id: 'meeting-notes',
                name: 'Meeting Notes',
                description: 'Template for meeting minutes',
                icon: '📋',
                content: `# Meeting Notes

**Date:** ${new Date().toLocaleDateString()}
**Attendees:** 

## Agenda
- 

## Discussion Points
- 

## Action Items
- [ ] 

## Next Meeting
`,
                isDefault: true
            },
            {
                id: 'daily-journal',
                name: 'Daily Journal',
                description: 'Daily journaling template',
                icon: '📓',
                content: `# Daily Journal - ${new Date().toLocaleDateString()}

## Mood
😊 / 😐 / 😔

## Today's Goals
- [ ] 
- [ ] 
- [ ] 

## What Happened


## Grateful For
1. 
2. 
3. 

## Tomorrow's Focus
`,
                isDefault: true
            },
            {
                id: 'project-plan',
                name: 'Project Plan',
                description: 'Project planning template',
                icon: '🎯',
                content: `# Project Plan

## Overview
**Project Name:** 
**Start Date:** ${new Date().toLocaleDateString()}
**Status:** Planning

## Objectives
- 

## Milestones
1. [ ] 
2. [ ] 
3. [ ] 

## Resources Needed
- 

## Timeline
- Week 1: 
- Week 2: 
- Week 3: 

## Risks & Mitigation
- 

## Success Criteria
- 
`,
                isDefault: true
            },
            {
                id: 'book-notes',
                name: 'Book Notes',
                description: 'Template for book summaries',
                icon: '📚',
                content: `# Book Notes

**Title:** 
**Author:** 
**Date Read:** ${new Date().toLocaleDateString()}
**Rating:** ⭐⭐⭐⭐⭐

## Summary
Brief overview of the book...

## Key Takeaways
1. 
2. 
3. 

## Favorite Quotes
> 

## My Thoughts
`,
                isDefault: true
            },
            {
                id: 'research-notes',
                name: 'Research Notes',
                description: 'Academic research template',
                icon: '🔬',
                content: `# Research Notes

**Topic:** 
**Date:** ${new Date().toLocaleDateString()}
**Source:** 

## Research Question


## Key Findings
- 

## Data/Evidence


## Analysis


## References
1. 
`,
                isDefault: true
            },
            {
                id: 'todo-list',
                name: 'To-Do List',
                description: 'Task management template',
                icon: '✅',
                content: `# To-Do List - ${new Date().toLocaleDateString()}

## High Priority
- [ ] 
- [ ] 

## Medium Priority
- [ ] 
- [ ] 

## Low Priority
- [ ] 
- [ ] 

## Completed Today
- [x] 
`,
                isDefault: true
            },
            {
                id: 'brainstorm',
                name: 'Brainstorm',
                description: 'Idea generation template',
                icon: '💡',
                content: `# Brainstorming Session

**Topic:** 
**Date:** ${new Date().toLocaleDateString()}

## Ideas
1. 
2. 
3. 
4. 
5. 

## Best Ideas
⭐ 

## Next Steps
- [ ] 
`,
                isDefault: true
            },
            {
                id: 'recipe',
                name: 'Recipe',
                description: 'Cooking recipe template',
                icon: '🍳',
                content: `# Recipe: 

**Prep Time:** 
**Cook Time:** 
**Servings:** 
**Difficulty:** Easy / Medium / Hard

## Ingredients
- 
- 
- 

## Instructions
1. 
2. 
3. 

## Notes
`,
                isDefault: true
            },
            {
                id: 'code-snippet',
                name: 'Code Snippet',
                description: 'Code documentation template',
                icon: '💻',
                content: `# Code Snippet

**Language:** 
**Purpose:** 
**Date:** ${new Date().toLocaleDateString()}

## Code
\`\`\`javascript
// Your code here
\`\`\`

## Description


## Usage
\`\`\`javascript
// Example usage
\`\`\`

## Notes
`,
                isDefault: true
            }
        ];
    }

    async loadCustomTemplates() {
        try {
            const db = this.app.notesManager?.db;
            if (!db || !db.initialized) return;

            // Custom templates are stored as settings
            const customTemplatesData = db.getSetting('custom_templates');
            if (customTemplatesData) {
                this.customTemplates = customTemplatesData;
                this.templates.push(...this.customTemplates);
            }
        } catch (error) {
            console.error('[Templates] Failed to load custom templates:', error);
        }
    }

    setupEventListeners() {
        // Close button
        const closeBtn = document.getElementById('template-chooser-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // Create custom template button
        const createCustomBtn = document.getElementById('create-custom-template-btn');
        console.log('[Templates] Create custom template button found:', !!createCustomBtn);
        if (createCustomBtn) {
            createCustomBtn.addEventListener('click', () => {
                console.log('[Templates] Create custom template button clicked');
                this.createCustomTemplate();
            });
        } else {
            console.error('[Templates] Create custom template button not found!');
        }

        // Generate AI template button
        const generateAIBtn = document.getElementById('generate-ai-template-btn');
        console.log('[Templates] Generate AI template button found:', !!generateAIBtn);
        if (generateAIBtn) {
            generateAIBtn.addEventListener('click', () => {
                console.log('[Templates] Generate AI template button clicked');
                this.generateAITemplate();
            });
        }

        // Close on ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.close();
            }
        });
    }

    show() {
        console.log('[Templates] show() called');
        if (!this.dialog) {
            console.error('[Templates] Dialog element not found!');
            return;
        }

        this.renderTemplates();
        this.dialog.classList.remove('hidden');
        console.log('[Templates] Template chooser dialog shown');
    }

    close() {
        if (!this.dialog) return;
        this.dialog.classList.add('hidden');
    }

    isOpen() {
        return this.dialog && !this.dialog.classList.contains('hidden');
    }

    renderTemplates() {
        const grid = document.getElementById('template-grid');
        if (!grid) return;

        grid.innerHTML = '';

        this.templates.forEach(template => {
            const card = this.createTemplateCard(template);
            grid.appendChild(card);
        });
    }

    createTemplateCard(template) {
        const card = document.createElement('div');
        card.className = 'template-card';
        
        const deleteBtn = !template.isDefault 
            ? `<button class="template-delete-btn" title="Delete template"><i class="fas fa-trash"></i></button>`
            : '';
        
        card.innerHTML = `
            ${deleteBtn}
            <div class="template-card-icon">${template.icon}</div>
            <div class="template-card-title">${template.name}</div>
            <div class="template-card-description">${template.description}</div>
        `;

        // Handle card click for using template
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking delete button
            if (!e.target.closest('.template-delete-btn')) {
                this.useTemplate(template);
            }
        });

        // Handle delete button for custom templates
        if (!template.isDefault) {
            const deleteButton = card.querySelector('.template-delete-btn');
            if (deleteButton) {
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteCustomTemplate(template.id);
                });
            }
        }

        return card;
    }

    async useTemplate(template) {
        console.log('[Templates] Using template:', template.name);

        try {
            // Create a new note with the template content
            if (this.app.createNewNote) {
                await this.app.createNewNote();
                
                // Set the template content
                const editor = document.getElementById('note-editor');
                if (editor && this.app.currentNote) {
                    editor.value = template.content;
                    
                    // Update the note in database
                    const db = this.app.notesManager?.db;
                    if (db && db.initialized) {
                        db.updateNote(this.app.currentNote.id, {
                            content: template.content,
                            preview: this.generatePreview(template.content)
                        });
                    }
                    
                    // Update preview if in preview mode
                    this.app.updatePreview?.();
                }
            }

            this.close();
            this.app.showNotification?.(`Template "${template.name}" applied`, 'success');

        } catch (error) {
            console.error('[Templates] Failed to apply template:', error);
            this.app.showNotification?.('Failed to apply template', 'error');
        }
    }

    generatePreview(content) {
        return content.substring(0, 200).replace(/#/g, '').trim();
    }

    async generateAITemplate() {
        console.log('[Templates] generateAITemplate called');

        // Check if AI manager exists and is initialized
        if (!this.app.aiManager) {
            console.error('[Templates] AI manager not found');
            this.app.showNotification?.('AI is not available. Please restart the application.', 'error');
            return;
        }

        // Check if AI is connected
        if (!this.app.aiManager.isConnected) {
            console.error('[Templates] AI manager not connected');
            this.app.showNotification?.('AI is not connected. Please check your AI settings and ensure your AI service is running.', 'error');
            return;
        }

        console.log('[Templates] AI manager available and connected');
        // Show AI template generation dialog
        this.showAITemplateDialog();
    }

    showAITemplateDialog() {
        const dialogHTML = `
            <div id="ai-template-dialog-overlay" class="modal">
                <div class="modal-content" style="max-width: 600px; background: var(--modal-bg, rgba(255, 255, 255, 0.95)); color: var(--text-primary);">
                    <div class="modal-header" style="border-bottom: 1px solid var(--border-color);">
                        <h3 style="color: var(--text-primary);"><i class="fas fa-robot"></i> Generate Template with AI</h3>
                        <button id="ai-template-dialog-close" class="modal-close" style="color: var(--text-secondary);" title="Close"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body" style="color: var(--text-primary);">
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label for="ai-template-description" style="display: block; margin-bottom: 8px; font-weight: 500;">
                                Describe the template you want to create:
                            </label>
                            <textarea 
                                id="ai-template-description" 
                                placeholder="e.g., A template for bug reports with sections for steps to reproduce, expected behavior, actual behavior, and environment details"
                                style="width: 100%; min-height: 120px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-family: inherit; resize: vertical;"
                            ></textarea>
                        </div>
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 12px; font-weight: 500;">Template Type (optional):</label>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;">
                                <button class="ai-template-suggestion" data-type="Meeting Notes">📋 Meeting Notes</button>
                                <button class="ai-template-suggestion" data-type="Project Plan">🎯 Project Plan</button>
                                <button class="ai-template-suggestion" data-type="Bug Report">🐛 Bug Report</button>
                                <button class="ai-template-suggestion" data-type="Weekly Review">📊 Weekly Review</button>
                                <button class="ai-template-suggestion" data-type="Research Notes">🔬 Research Notes</button>
                                <button class="ai-template-suggestion" data-type="Recipe">🍳 Recipe</button>
                            </div>
                        </div>
                        <div id="ai-template-preview-section" class="hidden" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text-primary);">Generated Template Preview:</label>
                            <div id="ai-template-preview" style="max-height: 300px; overflow-y: auto; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; font-family: 'Courier New', monospace; font-size: 13px; white-space: pre-wrap; color: var(--text-primary);"></div>
                        </div>
                        <div id="ai-template-loading" class="hidden" style="text-align: center; padding: 20px;">
                            <div class="loading-spinner" style="margin: 0 auto 12px;"></div>
                            <p style="color: var(--text-secondary);">Generating template with AI...</p>
                        </div>
                        <div class="ai-dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button id="ai-template-cancel" class="btn-secondary">Cancel</button>
                            <button id="ai-template-generate" class="btn-primary"><i class="fas fa-magic"></i> Generate</button>
                            <button id="ai-template-save" class="btn-primary hidden"><i class="fas fa-save"></i> Save as Template</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add dialog to DOM
        const dialogContainer = document.createElement('div');
        dialogContainer.innerHTML = dialogHTML;
        document.body.appendChild(dialogContainer.firstElementChild);

        const overlay = document.getElementById('ai-template-dialog-overlay');
        const descInput = document.getElementById('ai-template-description');
        const generateBtn = document.getElementById('ai-template-generate');
        const saveBtn = document.getElementById('ai-template-save');
        const loadingDiv = document.getElementById('ai-template-loading');
        const previewSection = document.getElementById('ai-template-preview-section');
        const previewDiv = document.getElementById('ai-template-preview');

        let generatedContent = '';

        // Focus description input
        setTimeout(() => descInput.focus(), 100);

        // Close handlers
        const closeDialog = () => {
            overlay.remove();
        };

        document.getElementById('ai-template-dialog-close').addEventListener('click', closeDialog);
        document.getElementById('ai-template-cancel').addEventListener('click', closeDialog);

        // Template suggestion buttons
        document.querySelectorAll('.ai-template-suggestion').forEach(btn => {
            btn.style.cssText = `
                padding: 10px;
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 13px;
                color: var(--text-primary);
                font-weight: 500;
            `;

            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-type');
                descInput.value = `A ${type.toLowerCase()} template with appropriate sections and formatting`;
            });

            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'var(--button-hover-bg)';
                btn.style.borderColor = 'var(--accent-color)';
                btn.style.color = 'var(--accent-color)';
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'var(--bg-secondary)';
                btn.style.borderColor = 'var(--border-color)';
                btn.style.color = 'var(--text-primary)';
            });
        });

        // Generate button handler
        const generateTemplate = async () => {
            const description = descInput.value.trim();
            
            if (!description) {
                descInput.focus();
                descInput.style.borderColor = 'var(--error-color, #f44336)';
                return;
            }

            console.log('[Templates] Generating AI template for:', description);

            // Show loading
            generateBtn.disabled = true;
            loadingDiv.classList.remove('hidden');
            previewSection.classList.add('hidden');
            saveBtn.classList.add('hidden');

            try {
                // Create prompt for AI
                const prompt = `Create a markdown template for: ${description}

Requirements:
1. Use markdown formatting (headers, lists, checkboxes, etc.)
2. Include appropriate sections with clear structure
3. Add placeholder text where users should fill in information
4. Use emojis sparingly for visual appeal
5. Make it practical and immediately usable
6. Include the current date where appropriate
7. Don't include any explanatory text - just output the template itself

Generate the template now:`;

                // Use AI to generate template
                const response = await this.app.aiManager.processWithAI(prompt);
                generatedContent = response.trim();

                console.log('[Templates] AI template generated successfully');

                // Show preview
                previewDiv.textContent = generatedContent;
                previewSection.classList.remove('hidden');
                saveBtn.classList.remove('hidden');
                generateBtn.textContent = 'Regenerate';

            } catch (error) {
                console.error('[Templates] Failed to generate AI template:', error);

                // Provide more specific error messages
                let errorMessage = 'Failed to generate template. ';
                if (error.message.includes('Connection timeout') || error.message.includes('not available')) {
                    errorMessage += 'Please check your AI service connection.';
                } else if (error.message.includes('API key')) {
                    errorMessage += 'Please check your AI API key in settings.';
                } else {
                    errorMessage += 'Please try again or check the console for details.';
                }

                this.app.showNotification?.(errorMessage, 'error');
            } finally {
                loadingDiv.classList.add('hidden');
                generateBtn.disabled = false;
            }
        };

        generateBtn.addEventListener('click', generateTemplate);

        // Save button handler
        saveBtn.addEventListener('click', () => {
            if (!generatedContent) return;
            
            // Close AI dialog and open template creator with generated content
            closeDialog();
            this.showTemplateCreatorDialog(generatedContent, true);
        });

        // Enter key on description to generate
        descInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                generateTemplate();
            }
        });

        // Close on ESC
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeDialog();
            }
        });
    }

    async createCustomTemplate() {
        console.log('[Templates] createCustomTemplate called');
        
        // Get current note content
        const editor = document.getElementById('note-editor');
        const currentContent = editor ? editor.value : '';
        console.log('[Templates] Editor found:', !!editor, 'Content length:', currentContent.length);

        // Show the custom template creator dialog
        this.showTemplateCreatorDialog(currentContent);
    }

    showTemplateCreatorDialog(content, isAIGenerated = false) {
        // Try to extract a name from the content if AI-generated
        let suggestedName = '';
        let suggestedDescription = '';
        let suggestedIcon = '📝';
        
        if (isAIGenerated && content) {
            // Try to extract from first heading
            const firstHeading = content.match(/^#\s+(.+)$/m);
            if (firstHeading) {
                suggestedName = firstHeading[1].trim();
                suggestedDescription = `AI-generated template for ${suggestedName.toLowerCase()}`;
            }
            
            // Try to detect icon from content
            const emojiMatch = content.match(/[\u{1F300}-\u{1F9FF}]/u);
            if (emojiMatch) {
                suggestedIcon = emojiMatch[0];
            }
        }
        
        // Create custom dialog for template creation
        const dialogHTML = `
            <div id="template-creator-overlay" class="modal">
                <div class="modal-content" style="max-width: 500px; background: var(--modal-bg, rgba(255, 255, 255, 0.95)); color: var(--text-primary);">
                    <div class="modal-header" style="border-bottom: 1px solid var(--border-color);">
                        <h3 style="color: var(--text-primary);">${isAIGenerated ? '<i class="fas fa-robot"></i> ' : ''}Save Custom Template</h3>
                        <button id="template-creator-close" class="modal-close" style="color: var(--text-secondary);" title="Close"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body" style="color: var(--text-primary);">
                        ${!content ? '<div class="template-creator-warning" style="padding: 12px; background: var(--warning-bg, #fff3cd); border: 1px solid var(--warning-border, #ffc107); border-radius: 6px; margin-bottom: 16px; color: var(--warning-text, #856404);"><i class="fas fa-exclamation-triangle"></i> No content in current note. Template will be empty.</div>' : ''}
                        ${isAIGenerated ? '<div class="template-creator-info" style="padding: 12px; background: var(--accent-bg, #e3f2fd); border: 1px solid var(--accent-border, #2196F3); border-radius: 6px; margin-bottom: 16px; color: var(--accent-text, #1565c0);"><i class="fas fa-magic"></i> Template generated by AI. Review and customize before saving.</div>' : ''}
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label for="template-name-input" style="display: block; margin-bottom: 8px; font-weight: 500;">Template Name *</label>
                            <input type="text" id="template-name-input" class="ai-dialog-input" placeholder="e.g., Weekly Report" value="${suggestedName}" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);" required>
                        </div>
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label for="template-description-input" style="display: block; margin-bottom: 8px; font-weight: 500;">Description *</label>
                            <input type="text" id="template-description-input" class="ai-dialog-input" placeholder="e.g., Template for weekly status reports" value="${suggestedDescription}" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);" required>
                        </div>
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label for="template-icon-input" style="display: block; margin-bottom: 8px; font-weight: 500;">Icon (emoji)</label>
                            <input type="text" id="template-icon-input" class="ai-dialog-input" placeholder="📝" value="${suggestedIcon}" maxlength="2" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                        </div>
                        <div class="ai-dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button id="template-creator-cancel" class="btn-secondary">Cancel</button>
                            <button id="template-creator-create" class="btn-primary">Save Template</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add dialog to DOM
        const dialogContainer = document.createElement('div');
        dialogContainer.innerHTML = dialogHTML;
        document.body.appendChild(dialogContainer.firstElementChild);

        const overlay = document.getElementById('template-creator-overlay');
        const nameInput = document.getElementById('template-name-input');
        const descInput = document.getElementById('template-description-input');
        const iconInput = document.getElementById('template-icon-input');

        // Focus name input
        setTimeout(() => nameInput.focus(), 100);

        // Close handlers
        const closeDialog = () => {
            overlay.remove();
        };

        document.getElementById('template-creator-close').addEventListener('click', closeDialog);
        document.getElementById('template-creator-cancel').addEventListener('click', closeDialog);

        // Create template handler
        const createTemplate = async () => {
            const name = nameInput.value.trim();
            const description = descInput.value.trim();
            const icon = iconInput.value.trim() || '📝';

            if (!name) {
                nameInput.focus();
                nameInput.style.borderColor = 'var(--error-color, #f44336)';
                return;
            }

            if (!description) {
                descInput.focus();
                descInput.style.borderColor = 'var(--error-color, #f44336)';
                return;
            }

            console.log('[Templates] Creating template:', { name, description, icon });

            const template = {
                id: `custom-${Date.now()}`,
                name,
                description,
                icon,
                content: content,
                isDefault: false,
                createdAt: new Date().toISOString()
            };

            this.customTemplates.push(template);
            this.templates.push(template);

            // Save to database
            await this.saveCustomTemplates();
            
            this.app.showNotification?.(`Template "${name}" created successfully!`, 'success');
            this.renderTemplates();
            
            console.log('[Templates] Template saved and rendered');
            closeDialog();
        };

        document.getElementById('template-creator-create').addEventListener('click', createTemplate);

        // Enter key to create
        [nameInput, descInput, iconInput].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    createTemplate();
                }
            });
        });

        // Close on ESC
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeDialog();
            }
        });
    }

    async saveCustomTemplates() {
        try {
            const db = this.app.notesManager?.db;
            if (!db || !db.initialized) return;

            db.setSetting('custom_templates', this.customTemplates);
        } catch (error) {
            console.error('[Templates] Failed to save custom templates:', error);
        }
    }

    async deleteCustomTemplate(templateId) {
        const index = this.customTemplates.findIndex(t => t.id === templateId);
        if (index === -1) return;

        const template = this.customTemplates[index];
        
        // Create confirmation dialog
        const dialogHTML = `
            <div id="template-delete-confirm-overlay" class="modal">
                <div class="modal-content" style="max-width: 400px; background: var(--modal-bg, rgba(255, 255, 255, 0.95)); color: var(--text-primary);">
                    <div class="modal-header" style="border-bottom: 1px solid var(--border-color);">
                        <h3 style="color: var(--text-primary);">Delete Template</h3>
                        <button id="template-delete-confirm-close" class="modal-close" style="color: var(--text-secondary);" title="Close"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body" style="color: var(--text-primary);">
                        <p style="margin-bottom: 20px;">Are you sure you want to delete the template <strong>"${template.name}"</strong>?</p>
                        <p style="color: var(--text-secondary); font-size: 14px;">This action cannot be undone.</p>
                        <div class="ai-dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                            <button id="template-delete-cancel" class="btn-secondary">Cancel</button>
                            <button id="template-delete-confirm" class="btn-primary" style="background: var(--error-color, #f44336);">Delete</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add dialog to DOM
        const dialogContainer = document.createElement('div');
        dialogContainer.innerHTML = dialogHTML;
        document.body.appendChild(dialogContainer.firstElementChild);

        const overlay = document.getElementById('template-delete-confirm-overlay');

        // Close handler
        const closeDialog = () => {
            overlay.remove();
        };

        document.getElementById('template-delete-confirm-close').addEventListener('click', closeDialog);
        document.getElementById('template-delete-cancel').addEventListener('click', closeDialog);

        // Delete handler
        document.getElementById('template-delete-confirm').addEventListener('click', async () => {
            this.customTemplates.splice(index, 1);
            this.templates = this.templates.filter(t => t.id !== templateId);

            await this.saveCustomTemplates();
            this.renderTemplates();
            this.app.showNotification?.('Template deleted', 'success');
            
            closeDialog();
        });

        // Close on ESC
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeDialog();
            }
        });
    }
}

// Export for use in main app
if (typeof window !== 'undefined') {
    window.TemplatesManager = TemplatesManager;
}
