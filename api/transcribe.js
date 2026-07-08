// Transcription API for Ashlyn Brain — uses OpenAI Whisper API
// Records audio on the client, sends it here, we forward to OpenAI Whisper
const https = require('https');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

        // The audio comes as a blob in the request body
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        
        await new Promise((resolve, reject) => {
            req.on('end', resolve);
            req.on('error', reject);
        });

        const audioBuffer = Buffer.concat(chunks);
        if (audioBuffer.length === 0) return res.status(400).json({ error: 'No audio received' });

        // Send to OpenAI Whisper API using multipart/form-data
        const boundary = '----FormBoundary' + Math.random().toString(16).slice(2);
        const header = Buffer.from(
            '--' + boundary + '\r\n' +
            'Content-Disposition: form-data; name="file"; filename="audio.webm"\r\n' +
            'Content-Type: audio/webm\r\n\r\n'
        );
        const footer = Buffer.from(
            '\r\n--' + boundary + '\r\n' +
            'Content-Disposition: form-data; name="model"\r\n\r\n' +
            'whisper-1\r\n' +
            '--' + boundary + '\r\n' +
            'Content-Disposition: form-data; name="language"\r\n\r\n' +
            'en\r\n' +
            '--' + boundary + '--\r\n'
        );

        const body = Buffer.concat([header, audioBuffer, footer]);

        const options = {
            hostname: 'api.openai.com',
            path: '/v1/audio/transcriptions',
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Content-Type': 'multipart/form-data; boundary=' + boundary,
                'Content-Length': body.length
            }
        };

        const transcription = await new Promise((resolve, reject) => {
            const openaiReq = https.request(options, (resp) => {
                let data = '';
                resp.on('data', c => data += c);
                resp.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch(e) { resolve({ text: '' }); }
                });
            });
            openaiReq.on('error', reject);
            openaiReq.write(body);
            openaiReq.end();
        });

        const text = transcription.text || '';
        return res.status(200).json({ text });
    } catch (error) {
        return res.status(200).json({ text: '', error: 'Transcription failed' });
    }
};
