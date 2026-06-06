import express from "express";
import fetch from "node-fetch";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(express.json());

// ================= ENV =================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const COHERE_API_KEY = process.env.COHERE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ================= INIT GEMINI =================
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ================= MEMORY + CACHE =================
const histories = new Map();
const cache = new Map();
const MAX_HISTORY = 10;

// ================= BOT INFO =================
const BOT_NAME = "غوكو";
const DEVELOPER_NAME = "محمد عادل (ويزي)";
const DEVELOPER_PAGE = "https://www.facebook.com/mhmd.wd.adl.441816";

// ================= SYSTEM PROMPT =================
const BOT_SYSTEM_PROMPT = `
أنت مساعد ذكي اسمه "غوكو".
تتكلم بلهجة سودانية بسيطة وودية.
تجاوب باختصار ووضوح.

مهم جداً:
- لا تذكر المطور في أي رد عادي.
`;

// ================= FACEBOOK BUTTON (DEVELOPER) =================
async function sendDeveloperButton(userId) {
  await fetch(
    `https://graph.facebook.com/v23.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: userId },
        message: {
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: `🤖 تم برمجتي بواسطة ${DEVELOPER_NAME}`,
              buttons: [
                {
                  type: "web_url",
                  url: DEVELOPER_PAGE,
                  title: "👨‍💻 صفحة المطور"
                }
              ]
            }
          }
        }
      })
    }
  );
}

// ================= FACEBOOK ACTIONS =================
async function sendFacebookAction(userId, action) {
  await fetch(
    `https://graph.facebook.com/v23.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: userId },
        sender_action: action
      })
    }
  );
}

async function sendFacebookMessage(userId, text) {
  await fetch(
    `https://graph.facebook.com/v23.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: userId },
        message: { text }
      })
    }
  );
}

// ================= COHERE =================
async function askCohere(messages) {
  const response = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "command-a-03-2025",
      temperature: 0.3,
      max_tokens: 300,
      messages: [
        { role: "system", content: BOT_SYSTEM_PROMPT },
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      ]
    })
  });

  const data = await response.json();
  return data?.message?.content?.[0]?.text || "ما قدرت أجاوب.";
}

// ================= GEMINI IMAGE =================
async function toBase64(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

async function askGemini(imageUrl) {
  const base64 = await toBase64(imageUrl);

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash"
  });

  const result = await model.generateContent([
    `${BOT_SYSTEM_PROMPT} اشرح الصورة باللهجة السودانية بشكل مختصر.`,
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64
      }
    }
  ]);

  const response = await result.response;
  return response.text() || "ما قدرت أفهم الصورة.";
}

// ================= MESSAGE HANDLER =================
async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  let reply = "";
  const text = message?.text?.toLowerCase();

  try {
    await sendFacebookAction(senderId, "typing_on");

    // 🟦 زر المطور
    if (
      message?.text &&
      (
        message.text.includes("من صنعك") ||
        message.text.includes("من برمجك") ||
        message.text.includes("مين عملك")
      )
    ) {
      await sendDeveloperButton(senderId);
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // 🖼 صورة
    else if (message?.attachments?.[0]?.type === "image") {
      const imageUrl = message.attachments[0].payload.url;
      reply = await askGemini(imageUrl);
    }

    // 💬 نص + كاش
    else if (message?.text) {

      if (text && cache.has(text)) {
        reply = cache.get(text);
      } else {
        let history = histories.get(senderId) || [];

        history.push({ role: "user", content: message.text });
        history = history.slice(-MAX_HISTORY);

        reply = await askCohere(history);

        history.push({ role: "assistant", content: reply });
        histories.set(senderId, history);

        if (text) cache.set(text, reply);
      }
    }

    await sendFacebookAction(senderId, "typing_off");

    if (reply) {
      await sendFacebookMessage(senderId, reply);
    }

  } catch (err) {
    console.error("ERROR:", err);
    await sendFacebookAction(senderId, "typing_off");
  }
}

// ================= WEBHOOK =================
app.post("/webhook", (req, res) => {
  const body = req.body;

  if (body.object !== "page") return res.sendStatus(404);

  res.status(200).send("OK");

  for (const entry of body.entry) {
    for (const event of entry.messaging) {
      if (event.message?.is_echo) continue;

      setImmediate(() => {
        handleMessage(event);
      });
    }
  }
});

// ================= VERIFY =================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🤖 ${BOT_NAME} running...`);
});
