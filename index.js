import express from "express";
import fetch from "node-fetch";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-3.6-flash",
  systemInstruction: `
أنت مساعد ذكاء اصطناعي ذكي، هادئ، محترف، ومتزن اسمه "غوكو".
- قدم إجابات دقيقة، واضحة ومباشرة دون مبالغة أو حماس زائد.
- أجب دائماً بنفس لغة ولهجة المستخدم (فصحى، عامية، إنجليزي... إلخ).
- معلومة المطور: تم تطويرك وبرمجتك بواسطة "محمد عادل ويزي (Wizzy)".
- قاعدة هامة جداً: لا تذكر مطورك أو اسم محمد عادل نهائياً إلا إذا سألك المستخدم صراحة عن من صنعك، برمجك، طورك أو من هو صاحبك. في غير ذلك، ركز على الإجابة عن طلب المستخدم فقط.
- لديك القدرة على قراءة وتحليل وفهم الصور المرفقة بدقة.
`
});

const BOT_NAME = "غوكو";
const DEVELOPER_NAME = "محمد عادل ويزي (Wizzy)";

const histories = new Map();

// ردود هادئة ومحددة فقط عند السؤال عن المطور
const DEV_RESPONSES = [
  `أنا ${BOT_NAME}، مساعد ذكاء اصطناعي تم تطويري وبرمجتي بواسطة ${DEVELOPER_NAME}.`,
  `تمت برمجتي وتطوير هذا النظام بالكامل بواسطة المطور ${DEVELOPER_NAME}.`,
  `صانعي ومطوري هو ${DEVELOPER_NAME}.`
];

function isDevQuestion(text = "") {
  const t = text.toLowerCase().trim();
  return (
    t.includes("من صنعك") ||
    t.includes("من برمجك") ||
    t.includes("من هو مطورك") ||
    t.includes("من مطورك") ||
    t.includes("كيف تبرمجت") ||
    t.includes("كيف انصنعت") ||
    t.includes("من سواك") ||
    t.includes("مين برمجك") ||
    t.includes("مين سواك") ||
    t.includes("مين مطورك") ||
    t.includes("من صانعك") ||
    t.includes("who made you") ||
    t.includes("who is your developer") ||
    t.includes("who developed you")
  );
}

function getRandomDevResponse() {
  const index = Math.floor(Math.random() * DEV_RESPONSES.length);
  return DEV_RESPONSES[index];
}

async function urlToGenerativePart(url) {
  const response = await fetch(url);
  const buffer = await response.buffer();
  const mimeType = response.headers.get("content-type") || "image/jpeg";
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType: mimeType.split(";")[0]
    }
  };
}

async function askGemini(messages, imagePart = null) {
  const prompt = messages
    .map(m => `${m.role === "user" ? "المستخدم" : "المساعد"}: ${m.content}`)
    .join("\n");

  const fullPrompt = `${prompt}\nالمساعد:`;

  const contents = imagePart ? [imagePart, fullPrompt] : fullPrompt;

  const result = await model.generateContent(contents);
  const response = await result.response;

  return response.text() || "عذراً، لم أتمكن من معالجة الرد حالياً.";
}

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
  } catch (e) {
    console.error("Action Error:", e);
  }
}

async function sendFacebookMessage(userId, text) {
  const MAX_LENGTH = 1900;
  for (let i = 0; i < text.length; i += MAX_LENGTH) {
    const chunk = text.substring(i, i + MAX_LENGTH);
    await fetch(
      `https://graph.facebook.com/v23.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: userId },
          message: { text: chunk }
        })
      }
    );
  }
}

async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  if (!message) return;

  let imageUrl = null;
  if (message.attachments && message.attachments.length > 0) {
    const imgAttachment = message.attachments.find(att => att.type === "image");
    if (imgAttachment) {
      imageUrl = imgAttachment.payload.url;
    }
  }

  const userText = (message.text || (imageUrl ? "حلل هذه الصورة واشرح محتواها." : "")).trim();
  if (!userText && !imageUrl) return;

  try {
    await sendFacebookAction(senderId, "typing_on");

    // أمر مسح الذاكرة
    if (userText.toLowerCase() === "/clear" || userText === "مسح" || userText === "تصفير") {
      histories.delete(senderId);
      await sendFacebookMessage(senderId, "تم مسح سياق المحادثة بنجاح. تفضل، كيف يمكنني مساعدتك؟");
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // أمر المساعدة
    if (userText.toLowerCase() === "/help" || userText === "مساعدة") {
      const helpMsg = `أهلاً بك، أنا ${BOT_NAME}، مساعدك الذكي.
يمكنني مساعدتك في الإجابة عن الأسئلة، كتابة النصوص، وتحليل الصور.

أوامر سريعة:
• أرسل أي صورة مع سؤالك لتحليلها مباشرة.
• اكتب "مسح" أو "/clear" لبدء محادثة جديدة وتصفير الذاكرة.`;
      await sendFacebookMessage(senderId, helpMsg);
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // السؤال عن المطور (فقط عند السؤال الصريح وبدون صورة)
    if (isDevQuestion(userText) && !imageUrl) {
      await sendFacebookMessage(senderId, getRandomDevResponse());
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    let history = histories.get(senderId) || [];

    history.push({
      role: "user",
      content: userText
    });

    history = history.slice(-10);

    let imagePart = null;
    if (imageUrl) {
      imagePart = await urlToGenerativePart(imageUrl);
    }

    const reply = await askGemini(history, imagePart);

    history.push({
      role: "assistant",
      content: reply
    });

    histories.set(senderId, history);

    await sendFacebookMessage(senderId, reply);
    await sendFacebookAction(senderId, "typing_off");

  } catch (err) {
    console.error("Handler Error:", err);

    await sendFacebookMessage(
      senderId,
      "حدث خطأ مؤقت، يرجى المحاولة مرة أخرى لاحقاً."
    );

    await sendFacebookAction(senderId, "typing_off");
  }
}

app.get("/", (req, res) => {
  res.send("Goku Bot Running Successfully");
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  const body = req.body;

  if (body.object !== "page") {
    return res.sendStatus(404);
  }

  res.status(200).send("EVENT_RECEIVED");

  for (const entry of body.entry) {
    for (const event of entry.messaging) {
      if (event.message?.is_echo) continue;
      handleMessage(event);
    }
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`${BOT_NAME} running on port ${PORT}`);
});
