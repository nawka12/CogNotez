import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/note.dart';
import '../models/tag.dart';
import '../services/notes_service.dart';
import '../screens/note_editor_screen.dart';
import '../utils/date_formatter.dart';

class NotesList extends StatelessWidget {
  const NotesList({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<NotesService>(
      builder: (context, notesService, _) {
        if (notesService.notes.isEmpty) {
          return _buildEmptyState(context, notesService);
        }

        return RefreshIndicator(
          onRefresh: () async {
            await notesService.loadNotes();
          },
          child: ListView.builder(
            itemCount: notesService.notes.length,
            itemBuilder: (context, index) {
              final note = notesService.notes[index];
              return _NoteListItem(note: note);
            },
          ),
        );
      },
    );
  }

  Widget _buildEmptyState(BuildContext context, NotesService notesService) {
    final selectedFolder = notesService.selectedFolder;
    final searchQuery = notesService.searchQuery;
    
    // Determine empty state message based on context
    String title;
    String message;
    IconData icon;
    
    if (searchQuery.isNotEmpty) {
      title = 'No notes found';
      message = 'No notes match your search "$searchQuery"';
      icon = Icons.search_off;
    } else if (selectedFolder == 'all') {
      if (notesService.allNotes.isEmpty) {
        title = 'No notes yet';
        message = 'Create your first note to get started';
        icon = Icons.note_add_outlined;
      } else {
        // This shouldn't happen, but handle it gracefully
        title = 'No notes';
        message = 'No notes to display';
        icon = Icons.note_add_outlined;
      }
    } else if (selectedFolder == 'untagged') {
      title = 'No untagged notes';
      message = 'All your notes have tags';
      icon = Icons.description_outlined;
    } else {
      // Find the tag by ID
      try {
        final tag = notesService.tags.firstWhere((t) => t.id == selectedFolder);
        title = 'No notes with this tag';
        message = 'No notes are tagged with "${tag.name}"';
        icon = Icons.label_outline;
      } catch (e) {
        title = 'No notes';
        message = 'No notes found for this folder';
        icon = Icons.folder_outlined;
      }
    }
    
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 96,
              color: Theme.of(context).colorScheme.primary.withOpacity(0.3),
            ),
            const SizedBox(height: 24),
            Text(
              title,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                color: Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Colors.grey[500],
              ),
            ),
            if (notesService.allNotes.isEmpty) ...[
              const SizedBox(height: 32),
              FilledButton.icon(
                onPressed: () {
                  // The home screen will handle note creation
                  // This is just a visual placeholder
                },
                icon: const Icon(Icons.add),
                label: const Text('Create Note'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _NoteListItem extends StatelessWidget {
  final Note note;

  const _NoteListItem({required this.note});

  @override
  Widget build(BuildContext context) {
    final preview = note.content.length > 100
        ? '${note.content.substring(0, 100)}...'
        : note.content;

    return Dismissible(
      key: Key(note.id),
      background: Container(
        color: Colors.red,
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.only(left: 20),
        child: const Icon(Icons.delete, color: Colors.white),
      ),
      secondaryBackground: Container(
        color: Colors.orange,
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        child: const Icon(Icons.archive, color: Colors.white),
      ),
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          final result = await _showDeleteDialog(context);
          if (result == true) {
            // Note is deleted in the dialog handler
            return true;
          }
          return false;
        } else {
          // Archive functionality - for now just show a message
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Archive feature coming soon')),
          );
          return false;
        }
      },
      onDismissed: (direction) {
        // Delete is handled in confirmDismiss
      },
      child: Card(
        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: ListTile(
          title: Text(
            note.title.isEmpty ? 'Untitled' : note.title,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 4),
              Text(
                preview,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: Colors.grey[600],
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  Text(
                    DateFormatter.format(note.updatedAt),
                    style: TextStyle(
                      color: Colors.grey[500],
                      fontSize: 12,
                    ),
                  ),
                  if (note.tags.isNotEmpty) ...[
                    const SizedBox(width: 8),
                    Wrap(
                      spacing: 4,
                      children: note.tags.take(3).map((tag) {
                        return Chip(
                          label: Text(
                            tag,
                            style: const TextStyle(fontSize: 10),
                          ),
                          padding: EdgeInsets.zero,
                          visualDensity: VisualDensity.compact,
                          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        );
                      }).toList(),
                    ),
                  ],
                ],
              ),
            ],
          ),
          trailing: note.isPasswordProtected
              ? const Icon(Icons.lock, size: 16, color: Colors.grey)
              : null,
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (context) => NoteEditorScreen(note: note, isNew: false),
              ),
            );
          },
          onLongPress: () async {
            await _showDeleteDialog(context);
          },
        ),
      ),
    );
  }

  Future<bool> _showDeleteDialog(BuildContext context) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Note'),
        content: const Text('Are you sure you want to delete this note?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context, true);
            },
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    
    if (result == true) {
      final notesService = Provider.of<NotesService>(context, listen: false);
      notesService.deleteNote(note.id);
      return true;
    }
    
    return false;
  }
}

