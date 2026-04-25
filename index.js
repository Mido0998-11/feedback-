const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express().use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// تعديل بسيط لضمان التوافق مع النسخة الجديدة
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash" 
});

app.get('/webhook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

app.post('/webhook', async (req, res) => {
    let body = req.body;
    if (body.object === 'page') {
        for (let entry of body.entry) {
            if (entry.messaging && entry.messaging[0]) {
                let event = entry.messaging[0];
                let sender_id = event.sender.id;

                if (event.message && event.message.text) {
                    const userText = event.message.text;
                    console.log("📩 رسالة مستلمة:", userText);
                    
                    try {
                        // تعليمات شخصية البوت
                        const prompt = `أنت مساعد ذكي ولطيف تتحدث باللهجة السودانية. اسمك بوت ويزي. المستخدم يقول لك: ${userText}`;
                        
                        const result = await model.generateContent(prompt);
                        const aiReply = result.response.text();
                        
                        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                            recipient: { id: sender_id },
                            message: { text: aiReply }
                        });
                        console.log("🚀 تم الرد بذكاء اصطناعي بنجاح");
                    } catch (err) {
                        console.error("❌ Gemini Error:", err.message);
                        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                            recipient: { id: sender_id },
                            message: { text: "معليش يا حبيب، في مشكلة تقنية بسيطة في مخي، جرب تاني بعد شوية." }
                        });
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    }
});

app.listen(process.env.PORT || 3000, () => console.log("🚀 السيرفر شغال بامتياز..."));
