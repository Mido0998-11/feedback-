import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const app = express().use(bodyParser.json());
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

async function sendTyping(psid, state) {
    const action = state ? "typing_on" : "typing_off";
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: psid },
            sender_action: action
        });
    } catch (e) {}
}

async function getCokuResponse(userMessage, imageUrl = null) {
    let contents = [{ type: "text", text: userMessage }];
    if (imageUrl) contents.push({ type: "image_url", image_url: { url: imageUrl } });

    try {
        // استخدام موديل gpt-4o-mini لأنه الأسرع حالياً
        const res = await axios.post('https://text.pollinations.ai/v1/chat/completions', {
            model: 'gpt-4o-mini', 
            messages: [
                { role: 'system', content: 'أنت Coku، مساعد ذكي ومختصر مطور بواسطة ويزي. رد بسرعة فائقة.' },
                { role: 'user', content: contents }
            ],
            cache: false // لضمان عدم استلام ردود قديمة
        }, { timeout: 7000 }); // مهلة 7 ثوانٍ فقط لنضمن الإرسال قبل إغلاق السيرفر
        
        return res.data.choices[0].message.content;
    } catch (e) {
        console.error("AI Error Status:", e.response?.status);
        return "⚠️ المحرك مشغول قليلاً يا بطل، جرب ترسل رسالة نصية قصيرة الآن!";
    }
}

app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        for (let entry of body.entry) {
            if (entry.messaging && entry.messaging[0]) {
                let event = entry.messaging[0];
                let sender_id = event.sender.id;
                let text = event.message?.text || event.message?.quick_reply?.payload || "";
                let image = null;

                if (event.message?.attachments && event.message.attachments[0].type === 'image') {
                    image = event.message.attachments[0].payload.url;
                    text = "حلل الصورة باختصار";
                }

                if (text || image) {
                    await sendTyping(sender_id, true);
                    const reply = await getCokuResponse(text, image);
                    
                    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                        recipient: { id: sender_id },
                        message: { 
                            text: reply,
                            quick_replies: [
                                { content_type: "text", title: "👑 المطور", payload: "من هو ويزي؟" },
                                { content_type: "text", title: "🛠️ مساعدة", payload: "مساعدة" }
                            ]
                        }
                    }).catch(err => console.log("Facebook Error"));
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    }
});

app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) res.status(200).send(req.query['hub.challenge']);
    else res.sendStatus(403);
});

export default app;
