// Store Supabase credentials
let supabaseUrl;
let supabaseKey;

// Bookmark management
let bookmarks = [];

// Initialize bookmarks from storage
async function initializeBookmarks() {
    const stored = await chrome.storage.local.get(['bookmarks']);
    bookmarks = stored.bookmarks || [];
    renderBookmarks();
}

// Save bookmarks to storage
async function saveBookmarks() {
    await chrome.storage.local.set({bookmarks});
    renderBookmarks();
}

// Add new bookmark
async function addBookmark(url,title) {
    try {
        // Add https if no protocol is specified
        if(!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        // Validate URL
        const urlObj = new URL(url);
        const favicon = `https://www.google.com/s2/favicons?sz=32&domain=${urlObj.hostname}`;
        bookmarks.push({url,title,favicon});
        await saveBookmarks();

        // Clear form
        const form = document.querySelector('.add-bookmark-form');
        if(form) {
            form.reset();
            form.classList.add('collapsed');
        }
    } catch(error) {
        console.error('Error adding bookmark:',error);
        const errorElement = document.querySelector('.bookmark-error');
        if(errorElement) {
            errorElement.textContent = 'Please enter a valid URL';
            errorElement.style.display = 'block';
            setTimeout(() => {
                errorElement.style.display = 'none';
            },3000);
        }
    }
}

// Remove bookmark
async function removeBookmark(index) {
    bookmarks.splice(index,1);
    await saveBookmarks();
}

// Render bookmarks
function renderBookmarks() {
    const bookmarksContainer = document.querySelector('.bookmarks-container');
    if(!bookmarksContainer) return;

    bookmarksContainer.innerHTML = `
        <div class="bookmarks-header">
            <h3 class="section-header">Bookmarks</h3>
            <button id="add-bookmark" class="add-bookmark-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add Tab
            </button>
        </div>
        <form class="add-bookmark-form collapsed">
            <div class="form-group">
                <input type="text" id="bookmark-url" placeholder="Enter URL" required>
                <input type="text" id="bookmark-title" placeholder="Enter title (optional)">
                <div class="bookmark-error"></div>
            </div>
            <div class="form-actions">
                <button type="submit" class="save-bookmark-btn">Save</button>
                <button type="button" class="cancel-bookmark-btn">Cancel</button>
            </div>
        </form>
        <div class="bookmarks-list">
            ${bookmarks.map((bookmark,index) => `
                <div class="bookmark-item">
                    <img src="${bookmark.favicon}" alt="" class="bookmark-favicon" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222%22><path d=%22M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z%22/></svg>'"/>
                    <a href="${bookmark.url}" class="bookmark-link">${bookmark.title}</a>
                    <button class="remove-bookmark" data-index="${index}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            `).join('')}
        </div>
    `;

    // Add event listeners
    const form = document.querySelector('.add-bookmark-form');
    const addButton = document.getElementById('add-bookmark');
    const cancelButton = document.querySelector('.cancel-bookmark-btn');

    addButton?.addEventListener('click',() => {
        form.classList.remove('collapsed');
    });

    cancelButton?.addEventListener('click',() => {
        form.classList.add('collapsed');
        form.reset();
        document.querySelector('.bookmark-error').style.display = 'none';
    });

    form?.addEventListener('submit',(e) => {
        e.preventDefault();
        const url = document.getElementById('bookmark-url').value;
        let title = document.getElementById('bookmark-title').value;

        if(!title) {
            try {
                const urlObj = new URL(url.startsWith('http') ? url : 'https://' + url);
                title = urlObj.hostname.replace('www.','');
            } catch {
                title = url;
            }
        }

        addBookmark(url,title);
    });

    document.querySelectorAll('.remove-bookmark').forEach(button => {
        button.addEventListener('click',(e) => {
            const index = parseInt(e.currentTarget.dataset.index);
            removeBookmark(index);
        });
    });

    document.querySelectorAll('.bookmark-link').forEach(link => {
        link.addEventListener('click',(e) => {
            e.preventDefault();
            window.location.href = link.href;
        });
    });
}

// Initialize Supabase credentials
async function initializeSupabase() {
    try {
        console.log('Starting Supabase initialization...');

        // Try to get credentials from Chrome storage first
        const stored = await chrome.storage.local.get(['supabaseUrl','supabaseKey']);
        console.log('Retrieved from storage:',stored);

        // If not in storage, use config values and store them
        if(!stored.supabaseUrl || !stored.supabaseKey) {
            console.log('Using config values...');
            supabaseUrl = CONFIG.SUPABASE_URL;
            supabaseKey = CONFIG.SUPABASE_ANON_KEY;
            await chrome.storage.local.set({
                supabaseUrl: supabaseUrl,
                supabaseKey: supabaseKey
            });
        } else {
            supabaseUrl = stored.supabaseUrl;
            supabaseKey = stored.supabaseKey;
        }

        // Test the connection with proper headers
        // Remove trailing slash if present
        const baseUrl = supabaseUrl.replace(/\/$/,'');

        const response = await fetch(`${baseUrl}/rest/v1/curated_content?select=*&limit=1`,{
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'omit'
        });

        if(response.status === 404) {
            console.log('Table does not exist yet, this is expected for first run');
        } else if(!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        } else {
            console.log('Supabase connection test successful');
        }

    } catch(error) {
        console.error('Error initializing Supabase:',error);
        // Display error in the UI
        const container = document.getElementById('content-container');
        container.innerHTML = `<div class="content-card error">
            <h2>Error Initializing</h2>
            <p>Error: ${error.message || error}</p>
            <p>Please check the console for more details.</p>
        </div>`;
        throw error;
    }
}

// Breathing animation control
function updateBreathingText() {
    const inhaleText = document.querySelector('.inhale');
    const exhaleText = document.querySelector('.exhale');
    const cycleTime = 12000; // 12 seconds per complete cycle

    function animate() {
        const currentTime = Date.now() % cycleTime;

        if(currentTime < 6000) {
            inhaleText.style.opacity = Math.min(1,2 * (currentTime / 6000));
            exhaleText.style.opacity = 0;
        } else {
            inhaleText.style.opacity = 0;
            exhaleText.style.opacity = Math.min(1,2 * ((currentTime - 6000) / 6000));
        }

        requestAnimationFrame(animate);
    }

    animate();
}

// Check if we should fetch new data based on time
function shouldFetchNewData(lastFetchTime) {
    if(!lastFetchTime) {
        console.log('No previous fetch time found, will fetch new data');
        return true;
    }

    const now = new Date();
    const lastFetch = new Date(lastFetchTime);

    // Get today's fetch times
    const today7am = new Date(now);
    today7am.setHours(7,0,0,0);

    const today5pm = new Date(now);
    today5pm.setHours(17,0,0,0);

    console.log('Time check:',{
        currentTime: now.toLocaleString(),
        lastFetchTime: lastFetch.toLocaleString(),
        next7amFetch: today7am.toLocaleString(),
        next5pmFetch: today5pm.toLocaleString()
    });

    // If last fetch was before today's 7am and current time is after 7am, fetch
    if(lastFetch < today7am && now >= today7am) {
        console.log('Last fetch was before 7am and current time is after 7am - fetching new data');
        return true;
    }

    // If last fetch was before today's 5pm and current time is after 5pm, fetch
    if(lastFetch < today5pm && now >= today5pm) {
        console.log('Last fetch was before 5pm and current time is after 5pm - fetching new data');
        return true;
    }

    console.log('Using cached data - next fetch will be at:',
        now < today7am ? '7am today' :
            now < today5pm ? '5pm today' :
                '7am tomorrow');
    return false;
}

// Fetch and display content from Supabase
async function fetchContent() {
    try {
        if(!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase credentials not initialized');
        }

        // Check storage for cached data and last fetch time
        const stored = await chrome.storage.local.get(['lastFetchTime','deepResearchData','otherContentData']);
        let deepResearchData,otherContentData;

        console.log('Cache status:',{
            hasCachedData: !!(stored.deepResearchData && stored.otherContentData),
            lastFetchTime: stored.lastFetchTime ? new Date(stored.lastFetchTime).toLocaleString() : 'never'
        });

        // Determine if we need to fetch new data
        if(!shouldFetchNewData(stored.lastFetchTime)) {
            console.log('Using cached data from:',new Date(stored.lastFetchTime).toLocaleString());
            deepResearchData = stored.deepResearchData;
            otherContentData = stored.otherContentData;
        } else {
            console.log('Fetching fresh data...');
            const baseUrl = supabaseUrl.replace(/\/$/,'');

            // First API call for deep research content
            const deepResearchResponse = await fetch(
                `${baseUrl}/rest/v1/curated_content?select=*&content_type=in.(openai_deep_research,perplexity_deep_research)`,{
                method: 'GET',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'omit'
            });

            // Second API call for other content
            const otherContentResponse = await fetch(
                `${baseUrl}/rest/v1/curated_content?select=*&content_type=not.in.(openai_deep_research,perplexity_deep_research)`,{
                method: 'GET',
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'omit'
            });

            if(!deepResearchResponse.ok || !otherContentResponse.ok) {
                const errorText1 = await deepResearchResponse.text();
                const errorText2 = await otherContentResponse.text();
                console.log('Error responses:',{
                    deepResearch: {
                        status: deepResearchResponse.status,
                        statusText: deepResearchResponse.statusText,
                        body: errorText1
                    },
                    otherContent: {
                        status: otherContentResponse.status,
                        statusText: otherContentResponse.statusText,
                        body: errorText2
                    }
                });
                throw new Error(`HTTP error! Check console for details.`);
            }

            // Get fresh data
            deepResearchData = await deepResearchResponse.json();
            otherContentData = await otherContentResponse.json();

            // Cache the new data and update last fetch time
            await chrome.storage.local.set({
                lastFetchTime: new Date().toISOString(),
                deepResearchData,
                otherContentData
            });
            console.log('Data cached at:',new Date().toISOString());
        }

        // Get or create containers for both panels
        const leftPanel = document.querySelector('.panel-left .panel-content');
        const rightPanel = document.querySelector('.panel-right .panel-content');

        // Create content containers if they don't exist
        let leftContainer = leftPanel.querySelector('#content-container');
        let rightContainer = rightPanel.querySelector('#content-container');
        let nonTechContainer = rightPanel.querySelector('.non-tech-content');

        if(!leftContainer) {
            leftContainer = document.createElement('div');
            leftContainer.id = 'content-container';
            leftPanel.appendChild(leftContainer);
        }

        if(!rightContainer) {
            rightContainer = document.createElement('div');
            rightContainer.id = 'content-container';
            rightPanel.appendChild(rightContainer);
        }

        if(!nonTechContainer) {
            nonTechContainer = document.createElement('div');
            nonTechContainer.className = 'non-tech-content';
            rightPanel.appendChild(nonTechContainer);
        }

        // Clear existing content
        leftContainer.innerHTML = '';
        rightContainer.innerHTML = '';
        nonTechContainer.innerHTML = '';

        // Add headers to right panel sections
        const techHeader = document.createElement('h3');
        techHeader.textContent = 'Tech RSS feeds (good and neutral)';
        techHeader.className = 'section-header';
        rightContainer.appendChild(techHeader);

        const nonTechHeader = document.createElement('h3');
        nonTechHeader.textContent = 'Good news outside tech';
        nonTechHeader.className = 'section-header';
        nonTechContainer.appendChild(nonTechHeader);

        // Track unique titles to avoid duplicates
        const uniqueTitles = new Set();
        const duplicateTitles = new Map();

        // Function to create and append a card
        function createAndAppendCard(item,container,panelType) {
            // Skip if we've already seen this title (case insensitive)
            const titleLowerCase = item.title.toLowerCase();
            if(uniqueTitles.has(titleLowerCase)) {
                const existingItem = duplicateTitles.get(titleLowerCase);
                console.log(`Duplicate title found: "${item.title}"`,{
                    existing: {
                        panel: existingItem.panel,
                        content_type: existingItem.content_type
                    },
                    duplicate: {
                        panel: panelType,
                        content_type: item.content_type
                    }
                });
                return;
            }
            uniqueTitles.add(titleLowerCase);
            duplicateTitles.set(titleLowerCase,{
                panel: panelType,
                content_type: item.content_type,
                originalTitle: item.title
            });

            const card = document.createElement('div');
            card.className = 'content-card';

            const title = document.createElement('h3');
            title.textContent = item.title || 'Untitled';

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'content-wrapper collapsed';

            const content = document.createElement('p');
            content.textContent = item.content || 'No content available';
            contentWrapper.appendChild(content);

            // Only create expand button if there is content
            let expandButton = null;
            if(item.content) {
                expandButton = document.createElement('button');
                expandButton.className = 'expand-button';
                expandButton.innerHTML = '<span style="color: white;">Expand</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
                expandButton.addEventListener('click',(e) => {
                    e.stopPropagation(); // Prevent card click
                    contentWrapper.classList.toggle('collapsed');
                    const isCollapsed = contentWrapper.classList.contains('collapsed');
                    expandButton.innerHTML = isCollapsed ?
                        '<span style="color: white;">Expand</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' :
                        '<span style="color: white;">Collapse</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 15 12 9 18 15"></polyline></svg>';
                });
            }

            const actionsWrapper = document.createElement('div');
            actionsWrapper.className = 'actions-wrapper';

            // Create read more link
            let readMoreLink = null;
            if(item.source_url) {
                readMoreLink = document.createElement('a');
                readMoreLink.href = item.source_url;
                readMoreLink.innerHTML = '<span style="color: white;">Read</span> <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>';
                readMoreLink.target = '_blank';
                readMoreLink.rel = 'noopener noreferrer';
            }

            // Make the title area clickable to open the article
            const titleArea = document.createElement('div');
            titleArea.className = 'title-area';

            const titleWrapper = document.createElement('div');
            titleWrapper.className = 'title-wrapper';
            titleWrapper.appendChild(title);
            titleArea.appendChild(titleWrapper);

            // Add read more link to title area if it exists
            if(readMoreLink) {
                titleArea.appendChild(readMoreLink);
            }

            // Add expand button to actions wrapper if it exists
            if(expandButton) {
                actionsWrapper.appendChild(expandButton);
            }

            card.appendChild(titleArea);
            card.appendChild(contentWrapper);
            card.appendChild(actionsWrapper);
            container.appendChild(card);
        }

        // Render deep research content in left panel
        console.log('Rendering deep research content:',deepResearchData);
        deepResearchData.forEach(item => createAndAppendCard(item,leftContainer,'left'));

        // Split and render other content
        console.log('Processing other content:',otherContentData);
        otherContentData.forEach(item => {
            if(item.content_type === 'rss_reddit_goodnews') {
                createAndAppendCard(item,nonTechContainer,'non-tech');
            } else {
                createAndAppendCard(item,rightContainer,'right');
            }
        });

    } catch(error) {
        console.error('Error fetching content:',error);
        const leftContainer = document.querySelector('.panel-left #content-container');
        const rightContainer = document.querySelector('.panel-right #content-container');
        const nonTechContainer = document.querySelector('.non-tech-content');
        const errorMessage = `<div class="content-card error">
            <h2>Error Fetching Content</h2>
            <p>Error: ${error.message || error}</p>
            <p>Please check the console for more details.</p>
        </div>`;
        leftContainer.innerHTML = errorMessage;
        rightContainer.innerHTML = errorMessage;
        nonTechContainer.innerHTML = errorMessage;
    }
}

// Initialize the page
document.addEventListener('DOMContentLoaded',async () => {
    // Get the center panel
    const centerPanel = document.querySelector('.panel-center');
    if(!centerPanel) {
        console.error('Center panel not found');
        return;
    }

    // Create a container for the breathing exercise
    const breathingContainer = document.createElement('div');
    breathingContainer.className = 'breathing-container';

    // Create the breathing orb structure
    breathingContainer.innerHTML = `
        <div class="container">
            <div class="breathing-orb"></div>
            <div class="breath-indicator inhale">Inhale...</div>
            <div class="breath-indicator exhale">Exhale...</div>
        </div>
    `;

    // Clear and set up the center panel
    centerPanel.innerHTML = '';

    // Create bookmarks container
    const bookmarksContainer = document.createElement('div');
    bookmarksContainer.className = 'bookmarks-container';

    // Add both containers to the center panel
    centerPanel.appendChild(breathingContainer);
    centerPanel.appendChild(bookmarksContainer);

    // Initialize everything
    updateBreathingText();
    await initializeBookmarks();
    await initializeSupabase();
    await fetchContent();
});
