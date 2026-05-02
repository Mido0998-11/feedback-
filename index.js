import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';

const app = express().use(bodyParser.json());

// الإعدادات من Environment Variables
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';
const ADMIN_ID = "35102646592711868"; // معرف الأدمن

// --- 1. وظيفة إرسال تفاعل الإيموجي (Reaction) ---
async function sendReaction(psid, messageId, reactionType = "love") {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: psid },
            sender_action: "react",
            payload: {
                message_id: messageId,
                reaction: reactionType // أنواع: love, smile, wow, sad, angry, like, dislike
            }
        });
    } catch (e) { console.error("Reaction Error"); }
}

// --- 2. محرك Coku الذكي (صور + بحث + شخصية) ---
async function getCokuResponse(senderId, userMessage, imageUrl = null) {
    const isAdmin = senderId === ADMIN_ID;
    let contents = [{ type: "text", text: userMessage }];
    if (imageUrl) contents.push({ type: "image_url", image_url: { url: imageUrl } });

    try {
        const res = await axios.post('https://text.pollinations.ai/v1/chat/completions', {
            model: 'openai', 
            messages: [
                { 
                    role: 'system', 
                    content: `أنت Coku، مساعد ذكي ومرح جداً بالفصحى، مطور بواسطة المبرمج العبقري ويزي (Wizzy). يمكنك رؤية الصور وتحليلها بدقة والبحث في الإنترنت عن أحدث الأخبار والمعلومات. ${isAdmin ? "تحدث مع مطورك ويزي باحترام وفخر." : ""}` 
                },
                { role: 'user', content: contents }
            ]
        });
        return res.data.choices[0].message.content;
    } catch (e) { return "المحرك مشغول، أعد المحاولة يا بطل!"; }
}

// --- 3. وظائف المراسلة ---
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
                { content_type: "text", title: "من هو ويزي؟", payload: "DEV_WIZZY" },
                { content_type: "text", title: "مساعدة", payload: "HELP_ME" }
            ]
        }
    });
}

// --- 4. المسارات (Routes) ---
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

                // التفاعل الفوري مع الصور والنصوص
                if (message_id) {
                    if (event.message?.attachments && event.message.attachments[0].type === 'image') {
                        image = event.message.attachments[0].payload.url;
                        text = text || "حلل هذه الصورة";
                        await sendReaction(sender_id, message_id, "love"); // قلب على الصور
                    } else if (text) {
                        await sendReaction(sender_id, message_id, "smile"); // ابتسامة على النصوص
                    }
                }

                // معالجة الأزرار
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

app.get('/', (req, res) => res.send('🚀 Coku Ultra v4 is Active!'));

export default app;
