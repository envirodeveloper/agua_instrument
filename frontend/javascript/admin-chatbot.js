// Chatbot admin. All values are rendered with textContent (no innerHTML of server data).
(function () {
  "use strict";
  var API = "/api/admin";
  var TK = "agua_admin_token";
  var token = null;
  try { token = sessionStorage.getItem(TK); } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") el.textContent = attrs[k];
      else if (k === "cls") el.className = attrs[k];
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) el.setAttribute(k, "");
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) addChild(el, arguments[i]);
    return el;
  }
  // Appends strings, numbers, nodes and (nested) arrays of them; skips null/undefined/false.
  function addChild(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { addChild(el, x); }); return; }
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function fmtDate(d) { return d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""; }
  function note(el, ok, text) { clear(el).appendChild(h("div", { cls: "msg " + (ok ? "ok" : "err"), text: text })); }

  function api(path, opts) {
    opts = opts || {};
    var headers = { Authorization: "Bearer " + token };
    var body = opts.body;
    if (body && !(body instanceof FormData)) { headers["Content-Type"] = "application/json"; body = JSON.stringify(body); }
    return fetch(API + path, { method: opts.method || "GET", headers: headers, body: body }).then(function (r) {
      if (r.status === 401 && path !== "/login") { logout(); throw new Error("Session expired"); }
      return r.json().catch(function () { return { success: false, message: "Unexpected response" }; });
    });
  }
  function download(path) {
    return fetch(API + path, { headers: { Authorization: "Bearer " + token } }).then(function (r) {
      if (!r.ok) throw new Error("Download failed");
      var name = (/filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "") || [])[1] || "download.xlsx";
      return r.blob().then(function (b) {
        var a = h("a", { href: URL.createObjectURL(b), download: name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      });
    }).catch(function (e) { alert(e.message); });
  }

  // ---------------- login ----------------
  function logout() {
    token = null;
    try { sessionStorage.removeItem(TK); } catch (e) {}
    $("app").hidden = true; $("login").hidden = false; $("who").textContent = "";
  }
  $("login-form").addEventListener("submit", function (e) {
    e.preventDefault();
    fetch(API + "/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: $("login-key").value }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (!r.success) { $("login-err").textContent = r.message || "Login failed"; $("login-err").hidden = false; return; }
        token = r.token;
        try { sessionStorage.setItem(TK, token); } catch (e) {}
        $("login-key").value = "";
        start();
      })
      .catch(function () { $("login-err").textContent = "Network error"; $("login-err").hidden = false; });
  });
  function start() {
    $("login").hidden = true; $("app").hidden = false;
    $("who").textContent = "";
    $("who").appendChild(h("button", { cls: "btn ghost", type: "button", text: "Log out", onclick: logout }));
    show("overview");
  }

  // ---------------- tabs ----------------
  var loaders = {};
  function show(tab) {
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) { b.classList.toggle("on", b.dataset.tab === tab); });
    Array.prototype.forEach.call(document.querySelectorAll("main > section"), function (s) { s.hidden = s.id !== "tab-" + tab; });
    if (loaders[tab]) loaders[tab]();
  }
  $("tabs").addEventListener("click", function (e) { if (e.target.dataset.tab) show(e.target.dataset.tab); });

  // ---------------- dialog ----------------
  var dlg = $("dlg");
  function openDialog(title, bodyNodes, footNodes) {
    $("dlg-title").textContent = title;
    clear($("dlg-body")).appendChild(h("div", null, bodyNodes));
    clear($("dlg-foot")).appendChild(h("div", { style: "display:flex;gap:8px" }, footNodes || []));
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function closeDialog() { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }
  $("dlg-x").addEventListener("click", closeDialog);

  // ---------------- overview ----------------
  loaders.overview = function () {
    api("/summary").then(function (r) {
      if (!r.success) return;
      var g = clear($("stats"));
      var keyOk = r.ai.keys[r.ai.provider] && r.ai.keys[r.ai.provider].valid;
      [
        [r.products.active, "products visible to chatbot (" + r.products.hidden + " hidden)"],
        [r.knowledge.pages, "website pages indexed (" + r.knowledge.chunks + " passages)"],
        [r.leads.total, "leads (" + r.leads.quoteRequested + " asked for a quote)"],
        [r.today.messages, "AI answers today (" + r.today.blocked + " blocked by guardrails)"],
        [r.leads.flaggedChats, "flagged chats to review"],
        [r.ai.provider + (r.ai.enabled ? "" : " (off)"), (r.ai.model || "") + (keyOk ? ", key OK" : ", NO VALID KEY")],
      ].forEach(function (s, i) {
        var st = h("div", { cls: "stat" }, h("b", { text: String(s[0]) }), h("span", { text: s[1] }));
        if (i === 5 && !keyOk) st.style.borderColor = "#f3b4b4";
        g.appendChild(st);
      });
    });
    buildLink();
  };
  function buildLink() {
    var tag = $("campaign").value.trim().toLowerCase().replace(/[^\w\-.]+/g, "-").slice(0, 60);
    $("link-out").value = location.origin + "/enquiry" + (tag ? "?src=" + encodeURIComponent(tag) : "");
  }
  $("make-link").addEventListener("click", buildLink);
  $("campaign").addEventListener("input", buildLink);
  $("copy-link").addEventListener("click", function () {
    $("link-out").select();
    (navigator.clipboard ? navigator.clipboard.writeText($("link-out").value) : Promise.reject()).catch(function () { document.execCommand("copy"); });
  });

  // ---------------- inventory ----------------
  var inv = { page: 1, size: 50, total: 0, items: [], selected: {} };
  var invTimer = null;
  loaders.inventory = function () { loadInv(); };
  function loadInv() {
    var q = encodeURIComponent($("inv-q").value.trim());
    api("/products?q=" + q + "&status=" + $("inv-status").value + "&page=" + inv.page + "&size=" + inv.size).then(function (r) {
      if (!r.success) return;
      inv.items = r.items; inv.total = r.total;
      var body = clear($("inv-body"));
      r.items.forEach(function (p) {
        var cb = h("input", { type: "checkbox", "aria-label": "Select " + p.partNo, onchange: function () { if (this.checked) inv.selected[p._id] = 1; else delete inv.selected[p._id]; bulkUi(); } });
        cb.checked = !!inv.selected[p._id];
        body.appendChild(h("tr", null,
          h("td", null, cb),
          h("td", null, h("strong", { text: p.partNo })),
          h("td", { text: p.name }),
          h("td", { cls: "desc", text: p.description ? (p.description.length > 220 ? p.description.slice(0, 220) + "…" : p.description) : "" }, p.description ? null : h("span", { cls: "pill warn", text: "no description" })),
          h("td", null, h("span", { cls: "pill " + (p.active ? "ok" : ""), text: p.active ? "visible" : "hidden" })),
          h("td", { style: "white-space:nowrap" },
            h("button", { cls: "btn ghost", type: "button", text: "Edit", onclick: function () { editProduct(p); } }), " ",
            h("button", { cls: "btn ghost", type: "button", text: p.active ? "Hide" : "Show", onclick: function () { toggleProduct(p); } }))
        ));
      });
      var pages = Math.max(1, Math.ceil(r.total / inv.size));
      $("inv-count").textContent = r.total + " item(s)";
      $("inv-page").textContent = "Page " + inv.page + " of " + pages;
      $("inv-prev").disabled = inv.page <= 1; $("inv-next").disabled = inv.page >= pages;
      $("inv-all").checked = false;
      bulkUi();
    });
  }
  function bulkUi() {
    var n = Object.keys(inv.selected).length;
    $("bulk-row").hidden = !n;
    $("bulk-count").textContent = n + " selected";
  }
  $("inv-q").addEventListener("input", function () { clearTimeout(invTimer); invTimer = setTimeout(function () { inv.page = 1; loadInv(); }, 300); });
  $("inv-status").addEventListener("change", function () { inv.page = 1; loadInv(); });
  $("inv-prev").addEventListener("click", function () { inv.page--; loadInv(); });
  $("inv-next").addEventListener("click", function () { inv.page++; loadInv(); });
  $("inv-all").addEventListener("change", function () {
    var on = this.checked;
    inv.items.forEach(function (p) { if (on) inv.selected[p._id] = 1; else delete inv.selected[p._id]; });
    loadInv();
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-bulk]"), function (b) {
    b.addEventListener("click", function () {
      var action = b.dataset.bulk, ids = Object.keys(inv.selected);
      if (action === "delete" && !confirm("Permanently delete " + ids.length + " item(s)? This cannot be undone. (Use Hide to keep them.)")) return;
      api("/products/bulk", { method: "POST", body: { ids: ids, action: action } }).then(function (r) {
        if (!r.success) return alert(r.message);
        inv.selected = {}; loadInv();
      });
    });
  });

  function toggleProduct(p) {
    var body = { partNo: p.partNo, name: p.name, description: p.description, extra: p.extra, active: !p.active };
    api("/products/" + p._id, { method: "PUT", body: body }).then(function (r) { if (!r.success) alert(r.message); loadInv(); });
  }

  function editProduct(p) {
    var isNew = !p;
    p = p || { partNo: "", name: "", description: "", extra: {}, active: true };
    var fPart = h("input", { type: "text", maxlength: "80", value: p.partNo });
    var fName = h("input", { type: "text", maxlength: "300", value: p.name });
    var fDesc = h("textarea", { rows: "7", maxlength: "5000" }); fDesc.value = p.description || "";
    var fActive = h("input", { type: "checkbox" }); fActive.checked = p.active !== false;
    var extraRows = h("div");
    function addExtra(k, v) {
      var row = h("div", { cls: "row" }, h("input", { type: "text", placeholder: "Column name", value: k || "", style: "flex:1" }), h("input", { type: "text", placeholder: "Value", value: v || "", style: "flex:2" }));
      row.appendChild(h("button", { cls: "btn danger", type: "button", text: "×", onclick: function () { row.remove(); } }));
      extraRows.appendChild(row);
    }
    var ex = p.extra || {};
    Object.keys(ex).forEach(function (k) { addExtra(k, ex[k]); });
    var err = h("div");
    openDialog(isNew ? "Add item" : "Edit " + p.partNo, [
      h("label", { text: "Part No. *" }), fPart,
      h("label", { text: "Item name *" }), fName,
      h("label", { text: "Description (the chatbot uses this to answer)" }), fDesc,
      h("label", { text: "Extra details (optional columns)" }), extraRows,
      h("button", { cls: "btn ghost", type: "button", text: "+ Add detail", onclick: function () { addExtra(); } }),
      h("label", null, fActive, " Visible to chatbot"),
      err,
    ], [
      !isNew && h("button", { cls: "btn danger", type: "button", text: "Delete permanently", onclick: function () {
        if (!confirm("Delete " + p.partNo + " permanently?")) return;
        api("/products/" + p._id + "?permanent=1", { method: "DELETE" }).then(function () { closeDialog(); loadInv(); });
      } }),
      h("button", { cls: "btn", type: "button", text: "Save", onclick: function () {
        var extra = {};
        Array.prototype.forEach.call(extraRows.querySelectorAll(".row"), function (r) {
          var ins = r.querySelectorAll("input");
          if (ins[0].value.trim() && ins[1].value.trim()) extra[ins[0].value.trim()] = ins[1].value.trim();
        });
        var body = { partNo: fPart.value, name: fName.value, description: fDesc.value, extra: extra, active: fActive.checked };
        api(isNew ? "/products" : "/products/" + p._id, { method: isNew ? "POST" : "PUT", body: body }).then(function (r) {
          if (!r.success) return note(err, false, r.message);
          closeDialog(); loadInv();
        });
      } }),
    ]);
  }
  $("inv-add").addEventListener("click", function () { editProduct(null); });
  $("inv-export").addEventListener("click", function () { download("/products/export"); });
  $("inv-export-active").addEventListener("click", function () { download("/products/export?status=active"); });
  $("inv-template").addEventListener("click", function () { download("/products/template"); });

  // Import: upload -> preview -> commit
  $("inv-import-btn").addEventListener("click", function () { $("inv-file").value = ""; $("inv-file").click(); });
  $("inv-file").addEventListener("change", function () {
    var f = this.files[0];
    if (!f) return;
    var panel = $("import-panel");
    panel.hidden = false;
    clear(panel).appendChild(h("p", { cls: "muted", text: "Reading " + f.name + "…" }));
    var fd = new FormData();
    fd.append("file", f);
    api("/products/import/preview", { method: "POST", body: fd }).then(function (r) {
      clear(panel);
      if (!r.success) return note(panel, false, r.message);
      var list = function (title, items, fmt) {
        return [h("strong", { text: title + " (" + items.length + ")" }), items.length ? h("div", { cls: "diff-list" }, items.slice(0, 300).map(function (x) { return h("div", { text: fmt(x) }); })) : h("div", { cls: "muted", text: "None" })];
      };
      panel.appendChild(h("h3", { text: "Import preview: " + r.file + " (sheet \"" + r.sheet + "\")" }));
      panel.appendChild(h("p", { cls: "muted", text: r.totalRows + " valid rows · " + r.unchanged + " unchanged" + (r.extraColumns.length ? " · extra columns kept: " + r.extraColumns.join(", ") : "") }));
      panel.appendChild(h("div", null,
        list("New items", r.added, function (x) { return x.partNo + " — " + x.name; }),
        list("Changed items", r.updated, function (x) { return x.partNo + " — " + x.name + "  [" + (x.changes || []).join(", ") + "]"; }),
        list("In the system but NOT in this file", r.missing, function (x) { return x.partNo + " — " + x.name; }),
        r.errors.length ? list("Rows skipped (fix in Excel)", r.errors, function (x) { return "Row " + x.rowNo + ": " + x.message + (x.partNo ? " (" + x.partNo + ")" : ""); }) : null
      ));
      var out = h("div");
      var commit = function (mode) {
        if (mode === "replace" && r.missing.length && !confirm(r.missing.length + " item(s) not in the file will be HIDDEN from the chatbot. Continue?")) return;
        api("/products/import/commit", { method: "POST", body: { importId: r.importId, mode: mode } }).then(function (c) {
          if (!c.success) return note(out, false, c.message);
          note(out, true, "Imported: " + c.upserted + " added, " + c.modified + " updated" + (mode === "replace" ? ", " + c.hidden + " hidden" : "") + ". The chatbot uses the new data immediately.");
          loadInv();
        });
      };
      panel.appendChild(h("div", { cls: "row" },
        h("button", { cls: "btn", type: "button", text: "Merge (add + update)", onclick: function () { commit("merge"); } }),
        h("button", { cls: "btn ghost", type: "button", text: "Replace (also hide items missing from file)", onclick: function () { commit("replace"); } }),
        h("button", { cls: "btn ghost", type: "button", text: "Cancel", onclick: function () { panel.hidden = true; } })
      ));
      panel.appendChild(out);
    });
  });

  // ---------------- knowledge ----------------
  loaders.knowledge = function () {
    api("/knowledge").then(function (r) {
      if (!r.success) return;
      var body = clear($("kn-body"));
      if (!r.pages.length) body.appendChild(h("tr", null, h("td", { colspan: "6", cls: "muted", text: "Nothing indexed yet. Click \"Re-index website pages\"." })));
      r.pages.forEach(function (p) {
        var cb = h("input", { type: "checkbox", "aria-label": "Use " + p.url, onchange: function () { api("/knowledge/" + p._id, { method: "PUT", body: { active: this.checked } }); } });
        cb.checked = p.active;
        body.appendChild(h("tr", null, h("td", null, cb), h("td", null, h("a", { href: p.url, target: "_blank", rel: "noopener", text: p.url })), h("td", { text: p.title }), h("td", { text: String(p.chunkCount) }), h("td", { text: String(p.wordCount) }), h("td", { cls: "muted", text: fmtDate(p.indexedAt) })));
      });
    });
  };
  $("kn-reindex").addEventListener("click", function () {
    var b = this; b.disabled = true; b.textContent = "Indexing…";
    api("/knowledge/reindex", { method: "POST" }).then(function (r) {
      b.disabled = false; b.textContent = "Re-index website pages";
      if (!r.success) return note($("kn-msg"), false, r.message || "Failed");
      note($("kn-msg"), true, "Indexed " + r.pages + " pages (" + r.chunks + " passages). " + (r.removed ? r.removed + " removed. " : "") + (r.skipped.length ? r.skipped.length + " skipped." : ""));
      loaders.knowledge();
    });
  });

  // ---------------- leads ----------------
  var ld = { page: 1, size: 50 };
  var ldTimer = null;
  function leadQuery() {
    var p = new URLSearchParams();
    if ($("ld-q").value.trim()) p.set("q", $("ld-q").value.trim());
    if ($("ld-campaign").value) p.set("campaign", $("ld-campaign").value);
    if ($("ld-status").value) p.set("status", $("ld-status").value);
    if ($("ld-from").value) p.set("from", $("ld-from").value);
    if ($("ld-to").value) p.set("to", $("ld-to").value);
    if ($("ld-flagged").checked) p.set("flagged", "1");
    return p;
  }
  loaders.leads = function () {
    api("/leads/campaigns").then(function (r) {
      if (!r.success) return;
      var sel = $("ld-campaign"), cur = sel.value;
      clear(sel).appendChild(h("option", { value: "", text: "All campaigns" }));
      r.campaigns.forEach(function (c) { sel.appendChild(h("option", { value: c.campaign, text: c.campaign + " (" + c.leads + ")" })); });
      sel.value = cur;
    });
    loadLeads();
  };
  function loadLeads() {
    var p = leadQuery(); p.set("page", ld.page); p.set("size", ld.size);
    api("/leads?" + p.toString()).then(function (r) {
      if (!r.success) return;
      var body = clear($("ld-body"));
      if (!r.items.length) body.appendChild(h("tr", null, h("td", { colspan: "9", cls: "muted", text: "No leads match." })));
      r.items.forEach(function (l) {
        var cls = l.status === "quote-requested" ? "warn" : l.status === "engaged" ? "ok" : "";
        body.appendChild(h("tr", null,
          h("td", { cls: "muted", text: fmtDate(l.createdAt) }),
          h("td", null, h("strong", { text: l.name }), l.flagged ? h("span", { cls: "pill err", text: "flagged", style: "margin-left:6px" }) : null),
          h("td", { text: l.email }), h("td", { text: l.phone }), h("td", { text: l.company || "" }), h("td", { text: l.campaign || "" }),
          h("td", { text: String(l.turns) }),
          h("td", null, h("span", { cls: "pill " + cls, text: l.status })),
          h("td", null, h("button", { cls: "btn ghost", type: "button", text: "Open", onclick: function () { openLead(l._id); } }))
        ));
      });
      var pages = Math.max(1, Math.ceil(r.total / ld.size));
      $("ld-page").textContent = r.total + " lead(s) · page " + ld.page + " of " + pages;
      $("ld-prev").disabled = ld.page <= 1; $("ld-next").disabled = ld.page >= pages;
    });
  }
  ["ld-campaign", "ld-status", "ld-from", "ld-to", "ld-flagged"].forEach(function (id) { $(id).addEventListener("change", function () { ld.page = 1; loadLeads(); }); });
  $("ld-q").addEventListener("input", function () { clearTimeout(ldTimer); ldTimer = setTimeout(function () { ld.page = 1; loadLeads(); }, 300); });
  $("ld-prev").addEventListener("click", function () { ld.page--; loadLeads(); });
  $("ld-next").addEventListener("click", function () { ld.page++; loadLeads(); });
  $("ld-export").addEventListener("click", function () { download("/leads/export?" + leadQuery().toString()); });

  function openLead(id) {
    api("/leads/" + id).then(function (r) {
      if (!r.success) return alert(r.message);
      var l = r.lead;
      var status = h("select", null, ["new", "engaged", "quote-requested", "contacted", "closed"].map(function (s) { return h("option", { value: s, text: s }); }));
      status.value = l.status;
      var notes = h("textarea", { rows: "3", maxlength: "2000" }); notes.value = l.notes || "";
      var saved = h("span");
      var convos = r.conversations.map(function (c) {
        return h("div", { style: "margin:16px 0" },
          h("div", { cls: "muted", text: "Chat started " + fmtDate(c.createdAt) + " · " + c.userTurns + " question(s)" + (c.flagged ? " · flags: " + c.flags.join(", ") : "") }),
          h("div", { cls: "chatlog", style: "margin-top:8px" }, c.messages.map(function (m) {
            var cls = m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : "note";
            var meta = [fmtDate(m.ts)];
            if (m.guardrail) meta.push("guardrail: " + m.guardrail);
            if (m.provider) meta.push(m.provider + "/" + m.model);
            if (m.toolCalls && m.toolCalls.length) meta.push("lookups: " + m.toolCalls.map(function (t) { return t.name.replace(/_/g, " ") + " " + t.input + " → " + t.resultCount; }).join("; "));
            // AI replies are formatted the same way the customer saw them; everything else stays plain text.
            var content;
            if (m.role === "assistant" && window.AguaChatFormat) {
              content = h("div", { cls: "fmt" });
              window.AguaChatFormat.render(content, m.content);
            } else {
              content = h("div", { cls: "plain", text: m.content });
            }
            return h("div", { cls: "bubble " + cls }, content, h("small", { cls: "meta", text: meta.join(" · ") }));
          }))
        );
      });
      openDialog(l.name + " · " + (l.company || l.email), [
        h("p", null, h("strong", { text: "Email: " }), l.email, "  ", h("strong", { text: "Phone: " }), l.phone),
        h("p", { cls: "muted", text: "Campaign: " + (l.campaign || "-") + " · visits: " + l.visits + " · first seen " + fmtDate(l.createdAt) }),
        h("label", { text: "Status" }), status,
        h("label", { text: "Internal notes" }), notes,
        convos.length ? convos : h("p", { cls: "muted", text: "No chats." }),
      ], [saved, h("button", { cls: "btn", type: "button", text: "Save", onclick: function () {
        api("/leads/" + l._id, { method: "PUT", body: { status: status.value, notes: notes.value } }).then(function (x) {
          saved.textContent = x.success ? "Saved ✓ " : "Failed ";
          loadLeads();
        });
      } })]);
    });
  }

  // ---------------- AI settings ----------------
  var PROVIDERS = { claude: "Claude", openai: "OpenAI", gemini: "Gemini" };
  loaders.ai = function () {
    api("/ai-config").then(function (r) {
      if (!r.success) return;
      var c = r.config;
      $("ai-provider").value = c.activeProvider;
      $("test-provider").value = c.activeProvider;
      Object.keys(PROVIDERS).forEach(function (p) { $("ai-model-" + p).value = c.models[p] || ""; });
      $("ai-turns").value = c.maxTurnsPerConversation;
      $("ai-lead-day").value = c.maxMessagesPerLeadPerDay;
      $("ai-day-cap").value = c.dailyMessageCap;
      $("ai-tokens").value = c.maxOutputTokens;
      $("ai-effort").value = c.reasoningEffort || "low";
      $("ai-greeting").value = c.greeting;
      $("ai-enabled").checked = c.enabled !== false;
      renderKeys(r.keys);
      var ub = clear($("usage-body"));
      if (!r.usage.length) ub.appendChild(h("tr", null, h("td", { colspan: "5", cls: "muted", text: "No usage yet." })));
      r.usage.forEach(function (u) { ub.appendChild(h("tr", null, h("td", { text: u._id }), h("td", { text: String(u.messages || 0) }), h("td", { text: String(u.blocked || 0) }), h("td", { text: String(u.tokensIn || 0) }), h("td", { text: String(u.tokensOut || 0) }))); });
    });
  };
  function renderKeys(keys) {
    var box = clear($("keys"));
    Object.keys(PROVIDERS).forEach(function (p) {
      var k = keys[p] || {};
      var pill = k.valid ? h("span", { cls: "pill ok", text: "configured ✓" }) : k.configured ? h("span", { cls: "pill err", text: "stored but cannot be decrypted" }) : h("span", { cls: "pill", text: "not set" });
      var inp = h("input", { type: "password", placeholder: "Paste agua-enc:v1:" + p + ":… here", autocomplete: "off", spellcheck: "false", style: "width:100%" });
      box.appendChild(h("div", { cls: "keyrow" },
        h("div", null, h("strong", { text: PROVIDERS[p] }), h("div", null, pill), k.updatedAt ? h("div", { cls: "muted", text: fmtDate(k.updatedAt) }) : null),
        inp,
        h("button", { cls: "btn ghost", type: "button", text: "Save key", onclick: function () {
          var v = inp.value.trim();
          if (!v) return;
          api("/ai-keys/" + p, { method: "PUT", body: { encryptedKey: v } }).then(function (r) {
            inp.value = "";
            if (!r.success) return note($("key-msg"), false, PROVIDERS[p] + ": " + r.message);
            note($("key-msg"), true, PROVIDERS[p] + " key verified and saved.");
            loaders.ai();
          });
        } })
      ));
    });
  }
  $("ai-save").addEventListener("click", function () {
    var models = {};
    Object.keys(PROVIDERS).forEach(function (p) { models[p] = $("ai-model-" + p).value.trim(); });
    api("/ai-config", { method: "PUT", body: {
      activeProvider: $("ai-provider").value, models: models,
      maxTurnsPerConversation: $("ai-turns").value, maxMessagesPerLeadPerDay: $("ai-lead-day").value,
      dailyMessageCap: $("ai-day-cap").value, maxOutputTokens: $("ai-tokens").value, reasoningEffort: $("ai-effort").value,
      greeting: $("ai-greeting").value, enabled: $("ai-enabled").checked,
    } }).then(function (r) {
      $("ai-save-msg").textContent = r.success ? "Saved ✓" : (r.message || "Failed");
      setTimeout(function () { $("ai-save-msg").textContent = ""; }, 3000);
    });
  });
  $("ai-test").addEventListener("click", function () {
    var b = this, out = $("test-out");
    b.disabled = true;
    clear(out).appendChild(h("p", { cls: "muted", text: "Asking " + PROVIDERS[$("test-provider").value] + "…" }));
    api("/ai-config/test", { method: "POST", body: { provider: $("test-provider").value, model: $("ai-model-" + $("test-provider").value).value.trim() } }).then(function (r) {
      b.disabled = false;
      if (!r.success) return note(out, false, r.message);
      clear(out).appendChild(h("div", { cls: "msg ok" }, h("div", { text: r.reply }), h("small", { cls: "muted", text: r.provider + "/" + r.model + " · reasoning " + (r.reasoningEffort || "low") + " · " + r.ms + " ms · " + r.toolCalls + " lookup(s) · tokens " + r.usage.in + " in / " + r.usage.out + " out" })));
    }).catch(function () { b.disabled = false; });
  });

  if (token) start();
})();
