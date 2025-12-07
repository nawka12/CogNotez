import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../models/template.dart';
import '../models/note.dart';
import '../models/settings.dart';
import '../services/template_service.dart';
import '../services/ai_service.dart';
import '../services/settings_service.dart';
import '../utils/app_theme.dart';
import '../l10n/app_localizations.dart';
import '../widgets/styled_dialog.dart';

class TemplateChooser extends StatefulWidget {
  final Function(Note) onNoteCreated;

  const TemplateChooser({
    super.key,
    required this.onNoteCreated,
  });

  @override
  State<TemplateChooser> createState() => _TemplateChooserState();

  /// Show template chooser as a bottom sheet
  static Future<void> show(
    BuildContext context, {
    required Function(Note) onNoteCreated,
  }) async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => TemplateChooser(onNoteCreated: onNoteCreated),
    );
  }
}

class _TemplateChooserState extends State<TemplateChooser>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _showCustomTemplateForm = false;
  bool _isGeneratingAI = false;
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _iconController = TextEditingController(text: '📝');
  final _contentController = TextEditingController();
  final _aiPromptController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _nameController.dispose();
    _descriptionController.dispose();
    _iconController.dispose();
    _contentController.dispose();
    _aiPromptController.dispose();
    super.dispose();
  }

  void _useTemplate(NoteTemplate template) {
    final templateService =
        Provider.of<TemplateService>(context, listen: false);
    final content = templateService.processTemplateContent(template.content);

    final note = Note(
      id: const Uuid().v4(),
      title: template.name == 'Blank Note' ? '' : template.name,
      content: content,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
      tags: [],
    );

    Navigator.pop(context);
    widget.onNoteCreated(note);
  }

  Future<void> _createCustomTemplate() async {
    final loc = AppLocalizations.of(context);
    final name = _nameController.text.trim();
    final description = _descriptionController.text.trim();
    final icon = _iconController.text.trim();
    final content = _contentController.text;

    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            loc?.translate('template_name_required') ??
                'Please enter a template name',
          ),
        ),
      );
      return;
    }

    if (description.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            loc?.translate('template_description_required') ??
                'Please enter a description',
          ),
        ),
      );
      return;
    }

    final templateService =
        Provider.of<TemplateService>(context, listen: false);
    await templateService.addCustomTemplate(
      name: name,
      description: description,
      icon: icon.isEmpty ? '📝' : icon,
      content: content,
    );

    setState(() {
      _showCustomTemplateForm = false;
      _nameController.clear();
      _descriptionController.clear();
      _iconController.text = '📝';
      _contentController.clear();
    });

    if (mounted) {
      final loc = AppLocalizations.of(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            (loc?.translate('template_created') ?? 'Template "{name}" created')
                .replaceFirst('{name}', name),
          ),
        ),
      );
    }
  }

  Future<void> _showAIGenerateDialog() async {
    final loc = AppLocalizations.of(context);
    _aiPromptController.clear();

    final result = await showDialog<String>(
      context: context,
      builder: (context) => _AITemplateDialog(
        promptController: _aiPromptController,
        loc: loc,
      ),
    );

    if (result != null && result.isNotEmpty && mounted) {
      await _generateAITemplate(result);
    }
  }

  Future<void> _generateAITemplate(String description) async {
    final loc = AppLocalizations.of(context);
    final settingsService =
        Provider.of<SettingsService>(context, listen: false);
    final settings = settingsService.settings;

    // Check if AI is configured
    if (!_isAIConfigured(settings)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              loc?.translate('ai_not_configured') ??
                  'AI is not configured. Please set up AI in Settings.',
            ),
            action: SnackBarAction(
              label: loc?.settings ?? 'Settings',
              onPressed: () {
                Navigator.pop(context);
                // User can navigate to settings manually
              },
            ),
          ),
        );
      }
      return;
    }

    setState(() => _isGeneratingAI = true);

    try {
      final aiService = AIService(settings);

      // Create the prompt for template generation
      final prompt = '''Create a markdown template for: $description

Requirements:
1. Use markdown formatting (headers, lists, checkboxes, etc.)
2. Include appropriate sections with clear structure
3. Add placeholder text where users should fill in information
4. Use emojis sparingly for visual appeal
5. Make it practical and immediately usable
6. Include {date} placeholder where current date would be appropriate
7. Don't include any explanatory text - just output the template itself

Generate the template now:''';

      final generatedContent = await aiService.generateContent(prompt);

      if (mounted) {
        // Extract a suggested name from the description
        String suggestedName = description;
        if (suggestedName.length > 30) {
          suggestedName = '${suggestedName.substring(0, 27)}...';
        }
        // Capitalize first letter
        if (suggestedName.isNotEmpty) {
          suggestedName =
              suggestedName[0].toUpperCase() + suggestedName.substring(1);
        }

        // Pre-fill the form with generated content
        setState(() {
          _showCustomTemplateForm = true;
          _nameController.text = suggestedName;
          _descriptionController.text = 'AI-generated template for $description';
          _iconController.text = '🤖';
          _contentController.text = generatedContent.trim();
          _isGeneratingAI = false;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              loc?.translate('ai_template_generated') ??
                  'AI template generated! Review and save it.',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isGeneratingAI = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              (loc?.translate('ai_template_generation_failed') ??
                      'Failed to generate template: {error}')
                  .replaceFirst('{error}', e.toString()),
            ),
          ),
        );
      }
    }
  }

  bool _isAIConfigured(AppSettings settings) {
    if (settings.aiBackend == 'ollama') {
      return settings.ollamaEndpoint.isNotEmpty &&
          settings.ollamaModel.isNotEmpty;
    } else if (settings.aiBackend == 'openrouter') {
      return settings.openRouterApiKey != null &&
          settings.openRouterApiKey!.isNotEmpty &&
          settings.openRouterModel != null &&
          settings.openRouterModel!.isNotEmpty;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final loc = AppLocalizations.of(context);
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: const BorderRadius.vertical(
                top: Radius.circular(AppTheme.radiusXl)),
            boxShadow: [AppTheme.shadowXl],
          ),
          child: Column(
            children: [
              // Handle bar with gradient
              Container(
                margin: const EdgeInsets.only(top: AppTheme.spacingSm),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [AppTheme.accentColor, AppTheme.primaryDark],
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                  ),
                  borderRadius: BorderRadius.circular(AppTheme.radiusFull),
                ),
              ),
              // Header with gradient title
              Padding(
                padding: const EdgeInsets.all(AppTheme.spacingLg),
                child: Row(
                  children: [
                    Text(
                      loc?.translate('choose_template_title') ??
                          'Choose Template',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        foreground: Paint()
                          ..shader = LinearGradient(
                            colors: [
                              AppTheme.accentColor,
                              AppTheme.primaryDark
                            ],
                          ).createShader(
                              const Rect.fromLTWH(0.0, 0.0, 200.0, 70.0)),
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.pop(context),
                      style: IconButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(36, 36),
                      ),
                    ),
                  ],
                ),
              ),
              // Modern tab bar
              Container(
                margin:
                    const EdgeInsets.symmetric(horizontal: AppTheme.spacingLg),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceVariant,
                  borderRadius: BorderRadius.circular(AppTheme.radiusLg),
                  border:
                      Border.all(color: Theme.of(context).colorScheme.outline),
                ),
                child: TabBar(
                  controller: _tabController,
                  indicator: BoxDecoration(
                    color: AppTheme.accentColor,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  ),
                  labelColor: Colors.white,
                  unselectedLabelColor:
                      Theme.of(context).colorScheme.onSurfaceVariant,
                  indicatorSize: TabBarIndicatorSize.tab,
                  tabs: [
                    Tab(
                        text:
                            loc?.translate('templates_built_in') ?? 'Built-in'),
                    Tab(text: loc?.translate('templates_custom') ?? 'Custom'),
                  ],
                ),
              ),
              // Tab content
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    // Built-in templates
                    _buildDefaultTemplatesTab(scrollController),
                    // Custom templates
                    _buildCustomTemplatesTab(scrollController),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildDefaultTemplatesTab(ScrollController scrollController) {
    final templateService = Provider.of<TemplateService>(context);
    final templates = templateService.defaultTemplates;

    return GridView.builder(
      controller: scrollController,
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 1.2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: templates.length,
      itemBuilder: (context, index) {
        final template = templates[index];
        return _TemplateCard(
          template: template,
          onTap: () => _useTemplate(template),
        );
      },
    );
  }

  Widget _buildCustomTemplatesTab(ScrollController scrollController) {
    final templateService = Provider.of<TemplateService>(context);
    final templates = templateService.customTemplates;
    final loc = AppLocalizations.of(context);

    if (_showCustomTemplateForm) {
      return SingleChildScrollView(
        controller: scrollController,
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () =>
                      setState(() => _showCustomTemplateForm = false),
                ),
                Text(
                  loc?.translate('create_custom_template') ??
                      'Create Custom Template',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              decoration: InputDecoration(
                labelText:
                    loc?.translate('template_name_label') ?? 'Template Name',
                hintText: loc?.translate('template_name_hint') ??
                    'e.g., Weekly Review',
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descriptionController,
              decoration: InputDecoration(
                labelText: loc?.translate('template_description_label') ??
                    'Description',
                hintText: loc?.translate('template_description_hint') ??
                    'Brief description of the template',
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _iconController,
              decoration: InputDecoration(
                labelText:
                    loc?.translate('template_icon_label') ?? 'Icon (emoji)',
                hintText: '📝',
                border: const OutlineInputBorder(),
              ),
              maxLength: 2,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _contentController,
              maxLines: 10,
              decoration: InputDecoration(
                labelText: loc?.translate('template_content_label') ??
                    'Template Content',
                hintText: loc?.translate('template_content_hint') ??
                    'Enter the template content...',
                border: const OutlineInputBorder(),
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _createCustomTemplate,
                child: Text(
                  loc?.translate('save_template_action') ?? 'Save Template',
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Column(
      children: [
        // Add custom template buttons
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () =>
                      setState(() => _showCustomTemplateForm = true),
                  icon: const Icon(Icons.add),
                  label: Text(
                    loc?.translate('create_custom_template') ??
                        'Create Custom Template',
                  ),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _isGeneratingAI ? null : _showAIGenerateDialog,
                  icon: _isGeneratingAI
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.auto_awesome),
                  label: Text(
                    _isGeneratingAI
                        ? (loc?.translate('generating') ?? 'Generating...')
                        : (loc?.translate('generate_with_ai') ??
                            'Generate with AI'),
                  ),
                ),
              ),
            ],
          ),
        ),
        // Custom templates grid
        Expanded(
          child: templates.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.description_outlined,
                        size: 64,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        loc?.translate('no_custom_templates_title') ??
                            'No custom templates yet',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        loc?.translate('no_custom_templates_description') ??
                            'Create one from scratch or save notes as templates',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: Theme.of(context)
                                  .colorScheme
                                  .onSurfaceVariant,
                            ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                )
              : GridView.builder(
                  controller: scrollController,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    childAspectRatio: 1.2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                  ),
                  itemCount: templates.length,
                  itemBuilder: (context, index) {
                    final template = templates[index];
                    return _TemplateCard(
                      template: template,
                      onTap: () => _useTemplate(template),
                      onDelete: () => _deleteCustomTemplate(template),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Future<void> _deleteCustomTemplate(NoteTemplate template) async {
    final loc = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => StyledDialog(
        title: loc?.translate('delete_template_title') ?? 'Delete Template',
        message: (loc?.translate('delete_template_confirmation') ??
                'Are you sure you want to delete "{name}"?')
            .replaceFirst('{name}', template.name),
        isDestructive: true,
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
            child: Text(
              loc?.delete ?? 'Delete',
            ),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final templateService =
          Provider.of<TemplateService>(context, listen: false);
      await templateService.deleteCustomTemplate(template.id);
      if (mounted) {
        final locAfter = AppLocalizations.of(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text((locAfter?.translate('template_deleted') ??
                    'Template "{name}" deleted')
                .replaceFirst('{name}', template.name)),
          ),
        );
      }
    }
  }
}

class _TemplateCard extends StatelessWidget {
  final NoteTemplate template;
  final VoidCallback onTap;
  final VoidCallback? onDelete;

  const _TemplateCard({
    required this.template,
    required this.onTap,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(AppTheme.spacingSm),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(AppTheme.radiusXl),
        border: Border.all(color: Theme.of(context).colorScheme.outline),
        boxShadow: [AppTheme.shadowSm],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          onLongPress: onDelete != null ? onDelete : null,
          borderRadius: BorderRadius.circular(AppTheme.radiusXl),
          child: Padding(
            padding: const EdgeInsets.all(AppTheme.spacingMd),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Template icon
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [AppTheme.accentColor, AppTheme.primaryDark],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  ),
                  child: Center(
                    child: Text(
                      template.icon,
                      style: const TextStyle(fontSize: 24, color: Colors.white),
                    ),
                  ),
                ),
                const SizedBox(height: AppTheme.spacingSm),
                // Template name
                Text(
                  template.name,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 16,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: AppTheme.spacingXs),
                // Template description
                Expanded(
                  child: Text(
                    template.description,
                    style: TextStyle(
                      fontSize: 14,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                // Delete button (if available)
                if (onDelete != null) ...[
                  const SizedBox(height: AppTheme.spacingSm),
                  Align(
                    alignment: Alignment.centerRight,
                    child: Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: AppTheme.errorColor,
                        borderRadius: BorderRadius.circular(AppTheme.radiusSm),
                      ),
                      child: IconButton(
                        icon: const Icon(Icons.delete_outline, size: 16),
                        onPressed: onDelete,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Dialog for entering AI template generation prompt
class _AITemplateDialog extends StatefulWidget {
  final TextEditingController promptController;
  final AppLocalizations? loc;

  const _AITemplateDialog({
    required this.promptController,
    required this.loc,
  });

  @override
  State<_AITemplateDialog> createState() => _AITemplateDialogState();
}

class _AITemplateDialogState extends State<_AITemplateDialog> {
  final List<String> _suggestions = [
    'Meeting notes with action items',
    'Weekly review and planning',
    'Book reading notes',
    'Project planning document',
    'Daily journal entry',
    'Bug report template',
    'Interview notes',
    'Travel itinerary',
  ];

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Row(
        children: [
          Icon(
            Icons.auto_awesome,
            color: AppTheme.accentColor,
          ),
          const SizedBox(width: 8),
          Text(
            widget.loc?.translate('generate_ai_template') ??
                'Generate AI Template',
          ),
        ],
      ),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.loc?.translate('describe_template') ??
                  'Describe the template you want to create:',
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: widget.promptController,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: widget.loc?.translate('ai_template_hint') ??
                    'e.g., A template for bug reports with sections for steps to reproduce, expected behavior, actual behavior, and environment details',
                border: const OutlineInputBorder(),
                alignLabelWithHint: true,
              ),
              autofocus: true,
            ),
            const SizedBox(height: 16),
            Text(
              widget.loc?.translate('suggestions') ?? 'Suggestions:',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _suggestions.map((suggestion) {
                return ActionChip(
                  label: Text(
                    suggestion,
                    style: const TextStyle(fontSize: 12),
                  ),
                  onPressed: () {
                    widget.promptController.text = suggestion;
                  },
                );
              }).toList(),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(widget.loc?.cancel ?? 'Cancel'),
        ),
        FilledButton.icon(
          onPressed: () {
            final text = widget.promptController.text.trim();
            if (text.isEmpty) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    widget.loc?.translate('please_enter_description') ??
                        'Please enter a description',
                  ),
                ),
              );
              return;
            }
            Navigator.pop(context, text);
          },
          icon: const Icon(Icons.auto_awesome, size: 18),
          label: Text(widget.loc?.translate('generate') ?? 'Generate'),
        ),
      ],
    );
  }
}
