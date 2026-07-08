// Chat API for Ashlyn Brain (CommonJS)
const https = require('https');

const dailyUsage = { day: '', calls: 0 };

function postJSON(url, body, headers) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                ...headers
            }
        };
        const req = https.request(options, (resp) => {
            let body = '';
            resp.on('data', (chunk) => { body += chunk; });
            resp.on('end', () => {
                try { resolve({ ok: resp.statusCode >= 200 && resp.statusCode < 300, data: JSON.parse(body) }); }
                catch(e) { resolve({ ok: false, data: null }); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { messages } = req.body;
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array required' });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'API key not configured', reply: 'My robot brain is not configured. Tell Grandpa to set the API key!' });
        }

        // Soft daily budget guard (approx) to keep spend around $2-3/day.
        // You can tune with DAILY_CHAT_LIMIT in Vercel env.
        const today = new Date().toISOString().slice(0, 10);
        if (dailyUsage.day !== today) {
            dailyUsage.day = today;
            dailyUsage.calls = 0;
        }
        const dailyLimit = parseInt(process.env.DAILY_CHAT_LIMIT || '250', 10);
        if (dailyUsage.calls >= dailyLimit) {
            return res.status(200).json({
                reply: 'Daily talk limit reached for today. Come back tomorrow!'
            });
        }
        dailyUsage.calls += 1;

        const result = await postJSON('https://api.openai.com/v1/chat/completions', {
            model: process.env.OPENAI_MODEL || 'gpt-4.1-nano',
            messages: messages,
            max_tokens: 70,
            temperature: 0.4
        }, { 'Authorization': 'Bearer ' + apiKey });

        if (!result.ok) {
            return res.status(200).json({
                error: 'AI service error',
                reply: "Oops, my robot brain is having trouble. Try again!"
            });
        }

        const reply = result.data.choices[0].message.content;
        return res.status(200).json({ reply });
    } catch (error) {
        return res.status(200).json({
            error: 'Internal error',
            reply: "Oops, my robot brain is having trouble. Try again!"
        });
    }
};