/* Portfolio Editor — connected UI for Projects / Achievements / Tools.
   Talks to the same backend as the portfolio site (same-origin /api/*). */

/* Auth model: the admin key is typed once and sent once, to /api/auth/login,
   which hands back a signed token that expires after 12 hours. Only that
   token is stored and sent afterwards — the actual key never sits in browser
   storage and never travels on ordinary requests, so a leaked token goes
   stale on its own and still can't be turned back into the password. */
const SESSION_STORAGE_KEY = "portfolio-admin-session";
let sessionToken = sessionStorage.getItem(SESSION_STORAGE_KEY) || "";
let currentSection = "project";
let currentCategories = [];

const SECTION_HINTS = {
  project: "Each heading becomes a swipeable row on the Projects page. Add tools/tags like \"HTML, CSS, JS, SQL\" to show them as chips.",
  achievement: "Group milestones under headings the same way as Projects — media is optional here.",
  tool: "Each tool is its own card. Group them under headings like \"Languages\" or \"Platforms & DevOps\"."
};

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
// Tab branding is public, including the locked editor page.
if(window.PortfolioFavicon) window.PortfolioFavicon.refresh();

const EDITOR_THEME_CLASSES = ["light-mode","dark-mode","mono-mode","cyber-mode","ocean-mode","violet-mode","amber-mode"];
const editorOsLight = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

function readSavedPortfolioMode(){
  const allowed = ["mono-light","colour-light","auto","cyber","ocean","violet","amber","colour-dark","mono-dark"];
  let saved = null;
  try{ saved = localStorage.getItem("portfolio-mode"); }catch(e){}
  if(allowed.includes(saved)) return saved;
  if(saved === "green") return "colour-dark";
  if(saved === "light") return "mono-light";
  if(saved === "system") return "auto";
  if(saved === "dark") return "mono-dark";
  let legacy = null;
  try{ legacy = localStorage.getItem("portfolio-theme"); }catch(e){}
  if(legacy === "light") return "colour-light";
  if(["cyber","ocean","violet","amber"].includes(legacy)) return legacy;
  if(legacy) return "colour-dark";
  return "auto";
}

function applyEditorTheme(){
  const mode = readSavedPortfolioMode();
  const osIsLight = !!(editorOsLight && editorOsLight.matches);
  const body = document.body;
  EDITOR_THEME_CLASSES.forEach(cls=>body.classList.remove(cls));
  let theme = "dark";
  if(mode === "mono-light"){
    body.classList.add("light-mode","mono-mode");
    theme = "mono-light";
  }else if(mode === "colour-light"){
    body.classList.add("light-mode");
    theme = "light";
  }else if(mode === "auto"){
    if(osIsLight){ body.classList.add("light-mode"); theme = "light"; }
  }else if(mode === "colour-dark"){
    body.classList.add("dark-mode");
    theme = "black";
  }else if(mode === "mono-dark"){
    body.classList.add("dark-mode","mono-mode");
    theme = "mono-dark";
  }else if(["cyber","ocean","violet","amber"].includes(mode)){
    body.classList.add(`${mode}-mode`);
    theme = mode;
  }
  body.dataset.theme = theme;
}

applyEditorTheme();
window.addEventListener("storage", e=>{
  if(e.key === "portfolio-mode" || e.key === "portfolio-theme") applyEditorTheme();
});
window.addEventListener("pageshow", applyEditorTheme);
window.addEventListener("focus", applyEditorTheme);
document.addEventListener("visibilitychange", ()=>{
  if(!document.hidden) applyEditorTheme();
});
if(editorOsLight){
  const refreshEditorTheme = ()=>{ if(readSavedPortfolioMode() === "auto") applyEditorTheme(); };
  if(editorOsLight.addEventListener) editorOsLight.addEventListener("change", refreshEditorTheme);
  else if(editorOsLight.addListener) editorOsLight.addListener(refreshEditorTheme);
}

function escapeHtml(str){
  return String(str==null?"":str).replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
async function api(path, options={}){
  const headers = Object.assign({}, options.headers||{});
  if(sessionToken) headers["Authorization"] = `Bearer ${sessionToken}`;
  const res = await fetch(path, Object.assign({}, options, {headers}));
  if(res.status===401){
    clearSession();
    showLogin("Your editor session expired — enter the key again.");
    throw new Error("unauthorized");
  }
  return res;
}

function clearSession(){
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  sessionToken="";
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function showLogin(message){
  $("#editorApp").hidden = true;
  $("#loginGate").hidden = false;
  const err = $("#loginError");
  if(message){ err.textContent = message; err.hidden = false; }
  else { err.hidden = true; }
  $("#adminKeyInput").value = "";
  $("#adminKeyInput").focus();
}

function showApp(){
  $("#loginGate").hidden = true;
  $("#editorApp").hidden = false;
  loadSection(currentSection);
}

async function tryAutoLogin(){
  if(!sessionToken){ showLogin(); return; }
  try{
    const res = await fetch("/api/admin/check", {headers:{Authorization:`Bearer ${sessionToken}`}});
    if(res.ok){ showApp(); return; }
  }catch(e){/* network error, fall through to login */}
  clearSession();
  showLogin();
}

$("#loginForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const key = $("#adminKeyInput").value.trim();
  if(!key) return;
  try{
    const res = await fetch("/api/auth/login", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({key})
    });
    if(!res.ok){
      showLogin("That key didn't work — check ADMIN_KEY on the server and try again.");
      return;
    }
    const data = await res.json();
    sessionToken = data.token;
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionToken);
    showApp();
  }catch(err){
    showLogin("Couldn't reach the server. Is the backend running?");
  }
});

