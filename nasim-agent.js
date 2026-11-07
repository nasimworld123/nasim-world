/* NASIM WORLD — AI সহকারী (চ্যাট উইজেট)
   index.html-এর শেষে </body>-এর আগে যোগ করুন:
   <script src="nasim-agent.js"></script>
*/
(function () {
  // ====== সেটিংস (শুধু এই অংশ বদলাবেন) ======
  const WORKER_URL = "https://little-rice-5f93.habibur4321aq.workers.dev"; // Cloudflare Worker-এর লিংক
  const AGENT_NAME = "NASIM WORLD সহকারী";
  const WHATSAPP_NUMBER = "8801340902365";
  const MAX_HISTORY = 16; // সর্বোচ্চ কয়টা মেসেজ পাঠানো হবে
  // ==========================================

  const CAT_FALLBACK = { group1: "আম", group2: "আচার", group3: "আমসত্ত্ব", group4: "অন্যান্য" };
  let catalogText = "";
  let catalogReady = false;
  let history = [];
  let busy = false;

  const bn2en = (s) => String(s == null ? "" : s).replace(/[০-৯]/g, (d) => "০১২৩৪৫৬৭৮৯".indexOf(d));

  // ---------- ক্যাটালগ লোড (Firestore থেকে, সাইটের নিজের db ব্যবহার করে) ----------
  async function loadCatalog() {
    try {
      if (typeof db === "undefined") throw new Error("db নেই");
      let labels = Object.assign({}, CAT_FALLBACK);
      let inside = "", outside = "";
      try {
        const s = await db.collection("settings").doc("site").get();
        if (s.exists) {
          const d = s.data();
          if (d.categoryLabels) labels = Object.assign(labels, d.categoryLabels);
          inside = d.deliveryInside; outside = d.deliveryOutside;
        }
      } catch (e) {}
      const snap = await db.collection("products").get();
      const lines = [];
      snap.docs.forEach((doc) => {
        const p = doc.data();
        if (!p.name) return;
        let stock = "স্টকে আছে";
        if (p.stock !== undefined && p.stock !== null && p.stock !== "") {
          const n = parseInt(bn2en(p.stock), 10);
          stock = isNaN(n) ? "স্টকে আছে" : n > 0 ? "স্টকে আছে (" + n + ")" : "স্টক নেই";
        }
        const parts = [
          "পণ্য: " + p.name,
          "ক্যাটাগরি: " + (labels[p.category] || p.category || ""),
          "দাম: ৳" + p.price + (p.sellByWeight ? " (প্রতি কেজি)" : ""),
        ];
        if (p.oldPrice) parts.push("আগের দাম: ৳" + p.oldPrice);
        if (p.discountPercent) parts.push("ছাড়: " + p.discountPercent + "%");
        if (p.sellByWeight) {
          if (p.minWeight) parts.push("সর্বনিম্ন: " + p.minWeight + " কেজি");
          if (p.weightOptions && p.weightOptions.length) parts.push("ওজন অপশন: " + p.weightOptions.join(", ") + " কেজি");
        }
        if (p.freeDelivery) parts.push("ফ্রি ডেলিভারি");
        parts.push(stock);
        lines.push("- " + parts.join(" | "));
      });
      catalogText = lines.join("\n");
      catalogText += "\n\nডেলিভারি চার্জ: ঢাকা/শহরের ভেতরে (inside) ৳" + (inside || "অজানা") + ", বাইরে (outside) ৳" + (outside || "অজানা") + "। এলাকাভেদে ভিন্ন হয়, অর্ডার ফর্মে এলাকা বেছে নিলে সঠিক চার্জ দেখা যায়।";
      catalogReady = true;
    } catch (e) {
      console.warn("ক্যাটালগ লোড হয়নি", e);
      catalogText = "";
      catalogReady = false;
    }
  }

  // ---------- UI ----------
  const css = `
  #nwAgentBtn{position:fixed;bottom:164px;right:18px;width:58px;height:58px;border-radius:50%;background:#0F4C4C;color:#C6D93B;border:none;z-index:1000;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,.28);font-size:26px}
  #nwAgentBtn:active{transform:scale(.95)}
  #nwAgentPanel{position:fixed;inset:0;z-index:1200;display:none;flex-direction:column;background:#fff;font-family:'Segoe UI',Arial,sans-serif}
  #nwAgentPanel.open{display:flex}
  @media(min-width:640px){#nwAgentPanel{inset:auto 18px 18px auto;width:380px;height:560px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.3);overflow:hidden}}
  .nwa-head{background:#0F4C4C;color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;font-weight:700}
  .nwa-head small{display:block;font-weight:400;opacity:.8;font-size:.72rem;margin-top:2px}
  .nwa-close{background:none;border:none;color:#fff;font-size:26px;cursor:pointer;line-height:1}
  .nwa-body{flex:1;overflow-y:auto;padding:14px;background:#F4F7FB;display:flex;flex-direction:column;gap:10px}
  .nwa-msg{max-width:85%;padding:10px 13px;border-radius:14px;font-size:.92rem;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}
  .nwa-bot{background:#fff;color:#1e2a38;align-self:flex-start;border:1px solid rgba(15,76,76,.12);border-bottom-left-radius:4px}
  .nwa-user{background:#0F4C4C;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}
  .nwa-chips{display:flex;flex-wrap:wrap;gap:6px}
  .nwa-chip{background:#fff;border:1px solid #0F4C4C;color:#0F4C4C;border-radius:16px;padding:6px 12px;font-size:.8rem;cursor:pointer}
  .nwa-order{align-self:flex-start;background:#25D366;color:#fff;border:none;border-radius:12px;padding:11px 16px;font-weight:700;cursor:pointer;font-size:.9rem}
  .nwa-foot{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(15,76,76,.15);background:#fff;padding-bottom:calc(10px + env(safe-area-inset-bottom))}
  .nwa-foot input{flex:1;border:1px solid rgba(15,76,76,.3);border-radius:22px;padding:10px 14px;font-size:16px;outline:none}
  .nwa-foot button{background:#0F4C4C;color:#fff;border:none;border-radius:22px;padding:0 18px;font-weight:700;cursor:pointer}
  .nwa-foot button:disabled{opacity:.5}
  .nwa-dots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#0F4C4C;animation:nwaB 1s infinite}
  .nwa-dots span:nth-child(2){animation-delay:.15s}.nwa-dots span:nth-child(3){animation-delay:.3s}
  @keyframes nwaB{0%,80%,100%{opacity:.25}40%{opacity:1}}`;

  function build() {
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);

    const btn = document.createElement("button");
    btn.id = "nwAgentBtn";
    btn.setAttribute("aria-label", "চ্যাট সহকারী");
    btn.textContent = "💬";
    document.body.appendChild(btn);

    const panel = document.createElement("div");
    panel.id = "nwAgentPanel";
    panel.innerHTML =
      '<div class="nwa-head"><div>' + AGENT_NAME + "<small>দাম, পণ্য ও অর্ডার নিয়ে জিজ্ঞাসা করুন</small></div>" +
      '<button class="nwa-close" aria-label="বন্ধ">×</button></div>' +
      '<div class="nwa-body" id="nwaBody"></div>' +
      '<div class="nwa-foot"><input id="nwaInput" type="text" placeholder="আপনার প্রশ্ন লিখুন..." autocomplete="off">' +
      '<button id="nwaSend">পাঠান</button></div>';
    document.body.appendChild(panel);

    const body = panel.querySelector("#nwaBody");
    const input = panel.querySelector("#nwaInput");
    const send = panel.querySelector("#nwaSend");

    function addMsg(text, who) {
      const d = document.createElement("div");
      d.className = "nwa-msg " + (who === "user" ? "nwa-user" : "nwa-bot");
      d.textContent = text;
      body.appendChild(d);
      body.scrollTop = body.scrollHeight;
      return d;
    }

    function addOrderButton(order) {
      const b = document.createElement("button");
      b.className = "nwa-order";
      b.textContent = "✅ WhatsApp-এ অর্ডার নিশ্চিত করুন";
      b.onclick = () => {
        const items = (order.items || []).map((i) => "• " + i).join("\n");
        const msg =
          "নতুন অর্ডার (NASIM WORLD সহকারী থেকে)\n\n" + items +
          "\n\nনাম: " + (order.name || "") +
          "\nমোবাইল: " + (order.phone || "") +
          "\nঠিকানা: " + (order.address || "") +
          "\nএলাকা: " + (order.area === "outside" ? "বাইরে" : "ভেতরে") +
          "\nপেমেন্ট: " + (order.payment || "ক্যাশ অন ডেলিভারি") +
          (order.note ? "\nনোট: " + order.note : "");
        window.open("https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg), "_blank");
      };
      body.appendChild(b);
      body.scrollTop = body.scrollHeight;
    }

    function greet() {
      addMsg("আসসালামু আলাইকুম! আমি NASIM WORLD-এর সহকারী। আম, আচার ও আমসত্ত্বের দাম, ওজন বা অর্ডার নিয়ে কী জানতে চান?", "bot");
      const chips = document.createElement("div");
      chips.className = "nwa-chips";
      ["আমের দাম কত?", "আচার আছে?", "ডেলিভারি চার্জ কত?", "অর্ডার করতে চাই"].forEach((t) => {
        const c = document.createElement("button");
        c.className = "nwa-chip";
        c.textContent = t;
        c.onclick = () => { chips.remove(); ask(t); };
        chips.appendChild(c);
      });
      body.appendChild(chips);
    }

    async function ask(text) {
      text = (text || "").trim();
      if (!text || busy) return;
      busy = true; send.disabled = true; input.value = "";
      addMsg(text, "user");
      history.push({ role: "user", content: text });
      const typing = document.createElement("div");
      typing.className = "nwa-msg nwa-bot nwa-dots";
      typing.innerHTML = "<span></span><span></span><span></span>";
      body.appendChild(typing);
      body.scrollTop = body.scrollHeight;

      try {
        if (!catalogReady) await loadCatalog();
        const res = await fetch(WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history.slice(-MAX_HISTORY), catalog: catalogText }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        let reply = (data.reply || "").trim();
        let order = null;
        const m = reply.match(/<ORDER>([\s\S]*?)<\/ORDER>/);
        if (m) {
          try { order = JSON.parse(m[1]); } catch (e) {}
          reply = reply.replace(/<ORDER>[\s\S]*?<\/ORDER>/, "").trim();
        }
        typing.remove();
        history.push({ role: "assistant", content: reply || "ঠিক আছে।" });
        if (reply) addMsg(reply, "bot");
        if (order) addOrderButton(order);
      } catch (e) {
        typing.remove();
        history.pop();
        addMsg("দুঃখিত, এখন উত্তর দিতে পারছি না। অনুগ্রহ করে WhatsApp-এ যোগাযোগ করুন: 01340902365", "bot");
      }
      busy = false; send.disabled = false; input.focus();
    }

    let greeted = false;
    btn.onclick = () => {
      panel.classList.add("open");
      btn.style.display = "none";
      if (!greeted) { greeted = true; greet(); }
      if (!catalogReady) loadCatalog();
      setTimeout(() => input.focus(), 100);
    };
    panel.querySelector(".nwa-close").onclick = () => {
      panel.classList.remove("open");
      btn.style.display = "flex";
    };
    send.onclick = () => ask(input.value);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") ask(input.value); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
