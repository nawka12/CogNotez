import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as path;

/// Media file reference containing metadata
class MediaFile {
  final String id;
  final String name;
  final String mimeType;
  final int size;
  final String localPath;
  final DateTime createdAt;

  MediaFile({
    required this.id,
    required this.name,
    required this.mimeType,
    required this.size,
    required this.localPath,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'mimeType': mimeType,
      'size': size,
      'localPath': localPath,
      'createdAt': createdAt.toIso8601String(),
    };
  }

  factory MediaFile.fromJson(Map<String, dynamic> json) {
    return MediaFile(
      id: json['id'] as String,
      name: json['name'] as String,
      mimeType: json['mimeType'] as String? ?? 'application/octet-stream',
      size: json['size'] as int? ?? 0,
      localPath: json['localPath'] as String,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    );
  }
}

/// Service for managing local media file storage
/// Handles saving, retrieving, and deleting media files used in notes
class MediaStorageService {
  static final MediaStorageService _instance = MediaStorageService._internal();
  factory MediaStorageService() => _instance;
  MediaStorageService._internal();

  String? _mediaDirectory;

  /// Get the media directory path
  Future<String> get mediaDirectory async {
    if (_mediaDirectory != null) return _mediaDirectory!;
    
    final appDir = await getApplicationDocumentsDirectory();
    _mediaDirectory = path.join(appDir.path, 'media');
    
    // Ensure directory exists
    final dir = Directory(_mediaDirectory!);
    if (!await dir.exists()) {
      await dir.create(recursive: true);
      debugPrint('[MediaStorageService] Created media directory: $_mediaDirectory');
    }
    
    return _mediaDirectory!;
  }

  /// Extract media file ID from cognotez-media:// URL
  String? extractMediaId(String url) {
    final pattern = RegExp(r'cognotez-media://([a-z0-9]+)', caseSensitive: false);
    final match = pattern.firstMatch(url);
    return match?.group(1);
  }

  /// Extract all media file IDs from note content
  Set<String> extractMediaIdsFromContent(String content) {
    final mediaIds = <String>{};
    final pattern = RegExp(r'cognotez-media://([a-z0-9]+)', caseSensitive: false);
    
    for (final match in pattern.allMatches(content)) {
      final id = match.group(1);
      if (id != null) {
        mediaIds.add(id);
      }
    }
    
    return mediaIds;
  }

  /// Check if a media file exists locally
  Future<bool> mediaFileExists(String fileId) async {
    final dir = await mediaDirectory;
    final filePath = path.join(dir, fileId);
    
    // Try without extension first
    if (await File(filePath).exists()) return true;
    
    // Try common extensions
    final extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mp3', '.wav'];
    for (final ext in extensions) {
      if (await File('$filePath$ext').exists()) return true;
    }
    
    // Check if any file starts with the ID
    try {
      final directory = Directory(dir);
      await for (final entity in directory.list()) {
        if (entity is File) {
          final fileName = path.basename(entity.path);
          if (fileName.startsWith(fileId)) {
            return true;
          }
        }
      }
    } catch (e) {
      debugPrint('[MediaStorageService] Error checking media directory: $e');
    }
    
    return false;
  }

  /// Get the local file for a media ID
  Future<File?> getMediaFile(String fileId) async {
    final dir = await mediaDirectory;
    
    // Try without extension first
    final filePath = path.join(dir, fileId);
    final fileWithoutExt = File(filePath);
    if (await fileWithoutExt.exists()) return fileWithoutExt;
    
    // Try common extensions
    final extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mp3', '.wav'];
    for (final ext in extensions) {
      final file = File('$filePath$ext');
      if (await file.exists()) return file;
    }
    
    // Search for any file starting with the ID
    try {
      final directory = Directory(dir);
      await for (final entity in directory.list()) {
        if (entity is File) {
          final fileName = path.basename(entity.path);
          if (fileName.startsWith(fileId)) {
            return entity;
          }
        }
      }
    } catch (e) {
      debugPrint('[MediaStorageService] Error searching media directory: $e');
    }
    
    return null;
  }

