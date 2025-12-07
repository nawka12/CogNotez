import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:html/parser.dart' as parser;
import 'package:html/dom.dart' as dom;
import '../models/settings.dart';

/// Represents an OpenRouter model with id and display name
class OpenRouterModel {
  final String id;
  final String name;

  OpenRouterModel({required this.id, required this.name});

  factory OpenRouterModel.fromJson(Map<String, dynamic> json) {
    return OpenRouterModel(
      id: json['id'] as String,
      name: json['name'] as String? ?? json['id'] as String,
    );
  }
}

class AIService {
  final AppSettings settings;

  AIService(this.settings);

  /// Fetch available models from OpenRouter API
  Future<List<OpenRouterModel>> fetchOpenRouterModels() async {
    if (settings.openRouterApiKey == null ||
        settings.openRouterApiKey!.isEmpty) {
      throw Exception('OpenRouter API key not configured');
    }

    try {
      final response = await http.get(
        Uri.parse('https://openrouter.ai/api/v1/models'),
        headers: {
          'Authorization': 'Bearer ${settings.openRouterApiKey}',
        },
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final modelsData = data['data'] as List<dynamic>? ?? [];

        final models = modelsData
            .map((m) => OpenRouterModel.fromJson(m as Map<String, dynamic>))
            .toList();

        // Sort by name for easier browsing
        models.sort(
            (a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));

        return models;
      } else {
        throw Exception('Failed to fetch models: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Failed to fetch OpenRouter models: $e');
    }
  }

  Future<String> generateResponse(String prompt, {String? context}) async {
    // If tools are needed (implicit in advanced mode, or we could add a flag), we check backend
    if (settings.aiBackend == 'ollama') {
      return await _queryOllama(prompt, context: context);
    } else if (settings.aiBackend == 'openrouter') {
      return await _queryOpenRouter(prompt, context: context);
    }
    throw Exception('Unknown AI backend: ${settings.aiBackend}');
  }

  // --- Core AI Query Methods ---

  Future<String> _queryOllama(String prompt, {String? context}) async {
    try {
      final fullPrompt =
          context != null ? 'Context: $context\n\nQuestion: $prompt' : prompt;

      // Check if we should use tools (SearXNG enabled)
      List<Map<String, dynamic>> tools = await generateToolsArray();
      bool useTools = tools.isNotEmpty;

      final requestBody = {
        'model': settings.ollamaModel,
        'messages': [
          {'role': 'user', 'content': fullPrompt}
        ],
        'stream': false,
      };

      if (useTools) {
        requestBody['tools'] = tools;
      }

      final response = await http.post(
        Uri.parse(
            '${settings.ollamaEndpoint}/api/chat'), // Use chat endpoint for tools
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(requestBody),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final message = data['message'];

        // Check for tool calls
        if (message['tool_calls'] != null &&
            (message['tool_calls'] as List).isNotEmpty) {
          return await executeToolCalls(
              message['tool_calls'], fullPrompt, 'ollama');
        }

        return message['content'] as String? ?? 'No response from AI';
      } else {
        // Fallback to generate if chat fails (older Ollama versions)
        return await _queryOllamaGenerate(prompt, context: context);
      }
    } catch (e) {
      print('Ollama chat failed, trying legacy generate: $e');
      return await _queryOllamaGenerate(prompt, context: context);
    }
  }

  // Legacy generate for simpler models or fallbacks
  Future<String> _queryOllamaGenerate(String prompt, {String? context}) async {
    final fullPrompt =
        context != null ? 'Context: $context\n\nQuestion: $prompt' : prompt;
    final response = await http.post(
      Uri.parse('${settings.ollamaEndpoint}/api/generate'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'model': settings.ollamaModel,
        'prompt': fullPrompt,
        'stream': false,
      }),
    );

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['response'] as String? ?? 'No response from AI';
    } else {
      throw Exception('Ollama API error: ${response.statusCode}');
    }
  }

  Future<String> _queryOpenRouter(String prompt, {String? context}) async {
    if (settings.openRouterApiKey == null ||
        settings.openRouterApiKey!.isEmpty) {
      throw Exception('OpenRouter API key not configured');
    }

    try {
      final fullPrompt =
          context != null ? 'Context: $context\n\nQuestion: $prompt' : prompt;

      List<Map<String, dynamic>> tools = await generateToolsArray();

      final requestBody = {
        'model': settings.openRouterModel,
        'messages': [
          {'role': 'user', 'content': fullPrompt}
        ],
      };

      if (tools.isNotEmpty) {
        requestBody['tools'] = tools;
      }

      final response = await http.post(
        Uri.parse('https://openrouter.ai/api/v1/chat/completions'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${settings.openRouterApiKey}',
        },
        body: jsonEncode(requestBody),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final choice = data['choices'][0];
        final message = choice['message'];

        if (message['tool_calls'] != null) {
          return await executeToolCalls(
              message['tool_calls'], fullPrompt, 'openrouter');
        }

        return message['content'] as String? ?? 'No response from AI';
      } else {
        throw Exception('OpenRouter API error: ${response.statusCode}');
      }
    } catch (e) {
      throw Exception('Failed to query OpenRouter: $e');
    }
  }

  // --- Tool Calling Support ---

  Future<List<Map<String, dynamic>>> generateToolsArray() async {
    if (!settings.searxngEnabled) {
      return [];
    }

    // Simple connectivity check (optional, can be removed if fast fail is preferred)
    // await checkSearxngConnection();

    return [
      {
        'type': 'function',
        'function': {
          'name': 'web_search',
          'description':
              'Search the web for current information, news, prices, weather, or any time-sensitive data.',
          'parameters': {
            'type': 'object',
            'properties': {
              'query': {'type': 'string', 'description': 'The search query'},
              'max_results': {
                'type': 'number',
                'description': 'Maximum number of results',
                'default': settings.searxngMaxResults
              }
            },
            'required': ['query']
          }
        }
      },
      {
        'type': 'function',
        'function': {
          'name': 'scrape_webpage',
          'description':
              'Extract content from a specific webpage URL. Use this to read articles or documentation found via search.',
          'parameters': {
            'type': 'object',
            'properties': {
              'url': {'type': 'string', 'description': 'The URL to scrape'}
            },
            'required': ['url']
          }
        }
      }
    ];
  }

  Future<String> executeToolCalls(
      List<dynamic> toolCalls, String initialPrompt, String backend) async {
    List<Map<String, dynamic>> messages = [
      {'role': 'user', 'content': initialPrompt}
    ];

    // Add the tool call message to history
    // Note: Structure differs slightly between OpenRouter and Ollama, but conceptually similar
    // For simplicity, we restart the conversation with context or append to a conceptual history
    // In a real chat app, we'd have the full history. Here we simulate it.

    messages.add({'role': 'assistant', 'content': '', 'tool_calls': toolCalls});

    for (var toolCall in toolCalls) {
      final functionName = toolCall['function']['name'];
      final argumentsStr = toolCall['function']['arguments'];

      Map<String, dynamic> args;
      if (argumentsStr is String) {
        args = jsonDecode(argumentsStr);
      } else {
        args = argumentsStr; // Ollama might return Map directly
      }

      String content = '';

      if (functionName == 'web_search') {
        final query = args['query'];
        final maxResults = args['max_results'] ?? settings.searxngMaxResults;
        content = await _performWebSearch(query, maxResults);
      } else if (functionName == 'scrape_webpage') {
        final url = args['url'];
        content = await _performWebScrape(url);
      } else {
        content = 'Error: Unknown tool $functionName';
      }

      messages.add({
        'role': 'tool',
        'tool_call_id':
            toolCall['id'] ?? 'call_${DateTime.now().millisecondsSinceEpoch}',
        'name': functionName, // Required by some APIs
        'content': content
      });
    }

    // Call LLM again with tool outputs
    if (backend == 'ollama') {
      final response = await http.post(
        Uri.parse('${settings.ollamaEndpoint}/api/chat'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'model': settings.ollamaModel,
          'messages': messages,
          'stream': false,
        }),
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['message']['content'];
      }
    } else {
      final response = await http.post(
        Uri.parse('https://openrouter.ai/api/v1/chat/completions'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${settings.openRouterApiKey}',
        },
        body: jsonEncode({
          'model': settings.openRouterModel,
          'messages': messages,
        }),
      );
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['choices'][0]['message']['content'];
      }
    }

    throw Exception('Failed to get final response after tool usage');
  }

  // --- Implementation of Tools ---

  Future<String> _performWebSearch(String query, int maxResults) async {
    if (settings.searxngUrl == null) return 'Error: SearXNG URL not configured';

    try {
      final uri =
          Uri.parse('${settings.searxngUrl}/search').replace(queryParameters: {
        'q': query,
        'format': 'json',
        // 'categories': 'general', // Optional
        'language': 'en',
      });

      final response = await http.get(uri).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final results = data['results'] as List;
        final topResults = results
            .take(maxResults)
            .map((r) => {
                  'title': r['title'],
                  'url': r['url'],
                  'content': r['content'] ?? r['snippet'] ?? ''
                })
            .toList();

        return jsonEncode(topResults);
      } else {
        return 'Error searching web: ${response.statusCode}';
      }
    } catch (e) {
      return 'Error searching web: $e';
    }
  }

  Future<String> _performWebScrape(String url) async {
    try {
      // Create a client to handle headers potentially
      final client = http.Client();
      final response = await client.get(Uri.parse(url), headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CogNotez/1.0)'
      }).timeout(const Duration(seconds: 10)); // 10s timeout

      if (response.statusCode == 200) {
        final document = parser.parse(response.body);

        // Remove scripts and styles
        document
            .querySelectorAll('script, style, noscript, nav, footer, header')
            .forEach((element) => element.remove());

        // Extract text
        String text = document.body?.text ?? '';

        // Simple cleanup: collapse whitespace
        text = text.replaceAll(RegExp(r'\s+'), ' ').trim();

        // Limit length to avoid blowing up context window
        if (text.length > 5000) {
          text = text.substring(0, 5000) + '... [truncated]';
        }

        return text.isNotEmpty ? text : 'No content found on page.';
      } else {
        return 'Failed to load page: ${response.statusCode}';
      }
    } catch (e) {
      return 'Error scraping page: $e';
    }
  }

  // --- Helper Methods ---

  Future<String> summarize(String text) async {
    final prompt =
        'Please provide a concise summary of the following text:\n\n$text';
    return await generateResponse(prompt);
  }

  Future<String> askQuestion(String text, String question) async {
    final prompt =
        'Based on the following text, answer this question: $question\n\nText: $text';
    return await generateResponse(prompt);
  }

  Future<String> editText(String text, String instruction) async {
    final prompt =
        'Please edit the following text according to this instruction: $instruction\n\nText: $text';
    return await generateResponse(prompt);
  }

  Future<String> generateContent(String prompt) async {
    return await generateResponse(prompt);
  }

  Future<List<String>> extractKeyPoints(String text) async {
    final prompt =
        'Extract the key points from the following text as a bulleted list:\n\n$text';
    final response = await generateResponse(prompt);
    final lines = response
        .split('\n')
        .where((line) =>
            line.trim().startsWith('-') || line.trim().startsWith('•'))
        .toList();
    return lines
        .map((line) => line.replaceAll(RegExp(r'^[-•]\s*'), '').trim())
        .where((line) => line.isNotEmpty)
        .toList();
  }

  Future<List<String>> generateTags(String text) async {
    final prompt =
        'Generate relevant tags for the following text. Return only the tags, separated by commas:\n\n$text';
    final response = await generateResponse(prompt);
    return response
        .split(',')
        .map((tag) => tag.trim())
        .where((tag) => tag.isNotEmpty)
        .toList();
  }
}
