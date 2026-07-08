// Image generation endpoint for Ashlyn Brain — uses OpenAI DALL-E 3 API
const https = require('https');

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
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt required' });

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

        const result = await postJSON('https://api.openai.com/v1/images/generations', {
            model: 'gpt-image-1',
            prompt: prompt,
            n: 1,
            size: '1024x1024'
        }, { 'Authorization': 'Bearer ' + apiKey });

        if (!result.ok) {
            console.error('DALL-E error:', JSON.stringify(result.data));
            return res.status(200).json({ error: result.data?.error?.message || 'Image generation failed', url: null });
        }

        // gpt-image-1 returns base64, dall-e-3 returns URL
        let imageUrl = null;
        if (result.data.data[0].url) {
            imageUrl = result.data.data[0].url;
        } else if (result.data.data[0].b64_json) {
            imageUrl = 'data:image/png;base64,' + result.data.data[0].b64_json;
        }
        const revisedPrompt = result.data.data[0].revised_prompt || prompt;
        return res.status(200).json({ url: imageUrl, prompt: revisedPrompt });
    } catch (error) {
        return res.status(200).json({ error: 'Image generation failed', url: null });
    }
};
