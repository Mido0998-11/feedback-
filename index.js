import express from 'express'; // تم التصحيح حرف i صغير
import bodyParser from 'body-parser';
import axios from 'axios';
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express().use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';

if (!GEMINI_API_KEY) {
    console.error("❌ خطأ: GEMINI_API_KEY مفقود في إعدادات ريندر!");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const systemPrompt = "أنت مساعد ذكي ولطيف، أجب باللغة العربية الفصحى دائماً. أنت 'بوت ويزي' المطور بواسطة المبرمج المبدع ويزي (Wizzy).";

app.get('/', (req, res) => res.send('Wizzy Bot is Online! 🚀'));

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
                    console.log(`📩 رسالة مستلمة: ${text}`);
                    
                    try {
                        const fullPrompt = `${systemPrompt}\n\nالمستخدم يسأل: ${text}`;
                        const result = await model.generateContent(fullPrompt);
                        const aiReply = result.response.text();
                        
                        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                            recipient: { id: sender_id },
                            message: { text: aiReply }
                        });
                        console.log("🚀 تم الرد بنجاح");
                    } catch (err) {
                        console.error("❌ API Error:", err.message);
                        // إذا ظهر خطأ 404 هنا، فالمشكلة في المكتبة ولازم نستخدم كود الـ axios المباشر
                        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                            recipient: { id: sender_id },
                            message: { text: "عذراً يا عزيزي، واجهت مشكلة بسيطة، جارٍ إصلاحها بواسطة ويزي." }
                        });
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 بوت ويزي انطلق على بورت ${PORT}`));
