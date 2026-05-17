document.addEventListener("DOMContentLoaded", function () {
  // Help button
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', function() {
      chrome.tabs.create({
        url: chrome.runtime.getURL('onboarding.html')
      });
    });
  }

  // Main navigation links
  const statsLink = document.querySelector('a[href="stats.html"]');
  const masteredLink = document.querySelector('a[href="mastered.html"]');

  // Handle stats page link click
  if (statsLink) {
    statsLink.addEventListener('click', function(e) {
      e.preventDefault();
      chrome.tabs.create({
        url: chrome.runtime.getURL('stats.html')
      });
    });
  }

  // Handle mastered words page link click
  if (masteredLink) {
    masteredLink.addEventListener('click', function(e) {
      e.preventDefault();
      chrome.tabs.create({
        url: chrome.runtime.getURL('mastered.html')
      });
    });
  }

  // Whitelist related elements
  const statusText = document.getElementById('statusText');
  const toggleWhitelistBtn = document.getElementById('toggleWhitelistBtn');
  const manageWhitelistBtn = document.getElementById('manageWhitelistBtn');
  const whitelistToggle = document.getElementById('whitelistToggle');
  const messageArea = document.getElementById('messageArea');

  // Initialize whitelist status
  initWhitelistStatus();


  // ==================== Whitelist Functions ====================

  // Initialize whitelist status
  function initWhitelistStatus() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        const currentUrl = new URL(tabs[0].url);
        const domain = currentUrl.hostname;

        chrome.storage.local.get(['whitelist', 'whitelistEnabled'], function(result) {
          const whitelist = result.whitelist || [];
          const whitelistEnabled = result.whitelistEnabled !== undefined ? result.whitelistEnabled : false;
          const isInWhitelist = whitelist.includes(domain);

          updateWhitelistUI(domain, isInWhitelist, whitelistEnabled);
        });
      }
    });
  }

  // Update whitelist UI
  function updateWhitelistUI(domain, isInWhitelist, whitelistEnabled) {
    const statusIndicator = document.getElementById('statusIndicator');

    if (statusText && toggleWhitelistBtn) {
      if (whitelistEnabled) {
        statusText.textContent = domain;
        if (isInWhitelist) {
          toggleWhitelistBtn.textContent = 'Remove from Whitelist';
          toggleWhitelistBtn.classList.remove('btn-outline');
          toggleWhitelistBtn.classList.add('btn-danger');
          if (statusIndicator) {
            statusIndicator.classList.remove('inactive');
            statusIndicator.classList.add('active');
          }
        } else {
          toggleWhitelistBtn.textContent = 'Add to Whitelist';
          toggleWhitelistBtn.classList.remove('btn-danger');
          toggleWhitelistBtn.classList.add('btn-outline');
          if (statusIndicator) {
            statusIndicator.classList.remove('active');
            statusIndicator.classList.add('inactive');
          }
        }
        toggleWhitelistBtn.disabled = false;
      } else {
        statusText.textContent = 'All sites will highlight';
        toggleWhitelistBtn.textContent = 'Add to Whitelist';
        toggleWhitelistBtn.disabled = true;
        toggleWhitelistBtn.classList.remove('btn-danger');
        toggleWhitelistBtn.classList.add('btn-outline');
        if (statusIndicator) {
          statusIndicator.classList.remove('active');
          statusIndicator.classList.add('inactive');
        }
      }
    }

    if (whitelistToggle) {
      whitelistToggle.checked = whitelistEnabled;
    }
  }

  // Toggle whitelist status
  function toggleWhitelist() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        const currentUrl = new URL(tabs[0].url);
        const domain = currentUrl.hostname;

        chrome.storage.local.get(['whitelist', 'whitelistEnabled'], function(result) {
          let whitelist = result.whitelist || [];
          const whitelistEnabled = result.whitelistEnabled !== undefined ? result.whitelistEnabled : false;
          const isInWhitelist = whitelist.includes(domain);

          if (isInWhitelist) {
            // Remove from whitelist
            whitelist = whitelist.filter(d => d !== domain);
          } else {
            // Add to whitelist
            whitelist.push(domain);
          }

          chrome.storage.local.set({ whitelist }, function() {
            updateWhitelistUI(domain, !isInWhitelist, whitelistEnabled);

            // Notify content script to refresh
            chrome.tabs.sendMessage(tabs[0].id, {action: "refreshHighlight"}, function() {
              // Ignore errors (tab may not have content script loaded)
              if (chrome.runtime.lastError) {
                // Silent handling
              }
            });

            // Show message
            const action = isInWhitelist ? 'Removed from' : 'Added to';
            showMessage(`${action} whitelist: ${domain}`, 'success');
          });
        });
      }
    });
  }

  // Toggle whitelist feature on/off
  function toggleWhitelistFeature() {
    chrome.storage.local.get(['whitelistEnabled'], function(result) {
      const currentState = result.whitelistEnabled !== undefined ? result.whitelistEnabled : false;
      const newState = !currentState;

      chrome.storage.local.set({ whitelistEnabled: newState }, function() {
        showMessage(newState ? 'Whitelist enabled' : 'Whitelist disabled', 'success');

        // Reinitialize UI
        initWhitelistStatus();

        // Notify all tabs to refresh highlights
        chrome.tabs.query({}, function(tabs) {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {action: "refreshHighlight"}, function() {
              // Ignore errors (some tabs may not be able to receive messages)
              if (chrome.runtime.lastError) {
                // Silent handling
              }
            });
          });
        });
      });
    });
  }

  // Open whitelist manager page
  function openWhitelistManager() {
    chrome.tabs.create({
      url: chrome.runtime.getURL('whitelist.html')
    });
  }

  // Show message
  function showMessage(message, type) {
    if (messageArea) {
      messageArea.textContent = message;
      messageArea.className = `message-area message-${type}`;
      setTimeout(() => {
        messageArea.textContent = '';
        messageArea.className = 'message-area';
      }, 3000);
    }
  }

  // Bind whitelist events
  if (toggleWhitelistBtn) {
    toggleWhitelistBtn.addEventListener('click', toggleWhitelist);
  }

  if (manageWhitelistBtn) {
    manageWhitelistBtn.addEventListener('click', openWhitelistManager);
  }

  if (whitelistToggle) {
    whitelistToggle.addEventListener('change', toggleWhitelistFeature);
  }
});
