import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const COHERE_API_KEY = process.env.COHERE_API_KEY;

const BOT_NAME = "غوكو";
const DEVELOPER_NAME = "محمد عادل ويزي (Wizzy)";

const histories = new Map();

function isDevQuestion(text = "") {
  const t = text.toLowerCase();

  return (
    t.includes("من صنعك") ||
    t.includes("من برمجك") ||
    t.includes("من هو مطورك") ||
    t.includes("من مطورك") ||
    t.includes("who made you") ||
    t.includes("developer") ||
    t.includes("creator")
  );
}

async function askCohere(messages) {
  const response = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "command-a-03-2025",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: "أنت مساعد ذكي اسمه غوكو. أجب بنفس لغة المستخدم وبشكل مختصر ومفيد."
        },
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      ]
    })
  });

  const data = await response.json();

  return (
    data?.message?.content?.[0]?.text ||
    "عذراً، لم أتمكن من الرد."
  );
}

async function sendFacebookAction(userId, action) {
  await fetch(
    `https://graph.facebook.com/v23.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
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
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        recipient: { id: userId },
        message: { text }
      })
    }
  );
}

async function handleMessage(event) {
  const senderId = event.sender.id;
  const message = event.message;

  if (!message?.text) return;

  try {
    await sendFacebookAction(senderId, "typing_on");

    if (isDevQuestion(message.text)) {
      await sendFacebookMessage(
        senderId,
        `أنا ${BOT_NAME}، مطوري هو ${DEVELOPER_NAME}`
      );

      await sendFacebookAction(senderId, "typing_off");
      return;
    }

    let history = histories.get(senderId) || [];

    history.push({
      role: "user",
      content: message.text
    });

    history = history.slice(-10);

    const reply = await askCohere(history);

    history.push({
      role: "assistant",
      content: reply
    });

    histories.set(senderId, history);

    await sendFacebookMessage(senderId, reply);
    await sendFacebookAction(senderId, "typing_off");

  } catch (err) {
    console.error(err);

    await sendFacebookMessage(
      senderId,
      "حدث خطأ مؤقت، حاول مرة أخرى."
    );

    await sendFacebookAction(senderId, "typing_off");
  }
}

app.get("/", (req, res) => {
  res.send("Goku Bot Running");
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