$("#logoutBtn").addEventListener("click", ()=>{
  clearSession();
  showLogin();
});

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
$$(".editor-tab").forEach(tab=>{
  tab.addEventListener("click", ()=>{
    $$(".editor-tab").forEach(t=>t.classList.remove("active"));
    tab.classList.add("active");
    const section = tab.dataset.section;

    // "Site settings" and "World chat" are their own panes, not content sections
    const isSettings = section === "settings";
    const isChat = section === "chat";
    $("#contentPane").hidden = isSettings || isChat;
    $("#settingsPane").hidden = !isSettings;
    $("#chatPane").hidden = !isChat;
    if(isSettings){ loadSettings(); return; }
    if(isChat){ loadChatMessages(); return; }

    currentSection = section;
    loadSection(currentSection);
  });
});

// ---------------------------------------------------------------------------
// Site settings
//
// Every input in the settings pane carries data-setting="<key>", matching a
// key in the backend's DEFAULT_SETTINGS. Loading fills them from the API;
// saving sends back only those keys. To make something else on the site
// editable, add a default on the backend and an input here — no other code.
// ---------------------------------------------------------------------------
let settingsSnapshot = {};

async function loadSettings(){
  setSettingsStatus("Loading…");
  try{
    const res = await api("/api/settings");
    if(!res.ok) throw new Error("HTTP "+res.status);
    settingsSnapshot = await res.json();
    $$("[data-setting]").forEach(input=>{
      input.value = settingsSnapshot[input.dataset.setting] || "";
      if(input.tagName==="TEXTAREA") autoGrow(input);
    });
    renderUploadStates();
    socialRows = readSocialSetting();
    renderSocialRows();
    musicRows = readMusicSetting();
    renderMusicRows();
    discRows = readDiscSetting();
    renderDiscRows();
    setSettingsStatus("");
  }catch(err){
    if(err.message!=="unauthorized") setSettingsStatus("Couldn't load settings.", true);
  }
}

