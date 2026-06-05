import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const COHERE_API_KEY = process.env.COHERE_API_KEY;

const histories = new Map();

async function askCohere(messages) {
  const response = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "command-a-03-2025",
      temperature: 0.3,
      messages: messages.map(m => ({
        role: m.role,
        content: [{ type: "text", text: m.content }]
      }))
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();

  return data?.message?.content?.[0]?.text || "عذراً، لم أستطع الرد.";
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
        recipient: {
          id: userId
        },
        message: {
          text
        }
      })
    }
  );
}

app.get("/", (req, res) => {
  res.send("Facebook Messenger Bot Running");
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    if (body.object !== "page") {
      return res.sendStatus(404);
    }

    for (const entry of body.entry) {
      for (const event of entry.messaging) {
        if (!event.message?.text) continue;

        const senderId = event.sender.id;
        const userMessage = event.message.text;

        let history = histories.get(senderId) || [];

        history.push({
          role: "user",
          content: userMessage
        });

        history = history.slice(-20);

        const reply = await askCohere(history);

        history.push({
          role: "assistant",
          content: reply
        });

        histories.set(senderId, history);

        await sendFacebookMessage(senderId, reply);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
