import express from "express";
import fetch from "node-fetch";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const GRAPH_URL =
  "https://graph.facebook.com/v23.0/me/messages";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-3.6-flash",
  systemInstruction: `
أنت مساعد ذكاء اصطناعي ذكي، هادئ، محترف، ومتزن اسمه "غوكو".
- قدم إجابات دقيقة وواضحة ومباشرة.
- أجب دائماً بنفس لغة ولهجة المستخدم.
- المطور هو محمد عادل ويزي (Wizzy).
- لا تذكر المطور إلا إذا سألك المستخدم صراحة.
- لديك القدرة على تحليل الصور المرفقة.
`
});

const BOT_NAME = "غوكو";
const DEVELOPER_NAME = "محمد عادل ويزي (Wizzy)";

const histories = new Map();
const users = new Map();
const memories = new Map();
const statistics = new Map();
const pendingActions = new Map();

const MAX_HISTORY = 10;
const MAX_MEMORIES = 50;

// =================================
// المستخدمون والذاكرة
// =================================

function getUser(id) {
  if (!users.has(id)) {
    users.set(id, {
      name: "مستخدم غوكو",
      style: "متوازن",
      createdAt: new Date().toISOString(),
      messages: 0
    });
  }

  return users.get(id);
}

function getMemories(id) {
  if (!memories.has(id)) {
    memories.set(id, []);
  }

  return memories.get(id);
}

function getStats(id) {
  if (!statistics.has(id)) {
    statistics.set(id, {
      messages: 0,
      images: 0,
      startedAt: new Date().toISOString()
    });
  }

  return statistics.get(id);
}

function remember(id, content) {
  const list = getMemories(id);

  if (list.length >= MAX_MEMORIES) {
    list.shift();
  }

  list.push({
    content,
    date: new Date().toLocaleDateString("ar")
  });
}

// =================================
// المطور
// =================================

const DEV_RESPONSES = [
  `أنا ${BOT_NAME}، تم تطويري بواسطة ${DEVELOPER_NAME}.`,
  `مطور النظام هو ${DEVELOPER_NAME}.`,
  `صانعي ومطوري هو ${DEVELOPER_NAME}.`
];

function isDevQuestion(text = "") {
  const t = text.toLowerCase().trim();

  return [
    "من صنعك",
    "من برمجك",
    "من هو مطورك",
    "من مطورك",
    "كيف تبرمجت",
    "كيف انصنعت",
    "من سواك",
    "مين برمجك",
    "مين سواك",
    "مين مطورك",
    "من صانعك",
    "who made you",
    "who is your developer",
    "who developed you"
  ].some(x => t.includes(x));
}

function getRandomDevResponse() {
  return DEV_RESPONSES[
    Math.floor(Math.random() * DEV_RESPONSES.length)
  ];
}

// =================================
// إرسال رسائل Facebook
// =================================

