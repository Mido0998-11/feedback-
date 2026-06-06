import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ================= ENV =================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;

// ================= BOT INFO =================
const BOT_NAME = "غوكو";
const DEVELOPER_NAME = "محمد عادل ويزي (Wizzy)";

// ================= INIT =================
const histories = new Map();

// ================= SYSTEM PROMPT =================
const BOT_SYSTEM_PROMPT = `
You are Goku, a smart assistant.
Always reply in the same language as the user.
Be short and clear.
`;

// ================= DETECT DEV QUESTION =================
function isDevQuestion(text = "") {
  const t = text.toLowerCase();
  return (
    t.includes("من صنعك") ||
    t.includes("من برمجك") ||
    t.includes("who made you") ||
    t.includes("developer")
  );
}

// ================= FACEBOOK =================
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

// ================= OPENROUTER CHAT (النموذج الجديد) =================
async function askOpenRouter(messages) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-r1-distill-llama-8b:free", // 👈 النموذج الأقوى
        messages: [
          { role: "system", content: BOT_SYSTEM_PROMPT },
          ...messages
        ],
        temperature: 0.7
      })
    });

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || `أنا ${BOT_NAME}`;
  } catch (err) {
    console.error(err);
    return `أنا ${BOT_NAME}`;
  }
}

// ================= HUGGING FACE VISION =================
async function askHuggingFaceVision(buffer) {
  try {
    const base64 = buffer.toString("base64");

    const res = await fetch("https://api-inference.huggingface.co/models/llava-hf/llava-1.5-7b-hf", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: { image: base64 }
      })
    });

    const data = await res.json();
    return data?.[0]?.generated_text || "لم أستطع فهم الصورة";
  } catch (err) {
    console.error(err);
    return "⚠️ حدث خطأ في تحليل الصورة";
  }
}

// ================= IMAGE =================
async function analyzeImage(url) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return await askHuggingFaceVision(Buffer.from(buffer));
}

// ================= MAIN HANDLER =================
async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  if (!message) return;

  try {
    // 🖼 صورة
    if (message.attachments?.[0]?.type === "image") {
      const url = message.attachments[0].payload.url;
      const reply = await analyzeImage(url);
      await sendFacebookMessage(senderId, `🧠 تحليل الصورة:\n${reply}`);
      return;
    }

    // 💬 نص
    if (message.text) {
      let history = histories.get(senderId) || [];
      history.push({ role: "user", content: message.text });
      history = history.slice(-10);

      const reply = await askOpenRouter(history);

      history.push({ role: "assistant", content: reply });
      histories.set(senderId, history);

      await sendFacebookMessage(senderId, reply);
    }
  } catch (err) {
    console.error(err);
    await sendFacebookMessage(senderId, `أنا ${BOT_NAME}`);
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
