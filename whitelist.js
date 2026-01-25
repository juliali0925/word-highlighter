document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements
    const domainInput = document.getElementById('domainInput');
    const addDomainBtn = document.getElementById('addDomainBtn');
    const whitelistContainer = document.getElementById('whitelistContainer');
    const clearAllBtn = document.getElementById('clearAllBtn');
    const backBtn = document.getElementById('backBtn');
    const messageDiv = document.getElementById('message');

    // Initialize
    loadWhitelist();
    bindEventListeners();

    // ==================== Core Functions ====================

    // Load whitelist
    function loadWhitelist() {
        chrome.storage.local.get(['whitelist'], function(result) {
            const whitelist = result.whitelist || [];
            renderWhitelist(whitelist);
        });
    }

    // Render whitelist
    function renderWhitelist(whitelist) {
        if (whitelist.length === 0) {
            whitelistContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🌐</div>
                    <div class="empty-text">Whitelist is empty</div>
                    <div class="empty-subtext">Add website domains to the whitelist. Only these sites will highlight words.</div>
                </div>
            `;
            return;
        }

        whitelistContainer.innerHTML = whitelist.map(domain => `
            <div class="whitelist-item" data-domain="${domain}">
                <div class="domain-info">
                    <div class="domain-name">${domain}</div>
                    <div class="domain-added">Added to whitelist</div>
                </div>
                <button class="remove-btn" data-domain="${domain}">Remove</button>
            </div>
        `).join('');

        // Bind remove button events
        bindRemoveEvents();
    }

    // Add domain to whitelist
    function addDomain() {
        const domain = domainInput.value.trim().toLowerCase();

        if (!domain) {
            showMessage('Please enter a domain', 'error');
            return;
        }

        // Validate domain format
        if (!isValidDomain(domain)) {
            showMessage('Please enter a valid domain format', 'error');
            return;
        }

        chrome.storage.local.get(['whitelist'], function(result) {
            let whitelist = result.whitelist || [];

            if (whitelist.includes(domain)) {
                showMessage('This domain is already in the whitelist', 'error');
                return;
            }

            whitelist.push(domain);

            chrome.storage.local.set({ whitelist }, function() {
                showMessage(`Added ${domain} to whitelist`, 'success');
                domainInput.value = '';
                renderWhitelist(whitelist);
            });
        });
    }

    // Remove domain from whitelist
    function removeDomain(domain) {
        if (confirm(`Are you sure you want to remove "${domain}" from the whitelist?`)) {
            chrome.storage.local.get(['whitelist'], function(result) {
                let whitelist = result.whitelist || [];
                whitelist = whitelist.filter(d => d !== domain);

                chrome.storage.local.set({ whitelist }, function() {
                    showMessage(`Removed ${domain} from whitelist`, 'success');
                    renderWhitelist(whitelist);
                });
            });
        }
    }

    // Clear all whitelist
    function clearAllWhitelist() {
        chrome.storage.local.get(['whitelist'], function(result) {
            const whitelist = result.whitelist || [];
            const count = whitelist.length;

            if (count === 0) {
                showMessage('Whitelist is already empty', 'error');
                return;
            }

            if (confirm(`Are you sure you want to clear all ${count} domains from the whitelist?\nThis will stop word highlighting on all sites.`)) {
                chrome.storage.local.set({ whitelist: [] }, function() {
                    showMessage(`Cleared ${count} domains`, 'success');
                    renderWhitelist([]);
                });
            }
        });
    }

    // ==================== Utility Functions ====================

    // Validate domain format
    function isValidDomain(domain) {
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?)*$/;
        return domainRegex.test(domain) && domain.length <= 253;
    }

    // Show message
    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';

        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 3000);
    }

    // Bind remove button events
    function bindRemoveEvents() {
        const removeButtons = document.querySelectorAll('.remove-btn');
        removeButtons.forEach(button => {
            button.addEventListener('click', function() {
                const domain = this.getAttribute('data-domain');
                removeDomain(domain);
            });
        });
    }

    // ==================== Event Bindings ====================

    function bindEventListeners() {
        // Add domain button
        if (addDomainBtn) {
            addDomainBtn.addEventListener('click', addDomain);
        }

        // Input enter key
        if (domainInput) {
            domainInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    addDomain();
                }
            });
        }

        // Clear all button
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', clearAllWhitelist);
        }

        // Back button
        if (backBtn) {
            backBtn.addEventListener('click', function() {
                window.close();
            });
        }

        // Navigation links
        const navLinks = document.querySelectorAll('.nav-links a');
        navLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const href = this.getAttribute('href');
                chrome.tabs.create({
                    url: chrome.runtime.getURL(href)
                });
            });
        });
    }
});
