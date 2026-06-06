import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";
import Tesseract from "tesseract.js";

const app = express();

// ================= ENV =================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const APP_SECRET = process.env.APP_SECRET;
const COHERE_API_KEY = process.env.COHERE_API_KEY;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY; // هذا الجديد

// ================= BOT INFO =================
const BOT_NAME = "غوكو";
const DEVELOPER_NAME = "محمد عادل ويزي (Wizzy)";

// ================= INIT =================
const histories = new Map();

// ================= CLEANUP OLD HISTORIES =================
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
  if (!APP_SECRET) {
    console.warn("APP_SECRET not set - skipping signature verification");
    return;
  }
  
  const signature = req.headers["x-hub-signature-256"];
  
  if (!signature) {
    console.warn("No signature provided in request");
    return;
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
    t.includes("مين صنعك") ||
    t.includes("مين برمجك") ||
    t.includes("مين طورك") ||
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
      return `🎌 أنا ${BOT_NAME}، حدث خطأ في المعالجة`;
    }

    const data = await res.json();
    return data?.message?.content?.[0]?.text || `🎌 أنا ${BOT_NAME}`;
  } catch (err) {
    console.error("Cohere error:", err);
    return `🎌 أنا ${BOT_NAME}، عذراً لا أستطيع الرد حالياً`;
  }
}

// ================= IMAGE BUFFER =================
async function fetchImageBuffer(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    if (!res.ok) {
      throw new Error(`Image fetch failed with status: ${res.status}`);
    }

    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer);
  } catch (err) {
    console.error("Error fetching image:", err);
    throw err;
  }
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

// ================= HUGGING FACE VISION =================
async function askHuggingFaceVision(buffer) {
  try {
    const base64 = buffer.toString("base64");

    const model = "llava-hf/llava-1.5-7b-hf";

    const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: { image: base64 },
        parameters: { max_new_tokens: 300 }
      })
    });

    if (!res.ok) {
      console.error("Hugging Face error:", res.status);
      return "❌ عذراً، حدث خطأ في تحليل الصورة.";
    }

    const data = await res.json();

    if (Array.isArray(data) && data[0]?.generated_text) {
      return data[0].generated_text;
    }

    return "لم أستطع فهم الصورة، حاول مرة أخرى.";
  } catch (err) {
    console.error("Hugging Face vision error:", err);
    return "⚠️ حدث خطأ أثناء معالجة الصورة.";
  }
}

// ================= SMART IMAGE ANALYSIS =================
async function analyzeImage(imageUrl) {
  console.log("🔍 Starting image analysis for:", imageUrl);
  
  try {
    const buffer = await fetchImageBuffer(imageUrl);
    console.log("✅ Image fetched successfully, size:", buffer.length, "bytes");

    const [vision, ocr] = await Promise.all([
      askHuggingFaceVision(buffer),
      extractOCR(buffer)
    ]);
    console.log("✅ Analysis complete");

    let result = `🧠 تحليل الصورة:\n${vision}`;

    if (ocr && ocr.length > 0) {
      result += `\n\n📄 النص داخل الصورة:\n${ocr}`;
    }

    return result;
  } catch (err) {
    console.error("❌ Image analysis error:", err);
    return "⚠️ ما قدرت أحلل الصورة. تأكد من نوع الملف وجودته وحاول مرة أخرى.";
  }
}

// ================= MAIN HANDLER =================
async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  console.log("📨 Received message:", JSON.stringify(message).substring(0, 200));

  if (!message || (!message.text && !message.attachments)) {
    console.log("⏭️ Skipping empty message");
    return;
  }

  try {
    await sendFacebookAction(senderId, "typing_on");

    if (message?.text && isDevQuestion(message.text)) {
      console.log("👨‍💻 Dev question detected");
      await sendFacebookMessage(
        senderId,
        `🎌 أنا ${BOT_NAME}\n👨‍💻 تم تطويري بواسطة ${DEVELOPER_NAME}`
      );
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    if (message?.attachments && message.attachments[0]?.type === "image") {
      console.log("🖼️ Image attachment detected");
      const url = message.attachments[0].payload.url;
      console.log("📎 Image URL:", url);

      await sendFacebookMessage(senderId, "🔍 جاري تحليل الصورة...");

      const reply = await analyzeImage(url);
      
      console.log("📤 Sending image analysis reply");
      await sendFacebookMessage(senderId, reply);
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    if (message?.attachments && message.attachments[0]?.type && message.attachments[0].type !== "image") {
      console.log("📎 Other attachment type:", message.attachments[0].type);
      await sendFacebookMessage(
        senderId,
        "🎯 حالياً أقدر أتعامل مع النصوص والصور فقط\n📝 جرب ترسل لي نص أو صورة"
      );
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    if (message?.text) {
      console.log("💬 Text message:", message.text);
      
      let history = histories.get(senderId) || { messages: [], lastActivity: Date.now() };
      history.messages.push({ role: "user", content: message.text });
      history.messages = history.messages.slice(-10);
      history.lastActivity = Date.now();

      const reply = await askCohere(history.messages);

      history.messages.push({ role: "assistant", content: reply });
      histories.set(senderId, history);

      await sendFacebookMessage(senderId, reply);
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

  } catch (err) {
    console.error("❌ Handle message error:", err);
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
  console.log("📡 Webhook received");
  
  if (req.body.object !== "page") {
    console.log("❌ Not a page object");
    return res.sendStatus(404);
  }

  res.sendStatus(200);

  for (const entry of req.body.entry) {
    for (const event of entry.messaging) {
      if (event.message?.is_echo) {
        console.log("🔄 Echo message, skipping");
        continue;
      }
      
      handleMessage(event).catch(err => {
        console.error("❌ Background processing error:", err);
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

  console.log("🔐 Verification request:", { mode, token });

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  console.warn("❌ Webhook verification failed");
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

// ================= KEEP AWAKE (RENDER) =================
const PORT = process.env.PORT || 3000;
const KEEP_AWAKE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

if (process.env.RENDER_EXTERNAL_URL) {
  console.log('🔄 Keep-alive enabled for:', KEEP_AWAKE_URL);
  setInterval(() => {
    fetch(`${KEEP_AWAKE_URL}/`)
      .then(res => res.json())
      .then(data => console.log('💓 Keep-alive:', data.status))
      .catch(err => console.log('Keep-alive failed:', err.message));
  }, 10 * 60 * 1000);
}

// ================= START SERVER =================
app.listen(PORT, () => {
  console.log("=".repeat(50));
  console.log(`🤖 ${BOT_NAME} is running on port ${PORT}`);
  console.log(`👨‍💻 Developed by ${DEVELOPER_NAME}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/`);
  console.log(`📡 Webhook: http://localhost:${PORT}/webhook`);
  console.log("=".repeat(50));
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT signal received: closing HTTP server');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception thrown:', err);
  process.exit(1);
});
