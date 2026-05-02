import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const app = express().use(bodyParser.json());

// الإعدادات (تأكد من وجودها في Vercel Environment Variables)
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';
const ADMIN_ID = "35102646592711868"; 

// --- 1. وظيفة التفاعل (Reaction) ---
async function sendReaction(psid, messageId, type = "love") {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: psid },
            sender_action: "react",
            payload: { message_id: messageId, reaction: type }
        });
    } catch (e) {}
}

// --- 2. محرك Coku المطور (حل مشكلة انشغال المحرك) ---
async function getCokuResponse(senderId, userMessage, imageUrl = null) {
    const isAdmin = senderId === ADMIN_ID;
    
    // تنسيق الطلب ليكون أكثر استقراراً
    let prompt = userMessage;
    if (imageUrl) {
        prompt = `أمامك صورة في هذا الرابط: ${imageUrl}. حللها بدقة وأجب على هذا السؤال: ${userMessage || "ماذا ترى في الصورة؟"}`;
    }

    try {
        const res = await axios.post('https://text.pollinations.ai/v1/chat/completions', {
            model: 'openai', 
            messages: [
                { 
                    role: 'system', 
                    content: `أنت Coku، مساعد ذكي ومرح جداً بالفصحى، مطور بواسطة المبرمج المبدع ويزي (Wizzy). يمكنك البحث في الإنترنت وتحليل الصور. أجب دائماً بأسلوب ذكي ومختصر. ${isAdmin ? "أنت الآن تتحدث مع مطورك ويزي، كن فخوراً به." : ""}` 
                },
                { role: 'user', content: prompt }
            ],
            seed: 42
        }, { timeout: 25000 }); // زيادة المهلة لـ 25 ثانية لضمان البحث وتحليل الصور

        return res.data.choices[0].message.content;
    } catch (e) {
        console.error("AI Error:", e.message);
        return "يبدو أنني أستغرق وقتاً طويلاً في التفكير، أعد إرسال رسالتك يا بطل!";
    }
}

// --- 3. وظائف الإرسال ---
async function sendTyping(psid, state) {
    const action = state ? "typing_on" : "typing_off";
    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: psid },
        sender_action: action
    });
}

async function sendMessage(psid, text) {
    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: psid },
        message: { 
            text: text,
            quick_replies: [
                { content_type: "text", title: "من هو ويزي؟", payload: "DEV" },
                { content_type: "text", title: "مساعدة", payload: "HELP" }
            ]
        }
    });
}

// --- 4. معالجة الـ Webhook ---
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) res.status(200).send(req.query['hub.challenge']);
    else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        res.status(200).send('EVENT_RECEIVED');

        for (let entry of body.entry) {
            if (entry.messaging && entry.messaging[0]) {
                let event = entry.messaging[0];
                let sender_id = event.sender.id;
                let message_id = event.message?.mid;
                let text = event.message?.text || "";
                let image = null;

                // التفاعل مع الصور والنصوص
                if (message_id) {
                    if (event.message?.attachments && event.message.attachments[0].type === 'image') {
                        image = event.message.attachments[0].payload.url;
                        await sendReaction(sender_id, message_id, "love");
                    } else if (text) {
                        await sendReaction(sender_id, message_id, "smile");
                    }
                }

                if (event.postback) text = event.postback.payload;
                if (event.message?.quick_reply) text = event.message.quick_reply.payload;

                if (text || image) {
                    await sendTyping(sender_id, true);
                    const reply = await getCokuResponse(sender_id, text, image);
                    await sendMessage(sender_id, reply);
                }
            }
        }
    }
});

app.get('/', (req, res) => res.send('🚀 Coku Ultra v5 is Stabilized!'));

export default app;
