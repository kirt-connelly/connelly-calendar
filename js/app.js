// ============================================================
//  CONNELLY FAMILY CALENDAR v3.00 — powered by FullCalendar
// ============================================================
(function () {
  "use strict";

  const ADD_EVENT_URL = 'http://recipes.connellyfamily.org/calendar-auth/add-event.php';
  const API_KEY = 'AIzaSyANgqTgULK9wuIqU2IggqbothFP3Yz-UZc';

  let calendar = null;
  const disabledCals = new Set();
  const today = new Date();

  // ── Password ───────────────────────────────────────────────
  async function sha256(msg) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
  }

  async function checkPassword() {
    const hash = await sha256(document.getElementById("pw-input").value.trim());
    if (hash === CONFIG.passwordHash) {
      sessionStorage.setItem("calAuth", hash);
      showCalendar();
    } else {
      document.getElementById("pw-error").style.display = "block";
      document.getElementById("pw-input").value = "";
      document.getElementById("pw-input").focus();
    }
  }

  function isAuthenticated() {
    return sessionStorage.getItem("calAuth") === CONFIG.passwordHash;
  }

  // ── Timezone ───────────────────────────────────────────────
  function getMtnTzLabel() {
    const now = new Date(), y = now.getFullYear();
    const start = new Date(y, 2, 1); while (start.getDay()!==0) start.setDate(start.getDate()+1); start.setDate(start.getDate()+7);
    const end   = new Date(y,10, 1); while (end.getDay()!==0)   end.setDate(end.getDate()+1);
    return (now >= start && now < end) ? 'MDT' : 'MST';
  }

  // ── Fetch events from Google Calendar ─────────────────────
  async function fetchGoogleEvents(calConfig, start, end) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calConfig.id)}/events`
      + `?key=${API_KEY}`
      + `&timeMin=${start.toISOString()}&timeMax=${end.toISOString()}`
      + `&singleEvents=true&orderBy=startTime&maxResults=500&showDeleted=false`;
    try {
      const data = await (await fetch(url)).json();
      return (data.items || [])
        .filter(ev => {
          if (ev.status === "cancelled") return false;
          if (ev.attendees) {
            const me = ev.attendees.find(a => a.self);
            if (me && me.responseStatus === "declined") return false;
          }
          return true;
        })
        .map(ev => {
          const allDay = !!ev.start.date && !ev.start.dateTime;
          return {
            id: ev.id,
            title: ev.summary || "(private)",
            start: allDay ? ev.start.date : ev.start.dateTime,
            end:   allDay ? ev.end.date   : ev.end.dateTime,
            allDay,
            backgroundColor: calConfig.bgColor,
            borderColor:     calConfig.color,
            textColor:       calConfig.textColor,
            extendedProps:   { calId: calConfig.id }
          };
        });
    } catch(e) { console.warn("Failed:", calConfig.name, e); return []; }
  }

  // ── Event detail popup ─────────────────────────────────────
  let activePopup = null;
  function showPopup(title, detail, anchorEl) {
    if (activePopup) { activePopup.remove(); activePopup = null; }
    const popup = document.createElement("div");
    popup.className = "event-popup";
    popup.innerHTML = `
      <div class="event-popup-title">${title}</div>
      <div class="event-popup-detail">${detail}</div>
    `;
    document.body.appendChild(popup);
    activePopup = popup;

    const rect = anchorEl.getBoundingClientRect();
    const scrollY = window.scrollY;
    popup.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
    popup.style.top  = `${rect.bottom + scrollY + 4}px`;

    setTimeout(() => { document.addEventListener("click", () => { popup.remove(); activePopup = null; }, { once: true }); }, 0);
  }

  // ── Initialize FullCalendar ────────────────────────────────
  function initCalendar() {
    const el = document.getElementById("calendar");

    calendar = new FullCalendar.Calendar(el, {
      initialView: 'dayGridMonth',
      headerToolbar: {
        left:   'prev,today,next',
        center: '',
        right:  'title'
      },
      eventTimeFormat: {
        hour: 'numeric',
        minute: '2-digit',
        meridiem: 'short'
      },
      height: 'auto',
      firstDay: 0,
      eventDisplay: 'block',
      dayMaxEvents: 5,

      // Custom event colors already set per-event
      eventDidMount: function(info) {
        // Grey out past events
        const endDate = new Date(info.event.end || info.event.start);
        const tod = new Date(); tod.setHours(0,0,0,0);
        if (endDate < tod) {
          info.el.style.opacity = '0.45';
        }
      },

      // Click event for details
      eventClick: function(info) {
        info.jsEvent.preventDefault();
        const ev = info.event;
        const start = ev.start ? ev.start.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'}) : '';
        const end   = ev.end   ? ev.end.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'}) : '';
        const time  = ev.allDay ? 'All day' : ev.start.toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'});
        let detail  = start;
        if (end && end !== start) detail += ` – ${end}`;
        if (!ev.allDay) detail += ` · ${time}`;
        showPopup(ev.title, detail, info.el);
      },
      events: async function(fetchInfo, successCallback, failureCallback) {
        try {
          const activeCals = CONFIG.calendars.filter(c => !disabledCals.has(c.id));
          const results = await Promise.all(
            activeCals.map(cal => fetchGoogleEvents(cal, fetchInfo.start, fetchInfo.end))
          );
          successCallback(results.flat());
        } catch(e) {
          failureCallback(e);
        }
      }
    });

    calendar.render();
  }

  // ── Legend with toggles ────────────────────────────────────
  function buildLegend() {
    const legend = document.getElementById("legend");
    legend.innerHTML = "";
    CONFIG.calendars.forEach(cal => {
      const item = document.createElement("div");
      item.className = "legend-item";
      item.innerHTML = `<span class="legend-dot" style="background:${cal.color}"></span>${cal.name}`;
      item.addEventListener("click", () => {
        if (disabledCals.has(cal.id)) {
          disabledCals.delete(cal.id);
          item.style.opacity = "1";
        } else {
          disabledCals.add(cal.id);
          item.style.opacity = "0.35";
        }
        calendar.refetchEvents();
      });
      legend.appendChild(item);
    });
  }

  // ── Show calendar ──────────────────────────────────────────
  function showCalendar() {
    document.getElementById("lock-screen").style.display = "none";
    document.getElementById("cal-wrapper").style.display = "block";
    buildLegend();
    if (!calendar) initCalendar();
    else calendar.refetchEvents();
  }

  // ── Modal ──────────────────────────────────────────────────
  function openModal() {
    const ts = today.toISOString().split("T")[0];
    document.getElementById("ev-title").value = "";
    document.getElementById("ev-start-date").value = ts;
    document.getElementById("ev-end-date").value = ts;
    document.getElementById("ev-allday").checked = true;
    document.getElementById("time-fields").style.display = "none";
    document.getElementById("form-error").style.display = "none";
    document.getElementById("form-success").style.display = "none";
    document.getElementById("modal-save").disabled = false;
    document.getElementById("modal-save").textContent = "Save Event";
    const tz = getMtnTzLabel();
    document.getElementById("tz-label").textContent = tz;
    document.getElementById("tz-label2").textContent = tz;
    document.getElementById("modal-overlay").style.display = "flex";
    document.getElementById("ev-title").focus();
  }

  function closeModal() { document.getElementById("modal-overlay").style.display = "none"; }

  async function saveEvent() {
    const title = document.getElementById("ev-title").value.trim();
    const startDate = document.getElementById("ev-start-date").value;
    const endDate = document.getElementById("ev-end-date").value;
    const allDay = document.getElementById("ev-allday").checked;
    const startTime = document.getElementById("ev-start-time").value;
    const endTime = document.getElementById("ev-end-time").value;
    const err = document.getElementById("form-error");
    err.style.display = "none";
    if (!title) { err.textContent="Please enter a title."; err.style.display="block"; return; }
    if (!startDate||!endDate) { err.textContent="Please select dates."; err.style.display="block"; return; }
    if (endDate<startDate) { err.textContent="End can't be before start."; err.style.display="block"; return; }
    const btn = document.getElementById("modal-save");
    btn.disabled=true; btn.textContent="Saving…";
    try {
      const r = await fetch(ADD_EVENT_URL, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,startDate,endDate,allDay,startTime,endTime})});
      const d = await r.json();
      if (d.success) { document.getElementById("form-success").style.display="block"; btn.textContent="Saved!"; setTimeout(()=>{closeModal();calendar.refetchEvents();},1500); }
      else { err.textContent=d.error||"Failed."; err.style.display="block"; btn.disabled=false; btn.textContent="Save Event"; }
    } catch(e) { err.textContent="Network error."; err.style.display="block"; btn.disabled=false; btn.textContent="Save Event"; }
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    // Clear any stale v2.x session tokens
    if (sessionStorage.getItem("calAuth") && !calendar) {
      sessionStorage.removeItem("calAuth");
    }
    document.getElementById("site-name").textContent = CONFIG.siteName;
    const sub = document.getElementById("site-sub");
    if (CONFIG.siteSubtitle) sub.textContent = CONFIG.siteSubtitle; else sub.style.display = "none";
    document.getElementById("site-header").style.background = CONFIG.headerColor;

    document.getElementById("pw-btn").addEventListener("click", checkPassword);
    document.getElementById("pw-input").addEventListener("keydown", e => {
      if (e.key==="Enter") checkPassword();
      document.getElementById("pw-error").style.display="none";
    });

    document.getElementById("btn-add-event") && document.getElementById("btn-add-event").addEventListener("click", openModal);
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("modal-save").addEventListener("click", saveEvent);
    document.getElementById("modal-overlay").addEventListener("click", e => { if(e.target===e.currentTarget) closeModal(); });
    document.getElementById("ev-allday").addEventListener("change", function() { document.getElementById("time-fields").style.display=this.checked?"none":"block"; });
    document.getElementById("ev-start-date").addEventListener("change", function() { if(document.getElementById("ev-end-date").value<this.value) document.getElementById("ev-end-date").value=this.value; });

    if (isAuthenticated()) showCalendar();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
