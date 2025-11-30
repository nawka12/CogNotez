import 'package:flutter/material.dart';

class AppLocalizations {
  final Locale locale;

  AppLocalizations(this.locale);

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  static final Map<String, Map<String, String>> _localizedValues = {
    'en': {
      'app_title': 'CogNotez',
      'notes': 'Notes',
      'all_notes': 'All Notes',
      'untagged': 'Untagged',
      'tags': 'Tags',
      'search_notes': 'Search notes...',
      'new_note': 'New Note',
      'untitled_note': 'Untitled note...',
      'start_writing': 'Start writing your note...',
      'save': 'Save',
      'delete': 'Delete',
      'cancel': 'Cancel',
      'edit': 'Edit',
      'preview': 'Preview',
      'delete_note': 'Delete Note',
      'delete_confirmation': 'Are you sure you want to delete this note?',
      'note_saved': 'Note saved',
      'no_notes': 'No notes yet',
      'create_first_note': 'Create your first note to get started',
    },
    'es': {
      'app_title': 'CogNotez',
      'notes': 'Notas',
      'all_notes': 'Todas las Notas',
      'untagged': 'Sin Etiquetas',
      'tags': 'Etiquetas',
      'search_notes': 'Buscar notas...',
      'new_note': 'Nueva Nota',
      'untitled_note': 'Nota sin título...',
      'start_writing': 'Comienza a escribir tu nota...',
      'save': 'Guardar',
      'delete': 'Eliminar',
      'cancel': 'Cancelar',
      'edit': 'Editar',
      'preview': 'Vista Previa',
      'delete_note': 'Eliminar Nota',
      'delete_confirmation': '¿Estás seguro de que quieres eliminar esta nota?',
      'note_saved': 'Nota guardada',
      'no_notes': 'Aún no hay notas',
      'create_first_note': 'Crea tu primera nota para comenzar',
    },
    'id': {
      'app_title': 'CogNotez',
      'notes': 'Catatan',
      'all_notes': 'Semua Catatan',
      'untagged': 'Tanpa Tag',
      'tags': 'Tag',
      'search_notes': 'Cari catatan...',
      'new_note': 'Catatan Baru',
      'untitled_note': 'Catatan tanpa judul...',
      'start_writing': 'Mulai menulis catatan Anda...',
      'save': 'Simpan',
      'delete': 'Hapus',
      'cancel': 'Batal',
      'edit': 'Edit',
      'preview': 'Pratinjau',
      'delete_note': 'Hapus Catatan',
      'delete_confirmation': 'Apakah Anda yakin ingin menghapus catatan ini?',
      'note_saved': 'Catatan disimpan',
      'no_notes': 'Belum ada catatan',
      'create_first_note': 'Buat catatan pertama Anda untuk memulai',
    },
    'ja': {
      'app_title': 'CogNotez',
      'notes': 'ノート',
      'all_notes': 'すべてのノート',
      'untagged': 'タグなし',
      'tags': 'タグ',
      'search_notes': 'ノートを検索...',
      'new_note': '新しいノート',
      'untitled_note': 'タイトルなしのノート...',
      'start_writing': 'ノートを書き始めてください...',
      'save': '保存',
      'delete': '削除',
      'cancel': 'キャンセル',
      'edit': '編集',
      'preview': 'プレビュー',
      'delete_note': 'ノートを削除',
      'delete_confirmation': 'このノートを削除してもよろしいですか？',
      'note_saved': 'ノートを保存しました',
      'no_notes': 'まだノートがありません',
      'create_first_note': '最初のノートを作成して始めましょう',
    },
    'jv': {
      'app_title': 'CogNotez',
      'notes': 'Cathetan',
      'all_notes': 'Kabeh Cathetan',
      'untagged': 'Tanpa Tag',
      'tags': 'Tag',
      'search_notes': 'Goleki cathetan...',
      'new_note': 'Cathetan Anyar',
      'untitled_note': 'Cathetan tanpa irah-irahan...',
      'start_writing': 'Wiwiti nulis cathetan sampeyan...',
      'save': 'Simpen',
      'delete': 'Busek',
      'cancel': 'Batal',
      'edit': 'Sunting',
      'preview': 'Pratinjau',
      'delete_note': 'Busek Cathetan',
      'delete_confirmation': 'Sampeyan yakin arep mbusek cathetan iki?',
      'note_saved': 'Cathetan disimpen',
      'no_notes': 'Durung ana cathetan',
      'create_first_note': 'Gawe cathetan pisanan sampeyan kanggo miwiti',
    },
  };

  String translate(String key) {
    return _localizedValues[locale.languageCode]?[key] ?? _localizedValues['en']![key] ?? key;
  }

  String get appTitle => translate('app_title');
  String get notes => translate('notes');
  String get allNotes => translate('all_notes');
  String get untagged => translate('untagged');
  String get tags => translate('tags');
  String get searchNotes => translate('search_notes');
  String get newNote => translate('new_note');
  String get untitledNote => translate('untitled_note');
  String get startWriting => translate('start_writing');
  String get save => translate('save');
  String get delete => translate('delete');
  String get cancel => translate('cancel');
  String get edit => translate('edit');
  String get preview => translate('preview');
  String get deleteNote => translate('delete_note');
  String get deleteConfirmation => translate('delete_confirmation');
  String get noteSaved => translate('note_saved');
  String get noNotes => translate('no_notes');
  String get createFirstNote => translate('create_first_note');
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) {
    return ['en', 'es', 'id', 'ja', 'jv'].contains(locale.languageCode);
  }

  @override
  Future<AppLocalizations> load(Locale locale) async {
    return AppLocalizations(locale);
  }

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

