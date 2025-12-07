import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../l10n/app_localizations.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(loc?.translate('about_cognotez') ?? 'About CogNotez'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SizedBox(height: 16),
          Center(
            child: Container(
              width: 96,
              height: 96,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color:
                        Theme.of(context).colorScheme.primary.withOpacity(0.2),
                    blurRadius: 20,
                    spreadRadius: 5,
                  ),
                ],
              ),
              child: ClipOval(
                child: SvgPicture.asset(
                  'assets/icon.svg',
                  width: 96,
                  height: 96,
                  fit: BoxFit.cover,
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),
          const Center(
            child: Text(
              'CogNotez',
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: Text(
              '${loc?.translate('version_label') ?? 'Version'} 1.0.0',
              style: const TextStyle(
                fontSize: 16,
                color: Colors.grey,
              ),
            ),
          ),
          const SizedBox(height: 32),
          Text(
            loc?.translate('about_cognotez_description') ??
                'An AI-powered note-taking application built with Flutter.',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 16),
          ),
          const SizedBox(height: 32),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    loc?.translate('features') ?? 'Features',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildFeatureItem(loc?.translate('feature_offline') ??
                      'Offline-first architecture'),
                  _buildFeatureItem(loc?.translate('feature_ai') ??
                      'AI-powered content generation'),
                  _buildFeatureItem(
                      loc?.translate('feature_markdown') ?? 'Markdown support'),
                  _buildFeatureItem(loc?.translate('feature_tags') ??
                      'Tag-based organization'),
                  _buildFeatureItem(loc?.translate('feature_encryption') ??
                      'End-to-end encryption'),
                  _buildFeatureItem(
                      loc?.translate('feature_sync') ?? 'Google Drive sync'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          ListTile(
            leading: const Icon(Icons.code),
            title: Text(loc?.translate('open_source') ?? 'Open Source'),
            subtitle: Text(loc?.translate('open_source_subtitle') ??
                'View source code on GitHub'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _launchUrl('https://github.com/nawka12/noted-ai'),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.bug_report),
            title: Text(loc?.translate('report_issues') ?? 'Report Issues'),
            subtitle: Text(loc?.translate('report_issues_subtitle') ??
                'Found a bug? Let us know'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () =>
                _launchUrl('https://github.com/nawka12/noted-ai/issues'),
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              '© 2024 CogNotez\n${loc?.translate('built_with_flutter') ?? 'Built with ❤️ using Flutter'}',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.grey,
                fontSize: 12,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFeatureItem(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          const Icon(Icons.check_circle, size: 20, color: Colors.green),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
