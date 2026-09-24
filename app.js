/* 新标签页导航 - 主逻辑
   页面仅做展示；所有配置通过右上角设置面板完成 */

const STORAGE_KEY = "newtab_nav_data_v1";
const THEME_KEY = "newtab_theme";
const ENGINE_PREF_KEY = "newtab_engine_pref_v1";   // 用户手动选择的引擎（auto=自动）
const ENGINE_CACHE_KEY = "newtab_engine_cache_v1"; // 自动检测结果缓存
const BG_KEY = "newtab_bg_v1";                     // 自定义背景 { dataUrl, opacity }
const ZEN_KEY = "newtab_zen_v1";                   // 纯背景模式（隐藏图标）
const PARTICLE_KEY = "newtab_particle_v1";         // 粒子动效开关
const $ = (sel) => document.querySelector(sel);

/* 搜索引擎注册表：pattern 用于从浏览记录识别，home 用于取 favicon，tpl 用于手动指定时拼搜索 URL */
const ENGINES = {
  google:    { name: "Google",      home: "https://www.google.com/",    pattern: /(^|\.)google\.[a-z.]+\/search/, tpl: "https://www.google.com/search?q=" },
  bing:      { name: "Bing",        home: "https://www.bing.com/",      pattern: /(^|\.)bing\.com\/search/,       tpl: "https://www.bing.com/search?q=" },
  baidu:     { name: "百度",        home: "https://www.baidu.com/",     pattern: /(^|\.)baidu\.com\/s\?/,         tpl: "https://www.baidu.com/s?wd=" },
  duckduckgo:{ name: "DuckDuckGo",  home: "https://duckduckgo.com/",    pattern: /(^|\.)duckduckgo\.com\/\?q=/,   tpl: "https://duckduckgo.com/?q=" },
  sogou:     { name: "搜狗",        home: "https://www.sogou.com/",     pattern: /(^|\.)sogou\.com\/web/,         tpl: "https://www.sogou.com/web?query=" },
  so:        { name: "360 搜索",    home: "https://www.so.com/",        pattern: /(^|\.)so\.com\/s\?/,            tpl: "https://www.so.com/s?q=" }
};
const ENGINE_CACHE_TTL = 12 * 60 * 60 * 1000; // 检测结果缓存 12 小时

let data = [];               // [{ name, items: [{name, url, icon?}] }]
let editing = null;          // { catIndex, itemIndex } 或 { catIndex, itemIndex: -1 }

/* ---------------- 存储 ---------------- */
async function loadData() {
  const res = await chrome.storage.local.get([STORAGE_KEY]);
  if (res[STORAGE_KEY] && Array.isArray(res[STORAGE_KEY])) {
    data = res[STORAGE_KEY];
  } else {
    data = JSON.parse(JSON.stringify(window.DEFAULT_DATA));
    await saveData();
  }
}

