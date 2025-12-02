class AppSettings {
  String theme; // 'light', 'dark', 'system'
  String language; // 'en', 'es', 'id', 'ja', 'jv'
  String aiBackend; // 'ollama', 'openrouter'
  String ollamaEndpoint;
  String ollamaModel;
  String? openRouterApiKey;
  String? openRouterModel;
  bool googleDriveSyncEnabled;
  bool autoSync;
  int syncInterval; // in milliseconds
  bool e2eeEnabled; // End-to-end encryption for cloud sync
  String? e2eeSalt; // Deterministic salt derived from passphrase

  AppSettings({
    this.theme = 'system',
    this.language = 'en',
    this.aiBackend = 'ollama',
    this.ollamaEndpoint = 'http://localhost:11434',
    this.ollamaModel = 'llama3.2:latest',
    this.openRouterApiKey,
    this.openRouterModel = 'openai/gpt-4o-mini',
    this.googleDriveSyncEnabled = false,
    this.autoSync = false,
    this.syncInterval = 300000, // 5 minutes
    this.e2eeEnabled = false,
    this.e2eeSalt,
  });

  Map<String, dynamic> toJson() {
    return {
      'theme': theme,
      'language': language,
      'ai_backend': aiBackend,
      'ollama_endpoint': ollamaEndpoint,
      'ollama_model': ollamaModel,
      'openrouter_api_key': openRouterApiKey,
      'openrouter_model': openRouterModel,
      'google_drive_sync_enabled': googleDriveSyncEnabled,
      'auto_sync': autoSync,
      'sync_interval': syncInterval,
      'e2ee_enabled': e2eeEnabled,
      'e2ee_salt': e2eeSalt,
    };
  }

  factory AppSettings.fromJson(Map<String, dynamic> json) {
    return AppSettings(
      theme: json['theme'] as String? ?? 'system',
      language: json['language'] as String? ?? 'en',
      aiBackend: json['ai_backend'] as String? ?? 'ollama',
      ollamaEndpoint: json['ollama_endpoint'] as String? ?? 'http://localhost:11434',
      ollamaModel: json['ollama_model'] as String? ?? 'llama3.2:latest',
      openRouterApiKey: json['openrouter_api_key'] as String?,
      openRouterModel: json['openrouter_model'] as String? ?? 'openai/gpt-4o-mini',
      googleDriveSyncEnabled: json['google_drive_sync_enabled'] as bool? ?? false,
      autoSync: json['auto_sync'] as bool? ?? false,
      syncInterval: json['sync_interval'] as int? ?? 300000,
      e2eeEnabled: json['e2ee_enabled'] as bool? ?? false,
      e2eeSalt: json['e2ee_salt'] as String?,
    );
  }

  AppSettings copyWith({
    String? theme,
    String? language,
    String? aiBackend,
    String? ollamaEndpoint,
    String? ollamaModel,
    String? openRouterApiKey,
    String? openRouterModel,
    bool? googleDriveSyncEnabled,
    bool? autoSync,
    int? syncInterval,
    bool? e2eeEnabled,
    String? e2eeSalt,
  }) {
    return AppSettings(
      theme: theme ?? this.theme,
      language: language ?? this.language,
      aiBackend: aiBackend ?? this.aiBackend,
      ollamaEndpoint: ollamaEndpoint ?? this.ollamaEndpoint,
      ollamaModel: ollamaModel ?? this.ollamaModel,
      openRouterApiKey: openRouterApiKey ?? this.openRouterApiKey,
      openRouterModel: openRouterModel ?? this.openRouterModel,
      googleDriveSyncEnabled: googleDriveSyncEnabled ?? this.googleDriveSyncEnabled,
      autoSync: autoSync ?? this.autoSync,
      syncInterval: syncInterval ?? this.syncInterval,
      e2eeEnabled: e2eeEnabled ?? this.e2eeEnabled,
      e2eeSalt: e2eeSalt ?? this.e2eeSalt,
    );
  }
}

