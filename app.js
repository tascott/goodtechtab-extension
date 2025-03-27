// Store Supabase credentials
let supabaseUrl;
let supabaseKey;

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
            // Skip if we've already seen this title
            if(uniqueTitles.has(item.title)) {
                const existingItem = duplicateTitles.get(item.title);
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
            uniqueTitles.add(item.title);
            duplicateTitles.set(item.title,{
                panel: panelType,
                content_type: item.content_type
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
                expandButton.innerHTML = '<span>Expand</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
                expandButton.addEventListener('click',(e) => {
                    e.stopPropagation(); // Prevent card click
                    contentWrapper.classList.toggle('collapsed');
                    const isCollapsed = contentWrapper.classList.contains('collapsed');
                    expandButton.innerHTML = isCollapsed ?
                        '<span>Expand</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' :
                        '<span>Collapse</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
                });
            }

            const actionsWrapper = document.createElement('div');
            actionsWrapper.className = 'actions-wrapper';

            if(expandButton) {
                actionsWrapper.appendChild(expandButton);
            }

            if(item.source_url) {
                const link = document.createElement('a');
                link.href = item.source_url;
                link.innerHTML = 'Read more <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                actionsWrapper.appendChild(link);
            }

            // Make the title area clickable to open the article
            const titleArea = document.createElement('div');
            titleArea.className = 'title-area';

            const titleWrapper = document.createElement('div');
            titleWrapper.className = 'title-wrapper';
            titleWrapper.appendChild(title);
            titleArea.appendChild(titleWrapper);
            if(expandButton) {
                titleArea.appendChild(expandButton);
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
    updateBreathingText()
    await initializeSupabase()
    await fetchContent()
})