async function saveData() {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

/* ---------------- 问候 & 时钟 ---------------- */
function renderGreeting() {
  const h = new Date().getHours();
  let text = "Hello";
  if (h < 5) text = "夜深了";
  else if (h < 9) text = "早上好";
  else if (h < 12) text = "上午好";
  else if (h < 14) text = "中午好";
  else if (h < 18) text = "下午好";
  else text = "晚上好";
  $("#greetText").textContent = text;
}

function tickClock() {
  const d = new Date();
  const week = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
  const pad = (n) => String(n).padStart(2, "0");
  $("#clock").textContent =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 星期${week} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/* ---------------- 主题 ---------------- */
async function loadTheme() {
  const res = await chrome.storage.local.get([THEME_KEY]);
  const dark = res[THEME_KEY] === "dark";
  document.body.classList.toggle("dark", dark);
  $("#darkToggle").checked = dark;
  updateThemeIcon();
}

function updateThemeIcon() {
  const dark = document.body.classList.contains("dark");
  $("#iconSun").classList.toggle("hidden", dark);
  $("#iconMoon").classList.toggle("hidden", !dark);
}

function toggleTheme(dark) {
  document.body.classList.toggle("dark", dark);
  chrome.storage.local.set({ [THEME_KEY]: dark ? "dark" : "light" });
  $("#darkToggle").checked = dark;
  updateThemeIcon();
}

/* ---------------- 自定义背景 ---------------- */
let bgState = { dataUrl: "", opacity: 100 };

async function loadBackground() {
  const res = await chrome.storage.local.get([BG_KEY]);
  if (res[BG_KEY] && res[BG_KEY].dataUrl) {
    bgState = { dataUrl: res[BG_KEY].dataUrl, opacity: res[BG_KEY].opacity ?? 100 };
  } else {
    bgState = { dataUrl: "", opacity: res[BG_KEY]?.opacity ?? 100 };
  }
  $("#bgOpacity").value = bgState.opacity;
  $("#bgOpacityVal").textContent = bgState.opacity + "%";
  applyBackground();
}

function applyBackground() {
  const layer = $("#bgLayer");
  const slider = $("#bgOpacity");
  if (bgState.dataUrl) {
    layer.style.backgroundImage = `url("${bgState.dataUrl}")`;
    layer.style.opacity = bgState.opacity / 100;   // 只调整图片层的透明度
    layer.classList.add("active");
    slider.disabled = false;
  } else {
    layer.classList.remove("active");
    layer.style.backgroundImage = "";
    slider.disabled = true;                         // 无图片时禁用滑块
  }
}

async function saveBackground() {
  await chrome.storage.local.set({ [BG_KEY]: bgState });
}

/* ---------------- 纯背景模式 ---------------- */
async function loadZen() {
  const res = await chrome.storage.local.get([ZEN_KEY]);
  const zen = res[ZEN_KEY] === true;
  document.body.classList.toggle("zen", zen);
  updateZenIcon();
}

function updateZenIcon() {
  const zen = document.body.classList.contains("zen");
  $("#iconEye").classList.toggle("hidden", zen);
  $("#iconEyeOff").classList.toggle("hidden", !zen);
}

function toggleZen() {
  const zen = document.body.classList.toggle("zen");
  chrome.storage.local.set({ [ZEN_KEY]: zen });
  updateZenIcon();
}

/* ---------------- 粒子动效 ---------------- */
let particleHandle = null;

async function loadParticle() {
  const res = await chrome.storage.local.get([PARTICLE_KEY]);
  const on = res[PARTICLE_KEY] !== false; // 默认开启
  $("#particleToggle").checked = on;
  if (on) enableParticle(); else disableParticle();
}

function enableParticle() {
  if (!window.initParticles) return;
  if (!particleHandle) particleHandle = window.initParticles();
  particleHandle.start();
}

function disableParticle() {
  if (particleHandle) particleHandle.stop();
}

/* ---------------- 工具 ---------------- */
function normalizeUrl(u) {
  if (!u) return "#";
  u = u.trim();
  if (!/^https?:\/\//i.test(u)) return "https://" + u;
  return u;
}

function faviconUrl(item) {
  if (item.icon) return item.icon;
  try {
    const host = new URL(normalizeUrl(item.url)).origin;
    return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(host + "/")}&size=64`;
  } catch {
    return "";
  }
}

function colorFromName(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return `linear-gradient(135deg, hsl(${hue},70%,60%), hsl(${(hue + 40) % 360},70%,50%))`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function letterHtml(name) {
  return `<div class="letter" style="background:${colorFromName(name)}">${escapeHtml(name[0] || "?").toUpperCase()}</div>`;
}

function iconImgHtml(item, cls) {
  const url = faviconUrl(item);
  if (url) {
    return `<img class="${cls}" src="${url}" alt="" onerror="this.outerHTML='${letterHtml(item.name).replace(/"/g, "&quot;")}'">`;
  }
  return letterHtml(item.name);
}

/* ---------------- 主页渲染（纯展示） ---------------- */
function render() {
  const root = $("#categories");
  root.innerHTML = "";

  data.forEach((cat) => {
    const sec = document.createElement("section");
    sec.className = "category";
    sec.innerHTML = `
      <div class="category-head">
        <span class="dot"></span>
        <span class="category-title">${escapeHtml(cat.name)}</span>
        <span class="category-count">${cat.items.length}</span>
      </div>
      <div class="grid"></div>`;

    const grid = sec.querySelector(".grid");
    cat.items.forEach((item) => {
      const a = document.createElement("a");
      a.className = "card";
      a.href = normalizeUrl(item.url);
      a.title = item.url;
      a.innerHTML = `
        <div class="card-icon">${iconImgHtml(item, "fav")}</div>
        <span class="card-title">${escapeHtml(item.name)}</span>`;
      grid.appendChild(a);
    });

    root.appendChild(sec);
  });
}

/* ---------------- 设置面板 ---------------- */
function openSettings() {
  renderManager();
  $("#settingsMask").classList.remove("hidden");
}

function closeSettings() {
  $("#settingsMask").classList.add("hidden");
}

