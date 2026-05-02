import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const app = express().use(bodyParser.json());

// الإعدادات من Render
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';

// ذاكرة البوت (لحفظ سياق المحادثة)
const userMemory = new Map();

// --- دالة الاتصال بـ Pollinations AI ---
async function getPollinationsResponse(senderId, userMessage) {
    let history = userMemory.get(senderId) || [];

    const systemPrompt = { 
        role: 'system', 
        content: 'أنت مساعد ذكي ولطيف، أجب باللغة العربية الفصحى دائماً. أنت "بوت ويزي" المطور بواسطة المبرمج المبدع ويزي (Wizzy). كن محترفاً وفخوراً بهويتك.' 
    };

    const messages = [
        systemPrompt,
        ...history.slice(-10), // نأخذ آخر 10 رسائل فقط للحفاظ على السرعة
        { role: 'user', content: userMessage }
    ];

    try {
        const res = await axios.post('https://text.pollinations.ai/v1/chat/completions', {
            model: 'openai', // سيستخدم gpt-4o-mini تلقائياً
            messages: messages,
            temperature: 0.7
        });

        const reply = res.data.choices[0].message.content;

        // تحديث الذاكرة
        history.push({ role: 'user', content: userMessage });
        history.push({ role: 'assistant', content: reply });
        if (history.length > 20) history = history.slice(-20);
        userMemory.set(senderId, history);

        return reply;
    } catch (err) {
        console.error("❌ Pollinations Error:", err.message);
        return "عذراً، المحرك مشغول حالياً، حاول مرة أخرى.";
    }
}

// --- مسارات الفيسبوك ---

app.get('/', (req, res) => res.send('Wizzy FB Bot (Pollinations) is Online! 🚀'));

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

                    if (text.toLowerCase() === 'مسح') {
                        userMemory.delete(sender_id);
                        await sendToMessenger(sender_id, "🗑️ تم مسح الذاكرة بنجاح يا بطل.");
                    } else {
                        const aiReply = await getPollinationsResponse(sender_id, text);
                        await sendToMessenger(sender_id, aiReply);
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    }
});

async function sendToMessenger(psid, text) {
    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: psid },
        message: { text: text }
    });
}

app.listen(process.env.PORT || 3000, () => console.log("🚀 بوت ويزي (Pollinations) انطلق!"));
