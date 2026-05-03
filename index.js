import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const app = express().use(bodyParser.json());
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// دالة جلب الرد من الذكاء الاصطناعي (مبسطة جداً)
async function getCokuResponse(userMessage) {
    try {
        const res = await axios.post('https://text.pollinations.ai/', {
            messages: [
                { role: 'system', content: 'أنت Coku، مساعد ذكي ومختصر بالفصحى من تطوير ويزي.' },
                { role: 'user', content: userMessage }
            ],
            model: 'openai'
        }, { timeout: 8000 }); // مهلة 8 ثوانٍ
        
        // الموديل ده أحياناً بيرد بالنص مباشرة في res.data
        return typeof res.data === 'string' ? res.data : res.data.choices[0].message.content;
    } catch (e) {
        console.error("AI ERROR:", e.message);
        return "أنا هنا! اسألني مرة أخرى وسأجيبك.";
    }
}

app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        // رد فوري لفيسبوك لمنع تكرار الرسائل
        res.status(200).send('EVENT_RECEIVED');

        for (let entry of body.entry) {
            let event = entry.messaging ? entry.messaging[0] : null;
            if (!event || !event.message) continue;

            let sender_id = event.sender.id;
            let text = event.message.text;

            if (text) {
                // تفعيل علامة الكتابة
                await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                    recipient: { id: sender_id },
                    sender_action: "typing_on"
                }).catch(() => {});

                // الحصول على الرد
                const reply = await getCokuResponse(text);

                // إرسال الرسالة النهائية
                await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                    recipient: { id: sender_id },
                    message: { text: String(reply) }
                }).catch(err => {
                    console.error("FB SEND ERROR:", err.response?.data || err.message);
                });
            }
        }
    }
});

app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

export default app;
