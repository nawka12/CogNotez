import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../models/tag.dart';
import '../services/notes_service.dart';

class TagManagementScreen extends StatefulWidget {
  const TagManagementScreen({super.key});

  @override
  State<TagManagementScreen> createState() => _TagManagementScreenState();
}

class _TagManagementScreenState extends State<TagManagementScreen> {
  // Predefined color options for tags
  static const List<Color> tagColors = [
    Colors.red,
    Colors.pink,
    Colors.purple,
    Colors.deepPurple,
    Colors.indigo,
    Colors.blue,
    Colors.lightBlue,
    Colors.cyan,
    Colors.teal,
    Colors.green,
    Colors.lightGreen,
    Colors.lime,
    Colors.yellow,
    Colors.amber,
    Colors.orange,
    Colors.deepOrange,
    Colors.brown,
    Colors.grey,
    Colors.blueGrey,
  ];

  @override
  Widget build(BuildContext context) {
    final notesService = Provider.of<NotesService>(context);
    final tags = notesService.tags;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Manage Tags'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showCreateTagDialog(context),
            tooltip: 'Create new tag',
          ),
        ],
      ),
      body: tags.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.label_outline,
                    size: 64,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No tags yet',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Create tags to organize your notes',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                  ),
                  const SizedBox(height: 24),
                  FilledButton.icon(
                    onPressed: () => _showCreateTagDialog(context),
                    icon: const Icon(Icons.add),
                    label: const Text('Create Tag'),
                  ),
                ],
              ),
            )
          : ListView.builder(
              itemCount: tags.length,
              itemBuilder: (context, index) {
                final tag = tags[index];
                final noteCount = notesService.getTagNotesCount(tag.id);
                final tagColor = tag.color != null
                    ? Color(int.parse(tag.color!.replaceFirst('#', '0xFF')))
                    : Theme.of(context).colorScheme.primary;

                return ListTile(
                  leading: CircleAvatar(
                    backgroundColor: tagColor.withOpacity(0.2),
                    child: Icon(Icons.label, color: tagColor),
                  ),
                  title: Text(tag.name),
                  subtitle: Text(
                    '$noteCount ${noteCount == 1 ? 'note' : 'notes'}',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  trailing: PopupMenuButton<String>(
                    onSelected: (value) {
                      switch (value) {
                        case 'edit':
                          _showEditTagDialog(context, tag);
                          break;
                        case 'delete':
                          _showDeleteTagDialog(context, tag, noteCount);
                          break;
                      }
                    },
                    itemBuilder: (context) => [
                      const PopupMenuItem(
                        value: 'edit',
                        child: Row(
                          children: [
                            Icon(Icons.edit),
                            SizedBox(width: 8),
                            Text('Edit'),
                          ],
                        ),
                      ),
                      const PopupMenuItem(
                        value: 'delete',
                        child: Row(
                          children: [
                            Icon(Icons.delete, color: Colors.red),
                            SizedBox(width: 8),
                            Text('Delete', style: TextStyle(color: Colors.red)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  onTap: () => _showEditTagDialog(context, tag),
                );
              },
            ),
      floatingActionButton: tags.isNotEmpty
          ? FloatingActionButton(
              onPressed: () => _showCreateTagDialog(context),
              child: const Icon(Icons.add),
            )
          : null,
    );
  }

  void _showCreateTagDialog(BuildContext context) {
    final textController = TextEditingController();
    Color? selectedColor;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Create Tag'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: textController,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Tag name',
                  hintText: 'Enter tag name',
                ),
              ),
              const SizedBox(height: 16),
              const Text('Color (optional)'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  // No color option
                  GestureDetector(
                    onTap: () => setState(() => selectedColor = null),
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: selectedColor == null
                              ? Theme.of(context).colorScheme.primary
                              : Colors.grey,
                          width: selectedColor == null ? 3 : 1,
                        ),
                      ),
                      child: const Icon(Icons.block, size: 20, color: Colors.grey),
                    ),
                  ),
                  // Color options
                  ...tagColors.map((color) => GestureDetector(
                        onTap: () => setState(() => selectedColor = color),
                        child: Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: color,
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: selectedColor == color
                                  ? Theme.of(context).colorScheme.onSurface
                                  : Colors.transparent,
                              width: 3,
                            ),
                          ),
                          child: selectedColor == color
                              ? const Icon(Icons.check, color: Colors.white, size: 20)
                              : null,
                        ),
                      )),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                final name = textController.text.trim();
                if (name.isNotEmpty) {
                  final notesService = Provider.of<NotesService>(context, listen: false);
                  final tag = Tag(
                    id: const Uuid().v4(),
                    name: name,
                    color: selectedColor != null
                        ? '#${selectedColor!.value.toRadixString(16).substring(2)}'
                        : null,
                    createdAt: DateTime.now(),
                  );
                  await notesService.createTag(tag);
                  if (context.mounted) {
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Tag "$name" created')),
                    );
                  }
                }
              },
              child: const Text('Create'),
            ),
          ],
        ),
      ),
    );
  }

  void _showEditTagDialog(BuildContext context, Tag tag) {
    final textController = TextEditingController(text: tag.name);
    Color? selectedColor = tag.color != null
        ? Color(int.parse(tag.color!.replaceFirst('#', '0xFF')))
        : null;

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Edit Tag'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: textController,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Tag name',
                  hintText: 'Enter tag name',
                ),
              ),
              const SizedBox(height: 16),
              const Text('Color (optional)'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  // No color option
                  GestureDetector(
                    onTap: () => setState(() => selectedColor = null),
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: selectedColor == null
                              ? Theme.of(context).colorScheme.primary
                              : Colors.grey,
                          width: selectedColor == null ? 3 : 1,
                        ),
                      ),
                      child: const Icon(Icons.block, size: 20, color: Colors.grey),
                    ),
                  ),
                  // Color options
                  ...tagColors.map((color) {
                    final isSelected = selectedColor != null &&
                        (selectedColor!.value & 0xFFFFFF) == (color.value & 0xFFFFFF);
                    return GestureDetector(
                      onTap: () => setState(() => selectedColor = color),
                      child: Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: color,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: isSelected
                                ? Theme.of(context).colorScheme.onSurface
                                : Colors.transparent,
                            width: 3,
                          ),
                        ),
                        child: isSelected
                            ? const Icon(Icons.check, color: Colors.white, size: 20)
                            : null,
                      ),
                    );
                  }),
                ],
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                final name = textController.text.trim();
                if (name.isNotEmpty) {
                  final notesService = Provider.of<NotesService>(context, listen: false);
                  final updatedTag = tag.copyWith(
                    name: name,
                    color: selectedColor != null
                        ? '#${selectedColor!.value.toRadixString(16).substring(2)}'
                        : null,
                  );
                  await notesService.updateTag(updatedTag);
                  if (context.mounted) {
                    Navigator.pop(context);
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Tag "$name" updated')),
                    );
                  }
                }
              },
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
  }

  void _showDeleteTagDialog(BuildContext context, Tag tag, int noteCount) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Tag'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Are you sure you want to delete "${tag.name}"?'),
            const SizedBox(height: 8),
            if (noteCount > 0)
              Text(
                'This tag is used by $noteCount ${noteCount == 1 ? 'note' : 'notes'}. '
                'The notes will not be deleted, only the tag will be removed from them.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.error,
                    ),
              )
            else
              Text(
                'This tag is not used by any notes.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () async {
              final notesService = Provider.of<NotesService>(context, listen: false);
              await notesService.deleteTag(tag.id);
              if (context.mounted) {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Tag "${tag.name}" deleted')),
                );
              }
            },
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}