function renderManager() {
  const list = $("#managerList");
  list.innerHTML = "";

  if (!data.length) {
    list.innerHTML = `<div class="empty-tip">暂无分类，点击右上角"新建分类"添加</div>`;
    return;
  }

  data.forEach((cat, ci) => {
    const box = document.createElement("div");
    box.className = "manager-cat";
    box.innerHTML = `
      <div class="manager-cat-head">
        <span class="arrow">▶</span>
        <span class="cat-name">${escapeHtml(cat.name)}</span>
        <span class="cat-count">${cat.items.length} 项</span>
      </div>
      <div class="manager-items"></div>
      <div class="manager-cat-actions">
        <button class="mini-btn add-item">+ 添加书签</button>
        <button class="mini-btn rename-cat">重命名</button>
        <button class="mini-btn danger del-cat">删除分类</button>
      </div>`;

    // 展开/收起
    box.querySelector(".manager-cat-head").addEventListener("click", () => box.classList.toggle("open"));

    box.querySelector(".add-item").addEventListener("click", () => openModal({ catIndex: ci, itemIndex: -1 }));

    box.querySelector(".rename-cat").addEventListener("click", () => {
      const name = prompt("新的分类名称：", cat.name);
      if (name === null) return;
      data[ci].name = name.trim() || cat.name;
      saveData(); render(); renderManager();
    });

    box.querySelector(".del-cat").addEventListener("click", () => {
      if (!confirm(`确定删除分类「${cat.name}」及其所有书签？`)) return;
      data.splice(ci, 1);
      saveData(); render(); renderManager();
    });

    const itemsBox = box.querySelector(".manager-items");
    cat.items.forEach((item, ii) => {
      const row = document.createElement("div");
      row.className = "manager-item";
      row.innerHTML = `
        ${iconImgHtml(item, "fav")}
        <span class="mi-name">${escapeHtml(item.name)}</span>
        <span class="mi-url">${escapeHtml(item.url)}</span>
        <button class="mini-btn edit-item">编辑</button>
        <button class="mini-btn danger del-item">删除</button>`;

      row.querySelector(".edit-item").addEventListener("click", () => openModal({ catIndex: ci, itemIndex: ii }));
      row.querySelector(".del-item").addEventListener("click", () => {
        data[ci].items.splice(ii, 1);
        saveData(); render(); renderManager();
      });
      itemsBox.appendChild(row);
    });

    if (!cat.items.length) {
      itemsBox.innerHTML = `<div class="empty-tip">该分类暂无书签</div>`;
    }

    list.appendChild(box);
  });
}

/* ---------------- 书签编辑弹窗 ---------------- */
function openModal(ctx) {
  editing = ctx;
  const isNew = ctx.itemIndex === -1;
  $("#modalTitle").textContent = isNew ? "添加书签" : "编辑书签";
  const item = isNew ? {} : data[ctx.catIndex].items[ctx.itemIndex];
  $("#bmName").value = item.name || "";
  $("#bmUrl").value = item.url || "";
  $("#bmIcon").value = item.icon || "";
  $("#modalMask").classList.remove("hidden");
  $("#bmName").focus();
}

function closeModal() {
  $("#modalMask").classList.add("hidden");
  $("#pickerMask").classList.add("hidden");
  editing = null;
}

/* ---------------- 浏览器书签选择器 ---------------- */
let bmFlatCache = null; // 展平后的浏览器书签缓存 [{name, url, folder}]

/* 需要排除的“非本机”文件夹：
   Chrome 同步后，来自手机/平板等其它设备的书签会出现在“移动设备书签”文件夹（id 固定为 "3"）。 */
function isForeignFolder(node) {
  return node.id === "3" ||
    /移动设备书签|手机书签|Mobile bookmarks|Other devices/i.test(node.title || "");
}

async function flattenBrowserBookmarks() {
  if (bmFlatCache) return bmFlatCache;
  const tree = await chrome.bookmarks.getTree();
  const out = [];
  (function walk(nodes, folderPath) {
    for (const n of nodes) {
      if (isForeignFolder(n)) continue;           // 跳过其它设备同步来的书签
      if (n.url) {
        out.push({ name: n.title || n.url, url: n.url, folder: folderPath });
      }
      if (n.children) {
        walk(n.children, folderPath ? folderPath + " / " + (n.title || "") : (n.title || ""));
      }
    }
  })(tree, "");
  bmFlatCache = out;
  return out;
}

