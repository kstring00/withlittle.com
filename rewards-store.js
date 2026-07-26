/**
 * Reward Store — the editable Reward Garage data layer.
 *
 * Owns the `fs-credits` document (localStorage via window.storage, synced to
 * the cloud like fs-stewardship). Extends the original preset-reward document
 * written by stewardship-credits.js into a fully editable reward system while
 * preserving the existing balance, ledger, and reward IDs.
 *
 * Hard rules, in code and on purpose:
 *  - the balance can never go negative;
 *  - prior ledger entries are never rewritten;
 *  - one credit award per habit + date (duplicate reps award nothing);
 *  - the daily earning cap is enforced;
 *  - credits unlock permission inside a real budget — they never create money.
 */
(function(root){
  'use strict';

  const STORAGE_KEY = 'fs-credits';
  const SAVE_DELAY = 500;
  const LEGACY_LOCAL_KEYS = ['fs-credits'];   // pre-store plain-localStorage location

  const DEFAULT_SETTINGS = { full:10, minimum:4, recovery:1, dailyCap:60 };
  const CATEGORIES = ['Recovery','Adventure','Vehicle','Fitness','Food','Experience','Gear','Lifestyle','Education','Relationships'];
  const TIER_LABELS = { full:'Full Rep', minimum:'Minimum Rep', recovery:'Recovery Rep' };

  function uid(){
    if(typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
  }
  function nowIso(){ return new Date().toISOString(); }
  function todayStr(){ return new Date().toISOString().slice(0,10); }
  function num(v, fallback){ const n = Number(v); return Number.isFinite(n) ? n : fallback; }

  let data = blankData();
  let loaded = false;
  let saveTimer = null;
  let readyPromise = null;

  function blankData(){
    return {
      version: 2,
      balance: 0,
      ledger: [],
      rewards: [],
      settings: Object.assign({}, DEFAULT_SETTINGS),
      meta: { migrations: {} }
    };
  }

  /* ── normalization ─────────────────────────────────────────── */
  function normReward(r, i){
    r = r || {};
    return Object.assign({}, r, {
      id: r.id || uid(),
      name: String(r.name ?? r.title ?? '').trim(),
      description: r.description ?? r.budgetNote ?? '',
      category: r.category || 'Lifestyle',
      creditCost: Math.max(1, Math.round(num(r.creditCost ?? r.cost, 1))),
      moneyCost: r.moneyCost == null ? null : Math.max(0, num(r.moneyCost, 0)),
      budgetBucket: r.budgetBucket || null,
      repeatable: r.repeatable !== false,
      cooldownDays: Math.max(0, Math.round(num(r.cooldownDays, 0))),
      requiredStageId: r.requiredStageId || null,
      requiredMilestoneId: r.requiredMilestoneId || null,
      active: r.active !== false,
      archived: !!r.archived,
      sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : (typeof i === 'number' ? i : 0),
      imageUrl: r.imageUrl || null,
      icon: r.icon || null,
      createdAt: r.createdAt || nowIso(),
      updatedAt: r.updatedAt || r.createdAt || nowIso()
    });
  }
  // Ledger entries are historical records: normalize shape for reading but
  // keep every original field untouched (never rewrite amounts or labels).
  function normLedgerEntry(x){
    const type = x.type === 'earned' ? 'earn' : x.type === 'redeemed' ? 'redeem' : (x.type || 'earn');
    return Object.assign({}, x, { id: x.id || uid(), type, amount: num(x.amount, 0) });
  }
  function normalize(raw){
    const d = Object.assign(blankData(), raw || {});
    d.balance = Math.max(0, num(d.balance, 0));
    d.ledger = Array.isArray(d.ledger) ? d.ledger.map(normLedgerEntry) : [];
    d.rewards = Array.isArray(d.rewards) ? d.rewards.map(normReward) : [];
    d.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});
    if(!d.meta || typeof d.meta !== 'object') d.meta = {};
    if(!d.meta.migrations || typeof d.meta.migrations !== 'object') d.meta.migrations = {};
    return d;
  }

  /* ── migrations ────────────────────────────────────────────── */
  const LEGACY_CATEGORY_GUESS = {
    'coffee':'Food', 'gaming':'Recovery', 'meal':'Food',
    'fishing-gear':'Gear', 'gym':'Fitness', 'fishing-day':'Experience'
  };
  function runEditableRewardsV1(){
    if(data.meta.migrations.editableRewardsV1) return false;
    let upgraded = 0;
    data.rewards = data.rewards.map((r, i)=>{
      // Legacy preset shape: { id, title, cost, budgetNote }. normReward has
      // already mapped title→name and cost→creditCost; here we only fill in
      // the fields the presets never had.
      const legacy = r.title != null && r.name === String(r.title).trim();
      if(legacy){
        upgraded++;
        if(!r.category || r.category === 'Lifestyle') r.category = LEGACY_CATEGORY_GUESS[r.id] || 'Lifestyle';
        if(!r.description && r.budgetNote) r.description = r.budgetNote;
      }
      if(typeof r.sortOrder !== 'number') r.sortOrder = i;
      return r;
    });
    data.meta.migrations.editableRewardsV1 = {
      version: 1, migratedAt: nowIso(), upgradedRewards: upgraded,
      preservedLedgerEntries: data.ledger.length, preservedBalance: data.balance
    };
    return true;
  }

  /* ── persistence ───────────────────────────────────────────── */
  async function readPersisted(){
    // Canonical location: window.storage (wsr:fs-credits).
    let canonical = null;
    try{
      const r = await root.storage?.get(STORAGE_KEY);
      if(r?.value) canonical = JSON.parse(r.value);
    }catch(e){ console.warn('[RewardStore] canonical read failed', e); }
    // Legacy location: stewardship-credits.js used to write plain
    // localStorage 'fs-credits'. Adopt it once if it holds more history than
    // the canonical copy (or the canonical copy doesn't exist yet).
    let legacy = null;
    try{
      for(const k of LEGACY_LOCAL_KEYS){
        const v = localStorage.getItem(k);
        if(v){ legacy = JSON.parse(v); break; }
      }
    }catch(e){}
    if(legacy && (!canonical || (legacy.ledger?.length || 0) > (canonical.ledger?.length || 0))){
      return legacy;
    }
    return canonical;
  }
  async function load(){
    try{
      data = normalize(await readPersisted());
    }catch(e){
      console.warn('[RewardStore] load failed, starting fresh', e);
      data = blankData();
    }
    loaded = true;
    if(runEditableRewardsV1()) await persistNow();
    return data;
  }
  function init(){
    if(!readyPromise) readyPromise = load();
    return readyPromise;
  }
  async function reload(){
    readyPromise = load();
    await readyPromise;
    emitChange();
    return data;
  }
  async function persistNow(){
    if(!loaded) return;   // never write the blank placeholder over persisted data
    try{ await root.storage?.set(STORAGE_KEY, JSON.stringify(data)); }
    catch(e){ console.warn('[RewardStore] save failed', e); }
    if(typeof root.scheduleCloudPush === 'function') root.scheduleCloudPush([STORAGE_KEY]);
  }
  function emitChange(){
    try{ root.dispatchEvent?.(new CustomEvent('withlittle:credits-changed')); }catch(e){}
  }
  function save(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, SAVE_DELAY);
    emitChange();
  }

  /* ── ledger & balance ──────────────────────────────────────── */
  function addLedgerEntry(entry){
    const e = Object.assign({
      id: uid(), date: todayStr(), at: nowIso(),
      type: 'earn', sourceType: '', sourceId: null,
      amount: 0, reason: '', balanceAfter: 0
    }, entry);
    e.label = e.label || e.reason;   // legacy readers show `label`
    data.ledger.unshift(e);
    return e;
  }
  function getBalance(){ return data.balance; }
  function getLedger(){ return data.ledger; }
  function getSettings(){ return data.settings; }
  function updateSettings(patch){
    data.settings = Object.assign({}, data.settings, patch || {});
    save(); return data.settings;
  }
  function earnedOn(dateStr){
    return data.ledger.filter(x=>x.date===dateStr && x.type==='earn')
      .reduce((n,x)=>n+Math.max(0,x.amount), 0);
  }
  function earnedToday(){ return earnedOn(todayStr()); }
  function earnedThisWeek(){
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - ((now.getDay()+6)%7)); // Monday
    const startStr = start.toISOString().slice(0,10);
    return data.ledger.filter(x=>x.type==='earn' && x.date >= startStr && x.date <= todayStr())
      .reduce((n,x)=>n+Math.max(0,x.amount), 0);
  }
  /** Manual, transparent balance correction — always leaves a ledger trail. */
  function adjust(amount, reason){
    const amt = Math.round(num(amount, 0));
    if(!amt) return null;
    if(data.balance + amt < 0) return null;   // adjustments can't go negative either
    data.balance += amt;
    const e = addLedgerEntry({
      type:'adjustment', sourceType:'manual', amount:amt,
      reason: reason || 'Manual adjustment', balanceAfter: data.balance
    });
    save(); return e;
  }

  /* ── earning (habit reps) ──────────────────────────────────── */
  function tierAmountFor(habit, tier){
    const perHabit = {
      full: habit?.fullRepCredits, minimum: habit?.minimumRepCredits, recovery: habit?.recoveryRepCredits
    }[tier];
    if(Number.isFinite(Number(perHabit)) && perHabit !== null && perHabit !== '') return Math.max(0, Math.round(Number(perHabit)));
    return Math.max(0, num(data.settings[tier], 0));
  }
  function hasEarnFor(habitId, dateStr){
    return data.ledger.some(x=>x.type==='earn' && String(x.habitId)===String(habitId) && x.date===dateStr);
  }
  /**
   * Record a habit rep and award its fixed credits.
   * Duplicate-safe twice over: the habit's reps log (fs-stewardship) and the
   * credit ledger (fs-credits) are both checked before any award.
   */
  function recordRep(habitId, tier, dateStr){
    const Stew = root.StewStore;
    if(!Stew) return { ok:false, reason:'store-unavailable' };
    const habit = Stew.getHabit(habitId);
    if(!habit) return { ok:false, reason:'habit-not-found' };
    if(!TIER_LABELS[tier]) return { ok:false, reason:'bad-tier' };
    const date = dateStr || todayStr();
    const reps = habit.reps && typeof habit.reps === 'object' ? habit.reps : {};
    if(reps[date]) return { ok:false, reason:'already-recorded', rep: reps[date] };
    if(hasEarnFor(habitId, date)) return { ok:false, reason:'already-awarded' };

    const capLeft = Math.max(0, num(data.settings.dailyCap, 0) - earnedOn(date));
    const amount = Math.min(tierAmountFor(habit, tier), capLeft);

    // 1–2) save the rep type + mark the date complete (Rainmeter reads log)
    const nextReps = Object.assign({}, reps, { [date]: { tier, completedAt: nowIso(), credits: amount } });
    const nextLog = Object.assign({}, habit.log || {}, { [date]: true });
    Stew.updateHabit(habitId, { reps: nextReps, log: nextLog });

    // 3–5) award fixed credits, once, on the ledger
    if(amount > 0){
      data.balance += amount;
      addLedgerEntry({
        type:'earn', sourceType:'habit', sourceId: habitId, habitId, tier,
        date, amount, balanceAfter: data.balance,
        reason: (habit.title || habit.name || 'Habit') + ' — ' + TIER_LABELS[tier]
      });
    }
    save();
    // 6) linked stage-system activity
    try{ root.TrajectoryStore?.noteHabitActivity?.(habitId, date, tier); }catch(e){}
    return { ok:true, amount, capped: amount < tierAmountFor(habit, tier) };
  }

  /* ── rewards CRUD ──────────────────────────────────────────── */
  function sortRewards(list){ return list.slice().sort((a,b)=>a.sortOrder-b.sortOrder || a.name.localeCompare(b.name)); }
  function getRewards(opts){
    let list = sortRewards(data.rewards);
    if(!opts?.includeArchived) list = list.filter(r=>!r.archived);
    return list;
  }
  function getReward(id){ return data.rewards.find(r=>r.id===id) || null; }
  function validateReward(p){
    const errors = [];
    if(!String(p.name ?? '').trim()) errors.push('Reward name is required.');
    if(!(num(p.creditCost, 0) > 0)) errors.push('Credit cost must be greater than zero.');
    if(p.moneyCost != null && p.moneyCost !== '' && num(p.moneyCost, -1) < 0) errors.push('Money cost cannot be negative.');
    if(num(p.cooldownDays, 0) < 0) errors.push('Cooldown cannot be negative.');
    return errors;
  }
  function createReward(p){
    const errors = validateReward(p || {});
    if(errors.length) return { ok:false, errors };
    const r = normReward(Object.assign({}, p, {
      sortOrder: data.rewards.length ? Math.max(...data.rewards.map(x=>x.sortOrder))+1 : 0
    }));
    data.rewards.push(r); save();
    return { ok:true, reward:r };
  }
  function updateReward(id, p){
    const r = getReward(id); if(!r) return { ok:false, errors:['Reward not found.'] };
    const merged = Object.assign({}, r, p);
    const errors = validateReward(merged);
    if(errors.length) return { ok:false, errors };
    Object.assign(r, normReward(merged), { id: r.id, createdAt: r.createdAt, updatedAt: nowIso() });
    save(); return { ok:true, reward:r };
  }
  function deleteReward(id){
    // The reward disappears; its redemption history stays on the ledger.
    data.rewards = data.rewards.filter(r=>r.id!==id);
    save();
  }
  function archiveReward(id, archived){
    const r = getReward(id); if(!r) return null;
    r.archived = archived !== false;
    r.updatedAt = nowIso(); save(); return r;
  }
  function moveReward(id, dir){
    const list = sortRewards(data.rewards);
    const i = list.findIndex(r=>r.id===id);
    const j = i + (dir < 0 ? -1 : 1);
    if(i < 0 || j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((r,k)=>{ r.sortOrder = k; });
    save(); return true;
  }

  /* ── redemption ────────────────────────────────────────────── */
  function redemptionsFor(rewardId){
    return data.ledger.filter(x=>x.type==='redeem' && String(x.rewardId)===String(rewardId));
  }
  function lastRedemptionAt(rewardId){
    const list = redemptionsFor(rewardId);
    if(!list.length) return null;
    return list.map(x=>x.at || x.date).sort().pop();
  }
  function cooldownRemainingDays(reward){
    if(!reward.cooldownDays) return 0;
    const last = lastRedemptionAt(reward.id);
    if(!last) return 0;
    const elapsed = (Date.now() - new Date(last).getTime()) / 86400000;
    return Math.max(0, Math.ceil(reward.cooldownDays - elapsed));
  }
  function stageLockInfo(reward){
    const T = root.TrajectoryStore;
    if(reward.requiredStageId){
      const stage = T?.getStage?.(reward.requiredStageId);
      if(!stage) return null;   // stage was deleted — don't lock forever on a ghost
      const open = ['Ready','Active','Completed','Stewarding','Released'].includes(stage.status);
      if(!open) return { kind:'stage', title: stage.title, status: stage.status };
    }
    if(reward.requiredMilestoneId){
      const m = T?.getMilestone?.(reward.requiredMilestoneId);
      if(m && !m.completed) return { kind:'milestone', title: m.title };
    }
    return null;
  }
  /** Why a reward can't be redeemed right now — or null when it can. */
  function redeemBlocker(reward){
    if(!reward) return { code:'missing', message:'Reward not found.' };
    if(reward.archived) return { code:'archived', message:'This reward is archived.' };
    if(!reward.active) return { code:'paused', message:'This reward is paused.' };
    if(!reward.repeatable && redemptionsFor(reward.id).length)
      return { code:'one-time', message:'Already redeemed — this is a one-time reward.' };
    const cd = cooldownRemainingDays(reward);
    if(cd > 0) return { code:'cooldown', message:'Cooling down — available in '+cd+(cd===1?' day.':' days.') };
    const lock = stageLockInfo(reward);
    if(lock) return {
      code:'locked',
      message: lock.kind==='stage'
        ? 'Locked until the “'+lock.title+'” stage is reached.'
        : 'Locked until the “'+lock.title+'” milestone is complete.'
    };
    if(data.balance < reward.creditCost)
      return { code:'credits', message:(reward.creditCost - data.balance)+' more credits needed.' };
    return null;
  }
  function redeem(rewardId){
    const r = getReward(rewardId);
    const blocked = redeemBlocker(r);
    if(blocked) return { ok:false, blocked };
    if(data.balance - r.creditCost < 0) return { ok:false, blocked:{ code:'credits', message:'Not enough credits.' } };
    data.balance -= r.creditCost;
    addLedgerEntry({
      type:'redeem', sourceType:'reward', sourceId: r.id, rewardId: r.id,
      amount: -r.creditCost, balanceAfter: data.balance,
      reason: 'Redeemed: ' + r.name
    });
    save();
    return { ok:true, balance: data.balance };
  }
  /** Cheapest reward not yet affordable — the "next closest" garage target. */
  function nextClosestReward(){
    const candidates = getRewards().filter(r=>r.active && !redeemBlockerIgnoringCredits(r) && r.creditCost > data.balance);
    if(!candidates.length) return null;
    return candidates.sort((a,b)=>a.creditCost-b.creditCost)[0];
  }
  function redeemBlockerIgnoringCredits(r){
    const b = redeemBlocker(r);
    return b && b.code !== 'credits' ? b : null;
  }

  root.RewardStore = {
    init, load, reload, save,
    get data(){ return data; },
    CATEGORIES, TIER_LABELS, DEFAULT_SETTINGS,
    getBalance, getLedger, getSettings, updateSettings,
    earnedToday, earnedThisWeek, earnedOn, adjust,
    tierAmountFor, recordRep, hasEarnFor,
    getRewards, getReward, createReward, updateReward, deleteReward,
    archiveReward, moveReward, validateReward,
    redeem, redeemBlocker, redemptionsFor, cooldownRemainingDays, nextClosestReward
  };

  /* ── self-tests (run from test-trajectory-rewards.html) ────── */
  root.runRewardStoreTests = async function(){
    const results = [];
    function assert(name, cond, detail){
      results.push({ name, pass: !!cond, detail: detail || '' });
      if(!cond) throw new Error(name+(detail ? ': '+detail : ''));
    }
    const saved = { data, loaded };
    try{
      // migration from the legacy preset document
      data = normalize({
        version:1, balance:57,
        ledger:[{ id:'L1', type:'earn', amount:10, date:'2026-07-01', label:'Old earn', habitId:'h1' },
                { id:'L2', type:'redeem', amount:-25, date:'2026-07-02', label:'Redeemed: Specialty coffee', rewardId:'coffee' }],
        rewards:[{ id:'coffee', title:'Specialty coffee', cost:25, budgetNote:'Use only from the existing food/reward budget.' }],
        settings:{ full:10, minimum:4, recovery:1, dailyCap:60 }
      });
      loaded = false;   // block persistence during tests
      const changed = runEditableRewardsV1();
      assert('migration runs once', changed && !runEditableRewardsV1());
      assert('balance preserved', data.balance === 57);
      assert('ledger preserved', data.ledger.length === 2 && data.ledger[1].id==='L2' && data.ledger[1].amount===-25);
      const coffee = getReward('coffee');
      assert('preset reward upgraded in place', coffee && coffee.name==='Specialty coffee' && coffee.creditCost===25 && coffee.category==='Food');
      assert('budget note preserved', coffee.description.includes('existing food/reward budget'));

      // validation
      assert('name required', !createReward({ name:'', creditCost:10 }).ok);
      assert('credit cost > 0', !createReward({ name:'X', creditCost:0 }).ok);
      assert('money cost >= 0', !createReward({ name:'X', creditCost:10, moneyCost:-5 }).ok);
      assert('cooldown >= 0', !createReward({ name:'X', creditCost:10, cooldownDays:-1 }).ok);
      const made = createReward({ name:'Track day', creditCost:40, moneyCost:120, budgetBucket:'Recreation', repeatable:false });
      assert('create works', made.ok && getReward(made.reward.id));

      // redemption guards
      const rr = redeem(made.reward.id);
      assert('redeem succeeds with credits', rr.ok && data.balance === 17);
      assert('balanceAfter recorded', data.ledger[0].balanceAfter === 17 && data.ledger[0].type==='redeem');
      assert('one-time blocks second redeem', redeem(made.reward.id).blocked?.code === 'one-time');
      assert('insufficient credits block', redeem('coffee').blocked?.code === 'credits');
      assert('no negative balance ever', data.balance >= 0);

      // earning caps and duplicates (fake StewStore)
      const fakeHabit = { id:'h9', title:'BCBA Study', log:{}, reps:{}, fullRepCredits:50 };
      const realStew = root.StewStore;
      root.StewStore = {
        getHabit:(id)=> id==='h9' ? fakeHabit : null,
        updateHabit:(id,p)=> Object.assign(fakeHabit, p)
      };
      const before = data.balance;
      const e1 = recordRep('h9','full');
      assert('rep awards per-habit credits', e1.ok && e1.amount === 50 && data.balance === before + 50);
      assert('rep marked complete for Rainmeter', fakeHabit.log[todayStr()] === true && fakeHabit.reps[todayStr()].tier==='full');
      const e2 = recordRep('h9','full');
      assert('duplicate rep awards nothing', !e2.ok && e2.reason==='already-recorded');
      // cap check with a second habit
      const fakeHabit2 = { id:'h10', title:'Training', log:{}, reps:{}, fullRepCredits:999 };
      root.StewStore.getHabit = (id)=> id==='h9' ? fakeHabit : (id==='h10' ? fakeHabit2 : null);
      root.StewStore.updateHabit = (id,p)=> Object.assign(id==='h9'?fakeHabit:fakeHabit2, p);
      const e3 = recordRep('h10','full');
      assert('daily cap enforced', e3.ok && e3.amount === 10 && earnedOn(todayStr()) === data.settings.dailyCap, 'earned '+earnedOn(todayStr()));
      root.StewStore = realStew;

      // adjustment can't go negative
      assert('adjustment floor at zero', adjust(-99999,'test') === null);

      results.push({ name:'ALL REWARD STORE TESTS', pass:true, detail: results.length+' checks' });
      return { pass:true, fail:0, results };
    }catch(e){
      results.push({ name:'FAILED', pass:false, detail:e.message });
      return { pass:false, fail:1, results, error:e.message };
    }finally{
      data = saved.data; loaded = saved.loaded;
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
