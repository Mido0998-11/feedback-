import express from "express";
import fetch from "node-fetch";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Tesseract from "tesseract.js";

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

// ================= INIT =================
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const histories = new Map();

// ================= SYSTEM PROMPT (ذكي جداً) =================
const BOT_SYSTEM_PROMPT = `
You are Goku, a super intelligent assistant.
You think deeply before answering.
You are creative, helpful, and witty.
You always reply in the same language as the user.
You use emojis to make conversations fun.
You are very smart and can solve any problem.
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

// ================= COHERE CHAT (ذكي جداً) =================
async function askCohere(messages) {
  try {
    const res = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${COHERE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "command-r-plus", // ← أقوى نموذج
        temperature: 0.7, // ← إبداعي أكثر
        messages: [
          { role: "system", content: BOT_SYSTEM_PROMPT },
          ...messages.map(m => ({
            role: m.role,
            content: m.content
          }))
        ]
      })
    });

    if (!res.ok) {
      console.error("Cohere API error:", res.status);
      return `🎌 أنا ${BOT_NAME}، حدث خطأ`;
    }

    const data = await res.json();
    return data?.message?.content?.[0]?.text || `🎌 أنا ${BOT_NAME}`;
  } catch (err) {
    console.error("Cohere error:", err);
    return `🎌 أنا ${BOT_NAME}، عذراً لا أستطيع الرد`;
  }
}

// ================= IMAGE BASE64 =================
async function fetchImageBuffer(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  if (!res.ok) throw new Error("Image fetch failed");

  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer);
}

// ================= OCR =================
async function extractOCR(buffer) {
  try {
    const result = await Tesseract.recognize(buffer, "eng+ara");
    return result.data.text?.trim() || "";
  } catch (err) {
    console.error("OCR error:", err);
    return "";
  }
}

// ================= GEMINI VISION =================
async function askGeminiVision(buffer) {
  try {
    const base64 = buffer.toString("base64");

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    const result = await model.generateContent([
      "اشرح الصورة بشكل واضح وبسيط وكأنك ذكي جداً",
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64
        }
      }
    ]);

    return (await result.response).text();
  } catch (err) {
    console.error("Gemini error:", err);
    return "عذراً، حدث خطأ في تحليل الصورة";
  }
}

// ================= SMART IMAGE ANALYSIS =================
async function analyzeImage(imageUrl) {
  try {
    const buffer = await fetchImageBuffer(imageUrl);

    const [vision, ocr] = await Promise.all([
      askGeminiVision(buffer),
      extractOCR(buffer)
    ]);

    let result = `🧠 تحليل الصورة:\n${vision}`;

    if (ocr && ocr.length > 0) {
      result += `\n\n📄 النص داخل الصورة:\n${ocr}`;
    }

    return result;
  } catch (err) {
    console.error(err);
    return "ما قدرت أحلل الصورة، حاول مرة أخرى";
  }
}

// ================= MAIN HANDLER =================
async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  if (!message || (!message.text && !message.attachments)) return;

  try {
    await sendFacebookAction(senderId, "typing_on");

    // 🚨 سؤال المطور
    if (message?.text && isDevQuestion(message.text)) {
      await sendFacebookMessage(
        senderId,
        `🎌 أنا ${BOT_NAME}\n👨‍💻 تم تطويري بواسطة ${DEVELOPER_NAME}`
      );
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // 🖼 صورة
    if (message?.attachments?.[0]?.type === "image") {
      const url = message.attachments[0].payload.url;

      await sendFacebookMessage(senderId, "🔍 جاري تحليل الصورة...");

      const reply = await analyzeImage(url);

      await sendFacebookMessage(senderId, reply);
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // 💬 نص
    let history = histories.get(senderId) || [];
    history.push({ role: "user", content: message.text });
    history = history.slice(-10);

    const reply = await askCohere(history);

    history.push({ role: "assistant", content: reply });
    histories.set(senderId, history);

    await sendFacebookMessage(senderId, reply);
    await sendFacebookAction(senderId, "typing_off");

  } catch (err) {
    console.error(err);
    await sendFacebookMessage(senderId, `🎌 أنا ${BOT_NAME}، حدث خطأ`);
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
