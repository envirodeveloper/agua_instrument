// Safe formatter for AI chat replies, shared by the enquiry page and the admin transcript viewer.
// Supports **bold**, "- " / "1. " bullet lists, paragraphs and links to aguainstruments.com only.
// Builds DOM nodes with textContent; model output is never inserted as HTML.
(function () {
  "use strict";

  function isSafeLink(u) {
    try {
      var url = new URL(u);
      return url.protocol === "https:" && /(^|\.)aguainstruments\.com$/i.test(url.hostname);
    } catch (e) {
      return false;
    }
  }

  function appendInline(parent, text) {
    var re = /\*\*([^*]+)\*\*|(https?:\/\/[^\s<>()"']+)/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1]) {
        var b = document.createElement("strong");
        b.textContent = m[1];
        parent.appendChild(b);
      } else {
        var url = m[2].replace(/[.,;:!?]+$/, "");
        var trail = m[2].slice(url.length);
        if (isSafeLink(url)) {
          var a = document.createElement("a");
          a.href = url;
          a.textContent = url.replace(/^https:\/\/(www\.)?aguainstruments\.com/i, "aguainstruments.com");
          a.target = "_blank";
          a.rel = "noopener";
          parent.appendChild(a);
        } else {
          parent.appendChild(document.createTextNode(url));
        }
        if (trail) parent.appendChild(document.createTextNode(trail));
      }
      last = re.lastIndex;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  // Replaces el's content with the formatted reply. Indented "  - " lines become nested lists.
  function render(el, text) {
    while (el.firstChild) el.removeChild(el.firstChild);
    var lines = String(text || "").replace(/\r/g, "").split("\n");
    var list = null, sub = null;
    lines.forEach(function (line) {
      var t = line.trim();
      var bullet = /^([-*•]|\d+[.)])\s+/.exec(t);
      if (bullet) {
        var indented = /^\s{2,}/.test(line) && list;
        var li = document.createElement("li");
        appendInline(li, t.slice(bullet[0].length));
        if (indented) {
          var parentLi = list.lastElementChild;
          if (!sub || sub.parentNode !== parentLi) { sub = document.createElement("ul"); parentLi.appendChild(sub); }
          sub.appendChild(li);
        } else {
          if (!list) { list = document.createElement(/^\d/.test(bullet[1]) ? "ol" : "ul"); el.appendChild(list); }
          sub = null;
          list.appendChild(li);
        }
        return;
      }
      list = null;
      sub = null;
      if (!t) return;
      var p = document.createElement("p");
      appendInline(p, t.replace(/^#{1,6}\s+/, ""));
      el.appendChild(p);
    });
  }

  window.AguaChatFormat = { render: render, appendInline: appendInline, isSafeLink: isSafeLink };
})();