async function saveSettings(){
  const payload = {};
  $$("[data-setting]").forEach(input=>{ payload[input.dataset.setting] = input.value.trim(); });

  // Social links are a list, not a single input — drop rows with no link so
  // a half-filled row can't leave a dead icon on the site.
  payload.social_links = JSON.stringify(
    socialRows
      .map(r=>({title:(r.title||"").trim(), icon:(r.icon||"").trim(), url:(r.url||"").trim()}))
      .filter(r=>r.url)
  );

  // Same shape as the socials: rows with no link are dropped, so a
  // half-typed row can't become a dead entry in the player's queue.
  payload.music_playlist = JSON.stringify(
    musicRows
      .map(r=>({title:(r.title||"").trim(), url:(r.url||"").trim()}))
      .filter(r=>r.url)
  );

  payload.discoveries = JSON.stringify(
    discRows
      .map(r=>({
        tag:(r.tag||"").trim(),
        title:(r.title||"").trim(),
        context:(r.context||"").trim(),
        body:(r.body||"").trim(),
      }))
      .filter(r=>r.title || r.body)     // an entry with neither has nothing to show
  );

  const btn = $("#saveSettingsBtn");
  btn.disabled = true;
  setSettingsStatus("Saving…");
  try{
    const res = await api("/api/settings", {
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error("HTTP "+res.status);
    settingsSnapshot = await res.json();
    setSettingsStatus("Saved — reload the site to see it.");
  }catch(err){
    if(err.message!=="unauthorized") setSettingsStatus("Couldn't save: "+err.message, true);
  }finally{
    btn.disabled = false;
  }
}

function setSettingsStatus(text, isError){
  const el = $("#settingsStatus");
  if(!el) return;
  el.textContent = text || "";
  el.classList.toggle("error", !!isError);
  if(text && !isError){
    clearTimeout(el.__t);
    el.__t = setTimeout(()=>{ if(el.textContent===text) el.textContent=""; }, 3500);
  }
}

let faviconRenderRevision = 0;

/* Shows whether the resume slot is filled, and offers "Remove" only when
   there's something to remove. */
function renderUploadStates({broadcast=false}={}){
  const revision = ++faviconRenderRevision;
  const logo = (settingsSnapshot.favicon_url || "").trim();
  const preview = $("#faviconPreview");
  preview.hidden = true;
  preview.removeAttribute('src');
  $("#faviconDefault").hidden = false;
  $("#faviconState").textContent = logo ? "Loading saved icon…" : "No custom logo uploaded yet";
  document.querySelector('[data-clear="favicon_url"]').hidden = !logo;
  if(logo){
    const image=new Image();
    image.onload=()=>{
      if(revision!==faviconRenderRevision)return;
      preview.onload=()=>{
        if(revision!==faviconRenderRevision)return;
        preview.hidden=false;$("#faviconDefault").hidden=true;
        $("#faviconState").textContent="Circular tab icon saved";
      };
      preview.onerror=()=>{
        if(revision!==faviconRenderRevision)return;
        preview.hidden=true;$("#faviconDefault").hidden=false;
        $("#faviconState").textContent="Saved icon is unavailable. Please upload the photo again.";
      };
      preview.src=logo;
    };
    image.onerror=()=>{
      if(revision!==faviconRenderRevision)return;
      $("#faviconState").textContent="Saved icon is unavailable. Please upload the photo again.";
    };
    image.src=logo;
  }
  if(window.PortfolioFavicon)window.PortfolioFavicon.apply(logo,{broadcast});
  const rows = {
    resume_url: {el:$("#resumeState"), empty:"Not uploaded yet — the download button stays hidden"}
  };
  Object.entries(rows).forEach(([key, row])=>{
    if(!row.el) return;
    const value = (settingsSnapshot[key]||"").trim();
    row.el.innerHTML = value
      ? `<a href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(value.split("/").pop())}</a> · in use`
      : row.empty;
    const clearBtn = document.querySelector(`[data-clear="${key}"]`);
    if(clearBtn) clearBtn.hidden = !value;
  });
}

/* ---------------------------------------------------------------------------
   Social links — an add-your-own list rather than a fixed set of fields.
   Each row is {title, icon, url}; the whole list is stored as JSON in the
   single `social_links` setting, so adding a sixth or a tenth social needs
   no backend change at all. Rows can be reordered, which is the order they
   appear in on the site.
   --------------------------------------------------------------------------- */
let socialRows = [];

function readSocialSetting(){
  try{
    const parsed = JSON.parse(settingsSnapshot.social_links || "[]");
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){ return []; }
}

function renderSocialRows(){
  const host = $("#socialList");
  if(!host) return;
  if(!socialRows.length){
    host.innerHTML = `<p class="editor-hint" style="margin:0 0 12px">No social links yet — add one below.</p>`;
    return;
  }
  host.innerHTML = socialRows.map((row, i)=>`
    <div class="social-row" data-index="${i}">
      <div class="social-row-preview" title="Icon preview"><i class="${escapeHtml(row.icon||"fa-solid fa-link")}"></i></div>
      <div class="social-row-fields">
        <label class="field">Title
          <input type="text" data-social-field="title" value="${escapeHtml(row.title||"")}" placeholder="GitHub">
        </label>
        <label class="field">Icon <small>(Font Awesome class, or an image URL)</small>
          <input type="text" data-social-field="icon" value="${escapeHtml(row.icon||"")}" placeholder="fa-brands fa-github">
        </label>
        <label class="field">Link
          <input type="text" data-social-field="url" value="${escapeHtml(row.url||"")}" placeholder="https://github.com/yourname">
        </label>
      </div>
      <div class="social-row-actions">
        <button type="button" class="icon-btn social-up" title="Move up" ${i===0?"disabled":""}><i class="fa-solid fa-arrow-up"></i></button>
        <button type="button" class="icon-btn social-down" title="Move down" ${i===socialRows.length-1?"disabled":""}><i class="fa-solid fa-arrow-down"></i></button>
        <button type="button" class="icon-btn danger social-remove" title="Remove"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`).join("");

  host.querySelectorAll(".social-row").forEach(rowEl=>{
    const index = Number(rowEl.dataset.index);
    rowEl.querySelectorAll("[data-social-field]").forEach(input=>{
      input.addEventListener("input", ()=>{
        socialRows[index][input.dataset.socialField] = input.value;
        if(input.dataset.socialField==="icon"){
          const preview = rowEl.querySelector(".social-row-preview i");
          if(preview) preview.className = input.value.trim() || "fa-solid fa-link";
        }
      });
    });
    rowEl.querySelector(".social-up").addEventListener("click", ()=>moveSocial(index, index-1));
    rowEl.querySelector(".social-down").addEventListener("click", ()=>moveSocial(index, index+1));
    rowEl.querySelector(".social-remove").addEventListener("click", ()=>{
      socialRows.splice(index,1);
      renderSocialRows();
    });
  });
}

function moveSocial(from, to){
  if(to<0 || to>=socialRows.length) return;
  socialRows.splice(to, 0, socialRows.splice(from,1)[0]);
  renderSocialRows();
}

/* ---------------------------------------------------------------------------
   Master discoveries — practice notes, same add-your-own list pattern as the
   socials and the playlist, stored as JSON in one `discoveries` setting.
   --------------------------------------------------------------------------- */
let discRows = [];

function readDiscSetting(){
  try{
    const parsed = JSON.parse(settingsSnapshot.discoveries || "[]");
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){ return []; }
}

function renderDiscRows(){
  const host = $("#discRowList");
  if(!host) return;
  if(!discRows.length){
    host.innerHTML = `<p class="editor-hint" style="margin:0 0 12px">Nothing here yet — the section stays hidden until you add one.</p>`;
    return;
  }
  host.innerHTML = discRows.map((row, i)=>`
    <div class="social-row disc-row" data-index="${i}">
      <div class="social-row-preview" title="Discovery ${i+1}"><b>${String(i+1).padStart(2,"0")}</b></div>
      <div class="social-row-fields">
        <label class="field">Title
          <input type="text" data-disc-field="title" value="${escapeHtml(row.title||"")}" placeholder="Reproduce it before you fix it">
        </label>
        <label class="field">Tag <small>(one word — Debugging, Architecture, Frontend…)</small>
          <input type="text" data-disc-field="tag" value="${escapeHtml(row.tag||"")}" placeholder="Debugging">
        </label>
        <label class="field">Where you learned it
          <input type="text" data-disc-field="context" value="${escapeHtml(row.context||"")}" placeholder="Embedded firmware, intermittent sensor dropouts">
        </label>
        <label class="field">The lesson
          <textarea data-disc-field="body" rows="4" placeholder="What you learned, in a few sentences.">${escapeHtml(row.body||"")}</textarea>
        </label>
      </div>
      <div class="social-row-actions">
        <button type="button" class="icon-btn disc-up" title="Move up" ${i===0?"disabled":""}><i class="fa-solid fa-arrow-up"></i></button>
        <button type="button" class="icon-btn disc-down" title="Move down" ${i===discRows.length-1?"disabled":""}><i class="fa-solid fa-arrow-down"></i></button>
        <button type="button" class="icon-btn danger disc-remove" title="Remove"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`).join("");

  host.querySelectorAll(".disc-row").forEach(rowEl=>{
    const index = Number(rowEl.dataset.index);
    rowEl.querySelectorAll("[data-disc-field]").forEach(input=>{
      input.addEventListener("input", ()=>{
        discRows[index][input.dataset.discField] = input.value;
        if(input.tagName === "TEXTAREA") autoGrow(input);
      });
      if(input.tagName === "TEXTAREA") autoGrow(input);
    });
    rowEl.querySelector(".disc-up").addEventListener("click", ()=>moveDisc(index, index-1));
    rowEl.querySelector(".disc-down").addEventListener("click", ()=>moveDisc(index, index+1));
    rowEl.querySelector(".disc-remove").addEventListener("click", ()=>{
      discRows.splice(index,1);
      renderDiscRows();
    });
  });
}

function moveDisc(from, to){
  if(to<0 || to>=discRows.length) return;
  discRows.splice(to, 0, discRows.splice(from,1)[0]);
  renderDiscRows();
}

$("#addDiscBtn").addEventListener("click", ()=>{
  discRows.push({tag:"", title:"", context:"", body:""});
  renderDiscRows();
  const inputs = $$("#discRowList .social-row:last-child input");
  if(inputs[0]) inputs[0].focus();
});

/* ---------------------------------------------------------------------------
   Music playlist — the same add-your-own list pattern as the socials, stored
   as JSON in one `music_playlist` setting. Each row is {title, url}; the
   order here is the order tracks play in.
   --------------------------------------------------------------------------- */
let musicRows = [];

function readMusicSetting(){
  try{
    const parsed = JSON.parse(settingsSnapshot.music_playlist || "[]");
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){ return []; }
}

/* Mirrors the player's own parser so the editor can tell you a link is
   unusable at the moment you paste it, rather than silently dropping the
   track from the site later. */
function trackId(raw){
  const value = String(raw||"").trim();
  if(/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  const m = value.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function renderMusicRows(){
  const host = $("#musicRowList");
  if(!host) return;
  if(!musicRows.length){
    host.innerHTML = `<p class="editor-hint" style="margin:0 0 12px">No tracks yet — the player stays hidden until you add one.</p>`;
    return;
  }
  host.innerHTML = musicRows.map((row, i)=>{
    const id = trackId(row.url);
    const bad = row.url && !id;
    return `
    <div class="social-row${bad?" invalid":""}" data-index="${i}">
      <div class="social-row-preview" title="Track ${i+1}"><i class="fa-solid fa-music"></i>${
        /* The note icon sits underneath; the thumbnail covers it once it
           loads, and removes itself if it can't — so an offline editor or a
           deleted video shows the icon rather than a broken-image glyph. */
        id ? `<img src="https://i.ytimg.com/vi/${id}/default.jpg" alt="" loading="lazy" onerror="this.remove()">`
           : ""}</div>
      <div class="social-row-fields">
        <label class="field">Title <small>(optional — YouTube's own is used if blank)</small>
          <input type="text" data-music-field="title" value="${escapeHtml(row.title||"")}" placeholder="Track name">
        </label>
        <label class="field">YouTube link
          <input type="text" data-music-field="url" value="${escapeHtml(row.url||"")}" placeholder="https://www.youtube.com/watch?v=...">
        </label>
        ${bad ? `<p class="editor-hint" style="color:#ff8b8b;margin:0">That doesn't look like a YouTube link — this track would be skipped.</p>` : ""}
      </div>
      <div class="social-row-actions">
        <button type="button" class="icon-btn music-up" title="Move up" ${i===0?"disabled":""}><i class="fa-solid fa-arrow-up"></i></button>
        <button type="button" class="icon-btn music-down" title="Move down" ${i===musicRows.length-1?"disabled":""}><i class="fa-solid fa-arrow-down"></i></button>
        <button type="button" class="icon-btn danger music-remove" title="Remove"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
  }).join("");

  host.querySelectorAll(".social-row").forEach(rowEl=>{
    const index = Number(rowEl.dataset.index);
    rowEl.querySelectorAll("[data-music-field]").forEach(input=>{
      input.addEventListener("input", ()=>{
        musicRows[index][input.dataset.musicField] = input.value;
      });
      // Re-render on blur, not on every keystroke: repainting mid-type would
      // steal the caret out of the field being edited.
      if(input.dataset.musicField === "url"){
        input.addEventListener("blur", renderMusicRows);
      }
    });
    rowEl.querySelector(".music-up").addEventListener("click", ()=>moveTrack(index, index-1));
    rowEl.querySelector(".music-down").addEventListener("click", ()=>moveTrack(index, index+1));
    rowEl.querySelector(".music-remove").addEventListener("click", ()=>{
      musicRows.splice(index,1);
      renderMusicRows();
    });
  });
}

function moveTrack(from, to){
  if(to<0 || to>=musicRows.length) return;
  musicRows.splice(to, 0, musicRows.splice(from,1)[0]);
  renderMusicRows();
}

$("#addTrackBtn").addEventListener("click", ()=>{
  musicRows.push({title:"", url:""});
  renderMusicRows();
  const inputs = $$("#musicRowList .social-row:last-child input");
  if(inputs[0]) inputs[0].focus();
});

$("#addSocialBtn").addEventListener("click", ()=>{
  socialRows.push({title:"", icon:"", url:""});
  renderSocialRows();
  const inputs = $$("#socialList .social-row:last-child input");
  if(inputs[0]) inputs[0].focus();
});

/* ---------------------------------------------------------------------------
   World chat moderation. Read-only apart from deleting: the owner shouldn't
   be posting from the admin panel, just cleaning up after visitors.
   --------------------------------------------------------------------------- */
async function loadChatMessages(){
  const host = $("#chatModList");
  host.innerHTML = `<p class="editor-hint">Loading…</p>`;
  try{
    const res = await api("/api/chat?limit=200");
    if(!res.ok) throw new Error("HTTP "+res.status);
    const messages = (await res.json()).reverse();   // newest first for moderation
    if(!messages.length){
      host.innerHTML = `<p class="editor-hint">No messages yet.</p>`;
      return;
    }
    host.innerHTML = messages.map(m=>`
      <div class="chat-mod-row" data-id="${m.id}">
        <div class="chat-mod-body">
          <strong>${escapeHtml(m.name)}</strong>
          <span>${escapeHtml(m.body)}</span>
        </div>
        <button type="button" class="icon-btn danger chat-mod-delete" title="Delete this message"><i class="fa-solid fa-trash"></i></button>
      </div>`).join("");
    host.querySelectorAll(".chat-mod-row").forEach(row=>{
      row.querySelector(".chat-mod-delete").addEventListener("click", async ()=>{
        await api(`/api/chat/${row.dataset.id}`, {method:"DELETE"});
        loadChatMessages();
      });
    });
  }catch(err){
    if(err.message!=="unauthorized") host.innerHTML = `<p class="editor-hint">Couldn't load the chat.</p>`;
  }
}

$("#clearChatBtn").addEventListener("click", async ()=>{
  if(!confirm("Delete every message in the World Chat? This can't be undone.")) return;
  await api("/api/chat", {method:"DELETE"});
  loadChatMessages();
});

/* One hidden file input is reused by all three upload buttons, so the raw
   browser "Choose File" control is never visible anywhere in the editor. */
$$("[data-upload]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const input = $("#settingsFileInput");
    input.accept = btn.dataset.accept || "";
    input.dataset.targetKey = btn.dataset.upload;
    input.value = "";
    input.click();
  });
});

$("#settingsFileInput").addEventListener("change", async e=>{
  const input = e.target;
  const file = input.files[0];
  const key = input.dataset.targetKey;
  if(!file || !key) return;

  setSettingsStatus(`Uploading ${file.name}…`);
  const fd = new FormData();
  fd.append("key", key);
  fd.append("file", file);
  try{
    if(key==='favicon_url'){
      if(file.size>5*1024*1024)throw new Error('The icon must be 5 MB or smaller.');
      await new Promise((resolve,reject)=>{
        const url=URL.createObjectURL(file),image=new Image();
        image.onload=()=>{URL.revokeObjectURL(url);resolve();};
        image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('This image cannot be opened. Choose a PNG, JPG, WebP or ICO.'));};
        image.src=url;
      });
    }
    const res = await api("/api/settings/upload", {method:"POST", body: fd});
    if(!res.ok){
      const detail = await res.json().catch(()=>({}));
      throw new Error(detail.detail || ("HTTP "+res.status));
    }
    const data = await res.json();
    settingsSnapshot[key] = data.value;
    renderUploadStates({broadcast:key==="favicon_url"});
    setSettingsStatus("Uploaded.");
  }catch(err){
    if(err.message!=="unauthorized") setSettingsStatus("Upload failed: "+err.message, true);
  }
});

