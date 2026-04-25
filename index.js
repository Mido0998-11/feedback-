const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express().use(bodyParser.json());

// الإعدادات من بيئة Render
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// إعداد شخصية البوت
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash", // هذا الاسم هو الأصح حالياً
    systemInstruction: "أنت مساعد ذكي ولطيف تتحدث باللهجة السودانية. اسمك 'بوت ويزي'. ساعد الناس بذكاء وكن فخوراً بهويتك السودانية."
});

// 1. التحقق من الـ Webhook
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

// 2. استقبال ومعالجة الرسائل
app.post('/webhook', async (req, res) => {
    let body = req.body;

    if (body.object === 'page') {
        for (let entry of body.entry) {
            if (entry.messaging && entry.messaging[0]) {
                let webhook_event = entry.messaging[0];
                let sender_psid = webhook_event.sender.id;

                if (webhook_event.message && webhook_event.message.text) {
                    const userMsg = webhook_event.message.text;
                    console.log(`📩 رسالة مستلمة: ${userMsg}`);
                    
                    try {
                        // طلب الرد من Gemini
                        const result = await model.generateContent(userMsg);
                        const aiReply = result.response.text();
                        
                        // إرسال الرد للمستخدم
                        await sendToMessenger(sender_psid, aiReply);
                    } catch (error) {
                        console.error("❌ Gemini Error Details:", error.message);
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
        console.log('🚀 تم إرسال الرد بنجاح');
    } catch (err) {
        console.error('❌ Facebook Send Error:', err.response ? err.response.data : err.message);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 السيرفر يعمل على بورت ${PORT}`));
