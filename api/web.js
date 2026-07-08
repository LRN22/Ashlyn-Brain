// Weather API for Ashlyn Brain — uses wttr.in (free, no API key needed)
const https = require('https');

function fetchText(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'AshlynBrain/1.0', 'Accept': 'text/plain' } }, (resp) => {
            let data = '';
            // Follow redirects
            if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
                fetchText(resp.headers.location).then(resolve).catch(reject);
                return;
            }
            resp.on('data', (chunk) => { data += chunk; });
            resp.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: 'Query required' });

        let summary = '';
        let sources = [];

        // Check if this is a weather query
        const isWeather = /weather|temperature|forecast|rain|sunny|cloud|hot|cold|tonight|tomorrow/i.test(query);

        if (isWeather) {
            // Use wttr.in for weather (free, no key)
            try {
                const weatherText = await fetchText('https://wttr.in/Beaumont+Texas?format=4');
                // format=4 gives: "Location: TempC, Condition"
                // Also get a more detailed summary
                const weatherJson = await fetchText('https://wttr.in/Beaumont+Texas?format=j1');
                const w = JSON.parse(weatherJson);
                const current = w.current_condition[0];
                const area = w.nearest_area[0].areaName[0].value;
                const today = w.weather[0];
                const tonight = today.hourly.find(h => parseInt(h.time) >= 0 && parseInt(h.time) <= 600) || today.hourly[0];
                
                summary = `Weather for ${area}, TX: Currently ${current.temp_F}F (${current.temp_C}C), ${current.weatherDesc[0].value}, humidity ${current.humidity}%, wind ${current.windspeedMiles}mph. `;
                summary += `Tonight: ${tonight.tempF}F, ${tonight.weatherDesc[0].value}, ${tonight.chanceofrain}% chance of rain. `;
                const tomorrow = w.weather[1];
                summary += `Tomorrow: ${tomorrow ? (tomorrow.mintempF + '-' + tomorrow.maxtempF + 'F') : 'N/A'}`;
                sources.push('https://wttr.in');
            } catch(e) {
                // Fallback to simpler format
                try {
                    const simple = await fetchText('https://wttr.in/Beaumont+Texas?format=%l:+%c+%t+%h+%w');
                    summary = 'Weather: ' + simple;
                    sources.push('https://wttr.in');
                } catch(e2) {
                    summary = 'I could not get weather data right now.';
                }
            }
        } else {
            // Non-weather query — use DuckDuckGo + Wikipedia
            const ddgUrl = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1';
            
            try {
                const ddgResponse = await fetch(ddgUrl);
                const ddgText = await ddgResponse.text();
                // Use eval since we can't use fetch in this Node version
                const https2 = require('https');
                
                // Actually let's use a simple approach
                const { execSync } = require('child_process');
            } catch(e) {}

            // Simple DuckDuckGo fetch
            await new Promise((resolve) => {
                https.get('https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1', { headers: { 'User-Agent': 'AshlynBrain/1.0' } }, (resp) => {
                    let data = '';
                    resp.on('data', (c) => data += c);
                    resp.on('end', () => {
                        try {
                            const ddgData = JSON.parse(data);
                            if (ddgData.AbstractText) summary = ddgData.AbstractText;
                            if (ddgData.AbstractURL) sources.push(ddgData.AbstractURL);
                            if (!summary && ddgData.Answer) summary = ddgData.Answer;
                            if (!summary && ddgData.RelatedTopics) {
                                const topics = ddgData.RelatedTopics.filter(t => t && t.Text).slice(0, 3).map(t => t.Text);
                                if (topics.length) summary = topics.join(' ');
                            }
                        } catch(e) {}
                        resolve();
                    });
                }).on('error', () => resolve());
            });

            // Wikipedia fallback
            if (!summary) {
                await new Promise((resolve) => {
                    const wikiQuery = query.split(' ').slice(0, 3).join('_');
                    https.get('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(wikiQuery), { headers: { 'User-Agent': 'AshlynBrain/1.0' } }, (resp) => {
                        let data = '';
                        resp.on('data', (c) => data += c);
                        resp.on('end', () => {
                            try {
                                const w = JSON.parse(data);
                                if (w.extract) { summary = w.extract; if (w.content_urls) sources.push(w.content_urls.desktop.page); }
                            } catch(e) {}
                            resolve();
                        });
                    }).on('error', () => resolve());
                });
            }
        }

        if (!summary) {
            summary = 'I could not find that. Try: https://www.google.com/search?q=' + encodeURIComponent(query);
            sources.push('https://www.google.com/search?q=' + encodeURIComponent(query));
        }

        if (summary.length > 2000) summary = summary.substring(0, 2000) + '...';
        return res.status(200).json({ summary, sources, query });
    } catch (error) {
        return res.status(200).json({ summary: 'Search failed. Try again!', sources: [], query: '' });
    }
};
