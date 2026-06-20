// Application State
let state = {
    updates: [],
    filteredUpdates: [],
    selectedId: null,
    activeCategory: 'all',
    searchQuery: '',
    currentTemplate: 'default',
    lastRefreshed: null
};

// Category Colors Mapping for Custom Properties
const CATEGORY_COLORS = {
    'Feature': '#10b981',
    'Announcement': '#3b82f6',
    'Changed': '#06b6d4',
    'Issue': '#f97316',
    'Bug fix': '#8b5cf6',
    'Deprecated': '#ef4444',
    'General': '#64748b'
};

// DOM Elements
const feedContainer = document.getElementById('feed-container');
const btnRefresh = document.getElementById('btn-refresh');
const searchInput = document.getElementById('search-input');
const btnClearSearch = document.getElementById('btn-clear-search');
const categoryPillsContainer = document.getElementById('category-pills');
const resultsCount = document.getElementById('results-count');
const filterSummary = document.getElementById('filter-summary');

// Composer DOM Elements
const composerPlaceholder = document.getElementById('composer-placeholder');
const composerActive = document.getElementById('composer-active');
const composerDate = document.getElementById('composer-date');
const composerBadge = document.getElementById('composer-badge');
const tweetTemplateSelect = document.getElementById('tweet-template');
const tweetTextArea = document.getElementById('tweet-text');
const charCounter = document.getElementById('char-counter');
const charCountFill = document.getElementById('char-count-fill');
const btnTweet = document.getElementById('btn-tweet');

// Stats DOM Elements
const statTotalCount = document.getElementById('stat-total-count');
const statLatestDate = document.getElementById('stat-latest-date');
const cacheStatus = document.getElementById('cache-status');
const cacheTime = document.getElementById('cache-time');
const toastElement = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Initialize the Application
document.addEventListener('DOMContentLoaded', () => {
    fetchReleases();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Refresh button click
    btnRefresh.addEventListener('click', () => {
        fetchReleases(true);
    });

    // Search input
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.toLowerCase().trim();
        
        if (state.searchQuery) {
            btnClearSearch.classList.remove('hidden');
        } else {
            btnClearSearch.classList.add('hidden');
        }
        
        applyFilters();
    });

    // Clear search button
    btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        btnClearSearch.classList.add('hidden');
        applyFilters();
        searchInput.focus();
    });

    // Category pills selection
    categoryPillsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('pill')) {
            // Remove active class from all pills
            document.querySelectorAll('#category-pills .pill').forEach(pill => {
                pill.classList.remove('active');
            });
            
            // Add active class to clicked pill
            e.target.classList.add('active');
            
            state.activeCategory = e.target.dataset.category;
            applyFilters();
        }
    });

    // Template selection change
    tweetTemplateSelect.addEventListener('change', (e) => {
        state.currentTemplate = e.target.value;
        const selectedUpdate = state.updates.find(u => u.id === state.selectedId);
        if (selectedUpdate) {
            updateComposerText(selectedUpdate);
        }
    });

    // Manual edits to Tweet text area
    tweetTextArea.addEventListener('input', () => {
        updateCharCounter();
    });

    // Share on X button click
    btnTweet.addEventListener('click', () => {
        const text = tweetTextArea.value;
        if (!text) return;
        
        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        window.open(twitterUrl, '_blank', 'noopener,noreferrer');
        showToast('Redirecting to Twitter/X...');
    });
}

