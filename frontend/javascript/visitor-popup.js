/*
  Visitor details popup for the Agua Instruments careers page.
  - Opens when the careers page is opened and cannot be closed or skipped.
  - The visitor must fill name, email, mobile and education first.
  - After that they can use the page (even after refresh) until that tab is closed.
    When the tab is closed and the page is opened again, the popup comes back.
  - Details go to the Node/Express backend, which adds a row (with date and time)
    to visitors.xlsx.
*/
(function () {
  // Live site:  https://aguainstruments.com/api/visitors
  // Local test: http://localhost:5000/api/visitors

  // var ENDPOINT = "https://aguainstruments.com/api/visitors";
  var ENDPOINT = "http://localhost:5000/api/visitors";


  // Remembered per TAB with sessionStorage: a refresh keeps the visitor inside,
  // but closing the tab (or opening a new one) shows the popup again.
  var SESSION_KEY = "agua_visitor_session";

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  }
  function writeSession(obj) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  function prefillApplicationForm(saved) {
    var name = document.getElementById("fullname");
    var phone = document.getElementById("phone");
    if (name && !name.value) name.value = saved.name || "";
    if (phone && !phone.value) phone.value = saved.phone || "";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var overlay = document.getElementById("visitor-popup");
    var form = document.getElementById("vp-form");
    if (!overlay || !form) return;

    var statusEl = document.getElementById("vp-status");
    var submitBtn = document.getElementById("vp-submit");

    function unlock() {
      overlay.hidden = true;
      overlay.style.setProperty("display", "none", "important"); // works even if CSS overrides [hidden]
      document.body.classList.remove("vp-lock");
      document.body.style.overflow = "";
    }

    // already filled in during this browser session: let them straight in
    var saved = readSession();
    if (saved) {
      prefillApplicationForm(saved);
      unlock();
      return;
    }

    // otherwise open straight away and lock the page behind it
    overlay.hidden = false;
    overlay.style.removeProperty("display");
    var first = document.getElementById("vp-name");
    if (first) first.focus();

    // no Escape, no click-outside. Keep keyboard focus inside the popup.
    document.addEventListener("keydown", function (e) {
      if (overlay.hidden) return;
      if (e.key === "Escape") { e.preventDefault(); return; }
      if (e.key === "Tab") {
        var items = overlay.querySelectorAll("input:not(.vp-trap), textarea, button");
        items = Array.prototype.filter.call(items, function (el) { return !el.disabled && el.offsetParent !== null; });
        if (!items.length) return;
        var firstEl = items[0], lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      statusEl.textContent = "";

      var data = {
        name: form.elements["name"].value.trim(),
        phone: form.elements["phone"].value.replace(/\D/g, ""),
        email: form.elements["email"].value.trim().toLowerCase(),
        education: form.elements["education"].value.trim(),
        hp_check: form.elements["hp_check"].value, // honeypot, must stay empty
        page: location.href
      };

      if (data.phone.length !== 10) {
        statusEl.textContent = "Please enter a 10-digit mobile number.";
        form.elements["phone"].focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";

      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
        })
        .then(function () {
          console.log("✅ Visitor saved. Excel sheet updated: aguainstruments-visitors.xlsx");
          var info = { name: data.name, phone: data.phone };
          writeSession(info);
          prefillApplicationForm(info);
          var thanks = document.getElementById("vp-thanks");
          form.hidden = true;
          form.style.display = "none";
          thanks.hidden = false;
          thanks.style.display = "block";
          setTimeout(unlock, 1200);
        })
        .catch(function () {
          console.error("❌ Visitor NOT saved. Excel sheet not updated.");
          statusEl.textContent = "Could not save right now. Please check your internet and try again.";
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit";
        });
    });
  });
})();