import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const app = express().use(bodyParser.json());
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

async function getCokuResponse(userMessage, imageUrl = null) {
    let contents = [{ type: "text", text: userMessage }];
    if (imageUrl) contents.push({ type: "image_url", image_url: { url: imageUrl } });

    try {
        const res = await axios.post('https://text.pollinations.ai/v1/chat/completions', {
            model: 'openai', 
            messages: [
                { role: 'system', content: 'أنت Coku، مساعد ذكي بالفصحى مطور بواسطة ويزي. يمكنك رؤية الصور وتحليلها.' },
                { role: 'user', content: contents }
            ]
        }, { timeout: 8000 });
        return res.data.choices[0].message.content;
    } catch (e) { return "عذراً، أحتاج لثوانٍ للتفكير!"; }
}

app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        // بنشيل الـ res.send من هنا ونحطها في الآخر
        
        for (let entry of body.entry) {
            let event = entry.messaging[0];
            let sender_id = event.sender.id;
            let text = event.message?.text || "";
            let image = null;

            if (event.message?.attachments && event.message.attachments[0].type === 'image') {
                image = event.message.attachments[0].payload.url;
                text = text || "حلل هذه الصورة";
            }

            if (text || image) {
                const reply = await getCokuResponse(text, image);
                
                // إرسال الرد لفيسبوك
                await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                    recipient: { id: sender_id },
                    message: { text: reply }
                }).catch(err => console.log("Error sending message:", err.response?.data));
            }
        }
        // الرد على فيسبوك بيتم هنا "بعد" ما كل العمليات تخلص
        res.status(200).send('EVENT_RECEIVED');
    }
});

app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) res.status(200).send(req.query['hub.challenge']);
    else res.sendStatus(403);
});

export default app;