$$("[data-clear]").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    const key = btn.dataset.clear;
    try{
      const res = await api("/api/settings", {
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({[key]: ""})
      });
      if(!res.ok) throw new Error("HTTP "+res.status);
      settingsSnapshot = await res.json();
      renderUploadStates({broadcast:key==="favicon_url"});
      setSettingsStatus("Removed.");
    }catch(err){
      if(err.message!=="unauthorized") setSettingsStatus("Couldn't remove: "+err.message, true);
    }
  });
});

$("#saveSettingsBtn").addEventListener("click", saveSettings);

// ---------------------------------------------------------------------------
// Load + render a section
// ---------------------------------------------------------------------------
async function loadSection(section){
  $("#sectionHint").textContent = SECTION_HINTS[section] || "";
  const list = $("#categoriesList");
  list.innerHTML = `<p class="editor-hint">Loading…</p>`;
  try{
    const res = await api(`/api/content/${encodeURIComponent(section)}`);
    if(!res.ok) throw new Error("HTTP "+res.status);
    currentCategories = await res.json();
    renderCategories();
  }catch(err){
    if(err.message==="unauthorized") return;
    list.innerHTML = `<p class="editor-hint">Couldn't load this section. Is the backend running?</p>`;
  }
}

function mediaThumb(item){
  if(item.media_type==="image"){
    return `<div class="item-row-media"><img src="${escapeHtml(item.media_url)}" alt=""></div>`;
  }
  if(item.media_type==="video_file"){
    return `<div class="item-row-media"><i class="fa-solid fa-film"></i></div>`;
  }
  if(item.media_type==="video_link"){
    return `<div class="item-row-media"><i class="fa-brands fa-youtube"></i></div>`;
  }
  if(item.media_type==="link"){
    return `<div class="item-row-media" title="${escapeHtml(item.media_url)}"><i class="fa-solid fa-link"></i></div>`;
  }
  return `<div class="item-row-media"><i class="fa-regular fa-file"></i></div>`;
}

