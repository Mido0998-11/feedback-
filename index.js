import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const app = express().use(bodyParser.json());
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// دالة الذكاء الاصطناعي - نسخة "الاستجابة السريعة"
async function getCokuResponse(userMessage) {
    try {
        const response = await axios.post('https://text.pollinations.ai/', {
            messages: [
                { role: 'system', content: 'أنت Coku، ذكاء اصطناعي متطور ومختصر، مطور بواسطة ويزي. رد بالفصحى.' },
                { role: 'user', content: userMessage }
            ],
            model: 'openai', // أسرع موديل متاح حالياً
            jsonMode: false
        }, { timeout: 9000 }); // مهلة كافية قبل فصل Vercel

        return response.data; // الموديل ده بيرد نص مباشر أحياناً
    } catch (e) {
        console.error("AI Error:", e.message);
        return "أنا معك! اسألني مرة أخرى وسأجيبك فوراً.";
    }
}

app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        // رد فوري لفيسبوك عشان ما يكرر إرسال الرسالة
        res.status(200).send('EVENT_RECEIVED');

        for (let entry of body.entry) {
            if (entry.messaging && entry.messaging[0]) {
                let event = entry.messaging[0];
                let sender_id = event.sender.id;
                let text = event.message?.text || event.message?.quick_reply?.payload;

                if (text) {
                    // تفعيل علامة الكتابة
                    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                        recipient: { id: sender_id },
                        sender_action: "typing_on"
                    }).catch(() => {});

                    // جلب الرد من الذكاء الاصطناعي
                    const replyText = await getCokuResponse(text);
                    
                    // إرسال الرد النهائي
                    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                        recipient: { id: sender_id },
                        message: { text: String(replyText) }
                    }).catch(err => console.log("FB Send Error"));
                }
            }
        }
    }
});

app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) res.status(200).send(req.query['hub.challenge']);
    else res.sendStatus(403);
});

export default app;
