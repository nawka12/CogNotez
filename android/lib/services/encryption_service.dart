import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:encrypt/encrypt.dart';

class EncryptionService {
  static const int keyLength = 32;
  static const int ivLength = 16;
  static const int saltLength = 32;
  static const int iterations = 210000;

  /// Derive encryption key from password using PBKDF2
  static Key deriveKey(String password, String saltBase64) {
    final salt = base64Decode(saltBase64);
    final passwordBytes = utf8.encode(password);
    
    // PBKDF2 with HMAC-SHA256
    var derivedKey = List<int>.filled(keyLength, 0);
    var blockCount = (keyLength / 32).ceil(); // SHA256 output is 32 bytes
    
    for (var i = 1; i <= blockCount; i++) {
      var u = Hmac(sha256, passwordBytes).convert(salt + _intToBytes(i)).bytes;
      var t = List<int>.from(u);
      
      for (var j = 1; j < iterations; j++) {
        u = Hmac(sha256, passwordBytes).convert(u).bytes;
        for (var k = 0; k < u.length; k++) {
          t[k] ^= u[k];
        }
      }
      
      var start = (i - 1) * 32;
      var end = (start + 32 > keyLength) ? keyLength : start + 32;
      derivedKey.setRange(start, end, t);
    }
    
    return Key(Uint8List.fromList(derivedKey));
  }
  
  static List<int> _intToBytes(int value) {
    return [
      (value >> 24) & 0xff,
      (value >> 16) & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ];
  }

  /// Generate a random salt
  static String generateSalt() {
    final random = Random.secure();
    final salt = List<int>.generate(saltLength, (_) => random.nextInt(256));
    return base64Encode(salt);
  }

  /// Encrypt text with password
  static Map<String, String> encrypt(String text, String password) {
    final salt = generateSalt();
    final key = deriveKey(password, salt);
    final iv = IV.fromSecureRandom(ivLength);
    final encrypter = Encrypter(AES(key, mode: AESMode.gcm));
    
    final encrypted = encrypter.encrypt(text, iv: iv);
    
    return {
      'encrypted_content': encrypted.base64,
      'salt': salt,
      'iv': iv.base64,
    };
  }

  /// Decrypt text with password
  static String decrypt(String encryptedBase64, String saltBase64, String ivBase64, String password) {
    final key = deriveKey(password, saltBase64);
    final iv = IV.fromBase64(ivBase64);
    final encrypter = Encrypter(AES(key, mode: AESMode.gcm));
    
    final encrypted = Encrypted.fromBase64(encryptedBase64);
    return encrypter.decrypt(encrypted, iv: iv);
  }

  /// Hash password for verification (optional)
  static String hashPassword(String password, String salt) {
    final key = deriveKey(password, salt);
    return base64Encode(key.bytes);
  }
}

