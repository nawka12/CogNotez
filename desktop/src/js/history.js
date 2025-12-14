class HistoryManager {
    /**
     * History Manager for undo/redo functionality
     * Uses a memory-efficient approach by limiting history size.
     * 
     * @param {number} maxHistorySize - Maximum number of states to keep (default: 50)
     */
    constructor(maxHistorySize = 50) {
        this.history = [];
        this.currentIndex = -1;
        this.maxHistorySize = maxHistorySize;
    }

    /**
     * Get estimated memory usage in bytes
     * @returns {number} Estimated memory in bytes
     */
    getMemoryEstimate() {
        let totalBytes = 0;
        for (const state of this.history) {
            if (state.content) {
                totalBytes += state.content.length * 2; // UTF-16 characters = 2 bytes each
            }
        }
        return totalBytes;
    }

    // Add a new state to history
    pushState(content, cursorPosition = 0, selectionStart = 0, selectionEnd = 0) {
        // If we're not at the end of the history, remove future states
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }

        // Add new state
        this.history.push({
            content,
            cursorPosition,
            selectionStart,
            selectionEnd,
            timestamp: Date.now()
        });

        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        } else {
            this.currentIndex++;
        }
    }

    // Get current state
    getCurrentState() {
        if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
            return this.history[this.currentIndex];
        }
        return null;
    }

    // Check if undo is available
    canUndo() {
        return this.currentIndex > 0;
    }

    // Check if redo is available
    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }

    // Perform undo operation
    undo() {
        if (this.canUndo()) {
            this.currentIndex--;
            return this.history[this.currentIndex];
        }
        return null;
    }

    // Perform redo operation
    redo() {
        if (this.canRedo()) {
            this.currentIndex++;
            return this.history[this.currentIndex];
        }
        return null;
    }

    // Clear all history
    clear() {
        this.history = [];
        this.currentIndex = -1;
    }

    // Get history statistics
    getStats() {
        return {
            size: this.history.length,
            index: this.currentIndex,
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        };
    }
}

module.exports = HistoryManager;
