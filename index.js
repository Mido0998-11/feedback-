import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import OpenAI from 'openai';

const app = express().use(bodyParser.json());

// الإعدادات المسحوبة من بيئة Render
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; 
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

// مسار للحفاظ على نشاط السيرفر (Uptime) ليعمل 24 ساعة
app.get('/', (req, res) => res.send('Wizzy OpenAI Bot is Online and Ready! 🚀'));

// التحقق من Webhook فيسبوك (عند الربط لأول مرة)
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else { res.sendStatus(403); }
});

// معالجة الرسائل الواردة من المتابعين
app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        for (let entry of body.entry) {
            if (entry.messaging && entry.messaging[0]) {
                let event = entry.messaging[0];
                let sender_id = event.sender.id;

                if (event.message && event.message.text) {
                    const msg = event.message.text;
                    console.log(`📩 رسالة مستلمة: ${msg}`);

                    // الرد بنظام الأزرار إذا طلب المستخدم "قائمة"
                    if (msg === "قائمة" || msg === "menu") {
                        await sendMenu(sender_id);
                    } else {
                        try {
                            const response = await openai.chat.completions.create({
                                model: "gpt-3.5-turbo",
                                messages: [
                                    { role: "system", content: "أجب باللغة العربية الفصحى فقط وبأسلوب ذكي. أنت 'بوت ويزي' المطور والمدعوم من قبل المبرمج المبدع ويزي (Wizzy). أكد دائماً على هويتك عند السؤال." },
                                    { role: "user", content: msg }
                                ],
                            });

                            const aiReply = response.choices[0].message.content;
                            await sendText(sender_id, aiReply);
                        } catch (err) {
                            console.error("❌ OpenAI Error:", err.message);
                            await sendText(sender_id, "عذراً يا عزيزي، أنا الآن في مرحلة تحديث الأنظمة تحت إشراف المطور ويزي.");
                        }
                    }
                }

                // معالجة ضغطات الأزرار
                if (event.postback && event.postback.payload === 'DEV_INFO') {
                    await sendText(sender_id, "أنا بوت ذكي تم تطويري وبرمجتي بالكامل بواسطة المطور المبدع ويزي (Wizzy).");
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    }
});

// وظيفة إرسال النصوص
async function sendText(psid, text) {
    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
        recipient: { id: psid },
        message: { text: text }
    });
    console.log("🚀 تم إرسال الرد بنجاح");
}

// وظيفة إرسال الأزرار الاحترافية
async function sendMenu(psid) {
    const data = {
        recipient: { id: psid },
        message: {
            attachment: {
                type: "template",
                payload: {
                    template_type: "button",
                    text: "أهلاً بك في عالم ويزي للذكاء الاصطناعي. كيف يمكنني خدمتك اليوم؟",
                    buttons: [
                        { type: "postback", title: "معلومات المطور", payload: "DEV_INFO" },
                        { type: "web_url", url: "https://t.me/Wizzy_Official", title: "قناتنا الرسمية" }
                    ]
                }
            }
        }
    };
    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, data);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 بوت ويزي (OpenAI) يعمل الآن بامتياز!`));
