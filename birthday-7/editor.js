/* Qazline · birthday content editor
   Editable publication texts, local persistence and optional shareable links.
   Static GitHub Pages: no server-side shared write access. */
"use strict";
(function () {
  const STORE = "qazline-birthday-7-content-edits-v1";
  const FIELDS = ["title", "short", "goal", "detail", "stories", "format", "assets", "people"];
  const initial = new Map(ITEMS.map(item => [item.id, snapshot(item)]));
  const modal = document.getElementById("detailModal");
  const root = document.getElementById("modalContent");

  function snapshot(item) {
    const copy = {};
    for (const key of FIELDS) {
      const value = item[key];
      copy[key] = key === "assets" ? [...value] : key === "people" ? {...value} : value;
    }
    return copy;
  }
  function cleanPatch(patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null;
    const cleaned = {};
    for (const key of FIELDS) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if (["title","short","goal","detail","stories"].includes(key) && typeof value === "string" && value.length < 20000) cleaned[key] = value;
      if (key === "format" && ["Reels","Карусель","Stories","Видео","Пост","Прямой эфир"].includes(value)) cleaned[key] = value;
      if (key === "assets" && Array.isArray(value) && value.length <= 100 && value.every(s => typeof s === "string" && s.length < 2000)) cleaned[key] = [...value];
      if (key === "people" && value && !Array.isArray(value) && typeof value === "object") {
        const roles = {};
        for (const [pid,text] of Object.entries(value)) {
          if (PEOPLE[pid] && typeof text === "string" && text.length < 12000) roles[pid] = text;
        }
        cleaned[key] = roles;
      }
    }
    return cleaned;
  }
  function currentPatches() {
    const result = {};
    for (const item of ITEMS) {
      const base = initial.get(item.id);
      const changed = {};
      for (const key of FIELDS) {
        if (JSON.stringify(item[key]) !== JSON.stringify(base[key])) changed[key] = key === "assets" ? [...item.assets] : key === "people" ? {...item.people} : item[key];
      }
      if (Object.keys(changed).length) result[item.id] = changed;
    }
    return result;
  }
  function applyPatches(patches) {
    if (!patches || typeof patches !== "object" || Array.isArray(patches)) return;
    for (const [rawId,entry] of Object.entries(patches)) {
      const id = Number(rawId);
      if (!initial.has(id)) continue;
      const item = ITEMS.find(it => it.id === id);
      const safe = cleanPatch(entry);
      if (!item || !safe) continue;
      for (const [key,value] of Object.entries(safe)) item[key] = value;
    }
  }
  function encodeEdits(data) {
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 4096) binary += String.fromCharCode(...bytes.subarray(i,i + 4096));
    return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }
  function decodeEdits(raw) {
    if (!raw || raw.length > 60000) return null;
    try {
      const b64 = raw.replace(/-/g,"+").replace(/_/g,"/");
      const bytes = atob(b64);
      const u8 = Uint8Array.from(bytes, c => c.charCodeAt(0));
      const data = JSON.parse(new TextDecoder().decode(u8));
      return data && typeof data === "object" ? data : null;
    } catch (e) {
      return null;
    }
  }
  function persist() {
    const changes = currentPatches();
    try {
      if (Object.keys(changes).length) localStorage.setItem(STORE, JSON.stringify(changes));
      else localStorage.removeItem(STORE);
    } catch (err) { showToast("Не удалось сохранить изменения в этом браузере"); }
  }
  function shareUrl(person, dayId) {
    const base = window.getQazlineBasePersonUrl ? window.getQazlineBasePersonUrl(person) : location.href;
    const url = new URL(base);
    if (person) { url.searchParams.set("person",person);url.hash="team"; }
    else url.hash=dayId?"day-"+dayId:"calendar";
    const changes = currentPatches();
    if (Object.keys(changes).length) url.searchParams.set("content",encodeEdits(changes));
    else url.searchParams.delete("content");
    return url.toString();
  }
  function shareEdits(person, dayId) {
    const url = shareUrl(person,dayId);
    if (url.length > 7000) {
      showToast("Ссылка слишком длинная. Используйте «Экспорт правок» для команды");
      return;
    }
    copyText(url);
  }
  function roleRow(pid,value) {
    return '<div class="edit-role" data-role-row="'+esc(pid)+'"><div class="edit-role-heading"><label for="role-'+esc(pid)+'">'+esc(PEOPLE[pid].name)+'</label><button type="button" class="remove-role" data-editor="removeRole" aria-label="Убрать участника '+esc(PEOPLE[pid].name)+'">Убрать</button></div><textarea class="edit-input edit-area" id="role-'+esc(pid)+'" data-role="'+esc(pid)+'" rows="3">'+esc(value)+'</textarea></div>';
  }
  function viewModal(item) {
    const roles=Object.entries(item.people).map(([pid,text])=>'<div class="role-line"><strong>'+esc(PEOPLE[pid]?.name||pid)+'</strong><span>'+esc(text)+'</span></div>').join("");
    const pos=1+Math.round((Date.parse(item.date+"T00:00:00Z")-Date.parse("2026-11-23T00:00:00Z"))/86400000);
    root.innerHTML =
      '<div class="modal-head"><span class="eyebrow">ДЕНЬ '+pos+' · '+pretty(item.date)+' · '+weekDay(item.date)+' · '+esc(item.format)+'</span>'+
      '<div class="modal-head-controls"><button type="button" class="modal-edit-launch" data-editor="edit" data-id="'+item.id+'">✎ Изменить</button><button type="button" class="modal-close" data-editor="close" aria-label="Закрыть">×</button></div>'+
      '<h2 id="modalTitle">'+esc(item.title)+'</h2><p>'+esc(item.short)+'</p></div>'+
      '<div class="modal-body"><h3>Что получает ученик</h3><div class="goal">'+esc(item.goal)+'</div>'+
      '<h3>Содержание публикации</h3><p class="edit-readable">'+esc(item.detail)+'</p>'+
      '<h3>Участники и конкретные задачи</h3>'+(roles||'<p class="edit-muted">Участники не назначены</p>')+
      '<h3>Какие материалы нужны · до '+pretty(item.due)+'</h3><ul>'+item.assets.map(t=>'<li>'+esc(t)+'</li>').join("")+'</ul>'+
      '<h3>Дополнительные Stories</h3><div class="story">'+esc(item.stories)+'</div>'+
      '<div class="modal-actions"><button type="button" class="orangebtn" data-action="copyTask" data-id="'+item.id+'">Скопировать ТЗ</button>'+
      '<button type="button" class="ghost" data-editor="shareDay" data-id="'+item.id+'">Поделиться карточкой</button>'+
      '<button type="button" class="ghost" data-editor="edit" data-id="'+item.id+'">✎ Редактировать</button>'+
      '<button type="button" class="ghost" data-editor="close">Закрыть</button></div></div>';
  }
  function editModal(item) {
    const pos=1+Math.round((Date.parse(item.date+"T00:00:00Z")-Date.parse("2026-11-23T00:00:00Z"))/86400000);
    const formatOptions=["Reels","Карусель","Stories","Видео","Пост","Прямой эфир"].map(f=>'<option value="'+esc(f)+'" '+(f===item.format?"selected":"")+'>'+esc(f)+'</option>').join("");
    const available=Object.keys(PEOPLE).filter(pid=>!(pid in item.people));
    root.innerHTML =
      '<div class="modal-head"><span class="eyebrow">РЕДАКТИРОВАНИЕ · '+pretty(item.date)+' · ДЕНЬ '+pos+'</span>'+
      '<div class="modal-head-controls"><button type="button" class="modal-close" data-editor="cancel" aria-label="Отменить редактирование">×</button></div>'+
      '<h2 id="modalTitle">Редактировать публикацию</h2><p>Исправьте текст и нажмите «Сохранить изменения».</p></div>'+
      '<div class="modal-body"><form id="publicationEditForm" data-edit-id="'+item.id+'">'+
      '<div class="edit-grid"><div class="edit-field"><label for="editFormat">Формат</label><select class="edit-input" id="editFormat" name="format">'+formatOptions+'</select></div>'+
      '<div class="edit-field"><label>Дата публикации</label><div class="edit-static">'+pretty(item.date)+' · меняется перетаскиванием</div></div></div>'+
      '<div class="edit-field"><label for="editTitle">Название публикации</label><input class="edit-input" id="editTitle" name="title" value="'+esc(item.title)+'" required maxlength="220"></div>'+
      '<div class="edit-field"><label for="editShort">Короткое описание</label><textarea class="edit-input edit-area" id="editShort" name="short" rows="2">'+esc(item.short)+'</textarea></div>'+
      '<div class="edit-field"><label for="editGoal">Что получает ученик</label><textarea class="edit-input edit-area" id="editGoal" name="goal" rows="3">'+esc(item.goal)+'</textarea></div>'+
      '<div class="edit-field"><label for="editDetail">Содержание публикации</label><textarea class="edit-input edit-area" id="editDetail" name="detail" rows="5">'+esc(item.detail)+'</textarea></div>'+
      '<div class="edit-field"><div class="edit-section-title">Задачи участников</div><div id="editRoles">'+Object.entries(item.people).map(([pid,t])=>roleRow(pid,t)).join("")+'</div>'+
      '<div class="add-role-controls"><select id="addRoleSelect" class="edit-input" aria-label="Добавить участника"><option value="">Добавить участника…</option>'+available.map(pid=>'<option value="'+esc(pid)+'">'+esc(PEOPLE[pid].name)+'</option>').join("")+'</select><button type="button" class="ghost" data-editor="addRole">Добавить</button></div></div>'+
      '<div class="edit-field"><label for="editAssets">Материалы для подготовки</label><div class="edit-muted">Один материал на каждой строке</div><textarea class="edit-input edit-area" id="editAssets" name="assets" rows="5">'+esc(item.assets.join("\n"))+'</textarea></div>'+
      '<div class="edit-field"><label for="editStories">Дополнительные Stories</label><textarea class="edit-input edit-area" id="editStories" name="stories" rows="3">'+esc(item.stories)+'</textarea></div>'+
      '<div class="edit-actions"><button type="submit" class="orangebtn">Сохранить изменения</button><button type="button" class="ghost" data-editor="cancel">Отмена</button></div>'+
      '<p class="edit-muted edit-saving-hint">Тексты сохраняются в вашем браузере. Для передачи команде скопируйте ссылку с правками или экспортируйте файл.</p></form></div>';
    root.querySelector("#editTitle")?.focus({preventScroll:true});
  }
  function saveForm(form) {
    const item=ITEMS.find(it=>it.id===Number(form.dataset.editId));
    if (!item) return;
    const title=form.querySelector('[name="title"]').value.trim();
    if (!title) { showToast("Название не может быть пустым");form.querySelector('[name="title"]').focus();return; }
    const roles={};
    form.querySelectorAll("[data-role]").forEach(field => {
      if (PEOPLE[field.dataset.role]) roles[field.dataset.role]=field.value.trim();
    });
    const next={
      title,
      short:form.querySelector('[name="short"]').value.trim(),
      goal:form.querySelector('[name="goal"]').value.trim(),
      detail:form.querySelector('[name="detail"]').value.trim(),
      format:form.querySelector('[name="format"]').value,
      stories:form.querySelector('[name="stories"]').value.trim(),
      assets:form.querySelector('[name="assets"]').value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),
      people:roles
    };
    const clean=cleanPatch(next);
    if (!clean) return;
    Object.assign(item,clean);
    persist();
    renderCalendar();
    renderTeam();
    renderAssets();
    viewModal(item);
    showToast("Карточка сохранена. Изменения отражены в календаре");
  }
  function exportEdits() {
    const json=JSON.stringify({type:"qazline-birthday-content",version:1,created:new Date().toISOString(),edits:currentPatches()},null,2);
    const blob=new Blob([json],{type:"application/json;charset=utf-8"});
    const href=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=href;a.download="qazline-birthday-content-edits.json";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(href),2000);
    showToast("Правки экспортированы");
  }
  async function importEdits(file) {
    if (!file) return;
    try {
      const text=await file.text();
      if (text.length>300000) throw new Error("large file");
      const raw=JSON.parse(text);
      if (!raw || raw.type!=="qazline-birthday-content" || raw.version!==1 || !raw.edits || typeof raw.edits!=="object") throw new Error("wrong format");
      if (!confirm("Импорт заменит ваши локальные текстовые правки. Продолжить?")) return;
      for (const item of ITEMS) Object.assign(item,snapshot(initial.get(item.id)));
      applyPatches(raw.edits);
      persist();
      renderCalendar();renderTeam();renderAssets();
      if (modal.open) {
        const id=Number(root.querySelector("[data-edit-id]")?.dataset.editId || root.querySelector("[data-id]")?.dataset.id);
        const it=ITEMS.find(x=>x.id===id);
        if (it) viewModal(it);
      }
      showToast("Правки импортированы");
    } catch (err) { showToast("Не удалось импортировать файл правок"); }
  }

  const params=new URLSearchParams(location.search);
  let incoming=decodeEdits(params.get("content"));
  if (!incoming) {
    try { incoming=JSON.parse(localStorage.getItem(STORE)); } catch (e) {}
  }
  if (incoming) {
    applyPatches(incoming);
    persist();
    renderCalendar();renderTeam();renderAssets();
  }

  const basePersonUrl=window.getQazlineSharedPersonUrl;
  window.getQazlineBasePersonUrl=basePersonUrl;
  window.getQazlineSharedPersonUrl=person=>shareUrl(person);

  window.openDetail=function(id) {
    const item=ITEMS.find(it=>it.id===Number(id));
    if (!item) return;
    viewModal(item);
    if (!modal.open) modal.showModal();
    history.replaceState(null,"",location.pathname+location.search+"#day-"+id);
  };

  // Capture our editor actions before the existing calendar card click handler.
  document.addEventListener("click",event=>{
    const action=event.target.closest("[data-editor]");
    if (action) {
      event.preventDefault();event.stopImmediatePropagation();
      const kind=action.dataset.editor;
      const id=Number(action.dataset.id || root.querySelector("[data-edit-id]")?.dataset.editId || root.querySelector("[data-id]")?.dataset.id);
      const item=ITEMS.find(it=>it.id===id);
      if (kind==="close") {modal.close();return}
      if (kind==="edit" && item) {editModal(item);return}
      if (kind==="cancel" && item) {viewModal(item);return}
      if (kind==="shareDay" && item) {shareEdits(null,item.id);return}
      if (kind==="removeRole") {action.closest(".edit-role")?.remove();return}
      if (kind==="addRole") {
        const select=root.querySelector("#addRoleSelect");
        const pid=select?.value;
        if (!pid || !PEOPLE[pid]) return;
        root.querySelector("#editRoles").insertAdjacentHTML("beforeend",roleRow(pid,""));
        select.querySelector('option[value="'+pid+'"]')?.remove();
        select.value="";
        root.querySelector('#editRoles [data-role="'+pid+'"]')?.focus();
        return;
      }
      if (kind==="export") {exportEdits();return}
      if (kind==="import") {document.getElementById("importEditsFile")?.click();return}
    }
    if (event.target.closest("#shareLayout")) {
      event.preventDefault();event.stopImmediatePropagation();
      shareEdits(null,null);
      return;
    }
    if (event.target.closest('[data-action="copyDay"]')) {
      const id=Number(event.target.closest("[data-id]")?.dataset.id);
      if (!id) return;
      event.preventDefault();event.stopImmediatePropagation();
      shareEdits(null,id);
    }
  },true);
  document.addEventListener("submit",event=>{
    if (event.target.id!=="publicationEditForm") return;
    event.preventDefault();event.stopPropagation();
    saveForm(event.target);
  },true);
  document.addEventListener("change",event=>{
    if (event.target.id==="importEditsFile") {
      importEdits(event.target.files?.[0]);
      event.target.value="";
    }
  },true);

  // Backup and restore are useful when a shared URL becomes too long.
  const toolbar=document.querySelector(".reorder-tools");
  if (toolbar) {
    toolbar.insertAdjacentHTML("beforeend",'<button type="button" class="ghost" data-editor="export">↓ Экспорт правок</button><button type="button" class="ghost" data-editor="import">↑ Импорт правок</button><input type="file" accept="application/json,.json" id="importEditsFile" class="visually-hidden-file">');
  }
})();