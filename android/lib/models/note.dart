class Note {
  final String id;
  String title;
  String content;
  final DateTime createdAt;
  DateTime updatedAt;
  List<String> tags;
  bool isPasswordProtected;
  String? encryptedContent;
  Map<String, dynamic>? metadata;

  Note({
    required this.id,
    required this.title,
    required this.content,
    required this.createdAt,
    required this.updatedAt,
    this.tags = const [],
    this.isPasswordProtected = false,
    this.encryptedContent,
    this.metadata,
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
      'metadata': metadata,
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
      metadata: json['metadata'] as Map<String, dynamic>?,
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
    Map<String, dynamic>? metadata,
  }) {
    return Note(
      id: id ?? this.id,
      title: title ?? this.title,
      content: content ?? this.content,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      tags: tags ?? this.tags,
      isPasswordProtected: isPasswordProtected ?? this.isPasswordProtected,
      encryptedContent: encryptedContent ?? this.encryptedContent,
      metadata: metadata ?? this.metadata,
    );
  }

  int get wordCount {
    return content.split(RegExp(r'\s+')).where((word) => word.isNotEmpty).length;
  }
}