// Fetch release notes from backend API
async function fetchReleases(forceRefresh = false) {
    // Show spinner & disable refresh button
    const spinner = btnRefresh.querySelector('.spinner-icon');
    spinner.classList.add('spinning');
    btnRefresh.disabled = true;
    
    if (forceRefresh) {
        showToast('Fetching latest BigQuery release notes...');
        feedContainer.innerHTML = `
            <div class="loading-state">
                <div class="loader"></div>
                <p>Fetching fresh data directly from Google Cloud Feeds...</p>
            </div>
        `;
    }

    try {
        const response = await fetch(`/api/releases?refresh=${forceRefresh}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'success') {
            state.updates = data.updates;
            state.lastRefreshed = new Date();
            
            // Render updates
            applyFilters();
            updateStats(data);
            
            if (forceRefresh) {
                showToast('Successfully refreshed release notes!');
            }
        } else {
            throw new Error(data.message || 'Failed to parse releases');
        }
    } catch (error) {
        console.error('Error fetching release notes:', error);
        showErrorState(error.message);
        showToast('Error: Failed to retrieve updates.', true);
    } finally {
        spinner.classList.remove('spinning');
        btnRefresh.disabled = false;
    }
}

// Apply Search and Category filters to state
function applyFilters() {
    state.filteredUpdates = state.updates.filter(update => {
        // Category filter
        const matchesCategory = state.activeCategory === 'all' || 
            update.category.toLowerCase() === state.activeCategory.toLowerCase();
            
        // Search query filter (matches in text content or category or date)
        const textMatch = update.text.toLowerCase().includes(state.searchQuery);
        const categoryMatch = update.category.toLowerCase().includes(state.searchQuery);
        const dateMatch = update.date.toLowerCase().includes(state.searchQuery);
        const matchesSearch = textMatch || categoryMatch || dateMatch;
        
        return matchesCategory && matchesSearch;
    });
    
    renderFeed();
    updateFilterSummary();
}

// Render the feed list cards
function renderFeed() {
    if (state.filteredUpdates.length === 0) {
        feedContainer.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
                <h3>No matching updates found</h3>
                <p>Try clearing your keyword filters or selecting a different category.</p>
            </div>
        `;
        resultsCount.textContent = '0 updates';
        return;
    }
    
    resultsCount.textContent = `${state.filteredUpdates.length} update${state.filteredUpdates.length > 1 ? 's' : ''}`;
    
    feedContainer.innerHTML = '';
    
    state.filteredUpdates.forEach(update => {
        const card = document.createElement('div');
        card.className = `release-card${state.selectedId === update.id ? ' selected' : ''}`;
        
        // Define color accent custom property
        const accentColor = CATEGORY_COLORS[update.category] || CATEGORY_COLORS['General'];
        card.style.setProperty('--card-accent', accentColor);
        
        // Map category to badge class
        const badgeClass = `badge-${update.category.toLowerCase().replace(' ', '')}`;
        
        card.innerHTML = `
            <div class="card-header">
                <span class="card-date">${update.date}</span>
                <span class="badge ${badgeClass}">${update.category}</span>
            </div>
            <div class="card-body">
                ${update.html}
            </div>
            <div class="card-footer">
                <a href="${update.link}" target="_blank" rel="noopener noreferrer" class="card-link" onclick="event.stopPropagation();">
                    <span>View Docs</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="7" y1="17" x2="17" y2="7"></line>
                        <polyline points="7 7 17 7 17 17"></polyline>
                    </svg>
                </a>
                <div class="card-tweet-actions">
                    <button class="btn btn-card-tweet" title="Draft Tweet">
                        <svg viewBox="0 0 24 24">
                            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                        <span>Tweet</span>
                    </button>
                </div>
            </div>
        `;
        
        // Select card on click
        card.addEventListener('click', () => {
            selectCard(update.id);
        });
        
        // Connect tweet button click (same as card select)
        const tweetBtn = card.querySelector('.btn-card-tweet');
        tweetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectCard(update.id);
            // Smooth scroll composer into view on mobile
            if (window.innerWidth <= 1024) {
                document.getElementById('tweet-composer-card').scrollIntoView({ behavior: 'smooth' });
            }
        });
        
        feedContainer.appendChild(card);
    });
}

