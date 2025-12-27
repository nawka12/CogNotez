/**
 * AI Settings Module
 * Handles the AI settings dialog for CogNotez
 */
const { ipcRenderer } = require('electron');

/**
 * Shows the AI settings modal dialog
 * @param {Object} app - The CogNotezApp instance
 */
function showAISettings(app) {
    if (!app.aiManager) {
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        const msg = t('notifications.aiNotAvailable');
        app.showNotification(msg, 'error');
        return;
    }

    const t = (key, fallback, params = {}) => window.i18n ? window.i18n.t(key, params) : fallback;

    const backendStatus = app.aiManager.backend === 'ollama'
        ? (app.aiManager.isConnected
            ? t('settings.ai.ollamaStatusReady', 'Ollama is running and ready')
            : t('settings.ai.ollamaStatusNotAvailable', 'Ollama is not available. Please start Ollama service.'))
        : (app.aiManager.isConnected
            ? t('settings.ai.openRouterStatusValid', 'OpenRouter API key is valid')
            : t('settings.ai.openRouterStatusInvalid', 'OpenRouter API key is invalid or missing.'));

    const content = `
        <div style="max-width: 600px;">
            <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 12px 0; color: var(--text-primary);"><i class="fas fa-robot"></i> ${t('settings.ai.configurationTitle', 'AI Configuration')}</h4>
                <div style="background: var(--context-menu-bg); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${app.aiManager.isConnected ? '#28a745' : '#dc3545'};"></div>
                        <span style="font-weight: 500;">${t('settings.ai.statusLabel', 'Status')}: ${app.aiManager.isConnected ? t('settings.ai.statusConnected', 'Connected') : t('settings.ai.statusDisconnected', 'Disconnected')}</span>
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary);">
                        ${backendStatus}
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 20px;">
                <label for="ai-backend" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.backendLabel', 'AI Backend')}:</label>
                <select id="ai-backend" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                    <option value="ollama" ${app.aiManager.backend === 'ollama' ? 'selected' : ''}>${t('settings.ai.backendOllama', 'Ollama (Local)')}</option>
                    <option value="openrouter" ${app.aiManager.backend === 'openrouter' ? 'selected' : ''}>${t('settings.ai.backendOpenRouter', 'OpenRouter (Cloud)')}</option>
                </select>
            </div>

            <div id="ollama-settings" style="display: ${app.aiManager.backend === 'ollama' ? 'block' : 'none'};">
                <div style="margin-bottom: 20px;">
                    <label for="ollama-endpoint" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.ollamaEndpoint', 'Ollama Endpoint')}:</label>
                    <input type="text" id="ollama-endpoint" value="${app.aiManager.ollamaEndpoint}"
                           style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary); font-family: monospace; font-size: 13px;">
                </div>

                <div style="margin-bottom: 20px;">
                    <label for="ollama-model" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.ollamaModel', 'Ollama Model')}:</label>
                    <select id="ollama-model" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                        ${app.aiManager.availableModels && app.aiManager.backend === 'ollama' ? app.aiManager.availableModels.map(model =>
        `<option value="${model.name}" ${model.name === app.aiManager.ollamaModel ? 'selected' : ''}>${model.name}</option>`
    ).join('') : `<option value="${app.aiManager.ollamaModel}" selected>${app.aiManager.ollamaModel}</option>`}
                    </select>
                </div>
            </div>

            <div id="openrouter-settings" style="display: ${app.aiManager.backend === 'openrouter' ? 'block' : 'none'};">
                <div style="margin-bottom: 20px;">
                    <label for="openrouter-api-key" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.openRouterApiKey', 'OpenRouter API Key')}:</label>
                    <input type="password" id="openrouter-api-key" value="${app.aiManager.openRouterApiKey}"
                           style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary); font-family: monospace; font-size: 13px;"
                           placeholder="sk-or-v1-...">
                </div>

                <div style="margin-bottom: 20px;">
                    <label for="openrouter-model-search" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.openRouterModel', 'OpenRouter Model')}:</label>
                    <div id="openrouter-model-container" style="position: relative;">
                        <input type="text" id="openrouter-model-search" 
                               placeholder="${t('settings.ai.searchModels', 'Search models...')}" 
                               value="${app.aiManager.availableModels && app.aiManager.backend === 'openrouter' ? (app.aiManager.availableModels.find(m => m.id === app.aiManager.openRouterModel)?.name || app.aiManager.openRouterModel) : app.aiManager.openRouterModel}"
                               style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary); padding-right: 30px; box-sizing: border-box;">
                        <input type="hidden" id="openrouter-model" value="${app.aiManager.openRouterModel}">
                        <div id="openrouter-model-dropdown" style="display: none; position: absolute; top: 100%; left: 0; right: 0; max-height: 300px; overflow-y: auto; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 4px; margin-top: 4px; z-index: 1000; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);">
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-weight: 500;">
                        <input type="checkbox" id="searxng-enabled" ${app.aiManager.searxngEnabled ? 'checked' : ''}>
                        ${t('settings.ai.enableSearxng', 'Enable SearXNG Web Search')}
                    </label>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                        ${t('settings.ai.searxngDescription', 'Give the AI access to web search for current information using your SearXNG instance.')}
                    </div>
                </div>

                <div id="searxng-options" style="display: ${app.aiManager.searxngEnabled ? 'block' : 'none'}; margin-left: 20px;">
                    <div style="margin-bottom: 15px;">
                        <label for="searxng-url" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.searxngUrl', 'SearXNG URL')}:</label>
                        <input type="text" id="searxng-url" value="${app.aiManager.searxngUrl}"
                               style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary); font-family: monospace; font-size: 13px;"
                               placeholder="http://localhost:8080">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label for="searxng-max-results" style="display: block; margin-bottom: 6px; font-weight: 500;">${t('settings.ai.searxngMaxResults', 'Max Search Results')}:</label>
                        <select id="searxng-max-results" style="width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--input-bg); color: var(--text-primary);">
                            <option value="3" ${app.aiManager.searxngMaxResults === 3 ? 'selected' : ''}>${t('settings.ai.searxngResultsOption', '3 results', { count: 3 })}</option>
                            <option value="5" ${app.aiManager.searxngMaxResults === 5 ? 'selected' : ''}>${t('settings.ai.searxngResultsOption', '5 results', { count: 5 })}</option>
                            <option value="10" ${app.aiManager.searxngMaxResults === 10 ? 'selected' : ''}>${t('settings.ai.searxngResultsOption', '10 results', { count: 10 })}</option>
                        </select>
                    </div>
                </div>
            </div>

            <div style="background: var(--context-menu-bg); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4;">
                    <strong>${t('settings.ai.tips', '💡 Tips:')}</strong><br>
                    <div id="ollama-tips" style="display: ${app.aiManager.backend === 'ollama' ? 'block' : 'none'}">
                        • ${t('settings.ai.ollamaTipEndpoint', 'Default Ollama endpoint is usually')} <code>http://localhost:11434</code><br>
                        • ${t('settings.ai.ollamaTipPopularModels', 'Popular models: llama2, codellama, mistral')}<br>
                        • ${t('settings.ai.ollamaTipDownload', 'Use')} <code>ollama pull model_name</code> ${t('settings.ai.ollamaTipDownloadCommand', 'to download models')}<br>
                    </div>
                    <div id="openrouter-tips" style="display: ${app.aiManager.backend === 'openrouter' ? 'block' : 'none'}">
                        • ${t('settings.ai.openRouterTipGetKey', 'Get your API key from')} <a href="https://openrouter.ai/keys" target="_blank" style="color: var(--accent-color);">OpenRouter</a><br>
                        • ${t('settings.ai.openRouterTipPopularModels', 'Popular models: GPT-4, Claude, Gemini')}<br>
                        • ${t('settings.ai.openRouterTipKeyFormat', 'API key starts with')} <code>sk-or-v1-</code><br>
                        <div id="searxng-tip" style="display: ${app.aiManager.searxngEnabled ? 'block' : 'none'}">
                            • ${t('settings.ai.searxngTipPrivacy', 'SearXNG provides privacy-focused web search')}<br>
                            • ${t('settings.ai.searxngTipInstall', 'Install SearXNG:')} <code>pip install searxng</code><br>
                            ${app.aiManager.backend === 'ollama' ? `• <strong>${t('settings.ai.note', 'Note:')}</strong> ${t('settings.ai.ollamaToolCallingNote', 'Ollama tool calling may not work with all models. If you experience issues, try a different model or use OpenRouter.')}` : ''}
                        </div>
                    </div>
                    • ${t('settings.ai.tipRightClick', 'Right-click selected text for quick AI actions')}
                </div>
            </div>
        </div>
    `;

    const modal = app.createModal(t('settings.ai.title', 'AI Settings'), content, [
        { text: t('settings.ai.testConnection', 'Test Connection'), type: 'secondary', action: 'test-connection' },
        { text: t('settings.general.saveButton', 'Save Settings'), type: 'primary', action: 'save-settings' },
        { text: window.i18n ? window.i18n.t('modals.cancel') : 'Cancel', type: 'secondary', action: 'cancel' }
    ]);

    // Add backend switching handler
    const backendSelect = modal.querySelector('#ai-backend');
    const ollamaSettings = modal.querySelector('#ollama-settings');
    const openrouterSettings = modal.querySelector('#openrouter-settings');
    const ollamaTips = modal.querySelector('#ollama-tips');
    const openrouterTips = modal.querySelector('#openrouter-tips');

    backendSelect.addEventListener('change', (e) => {
        const selectedBackend = e.target.value;
        if (selectedBackend === 'ollama') {
            ollamaSettings.style.display = 'block';
            openrouterSettings.style.display = 'none';
            ollamaTips.style.display = 'block';
            openrouterTips.style.display = 'none';
        } else {
            ollamaSettings.style.display = 'none';
            openrouterSettings.style.display = 'block';
            ollamaTips.style.display = 'none';
            openrouterTips.style.display = 'block';
        }
    });

    // Add SearXNG toggle handler
    const searxngCheckbox = modal.querySelector('#searxng-enabled');
    const searxngOptions = modal.querySelector('#searxng-options');
    const searxngTip = modal.querySelector('#searxng-tip');

    searxngCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            searxngOptions.style.display = 'block';
            searxngTip.style.display = 'block';
        } else {
            searxngOptions.style.display = 'none';
            searxngTip.style.display = 'none';
        }
    });

    // Initialize searchable OpenRouter model dropdown
    if (app.aiManager.backend === 'openrouter' && app.aiManager.availableModels && app.aiManager.availableModels.length > 0) {
        const modelSearchInput = modal.querySelector('#openrouter-model-search');
        const modelDropdown = modal.querySelector('#openrouter-model-dropdown');
        const modelHiddenInput = modal.querySelector('#openrouter-model');
        const modelContainer = modal.querySelector('#openrouter-model-container');

        let filteredModels = [...app.aiManager.availableModels];

        // Function to render dropdown items
        const renderDropdown = (models) => {
            if (models.length === 0) {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                const noModelsText = t('settings.advanced.noModelsFound');
                modelDropdown.innerHTML = `<div style="padding: 12px; color: var(--text-secondary); text-align: center;">${noModelsText}</div>`;
                return;
            }

            modelDropdown.innerHTML = models.map(model => {
                const displayName = model.name || model.id;
                const isSelected = model.id === app.aiManager.openRouterModel;
                return `
                    <div class="model-dropdown-item" data-model-id="${model.id}" data-model-name="${displayName}" 
                         style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border-color); 
                                ${isSelected ? 'background: var(--accent-color); color: white;' : 'background: var(--bg-primary); color: var(--text-primary);'}
                                transition: background 0.2s;">
                        <div style="font-weight: ${isSelected ? '600' : '500'}; font-size: 14px;">${displayName}</div>
                        ${model.id !== displayName ? `<div style="font-size: 12px; opacity: 0.7; margin-top: 2px;">${model.id}</div>` : ''}
                    </div>
                `;
            }).join('');

            // Add click handlers
            modelDropdown.querySelectorAll('.model-dropdown-item').forEach(item => {
                item.addEventListener('click', () => {
                    const modelId = item.dataset.modelId;
                    const modelName = item.dataset.modelName;
                    modelHiddenInput.value = modelId;
                    modelSearchInput.value = modelName;
                    modelDropdown.style.display = 'none';

                    // Update selected state
                    modelDropdown.querySelectorAll('.model-dropdown-item').forEach(i => {
                        i.style.background = i.dataset.modelId === modelId ? 'var(--accent-color)' : 'var(--bg-primary)';
                        i.style.color = i.dataset.modelId === modelId ? 'white' : 'var(--text-primary)';
                    });
                });

                item.addEventListener('mouseenter', function () {
                    if (this.dataset.modelId !== modelHiddenInput.value) {
                        this.style.background = 'var(--bg-hover)';
                    }
                });

                item.addEventListener('mouseleave', function () {
                    if (this.dataset.modelId !== modelHiddenInput.value) {
                        this.style.background = 'var(--bg-primary)';
                    }
                });
            });
        };

        // Initial render
        renderDropdown(filteredModels);

        // Search functionality
        modelSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();

            if (searchTerm === '') {
                filteredModels = [...app.aiManager.availableModels];
            } else {
                filteredModels = app.aiManager.availableModels.filter(model => {
                    const name = (model.name || model.id).toLowerCase();
                    const id = model.id.toLowerCase();
                    return name.includes(searchTerm) || id.includes(searchTerm);
                });
            }

            renderDropdown(filteredModels);
            modelDropdown.style.display = filteredModels.length > 0 ? 'block' : 'none';
        });

        // Show dropdown on focus
        modelSearchInput.addEventListener('focus', () => {
            if (filteredModels.length > 0) {
                modelDropdown.style.display = 'block';
            }
        });

        // Hide dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!modelContainer.contains(e.target)) {
                modelDropdown.style.display = 'none';
            }
        });

        // Handle keyboard navigation
        let selectedIndex = -1;
        modelSearchInput.addEventListener('keydown', (e) => {
            const items = modelDropdown.querySelectorAll('.model-dropdown-item');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                // Reset previous selection
                if (selectedIndex >= 0 && items[selectedIndex]) {
                    const prevModelId = items[selectedIndex].dataset.modelId;
                    items[selectedIndex].style.background = prevModelId === modelHiddenInput.value ? 'var(--accent-color)' : 'var(--bg-primary)';
                }
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                if (items[selectedIndex]) {
                    items[selectedIndex].scrollIntoView({ block: 'nearest' });
                    items[selectedIndex].style.background = 'var(--bg-hover)';
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                // Reset previous selection
                if (selectedIndex >= 0 && items[selectedIndex]) {
                    const prevModelId = items[selectedIndex].dataset.modelId;
                    items[selectedIndex].style.background = prevModelId === modelHiddenInput.value ? 'var(--accent-color)' : 'var(--bg-primary)';
                }
                selectedIndex = Math.max(selectedIndex - 1, 0);
                if (items[selectedIndex]) {
                    items[selectedIndex].scrollIntoView({ block: 'nearest' });
                    items[selectedIndex].style.background = 'var(--bg-hover)';
                }
            } else if (e.key === 'Enter' && selectedIndex >= 0 && items[selectedIndex]) {
                e.preventDefault();
                items[selectedIndex].click();
                selectedIndex = -1;
            } else if (e.key === 'Escape') {
                modelDropdown.style.display = 'none';
                selectedIndex = -1;
            } else {
                // Reset selection when typing
                selectedIndex = -1;
            }
        });
    }

    // Add custom button handlers
    const testBtn = modal.querySelector('[data-action="test-connection"]');
    const saveBtn = modal.querySelector('[data-action="save-settings"]');

    testBtn.addEventListener('click', async () => {
        const backend = modal.querySelector('#ai-backend').value;

        // Create abort controller for this AI operation
        app.currentAIAbortController = new AbortController();
        app.isAIOperationCancelled = false; // Reset cancellation flag
        const t = (key) => window.i18n ? window.i18n.t(key) : key;
        app.updateLoadingText(t('loading.testingAIConnection'));
        app.showLoading(null, true); // Show cancel button for AI operations
        try {
            await app.aiManager.switchBackend(backend);
            await app.aiManager.loadAvailableModels();
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            app.showNotification(`✅ ${t('settings.sync.connectionTestCompleted')}`, 'success');
            // Refresh the modal with updated model list
            app.closeModal(modal);
            setTimeout(() => showAISettings(app), 100);
        } catch (error) {
            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
            app.showNotification(`❌ ${t('encryption.connectionError', { error: error.message })}`, 'error');
        } finally {
            app.hideLoading();
        }
    });

    saveBtn.addEventListener('click', async () => {
        const backend = modal.querySelector('#ai-backend').value;

        try {
            // Set backend-specific settings first
            if (backend === 'ollama') {
                const endpoint = modal.querySelector('#ollama-endpoint').value;
                const model = modal.querySelector('#ollama-model').value;
                await app.aiManager.updateOllamaEndpoint(endpoint);
                await app.aiManager.updateOllamaModel(model);
            } else {
                const apiKey = modal.querySelector('#openrouter-api-key').value.trim();
                const model = modal.querySelector('#openrouter-model').value;
                const searxngEnabled = modal.querySelector('#searxng-enabled').checked;
                const searxngUrl = modal.querySelector('#searxng-url').value.trim();
                const searxngMaxResults = modal.querySelector('#searxng-max-results').value;

                const restartTriggered = await app.aiManager.updateOpenRouterApiKey(apiKey);
                await app.aiManager.updateOpenRouterModel(model);
                await app.aiManager.updateSearxngEnabled(searxngEnabled);
                await app.aiManager.updateSearxngUrl(searxngUrl);
                await app.aiManager.updateSearxngMaxResults(searxngMaxResults);

                // If API key changed and restart was triggered, show message and return early
                if (restartTriggered) {
                    const t = (key) => window.i18n ? window.i18n.t(key) : key;
                    app.showNotification(`✅ ${t('settings.sync.openRouterApiKeyUpdated')}`, 'success');
                    app.closeModal(modal);
                    // Small delay before restart to allow notification to show
                    setTimeout(() => {
                        ipcRenderer.send('restart-app');
                    }, 1000);
                    return;
                }
            }

            // Now switch backend (which will validate connection with the updated settings)
            await app.aiManager.switchBackend(backend);

            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            app.showNotification(`✅ ${t('settings.sync.aiSettingsSaved')}`, 'success');
            app.closeModal(modal);
        } catch (error) {
            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
            app.showNotification(t('notifications.failedToSaveSettings', { error: error.message }), 'error');
        }
    });
}

module.exports = { showAISettings };
