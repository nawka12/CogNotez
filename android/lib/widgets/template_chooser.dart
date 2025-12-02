import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../models/template.dart';
import '../models/note.dart';
import '../services/template_service.dart';
import '../utils/app_theme.dart';

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
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _iconController = TextEditingController(text: '📝');
  final _contentController = TextEditingController();

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
    final name = _nameController.text.trim();
    final description = _descriptionController.text.trim();
    final icon = _iconController.text.trim();
    final content = _contentController.text;

    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a template name')),
      );
      return;
    }

    if (description.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a description')),
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Template "$name" created')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(AppTheme.radiusXl)),
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
                      'Choose Template',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        foreground: Paint()
                          ..shader = LinearGradient(
                            colors: [AppTheme.accentColor, AppTheme.primaryDark],
                          ).createShader(const Rect.fromLTWH(0.0, 0.0, 200.0, 70.0)),
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
                margin: const EdgeInsets.symmetric(horizontal: AppTheme.spacingLg),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceVariant,
                  borderRadius: BorderRadius.circular(AppTheme.radiusLg),
                  border: Border.all(color: Theme.of(context).colorScheme.outline),
                ),
                child: TabBar(
                  controller: _tabController,
                  indicator: BoxDecoration(
                    color: AppTheme.accentColor,
                    borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  ),
                  labelColor: Colors.white,
                  unselectedLabelColor: Theme.of(context).colorScheme.onSurfaceVariant,
                  indicatorSize: TabBarIndicatorSize.tab,
                  tabs: const [
                    Tab(text: 'Built-in'),
                    Tab(text: 'Custom'),
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
                  onPressed: () => setState(() => _showCustomTemplateForm = false),
                ),
                const Text(
                  'Create Custom Template',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Template Name',
                hintText: 'e.g., Weekly Review',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descriptionController,
              decoration: const InputDecoration(
                labelText: 'Description',
                hintText: 'Brief description of the template',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _iconController,
              decoration: const InputDecoration(
                labelText: 'Icon (emoji)',
                hintText: '📝',
                border: OutlineInputBorder(),
              ),
              maxLength: 2,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _contentController,
              maxLines: 10,
              decoration: const InputDecoration(
                labelText: 'Template Content',
                hintText: 'Enter the template content...',
                border: OutlineInputBorder(),
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _createCustomTemplate,
                child: const Text('Save Template'),
              ),
            ),
          ],
        ),
      );
    }

    return Column(
      children: [
        // Add custom template button
        Padding(
          padding: const EdgeInsets.all(16),
          child: SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => setState(() => _showCustomTemplateForm = true),
              icon: const Icon(Icons.add),
              label: const Text('Create Custom Template'),
            ),
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
                        'No custom templates yet',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      Text(
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
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Template'),
        content: Text('Are you sure you want to delete "${template.name}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      final templateService =
          Provider.of<TemplateService>(context, listen: false);
      await templateService.deleteCustomTemplate(template.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Template "${template.name}" deleted')),
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