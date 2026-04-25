import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import fetch from 'node-fetch';

const app = express().use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'Wizzy_AI_2026';

const geminiSessions = {};

const gemini = {
    getNewCookie: async function () {
        const r = await fetch("https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&bl=boq_assistant-bard-web-server_20250814.06_p1&f.sid=-7816331052118000090&hl=en-US&_reqid=173780&rt=c", {
            "headers": { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
            "body": "f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&",
            "method": "POST"
        });
        const cookieHeader = r.headers.get('set-cookie');
        if (!cookieHeader) return null;
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
            "cookie": cookie || await this.getNewCookie() || ""
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
        
        let text, newResumeArray;
        let found = false;

        // تعديل منطق الـ Parsing ليكون أكثر ذكاءً
        for (const chunk of chunks.reverse()) {
            try {
                const realArray = JSON.parse(chunk);
                // بنحاول نلقى النص في أكتر من مكان محتمل
                const parse1 = JSON.parse(realArray[0][2]);
                
                if (parse1) {
                    // تفقد المسار التقليدي للرد
                    if (parse1[4] && parse1[4][0] && parse1[4][0][1]) {
                        text = parse1[4][0][1][0];
                        newResumeArray = [...parse1[1], parse1[4][0][0]];
                        found = true;
                        break;
                    } 
                    // مسار بديل في حالة تغيير جوجل للرد
                    else if (parse1[0] && typeof parse1[0] === 'string') {
                        text = parse1[0];
                        found = true;
                        break;
                    }
                }
            } catch (e) { continue; }
        }

        if (!found) throw new Error("Google changed response format");
        
        const id = Buffer.from(JSON.stringify({ newResumeArray, cookie: headers.cookie })).toString('base64');
        return { text: text.replace(/\*\*(.+?)\*\*/g, "$1"), id };
    }
};

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
                    const userMsg = event.message.text;
                    console.log(`📩 رسالة من: ${sender_id} -> ${userMsg}`);
                    
                    try {
                        // طلب الرد من السكريب
                        const result = await gemini.ask(`رد باللهجة السودانية: ${userMsg}`, geminiSessions[sender_id]);
                        geminiSessions[sender_id] = result.id;

                        await sendToMessenger(sender_id, result.text);
                    } catch (err) {
                        console.error("❌ Gemini Error:", err.message);
                        await sendToMessenger(sender_id, "يا حبيبنا، في زحمة في سيرفرات جوجل، جرب ترسل تاني هسي.");
                    }
                }
            }
        }
        res.status(200).send('EVENT_RECEIVED');
    }
});

async function sendToMessenger(psid, text) {
    try {
        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            recipient: { id: psid },
            message: { text: text }
        });
        console.log("🚀 تم إرسال الرد بنجاح");
    } catch (err) {
        console.error("❌ FB Error:", err.message);
    }
}

app.listen(process.env.PORT || 3000, () => console.log("🚀 البوت شغال يا ويزي.. جرب هسي!"));
