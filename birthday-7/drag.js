/* Qazline 7: fixed dates, multiple publications per day.
   GitHub Pages is static: changes are local until shared with a URL. */
"use strict";
(function () {
  const originalIds = ITEMS.map(item => item.id);
  const days = ITEMS.map(item => item.date);
  const dayToIndex = new Map(days.map((date, index) => [date, index]));
  const deadlinesBeforeRelease = Object.fromEntries(ITEMS.map(item => [
    item.id,
    Math.round((Date.parse(item.date + "T00:00:00Z") - Date.parse(item.due + "T00:00:00Z")) / 86400000)
  ]));
  const storageKey = "qazline-anniversary-7-layout-v2";
  const oldStorageKey = "qazline-anniversary-7-layout-v1";
  let drag = null;
  let ignoreClickUntil = 0;

  function dateShift(iso, delta) {
    const date = new Date(iso + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
  }
  function assignmentsValid(entries) {
    if (!Array.isArray(entries) || entries.length !== originalIds.length) return false;
    const ids = entries.map(entry => entry[0]);
    return new Set(ids).size === originalIds.length
      && ids.every(id => originalIds.includes(id))
      && entries.every(([id, day]) => Number.isInteger(id) && Number.isInteger(day) && day >= 0 && day < days.length);
  }
  function parseLayout(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const parts = value.split("-");
    if (parts.length !== originalIds.length) return null;
    let entries;
    if (parts.every(part => /^\d+\.\d{1,2}$/.test(part))) {
      entries = parts.map(part => part.split(".").map(Number));
    } else if (parts.every(part => /^\d+$/.test(part))) {
      // Backward compatibility with V1 links: each position represented a fixed date.
      entries = parts.map((part, index) => [Number(part), index]);
    } else return null;
    return assignmentsValid(entries) ? entries : null;
  }
  function serialize() {
    return ITEMS.map(item => item.id + "." + dayToIndex.get(item.date)).join("-");
  }
  function apply(entries) {
    if (!assignmentsValid(entries)) return;
    const byIdMap = new Map(ITEMS.map(item => [item.id, item]));
    ITEMS.splice(0, ITEMS.length, ...entries.map(([id, dayIndex]) => {
      const item = byIdMap.get(id);
      item.date = days[dayIndex];
      item.due = dateShift(item.date, -deadlinesBeforeRelease[id]);
      return item;
    }));
    // Stable sorting preserves the order of multiple cards within the same day.
    ITEMS.sort((a, b) => a.date.localeCompare(b.date));
  }
  function redraw() {
    renderCalendar();
    renderTeam();
    renderAssets();
  }
  function persist() {
    const token = serialize();
    try { localStorage.setItem(storageKey, token); } catch (e) {}
    const params = new URLSearchParams(location.search);
    params.set("layout", token);
    history.replaceState(null, "", location.pathname + "?" + params.toString() + (location.hash || "#calendar"));
  }
  function sharedLink(person) {
    const url = new URL(location.href);
    url.searchParams.set("layout", serialize());
    if (person) url.searchParams.set("person", person);
    url.hash = person ? "team" : "calendar";
    return url.href;
  }
  window.getQazlineSharedPersonUrl = person => sharedLink(person);

  function moveContent(id, newDate) {
    const item = ITEMS.find(it => it.id === id);
    if (!item || !dayToIndex.has(newDate) || item.date === newDate) return false;
    const oldDate = item.date;
    ITEMS.splice(ITEMS.indexOf(item), 1);
    item.date = newDate;
    item.due = dateShift(newDate, -deadlinesBeforeRelease[id]);
    // Append to the target day after any existing content.
    ITEMS.push(item);
    ITEMS.sort((a, b) => a.date.localeCompare(b.date));
    persist();
    redraw();
    showToast("Перенесено с " + pretty(oldDate) + " на " + pretty(newDate) + ". Остальные публикации на месте");
    return true;
  }

  function resetLayout() {
    apply(originalIds.map((id, index) => [id, index]));
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(oldStorageKey);
    } catch (e) {}
    const params = new URLSearchParams(location.search);
    params.delete("layout");
    const query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + "#calendar");
    redraw();
    showToast("Восстановлен исходный план — по одной публикации в день");
  }

  function clearHover() {
    document.querySelectorAll(".day-slot.drop-target").forEach(el => el.classList.remove("drop-target"));
  }
  function updateHover() {
    if (!drag || !drag.active) return;
    clearHover();
    const element = document.elementFromPoint(drag.x, drag.y);
    const day = element && element.closest(".day-slot[data-day]");
    drag.targetDate = day && day.dataset.day !== drag.sourceDate ? day.dataset.day : null;
    if (drag.targetDate) day.classList.add("drop-target");
  }
  function scrollingLoop() {
    if (!drag) return;
    if (drag.active) {
      const margin = Math.min(105, innerHeight * .18);
      let speed = 0;
      if (drag.y < margin) speed = -Math.ceil((margin - drag.y) / margin * 12);
      else if (drag.y > innerHeight - margin) speed = Math.ceil((drag.y - (innerHeight - margin)) / margin * 12);
      if (speed) window.scrollBy(0, speed);
      updateHover();
    }
    drag.raf = requestAnimationFrame(scrollingLoop);
  }
  function clearDrag() {
    if (!drag) return;
    cancelAnimationFrame(drag.raf);
    drag.origin.classList.remove("drag-source");
    clearHover();
    drag.ghost?.remove();
    document.body.classList.remove("dragging-cards");
    drag = null;
  }
  function start(e) {
    const handle = e.target.closest(".drag-handle");
    if (!handle || (e.pointerType === "mouse" && e.button !== 0)) return;
    const card = handle.closest(".content-card[data-card]");
    const slot = handle.closest(".day-slot[data-day]");
    if (!card || !slot) return;
    e.preventDefault();
    clearDrag();
    drag = {
      pointerId: e.pointerId,
      fromId: Number(card.dataset.card),
      sourceDate: slot.dataset.day,
      origin: card,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: false,
      ghost: null,
      targetDate: null,
      raf: 0
    };
    try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    drag.raf = requestAnimationFrame(scrollingLoop);
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.active && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 8) return;
    if (!drag.active) {
      drag.active = true;
      drag.ghost = drag.origin.cloneNode(true);
      drag.ghost.classList.add("drag-ghost");
      document.body.appendChild(drag.ghost);
      drag.origin.classList.add("drag-source");
      document.body.classList.add("dragging-cards");
    }
    e.preventDefault();
    const width = Math.min(220, innerWidth * .72);
    drag.ghost.style.left = Math.max(8, Math.min(innerWidth - width - 8, drag.x + 12)) + "px";
    drag.ghost.style.top = Math.max(8, Math.min(innerHeight - 180, drag.y + 12)) + "px";
    updateHover();
  }
  function end(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const active = drag.active;
    const fromId = drag.fromId;
    const targetDate = drag.targetDate;
    clearDrag();
    if (active) {
      ignoreClickUntil = Date.now() + 400;
      if (targetDate) moveContent(fromId, targetDate);
      else showToast("Перетащите материал в ячейку другого дня");
    }
  }
  function bind() {
    const calendar = document.getElementById("calendarMount");
    calendar.addEventListener("pointerdown", start);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", clearDrag);
    window.addEventListener("blur", clearDrag);
    window.addEventListener("click", event => {
      if (event.target.closest(".drag-handle") || Date.now() < ignoreClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);

    // Keyboard alternative: move focused publication one day earlier/later.
    calendar.addEventListener("keydown", event => {
      const handle = event.target.closest(".drag-handle");
      if (!handle || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const card = handle.closest(".content-card[data-card]");
      const slot = handle.closest(".day-slot[data-day]");
      if (!card || !slot) return;
      const index = dayToIndex.get(slot.dataset.day);
      const next = index + (event.key === "ArrowRight" ? 1 : -1);
      if (next < 0 || next >= days.length) return;
      event.preventDefault();
      const id = Number(card.dataset.card);
      if (moveContent(id, days[next])) {
        calendar.querySelector('.drag-handle[data-drag="' + id + '"]')?.focus();
      }
    });
    document.getElementById("shareLayout").addEventListener("click", () => copyText(sharedLink()));
    document.getElementById("resetLayout").addEventListener("click", resetLayout);
  }

  const params = new URLSearchParams(location.search);
  let initial = parseLayout(params.get("layout"));
  if (!initial) {
    try { initial = parseLayout(localStorage.getItem(storageKey)); } catch (e) {}
  }
  if (!initial) {
    try {
      const oldIds = JSON.parse(localStorage.getItem(oldStorageKey));
      if (Array.isArray(oldIds)) initial = parseLayout(oldIds.join("-"));
    } catch (e) {}
  }
  if (initial) {
    apply(initial);
    redraw();
  }
  bind();
})();