function renderCategories(){
  const list = $("#categoriesList");
  if(!currentCategories.length){
    list.innerHTML = `<p class="editor-hint">No headings yet — add one above to start grouping items (e.g. "Embedded Systems", "Web Apps").</p>`;
    return;
  }
  list.innerHTML = "";
  currentCategories.forEach((cat, catIndex)=>{
    const block = document.createElement("div");
    block.className = "category-block";
    block.dataset.id = cat.id;

    const head = document.createElement("div");
    head.className = "category-block-head";
    head.innerHTML = `
      <span class="drag-handle cat-drag" title="Drag to reorder this heading" draggable="true"><i class="fa-solid fa-grip-vertical"></i></span>
      <input type="text" class="category-name-input" value="${escapeHtml(cat.name)}">
      <div class="category-actions">
        <button type="button" class="icon-btn cat-move-up" title="Move heading up" ${catIndex===0?"disabled":""}><i class="fa-solid fa-arrow-up"></i></button>
        <button type="button" class="icon-btn cat-move-down" title="Move heading down" ${catIndex===currentCategories.length-1?"disabled":""}><i class="fa-solid fa-arrow-down"></i></button>
        <button type="button" class="text-btn cat-add-item">+ Add item</button>
        <button type="button" class="icon-btn danger cat-delete" title="Delete heading"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    block.appendChild(head);

    const nameInput = head.querySelector(".category-name-input");
    nameInput.addEventListener("change", async ()=>{
      const name = nameInput.value.trim();
      if(!name){ nameInput.value = cat.name; return; }
      await api(`/api/categories/${cat.id}`, {
        method:"PUT",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({name})
      });
      cat.name = name;
    });

    head.querySelector(".cat-move-up").addEventListener("click", ()=>swapCategory(catIndex, catIndex-1));
    head.querySelector(".cat-move-down").addEventListener("click", ()=>swapCategory(catIndex, catIndex+1));
    head.querySelector(".cat-delete").addEventListener("click", ()=>deleteCategory(cat));
    head.querySelector(".cat-add-item").addEventListener("click", ()=>openItemModal({categoryId: cat.id, category: cat}));

    const itemsRow = document.createElement("div");
    itemsRow.className = "items-row";
    if(!cat.items.length){
      itemsRow.innerHTML = `<span class="category-empty">No items yet.</span>`;
    } else {
      cat.items.forEach((item, itemIndex)=>{
        const row = document.createElement("div");
        row.className = "item-row";
        row.draggable = true;
        row.dataset.itemIndex = itemIndex;
        row.dataset.categoryId = cat.id;
        row.innerHTML = `
          <span class="drag-handle" title="Drag to reorder"><i class="fa-solid fa-grip-vertical"></i></span>
          ${mediaThumb(item)}
          <div class="item-row-body">
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.tools || item.description || "")}</span>
          </div>
          <div class="item-row-actions">
            <button type="button" class="icon-btn item-move-left" title="Move left" ${itemIndex===0?"disabled":""}><i class="fa-solid fa-arrow-left"></i></button>
            <button type="button" class="icon-btn item-move-right" title="Move right" ${itemIndex===cat.items.length-1?"disabled":""}><i class="fa-solid fa-arrow-right"></i></button>
            <button type="button" class="icon-btn item-edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
          </div>`;
        row.querySelector(".item-move-left").addEventListener("click", ()=>swapItem(cat, itemIndex, itemIndex-1));
        row.querySelector(".item-move-right").addEventListener("click", ()=>swapItem(cat, itemIndex, itemIndex+1));
        row.querySelector(".item-edit").addEventListener("click", ()=>openItemModal({categoryId: cat.id, category: cat, item}));
        itemsRow.appendChild(row);
      });
    }
    const addChip = document.createElement("button");
    addChip.type = "button";
    addChip.className = "add-item-chip";
    addChip.innerHTML = `+ Add item`;
    addChip.addEventListener("click", ()=>openItemModal({categoryId: cat.id, category: cat}));
    itemsRow.appendChild(addChip);

    wireItemDragging(itemsRow, cat);
    block.appendChild(itemsRow);
    block.dataset.catIndex = catIndex;
    wireCategoryDragging(block, catIndex);
    list.appendChild(block);
  });
}

/* ---------------------------------------------------------------------------
   Drag to reorder
   The arrow buttons still work (and are the accessible path — dragging isn't
   keyboard-operable), this just adds the faster way to move things. Both
   handlers do the same thing: work out the from/to positions, reorder the
   local array, then persist the new order in one pass via reorder*().
   --------------------------------------------------------------------------- */
let dragFrom = null;

function wireItemDragging(itemsRow, cat){
  itemsRow.querySelectorAll(".item-row").forEach(row=>{
    row.addEventListener("dragstart", e=>{
      dragFrom = {type:"item", categoryId: cat.id, index: Number(row.dataset.itemIndex)};
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "item");
    });
    row.addEventListener("dragend", ()=>{
      row.classList.remove("dragging");
      itemsRow.querySelectorAll(".item-row").forEach(r=>r.classList.remove("drop-target"));
      dragFrom = null;
    });
    row.addEventListener("dragover", e=>{
      if(!dragFrom || dragFrom.type!=="item" || dragFrom.categoryId!==cat.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      row.classList.add("drop-target");
    });
    row.addEventListener("dragleave", ()=>row.classList.remove("drop-target"));
    row.addEventListener("drop", e=>{
      if(!dragFrom || dragFrom.type!=="item" || dragFrom.categoryId!==cat.id) return;
      e.preventDefault();
      row.classList.remove("drop-target");
      const to = Number(row.dataset.itemIndex);
      if(to!==dragFrom.index) reorderItems(cat, dragFrom.index, to);
    });
  });
}

function wireCategoryDragging(block, catIndex){
  const handle = block.querySelector(".cat-drag");
  if(!handle) return;
  handle.addEventListener("dragstart", e=>{
    dragFrom = {type:"category", index: catIndex};
    block.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "category");
  });
  handle.addEventListener("dragend", ()=>{
    block.classList.remove("dragging");
    $$(".category-block").forEach(b=>b.classList.remove("drop-target"));
    dragFrom = null;
  });
  block.addEventListener("dragover", e=>{
    if(!dragFrom || dragFrom.type!=="category") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    block.classList.add("drop-target");
  });
  block.addEventListener("dragleave", ()=>block.classList.remove("drop-target"));
  block.addEventListener("drop", e=>{
    if(!dragFrom || dragFrom.type!=="category") return;
    e.preventDefault();
    block.classList.remove("drop-target");
    const to = Number(block.dataset.catIndex);
    if(to!==dragFrom.index) reorderCategories(dragFrom.index, to);
  });
}

/* After a drag, sort_order is rewritten as a clean 0,1,2,… sequence for the
   whole list rather than swapping two values — moving an item three places
   isn't a swap, and renumbering keeps the orders from drifting over time. */
async function reorderItems(cat, from, to){
  const items = cat.items.slice();
  items.splice(to, 0, items.splice(from, 1)[0]);
  await Promise.all(items.map((item, index)=>
    api(`/api/items/${item.id}`, {method:"PUT", body: formFrom({sort_order: index})})
  ));
  loadSection(currentSection);
}

async function reorderCategories(from, to){
  const cats = currentCategories.slice();
  cats.splice(to, 0, cats.splice(from, 1)[0]);
  await Promise.all(cats.map((cat, index)=>
    api(`/api/categories/${cat.id}`, {
      method:"PUT",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({sort_order: index})
    })
  ));
  loadSection(currentSection);
}

async function swapCategory(i, j){
  if(j<0 || j>=currentCategories.length) return;
  const a = currentCategories[i], b = currentCategories[j];
  const aOrder = a.sort_order, bOrder = b.sort_order;
  await Promise.all([
    api(`/api/categories/${a.id}`, {method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify({sort_order: bOrder})}),
    api(`/api/categories/${b.id}`, {method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify({sort_order: aOrder})})
  ]);
  loadSection(currentSection);
}

async function deleteCategory(cat){
  if(!confirm(`Delete "${cat.name}" and all ${cat.items.length} item(s) inside it? This can't be undone.`)) return;
  await api(`/api/categories/${cat.id}`, {method:"DELETE"});
  loadSection(currentSection);
}

