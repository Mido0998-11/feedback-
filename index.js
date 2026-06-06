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

// ================= INIT =================
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ================= MEMORY =================
const histories = new Map();
const cache = new Map();
const MAX_HISTORY = 10;

// ================= BOT INFO =================
const BOT_NAME = "غوكو";

// ================= DEVELOPER =================
const DEV_REPLY = `المطور: محمد عادل (ويزي)
🔗 https://www.facebook.com/mhmd.wd.adl.441816`;

// ================= SYSTEM PROMPT (أقوى ذكاء) =================
const BOT_SYSTEM_PROMPT = `
أنت مساعد ذكي اسمه "غوكو".

قواعد مهمة:
- ردودك دقيقة وواضحة ومباشرة
- لا تخترع معلومات غير مؤكدة
- إذا لا تعرف قل: "ما عندي معلومة مؤكدة حالياً"
- استخدم لهجة سودانية خفيفة عند الحاجة
- لا تطيل إلا إذا طلب المستخدم شرح
- ركز على الحلول العملية دائماً
`;

// ================= DEV DETECTION =================
function isDevQuestion(text = "") {
  const t = text.toLowerCase();

  return (
    t.includes("من صنعك") ||
    t.includes("من برمجك") ||
    t.includes("مين عملك") ||
    t.includes("من هو مطورك") ||
    t.includes("who made you") ||
    t.includes("developer")
  );
}

// ================= FACEBOOK =================
async function sendMessage(userId, text) {
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

async function typing(userId, action) {
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

// ================= FREE SEARCH =================
async function searchWeb(query) {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;

    const res = await fetch(url);
    const data = await res.json();

    let out = "🔍 نتائج البحث:\n\n";

    if (data.AbstractText) {
      out += `🧠 ${data.AbstractText}\n\n`;
    }

    if (data.AbstractURL) {
      out += `🔗 المصدر: ${data.AbstractURL}\n\n`;
    }

    const results = (data.RelatedTopics || [])
      .filter(t => t.FirstURL)
      .slice(0, 5);

    results.forEach((r, i) => {
      out += `🔎 ${i + 1}. ${r.Text}\n🔗 ${r.FirstURL}\n\n`;
    });

    return out.trim() || "ما لقيت نتائج واضحة.";
  } catch {
    return "حصل خطأ في البحث حالياً.";
  }
}

// ================= COHERE CHAT =================
async function askCohere(messages) {
  const res = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "command-a-03-2025",
      temperature: 0.2,
      max_tokens: 350,
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
  return data?.message?.content?.[0]?.text || "ما عندي معلومة مؤكدة.";
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
    `${BOT_SYSTEM_PROMPT} اشرح الصورة بشكل واضح ومختصر.`,
    {
      inlineData: {
        mimeType: "image/jpeg",
        data: base64
      }
    }
  ]);

  const response = await result.response;
  return response.text();
}

// ================= MAIN HANDLER =================
async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  if (!message || (!message.text && !message.attachments)) return;

  try {
    await typing(senderId, "typing_on");

    // 🚨 المطور
    if (message?.text && isDevQuestion(message.text)) {
      await sendMessage(senderId, DEV_REPLY);
      await typing(senderId, "typing_off");
      return;
    }

    // 🖼 صورة
    if (message?.attachments?.[0]?.type === "image") {
      const url = message.attachments[0].payload.url;
      const reply = await askGemini(url);

      await sendMessage(senderId, reply);
      await typing(senderId, "typing_off");
      return;
    }

    // 🔎 بحث
    if (message?.text?.startsWith("بحث")) {
      const query = message.text.replace("بحث", "").trim();
      const result = await searchWeb(query);

      await sendMessage(senderId, result);
      await typing(senderId, "typing_off");
      return;
    }

    const text = message?.text?.toLowerCase();

    // ⚡ Cache
    if (cache.has(text)) {
      await sendMessage(senderId, cache.get(text));
      await typing(senderId, "typing_off");
      return;
    }

    // 💬 AI Chat
    let history = histories.get(senderId) || [];
    history.push({ role: "user", content: message.text });
    history = history.slice(-MAX_HISTORY);

    const reply = await askCohere(history);

    history.push({ role: "assistant", content: reply });
    histories.set(senderId, history);

    cache.set(text, reply);

    await sendMessage(senderId, reply);
    await typing(senderId, "typing_off");

  } catch (err) {
    console.error(err);
    await typing(senderId, "typing_off");
  }
}

// ================= WEBHOOK =================
app.post("/webhook", (req, res) => {
  if (req.body.object !== "page") return res.sendStatus(404);

  res.sendStatus(200);

  for (const entry of req.body.entry) {
    for (const event of entry.messaging) {
      if (event.message?.is_echo) continue;
      setImmediate(() => handleMessage(event));
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
  console.log(`🤖 ${BOT_NAME} running...`);
});
