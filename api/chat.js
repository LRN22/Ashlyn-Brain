// Chat API for Ashlyn Brain (CommonJS)
const https = require('https');

const dailyUsage = { day: '', calls: 0 };

function postJSON(url, body, headers) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + (urlObj.search || ''),
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
                try {
                    resolve({
                        ok: resp.statusCode >= 200 && resp.statusCode < 300,
                        status: resp.statusCode,
                        data: JSON.parse(body)
                    });
                } catch (e) {
                    resolve({ ok: false, status: resp.statusCode, data: null });
                }
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
        const { messages } = req.body || {};
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array required' });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                error: 'API key not configured',
                reply: 'My robot brain is not configured. Tell Grandpa to set the API key!'
            });
        }

        // Soft guard only (per warm instance). Prefer OpenAI dashboard hard caps for real spend limits.
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

        const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const maxTokens = parseInt(process.env.OPENAI_MAX_TOKENS || '150', 10);

        const result = await postJSON('https://api.openai.com/v1/chat/completions', {
            model,
            messages,
            max_tokens: maxTokens,
            temperature: 0.7
        }, { Authorization: 'Bearer ' + apiKey });

        if (!result.ok) {
            console.error('OpenAI chat error', result.status, JSON.stringify(result.data));
            return res.status(200).json({
                error: 'AI service error',
                reply: "Oops, my robot brain is having trouble. Try again!"
            });
        }

        const reply = result.data && result.data.choices && result.data.choices[0]
            && result.data.choices[0].message
            && result.data.choices[0].message.content;
        if (!reply) {
            return res.status(200).json({
                error: 'Empty AI response',
                reply: "Oops, my robot brain is having trouble. Try again!"
            });
        }
        return res.status(200).json({ reply });
    } catch (error) {
        console.error('chat.js error', error);
        return res.status(200).json({
            error: 'Internal error',
            reply: "Oops, my robot brain is having trouble. Try again!"
        });
    }
};
