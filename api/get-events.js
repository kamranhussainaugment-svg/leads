export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { apiKey, tag } = req.body;

    if (!apiKey || !tag) {
        return res.status(400).json({ error: 'Missing API Key or Campaign Tag' });
    }

    try {
        // Fetch granular events for the specific tag
        // events types: sent, delivered, opened, clicks, hardBounce, softBounce, blocked, spam, unsubscribed
        const eventsUrl = `https://api.brevo.com/v3/smtp/statistics/events?limit=100&tags=${encodeURIComponent(tag)}`;
        
        const response = await fetch(eventsUrl, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey
            }
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.message || 'Failed to fetch events' });
        }

        // data.events is the array
        // Each event: { email: '...', date: '...', event: 'opened', ... }
        
        return res.status(200).json({ success: true, events: data.events || [] });

    } catch (error) {
        console.error('Events Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
