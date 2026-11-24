// Enquiry page: lead form -> AI product chat, or -> email enquiry to sales.
// Bot text is rendered with DOM nodes only (never innerHTML), and links are allowed only to aguainstruments.com.
(function () {
  "use strict";

  var API = "/api"; // same origin: the Node app serves this page and the API
  var TOKEN_KEY = "agua_enq_token";
  var CHIPS = [
    "Which analyzer suits an ETP / STP outlet?",
    "Do you have pH and ORP sensors?",
    "Tell me about the Bettair air quality node",
    "What flow cells and NRV valves do you supply?",
  ];
  var THINKING = ["Searching the product catalogue", "Checking product pages", "Preparing your answer"];
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var $ = function (id) { return document.getElementById(id); };
  var form = $("enq-form"), formErr = $("enq-form-error");
  var chatBtn = $("enq-chat-btn"), emailBtn = $("enq-email-btn");
  var req = $("enq-req"), reqCount = $("enq-req-count");
  var sent = $("enq-sent"), chat = $("enq-chat"), log = $("enq-log"), chips = $("enq-chips");
  var input = $("enq-input"), msg = $("enq-msg"), sendBtn = $("enq-send"), quoteBtn = $("enq-quote");
  var token = null, busy = false, limited = false, lastMode = "chat";
  var session = 0; // bumped on "End chat" so late replies from the old chat are ignored
  var endBtn = $("enq-end");

  function store(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }

  function params() {
    var out = {}, q = new URLSearchParams(location.search);
    ["src", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(function (k) {
      var v = q.get(k);
      if (v) out[k] = v.slice(0, 80);
    });
    return out;
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(API + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) { data._status = r.status; return data; });
      });
  }

  function sparkSvg(cls) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    if (cls) svg.setAttribute("class", cls);
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#ai-spark");
    svg.appendChild(use);
    return svg;
  }

  // ---------- safe rendering (shared with the admin transcript: chat-format.js) ----------
  function renderBot(el, text) { window.AguaChatFormat.render(el, text); }

  function scrollDown() { log.scrollTop = log.scrollHeight; }

  // Typewriter for AI replies: types the plain text, then swaps in the formatted version.
  function typeInto(el, text, done) {
    var plain = String(text || "").replace(/\*\*/g, "");
    if (reduceMotion || plain.length < 2) { renderBot(el, text); scrollDown(); if (done) done(); return; }
    var i = 0, step = Math.max(2, Math.ceil(plain.length / 70));
    el.classList.add("enq-caret");
    el.style.whiteSpace = "pre-wrap";
    (function tick() {
      i = Math.min(plain.length, i + step);
      el.textContent = plain.slice(0, i);
      scrollDown();
      if (i < plain.length) return requestAnimationFrame(tick);
      el.classList.remove("enq-caret");
      el.style.whiteSpace = "";
      renderBot(el, text);
      scrollDown();
      if (done) done();
    })();
  }

  function addMessage(role, text, animate, done) {
    var row = document.createElement("div");
    var el = document.createElement("div");
    if (role === "sys") {
      el.className = "enq-msg enq-sys";
      el.textContent = text;
      log.appendChild(el);
      scrollDown();
      return el;
    }
    row.className = "enq-row " + (role === "user" ? "enq-r-user" : "enq-r-bot");
    el.className = "enq-msg " + (role === "user" ? "enq-user" : "enq-bot");
    if (role !== "user") {
      var av = document.createElement("span");
      av.className = "enq-mini";
      av.appendChild(sparkSvg());
      row.appendChild(av);
    }
    row.appendChild(el);
    log.appendChild(row);
    if (role === "user") { el.textContent = text; scrollDown(); if (done) done(); }
    else if (animate) typeInto(el, text, done);
    else { renderBot(el, text); scrollDown(); if (done) done(); }
    return el;
  }

  var thinkTimer = null;
  function typing(on) {
    var t = $("enq-typing");
    clearInterval(thinkTimer);
    if (on && !t) {
      t = document.createElement("div");
      t.id = "enq-typing";
      t.className = "enq-row enq-r-bot";
      var av = document.createElement("span");
      av.className = "enq-mini";
      av.appendChild(sparkSvg());
      var bubble = document.createElement("div");
      bubble.className = "enq-msg enq-bot enq-typing";
      for (var i = 0; i < 3; i++) bubble.appendChild(document.createElement("i"));
      var label = document.createElement("span");
      var n = 0;
      label.textContent = THINKING[0] + "…";
      bubble.appendChild(label);
      t.appendChild(av);
      t.appendChild(bubble);
      log.appendChild(t);
      scrollDown();
      thinkTimer = setInterval(function () { n = Math.min(n + 1, THINKING.length - 1); label.textContent = THINKING[n] + "…"; }, 1800);
    } else if (!on && t) t.remove();
  }

  function setBusy(b) {
    busy = b;
    sendBtn.disabled = b;
    msg.disabled = b;
    if (!b) msg.focus();
  }

  function showChips() {
    chips.textContent = "";
    CHIPS.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "enq-chip";
      b.appendChild(sparkSvg());
      b.appendChild(document.createTextNode(c));
      b.addEventListener("click", function () { send(c); });
      chips.appendChild(b);
    });
  }

  function openChat() {
    form.hidden = true;
    sent.hidden = true;
    chat.hidden = false;
    msg.focus();
  }

  function sessionExpired() {
    store(TOKEN_KEY, null);
    token = null;
    addMessage("sys", "Your chat session has ended.");
    var again = document.createElement("button");
    again.type = "button";
    again.className = "enq-chip enq-restart";
    again.textContent = "Start a new enquiry";
    again.addEventListener("click", function () { resetToForm(false); });
    log.appendChild(again);
    scrollDown();
    sendBtn.disabled = true;
    msg.disabled = true;
    quoteBtn.disabled = true;
  }

  // ---------- end chat / new enquiry ----------
  // Closes the current chat on the server (its token stops working) and shows a fresh form.
  // Contact details stay filled in for convenience; the requirement box is cleared.
  function resetToForm(notifyServer) {
    if (notifyServer && token) api("/chat/end", { method: "POST" }).catch(function () {});
    session++;
    store(TOKEN_KEY, null);
    token = null;
    busy = false;
    limited = false;
    typing(false);
    log.textContent = "";
    chips.textContent = "";
    msg.value = "";
    msg.disabled = false;
    msg.placeholder = "Ask about a product or part number…";
    autosize();
    sendBtn.disabled = false;
    quoteBtn.disabled = false;
    quoteBtn.textContent = "Request a quote / call back";
    endConfirmReset();
    req.value = "";
    reqCount.textContent = "0 / 2000";
    fieldError(null, "");
    chat.hidden = true;
    sent.hidden = true;
    form.hidden = false;
    var card = $("enq-card");
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    $("enq-req").focus();
  }

  var endTimer = null;
  function endConfirmReset() {
    clearTimeout(endTimer);
    endBtn.classList.remove("enq-confirm");
    endBtn.querySelector("span").textContent = "End chat";
  }
  endBtn.addEventListener("click", function () {
    if (!endBtn.classList.contains("enq-confirm")) {
      // First click asks for confirmation, so a stray tap doesn't lose the conversation.
      endBtn.classList.add("enq-confirm");
      endBtn.querySelector("span").textContent = "End chat? Tap again";
      endTimer = setTimeout(endConfirmReset, 4000);
      return;
    }
    resetToForm(true);
  });

  // ---------- form ----------
  function fieldError(field, message) {
    ["enq-name", "enq-email", "enq-phone", "enq-req", "enq-consent"].forEach(function (id) { $(id).removeAttribute("aria-invalid"); });
    if (field) {
      var el = $("enq-" + (field === "requirement" ? "req" : field));
      if (el) { el.setAttribute("aria-invalid", "true"); el.focus(); }
    }
    formErr.textContent = message || "";
    formErr.hidden = !message;
  }

  req.addEventListener("input", function () { reqCount.textContent = req.value.length + " / 2000"; });

  // Remember which button submitted (fallback for browsers without SubmitEvent.submitter).
  chatBtn.addEventListener("click", function () { lastMode = "chat"; });
  emailBtn.addEventListener("click", function () { lastMode = "email"; });

  function setFormBusy(b, mode) {
    chatBtn.disabled = b;
    emailBtn.disabled = b;
    var btn = mode === "email" ? emailBtn : chatBtn;
    btn.querySelector("span").textContent = b ? (mode === "email" ? "Sending…" : "Starting AI chat…") : (mode === "email" ? "Send enquiry by email" : "Chat with AI assistant");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var mode = (e.submitter && e.submitter.value) || lastMode;
    var data = {
      mode: mode,
      name: $("enq-name").value.trim(),
      email: $("enq-email").value.trim(),
      phone: $("enq-phone").value.trim(),
      company: $("enq-company").value.trim(),
      requirement: req.value.trim(),
      consent: $("enq-consent").checked,
      hp_check: $("enq-hp").value,
    };
    var p = params();
    for (var k in p) data[k] = p[k];

    if (data.name.length < 2) return fieldError("name", "Please enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return fieldError("email", "Please enter a valid email address.");
    if (data.phone.replace(/\D/g, "").length < 7) return fieldError("phone", "Please enter a valid phone number.");
    if (mode === "email" && data.requirement.length < 5) return fieldError("requirement", "Please describe your requirement so our team can reply by email.");
    if (!data.consent) return fieldError("consent", "Please tick the box so we can store your details and follow up.");
    fieldError(null, "");

    setFormBusy(true, mode);
    api("/enquiry", { method: "POST", body: data })
      .then(function (r) {
        if (!r.success) {
          fieldError(r.field || null, r.message || "Something went wrong. Please try again.");
          return;
        }
        if (!r.token) { // spam-trap path
          form.textContent = "Thank you! Our team will contact you shortly.";
          return;
        }
        token = r.token;
        store(TOKEN_KEY, token);
        if (r.mode === "email") return showSent(r.name, data.requirement);
        openChat();
        addMessage("assistant", r.greeting, true, function () {
          // If they typed a requirement, ask it straight away.
          if (data.requirement && data.requirement.length <= 500) send(data.requirement);
          else {
            showChips();
            if (data.requirement) { msg.value = data.requirement.slice(0, 500); autosize(); }
          }
        });
      })
      .catch(function () { fieldError(null, "Network error. Please check your connection and try again."); })
      .then(function () { setFormBusy(false, mode); });
  });

  function showSent(name, requirement) {
    form.hidden = true;
    chat.hidden = true;
    sent.hidden = false;
    $("enq-sent-text").textContent = "Thank you, " + name + "! Our sales team has received your enquiry and will reply by email or phone shortly.";
    $("enq-sent-req").textContent = requirement;
  }

  $("enq-sent-new").addEventListener("click", function () { resetToForm(true); });

  $("enq-sent-chat").addEventListener("click", function () {
    openChat();
    restoreHistory(false);
  });

  // ---------- chat ----------
  function send(text) {
    text = String(text || "").trim();
    if (!text || busy || !token || limited) return;
    if (text.length > 500) { addMessage("sys", "Please keep your question under 500 characters."); return; }
    chips.textContent = "";
    addMessage("user", text);
    msg.value = "";
    autosize();
    setBusy(true);
    typing(true);
    var mine = session;
    api("/chat", { method: "POST", body: { message: text } })
      .then(function (r) {
        if (mine !== session) return; // chat was ended while waiting
        typing(false);
        if (r._status === 401) return sessionExpired();
        if (!r.success) { addMessage("sys", r.message || "Something went wrong. Please try again."); return; }
        if (r.limitReached) limited = true;
        addMessage("assistant", r.reply, true);
      })
      .catch(function () { if (mine === session) { typing(false); addMessage("sys", "Network error. Please try again."); } })
      .then(function () {
        if (mine !== session) return;
        if (limited) { busy = false; sendBtn.disabled = true; msg.disabled = true; msg.placeholder = "Chat limit reached"; }
        else if (token) setBusy(false);
        else busy = false;
      });
  }

  input.addEventListener("submit", function (e) { e.preventDefault(); send(msg.value); });
  msg.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(msg.value); }
  });
  function autosize() { msg.style.height = "auto"; msg.style.height = Math.min(msg.scrollHeight, 120) + "px"; }
  msg.addEventListener("input", autosize);

  quoteBtn.addEventListener("click", function () {
    if (!token || quoteBtn.disabled) return;
    quoteBtn.disabled = true;
    api("/chat/quote", { method: "POST", body: {} })
      .then(function (r) {
        if (r._status === 401) return sessionExpired();
        if (!r.success) { quoteBtn.disabled = false; addMessage("sys", r.message || "Please try again."); return; }
        addMessage("assistant", r.reply, true);
        quoteBtn.textContent = "Quote requested ✓";
      })
      .catch(function () { quoteBtn.disabled = false; addMessage("sys", "Network error. Please try again."); });
  });

  // ---------- restore after refresh / open chat after email ----------
  function restoreHistory(fromRefresh) {
    return api("/chat/history").then(function (r) {
      if (!r.success) {
        store(TOKEN_KEY, null);
        token = null;
        if (!fromRefresh) sessionExpired();
        return;
      }
      openChat();
      r.messages.forEach(function (m) { addMessage(m.role, m.content, false); });
      if (!r.messages.some(function (m) { return m.role === "user"; }) || !fromRefresh) showChips();
      if (r.quoteRequested) { quoteBtn.disabled = true; quoteBtn.textContent = "Quote requested ✓"; }
    }).catch(function () {});
  }

  token = load(TOKEN_KEY);
  if (token) restoreHistory(true);
})();
