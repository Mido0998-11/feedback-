import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import fetch from 'node-fetch';

const app = express().use(bodyParser.json());

// الإعدادات من بيئة Render
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';

// --- فئة Gemini بذكاء 2.0 ---
class GeminiAPI {
  constructor() {
    this.baseUrl = "https://us-central1-infinite-chain-295909.cloudfunctions.net/gemini-proxy-staging-v1";
    this.headers = { "content-type": "application/json" };
  }

  async chat({ prompt }) {
    // إجبار البوت على العربية الفصحى وذكر المطور ويزي
    const identity = "أجب باللغة العربية الفصحى فقط وبأسلوب راقٍ. أنت بوت ذكي تم تطويرك وبرمجتك بواسطة 'المطور ويزي' (Wizzy). في بداية حديثك أو خلاله، أكد دائماً على هويتك ومطورك.";
    const parts = [{ text: `${identity}\n\nالمستخدم يقول: ${prompt}` }];

    try {
      const response = await axios.post(this.baseUrl, { contents: [{ parts }] }, { headers: this.headers });
      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "عذراً، لم أستطع معالجة الرد حالياً.";
    } catch (error) {
      console.error("Gemini Error:", error.message);
      return "عذراً يا فضل، حدث خطأ في الاتصال بمحرك الذكاء الاصطناعي.";
    }
  }
}

const gemini = new GeminiAPI();

// --- مسار للحفاظ على نشاط السيرفر 24 ساعة (Uptime) ---
app.get('/', (req, res) => res.send('Wizzy Bot is Alive! 🚀'));

// --- التحقق من Webhook فيسبوك ---
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else { res.sendStatus(403); }
});

// --- معالجة الرسائل الواردة ---
app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        for (let entry of body.entry) {
            if (entry.messaging && entry.messaging[0]) {
                let event = entry.messaging[0];
                let sender_id = event.sender.id;

                // 1. التعامل مع الرسائل النصية
                if (event.message && event.message.text) {
                    const msg = event.message.text;

                    if (msg === "قائمة" || msg === "menu") {
                        await sendMenu(sender_id);
                    } else {
                        const aiResponse = await gemini.chat({ prompt: msg });
                        await sendText(sender_id, aiResponse);
                    }
                }

                // 2. التعامل مع ضغطات الأزرار (Postbacks)
                if (event.postback) {
                    const payload = event.postback.payload;
                    if (payload === 'DEV_INFO') {
                        await sendText(sender_id, "تم تطوير هذا البوت بواسطة 'المطور ويزي' (Wizzy). مبرمج متخصص في حلول الذكاء الاصطناعي.");
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    }
});

// --- وظائف الإرسال (Send Helpers) ---

// إرسال نص بسيط
async function sendText(psid, text) {
    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: psid },
        message: { text: text }
    });
}

// إرسال قائمة أزرار احترافية
async function sendMenu(psid) {
    const data = {
        recipient: { id: psid },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "مرحباً بك في لوحة تحكم بوت ويزي المتطور. كيف يمكنني مساعدتك؟",
                    buttons: [
                        { type: "postback", title: "من هو المطور؟", payload: "DEV_INFO" },
                        { type: "web_url", url: "https://t.me/Wizzy_Official", title: "قناة التلجرام" }
                    ]
                }
            }
        }
    };
    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, data);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 بوت ويزي الاحترافي يعمل على بورت ${PORT}`));
