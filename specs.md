# CogNotez - Application Specification Sheet

## 1. Project Overview

* **App Name:** CogNotez
* **Working Title:** CogNotez - An AI-powered note app.
* **Core Concept:** A desktop note-taking application that prioritizes privacy and user control by leveraging a local Large Language Model (LLM) for intelligent features. It is designed to be fast, intuitive, and highly customizable through AI-driven commands.
* **Problem Statement:** Existing AI-powered note apps (like Notion) are primarily cloud-based and centralized, raising privacy concerns for users who want to keep their data local. CogNotez solves this by offering an offline-first experience with optional connectivity, running AI tasks on the user's own machine.
* **Target Audience:**
    * **Privacy-focused users:** Individuals who want the benefits of AI without sending their personal notes to third-party servers.
    * **Tech enthusiasts:** Users who are comfortable setting up local LLMs (via Ollama) and enjoy tinkering with and customizing their software.
    * **Power users:** Professionals and students looking for a highly efficient and extensible note-taking tool.

## 2. Key Features

### 2.1. AI-Powered Summary
* **Description:** Users can select a portion of text within a note or target the entire document for summarization. The integrated AI will process the text and generate a concise summary.
* **Use Case:** Quickly get the gist of long articles, meeting transcripts, or research notes without reading the entire text.


### 2.3. Highlight to Ask AI
* **Description:** Users can highlight any text within their notes to use it as context for a question to the AI.
* **Workflow:**
    1.  User highlights a phrase (e.g., "quantum computing").
    2.  User invokes the "Ask AI" command (e.g., via right-click or a keyboard shortcut).
    3.  A prompt appears, allowing the user to ask a question (e.g., "Explain this in simple terms").
    4.  The AI uses the highlighted text and the question to formulate an answer.
* **Internet Connectivity:** This feature can optionally connect to the internet via a self-hosted SearxNG instance to provide up-to-date information for queries.

### 2.4. Highlight to AI-Edit
* **Description:** An inline editing tool where users can highlight text and instruct the AI to perform a specific transformation, replacing the original text with the result.
* **Use Cases:**
    * **Calculation:** Highlight `100 - 1` -> ask to calculate -> text is replaced with `99`.
    * **Rephrasing:** Highlight a sentence -> ask to "make this more formal" -> text is replaced with the formal version.
    * **Translation:** Highlight a phrase -> ask to "translate to Spanish" -> text is replaced with the translation.
    * **Formatting:** Highlight a list of items -> ask to "format as a Markdown list" -> text is reformatted.

### 2.5. Data Portability (Export/Import)
* **Description:** Users can export their entire note database or individual notes into a portable format. This allows for easy backups and migration to another device running Noted, ensuring data is not locked into a single installation.

### 2.6. Sharing
* **Description:** Users can share individual notes with others in common, non-proprietary formats for maximum compatibility.
* **Supported Formats:**
    * Markdown (`.md`)
    * Plain Text (`.txt`)

## 3. Technical Specifications

* **Target Platforms:** Desktop only.
    * Linux
    * Windows
    * macOS
* **Framework:** Electron
* **Architecture:**
    * **Offline-First:** The application is designed to be fully functional without an internet connection.
    * **Local LLM Integration:** Primarily connects to a local [Ollama](https://ollama.com/) instance for AI processing, keeping all data on the user's machine.
    * **Optional Connectivity:** Internet access is only required for:
        * Using the [OpenRouter API](https://openrouter.ai/) as an alternative to a local LLM.
        * Using the "Highlight to Ask AI" feature with SearxNG integration for web search.
* **Technology Stack:**
    * **Frontend:** Vue.js or React
    * **Backend:** Node.js
    * **Database:** localStorage (JSON)

## 4. Competitive Analysis

* **Primary Competitor:** Notion
* **Key Differentiators from Notion:**
    * **Privacy & Control:** CogNotez is offline-first and uses local LLMs, whereas Notion is online-focused and centralized. User data stays on the user's device.
    * **Cost-Effective AI:** Leverages free, open-source local models via Ollama, avoiding recurring subscription fees for AI features.
    * **Openness:** Not reliant on a proprietary, closed ecosystem.

## 5. Design & UI/UX

* **Aesthetic:** Modern, clean, and minimalist to provide a distraction-free writing environment.
* **Color Palette:**
    * **Primary:** A neutral palette for both light and dark modes.
    * **Accent Color:** A subtle purple (`#BDABE3`) to be used for highlights, active states, buttons, and branding elements.
* **Themes:**
    * **Light Mode:** Clean and bright for daytime use.
    * **Dark Mode:** Easy on the eyes for low-light environments.
* **User Experience Principles:**
    * AI features should be powerful but non-intrusive, accessible via context menus or keyboard shortcuts.
    * The core note-taking experience should be fast and responsive.
    * The interface should be intuitive, with a low learning curve for basic features and clear pathways to access advanced AI functionalities.