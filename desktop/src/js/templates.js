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
        return template.nameKey ? t(template.nameKey) : (template.name || '');
    }

    // Helper function to get translated template description
    getTemplateDescription(template) {
        return template.descriptionKey ? t(template.descriptionKey) : (template.description || '');
    }



    // Helper function to process template content and apply translations
    processTemplateContent(content) {
        if (!content || typeof content !== 'string') return content;

        const tc = (key, params) => t(`templates.templateContent.${key}`, params);

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
        const tpl = (key) => `{{t:${key}}}`;

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
                content: `# ${tpl('templates.meetingNotes')}

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
                content: `# ${tpl('templates.projectPlan')}

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
                content: `# ${tpl('templates.bookNotes')}

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
                content: `# ${tpl('templates.researchNotes')}

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
                content: `# ${tpl('templates.codeSnippet')}

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

        // Delete button (if not default)
        if (!template.isDefault) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'template-delete-btn';
            deleteBtn.title = t('templates.deleteTemplate', 'Delete template');

            const icon = document.createElement('i');
            icon.className = 'fas fa-trash';
            deleteBtn.appendChild(icon);

            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(t('templates.confirmDelete'))) {
                    this.deleteCustomTemplate(template.id);
                }
            });
            card.appendChild(deleteBtn);
        }

        const iconDiv = document.createElement('div');
        iconDiv.className = 'template-card-icon';
        iconDiv.textContent = template.icon;
        card.appendChild(iconDiv);

        const titleDiv = document.createElement('div');
        titleDiv.className = 'template-card-title';
        titleDiv.textContent = templateName;
        card.appendChild(titleDiv);

        const descDiv = document.createElement('div');
        descDiv.className = 'template-card-description';
        descDiv.textContent = templateDescription;
        card.appendChild(descDiv);

        card.addEventListener('click', () => {
            this.useTemplate(template);
            this.close();
        });

        return card;
    }

    async useTemplate(template) {
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
            this.app.showNotification?.(t('templates.failedToApplyTemplate'), 'error');
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

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'ai-template-dialog-overlay';
        overlay.className = 'modal';

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        Object.assign(modalContent.style, {
            maxWidth: '600px',
            background: 'var(--modal-bg, rgba(255, 255, 255, 0.95))',
            color: 'var(--text-primary)'
        });

        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.style.borderBottom = '1px solid var(--border-color)';

        const h3 = document.createElement('h3');
        h3.style.color = 'var(--text-primary)';

        const icon = document.createElement('i');
        icon.className = 'fas fa-robot';
        h3.appendChild(icon);
        h3.appendChild(document.createTextNode(' ' + t('templates.generateAITemplate')));

        const closeBtn = document.createElement('button');
        closeBtn.id = 'ai-template-dialog-close';
        closeBtn.className = 'modal-close';
        closeBtn.style.color = 'var(--text-secondary)';
        closeBtn.title = t('modals.close');

        const closeIcon = document.createElement('i');
        closeIcon.className = 'fas fa-times';
        closeBtn.appendChild(closeIcon);

        header.appendChild(h3);
        header.appendChild(closeBtn);
        modalContent.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'modal-body';
        body.style.color = 'var(--text-primary)';

        // Input Group
        const inputGroup = document.createElement('div');
        inputGroup.className = 'form-group';
        inputGroup.style.marginBottom = '20px';

        const label = document.createElement('label');
        label.htmlFor = 'ai-template-description';
        label.style.display = 'block';
        label.style.marginBottom = '8px';
        label.style.fontWeight = '500';
        label.textContent = t('templates.describeTemplate');

        const descInput = document.createElement('textarea');
        descInput.id = 'ai-template-description';
        descInput.placeholder = t('templates.templateDescriptionPlaceholder');
        Object.assign(descInput.style, {
            width: '100%',
            minHeight: '120px',
            padding: '12px',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontFamily: 'inherit',
            resize: 'vertical'
        });

        inputGroup.appendChild(label);
        inputGroup.appendChild(descInput);
        body.appendChild(inputGroup);

        // Suggestions
        const suggestionsGroup = document.createElement('div');
        suggestionsGroup.className = 'form-group';
        suggestionsGroup.style.marginBottom = '20px';

        const suggestionsLabel = document.createElement('label');
        suggestionsLabel.style.display = 'block';
        suggestionsLabel.style.marginBottom = '12px';
        suggestionsLabel.style.fontWeight = '500';
        suggestionsLabel.textContent = t('templates.templateTypeOptional');

        const suggestionsContainer = document.createElement('div');
        Object.assign(suggestionsContainer.style, {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: '8px'
        });

        const suggestions = [
            { type: 'Meeting Notes', label: `📋 ${t('templates.meetingNotes')}` },
            { type: 'Project Plan', label: `🎯 ${t('templates.projectPlan')}` },
            { type: 'Bug Report', label: `🐛 ${t('templates.bugReport')}` },
            { type: 'Weekly Review', label: `📊 ${t('templates.weeklyReview')}` },
            { type: 'Research Notes', label: `🔬 ${t('templates.researchNotes')}` },
            { type: 'Recipe', label: `🍳 ${t('templates.recipe')}` }
        ];

        suggestions.forEach(s => {
            const btn = document.createElement('button');
            btn.className = 'ai-template-suggestion';
            btn.setAttribute('data-type', s.type);
            btn.textContent = s.label;

            // Styles
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

            suggestionsContainer.appendChild(btn);
        });

        suggestionsGroup.appendChild(suggestionsLabel);
        suggestionsGroup.appendChild(suggestionsContainer);
        body.appendChild(suggestionsGroup);

        // Preview Section (Hidden)
        const previewSection = document.createElement('div');
        previewSection.id = 'ai-template-preview-section';
        previewSection.className = 'hidden';
        previewSection.style.marginBottom = '20px';

        const previewLabel = document.createElement('label');
        previewLabel.style.display = 'block';
        previewLabel.style.marginBottom = '8px';
        previewLabel.style.fontWeight = '500';
        previewLabel.style.color = 'var(--text-primary)';
        previewLabel.textContent = t('templates.generatedTemplatePreview');

        const previewDiv = document.createElement('div');
        previewDiv.id = 'ai-template-preview';
        Object.assign(previewDiv.style, {
            maxHeight: '300px',
            overflowY: 'auto',
            padding: '12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            fontFamily: "'Courier New', monospace",
            fontSize: '13px',
            whiteSpace: 'pre-wrap',
            color: 'var(--text-primary)'
        });

        previewSection.appendChild(previewLabel);
        previewSection.appendChild(previewDiv);
        body.appendChild(previewSection);

        // Loading Section (Hidden)
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'ai-template-loading';
        loadingDiv.className = 'hidden';
        Object.assign(loadingDiv.style, {
            textAlign: 'center',
            padding: '20px'
        });

        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        spinner.style.margin = '0 auto 12px';

        const loadingText = document.createElement('p');
        loadingText.style.color = 'var(--text-secondary)';
        loadingText.textContent = t('templates.generatingTemplate');

        loadingDiv.appendChild(spinner);
        loadingDiv.appendChild(loadingText);
        body.appendChild(loadingDiv);

        // Actions
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'ai-dialog-actions';
        Object.assign(actionsDiv.style, {
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'ai-template-cancel';
        cancelBtn.className = 'btn-secondary';
        cancelBtn.textContent = t('modals.cancel');

        const generateBtn = document.createElement('button');
        generateBtn.id = 'ai-template-generate';
        generateBtn.className = 'btn-primary';

        const genIcon = document.createElement('i');
        genIcon.className = 'fas fa-magic';
        generateBtn.appendChild(genIcon);
        generateBtn.appendChild(document.createTextNode(' ' + t('templates.generate')));

        const saveBtn = document.createElement('button');
        saveBtn.id = 'ai-template-save';
        saveBtn.className = 'btn-primary hidden';
        const saveIcon = document.createElement('i');
        saveIcon.className = 'fas fa-save';
        saveBtn.appendChild(saveIcon);
        saveBtn.appendChild(document.createTextNode(' ' + t('templates.saveAsTemplate')));

        actionsDiv.appendChild(cancelBtn);
        actionsDiv.appendChild(generateBtn);
        actionsDiv.appendChild(saveBtn);
        body.appendChild(actionsDiv);

        modalContent.appendChild(body);
        overlay.appendChild(modalContent);
        document.body.appendChild(overlay);

        let generatedContent = '';

        // Focus description input
        setTimeout(() => descInput.focus(), 100);

        // Close handlers
        const closeDialog = () => {
            overlay.remove();
        };

        closeBtn.addEventListener('click', closeDialog);
        cancelBtn.addEventListener('click', closeDialog);

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
                generateBtn.innerHTML = '';
                generateBtn.textContent = t('templates.regenerate');

            } catch (error) {
                console.error('[Templates] Failed to generate AI template:', error);

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
        // Try to extract a name from the content if AI-generated
        let suggestedName = '';
        let suggestedDescription = '';
        let suggestedIcon = '📝';

        if (isAIGenerated && content) {
            // Try to extract from first heading
            const firstHeading = content.match(/^#\s+(.+)$/m);
            if (firstHeading) {
                suggestedName = firstHeading[1].trim();
                suggestedDescription = t('templates.aiGeneratedTemplateFor', { name: suggestedName.toLowerCase() });
            }

            // Try to detect icon from content
            const emojiMatch = content.match(/[\u{1F300}-\u{1F9FF}]/u);
            if (emojiMatch) {
                suggestedIcon = emojiMatch[0];
            }
        }

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'template-creator-overlay';
        overlay.className = 'modal';

        // Create content
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        Object.assign(modalContent.style, {
            maxWidth: '500px',
            background: 'var(--modal-bg, rgba(255, 255, 255, 0.95))',
            color: 'var(--text-primary)'
        });

        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.style.borderBottom = '1px solid var(--border-color)';

        const h3 = document.createElement('h3');
        h3.style.color = 'var(--text-primary)';

        if (isAIGenerated) {
            const icon = document.createElement('i');
            icon.className = 'fas fa-robot';
            h3.appendChild(icon);
            h3.appendChild(document.createTextNode(' '));
        }
        h3.appendChild(document.createTextNode(t('templates.saveCustomTemplate')));

        const closeBtn = document.createElement('button');
        closeBtn.id = 'template-creator-close';
        closeBtn.className = 'modal-close';
        closeBtn.style.color = 'var(--text-secondary)';
        closeBtn.title = t('modals.close');

        const closeIcon = document.createElement('i');
        closeIcon.className = 'fas fa-times';
        closeBtn.appendChild(closeIcon);

        header.appendChild(h3);
        header.appendChild(closeBtn);
        modalContent.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'modal-body';
        body.style.color = 'var(--text-primary)';

        // Warnings/Info
        if (!content) {
            const warning = document.createElement('div');
            warning.className = 'template-creator-warning';
            Object.assign(warning.style, {
                padding: '12px',
                background: 'var(--warning-bg, #fff3cd)',
                border: '1px solid var(--warning-border, #ffc107)',
                borderRadius: '6px',
                marginBottom: '16px',
                color: 'var(--warning-text, #856404)'
            });
            const warnIcon = document.createElement('i');
            warnIcon.className = 'fas fa-exclamation-triangle';
            warning.appendChild(warnIcon);
            warning.appendChild(document.createTextNode(' ' + t('templates.noContentWarning')));
            body.appendChild(warning);
        }

        if (isAIGenerated) {
            const info = document.createElement('div');
            info.className = 'template-creator-info';
            Object.assign(info.style, {
                padding: '12px',
                background: 'var(--accent-bg, #e3f2fd)',
                border: '1px solid var(--accent-border, #2196F3)',
                borderRadius: '6px',
                marginBottom: '16px',
                color: 'var(--accent-text, #1565c0)'
            });
            const infoIcon = document.createElement('i');
            infoIcon.className = 'fas fa-magic';
            info.appendChild(infoIcon);
            info.appendChild(document.createTextNode(' ' + t('templates.aiGeneratedInfo')));
            body.appendChild(info);
        }

        // Inputs
        const createInputGroup = (labelText, id, placeholder, value, isIcon = false) => {
            const group = document.createElement('div');
            group.className = 'form-group';
            group.style.marginBottom = '16px';

            const label = document.createElement('label');
            label.htmlFor = id;
            label.style.display = 'block';
            label.style.marginBottom = '8px';
            label.style.fontWeight = '500';
            label.textContent = labelText;

            const input = document.createElement('input');
            input.type = 'text';
            input.id = id;
            input.className = 'ai-dialog-input';
            input.placeholder = placeholder;
            input.value = value;
            if (isIcon) input.maxLength = 2;
            if (!isIcon) input.required = true;

            Object.assign(input.style, {
                width: '100%',
                padding: '10px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)'
            });

            group.appendChild(label);
            group.appendChild(input);
            return group;
        };

        const nameGroup = createInputGroup(t('templates.templateName'), 'template-name-input', t('templates.templateNamePlaceholder'), suggestedName);
        body.appendChild(nameGroup);

        const descGroup = createInputGroup(t('templates.description'), 'template-description-input', t('templates.descriptionPlaceholder'), suggestedDescription);
        body.appendChild(descGroup);

        const iconGroup = createInputGroup(t('templates.icon'), 'template-icon-input', '📝', suggestedIcon, true);
        body.appendChild(iconGroup);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'ai-dialog-actions';
        Object.assign(actions.style, {
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'template-creator-cancel';
        cancelBtn.className = 'btn-secondary';
        cancelBtn.textContent = t('modals.cancel');

        const createBtn = document.createElement('button');
        createBtn.id = 'template-creator-create';
        createBtn.className = 'btn-primary';
        createBtn.textContent = t('templates.saveTemplate');

        actions.appendChild(cancelBtn);
        actions.appendChild(createBtn);
        body.appendChild(actions);

        modalContent.appendChild(body);
        overlay.appendChild(modalContent);
        document.body.appendChild(overlay);

        const nameInput = overlay.querySelector('#template-name-input');
        const descInput = overlay.querySelector('#template-description-input');
        const iconInput = overlay.querySelector('#template-icon-input');

        // Focus name input
        setTimeout(() => nameInput.focus(), 100);

        // Close handlers
        const closeDialog = () => {
            overlay.remove();
        };

        closeBtn.addEventListener('click', closeDialog);
        cancelBtn.addEventListener('click', closeDialog);

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

        createBtn.addEventListener('click', createTemplate);

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

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'template-delete-confirm-overlay';
        overlay.className = 'modal';

        // Create content
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        Object.assign(modalContent.style, {
            maxWidth: '400px',
            background: 'var(--modal-bg, rgba(255, 255, 255, 0.95))',
            color: 'var(--text-primary)'
        });

        // Header
        const header = document.createElement('div');
        header.className = 'modal-header';
        header.style.borderBottom = '1px solid var(--border-color)';

        const h3 = document.createElement('h3');
        h3.style.color = 'var(--text-primary)';
        h3.textContent = t('templates.deleteTemplate');

        const closeBtn = document.createElement('button');
        closeBtn.id = 'template-delete-confirm-close';
        closeBtn.className = 'modal-close';
        closeBtn.style.color = 'var(--text-secondary)';
        closeBtn.title = t('modals.close');

        const closeIcon = document.createElement('i');
        closeIcon.className = 'fas fa-times';
        closeBtn.appendChild(closeIcon);

        header.appendChild(h3);
        header.appendChild(closeBtn);
        modalContent.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'modal-body';
        body.style.color = 'var(--text-primary)';

        const p1 = document.createElement('p');
        p1.style.marginBottom = '20px';
        p1.textContent = t('templates.deleteTemplateConfirm', { name: template.name });
        body.appendChild(p1);

        const p2 = document.createElement('p');
        p2.style.color = 'var(--text-secondary)';
        p2.style.fontSize = '14px';
        p2.textContent = t('templates.cannotBeUndone');
        body.appendChild(p2);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'ai-dialog-actions';
        Object.assign(actions.style, {
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            marginTop: '24px'
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'template-delete-cancel';
        cancelBtn.className = 'btn-secondary';
        cancelBtn.textContent = t('modals.cancel');

        const confirmBtn = document.createElement('button');
        confirmBtn.id = 'template-delete-confirm';
        confirmBtn.className = 'btn-primary';
        confirmBtn.style.background = 'var(--error-color, #f44336)';
        confirmBtn.textContent = t('modals.delete');

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);
        body.appendChild(actions);

        modalContent.appendChild(body);
        overlay.appendChild(modalContent);
        document.body.appendChild(overlay);

        // Close handlers
        const closeDialog = () => {
            overlay.remove();
        };

        closeBtn.addEventListener('click', closeDialog);
        cancelBtn.addEventListener('click', closeDialog);

        // Delete handler
        confirmBtn.addEventListener('click', async () => {
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
