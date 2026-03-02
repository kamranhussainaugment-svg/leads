import axios from 'axios';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { niche, city, country, pages } = req.body;

    if (!niche || !country) {
        return res.status(400).json({ error: 'Niche and Country are required' });
    }

    const numPages = Math.min(parseInt(pages) || 1, 5); // Limit to 5 pages max to avoid timeout/blocking
    const leads = [];
    const seenEmails = new Set();

    // Search Query Construction
    // Strategy: Niche + City + Country + Email Providers
    // "Digital Marketing" "New York" "USA" "@gmail.com" OR "@yahoo.com"
    const location = city ? `"${city}" "${country}"` : `"${country}"`;
    const query = `${niche} ${location} email "@gmail.com" OR "@yahoo.com" OR "@hotmail.com" OR "@outlook.com"`;

    try {
        for (let i = 0; i < numPages; i++) {
            const start = i * 10;
            // Using DuckDuckGo HTML version to be polite and avoid heavy JS/Captchas (Google blocks very fast)
            // Note: DuckDuckGo HTML also has rate limits, but is often more permissible for small scripts
            // Alternatively, we can try Google with a User-Agent
            
            // Let's try a standard Google search with a proper User-Agent
            // Note: In production, you really need a proxy or SERP API (like SerpApi/BrightData)
            // This is a "best effort" implementation for a personal tool.
            
            const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&start=${start}`;
            
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5'
                }
            });

            const $ = cheerio.load(response.data);
            
            // Extract text from search results
            // Google structure changes, but usually results are in div.g or div.tF2Cxc
            // We'll scan the whole text content of the result snippet
            
            // Select result containers
            // If Google structure: .g contains title (h3) and snippet (.VwiC3b or .st)
            const results = $('div.g');

            results.each((index, element) => {
                const title = $(element).find('h3').first().text();
                const snippet = $(element).text(); // Grab all text in the result div
                
                // Regex for emails
                const emailRegex = /([a-zA-Z0-9._-]+@(gmail|hotmail|yahoo|outlook|aol|msn)\.com)/gi;
                const matches = snippet.match(emailRegex);

                if (matches) {
                    matches.forEach(email => {
                        const cleanEmail = email.toLowerCase();
                        if (!seenEmails.has(cleanEmail)) {
                            seenEmails.add(cleanEmail);
                            
                            // Try to infer name from Title (e.g. "John Doe - CEO - Company")
                            let name = title.split('-')[0].split('|')[0].trim();
                            if (name.length > 30) name = "Unknown Lead"; // Fallback if title is too long

                            leads.push({
                                name: name,
                                email: cleanEmail,
                                company: title, // Use title as company/source context
                                niche: niche,
                                country: country,
                                city: city || '',
                                source: 'Google Search'
                            });
                        }
                    });
                }
            });

            // Random delay between requests to be polite
            if (i < numPages - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
            }
        }

        return res.status(200).json({ success: true, leads });

    } catch (error) {
        console.error('Scraper Error:', error);
        // If Google blocks (429), return what we have or error
        if (error.response && error.response.status === 429) {
            return res.status(429).json({ error: 'Google blocked the request (Too Many Requests). Try again later or use fewer pages.' });
        }
        return res.status(500).json({ error: 'Failed to scrape leads: ' + error.message });
    }
}
