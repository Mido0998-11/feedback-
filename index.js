import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const app = express().use(bodyParser.json());
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// دالة الذكاء الاصطناعي - تدعم تحليل الصور والبحث الفوري
async function getCokuResponse(userMessage, imageUrl = null) {
    let contents = [{ type: "text", text: userMessage }];
    if (imageUrl) {
        contents.push({ type: "image_url", image_url: { url: imageUrl } });
    }

    try {
        const res = await axios.post('https://text.pollinations.ai/v1/chat/completions', {
            model: 'openai', 
            messages: [
                { role: 'system', content: 'أنت Coku، مساعد ذكي بالفصحى مطور بواسطة ويزي. يمكنك رؤية الصور وتحليلها والبحث في الإنترنت بدقة متناهية.' },
                { role: 'user', content: contents }
            ]
        });
        return res.data.choices[0].message.content;
    } catch (e) { return "عذراً، أواجه ضغطاً في التفكير حالياً!"; }
}

app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        res.status(200).send('EVENT_RECEIVED'); // رد فوري لفيسبوك لتجنب التأخير
        
        for (let entry of body.entry) {
            let event = entry.messaging[0];
            let sender_id = event.sender.id;
            let text = event.message?.text || "";
            let image = null;

            // كشف الصور المرسلة
            if (event.message?.attachments && event.message.attachments[0].type === 'image') {
                image = event.message.attachments[0].payload.url;
                if (!text) text = "حلل هذه الصورة واشرح ما فيها.";
            }

            // معالجة الأزرار (Postbacks)
            if (event.postback) text = event.postback.payload;

            if (text || image) {
                // تفعيل "جاري الكتابة..."
                await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                    recipient: { id: sender_id },
                    sender_action: "typing_on"
                });

                const reply = await getCokuResponse(text, image);
                
                // إرسال الرد مع أزرار تفاعلية
                await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                    recipient: { id: sender_id },
                    message: { 
                        text: reply,
                        quick_replies: [
                            { content_type: "text", title: "من هو مطورك؟", payload: "من هو مطورك؟" },
                            { content_type: "text", title: "مساعدة", payload: "ماذا يمكنك أن تفعل؟" }
                        ]
                    }
                });
            }
        }
    }
});

app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) res.status(200).send(req.query['hub.challenge']);
    else res.sendStatus(403);
});

export default app;
