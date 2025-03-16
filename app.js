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

// Breathing instructions
const instructions = {
    inhale: 'Breathe In',
    hold: 'Hold',
    exhale: 'Breathe Out',
    rest: 'Rest'
}

// Breathing animation control
function updateBreathingInstruction() {
    const instructionElement = document.querySelector('.instruction')
    let currentPhase = 0
    const phases = [
        { text: instructions.inhale, duration: 4000 },
        { text: instructions.hold, duration: 4000 },
        { text: instructions.exhale, duration: 4000 },
        { text: instructions.rest, duration: 2000 }
    ]

    function updatePhase() {
        instructionElement.textContent = phases[currentPhase].text
        currentPhase = (currentPhase + 1) % phases.length
    }

    updatePhase()
    setInterval(updatePhase, phases.reduce((sum, phase) => sum + phase.duration, 0))
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
            card.innerHTML = `
                <h2>${item.title || item.name}</h2>
                <p>${item.content || item.description}</p>
                <a href="${item.url || item.link}" target="_blank">Learn More →</a>
            `;
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
    updateBreathingInstruction()
    await initializeSupabase()
    await fetchContent()
})
