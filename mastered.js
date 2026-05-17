document.addEventListener('DOMContentLoaded', function () {
    // Global variables
    let allMasteredArray = [];
    let filteredMasteredArray = [];
    let searchQuery = '';
    let searchTimeout = null;

    // Pagination variables
    const ITEMS_PER_PAGE = 50;
    let currentPage = 1;
    let totalPages = 1;

    // Initialize
    loadMasteredWords();
    bindEventListeners();

    // ==================== Core Functions ====================

    // Load mastered words data
    function loadMasteredWords() {

        chrome.storage.local.get(['masteredWords', 'masteredWordsTimestamp'], function(result) {
            const masteredWords = result.masteredWords || [];
            const masteredWordsTimestamp = result.masteredWordsTimestamp || {};


            // Process mastered words data
            allMasteredArray = masteredWords.map(word => ({
                word: word,
                timestamp: masteredWordsTimestamp[word] || Date.now(),
                masteredTime: formatTime(masteredWordsTimestamp[word] || Date.now())
            }));

            // Sort by mastered time descending (newest first)
            allMasteredArray.sort((a, b) => b.timestamp - a.timestamp);


            // Apply search filter
            if (searchQuery.trim()) {
                performSearch();
            } else {
                filteredMasteredArray = [...allMasteredArray];
            }


            // Update statistics summary
            updateStatsSummary();

            // Render table
            renderTable();
        });
    }

    // Format time
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return 'Today ' + date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } else if (diffDays === 1) {
            return 'Yesterday ' + date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        }
    }

    // Update statistics summary
    function updateStatsSummary() {
        const totalCount = allMasteredArray.length;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayCount = allMasteredArray.filter(item =>
            new Date(item.timestamp) >= today
        ).length;

        document.getElementById('totalMasteredCount').textContent = totalCount;
        document.getElementById('todayMasteredCount').textContent = todayCount;
    }

    // ==================== Search Functions ====================

    function performSearch() {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) return;

        searchQuery = searchInput.value.trim().toLowerCase();

        if (searchQuery === '') {
            filteredMasteredArray = [...allMasteredArray];
        } else {
            filteredMasteredArray = allMasteredArray.filter(item =>
                item.word.toLowerCase().includes(searchQuery)
            );
        }

        updateSearchStats();
        renderTable();
    }

    function highlightSearchQuery(text) {
        if (!searchQuery) return text;
        const regex = new RegExp(`(${escapeRegExp(searchQuery)})`, 'gi');
        return text.replace(regex, '<span class="search-highlight">$1</span>');
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ==================== Table Rendering ====================

    function renderTable() {
        const tbody = document.getElementById('masteredTable');
        if (!tbody) return;

        // Use DocumentFragment to reduce DOM operations
        const fragment = document.createDocumentFragment();

        if (filteredMasteredArray.length === 0) {
            const isEmpty = allMasteredArray.length === 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="3">
                    <div class="empty-state">
                        <div class="empty-icon">${isEmpty ? '📚' : '🔍'}</div>
                        <div class="empty-text">
                            ${isEmpty ? 'No mastered words yet' : 'No matching words found'}
                        </div>
                        <div class="empty-subtext">
                            ${isEmpty ? 'Start learning and mark some words as mastered!' : 'Try another keyword'}
                        </div>
                    </div>
                </td>
            `;
            fragment.appendChild(tr);
        } else {
            filteredMasteredArray.forEach((item, index) => {
                const tr = document.createElement('tr');
                tr.setAttribute('data-word', item.word);
                tr.innerHTML = `
                    <td style="font-weight: 600; padding: 8px 16px;">
                        ${highlightSearchQuery(item.word)}
                    </td>
                    <td style="color: #64748b; font-size: 13px; padding: 8px 16px;">
                        ${item.masteredTime}
                    </td>
                                    <td style="text-align: center; padding: 8px 16px;">
                    <button class="remove-btn" data-word="${item.word}">
                        Delete
                    </button>
                </td>
                `;
                fragment.appendChild(tr);
            });
        }

        // Replace all content at once to reduce redraws
        tbody.innerHTML = '';
        tbody.appendChild(fragment);

        // Bind button events
        bindTableButtonEvents();
    }

    function bindTableButtonEvents() {
        const removeButtons = document.querySelectorAll('.remove-btn');
        removeButtons.forEach(button => {
            button.addEventListener('click', function() {
                const word = this.getAttribute('data-word');
                if (word) {
                    removeWordFromMastered(word);
                }
            });
        });
    }

    function updateSearchStats() {
        const searchResultsCount = document.getElementById('searchResultsCount');
        if (searchResultsCount) {
            if (searchQuery.trim()) {
                searchResultsCount.innerHTML = `Search results: <span class="search-highlight">${filteredMasteredArray.length}</span> words`;
            } else {
                searchResultsCount.textContent = `Showing all words (${filteredMasteredArray.length})`;
            }
        }
    }

    // ==================== Event Binding ====================

    function bindEventListeners() {
        // Search input event
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', function(e) {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    performSearch();
                }, 300);
            });
        }

        // Clear search button
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', function() {
                searchInput.value = '';
                searchQuery = '';
                performSearch();
                searchInput.focus();
            });
        }

        // Export button
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', exportMasteredWords);
        }

        // Clear all button
        const clearAllBtn = document.getElementById('clearAllBtn');
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', clearAllMasteredWords);
        }

        // Back button
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                window.location.href = 'stats.html';
            });
        }
    }

    // ==================== Core Operations ====================

    // Remove word from mastered list
    function removeWordFromMastered(word) {
        if (!word) {
            showNotification('Error: Word parameter is empty', 'error');
            return;
        }

        if (confirm(`Are you sure you want to permanently delete "${word}"?\nThis word will be completely removed from the mastered list and word list.`)) {

            chrome.storage.local.get(['masteredWords', 'masteredWordsTimestamp', 'words', 'wordStats', 'wordLastSentence'], function(result) {
                let masteredWords = result.masteredWords || [];
                let masteredWordsTimestamp = result.masteredWordsTimestamp || {};
                let words = result.words || [];
                let wordStats = result.wordStats || {};
                let wordLastSentence = result.wordLastSentence || {};


                // Remove from mastered list
                masteredWords = masteredWords.filter(w => w !== word);
                delete masteredWordsTimestamp[word];

                // Remove from word list (if exists)
                words = words.filter(w => {
                    const storedWord = typeof w === 'object' && w.word ? w.word : w;
                    return storedWord.toLowerCase() !== word.toLowerCase();
                });

                // Remove from statistics (if exists)
                delete wordStats[word.toLowerCase()];
                delete wordLastSentence[word.toLowerCase()];


                // Save changes
                chrome.storage.local.set({
                    masteredWords,
                    masteredWordsTimestamp,
                    words,
                    wordStats,
                    wordLastSentence
                }, function() {
                    if (chrome.runtime.lastError) {
                        showNotification('Delete failed, please try again', 'error');
                        return;
                    }

                    showNotification(`Word "${word}" has been permanently deleted`, 'success');

                    // Optimization: Update data arrays directly without reloading
                    allMasteredArray = allMasteredArray.filter(item => item.word !== word);
                    filteredMasteredArray = filteredMasteredArray.filter(item => item.word !== word);

                    // Update statistics summary
                    updateStatsSummary();

                    // Re-render table
                    renderTable();

                    // Notify content script to refresh highlighting
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {action: "refreshHighlight"}, function() {
                                if (chrome.runtime.lastError) {
                                    // Silent handling - tab may not have content script loaded
                                }
                            });
                        }
                    });
                });
            });
        }
    }

    // Export mastered words list
    function exportMasteredWords() {
        if (allMasteredArray.length === 0) {
            showNotification('No mastered words to export', 'warning');
            return;
        }

        const content = `Mastered Words List\nExport Time: ${new Date().toLocaleString()}\nTotal: ${allMasteredArray.length} words\n\n${allMasteredArray.map((item, index) => `${index + 1}. ${item.word} (Mastered: ${item.masteredTime})`).join('\n')}`;

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mastered_words_${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);

        showNotification(`Exported ${allMasteredArray.length} mastered words`, 'success');
    }

    // Clear all mastered words
    function clearAllMasteredWords() {
        if (allMasteredArray.length === 0) {
            showNotification('No mastered words to clear', 'warning');
            return;
        }

        if (confirm(`Are you sure you want to permanently delete all ${allMasteredArray.length} mastered words?\nThese words will be completely removed from the system and cannot be recovered.`)) {
            chrome.storage.local.get(['masteredWords', 'masteredWordsTimestamp', 'words', 'wordStats', 'wordLastSentence'], function(result) {
                let masteredWords = result.masteredWords || [];
                let masteredWordsTimestamp = result.masteredWordsTimestamp || {};
                let words = result.words || [];
                let wordStats = result.wordStats || {};
                let wordLastSentence = result.wordLastSentence || {};

                const clearedCount = masteredWords.length;

                // Remove all mastered words from word list
                words = words.filter(w => {
                    const storedWord = typeof w === 'object' && w.word ? w.word : w;
                    return !masteredWords.some(masteredWord =>
                        masteredWord.toLowerCase() === storedWord.toLowerCase()
                    );
                });

                // Remove all mastered words from statistics
                masteredWords.forEach(word => {
                    delete wordStats[word.toLowerCase()];
                    delete wordLastSentence[word.toLowerCase()];
                });

                // Clear mastered list
                masteredWords = [];
                masteredWordsTimestamp = {};

                // Save changes
                chrome.storage.local.set({
                    masteredWords,
                    masteredWordsTimestamp,
                    words,
                    wordStats,
                    wordLastSentence
                }, function() {
                    if (chrome.runtime.lastError) {
                        showNotification('Clear failed, please try again', 'error');
                        return;
                    }

                    showNotification(`Permanently deleted ${clearedCount} mastered words`, 'success');

                    // Optimization: Clear data arrays directly without reloading
                    allMasteredArray = [];
                    filteredMasteredArray = [];

                    // Update statistics summary
                    updateStatsSummary();

                    // Re-render table
                    renderTable();

                    // Notify content script to refresh highlighting
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, {action: "refreshHighlight"}, function() {
                                if (chrome.runtime.lastError) {
                                    // Silent handling - tab may not have content script loaded
                                }
                            });
                        }
                    });
                });
            });
        }
    }

    // ==================== Utility Functions ====================

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 300px;
            word-wrap: break-word;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            transform: translateX(100%);
            transition: transform 0.2s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        switch (type) {
            case 'success':
                notification.style.background = '#10b981';
                break;
            case 'warning':
                notification.style.background = '#f59e0b';
                break;
            case 'error':
                notification.style.background = '#ef4444';
                break;
            default:
                notification.style.background = '#3b82f6';
        }

        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
});
