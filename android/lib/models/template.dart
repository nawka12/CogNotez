class NoteTemplate {
  final String id;
  final String name;
  final String description;
  final String icon;
  final String content;
  final bool isDefault;
  final DateTime? createdAt;

  const NoteTemplate({
    required this.id,
    required this.name,
    required this.description,
    required this.icon,
    required this.content,
    this.isDefault = false,
    this.createdAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'icon': icon,
      'content': content,
      'is_default': isDefault,
      'created_at': createdAt?.toIso8601String(),
    };
  }

  factory NoteTemplate.fromJson(Map<String, dynamic> json) {
    return NoteTemplate(
      id: json['id'] as String,
      name: json['name'] as String,
      description: json['description'] as String? ?? '',
      icon: json['icon'] as String? ?? '📝',
      content: json['content'] as String,
      isDefault: json['is_default'] as bool? ?? false,
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'] as String)
          : null,
    );
  }

  NoteTemplate copyWith({
    String? id,
    String? name,
    String? description,
    String? icon,
    String? content,
    bool? isDefault,
    DateTime? createdAt,
  }) {
    return NoteTemplate(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      icon: icon ?? this.icon,
      content: content ?? this.content,
      isDefault: isDefault ?? this.isDefault,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}