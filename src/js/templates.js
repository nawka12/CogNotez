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
        
        // Re-render templates when language changes
        window.addEventListener('languageChanged', async () => {
            // Reload templates with new language
            this.loadDefaultTemplates();
            await this.loadCustomTemplates();
            if (this.isOpen()) {
                this.renderTemplates();
            }
        });
        
        console.log('[Templates] Templates initialized with', this.templates.length, 'templates');
    }

    // Helper function to get translated template name
    getTemplateName(template) {
        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        return template.nameKey ? t(template.nameKey) : (template.name || '');
    }

    // Helper function to get translated template description
    getTemplateDescription(template) {
        const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
        return template.descriptionKey ? t(template.descriptionKey) : (template.description || '');
    }

    // Helper function to get translated template content string
    t(key, params = {}) {
        return window.i18n ? window.i18n.t(key, params) : key;
    }

    // Helper function to process template content and apply translations
    processTemplateContent(content) {
        if (!content || typeof content !== 'string') return content;
        
        const tc = (key, params) => this.t(`templates.templateContent.${key}`, params);
        const t = (key, params) => this.t(key, params);
        
        // Replace translation placeholders with actual translations
        // Pattern: {{tc:key}} or {{tc:key:number:1}} for params
        let processed = content;
        
        // Handle template content translations: {{tc:key}} or {{tc:key:number:1}}
        processed = processed.replace(/\{\{tc:([^}:]+)(?::([^}]+))?\}\}/g, (match, key, paramStr) => {
            const params = {};
            if (paramStr) {
                const paramPairs = paramStr.split(':');
                for (let i = 0; i < paramPairs.length; i += 2) {
                    if (paramPairs[i + 1]) {
                        const paramValue = paramPairs[i + 1];
                        // Try to parse as number if it's a number
                        params[paramPairs[i]] = isNaN(paramValue) ? paramValue : Number(paramValue);
                    }
                }
            }
            return tc(key, params);
        });
        
        // Handle regular translations: {{t:key}}
        processed = processed.replace(/\{\{t:([^}]+)\}\}/g, (match, key) => {
            return t(key);
        });
        
        // Handle date formatting: {{date}} or {{date:format}}
        processed = processed.replace(/\{\{date(?::([^}]+))?\}\}/g, (match, format) => {
            return this.app.formatLocalizedDateTime(new Date(), format === 'false' ? false : true);
        });
        
        return processed;
    }

    loadDefaultTemplates() {
        // Use placeholders that will be processed when template is used
        const tc = (key, params) => {
            if (params && Object.keys(params).length > 0) {
                const paramStr = Object.entries(params).map(([k, v]) => `${k}:${v}`).join(':');
                return `{{tc:${key}:${paramStr}}}`;
            }
            return `{{tc:${key}}}`;
        };
        const t = (key) => `{{t:${key}}}`;
        
        this.templates = [
            {
                id: 'blank',
                nameKey: 'templates.blankNote',
                descriptionKey: 'templates.blankNoteDescription',
                icon: '📝',
                content: '',
                isDefault: true
            },
            {
                id: 'meeting-notes',
                nameKey: 'templates.meetingNotes',
                descriptionKey: 'templates.meetingNotesDescription',
                icon: '📋',
                content: `# ${t('templates.meetingNotes')}

**${tc('date')}** {{date:false}}
**${tc('attendees')}** 

## ${tc('agenda')}
- 

## ${tc('discussionPoints')}
- 

## ${tc('actionItems')}
- [ ] 

## ${tc('nextMeeting')}
`,
                isDefault: true
            },
            {
                id: 'daily-journal',
                nameKey: 'templates.dailyJournal',
                descriptionKey: 'templates.dailyJournalDescription',
                icon: '📓',
                content: `# ${tc('dailyJournal')} {{date:false}}

## ${tc('mood')}
😊 / 😐 / 😔

## ${tc('todaysGoals')}
- [ ] 
- [ ] 
- [ ] 

## ${tc('whatHappened')}


## ${tc('gratefulFor')}
1. 
2. 
3. 

## ${tc('tomorrowsFocus')}
`,
                isDefault: true
            },
            {
                id: 'project-plan',
                nameKey: 'templates.projectPlan',
                descriptionKey: 'templates.projectPlanDescription',
                icon: '🎯',
                content: `# ${t('templates.projectPlan')}

## ${tc('overview')}
**${tc('projectName')}** 
**${tc('startDate')}** {{date:false}}
**${tc('status')}** ${tc('planning')}

## ${tc('objectives')}
- 

## ${tc('milestones')}
1. [ ] 
2. [ ] 
3. [ ] 

## ${tc('resourcesNeeded')}
- 

## ${tc('timeline')}
- ${tc('week', { number: 1 })} 
- ${tc('week', { number: 2 })} 
- ${tc('week', { number: 3 })} 

## ${tc('risksAndMitigation')}
- 

## ${tc('successCriteria')}
- 
`,
                isDefault: true
            },
            {
                id: 'book-notes',
                nameKey: 'templates.bookNotes',
                descriptionKey: 'templates.bookNotesDescription',
                icon: '📚',
                content: `# ${t('templates.bookNotes')}

**${tc('title')}** 
**${tc('author')}** 
**${tc('dateRead')}** {{date}}
**${tc('rating')}** ⭐⭐⭐⭐⭐

## ${tc('summary')}
${tc('briefOverview')}

## ${tc('keyTakeaways')}
1. 
2. 
3. 

## ${tc('favoriteQuotes')}
> 

## ${tc('myThoughts')}
`,
                isDefault: true
            },
            {
                id: 'research-notes',
                nameKey: 'templates.researchNotes',
                descriptionKey: 'templates.researchNotesDescription',
                icon: '🔬',
                content: `# ${t('templates.researchNotes')}

**${tc('topic')}** 
**${tc('date')}** {{date:false}}
**${tc('source')}** 

## ${tc('researchQuestion')}


## ${tc('keyFindings')}
- 

## ${tc('dataEvidence')}


## ${tc('analysis')}


## ${tc('references')}
1. 
`,
                isDefault: true
            },
            {
                id: 'todo-list',
                nameKey: 'templates.todoList',
                descriptionKey: 'templates.todoListDescription',
                icon: '✅',
                content: `# ${tc('todoList')} ${this.app.formatLocalizedDateTime(new Date(), false)}

## ${tc('highPriority')}
- [ ] 
- [ ] 

## ${tc('mediumPriority')}
- [ ] 
- [ ] 

## ${tc('lowPriority')}
- [ ] 
- [ ] 

## ${tc('completedToday')}
- [x] 
`,
                isDefault: true
            },
            {
                id: 'brainstorm',
                nameKey: 'templates.brainstorm',
                descriptionKey: 'templates.brainstormDescription',
                icon: '💡',
                content: `# ${tc('brainstormingSession')}

**${tc('topic')}** 
**${tc('date')}** {{date:false}}

## ${tc('ideas')}
1. 
2. 
3. 
4. 
5. 

## ${tc('bestIdeas')}
⭐ 

## ${tc('nextSteps')}
- [ ] 
`,
                isDefault: true
            },
            {
                id: 'recipe',
                nameKey: 'templates.recipe',
                descriptionKey: 'templates.recipeDescription',
                icon: '🍳',
                content: `# ${tc('recipe')} 

**${tc('prepTime')}** 
**${tc('cookTime')}** 
**${tc('servings')}** 
**${tc('difficulty')}** ${tc('difficultyOptions')}

## ${tc('ingredients')}
- 
- 
- 

## ${tc('instructions')}
1. 
2. 
3. 

## ${tc('notes')}
`,
                isDefault: true
            },
            {
                id: 'code-snippet',
                nameKey: 'templates.codeSnippet',
                descriptionKey: 'templates.codeSnippetDescription',
                icon: '💻',
                content: `# ${t('templates.codeSnippet')}

**${tc('language')}** 
**${tc('purpose')}** 
**${tc('date')}** {{date:false}}

## ${tc('code')}
\`\`\`javascript
// ${tc('yourCodeHere')}
\`\`\`

## ${tc('description')}


## ${tc('usage')}
\`\`\`javascript
// ${tc('exampleUsage')}
\`\`\`

## ${tc('notes')}
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
        
        // Translate template name and description for default templates
        const templateName = this.getTemplateName(template);
        const templateDescription = this.getTemplateDescription(template);
        
        const deleteBtn = !template.isDefault 
            ? `<button class="template-delete-btn" title="Delete template"><i class="fas fa-trash"></i></button>`
            : '';
        
        card.innerHTML = `
            ${deleteBtn}
            <div class="template-card-icon">${template.icon}</div>
            <div class="template-card-title">${templateName}</div>
            <div class="template-card-description">${templateDescription}</div>
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
        const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
        const templateName = this.getTemplateName(template);
        console.log('[Templates] Using template:', templateName);

        try {
            // Create a new note with the template content
            if (this.app.createNewNote) {
                await this.app.createNewNote();
                
                // Set the template content (process translations)
                const editor = document.getElementById('note-editor');
                if (editor && this.app.currentNote) {
                    const processedContent = this.processTemplateContent(template.content);
                    editor.value = processedContent;
                    
                    // Update the note in database
                    const db = this.app.notesManager?.db;
                    if (db && db.initialized) {
                        db.updateNote(this.app.currentNote.id, {
                            content: processedContent,
                            preview: this.generatePreview(processedContent)
                        });
                    }
                    
                    // Update the current note object to reflect the template content
                    if (this.app.currentNote) {
                        this.app.currentNote.content = processedContent;
                        this.app.currentNote.preview = this.generatePreview(processedContent);
                    }
                    
                    // Trigger input event to update UI (word count, unsaved indicator, etc.)
                    this.app._ignoreNextInputForUnsaved = true;
                    const inputEvent = new Event('input', { bubbles: true });
                    editor.dispatchEvent(inputEvent);
                    
                    // Update preview if in preview mode
                    if (this.app.previewMode === 'preview' || this.app.previewMode === 'split') {
                        this.app.renderMarkdownPreview?.();
                    }
                }
            }

            this.close();
            this.app.showNotification?.(t('templates.templateApplied', { name: templateName }), 'success');

        } catch (error) {
            console.error('[Templates] Failed to apply template:', error);
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.app.showNotification?.(t('templates.failedToApplyTemplate'), 'error');
        }
    }

    generatePreview(content) {
        return content.substring(0, 200).replace(/#/g, '').trim();
    }

    async generateAITemplate() {
        console.log('[Templates] generateAITemplate called');

        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        
        // Check if AI manager exists and is initialized
        if (!this.app.aiManager) {
            console.error('[Templates] AI manager not found');
            this.app.showNotification?.(t('templates.aiNotAvailable'), 'error');
            return;
        }

        // Check if AI is connected
        if (!this.app.aiManager.isConnected) {
            console.error('[Templates] AI manager not connected');
            this.app.showNotification?.(t('templates.aiNotConnected'), 'error');
            return;
        }

        console.log('[Templates] AI manager available and connected');
        // Show AI template generation dialog
        this.showAITemplateDialog();
    }

    showAITemplateDialog() {
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        const dialogHTML = `
            <div id="ai-template-dialog-overlay" class="modal">
                <div class="modal-content" style="max-width: 600px; background: var(--modal-bg, rgba(255, 255, 255, 0.95)); color: var(--text-primary);">
                    <div class="modal-header" style="border-bottom: 1px solid var(--border-color);">
                        <h3 style="color: var(--text-primary);"><i class="fas fa-robot"></i> ${t('templates.generateAITemplate')}</h3>
                        <button id="ai-template-dialog-close" class="modal-close" style="color: var(--text-secondary);" title="${t('modals.close')}"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body" style="color: var(--text-primary);">
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label for="ai-template-description" style="display: block; margin-bottom: 8px; font-weight: 500;">
                                ${t('templates.describeTemplate')}
                            </label>
                            <textarea 
                                id="ai-template-description" 
                                placeholder="${t('templates.templateDescriptionPlaceholder')}"
                                style="width: 100%; min-height: 120px; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); font-family: inherit; resize: vertical;"
                            ></textarea>
                        </div>
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 12px; font-weight: 500;">${t('templates.templateTypeOptional')}</label>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;">
                                <button class="ai-template-suggestion" data-type="Meeting Notes">📋 ${t('templates.meetingNotes')}</button>
                                <button class="ai-template-suggestion" data-type="Project Plan">🎯 ${t('templates.projectPlan')}</button>
                                <button class="ai-template-suggestion" data-type="Bug Report">🐛 ${t('templates.bugReport')}</button>
                                <button class="ai-template-suggestion" data-type="Weekly Review">📊 ${t('templates.weeklyReview')}</button>
                                <button class="ai-template-suggestion" data-type="Research Notes">🔬 ${t('templates.researchNotes')}</button>
                                <button class="ai-template-suggestion" data-type="Recipe">🍳 ${t('templates.recipe')}</button>
                            </div>
                        </div>
                        <div id="ai-template-preview-section" class="hidden" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; font-weight: 500; color: var(--text-primary);">${t('templates.generatedTemplatePreview')}</label>
                            <div id="ai-template-preview" style="max-height: 300px; overflow-y: auto; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; font-family: 'Courier New', monospace; font-size: 13px; white-space: pre-wrap; color: var(--text-primary);"></div>
                        </div>
                        <div id="ai-template-loading" class="hidden" style="text-align: center; padding: 20px;">
                            <div class="loading-spinner" style="margin: 0 auto 12px;"></div>
                            <p style="color: var(--text-secondary);">${t('templates.generatingTemplate')}</p>
                        </div>
                        <div class="ai-dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button id="ai-template-cancel" class="btn-secondary">${t('modals.cancel')}</button>
                            <button id="ai-template-generate" class="btn-primary"><i class="fas fa-magic"></i> ${t('templates.generate')}</button>
                            <button id="ai-template-save" class="btn-primary hidden"><i class="fas fa-save"></i> ${t('templates.saveAsTemplate')}</button>
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
                const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
                descInput.value = t('templates.templateSuggestionDescription', { type: type.toLowerCase() });
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
                generateBtn.textContent = t('templates.regenerate');

            } catch (error) {
                console.error('[Templates] Failed to generate AI template:', error);

                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                
                // Provide more specific error messages
                let errorMessage = t('templates.failedToGenerateTemplate');
                if (error.message.includes('Connection timeout') || error.message.includes('not available')) {
                    errorMessage += t('templates.checkAIServiceConnection');
                } else if (error.message.includes('API key')) {
                    errorMessage += t('templates.checkAIAPIKey');
                } else {
                    errorMessage += t('templates.tryAgainOrCheckConsole');
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
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        // Try to extract a name from the content if AI-generated
        let suggestedName = '';
        let suggestedDescription = '';
        let suggestedIcon = '📝';
        
        if (isAIGenerated && content) {
            // Try to extract from first heading
            const firstHeading = content.match(/^#\s+(.+)$/m);
            if (firstHeading) {
                suggestedName = firstHeading[1].trim();
                const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
                suggestedDescription = t('templates.aiGeneratedTemplateFor', { name: suggestedName.toLowerCase() });
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
                        <h3 style="color: var(--text-primary);">${isAIGenerated ? '<i class="fas fa-robot"></i> ' : ''}${t('templates.saveCustomTemplate')}</h3>
                        <button id="template-creator-close" class="modal-close" style="color: var(--text-secondary);" title="${t('modals.close')}"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body" style="color: var(--text-primary);">
                        ${!content ? `<div class="template-creator-warning" style="padding: 12px; background: var(--warning-bg, #fff3cd); border: 1px solid var(--warning-border, #ffc107); border-radius: 6px; margin-bottom: 16px; color: var(--warning-text, #856404);"><i class="fas fa-exclamation-triangle"></i> ${t('templates.noContentWarning')}</div>` : ''}
                        ${isAIGenerated ? `<div class="template-creator-info" style="padding: 12px; background: var(--accent-bg, #e3f2fd); border: 1px solid var(--accent-border, #2196F3); border-radius: 6px; margin-bottom: 16px; color: var(--accent-text, #1565c0);"><i class="fas fa-magic"></i> ${t('templates.aiGeneratedInfo')}</div>` : ''}
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label for="template-name-input" style="display: block; margin-bottom: 8px; font-weight: 500;">${t('templates.templateName')}</label>
                            <input type="text" id="template-name-input" class="ai-dialog-input" placeholder="${t('templates.templateNamePlaceholder')}" value="${suggestedName}" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);" required>
                        </div>
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label for="template-description-input" style="display: block; margin-bottom: 8px; font-weight: 500;">${t('templates.description')}</label>
                            <input type="text" id="template-description-input" class="ai-dialog-input" placeholder="${t('templates.descriptionPlaceholder')}" value="${suggestedDescription}" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);" required>
                        </div>
                        <div class="form-group" style="margin-bottom: 16px;">
                            <label for="template-icon-input" style="display: block; margin-bottom: 8px; font-weight: 500;">${t('templates.icon')}</label>
                            <input type="text" id="template-icon-input" class="ai-dialog-input" placeholder="📝" value="${suggestedIcon}" maxlength="2" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);">
                        </div>
                        <div class="ai-dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
                            <button id="template-creator-cancel" class="btn-secondary">${t('modals.cancel')}</button>
                            <button id="template-creator-create" class="btn-primary">${t('templates.saveTemplate')}</button>
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
            
            const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
            this.app.showNotification?.(t('templates.templateCreated', { name }), 'success');
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
        const t = (key, params) => window.i18n ? window.i18n.t(key, params) : key;
        
        // Create confirmation dialog
        const dialogHTML = `
            <div id="template-delete-confirm-overlay" class="modal">
                <div class="modal-content" style="max-width: 400px; background: var(--modal-bg, rgba(255, 255, 255, 0.95)); color: var(--text-primary);">
                    <div class="modal-header" style="border-bottom: 1px solid var(--border-color);">
                        <h3 style="color: var(--text-primary);">${t('templates.deleteTemplate')}</h3>
                        <button id="template-delete-confirm-close" class="modal-close" style="color: var(--text-secondary);" title="${t('modals.close')}"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body" style="color: var(--text-primary);">
                        <p style="margin-bottom: 20px;">${t('templates.deleteTemplateConfirm', { name: template.name })}</p>
                        <p style="color: var(--text-secondary); font-size: 14px;">${t('templates.cannotBeUndone')}</p>
                        <div class="ai-dialog-actions" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                            <button id="template-delete-cancel" class="btn-secondary">${t('modals.cancel')}</button>
                            <button id="template-delete-confirm" class="btn-primary" style="background: var(--error-color, #f44336);">${t('modals.delete')}</button>
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
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            this.app.showNotification?.(t('templates.templateDeleted'), 'success');
            
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
