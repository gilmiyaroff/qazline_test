/* Qazline 7 — collaborative sharing via URL, local drag-and-drop.
   Static GitHub Pages: personal browser persistence only, no server writes. */
"use strict";
(function () {
  const originalIds = ITEMS.map(item => item.id);
  const originalDates = ITEMS.map(item => item.date);
  const storageKey = "qazline-anniversary-7-layout-v1";
  const gap = Object.fromEntries(ITEMS.map(item => [
    item.id,
    Math.round((Date.parse(item.date + "T00:00:00Z") - Date.parse(item.due + "T00:00:00Z")) / 86400000)
  ]));
  let drag = null;
  let ignoreClickUntil = 0;

  function dateShift(date, days) {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function validIds(input) {
    if (!Array.isArray(input) || input.length !== originalIds.length) return false;
    const ids = input.map(Number);
    return ids.every(id => originalIds.includes(id)) && new Set(ids).size === ids.length;
  }
  function parseLayout(raw) {
    const list = String(raw || "").split("-").map(Number);
    return validIds(list) ? list : null;
  }
  function applyLayout(ids) {
    if (!validIds(ids)) return;
    const map = new Map(ITEMS.map(item => [item.id, item]));
    ITEMS.splice(0, ITEMS.length, ...ids.map(id => map.get(Number(id))));
    ITEMS.forEach((item, i) => {
      item.date = originalDates[i];
      item.due = dateShift(item.date, -gap[item.id]);
    });
  }
  function currentIds() { return ITEMS.map(item => item.id); }
  function shareUrl(person) {
    const u = new URL(location.href);
    u.searchParams.set("layout", currentIds().join("-"));
    if (person) u.searchParams.set("person", person);
    u.hash = person ? "team" : "calendar";
    return u.href;
  }
  window.getQazlineSharedPersonUrl = person => shareUrl(person);

  function redraw() {
    renderCalendar();
    renderTeam();
    renderAssets();
  }
  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(currentIds())); } catch (e) {}
    const p = new URLSearchParams(location.search);
    p.set("layout", currentIds().join("-"));
    history.replaceState(null, "", location.pathname + "?" + p.toString() + (location.hash || "#calendar"));
  }
  function swap(fromId, toId) {
    if (fromId === toId) return;
    const from = ITEMS.find(item => item.id === fromId);
    const to = ITEMS.find(item => item.id === toId);
    if (!from || !to) return;
    const tempDate = from.date;
    from.date = to.date;
    to.date = tempDate;
    from.due = dateShift(from.date, -gap[from.id]);
    to.due = dateShift(to.date, -gap[to.id]);
    ITEMS.sort((a, b) => a.date.localeCompare(b.date));
    persist();
    redraw();
    showToast("Публикации поменялись датами. Новый порядок сохранён");
  }
  function resetLayout() {
    applyLayout(originalIds);
    try { localStorage.removeItem(storageKey); } catch (e) {}
    const params = new URLSearchParams(location.search);
    params.delete("layout");
    const query = params.toString();
    history.replaceState(null, "", location.pathname + (query ? "?" + query : "") + "#calendar");
    redraw();
    showToast("Исходный порядок восстановлен");
  }
  function updateHover() {
    if (!drag || !drag.active) return;
    document.querySelectorAll(".day.drop-target").forEach(el => el.classList.remove("drop-target"));
    const el = document.elementFromPoint(drag.x, drag.y);
    const target = el && el.closest(".day[data-card]");
    drag.targetId = target && Number(target.dataset.card) !== drag.fromId ? Number(target.dataset.card) : null;
    if (drag.targetId !== null) target.classList.add("drop-target");
  }
  function scrollingLoop() {
    if (!drag) return;
    if (drag.active) {
      const y = drag.y;
      const margin = Math.min(100, innerHeight * 0.18);
      let speed = 0;
      if (y < margin) speed = -Math.ceil((margin - y) / margin * 13);
      else if (y > innerHeight - margin) speed = Math.ceil((y - (innerHeight - margin)) / margin * 13);
      if (speed) window.scrollBy(0, speed);
      updateHover();
    }
    drag.raf = requestAnimationFrame(scrollingLoop);
  }
  function clearDrag() {
    if (!drag) return;
    cancelAnimationFrame(drag.raf);
    drag.origin.classList.remove("drag-source");
    document.querySelectorAll(".day.drop-target").forEach(el => el.classList.remove("drop-target"));
    if (drag.ghost) drag.ghost.remove();
    document.body.classList.remove("dragging-cards");
    drag = null;
  }
  function start(e) {
    const handle = e.target.closest(".drag-handle");
    if (!handle || (e.pointerType === "mouse" && e.button !== 0)) return;
    const origin = handle.closest(".day[data-card]");
    if (!origin) return;
    e.preventDefault();
    clearDrag();
    drag = {
      pointerId: e.pointerId, fromId: Number(origin.dataset.card), origin,
      startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
      active: false, ghost: null, targetId: null, raf: 0
    };
    drag.raf = requestAnimationFrame(scrollingLoop);
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.active && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 8) return;
    if (!drag.active) {
      drag.active = true;
      drag.ghost = drag.origin.cloneNode(true);
      drag.ghost.classList.remove("dim");
      drag.ghost.classList.add("drag-ghost");
      document.body.appendChild(drag.ghost);
      drag.origin.classList.add("drag-source");
      document.body.classList.add("dragging-cards");
    }
    e.preventDefault();
    const ghostWidth = Math.min(230, innerWidth * .72);
    drag.ghost.style.left = Math.max(8, Math.min(innerWidth - ghostWidth - 8, drag.x + 12)) + "px";
    drag.ghost.style.top = Math.max(8, Math.min(innerHeight - 175, drag.y + 12)) + "px";
    updateHover();
  }
  function end(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const active = drag.active;
    const source = drag.fromId;
    const target = drag.targetId;
    clearDrag();
    if (active) {
      ignoreClickUntil = Date.now() + 400;
      if (target !== null) swap(source, target);
      else showToast("Отпустите карточку над другой датой");
    }
  }
  function bind() {
    const grid = document.getElementById("calendarMount");
    grid.addEventListener("pointerdown", start);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", clearDrag);
    window.addEventListener("blur", clearDrag);
    window.addEventListener("click", e => {
      if (e.target.closest(".drag-handle") || Date.now() < ignoreClickUntil) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
    }, true);
    document.getElementById("shareLayout").addEventListener("click", () => copyText(shareUrl()));
    document.getElementById("resetLayout").addEventListener("click", resetLayout);
  }
  const params = new URLSearchParams(location.search);
  let initial = parseLayout(params.get("layout"));
  if (!initial) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (validIds(saved)) initial = saved;
    } catch (e) {}
  }
  if (initial) {
    applyLayout(initial);
    redraw();
  }
  bind();
})();
