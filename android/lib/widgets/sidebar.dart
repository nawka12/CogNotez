import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/notes_service.dart';

class Sidebar extends StatelessWidget {
  const Sidebar({super.key});

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
                ),
                _FolderItem(
                  icon: Icons.description,
                  title: 'Untagged',
                  folderId: 'untagged',
                  count: notesService.getUntaggedNotesCount(),
                ),
                const Divider(),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                  child: Text(
                    'Tags',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.grey,
                    ),
                  ),
                ),
                ...notesService.tags.map(
                  (tag) => _FolderItem(
                    icon: Icons.label,
                    title: tag.name,
                    folderId: tag.id,
                    count: notesService.getTagNotesCount(tag.id),
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

  const _FolderItem({
    required this.icon,
    required this.title,
    required this.folderId,
    required this.count,
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
      },
    );
  }
}

