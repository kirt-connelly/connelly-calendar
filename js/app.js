// ============================================================
//  CONNELLY FAMILY CALENDAR — MAIN APP
// ============================================================

(function () {
  "use strict";

  const MAX_ROWS = 4; // visible event rows per cell before "+N more"

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
          calName:   cal.name,
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

  // ── Calendar Rendering ─────────────────────────────────────
  function renderGrid() {
    document.getElementById("month-label").textContent =
      `${MONTH_NAMES[currentMonth]} ${currentYear}`;

    const grid = document.getElementById("cal-grid");
    grid.innerHTML = "";

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

    // Build cells and assign actual dates
    const cells = [];
    for (let i = 0; i < totalCells; i++) {
      let dayNum, inMonth, cellDate;
      if (i < firstDay) {
        dayNum = prevDays - firstDay + 1 + i;
        inMonth = false;
        cellDate = new Date(currentMonth === 0 ? currentYear - 1 : currentYear,
                            currentMonth === 0 ? 11 : currentMonth - 1, dayNum);
      } else if (i >= firstDay + daysInMonth) {
        dayNum = i - firstDay - daysInMonth + 1;
        inMonth = false;
        cellDate = new Date(currentMonth === 11 ? currentYear + 1 : currentYear,
                            currentMonth === 11 ? 0 : currentMonth + 1, dayNum);
      } else {
        dayNum = i - firstDay + 1;
        inMonth = true;
        cellDate = new Date(currentYear, currentMonth, dayNum);
      }

      const cell = document.createElement("div");
      cell.className = "day-cell" + (inMonth ? "" : " other-month");

      const isToday = inMonth &&
        dayNum === today.getDate() &&
        currentMonth === today.getMonth() &&
        currentYear  === today.getFullYear();

      const num = document.createElement("span");
      num.className = "day-num" + (isToday ? " today" : "");
      num.textContent = dayNum;
      cell.appendChild(num);

      // Create MAX_ROWS event slots
      for (let row = 0; row < MAX_ROWS; row++) {
        const slot = document.createElement("div");
        slot.className = "event-slot";
        slot.dataset.row = row;
        cell.appendChild(slot);
      }

      grid.appendChild(cell);
      cells.push({ el: cell, dayNum, inMonth, cellDate });
    }

    // Sort events: longest span first, then by start time
    const sorted = [...allEvents].sort((a, b) => {
      const aSpan = b.end - b.start;
      const bSpan = a.end - a.start;
      return aSpan - bSpan || a.start - b.start;
    });

    // Track used rows per cell [MAX_ROWS booleans]
    const usedRows = Array.from({length: totalCells}, () => Array(MAX_ROWS).fill(false));
    const overflowCount = Array(totalCells).fill(0);

    sorted.forEach(ev => {
      const evStart = new Date(ev.start); evStart.setHours(0,0,0,0);
      const evEnd   = new Date(ev.end);   evEnd.setHours(0,0,0,0);

      // Find which cell indices this event occupies
      const cellIndices = [];
      cells.forEach((c, idx) => {
        const cd = new Date(c.cellDate); cd.setHours(0,0,0,0);
        if (cd >= evStart && cd <= evEnd) cellIndices.push(idx);
      });

      if (cellIndices.length === 0) return;

      // Find lowest free row across all spanned cells
      let chosenRow = -1;
      for (let row = 0; row < MAX_ROWS; row++) {
        if (cellIndices.every(idx => !usedRows[idx][row])) {
          chosenRow = row;
          break;
        }
      }

      if (chosenRow === -1) {
        cellIndices.forEach(idx => overflowCount[idx]++);
        return;
      }

      cellIndices.forEach(idx => usedRows[idx][chosenRow] = true);

      // Group consecutive indices within same week row
      const weekGroups = [];
      let group = [cellIndices[0]];
      for (let i = 1; i < cellIndices.length; i++) {
        const same = cellIndices[i] === cellIndices[i-1] + 1 &&
          Math.floor(cellIndices[i] / 7) === Math.floor(cellIndices[i-1] / 7);
        if (same) {
          group.push(cellIndices[i]);
        } else {
          weekGroups.push(group);
          group = [cellIndices[i]];
        }
      }
      weekGroups.push(group);

      weekGroups.forEach(grp => {
        const firstIdx = grp[0];
        const isMulti  = grp.length > 1;
        const slot = cells[firstIdx].el.querySelector(`.event-slot[data-row="${chosenRow}"]`);
        if (!slot) return;

        const pill = document.createElement("div");
        pill.className = "event-pill" + (isMulti ? " multi-day" : "");
        pill.style.background = ev.bgColor;
        pill.style.color = ev.textColor;

        let label = ev.title;
        if (!ev.allDay) {
          const h = ev.start.getHours();
          const m = ev.start.getMinutes();
          const ampm = h >= 12 ? "pm" : "am";
          const h12  = h % 12 || 12;
          const mStr = m > 0 ? `:${String(m).padStart(2,"0")}` : "";
          label = `${h12}${mStr}${ampm} ${ev.title}`;
        }

        pill.textContent = label;
        pill.title = label;
        slot.appendChild(pill);

        // Continuation spacers for multi-day spans
        grp.slice(1).forEach(idx => {
          const contSlot = cells[idx].el.querySelector(`.event-slot[data-row="${chosenRow}"]`);
          if (contSlot) {
            const spacer = document.createElement("div");
            spacer.className = "event-spacer";
            contSlot.appendChild(spacer);
          }
        });
      });
    });

    // Render overflow counts
    overflowCount.forEach((count, idx) => {
      if (count > 0) {
        const more = document.createElement("div");
        more.className = "event-more";
        more.textContent = `+${count} more`;
        cells[idx].el.appendChild(more);
      }
    });
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
