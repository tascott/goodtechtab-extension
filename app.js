// Store Supabase credentials
let supabaseUrl;
let supabaseKey;

// Initialize Supabase credentials
async function initializeSupabase() {
    try {
        console.log('Starting Supabase initialization...');
        
        // Try to get credentials from Chrome storage first
        const stored = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
        console.log('Retrieved from storage:', stored);
        
        // If not in storage, use config values and store them
        if (!stored.supabaseUrl || !stored.supabaseKey) {
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
        const baseUrl = supabaseUrl.replace(/\/$/, '');
        
        const response = await fetch(`${baseUrl}/rest/v1/curated_content?select=*&limit=1`, {
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'omit'
        });

        if (response.status === 404) {
            console.log('Table does not exist yet, this is expected for first run');
        } else if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        } else {
            console.log('Supabase connection test successful');
        }
        
    } catch (error) {
        console.error('Error initializing Supabase:', error);
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
        
        if (currentTime < 6000) {
            inhaleText.style.opacity = Math.min(1, 2 * (currentTime / 6000));
            exhaleText.style.opacity = 0;
        } else {
            inhaleText.style.opacity = 0;
            exhaleText.style.opacity = Math.min(1, 2 * ((currentTime - 6000) / 6000));
        }
        
        requestAnimationFrame(animate);
    }
    
    animate();
}

// Fetch and display content from Supabase
async function fetchContent() {
    try {
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase credentials not initialized');
        }

        console.log('Fetching content...');
        console.log('Making API request to:', `${supabaseUrl}/rest/v1/curated_content`);
        
        // First, try a simple query to get all columns
        // Remove trailing slash if present
        const baseUrl = supabaseUrl.replace(/\/$/, '');
        
        const response = await fetch(
            `${baseUrl}/rest/v1/curated_content?select=*`, {
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'omit'
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log('Error response:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers),
                body: errorText
            });
            throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
        }

        const data = await response.json();
        const container = document.getElementById('content-container');
        container.innerHTML = '';

        console.log('Received data:', data);
        data.forEach(item => {
            console.log('Processing item:', item);
            const card = document.createElement('div');
            card.className = 'content-card';
            
            const title = document.createElement('h2');
            title.textContent = item.title || 'Untitled';

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'content-wrapper collapsed';

            const content = document.createElement('p');
            content.textContent = item.content || 'No content available';
            contentWrapper.appendChild(content);

            const expandButton = document.createElement('button');
            expandButton.className = 'expand-button';
            expandButton.innerHTML = '<span>Expand</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
            expandButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click
                contentWrapper.classList.toggle('collapsed');
                const isCollapsed = contentWrapper.classList.contains('collapsed');
                expandButton.innerHTML = isCollapsed ? 
                    '<span>Expand</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>' :
                    '<span>Collapse</span><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
            });

            const actionsWrapper = document.createElement('div');
            actionsWrapper.className = 'actions-wrapper';

            if (item.source_url) {
                const link = document.createElement('a');
                link.href = item.source_url;
                link.innerHTML = 'Read more <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>';
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                actionsWrapper.appendChild(link);
            }
            actionsWrapper.appendChild(expandButton);

            // Make the title area clickable to open the article
            const titleArea = document.createElement('div');
            titleArea.className = 'title-area';
            
            const titleWrapper = document.createElement('div');
            titleWrapper.className = 'title-wrapper';
            titleWrapper.appendChild(title);
            titleArea.appendChild(titleWrapper);
            titleArea.appendChild(expandButton);

            card.appendChild(titleArea);
            card.appendChild(contentWrapper);
            card.appendChild(actionsWrapper);
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Error fetching content:', error);
        const container = document.getElementById('content-container');
        container.innerHTML = `<div class="content-card error">
            <h2>Error Fetching Content</h2>
            <p>Error: ${error.message || error}</p>
            <p>Please check the console for more details.</p>
        </div>`;
    }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    updateBreathingText()
    await initializeSupabase()
    await fetchContent()
})
