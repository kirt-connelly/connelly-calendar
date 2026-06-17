// ============================================================
//  CONNELLY FAMILY CALENDAR v2.10
// ============================================================
(function () {
  "use strict";

  const MAX_VISIBLE = 5;
  const ADD_EVENT_URL = 'http://recipes.connellyfamily.org/calendar-auth/add-event.php';

  let currentYear  = new Date().getFullYear();
  let currentMonth = new Date().getMonth();
  let allEvents    = [];
  const today      = new Date();
  const disabledCals = new Set();

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

  // ── Timezone ───────────────────────────────────────────────
  function getMtnTzLabel() {
    const now = new Date(), y = now.getFullYear();
    const start = new Date(y, 2, 1); while (start.getDay() !== 0) start.setDate(start.getDate()+1); start.setDate(start.getDate()+7);
    const end   = new Date(y, 10, 1); while (end.getDay() !== 0) end.setDate(end.getDate()+1);
    return (now >= start && now < end) ? 'MDT' : 'MST';
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
        if (allDay) end.setDate(end.getDate() - 1);
        return { title: ev.summary || "(private)", start, end, allDay, bgColor: cal.bgColor, textColor: cal.textColor, calId: cal.id };
      });
    } catch(e) { console.warn("Calendar load failed:", cal.name, e); return []; }
  }

  async function loadAllEvents() {
    document.getElementById("loading-spinner").style.display = "flex";
    allEvents = (await Promise.all(CONFIG.calendars.map(c => fetchCal(c, currentYear, currentMonth)))).flat();
    document.getElementById("loading-spinner").style.display = "none";
    renderGrid();
  }

  // ── Date helpers ───────────────────────────────────────────
  function d0(d) { const c = new Date(d); c.setHours(0,0,0,0); return c; }
  function fmtTime(d) {
    const h = d.getHours(), m = d.getMinutes();
    return `${h%12||12}${m?`:${String(m).padStart(2,"0")}` :""}${h>=12?"pm":"am"}`;
  }

  // ── RENDER ─────────────────────────────────────────────────
  function renderGrid() {
    document.getElementById("month-label").textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
    const grid = document.getElementById("cal-grid");
    grid.innerHTML = "";

    // Day headers
    const dowRow = document.createElement("div");
    dowRow.className = "dow-row";
    DAY_NAMES.forEach(d => {
      const c = document.createElement("div");
      c.className = "dow-cell"; c.textContent = d;
      dowRow.appendChild(c);
    });
    grid.appendChild(dowRow);

    // Build cell date array
    const firstDay  = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMon = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevDays  = new Date(currentYear, currentMonth, 0).getDate();
    const total     = Math.ceil((firstDay + daysInMon) / 7) * 7;
    const numWeeks  = total / 7;

    const cells = [];
    for (let i = 0; i < total; i++) {
      let date, inMonth;
      if (i < firstDay) {
        date = new Date(currentMonth===0?currentYear-1:currentYear, currentMonth===0?11:currentMonth-1, prevDays-firstDay+1+i);
        inMonth = false;
      } else if (i >= firstDay + daysInMon) {
        date = new Date(currentMonth===11?currentYear+1:currentYear, currentMonth===11?0:currentMonth+1, i-firstDay-daysInMon+1);
        inMonth = false;
      } else {
        date = new Date(currentYear, currentMonth, i-firstDay+1);
        inMonth = true;
      }
      cells.push({ date: d0(date), inMonth });
    }

    // Filter and sort events: longest span first, then by start time
    const events = allEvents
      .filter(ev => !disabledCals.has(ev.calId))
      .sort((a, b) => {
        const spanA = d0(a.end) - d0(a.start);
        const spanB = d0(b.end) - d0(b.start);
        return spanB - spanA || a.start - b.start;
      });

    // For each week, compute layout independently
    // layout[week] = array of placed events: { ev, startCol, span, row }
    const weekLayouts = [];
    for (let w = 0; w < numWeeks; w++) {
      const weekCells = cells.slice(w*7, w*7+7);
      const placed = []; // { ev, startCol, span, row }
      // row occupancy: rowMap[row][col] = true if occupied
      const rowMap = [];
      const getRow = (cols) => {
        for (let r = 0; r < MAX_VISIBLE; r++) {
          if (!rowMap[r]) rowMap[r] = Array(7).fill(false);
          if (cols.every(c => !rowMap[r][c])) return r;
        }
        return -1; // overflow
      };
      const markRow = (row, cols) => {
        if (!rowMap[row]) rowMap[row] = Array(7).fill(false);
        cols.forEach(c => rowMap[row][c] = true);
      };

      events.forEach(ev => {
        const evS = d0(ev.start), evE = d0(ev.end);
        const cols = weekCells.reduce((acc, {date}, ci) => {
          if (date >= evS && date <= evE) acc.push(ci);
          return acc;
        }, []);
        if (!cols.length) return;

        const row = getRow(cols);
        if (row === -1) return; // overflow — handled separately
        markRow(row, cols);
        placed.push({ ev, startCol: cols[0], span: cols.length, row });
      });

      weekLayouts.push({ placed, rowMap });
    }

    // Render weeks
    for (let w = 0; w < numWeeks; w++) {
      const weekCells = cells.slice(w*7, w*7+7);
      const { placed } = weekLayouts[w];

      // How many rows used this week?
      const maxRow = placed.reduce((m, p) => Math.max(m, p.row), -1);

      const weekEl = document.createElement("div");
      weekEl.className = "week-row";

      // Date number row
      weekCells.forEach(({ date, inMonth }) => {
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
      const evArea = document.createElement("div");
      evArea.className = "week-events";

      // Create only the rows we need
      for (let r = 0; r <= maxRow; r++) {
        const rowEl = document.createElement("div");
        rowEl.className = "event-row";

        // Find all events in this row
        placed.filter(p => p.row === r).forEach(p => {
          const pill = document.createElement("div");
          pill.className = "event-pill";
          pill.style.gridColumn = `${p.startCol + 1} / span ${p.span}`;
          pill.style.background = p.ev.bgColor;
          pill.style.color = p.ev.textColor;
          if (d0(p.ev.end) < d0(today)) pill.style.opacity = "0.4";
          const label = p.ev.allDay ? p.ev.title : `${fmtTime(p.ev.start)} ${p.ev.title}`;
          pill.textContent = label;
          pill.title = label;
          rowEl.appendChild(pill);
        });

        evArea.appendChild(rowEl);
      }

      // Overflow count per column
      const overflowCounts = Array(7).fill(0);
      events.forEach(ev => {
        const evS = d0(ev.start), evE = d0(ev.end);
        weekCells.forEach(({ date }, ci) => {
          if (date >= evS && date <= evE) {
            const isPlaced = placed.some(p => p.ev === ev && p.startCol <= ci && ci < p.startCol + p.span);
            if (!isPlaced) overflowCounts[ci]++;
          }
        });
      });

      if (overflowCounts.some(n => n > 0)) {
        const ovRow = document.createElement("div");
        ovRow.className = "overflow-row";
        overflowCounts.forEach((count, ci) => {
          const cell = document.createElement("div");
          cell.className = "overflow-cell";
          cell.style.gridColumn = `${ci + 1}`;
          if (count > 0) cell.textContent = `+${count}`;
          ovRow.appendChild(cell);
        });
        evArea.appendChild(ovRow);
      }

      weekEl.appendChild(evArea);
      grid.appendChild(weekEl);
    }
  }

  // ── Navigation ─────────────────────────────────────────────
  function prevMonth() { if (--currentMonth < 0) { currentMonth=11; currentYear--; } loadAllEvents(); }
  function nextMonth() { if (++currentMonth > 11) { currentMonth=0;  currentYear++; } loadAllEvents(); }
  function goToday()   { currentYear=today.getFullYear(); currentMonth=today.getMonth(); loadAllEvents(); }

  // ── Legend ─────────────────────────────────────────────────
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
        renderGrid();
      });
      legend.appendChild(item);
    });
  }

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
    const errorEl = document.getElementById("form-error");
    errorEl.style.display = "none";
    if (!title) { errorEl.textContent = "Please enter a title."; errorEl.style.display = "block"; return; }
    if (!startDate || !endDate) { errorEl.textContent = "Please select dates."; errorEl.style.display = "block"; return; }
    if (endDate < startDate) { errorEl.textContent = "End date can't be before start."; errorEl.style.display = "block"; return; }
    const btn = document.getElementById("modal-save");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      const resp = await fetch(ADD_EVENT_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({title,startDate,endDate,allDay,startTime,endTime}) });
      const data = await resp.json();
      if (data.success) { document.getElementById("form-success").style.display="block"; btn.textContent="Saved!"; setTimeout(()=>{ closeModal(); loadAllEvents(); },1500); }
      else { errorEl.textContent=data.error||"Failed."; errorEl.style.display="block"; btn.disabled=false; btn.textContent="Save Event"; }
    } catch(e) { errorEl.textContent="Network error."; errorEl.style.display="block"; btn.disabled=false; btn.textContent="Save Event"; }
  }

  // ── UI ─────────────────────────────────────────────────────
  function showCalendar() {
    document.getElementById("lock-screen").style.display = "none";
    document.getElementById("cal-wrapper").style.display = "block";
    buildLegend();
    loadAllEvents();
  }

  function init() {
    document.getElementById("site-name").textContent = CONFIG.siteName;
    const sub = document.getElementById("site-sub");
    if (CONFIG.siteSubtitle) sub.textContent = CONFIG.siteSubtitle; else sub.style.display = "none";
    document.getElementById("site-header").style.background = CONFIG.headerColor;
    document.getElementById("pw-btn").addEventListener("click", checkPassword);
    document.getElementById("pw-input").addEventListener("keydown", e => { if(e.key==="Enter") checkPassword(); document.getElementById("pw-error").style.display="none"; });
    document.getElementById("btn-prev").addEventListener("click", prevMonth);
    document.getElementById("btn-next").addEventListener("click", nextMonth);
    document.getElementById("btn-today").addEventListener("click", goToday);
    document.getElementById("btn-add-event").addEventListener("click", openModal);
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("modal-save").addEventListener("click", saveEvent);
    document.getElementById("modal-overlay").addEventListener("click", e => { if(e.target===e.currentTarget) closeModal(); });
    document.getElementById("ev-allday").addEventListener("change", function() { document.getElementById("time-fields").style.display = this.checked?"none":"block"; });
    document.getElementById("ev-start-date").addEventListener("change", function() { if(document.getElementById("ev-end-date").value < this.value) document.getElementById("ev-end-date").value=this.value; });
    if (isAuthenticated()) showCalendar();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
