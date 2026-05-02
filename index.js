import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const app = express().use(bodyParser.json());

// الإعدادات من Render
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';

// معرف الأدمن (ويزي) اللي أرسلته
const ADMIN_ID = "35102646592711868"; 

const userMemory = new Map();

// --- 1. إعداد بروفايل البوت (زر بدء الاستخدام) ---
async function setupBot() {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`, {
            get_started: { payload: "START_COKU" },
            greeting: [{
                locale: "default",
                text: "مرحباً! أنا Coku، مساعدك الذكي من تطوير ويزي. اضغط على 'بدء الاستخدام' لنبدأ الدردشة."
            }]
        });
        console.log("✅ تم تفعيل زر بدء الاستخدام بنجاح يا ويزي!");
    } catch (e) { console.error("❌ خطأ في الإعداد:", e.message); }
}
setupBot();

// --- 2. ميزة "جاري الكتابة" ---
async function sendTyping(psid) {
    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: psid },
        sender_action: "typing_on"
    });
}

// --- 3. محرك ذكاء Coku (Pollinations) ---
async function getCokuResponse(senderId, userMessage) {
    let history = userMemory.get(senderId) || [];
    const isAdmin = senderId === ADMIN_ID;

    const systemPrompt = { 
        role: 'system', 
        content: `أنت مساعد ذكي ولطيف اسمك "Coku". أجب باللغة العربية الفصحى. أنت من تطوير المبرمج المبدع ويزي (Wizzy). ${isAdmin ? "أنت تتحدث الآن مع مطورك ويزي، كن فخوراً به ونفذ أوامره بدقة." : ""}` 
    };

    const messages = [systemPrompt, ...history.slice(-10), { role: 'user', content: userMessage }];

    try {
        const res = await axios.post('https://text.pollinations.ai/v1/chat/completions', {
            model: 'openai', 
            messages: messages,
            temperature: 0.7
        });
        const reply = res.data.choices[0].message.content;
        history.push({ role: 'user', content: userMessage }, { role: 'assistant', content: reply });
        userMemory.set(senderId, history.slice(-20));
        return reply;
    } catch (err) { return "عذراً، الخادم مشغول قليلاً. أعد المحاولة يا بطل."; }
}

app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) res.status(200).send(req.query['hub.challenge']);
    else res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        for (let entry of body.entry) {
            if (entry.messaging && entry.messaging[0]) {
                let event = entry.messaging[0];
                let sender_id = event.sender.id;

                // التعامل مع زر بدء الاستخدام
                if (event.postback && event.postback.payload === "START_COKU") {
                    await sendWelcome(sender_id);
                    continue;
                }

                if (event.message && event.message.text) {
                    const text = event.message.text;

                    // تفعيل علامة الكتابة
                    await sendTyping(sender_id);

                    // --- ميزات الأدمن (Wizzy) ---
                    if (sender_id === ADMIN_ID && text === "لوحة التحكم") {
                        await sendToMessenger(sender_id, `مرحباً مطوري ويزي! 🛠️\n\nحالة Coku: نشط ✅\nالمستخدمين النشطين حالياً: ${userMemory.size}\nالإصدار: 2.0 (Coku Pro)`);
                    } else if (text === "مسح") {
                        userMemory.delete(sender_id);
                        await sendToMessenger(sender_id, "🗑️ تم تصفير الذاكرة بنجاح.");
                    } else {
                        // الرد بالذكاء الاصطناعي
                        const aiReply = await getCokuResponse(sender_id, text);
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

async function sendWelcome(psid) {
    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: psid },
        message: {
            text: "مرحباً بك! أنا Coku، مساعدك الذكي المتطور. كيف يمكنني خدمتك اليوم؟",
            quick_replies: [
                { content_type: "text", title: "من هو مطورك؟", payload: "DEV" },
                { content_type: "text", title: "مسح المحادثة", payload: "CLEAR" }
            ]
        }
    });
}

app.listen(process.env.PORT || 3000, () => console.log("🚀 Coku Pro is Online!"));