async function swapItem(cat, i, j){
  if(j<0 || j>=cat.items.length) return;
  const a = cat.items[i], b = cat.items[j];
  const aOrder = a.sort_order, bOrder = b.sort_order;
  await Promise.all([
    api(`/api/items/${a.id}`, {method:"PUT", body: formFrom({sort_order: bOrder})}),
    api(`/api/items/${b.id}`, {method:"PUT", body: formFrom({sort_order: aOrder})})
  ]);
  loadSection(currentSection);
}

function formFrom(obj){
  const fd = new FormData();
  Object.entries(obj).forEach(([k,v])=>{ if(v!==undefined && v!==null) fd.append(k, v); });
  return fd;
}

// ---------------------------------------------------------------------------
// Add category
// ---------------------------------------------------------------------------
$("#addCategoryForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const input = $("#newCategoryName");
  const name = input.value.trim();
  if(!name) return;
  await api("/api/categories", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({section: currentSection, name, sort_order: currentCategories.length})
  });
  input.value = "";
  loadSection(currentSection);
});

// ---------------------------------------------------------------------------
// Item modal (add / edit)
// ---------------------------------------------------------------------------
const modal = $("#itemModal");
let modalState = {mode:"create", categoryId:null, itemId:null, category:null};

function openItemModal({categoryId, category, item}){
  modalState = {mode: item ? "edit":"create", categoryId, itemId: item?item.id:null, category};
  $("#itemModalTitle").textContent = item ? "Edit item" : "Add item";
  $("#itemId").value = item ? item.id : "";
  $("#itemCategoryId").value = categoryId;
  $("#itemTitle").value = item ? item.title : "";
  $("#itemDescription").value = item ? item.description : "";
  $("#itemTools").value = item ? item.tools : "";
  $("#itemFile").value = "";
  $("#itemFileName").textContent = "No file chosen";
  $("#itemVideoUrl").value = "";
  $("#itemFormError").hidden = true;

  const preview = $("#currentMediaPreview");
  const clearWrap = $("#clearMediaWrap");
  $("#itemClearMedia").checked = false;
  if(item && item.media_url){
    clearWrap.hidden = false;
    const safeUrl = escapeHtml(item.media_url);
    if(item.media_type==="image"){
      preview.innerHTML = `<img src="${safeUrl}" alt=""><span class="preview-meta">Shows as a picture on the card</span>`;
    } else if(item.media_type==="video_file"){
      preview.innerHTML = `<video src="${safeUrl}" controls></video><span class="preview-meta">Plays inline on the card</span>`;
    } else if(item.media_type==="video_link"){
      preview.innerHTML = `<span class="preview-meta">Embedded video player · <a href="${safeUrl}" target="_blank" rel="noopener">${safeUrl}</a></span>`;
      // put the URL back in the box so it can be edited rather than retyped
      $("#itemVideoUrl").value = item.media_url;
    } else if(item.media_type==="link"){
      preview.innerHTML = `<span class="preview-meta">Clickable link on the card · <a href="${safeUrl}" target="_blank" rel="noopener">${safeUrl}</a></span>`;
      $("#itemVideoUrl").value = item.media_url;
    } else {
      preview.innerHTML = "";
    }
  } else {
    preview.innerHTML = "";
    clearWrap.hidden = true;
  }

  $("#itemDeleteBtn").hidden = !item;
  $("#draftNote").hidden = true;
  modal.hidden = false;
  document.body.classList.add("modal-open");   // freeze the page behind it
  restoreDraft();   // must run after the fields are populated, so a draft wins
  autoGrow($("#itemDescription"));   // size to the text now it's populated
  $("#itemTitle").focus();
}