async function facebookRequest(body) {
  const response = await fetch(
    `${GRAPH_URL}?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(
      data.error?.message || "Facebook API Error"
    );
  }

  return data;
}

async function sendFacebookAction(id, action) {
  try {
    await facebookRequest({
      recipient: { id },
      sender_action: action
    });
  } catch (e) {
    console.error("Action Error:", e.message);
  }
}

async function sendFacebookMessage(id, text) {
  const MAX_LENGTH = 1900;

  for (let i = 0; i < text.length; i += MAX_LENGTH) {
    const chunk = text.substring(i, i + MAX_LENGTH);

    await facebookRequest({
      recipient: { id },
      message: { text: chunk }
    });
  }
}

// =================================
// نظام الأزرار
// =================================

async function sendButtons(id, text, buttons) {
  await facebookRequest({
    recipient: { id },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text,
          buttons: buttons.slice(0, 3).map(button => ({
            type: "postback",
            title: button.title,
            payload: button.payload
          }))
        }
      }
    }
  });
}

// القائمة الرئيسية
async function sendMainMenu(id) {
  await sendButtons(
    id,
    `أهلاً بك في ${BOT_NAME} 🤖

مساعدك الذكي جاهز لمساعدتك.
اختر الخدمة التي تريدها:`,
    [
      {
        title: "👤 ملفي الشخصي",
        payload: "PROFILE"
      },
      {
        title: "🧠 ذاكرتي",
        payload: "MEMORY_MENU"
      },
      {
        title: "⚙️ الإعدادات",
        payload: "SETTINGS"
      }
    ]
  );
}

// قائمة الذاكرة
async function sendMemoryMenu(id) {
  await sendButtons(
    id,
    "🧠 إدارة الذاكرة\n\nماذا تريد أن تفعل؟",
    [
      {
        title: "📚 عرض الذكريات",
        payload: "SHOW_MEMORIES"
      },
      {
        title: "💾 حفظ معلومة",
        payload: "SAVE_MEMORY"
      },
      {
        title: "🗑️ حذف الذكريات",
        payload: "DELETE_MEMORY"
      }
    ]
  );
}

// قائمة الإعدادات
async function sendSettings(id) {
  await sendButtons(
    id,
    "⚙️ إعدادات غوكو\n\nاختر أسلوب الرد المناسب لك:",
    [
      {
        title: "مختصر",
        payload: "STYLE_SHORT"
      },
      {
        title: "مفصل",
        payload: "STYLE_DETAILED"
      },
      {
        title: "بسيط",
        payload: "STYLE_SIMPLE"
      }
    ]
  );

  await sendButtons(
    id,
    "المزيد من إعدادات أسلوب الرد:",
    [
      {
        title: "رسمي",
        payload: "STYLE_FORMAL"
      },
      {
        title: "متوازن",
        payload: "STYLE_NORMAL"
      },
      {
        title: "القائمة الرئيسية",
        payload: "MAIN_MENU"
      }
    ]
  );
}

// =================================
// تنفيذ ضغطات الأزرار
// =================================

async function handlePostback(id, payload) {
  const user = getUser(id);
  const stats = getStats(id);

  switch (payload) {

    case "MAIN_MENU":
      await sendMainMenu(id);
      break;

    case "PROFILE":
      await sendFacebookMessage(
        id,
        `👤 ملفك الشخصي

الاسم: ${user.name}
أسلوب الرد: ${user.style}
عدد الرسائل: ${stats.messages}
تاريخ التسجيل: ${user.createdAt}`
      );
      await sendMainMenu(id);
      break;

    case "MEMORY_MENU":
      await sendMemoryMenu(id);
      break;

    case "SHOW_MEMORIES": {
      const list = getMemories(id);

      if (!list.length) {
        await sendFacebookMessage(
          id,
          "لا توجد معلومات محفوظة حتى الآن."
        );
      } else {
        const result = list
          .map((m, i) => `${i + 1}. ${m.content}`)
          .join("\n");

        await sendFacebookMessage(
          id,
          `🧠 ذكرياتك المحفوظة:\n\n${result}`
        );
      }

      await sendMemoryMenu(id);
      break;
    }

    case "SAVE_MEMORY":
      pendingActions.set(id, "SAVE_MEMORY");

      await sendFacebookMessage(
        id,
        "💾 أرسل الآن المعلومة التي تريد مني حفظها."
      );
      break;

    case "DELETE_MEMORY":
      await sendButtons(
        id,
        "⚠️ هل أنت متأكد من حذف جميع ذكرياتك؟",
        [
          {
            title: "نعم احذف",
            payload: "CONFIRM_DELETE"
          },
          {
            title: "إلغاء",
            payload: "CANCEL_DELETE"
          }
        ]
      );
      break;

    case "CONFIRM_DELETE":
      memories.set(id, []);

      await sendFacebookMessage(
        id,
        "✅ تم حذف جميع ذكرياتك."
      );
      await sendMainMenu(id);
      break;

    case "CANCEL_DELETE":
      await sendFacebookMessage(
        id,
        "تم إلغاء عملية الحذف."
      );
      await sendMainMenu(id);
      break;

    case "SETTINGS":
      await sendSettings(id);
      break;

    case "STYLE_SHORT":
      user.style = "مختصر";
      await sendFacebookMessage(id, "✅ تم اختيار الأسلوب المختصر.");
      await sendMainMenu(id);
      break;

    case "STYLE_DETAILED":
      user.style = "مفصل";
      await sendFacebookMessage(id, "✅ تم اختيار الأسلوب المفصل.");
      await sendMainMenu(id);
      break;

    case "STYLE_SIMPLE":
      user.style = "بسيط";
      await sendFacebookMessage(id, "✅ تم اختيار الأسلوب البسيط.");
      await sendMainMenu(id);
      break;

    case "STYLE_FORMAL":
      user.style = "رسمي";
      await sendFacebookMessage(id, "✅ تم اختيار الأسلوب الرسمي.");
      await sendMainMenu(id);
      break;

    case "STYLE_NORMAL":
      user.style = "متوازن";
      await sendFacebookMessage(id, "✅ تم اختيار الأسلوب المتوازن.");
      await sendMainMenu(id);
      break;

    case "STATS":
      await sendFacebookMessage(
        id,
        `📊 إحصائياتك

الرسائل: ${stats.messages}
الصور: ${stats.images}
الذكريات: ${getMemories(id).length}
أسلوب الرد: ${user.style}`
      );
      await sendMainMenu(id);
      break;

    case "HELP":
      await sendFacebookMessage(
        id,
        `مرحباً بك في ${BOT_NAME} 🤖

أرسل أي سؤال وسأساعدك.
يمكنك إرسال الصور لتحليلها.
استخدم القائمة لإدارة حسابك وذاكرتك.`
      );
      await sendMainMenu(id);
      break;

    default:
      await sendMainMenu(id);
  }
}

// =================================
// تحليل الصور
// =================================

async function urlToGenerativePart(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Image download failed");
  }

  const buffer = await response.buffer();

  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error("Image too large");
  }

  const mimeType =
    response.headers.get("content-type") || "image/jpeg";

  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType: mimeType.split(";")[0]
    }
  };
}

// =================================
// Gemini
// =================================

async function askGemini(messages, imagePart = null, userId = null) {
  const userMemories = userId
    ? getMemories(userId)
    : [];

  const user = userId
    ? getUser(userId)
    : null;

  const styles = {
    "مختصر": "أجب باختصار شديد.",
    "مفصل": "قدم شرحاً مفصلاً ومنظماً.",
    "بسيط": "اشرح بطريقة بسيطة وسهلة.",
    "رسمي": "استخدم لغة رسمية واحترافية.",
    "متوازن": "أجب بأسلوب متوازن وواضح."
  };

  const memoryText = userMemories.length
    ? userMemories.map(m => m.content).join("\n")
    : "لا توجد معلومات محفوظة.";

  const prompt = messages
    .map(m =>
      `${m.role === "user" ? "المستخدم" : "المساعد"}: ${m.content}`
    )
    .join("\n");

  const fullPrompt = `
أسلوب الرد:
${styles[user?.style] || styles["متوازن"]}

معلومات المستخدم المحفوظة:
${memoryText}

المحادثة:
${prompt}

المساعد:
`;

  const contents = imagePart
    ? [imagePart, fullPrompt]
    : fullPrompt;

  const result = await model.generateContent(contents);
  const response = await result.response;

  return response.text() ||
    "عذراً، لم أتمكن من معالجة الرد حالياً.";
}

// =================================
// الأوامر النصية الأصلية والجديدة
// =================================

async function handleCommands(id, text) {
  const user = getUser(id);
  const stats = getStats(id);

  if (text === "/menu" || text === "القائمة") {
    await sendMainMenu(id);
    return true;
  }

  if (text === "/profile") {
    await handlePostback(id, "PROFILE");
    return true;
  }

  if (text === "/memories") {
    await handlePostback(id, "SHOW_MEMORIES");
    return true;
  }

  if (text === "/forget") {
    await handlePostback(id, "DELETE_MEMORY");
    return true;
  }

  if (text === "/stats") {
    await handlePostback(id, "STATS");
    return true;
  }

  if (text.startsWith("/remember ")) {
    const content = text.slice(10).trim();

    if (!content) {
      await sendFacebookMessage(id, "اكتب المعلومة بعد الأمر.");
      return true;
    }

    remember(id, content);

    await sendFacebookMessage(id, "✅ تم حفظ المعلومة.");
    return true;
  }

  if (text.startsWith("/name ")) {
    const name = text.slice(6).trim();

    if (!name || name.length > 60) {
      await sendFacebookMessage(id, "الاسم غير صالح.");
      return true;
    }

    user.name = name;

    await sendFacebookMessage(
      id,
      `تم تحديث اسمك إلى ${name}.`
    );

    return true;
  }

  if (text.startsWith("/style ")) {
    const style = text.slice(7).trim();

    const available = [
      "مختصر",
      "مفصل",
      "بسيط",
      "رسمي",
      "متوازن"
    ];

    if (!available.includes(style)) {
      await sendFacebookMessage(
        id,
        `الأساليب المتاحة:\n${available.join("\n")}`
      );
      return true;
    }

    user.style = style;

    await sendFacebookMessage(
      id,
      `تم تغيير أسلوب الرد إلى ${style}.`
    );

    return true;
  }

  return false;
}

// =================================
// استقبال الرسائل
// =================================

async function handleMessage(event) {
  const senderId = event.sender.id;

  // التعامل مع ضغط الأزرار
  if (event.postback) {
    await handlePostback(
      senderId,
      event.postback.payload
    );
    return;
  }

  const message = event.message;

  if (!message) return;

  let imageUrl = null;

  if (message.attachments?.length) {
    const img = message.attachments.find(
      att => att.type === "image"
    );

    if (img) {
      imageUrl = img.payload.url;
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

    // حفظ معلومة بعد الضغط على زر الحفظ
    if (pendingActions.get(senderId) === "SAVE_MEMORY") {
      if (userText.startsWith("/")) {
        pendingActions.delete(senderId);
      } else {
        remember(senderId, userText);
        pendingActions.delete(senderId);

        await sendFacebookMessage(
          senderId,
          "✅ تم حفظ المعلومة بنجاح."
        );

        await sendFacebookAction(senderId, "typing_off");
        return;
      }
    }

    // مسح سياق المحادثة الأصلي
    if (
      userText.toLowerCase() === "/clear" ||
      userText === "مسح" ||
      userText === "تصفير"
    ) {
      histories.delete(senderId);

      await sendFacebookMessage(
        senderId,
        "تم مسح سياق المحادثة بنجاح."
      );

      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // المساعدة
    if (
      userText.toLowerCase() === "/help" ||
      userText === "مساعدة"
    ) {
      await sendFacebookMessage(
        senderId,
        `أهلاً بك، أنا ${BOT_NAME} 🤖

أرسل أي سؤال للبدء.

الأوامر:
/menu - القائمة الرئيسية
/profile - ملفك الشخصي
/remember النص - حفظ معلومة
/memories - عرض الذكريات
/forget - حذف الذكريات
/style بسيط - تغيير أسلوب الرد
/stats - الإحصائيات
/clear - مسح سياق المحادثة`
      );

      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // القائمة
    if (await handleCommands(senderId, userText)) {
      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    // سؤال المطور
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

    try {
      await sendFacebookMessage(
        senderId,
        "حدث خطأ مؤقت، يرجى المحاولة مرة أخرى لاحقاً."
      );

      await sendFacebookAction(senderId, "typing_off");
    } catch (sendError) {
      console.error("Send Error:", sendError);
    }
  }
}

// =================================
// Webhook
// =================================

app.get("/", (req, res) => {
  res.send("Goku Bot Running Successfully 🤖");
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

  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      if (event.message?.is_echo) continue;

      handleMessage(event).catch(err =>
        console.error("Webhook Handler:", err)
      );
    }
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`${BOT_NAME} running on port ${PORT}`);
});
