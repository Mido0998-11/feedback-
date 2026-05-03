import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const app = express().use(bodyParser.json());
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// دالة الذكاء الاصطناعي - النسخة السريعة جداً
async function getCokuResponse(userMessage, imageUrl = null) {
    let contents = [{ type: "text", text: userMessage }];
    if (imageUrl) contents.push({ type: "image_url", image_url: { url: imageUrl } });

    try {
        // استخدمنا موديل 'openai' مباشرة لأنه الأكثر استقراراً في هذا الرابط
        const res = await axios.post('https://text.pollinations.ai/v1/chat/completions', {
            model: 'openai', 
            messages: [
                { role: 'system', content: 'أنت Coku، مساعد ذكي بالفصحى مطور بواسطة ويزي. ردودك ذكية ومختصرة جداً.' },
                { role: 'user', content: contents }
            ]
        }, { timeout: 8500 }); // مهلة كافية قبل فصل Vercel
        
        return res.data.choices[0].message.content;
    } catch (e) {
        console.error("AI Error");
        return "أنا هنا! يبدو أن هناك ضغطاً بسيطاً، أعد إرسال سؤالك وسأجيبك فوراً.";
    }
}

app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        // نرد على فيسبوك في النهاية لضمان بقاء السيرفر يعمل
        
        for (let entry of body.entry) {
            if (entry.messaging && entry.messaging[0]) {
                let event = entry.messaging[0];
                let sender_id = event.sender.id;
                let text = event.message?.text || event.message?.quick_reply?.payload || "";
                let image = null;

                // دعم الصور
                if (event.message?.attachments && event.message.attachments[0].type === 'image') {
                    image = event.message.attachments[0].payload.url;
                    text = "حلل هذه الصورة باختصار";
                }

                if (text || image) {
                    // إظهار جاري الكتابة
                    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                        recipient: { id: sender_id },
                        sender_action: "typing_on"
                    }).catch(() => {});

                    const reply = await getCokuResponse(text, image);
                    
                    // إرسال الرد
                    await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
                        recipient: { id: sender_id },
                        message: { text: reply }
                    }).catch(err => console.log("FB Send Error"));
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    }
});

app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) res.status(200).send(req.query['hub.challenge']);
    else res.sendStatus(403);
});

export default app;
