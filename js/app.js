// ============================================================
//  CONNELLY FAMILY CALENDAR — MAIN APP
// ============================================================

(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────
  let currentYear  = new Date().getFullYear();
  let currentMonth = new Date().getMonth();
  let allEvents    = [];

  const MONTH_NAMES = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];
  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // ── Password ───────────────────────────────────────────────
  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function checkPassword() {
    const input = document.getElementById("pw-input").value.trim();
    const hash  = await sha256(input);
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

  // ── Google Calendar API ────────────────────────────────────
  // Uses the public iCal feed — no API key needed as long as calendars are public
  async function fetchCalendarEvents(cal, year, month) {
    const timeMin = new Date(year, month, 1).toISOString();
    const timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

    // We use the iCal/public embed approach via a CORS proxy on the free tier.
    // Google's public calendar JSON feed (works without API key for public calendars):
    const calId = encodeURIComponent(cal.id);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`
      + `?key=AIzaSyANgqTgULK9wuIqU2IggqbothFP3Yz-UZc`
      + `&timeMin=${encodeURIComponent(timeMin)}`
      + `&timeMax=${encodeURIComponent(timeMax)}`
      + `&singleEvents=true&orderBy=startTime&maxResults=250`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.items || []).map(item => ({
        title:    item.summary || "(no title)",
        start:    item.start.dateTime ? new Date(item.start.dateTime) : new Date(item.start.date + "T00:00:00"),
        end:      item.end.dateTime   ? new Date(item.end.dateTime)   : new Date(item.end.date   + "T00:00:00"),
        allDay:   !!item.start.date && !item.start.dateTime,
        calName:  cal.name,
        bgColor:  cal.bgColor,
        textColor: cal.textColor
      }));
    } catch (e) {
      console.warn("Could not load calendar:", cal.name, e);
      return [];
    }
  }

  async function loadAllEvents() {
    const spinner = document.getElementById("loading-spinner");
    if (spinner) spinner.style.display = "flex";

    const promises = CONFIG.calendars.map(cal =>
      fetchCalendarEvents(cal, currentYear, currentMonth)
    );
    const results = await Promise.all(promises);
    allEvents = results.flat();

    if (spinner) spinner.style.display = "none";
    renderGrid();
  }

  // ── Calendar Rendering ─────────────────────────────────────
  function renderGrid() {
    document.getElementById("month-label").textContent =
      `${MONTH_NAMES[currentMonth]} ${currentYear}`;

    const grid = document.getElementById("cal-grid");
    grid.innerHTML = "";

    // Day headers
    DAY_NAMES.forEach(d => {
      const h = document.createElement("div");
      h.className = "day-header";
      h.textContent = d;
      grid.appendChild(h);
    });

    const today       = new Date();
    const firstDay    = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevDays    = new Date(currentYear, currentMonth, 0).getDate();

    // Previous month filler cells
    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement("div");
      cell.className = "day-cell other-month";
      const num = document.createElement("span");
      num.className = "day-num";
      num.textContent = prevDays - firstDay + 1 + i;
      cell.appendChild(num);
      grid.appendChild(cell);
    }

    // Current month cells
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement("div");
      cell.className = "day-cell";

      const isToday =
        d === today.getDate() &&
        currentMonth === today.getMonth() &&
        currentYear  === today.getFullYear();

      const num = document.createElement("span");
      num.className = "day-num" + (isToday ? " today" : "");
      num.textContent = d;
      cell.appendChild(num);

      // Events on this day
      const dayEvents = allEvents.filter(ev => {
        const evDate = ev.start;
        return (
          evDate.getFullYear() === currentYear &&
          evDate.getMonth()    === currentMonth &&
          evDate.getDate()     === d
        );
      });

      // Show up to 3, then "+N more"
      const maxVisible = 3;
      dayEvents.slice(0, maxVisible).forEach(ev => {
        const pill = document.createElement("div");
        pill.className = "event-pill";
        pill.style.background = ev.bgColor;
        pill.style.color       = ev.textColor;
        pill.textContent = ev.title;
        pill.title = ev.title;
        cell.appendChild(pill);
      });

      if (dayEvents.length > maxVisible) {
        const more = document.createElement("div");
        more.className = "event-more";
        more.textContent = `+${dayEvents.length - maxVisible} more`;
        cell.appendChild(more);
      }

      grid.appendChild(cell);
    }

    // Next month filler cells to complete the last row
    const totalCells = firstDay + daysInMonth;
    const remaining  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
      const cell = document.createElement("div");
      cell.className = "day-cell other-month";
      const num = document.createElement("span");
      num.className = "day-num";
      num.textContent = i;
      cell.appendChild(num);
      grid.appendChild(cell);
    }
  }

  // ── Navigation ─────────────────────────────────────────────
  function prevMonth() {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    loadAllEvents();
  }

  function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    loadAllEvents();
  }

  function goToday() {
    const now = new Date();
    currentYear  = now.getFullYear();
    currentMonth = now.getMonth();
    loadAllEvents();
  }

  // ── UI Transitions ─────────────────────────────────────────
  function showCalendar() {
    document.getElementById("lock-screen").style.display = "none";
    const calWrap = document.getElementById("cal-wrapper");
    calWrap.style.display = "block";

    // Build legend dynamically from config
    const legend = document.getElementById("legend");
    legend.innerHTML = "";
    CONFIG.calendars.forEach(cal => {
      const item = document.createElement("div");
      item.className = "legend-item";
      item.innerHTML = `<span class="legend-dot" style="background:${cal.color}"></span>${cal.name}`;
      legend.appendChild(item);
    });

    loadAllEvents();
  }

  // ── Init ───────────────────────────────────────────────────
  function init() {
    // Apply branding from config
    document.getElementById("site-name").textContent   = CONFIG.siteName;
    document.getElementById("site-sub").textContent    = CONFIG.siteSubtitle;
    document.getElementById("site-header").style.background = CONFIG.headerColor;

    // Wire password form
    document.getElementById("pw-btn").addEventListener("click", checkPassword);
    document.getElementById("pw-input").addEventListener("keydown", e => {
      if (e.key === "Enter") checkPassword();
      document.getElementById("pw-error").style.display = "none";
    });

    // Wire navigation
    document.getElementById("btn-prev").addEventListener("click", prevMonth);
    document.getElementById("btn-next").addEventListener("click", nextMonth);
    document.getElementById("btn-today").addEventListener("click", goToday);

    // Auto-login if still authenticated this session
    if (isAuthenticated()) {
      showCalendar();
    }
  }

  document.addEventListener("DOMContentLoaded", init);

})();
