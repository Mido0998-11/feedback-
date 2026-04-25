import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express().use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // تأكد من وضع المفتاح في ريندر
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
// نستخدم موديل 1.5 Flash لأنه الأسرع والأفضل للبوتات
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "أنت مساعد ذكي ولطيف، أجب باللغة العربية الفصحى فقط. يجب أن تذكر دائماً أنك بوت مطور بواسطة 'المطور ويزي' (Wizzy)."
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
                    console.log(`📩 رسالة من ${sender_id}: ${text}`);
                    
                    if (text === "قائمة" || text === "menu") {
                        await sendMenu(sender_id);
                    } else {
                        try {
                            const result = await model.generateContent(text);
                            const aiReply = result.response.text();
                            await sendText(sender_id, aiReply);
                        } catch (err) {
                            console.error("❌ Gemini API Error:", err.message);
                            await sendText(sender_id, "عذراً، المحرك يحتاج لمفتاح API صحيح.");
                        }
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    }
});

async function sendText(psid, text) {
    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: psid },
        message: { text: text }
    });
    console.log("🚀 تم الرد بنجاح");
}

async function sendMenu(psid) {
    const data = {
        recipient: { id: psid },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "مرحباً بك! أنا بوت ذكي من تطوير ويزي. اختر أحد الخيارات:",
                    buttons: [
                        { type: "web_url", url: "https://t.me/Wizzy_Official", title: "قناتنا على تلجرام" },
                        { type: "postback", title: "معلومات المطور", payload: "DEV_INFO" }
                    ]
                }
            }
        }
    };
    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, data);
}

app.listen(process.env.PORT || 3000, () => console.log("🚀 البوت الرسمي شغال 24 ساعة!"));
