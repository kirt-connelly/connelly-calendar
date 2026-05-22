// ============================================================
//  CONNELLY FAMILY CALENDAR
// ============================================================
(function () {
  "use strict";

  const MAX_ROWS = 5;

  let currentYear  = new Date().getFullYear();
  let currentMonth = new Date().getMonth();
  let allEvents    = [];

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

  // ── API ────────────────────────────────────────────────────
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
        if (allDay) end.setDate(end.getDate() - 1); // Google end is exclusive
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

    // Day-of-week header
    const dowRow = document.createElement("div");
    dowRow.className = "dow-row";
    DAY_NAMES.forEach(d => {
      const c = document.createElement("div");
      c.className = "dow-cell";
      c.textContent = d;
      dowRow.appendChild(c);
    });
    grid.appendChild(dowRow);

    const today      = new Date();
    const firstDay   = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMon  = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevDays   = new Date(currentYear, currentMonth, 0).getDate();
    const totalCells = Math.ceil((firstDay + daysInMon) / 7) * 7;
    const numWeeks   = totalCells / 7;

    // Build date array for all cells
    const cellDates = [];
    for (let i = 0; i < totalCells; i++) {
      let date, inMonth;
      if (i < firstDay) {
        date = new Date(currentMonth === 0 ? currentYear-1 : currentYear,
                        currentMonth === 0 ? 11 : currentMonth-1,
                        prevDays - firstDay + 1 + i);
        inMonth = false;
      } else if (i >= firstDay + daysInMon) {
        date = new Date(currentMonth === 11 ? currentYear+1 : currentYear,
                        currentMonth === 11 ? 0 : currentMonth+1,
                        i - firstDay - daysInMon + 1);
        inMonth = false;
      } else {
        date = new Date(currentYear, currentMonth, i - firstDay + 1);
        inMonth = true;
      }
      cellDates.push({ date: d0(date), inMonth });
    }

    // Sort events: longest span first, then by start
    const sorted = [...allEvents].sort((a, b) => {
      const aSpan = d0(b.end) - d0(b.start);
      const bSpan = d0(a.end) - d0(a.start);
      return aSpan - bSpan || a.start - b.start;
    });

    // For each week: assign events to rows
    const weeks = [];
    for (let w = 0; w < numWeeks; w++) {
      const weekDates = cellDates.slice(w * 7, w * 7 + 7);
      // rows: array of 7-element arrays (null = empty, event obj = placed)
      const rows = Array.from({length: MAX_ROWS}, () => Array(7).fill(null));
      const overflow = Array(7).fill(0);

      sorted.forEach(ev => {
        const evStart = d0(ev.start);
        const evEnd   = d0(ev.end);

        // Which columns does this event occupy this week?
        const cols = weekDates.reduce((acc, {date}, col) => {
          if (date >= evStart && date <= evEnd) acc.push(col);
          return acc;
        }, []);
        if (cols.length === 0) return;

        // Find first free row across all these cols
        let chosenRow = -1;
        for (let r = 0; r < MAX_ROWS; r++) {
          if (cols.every(col => rows[r][col] === null)) { chosenRow = r; break; }
        }

        if (chosenRow === -1) {
          cols.forEach(col => overflow[col]++);
          return;
        }

        // Place event: mark start col with event, rest with "cont" marker
        rows[chosenRow][cols[0]] = { ev, span: cols.length, isStart: true };
        cols.slice(1).forEach(col => { rows[chosenRow][col] = { ev, span: 0, isStart: false }; });
      });

      weeks.push({ weekDates, rows, overflow });
    }

    // Render each week
    weeks.forEach(({ weekDates, rows, overflow }) => {
      const weekEl = document.createElement("div");
      weekEl.className = "week-row";

      // Date number cells
      weekDates.forEach(({ date, inMonth }) => {
        const cell = document.createElement("div");
        cell.className = "day-num-cell" + (inMonth ? "" : " other-month");
        const isToday = date.getTime() === d0(today).getTime();
        const num = document.createElement("span");
        num.className = "day-num" + (isToday ? " today" : "");
        num.textContent = date.getDate();
        cell.appendChild(num);
        weekEl.appendChild(cell);
      });

      // Events area
      const eventsArea = document.createElement("div");
      eventsArea.className = "week-events";

      // Render each event row
      rows.forEach(row => {
        const rowEl = document.createElement("div");
        rowEl.className = "event-row";

        let col = 0;
        while (col < 7) {
          const cell = row[col];
          if (cell && cell.isStart) {
            const pill = document.createElement("div");
            pill.className = "event-pill";
            pill.style.gridColumn = `${col + 1} / span ${cell.span}`;
            pill.style.background = cell.ev.bgColor;
            pill.style.color      = cell.ev.textColor;
            const label = cell.ev.allDay
              ? cell.ev.title
              : `${fmtTime(cell.ev.start)} ${cell.ev.title}`;
            pill.textContent = label;
            pill.title = label;
            // Grey out past events
            if (d0(cell.ev.end) < d0(today)) pill.style.opacity = "0.4";
            rowEl.appendChild(pill);
            col += cell.span;
          } else if (cell && !cell.isStart) {
            col++; // continuation — skip, pill already spans
          } else {
            // Empty slot — add invisible spacer so grid col is occupied
            const empty = document.createElement("div");
            empty.style.gridColumn = `${col + 1}`;
            rowEl.appendChild(empty);
            col++;
          }
        }
        eventsArea.appendChild(rowEl);
      });

      // Overflow row
      const hasOverflow = overflow.some(n => n > 0);
      if (hasOverflow) {
        const ovRow = document.createElement("div");
        ovRow.className = "overflow-row";
        overflow.forEach((count, col) => {
          const cell = document.createElement("div");
          cell.className = "overflow-cell";
          cell.style.gridColumn = `${col + 1}`;
          if (count > 0) cell.textContent = `+${count} more`;
          ovRow.appendChild(cell);
        });
        eventsArea.appendChild(ovRow);
      }

      weekEl.appendChild(eventsArea);
      grid.appendChild(weekEl);
    });
  }

  // ── Nav ────────────────────────────────────────────────────
  function prevMonth() { if (--currentMonth < 0) { currentMonth = 11; currentYear--; } loadAllEvents(); }
  function nextMonth() { if (++currentMonth > 11) { currentMonth = 0;  currentYear++; } loadAllEvents(); }
  function goToday()   { currentYear = new Date().getFullYear(); currentMonth = new Date().getMonth(); loadAllEvents(); }

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

    if (isAuthenticated()) showCalendar();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
