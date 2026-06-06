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

// التوجيه الصحيح والمعدل: البوت يعرف تماماً إنك إنت المطور وصانعه الوحيد
const BOT_SYSTEM_PROMPT = "أنت مساعد ذكي ومرح، تجيب باختصار ووضوح وبلهجة سودانية ودية. تذكر دائماً أن مطورك وصانعك هو (محمد عادل ويزي - Wizzy)، وإذا سألك أي مستخدم عن من قام ببرمجتك أو تطويرك، أخبره فخوراً بأن مطورك هو محمد عادل ويزي.";

// ================= COHERE (TEXT) =================
async function askCohere(messages) {
  const formattedMessages = [
    { role: "system", content: [{ type: "text", text: BOT_SYSTEM_PROMPT }] },
    ...messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  ];

  const response = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "command-a-03-2025",
      temperature: 0.5,
      messages: formattedMessages
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  return data?.message?.content?.[0]?.text || "عذراً، لم أستطع الرد.";
}

// ================= GEMINI (IMAGE) =================
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
    `${BOT_SYSTEM_PROMPT} اشرح هذه الصورة بالعامية السودانية وبشكل واضح ومختصر جداً.`,
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64
      }
    }
  ]);

  const response = await result.response;
  return response.text() || "ما قدرت أفهم الصورة دي والله.";
}

// ================= FACEBOOK ACTIONS & SEND =================

// دالة تفعيل الأكشن (يكتب الآن...)
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

// دالة إرسال الرسالة النصية
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

// ================= ROUTES =================
app.get("/", (req, res) => {
  res.send("Bot is running 🚀");
});

// VERIFY WEBHOOK
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ================= BACKGROUND PROCESSOR =================
async function handleMessageBackground(event) {
  const senderId = event.sender.id;
  const message = event.message;
  let reply = "";

  try {
    // تشغيل ميزة "يكتب الآن..." أول ما نستلم الرسالة
    await sendFacebookAction(senderId, "typing_on");

    // 1. معالجة الصور عبر Gemini
    if (message?.attachments?.[0]?.type === "image") {
      const imageUrl = message.attachments[0].payload.url;
      reply = await askGemini(imageUrl);
    }
    // 2. معالجة النصوص عبر Cohere
    else if (message?.text) {
      let history = histories.get(senderId) || [];
      history.push({ role: "user", content: message.text });
      history = history.slice(-20);

      reply = await askCohere(history);

      history.push({ role: "assistant", content: reply });
      histories.set(senderId, history);
    }

    // إيقاف ميزة الكتابة وإرسال الرد للمستخدم
    await sendFacebookAction(senderId, "typing_off");
    if (reply) {
      await sendFacebookMessage(senderId, reply);
    }
  } catch (err) {
    console.error("BACKGROUND PROCESS ERROR:", err);
    // إلغاء الـ Typing لو حصل خطأ عشان ما يعلق في الشات
    await sendFacebookAction(senderId, "typing_off");
  }
}

// ================= MAIN BOT LOGIC =================
app.post("/webhook", (req, res) => {
  const body = req.body;

  if (body.object !== "page") {
    return res.sendStatus(404);
  }

  // الرد السريع لفيسبوك عشان الـ Timeout
  res.status(200).send("EVENT_RECEIVED");

  for (const entry of body.entry) {
    for (const event of entry.messaging) {
      // حماية من الـ Echo لو البوت بيرد على نفسه
      if (event.message?.is_echo) continue;

      if (event.message?.text || event.message?.attachments) {
        handleMessageBackground(event);
      }
    }
  }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
