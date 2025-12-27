/**
 * Advanced Settings Module
 * Handles the advanced settings dialog for CogNotez
 */

/**
 * Shows the advanced settings modal dialog
 * @param {Object} app - The CogNotezApp instance
 */
function showAdvancedSettings(app) {
    // Get current tag statistics
    const allTags = app.notesManager.db ? app.notesManager.db.getAllTags() : [];
    const totalTags = allTags.length;

    const t = (key, fallback, params = {}) => window.i18n ? window.i18n.t(key, params) : fallback;

    const content = `
        <div style="max-width: 500px;">
            <div class="settings-section">
                <h4 style="margin: 0 0 16px 0; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                    <i class="fas fa-cog"></i> ${t('settings.advanced.advancedOptions', 'Advanced Options')}
                </h4>

                <!-- Tag Management -->
                <div class="setting-item" style="margin-bottom: 24px;">
                    <div style="margin-bottom: 12px;">
                        <label style="color: var(--text-primary); font-weight: 500; display: block; margin-bottom: 4px;">
                            <i class="fas fa-tags"></i> ${t('settings.advanced.tagManagement', 'Tag Management')}
                        </label>
                        <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 12px;">
                            ${t('settings.advanced.totalTags', 'Total tags: {{count}}', { count: totalTags })}
                        </div>
                    </div>
                    
                    <button id="clear-unused-tags-btn" class="advanced-action-btn" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 8px; justify-content: center; transition: all 0.2s;">
                        <i class="fas fa-broom"></i>
                        <span>${t('settings.advanced.clearUnusedTags', 'Clear Unused Tags')}</span>
                    </button>
                    <div style="margin-top: 6px; color: var(--text-secondary); font-size: 11px; line-height: 1.4;">
                        ${t('settings.advanced.clearUnusedTagsDescription', 'Remove tags that are not associated with any notes. This helps keep your tag list clean and organized.')}
                    </div>
                </div>

                <!-- AI Data Management -->
                <div class="setting-item" style="margin-bottom: 24px;">
                    <div style="margin-bottom: 12px;">
                        <label style="color: var(--text-primary); font-weight: 500; display: block; margin-bottom: 4px;">
                            <i class="fas fa-robot"></i> ${t('settings.advanced.aiDataManagement', 'AI Data Management')}
                        </label>
                        <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 12px;">
                            ${t('settings.advanced.aiDataDescription', 'Manage AI conversation history and data')}
                        </div>
                    </div>
                    
                    <button id="clear-all-ai-conversations-btn" class="advanced-action-btn" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; display: flex; align-items: center; gap: 8px; justify-content: center; transition: all 0.2s;">
                        <i class="fas fa-trash"></i>
                        <span>${t('settings.advanced.clearAllAIConversations', 'Clear All AI Conversations')}</span>
                    </button>
                    <div style="margin-top: 6px; color: var(--text-secondary); font-size: 11px; line-height: 1.4;">
                        ${t('settings.advanced.clearAllAIConversationsDescription', 'Delete all AI conversations for all notes. This action cannot be undone. Note content will not be affected.')}
                    </div>
                </div>
            </div>
        </div>
    `;

    const modal = app.createModal(t('settings.advanced.title', 'Advanced Settings'), content, [
        { text: t('settings.advanced.close', 'Close'), type: 'secondary', action: 'cancel' }
    ]);

    // Handle Clear Unused Tags button
    const clearTagsBtn = modal.querySelector('#clear-unused-tags-btn');
    clearTagsBtn.addEventListener('click', async () => {
        if (!app.notesManager.db || !app.notesManager.db.initialized) {
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            app.showNotification(t('notifications.databaseNotInitialized'), 'error');
            return;
        }

        // Confirm action
        const confirmClear = await app.showConfirmation(
            t('settings.advanced.confirmClearUnusedTitle', 'Clear Unused Tags'),
            t('settings.advanced.confirmClearUnusedMessage', 'Are you sure you want to remove all unused tags?\n\nThis will permanently delete tags that are not associated with any notes.')
        );
        if (!confirmClear) return;

        try {
            clearTagsBtn.disabled = true;
            const t = (key) => window.i18n ? window.i18n.t(key) : key;
            clearTagsBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${t('settings.advanced.clearing')}</span>`;

            const result = app.notesManager.db.clearUnusedTags();

            if (result.deletedCount > 0) {
                const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
                const plural = result.deletedCount > 1 ? 's' : '';
                const pluralRemaining = result.remainingCount !== 1 ? 's' : '';
                const message = `✅ ${t('settings.advanced.clearUnusedTagsSuccess', {
                    deletedCount: result.deletedCount,
                    plural,
                    remainingCount: result.remainingCount,
                    pluralRemaining
                })}`;
                app.showNotification(message, 'success');
                console.log('[Advanced Settings] Cleared unused tags:', result);

                // Close modal and refresh if needed
                app.closeModal(modal);
            } else {
                const t = (key) => window.i18n ? window.i18n.t(key) : key;
                app.showNotification(`ℹ️ ${t('settings.advanced.noUnusedTagsFound')}`, 'info');
                clearTagsBtn.disabled = false;
                clearTagsBtn.innerHTML = `<i class="fas fa-broom"></i> <span>${t('settings.advanced.clearUnusedTags')}</span>`;
            }
        } catch (error) {
            console.error('[Advanced Settings] Error clearing unused tags:', error);
            const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
            const errorMsg = t('notifications.failedToClearUnusedTags', { error: error.message });
            app.showNotification(`❌ ${errorMsg}`, 'error');
            clearTagsBtn.disabled = false;
            clearTagsBtn.innerHTML = `<i class="fas fa-broom"></i> <span>${t('settings.advanced.clearUnusedTags')}</span>`;
        }
    });

    // Handle Clear All AI Conversations button
    const clearAIConversationsBtn = modal.querySelector('#clear-all-ai-conversations-btn');
    clearAIConversationsBtn.addEventListener('click', async () => {
        // Confirm action
        const t = (key, params = {}) => window.i18n ? window.i18n.t(key, params) : key;
        const confirmed = await app.showConfirmation(
            t('settings.advanced.clearAIConversationsConfirmTitle'),
            t('settings.advanced.clearAIConversationsConfirmMessage')
        );
        if (!confirmed) return;

        try {
            clearAIConversationsBtn.disabled = true;
            clearAIConversationsBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>${t('settings.advanced.clearing')}</span>`;

            const result = await app.backendAPI.clearOrphanedAIConversations();

            if (result.success) {
                const message = result.message || `✅ ${t('settings.advanced.allAIConversationsCleared')}`;
                app.showNotification(message, 'success');
                console.log('[Advanced Settings] Cleared AI conversations:', result);

                // Close modal
                app.closeModal(modal);
            } else {
                const errorMsg = result.error || `❌ ${t('notifications.failedToClearAIConversations', { error: '' })}`;
                app.showNotification(errorMsg, 'error');
                clearAIConversationsBtn.disabled = false;
                clearAIConversationsBtn.innerHTML = `<i class="fas fa-trash"></i> <span>${t('settings.advanced.clearAllAIConversations')}</span>`;
            }
        } catch (error) {
            console.error('[Advanced Settings] Error clearing AI conversations:', error);
            const errorMsg = t('notifications.failedToClearAIConversations', { error: error.message });
            app.showNotification(`❌ ${errorMsg}`, 'error');
            clearAIConversationsBtn.disabled = false;
            clearAIConversationsBtn.innerHTML = `<i class="fas fa-trash"></i> <span>${t('settings.advanced.clearAllAIConversations')}</span>`;
        }
    });

    // Add hover effect for the button
    const style = document.createElement('style');
    style.textContent = `
        .advanced-action-btn:hover:not(:disabled) {
            background: var(--accent-color, #3ECF8E) !important;
            color: white !important;
            border-color: var(--accent-color, #3ECF8E) !important;
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .advanced-action-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    `;
    document.head.appendChild(style);
}

module.exports = { showAdvancedSettings };
