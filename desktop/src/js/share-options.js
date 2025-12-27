/**
 * Share Options Module
 * Handles the share options dialog for CogNotez
 */

/**
 * Shows the share options modal dialog
 * @param {Object} app - The CogNotezApp instance
 */
function showShareOptions(app) {
    if (!app.currentNote || !app.backendAPI) return;

    const t = (key, fallback, params = {}) => window.i18n ? window.i18n.t(key, params) : fallback;

    // Always refresh current note from database to get latest collaboration status
    if (app.notesManager && app.notesManager.db) {
        const freshNote = app.notesManager.db.getNote(app.currentNote.id);
        if (freshNote) {
            // Preserve decrypted content if note is password protected
            if (app.currentNote.password_protected && app.currentNote.content) {
                freshNote.content = app.currentNote.content;
            }
            app.currentNote = freshNote;
        }
    }

    const isShared = app.currentNote.collaboration?.is_shared;
    const shareLink = app.currentNote.collaboration?.google_drive_share_link;

    let sharedStatusHtml = '';
    if (isShared && shareLink) {
        sharedStatusHtml = `
            <div style="margin-bottom: 20px; padding: 16px; background: var(--context-menu-bg); border-radius: 8px; border: 1px solid var(--accent-primary);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                    <i class="fas fa-check-circle" style="color: var(--accent-primary);"></i>
                    <span style="font-weight: 500; color: var(--accent-primary);">${t('notifications.noteSharedOnGoogleDrive', 'Note is currently shared on Google Drive')}</span>
                </div>
                <div style="margin-bottom: 12px;">
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">${t('notifications.shareLink', 'Share Link:')}</div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input type="text" id="current-share-link" readonly value="${shareLink}" style="flex: 1; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-primary); color: var(--text-primary); font-family: monospace; font-size: 11px;">
                        <button id="copy-share-link-btn" class="btn-secondary" style="padding: 8px 12px;" title="${t('notifications.copyLink', 'Copy link')}">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>
                <button id="revoke-share-btn" class="btn-secondary" style="width: 100%; padding: 10px; background: var(--error-color); color: white; border: none;">
                    <i class="fas fa-times-circle"></i> ${t('notifications.revokeShare', 'Revoke Share')}
                </button>
            </div>
        `;
    }

    const content = `
        <div style="max-width: 500px;">
            <div style="margin-bottom: 20px;">
                <h4 style="margin: 0 0 12px 0; color: var(--text-primary);"><i class="fas fa-share"></i> ${t('editor.shareNoteTitle', 'Share "{{title}}"', { title: app.currentNote.title })}</h4>
                <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">
                    ${t('editor.shareNoteDescription', 'Choose how you want to share this note:')}
                </p>
            </div>

            ${sharedStatusHtml}

            <div style="display: flex; flex-direction: column; gap: 12px;">
                <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 8px;">
                    <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 8px;">${t('notifications.collaboration', 'Collaboration')}</div>
                    
                    <button class="share-option-btn" data-action="share-google-drive" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                        <span><i class="fab fa-google-drive" style="color: #4285F4;"></i></span>
                        <div>
                            <div style="font-weight: 500;">${isShared ? t('notifications.updateGoogleDriveShare', 'Update Google Drive Share') : t('notifications.shareViaGoogleDrive', 'Share via Google Drive')}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${isShared ? t('notifications.updateGoogleDriveShareDescription', 'Update existing shared note on Google Drive') : t('notifications.shareViaGoogleDriveDescription', 'Upload and share on Google Drive with permissions')}</div>
                        </div>
                    </button>
                </div>

                <div style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; margin-bottom: 8px;">
                    <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 8px;">${t('notifications.exportSection', 'Export')}</div>
                    
                    <button class="share-option-btn" data-action="clipboard-markdown" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px;">
                        <span><i class="fas fa-clipboard"></i></span>
                        <div>
                            <div style="font-weight: 500;">${t('notifications.copyToClipboardMarkdown', 'Copy to Clipboard (Markdown)')}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${t('notifications.copyToClipboardMarkdownDesc', 'Share formatted content')}</div>
                        </div>
                    </button>

                    <button class="share-option-btn" data-action="clipboard-text" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                        <span>📄</span>
                        <div>
                            <div style="font-weight: 500;">${t('notifications.copyToClipboardText', 'Copy to Clipboard (Plain Text)')}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${t('notifications.copyToClipboardTextDesc', 'Share plain text content')}</div>
                        </div>
                    </button>

                    <button class="share-option-btn" data-action="export-markdown" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                        <span>📁</span>
                        <div>
                            <div style="font-weight: 500;">${t('notifications.exportAsMarkdownFile', 'Export as Markdown File')}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${t('notifications.exportAsMarkdownFileDesc', 'Save to file for sharing')}</div>
                        </div>
                    </button>

                    <button class="share-option-btn" data-action="export-text" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                        <span>📄</span>
                        <div>
                            <div style="font-weight: 500;">${t('notifications.exportAsTextFile', 'Export as Text File')}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${t('notifications.exportAsTextFileDesc', 'Save to file for sharing')}</div>
                        </div>
                    </button>

                    <button class="share-option-btn" data-action="export-pdf" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--input-bg); color: var(--text-primary); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                        <span>📋</span>
                        <div>
                            <div style="font-weight: 500;">${t('notifications.shareAsPDF', 'Share as PDF')}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${t('notifications.shareAsPDFDesc', 'Preserves media and formatting')}</div>
                        </div>
                    </button>
                </div>
            </div>

            <div style="margin-top: 20px; padding: 12px; background: var(--context-menu-bg); border-radius: 6px; border: 1px solid var(--border-color);">
                <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.4;">
                    ${t('notifications.shareTip', '💡 Tip: Google Drive sharing enables cloud-based collaboration with permission control. Export options let you share files directly.')}
                </div>
            </div>
        </div>
    `;

    const modal = app.createModal(t('editor.shareNote', 'Share Note'), content, [
        { text: t('modals.close', 'Close'), type: 'secondary', action: 'close' }
    ]);

    // Handle copy link button
    if (isShared && shareLink) {
        const copyBtn = modal.querySelector('#copy-share-link-btn');
        copyBtn?.addEventListener('click', () => {
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            const linkInput = modal.querySelector('#current-share-link');
            linkInput.select();
            document.execCommand('copy');
            app.showNotification(t('notifications.linkCopiedToClipboard', 'Link copied to clipboard!'), 'success');
        });

        // Handle revoke share button
        const revokeBtn = modal.querySelector('#revoke-share-btn');
        revokeBtn?.addEventListener('click', async () => {
            const t = (key, fallback) => window.i18n ? window.i18n.t(key) : fallback;
            if (confirm(t('notifications.revokeShareConfirm', 'Are you sure you want to revoke this share? The Google Drive file will be deleted.'))) {
                try {
                    app.showLoading(t('notifications.revokingShare', 'Revoking share...'));
                    const result = await app.backendAPI.revokeGoogleDriveShare(
                        app.currentNote.collaboration.google_drive_file_id,
                        app.currentNote.id
                    );
                    app.hideLoading();
                    app.showNotification(t('notifications.shareRevokedSuccessfully', 'Share revoked successfully'), 'success');

                    // Update the note's collaboration data in renderer's database
                    if (result.success && result.updatedCollaboration && app.notesManager && app.notesManager.db) {
                        const noteData = app.notesManager.db.data.notes[app.currentNote.id];
                        if (noteData) {
                            noteData.collaboration = result.updatedCollaboration;
                            // Update timestamp so sync knows this version is newer
                            noteData.updated_at = new Date().toISOString();
                            app.notesManager.db.saveToLocalStorage();
                            app.currentNote = app.notesManager.db.getNote(app.currentNote.id);
                        }
                    }
                    // Close ALL modals (in case there are multiple stacked)
                    app.closeAllModals();

                    // Reload the share options to reflect updated state
                    setTimeout(() => app.showShareOptions(), 300);
                } catch (error) {
                    app.hideLoading();
                    const t = (key, fallback, params = {}) => window.i18n ? window.i18n.t(key, params) : fallback;
                    app.showNotification(t('notifications.failedToRevokeShare', 'Failed to revoke share: {{error}}', { error: error.message }), 'error');
                }
            }
        });
    }

    // Add click handlers for share options
    modal.querySelectorAll('.share-option-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const action = e.currentTarget.dataset.action;
            await app.handleShareAction(action);
            if (action !== 'share-google-drive') {
                app.closeModal(modal);
            }
        });
    });
}

module.exports = { showShareOptions };
