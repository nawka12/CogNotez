import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:uuid/uuid.dart';
import '../models/tag.dart';
import '../services/notes_service.dart';

class Sidebar extends StatelessWidget {
  final VoidCallback? onFolderSelected;

  const Sidebar({super.key, this.onFolderSelected});

  void _showCreateTagDialog(BuildContext context) {
    final textController = TextEditingController();
    
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Create Tag'),
        content: TextField(
          controller: textController,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Tag name',
            hintText: 'Enter tag name',
          ),
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
                  createdAt: DateTime.now(),
                );
                await notesService.createTag(tag);
                if (context.mounted) {
                  Navigator.pop(context);
                }
              }
            },
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final notesService = Provider.of<NotesService>(context);

    return Container(
      width: 250,
      color: Theme.of(context).colorScheme.surface,
      child: Column(
        children: [
          const Padding(
            padding: EdgeInsets.all(16.0),
            child: Text(
              'Notes',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const Divider(),
          Expanded(
            child: ListView(
              children: [
                _FolderItem(
                  icon: Icons.folder,
                  title: 'All Notes',
                  folderId: 'all',
                  count: notesService.getTotalNotesCount(),
                  onTap: onFolderSelected,
                ),
                _FolderItem(
                  icon: Icons.description,
                  title: 'Untagged',
                  folderId: 'untagged',
                  count: notesService.getUntaggedNotesCount(),
                  onTap: onFolderSelected,
                ),
                const Divider(),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Tags',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Colors.grey,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.add, size: 18),
                        onPressed: () => _showCreateTagDialog(context),
                        tooltip: 'Create tag',
                        visualDensity: VisualDensity.compact,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    ],
                  ),
                ),
                ...notesService.tags.map(
                  (tag) => _FolderItem(
                    icon: Icons.label,
                    title: tag.name,
                    folderId: tag.id,
                    count: notesService.getTagNotesCount(tag.id),
                    onTap: onFolderSelected,
                    onLongPress: () => _showDeleteTagDialog(context, tag),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showDeleteTagDialog(BuildContext context, Tag tag) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Tag'),
        content: Text('Are you sure you want to delete "${tag.name}"? This will not delete any notes.'),
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
              }
            },
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }
}

class _FolderItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final String folderId;
  final int count;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  const _FolderItem({
    required this.icon,
    required this.title,
    required this.folderId,
    required this.count,
    this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final notesService = Provider.of<NotesService>(context);
    final isSelected = notesService.selectedFolder == folderId;

    return ListTile(
      leading: Icon(icon, size: 20),
      title: Text(title),
      trailing: Text(
        count.toString(),
        style: TextStyle(
          color: Colors.grey[600],
          fontSize: 12,
        ),
      ),
      selected: isSelected,
      onTap: () {
        notesService.setSelectedFolder(folderId);
        onTap?.call();
      },
      onLongPress: onLongPress,
    );
  }
}

