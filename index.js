const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express().use(bodyParser.json());

// قراءة الإعدادات من Render Environment
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "أنت مساعد ذكي ومبتكر، تجيب على استفسارات المستخدمين بذكاء وسرعة."
});

// 1. التحقق من الـ Webhook للربط مع فيسبوك
app.get('/webhook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Webhook Verified');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

// 2. استقبال الرسائل ومعالجتها
app.post('/webhook', async (req, res) => {
    let body = req.body;

    if (body.object === 'page') {
        for (let entry of body.entry) {
            if (entry.messaging && entry.messaging[0]) {
                let webhook_event = entry.messaging[0];
                let sender_psid = webhook_event.sender.id;

                if (webhook_event.message && webhook_event.message.text) {
                    const userMsg = webhook_event.message.text;
                    
                    try {
                        // الحصول على رد من ذكاء Gemini
                        const result = await model.generateContent(userMsg);
                        const aiReply = result.response.text();
                        
                        // إرسال الرد لفيسبوك
                        await sendToMessenger(sender_psid, aiReply);
                    } catch (error) {
                        console.error("❌ Gemini Error:", error);
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    }
});

async function sendToMessenger(psid, text) {
    try {
        await axios.post(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: psid },
            message: { text: text }
        });
    } catch (err) {
        console.error('❌ Facebook Send Error:', err.response.data);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Bot is running on port ${PORT}`));