function closeItemModal(){
  clearPendingPreview();
  modal.hidden = true;
  document.body.classList.remove("modal-open");   // always restore scrolling
}

$("#itemModalClose").addEventListener("click", closeItemModal);
modal.addEventListener("click", e=>{ if(e.target===modal) closeItemModal(); });
document.addEventListener("keydown", e=>{ if(e.key==="Escape" && !modal.hidden) closeItemModal(); });

/* The upload button and the link box are both always visible now — the old
   tab pair just added a click between you and the thing you wanted. Whichever
   you fill in is the one that's used; the file wins if you somehow do both. */
$("#itemFileBtn").addEventListener("click", ()=>$("#itemFile").click());

/* ---------------------------------------------------------------------------
   Auto-growing textareas.

   A fixed-height textarea gets its own scrollbar once the text outruns it,
   and that inner scroller swallows the wheel/swipe: scrolling with the
   pointer over the description field moves the text inside it instead of
   the form, so the fields below look unreachable. Growing the textarea to
   fit its content means it never scrolls internally, so the gesture always
   scrolls whatever contains it — and you can see the whole description
   while editing it, which is what you want anyway.
   --------------------------------------------------------------------------- */
function autoGrow(textarea){
  if(!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}

function wireAutoGrow(textarea){
  if(!textarea || textarea.dataset.autogrow) return;
  textarea.dataset.autogrow = "1";
  textarea.addEventListener("input", ()=>autoGrow(textarea));
}

$$("textarea").forEach(wireAutoGrow);

/* ---------------------------------------------------------------------------
   Upload preview — see the picture before saving, not after.
   Reads the chosen file straight from the browser (URL.createObjectURL, no
   upload yet), so you can catch a wrong file or a sideways photo before it
   ever reaches the server. The URL is revoked when it's replaced, so
   selecting file after file doesn't leak memory.
   --------------------------------------------------------------------------- */
let pendingPreviewUrl = null;

function clearPendingPreview(){
  if(pendingPreviewUrl){ URL.revokeObjectURL(pendingPreviewUrl); pendingPreviewUrl = null; }
}

$("#itemFile").addEventListener("change", ()=>{
  const file = $("#itemFile").files[0];
  const preview = $("#currentMediaPreview");
  clearPendingPreview();
  $("#itemFileName").textContent = file ? file.name : "No file chosen";
  if(!file){ return; }
  pendingPreviewUrl = URL.createObjectURL(file);
  const sizeMb = (file.size/1024/1024).toFixed(1);
  const tooBig = file.size > 25*1024*1024;
  const meta = `<span class="preview-meta${tooBig?" over":""}">${escapeHtml(file.name)} · ${sizeMb} MB${tooBig?" — over the 25 MB limit, this will be rejected":""}</span>`;
  preview.innerHTML = file.type.startsWith("video/")
    ? `<video src="${pendingPreviewUrl}" controls></video>${meta}`
    : `<img src="${pendingPreviewUrl}" alt="Preview of the file about to be uploaded">${meta}`;
});

/* ---------------------------------------------------------------------------
   Draft autosave — nothing typed is lost to a closed tab or a stray Escape.
   The open form is saved to localStorage as you type and restored the next
   time the same item (or a new item in the same heading) is opened. Cleared
   as soon as the item saves successfully. Text only: a chosen file can't be
   stored this way, so the file picker is always left for you to redo.
   --------------------------------------------------------------------------- */
const DRAFT_PREFIX = "portfolio-editor-draft:";

function draftKey(){
  return `${DRAFT_PREFIX}${modalState.mode}:${modalState.itemId || modalState.categoryId}`;
}

function saveDraft(){
  if(modal.hidden) return;
  try{
    localStorage.setItem(draftKey(), JSON.stringify({
      title: $("#itemTitle").value,
      description: $("#itemDescription").value,
      tools: $("#itemTools").value,
      videoUrl: $("#itemVideoUrl").value,
      at: Date.now()
    }));
    showDraftNote("Draft saved");
  }catch(e){/* storage full or blocked — autosave is a nicety, never fatal */}
}

function clearDraft(){
  try{ localStorage.removeItem(draftKey()); }catch(e){}
}

function restoreDraft(){
  let draft=null;
  try{ draft = JSON.parse(localStorage.getItem(draftKey())||"null"); }catch(e){}
  if(!draft) return false;
  // Ignore anything older than a week — that's abandoned, not in-progress.
  if(Date.now()-(draft.at||0) > 7*24*60*60*1000){ clearDraft(); return false; }
  $("#itemTitle").value = draft.title||"";
  $("#itemDescription").value = draft.description||"";
  $("#itemTools").value = draft.tools||"";
  if(draft.videoUrl) $("#itemVideoUrl").value = draft.videoUrl;
  showDraftNote("Unsaved draft restored");
  return true;
}

function showDraftNote(text){
  const note = $("#draftNote");
  if(!note) return;
  note.textContent = text;
  note.hidden = false;
  clearTimeout(note.__t);
  note.__t = setTimeout(()=>{ note.hidden = true; }, 2200);
}

["#itemTitle","#itemDescription","#itemTools","#itemVideoUrl"].forEach(sel=>{
  const el = $(sel);
  if(!el) return;
  el.addEventListener("input", ()=>{
    clearTimeout(window.__draftT);
    window.__draftT = setTimeout(saveDraft, 700);
  });
});

$("#itemForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const errEl = $("#itemFormError");
  errEl.hidden = true;

  const title = $("#itemTitle").value.trim();
  if(!title){ errEl.textContent="Title is required."; errEl.hidden=false; return; }

  const fd = new FormData();
  fd.append("title", title);
  fd.append("description", $("#itemDescription").value);
  fd.append("tools", $("#itemTools").value);

  /* No tabs any more: whichever of the two is filled in gets used. A chosen
     file wins over a pasted link, since picking a file is the more
     deliberate action of the two. */
  const file = $("#itemFile").files[0];
  const videoUrl = $("#itemVideoUrl").value.trim();
  if(file){
    fd.append("file", file);
  } else if(videoUrl){
    fd.append("video_url", videoUrl);
  } else if($("#itemClearMedia").checked){
    fd.append("clear_media", "true");
  }

  const saveBtn = $("#itemSaveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";
  try{
    let res;
    if(modalState.mode==="create"){
      fd.append("category_id", modalState.categoryId);
      fd.append("sort_order", modalState.category ? modalState.category.items.length : 0);
      res = await api("/api/items", {method:"POST", body: fd});
    } else {
      res = await api(`/api/items/${modalState.itemId}`, {method:"PUT", body: fd});
    }
    if(!res.ok){
      const detail = await res.json().catch(()=>({}));
      throw new Error(detail.detail || ("HTTP "+res.status));
    }
    clearDraft();   // saved for real now — the local copy is no longer needed
    closeItemModal();
    loadSection(currentSection);
  }catch(err){
    if(err.message!=="unauthorized"){
      errEl.textContent = "Couldn't save: " + err.message;
      errEl.hidden = false;
    }
  }finally{
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
  }
});

$("#itemDeleteBtn").addEventListener("click", async ()=>{
  if(!modalState.itemId) return;
  if(!confirm("Delete this item? This can't be undone.")) return;
  await api(`/api/items/${modalState.itemId}`, {method:"DELETE"});
  clearDraft();
  closeItemModal();
  loadSection(currentSection);
});

// ---------------------------------------------------------------------------
tryAutoLogin();
