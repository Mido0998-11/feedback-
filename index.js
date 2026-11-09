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
- أجب دائماً بنفس لغة ولهجة المستخدم.
- معلومة المطور: تم تطويرك بواسطة محمد عادل ويزي (Wizzy).
- لا تذكر المطور إلا إذا سألك المستخدم صراحة.
- لديك القدرة على قراءة وتحليل وفهم الصور المرفقة بدقة.
- احترم خصوصية المستخدم ولا تكشف معلوماته لأي شخص.
`
});

const BOT_NAME = "غوكو";
const DEVELOPER_NAME = "محمد عادل ويزي (Wizzy)";

const histories = new Map();
const users = new Map();
const memories = new Map();
const statistics = new Map();

const MAX_HISTORY = 10;
const MAX_MEMORIES = 50;

const DEV_RESPONSES = [
  `أنا ${BOT_NAME}، مساعد ذكاء اصطناعي تم تطويري وبرمجتي بواسطة ${DEVELOPER_NAME}.`,
  `تمت برمجتي وتطوير هذا النظام بواسطة المطور ${DEVELOPER_NAME}.`,
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
  return DEV_RESPONSES[
    Math.floor(Math.random() * DEV_RESPONSES.length)
  ];
}

// إنشاء ملف مستخدم
function getUser(userId) {
  if (!users.has(userId)) {
    users.set(userId, {
      name: "مستخدم غوكو",
      style: "متوازن",
      createdAt: new Date().toISOString(),
      messages: 0
    });
  }

  return users.get(userId);
}

// إنشاء ذاكرة مستخدم
function getMemories(userId) {
  if (!memories.has(userId)) {
    memories.set(userId, []);
  }

  return memories.get(userId);
}

// إحصائيات المستخدم
function getStats(userId) {
  if (!statistics.has(userId)) {
    statistics.set(userId, {
      messages: 0,
      images: 0,
      startedAt: new Date().toISOString()
    });
  }

  return statistics.get(userId);
}

// حفظ معلومة
function remember(userId, content) {
  const list = getMemories(userId);

  if (list.length >= MAX_MEMORIES) {
    list.shift();
  }

  list.push({
    content,
    date: new Date().toLocaleDateString("ar")
  });
}

// استخراج أسلوب المستخدم
function getStyleInstruction(userId) {
  const user = getUser(userId);

  const styles = {
    "متوازن": "أجب بأسلوب متوازن وواضح.",
    "مختصر": "أجب باختصار شديد مع الحفاظ على المعلومات المهمة.",
    "مفصل": "قدم شرحاً مفصلاً ومنظماً.",
    "رسمي": "استخدم لغة رسمية واحترافية.",
    "بسيط": "اشرح بطريقة بسيطة وسهلة الفهم."
  };

  return styles[user.style] || styles["متوازن"];
}

// تحويل الصورة
async function urlToGenerativePart(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Image download failed");
  }

  const buffer = await response.buffer();

  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error("Image too large");
  }

  const mimeType = response.headers.get("content-type") || "image/jpeg";

  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType: mimeType.split(";")[0]
    }
  };
}

// إرسال الطلب إلى Gemini
async function askGemini(messages, imagePart = null, userId = null) {

  const userMemories = userId ? getMemories(userId) : [];
  const style = userId ? getStyleInstruction(userId) : "";

  const memoryText = userMemories.length
    ? userMemories.map((m, i) => `${i + 1}. ${m.content}`).join("\n")
    : "لا توجد معلومات محفوظة.";

  const prompt = messages
    .map(m => `${m.role === "user" ? "المستخدم" : "المساعد"}: ${m.content}`)
    .join("\n");

  const fullPrompt = `
تعليمات أسلوب الرد:
${style}

معلومات المستخدم التي وافق على حفظها:
${memoryText}

سياق المحادثة:
${prompt}

المساعد:
`;

  const contents = imagePart
    ? [imagePart, fullPrompt]
    : fullPrompt;

  const result = await model.generateContent(contents);
  const response = await result.response;

  return response.text() || "عذراً، لم أتمكن من معالجة الرد حالياً.";
}

// إرسال حالة Facebook
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

// إرسال الرسائل
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

// تنفيذ الأوامر الجديدة
async function handleAdvancedCommands(userId, text) {

  const user = getUser(userId);
  const userMemories = getMemories(userId);
  const stats = getStats(userId);

  // الملف الشخصي
  if (text === "/profile") {
    await sendFacebookMessage(
      userId,
      `👤 ملفك الشخصي

