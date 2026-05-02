import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const app = express().use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// --- دالة الذكاء الاصطناعي (نص + صور) ---
async function getCokuResponse(userMessage, imageUrl = null) {
    let contents = [{ type: "text", text: userMessage }];
    
    // لو في صورة، بنرسل الرابط للمحرك عشان يحلله
    if (imageUrl) {
        contents.push({ type: "image_url", image_url: { url: imageUrl } });
    }

    try {
        const res = await axios.post('https://text.pollinations.ai/v1/chat/completions', {
            model: 'openai', 
            messages: [
                { 
                    role: 'system', 
                    content: 'أنت Coku، مساعد ذكي ومرح مطور بواسطة المبرمج ويزي. أجب بالعربية الفصحى. يمكنك رؤية الصور وتحليلها والبحث في الإنترنت.' 
                },
                { role: 'user', content: contents }
            ]
        }, { timeout: 9000 }); // مهلة 9 ثوانٍ لتجنب فصل Vercel

        return res.data.choices[0].message.content;
    } catch (e) {
        console.error("AI Error:", e.message);
        return "عذراً، أحتاج لثوانٍ إضافية للتفكير. جرب مراسلتي مجدداً!";
    }
}

// --- مسار الـ Webhook لاستلام الرسائل ---
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        // رد فوري لفيسبوك بـ 200 OK عشان ما يقطع الاتصال
        res.status(200).send('EVENT_RECEIVED');

        for (let entry of body.entry) {
            if (entry.messaging && entry.messaging[0]) {
                let event = entry.messaging[0];
                let sender_id = event.sender.id;
                let text = event.message?.text || "";
                let image = null;

                // كشف إذا كان المرسل صورة
                if (event.message?.attachments && event.message.attachments[0].type === 'image') {
                    image = event.message.attachments[0].payload.url;
                    if (!text) text = "ماذا ترى في هذه الصورة؟";
                }

                if (text || image) {
                    // تفعيل علامة "جاري الكتابة..."
                    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                        recipient: { id: sender_id },
                        sender_action: "typing_on"
                    }).catch(() => {});

                    // الحصول على الرد من الذكاء الاصطناعي
                    const reply = await getCokuResponse(text, image);
                    
                    // إرسال الرد النهائي للمستخدم
                    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                        recipient: { id: sender_id },
                        message: { text: reply }
                    }).catch(err => console.log("Send Error:", err.response?.data));
                }
            }
        }
    } else {
        res.sendStatus(404);
    }
});

// --- مسار التحقق (Verification) ---
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else {
        res.sendStatus(403);
    }
});

export default app;