async function renderPickerList(keyword = "") {
  const list = $("#pickerList");
  const items = await flattenBrowserBookmarks();
  const kw = keyword.trim().toLowerCase();
  const filtered = kw
    ? items.filter((b) => b.name.toLowerCase().includes(kw) || b.url.toLowerCase().includes(kw))
    : items;

  if (!filtered.length) {
    list.innerHTML = `<div class="picker-empty">${items.length ? "没有匹配的书签" : "浏览器中没有保存书签"}</div>`;
    return;
  }

  list.innerHTML = "";
  filtered.slice(0, 200).forEach((b) => {
    const btn = document.createElement("button");
    btn.className = "picker-item";
    btn.type = "button";
    const fav = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(b.url)}&size=32`;
    btn.innerHTML = `
      <img src="${fav}" alt="" onerror="this.style.visibility='hidden'">
      <span class="pi-name">${escapeHtml(b.name)}</span>
      <span class="pi-url">${escapeHtml(b.url)}</span>
      <span class="pi-folder" title="所在文件夹：${escapeHtml(b.folder)}">${escapeHtml(b.folder || "书签栏")}</span>`;
    btn.addEventListener("click", () => {
      $("#bmName").value = b.name;
      $("#bmUrl").value = b.url;
      $("#pickerMask").classList.add("hidden");
      $("#bmName").focus();
    });
    list.appendChild(btn);
  });
  if (filtered.length > 200) {
    const tip = document.createElement("div");
    tip.className = "picker-empty";
    tip.textContent = `仅显示前 200 条，请用搜索缩小范围`;
    list.appendChild(tip);
  }
}

function openPicker() {
  $("#pickerSearch").value = "";
  renderPickerList();
  $("#pickerMask").classList.remove("hidden");
  $("#pickerSearch").focus();
}

function saveModal() {
  const name = $("#bmName").value.trim();
  const url = $("#bmUrl").value.trim();
  const icon = $("#bmIcon").value.trim();
  if (!name || !url) { alert("名称和网址不能为空"); return; }

  const item = { name, url, icon: icon || undefined };
  if (editing.itemIndex === -1) {
    data[editing.catIndex].items.push(item);
  } else {
    data[editing.catIndex].items[editing.itemIndex] = item;
  }
  saveData(); render(); renderManager(); closeModal();
}

/* ---------------- 搜索引擎 ---------------- */
async function getEnginePref() {
  const res = await chrome.storage.local.get([ENGINE_PREF_KEY]);
  return res[ENGINE_PREF_KEY] || "auto";
}

/* 通过浏览记录自动检测默认搜索引擎：找最近一次来自各搜索引擎的搜索记录 */
async function detectEngine() {
  // 缓存有效则直接用
  const cache = await chrome.storage.local.get([ENGINE_CACHE_KEY]);
  const c = cache[ENGINE_CACHE_KEY];
  if (c && c.key && Date.now() - c.ts < ENGINE_CACHE_TTL) return c.key;

  let found = null;
  try {
    const items = await chrome.history.search({ text: "", maxResults: 1000, startTime: 0 });
    let bestTime = -1;
    for (const item of items) {
      for (const [key, eng] of Object.entries(ENGINES)) {
        if (eng.pattern.test(item.url) && item.lastVisitTime > bestTime) {
          bestTime = item.lastVisitTime;
          found = key;
        }
      }
    }
  } catch (e) { /* 无 history 权限等情况 */ }

  await chrome.storage.local.set({ [ENGINE_CACHE_KEY]: { key: found, ts: Date.now() } });
  return found;
}

/* 当前应展示的引擎 key（auto 时取检测结果，可能为 null） */
async function resolveEngine() {
  const pref = await getEnginePref();
  if (pref !== "auto") return pref;
  return await detectEngine();
}

/* 渲染搜索框左侧引擎图标 */
async function renderSearchIcon() {
  const key = await resolveEngine();
  const el = $(".search-icon");
  const eng = key ? ENGINES[key] : null;

  if (eng) {
    const fav = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(eng.home)}&size=64`;
    const letter = escapeHtml(eng.name[0]).toUpperCase();
    const bg = colorFromName(eng.name).replace(/"/g, "&quot;");
    el.style.background = "transparent";
    el.innerHTML = `<img src="${fav}" alt="${eng.name}" title="${eng.name}"
      onerror="this.parentElement.style.background='${bg}';this.outerHTML='${letter}'">`;
  } else {
    // 检测不到时的默认样式
    el.style.background = "linear-gradient(135deg, #4285f4, #34a853)";
    el.textContent = "G";
  }
}

/* ---------------- 搜索 ---------------- */
async function doSearch(e) {
  e.preventDefault();
  const q = $("#searchInput").value.trim();
  if (!q) return;
  // 像网址就跳转，否则搜索
  const isUrl = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(q) && !q.includes(" ");
  if (isUrl) {
    window.location.href = /^https?:\/\//i.test(q) ? q : "https://" + q;
    return;
  }

  const pref = await getEnginePref();
  if (pref === "auto") {
    // 交给浏览器默认搜索引擎执行（chrome.search 会使用系统默认引擎）
    try {
      await chrome.search.query({ text: q, disposition: "CURRENT_TAB" });
      return;
    } catch (err) { /* 不支持时退回 Bing */ }
    window.location.href = ENGINES.bing.tpl + encodeURIComponent(q);
  } else {
    window.location.href = ENGINES[pref].tpl + encodeURIComponent(q);
  }
}

/* ---------------- 初始化 ---------------- */
document.addEventListener("DOMContentLoaded", async () => {
  await loadTheme();
  await loadData();
  await loadBackground();
  await loadZen();
  await loadParticle();
  renderGreeting();
  tickClock();
  setInterval(tickClock, 1000);
  render();
  renderSearchIcon();

  // 背景图片
  $("#pickBgBtn").addEventListener("click", () => $("#bgFileInput").click());
  $("#bgFileInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      bgState.dataUrl = reader.result;
      applyBackground();
      saveBackground();
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  });
  $("#bgOpacity").addEventListener("input", (e) => {
    bgState.opacity = Number(e.target.value);
    $("#bgOpacityVal").textContent = bgState.opacity + "%";
    applyBackground();
  });
  $("#bgOpacity").addEventListener("change", saveBackground);
  $("#clearBgBtn").addEventListener("click", () => {
    bgState.dataUrl = "";
    applyBackground();
    saveBackground();
  });
  $("#particleToggle").addEventListener("change", (e) => {
    chrome.storage.local.set({ [PARTICLE_KEY]: e.target.checked });
    if (e.target.checked) enableParticle(); else disableParticle();
  });

  // 恢复搜索引擎偏好
  $("#engineSelect").value = await getEnginePref();
  $("#engineSelect").addEventListener("change", async (e) => {
    await chrome.storage.local.set({ [ENGINE_PREF_KEY]: e.target.value });
    renderSearchIcon();
  });

  $("#searchForm").addEventListener("submit", doSearch);

  // 设置面板
  $("#settingsBtn").addEventListener("click", openSettings);
  $("#themeBtn").addEventListener("click", () =>
    toggleTheme(!document.body.classList.contains("dark")));
  $("#zenBtn").addEventListener("click", toggleZen);
  $("#settingsClose").addEventListener("click", closeSettings);
  $("#settingsMask").addEventListener("click", (e) => {
    if (e.target === $("#settingsMask")) closeSettings();
  });
  $("#darkToggle").addEventListener("change", (e) => toggleTheme(e.target.checked));

  $("#addCategoryBtn").addEventListener("click", () => {
    const name = prompt("分类名称：", "新分类");
    if (name === null) return;
    data.push({ name: name.trim() || "新分类", items: [] });
    saveData(); render(); renderManager();
  });

  $("#importBtn").addEventListener("click", async () => {
    if (!confirm("导入默认导航将覆盖当前数据，继续？")) return;
    data = JSON.parse(JSON.stringify(window.DEFAULT_DATA));
    await saveData(); render(); renderManager();
  });

  $("#resetBtn").addEventListener("click", async () => {
    if (!confirm("确定清空所有数据？")) return;
    data = [];
    await saveData(); render(); renderManager();
  });

  // 书签编辑弹窗
  $("#modalCancel").addEventListener("click", closeModal);
  $("#modalSave").addEventListener("click", saveModal);
  $("#pickBookmarkBtn").addEventListener("click", openPicker);
  $("#pickerSearch").addEventListener("input", (e) => renderPickerList(e.target.value));
  $("#pickerMask").addEventListener("click", (e) => {
    if (e.target === $("#pickerMask")) $("#pickerMask").classList.add("hidden");
  });
  $("#modalMask").addEventListener("click", (e) => {
    if (e.target === $("#modalMask")) closeModal();
  });

  // 快捷键
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement.tagName;
    if (e.key === "Escape") { closeModal(); closeSettings(); }
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (e.key === "/") { e.preventDefault(); $("#searchInput").focus(); }
    if (e.key.toLowerCase() === "s") { e.preventDefault(); openSettings(); }
    if (e.key.toLowerCase() === "h") { e.preventDefault(); toggleZen(); }
  });
});
