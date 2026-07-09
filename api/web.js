// Weather + search API for Ashlyn Brain
// Weather: wttr.in (free). Other: DuckDuckGo Instant Answer + Wikipedia summary.
const https = require('https');

function fetchText(url) {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'AshlynBrain/1.0',
                Accept: 'text/plain, application/json, */*'
            }
        }, (resp) => {
            let data = '';
            if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
                fetchText(resp.headers.location).then(resolve).catch(reject);
                return;
            }
            resp.on('data', (chunk) => { data += chunk; });
            resp.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function fetchJSON(url) {
    return fetchText(url).then((text) => {
        try { return JSON.parse(text); }
        catch (e) { return null; }
    });
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const { query } = req.body || {};
        if (!query) return res.status(400).json({ error: 'Query required' });

        let summary = '';
        let sources = [];

        const isWeather = /weather|temperature|forecast|rain|sunny|cloud|hot|cold|tonight|tomorrow|humidity|wind/i.test(query);

        if (isWeather) {
            try {
                const weatherJson = await fetchText('https://wttr.in/Beaumont+Texas?format=j1');
                const w = JSON.parse(weatherJson);
                const current = w.current_condition[0];
                const area = w.nearest_area[0].areaName[0].value;
                const today = w.weather[0];
                const tonight = today.hourly.find(h => parseInt(h.time, 10) >= 1800) ||
                    today.hourly[today.hourly.length - 1] ||
                    today.hourly[0];
                summary = `Weather for ${area}, TX: Currently ${current.temp_F}F (${current.temp_C}C), ${current.weatherDesc[0].value}, humidity ${current.humidity}%, wind ${current.windspeedMiles}mph. `;
                summary += `Tonight: ${tonight.tempF}F, ${tonight.weatherDesc[0].value}, ${tonight.chanceofrain}% chance of rain. `;
                const tomorrow = w.weather[1];
                summary += `Tomorrow: ${tomorrow ? (tomorrow.mintempF + '-' + tomorrow.maxtempF + 'F') : 'N/A'}`;
                sources.push('https://wttr.in/Beaumont+Texas');
            } catch (e) {
                try {
                    const simple = await fetchText('https://wttr.in/Beaumont+Texas?format=%l:+%c+%t+%h+%w');
                    summary = 'Weather: ' + simple;
                    sources.push('https://wttr.in/Beaumont+Texas');
                } catch (e2) {
                    summary = 'I could not get weather data right now.';
                }
            }
        } else {
            // DuckDuckGo Instant Answer
            try {
                const ddgData = await fetchJSON(
                    'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) +
                    '&format=json&no_html=1&skip_disambig=1'
                );
                if (ddgData) {
                    if (ddgData.AbstractText) summary = ddgData.AbstractText;
                    if (ddgData.AbstractURL) sources.push(ddgData.AbstractURL);
                    if (!summary && ddgData.Answer) summary = ddgData.Answer;
                    if (!summary && Array.isArray(ddgData.RelatedTopics)) {
                        const topics = ddgData.RelatedTopics
                            .filter(t => t && t.Text)
                            .slice(0, 3)
                            .map(t => t.Text);
                        if (topics.length) summary = topics.join(' ');
                    }
                }
            } catch (e) {}

            // Wikipedia fallback
            if (!summary) {
                try {
                    const wikiQuery = query.split(/\s+/).slice(0, 4).join('_');
                    const w = await fetchJSON(
                        'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(wikiQuery)
                    );
                    if (w && w.extract) {
                        summary = w.extract;
                        if (w.content_urls && w.content_urls.desktop && w.content_urls.desktop.page) {
                            sources.push(w.content_urls.desktop.page);
                        }
                    }
                } catch (e) {}
            }
        }

        if (!summary) {
            summary = 'I could not find that. Try Google: https://www.google.com/search?q=' + encodeURIComponent(query);
            sources.push('https://www.google.com/search?q=' + encodeURIComponent(query));
        }

        if (summary.length > 2000) summary = summary.substring(0, 2000) + '...';
        return res.status(200).json({ summary, sources, query });
    } catch (error) {
        console.error('web.js error', error);
        return res.status(200).json({ summary: 'Search failed. Try again!', sources: [], query: '' });
    }
};
