// ============================================================
//  CONNELLY FAMILY CALENDAR — MAIN APP
// ============================================================

(function () {
  "use strict";

  const MAX_ROWS = 5;

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
  async function fetchCalendarEvents(cal, year, month) {
    const timeMin = new Date(year, month, 1).toISOString();
    const timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
    const calId = encodeURIComponent(cal.id);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${calId}/events`
      + `?key=AIzaSyANgqTgULK9wuIqU2IggqbothFP3Yz-UZc`
      + `&timeMin=${encodeURIComponent(timeMin)}`
      + `&timeMax=${encodeURIComponent(timeMax)}`
      + `&singleEvents=true&orderBy=startTime&maxResults=500&showDeleted=false`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.items || []).filter(item => {
        if (item.status === "cancelled") return false;
        if (item.attendees) {
          const self = item.attendees.find(a => a.self);
          if (self && self.responseStatus === "declined") return false;
        }
        return true;
      }).map(item => {
        const isAllDay = !!item.start.date && !item.start.dateTime;
        const start = isAllDay
          ? new Date(item.start.date + "T00:00:00")
          : new Date(item.start.dateTime);
        let end = isAllDay
          ? new Date(item.end.date + "T00:00:00")
          : new Date(item.end.dateTime);
        if (isAllDay) end.setDate(end.getDate() - 1);
        return {
          title:     item.summary || "(private)",
          start, end,
          allDay:    isAllDay,
          bgColor:   cal.bgColor,
          textColor: cal.textColor
        };
      });
    } catch (e) {
      console.warn("Could not load calendar:", cal.name, e);
      return [];
    }
  }

  async function loadAllEvents() {
    const spinner = document.getElementById("loading-spinner");
    if (spinner) spinner.style.display = "flex";
    const results = await Promise.all(
      CONFIG.calendars.map(cal => fetchCalendarEvents(cal, currentYear, currentMonth))
    );
    allEvents = results.flat();
    if (spinner) spinner.style.display = "none";
    renderGrid();
  }

  // ── Helpers ────────────────────────────────────────────────
  function startOfDay(d) {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  }

  function addDays(d, n) {
    const c = new Date(d);
    c.setDate(c.getDate() + n);
    return c;
  }

  // ── Calendar Rendering ─────────────────────────────────────
  function renderGrid() {
    document.getElementById("month-label").textContent =
      `${MONTH_NAMES[currentMonth]} ${currentYear}`;

    const grid = document.getElementById("cal-grid");
    grid.innerHTML = "";

    // Day of week headers
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
    const totalCells  = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    const numWeeks    = totalCells / 7;

    // Build cell data with correct dates
    const cells = [];
    for (let i = 0; i < totalCells; i++) {
      let dayNum, inMonth, cellDate;
      if (i < firstDay) {
        dayNum = prevDays - firstDay + 1 + i;
        inMonth = false;
        const m = currentMonth === 0 ? 11 : currentMonth - 1;
        const y = currentMonth === 0 ? currentYear - 1 : currentYear;
        cellDate = new Date(y, m, dayNum);
      } else if (i >= firstDay + daysInMonth) {
        dayNum = i - firstDay - daysInMonth + 1;
        inMonth = false;
        const m = currentMonth === 11 ? 0 : currentMonth + 1;
        const y = currentMonth === 11 ? currentYear + 1 : currentYear;
        cellDate = new Date(y, m, dayNum);
      } else {
        dayNum = i - firstDay + 1;
        inMonth = true;
        cellDate = new Date(currentYear, currentMonth, dayNum);
      }

      const isToday = inMonth &&
        dayNum === today.getDate() &&
        currentMonth === today.getMonth() &&
        currentYear  === today.getFullYear();

      const cell = document.createElement("div");
      cell.className = "day-cell" + (inMonth ? "" : " other-month");

      const num = document.createElement("span");
      num.className = "day-num" + (isToday ? " today" : "");
      num.textContent = dayNum;
      cell.appendChild(num);

      // Event row slots
      for (let r = 0; r < MAX_ROWS; r++) {
        const slot = document.createElement("div");
        slot.className = "event-slot";
        slot.dataset.row = r;
        cell.appendChild(slot);
      }

      grid.appendChild(cell);
      cells.push({ el: cell, dayNum, inMonth, cellDate: startOfDay(cellDate), gridIndex: i });
    }

    // Sort events: longest first so they claim rows before shorter ones
    const sorted = [...allEvents].sort((a, b) => {
      const aLen = b.end - b.start;
      const bLen = a.end - a.start;
      return aLen - bLen || a.start - b.start;
    });

    // For each week row, track which event rows are occupied per cell
    // usedRows[weekRow][cellCol][eventRow] = true/false
    const usedRows   = Array.from({length: numWeeks}, () =>
      Array.from({length: 7}, () => Array(MAX_ROWS).fill(false))
    );
    const overflow   = Array.from({length: numWeeks}, () => Array(7).fill(0));

    sorted.forEach(ev => {
      const evStart = startOfDay(ev.start);
      const evEnd   = startOfDay(ev.end);

      // For each week, find which columns this event occupies
      for (let week = 0; week < numWeeks; week++) {
        const weekCells = cells.slice(week * 7, week * 7 + 7);
        const cols = [];
        weekCells.forEach((c, col) => {
          if (c.cellDate >= evStart && c.cellDate <= evEnd) cols.push(col);
        });
        if (cols.length === 0) continue;

        // Find a free row in all occupied cols for this week
        let chosenRow = -1;
        for (let r = 0; r < MAX_ROWS; r++) {
          if (cols.every(col => !usedRows[week][col][r])) {
            chosenRow = r;
            break;
          }
        }

        if (chosenRow === -1) {
          cols.forEach(col => overflow[week][col]++);
          continue;
        }

        // Mark row used
        cols.forEach(col => usedRows[week][col][chosenRow] = true);

        // Render pill in the first col of this week segment
        const firstCol = cols[0];
        const span     = cols.length;
        const firstCell = weekCells[firstCol];
        const slot = firstCell.el.querySelector(`.event-slot[data-row="${chosenRow}"]`);
        if (!slot) continue;

        // Build label
        let label = ev.title;
        if (!ev.allDay) {
          const h    = ev.start.getHours();
          const m    = ev.start.getMinutes();
          const ampm = h >= 12 ? "pm" : "am";
          const h12  = h % 12 || 12;
          const mStr = m > 0 ? `:${String(m).padStart(2,"0")}` : "";
          label = `${h12}${mStr}${ampm} ${ev.title}`;
        }

        const pill = document.createElement("div");
        pill.className = "event-pill" + (span > 1 ? " multi-day" : "");
        pill.style.cssText = `
          background: ${ev.bgColor};
          color: ${ev.textColor};
          --span: ${span};
        `;
        pill.textContent = label;
        pill.title = label;
        slot.appendChild(pill);

        // Put invisible spacers in the continuation cells so layout is reserved
        cols.slice(1).forEach(col => {
          const contSlot = weekCells[col].el.querySelector(`.event-slot[data-row="${chosenRow}"]`);
          if (contSlot) {
            const spacer = document.createElement("div");
            spacer.className = "event-spacer";
            contSlot.appendChild(spacer);
          }
        });
      }
    });

    // Render overflow "+N more" badges
    for (let week = 0; week < numWeeks; week++) {
      for (let col = 0; col < 7; col++) {
        const count = overflow[week][col];
        if (count > 0) {
          const more = document.createElement("div");
          more.className = "event-more";
          more.textContent = `+${count} more`;
          cells[week * 7 + col].el.appendChild(more);
        }
      }
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
    if (CONFIG.siteSubtitle) {
      sub.textContent = CONFIG.siteSubtitle;
    } else {
      sub.style.display = "none";
    }
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
