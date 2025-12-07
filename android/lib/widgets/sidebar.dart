import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/tag.dart';
import '../services/notes_service.dart';
import '../screens/tag_management_screen.dart';
import '../utils/app_theme.dart';
import '../l10n/app_localizations.dart';

class Sidebar extends StatelessWidget {
  final VoidCallback? onFolderSelected;

  const Sidebar({super.key, this.onFolderSelected});

  @override
  Widget build(BuildContext context) {
    final notesService = Provider.of<NotesService>(context);
    final isMobile = MediaQuery.of(context).size.width < 600;
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      width: isMobile ? double.infinity : 280,
      decoration: BoxDecoration(
        color: colorScheme.surface,
        border: isMobile
            ? null
            : Border(right: BorderSide(color: colorScheme.outlineVariant)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Premium Header
          Container(
            padding: EdgeInsets.fromLTRB(
              AppTheme.spacingLg,
              AppTheme
                  .spacingXl, // Extra top padding for mobile status bar area
              AppTheme.spacingLg,
              AppTheme.spacingLg,
            ),
            decoration: BoxDecoration(
              color: colorScheme.surface,
              border: Border(
                  bottom: BorderSide(
                      color:
                          colorScheme.outlineVariant.withValues(alpha: 0.5))),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryColor.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    Icons.edit_note_rounded,
                    color: AppTheme.primaryColor,
                    size: 28,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'CogNotez',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: colorScheme.onSurface,
                          letterSpacing: 0.5,
                        ),
                      ),
                      Text(
                        AppLocalizations.of(context)?.notes ?? 'Your Notes',
                        style: TextStyle(
                          fontSize: 12,
                          color: colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                if (onFolderSelected != null && !isMobile) ...[
                  IconButton(
                    icon: Icon(Icons.chevron_left,
                        color: colorScheme.onSurfaceVariant),
                    onPressed: onFolderSelected,
                    tooltip: AppLocalizations.of(context)?.collapseSidebar ??
                        'Collapse',
                  ),
                ],
              ],
            ),
          ),

          // Scrollable Content
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(
                  vertical: AppTheme.spacingMd, horizontal: AppTheme.spacingSm),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Folders Section
                  _SectionHeader(
                      title:
                          AppLocalizations.of(context)?.folders ?? 'Folders'),
                  const SizedBox(height: 4),
                  _FolderItem(
                    icon: Icons.all_inbox_rounded,
                    title:
                        AppLocalizations.of(context)?.allNotes ?? 'All Notes',
                    folderId: 'all',
                    count: notesService.getTotalNotesCount(),
                    onTap: onFolderSelected,
                  ),
                  _FolderItem(
                    icon: Icons.question_mark_rounded,
                    title: AppLocalizations.of(context)?.untagged ?? 'Untagged',
                    folderId: 'untagged',
                    count: notesService.getUntaggedNotesCount(),
                    onTap: onFolderSelected,
                  ),

                  const SizedBox(height: 24),
                  const Divider(height: 1, indent: 16, endIndent: 16),
                  const SizedBox(height: 24),

                  // Tags Section
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _SectionHeader(
                          title: AppLocalizations.of(context)?.tags ?? 'Tags'),
                      IconButton(
                        icon: const Icon(Icons.settings_outlined, size: 18),
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const TagManagementScreen(),
                            ),
                          );
                        },
                        style: IconButton.styleFrom(
                          foregroundColor: colorScheme.onSurfaceVariant,
                          padding: const EdgeInsets.all(8),
                          minimumSize: const Size(0, 0),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        tooltip: AppLocalizations.of(context)?.manageTags ??
                            'Manage',
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  if (notesService.tags.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      child: Text(
                        'No tags created yet.',
                        style: TextStyle(
                          color: colorScheme.onSurfaceVariant
                              .withValues(alpha: 0.7),
                          fontSize: 13,
                          fontStyle: FontStyle.italic,
                        ),
                      ),
                    )
                  else
                    ...notesService.tags.map(
                      (tag) => _TagItem(
                        tag: tag,
                        count: notesService.getTagNotesCount(tag.id),
                        onTap: onFolderSelected,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;

  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.bold,
          color: Theme.of(context).colorScheme.primary,
          letterSpacing: 1.2,
        ),
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
    final colorScheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            notesService.setSelectedFolder(folderId);
            onTap?.call();
          },
          borderRadius: BorderRadius.circular(50), // Pill shape
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: isSelected
                  ? AppTheme.primaryColor.withValues(alpha: 0.15)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(50),
            ),
            child: Row(
              children: [
                Icon(
                  icon,
                  size: 22,
                  color: isSelected
                      ? AppTheme.primaryColor
                      : colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Text(
                    title,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight:
                          isSelected ? FontWeight.w600 : FontWeight.w500,
                      color: isSelected
                          ? AppTheme.primaryColor
                          : colorScheme.onSurface,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (count > 0)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppTheme.primaryColor
                          : colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      count > 99 ? '99+' : count.toString(),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: isSelected
                            ? Colors.white
                            : colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TagItem extends StatelessWidget {
  final Tag tag;
  final int count;
  final VoidCallback? onTap;

  const _TagItem({
    required this.tag,
    required this.count,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final notesService = Provider.of<NotesService>(context);
    final isSelected = notesService.selectedFolder == tag.id;
    final colorScheme = Theme.of(context).colorScheme;

    // Parse color safely
    Color tagColor;
    try {
      tagColor = tag.color != null
          ? Color(int.parse(tag.color!.replaceFirst('#', '0xFF')))
          : AppTheme.accentColor;
    } catch (_) {
      tagColor = AppTheme.accentColor;
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            notesService.setSelectedFolder(tag.id);
            onTap?.call();
          },
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: isSelected
                  ? tagColor.withValues(alpha: 0.1)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              border: isSelected
                  ? Border.all(color: tagColor.withValues(alpha: 0.3), width: 1)
                  : null,
            ),
            child: Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: tagColor,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: tagColor.withValues(alpha: 0.4),
                        blurRadius: 4,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Text(
                    tag.name,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight:
                          isSelected ? FontWeight.w600 : FontWeight.normal,
                      color: isSelected
                          ? colorScheme.onSurface
                          : colorScheme.onSurfaceVariant,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (count > 0)
                  Text(
                    count.toString(),
                    style: TextStyle(
                      fontSize: 12,
                      color:
                          colorScheme.onSurfaceVariant.withValues(alpha: 0.7),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
