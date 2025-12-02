import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/settings_service.dart';
import '../services/theme_service.dart';
import '../services/database_service.dart';
import '../services/backup_service.dart';
import '../services/google_drive_service.dart';
import '../services/encryption_service.dart';
import '../services/notes_service.dart';
import '../models/settings.dart';
import 'about_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late SettingsService _settingsService;
  late AppSettings _currentSettings;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _settingsService = SettingsService();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    await _settingsService.loadSettings();
    setState(() {
      _currentSettings = _settingsService.settings;
      _isLoading = false;
    });
  }

  Future<void> _saveSettings() async {
    await _settingsService.saveSettings(_currentSettings);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Settings saved')),
      );
    }
  }

  void _updateSettings(AppSettings Function(AppSettings) update) {
    setState(() {
      _currentSettings = update(_currentSettings);
    });
    _saveSettings();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Settings')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final themeService = Provider.of<ThemeService>(context, listen: false);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
      ),
      body: ListView(
        children: [
          // Appearance Section
          _buildSectionHeader('Appearance'),
          ListTile(
            leading: const Icon(Icons.palette),
            title: const Text('Theme'),
            subtitle: Text(_currentSettings.theme == 'system'
                ? 'System default'
                : _currentSettings.theme == 'light'
                    ? 'Light'
                    : 'Dark'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showThemeDialog(themeService),
          ),
          ListTile(
            leading: const Icon(Icons.language),
            title: const Text('Language'),
            subtitle: Text(_getLanguageName(_currentSettings.language)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showLanguageDialog(),
          ),
          
          const Divider(),
          
          // AI Configuration Section
          _buildSectionHeader('AI Configuration'),
          ListTile(
            leading: const Icon(Icons.smart_toy),
            title: const Text('AI Backend'),
            subtitle: Text(_currentSettings.aiBackend == 'ollama'
                ? 'Ollama'
                : 'OpenRouter'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showAIBackendDialog(),
          ),
          
          if (_currentSettings.aiBackend == 'ollama') ...[
            ListTile(
              leading: const Icon(Icons.link),
              title: const Text('Ollama Endpoint'),
              subtitle: Text(_currentSettings.ollamaEndpoint),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _showOllamaEndpointDialog(),
            ),
            ListTile(
              leading: const Icon(Icons.model_training),
              title: const Text('Ollama Model'),
              subtitle: Text(_currentSettings.ollamaModel),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _showOllamaModelDialog(),
            ),
          ] else ...[
            ListTile(
              leading: const Icon(Icons.key),
              title: const Text('OpenRouter API Key'),
              subtitle: Text(_currentSettings.openRouterApiKey?.isNotEmpty == true
                  ? '••••••••'
                  : 'Not set'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _showOpenRouterApiKeyDialog(),
            ),
            ListTile(
              leading: const Icon(Icons.model_training),
              title: const Text('OpenRouter Model'),
              subtitle: Text(_currentSettings.openRouterModel ?? 'openai/gpt-4o-mini'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _showOpenRouterModelDialog(),
            ),
          ],
          
          const Divider(),
          
          // Sync Settings Section
          _buildSectionHeader('Sync & Backup'),
          Consumer<GoogleDriveService>(
            builder: (context, driveService, child) {
              final status = driveService.status;
              
              if (status.isConnected) {
                return Column(
                  children: [
                    // Account info
                    ListTile(
                      leading: status.userPhotoUrl != null
                          ? CircleAvatar(
                              backgroundImage: NetworkImage(status.userPhotoUrl!),
                            )
                          : const CircleAvatar(child: Icon(Icons.person)),
                      title: Text(status.userName ?? 'Connected'),
                      subtitle: Text(status.userEmail ?? ''),
                      trailing: TextButton(
                        onPressed: () => _showDisconnectDialog(driveService),
                        child: const Text('Disconnect'),
                      ),
                    ),
                    
                    // Sync status
                    if (status.isSyncing)
                      const ListTile(
                        leading: SizedBox(
                          width: 24,
                          height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        title: Text('Syncing...'),
                      )
                    else ...[
                      ListTile(
                        leading: Icon(
                          status.hasRemoteBackup ? Icons.cloud_done : Icons.cloud_off,
                          color: status.hasRemoteBackup ? Colors.green : Colors.grey,
                        ),
                        title: Text(status.hasRemoteBackup
                            ? 'Remote backup available${status.isEncrypted ? ' (encrypted)' : ''}'
                            : 'No remote backup'),
                        subtitle: status.lastSync != null
                            ? Text('Last sync: ${_formatLastSync(status.lastSync!)}')
                            : null,
                      ),
                      ListTile(
                        leading: const Icon(Icons.sync),
                        title: const Text('Sync Now'),
                        subtitle: const Text('Manually sync with Google Drive'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => _syncNow(driveService),
                      ),
                    ],
                    
                    // Error display
                    if (status.error != null)
                      ListTile(
                        leading: const Icon(Icons.error, color: Colors.red),
                        title: const Text('Sync Error'),
                        subtitle: Text(
                          status.error!,
                          style: const TextStyle(color: Colors.red),
                        ),
                        trailing: status.needsPassphrase
                            ? TextButton(
                                onPressed: () => _showPassphraseDialog(driveService, isRequired: true),
                                child: const Text('Enter Passphrase'),
                              )
                            : null,
                      ),
                    
                    const Divider(),
                    
                    // End-to-End Encryption Section
                    _buildSectionHeader('End-to-End Encryption'),
                    SwitchListTile(
                      secondary: Icon(
                        driveService.encryptionEnabled ? Icons.lock : Icons.lock_open,
                        color: driveService.encryptionEnabled ? Colors.green : null,
                      ),
                      title: const Text('Enable E2EE'),
                      subtitle: Text(
                        driveService.encryptionEnabled
                            ? (driveService.hasPassphrase ? 'Passphrase set' : 'Enter passphrase to sync')
                            : 'Encrypt sync data with a passphrase',
                      ),
                      value: driveService.encryptionEnabled,
                      onChanged: (value) {
                        if (value) {
                          // Show passphrase dialog when enabling
                          _showPassphraseDialog(driveService, isEnabling: true);
                        } else {
                          // Confirm before disabling
                          _showDisableEncryptionDialog(driveService);
                        }
                      },
                    ),
                    if (driveService.encryptionEnabled)
                      ListTile(
                        leading: const Icon(Icons.key),
                        title: const Text(
                          'Change Passphrase',
                        ),
                        subtitle: Text(driveService.hasPassphrase
                            ? 'Update your E2EE passphrase'
                            : 'Set your E2EE passphrase'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => _showPassphraseDialog(driveService),
                      ),
                    
                    // Info about encryption
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                      child: Text(
                        'End-to-end encryption protects your notes with a passphrase. '
                        'Only you can decrypt your data. '
                        'Use the same passphrase on all devices.',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                    
                    const Divider(),
                    
                    // Auto sync settings
                    SwitchListTile(
                      secondary: const Icon(Icons.autorenew),
                      title: const Text('Auto Sync'),
                      subtitle: const Text('Automatically sync notes'),
                      value: _currentSettings.autoSync,
                      onChanged: (value) {
                        _updateSettings((s) => s.copyWith(autoSync: value));
                      },
                    ),
                    
                    if (_currentSettings.autoSync)
                      ListTile(
                        leading: const Icon(Icons.timer),
                        title: const Text('Sync Interval'),
                        subtitle: Text('${_currentSettings.syncInterval ~/ 60000} minutes'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => _showSyncIntervalDialog(),
                      ),
                  ],
                );
              } else {
                // Not connected
                return Column(
                  children: [
                    ListTile(
                      leading: const Icon(Icons.cloud_off),
                      title: const Text('Google Drive'),
                      subtitle: const Text('Not connected'),
                      trailing: FilledButton.icon(
                        onPressed: () => _connectGoogleDrive(driveService),
                        icon: const Icon(Icons.login),
                        label: const Text('Connect'),
                      ),
                    ),
                    if (status.error != null)
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: Text(
                          status.error!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                            fontSize: 12,
                          ),
                        ),
                      ),
                  ],
                );
              }
            },
          ),
          
          const Divider(),
          
          // Local Backup Section
          _buildSectionHeader('Local Backup'),
          ListTile(
            leading: const Icon(Icons.backup),
            title: const Text('Export Backup'),
            subtitle: const Text('Save all notes and tags to a JSON file'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _exportBackup(),
          ),
          ListTile(
            leading: const Icon(Icons.restore),
            title: const Text('Import Backup'),
            subtitle: const Text('Restore notes and tags from a backup file'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _importBackup(),
          ),
          ListTile(
            leading: const Icon(Icons.analytics),
            title: const Text('Backup Statistics'),
            subtitle: const Text('View data statistics'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showBackupStats(),
          ),
          
          const Divider(),
          
          // About Section
          _buildSectionHeader('About'),
          ListTile(
            leading: const Icon(Icons.info),
            title: const Text('About CogNotez'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (context) => const AboutScreen()),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: Theme.of(context).colorScheme.primary,
              fontWeight: FontWeight.bold,
            ),
      ),
    );
  }

  String _getLanguageName(String code) {
    const languages = {
      'en': 'English',
      'es': 'Español',
      'id': 'Bahasa Indonesia',
      'ja': '日本語',
      'jv': 'Basa Jawa',
    };
    return languages[code] ?? 'English';
  }

  void _showThemeDialog(ThemeService themeService) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Select Theme'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RadioListTile<String>(
              title: const Text('System default'),
              value: 'system',
              groupValue: _currentSettings.theme,
              onChanged: (value) {
                if (value != null) {
                  _updateSettings((s) => s.copyWith(theme: value));
                  themeService.setThemeMode(ThemeMode.system);
                  Navigator.pop(context);
                }
              },
            ),
            RadioListTile<String>(
              title: const Text('Light'),
              value: 'light',
              groupValue: _currentSettings.theme,
              onChanged: (value) {
                if (value != null) {
                  _updateSettings((s) => s.copyWith(theme: value));
                  themeService.setThemeMode(ThemeMode.light);
                  Navigator.pop(context);
                }
              },
            ),
            RadioListTile<String>(
              title: const Text('Dark'),
              value: 'dark',
              groupValue: _currentSettings.theme,
              onChanged: (value) {
                if (value != null) {
                  _updateSettings((s) => s.copyWith(theme: value));
                  themeService.setThemeMode(ThemeMode.dark);
                  Navigator.pop(context);
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showLanguageDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Select Language'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: ['en', 'es', 'id', 'ja', 'jv'].map((lang) {
            return RadioListTile<String>(
              title: Text(_getLanguageName(lang)),
              value: lang,
              groupValue: _currentSettings.language,
              onChanged: (value) {
                if (value != null) {
                  _updateSettings((s) => s.copyWith(language: value));
                  Navigator.pop(context);
                }
              },
            );
          }).toList(),
        ),
      ),
    );
  }

  void _showAIBackendDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Select AI Backend'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RadioListTile<String>(
              title: const Text('Ollama'),
              subtitle: const Text('Local AI models'),
              value: 'ollama',
              groupValue: _currentSettings.aiBackend,
              onChanged: (value) {
                if (value != null) {
                  _updateSettings((s) => s.copyWith(aiBackend: value));
                  Navigator.pop(context);
                }
              },
            ),
            RadioListTile<String>(
              title: const Text('OpenRouter'),
              subtitle: const Text('Cloud AI models'),
              value: 'openrouter',
              groupValue: _currentSettings.aiBackend,
              onChanged: (value) {
                if (value != null) {
                  _updateSettings((s) => s.copyWith(aiBackend: value));
                  Navigator.pop(context);
                }
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showOllamaEndpointDialog() {
    final controller = TextEditingController(text: _currentSettings.ollamaEndpoint);
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Ollama Endpoint'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            hintText: 'http://localhost:11434',
            labelText: 'Endpoint URL',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              _updateSettings((s) => s.copyWith(ollamaEndpoint: controller.text));
              Navigator.pop(context);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showOllamaModelDialog() {
    final controller = TextEditingController(text: _currentSettings.ollamaModel);
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Ollama Model'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            hintText: 'llama3.2:latest',
            labelText: 'Model name',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              _updateSettings((s) => s.copyWith(ollamaModel: controller.text));
              Navigator.pop(context);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showOpenRouterApiKeyDialog() {
    final controller = TextEditingController(text: _currentSettings.openRouterApiKey ?? '');
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('OpenRouter API Key'),
        content: TextField(
          controller: controller,
          obscureText: true,
          decoration: const InputDecoration(
            hintText: 'Enter your API key',
            labelText: 'API Key',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              _updateSettings((s) => s.copyWith(openRouterApiKey: controller.text.isEmpty ? null : controller.text));
              Navigator.pop(context);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showOpenRouterModelDialog() {
    final controller = TextEditingController(text: _currentSettings.openRouterModel ?? 'openai/gpt-4o-mini');
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('OpenRouter Model'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            hintText: 'openai/gpt-4o-mini',
            labelText: 'Model name',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              _updateSettings((s) => s.copyWith(openRouterModel: controller.text));
              Navigator.pop(context);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  void _showSyncIntervalDialog() {
    final controller = TextEditingController(
      text: '${_currentSettings.syncInterval ~/ 60000}',
    );
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sync Interval'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            hintText: '5',
            labelText: 'Minutes',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              final minutes = int.tryParse(controller.text) ?? 5;
              _updateSettings((s) => s.copyWith(syncInterval: minutes * 60000));
              Navigator.pop(context);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  String _formatLastSync(DateTime lastSync) {
    final now = DateTime.now();
    final diff = now.difference(lastSync);
    
    if (diff.inMinutes < 1) {
      return 'Just now';
    } else if (diff.inMinutes < 60) {
      return '${diff.inMinutes} minutes ago';
    } else if (diff.inHours < 24) {
      return '${diff.inHours} hours ago';
    } else {
      return '${diff.inDays} days ago';
    }
  }

  Future<void> _connectGoogleDrive(GoogleDriveService driveService) async {
    try {
      final success = await driveService.signIn();
      if (!success && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to connect to Google Drive')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  Future<void> _showDisconnectDialog(GoogleDriveService driveService) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Disconnect Google Drive'),
        content: const Text(
          'Are you sure you want to disconnect from Google Drive? '
          'Your local notes will not be deleted, but sync will be disabled.'
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Disconnect'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await driveService.disconnect();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Disconnected from Google Drive')),
        );
      }
    }
  }

  Future<void> _syncNow(GoogleDriveService driveService) async {
    try {
      final databaseService = Provider.of<DatabaseService>(context, listen: false);
      final notesService = Provider.of<NotesService>(context, listen: false);
      final backupService = BackupService(databaseService);
      
      // Get local data in desktop-compatible format
      final localData = await backupService.exportToDesktopFormat();
      
      // Perform sync with media files included
      final result = await driveService.syncWithMedia(
        localData: localData,
        applyData: (data) async {
          // Import the synced data
          await backupService.importFromDesktopFormat(data);
        },
        onProgress: (status) {
          // Update status in real-time if needed
          debugPrint('Sync progress: $status');
        },
      );

      if (mounted) {
        if (result.encryptionRequired) {
          // Show passphrase dialog
          _showPassphraseDialog(driveService, isRequired: true);
        } else {
          // Refresh notes list after successful sync
          if (result.success && (result.notesDownloaded > 0 || result.action == 'download' || result.action == 'merge')) {
            await notesService.loadNotes();
            await notesService.loadTags();
          }
          
          // Build sync message including media stats
          String message = result.message;
          if (result.success) {
            final mediaStats = <String>[];
            if (result.mediaUploaded > 0) {
              mediaStats.add('${result.mediaUploaded} media uploaded');
            }
            if (result.mediaDownloaded > 0) {
              mediaStats.add('${result.mediaDownloaded} media downloaded');
            }
            if (mediaStats.isNotEmpty) {
              message = '$message (${mediaStats.join(', ')})';
            }
          }
          
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(message),
              backgroundColor: result.success ? Colors.green : Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Sync failed: $e')),
        );
      }
    }
  }

  Future<void> _showPassphraseDialog(
    GoogleDriveService driveService, {
    bool isEnabling = false,
    bool isRequired = false,
  }) async {
    final controller = TextEditingController();
    final confirmController = TextEditingController();
    final formKey = GlobalKey<FormState>();
    bool obscureText = true;
    
    final result = await showDialog<String?>(
      context: context,
      barrierDismissible: !isRequired,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(isRequired
              ? 'Enter Passphrase'
              : isEnabling
                  ? 'Set E2EE Passphrase'
                  : 'Change Passphrase'),
          content: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (isRequired)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Text(
                      'The cloud data is encrypted. Enter your passphrase to decrypt it.',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                if (isEnabling)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Text(
                      'Choose a strong passphrase to encrypt your sync data. '
                      'Remember it - there is no way to recover your data if you forget it.',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                TextFormField(
                  controller: controller,
                  obscureText: obscureText,
                  autofocus: true,
                  decoration: InputDecoration(
                    labelText: 'Passphrase',
                    hintText: 'Enter your passphrase',
                    suffixIcon: IconButton(
                      icon: Icon(obscureText ? Icons.visibility : Icons.visibility_off),
                      onPressed: () => setState(() => obscureText = !obscureText),
                    ),
                  ),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return 'Passphrase is required';
                    }
                    final validation = EncryptionService.validatePassphrase(value);
                    if (!validation.isValid) {
                      return validation.errors.first;
                    }
                    return null;
                  },
                ),
                if (isEnabling) ...[
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: confirmController,
                    obscureText: obscureText,
                    decoration: const InputDecoration(
                      labelText: 'Confirm Passphrase',
                      hintText: 'Re-enter your passphrase',
                    ),
                    validator: (value) {
                      if (value != controller.text) {
                        return 'Passphrases do not match';
                      }
                      return null;
                    },
                  ),
                ],
              ],
            ),
          ),
          actions: [
            if (!isRequired)
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
            FilledButton(
              onPressed: () {
                if (formKey.currentState!.validate()) {
                  Navigator.pop(context, controller.text);
                }
              },
              child: Text(isEnabling ? 'Enable Encryption' : 'Confirm'),
            ),
          ],
        ),
      ),
    );

    if (result != null && result.isNotEmpty) {
      await driveService.updateEncryptionSettings(
        enabled: true,
        passphrase: result,
      );
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(isEnabling
                ? 'End-to-end encryption enabled'
                : 'Passphrase updated'),
            backgroundColor: Colors.green,
          ),
        );
        
        // If passphrase was required for sync, retry sync
        if (isRequired) {
          _syncNow(driveService);
        }
      }
    }
  }

  Future<void> _showDisableEncryptionDialog(GoogleDriveService driveService) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Disable Encryption'),
        content: const Text(
          'Are you sure you want to disable end-to-end encryption?\n\n'
          'Your data will be synced without encryption. '
          'Existing encrypted backups on Google Drive will remain encrypted '
          'until the next sync overwrites them.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Disable'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await driveService.updateEncryptionSettings(enabled: false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('End-to-end encryption disabled')),
        );
      }
    }
  }

  Future<void> _exportBackup() async {
    try {
      final databaseService = Provider.of<DatabaseService>(context, listen: false);
      final backupService = BackupService(databaseService);
      
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => const AlertDialog(
          content: Row(
            children: [
              CircularProgressIndicator(),
              SizedBox(width: 16),
              Text('Creating backup...'),
            ],
          ),
        ),
      );

      await backupService.exportBackup(share: true);
      
      if (mounted) {
        Navigator.pop(context); // Close loading dialog
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Backup created successfully')),
        );
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context); // Close loading dialog
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to create backup: $e')),
        );
      }
    }
  }

  Future<void> _importBackup() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Import Backup'),
        content: const Text(
          'This will import notes and tags from a backup file. '
          'Existing items with the same IDs will be skipped. Continue?'
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Import'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      final databaseService = Provider.of<DatabaseService>(context, listen: false);
      final notesService = Provider.of<NotesService>(context, listen: false);
      final backupService = BackupService(databaseService);
      
      final result = await backupService.importBackup();
      
      if (mounted) {
        if (result.success) {
          // Refresh notes list after successful import
          await notesService.loadNotes();
          await notesService.loadTags();
          
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Imported ${result.notesImported} notes and ${result.tagsImported} tags. '
                'Skipped ${result.notesSkipped} notes and ${result.tagsSkipped} tags.'
              ),
            ),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(result.message)),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to import backup: $e')),
        );
      }
    }
  }

  Future<void> _showBackupStats() async {
    try {
      final databaseService = Provider.of<DatabaseService>(context, listen: false);
      final backupService = BackupService(databaseService);
      final stats = await backupService.getBackupStats();

      if (mounted) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Backup Statistics'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildStatRow('Total Notes', stats.totalNotes.toString()),
                _buildStatRow('Total Tags', stats.totalTags.toString()),
                _buildStatRow('Total Words', stats.totalWords.toString()),
                _buildStatRow('Protected Notes', stats.protectedNotes.toString()),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Close'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to load statistics: $e')),
        );
      }
    }
  }

  Widget _buildStatRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Text(
            value,
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}
