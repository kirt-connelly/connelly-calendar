// ============================================================
//  CONNELLY FAMILY CALENDAR v2.11
// ============================================================
(function () {
  "use strict";

  const ROW_H    = 20; // px per event row
  const ROW_GAP  =  2; // px gap between rows
  const MAX_ROWS =  5;
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
    const start = new Date(y, 2, 1); while (start.getDay()!==0) start.setDate(start.getDate()+1); start.setDate(start.getDate()+7);
    const end   = new Date(y,10, 1); while (end.getDay()!==0)   end.setDate(end.getDate()+1);
    return (now >= start && now < end) ? 'MDT' : 'MST';
  }

  // ── API ────────────────────────────────────────────────────
  async function fetchCal(cal, year, month) {
    const tMin = new Date(year, month, 1).toISOString();
    const tMax = new Date(year, month+1, 0, 23, 59, 59).toISOString();
    const url  = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`
      + `?key=AIzaSyANgqTgULK9wuIqU2IggqbothFP3Yz-UZc`
      + `&timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`
      + `&singleEvents=true&orderBy=startTime&maxResults=500&showDeleted=false`;
    try {
      const data = await (await fetch(url)).json();
      return (data.items||[]).filter(ev => {
        if (ev.status==="cancelled") return false;
        if (ev.attendees) { const me=ev.attendees.find(a=>a.self); if (me&&me.responseStatus==="declined") return false; }
        return true;
      }).map(ev => {
        const allDay = !!ev.start.date && !ev.start.dateTime;
        const start  = allDay ? new Date(ev.start.date+"T00:00:00") : new Date(ev.start.dateTime);
        let   end    = allDay ? new Date(ev.end.date+"T00:00:00")   : new Date(ev.end.dateTime);
        if (allDay) end.setDate(end.getDate()-1);
        return { title: ev.summary || "(private)", start, end, allDay, bgColor:cal.bgColor, textColor:cal.textColor, calId:cal.id };
      });
    } catch(e) { console.warn("Failed:",cal.name,e); return []; }
  }

  async function loadAllEvents() {
    document.getElementById("loading-spinner").style.display = "flex";
    allEvents = (await Promise.all(CONFIG.calendars.map(c=>fetchCal(c,currentYear,currentMonth)))).flat();
    document.getElementById("loading-spinner").style.display = "none";
    renderGrid();
  }

  // ── Helpers ────────────────────────────────────────────────
  function d0(d) { const c=new Date(d); c.setHours(0,0,0,0); return c; }
  function fmtTime(d) { const h=d.getHours(),m=d.getMinutes(); return `${h%12||12}${m?`:${String(m).padStart(2,"0")}` :""}${h>=12?"pm":"am"}`; }

  // ── Layout engine ──────────────────────────────────────────
  // For a given week (7 cells), assign each visible event a row.
  // Uses per-column row tracking so events pack tightly with no gaps.
  function layoutWeek(events, weekCells) {
    // colNextRow[col] = next free row in that column
    const colNextRow = Array(7).fill(0);
    // placed: { ev, cols, row }
    const placed = [];

    events.forEach(ev => {
      const evS = d0(ev.start), evE = d0(ev.end);
      const cols = weekCells.reduce((acc,{date},ci) => { if (date>=evS&&date<=evE) acc.push(ci); return acc; }, []);
      if (!cols.length) return;

      // Find lowest row that is free across all cols this event spans
      const minNeeded = Math.max(...cols.map(c => colNextRow[c]));
      const row = minNeeded;

      if (row >= MAX_ROWS) {
        // overflow — mark for +N badge
        placed.push({ ev, cols, row: -1 });
        return;
      }

      // Advance colNextRow for all spanned cols to row+1
      cols.forEach(c => { colNextRow[c] = row + 1; });
      placed.push({ ev, cols, row });
    });

    return placed;
  }

  // ── Render ─────────────────────────────────────────────────
  function renderGrid() {
    document.getElementById("month-label").textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
    const grid = document.getElementById("cal-grid");
    grid.innerHTML = "";

    // Day headers
    const dowRow = document.createElement("div");
    dowRow.className = "dow-row";
    DAY_NAMES.forEach(d => { const c=document.createElement("div"); c.className="dow-cell"; c.textContent=d; dowRow.appendChild(c); });
    grid.appendChild(dowRow);

    // Build cell dates
    const firstDay  = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMon = new Date(currentYear, currentMonth+1, 0).getDate();
    const prevDays  = new Date(currentYear, currentMonth, 0).getDate();
    const total     = Math.ceil((firstDay+daysInMon)/7)*7;
    const numWeeks  = total/7;

    const cells = [];
    for (let i=0; i<total; i++) {
      let date, inMonth;
      if (i<firstDay) { date=new Date(currentMonth===0?currentYear-1:currentYear,currentMonth===0?11:currentMonth-1,prevDays-firstDay+1+i); inMonth=false; }
      else if (i>=firstDay+daysInMon) { date=new Date(currentMonth===11?currentYear+1:currentYear,currentMonth===11?0:currentMonth+1,i-firstDay-daysInMon+1); inMonth=false; }
      else { date=new Date(currentYear,currentMonth,i-firstDay+1); inMonth=true; }
      cells.push({ date:d0(date), inMonth });
    }

    // Sort: longest span first, then by start time
    const events = allEvents
      .filter(ev => !disabledCals.has(ev.calId))
      .sort((a,b) => (d0(b.end)-d0(b.start)) - (d0(a.end)-d0(a.start)) || a.start-b.start);

    // Render each week
    for (let w=0; w<numWeeks; w++) {
      const weekCells = cells.slice(w*7, w*7+7);
      const placed = layoutWeek(events, weekCells);

      // Max row used
      const maxRow = placed.filter(p=>p.row>=0).reduce((m,p)=>Math.max(m,p.row), -1);
      const evAreaH = maxRow >= 0 ? (maxRow+1)*(ROW_H+ROW_GAP)+ROW_GAP : 4;

      const weekEl = document.createElement("div");
      weekEl.className = "week-row";

      // Date number cells
      weekCells.forEach(({date, inMonth}) => {
        const cell = document.createElement("div");
        cell.className = "day-num-cell"+(inMonth?"":" other-month");
        const isToday = date.getTime()===d0(today).getTime();
        const num = document.createElement("span");
        num.className = "day-num"+(isToday?" today":"");
        num.textContent = date.getDate();
        cell.appendChild(num);
        weekEl.appendChild(cell);
      });

      // Events area — absolutely positioned pills
      const evArea = document.createElement("div");
      evArea.className = "week-events";
      evArea.style.height = evAreaH + "px";

      placed.filter(p=>p.row>=0).forEach(p => {
        const pct = 100/7;
        const left  = p.cols[0] * pct;
        const width = p.cols.length * pct;
        const top   = p.row * (ROW_H+ROW_GAP) + ROW_GAP;

        const pill = document.createElement("div");
        pill.className = "event-pill";
        pill.style.cssText = `
          position:absolute;
          left:${left.toFixed(4)}%;
          width:${width.toFixed(4)}%;
          top:${top}px;
          height:${ROW_H}px;
          background:${p.ev.bgColor};
          color:${p.ev.textColor};
          ${d0(p.ev.end)<d0(today)?"opacity:0.4;":""}
        `;
        const label = p.ev.allDay ? p.ev.title : `${fmtTime(p.ev.start)} ${p.ev.title}`;
        pill.textContent = label;
        pill.title = label;
        evArea.appendChild(pill);
      });

      // Overflow +N badges per column
      const overflowByCol = Array(7).fill(0);
      placed.filter(p=>p.row===-1).forEach(p => { p.cols.forEach(c=>overflowByCol[c]++); });
      overflowByCol.forEach((count,ci) => {
        if (!count) return;
        const badge = document.createElement("div");
        badge.className = "overflow-badge";
        badge.style.cssText = `left:${(ci*100/7).toFixed(4)}%;width:${(100/7).toFixed(4)}%`;
        badge.textContent = `+${count}`;
        evArea.appendChild(badge);
      });

      weekEl.appendChild(evArea);
      grid.appendChild(weekEl);
    }
  }

  // ── Navigation ─────────────────────────────────────────────
  function prevMonth() { if(--currentMonth<0){currentMonth=11;currentYear--;} loadAllEvents(); }
  function nextMonth() { if(++currentMonth>11){currentMonth=0;currentYear++;} loadAllEvents(); }
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
        disabledCals.has(cal.id) ? disabledCals.delete(cal.id) : disabledCals.add(cal.id);
        item.style.opacity = disabledCals.has(cal.id) ? "0.35" : "1";
        renderGrid();
      });
      legend.appendChild(item);
    });
  }

  // ── Modal ──────────────────────────────────────────────────
  function openModal() {
    const ts = today.toISOString().split("T")[0];
    ["ev-title"].forEach(id=>document.getElementById(id).value="");
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

  function closeModal() { document.getElementById("modal-overlay").style.display="none"; }

  async function saveEvent() {
    const title=document.getElementById("ev-title").value.trim();
    const startDate=document.getElementById("ev-start-date").value;
    const endDate=document.getElementById("ev-end-date").value;
    const allDay=document.getElementById("ev-allday").checked;
    const startTime=document.getElementById("ev-start-time").value;
    const endTime=document.getElementById("ev-end-time").value;
    const err=document.getElementById("form-error");
    err.style.display="none";
    if (!title){err.textContent="Please enter a title.";err.style.display="block";return;}
    if (!startDate||!endDate){err.textContent="Please select dates.";err.style.display="block";return;}
    if (endDate<startDate){err.textContent="End can't be before start.";err.style.display="block";return;}
    const btn=document.getElementById("modal-save");
    btn.disabled=true;btn.textContent="Saving…";
    try {
      const r=await fetch(ADD_EVENT_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,startDate,endDate,allDay,startTime,endTime})});
      const d=await r.json();
      if(d.success){document.getElementById("form-success").style.display="block";btn.textContent="Saved!";setTimeout(()=>{closeModal();loadAllEvents();},1500);}
      else{err.textContent=d.error||"Failed.";err.style.display="block";btn.disabled=false;btn.textContent="Save Event";}
    } catch(e){err.textContent="Network error.";err.style.display="block";btn.disabled=false;btn.textContent="Save Event";}
  }

  // ── UI init ────────────────────────────────────────────────
  function showCalendar() {
    document.getElementById("lock-screen").style.display="none";
    document.getElementById("cal-wrapper").style.display="block";
    buildLegend();
    loadAllEvents();
  }

  function init() {
    document.getElementById("site-name").textContent=CONFIG.siteName;
    const sub=document.getElementById("site-sub");
    if(CONFIG.siteSubtitle) sub.textContent=CONFIG.siteSubtitle; else sub.style.display="none";
    document.getElementById("site-header").style.background=CONFIG.headerColor;
    document.getElementById("pw-btn").addEventListener("click",checkPassword);
    document.getElementById("pw-input").addEventListener("keydown",e=>{if(e.key==="Enter")checkPassword();document.getElementById("pw-error").style.display="none";});
    document.getElementById("btn-prev").addEventListener("click",prevMonth);
    document.getElementById("btn-next").addEventListener("click",nextMonth);
    document.getElementById("btn-today").addEventListener("click",goToday);
    document.getElementById("btn-add-event").addEventListener("click",openModal);
    document.getElementById("modal-close").addEventListener("click",closeModal);
    document.getElementById("modal-cancel").addEventListener("click",closeModal);
    document.getElementById("modal-save").addEventListener("click",saveEvent);
    document.getElementById("modal-overlay").addEventListener("click",e=>{if(e.target===e.currentTarget)closeModal();});
    document.getElementById("ev-allday").addEventListener("change",function(){document.getElementById("time-fields").style.display=this.checked?"none":"block";});
    document.getElementById("ev-start-date").addEventListener("change",function(){if(document.getElementById("ev-end-date").value<this.value)document.getElementById("ev-end-date").value=this.value;});
    if(isAuthenticated()) showCalendar();
  }

  document.addEventListener("DOMContentLoaded",init);
})();
