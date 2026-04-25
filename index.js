import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import fetch from 'node-fetch';

const app = express().use(bodyParser.json());

// المفاتيح من Render
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';

const geminiSessions = {}; // لحفظ سياق المحادثة

// --- منطق Gemini الخاص بك (Wolep Plugin) ---
const gemini = {
    getNewCookie: async function () {
        const r = await fetch("https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&bl=boq_assistant-bard-web-server_20250814.06_p1&f.sid=-7816331052118000090&hl=en-US&_reqid=173780&rt=c", {
            "headers": { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
            "body": "f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&",
            "method": "POST"
        });
        const cookieHeader = r.headers.get('set-cookie');
        if (!cookieHeader) throw new Error('Cookie fail');
        return cookieHeader.split(';')[0];
    },

    ask: async function (prompt, previousId = null) {
        let resumeArray = null;
        let cookie = null;
        if (previousId) {
            try {
                const j = JSON.parse(Buffer.from(previousId, 'base64').toString());
                resumeArray = j.newResumeArray;
                cookie = j.cookie;
            } catch (e) { previousId = null; }
        }
        
        const headers = {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            "cookie": cookie || await this.getNewCookie()
        };

        const b = [[prompt], ["en-US"], resumeArray];
        const a = [null, JSON.stringify(b)];
        const body = new URLSearchParams({ "f.req": JSON.stringify(a) });
        
        const response = await fetch(`https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20250729.06_p0&f.sid=4206607810970164620&hl=en-US&_reqid=2813378&rt=c`, {
            headers, body, method: 'post'
        });

        const data = await response.text();
        const match = data.matchAll(/^\d+\n(.+?)\n/gm);
        const chunks = Array.from(match, m => m[1]);
        let text, newResumeArray, found = false;

        for (const chunk of chunks.reverse()) {
            try {
                const realArray = JSON.parse(chunk);
                const parse1 = JSON.parse(realArray[0][2]);
                if (parse1 && parse1[4] && parse1[4][0]) {
                    newResumeArray = [...parse1[1], parse1[4][0][0]];
                    text = parse1[4][0][1][0];
                    found = true; break;
                }
            } catch (e) {}
        }
        if (!found) throw new Error("Parsing error");
        const id = Buffer.from(JSON.stringify({ newResumeArray, cookie: headers.cookie })).toString('base64');
        return { text, id };
    }
};

// --- إعدادات فيسبوك ---
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else { res.sendStatus(403); }
});

app.post('/webhook', async (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        for (let entry of body.entry) {
            let event = entry.messaging[0];
            let sender_psid = event.sender.id;

            if (event.message && event.message.text) {
                console.log(`📩 رسالة مستلمة: ${event.message.text}`);
                try {
                    // استخدام منطق Gemini بتاعك
                    const previousId = geminiSessions[sender_psid];
                    // أضفنا لهجة سودانية للبرومبت
                    const result = await gemini.ask(`رد باللهجة السودانية كبوت ذكي: ${event.message.text}`, previousId);
                    geminiSessions[sender_psid] = result.id;

                    await sendToMessenger(sender_psid, result.text);
                } catch (e) {
                    console.error("❌ Error:", e.message);
                    await sendToMessenger(sender_psid, "معليش يا حبيب، في مشكلة فنية، جرب تاني.");
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

app.listen(process.env.PORT || 3000, () => console.log('🚀 السيرفر شغال بكود ويزي!'));
