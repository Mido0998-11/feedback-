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

// ================= MEMORY =================
const histories = new Map();

// ================= BOT INFO =================
const BOT_NAME = "غوكو";
const DEVELOPER_NAME = "محمد عادل (ويزي)";

// ================= SYSTEM PROMPT =================
const BOT_SYSTEM_PROMPT = `
أنت مساعد ذكي اسمه "غوكو".
تتكلم بلهجة سودانية بسيطة وودية.

مهم جداً:
- لا تذكر المطور أو الصانع في أي رد عادي.
- إذا سُئلت فقط: من صنعك أو من برمجك
  قل: تم برمجتي بواسطة ${DEVELOPER_NAME}.
`;

// ================= CHECK DEVELOPER QUESTION =================
function isAskingAboutDeveloper(text = "") {
  return (
    text.includes("من صنعك") ||
    text.includes("من برمجك") ||
    text.includes("مين عملك") ||
    text.includes("who made you")
  );
}

// ================= COHERE (TEXT) =================
async function askCohere(messages) {
  const response = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "command-a-03-2025",
      temperature: 0.5,
      messages: [
        { role: "system", content: BOT_SYSTEM_PROMPT },
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      ]
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();

  return (
    data?.message?.content?.[0]?.text ||
    "عذراً، لم أستطع الرد."
  );
}

// ================= GEMINI (IMAGE) =================
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
    `${BOT_SYSTEM_PROMPT} اشرح الصورة باللهجة السودانية بشكل مختصر وواضح.`,
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

// ================= WEBHOOK VERIFY =================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ================= BOT LOGIC =================
async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  let reply = "";

  try {
    await sendFacebookAction(senderId, "typing_on");

    // 🔥 سؤال عن المطور
    if (message?.text && isAskingAboutDeveloper(message.text)) {
      reply = `تم برمجتي بواسطة ${DEVELOPER_NAME}`;
    }

    // 🖼 صورة
    else if (message?.attachments?.[0]?.type === "image") {
      const imageUrl = message.attachments[0].payload.url;
      reply = await askGemini(imageUrl);
    }

    // 💬 نص
    else if (message?.text) {
      let history = histories.get(senderId) || [];

      history.push({
        role: "user",
        content: message.text
      });

      history = history.slice(-20);

      reply = await askCohere(history);

      history.push({
        role: "assistant",
        content: reply
      });

      histories.set(senderId, history);
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

// ================= MAIN WEBHOOK =================
app.post("/webhook", (req, res) => {
  const body = req.body;

  if (body.object !== "page") {
    return res.sendStatus(404);
  }

  res.status(200).send("OK");

  for (const entry of body.entry) {
    for (const event of entry.messaging) {
      if (event.message?.is_echo) continue;
      if (event.message?.text || event.message?.attachments) {
        handleMessage(event);
      }
    }
  }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🤖 ${BOT_NAME} is running...`);
});