  /// Get the local file path for a media ID (may not exist yet)
  Future<String> getMediaFilePath(String fileId, {String? extension}) async {
    final dir = await mediaDirectory;
    final fileName = extension != null ? '$fileId$extension' : fileId;
    return path.join(dir, fileName);
  }

  /// Save media file data to local storage
  Future<File> saveMediaFile(String fileId, Uint8List data, {String? extension}) async {
    final dir = await mediaDirectory;
    final fileName = extension != null ? '$fileId$extension' : fileId;
    final filePath = path.join(dir, fileName);
    
    final file = File(filePath);
    await file.writeAsBytes(data);
    
    debugPrint('[MediaStorageService] Saved media file: $filePath (${data.length} bytes)');
    return file;
  }

  /// Delete a media file
  Future<bool> deleteMediaFile(String fileId) async {
    final file = await getMediaFile(fileId);
    if (file != null && await file.exists()) {
      await file.delete();
      debugPrint('[MediaStorageService] Deleted media file: ${file.path}');
      return true;
    }
    return false;
  }

  /// List all local media files
  Future<List<MediaFileInfo>> listLocalMediaFiles() async {
    final dir = await mediaDirectory;
    final directory = Directory(dir);
    final files = <MediaFileInfo>[];
    
    if (!await directory.exists()) {
      return files;
    }
    
    try {
      await for (final entity in directory.list()) {
        if (entity is File) {
          final stat = await entity.stat();
          final fileName = path.basename(entity.path);
          
          // Extract ID from filename (remove extension)
          final id = path.basenameWithoutExtension(fileName);
          
          files.add(MediaFileInfo(
            id: id,
            name: fileName,
            path: entity.path,
            size: stat.size,
            modifiedTime: stat.modified,
          ));
        }
      }
    } catch (e) {
      debugPrint('[MediaStorageService] Error listing media files: $e');
    }
    
    return files;
  }

  /// Get extension from MIME type
  String? getExtensionFromMimeType(String mimeType) {
    final mimeToExt = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/ogg': '.ogv',
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/ogg': '.ogg',
      'audio/wav': '.wav',
    };
    return mimeToExt[mimeType.toLowerCase()];
  }

  /// Detect MIME type from file extension
  String getMimeTypeFromExtension(String extension) {
    final extToMime = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogv': 'video/ogg',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
    };
    return extToMime[extension.toLowerCase()] ?? 'application/octet-stream';
  }

  /// Check if a MIME type is an image
  bool isImageMimeType(String mimeType) {
    return mimeType.startsWith('image/');
  }

  /// Check if a MIME type is a video
  bool isVideoMimeType(String mimeType) {
    return mimeType.startsWith('video/');
  }

  /// Check if a MIME type is audio
  bool isAudioMimeType(String mimeType) {
    return mimeType.startsWith('audio/');
  }

  /// Clear all media files (use with caution)
  Future<int> clearAllMedia() async {
    final dir = await mediaDirectory;
    final directory = Directory(dir);
    int deletedCount = 0;
    
    if (!await directory.exists()) {
      return 0;
    }
    
    try {
      await for (final entity in directory.list()) {
        if (entity is File) {
          await entity.delete();
          deletedCount++;
        }
      }
      debugPrint('[MediaStorageService] Cleared $deletedCount media files');
    } catch (e) {
      debugPrint('[MediaStorageService] Error clearing media: $e');
    }
    
    return deletedCount;
  }

  /// Get total size of all media files
  Future<int> getTotalMediaSize() async {
    final dir = await mediaDirectory;
    final directory = Directory(dir);
    int totalSize = 0;
    
    if (!await directory.exists()) {
      return 0;
    }
    
    try {
      await for (final entity in directory.list()) {
        if (entity is File) {
          final stat = await entity.stat();
          totalSize += stat.size;
        }
      }
    } catch (e) {
      debugPrint('[MediaStorageService] Error calculating total size: $e');
    }
    
    return totalSize;
  }
}

/// Basic info about a local media file
class MediaFileInfo {
  final String id;
  final String name;
  final String path;
  final int size;
  final DateTime modifiedTime;

  MediaFileInfo({
    required this.id,
    required this.name,
    required this.path,
    required this.size,
    required this.modifiedTime,
  });
}