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

// ================= BOT INFO =================
const BOT_NAME = "غوكو";
const DEVELOPER_NAME = "محمد عادل ويزي (Wizzy)";

// ================= INIT GEMINI =================
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ================= MEMORY =================
const histories = new Map();

// ================= SYSTEM PROMPT =================
const BOT_SYSTEM_PROMPT = `
أنت مساعد ذكي ومرح اسمه غوكو.
كن مختصر وواضح.
لا تذكر أي شركة أو جهة كمطور لك.
مطورك هو محمد عادل ويزي (Wizzy).
`;

// ================= DETECT DEV QUESTION =================
function isDevQuestion(text = "") {
  const t = text.toLowerCase();

  return (
    t.includes("من صنعك") ||
    t.includes("من برمجك") ||
    t.includes("من هو مطورك") ||
    t.includes("who made you") ||
    t.includes("developer") ||
    t.includes("creator")
  );
}

// ================= FORCE IDENTITY FIX =================
function forceIdentity(text) {
  const t = (text || "").toLowerCase();

  if (
    t.includes("cohere") ||
    t.includes("google") ||
    t.includes("openai") ||
    t.includes("company") ||
    t.includes("developed by") ||
    t.includes("تم تطويري") ||
    t.includes("i am developed")
  ) {
    return `أنا غوكو، تم تطويري بواسطة ${DEVELOPER_NAME}`;
  }

  return text;
}

// ================= FACEBOOK =================
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
  const res = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "command-a-03-2025",
      temperature: 0.4,
      messages: [
        { role: "system", content: BOT_SYSTEM_PROMPT },
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      ]
    })
  });

  const data = await res.json();
  return data?.message?.content?.[0]?.text || `أنا غوكو، تم تطويري بواسطة ${DEVELOPER_NAME}`;
}

// ================= GEMINI =================
async function toBase64(url) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

async function askGemini(imageUrl) {
  const base64 = await toBase64(imageUrl);

  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash"
  });

  const result = await model.generateContent([
    "اشرح الصورة باختصار وبوضوح",
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64
      }
    }
  ]);

  const response = await result.response;
  return response.text() || `أنا غوكو، تم تطويري بواسطة ${DEVELOPER_NAME}`;
}

// ================= MAIN =================
async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  if (!message || (!message.text && !message.attachments)) return;

  try {
    await sendFacebookAction(senderId, "typing_on");

    // 🚨 سؤال المطور (ثابت 100%)
    if (message?.text && isDevQuestion(message.text)) {
      await sendFacebookMessage(
        senderId,
        `أنا غوكو، تم تطويري بواسطة ${DEVELOPER_NAME}`
      );
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // 🖼 صورة
    if (message?.attachments?.[0]?.type === "image") {
      const url = message.attachments[0].payload.url;

      let reply = await askGemini(url);
      reply = forceIdentity(reply);

      await sendFacebookMessage(senderId, reply);
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // 💬 AI Chat
    let history = histories.get(senderId) || [];
    history.push({ role: "user", content: message.text });
    history = history.slice(-10);

    let reply = await askCohere(history);

    // 🔥 حماية الهوية 100%
    reply = forceIdentity(reply);

    history.push({ role: "assistant", content: reply });
    histories.set(senderId, history);

    await sendFacebookMessage(senderId, reply);
    await sendFacebookAction(senderId, "typing_off");

  } catch (err) {
    console.error(err);
    await sendFacebookMessage(
      senderId,
      `أنا غوكو، تم تطويري بواسطة ${DEVELOPER_NAME}`
    );
    await sendFacebookAction(senderId, "typing_off");
  }
}

// ================= WEBHOOK =================
app.post("/webhook", (req, res) => {
  if (req.body.object !== "page") return res.sendStatus(404);

  res.sendStatus(200);

  for (const entry of req.body.entry) {
    for (const event of entry.messaging) {
      if (event.message?.is_echo) continue;
      handleMessage(event);
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

  res.sendStatus(403);
});

// ================= START =================
app.listen(process.env.PORT || 3000, () => {
  console.log(`🤖 ${BOT_NAME} running`);
});
