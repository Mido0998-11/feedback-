import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Tesseract from "tesseract.js";

const app = express();

// ================= ENV =================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const APP_SECRET = process.env.APP_SECRET;
const COHERE_API_KEY = process.env.COHERE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ================= BOT INFO =================
const BOT_NAME = "غوكو";
const DEVELOPER_NAME = "محمد عادل ويزي (Wizzy)";

// ================= INIT =================
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const histories = new Map();

// ================= CLEANUP OLD HISTORIES =================
// حذف السجلات القديمة كل 30 دقيقة لتوفير الذاكرة
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of histories.entries()) {
    if (now - value.lastActivity > 30 * 60 * 1000) {
      histories.delete(key);
    }
  }
}, 10 * 60 * 1000);

// ================= SYSTEM PROMPT =================
const BOT_SYSTEM_PROMPT = `
You are Goku, a smart assistant.
Always reply in the same language as the user.
Be short and clear.
`;

// ================= VERIFY SIGNATURE =================
function verifyRequestSignature(req, res, buf) {
  const signature = req.headers["x-hub-signature-256"];
  
  if (!signature) {
    console.warn("No signature provided in request");
    return; // نسمح بالمرور لكن نسجل تحذير
  }
  
  const elements = signature.split("=");
  const signatureHash = elements[1];
  const expectedHash = crypto
    .createHmac("sha256", APP_SECRET)
    .update(buf)
    .digest("hex");
    
  if (signatureHash !== expectedHash) {
    throw new Error("Invalid request signature");
  }
}

// ================= DETECT DEV QUESTION =================
function isDevQuestion(text = "") {
  const t = text.toLowerCase();

  return (
    t.includes("من صنعك") ||
    t.includes("من برمجك") ||
    t.includes("من هو مطورك") ||
    t.includes("من طورك") ||
    t.includes("who made you") ||
    t.includes("who created you") ||
    t.includes("who developed you") ||
    t.includes("developer") ||
    t.includes("creator")
  );
}

// ================= FACEBOOK API =================
async function sendFacebookAction(userId, action) {
  try {
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
  } catch (err) {
    console.error("Error sending action:", err);
  }
}

async function sendFacebookMessage(userId, text) {
  try {
    // تقسيم الرسائل الطويلة (فيسبوك يسمح بـ 2000 حرف كحد أقصى)
    const maxLength = 2000;
    if (text.length <= maxLength) {
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
    } else {
      // تقسيم الرسالة إلى أجزاء
      const parts = [];
      for (let i = 0; i < text.length; i += maxLength) {
        parts.push(text.substring(i, i + maxLength));
      }
      
      for (const part of parts) {
        await fetch(
          `https://graph.facebook.com/v23.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: userId },
              message: { text: part }
            })
          }
        );
        // انتظار قصير بين الرسائل المتتالية
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  } catch (err) {
    console.error("Error sending message:", err);
  }
}

// ================= COHERE CHAT =================
async function askCohere(messages) {
  try {
    const res = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${COHERE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "command-r",
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

    if (!res.ok) {
      console.error("Cohere API error:", res.status);
      return `أنا ${BOT_NAME}، حدث خطأ في المعالجة`;
    }

    const data = await res.json();
    return data?.message?.content?.[0]?.text || `أنا ${BOT_NAME}`;
  } catch (err) {
    console.error("Cohere error:", err);
    return `أنا ${BOT_NAME}، عذراً لا أستطيع الرد حالياً`;
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
      "اشرح الصورة بشكل واضح وبسيط",
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64
        }
      }
    ]);

    return (await result.response).text();
  } catch (err) {
    console.error("Gemini vision error:", err);
    return "لم أستطع تحليل الصورة";
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
    console.error("Image analysis error:", err);
    return "ما قدرت أحلل الصورة، تأكد من نوع الملف وجودته";
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

      const reply = await analyzeImage(url);

      await sendFacebookMessage(senderId, reply);
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // 🎯 ملحق (sticker, GIF, file, etc.)
    if (message?.attachments?.[0]?.type && message.attachments[0].type !== "image") {
      await sendFacebookMessage(
        senderId,
        "🎯 حالياً أقدر أتعامل مع النصوص والصور فقط"
      );
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // 💬 نص
    let history = histories.get(senderId) || { messages: [], lastActivity: Date.now() };
    history.messages.push({ role: "user", content: message.text });
    history.messages = history.messages.slice(-10);
    history.lastActivity = Date.now();

    const reply = await askCohere(history.messages);

    history.messages.push({ role: "assistant", content: reply });
    histories.set(senderId, history);

    await sendFacebookMessage(senderId, reply);
    await sendFacebookAction(senderId, "typing_off");

  } catch (err) {
    console.error("Handle message error:", err);
    await sendFacebookMessage(senderId, `🎌 أنا ${BOT_NAME}، حدث خطأ غير متوقع`);
    await sendFacebookAction(senderId, "typing_off");
  }
}

// ================= MIDDLEWARE =================
app.use(express.json({
  verify: verifyRequestSignature
}));

// ================= WEBHOOK POST =================
app.post("/webhook", (req, res) => {
  if (req.body.object !== "page") {
    return res.sendStatus(404);
  }

  // إرسال 200 OK فوراً لفيسبوك
  res.sendStatus(200);

  // معالجة الرسائل في الخلفية
  for (const entry of req.body.entry) {
    for (const event of entry.messaging) {
      if (event.message?.is_echo) continue;
      
      handleMessage(event).catch(err => {
        console.error("Background processing error:", err);
        // محاولة إرسال رسالة خطأ للمستخدم
        sendFacebookMessage(
          event.sender.id, 
          "عذراً، حدث خطأ أثناء معالجة طلبك"
        ).catch(e => console.error("Failed to send error message:", e));
      });
    }
  }
});

// ================= WEBHOOK GET (VERIFY) =================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  console.warn("Webhook verification failed");
  res.sendStatus(403);
});

// ================= HEALTH CHECK =================
app.get("/", (req, res) => {
  res.json({
    bot: BOT_NAME,
    developer: DEVELOPER_NAME,
    status: "running",
    timestamp: new Date().toISOString()
  });
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 ${BOT_NAME} is running on port ${PORT}`);
  console.log(`👨‍💻 Developed by ${DEVELOPER_NAME}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/`);
});

// ================= GRACEFUL SHUTDOWN =================
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});
