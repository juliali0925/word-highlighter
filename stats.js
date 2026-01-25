document.addEventListener('DOMContentLoaded', function () {
    // Global variables
    let allStatsArray = [];
    let filteredStatsArray = [];
    let searchQuery = '';
    let searchTimeout = null;

    // Pagination variables
    const ITEMS_PER_PAGE = 50;
    let currentPage = 1;
    let totalPages = 1;

    // Initialize
    loadStats();
    bindEventListeners();

    // ==================== Core Functions ====================

    // Mark word as mastered
    window.markWordAsMastered = function(word) {
        if (!word) {
            showNotification('Error: Word parameter is empty', 'error');
            return;
        }


        chrome.storage.local.get(['words', 'masteredWords', 'masteredWordsTimestamp', 'wordStats', 'wordLastSentence'], function(result) {
            let words = result.words || [];
            let masteredWords = result.masteredWords || [];
            let masteredWordsTimestamp = result.masteredWordsTimestamp || {};
            let wordStats = result.wordStats || {};
            let wordLastSentence = result.wordLastSentence || {};


            if (masteredWords.includes(word)) {
                showNotification(`"${word}" is already mastered`, 'warning');
                return;
            }

            // Remove from word list
            const wordIndex = words.findIndex(w => {
                const storedWord = typeof w === 'object' && w.word ? w.word : w;
                return storedWord.toLowerCase() === word.toLowerCase();
            });


            if (wordIndex !== -1) {
                words.splice(wordIndex, 1);
            }

            // Add to mastered list
            masteredWords.push(word);
            masteredWordsTimestamp[word] = Date.now();

            // Remove from statistics
            delete wordStats[word.toLowerCase()];
            delete wordLastSentence[word.toLowerCase()];

            // Save all changes
            chrome.storage.local.set({
                words: words,
                masteredWords: masteredWords,
                masteredWordsTimestamp: masteredWordsTimestamp,
                wordStats: wordStats,
                wordLastSentence: wordLastSentence
            }, function() {
                if (chrome.runtime.lastError) {
                    showNotification('Save failed, please try again', 'error');
                    return;
                }

                showNotification(`"${word}" marked as mastered`, 'success');

                // Remove from statistics array
                allStatsArray = allStatsArray.filter(item => item.word !== word);
                filteredStatsArray = filteredStatsArray.filter(item => item.word !== word);


                // Re-render
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
    };

    // Load statistics data
    function loadStats() {

        chrome.storage.local.get(['wordStats', 'wordLastSentence', 'masteredWords'], function(result) {
            const wordStats = result.wordStats || {};
            const wordLastSentence = result.wordLastSentence || {};
            const masteredWords = result.masteredWords || [];


            // Process statistics data
            allStatsArray = Object.entries(wordStats).map(([word, count]) => ({
                word: word,
                count: count,
                sentence: wordLastSentence[word] || 'No example sentence'
            }));


            // Filter out mastered words
            allStatsArray = allStatsArray.filter(item => !masteredWords.includes(item.word));


            // Sort by occurrence count
            allStatsArray.sort((a, b) => b.count - a.count);

            // Apply search filter
            if (searchQuery.trim()) {
                performSearch();
            } else {
                filteredStatsArray = [...allStatsArray];
            }


            // Render table
            renderTable();
        });
    }

    // ==================== Search Functions ====================

    function performSearch() {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) return;

        searchQuery = searchInput.value.trim().toLowerCase();

        if (searchQuery === '') {
            filteredStatsArray = [...allStatsArray];
        } else {
            filteredStatsArray = allStatsArray.filter(item =>
                item.word.toLowerCase().includes(searchQuery)
            );
        }

        // Reset to first page when searching
        currentPage = 1;

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
        const tbody = document.getElementById('statsTable');
        if (!tbody) return;

        // Calculate pagination
        totalPages = Math.max(1, Math.ceil(filteredStatsArray.length / ITEMS_PER_PAGE));
        currentPage = Math.min(currentPage, totalPages);

        // Calculate current page data range
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, filteredStatsArray.length);
        const currentPageData = filteredStatsArray.slice(startIndex, endIndex);

        // Use DocumentFragment to reduce DOM operations
        const fragment = document.createDocumentFragment();

        currentPageData.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-word', item.word);
            tr.innerHTML = `
                <td style="font-weight: 600; padding: 8px 16px;">
                    ${highlightSearchQuery(item.word)}
                </td>
                <td style="text-align: center; padding: 8px 16px;">
                    <span class="count-badge">${item.count}</span>
                </td>
                <td style="padding: 8px 16px; max-width: 300px; word-wrap: break-word;">
                    <span class="sentence-text" title="${item.sentence || 'No example sentence'}">${truncateSentence(item.sentence || 'No example sentence')}</span>
                </td>
                <td style="text-align: center; padding: 8px 16px;">
                    <button class="mastered-btn" data-word="${item.word}">
                        Mark as Mastered
                    </button>
                </td>
            `;
            fragment.appendChild(tr);
        });

        // Replace all content at once to reduce redraws
        tbody.innerHTML = '';
        tbody.appendChild(fragment);

        // Update pagination info
        updatePaginationInfo();

        // Bind button events
        bindTableButtonEvents();
    }

    function bindTableButtonEvents() {
        const masteredButtons = document.querySelectorAll('.mastered-btn');
        masteredButtons.forEach(button => {
            button.addEventListener('click', function() {
                const word = this.getAttribute('data-word');
                if (word) {
                    markWordAsMastered(word);
                }
            });
        });
    }

    function updateSearchStats() {
        const searchResultsCount = document.getElementById('searchResultsCount');
        if (searchResultsCount) {
            if (searchQuery.trim()) {
                searchResultsCount.innerHTML = `Search results: <span class="search-highlight">${filteredStatsArray.length}</span> words`;
            } else {
                searchResultsCount.textContent = `Showing all words (${filteredStatsArray.length})`;
            }
        }
    }

    // ==================== Pagination Functions ====================

    function goToPage(page) {
        if (page < 1 || page > totalPages) return;
        currentPage = page;
        renderTable();
    }

    function updatePaginationInfo() {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE + 1;
        const endIndex = Math.min(currentPage * ITEMS_PER_PAGE, filteredStatsArray.length);

        // Update pagination info
        const paginationInfo = document.getElementById('paginationInfo');
        if (paginationInfo) {
            if (filteredStatsArray.length === 0) {
                paginationInfo.textContent = 'No data';
            } else {
                paginationInfo.textContent = `Showing ${startIndex}-${endIndex} of ${filteredStatsArray.length} entries`;
            }
        }

        // Update page number info
        const currentPageSpan = document.getElementById('currentPage');
        const totalPagesSpan = document.getElementById('totalPages');
        if (currentPageSpan) currentPageSpan.textContent = currentPage;
        if (totalPagesSpan) totalPagesSpan.textContent = totalPages;

        // Update button states
        const firstPageBtn = document.getElementById('firstPageBtn');
        const prevPageBtn = document.getElementById('prevPageBtn');
        const nextPageBtn = document.getElementById('nextPageBtn');
        const lastPageBtn = document.getElementById('lastPageBtn');

        if (firstPageBtn) firstPageBtn.disabled = currentPage === 1;
        if (prevPageBtn) prevPageBtn.disabled = currentPage === 1;
        if (nextPageBtn) nextPageBtn.disabled = currentPage === totalPages;
        if (lastPageBtn) lastPageBtn.disabled = currentPage === totalPages;
    }

    // Truncate long sentences
    function truncateSentence(sentence, maxLength = 60) {
        if (sentence.length <= maxLength) {
            return sentence;
        }
        return sentence.substring(0, maxLength) + '...';
    }

    // ==================== Event Binding ====================

    // Bind event listeners
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
          if (searchInput) {
            searchInput.value = '';
            searchQuery = '';
            performSearch();
            searchInput.focus();
          }
        });
      }

      const clearStatsBtn = document.getElementById('clearStatsBtn');
      if (clearStatsBtn) {
        clearStatsBtn.addEventListener('click', clearStats);
      }

      const importWordsBtn = document.getElementById('importWordsBtn');
      if (importWordsBtn) {
        importWordsBtn.addEventListener('click', importWordsFromJson);
      }

      // Pagination button events
      const firstPageBtn = document.getElementById('firstPageBtn');
      const prevPageBtn = document.getElementById('prevPageBtn');
      const nextPageBtn = document.getElementById('nextPageBtn');
      const lastPageBtn = document.getElementById('lastPageBtn');

      if (firstPageBtn) {
        firstPageBtn.addEventListener('click', () => goToPage(1));
      }
      if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
      }
      if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
      }
      if (lastPageBtn) {
        lastPageBtn.addEventListener('click', () => goToPage(totalPages));
      }
    }

    // Show mastered words function
    function showMasteredWords() {
      chrome.storage.local.get('masteredWords', function(result) {
        const masteredWordsArray = result.masteredWords || [];

        // Create modal to display mastered words
        const modal = document.createElement('div');
        modal.className = 'mastered-modal';

        if (masteredWordsArray.length === 0) {
          modal.innerHTML = `
            <div class="modal-content">
              <div class="modal-header">
                <div class="header-info">
                  <h3>🎯 Mastered Words</h3>
                  <span class="word-count">Total: 0</span>
                </div>
                <button class="close-btn" title="Close">&times;</button>
              </div>
              <div class="modal-body">
                <div class="mastered-words-empty">
                  <div class="mastered-words-empty-icon">📚</div>
                  <div class="mastered-words-empty-text">No mastered words yet</div>
                  <div class="mastered-words-empty-subtext">Start learning and mark some words as mastered!</div>
                </div>
              </div>
            </div>
          `;
        } else {
          modal.innerHTML = `
            <div class="modal-content">
              <div class="modal-header">
                <div class="header-info">
                  <h3>🎯 Mastered Words</h3>
                  <span class="word-count">Total: ${masteredWordsArray.length}</span>
                </div>
                <button class="close-btn" title="Close">&times;</button>
              </div>
              <div class="mastered-search-container">
                <div class="mastered-search-box">
                  <input type="text" id="masteredSearchInput" placeholder="Search mastered words..." autocomplete="off">
                  <div class="mastered-search-icon">🔍</div>
                </div>
                <div class="mastered-search-stats" id="masteredSearchStats">
                  Showing all ${masteredWordsArray.length} words
                </div>
              </div>
              <div class="modal-body">
                <div class="mastered-words-container" id="masteredWordsContainer">
                  ${renderMasteredWords(masteredWordsArray)}
                </div>
              </div>
              <div class="modal-footer">
                <button class="export-btn" title="Export mastered words list">
                  📤 Export List
                </button>
                <button class="clear-all-btn" title="Clear all mastered words">
                  🗑️ Clear All
                </button>
              </div>
            </div>
          `;
        }

        // Close button event
        modal.querySelector('.close-btn').addEventListener('click', () => {
          document.body.removeChild(modal);
        });

        // Click background to close
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            document.body.removeChild(modal);
          }
        });

        if (masteredWordsArray.length > 0) {
          // Search functionality
          const searchInput = modal.querySelector('#masteredSearchInput');
          if (searchInput) {
            let searchTimeout;
            searchInput.addEventListener('input', (e) => {
              clearTimeout(searchTimeout);
              searchTimeout = setTimeout(() => {
                filterMasteredWords(e.target.value, masteredWordsArray, modal);
              }, 300);
            });
          }

          // Export list event
          const exportBtn = modal.querySelector('.export-btn');
          if (exportBtn) {
            exportBtn.addEventListener('click', () => {
              exportMasteredWords(masteredWordsArray);
            });
          }

          // Clear all event
          const clearAllBtn = modal.querySelector('.clear-all-btn');
          if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
              clearAllMasteredWords(modal);
            });
          }

          // Bind delete events
          bindMasteredWordDeleteEvents(modal);
        }

        document.body.appendChild(modal);
      });
    }

    // Render mastered words list
    function renderMasteredWords(words) {
      return words.map((word, index) => `
        <div class="mastered-word-item" data-word="${word}">
          <div class="word-content">
            <span class="word-text">${word}</span>
            <span class="word-index">#${index + 1}</span>
          </div>
          <button class="delete-word-btn" title="Remove from mastered list" data-word="${word}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      `).join('');
    }

    // Filter mastered words
    function filterMasteredWords(searchQuery, allWords, modal) {
      const query = searchQuery.trim().toLowerCase();
      const filteredWords = query
        ? allWords.filter(word => word.toLowerCase().includes(query))
        : allWords;

      const container = modal.querySelector('#masteredWordsContainer');
      const statsElement = modal.querySelector('#masteredSearchStats');

      if (container) {
        if (filteredWords.length === 0 && query) {
          container.innerHTML = `
            <div class="mastered-words-empty">
              <div class="mastered-words-empty-icon">🔍</div>
              <div class="mastered-words-empty-text">No matching words found</div>
              <div class="mastered-words-empty-subtext">Try another keyword</div>
            </div>
          `;
        } else {
          container.innerHTML = renderMasteredWords(filteredWords);
          bindMasteredWordDeleteEvents(modal);
        }
      }

      if (statsElement) {
        if (query) {
          statsElement.innerHTML = `Found <strong>${filteredWords.length}</strong> matching words`;
        } else {
          statsElement.innerHTML = `Showing all ${allWords.length} words`;
        }
      }
    }

    // Bind delete button events
    function bindMasteredWordDeleteEvents(modal) {
      modal.querySelectorAll('.delete-word-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const word = btn.dataset.word;
          removeWordFromMastered(word, modal);
        });
      });
    }

    // Remove word from mastered list
    function removeWordFromMastered(word, modal) {
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
            showNotification(`Word "${word}" has been permanently deleted`, 'success');

            // Refresh modal content
            refreshMasteredModal(modal);

            // Refresh main page statistics
            loadStats();
          });
        });
      }
    }

    // Refresh mastered words modal
    function refreshMasteredModal(modal) {
      chrome.storage.local.get('masteredWords', function(result) {
        const masteredWordsArray = result.masteredWords || [];

        if (masteredWordsArray.length === 0) {
          document.body.removeChild(modal);
          showNotification('Mastered words list has been cleared', 'info');
          return;
        }

        // Update modal content
        const wordCountElement = modal.querySelector('.word-count');
        if (wordCountElement) {
          wordCountElement.textContent = `Total: ${masteredWordsArray.length}`;
        }

        const searchStatsElement = modal.querySelector('#masteredSearchStats');
        if (searchStatsElement) {
          searchStatsElement.innerHTML = `Showing all ${masteredWordsArray.length} words`;
        }

        const container = modal.querySelector('#masteredWordsContainer');
        if (container) {
          container.innerHTML = renderMasteredWords(masteredWordsArray);
          bindMasteredWordDeleteEvents(modal);
        }

        // Clear search input
        const searchInput = modal.querySelector('#masteredSearchInput');
        if (searchInput) {
          searchInput.value = '';
        }
      });
    }

    // Export mastered words list
    function exportMasteredWords(masteredWordsArray) {
      const content = `Mastered Words List\nExport Time: ${new Date().toLocaleString()}\n\n${masteredWordsArray.map((word, index) => `${index + 1}. ${word}`).join('\n')}`;
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mastered_words_${new Date().toISOString().split('T')[0]}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showNotification('Mastered words list exported', 'success');
    }

    // Clear all mastered words
    function clearAllMasteredWords(modal) {
      chrome.storage.local.get(['masteredWords'], function(result) {
        const masteredWords = result.masteredWords || [];
        const count = masteredWords.length;

        if (count === 0) {
          showNotification('No mastered words to clear', 'warning');
          return;
        }

        if (confirm(`Are you sure you want to permanently delete all ${count} mastered words?\nThese words will be completely removed from the system and cannot be recovered.`)) {
          chrome.storage.local.get(['masteredWords', 'masteredWordsTimestamp', 'words', 'wordStats', 'wordLastSentence'], function(result) {
            let masteredWords = result.masteredWords || [];
            let masteredWordsTimestamp = result.masteredWordsTimestamp || {};
            let words = result.words || [];
            let wordStats = result.wordStats || {};
            let wordLastSentence = result.wordLastSentence || {};

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
              showNotification(`Permanently deleted ${count} mastered words`, 'success');
              document.body.removeChild(modal);
              loadStats();
            });
          });
        }
      });
    }

    // ==================== Utility Functions ====================

    // Import words from words.json to word list
    function importWordsFromJson() {
        if (confirm('Are you sure you want to import all words from words.json?\nThis may add a large number of words to your word list.')) {
            showNotification('Importing words...', 'info');

            fetch('./words.json')
                .then(response => response.json())
                .then(data => {
                    const wordsFromJson = data.words || [];

                    chrome.storage.local.get(['words', 'masteredWords'], function(result) {
                        let currentWords = result.words || [];
                        const masteredWords = result.masteredWords || [];

                        // Filter out words already in word list and mastered words
                        const newWords = wordsFromJson.filter(word => {
                            const normalizedWord = word.toLowerCase();
                            const isInCurrentWords = currentWords.some(w => {
                                const storedWord = typeof w === 'object' && w.word ? w.word : w;
                                return storedWord.toLowerCase() === normalizedWord;
                            });
                            const isInMastered = masteredWords.some(w => w.toLowerCase() === normalizedWord);
                            return !isInCurrentWords && !isInMastered;
                        });


                        if (newWords.length === 0) {
                            showNotification('No new words to import', 'warning');
                            return;
                        }

                        // Add new words to word list
                        const updatedWords = [...currentWords, ...newWords];

                        chrome.storage.local.set({ words: updatedWords }, function() {
                            if (chrome.runtime.lastError) {
                                showNotification('Import failed, please try again', 'error');
                                return;
                            }

                            showNotification(`Successfully imported ${newWords.length} new words!`, 'success');

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
                })
                .catch(error => {
                    showNotification('Failed to read words.json file', 'error');
                });
        }
    }

    function clearStats() {
        if (confirm('Are you sure you want to clear all statistics? This action cannot be undone.')) {
            chrome.storage.local.set({
                wordStats: {},
                wordLastSentence: {}
            }, function() {
                showNotification('Statistics cleared', 'success');
                loadStats();
            });
        }
    }

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
