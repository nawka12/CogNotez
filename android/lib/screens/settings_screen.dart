import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/settings_service.dart';
import '../services/theme_service.dart';
import '../services/database_service.dart';
import '../services/backup_service.dart';
import '../services/google_drive_service.dart';
import '../services/encryption_service.dart';
import '../services/notes_service.dart';
import '../services/ai_service.dart';
import '../models/settings.dart';
import '../l10n/app_localizations.dart';
import '../widgets/styled_dialog.dart';
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
    _settingsService = Provider.of<SettingsService>(context, listen: false);
    _currentSettings = _settingsService.settings;
    _isLoading = false;
  }

  Future<void> _saveSettings() async {
    await _settingsService.saveSettings(_currentSettings);
    if (mounted) {
      final loc = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content:
                Text(loc?.translate('settings_saved') ?? 'Settings saved')),
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
    final loc = AppLocalizations.of(context);
    if (_isLoading) {
      return Scaffold(
        appBar:
            AppBar(title: Text(loc?.translate('settings_title') ?? 'Settings')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final themeService = Provider.of<ThemeService>(context, listen: false);
    final isLight = Theme.of(context).brightness == Brightness.light;

    return Scaffold(
      backgroundColor: isLight ? const Color(0xFFF8FAFC) : null,
      appBar: AppBar(
        title: Text(loc?.translate('settings_title') ?? 'Settings'),
        backgroundColor: isLight ? const Color(0xFFF8FAFC) : null,
        elevation: 0,
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          // Appearance Section
          _buildSection(
            title: loc?.translate('appearance_section') ?? 'Appearance',
            children: [
              ListTile(
                leading: const Icon(Icons.palette_outlined),
                title: Text(loc?.translate('theme_title') ?? 'Theme'),
                subtitle: Text(_currentSettings.theme == 'system'
                    ? (loc?.translate('theme_system') ?? 'System default')
                    : _currentSettings.theme == 'light'
                        ? (loc?.translate('theme_light') ?? 'Light')
                        : (loc?.translate('theme_dark') ?? 'Dark')),
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showThemeDialog(themeService),
              ),
              ListTile(
                leading: const Icon(Icons.language_outlined),
                title: Text(loc?.translate('language_title') ?? 'Language'),
                subtitle: Text(_getLanguageName(_currentSettings.language)),
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showLanguageDialog(),
              ),
            ],
          ),

          // AI Configuration Section
          _buildSection(
            title: loc?.translate('ai_section') ?? 'AI Configuration',
            children: [
              ListTile(
                leading: const Icon(Icons.smart_toy_outlined),
                title: Text(loc?.translate('ai_backend_title') ?? 'AI Backend'),
                subtitle: Text(_currentSettings.aiBackend == 'ollama'
                    ? (loc?.translate('ai_backend_ollama') ?? 'Ollama')
                    : (loc?.translate('ai_backend_openrouter') ??
                        'OpenRouter')),
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showAIBackendDialog(),
              ),
              if (_currentSettings.aiBackend == 'ollama') ...[
                ListTile(
                  leading: const Icon(Icons.link),
                  title: Text(loc?.translate('ollama_endpoint_title') ??
                      'Ollama Endpoint'),
                  subtitle: Text(_currentSettings.ollamaEndpoint),
                  trailing: const Icon(Icons.chevron_right, size: 20),
                  onTap: () => _showOllamaEndpointDialog(),
                ),
                ListTile(
                  leading: const Icon(Icons.model_training),
                  title: Text(
                      loc?.translate('ollama_model_title') ?? 'Ollama Model'),
                  subtitle: Text(_currentSettings.ollamaModel),
                  trailing: const Icon(Icons.chevron_right, size: 20),
                  onTap: () => _showOllamaModelDialog(),
                ),
              ] else ...[
                ListTile(
                  leading: const Icon(Icons.key),
                  title: Text(loc?.translate('openrouter_api_key_title') ??
                      'OpenRouter API Key'),
                  subtitle: Text(
                      _currentSettings.openRouterApiKey?.isNotEmpty == true
                          ? '••••••••'
                          : (loc?.translate('not_set') ?? 'Not set')),
                  trailing: const Icon(Icons.chevron_right, size: 20),
                  onTap: () => _showOpenRouterApiKeyDialog(),
                ),
                ListTile(
                  leading: const Icon(Icons.model_training),
                  title: Text(loc?.translate('openrouter_model_title') ??
                      'OpenRouter Model'),
                  subtitle: Text(
                      _currentSettings.openRouterModel ?? 'openai/gpt-4o-mini'),
                  trailing: const Icon(Icons.chevron_right, size: 20),
                  onTap: () => _showOpenRouterModelDialog(),
                ),
              ],
            ],
          ),

          // Search Integration Section
          _buildSection(
            title: loc?.translate('search_section') ?? 'Search Integration',
            children: [
              SwitchListTile(
                secondary: const Icon(Icons.public),
                title: Text(
                    loc?.translate('enable_searxng') ?? 'Enable Web Search'),
                subtitle: Text(loc?.translate('enable_searxng_subtitle') ??
                    'Use SearXNG for AI web access'),
                value: _currentSettings.searxngEnabled,
                onChanged: (value) {
                  _updateSettings((s) => s.copyWith(searxngEnabled: value));
                },
              ),
              if (_currentSettings.searxngEnabled) ...[
                ListTile(
                  leading: const Icon(Icons.link),
                  title: Text(
                      loc?.translate('searxng_url_title') ?? 'SearXNG URL'),
                  subtitle: Text(
                      _currentSettings.searxngUrl ?? 'http://localhost:8080'),
                  trailing: const Icon(Icons.chevron_right, size: 20),
                  onTap: () => _showSearxngUrlDialog(),
                ),
                ListTile(
                  leading: const Icon(Icons.list_alt),
                  title: Text(
                      loc?.translate('max_results_title') ?? 'Max Results'),
                  subtitle: Text(
                      '${_currentSettings.searxngMaxResults} ${loc?.translate('n_results') ?? 'results'}'),
                  trailing: const Icon(Icons.chevron_right, size: 20),
                  onTap: () => _showSearxngMaxResultsDialog(),
                ),
              ],
            ],
          ),

          // Sync Settings Section
          Consumer<GoogleDriveService>(
            builder: (context, driveService, child) {
              final status = driveService.status;

              if (status.isConnected) {
                return Column(
                  children: [
                    _buildSection(
                      title: loc?.translate('sync_section') ?? 'Sync & Backup',
                      children: [
                        ListTile(
                          leading: status.userPhotoUrl != null
                              ? CircleAvatar(
                                  backgroundImage:
                                      NetworkImage(status.userPhotoUrl!),
                                  radius: 16,
                                )
                              : const CircleAvatar(
                                  radius: 16,
                                  child: Icon(Icons.person, size: 20)),
                          title: Text(status.userName ?? 'Connected'),
                          subtitle: Text(status.userEmail ?? ''),
                          trailing: TextButton(
                            onPressed: () =>
                                _showDisconnectDialog(driveService),
                            child: Text(
                                loc?.translate('disconnect') ?? 'Disconnect'),
                          ),
                        ),
                        if (status.isSyncing)
                          ListTile(
                            leading: const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                            title:
                                Text(loc?.translate('syncing') ?? 'Syncing...'),
                          )
                        else ...[
                          ListTile(
                            leading: Icon(
                              status.hasRemoteBackup
                                  ? Icons.cloud_done_outlined
                                  : Icons.cloud_off_outlined,
                              color: status.hasRemoteBackup
                                  ? Colors.green
                                  : Colors.grey,
                            ),
                            title: Text(
                              status.hasRemoteBackup
                                  ? (loc?.translate(
                                              'remote_backup_available') ??
                                          'Remote backup available') +
                                      (status.isEncrypted
                                          ? ' (${loc?.translate('encrypted_label') ?? 'encrypted'})'
                                          : '')
                                  : (loc?.translate('no_remote_backup') ??
                                      'No remote backup'),
                            ),
                            subtitle: status.lastSync != null
                                ? Text(
                                    '${loc?.translate('last_sync_prefix') ?? 'Last sync:'} ${_formatLastSync(status.lastSync!)}')
                                : null,
                          ),
                          ListTile(
                            leading: const Icon(Icons.sync),
                            title: Text(
                                loc?.translate('sync_now_title') ?? 'Sync Now'),
                            subtitle: Text(
                                loc?.translate('sync_now_subtitle') ??
                                    'Manually sync with Google Drive'),
                            trailing: const Icon(Icons.chevron_right, size: 20),
                            onTap: () => _syncNow(driveService),
                          ),
                        ],
                      ],
                    ),
                    _buildSection(
                      title: loc?.translate('e2ee_section') ??
                          'End-to-End Encryption',
                      children: [
                        SwitchListTile(
                          secondary: Icon(
                            driveService.encryptionEnabled
                                ? Icons.lock_outlined
                                : Icons.lock_open_outlined,
                            color: driveService.encryptionEnabled
                                ? Colors.green
                                : null,
                          ),
                          title: Text(loc?.translate('enable_e2ee_title') ??
                              'Enable E2EE'),
                          subtitle: Text(
                            driveService.encryptionEnabled
                                ? (driveService.hasPassphrase
                                    ? (loc?.translate('passphrase_set') ??
                                        'Passphrase set')
                                    : (loc?.translate(
                                            'enter_passphrase_to_sync') ??
                                        'Enter passphrase to sync'))
                                : (loc?.translate('encrypt_sync_data') ??
                                    'Encrypt sync data with a passphrase'),
                          ),
                          value: driveService.encryptionEnabled,
                          onChanged: (value) {
                            if (value) {
                              _showPassphraseDialog(driveService,
                                  isEnabling: true);
                            } else {
                              _showDisableEncryptionDialog(driveService);
                            }
                          },
                        ),
                        if (driveService.encryptionEnabled)
                          ListTile(
                            leading: const Icon(Icons.key_outlined),
                            title: Text(loc?.translate('change_passphrase') ??
                                'Change Passphrase'),
                            subtitle: Text(driveService.hasPassphrase
                                ? (loc?.translate('update_e2ee_passphrase') ??
                                    'Update your E2EE passphrase')
                                : (loc?.translate('set_e2ee_passphrase') ??
                                    'Set your E2EE passphrase')),
                            trailing: const Icon(Icons.chevron_right, size: 20),
                            onTap: () => _showPassphraseDialog(driveService),
                          ),
                      ],
                      footer: Text(
                        loc?.translate('e2ee_info') ??
                            'End-to-end encryption protects your notes with a passphrase. '
                                'Only you can decrypt your data. '
                                'Use the same passphrase on all devices.',
                      ),
                    ),
                    _buildSection(
                      title: loc?.translate('auto_sync_title') ?? 'Auto Sync',
                      children: [
                        SwitchListTile(
                          secondary: const Icon(Icons.autorenew),
                          title: Text(
                              loc?.translate('auto_sync_title') ?? 'Auto Sync'),
                          subtitle: Text(loc?.translate('auto_sync_subtitle') ??
                              'Automatically sync notes'),
                          value: _currentSettings.autoSync,
                          onChanged: (value) {
                            _updateSettings((s) => s.copyWith(autoSync: value));
                          },
                        ),
                        if (_currentSettings.autoSync)
                          ListTile(
                            leading: const Icon(Icons.timer_outlined),
                            title: Text(loc?.translate('sync_interval_title') ??
                                'Sync Interval'),
                            subtitle: Text(
                              (loc?.translate('sync_interval_minutes') ??
                                      '{minutes} minutes')
                                  .replaceFirst('{minutes}',
                                      '${_currentSettings.syncInterval ~/ 60000}'),
                            ),
                            trailing: const Icon(Icons.chevron_right, size: 20),
                            onTap: () => _showSyncIntervalDialog(),
                          ),
                      ],
                    ),
                  ],
                );
              } else if (status.isInitializing) {
                // Show loading state while checking for saved session
                return _buildSection(
                  title: loc?.translate('sync_section') ?? 'Sync & Backup',
                  children: [
                    ListTile(
                      leading: const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      title: Text(
                          loc?.translate('google_drive') ?? 'Google Drive'),
                      subtitle: Text(loc?.translate('checking_connection') ??
                          'Checking connection...'),
                    ),
                  ],
                );
              } else {
                return _buildSection(
                  title: loc?.translate('sync_section') ?? 'Sync & Backup',
                  children: [
                    ListTile(
                      leading: const Icon(Icons.cloud_off_outlined),
                      title: Text(
                          loc?.translate('google_drive') ?? 'Google Drive'),
                      subtitle: Text(
                          loc?.translate('not_connected') ?? 'Not connected'),
                      trailing: FilledButton.icon(
                        onPressed: () => _connectGoogleDrive(driveService),
                        icon: const Icon(Icons.login),
                        label:
                            Text(loc?.translate('connect_button') ?? 'Connect'),
                      ),
                    ),
                    if (status.error != null)
                      ListTile(
                        leading:
                            const Icon(Icons.error_outline, color: Colors.red),
                        title: Text(
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

          // Local Backup Section
          _buildSection(
            title: loc?.translate('local_backup_section') ?? 'Local Backup',
            children: [
              ListTile(
                leading: const Icon(Icons.backup_outlined),
                title: Text(
                    loc?.translate('export_backup_title') ?? 'Export Backup'),
                subtitle: Text(loc?.translate('export_backup_subtitle') ??
                    'Save all notes and tags to a JSON file'),
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _exportBackup(),
              ),
              ListTile(
                leading: const Icon(Icons.restore),
                title: Text(
                    loc?.translate('import_backup_title') ?? 'Import Backup'),
                subtitle: Text(loc?.translate('import_backup_subtitle') ??
                    'Restore notes and tags from a backup file'),
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _importBackup(),
              ),
              ListTile(
                leading: const Icon(Icons.analytics_outlined),
                title: Text(loc?.translate('backup_stats_title') ??
                    'Backup Statistics'),
                subtitle: Text(loc?.translate('backup_stats_subtitle') ??
                    'View data statistics'),
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => _showBackupStats(),
              ),
            ],
          ),

          // About Section
          _buildSection(
            title: loc?.translate('about_section') ?? 'About',
            children: [
              ListTile(
                leading: const Icon(Icons.info_outline),
                title: Text(
                    loc?.translate('about_cognotez_title') ?? 'About CogNotez'),
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                        builder: (context) => const AboutScreen()),
                  );
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSection({
    required String title,
    required List<Widget> children,
    Widget? footer,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 8),
          child: Text(
            title,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.5,
                ),
          ),
        ),
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: Theme.of(context).brightness == Brightness.light
                ? Colors.white
                : const Color(0xFF1E293B),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.04),
                blurRadius: 16,
                offset: const Offset(0, 4),
              ),
            ],
            border: Border.all(
              color: Theme.of(context).dividerColor.withOpacity(0.1),
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Theme(
              data: Theme.of(context).copyWith(
                dividerColor: Colors.transparent,
                listTileTheme: ListTileThemeData(
                  dense: false,
                  shape: const RoundedRectangleBorder(
                      borderRadius: BorderRadius.zero),
                  tileColor: Colors.transparent,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                  minVerticalPadding: 12,
                  selectedTileColor:
                      Theme.of(context).colorScheme.primary.withOpacity(0.08),
                  iconColor: Theme.of(context).colorScheme.primary,
                ),
              ),
              child: Column(
                children: [
                  for (int i = 0; i < children.length; i++) ...[
                    children[i],
                    if (i < children.length - 1)
                      Divider(
                        height: 1,
                        indent: 60,
                        endIndent: 0,
                        color: Theme.of(context).dividerColor.withOpacity(0.2),
                      ),
                  ],
                ],
              ),
            ),
          ),
        ),
        if (footer != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(32, 12, 32, 0),
            child: DefaultTextStyle(
              style: Theme.of(context).textTheme.bodySmall!.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    height: 1.4,
                  ),
              child: footer,
            ),
          ),
      ],
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
    final loc = AppLocalizations.of(context);
    showDialog(
      context: context,
      builder: (context) => StyledDialog(
        title: loc?.translate('select_theme_title') ?? 'Select Theme',
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RadioListTile<String>(
              title: Text(loc?.translate('theme_system') ?? 'System default'),
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
              title: Text(loc?.translate('theme_light') ?? 'Light'),
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
              title: Text(loc?.translate('theme_dark') ?? 'Dark'),
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
    final loc = AppLocalizations.of(context);
    showDialog(
      context: context,
      builder: (context) => StyledDialog(
        title: loc?.translate('select_language_title') ?? 'Select Language',
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
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        (loc?.translate('language_changed_message') ??
                                'Language changed to {language}')
                            .replaceFirst(
                                '{language}', _getLanguageName(value)),
                      ),
                    ),
                  );
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
    final loc = AppLocalizations.of(context);
    showDialog(
      context: context,
      builder: (context) => StyledDialog(
        title: loc?.translate('select_ai_backend_title') ?? 'Select AI Backend',
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            RadioListTile<String>(
              title: Text(loc?.translate('ai_backend_ollama') ?? 'Ollama'),
              subtitle: Text(loc?.translate('ai_backend_ollama_subtitle') ??
                  'Local AI models'),
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
              title:
                  Text(loc?.translate('ai_backend_openrouter') ?? 'OpenRouter'),
              subtitle: Text(loc?.translate('ai_backend_openrouter_subtitle') ??
                  'Cloud AI models'),
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
    final controller =
        TextEditingController(text: _currentSettings.ollamaEndpoint);
    showDialog(
      context: context,
      builder: (context) {
        final loc = AppLocalizations.of(context);
        return StyledDialog(
          title: loc?.translate('ollama_endpoint_title') ?? 'Ollama Endpoint',
          content: TextField(
            controller: controller,
            decoration: InputDecoration(
              hintText: 'http://localhost:11434',
              labelText: loc?.translate('endpoint_url_label') ?? 'Endpoint URL',
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(loc?.cancel ?? 'Cancel'),
            ),
            TextButton(
              onPressed: () {
                _updateSettings(
                    (s) => s.copyWith(ollamaEndpoint: controller.text));
                Navigator.pop(context);
              },
              child: Text(loc?.translate('save_button') ?? 'Save'),
            ),
          ],
        );
      },
    );
  }

  void _showOllamaModelDialog() {
    final controller =
        TextEditingController(text: _currentSettings.ollamaModel);
    showDialog(
      context: context,
      builder: (context) {
        final loc = AppLocalizations.of(context);
        return StyledDialog(
          title: loc?.translate('ollama_model_title') ?? 'Ollama Model',
          content: TextField(
            controller: controller,
            decoration: InputDecoration(
              hintText: 'llama3.2:latest',
              labelText: loc?.translate('model_name_label') ?? 'Model name',
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(loc?.cancel ?? 'Cancel'),
            ),
            TextButton(
              onPressed: () {
                _updateSettings(
                    (s) => s.copyWith(ollamaModel: controller.text));
                Navigator.pop(context);
              },
              child: Text(loc?.translate('save_button') ?? 'Save'),
            ),
          ],
        );
      },
    );
  }

  void _showOpenRouterApiKeyDialog() {
    final controller =
        TextEditingController(text: _currentSettings.openRouterApiKey ?? '');
    showDialog(
      context: context,
      builder: (context) {
        final loc = AppLocalizations.of(context);
        return StyledDialog(
          title: loc?.translate('openrouter_api_key_title') ??
              'OpenRouter API Key',
          content: TextField(
            controller: controller,
            obscureText: true,
            decoration: InputDecoration(
              hintText:
                  loc?.translate('enter_api_key_hint') ?? 'Enter your API key',
              labelText: loc?.translate('api_key_label') ?? 'API Key',
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(loc?.cancel ?? 'Cancel'),
            ),
            TextButton(
              onPressed: () {
                _updateSettings((s) => s.copyWith(
                    openRouterApiKey:
                        controller.text.isEmpty ? null : controller.text));
                Navigator.pop(context);
              },
              child: Text(loc?.translate('save_button') ?? 'Save'),
            ),
          ],
        );
      },
    );
  }

  void _showOpenRouterModelDialog() {
    showDialog(
      context: context,
      builder: (context) => _OpenRouterModelPicker(
        currentModel: _currentSettings.openRouterModel ?? 'openai/gpt-4o-mini',
        settings: _currentSettings,
        onModelSelected: (model) {
          _updateSettings((s) => s.copyWith(openRouterModel: model));
        },
      ),
    );
  }

  void _showSearxngUrlDialog() {
    final controller = TextEditingController(text: _currentSettings.searxngUrl);
    showDialog(
      context: context,
      builder: (context) {
        final loc = AppLocalizations.of(context);
        return StyledDialog(
          title: loc?.translate('searxng_url_title') ?? 'SearXNG URL',
          content: TextField(
            controller: controller,
            decoration: InputDecoration(
              hintText: 'http://localhost:8080',
              labelText: loc?.translate('url_label') ?? 'URL',
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(loc?.cancel ?? 'Cancel'),
            ),
            TextButton(
              onPressed: () {
                _updateSettings((s) => s.copyWith(searxngUrl: controller.text));
                Navigator.pop(context);
              },
              child: Text(loc?.translate('save_button') ?? 'Save'),
            ),
          ],
        );
      },
    );
  }

  void _showSearxngMaxResultsDialog() {
    final controller =
        TextEditingController(text: '${_currentSettings.searxngMaxResults}');
    showDialog(
      context: context,
      builder: (context) {
        final loc = AppLocalizations.of(context);
        return StyledDialog(
          title: loc?.translate('max_results_title') ?? 'Max Search Results',
          content: TextField(
            controller: controller,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              hintText: '5',
              labelText: loc?.translate('max_results_label') ?? 'Max Results',
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(loc?.cancel ?? 'Cancel'),
            ),
            TextButton(
              onPressed: () {
                final val = int.tryParse(controller.text) ?? 5;
                _updateSettings((s) => s.copyWith(searxngMaxResults: val));
                Navigator.pop(context);
              },
              child: Text(loc?.translate('save_button') ?? 'Save'),
            ),
          ],
        );
      },
    );
  }

  void _showSyncIntervalDialog() {
    final controller = TextEditingController(
      text: '${_currentSettings.syncInterval ~/ 60000}',
    );
    showDialog(
      context: context,
      builder: (context) {
        final loc = AppLocalizations.of(context);
        return StyledDialog(
          title: loc?.translate('sync_interval_title') ?? 'Sync Interval',
          content: TextField(
            controller: controller,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              hintText: '5',
              labelText: loc?.translate('minutes_label') ?? 'Minutes',
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(loc?.cancel ?? 'Cancel'),
            ),
            TextButton(
              onPressed: () {
                final minutes = int.tryParse(controller.text) ?? 5;
                _updateSettings(
                    (s) => s.copyWith(syncInterval: minutes * 60000));
                Navigator.pop(context);
              },
              child: Text(loc?.translate('save_button') ?? 'Save'),
            ),
          ],
        );
      },
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
    final loc = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StyledDialog(
        title: loc?.translate('disconnect_google_drive_title') ??
            'Disconnect Google Drive',
        message: loc?.translate('disconnect_google_drive_message') ??
            'Are you sure you want to disconnect from Google Drive? '
                'Your local notes will not be deleted, but sync will be disabled.',
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(loc?.cancel ?? 'Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(loc?.translate('disconnect') ?? 'Disconnect'),
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
      final databaseService =
          Provider.of<DatabaseService>(context, listen: false);
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
          if (result.success &&
              (result.notesDownloaded > 0 ||
                  result.action == 'download' ||
                  result.action == 'merge')) {
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
        builder: (context, setState) => StyledDialog(
          title: isRequired
              ? 'Enter Passphrase'
              : isEnabling
                  ? 'Set E2EE Passphrase'
                  : 'Change Passphrase',
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
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12)),
                    suffixIcon: IconButton(
                      icon: Icon(obscureText
                          ? Icons.visibility
                          : Icons.visibility_off),
                      onPressed: () =>
                          setState(() => obscureText = !obscureText),
                    ),
                  ),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return 'Passphrase is required';
                    }
                    final validation =
                        EncryptionService.validatePassphrase(value);
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
                    decoration: InputDecoration(
                      labelText: 'Confirm Passphrase',
                      hintText: 'Re-enter your passphrase',
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12)),
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

  Future<void> _showDisableEncryptionDialog(
      GoogleDriveService driveService) async {
    final loc = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StyledDialog(
        title:
            loc?.translate('disable_encryption_title') ?? 'Disable Encryption',
        isDestructive: true,
        message: loc?.translate('disable_encryption_message') ??
            'Are you sure you want to disable end-to-end encryption?\n\n'
                'Your data will be synced without encryption. '
                'Existing encrypted backups on Google Drive will remain encrypted '
                'until the next sync overwrites them.',
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(loc?.cancel ?? 'Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: Text(loc?.translate('disable_button') ?? 'Disable'),
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
      final databaseService =
          Provider.of<DatabaseService>(context, listen: false);
      final backupService = BackupService(databaseService);

      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => StyledDialog(
          title: 'Creating backup...',
          content: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(),
              SizedBox(width: 16),
              Text('Please wait...'),
            ],
          ),
          actions: [], // No actions for loading dialog
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
      builder: (context) => StyledDialog(
        title: 'Import Backup',
        message: 'This will import notes and tags from a backup file. '
            'Existing items with the same IDs will be skipped. Continue?',
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
      final databaseService =
          Provider.of<DatabaseService>(context, listen: false);
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
                  'Skipped ${result.notesSkipped} notes and ${result.tagsSkipped} tags.'),
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
      final databaseService =
          Provider.of<DatabaseService>(context, listen: false);
      final backupService = BackupService(databaseService);
      final stats = await backupService.getBackupStats();

      if (mounted) {
        showDialog(
          context: context,
          builder: (context) => StyledDialog(
            title: 'Backup Statistics',
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildStatRow('Total Notes', stats.totalNotes.toString()),
                _buildStatRow('Total Tags', stats.totalTags.toString()),
                _buildStatRow('Total Words', stats.totalWords.toString()),
                _buildStatRow(
                    'Protected Notes', stats.protectedNotes.toString()),
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
          Text(label, style: Theme.of(context).textTheme.bodyMedium),
          Text(
            value,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                  color: Theme.of(context).colorScheme.primary,
                ),
          ),
        ],
      ),
    );
  }
}

/// Searchable OpenRouter model picker dialog
class _OpenRouterModelPicker extends StatefulWidget {
  final String currentModel;
  final AppSettings settings;
  final void Function(String modelId) onModelSelected;

  const _OpenRouterModelPicker({
    required this.currentModel,
    required this.settings,
    required this.onModelSelected,
  });

  @override
  State<_OpenRouterModelPicker> createState() => _OpenRouterModelPickerState();
}

class _OpenRouterModelPickerState extends State<_OpenRouterModelPicker> {
  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _manualController = TextEditingController();

  List<OpenRouterModel> _allModels = [];
  List<OpenRouterModel> _filteredModels = [];
  bool _isLoading = true;
  String? _error;
  bool _showManualInput = false;
  String _selectedModelId = '';

  @override
  void initState() {
    super.initState();
    _selectedModelId = widget.currentModel;
    _manualController.text = widget.currentModel;
    _fetchModels();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _manualController.dispose();
    super.dispose();
  }

  Future<void> _fetchModels() async {
    try {
      final aiService = AIService(widget.settings);
      final models = await aiService.fetchOpenRouterModels();
      if (mounted) {
        setState(() {
          _allModels = models;
          _filteredModels = models;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceFirst('Exception: ', '');
          _isLoading = false;
          _showManualInput = true;
        });
      }
    }
  }

  void _filterModels(String query) {
    if (query.isEmpty) {
      setState(() => _filteredModels = _allModels);
    } else {
      final lowerQuery = query.toLowerCase();
      setState(() {
        _filteredModels = _allModels.where((model) {
          return model.name.toLowerCase().contains(lowerQuery) ||
              model.id.toLowerCase().contains(lowerQuery);
        }).toList();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    final isLight = Theme.of(context).brightness == Brightness.light;

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        width: MediaQuery.of(context).size.width * 0.9,
        height: MediaQuery.of(context).size.height * 0.7,
        constraints: const BoxConstraints(maxWidth: 500, maxHeight: 600),
        child: Column(
          children: [
            // Header
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: isLight ? Colors.grey[100] : Colors.grey[900],
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(16)),
              ),
              child: Row(
                children: [
                  Icon(Icons.model_training,
                      color: Theme.of(context).colorScheme.primary),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      loc?.translate('openrouter_model_title') ??
                          'OpenRouter Model',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ],
              ),
            ),

            // Content
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _showManualInput
                      ? _buildManualInput()
                      : _buildModelList(),
            ),

            // Footer actions
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                border: Border(
                    top: BorderSide(color: Theme.of(context).dividerColor)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: Text(loc?.cancel ?? 'Cancel'),
                      ),
                      const SizedBox(width: 8),
                      FilledButton(
                        onPressed: () {
                          final modelId = _showManualInput
                              ? _manualController.text.trim()
                              : _selectedModelId;
                          if (modelId.isNotEmpty) {
                            widget.onModelSelected(modelId);
                            Navigator.pop(context);
                          }
                        },
                        child:
                            Text(loc?.translate('select_button') ?? 'Select'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  TextButton.icon(
                    onPressed: () {
                      setState(() => _showManualInput = !_showManualInput);
                    },
                    icon: Icon(_showManualInput ? Icons.list : Icons.edit,
                        size: 18),
                    label: Text(
                      _showManualInput
                          ? (loc?.translate('browse_models') ?? 'Browse Models')
                          : (loc?.translate('manual_input') ?? 'Manual Input'),
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildManualInput() {
    final loc = AppLocalizations.of(context);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_error != null) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.orange.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.orange.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber,
                      color: Colors.orange, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      loc?.translate('fetch_models_failed') ??
                          'Could not fetch models. Enter model ID manually.',
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
          Text(
            loc?.translate('model_id_label') ?? 'Model ID',
            style: Theme.of(context).textTheme.labelLarge,
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _manualController,
            decoration: InputDecoration(
              hintText: 'openai/gpt-4o-mini',
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              prefixIcon: const Icon(Icons.code),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            loc?.translate('model_examples') ??
                'Examples: openai/gpt-4o-mini, anthropic/claude-3.5-sonnet, google/gemini-pro-1.5',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
        ],
      ),
    );
  }

  Widget _buildModelList() {
    final loc = AppLocalizations.of(context);

    return Column(
      children: [
        // Search bar
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            controller: _searchController,
            onChanged: _filterModels,
            decoration: InputDecoration(
              hintText: loc?.translate('search_models') ?? 'Search models...',
              prefixIcon: const Icon(Icons.search),
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              contentPadding: const EdgeInsets.symmetric(vertical: 12),
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchController.clear();
                        _filterModels('');
                      },
                    )
                  : null,
            ),
          ),
        ),

        // Models count
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Text(
                '${_filteredModels.length} ${loc?.translate('models_available') ?? 'models'}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),

        // Model list
        Expanded(
          child: _filteredModels.isEmpty
              ? Center(
                  child: Text(
                    loc?.translate('no_models_found') ?? 'No models found',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                )
              : ListView.builder(
                  itemCount: _filteredModels.length,
                  itemBuilder: (context, index) {
                    final model = _filteredModels[index];
                    final isSelected = model.id == _selectedModelId;

                    return InkWell(
                      onTap: () {
                        setState(() => _selectedModelId = model.id);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? Theme.of(context)
                                  .colorScheme
                                  .primary
                                  .withOpacity(0.1)
                              : null,
                          border: Border(
                            bottom: BorderSide(
                              color: Theme.of(context)
                                  .dividerColor
                                  .withOpacity(0.3),
                            ),
                          ),
                        ),
                        child: Row(
                          children: [
                            if (isSelected)
                              Icon(
                                Icons.check_circle,
                                color: Theme.of(context).colorScheme.primary,
                                size: 20,
                              )
                            else
                              Icon(
                                Icons.radio_button_unchecked,
                                color: Theme.of(context)
                                    .colorScheme
                                    .onSurfaceVariant,
                                size: 20,
                              ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    model.name,
                                    style: Theme.of(context)
                                        .textTheme
                                        .bodyMedium
                                        ?.copyWith(
                                          fontWeight: isSelected
                                              ? FontWeight.w600
                                              : FontWeight.w500,
                                          color: isSelected
                                              ? Theme.of(context)
                                                  .colorScheme
                                                  .primary
                                              : null,
                                        ),
                                  ),
                                  if (model.id != model.name) ...[
                                    const SizedBox(height: 2),
                                    Text(
                                      model.id,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall
                                          ?.copyWith(
                                            color: Theme.of(context)
                                                .colorScheme
                                                .onSurfaceVariant,
                                            fontFamily: 'monospace',
                                            fontSize: 11,
                                          ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}