الاسم: ${user.name}
أسلوب الرد: ${user.style}
عدد الرسائل: ${stats.messages}
تاريخ الانضمام: ${user.createdAt}`
    );
    return true;
  }

  // حفظ معلومة
  if (text.startsWith("/remember ")) {
    const content = text.slice(10).trim();

    if (!content) {
      await sendFacebookMessage(userId, "اكتب المعلومة بعد الأمر.");
      return true;
    }

    remember(userId, content);

    await sendFacebookMessage(
      userId,
      "✅ تم حفظ المعلومة في ذاكرتك بنجاح."
    );

    return true;
  }

  // عرض الذكريات
  if (text === "/memories") {
    if (!userMemories.length) {
      await sendFacebookMessage(userId, "لا توجد معلومات محفوظة.");
      return true;
    }

    const result = userMemories
      .map((m, i) => `${i + 1}. ${m.content}`)
      .join("\n");

    await sendFacebookMessage(
      userId,
      `🧠 المعلومات المحفوظة:\n\n${result}`
    );

    return true;
  }

  // حذف الذكريات
  if (text === "/forget") {
    memories.set(userId, []);

    await sendFacebookMessage(
      userId,
      "🗑️ تم حذف جميع المعلومات المحفوظة."
    );

    return true;
  }

  // تغيير أسلوب الرد
  if (text.startsWith("/style ")) {
    const style = text.slice(7).trim();

    const available = [
      "متوازن",
      "مختصر",
      "مفصل",
      "رسمي",
      "بسيط"
    ];

    if (!available.includes(style)) {
      await sendFacebookMessage(
        userId,
        `الأساليب المتاحة:\n${available.join("\n")}`
      );

      return true;
    }

    user.style = style;

    await sendFacebookMessage(
      userId,
      `✅ تم تغيير أسلوب الرد إلى: ${style}`
    );

    return true;
  }

  // تغيير الاسم
  if (text.startsWith("/name ")) {
    const name = text.slice(6).trim();

    if (!name || name.length > 60) {
      await sendFacebookMessage(userId, "الاسم غير صالح.");
      return true;
    }

    user.name = name;

    await sendFacebookMessage(
      userId,
      `تم تحديث اسمك إلى ${name}.`
    );

    return true;
  }

  // الإحصائيات
  if (text === "/stats") {
    await sendFacebookMessage(
      userId,
      `📊 إحصائياتك

عدد الرسائل: ${stats.messages}
عدد الصور: ${stats.images}
عدد الذكريات: ${userMemories.length}
أسلوب الرد: ${user.style}`
    );

    return true;
  }

  return false;
}

// معالجة الرسائل الأصلية
async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  if (!message) return;

  let imageUrl = null;

  if (message.attachments && message.attachments.length > 0) {
    const imgAttachment = message.attachments.find(
      att => att.type === "image"
    );

    if (imgAttachment) {
      imageUrl = imgAttachment.payload.url;
    }
  }

  const userText = (
    message.text ||
    (imageUrl ? "حلل هذه الصورة واشرح محتواها." : "")
  ).trim();

  if (!userText && !imageUrl) return;

  try {
    await sendFacebookAction(senderId, "typing_on");

    const user = getUser(senderId);
    const stats = getStats(senderId);

    // أمر مسح الذاكرة الأصلي
    if (
      userText.toLowerCase() === "/clear" ||
      userText === "مسح" ||
      userText === "تصفير"
    ) {
      histories.delete(senderId);

      await sendFacebookMessage(
        senderId,
        "تم مسح سياق المحادثة بنجاح. تفضل، كيف يمكنني مساعدتك؟"
      );

      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // أمر المساعدة المطور
    if (
      userText.toLowerCase() === "/help" ||
      userText === "مساعدة"
    ) {

      const helpMsg = `أهلاً بك، أنا ${BOT_NAME}، مساعدك الذكي.

يمكنني مساعدتك في:
• الإجابة عن الأسئلة.
• كتابة النصوص.
• تحليل الصور.
• شرح المواضيع.
• تذكر المعلومات التي تطلب مني حفظها.

الأوامر الأساسية:
/clear - مسح سياق المحادثة
/help - المساعدة

الأوامر المتقدمة:
/profile - ملفك الشخصي
/remember النص - حفظ معلومة
/memories - عرض الذكريات
/forget - حذف الذكريات
/style بسيط - تغيير أسلوب الرد
/name اسمك - تغيير اسمك
/stats - إحصائيات الاستخدام

أساليب الرد:
متوازن، مختصر، مفصل، رسمي، بسيط.`;

      await sendFacebookMessage(senderId, helpMsg);
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // أوامر الميزات الجديدة
    if (await handleAdvancedCommands(senderId, userText)) {
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // السؤال عن المطور
    if (isDevQuestion(userText) && !imageUrl) {
      await sendFacebookMessage(
        senderId,
        getRandomDevResponse()
      );

      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    let history = histories.get(senderId) || [];

    history.push({
      role: "user",
      content: userText
    });

    history = history.slice(-MAX_HISTORY);

    let imagePart = null;

    if (imageUrl) {
      imagePart = await urlToGenerativePart(imageUrl);
      stats.images++;
    }

    stats.messages++;
    user.messages++;

    const reply = await askGemini(
      history,
      imagePart,
      senderId
    );

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

// الصفحة الرئيسية
app.get("/", (req, res) => {
  res.send("Goku Bot Running Successfully");
});

// التحقق من Webhook
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

// استقبال أحداث Facebook
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

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`${BOT_NAME} running on port ${PORT}`);
});
