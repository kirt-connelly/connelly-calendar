// ============================================================
//  CONNELLY FAMILY CALENDAR — MAIN APP v2.1
// ============================================================
(function () {
  "use strict";

  const MAX_ROWS = 5;
  const ADD_EVENT_URL = 'http://recipes.connellyfamily.org/calendar-auth/add-event.php';

  let currentYear  = new Date().getFullYear();
  let currentMonth = new Date().getMonth();
  let allEvents    = [];
  const today      = new Date();

  const MONTH_NAMES = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

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

  // ── Timezone label (MST vs MDT) ────────────────────────────
  function getMtnTzLabel() {
    // MDT: 2nd Sun March – 1st Sun November
    const now = new Date();
    const year = now.getFullYear();
    const dstStart = getNthSunday(year, 2, 2);  // 2nd Sunday of March
    const dstEnd   = getNthSunday(year, 10, 1); // 1st Sunday of November
    return (now >= dstStart && now < dstEnd) ? 'MDT' : 'MST';
  }

  function getNthSunday(year, month, n) {
    const d = new Date(year, month - 1, 1);
    let count = 0;
    while (count < n) { if (d.getDay() === 0) count++; if (count < n) d.setDate(d.getDate() + 1); }
    return d;
  }

  // ── Google Calendar API ────────────────────────────────────
  async function fetchCal(cal, year, month) {
    const tMin = new Date(year, month, 1).toISOString();
    const tMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    const url  = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`
      + `?key=AIzaSyANgqTgULK9wuIqU2IggqbothFP3Yz-UZc`
      + `&timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`
      + `&singleEvents=true&orderBy=startTime&maxResults=500&showDeleted=false`;
    try {
      const data = await (await fetch(url)).json();
      return (data.items || []).filter(ev => {
        if (ev.status === "cancelled") return false;
        if (ev.attendees) {
          const me = ev.attendees.find(a => a.self);
          if (me && me.responseStatus === "declined") return false;
        }
        return true;
      }).map(ev => {
        const allDay = !!ev.start.date && !ev.start.dateTime;
        const start  = allDay ? new Date(ev.start.date + "T00:00:00") : new Date(ev.start.dateTime);
        let   end    = allDay ? new Date(ev.end.date   + "T00:00:00") : new Date(ev.end.dateTime);
        if (allDay) end.setDate(end.getDate() - 1);
        return { title: ev.summary || "(private)", start, end, allDay, bgColor: cal.bgColor, textColor: cal.textColor };
      });
    } catch(e) { console.warn("Calendar load failed:", cal.name, e); return []; }
  }

  async function loadAllEvents() {
    document.getElementById("loading-spinner").style.display = "flex";
    allEvents = (await Promise.all(CONFIG.calendars.map(c => fetchCal(c, currentYear, currentMonth)))).flat();
    document.getElementById("loading-spinner").style.display = "none";
    renderGrid();
  }

  // ── Helpers ────────────────────────────────────────────────
  function d0(d) { const c = new Date(d); c.setHours(0,0,0,0); return c; }

  function fmtTime(d) {
    const h = d.getHours(), m = d.getMinutes();
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2,"0")}` : ""}${h >= 12 ? "pm" : "am"}`;
  }

  // ── Render ─────────────────────────────────────────────────
  function renderGrid() {
    document.getElementById("month-label").textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
    const grid = document.getElementById("cal-grid");
    grid.innerHTML = "";

    const dowRow = document.createElement("div");
    dowRow.className = "dow-row";
    DAY_NAMES.forEach(d => {
      const c = document.createElement("div");
      c.className = "dow-cell"; c.textContent = d;
      dowRow.appendChild(c);
    });
    grid.appendChild(dowRow);

    const firstDay   = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMon  = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevDays   = new Date(currentYear, currentMonth, 0).getDate();
    const totalCells = Math.ceil((firstDay + daysInMon) / 7) * 7;
    const numWeeks   = totalCells / 7;

    const cellDates = [];
    for (let i = 0; i < totalCells; i++) {
      let date, inMonth;
      if (i < firstDay) {
        date = new Date(currentMonth === 0 ? currentYear-1 : currentYear, currentMonth === 0 ? 11 : currentMonth-1, prevDays - firstDay + 1 + i);
        inMonth = false;
      } else if (i >= firstDay + daysInMon) {
        date = new Date(currentMonth === 11 ? currentYear+1 : currentYear, currentMonth === 11 ? 0 : currentMonth+1, i - firstDay - daysInMon + 1);
        inMonth = false;
      } else {
        date = new Date(currentYear, currentMonth, i - firstDay + 1);
        inMonth = true;
      }
      cellDates.push({ date: d0(date), inMonth });
    }

    const sorted = [...allEvents].sort((a, b) => {
      const aSpan = d0(b.end) - d0(b.start);
      const bSpan = d0(a.end) - d0(a.start);
      return aSpan - bSpan || a.start - b.start;
    });

    const usedRows = Array.from({length: numWeeks}, () => Array.from({length: 7}, () => Array(MAX_ROWS).fill(false)));
    const overflow = Array.from({length: numWeeks}, () => Array(7).fill(0));

    sorted.forEach(ev => {
      const evStart = d0(ev.start), evEnd = d0(ev.end);
      for (let week = 0; week < numWeeks; week++) {
        const weekCells = cellDates.slice(week * 7, week * 7 + 7);
        const cols = weekCells.reduce((acc, {date}, col) => { if (date >= evStart && date <= evEnd) acc.push(col); return acc; }, []);
        if (cols.length === 0) continue;

        let chosenRow = -1;
        for (let r = 0; r < MAX_ROWS; r++) {
          if (cols.every(col => !usedRows[week][col][r])) { chosenRow = r; break; }
        }
        if (chosenRow === -1) { cols.forEach(col => overflow[week][col]++); continue; }
        cols.forEach(col => usedRows[week][col][chosenRow] = true);

        const firstCol = cols[0], span = cols.length;
        const slot = weekRows[week]?.querySelector(`.event-row:nth-child(${chosenRow + 2})`);

        // Store for rendering after building week elements
        ev._placements = ev._placements || [];
        ev._placements.push({ week, firstCol, span, chosenRow });
      }
    });

    // Build week DOM
    const weekRows = [];
    for (let week = 0; week < numWeeks; week++) {
      const weekEl = document.createElement("div");
      weekEl.className = "week-row";

      cellDates.slice(week * 7, week * 7 + 7).forEach(({ date, inMonth }) => {
        const cell = document.createElement("div");
        cell.className = "day-num-cell" + (inMonth ? "" : " other-month");
        const isToday = date.getTime() === d0(today).getTime();
        const num = document.createElement("span");
        num.className = "day-num" + (isToday ? " today" : "");
        num.textContent = date.getDate();
        cell.appendChild(num);
        weekEl.appendChild(cell);
      });

      const eventsArea = document.createElement("div");
      eventsArea.className = "week-events";

      // Create MAX_ROWS event rows
      for (let r = 0; r < MAX_ROWS; r++) {
        const rowEl = document.createElement("div");
        rowEl.className = "event-row";
        eventsArea.appendChild(rowEl);
      }

      weekEl.appendChild(eventsArea);
      grid.appendChild(weekEl);
      weekRows.push(eventsArea);
    }

    // Place event pills
    sorted.forEach(ev => {
      const evStart = d0(ev.start), evEnd = d0(ev.end);
      for (let week = 0; week < numWeeks; week++) {
        const weekCells = cellDates.slice(week * 7, week * 7 + 7);
        const cols = weekCells.reduce((acc, {date}, col) => { if (date >= evStart && date <= evEnd) acc.push(col); return acc; }, []);
        if (cols.length === 0) continue;

        // Find chosen row from usedRows
        let chosenRow = -1;
        for (let r = 0; r < MAX_ROWS; r++) {
          if (cols.every(col => usedRows[week][col][r] === true)) {
            // Check it was set by THIS event by verifying all cols match
            chosenRow = r; break;
          }
        }
        if (chosenRow === -1) continue;

        const eventsArea = weekRows[week];
        const rowEl = eventsArea.children[chosenRow];
        if (!rowEl) continue;

        const pill = document.createElement("div");
        pill.className = "event-pill";
        pill.style.gridColumn = `${cols[0] + 1} / span ${cols.length}`;
        pill.style.background = ev.bgColor;
        pill.style.color = ev.textColor;
        if (d0(ev.end) < d0(today)) pill.style.opacity = "0.4";

        const label = ev.allDay ? ev.title : `${fmtTime(ev.start)} ${ev.title}`;
        pill.textContent = label;
        pill.title = label;
        rowEl.appendChild(pill);
      }
    });

    // Overflow badges
    for (let week = 0; week < numWeeks; week++) {
      if (overflow[week].some(n => n > 0)) {
        const ovRow = document.createElement("div");
        ovRow.className = "overflow-row";
        overflow[week].forEach((count, col) => {
          const cell = document.createElement("div");
          cell.className = "overflow-cell";
          cell.style.gridColumn = `${col + 1}`;
          if (count > 0) cell.textContent = `+${count} more`;
          ovRow.appendChild(cell);
        });
        weekRows[week].appendChild(ovRow);
      }
    }
  }

  // ── Navigation ─────────────────────────────────────────────
  function prevMonth() { if (--currentMonth < 0) { currentMonth = 11; currentYear--; } loadAllEvents(); }
  function nextMonth() { if (++currentMonth > 11) { currentMonth = 0;  currentYear++; } loadAllEvents(); }
  function goToday()   { currentYear = today.getFullYear(); currentMonth = today.getMonth(); loadAllEvents(); }

  // ── Add Event Modal ────────────────────────────────────────
  function openModal() {
    const todayStr = today.toISOString().split("T")[0];
    document.getElementById("ev-title").value = "";
    document.getElementById("ev-start-date").value = todayStr;
    document.getElementById("ev-end-date").value = todayStr;
    document.getElementById("ev-allday").checked = true;
    document.getElementById("time-fields").style.display = "none";
    document.getElementById("form-error").style.display = "none";
    document.getElementById("form-success").style.display = "none";
    document.getElementById("modal-save").disabled = false;
    document.getElementById("modal-save").textContent = "Save Event";

    const tzLabel = getMtnTzLabel();
    document.getElementById("tz-label").textContent = tzLabel;
    document.getElementById("tz-label2").textContent = tzLabel;

    document.getElementById("modal-overlay").style.display = "flex";
    document.getElementById("ev-title").focus();
  }

  function closeModal() {
    document.getElementById("modal-overlay").style.display = "none";
  }

  async function saveEvent() {
    const title     = document.getElementById("ev-title").value.trim();
    const startDate = document.getElementById("ev-start-date").value;
    const endDate   = document.getElementById("ev-end-date").value;
    const allDay    = document.getElementById("ev-allday").checked;
    const startTime = document.getElementById("ev-start-time").value;
    const endTime   = document.getElementById("ev-end-time").value;

    const errorEl = document.getElementById("form-error");
    errorEl.style.display = "none";

    if (!title) { errorEl.textContent = "Please enter an event title."; errorEl.style.display = "block"; return; }
    if (!startDate) { errorEl.textContent = "Please select a start date."; errorEl.style.display = "block"; return; }
    if (!endDate) { errorEl.textContent = "Please select an end date."; errorEl.style.display = "block"; return; }
    if (endDate < startDate) { errorEl.textContent = "End date can't be before start date."; errorEl.style.display = "block"; return; }

    const saveBtn = document.getElementById("modal-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";

    try {
      const resp = await fetch(ADD_EVENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, startDate, endDate, allDay, startTime, endTime }),
      });

      const data = await resp.json();

      if (data.success) {
        document.getElementById("form-success").style.display = "block";
        saveBtn.textContent = "Saved!";
        setTimeout(() => { closeModal(); loadAllEvents(); }, 1500);
      } else {
        errorEl.textContent = data.error || "Failed to save event.";
        errorEl.style.display = "block";
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Event";
      }
    } catch(e) {
      errorEl.textContent = "Network error — please try again.";
      errorEl.style.display = "block";
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Event";
    }
  }

  // ── UI ─────────────────────────────────────────────────────
  function showCalendar() {
    document.getElementById("lock-screen").style.display = "none";
    document.getElementById("cal-wrapper").style.display = "block";
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

  function init() {
    document.getElementById("site-name").textContent = CONFIG.siteName;
    const sub = document.getElementById("site-sub");
    if (CONFIG.siteSubtitle) sub.textContent = CONFIG.siteSubtitle;
    else sub.style.display = "none";
    document.getElementById("site-header").style.background = CONFIG.headerColor;

    document.getElementById("pw-btn").addEventListener("click", checkPassword);
    document.getElementById("pw-input").addEventListener("keydown", e => {
      if (e.key === "Enter") checkPassword();
      document.getElementById("pw-error").style.display = "none";
    });

    document.getElementById("btn-prev").addEventListener("click", prevMonth);
    document.getElementById("btn-next").addEventListener("click", nextMonth);
    document.getElementById("btn-today").addEventListener("click", goToday);
    document.getElementById("btn-add-event").addEventListener("click", openModal);
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("modal-save").addEventListener("click", saveEvent);
    document.getElementById("modal-overlay").addEventListener("click", e => { if (e.target === e.currentTarget) closeModal(); });

    document.getElementById("ev-allday").addEventListener("change", function() {
      document.getElementById("time-fields").style.display = this.checked ? "none" : "block";
    });

    document.getElementById("ev-start-date").addEventListener("change", function() {
      if (document.getElementById("ev-end-date").value < this.value) {
        document.getElementById("ev-end-date").value = this.value;
      }
    });

    if (isAuthenticated()) showCalendar();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
