export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { apiKey, tag } = req.body;

    if (!apiKey || !tag) {
        return res.status(400).json({ error: 'Missing API Key or Campaign Tag' });
    }

    try {
        // Fetch aggregated report for the specific tag
        const response = await fetch(`https://api.brevo.com/v3/smtp/statistics/reports?tag=${encodeURIComponent(tag)}`, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey
            }
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.message || 'Failed to fetch stats' });
        }

        // Brevo returns an array of reports (usually grouped by day/month if requested, or just one aggregated object)
        // Check structure: { reports: [ { date: '...', requests: 10, delivered: 9, opens: 5, clicks: 1, ... } ] }
        
        let stats = {
            requests: 0,
            delivered: 0,
            opens: 0,
            clicks: 0,
            hardBounces: 0,
            softBounces: 0,
            blocked: 0,
            spamReports: 0
        };

        if (data.reports && data.reports.length > 0) {
            // Sum up all reports (in case it returns daily breakdown)
            data.reports.forEach(report => {
                stats.requests += report.requests || 0;
                stats.delivered += report.delivered || 0;
                stats.opens += report.opens || 0;
                stats.clicks += report.clicks || 0;
                stats.hardBounces += report.hardBounces || 0;
                stats.softBounces += report.softBounces || 0;
                stats.blocked += report.blocked || 0;
                stats.spamReports += report.spamReports || 0;
            });
        }

        return res.status(200).json({ success: true, stats });

    } catch (error) {
        console.error('Stats Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
