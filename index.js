import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express().use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// إعداد الموديل بالهوية الرسمية (عربية فصحى + المطور ويزي)
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "أجب باللغة العربية الفصحى فقط وبأسلوب احترافي. أنت مساعد ذكي تم تطويرك وبرمجتك بواسطة المطور ويزي (Wizzy). عرّف بنفسك دائماً عند السؤال."
});

app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else { res.sendStatus(403); }
});

app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        for (let entry of body.entry) {
            if (entry.messaging && entry.messaging[0]) {
                let event = entry.messaging[0];
                let sender_id = event.sender.id;

                if (event.message && event.message.text) {
                    const text = event.message.text;
                    console.log(`📩 رسالة من المتابع: ${text}`);
                    
                    try {
                        const result = await model.generateContent(text);
                        const aiReply = result.response.text();
                        await sendToMessenger(sender_id, aiReply);
                    } catch (err) {
                        console.error("❌ Gemini API Error:", err.message);
                        await sendToMessenger(sender_id, "عذراً، أنا تحت التحديث الآن، المطور ويزي يعمل على صيانتي.");
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    }
});

async function sendToMessenger(psid, text) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: psid },
            message: { text: text }
        });
        console.log("🚀 تم إرسال الرد الرسمي بنجاح");
    } catch (err) {
        console.error("❌ FB Error:", err.message);
    }
}

app.listen(process.env.PORT || 3000, () => console.log("🚀 بوت ويزي الرسمي شغال بذكاء خارق!"));
