
/* ============================================================
   BloomBody Chat — 核心邏輯＋對話打卡（100% 離線、本地儲存）
   用戶：真實註冊＋內建 Admin｜目標限期：2027年3月
   ============================================================ */

(function () {
  'use strict';

  // ---------- 常數與預設 ----------
  const APP_KEY = 'fitFitLady_v1';

  /* ========== FFL_AuthGate: defer heavy work until after login (login RAM budget) ========== */
  window.FFL_AuthGate = (function () {
    const queue = [];
    const intervals = new Set();
    let flushed = false;
    function isAuthed() {
      try { return typeof currentUser === 'string' && !!currentUser; } catch (_) { return false; }
    }
    function whenAuthed(fn, label) {
      if (typeof fn !== 'function') return;
      if (flushed && isAuthed()) {
        try { fn(); } catch (e) { console.warn('[FFL_AuthGate]', label || '', e); }
        return;
      }
      queue.push({ fn: fn, label: label || '' });
    }
    function ensureChartJs() {
      if (typeof Chart !== 'undefined') return true;
      const el = document.getElementById('ffl-chart-umd');
      if (!el) return typeof Chart !== 'undefined';
      try {
        const s = document.createElement('script');
        s.text = el.textContent;
        (document.head || document.documentElement).appendChild(s);
        el.remove();
      } catch (e) { console.warn('[FFL_AuthGate] Chart defer load', e); }
      return typeof Chart !== 'undefined';
    }
    function notifyLogin() {
      if (!isAuthed()) return;
      try { ensureChartJs(); } catch (_) {}
      flushed = true;
      const batch = queue.splice(0, queue.length);
      for (let i = 0; i < batch.length; i++) {
        try { batch[i].fn(); } catch (e) { console.warn('[FFL_AuthGate]', batch[i].label, e); }
      }
    }
    function trackInterval(fn, ms) {
      const id = setInterval(fn, ms);
      intervals.add(id);
      return id;
    }
    function notifyLogout() {
      flushed = false;
      intervals.forEach(function (id) { try { clearInterval(id); } catch (_) {} });
      intervals.clear();
      try { if (typeof reminderTimer !== 'undefined' && reminderTimer) { clearInterval(reminderTimer); reminderTimer = null; } } catch (_) {}
      try { if (typeof _supRemindTimer !== 'undefined' && _supRemindTimer) { clearInterval(_supRemindTimer); _supRemindTimer = null; } } catch (_) {}
    }
    function scheduleBoot(fn, label) {
      // Single registration — no DOMContentLoaded + setTimeout double-fire.
      whenAuthed(fn, label);
    }
    return {
      isAuthed: isAuthed,
      whenAuthed: whenAuthed,
      notifyLogin: notifyLogin,
      notifyLogout: notifyLogout,
      trackInterval: trackInterval,
      ensureChartJs: ensureChartJs,
      scheduleBoot: scheduleBoot,
      pending: function () { return queue.length; }
    };
  })();
  const APP_KEY_LEGACY = 'healthDuo_v1'; // 舊版相容
  const DB_NAME = 'HealthDuoIDB'; // 沿用舊 IDB，圖片不必搬遷
  const DB_STORE = 'images';
  const DEFAULT_USERS = {
    Admin: { password: 'P@ssw0rdNyClPT', role: 'admin', email: 'admin@bloombody.local', goals: { kcal: 1800, protein: 110 }, badges: [] }
  };
  const DEFAULT_FOODS = [
    { name: '雞蛋（1隻）', kcal: 78, protein: 6.5, carb: 0.6, fat: 5.3, sugar: 0.6 },
    { name: '雞胸肉 100g', kcal: 165, protein: 31, carb: 0, fat: 3.6, sugar: 0 },
    { name: '三文魚 100g', kcal: 208, protein: 20, carb: 0, fat: 13, sugar: 0 },
    { name: '白米飯 1碗', kcal: 200, protein: 4, carb: 45, fat: 0.4, sugar: 0 },
    { name: '燕麥 40g', kcal: 150, protein: 5, carb: 27, fat: 3, sugar: 0.5 },
    { name: '希臘乳酪 150g', kcal: 130, protein: 15, carb: 6, fat: 4, sugar: 6 },
    { name: '香蕉 1支', kcal: 105, protein: 1.3, carb: 27, fat: 0.4, sugar: 14 },
    { name: '蘋果 1個', kcal: 95, protein: 0.5, carb: 25, fat: 0.3, sugar: 19 },
    { name: '秋月梨 1個', kcal: 100, protein: 0.6, carb: 26, fat: 0.2, sugar: 17 },
    { name: '西兰花 100g', kcal: 34, protein: 2.8, carb: 7, fat: 0.4, sugar: 1.5 },
    { name: '豆腐 100g', kcal: 76, protein: 8, carb: 1.9, fat: 4.8, sugar: 0.6 },
    { name: '蛋白粉 1 scoop', kcal: 120, protein: 24, carb: 3, fat: 1, sugar: 1 },
    { name: '全麥麵包 2片', kcal: 140, protein: 6, carb: 24, fat: 2, sugar: 3 },
    { name: '牛油果 1/2個', kcal: 120, protein: 1.5, carb: 6, fat: 11, sugar: 0.3 },
    { name: '外賣一餐（估算）', kcal: 650, protein: 25, carb: 70, fat: 28, sugar: 15 }
  ];
  const DEFAULT_EXERCISES = [
    { name: '力量訓練', minutes: 45, kcal: 220 },
    { name: '有氧', minutes: 30, kcal: 250 },
    { name: '跑步', minutes: 30, kcal: 300 },
    { name: '行山', minutes: 60, kcal: 350 },
    { name: '瑜伽', minutes: 40, kcal: 120 },
    { name: '拉伸', minutes: 15, kcal: 40 }
  ];
  const MEDAL_DEFS = [
    { id: 'streak7', icon: '🔥', title: '連續7日打卡', desc: '堅持一星期，習慣開始成形！' },
    { id: 'streak30', icon: '🌟', title: '連續30日打卡', desc: '一個月的堅持，非常出色！' },
    { id: 'muscle_up', icon: '💪', title: '肌肉量上升', desc: '同最近一次比，肌肉量有進步！' },
    { id: 'fat_down', icon: '📉', title: '體脂下降', desc: '同最近一次比，體脂有下降！' },
    { id: 'first_log', icon: '🎯', title: '首次打卡', desc: '踏出第一步，繼續加油！' },
    { id: 'week_diet', icon: '🥗', title: '飲食記錄達人', desc: '累積記錄超過20餐！' }
  ];
  const TYPE_LABEL = { body: '身體測量', diet: '飲食', exercise: '運動', sleep: '睡眠', lab: '體檢', note: '備註', period: '經期', checkin: '今日狀態' };

  const MOOD_WORDS = ['精神', '平穩', '疲累', '焦慮', '低落', '愉快'];
  const BODY_WORDS = ['輕盈', '正常', '僵硬', '痠痛', '不適', '有力'];
  function clipOtherWord(s) { return String(s || '').replace(/\s+/g, '').slice(0, 8); }
  function matchListedWord(list, text) {
    for (const w of list) { if (text.indexOf(w) >= 0) return w; }
    return null;
  }
  function extractMoodBody(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    let moodWord = matchListedWord(MOOD_WORDS, text);
    let bodyWord = matchListedWord(BODY_WORDS, text);
    const moodOther = text.match(/(?:今天)?心情\s*(?:其他|：|:)?\s*([^\s身體,，。；;]{1,8})/);
    const bodyOther = text.match(/(?:今天)?身體\s*(?:其他|：|:)?\s*([^\s心情,，。；;]{1,8})/);
    if (!moodWord && moodOther) {
      const cand = clipOtherWord(moodOther[1]);
      if (cand && BODY_WORDS.indexOf(cand) < 0 && cand !== '其他') moodWord = cand;
    }
    if (!bodyWord && bodyOther) {
      const cand = clipOtherWord(bodyOther[1]);
      if (cand && MOOD_WORDS.indexOf(cand) < 0 && cand !== '其他') bodyWord = cand;
    }
    const hasMoodCue = /心情|情緒|狀態/.test(text) || (moodWord && /今天/.test(text) && bodyWord);
    const hasBodyCue = /身體|體感|身體狀況/.test(text);
    const chipPair = moodWord && bodyWord && /心情|身體|今日狀態|狀態/.test(text);
    if (!(hasMoodCue || hasBodyCue || chipPair)) return null;
    if (!moodWord && !bodyWord) return null;
    if (!/心情|情緒|身體|體感|狀態|今日狀態/.test(text) && /痛|膝蓋/.test(text)) return null;
    return { moodWord: moodWord || '', bodyWord: bodyWord || '', note: '', dateKey: todayKey() };
  }
  function summaryMoodBody(data) {
    const parts = [];
    if (data && data.moodWord) parts.push('心情 ' + data.moodWord);
    if (data && data.bodyWord) parts.push('身體 ' + data.bodyWord);
    return parts.join(' · ') || '今日狀態';
  }
  function tryParseMoodBodyIntent(raw) {
    const extracted = extractMoodBody(raw);
    if (!extracted || (!extracted.moodWord && !extracted.bodyWord)) return null;
    const text = String(raw || '').trim();
    const data = { kind: 'mood_body', moodWord: extracted.moodWord, bodyWord: extracted.bodyWord, note: '', dateKey: extracted.dateKey };
    return {
      ok: true,
      confidence: (extracted.moodWord && extracted.bodyWord) ? 0.94 : 0.88,
      recordType: 'checkin',
      data,
      remark: text,
      summary: summaryMoodBody(data),
      rawText: text
    };
  }
  function isMoodBodyRecord(r) {
    return !!(r && r.recordType === 'checkin' && r.data && r.data.kind === 'mood_body');
  }
  function findSameDayMoodBody(recs, owner, dk) {
    const key = String(dk || todayKey()).replace(/\D/g, '').slice(0, 8);
    return (recs || []).find(r => r.ownerUser === owner && isMoodBodyRecord(r) && tsDateKey(r.timestamp) === key) || null;
  }
  function upsertMoodBodyCheckinInState(newRec) {
    const dk = (newRec.data && newRec.data.dateKey) || tsDateKey(newRec.timestamp) || todayKey();
    const old = findSameDayMoodBody(state.records, newRec.ownerUser, dk);
    if (old) {
      old.data = Object.assign({}, old.data, newRec.data, { kind: 'mood_body', dateKey: dk });
      old.remark = newRec.remark || old.remark;
      old.updatedAt = nowTs();
      old.isPublic = newRec.isPublic != null ? newRec.isPublic : old.isPublic;
      if (newRec.source) old.source = Object.assign({}, old.source || {}, newRec.source);
      return { record: old, updated: true };
    }
    state.records.push(newRec);
    return { record: newRec, updated: false };
  }
  function analyzeMoodBodyRange(recs, sk, ek, opts) {
    opts = opts || {};
    const minDays = opts.minDays != null ? opts.minDays : 5;
    const slice = (recs || []).filter(r => {
      if (!isMoodBodyRecord(r)) return false;
      if (opts.ownerUser && r.ownerUser !== opts.ownerUser) return false;
      const k = tsDateKey(r.timestamp);
      return k >= sk && k <= ek;
    });
    const moodFreq = {}, bodyFreq = {};
    slice.forEach(r => {
      if (r.data.moodWord) moodFreq[r.data.moodWord] = (moodFreq[r.data.moodWord] || 0) + 1;
      if (r.data.bodyWord) bodyFreq[r.data.bodyWord] = (bodyFreq[r.data.bodyWord] || 0) + 1;
    });
    const toArr = (o) => Object.keys(o).map(word => ({ word, n: o[word] })).sort((a, b) => b.n - a.n);
    const daySet = new Set(slice.map(r => tsDateKey(r.timestamp)));
    const associations = [];
    // light associations vs same-day sleep/steps/ex when enough days
    if (daySet.size >= minDays) {
      const byDay = {};
      (recs || []).forEach(r => {
        if (opts.ownerUser && r.ownerUser !== opts.ownerUser) return;
        const k = tsDateKey(r.timestamp);
        if (k < sk || k > ek) return;
        if (!byDay[k]) byDay[k] = { sleep: 0, sleepN: 0, steps: 0, exmin: 0, mood: '', body: '' };
        const d = r.data || {};
        if (r.recordType === 'sleep' && d.duration != null) { byDay[k].sleep += +d.duration; byDay[k].sleepN++; }
        if (r.recordType === 'exercise') {
          byDay[k].exmin += +(d.minutes || 0);
          byDay[k].steps += +(d.steps || d.step || 0);
        }
        if (isMoodBodyRecord(r)) {
          if (d.moodWord) byDay[k].mood = d.moodWord;
          if (d.bodyWord) byDay[k].body = d.bodyWord;
        }
      });
      const tired = Object.values(byDay).filter(x => x.mood === '疲累' || x.body === '痠痛' || x.body === '不適');
      const calm = Object.values(byDay).filter(x => x.mood === '平穩' || x.mood === '愉快' || x.mood === '精神');
      const avg = (arr, fn) => {
        const vals = arr.map(fn).filter(v => v > 0);
        if (!vals.length) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      };
      const tSleep = avg(tired, x => x.sleepN ? x.sleep / x.sleepN : 0);
      const cSleep = avg(calm, x => x.sleepN ? x.sleep / x.sleepN : 0);
      if (tSleep != null && cSleep != null && tired.length >= 2 && calm.length >= 2) {
        associations.push({ kind: 'sleep', text: `「疲累／痠痛」日均睡眠約 ${tSleep.toFixed(1)} 小時，「平穩／愉快」日約 ${cSleep.toFixed(1)} 小時（參考估算）` });
      }
      const tSteps = avg(tired, x => x.steps);
      const cSteps = avg(calm, x => x.steps);
      if (tSteps != null && cSteps != null && tired.length >= 2 && calm.length >= 2) {
        associations.push({ kind: 'steps', text: `「疲累／痠痛」日均步數約 ${Math.round(tSteps)}，「平穩／愉快」日約 ${Math.round(cSteps)}（參考估算）` });
      }
    }
    return {
      count: slice.length,
      dayCount: daySet.size,
      moodFreq: toArr(moodFreq),
      bodyFreq: toArr(bodyFreq),
      associations,
      enough: daySet.size >= minDays,
      emptyHint: daySet.size < minDays ? '狀態記錄尚少於 ' + minDays + ' 日，暫不作關聯估算。' : '尚無足夠對照數據。',
      disclaimer: '以上為參考估算 · 非執業醫療'
    };
  }
  function composeSealDiaryLine(dayFacts) {
    const f = dayFacts || {};
    const parts = [];
    const steps = f.steps != null && isFinite(+f.steps) && +f.steps > 0 ? Math.round(+f.steps) : null;
    const sleep = f.sleepHours != null && isFinite(+f.sleepHours) ? +(+f.sleepHours).toFixed(1) : null;
    const exmin = f.exmin != null && isFinite(+f.exmin) && +f.exmin > 0 ? Math.round(+f.exmin) : null;
    const mood = f.moodWord ? String(f.moodWord).trim().slice(0, 8) : '';
    const body = f.bodyWord ? String(f.bodyWord).trim().slice(0, 8) : '';
    if (steps != null) parts.push('步行約 ' + steps + ' 步');
    if (sleep != null) parts.push('睡眠約 ' + sleep + ' 小時');
    if (exmin != null) parts.push('運動約 ' + exmin + ' 分鐘');
    if (mood) parts.push('心情「' + mood + '」');
    if (body) parts.push('身體感覺「' + body + '」');
    if (!parts.length) return { line: '小海豹仍在等候今日的記錄。', sparse: true };
    return { line: '小海豹記下：今天' + parts.join('，') + '。', sparse: false };
  }
  function collectDayFactsFromRecs(recs, dateKey, ownerUser) {
    const dk = String(dateKey || todayKey()).replace(/\D/g, '').slice(0, 8);
    const slice = (recs || []).filter(r => (!ownerUser || r.ownerUser === ownerUser) && tsDateKey(r.timestamp) === dk);
    let steps = 0, exmin = 0, sleepH = 0, sleepN = 0, moodWord = '', bodyWord = '';
    slice.forEach(r => {
      const d = r.data || {};
      if (r.recordType === 'exercise') {
        exmin += +(d.minutes || 0);
        steps += +(d.steps || d.step || 0);
      } else if (d.steps) steps += +d.steps;
      if (r.recordType === 'sleep' && d.duration != null) { sleepH += +d.duration; sleepN++; }
      if (isMoodBodyRecord(r)) {
        if (d.moodWord) moodWord = d.moodWord;
        if (d.bodyWord) bodyWord = d.bodyWord;
      }
    });
    return {
      steps: steps > 0 ? steps : null,
      sleepHours: sleepN ? +(sleepH / sleepN).toFixed(1) : null,
      exmin: exmin > 0 ? exmin : null,
      moodWord, bodyWord
    };
  }
  function sealDiaryEnabled() {
    ensureP0State();
    return state.meta.showSealDiary !== false;
  }


  /** 顯示用類別名：經期／週期備註一律顯示「經期」 */
  function displayTypeLabel(recordType, data) {
    if (recordType === 'checkin' || (recordType === 'note' && data && data.kind === 'mood_body')) return TYPE_LABEL.checkin || '今日狀態';
    if (recordType === 'period') return TYPE_LABEL.period;
    if (recordType === 'note' && data && (data.kind === 'cycle' || data.phase || (data.cycle && String(data.cycle).trim()))) {
      return TYPE_LABEL.period;
    }
    return TYPE_LABEL[recordType] || recordType || '';
  }

  /** 儲存後書面語回覆（依類別，避免亂選鼓勵） */
  function saveReplyForType(recordType, data) {
    let t = recordType;
    if (t === 'note' && data && (data.kind === 'cycle' || data.phase)) t = 'period';
    if (t === 'note' && data && data.kind === 'mood_body') t = 'checkin';
    const map = {
      diet: '已儲存此筆飲食記錄。',
      exercise: '已儲存此筆運動記錄。',
      body: '已儲存此筆身體測量。',
      sleep: '已儲存此筆睡眠記錄。',
      lab: '已儲存此筆體檢記錄。',
      period: '已儲存此筆經期記錄。',
      checkin: '已更新今日心情與身體狀態。',
      note: '已儲存此筆記錄。'
    };
    return map[t] || '已儲存此筆記錄。';
  }

  /** 確認卡操作：依 recordType 顯示，飲食才有收藏食物 */
  function confirmCardActionsHtml(recordType) {
    let extra = '';
    if (recordType === 'diet') {
      extra = '<button type="button" class="btn btn-ghost btn-sm cc-fav">收藏此食物</button>';
    }
    // 再記一筆／撤銷此筆 已自確認卡移除（改用快捷「取消」或設定→回收站）
    return '<button type="button" class="btn btn-secondary btn-sm cc-edit">查看並修改</button>'
      + extra;
  }


  // ---------- 狀態 ----------
  let state = null;
  let currentUser = null;
  let idb = null;
  let mainChart = null;
  let pendingLabImage = null; // { blob, previewUrl }

  // ---------- 工具 ----------
  function nowTs() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }
  function tsToDate(ts) {
    // "YYYYMMDD HH:MM:SS" → Date
    if (!ts || ts.length < 8) return null;
    const y = +ts.slice(0, 4), m = +ts.slice(4, 6) - 1, day = +ts.slice(6, 8);
    let hh = 0, mm = 0, ss = 0;
    if (ts.length >= 17) {
      hh = +ts.slice(9, 11); mm = +ts.slice(12, 14); ss = +ts.slice(15, 17);
    }
    return new Date(y, m, day, hh, mm, ss);
  }
  function tsDateKey(ts) { return (ts || '').slice(0, 8); }
  function todayKey() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  }
  function uid() {
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function toast(msg, type) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'show' + (type ? ' ' + type : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = ''; }, 2800);
  }
  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- LocalStorage 狀態 ----------
  function loadState() {
    try {
      let raw = localStorage.getItem(APP_KEY);
      // 遷移：舊 key healthDuo_v1 → fitFitLady_v1
      if (!raw) {
        const legacy = localStorage.getItem(APP_KEY_LEGACY);
        if (legacy) {
          raw = legacy;
          try {
            localStorage.setItem(APP_KEY, legacy);
            // 保留舊 key 一輪作保險；下次 save 會寫新 key
          } catch (migErr) { console.warn('migrate key', migErr); }
        }
      }
      if (raw) {
        state = JSON.parse(raw);
        // 補齊預設結構
        if (!state.users) state.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
        // 補齊預設用戶同 goals／badges，避免舊備份缺欄位
        Object.keys(DEFAULT_USERS).forEach(u => {
          if (!state.users[u]) state.users[u] = JSON.parse(JSON.stringify(DEFAULT_USERS[u]));
        });
        // Production: only Admin is built-in; drop stock demo accounts (keep real registrations)
        (function purgeStockDemoUsers() {
          const STOCK = {
            Nydia: 'nydia123', Claudia: 'claudia123', Friend: 'friend123',
            Amy: 'amy123', Bella: 'bella123'
          };
          Object.keys(STOCK).forEach(u => {
            if (state.users[u] && state.users[u].password === STOCK[u]) delete state.users[u];
          });
          // Always sync built-in Admin password / role from DEFAULT_USERS
          if (DEFAULT_USERS.Admin) {
            state.users.Admin = Object.assign({}, state.users.Admin || {}, JSON.parse(JSON.stringify(DEFAULT_USERS.Admin)));
          }
          // Drop demo-seeded public logs
          if (Array.isArray(state.records)) {
            state.records = state.records.filter(r => !(r && r.source && r.source.demo) && !(r && String(r.recordId||'').indexOf('seed_c4_')===0));
          }
          if (state.meta) { delete state.meta._seededCircle4; }
        })();
        Object.keys(state.users).forEach(u => {
          const def = DEFAULT_USERS[u] || { goals: { kcal: 1600, protein: 100 }, badges: [] };
          if (!state.users[u].goals) state.users[u].goals = { ...(def.goals || { kcal: 1600, protein: 100 }) };
          if (!Array.isArray(state.users[u].badges)) state.users[u].badges = [];
          if (typeof state.users[u].password !== 'string') state.users[u].password = def.password || 'changeme';
        });
        if (!state.records) state.records = [];
        if (!Array.isArray(state.records)) state.records = [];
        if (!state.foods) state.foods = DEFAULT_FOODS.slice();
        if (!state.exercises) state.exercises = DEFAULT_EXERCISES.slice();
        if (!state.meta) state.meta = { version: 1, created: nowTs() };
        if (!state.chatMessages) state.chatMessages = [];
        if (!Array.isArray(state.chatMessages)) state.chatMessages = [];
        if (state.meta.defaultPublic == null) state.meta.defaultPublic = false;

        // migrate Friend → Claudia if present (pre-demo-seed)
        if (state.users && state.users.Friend) {
          if (!state.users.Claudia) {
            state.users.Claudia = Object.assign({}, state.users.Friend);
            if (/friend@/i.test(state.users.Claudia.email || '')) state.users.Claudia.email = 'claudia@bloombody.local';
            if (state.users.Claudia.password === 'friend123') state.users.Claudia.password = 'claudia123';
          }
          delete state.users.Friend;
          (state.records || []).forEach(r => { if (r.ownerUser === 'Friend') r.ownerUser = 'Claudia'; });
          (state.chatMessages || []).forEach(m => { if (m.ownerUser === 'Friend') m.ownerUser = 'Claudia'; });
        }

        if (typeof ensureP0State === 'function') ensureP0State();
        else {
          if (!state.foodFavorites) state.foodFavorites = [];
          if (!state.tagCatalog) state.tagCatalog = [];
        }
        return;
      }
    } catch (e) { console.warn('loadState', e); }
    state = {
      users: JSON.parse(JSON.stringify(DEFAULT_USERS)),
      records: [],
      foods: DEFAULT_FOODS.slice(),
      exercises: DEFAULT_EXERCISES.slice(),
      chatMessages: [],
      foodFavorites: [],
      tagCatalog: [
        { id: 't_hike', label: '行山', colorKey: 'mint' },
        { id: 't_knee', label: '膝護理', colorKey: 'mint' },
        { id: 't_show', label: '備節目', colorKey: 'mint' }
      ],
      meta: { version: 2, created: nowTs(), defaultPublic: false,
        reminders: [{ id: 'rem_checkin', type: 'daily_checkin', timeLocal: '21:30', enabled: false, channel: 'browser' }],
        cycleProfile: { avgCycleDays: 28, avgPeriodDays: 5, nextPredictedStart: null, isPublicDefault: false },
        profile: { age: null, heightCm: null, goalText: '保肌減脂' }
      }
    };
    saveState();
  }
  function saveState() {
    localStorage.setItem(APP_KEY, JSON.stringify(state));
  }

  // ---------- IndexedDB（圖片） ----------
  function openIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => { idb = req.result; resolve(idb); };
      req.onerror = () => reject(req.error);
    });
  }
  function idbPut(id, blob) {
    return new Promise((resolve, reject) => {
      if (!idb) return reject(new Error('IndexedDB 未開啟'));
      const tx = idb.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put({ id, blob, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  function idbGet(id) {
    return new Promise((resolve, reject) => {
      if (!idb) return resolve(null);
      const tx = idb.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbDel(id) {
    return new Promise((resolve, reject) => {
      if (!idb) return resolve();
      const tx = idb.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---------- 權限／查詢 ----------
  function partnerName() {
    const names = Object.keys(state.users).filter(u => u !== currentUser);
    return names[0] || null;
  }
  function myRecords() {
    return state.records.filter(r => r.ownerUser === currentUser);
  }
  function visiblePartnerRecords() {
    const p = partnerName();
    if (!p) return [];
    return state.records.filter(r => r.ownerUser === p && r.isPublic === true);
  }
  function recordsForChart(user, publicOnly) {
    return state.records.filter(r => {
      if (r.ownerUser !== user) return false;
      if (publicOnly && !r.isPublic) return false;
      return true;
    });
  }

  // ---------- 連續打卡 & 勳章 ----------
  function computeStreak(user) {
    const keys = new Set(
      state.records.filter(r => r.ownerUser === user).map(r => tsDateKey(r.timestamp))
    );
    let streak = 0;
    const d = new Date();
    // 若今日未打卡，由昨日開始計（今日不斷卡，僅尚未計入）
    const todayHas = keys.has(todayKey());
    if (!todayHas) d.setDate(d.getDate() - 1);
    for (;;) {
      const p = n => String(n).padStart(2, '0');
      const k = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
      if (keys.has(k)) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return { streak, todayHas };
  }
  function awardBadge(user, badgeId) {
    const u = state.users[user];
    if (!u.badges) u.badges = [];
    if (u.badges.includes(badgeId)) return false;
    u.badges.push(badgeId);
    saveState();
    const def = MEDAL_DEFS.find(m => m.id === badgeId);
    if (def) showMedal(def);
    return true;
  }
  function showMedal(def) {
    $('#medal-icon').textContent = def.icon;
    $('#medal-title').textContent = def.title;
    $('#medal-desc').textContent = def.desc;
    $('#medal-modal').classList.add('show');
  }
  function checkBadgesAfterSave(record) {
    const { streak } = computeStreak(currentUser);
    if (state.records.filter(r => r.ownerUser === currentUser).length === 1) {
      awardBadge(currentUser, 'first_log');
    }
    if (streak >= 7) awardBadge(currentUser, 'streak7');
    if (streak >= 30) awardBadge(currentUser, 'streak30');
    const dietCount = myRecords().filter(r => r.recordType === 'diet').length;
    if (dietCount >= 20) awardBadge(currentUser, 'week_diet');
    if (record.recordType === 'body') {
      const bodies = myRecords()
        .filter(r => r.recordType === 'body' && r.recordId !== record.recordId)
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      if (bodies.length) {
        const prev = bodies[0];
        if (record.data.muscle != null && prev.data.muscle != null &&
            +record.data.muscle > +prev.data.muscle) {
          awardBadge(currentUser, 'muscle_up');
        }
        if (record.data.bodyFat != null && prev.data.bodyFat != null &&
            +record.data.bodyFat < +prev.data.bodyFat) {
          awardBadge(currentUser, 'fat_down');
        }
      }
    }
  }
  const ENCOURAGE = [
    '已儲存此筆記錄。',
    '記錄已寫入，可於詳情中修改。',
    '已完成記錄。'
  ];

  // ---------- 導航 ----------
  function showPage(name) {
    $all('.page').forEach(p => p.classList.toggle('active', p.dataset.page === name));
    $all('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === name));
    if (name === 'chat') renderChatPage();
    if (name === 'today') renderToday();
    if (name === 'history') renderHistory();
    if (name === 'circle') renderCirclePage();
    if (name === 'charts') renderChart();
    if (name === 'settings') {
      renderSettings();
      try { if (typeof renderCycleCard === 'function') renderCycleCard(); } catch (e) {}
      try { if (typeof renderReminderScheduler === 'function') renderReminderScheduler(); } catch (e) {}
      try { if (typeof populateTagFilterSelects === 'function') populateTagFilterSelects(); } catch (e) {}
      try {
        const saved = localStorage.getItem('bb_settings_tab') || 'goals';
        if (typeof window.__bbApplySettingsTab === 'function') window.__bbApplySettingsTab(saved);
      } catch (e) {}
    }
    if (name === 'habits') renderHabitsPage();
    if (name === 'charts') {
      renderPeriodReport();
      const active = document.querySelector('.dash-tab.active');
      renderDashboardP0(active ? active.dataset.dash : 'day');
    }
    if (name === 'add') {
      $all('.ts-input').forEach(inp => { if (!inp.value || !inp.closest('form').querySelector('[name=editId]').value) inp.value = nowTs(); });
      updateDietHint();
    }
  }
  function showForm(type, keepEdit) {
    showPage('add');
    $all('#add-tabs .sub-tab').forEach(t => t.classList.toggle('active', t.dataset.form === type));
    $all('.form-panel').forEach(p => p.classList.toggle('active', p.dataset.type === type));
    // 非「載入編輯」時清晒所有 editId，確保係新增模式
    if (!keepEdit) {
      $all('form.form-panel').forEach(f => {
        if (f.elements.editId) f.elements.editId.value = '';
      });
    }
    const form = $('#form-' + type);
    if (form) {
      const ts = form.querySelector('.ts-input');
      if (ts && !form.querySelector('[name=editId]').value) ts.value = nowTs();
    }
  }

  // ---------- 今日總覽 ----------
  function renderToday() {
    const tk = todayKey();
    const todayRecs = myRecords().filter(r => tsDateKey(r.timestamp) === tk);
    let kcal = 0, protein = 0, exmin = 0, weight = null;
    todayRecs.forEach(r => {
      if (r.recordType === 'diet') {
        kcal += +(r.data.kcal || 0);
        protein += +(r.data.protein || 0);
      }
      if (r.recordType === 'exercise') exmin += +(r.data.minutes || 0);
    });
    // 今日體重：取今日最後一筆；若無則取歷史最近一次
    const todayBodies = todayRecs
      .filter(r => r.recordType === 'body' && r.data.weight != null)
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    if (todayBodies.length) weight = todayBodies[0].data.weight;
    else {
      const last = myRecords().filter(r => r.recordType === 'body' && r.data.weight != null)
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
      if (last) weight = last.data.weight;
    }
    const goals = state.users[currentUser].goals || { kcal: 1600, protein: 100 };
    $('#stat-kcal').textContent = Math.round(kcal);
    $('#stat-exmin').textContent = Math.round(exmin);
    $('#stat-weight').textContent = weight != null ? (+weight).toFixed(1) : '—';
    const kcalPct = goals.kcal ? Math.min(100, (kcal / goals.kcal) * 100) : 0;
    const proPct = goals.protein ? Math.min(100, (protein / goals.protein) * 100) : 0;
    const kcalOver = goals.kcal && kcal > goals.kcal;
    const proOver = goals.protein && protein > goals.protein;
    $('#kcal-prog').style.width = kcalPct + '%';
    $('#kcal-prog').classList.toggle('over', !!kcalOver);
    $('#pro-prog').style.width = proPct + '%';
    $('#pro-prog').classList.toggle('over', !!proOver);
    $('#stat-kcal-box').classList.toggle('warn', !!kcalOver);
    const kcalLeft = goals.kcal - kcal;
    $('#kcal-prog-lbl').textContent = `${Math.round(kcal)} / ${goals.kcal}` +
      (kcalLeft >= 0 ? `（剩 ${Math.round(kcalLeft)}）` : `（超出 ${Math.round(-kcalLeft)}）`);
    const proLeft = goals.protein - protein;
    $('#pro-prog-lbl').textContent = `${protein.toFixed(0)} / ${goals.protein} g` +
      (proLeft >= 0 ? `（剩 ${proLeft.toFixed(0)}）` : `（超出 ${(-proLeft).toFixed(0)}）`);

    const { streak, todayHas } = computeStreak(currentUser);
    $('#streak-days').textContent = `連續 ${streak} 日` + (todayHas ? ' ✓' : '');
    $('#streak-encourage').textContent = todayHas
      ? ENCOURAGE[streak % ENCOURAGE.length]
      : (streak > 0 ? '今日尚未打卡，請記錄一筆以保持連續。' : '今日開始打卡，循序漸進。');

    // 勳章
    const earned = state.users[currentUser].badges || [];
    $('#badge-row').innerHTML = MEDAL_DEFS.map(m => {
      const on = earned.includes(m.id);
      return `<div class="badge ${on ? 'earned' : 'locked'}" title="${escapeHtml(m.desc)}">${m.icon} ${escapeHtml(m.title)}</div>`;
    }).join('');

    // 搭檔公開一覽
    const p = partnerName();
    const card = $('#partner-today-card');
    if (p) {
      card.style.display = 'block';
      const pToday = visiblePartnerRecords().filter(r => tsDateKey(r.timestamp) === tk);
      let pk = 0, pm = 0, pw = null;
      pToday.forEach(r => {
        if (r.recordType === 'diet') pk += +(r.data.kcal || 0);
        if (r.recordType === 'exercise') pm += +(r.data.minutes || 0);
      });
      const pBodies = pToday
        .filter(r => r.recordType === 'body' && r.data.weight != null)
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      if (pBodies.length) pw = pBodies[0].data.weight;
      else {
        const last = visiblePartnerRecords().filter(r => r.recordType === 'body' && r.data.weight != null)
          .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
        if (last) pw = last.data.weight;
      }
      $('#partner-today-body').innerHTML = `
        <div class="grid-3">
          <div class="stat-box"><div class="val">${Math.round(pk)}</div><div class="lbl">${escapeHtml(p)} 熱量</div></div>
          <div class="stat-box"><div class="val">${Math.round(pm)}</div><div class="lbl">運動分鐘</div></div>
          <div class="stat-box"><div class="val">${pw != null ? (+pw).toFixed(1) : '—'}</div><div class="lbl">體重 kg</div></div>
        </div>`;
    } else {
      card.style.display = 'none';
    }
  }

  function updateDietHint() {
    const tk = todayKey();
    let kcal = 0, protein = 0;
    myRecords().filter(r => r.recordType === 'diet' && tsDateKey(r.timestamp) === tk)
      .forEach(r => { kcal += +(r.data.kcal || 0); protein += +(r.data.protein || 0); });
    const g = state.users[currentUser].goals || { kcal: 1600, protein: 100 };
    $('#diet-today-hint').textContent =
      `今日已用：${Math.round(kcal)} kcal / 蛋白質 ${protein.toFixed(0)} g　｜　目標 ${g.kcal} kcal / ${g.protein} g　｜　熱量剩 ${Math.round(g.kcal - kcal)} · 蛋白質剩 ${(g.protein - protein).toFixed(0)} g`;
  }

  // ---------- 表單提交 ----------
  function formVal(form, name) {
    const el = form.elements[name];
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked;
    return el.value;
  }
  function numOrNull(v) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function collectLabItems(form) {
    const rows = $all('.lab-item-row', form);
    return rows.map(row => ({
      name: $('input[data-f=name]', row)?.value || '',
      value: $('input[data-f=value]', row)?.value || '',
      range: $('input[data-f=range]', row)?.value || '',
      doctorNote: $('input[data-f=note]', row)?.value || ''
    })).filter(x => x.name || x.value);
  }
  function addLabItemRow(data) {
    const wrap = $('#lab-items');
    const div = document.createElement('div');
    div.className = 'lab-item-row';
    div.innerHTML = `
      <input data-f="name" placeholder="項目名（如 LDL）" value="${escapeHtml(data?.name || '')}">
      <input data-f="value" placeholder="數值" value="${escapeHtml(data?.value || '')}">
      <input data-f="range" placeholder="參考範圍" value="${escapeHtml(data?.range || '')}">
      <input data-f="note" placeholder="醫生備註" value="${escapeHtml(data?.doctorNote || '')}">
      <button type="button" class="btn btn-ghost btn-sm" data-rm style="grid-column:1/-1;">移除呢項</button>`;
    $('button[data-rm]', div).onclick = () => div.remove();
    wrap.appendChild(div);
  }


  function resetFormFields(form, type) {
    // 儲存後清空，避免 editId 已清但欄位仍在而誤新增重複記錄
    const keep = new Set(['timestamp', 'editId', 'isPublic']);
    Array.from(form.elements).forEach(el => {
      if (!el.name || keep.has(el.name)) return;
      if (el.type === 'checkbox' || el.type === 'radio') return;
      if (el.type === 'file') { el.value = ''; return; }
      if (el.tagName === 'SELECT') {
        el.selectedIndex = 0;
        return;
      }
      el.value = '';
    });
    // 私密預設：體檢／備註關閉；其他開啟
    if (form.elements.isPublic) {
      form.elements.isPublic.checked = !(type === 'lab' || type === 'note');
    }
    form.querySelector('.ts-input').value = nowTs();
    if (type === 'lab') {
      $('#lab-items').innerHTML = '';
      addLabItemRow({ name: '低密度膽固醇 LDL' });
      addLabItemRow({ name: '轉氨酶 ALT' });
      const img = $('#lab-img-preview');
      if (img) { img.removeAttribute('src'); img.style.display = 'none'; }
      if (form.elements.imageId) form.elements.imageId.value = '';
    }
    if (type === 'exercise' && form.elements.feel) form.elements.feel.value = '3';
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const type = form.dataset.type;
    const ts = formVal(form, 'timestamp').trim();
    if (!/^\d{8} \d{2}:\d{2}:\d{2}$/.test(ts)) {
      toast('時間戳格式須為 YYYYMMDD HH:MM:SS', 'warn');
      return;
    }
    const isPublic = !!formVal(form, 'isPublic');
    const remark = formVal(form, 'remark') || '';
    let data = {};
    if (type === 'body') {
      data = {
        source: formVal(form, 'source'),
        weight: numOrNull(formVal(form, 'weight')),
        bodyFat: numOrNull(formVal(form, 'bodyFat')),
        muscle: numOrNull(formVal(form, 'muscle')),
        skeletalMuscle: numOrNull(formVal(form, 'skeletalMuscle')),
        bmr: numOrNull(formVal(form, 'bmr')),
        water: numOrNull(formVal(form, 'water')),
        visceralFat: numOrNull(formVal(form, 'visceralFat')),
        waist: numOrNull(formVal(form, 'waist')),
        hip: numOrNull(formVal(form, 'hip')),
        thigh: numOrNull(formVal(form, 'thigh')),
        arm: numOrNull(formVal(form, 'arm'))
      };
    } else if (type === 'diet') {
      data = {
        meal: formVal(form, 'meal'),
        food: formVal(form, 'food'),
        kcal: numOrNull(formVal(form, 'kcal')),
        protein: numOrNull(formVal(form, 'protein')),
        carb: numOrNull(formVal(form, 'carb')),
        fat: numOrNull(formVal(form, 'fat')),
        sugar: numOrNull(formVal(form, 'sugar'))
      };
      if (!data.food) { toast('請填食物名稱', 'warn'); return; }
    } else if (type === 'exercise') {
      data = {
        exType: formVal(form, 'exType'),
        minutes: numOrNull(formVal(form, 'minutes')),
        kcal: numOrNull(formVal(form, 'kcal')),
        detail: formVal(form, 'detail'),
        feel: numOrNull(formVal(form, 'feel'))
      };
    } else if (type === 'sleep') {
      data = {
        sleepTime: formVal(form, 'sleepTime'),
        wakeTime: formVal(form, 'wakeTime'),
        duration: numOrNull(formVal(form, 'duration'))
      };
    } else if (type === 'lab') {
      let imageId = formVal(form, 'imageId') || '';
      if (pendingLabImage) {
        if (!idb) {
          toast('此瀏覽器不支援圖片儲存（IndexedDB），請改用其他瀏覽器或不上傳圖片', 'warn');
          return;
        }
        imageId = imageId || ('img_' + uid());
        try {
          await idbPut(imageId, pendingLabImage.blob);
        } catch (err) {
          console.warn(err);
          toast('圖片儲存失敗，請重試或改用較細檔案', 'warn');
          return;
        }
        if (pendingLabImage.previewUrl) {
          try { URL.revokeObjectURL(pendingLabImage.previewUrl); } catch (_) {}
        }
        pendingLabImage = null;
      }
      data = {
        labDate: formVal(form, 'labDate'),
        org: formVal(form, 'org'),
        items: collectLabItems(form),
        imageId
      };
      form.elements.imageId.value = imageId;
    } else if (type === 'note') {
      data = {
        cycle: formVal(form, 'cycle'),
        symptoms: formVal(form, 'symptoms'),
        mood: formVal(form, 'mood')
      };
    }

    const editId = formVal(form, 'editId');
    let record;
    if (editId) {
      const idx = state.records.findIndex(r => r.recordId === editId && r.ownerUser === currentUser);
      if (idx < 0) { toast('找不到此筆記錄或無權限', 'warn'); return; }
      record = {
        ...state.records[idx],
        timestamp: ts,
        isPublic,
        data,
        remark
      };
      state.records[idx] = record;
      toast('已更新記錄', 'success');
    } else {
      record = {
        recordId: uid(),
        ownerUser: currentUser,
        timestamp: ts,
        recordType: type,
        isPublic,
        data,
        remark
      };
      state.records.push(record);
      toast('已儲存！繼續加油 💪', 'success');
    }
    // 表單儲存時標記來源（若原本無 source）
    if (!record.source) {
      record.source = { channel: 'form', rawText: '', confidence: 1, messageId: null, attachments: [] };
    }
    record.updatedAt = nowTs();
    saveState();
    form.elements.editId.value = '';
    resetFormFields(form, type);
    checkBadgesAfterSave(record);
    updateDietHint();
    renderToday();
    if (typeof renderChatPage === 'function') {
      if (editId) {
        ensureChatState();
        appendChatMessage({
          messageId: msgUid(), ownerUser: currentUser, role: 'system',
          createdAt: nowTs(),
          text: '已更新「' + (TYPE_LABEL[record.recordType] || '') + '」詳情',
          linkedRecordId: record.recordId,
          card: { type: 'updated' }
        });
      }
      renderChatPage();
    }
  }

  function fillFormForEdit(record) {
    const form = $('#form-' + record.recordType);
    if (!form) return;
    showForm(record.recordType, true);
    resetFormFields(form, record.recordType);
    form.elements.editId.value = record.recordId;
    form.elements.timestamp.value = record.timestamp;
    form.elements.isPublic.checked = !!record.isPublic;
    form.elements.remark.value = record.remark || '';
    const d = record.data || {};
    if (record.recordType === 'body') {
      ['source', 'weight', 'bodyFat', 'muscle', 'skeletalMuscle', 'bmr', 'water', 'visceralFat', 'waist', 'hip', 'thigh', 'arm']
        .forEach(k => { if (form.elements[k] != null) form.elements[k].value = d[k] != null ? d[k] : ''; });
    } else if (record.recordType === 'diet') {
      ['meal', 'food', 'kcal', 'protein', 'carb', 'fat', 'sugar'].forEach(k => {
        if (form.elements[k] != null && d[k] != null) form.elements[k].value = d[k];
      });
    } else if (record.recordType === 'exercise') {
      if (d.exType) form.elements.exType.value = d.exType;
      ['minutes', 'kcal', 'detail', 'feel'].forEach(k => {
        if (form.elements[k] != null && d[k] != null) form.elements[k].value = d[k];
      });
    } else if (record.recordType === 'sleep') {
      ['sleepTime', 'wakeTime', 'duration'].forEach(k => {
        if (form.elements[k] != null && d[k] != null) form.elements[k].value = d[k];
      });
    } else if (record.recordType === 'lab') {
      if (d.labDate) form.elements.labDate.value = d.labDate;
      if (d.org) form.elements.org.value = d.org;
      form.elements.imageId.value = d.imageId || '';
      $('#lab-items').innerHTML = '';
      (d.items && d.items.length ? d.items : [{}]).forEach(addLabItemRow);
      if (d.imageId) {
        idbGet(d.imageId).then(row => {
          if (row && row.blob) {
            const url = URL.createObjectURL(row.blob);
            const img = $('#lab-img-preview');
            img.src = url; img.style.display = 'block';
          }
        });
      }
    } else if (record.recordType === 'note') {
      ['cycle', 'symptoms', 'mood'].forEach(k => {
        if (form.elements[k] != null && d[k] != null) form.elements[k].value = d[k];
      });
    }
    toast('已載入編輯模式');
  }

  // ---------- 歷史 ----------
  function renderHistory() {
    const type = $('#hist-type').value;
    const from = $('#hist-from').value;
    const to = $('#hist-to').value;
    let list = myRecords().slice().sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    if (type) list = list.filter(r => r.recordType === type);
    if (from) {
      const fk = from.replace(/-/g, '');
      list = list.filter(r => tsDateKey(r.timestamp) >= fk);
    }
    if (to) {
      const tk = to.replace(/-/g, '');
      list = list.filter(r => tsDateKey(r.timestamp) <= tk);
    }
    const box = $('#history-list');
    if (!list.length) {
      box.innerHTML = '<div class="empty-state">暫無記錄<br>請前往「新增」寫下第一筆記錄</div>';
      return;
    }
    box.innerHTML = list.map(r => {
      const summary = summarizeRecord(r);
      return `<div class="record-item ${r.isPublic ? '' : 'private'}" data-id="${escapeHtml(r.recordId)}">
        <div class="ri-head">
          <div>
            <span class="ri-type">${displayTypeLabel(r.recordType, r.data)}</span>
            ${r.isPublic ? '<span class="tag-public">搭檔可見</span>' : '<span class="tag-private">私密</span>'}
          </div>
          <span class="ri-time">${escapeHtml(r.timestamp)}</span>
        </div>
        <div class="ri-body">${summary}</div>
        <div class="ri-actions">
          <button class="btn btn-ghost btn-sm" data-act="edit" type="button">編輯</button>
          <button class="btn btn-danger btn-sm" data-act="del" type="button">刪除</button>
        </div>
      </div>`;
    }).join('');
    box.onclick = async (ev) => {
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      const item = btn.closest('.record-item');
      const id = item.dataset.id;
      const rec = state.records.find(r => r.recordId === id && r.ownerUser === currentUser);
      if (!rec) return;
      if (btn.dataset.act === 'edit') fillFormForEdit(rec);
      if (btn.dataset.act === 'del') {
        if (!confirm('確定刪除呢筆記錄同相關相片？')) return;
        await deleteRecordWithPhotos(id);
        toast('已刪除記錄同相片', 'success');
        renderHistory();
        updateChatMiniStats();
      }
    };
  }
  function summarizeRecord(r) {
    const d = r.data || {};
    if (r.recordType === 'body') {
      return `來源：${escapeHtml(d.source || '—')}｜體重 ${d.weight ?? '—'} kg｜體脂 ${d.bodyFat ?? '—'}%｜肌肉 ${d.muscle ?? '—'} kg`
        + (r.remark ? `<br><span class="hint">${escapeHtml(r.remark)}</span>` : '');
    }
    if (r.recordType === 'diet') {
      return `${escapeHtml(d.meal || '')} · ${escapeHtml(d.food || '')}｜${d.kcal ?? '—'} kcal｜P ${d.protein ?? '—'} / C ${d.carb ?? '—'} / F ${d.fat ?? '—'}`;
    }
    if (r.recordType === 'exercise') {
      return `${escapeHtml(d.exType || '')}｜${d.minutes ?? '—'} 分鐘｜消耗 ${d.kcal ?? '—'} kcal｜感受 ${d.feel ?? '—'}/5`
        + (d.detail ? `<br><span class="hint">${escapeHtml(d.detail)}</span>` : '');
    }
    if (r.recordType === 'sleep') {
      return `入睡 ${escapeHtml(d.sleepTime || '—')} → 起床 ${escapeHtml(d.wakeTime || '—')}｜時長 ${d.duration ?? '—'} 小時`;
    }
    if (r.recordType === 'lab') {
      const items = (d.items || []).map(i => i.name + ':' + i.value).join('、');
      return `${escapeHtml(d.org || '')}｜${escapeHtml(d.labDate || '')}｜${escapeHtml(items || '無項目')}`;
    }
    if (r.recordType === 'checkin' || (r.recordType === 'note' && d.kind === 'mood_body')) {
      return escapeHtml(summaryMoodBody(d));
    }
    if (r.recordType === 'note') {
      return [d.cycle, d.symptoms, d.mood, r.remark].filter(Boolean).map(escapeHtml).join('｜') || '（空）';
    }
    return '';
  }

  // ---------- 圖表 ----------
  function getDateRange() {
    const mode = $('#chart-range').value;
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    let start = new Date();
    if (mode === '7') start.setDate(start.getDate() - 6);
    else if (mode === '30') start.setDate(start.getDate() - 29);
    else if (mode === '90') start.setDate(start.getDate() - 89);
    else {
      const f = $('#chart-from').value;
      const t = $('#chart-to').value;
      if (f) start = new Date(f + 'T00:00:00');
      else start.setDate(start.getDate() - 29);
      if (t) {
        end.setTime(new Date(t + 'T23:59:59').getTime());
      }
    }
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  function dayKeysBetween(start, end) {
    const keys = [];
    const d = new Date(start);
    const p = n => String(n).padStart(2, '0');
    while (d <= end) {
      keys.push(`${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`);
      d.setDate(d.getDate() + 1);
    }
    return keys;
  }
  function seriesForMetric(recs, metric, dayKeys) {
    // 回傳與 dayKeys 對齊的數值陣列（缺值用 null）
    const byDay = {};
    if (metric === 'kcal' || metric === 'exmin') {
      dayKeys.forEach(k => { byDay[k] = 0; });
      recs.forEach(r => {
        const k = tsDateKey(r.timestamp);
        if (!(k in byDay)) return;
        if (metric === 'kcal' && r.recordType === 'diet') byDay[k] += +(r.data.kcal || 0);
        if (metric === 'exmin' && r.recordType === 'exercise') byDay[k] += +(r.data.minutes || 0);
      });
      return dayKeys.map(k => byDay[k]);
    }
    // body metrics：當日最後一筆，若無則 null（圖表斷線）
    dayKeys.forEach(k => { byDay[k] = null; });
    const bodies = recs.filter(r => r.recordType === 'body').sort((a, b) => a.timestamp < b.timestamp ? -1 : 1);
    bodies.forEach(r => {
      const k = tsDateKey(r.timestamp);
      if (!(k in byDay)) return;
      const v = r.data[metric];
      if (v != null && v !== '') byDay[k] = +v;
    });
    return dayKeys.map(k => byDay[k]);
  }
  function renderChart() {
    renderPeriodReport();
    const metric = $('#chart-metric').value;
    const withPartner = $('#chart-partner').checked;
    const { start, end } = getDateRange();
    const dayKeys = dayKeysBetween(start, end);
    const labels = dayKeys.map(k => k.slice(4, 6) + '/' + k.slice(6, 8));
    // 搭檔比較模式：雙方都只載入公開數據（私密不入圖）
    // 自己對比模式：載入自己全部（含私密）
    const mine = recordsForChart(currentUser, !!withPartner);
    const myData = seriesForMetric(mine, metric, dayKeys);
    const datasets = [{
      label: currentUser + (withPartner ? '（自己·公開）' : '（自己）'),
      data: myData,
      borderColor: '#5B8C7A',
      backgroundColor: 'rgba(91,140,122,.15)',
      tension: 0.25,
      spanGaps: true,
      pointRadius: 3
    }];
    if (withPartner) {
      const p = partnerName();
      if (p) {
        const theirs = recordsForChart(p, true); // 只公開
        datasets.push({
          label: p + '（搭檔公開）',
          data: seriesForMetric(theirs, metric, dayKeys),
          borderColor: '#7BA3C9',
          backgroundColor: 'rgba(123,163,201,.12)',
          tension: 0.25,
          spanGaps: true,
          pointRadius: 3,
          borderDash: [4, 3]
        });
      }
      const note = $('#chart-legend-note');
      if (note) note.textContent = '比較模式：綠色＝自己公開；藍色＝搭檔公開。雙方私密記錄皆不會載入。';
    } else {
      const note = $('#chart-legend-note');
      if (note) note.textContent = '綠色＝自己（含私密）。勾選「搭檔比較」後雙方僅顯示公開數據。';
    }
    const metricLabel = {
      weight: '體重 kg', bodyFat: '體脂 %', muscle: '肌肉量 kg',
      kcal: '熱量 kcal', exmin: '運動分鐘'
    }[metric] || metric;
    try { if (window.FFL_AuthGate) FFL_AuthGate.ensureChartJs(); } catch (_) {}
    if (typeof Chart === 'undefined') { console.warn('Chart.js not loaded yet'); return; }
    const ctx = $('#main-chart').getContext('2d');
    if (mainChart) mainChart.destroy();
    mainChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          title: { display: true, text: metricLabel }
        },
        scales: {
          y: { beginAtZero: metric === 'kcal' || metric === 'exmin' }
        }
      }
    });
  }

  // ---------- 匯出 ----------
  function exportCSV(allUsers) {
    const rows = allUsers ? state.records.slice() : myRecords();
    const header = ['recordId', 'ownerUser', 'timestamp', 'recordType', 'isPublic', 'remark', 'data_json'];
    const lines = [header.join(',')];
    rows.sort((a, b) => a.timestamp < b.timestamp ? -1 : 1).forEach(r => {
      const cells = [
        csvEscape(r.recordId), csvEscape(r.ownerUser), csvEscape(r.timestamp), csvEscape(r.recordType),
        r.isPublic ? 'true' : 'false',
        csvEscape(r.remark || ''),
        csvEscape(JSON.stringify(r.data || {}))
      ];
      lines.push(cells.join(','));
    });
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `BloomBody_${allUsers ? 'ALL' : currentUser}_${todayKey()}.csv`);
    toast('CSV 已下載', 'success');
  }
  function csvEscape(s) {
    s = String(s);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function exportJSON(allUsers) {
    const payload = {
      meta: { ...state.meta, exportedAt: nowTs(), exportedBy: currentUser, app: 'BloomBody', version: 1 },
      users: allUsers ? state.users : { [currentUser]: state.users[currentUser] },
      records: allUsers ? state.records : myRecords(),
      foods: state.foods,
      exercises: state.exercises
    };
    // 不匯出明文密碼到「個人」備份時仍保留結構；管理員全部匯出會包含（本地用途）
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `BloomBody_backup_${allUsers ? 'ALL' : currentUser}_${todayKey()}.json`);
    toast('JSON 備份已下載', 'success');
  }
  function exportPDF() {
    // 用瀏覽器列印產生 PDF（不依賴外部庫，100% 離線）
    const { streak } = computeStreak(currentUser);
    const bodies = myRecords().filter(r => r.recordType === 'body')
      .sort((a, b) => a.timestamp < b.timestamp ? 1 : -1).slice(0, 5);
    const goals = state.users[currentUser].goals || {};
    let chartImg = '';
    try {
      if (mainChart) chartImg = mainChart.toBase64Image('image/png', 1);
    } catch (_) {}
    const w = window.open('', '_blank');
    if (!w) { toast('請允許彈出視窗以匯出 PDF', 'warn'); return; }
    w.document.write(`<!DOCTYPE html><html lang="zh-HK"><head><meta charset="UTF-8"><title>BloomBody 總結</title>
      <style>
        body{font-family:-apple-system,sans-serif;padding:24px;color:#2c3e35;}
        h1{color:#3d6b5a;} table{border-collapse:collapse;width:100%;margin:12px 0;}
        th,td{border:1px solid #ddd;padding:6px 8px;font-size:12px;text-align:left;}
        .muted{color:#666;font-size:11px;} img{max-width:100%;}
      </style></head><body>
      <h1>BloomBody 進度總結</h1>
      <p>用戶：<strong>${escapeHtml(currentUser)}</strong>｜匯出時間：${nowTs()}｜連續打卡：${streak} 日</p>
      <p>每日目標：${goals.kcal || '—'} kcal / 蛋白質 ${goals.protein || '—'} g</p>
      <p class="muted">目標限期：2027年3月｜熱量僅為估算，僅供參考。</p>
      <h2>最近身體測量</h2>
      <table><tr><th>時間</th><th>體重</th><th>體脂%</th><th>肌肉</th><th>來源</th></tr>
      ${bodies.map(r => `<tr><td>${escapeHtml(r.timestamp)}</td><td>${r.data.weight ?? ''}</td><td>${r.data.bodyFat ?? ''}</td><td>${r.data.muscle ?? ''}</td><td>${escapeHtml(r.data.source || '')}</td></tr>`).join('') || '<tr><td colspan="5">暫無</td></tr>'}
      </table>
      ${chartImg ? `<h2>圖表</h2><img src="${chartImg}" alt="chart">` : '<p class="muted">（請先在圖表頁更新圖表再匯出，可一併帶圖）</p>'}
      <p class="muted">本文件由 BloomBody 本地產生，並非醫療報告。</p>
      </body></html>`);
    w.document.close();
    // 由父頁觸發列印，避免在 document.write 內嵌 script 標籤
    const triggerPrint = () => { try { w.focus(); w.print(); } catch (_) {} };
    if (w.document.readyState === 'complete') setTimeout(triggerPrint, 400);
    else w.onload = () => setTimeout(triggerPrint, 400);
    toast('已開啟列印／另存 PDF', 'success');
  }

  async function importJSON(file) {
    const text = await file.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { toast('JSON 格式錯誤', 'warn'); return; }
    // HealthBridge samples → records
    if ((!data.records || !Array.isArray(data.records)) && Array.isArray(data.samples)) {
      const converted = healthSamplesToRecords(data.samples);
      if (!confirm(`匯入 Health-shaped ${converted.length} 筆？（手動互換，非連接 Apple 健康）建議先備份。`)) return;
      mergeImportedRecords(converted);
      toast('已匯入 Health-shaped JSON', 'success');
      renderToday();
      return;
    }
    if (!data.records || !Array.isArray(data.records)) { toast('備份檔缺少 records', 'warn'); return; }
    if (!confirm(`匯入 ${data.records.length} 筆記錄？相同 recordId 會覆蓋。建議先備份。`)) return;
    if (data.users) {
      Object.keys(data.users).forEach(u => {
        if (!state.users[u]) state.users[u] = data.users[u];
        else {
          // 合併 goals / badges，密碼以現有為準（除非新用戶）
          state.users[u].goals = data.users[u].goals || state.users[u].goals;
          const badges = new Set([...(state.users[u].badges || []), ...(data.users[u].badges || [])]);
          state.users[u].badges = [...badges];
        }
      });
      refreshUserSelect();
    }
    if (data.foods) state.foods = data.foods;
    if (data.exercises) state.exercises = data.exercises;
    mergeImportedRecords(data.records);
    renderFoodChips();
    toast('匯入完成', 'success');
    renderToday();
  }

  function _bbPad(n) { return String(n).padStart(2, '0'); }
  function _bbDateKey(raw) {
    const s = String(raw || '').trim();
    const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m1) return m1[1] + m1[2] + m1[3];
    const m2 = s.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m2) return m2[1] + m2[2] + m2[3];
    return todayKey();
  }
  function _bbParseCsv(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const parseLine = (line) => {
      const out = []; let cur = ''; let q = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (q) {
          if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
          if (c === '"') { q = false; continue; }
          cur += c;
        } else {
          if (c === '"') { q = true; continue; }
          if (c === ',') { out.push(cur); cur = ''; continue; }
          cur += c;
        }
      }
      out.push(cur);
      return out;
    };
    const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const cols = parseLine(line);
      const o = {};
      headers.forEach((h, i) => { o[h] = cols[i] != null ? String(cols[i]).trim() : ''; });
      return o;
    });
  }
  function _bbNum(v) {
    if (v == null || v === '') return null;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  function csvRowToRecord(row) {
    const typeRaw = String(row.type || row.recordtype || '').toLowerCase();
    const dk = _bbDateKey(row.date || row.timestamp || '');
    const ts = dk + ' 12:00:00';
    const note = row.note || row.remark || row.extra || '';
    const owner = currentUser;
    let recordType = null;
    let data = {};
    if (['body', 'weight', '體重', '体重', 'body_mass', 'body_fat_percentage'].includes(typeRaw) || row.weight_kg || row.weight) {
      recordType = 'body';
      data = {
        source: '手動匯入',
        weight: _bbNum(row.weight_kg || row.weight || (typeRaw === 'body_mass' ? row.value : null)),
        bodyFat: _bbNum(row.body_fat_pct || row.bodyfat || (typeRaw === 'body_fat_percentage' ? row.value : null))
      };
    } else if (['sleep', '睡眠', 'sleep_analysis'].includes(typeRaw) || row.sleep_hours) {
      recordType = 'sleep';
      data = {
        sleepTime: row.sleep_time || '',
        wakeTime: row.wake_time || '',
        duration: _bbNum(row.sleep_hours || row.duration || row.value)
      };
    } else if (['period', '經期', '经期', 'menstrual_flow'].includes(typeRaw) || row.period_phase) {
      recordType = 'period';
      let phase = String(row.period_phase || row.phase || row.value || '').toLowerCase();
      if (/start|開始|开始/.test(phase)) phase = 'period_start';
      else if (/end|結束|结束/.test(phase)) phase = 'period_end';
      data = { kind: 'cycle', phase, cycle: note || phase, symptoms: '', mood: note || '', flow: 'unknown' };
    } else if (['exercise', '運動', '运动', 'steps', '步數', 'exercise_time', 'active_energy'].includes(typeRaw) || row.steps || row.minutes || row.ex_type) {
      recordType = 'exercise';
      const steps = _bbNum(row.steps || row.step || (typeRaw === 'steps' || typeRaw === 'step_count' ? row.value : null));
      let exType = row.ex_type || row.activity || '';
      if (!exType) {
        if (typeRaw === 'steps' || typeRaw === 'step_count' || steps != null) exType = (/微信|werun/i.test(note) ? '微信運動' : '步數');
        else exType = '其他';
      }
      if (/微信運動|werun/i.test(note) && (exType === '其他' || exType === '步數')) exType = '微信運動';
      data = {
        exType,
        minutes: _bbNum(row.minutes || (typeRaw === 'exercise_time' ? row.value : null)),
        kcal: _bbNum(row.kcal || (typeRaw === 'active_energy' ? row.value : null)),
        steps, step: steps, detail: note
      };
    } else if (['checkin', 'mood_body', '今日狀態', '今日状态', '狀態', '状态', 'mood', '心情'].includes(typeRaw) || row.mood_word || row.body_word || row.moodword || row.bodyword) {
      recordType = 'checkin';
      const mw = clipOtherWord(row.mood_word || row.moodword || row.mood || '');
      const bw = clipOtherWord(row.body_word || row.bodyword || row.body || '');
      if (!mw && !bw) return null;
      data = { kind: 'mood_body', moodWord: mw, bodyWord: bw, note: note || '', dateKey: dk };
    } else {
      return null;
    }
    const rec = {
      recordId: row.recordid || row.record_id || uid(),
      ownerUser: owner,
      timestamp: ts,
      updatedAt: ts,
      recordType,
      isPublic: false,
      data,
      remark: note || ('匯入 ' + recordType),
      source: { channel: 'import', rawText: note, confidence: 0.85, messageId: null, attachments: [] }
    };
    return rec;
  }
  function healthSamplesToRecords(samples) {
    return (samples || []).map(s => csvRowToRecord({
      type: s.type,
      value: s.value,
      timestamp: s.timestamp,
      date: s.timestamp,
      ex_type: s.activity || '',
      sleep_time: s.sleepTime || '',
      wake_time: s.wakeTime || '',
      food: s.food || '',
      meal: s.meal || '',
      note: s.source || ''
    })).filter(Boolean);
  }
  function mergeImportedRecords(recs) {
    const map = new Map(state.records.map(r => [r.recordId, r]));
    (recs || []).forEach(r => {
      if (!r) return;
      // 冪等：心情＋身體一詞同日更新
      if (r.recordType === 'checkin' && r.data && r.data.kind === 'mood_body') {
        const dk = String(r.data.dateKey || r.timestamp || '').replace(/\D/g, '').slice(0, 8);
        let found = null;
        for (const [id, oldR] of map) {
          if (oldR.ownerUser === r.ownerUser && oldR.recordType === 'checkin' && oldR.data && oldR.data.kind === 'mood_body' &&
              String(oldR.data.dateKey || oldR.timestamp || '').replace(/\D/g, '').slice(0, 8) === dk) {
            found = oldR; break;
          }
        }
        if (found) {
          found.data = Object.assign({}, found.data, r.data, { kind: 'mood_body', dateKey: dk });
          found.updatedAt = r.timestamp || found.updatedAt;
          found.remark = r.remark || found.remark;
          map.set(found.recordId, found);
          return;
        }
      }
      // 冪等：微信運動／純步數按日更新
      if (r.recordType === 'exercise' && r.data && (r.data.exType === '微信運動' || r.data.exType === '步數' || r.data.steps != null)) {
        const dk = String(r.timestamp || '').replace(/\D/g, '').slice(0, 8);
        let found = null;
        for (const [id, old] of map) {
          if (old.ownerUser === r.ownerUser && old.recordType === 'exercise' && old.data &&
              String(old.timestamp || '').replace(/\D/g, '').slice(0, 8) === dk &&
              ((r.data.exType === '微信運動' && (old.data.exType === '微信運動' || (old.source && old.source.channel === 'werun'))) ||
               (r.data.exType === '步數' && old.data.exType === '步數'))) {
            found = old; break;
          }
        }
        if (found) {
          found.data = Object.assign({}, found.data, r.data);
          found.updatedAt = r.timestamp || found.updatedAt;
          found.remark = r.remark || found.remark;
          map.set(found.recordId, found);
          return;
        }
      }
      map.set(r.recordId, r);
    });
    state.records = [...map.values()];
    saveState();
  }
  async function importCSV(file) {
    const text = await file.text();
    const rows = _bbParseCsv(text);
    const recs = rows.map(csvRowToRecord).filter(Boolean);
    if (!recs.length) { toast('CSV 無有效列（請用 IMPORT_TEMPLATE.csv）', 'warn'); return; }
    if (!confirm(`匯入 CSV ${recs.length} 筆？手動合併入帳，非連接 Apple 健康。建議先備份。`)) return;
    mergeImportedRecords(recs);
    toast('CSV 匯入完成 ' + recs.length + ' 筆', 'success');
    renderToday();
  }

  function renderSettings() {
    ensureP0State();
    const g = state.users[currentUser].goals || { kcal: 1600, protein: 100 };
    $('#set-kcal-goal').value = g.kcal;
    $('#set-pro-goal').value = g.protein;
    const sw = $('#set-weight-goal'); if (sw) sw.value = g.weightKg != null ? g.weightKg : '';
    const sb = $('#set-bf-goal'); if (sb) sb.value = g.bodyFatPct != null ? g.bodyFatPct : '';
    const se = $('#set-exmin-goal'); if (se) se.value = g.exerciseMinPerWeek != null ? g.exerciseMinPerWeek : 150;
    const sh = $('#set-height'); if (sh) sh.value = (state.meta.profile && state.meta.profile.heightCm) || '';
    const preset = currentGoalPreset();
    const sgi = $('#set-goal-id');
    if (sgi) {
      sgi.innerHTML = goalPresetOptionsHtml(preset.id);
      sgi.value = preset.id;
    }
    const sg = $('#set-goal-text');
    const wrap = $('#set-goal-text-wrap');
    if (sg) sg.value = (state.meta.profile && state.meta.profile.goalText) || preset.label;
    if (wrap) wrap.style.display = (preset.id === 'custom') ? '' : 'none';
    const hint = $('#set-goal-hint');
    if (hint) hint.textContent = preset.tipFocus + '（參考估算／非執業醫療）';
    const dp = $('#set-default-public');
    if (dp) dp.checked = !!(state.meta && state.meta.defaultPublic);
    const sealEl = $('#set-show-seal-diary');
    if (sealEl) sealEl.checked = !(state.meta && state.meta.showSealDiary === false);
    const rem = (state.meta.reminders || [])[0] || {};
    const rt = $('#set-remind-checkin'); if (rt) rt.value = rem.timeLocal || '21:30';
    const ro = $('#set-remind-on'); if (ro) ro.checked = !!rem.enabled;
    renderFavoritesPanel();
    renderCycleCard();
    const tagBox = $('#tag-catalog-list');
    if (tagBox) {
      tagBox.innerHTML = (state.tagCatalog || []).map(t =>
        `<span class="tag-chip">${escapeHtml(t.label)}</span>`).join('') || '<span class="hint">未有標籤</span>';
    }
  }

  function refreshUserSelect() {
    const sel = $('#login-user');
    const cur = sel.value;
    sel.innerHTML = Object.keys(state.users).map(u =>
      `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');
    if (state.users[cur]) sel.value = cur;
  }

  function renderFoodChips() {
    const box = $('#food-chips');
    box.innerHTML = state.foods.map((f, i) =>
      `<button type="button" class="chip" data-fi="${i}">${escapeHtml(f.name)}</button>`).join('');
  }
  function renderExChips() {
    const box = $('#ex-chips');
    box.innerHTML = state.exercises.map((f, i) =>
      `<button type="button" class="chip" data-ei="${i}">${escapeHtml(f.name)}</button>`).join('');
  }

  // ---------- 登入／登出 ----------
  function maybeShowOnboard() {
    const banner = $('#onboard-banner');
    if (banner) banner.hidden = true;
  }
  function dismissOnboard() {
    const key = APP_KEY + '_onboard_' + (currentUser || '');
    localStorage.setItem(key, '1');
    const banner = $('#onboard-banner');
    if (banner) banner.hidden = true;
  }
  function doLogin() {
    const user = $('#login-user').value;
    const pass = $('#login-pass').value;
    if (!state.users[user]) { toast('用戶不存在', 'warn'); return; }
    if (state.users[user].password !== pass) { toast('密碼錯誤', 'warn'); return; }
    currentUser = user;
    sessionStorage.setItem(APP_KEY + '_session', user);
    $('#login-screen').classList.add('hidden');
    $('#app').classList.add('active');
    $('#hdr-user').textContent = user;
    renderFoodChips();
    renderExChips();
    showPage('chat');
    maybeShowOnboard();
    toast(`歡迎回來，${user}！`, 'success');
    try { if (window.FFL_AuthGate) FFL_AuthGate.notifyLogin(); } catch (_) {}
  }
  function doLogout() {
    currentUser = null;
    sessionStorage.removeItem(APP_KEY + '_session');
    $('#app').classList.remove('active');
    $('#login-screen').classList.remove('hidden');
    $('#login-pass').value = '';
    try { if (window.FFL_AuthGate) FFL_AuthGate.notifyLogout(); } catch (_) {}
  }
  function tryRestoreSession() {
    const u = sessionStorage.getItem(APP_KEY + '_session');
    if (u && state.users[u]) {
      currentUser = u;
      $('#login-screen').classList.add('hidden');
      $('#app').classList.add('active');
      $('#hdr-user').textContent = u;
      renderFoodChips();
      renderExChips();
      showPage('chat');
      maybeShowOnboard();
      try { if (window.FFL_AuthGate) FFL_AuthGate.notifyLogin(); } catch (_) {}
    }
  }

  // ---------- 睡眠時長自動計 ----------
  function bindSleepAuto() {
    const form = $('#form-sleep');
    const recalc = () => {
      const s = form.elements.sleepTime.value;
      const w = form.elements.wakeTime.value;
      if (!s || !w) return;
      const [sh, sm] = s.split(':').map(Number);
      const [wh, wm] = w.split(':').map(Number);
      let mins = (wh * 60 + wm) - (sh * 60 + sm);
      if (mins < 0) mins += 24 * 60;
      form.elements.duration.value = (mins / 60).toFixed(1);
    };
    form.elements.sleepTime.addEventListener('change', recalc);
    form.elements.wakeTime.addEventListener('change', recalc);
  }

  // ============================================================
  // 對話打卡模組（P0）— 文字優先 parser、確認卡、語音／圖片、搭檔公開 feed
  // ============================================================
  let chatPendingUndoId = null; // 兼容：上一筆可取消
  let chatUndoStack = []; // 可連續取消的 recordId 堆疊（最多 10）
  let chatPendingClarify = null; // { kind, baseText, options, guessType, partial }
  let chatPendingImage = null;  // { blob, previewUrl }
  let speechRec = null;
  let speechListening = false;

  function msgUid() {
    return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function ensureChatState() {
    if (!state.chatMessages) state.chatMessages = [];
    if (!Array.isArray(state.chatMessages)) state.chatMessages = [];
    if (state.meta && state.meta.defaultPublic == null) state.meta.defaultPublic = false;
  }

  /** 壓縮圖片至約 1280 邊長、JPEG 0.72，慳 IndexedDB 空間 */
  function compressImageFile(file, maxSide, quality) {
    maxSide = maxSide || 1280;
    quality = quality || 0.72;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          const scale = Math.min(1, maxSide / Math.max(w, h));
          w = Math.round(w * scale);
          h = Math.round(h * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            if (!blob) reject(new Error('壓縮失敗'));
            else resolve(blob);
          }, 'image/jpeg', quality);
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('讀圖失敗')); };
      img.src = url;
    });
  }

  /**
   * 意圖解析 v2：多欄位一句、多意圖「；」分隔、低置信度澄清
   * 回傳 { ok, confidence, recordType, data, remark, summary, ask, action, multi, clarify }
   */
  function parseChatIntent(raw) {
    const text0 = String(raw || '').trim();
    if (!text0) return { ok: false, confidence: 0, ask: '請打一句內容，例如「體重 58.2」' };

    if (/^(取消|撤回|undo|cancel)$/i.test(text0)) {
      return { ok: true, confidence: 1, action: 'undo' };
    }

    // 澄清回覆：用戶點選了選項或打短答
    if (chatPendingClarify) {
      const resolved = resolveClarifyReply(text0, chatPendingClarify);
      chatPendingClarify = null;
      if (resolved) return resolved;
    }

    // 多意圖：用 ； ; ／ 換行 分隔（至少兩段有效）
    const parts = text0.split(/[；;\n]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const multis = [];
      for (const p of parts) {
        const one = parseChatIntentSingle(p);
        if (one.ok && !one.action && !one.clarify) multis.push(one);
      }
      if (multis.length >= 2) {
        return { ok: true, confidence: Math.min(...multis.map(m => m.confidence)), multi: multis, rawText: text0 };
      }
      if (multis.length === 1) return multis[0];
    }

    return parseChatIntentSingle(text0);
  }

  function resolveClarifyReply(text, pending) {
    const t = text.trim();
    if (pending.kind === 'bare_number') {
      if (/體重|体重|weight|kg|公斤/i.test(t) || t === '體重') {
        return parseChatIntentSingle(`體重 ${pending.partial.num}`);
      }
      if (/熱量|kcal|卡|飲食|餐/i.test(t) || t === '熱量') {
        return parseChatIntentSingle(`加餐 （未命名） ${pending.partial.num}kcal`);
      }
      if (/腰圍|腰围/i.test(t)) {
        return parseChatIntentSingle(`腰圍 ${pending.partial.num}`);
      }
    }
    if (pending.kind === 'diet_meal') {
      let meal = null;
      if (/第一|1|早餐/.test(t)) meal = '第一餐';
      else if (/第二|2|午餐/.test(t)) meal = '第二餐';
      else if (/第三|3|晚餐/.test(t)) meal = '第三餐';
      else if (/加餐|零食/.test(t)) meal = '加餐';
      if (meal) {
        const base = pending.baseText.replace(/早餐|午餐|晚餐/g, '');
        return parseChatIntentSingle(`${meal} ${base}`);
      }
    }
    if (pending.kind === 'exercise_minutes') {
      const m = t.match(/(\d+(?:\.\d+)?)/);
      if (m) {
        return parseChatIntentSingle(`${pending.partial.exType || '運動'} ${m[1]}分`);
      }
    }
    if (pending.kind === 'guess_type' && pending.guessType) {
      if (t === '__confirm__' || /^確認|係|對|yes|ok$/i.test(t)) {
        const again = parseChatIntentSingle(pending.baseText, { forceType: pending.guessType, lowerConfOk: true });
        if (again.ok) return again;
      }
    }
    if (pending.kind === 'pick_type') {
      // 快捷填前綴：不直接入帳，由 UI 填入輸入框（見 clarify chip handler）
      return null;
    }
    return null;
  }

  function parseChatIntentSingle(raw, opts) {
    opts = opts || {};
    const text = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!text) return { ok: false, confidence: 0, ask: '請打一句內容' };

    let confidence = 0;
    let recordType = null;
    let data = {};
    let remark = '';
    let summary = '';
    let clarify = null;

    // 純數字歧義：58.2 / 200
    const bareNum = text.match(/^(\d{2,3}(?:\.\d+)?)$/);
    if (bareNum && !opts.forceType) {
      const n = +bareNum[1];
      clarify = {
        kind: 'bare_number',
        ask: `「${n}」是指哪一項？`,
        options: [
          { label: `體重 ${n} kg`, fill: `體重 ${n}` },
          { label: `熱量 ${n} kcal`, fill: `加餐 （未命名） ${n}kcal` },
          { label: `腰圍 ${n} cm`, fill: `腰圍 ${n}` }
        ],
        partial: { num: n },
        baseText: text
      };
      return { ok: false, confidence: 0.4, ask: clarify.ask, clarify };
    }

    // ---- 身體 ----
    const weightM = text.match(/(?:體重|体重|weight)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤)?/i)
      || text.match(/^(\d{2,3}(?:\.\d+)?)\s*(?:kg|公斤)$/i);
    const fatM = text.match(/(?:體脂|体脂|body\s*fat)\s*[率%]?\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*%?/i);
    const waistM = text.match(/(?:腰圍|腰围|waist)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*(?:cm|厘米)?/i);
    const hipM = text.match(/(?:臀圍|臀围|hip)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*(?:cm|厘米)?/i);
    const thighM = text.match(/(?:大腿圍|大腿|thigh)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*(?:cm|厘米)?/i);
    const armM = text.match(/(?:上臂圍|臂圍|手臂|arm)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*(?:cm|厘米)?/i);
    const muscleM = text.match(/(?:肌肉量|肌肉)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤)?/i);
    const skelM = text.match(/(?:骨骼肌|骨骼肌量)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤)?/i);
    const bmrM = text.match(/(?:BMR|基礎代謝|基础代谢)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)/i);
    const waterM = text.match(/(?:水分|水分率)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*%?/i);
    const viscM = text.match(/(?:內臟脂肪|内脏脂肪)\s*(?:等級|级)?\s*[：:＝=]?\s*(\d+(?:\.\d+)?)/i);
    const inbody = /inbody|體脂磅|家用體脂/i.test(text);

    const bodyHit = weightM || fatM || waistM || muscleM || hipM || thighM || armM || skelM || bmrM || waterM || viscM || inbody;
    if ((!opts.forceType && bodyHit) || opts.forceType === 'body') {
      if (bodyHit || opts.forceType === 'body') {
        recordType = 'body';
        const fieldCount = [weightM, fatM, waistM, muscleM, hipM, thighM, armM, skelM, bmrM, waterM, viscM].filter(Boolean).length;
        confidence = weightM ? (fieldCount >= 2 ? 0.95 : 0.92) : (fieldCount >= 2 ? 0.88 : 0.78);
        data = {
          source: inbody ? (/inbody/i.test(text) ? 'Inbody 機' : '家用體脂磅') : '手動量度',
          weight: weightM ? +weightM[1] : null,
          bodyFat: fatM ? +fatM[1] : null,
          muscle: muscleM ? +muscleM[1] : null,
          skeletalMuscle: skelM ? +skelM[1] : null,
          bmr: bmrM ? +bmrM[1] : null,
          water: waterM ? +waterM[1] : null,
          visceralFat: viscM ? +viscM[1] : null,
          waist: waistM ? +waistM[1] : null,
          hip: hipM ? +hipM[1] : null,
          thigh: thighM ? +thighM[1] : null,
          arm: armM ? +armM[1] : null
        };
        const bits = [];
        if (data.weight != null) bits.push(`體重 ${data.weight} kg`);
        if (data.bodyFat != null) bits.push(`體脂 ${data.bodyFat}%`);
        if (data.muscle != null) bits.push(`肌肉 ${data.muscle} kg`);
        if (data.skeletalMuscle != null) bits.push(`骨骼肌 ${data.skeletalMuscle} kg`);
        if (data.waist != null) bits.push(`腰圍 ${data.waist} cm`);
        if (data.hip != null) bits.push(`臀圍 ${data.hip} cm`);
        if (data.bmr != null) bits.push(`BMR ${data.bmr}`);
        if (data.water != null) bits.push(`水分 ${data.water}%`);
        if (data.visceralFat != null) bits.push(`內臟脂肪 ${data.visceralFat}`);
        summary = bits.join(' · ') || '身體測量';
        remark = text;
      }
    }

    // ---- 飲食 ----
    if (!recordType || opts.forceType === 'diet') {
      let meal = null;
      if (/第一餐|第1餐/.test(text)) meal = '第一餐';
      else if (/第二餐|第2餐/.test(text)) meal = '第二餐';
      else if (/第三餐|第3餐/.test(text)) meal = '第三餐';
      else if (/加餐|零食/.test(text)) meal = '加餐';
      else if (/早餐/.test(text)) meal = '第一餐';
      else if (/午餐|中餐/.test(text)) meal = '第二餐';
      else if (/晚餐|晚飯/.test(text)) meal = '第三餐';

      const kcalM = text.match(/(\d+(?:\.\d+)?)\s*(?:kcal|大卡|卡路里|卡)/i)
        || text.match(/(?:熱量|热量)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)/i);
      const proM = text.match(/(?:蛋白質|蛋白|protein)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*g?/i);
      const carbM = text.match(/(?:碳水|碳水化合物|carb)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*g?/i);
      const fatM2 = text.match(/(?:脂肪|fat)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*g?/i);
      const sugarM = text.match(/(?:糖分|糖|sugar)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*g?/i);
      const foodHint = /餐|吃|食|kcal|熱量|雞胸|雞蛋|燕麥|飯|麵|拉麵|沙拉|乳酪|蛋白粉|外賣|牛油果|三文魚|豆腐|蔬菜|水果|奶|咖啡|茶|湯|壽司|漢堡|披薩|餃子|百福|蒸煮|滑豆腐|板豆腐|維他奶|包裝|標籤/i.test(text);

      if ((!recordType && (meal || (foodHint && (kcalM || /雞胸|雞蛋|燕麥|飯|麵/.test(text))))) || opts.forceType === 'diet') {
        // 有食物提示但無餐次 → 澄清
        if (!meal && foodHint && !opts.forceType && !opts.lowerConfOk) {
          clarify = {
            kind: 'diet_meal',
            ask: '這餐算哪一餐？',
            options: [
              { label: '第一餐', fill: '第一餐' },
              { label: '第二餐', fill: '第二餐' },
              { label: '第三餐', fill: '第三餐' },
              { label: '加餐', fill: '加餐' }
            ],
            baseText: text,
            partial: {}
          };
          return { ok: false, confidence: 0.5, ask: clarify.ask, clarify, guessType: 'diet' };
        }
        if (!recordType || opts.forceType === 'diet') {
          recordType = 'diet';
          confidence = meal && (kcalM || foodHint) ? 0.9 : 0.72;
          if (!meal) meal = '加餐';
          let food = text
            .replace(/(第一餐|第二餐|第三餐|加餐|早餐|午餐|晚餐|第[123]餐)/g, '')
            .replace(/(\d+(?:\.\d+)?)\s*(?:kcal|大卡|卡路里|卡)/ig, '')
            .replace(/(?:熱量|热量|蛋白質|蛋白|protein|碳水|碳水化合物|carb|脂肪|fat|糖分|糖|sugar)\s*[：:＝=]?\s*\d+(?:\.\d+)?\s*g?/ig, '')
            .replace(/約/g, '')
            .trim()
            .replace(/^[\s\-·:：]+|[\s\-·:：]+$/g, '');
          if (!food) food = '（未命名食物）';
          const foods = (state && state.foods) || [];
          const hit = foods.find(f => food.includes(f.name.slice(0, 2)) || f.name.includes(food.slice(0, 2)));
          data = {
            meal,
            food,
            kcal: kcalM ? +kcalM[1] : (hit ? hit.kcal : null),
            protein: proM ? +proM[1] : (hit ? hit.protein : null),
            carb: carbM ? +carbM[1] : (hit ? hit.carb : null),
            fat: fatM2 ? +fatM2[1] : (hit ? hit.fat : null),
            sugar: sugarM ? +sugarM[1] : (hit ? hit.sugar : null)
          };
          summary = `${meal} · ${food}` + (data.kcal != null ? ` · 約 ${data.kcal} kcal` : '');
          remark = text;
          if (!kcalM && !hit) confidence = Math.min(confidence, 0.68);
        }
      }
    }

    // ---- 步數（手動／對齊微信運動）----
    if (!recordType || opts.forceType === 'exercise') {
      const stepM = text.match(/(?:步數|步数|steps?)\s*[：:＝=]?\s*(\d{3,6})/i)
        || text.match(/(?:走(?:咗|了)?|行(?:咗|了)?)\s*(\d{3,6})\s*步/)
        || text.match(/(\d{3,6})\s*步(?!\s*兵)/)
        || text.match(/(\d+(?:\.\d+)?)\s*萬\s*步/);
      if (stepM && (!recordType || opts.forceType === 'exercise')) {
        let steps = 0;
        if (/萬\s*步/.test(stepM[0]) || (/萬\s*步/.test(text) && String(stepM[1]).indexOf('.') >= 0)) {
          steps = Math.round(parseFloat(stepM[1]) * 10000);
        } else {
          steps = Math.round(parseFloat(stepM[1]));
        }
        if (steps >= 100) {
          recordType = 'exercise';
          confidence = 0.92;
          data = { exType: '步數', steps, step: steps, minutes: 0, detail: text };
          summary = `步數 ${steps}`;
          remark = text;
        }
      }
    }

    // ---- 運動 ----
    if (!recordType || opts.forceType === 'exercise') {
      let exType = null;
      if (/力量|重訓|深蹲|硬拉|臥推/.test(text)) exType = '力量訓練';
      else if (/有氧|單車|游泳|跳繩/.test(text)) exType = '有氧';
      else if (/跑步|慢跑|run/i.test(text)) exType = '跑步';
      else if (/行山|登山|hiking/i.test(text)) exType = '行山';
      else if (/瑜伽|yoga/i.test(text)) exType = '瑜伽';
      else if (/拉伸|拉筋|伸展/.test(text)) exType = '拉伸';
      else if (/運動|訓練|workout/i.test(text)) exType = '其他';

      const minM = text.match(/(\d+(?:\.\d+)?)\s*(?:分鐘|分|min(?:ute)?s?)/i);
      const burnM = text.match(/(?:消耗|burn)\s*[：:＝=]?\s*(\d+(?:\.\d+)?)\s*(?:kcal|卡)?/i)
        || text.match(/(\d+(?:\.\d+)?)\s*(?:kcal|大卡)/i);
      const feelM = text.match(/(?:感受|狀態)\s*[：:＝=]?\s*([1-5])/);

      if ((!recordType && (exType || (/跑|練|游|騎/.test(text) && minM))) || opts.forceType === 'exercise') {
        if (exType && !minM && !opts.forceType && !opts.lowerConfOk) {
          clarify = {
            kind: 'exercise_minutes',
            ask: `「${exType}」做了多少分鐘？`,
            options: [
              { label: '20 分', fill: '20' },
              { label: '30 分', fill: '30' },
              { label: '45 分', fill: '45' },
              { label: '60 分', fill: '60' }
            ],
            partial: { exType },
            baseText: text
          };
          return { ok: false, confidence: 0.55, ask: clarify.ask, clarify, guessType: 'exercise' };
        }
        if (!exType) exType = '其他';
        recordType = 'exercise';
        confidence = minM ? 0.9 : 0.72;
        const minutes = minM ? +minM[1] : null;
        let kcal = burnM ? +burnM[1] : null;
        if (kcal == null && minutes != null) {
          const rate = { '跑步': 10, '有氧': 8, '行山': 6, '力量訓練': 5, '瑜伽': 3, '拉伸': 2, '其他': 5 };
          kcal = Math.round(minutes * (rate[exType] || 5));
        }
        data = { exType, minutes, kcal, detail: text, feel: feelM ? +feelM[1] : null };
        summary = `${exType}` + (minutes != null ? ` ${minutes} 分鐘` : '') +
          (kcal != null ? ` · 約耗 ${kcal} kcal` : '');
        remark = text;
      }
    }

    // ---- 睡眠 ----
    if (!recordType || opts.forceType === 'sleep') {
      const sleepHint = /瞓|睡|入睡|起床|失眠|熬夜|睡眠/.test(text);
      const t1 = text.match(/(?:入睡|瞓覺?|睡覺?)\s*[：:＝=]?\s*(\d{1,2})[：:點时時.](\d{2})?/)
        || text.match(/睡\s*(\d{1,2})[：:](\d{2})/);
      const t2 = text.match(/(?:起床|起身|醒)\s*[：:＝=]?\s*(\d{1,2})[：:點时時.](\d{2})?/)
        || text.match(/起\s*(\d{1,2})[：:](\d{2})/);
      const durM = text.match(/(?:睡(?:咗|了)?|瞓(?:咗|了)?|睡眠|睡了)\s*(\d+(?:\.\d+)?)\s*(?:個?小時|个小时|hrs?|h)(?![\d\w])/i)
        || text.match(/(\d+(?:\.\d+)?)\s*(?:個?小時|个小时)\s*(?:的?睡眠|睡)/i)
        || text.match(/睡眠\s*[：:＝=]?\s*(\d+(?:\.\d+)?)/i);
      if ((!recordType && sleepHint && (t1 || t2 || durM)) || (opts.forceType === 'sleep' && (sleepHint || durM || t1 || t2))) {
        recordType = 'sleep';
        confidence = 0.85;
        const fmt = (h, m) => String(h).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0');
        let sleepTime = t1 ? fmt(+t1[1], t1[2] ? +t1[2] : 0) : '';
        let wakeTime = t2 ? fmt(+t2[1], t2[2] ? +t2[2] : 0) : '';
        let duration = durM ? +durM[1] : null;
        if (duration == null && sleepTime && wakeTime) {
          const [sh, sm] = sleepTime.split(':').map(Number);
          const [wh, wm] = wakeTime.split(':').map(Number);
          let mins = (wh * 60 + wm) - (sh * 60 + sm);
          if (mins < 0) mins += 24 * 60;
          duration = +(mins / 60).toFixed(1);
        }
        data = { sleepTime, wakeTime, duration };
        summary = (sleepTime ? `入睡 ${sleepTime}` : '') +
          (wakeTime ? ` · 起床 ${wakeTime}` : '') +
          (duration != null ? ` · ${duration} 小時` : '') || '睡眠記錄';
        remark = text;
      }
    }

    // ---- 體檢 ----
    if (!recordType && /化驗|膽固醇|體檢|抽血|轉氨酶|LDL|HDL|醫院|報告/.test(text)) {
      recordType = 'lab';
      confidence = 0.7;
      const valM = text.match(/(\d+(?:\.\d+)?)/);
      data = {
        labDate: todayKey().replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
        org: '',
        items: [{ name: text.slice(0, 40), value: valM ? valM[1] : '', range: '', note: '' }],
        imageId: ''
      };
      summary = '體檢／化驗（請補齊機構與數值）';
      remark = text;
    }

    // ---- 經期（優先於一般備註）----
    if (!recordType && /月經|月经|經期|经期|經血|经血|大姨媽|大姨妈/.test(text)) {
      recordType = 'period';
      confidence = 0.9;
      const phase = /開始|开始|來了|来了|來潮|来潮|到了/.test(text) ? 'period_start' : (/結束|结束|乾淨|干净|完結|完结/.test(text) ? 'period_end' : '');
      data = {
        kind: 'cycle',
        phase,
        cycle: text.slice(0, 80),
        symptoms: /痛|腰酸|抽筋|腹脹/.test(text) ? text.slice(0, 60) : '',
        mood: text.slice(0, 80),
        flow: /量大|很多/.test(text) ? 'heavy' : (/量少|很少/.test(text) ? 'light' : 'unknown')
      };
      summary = '經期：' + text.slice(0, 40);
      remark = text;
    }

    // ---- 心情＋身體一詞（今日狀態；優先於一般備註）----
    if (!recordType || (opts && opts.forceType === 'checkin')) {
      const mb = tryParseMoodBodyIntent(text);
      if (mb && mb.ok && (!recordType || (opts && opts.forceType === 'checkin'))) {
        return mb;
      }
    }

    // ---- 備註／情志 ----
    if (!recordType && /情緒|心情|膝蓋|不適|痛|備註|日記|焦慮|壓力/.test(text)) {
      recordType = 'note';
      confidence = 0.8;
      data = {
        cycle: '',
        symptoms: /痛|膝蓋|不適|僵/.test(text) ? text : '',
        mood: text
      };
      summary = '備註：' + text.slice(0, 40);
      remark = text;
    }

    if (!recordType) {
      return {
        ok: false,
        confidence: 0.3,
        ask: '未能判斷類別。請試：「體重 58.2」「步數 8000」「跑步 30 分鐘」「睡眠 7.5 小時」「經期開始」「今天心情平穩身體正常」。多筆可用「；」分隔。',
        clarify: {
          kind: 'pick_type',
          ask: '請選擇記錄類別：',
          options: [
            { label: '⚖️ 身體測量', fill: '體重 ' },
            { label: '🍽️ 飲食', fill: '第一餐 ' },
            { label: '🏃 運動', fill: '跑步 ' },
            { label: '😴 睡眠', fill: '睡 ' },
            { label: '🩸 經期', fill: '經期開始 ' }
          ],
          baseText: text,
          partial: {}
        }
      };
    }
    if (confidence < 0.55 && !opts.lowerConfOk) {
      return {
        ok: false,
        confidence,
        ask: `初步判斷為「${TYPE_LABEL[recordType]}」，但尚不確定。請確認或改寫？`,
        guessType: recordType,
        clarify: {
          kind: 'guess_type',
          ask: `確認是「${TYPE_LABEL[recordType]}」？`,
          options: [
            { label: `✓ 是${TYPE_LABEL[recordType]}`, fill: '__confirm__' },
            { label: '改寫', fill: '' }
          ],
          guessType: recordType,
          baseText: text,
          partial: {}
        }
      };
    }

    return { ok: true, confidence, recordType, data, remark, summary, rawText: text };
  }

  function appendChatMessage(msg) {
    ensureChatState();
    state.chatMessages.push(msg);
    // 只保留最近 200 條對話，避免 LocalStorage 爆
    if (state.chatMessages.length > 200) {
      state.chatMessages = state.chatMessages.slice(-200);
    }
    saveState();
    return msg;
  }

  function renderChatThread() {
    ensureChatState();
    const box = $('#chat-thread');
    if (!box) return;
    const mine = state.chatMessages.filter(m =>
      !m.ownerUser || m.ownerUser === currentUser
    );
    // 搭檔公開 feed（輕量圈子）：插入為 system/partner 卡
    const partnerFeed = buildPartnerFeedCards();

    if (!mine.length && !partnerFeed.length) {
      box.innerHTML = `<div class="chat-empty">
        <div style="font-size:2rem;margin-bottom:8px;">💬</div>
        <div>請以一句話記錄。四類常用：體重 · 步數／運動 · 睡眠 · 經期（書面語）</div>
        <code>體重 58.2</code>
        <code>步數 8000</code>
        <code>睡眠 7.5 小時</code>
        <code>經期開始</code>
        <code>第一餐 雞胸肉 200 kcal</code>
        <code>跑步 30 分鐘</code>
        <code>睡 23:30 起 07:00</code>
        <div style="margin-top:10px;font-size:.78rem;">回覆「取消」可撤銷上一筆 · 熱量／消耗僅為參考估算 · 非執業醫療</div>
      </div>`;
      return;
    }

    const items = mine.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    let html = items.map(m => renderChatBubble(m)).join('');
    if (partnerFeed.length) {
      html += `<div class="chat-msg system"><div class="bubble">—— 搭檔公開動態（只顯示允許查看）——</div></div>`;
      html += partnerFeed.map(c => `
        <div class="chat-msg bot">
          <div class="confirm-card partner-feed-card">
            <div class="pf-who">${escapeHtml(c.who)} · ${escapeHtml(c.typeLabel)}</div>
            <div class="cc-summary">${escapeHtml(c.summary)}</div>
            <div class="meta">${escapeHtml(c.ts)}</div>
          </div>
        </div>`).join('');
    }
    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
    // P0: fill confirm-card galleries
    $all('.confirm-card[data-rid]', box).forEach(card => {
      const rid = card.dataset.rid;
      const rec = state.records.find(r => r.recordId === rid);
      const slot = card.querySelector('.cc-gallery-slot');
      if (!slot || !rec) return;
      const ids = collectAttachmentIds(rec);
      if (!ids.length) return;
      slot.innerHTML = '<div class="photo-gallery-grid">' +
        ids.slice(0, 8).map(id => '<img data-chat-img="' + escapeHtml(id) + '" alt="">').join('') +
        (ids.length > 8 ? '<div class="pg-more">+' + (ids.length - 8) + '</div>' : '') + '</div>';
    });
  }

  function renderChatBubble(m) {
    const role = m.role || 'bot';
    if (m.card && m.card.type === 'confirm') {
      const rec = state.records.find(r => r.recordId === m.linkedRecordId);
      const isPublic = rec ? !!rec.isPublic : !!m.card.isPublic;
      const rt = (rec && rec.recordType) || m.card.recordType || '';
      const typeLabel = displayTypeLabel(rt, rec && rec.data) || m.card.typeLabel || '';
      return `<div class="chat-msg bot" data-msgid="${escapeHtml(m.messageId)}">
        <div class="confirm-card" data-rid="${escapeHtml(m.linkedRecordId || '')}" data-rtype="${escapeHtml(rt)}">
          <div class="cc-head">
            <span class="cc-type">${escapeHtml(typeLabel)}</span>
            <span class="meta">${escapeHtml(m.createdAt || '')}</span>
          </div>
          <div class="cc-summary">${escapeHtml(m.card.summary || '')}</div>
          <div class="cc-fields">${escapeHtml(m.card.fields || '')}</div>
          <div class="cc-privacy">
            <label><input type="checkbox" class="cc-public" ${isPublic ? 'checked' : ''}> 允許搭檔查看</label>
            <span style="color:var(--muted);font-size:.75rem;">${isPublic ? '公開' : '私密'}</span>
          </div>
          <div class="cc-gallery-slot"></div>
          <div class="cc-actions">
            ${confirmCardActionsHtml(rt)}
          </div>
          <div class="cc-hint">熱量／消耗僅為參考估算 · 非執業醫療</div>
        </div>
      </div>`;
    }
    if (m.card && m.card.type === 'clarify') {
      const chips = (m.card.options || []).map((o, i) =>
        `<button type="button" data-clarify-fill="${escapeHtml(o.fill || '')}" data-clarify-label="${escapeHtml(o.label || '')}">${escapeHtml(o.label)}</button>`
      ).join('');
      return `<div class="chat-msg bot" data-msgid="${escapeHtml(m.messageId || '')}">
        <div class="bubble">${escapeHtml(m.text || '')}
          <div class="clarify-chips">${chips}</div>
        </div>
        <div class="meta">${escapeHtml(m.createdAt || '')}</div>
      </div>`;
    }
    if (m.card && m.card.type === 'undo') {
      return `<div class="chat-msg system"><div class="bubble">↩ ${escapeHtml(m.text || '已取消')}</div></div>`;
    }
    if (m.card && m.card.type === 'updated') {
      return `<div class="chat-msg system"><div class="bubble">✓ ${escapeHtml(m.text || '已更新')}</div></div>`;
    }
    const imgHtml = m.imageId ? `<div style="margin-top:6px;"><img data-chat-img="${escapeHtml(m.imageId)}" alt="附件" style="max-width:180px;border-radius:10px;display:block;"></div>` : '';
    return `<div class="chat-msg ${escapeHtml(role)}">
      <div class="bubble">${escapeHtml(m.text || '')}${imgHtml}</div>
      <div class="meta">${escapeHtml(m.createdAt || '')}</div>
    </div>`;
  }

  
  function renderCirclePage() {
    const typeSel = $('#circle-type');
    const memSel = $('#circle-member');
    const list = $('#circle-list');
    if (!list) return;
    // 動態成員選項：只列真實註冊用戶＋Admin；永不列 Friend／庫存假帳
    if (memSel) {
      const STOCK_PW = { Nydia:'nydia123', Claudia:'claudia123', Friend:'friend123', Amy:'amy123', Bella:'bella123' };
      const FAKE = new Set(['Friend']);
      const curVal = memSel.value || 'all';
      const base = [
        { v: 'all', t: '全部（自己公開＋搭檔）' },
        { v: 'me', t: '只看自己公開' },
        { v: 'partners', t: '只看搭檔' }
      ];
      const realUsers = Object.keys(state.users || {}).filter(u => {
        if (FAKE.has(u)) return false;
        if (STOCK_PW[u] && state.users[u] && state.users[u].password === STOCK_PW[u]) return false;
        return true;
      }).sort((a, b) => {
        if (a === 'Admin') return -1;
        if (b === 'Admin') return 1;
        if (a === currentUser) return -1;
        if (b === currentUser) return 1;
        return a.localeCompare(b, 'zh-Hant');
      });
      memSel.innerHTML = '';
      base.forEach(o => {
        const opt = document.createElement('option');
        opt.value = o.v; opt.textContent = o.t;
        memSel.appendChild(opt);
      });
      realUsers.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u === currentUser ? (u + '（我）') : u;
        memSel.appendChild(opt);
      });
      const ok = [...memSel.options].some(o => o.value === curVal);
      memSel.value = ok ? curVal : 'all';
    }
    const typeFilter = typeSel ? typeSel.value : 'all';
    const memFilter = memSel ? memSel.value : 'all';
    // 自己公開 + 搭檔公開
    let minePub = myRecords().filter(r => !!r.isPublic);
    let partner = visiblePartnerRecords().slice();
    let recs = [];
    if (memFilter === 'me') recs = minePub;
    else if (memFilter === 'partners') recs = partner;
    else if (memFilter === 'all') recs = minePub.concat(partner);
    else if (memFilter === currentUser) recs = minePub;
    else recs = partner.filter(r => r.ownerUser === memFilter);
    if (typeFilter && typeFilter !== 'all') recs = recs.filter(r => r.recordType === typeFilter);
    recs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    if (!recs.length) {
      list.innerHTML = `<div class="circle-empty">
        <div class="ce-ico">👥</div>
        <div><strong>暫時未有公開動態</strong></div>
        <div style="margin-top:8px;font-size:.85rem;line-height:1.5;">
          · 自己：新增記錄時勾「允許搭檔查看」<br>
          · 搭檔：對方註冊後用邀請碼加入圈子，並設公開<br>
          · 可用上方「篩選類別」收窄範圍
        </div>
      </div>`;
      return;
    }
    list.innerHTML = recs.map(r => {
      const isMe = r.ownerUser === currentUser;
      return `<div class="card hist-item ${isMe ? 'circle-me' : 'circle-partner'}">
        <div class="circle-who">${escapeHtml(r.ownerUser)}
          <span class="${isMe ? 'tag-me' : 'tag-partner'}">${isMe ? '我' : '搭檔'}</span>
          · ${escapeHtml(TYPE_LABEL[r.recordType] || r.recordType)}
        </div>
        <div style="font-size:.9rem;margin:4px 0;">${escapeHtml(summarizeRecord(r))}</div>
        <div class="muted" style="font-size:.75rem;">${escapeHtml(r.timestamp)} · 公開</div>
      </div>`;
    }).join('');
  }

  function renderPeriodReport() {
    const box = $('#period-report');
    const weeklyBox = $('#weekly-chat-report');
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
    const ago = (days) => { const d = new Date(now); d.setDate(d.getDate() - days + 1); d.setHours(0,0,0,0); return d; };
    function statsFor(startD, endD) {
      const sk = ymd(startD), ek = ymd(endD);
      const recs = myRecords().filter(r => {
        const k = tsDateKey(r.timestamp);
        return k >= sk && k <= ek;
      });
      let kcal = 0, protein = 0, exmin = 0, sleepH = 0, sleepN = 0;
      const weights = [];
      recs.forEach(r => {
        if (r.recordType === 'diet') { kcal += +(r.data.kcal || 0); protein += +(r.data.protein || 0); }
        if (r.recordType === 'exercise') exmin += +(r.data.minutes || 0);
        if (r.recordType === 'sleep' && r.data.duration != null) { sleepH += +r.data.duration; sleepN++; }
        if (r.recordType === 'body' && r.data.weight != null) weights.push({ k: tsDateKey(r.timestamp), w: +r.data.weight });
      });
      weights.sort((a,b) => a.k < b.k ? -1 : 1);
      const wDelta = weights.length >= 2 ? +(weights[weights.length-1].w - weights[0].w).toFixed(1) : null;
      const lastW = weights.length ? weights[weights.length-1].w : null;
      const days = Math.max(1, Math.round((endD - startD) / 86400000) + 1);
      return {
        days, kcal: Math.round(kcal), protein: Math.round(protein),
        exmin: Math.round(exmin),
        avgSleep: sleepN ? +(sleepH / sleepN).toFixed(1) : null,
        wDelta, lastW,
        checkins: new Set(recs.map(r => tsDateKey(r.timestamp))).size
      };
    }
    const week = statsFor(ago(7), now);
    const month = statsFor(ago(30), now);
    const deadline = new Date('2027-03-01T00:00:00');
    const leftDays = Math.max(0, Math.ceil((deadline - now) / 86400000));
    const leftWeeks = Math.max(0, Math.ceil(leftDays / 7));
    const card = (title, s) => `
      <div class="pr-card">
        <h4>${title}</h4>
        <div>打卡 ${s.checkins}／${s.days} 日</div>
        <div>熱量合計約 <strong>${s.kcal}</strong> kcal</div>
        <div>蛋白質約 ${s.protein} g · 運動 ${s.exmin} 分</div>
        <div>睡眠均 ${s.avgSleep != null ? s.avgSleep + ' h' : '—'}</div>
        <div>體重變化 ${s.wDelta != null ? ((s.wDelta > 0 ? '+' : '') + s.wDelta + ' kg') : '—'}</div>
      </div>`;
    if (box) {
      box.innerHTML = `
        <h4 style="margin:0 0 8px;">週／月進度報告 · 距 2027-03 節目約 <strong>${leftDays}</strong> 日</h4>
        <div class="pr-grid">
          ${card('近 7 日', week)}
          ${card('近 30 日', month)}
        </div>
        <p class="muted" style="font-size:.72rem;margin:8px 0 0;">熱量僅為估算，只供參考；體重上升不會負評，只顯示客觀數據。</p>`;
    }
    if (weeklyBox) {
      let wLine = '體重：本週未夠兩次測量對比';
      if (week.wDelta != null) {
        const dir = week.wDelta > 0 ? '升' : (week.wDelta < 0 ? '降' : '持平');
        wLine = `體重 ${dir} ${week.wDelta > 0 ? '+' : ''}${week.wDelta} kg` +
          (week.lastW != null ? `（最新 ${week.lastW} kg）` : '');
      }
      const lines = [
        `近 7 日打卡 ${week.checkins}／${week.days} 日。`,
        `飲食熱量合計約 ${week.kcal} kcal（估算），蛋白質約 ${week.protein} g。`,
        `運動合共 ${week.exmin} 分鐘。`,
        `睡眠平均 ${week.avgSleep != null ? week.avgSleep + ' 小時' : '未有記錄'}。`,
        wLine + '。',
        '繼續穩步打卡即可，不必苛責自己 💪'
      ];
      weeklyBox.innerHTML =
        `<div class="wc-head"><span>📋 週報摘要（對話風）</span><span>${escapeHtml(currentUser || '')}</span></div>` +
        `<div class="wc-body">${lines.map(escapeHtml).join('<br>')}</div>` +
        `<div class="wc-countdown">🎯 距 2027 年 3 月備節目尚有 <strong>${leftDays}</strong> 日（約 ${leftWeeks} 週）</div>`;
    }
  }

  function buildWeeklySummaryText() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
    const start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0,0,0,0);
    const sk = ymd(start), ek = ymd(now);
    const recs = myRecords().filter(r => { const k = tsDateKey(r.timestamp); return k >= sk && k <= ek; });
    let kcal = 0, protein = 0, exmin = 0, sleepH = 0, sleepN = 0;
    const weights = [];
    recs.forEach(r => {
      if (r.recordType === 'diet') { kcal += +(r.data.kcal || 0); protein += +(r.data.protein || 0); }
      if (r.recordType === 'exercise') exmin += +(r.data.minutes || 0);
      if (r.recordType === 'sleep' && r.data.duration != null) { sleepH += +r.data.duration; sleepN++; }
      if (r.recordType === 'body' && r.data.weight != null) weights.push(+r.data.weight);
    });
    const checkins = new Set(recs.map(r => tsDateKey(r.timestamp))).size;
    const deadline = new Date('2027-03-01T00:00:00');
    const leftDays = Math.max(0, Math.ceil((deadline - now) / 86400000));
    const avgSleep = sleepN ? (sleepH / sleepN).toFixed(1) : '—';
    let wTxt = '體重未夠對比';
    if (weights.length >= 2) {
      const d = +(weights[weights.length - 1] - weights[0]).toFixed(1);
      wTxt = `體重變化 ${d > 0 ? '+' : ''}${d} kg`;
    } else if (weights.length === 1) wTxt = `最新體重 ${weights[0]} kg`;
    return `【週報】打卡 ${checkins}/7 日｜熱量約 ${Math.round(kcal)} kcal｜蛋白 ${Math.round(protein)} g｜運動 ${Math.round(exmin)} 分｜睡眠均 ${avgSleep} h｜${wTxt}｜距 2027-03 尚有 ${leftDays} 日。熱量僅為估算。`;
  }

  function buildPartnerFeedCards() {
    const recs = visiblePartnerRecords()
      .slice()
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, 8);
    return recs.map(r => ({
      who: r.ownerUser,
      typeLabel: TYPE_LABEL[r.recordType] || r.recordType,
      summary: summarizeRecord(r),
      ts: r.timestamp
    }));
  }

  function updateChatMiniStats() {
    const tk = todayKey();
    const todayRecs = myRecords().filter(r => tsDateKey(r.timestamp) === tk);
    let kcal = 0, exmin = 0, weight = null;
    todayRecs.forEach(r => {
      if (r.recordType === 'diet') kcal += +(r.data.kcal || 0);
      if (r.recordType === 'exercise') exmin += +(r.data.minutes || 0);
    });
    const bodies = todayRecs.filter(r => r.recordType === 'body' && r.data.weight != null)
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    if (bodies.length) weight = bodies[0].data.weight;
    const { streak, todayHas } = computeStreak(currentUser);
    const el = $('#chat-mini-stats');
    if (!el) return;
    const mb = todayRecs.find(isMoodBodyRecord);
    const moodLine = mb ? summaryMoodBody(mb.data) : '';
    let sealHtml = '';
    if (sealDiaryEnabled()) {
      const facts = collectDayFactsFromRecs(myRecords(), tk, currentUser);
      sealHtml = `<div class="seal-diary-chip">🦭 ${escapeHtml(composeSealDiaryLine(facts).line)}</div>`;
    }
    el.innerHTML =
      `<span>🔥 ${streak}日${todayHas ? '✓' : ''}</span>` +
      `<span>🍽 ${Math.round(kcal)} kcal</span>` +
      `<span>🏃 ${Math.round(exmin)} 分</span>` +
      `<span>⚖️ ${weight != null ? (+weight).toFixed(1) : '—'} kg</span>` +
      (moodLine ? `<span class="mood-chip">🌿 ${escapeHtml(moodLine)}</span>` : '') +
      sealHtml;
  }

  function fieldsLine(recordType, data) {
    if (!data) return '';
    if (recordType === 'body') {
      const parts = [];
      if (data.weight != null && data.weight !== '') parts.push('體重 ' + data.weight + ' kg');
      if (data.bodyFat != null && data.bodyFat !== '') parts.push('體脂 ' + data.bodyFat + '%');
      if (data.muscle != null && data.muscle !== '') parts.push('肌肉 ' + data.muscle + ' kg');
      if (data.waist != null && data.waist !== '') parts.push('腰圍 ' + data.waist + ' cm');
      return parts.join(' · ');
    }
    if (recordType === 'diet') {
      return `餐次 ${data.meal || '—'} · ${data.food || ''}` + (data.kcal != null ? ` · ${data.kcal} kcal` : '') + (data.protein != null ? ` · 蛋白 ${data.protein} g` : '');
    }
    if (recordType === 'exercise') {
      return `${data.exType || ''} · ${data.minutes || '—'} 分鐘` + (data.kcal != null ? ` · 約 ${data.kcal} kcal` : '') + (data.steps != null ? ` · ${data.steps} 步` : '');
    }
    if (recordType === 'sleep') {
      return `${data.sleepTime || '?'} → ${data.wakeTime || '?'} · ${data.duration || '—'} 小時`;
    }
    if (recordType === 'period' || (recordType === 'note' && (data.kind === 'cycle' || data.phase))) {
      const parts = [];
      if (data.phase === 'period_start') parts.push('開始');
      if (data.phase === 'period_end') parts.push('結束');
      if (data.flow && data.flow !== 'unknown') parts.push('流量 ' + data.flow);
      if (data.symptoms) parts.push(String(data.symptoms).slice(0, 24));
      return parts.join(' · ') || (data.cycle || data.mood || '').slice(0, 40);
    }
    if (recordType === 'lab') {
      const n = (data.items && data.items[0] && data.items[0].name) || '';
      return (data.org ? data.org + ' · ' : '') + n;
    }
    if (recordType === 'checkin' || (recordType === 'note' && data.kind === 'mood_body')) {
      return summaryMoodBody(data);
    }
    if (recordType === 'note') {
      return (data.mood || data.symptoms || '').slice(0, 60);
    }
    return '';
  }

  async function commitChatRecord(parsed, opts) {
    opts = opts || {};
    const isPublic = !!opts.isPublic;
    let attachments = [];
    let imageId = '';
    if (chatPendingImages && chatPendingImages.length) {
      attachments = await persistPendingImagesAsAttachments();
      if (attachments[0]) imageId = attachments[0].id;
    } else if (chatPendingImage && chatPendingImage.blob) {
      if (!idb) {
        toast('此瀏覽器不支援圖片儲存', 'warn');
      } else {
        imageId = 'img_' + uid();
        try {
          await idbPut(imageId, chatPendingImage.blob);
          attachments.push({ kind: 'image', id: imageId, bytes: chatPendingImage.blob.size, mime: 'image/jpeg', storage: 'idb', createdAt: nowTs() });
        } catch (err) {
          console.warn(err);
          toast('圖片儲存失敗', 'warn');
          imageId = '';
        }
      }
      if (chatPendingImage.previewUrl) {
        try { URL.revokeObjectURL(chatPendingImage.previewUrl); } catch (_) {}
      }
      chatPendingImage = null;
      const prev = $('#chat-attach-preview');
      if (prev) prev.innerHTML = '';
    }

    // lab 圖可掛 imageId
    let data = Object.assign({}, parsed.data);
    if (parsed.recordType === 'lab' && imageId) data.imageId = imageId;
    if (parsed.recordType === 'note' && imageId) {
      data.symptoms = (data.symptoms || '') + (data.symptoms ? ' ' : '') + '[有附件圖]';
    }

    const record = {
      recordId: uid(),
      ownerUser: currentUser,
      timestamp: nowTs(),
      updatedAt: nowTs(),
      recordType: parsed.recordType,
      isPublic,
      tags: parsed.tags || [],
      data,
      remark: parsed.remark || parsed.rawText || '',
      attachments,
      source: {
        channel: 'chat',
        rawText: parsed.rawText || '',
        confidence: parsed.confidence,
        messageId: null,
        attachments,
        clonedFrom: parsed.clonedFrom || null,
        aiSuggest: (data && data.aiSuggest) || null,
        ocr: (data && data.ocr) || null,
        stt: parsed.stt || null
      }
    };
    if (parsed.recordType === 'diet') bumpFoodFavorite({
      food: data.food, meal: data.meal, kcal: data.kcal, protein: data.protein, carb: data.carb, fat: data.fat
    });
    if ((parsed.recordType === 'period' || (parsed.recordType === 'note' && data && data.kind === 'cycle'))
        && data && data.phase === 'period_start' && typeof updateCyclePrediction === 'function') {
      try { updateCyclePrediction(); } catch (e) {}
    }
    let recordOut = record;
    if (parsed.recordType === 'checkin' && data && data.kind === 'mood_body') {
      const up = upsertMoodBodyCheckinInState(record);
      recordOut = up.record;
    } else {
      state.records.push(record);
    }
    chatPendingUndoId = recordOut.recordId;
    chatUndoStack.push(recordOut.recordId);
    if (chatUndoStack.length > 10) chatUndoStack = chatUndoStack.slice(-10);
    saveState();
    checkBadgesAfterSave(recordOut);

    const encourage = saveReplyForType(recordOut.recordType, recordOut.data);
    appendChatMessage({
      messageId: msgUid(),
      ownerUser: currentUser,
      threadId: 'self',
      role: 'bot',
      createdAt: nowTs(),
      text: encourage,
      linkedRecordId: null,
      card: null
    });

    const confirmMsg = appendChatMessage({
      messageId: msgUid(),
      ownerUser: currentUser,
      threadId: 'self',
      role: 'bot',
      createdAt: nowTs(),
      text: '',
      linkedRecordId: recordOut.recordId,
      card: {
        type: 'confirm',
        recordType: recordOut.recordType,
        typeLabel: displayTypeLabel(recordOut.recordType, recordOut.data),
        summary: parsed.summary || summaryMoodBody(recordOut.data),
        fields: fieldsLine(recordOut.recordType, recordOut.data),
        isPublic: !!recordOut.isPublic
      }
    });
    if (recordOut.source) recordOut.source.messageId = confirmMsg.messageId;
    // 用戶氣泡若帶圖
    saveState();
    renderChatThread();
    updateChatMiniStats();
    loadChatImages();
    renderToday();
    return recordOut;
  }

  async function handleChatUndo() {
    let targetId = null;
    while (chatUndoStack.length && !targetId) {
      const cand = chatUndoStack.pop();
      if (state.records.some(r => r.recordId === cand && r.ownerUser === currentUser)) targetId = cand;
    }
    if (!targetId) targetId = chatPendingUndoId;
    if (!targetId) {
      const last = myRecords().filter(r => r.source && r.source.channel === 'chat')
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
      if (!last) {
        appendChatMessage({
          messageId: msgUid(), ownerUser: currentUser, role: 'bot',
          createdAt: nowTs(), text: '沒有可取消的對話記錄。可連續回覆「取消」撤銷多筆。', card: null
        });
        renderChatThread();
        return;
      }
      targetId = last.recordId;
    }
    const idx = state.records.findIndex(r => r.recordId === targetId && r.ownerUser === currentUser);
    if (idx < 0) {
      toast('找不到可取消的記錄', 'warn');
      chatPendingUndoId = chatUndoStack.length ? chatUndoStack[chatUndoStack.length - 1] : null;
      return;
    }
    const removed = state.records[idx];
    if (removed.source && removed.source.attachments) {
      for (const a of removed.source.attachments) {
        if (a.id) try { await idbDel(a.id); } catch (_) {}
      }
    }
    if (removed.data && removed.data.imageId) {
      try { await idbDel(removed.data.imageId); } catch (_) {}
    }
    state.records.splice(idx, 1);
    chatUndoStack = chatUndoStack.filter(id => id !== targetId);
    chatPendingUndoId = chatUndoStack.length ? chatUndoStack[chatUndoStack.length - 1] : null;
    saveState();
    const left = chatUndoStack.length;
    appendChatMessage({
      messageId: msgUid(), ownerUser: currentUser, role: 'system',
      createdAt: nowTs(),
      text: `已取消：${TYPE_LABEL[removed.recordType] || ''} ${summarizeRecord(removed)}` +
        (left ? `（尚可再取消 ${left} 筆）` : ''),
      card: { type: 'undo' }
    });
    renderChatThread();
    updateChatMiniStats();
    renderToday();
    toast(left ? `已取消（尚可取消 ${left} 筆）` : '已取消上一筆', 'success');
  }

  async function handleChatSend(text) {
    const raw = String(text || '').trim();
    if (!raw && !chatPendingImage && !(chatPendingImages && chatPendingImages.length)) return;

    if (raw) {
      appendChatMessage({
        messageId: msgUid(), ownerUser: currentUser, role: 'user',
        createdAt: nowTs(), text: raw, card: null,
        imageId: null
      });
    } else if ((chatPendingImages && chatPendingImages.length) || chatPendingImage) {
      appendChatMessage({
        messageId: msgUid(), ownerUser: currentUser, role: 'user',
        createdAt: nowTs(),
        text: '［圖片 x' + (chatPendingImages.length || 1) + '］',
        card: null
      });
    }
    renderChatThread();

    if (raw && /^(取消|撤回|undo|cancel)$/i.test(raw)) {
      await handleChatUndo();
      return;
    }

    if (!raw && (chatPendingImages.length || chatPendingImage)) {
      // P0: 有圖 → 自動分類 + 確認卡（未寫入前 draft）
      if (!raw) {
        // already appended ［圖片附件］
      }
      const caption = raw || '';
      const meta0 = chatPendingImages[0] || chatPendingImage || {};
      const guess = classifyPhotoHeuristic(meta0, caption);
      appendChatMessage({
        messageId: msgUid(), ownerUser: currentUser, role: 'bot',
        createdAt: nowTs(),
        text: `自動分類：${TYPE_LABEL[guess.recordType] || guess.recordType}（${guess.reason || ''}）。請在確認卡修改完成後再入帳。`,
        card: null
      });
      renderChatThread();
      const attachments = await persistPendingImagesAsAttachments();
      let draft;
      if (guess.recordType === 'diet') draft = buildStubDietDraft(attachments, caption);
      else if (guess.recordType === 'exercise') draft = buildStubExerciseDraft(attachments, caption);
      else if (guess.recordType === 'body') draft = buildStubBodyDraft(attachments, caption);
      else draft = buildGenericDraft(guess.recordType, attachments, caption);
      draft.reason = guess.reason;
      draft.conf = guess.conf;
      renderDraftConfirmCard(draft);
      return;
    }
    if (!raw && chatPendingImage) {
      await commitChatRecord({
        ok: true, confidence: 0.6, recordType: 'note',
        data: { cycle: '', symptoms: '', mood: '圖片打卡' },
        remark: '圖片附件', summary: '圖片備註（請事後改細節）', rawText: ''
      }, { isPublic: !!(state.meta && state.meta.defaultPublic) });
      return;
    }

    // 文字 + 圖：先自動分類出 draft（帶文字作 caption）
    if (chatPendingImages && chatPendingImages.length) {
      const guess = classifyPhotoHeuristic(chatPendingImages[0], raw);
      const textGuess = guessTypeFromText(raw);
      const recordType = (textGuess.conf >= 0.8) ? textGuess.recordType : guess.recordType;
      appendChatMessage({
        messageId: msgUid(), ownerUser: currentUser, role: 'bot',
        createdAt: nowTs(),
        text: `收到文字＋${chatPendingImages.length} 圖 · 估計「${TYPE_LABEL[recordType]}」。請確認後入帳。`,
        card: null
      });
      renderChatThread();
      const attachments = await persistPendingImagesAsAttachments();
      // try parse text into fields
      const parsedTry = parseChatIntentSingle(raw, { forceType: recordType, lowerConfOk: true });
      let draft;
      if (parsedTry.ok && parsedTry.recordType === 'diet') {
        draft = buildStubDietDraft(attachments, raw);
        Object.assign(draft.data, parsedTry.data);
        draft.summary = parsedTry.summary;
      } else if (parsedTry.ok && parsedTry.recordType === 'exercise') {
        draft = buildStubExerciseDraft(attachments, raw);
        Object.assign(draft.data, parsedTry.data);
        draft.summary = parsedTry.summary;
      } else if (parsedTry.ok && parsedTry.recordType === 'body') {
        draft = buildStubBodyDraft(attachments, raw);
        Object.assign(draft.data, parsedTry.data);
        draft.summary = parsedTry.summary;
      } else if (recordType === 'diet') draft = buildStubDietDraft(attachments, raw);
      else if (recordType === 'exercise') draft = buildStubExerciseDraft(attachments, raw);
      else if (recordType === 'body') draft = buildStubBodyDraft(attachments, raw);
      else draft = buildGenericDraft(recordType, attachments, raw);
      draft.reason = guess.reason || textGuess.subtype;
      renderDraftConfirmCard(draft);
      return;
    }

    const parsed = parseChatIntent(raw);
    if (parsed.action === 'undo') {
      await handleChatUndo();
      return;
    }
    if (!parsed.ok) {
      if (parsed.clarify) {
        chatPendingClarify = parsed.clarify;
        const chips = (parsed.clarify.options || []).map((o, i) =>
          `<button type="button" data-clarify-i="${i}">${escapeHtml(o.label)}</button>`).join('');
        appendChatMessage({
          messageId: msgUid(), ownerUser: currentUser, role: 'bot',
          createdAt: nowTs(),
          text: parsed.ask || parsed.clarify.ask || '請再說明清楚一些',
          card: { type: 'clarify', options: parsed.clarify.options || [] }
        });
        // 重新 render 後注入 chips（renderChatBubble 處理 clarify）
        renderChatThread();
        return;
      }
      appendChatMessage({
        messageId: msgUid(), ownerUser: currentUser, role: 'bot',
        createdAt: nowTs(), text: parsed.ask || '無法理解，請再試一次。', card: null
      });
      renderChatThread();
      return;
    }
    const pub = !!(state.meta && state.meta.defaultPublic);
    if (parsed.multi && parsed.multi.length) {
      appendChatMessage({
        messageId: msgUid(), ownerUser: currentUser, role: 'bot',
        createdAt: nowTs(),
        text: `收到 ${parsed.multi.length} 筆，逐一入帳：`,
        card: null
      });
      for (const p of parsed.multi) {
        await commitChatRecord(p, { isPublic: pub });
      }
      return;
    }
    await commitChatRecord(parsed, { isPublic: pub });
  }

  function loadChatImages() {
    $all('img[data-chat-img]').forEach(async (img) => {
      if (img.dataset.loaded) return;
      const id = img.getAttribute('data-chat-img');
      try {
        const row = await idbGet(id);
        if (row && row.blob) {
          img.src = URL.createObjectURL(row.blob);
          img.dataset.loaded = '1';
        }
      } catch (_) {}
    });
  }

  function bindChatEvents() {
    const input = $('#chat-input');
    const sendBtn = $('#chat-send');
    if (!input || !sendBtn) return;

    const doSend = async () => {
      const t = input.value;
      input.value = '';
      sendBtn.disabled = true;
      try { await handleChatSend(t); }
      finally { sendBtn.disabled = false; input.focus(); }
    };
    sendBtn.onclick = doSend;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });

    // 快捷提示＋快速前綴 chips
    const fillHint = (b) => {
      if (b.dataset.hint === '取消') {
        input.value = '取消';
        doSend();
        return;
      }
      if (b.dataset.prefix != null) {
        input.value = b.dataset.prefix;
        input.focus();
        return;
      }
      if (b.dataset.hint) {
        input.value = b.dataset.hint;
        input.focus();
      }
    };
    const hints = $('#chat-hints');
    if (hints) hints.onclick = (e) => {
      const b = e.target.closest('[data-hint],[data-prefix]');
      if (b) fillHint(b);
    };
    const qchips = $('#chat-quick-chips');
    if (qchips) qchips.onclick = (e) => {
      const b = e.target.closest('[data-hint],[data-prefix]');
      if (b) fillHint(b);
    };
    const obClose = $('#onboard-close');
    if (obClose) obClose.onclick = dismissOnboard;

    // 圖片
    const fileInp = $('#chat-image-input');
    $('#chat-btn-image').onclick = () => fileInp && fileInp.click();
    if (fileInp) {
      fileInp.onchange = async (e) => {
        const files = e.target.files;
        e.target.value = '';
        if (!files || !files.length) return;
        try {
          await addFilesToPending(files);
        } catch (err) {
          console.warn(err);
          toast('圖片處理失敗', 'warn');
        }
      };
    }

    // 語音（Web Speech API）
    $('#chat-btn-voice').onclick = () => toggleSpeech();

    // 確認卡／澄清 chips（事件委託）
    $('#chat-thread').onclick = async (e) => {
      const clarifyBtn = e.target.closest('[data-clarify-fill]');
      if (clarifyBtn) {
        const fill = clarifyBtn.getAttribute('data-clarify-fill') || '';
        if (fill === '') {
          input.focus();
          toast('請改寫一句再送出', 'warn');
          return;
        }
        if (fill === '__confirm__') {
          input.value = '__confirm__';
          await doSend();
          return;
        }
        // 前綴（體重／第一餐…）或完整句
        if (fill.endsWith(' ') && fill.trim().split(/\s+/).length === 1) {
          input.value = fill;
          input.focus();
          return;
        }
        input.value = fill;
        await doSend();
        return;
      }
      const card = e.target.closest('.confirm-card');
      if (!card) return;
      const rid = card.dataset.rid;
      if (e.target.closest('.cc-edit')) {
        const rec = state.records.find(r => r.recordId === rid && r.ownerUser === currentUser);
        if (rec) fillFormForEdit(rec);
        return;
      }
      if (e.target.closest('.cc-undo')) {
        chatPendingUndoId = rid;
        await handleChatUndo();
        return;
      }
      if (e.target.closest('.cc-fav')) {
        const rec = state.records.find(r => r.recordId === rid && r.ownerUser === currentUser);
        if (rec && rec.recordType === 'diet') addFoodFavoriteFromRecord(rec);
        return;
      }
      if (e.target.closest('.cc-repeat')) {
        const rec = state.records.find(r => r.recordId === rid && r.ownerUser === currentUser);
        if (rec && rec.recordType === 'diet') await repeatDietRecord(rec);
        else if (rec && rec.recordType === 'exercise') await repeatExerciseRecord(rec);
        return;
      }
      if (e.target.classList.contains('cc-public')) {
        const rec = state.records.find(r => r.recordId === rid && r.ownerUser === currentUser);
        if (!rec) return;
        rec.isPublic = !!e.target.checked;
        rec.updatedAt = nowTs();
        saveState();
        const label = e.target.parentElement.nextElementSibling;
        if (label) label.textContent = rec.isPublic ? '公開' : '私密';
        toast(rec.isPublic ? '已設為允許搭檔查看' : '已設為私密', 'success');
        updateChatMiniStats();
      }
    };
  }

  function toggleSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = $('#chat-btn-voice');
    if (!SR) {
      toast('此瀏覽器不支援語音輸入，請改用文字（建議 Chrome／Safari）', 'warn');
      appendChatMessage({
        messageId: msgUid(), ownerUser: currentUser, role: 'bot',
        createdAt: nowTs(),
        text: '語音不可用。請以文字打卡，例如「體重 58.2」。',
        card: null
      });
      renderChatThread();
      return;
    }
    if (speechListening && speechRec) {
      try { speechRec.stop(); } catch (_) {}
      speechListening = false;
      if (btn) btn.classList.remove('recording');
      return;
    }
    speechRec = new SR();
    // 廣東話優先：yue-HK → zh-HK → zh-CN
    speechRec.lang = (window.__ffl_stt_lang) || 'yue-HK';
    try {
      const trial = speechRec.lang;
      // some browsers throw on unsupported lang at start(); keep fallback list
      speechRec._fflLangs = ['yue-HK', 'zh-HK', 'zh-CN'];
      if (!speechRec._fflLangs.includes(trial)) speechRec.lang = 'zh-HK';
    } catch (_) { speechRec.lang = 'zh-HK'; }
    speechRec.interimResults = false;
    speechRec.maxAlternatives = 1;
    speechRec.onresult = (ev) => {
      const t = ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript;
      const conf = ev.results[0] && ev.results[0][0] && ev.results[0][0].confidence;
      if (t) {
        $('#chat-input').value = t;
        // 放入輸入框供用戶修改；不即時入帳（確認優先）
        toast('已轉寫（' + (speechRec.lang || 'zh-HK') + '），請檢查後送出', 'success');
        appendChatMessage({
          messageId: msgUid(), ownerUser: currentUser, role: 'bot',
          createdAt: nowTs(),
          text: '語音轉寫：「' + t + '」· 請確認或改字後送出。',
          card: null
        });
        // stash stt meta on next send via input dataset
        $('#chat-input').dataset.sttLang = speechRec.lang || 'zh-HK';
        $('#chat-input').dataset.sttConf = conf != null ? String(conf) : '';
        renderChatThread();
      }
    };
    speechRec.onerror = (ev) => {
      speechListening = false;
      if (btn) btn.classList.remove('recording');
      // fallback language once
      const langs = (speechRec && speechRec._fflLangs) || ['zh-HK'];
      const idx = langs.indexOf(speechRec.lang);
      if (ev && ev.error === 'language-not-supported' && idx >= 0 && idx < langs.length - 1) {
        window.__ffl_stt_lang = langs[idx + 1];
        toast('改用 ' + window.__ffl_stt_lang + ' 再試語音', 'warn');
        return;
      }
      toast('語音識別失敗，請改打字', 'warn');
    };
    speechRec.onend = () => {
      speechListening = false;
      if (btn) btn.classList.remove('recording');
    };
    speechListening = true;
    if (btn) btn.classList.add('recording');
    try { speechRec.start(); toast('聆聽中…講完會自動入帳'); }
    catch (err) {
      speechListening = false;
      if (btn) btn.classList.remove('recording');
      toast('無法啟動語音', 'warn');
    }
  }

  function renderChatPage() {
    updateChatMiniStats();
    renderChatThread();
    loadChatImages();
  }


  /* ========== BloomBody P0 模組（自動分類／多圖／報告／收藏／經期／提醒／Stub） ========== */
  let chatPendingImages = []; // [{blob, previewUrl, name}]
  let chatPendingDraft = null; // draft confirm before save
  let chatAutoClassMode = 'auto'; // auto|diet|exercise|sleep|body|lab|note
  let reminderTimer = null;

  function ensureP0State() {
    if (!state.foodFavorites) state.foodFavorites = [];
    if (!Array.isArray(state.foodFavorites)) state.foodFavorites = [];
    if (!state.tagCatalog) state.tagCatalog = [
      { id: 't_hike', label: '行山', colorKey: 'mint' },
      { id: 't_knee', label: '膝護理', colorKey: 'mint' },
      { id: 't_show', label: '備節目', colorKey: 'mint' }
    ];
    if (!state.meta) state.meta = {};
    if (!state.meta.reminders) state.meta.reminders = [
      { id: 'rem_checkin', type: 'daily_checkin', timeLocal: '21:30', enabled: false, channel: 'browser' }
    ];
    if (!state.meta.cycleProfile) state.meta.cycleProfile = { avgCycleDays: 28, avgPeriodDays: 5, nextPredictedStart: null, isPublicDefault: false };
    if (!state.meta.profile) state.meta.profile = { age: null, heightCm: null, goalText: '保肌減脂' };
    if (state.meta.showSealDiary == null) state.meta.showSealDiary = true;
    if (!Array.isArray(state.habitDefs) || !state.habitDefs.length) {
      state.habitDefs = [
        { id: 'h_diet', name: '飲食打卡', ico: '🥗', autoFrom: 'diet' },
        { id: 'h_ex', name: '鍛煉', ico: '💪', autoFrom: 'exercise' },
        { id: 'h_sleep', name: '早睡', ico: '😴', autoFrom: 'sleep_early' },
        { id: 'h_review', name: '復盤', ico: '🔄', autoFrom: null },
        { id: 'h_happy', name: '每天開心', ico: '😊', autoFrom: null }
      ];
    }
    if (!state.habitMarks || typeof state.habitMarks !== 'object') state.habitMarks = {};
    Object.keys(state.users || {}).forEach(u => {
      const g = state.users[u].goals || {};
      if (g.kcal == null) g.kcal = 1600;
      if (g.protein == null) g.protein = 100;
      if (g.weightKg == null) g.weightKg = null;
      if (g.bodyFatPct == null) g.bodyFatPct = null;
      if (g.exerciseMinPerWeek == null) g.exerciseMinPerWeek = 150;
      if (g.carbG == null) g.carbG = 160;
      if (g.fatG == null) g.fatG = 55;
      if (!g.showdownDate) g.showdownDate = '20270301';
      state.users[u].goals = g;
    });
  }

  function collectAttachmentIds(rec) {
    const ids = [];
    if (!rec) return ids;
    if (rec.data && rec.data.imageId) ids.push(rec.data.imageId);
    const atts = (rec.attachments && rec.attachments.length) ? rec.attachments
      : (rec.source && rec.source.attachments) || [];
    atts.forEach(a => { if (a && a.id) ids.push(a.id); });
    return [...new Set(ids)];
  }

  async function deleteRecordWithPhotos(recordId) {
    const idx = state.records.findIndex(r => r.recordId === recordId && r.ownerUser === currentUser);
    if (idx < 0) return false;
    const removed = state.records[idx];
    for (const id of collectAttachmentIds(removed)) {
      try { await idbDel(id); } catch (_) {}
    }
    state.records.splice(idx, 1);
    saveState();
    return true;
  }

  function guessTypeFromText(text) {
    const t = String(text || '');
    if (/體重|体脂|腰圍|臀圍|inbody|體脂磅|肌肉量|內臟脂肪/i.test(t)) return { recordType: 'body', subtype: 'scale', conf: 0.85 };
    if (/第一餐|第二餐|第三餐|加餐|kcal|熱量|雞胸|雞蛋|飯|麵|食咗|吃了|外賣/i.test(t)) return { recordType: 'diet', subtype: 'meal', conf: 0.85 };
    if (/跑步|力量|有氧|行山|瑜伽|分鐘|keep|nike|workout|訓練/i.test(t)) return { recordType: 'exercise', subtype: 'workout', conf: 0.85 };
    if (/瞓|睡|入睡|起床|失眠/i.test(t)) return { recordType: 'sleep', subtype: 'night', conf: 0.8 };
    if (/化驗|膽固醇|體檢|LDL|抽血/i.test(t)) return { recordType: 'lab', subtype: 'lab', conf: 0.75 };
    if (/月經|經期|週期|周期|經血/i.test(t)) return { recordType: 'period', subtype: 'cycle', conf: 0.9 };
    if (/(心情|身體).{0,8}(精神|平穩|疲累|焦慮|低落|愉快|輕盈|正常|僵硬|痠痛|不適|有力)/.test(t) || /今天心情|今日狀態/.test(t))
      return { recordType: 'checkin', subtype: 'mood_body', conf: 0.9 };
    if (/情緒|心情|膝蓋|痛|備註/i.test(t)) return { recordType: 'note', subtype: 'mood', conf: 0.7 };
    return { recordType: 'note', subtype: 'unknown', conf: 0.4 };
  }

  /** 相片自動分類：檔名＋用戶模式＋簡易啟發式（離線 stub） */
  function classifyPhotoHeuristic(fileMeta, caption) {
    const mode = chatAutoClassMode || 'auto';
    if (mode !== 'auto') {
      const map = { diet: 'meal', exercise: 'ocr', sleep: 'sleep', body: 'scale', lab: 'lab', note: 'photo' };
      return { recordType: mode, subtype: map[mode] || 'photo', conf: 0.7, reason: '手動指定類別' };
    }
    const name = ((fileMeta && fileMeta.name) || '') + ' ' + (caption || '');
    const lower = name.toLowerCase();
    if (/keep|nike|strava|watch|workout|跑步|運動|screenshot|螢幕快照|屏幕/.test(lower) || /截圖|screenshot/i.test(lower)) {
      return { recordType: 'exercise', subtype: 'ocr', conf: 0.62, reason: '似運動截圖 → OCR Stub' };
    }
    if (/scale|inbody|體重|体重|體脂|体重計|體脂磅|weight/.test(lower)) {
      return { recordType: 'body', subtype: 'scale', conf: 0.6, reason: '似體脂磅／體重圖' };
    }
    if (/sleep|睡眠|睡眠|bed/.test(lower)) {
      return { recordType: 'sleep', subtype: 'sleep', conf: 0.55, reason: '似睡眠相關' };
    }
    if (/lab|blood|化驗|膽固醇|體檢/.test(lower)) {
      return { recordType: 'lab', subtype: 'lab', conf: 0.55, reason: '似體檢報告' };
    }
    // 預設：飲食相（餐盤／食物最常見）
    return { recordType: 'diet', subtype: 'ai_food', conf: 0.55, reason: '預設飲食相 → AI 食物 Stub' };
  }

  function clearPendingImages() {
    chatPendingImages.forEach(im => {
      if (im.previewUrl) try { URL.revokeObjectURL(im.previewUrl); } catch (_) {}
    });
    chatPendingImages = [];
    const prev = $('#chat-attach-preview');
    if (prev) prev.innerHTML = '';
  }

  function renderPendingGallery() {
    const prev = $('#chat-attach-preview');
    if (!prev) return;
    if (!chatPendingImages.length) { prev.innerHTML = ''; prev.classList.remove('multi'); return; }
    prev.classList.add('multi');
    const n = chatPendingImages.length;
    const show = chatPendingImages.slice(0, 12);
    const grid = show.map(im => `<img src="${im.previewUrl}" alt="">`).join('') +
      (n > 12 ? `<div class="pg-more">+${n - 12}</div>` : '');
    const bytes = chatPendingImages.reduce((s, im) => s + (im.blob ? im.blob.size : 0), 0);
    prev.innerHTML = `
      <div class="pg-toolbar">
        <span>已選 ${n} 張 · 約 ${Math.round(bytes/1024)} KB（本地壓縮）</span>
        <label>自動分類
          <select id="chat-autoclass-mode">
            <option value="auto">自動估計</option>
            <option value="diet">飲食（AI Stub）</option>
            <option value="exercise">運動（OCR Stub）</option>
            <option value="body">身體測量</option>
            <option value="sleep">睡眠</option>
            <option value="lab">體檢</option>
            <option value="note">備註</option>
            <option value="checkin">今日狀態</option>
          </select>
        </label>
        <button type="button" class="btn btn-ghost btn-sm" id="chat-clear-img">清空</button>
      </div>
      <div class="photo-gallery-grid">${grid}</div>
      <p class="stub-note">送出後會出確認卡（可改類別／數值），確認先入帳。熱量僅為估算。</p>`;
    const sel = $('#chat-autoclass-mode');
    if (sel) {
      sel.value = chatAutoClassMode;
      sel.onchange = () => { chatAutoClassMode = sel.value; };
    }
    const clr = $('#chat-clear-img');
    if (clr) clr.onclick = () => clearPendingImages();
  }

  async function addFilesToPending(fileList) {
    const files = Array.from(fileList || []).filter(f => f && f.type && f.type.startsWith('image/'));
    if (!files.length) return;
    toast(`壓縮 ${files.length} 張圖片中…`);
    for (const file of files) {
      try {
        const blob = await compressImageFile(file, 1280, 0.72);
        chatPendingImages.push({
          blob,
          previewUrl: URL.createObjectURL(blob),
          name: file.name || 'photo.jpg',
          bytes: blob.size,
          width: null,
          height: null
        });
      } catch (err) {
        console.warn(err);
        toast('有圖片壓縮失敗', 'warn');
      }
    }
    // 相容舊單一變數
    chatPendingImage = chatPendingImages.length ? chatPendingImages[0] : null;
    renderPendingGallery();
    toast(`已加入 ${files.length} 張，可再加或送出`, 'success');
  }

  async function persistPendingImagesAsAttachments() {
    const attachments = [];
    if (!idb && chatPendingImages.length) {
      toast('此瀏覽器不支援圖片儲存', 'warn');
      return attachments;
    }
    for (const im of chatPendingImages) {
      const imageId = 'img_' + uid();
      try {
        await idbPut(imageId, im.blob);
        attachments.push({
          id: imageId,
          kind: 'image',
          mime: 'image/jpeg',
          bytes: im.blob.size,
          createdAt: nowTs(),
          storage: 'idb',
          cloudKey: null,
          caption: im.name || ''
        });
      } catch (err) {
        console.warn(err);
      }
    }
    clearPendingImages();
    chatPendingImage = null;
    return attachments;
  }

  function buildStubDietDraft(attachments, caption) {
    const hour = new Date().getHours();
    let meal = '加餐';
    if (hour < 11) meal = '第一餐';
    else if (hour < 16) meal = '第二餐';
    else if (hour < 21) meal = '第三餐';
    return {
      recordType: 'diet',
      subtype: 'ai_food',
      stub: 'ai_food',
      summary: 'AI 食物辨認 Stub · 請改名／營養後確認',
      data: {
        meal,
        food: caption || '（請填食物名）',
        kcal: null,
        protein: null,
        carb: null,
        fat: null,
        sugar: null,
        aiSuggest: { provider: 'none', rawLabels: [], confidence: 0, status: 'stub' }
      },
      attachments,
      rawText: caption || '',
      conf: 0.55
    };
  }

  function buildStubExerciseDraft(attachments, caption) {
    return {
      recordType: 'exercise',
      subtype: 'ocr',
      stub: 'ocr',
      summary: '運動截圖 OCR Stub · 請填時長／消耗後確認',
      data: {
        exType: '其他',
        minutes: null,
        kcal: null,
        distanceKm: null,
        detail: caption || '',
        feel: null,
        ocr: { provider: 'none', rawText: '', confidence: 0, status: 'stub' }
      },
      attachments,
      rawText: caption || '',
      conf: 0.55
    };
  }

  function buildStubBodyDraft(attachments, caption) {
    return {
      recordType: 'body',
      subtype: 'scale',
      stub: 'scale',
      summary: '體脂磅圖 · 請填體重／體脂後確認',
      data: {
        source: '家用體脂磅',
        weight: null, bodyFat: null, muscle: null, skeletalMuscle: null,
        bmr: null, water: null, visceralFat: null, waist: null, hip: null, thigh: null, arm: null
      },
      attachments,
      rawText: caption || '',
      conf: 0.55
    };
  }

  function buildPeriodDraft(attachments, caption) {
    const t = caption || '';
    const phase = /開始|來了|來潮/.test(t) ? 'period_start' : (/結束|乾淨|完結/.test(t) ? 'period_end' : '');
    return {
      recordType: 'period', subtype: 'cycle', stub: null,
      summary: '經期記錄 · 請確認階段',
      data: {
        kind: 'cycle', phase,
        cycle: t.slice(0, 80), symptoms: '', mood: t.slice(0, 80) || '經期',
        flow: 'unknown'
      },
      attachments: attachments || [], rawText: t, conf: 0.85
    };
  }

  function buildGenericDraft(recordType, attachments, caption) {
    if (recordType === 'period') return buildPeriodDraft(attachments, caption);
    if (recordType === 'sleep') {
      return {
        recordType: 'sleep', subtype: 'sleep', stub: null,
        summary: '睡眠記錄 · 請補入睡／起床時間',
        data: { sleepTime: '', wakeTime: '', duration: null },
        attachments, rawText: caption || '', conf: 0.5
      };
    }
    if (recordType === 'lab') {
      return {
        recordType: 'lab', subtype: 'lab', stub: null,
        summary: '體檢記錄 · 請補項目',
        data: {
          labDate: todayKey().replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
          org: '', items: [{ name: '（請填項目）', value: '', range: '', note: '' }],
          imageId: (attachments[0] && attachments[0].id) || ''
        },
        attachments, rawText: caption || '', conf: 0.5
      };
    }
    return {
      recordType: 'note', subtype: 'photo', stub: null,
      summary: '備註 · 可改類別',
      data: { cycle: '', symptoms: '', mood: caption || '圖片備註', kind: '' },
      attachments, rawText: caption || '', conf: 0.45
    };
  }

  function renderDraftConfirmCard(draft) {
    chatPendingDraft = draft;
    const attIds = (draft.attachments || []).map(a => a.id);
    const gallery = attIds.length
      ? `<div class="photo-gallery-grid">${attIds.slice(0, 8).map(id => `<img data-chat-img="${escapeHtml(id)}" alt="">`).join('')}${attIds.length > 8 ? `<div class="pg-more">+${attIds.length - 8}</div>` : ''}</div>`
      : '';
    let fieldsHtml = '';
    if (draft.recordType === 'diet') {
      fieldsHtml = `
        <div class="draft-fields">
          <div class="form-group"><label>餐次</label>
            <select data-df="meal">
              ${['第一餐','第二餐','第三餐','加餐'].map(m => `<option value="${m}" ${draft.data.meal===m?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>食物名</label><input data-df="food" value="${escapeHtml(draft.data.food||'')}" placeholder="例如：雞胸沙律"></div>
          <div class="row-2">
            <div class="form-group"><label>kcal（估算）</label><input type="number" data-df="kcal" value="${draft.data.kcal??''}" inputmode="numeric"></div>
            <div class="form-group"><label>蛋白質 g</label><input type="number" data-df="protein" value="${draft.data.protein??''}" inputmode="decimal"></div>
          </div>
          <div class="row-2">
            <div class="form-group"><label>碳水 g</label><input type="number" data-df="carb" value="${draft.data.carb??''}" inputmode="decimal"></div>
            <div class="form-group"><label>脂肪 g</label><input type="number" data-df="fat" value="${draft.data.fat??''}" inputmode="decimal"></div>
          </div>
          <p class="stub-note">離線本地估計（收藏＋香港常見包裝）；可點選模板自動填入。熱量僅為估算。</p>
        </div>`;
    } else if (draft.recordType === 'exercise') {
      fieldsHtml = `
        <div class="draft-fields">
          <div class="form-group"><label>運動類型</label>
            <select data-df="exType">
              ${['力量訓練','有氧','跑步','行山','瑜伽','拉伸','其他'].map(m => `<option ${draft.data.exType===m?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="row-2">
            <div class="form-group"><label>分鐘</label><input type="number" data-df="minutes" value="${draft.data.minutes??''}" inputmode="numeric"></div>
            <div class="form-group"><label>消耗 kcal</label><input type="number" data-df="kcal" value="${draft.data.kcal??''}" inputmode="numeric"></div>
          </div>
          <div class="form-group"><label>距離 km（可空）</label><input type="number" data-df="distanceKm" value="${draft.data.distanceKm??''}" inputmode="decimal"></div>
          <p class="stub-note">OCR P0 為 Stub：請由截圖人手填寫後確認。</p>
        </div>`;
    } else if (draft.recordType === 'body') {
      fieldsHtml = `
        <div class="draft-fields">
          <div class="row-2">
            <div class="form-group"><label>體重 kg</label><input type="number" data-df="weight" value="${draft.data.weight??''}" inputmode="decimal"></div>
            <div class="form-group"><label>體脂 %</label><input type="number" data-df="bodyFat" value="${draft.data.bodyFat??''}" inputmode="decimal"></div>
          </div>
          <div class="row-2">
            <div class="form-group"><label>肌肉量 kg</label><input type="number" data-df="muscle" value="${draft.data.muscle??''}" inputmode="decimal"></div>
            <div class="form-group"><label>腰圍 cm</label><input type="number" data-df="waist" value="${draft.data.waist??''}" inputmode="decimal"></div>
          </div>
        </div>`;
    } else if (draft.recordType === 'sleep') {
      fieldsHtml = `
        <div class="draft-fields row-2">
          <div class="form-group"><label>入睡 HH:MM</label><input data-df="sleepTime" value="${escapeHtml(draft.data.sleepTime||'')}" placeholder="23:30"></div>
          <div class="form-group"><label>起床 HH:MM</label><input data-df="wakeTime" value="${escapeHtml(draft.data.wakeTime||'')}" placeholder="07:00"></div>
        </div>`;
    } else if (draft.recordType === 'period' || (draft.recordType === 'note' && draft.subtype === 'cycle')
        || (draft.data && (draft.data.kind === 'cycle' || draft.data.phase))) {
      const d = draft.data || {};
      fieldsHtml = `
        <div class="draft-fields">
          <div class="form-group"><label>階段</label>
            <select data-df="phase">
              <option value="" ${!d.phase?'selected':''}>未指定</option>
              <option value="period_start" ${d.phase==='period_start'?'selected':''}>經期開始</option>
              <option value="period_end" ${d.phase==='period_end'?'selected':''}>經期結束</option>
            </select>
          </div>
          <div class="form-group"><label>流量</label>
            <select data-df="flow">
              <option value="unknown" ${!d.flow||d.flow==='unknown'?'selected':''}>未記錄</option>
              <option value="light" ${d.flow==='light'?'selected':''}>少</option>
              <option value="medium" ${d.flow==='medium'?'selected':''}>中</option>
              <option value="heavy" ${d.flow==='heavy'?'selected':''}>多</option>
            </select>
          </div>
          <div class="form-group"><label>症狀／備註</label><textarea data-df="mood" rows="2">${escapeHtml(d.mood||d.cycle||d.symptoms||'')}</textarea></div>
          <p class="stub-note">經期記錄預設建議私密 · 參考估算 · 非執業醫療</p>
        </div>`;
    } else if (draft.recordType === 'lab') {
      const d = draft.data || {};
      const item0 = (d.items && d.items[0]) || {};
      fieldsHtml = `
        <div class="draft-fields">
          <div class="form-group"><label>機構</label><input data-df="org" value="${escapeHtml(d.org||'')}" placeholder="例如：診所／醫院"></div>
          <div class="form-group"><label>項目</label><input data-df="labItem" value="${escapeHtml(item0.name||'')}" placeholder="例如：膽固醇"></div>
          <div class="form-group"><label>數值</label><input data-df="labValue" value="${escapeHtml(item0.value||'')}"></div>
        </div>`;
    } else {
      fieldsHtml = `
        <div class="draft-fields">
          <div class="form-group"><label>備註內容</label><textarea data-df="mood" rows="2">${escapeHtml((draft.data && (draft.data.mood||draft.data.cycle))||'')}</textarea></div>
        </div>`;
    }
    const typeOpts = ['diet','exercise','body','sleep','lab','note','period'].map(t =>
      `<option value="${t}" ${draft.recordType===t?'selected':''}>${TYPE_LABEL[t]}</option>`).join('');
    const html = `
      <div class="chat-msg bot" data-draft="1">
        <div class="confirm-card draft-card" id="p0-draft-card">
          <div class="cc-head">
            <span class="cc-type">確認入帳 · ${escapeHtml(displayTypeLabel(draft.recordType, draft.data)||'')}</span>
            <span class="meta">${escapeHtml(nowTs())}</span>
          </div>
          <div class="cc-summary">${escapeHtml(draft.summary||'')}${draft.reason ? ' · ' + escapeHtml(draft.reason) : ''}</div>
          ${gallery}
          <div class="form-group" style="margin-top:8px;"><label>類別（可改）</label>
            <select id="p0-draft-type">${typeOpts}</select>
          </div>
          <div id="p0-draft-fields">${fieldsHtml}</div>
          <div class="cc-privacy">
            <label><input type="checkbox" id="p0-draft-public" ${state.meta && state.meta.defaultPublic ? 'checked' : ''}${draft.recordType==='period' || (draft.data && draft.data.kind==='cycle') ? '' : ''}> 允許搭檔查看</label>
          </div>
          <div class="form-group"><label>標籤（可選）</label>
            <div class="tag-row" id="p0-draft-tags">${(state.tagCatalog||[]).map(t =>
              `<button type="button" class="tag-chip" data-tag="${escapeHtml(t.label)}">${escapeHtml(t.label)}</button>`).join('')}</div>
          </div>
          <div class="cc-actions">
            <button type="button" class="btn btn-primary btn-sm" id="p0-draft-confirm" style="width:auto;">確認入帳</button>
            <button type="button" class="btn btn-ghost btn-sm" id="p0-draft-cancel">取消</button>
          </div>
          <div class="cc-hint">自動分類僅為估計 · 須確認後才寫入 · 熱量／消耗僅為參考估算 · 非執業醫療</div>
        </div>
      </div>`;
    const box = $('#chat-thread');
    if (box) {
      // append draft UI without persisting as message yet
      const wrap = document.createElement('div');
      wrap.innerHTML = html;
      box.appendChild(wrap.firstElementChild);
      box.scrollTop = box.scrollHeight;
      loadChatImages();
      bindDraftCardEvents();
    }
  }

  function bindDraftCardEvents() {
    const card = $('#p0-draft-card');
    if (!card || !chatPendingDraft) return;
    const typeSel = $('#p0-draft-type');
    if (typeSel) typeSel.onchange = () => {
      const t = typeSel.value;
      chatPendingDraft.recordType = t;
      if (t === 'diet') Object.assign(chatPendingDraft, buildStubDietDraft(chatPendingDraft.attachments, chatPendingDraft.rawText));
      else if (t === 'exercise') Object.assign(chatPendingDraft, buildStubExerciseDraft(chatPendingDraft.attachments, chatPendingDraft.rawText));
      else if (t === 'body') Object.assign(chatPendingDraft, buildStubBodyDraft(chatPendingDraft.attachments, chatPendingDraft.rawText));
      else if (t === 'period') Object.assign(chatPendingDraft, buildPeriodDraft(chatPendingDraft.attachments, chatPendingDraft.rawText));
      else Object.assign(chatPendingDraft, buildGenericDraft(t, chatPendingDraft.attachments, chatPendingDraft.rawText));
      // re-render fields only
      const host = $('#p0-draft-fields');
      // simplest: remove card and re-show
      const parent = card.closest('.chat-msg');
      if (parent) parent.remove();
      renderDraftConfirmCard(chatPendingDraft);
    };
    $all('#p0-draft-tags .tag-chip').forEach(btn => {
      btn.onclick = () => btn.classList.toggle('selected');
    });
    const conf = $('#p0-draft-confirm');
    if (conf) conf.onclick = () => commitDraftFromCard();
    const can = $('#p0-draft-cancel');
    if (can) can.onclick = async () => {
      // delete already-persisted attachment blobs if any
      for (const a of (chatPendingDraft.attachments || [])) {
        if (a.id) try { await idbDel(a.id); } catch (_) {}
      }
      chatPendingDraft = null;
      const parent = card.closest('.chat-msg');
      if (parent) parent.remove();
      appendChatMessage({
        messageId: msgUid(), ownerUser: currentUser, role: 'system',
        createdAt: nowTs(), text: '已取消圖片入帳', card: { type: 'undo' }
      });
      renderChatThread();
      toast('已取消', 'warn');
    };
  }

  function readDraftFields(recordType) {
    const root = $('#p0-draft-fields') || document;
    const val = (k) => {
      const el = root.querySelector(`[data-df="${k}"]`);
      if (!el) return null;
      const v = el.value;
      if (v === '' || v == null) return null;
      if (el.type === 'number') return +v;
      return v;
    };
    if (recordType === 'diet') {
      return {
        meal: val('meal') || '加餐',
        food: val('food') || '（未命名食物）',
        kcal: val('kcal'), protein: val('protein'), carb: val('carb'), fat: val('fat'), sugar: null,
        aiSuggest: { provider: 'none', rawLabels: [], confidence: 0, status: 'confirmed' }
      };
    }
    if (recordType === 'exercise') {
      return {
        exType: val('exType') || '其他',
        minutes: val('minutes'), kcal: val('kcal'), distanceKm: val('distanceKm'),
        detail: '', feel: null,
        ocr: { provider: 'none', rawText: '', confidence: 0, status: 'confirmed' }
      };
    }
    if (recordType === 'body') {
      return {
        source: '家用體脂磅',
        weight: val('weight'), bodyFat: val('bodyFat'), muscle: val('muscle'),
        skeletalMuscle: null, bmr: null, water: null, visceralFat: null,
        waist: val('waist'), hip: null, thigh: null, arm: null
      };
    }
    if (recordType === 'sleep') {
      let sleepTime = val('sleepTime') || '';
      let wakeTime = val('wakeTime') || '';
      let duration = null;
      if (sleepTime && wakeTime) {
        const [sh, sm] = sleepTime.split(':').map(Number);
        const [wh, wm] = wakeTime.split(':').map(Number);
        let mins = (wh * 60 + wm) - (sh * 60 + sm);
        if (mins < 0) mins += 24 * 60;
        duration = +(mins / 60).toFixed(1);
      }
      return { sleepTime, wakeTime, duration };
    }
    if (recordType === 'period') {
      const mood = val('mood') || '';
      const phaseEl = root.querySelector('[data-df="phase"]');
      const flowEl = root.querySelector('[data-df="flow"]');
      const phase = (phaseEl && phaseEl.value) || (/開始/.test(mood) ? 'period_start' : (/結束/.test(mood) ? 'period_end' : ''));
      const flow = (flowEl && flowEl.value) || 'unknown';
      return {
        kind: 'cycle', phase, flow,
        cycle: mood || '經期',
        symptoms: mood,
        mood: mood || '經期'
      };
    }
    if (recordType === 'note') {
      const mood = val('mood') || '';
      return {
        kind: '',
        phase: '',
        cycle: '',
        symptoms: '',
        mood
      };
    }
    if (recordType === 'lab') {
      const org = val('org') || '';
      const name = val('labItem') || '（請填項目）';
      const value = val('labValue') || '';
      return {
        labDate: todayKey().replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
        org,
        items: [{ name, value, range: '', note: '' }],
        imageId: ''
      };
    }
    return { labDate: todayKey().replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'), org: '', items: [], imageId: '' };
  }

  async function commitDraftFromCard() {
    if (!chatPendingDraft) return;
    const typeSel = $('#p0-draft-type');
    const recordType = typeSel ? typeSel.value : chatPendingDraft.recordType;
    const data = readDraftFields(recordType);
    if (recordType === 'lab' && chatPendingDraft.attachments && chatPendingDraft.attachments[0]) {
      data.imageId = chatPendingDraft.attachments[0].id;
    }
    const tags = $all('#p0-draft-tags .tag-chip.selected').map(b => b.getAttribute('data-tag')).filter(Boolean);
    const isPublic = !!( $('#p0-draft-public') && $('#p0-draft-public').checked );
    const attachments = chatPendingDraft.attachments || [];
    let summary = '';
    if (recordType === 'diet') summary = `${data.meal} · ${data.food}` + (data.kcal != null ? ` · 約 ${data.kcal} kcal` : '');
    else if (recordType === 'exercise') summary = `${data.exType}` + (data.minutes != null ? ` ${data.minutes} 分鐘` : '') + (data.kcal != null ? ` · 約 ${data.kcal} kcal` : '');
    else if (recordType === 'body') summary = [data.weight != null ? `體重 ${data.weight}` : '', data.bodyFat != null ? `體脂 ${data.bodyFat}%` : ''].filter(Boolean).join(' · ') || '身體測量';
    else if (recordType === 'sleep') summary = `${data.sleepTime || '?'} → ${data.wakeTime || '?'} · ${data.duration || '—'} 小時`;
    else if (recordType === 'period') summary = '經期' + (data.phase === 'period_start' ? '開始' : data.phase === 'period_end' ? '結束' : '') + (data.mood ? ' · ' + String(data.mood).slice(0, 30) : '');
    else summary = chatPendingDraft.summary || displayTypeLabel(recordType, data);

    const record = {
      recordId: uid(),
      ownerUser: currentUser,
      timestamp: nowTs(),
      updatedAt: nowTs(),
      recordType,
      isPublic,
      tags,
      data,
      remark: chatPendingDraft.rawText || '',
      attachments,
      source: {
        channel: 'chat',
        rawText: chatPendingDraft.rawText || '',
        confidence: chatPendingDraft.conf || 0.55,
        messageId: null,
        attachments,
        aiSuggest: data.aiSuggest || null,
        ocr: data.ocr || null,
        stt: null,
        clonedFrom: null
      }
    };
    state.records.push(record);
    chatUndoStack.push(record.recordId);
    chatPendingUndoId = record.recordId;
    if (chatUndoStack.length > 10) chatUndoStack = chatUndoStack.slice(-10);
    // auto-favorite diet?
    if (recordType === 'diet' && data.food && data.food !== '（請填食物名）' && data.food !== '（未命名食物）') {
      bumpFoodFavorite(data);
    }
    if ((recordType === 'period' || (recordType === 'note' && data.kind === 'cycle')) && data.phase === 'period_start') {
      try { updateCyclePrediction(); } catch (e) {}
    }
    saveState();
    checkBadgesAfterSave(record);
    chatPendingDraft = null;
    const encourage = saveReplyForType(recordType, data);
    appendChatMessage({
      messageId: msgUid(), ownerUser: currentUser, role: 'bot',
      createdAt: nowTs(), text: encourage, card: null
    });
    const confirmMsg = appendChatMessage({
      messageId: msgUid(), ownerUser: currentUser, role: 'bot',
      createdAt: nowTs(), text: '',
      linkedRecordId: record.recordId,
      card: {
        type: 'confirm',
        recordType,
        typeLabel: displayTypeLabel(recordType, data),
        summary,
        fields: fieldsLine(recordType, data),
        isPublic,
        attachmentIds: attachments.map(a => a.id)
      }
    });
    if (record.source) record.source.messageId = confirmMsg.messageId;
    saveState();
    renderChatThread();
    updateChatMiniStats();
    loadChatImages();
    renderToday();
    toast('已確認入帳', 'success');
  }

  function bumpFoodFavorite(data) {
    ensureP0State();
    let fav = state.foodFavorites.find(f => f.name === data.food);
    if (!fav) {
      fav = {
        id: 'fav_' + uid(),
        name: data.food,
        defaultMeal: data.meal || '加餐',
        kcal: data.kcal, proteinG: data.protein, carbsG: data.carb, fatG: data.fat,
        useCount: 0
      };
      state.foodFavorites.push(fav);
    }
    fav.useCount = (fav.useCount || 0) + 1;
    fav.kcal = data.kcal != null ? data.kcal : fav.kcal;
    fav.proteinG = data.protein != null ? data.protein : fav.proteinG;
    fav.defaultMeal = data.meal || fav.defaultMeal;
    // keep top by useCount
    state.foodFavorites.sort((a, b) => (b.useCount || 0) - (a.useCount || 0));
    if (state.foodFavorites.length > 40) state.foodFavorites = state.foodFavorites.slice(0, 40);
  }

  function addFoodFavoriteFromRecord(rec) {
    if (!rec || rec.recordType !== 'diet') return;
    bumpFoodFavorite({
      food: rec.data.food, meal: rec.data.meal,
      kcal: rec.data.kcal, protein: rec.data.protein, carb: rec.data.carb, fat: rec.data.fat
    });
    saveState();
    toast('已加入收藏：' + rec.data.food, 'success');
    renderFavoritesPanel();
  }

  async function repeatDietRecord(rec) {
    if (!rec || rec.recordType !== 'diet') return;
    const parsed = {
      ok: true,
      confidence: 0.95,
      recordType: 'diet',
      data: Object.assign({}, rec.data),
      remark: '再記一筆 · 複製自 ' + rec.timestamp,
      summary: `${rec.data.meal || '加餐'} · ${rec.data.food || ''}` + (rec.data.kcal != null ? ` · 約 ${rec.data.kcal} kcal` : ''),
      rawText: `再記一筆 ${rec.data.food || ''}`
    };
    const pub = !!(state.meta && state.meta.defaultPublic);
    const record = await commitChatRecord(parsed, { isPublic: pub });
    if (record && record.source) {
      record.source.clonedFrom = rec.recordId;
      record.source.channel = 'clone';
      saveState();
    }
    bumpFoodFavorite(rec.data);
    saveState();
    toast('已再記一筆（可改餐次）', 'success');
  }

  async function repeatExerciseRecord(rec) {
    if (!rec || rec.recordType !== 'exercise') return;
    const parsed = {
      ok: true,
      confidence: 0.95,
      recordType: 'exercise',
      data: Object.assign({}, rec.data),
      remark: '再記一筆 · 複製自 ' + rec.timestamp,
      summary: `${rec.data.exType || '運動'}` + (rec.data.minutes != null ? ` ${rec.data.minutes} 分鐘` : '') + (rec.data.kcal != null ? ` · 約 ${rec.data.kcal} kcal` : ''),
      rawText: `再記一筆 ${rec.data.exType || ''}`
    };
    const pub = !!(state.meta && state.meta.defaultPublic);
    const record = await commitChatRecord(parsed, { isPublic: pub });
    if (record && record.source) {
      record.source.clonedFrom = rec.recordId;
      record.source.channel = 'clone';
      saveState();
    }
    toast('已再記一筆運動', 'success');
  }

  function renderFavoritesPanel() {
    ensureP0State();
    const box = $('#fav-food-list');
    if (!box) return;
    const favs = state.foodFavorites.slice(0, 12);
    if (!favs.length) {
      box.innerHTML = '<p class="hint">飲食確認後可「收藏」；或在此查看常用項目。</p>';
      return;
    }
    box.innerHTML = favs.map(f =>
      `<button type="button" class="fav-chip" data-fav-id="${escapeHtml(f.id)}">${escapeHtml(f.name)}${f.kcal!=null?` · ${f.kcal}kcal`:''}</button>`
    ).join('');
  }

  function updateCyclePrediction() {
    ensureP0State();
    const starts = myRecords()
      .filter(r => (r.recordType === 'period' || r.recordType === 'note') && r.data && (r.recordType === 'period' || r.data.kind === 'cycle' || r.data.phase === 'period_start' || /月經|經期開始/.test(r.data.cycle || r.data.mood || '')))
      .map(r => tsDateKey(r.timestamp))
      .filter(Boolean)
      .sort();
    const uniq = [...new Set(starts)];
    if (uniq.length >= 2) {
      const gaps = [];
      for (let i = 1; i < uniq.length; i++) {
        const a = tsToDate(uniq[i - 1] + ' 00:00:00');
        const b = tsToDate(uniq[i] + ' 00:00:00');
        if (a && b) gaps.push(Math.round((b - a) / 86400000));
      }
      const avg = Math.round(gaps.reduce((s, x) => s + x, 0) / gaps.length) || 28;
      state.meta.cycleProfile.avgCycleDays = Math.min(45, Math.max(21, avg));
    }
    const last = uniq[uniq.length - 1];
    if (last) {
      const d = tsToDate(last + ' 00:00:00');
      if (d) {
        d.setDate(d.getDate() + (state.meta.cycleProfile.avgCycleDays || 28));
        const p = n => String(n).padStart(2, '0');
        state.meta.cycleProfile.nextPredictedStart = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
      }
    }
    saveState();
  }

  function formatYmdNice(ymd) {
    if (!ymd || ymd.length < 8) return '—';
    return `${ymd.slice(0,4)}.${ymd.slice(4,6)}.${ymd.slice(6,8)}`;
  }

  function renderCycleCard() {
    ensureP0State();
    updateCyclePrediction();
    const el = $('#cycle-predict-card');
    if (!el) return;
    const cp = state.meta.cycleProfile || {};
    el.innerHTML = `
      <strong>經期預測（規則 · 預設私密）</strong><br>
      平均週期約 <strong>${cp.avgCycleDays || 28}</strong> 日 ·
      預測下次開始：<strong>${formatYmdNice(cp.nextPredictedStart)}</strong><br>
      <span class="stub-note">以「記經期開始」或輸入「經期開始」累積。並非醫療診斷；圈子預設不顯示。</span>
      <div style="margin-top:6px;">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-log-period-start">記經期開始</button>
      </div>`;
    const b = $('#btn-log-period-start');
    if (b) b.onclick = async () => {
      await commitChatRecord({
        ok: true, confidence: 1, recordType: 'period',
        data: { kind: 'cycle', phase: 'period_start', cycle: '經期開始', symptoms: '', mood: '經期開始', flow: 'unknown' },
        remark: '經期開始', summary: '經期開始（建議私密）', rawText: '經期開始'
      }, { isPublic: false });
      updateCyclePrediction();
      renderCycleCard();
      toast('已記經期開始（私密）', 'success');
    };
  }

  function scoreClamp(n) { return Math.max(0, Math.min(100, Math.round(n))); }

  function aggregateRange(sk, ek) {
    const recs = myRecords().filter(r => {
      const k = tsDateKey(r.timestamp);
      return k >= sk && k <= ek;
    });
    const out = {
      recs,
      kcal: 0, protein: 0, carb: 0, fat: 0,
      exmin: 0, exKcal: 0, sleepH: 0, sleepN: 0,
      steps: 0, waterMl: 0,
      meals: { '第一餐': [], '第二餐': [], '第三餐': [], '加餐': [] },
      exercises: [],
      bodies: [],
      checkinDays: new Set()
    };
    recs.forEach(r => {
      out.checkinDays.add(tsDateKey(r.timestamp));
      const d = r.data || {};
      if (r.recordType === 'diet') {
        out.kcal += +(d.kcal || 0);
        out.protein += +(d.protein || 0);
        out.carb += +(d.carb || 0);
        out.fat += +(d.fat || 0);
        const m = d.meal || '加餐';
        if (!out.meals[m]) out.meals[m] = [];
        out.meals[m].push(r);
      }
      if (r.recordType === 'exercise') {
        out.exmin += +(d.minutes || 0);
        out.exKcal += +(d.kcal || 0);
        const st = +(d.steps || d.step || 0);
        if (st) out.steps += st;
        out.exercises.push(r);
      }
      if (r.recordType === 'sleep' && d.duration != null) {
        out.sleepH += +d.duration; out.sleepN++;
      }
      if (r.recordType === 'body') out.bodies.push(r);
      if (r.recordType === 'water' || d.kind === 'water' || d.glasses != null || d.ml != null) {
        out.waterMl += +(d.ml || (d.glasses || 0) * 250 || 0);
      }
      if (d.steps && r.recordType !== 'exercise') out.steps += +d.steps;
    });
    out.bodies.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return out;
  }


  /* ========== 目標推薦預設（參考估算／非執業醫療） ========== */
  const GOAL_PRESETS = [
    { id: 'preserve_cut', label: '保肌減脂', kcalMul: 0.92, proteinMul: 1.15,
      tipFocus: '溫和熱量缺口並優先蛋白質與阻力訓練，以利保肌減脂。' },
    { id: 'recomp', label: '增肌減脂', kcalMul: 0.98, proteinMul: 1.2,
      tipFocus: '接近維持熱量、提高蛋白與漸進超負荷，以利同時改善體成分。' },
    { id: 'cut_fat', label: '減脂肪', kcalMul: 0.85, proteinMul: 1.2,
      tipFocus: '適度熱量缺口並維持肌力訓練，重點觀察體脂而非單看體重。' },
    { id: 'lose_weight', label: '減重', kcalMul: 0.8, proteinMul: 1.1,
      tipFocus: '穩定熱量缺口與步行／有氧；留意體重下降速度與精力。' },
    { id: 'cut_lose', label: '減脂減重', kcalMul: 0.82, proteinMul: 1.15,
      tipFocus: '減脂與減重並行時，蛋白質與睡眠尤為重要，避免過度限制。' },
    { id: 'cut_muscle_lose', label: '減脂／減肌／減重', kcalMul: 0.78, proteinMul: 1.05,
      tipFocus: '此組合偏積極；長期極低熱量可能伴隨肌量下降，請定期檢視蛋白與訓練。' },
    { id: 'gain_muscle', label: '增肌', kcalMul: 1.1, proteinMul: 1.25,
      tipFocus: '輕度熱量盈餘＋充足蛋白與阻力訓練；體重上升屬常見過程。' },
    { id: 'lean_bulk', label: '增肌控脂', kcalMul: 1.05, proteinMul: 1.2,
      tipFocus: '小幅盈餘、控精緻碳水，兼顧增肌與體脂管理。' },
    { id: 'maintain', label: '維持健康', kcalMul: 1.0, proteinMul: 1.0,
      tipFocus: '維持熱量平衡、規律活動與睡眠，重點在可持續習慣。' },
    { id: 'custom', label: '自訂描述', kcalMul: 1.0, proteinMul: 1.0,
      tipFocus: '依您自訂目標調整飲食與訓練節奏。' }
  ];
  function getGoalPreset(idOrLabel) {
    const s = String(idOrLabel || '').trim();
    return GOAL_PRESETS.find(g => g.id === s || g.label === s) || GOAL_PRESETS[0];
  }
  function currentGoalPreset() {
    const p = (state.meta && state.meta.profile) || {};
    const u = (state.users && state.users[currentUser]) || {};
    const key = p.goalId || u.goalId || p.goalText || (u.goals && u.goals.goalText) || 'preserve_cut';
    return getGoalPreset(key);
  }
  function goalPresetOptionsHtml(selected) {
    const sel = selected || 'preserve_cut';
    return GOAL_PRESETS.map(g =>
      `<option value="${g.id}"${g.id === sel || g.label === sel ? ' selected' : ''}>${g.label}</option>`
    ).join('');
  }
  function applyGoalPresetDefaults(goalId, base) {
    const g = getGoalPreset(goalId);
    const b = base || { kcal: 1600, protein: 100 };
    return {
      kcal: Math.round((b.kcal || 1600) * g.kcalMul / 10) * 10,
      protein: Math.round((b.protein || 100) * g.proteinMul),
      goalId: g.id,
      goalText: g.label
    };
  }

  function rateBody(metric, value, goals) {
    if (value == null || value === '') return { rate: '—', cls: '', note: '未有數據' };
    if (metric === 'weight') {
      const g = goals.weightKg;
      if (g == null) return { rate: '參考', cls: 'rate-ok', note: '已記錄體重' };
      const d = value - g;
      if (Math.abs(d) <= 1) return { rate: '接近目標', cls: 'rate-ok', note: '貼近目標體重' };
      if (d > 0) return { rate: '高於目標', cls: 'rate-high', note: `距目標約 +${d.toFixed(1)} kg` };
      return { rate: '低於目標', cls: 'rate-ok', note: `低於目標 ${Math.abs(d).toFixed(1)} kg` };
    }
    if (metric === 'bodyFat') {
      if (value > 32) return { rate: '偏高', cls: 'rate-high', note: '體脂偏高，續保肌減脂' };
      if (value >= 22) return { rate: '標準偏高', cls: 'rate-high', note: '可繼續溫和減脂' };
      return { rate: '理想區', cls: 'rate-ok', note: '體脂狀態不錯' };
    }
    if (metric === 'bmi') {
      if (value >= 25) return { rate: '偏高', cls: 'rate-high', note: 'BMI≥25' };
      if (value < 18.5) return { rate: '偏低', cls: 'rate-low', note: '注意營養' };
      return { rate: '標準', cls: 'rate-ok', note: 'BMI 正常範圍' };
    }
    return { rate: '參考', cls: '', note: '' };
  }

  function buildSuggestions(agg, goals) {
    const tips = [];
    const days = Math.max(1, agg.checkinDays.size);
    const avgK = agg.kcal / days;
    if (avgK > 0 && goals.kcal && avgK > goals.kcal * 1.15) {
      tips.push('【參考估算】全日熱量高於目標約 15% 以上，建議檢視加餐與含糖飲料。');
    }
    if (avgK > 0 && goals.kcal && avgK < goals.kcal * 0.75) {
      tips.push('【參考估算】熱量明顯低於目標，請避免長期過低，以免影響代謝與訓練恢復。');
    }
    if (goals.protein && agg.protein / days < goals.protein * 0.85) {
      tips.push('【參考估算】蛋白質未達標，可考慮增加雞胸、蛋或乳清蛋白。');
    }
    if (agg.exmin / days < 20) {
      tips.push('【參考估算】運動分鐘偏少，本週可增加 2–3 次力量訓練或步行。');
    }
    if ((agg.steps || 0) / days < 5000 && (agg.steps || 0) > 0) {
      tips.push('【參考估算】日均步數偏低，可將步行納入日常通勤。');
    }
    if ((agg.waterMl || 0) / days > 0 && (agg.waterMl || 0) / days < 1500) {
      tips.push('【參考估算】飲水量可能不足，可分次補水至約 1.5–2 L（視個人與氣候）。');
    }
    const avgSleep = agg.sleepN ? agg.sleepH / agg.sleepN : null;
    if (avgSleep != null && avgSleep < 6.5) {
      tips.push('【參考估算】睡眠偏短，優先固定入睡時間，有助減脂與恢復。');
    }
    const preset = (typeof currentGoalPreset === 'function') ? currentGoalPreset() : null;
    if (preset && preset.tipFocus) {
      tips.unshift('【目標・' + preset.label + '】' + preset.tipFocus + '（參考估算／非執業醫療）');
    }
    if (preset && (preset.id === 'cut_fat' || preset.id === 'cut_lose' || preset.id === 'lose_weight' || preset.id === 'preserve_cut')) {
      if (goals.protein && agg.protein / days >= goals.protein * 0.9) {
        tips.push('【參考估算】蛋白質接近目標，有助減脂／減重期間減少肌量流失。');
      }
    }
    if (preset && (preset.id === 'gain_muscle' || preset.id === 'lean_bulk' || preset.id === 'recomp')) {
      if (agg.exmin / days < 25) {
        tips.push('【參考估算】增肌／增肌減脂宜每週至少 2–3 次阻力訓練，並確保恢復充足。');
      }
    }
    if (preset && preset.id === 'cut_muscle_lose') {
      tips.push('【參考估算】「減脂／減肌／減重」組合風險較高：請避免極端節食，並監察精力、訓練表現與月經規律（如適用）。');
    }
    if (!tips.length) tips.push('節奏穩定，請繼續規律記錄。不必苛責自己。');
    tips.push('以上為規則摘要（參考估算／非執業醫療），熱量與評分僅供自我對照。');
    return tips;
  }

  function buildFitFitLadyReportHTML(range) {
    ensureP0State();
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
    let start, end = now, titlePeriod;
    if (range === 'day') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      titlePeriod = '全日';
    } else if (range === 'week') {
      start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0,0,0,0);
      titlePeriod = '本週';
    } else {
      start = new Date(now); start.setDate(start.getDate() - 29); start.setHours(0,0,0,0);
      titlePeriod = '本月';
    }
    const sk = ymd(start), ek = ymd(end);
    const agg = aggregateRange(sk, ek);
    const goals = (state.users[currentUser] && state.users[currentUser].goals) || { kcal: 1600, protein: 100 };
    const profile = state.meta.profile || {};
    const latest = agg.bodies[0];
    const prev = agg.bodies[1];
    const w = latest && latest.data.weight != null ? +latest.data.weight : null;
    const bf = latest && latest.data.bodyFat != null ? +latest.data.bodyFat : null;
    const muscle = latest && latest.data.muscle != null ? +latest.data.muscle : null;
    const waterPct = latest && latest.data.water != null ? +latest.data.water : null;
    const visc = latest && latest.data.visceralFat != null ? +latest.data.visceralFat : null;
    const height = profile.heightCm ? +profile.heightCm : null;
    const bmi = (w && height) ? +(w / Math.pow(height / 100, 2)).toFixed(1) : null;
    const delta = (key) => {
      if (!latest || !prev || latest.data[key] == null || prev.data[key] == null) return '—';
      const d = +(latest.data[key] - prev.data[key]).toFixed(1);
      return (d > 0 ? '+' : '') + d;
    };
    const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const div = range === 'day' ? 1 : Math.max(1, agg.checkinDays.size || days);
    const avgK = Math.round(agg.kcal / div);
    const avgP = Math.round(agg.protein / div);
    const avgSteps = Math.round((agg.steps || 0) / div);
    const avgWater = Math.round((agg.waterMl || 0) / div);

    let dietScore = 70;
    if (goals.kcal && avgK) dietScore = scoreClamp(100 - Math.abs(avgK - goals.kcal) / goals.kcal * 100);
    let sleepScore = 70;
    const avgSleep = agg.sleepN ? agg.sleepH / agg.sleepN : null;
    if (avgSleep != null) sleepScore = scoreClamp(avgSleep >= 7 && avgSleep <= 9 ? 90 : 90 - Math.abs(avgSleep - 7.5) * 12);
    let exScore = scoreClamp(40 + Math.min(60, agg.exmin / (range === 'day' ? 0.6 : days * 0.4)));
    let stepScore = (agg.steps || 0) > 0 ? scoreClamp(30 + Math.min(70, avgSteps / 100)) : 60;
    let waterScore = avgWater > 0 ? scoreClamp(40 + Math.min(60, avgWater / 40)) : 60;
    let bodyScore = 75;
    if (bf != null) bodyScore = scoreClamp(bf <= 28 ? 88 : 88 - (bf - 28) * 3);
    const totalScore = scoreClamp(
      dietScore * 0.28 + sleepScore * 0.18 + exScore * 0.18 + stepScore * 0.12 + waterScore * 0.08 + bodyScore * 0.16
    );

    const wRate = rateBody('weight', w, goals);
    const bfRate = rateBody('bodyFat', bf, goals);
    const bmiRate = rateBody('bmi', bmi, goals);
    const tips = buildSuggestions(agg, goals);

    const mealHtml = ['第一餐','第二餐','第三餐','加餐'].map(m => {
      const list = agg.meals[m] || [];
      if (!list.length) return '';
      const lines = list.map(r => {
        const d = r.data;
        return `<div>· ${escapeHtml(d.food || '食物')} — ${d.kcal != null ? d.kcal + ' kcal' : '—'} · P${d.protein ?? '—'}g C${d.carb ?? '—'}g F${d.fat ?? '—'}g <span class="muted">${escapeHtml(r.timestamp.slice(9) || '')}</span></div>`;
      }).join('');
      const sumK = Math.round(list.reduce((s, r) => s + +(r.data.kcal || 0), 0));
      return `<div class="ffl-meal"><strong>${m}</strong>（約 ${sumK} kcal）<br>${lines}</div>`;
    }).join('') || '<div class="muted">此期間尚未有飲食記錄</div>';

    const exHtml = agg.exercises.length
      ? agg.exercises.map(r => {
          const st = r.data.steps || r.data.step;
          return `<div>· ${escapeHtml(r.data.exType || '運動')} ${r.data.minutes ?? '—'} 分 · 消耗約 ${r.data.kcal ?? '—'} kcal${st ? ' · 步數 ' + st : ''}</div>`;
        }).join('')
      : '<div class="muted">尚未有運動記錄</div>';

    const deadline = new Date('2027-03-01T00:00:00');
    const leftDays = Math.max(0, Math.ceil((deadline - now) / 86400000));
    const logo = document.querySelector('.app-header .brand img, .login-logo .logo-img');
    const logoSrc = logo ? logo.getAttribute('src') : '';
    const scoreBand = totalScore >= 85 ? '優良' : totalScore >= 70 ? '良好' : totalScore >= 55 ? '尚可' : '待加強';

    const mbAnal = analyzeMoodBodyRange(myRecords(), sk, ek, { ownerUser: currentUser, minDays: 5 });
    const todayFacts = collectDayFactsFromRecs(myRecords(), ek, currentUser);
    const sealOn = sealDiaryEnabled();
    const sealLine = sealOn ? composeSealDiaryLine(todayFacts).line : '';
    const moodFreqHtml = (mbAnal.moodFreq || []).slice(0, 6).map(x => escapeHtml(x.word) + ' ' + x.n).join('　') || '—';
    const bodyFreqHtml = (mbAnal.bodyFreq || []).slice(0, 6).map(x => escapeHtml(x.word) + ' ' + x.n).join('　') || '—';
    const assocHtml = mbAnal.enough && mbAnal.associations.length
      ? mbAnal.associations.map(a => `<div class="muted">· ${escapeHtml(a.text)}</div>`).join('')
      : `<div class="muted">${escapeHtml(mbAnal.emptyHint)}</div>`;
    const todayMoodLine = todayFacts.moodWord || todayFacts.bodyWord ? summaryMoodBody({ moodWord: todayFacts.moodWord, bodyWord: todayFacts.bodyWord }) : '';

    // BMR/TDEE/Macros（Harris–Benedict 主用；與小程序 nutrition.js 對齊）
    let nutriHtml = '';
    try {
      const sexR = (profile.gender || profile.sex || (state.users[currentUser] && state.users[currentUser].gender) || 'female');
      const wR = profile.weightKg != null ? +profile.weightKg : (w != null ? +w : null);
      const hR = profile.heightCm != null ? +profile.heightCm : null;
      const aR = profile.age != null ? +profile.age : 30;
      const actKeyR = (profile.activityLevel || 'light');
      const ACTR = { sedentary:1.2, light:1.375, moderate:1.55, active:1.725, athlete:1.9 };
      const actKR = ACTR[actKeyR] || 1.375;
      const femaleR = /female|^f$|女/i.test(String(sexR));
      let bmrHbR = null, bmrMfR = null;
      if (wR && hR) {
        bmrHbR = femaleR
          ? Math.round(447.593 + 9.247*wR + 3.098*hR - 4.330*aR)
          : Math.round(88.362 + 13.397*wR + 4.799*hR - 5.677*aR);
        const baseMf = 10*wR + 6.25*hR - 5*aR;
        bmrMfR = Math.round(femaleR ? baseMf - 161 : baseMf + 5);
      }
      const tdeeR = bmrHbR != null ? Math.round(bmrHbR * actKR) : null;
      const gKeyR = (typeof getGoalPreset === 'function' ? getGoalPreset(profile.goalId || profile.goalText || goals.goalId || goals.goalText) : { id:'preserve_cut', label:'保肌減脂' });
      const MACRO_ADJ = {
        preserve_cut:[-300,2.0,0.25], recomp:[-100,2.0,0.25], cut_fat:[-400,2.0,0.25],
        lose_weight:[-500,1.8,0.25], cut_lose:[-450,2.0,0.25], cut_muscle_lose:[-550,1.6,0.25],
        gain_muscle:[300,1.8,0.25], lean_bulk:[200,1.8,0.25], maintain:[0,1.6,0.30], custom:[0,1.6,0.30]
      };
      const adjR = MACRO_ADJ[gKeyR.id] || MACRO_ADJ.preserve_cut;
      const targetR = tdeeR != null ? Math.max(1200, Math.round(tdeeR + adjR[0])) : (goals.kcal || null);
      const pGR = wR ? Math.round(wR * adjR[1]) : (goals.protein || null);
      const fGR = targetR ? Math.round((targetR * adjR[2]) / 9) : null;
      const cGR = (targetR && pGR != null && fGR != null) ? Math.max(0, Math.round((targetR - pGR*4 - fGR*9)/4)) : null;
      const bmiR = (wR && hR) ? +(wR / ((hR/100)**2)).toFixed(1) : null;
      const vsTdee = (tdeeR != null && avgK) ? Math.round(avgK - tdeeR) : null;
      nutriHtml = `<div class="ffl-macros" style="margin-top:8px">
          <strong>專業熱量／巨量營養素（Harris–Benedict · 參考估算）</strong><br>
          BMR ${bmrHbR != null ? bmrHbR + ' kcal' : '—'} · TDEE ${tdeeR != null ? tdeeR + ' kcal' : '—'}（係數 ${actKR}）
          · Mifflin 對照 ${bmrMfR != null ? bmrMfR + ' kcal' : '—'}
          ${bmiR != null ? ' · BMI ' + bmiR : ''}<br>
          目標（${escapeHtml(gKeyR.label)}）熱量 ${targetR != null ? targetR + ' kcal' : '—'}
          · 蛋白 ${pGR != null ? pGR + ' g' : '—'} · 脂肪 ${fGR != null ? fGR + ' g' : '—'} · 碳水 ${cGR != null ? cGR + ' g' : '—'}
          ${vsTdee != null ? '<br>本期日均熱量相對 TDEE：' + (vsTdee>0?'+':'') + vsTdee + ' kcal' : ''}
          <br><span class="muted">主用 Harris–Benedict 修訂版（1984）；非執業醫療建議。</span>
        </div>`;
    } catch (eNutri) { console.warn('nutriHtml', eNutri); }



    return `
      <div class="ffl-report" data-range="${range}">
        <div class="ffl-brand">${logoSrc ? `<img src="${logoSrc}" alt="">` : '💪'} BloomBody</div>
        <h3>🗓️ ${formatYmdNice(ek)} ${titlePeriod}健康完整總結｜評分 + 數據拆解 + 優化建議</h3>
        <div class="ffl-meta">
          ${profile.age ? profile.age + '歲 · ' : ''}${profile.heightCm ? profile.heightCm + 'cm · ' : ''}
          ${w != null ? '體重 ' + w + 'kg · ' : ''}${bmi != null ? 'BMI ' + bmi + ' · ' : ''}
          目標：${escapeHtml(profile.goalText || goals.goalText || '保肌減脂')} · 打卡 ${agg.checkinDays.size}/${days} 日
          · <span class="score-pill">綜合 ${totalScore}/100（${scoreBand}）</span>
        </div>
        ${sealOn && sealLine ? `<div class="seal-diary-chip">🦭 ${escapeHtml(sealLine)}</div>` : ''}
        <div class="ffl-macros">
          <strong>評分結構（參考估算）</strong><br>
          飲食 ${dietScore} · 睡眠 ${sleepScore} · 運動 ${exScore} · 步數 ${stepScore} · 飲水 ${waterScore} · 身體 ${bodyScore}
          <br>每日營養參考：熱量 ${goals.kcal || 1600} kcal · 蛋白 ${goals.protein || 100}g
          ${goals.fatG ? ' · 脂肪 ' + goals.fatG + 'g' : ''} ${goals.carbG ? ' · 碳水 ' + goals.carbG + 'g' : ''}
          <br>本期均熱量約 <strong>${avgK}</strong> kcal／蛋白 <strong>${avgP}</strong> g（估算）
        </div>
        ${nutriHtml}
        <div class="ffl-section">一、身體數據｜評分 ${bodyScore}/100</div>
        <table class="ffl-table">
          <thead><tr><th>指標</th><th>數值</th><th>評級</th><th>對比</th><th>解讀</th></tr></thead>
          <tbody>
            <tr><td>體重</td><td>${w != null ? w + ' kg' : '—'}</td><td class="${wRate.cls}">${wRate.rate}</td><td>${delta('weight')}</td><td>${escapeHtml(wRate.note)}</td></tr>
            <tr><td>體脂率</td><td>${bf != null ? bf + '%' : '—'}</td><td class="${bfRate.cls}">${bfRate.rate}</td><td>${delta('bodyFat')}</td><td>${escapeHtml(bfRate.note)}</td></tr>
            <tr><td>肌肉量</td><td>${muscle != null ? muscle + ' kg' : '—'}</td><td class="rate-ok">${muscle != null ? '參考' : '—'}</td><td>${delta('muscle')}</td><td>保肌優先</td></tr>
            <tr><td>BMI</td><td>${bmi != null ? bmi : '—'}</td><td class="${bmiRate.cls}">${bmiRate.rate}</td><td>—</td><td>${escapeHtml(bmiRate.note)}</td></tr>
            <tr><td>內臟脂肪</td><td>${visc != null ? visc : '—'}</td><td class="${visc != null && visc >= 9 ? 'rate-high' : 'rate-ok'}">${visc != null && visc >= 9 ? '留意' : '參考'}</td><td>${delta('visceralFat')}</td><td>${visc != null && visc >= 9 ? '建議減少精緻碳水' : '—'}</td></tr>
            <tr><td>身體水分</td><td>${waterPct != null ? waterPct + '%' : '—'}</td><td class="rate-ok">參考</td><td>${delta('water')}</td><td>—</td></tr>
          </tbody>
        </table>
        <div class="ffl-section">二、飲食｜評分 ${dietScore}/100</div>
        ${mealHtml}
        <div class="ffl-section">三、運動｜評分 ${exScore}/100</div>
        <div>合計 ${Math.round(agg.exmin)} 分鐘 · 消耗約 ${Math.round(agg.exKcal)} kcal</div>
        ${exHtml}
        <div class="ffl-section">四、步數｜評分 ${stepScore}/100</div>
        <div>合計 ${Math.round(agg.steps || 0)} 步 · 日均約 ${avgSteps} 步（含運動記錄中的步數欄）</div>
        
        <div class="ffl-section">狀態與數據（參考估算）</div>
        ${todayMoodLine ? `<div>今日：${escapeHtml(todayMoodLine)}</div>` : '<div class="muted">今日尚未補登心情／身體狀態</div>'}
        <div>本期狀態記錄 ${mbAnal.count} 筆 · ${mbAnal.dayCount} 日</div>
        <div class="muted">心情：${moodFreqHtml}</div>
        <div class="muted">身體：${bodyFreqHtml}</div>
        ${assocHtml}
        <div class="muted">${escapeHtml(mbAnal.disclaimer)}</div>
        <div><button type="button" class="btn btn-ghost btn-sm" id="btn-fill-mood-body">補登今日狀態</button></div>

        <div class="ffl-section">五、睡眠｜評分 ${sleepScore}/100</div>
        <div>平均睡眠 ${avgSleep != null ? avgSleep.toFixed(1) + ' 小時' : '—'}（${agg.sleepN} 筆）</div>
        <div class="ffl-section">六、飲水｜評分 ${waterScore}/100</div>
        <div>合計約 ${Math.round(agg.waterMl || 0)} ml · 日均約 ${avgWater} ml</div>
        <div class="ffl-section">七、優化建議（參考估算 · 非執業醫療）</div>
        <div class="ffl-suggest"><ul>${tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul></div>
        <p class="stub-note" style="margin-top:10px;">BloomBody 結構化報告 · 參考估算 · 非執業醫療／非持牌診症 · 距 2027-03 備節目尚有 ${leftDays} 日 · 私密記錄已計入自己報告，分享時請只公開允許欄位</p>
      </div>`;
  }

  function renderDashboardP0(range) {
    range = range || 'day';
    const host = $('#ffl-dashboard');
    if (!host) return;
    $all('.dash-tab').forEach(t => t.classList.toggle('active', t.dataset.dash === range));
    host.innerHTML = buildFitFitLadyReportHTML(range);
    const fillMb = host.querySelector('#btn-fill-mood-body');
    if (fillMb) fillMb.onclick = () => {
      showPage('chat');
      const inp = $('#chat-input');
      if (inp) { inp.value = '今天心情平穩身體正常'; inp.focus(); }
      toast('請改用詞後送出，或點「今日狀態」提示', 'success');
    };
    const weeklyBox = $('#weekly-chat-report');
    if (weeklyBox && range === 'week') {
      // keep chat-style short summary too
    }
  }

  function pushReportToChat(range) {
    range = range || 'week';
    const tmp = document.createElement('div');
    tmp.innerHTML = buildFitFitLadyReportHTML(range);
    const text = tmp.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 1800);
    appendChatMessage({
      messageId: msgUid(), ownerUser: currentUser, role: 'bot',
      createdAt: nowTs(),
      text: text,
      card: { type: 'report', range }
    });
    renderChatThread();
    showPage('chat');
    toast('報告已放入對話', 'success');
  }

  function setupReminders() {
    ensureP0State();
    if (reminderTimer) clearInterval(reminderTimer);
    if (!(window.FFL_AuthGate ? FFL_AuthGate.isAuthed() : currentUser)) return;
    reminderTimer = (window.FFL_AuthGate ? FFL_AuthGate.trackInterval(checkReminders, 30000) : setInterval(checkReminders, 30000));
    checkReminders();
  }

  function checkReminders() {
    ensureP0State();
    const banner = $('#reminder-banner');
    const list = state.meta.reminders || [];
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const today = todayKey();
    for (const rem of list) {
      if (!rem.enabled) continue;
      if (rem.timeLocal !== hhmm) continue;
      const flag = APP_KEY + '_rem_' + rem.id + '_' + today;
      if (sessionStorage.getItem(flag)) continue;
      sessionStorage.setItem(flag, '1');
      const msg = rem.type === 'sleep' ? '夜深了，請記得記錄睡眠並早些休息 🌙' : '請記得今日健康打卡 💪';
      if (banner) {
        banner.hidden = false;
        banner.querySelector('.rb-text').textContent = msg;
      }
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('BloomBody', { body: msg }); } catch (_) {}
      }
    }
  }

  async function requestNotifPermission() {
    if (!('Notification' in window)) {
      toast('瀏覽器不支援系統通知，將改用應用內橫幅', 'warn');
      return;
    }
    const p = await Notification.requestPermission();
    toast(p === 'granted' ? '已開系統通知' : '未授權通知，改用 App 內提醒', p === 'granted' ? 'success' : 'warn');
  }

  function enhanceConfirmCardHtml(m, baseHtml) {
    // add gallery + fav/repeat buttons via post-process in patched renderChatBubble
    return baseHtml;
  }

  // Patch hooks called from existing code paths
  const _origRenderChatBubble = typeof renderChatBubble === 'function' ? renderChatBubble : null;


  // ---------- 事件綁定 ----------
  function bindEvents() {
    $('#btn-login').onclick = doLogin;
    $('#login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    $('#btn-logout').onclick = doLogout;
    $('#btn-medal-ok').onclick = () => $('#medal-modal').classList.remove('show');

    $all('.nav-item').forEach(n => n.onclick = () => showPage(n.dataset.nav));
    (function initSettingsTabs() {
      const page = document.getElementById('page-settings');
      const tabs = document.getElementById('settings-tabs');
      if (!page || !tabs) return;
      const STABS = ['account', 'goals', 'sync', 'data', 'advanced'];
      function applyStab(id) {
        if (!STABS.includes(id)) id = 'goals';
        STABS.forEach(s => page.classList.toggle('show-stab-' + s, s === id));
        tabs.querySelectorAll('button[data-stab]').forEach(b => {
          b.classList.toggle('active', b.dataset.stab === id);
        });
        try { localStorage.setItem('bb_settings_tab', id); } catch (e) {}
        // keep sticky tabs visible
        try { tabs.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      }
      tabs.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-stab]');
        if (!btn) return;
        applyStab(btn.dataset.stab);
      });
      let saved = 'goals';
      try { saved = localStorage.getItem('bb_settings_tab') || 'goals'; } catch (e) {}
      applyStab(saved);
      window.__bbApplySettingsTab = applyStab;
    })();
    bindChatEvents();
    const btnCir = $('#btn-circle-refresh');
    if (btnCir) btnCir.onclick = () => renderCirclePage();
    const cirType = $('#circle-type');
    if (cirType) cirType.onchange = () => renderCirclePage();
    const cirMem = $('#circle-member');
    if (cirMem) cirMem.onchange = () => renderCirclePage();
    $all('#add-tabs .sub-tab').forEach(t => t.onclick = () => showForm(t.dataset.form));
    $all('[data-quick]').forEach(b => b.onclick = () => showForm(b.dataset.quick));

    $all('form.form-panel').forEach(f => f.addEventListener('submit', handleFormSubmit));

    $('#food-chips').onclick = (e) => {
      const btn = e.target.closest('[data-fi]');
      if (!btn) return;
      const f = state.foods[+btn.dataset.fi];
      if (!f) return;
      const form = $('#form-diet');
      form.elements.food.value = f.name;
      form.elements.kcal.value = f.kcal;
      form.elements.protein.value = f.protein;
      form.elements.carb.value = f.carb;
      form.elements.fat.value = f.fat;
      form.elements.sugar.value = f.sugar;
    };
    $('#ex-chips').onclick = (e) => {
      const btn = e.target.closest('[data-ei]');
      if (!btn) return;
      const f = state.exercises[+btn.dataset.ei];
      if (!f) return;
      const form = $('#form-exercise');
      form.elements.exType.value = f.name;
      form.elements.minutes.value = f.minutes;
      form.elements.kcal.value = f.kcal;
    };

    $('#btn-add-lab-item').onclick = () => addLabItemRow();
    $('#lab-image-input').onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (pendingLabImage && pendingLabImage.previewUrl) {
        try { URL.revokeObjectURL(pendingLabImage.previewUrl); } catch (_) {}
      }
      pendingLabImage = { blob: file, previewUrl: URL.createObjectURL(file) };
      const img = $('#lab-img-preview');
      img.src = pendingLabImage.previewUrl;
      img.style.display = 'block';
    };

    $('#btn-hist-filter').onclick = renderHistory;
    $('#hist-type').onchange = renderHistory;

    $('#chart-range').onchange = () => {
      $('#chart-custom-dates').style.display = $('#chart-range').value === 'custom' ? 'grid' : 'none';
    };
    $('#btn-chart-refresh').onclick = renderChart;
    $('#btn-chart-save').onclick = () => {
      if (!mainChart) { toast('請先點選「更新圖表」', 'warn'); return; }
      try {
        const metric = ($('#chart-metric') && $('#chart-metric').value) || 'chart';
        const a = document.createElement('a');
        a.href = mainChart.toBase64Image('image/png', 1.0);
        a.download = `BloomBody_${metric}_${todayKey()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast('已下載 PNG（可放入報告）', 'success');
      } catch (err) {
        console.warn(err);
        toast('儲存失敗，請再試', 'warn');
      }
    };
    const btnWeekly = $('#btn-weekly-to-chat');
    if (btnWeekly) btnWeekly.onclick = () => {
      const txt = buildWeeklySummaryText();
      appendChatMessage({
        messageId: msgUid(), ownerUser: currentUser, role: 'bot',
        createdAt: nowTs(), text: txt, card: null
      });
      toast('週報已寫入對話', 'success');
      showPage('chat');
    };
    $('#chart-metric').onchange = renderChart;
    $('#chart-partner').onchange = renderChart;

    $('#btn-save-goals').onclick = () => {
      state.users[currentUser].goals = {
        kcal: +$('#set-kcal-goal').value || 1600,
        protein: +$('#set-pro-goal').value || 100
      };
      saveState();
      toast('目標已儲存', 'success');
      renderToday();
    };

    const sealToggle = $('#set-show-seal-diary');
    if (sealToggle) sealToggle.onchange = () => {
      ensureP0State();
      state.meta.showSealDiary = !!sealToggle.checked;
      saveState();
      updateChatMiniStats();
      toast(state.meta.showSealDiary ? '已顯示海豹日記' : '已隱藏海豹日記', 'success');
      try { if (typeof renderDashboardP0 === 'function') renderDashboardP0(); } catch (_) {}
    };
    const btnChatSet = $('#btn-save-chat-set');
    if (btnChatSet) btnChatSet.onclick = () => {
      if (!state.meta) state.meta = { version: 1, created: nowTs() };
      state.meta.defaultPublic = !!$('#set-default-public').checked;
      saveState();
      toast('對話設定已儲存', 'success');
    };
    $('#btn-change-pass').onclick = () => {
      const p = $('#set-new-pass').value;
      if (!p || p.length < 4) { toast('密碼至少 4 個字元', 'warn'); return; }
      state.users[currentUser].password = p;
      saveState();
      $('#set-new-pass').value = '';
      toast('密碼已更新', 'success');
    };
    $('#btn-export-csv').onclick = () => exportCSV(false);
    $('#btn-export-json').onclick = () => exportJSON(false);
    $('#btn-export-pdf').onclick = exportPDF;
    $('#btn-export-all').onclick = () => {
      if (!confirm('匯出全部用戶資料？')) return;
      exportCSV(true);
      exportJSON(true);
    };
    $('#import-json').onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importJSON(f).finally(() => { e.target.value = ''; });
    };
    const importCsvEl = $('#import-csv');
    if (importCsvEl) importCsvEl.onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importCSV(f).finally(() => { e.target.value = ''; });
    };
    $('#btn-reset-foods').onclick = () => {
      if (!confirm('重置常用食物為預設清單？')) return;
      state.foods = DEFAULT_FOODS.slice();
      saveState();
      renderFoodChips();
      toast('已重置食物清單', 'success');
    };
    $('#btn-add-user').onclick = () => {
      const name = prompt('新用戶名稱（英文／數字）：');
      if (!name || !/^[A-Za-z0-9_\u4e00-\u9fff]+$/.test(name)) { toast('名稱無效', 'warn'); return; }
      if (state.users[name]) { toast('用戶已存在', 'warn'); return; }
      const pass = prompt('設定密碼（至少4字元）：') || 'changeme';
      state.users[name] = { password: pass, goals: { kcal: 1600, protein: 100 }, badges: [] };
      saveState();
      refreshUserSelect();
      toast('已新增用戶 ' + name, 'success');
    };
    $('#btn-clear-all').onclick = () => {
      if (!confirm('確定清除全部本地資料？此操作無法復原！')) return;
      if (!confirm('再確認一次：會刪除所有用戶記錄、設定同相片。')) return;
      localStorage.removeItem(APP_KEY);
      localStorage.removeItem(APP_KEY_LEGACY);
      sessionStorage.removeItem(APP_KEY + '_session');
      sessionStorage.removeItem(APP_KEY_LEGACY + '_session');
      if (idb) {
        const tx = idb.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).clear();
      }
      loadState();
      doLogout();
      toast('已清除全部資料同相片');
    };

    // P0 bindings
    const btnClearMine = $('#btn-clear-my-data');
    if (btnClearMine) btnClearMine.onclick = async () => {
      if (!confirm('清除「' + currentUser + '」全部記錄同相片？無法復原！')) return;
      if (!confirm('請再確認：僅刪除您自己的資料。')) return;
      const mine = state.records.filter(r => r.ownerUser === currentUser);
      for (const r of mine) {
        for (const id of collectAttachmentIds(r)) {
          try { await idbDel(id); } catch (_) {}
        }
      }
      state.records = state.records.filter(r => r.ownerUser !== currentUser);
      state.chatMessages = (state.chatMessages || []).filter(m => m.ownerUser && m.ownerUser !== currentUser);
      saveState();
      renderChatPage();
      renderToday();
      toast('已清除你的資料同相片', 'success');
    };
    $all('.dash-tab').forEach(t => t.onclick = () => renderDashboardP0(t.dataset.dash));
    const btnRep = $('#btn-report-to-chat');
    if (btnRep) btnRep.onclick = () => {
      const a = document.querySelector('.dash-tab.active');
      pushReportToChat(a ? a.dataset.dash : 'week');
    };
    const btnRegen = $('#btn-regen-report');
    if (btnRegen) btnRegen.onclick = () => {
      const a = document.querySelector('.dash-tab.active');
      renderDashboardP0(a ? a.dataset.dash : 'day');
      toast('已重新生成', 'success');
    };

    function syncGoalUiFromSelect() {
      const sgi = $('#set-goal-id');
      if (!sgi) return;
      const preset = getGoalPreset(sgi.value);
      const wrap = $('#set-goal-text-wrap');
      if (wrap) wrap.style.display = (preset.id === 'custom') ? '' : 'none';
      const hint = $('#set-goal-hint');
      if (hint) hint.textContent = preset.tipFocus + '（參考估算／非執業醫療）';
      const sg = $('#set-goal-text');
      if (sg && preset.id !== 'custom') sg.value = preset.label;
    }
    const sgiEl = $('#set-goal-id');
    if (sgiEl && !sgiEl._goalWired) {
      sgiEl.addEventListener('change', syncGoalUiFromSelect);
      sgiEl._goalWired = true;
    }
    const btnApplyGoal = $('#btn-apply-goal-preset');
    if (btnApplyGoal && !btnApplyGoal._goalWired) {
      btnApplyGoal.onclick = () => {
        const sgi = $('#set-goal-id');
        const preset = getGoalPreset(sgi ? sgi.value : 'preserve_cut');
        const defs = applyGoalPresetDefaults(preset.id, { kcal: 1600, protein: 100 });
        if ($('#set-kcal-goal')) $('#set-kcal-goal').value = defs.kcal;
        if ($('#set-pro-goal')) $('#set-pro-goal').value = defs.protein;
        toast('已依「' + preset.label + '」套用參考熱量 ' + defs.kcal + '／蛋白 ' + defs.protein + '（參考估算／非執業醫療）', 'ok');
      };
      btnApplyGoal._goalWired = true;
    }

    const btnSaveGoals = $('#btn-save-goals');
    if (btnSaveGoals) {
      const prev = btnSaveGoals.onclick;
      btnSaveGoals.onclick = () => {
        ensureP0State();
        const g = state.users[currentUser].goals;
        g.kcal = +($('#set-kcal-goal').value || 1600);
        g.protein = +($('#set-pro-goal').value || 100);
        const sw = $('#set-weight-goal'); if (sw) g.weightKg = sw.value === '' ? null : +sw.value;
        const sb = $('#set-bf-goal'); if (sb) g.bodyFatPct = sb.value === '' ? null : +sb.value;
        const se = $('#set-exmin-goal'); if (se) g.exerciseMinPerWeek = se.value === '' ? 150 : +se.value;
        const sh = $('#set-height'); if (sh) state.meta.profile.heightCm = sh.value === '' ? null : +sh.value;
        const sgi = $('#set-goal-id');
        const sg = $('#set-goal-text');
        if (!state.meta.profile) state.meta.profile = {};
        if (sgi && sgi.value) {
          const preset = getGoalPreset(sgi.value);
          state.meta.profile.goalId = preset.id;
          state.meta.profile.goalText = (sg && sg.value && sgi.value === 'custom') ? (sg.value || preset.label) : preset.label;
          if (state.users[currentUser]) {
            state.users[currentUser].goalId = preset.id;
            if (!state.users[currentUser].goals) state.users[currentUser].goals = {};
            state.users[currentUser].goals.goalText = state.meta.profile.goalText;
          }
          if (sgi.value !== 'custom' && typeof applyGoalPresetDefaults === 'function') {
            const base = { kcal: +($('#set-kcal-goal').value || 1600), protein: +($('#set-pro-goal').value || 100) };
            // keep user-entered kcal/protein; only sync labels
          }
        } else if (sg) {
          state.meta.profile.goalText = sg.value || '保肌減脂';
        }
        saveState();
        toast('已儲存目標', 'success');
        renderToday();
      };
    }
    const btnRem = $('#btn-save-remind');
    if (btnRem) btnRem.onclick = () => {
      ensureP0State();
      const rt = $('#set-remind-checkin');
      const ro = $('#set-remind-on');
      state.meta.reminders = [{
        id: 'rem_checkin', type: 'daily_checkin',
        timeLocal: (rt && rt.value) || '21:30',
        enabled: !!(ro && ro.checked),
        channel: 'browser'
      }];
      saveState();
      setupReminders();
      toast('已儲存提醒', 'success');
    };
    const btnNotif = $('#btn-notif-perm');
    if (btnNotif) btnNotif.onclick = () => requestNotifPermission();
    const btnTag = $('#btn-add-tag');
    if (btnTag) btnTag.onclick = () => {
      ensureP0State();
      const inp = $('#set-new-tag');
      const label = (inp && inp.value || '').trim();
      if (!label) { toast('請輸入標籤', 'warn'); return; }
      if (state.tagCatalog.some(t => t.label === label)) { toast('已有呢個標籤', 'warn'); return; }
      state.tagCatalog.push({ id: 't_' + uid(), label, colorKey: 'mint' });
      saveState();
      if (inp) inp.value = '';
      renderSettings();
      toast('已加標籤', 'success');
    };
    const favBox = $('#fav-food-list');
    if (favBox) favBox.onclick = async (e) => {
      const b = e.target.closest('[data-fav-id]');
      if (!b) return;
      const fav = (state.foodFavorites || []).find(f => f.id === b.getAttribute('data-fav-id'));
      if (!fav) return;
      await commitChatRecord({
        ok: true, confidence: 1, recordType: 'diet',
        data: { meal: fav.defaultMeal || '加餐', food: fav.name, kcal: fav.kcal, protein: fav.proteinG, carb: fav.carbsG, fat: fav.fatG, sugar: null },
        remark: '常用收藏', summary: `${fav.defaultMeal || '加餐'} · ${fav.name}` + (fav.kcal != null ? ` · ${fav.kcal} kcal` : ''),
        rawText: fav.name
      }, { isPublic: !!(state.meta && state.meta.defaultPublic) });
      bumpFoodFavorite({ food: fav.name, meal: fav.defaultMeal, kcal: fav.kcal, protein: fav.proteinG, carb: fav.carbsG, fat: fav.fatG });
      saveState();
      showPage('chat');
    };
    const rd = $('#reminder-dismiss');
    if (rd) rd.onclick = () => { const b = $('#reminder-banner'); if (b) b.hidden = true; };

    // enhance history delete to cascade photos
    document.body.addEventListener('click', async (e) => {
      const delBtn = e.target.closest('[data-del-rid]');
      if (!delBtn) return;
      const rid = delBtn.getAttribute('data-del-rid');
      if (!confirm('刪除此記錄同埋相關相片？')) return;
      await deleteRecordWithPhotos(rid);
      renderHistory();
      toast('已刪除記錄同相片', 'success');
    });
  }

  // ---------- 啟動 ----------
  async function init() {
    loadState();
    ensureP0State();
    refreshUserSelect();
    try { await openIDB(); } catch (e) { console.warn('IDB', e); }
    bindEvents();
    bindSleepAuto();
    addLabItemRow({ name: '低密度膽固醇 LDL' });
    addLabItemRow({ name: '轉氨酶 ALT' });
    $all('.ts-input').forEach(inp => { inp.value = nowTs(); });
    tryRestoreSession();
    // Heavy UI / intervals only after login (login screen RAM budget <500MB)
    if (window.FFL_AuthGate) {
      FFL_AuthGate.whenAuthed(function () {
        try { setupReminders(); } catch (e) { console.warn(e); }
        try { bindHabitsUI(); } catch (e) { console.warn(e); }
        try { if (typeof bindP1UI === 'function') bindP1UI(); } catch (e) { console.warn(e); }
        try { if (typeof bindPetAndTagUI === 'function') bindPetAndTagUI(); } catch (e) { console.warn(e); }
        try { if (typeof bootFflDiaryAuthTheme === 'function') bootFflDiaryAuthTheme(); } catch (e) { console.warn(e); }
        try { if (typeof renderChallengeCard === 'function') renderChallengeCard(); } catch (e) { console.warn(e); }
      }, 'init-heavy');
      if (FFL_AuthGate.isAuthed()) FFL_AuthGate.notifyLogin();
      else {
        try { if (typeof bootFflDiaryAuthTheme === 'function') bootFflDiaryAuthTheme(); } catch (e) { console.warn(e); }
      }
    } else {
      setupReminders();
      try { bindHabitsUI(); } catch (e) { console.warn(e); }
      try { if (typeof bindP1UI === 'function') bindP1UI(); } catch (e) { console.warn(e); }
      try { if (typeof bindPetAndTagUI === 'function') bindPetAndTagUI(); } catch (e) { console.warn(e); }
      try { if (typeof bootFflDiaryAuthTheme === 'function') bootFflDiaryAuthTheme(); } catch (e) { console.warn(e); }
      try { if (typeof renderChallengeCard === 'function') renderChallengeCard(); } catch (e) { console.warn(e); }
    }
  }

  /* ========== 每日／每週復盤 Habit Grid（IIFE 頂層，勿困在 readyState else） ========== */
  const HABIT_DOW = ['日', '一', '二', '三', '四', '五', '六'];
  const DEFAULT_HABITS = [
    { id: 'h_diet', name: '飲食打卡', ico: '🥗', autoFrom: 'diet' },
    { id: 'h_ex', name: '鍛煉', ico: '💪', autoFrom: 'exercise' },
    { id: 'h_sleep', name: '早睡', ico: '😴', autoFrom: 'sleep_early' },
    { id: 'h_review', name: '復盤', ico: '🔄', autoFrom: null },
    { id: 'h_happy', name: '每天開心', ico: '😊', autoFrom: null }
  ];
  let habitWeekOffset = 0; // 0 = current week

  function ensureHabitState() {
    ensureP0State();
    if (!Array.isArray(state.habitDefs) || !state.habitDefs.length) {
      state.habitDefs = DEFAULT_HABITS.map(h => ({ ...h }));
    }
    if (!state.habitMarks || typeof state.habitMarks !== 'object') state.habitMarks = {};
  }

  function startOfWeekSun(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - x.getDay()); // Sunday
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function habitWeekDates(offset) {
    const base = startOfWeekSun(new Date());
    base.setDate(base.getDate() + offset * 7);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      days.push(d);
    }
    return days;
  }
  function dateKeyLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }
  function weekKeyFromDates(days) {
    return dateKeyLocal(days[0]);
  }
  function fmtWeekRange(days) {
    const a = days[0], b = days[6];
    const f = (d) => `${d.getFullYear()} ${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
    return `${f(a)} – ${b.getMonth() + 1}.${String(b.getDate()).padStart(2, '0')}`;
  }

  function parseHourMin(str) {
    if (!str) return null;
    const m = String(str).match(/(\d{1,2})[:：](\d{2})/);
    if (!m) return null;
    return (+m[1]) * 60 + (+m[2]);
  }

  /** Auto status for a habit on a given YYYYMMDD from records */
  function autoHabitStatus(habit, dateKey) {
    if (!habit.autoFrom) return null;
    const recs = myRecords().filter(r => tsDateKey(r.timestamp) === dateKey);
    if (habit.autoFrom === 'diet') {
      return recs.some(r => r.recordType === 'diet') ? { v: 'a', note: '有飲食' } : null;
    }
    if (habit.autoFrom === 'exercise') {
      const ex = recs.filter(r => r.recordType === 'exercise');
      if (!ex.length) return null;
      const mins = ex.reduce((s, r) => s + (+(r.data && r.data.minutes) || 0), 0);
      return { v: 'a', note: mins ? `${mins}分` : '有運動' };
    }
    if (habit.autoFrom === 'sleep_early') {
      const sleeps = recs.filter(r => r.recordType === 'sleep');
      if (!sleeps.length) return null;
      const last = sleeps[sleeps.length - 1];
      const mins = parseHourMin(last.data && last.data.sleepTime);
      // 早睡：22:30 前入睡；若無時間但有睡眠紀錄 → 只標「有睡」不算早睡自動勾
      if (mins == null) return { v: null, note: '有睡' }; // show note only? treat as no auto check
      if (mins <= 22 * 60 + 30) return { v: 'a', note: last.data.sleepTime };
      // late sleep → suggest miss as soft? keep empty, note time
      return { v: null, note: last.data.sleepTime || '' };
    }
    return null;
  }

  function getMark(weekKey, habitId, dayIdx) {
    const w = state.habitMarks[weekKey] || {};
    const h = w[habitId] || {};
    return h[String(dayIdx)] || null;
  }
  function setMark(weekKey, habitId, dayIdx, mark) {
    if (!state.habitMarks[weekKey]) state.habitMarks[weekKey] = {};
    if (!state.habitMarks[weekKey][habitId]) state.habitMarks[weekKey][habitId] = {};
    if (!mark || (!mark.v && !mark.note)) {
      delete state.habitMarks[weekKey][habitId][String(dayIdx)];
    } else {
      state.habitMarks[weekKey][habitId][String(dayIdx)] = mark;
    }
    saveState();
  }

  function resolveCell(habit, weekKey, dayIdx, dateKey) {
    const man = getMark(weekKey, habit.id, dayIdx);
    if (man && (man.v === 'y' || man.v === 'n')) {
      return { v: man.v, note: man.note || '', source: 'manual' };
    }
    const auto = autoHabitStatus(habit, dateKey);
    if (auto && auto.v === 'a') {
      return { v: 'a', note: (man && man.note) || auto.note || '', source: 'auto' };
    }
    return { v: '', note: (man && man.note) || (auto && auto.note) || '', source: man ? 'manual' : (auto ? 'auto' : '') };
  }

  function cycleMark(cur) {
    // empty → y → n → empty
    if (!cur || !cur.v) return 'y';
    if (cur.v === 'y' || cur.v === 'a') return 'n';
    if (cur.v === 'n') return '';
    return 'y';
  }

  function renderHabitsPage() {
    ensureHabitState();
    const days = habitWeekDates(habitWeekOffset);
    const wk = weekKeyFromDates(days);
    const label = $('#habit-week-label');
    if (label) label.textContent = (habitWeekOffset === 0 ? '本週 · ' : '') + fmtWeekRange(days);

    const grid = $('#habit-grid');
    if (!grid) return;

    let htmlOut = '';
    htmlOut += `<div class="hg-cell hg-head hg-corner">習慣</div>`;
    days.forEach((d, i) => {
      htmlOut += `<div class="hg-cell hg-head"><div class="dow">${HABIT_DOW[i]}</div><div class="dom">${d.getMonth() + 1}/${d.getDate()}</div></div>`;
    });

    let totalY = 0, totalSlots = 0, autoCount = 0;
    state.habitDefs.forEach(habit => {
      htmlOut += `<div class="hg-cell hg-row-label" data-habit-id="${escapeHtml(habit.id)}">
        <div class="hl-ico">${habit.ico || '✨'}</div>
        <div class="hl-name">${escapeHtml(habit.name)}</div>
        ${habit.autoFrom ? '<div class="hl-auto">自動</div>' : ''}
        <div class="habit-row-menu">
          <button type="button" data-habit-del="${escapeHtml(habit.id)}" title="刪除此列">刪除列</button>
        </div>
      </div>`;
      days.forEach((d, i) => {
        const dk = dateKeyLocal(d);
        const cell = resolveCell(habit, wk, i, dk);
        const cls = cell.v === 'y' ? 'y' : cell.v === 'n' ? 'n' : cell.v === 'a' ? 'a' : '';
        const sym = (cell.v === 'y' || cell.v === 'a') ? '✓' : (cell.v === 'n' ? '✘' : '');
        if (cell.v === 'y' || cell.v === 'a') totalY++;
        if (cell.v === 'a') autoCount++;
        totalSlots++;
        const noteCls = cell.note ? 'has' : '';
        htmlOut += `<div class="hg-cell">
          <button type="button" class="habit-mark-btn ${cls}" data-habit-mark="${escapeHtml(habit.id)}" data-day="${i}" data-week="${wk}" aria-label="${escapeHtml(habit.name)} ${HABIT_DOW[i]}">${sym}</button>
          <div class="habit-note ${noteCls}" data-habit-note="${escapeHtml(habit.id)}" data-day="${i}" data-week="${wk}" title="${escapeHtml(cell.note || '點擊加註')}">${escapeHtml(cell.note || '')}</div>
        </div>`;
      });
    });
    grid.innerHTML = htmlOut;

    const sum = $('#habit-summary');
    if (sum) {
      const pct = totalSlots ? Math.round(100 * totalY / totalSlots) : 0;
      sum.innerHTML = `<strong>本週完成度 ${pct}%</strong> · 做到 ${totalY}/${totalSlots} 格` +
        (autoCount ? ` · 其中自動勾 ${autoCount}` : '') +
        '';
    }
  }

  function bindHabitsUI() {
    const prev = $('#habit-prev-week');
    const next = $('#habit-next-week');
    const now = $('#habit-this-week');
    if (prev) prev.onclick = () => { habitWeekOffset -= 1; renderHabitsPage(); };
    if (next) next.onclick = () => { habitWeekOffset += 1; renderHabitsPage(); };
    if (now) now.onclick = () => { habitWeekOffset = 0; renderHabitsPage(); };

    const addBtn = $('#habit-add-btn');
    if (addBtn) addBtn.onclick = () => {
      ensureHabitState();
      const name = ($('#habit-new-name').value || '').trim();
      if (!name) { toast('請輸入習慣名稱', 'warn'); return; }
      const ico = ($('#habit-new-ico').value || '✨').trim() || '✨';
      const id = 'h_custom_' + Date.now().toString(36);
      state.habitDefs.push({ id, name, ico, autoFrom: null });
      saveState();
      $('#habit-new-name').value = '';
      toast('已加入習慣列', 'success');
      renderHabitsPage();
    };

    const refBtn = $('#habit-refresh-auto');
    if (refBtn) refBtn.onclick = () => { renderHabitsPage(); toast('已按最新記錄刷新自動勾', 'success'); };

    const resetBtn = $('#habit-reset-week');
    if (resetBtn) resetBtn.onclick = () => {
      ensureHabitState();
      const days = habitWeekDates(habitWeekOffset);
      const wk = weekKeyFromDates(days);
      if (!confirm('清空本週所有手動 ✓／✘／註解？（自動勾會保留顯示）')) return;
      delete state.habitMarks[wk];
      saveState();
      renderHabitsPage();
      toast('已清空本週手動標記', 'success');
    };

    const grid = $('#habit-grid');
    if (grid && !grid.dataset.bound) {
      grid.dataset.bound = '1';
      grid.addEventListener('click', (ev) => {
        const del = ev.target.closest('[data-habit-del]');
        if (del) {
          const id = del.getAttribute('data-habit-del');
          if (!confirm('刪除此習慣列？歷史標記會保留但不再顯示。')) return;
          ensureHabitState();
          state.habitDefs = state.habitDefs.filter(h => h.id !== id);
          saveState();
          renderHabitsPage();
          return;
        }
        const noteEl = ev.target.closest('[data-habit-note]');
        if (noteEl && !ev.target.closest('[data-habit-mark]')) {
          const habitId = noteEl.getAttribute('data-habit-note');
          const day = +noteEl.getAttribute('data-day');
          const week = noteEl.getAttribute('data-week');
          const cur = getMark(week, habitId, day) || {};
          const cell = resolveCell(state.habitDefs.find(h => h.id === habitId) || { id: habitId }, week, day, dateKeyLocal(habitWeekDates(habitWeekOffset)[day]));
          const nextNote = prompt('短註（可留空清除）', cell.note || cur.note || '');
          if (nextNote === null) return;
          const v = (cur.v === 'y' || cur.v === 'n') ? cur.v : (cell.v === 'a' ? 'y' : (cell.v || ''));
          // if only note on auto cell, store as manual y with note if was auto, else keep v
          let storeV = cur.v;
          if (!storeV && cell.v === 'a') storeV = 'y';
          if (!storeV && cell.v === 'y') storeV = 'y';
          if (!storeV && cell.v === 'n') storeV = 'n';
          setMark(week, habitId, day, { v: storeV || (nextNote.trim() ? 'y' : ''), note: nextNote.trim() });
          renderHabitsPage();
          return;
        }
        const btn = ev.target.closest('[data-habit-mark]');
        if (!btn) return;
        const habitId = btn.getAttribute('data-habit-mark');
        const day = +btn.getAttribute('data-day');
        const week = btn.getAttribute('data-week');
        const habit = (state.habitDefs || []).find(h => h.id === habitId) || { id: habitId };
        const days = habitWeekDates(habitWeekOffset);
        const cell = resolveCell(habit, week, day, dateKeyLocal(days[day]));
        const nextV = cycleMark(cell);
        const prevNote = (getMark(week, habitId, day) || {}).note || '';
        setMark(week, habitId, day, nextV ? { v: nextV, note: prevNote } : (prevNote ? { v: '', note: prevNote } : null));
        renderHabitsPage();
      });
      // long-press for note
      let pressTimer = null;
      grid.addEventListener('pointerdown', (ev) => {
        const btn = ev.target.closest('[data-habit-mark]');
        if (!btn) return;
        pressTimer = setTimeout(() => {
          pressTimer = null;
          const habitId = btn.getAttribute('data-habit-mark');
          const day = +btn.getAttribute('data-day');
          const week = btn.getAttribute('data-week');
          const days = habitWeekDates(habitWeekOffset);
          const habit = (state.habitDefs || []).find(h => h.id === habitId) || { id: habitId };
          const cell = resolveCell(habit, week, day, dateKeyLocal(days[day]));
          const nextNote = prompt('短註（時間／心情等）', cell.note || '');
          if (nextNote === null) return;
          const cur = getMark(week, habitId, day) || {};
          let v = cur.v;
          if (!v && (cell.v === 'a' || cell.v === 'y')) v = 'y';
          if (!v && cell.v === 'n') v = 'n';
          if (!v && nextNote.trim()) v = 'y';
          setMark(week, habitId, day, { v: v || '', note: nextNote.trim() });
          renderHabitsPage();
        }, 550);
      });
      const clearPress = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
      grid.addEventListener('pointerup', clearPress);
      grid.addEventListener('pointerleave', clearPress);
      grid.addEventListener('pointercancel', clearPress);
    }
  }


  /* ========== BloomBody P1 模組 ========== */
  const P1_REM_LABELS = {
    daily_checkin: '每日打卡',
    meal: '記餐',
    exercise: '運動',
    sleep: '睡眠',
    custom: '自訂'
  };

  function ensureP1State() {
    ensureP0State();
    if (!Array.isArray(state.meta.reminders) || !state.meta.reminders.length) {
      state.meta.reminders = [
        { id: 'rem_checkin', type: 'daily_checkin', timeLocal: '21:30', enabled: false, channel: 'browser', message: '' },
        { id: 'rem_sleep', type: 'sleep', timeLocal: '22:30', enabled: false, channel: 'browser', message: '' }
      ];
    }
    state.meta.reminders.forEach(r => {
      if (!r.id) r.id = 'rem_' + uid();
      if (!r.channel) r.channel = 'browser';
      if (r.message == null) r.message = '';
    });
  }

  /** 更強自動分類：檔名／caption／用戶近期偏好／關鍵字權重 */
  function classifyPhotoHeuristicP1(fileMeta, caption) {
    const mode = chatAutoClassMode || 'auto';
    if (mode !== 'auto') {
      const map = { diet: 'meal', exercise: 'ocr', sleep: 'sleep', body: 'scale', lab: 'lab', note: 'photo' };
      return { recordType: mode, subtype: map[mode] || 'photo', conf: 0.75, reason: '手動指定類別' };
    }
    const name = ((fileMeta && fileMeta.name) || '') + ' ' + (caption || '');
    const lower = name.toLowerCase();
    const scores = { diet: 0.15, exercise: 0, body: 0, sleep: 0, lab: 0, note: 0 };
    const bump = (k, n, why) => { scores[k] += n; return why; };
    const reasons = [];
    if (/keep|nike|strava|garmin|coros|watch|workout|跑步|力量|有氧|訓練|screenshot|螢幕快照|屏幕截圖|截圖/.test(lower)) {
      reasons.push(bump('exercise', 0.55, '運動／截圖關鍵字'));
    }
    if (/scale|inbody|體重|体重|體脂|體脂磅|weight|bmi|腰圍/.test(lower)) {
      reasons.push(bump('body', 0.5, '體脂磅／測量'));
    }
    if (/sleep|睡眠|瞓|bed|入睡|起床/.test(lower)) reasons.push(bump('sleep', 0.45, '睡眠'));
    if (/lab|blood|化驗|膽固醇|體檢|ldl|報告/.test(lower)) reasons.push(bump('lab', 0.45, '體檢'));
    if (/food|meal|lunch|dinner|早餐|午餐|晚餐|第一餐|第二餐|第三餐|加餐|雞胸|沙律|外賣|餐|碟|碗|便當/.test(lower)) {
      reasons.push(bump('diet', 0.5, '飲食關鍵字'));
    }
    // 用戶近期記錄偏好（過去 14 日圖／飲食偏多 → 微調）
    try {
      const cut = todayKey();
      const recent = myRecords().filter(r => {
        const k = tsDateKey(r.timestamp);
        return k && cut && k >= String(+cut - 140000).padStart(8, '0'); // rough; fallback below
      }).slice(-40);
      const counts = {};
      recent.forEach(r => { counts[r.recordType] = (counts[r.recordType] || 0) + 1; });
      const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      if (top && scores[top] != null) { scores[top] += 0.08; reasons.push('近期偏好 ' + top); }
    } catch (_) {}
    let best = 'diet', bestS = -1;
    Object.keys(scores).forEach(k => { if (scores[k] > bestS) { bestS = scores[k]; best = k; } });
    const map = { diet: 'ai_food', exercise: 'ocr', body: 'scale', sleep: 'sleep', lab: 'lab', note: 'photo' };
    const conf = Math.min(0.92, Math.max(0.4, bestS));
    return { recordType: best, subtype: map[best] || 'photo', conf, reason: (reasons.filter(Boolean).slice(0, 2).join(' · ') || '預設飲食相') + ' → 請確認' };
  }

  // Override classifyPhotoHeuristic
  classifyPhotoHeuristic = classifyPhotoHeuristicP1;

  function guessTypeFromTextP1(text) {
    const t = String(text || '');
    const rules = [
      { re: /體重|体脂|體脂|腰圍|臀圍|inbody|體脂磅|肌肉量|內臟脂肪|bmi/i, recordType: 'body', subtype: 'scale', conf: 0.9 },
      { re: /第一餐|第二餐|第三餐|加餐|kcal|千卡|熱量|雞胸|雞蛋|飯|麵|沙律|食咗|吃了|外賣|蛋白粉|乳清/i, recordType: 'diet', subtype: 'meal', conf: 0.9 },
      { re: /跑步|力量|有氧|行山|瑜伽|拉伸|分鐘|keep|nike|workout|訓練|步行|游泳|單車/i, recordType: 'exercise', subtype: 'workout', conf: 0.88 },
      { re: /瞓|睡|入睡|起床|失眠|午睡/i, recordType: 'sleep', subtype: 'night', conf: 0.85 },
      { re: /化驗|膽固醇|體檢|LDL|抽血|轉氨酶|血糖/i, recordType: 'lab', subtype: 'lab', conf: 0.8 },
      { re: /月經|經期|週期|周期|經血/i, recordType: 'period', subtype: 'cycle', conf: 0.92 },
      { re: /情緒|心情|膝蓋|痛|備註|日記|焦慮/i, recordType: 'note', subtype: 'mood', conf: 0.72 }
    ];
    for (const r of rules) {
      if (r.re.test(t)) return { recordType: r.recordType, subtype: r.subtype, conf: r.conf };
    }
    // favorites name match
    const favs = state.foodFavorites || [];
    for (const f of favs) {
      if (f.name && t.indexOf(f.name) >= 0) return { recordType: 'diet', subtype: 'meal', conf: 0.86, favId: f.id };
    }
    return { recordType: 'note', subtype: 'unknown', conf: 0.4 };
  }
  guessTypeFromText = guessTypeFromTextP1;

  function favoriteMacroChipsHtml() {
    ensureP0State();
    const favs = (state.foodFavorites || []).slice(0, 8);
    if (!favs.length) return '<p class="stub-note">尚未有收藏；確認飲食後點選收藏即可作為宏量模板。</p>';
    return `<div class="macro-fav-row" id="p1-macro-favs">` +
      favs.map(f => {
        const label = escapeHtml(f.name || '食物');
        const k = f.kcal != null ? `<span class="mf-kcal">${f.kcal}kcal</span>` : '';
        return `<button type="button" class="macro-fav-chip" data-macro-fav="${escapeHtml(f.id)}">${label}${k}</button>`;
      }).join('') + `</div>`;
  }

  function applyFavoriteMacroToDraft(favId) {
    const fav = (state.foodFavorites || []).find(f => f.id === favId);
    if (!fav || !chatPendingDraft) return;
    chatPendingDraft.recordType = 'diet';
    chatPendingDraft.data = Object.assign({}, chatPendingDraft.data || {}, {
      meal: fav.defaultMeal || (chatPendingDraft.data && chatPendingDraft.data.meal) || '加餐',
      food: fav.name,
      kcal: fav.kcal, protein: fav.proteinG, carb: fav.carbsG, fat: fav.fatG,
      aiSuggest: { provider: 'favorite_macro', rawLabels: [fav.name], confidence: 0.85, status: 'pending_confirm' }
    });
    chatPendingDraft.summary = `收藏模板 · ${fav.name}` + (fav.kcal != null ? ` · ${fav.kcal} kcal` : '');
    const parent = document.querySelector('#p0-draft-card') && document.querySelector('#p0-draft-card').closest('.chat-msg');
    if (parent) parent.remove();
    renderDraftConfirmCard(chatPendingDraft);
    toast('已套用收藏宏量，請確認', 'success');
  }

  // Patch diet draft fields to include macro chips
  const _buildStubDietDraft = buildStubDietDraft;
  buildStubDietDraft = function(attachments, caption) {
    const d = _buildStubDietDraft(attachments, caption);
    // prefill from favorite name match
    const favs = state.foodFavorites || [];
    const hit = favs.find(f => f.name && caption && caption.indexOf(f.name) >= 0);
    if (hit) {
      d.data.food = hit.name;
      d.data.kcal = hit.kcal; d.data.protein = hit.proteinG; d.data.carb = hit.carbsG; d.data.fat = hit.fatG;
      d.data.meal = hit.defaultMeal || d.data.meal;
      d.summary = `收藏匹配 · ${hit.name}`;
      d.conf = 0.8;
    }
    return d;
  };

  const _renderDraftConfirmCard = renderDraftConfirmCard;
  renderDraftConfirmCard = function(draft) {
    _renderDraftConfirmCard(draft);
    // inject macro chips into diet draft
    if (draft && draft.recordType === 'diet') {
      const fields = $('#p0-draft-fields');
      if (fields && !fields.querySelector('#p1-macro-favs')) {
        const wrap = document.createElement('div');
        wrap.innerHTML = `<label style="font-size:.75rem;color:var(--muted);">常用宏量模板</label>` + favoriteMacroChipsHtml();
        fields.insertBefore(wrap, fields.firstChild);
        const row = $('#p1-macro-favs');
        if (row) row.onclick = (e) => {
          const b = e.target.closest('[data-macro-fav]');
          if (!b) return;
          applyFavoriteMacroToDraft(b.getAttribute('data-macro-fav'));
        };
      }
    }
  };

  function populateTagFilterSelects() {
    ensureP0State();
    const tags = state.tagCatalog || [];
    ['hist-tag', 'circle-tag'].forEach(id => {
      const sel = $('#' + id);
      if (!sel) return;
      const cur = sel.value;
      const opts = ['<option value="">全部標籤</option>']
        .concat(tags.map(t => `<option value="${escapeHtml(t.label)}">${escapeHtml(t.label)}</option>`));
      sel.innerHTML = opts.join('');
      if (cur) sel.value = cur;
    });
  }

  const _renderHistory = renderHistory;
  renderHistory = function() {
    populateTagFilterSelects();
    const type = $('#hist-type') ? $('#hist-type').value : '';
    const tag = $('#hist-tag') ? $('#hist-tag').value : '';
    const from = $('#hist-from') ? $('#hist-from').value : '';
    const to = $('#hist-to') ? $('#hist-to').value : '';
    let list = myRecords().slice().sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    if (type) list = list.filter(r => r.recordType === type);
    if (tag) list = list.filter(r => (r.tags || []).includes(tag));
    if (from) {
      const fk = from.replace(/-/g, '');
      list = list.filter(r => tsDateKey(r.timestamp) >= fk);
    }
    if (to) {
      const tk = to.replace(/-/g, '');
      list = list.filter(r => tsDateKey(r.timestamp) <= tk);
    }
    const box = $('#history-list');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<div class="empty-state">暫無記錄<br>請前往「新增」或以對話寫下第一筆記錄</div>';
      return;
    }
    box.innerHTML = list.map(r => {
      const summary = summarizeRecord(r);
      const tagHtml = (r.tags || []).map(t => `<span class="classify-badge">${escapeHtml(t)}</span>`).join('');
      return `<div class="record-item ${r.isPublic ? '' : 'private'}" data-id="${escapeHtml(r.recordId)}">
        <div class="ri-head">
          <div>
            <span class="ri-type">${displayTypeLabel(r.recordType, r.data)}</span>
            ${r.isPublic ? '<span class="tag-public">搭檔可見</span>' : '<span class="tag-private">私密</span>'}
            ${tagHtml}
          </div>
          <span class="ri-time">${escapeHtml(r.timestamp)}</span>
        </div>
        <div class="ri-body">${summary}</div>
        <div class="ri-actions">
          <button class="btn btn-ghost btn-sm" data-act="edit" type="button">編輯</button>
          <button class="btn btn-danger btn-sm" data-act="del" type="button">刪除</button>
        </div>
      </div>`;
    }).join('');
    box.onclick = async (ev) => {
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      const item = btn.closest('.record-item');
      const id = item.dataset.id;
      const rec = state.records.find(r => r.recordId === id && r.ownerUser === currentUser);
      if (!rec) return;
      if (btn.dataset.act === 'edit') fillFormForEdit(rec);
      if (btn.dataset.act === 'del') {
        if (!confirm('確定刪除呢筆記錄同相關相片？')) return;
        await deleteRecordWithPhotos(id);
        toast('已刪除記錄同相片', 'success');
        renderHistory();
        updateChatMiniStats();
      }
    };
  };

  const _renderCirclePage = renderCirclePage;
  renderCirclePage = function() {
    populateTagFilterSelects();
    const typeSel = $('#circle-type');
    const memSel = $('#circle-member');
    const tagSel = $('#circle-tag');
    const list = $('#circle-list');
    if (!list) return;
    if (memSel) {
      const existing = new Set([...memSel.options].map(o => o.value));
      Object.keys(state.users || {}).forEach(u => {
        if (existing.has(u)) return;
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u === currentUser ? `${u}（我）` : u;
        memSel.appendChild(opt);
      });
    }
    const typeFilter = typeSel ? typeSel.value : 'all';
    const memFilter = memSel ? memSel.value : 'all';
    const tagFilter = tagSel ? tagSel.value : '';
    let minePub = myRecords().filter(r => !!r.isPublic);
    let partner = visiblePartnerRecords().slice();
    let recs = [];
    if (memFilter === 'me') recs = minePub;
    else if (memFilter === 'partners') recs = partner;
    else if (memFilter === 'all') recs = minePub.concat(partner);
    else if (memFilter === currentUser) recs = minePub;
    else recs = partner.filter(r => r.ownerUser === memFilter);
    if (typeFilter && typeFilter !== 'all') recs = recs.filter(r => r.recordType === typeFilter);
    if (tagFilter) recs = recs.filter(r => (r.tags || []).includes(tagFilter));
    recs.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    if (!recs.length) {
      list.innerHTML = `<div class="circle-empty">
        <div class="ce-ico">👥</div>
        <div><strong>暫時未有公開動態</strong></div>
        <div style="margin-top:8px;font-size:.85rem;line-height:1.5;">
          · 自己：新增記錄時勾「允許搭檔查看」<br>
          · 可用類別／興趣標籤篩選
        </div>
      </div>`;
      return;
    }
    list.innerHTML = recs.map(r => {
      const isMe = r.ownerUser === currentUser;
      const tagHtml = (r.tags || []).map(t => `<span class="classify-badge">${escapeHtml(t)}</span>`).join('');
      return `<div class="card hist-item ${isMe ? 'circle-me' : 'circle-partner'}">
        <div class="circle-who">${escapeHtml(r.ownerUser)}
          <span class="${isMe ? 'tag-me' : 'tag-partner'}">${isMe ? '我' : '搭檔'}</span>
          · ${escapeHtml(TYPE_LABEL[r.recordType] || r.recordType)} ${tagHtml}
        </div>
        <div style="font-size:.9rem;margin:4px 0;">${escapeHtml(summarizeRecord(r).replace(/<[^>]+>/g, ' '))}</div>
        <div class="muted" style="font-size:.75rem;">${escapeHtml(r.timestamp)} · 公開</div>
      </div>`;
    }).join('');
  };

  function reminderMessage(rem) {
    if (rem.message && rem.message.trim()) return rem.message.trim();
    if (rem.type === 'sleep') return '夜深了，請記得記錄睡眠並早些休息 🌙';
    if (rem.type === 'meal') return '記得記低呢餐飲食呀 🥗';
    if (rem.type === 'exercise') return '今日是否有活動？請記錄運動 💪';
    return '請記得今日健康打卡 💪';
  }

  function renderReminderScheduler() {
    ensureP1State();
    const box = $('#rem-scheduler-list');
    if (!box) return;
    const list = state.meta.reminders || [];
    if (!list.length) {
      box.innerHTML = '<p class="hint">未有提醒，下面加入一條。</p>';
      return;
    }
    box.innerHTML = list.map(r => `
      <div class="rem-row" data-rem-id="${escapeHtml(r.id)}">
        <select data-rem-field="type">
          ${Object.keys(P1_REM_LABELS).map(k => `<option value="${k}" ${r.type===k?'selected':''}>${P1_REM_LABELS[k]}</option>`).join('')}
        </select>
        <input type="time" data-rem-field="timeLocal" value="${escapeHtml(r.timeLocal || '21:30')}">
        <label class="rem-on"><input type="checkbox" data-rem-field="enabled" ${r.enabled ? 'checked' : ''}>開</label>
        <button type="button" class="btn btn-ghost btn-sm" data-rem-del="${escapeHtml(r.id)}" title="刪除">🗑</button>
      </div>
      <div class="form-group" style="margin:-2px 0 8px;">
        <input type="text" data-rem-id-msg="${escapeHtml(r.id)}" value="${escapeHtml(r.message || '')}" placeholder="自訂文案（可空）" maxlength="60">
      </div>`).join('');
    box.querySelectorAll('[data-rem-del]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-rem-del');
        state.meta.reminders = (state.meta.reminders || []).filter(x => x.id !== id);
        saveState();
        renderReminderScheduler();
      };
    });
  }

  function collectRemindersFromUI() {
    ensureP1State();
    const box = $('#rem-scheduler-list');
    if (!box) return state.meta.reminders;
    const rows = [...box.querySelectorAll('.rem-row')];
    const next = rows.map(row => {
      const id = row.getAttribute('data-rem-id');
      const type = row.querySelector('[data-rem-field="type"]').value;
      const timeLocal = row.querySelector('[data-rem-field="timeLocal"]').value || '21:30';
      const enabled = row.querySelector('[data-rem-field="enabled"]').checked;
      const msgEl = box.querySelector(`[data-rem-id-msg="${id}"]`);
      return { id, type, timeLocal, enabled, channel: 'browser', message: msgEl ? msgEl.value : '' };
    });
    state.meta.reminders = next;
    // sync legacy hidden fields
    const first = next.find(r => r.type === 'daily_checkin') || next[0];
    const rt = $('#set-remind-checkin'); const ro = $('#set-remind-on');
    if (first && rt) rt.value = first.timeLocal;
    if (first && ro) ro.checked = !!first.enabled;
    return next;
  }

  // richer checkReminders
  checkReminders = function() {
    ensureP1State();
    const banner = $('#reminder-banner');
    const list = state.meta.reminders || [];
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const today = todayKey();
    for (const rem of list) {
      if (!rem.enabled) continue;
      if (rem.timeLocal !== hhmm) continue;
      const flag = APP_KEY + '_rem_' + rem.id + '_' + today;
      if (sessionStorage.getItem(flag)) continue;
      sessionStorage.setItem(flag, '1');
      const msg = reminderMessage(rem);
      if (banner) {
        banner.hidden = false;
        const t = banner.querySelector('.rb-text');
        if (t) t.textContent = msg;
      }
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('BloomBody', { body: msg, tag: rem.id }); } catch (_) {}
      }
    }
  };

  function fireTestReminder() {
    ensureP1State();
    const msg = '測試提醒：BloomBody 本機通知 OK 💪';
    const banner = $('#reminder-banner');
    if (banner) {
      banner.hidden = false;
      const t = banner.querySelector('.rb-text');
      if (t) t.textContent = msg;
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('BloomBody', { body: msg }); toast('已發送系統通知', 'success'); }
      catch (e) { toast('系統通知失敗，已顯示 App 橫幅', 'warn'); }
    } else {
      toast('未有系統通知權限，已顯示 App 內橫幅', 'warn');
    }
  }

  /** 經期日曆條：過去經期日 + 預測窗 */
  function buildCycleCalendarStripHtml() {
    ensureP0State();
    updateCyclePrediction();
    const cp = state.meta.cycleProfile || {};
    const avg = cp.avgCycleDays || 28;
    const periodLen = cp.avgPeriodDays || 5;
    const starts = myRecords()
      .filter(r => (r.recordType === 'period' || r.recordType === 'note') && r.data && (r.data.phase === 'period_start' || /經期開始/.test(r.data.cycle || r.data.mood || '')))
      .map(r => tsDateKey(r.timestamp))
      .filter(Boolean)
      .sort();
    const pred = cp.nextPredictedStart;
    const today = todayKey();
    // 28-day window centered near today
    const days = [];
    const base = new Date();
    base.setDate(base.getDate() - 10);
    base.setHours(0,0,0,0);
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
    const dow = ['日','一','二','三','四','五','六'];
    for (let i = 0; i < 28; i++) {
      const d = new Date(base); d.setDate(base.getDate() + i);
      days.push(d);
    }
    function inPeriodWindow(key, startKey, len) {
      if (!startKey || !key) return false;
      // approximate using Date
      const toDate = (k) => new Date(+k.slice(0,4), +k.slice(4,6)-1, +k.slice(6,8));
      const a = toDate(startKey), b = toDate(key);
      const diff = Math.round((b - a) / 86400000);
      return diff >= 0 && diff < len;
    }
    const lastStart = starts.length ? starts[starts.length - 1] : null;
    return `<div class="cycle-strip" aria-label="經期日曆">` + days.map(d => {
      const k = ymd(d);
      let cls = 'cycle-day';
      if (k === today) cls += ' today';
      let past = false, predicted = false;
      if (lastStart && inPeriodWindow(k, lastStart, periodLen)) { cls += ' past'; past = true; }
      if (pred && inPeriodWindow(k, pred, periodLen)) { cls += ' predicted'; predicted = true; }
      // ovulation rough: avg/2 before next
      if (pred) {
        const toDate = (kk) => new Date(+kk.slice(0,4), +kk.slice(4,6)-1, +kk.slice(6,8));
        const ov = toDate(pred); ov.setDate(ov.getDate() - Math.round(avg / 2));
        if (ymd(ov) === k) cls += ' ovulation';
      }
      const tip = past ? '經期（已記）' : predicted ? '預測經期' : (cls.indexOf('ovulation')>=0 ? '排卵粗估' : '');
      return `<div class="${cls}" title="${tip}">
        <div class="cd-dow">${dow[d.getDay()]}</div>
        <div class="cd-dom">${d.getDate()}</div>
      </div>`;
    }).join('') + `</div>
    <div class="habit-legend" style="margin-top:6px;">
      <span><i class="mk" style="background:#fce8ef;border-color:#f0b8cb;"></i>已記經期</span>
      <span><i class="mk a"></i>預測窗</span>
      <span><i class="mk y"></i>排卵粗估</span>
    </div>`;
  }

  const _renderCycleCard = renderCycleCard;
  renderCycleCard = function() {
    ensureP0State();
    updateCyclePrediction();
    const el = $('#cycle-predict-card');
    if (!el) return;
    const cp = state.meta.cycleProfile || {};
    el.innerHTML = `
      <strong>經期預測（規則 · 預設私密）</strong><br>
      平均週期約 <strong>${cp.avgCycleDays || 28}</strong> 日 · 經期約 <strong>${cp.avgPeriodDays || 5}</strong> 日<br>
      預測下次開始：<strong>${formatYmdNice(cp.nextPredictedStart)}</strong><br>
      <span class="stub-note">以「記經期開始」或備註「經期開始」累積。並非醫療診斷；圈子預設不顯示。</span>
      ${buildCycleCalendarStripHtml()}
      <div style="margin-top:8px;" class="quick-btns">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-log-period-start">記經期開始</button>
        <button type="button" class="btn btn-ghost btn-sm" id="btn-cycle-avg-edit">改平均週期</button>
      </div>`;
    const b = $('#btn-log-period-start');
    if (b) b.onclick = async () => {
      await commitChatRecord({
        ok: true, confidence: 1, recordType: 'period',
        data: { kind: 'cycle', phase: 'period_start', cycle: '經期開始', symptoms: '', mood: '經期開始', flow: 'unknown' },
        remark: '經期開始', summary: '經期開始（建議私密）', rawText: '經期開始'
      }, { isPublic: false });
      updateCyclePrediction();
      renderCycleCard();
      toast('已記經期開始（私密）', 'success');
    };
    const ed = $('#btn-cycle-avg-edit');
    if (ed) ed.onclick = () => {
      const v = prompt('平均週期（日）', String(cp.avgCycleDays || 28));
      if (v == null) return;
      const n = +v;
      if (!(n >= 18 && n <= 45)) { toast('請輸入 18–45', 'warn'); return; }
      state.meta.cycleProfile.avgCycleDays = n;
      saveState();
      updateCyclePrediction();
      renderCycleCard();
      toast('已更新平均週期', 'success');
    };
  };

  /** Richer Doubao-style report: day grid + nutrient table */
  const _buildFitFitLadyReportHTML = buildFitFitLadyReportHTML;
  buildFitFitLadyReportHTML = function(range) {
    let htmlReport = _buildFitFitLadyReportHTML(range);
    try {
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const ymd = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
      let start, end = now, daysN;
      if (range === 'day') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        daysN = 1;
      } else if (range === 'week') {
        start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0,0,0,0);
        daysN = 7;
      } else {
        start = new Date(now); start.setDate(start.getDate() - 29); start.setHours(0,0,0,0);
        daysN = 30;
      }
      const sk = ymd(start), ek = ymd(end);
      const agg = aggregateRange(sk, ek);
      // day cells (for week/month show up to 14 recent in grid of 7)
      const showDays = Math.min(daysN, range === 'month' ? 14 : daysN);
      const dayCells = [];
      for (let i = showDays - 1; i >= 0; i--) {
        const d = new Date(end); d.setDate(end.getDate() - i); d.setHours(0,0,0,0);
        const k = ymd(d);
        const dayRecs = agg.recs.filter(r => tsDateKey(r.timestamp) === k);
        let kcal = 0, ex = 0;
        dayRecs.forEach(r => {
          if (r.recordType === 'diet') kcal += +(r.data.kcal || 0);
          if (r.recordType === 'exercise') ex += +(r.data.minutes || 0);
        });
        dayCells.push(`<div class="ffl-daycell"><strong>${d.getMonth()+1}/${d.getDate()}</strong>${Math.round(kcal)||'—'}kcal<br>${ex?ex+'分':'—'}</div>`);
      }
      const nutri = `
        <div class="ffl-section">六、營養合計表（真實記錄彙總 · 估算）</div>
        <table class="ffl-nutri-table">
          <thead><tr><th>項目</th><th>合計</th><th>有打卡日均</th></tr></thead>
          <tbody>
            <tr><td>熱量 kcal</td><td>${Math.round(agg.kcal)}</td><td>${agg.checkinDays.size ? Math.round(agg.kcal/agg.checkinDays.size) : '—'}</td></tr>
            <tr><td>蛋白質 g</td><td>${Math.round(agg.protein)}</td><td>${agg.checkinDays.size ? Math.round(agg.protein/agg.checkinDays.size) : '—'}</td></tr>
            <tr><td>碳水 g</td><td>${Math.round(agg.carb)}</td><td>${agg.checkinDays.size ? Math.round(agg.carb/agg.checkinDays.size) : '—'}</td></tr>
            <tr><td>脂肪 g</td><td>${Math.round(agg.fat)}</td><td>${agg.checkinDays.size ? Math.round(agg.fat/agg.checkinDays.size) : '—'}</td></tr>
            <tr><td>運動分鐘</td><td>${Math.round(agg.exmin)}</td><td>${agg.checkinDays.size ? Math.round(agg.exmin/agg.checkinDays.size) : '—'}</td></tr>
          </tbody>
        </table>
        <div class="ffl-section">七、近${showDays}日打卡熱力（kcal／運動分）</div>
        <div class="ffl-daygrid">${dayCells.join('')}</div>`;
      htmlReport = htmlReport.replace(
        '<div class="ffl-section">五、優化建議（規則摘要）</div>',
        nutri + '<div class="ffl-section">五、優化建議（規則摘要）</div>'
      );
    } catch (e) { console.warn('P1 report enrich', e); }
    return htmlReport;
  };

  function buildHealthExportPayload() {
    const recs = myRecords().slice().sort((a, b) => (a.timestamp > b.timestamp ? 1 : -1));
    const samples = [];
    recs.forEach(r => {
      const ts = r.timestamp;
      const d = r.data || {};
      if (r.recordType === 'body' && d.weight != null) {
        samples.push({ type: 'body_mass', unit: 'kg', value: +d.weight, timestamp: ts, source: 'BloomBody' });
        if (d.bodyFat != null) samples.push({ type: 'body_fat_percentage', unit: '%', value: +d.bodyFat, timestamp: ts, source: 'BloomBody' });
      }
      if (r.recordType === 'exercise') {
        if (d.minutes != null) samples.push({ type: 'exercise_time', unit: 'min', value: +d.minutes, timestamp: ts, activity: d.exType || '', source: 'BloomBody' });
        if (d.kcal != null) samples.push({ type: 'active_energy', unit: 'kcal', value: +d.kcal, timestamp: ts, source: 'BloomBody' });
      }
      if (r.recordType === 'sleep' && d.duration != null) {
        samples.push({ type: 'sleep_analysis', unit: 'hour', value: +d.duration, timestamp: ts, sleepTime: d.sleepTime, wakeTime: d.wakeTime, source: 'BloomBody' });
      }
      if (r.recordType === 'diet' && d.kcal != null) {
        samples.push({ type: 'dietary_energy', unit: 'kcal', value: +d.kcal, timestamp: ts, food: d.food || '', meal: d.meal || '', source: 'BloomBody' });
      }
      if (r.recordType === 'exercise' && (d.steps != null || d.step != null)) {
        samples.push({ type: 'steps', unit: 'count', value: +(d.steps != null ? d.steps : d.step), timestamp: ts, activity: d.exType || '步數', source: 'BloomBody' });
      }
      if (r.recordType === 'period') {
        samples.push({ type: 'menstrual_flow', unit: 'phase', value: d.phase || 'cycle', timestamp: ts, activity: d.phase || '', source: 'BloomBody' });
      }
    });
    return {
      format: 'BloomBody.HealthBridge.v1',
      exportedAt: nowTs(),
      user: currentUser,
      note: 'BloomBody 手動互換檔（非連接 Apple Health／HealthKit）。可供試算表對齊或再匯入；非官方 proprietary dump。',
      samples
    };
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function exportHealthJson() {
    const payload = buildHealthExportPayload();
    downloadText(`BloomBody_HealthBridge_${todayKey()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast('已下載 Health-shaped JSON（手動互換，非 HealthKit）', 'success');
  }

  function exportHealthCsv() {
    const payload = buildHealthExportPayload();
    const lines = ['type,unit,value,timestamp,extra'];
    payload.samples.forEach(s => {
      const extra = s.activity || s.food || s.sleepTime || '';
      lines.push([s.type, s.unit, s.value, `"${s.timestamp}"`, `"${String(extra).replace(/"/g, '')}"`].join(','));
    });
    downloadText(`BloomBody_HealthBridge_${todayKey()}.csv`, '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
    toast('已下載 Health-shaped CSV（手動互換，非 HealthKit）', 'success');
  }

  function renderHealthSyncPanel() {
    // static HTML already; hooks bound in bindP1UI
  }

  /** Export habit grid to PNG via canvas */
  function exportHabitGridPng() {
    ensureHabitState();
    const days = habitWeekDates(habitWeekOffset);
    const wk = weekKeyFromDates(days);
    const canvas = $('#habit-export-canvas');
    if (!canvas) { toast('找不到匯出畫布', 'warn'); return; }
    const habits = state.habitDefs || [];
    const rowH = 48, colW = 70, labelW = 110, pad = 24, headerH = 70;
    const W = pad * 2 + labelW + 7 * colW;
    const H = pad * 2 + headerH + habits.length * rowH + 40;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f7faf8';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1a3d32';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('BloomBody 復盤 · ' + fmtWeekRange(days), pad, pad + 22);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#5a655e';
    ctx.fillText((currentUser || '') + ' · ' + nowTs() + ' · ✓做到 ✘未做（淺綠=自動）', pad, pad + 42);
    // header days
    habits; // noop
    const top = pad + headerH;
    ctx.font = 'bold 13px sans-serif';
    days.forEach((d, i) => {
      const x = pad + labelW + i * colW;
      ctx.fillStyle = '#2d5a4a';
      ctx.fillText(HABIT_DOW[i], x + 22, top - 18);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#5a655e';
      ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, x + 18, top - 4);
      ctx.font = 'bold 13px sans-serif';
    });
    habits.forEach((habit, ri) => {
      const y = top + ri * rowH;
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#d5e0da';
      ctx.lineWidth = 1;
      ctx.fillRect(pad, y, labelW + 7 * colW, rowH - 4);
      ctx.strokeRect(pad, y, labelW + 7 * colW, rowH - 4);
      ctx.fillStyle = '#1a3d32';
      ctx.font = '13px sans-serif';
      ctx.fillText((habit.ico || '') + ' ' + habit.name, pad + 8, y + 28);
      days.forEach((d, i) => {
        const cell = resolveCell(habit, wk, i, dateKeyLocal(d));
        const cx = pad + labelW + i * colW + colW / 2;
        const cy = y + rowH / 2 - 2;
        if (cell.v === 'y' || cell.v === 'a') {
          ctx.beginPath();
          ctx.fillStyle = cell.v === 'a' ? '#c5e6d6' : '#ffe6c8';
          ctx.arc(cx, cy, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = cell.v === 'a' ? '#2d5a4a' : '#c47a20';
          ctx.font = 'bold 16px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✓', cx, cy + 6);
          ctx.textAlign = 'left';
        } else if (cell.v === 'n') {
          ctx.beginPath();
          ctx.fillStyle = '#e8eae8';
          ctx.arc(cx, cy, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#5a655e';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('✘', cx, cy + 5);
          ctx.textAlign = 'left';
        }
      });
    });
    canvas.toBlob(blob => {
      if (!blob) { toast('匯出失敗', 'warn'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `BloomBody_復盤_${weekKeyFromDates(days)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('已下載復盤 PNG', 'success');
    }, 'image/png');
  }

  function bindP1UI() {
    ensureP1State();
    populateTagFilterSelects();
    renderReminderScheduler();
    const histTag = $('#hist-tag');
    if (histTag) histTag.onchange = () => renderHistory();
    const cirTag = $('#circle-tag');
    if (cirTag) cirTag.onchange = () => renderCirclePage();
    const btnAdd = $('#btn-rem-add');
    if (btnAdd) btnAdd.onclick = () => {
      ensureP1State();
      collectRemindersFromUI();
      const type = ($('#rem-new-type') && $('#rem-new-type').value) || 'daily_checkin';
      const timeLocal = ($('#rem-new-time') && $('#rem-new-time').value) || '21:30';
      const message = ($('#rem-new-msg') && $('#rem-new-msg').value) || '';
      state.meta.reminders.push({ id: 'rem_' + uid(), type, timeLocal, enabled: true, channel: 'browser', message });
      saveState();
      renderReminderScheduler();
      toast('已加入提醒（請記得點選儲存）', 'success');
    };
    const btnSave = $('#btn-save-remind');
    if (btnSave) btnSave.onclick = () => {
      collectRemindersFromUI();
      saveState();
      setupReminders();
      toast('已儲存提醒排程', 'success');
    };
    const btnNotif = $('#btn-notif-perm');
    if (btnNotif) btnNotif.onclick = () => requestNotifPermission();
    const btnTest = $('#btn-rem-test');
    if (btnTest) btnTest.onclick = () => fireTestReminder();
    const hj = $('#btn-health-export-json');
    if (hj) hj.onclick = () => exportHealthJson();
    const hc = $('#btn-health-export-csv');
    if (hc) hc.onclick = () => exportHealthCsv();
    const hex = $('#habit-export-png');
    if (hex) hex.onclick = () => exportHabitGridPng();
    const hsh = $('#habit-share-png');
    if (hsh) hsh.onclick = () => exportHabitGridPng();
  }

  // 正確啟動：habit 函數已在 IIFE 頂層；init 內會 bindHabitsUI
  /* ========== Food photo autofill（離線啟發式＋HK 常見包裝／收藏） ========== */
  const HK_FOOD_CATALOG = [
    {
      id: 'hk_pakfook_steam_soft_350',
      brand: '百福',
      name: '蒸煮滑豆腐',
      display: '百福蒸煮滑豆腐 350ml',
      portion: '350ml（約350g）',
      kcal: 245, protein: 24.5, carb: 5.6, fat: 14, sugar: 1.4,
      keywords: ['百福', 'pakfook', 'pak fook', '蒸煮滑豆腐', '蒸煮豆腐', '滑豆腐', '350ml', '350 ml', '豆腐'],
      weight: 12
    },
    {
      id: 'hk_pakfook_board_300',
      brand: '百福',
      name: '板豆腐',
      display: '百福板豆腐 300g',
      portion: '300g',
      kcal: 228, protein: 24, carb: 5.7, fat: 14.4, sugar: 1.8,
      keywords: ['百福', '板豆腐', '硬豆腐', '300g'],
      weight: 10
    },
    {
      id: 'hk_pakfook_soft_box',
      brand: '百福',
      name: '嫩滑豆腐',
      display: '百福嫩滑豆腐',
      portion: '1盒（約300g）',
      kcal: 180, protein: 18, carb: 4.5, fat: 10.5, sugar: 1.2,
      keywords: ['百福', '嫩滑豆腐', '軟豆腐', '嫩豆腐'],
      weight: 9
    },
    {
      id: 'hk_tofu_100',
      brand: '',
      name: '豆腐 100g',
      display: '豆腐 100g（通用）',
      portion: '100g',
      kcal: 76, protein: 8, carb: 1.9, fat: 4.8, sugar: 0.6,
      keywords: ['豆腐', 'tofu'],
      weight: 4
    },
    {
      id: 'hk_vitasoy_orig_250',
      brand: '維他奶',
      name: '原味豆奶',
      display: '維他奶原味 250ml',
      portion: '250ml',
      kcal: 139, protein: 7.5, carb: 13.5, fat: 6.3, sugar: 9.5,
      keywords: ['維他奶', 'vitasoy', '豆奶', '原味'],
      weight: 8
    },
    {
      id: 'hk_vitasoy_choco_250',
      brand: '維他',
      name: '低糖朱古力奶',
      display: '維他低糖朱古力奶 250ml',
      portion: '250ml',
      kcal: 118, protein: 6, carb: 16, fat: 3.5, sugar: 12,
      keywords: ['維他', '朱古力奶', '巧克力奶', '低糖朱古力'],
      weight: 8
    },
    {
      id: 'hk_chicken_breast_100',
      brand: '',
      name: '雞胸肉 100g',
      display: '雞胸肉 100g',
      portion: '100g',
      kcal: 165, protein: 31, carb: 0, fat: 3.6, sugar: 0,
      keywords: ['雞胸', '鸡胸', 'chicken breast'],
      weight: 7
    },
    {
      id: 'hk_egg_1',
      brand: '',
      name: '雞蛋（1隻）',
      display: '雞蛋 1隻',
      portion: '1隻（約50g）',
      kcal: 78, protein: 6.5, carb: 0.6, fat: 5.3, sugar: 0.6,
      keywords: ['雞蛋', '鸡蛋', '蛋'],
      weight: 5
    },
    {
      id: 'hk_rice_bowl',
      brand: '',
      name: '白米飯 1碗',
      display: '白米飯 1碗',
      portion: '1碗（約150g熟飯）',
      kcal: 200, protein: 4, carb: 45, fat: 0.4, sugar: 0,
      keywords: ['白米', '白飯', '米飯', '一碗飯'],
      weight: 5
    },
    {
      id: 'hk_oat_40',
      brand: '',
      name: '燕麥 40g',
      display: '燕麥 40g',
      portion: '40g',
      kcal: 150, protein: 5, carb: 27, fat: 3, sugar: 0.5,
      keywords: ['燕麥', '燕麦', 'oat', 'oatmeal'],
      weight: 6
    },
    {
      id: 'hk_greek_yogurt_150',
      brand: '',
      name: '希臘乳酪 150g',
      display: '希臘乳酪 150g',
      portion: '150g',
      kcal: 130, protein: 15, carb: 6, fat: 4, sugar: 6,
      keywords: ['希臘乳酪', '希腊乳酪', '乳酪', 'yogurt'],
      weight: 6
    },
    {
      id: 'hk_protein_scoop',
      brand: '',
      name: '蛋白粉 1 scoop',
      display: '蛋白粉 1 scoop',
      portion: '1 scoop',
      kcal: 120, protein: 24, carb: 3, fat: 1, sugar: 1,
      keywords: ['蛋白粉', '乳清', 'whey', 'protein'],
      weight: 7
    },
    {
      id: 'hk_salmon_100',
      brand: '',
      name: '三文魚 100g',
      display: '三文魚 100g',
      portion: '100g',
      kcal: 208, protein: 20, carb: 0, fat: 13, sugar: 0,
      keywords: ['三文魚', '三文鱼', 'salmon'],
      weight: 6
    },
    {
      id: 'hk_avocado_half',
      brand: '',
      name: '牛油果 1/2個',
      display: '牛油果 ½個',
      portion: '1/2個',
      kcal: 120, protein: 1.5, carb: 6, fat: 11, sugar: 0.3,
      keywords: ['牛油果', '酪梨', 'avocado'],
      weight: 5
    },
    {
      id: 'hk_takeout_est',
      brand: '',
      name: '外賣一餐（估算）',
      display: '外賣一餐（估算）',
      portion: '1餐',
      kcal: 650, protein: 25, carb: 70, fat: 28, sugar: 15,
      keywords: ['外賣', '外送', '便當', '快餐'],
      weight: 3
    },
    {
      id: 'hk_demae_iccho',
      brand: '出前一丁',
      name: '麻油味即食麵',
      display: '出前一丁麻油味（乾麵估算）',
      portion: '1包',
      kcal: 460, protein: 10, carb: 62, fat: 19, sugar: 3,
      keywords: ['出前一丁', '即食麵', '公仔麵', '杯麵'],
      weight: 7
    },
    {
      id: 'hk_garden_bun',
      brand: '嘉頓',
      name: '餐包',
      display: '嘉頓餐包 1個',
      portion: '1個',
      kcal: 120, protein: 3.5, carb: 22, fat: 2.5, sugar: 4,
      keywords: ['嘉頓', '餐包', '麵包'],
      weight: 5
    }
  ];

  function foodHaystack(caption, attachments) {
    const parts = [String(caption || '')];
    (attachments || []).forEach(a => {
      if (a && a.caption) parts.push(String(a.caption));
      if (a && a.name) parts.push(String(a.name));
    });
    if (chatPendingImages && chatPendingImages.length) {
      chatPendingImages.forEach(im => { if (im && im.name) parts.push(String(im.name)); });
    }
    return parts.join(' ');
  }

  function scoreFoodKeywords(hay, keywords) {
    if (!hay) return 0;
    const h = hay.toLowerCase();
    let score = 0;
    const hit = [];
    (keywords || []).forEach(kw => {
      const k = String(kw || '');
      if (!k) return;
      if (hay.indexOf(k) >= 0 || h.indexOf(k.toLowerCase()) >= 0) {
        score += Math.max(2, Math.min(6, k.length));
        hit.push(k);
      }
    });
    return { score, hit };
  }

  function guessFoodFromLocal(caption, attachments) {
    const hay = foodHaystack(caption, attachments);
    const results = [];

    // 1) foodFavorites（本機收藏優先）
    (state.foodFavorites || []).forEach(f => {
      if (!f || !f.name) return;
      let s = 0;
      const hits = [];
      if (hay && hay.indexOf(f.name) >= 0) { s += 40; hits.push(f.name); }
      else if (f.brand && hay.indexOf(f.brand) >= 0) { s += 12; hits.push(f.brand); }
      if (s > 0) {
        results.push({
          source: 'favorite',
          score: s + (f.useCount || 0),
          brand: f.brand || '',
          name: f.name,
          display: (f.brand ? f.brand + ' ' : '') + f.name,
          portion: f.portion || '',
          meal: f.defaultMeal || null,
          kcal: f.kcal, protein: f.proteinG, carb: f.carbsG, fat: f.fatG, sugar: f.sugarG,
          hits
        });
      }
    });

    // 2) HK 常見包裝／食物目錄
    HK_FOOD_CATALOG.forEach(item => {
      const { score, hit } = scoreFoodKeywords(hay, item.keywords);
      if (score <= 0) return;
      // 百福＋豆腐／蒸煮 加分
      let bonus = (item.weight || 0);
      if (/百福/.test(hay) && /豆腐|蒸煮|滑豆腐|板豆腐/.test(hay) && item.brand === '百福') bonus += 20;
      if (/350\s*ml|350ml|350\s*g/.test(hay.toLowerCase()) && /350/.test(item.portion || '')) bonus += 10;
      results.push({
        source: 'hk_catalog',
        score: score + bonus,
        brand: item.brand,
        name: item.name,
        display: item.display,
        portion: item.portion,
        meal: null,
        kcal: item.kcal, protein: item.protein, carb: item.carb, fat: item.fat, sugar: item.sugar,
        catalogId: item.id,
        hits: hit
      });
    });

    // 3) DEFAULT_FOODS / state.foods
    const foods = (state && state.foods && state.foods.length) ? state.foods : DEFAULT_FOODS;
    foods.forEach(f => {
      if (!f || !f.name) return;
      if (!hay || hay.indexOf(f.name.replace(/\s*\d+g.*/, '').trim()) < 0 && hay.indexOf(f.name) < 0) {
        // partial: first Chinese token
        const short = String(f.name).replace(/[（(].*/, '').replace(/\s+\d+.*/, '').trim();
        if (!short || short.length < 2 || hay.indexOf(short) < 0) return;
        results.push({
          source: 'common',
          score: 8 + short.length,
          brand: '',
          name: f.name,
          display: f.name,
          portion: short.match(/\d+\s*(g|ml|隻|個|碗|scoop)/i) ? (f.name.match(/\d+.*/) || [''])[0] : '',
          meal: null,
          kcal: f.kcal, protein: f.protein, carb: f.carb, fat: f.fat, sugar: f.sugar,
          hits: [short]
        });
        return;
      }
      results.push({
        source: 'common',
        score: 25,
        brand: '',
        name: f.name,
        display: f.name,
        portion: '',
        meal: null,
        kcal: f.kcal, protein: f.protein, carb: f.carb, fat: f.fat, sugar: f.sugar,
        hits: [f.name]
      });
    });

    results.sort((a, b) => b.score - a.score);
    const best = results[0] || null;
    const alts = results.slice(0, 6);
    return { best, alts, hay };
  }

  function applyFoodGuessToDietData(data, guess, mealDefault) {
    if (!guess) return data;
    data.brand = guess.brand || '';
    data.food = guess.display || guess.name || data.food;
    data.portion = guess.portion || '';
    data.kcal = guess.kcal != null ? guess.kcal : data.kcal;
    data.protein = guess.protein != null ? guess.protein : data.protein;
    data.carb = guess.carb != null ? guess.carb : data.carb;
    data.fat = guess.fat != null ? guess.fat : data.fat;
    data.sugar = guess.sugar != null ? guess.sugar : data.sugar;
    if (guess.meal) data.meal = guess.meal;
    else if (mealDefault) data.meal = mealDefault;
    data.aiSuggest = {
      provider: 'local_heuristic',
      rawLabels: guess.hits || [guess.display || guess.name],
      confidence: Math.min(0.92, 0.45 + (guess.score || 0) / 80),
      status: 'pending_confirm',
      source: guess.source || 'hk_catalog',
      catalogId: guess.catalogId || null
    };
    return data;
  }

  function hkFoodTemplateChipsHtml(alts) {
    const list = (alts && alts.length)
      ? alts
      : HK_FOOD_CATALOG.filter(x => x.brand === '百福' || /雞胸|豆腐|燕麥|蛋白粉|維他/.test(x.display)).slice(0, 8)
          .map(item => ({
            source: 'hk_catalog', catalogId: item.id, brand: item.brand, name: item.name,
            display: item.display, portion: item.portion,
            kcal: item.kcal, protein: item.protein, carb: item.carb, fat: item.fat, sugar: item.sugar,
            score: item.weight || 1, hits: []
          }));
    // always ensure 百福蒸煮滑豆腐 visible near top for packaging photos
    const pak = HK_FOOD_CATALOG.find(x => x.id === 'hk_pakfook_steam_soft_350');
    if (pak && !list.some(x => x.catalogId === pak.id || x.display === pak.display)) {
      list.unshift({
        source: 'hk_catalog', catalogId: pak.id, brand: pak.brand, name: pak.name,
        display: pak.display, portion: pak.portion,
        kcal: pak.kcal, protein: pak.protein, carb: pak.carb, fat: pak.fat, sugar: pak.sugar,
        score: 99, hits: []
      });
    }
    const uniq = [];
    const seen = new Set();
    list.forEach(g => {
      const key = g.catalogId || g.display || g.name;
      if (seen.has(key)) return;
      seen.add(key);
      uniq.push(g);
    });
    return `<div class="macro-fav-row" id="ffl-hk-food-chips">` +
      uniq.slice(0, 10).map((g, i) => {
        const label = escapeHtml(g.display || g.name || '食物');
        const k = g.kcal != null ? `<span class="mf-kcal">${g.kcal}kcal</span>` : '';
        return `<button type="button" class="macro-fav-chip food-pack-chip" data-hk-food-i="${i}">${label}${k}</button>`;
      }).join('') + `</div>`;
  }

  function applyHkFoodIndexToDraft(idx) {
    if (!chatPendingDraft) return;
    const alts = (chatPendingDraft._foodAlts && chatPendingDraft._foodAlts.length)
      ? chatPendingDraft._foodAlts
      : null;
    let guess = alts && alts[idx];
    if (!guess) {
      // fallback: chips order from default html — rebuild same list
      const rebuilt = [];
      const pak = HK_FOOD_CATALOG.find(x => x.id === 'hk_pakfook_steam_soft_350');
      if (pak) rebuilt.push(pak);
      HK_FOOD_CATALOG.filter(x => x.id !== 'hk_pakfook_steam_soft_350').slice(0, 9).forEach(x => rebuilt.push(x));
      const item = rebuilt[idx];
      if (!item) return;
      guess = {
        source: 'hk_catalog', catalogId: item.id, brand: item.brand, name: item.name,
        display: item.display, portion: item.portion,
        kcal: item.kcal, protein: item.protein, carb: item.carb, fat: item.fat, sugar: item.sugar,
        score: item.weight || 1, hits: item.keywords || []
      };
    }
    chatPendingDraft.recordType = 'diet';
    chatPendingDraft.data = chatPendingDraft.data || {};
    applyFoodGuessToDietData(chatPendingDraft.data, guess, chatPendingDraft.data.meal);
    chatPendingDraft.summary = `本地模板 · ${guess.display || guess.name}` +
      (guess.kcal != null ? ` · 約 ${guess.kcal} kcal` : '') + '（請確認）';
    chatPendingDraft.conf = Math.min(0.9, 0.5 + (guess.score || 0) / 100);
    const parent = document.querySelector('#p0-draft-card') && document.querySelector('#p0-draft-card').closest('.chat-msg');
    if (parent) parent.remove();
    renderDraftConfirmCard(chatPendingDraft);
    toast('已套用營養估算，請確認後入帳', 'success');
  }

  // Wrap buildStubDietDraft：檔名／caption／收藏／HK 目錄自動填
  const _buildStubDietDraft_food = buildStubDietDraft;
  buildStubDietDraft = function(attachments, caption) {
    const d = _buildStubDietDraft_food(attachments, caption);
    const { best, alts, hay } = guessFoodFromLocal(caption, attachments);
    d._foodAlts = alts;
    d._foodHay = hay;
    if (best && best.score >= 8) {
      applyFoodGuessToDietData(d.data, best, d.data.meal);
      const srcLabel = best.source === 'favorite' ? '收藏' : (best.source === 'hk_catalog' ? 'HK常見包裝' : '常用食物');
      d.summary = `${srcLabel}估計 · ${best.display || best.name}` +
        (best.portion ? ` · ${best.portion}` : '') +
        (best.kcal != null ? ` · 約 ${best.kcal} kcal` : '') + '（請確認）';
      d.conf = Math.min(0.9, 0.5 + best.score / 100);
      d.reason = (d.reason ? d.reason + ' · ' : '') + `本地匹配：${(best.hits || []).slice(0, 3).join('、') || best.display}`;
    } else {
      d.summary = d.summary || '飲食相 · 可點選下方常見包裝模板自動填入營養';
      d.data.aiSuggest = {
        provider: 'local_heuristic',
        rawLabels: [],
        confidence: 0.4,
        status: 'stub_pick_template',
        source: 'none'
      };
    }
    return d;
  };

  // Enhance classify：包裝／標籤／超市／百福／豆腐 → 飲食
  const _classifyPhotoHeuristic_food = classifyPhotoHeuristic;
  classifyPhotoHeuristic = function(fileMeta, caption) {
    const base = _classifyPhotoHeuristic_food(fileMeta, caption);
    const hay = foodHaystack(caption, [{ caption: (fileMeta && fileMeta.name) || '' }]);
    if (/百福|豆腐|包裝|營養成[分份]|食品標籤|惠康|百佳|超市|\d+\s*ml|\d+\s*g|豆奶|雞胸|燕麥|蛋白粉/i.test(hay)) {
      if (base.recordType !== 'diet' || (base.conf || 0) < 0.7) {
        return {
          recordType: 'diet',
          subtype: 'ai_food',
          conf: Math.max(base.conf || 0.55, 0.72),
          reason: '包裝／食物關鍵字 → 飲食確認卡（本地營養模板）'
        };
      }
      return Object.assign({}, base, {
        reason: (base.reason || '') + ' · 包裝食物啟發式'
      });
    }
    return base;
  };

  // Patch diet confirm fields：品牌／份量＋HK 模板 chips
  const _renderDraftConfirmCard_food = renderDraftConfirmCard;
  renderDraftConfirmCard = function(draft) {
    _renderDraftConfirmCard_food(draft);
    if (!draft || draft.recordType !== 'diet') return;
    const fields = $('#p0-draft-fields');
    if (!fields) return;

    // inject brand + portion if missing
    if (!fields.querySelector('[data-df="brand"]')) {
      const foodInput = fields.querySelector('[data-df="food"]');
      const brandWrap = document.createElement('div');
      brandWrap.className = 'row-2';
      brandWrap.innerHTML = `
        <div class="form-group"><label>品牌（可空）</label>
          <input data-df="brand" value="${escapeHtml((draft.data && draft.data.brand) || '')}" placeholder="例如：百福"></div>
        <div class="form-group"><label>份量</label>
          <input data-df="portion" value="${escapeHtml((draft.data && draft.data.portion) || '')}" placeholder="例如：350ml"></div>`;
      if (foodInput && foodInput.closest('.form-group')) {
        foodInput.closest('.form-group').after(brandWrap);
      } else {
        fields.appendChild(brandWrap);
      }
    }

    // HK / match chips
    if (!fields.querySelector('#ffl-hk-food-chips')) {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<label style="font-size:.75rem;color:var(--muted);">常見包裝／本地模板（點選即可自動填入，之後仍可修改）</label>` +
        hkFoodTemplateChipsHtml(draft._foodAlts);
      fields.insertBefore(wrap, fields.firstChild);
      const row = $('#ffl-hk-food-chips');
      if (row) {
        // stash alts on draft for index apply
        if (!draft._foodAlts || !draft._foodAlts.length) {
          draft._foodAlts = HK_FOOD_CATALOG.slice(0, 10).map(item => ({
            source: 'hk_catalog', catalogId: item.id, brand: item.brand, name: item.name,
            display: item.display, portion: item.portion,
            kcal: item.kcal, protein: item.protein, carb: item.carb, fat: item.fat, sugar: item.sugar,
            score: item.weight || 1, hits: item.keywords || []
          }));
          // put 百福 first
          const pak = draft._foodAlts.find(x => x.catalogId === 'hk_pakfook_steam_soft_350');
          if (pak) {
            draft._foodAlts = [pak].concat(draft._foodAlts.filter(x => x !== pak));
          }
        }
        chatPendingDraft = draft;
        row.onclick = (e) => {
          const b = e.target.closest('[data-hk-food-i]');
          if (!b) return;
          applyHkFoodIndexToDraft(+b.getAttribute('data-hk-food-i'));
        };
      }
    }

    // update stub note
    const note = fields.querySelector('.stub-note');
    if (note) {
      note.textContent = '離線本地估計（收藏＋香港常見包裝模板），不會呼叫付費 API。請核對品牌／份量／營養後確認入帳；熱量僅為估算。';
    }
  };

  // readDraftFields：保留 brand／portion／aiSuggest
  const _readDraftFields_food = readDraftFields;
  readDraftFields = function(recordType) {
    const data = _readDraftFields_food(recordType);
    if (recordType === 'diet') {
      const root = $('#p0-draft-fields') || document;
      const brandEl = root.querySelector('[data-df="brand"]');
      const portionEl = root.querySelector('[data-df="portion"]');
      data.brand = brandEl ? (brandEl.value || '') : (chatPendingDraft && chatPendingDraft.data && chatPendingDraft.data.brand) || '';
      data.portion = portionEl ? (portionEl.value || '') : (chatPendingDraft && chatPendingDraft.data && chatPendingDraft.data.portion) || '';
      if (chatPendingDraft && chatPendingDraft.data && chatPendingDraft.data.aiSuggest) {
        data.aiSuggest = Object.assign({}, chatPendingDraft.data.aiSuggest, { status: 'confirmed' });
      }
      // compose food display if brand set and food lacks brand
      if (data.brand && data.food && data.food.indexOf(data.brand) < 0) {
        // keep food as-is (user editable); brand stored separately
      }
    }
    return data;
  };

  // bumpFoodFavorite：一併記 brand／portion
  const _bumpFoodFavorite_food = bumpFoodFavorite;
  bumpFoodFavorite = function(data) {
    _bumpFoodFavorite_food(data);
    const fav = (state.foodFavorites || []).find(f => f.name === data.food || f.name === ((data.brand ? data.brand + ' ' : '') + (data.food || '')));
    if (fav) {
      if (data.brand) fav.brand = data.brand;
      if (data.portion) fav.portion = data.portion;
      if (data.sugar != null) fav.sugarG = data.sugar;
    }
  };

  // fieldsLine 顯示品牌／份量（若有）
  if (typeof fieldsLine === 'function') {
    const _fieldsLine_food = fieldsLine;
    fieldsLine = function(recordType, data) {
      let line = _fieldsLine_food(recordType, data);
      if (recordType === 'diet' && data) {
        const extra = [];
        if (data.brand) extra.push('品牌 ' + data.brand);
        if (data.portion) extra.push('份量 ' + data.portion);
        if (extra.length) line = (line ? line + ' · ' : '') + extra.join(' · ');
      }
      return line;
    };
  }

  /* ========== BloomBody 小寵物＋虛擬試衣＋維度標籤 CRUD ========== */
  const OWNER_AVATAR_STYLES = [
    { id: 'mint', label: '薄荷', skin: '#f2c9a8', top: '#5B8C7A', hair: '#3d2a1f' },
    { id: 'pink', label: '粉紅', skin: '#f5c4b0', top: '#e8919a', hair: '#5a3a2a' },
    { id: 'sky', label: '天空', skin: '#efd0b5', top: '#7BA3C9', hair: '#2c241c' }
  ];
  const PET_SPECIES = [
    { id: 'seal', label: '小海豹' },
    { id: 'hamster', label: '倉鼠' },
    { id: 'hamster_gold', label: '黃金鼠' },
    { id: 'hamster_panda', label: '熊貓鼠' }
  ];
  const TAG_COLORS = ['mint', 'pink', 'sky', 'sand'];

  function ensurePetState() {
    ensureP0State();
    if (!state.meta) state.meta = {};
    if (!state.meta.pet || typeof state.meta.pet !== 'object') {
      state.meta.pet = {
        petName: '小花',
        petSpecies: 'seal',
        ownerAvatar: 'mint',
        baselineWeightKg: null,
        baselineBodyFatPct: null,
        baselineWaistCm: null
      };
    } else {
      const p = state.meta.pet;
      if (!p.petName) p.petName = '小花';
      if (!p.petSpecies) p.petSpecies = 'seal';
      if (!p.ownerAvatar) p.ownerAvatar = 'mint';
    }
    // per-user override optional
    if (currentUser && state.users[currentUser]) {
      if (!state.users[currentUser].pet) {
        state.users[currentUser].pet = Object.assign({}, state.meta.pet);
      } else {
        const up = state.users[currentUser].pet;
        if (!up.petName) up.petName = state.meta.pet.petName;
        if (!up.petSpecies) up.petSpecies = state.meta.pet.petSpecies;
        if (!up.ownerAvatar) up.ownerAvatar = state.meta.pet.ownerAvatar;
      }
    }
    if (!Array.isArray(state.tagCatalog) || !state.tagCatalog.length) {
      state.tagCatalog = [
        { id: 't_hike', label: '行山', colorKey: 'mint' },
        { id: 't_knee', label: '膝護理', colorKey: 'mint' },
        { id: 't_show', label: '備節目', colorKey: 'mint' }
      ];
    }
    state.tagCatalog.forEach(t => {
      if (!t.colorKey) t.colorKey = 'mint';
      if (!t.id) t.id = 't_' + uid();
    });
  }

  function getPetConfig() {
    ensurePetState();
    if (currentUser && state.users[currentUser] && state.users[currentUser].pet) {
      return state.users[currentUser].pet;
    }
    return state.meta.pet;
  }

  function latestBodyMetrics() {
    const bodies = myRecords()
      .filter(r => r.recordType === 'body')
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    const last = bodies[0];
    const first = bodies.length ? bodies[bodies.length - 1] : null;
    const cur = {
      weight: last && last.data && last.data.weight != null ? +last.data.weight : null,
      bodyFat: last && last.data && (last.data.bodyFat != null ? +last.data.bodyFat : (last.data.bodyFatPct != null ? +last.data.bodyFatPct : null)),
      waist: last && last.data && last.data.waist != null ? +last.data.waist : null,
      hip: last && last.data && last.data.hip != null ? +last.data.hip : null
    };
    const pet = getPetConfig();
    const goals = (state.users[currentUser] && state.users[currentUser].goals) || {};
    const base = {
      weight: pet.baselineWeightKg != null ? +pet.baselineWeightKg
        : (goals.weightKg != null ? null /* goal is target not baseline */
          : (first && first.data && first.data.weight != null ? +first.data.weight : cur.weight)),
      bodyFat: pet.baselineBodyFatPct != null ? +pet.baselineBodyFatPct
        : (first && first.data && (first.data.bodyFat != null || first.data.bodyFatPct != null)
          ? +(first.data.bodyFat != null ? first.data.bodyFat : first.data.bodyFatPct)
          : cur.bodyFat),
      waist: pet.baselineWaistCm != null ? +pet.baselineWaistCm
        : (first && first.data && first.data.waist != null ? +first.data.waist : cur.waist)
    };
    // if baseline still null, try earliest weight from goals as soft baseline = cur (neutral)
    if (base.weight == null && cur.weight != null) base.weight = cur.weight;
    if (base.bodyFat == null && cur.bodyFat != null) base.bodyFat = cur.bodyFat;
    if (base.waist == null && cur.waist != null) base.waist = cur.waist;
    return { cur, base, goals };
  }

  /** Owner shape 1=slim … 5=heavier vs baseline; pet level = 6 - owner (inverse) */
  function computeBodyShapeLevels() {
    const { cur, base, goals } = latestBodyMetrics();
    let score = 0; // positive = heavier/fatter vs baseline
    let n = 0;
    if (cur.weight != null && base.weight != null && base.weight > 0) {
      score += ((cur.weight - base.weight) / Math.max(2, base.weight * 0.04));
      n++;
    }
    if (cur.bodyFat != null && base.bodyFat != null) {
      score += ((cur.bodyFat - base.bodyFat) / 2.5);
      n++;
    }
    if (cur.waist != null && base.waist != null && base.waist > 0) {
      score += ((cur.waist - base.waist) / Math.max(1.5, base.waist * 0.03));
      n++;
    }
    // toward goal: if below goal weight, leaner
    if (cur.weight != null && goals.weightKg != null) {
      const g = +goals.weightKg;
      if (g > 0) {
        score += ((cur.weight - g) / Math.max(2, g * 0.05)) * 0.35;
        n += 0.35;
      }
    }
    const avg = n > 0 ? score / n : 0;
    // map avg to 1..5
    let ownerShape = 3;
    if (avg <= -1.2) ownerShape = 1;
    else if (avg <= -0.4) ownerShape = 2;
    else if (avg < 0.4) ownerShape = 3;
    else if (avg < 1.2) ownerShape = 4;
    else ownerShape = 5;
    const petLevel = 6 - ownerShape; // inverse
    return { ownerShape, petLevel, cur, base, goals, avg };
  }

  function ownerAvatarSvg(styleId, shape) {
    const st = OWNER_AVATAR_STYLES.find(s => s.id === styleId) || OWNER_AVATAR_STYLES[0];
    // body width modulated lightly in path too
    const bw = 18 + (shape - 3) * 3;
    return `<svg class="owner-svg" viewBox="0 0 88 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="44" cy="102" rx="22" ry="4" fill="rgba(45,80,65,.12)"/>
      <circle cx="44" cy="28" r="16" fill="${st.skin}"/>
      <path d="M28 22 Q44 8 60 22 Q58 14 44 12 Q30 14 28 22" fill="${st.hair}"/>
      <circle cx="38" cy="28" r="1.6" fill="#333"/><circle cx="50" cy="28" r="1.6" fill="#333"/>
      <path d="M40 34 Q44 37 48 34" stroke="#c47a6a" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <path class="body-fill" d="M${44 - bw} 48 Q44 42 ${44 + bw} 48 L${44 + bw + 2} 88 Q44 94 ${44 - bw - 2} 88 Z" fill="${st.top}"/>
      <rect x="30" y="88" width="10" height="14" rx="3" fill="#3d4a55"/>
      <rect x="48" y="88" width="10" height="14" rx="3" fill="#3d4a55"/>
    </svg>`;
  }

  function hamsterSvg(species, level) {
    let fur = '#e8a05a', belly = '#f6e0c4', ear = '#f0b898', stripe = 'none';
    if (species === 'hamster_gold') { fur = '#d9893b'; belly = '#f3d7b0'; }
    if (species === 'hamster_panda') { fur = '#f5f5f5'; belly = '#fff'; ear = '#333'; stripe = '#222'; }
    return `<svg class="hamster-svg" viewBox="0 0 88 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="44" cy="102" rx="20" ry="4" fill="rgba(45,80,65,.1)"/>
      <ellipse class="belly" cx="44" cy="72" rx="26" ry="22" fill="${fur}"/>
      <ellipse class="belly" cx="44" cy="78" rx="16" ry="12" fill="${belly}"/>
      <circle cx="44" cy="42" r="20" fill="${fur}"/>
      <ellipse class="cheek" cx="28" cy="46" rx="8" ry="7" fill="${belly}"/>
      <ellipse class="cheek" cx="60" cy="46" rx="8" ry="7" fill="${belly}"/>
      <ellipse cx="30" cy="28" rx="7" ry="9" fill="${fur}"/><ellipse cx="30" cy="28" rx="4" ry="5" fill="${ear}"/>
      <ellipse cx="58" cy="28" rx="7" ry="9" fill="${fur}"/><ellipse cx="58" cy="28" rx="4" ry="5" fill="${ear}"/>
      ${stripe !== 'none' ? `<ellipse cx="44" cy="40" rx="8" ry="6" fill="${stripe}" opacity=".25"/>` : ''}
      <circle cx="37" cy="42" r="2.2" fill="#222"/><circle cx="51" cy="42" r="2.2" fill="#222"/>
      <ellipse cx="44" cy="48" rx="3" ry="2.2" fill="#e8919a"/>
      <path class="crumb" d="M20 88 h6 M18 92 h8" stroke="#c4a574" stroke-width="2" stroke-linecap="round"/>
      <g class="sparkle" fill="#f5d76e">
        <path d="M66 22 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5 z"/>
        <path d="M18 30 l1 2.2 2.2 1 -2.2 1 -1 2.2 -1 -2.2 -2.2 -1 2.2 -1 z"/>
      </g>
      <text x="44" y="108" text-anchor="middle" font-size="8" fill="#6b7c72">${level >= 4 ? '♡' : (level <= 2 ? '…' : '')}</text>
    </svg>`;
  }

  function tryOnSvg(shape) {
    // dress silhouette — waist ellipse scales via CSS .waist-band
    return `<svg class="tryon-svg" viewBox="0 0 88 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="44" cy="102" rx="18" ry="3.5" fill="rgba(0,0,0,.06)"/>
      <circle cx="44" cy="22" r="12" fill="#f0d2bc"/>
      <path d="M32 18 Q44 10 56 18" fill="#3d2a1f"/>
      <!-- top -->
      <path d="M28 36 L60 36 L62 58 L26 58 Z" fill="#ff8a6a"/>
      <!-- waist band morph -->
      <ellipse class="waist-band" cx="44" cy="58" rx="18" ry="5" fill="#e85d4c"/>
      <!-- skirt -->
      <path d="M26 58 Q44 62 62 58 L68 92 Q44 98 20 92 Z" fill="#ff6a3d"/>
      <path d="M34 58 L36 92 M52 58 L50 92" stroke="rgba(255,255,255,.35)" stroke-width="1"/>
      <text x="44" y="78" text-anchor="middle" font-size="7" fill="rgba(255,255,255,.9)" font-weight="700">試穿</text>
    </svg>`;
  }

  function petMoodLabel(petLevel) {
    if (petLevel <= 1) return { text: '看起來餓瘦了…請快些活動身體！', cls: 'hungry' };
    if (petLevel === 2) return { text: '有些瘦，等您減脂後再餵飽牠', cls: 'hungry' };
    if (petLevel === 3) return { text: '狀態平常', cls: 'ok' };
    if (petLevel === 4) return { text: '圓潤開心中', cls: 'happy' };
    return { text: '飽飽開心拍手！', cls: 'happy' };
  }

  function renderPetDuoHtml(opts) {
    opts = opts || {};
    ensurePetState();
    const pet = getPetConfig();
    const levels = computeBodyShapeLevels();
    const mood = petMoodLabel(levels.petLevel);
    const speciesLabel = (PET_SPECIES.find(s => s.id === pet.petSpecies) || PET_SPECIES[0]).label;
    const m = levels.cur;
    const metrics = [
      m.weight != null ? `${m.weight.toFixed(1)} kg` : null,
      m.bodyFat != null ? `脂 ${m.bodyFat.toFixed(1)}%` : null,
      m.waist != null ? `腰 ${m.waist} cm` : null
    ].filter(Boolean).join(' · ') || '未有身體數據 — 記一筆體重／腰圍';
    const tip = opts.compact
      ? `主人越貼目標 → 寵物越圓潤；反向亦然（寫實照片風）。`
      : `規則：主人體重／體脂／腰圍相對基準上升 → 寵物變瘦餓；下降／改善 → 寵物變圓潤開心。右側為寫實虛擬試衣預覽（照片風，並非 AR）。基準可於設定修改。`;
    return `<div class="pet-duo-stage" data-owner-shape="${levels.ownerShape}" data-pet-level="${levels.petLevel}">
      <div class="pet-slot">
        <div class="slot-label">主人</div>
        <div class="owner-wrap" data-shape="${levels.ownerShape}">${ownerAvatarSvg(pet.ownerAvatar, levels.ownerShape)}</div>
        <div class="slot-name">${escapeHtml(currentUser || '我')}</div>
        <div class="slot-metrics">${escapeHtml(metrics)}</div>
      </div>
      <div class="pet-slot tryon-slot">
        <div class="slot-label">虛擬試衣</div>
        <div class="tryon-frame">
          <span class="tryon-badge">試穿</span>
          <div class="tryon-wrap" data-shape="${levels.ownerShape}">${tryOnSvg(levels.ownerShape)}</div>
        </div>
        <div class="slot-metrics">腰／體型聯動 · 離線預覽</div>
      </div>
      <div class="pet-slot">
        <div class="slot-label">${escapeHtml(speciesLabel)}</div>
        <div class="hamster-wrap" data-level="${levels.petLevel}">${hamsterSvg(pet.petSpecies, levels.petLevel)}</div>
        <div class="slot-name">${escapeHtml(pet.petName || '豆豆')}</div>
        <div class="pet-mood ${mood.cls}">${escapeHtml(mood.text)}</div>
      </div>
    </div>
    <p class="pet-caption">${escapeHtml(tip)}</p>`;
  }

  function renderPetOnToday() {
    ensurePetState();
    let box = $('#pet-duo-today');
    if (!box) {
      const page = $('#page-today');
      if (!page) return;
      const card = document.createElement('div');
      card.className = 'card pet-duo-card';
      card.innerHTML = `<div class="card-title">主人 · 試衣 · 小寵物</div><div id="pet-duo-today"></div>`;
      const streak = $('#streak-banner');
      if (streak && streak.nextSibling) page.insertBefore(card, streak.nextSibling);
      else page.insertBefore(card, page.firstChild);
      box = $('#pet-duo-today');
    }
    box.innerHTML = renderPetDuoHtml({ compact: false });
  }

  function renderPetOnHabits() {
    ensurePetState();
    let box = $('#pet-duo-habits');
    if (!box) {
      const page = $('#page-habits');
      if (!page) return;
      const card = document.createElement('div');
      card.className = 'card pet-duo-card';
      card.innerHTML = `<div class="card-title">本週寵物心情</div><div id="pet-duo-habits"></div>`;
      const first = page.querySelector('.card');
      if (first) page.insertBefore(card, first);
      else page.appendChild(card);
      box = $('#pet-duo-habits');
    }
    box.innerHTML = renderPetDuoHtml({ compact: true });
  }

  function renderTagCatalogEditable() {
    ensurePetState();
    const tagBox = $('#tag-catalog-list');
    if (!tagBox) return;
    const tags = state.tagCatalog || [];
    if (!tags.length) {
      tagBox.innerHTML = '<span class="hint">未有興趣／維度標籤 — 下面新增</span>';
      return;
    }
    tagBox.innerHTML = tags.map(t =>
      `<span class="tag-chip editable" data-color="${escapeHtml(t.colorKey || 'mint')}" data-tag-id="${escapeHtml(t.id)}">
        ${escapeHtml(t.label)}
        <button type="button" class="tag-edit" data-tag-edit="${escapeHtml(t.id)}" title="改名">✎</button>
        <button type="button" class="tag-del" data-tag-del="${escapeHtml(t.id)}" title="刪除">×</button>
      </span>`
    ).join('');
  }

  function renderPetSettingsPanel() {
    ensurePetState();
    const pet = getPetConfig();
    let panel = $('#pet-settings-panel');
    if (!panel) {
      const host = $('#page-settings');
      if (!host) return;
      const card = document.createElement('div');
      card.className = 'card settings-section';
      card.id = 'pet-settings-panel';
      card.innerHTML = `
        <h3>小寵物同虛擬試衣</h3>
        <div class="pet-settings-row">
          <div class="form-group"><label>寵物名</label><input type="text" id="set-pet-name" maxlength="12"></div>
          <div class="form-group"><label>品種</label>
            <select id="set-pet-species">${PET_SPECIES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
          </div>
        </div>
        <div class="pet-settings-row">
          <div class="form-group"><label>主人頭像風格</label>
            <select id="set-owner-avatar">${OWNER_AVATAR_STYLES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}</select>
          </div>
          <div class="form-group"><label>基準體重 kg</label><input type="number" id="set-pet-base-w" inputmode="decimal" step="0.1" placeholder="自動取最早記錄"></div>
        </div>
        <div class="pet-settings-row">
          <div class="form-group"><label>基準體脂 %</label><input type="number" id="set-pet-base-bf" inputmode="decimal" step="0.1"></div>
          <div class="form-group"><label>基準腰圍 cm</label><input type="number" id="set-pet-base-waist" inputmode="decimal" step="0.1"></div>
        </div>
        <button class="btn btn-secondary btn-sm" type="button" id="btn-save-pet">儲存寵物設定</button>
        <p class="hint">主人變瘦／脂降 → 寵物變圓潤開心；反之寵物變瘦餓。虛擬試衣跟腰／體型變肥瘦（離線 SVG，非 AR）。</p>`;
      const tagSec = host.querySelector('#tag-catalog-list');
      const tagCard = tagSec && tagSec.closest('.card');
      if (tagCard && tagCard.parentNode) tagCard.parentNode.insertBefore(card, tagCard);
      else host.insertBefore(card, host.firstChild);
      panel = card;
    }
    const sn = $('#set-pet-name'); if (sn) sn.value = pet.petName || '';
    const ss = $('#set-pet-species'); if (ss) ss.value = pet.petSpecies || 'hamster';
    const sa = $('#set-owner-avatar'); if (sa) sa.value = pet.ownerAvatar || 'mint';
    const sw = $('#set-pet-base-w'); if (sw) sw.value = pet.baselineWeightKg != null ? pet.baselineWeightKg : '';
    const sb = $('#set-pet-base-bf'); if (sb) sb.value = pet.baselineBodyFatPct != null ? pet.baselineBodyFatPct : '';
    const swa = $('#set-pet-base-waist'); if (swa) swa.value = pet.baselineWaistCm != null ? pet.baselineWaistCm : '';
  }

  function enhanceTagSettingsSection() {
    const h3 = document.querySelector('#tag-catalog-list') && document.querySelector('#tag-catalog-list').closest('.card') && document.querySelector('#tag-catalog-list').closest('.card').querySelector('h3');
    if (h3 && h3.textContent.indexOf('維度') < 0) {
      h3.textContent = '自訂興趣／維度標籤';
    }
    let hint = document.querySelector('#tag-dim-hint');
    if (!hint) {
      const list = $('#tag-catalog-list');
      if (list && list.parentNode) {
        hint = document.createElement('p');
        hint.id = 'tag-dim-hint';
        hint.className = 'dim-hint';
        hint.textContent = '可自由新增、改名、刪除（例如：行山、膝護理、備節目、普拉提）。標籤會出現在對話確認卡與歷史篩選。';
        list.parentNode.insertBefore(hint, list.nextSibling);
      }
    }
    // color picker for new tags
    if (!$('#set-new-tag-color')) {
      const inp = $('#set-new-tag');
      if (inp && inp.parentNode) {
        const wrap = document.createElement('div');
        wrap.className = 'form-group';
        wrap.innerHTML = `<label>顏色</label><select id="set-new-tag-color">
          <option value="mint">薄荷</option><option value="pink">粉紅</option>
          <option value="sky">天空</option><option value="sand">沙色</option></select>`;
        const row = inp.closest('.row-2');
        if (row) row.insertBefore(wrap, row.children[1] || null);
      }
    }
  }

  function bindPetAndTagUI() {
    ensurePetState();
    enhanceTagSettingsSection();
    renderPetSettingsPanel();
    renderTagCatalogEditable();

    const savePet = $('#btn-save-pet');
    if (savePet && !savePet.dataset.bound) {
      savePet.dataset.bound = '1';
      savePet.onclick = () => {
        ensurePetState();
        const cfg = {
          petName: (($('#set-pet-name') && $('#set-pet-name').value) || '豆豆').trim().slice(0, 12) || '豆豆',
          petSpecies: ($('#set-pet-species') && $('#set-pet-species').value) || 'hamster',
          ownerAvatar: ($('#set-owner-avatar') && $('#set-owner-avatar').value) || 'mint',
          baselineWeightKg: (() => { const v = $('#set-pet-base-w'); return v && v.value !== '' ? +v.value : null; })(),
          baselineBodyFatPct: (() => { const v = $('#set-pet-base-bf'); return v && v.value !== '' ? +v.value : null; })(),
          baselineWaistCm: (() => { const v = $('#set-pet-base-waist'); return v && v.value !== '' ? +v.value : null; })()
        };
        state.meta.pet = Object.assign({}, state.meta.pet, cfg);
        if (currentUser && state.users[currentUser]) {
          state.users[currentUser].pet = Object.assign({}, state.users[currentUser].pet || {}, cfg);
        }
        saveState();
        toast('已儲存寵物設定', 'success');
        renderPetOnToday();
        renderPetOnHabits();
      };
    }

    const tagBox = $('#tag-catalog-list');
    if (tagBox && !tagBox.dataset.petBound) {
      tagBox.dataset.petBound = '1';
      tagBox.addEventListener('click', (e) => {
        const del = e.target.closest('[data-tag-del]');
        const ed = e.target.closest('[data-tag-edit]');
        if (del) {
          const id = del.getAttribute('data-tag-del');
          if (!confirm('刪除此標籤？舊記錄上的標籤字串會保留。')) return;
          state.tagCatalog = (state.tagCatalog || []).filter(t => t.id !== id);
          saveState();
          renderTagCatalogEditable();
          toast('已刪標籤', 'success');
          return;
        }
        if (ed) {
          const id = ed.getAttribute('data-tag-edit');
          const t = (state.tagCatalog || []).find(x => x.id === id);
          if (!t) return;
          const next = prompt('改名', t.label);
          if (next == null) return;
          const label = next.trim();
          if (!label) { toast('名稱不可為空', 'warn'); return; }
          if (state.tagCatalog.some(x => x.label === label && x.id !== id)) {
            toast('已有同名標籤', 'warn'); return;
          }
          t.label = label;
          const col = prompt('顏色 mint / pink / sky / sand', t.colorKey || 'mint');
          if (col && TAG_COLORS.indexOf(col.trim()) >= 0) t.colorKey = col.trim();
          saveState();
          renderTagCatalogEditable();
          toast('已更新標籤', 'success');
        }
      });
    }

    // wrap add-tag to support color
    const btnTag = $('#btn-add-tag');
    if (btnTag && !btnTag.dataset.petColor) {
      btnTag.dataset.petColor = '1';
      const prev = btnTag.onclick;
      btnTag.onclick = () => {
        ensurePetState();
        const inp = $('#set-new-tag');
        const label = (inp && inp.value || '').trim();
        if (!label) { toast('請輸入標籤', 'warn'); return; }
        if (state.tagCatalog.some(t => t.label === label)) { toast('已有呢個標籤', 'warn'); return; }
        const colEl = $('#set-new-tag-color');
        const colorKey = (colEl && colEl.value) || 'mint';
        state.tagCatalog.push({ id: 't_' + uid(), label, colorKey });
        saveState();
        if (inp) inp.value = '';
        renderTagCatalogEditable();
        if (typeof renderSettings === 'function') {
          // keep other settings fields; re-render tags only
        }
        toast('已加標籤', 'success');
      };
    }
  }

  // Hook renderToday / renderHabitsPage / renderSettings
  const _renderToday_pet = renderToday;
  renderToday = function() {
    _renderToday_pet();
    try { renderPetOnToday(); } catch (e) { console.warn('pet today', e); }
  };
  const _renderHabitsPage_pet = typeof renderHabitsPage === 'function' ? renderHabitsPage : null;
  if (_renderHabitsPage_pet) {
    renderHabitsPage = function() {
      _renderHabitsPage_pet();
      try { renderPetOnHabits(); } catch (e) { console.warn('pet habits', e); }
    };
  }
  const _renderSettings_pet = renderSettings;
  renderSettings = function() {
    _renderSettings_pet();
    try {
      enhanceTagSettingsSection();
      renderPetSettingsPanel();
      renderTagCatalogEditable();
      bindPetAndTagUI();
    } catch (e) { console.warn('pet settings', e); }
  };

  // ensure on load after login path
  const _ensureP0_pet = ensureP0State;
  ensureP0State = function() {
    _ensureP0_pet();
    if (!state.meta) state.meta = {};
    if (!state.meta.pet) {
      state.meta.pet = {
        petName: '豆豆', petSpecies: 'hamster', ownerAvatar: 'mint',
        baselineWeightKg: null, baselineBodyFatPct: null, baselineWaistCm: null
      };
    }
  };

  /* ========== 飲食快記：已知目錄／收藏一鍵入帳；未知則啟發式＋上網估算 stub ========== */
  const HK_FOOD_EXTRA = [
    { id: 'hk_pakfook_box_phrase', brand: '百福', name: '蒸煮滑豆腐', display: '百福蒸煮滑豆腐（1盒）', portion: '1盒（約350g）',
      kcal: 245, protein: 24.5, carb: 5.6, fat: 14, sugar: 1.4,
      keywords: ['食咗一盒百福', '一盒百福', '百福豆腐', '食咗百福', '百福一盒'], weight: 14 },
    { id: 'hk_meiji_milk_200', brand: '明治', name: '低脂牛奶', display: '明治低脂牛奶 200ml', portion: '200ml',
      kcal: 92, protein: 6.8, carb: 9.6, fat: 3, sugar: 9.6,
      keywords: ['明治', '低脂奶', '牛奶', 'meiji'], weight: 7 },
    { id: 'hk_hokkaido_milk', brand: '雪印', name: '北海道牛奶', display: '雪印北海道牛奶 200ml', portion: '200ml',
      kcal: 134, protein: 6.6, carb: 9.8, fat: 7.6, sugar: 9.8,
      keywords: ['雪印', '北海道牛奶', '鮮奶'], weight: 6 },
    { id: 'hk_kee_wa_tea', brand: '麒麟', name: '午後紅茶', display: '午後紅茶 500ml', portion: '500ml',
      kcal: 180, protein: 0, carb: 45, fat: 0, sugar: 45,
      keywords: ['午後紅茶', '麒麟茶', '奶茶'], weight: 6 },
    { id: 'hk_vita_lemon_tea', brand: '維他', name: '檸檬茶', display: '維他檸檬茶 250ml', portion: '250ml',
      kcal: 105, protein: 0, carb: 26, fat: 0, sugar: 25,
      keywords: ['維他檸檬茶', '檸檬茶'], weight: 7 },
    { id: 'hk_hung_fook_tong', brand: '鴻福堂', name: '燒賣／點心估算', display: '鴻福堂點心（估算）', portion: '1份',
      kcal: 320, protein: 12, carb: 40, fat: 12, sugar: 8,
      keywords: ['鴻福堂', '點心', '燒賣'], weight: 5 },
    { id: 'hk_maxim_cake', brand: '美心', name: '蛋撻', display: '美心蛋撻 1件', portion: '1件',
      kcal: 195, protein: 3.5, carb: 22, fat: 11, sugar: 8,
      keywords: ['美心', '蛋撻', '蛋撻'], weight: 6 },
    { id: 'hk_yoshinoya', brand: '吉野家', name: '牛肉飯（普通）', display: '吉野家牛肉飯（估算）', portion: '1碗',
      kcal: 720, protein: 28, carb: 95, fat: 24, sugar: 8,
      keywords: ['吉野家', '牛肉飯'], weight: 7 },
    { id: 'hk_cafedecoral_borsch', brand: '大家樂', name: '羅宋湯套餐估算', display: '大家樂午餐（估算）', portion: '1餐',
      kcal: 680, protein: 30, carb: 75, fat: 26, sugar: 12,
      keywords: ['大家樂', '快餐店', '茶餐廳套餐'], weight: 5 },
    { id: 'hk_subway_6inch', brand: 'Subway', name: '6吋三文治', display: 'Subway 6吋（估算）', portion: '1份',
      kcal: 350, protein: 20, carb: 45, fat: 10, sugar: 6,
      keywords: ['subway', '三文治', '潛艇堡'], weight: 5 },
    { id: 'hk_banana_1', brand: '', name: '香蕉 1支', display: '香蕉 1支', portion: '1支',
      kcal: 105, protein: 1.3, carb: 27, fat: 0.4, sugar: 14,
      keywords: ['香蕉', '食咗香蕉'], weight: 5 },
    { id: 'hk_apple_1', brand: '', name: '蘋果 1個', display: '蘋果 1個', portion: '1個',
      kcal: 95, protein: 0.5, carb: 25, fat: 0.3, sugar: 19,
      keywords: ['蘋果', '食咗蘋果'], weight: 5 },
    { id: 'hk_broccoli_100', brand: '', name: '西蘭花 100g', display: '西蘭花 100g', portion: '100g',
      kcal: 34, protein: 2.8, carb: 7, fat: 0.4, sugar: 1.5,
      keywords: ['西蘭花', '青花菜'], weight: 5 },
    { id: 'hk_sweet_potato', brand: '', name: '番薯 150g', display: '番薯 150g', portion: '150g',
      kcal: 129, protein: 2.4, carb: 30, fat: 0.2, sugar: 6,
      keywords: ['番薯', '红薯', '甜薯'], weight: 5 },
    { id: 'hk_congee_plain', brand: '', name: '白粥 1碗', display: '白粥 1碗', portion: '1碗',
      kcal: 150, protein: 3, carb: 33, fat: 0.3, sugar: 0,
      keywords: ['白粥', '稀飯', '粥'], weight: 4 },
    { id: 'hk_wonton_noodle', brand: '', name: '雲吞麵', display: '雲吞麵（估算）', portion: '1碗',
      kcal: 480, protein: 22, carb: 58, fat: 16, sugar: 3,
      keywords: ['雲吞麵', '馄饨面', '雲吞'], weight: 6 },
    { id: 'hk_siu_mai', brand: '', name: '燒賣 4件', display: '燒賣 4件（估算）', portion: '4件',
      kcal: 280, protein: 14, carb: 28, fat: 12, sugar: 2,
      keywords: ['燒賣', '烧卖', '蝦餃'], weight: 5 },
    { id: 'hk_protein_bar', brand: '', name: '蛋白棒 1條', display: '蛋白棒 1條（估算）', portion: '1條',
      kcal: 200, protein: 20, carb: 18, fat: 7, sugar: 8,
      keywords: ['蛋白棒', 'protein bar'], weight: 6 },
    { id: 'hk_bubble_tea', brand: '', name: '珍珠奶茶', display: '珍奶（中杯估算）', portion: '1杯',
      kcal: 380, protein: 5, carb: 55, fat: 14, sugar: 40,
      keywords: ['珍奶', '珍珠奶茶', '奶茶'], weight: 5 },
    { id: 'hk_salad_chicken', brand: '', name: '雞胸沙律', display: '雞胸沙律（估算）', portion: '1份',
      kcal: 280, protein: 32, carb: 12, fat: 12, sugar: 5,
      keywords: ['沙律', '沙拉', '雞胸沙律'], weight: 6 }
  ];

  function ensureHkCatalogExpanded() {
    if (typeof HK_FOOD_CATALOG === 'undefined' || !Array.isArray(HK_FOOD_CATALOG)) return;
    const have = new Set(HK_FOOD_CATALOG.map(x => x.id));
    HK_FOOD_EXTRA.forEach(item => {
      if (!have.has(item.id)) HK_FOOD_CATALOG.push(item);
    });
  }
  ensureHkCatalogExpanded();

  function detectMealFromPhrase(text) {
    const t = String(text || '');
    if (/第一餐|早餐|breakfast/i.test(t)) return '第一餐';
    if (/第二餐|午餐|lunch/i.test(t)) return '第二餐';
    if (/第三餐|晚餐|dinner/i.test(t)) return '第三餐';
    return '加餐';
  }

  function parseQtyMultiplier(text) {
    const t = String(text || '');
    let m = t.match(/(\d+(?:\.\d+)?)\s*(盒|包|個|隻|杯|碗|份|支|件)/);
    if (m) return Math.min(5, Math.max(0.5, +m[1]));
    if (/半盒|半個|半碗/.test(t)) return 0.5;
    if (/兩盒|兩個|兩碗|兩支|兩件/.test(t)) return 2;
    return 1;
  }

  function isDietIntakePhrase(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    return /食咗|吃了|吃了|飲咗|喝了|吃咗|吃完|剛吃|啱啱食|剛剛吃|用餐|加餐/.test(t)
      || /一盒|一包|一碗|一杯|一個|一支/.test(t);
  }

  function scaleGuess(guess, mult) {
    if (!guess || mult === 1) return guess;
    const g = Object.assign({}, guess);
    ['kcal', 'protein', 'carb', 'fat', 'sugar'].forEach(k => {
      if (g[k] != null) g[k] = Math.round(+g[k] * mult * 10) / 10;
    });
    if (g.portion) g.portion = g.portion + (mult !== 1 ? ` ×${mult}` : '');
    if (g.display && mult !== 1) g.display = g.display + ` ×${mult}`;
    return g;
  }

  function buildQuickDietParsed(guess, raw, meal) {
    return {
      ok: true,
      confidence: Math.min(0.95, 0.55 + (guess.score || 20) / 100),
      recordType: 'diet',
      data: {
        meal: meal || detectMealFromPhrase(raw),
        food: guess.display || guess.name,
        brand: guess.brand || '',
        portion: guess.portion || '',
        kcal: guess.kcal, protein: guess.protein, carb: guess.carb, fat: guess.fat, sugar: guess.sugar,
        aiSuggest: {
          provider: 'local_heuristic',
          status: 'pending_confirm',
          source: guess.source || 'hk_catalog',
          catalogId: guess.catalogId || null,
          rawLabels: guess.hits || []
        }
      },
      remark: '飲食快記',
      summary: `${meal || detectMealFromPhrase(raw)} · ${guess.display || guess.name}` +
        (guess.kcal != null ? ` · ${guess.kcal} kcal` : ''),
      rawText: raw,
      _quickFood: true,
      _foodGuess: guess
    };
  }

  function renderQuickFoodConfirm(parsed) {
    const g = parsed._foodGuess || {};
    const pub = !!(state.meta && state.meta.defaultPublic);
    appendChatMessage({
      messageId: msgUid(), ownerUser: currentUser, role: 'bot',
      createdAt: nowTs(),
      text: `找到目錄／收藏：「${g.display || g.name}」約 ${g.kcal != null ? g.kcal + ' kcal' : '—'}。一鍵入帳或修改細節？`,
      card: { type: 'quick_food', parsed }
    });
    renderChatThread();
    // inject buttons after render
    setTimeout(() => {
      const thread = $('#chat-thread');
      if (!thread) return;
      const lastBot = [...thread.querySelectorAll('.chat-msg.bot')].pop();
      if (!lastBot || lastBot.querySelector('.quick-food-actions')) return;
      const box = document.createElement('div');
      box.className = 'quick-food-actions';
      box.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';
      box.innerHTML = `
        <button type="button" class="btn btn-primary btn-sm" data-qf="save">✓ 一鍵入帳</button>
        <button type="button" class="btn btn-secondary btn-sm" data-qf="edit">改細節</button>
        <button type="button" class="btn btn-ghost btn-sm" data-qf="cancel">不是這項</button>`;
      lastBot.appendChild(box);
      box.onclick = async (e) => {
        const b = e.target.closest('[data-qf]');
        if (!b) return;
        const act = b.getAttribute('data-qf');
        box.remove();
        if (act === 'cancel') {
          appendChatMessage({
            messageId: msgUid(), ownerUser: currentUser, role: 'bot',
            createdAt: nowTs(),
            text: '好，你可以再講食物名，或點選「上網估算」（P2 雲查，目前離線使用預設值）。',
            card: null
          });
          renderChatThread();
          return;
        }
        if (act === 'edit') {
          const draft = {
            recordType: 'diet',
            conf: parsed.confidence,
            summary: parsed.summary,
            reason: '飲食快記 · 可改',
            data: Object.assign({}, parsed.data),
            _foodAlts: typeof guessFoodFromLocal === 'function'
              ? (guessFoodFromLocal(parsed.rawText, []).alts || [])
              : []
          };
          renderDraftConfirmCard(draft);
          return;
        }
        // save
        await commitChatRecord(parsed, { isPublic: pub });
        if (typeof bumpFoodFavorite === 'function') bumpFoodFavorite(parsed.data);
        toast('已快速入帳飲食', 'success');
      };
    }, 30);
  }

  function renderUnknownFoodPrompt(raw, meal) {
    const defaults = {
      meal: meal || detectMealFromPhrase(raw),
      food: raw.replace(/^(食咗|吃了|飲咗|喝了)/, '').trim() || '未知食物',
      brand: '', portion: '1份（估算）',
      kcal: 300, protein: 12, carb: 35, fat: 12, sugar: 8
    };
    appendChatMessage({
      messageId: msgUid(), ownerUser: currentUser, role: 'bot',
      createdAt: nowTs(),
      text: `目錄未有「${defaults.food}」。可以：① 改名／填營養入帳；② 用離線默認估算（${defaults.kcal} kcal）；③ 「上網估算」日後接雲端（目前為 P2 stub）。`,
      card: { type: 'unknown_food' }
    });
    renderChatThread();
    setTimeout(() => {
      const thread = $('#chat-thread');
      if (!thread) return;
      const lastBot = [...thread.querySelectorAll('.chat-msg.bot')].pop();
      if (!lastBot || lastBot.querySelector('.unknown-food-actions')) return;
      const box = document.createElement('div');
      box.className = 'unknown-food-actions';
      box.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;';
      box.innerHTML = `
        <button type="button" class="btn btn-primary btn-sm" data-uf="default">用默認估算入帳</button>
        <button type="button" class="btn btn-secondary btn-sm" data-uf="edit">我自己填</button>
        <button type="button" class="btn btn-ghost btn-sm" data-uf="online">上網估算</button>`;
      lastBot.appendChild(box);
      box.onclick = async (e) => {
        const b = e.target.closest('[data-uf]');
        if (!b) return;
        const act = b.getAttribute('data-uf');
        const pub = !!(state.meta && state.meta.defaultPublic);
        if (act === 'online') {
          alert('「上網估算」= P2 雲端營養查詢（未接 API）。目前請使用預設估算或自行填寫；之後可接 Open Food Facts／付費視覺 API。');
          return;
        }
        box.remove();
        if (act === 'edit') {
          const draft = {
            recordType: 'diet', conf: 0.4,
            summary: '未知食物 · 請填營養',
            reason: '目錄未命中',
            data: Object.assign({}, defaults, { kcal: null, protein: null, carb: null, fat: null, sugar: null }),
            _foodAlts: []
          };
          renderDraftConfirmCard(draft);
          return;
        }
        await commitChatRecord({
          ok: true, confidence: 0.45, recordType: 'diet',
          data: defaults,
          remark: '離線默認估算（可日後上網校正）',
          summary: `${defaults.meal} · ${defaults.food} · 約 ${defaults.kcal} kcal（默認）`,
          rawText: raw
        }, { isPublic: pub });
        toast('已用默認估算入帳', 'success');
      };
    }, 30);
  }

  // Wrap handleChatSend：飲食短語 → 目錄命中一鍵確認；未知 → 默認／自填／上網 stub
  const _handleChatSend_foodq = handleChatSend;
  handleChatSend = async function(text) {
    const raw = String(text || '').trim();
    if (raw && /^(取消|撤回|undo|cancel)$/i.test(raw)) {
      return _handleChatSend_foodq(text);
    }
    if (raw && !(chatPendingImages && chatPendingImages.length) && !chatPendingImage && isDietIntakePhrase(raw)) {
      ensureHkCatalogExpanded();
      // append user message once
      appendChatMessage({
        messageId: msgUid(), ownerUser: currentUser, role: 'user',
        createdAt: nowTs(), text: raw, card: null, imageId: null
      });
      renderChatThread();
      const handled = await (async () => {
        if (typeof guessFoodFromLocal !== 'function') return false;
        const mult = parseQtyMultiplier(raw);
        const meal = detectMealFromPhrase(raw);
        const { best } = guessFoodFromLocal(raw, []);
        if (best && best.score >= 8) {
          renderQuickFoodConfirm(buildQuickDietParsed(scaleGuess(best, mult), raw, meal));
          return true;
        }
        if (/食咗|吃了|飲咗|喝了/.test(raw)) {
          renderUnknownFoodPrompt(raw, meal);
          return true;
        }
        return false;
      })();
      if (handled) {
        const input = $('#chat-input');
        if (input) input.value = '';
        return;
      }
      // fall through: already appended user msg — call original would double-append.
      // So continue with parse only:
      const parsed = parseChatIntent(raw);
      if (!parsed.ok) {
        if (parsed.clarify) {
          chatPendingClarify = parsed.clarify;
          appendChatMessage({
            messageId: msgUid(), ownerUser: currentUser, role: 'bot',
            createdAt: nowTs(), text: parsed.ask || parsed.clarify.ask || '請再說明清楚一些',
            card: { type: 'clarify', options: parsed.clarify.options || [] }
          });
          renderChatThread();
          return;
        }
        appendChatMessage({
          messageId: msgUid(), ownerUser: currentUser, role: 'bot',
          createdAt: nowTs(), text: parsed.ask || '無法理解，請再試一次。', card: null
        });
        renderChatThread();
        return;
      }
      const pub = !!(state.meta && state.meta.defaultPublic);
      if (parsed.multi && parsed.multi.length) {
        for (const p of parsed.multi) await commitChatRecord(p, { isPublic: pub });
        return;
      }
      await commitChatRecord(parsed, { isPublic: pub });
      return;
    }
    return _handleChatSend_foodq(text);
  };

  /* ========== 好友本地競賽（只用 isPublic 記錄） ========== */
  function ensureChallengeState() {
    ensureP0State();
    if (!state.meta) state.meta = {};
    if (!state.meta.challenge || typeof state.meta.challenge !== 'object') {
      state.meta.challenge = {
        weeklyGoalType: 'exercise_min', // exercise_min | streak | weight_down
        weeklyGoalValue: 150,
        title: '本週雙人挑戰'
      };
    }
  }

  function weekBounds(offset) {
    const now = new Date();
    const day = now.getDay(); // 0 Sun
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + (offset || 0) * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    const p = n => String(n).padStart(2, '0');
    const key = d => `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    return { start, end, startKey: key(start), endKey: key(new Date(end.getTime() - 1)) };
  }

  function publicRecordsOf(user) {
    return (state.records || []).filter(r => r.ownerUser === user && r.isPublic === true);
  }

  function streakFromPublic(user) {
    // approximate streak using public records date keys
    const keys = [...new Set(publicRecordsOf(user).map(r => tsDateKey(r.timestamp)))].sort().reverse();
    if (!keys.length) return 0;
    let streak = 0;
    let cursor = todayKey();
    const set = new Set(keys);
    // if today no public log, start from yesterday
    if (!set.has(cursor)) {
      const d = tsToDate(cursor + ' 00:00:00');
      if (!d) return 0;
      d.setDate(d.getDate() - 1);
      const p = n => String(n).padStart(2, '0');
      cursor = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    }
    while (set.has(cursor)) {
      streak++;
      const d = tsToDate(cursor + ' 00:00:00');
      if (!d) break;
      d.setDate(d.getDate() - 1);
      const p = n => String(n).padStart(2, '0');
      cursor = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    }
    return streak;
  }

  function weekExerciseMin(user, wb) {
    return publicRecordsOf(user)
      .filter(r => r.recordType === 'exercise' && tsDateKey(r.timestamp) >= wb.startKey && tsDateKey(r.timestamp) <= wb.endKey)
      .reduce((s, r) => s + (+((r.data && r.data.minutes) || 0)), 0);
  }

  function weightDeltaPublic(user, wb) {
    const bodies = publicRecordsOf(user)
      .filter(r => r.recordType === 'body' && r.data && r.data.weight != null)
      .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
    if (bodies.length < 1) return null;
    const inWeek = bodies.filter(r => tsDateKey(r.timestamp) >= wb.startKey && tsDateKey(r.timestamp) <= wb.endKey);
    const latest = (inWeek.length ? inWeek : bodies)[ (inWeek.length ? inWeek : bodies).length - 1 ];
    const earliest = bodies[0];
    // delta vs start of week or first ever public
    const weekStartBodies = bodies.filter(r => tsDateKey(r.timestamp) <= wb.startKey);
    const base = weekStartBodies.length ? weekStartBodies[weekStartBodies.length - 1] : earliest;
    if (!latest || !base) return null;
    return +(+latest.data.weight - +base.data.weight).toFixed(2);
  }

  function duoUsers() {
    const names = Object.keys(state.users || {});
    if (names.length < 2) return { me: currentUser, partner: null };
    const partner = names.find(u => u !== currentUser) || null;
    return { me: currentUser, partner };
  }

  function buildLeaderboard() {
    ensureChallengeState();
    const wb = weekBounds(0);
    const { me, partner } = duoUsers();
    const users = [me, partner].filter(Boolean);
    const rows = users.map(u => {
      const ex = weekExerciseMin(u, wb);
      const st = streakFromPublic(u);
      const wd = weightDeltaPublic(u, wb);
      return { user: u, exerciseMin: ex, streak: st, weightDelta: wd };
    });
    // ranks
    const byEx = [...rows].sort((a, b) => b.exerciseMin - a.exerciseMin);
    const bySt = [...rows].sort((a, b) => b.streak - a.streak);
    // weight: more negative (loss) wins
    const byW = [...rows].sort((a, b) => {
      const av = a.weightDelta == null ? 999 : a.weightDelta;
      const bv = b.weightDelta == null ? 999 : b.weightDelta;
      return av - bv;
    });
    rows.forEach(r => {
      r.rankEx = byEx.findIndex(x => x.user === r.user) + 1;
      r.rankSt = bySt.findIndex(x => x.user === r.user) + 1;
      r.rankW = byW.findIndex(x => x.user === r.user) + 1;
    });
    return { wb, rows, challenge: state.meta.challenge };
  }

  function challengeProgress(row, ch) {
    if (ch.weeklyGoalType === 'exercise_min') {
      const goal = ch.weeklyGoalValue || 150;
      return { label: `運動 ${row.exerciseMin}/${goal} 分`, pct: Math.min(100, Math.round(100 * row.exerciseMin / goal)) };
    }
    if (ch.weeklyGoalType === 'streak') {
      const goal = ch.weeklyGoalValue || 7;
      return { label: `連續公開打卡 ${row.streak}/${goal} 日`, pct: Math.min(100, Math.round(100 * row.streak / goal)) };
    }
    // weight_down: goal kg to lose
    const goal = ch.weeklyGoalValue || 0.5;
    const lost = row.weightDelta == null ? 0 : Math.max(0, -row.weightDelta);
    return { label: `減重 ${lost.toFixed(1)}/${goal} kg`, pct: Math.min(100, Math.round(100 * lost / goal)) };
  }

  function renderChallengeCard() {
    ensureChallengeState();
    const { me, partner } = duoUsers();
    let host = $('#challenge-card-root');
    if (!host) {
      // prefer circle page, also today
      const circle = $('#page-circle');
      const today = $('#page-today');
      const mount = (page, id) => {
        if (!page) return null;
        let el = page.querySelector('#' + id);
        if (el) return el;
        const card = document.createElement('div');
        card.className = 'card challenge-card';
        card.innerHTML = `<div class="card-title">雙人週挑戰 · 排行榜</div><div id="${id}"></div>
          <p class="hint">只計「允許搭檔查看」的公開記錄；私密不入榜。100% 離線本機雙人。</p>`;
        page.insertBefore(card, page.firstChild);
        return card.querySelector('#' + id);
      };
      host = mount(circle, 'challenge-card-root') || mount(today, 'challenge-card-today');
      // also ensure today has one
      if (today && !today.querySelector('#challenge-card-today')) mount(today, 'challenge-card-today');
      host = $('#challenge-card-root') || $('#challenge-card-today');
    }
    // render both if exist
    ['challenge-card-root', 'challenge-card-today'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const { wb, rows, challenge } = buildLeaderboard();
      const range = `${wb.startKey.slice(4,6)}/${wb.startKey.slice(6)} – ${wb.endKey.slice(4,6)}/${wb.endKey.slice(6)}`;
      if (!partner) {
        el.innerHTML = `<p class="hint">目前只有一個本機用戶。於設定新增用戶後即可進行雙人挑戰。</p>`;
        return;
      }
      const goalTypeLabel = challenge.weeklyGoalType === 'streak' ? '連續打卡'
        : (challenge.weeklyGoalType === 'weight_down' ? '減重' : '運動分鐘');
      el.innerHTML = `
        <div class="chal-head">
          <strong>${escapeHtml(challenge.title || '本週雙人挑戰')}</strong>
          <span class="chal-range">${range}</span>
        </div>
        <div class="chal-goal">目標：${goalTypeLabel} ≥ ${escapeHtml(String(challenge.weeklyGoalValue))}
          <button type="button" class="btn btn-ghost btn-sm" id="btn-chal-edit-${id}" style="margin-left:6px;">改目標</button>
        </div>
        <div class="chal-board">
          ${rows.map(r => {
            const prog = challengeProgress(r, challenge);
            const crown = (r.rankEx === 1 && r.exerciseMin > 0) ? '👑 ' : '';
            const wtxt = r.weightDelta == null ? '—' : ((r.weightDelta > 0 ? '+' : '') + r.weightDelta + ' kg');
            return `<div class="chal-row ${r.user === me ? 'me' : ''}">
              <div class="chal-user">${crown}${escapeHtml(r.user)}${r.user === me ? '（我）' : ''}</div>
              <div class="chal-metrics">
                <span>🔥 連續 ${r.streak} 日</span>
                <span>🏃 ${r.exerciseMin} 分</span>
                <span>⚖️ ${wtxt}</span>
              </div>
              <div class="progress-wrap" style="margin-top:6px;">
                <div class="progress-label"><span>${escapeHtml(prog.label)}</span><span>${prog.pct}%</span></div>
                <div class="progress-bar"><div class="progress-fill" style="width:${prog.pct}%"></div></div>
              </div>
              <div class="chal-ranks">運動榜 #${r.rankEx} · 連續榜 #${r.rankSt} · 體重榜 #${r.rankW}</div>
            </div>`;
          }).join('')}
        </div>`;
      const btn = document.getElementById('btn-chal-edit-' + id);
      if (btn) btn.onclick = () => {
        ensureChallengeState();
        const t = prompt('目標類型：exercise_min / streak / weight_down', state.meta.challenge.weeklyGoalType);
        if (t == null) return;
        if (['exercise_min', 'streak', 'weight_down'].indexOf(t.trim()) < 0) {
          toast('類型無效', 'warn'); return;
        }
        const v = prompt('目標數值（分鐘／日數／kg）', String(state.meta.challenge.weeklyGoalValue));
        if (v == null || v === '' || !isFinite(+v)) { toast('數值無效', 'warn'); return; }
        state.meta.challenge.weeklyGoalType = t.trim();
        state.meta.challenge.weeklyGoalValue = +v;
        saveState();
        renderChallengeCard();
        toast('已更新挑戰目標', 'success');
      };
    });
  }

  // hooks
  const _renderToday_chal = renderToday;
  renderToday = function() {
    _renderToday_chal();
    try { renderChallengeCard(); } catch (e) { console.warn('chal', e); }
  };
  if (typeof renderCirclePage === 'function') {
    const _rcp = renderCirclePage;
    renderCirclePage = function() {
      _rcp();
      try { renderChallengeCard(); } catch (e) { console.warn(e); }
    };
  }

  const _ensureP0_chal = ensureP0State;
  ensureP0State = function() {
    _ensureP0_chal();
    if (!state.meta) state.meta = {};
    if (!state.meta.challenge) {
      state.meta.challenge = { weeklyGoalType: 'exercise_min', weeklyGoalValue: 150, title: '本週雙人挑戰' };
    }
  };

  /* ========== BloomBody 日記拆餐／語音／註冊／Admin／主題／i18n／寫實寵物／可愛互動 ========== */
  const FFL_DEMO_USERS = {
    Admin: { password: 'P@ssw0rdNyClPT', role: 'admin', email: 'admin@bloombody.local', goals: { kcal: 1800, protein: 110 }, badges: [] }
  };
  const FFL_BUILTIN_USERS = FFL_DEMO_USERS;
  const FFL_I18N = {
    'zh-Hant': {
      login: '登入', register: '註冊', logout: '登出', password: '密碼',
      demoTitle: '營運帳號', chat: '對話', today: '今日', settings: '設定',
      goChat: '去對話打卡', homeSummary: '今日摘要', theme: '主題外觀', lang: '介面語言',
      feed: '餵食', pat: '摸摸', dress: '換裝', stamp: '今日蓋章', bingo: '餐次 Bingo',
      mood: '心情貼紙', pose: '試穿姿勢', playTip: '可先稍作休息，不影響打卡',
      voiceLang: '語音語言', diarySplit: '已拆成多餐確認', confirmNext: '確認後下一筆'
    },
    'zh-Hans': {
      login: '登录', register: '注册', logout: '登出', password: '密码',
      demoTitle: '测试账号（朋友试玩）', chat: '对话', today: '今日', settings: '设置',
      goChat: '去对话打卡', homeSummary: '今日摘要', theme: '主题外观', lang: '界面语言',
      feed: '喂食', pat: '摸摸', dress: '换装', stamp: '今日盖章', bingo: '餐次 Bingo',
      mood: '心情贴纸', pose: '试穿姿势', playTip: '先玩一下～不挡打卡',
      voiceLang: '语音语言', diarySplit: '已拆成多餐确认', confirmNext: '确认后下一笔'
    },
    ja: {
      login: 'ログイン', register: '登録', logout: 'ログアウト', password: 'パスワード',
      demoTitle: 'テスト用アカウント', chat: 'チャット', today: '今日', settings: '設定',
      goChat: 'チャットで記録', homeSummary: '今日のまとめ', theme: 'テーマ', lang: '表示言語',
      feed: 'ごはん', pat: 'なでる', dress: 'きせかえ', stamp: '今日のスタンプ', bingo: '食事ビンゴ',
      mood: '気分シール', pose: '試着ポーズ', playTip: '軽く遊べます（記録の邪魔しません）',
      voiceLang: '音声言語', diarySplit: '複数の食事に分割', confirmNext: '確認後に次へ'
    }
  };
  const FFL_THEME_PRESETS = {
    roman: {
      id: 'roman', label: '羅馬古典',
      vars: { '--bg':'#f3efe6','--surface':'#faf7f0','--primary':'#6b5a3e','--primary-dark':'#4a3d28','--primary-soft':'#ebe3d4','--accent':'#8a7355','--text':'#2a2418','--muted':'#6e6454','--border':'#ddd2bf','--radius':'12px',
        '--font-ui':'"Palatino Linotype",Palatino,"Book Antiqua","Noto Serif TC","Songti TC",Georgia,serif' }
    },
    modern: {
      id: 'modern', label: '清爽現代',
      vars: { '--bg':'#f5f7fa','--surface':'#ffffff','--primary':'#3d7a6a','--primary-dark':'#2a5a4e','--primary-soft':'#e3f0ec','--accent':'#5b8fd9','--text':'#1e2930','--muted':'#64748b','--border':'#e2e8f0','--radius':'16px',
        '--font-ui':'-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang HK","Noto Sans TC",sans-serif' }
    }
  };

  let chatDiaryDraftQueue = [];
  let fflPlayState = { dressIdx: 0, poseIdx: 0, mood: '', lastPat: 0 };

  function t(key) {
    const loc = (state && state.meta && state.meta.locale) || 'zh-Hant';
    const pack = FFL_I18N[loc] || FFL_I18N['zh-Hant'];
    return pack[key] || (FFL_I18N['zh-Hant'][key] || key);
  }

  function ensureAuthAndMeta() {
    if (!state.meta) state.meta = {};
    if (!state.meta.locale) state.meta.locale = 'zh-Hant';
    if (state.meta.shareAnonymous == null) state.meta.shareAnonymous = true;
    if (!state.meta.theme) state.meta.theme = { preset: 'roman', custom: null };
    if (!state.meta.auth) state.meta.auth = { provider: 'local', supabaseReady: true, googleSoon: true };
    if (!state.meta.play) state.meta.play = { stamps: {}, bingo: {}, feedCount: 0, patCount: 0 };
    // migrate demo user Friend → Claudia (before seed so data is kept)
    if (state.users && state.users.Friend) {
      const fr = state.users.Friend;
      if (!state.users.Claudia) {
        state.users.Claudia = Object.assign({}, fr, {
          email: (fr.email && /friend@/i.test(fr.email)) ? 'claudia@bloombody.local' : (fr.email || 'claudia@bloombody.local'),
          password: (fr.password === 'friend123') ? 'claudia123' : fr.password
        });
      } else {
        // Claudia already exists: keep Claudia profile, still move Friend-owned rows
        if ((!state.users.Claudia.password || state.users.Claudia.password === 'claudia123') && fr.password && fr.password !== 'friend123') {
          state.users.Claudia.password = fr.password;
        }
      }
      delete state.users.Friend;
      (state.records || []).forEach(r => { if (r.ownerUser === 'Friend') r.ownerUser = 'Claudia'; });
      (state.chatMessages || []).forEach(m => { if (m.ownerUser === 'Friend') m.ownerUser = 'Claudia'; });
      try {
        if (sessionStorage.getItem(APP_KEY + '_session') === 'Friend') {
          sessionStorage.setItem(APP_KEY + '_session', 'Claudia');
        }
      } catch (_) {}
      try { saveState(); } catch (_) {}
    }
    // Built-in: Admin only. Real users come from registration storage.
    Object.keys(FFL_DEMO_USERS).forEach(u => {
      if (!state.users[u]) {
        state.users[u] = JSON.parse(JSON.stringify(FFL_DEMO_USERS[u]));
      } else if (u === 'Admin') {
        const d = FFL_DEMO_USERS.Admin;
        state.users.Admin = Object.assign({}, state.users.Admin, { password: d.password, role: 'admin', email: d.email || state.users.Admin.email });
      }
    });
    const _STOCK_PW = { Nydia:'nydia123', Claudia:'claudia123', Friend:'friend123', Amy:'amy123', Bella:'bella123' };


    // Always purge legacy fake "Friend" identity from filters/users
    if (state.users && state.users.Friend) {
      delete state.users.Friend;
      (state.records || []).forEach(r => { if (r && r.ownerUser === 'Friend') r.ownerUser = '_purged'; });
      (state.chatMessages || []).forEach(m => { if (m && m.ownerUser === 'Friend') m.ownerUser = '_purged'; });
    }    Object.keys(_STOCK_PW).forEach(u => {
      if (state.users[u] && state.users[u].password === _STOCK_PW[u]) delete state.users[u];
    });
    if (!state.meta.circle) state.meta.circle = { inviteCode: null, partners: [] };
    if (!Array.isArray(state.meta.circle.partners)) state.meta.circle.partners = [];
  }

  function applyTheme() {
    ensureAuthAndMeta();
    const th = state.meta.theme || { preset: 'roman' };
    const root = document.documentElement;
    const preset = th.preset || 'roman';
    root.setAttribute('data-theme', preset === 'custom' ? 'custom' : preset);
    const base = FFL_THEME_PRESETS[preset] || FFL_THEME_PRESETS.roman;
    const vars = Object.assign({}, base.vars, (preset === 'custom' && th.custom) ? th.custom : {});
    Object.keys(vars).forEach(k => root.style.setProperty(k, vars[k]));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', vars['--primary'] || '#6b5a3e');
  }

  function applyLocale() {
    ensureAuthAndMeta();
    document.documentElement.lang = state.meta.locale === 'ja' ? 'ja' : (state.meta.locale === 'zh-Hans' ? 'zh-CN' : 'zh-HK');
    // light touch: login buttons / nav / CTA if present
    const map = [
      ['#btn-login', 'login'], ['#btn-register', 'register'], ['#btn-logout', 'logout']
    ];
    map.forEach(([sel, key]) => {
      const el = document.querySelector(sel);
      if (el && !el.dataset.i18nSkip) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      if (k) el.textContent = t(k);
    });
  }

  // ---- Chinese clock / diary split ----
  function cnNumToInt(s) {
    const map = { '零':0,'〇':0,'一':1,'二':2,'兩':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };
    s = String(s || '').trim();
    if (/^\d+$/.test(s)) return +s;
    if (s === '十') return 10;
    if (s.startsWith('十')) return 10 + (map[s.slice(1)] || 0);
    if (s.endsWith('十')) return (map[s[0]] || 0) * 10;
    const m = s.match(/^([零〇一二兩三两四五六七八九])?十([一二三四五六七八九])?$/);
    if (m) return (m[1] ? map[m[1]] : 1) * 10 + (m[2] ? map[m[2]] : 0);
    if (s.length === 1 && map[s] != null) return map[s];
    return null;
  }
  function parseClockPhrase(chunk) {
    // 早上十點半 / 中午12點半 / 下午三點半 / 晚上九点 / 10:30
    let period = '';
    if (/凌晨|清晨|早上|早晨|上午/.test(chunk)) period = 'am';
    else if (/中午|正午/.test(chunk)) period = 'noon';
    else if (/下午|午後|傍晚/.test(chunk)) period = 'pm';
    else if (/晚上|夜晚|夜里|夜裡/.test(chunk)) period = 'night';
    let hh = null, mm = 0;
    const colon = chunk.match(/(\d{1,2})\s*[:：点點时時]\s*(\d{1,2})/);
    if (colon) { hh = +colon[1]; mm = +colon[2]; }
    else {
      const half = chunk.match(/([零〇一二兩三两四五六七八九十\d]{1,3})\s*[点點时時]\s*半/);
      const plain = chunk.match(/([零〇一二兩三两四五六七八九十\d]{1,3})\s*[点點时時]/);
      if (half) { hh = cnNumToInt(half[1]); mm = 30; }
      else if (plain) { hh = cnNumToInt(plain[1]); mm = 0; }
    }
    if (hh == null) return null;
    if (period === 'pm' && hh < 12) hh += 12;
    if (period === 'night' && hh < 12) hh += 12;
    if (period === 'noon' && hh < 11) hh = 12;
    if (period === 'am' && hh === 12) hh = 0;
    return { hh, mm, label: String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0') };
  }
  function mealFromClock(hh) {
    if (hh < 11) return '第一餐';
    if (hh < 15) return '第二餐';
    if (hh < 21) return '第三餐';
    return '加餐';
  }
  function extractDiaryDate(text) {
    const m = String(text).match(/(?:記錄|记录|日期)?[，,\s]*(\d{4})[./\-年](\d{1,2})[./\-月](\d{1,2})/);
    if (!m) return null;
    return m[1] + String(m[2]).padStart(2,'0') + String(m[3]).padStart(2,'0');
  }
  function isDiaryLog(text) {
    const t0 = String(text || '');
    if (!t0) return false;
    const clocks = (t0.match(/(早上|早晨|上午|中午|下午|晚上|凌晨)?\s*[零〇一二兩三两四五六七八九十\d]{1,3}\s*[点點时時]/g) || []).length;
    const eats = (t0.match(/吃了|食咗|吃了|飲咗|喝了/g) || []).length;
    return clocks >= 2 || (clocks >= 1 && eats >= 2) || (/記錄|记录/.test(t0) && eats >= 2);
  }
  function splitDiaryMeals(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim();
    const dateKey = extractDiaryDate(text) || (typeof todayKey === 'function' ? todayKey() : null);
    // split on time anchors
    const re = /((?:凌晨|清晨|早上|早晨|上午|中午|正午|下午|午後|傍晚|晚上|夜晚)?\s*[零〇一二兩三两四五六七八九十\d]{1,3}\s*[点點时時]\s*(?:半|\d{1,2})?)/g;
    const idxs = [];
    let m;
    while ((m = re.exec(text))) idxs.push({ i: m.index, phrase: m[1] });
    if (!idxs.length) return [];
    const segs = [];
    for (let i = 0; i < idxs.length; i++) {
      const start = idxs[i].i;
      const end = i + 1 < idxs.length ? idxs[i + 1].i : text.length;
      const chunk = text.slice(start, end).trim();
      const clock = parseClockPhrase(idxs[i].phrase + chunk.slice(0, 24));
      if (!clock) continue;
      let foodPart = chunk
        .replace(idxs[i].phrase, '')
        .replace(/^(吃了|食咗|吃了|飲咗|喝了)/, '')
        .replace(/[，,]{2,}.*/g, (x) => x) // keep until next heavy commas used as separators elsewhere
        .replace(/記錄[，,].*$/,'')
        .replace(/记录[，,].*$/,'')
        .replace(/[，,]{2,}/g, '，')
        .replace(/^[，,\s]+|[，,\s]+$/g, '')
        .trim();
      // stop at trailing 记录
      foodPart = foodPart.split(/記錄|记录/)[0].trim().replace(/[，,]+$/,'');
      if (!foodPart) continue;
      const foods = foodPart.split(/[，,、]+/).map(s => s.trim()).filter(Boolean);
      segs.push({
        clock, dateKey,
        meal: mealFromClock(clock.hh),
        foodText: foods.join('、'),
        foods,
        rawSeg: chunk
      });
    }
    return segs;
  }
  function extractScaleGrams(fileMeta, caption) {
    const hay = [caption || '', (fileMeta && fileMeta.name) || '', (fileMeta && fileMeta.caption) || ''].join(' ');
    // prefer xxx.xg or xxx g
    let m = hay.match(/(\d{1,4}(?:\.\d+)?)\s*(?:g|克|公克)\b/i);
    if (m) return +m[1];
    m = hay.match(/\b(\d{2,4}(?:\.\d+)?)\b/);
    if (m) {
      const n = +m[1];
      // kitchen scale typical food weight
      if (n >= 5 && n <= 2000) return n;
    }
    return null;
  }
  function guessFoodKcalLite(name) {
    const n = String(name || '');
    const table = [
      [/饅頭|馒头|mantou/i, 250, 8, 52, 1.5],
      [/番茄.*麵包|番茄.*面包|芝士麵包|芝士面包/i, 180, 6, 22, 7],
      [/雞蛋|鸡蛋|蛋一/i, 78, 6.5, 0.6, 5.3],
      [/瑞士卷|瑞士捲|swiss/i, 220, 4, 28, 10],
      [/雞胸|鸡胸/i, 142, 26, 0, 3],
      [/蛋白粉|whey|isolate/i, 120, 24, 3, 1],
      [/豆腐|百福/i, 120, 12, 3, 7],
      [/米飯|米饭|白飯/i, 200, 4, 44, 0.5]
    ];
    for (const [re, kcal, p, c, f] of table) {
      if (re.test(n)) return { kcal, protein: p, carb: c, fat: f };
    }
    return { kcal: 200, protein: 8, carb: 25, fat: 8 };
  }
  function buildDiaryDrafts(raw, attachments) {
    const segs = splitDiaryMeals(raw);
    const grams = extractScaleGrams((attachments && attachments[0]) || (chatPendingImages && chatPendingImages[0]), raw);
    return segs.map((seg, idx) => {
      const macros = guessFoodKcalLite(seg.foodText);
      let portion = '';
      let food = seg.foodText;
      if (idx === 0 && grams != null) {
        portion = grams + 'g（秤重 Stub）';
        // scale first food kcal roughly if mantou-like
        if (/饅頭|馒头/.test(food) && grams > 0) {
          const factor = grams / 100;
          macros.kcal = Math.round(macros.kcal * factor);
          macros.protein = Math.round(macros.protein * factor * 10) / 10;
          macros.carb = Math.round(macros.carb * factor * 10) / 10;
          macros.fat = Math.round(macros.fat * factor * 10) / 10;
        }
      }
      const ts = seg.dateKey
        ? (seg.dateKey + ' ' + seg.clock.label + ':00')
        : null;
      return {
        recordType: 'diet',
        subtype: 'diary_split',
        stub: 'diary',
        conf: 0.82,
        summary: `${seg.meal} · ${seg.clock.label} · ${food}` + (macros.kcal ? ` · 約 ${macros.kcal} kcal` : ''),
        reason: '長文日記拆餐' + (grams != null && idx === 0 ? ' · 秤重克數 Stub' : ''),
        data: {
          meal: seg.meal,
          food,
          brand: '',
          portion: portion || '1份（估算）',
          grams: idx === 0 ? grams : null,
          mealTime: seg.clock.label,
          kcal: macros.kcal, protein: macros.protein, carb: macros.carb, fat: macros.fat, sugar: null,
          aiSuggest: { provider: 'diary_split', status: 'pending_confirm', gramsStub: grams }
        },
        attachments: idx === 0 ? (attachments || []) : [],
        rawText: seg.rawSeg,
        _forceTimestamp: ts,
        _diaryQueueTotal: segs.length,
        _diaryQueueIndex: idx + 1
      };
    });
  }

  function startDiaryDraftQueue(drafts) {
    chatDiaryDraftQueue = drafts.slice();
    const first = chatDiaryDraftQueue.shift();
    if (!first) return;
    appendChatMessage({
      messageId: msgUid(), ownerUser: currentUser, role: 'bot',
      createdAt: nowTs(),
      text: `${t('diarySplit')}：${drafts.length} 筆（${t('confirmNext')}）。` +
        (first.data && first.data.grams != null ? ` 秤重約 ${first.data.grams}g。` : ''),
      card: null
    });
    renderChatThread();
    renderDraftConfirmCard(first);
  }

  // wrap commitDraftFromCard for queue + forced timestamp
  if (typeof commitDraftFromCard === 'function') {
    const _commitDraftFromCard = commitDraftFromCard;
    commitDraftFromCard = async function() {
      const forced = chatPendingDraft && chatPendingDraft._forceTimestamp;
      const queueLeft = chatDiaryDraftQueue.length;
      // patch read grams into data via fields if present
      await _commitDraftFromCard();
      if (forced) {
        // last record just pushed
        const last = state.records[state.records.length - 1];
        if (last && last.source && last.source.channel === 'chat') {
          last.timestamp = forced;
          last.updatedAt = nowTs();
          saveState();
        }
      }
      if (queueLeft > 0) {
        const next = chatDiaryDraftQueue.shift();
        appendChatMessage({
          messageId: msgUid(), ownerUser: currentUser, role: 'bot',
          createdAt: nowTs(),
          text: `下一筆確認（${next._diaryQueueIndex}/${next._diaryQueueTotal}）：${next.summary}`,
          card: null
        });
        renderChatThread();
        renderDraftConfirmCard(next);
      }
    };
  }

  // wrap handleChatSend — diary first (before food_quick)
  const _handleChatSend_diary = handleChatSend;
  handleChatSend = async function(text) {
    const raw = String(text || '').trim();
    if (raw && isDiaryLog(raw)) {
      // user bubble
      appendChatMessage({
        messageId: msgUid(), ownerUser: currentUser, role: 'user',
        createdAt: nowTs(), text: raw, card: null, imageId: null
      });
      renderChatThread();
      let attachments = [];
      if (chatPendingImages && chatPendingImages.length) {
        attachments = await persistPendingImagesAsAttachments();
      }
      const drafts = buildDiaryDrafts(raw, attachments);
      if (drafts.length >= 2) {
        startDiaryDraftQueue(drafts);
        const input = $('#chat-input');
        if (input) input.value = '';
        return;
      }
      if (drafts.length === 1) {
        renderDraftConfirmCard(drafts[0]);
        return;
      }
      // fallthrough if parse failed
    }
    // text + images: also try diary
    if (raw && chatPendingImages && chatPendingImages.length && isDiaryLog(raw)) {
      return handleChatSend(raw); // will hit above after images? already handled
    }
    return _handleChatSend_diary(text);
  };

  // enhance buildStubDietDraft with scale grams from pending filenames
  if (typeof buildStubDietDraft === 'function') {
    const _bsd = buildStubDietDraft;
    buildStubDietDraft = function(attachments, caption) {
      const d = _bsd(attachments, caption);
      const g = extractScaleGrams((attachments && attachments[0]) || null, caption);
      if (g != null) {
        d.data.grams = g;
        d.data.portion = g + 'g（秤重 Stub）';
        d.reason = (d.reason || '') + ' · 秤重';
        d.summary = (d.summary || '') + ` · ${g}g`;
      }
      return d;
    };
  }

  // ---- Voice lang UI ----
  function ensureVoiceLangUI() {
    const composer = document.querySelector('.chat-composer');
    if (!composer || document.getElementById('stt-lang')) return;
    const wrap = document.createElement('div');
    wrap.className = 'stt-lang-wrap';
    wrap.title = t('voiceLang');
    wrap.innerHTML = `<select id="stt-lang" aria-label="STT language">
      <option value="zh-CN">普通話</option>
      <option value="yue-HK">粵語</option>
      <option value="en-US">English</option>
    </select>`;
    const voiceBtn = document.getElementById('chat-btn-voice');
    if (voiceBtn) composer.insertBefore(wrap, voiceBtn);
    else composer.insertBefore(wrap, composer.firstChild);
    const sel = document.getElementById('stt-lang');
    const saved = localStorage.getItem('ffl_stt_lang') || 'yue-HK';
    sel.value = saved;
    window.__ffl_stt_lang = saved;
    sel.onchange = () => {
      window.__ffl_stt_lang = sel.value;
      localStorage.setItem('ffl_stt_lang', sel.value);
      toast('語音：' + sel.options[sel.selectedIndex].text, 'success');
    };
  }

  // ---- Login / Register / Admin demo ----
  function refreshLoginUserSelect() {
    const sel = document.getElementById('login-user');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = Object.keys(state.users).map(u =>
      `<option value="${escapeHtml(u)}">${escapeHtml(u)}${state.users[u].role==='admin'?' · Admin':''}</option>`
    ).join('');
    if (state.users[cur]) sel.value = cur;
    else if (state.users.Admin) sel.value = 'Admin';
    else {
      const keys = Object.keys(state.users||{});
      if (keys.length) sel.value = keys[0];
    }
  }
  function enhanceLoginScreen() {
    ensureAuthAndMeta();
    const card = document.querySelector('#login-screen .login-card');
    if (!card) return;
    if (!document.getElementById('login-tabs')) {
      const tabs = document.createElement('div');
      tabs.className = 'login-tabs';
      tabs.id = 'login-tabs';
      tabs.innerHTML = `<button type="button" class="active" data-login-tab="login" data-i18n="login">${t('login')}</button>
        <button type="button" data-login-tab="register" data-i18n="register">${t('register')}</button>`;
      const logo = card.querySelector('.login-logo');
      if (logo && logo.nextSibling) card.insertBefore(tabs, logo.nextSibling);
      else card.insertBefore(tabs, card.firstChild);
      tabs.onclick = (e) => {
        const b = e.target.closest('[data-login-tab]');
        if (!b) return;
        tabs.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        const mode = b.getAttribute('data-login-tab');
        const reg = document.getElementById('login-register-panel');
        const log = document.getElementById('login-main-panel');
        if (reg) reg.hidden = mode !== 'register';
        if (log) log.hidden = mode !== 'login';
      };
    }
    // wrap existing fields
    if (!document.getElementById('login-main-panel')) {
      const panel = document.createElement('div');
      panel.id = 'login-main-panel';
      const move = [];
      [...card.children].forEach(ch => {
        if (ch.id === 'login-tabs' || ch.classList.contains('login-logo') || ch.classList.contains('demo-creds') || ch.classList.contains('login-oauth-stub')) return;
        if (ch.id === 'login-register-panel') return;
        move.push(ch);
      });
      move.forEach(ch => panel.appendChild(ch));
      card.appendChild(panel);
    }
    if (!document.getElementById('login-register-panel')) {
      const reg = document.createElement('div');
      reg.id = 'login-register-panel';
      reg.hidden = true;
      reg.innerHTML = `
        <div class="form-group"><label>用戶名</label><input id="reg-user" autocomplete="username" placeholder="你的顯示名"></div>
        <div class="form-group"><label>Email（可選）</label><input id="reg-email" type="email" placeholder="you@email.com"></div>
        <div class="form-group"><label data-i18n="password">${t('password')}</label><input id="reg-pass" type="password" autocomplete="new-password"></div>
        <div class="form-group"><label>確認密碼</label><input id="reg-pass2" type="password" autocomplete="new-password"></div>
        <div class="form-group"><label>性別</label>
          <select id="reg-gender" required>
            <option value="">請選擇</option>
            <option value="female">女</option>
            <option value="male">男</option>
            <option value="other">其他</option>
            <option value="prefer_not">不願透露</option>
          </select>
          <p class="hint" style="margin:4px 0 0;font-size:.72rem;">選擇「女」後才會啟用經期記錄功能。</p>
        </div>
        <button class="btn btn-primary" id="btn-register" type="button" data-i18n="register">${t('register')}</button>
        <p class="hint" style="text-align:center;margin-top:8px;">本機帳號 · 日後可接 BloomBody Supabase Auth</p>`;
      card.appendChild(reg);
      document.getElementById('btn-register').onclick = () => doLocalRegister();
    }
    if (!document.querySelector('.demo-creds')) {
      const demo = document.createElement('div');
      demo.className = 'demo-creds';
      demo.className = 'demo-creds ops-creds';
      demo.innerHTML = `<strong>營運</strong><br>
        內建 <code>Admin</code>（密碼見內部文件；可清空／匯出全部）<br>
        一般用戶請點「註冊」建立帳號；圈子預設空白，以邀請碼加入。`;
      card.appendChild(demo);
    }
    if (!document.querySelector('.login-oauth-stub')) {
      const stub = document.createElement('div');
      stub.className = 'login-oauth-stub';
      stub.innerHTML = `Google／Gmail 登入 <span class="soon">即將支援</span><br>預留 BloomBody Supabase Auth · 目前使用本機帳密`;
      card.appendChild(stub);
    }
    // also allow typing username: add text input optional
    const userSel = document.getElementById('login-user');
    if (userSel && !document.getElementById('login-user-text')) {
      const fg = document.createElement('div');
      fg.className = 'form-group';
      fg.innerHTML = `<label>或輸入用戶名／Email</label><input id="login-user-text" autocomplete="username" placeholder="顯示名或 email">`;
      userSel.parentElement.insertAdjacentElement('afterend', fg);
    }
    refreshLoginUserSelect();
  }
  function doLocalRegister() {
    ensureAuthAndMeta();
    const name = (document.getElementById('reg-user').value || '').trim();
    const email = (document.getElementById('reg-email') && document.getElementById('reg-email').value || '').trim();
    const pass = document.getElementById('reg-pass').value || '';
    const pass2 = document.getElementById('reg-pass2').value || '';
    const genderEl = document.getElementById('reg-gender') || document.getElementById('shell-reg-gender');
    const gender = genderEl ? (genderEl.value || '') : '';
    if (!/^[A-Za-z0-9_\u4e00-\u9fff]{2,20}$/.test(name)) { toast('用戶名 2–20 字', 'warn'); return; }
    if (/^admin$/i.test(name)) { toast('Admin 為營運帳號，請另選顯示名', 'warn'); return; }
    if (state.users[name]) { toast('用戶已存在', 'warn'); return; }
    if (pass.length < 6) { toast('密碼至少 6 字', 'warn'); return; }
    if (pass !== pass2) { toast('兩次密碼不一致', 'warn'); return; }
    if (!gender) { toast('請選擇性別', 'warn'); return; }
    if (email && Object.values(state.users).some(u => u.email && u.email.toLowerCase() === email.toLowerCase())) {
      toast('Email 已被使用', 'warn'); return;
    }
    const sexMap = { female: 'F', male: 'M', other: 'X', prefer_not: null };
    const goalEl = document.getElementById('reg-goal') || document.getElementById('shell-reg-goal');
    const goalId = goalEl ? (goalEl.value || 'preserve_cut') : 'preserve_cut';
    const goalDefs = applyGoalPresetDefaults(goalId, { kcal: 1600, protein: 100 });
    state.users[name] = {
      password: pass, role: 'user', email: email || '',
      gender: gender,
      goalId: goalDefs.goalId,
      goals: { kcal: goalDefs.kcal, protein: goalDefs.protein, goalText: goalDefs.goalText }, badges: [],
      authProvider: 'local', createdAt: nowTs()
    };
    if (!state.meta) state.meta = {};
    if (!state.meta.profile) state.meta.profile = {};
    // profile.sex used by analytics; gender on user record for period gating
    if (currentUser === name || !state.meta.profile.sex) {
      state.meta.profile.sex = sexMap[gender];
      state.meta.profile.gender = gender;
    }
    state.meta.profile.goalId = goalDefs.goalId;
    state.meta.profile.goalText = goalDefs.goalText;
    saveState();
    refreshLoginUserSelect();
    const sel = document.getElementById('login-user');
    if (sel) sel.value = name;
    document.getElementById('login-pass').value = pass;
    toast('註冊成功，可登入', 'success');
    document.querySelector('[data-login-tab="login"]')?.click();
    try { applyPeriodVisibility(); } catch (_) {}
  }

  /* ========== 性別／經期顯示（僅「女」顯示經期） ========== */
  function getUserGender(uname) {
    uname = uname || currentUser;
    const u = state.users && state.users[uname];
    if (u && u.gender) return u.gender;
    const p = (state.meta && state.meta.profile) || {};
    if (p.gender) return p.gender;
    if (p.sex === 'F') return 'female';
    if (p.sex === 'M') return 'male';
    if (p.sex === 'X') return 'other';
    return null;
  }
  function isPeriodEnabledFor(uname) {
    return getUserGender(uname) === 'female';
  }
  function applyPeriodVisibility() {
    const show = isPeriodEnabledFor(currentUser);
    document.querySelectorAll(
      '[data-form="period"], #form-period, #period-report, .period-home-chip, #ffl-period-panel, .period-card, #btn-log-period-start'
    ).forEach(el => {
      if (!el) return;
      if (el.matches('[data-form="period"]')) {
        el.style.display = show ? '' : 'none';
        if (!show && el.classList.contains('active')) {
          const alt = document.querySelector('.sub-tab[data-form="body"], .sub-tab[data-form="diet"]');
          if (alt) alt.click();
        }
      } else {
        el.style.display = show ? '' : 'none';
        if (el.id === 'form-period' && !show) el.classList.remove('active');
      }
    });
    document.querySelectorAll('#hist-filter option[value="period"]').forEach(o => {
      o.disabled = !show;
      o.hidden = !show;
    });
  }
  try {
    if (typeof showAppAfterLogin === 'function') {
      const _sal = showAppAfterLogin;
      showAppAfterLogin = function () {
        const r = _sal.apply(this, arguments);
        try { applyPeriodVisibility(); } catch (_) {}
        return r;
      };
    }
  } catch (_) {}
  document.addEventListener('ffl:user-ready', () => { try { applyPeriodVisibility(); } catch (_) {} });
  setTimeout(() => { try { applyPeriodVisibility(); } catch (_) {} }, 800);


  // enhance doLogin to accept text username/email
  if (typeof doLogin === 'function') {
    const _doLogin = doLogin;
    doLogin = function() {
      ensureAuthAndMeta();
      const typed = (document.getElementById('login-user-text')?.value || '').trim();
      if (typed) {
        let user = typed;
        if (typed.includes('@')) {
          const hit = Object.keys(state.users).find(u => (state.users[u].email || '').toLowerCase() === typed.toLowerCase());
          if (hit) user = hit;
        }
        const sel = document.getElementById('login-user');
        if (state.users[user] && sel) sel.value = user;
        else if (!state.users[user]) { toast('用戶不存在', 'warn'); return; }
      }
      _doLogin();
      try { renderHomeSummaryCta(); renderPlayPanel(); applyLocale(); } catch (_) {}
    };
  }

  function isAdmin() {
    return currentUser && state.users[currentUser] && state.users[currentUser].role === 'admin';
  }

  // ---- Settings: theme, locale, google stub, admin note ----
  function ensureSettingsExtras() {
    const page = document.getElementById('page-settings');
    if (!page || document.getElementById('ffl-theme-card')) return;
    const card = document.createElement('div');
    card.className = 'card settings-section';
    card.id = 'ffl-theme-card';
    card.innerHTML = `
      <h3 data-i18n="theme">${t('theme')}</h3>
      <div class="theme-swatches" id="theme-swatches">
        <button type="button" class="theme-swatch" data-theme-preset="roman" title="羅馬古典" style="background:linear-gradient(135deg,#f3efe6,#6b5a3e)"></button>
        <button type="button" class="theme-swatch" data-theme-preset="modern" title="清爽現代" style="background:linear-gradient(135deg,#f5f7fa,#3d7a6a)"></button>
        <button type="button" class="theme-swatch" data-theme-preset="custom" title="自訂" style="background:conic-gradient(red,yellow,lime,blue,red)"></button>
      </div>
      <div class="theme-custom-grid" id="theme-custom-grid">
        <div class="form-group"><label>主色</label><input type="color" id="theme-c-primary" value="#6b5a3e"></div>
        <div class="form-group"><label>背景</label><input type="color" id="theme-c-bg" value="#f3efe6"></div>
        <div class="form-group"><label>文字</label><input type="color" id="theme-c-text" value="#2a2418"></div>
        <div class="form-group"><label>字體</label>
          <select id="theme-font">
            <option value="serif">古典襯線</option>
            <option value="sans">現代無襯線</option>
            <option value="rounded">圓體感</option>
          </select>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" type="button" id="btn-save-theme">套用主題</button>
      <h3 style="margin-top:16px" data-i18n="lang">${t('lang')}</h3>
      <div class="lang-switcher" id="lang-switcher">
        <button type="button" data-locale="zh-Hant">繁體</button>
        <button type="button" data-locale="zh-Hans">简体</button>
        <button type="button" data-locale="ja">日本語</button>
      </div>
      <div class="auth-cloud-stub" style="margin-top:14px">
        <strong>帳號登入</strong> · Google／Gmail <span class="soon">即將支援</span><br>
        本機帳密可用；BloomBody Supabase Auth 已預留（不破壞離線使用）。
        <div id="admin-auth-note" style="margin-top:6px"></div>
      </div>`;
    const passCard = [...page.querySelectorAll('.settings-section')].find(x => /修改密碼/.test(x.textContent || ''));
    if (passCard) page.insertBefore(card, passCard);
    else page.insertBefore(card, page.firstChild);

    const syncThemeUI = () => {
      ensureAuthAndMeta();
      const p = state.meta.theme.preset || 'roman';
      card.querySelectorAll('[data-theme-preset]').forEach(b => b.classList.toggle('active', b.getAttribute('data-theme-preset') === p));
      card.querySelectorAll('[data-locale]').forEach(b => b.classList.toggle('active', b.getAttribute('data-locale') === state.meta.locale));
      const note = document.getElementById('admin-auth-note');
      if (note) note.innerHTML = isAdmin()
        ? '您是 <strong>Admin</strong>：可用下方「匯出全部／清除全部」。'
        : '內建 Admin 供營運（密碼見內部文件）；一般用戶請註冊。';
    };
    syncThemeUI();
    card.querySelector('#theme-swatches').onclick = (e) => {
      const b = e.target.closest('[data-theme-preset]');
      if (!b) return;
      state.meta.theme.preset = b.getAttribute('data-theme-preset');
      saveState(); applyTheme(); syncThemeUI(); toast('已切主題', 'success');
    };
    card.querySelector('#btn-save-theme').onclick = () => {
      const fontMap = {
        serif: '"Palatino Linotype",Palatino,"Noto Serif TC",Georgia,serif',
        sans: '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang HK",sans-serif',
        rounded: '"Nunito","PingFang HK","Noto Sans TC",sans-serif'
      };
      state.meta.theme.preset = 'custom';
      state.meta.theme.custom = {
        '--primary': document.getElementById('theme-c-primary').value,
        '--primary-dark': document.getElementById('theme-c-primary').value,
        '--bg': document.getElementById('theme-c-bg').value,
        '--text': document.getElementById('theme-c-text').value,
        '--font-ui': fontMap[document.getElementById('theme-font').value] || fontMap.serif,
        '--primary-soft': '#ebe3d4',
        '--surface': '#fffcf7',
        '--muted': '#6e6454',
        '--border': '#ddd2bf',
        '--accent': '#8a7355',
        '--radius': '12px'
      };
      saveState(); applyTheme(); syncThemeUI(); toast('已套用自訂主題', 'success');
    };
    card.querySelector('#lang-switcher').onclick = (e) => {
      const b = e.target.closest('[data-locale]');
      if (!b) return;
      state.meta.locale = b.getAttribute('data-locale');
      saveState(); applyLocale(); syncThemeUI();
      try { renderHomeSummaryCta(); renderPlayPanel(); } catch(_){}
      toast(t('lang') + ': ' + state.meta.locale, 'success');
    };
  }

  // ---- Realistic pet / try-on（寫實照片風資產，非扁平卡通） ----
  function bbPetAsset(kind) {
    const base = (typeof window !== 'undefined' && window.BB_ASSET_BASE) ? window.BB_ASSET_BASE : 'assets/pet/';
    const map = {
      owner: base + 'owner_realistic.jpg',
      tryon: base + 'tryon_realistic.jpg',
      seal: base + 'seal_realistic.jpg',
      hamster: base + 'hamster_realistic.jpg',
      hamster_gold: base + 'hamster_realistic.jpg',
      hamster_panda: base + 'hamster_realistic.jpg'
    };
    return map[kind] || map.seal;
  }
  function realisticFigHtml(src, caption, extraClass, level) {
    const lv = level != null ? ` data-level="${level}"` : '';
    return `<div class="realistic-fig ${extraClass || ''}"${lv} data-caption="${caption}" style="background-image:url('${src}')" role="img" aria-label="${caption}"></div>`;
  }
  function realisticOwnerSvg(shape) {
    return realisticFigHtml(bbPetAsset('owner'), '主人', 'owner-fig', shape);
  }
  function realisticTryOnSvg(shape) {
    return realisticFigHtml(bbPetAsset('tryon'), '試穿', 'tryon-fig', shape);
  }
  function realisticHamsterSvg(species, level) {
    const sp = String(species || 'seal');
    const src = bbPetAsset(sp.indexOf('hamster') === 0 ? 'hamster' : (sp === 'seal' ? 'seal' : 'seal'));
    const label = sp.indexOf('hamster') === 0 ? '寵物' : '小海豹';
    return realisticFigHtml(src, label, 'pet-fig hamster-svg', level);
  }
  if (typeof hamsterSvg === 'function') {
    hamsterSvg = function(species, level) { return realisticHamsterSvg(species, level); };
  }
  if (typeof tryOnSvg === 'function') {
    tryOnSvg = function(shape) { return realisticTryOnSvg(shape); };
  }
  if (typeof ownerAvatarSvg === 'function') {
    ownerAvatarSvg = function(styleId, shape) {
      return realisticOwnerSvg(shape || 3);
    };
  }
  if (typeof renderPetDuoHtml === 'function') {
    const _rpd = renderPetDuoHtml;
    renderPetDuoHtml = function(opts) {
      let html = _rpd(opts);
      html = html.replace('class="pet-duo-stage"', 'class="pet-duo-stage realistic"');
      html = html.replace(/離線 SVG/g, '寫實照片風');
      html = html.replace(/寫實插畫風 SVG/g, '寫實照片風');
      html = html.replace(/（離線 SVG）/g, '（寫實照片風）');
      html += `<div class="home-summary-cta" id="pet-play-bar" style="margin-top:8px">
        <button type="button" class="btn btn-secondary btn-sm" data-play="feed" data-i18n="feed">${t('feed')}</button>
        <button type="button" class="btn btn-secondary btn-sm" data-play="pat" data-i18n="pat">${t('pat')}</button>
        <button type="button" class="btn btn-secondary btn-sm" data-play="dress" data-i18n="dress">${t('dress')}</button>
        <button type="button" class="btn btn-secondary btn-sm" data-play="pose" data-i18n="pose">${t('pose')}</button>
      </div>
      <p class="hint" data-i18n="playTip">${t('playTip')}</p>`;
      return html;
    };
  }

  // ---- Cute play interactions ----
  const DRESS_COLORS = ['#c4a574', '#e8919a', '#7BA3C9', '#5B8C7A', '#b07a4a'];
  const POSES = ['站立', '側身', '舉手', '走路'];
  const MOODS = ['😊', '💪', '😴', '🥗', '✨', '🔥'];
  function encouragePopup(msg) {
    toast(msg, 'success');
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;top:28%;transform:translate(-50%,-50%);z-index:2000;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:14px 18px;box-shadow:var(--shadow);font-weight:700;color:var(--primary-dark);pointer-events:none;';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
  function bindPlayActions(root) {
    const bar = (root || document).querySelector('#pet-play-bar');
    if (!bar || bar.dataset.bound) return;
    bar.dataset.bound = '1';
    bar.onclick = (e) => {
      const b = e.target.closest('[data-play]');
      if (!b) return;
      ensureAuthAndMeta();
      const act = b.getAttribute('data-play');
      if (act === 'feed') {
        state.meta.play.feedCount = (state.meta.play.feedCount || 0) + 1;
        saveState();
        encouragePopup('咀咀咀～寵物開心 +1');
      } else if (act === 'pat') {
        state.meta.play.patCount = (state.meta.play.patCount || 0) + 1;
        saveState();
        encouragePopup('摸頭殺！💕');
      } else if (act === 'dress') {
        fflPlayState.dressIdx = (fflPlayState.dressIdx + 1) % DRESS_COLORS.length;
        document.querySelectorAll('.tryon-svg [fill=\"url(#dr)\"], .tryon-svg path').forEach((n, i) => {
          if (i < 3) try { n.setAttribute('fill', DRESS_COLORS[fflPlayState.dressIdx]); } catch(_){}
        });
        encouragePopup('換裝！' + DRESS_COLORS[fflPlayState.dressIdx]);
      } else if (act === 'pose') {
        fflPlayState.poseIdx = (fflPlayState.poseIdx + 1) % POSES.length;
        encouragePopup('姿勢：' + POSES[fflPlayState.poseIdx]);
      }
    };
  }

  function renderPlayPanel() {
    ensureAuthAndMeta();
    const today = typeof todayKey === 'function' ? todayKey() : '';
    let host = document.getElementById('ffl-play-panel');
    if (!host) {
      const page = document.getElementById('page-today');
      if (!page) return;
      const card = document.createElement('div');
      card.className = 'card';
      card.id = 'ffl-play-panel-card';
      card.innerHTML = `<div class="card-title">可愛互動</div><div id="ffl-play-panel"></div>`;
      const summary = document.getElementById('home-summary-card');
      if (summary && summary.nextSibling) page.insertBefore(card, summary.nextSibling);
      else page.appendChild(card);
      host = document.getElementById('ffl-play-panel');
    }
    const stamped = !!(state.meta.play.stamps && state.meta.play.stamps[today]);
    const bingo = state.meta.play.bingo[today] || { m1:false, m2:false, m3:false, snack:false };
    // auto bingo from records
    const mine = (typeof myRecords === 'function' ? myRecords() : []).filter(r => (r.timestamp || '').slice(0,8) === today && r.recordType === 'diet');
    mine.forEach(r => {
      const meal = r.data && r.data.meal;
      if (meal === '第一餐') bingo.m1 = true;
      if (meal === '第二餐') bingo.m2 = true;
      if (meal === '第三餐') bingo.m3 = true;
      if (meal === '加餐') bingo.snack = true;
    });
    state.meta.play.bingo[today] = bingo;
    const streakEl = document.getElementById('streak-days');
    const streakN = streakEl ? parseInt((streakEl.textContent || '').replace(/\D/g, ''), 10) || 0 : 0;
    host.innerHTML = `
      <p class="hint" data-i18n="playTip">${t('playTip')}</p>
      <div class="home-summary-cta">
        <button type="button" class="btn ${stamped?'btn-ghost':'btn-secondary'} btn-sm" id="btn-daily-stamp" data-i18n="stamp">${t('stamp')}${stamped?' ✓':''}</button>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-mood-sticker" data-i18n="mood">${t('mood')}</button>
      </div>
      <div style="margin-top:8px;font-size:.8rem;">${t('bingo')}: 
        <span>${bingo.m1?'🟩':'⬜'}1</span>
        <span>${bingo.m2?'🟩':'⬜'}2</span>
        <span>${bingo.m3?'🟩':'⬜'}3</span>
        <span>${bingo.snack?'🟩':'⬜'}+</span>
      </div>
      <div style="margin-top:6px;font-size:.75rem;color:var(--muted)">餵食 ${state.meta.play.feedCount||0} · 摸摸 ${state.meta.play.patCount||0}${streakN>=3?' · 🔥 連續慶祝中':''}</div>
      <div id="mood-tray" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;"></div>`;
    document.getElementById('btn-daily-stamp').onclick = () => {
      state.meta.play.stamps[today] = true;
      saveState();
      encouragePopup('今日蓋章完成！');
      if (streakN >= 3) encouragePopup('連續 ' + streakN + ' 日！好叻！');
      renderPlayPanel();
    };
    document.getElementById('btn-mood-sticker').onclick = () => {
      const tray = document.getElementById('mood-tray');
      tray.innerHTML = MOODS.map(m => `<button type="button" class="btn btn-ghost btn-sm" data-mood="${m}" style="font-size:1.2rem">${m}</button>`).join('');
      tray.onclick = (e) => {
        const b = e.target.closest('[data-mood]');
        if (!b) return;
        fflPlayState.mood = b.getAttribute('data-mood');
        encouragePopup('心情 ' + fflPlayState.mood + ' 已貼上');
      };
    };
    bindPlayActions(document);
  }

  function renderHomeSummaryCta() {
    const page = document.getElementById('page-today');
    if (!page) return;
    let card = document.getElementById('home-summary-card');
    if (!card) {
      card = document.createElement('div');
      card.className = 'card';
      card.id = 'home-summary-card';
      const streak = document.getElementById('streak-banner');
      if (streak && streak.parentNode === page) page.insertBefore(card, streak.nextSibling);
      else page.insertBefore(card, page.firstChild);
    }
    const kcal = document.getElementById('stat-kcal')?.textContent || '0';
    const ex = document.getElementById('stat-exmin')?.textContent || '0';
    const w = document.getElementById('stat-weight')?.textContent || '—';
    card.innerHTML = `
      <div class="card-title" data-i18n="homeSummary">${t('homeSummary')}</div>
      <div class="grid-3" style="margin-bottom:8px">
        <div class="stat-box"><div class="val">${escapeHtml(kcal)}</div><div class="lbl">kcal</div></div>
        <div class="stat-box"><div class="val">${escapeHtml(ex)}</div><div class="lbl">min</div></div>
        <div class="stat-box"><div class="val">${escapeHtml(w)}</div><div class="lbl">kg</div></div>
      </div>
      <div class="home-summary-cta">
        <button type="button" class="btn btn-primary" id="btn-home-go-chat" data-i18n="goChat">${t('goChat')}</button>
      </div>`;
    document.getElementById('btn-home-go-chat').onclick = () => {
      if (typeof showPage === 'function') showPage('chat');
      else {
        document.querySelector('[data-nav="chat"]')?.click();
      }
      const input = document.getElementById('chat-input');
      if (input) input.focus();
    };
  }

  // hooks into renderToday
  if (typeof renderToday === 'function') {
    const _rt = renderToday;
    renderToday = function() {
      _rt();
      try {
        renderHomeSummaryCta();
        renderPlayPanel();
        bindPlayActions(document);
      } catch (e) { console.warn('ffl home/play', e); }
    };
  }
  if (typeof renderPetOnToday === 'function') {
    const _rpt = renderPetOnToday;
    renderPetOnToday = function() {
      _rpt();
      try { bindPlayActions(document); } catch (_) {}
    };
  }

  // boot glue
  function bootFflDiaryAuthTheme() {
    try {
      ensureAuthAndMeta();
      applyTheme();
      applyLocale();
      enhanceLoginScreen();
      ensureVoiceLangUI();
      ensureSettingsExtras();
      refreshLoginUserSelect();
      if (currentUser) {
        renderHomeSummaryCta();
        renderPlayPanel();
      }
    } catch (e) { console.warn('bootFflDiaryAuthTheme', e); }
  }

  // wrap ensureP0State / loadState path
  if (typeof ensureP0State === 'function') {
    const _ep0 = ensureP0State;
    ensureP0State = function() { _ep0(); ensureAuthAndMeta(); };
  }

  // after init bind
  if (typeof bindPetAndTagUI === 'function') {
    const _bp = bindPetAndTagUI;
    bindPetAndTagUI = function() { _bp(); bootFflDiaryAuthTheme(); };
  }

  // also run on DOM ready-ish
  /* login-safe theme/locale only — heavy home deferred via AuthGate in init */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ try { bootFflDiaryAuthTheme(); } catch(_){} });
  else try { bootFflDiaryAuthTheme(); } catch(_){}

  /* ========== BloomBody 經期記錄／週期追蹤 ========== */
  (function injectPeriodTracking() {
    const PERIOD_SYMPTOMS = ['腹痛', '頭痛', '情緒波動', '疲勞', '水腫', '腰痛', '乳房脹痛', '其他'];
    const FLOW_LABEL = { light: '輕', medium: '中', heavy: '重', unknown: '—' };
    const PERIOD_I18N = {
      'zh-Hant': {
        period: '經期', periodLog: '經期記錄', periodStart: '開始日期', periodEnd: '結束日期',
        periodOngoing: '仍在進行', flow: '流量', flowLight: '輕', flowMed: '中', flowHeavy: '重',
        symptoms: '症狀', periodNotes: '備註', savePeriod: '儲存經期記錄',
        cycleTrack: '週期追蹤', avgCycle: '平均週期', avgPeriod: '平均經期',
        nextPeriod: '預測下次開始', fertileWin: '受孕窗（參考估算）',
        phasePeriod: '經期中', phaseFertile: '受孕窗（參考）', daysUntil: '距預測經期',
        periodDisclaimer: '僅供個人記錄與日曆法粗估參考，並非醫療診斷或避孕建議。',
        periodHistory: '經期歷史', logPeriodChat: '經期開始',
        midPeriod: '經期第{n}日', privateDefault: '預設私密'
      },
      'zh-Hans': {
        period: '经期', periodLog: '经期记录', periodStart: '开始日期', periodEnd: '结束日期',
        periodOngoing: '仍在进行', flow: '流量', flowLight: '轻', flowMed: '中', flowHeavy: '重',
        symptoms: '症状', periodNotes: '备注', savePeriod: '保存经期记录',
        cycleTrack: '周期追踪', avgCycle: '平均周期', avgPeriod: '平均经期',
        nextPeriod: '预测下次开始', fertileWin: '受孕窗（参考估算）',
        phasePeriod: '经期中', phaseFertile: '受孕窗（参考）', daysUntil: '距预测经期',
        periodDisclaimer: '仅供个人记录与日历法粗估参考，不是医疗诊断或避孕建议。',
        periodHistory: '经期历史', logPeriodChat: '经期开始',
        midPeriod: '经期第{n}日', privateDefault: '默认私密'
      },
      ja: {
        period: '生理', periodLog: '生理記録', periodStart: '開始日', periodEnd: '終了日',
        periodOngoing: '継続中', flow: '量', flowLight: '少', flowMed: '中', flowHeavy: '多',
        symptoms: '症状', periodNotes: 'メモ', savePeriod: '生理を保存',
        cycleTrack: '周期トラッキング', avgCycle: '平均周期', avgPeriod: '平均経日',
        nextPeriod: '次回予測', fertileWin: '妊娠可能期（参考）',
        phasePeriod: '生理中', phaseFertile: '妊娠可能期（参考）', daysUntil: '次回まで',
        periodDisclaimer: '個人記録とカレンダー法の目安です。医療診断や避妊の助言ではありません。',
        periodHistory: '生理履歴', logPeriodChat: '生理開始',
        midPeriod: '生理{n}日目', privateDefault: '既定は非公開'
      }
    };

    function pt(key) {
      try {
        if (typeof t === 'function') {
          const v = t(key);
          if (v && v !== key) return v;
        }
      } catch (_) {}
      const loc = (state && state.meta && state.meta.locale) || 'zh-Hant';
      const pack = PERIOD_I18N[loc] || PERIOD_I18N['zh-Hant'];
      return pack[key] || (PERIOD_I18N['zh-Hant'][key] || key);
    }

    function mergePeriodI18n() {
      if (typeof FFL_I18N !== 'object') return;
      Object.keys(PERIOD_I18N).forEach(loc => {
        FFL_I18N[loc] = Object.assign({}, PERIOD_I18N[loc], FFL_I18N[loc] || {});
        // prefer explicit period keys from PERIOD_I18N when missing in pack
        Object.keys(PERIOD_I18N[loc]).forEach(k => {
          if (!FFL_I18N[loc][k]) FFL_I18N[loc][k] = PERIOD_I18N[loc][k];
        });
      });
    }

    function ymdFromDateInput(v) {
      if (!v) return '';
      const s = String(v).replace(/-/g, '');
      return /^\d{8}$/.test(s) ? s : '';
    }
    function dateInputFromYmd(ymd) {
      if (!ymd || String(ymd).length < 8) return '';
      const s = String(ymd).replace(/-/g, '');
      return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
    }
    function daysBetweenYmd(a, b) {
      if (!a || !b || a.length < 8 || b.length < 8) return null;
      const da = new Date(+a.slice(0,4), +a.slice(4,6)-1, +a.slice(6,8));
      const db = new Date(+b.slice(0,4), +b.slice(4,6)-1, +b.slice(6,8));
      return Math.round((db - da) / 86400000);
    }
    function addDaysYmd(ymd, n) {
      if (!ymd || ymd.length < 8) return null;
      const d = new Date(+ymd.slice(0,4), +ymd.slice(4,6)-1, +ymd.slice(6,8));
      d.setDate(d.getDate() + n);
      const p = x => String(x).padStart(2, '0');
      return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
    }
    function formatYmdDot(ymd) {
      if (!ymd || ymd.length < 8) return '—';
      return `${ymd.slice(0,4)}.${ymd.slice(4,6)}.${ymd.slice(6,8)}`;
    }

    function isPeriodRecord(r) {
      if (!r) return false;
      if (r.recordType === 'period') return true;
      if (r.recordType === 'note' && r.data && (r.data.kind === 'cycle' || r.data.phase === 'period_start' || r.data.phase === 'period_end')) return true;
      return false;
    }

    function collectPeriodStarts() {
      const starts = [];
      myRecords().forEach(r => {
        if (!isPeriodRecord(r)) return;
        const d = r.data || {};
        let k = null;
        if (d.phase === 'period_start' || d.phase === 'start') {
          k = ymdFromDateInput(d.startDate) || tsDateKey(r.timestamp);
        } else if (d.startDate) {
          k = ymdFromDateInput(d.startDate);
        } else if (/經期開始|月经开始|月經開始|生理開始/.test(d.cycle || d.mood || r.remark || '')) {
          k = tsDateKey(r.timestamp);
        }
        if (k) starts.push(k);
      });
      return [...new Set(starts)].sort();
    }

    function collectPeriodEnds() {
      const ends = [];
      myRecords().forEach(r => {
        if (!isPeriodRecord(r)) return;
        const d = r.data || {};
        if (d.phase === 'period_end' || d.phase === 'end') {
          ends.push(ymdFromDateInput(d.endDate) || tsDateKey(r.timestamp));
        } else if (d.endDate && d.endDate !== 'ongoing' && !d.ongoing) {
          ends.push(ymdFromDateInput(d.endDate));
        }
      });
      return [...new Set(ends.filter(Boolean))].sort();
    }

    function ensureCycleProfile() {
      if (!state.meta) state.meta = {};
      if (!state.meta.cycleProfile) {
        state.meta.cycleProfile = { avgCycleDays: 28, avgPeriodDays: 5, nextPredictedStart: null, isPublicDefault: false };
      }
      return state.meta.cycleProfile;
    }

    function recomputeCycleStats() {
      const cp = ensureCycleProfile();
      const starts = collectPeriodStarts();
      if (starts.length >= 2) {
        const gaps = [];
        for (let i = 1; i < starts.length; i++) {
          const g = daysBetweenYmd(starts[i - 1], starts[i]);
          if (g != null && g >= 18 && g <= 45) gaps.push(g);
        }
        if (gaps.length) {
          cp.avgCycleDays = Math.min(45, Math.max(21, Math.round(gaps.reduce((s, x) => s + x, 0) / gaps.length)));
        }
      }
      // period length from paired start/end near starts
      const lens = [];
      myRecords().filter(isPeriodRecord).forEach(r => {
        const d = r.data || {};
        const s = ymdFromDateInput(d.startDate);
        const e = ymdFromDateInput(d.endDate);
        if (s && e && !d.ongoing) {
          const len = daysBetweenYmd(s, e) + 1;
          if (len >= 2 && len <= 10) lens.push(len);
        }
      });
      if (lens.length) {
        cp.avgPeriodDays = Math.min(10, Math.max(2, Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)));
      }
      const last = starts[starts.length - 1];
      if (last) {
        cp.nextPredictedStart = addDaysYmd(last, cp.avgCycleDays || 28);
      }
      // fertile window estimate (calendar method): ovulation ~ cycle/2 before next start; fertile ~ ov-5 .. ov+1
      if (cp.nextPredictedStart) {
        const ov = addDaysYmd(cp.nextPredictedStart, -Math.round((cp.avgCycleDays || 28) / 2));
        cp.fertileStart = addDaysYmd(ov, -5);
        cp.fertileEnd = addDaysYmd(ov, 1);
        cp.ovulationEst = ov;
      } else {
        cp.fertileStart = cp.fertileEnd = cp.ovulationEst = null;
      }
      return cp;
    }

    function getCyclePhaseToday() {
      const cp = recomputeCycleStats();
      const today = typeof todayKey === 'function' ? todayKey() : (nowTs().slice(0, 8));
      const starts = collectPeriodStarts();
      const lastStart = starts.length ? starts[starts.length - 1] : null;
      const periodLen = cp.avgPeriodDays || 5;
      if (lastStart) {
        const dayN = daysBetweenYmd(lastStart, today);
        if (dayN != null && dayN >= 0 && dayN < periodLen) {
          // check if ended early
          const ends = collectPeriodEnds().filter(e => e >= lastStart && e <= today);
          if (!ends.length) {
            return { phase: 'period', dayN: dayN + 1, label: pt('midPeriod').replace('{n}', String(dayN + 1)), cp };
          }
        }
      }
      if (cp.fertileStart && cp.fertileEnd && today >= cp.fertileStart && today <= cp.fertileEnd) {
        return { phase: 'fertile', label: pt('phaseFertile'), cp };
      }
      if (cp.nextPredictedStart) {
        const left = daysBetweenYmd(today, cp.nextPredictedStart);
        if (left != null && left >= 0) {
          return { phase: 'waiting', daysUntil: left, label: pt('daysUntil') + ' ' + left + ' 日', cp };
        }
      }
      return { phase: 'unknown', label: '', cp };
    }

    // --- TYPE_LABEL ---
    if (typeof TYPE_LABEL === 'object') {
      TYPE_LABEL.period = '經期';
    }

    // --- summarize ---
    if (typeof summarizeRecord === 'function') {
      const _sum = summarizeRecord;
      summarizeRecord = function(r) {
        if (r && r.recordType === 'period') {
          const d = r.data || {};
          const flow = FLOW_LABEL[d.flow] || d.flow || '—';
          const sym = Array.isArray(d.symptoms) ? d.symptoms.join('、') : (d.symptoms || '');
          const range = (d.startDate ? formatYmdDot(ymdFromDateInput(d.startDate) || d.startDate) : '—')
            + ' → '
            + (d.ongoing ? pt('periodOngoing') : (d.endDate ? formatYmdDot(ymdFromDateInput(d.endDate) || d.endDate) : '—'));
          return `📅 ${escapeHtml(range)}｜流量 ${escapeHtml(flow)}`
            + (sym ? `｜${escapeHtml(sym)}` : '')
            + (d.notes || r.remark ? `<br><span class="hint">${escapeHtml(d.notes || r.remark || '')}</span>` : '');
        }
        return _sum(r);
      };
    }

    // --- form submit wrap ---
    if (typeof handleFormSubmit === 'function') {
      const _hfs = handleFormSubmit;
      handleFormSubmit = async function(e) {
        const form = e && e.target;
        if (form && form.dataset && form.dataset.type === 'period') {
          e.preventDefault();
          const ts = (formVal(form, 'timestamp') || '').trim();
          if (!/^\d{8} \d{2}:\d{2}:\d{2}$/.test(ts)) {
            toast('時間戳格式須為 YYYYMMDD HH:MM:SS', 'warn');
            return;
          }
          const startDate = ymdFromDateInput(formVal(form, 'startDate'));
          if (!startDate) { toast('請填開始日期', 'warn'); return; }
          const ongoing = !!(form.elements.ongoing && form.elements.ongoing.checked);
          let endDate = ymdFromDateInput(formVal(form, 'endDate'));
          if (ongoing) endDate = '';
          const flowEl = form.querySelector('input[name="flow"]:checked');
          const flow = flowEl ? flowEl.value : 'medium';
          const symptoms = Array.from(form.querySelectorAll('input[name="symptom"]:checked')).map(c => c.value);
          const notes = formVal(form, 'notes') || formVal(form, 'remark') || '';
          const isPublic = !!(form.elements.isPublic && form.elements.isPublic.checked);
          let phase = 'period_day';
          if (!endDate && ongoing) phase = 'period_start';
          else if (endDate && startDate === endDate) phase = 'period_start';
          else if (endDate) phase = 'period_end';
          else phase = 'period_start';
          const data = {
            kind: 'cycle',
            phase,
            startDate,
            endDate: ongoing ? '' : endDate,
            ongoing: !!ongoing,
            flow,
            symptoms,
            notes,
            cycle: phase === 'period_start' ? '經期開始' : (phase === 'period_end' ? '經期結束' : '經期'),
            mood: notes
          };
          const editId = formVal(form, 'editId');
          let record;
          if (editId) {
            const idx = state.records.findIndex(r => r.recordId === editId && r.ownerUser === currentUser);
            if (idx < 0) { toast('找不到此筆記錄或無權限', 'warn'); return; }
            record = { ...state.records[idx], timestamp: ts, isPublic, data, remark: notes };
            state.records[idx] = record;
            toast('已更新經期記錄', 'success');
          } else {
            record = {
              recordId: uid(),
              ownerUser: currentUser,
              timestamp: ts,
              recordType: 'period',
              isPublic: !!isPublic,
              data,
              remark: notes,
              source: { channel: 'form', rawText: '', confidence: 1, messageId: null, attachments: [] },
              updatedAt: nowTs()
            };
            state.records.push(record);
            toast('已儲存經期記錄（' + (isPublic ? '公開' : '私密') + '）', 'success');
          }
          record.updatedAt = nowTs();
          recomputeCycleStats();
          saveState();
          form.elements.editId.value = '';
          if (typeof resetFormFields === 'function') resetFormFields(form, 'period');
          else {
            form.reset();
            if (form.elements.isPublic) form.elements.isPublic.checked = false;
            form.querySelector('.ts-input').value = nowTs();
          }
          try { if (typeof updateCyclePrediction === 'function') updateCyclePrediction(); } catch (_) {}
          try { if (typeof renderCycleCard === 'function') renderCycleCard(); } catch (_) {}
          try { if (typeof renderToday === 'function') renderToday(); } catch (_) {}
          try { renderPeriodHistoryPanels(); } catch (_) {}
          return;
        }
        await _hfs(e);
        try {
          if (form && form.dataset && (form.dataset.type === 'note' || form.dataset.type === 'period')) {
            recomputeCycleStats();
            if (typeof renderCycleCard === 'function') renderCycleCard();
          }
        } catch (_) {}
      };
    }

    // --- resetFormFields ---
    if (typeof resetFormFields === 'function') {
      const _rf = resetFormFields;
      resetFormFields = function(form, type) {
        _rf(form, type);
        if (type === 'period' && form) {
          if (form.elements.isPublic) form.elements.isPublic.checked = false;
          if (form.elements.ongoing) form.elements.ongoing.checked = true;
          if (form.elements.endDate) form.elements.endDate.disabled = true;
          const med = form.querySelector('input[name="flow"][value="medium"]');
          if (med) med.checked = true;
          form.querySelectorAll('input[name="symptom"]').forEach(c => { c.checked = false; });
          if (form.elements.startDate) form.elements.startDate.value = dateInputFromYmd(todayKey());
          if (form.elements.notes) form.elements.notes.value = '';
        }
      };
    }

    // --- fillFormForEdit ---
    if (typeof fillFormForEdit === 'function') {
      const _ffe = fillFormForEdit;
      fillFormForEdit = function(record) {
        if (record && record.recordType === 'period') {
          const form = $('#form-period');
          if (!form) { toast('找不到經期表單', 'warn'); return; }
          showForm('period', true);
          resetFormFields(form, 'period');
          form.elements.editId.value = record.recordId;
          form.elements.timestamp.value = record.timestamp;
          form.elements.isPublic.checked = !!record.isPublic;
          const d = record.data || {};
          if (form.elements.startDate) form.elements.startDate.value = dateInputFromYmd(d.startDate) || dateInputFromYmd(tsDateKey(record.timestamp));
          const ongoing = !!d.ongoing || !d.endDate;
          if (form.elements.ongoing) form.elements.ongoing.checked = ongoing;
          if (form.elements.endDate) {
            form.elements.endDate.disabled = ongoing;
            form.elements.endDate.value = ongoing ? '' : dateInputFromYmd(d.endDate);
          }
          const flow = d.flow || 'medium';
          const fr = form.querySelector(`input[name="flow"][value="${flow}"]`);
          if (fr) fr.checked = true;
          const syms = Array.isArray(d.symptoms) ? d.symptoms : String(d.symptoms || '').split(/[、,，]/).map(s => s.trim()).filter(Boolean);
          form.querySelectorAll('input[name="symptom"]').forEach(c => {
            c.checked = syms.indexOf(c.value) >= 0;
          });
          if (form.elements.notes) form.elements.notes.value = d.notes || record.remark || '';
          if (form.elements.remark) form.elements.remark.value = d.notes || record.remark || '';
          toast('已載入經期編輯');
          return;
        }
        return _ffe(record);
      };
    }

    // --- enhance updateCyclePrediction to include period records ---
    if (typeof updateCyclePrediction === 'function') {
      const _ucp = updateCyclePrediction;
      updateCyclePrediction = function() {
        try { recomputeCycleStats(); } catch (_) {}
        try { _ucp(); } catch (_) {}
        // overwrite nextPredicted with our recompute (includes period type)
        try {
          const cp = recomputeCycleStats();
          if (state.meta && state.meta.cycleProfile) {
            state.meta.cycleProfile.nextPredictedStart = cp.nextPredictedStart;
            state.meta.cycleProfile.avgCycleDays = cp.avgCycleDays;
            state.meta.cycleProfile.avgPeriodDays = cp.avgPeriodDays;
            state.meta.cycleProfile.fertileStart = cp.fertileStart;
            state.meta.cycleProfile.fertileEnd = cp.fertileEnd;
            state.meta.cycleProfile.ovulationEst = cp.ovulationEst;
          }
        } catch (_) {}
      };
    }

    // --- chat parse ---
    function parsePeriodChat(text) {
      const raw = (text || '').trim();
      if (!raw) return null;
      // avoid stealing long diary meals
      if (typeof isDiaryLog === 'function' && isDiaryLog(raw)) return null;
      const isStart = /經期開始|月经开始|月經開始|大姨妈来了|大姨媽來了|來潮|来潮|生理開始/.test(raw);
      const isEnd = /經期結束|月经结束|月經結束|經期完|走清|走完|生理結束/.test(raw);
      const flowM = raw.match(/流量\s*([輕中重])|([輕中重])\s*流量|今天流量\s*([輕中重])|流量(light|medium|heavy)/i);
      let flow = null;
      if (flowM) {
        const ch = flowM[1] || flowM[2] || flowM[3] || '';
        if (ch === '輕' || /light/i.test(String(flowM[4]||''))) flow = 'light';
        else if (ch === '重' || /heavy/i.test(String(flowM[4]||''))) flow = 'heavy';
        else if (ch === '中' || /medium/i.test(String(flowM[4]||''))) flow = 'medium';
      }
      if (/流量輕|輕流量/.test(raw)) flow = 'light';
      if (/流量中|中流量|今天流量中/.test(raw)) flow = 'medium';
      if (/流量重|重流量/.test(raw)) flow = 'heavy';

      const foundSym = PERIOD_SYMPTOMS.filter(s => s !== '其他' && raw.indexOf(s) >= 0);
      if (/肚痛|肚子痛/.test(raw) && foundSym.indexOf('腹痛') < 0) foundSym.push('腹痛');
      if (/好攰|好累|好倦/.test(raw) && foundSym.indexOf('疲勞') < 0) foundSym.push('疲勞');

      const periodHint = isStart || isEnd || flow || foundSym.length > 0 || /經期|月经|月經|大姨妈|大姨媽|生理痛/.test(raw);
      if (!periodHint) return null;
      // require stronger signal if only generic 痛
      if (!isStart && !isEnd && !flow && !foundSym.length && !/經期|月经|月經|大姨妈|大姨媽/.test(raw)) return null;

      const today = typeof todayKey === 'function' ? todayKey() : nowTs().slice(0, 8);
      let phase = 'period_day';
      if (isStart) phase = 'period_start';
      else if (isEnd) phase = 'period_end';
      else if (flow || foundSym.length) phase = 'period_day';

      const data = {
        kind: 'cycle',
        phase,
        startDate: isStart || phase === 'period_day' ? today : today,
        endDate: isEnd ? today : '',
        ongoing: isStart || (!isEnd && phase === 'period_day'),
        flow: flow || 'medium',
        symptoms: foundSym,
        notes: raw,
        cycle: isStart ? '經期開始' : (isEnd ? '經期結束' : raw.slice(0, 40)),
        mood: raw
      };
      if (isStart) { data.startDate = today; data.ongoing = true; data.endDate = ''; }
      if (isEnd) { data.endDate = today; data.ongoing = false; }

      return {
        ok: true,
        confidence: 0.92,
        recordType: 'period',
        data,
        remark: raw,
        summary: (isStart ? '經期開始' : isEnd ? '經期結束' : '經期') +
          (flow ? ' · 流量' + FLOW_LABEL[flow] : '') +
          (foundSym.length ? ' · ' + foundSym.join('、') : ''),
        rawText: raw,
        _periodChat: true
      };
    }

    async function commitPeriodFromChat(parsed) {
      const pub = false; // default private
      if (typeof commitChatRecord === 'function') {
        const rec = await commitChatRecord(parsed, { isPublic: pub });
        try {
          recomputeCycleStats();
          if (typeof updateCyclePrediction === 'function') updateCyclePrediction();
          if (typeof renderCycleCard === 'function') renderCycleCard();
          if (typeof renderToday === 'function') renderToday();
          renderPeriodHistoryPanels();
        } catch (_) {}
        return rec;
      }
      // fallback direct push
      const record = {
        recordId: uid(),
        ownerUser: currentUser,
        timestamp: nowTs(),
        recordType: 'period',
        isPublic: false,
        data: parsed.data,
        remark: parsed.remark || '',
        source: { channel: 'chat', rawText: parsed.rawText || '', confidence: parsed.confidence || 0.9, messageId: null, attachments: [] },
        updatedAt: nowTs()
      };
      state.records.push(record);
      recomputeCycleStats();
      saveState();
      toast('已記經期（私密）', 'success');
      return record;
    }

    if (typeof handleChatSend === 'function') {
      const _hcs = handleChatSend;
      handleChatSend = async function(text) {
        const raw = (text != null ? text : (($('#chat-input') && $('#chat-input').value) || '')).trim();
        const parsed = parsePeriodChat(raw);
        if (parsed) {
          // show confirm via existing draft path if available
          if (typeof appendChatMessage === 'function' && typeof renderChatThread === 'function') {
            const input = $('#chat-input');
            if (input) input.value = '';
            appendChatMessage({
              messageId: msgUid(), ownerUser: currentUser, role: 'user',
              createdAt: nowTs(), text: raw, card: null
            });
            // use commit with confirm card pattern similar to commitChatRecord
            await commitPeriodFromChat(parsed);
            appendChatMessage({
              messageId: msgUid(), ownerUser: currentUser, role: 'bot',
              createdAt: nowTs(),
              text: '已記「' + parsed.summary + '」（預設私密）。' + pt('periodDisclaimer'),
              card: null
            });
            renderChatThread();
            if (typeof updateChatMiniStats === 'function') updateChatMiniStats();
            return;
          }
          await commitPeriodFromChat(parsed);
          return;
        }
        return await _hcs(text);
      };
    }

    // --- Home discreet chip ---
    function renderPeriodHomeChip() {
      const card = document.getElementById('home-summary-card');
      if (!card) return;
      let chip = document.getElementById('period-home-chip');
      const info = getCyclePhaseToday();
      if (!info || info.phase === 'unknown' || !info.label) {
        if (chip) chip.remove();
        return;
      }
      if (!chip) {
        chip = document.createElement('div');
        chip.id = 'period-home-chip';
        chip.className = 'period-home-chip';
        card.appendChild(chip);
      }
      let icon = '🌸';
      if (info.phase === 'period') icon = '💧';
      else if (info.phase === 'fertile') icon = '🌿';
      else icon = '📅';
      chip.innerHTML = `<span class="phc-icon">${icon}</span><div>
        <div>${escapeHtml(info.label)}</div>
        <div class="phc-muted">${escapeHtml(pt('periodDisclaimer'))}</div>
      </div>`;
    }

    if (typeof renderHomeSummaryCta === 'function') {
      const _rh = renderHomeSummaryCta;
      renderHomeSummaryCta = function() {
        _rh();
        try { renderPeriodHomeChip(); } catch (e) { console.warn(e); }
      };
    }
    if (typeof renderToday === 'function') {
      const _rt = renderToday;
      renderToday = function() {
        _rt();
        try { renderPeriodHomeChip(); } catch (_) {}
      };
    }

    // --- History / charts panels ---
    function renderPeriodHistoryPanels() {
      const cp = recomputeCycleStats();
      const listEl = document.getElementById('period-history-list');
      const metaEl = document.getElementById('period-cycle-meta');
      const stripHost = document.getElementById('period-cycle-strip-host');
      if (metaEl) {
        metaEl.innerHTML = `
          <div class="pr-card"><span>${escapeHtml(pt('avgCycle'))}</span><strong>${cp.avgCycleDays || 28} 日</strong></div>
          <div class="pr-card"><span>${escapeHtml(pt('avgPeriod'))}</span><strong>${cp.avgPeriodDays || 5} 日</strong></div>
          <div class="pr-card"><span>${escapeHtml(pt('nextPeriod'))}</span><strong>${formatYmdDot(cp.nextPredictedStart)}</strong></div>
          <div class="pr-card"><span>${escapeHtml(pt('fertileWin'))}</span><strong>${formatYmdDot(cp.fertileStart)}–${formatYmdDot(cp.fertileEnd)}</strong></div>
        `;
      }
      if (stripHost && typeof buildCycleCalendarStripHtml === 'function') {
        try { stripHost.innerHTML = buildCycleCalendarStripHtml(); } catch (_) {
          stripHost.innerHTML = '';
        }
      }
      if (listEl) {
        const items = myRecords().filter(isPeriodRecord)
          .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
          .slice(0, 40);
        if (!items.length) {
          listEl.innerHTML = '<p class="hint">未有經期記錄。可用「新增 → 經期」或對話打「經期開始」。</p>';
        } else {
          listEl.innerHTML = items.map(r => {
            const d = r.data || {};
            const flow = FLOW_LABEL[d.flow] || '—';
            const sym = Array.isArray(d.symptoms) ? d.symptoms.join('、') : '';
            return `<div class="period-hist-item">
              <strong>${escapeHtml(r.timestamp)}</strong>
              ${r.isPublic ? '' : ' · <span class="tag-private">私密</span>'}
              <div>${escapeHtml(d.phase || '')} · ${escapeHtml(formatYmdDot(ymdFromDateInput(d.startDate)||d.startDate||tsDateKey(r.timestamp)))}
                ${d.ongoing ? ' → ' + escapeHtml(pt('periodOngoing')) : (d.endDate ? ' → ' + escapeHtml(formatYmdDot(ymdFromDateInput(d.endDate)||d.endDate)) : '')}
                · 流量 ${escapeHtml(flow)}${sym ? ' · ' + escapeHtml(sym) : ''}
              </div>
            </div>`;
          }).join('');
        }
      }
      const disc = document.getElementById('period-panel-disclaimer');
      if (disc) disc.textContent = pt('periodDisclaimer');
    }

    // enhance renderCycleCard footer disclaimer
    if (typeof renderCycleCard === 'function') {
      const _rcc = renderCycleCard;
      renderCycleCard = function() {
        _rcc();
        try {
          recomputeCycleStats();
          const el = $('#cycle-predict-card');
          if (!el) return;
          const cp = state.meta.cycleProfile || {};
          // append fertile window line if missing
          if (cp.fertileStart && el.innerHTML.indexOf('受孕窗') < 0 && el.innerHTML.indexOf('妊娠可能') < 0) {
            const note = document.createElement('div');
            note.style.cssText = 'margin-top:6px;font-size:.8rem;';
            note.innerHTML = `${escapeHtml(pt('fertileWin'))}：<strong>${formatYmdDot(cp.fertileStart)} – ${formatYmdDot(cp.fertileEnd)}</strong>
              <div class="period-disclaimer">${escapeHtml(pt('periodDisclaimer'))}</div>`;
            el.appendChild(note);
          }
          // wire end button if present
          let endBtn = document.getElementById('btn-log-period-end');
          if (!endBtn) {
            const wrap = el.querySelector('div[style*="margin-top"]') || el;
            endBtn = document.createElement('button');
            endBtn.type = 'button';
            endBtn.className = 'btn btn-ghost btn-sm';
            endBtn.id = 'btn-log-period-end';
            endBtn.textContent = '記經期結束';
            endBtn.style.marginLeft = '6px';
            wrap.appendChild(endBtn);
          }
          endBtn.onclick = async () => {
            await commitPeriodFromChat({
              ok: true, confidence: 1, recordType: 'period',
              data: {
                kind: 'cycle', phase: 'period_end',
                startDate: collectPeriodStarts().slice(-1)[0] || todayKey(),
                endDate: todayKey(), ongoing: false, flow: 'medium', symptoms: [],
                notes: '經期結束', cycle: '經期結束', mood: '經期結束'
              },
              remark: '經期結束', summary: '經期結束（私密）', rawText: '經期結束'
            });
            if (typeof renderCycleCard === 'function') renderCycleCard();
            toast('已記經期結束（私密）', 'success');
          };
          renderPeriodHistoryPanels();
        } catch (e) { console.warn('period cycle card enhance', e); }
      };
    }

    // hook charts / habits page shows
    if (typeof showPage === 'function') {
      const _sp = showPage;
      showPage = function(name) {
        _sp(name);
        if (name === 'charts' || name === 'habits' || name === 'history' || name === 'today' || name === 'settings') {
          try { renderPeriodHistoryPanels(); } catch (_) {}
        }
      };
    }

    function bindPeriodFormUi() {
      const form = document.getElementById('form-period');
      if (!form || form.dataset.periodBound) return;
      form.dataset.periodBound = '1';
      const ongoing = form.elements.ongoing;
      const endDate = form.elements.endDate;
      if (ongoing && endDate) {
        const sync = () => { endDate.disabled = !!ongoing.checked; if (ongoing.checked) endDate.value = ''; };
        ongoing.addEventListener('change', sync);
        sync();
      }
      form.addEventListener('submit', function(e) {
        // handled by wrapped handleFormSubmit via form submit listener — ensure attached
      });
      // Ensure form uses same submit pipeline
      if (typeof handleFormSubmit === 'function' && !form._periodSubmit) {
        form._periodSubmit = true;
        form.addEventListener('submit', handleFormSubmit);
      }
    }

    function injectPeriodDom() {
      // add-tabs
      const tabs = document.getElementById('add-tabs');
      if (tabs && !tabs.querySelector('[data-form="period"]')) {
        const btn = document.createElement('button');
        btn.className = 'sub-tab';
        btn.dataset.form = 'period';
        btn.type = 'button';
        btn.textContent = pt('period');
        tabs.appendChild(btn);
        btn.onclick = () => showForm('period');
      }
      // form
      const addPage = document.getElementById('page-add');
      if (addPage && !document.getElementById('form-period')) {
        const form = document.createElement('form');
        form.className = 'form-panel card';
        form.id = 'form-period';
        form.dataset.type = 'period';
        form.innerHTML = `
          <div class="disclaimer-inline">🌸 ${escapeHtml(pt('periodLog'))} · ${escapeHtml(pt('privateDefault'))}<br>
            <span style="font-weight:normal">${escapeHtml(pt('periodDisclaimer'))}</span></div>
          <div class="form-group">
            <label>時間戳</label>
            <input type="text" name="timestamp" class="ts-input" placeholder="YYYYMMDD HH:MM:SS" required>
          </div>
          <div class="row-2">
            <div class="form-group">
              <label data-i18n="periodStart">${escapeHtml(pt('periodStart'))}</label>
              <input type="date" name="startDate" required>
            </div>
            <div class="form-group">
              <label data-i18n="periodEnd">${escapeHtml(pt('periodEnd'))}</label>
              <input type="date" name="endDate">
              <label style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:.8rem;">
                <input type="checkbox" name="ongoing" checked> <span data-i18n="periodOngoing">${escapeHtml(pt('periodOngoing'))}</span>
              </label>
            </div>
          </div>
          <div class="form-group">
            <label data-i18n="flow">${escapeHtml(pt('flow'))}</label>
            <div class="period-flow-row">
              <label><input type="radio" name="flow" value="light"> ${escapeHtml(pt('flowLight'))}</label>
              <label><input type="radio" name="flow" value="medium" checked> ${escapeHtml(pt('flowMed'))}</label>
              <label><input type="radio" name="flow" value="heavy"> ${escapeHtml(pt('flowHeavy'))}</label>
            </div>
          </div>
          <div class="form-group">
            <label data-i18n="symptoms">${escapeHtml(pt('symptoms'))}</label>
            <div class="period-symptom-grid">
              ${PERIOD_SYMPTOMS.map(s => `<label><input type="checkbox" name="symptom" value="${escapeHtml(s)}"> ${escapeHtml(s)}</label>`).join('')}
            </div>
          </div>
          <div class="form-group">
            <label data-i18n="periodNotes">${escapeHtml(pt('periodNotes'))}</label>
            <textarea name="notes" rows="2" placeholder="可選"></textarea>
            <input type="hidden" name="remark" value="">
          </div>
          <div class="privacy-toggle">
            <div><strong>允許搭檔查看</strong><div class="hint">${escapeHtml(pt('privateDefault'))}；敏感建議關閉</div></div>
            <label class="switch"><input type="checkbox" name="isPublic"><span class="slider"></span></label>
          </div>
          <input type="hidden" name="editId" value="">
          <button class="btn btn-primary" type="submit" data-i18n="savePeriod">${escapeHtml(pt('savePeriod'))}</button>
        `;
        addPage.appendChild(form);
      }
      // hist filter
      const hist = document.getElementById('hist-type');
      if (hist && !hist.querySelector('option[value="period"]')) {
        const opt = document.createElement('option');
        opt.value = 'period';
        opt.textContent = pt('period');
        hist.appendChild(opt);
      }
      // today quick
      const qb = document.querySelector('#page-today .quick-btns');
      if (qb && !qb.querySelector('[data-quick="period"]')) {
        const b = document.createElement('button');
        b.className = 'btn btn-secondary';
        b.type = 'button';
        b.dataset.quick = 'period';
        b.textContent = '🌸 ' + pt('period');
        b.onclick = () => showForm('period');
        qb.appendChild(b);
      }
      // chat chip
      const chips = document.getElementById('chat-quick-chips');
      if (chips && !chips.querySelector('[data-prefix="經期開始"]')) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.prefix = '經期開始';
        b.textContent = '🌸 ' + pt('logPeriodChat');
        b.onclick = () => {
          const input = document.getElementById('chat-input');
          if (input) { input.value = '經期開始'; input.focus(); }
        };
        chips.appendChild(b);
      }
      // charts / period report area: dedicated cycle panel
      const charts = document.getElementById('page-charts');
      if (charts && !document.getElementById('period-cycle-panel')) {
        const panel = document.createElement('div');
        panel.className = 'card period-cycle-panel';
        panel.id = 'period-cycle-panel';
        panel.innerHTML = `
          <div class="card-title" data-i18n="cycleTrack">${escapeHtml(pt('cycleTrack'))}</div>
          <div class="pcp-meta" id="period-cycle-meta"></div>
          <div id="period-cycle-strip-host"></div>
          <div class="card-title" style="margin-top:10px;font-size:.9rem;" data-i18n="periodHistory">${escapeHtml(pt('periodHistory'))}</div>
          <div class="period-hist-list" id="period-history-list"></div>
          <p class="period-disclaimer" id="period-panel-disclaimer">${escapeHtml(pt('periodDisclaimer'))}</p>
        `;
        const pr = document.getElementById('period-report');
        if (pr && pr.parentNode) pr.parentNode.insertBefore(panel, pr);
        else charts.appendChild(panel);
      }
      // also mirror mini list under cycle-predict-card parent if settings/habits
      bindPeriodFormUi();
      const fp = document.getElementById('form-period');
      if (fp && fp.querySelector('.ts-input') && !fp.querySelector('.ts-input').value) {
        fp.querySelector('.ts-input').value = nowTs();
      }
      if (fp && fp.elements.startDate && !fp.elements.startDate.value) {
        fp.elements.startDate.value = dateInputFromYmd(todayKey());
      }
    }

    function bootPeriod() {
      try {
        mergePeriodI18n();
        ensureCycleProfile();
        injectPeriodDom();
        recomputeCycleStats();
        renderPeriodHistoryPanels();
        renderPeriodHomeChip();
        if (typeof renderCycleCard === 'function') renderCycleCard();
      } catch (e) { console.warn('bootPeriod', e); }
    }


    // fieldsLine for period confirm cards
    if (typeof fieldsLine === 'function') {
      const _fl = fieldsLine;
      fieldsLine = function(recordType, data) {
        if (recordType === 'period') {
          data = data || {};
          const flowMap = { light: '輕', medium: '中', heavy: '重' };
          const sym = Array.isArray(data.symptoms) ? data.symptoms.join('、') : '';
          return (data.phase || '經期') + ' · 流量' + (flowMap[data.flow] || data.flow || '—')
            + (sym ? ' · ' + sym : '')
            + (data.startDate ? ' · ' + data.startDate : '');
        }
        return _fl(recordType, data);
      };
    }

    // expose helpers
    window.FFL_Period = {
      parsePeriodChat, recomputeCycleStats, getCyclePhaseToday, bootPeriod, isPeriodRecord
    };

    if (typeof bootFflDiaryAuthTheme === 'function' && !bootFflDiaryAuthTheme._fflPeriodGate) {
      const _boot = bootFflDiaryAuthTheme;
      bootFflDiaryAuthTheme = function() {
        _boot();
        if (window.FFL_AuthGate) {
          if (FFL_AuthGate.isAuthed()) bootPeriod();
        } else if (typeof currentUser === 'string' && currentUser) bootPeriod();
      };
      bootFflDiaryAuthTheme._fflPeriodGate = true;
    }
    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(bootPeriod, 'period');
    else { setTimeout(bootPeriod, 0); }
  })();


  /* ========== BloomBody 體成分／家用磅／InBody OCR + 主頁人物寵物 ========== */
  (function injectBodyCompAndHomeHero() {
    const BODY_FIELDS = [
      'height','weight','bmi','bodyFat','visceralFat','subcutaneousFat',
      'musclePct','muscle','boneMass','water','proteinPct','proteinKg',
      'bmr','score','bodyAge','whr','fatMass','fatFreeMass','smi','smm',
      'skeletalMuscle','temperature','waist','hip','thigh','arm'
    ];
    const SOURCE_OPTS = ['家用磅', 'InBody', '康文署報告', '手動', '家用體脂磅', 'Inbody 機', '手動量度'];

    function nOrNull(v) {
      if (v === '' || v == null || Number.isNaN(+v)) return null;
      return +v;
    }
    function fmtDelta(cur, prev) {
      if (cur == null || prev == null) return null;
      const d = +(cur - prev).toFixed(2);
      return d;
    }
    function deltaHtml(d, invertGood) {
      if (d == null) return '<span class="delta-flat">—</span>';
      const up = d > 0;
      const cls = d === 0 ? 'delta-flat' : (invertGood ? (up ? 'delta-up' : 'delta-down') : (up ? 'delta-up' : 'delta-down'));
      const sign = d > 0 ? '+' : '';
      return `<span class="${cls}">${sign}${d}</span>`;
    }
    function calcBmi(weight, heightCm) {
      if (weight == null || heightCm == null || heightCm <= 0) return null;
      const m = heightCm / 100;
      return +(weight / (m * m)).toFixed(1);
    }
    function rateLabel(key, val) {
      if (val == null) return { text: '—', cls: '' };
      // Reference ranges only — not medical diagnosis
      if (key === 'bmi') {
        if (val < 18.5) return { text: '偏低（參考）', cls: 'low' };
        if (val < 24) return { text: '正常（參考）', cls: 'ok' };
        if (val < 28) return { text: '偏高（參考）', cls: 'high' };
        return { text: '過高（參考）', cls: 'high' };
      }
      if (key === 'bodyFat') {
        if (val < 20) return { text: '偏低（參考）', cls: 'low' };
        if (val <= 28) return { text: '參考範圍', cls: 'ok' };
        if (val <= 35) return { text: '偏高（參考）', cls: 'high' };
        return { text: '偏高（參考）', cls: 'high' };
      }
      if (key === 'visceralFat') {
        if (val < 9) return { text: '參考', cls: 'ok' };
        if (val < 13) return { text: '偏高（參考）', cls: 'high' };
        return { text: '極高（參考）', cls: 'high' };
      }
      if (key === 'water') {
        if (val < 45) return { text: '偏低（參考）', cls: 'low' };
        if (val <= 60) return { text: '標準（參考）', cls: 'ok' };
        return { text: '偏高（參考）', cls: 'high' };
      }
      return { text: '參考', cls: 'ok' };
    }
    function lastBodyBefore(ts) {
      const list = (typeof myRecords === 'function' ? myRecords() : [])
        .filter(r => r.recordType === 'body')
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      if (!ts) return list[0] || null;
      return list.find(r => r.timestamp < ts) || null;
    }
    function computeDeltas(data, prev) {
      const p = (prev && prev.data) || {};
      const keys = ['weight','bmi','bodyFat','muscle','water','visceralFat','score'];
      const out = {};
      keys.forEach(k => {
        const d = fmtDelta(data[k], p[k]);
        if (d != null) out[k] = d;
      });
      return out;
    }
    function normalizeSource(s) {
      const t = String(s || '');
      if (/康文|lcsd|stfitness|ors/i.test(t)) return '康文署報告';
      if (/inbody/i.test(t)) return 'InBody';
      if (/屋企|家用|體脂磅|智能磅|scale/i.test(t)) return '家用磅';
      if (/手動|手量/.test(t)) return '手動';
      return t || '家用磅';
    }

    /** Parse OCR / pasted report text into body fields */
    function parseBodyCompText(text, hintSource) {
      const raw = String(text || '');
      if (!raw.trim()) return null;
      const data = { source: normalizeSource(hintSource || raw) };
      function grab(re, key) {
        const m = raw.match(re);
        if (m) data[key] = +m[1];
      }
      grab(/(?:身高|足身高|Height)\s*[:：]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:cm|公分)?/i, 'height');
      grab(/(?:體重|体重|Weight)\s*[:：]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:kg|公斤)?/i, 'weight');
      if (data.weight == null) {
        const m = raw.match(/(\d{2,3}(?:\.\d+)?)\s*kg/i);
        if (m && +m[1] > 35 && +m[1] < 200) data.weight = +m[1];
      }
      grab(/(?:BMI|身体质量|身體質量)\s*[:：]?\s*(\d{2}(?:\.\d+)?)/i, 'bmi');
      grab(/(?:體脂率|体脂率|體脂|体脂|Body\s*Fat(?:\s*Rate)?|FAT)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*%?/i, 'bodyFat');
      grab(/(?:內臟脂肪(?:等級|指數)?|内脏脂肪|VISFAT|Visceral)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)/i, 'visceralFat');
      grab(/(?:皮下脂肪)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*%?/i, 'subcutaneousFat');
      grab(/(?:肌肉率|肌肉％|MUSCLE)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*%/i, 'musclePct');
      grab(/(?:肌肉量(?!分佈)|Muscle\s*Mass)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*(?:kg)?/i, 'muscle');
      grab(/(?:骨骼肌(?:量)?|SMM)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)/i, 'smm');
      if (data.smm != null && data.skeletalMuscle == null) data.skeletalMuscle = data.smm;
      grab(/(?:骨量|骨質量|BONE|Bone\s*Mass)\s*[:：]?\s*(\d(?:\.\d+)?)\s*(?:kg)?/i, 'boneMass');
      grab(/(?:水分|體水份|WATER|Water)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*%?/i, 'water');
      grab(/(?:蛋白質|PROTEIN)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*%/i, 'proteinPct');
      grab(/(?:蛋白質|Protein)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*kg/i, 'proteinKg');
      grab(/(?:基礎代謝|BMR)\s*[:：]?\s*(\d{3,5}(?:\.\d+)?)\s*(?:kcal|大卡)?/i, 'bmr');
      // kJ to kcal if looks like kJ
      const bmrKj = raw.match(/(?:基礎代謝|BMR)[^\d]{0,12}(\d{4,5}(?:\.\d+)?)\s*kJ/i);
      if (bmrKj && (data.bmr == null || data.bmr > 4000)) data.bmr = +(+bmrKj[1] / 4.184).toFixed(1);
      grab(/(?:得分|健康得分|Score)\s*[:：]?\s*(\d{1,3}(?:\.\d+)?)/i, 'score');
      grab(/(?:體內年齡|身体年龄|Body\s*Age)\s*[:：]?\s*(\d{2})/i, 'bodyAge');
      grab(/(?:腰臀比|WHR)\s*[:：]?\s*(0\.\d{2}|\d\.\d{2})/i, 'whr');
      grab(/(?:體脂量|体脂肪量|Fat\s*Mass)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*kg/i, 'fatMass');
      grab(/(?:去脂體重|Fat-?Free)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)/i, 'fatFreeMass');
      grab(/(?:SMI)\s*[:：]?\s*(\d(?:\.\d+)?)/i, 'smi');
      grab(/(?:溫度|温度|Temperature)\s*[:：]?\s*(\d{2}(?:\.\d+)?)\s*°?C?/i, 'temperature');
      grab(/(?:腰圍)\s*[:：]?\s*(\d{2}(?:\.\d+)?)/i, 'waist');
      grab(/(?:臀圍)\s*[:：]?\s*(\d{2}(?:\.\d+)?)/i, 'hip');

      // segmental lean/fat (optional)
      const seg = { lean: {}, fat: {} };
      const trunkL = raw.match(/軀幹[^\d]{0,8}(\d{1,2}(?:\.\d+)?)\s*kg/i) || raw.match(/Trunk[^\d]{0,6}(\d{1,2}(?:\.\d+)?)/i);
      if (trunkL) seg.lean.trunk = +trunkL[1];
      const la = raw.match(/左臂[^\d]{0,6}(\d(?:\.\d+)?)/); const ra = raw.match(/右臂[^\d]{0,6}(\d(?:\.\d+)?)/);
      const ll = raw.match(/左腿[^\d]{0,6}(\d(?:\.\d+)?)/); const rl = raw.match(/右腿[^\d]{0,6}(\d(?:\.\d+)?)/);
      if (la) seg.lean.leftArm = +la[1]; if (ra) seg.lean.rightArm = +ra[1];
      if (ll) seg.lean.leftLeg = +ll[1]; if (rl) seg.lean.rightLeg = +rl[1];
      if (Object.keys(seg.lean).length) data.segmental = seg;

      if (data.bmi == null && data.weight != null && data.height != null) {
        data.bmi = calcBmi(data.weight, data.height);
      }
      // detect source from content
      if (/身體組成分析報告|康文|stfitness|ORS\d/i.test(raw)) data.source = '康文署報告';
      else if (/inbody/i.test(raw)) data.source = 'InBody';
      else if (/測試完成|VS\s*對比上次|一天內稱重|開始/.test(raw)) data.source = '家用磅';

      const filled = BODY_FIELDS.filter(k => data[k] != null).length;
      if (filled < 1 && !data.weight) return null;
      return { data, filled, conf: Math.min(0.95, 0.45 + filled * 0.06) };
    }

    let tesseractLoading = null;
    async function loadTesseract() {
      if (window.Tesseract) return window.Tesseract;
      if (tesseractLoading) return tesseractLoading;
      tesseractLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        s.onload = () => resolve(window.Tesseract);
        s.onerror = () => reject(new Error('Tesseract CDN failed'));
        document.head.appendChild(s);
      });
      return tesseractLoading;
    }
    async function ocrImageBlob(blob, statusEl) {
      const set = (t) => { if (statusEl) statusEl.textContent = t; };
      try {
        set('載入 OCR（Tesseract CDN）…');
        const T = await loadTesseract();
        set('辨認中（中文+英文）…');
        const result = await T.recognize(blob, 'chi_tra+eng', {
          logger: m => { if (m.status === 'recognizing text' && statusEl) statusEl.textContent = '辨認 ' + Math.round((m.progress || 0) * 100) + '%'; }
        });
        return (result && result.data && result.data.text) || '';
      } catch (e) {
        console.warn('OCR fail', e);
        set('OCR 不可用（離線或 CDN 失敗）— 可用貼上文字／人手填');
        return '';
      }
    }

    function enrichBodyData(data) {
      data = Object.assign({}, data);
      data.source = normalizeSource(data.source);
      if (data.bmi == null) data.bmi = calcBmi(data.weight, data.height);
      const prev = lastBodyBefore(null);
      data.deltas = computeDeltas(data, prev && prev.timestamp !== data._skip ? prev : lastBodyBefore(data._ts));
      return data;
    }

    function collectBodyFromForm(form) {
      const data = { source: formVal(form, 'source') || '家用磅' };
      BODY_FIELDS.forEach(k => {
        if (form.elements[k]) data[k] = nOrNull(formVal(form, k));
      });
      // segmental hidden json
      if (form.elements.segmentalJson && form.elements.segmentalJson.value) {
        try { data.segmental = JSON.parse(form.elements.segmentalJson.value); } catch (_) {}
      }
      return enrichBodyData(data);
    }

    function expandBodyForm() {
      const form = document.getElementById('form-body');
      if (!form || form.dataset.bodyExpanded) return;
      form.dataset.bodyExpanded = '1';
      // source options
      const src = form.elements.source;
      if (src && src.tagName === 'SELECT') {
        const cur = src.value;
        src.innerHTML = SOURCE_OPTS.slice(0, 4).map(o => `<option value="${o}">${o}</option>`).join('');
        // keep legacy match
        if (cur === '家用體脂磅') src.value = '家用磅';
        else if (cur === 'Inbody 機') src.value = 'InBody';
        else if (cur === '手動量度') src.value = '手動';
        else if ([...src.options].some(o => o.value === cur)) src.value = cur;
      }
      // default private
      if (form.elements.isPublic) form.elements.isPublic.checked = false;
      const hint = form.querySelector('.privacy-toggle .hint');
      if (hint) hint.textContent = '體成分預設私密；關閉＝完全私密';

      // insert extra fields after row-2
      let grid = form.querySelector('.body-extra-grid');
      if (!grid) {
        grid = document.createElement('div');
        grid.className = 'row-2 body-extra-grid';
        grid.innerHTML = `
          <div class="form-group"><label>身高 cm</label><input type="number" name="height" step="0.1" inputmode="decimal"></div>
          <div class="form-group"><label>BMI</label><input type="number" name="bmi" step="0.1" inputmode="decimal" placeholder="可自動計"></div>
          <div class="form-group"><label>皮下脂肪 %</label><input type="number" name="subcutaneousFat" step="0.1" inputmode="decimal"></div>
          <div class="form-group"><label>肌肉率 %</label><input type="number" name="musclePct" step="0.1" inputmode="decimal"></div>
          <div class="form-group"><label>骨量 kg</label><input type="number" name="boneMass" step="0.1" inputmode="decimal"></div>
          <div class="form-group"><label>蛋白質 %</label><input type="number" name="proteinPct" step="0.1" inputmode="decimal"></div>
          <div class="form-group"><label>蛋白質 kg</label><input type="number" name="proteinKg" step="0.1" inputmode="decimal"></div>
          <div class="form-group"><label>得分</label><input type="number" name="score" step="0.1" inputmode="decimal"></div>
          <div class="form-group"><label>體內年齡</label><input type="number" name="bodyAge" step="1" inputmode="numeric"></div>
          <div class="form-group"><label>腰臀比 WHR</label><input type="number" name="whr" step="0.01" inputmode="decimal"></div>
          <div class="form-group"><label>體脂量 kg</label><input type="number" name="fatMass" step="0.1" inputmode="decimal"></div>
          <div class="form-group"><label>去脂體重 kg</label><input type="number" name="fatFreeMass" step="0.1" inputmode="decimal"></div>
          <div class="form-group"><label>SMI</label><input type="number" name="smi" step="0.1" inputmode="decimal"></div>
          <div class="form-group"><label>SMM kg</label><input type="number" name="smm" step="0.1" inputmode="decimal"></div>
          <div class="form-group"><label>溫度 °C</label><input type="number" name="temperature" step="0.1" inputmode="decimal"></div>
          <input type="hidden" name="segmentalJson" value="">
        `;
        const row = form.querySelector('.row-2');
        if (row && row.nextSibling) form.insertBefore(grid, row.nextSibling);
        else form.insertBefore(grid, form.querySelector('.form-group textarea') && form.querySelector('.form-group textarea').closest('.form-group'));
      }
      // OCR / photo tools
      if (!form.querySelector('.ocr-paste-box')) {
        const box = document.createElement('div');
        box.className = 'form-group ocr-paste-box';
        box.innerHTML = `
          <label>影相／貼上報告文字 → 自動辨認（確認後先儲存）</label>
          <input type="file" id="body-ocr-file" accept="image/*" style="margin-bottom:6px;">
          <textarea id="body-ocr-paste" placeholder="可貼家用磅／InBody／康文署報告文字，或等 OCR 填入…"></textarea>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-body-parse-text">辨認文字並填表</button>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-body-ocr-run">OCR 圖片</button>
          </div>
          <div class="body-ocr-status" id="body-ocr-status">範圍標籤僅供參考，並非醫療診斷。</div>
        `;
        const submit = form.querySelector('button[type=submit]');
        form.insertBefore(box, submit);
        box.querySelector('#btn-body-parse-text').onclick = () => {
          const t = (document.getElementById('body-ocr-paste') || {}).value || '';
          const parsed = parseBodyCompText(t, form.elements.source && form.elements.source.value);
          if (!parsed) { toast('無法辨識數值，請檢查文字', 'warn'); return; }
          fillBodyFormFields(form, parsed.data);
          toast('已預填 ' + parsed.filled + ' 項 · 請確認後儲存', 'success');
        };
        box.querySelector('#btn-body-ocr-run').onclick = async () => {
          const fileInput = document.getElementById('body-ocr-file');
          const f = fileInput && fileInput.files && fileInput.files[0];
          const st = document.getElementById('body-ocr-status');
          if (!f) { toast('請先選圖片', 'warn'); return; }
          const text = await ocrImageBlob(f, st);
          const paste = document.getElementById('body-ocr-paste');
          if (paste && text) paste.value = text;
          const parsed = parseBodyCompText(text || '', f.name);
          if (parsed) {
            fillBodyFormFields(form, parsed.data);
            if (st) st.textContent = 'OCR 完成 · 已預填 ' + parsed.filled + ' 項（請確認）· 僅供參考';
            toast('OCR 預填完成，請確認', 'success');
          } else if (text) {
            if (st) st.textContent = 'OCR 有文字但未能對欄，請人手改或再貼上';
          }
        };
        // auto BMI
        const syncBmi = () => {
          const w = nOrNull(formVal(form, 'weight'));
          const h = nOrNull(formVal(form, 'height'));
          const b = calcBmi(w, h);
          if (b != null && form.elements.bmi) form.elements.bmi.value = b;
        };
        ['weight', 'height'].forEach(n => {
          const el = form.elements[n];
          if (el) el.addEventListener('change', syncBmi);
        });
      }
      // disclaimer
      if (!form.querySelector('.body-comp-disclaimer')) {
        const d = document.createElement('div');
        d.className = 'disclaimer-inline body-comp-disclaimer';
        d.textContent = '體成分／BMI／偏高正常標籤僅供個人記錄參考，並非醫療診斷。';
        form.insertBefore(d, form.firstChild);
      }
    }

    function fillBodyFormFields(form, data) {
      if (!form || !data) return;
      if (data.source && form.elements.source) {
        const s = normalizeSource(data.source);
        if ([...form.elements.source.options].some(o => o.value === s)) form.elements.source.value = s;
      }
      BODY_FIELDS.forEach(k => {
        if (data[k] != null && form.elements[k]) form.elements[k].value = data[k];
      });
      if (data.segmental && form.elements.segmentalJson) {
        form.elements.segmentalJson.value = JSON.stringify(data.segmental);
      }
      if (form.elements.isPublic) form.elements.isPublic.checked = false;
    }

    // wrap handleFormSubmit for richer body
    if (typeof handleFormSubmit === 'function') {
      const _hfs = handleFormSubmit;
      handleFormSubmit = async function(e) {
        const form = e && e.target;
        if (form && form.dataset && form.dataset.type === 'body') {
          e.preventDefault();
          expandBodyForm();
          const ts = (formVal(form, 'timestamp') || '').trim();
          if (!/^\d{8} \d{2}:\d{2}:\d{2}$/.test(ts)) {
            toast('時間戳格式須為 YYYYMMDD HH:MM:SS', 'warn');
            return;
          }
          let data = collectBodyFromForm(form);
          data._ts = ts;
          data = enrichBodyData(data);
          delete data._ts;
          if (data.weight == null && data.bodyFat == null && data.bmi == null) {
            toast('請至少填體重或體脂', 'warn');
            return;
          }
          const isPublic = !!(form.elements.isPublic && form.elements.isPublic.checked);
          const remark = formVal(form, 'remark') || '';
          const editId = formVal(form, 'editId');
          let record;
          if (editId) {
            const idx = state.records.findIndex(r => r.recordId === editId && r.ownerUser === currentUser);
            if (idx < 0) { toast('找不到記錄', 'warn'); return; }
            record = { ...state.records[idx], timestamp: ts, isPublic, data, remark, updatedAt: nowTs() };
            state.records[idx] = record;
            toast('已更新體成分', 'success');
          } else {
            record = {
              recordId: uid(), ownerUser: currentUser, timestamp: ts,
              recordType: 'body', isPublic, data, remark,
              source: { channel: 'form', rawText: '', confidence: 1, messageId: null, attachments: [] },
              updatedAt: nowTs()
            };
            state.records.push(record);
            toast('已儲存體成分（' + (isPublic ? '公開' : '私密') + '）', 'success');
          }
          saveState();
          form.elements.editId.value = '';
          if (typeof resetFormFields === 'function') resetFormFields(form, 'body');
          if (form.elements.isPublic) form.elements.isPublic.checked = false;
          try { if (typeof checkBadgesAfterSave === 'function') checkBadgesAfterSave(record); } catch (_) {}
          try { if (typeof renderToday === 'function') renderToday(); } catch (_) {}
          try { if (typeof renderPetOnToday === 'function') renderPetOnToday(); } catch (_) {}
          return;
        }
        return await _hfs(e);
      };
    }

    if (typeof resetFormFields === 'function') {
      const _rf = resetFormFields;
      resetFormFields = function(form, type) {
        _rf(form, type);
        if (type === 'body' && form && form.elements.isPublic) form.elements.isPublic.checked = false;
      };
    }

    if (typeof fillFormForEdit === 'function') {
      const _ffe = fillFormForEdit;
      fillFormForEdit = function(record) {
        const r = _ffe(record);
        if (record && record.recordType === 'body') {
          const form = document.getElementById('form-body');
          expandBodyForm();
          fillBodyFormFields(form, record.data || {});
        }
        return r;
      };
    }

    if (typeof summarizeRecord === 'function') {
      const _sum = summarizeRecord;
      summarizeRecord = function(r) {
        if (r && r.recordType === 'body') {
          const d = r.data || {};
          const bits = [
            d.source ? '來源：' + d.source : null,
            d.weight != null ? `體重 ${d.weight} kg` : null,
            d.bmi != null ? `BMI ${d.bmi}` : null,
            d.bodyFat != null ? `體脂 ${d.bodyFat}%` : null,
            d.muscle != null ? `肌肉 ${d.muscle} kg` : null,
            d.visceralFat != null ? `內臟 ${d.visceralFat}` : null,
            d.water != null ? `水分 ${d.water}%` : null
          ].filter(Boolean);
          let extra = '';
          if (d.deltas && d.deltas.weight != null) {
            extra = `<br><span class="hint">VS 上次 體重 ${d.deltas.weight > 0 ? '+' : ''}${d.deltas.weight} kg`
              + (d.deltas.bodyFat != null ? ` · 體脂 ${d.deltas.bodyFat > 0 ? '+' : ''}${d.deltas.bodyFat}%` : '')
              + '</span>';
          }
          return escapeHtml(bits.join('｜')) + extra + (r.remark ? `<br><span class="hint">${escapeHtml(r.remark)}</span>` : '');
        }
        return _sum(r);
      };
    }

    // Enhance buildStubBodyDraft + OCR on photo
    if (typeof buildStubBodyDraft === 'function') {
      const _bsd = buildStubBodyDraft;
      buildStubBodyDraft = function(attachments, caption) {
        const draft = _bsd(attachments, caption);
        const hint = (caption || '') + ' ' + ((attachments && attachments[0] && attachments[0].name) || '');
        let source = '家用磅';
        if (/康文|lcsd|stfitness|組成分析/i.test(hint)) source = '康文署報告';
        else if (/inbody/i.test(hint)) source = 'InBody';
        const parsed = parseBodyCompText(caption || '', source);
        draft.data = Object.assign({
          source, height: null, weight: null, bmi: null, bodyFat: null, visceralFat: null,
          subcutaneousFat: null, musclePct: null, muscle: null, boneMass: null, water: null,
          proteinPct: null, proteinKg: null, bmr: null, score: null, bodyAge: null, whr: null,
          fatMass: null, fatFreeMass: null, smi: null, smm: null, skeletalMuscle: null,
          temperature: null, waist: null, hip: null, thigh: null, arm: null
        }, draft.data || {}, parsed ? parsed.data : {});
        draft.data.source = normalizeSource(draft.data.source || source);
        draft.summary = parsed && parsed.filled
          ? `體成分辨認 · ${parsed.filled} 項預填 · 請確認`
          : '體脂磅／InBody 圖 · 請確認或貼文字辨認';
        draft.conf = parsed ? parsed.conf : 0.55;
        draft.reason = '體成分自動辨認（OCR／文字启发式）· 僅供參考';
        return draft;
      };
    }

    // richer body draft fields UI
    if (typeof renderDraftConfirmCard === 'function') {
      const _rdc = renderDraftConfirmCard;
      renderDraftConfirmCard = function(draft) {
        _rdc(draft);
        if (!draft || draft.recordType !== 'body') return;
        const host = document.getElementById('p0-draft-fields');
        if (!host) return;
        const d = draft.data || {};
        host.innerHTML = `
          <div class="draft-fields">
            <div class="form-group"><label>來源</label>
              <select data-df="source">
                ${['家用磅','InBody','康文署報告','手動'].map(s => `<option value="${s}" ${normalizeSource(d.source)===s?'selected':''}>${s}</option>`).join('')}
              </select>
            </div>
            <div class="row-2">
              <div class="form-group"><label>身高 cm</label><input type="number" data-df="height" value="${d.height??''}" inputmode="decimal"></div>
              <div class="form-group"><label>體重 kg</label><input type="number" data-df="weight" value="${d.weight??''}" inputmode="decimal"></div>
              <div class="form-group"><label>BMI</label><input type="number" data-df="bmi" value="${d.bmi??''}" inputmode="decimal"></div>
              <div class="form-group"><label>體脂 %</label><input type="number" data-df="bodyFat" value="${d.bodyFat??''}" inputmode="decimal"></div>
              <div class="form-group"><label>內臟脂肪</label><input type="number" data-df="visceralFat" value="${d.visceralFat??''}" inputmode="decimal"></div>
              <div class="form-group"><label>肌肉量 kg</label><input type="number" data-df="muscle" value="${d.muscle??''}" inputmode="decimal"></div>
              <div class="form-group"><label>水分 %</label><input type="number" data-df="water" value="${d.water??''}" inputmode="decimal"></div>
              <div class="form-group"><label>BMR</label><input type="number" data-df="bmr" value="${d.bmr??''}" inputmode="decimal"></div>
              <div class="form-group"><label>骨量 kg</label><input type="number" data-df="boneMass" value="${d.boneMass??''}" inputmode="decimal"></div>
              <div class="form-group"><label>得分</label><input type="number" data-df="score" value="${d.score??''}" inputmode="decimal"></div>
            </div>
            <div class="form-group"><label>貼上更多報告文字再辨認</label>
              <textarea id="draft-body-ocr-extra" rows="2" placeholder="可選"></textarea>
              <button type="button" class="btn btn-ghost btn-sm" id="btn-draft-reparse" style="margin-top:4px;">再辨認填入</button>
            </div>
            <p class="stub-note">自動辨認後必須確認先入帳 · 偏高／正常為參考標籤 · 預設建議私密</p>
          </div>`;
        const pub = document.getElementById('p0-draft-public');
        if (pub) pub.checked = false;
        const btn = document.getElementById('btn-draft-reparse');
        if (btn) btn.onclick = () => {
          const t = (document.getElementById('draft-body-ocr-extra') || {}).value || '';
          const parsed = parseBodyCompText(t, d.source);
          if (!parsed) { toast('無法辨識', 'warn'); return; }
          Object.assign(draft.data, parsed.data);
          renderDraftConfirmCard(draft);
          toast('已更新預填', 'success');
        };
      };
    }

    // readDraftFields body expand
    if (typeof readDraftFields === 'function') {
      const _rdf = readDraftFields;
      readDraftFields = function(recordType) {
        const data = _rdf(recordType);
        if (recordType === 'body') {
          const card = document.getElementById('p0-draft-card');
          const val = (name) => {
            const el = card && card.querySelector(`[data-df="${name}"]`);
            if (!el) return data[name] != null ? data[name] : null;
            if (el.tagName === 'SELECT') return el.value;
            return nOrNull(el.value) != null || el.value === '' ? nOrNull(el.value) : el.value;
          };
          const out = Object.assign({}, data, {
            source: (card && card.querySelector('[data-df="source"]') || {}).value || data.source || '家用磅',
            height: val('height'), weight: val('weight'), bmi: val('bmi'),
            bodyFat: val('bodyFat'), visceralFat: val('visceralFat'),
            muscle: val('muscle'), water: val('water'), bmr: val('bmr'),
            boneMass: val('boneMass'), score: val('score')
          });
          if (out.bmi == null) out.bmi = calcBmi(out.weight, out.height);
          out.deltas = computeDeltas(out, lastBodyBefore(null));
          return out;
        }
        return data;
      };
    }

    // Photo classify boost for LCSD / scale screens
    if (typeof classifyPhotoHeuristic === 'function') {
      const _cph = classifyPhotoHeuristic;
      classifyPhotoHeuristic = function(fileMeta, caption) {
        const name = ((fileMeta && fileMeta.name) || '') + ' ' + (caption || '');
        if (/身體組成|康文|stfitness|inbody|體脂|bmi|內臟脂肪|visfat|scale|家用磅|智能磅/i.test(name)) {
          return { recordType: 'body', subtype: 'scale', conf: 0.78, reason: '似體脂磅／InBody／康文署報告' };
        }
        return _cph(fileMeta, caption);
      };
    }

    // After chat image → body draft, try OCR async
    async function maybeOcrPendingBodyDraft() {
      if (!chatPendingDraft || chatPendingDraft.recordType !== 'body') return;
      if (!chatPendingImages || !chatPendingImages.length) return;
      const im = chatPendingImages[0];
      if (!im || !im.blob) return;
      const stToast = toast;
      try {
        const text = await ocrImageBlob(im.blob, null);
        if (!text) return;
        const parsed = parseBodyCompText(text, chatPendingDraft.data && chatPendingDraft.data.source);
        if (parsed) {
          Object.assign(chatPendingDraft.data, parsed.data);
          chatPendingDraft.summary = `OCR 預填 ${parsed.filled} 項 · 請確認`;
          chatPendingDraft.conf = parsed.conf;
          if (typeof renderDraftConfirmCard === 'function') renderDraftConfirmCard(chatPendingDraft);
        }
      } catch (e) { console.warn(e); }
    }

    // Hook renderDraftConfirmCard path: when body draft shown, kick OCR
    const _obs = { hooked: false };
    function hookChatSendForOcr() {
      if (_obs.hooked || typeof handleChatSend !== 'function') return;
      _obs.hooked = true;
      const _hcs = handleChatSend;
      handleChatSend = async function(text) {
        const r = await _hcs(text);
        setTimeout(() => { try { maybeOcrPendingBodyDraft(); } catch (_) {} }, 400);
        return r;
      };
    }

    // ---- Radar SVG ----
    function radarSvg(data) {
      data = data || {};
      const axes = [
        { k: 'bmi', label: 'BMI', max: 40, v: data.bmi },
        { k: 'boneMass', label: '骨量', max: 5, v: data.boneMass },
        { k: 'visceralFat', label: '內臟', max: 20, v: data.visceralFat },
        { k: 'bodyFat', label: '體脂', max: 50, v: data.bodyFat },
        { k: 'water', label: '水分', max: 70, v: data.water },
        { k: 'proteinPct', label: '蛋白', max: 25, v: data.proteinPct },
        { k: 'musclePct', label: '肌肉%', max: 80, v: data.musclePct != null ? data.musclePct : (data.muscle != null ? Math.min(80, data.muscle) : null) },
        { k: 'bmr', label: 'BMR', max: 2200, v: data.bmr }
      ];
      const cx = 70, cy = 70, R = 52;
      const n = axes.length;
      const pts = axes.map((a, i) => {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const t = a.v != null ? Math.max(0.08, Math.min(1, a.v / a.max)) : 0.08;
        return [cx + Math.cos(ang) * R * t, cy + Math.sin(ang) * R * t];
      });
      const poly = pts.map(p => p.join(',')).join(' ');
      const grid = [0.35, 0.65, 1].map(s => {
        const g = axes.map((_, i) => {
          const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          return `${cx + Math.cos(ang) * R * s},${cy + Math.sin(ang) * R * s}`;
        }).join(' ');
        return `<polygon points="${g}" fill="none" stroke="var(--border)" stroke-width="0.8"/>`;
      }).join('');
      const labels = axes.map((a, i) => {
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + Math.cos(ang) * (R + 12);
        const y = cy + Math.sin(ang) * (R + 12);
        return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="7.5" fill="var(--muted)">${a.label}</text>`;
      }).join('');
      return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" aria-label="體成分雷達（參考）">${grid}
        <polygon points="${poly}" fill="rgba(61,122,106,.25)" stroke="var(--primary)" stroke-width="1.5"/>
        ${labels}</svg>`;
    }

    function renderBodyCompHomeBlock(host) {
      if (!host) return;
      const latest = lastBodyBefore(null);
      const d = (latest && latest.data) || {};
      const prev = latest ? lastBodyBefore(latest.timestamp) : null;
      const deltas = d.deltas || computeDeltas(d, prev);
      const wRate = rateLabel('bmi', d.bmi);
      const bfRate = rateLabel('bodyFat', d.bodyFat);
      host.innerHTML = `
        <div class="bodycomp-mini">
          <div class="bodycomp-radar-wrap">${radarSvg(d)}</div>
          <div class="bodycomp-keys">
            <div class="bk-row"><span>體重</span><span class="bk-val">${d.weight != null ? d.weight + ' kg' : '—'}</span></div>
            <div class="bk-row"><span>VS 上次</span>${deltaHtml(deltas.weight, true)}</div>
            <div class="bk-row"><span>BMI</span><span class="bk-val">${d.bmi ?? '—'} <span class="bodycomp-rate ${wRate.cls}">${wRate.text}</span></span></div>
            <div class="bk-row"><span>體脂</span><span class="bk-val">${d.bodyFat != null ? d.bodyFat + '%' : '—'} <span class="bodycomp-rate ${bfRate.cls}">${bfRate.text}</span></span></div>
            <div class="bk-row"><span>水分</span><span class="bk-val">${d.water != null ? d.water + '%' : '—'}</span></div>
            <div class="bk-row"><span>來源</span><span class="bk-val" style="font-weight:500;font-size:.72rem">${escapeHtml(normalizeSource(d.source) || '—')}</span></div>
          </div>
        </div>
        <p class="hint" style="margin:6px 0 0;">雷達／評級僅供參考，並非醫療診斷。最新：${latest ? escapeHtml(latest.timestamp) : '未有記錄'}</p>`;
    }

    // ---- Home hero: character + pet prominent ----
    function renderHomeHero() {
      const page = document.getElementById('page-today');
      if (!page) return;
      let card = document.getElementById('home-summary-card');
      if (!card) {
        card = document.createElement('div');
        card.className = 'card';
        card.id = 'home-summary-card';
        const streak = document.getElementById('streak-banner');
        if (streak && streak.parentNode === page) page.insertBefore(card, streak.nextSibling);
        else page.insertBefore(card, page.firstChild);
      }
      const kcal = (document.getElementById('stat-kcal') || {}).textContent || '0';
      const ex = (document.getElementById('stat-exmin') || {}).textContent || '0';
      const w = (document.getElementById('stat-weight') || {}).textContent || '—';

      let petHtml = '';
      try {
        if (typeof renderPetDuoHtml === 'function') petHtml = renderPetDuoHtml({ compact: false });
      } catch (e) { console.warn(e); }

      card.innerHTML = `
        <div class="home-hero">
          <div class="home-hero-title">
            <span data-i18n="homeSummary">今日主頁</span>
            <span style="font-size:.72rem;font-weight:500;color:var(--muted)">人物 · 寵物 · 摘要</span>
          </div>
          <div class="home-hero-pet" id="home-hero-pet">
            ${petHtml || '<p class="hint">寵物載入中…</p>'}
          </div>
          <div id="home-bodycomp-block"></div>
          <div class="grid-3" style="margin-top:4px">
            <div class="stat-box"><div class="val">${escapeHtml(kcal)}</div><div class="lbl">kcal</div></div>
            <div class="stat-box"><div class="val">${escapeHtml(ex)}</div><div class="lbl">min</div></div>
            <div class="stat-box"><div class="val">${escapeHtml(w)}</div><div class="lbl">kg</div></div>
          </div>
          <div class="home-summary-cta" style="margin-top:8px">
            <button type="button" class="btn btn-primary" id="btn-home-go-chat">${(typeof t==='function'?t('goChat'):'去對話打卡')}</button>
            <button type="button" class="btn btn-secondary" id="btn-home-go-body">記體成分</button>
          </div>
        </div>`;
      renderBodyCompHomeBlock(document.getElementById('home-bodycomp-block'));
      const goChat = document.getElementById('btn-home-go-chat');
      if (goChat) goChat.onclick = () => {
        if (typeof showPage === 'function') showPage('chat');
        else document.querySelector('[data-nav="chat"]')?.click();
        document.getElementById('chat-input')?.focus();
      };
      const goBody = document.getElementById('btn-home-go-body');
      if (goBody) goBody.onclick = () => {
        expandBodyForm();
        if (typeof showForm === 'function') showForm('body');
      };
      // play bar inside hero
      try {
        if (typeof bindPlayActions === 'function') {
          const bar = card.querySelector('#pet-play-bar');
          if (bar) delete bar.dataset.bound;
          bindPlayActions(card);
        }
      } catch (_) {}
      // hide duplicate pet card if present
      document.querySelectorAll('.pet-duo-card').forEach(el => {
        if (!card.contains(el)) el.classList.add('home-buried');
      });
    }

    // Override home summary CTA to use hero
    if (typeof renderHomeSummaryCta === 'function') {
      renderHomeSummaryCta = function() { renderHomeHero(); };
    } else {
      window.renderHomeSummaryCta = renderHomeHero;
    }

    // renderPetOnToday → refresh hero instead of separate buried card
    if (typeof renderPetOnToday === 'function') {
      const _rpt = renderPetOnToday;
      renderPetOnToday = function() {
        try { _rpt(); } catch (_) {}
        try {
          document.querySelectorAll('#page-today > .pet-duo-card').forEach(el => el.classList.add('home-buried'));
          renderHomeHero();
          if (typeof renderPlayPanel === 'function') renderPlayPanel();
          if (typeof bindPlayActions === 'function') bindPlayActions(document.getElementById('home-summary-card'));
        } catch (e) { console.warn('home hero pet', e); }
      };
    }

    if (typeof renderToday === 'function') {
      const _rt = renderToday;
      renderToday = function() {
        _rt();
        try {
          expandBodyForm();
          renderHomeHero();
          if (typeof renderPlayPanel === 'function') renderPlayPanel();
          if (typeof bindPlayActions === 'function') bindPlayActions(document);
          // keep play panel under hero
          const play = document.getElementById('ffl-play-panel');
          const hero = document.getElementById('home-summary-card');
          if (play && hero && play.parentNode && hero.parentNode === play.parentNode) {
            if (hero.nextSibling !== play) hero.parentNode.insertBefore(play, hero.nextSibling);
          }
        } catch (e) { console.warn('bodycomp home', e); }
      };
    }

    function bootBodyCompHome() {
      try {
        if (!(window.FFL_AuthGate ? FFL_AuthGate.isAuthed() : (typeof currentUser === 'string' && currentUser))) {
          // Login screen: do not mount hero/pet/wardrobe/play (main pre-login RAM leak path).
          return;
        }
        expandBodyForm();
        hookChatSendForOcr();
        ensureHeaderQuickMenu();
        renderHomeHero();
        if (typeof renderPlayPanel === 'function') renderPlayPanel();
      } catch (e) { console.warn('bootBodyCompHome', e); }
    }


    // ---- Top-right gear: theme / language / quick settings ----
    function ensureHeaderQuickMenu() {
      const header = document.querySelector('.app-header');
      if (!header) return;
      let wrap = document.getElementById('hdr-quick-wrap');
      if (!wrap) {
        const right = header.querySelector('div[style*="display:flex"]') || header.lastElementChild;
        wrap = document.createElement('div');
        wrap.className = 'hdr-quick-wrap';
        wrap.id = 'hdr-quick-wrap';
        wrap.innerHTML = `
          <button type="button" class="btn-hdr-gear" id="btn-hdr-gear" aria-label="快速設定" aria-expanded="false" title="主題／語言">⚙️</button>
          <div class="hdr-quick-menu" id="hdr-quick-menu" role="menu">
            <div class="hq-title">介面主題</div>
            <div class="hq-row" id="hq-themes">
              <button type="button" data-theme="roman">羅馬</button>
              <button type="button" data-theme="modern">現代</button>
              <button type="button" data-theme="custom">自訂</button>
            </div>
            <div class="hq-title">介面語言</div>
            <div class="hq-row" id="hq-langs">
              <button type="button" data-locale="zh-Hant">繁體</button>
              <button type="button" data-locale="zh-Hans">简体</button>
              <button type="button" data-locale="ja">日本語</button>
            </div>
            <div class="hq-title">快捷</div>
            <button type="button" class="hq-link" id="hq-open-settings">⚙️ 完整設定</button>
            <button type="button" class="hq-link" id="hq-go-chat">💬 對話打卡</button>
            <button type="button" class="hq-link" id="hq-go-body">⚖️ 體成分表單</button>
          </div>`;
        if (right) right.insertBefore(wrap, right.firstChild);
        else header.appendChild(wrap);
      }
      let backdrop = document.getElementById('hdr-quick-backdrop');
      if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'hdr-quick-backdrop';
        backdrop.className = 'hdr-quick-backdrop';
        document.body.appendChild(backdrop);
      }
      const gear = document.getElementById('btn-hdr-gear');
      const menu = document.getElementById('hdr-quick-menu');
      const syncActive = () => {
        ensureAuthAndMeta && ensureAuthAndMeta();
        const th = (state.meta && state.meta.theme && state.meta.theme.id) || 'roman';
        const loc = (state.meta && state.meta.locale) || 'zh-Hant';
        menu.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('active', b.getAttribute('data-theme') === th || (th === 'custom' && b.getAttribute('data-theme') === 'custom')));
        // custom theme id might be custom
        const tid = (state.meta.theme && (state.meta.theme.preset || state.meta.theme.id)) || 'roman';
        menu.querySelectorAll('[data-theme]').forEach(b => {
          const v = b.getAttribute('data-theme');
          b.classList.toggle('active', v === tid || (v === 'custom' && state.meta.theme && state.meta.theme.custom));
        });
        menu.querySelectorAll('[data-locale]').forEach(b => b.classList.toggle('active', b.getAttribute('data-locale') === loc));
      };
      const close = () => {
        menu.classList.remove('open');
        backdrop.classList.remove('open');
        gear.setAttribute('aria-expanded', 'false');
      };
      const open = () => {
        syncActive();
        try {
          const r = gear.getBoundingClientRect();
          const mw = Math.min(280, window.innerWidth - 16);
          let left = Math.min(window.innerWidth - mw - 8, Math.max(8, r.right - mw));
          menu.style.position = 'fixed';
          menu.style.top = Math.round(r.bottom + 6) + 'px';
          menu.style.left = Math.round(left) + 'px';
          menu.style.right = 'auto';
          menu.style.zIndex = '5000';
        } catch (_) {}
        menu.classList.add('open');
        backdrop.classList.add('open');
        gear.setAttribute('aria-expanded', 'true');
      };
      if (!gear.dataset.bound) {
        gear.dataset.bound = '1';
        gear.onclick = (e) => {
          e.stopPropagation();
          if (menu.classList.contains('open')) close(); else open();
        };
        backdrop.onclick = close;
        menu.onclick = (e) => e.stopPropagation();
        menu.querySelector('#hq-themes').onclick = (e) => {
          const b = e.target.closest('[data-theme]');
          if (!b) return;
          ensureAuthAndMeta();
          const id = b.getAttribute('data-theme');
          if (id === 'custom') {
            close();
            if (typeof showPage === 'function') showPage('settings');
            setTimeout(() => document.getElementById('ffl-theme-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
            toast('可於設定調整自訂顏色', 'success');
            return;
          }
          if (typeof FFL_THEME_PRESETS !== 'undefined' && FFL_THEME_PRESETS[id]) {
            state.meta.theme = { id, preset: id, vars: Object.assign({}, FFL_THEME_PRESETS[id].vars) };
          } else {
            state.meta.theme = { id, preset: id };
          }
          saveState();
          if (typeof applyTheme === 'function') applyTheme();
          syncActive();
          toast(id === 'roman' ? '羅馬古典' : '清爽現代', 'success');
        };
        menu.querySelector('#hq-langs').onclick = (e) => {
          const b = e.target.closest('[data-locale]');
          if (!b) return;
          ensureAuthAndMeta();
          state.meta.locale = b.getAttribute('data-locale');
          saveState();
          if (typeof applyLocale === 'function') applyLocale();
          try { if (typeof renderHomeSummaryCta === 'function') renderHomeSummaryCta(); } catch (_) {}
          try { if (typeof renderHomeHero === 'function') renderHomeHero(); } catch (_) {}
          try { if (typeof renderPlayPanel === 'function') renderPlayPanel(); } catch (_) {}
          syncActive();
          toast('語言：' + state.meta.locale, 'success');
        };
        menu.querySelector('#hq-open-settings').onclick = () => {
          close();
          if (typeof showPage === 'function') showPage('settings');
          else document.querySelector('[data-nav="settings"]')?.click();
        };
        menu.querySelector('#hq-go-chat').onclick = () => {
          close();
          if (typeof showPage === 'function') showPage('chat');
          document.getElementById('chat-input')?.focus();
        };
        menu.querySelector('#hq-go-body').onclick = () => {
          close();
          try { expandBodyForm(); } catch (_) {}
          if (typeof showForm === 'function') showForm('body');
        };
      }
      syncActive();
    }


    window.FFL_BodyComp = { parseBodyCompText, ocrImageBlob, renderHomeHero, enrichBodyData, rateLabel, ensureHeaderQuickMenu };

    if (typeof bootFflDiaryAuthTheme === 'function') {
      const _b = bootFflDiaryAuthTheme;
      bootFflDiaryAuthTheme = function() { _b(); if (window.FFL_AuthGate ? FFL_AuthGate.isAuthed() : currentUser) bootBodyCompHome(); };
    }
    if (typeof bootPeriod === 'function') {
      /* period already chains diary */
    }
    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(bootBodyCompHome, 'bodyCompHome');
    else { setTimeout(bootBodyCompHome, 50); }
  })();


  /* ========== BloomBody 可愛互動加強／試穿衣櫃／保健品 ========== */
  (function injectPlayTryOnSupplements() {
    const OUTFITS = [
      { id: 'roman', name: '羅馬米', color: '#c4a574', unlock: 0 },
      { id: 'blush', name: '腮紅粉', color: '#e8919a', unlock: 0 },
      { id: 'sky', name: '天空藍', color: '#7BA3C9', unlock: 0 },
      { id: 'mint', name: '薄荷綠', color: '#5B8C7A', unlock: 1 },
      { id: 'cocoa', name: '可可咖', color: '#b07a4a', unlock: 2 },
      { id: 'lilac', name: '淡紫', color: '#a78bda', unlock: 3 },
      { id: 'sunset', name: '日落橙', color: '#e07a3d', unlock: 5 },
      { id: 'gold', name: '派對金', color: '#d4a017', unlock: 7 },
      { id: 'noir', name: '小黑裙', color: '#2a2418', unlock: 10 },
      { id: 'sakura', name: '櫻花白', color: '#f5e6ea', unlock: 14 }
    ];
    const ACCESSORIES = [
      { id: 'none', name: '無', emoji: '—' },
      { id: 'bow', name: '蝴蝶結', emoji: '🎀' },
      { id: 'hat', name: '小帽', emoji: '👒' },
      { id: 'glasses', name: '眼鏡', emoji: '👓' },
      { id: 'scarf', name: '絲巾', emoji: '🧣' }
    ];
    const REACT_MSGS = {
      feed: ['咀咀咀～開心！', '多謝零食～', '肚肚圓圓！', '再來一口？'],
      pat: ['摸頭殺！💕', '呼嚕呼嚕', '再摸多下～', '心心眼✨'],
      dress: ['新造型！', '很襯～', '鏡子都讚', '打卡也很棒'],
      pose: ['擺好姿勢！', '相機準備～', '超自信', '側影殺！'],
      combo: ['Combo！雙倍開心', '餵＋摸連擊！', '玩得開心～記住打卡'],
      surprise: ['今日驚喜禮物！', '開盲盒～新色解鎖提示', '小寵送你一個擁抱'],
      bubble: ['點我呀～', '嘿嘿', '想玩？', '打卡前先玩下']
    };
    const SUP_DEFAULTS = [
      { id: 'vd', name: '維他命D', aliases: ['維他命d', 'vitamin d', 'vd', '維d'] },
      { id: 'omega', name: 'Omega-3', aliases: ['omega', '魚油', 'om3'] },
      { id: 'mag', name: '鎂', aliases: ['鎂', 'magnesium', 'mg'] },
      { id: 'multi', name: '綜合維他命', aliases: ['綜合', 'multi', '維他命'] }
    ];

    function ensurePlaySupState() {
      if (typeof ensureAuthAndMeta === 'function') ensureAuthAndMeta();
      if (!state.meta) state.meta = {};
      if (!state.meta.play) state.meta.play = {};
      const p = state.meta.play;
      if (p.feedCount == null) p.feedCount = 0;
      if (p.patCount == null) p.patCount = 0;
      if (p.combo == null) p.combo = 0;
      if (p.lastComboAt == null) p.lastComboAt = 0;
      if (!p.unlockedOutfits) p.unlockedOutfits = ['roman', 'blush', 'sky'];
      if (!p.savedLooks) p.savedLooks = [];
      if (!p.wearing) p.wearing = { outfitId: 'roman', accessoryId: 'none', poseIdx: 0 };
      if (!p.dailySurpriseKey) p.dailySurpriseKey = '';
      if (!p.dailySurpriseText) p.dailySurpriseText = '';
      if (!Array.isArray(state.meta.supplementsCatalog)) {
        state.meta.supplementsCatalog = SUP_DEFAULTS.map(s => ({ id: s.id, name: s.name, aliases: s.aliases.slice(), active: true }));
      }
    }

    function streakDays() {
      try {
        if (typeof calcStreak === 'function') return calcStreak() || 0;
      } catch (_) {}
      const keys = new Set();
      try {
        (typeof myRecords === 'function' ? myRecords() : []).forEach(r => {
          const d = (r.timestamp || '').slice(0, 8);
          if (d) keys.add(d);
        });
      } catch (_) {}
      return keys.size;
    }

    function unlockOutfitsByProgress() {
      ensurePlaySupState();
      const st = streakDays();
      const logs = (typeof myRecords === 'function' ? myRecords() : []).length;
      const score = Math.max(st, Math.floor(logs / 5));
      OUTFITS.forEach(o => {
        if (score >= o.unlock && !state.meta.play.unlockedOutfits.includes(o.id)) {
          state.meta.play.unlockedOutfits.push(o.id);
        }
      });
    }

    function sparkAt(x, y, emoji) {
      const el = document.createElement('div');
      el.className = 'ffl-spark';
      el.textContent = emoji || '✨';
      el.style.left = (x || (window.innerWidth / 2)) + 'px';
      el.style.top = (y || (window.innerHeight * 0.35)) + 'px';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1100);
    }

    function reactStage(kind) {
      const stage = document.querySelector('#home-hero-pet .pet-duo-stage, .pet-duo-stage.realistic, .pet-duo-stage');
      if (stage) {
        stage.classList.remove('ffl-react');
        void stage.offsetWidth;
        stage.classList.add('ffl-react');
      }
      if (kind === 'feed') {
        document.querySelectorAll('.hamster-svg').forEach(n => {
          n.classList.remove('ffl-fed');
          void n.offsetWidth;
          n.classList.add('ffl-fed');
        });
      }
      if (kind === 'dress') {
        document.querySelectorAll('.tryon-svg').forEach(n => {
          n.classList.remove('ffl-dress-flash');
          void n.offsetWidth;
          n.classList.add('ffl-dress-flash');
        });
      }
    }

    function pickMsg(key) {
      const arr = REACT_MSGS[key] || ['耶！'];
      return arr[Math.floor(Math.random() * arr.length)];
    }

    function bumpCombo(act) {
      ensurePlaySupState();
      const now = Date.now();
      const p = state.meta.play;
      if (now - (p.lastComboAt || 0) < 8000) p.combo = (p.combo || 0) + 1;
      else p.combo = 1;
      p.lastComboAt = now;
      p.lastAct = act;
      if (p.combo >= 3) {
        if (typeof encouragePopup === 'function') encouragePopup(pickMsg('combo') + ' ×' + p.combo);
        sparkAt(null, null, '🎉');
      }
      const bar = document.querySelector('.ffl-combo-bar > i');
      if (bar) bar.style.width = Math.min(100, p.combo * 20) + '%';
    }

    function applyOutfitToSvgs(outfitId, accessoryId) {
      const o = OUTFITS.find(x => x.id === outfitId) || OUTFITS[0];
      document.querySelectorAll('.tryon-svg path, .tryon-svg ellipse').forEach((n, i) => {
        const fill = n.getAttribute('fill') || '';
        if (fill.includes('url(#dr)') || fill === o.color || (i < 4 && n.tagName === 'path')) {
          try { n.setAttribute('fill', o.color); } catch (_) {}
        }
        if (n.classList && n.classList.contains('waist-band')) {
          try { n.setAttribute('fill', o.color); n.setAttribute('opacity', '0.9'); } catch (_) {}
        }
      });
      // accessory badge on stage
      let badge = document.getElementById('ffl-acc-badge');
      const host = document.querySelector('#home-hero-pet .pet-duo-stage, .pet-duo-stage');
      if (host) {
        if (!badge) {
          badge = document.createElement('div');
          badge.id = 'ffl-acc-badge';
          badge.style.cssText = 'position:absolute;top:4px;right:8px;font-size:1.2rem;';
          host.style.position = 'relative';
          host.appendChild(badge);
        }
        const acc = ACCESSORIES.find(a => a.id === accessoryId) || ACCESSORIES[0];
        badge.textContent = acc.id === 'none' ? '' : acc.emoji;
      }
    }

    function wearOutfit(outfitId, silent) {
      ensurePlaySupState();
      unlockOutfitsByProgress();
      const unlocked = state.meta.play.unlockedOutfits || [];
      if (!unlocked.includes(outfitId)) {
        if (typeof toast === 'function') toast('未解鎖：連續打卡／記錄可解鎖', 'warn');
        return false;
      }
      state.meta.play.wearing.outfitId = outfitId;
      saveState();
      applyOutfitToSvgs(outfitId, state.meta.play.wearing.accessoryId);
      reactStage('dress');
      if (!silent) {
        const o = OUTFITS.find(x => x.id === outfitId);
        if (typeof encouragePopup === 'function') encouragePopup(pickMsg('dress') + ' · ' + (o ? o.name : ''));
        sparkAt(null, null, '👗');
      }
      return true;
    }

    function saveCurrentLook(name) {
      ensurePlaySupState();
      const w = state.meta.play.wearing;
      const look = {
        id: 'look_' + Date.now().toString(36),
        name: name || ('造型' + (state.meta.play.savedLooks.length + 1)),
        outfitId: w.outfitId,
        accessoryId: w.accessoryId,
        poseIdx: w.poseIdx || 0,
        savedAt: typeof nowTs === 'function' ? nowTs() : new Date().toISOString()
      };
      state.meta.play.savedLooks.unshift(look);
      state.meta.play.savedLooks = state.meta.play.savedLooks.slice(0, 12);
      saveState();
      if (typeof encouragePopup === 'function') encouragePopup('已收藏造型：' + look.name);
      renderWardrobeUI();
    }

    function dailySurpriseHtml() {
      ensurePlaySupState();
      const today = typeof todayKey === 'function' ? todayKey() : '';
      if (state.meta.play.dailySurpriseKey !== today) {
        const pool = [
          '今日小寵想同你擊掌！點寵物頭先～',
          '盲盒提示：再打卡 1 日可能解鎖新色',
          '今日任務：餵食＋摸摸連擊 3 次（不阻礙打卡）',
          '試穿小挑戰：換 2 套衫再收藏一個造型',
          '保健品記得打勾，人物會閃閃發光✨'
        ];
        state.meta.play.dailySurpriseKey = today;
        state.meta.play.dailySurpriseText = pool[Math.abs((today || '0').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % pool.length];
        saveState();
      }
      return `<div class="ffl-daily-surprise" id="ffl-daily-surprise">🎁 ${state.meta.play.dailySurpriseText}</div>`;
    }

    function renderWardrobeUI(root) {
      ensurePlaySupState();
      unlockOutfitsByProgress();
      const host = (root || document).querySelector('#ffl-wardrobe') || document.getElementById('ffl-wardrobe');
      if (!host) return;
      const unlocked = new Set(state.meta.play.unlockedOutfits || []);
      const wearing = state.meta.play.wearing || {};
      const st = streakDays();
      host.innerHTML = `
        <div class="ww-title">👗 試穿衣櫃 <span style="font-weight:500;font-size:.7rem;color:var(--muted)">連續 ${st} 日 · 解鎖造型</span></div>
        <div class="ww-grid" id="ww-outfits">
          ${OUTFITS.map(o => {
            const locked = !unlocked.has(o.id);
            const active = wearing.outfitId === o.id;
            return `<button type="button" class="ww-item ${active ? 'active' : ''} ${locked ? 'locked' : ''}" data-outfit="${o.id}" ${locked ? 'title="需連續/進度 ' + o.unlock + '"' : ''}>
              ${locked ? '<span class="lock">🔒</span>' : ''}
              <div class="ww-swatch" style="background:${o.color}"></div>
              ${o.name}
            </button>`;
          }).join('')}
        </div>
        <div class="ww-title" style="margin-top:8px">飾品</div>
        <div class="hq-row" id="ww-acc" style="display:flex;flex-wrap:wrap;gap:6px">
          ${ACCESSORIES.map(a => `<button type="button" class="btn btn-ghost btn-sm ${wearing.accessoryId === a.id ? 'active' : ''}" data-acc="${a.id}" style="border:1px solid var(--border);border-radius:10px">${a.emoji} ${a.name}</button>`).join('')}
        </div>
        <div class="ww-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="ww-save-look">收藏造型</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ww-shuffle">隨機混搭</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ww-pose">換姿勢</button>
        </div>
        <div class="ffl-looks-list" id="ww-looks">
          ${(state.meta.play.savedLooks || []).slice(0, 6).map(l =>
            `<button type="button" data-look="${l.id}">${l.name}</button>`
          ).join('') || '<span>未有收藏造型</span>'}
        </div>`;
      host.querySelector('#ww-outfits').onclick = (e) => {
        const b = e.target.closest('[data-outfit]');
        if (!b) return;
        wearOutfit(b.getAttribute('data-outfit'));
        renderWardrobeUI(root);
      };
      host.querySelector('#ww-acc').onclick = (e) => {
        const b = e.target.closest('[data-acc]');
        if (!b) return;
        state.meta.play.wearing.accessoryId = b.getAttribute('data-acc');
        saveState();
        applyOutfitToSvgs(state.meta.play.wearing.outfitId, state.meta.play.wearing.accessoryId);
        if (typeof encouragePopup === 'function') encouragePopup('飾品 OK ' + b.textContent.trim());
        sparkAt(null, null, '✨');
        renderWardrobeUI(root);
      };
      host.querySelector('#ww-save-look').onclick = () => {
        const name = prompt('造型名稱？', '今日 Look');
        if (name === null) return;
        saveCurrentLook((name || '').trim() || undefined);
      };
      host.querySelector('#ww-shuffle').onclick = () => {
        const unlockedList = OUTFITS.filter(o => unlocked.has(o.id));
        const pick = unlockedList[Math.floor(Math.random() * unlockedList.length)];
        const acc = ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)];
        state.meta.play.wearing.accessoryId = acc.id;
        wearOutfit(pick.id);
        renderWardrobeUI(root);
      };
      host.querySelector('#ww-pose').onclick = () => {
        if (typeof fflPlayState !== 'undefined') {
          fflPlayState.poseIdx = ((fflPlayState.poseIdx || 0) + 1) % 4;
          state.meta.play.wearing.poseIdx = fflPlayState.poseIdx;
          saveState();
          const names = ['站立', '側身', '舉手', '走路'];
          if (typeof encouragePopup === 'function') encouragePopup('姿勢：' + names[fflPlayState.poseIdx]);
          reactStage('pose');
        }
      };
      host.querySelector('#ww-looks').onclick = (e) => {
        const b = e.target.closest('[data-look]');
        if (!b) return;
        const look = (state.meta.play.savedLooks || []).find(l => l.id === b.getAttribute('data-look'));
        if (!look) return;
        state.meta.play.wearing.accessoryId = look.accessoryId || 'none';
        wearOutfit(look.outfitId);
        renderWardrobeUI(root);
      };
      applyOutfitToSvgs(wearing.outfitId, wearing.accessoryId);
    }

    // Enhance bindPlayActions
    const _bindPlay = typeof bindPlayActions === 'function' ? bindPlayActions : null;
    bindPlayActions = function(root) {
      ensurePlaySupState();
      if (_bindPlay) {
        const bar = (root || document).querySelector('#pet-play-bar');
        if (bar) delete bar.dataset.bound;
        _bindPlay(root);
      }
      const scope = root || document;
      const bar = scope.querySelector('#pet-play-bar');
      if (bar && !bar.dataset.amp) {
        bar.dataset.amp = '1';
        // extra buttons
        if (!bar.querySelector('[data-play="bubble"]')) {
          bar.insertAdjacentHTML('beforeend', `
            <button type="button" class="btn btn-secondary btn-sm" data-play="bubble">對話泡泡</button>
            <button type="button" class="btn btn-secondary btn-sm" data-play="tickle">癢癢</button>
            <button type="button" class="btn btn-secondary btn-sm" data-play="highfive">擊掌</button>`);
        }
        if (!scope.querySelector('.ffl-combo-bar')) {
          bar.insertAdjacentHTML('afterend', '<div class="ffl-combo-bar" title="連擊"><i></i></div>');
        }
        const prev = bar.onclick;
        bar.onclick = (e) => {
          const b = e.target.closest('[data-play]');
          if (!b) return;
          const act = b.getAttribute('data-play');
          if (['bubble', 'tickle', 'highfive'].includes(act)) {
            e.stopPropagation();
            ensurePlaySupState();
            if (act === 'bubble') {
              if (typeof encouragePopup === 'function') encouragePopup(pickMsg('bubble'));
              sparkAt(e.clientX, e.clientY, '💬');
            } else if (act === 'tickle') {
              reactStage('feed');
              if (typeof encouragePopup === 'function') encouragePopup('哈哈哈哈～癢！');
              sparkAt(e.clientX, e.clientY, '🤭');
            } else {
              reactStage('pat');
              if (typeof encouragePopup === 'function') encouragePopup('擊掌成功！🙌');
              sparkAt(e.clientX, e.clientY, '🙌');
            }
            bumpCombo(act);
            return;
          }
          if (typeof prev === 'function') prev(e);
          bumpCombo(act);
          reactStage(act === 'dress' ? 'dress' : (act === 'feed' ? 'feed' : 'pat'));
          sparkAt(e.clientX, e.clientY, act === 'feed' ? '🍎' : act === 'pat' ? '💕' : '✨');
          if (act === 'dress') {
            // sync wardrobe cycle with unlocked only
            const unlocked = state.meta.play.unlockedOutfits || [];
            const cur = state.meta.play.wearing.outfitId;
            const idx = Math.max(0, unlocked.indexOf(cur));
            const next = unlocked[(idx + 1) % unlocked.length] || 'roman';
            wearOutfit(next, true);
            renderWardrobeUI(scope);
          }
        };
      }
      // tap hotspots on hero pet
      const petHost = scope.querySelector('#home-hero-pet') || document.getElementById('home-hero-pet');
      if (petHost && !petHost.querySelector('.ffl-tap-hotspots')) {
        const hs = document.createElement('div');
        hs.className = 'ffl-tap-hotspots';
        hs.innerHTML = `
          <button type="button" data-hot="head">點頭</button>
          <button type="button" data-hot="cheek">點面頰</button>
          <button type="button" data-hot="belly">點肚</button>
          <button type="button" data-hot="paw">點爪</button>`;
        petHost.appendChild(hs);
        hs.onclick = (e) => {
          const b = e.target.closest('[data-hot]');
          if (!b) return;
          const map = { head: ['pat', '💕'], cheek: ['bubble', '😊'], belly: ['feed', '🍎'], paw: ['highfive', '🐾'] };
          const [k, em] = map[b.getAttribute('data-hot')] || ['bubble', '✨'];
          reactStage(k === 'feed' ? 'feed' : 'pat');
          if (typeof encouragePopup === 'function') encouragePopup(pickMsg(k === 'highfive' ? 'pat' : k));
          sparkAt(e.clientX, e.clientY, em);
          bumpCombo(k);
        };
      }
      // mini games row
      if (petHost && !document.getElementById('ffl-mini-games')) {
        const mg = document.createElement('div');
        mg.className = 'ffl-mini-games';
        mg.id = 'ffl-mini-games';
        mg.innerHTML = `
          <button type="button" id="mg-catch">接零食 ×5</button>
          <button type="button" id="mg-memory">心情配對</button>
          <button type="button" id="mg-dance">寵物跳舞</button>`;
        petHost.appendChild(mg);
        mg.querySelector('#mg-catch').onclick = () => {
          let n = 0;
          const tick = () => {
            n++;
            sparkAt(40 + Math.random() * (window.innerWidth - 80), 120 + Math.random() * 160, ['🍎', '🥜', '🍓', '✨'][n % 4]);
            if (n < 5) setTimeout(tick, 220);
            else {
              ensurePlaySupState();
              state.meta.play.feedCount = (state.meta.play.feedCount || 0) + 1;
              saveState();
              if (typeof encouragePopup === 'function') encouragePopup('接零食完成！小寵飽飽');
            }
          };
          tick();
        };
        mg.querySelector('#mg-memory').onclick = () => {
          const moods = ['😊', '💪', '🥗', '✨'];
          const a = moods[Math.floor(Math.random() * moods.length)];
          const ok = confirm('心情配對：您目前是 ' + a + ' 嗎？\n（取消＝更換一個，不影響打卡）');
          if (typeof encouragePopup === 'function') encouragePopup(ok ? ('配對成功 ' + a) : '再試下～');
          sparkAt(null, null, a);
        };
        mg.querySelector('#mg-dance').onclick = () => {
          const stage = document.querySelector('.pet-duo-stage');
          let i = 0;
          const iv = setInterval(() => {
            reactStage(i % 2 ? 'feed' : 'pat');
            sparkAt(null, null, ['🎵', '💃', '✨', '🐾'][i % 4]);
            if (++i >= 6) {
              clearInterval(iv);
              if (typeof encouragePopup === 'function') encouragePopup('跳舞結束！去打卡呀～');
            }
          }, 280);
        };
      }
      // wardrobe mount
      if (petHost && !document.getElementById('ffl-wardrobe')) {
        const w = document.createElement('div');
        w.className = 'ffl-wardrobe';
        w.id = 'ffl-wardrobe';
        petHost.appendChild(w);
      }
      if (petHost && !document.getElementById('ffl-daily-surprise')) {
        petHost.insertAdjacentHTML('beforeend', dailySurpriseHtml());
      }
      renderWardrobeUI(scope);
    };

    // ---------- Supplements ----------
    function tsNowLocal() {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
    function todayYmd() {
      return typeof todayKey === 'function' ? todayKey() : tsNowLocal().slice(0, 8);
    }
    function catalog() {
      ensurePlaySupState();
      return (state.meta.supplementsCatalog || []).filter(s => s.active !== false);
    }
    function supplementRecords() {
      return (typeof myRecords === 'function' ? myRecords() : []).filter(r => r.recordType === 'supplement');
    }
    function takenMapToday() {
      const ymd = todayYmd();
      const map = {};
      supplementRecords().forEach(r => {
        const t = (r.timestamp || '').replace(/[-:T]/g, ' ').slice(0, 17);
        const day = (r.timestamp || '').slice(0, 8);
        if (day !== ymd) return;
        const id = r.data && r.data.supplementId;
        if (id) map[id] = r;
      });
      return map;
    }
    function markSupplementTaken(supId, opts) {
      ensurePlaySupState();
      const item = (state.meta.supplementsCatalog || []).find(s => s.id === supId);
      if (!item) return null;
      const taken = takenMapToday();
      if (taken[supId] && !(opts && opts.forceNew)) {
        if (typeof toast === 'function') toast('今日已記：' + item.name, 'success');
        return taken[supId];
      }
      const rec = {
        id: typeof uid === 'function' ? uid() : ('s' + Date.now()),
        ownerUser: currentUser,
        recordType: 'supplement',
        timestamp: tsNowLocal(),
        isPublic: !!(opts && opts.isPublic),
        data: {
          supplementId: item.id,
          name: item.name,
          note: (opts && opts.note) || '',
          dose: (opts && opts.dose) || ''
        },
        tags: ['保健品']
      };
      if (!state.records) state.records = [];
      state.records.push(rec);
      saveState();
      if (typeof encouragePopup === 'function') encouragePopup('已記保健品：' + item.name);
      sparkAt(null, null, '💊');
      return rec;
    }
    function parseSupplementText(text) {
      const raw = (text || '').trim();
      if (!raw) return null;
      const lower = raw.toLowerCase();
      // patterns: 食咗X / 吃了X / 飲咗X / took X / 保健品 X
      const hitVerb = /(食咗|吃了|食了|飲咗|喝了|took|taken|supplement|保健品)/i.test(raw);
      let matched = null;
      for (const s of catalog()) {
        const names = [s.name].concat(s.aliases || []);
        if (names.some(n => n && lower.includes(String(n).toLowerCase()))) {
          matched = s;
          break;
        }
      }
      if (!matched && hitVerb) {
        // fuzzy: after verb
        const m = raw.match(/(?:食咗|吃了|食了|飲咗|喝了|took)\s*([^\s,，！!]+)/i);
        if (m) {
          matched = { id: 'custom_' + Date.now().toString(36), name: m[1], aliases: [], active: true, _temp: true };
        }
      }
      if (!matched) return null;
      return { supplement: matched, note: raw, confidence: hitVerb ? 0.9 : 0.7 };
    }

    function ensureSupplementTypeLabel() {
      try {
        if (typeof TYPE_LABEL === 'object' && TYPE_LABEL && !TYPE_LABEL.supplement) {
          TYPE_LABEL.supplement = '保健品';
        }
      } catch (_) {}
    }

    function renderHomeSupChip(host) {
      ensurePlaySupState();
      ensureSupplementTypeLabel();
      if (!host) return;
      let chip = document.getElementById('home-sup-chip');
      if (!chip) {
        chip = document.createElement('div');
        chip.className = 'home-sup-chip';
        chip.id = 'home-sup-chip';
        host.appendChild(chip);
      }
      const cat = catalog();
      const taken = takenMapToday();
      const ok = cat.filter(s => taken[s.id]);
      const miss = cat.filter(s => !taken[s.id]);
      chip.innerHTML = `
        <span>💊 今日保健品</span>
        <span class="ok">已食 ${ok.length}/${cat.length}</span>
        ${miss.length ? `<span class="miss">未食：${miss.map(s => s.name).slice(0, 3).join('、')}${miss.length > 3 ? '…' : ''}</span>` : '<span class="ok">全部打勾！</span>'}
        <button type="button" class="btn btn-ghost btn-sm" id="btn-home-sup">去記錄</button>`;
      const btn = chip.querySelector('#btn-home-sup');
      if (btn) btn.onclick = () => {
        if (typeof showPage === 'function') showPage('today');
        const panel = document.getElementById('ffl-sup-panel');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        else renderSupplementsPanel();
      };
    }

    function renderSupplementsPanel() {
      ensurePlaySupState();
      ensureSupplementTypeLabel();
      const page = document.getElementById('page-today');
      if (!page) return;
      let panel = document.getElementById('ffl-sup-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'card page-supplements';
        panel.id = 'ffl-sup-panel';
        const hero = document.getElementById('home-summary-card');
        if (hero && hero.parentNode === page) hero.insertAdjacentElement('afterend', panel);
        else page.appendChild(panel);
      }
      const cat = catalog();
      const taken = takenMapToday();
      const hist = supplementRecords().slice().sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 14);
      panel.innerHTML = `
        <div class="card-title"><span>💊 每日保健品</span>
          <button type="button" class="btn btn-ghost btn-sm" id="sup-toggle-pub-default">記錄預設${state.meta.supDefaultPublic ? '公開' : '私密'}</button>
        </div>
        <p class="hint" style="margin:0 0 8px">一鍵勾選今日已服用 · 對話可輸入「吃了維他命D」· 不影響其他打卡</p>
        <div class="sup-checklist" id="sup-checklist">
          ${cat.map(s => {
            const rec = taken[s.id];
            return `<div class="sup-row">
              <input type="checkbox" id="sup-ck-${s.id}" data-sup="${s.id}" ${rec ? 'checked' : ''}>
              <label for="sup-ck-${s.id}">${s.name}</label>
              <span class="sup-time">${rec ? (rec.timestamp || '').slice(9) : '—'}</span>
            </div>`;
          }).join('') || '<p class="hint">未有保健品，下面加入</p>'}
        </div>
        <div class="sup-manage-row">
          <input id="sup-new-name" placeholder="新增保健品名稱" maxlength="40">
          <button type="button" class="btn btn-secondary btn-sm" id="sup-add">加入</button>
        </div>
        <div style="margin-top:10px">
          <div class="card-title" style="font-size:.85rem">最近記錄</div>
          <div id="sup-hist" style="font-size:.78rem;color:var(--muted)">
            ${hist.map(r => `<div>${r.timestamp} · ${(r.data && r.data.name) || '—'} · ${r.isPublic ? '公開' : '私密'}</div>`).join('') || '暫無'}
          </div>
        </div>`;
      panel.querySelector('#sup-checklist').onchange = (e) => {
        const ck = e.target.closest('[data-sup]');
        if (!ck) return;
        const id = ck.getAttribute('data-sup');
        if (ck.checked) {
          markSupplementTaken(id, { isPublic: !!state.meta.supDefaultPublic });
        } else {
          // remove today's record for this id
          const ymd = todayYmd();
          state.records = (state.records || []).filter(r => !(
            r.userId === currentUser && r.recordType === 'supplement' &&
            (r.timestamp || '').slice(0, 8) === ymd && r.data && r.data.supplementId === id
          ));
          saveState();
          if (typeof toast === 'function') toast('已取消今日打勾', 'success');
        }
        renderSupplementsPanel();
        renderHomeSupChip(document.getElementById('home-summary-card') || page);
      };
      panel.querySelector('#sup-add').onclick = () => {
        const name = (document.getElementById('sup-new-name').value || '').trim();
        if (!name) return;
        ensurePlaySupState();
        const id = 'sup_' + Date.now().toString(36);
        state.meta.supplementsCatalog.push({ id, name, aliases: [name.toLowerCase()], active: true });
        saveState();
        renderSupplementsPanel();
      };
      panel.querySelector('#sup-toggle-pub-default').onclick = () => {
        state.meta.supDefaultPublic = !state.meta.supDefaultPublic;
        saveState();
        renderSupplementsPanel();
      };
    }

    // Chat parse hook for supplements
    function hookChatForSupplements() {
      if (typeof window.__fflSupChatHooked) return;
      window.__fflSupChatHooked = true;
      // wrap food_quick / send if present: intercept before draft when parse hits
      const tryIntercept = (text) => {
        const parsed = parseSupplementText(text);
        if (!parsed) return false;
        if (parsed.supplement._temp) {
          ensurePlaySupState();
          state.meta.supplementsCatalog.push({
            id: parsed.supplement.id,
            name: parsed.supplement.name,
            aliases: [parsed.supplement.name.toLowerCase()],
            active: true
          });
          saveState();
        }
        markSupplementTaken(parsed.supplement.id || parsed.supplement.id, {
          isPublic: !!state.meta.supDefaultPublic,
          note: parsed.note
        });
        renderSupplementsPanel();
        renderHomeSupChip(document.getElementById('home-summary-card'));
        return true;
      };
      // expose for other send paths
      window.FFL_Supplements = {
        parse: parseSupplementText,
        mark: markSupplementTaken,
        tryIntercept,
        renderPanel: renderSupplementsPanel
      };
      // hook send button lightly
      const bind = () => {
        const send = document.getElementById('btn-chat-send') || document.getElementById('chat-send');
        const input = document.getElementById('chat-input');
        if (!send || send.dataset.supBound) return;
        send.dataset.supBound = '1';
        send.addEventListener('click', (e) => {
          const text = (input && input.value) || '';
          if (parseSupplementText(text) && /(食咗|吃了|飲咗|保健品|took)/i.test(text)) {
            // let normal flow also run; also mark
            setTimeout(() => tryIntercept(text), 0);
          }
        }, true);
      };
      bind();
      setTimeout(bind, 500);
    }

    // Patch renderHomeHero after it exists
    function enhanceHomeHeroPlay() {
      const card = document.getElementById('home-summary-card');
      if (!card) return;
      try {
        if (typeof bindPlayActions === 'function') {
          const bar = card.querySelector('#pet-play-bar');
          if (bar) { delete bar.dataset.bound; delete bar.dataset.amp; }
          bindPlayActions(card);
        }
      } catch (e) { console.warn(e); }
      renderHomeSupChip(card);
      renderSupplementsPanel();
      ensurePlaySupState();
      applyOutfitToSvgs(state.meta.play.wearing.outfitId, state.meta.play.wearing.accessoryId);
    }

    if (typeof renderHomeHero === 'function') {
      const _rh = renderHomeHero;
      renderHomeHero = function() {
        _rh();
        try { enhanceHomeHeroPlay(); } catch (e) { console.warn('enhanceHomeHeroPlay', e); }
      };
    }
    if (typeof renderPlayPanel === 'function') {
      const _rp = renderPlayPanel;
      renderPlayPanel = function() {
        _rp();
        try {
          enhanceHomeHeroPlay();
        } catch (_) {}
      };
    }

    // TYPE in forms / filters if list exists
    try {
      if (typeof recordTypes !== 'undefined' && Array.isArray(recordTypes) && !recordTypes.includes('supplement')) {
        recordTypes.push('supplement');
      }
    } catch (_) {}

    function bootPlaySup() {
      try {
        ensurePlaySupState();
        unlockOutfitsByProgress();
        ensureSupplementTypeLabel();
        hookChatForSupplements();
        if (currentUser) {
          enhanceHomeHeroPlay();
          renderSupplementsPanel();
        }
        // gear quick link
        const menu = document.getElementById('hdr-quick-menu');
        if (menu && !document.getElementById('hq-go-sup')) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'hq-link';
          b.id = 'hq-go-sup';
          b.textContent = '💊 保健品';
          b.onclick = () => {
            document.getElementById('hdr-quick-backdrop')?.classList.remove('open');
            menu.classList.remove('open');
            renderSupplementsPanel();
            document.getElementById('ffl-sup-panel')?.scrollIntoView({ behavior: 'smooth' });
          };
          menu.appendChild(b);
        }
      } catch (e) { console.warn('bootPlaySup', e); }
    }

    if (typeof bootBodyCompHome === 'function') {
      const _b = bootBodyCompHome;
      bootBodyCompHome = function() { _b(); bootPlaySup(); };
    }
    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(bootPlaySup, 'playSup');
    else { setTimeout(bootPlaySup, 80); }
    window.FFL_PlayAmp = { wearOutfit, saveCurrentLook, renderWardrobeUI, OUTFITS };
  })();


  /* ========== BloomBody polish: 保健品／OCR／4人圈子／食物確認／護膚變靚 ========== */
  (function injectPolishSupOcrCircleBeauty() {
    const BEAUTY_AREAS = ['面', '眼周', '唇', '頸', '身體', '防曬', '其他'];
    const BEAUTY_TYPES = ['護膚', '護眼', '變靚／彩妝', '防曬', '醫美護理', '其他'];

    // ---- TYPE_LABEL / filters ----
    function ensureExtraTypes() {
      try {
        if (typeof TYPE_LABEL === 'object' && TYPE_LABEL) {
          if (!TYPE_LABEL.supplement) TYPE_LABEL.supplement = '保健品';
          if (!TYPE_LABEL.beauty) TYPE_LABEL.beauty = '護膚護眼／變靚';
          if (!TYPE_LABEL.period) TYPE_LABEL.period = '經期';
        }
      } catch (_) {}
      // filter select on list page
      const sel = document.getElementById('filter-type') || document.querySelector('select[name="filterType"], #list-filter-type, #filter-record-type');
      if (sel && !sel.querySelector('option[value="beauty"]')) {
        sel.insertAdjacentHTML('beforeend', '<option value="beauty">護膚護眼／變靚</option>');
      }
      if (sel && !sel.querySelector('option[value="supplement"]')) {
        sel.insertAdjacentHTML('beforeend', '<option value="supplement">保健品</option>');
      }
      // chat type switcher if any
      document.querySelectorAll('[data-draft-type], .draft-type-sel, #draft-type').forEach(el => {
        if (el.tagName === 'SELECT' && !el.querySelector('option[value="beauty"]')) {
          el.insertAdjacentHTML('beforeend', '<option value="beauty">護膚護眼／變靚</option>');
        }
      });
    }

    // ---- Supplements polish ----
    function ensureSupMeta() {
      if (typeof ensureAuthAndMeta === 'function') ensureAuthAndMeta();
      if (!state.meta) state.meta = {};
      if (!Array.isArray(state.meta.supplementsCatalog)) {
        state.meta.supplementsCatalog = [
          { id: 'vd', name: '維他命D', aliases: ['維他命d', 'vitamin d', 'vd'], active: true },
          { id: 'omega', name: 'Omega-3', aliases: ['omega', '魚油'], active: true },
          { id: 'mag', name: '鎂', aliases: ['鎂', 'magnesium'], active: true },
          { id: 'multi', name: '綜合維他命', aliases: ['綜合', 'multi'], active: true }
        ];
      }
      if (state.meta.supRemindTime == null) state.meta.supRemindTime = '';
      if (state.meta.supRemindEnabled == null) state.meta.supRemindEnabled = false;
    }

    function polishRenderSupplementsPanel() {
      ensureSupMeta();
      ensureExtraTypes();
      const page = document.getElementById('page-today');
      if (!page) return;
      let panel = document.getElementById('ffl-sup-panel');
      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'card page-supplements';
        panel.id = 'ffl-sup-panel';
        const hero = document.getElementById('home-summary-card');
        if (hero && hero.parentNode === page) hero.insertAdjacentElement('afterend', panel);
        else page.appendChild(panel);
      }
      const cat = (state.meta.supplementsCatalog || []).filter(s => s.active !== false);
      const taken = (typeof window.FFL_Supplements !== 'undefined' && FFL_Supplements.parse)
        ? null : null;
      // reuse taken map logic
      const ymd = typeof todayKey === 'function' ? todayKey() : '';
      const takenMap = {};
      (typeof myRecords === 'function' ? myRecords() : []).filter(r => r.recordType === 'supplement').forEach(r => {
        if ((r.timestamp || '').slice(0, 8) !== ymd) return;
        const id = r.data && r.data.supplementId;
        if (id) takenMap[id] = r;
      });
      const hist = (typeof myRecords === 'function' ? myRecords() : [])
        .filter(r => r.recordType === 'supplement')
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 14);

      panel.innerHTML = `
        <div class="card-title"><span>💊 每日保健品</span>
          <button type="button" class="btn btn-ghost btn-sm" id="sup-toggle-pub-default">記錄預設${state.meta.supDefaultPublic ? '公開' : '私密'}</button>
        </div>
        <div class="sup-remind-row">
          <label><input type="checkbox" id="sup-remind-on" ${state.meta.supRemindEnabled ? 'checked' : ''}> 每日提醒</label>
          <input type="time" id="sup-remind-time" value="${state.meta.supRemindTime || '09:00'}">
          <button type="button" class="btn btn-ghost btn-sm" id="sup-remind-save">儲存提醒</button>
          <span class="hint" id="sup-remind-hint"></span>
        </div>
        <p class="hint" style="margin:0 0 8px">自訂清單 · 對話可輸入「吃了維他命D」· 主頁顯示已服用／未服用</p>
        <div class="sup-checklist" id="sup-checklist">
          ${cat.map(s => {
            const rec = takenMap[s.id];
            return `<div class="sup-row" data-row="${s.id}">
              <input type="checkbox" id="sup-ck-${s.id}" data-sup="${s.id}" ${rec ? 'checked' : ''}>
              <label for="sup-ck-${s.id}">${escapeHtml(s.name)}</label>
              <span class="sup-time">${rec ? (rec.timestamp || '').slice(9) : '—'}</span>
              <span class="sup-edit-btns">
                <button type="button" data-sup-edit="${s.id}">改</button>
                <button type="button" data-sup-del="${s.id}">刪</button>
              </span>
            </div>`;
          }).join('') || '<p class="hint">未有保健品</p>'}
        </div>
        <div class="sup-manage-row">
          <input id="sup-new-name" placeholder="新增保健品名稱" maxlength="40">
          <input id="sup-new-alias" placeholder="別名（可選）" maxlength="40" style="max-width:120px">
          <button type="button" class="btn btn-secondary btn-sm" id="sup-add">加入</button>
        </div>
        <div style="margin-top:10px">
          <div class="card-title" style="font-size:.85rem">最近記錄</div>
          <div id="sup-hist" style="font-size:.78rem;color:var(--muted)">
            ${hist.map(r => `<div>${escapeHtml(r.timestamp)} · ${escapeHtml((r.data && r.data.name) || '—')} · ${r.isPublic ? '公開' : '私密'}</div>`).join('') || '暫無'}
          </div>
        </div>`;

      const markTaken = (id) => {
        if (window.FFL_Supplements && typeof FFL_Supplements.mark === 'function') {
          FFL_Supplements.mark(id, { isPublic: !!state.meta.supDefaultPublic });
        } else {
          const item = (state.meta.supplementsCatalog || []).find(x => x.id === id);
          if (!item) return;
          const d = new Date();
          const p = n => String(n).padStart(2, '0');
          const ts = `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
          state.records = state.records || [];
          state.records.push({
            id: typeof uid === 'function' ? uid() : 's' + Date.now(),
            recordId: typeof uid === 'function' ? uid() : 's' + Date.now(),
            ownerUser: currentUser,
            recordType: 'supplement',
            timestamp: ts,
            isPublic: !!state.meta.supDefaultPublic,
            data: { supplementId: item.id, name: item.name },
            tags: ['保健品']
          });
          saveState();
        }
      };

      panel.querySelector('#sup-checklist').onchange = (e) => {
        const ck = e.target.closest('[data-sup]');
        if (!ck || ck.tagName !== 'INPUT') return;
        const id = ck.getAttribute('data-sup');
        if (ck.checked) markTaken(id);
        else {
          state.records = (state.records || []).filter(r => !(
            (r.ownerUser === currentUser || r.userId === currentUser) &&
            r.recordType === 'supplement' &&
            (r.timestamp || '').slice(0, 8) === ymd &&
            r.data && r.data.supplementId === id
          ));
          saveState();
        }
        polishRenderSupplementsPanel();
        polishHomeSupChip();
        maybeNotifySupRemind();
      };
      panel.querySelector('#sup-checklist').onclick = (e) => {
        const ed = e.target.closest('[data-sup-edit]');
        const del = e.target.closest('[data-sup-del]');
        if (ed) {
          const id = ed.getAttribute('data-sup-edit');
          const item = (state.meta.supplementsCatalog || []).find(x => x.id === id);
          if (!item) return;
          const name = prompt('保健品名稱', item.name);
          if (name == null) return;
          const alias = prompt('別名（逗號分隔）', (item.aliases || []).join(','));
          if (name.trim()) item.name = name.trim();
          if (alias != null) item.aliases = alias.split(/[,，]/).map(s => s.trim()).filter(Boolean);
          saveState();
          polishRenderSupplementsPanel();
          polishHomeSupChip();
        }
        if (del) {
          const id = del.getAttribute('data-sup-del');
          if (!confirm('刪除此保健品？（不刪除歷史記錄）')) return;
          const item = (state.meta.supplementsCatalog || []).find(x => x.id === id);
          if (item) { item.active = false; saveState(); }
          polishRenderSupplementsPanel();
          polishHomeSupChip();
        }
      };
      panel.querySelector('#sup-add').onclick = () => {
        const name = (document.getElementById('sup-new-name').value || '').trim();
        const alias = (document.getElementById('sup-new-alias').value || '').trim();
        if (!name) return;
        state.meta.supplementsCatalog.push({
          id: 'sup_' + Date.now().toString(36),
          name,
          aliases: alias ? alias.split(/[,，]/).map(s => s.trim()).filter(Boolean).concat([name.toLowerCase()]) : [name.toLowerCase()],
          active: true
        });
        saveState();
        polishRenderSupplementsPanel();
      };
      panel.querySelector('#sup-toggle-pub-default').onclick = () => {
        state.meta.supDefaultPublic = !state.meta.supDefaultPublic;
        saveState();
        polishRenderSupplementsPanel();
      };
      panel.querySelector('#sup-remind-save').onclick = () => {
        state.meta.supRemindEnabled = !!document.getElementById('sup-remind-on').checked;
        state.meta.supRemindTime = document.getElementById('sup-remind-time').value || '09:00';
        saveState();
        scheduleSupRemind();
        const hint = document.getElementById('sup-remind-hint');
        if (hint) hint.textContent = state.meta.supRemindEnabled ? ('已設 ' + state.meta.supRemindTime + '（瀏覽器通知）') : '已關閉';
        toast(state.meta.supRemindEnabled ? '保健品提醒已開' : '已關提醒', 'success');
      };
      scheduleSupRemind();
    }

    function polishHomeSupChip() {
      ensureSupMeta();
      const host = document.getElementById('home-summary-card');
      if (!host) return;
      let chip = document.getElementById('home-sup-chip');
      if (!chip) {
        chip = document.createElement('div');
        chip.className = 'home-sup-chip';
        chip.id = 'home-sup-chip';
        host.appendChild(chip);
      }
      const cat = (state.meta.supplementsCatalog || []).filter(s => s.active !== false);
      const ymd = typeof todayKey === 'function' ? todayKey() : '';
      const takenMap = {};
      (typeof myRecords === 'function' ? myRecords() : []).filter(r => r.recordType === 'supplement').forEach(r => {
        if ((r.timestamp || '').slice(0, 8) === ymd && r.data && r.data.supplementId) takenMap[r.data.supplementId] = r;
      });
      const ok = cat.filter(s => takenMap[s.id]);
      const miss = cat.filter(s => !takenMap[s.id]);
      const due = isSupRemindDue() && miss.length;
      chip.classList.toggle('remind-due', !!due);
      chip.innerHTML = `
        <span>💊 今日保健品</span>
        <span class="ok">已食 ${ok.length}/${cat.length}</span>
        ${miss.length ? `<span class="miss">未食：${miss.map(s => s.name).slice(0, 3).join('、')}${miss.length > 3 ? '…' : ''}</span>` : '<span class="ok">全部打勾！</span>'}
        ${state.meta.supRemindEnabled ? `<span class="hint">⏰${state.meta.supRemindTime || ''}</span>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" id="btn-home-sup">管理</button>`;
      chip.querySelector('#btn-home-sup').onclick = () => {
        polishRenderSupplementsPanel();
        document.getElementById('ffl-sup-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
    }

    function isSupRemindDue() {
      ensureSupMeta();
      if (!state.meta.supRemindEnabled || !state.meta.supRemindTime) return false;
      const [h, m] = (state.meta.supRemindTime || '09:00').split(':').map(Number);
      const now = new Date();
      const mins = now.getHours() * 60 + now.getMinutes();
      return mins >= (h * 60 + (m || 0));
    }

    let _supRemindTimer = null;
    function scheduleSupRemind() {
      ensureSupMeta();
      if (_supRemindTimer) clearInterval(_supRemindTimer);
      if (!state.meta.supRemindEnabled) return;
      maybeNotifySupRemind();
      if (!(window.FFL_AuthGate ? FFL_AuthGate.isAuthed() : currentUser)) return;
      _supRemindTimer = (window.FFL_AuthGate ? FFL_AuthGate.trackInterval(maybeNotifySupRemind, 60000) : setInterval(maybeNotifySupRemind, 60000));
    }
    function maybeNotifySupRemind() {
      ensureSupMeta();
      if (!state.meta.supRemindEnabled || !isSupRemindDue()) return;
      const ymd = typeof todayKey === 'function' ? todayKey() : '';
      if (state.meta.supRemindLastDay === ymd) return;
      const cat = (state.meta.supplementsCatalog || []).filter(s => s.active !== false);
      const taken = new Set();
      (typeof myRecords === 'function' ? myRecords() : []).forEach(r => {
        if (r.recordType === 'supplement' && (r.timestamp || '').slice(0, 8) === ymd && r.data) taken.add(r.data.supplementId);
      });
      const miss = cat.filter(s => !taken.has(s.id));
      if (!miss.length) { state.meta.supRemindLastDay = ymd; saveState(); return; }
      const msg = '尚有保健品未打勾：' + miss.map(s => s.name).slice(0, 4).join('、');
      if (typeof toast === 'function') toast(msg, 'warn');
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('BloomBody 保健品', { body: msg });
          state.meta.supRemindLastDay = ymd;
          saveState();
        } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
          Notification.requestPermission().then(p => {
            if (p === 'granted') new Notification('BloomBody 保健品', { body: msg });
          });
        }
      } catch (_) {}
      polishHomeSupChip();
    }

    // Override previous panel render if present
    if (typeof window.FFL_Supplements === 'object') {
      window.FFL_Supplements.renderPanel = polishRenderSupplementsPanel;
    }

    // ---- Bodycomp OCR accuracy (InBody / LCSD / scale app patterns) ----
    function enhanceParseBodyComp() {
      if (typeof parseBodyCompText !== 'function' && !(window.FFL_BodyComp && FFL_BodyComp.parseBodyCompText)) return;
      const orig = (window.FFL_BodyComp && FFL_BodyComp.parseBodyCompText) || parseBodyCompText;
      const enhanced = function(text, hintSource) {
        const raw = String(text || '');
        let data = orig(raw, hintSource) || { source: hintSource || '家用磅' };
        if (!data || typeof data !== 'object') data = { source: hintSource || '家用磅' };
        function grab(re, key, force) {
          if (data[key] != null && !force) return;
          const m = raw.match(re);
          if (m) data[key] = +m[1];
        }
        // Scale app / radar style (Chinese compact)
        grab(/體重\s*[：: ]?\s*(\d{2,3}(?:\.\d{1,2})?)\s*kg/i, 'weight');
        grab(/BMI\s*[：: ]?\s*(\d{1,2}(?:\.\d{1,2})?)/i, 'bmi');
        grab(/(?:體脂率|体脂率|PBF|體脂肪率)\s*[：: ]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%?/i, 'bodyFat');
        grab(/(?:皮下脂肪|皮下脂)\s*[：: ]?\s*(\d{1,2}(?:\.\d{1,2})?)/i, 'subcutaneousFat');
        grab(/(?:內臟脂肪|內臟脂肪等級|VFL|VFA)\s*[：: ]?\s*(\d{1,2}(?:\.\d+)?)/i, 'visceralFat');
        grab(/(?:骨骼肌|骨骼肌量|SMM|Skeletal\s*Muscle)\s*[：: ]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*kg/i, 'smm');
        grab(/(?:肌肉量|肌肉重|肌肉)\s*[：: ]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*kg/i, 'muscle');
        grab(/(?:肌肉率|肌肉百分比)\s*[：: ]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%/i, 'musclePct');
        grab(/(?:骨量|骨礦物|BMC|Bone)\s*[：: ]?\s*(\d(?:\.\d{1,2})?)\s*kg/i, 'boneMass');
        grab(/(?:體水分|身體水分|TBW)\s*[：: ]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%?/i, 'water');
        grab(/(?:基礎代謝|基礎代謝率|BMR)\s*[：: ]?\s*(\d{3,4})\s*(?:kcal|大卡)?/i, 'bmr');
        grab(/(?:體年齡|體內年齡|身體年齡)\s*[：: ]?\s*(\d{2})/i, 'bodyAge');
        grab(/(?:得分|健康評分|InBody\s*Score)\s*[：: ]?\s*(\d{2,3})/i, 'score');
        grab(/(?:腰圍)\s*[：: ]?\s*(\d{2}(?:\.\d)?)\s*cm/i, 'waist');
        grab(/(?:臀圍)\s*[：: ]?\s*(\d{2}(?:\.\d)?)\s*cm/i, 'hip');
        grab(/(?:身高)\s*[：: ]?\s*(\d{2,3}(?:\.\d)?)\s*cm/i, 'height');
        // LCSD / InBody report bilingual
        grab(/Weight\s*[：: ]?\s*(\d{2,3}(?:\.\d{1,2})?)\s*kg/i, 'weight');
        grab(/PBF\s*[：: ]?\s*(\d{1,2}(?:\.\d{1,2})?)/i, 'bodyFat');
        grab(/SMM\s*[：: ]?\s*(\d{1,2}(?:\.\d{1,2})?)/i, 'smm');
        grab(/VFA\s*[：: ]?\s*(\d{1,3}(?:\.\d+)?)/i, 'visceralFat');
        grab(/FFM\s*[：: ]?\s*(\d{2,3}(?:\.\d{1,2})?)/i, 'fatFreeMass');
        grab(/BFM\s*[：: ]?\s*(\d{1,2}(?:\.\d{1,2})?)/i, 'fatMass');
        grab(/SMI\s*[：: ]?\s*(\d{1,2}(?:\.\d{1,2})?)/i, 'smi');
        // table-like "標籤 數字" without colon (scale screenshot)
        const loose = [
          [/體重\s+(\d{2,3}(?:\.\d{1,2})?)/, 'weight'],
          [/體脂\s+(\d{1,2}(?:\.\d{1,2})?)/, 'bodyFat'],
          [/肌肉\s+(\d{1,2}(?:\.\d{1,2})?)/, 'muscle'],
          [/水分\s+(\d{1,2}(?:\.\d{1,2})?)/, 'water'],
          [/內臟\s+(\d{1,2})/, 'visceralFat']
        ];
        loose.forEach(([re, key]) => grab(re, key));
        if (data.weight && data.height && data.bmi == null) {
          const m = data.height / 100;
          if (m > 0) data.bmi = +(data.weight / (m * m)).toFixed(1);
        }
        if (/康文|lcsd|體育|康樂/i.test(raw)) data.source = '康文署報告';
        else if (/inbody/i.test(raw)) data.source = 'InBody';
        else if (/屋企|體脂磅|智能磅|Yolanda|Huawei|小米/i.test(raw)) data.source = '家用磅';
        data._ocrEnhanced = true;
        data._fieldCount = Object.keys(data).filter(k => !k.startsWith('_') && k !== 'source' && data[k] != null).length;
        return data;
      };
      try { parseBodyCompText = enhanced; } catch (_) {}
      if (window.FFL_BodyComp) window.FFL_BodyComp.parseBodyCompText = enhanced;

      // Better confirm UX: show parsed field grid before save on body draft
      if (typeof renderDraftConfirmCard === 'function') {
        const _rdc = renderDraftConfirmCard;
        renderDraftConfirmCard = function(draft) {
          _rdc(draft);
          try {
            if (!draft || draft.recordType !== 'body') return;
            const card = document.querySelector('.draft-confirm-card, #draft-confirm-card, .chat-draft-card');
            if (!card || card.querySelector('.body-ocr-confirm')) return;
            const d = draft.data || {};
            const keys = ['weight','bmi','bodyFat','muscle','smm','water','visceralFat','bmr','score','bodyAge','height'];
            const rows = keys.filter(k => d[k] != null).map(k => `<div><strong>${k}</strong> ${d[k]}</div>`).join('');
            if (!rows) return;
            const box = document.createElement('div');
            box.className = 'body-ocr-confirm';
            box.innerHTML = `<div>📋 體成分辨認預覽（參考，非診斷）· 來源 ${escapeHtml(d.source || '—')} · ${d._fieldCount || keys.filter(k=>d[k]!=null).length} 欄</div>
              <div class="boc-grid">${rows}</div>
              <p class="hint" style="margin:6px 0 0">可改數字後再確認。對齊家用磅／InBody／康文署報告欄位。</p>`;
            card.appendChild(box);
          } catch (e) { console.warn('ocr confirm ux', e); }
        };
      }
    }

    // ---- 4-girl circle / competition strip (real LocalStorage users) ----
    function circleUsers() {
      const names = Object.keys(state.users || {}).filter(u => {
        const role = state.users[u] && state.users[u].role;
        return role !== 'admin' || u === currentUser;
      });
      // Prefer non-admin; include up to 4: current + others
      const others = names.filter(u => u !== currentUser);
      const list = [currentUser].concat(others).filter(Boolean);
      // unique
      return [...new Set(list)].slice(0, 4);
    }

    function publicRecs(user) {
      return (state.records || []).filter(r => {
        const owner = r.ownerUser || r.userId;
        return owner === user && r.isPublic === true;
      });
    }

    function weekKeys() {
      if (typeof weekBounds === 'function') return weekBounds(0);
      const now = new Date();
      const day = now.getDay();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      const p = n => String(n).padStart(2, '0');
      const key = d => `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}`;
      const end = new Date(start); end.setDate(start.getDate() + 6);
      return { startKey: key(start), endKey: key(end) };
    }

    function userWeekScore(user) {
      const wb = weekKeys();
      const recs = publicRecs(user).filter(r => {
        const k = (r.timestamp || '').slice(0, 8);
        return k >= wb.startKey && k <= wb.endKey;
      });
      const ex = recs.filter(r => r.recordType === 'exercise').reduce((s, r) => s + (+((r.data && r.data.minutes) || 0)), 0);
      const days = new Set(recs.map(r => (r.timestamp || '').slice(0, 8)));
      return { exerciseMin: ex, publicDays: days.size, logs: recs.length };
    }

    function renderHomeCircleStrip() {
      const host = document.getElementById('home-summary-card');
      if (!host || !currentUser) return;
      let strip = document.getElementById('home-circle-strip');
      if (!strip) {
        strip = document.createElement('div');
        strip.className = 'home-circle-strip';
        strip.id = 'home-circle-strip';
        host.appendChild(strip);
      }
      const users = circleUsers();
      const goal = (state.meta && state.meta.challenge && state.meta.challenge.weeklyGoalValue) || 150;
      const goalType = (state.meta && state.meta.challenge && state.meta.challenge.weeklyGoalType) || 'exercise_min';
      const rows = users.map(u => {
        const sc = userWeekScore(u);
        let pct = 0, label = '';
        if (goalType === 'streak') {
          pct = Math.min(100, Math.round(100 * sc.publicDays / (goal || 7)));
          label = `公開 ${sc.publicDays} 日`;
        } else {
          pct = Math.min(100, Math.round(100 * sc.exerciseMin / (goal || 150)));
          label = `${sc.exerciseMin} 分`;
        }
        return { user: u, pct, label, sc };
      }).sort((a, b) => b.pct - a.pct || b.sc.logs - a.sc.logs);

      strip.innerHTML = `
        <div class="cs-title">
          <span>👥 本週圈子進度（最多 4 人 · 只計公開）</span>
          <button type="button" class="btn btn-ghost btn-sm" id="cs-go-circle">圈子</button>
        </div>
        ${rows.length < 2 ? '<p class="hint" style="margin:0">圈子預設空白。請朋友註冊後用邀請碼加入，並設公開記錄，就會一齊上榜。</p>' : ''}
        ${rows.map((r, i) => `
          <div class="cs-row">
            <span class="cs-name">${i === 0 && r.sc.logs ? '👑 ' : ''}${escapeHtml(r.user)}${r.user === currentUser ? '（我）' : ''}</span>
            <div class="cs-bar"><i class="${r.user === currentUser ? 'me' : ''}" style="width:${r.pct}%"></i></div>
            <span class="cs-meta">${escapeHtml(r.label)} · ${r.pct}%</span>
          </div>`).join('')}
        <p class="hint" style="margin:6px 0 0">數據來自本機 LocalStorage 公開記錄；私密記錄不計入榜單。</p>`;
      strip.querySelector('#cs-go-circle').onclick = () => {
        if (typeof showPage === 'function') showPage('circle');
        else document.querySelector('[data-nav="circle"]')?.click();
        try { if (typeof renderChallengeCard === 'function') renderChallengeCard(); } catch (_) {}
      };
      // also refresh challenge card if present
      try { if (typeof renderChallengeCard === 'function') renderChallengeCard(); } catch (_) {}
    }

    // Expand duoUsers used by challenge to up to 4
    if (typeof duoUsers === 'function') {
      duoUsers = function() {
        const list = circleUsers();
        return { me: currentUser, partner: list.find(u => u !== currentUser) || null, members: list };
      };
    }
    if (typeof buildLeaderboard === 'function') {
      const _bl = buildLeaderboard;
      buildLeaderboard = function() {
        const base = _bl();
        try {
          if (typeof ensureChallengeState === 'function') ensureChallengeState();
          const wb = typeof weekBounds === 'function' ? weekBounds(0) : weekKeys();
          const members = circleUsers();
          const rows = members.map(u => {
            const ex = typeof weekExerciseMin === 'function' ? weekExerciseMin(u, wb) : userWeekScore(u).exerciseMin;
            const st = typeof streakFromPublic === 'function' ? streakFromPublic(u) : userWeekScore(u).publicDays;
            const wd = typeof weightDeltaPublic === 'function' ? weightDeltaPublic(u, wb) : null;
            return { user: u, exerciseMin: ex, streak: st, weightDelta: wd };
          });
          const byEx = [...rows].sort((a, b) => b.exerciseMin - a.exerciseMin);
          const bySt = [...rows].sort((a, b) => b.streak - a.streak);
          const byW = [...rows].sort((a, b) => {
            const av = a.weightDelta == null ? 999 : a.weightDelta;
            const bv = b.weightDelta == null ? 999 : b.weightDelta;
            return av - bv;
          });
          rows.forEach(r => {
            r.rankEx = byEx.findIndex(x => x.user === r.user) + 1;
            r.rankSt = bySt.findIndex(x => x.user === r.user) + 1;
            r.rankW = byW.findIndex(x => x.user === r.user) + 1;
          });
          return { wb, rows, challenge: state.meta.challenge };
        } catch (e) {
          console.warn(e);
          return base;
        }
      };
    }

    // ---- Beauty / skincare category ----
    function ensureBeautyForm() {
      ensureExtraTypes();
      if (document.getElementById('form-beauty')) return;
      const host = document.querySelector('.forms-wrap, #forms-host, #page-form, #form-panels') || document.getElementById('page-today');
      // put near other forms
      const formParent = document.getElementById('form-note')?.parentElement || document.getElementById('form-diet')?.parentElement;
      if (!formParent) return;
      const form = document.createElement('form');
      form.className = 'form-panel card';
      form.id = 'form-beauty';
      form.setAttribute('data-type', 'beauty');
      form.innerHTML = `
        <div class="card-title">✨ 護膚護眼／變靚</div>
        <input type="hidden" name="editId" value="">
        <div class="form-group"><label>時間</label><input name="timestamp" type="text" placeholder="YYYYMMDD HH:MM:SS"></div>
        <div class="form-group"><label>類型</label>
          <select name="beautyType">${BEAUTY_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}</select>
        </div>
        <div class="form-group"><label>產品</label><input name="product" placeholder="例如：維他命C精華／人工淚液" maxlength="80"></div>
        <div class="form-group"><label>部位</label>
          <div class="beauty-areas">${BEAUTY_AREAS.map(a => `<label><input type="checkbox" name="area" value="${a}"> ${a}</label>`).join('')}</div>
        </div>
        <div class="form-group"><label>效果／備註</label><textarea name="notes" rows="2" placeholder="保濕、眼乾紓緩…"></textarea></div>
        <div class="form-group"><label><input type="checkbox" name="isPublic"> 允許搭檔查看</label></div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">儲存</button>
          <button type="button" class="btn btn-ghost" data-cancel-form>取消</button>
        </div>
        <p class="hint">可加相片（對話打卡）；此非醫療建議。</p>`;
      formParent.appendChild(form);

      // type chip / nav to open form
      const typeBar = document.querySelector('.type-tabs, #type-tabs, .form-type-bar');
      if (typeBar && !typeBar.querySelector('[data-form="beauty"]')) {
        typeBar.insertAdjacentHTML('beforeend', '<button type="button" class="chip" data-form="beauty">✨變靚</button>');
      }
      // quick entry on today
      let tip = document.getElementById('home-beauty-tip');
      // submit
      form.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const areas = [...form.querySelectorAll('input[name="area"]:checked')].map(x => x.value);
        const ts = (fd.get('timestamp') || '').trim() || (typeof nowTs === 'function' ? nowTs() : '');
        const isPublic = !!form.elements.isPublic.checked;
        const data = {
          beautyType: fd.get('beautyType'),
          product: (fd.get('product') || '').trim(),
          areas,
          notes: (fd.get('notes') || '').trim()
        };
        const editId = form.elements.editId.value;
        if (editId) {
          const rec = (state.records || []).find(r => (r.recordId || r.id) === editId);
          if (rec) {
            rec.data = data;
            rec.timestamp = ts;
            rec.isPublic = isPublic;
            rec.updatedAt = typeof nowTs === 'function' ? nowTs() : ts;
          }
        } else {
          const id = typeof uid === 'function' ? uid() : 'b' + Date.now();
          state.records = state.records || [];
          state.records.push({
            recordId: id, id, ownerUser: currentUser,
            recordType: 'beauty', timestamp: ts, isPublic,
            data, remark: data.notes || data.product,
            tags: ['護膚變靚'],
            source: { channel: 'form', rawText: '', confidence: 1 }
          });
        }
        saveState();
        toast('已記護膚／變靚 ✨', 'success');
        form.reset();
        form.elements.editId.value = '';
        if (typeof showPage === 'function') showPage('today');
        renderHomeBeautyTip();
      };
      form.querySelector('[data-cancel-form]').onclick = () => {
        if (typeof showPage === 'function') showPage('today');
      };
    }

    function parseBeautyText(text) {
      const raw = (text || '').trim();
      if (!raw) return null;
      const hit = /(護膚|護眼|精華|面霜|防曬|眼霜|面膜|變靚|化妝|塗咗|擦咗|用咗|skincare|serum|sunscreen|眼乾)/i.test(raw);
      if (!hit) return null;
      let beautyType = '護膚';
      if (/護眼|眼霜|人工淚|眼乾|滴眼/i.test(raw)) beautyType = '護眼';
      else if (/防曬|sunscreen|SPF/i.test(raw)) beautyType = '防曬';
      else if (/化妝|粉底|口紅|變靚|彩妝/i.test(raw)) beautyType = '變靚／彩妝';
      const areas = BEAUTY_AREAS.filter(a => raw.includes(a));
      if (/眼/.test(raw) && !areas.includes('眼周')) areas.push('眼周');
      if (/面|臉/.test(raw) && !areas.includes('面')) areas.push('面');
      let product = '';
      const m = raw.match(/(?:用咗|塗咗|擦咗|用了|塗了)\s*([^\s,，！!]{1,30})/);
      if (m) product = m[1];
      return { beautyType, product, areas, notes: raw, confidence: 0.75 };
    }

    function renderHomeBeautyTip() {
      const host = document.getElementById('home-summary-card');
      if (!host) return;
      let tip = document.getElementById('home-beauty-tip');
      if (!tip) {
        tip = document.createElement('div');
        tip.className = 'home-beauty-tip';
        tip.id = 'home-beauty-tip';
        host.appendChild(tip);
      }
      const ymd = typeof todayKey === 'function' ? todayKey() : '';
      const todayB = (typeof myRecords === 'function' ? myRecords() : [])
        .filter(r => r.recordType === 'beauty' && (r.timestamp || '').slice(0, 8) === ymd);
      const last = (typeof myRecords === 'function' ? myRecords() : [])
        .filter(r => r.recordType === 'beauty')
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
      tip.innerHTML = `
        <strong>✨ 護膚護眼／變靚</strong>
        ${todayB.length ? ` · 今日 ${todayB.length} 次：${todayB.map(r => (r.data && r.data.product) || r.data?.beautyType || '—').slice(0, 2).join('、')}`
          : ' · 今日未記'}
        ${last ? `<div class="hint" style="margin:4px 0 0">上次：${escapeHtml(last.timestamp)} ${(last.data && last.data.product) || ''}</div>` : ''}
        <div style="margin-top:6px">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-home-beauty">記一筆</button>
        </div>`;
      tip.querySelector('#btn-home-beauty').onclick = () => {
        ensureBeautyForm();
        if (typeof showForm === 'function') showForm('beauty');
        else {
          document.querySelectorAll('.form-panel').forEach(f => f.classList.remove('active'));
          document.getElementById('form-beauty')?.classList.add('active');
        }
      };
    }

    function hookBeautyChat() {
      if (window.__fflBeautyHooked) return;
      window.__fflBeautyHooked = true;
      const bind = () => {
        const send = document.getElementById('btn-chat-send') || document.getElementById('chat-send');
        const input = document.getElementById('chat-input');
        if (!send || send.dataset.beautyBound) return;
        send.dataset.beautyBound = '1';
        send.addEventListener('click', () => {
          const text = (input && input.value) || '';
          const parsed = parseBeautyText(text);
          if (!parsed) return;
          // If there's already a pending draft flow, enrich; else soft-create draft-like toast path
          setTimeout(() => {
            try {
              if (chatPendingDraft && chatPendingDraft.recordType === 'beauty') {
                chatPendingDraft.data = Object.assign({}, chatPendingDraft.data || {}, parsed);
              } else if (chatPendingDraft && /(護膚|護眼|精華|防曬)/i.test(text)) {
                chatPendingDraft.recordType = 'beauty';
                chatPendingDraft.data = Object.assign({}, parsed);
                chatPendingDraft.summary = '護膚／變靚：' + (parsed.product || parsed.beautyType);
                if (typeof renderDraftConfirmCard === 'function') renderDraftConfirmCard(chatPendingDraft);
              }
            } catch (_) {}
          }, 30);
        }, true);
      };
      bind();
      setTimeout(bind, 400);

      // stub draft builder hook
      if (typeof buildGenericDraft === 'function') {
        const _bg = buildGenericDraft;
        buildGenericDraft = function(type, attachments, rawText) {
          if (type === 'beauty') {
            const p = parseBeautyText(rawText) || { beautyType: '護膚', product: '', areas: [], notes: rawText || '' };
            return {
              recordType: 'beauty',
              summary: '護膚／變靚：' + (p.product || p.beautyType),
              conf: p.confidence || 0.7,
              data: p,
              attachments: attachments || [],
              rawText: rawText || ''
            };
          }
          return _bg(type, attachments, rawText);
        };
      }
      // classify helper: if text looks beauty, prefer beauty type in auto classify if exists
      if (typeof classifyChatText === 'function') {
        const _cc = classifyChatText;
        classifyChatText = function(text) {
          if (parseBeautyText(text)) return 'beauty';
          return _cc(text);
        };
      }
    }

    // list summary line
    if (typeof recordSummaryLine === 'function') {
      const _rs = recordSummaryLine;
      recordSummaryLine = function(r) {
        if (r && r.recordType === 'beauty') {
          const d = r.data || {};
          return `✨ ${d.beautyType || '護膚'} ${d.product || ''} ${(d.areas || []).join('/')}`;
        }
        if (r && r.recordType === 'supplement') {
          return `💊 ${(r.data && r.data.name) || '保健品'}`;
        }
        return _rs(r);
      };
    }

    // ---- Food photo confirm stability ----
    function stabilizeFoodConfirm() {
      if (typeof confirmDraftSave !== 'function' && typeof saveDraftConfirm !== 'function') {
        // hook render + cancel paths
      }
      // Preserve attachments when switching draft type
      if (typeof renderDraftConfirmCard === 'function') {
        const _r = renderDraftConfirmCard;
        renderDraftConfirmCard = function(draft) {
          try {
            if (draft && draft.attachments && !draft._attachBackup) {
              draft._attachBackup = draft.attachments.slice();
            }
            if (draft && (!draft.attachments || !draft.attachments.length) && draft._attachBackup) {
              draft.attachments = draft._attachBackup.slice();
            }
            if (draft && draft.recordType === 'diet') {
              draft._stableFood = true;
            }
          } catch (_) {}
          _r(draft);
          try {
            const card = document.querySelector('.draft-confirm-card, #draft-confirm-card, .chat-draft-card');
            if (card && draft && draft._stableFood) card.classList.add('stable-food');
            // ensure type change doesn't wipe attachments
            const typeSel = card && card.querySelector('select, #draft-type, [data-draft-type]');
            if (typeSel && !typeSel.dataset.stableBound) {
              typeSel.dataset.stableBound = '1';
              typeSel.addEventListener('change', () => {
                if (chatPendingDraft && chatPendingDraft._attachBackup) {
                  chatPendingDraft.attachments = chatPendingDraft._attachBackup.slice();
                }
              });
            }
          } catch (_) {}
        };
      }
      // After save, clear pending cleanly; on error keep draft
      if (typeof saveConfirmedDraft === 'function') {
        const _s = saveConfirmedDraft;
        saveConfirmedDraft = function() {
          const backup = chatPendingDraft ? Object.assign({}, chatPendingDraft, {
            attachments: (chatPendingDraft.attachments || []).slice(),
            data: Object.assign({}, chatPendingDraft.data || {})
          }) : null;
          try {
            const r = _s.apply(this, arguments);
            return r;
          } catch (e) {
            console.warn('saveConfirmedDraft', e);
            chatPendingDraft = backup;
            if (typeof toast === 'function') toast('確認儲存失敗，草稿仍在，請再試', 'warn');
            if (backup && typeof renderDraftConfirmCard === 'function') renderDraftConfirmCard(backup);
            throw e;
          }
        };
      }
      // Also wrap common name confirmDraftFromCard
      ['confirmDraftFromUI', 'onConfirmDraft', 'submitChatDraft'].forEach(fn => {
        if (typeof window[fn] === 'function') {
          const _f = window[fn];
          window[fn] = function() {
            try { return _f.apply(this, arguments); }
            catch (e) {
              if (typeof toast === 'function') toast('確認失敗，請檢查欄位', 'warn');
              console.warn(fn, e);
            }
          };
        }
      });
    }

    function bootPolish() {
      try {
        ensureExtraTypes();
        ensureSupMeta();
        ensureBeautyForm();
        enhanceParseBodyComp();
        stabilizeFoodConfirm();
        hookBeautyChat();
        if (currentUser) {
          polishRenderSupplementsPanel();
          polishHomeSupChip();
          renderHomeCircleStrip();
          renderHomeBeautyTip();
          scheduleSupRemind();
        }
        // gear link
        const menu = document.getElementById('hdr-quick-menu');
        if (menu && !document.getElementById('hq-go-beauty')) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'hq-link'; b.id = 'hq-go-beauty';
          b.textContent = '✨ 護膚變靚';
          b.onclick = () => {
            document.getElementById('hdr-quick-backdrop')?.classList.remove('open');
            menu.classList.remove('open');
            ensureBeautyForm();
            if (typeof showForm === 'function') showForm('beauty');
          };
          menu.appendChild(b);
        }
      } catch (e) { console.warn('bootPolish', e); }
    }

    // Hook home hero / today
    if (typeof renderHomeHero === 'function') {
      const _h = renderHomeHero;
      renderHomeHero = function() {
        _h();
        try {
          polishHomeSupChip();
          renderHomeCircleStrip();
          renderHomeBeautyTip();
          polishRenderSupplementsPanel();
        } catch (e) { console.warn(e); }
      };
    }
    if (typeof renderToday === 'function') {
      const _t = renderToday;
      renderToday = function() {
        _t();
        try { bootPolish(); } catch (_) {}
      };
    }

    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(bootPolish, 'polish');
    else { setTimeout(bootPolish, 100); }
    window.FFL_Polish = {
      polishRenderSupplementsPanel, renderHomeCircleStrip, renderHomeBeautyTip,
      parseBeautyText, enhanceParseBodyComp
    };
  })();


  /* ========== BloomBody pro analysis + 橘貓 + 運動評估 ========== */
  (function injectProAnalysisOrangeCat() {
    // ---- Professional reference helpers (估算／非醫療診斷) ----
    const PRO_DISCLAIMER =
      '專業參考框架 · 參考估算 · 非執業醫療／非持牌診症。' +
      '心率：ACSM %HRmax（Tanaka）；熱量：Compendium MET×kg×h；訓練用語參考 NSCA。' +
      'BMI：WHO／亞洲切點；體脂：ACE 教育範圍。西醫紅旗提示非急症分流；中醫養生僅參考非診症。' +
      '詳見應用內專業參考說明。';

    function ensureProfileFields() {
      if (!state.meta) state.meta = {};
      if (!state.meta.profile) state.meta.profile = { age: null, heightCm: null, goalText: '保肌減脂' };
      const p = state.meta.profile;
      if (p.sex == null) p.sex = null; // 'F' | 'M' | 'X'
      if (p.age == null) p.age = null;
      if (p.weightKg == null) {
        // prefer latest body weight
        const last = (typeof myRecords === 'function' ? myRecords() : [])
          .filter(r => r.recordType === 'body' && r.data && r.data.weight != null)
          .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
        if (last) p.weightKg = +last.data.weight;
      }
      // settings UI: age + sex next to height
      const heightEl = document.getElementById('set-height');
      if (heightEl && !document.getElementById('set-age')) {
        const row = heightEl.closest('.row-2') || heightEl.parentElement;
        const wrap = document.createElement('div');
        wrap.className = 'row-2';
        wrap.id = 'set-profile-demo-row';
        wrap.innerHTML = `
          <div class="form-group"><label>年齡（歲）</label><input type="number" id="set-age" min="10" max="100" inputmode="numeric" placeholder="用作心率／熱量參考"></div>
          <div class="form-group"><label>生理性別（估算用）</label>
            <select id="set-sex">
              <option value="">未設定</option>
              <option value="F">女</option>
              <option value="M">男</option>
              <option value="X">其他／不使用性別公式</option>
            </select>
          </div>`;
        row.insertAdjacentElement('afterend', wrap);
        const ageEl = document.getElementById('set-age');
        const sexEl = document.getElementById('set-sex');
        if (ageEl) ageEl.value = p.age != null ? p.age : '';
        if (sexEl) sexEl.value = p.sex || '';
      } else {
        const ageEl = document.getElementById('set-age');
        const sexEl = document.getElementById('set-sex');
        if (ageEl && document.activeElement !== ageEl) ageEl.value = p.age != null ? p.age : '';
        if (sexEl && document.activeElement !== sexEl) sexEl.value = p.sex || '';
      }
      // hook save goals
      const btn = document.getElementById('btn-save-goals');
      if (btn && !btn.dataset.proBound) {
        btn.dataset.proBound = '1';
        btn.addEventListener('click', () => {
          const ageEl = document.getElementById('set-age');
          const sexEl = document.getElementById('set-sex');
          if (ageEl) state.meta.profile.age = ageEl.value === '' ? null : +ageEl.value;
          if (sexEl) {
            state.meta.profile.sex = sexEl.value || null;
            const gmap = { F: 'female', M: 'male', X: 'other' };
            state.meta.profile.gender = gmap[sexEl.value] || null;
            if (state.users[currentUser]) state.users[currentUser].gender = state.meta.profile.gender;
            try { applyPeriodVisibility(); } catch (_) {}
          }
          saveState();
        });
      }
    }

    function profileCtx() {
      ensureProfileFields();
      const p = state.meta.profile || {};
      let weight = p.weightKg != null ? +p.weightKg : null;
      if (weight == null) {
        const last = (typeof myRecords === 'function' ? myRecords() : [])
          .filter(r => r.recordType === 'body' && r.data && r.data.weight != null)
          .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
        if (last) weight = +last.data.weight;
      }
      if (weight == null) {
        const g = state.meta.goals || {};
        if (g.weightKg != null) weight = +g.weightKg;
      }
      return {
        age: p.age != null ? +p.age : null,
        sex: p.sex || null,
        heightCm: p.heightCm != null ? +p.heightCm : null,
        weightKg: weight
      };
    }

    // Tanaka et al. max HR; ACSM zones as %HRmax
    function maxHrEstimate(age) {
      if (age == null || age < 10 || age > 100) return null;
      return Math.round(208 - 0.7 * age); // Tanaka 2001, often preferred over 220-age
    }
    function hrZones(age) {
      const max = maxHrEstimate(age);
      if (!max) return null;
      const z = (lo, hi) => ({ lo: Math.round(max * lo), hi: Math.round(max * hi) });
      return {
        max,
        formula: 'Tanaka HRmax ≈ 208 − 0.7×年齡',
        zones: [
          { id: 1, name: '恢復／熱身', pct: '50–60%', ...z(0.50, 0.60) },
          { id: 2, name: '有氧基礎', pct: '60–70%', ...z(0.60, 0.70) },
          { id: 3, name: '節奏／Tempo', pct: '70–80%', ...z(0.70, 0.80) },
          { id: 4, name: '閾值', pct: '80–90%', ...z(0.80, 0.90) },
          { id: 5, name: '最大強度', pct: '90–100%', ...z(0.90, 1.00) }
        ]
      };
    }
    function classifyHr(hr, age) {
      const z = hrZones(age);
      if (!z || hr == null) return { flag: 'info', label: '缺心率或年齡', note: '設定年齡後可對照 ACSM %HRmax 區間' };
      if (hr < 40 || hr > 220) return { flag: 'high', label: '數值異常', note: '平均／運動心率超出常見生理範圍，請核對裝置讀數' };
      const restingHi = 100;
      if (hr < 50) return { flag: 'info', label: '偏低（可能靜息／運動員）', note: '靜息心率常見約 60–100；運動員可更低（ACSM／臨床慣例）' };
      for (const zone of z.zones) {
        if (hr >= zone.lo && hr <= zone.hi) {
          return { flag: zone.id >= 4 ? 'warn' : 'ok', label: `約 Zone ${zone.id} · ${zone.name}`, note: `${zone.pct} HRmax（估 ${z.max}）· ${z.formula}` };
        }
      }
      if (hr > z.max) return { flag: 'high', label: '高於估測 HRmax', note: '可能短時峰值、裝置誤讀或年齡需更新' };
      return { flag: 'info', label: '介乎區間之間', note: z.formula };
    }

    // Compendium of Physical Activities style MET defaults
    const EX_MET = {
      '力量訓練': 5.0,
      '有氧': 6.5,
      '跑步': 9.8,
      '行山': 6.0,
      '瑜伽': 2.5,
      '拉伸': 2.3,
      '其他': 4.5,
      '步行': 3.5,
      '騎車': 6.8,
      '游泳': 8.0
    };
    function estimateKcalMet(exType, minutes, weightKg) {
      if (!minutes || !weightKg) return null;
      const met = EX_MET[exType] || EX_MET['其他'];
      // kcal ≈ MET × kg × hours
      return Math.round(met * weightKg * (minutes / 60));
    }
    function evaluateKcal(logged, estimate) {
      if (logged == null || estimate == null) return { flag: 'info', label: '熱量待估', note: '需體重＋時長；公式 MET×kg×h（Compendium 風格）' };
      const ratio = logged / Math.max(estimate, 1);
      if (ratio >= 0.7 && ratio <= 1.35) return { flag: 'ok', label: '與 MET 估算接近', note: `參考約 ${estimate} kcal（±35% 內常見）` };
      if (ratio < 0.7) return { flag: 'warn', label: '低於 MET 估算', note: `參考約 ${estimate} kcal；或強度較低／體重未更新` };
      if (ratio <= 1.8) return { flag: 'warn', label: '高於 MET 估算', note: `參考約 ${estimate} kcal；裝置或含後燃／誤差` };
      return { flag: 'high', label: '遠高於 MET 估算', note: `參考約 ${estimate} kcal；建議核對截圖數字` };
    }
    function evaluatePace(distanceKm, minutes, exType) {
      if (!distanceKm || !minutes || distanceKm <= 0) return null;
      const pace = minutes / distanceKm; // min/km
      const speed = distanceKm / (minutes / 60); // km/h
      let flag = 'ok', label = `配速 ${pace.toFixed(1)} 分/km`, note = `時速約 ${speed.toFixed(1)} km/h`;
      if (/跑/.test(exType || '')) {
        if (pace < 2.5 || pace > 15) { flag = 'high'; note += ' · 跑步配速異常，請核對距離／時間'; }
        else if (pace < 3.5) { flag = 'warn'; note += ' · 極快（精英級），請確認 GPS'; }
        else if (pace > 12) { flag = 'info'; note += ' · 偏慢跑／步行混'; }
      } else if (/行山|步行/.test(exType || '')) {
        if (speed > 8) { flag = 'warn'; note += ' · 行山時速偏高'; }
        if (speed < 1) { flag = 'info'; note += ' · 偏慢或含休息'; }
      }
      return { flag, label, note, pace, speed };
    }
    function evaluateDuration(minutes) {
      if (minutes == null) return { flag: 'info', label: '缺時長', note: '' };
      if (minutes <= 0 || minutes > 600) return { flag: 'high', label: '時長異常', note: '超過 10 小時或 ≤0，請核對' };
      if (minutes > 180) return { flag: 'warn', label: '長時間訓練', note: '注意補水與恢復（一般健身建議）' };
      return { flag: 'ok', label: `${minutes} 分鐘`, note: '時長在常見訓練範圍' };
    }

    function parseExerciseMetrics(text, base) {
      const raw = String(text || '');
      const data = Object.assign({}, base || {});
      const grab = (re, key) => {
        if (data[key] != null && data[key] !== '') return;
        const m = raw.match(re);
        if (m) data[key] = +m[1];
      };
      grab(/(?:時長|時間|duration)\s*[:：]?\s*(\d{1,3})\s*(?:分鐘|min|mins)/i, 'minutes');
      grab(/(\d{1,3})\s*(?:分鐘|mins?\b)/i, 'minutes');
      grab(/(?:消耗|卡路里|熱量|Calories?|kcal)\s*[:：]?\s*(\d{2,4})/i, 'kcal');
      grab(/(\d{2,4})\s*(?:kcal|大卡)/i, 'kcal');
      grab(/(?:平均心率|Avg\.?\s*HR|Heart\s*Rate|心率)\s*[:：]?\s*(\d{2,3})\s*(?:bpm|次)?/i, 'avgHr');
      grab(/(?:最大心率|Max\.?\s*HR)\s*[:：]?\s*(\d{2,3})/i, 'maxHr');
      grab(/(?:步數|步数|steps?)\s*[:：]?\s*(\d{3,6})/i, 'steps');
      grab(/(\d{3,6})\s*步/i, 'steps');
      grab(/(?:距離|Distance)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(?:km|公里)/i, 'distanceKm');
      grab(/(\d+(?:\.\d+)?)\s*km\b/i, 'distanceKm');
      grab(/(?:配速|Pace)\s*[:：]?\s*(\d{1,2}[:：]\d{2}|\d+(?:\.\d+)?)/i, 'paceRaw');
      if (data.steps != null) { data.step = data.steps; if (!data.exType) data.exType = '步數'; }
      if (/跑|running|jog/i.test(raw) && !data.exType) data.exType = '跑步';
      else if (/行山|hiking|徒步/i.test(raw) && !data.exType) data.exType = '行山';
      else if (/瑜伽|yoga/i.test(raw) && !data.exType) data.exType = '瑜伽';
      else if (/力量|重量|gym|器械/i.test(raw) && !data.exType) data.exType = '力量訓練';
      else if (/有氧|elliptical|操房/i.test(raw) && !data.exType) data.exType = '有氧';
      return data;
    }

    function buildExerciseEvaluation(data) {
      const ctx = profileCtx();
      const minutes = data.minutes != null ? +data.minutes : null;
      const kcal = data.kcal != null ? +data.kcal : null;
      const avgHr = data.avgHr != null ? +data.avgHr : (data.hr != null ? +data.hr : null);
      const maxHrLog = data.maxHr != null ? +data.maxHr : null;
      const dist = data.distanceKm != null ? +data.distanceKm : null;
      const exType = data.exType || '其他';
      const est = estimateKcalMet(exType, minutes, ctx.weightKg);
      const flags = [];
      flags.push(Object.assign({ key: 'duration' }, evaluateDuration(minutes)));
      flags.push(Object.assign({ key: 'kcal' }, evaluateKcal(kcal, est)));
      if (avgHr != null) flags.push(Object.assign({ key: 'avgHr' }, classifyHr(avgHr, ctx.age)));
      if (maxHrLog != null) flags.push(Object.assign({ key: 'maxHr', labelPrefix: '峰值 ' }, classifyHr(maxHrLog, ctx.age)));
      const paceEv = evaluatePace(dist, minutes, exType);
      if (paceEv) flags.push(Object.assign({ key: 'pace' }, paceEv));
      const zones = hrZones(ctx.age);
      return { ctx, est, flags, zones, met: EX_MET[exType] || EX_MET['其他'], exType, minutes, kcal, avgHr, maxHrLog, dist };
    }

    function evalHtml(ev) {
      if (!ev) return '';
      const ctx = ev.ctx || {};
      const grid = `
        <div class="ex-eval-grid">
          <div><span class="ek">類型／MET</span><div class="ev">${escapeHtml(ev.exType)} · ${ev.met}</div></div>
          <div><span class="ek">時長</span><div class="ev">${ev.minutes != null ? ev.minutes + ' 分' : '—'}</div></div>
          <div><span class="ek">記錄消耗</span><div class="ev">${ev.kcal != null ? ev.kcal + ' kcal' : '—'}</div></div>
          <div><span class="ek">MET 參考消耗</span><div class="ev">${ev.est != null ? ev.est + ' kcal' : '需體重'}</div></div>
          <div><span class="ek">平均心率</span><div class="ev">${ev.avgHr != null ? ev.avgHr + ' bpm' : '—'}</div></div>
          <div><span class="ek">估測 HRmax</span><div class="ev">${ev.zones ? ev.zones.max + '（Tanaka）' : '需年齡'}</div></div>
          <div><span class="ek">距離</span><div class="ev">${ev.dist != null ? ev.dist + ' km' : '—'}</div></div>
          <div><span class="ek">檔案</span><div class="ev">${ctx.sex === 'F' ? '女' : ctx.sex === 'M' ? '男' : '未設性別'}${ctx.age != null ? ' · ' + ctx.age + '歲' : ''}${ctx.weightKg != null ? ' · ' + ctx.weightKg + 'kg' : ''}</div></div>
        </div>`;
      const flags = (ev.flags || []).map(f =>
        `<span class="ex-flag ${f.flag}" title="${escapeHtml(f.note || '')}">${escapeHtml((f.labelPrefix || '') + (f.label || ''))}</span>`
      ).join('');
      const zoneLine = ev.zones
        ? `<div class="pro-ref">ACSM 風格區間（%HRmax≈${ev.zones.max}）：${ev.zones.zones.map(z => `Z${z.id} ${z.lo}–${z.hi}`).join(' · ')}</div>`
        : `<div class="pro-ref">去設定填年齡／性別／並有體重記錄，評估會更準。</div>`;
      return `${grid}<div>${flags}</div>${zoneLine}<div class="pro-disclaimer">${PRO_DISCLAIMER}</div>`;
    }

    function mountEvalPanel(host, data, id) {
      if (!host) return;
      let panel = host.querySelector(id ? '#' + id : '.ex-eval-panel');
      if (!panel) {
        panel = document.createElement('details');
        panel.className = 'ex-eval-panel';
        if (id) panel.id = id;
        panel.open = true;
        host.appendChild(panel);
      }
      const ev = buildExerciseEvaluation(data || {});
      panel.innerHTML = `<summary>📊 運動分析評估 <span class="hint">參考估算</span></summary><div class="ex-eval-body">${evalHtml(ev)}</div>`;
    }

    // Extend exercise form with HR / distance fields + live eval
    function enhanceExerciseForm() {
      const form = document.getElementById('form-exercise');
      if (!form || form.dataset.proEx) return;
      form.dataset.proEx = '1';
      const feel = form.querySelector('[name="feel"]');
      const extra = document.createElement('div');
      extra.className = 'ex-extra-row';
      extra.innerHTML = `
        <div class="form-group"><label>平均心率 bpm（可空）</label><input type="number" name="avgHr" inputmode="numeric" min="30" max="230"></div>
        <div class="form-group"><label>距離 km（可空）</label><input type="number" name="distanceKm" step="0.01" inputmode="decimal"></div>`;
      if (feel) feel.closest('.form-group').insertAdjacentElement('beforebegin', extra);
      else form.querySelector('[name="kcal"]')?.closest('.row-2')?.insertAdjacentElement('afterend', extra);
      const host = document.createElement('div');
      host.id = 'form-ex-eval-host';
      form.querySelector('button[type="submit"]')?.insertAdjacentElement('beforebegin', host);
      const refresh = () => {
        const data = {
          exType: form.elements.exType && form.elements.exType.value,
          minutes: form.elements.minutes && form.elements.minutes.value,
          kcal: form.elements.kcal && form.elements.kcal.value,
          avgHr: form.elements.avgHr && form.elements.avgHr.value,
          distanceKm: form.elements.distanceKm && form.elements.distanceKm.value
        };
        mountEvalPanel(host, data, 'form-ex-eval');
      };
      form.addEventListener('input', refresh);
      refresh();
      // patch submit data collection via wrapping handleFormSubmit is hard; hook submit capture
      form.addEventListener('submit', () => {
        // stash extras onto a side channel read by recordSummary / after save
        form.dataset.lastAvgHr = (form.elements.avgHr && form.elements.avgHr.value) || '';
        form.dataset.lastDist = (form.elements.distanceKm && form.elements.distanceKm.value) || '';
      }, true);
    }

    // After exercise records saved from form, merge avgHr/distance if missing
    if (typeof handleFormSubmit === 'function') {
      const _h = handleFormSubmit;
      handleFormSubmit = async function(e) {
        const form = e && e.target;
        const type = form && form.dataset && form.dataset.type;
        await _h.apply(this, arguments);
        try {
          if (type === 'exercise' && form) {
            const recs = (typeof myRecords === 'function' ? myRecords() : []).filter(r => r.recordType === 'exercise')
              .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
            const last = recs[0];
            if (last && last.data) {
              if (form.elements.avgHr && form.elements.avgHr.value) last.data.avgHr = +form.elements.avgHr.value;
              if (form.elements.distanceKm && form.elements.distanceKm.value) last.data.distanceKm = +form.elements.distanceKm.value;
              last.data._eval = buildExerciseEvaluation(last.data);
              saveState();
            }
          }
        } catch (err) { console.warn('ex eval merge', err); }
      };
    }

    // Draft confirm: parse + panel
    function enhanceExerciseDraft() {
      if (typeof buildStubExerciseDraft === 'function') {
        const _b = buildStubExerciseDraft;
        buildStubExerciseDraft = function(attachments, caption) {
          const d = _b(attachments, caption);
          const parsed = parseExerciseMetrics(caption || '', d.data);
          d.data = parsed;
          if (parsed.minutes || parsed.kcal || parsed.avgHr) {
            d.summary = `運動辨認 · ${parsed.exType || '其他'}${parsed.minutes ? ' ' + parsed.minutes + '分' : ''}${parsed.kcal ? ' · ' + parsed.kcal + 'kcal' : ''}${parsed.avgHr ? ' · HR' + parsed.avgHr : ''}`;
            d.conf = Math.max(d.conf || 0.55, 0.7);
            d.stub = parsed.minutes ? 'ocr-lite' : d.stub;
          }
          d.data._eval = buildExerciseEvaluation(d.data);
          return d;
        };
      }
      // text chat parse enrich
      if (typeof parseChatMessage === 'function') {
        const _p = parseChatMessage;
        parseChatMessage = function(text, opts) {
          const r = _p(text, opts);
          try {
            if (r && r.ok && r.recordType === 'exercise' && r.data) {
              r.data = parseExerciseMetrics(text, r.data);
              r.data._eval = buildExerciseEvaluation(r.data);
            }
          } catch (_) {}
          return r;
        };
      }
      if (typeof renderDraftConfirmCard === 'function') {
        const _r = renderDraftConfirmCard;
        renderDraftConfirmCard = function(draft) {
          if (draft && draft.recordType === 'exercise') {
            draft.data = parseExerciseMetrics(draft.rawText || '', draft.data || {});
            // ensure HR fields in draft UI via post-hook
          }
          _r(draft);
          try {
            if (!draft || draft.recordType !== 'exercise') return;
            const card = document.querySelector('.draft-confirm-card, #draft-confirm-card, .chat-draft-card');
            if (!card) return;
            // add HR input if missing
            if (!card.querySelector('[data-df="avgHr"]')) {
              const fields = card.querySelector('.draft-fields');
              if (fields) {
                fields.insertAdjacentHTML('beforeend', `
                  <div class="row-2">
                    <div class="form-group"><label>平均心率 bpm</label><input type="number" data-df="avgHr" value="${draft.data.avgHr??''}" inputmode="numeric"></div>
                    <div class="form-group"><label>最大心率 bpm</label><input type="number" data-df="maxHr" value="${draft.data.maxHr??''}" inputmode="numeric"></div>
                  </div>`);
              }
            }
            const readData = () => {
              const data = Object.assign({}, draft.data);
              card.querySelectorAll('[data-df]').forEach(el => {
                const k = el.getAttribute('data-df');
                data[k] = el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value;
              });
              return data;
            };
            mountEvalPanel(card, readData(), 'draft-ex-eval');
            card.querySelectorAll('[data-df]').forEach(el => {
              el.addEventListener('input', () => mountEvalPanel(card, readData(), 'draft-ex-eval'));
            });
          } catch (e) { console.warn('draft ex eval', e); }
        };
      }
    }

    // ---- Bodycomp professional ranges ----
    function bodyFatCategory(bf, sex) {
      if (bf == null) return null;
      // ACE / ACSM-style adult body-fat categories (approx.)
      if (sex === 'M') {
        if (bf < 6) return { flag: 'warn', label: '必需脂肪以下／極低', note: '男性必需脂肪約 2–5%；過低有健康風險' };
        if (bf <= 13) return { flag: 'ok', label: '運動員級（參考）', note: 'ACE 男性 athletes ≈ 6–13%' };
        if (bf <= 17) return { flag: 'ok', label: '健身級', note: 'ACE fitness ≈ 14–17%' };
        if (bf <= 24) return { flag: 'ok', label: '一般可接受', note: 'ACE average ≈ 18–24%' };
        if (bf <= 30) return { flag: 'warn', label: '偏高', note: '高於一般可接受上限' };
        return { flag: 'high', label: '肥胖範圍（體脂）', note: 'ACE obese 約 ≥25%；裝置誤差大' };
      }
      // female / default
      if (bf < 14) return { flag: 'warn', label: '必需脂肪以下／極低', note: '女性必需脂肪約 10–13%；過低有健康風險' };
      if (bf <= 20) return { flag: 'ok', label: '運動員級（參考）', note: 'ACE 女性 athletes ≈ 14–20%' };
      if (bf <= 24) return { flag: 'ok', label: '健身級', note: 'ACE fitness ≈ 21–24%' };
      if (bf <= 31) return { flag: 'ok', label: '一般可接受', note: 'ACE average ≈ 25–31%' };
      if (bf <= 35) return { flag: 'warn', label: '偏高', note: '高於一般可接受上限' };
      return { flag: 'high', label: '肥胖範圍（體脂）', note: 'ACE obese 約 ≥32%；非診斷' };
    }
    function bmiAsian(bmi) {
      if (bmi == null) return null;
      // WHO expert consultation for Asian populations (public health action points)
      if (bmi < 18.5) return { flag: 'warn', label: '偏瘦', note: 'WHO 亞洲：<18.5 體重過低' };
      if (bmi < 23) return { flag: 'ok', label: '正常（亞洲切點）', note: 'WHO 亞洲建議正常約 18.5–22.9' };
      if (bmi < 25) return { flag: 'warn', label: '過重風險增加', note: '亞洲切點 ≥23 風險上升；國際過重常 ≥25' };
      if (bmi < 27.5) return { flag: 'warn', label: '過重', note: 'WHO 亞洲 25–27.4 高風險' };
      return { flag: 'high', label: '肥胖範圍（BMI）', note: 'WHO 亞洲 ≥27.5 更高風險；BMI 不區分肌肉' };
    }
    function visceralFlag(v) {
      if (v == null) return null;
      // Tanita / consumer scale visceral rating commonly 1–59; 1–9 healthy
      if (v <= 9) return { flag: 'ok', label: '內臟脂肪等級正常區', note: '消費級體脂磅常見 1–9 為標準區（裝置專屬）' };
      if (v <= 14) return { flag: 'warn', label: '內臟脂肪偏高', note: '常見標示 10–14 偏高' };
      return { flag: 'high', label: '內臟脂肪高', note: '≥15 常見為高；請以醫護建議為準' };
    }
    function waterFlag(w, sex) {
      if (w == null) return null;
      // rough TBW% ranges
      const lo = sex === 'M' ? 50 : 45;
      const hi = sex === 'M' ? 65 : 60;
      if (w >= lo && w <= hi) return { flag: 'ok', label: '體水分大致常見', note: `參考約 ${lo}–${hi}%（性別粗分，受脂肪影響）` };
      if (w < lo) return { flag: 'warn', label: '體水分偏低（相對）', note: '或體脂較高／量度狀態；非脫水診斷' };
      return { flag: 'info', label: '體水分偏高（相對）', note: '可受剛飲水、量度時機影響' };
    }

    function attachBodyProEval(host, data) {
      if (!host || !data) return;
      const ctx = profileCtx();
      const bits = [];
      const bmi = data.bmi != null ? +data.bmi : (data.weight && ctx.heightCm ? +(data.weight / ((ctx.heightCm / 100) ** 2)).toFixed(1) : null);
      const items = [
        bmiAsian(bmi),
        bodyFatCategory(data.bodyFat != null ? +data.bodyFat : null, ctx.sex),
        visceralFlag(data.visceralFat != null ? +data.visceralFat : null),
        waterFlag(data.water != null ? +data.water : null, ctx.sex)
      ].filter(Boolean);
      let panel = host.querySelector('#body-pro-eval');
      if (!panel) {
        panel = document.createElement('details');
        panel.className = 'ex-eval-panel';
        panel.id = 'body-pro-eval';
        panel.open = false;
        host.appendChild(panel);
      }
      panel.innerHTML = `<summary>📐 體成分參考區間 <span class="hint">估算</span></summary>
        <div class="ex-eval-body">
          <div>${items.map(f => `<span class="ex-flag ${f.flag}">${escapeHtml(f.label)}</span>`).join('') || '<span class="hint">填體脂／BMI 後顯示</span>'}</div>
          <div class="pro-ref">${items.map(f => f.note).filter(Boolean).join(' · ')}</div>
          <div class="pro-disclaimer">${PRO_DISCLAIMER}</div>
        </div>`;
    }

    // Hook body OCR confirm from polish
    if (typeof renderDraftConfirmCard === 'function') {
      const _rd = renderDraftConfirmCard;
      renderDraftConfirmCard = function(draft) {
        _rd(draft);
        try {
          if (draft && draft.recordType === 'body') {
            const card = document.querySelector('.draft-confirm-card, #draft-confirm-card, .chat-draft-card');
            if (card) attachBodyProEval(card, draft.data || {});
          }
        } catch (_) {}
      };
    }

    // ---- Period professional notes ----
    function periodProNote(cycleDays, periodDays) {
      const flags = [];
      if (cycleDays != null) {
        if (cycleDays >= 21 && cycleDays <= 35) flags.push({ flag: 'ok', label: `週期 ${cycleDays} 日 · 常見`, note: '臨床常用參考週期約 21–35 日' });
        else flags.push({ flag: 'warn', label: `週期 ${cycleDays} 日 · 偏離常見`, note: '持續異常應咨詢醫護；App 僅記錄' });
      }
      if (periodDays != null) {
        if (periodDays >= 2 && periodDays <= 7) flags.push({ flag: 'ok', label: `經期 ${periodDays} 日 · 常見`, note: '常見出血日數約 2–7 日' });
        else flags.push({ flag: 'info', label: `經期 ${periodDays} 日`, note: '個別差異大；大量出血／劇痛請就醫' });
      }
      return flags;
    }
    function enhancePeriodDisclaimer() {
      const hosts = document.querySelectorAll('#ffl-period-panel, .period-card, #page-period');
      hosts.forEach(h => {
        if (!h || h.querySelector('.pro-disclaimer.period')) return;
        const d = document.createElement('div');
        d.className = 'pro-disclaimer period';
        d.textContent = '經期追蹤僅供生活記錄。週期 21–35 日、經期約 2–7 日為常見參考範圍，非診斷。不適、經血異常或備孕相關請咨詢合格醫護。';
        h.appendChild(d);
      });
    }

    // ---- Nutrition estimate disclaimer upgrade ----
    function enhanceNutritionCopy() {
      document.querySelectorAll('.stub-note, .draft-confirm-card .hint, .food-autofill-hint').forEach(el => {
        if (el.dataset.proNut) return;
        if (/熱量|kcal|估算|飲食/.test(el.textContent || '')) {
          el.dataset.proNut = '1';
          el.textContent = (el.textContent || '') + ' · 營養數字為食物資料庫／包裝參考估算，非代謝倉測量；蛋白質需求常約 0.8–1.6 g/kg（活動量而異）。';
        }
      });
    }

    // ---- Beauty log professional framing ----
    function enhanceBeautyDisclaimer() {
      const tip = document.getElementById('home-beauty-tip');
      if (tip && !tip.querySelector('.pro-disclaimer')) {
        const d = document.createElement('div');
        d.className = 'pro-disclaimer';
        d.style.marginTop = '6px';
        d.textContent = '護膚／護眼／變靚紀錄屬生活習慣日誌，非皮膚科或眼科診斷；刺激、過敏或視力問題請停用並咨詢專業。';
        tip.appendChild(d);
      }
      const form = document.getElementById('form-beauty');
      if (form && !form.querySelector('.pro-disclaimer')) {
        const d = document.createElement('div');
        d.className = 'pro-disclaimer';
        d.textContent = '本類別只記錄產品與部位，不做療效宣稱或診斷。';
        form.appendChild(d);
      }
    }

    // ---- 橘貓（realistic orange tabby） ----
    function orangeTabbySvg(level) {
      const plump = 20 + (level - 1) * 2.8;
      const orange = '#e0893a', orangeDeep = '#c45f1a', cream = '#f6e0c4', stripe = '#a34a12';
      return `<svg class="hamster-svg realistic cat-svg" viewBox="0 0 88 118" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <radialGradient id="catFur" cx="40%" cy="30%"><stop offset="0%" stop-color="#f0a85a"/><stop offset="100%" stop-color="${orangeDeep}"/></radialGradient>
        </defs>
        <ellipse cx="44" cy="110" rx="24" ry="4" fill="rgba(0,0,0,.1)"/>
        <!-- body -->
        <ellipse class="belly" cx="44" cy="78" rx="${plump + 2}" ry="${20 + level}" fill="url(#catFur)"/>
        <ellipse class="belly" cx="44" cy="86" rx="${plump * 0.5}" ry="9" fill="${cream}" opacity=".95"/>
        <!-- tabby stripes on body -->
        <path d="M30 68 Q44 62 58 68" stroke="${stripe}" stroke-width="2" fill="none" opacity=".55"/>
        <path d="M28 76 Q44 70 60 76" stroke="${stripe}" stroke-width="2" fill="none" opacity=".45"/>
        <path d="M30 84 Q44 79 58 84" stroke="${stripe}" stroke-width="1.6" fill="none" opacity=".4"/>
        <!-- head -->
        <circle cx="44" cy="44" r="22" fill="url(#catFur)"/>
        <!-- ears -->
        <path d="M26 32 L22 14 L36 28 Z" fill="${orangeDeep}"/>
        <path d="M28 30 L25 18 L34 28 Z" fill="#f0b090"/>
        <path d="M62 32 L66 14 L52 28 Z" fill="${orangeDeep}"/>
        <path d="M60 30 L63 18 L54 28 Z" fill="#f0b090"/>
        <!-- forehead M -->
        <path d="M36 30 L40 38 L44 30 L48 38 L52 30" stroke="${stripe}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <!-- eyes -->
        <ellipse cx="35" cy="46" rx="4" ry="4.5" fill="#2a2018"/>
        <ellipse cx="53" cy="46" rx="4" ry="4.5" fill="#2a2018"/>
        <ellipse cx="34" cy="44.5" rx="1.2" ry="1.5" fill="#c8f07a" opacity=".85"/>
        <ellipse cx="52" cy="44.5" rx="1.2" ry="1.5" fill="#c8f07a" opacity=".85"/>
        <ellipse cx="36" cy="45" rx="0.7" ry="0.7" fill="#fff"/>
        <ellipse cx="54" cy="45" rx="0.7" ry="0.7" fill="#fff"/>
        <!-- nose mouth -->
        <path d="M44 52 L41 55 L47 55 Z" fill="#e89a9a"/>
        <path d="M44 55 L44 58 M44 58 Q38 60 34 57 M44 58 Q50 60 54 57" stroke="#5a4030" stroke-width="1" fill="none"/>
        <!-- cheeks / whisker pads -->
        <ellipse class="cheek" cx="30" cy="52" rx="7" ry="5" fill="${cream}" opacity=".85"/>
        <ellipse class="cheek" cx="58" cy="52" rx="7" ry="5" fill="${cream}" opacity=".85"/>
        <!-- whiskers -->
        <path d="M28 52 H14 M28 55 H16 M60 52 H74 M60 55 H72" stroke="#5a4030" stroke-width="0.8" opacity=".7"/>
        <!-- tail -->
        <path d="M62 88 Q78 70 72 52" stroke="${orange}" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M62 88 Q78 70 72 52" stroke="${stripe}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>
        <text x="44" y="108" text-anchor="middle" font-size="7" fill="#6e6454">${level >= 4 ? '橘橘好飽' : '橘貓'}</text>
      </svg>`;
    }

    function installOrangeCat() {
      if (installOrangeCat._ran) return;
      installOrangeCat._ran = true;
      // extend PET_SPECIES
      try {
        if (typeof PET_SPECIES !== 'undefined' && Array.isArray(PET_SPECIES)) {
          if (!PET_SPECIES.some(s => s.id === 'orange_tabby')) {
            PET_SPECIES.push({ id: 'orange_tabby', label: '橘貓' });
          }
        }
      } catch (_) {}
      // also patch settings select if already rendered
      const sel = document.getElementById('set-pet-species');
      if (sel && !sel.querySelector('option[value="orange_tabby"]')) {
        sel.insertAdjacentHTML('beforeend', '<option value="orange_tabby">橘貓</option>');
      }

      const wrapRealistic = (orig) => function(species, level) {
        const lv = level || 1;
        if (species === 'orange_tabby' || species === 'cat_orange' || species === '橘貓') {
          return orangeTabbySvg(lv);
        }
        return orig(species, lv);
      };

      if (typeof realisticHamsterSvg === 'function') {
        realisticHamsterSvg = wrapRealistic(realisticHamsterSvg);
      }
      if (typeof hamsterSvg === 'function') {
        hamsterSvg = wrapRealistic(hamsterSvg);
      }
      // cat-specific feed animation class already uses hamster-svg — ok
      // Defer UI refresh: renderHomeHero wrapper calls installOrangeCat — sync call = infinite recursion.
      // _ran already set, so deferred renderHomeHero → installOrangeCat is a no-op.
      try {
        setTimeout(function () {
          if (window.FFL_AuthGate && !FFL_AuthGate.isAuthed()) return;
          if (!currentUser) return;
          try { if (typeof renderPetOnToday === 'function') renderPetOnToday(); } catch (_) {}
          try { if (typeof renderPetSettingsPanel === 'function') renderPetSettingsPanel(); } catch (_) {}
          try { if (typeof renderHomeHero === 'function') renderHomeHero(); } catch (_) {}
        }, 0);
      } catch (_) {}
    }

    // Upgrade generic analysis blurbs in home/report if present
    function stampGlobalAnalysisDisclaimer() {
      const report = document.getElementById('page-report') || document.getElementById('ffl-report');
      if (report && !report.querySelector('.pro-disclaimer.global')) {
        const d = document.createElement('div');
        d.className = 'pro-disclaimer global';
        d.textContent = PRO_DISCLAIMER;
        report.appendChild(d);
      }
    }

    function bootPro() {
      try {
        ensureProfileFields();
        installOrangeCat();
        enhanceExerciseForm();
        enhanceExerciseDraft();
        enhancePeriodDisclaimer();
        enhanceNutritionCopy();
        enhanceBeautyDisclaimer();
        stampGlobalAnalysisDisclaimer();
      } catch (e) { console.warn('bootPro', e); }
    }

    if (typeof renderHomeHero === 'function') {
      const _h = renderHomeHero;
      renderHomeHero = function() {
        _h();
        try { installOrangeCat(); enhanceBeautyDisclaimer(); } catch (_) {}
      };
    }
    if (typeof renderSettings === 'function') {
      const _s = renderSettings;
      renderSettings = function() {
        _s();
        try { ensureProfileFields(); if (typeof renderPetSettingsPanel === 'function') renderPetSettingsPanel(); } catch (_) {}
      };
    }
    if (typeof renderPetSettingsPanel === 'function') {
      const _rp = renderPetSettingsPanel;
      renderPetSettingsPanel = function() {
        _rp();
        const sel = document.getElementById('set-pet-species');
        if (sel && !sel.querySelector('option[value="orange_tabby"]')) {
          sel.insertAdjacentHTML('beforeend', '<option value="orange_tabby">橘貓</option>');
        }
      };
    }

    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(bootPro, 'pro');
    else { setTimeout(bootPro, 120); }
    window.FFL_Pro = {
      buildExerciseEvaluation, parseExerciseMetrics, hrZones, estimateKcalMet,
      bodyFatCategory, bmiAsian, orangeTabbySvg, PRO_DISCLAIMER
    };
  })();


  /* ========== BloomBody food confirm UX + bodycomp OCR refs ========== */
  (function injectFoodUxBodyOcrRefs() {
    // ---- Golden OCR samples (layout-faithful text dumps) ----
    const BODY_OCR_FIXTURES = {
      scale_app_phone: {
        label: '家用磅 App 樣本',
        source: '家用磅',
        text: [
          '測試完成！',
          '溫度: 27.0°C',
          '偏胖',
          '76.7 kg',
          '一天內稱重',
          'VS 對比上次',
          '體重 +1.40 kg',
          'BMI +0.5',
          '體脂率 +0.6 %',
          '得分 81.5',
          'BMI 26.5 偏胖',
          '體脂率 34.1 % 偏高',
          '肌肉率 61.9 % 優',
          '水分 45.3 % 標準'
        ].join('\n'),
        expect: { weight: 76.7, bmi: 26.5, bodyFat: 34.1, musclePct: 61.9, water: 45.3, score: 81.5, temperature: 27.0 }
      },
      scale_radar_home: {
        label: '雷達磅樣本',
        source: '家用磅',
        text: [
          'BMI 骨量 VISFAT 脂肪 水分 蛋白質 肌肉 基礎代謝',
          '開始',
          '裸足身高 170 cm',
          '體重 80.8',
          'BMI 27.8',
          '體脂 38.1%',
          '內臟脂肪 13.0',
          '皮下脂肪 34.9%',
          '肌肉 34.8%',
          '骨量 3.7kg',
          '水分 45.0%',
          '蛋白質 12.3%',
          '基礎代謝 1451.1 kcal',
          '過低 偏低 正常 偏高 過高'
        ].join('\n'),
        expect: { height: 170, weight: 80.8, bmi: 27.8, bodyFat: 38.1, visceralFat: 13, subcutaneousFat: 34.9, musclePct: 34.8, boneMass: 3.7, water: 45.0, proteinPct: 12.3, bmr: 1451.1 }
      },
      inbody_lcsd: {
        label: '康文署 InBody 樣本',
        source: '康文署報告',
        text: [
          '身體組成分析報告',
          '健康得分 58',
          '年齡 32 性別 女 身高 170 cm',
          '2026-10-09 21:52:32',
          'ORS261000456BEc6',
          'stfitnesscorner.hk',
          '體重 80.2 kg 建議範圍 54.9–69.4',
          '體脂肪量 30.5 kg',
          '體脂率 38.1% 建議範圍 21.0–27.0%',
          '腰臀比 0.86',
          '皮下脂肪 34.9%',
          '去脂體重 49.7 kg',
          '肌肉量 43.0 kg',
          'BMI 27.8',
          '體內年齡 40',
          '骨礦物含量 3.7 kg',
          '蛋白質 9.8 kg',
          'SMI 7.4',
          'SMM 27.9 kg',
          '基礎代謝 6071.5 kJ / 1451.3 kcal',
          '內臟脂肪指數 13.0 極高',
          '體型判定 偏胖型'
        ].join('\n'),
        expect: {
          height: 170, weight: 80.2, score: 58, bodyFat: 38.1, fatMass: 30.5, whr: 0.86,
          subcutaneousFat: 34.9, fatFreeMass: 49.7, muscle: 43.0, bmi: 27.8, bodyAge: 40,
          boneMass: 3.7, proteinKg: 9.8, smi: 7.4, smm: 27.9, bmr: 1451.3, visceralFat: 13
        }
      }
    };

    function enhanceBodyOcrFromRefs() {
      const base = (typeof parseBodyCompText === 'function')
        ? parseBodyCompText
        : (window.FFL_BodyComp && window.FFL_BodyComp.parseBodyCompText);
      if (typeof base !== 'function') return;

      const enhanced = function(text, hintSource) {
        const raw = String(text || '');
        let data = base(raw, hintSource) || { source: hintSource || '家用磅' };
        if (!data || typeof data !== 'object') data = { source: hintSource || '家用磅' };

        function grab(re, key, force) {
          if (data[key] != null && !force) return;
          const m = raw.match(re);
          if (m) data[key] = +(+m[1]).toFixed(2);
        }

        // —— scale_app_phone layout ——
        grab(/溫度\s*[:：]?\s*(\d{2}(?:\.\d+)?)\s*°?\s*C/i, 'temperature');
        // big dial weight often alone on line: "76.7 kg"
        if (data.weight == null) {
          const wm = raw.match(/(?:^|\n)\s*(\d{2,3}\.\d)\s*kg\s*(?:\n|$)/im);
          if (wm) data.weight = +wm[1];
        }
        grab(/得分\s*[:：]?\s*(\d{1,3}(?:\.\d+)?)/i, 'score');
        grab(/BMI\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*(?:偏胖|偏瘦|標準|正常|過重)?/i, 'bmi');
        grab(/體脂率\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*%/i, 'bodyFat');
        grab(/肌肉率\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*%/i, 'musclePct');
        grab(/水分\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*%/i, 'water');

        // —— scale_radar_home ——
        grab(/裸足身高\s*[:：]?\s*(\d{2,3}(?:\.\d+)?)\s*cm/i, 'height');
        grab(/皮下脂肪\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*%?/i, 'subcutaneousFat');
        grab(/(?:內臟脂肪|VISFAT|內臟脂肪指數)\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)/i, 'visceralFat');
        grab(/骨量\s*[:：]?\s*(\d(?:\.\d+)?)\s*kg/i, 'boneMass');
        grab(/蛋白質\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*%/i, 'proteinPct');
        grab(/基礎代謝\s*[:：]?\s*(\d{3,4}(?:\.\d+)?)\s*(?:kcal|大卡)/i, 'bmr');
        // muscle as % on radar list (not kg)
        grab(/(?:^|\n)\s*肌肉\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*%/im, 'musclePct');
        grab(/(?:^|\n)\s*體脂\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*%/im, 'bodyFat');

        // —— inbody LCSD / stfitness ——
        grab(/健康得分\s*[:：]?\s*(\d{1,3})/i, 'score');
        grab(/身高\s*[:：]?\s*(\d{2,3}(?:\.\d+)?)\s*cm/i, 'height');
        grab(/體脂肪量\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*kg/i, 'fatMass');
        grab(/腰臀比\s*[:：]?\s*(0\.\d{2}|\d\.\d{2})/i, 'whr');
        grab(/去脂體重\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*kg/i, 'fatFreeMass');
        grab(/肌肉量\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*kg/i, 'muscle');
        grab(/體內年齡\s*[:：]?\s*(\d{2})/i, 'bodyAge');
        grab(/(?:骨礦物(?:含量)?|BMC)\s*[:：]?\s*(\d(?:\.\d+)?)\s*kg/i, 'boneMass');
        grab(/蛋白質\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*kg/i, 'proteinKg');
        grab(/SMI\s*[:：]?\s*(\d(?:\.\d+)?)/i, 'smi');
        grab(/SMM\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)\s*kg/i, 'smm');
        // kJ first then kcal on same line
        const kj = raw.match(/基礎代謝[^\n]{0,40}?(\d{3,5}(?:\.\d+)?)\s*kJ[^\n]{0,20}?(\d{3,4}(?:\.\d+)?)\s*kcal/i);
        if (kj) data.bmr = +kj[2];
        else {
          const onlyKj = raw.match(/基礎代謝[^\n]{0,20}?(\d{4,5}(?:\.\d+)?)\s*kJ/i);
          if (onlyKj && (data.bmr == null || data.bmr > 4000)) data.bmr = +(+onlyKj[1] / 4.184).toFixed(1);
        }
        grab(/內臟脂肪指數\s*[:：]?\s*(\d{1,2}(?:\.\d+)?)/i, 'visceralFat');

        // source detection
        if (/身體組成分析報告|康文|stfitness|ORS\d/i.test(raw)) data.source = '康文署報告';
        else if (/inbody/i.test(raw)) data.source = 'InBody';
        else if (/測試完成|VS\s*對比上次|一天內稱重|裸足身高|VISFAT/i.test(raw)) data.source = '家用磅';
        else if (hintSource) data.source = hintSource;

        if (data.weight && data.height && data.bmi == null) {
          const m = data.height / 100;
          if (m > 0) data.bmi = +(data.weight / (m * m)).toFixed(1);
        }
        data._ocrRef = true;
        data._fieldCount = Object.keys(data).filter(k => !String(k).startsWith('_') && k !== 'source' && data[k] != null).length;
        return data;
      };

      try { parseBodyCompText = enhanced; } catch (_) {}
      if (!window.FFL_BodyComp) window.FFL_BodyComp = {};
      window.FFL_BodyComp.parseBodyCompText = enhanced;
      window.FFL_BodyComp.FIXTURES = BODY_OCR_FIXTURES;
    }

    function scoreFixture(id) {
      const fx = BODY_OCR_FIXTURES[id];
      if (!fx || typeof parseBodyCompText !== 'function') return null;
      const got = parseBodyCompText(fx.text, fx.source);
      const exp = fx.expect;
      let ok = 0, miss = [];
      Object.keys(exp).forEach(k => {
        const g = got[k], e = exp[k];
        if (g == null) { miss.push(k + '=missing'); return; }
        const tol = (k === 'bmr') ? 5 : (k === 'weight' || k === 'bmi' || k === 'bodyFat' ? 0.15 : 0.05);
        if (Math.abs(+g - +e) <= Math.max(tol, Math.abs(e) * 0.02)) ok++;
        else miss.push(k + '=' + g + '≠' + e);
      });
      return { id, ok, total: Object.keys(exp).length, miss, source: got.source, fields: got._fieldCount };
    }

    function mountBodyOcrFixtures() {
      const paste = document.querySelector('#form-body textarea[name="ocrPaste"], #body-ocr-paste, .ocr-paste-box textarea');
      const host = document.querySelector('.ocr-paste-box') || document.getElementById('form-body');
      if (!host || host.querySelector('.body-ocr-fixture-bar')) return;
      const bar = document.createElement('div');
      bar.className = 'body-ocr-fixture-bar';
      bar.innerHTML = `<span class="hint">用參考圖樣本文字試辨認：</span>` +
        Object.keys(BODY_OCR_FIXTURES).map(id =>
          `<button type="button" data-fx="${id}">${BODY_OCR_FIXTURES[id].label.split('（')[0]}</button>`
        ).join('') +
        `<button type="button" data-fx-run="1">跑全部自測</button>`;
      host.insertAdjacentElement('afterbegin', bar);
      const scoreEl = document.createElement('div');
      scoreEl.className = 'body-ocr-score';
      scoreEl.id = 'body-ocr-fixture-score';
      bar.insertAdjacentElement('afterend', scoreEl);
      bar.onclick = (e) => {
        const b = e.target.closest('[data-fx]');
        const run = e.target.closest('[data-fx-run]');
        if (b) {
          const id = b.getAttribute('data-fx');
          const fx = BODY_OCR_FIXTURES[id];
          const ta = host.querySelector('textarea');
          if (ta) ta.value = fx.text;
          const parsed = parseBodyCompText(fx.text, fx.source);
          const sc = scoreFixture(id);
          scoreEl.textContent = `辨認 ${sc.ok}/${sc.total} · source=${parsed.source} · 欄 ${parsed._fieldCount}` +
            (sc.miss.length ? ' · 差：' + sc.miss.slice(0, 4).join(', ') : ' · 對齊 refs ✓');
          // fill form if possible
          try {
            const form = document.getElementById('form-body');
            if (form) {
              Object.keys(parsed).forEach(k => {
                if (k.startsWith('_') || k === 'source') return;
                if (form.elements[k] && parsed[k] != null) form.elements[k].value = parsed[k];
              });
              if (form.elements.source) form.elements.source.value = parsed.source;
            }
          } catch (_) {}
          if (typeof toast === 'function') toast('已貼入 ' + fx.label + ' 樣本文字', 'success');
        }
        if (run) {
          const lines = Object.keys(BODY_OCR_FIXTURES).map(id => {
            const sc = scoreFixture(id);
            return `${sc.id}: ${sc.ok}/${sc.total}` + (sc.miss.length ? ' (' + sc.miss[0] + ')' : ' ✓');
          });
          scoreEl.textContent = 'Refs 自測：' + lines.join(' · ');
          if (typeof toast === 'function') toast(scoreEl.textContent, 'success');
          console.info('[FFL body OCR fixtures]', lines);
        }
      };
    }

    // ---- Food confirm UX stability ----
    let _draftCommitLock = false;

    function backupAttachments(draft) {
      if (!draft) return [];
      const a = (draft.attachments && draft.attachments.length)
        ? draft.attachments
        : (draft._attachBackup || []);
      draft._attachBackup = (a || []).map(x => Object.assign({}, x));
      draft.attachments = draft._attachBackup.slice();
      return draft.attachments;
    }

    function ensureSingleDraftCard() {
      document.querySelectorAll('#p0-draft-card').forEach((el, i) => {
        if (i > 0) el.closest('.chat-msg')?.remove() || el.remove();
      });
    }

    function remountPendingDraftIfNeeded() {
      if (!chatPendingDraft) return;
      backupAttachments(chatPendingDraft);
      if (!$('#p0-draft-card') && typeof renderDraftConfirmCard === 'function') {
        renderDraftConfirmCard(chatPendingDraft);
      }
    }

    function dietQuickTemplates(card, draft) {
      if (!card || !draft || draft.recordType !== 'diet') return;
      if (card.querySelector('.draft-food-quick')) return;
      const fields = card.querySelector('.draft-fields') || card.querySelector('#p0-draft-fields');
      if (!fields) return;
      const cats = (typeof FOOD_CATALOG !== 'undefined' && Array.isArray(FOOD_CATALOG))
        ? FOOD_CATALOG.slice(0, 8)
        : [
          { display: '雞蛋一隻', kcal: 78, protein: 6.5, carb: 0.6, fat: 5.3 },
          { display: '白飯一碗', kcal: 200, protein: 4, carb: 45, fat: 0.5 },
          { display: '雞胸 100g', kcal: 165, protein: 31, carb: 0, fat: 3.6 }
        ];
      const box = document.createElement('div');
      box.className = 'draft-food-quick';
      box.innerHTML = '<span class="hint">常用：</span>' + cats.map((c, i) =>
        `<button type="button" data-fq="${i}">${escapeHtml(c.display || c.name || '食物')}</button>`
      ).join('');
      fields.insertAdjacentElement('afterbegin', box);
      box.onclick = (e) => {
        const b = e.target.closest('[data-fq]');
        if (!b) return;
        const c = cats[+b.getAttribute('data-fq')];
        if (!c) return;
        const set = (k, v) => {
          const el = card.querySelector(`[data-df="${k}"]`);
          if (el && v != null) el.value = v;
          if (draft.data) draft.data[k] = v;
        };
        set('food', c.display || c.name);
        set('kcal', c.kcal);
        set('protein', c.protein);
        set('carb', c.carb);
        set('fat', c.fat);
        if (typeof toast === 'function') toast('已填模板（可再改）', 'success');
      };
    }

    function decorateFoodDraftCard(draft) {
      const card = $('#p0-draft-card');
      if (!card || !draft) return;
      card.classList.add('food-stable');
      ensureSingleDraftCard();
      backupAttachments(draft);
      let strip = card.querySelector('.draft-attach-strip');
      if (!strip) {
        strip = document.createElement('div');
        strip.className = 'draft-attach-strip';
        const fields = card.querySelector('#p0-draft-fields') || card;
        fields.insertAdjacentElement('beforebegin', strip);
      }
      const n = (draft.attachments || []).length;
      strip.innerHTML = `<span class="att-pill">📷 ${n} 張相片</span>` +
        (n ? '<span>更改類型／重繪不會遺失相片</span>' : '<span>未有相 — 仍可純文字確認</span>');
      let err = card.querySelector('.draft-err');
      if (!err) {
        err = document.createElement('div');
        err.className = 'draft-err';
        err.id = 'p0-draft-err';
        const actions = card.querySelector('.cc-actions') || card;
        actions.insertAdjacentElement('beforebegin', err);
      }
      dietQuickTemplates(card, draft);
    }

    function stabilizeFoodConfirm() {
      // wrap renderDraftConfirmCard
      if (typeof renderDraftConfirmCard === 'function' && !renderDraftConfirmCard._uxFood) {
        const _r = renderDraftConfirmCard;
        function wrapped(draft) {
          if (!draft) return _r(draft);
          backupAttachments(draft);
          // remove any existing draft card first (single pending)
          document.querySelectorAll('#p0-draft-card').forEach(el => {
            const parent = el.closest('.chat-msg');
            if (parent) parent.remove(); else el.remove();
          });
          _r(draft);
          try {
            if (draft.recordType === 'diet') decorateFoodDraftCard(draft);
            else {
              const card = $('#p0-draft-card');
              if (card) {
                backupAttachments(draft);
                let strip = card.querySelector('.draft-attach-strip');
                if (!strip) {
                  strip = document.createElement('div');
                  strip.className = 'draft-attach-strip';
                  (card.querySelector('#p0-draft-fields') || card).insertAdjacentElement('beforebegin', strip);
                }
                strip.innerHTML = `<span class="att-pill">📷 ${(draft.attachments || []).length} 張</span><span>附件已鎖定</span>`;
              }
            }
          } catch (e) { console.warn('decorate draft', e); }
        }
        wrapped._uxFood = true;
        renderDraftConfirmCard = wrapped;
      }

      // wrap bindDraftCardEvents for safer type change + commit
      if (typeof bindDraftCardEvents === 'function' && !bindDraftCardEvents._uxFood) {
        const _b = bindDraftCardEvents;
        bindDraftCardEvents = function() {
          _b();
          const card = $('#p0-draft-card');
          if (!card || !chatPendingDraft) return;
          backupAttachments(chatPendingDraft);
          const typeSel = $('#p0-draft-type');
          if (typeSel) {
            typeSel.onchange = () => {
              const atts = backupAttachments(chatPendingDraft);
              const raw = chatPendingDraft.rawText || '';
              const t = typeSel.value;
              let next;
              if (t === 'diet') next = buildStubDietDraft(atts, raw);
              else if (t === 'exercise') next = buildStubExerciseDraft(atts, raw);
              else if (t === 'body') next = buildStubBodyDraft(atts, raw);
              else next = buildGenericDraft(t, atts, raw);
              next.attachments = atts.slice();
              next._attachBackup = atts.slice();
              next.rawText = raw;
              chatPendingDraft = next;
              const parent = card.closest('.chat-msg');
              if (parent) parent.remove(); else card.remove();
              renderDraftConfirmCard(chatPendingDraft);
            };
          }
          const conf = $('#p0-draft-confirm');
          if (conf) {
            conf.onclick = () => {
              if (_draftCommitLock) return;
              const err = $('#p0-draft-err');
              const typeSel2 = $('#p0-draft-type');
              const rt = typeSel2 ? typeSel2.value : (chatPendingDraft && chatPendingDraft.recordType);
              if (rt === 'diet') {
                const foodEl = document.querySelector('#p0-draft-fields [data-df="food"]');
                const food = (foodEl && foodEl.value || '').trim();
                if (!food || food === '（請填食物名）' || food === '（未命名食物）') {
                  if (err) { err.textContent = '請先填食物名再確認（可點選常用模板）'; err.classList.add('show'); }
                  if (typeof toast === 'function') toast('請填食物名', 'warn');
                  foodEl && foodEl.focus();
                  return;
                }
                if (err) err.classList.remove('show');
              }
              // ensure attachments still on draft
              if (chatPendingDraft) backupAttachments(chatPendingDraft);
              _draftCommitLock = true;
              card.classList.add('committing');
              conf.disabled = true;
              conf.textContent = '入帳中…';
              try {
                commitDraftFromCard();
              } catch (e) {
                console.warn(e);
                if (typeof toast === 'function') toast('確認失敗，草稿仍在', 'warn');
                remountPendingDraftIfNeeded();
              } finally {
                setTimeout(() => { _draftCommitLock = false; }, 600);
              }
            };
          }
          const can = $('#p0-draft-cancel');
          if (can) {
            can.onclick = async () => {
              if (_draftCommitLock) return;
              const atts = (chatPendingDraft && chatPendingDraft.attachments) || [];
              for (const a of atts) {
                if (a.id) try { await idbDel(a.id); } catch (_) {}
              }
              chatPendingDraft = null;
              try { if (typeof chatPendingImage !== 'undefined') chatPendingImage = null; } catch (_) {}
              try { if (typeof chatPendingImages !== 'undefined') chatPendingImages = []; } catch (_) {}
              const parent = card.closest('.chat-msg');
              if (parent) parent.remove(); else card.remove();
              if (typeof appendChatMessage === 'function') {
                appendChatMessage({
                  messageId: typeof msgUid === 'function' ? msgUid() : ('m' + Date.now()),
                  ownerUser: currentUser, role: 'system', createdAt: typeof nowTs === 'function' ? nowTs() : '',
                  text: '已取消圖片入帳', card: { type: 'undo' }
                });
              }
              if (typeof renderChatThread === 'function') renderChatThread();
              if (typeof toast === 'function') toast('已取消', 'warn');
            };
          }
        };
        bindDraftCardEvents._uxFood = true;
      }

      // After renderChatThread, remount pending draft so it is not lost
      if (typeof renderChatThread === 'function' && !renderChatThread._uxFood) {
        const _t = renderChatThread;
        renderChatThread = function() {
          _t.apply(this, arguments);
          try { remountPendingDraftIfNeeded(); } catch (e) { console.warn('remount draft', e); }
        };
        renderChatThread._uxFood = true;
      }

      // commitDraftFromCard: remove draft card DOM + clear pending images
      if (typeof commitDraftFromCard === 'function' && !commitDraftFromCard._uxFood) {
        const _c = commitDraftFromCard;
        commitDraftFromCard = function() {
          if (!chatPendingDraft) return;
          backupAttachments(chatPendingDraft);
          const card = $('#p0-draft-card');
          try {
            _c.apply(this, arguments);
          } finally {
            if (card) {
              const parent = card.closest('.chat-msg');
              if (parent) parent.remove(); else card.remove();
            }
            try { if (typeof chatPendingImage !== 'undefined') chatPendingImage = null; } catch (_) {}
            try {
              if (typeof chatPendingImages !== 'undefined' && Array.isArray(chatPendingImages)) chatPendingImages.length = 0;
            } catch (_) {}
            // clear file inputs
            document.querySelectorAll('#chat-image-input, #chat-file, input[type="file"][data-chat]').forEach(inp => {
              try { inp.value = ''; } catch (_) {}
            });
          }
        };
        commitDraftFromCard._uxFood = true;
      }
    }

    function bootUxOcr() {
      try {
        enhanceBodyOcrFromRefs();
        stabilizeFoodConfirm();
        mountBodyOcrFixtures();
        // self-test quietly in console
        const scores = Object.keys(BODY_OCR_FIXTURES).map(scoreFixture);
        window.FFL_UxOcr = { BODY_OCR_FIXTURES, scoreFixture, scores, remountPendingDraftIfNeeded };
        console.info('[FFL OCR refs]', scores.map(s => s && (s.id + ' ' + s.ok + '/' + s.total)));
      } catch (e) { console.warn('bootUxOcr', e); }
    }

    if (typeof showForm === 'function') {
      const _sf = showForm;
      showForm = function(type) {
        _sf.apply(this, arguments);
        if (type === 'body') setTimeout(mountBodyOcrFixtures, 50);
      };
    }

    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(bootUxOcr, 'uxOcr');
    else { setTimeout(bootUxOcr, 140); }
  })();

  /* ========== BloomBody soft-delete recycle bin (30 days) ========== */
  (function bootTrashBin() {
    const TRASH_DAYS = 30;
    const MS_DAY = 86400000;

    function isTrashed(r) {
      return !!(r && r.deletedAt);
    }

    function daysLeft(r) {
      if (!r || !r.deletedAt) return TRASH_DAYS;
      const t = Date.parse(r.deletedAt);
      if (!Number.isFinite(t)) return TRASH_DAYS;
      const age = Date.now() - t;
      return Math.max(0, Math.ceil(TRASH_DAYS - age / MS_DAY));
    }

    function myTrash() {
      return (state.records || []).filter(r => r.ownerUser === currentUser && isTrashed(r))
        .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
    }

    // Active records only
    const _myRecords = typeof myRecords === 'function' ? myRecords : null;
    if (_myRecords) {
      myRecords = function() {
        return _myRecords().filter(r => !isTrashed(r));
      };
    }

    const _recordsForChart = typeof recordsForChart === 'function' ? recordsForChart : null;
    if (_recordsForChart) {
      recordsForChart = function(user, publicOnly) {
        return _recordsForChart(user, publicOnly).filter(r => !isTrashed(r));
      };
    }

    const _visiblePartner = typeof visiblePartnerRecords === 'function' ? visiblePartnerRecords : null;
    if (_visiblePartner) {
      visiblePartnerRecords = function() {
        return _visiblePartner().filter(r => !isTrashed(r));
      };
    }

    const _computeStreak = typeof computeStreak === 'function' ? computeStreak : null;
    if (_computeStreak) {
      computeStreak = function(user) {
        const keys = new Set(
          (state.records || []).filter(r => r.ownerUser === user && !isTrashed(r)).map(r => tsDateKey(r.timestamp))
        );
        let streak = 0;
        const d = new Date();
        const todayHas = keys.has(todayKey());
        if (!todayHas) d.setDate(d.getDate() - 1);
        for (;;) {
          const p = n => String(n).padStart(2, '0');
          const k = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
          if (keys.has(k)) { streak++; d.setDate(d.getDate() - 1); }
          else break;
        }
        return { streak, todayHas };
      };
    }

    // Exports: drop trashed rows even for admin ALL export (optional include via meta later)
    const _exportCSV = typeof exportCSV === 'function' ? exportCSV : null;
    if (_exportCSV) {
      exportCSV = function(allUsers) {
        const bak = state.records;
        try {
          state.records = bak.filter(r => !isTrashed(r));
          return _exportCSV(allUsers);
        } finally { state.records = bak; }
      };
    }
    const _exportJSON = typeof exportJSON === 'function' ? exportJSON : null;
    if (_exportJSON) {
      exportJSON = function(allUsers) {
        const bak = state.records;
        try {
          state.records = bak.filter(r => !isTrashed(r));
          return _exportJSON(allUsers);
        } finally { state.records = bak; }
      };
    }

    async function purgeRecordHard(recordId, owner) {
      const idx = state.records.findIndex(r => r.recordId === recordId && (!owner || r.ownerUser === owner));
      if (idx < 0) return false;
      const removed = state.records[idx];
      for (const id of collectAttachmentIds(removed)) {
        try { await idbDel(id); } catch (_) {}
      }
      state.records.splice(idx, 1);
      return true;
    }

    async function softDeleteRecord(recordId) {
      const rec = state.records.find(r => r.recordId === recordId && r.ownerUser === currentUser);
      if (!rec) return false;
      if (isTrashed(rec)) return true;
      rec.deletedAt = new Date().toISOString();
      rec.isPublic = false; // hide from circle while trashed
      saveState();
      return true;
    }

    async function restoreRecord(recordId) {
      const rec = state.records.find(r => r.recordId === recordId && r.ownerUser === currentUser);
      if (!rec || !isTrashed(rec)) return false;
      delete rec.deletedAt;
      saveState();
      return true;
    }

    async function purgeExpiredTrash() {
      const cutoff = Date.now() - TRASH_DAYS * MS_DAY;
      const doomed = (state.records || []).filter(r => {
        if (!isTrashed(r)) return false;
        const t = Date.parse(r.deletedAt);
        return Number.isFinite(t) && t < cutoff;
      });
      for (const r of doomed) {
        await purgeRecordHard(r.recordId, r.ownerUser);
      }
      if (doomed.length) saveState();
      return doomed.length;
    }

    // Wrap hard delete → soft delete (photos stay until purge)
    const _deleteRecordWithPhotos = typeof deleteRecordWithPhotos === 'function' ? deleteRecordWithPhotos : null;
    if (_deleteRecordWithPhotos) {
      deleteRecordWithPhotos = async function(recordId) {
        return softDeleteRecord(recordId);
      };
    }

    // Chat undo → soft delete (keep photos)
    const _handleChatUndo = typeof handleChatUndo === 'function' ? handleChatUndo : null;
    if (_handleChatUndo) {
      handleChatUndo = async function() {
        // Monkey-patch splice path by intercepting via softDelete after finding target —
        // simpler: call original but first convert hard path. Re-implement thin wrapper:
        let targetId = null;
        while (chatUndoStack.length && !targetId) {
          const cand = chatUndoStack.pop();
          if (state.records.some(r => r.recordId === cand && r.ownerUser === currentUser && !isTrashed(r))) targetId = cand;
        }
        if (!targetId) targetId = chatPendingUndoId;
        if (!targetId) {
          const last = myRecords().filter(r => r.source && r.source.channel === 'chat')
            .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
          if (!last) {
            appendChatMessage({
              messageId: msgUid(), ownerUser: currentUser, role: 'bot',
              createdAt: nowTs(), text: '沒有可取消的對話記錄。可連續回覆「取消」撤銷多筆。', card: null
            });
            renderChatThread();
            return;
          }
          targetId = last.recordId;
        }
        const removed = state.records.find(r => r.recordId === targetId && r.ownerUser === currentUser && !isTrashed(r));
        if (!removed) {
          toast('找不到可取消的記錄', 'warn');
          chatPendingUndoId = chatUndoStack.length ? chatUndoStack[chatUndoStack.length - 1] : null;
          return;
        }
        await softDeleteRecord(targetId);
        chatUndoStack = chatUndoStack.filter(id => id !== targetId);
        chatPendingUndoId = chatUndoStack.length ? chatUndoStack[chatUndoStack.length - 1] : null;
        const left = chatUndoStack.length;
        appendChatMessage({
          messageId: msgUid(), ownerUser: currentUser, role: 'system',
          createdAt: nowTs(),
          text: `已移去回收站：${TYPE_LABEL[removed.recordType] || ''} ${typeof summarizeRecord === 'function' ? summarizeRecord(removed) : ''}` +
            (left ? `（尚可再取消 ${left} 筆）` : '（設定 → 回收站可還原，30 日內）'),
          card: { type: 'undo' }
        });
        renderChatThread();
        updateChatMiniStats();
        if (typeof renderToday === 'function') renderToday();
      };
    }

    function ensureTrashCard() {
      const page = document.getElementById('page-settings');
      if (!page) return null;
      let card = document.getElementById('trash-bin-card');
      if (card) return card;
      card = document.createElement('div');
      card.className = 'card settings-section trash-card';
      card.setAttribute('data-stab', 'advanced');
      card.id = 'trash-bin-card';
      card.innerHTML = `
        <div class="trash-head">
          <h3 style="margin:0;">回收站（30 日）</h3>
          <span class="trash-count" id="trash-count"></span>
        </div>
        <p class="hint">刪除記錄會先入回收站；相片暫保留。超過 30 日自動永久刪除。全清／清除「我」仍然即時硬刪。</p>
        <div class="trash-list" id="trash-list"></div>
        <div class="quick-btns" style="margin-top:8px;">
          <button class="btn btn-secondary btn-sm" type="button" id="btn-trash-restore-all">全部還原</button>
          <button class="btn btn-danger btn-sm" type="button" id="btn-trash-empty">清空回收站</button>
        </div>
      `;
      // Insert before "刪除我的資料" section if possible
      const clearSec = Array.from(page.querySelectorAll('.settings-section')).find(el =>
        /刪除我的資料|清除「我」/.test(el.textContent || '')
      );
      if (clearSec) page.insertBefore(card, clearSec);
      else page.appendChild(card);

      card.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-trash-act]');
        if (!btn) return;
        const id = btn.getAttribute('data-rid');
        const act = btn.getAttribute('data-trash-act');
        if (act === 'restore') {
          await restoreRecord(id);
          toast('已還原記錄', 'success');
          renderTrashBin();
          if (typeof renderHistory === 'function') renderHistory();
          if (typeof updateChatMiniStats === 'function') updateChatMiniStats();
          if (typeof renderToday === 'function') renderToday();
        } else if (act === 'purge') {
          if (!confirm('永久刪除呢筆同相關相片？無法復原。')) return;
          await purgeRecordHard(id, currentUser);
          saveState();
          toast('已永久刪除', 'success');
          renderTrashBin();
        }
      });

      const btnRestoreAll = card.querySelector('#btn-trash-restore-all');
      const btnEmpty = card.querySelector('#btn-trash-empty');
      if (btnRestoreAll) btnRestoreAll.onclick = async () => {
        const list = myTrash();
        if (!list.length) { toast('回收站是空的', 'warn'); return; }
        if (!confirm(`還原 ${list.length} 筆記錄？`)) return;
        for (const r of list) await restoreRecord(r.recordId);
        toast('已全部還原', 'success');
        renderTrashBin();
        if (typeof renderHistory === 'function') renderHistory();
        if (typeof renderToday === 'function') renderToday();
      };
      if (btnEmpty) btnEmpty.onclick = async () => {
        const list = myTrash();
        if (!list.length) { toast('回收站是空的', 'warn'); return; }
        if (!confirm(`永久清空回收站（${list.length} 筆）？無法復原。`)) return;
        for (const r of list) await purgeRecordHard(r.recordId, currentUser);
        saveState();
        toast('回收站已清空', 'success');
        renderTrashBin();
      };
      return card;
    }

    function renderTrashBin() {
      ensureTrashCard();
      const listEl = document.getElementById('trash-list');
      const countEl = document.getElementById('trash-count');
      if (!listEl) return;
      const list = myTrash();
      if (countEl) countEl.textContent = list.length ? `${list.length} 筆` : '空';
      if (!list.length) {
        listEl.innerHTML = '<div class="trash-empty">回收站是空的。刪除歷史／對話記錄後會出現在此。</div>';
        return;
      }
      listEl.innerHTML = list.map(r => {
        const left = daysLeft(r);
        const sum = typeof summarizeRecord === 'function' ? summarizeRecord(r) : '';
        return `<div class="trash-item" data-rid="${escapeHtml(r.recordId)}">
          <div class="ti-top">
            <span class="ti-type">${TYPE_LABEL[r.recordType] || r.recordType}</span>
            <span class="trash-days-left">剩 ${left} 日</span>
          </div>
          <div class="ti-meta">刪除於 ${escapeHtml((r.deletedAt || '').replace('T', ' ').slice(0, 19))} · 原時間 ${escapeHtml(r.timestamp || '')}</div>
          <div class="ti-body">${sum}</div>
          <div class="ti-actions">
            <button class="btn btn-secondary btn-sm" type="button" data-trash-act="restore" data-rid="${escapeHtml(r.recordId)}">還原</button>
            <button class="btn btn-danger btn-sm" type="button" data-trash-act="purge" data-rid="${escapeHtml(r.recordId)}">永久刪除</button>
          </div>
        </div>`;
      }).join('');
    }

    // Toast copy on delete actions (history already says 刪除 — soft now)
    const _toast = typeof toast === 'function' ? toast : null;
    // Patch showPage to refresh trash on settings
    const _showPage = typeof showPage === 'function' ? showPage : null;
    if (_showPage) {
      showPage = function(name) {
        _showPage(name);
        if (name === 'settings') {
          try { renderTrashBin(); } catch (_) {}
        }
      };
    }

    // Soft-delete confirm message tweak via MutationObserver on history? Skip — toast after call sites still say 已刪除.
    // Override toast temporarily when delete finishes — too fragile. Update call-site toasts by wrapping deleteRecordWithPhotos callers is hard.
    // Provide helper used if we rebind history — already soft. Update toast strings by intercepting:
    if (_toast) {
      toast = function(msg, type) {
        if (msg === '已刪除記錄同相片') msg = '已移去回收站（設定可還原，30 日）';
        return _toast(msg, type);
      };
    }

    // Export: ensure CSV/JSON use myRecords (already patched). For allUsers export exclude trash.
    // Patch export rows if they use state.records directly — checked earlier: myRecords() or allUsers slice.
    // Soft-filter allUsers exports:
    try {
      const exportBtns = ['btn-export-csv', 'btn-export-json', 'btn-export-all'];
      // no-op; myRecords covers user export; admin export may include trash — filter in place via wrap of download helpers if needed
    } catch (_) {}

    async function initTrash() {
      ensureTrashCard();
      const n = await purgeExpiredTrash();
      if (n) console.log('[FFL trash] purged expired', n);
      renderTrashBin();
      // hint on clear-my-data section
      const hint = document.querySelector('#btn-clear-my-data');
      if (hint && hint.parentElement) {
        const p = hint.parentElement.querySelector('.hint');
        if (p && !/回收站/.test(p.textContent || '')) {
          p.textContent = '單筆刪除會入回收站 30 日；此按鈕與「清除全部」仍為即時硬刪（含回收站），無法復原。';
        }
      }
    }

    window.FFL_Trash = {
      softDeleteRecord, restoreRecord, purgeRecordHard, purgeExpiredTrash,
      myTrash, daysLeft, renderTrashBin, TRASH_DAYS
    };

    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(initTrash, 'trash');
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(initTrash, 180));
    else setTimeout(initTrash, 180);
  })();

  /* ========== BloomBody cloud AI hooks + seal watermark ========== */
  (function injectCloudAiAndSeal() {
    const KEY_API = 'fitFitLady_v1_cloudApiKey'; // separate from state export
    const DEFAULT_CLOUD = {
      baseUrl: '',
      foodVision: false,
      exerciseOcr: false,
      weeklyReport: false,
      timeoutMs: 12000
    };

    function ensureCloudMeta() {
      if (!state.meta) state.meta = {};
      if (!state.meta.cloudAi) state.meta.cloudAi = Object.assign({}, DEFAULT_CLOUD);
      const c = state.meta.cloudAi;
      Object.keys(DEFAULT_CLOUD).forEach(k => {
        if (c[k] == null) c[k] = DEFAULT_CLOUD[k];
      });
      return c;
    }

    function getApiKey() {
      try { return localStorage.getItem(KEY_API) || ''; } catch (_) { return ''; }
    }
    function setApiKey(v) {
      try {
        if (!v) localStorage.removeItem(KEY_API);
        else localStorage.setItem(KEY_API, v);
      } catch (_) {}
    }

    function isOnline() {
      try { return typeof navigator !== 'undefined' ? navigator.onLine !== false : true; } catch (_) { return true; }
    }

    function cloudEnabled(feature) {
      const c = ensureCloudMeta();
      if (!c.baseUrl || !String(c.baseUrl).trim()) return false;
      if (!isOnline()) return false;
      if (feature === 'foodVision') return !!c.foodVision;
      if (feature === 'exerciseOcr') return !!c.exerciseOcr;
      if (feature === 'weeklyReport') return !!c.weeklyReport;
      return false;
    }

    function normalizeBase(url) {
      return String(url || '').trim().replace(/\/+$/, '');
    }

    async function cloudFetch(path, body, opts) {
      const c = ensureCloudMeta();
      const base = normalizeBase(c.baseUrl);
      if (!base) throw new Error('no baseUrl');
      const key = getApiKey();
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const t = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (_) {} }, c.timeoutMs || 12000);
      try {
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (key) headers['Authorization'] = 'Bearer ' + key;
        const res = await fetch(base + path, {
          method: (opts && opts.method) || 'POST',
          headers,
          body: body != null ? JSON.stringify(body) : undefined,
          signal: ctrl ? ctrl.signal : undefined,
          credentials: 'omit',
          mode: 'cors'
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error('HTTP ' + res.status + ' ' + txt.slice(0, 120));
        }
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) return await res.json();
        return { text: await res.text() };
      } finally {
        clearTimeout(t);
      }
    }

    async function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
    }

    async function idbBlobById(id) {
      try {
        const row = await idbGet(id);
        return row && row.blob ? row.blob : null;
      } catch (_) { return null; }
    }

    /** POST /api/food-vision */
    async function cloudFoodVision({ caption, attachments }) {
      const images = [];
      for (const a of (attachments || []).slice(0, 3)) {
        if (!a || !a.id) continue;
        const blob = await idbBlobById(a.id);
        if (!blob) continue;
        const dataUrl = await blobToDataUrl(blob);
        images.push({ id: a.id, mime: a.mime || blob.type || 'image/jpeg', dataUrl: dataUrl.slice(0, 1) === 'd' ? dataUrl : null, bytes: a.bytes || blob.size });
      }
      // Prefer sending first image as base64; server may accept caption-only
      const payload = {
        caption: caption || '',
        locale: (state.meta && state.meta.locale) || 'zh-Hant',
        images: images.map(im => ({ id: im.id, mime: im.mime, bytes: im.bytes, dataUrl: im.dataUrl }))
      };
      return cloudFetch('/api/food-vision', payload);
    }

    /** POST /api/exercise-ocr — image blob or text */
    async function cloudExerciseOcr({ blob, caption, mime }) {
      let dataUrl = null;
      if (blob) dataUrl = await blobToDataUrl(blob);
      return cloudFetch('/api/exercise-ocr', {
        caption: caption || '',
        mime: mime || (blob && blob.type) || 'image/jpeg',
        dataUrl,
        locale: (state.meta && state.meta.locale) || 'zh-Hant'
      });
    }

    /** POST /api/weekly-report */
    async function cloudWeeklyReport(stats) {
      return cloudFetch('/api/weekly-report', {
        user: currentUser,
        locale: (state.meta && state.meta.locale) || 'zh-Hant',
        stats: stats || {},
        goals: (state.users[currentUser] && state.users[currentUser].goals) || {}
      });
    }

    function applyFoodVisionResult(draft, res) {
      if (!draft || !draft.data || !res) return draft;
      const food = res.food || res.label || res.name || res.display;
      if (food) draft.data.food = food;
      if (res.meal) draft.data.meal = res.meal;
      if (res.kcal != null) draft.data.kcal = +res.kcal;
      if (res.protein != null) draft.data.protein = +res.protein;
      if (res.carb != null) draft.data.carb = +res.carb;
      if (res.fat != null) draft.data.fat = +res.fat;
      if (res.sugar != null) draft.data.sugar = +res.sugar;
      if (res.portion) draft.data.portion = res.portion;
      const conf = res.confidence != null ? +res.confidence : 0.75;
      draft.data.aiSuggest = {
        provider: 'cloud',
        rawLabels: res.labels || (food ? [food] : []),
        confidence: conf,
        status: 'pending_confirm',
        source: 'cloud_food_vision',
        model: res.model || null
      };
      draft.summary = `雲端食物辨認 · ${food || '（請確認）'}` +
        (draft.data.kcal != null ? ` · 約 ${draft.data.kcal} kcal` : '') + '（請確認）';
      draft.conf = Math.max(draft.conf || 0.55, Math.min(0.95, conf));
      draft.stub = 'cloud_food_vision';
      return draft;
    }

    function applyExerciseOcrResult(draft, res) {
      if (!draft || !draft.data || !res) return draft;
      const text = res.text || res.rawText || '';
      if (text) {
        draft.rawText = (draft.rawText ? draft.rawText + '\n' : '') + text;
        if (typeof parseExerciseMetrics === 'function') {
          draft.data = parseExerciseMetrics(text, draft.data);
        } else {
          draft.data.detail = text;
        }
      }
      if (res.exType) draft.data.exType = res.exType;
      if (res.minutes != null) draft.data.minutes = +res.minutes;
      if (res.kcal != null) draft.data.kcal = +res.kcal;
      if (res.distanceKm != null) draft.data.distanceKm = +res.distanceKm;
      if (res.avgHr != null) draft.data.avgHr = +res.avgHr;
      draft.data.ocr = {
        provider: 'cloud',
        rawText: text,
        confidence: res.confidence != null ? +res.confidence : 0.7,
        status: 'ok',
        model: res.model || null
      };
      if (typeof buildExerciseEvaluation === 'function') {
        draft.data._eval = buildExerciseEvaluation(draft.data);
      }
      draft.summary = `雲端運動 OCR · ${draft.data.exType || '其他'}` +
        (draft.data.minutes ? ' ' + draft.data.minutes + '分' : '') +
        (draft.data.kcal ? ' · ' + draft.data.kcal + 'kcal' : '');
      draft.stub = 'cloud_exercise_ocr';
      draft.conf = Math.max(draft.conf || 0.55, 0.72);
      return draft;
    }

    async function enrichDraftWithCloud(draft) {
      if (!draft) return draft;
      try {
        if (draft.recordType === 'diet' && cloudEnabled('foodVision')) {
          toast('雲端食物辨認中…', 'info');
          const res = await cloudFoodVision({ caption: draft.rawText || '', attachments: draft.attachments || [] });
          applyFoodVisionResult(draft, res);
          if (typeof renderDraftConfirmCard === 'function' && chatPendingDraft === draft) {
            renderDraftConfirmCard(draft);
          }
        } else if (draft.recordType === 'exercise' && cloudEnabled('exerciseOcr')) {
          // Prefer first attachment image
          let blob = null;
          const atts = draft.attachments || [];
          if (atts[0] && atts[0].id) blob = await idbBlobById(atts[0].id);
          if (blob || (draft.rawText && draft.rawText.trim())) {
            toast('雲端運動 OCR 中…', 'info');
            const res = await cloudExerciseOcr({ blob, caption: draft.rawText || '', mime: atts[0] && atts[0].mime });
            applyExerciseOcrResult(draft, res);
            if (typeof renderDraftConfirmCard === 'function' && chatPendingDraft === draft) {
              renderDraftConfirmCard(draft);
            }
          }
        }
      } catch (e) {
        console.warn('[FFL cloud]', e);
        toast('雲端 AI 暫不可用，沿用離線估計', 'warn');
      }
      return draft;
    }

    // Wrap renderDraftConfirmCard to kick async cloud enrich once
    if (typeof renderDraftConfirmCard === 'function') {
      const _rdc = renderDraftConfirmCard;
      renderDraftConfirmCard = function(draft) {
        _rdc(draft);
        if (!draft || draft._cloudTried) return;
        const need =
          (draft.recordType === 'diet' && cloudEnabled('foodVision')) ||
          (draft.recordType === 'exercise' && cloudEnabled('exerciseOcr'));
        if (!need) return;
        draft._cloudTried = true;
        enrichDraftWithCloud(draft);
      };
    }

    // Wrap ocrImageBlob (bodycomp) to try cloud exercise/body OCR path when exerciseOcr on
    // Hook via window later if exposed; also wrap after delay looking for ocrImageBlob in scope — it's inside IIFE.
    // Instead: patch parseBodyCompText callers via maybeOcr — skip body; focus exercise draft + weekly.

    // Weekly summary: prefer cloud narrative when enabled
    if (typeof buildWeeklySummaryText === 'function') {
      const _bw = buildWeeklySummaryText;
      buildWeeklySummaryText = function() {
        // sync fallback always available; cloud path is async via button wrap
        return _bw();
      };
      buildWeeklySummaryText._local = _bw;
    }

    function collectWeeklyStats() {
      const local = (buildWeeklySummaryText._local || buildWeeklySummaryText)();
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const ymd = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
      const start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0,0,0,0);
      const sk = ymd(start), ek = ymd(now);
      const recs = (typeof myRecords === 'function' ? myRecords() : []).filter(r => {
        const k = tsDateKey(r.timestamp); return k >= sk && k <= ek;
      });
      let kcal = 0, protein = 0, exmin = 0, sleepH = 0, sleepN = 0;
      const weights = [];
      recs.forEach(r => {
        if (r.recordType === 'diet') { kcal += +(r.data.kcal || 0); protein += +(r.data.protein || 0); }
        if (r.recordType === 'exercise') exmin += +(r.data.minutes || 0);
        if (r.recordType === 'sleep' && r.data.duration != null) { sleepH += +r.data.duration; sleepN++; }
        if (r.recordType === 'body' && r.data.weight != null) weights.push(+r.data.weight);
      });
      return {
        localText: local,
        checkins: new Set(recs.map(r => tsDateKey(r.timestamp))).size,
        kcal: Math.round(kcal),
        protein: Math.round(protein),
        exerciseMin: Math.round(exmin),
        avgSleep: sleepN ? +(sleepH / sleepN).toFixed(1) : null,
        weights,
        from: sk,
        to: ek
      };
    }

    async function weeklyTextPreferCloud() {
      const stats = collectWeeklyStats();
      if (!cloudEnabled('weeklyReport')) return stats.localText;
      try {
        toast('雲端週報生成中…', 'info');
        const res = await cloudWeeklyReport(stats);
        const txt = res.text || res.summary || res.report;
        if (txt && String(txt).trim()) return String(txt).trim();
      } catch (e) {
        console.warn('[FFL cloud weekly]', e);
        toast('雲端週報失敗，用本機摘要', 'warn');
      }
      return stats.localText;
    }

    // Rebind weekly-to-chat button (and dash report push)
    function wireWeeklyButtons() {
      const btnWeekly = document.getElementById('btn-weekly-to-chat');
      if (btnWeekly && !btnWeekly.dataset.cloudWired) {
        btnWeekly.dataset.cloudWired = '1';
        btnWeekly.addEventListener('click', async (ev) => {
          // Let original also fire — prevent double by stopping and handling ourselves if we can detect
          // Original was set via onclick; replace onclick
        }, true);
        btnWeekly.onclick = async () => {
          const txt = await weeklyTextPreferCloud();
          appendChatMessage({
            messageId: msgUid(), ownerUser: currentUser, role: 'bot',
            createdAt: nowTs(), text: txt, card: null
          });
          toast('週報已寫入對話', 'success');
          if (typeof showPage === 'function') showPage('chat');
        };
      }
    }

    // Settings UI
    function ensureCloudSettingsCard() {
      const page = document.getElementById('page-settings');
      if (!page) return null;
      let card = document.getElementById('cloud-ai-card');
      if (card) return card;
      card = document.createElement('div');
      card.className = 'card settings-section cloud-ai-card';
      card.id = 'cloud-ai-card';
      card.innerHTML = `
        <h3>雲端 AI（Server） <span class="cloud-ai-badge">可選</span></h3>
        <p class="hint">今晚上 server 後填 API Base。金鑰只存於本機（不納入 JSON 匯出）。關閉或離線時自動用本機 stub。</p>
        <div class="form-group"><label>API Base URL</label>
          <input type="url" id="cai-base" placeholder="https://your-server.example.com" autocomplete="off">
        </div>
        <div class="form-group"><label>API Key（可選）</label>
          <input type="password" id="cai-key" placeholder="Bearer token · 只存本機" autocomplete="off">
        </div>
        <div class="cai-row">
          <label><input type="checkbox" id="cai-food"> 食物視覺辨認</label>
          <label><input type="checkbox" id="cai-ex"> 運動截圖 OCR</label>
          <label><input type="checkbox" id="cai-week"> 週報／月報文案</label>
        </div>
        <div class="quick-btns">
          <button class="btn btn-secondary btn-sm" type="button" id="btn-cai-save">儲存雲端 AI 設定</button>
          <button class="btn btn-ghost btn-sm" type="button" id="btn-cai-ping">測試連線</button>
        </div>
        <div class="cai-status off" id="cai-status">未啟用 · 離線 stub</div>
        <p class="stub-note" style="margin-top:6px;">Endpoints：<code>/api/food-vision</code> · <code>/api/exercise-ocr</code> · <code>/api/weekly-report</code> · <code>/api/health</code>（雲端辨認／週報接口）</p>
      `;
      const health = document.getElementById('health-sync-panel');
      if (health) page.insertBefore(card, health);
      else {
        const chatSet = Array.from(page.querySelectorAll('.settings-section')).find(el => /對話打卡設定/.test(el.textContent || ''));
        if (chatSet) page.insertBefore(card, chatSet);
        else page.appendChild(card);
      }

      card.querySelector('#btn-cai-save').onclick = () => {
        const c = ensureCloudMeta();
        c.baseUrl = normalizeBase(document.getElementById('cai-base').value);
        c.foodVision = !!document.getElementById('cai-food').checked;
        c.exerciseOcr = !!document.getElementById('cai-ex').checked;
        c.weeklyReport = !!document.getElementById('cai-week').checked;
        setApiKey(document.getElementById('cai-key').value.trim());
        saveState();
        refreshCloudStatus();
        toast('雲端 AI 設定已儲存', 'success');
      };
      card.querySelector('#btn-cai-ping').onclick = async () => {
        const c = ensureCloudMeta();
        // read form first
        c.baseUrl = normalizeBase(document.getElementById('cai-base').value) || c.baseUrl;
        if (!c.baseUrl) { toast('請先填 API Base URL', 'warn'); return; }
        try {
          toast('測試連線…', 'info');
          const res = await cloudFetch('/api/health', null, { method: 'GET' });
          toast('連線 OK' + (res && res.ok != null ? '' : ''), 'success');
          refreshCloudStatus(true);
        } catch (e) {
          console.warn(e);
          toast('連線失敗：' + (e.message || e), 'warn');
          refreshCloudStatus(false);
        }
      };
      return card;
    }

    function fillCloudSettingsForm() {
      ensureCloudSettingsCard();
      const c = ensureCloudMeta();
      const base = document.getElementById('cai-base');
      const key = document.getElementById('cai-key');
      const food = document.getElementById('cai-food');
      const ex = document.getElementById('cai-ex');
      const week = document.getElementById('cai-week');
      if (base) base.value = c.baseUrl || '';
      if (key) key.value = getApiKey();
      if (food) food.checked = !!c.foodVision;
      if (ex) ex.checked = !!c.exerciseOcr;
      if (week) week.checked = !!c.weeklyReport;
      refreshCloudStatus();
    }

    function refreshCloudStatus(pingOk) {
      const el = document.getElementById('cai-status');
      if (!el) return;
      const c = ensureCloudMeta();
      const any = c.foodVision || c.exerciseOcr || c.weeklyReport;
      const online = isOnline();
      if (!c.baseUrl || !any) {
        el.className = 'cai-status off';
        el.textContent = '未啟用 · 離線 stub';
      } else if (!online) {
        el.className = 'cai-status off';
        el.textContent = '已設定但離線 · 用 stub';
      } else {
        el.className = 'cai-status on';
        const bits = [];
        if (c.foodVision) bits.push('食物');
        if (c.exerciseOcr) bits.push('運動OCR');
        if (c.weeklyReport) bits.push('週報');
        el.textContent = '已啟用：' + bits.join('／') + ' → ' + normalizeBase(c.baseUrl) +
          (pingOk === true ? ' · ping OK' : pingOk === false ? ' · ping 失敗' : '');
      }
    }

    // Seal watermark
    function applySealWatermark() {
      const app = document.getElementById('app');
      if (app) app.classList.add('ffl-seal-bg');
      const today = document.getElementById('page-today');
      if (today) today.classList.add('ffl-seal-home');
    }

    // Exclude API key from JSON export
    if (typeof exportJSON === 'function') {
      const _ej = exportJSON;
      exportJSON = function(allUsers) {
        const bak = state.meta && state.meta.cloudAi ? Object.assign({}, state.meta.cloudAi) : null;
        try {
          if (state.meta && state.meta.cloudAi) {
            // never persist key in meta; strip accidental
            delete state.meta.cloudAi.apiKey;
          }
          return _ej(allUsers);
        } finally {
          if (bak && state.meta) state.meta.cloudAi = bak;
        }
      };
    }

    if (typeof showPage === 'function') {
      const _sp = showPage;
      showPage = function(name) {
        _sp(name);
        if (name === 'settings') fillCloudSettingsForm();
        if (name === 'today' || name === 'chat') applySealWatermark();
        if (name === 'charts') wireWeeklyButtons();
      };
    }

    function bootCloudAi() {
      ensureCloudMeta();
      applySealWatermark();
      ensureCloudSettingsCard();
      fillCloudSettingsForm();
      wireWeeklyButtons();
      // re-wire after a tick in case bindEvents ran later
      setTimeout(wireWeeklyButtons, 400);
    }

    window.FFL_CloudAi = {
      ensureCloudMeta, cloudEnabled, cloudFetch, cloudFoodVision, cloudExerciseOcr,
      cloudWeeklyReport, enrichDraftWithCloud, weeklyTextPreferCloud, getApiKey, KEY_API
    };

    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(bootCloudAi, 'cloudAi');
    else setTimeout(bootCloudAi, 200);
  })();

  function bootApp() {
    try { bindHabitsUI(); } catch (e) { console.warn('bindHabitsUI', e); }
    init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
  } else {
    bootApp();
  }
/* @@FFL_FEATURES_JS@@ */
  /* ========== BloomBody features: 4-girl demos, water, mood, doc import ========== */
  (function injectFeaturesChunk() {
    function fflT(key, fallback) {
      try {
        if (typeof t === 'function') {
          const v = t(key);
          if (v && v !== key) return v;
        }
      } catch (_) {}
      return fallback;
    }
        const EXTRA_DEMO = {}; /* purged: no fake circle users */
    const MOODS_EXPANDED = [
      '😊', '😄', '🥰', '😌', '🙂', '😎',
      '💪', '🔥', '✨', '🌟', '🎯', '🏆',
      '😴', '🥱', '😷', '🤒',
      '😢', '😤', '😰', '🫠',
      '🥗', '🍎', '💧', '☕',
      '🏃', '🧘', '🎉', '💕'
    ];

    // ---- 1) Seed Amy + Bella into DEFAULT / FFL demos ----
    function seedExtraDemoUsers() {
      // No-op for production: do not seed Amy/Bella. Purge stock demos if present.
      const STOCK = { Nydia:'nydia123', Claudia:'claudia123', Friend:'friend123', Amy:'amy123', Bella:'bella123' };
      if (state && state.users) {
        Object.keys(STOCK).forEach(u => {
          if (state.users[u] && state.users[u].password === STOCK[u]) delete state.users[u];
        });
      }
      const demo = document.querySelector('.demo-creds');
      if (demo && /Amy|nydia123|claudia123|bella123|amy123/i.test(demo.innerHTML)) {
        demo.className = 'demo-creds ops-creds';
        demo.innerHTML = '<strong>營運</strong><br>內建 <code>Admin</code>（密碼見內部文件）· 一般用戶請註冊 · 圈子用邀請碼';
      }
      try { if (typeof refreshLoginUserSelect === 'function') refreshLoginUserSelect(); } catch (_) {}
      try { saveState(); } catch (_) {}
    }

        // Light public sample logs for Amy/Bella so strip shows progress (demo only, once)
    function seedCircleSamplePublicLogs() {
      if (!state.meta) state.meta = {};
      // Production: never seed fake circle logs; clear old demo seeds once
      if (Array.isArray(state.records)) {
        const before = state.records.length;
        state.records = state.records.filter(r => !(r && r.source && r.source.demo) && !(r && String(r.recordId||'').indexOf('seed_c4_')===0));
        if (state.records.length !== before) { try { saveState(); } catch (_) {} }
      }
      delete state.meta._seededCircle4;
      return;
    }

    // ---- 2) Water / hydration ----
    function todayWaterKey() {
      return (typeof todayKey === 'function') ? todayKey() : new Date().toISOString().slice(0, 10).replace(/-/g, '');
    }
    function ensureWaterMeta() {
      if (!state.meta) state.meta = {};
      if (!state.meta.hydration) state.meta.hydration = { goalMl: 2000, glassMl: 250, byDay: {} };
      if (!state.meta.hydration.byDay) state.meta.hydration.byDay = {};
      return state.meta.hydration;
    }
    function getTodayGlasses() {
      const h = ensureWaterMeta();
      const k = todayWaterKey();
      const row = h.byDay[k] || { glasses: 0, ml: 0 };
      return row;
    }
    function setTodayGlasses(n) {
      const h = ensureWaterMeta();
      const k = todayWaterKey();
      const glassMl = h.glassMl || 250;
      n = Math.max(0, Math.min(20, Math.round(n)));
      h.byDay[k] = { glasses: n, ml: n * glassMl, updatedAt: Date.now() };
      saveState();
      // mirror lightweight record for history (one per day)
      upsertWaterRecord(n, n * glassMl);
      renderWaterCard();
    }
    function upsertWaterRecord(glasses, ml) {
      if (typeof TYPE_LABEL === 'object' && TYPE_LABEL && !TYPE_LABEL.water) TYPE_LABEL.water = '飲水';
      const k = todayWaterKey();
      const existing = (state.records || []).find(r =>
        r.ownerUser === currentUser && r.recordType === 'water' && String(r.timestamp || '').slice(0, 8) === k && !r.deletedAt
      );
      const data = { glasses, ml, glassMl: (ensureWaterMeta().glassMl || 250), goalMl: ensureWaterMeta().goalMl || 2000 };
      if (existing) {
        existing.data = data;
        existing.timestamp = k + (existing.timestamp || '').slice(8) || (k + '120000');
      } else if (typeof uid === 'function') {
        state.records.push({
          recordId: uid(),
          ownerUser: currentUser,
          timestamp: k + '120000',
          recordType: 'water',
          isPublic: false,
          remark: '',
          data,
          source: { channel: 'home_water' }
        });
      }
      saveState();
    }
    function renderWaterCard() {
      const page = document.getElementById('page-today');
      if (!page || !currentUser) return;
      let card = document.getElementById('home-water-card');
      if (!card) {
        card = document.createElement('div');
        card.className = 'card home-water-card settings-section';
        card.id = 'home-water-card';
        const summary = document.getElementById('home-summary-card');
        if (summary && summary.parentNode === page) summary.insertAdjacentElement('afterend', card);
        else {
          const streak = document.getElementById('streak-banner');
          if (streak) streak.insertAdjacentElement('afterend', card);
          else page.insertBefore(card, page.firstChild);
        }
      }
      const h = ensureWaterMeta();
      const row = getTodayGlasses();
      const goalG = Math.max(1, Math.round((h.goalMl || 2000) / (h.glassMl || 250)));
      const n = row.glasses || 0;
      const glassesHtml = Array.from({ length: goalG }, (_, i) =>
        `<button type="button" class="wg ${i < n ? 'on' : ''}" data-wg="${i + 1}" title="${i + 1} 杯"></button>`
      ).join('');
      card.innerHTML = `
        <div class="card-title">💧 ${fflT('waterTitle','今日飲水')}</div>
        <div class="water-row">
          <div class="water-glasses">${glassesHtml}</div>
          <div class="water-btns">
            <button type="button" class="btn btn-secondary btn-sm" id="water-minus">−</button>
            <button type="button" class="btn btn-secondary btn-sm" id="water-plus">＋</button>
          </div>
        </div>
        <div class="water-meta">${n} / ${goalG} ${fflT('waterCups','杯')} · 約 ${row.ml || 0} / ${h.goalMl || 2000} ml（${fflT('waterPerCup','每杯')} ${h.glassMl || 250} ml）</div>
        <p class="hint" style="margin:6px 0 0">${fflT('waterHint','點選杯子即可設定數量；私密本機記錄。')}</p>`;
      card.querySelectorAll('[data-wg]').forEach(btn => {
        btn.onclick = () => {
          const v = +btn.getAttribute('data-wg');
          // toggle: if clicking current filled last cup, decrease; else set to v
          if (v === n) setTodayGlasses(n - 1);
          else setTodayGlasses(v);
        };
      });
      const minus = card.querySelector('#water-minus');
      const plus = card.querySelector('#water-plus');
      if (minus) minus.onclick = () => setTodayGlasses(n - 1);
      if (plus) plus.onclick = () => setTodayGlasses(n + 1);
    }

    // ---- 3) Mood expand ----
    function ensureMoodMeta() {
      if (!state.meta) state.meta = {};
      if (!state.meta.play) state.meta.play = { stamps: {}, bingo: {}, feedCount: 0, patCount: 0 };
      if (!state.meta.play.moods) state.meta.play.moods = {};
      return state.meta.play.moods;
    }
    function saveMoodToday(emoji) {
      const moods = ensureMoodMeta();
      moods[todayWaterKey()] = { emoji, at: Date.now() };
      if (typeof fflPlayState !== 'undefined') fflPlayState.mood = emoji;
      saveState();
    }
    function enhanceMoodTray() {
      // Override MOODS if in scope — expand via wrapping renderPlayPanel
      try {
        if (typeof MOODS !== 'undefined') {
          // can't reassign const; use local when rendering
        }
      } catch (_) {}
      const tray = document.getElementById('mood-tray');
      const btn = document.getElementById('btn-mood-sticker');
      if (!btn) return;
      if (btn.dataset.moodExpanded) return;
      btn.dataset.moodExpanded = '1';
      btn.onclick = () => {
        const trayEl = document.getElementById('mood-tray');
        if (!trayEl) return;
        const cur = (ensureMoodMeta()[todayWaterKey()] || {}).emoji || (typeof fflPlayState !== 'undefined' ? fflPlayState.mood : '');
        trayEl.className = 'mood-expanded-tray';
        trayEl.innerHTML = MOODS_EXPANDED.map(m =>
          `<button type="button" data-mood="${m}" class="${m === cur ? 'selected' : ''}" title="${m}">${m}</button>`
        ).join('');
        trayEl.onclick = (e) => {
          const b = e.target.closest('[data-mood]');
          if (!b) return;
          const m = b.getAttribute('data-mood');
          saveMoodToday(m);
          trayEl.querySelectorAll('button').forEach(x => x.classList.toggle('selected', x === b));
          if (typeof encouragePopup === 'function') encouragePopup('心情 ' + m + ' 已貼上');
          paintMoodChip();
        };
      };
      paintMoodChip();
    }
    function paintMoodChip() {
      const host = document.getElementById('home-summary-card') || document.getElementById('play-panel') || document.getElementById('home-water-card');
      const moods = ensureMoodMeta();
      const today = moods[todayWaterKey()];
      let chip = document.getElementById('mood-today-chip');
      const play = document.getElementById('play-panel') || document.querySelector('#home-summary-card .home-summary-cta');
      if (!today) {
        if (chip) chip.remove();
      } else {
        if (!chip) {
          chip = document.createElement('div');
          chip.id = 'mood-today-chip';
          chip.className = 'mood-today-chip';
          if (play) play.insertAdjacentElement('afterend', chip);
          else if (host) host.appendChild(chip);
        }
        chip.innerHTML = `${fflT('moodToday','今日心情')} ${today.emoji}`;
      }
      // history last 7
      let hist = document.getElementById('mood-history');
      const keys = Object.keys(moods).sort().slice(-7);
      if (!keys.length) { if (hist) hist.remove(); return; }
      if (!hist) {
        hist = document.createElement('div');
        hist.id = 'mood-history';
        hist.className = 'mood-history';
        if (chip && chip.parentNode) chip.insertAdjacentElement('afterend', hist);
        else if (host) host.appendChild(hist);
      }
      hist.innerHTML = fflT('moodRecent','近況') + '：' + keys.map(k => `<span title="${k}">${moods[k].emoji}</span>`).join(' ');
    }

    // Wrap renderPlayPanel to re-bind expanded moods
    if (typeof renderPlayPanel === 'function') {
      const _rpp = renderPlayPanel;
      renderPlayPanel = function() {
        _rpp();
        try { enhanceMoodTray(); } catch (_) {}
      };
    }

    // ---- 4) Document import in chat ----
    let chatPendingDocs = []; // {name, mime, text, preview}

    function ensureDocFileInput() {
      let inp = document.getElementById('chat-doc-input');
      if (!inp) {
        inp = document.createElement('input');
        inp.type = 'file';
        inp.id = 'chat-doc-input';
        inp.accept = '.md,.markdown,.txt,.csv,.pdf,.xlsx,.xls,.docx,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        inp.multiple = true;
        inp.style.display = 'none';
        const composer = document.querySelector('.chat-composer');
        if (composer) composer.appendChild(inp);
        else document.body.appendChild(inp);
        inp.addEventListener('change', async () => {
          const files = [...(inp.files || [])];
          inp.value = '';
          for (const f of files) {
            try {
              await handleDocFile(f);
            } catch (e) {
              console.warn(e);
              toast('無法讀取：' + f.name, 'warn');
            }
          }
        });
      }
      const btnImg = document.getElementById('chat-btn-image');
      if (btnImg && !document.getElementById('chat-btn-doc')) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'icon-btn';
        b.id = 'chat-btn-doc';
        b.title = fflT('docAttach','匯入 Excel／Word／MD／PDF');
        b.textContent = '📄';
        btnImg.insertAdjacentElement('afterend', b);
        b.onclick = () => inp.click();
      }
      return inp;
    }

    function loadScriptOnce(src, globalName) {
      return new Promise((resolve, reject) => {
        if (globalName && window[globalName]) return resolve(window[globalName]);
        const existing = document.querySelector('script[data-ffl-lib="' + src + '"]');
        if (existing) {
          existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true));
          existing.addEventListener('error', reject);
          return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.dataset.fflLib = src;
        s.onload = () => resolve(globalName ? window[globalName] : true);
        s.onerror = () => reject(new Error('load fail ' + src));
        document.head.appendChild(s);
      });
    }

    async function extractTextFromFile(file) {
      const name = (file.name || '').toLowerCase();
      const mime = file.type || '';
      if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt') || mime.startsWith('text/')) {
        return await file.text();
      }
      if (name.endsWith('.csv')) {
        return await file.text();
      }
      if (name.endsWith('.pdf') || mime === 'application/pdf') {
        // pdf.js CDN
        await loadScriptOnce('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs', null).catch(() => null);
        // pdfjs as classic build fallback
        try {
          if (!window.pdfjsLib) {
            await loadScriptOnce('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'pdfjsLib');
            if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
              window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            }
          }
          const buf = await file.arrayBuffer();
          const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
          let text = '';
          const max = Math.min(pdf.numPages, 20);
          for (let i = 1; i <= max; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(it => it.str).join(' ') + String.fromCharCode(10);
          }
          return text;
        } catch (e) {
          console.warn('pdf parse', e);
          throw new Error('PDF 需上網載 pdf.js，或改用 MD／TXT');
        }
      }
      if (name.endsWith('.xlsx') || name.endsWith('.xls') || /sheet|excel/i.test(mime)) {
        await loadScriptOnce('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'XLSX');
        const buf = await file.arrayBuffer();
        const wb = window.XLSX.read(buf, { type: 'array' });
        const parts = [];
        wb.SheetNames.slice(0, 5).forEach(sn => {
          const sheet = wb.Sheets[sn];
          parts.push('## ' + sn);
          parts.push(window.XLSX.utils.sheet_to_csv(sheet));
        });
        return parts.join('\n');
      }
      if (name.endsWith('.docx') || /wordprocessingml/i.test(mime)) {
        await loadScriptOnce('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', 'mammoth');
        const buf = await file.arrayBuffer();
        const res = await window.mammoth.extractRawText({ arrayBuffer: buf });
        return (res && res.value) || '';
      }
      // last resort
      try { return await file.text(); } catch (_) { throw new Error('不支援格式'); }
    }

    function parseDocTextToCandidates(text, fileName) {
      const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const candidates = [];
      const chunkSize = 8;
      // Try each line + sliding windows with existing parsers
      const tryParse = (raw) => {
        if (typeof parseChatIntentSingle === 'function') {
          try {
            const r = parseChatIntentSingle(raw, { lowerConfOk: true });
            if (r && r.ok) return r;
          } catch (_) {}
        }
        if (typeof parseChatIntent === 'function') {
          try {
            const r = parseChatIntent(raw);
            if (r && r.ok && r.action !== 'undo') return r;
          } catch (_) {}
        }
        if (typeof guessTypeFromText === 'function') {
          const g = guessTypeFromText(raw);
          if (g && g.conf >= 0.75) {
            return { ok: true, recordType: g.recordType, data: {}, summary: raw.slice(0, 80), rawText: raw, confidence: g.conf };
          }
        }
        return null;
      };
      lines.forEach(line => {
        if (line.length < 2 || line.startsWith('##')) return;
        // CSV-ish: date,type,value
        const csv = line.split(/[,，\t]/).map(s => s.trim());
        let raw = line;
        if (csv.length >= 3 && /體重|飲食|運動|睡眠|kcal|餐|跑|水/.test(line)) {
          raw = csv.join(' ');
        }
        const parsed = tryParse(raw);
        if (parsed && parsed.ok) {
          candidates.push({
            recordType: parsed.recordType,
            data: parsed.data || {},
            summary: parsed.summary || raw.slice(0, 60),
            rawText: parsed.rawText || raw,
            conf: parsed.confidence || parsed.conf || 0.6,
            fromFile: fileName
          });
        }
      });
      // If few candidates, try whole-doc cloud later; also pack nutrition table rows
      if (candidates.length === 0 && lines.length) {
        const blob = lines.slice(0, 40).join('\n');
        const g = typeof guessTypeFromText === 'function' ? guessTypeFromText(blob) : { recordType: 'note', conf: 0.4 };
        candidates.push({
          recordType: g.recordType || 'note',
          data: { mood: '', note: blob.slice(0, 500) },
          summary: '文件摘要（請改類型）· ' + (fileName || ''),
          rawText: blob.slice(0, 1500),
          conf: g.conf || 0.4,
          fromFile: fileName
        });
      }
      // dedupe by rawText
      const seen = new Set();
      return candidates.filter(c => {
        const k = c.recordType + '|' + (c.rawText || '').slice(0, 80);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).slice(0, 12);
    }

    async function cloudDocParse(text, fileName) {
      if (!window.FFL_CloudAi || !window.FFL_CloudAi.cloudEnabled) return null;
      // reuse weeklyReport flag as "cloud text AI" or foodVision — prefer any cloud with base
      const c = window.FFL_CloudAi.ensureCloudMeta();
      if (!c.baseUrl || !navigator.onLine) return null;
      if (!c.foodVision && !c.weeklyReport && !c.exerciseOcr) return null;
      try {
        const res = await window.FFL_CloudAi.cloudFetch('/api/doc-import', {
          fileName: fileName || '',
          text: String(text || '').slice(0, 20000),
          locale: (state.meta && state.meta.locale) || 'zh-Hant'
        });
        return res;
      } catch (e) {
        console.warn('doc-import cloud', e);
        return null;
      }
    }

    function candidateToDraft(c) {
      const attachments = [];
      let draft;
      if (c.recordType === 'diet' && typeof buildStubDietDraft === 'function') {
        draft = buildStubDietDraft(attachments, c.rawText);
        Object.assign(draft.data, c.data || {});
      } else if (c.recordType === 'exercise' && typeof buildStubExerciseDraft === 'function') {
        draft = buildStubExerciseDraft(attachments, c.rawText);
        Object.assign(draft.data, c.data || {});
      } else if (c.recordType === 'body' && typeof buildStubBodyDraft === 'function') {
        draft = buildStubBodyDraft(attachments, c.rawText);
        Object.assign(draft.data, c.data || {});
      } else if (c.recordType === 'water') {
        draft = {
          recordType: 'water', subtype: 'hydration', stub: 'doc',
          summary: c.summary,
          data: Object.assign({ glasses: null, ml: null }, c.data || {}),
          attachments, rawText: c.rawText, conf: c.conf
        };
      } else {
        draft = {
          recordType: c.recordType || 'note', subtype: 'doc', stub: 'doc_import',
          summary: c.summary,
          data: c.data || { note: c.rawText },
          attachments, rawText: c.rawText, conf: c.conf
        };
      }
      draft.summary = (draft.summary || c.summary) + (c.fromFile ? ` · 📄 ${c.fromFile}` : '');
      draft._fromDoc = true;
      return draft;
    }

    async function handleDocFile(file) {
      toast(fflT('docReading','讀取文件') + '：' + file.name + '…', 'info');
      const text = await extractTextFromFile(file);
      if (!text || !String(text).trim()) {
        toast(fflT('docNoText','文件沒有可讀文字'), 'warn');
        return;
      }
      chatPendingDocs.push({ name: file.name, mime: file.type, text: text.slice(0, 50000) });
      renderDocPreview();
      let candidates = parseDocTextToCandidates(text, file.name);
      const cloud = await cloudDocParse(text, file.name);
      if (cloud && Array.isArray(cloud.records) && cloud.records.length) {
        candidates = cloud.records.map(r => ({
          recordType: r.recordType || 'note',
          data: r.data || {},
          summary: r.summary || (r.recordType || 'note'),
          rawText: r.rawText || r.text || '',
          conf: r.confidence != null ? r.confidence : 0.75,
          fromFile: file.name
        })).concat(candidates).slice(0, 12);
      }
      // Queue confirm cards: show first, stash rest like diary
      const drafts = candidates.map(candidateToDraft);
      if (!drafts.length) {
        toast('無法辨識記錄，已將文字放入輸入框', 'warn');
        const inp = document.getElementById('chat-input');
        if (inp) inp.value = text.slice(0, 2000);
        return;
      }
      if (typeof chatDiaryDraftQueue !== 'undefined') {
        // reuse diary queue for subsequent confirms
        drafts.slice(1).forEach(d => chatDiaryDraftQueue.push(d));
      } else {
        window._fflDocDraftQueue = drafts.slice(1);
      }
      appendChatMessage({
        messageId: msgUid(), ownerUser: currentUser, role: 'bot',
        createdAt: nowTs(),
        text: `📄 已匯入「${file.name}」· 估到 ${drafts.length} 筆，請逐張確認（可改類型）。`,
        card: null
      });
      if (typeof renderDraftConfirmCard === 'function') renderDraftConfirmCard(drafts[0]);
      else if (typeof renderChatThread === 'function') renderChatThread();
      toast(`匯入 ${drafts.length} 筆待確認`, 'success');
    }

    function renderDocPreview() {
      const prev = document.getElementById('chat-attach-preview');
      if (!prev || !chatPendingDocs.length) return;
      const last = chatPendingDocs[chatPendingDocs.length - 1];
      const pill = document.createElement('div');
      pill.className = 'doc-attach-pill';
      pill.textContent = '📄 ' + last.name;
      const pre = document.createElement('div');
      pre.className = 'chat-doc-preview';
      pre.textContent = (last.text || '').slice(0, 280) + ((last.text || '').length > 280 ? '…' : '');
      prev.appendChild(pill);
      prev.appendChild(pre);
    }


    // summarizeRecord for water
    if (typeof summarizeRecord === 'function') {
      const _sum = summarizeRecord;
      summarizeRecord = function(r) {
        if (r && r.recordType === 'water') {
          const d = r.data || {};
          return `飲水 ${d.glasses ?? '—'} 杯 · 約 ${d.ml ?? '—'} ml`;
        }
        return _sum(r);
      };
    }
    if (typeof TYPE_LABEL === 'object' && TYPE_LABEL) TYPE_LABEL.water = '飲水';

    function bootFeatures() {
      seedExtraDemoUsers();
      seedCircleSamplePublicLogs();
      ensureDocFileInput();
      renderWaterCard();
      enhanceMoodTray();
      // refresh circle strip
      try { if (typeof renderHomeCircleStrip === 'function') renderHomeCircleStrip(); } catch (_) {}
      try {
        if (typeof renderHomeSummaryCta === 'function') renderHomeSummaryCta();
      } catch (_) {}
    }

    if (typeof showPage === 'function') {
      const _sp = showPage;
      showPage = function(name) {
        _sp(name);
        if (name === 'today') {
          renderWaterCard();
          enhanceMoodTray();
          try { if (typeof renderHomeCircleStrip === 'function') renderHomeCircleStrip(); } catch (_) {}
        }
        if (name === 'chat') ensureDocFileInput();
      };
    }

    window.FFL_Features = {
      seedExtraDemoUsers, EXTRA_DEMO, MOODS_EXPANDED,
      setTodayGlasses, getTodayGlasses, parseDocTextToCandidates, extractTextFromFile
    };

    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(bootFeatures, 'features');
    else setTimeout(bootFeatures, 220);
  })();

/* @@FFL_PWA_JS@@ */
  /* ========== PWA + try-on/competition deepen + i18n pass ========== */
  (function injectPwaPlayI18n() {
    const I18N_EXTRA = {
      'zh-Hant': {
        waterTitle: '今日飲水', waterHint: '點選杯子即可設定數量；私密本機記錄。',
        waterCups: '杯', waterPerCup: '每杯',
        moodToday: '今日心情', moodRecent: '近況', moodStickers: '心情貼紙',
        docAttach: '匯入 Excel／Word／MD／PDF', docReading: '讀取文件',
        docImported: '已匯入', docConfirm: '筆，請逐張確認',
        docNoText: '文件沒有可讀文字', docUnsupported: '不支援格式',
        pwaInstall: '加到主畫面，離線都開到', pwaInstallBtn: '安裝 App',
        pwaLater: '之後', pwaReady: '已可離線使用', pwaUpdate: '有新版本，重新整理',
        chalTitle: '圈子週挑戰 · 排行榜', chalGoal: '目標', chalEdit: '改目標',
        chalCheer: '加油', chalTaunt: '加油趕上！', chalWinner: '本週領先',
        chalPoints: '積分', chalTypeEx: '運動分鐘', chalTypeStreak: '連續打卡',
        chalTypeWeight: '減重', chalMembers: '人圈子',
        tryonWardrobe: '試穿衣櫃', tryonUnlock: '連續打卡／記錄可解鎖',
        tryonSave: '收藏造型', tryonShuffle: '隨機混搭', tryonPose: '換姿勢',
        tryonDaily: '試穿小挑戰', tryonDailyDone: '今日試穿挑戰完成！',
        tryonCompLook: '設為競賽造型', tryonRunway: '姿勢跑道',
        accessory: '飾品', looksEmpty: '未有收藏造型',
        shareWeek: '本週分享卡', shareCopy: '複製文字', shareNative: '系統分享',
        shareChat: '貼去對話', shareCopied: '已複製分享卡', shareDone: '已分享',
        sleepTipTitle: '睡眠小提示'
      },
      'zh-Hans': {
        waterTitle: '今日饮水', waterHint: '点杯子直接设数量；私密本机记录。',
        waterCups: '杯', waterPerCup: '每杯',
        moodToday: '今日心情', moodRecent: '近况', moodStickers: '心情贴纸',
        docAttach: '导入 Excel／Word／MD／PDF', docReading: '读取文件',
        docImported: '已导入', docConfirm: '条，请逐张确认',
        docNoText: '文件没有可读文字', docUnsupported: '不支持格式',
        pwaInstall: '添加到主屏幕，离线也能打开', pwaInstallBtn: '安装 App',
        pwaLater: '以后', pwaReady: '已可离线使用', pwaUpdate: '有新版本，请刷新',
        chalTitle: '圈子周挑战 · 排行榜', chalGoal: '目标', chalEdit: '改目标',
        chalCheer: '加油', chalTaunt: '追上来！', chalWinner: '本周领先',
        chalPoints: '积分', chalTypeEx: '运动分钟', chalTypeStreak: '连续打卡',
        chalTypeWeight: '减重', chalMembers: '人圈子',
        tryonWardrobe: '试穿衣柜', tryonUnlock: '连续打卡／记录可解锁',
        tryonSave: '收藏造型', tryonShuffle: '随机混搭', tryonPose: '换姿势',
        tryonDaily: '试穿小挑战', tryonDailyDone: '今日试穿挑战完成！',
        tryonCompLook: '设为竞赛造型', tryonRunway: '姿势跑道',
        accessory: '饰品', looksEmpty: '暂无收藏造型',
        shareWeek: '本周分享卡', shareCopy: '复制文字', shareNative: '系统分享',
        shareChat: '贴到对话', shareCopied: '已复制分享卡', shareDone: '已分享',
        sleepTipTitle: '睡眠小提示'
      },
      ja: {
        waterTitle: 'きょうの水分', waterHint: 'カップをタップして杯数を設定（端末のみ）。',
        waterCups: '杯', waterPerCup: '1杯',
        moodToday: 'きょうの気分', moodRecent: '最近', moodStickers: '気分シール',
        docAttach: 'Excel／Word／MD／PDFを取込', docReading: '読み込み中',
        docImported: '取込完了', docConfirm: '件。確認してください',
        docNoText: '文字がありません', docUnsupported: '未対応形式',
        pwaInstall: 'ホーム画面に追加（オフライン可）', pwaInstallBtn: 'インストール',
        pwaLater: 'あとで', pwaReady: 'オフライン利用可', pwaUpdate: '更新あり・再読込',
        chalTitle: 'サークル週間チャレンジ', chalGoal: '目標', chalEdit: '変更',
        chalCheer: 'がんばれ', chalTaunt: 'おいついて！', chalWinner: '今週リード',
        chalPoints: 'ポイント', chalTypeEx: '運動分', chalTypeStreak: '連続',
        chalTypeWeight: '減量', chalMembers: '人サークル',
        tryonWardrobe: '試着クローゼット', tryonUnlock: '連続記録で解放',
        tryonSave: 'コーデ保存', tryonShuffle: 'ランダム', tryonPose: 'ポーズ',
        tryonDaily: '試着チャレンジ', tryonDailyDone: 'きょうの試着クリア！',
        tryonCompLook: '競技コーデに設定', tryonRunway: 'ポーズランウェイ',
        accessory: 'アクセ', looksEmpty: '保存コーデなし',
        shareWeek: '週間シェアカード', shareCopy: 'コピー', shareNative: 'シェア',
        shareChat: 'チャットへ', shareCopied: 'コピーしました', shareDone: 'シェア済み',
        sleepTipTitle: '睡眠ヒント'
      },
      en: {
        waterTitle: 'Water today', waterHint: 'Tap glasses to set count; private on-device.',
        waterCups: 'cups', waterPerCup: 'per cup',
        moodToday: 'Mood today', moodRecent: 'Recent', moodStickers: 'Mood stickers',
        docAttach: 'Import Excel／Word／MD／PDF', docReading: 'Reading file',
        docImported: 'Imported', docConfirm: 'items — confirm each',
        docNoText: 'No readable text', docUnsupported: 'Unsupported format',
        pwaInstall: 'Add to Home Screen for offline', pwaInstallBtn: 'Install',
        pwaLater: 'Later', pwaReady: 'Ready offline', pwaUpdate: 'Update available — reload',
        chalTitle: 'Circle weekly challenge', chalGoal: 'Goal', chalEdit: 'Edit',
        chalCheer: 'Cheer', chalTaunt: 'Catch up!', chalWinner: 'Week leader',
        chalPoints: 'pts', chalTypeEx: 'Exercise min', chalTypeStreak: 'Streak',
        chalTypeWeight: 'Weight loss', chalMembers: '-person circle',
        tryonWardrobe: 'Try-on wardrobe', tryonUnlock: 'Unlock via streak / logs',
        tryonSave: 'Save look', tryonShuffle: 'Shuffle', tryonPose: 'Pose',
        tryonDaily: 'Try-on challenge', tryonDailyDone: 'Try-on challenge done!',
        tryonCompLook: 'Set as competition look', tryonRunway: 'Pose runway',
        accessory: 'Accessories', looksEmpty: 'No saved looks',
        shareWeek: 'Weekly share card', shareCopy: 'Copy', shareNative: 'Share',
        shareChat: 'To chat', shareCopied: 'Copied', shareDone: 'Shared',
        sleepTipTitle: 'Sleep tip'
      }
    };

    const POSES_DEEP = [
      { id: 'stand', emoji: '🧍', name: { 'zh-Hant': '站立', 'zh-Hans': '站立', ja: '立ち', en: 'Stand' } },
      { id: 'side', emoji: '↕️', name: { 'zh-Hant': '側身', 'zh-Hans': '侧身', ja: 'サイド', en: 'Side' } },
      { id: 'wave', emoji: '🙋', name: { 'zh-Hant': '舉手', 'zh-Hans': '举手', ja: '手上げ', en: 'Wave' } },
      { id: 'walk', emoji: '🚶', name: { 'zh-Hant': '走路', 'zh-Hans': '走路', ja: '歩き', en: 'Walk' } },
      { id: 'power', emoji: '💪', name: { 'zh-Hant': '力量', 'zh-Hans': '力量', ja: 'パワー', en: 'Power' } },
      { id: 'yoga', emoji: '🧘', name: { 'zh-Hant': '瑜伽', 'zh-Hans': '瑜伽', ja: 'ヨガ', en: 'Yoga' } },
      { id: 'run', emoji: '🏃', name: { 'zh-Hant': '跑步', 'zh-Hans': '跑步', ja: 'ラン', en: 'Run' } },
      { id: 'win', emoji: '🏆', name: { 'zh-Hant': '勝利', 'zh-Hans': '胜利', ja: '勝利', en: 'Win' } }
    ];

    function loc() {
      return (state && state.meta && state.meta.locale) || 'zh-Hant';
    }
    function tt(key) {
      if (typeof t === 'function') {
        const v = t(key);
        if (v && v !== key) return v;
      }
      const L = loc();
      const pack = I18N_EXTRA[L] || I18N_EXTRA['zh-Hant'];
      return pack[key] || (I18N_EXTRA['zh-Hant'][key] || key);
    }
    function poseName(p) {
      const L = loc();
      return (p.name && (p.name[L] || p.name['zh-Hant'])) || p.id;
    }

    // Merge into FFL_I18N
    function mergeI18n() {
      if (typeof FFL_I18N !== 'object' || !FFL_I18N) return;
      Object.keys(I18N_EXTRA).forEach(lang => {
        if (!FFL_I18N[lang]) FFL_I18N[lang] = {};
        Object.assign(FFL_I18N[lang], I18N_EXTRA[lang]);
      });
      // ensure en exists for locale switchers that might add it later
    }

    // ---- PWA ----
    let deferredPrompt = null;
    function injectManifestLink() {
      if (document.querySelector('link[rel="manifest"]')) return;
      const link = document.createElement('link');
      link.rel = 'manifest';
      const isDuo = /Health_Duo/i.test(location.pathname || '') || /Health_Duo/i.test(document.title || '');
      link.href = isDuo ? 'manifest-healthduo.webmanifest' : 'manifest.webmanifest';
      document.head.appendChild(link);
      // apple title
      if (!document.querySelector('meta[name="apple-mobile-web-app-title"]')) {
        const m = document.createElement('meta');
        m.name = 'apple-mobile-web-app-title';
        m.content = 'BloomBody';
        document.head.appendChild(m);
      }
    }
    function registerSW() {
      if (!('serviceWorker' in navigator)) return;
      // file:// cannot register
      if (location.protocol === 'file:') {
        console.info('[FFL PWA] open via http(s) to enable service worker');
        return;
      }
      const swUrl = new URL('sw.js', location.href).href;
      navigator.serviceWorker.register(swUrl).then(reg => {
        if (reg.waiting) hintUpdate();
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) hintUpdate();
          });
        });
        showPwaBanner(false, true);
      }).catch(e => console.warn('SW register', e));
    }
    function hintUpdate() {
      showPwaBanner(true, false, true);
    }
    function showPwaBanner(forceInstall, ready, update) {
      let bar = document.getElementById('pwa-install-banner');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'pwa-install-banner';
        bar.className = 'pwa-install-banner';
        const app = document.getElementById('app') || document.body;
        app.insertBefore(bar, app.firstChild);
      }
      if (update) {
        bar.innerHTML = `<span>${tt('pwaUpdate')}</span>
          <div class="pwa-actions"><button type="button" class="btn btn-primary btn-sm" id="pwa-reload">${tt('pwaInstallBtn')}</button></div>`;
        bar.classList.add('show');
        const b = bar.querySelector('#pwa-reload');
        if (b) b.onclick = () => location.reload();
        return;
      }
      if (ready && !deferredPrompt && !forceInstall) {
        // subtle one-shot
        if (!sessionStorage.getItem('ffl_pwa_ready_toast')) {
          sessionStorage.setItem('ffl_pwa_ready_toast', '1');
          if (typeof toast === 'function') toast(tt('pwaReady'), 'success');
        }
        return;
      }
      if (!deferredPrompt && !forceInstall) return;
      bar.innerHTML = `<span>📲 ${tt('pwaInstall')}</span>
        <div class="pwa-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="pwa-later">${tt('pwaLater')}</button>
          <button type="button" class="btn btn-primary btn-sm" id="pwa-install">${tt('pwaInstallBtn')}</button>
        </div>`;
      bar.classList.add('show');
      bar.querySelector('#pwa-later').onclick = () => { bar.classList.remove('show'); deferredPrompt = null; };
      bar.querySelector('#pwa-install').onclick = async () => {
        if (!deferredPrompt) { bar.classList.remove('show'); return; }
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (_) {}
        deferredPrompt = null;
        bar.classList.remove('show');
      };
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showPwaBanner(true, false);
    });

    // ---- Competition deepen ----
    function rowPoints(r) {
      return Math.round((r.exerciseMin || 0) + (r.streak || 0) * 10 + (r.publicDays || 0) * 3);
    }
    function ensureCheers() {
      if (!state.meta.challenge) return;
      if (!state.meta.challenge.cheers) state.meta.challenge.cheers = {};
      if (!state.meta.challenge.weekWinners) state.meta.challenge.weekWinners = {};
    }
    function enhanceChallengeCard() {
      if (typeof renderChallengeCard !== 'function') return;
      if (renderChallengeCard._fflDeep) return;
      const _rcc = renderChallengeCard;
      renderChallengeCard = function() {
        _rcc();
        try { paintChallengeExtras(); } catch (e) { console.warn(e); }
      };
      renderChallengeCard._fflDeep = true;
    }
    function paintChallengeExtras() {
      ensureChallengeState();
      ensureCheers();
      const board = typeof buildLeaderboard === 'function' ? buildLeaderboard() : null;
      if (!board || !board.rows || !board.rows.length) return;
      // enrich points + winner
      board.rows.forEach(r => { r.points = rowPoints(r); });
      const leader = [...board.rows].sort((a, b) => b.points - a.points)[0];
      const wk = board.wb && board.wb.startKey;
      if (wk && leader && leader.points > 0) {
        state.meta.challenge.weekWinners[wk] = leader.user;
        try { saveState(); } catch (_) {}
      }
      ['challenge-card-root', 'challenge-card-today'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        // retitle parent card
        const card = el.closest('.challenge-card');
        if (card) {
          const title = card.querySelector('.card-title');
          if (title) title.textContent = '🏆 ' + tt('chalTitle') + ` · ${board.rows.length}${tt('chalMembers')}`;
          const hint = card.querySelector('.hint');
          if (hint) hint.textContent = loc().startsWith('zh')
            ? '只計公開記錄；最多 4 人圈子。離線本機。'
            : 'Public logs only · up to 4 · on-device.';
        }
        // prepend winner + goal chips if not present
        if (!el.querySelector('.chal-controls')) {
          const ch = state.meta.challenge;
          const controls = document.createElement('div');
          controls.className = 'chal-controls';
          const types = [
            ['exercise_min', 'chalTypeEx'],
            ['streak', 'chalTypeStreak'],
            ['weight_down', 'chalTypeWeight']
          ];
          controls.innerHTML = types.map(([v, k]) =>
            `<button type="button" class="chip-goal ${ch.weeklyGoalType === v ? 'on' : ''}" data-gtype="${v}">${tt(k)}</button>`
          ).join('');
          el.insertBefore(controls, el.firstChild);
          controls.onclick = (e) => {
            const b = e.target.closest('[data-gtype]');
            if (!b) return;
            state.meta.challenge.weeklyGoalType = b.getAttribute('data-gtype');
            if (state.meta.challenge.weeklyGoalType === 'streak') state.meta.challenge.weeklyGoalValue = state.meta.challenge.weeklyGoalValue || 7;
            if (state.meta.challenge.weeklyGoalType === 'weight_down') state.meta.challenge.weeklyGoalValue = 0.5;
            if (state.meta.challenge.weeklyGoalType === 'exercise_min') state.meta.challenge.weeklyGoalValue = state.meta.challenge.weeklyGoalValue || 150;
            saveState();
            renderChallengeCard();
          };
        }
        if (leader && !el.querySelector('.chal-winner')) {
          const w = document.createElement('div');
          w.className = 'chal-winner';
          w.textContent = `👑 ${tt('chalWinner')}: ${leader.user} · ${leader.points} ${tt('chalPoints')}`;
          el.insertBefore(w, el.querySelector('.chal-controls')?.nextSibling || el.firstChild);
        }
        // points + cheer on each row
        el.querySelectorAll('.chal-row').forEach(rowEl => {
          if (rowEl.querySelector('.chal-cheer-row')) return;
          const nameEl = rowEl.querySelector('.chal-user');
          if (!nameEl) return;
          const uname = (nameEl.textContent || '').replace(/[👑（我）()\s]/g, '').replace(/\(我\)/g, '').trim().split('（')[0].trim();
          const r = board.rows.find(x => x.user === uname) || board.rows.find(x => nameEl.textContent.includes(x.user));
          if (r) {
            const pts = document.createElement('div');
            pts.className = 'chal-points';
            pts.textContent = `${tt('chalPoints')}: ${r.points}`;
            rowEl.appendChild(pts);
          }
          if (r && r.user !== currentUser) {
            const cheer = document.createElement('div');
            cheer.className = 'chal-cheer-row';
            cheer.innerHTML = `<button type="button" class="btn btn-ghost btn-sm" data-cheer="${r.user}">👏 ${tt('chalCheer')}</button>
              <button type="button" class="btn btn-ghost btn-sm" data-taunt="${r.user}">🔥 ${tt('chalTaunt')}</button>`;
            rowEl.appendChild(cheer);
            cheer.onclick = (e) => {
              const c = e.target.closest('[data-cheer],[data-taunt]');
              if (!c) return;
              const to = c.getAttribute('data-cheer') || c.getAttribute('data-taunt');
              const kind = c.hasAttribute('data-cheer') ? 'cheer' : 'taunt';
              const key = (typeof todayKey === 'function' ? todayKey() : '') + '_' + currentUser + '_' + to + '_' + kind;
              state.meta.challenge.cheers[key] = Date.now();
              saveState();
              if (typeof encouragePopup === 'function') {
                encouragePopup(kind === 'cheer' ? `${tt('chalCheer')} → ${to}` : `${tt('chalTaunt')} → ${to}`);
              } else if (typeof toast === 'function') toast(kind + ' → ' + to, 'success');
            };
          }
        });
      });
    }

    // ---- Try-on deepen ----
    function ensureTryOnChallenge() {
      if (!state.meta.play) state.meta.play = {};
      const today = typeof todayKey === 'function' ? todayKey() : '';
      if (!state.meta.play.tryOnDaily || state.meta.play.tryOnDaily.key !== today) {
        state.meta.play.tryOnDaily = { key: today, swaps: 0, saved: 0, done: false };
      }
      if (state.meta.play.wearing && state.meta.play.wearing.poseIdx == null) {
        state.meta.play.wearing.poseIdx = 0;
      }
      if (!state.meta.play.competitionLook) state.meta.play.competitionLook = null;
    }
    function bumpTryOn(kind) {
      ensureTryOnChallenge();
      const d = state.meta.play.tryOnDaily;
      if (kind === 'swap') d.swaps++;
      if (kind === 'save') d.saved++;
      if (d.swaps >= 2 && d.saved >= 1) d.done = true;
      saveState();
      paintTryOnExtras();
      if (d.done && typeof encouragePopup === 'function') encouragePopup(tt('tryonDailyDone'));
    }
    function paintTryOnExtras() {
      // Re-entrancy guard: never observe→mutate→observe; also blocks sync recursion.
      if (paintTryOnExtras._busy) return;
      paintTryOnExtras._busy = true;
      try {
      ensureTryOnChallenge();
      const host = document.getElementById('ffl-wardrobe');
      if (!host) return;
      // i18n buttons if present
      const saveBtn = host.querySelector('#ww-save-look');
      if (saveBtn) saveBtn.textContent = tt('tryonSave');
      const sh = host.querySelector('#ww-shuffle');
      if (sh) sh.textContent = tt('tryonShuffle');
      const pose = host.querySelector('#ww-pose');
      if (pose) pose.textContent = tt('tryonPose');
      const title = host.querySelector('.ww-title');
      if (title && !title.dataset.i18nDeep) {
        title.dataset.i18nDeep = '1';
      }
      if (title) {
        const stMatch = title.textContent.match(/\d+/);
        title.innerHTML = `👗 ${tt('tryonWardrobe')} <span style="font-weight:500;font-size:.7rem;color:var(--muted)">${stMatch ? stMatch[0] : ''} · unlock</span>`;
      }

      let daily = host.querySelector('#tryon-daily-chal');
      const d = state.meta.play.tryOnDaily;
      if (!daily) {
        daily = document.createElement('div');
        daily.id = 'tryon-daily-chal';
        daily.className = 'tryon-daily-chal';
        host.insertBefore(daily, host.firstChild);
      }
      daily.classList.toggle('done', !!d.done);
      daily.textContent = d.done
        ? '✅ ' + tt('tryonDailyDone')
        : `🎯 ${tt('tryonDaily')}: swap ${d.swaps}/2 · save ${d.saved}/1`;

      // runway
      let runway = host.querySelector('#tryon-runway');
      if (!runway) {
        runway = document.createElement('div');
        runway.id = 'tryon-runway';
        runway.className = 'tryon-runway';
        const afterTitle = host.querySelector('.ww-grid') || host.firstChild;
        host.insertBefore(runway, afterTitle);
      }
      const wearing = state.meta.play.wearing || {};
      const idx = wearing.poseIdx || 0;
      if (runway.dataset.poseIdx !== String(idx) || !runway.childElementCount) {
        runway.dataset.poseIdx = String(idx);
        runway.innerHTML = POSES_DEEP.map((p, i) =>
          `<button type="button" class="pose-card ${i === idx ? 'on' : ''}" data-pose="${i}" title="${poseName(p)}">
            <span class="pose-emoji">${p.emoji}</span>${poseName(p)}
          </button>`
        ).join('');
      } else {
        runway.querySelectorAll('[data-pose]').forEach(btn => {
          btn.classList.toggle('on', +btn.getAttribute('data-pose') === idx);
        });
      }
      if (!runway.dataset.poseBound) {
        runway.dataset.poseBound = '1';
        runway.addEventListener('click', (e) => {
          const b = e.target.closest('[data-pose]');
          if (!b) return;
          const i = +b.getAttribute('data-pose');
          state.meta.play.wearing.poseIdx = i;
          if (typeof fflPlayState !== 'undefined') fflPlayState.poseIdx = i;
          saveState();
          bumpTryOn('swap');
          if (typeof encouragePopup === 'function') encouragePopup(tt('tryonPose') + '：' + poseName(POSES_DEEP[i]));
        });
      }

      // competition look button
      let comp = host.querySelector('#ww-comp-look');
      if (!comp) {
        const actions = host.querySelector('.ww-actions');
        if (actions) {
          comp = document.createElement('button');
          comp.type = 'button';
          comp.className = 'btn btn-secondary btn-sm';
          comp.id = 'ww-comp-look';
          actions.appendChild(comp);
        }
      }
      if (comp) {
        comp.textContent = '🏅 ' + tt('tryonCompLook');
        comp.onclick = () => {
          ensureTryOnChallenge();
          const w = state.meta.play.wearing;
          state.meta.play.competitionLook = {
            outfitId: w.outfitId,
            accessoryId: w.accessoryId,
            poseIdx: w.poseIdx || 0,
            at: Date.now(),
            user: currentUser
          };
          saveState();
          if (typeof encouragePopup === 'function') encouragePopup(tt('tryonCompLook') + ' ✓');
          else if (typeof toast === 'function') toast(tt('tryonCompLook'), 'success');
        };
      }

      // hook save/shuffle to bump challenge — once
      if (!host.dataset.tryonHooks) {
        host.dataset.tryonHooks = '1';
        host.addEventListener('click', (e) => {
          if (e.target.closest('#ww-save-look')) setTimeout(() => bumpTryOn('save'), 50);
          if (e.target.closest('[data-outfit], #ww-shuffle, #ww-pose')) setTimeout(() => bumpTryOn('swap'), 50);
        });
      }
      } finally {
        paintTryOnExtras._busy = false;
      }
    }

    // Wardrobe paint hooks — NEVER body-wide MutationObserver (paint mutates wardrobe → OOM loop).
    function hookWardrobeRender() {
      if (hookWardrobeRender._done) return;
      hookWardrobeRender._done = true;
      if (typeof renderPlayPanel === 'function' && !renderPlayPanel._fflTryon) {
        const _rpp = renderPlayPanel;
        renderPlayPanel = function() {
          _rpp();
          try { setTimeout(paintTryOnExtras, 50); } catch (_) {}
        };
        renderPlayPanel._fflTryon = true;
      }
      // One-shot: if wardrobe already in DOM at boot, paint once (no observer).
      try { setTimeout(paintTryOnExtras, 60); } catch (_) {}
    }

    // ---- i18n: patch features water/mood/doc strings when FFL_Features paints ----
    function patchFeaturesI18n() {
      if (!window.FFL_Features) return;
      // re-render water with i18n by wrapping via showPage already; soft patch card title
      const card = document.getElementById('home-water-card');
      if (card) {
        const title = card.querySelector('.card-title');
        if (title) title.textContent = '💧 ' + tt('waterTitle');
        const hint = card.querySelector('.hint');
        if (hint) hint.textContent = tt('waterHint');
      }
      const docBtn = document.getElementById('chat-btn-doc');
      if (docBtn) docBtn.title = tt('docAttach');
      const moodChip = document.getElementById('mood-today-chip');
      if (moodChip && moodChip.textContent) {
        const em = moodChip.textContent.replace(/.*\s/, '') || moodChip.textContent;
        // keep emoji
        const m = moodChip.textContent.match(/[\u{1F300}-\u{1FAFF}]/u);
        if (m) moodChip.innerHTML = tt('moodToday') + ' ' + m[0];
      }
    }

    if (typeof applyLocale === 'function') {
      const _al = applyLocale;
      applyLocale = function() {
        mergeI18n();
        _al();
        try {
          patchFeaturesI18n();
          paintTryOnExtras();
          if (typeof renderChallengeCard === 'function') renderChallengeCard();
        } catch (_) {}
      };
    }


    // ---- Weekly share card + sleep score tip ----
    function weekRangeYmd() {
      const end = new Date();
      const start = new Date(end.getTime() - 6 * 86400000);
      const ymd = (d) => d.toISOString().slice(0, 10);
      return { start: ymd(start), end: ymd(end), startMs: start.setHours(0,0,0,0), endMs: end.setHours(23,59,59,999) };
    }

    function collectWeekStats() {
      const wr = weekRangeYmd();
      const uid = typeof currentUser !== 'undefined' ? currentUser : null;
      const recs = (state && state.records) || [];
      let kcal = 0, protein = 0, exmin = 0, sleepH = 0, sleepN = 0, waterMl = 0, days = new Set();
      let moodEmoji = '';
      recs.forEach(r => {
        if (!r || (uid && r.ownerUser && r.ownerUser !== uid)) return;
        if (r.deletedAt) return;
        const day = (r.timestamp || r.createdAt || '').slice(0, 10);
        if (!day || day < wr.start || day > wr.end) return;
        days.add(day);
        const d = r.data || {};
        if (r.recordType === 'food' || r.recordType === 'meal') {
          kcal += +(d.kcal || 0); protein += +(d.protein || 0);
        } else if (r.recordType === 'exercise') {
          exmin += +(d.minutes || 0);
        } else if (r.recordType === 'sleep') {
          sleepH += +(d.duration || 0); sleepN++;
        } else if (r.recordType === 'water') {
          waterMl += +(d.ml || (d.glasses || 0) * 250);
        }
      });
      try {
        const moods = (state.meta && state.meta.moods) || {};
        const keys = Object.keys(moods).filter(k => k >= wr.start && k <= wr.end).sort();
        if (keys.length) moodEmoji = (moods[keys[keys.length - 1]] || {}).emoji || '';
      } catch (_) {}
      const avgSleep = sleepN ? sleepH / sleepN : null;
      let sleepScore = 70;
      if (avgSleep != null) sleepScore = Math.max(0, Math.min(100, Math.round(avgSleep >= 7 && avgSleep <= 9 ? 90 : 90 - Math.abs(avgSleep - 7.5) * 12)));
      return {
        wr, days: days.size, kcal: Math.round(kcal), protein: Math.round(protein),
        exmin: Math.round(exmin), avgSleep, sleepN, sleepScore, waterMl: Math.round(waterMl), moodEmoji
      };
    }

    function sleepTipFor(avgSleep, score) {
      if (avgSleep == null) {
        return loc().startsWith('zh') ? '今晚請記錄睡眠時間，有助提高評分準確度' :
          loc() === 'ja' ? '睡眠を記録するとスコアが正確に！' : 'Log sleep tonight for a sharper score 😴';
      }
      if (avgSleep < 6.5) {
        return loc().startsWith('zh') ? `平均 ${avgSleep.toFixed(1)}h · 分數 ${score} — 試下提早半小時上床，目標 7–9h` :
          loc() === 'ja' ? `平均 ${avgSleep.toFixed(1)}h・${score}点 — 30分早く寝て 7–9h を目指そう` :
          `Avg ${avgSleep.toFixed(1)}h · score ${score} — try lights-out 30m earlier (aim 7–9h)`;
      }
      if (avgSleep > 9.5) {
        return loc().startsWith('zh') ? `平均 ${avgSleep.toFixed(1)}h · 分數 ${score} — 睡眠過長有時仍感疲倦；請保持規律起床` :
          loc() === 'ja' ? `平均 ${avgSleep.toFixed(1)}h・${score}点 — 寝すぎも疲れの原因。起床をそろえよう` :
          `Avg ${avgSleep.toFixed(1)}h · score ${score} — long sleep can still drain you; keep a steady wake time`;
      }
      return loc().startsWith('zh') ? `平均 ${avgSleep.toFixed(1)}h · 分數 ${score} ✓ 靚區間！保持就好` :
        loc() === 'ja' ? `平均 ${avgSleep.toFixed(1)}h・${score}点 ✓ いいゾーン` :
        `Avg ${avgSleep.toFixed(1)}h · score ${score} ✓ sweet spot — keep it up`;
    }

    function buildShareText(st) {
      const name = (state && state.users && state.users[currentUser] && (state.users[currentUser].displayName || state.users[currentUser].name)) || currentUser || 'me';
      const sleepLine = st.avgSleep != null ? `${st.avgSleep.toFixed(1)}h (score ${st.sleepScore})` : '—';
      const waterL = st.waterMl ? (st.waterMl / 1000).toFixed(1) + ' L' : '—';
      return [
        '💪 BloomBody · ' + tt('shareWeek'),
        '👤 ' + name,
        '📅 ' + st.wr.start + ' → ' + st.wr.end,
        '✅ check-in ' + st.days + '/7',
        '😴 sleep ' + sleepLine,
        '🏃 exercise ' + st.exmin + ' min',
        '🥗 ~' + st.kcal + ' kcal · P' + st.protein + 'g (sum)',
        '💧 water ' + waterL,
        st.moodEmoji ? ('😊 ' + st.moodEmoji) : null,
        '',
        '#BloomBody #weekly'
      ].filter(Boolean).join('\n');
    }

    function ensureWeekShareCard() {
      const page = document.getElementById('page-today');
      if (!page) return;
      let el = document.getElementById('ffl-week-share');
      if (!el) {
        el = document.createElement('div');
        el.id = 'ffl-week-share';
        el.className = 'ffl-week-share card';
        const anchor = document.getElementById('home-summary-card') ||
          document.getElementById('challenge-card-today') ||
          document.getElementById('home-water-card');
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
        else page.insertBefore(el, page.firstChild);
      }
      const st = collectWeekStats();
      const text = buildShareText(st);
      const tip = sleepTipFor(st.avgSleep, st.sleepScore);
      el.innerHTML = `
        <div class="ws-title">✨ ${tt('shareWeek')}</div>
        <div class="ffl-sleep-tip"><strong>${tt('sleepTipTitle')}</strong> — ${tip}</div>
        <div class="ws-card" id="ffl-ws-text"></div>
        <div class="ws-actions">
          <button type="button" class="btn btn-primary btn-sm" id="ffl-ws-copy">${tt('shareCopy')}</button>
          <button type="button" class="btn btn-secondary btn-sm" id="ffl-ws-native">${tt('shareNative')}</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ffl-ws-chat">${tt('shareChat')}</button>
        </div>`;
      const box = el.querySelector('#ffl-ws-text');
      if (box) box.textContent = text;
      const copy = () => {
        const done = () => {
          if (typeof toast === 'function') toast(tt('shareCopied'), 'success');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(() => {
            const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
            ta.select(); document.execCommand('copy'); ta.remove(); done();
          });
        } else {
          const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
          ta.select(); document.execCommand('copy'); ta.remove(); done();
        }
      };
      el.querySelector('#ffl-ws-copy').onclick = copy;
      el.querySelector('#ffl-ws-native').onclick = async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: 'BloomBody', text });
            if (typeof toast === 'function') toast(tt('shareDone'), 'success');
          } catch (_) {}
        } else copy();
      };
      el.querySelector('#ffl-ws-chat').onclick = () => {
        if (typeof appendChatMessage === 'function') {
          appendChatMessage({
            messageId: typeof msgUid === 'function' ? msgUid() : ('ws-' + Date.now()),
            ownerUser: currentUser, role: 'user', createdAt: typeof nowTs === 'function' ? nowTs() : new Date().toISOString(),
            text: text, card: null
          });
          if (typeof renderChatThread === 'function') renderChatThread();
          if (typeof showPage === 'function') showPage('chat');
          if (typeof toast === 'function') toast(tt('shareDone'), 'success');
        } else copy();
      };
    }

    function injectSleepTipOnDashboard() {
      const host = document.getElementById('ffl-dashboard');
      if (!host) return;
      if (host.querySelector('.ffl-sleep-tip')) return;
      const sections = host.querySelectorAll('.ffl-section');
      let sleepSec = null;
      sections.forEach(s => { if (/睡眠|Sleep|睡眠/.test(s.textContent || '')) sleepSec = s; });
      if (!sleepSec) return;
      const st = collectWeekStats();
      const tip = document.createElement('div');
      tip.className = 'ffl-sleep-tip';
      tip.innerHTML = '<strong>' + tt('sleepTipTitle') + '</strong> — ' + sleepTipFor(st.avgSleep, st.sleepScore);
      const next = sleepSec.nextElementSibling;
      if (next) next.insertAdjacentElement('afterend', tip);
      else sleepSec.insertAdjacentElement('afterend', tip);
    }

    if (typeof renderDashboardP0 === 'function' && !renderDashboardP0._fflSleepTip) {
      const _rd = renderDashboardP0;
      renderDashboardP0 = function(range) {
        _rd(range);
        try { setTimeout(injectSleepTipOnDashboard, 30); } catch (_) {}
      };
      renderDashboardP0._fflSleepTip = true;
    }

    if (typeof showPage === 'function' && !showPage._fflWeekShare) {
      const _sp2 = showPage;
      showPage = function(name) {
        _sp2(name);
        if (name === 'today') try { ensureWeekShareCard(); } catch (_) {}
        if (name === 'stats' || name === 'report' || name === 'dashboard') try { injectSleepTipOnDashboard(); } catch (_) {}
      };
      showPage._fflWeekShare = true;
    }

    function boot() {
      mergeI18n();
      injectManifestLink();
      registerSW();
      enhanceChallengeCard();
      hookWardrobeRender();
      try {
        if (typeof renderChallengeCard === 'function') renderChallengeCard();
        paintTryOnExtras();
        patchFeaturesI18n();
        ensureWeekShareCard();
        injectSleepTipOnDashboard();
      } catch (_) {}
    }

    window.FFL_PwaPlayI18n = { tt, mergeI18n, POSES_DEEP, registerSW, ensureWeekShareCard, collectWeekStats };

    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(boot, 'pwa');
    else setTimeout(boot, 280);
  })();
  /* @@FFL_DIET_WEEK_JS@@ diet cloud + weekly nutrition + PNG share */
  (function injectDietCloudWeekShare() {
    const EXTRA_TEMPLATES = [
      { id: 'hk_salmon_100', brand: '', name: '三文魚 100g', display: '三文魚 100g', portion: '100g',
        kcal: 208, protein: 20, carb: 0, fat: 13, sugar: 0,
        keywords: ['三文魚', '鲑鱼', 'salmon'], weight: 7 },
      { id: 'hk_tuna_can', brand: '', name: '吞拿魚罐頭', display: '吞拿魚（水浸）1罐', portion: '1罐（約100g）',
        kcal: 100, protein: 22, carb: 0, fat: 1, sugar: 0,
        keywords: ['吞拿', 'tuna', '魚罐头'], weight: 6 },
      { id: 'hk_edamame', brand: '', name: '枝豆 100g', display: '枝豆 100g', portion: '100g',
        kcal: 120, protein: 11, carb: 9, fat: 5, sugar: 2,
        keywords: ['枝豆', '毛豆', 'edamame'], weight: 5 },
      { id: 'hk_avocado_half', brand: '', name: '牛油果 半個', display: '牛油果 半個', portion: '半個',
        kcal: 120, protein: 1.5, carb: 6, fat: 11, sugar: 0.5,
        keywords: ['牛油果', '鳄梨', 'avocado'], weight: 5 },
      { id: 'hk_toast_2', brand: '', name: '全麥多士 2片', display: '全麥多士 2片', portion: '2片',
        kcal: 140, protein: 6, carb: 24, fat: 2, sugar: 3,
        keywords: ['多士', '吐司', 'toast', '全麥'], weight: 5 },
      { id: 'hk_pho', brand: '', name: '越南粉', display: '越南粉（估算）', portion: '1碗',
        kcal: 450, protein: 25, carb: 55, fat: 12, sugar: 4,
        keywords: ['越南粉', 'pho', '牛肉粉'], weight: 6 },
      { id: 'hk_sushi_8', brand: '', name: '壽司 8件', display: '壽司 8件（估算）', portion: '8件',
        kcal: 350, protein: 18, carb: 55, fat: 6, sugar: 5,
        keywords: ['壽司', '寿司', 'sushi'], weight: 6 },
      { id: 'hk_hotpot_meal', brand: '', name: '火鍋一餐', display: '火鍋（估算／人）', portion: '1餐',
        kcal: 750, protein: 40, carb: 45, fat: 40, sugar: 8,
        keywords: ['火鍋', '火锅', 'hotpot'], weight: 5 },
      { id: 'hk_matcha_latte', brand: '', name: '抹茶 Latte', display: '抹茶 Latte（中杯估算）', portion: '1杯',
        kcal: 220, protein: 8, carb: 28, fat: 8, sugar: 24,
        keywords: ['抹茶', 'matcha', 'latte'], weight: 5 },
      { id: 'hk_granola_bowl', brand: '', name: 'Granola 碗', display: 'Granola + 乳酪（估算）', portion: '1碗',
        kcal: 320, protein: 12, carb: 42, fat: 12, sugar: 18,
        keywords: ['granola', '穀物碗', '酸奶碗'], weight: 5 },
      { id: 'hk_dumplings_6', brand: '', name: '餃子 6隻', display: '餃子 6隻（估算）', portion: '6隻',
        kcal: 300, protein: 12, carb: 36, fat: 12, sugar: 2,
        keywords: ['餃子', '饺子', 'dumpling'], weight: 6 },
      { id: 'hk_congee_pig', brand: '', name: '皮蛋瘦肉粥', display: '皮蛋瘦肉粥（估算）', portion: '1碗',
        kcal: 280, protein: 14, carb: 38, fat: 8, sugar: 1,
        keywords: ['皮蛋瘦肉粥', '及第粥', '粥'], weight: 6 }
    ];

    function expandOfflineCatalog() {
      if (typeof HK_FOOD_CATALOG === 'undefined' || !Array.isArray(HK_FOOD_CATALOG)) return;
      const have = new Set(HK_FOOD_CATALOG.map(x => x.id));
      EXTRA_TEMPLATES.forEach(item => {
        if (!have.has(item.id)) {
          HK_FOOD_CATALOG.push(item);
          have.add(item.id);
        }
      });
      if (typeof ensureHkCatalogExpanded === 'function') {
        try { ensureHkCatalogExpanded(); } catch (_) {}
      }
    }

    function cloudOn(feat) {
      return !!(window.FFL_CloudAi && window.FFL_CloudAi.cloudEnabled && window.FFL_CloudAi.cloudEnabled(feat));
    }

    function decorateFoodConfirm(draft) {
      if (!draft || draft.recordType !== 'diet') return;
      const card = document.getElementById('p0-draft-card') || document.querySelector('.draft-confirm-card');
      if (!card) return;
      let badge = card.querySelector('.ffl-cloud-badge');
      if (!badge) {
        const head = card.querySelector('.card-title, h3, .draft-head') || card.firstElementChild;
        badge = document.createElement('span');
        badge.className = 'ffl-cloud-badge';
        if (head) head.appendChild(badge);
        else card.insertBefore(badge, card.firstChild);
      }
      const usedCloud = draft.stub === 'cloud_food_vision' ||
        (draft.data && draft.data.aiSuggest && draft.data.aiSuggest.source === 'cloud_food_vision');
      if (usedCloud) {
        badge.textContent = '雲端辨認';
        badge.classList.remove('off');
      } else if (cloudOn('foodVision')) {
        badge.textContent = '可雲端';
        badge.classList.remove('off');
      } else {
        badge.textContent = '離線模板';
        badge.classList.add('off');
      }

      let retry = card.querySelector('#ffl-cloud-food-retry');
      if (!retry && cloudOn('foodVision')) {
        const fields = document.getElementById('p0-draft-fields') || card;
        retry = document.createElement('button');
        retry.type = 'button';
        retry.id = 'ffl-cloud-food-retry';
        retry.className = 'btn btn-secondary btn-sm ffl-cloud-retry';
        retry.textContent = '☁️ 雲端再認一次';
        fields.appendChild(retry);
        retry.onclick = async () => {
          if (!window.FFL_CloudAi || !window.FFL_CloudAi.enrichDraftWithCloud) return;
          draft._cloudTried = false;
          toast('雲端食物辨認中…', 'info');
          try {
            await window.FFL_CloudAi.enrichDraftWithCloud(draft);
            draft._cloudTried = true;
            if (typeof renderDraftConfirmCard === 'function') renderDraftConfirmCard(draft);
          } catch (e) {
            toast('雲端失敗，沿用離線', 'warn');
          }
        };
      }

      // richer template chip strip if few alts
      const chips = document.getElementById('ffl-hk-food-chips');
      if (chips && HK_FOOD_CATALOG && HK_FOOD_CATALOG.length > 12) {
        chips.classList.add('ffl-food-tpl-grid');
      }

      const note = card.querySelector('.stub-note');
      if (note) {
        note.textContent = usedCloud
          ? '雲端／api/food-vision 已填入營養，請核對後確認入帳（仍可點選模板修改）。'
          : '離線：收藏＋HK／常用包裝模板。開啟「設定→雲端 AI→食物視覺」可打 /api/food-vision。';
      }
    }

    // Stronger wire: after diet confirm render, decorate; ensure enrich runs for diet photos
    if (typeof renderDraftConfirmCard === 'function' && !renderDraftConfirmCard._fflDietCloud) {
      const _rd = renderDraftConfirmCard;
      renderDraftConfirmCard = function(draft) {
        _rd(draft);
        try { setTimeout(() => decorateFoodConfirm(draft), 40); } catch (_) {}
        // if foodVision on and diet draft with attachments but not yet cloud — kick
        if (draft && draft.recordType === 'diet' && cloudOn('foodVision') && !draft._cloudTried &&
            window.FFL_CloudAi && window.FFL_CloudAi.enrichDraftWithCloud) {
          draft._cloudTried = true;
          window.FFL_CloudAi.enrichDraftWithCloud(draft).then(() => {
            try { decorateFoodConfirm(draft); } catch (_) {}
          });
        }
      };
      renderDraftConfirmCard._fflDietCloud = true;
    }

    // ---- Weekly nutrition stats (local) ----
    function ymdLocal(d) {
      const p = n => String(n).padStart(2, '0');
      return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    }
    function weekBounds() {
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
      return { start, end, sk: ymdLocal(start), ek: ymdLocal(end) };
    }
    function collectNutritionWeek() {
      const { sk, ek, start, end } = weekBounds();
      const recs = (typeof myRecords === 'function' ? myRecords() : (state.records || [])).filter(r => {
        if (!r || r.deletedAt) return false;
        const k = (typeof tsDateKey === 'function') ? tsDateKey(r.timestamp) : String(r.timestamp || '').replace(/\D/g, '').slice(0, 8);
        return k >= sk && k <= ek;
      });
      let kcal = 0, protein = 0, carb = 0, fat = 0, sugar = 0, meals = 0;
      const byMeal = { '第一餐': 0, '第二餐': 0, '第三餐': 0, '加餐': 0 };
      const days = new Set();
      let exmin = 0, sleepH = 0, sleepN = 0, waterMl = 0;
      recs.forEach(r => {
        const day = (typeof tsDateKey === 'function') ? tsDateKey(r.timestamp) : '';
        if (day) days.add(day);
        const d = r.data || {};
        if (r.recordType === 'diet') {
          meals++;
          kcal += +(d.kcal || 0);
          protein += +(d.protein || 0);
          carb += +(d.carb || 0);
          fat += +(d.fat || 0);
          sugar += +(d.sugar || 0);
          const m = d.meal || '加餐';
          if (byMeal[m] != null) byMeal[m] += +(d.kcal || 0);
        } else if (r.recordType === 'exercise') {
          exmin += +(d.minutes || 0);
        } else if (r.recordType === 'sleep' && d.duration != null) {
          sleepH += +d.duration; sleepN++;
        } else if (r.recordType === 'water') {
          waterMl += +(d.ml || (d.glasses || 0) * 250);
        }
      });
      const nDays = Math.max(1, days.size || 1);
      const goals = (state.users && state.users[currentUser] && state.users[currentUser].goals) || {};
      return {
        from: sk, to: ek, start, end,
        checkins: days.size,
        meals,
        kcal: Math.round(kcal),
        protein: Math.round(protein),
        carb: Math.round(carb),
        fat: Math.round(fat),
        sugar: Math.round(sugar),
        avgKcal: Math.round(kcal / nDays),
        avgProtein: Math.round(protein / nDays),
        avgCarb: Math.round(carb / nDays),
        avgFat: Math.round(fat / nDays),
        byMeal,
        exerciseMin: Math.round(exmin),
        avgSleep: sleepN ? +(sleepH / sleepN).toFixed(1) : null,
        waterMl: Math.round(waterMl),
        goals,
        localText: null
      };
    }

    function localNutritionReportText(st) {
      const g = st.goals || {};
      const goalK = g.kcal || 1600;
      const goalP = g.protein || 100;
      const mealLines = Object.keys(st.byMeal).map(m => `  · ${m} 合計約 ${Math.round(st.byMeal[m])} kcal`).join('\n');
      return [
        `【本週營養報告 · 本機模板】`,
        `📅 ${st.from} → ${st.to} · 打卡 ${st.checkins}/7 · 飲食筆數 ${st.meals}`,
        ``,
        `🥗 合計熱量 ${st.kcal} kcal（日均 ${st.avgKcal}／目標 ${goalK}）`,
        `💪 蛋白 ${st.protein} g（日均 ${st.avgProtein}／目標 ${goalP}）`,
        `🍞 碳水 ${st.carb} g（日均 ${st.avgCarb}） · 脂肪 ${st.fat} g（日均 ${st.avgFat}）`,
        st.sugar ? `🍬 糖分合計約 ${st.sugar} g` : null,
        ``,
        `分餐熱量：`,
        mealLines,
        ``,
        `🏃 運動 ${st.exerciseMin} 分 · 😴 睡眠均 ${st.avgSleep != null ? st.avgSleep + 'h' : '—'} · 💧 飲水 ${(st.waterMl / 1000).toFixed(1)} L`,
        ``,
        st.avgKcal > goalK * 1.1 ? '提示：日均熱量偏高，可減精緻碳水或加餐份量。' :
          st.avgProtein < goalP * 0.8 ? '提示：蛋白未達標，可加雞胸／豆腐／乳清。' :
            '提示：節奏不錯，繼續保持打卡與飲水。',
        `#BloomBody #nutrition`
      ].filter(x => x != null).join('\n');
    }

    async function nutritionReportPreferCloud() {
      const st = collectNutritionWeek();
      st.localText = localNutritionReportText(st);
      if (!cloudOn('weeklyReport') || !window.FFL_CloudAi || !window.FFL_CloudAi.cloudWeeklyReport) {
        return { text: st.localText, source: 'local', stats: st };
      }
      try {
        toast('雲端週報生成中…', 'info');
        const payloadStats = {
          localText: st.localText,
          checkins: st.checkins,
          kcal: st.kcal,
          protein: st.protein,
          carb: st.carb,
          fat: st.fat,
          exerciseMin: st.exerciseMin,
          avgSleep: st.avgSleep,
          avgKcal: st.avgKcal,
          avgProtein: st.avgProtein,
          byMeal: st.byMeal,
          waterMl: st.waterMl,
          from: st.from,
          to: st.to
        };
        const res = await window.FFL_CloudAi.cloudWeeklyReport(payloadStats);
        const txt = (res && (res.text || res.summary || res.report)) || '';
        if (txt && String(txt).trim()) {
          return { text: String(txt).trim(), source: 'cloud', stats: st, model: res.model };
        }
      } catch (e) {
        console.warn('[FFL nutrition week]', e);
        toast('雲端週報失敗，用本機模板', 'warn');
      }
      return { text: st.localText, source: 'local', stats: st };
    }

    let _lastNutrition = null;

    function ensureNutritionCard() {
      const page = document.getElementById('page-today');
      if (!page) return null;
      let el = document.getElementById('ffl-week-nutrition');
      if (!el) {
        el = document.createElement('div');
        el.id = 'ffl-week-nutrition';
        el.className = 'ffl-week-nutrition card';
        const anchor = document.getElementById('ffl-week-share') ||
          document.getElementById('home-summary-card') ||
          document.getElementById('home-water-card');
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor.nextSibling);
        else page.appendChild(el);
      }
      return el;
    }

    async function renderNutritionCard(forceCloud) {
      const el = ensureNutritionCard();
      if (!el) return;
      const st = collectNutritionWeek();
      el.innerHTML = `
        <div class="wn-title">🥗 本週營養報告 ${cloudOn('weeklyReport') ? '<span class="ffl-cloud-badge">雲端可選</span>' : '<span class="ffl-cloud-badge off">本機</span>'}</div>
        <div class="wn-macros">
          <div class="wn-pill"><strong>${st.avgKcal}</strong>kcal/日</div>
          <div class="wn-pill"><strong>${st.avgProtein}</strong>P g/日</div>
          <div class="wn-pill"><strong>${st.avgCarb}</strong>C g/日</div>
          <div class="wn-pill"><strong>${st.avgFat}</strong>F g/日</div>
        </div>
        <div class="wn-body" id="ffl-wn-body">載入中…</div>
        <div class="wn-source" id="ffl-wn-source"></div>
        <div class="wn-actions">
          <button type="button" class="btn btn-secondary btn-sm" id="ffl-wn-refresh">重新生成</button>
          <button type="button" class="btn btn-primary btn-sm" id="ffl-wn-share-png">📤 分享圖片</button>
          <button type="button" class="btn btn-ghost btn-sm" id="ffl-wn-to-chat">入對話</button>
        </div>`;
      const fill = async () => {
        const rep = await nutritionReportPreferCloud();
        _lastNutrition = rep;
        const body = el.querySelector('#ffl-wn-body');
        const src = el.querySelector('#ffl-wn-source');
        if (body) body.textContent = rep.text;
        if (src) src.textContent = rep.source === 'cloud'
          ? ('來源：雲端 /api/weekly-report' + (rep.model ? ' · ' + rep.model : ''))
          : '來源：本機營養模板（離線可用）';
      };
      await fill();
      el.querySelector('#ffl-wn-refresh').onclick = () => renderNutritionCard(true);
      el.querySelector('#ffl-wn-to-chat').onclick = async () => {
        const rep = _lastNutrition || await nutritionReportPreferCloud();
        if (typeof appendChatMessage === 'function') {
          appendChatMessage({
            messageId: typeof msgUid === 'function' ? msgUid() : ('wn-' + Date.now()),
            ownerUser: currentUser, role: 'bot',
            createdAt: typeof nowTs === 'function' ? nowTs() : new Date().toISOString(),
            text: rep.text, card: null
          });
          if (typeof renderChatThread === 'function') renderChatThread();
          if (typeof showPage === 'function') showPage('chat');
          toast('週報已寫入對話', 'success');
        }
      };
      el.querySelector('#ffl-wn-share-png').onclick = () => shareNutritionPng();
    }

    function drawNutritionCanvas(rep) {
      const st = (rep && rep.stats) || collectNutritionWeek();
      const text = (rep && rep.text) || localNutritionReportText(st);
      const W = 720, H = 960;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      // bg
      const grd = ctx.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, '#f0f7f4');
      grd.addColorStop(1, '#fff8f0');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
      // card
      roundRect(ctx, 36, 36, W - 72, H - 72, 28, '#ffffff', 'rgba(0,0,0,.06)');
      // title
      ctx.fillStyle = '#2d6a4f';
      ctx.font = 'bold 36px system-ui, sans-serif';
      ctx.fillText('BloomBody · 本週營養', 72, 110);
      ctx.fillStyle = '#666';
      ctx.font = '22px system-ui, sans-serif';
      ctx.fillText(st.from + ' → ' + st.to, 72, 148);
      // macros row
      const pills = [
        { l: 'kcal/日', v: String(st.avgKcal) },
        { l: '蛋白g', v: String(st.avgProtein) },
        { l: '碳水g', v: String(st.avgCarb) },
        { l: '脂肪g', v: String(st.avgFat) }
      ];
      pills.forEach((p, i) => {
        const x = 72 + i * 155;
        ctx.fillStyle = '#e8f5ef';
        roundRect(ctx, x, 180, 140, 88, 16, '#e8f5ef', null);
        ctx.fillStyle = '#1b4332';
        ctx.font = 'bold 32px system-ui, sans-serif';
        ctx.fillText(p.v, x + 16, 228);
        ctx.fillStyle = '#52796f';
        ctx.font = '16px system-ui, sans-serif';
        ctx.fillText(p.l, x + 16, 252);
      });
      // body text
      ctx.fillStyle = '#333';
      ctx.font = '20px ui-monospace, Menlo, monospace';
      const lines = String(text).split('\n');
      let y = 310;
      for (let i = 0; i < lines.length && y < H - 100; i++) {
        const line = lines[i].slice(0, 42);
        ctx.fillText(line, 72, y);
        y += 28;
      }
      // footer
      ctx.fillStyle = '#999';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText((rep && rep.source === 'cloud' ? 'Cloud weekly-report · ' : 'Local template · ') + '#BloomBody', 72, H - 60);
      return c;
    }

    function roundRect(ctx, x, y, w, h, r, fill, shadow) {
      if (shadow) {
        ctx.save();
        ctx.shadowColor = shadow;
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
      }
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fillStyle = fill || '#fff';
      ctx.fill();
      if (shadow) ctx.restore();
    }

    async function canvasToPngBlob(canvas) {
      return new Promise((resolve) => canvas.toBlob(b => resolve(b), 'image/png', 0.95));
    }

    async function shareNutritionPng() {
      const rep = _lastNutrition || { text: localNutritionReportText(collectNutritionWeek()), stats: collectNutritionWeek(), source: 'local' };
      const canvas = drawNutritionCanvas(rep);
      const blob = await canvasToPngBlob(canvas);
      if (!blob) { toast('無法產生圖片', 'warn'); return; }
      const file = new File([blob], 'BloomBody_week_nutrition.png', { type: 'image/png' });
      try {
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'BloomBody 本週營養', text: (rep.text || '').slice(0, 200) });
          toast('已分享圖片', 'success');
          return;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
      // download fallback
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('已下載週報圖片', 'success');
      // also try text share
      try {
        if (navigator.share) await navigator.share({ title: 'BloomBody', text: rep.text });
      } catch (_) {}
    }

    // Hook existing week-share card: add PNG button if missing
    function enhanceWeekSharePng() {
      const el = document.getElementById('ffl-week-share');
      if (!el || el.querySelector('#ffl-ws-png')) return;
      const actions = el.querySelector('.ws-actions');
      if (!actions) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'ffl-ws-png';
      b.className = 'btn btn-primary btn-sm';
      b.textContent = '📤 分享圖片';
      b.onclick = () => shareNutritionPng();
      actions.appendChild(b);
    }

    // Wire charts weekly button already uses cloud — also refresh nutrition card
    if (typeof showPage === 'function' && !showPage._fflDietWeek) {
      const _sp = showPage;
      showPage = function(name) {
        _sp(name);
        if (name === 'today') {
          expandOfflineCatalog();
          renderNutritionCard();
          setTimeout(enhanceWeekSharePng, 100);
        }
      };
      showPage._fflDietWeek = true;
    }

    function boot() {
      expandOfflineCatalog();
      try {
        renderNutritionCard();
        enhanceWeekSharePng();
      } catch (e) { console.warn('[FFL diet week]', e); }
    }

    window.FFL_DietWeekShare = {
      collectNutritionWeek, localNutritionReportText, nutritionReportPreferCloud,
      renderNutritionCard, shareNutritionPng, expandOfflineCatalog
    };

    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(boot, 'dietWeek');
    else setTimeout(boot, 320);
  })();
    /* @@FFL_EXPERT_JS@@ professional cite frameworks */
  (function injectExpertCite() {
    const CITE_SHORT =
      '專業參考框架 · 參考估算 · 非執業醫療／非持牌診症';
    const CITE_FULL =
      '專業參考框架（營養科學／運動生物學／ACSM·NSCA／WHO·ACE／西醫紅旗提示／中醫養生參考）。' +
      '參考估算，個人差異大。非執業醫療、非持牌診症、非註冊營養師膳療、非註冊中醫辯證、非一對一運動處方。不適或危急請諮詢合格專業人員／緊急服務。';
    const CITE_NUTRITION =
      '營養：膳食指南／MyPlate + 宏量記錄；MPS／恢復為教學提示；RDN 式謹慎（非個人膳療）。詳見應用內專業參考說明。';
    const CITE_EXERCISE =
      '運動：ACSM %HRmax（Tanaka）+ Compendium MET；NSCA 負荷／恢復用語；一致性優於複雜週期（非教練處方）。';
    const CITE_BODY =
      '體成分：WHO 國際 BMI + 亞洲關注切點（約 ≥23／≥27.5）；ACE／教育體脂範圍（非臨床評估）。';
    const CITE_SLEEP =
      '睡眠：成人常見公眾建議約 7–9 h；分數為 App 內規則，非睡眠醫學診斷。';
    const CITE_PERIOD =
      '經期：典型週期約 21–35 日粗估；受孕窗為日曆參考，非婦科診斷／避孕指導。';
    const CITE_SUP =
      '保健品：僅日誌記錄，不提供劑量或療效建議。';
    const CITE_SKIN =
      '護膚：僅 routine 記錄，非醫學美容或皮膚病診療。';
    const CITE_MD =
      '西醫：胸痛／暈厥／不合理氣促等為紅旗提示——停運動並考慮就醫；非急症分流或診斷。';
    const CITE_TCM =
      '中醫：四季起居／飲食為養生文化參考，非註冊中醫診症或中藥處方。';
    const CITE_UX =
      '設計：安全文案、可確認／可改、本機優先、來源透明（健康 App UX 原則）。';
    const CITE_OPS =
      '系統／自動化：Webhook→佇列→Worker、冪等、退避重試、DLQ、健康檢查與優雅降級（n8n／SRE 筆記；非安全認證聲明）。';
    const CITE_SOUP =
      '心靈雞湯為自護溫馨提示，非醫療建議。';

    function citeHtml(extra) {
      return `<div class="ffl-expert-cite"><strong>${CITE_SHORT}</strong>` +
        (extra ? `<br>${extra}` : '') +
        `<br><span style="opacity:.85">${CITE_FULL}</span></div>`;
    }

    // Upgrade rateBody: Asian BMI + ACE-ish body fat notes
    if (typeof rateBody === 'function' && !rateBody._fflExpert) {
      const _rb = rateBody;
      rateBody = function(metric, value, goals) {
        const r = _rb(metric, value, goals);
        if (value == null || value === '') return r;
        if (metric === 'bmi') {
          const v = +value;
          if (v >= 27.5) return { rate: '亞洲高風險切點', cls: 'rate-high', note: 'BMI≥27.5（WHO 亞洲公眾衛生高風險／肥胖行動點概括）· 非診斷' };
          if (v >= 25) return { rate: '偏高', cls: 'rate-high', note: 'BMI≥25（WHO 國際超重；亞洲框架亦屬較高風險關注）' };
          if (v >= 23) return { rate: '亞洲切點關注', cls: 'rate-high', note: 'BMI≥23：WHO 亞洲成人常討論之風險關注切點（篩查用）' };
          if (v < 18.5) return { rate: '偏低', cls: 'rate-low', note: 'BMI<18.5 · 注意營養充足（非診斷）' };
          return { rate: '標準區', cls: 'rate-ok', note: '介乎常見正常範圍（肌肉型可偏高，宜配體脂）' };
        }
        if (metric === 'bodyFat') {
          const v = +value;
          const sex = (state.meta && state.meta.profile && state.meta.profile.sex) || null;
          if (sex === 'M') {
            if (v > 25) return { rate: '偏高', cls: 'rate-high', note: '體脂偏高（ACE／教育用男性常見切點概括）' };
            if (v >= 18) return { rate: '一般區', cls: 'rate-ok', note: '體適能／一般範圍對照（估算）' };
            return { rate: '較低脂區', cls: 'rate-ok', note: '偏低脂；確保能量與恢復足夠' };
          }
          if (v > 32) return { rate: '偏高', cls: 'rate-high', note: '體脂偏高（ACE／教育用女性常見切點概括）· 續保肌減脂' };
          if (v >= 25) return { rate: '標準偏高', cls: 'rate-high', note: '可溫和減脂；非臨床診斷' };
          if (v >= 21) return { rate: '體適能區', cls: 'rate-ok', note: '常見體適能教育範圍對照' };
          return { rate: '理想／較低', cls: 'rate-ok', note: '體脂狀態不錯；過低亦需監察月經／能量' };
        }
        return r;
      };
      rateBody._fflExpert = true;
    }

    if (typeof buildSuggestions === 'function' && !buildSuggestions._fflExpert) {
      const _bs = buildSuggestions;
      buildSuggestions = function(agg, goals) {
        const tips = _bs(agg, goals).filter(t => !/規則摘要|不是醫療|非執業醫療|並非醫療/.test(t));
        const days = Math.max(1, (agg.checkinDays && agg.checkinDays.size) || 1);
        const avgK = agg.kcal / days;
        if (avgK > 0 && goals.kcal && avgK < goals.kcal * 0.75) {
          tips.push('【營養科學／RDN 謹慎】長期熱量明顯低於目標可能影響代謝、訓練恢復與荷爾蒙——優先充足蛋白與恢復，不建議極端限制。');
        }
        if (agg.exmin / days < 20) {
          tips.push('【WHO／ACSM 活動框架】成人常見建議約每週 150 分鐘中等有氧 + ≥2 日肌力；一致性優於複雜課表（NSCA／ACSM 精神），非強制處方。');
        }
        const avgSleep = agg.sleepN ? agg.sleepH / agg.sleepN : null;
        if (avgSleep != null && avgSleep < 6.5) {
          tips.push('【睡眠公眾建議】成人多建議約 7–9 h；偏短會影響恢復與食欲調節（記錄提示，非睡眠診斷）。');
        }
        tips.push('【西醫紅旗】胸痛、暈厥、不合理氣促 → 停運動並就醫；App 非急症分流。');
        try {
          const preset = (typeof currentGoalPreset === 'function') ? currentGoalPreset() : null;
          if (preset && preset.tipFocus && !tips.some(t => t.indexOf('【目標・') === 0)) {
            tips.unshift('【目標・' + preset.label + '】' + preset.tipFocus + '（參考估算／非執業醫療）');
          }
        } catch (_) {}
        tips.push(CITE_SHORT + ' · ' + CITE_NUTRITION + ' · 參考估算／非執業醫療');
        return tips;
      };
      buildSuggestions._fflExpert = true;
    }

    if (typeof buildFitFitLadyReportHTML === 'function' && !buildFitFitLadyReportHTML._fflExpert) {
      const _br = buildFitFitLadyReportHTML;
      buildFitFitLadyReportHTML = function(range) {
        let html = _br(range);
        html = html.replace(
          /<p class="stub-note"[^>]*>[\s\S]*?<\/p>/,
          `<p class="stub-note">${CITE_FULL} ${CITE_BODY} ${CITE_MD}</p>`
        );
        if (!/ffl-expert-cite/.test(html)) {
          html = html.replace(
            /(<\/div>\s*)$/,
            citeHtml(CITE_NUTRITION + ' · ' + CITE_EXERCISE + ' · ' + CITE_BODY + ' · ' + CITE_MD) + '$1'
          );
        }
        return html;
      };
      buildFitFitLadyReportHTML._fflExpert = true;
    }

    if (typeof buildExerciseEvaluation === 'function' && !buildExerciseEvaluation._fflExpert) {
      const _be = buildExerciseEvaluation;
      buildExerciseEvaluation = function(data) {
        const html = _be(data);
        if (typeof html === 'string') {
          return html.replace(
            /<div class="pro-disclaimer">[\s\S]*?<\/div>/,
            `<div class="pro-disclaimer">${CITE_EXERCISE} ${CITE_MD} ${CITE_FULL}</div>`
          );
        }
        return html;
      };
      buildExerciseEvaluation._fflExpert = true;
    }

    function stampCard(sel, extra) {
      const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (!el || el.querySelector('.ffl-expert-cite')) return;
      el.insertAdjacentHTML('beforeend', citeHtml(extra));
    }

    function stampDietConfirm() {
      const card = document.getElementById('p0-draft-card') || document.querySelector('.draft-confirm-card');
      if (!card || card.recordType === 'skip') return;
      const draft = typeof chatPendingDraft !== 'undefined' ? chatPendingDraft : null;
      if (draft && draft.recordType && draft.recordType !== 'diet') {
        if (draft.recordType === 'exercise') stampCard(card, CITE_EXERCISE + ' ' + CITE_MD);
        else if (draft.recordType === 'body') stampCard(card, CITE_BODY);
        else if (draft.recordType === 'sleep') stampCard(card, CITE_SLEEP);
        else if (draft.recordType === 'period') stampCard(card, CITE_PERIOD);
        else stampCard(card, CITE_SHORT);
        return;
      }
      if (!draft || draft.recordType === 'diet') {
        const note = card.querySelector('.stub-note');
        if (note) {
          note.textContent = CITE_NUTRITION + ' 熱量／宏量為估算，請確認後入帳。' + CITE_SHORT;
        }
        stampCard(card, CITE_NUTRITION);
        let badge = card.querySelector('.ffl-expert-badge');
        if (!badge) {
          const head = card.querySelector('.card-title, h3, .draft-head') || card.firstElementChild;
          badge = document.createElement('span');
          badge.className = 'ffl-expert-badge';
          badge.textContent = '專業參考框架';
          if (head) head.appendChild(badge);
        }
      }
    }

    function stampHomeCards() {
      stampCard('#ffl-week-nutrition', CITE_NUTRITION + ' 週報可走雲端／n8n stub，' + CITE_OPS);
      stampCard('#ffl-week-share', CITE_SLEEP + ' ' + CITE_SHORT);
      const sleepTips = document.querySelectorAll('.ffl-sleep-tip');
      sleepTips.forEach(t => {
        if (!t.dataset.expert) {
          t.dataset.expert = '1';
          t.insertAdjacentHTML('beforeend', ` <span class="ffl-expert-badge">7–9h 框架</span>`);
        }
      });
      const per = document.getElementById('period-panel-disclaimer') || document.querySelector('.period-disclaimer');
      if (per && !per.dataset.expert) {
        per.dataset.expert = '1';
        per.textContent = (per.textContent || '') + ' · ' + CITE_PERIOD;
      }
      stampCard('#home-sup-chip', CITE_SUP);
      stampCard('.supplements-card, #supplements-panel', CITE_SUP);
      stampCard('.skincare-card, #skincare-panel, #page-skincare', CITE_SKIN);
      // seal soup
      const soup = document.getElementById('ffl-seal-soup');
      if (soup && !soup.dataset.expert) {
        soup.dataset.expert = '1';
        const hint = soup.querySelector('.ss-hint');
        if (hint && !/非醫療/.test(hint.textContent || '')) {
          hint.textContent = (hint.textContent || '') + ' · ' + CITE_SOUP;
        }
      }
      // cloud AI settings card
      stampCard('.cloud-ai-card, #cloud-ai-card', CITE_OPS + ' ' + CITE_UX);
    }

    if (typeof renderDraftConfirmCard === 'function' && !renderDraftConfirmCard._fflExpert) {
      const _rd = renderDraftConfirmCard;
      renderDraftConfirmCard = function(draft) {
        _rd(draft);
        try { setTimeout(stampDietConfirm, 50); } catch (_) {}
      };
      renderDraftConfirmCard._fflExpert = true;
    }

    if (typeof renderDashboardP0 === 'function' && !renderDashboardP0._fflExpert) {
      const _rd0 = renderDashboardP0;
      renderDashboardP0 = function(range) {
        _rd0(range);
        try {
          const host = document.getElementById('ffl-dashboard');
          if (host && !host.querySelector('.ffl-expert-cite')) {
            host.insertAdjacentHTML('beforeend',
              citeHtml(CITE_NUTRITION + ' · ' + CITE_BODY + ' · ' + CITE_EXERCISE + ' · ' + CITE_MD + ' · ' + CITE_TCM));
          }
        } catch (_) {}
      };
      renderDashboardP0._fflExpert = true;
    }

    function ensureAppFooterCite() {
      let f = document.querySelector('.footer-disclaimer');
      if (!f) {
        f = document.createElement('div');
        f.className = 'footer-disclaimer ffl-expert-cite';
        const app = document.getElementById('app') || document.body;
        app.appendChild(f);
      }
      if (!f.dataset.expertFramework) {
        f.dataset.expertFramework = '1';
        f.innerHTML = citeHtml(
          '詳見應用內專業參考說明（營養／運動生物／運動處方原則／體成分教育範圍／西醫紅旗／中醫養生參考）。' +
          CITE_MD + ' ' + CITE_TCM + ' ' + CITE_OPS
        );
      }
    }

    if (typeof showPage === 'function' && !showPage._fflExpert) {
      const _sp = showPage;
      showPage = function(name) {
        _sp(name);
        try {
          ensureAppFooterCite();
          if (name === 'today') setTimeout(stampHomeCards, 120);
          if (name === 'settings') setTimeout(stampHomeCards, 120);
          if (name === 'charts' || name === 'stats') setTimeout(() => {
            const host = document.getElementById('ffl-dashboard');
            if (host && !host.querySelector('.ffl-expert-cite')) {
              host.insertAdjacentHTML('beforeend', citeHtml(CITE_FULL + ' ' + CITE_MD));
            }
          }, 80);
        } catch (_) {}
      };
      showPage._fflExpert = true;
    }

    if (window.FFL_DietWeekShare && window.FFL_DietWeekShare.localNutritionReportText &&
        !window.FFL_DietWeekShare.localNutritionReportText._fflExpert) {
      const _ln = window.FFL_DietWeekShare.localNutritionReportText;
      window.FFL_DietWeekShare.localNutritionReportText = function(st) {
        return _ln(st) + '\n\n——\n' + CITE_SHORT + '\n' + CITE_NUTRITION + '\n' + CITE_MD;
      };
      window.FFL_DietWeekShare.localNutritionReportText._fflExpert = true;
    }

    function boot() {
      ensureAppFooterCite();
      try { stampHomeCards(); } catch (_) {}
      window.FFL_ExpertCite = {
        CITE_SHORT, CITE_FULL, CITE_NUTRITION, CITE_EXERCISE, CITE_BODY,
        CITE_SLEEP, CITE_PERIOD, CITE_SUP, CITE_SKIN,
        CITE_MD, CITE_TCM, CITE_UX, CITE_OPS, CITE_SOUP, citeHtml
      };
    }

    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(boot, 'expert');
    else setTimeout(boot, 360);
  })();

/* @@FFL_SEAL_SOUP_JS@@ */
  (function injectSealSoup() {
    const LS_KEY = 'fitFitLady_sealSoup_idx';
    const QUOTES = [
      '今日即使不完美也可以——有開始就已勝過留在沙發上。🦭',
      '慢慢來才會快；今日多喝一點水、多走幾步，都算進步。',
      '身體不是敵人，而是陪你一起成長的隊友。',
      '休息也是訓練的一部分——睡好才有力氣繼續。',
      '不必與他人比較進度；只與昨日的自己握手。',
      '一餐不完美不等於失敗；下一餐再溫柔一點對待自己。',
      '流汗不必等到完美姿勢才開始——安全、舒適、可持續最重要。',
      '心情平淡也可以；活動一下身體，有時能幫助心情放鬆。',
      '多喝一口水、伸一伸腰——細小動作也是對自己的關心。',
      '堅持不是天天爆燈，而是不放棄回來。',
      '肌肉需要時間成長，自信也是——請給自己多一點耐心。',
      '今日選擇照顧自己，已經是一種勇氣。',
      '不必等「準備好」才開始；邊做邊學也可以。',
      '輕鬆一點、笑一下——運動與生活都不必過於嚴肅。',
      '你值得休息，也值得為自己感到驕傲。',
      '一小步也是腳印；累積下去就是你的路。',
      '身體說累就聽聽它；溫柔與堅持可以並存。',
      '今日的努力，是送給未來自己的禮物。',
      '不必完美打卡；有記錄、有反思，已經很好。',
      '海豹也要上岸透氣——你也可以放慢節奏。🦭',
      '與朋友一起活動更開心；健康可以很有人情味。',
      '蛋白質、蔬果、睡眠——基本功才是王道。',
      '不要用嚴格懲罰自己；改用好奇與溫柔來調整。',
      '心情起伏很正常；照顧自己不必等到完美才配得上。',
      '今日活動得少也可以；明天還可以再來。',
      '你已經比想像中更有韌性——多相信自己一點。',
      '把「應該」換成「我想試」——壓力會輕一些。',
      '皮膚、體重、分數都不定義你的價值。',
      '每一次回來打卡，都是對自己說：我還在。',
      '心靈雞湯不是藥方——只是提醒：你值得被善待。'
    ];

    function loadIdx() {
      try {
        const n = parseInt(localStorage.getItem(LS_KEY), 10);
        if (Number.isFinite(n) && n >= 0 && n < QUOTES.length) return n;
      } catch (_) {}
      return Math.floor(Math.random() * QUOTES.length);
    }

    function saveIdx(i) {
      try { localStorage.setItem(LS_KEY, String(i)); } catch (_) {}
    }

    let idx = loadIdx();

    function nextIdx(cur) {
      if (QUOTES.length <= 1) return 0;
      let n = cur;
      // prefer random different from current
      for (let t = 0; t < 8; t++) {
        n = Math.floor(Math.random() * QUOTES.length);
        if (n !== cur) break;
      }
      if (n === cur) n = (cur + 1) % QUOTES.length;
      return n;
    }

    function paint(el, bounce) {
      if (!el) return;
      const q = QUOTES[idx] || QUOTES[0];
      const quoteEl = el.querySelector('.ss-quote');
      if (quoteEl) quoteEl.textContent = q;
      if (bounce) {
        el.classList.remove('ss-bounce');
        void el.offsetWidth;
        el.classList.add('ss-bounce');
        setTimeout(() => el.classList.remove('ss-bounce'), 500);
      }
    }

    function ensureWidget() {
      if (ensureWidget._busy) return document.getElementById('ffl-seal-soup');
      ensureWidget._busy = true;
      try {
      const page = document.getElementById('page-today');
      if (!page) return null;
      let el = document.getElementById('ffl-seal-soup');
      if (!el) {
        el = document.createElement('div');
        el.id = 'ffl-seal-soup';
        el.className = 'ffl-seal-soup';
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', '小海豹心靈雞湯，點選可更換一句');
        el.innerHTML =
          '<div class="ss-seal" aria-hidden="true">🦭</div>' +
          '<div class="ss-body">' +
            '<div class="ss-label">🦭 小海豹 · 心靈雞湯</div>' +
            '<div class="ss-quote"></div>' +
            '<div class="ss-hint">點選小海豹可更換一句 · 健身／自護溫馨提示（非醫療）</div>' +
          '</div>';
        const anchor =
          document.getElementById('home-summary-card') ||
          document.getElementById('ffl-week-share') ||
          document.getElementById('home-water-card') ||
          document.getElementById('streak-banner');
        if (anchor && anchor.parentNode) {
          anchor.parentNode.insertBefore(el, anchor.nextSibling);
        } else {
          page.insertBefore(el, page.firstChild);
        }
        const cycle = (e) => {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          idx = nextIdx(idx);
          saveIdx(idx);
          paint(el, true);
          if (typeof toast === 'function') {
            try { toast('🦭 已更換一句心靈雞湯', 'success'); } catch (_) {}
          }
        };
        el.addEventListener('click', cycle);
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') cycle(e);
        });
      }
      paint(el, false);
      return el;
      } finally {
        ensureWidget._busy = false;
      }
    }

    function boot() {
      try { ensureWidget(); } catch (e) { console.warn('seal soup', e); }
    }

    // Re-mount after home hero re-renders (hero wipes siblings? no — widget is sibling)
    if (typeof renderHomeHero === 'function' && !renderHomeHero._fflSealSoup) {
      const _h = renderHomeHero;
      renderHomeHero = function() {
        const r = _h.apply(this, arguments);
        try { ensureWidget(); } catch (_) {}
        return r;
      };
      renderHomeHero._fflSealSoup = true;
    }
    if (typeof renderHomeSummaryCta === 'function' && !renderHomeSummaryCta._fflSealSoup) {
      const _c = renderHomeSummaryCta;
      renderHomeSummaryCta = function() {
        const r = _c.apply(this, arguments);
        try { ensureWidget(); } catch (_) {}
        return r;
      };
      renderHomeSummaryCta._fflSealSoup = true;
    }
    if (typeof showPage === 'function' && !showPage._fflSealSoup) {
      const _sp = showPage;
      showPage = function(name) {
        const r = _sp.apply(this, arguments);
        if (name === 'today' || name === 'home') {
          setTimeout(() => { try { ensureWidget(); } catch (_) {} }, 40);
        }
        return r;
      };
      showPage._fflSealSoup = true;
    }

    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(boot, 'seal');
    else setTimeout(boot, 420);

    window.FFL_SealSoup = {
      quotes: QUOTES,
      ensureWidget,
      next() {
        idx = nextIdx(idx);
        saveIdx(idx);
        paint(document.getElementById('ffl-seal-soup'), true);
        return QUOTES[idx];
      },
      current() { return QUOTES[idx]; }
    };
  })();












  /* ========== BB_T108_CLOUD_SYNC_AND_PARITY ========== */
  (function injectBbParityAndCloudSync() {
    const SYNC_META_KEY = 'bloombod_sync_meta_v1';
    const DEFAULT_SHARE = { diet: true, exercise: true, steps: true, body: true, sleep: true, water: true, period: false };

    function ensureUserShare() {
      if (!state.users) state.users = {};
      if (!currentUser) return null;
      const u = state.users[currentUser] || (state.users[currentUser] = { password: 'changeme', goals: { kcal: 1600, protein: 100 }, badges: [] });
      if (u.shareAnonymous == null) u.shareAnonymous = true;
      if (!u.shareWithFriends) u.shareWithFriends = Object.assign({}, DEFAULT_SHARE);
      if (!u.partnerShareScopes) u.partnerShareScopes = {};
      if (!state.meta) state.meta = {};
      if (!state.meta.profile) state.meta.profile = {};
      if (!state.meta.cloudSync) state.meta.cloudSync = { enabled: false, ownerHint: '' };
      if (!state.meta.profile.activityLevel) state.meta.profile.activityLevel = 'light';
      return u;
    }

    function loadSyncMeta() {
      try { return JSON.parse(localStorage.getItem(SYNC_META_KEY) || '{}'); } catch (_) { return {}; }
    }
    function saveSyncMeta(m) {
      try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(m || {})); } catch (_) {}
    }

    function getCloudBase() {
      const c = (state.meta && state.meta.cloudAi) || {};
      return String(c.baseUrl || '').trim().replace(/\/+$/, '');
    }
    function getApiKey() {
      try { return localStorage.getItem('fitFitLady_v1_cloudApiKey') || ''; } catch (_) { return ''; }
    }
    function syncConfigured() {
      const cs = (state.meta && state.meta.cloudSync) || {};
      return !!(cs.enabled && getCloudBase());
    }
    function isOnline() {
      try { return typeof navigator === 'undefined' || navigator.onLine !== false; } catch (_) { return true; }
    }

    async function syncFetch(path, body) {
      const base = getCloudBase();
      if (!base) throw new Error('no baseUrl');
      if (!isOnline()) throw new Error('offline');
      const key = getApiKey();
      const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (key) headers['Authorization'] = 'Bearer ' + key;
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const tmo = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (_) {} }, 20000);
      try {
        const res = await fetch(base + path, {
          method: 'POST',
          headers,
          body: JSON.stringify(body || {}),
          signal: ctrl ? ctrl.signal : undefined,
          credentials: 'omit',
          mode: 'cors'
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error('HTTP ' + res.status + ' ' + txt.slice(0, 120));
        }
        return await res.json();
      } finally { clearTimeout(tmo); }
    }

    function mergeRecords(localList, remoteList, ownerUser) {
      const map = {};
      (localList || []).forEach(r => { if (r && r.recordId) map[r.recordId] = r; });
      (remoteList || []).forEach(r => {
        if (!r || !r.recordId) return;
        if (ownerUser && r.ownerUser && r.ownerUser !== ownerUser) return;
        const cur = map[r.recordId];
        if (!cur) { map[r.recordId] = r; return; }
        const cu = String(cur.updatedAt || cur.timestamp || '');
        const ru = String(r.updatedAt || r.timestamp || '');
        if (ru >= cu) map[r.recordId] = Object.assign({}, cur, r);
      });
      return Object.keys(map).map(k => map[k]);
    }

    function ownerHint() {
      const cs = (state.meta && state.meta.cloudSync) || {};
      return (cs.ownerHint && String(cs.ownerHint).trim()) || currentUser || '';
    }

    async function syncPull() {
      if (!syncConfigured()) return { ok: false, offline: true, error: '未啟用雲同步或未填 Base URL · 使用本機' };
      if (!isOnline()) return { ok: false, offline: true, error: '離線 · 使用本機資料' };
      const owner = ownerHint();
      const meta = loadSyncMeta();
      const res = await syncFetch('/api/sync/pull', { ownerHint: owner, since: meta.lastPullAt || null, limit: 500 });
      if (!res || !res.ok) throw new Error((res && res.error) || 'pull 失敗');
      const mine = (state.records || []).filter(r => r.ownerUser === owner || r.ownerUser === currentUser);
      const others = (state.records || []).filter(r => r.ownerUser !== owner && r.ownerUser !== currentUser);
      const merged = mergeRecords(mine, res.records || [], owner);
      // normalize ownerUser to currentUser for local UX if same account alias
      merged.forEach(r => {
        if (!r.ownerUser) r.ownerUser = currentUser;
        if (owner && r.ownerUser === owner) r.ownerUser = currentUser;
      });
      state.records = others.concat(merged);
      if (res.profile && state.users[currentUser]) {
        const u = state.users[currentUser];
        const p = res.profile;
        if (p.gender != null) u.gender = p.gender;
        if (p.goals) u.goals = Object.assign({}, u.goals || {}, p.goals);
        if (p.shareWithFriends) u.shareWithFriends = Object.assign({}, u.shareWithFriends || {}, p.shareWithFriends);
        if (p.shareAnonymous != null) u.shareAnonymous = !!p.shareAnonymous;
        if (!state.meta.profile) state.meta.profile = {};
        ['heightCm', 'weightKg', 'age', 'activityLevel'].forEach(k => {
          if (p[k] != null) state.meta.profile[k] = p[k];
        });
        if (p.gender) {
          const gmap = { female: 'F', male: 'M', other: 'X', F: 'F', M: 'M' };
          state.meta.profile.sex = gmap[p.gender] || state.meta.profile.sex;
          state.meta.profile.gender = p.gender;
        }
      }
      saveState();
      meta.lastPullAt = res.syncedAt || meta.lastPullAt;
      meta.lastOk = true;
      saveSyncMeta(meta);
      try { renderHistory(); renderToday(); renderChart(); } catch (_) {}
      return { ok: true, count: (res.records || []).length, syncedAt: res.syncedAt };
    }

    async function syncPush() {
      if (!syncConfigured()) return { ok: false, offline: true, error: '未啟用雲同步或未填 Base URL · 僅本機' };
      if (!isOnline()) return { ok: false, offline: true, error: '離線 · 本機已保留' };
      const owner = ownerHint();
      const records = (state.records || [])
        .filter(r => r.ownerUser === currentUser || r.ownerUser === owner)
        .map(r => Object.assign({}, r, { ownerUser: owner || r.ownerUser }));
      const res = await syncFetch('/api/sync/push', { ownerHint: owner, records: records.slice(0, 500) });
      if (!res || !res.ok) throw new Error((res && res.error) || 'push 失敗');
      const meta = loadSyncMeta();
      meta.lastPushAt = res.syncedAt;
      meta.lastOk = true;
      saveSyncMeta(meta);
      return { ok: true, push: res.push || res, syncedAt: res.syncedAt };
    }

    async function syncBoth() {
      let pull = null, push = null;
      try { pull = await syncPull(); } catch (e) { pull = { ok: false, error: String(e.message || e) }; }
      try { push = await syncPush(); } catch (e) { push = { ok: false, error: String(e.message || e) }; }
      return { ok: !!(pull && pull.ok) || !!(push && push.ok), pull, push };
    }

    function setSyncStatus(text, on) {
      const el = document.getElementById('bb-sync-status');
      if (!el) return;
      el.className = 'cai-status ' + (on ? 'on' : 'off');
      el.textContent = text;
    }
    function refreshSyncStatus() {
      const base = getCloudBase();
      const cs = (state.meta && state.meta.cloudSync) || {};
      const meta = loadSyncMeta();
      if (!cs.enabled || !base) {
        setSyncStatus('未啟用 · 本機模式（離線可用）', false);
      } else if (!isOnline()) {
        setSyncStatus('已設定但離線 · 用本機', false);
      } else {
        setSyncStatus('已啟用 → ' + base + (meta.lastPullAt || meta.lastPushAt ? ' · 上次 ' + (meta.lastPushAt || meta.lastPullAt) : ''), true);
      }
      const en = document.getElementById('set-sync-enabled');
      const ow = document.getElementById('set-sync-owner');
      if (en) en.checked = !!cs.enabled;
      if (ow && document.activeElement !== ow) ow.value = cs.ownerHint || currentUser || '';
    }

    function wireSyncUi() {
      const saveBtn = document.getElementById('btn-sync-save');
      if (saveBtn && !saveBtn.dataset.bound) {
        saveBtn.dataset.bound = '1';
        saveBtn.onclick = () => {
          ensureUserShare();
          state.meta.cloudSync.enabled = !!(document.getElementById('set-sync-enabled') || {}).checked;
          state.meta.cloudSync.ownerHint = ((document.getElementById('set-sync-owner') || {}).value || '').trim();
          saveState();
          refreshSyncStatus();
          toast('同步設定已儲存', 'success');
        };
      }
      const bind = (id, fn, label) => {
        const b = document.getElementById(id);
        if (!b || b.dataset.bound) return;
        b.dataset.bound = '1';
        b.onclick = async () => {
          try {
            toast(label + '…', 'info');
            const r = await fn();
            refreshSyncStatus();
            if (r.offline) toast(r.error || '離線本機', 'warn');
            else if (r.ok) toast(label + '完成', 'success');
            else toast((r.error || label + '失敗'), 'warn');
          } catch (e) {
            refreshSyncStatus();
            toast(label + '失敗：' + (e.message || e) + ' · 本機資料保留', 'warn');
          }
        };
      };
      bind('btn-sync-pull', syncPull, '拉取');
      bind('btn-sync-push', syncPush, '推送');
      bind('btn-sync-both', syncBoth, '雙向同步');
    }

    /* ---- 5-tab nav aliases: record→history, review→habits (+ circle peek) ---- */
    const _showPage = showPage;
    showPage = function(name) {
      let n = name;
      if (n === 'record') n = 'history';
      if (n === 'review') n = 'habits';
      _showPage(n);
      // keep bottom-nav highlight on alias keys
      if (name === 'record' || name === 'review') {
        $all('.nav-item').forEach(nav => {
          nav.classList.toggle('active', nav.dataset.nav === name || (name === 'record' && nav.dataset.nav === 'history') || (name === 'review' && (nav.dataset.nav === 'habits' || nav.dataset.nav === 'review')));
        });
        // prefer alias button active
        $all('.nav-item').forEach(nav => nav.classList.toggle('active', nav.dataset.nav === name));
      }
      if (name === 'review' || n === 'habits') {
        try { if (typeof renderCirclePage === 'function') { /* circle still available via legacy */ } } catch (_) {}
        try { renderExpertPanel(); } catch (_) {}
      }
      if (n === 'charts' || n === 'history' || n === 'settings') {
        try { renderExpertPanel(); } catch (_) {}
      }
      if (n === 'settings') {
        try { fillShareForm(); wireShareUi(); wireSyncUi(); refreshSyncStatus(); fillActivity(); } catch (_) {}
      }
    };

    /* ---- Harris–Benedict / TDEE / Macros expert panel（與小程序 nutrition.js 對齊） ---- */
    const ACT = {
      sedentary: { k: 1.2, label: '久坐（幾乎無運動）' },
      light: { k: 1.375, label: '輕度活動（每週 1–3 天）' },
      moderate: { k: 1.55, label: '中度活動（每週 3–5 天）' },
      active: { k: 1.725, label: '高度活動（每週 6–7 天）' },
      athlete: { k: 1.9, label: '運動員級／體力勞動' }
    };
    const GOAL_MACRO = {
      preserve_cut: { label: '保肌減脂', calorieAdj: -300, pPerKg: 2.0, fatPct: 0.25 },
      recomp: { label: '增肌減脂', calorieAdj: -100, pPerKg: 2.0, fatPct: 0.25 },
      cut_fat: { label: '減脂肪', calorieAdj: -400, pPerKg: 2.0, fatPct: 0.25 },
      lose_weight: { label: '減重', calorieAdj: -500, pPerKg: 1.8, fatPct: 0.25 },
      cut_lose: { label: '減脂減重', calorieAdj: -450, pPerKg: 2.0, fatPct: 0.25 },
      cut_muscle_lose: { label: '減脂／減肌／減重', calorieAdj: -550, pPerKg: 1.6, fatPct: 0.25 },
      gain_muscle: { label: '增肌', calorieAdj: 300, pPerKg: 1.8, fatPct: 0.25 },
      lean_bulk: { label: '增肌控脂', calorieAdj: 200, pPerKg: 1.8, fatPct: 0.25 },
      maintain: { label: '維持健康', calorieAdj: 0, pPerKg: 1.6, fatPct: 0.30 },
      custom: { label: '自訂描述', calorieAdj: 0, pPerKg: 1.6, fatPct: 0.30 },
      lose: { label: '減脂', calorieAdj: -400, pPerKg: 2.0, fatPct: 0.25 },
      fatloss: { label: '減脂', calorieAdj: -400, pPerKg: 2.0, fatPct: 0.25 },
      gain: { label: '增肌', calorieAdj: 250, pPerKg: 1.8, fatPct: 0.25 },
      muscle: { label: '增肌', calorieAdj: 250, pPerKg: 1.8, fatPct: 0.25 }
    };
    function bbIsFemale(sex) {
      const s = String(sex || '').toLowerCase();
      return s === 'female' || s === 'f' || s === '女';
    }
    /** Harris–Benedict 修訂版（1984） */
    function harrisBenedictBmr({ sex, weightKg, heightCm, age }) {
      const w = +weightKg || 0, h = +heightCm || 0, a = +age || 30;
      if (!w || !h) return null;
      if (bbIsFemale(sex)) return Math.round(447.593 + 9.247 * w + 3.098 * h - 4.330 * a);
      return Math.round(88.362 + 13.397 * w + 4.799 * h - 5.677 * a);
    }
    /** Mifflin–St Jeor（對照） */
    function mifflinBmr({ sex, weightKg, heightCm, age }) {
      const w = +weightKg || 0, h = +heightCm || 0, a = +age || 30;
      if (!w || !h) return null;
      const base = 10 * w + 6.25 * h - 5 * a;
      return Math.round(bbIsFemale(sex) ? base - 161 : base + 5);
    }
    function bbResolveGoalKey(goal) {
      if (!goal) return 'maintain';
      if (typeof goal === 'object') {
        const id = goal.goalId || goal.mode || goal.id;
        if (id && GOAL_MACRO[id]) return id;
        const lab = goal.goalText || goal.label || '';
        const hit = Object.keys(GOAL_MACRO).find(k => GOAL_MACRO[k].label === lab);
        if (hit) return hit;
      }
      const s = String(goal).trim();
      if (GOAL_MACRO[s]) return s;
      const byLabel = Object.keys(GOAL_MACRO).find(k => GOAL_MACRO[k].label === s);
      if (byLabel) return byLabel;
      if (/增肌減脂|recomp/i.test(s)) return 'recomp';
      if (/保肌減脂|preserve/i.test(s)) return 'preserve_cut';
      if (/減脂減重/i.test(s)) return 'cut_lose';
      if (/減脂.?減肌.?減重/i.test(s)) return 'cut_muscle_lose';
      if (/減脂肪/i.test(s)) return 'cut_fat';
      if (/減重/i.test(s)) return 'lose_weight';
      if (/增肌控脂/i.test(s)) return 'lean_bulk';
      if (/增肌|gain|muscle/i.test(s)) return 'gain_muscle';
      if (/減脂|lose|fat/i.test(s)) return 'lose';
      return 'maintain';
    }
    function bbMacroTargets({ weightKg, tdeeKcal, goal }) {
      const w = +weightKg || 60;
      const t = +tdeeKcal || 1800;
      const key = bbResolveGoalKey(goal);
      const cfg = GOAL_MACRO[key] || GOAL_MACRO.maintain;
      const targetKcal = Math.max(1200, Math.round(t + cfg.calorieAdj));
      const proteinG = Math.round(w * cfg.pPerKg);
      const fatG = Math.round((targetKcal * cfg.fatPct) / 9);
      const carbG = Math.max(0, Math.round((targetKcal - proteinG * 4 - fatG * 9) / 4));
      const pct = (kcal) => targetKcal ? Math.round((kcal / targetKcal) * 100) : 0;
      return {
        goalKey: key, goalLabel: cfg.label, targetKcal, proteinG, fatG, carbG,
        proteinPerKg: cfg.pPerKg, fatPct: cfg.fatPct, calorieAdj: cfg.calorieAdj,
        proteinPct: pct(proteinG * 4), fatPctOut: pct(fatG * 9), carbPct: pct(carbG * 4)
      };
    }
    function bbBmi(weightKg, heightCm) {
      const w = +weightKg, h = +heightCm;
      if (!w || !h) return null;
      const m = h / 100;
      return +(w / (m * m)).toFixed(1);
    }
    function bbBmiBand(v) {
      if (v == null) return null;
      if (v < 18.5) return '偏輕';
      if (v < 24) return '正常範圍（亞洲成人參考）';
      if (v < 28) return '過重';
      return '肥胖範圍';
    }
    function bbIdealWeight({ sex, heightCm }) {
      const h = +heightCm;
      if (!h || h < 120) return null;
      const inches = h / 2.54;
      const female = bbIsFemale(sex);
      const center = +(female ? 45.5 + 2.3 * (inches - 60) : 50 + 2.3 * (inches - 60)).toFixed(1);
      return {
        centerKg: center,
        lowKg: +(center * 0.9).toFixed(1),
        highKg: +(center * 1.1).toFixed(1),
        brocaKg: +((female ? h - 105 : h - 100)).toFixed(1)
      };
    }
    function skeletalMuscleKg({ sex, weightKg, heightCm, age }) {
      const w = +weightKg, hCm = +heightCm, a = +age || 30;
      if (!w || !hCm) return null;
      const hm = hCm / 100;
      const female = bbIsFemale(sex);
      let sm = 0.244 * w + 7.8 * hm - 0.098 * a + (female ? -4.5 : 6.6);
      sm = Math.max(10, Math.min(w * 0.55, sm));
      return +sm.toFixed(1);
    }
    function shapeAssessment({ sex, whr, skeletalMusclePct, bodyFat }) {
      const female = bbIsFemale(sex);
      const appleCut = female ? 0.85 : 0.9;
      const pearCut = female ? 0.75 : 0.85;
      let shape = '均衡', tip = '維持規律記錄即可對照趨勢。';
      if (whr != null) {
        if (whr >= appleCut) { shape = '蘋果型（腰圍相對較高）'; tip = '可優先關注腰圍與核心訓練（參考估算）。'; }
        else if (whr <= pearCut) { shape = '梨型（臀圍相對較高）'; tip = '可加強下肢力量與蛋白攝取（參考估算）。'; }
        else shape = '中間型';
      }
      return { shape, tip };
    }

    function latestBody() {
      const recs = (typeof myRecords === 'function' ? myRecords() : (state.records || []).filter(r => r.ownerUser === currentUser))
        .filter(r => r.recordType === 'body')
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      return recs[0] || null;
    }

    function computeNutritionPanel(loggedKcal) {
      ensureUserShare();
      const p = state.meta.profile || {};
      const body = latestBody();
      const bd = (body && body.data) || {};
      const sex = p.gender || p.sex || (state.users[currentUser] && state.users[currentUser].gender) || 'female';
      const weightKg = p.weightKg != null ? +p.weightKg : (bd.weight != null ? +bd.weight : null);
      const heightCm = p.heightCm != null ? +p.heightCm : null;
      const age = p.age != null ? +p.age : 30;
      const actKey = p.activityLevel || 'light';
      const act = ACT[actKey] || ACT.light;
      const goalObj = (state.users[currentUser] && state.users[currentUser].goals) || {};
      const goalKey = bbResolveGoalKey(goalObj.goalId || goalObj.goalText || p.goalId || p.goalText || currentGoalPreset());
      const bmrHb = harrisBenedictBmr({ sex, weightKg, heightCm, age });
      const bmrMf = mifflinBmr({ sex, weightKg, heightCm, age });
      const tdee = bmrHb != null ? Math.round(bmrHb * act.k) : null;
      const tdeeMf = bmrMf != null ? Math.round(bmrMf * act.k) : null;
      const macros = (bmrHb != null && weightKg) ? bbMacroTargets({ weightKg, tdeeKcal: tdee, goal: goalKey }) : null;
      const bmiVal = bbBmi(weightKg, heightCm);
      const ideal = bbIdealWeight({ sex, heightCm });
      const sm = skeletalMuscleKg({ sex, weightKg, heightCm, age });
      const smp = (sm != null && weightKg) ? +((sm / weightKg) * 100).toFixed(1) : null;
      const waist = bd.waist != null ? +bd.waist : null;
      const hip = bd.hip != null ? +bd.hip : null;
      const ratio = (waist && hip) ? +(waist / hip).toFixed(2) : null;
      const shape = shapeAssessment({ sex, whr: ratio, skeletalMusclePct: smp, bodyFat: bd.bodyFat });
      let balance = null;
      if (loggedKcal != null && Number.isFinite(+loggedKcal)) {
        const logged = Math.round(+loggedKcal);
        const vsTdee = tdee != null ? logged - tdee : null;
        const vsTarget = macros ? logged - macros.targetKcal : null;
        const ref = vsTarget != null ? vsTarget : vsTdee;
        let label = '接近參考目標';
        if (ref != null) {
          if (ref > 150) label = '相對盈餘（高於參考）';
          else if (ref < -150) label = '相對缺口（低於參考）';
        }
        balance = { loggedKcal: logged, vsTdee, vsTarget, label };
      }
      return {
        sex, weightKg, heightCm, age, act, actKey, goalKey,
        bmr: bmrHb, bmrHb, bmrMf, tdee, tdeeMf, macros,
        bmi: bmiVal, bmiBand: bbBmiBand(bmiVal), ideal, sm, smp, ratio, shape, balance
      };
    }

    function renderExpertPanel() {
      const host = document.getElementById('bb-expert-panel');
      if (!host) return;
      const n = computeNutritionPanel(null);
      const { bmr, bmrMf, tdee, tdeeMf, macros, act, bmi, bmiBand, ideal, sm, smp, ratio, shape } = n;
      host.innerHTML = `
        <div class="card-title">專業日報告參考（Harris–Benedict）</div>
        <div class="macros-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin:8px 0;">
          <div><div class="muted">BMR（HB 1984）</div><strong>${bmr != null ? bmr + ' kcal' : '—'}</strong></div>
          <div><div class="muted">BMR（Mifflin 對照）</div><strong>${bmrMf != null ? bmrMf + ' kcal' : '—'}</strong></div>
          <div><div class="muted">TDEE（${act.label}）</div><strong>${tdee != null ? tdee + ' kcal' : '—'}</strong></div>
          <div><div class="muted">活動係數</div><strong>${act.k}</strong></div>
          <div><div class="muted">目標熱量${macros ? '・' + macros.goalLabel : ''}</div><strong>${macros ? macros.targetKcal + ' kcal' : '—'}</strong></div>
          <div><div class="muted">蛋白／脂肪／碳水</div><strong>${macros ? macros.proteinG + 'g（' + macros.proteinPct + '%） / ' + macros.fatG + 'g（' + macros.fatPctOut + '%） / ' + macros.carbG + 'g（' + macros.carbPct + '%）' : '—'}</strong></div>
          <div><div class="muted">BMI</div><strong>${bmi != null ? bmi : '—'}${bmiBand ? '・' + bmiBand : ''}</strong></div>
          <div><div class="muted">理想體重</div><strong>${ideal ? ideal.lowKg + '–' + ideal.highKg + ' kg' : '—'}</strong></div>
          <div><div class="muted">骨骼肌估</div><strong>${sm != null ? sm + ' kg' : '—'}${smp != null ? '（' + smp + '%）' : ''}</strong></div>
          <div><div class="muted">腰臀比</div><strong>${ratio != null ? ratio : '—'}</strong></div>
        </div>
        <div class="muted">體型：${shape.shape} · ${shape.tip}</div>
        <div class="muted" style="margin-top:4px;font-size:12px;">主用 Harris–Benedict 修訂版（1984）；Mifflin TDEE 對照 ${tdeeMf != null ? tdeeMf + ' kcal' : '—'}。參考估算 · 非執業醫療。請於設定補齊性別／身高／年齡／活動量／目標。</div>
      `;
    }

        function fillActivity() {
      ensureUserShare();
      const sel = document.getElementById('set-activity');
      if (sel) {
        const v = (state.meta.profile && state.meta.profile.activityLevel) || 'light';
        if (document.activeElement !== sel) sel.value = v;
        if (!sel.dataset.bound) {
          sel.dataset.bound = '1';
          sel.addEventListener('change', () => {
            ensureUserShare();
            state.meta.profile.activityLevel = sel.value || 'light';
            saveState();
            renderExpertPanel();
          });
        }
      }
      // also persist height from set-height into profile
      const h = document.getElementById('set-height');
      if (h && !h.dataset.bbBound) {
        h.dataset.bbBound = '1';
        h.addEventListener('change', () => {
          ensureUserShare();
          state.meta.profile.heightCm = h.value === '' ? null : +h.value;
          saveState();
          renderExpertPanel();
        });
      }
    }

    function fillShareForm() {
      const u = ensureUserShare();
      if (!u) return;
      const anon = document.getElementById('set-share-anonymous');
      if (anon) anon.checked = u.shareAnonymous !== false;
      document.querySelectorAll('#set-share-types [data-share]').forEach(inp => {
        const k = inp.getAttribute('data-share');
        inp.checked = !!(u.shareWithFriends && u.shareWithFriends[k]);
      });
      const inv = document.getElementById('set-my-invite');
      if (inv) {
        if (!u.inviteCode) {
          u.inviteCode = (currentUser || 'BB').slice(0, 3).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
          saveState();
        }
        inv.value = u.inviteCode;
      }
    }

    function wireShareUi() {
      const save = document.getElementById('btn-save-share');
      if (save && !save.dataset.bound) {
        save.dataset.bound = '1';
        save.onclick = () => {
          const u = ensureUserShare();
          u.shareAnonymous = !!(document.getElementById('set-share-anonymous') || {}).checked;
          const sw = Object.assign({}, DEFAULT_SHARE);
          document.querySelectorAll('#set-share-types [data-share]').forEach(inp => {
            sw[inp.getAttribute('data-share')] = !!inp.checked;
          });
          u.shareWithFriends = sw;
          saveState();
          toast('分享設定已儲存', 'success');
        };
      }
      const join = document.getElementById('btn-join-friend');
      if (join && !join.dataset.bound) {
        join.dataset.bound = '1';
        join.onclick = () => {
          const u = ensureUserShare();
          const code = ((document.getElementById('set-join-code') || {}).value || '').trim();
          const pname = ((document.getElementById('set-partner-name') || {}).value || '').trim() || '好友';
          if (!code) { toast('請輸入邀請碼', 'warn'); return; }
          const scopes = Object.assign({}, DEFAULT_SHARE);
          document.querySelectorAll('#set-join-share-types [data-join-share]').forEach(inp => {
            scopes[inp.getAttribute('data-join-share')] = !!inp.checked;
          });
          if (!u.partners) u.partners = [];
          if (!u.partners.find(p => p.code === code)) u.partners.push({ code, name: pname, scopes, joinedAt: new Date().toISOString() });
          u.partnerShareScopes[code] = scopes;
          saveState();
          toast('已加入好友圈（本機；雲端需小程序／網關確認）', 'success');
        };
      }
    }

    /* auto-push after local save when configured */
    const _saveState = typeof saveState === 'function' ? saveState : null;
    // lightweight: after commit, enqueue background push of single record via hook on state.records length — skip to avoid loops; user uses manual sync / both on focus

    window.BB_CloudSync = { syncPull, syncPush, syncBoth, syncConfigured, refreshSyncStatus, renderExpertPanel };

    function bootParity() {
      try {
        ensureUserShare();
        wireSyncUi();
        wireShareUi();
        fillShareForm();
        fillActivity();
        refreshSyncStatus();
        renderExpertPanel();
        window.addEventListener('online', refreshSyncStatus);
        window.addEventListener('offline', refreshSyncStatus);
      } catch (e) { console.warn('bb parity boot', e); }
    }
    if (window.FFL_AuthGate) FFL_AuthGate.scheduleBoot(bootParity, 'bb-parity-sync');
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(bootParity, 400));
    else setTimeout(bootParity, 400);
  })();


})();



