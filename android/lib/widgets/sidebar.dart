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

    return Container(
      width: isMobile ? double.infinity : 250,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: isMobile ? null : Border(right: BorderSide(color: Theme.of(context).colorScheme.outline)),
      ),
      child: Column(
        children: [
          // Sidebar header - mobile adapted
          Container(
            padding: EdgeInsets.all(isMobile ? AppTheme.spacingMd : AppTheme.spacingLg),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceVariant,
              border: isMobile ? null : Border(bottom: BorderSide(color: Theme.of(context).colorScheme.outline)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  AppLocalizations.of(context)?.notes ?? 'Notes',
                  style: TextStyle(
                    fontSize: isMobile ? 16 : 18,
                    fontWeight: FontWeight.bold,
                    color: Theme.of(context).colorScheme.onSurface,
                  ),
                ),
                if (onFolderSelected != null && !isMobile)
                  IconButton(
                    icon: const Icon(Icons.chevron_left, size: 20),
                    onPressed: onFolderSelected,
                    tooltip: AppLocalizations.of(context)?.collapseSidebar ?? 'Collapse sidebar',
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
              ],
            ),
          ),
          // Folder navigation
          Expanded(
            child: ListView(
              padding: EdgeInsets.zero,
              children: [
                // All Notes folder
                _FolderItem(
                  icon: Icons.folder,
                  title: AppLocalizations.of(context)?.allNotes ?? 'All Notes',
                  folderId: 'all',
                  count: notesService.getTotalNotesCount(),
                  onTap: onFolderSelected,
                ),
                // Untagged folder
                _FolderItem(
                  icon: Icons.description,
                  title: AppLocalizations.of(context)?.untagged ?? 'Untagged',
                  folderId: 'untagged',
                  count: notesService.getUntaggedNotesCount(),
                  onTap: onFolderSelected,
                ),
                // Tags section divider
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppTheme.spacingMd, vertical: AppTheme.spacingSm),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        AppLocalizations.of(context)?.tags ?? 'Tags',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                          letterSpacing: 0.5,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.settings, size: 16),
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => const TagManagementScreen(),
                            ),
                          );
                        },
                        tooltip: AppLocalizations.of(context)?.manageTags ?? 'Manage tags',
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    ],
                  ),
                ),
                // Tag folders
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
    final isMobile = MediaQuery.of(context).size.width < 600;

    return Container(
      margin: EdgeInsets.symmetric(
        horizontal: isMobile ? AppTheme.spacingXs : AppTheme.spacingSm,
        vertical: AppTheme.spacingXs,
      ),
      decoration: BoxDecoration(
        color: isSelected ? AppTheme.accentLight : Colors.transparent,
        borderRadius: BorderRadius.circular(isMobile ? AppTheme.radiusSm : AppTheme.radiusMd),
        border: Border.all(
          color: isSelected ? AppTheme.accentColor : Colors.transparent,
          width: isSelected ? 1 : 0,
        ),
      ),
      child: ListTile(
        leading: Icon(
          icon,
          size: isMobile ? 16 : 18,
          color: isSelected ? AppTheme.accentColor : Theme.of(context).colorScheme.onSurfaceVariant,
        ),
        title: Text(
          title,
          style: TextStyle(
            fontSize: isMobile ? 13 : 14,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
            color: isSelected ? AppTheme.accentColor : Theme.of(context).colorScheme.onSurface,
          ),
        ),
        trailing: Container(
          padding: EdgeInsets.symmetric(
            horizontal: isMobile ? AppTheme.spacingXs : AppTheme.spacingXs,
            vertical: isMobile ? AppTheme.spacingXs : AppTheme.spacingXs,
          ),
          decoration: BoxDecoration(
            color: isSelected ? AppTheme.accentColor : Theme.of(context).colorScheme.surfaceVariant,
            borderRadius: BorderRadius.circular(isMobile ? AppTheme.radiusXs : AppTheme.radiusSm),
          ),
          child: Text(
            count.toString(),
            style: TextStyle(
              color: isSelected ? Colors.white : Theme.of(context).colorScheme.onSurfaceVariant,
              fontSize: isMobile ? 10 : 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        selected: isSelected,
        onTap: () {
          notesService.setSelectedFolder(folderId);
          onTap?.call();
        },
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(isMobile ? AppTheme.radiusSm : AppTheme.radiusMd),
        ),
      ),
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
        : AppTheme.accentColor;
    final isMobile = MediaQuery.of(context).size.width < 600;

    return Container(
      margin: EdgeInsets.symmetric(
        horizontal: isMobile ? AppTheme.spacingXs : AppTheme.spacingSm,
        vertical: AppTheme.spacingXs,
      ),
      decoration: BoxDecoration(
        color: isSelected ? AppTheme.accentLight : Colors.transparent,
        borderRadius: BorderRadius.circular(isMobile ? AppTheme.radiusSm : AppTheme.radiusMd),
        border: Border.all(
          color: isSelected ? AppTheme.accentColor : Colors.transparent,
          width: isSelected ? 1 : 0,
        ),
      ),
      child: ListTile(
        leading: Container(
          width: isMobile ? 6 : 8,
          height: isMobile ? 6 : 8,
          decoration: BoxDecoration(
            color: tagColor,
            borderRadius: BorderRadius.circular(AppTheme.radiusFull),
          ),
        ),
        title: Text(
          tag.name,
          style: TextStyle(
            fontSize: isMobile ? 13 : 14,
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
            color: isSelected ? AppTheme.accentColor : Theme.of(context).colorScheme.onSurface,
          ),
        ),
        trailing: Container(
          padding: EdgeInsets.symmetric(
            horizontal: isMobile ? AppTheme.spacingXs : AppTheme.spacingXs,
            vertical: isMobile ? AppTheme.spacingXs : AppTheme.spacingXs,
          ),
          decoration: BoxDecoration(
            color: isSelected ? AppTheme.accentColor : Theme.of(context).colorScheme.surfaceVariant,
            borderRadius: BorderRadius.circular(isMobile ? AppTheme.radiusXs : AppTheme.radiusSm),
          ),
          child: Text(
            count.toString(),
            style: TextStyle(
              color: isSelected ? Colors.white : Theme.of(context).colorScheme.onSurfaceVariant,
              fontSize: isMobile ? 10 : 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        selected: isSelected,
        onTap: () {
          notesService.setSelectedFolder(tag.id);
          onTap?.call();
        },
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(isMobile ? AppTheme.radiusSm : AppTheme.radiusMd),
        ),
      ),
    );
  }
}
