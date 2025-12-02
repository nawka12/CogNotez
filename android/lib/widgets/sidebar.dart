import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/tag.dart';
import '../services/notes_service.dart';
import '../screens/tag_management_screen.dart';

class Sidebar extends StatelessWidget {
  final VoidCallback? onFolderSelected;

  const Sidebar({super.key, this.onFolderSelected});

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
                        icon: const Icon(Icons.settings, size: 18),
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const TagManagementScreen(),
                            ),
                          );
                        },
                        tooltip: 'Manage tags',
                        visualDensity: VisualDensity.compact,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    ],
                  ),
                ),
                ...notesService.tags.map(
                  (tag) => _TagFolderItem(
                    tag: tag,
                    count: notesService.getTagNotesCount(tag.id),
                    onTap: onFolderSelected,
                  ),
                ),
              ],
            ),
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

  const _FolderItem({
    required this.icon,
    required this.title,
    required this.folderId,
    required this.count,
    this.onTap,
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
    );
  }
}

class _TagFolderItem extends StatelessWidget {
  final Tag tag;
  final int count;
  final VoidCallback? onTap;

  const _TagFolderItem({
    required this.tag,
    required this.count,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final notesService = Provider.of<NotesService>(context);
    final isSelected = notesService.selectedFolder == tag.id;
    final tagColor = tag.color != null
        ? Color(int.parse(tag.color!.replaceFirst('#', '0xFF')))
        : Theme.of(context).colorScheme.primary;

    return ListTile(
      leading: Icon(
        Icons.label,
        size: 20,
        color: tagColor,
      ),
      title: Text(tag.name),
      trailing: Text(
        count.toString(),
        style: TextStyle(
          color: Colors.grey[600],
          fontSize: 12,
        ),
      ),
      selected: isSelected,
      onTap: () {
        notesService.setSelectedFolder(tag.id);
        onTap?.call();
      },
    );
  }
}

