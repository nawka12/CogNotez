class Note {
  final String id;
  String title;
  String content;
  final DateTime createdAt;
  DateTime updatedAt;
  List<String> tags;
  bool isPasswordProtected;
  String? encryptedContent;
  String? encryptionSalt;
  String? encryptionIv;
  Map<String, dynamic>? metadata;
  bool isPinned;
  bool isFavorite;
  int wordCount;
  int charCount;
  Map<String, dynamic>? collaboration;

  Note({
    required this.id,
    required this.title,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
    this.tags = const [],
    this.isPasswordProtected = false,
    this.encryptedContent,
    this.encryptionSalt,
    this.encryptionIv,
    this.metadata,
    this.isPinned = false,
    this.isFavorite = false,
    this.wordCount = 0,
    this.charCount = 0,
    this.collaboration,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'content': content,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
      'tags': tags,
      'is_password_protected': isPasswordProtected,
      'encrypted_content': encryptedContent,
      'encryption_salt': encryptionSalt,
      'encryption_iv': encryptionIv,
      'metadata': metadata,
      'is_pinned': isPinned,
      'is_favorite': isFavorite,
      'word_count': wordCount,
      'char_count': charCount,
      'collaboration': collaboration,
    };
  }

  factory Note.fromJson(Map<String, dynamic> json) {
    return Note(
      id: json['id'] as String,
      title: json['title'] as String,
      content: json['content'] as String? ?? '',
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: DateTime.parse(json['updated_at'] as String),
      tags: List<String>.from(json['tags'] as List? ?? []),
      isPasswordProtected: json['is_password_protected'] as bool? ?? false,
      encryptedContent: json['encrypted_content'] as String?,
      encryptionSalt: json['encryption_salt'] as String?,
      encryptionIv: json['encryption_iv'] as String?,
      metadata: json['metadata'] as Map<String, dynamic>?,
      isPinned: json['is_pinned'] as bool? ?? false,
      isFavorite: json['is_favorite'] as bool? ?? false,
      wordCount: json['word_count'] as int? ?? 0,
      charCount: json['char_count'] as int? ?? 0,
      collaboration: json['collaboration'] as Map<String, dynamic>?,
    );
  }

  Note copyWith({
    String? id,
    String? title,
    String? content,
    DateTime? createdAt,
    DateTime? updatedAt,
    List<String>? tags,
    bool? isPasswordProtected,
    String? encryptedContent,
    String? encryptionSalt,
    String? encryptionIv,
    Map<String, dynamic>? metadata,
    bool? isPinned,
    bool? isFavorite,
    int? wordCount,
    int? charCount,
    Map<String, dynamic>? collaboration,
    bool clearEncryption = false,
  }) {
    return Note(
      id: id ?? this.id,
      title: title ?? this.title,
      content: content ?? this.content,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      tags: tags ?? this.tags,
      isPasswordProtected: isPasswordProtected ?? this.isPasswordProtected,
      encryptedContent: clearEncryption ? null : (encryptedContent ?? this.encryptedContent),
      encryptionSalt: clearEncryption ? null : (encryptionSalt ?? this.encryptionSalt),
      encryptionIv: clearEncryption ? null : (encryptionIv ?? this.encryptionIv),
      metadata: metadata ?? this.metadata,
      isPinned: isPinned ?? this.isPinned,
      isFavorite: isFavorite ?? this.isFavorite,
      wordCount: wordCount ?? this.wordCount,
      charCount: charCount ?? this.charCount,
      collaboration: collaboration ?? this.collaboration,
    );
  }

  // Deprecated: use stored property wordCount instead, or keep as fallback
  // int get wordCount {
  //   return content.split(RegExp(r'\s+')).where((word) => word.isNotEmpty).length;
  // }

  bool get isLocked => isPasswordProtected && encryptedContent != null && content.isEmpty;
}

