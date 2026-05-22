// ============================================================
//  CONNELLY FAMILY CALENDAR — MAIN APP
// ============================================================

(function () {
  "use strict";

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
    // Fetch a wider window so multi-day events starting before month-start still appear
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
        // For all-day events, Google uses exclusive end date (day after last day)
        const start = isAllDay
          ? new Date(item.start.date + "T00:00:00")
          : new Date(item.start.dateTime);
        let end = isAllDay
          ? new Date(item.end.date + "T00:00:00")
          : new Date(item.end.dateTime);
        // Make all-day end inclusive
        if (isAllDay) end.setDate(end.getDate() - 1);

        return {
          title:     item.summary || "(private)",
          start,
          end,
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
    const promises = CONFIG.calendars.map(cal =>
      fetchCalendarEvents(cal, currentYear, currentMonth)
    );
    const results = await Promise.all(promises);
    allEvents = results.flat();
    if (spinner) spinner.style.display = "none";
    renderGrid();
  }

  // ── Helpers ────────────────────────────────────────────────
  function dateKey(y, m, d) {
    return `${y}-${m}-${d}`;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth()    === b.getMonth()    &&
           a.getDate()     === b.getDate();
  }

  // Returns all days (as Date objects) an event spans within the current month view
  function eventDaysInMonth(ev, year, month) {
    const days = [];
    const monthStart = new Date(year, month, 1);
    const monthEnd   = new Date(year, month + 1, 0);
    const cur = new Date(Math.max(ev.start, monthStart));
    const stop = new Date(Math.min(ev.end, monthEnd));
    cur.setHours(0,0,0,0);
    stop.setHours(0,0,0,0);
    while (cur <= stop) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
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
    const totalCells  = Math.ceil((firstDay + daysInMonth) / 7) * 7;

    // Build cell elements
    const cells = [];
    for (let i = 0; i < totalCells; i++) {
      const cell = document.createElement("div");
      let dayNum, inMonth;
      if (i < firstDay) {
        dayNum = prevDays - firstDay + 1 + i;
        inMonth = false;
      } else if (i >= firstDay + daysInMonth) {
        dayNum = i - firstDay - daysInMonth + 1;
        inMonth = false;
      } else {
        dayNum = i - firstDay + 1;
        inMonth = true;
      }
      cell.className = "day-cell" + (inMonth ? "" : " other-month");
      cell.dataset.day = dayNum;
      cell.dataset.inMonth = inMonth;

      const isToday = inMonth &&
        dayNum === today.getDate() &&
        currentMonth === today.getMonth() &&
        currentYear  === today.getFullYear();

      const num = document.createElement("span");
      num.className = "day-num" + (isToday ? " today" : "");
      num.textContent = dayNum;
      cell.appendChild(num);

      // Placeholder rows for events (up to 3 rows per cell)
      for (let row = 0; row < 3; row++) {
        const slot = document.createElement("div");
        slot.className = "event-slot";
        slot.dataset.row = row;
        cell.appendChild(slot);
      }

      grid.appendChild(cell);
      cells.push({ el: cell, dayNum, inMonth });
    }

    // ── Place events ───────────────────────────────────────
    // Sort: all-day/multi-day first (longest first), then timed
    const sorted = [...allEvents].sort((a, b) => {
      const aSpan = (a.end - a.start);
      const bSpan = (b.end - b.start);
      return bSpan - aSpan;
    });

    // Track which row is used per cell index
    const usedRows = Array.from({length: totalCells}, () => [false, false, false]);
    const overflowCount = Array(totalCells).fill(0);

    sorted.forEach(ev => {
      // Find first and last cell index for this event in the grid
      const evStart = new Date(ev.start); evStart.setHours(0,0,0,0);
      const evEnd   = new Date(ev.end);   evEnd.setHours(0,0,0,0);

      // Find cell indices this event spans
      const cellIndices = [];
      cells.forEach((c, idx) => {
        if (!c.inMonth && ev.allDay) return; // skip filler for all-day
        const cellDate = cellDateOf(c, currentYear, currentMonth, firstDay, prevDays, daysInMonth);
        if (!cellDate) return;
        const cd = new Date(cellDate); cd.setHours(0,0,0,0);
        if (cd >= evStart && cd <= evEnd) cellIndices.push(idx);
      });

      if (cellIndices.length === 0) return;

      // Find a free row across all spanned cells
      let chosenRow = -1;
      for (let row = 0; row < 3; row++) {
        if (cellIndices.every(idx => !usedRows[idx][row])) {
          chosenRow = row;
          break;
        }
      }

      if (chosenRow === -1) {
        // No room — increment overflow for each cell
        cellIndices.forEach(idx => overflowCount[idx]++);
        return;
      }

      // Mark row used
      cellIndices.forEach(idx => usedRows[idx][chosenRow] = true);

      // Render: group by week row
      const weekGroups = [];
      let group = [cellIndices[0]];
      for (let i = 1; i < cellIndices.length; i++) {
        if (cellIndices[i] === cellIndices[i-1] + 1 && Math.floor(cellIndices[i] / 7) === Math.floor(cellIndices[i-1] / 7)) {
          group.push(cellIndices[i]);
        } else {
          weekGroups.push(group);
          group = [cellIndices[i]];
        }
      }
      weekGroups.push(group);

      weekGroups.forEach(grp => {
        const firstIdx = grp[0];
        const span = grp.length;
        const slot = cells[firstIdx].el.querySelector(`.event-slot[data-row="${chosenRow}"]`);
        if (!slot) return;

        const pill = document.createElement("div");
        pill.className = "event-pill" + (span > 1 ? " multi-day" : "");
        pill.style.background = ev.bgColor;
        pill.style.color = ev.textColor;
        pill.style.gridColumn = `span ${span}`;

        // For timed events, prefix with time
        let label = ev.title;
        if (!ev.allDay) {
          const h = ev.start.getHours();
          const m = ev.start.getMinutes();
          const ampm = h >= 12 ? "pm" : "am";
          const h12 = h % 12 || 12;
          const mStr = m > 0 ? `:${String(m).padStart(2,"0")}` : "";
          label = `${h12}${mStr}${ampm} ${ev.title}`;
        }

        pill.textContent = label;
        pill.title = label;
        slot.appendChild(pill);

        // Fill continuation cells with spacer
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

  function cellDateOf(c, year, month, firstDay, prevDays, daysInMonth) {
    // Reconstruct the actual date for a cell
    const el = c.el;
    const allCells = Array.from(el.parentNode.children).filter(e => e.classList.contains('day-cell'));
    const idx = allCells.indexOf(el);
    if (idx < firstDay) {
      return new Date(idx < firstDay ? year : year, idx < firstDay ? month - 1 : month, c.dayNum);
    } else if (c.dayNum > daysInMonth && idx >= firstDay + daysInMonth) {
      return new Date(month === 11 ? year + 1 : year, (month + 1) % 12, c.dayNum);
    } else {
      return new Date(year, month, c.dayNum);
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
    const calWrap = document.getElementById("cal-wrapper");
    calWrap.style.display = "block";

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
    document.getElementById("site-name").textContent   = CONFIG.siteName;
    document.getElementById("site-sub").textContent    = CONFIG.siteSubtitle;
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