// Select a specific card, updating composer
function selectCard(id) {
    state.selectedId = id;
    
    // Update card selection active states in UI
    document.querySelectorAll('.release-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Find the update in local list
    const update = state.updates.find(u => u.id === id);
    if (!update) return;
    
    // Find and add selected class to card in UI
    // To locate it, we can re-render or do query selector
    const cardElements = feedContainer.children;
    const indexInFiltered = state.filteredUpdates.findIndex(u => u.id === id);
    if (indexInFiltered !== -1 && cardElements[indexInFiltered]) {
        cardElements[indexInFiltered].classList.add('selected');
    }
    
    // Show composer
    composerPlaceholder.classList.add('hidden');
    composerActive.classList.remove('hidden');
    
    // Populate metadata
    composerDate.textContent = update.date;
    composerBadge.className = `badge badge-${update.category.toLowerCase().replace(' ', '')}`;
    composerBadge.textContent = update.category;
    
    // Generate text based on template
    updateComposerText(update);
}

// Generate the composer text based on template selection
function updateComposerText(update) {
    // Strip double spaces and simplify whitespace for clean tweets
    let rawText = update.text.replace(/\s+/g, ' ').trim();
    
    // Preset Templates
    const templates = {
        default: `🚀 BigQuery Update! [${update.category} - ${update.date}]\n\n{TEXT}\n\nRead details: ${update.link} #BigQuery #GoogleCloud`,
        minimal: `BigQuery ${update.category} update (${update.date}):\n\n{TEXT}\n\n${update.link}`,
        hype: `🔥 New BigQuery capability! [${update.category}]\n\n{TEXT}\n\nDetails: ${update.link} #GoogleCloud #BigQuery`,
        custom: `{TEXT}`
    };
    
    let templateStr = templates[state.currentTemplate] || templates.default;
    
    if (state.currentTemplate === 'custom') {
        tweetTextArea.value = rawText;
        updateCharCounter();
        return;
    }
    
    // Character Budget Calculation
    // Total character count = base layout characters + text size.
    // Must remain under 280.
    const emptyTemplateLength = templateStr.replace('{TEXT}', '').length;
    const maxTextLength = 280 - emptyTemplateLength;
    
    let textChunk = rawText;
    if (rawText.length > maxTextLength) {
        // Truncate text block with space for ellipsis
        textChunk = rawText.substring(0, maxTextLength - 3).trim() + "...";
    }
    
    tweetTextArea.value = templateStr.replace('{TEXT}', textChunk);
    updateCharCounter();
}

// Update Character Counter UI elements
function updateCharCounter() {
    const text = tweetTextArea.value;
    const length = text.length;
    charCounter.textContent = `${length} / 280`;
    
    // Calculate fill percentage (up to 100)
    const percentage = Math.min((length / 280) * 100, 100);
    charCountFill.style.width = `${percentage}%`;
    
    // Update color states based on limit
    if (length > 280) {
        charCounter.className = 'error';
        charCountFill.className = 'char-count-fill error';
        btnTweet.disabled = false; // We can still let them click, but they'll see X's error or can edit it
    } else if (length > 250) {
        charCounter.className = 'warning';
        charCountFill.className = 'char-count-fill warning';
        btnTweet.disabled = false;
    } else {
        charCounter.className = '';
        charCountFill.className = 'char-count-fill';
        btnTweet.disabled = false;
    }
}

// Update Stats Cards
function updateStats(data) {
    statTotalCount.textContent = data.count || 0;
    
    if (data.updates.length > 0) {
        statLatestDate.textContent = data.updates[0].date;
    } else {
        statLatestDate.textContent = '-';
    }
    
    // Update cache indicators
    if (data.fetched_new) {
        cacheStatus.textContent = 'Refreshed';
        cacheStatus.className = 'cache-green';
    } else {
        cacheStatus.textContent = 'Cached';
        cacheStatus.className = '';
    }
    
    updateCacheTimeDisplay();
}

// Helper to update the relative/absolute cached time display
function updateCacheTimeDisplay() {
    if (!state.lastRefreshed) return;
    
    const formatTime = (date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    
    cacheTime.textContent = formatTime(state.lastRefreshed);
}

// Update filter summary text dynamically
function updateFilterSummary() {
    let summary = 'Showing ';
    
    if (state.activeCategory === 'all') {
        summary += 'all updates';
    } else {
        summary += `only <strong>${state.activeCategory}s</strong>`;
    }
    
    if (state.searchQuery) {
        summary += ` matching "<em>${state.searchQuery}</em>"`;
    }
    
    filterSummary.innerHTML = summary;
}

// Render error states in feed
function showErrorState(msg) {
    feedContainer.innerHTML = `
        <div class="error-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h3>Unable to fetch release notes</h3>
            <p>Could not reach the Google Cloud Feed or the backend API server is unresponsive.</p>
            <p class="error-detail">${msg}</p>
            <button class="btn btn-primary" onclick="fetchReleases(true)">Try Again</button>
        </div>
    `;
}

// Show toast notifications
let toastTimeout;
function showToast(message, isError = false) {
    clearTimeout(toastTimeout);
    
    toastMessage.textContent = message;
    toastElement.classList.remove('hidden');
    
    if (isError) {
        toastElement.style.borderColor = 'var(--color-deprecated)';
        toastElement.style.boxShadow = '0 10px 30px rgba(239, 68, 68, 0.2)';
    } else {
        toastElement.style.borderColor = 'var(--primary)';
        toastElement.style.boxShadow = '0 10px 30px rgba(0, 242, 254, 0.2)';
    }
    
    toastTimeout = setTimeout(() => {
        toastElement.classList.add('hidden');
    }, 4000);
}
