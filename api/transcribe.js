// Transcription API for Ashlyn Brain — OpenAI Whisper
// Client sends raw audio blob; we multipart to Whisper.
const https = require('https');

function pickAudioMeta(contentTypeHeader) {
    const contentType = (contentTypeHeader || 'audio/webm').split(';')[0].trim().toLowerCase() || 'audio/webm';
    let ext = 'webm';
    if (contentType.includes('mp4') || contentType.includes('m4a') || contentType.includes('aac')) ext = 'mp4';
    else if (contentType.includes('mpeg') || contentType.includes('mp3')) ext = 'mp3';
    else if (contentType.includes('ogg') || contentType.includes('opus')) ext = 'ogg';
    else if (contentType.includes('wav')) ext = 'wav';
    else if (contentType.includes('webm')) ext = 'webm';
    return { contentType, ext };
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));

        await new Promise((resolve, reject) => {
            req.on('end', resolve);
            req.on('error', reject);
        });

        const audioBuffer = Buffer.concat(chunks);
        if (audioBuffer.length === 0) return res.status(400).json({ error: 'No audio received', text: '' });
        // Tiny blobs are almost always noise / mistaps — skip Whisper cost
        if (audioBuffer.length < 1200) return res.status(200).json({ text: '' });

        const { contentType, ext } = pickAudioMeta(req.headers['content-type']);
        const boundary = '----FormBoundary' + Math.random().toString(16).slice(2);
        const header = Buffer.from(
            '--' + boundary + '\r\n' +
            'Content-Disposition: form-data; name="file"; filename="audio.' + ext + '"\r\n' +
            'Content-Type: ' + contentType + '\r\n\r\n'
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
                Authorization: 'Bearer ' + apiKey,
                'Content-Type': 'multipart/form-data; boundary=' + boundary,
                'Content-Length': body.length
            }
        };

        const transcription = await new Promise((resolve, reject) => {
            const openaiReq = https.request(options, (resp) => {
                let data = '';
                resp.on('data', c => data += c);
                resp.on('end', () => {
                    try { resolve({ status: resp.statusCode, ...JSON.parse(data) }); }
                    catch (e) { resolve({ status: resp.statusCode, text: '' }); }
                });
            });
            openaiReq.on('error', reject);
            openaiReq.write(body);
            openaiReq.end();
        });

        const text = (transcription.text || '').trim();
        if (!text && transcription.error) {
            console.error('Whisper error', transcription);
        }
        return res.status(200).json({ text });
    } catch (error) {
        console.error('transcribe.js error', error);
        return res.status(200).json({ text: '', error: 'Transcription failed' });
    }
};
