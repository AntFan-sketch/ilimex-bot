(function () {
  const CONFIG = window.ILIMEX_BOT_CONFIG || {};
  const API_URL = CONFIG.apiUrl;

  if (!API_URL) {
    console.error("ILIMEX_BOT_CONFIG.apiUrl is not set");
    return;
  }

  const launcher = document.createElement("button");
  launcher.innerText = "Chat with Ilimex";
  launcher.style.position = "fixed";
  launcher.style.bottom = "20px";
  launcher.style.right = "20px";
  launcher.style.zIndex = "999999";
  launcher.style.borderRadius = "999px";
  launcher.style.padding = "10px 16px";
  launcher.style.border = "none";
  launcher.style.cursor = "pointer";
  launcher.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
  launcher.style.background = "#004d71";
  launcher.style.color = "#ffffff";
  launcher.style.fontSize = "14px";

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.bottom = "80px";
  container.style.right = "20px";
  container.style.width = "360px";
  container.style.height = "480px";
  container.style.maxWidth = "95vw";
  container.style.maxHeight = "70vh";
  container.style.background = "#ffffff";
  container.style.borderRadius = "12px";
  container.style.boxShadow = "0 8px 24px rgba(0,0,0,0.2)";
  container.style.display = "none";
  container.style.flexDirection = "column";
  container.style.overflow = "hidden";
  container.style.zIndex = "999999";

  const header = document.createElement("div");
  header.style.padding = "10px 12px";
  header.style.background = "#004d71";
  header.style.color = "#ffffff";
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.innerHTML = `
    <div style="font-weight: 600; font-size: 14px;">IlimexBot</div>
    <div style="font-size: 12px; opacity: 0.9;">Biosecurity assistant</div>
  `;

  const messagesWrap = document.createElement("div");
  messagesWrap.style.flex = "1";
  messagesWrap.style.padding = "10px";
  messagesWrap.style.overflowY = "auto";
  messagesWrap.style.fontSize = "14px";
  messagesWrap.style.background = "#f5f5f5";

  const inputWrap = document.createElement("div");
  inputWrap.style.display = "flex";
  inputWrap.style.padding = "8px";
  inputWrap.style.borderTop = "1px solid #ddd";
  inputWrap.style.background = "#ffffff";

  const input = document.createElement("textarea");
  input.placeholder = "Ask Ilimex about systems, trials or your site...";
  input.style.flex = "1";
  input.style.border = "1px solid " + "#ccc";
  input.style.borderRadius = "8px";
  input.style.padding = "6px 8px";
  input.style.fontSize = "14px";
  input.style.resize = "none";
  input.rows = 1;

  const sendBtn = document.createElement("button");
  sendBtn.innerText = "Send";
  sendBtn.style.marginLeft = "8px";
  sendBtn.style.border = "none";
  sendBtn.style.borderRadius = "8px";
  sendBtn.style.padding = "6px 12px";
  sendBtn.style.cursor = "pointer";
  sendBtn.style.background = "#004d71";
  sendBtn.style.color = "#fff";
  sendBtn.style.fontSize = "14px";

  inputWrap.appendChild(input);
  inputWrap.appendChild(sendBtn);

  container.appendChild(header);
  container.appendChild(messagesWrap);
  container.appendChild(inputWrap);

  document.body.appendChild(launcher);
  document.body.appendChild(container);

  const conversation = [];

  function addMessage(role, text) {
    const bubble = document.createElement("div");
    bubble.style.margin = "4px 0";
    bubble.style.maxWidth = "85%";
    bubble.style.padding = "6px 8px";
    bubble.style.borderRadius = "8px";
    bubble.style.whiteSpace = "pre-wrap";

    if (role === "user") {
      bubble.style.marginLeft = "auto";
      bubble.style.background = "#004d71";
      bubble.style.color = "#fff";
    } else {
      bubble.style.marginRight = "auto";
      bubble.style.background = "#ffffff";
      bubble.style.border = "1px solid #ddd";
      bubble.style.color = "#222";
    }

    bubble.textContent = text;
    messagesWrap.appendChild(bubble);
    messagesWrap.scrollTop = messagesWrap.scrollHeight;
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    addMessage("user", text);
    conversation.push({ role: "user", content: text });

    addMessage("assistant", "Thinking…");
    const loadingBubble = messagesWrap.lastChild;

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation }),
      });

      if (!res.ok) {
        throw new Error("Network error");
      }

      const data = await res.json();
      const reply =
        (data.reply && data.reply.content) ||
        "Sorry, I couldn’t get a response just now.";
      conversation.push({ role: "assistant", content: reply });

      loadingBubble.textContent = reply;
      messagesWrap.scrollTop = messagesWrap.scrollHeight;
    } catch (e) {
      console.error(e);
      loadingBubble.textContent =
        "Sorry, there was a problem talking to IlimexBot.";
    }
  }

  launcher.addEventListener("click", () => {
    container.style.display = container.style.display === "none" ? "flex" : "none";
  });

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  addMessage(
    "assistant",
    "Hi, I’m IlimexBot. I can help explain Ilimex systems, trials and recommend indicative configurations for your poultry, mushroom or other units. How can I help today?"
  );
})();
