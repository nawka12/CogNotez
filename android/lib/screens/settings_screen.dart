import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/settings_service.dart';
import '../services/theme_service.dart';
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
          
          SwitchListTile(
            secondary: const Icon(Icons.search),
            title: const Text('Enable SearXNG'),
            subtitle: const Text('Web search integration'),
            value: _currentSettings.searxngEnabled,
            onChanged: (value) {
              _updateSettings((s) => s.copyWith(searxngEnabled: value));
            },
          ),
          
          if (_currentSettings.searxngEnabled)
            ListTile(
              leading: const Icon(Icons.link),
              title: const Text('SearXNG URL'),
              subtitle: Text(_currentSettings.searxngUrl),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _showSearXNGUrlDialog(),
            ),
          
          const Divider(),
          
          // Sync Settings Section
          _buildSectionHeader('Sync & Backup'),
          SwitchListTile(
            secondary: const Icon(Icons.cloud),
            title: const Text('Google Drive Sync'),
            subtitle: const Text('Sync notes to Google Drive'),
            value: _currentSettings.googleDriveSyncEnabled,
            onChanged: (value) {
              _updateSettings((s) => s.copyWith(googleDriveSyncEnabled: value));
            },
          ),
          
          if (_currentSettings.googleDriveSyncEnabled) ...[
            SwitchListTile(
              secondary: const Icon(Icons.sync),
              title: const Text('Auto Sync'),
              subtitle: const Text('Automatically sync notes'),
              value: _currentSettings.autoSync,
              onChanged: (value) {
                _updateSettings((s) => s.copyWith(autoSync: value));
              },
            ),
            ListTile(
              leading: const Icon(Icons.timer),
              title: const Text('Sync Interval'),
              subtitle: Text('${_currentSettings.syncInterval ~/ 60000} minutes'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _showSyncIntervalDialog(),
            ),
          ],
          
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

  void _showSearXNGUrlDialog() {
    final controller = TextEditingController(text: _currentSettings.searxngUrl);
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('SearXNG URL'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(
            hintText: 'http://localhost:8080',
            labelText: 'SearXNG URL',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              _updateSettings((s) => s.copyWith(searxngUrl: controller.text));
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
}
