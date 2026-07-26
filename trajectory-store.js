/**
 * Trajectory Store — life stages, milestones, assets, and readiness.
 *
 * Owns the `fs-trajectory` document (localStorage via window.storage, synced
 * to the cloud like fs-stewardship). Connects daily faithfulness to long-term
 * career, financial, leadership, health, spiritual, housing, and lifestyle
 * direction through an ordered, fully editable set of life stages.
 *
 * Habits are never duplicated here — stages hold references to existing
 * fs-stewardship habit IDs only.
 */
(function(root){
  'use strict';

  const STORAGE_KEY = 'fs-trajectory';
  const SAVE_DELAY = 500;

  const STAGE_STATUSES = ['Dream','Exploring','Building','Ready','Active','Completed','Stewarding','Released'];
  const MILESTONE_TYPES = ['career','financial','housing','health','spiritual','leadership','relationship','lifestyle'];
  const ASSET_TYPES = ['Car','Home','Career','Experience','Business','Health','Education','Giving','Relationship','Other'];
  const ASSET_STATUSES = ['Dreaming','Researching','Saving','Ready','Acquired','Released'];
  const READINESS_CATEGORIES = [
    { id:'credential', label:'Credential readiness' },
    { id:'financial',  label:'Financial readiness' },
    { id:'emotional',  label:'Emotional readiness' },
    { id:'leadership', label:'Leadership readiness' },
    { id:'health',     label:'Health readiness' },
    { id:'lifestyle',  label:'Lifestyle readiness' },
    { id:'spiritual',  label:'Spiritual alignment' }
  ];

  function uid(){
    if(typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'id-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
  }
  function nowIso(){ return new Date().toISOString(); }
  function num(v, fallback){ const n = Number(v); return Number.isFinite(n) ? n : fallback; }
  function clamp01to100(v){ return Math.max(0, Math.min(100, Math.round(num(v, 0)))); }

  let data = blankData();
  let loaded = false;
  let saveTimer = null;
  let readyPromise = null;

  function blankData(){
    return {
      version: 1,
      northStar: {
        statement: 'Build capacity that glorifies God, serves people, and prepares me for greater stewardship.',
        imageUrl: null
      },
      stages: [],
      milestones: [],
      assets: [],
      activity: {},   // habitId → { lastDate, lastTier } — light stage-system pulse, not a second log
      meta: { migrations: {} }
    };
  }

  /* ── normalization ─────────────────────────────────────────── */
  function normReadiness(r){
    const out = {};
    READINESS_CATEGORIES.forEach(c=>{
      const v = r && typeof r === 'object' ? r[c.id] : null;
      out[c.id] = {
        score: clamp01to100(v?.score),
        note: v?.note || '',
        auto: !!v?.auto
      };
    });
    return out;
  }
  function normStage(s, i){
    s = s || {};
    return Object.assign({}, s, {
      id: s.id || uid(),
      order: typeof s.order === 'number' ? s.order : (typeof i === 'number' ? i : 0),
      title: String(s.title || '').trim(),
      subtitle: s.subtitle || '',
      status: STAGE_STATUSES.includes(s.status) ? s.status : 'Dream',
      identityStatement: s.identityStatement || '',
      becoming: s.becoming || '',
      characterQualities: s.characterQualities || '',
      leadershipPosture: s.leadershipPosture || '',
      spiritualAlignment: s.spiritualAlignment || '',
      whyChain: s.whyChain || '',
      primaryAspiration: s.primaryAspiration || '',
      imageUrl: s.imageUrl || null,
      imageAlt: s.imageAlt || '',
      focusAreas: Array.isArray(s.focusAreas) ? s.focusAreas.map(String) : [],
      gates: Array.isArray(s.gates) ? s.gates.map(g=>({
        id: g.id || uid(), text: String(g.text ?? g ?? ''), met: !!g.met
      })) : [],
      readiness: normReadiness(s.readiness),
      unlockRules: Object.assign({
        dependsOnStageId: null, minReadiness: null, minSavings: null,
        credential: '', notBefore: null, manualApproval: false, approvedAt: null
      }, s.unlockRules || {}),
      habitIds: Array.isArray(s.habitIds) ? [...new Set(s.habitIds.map(String))] : [],
      archived: !!s.archived,
      createdAt: s.createdAt || nowIso(),
      updatedAt: s.updatedAt || s.createdAt || nowIso()
    });
  }
  function normMilestone(m, i){
    m = m || {};
    return Object.assign({}, m, {
      id: m.id || uid(),
      stageId: m.stageId || null,
      title: String(m.title || '').trim(),
      description: m.description || '',
      type: MILESTONE_TYPES.includes(m.type) ? m.type : 'career',
      targetValue: m.targetValue == null || m.targetValue === '' ? null : num(m.targetValue, null),
      currentValue: m.currentValue == null || m.currentValue === '' ? null : num(m.currentValue, null),
      unit: m.unit || null,
      completed: !!m.completed,
      required: m.required !== false,
      dueDate: m.dueDate || null,
      sortOrder: typeof m.sortOrder === 'number' ? m.sortOrder : (typeof i === 'number' ? i : 0),
      notes: m.notes || ''
    });
  }
  function normAsset(a, i){
    a = a || {};
    return Object.assign({}, a, {
      id: a.id || uid(),
      stageId: a.stageId || null,
      title: String(a.title || '').trim(),
      type: ASSET_TYPES.includes(a.type) ? a.type : 'Other',
      description: a.description || '',
      imageUrl: a.imageUrl || null,
      imageAlt: a.imageAlt || '',
      estimatedCost: a.estimatedCost == null || a.estimatedCost === '' ? null : Math.max(0, num(a.estimatedCost, 0)),
      targetDate: a.targetDate || null,
      priority: typeof a.priority === 'number' ? a.priority : (typeof i === 'number' ? i : 0),
      status: ASSET_STATUSES.includes(a.status) ? a.status : 'Dreaming',
      archived: !!a.archived,
      notes: a.notes || ''
    });
  }
  function normalize(raw){
    const d = Object.assign(blankData(), raw || {});
    if(!d.northStar || typeof d.northStar !== 'object') d.northStar = blankData().northStar;
    if(!d.northStar.statement) d.northStar.statement = blankData().northStar.statement;
    d.stages = (Array.isArray(d.stages) ? d.stages : []).map(normStage);
    d.milestones = (Array.isArray(d.milestones) ? d.milestones : []).map(normMilestone);
    d.assets = (Array.isArray(d.assets) ? d.assets : []).map(normAsset);
    if(!d.activity || typeof d.activity !== 'object') d.activity = {};
    if(!d.meta || typeof d.meta !== 'object') d.meta = {};
    if(!d.meta.migrations || typeof d.meta.migrations !== 'object') d.meta.migrations = {};
    return d;
  }

  /* ── seed (trajectoryV1, exactly once) ─────────────────────── */
  const SEED_STAGE_IDS = {
    rbt: 'stage-rbt-foundation',
    bcba: 'stage-bcba-independence',
    supra: 'stage-supra',
    director: 'stage-clinical-director',
    executive: 'stage-executive-gt3rs'
  };
  function seedStages(){
    const mk = (id, order, s)=> normStage(Object.assign({ id, order, status:'Dream' }, s));
    const stages = [
      mk(SEED_STAGE_IDS.rbt, 0, {
        title:'RBT Foundation',
        subtitle:'Build the competence, health, faithfulness, and systems that everything else depends on.',
        status:'Active',
        primaryAspiration:'Current Hyundai Elantra N',
        identityStatement:'This stage is not beneath the vision. This is where the capacity for the vision is built.',
        whyChain:'I want greater competence\nso that I can carry greater responsibility\nso that I can develop others\nso that more people are served well\nso that God is glorified through faithful stewardship.',
        focusAreas:[
          'Become an excellent RBT','Grow clinical understanding','Complete BCBA education',
          'Complete fieldwork','Strengthen emotional regulation','Protect rest and health',
          'Build savings','Maintain strong credit','Develop reusable systems','Deepen spiritual formation'
        ]
      }),
      mk(SEED_STAGE_IDS.bcba, 1, {
        title:'BCBA Independence and Home',
        subtitle:'Become a BCBA, establish stable income, and secure an independent home.',
        identityStatement:'A clinically competent BCBA who is financially grounded and able to serve without desperation.'
      }),
      mk(SEED_STAGE_IDS.supra, 2, {
        title:'Supra Stage',
        subtitle:'Enjoy a meaningful automotive reward after housing and financial foundations are stable.',
        primaryAspiration:'2026 MK5 Toyota Supra — matte black',
        gates:[
          'Active BCBA credential','Stable BCBA employment','Emergency fund maintained','Housing settled',
          'Retirement contribution maintained','No high-interest debt','Vehicle payment safely fits the budget',
          'Purchase does not undermine giving, savings, or housing'
        ].map(text=>({ text }))
      }),
      mk(SEED_STAGE_IDS.director, 3, {
        title:'Clinical Director and Mercedes',
        subtitle:'Develop people, lead clinical systems, and carry greater organizational responsibility.',
        primaryAspiration:'Matte-black Mercedes-Benz — Model not selected yet.'
      }),
      mk(SEED_STAGE_IDS.executive, 4, {
        title:'Executive, Owner, and GT3 RS',
        subtitle:'Multiply capacity through leadership, ownership, systems, generosity, and long-term stewardship.',
        primaryAspiration:'Black Porsche 911 GT3 RS\nBlack wheels\nCarbon-fiber details\nRestrained red highlights',
        identityStatement:'The GT3 RS represents patience, mastery, craftsmanship, and disciplined compounding. It is a reward, not the purpose.',
        gates:[
          'Home secure','Retirement and investments on track','No destabilizing consumer debt',
          'Business or executive income stable','Giving commitments intact',
          'Family and health responsibilities protected',
          'Purchase does not delay business reserves or major obligations',
          'Desire remains after a defined waiting period',
          'Total ownership costs are sustainably affordable'
        ].map(text=>({ text }))
      })
    ];
    // Stage 2 depends on Stage 1, and so on down the roadmap.
    stages[1].unlockRules.dependsOnStageId = SEED_STAGE_IDS.rbt;
    stages[2].unlockRules.dependsOnStageId = SEED_STAGE_IDS.bcba;
    stages[3].unlockRules.dependsOnStageId = SEED_STAGE_IDS.bcba;
    stages[4].unlockRules.dependsOnStageId = SEED_STAGE_IDS.director;

    const mkM = (stageId, i, title, type)=> normMilestone({
      id:'seed-'+stageId+'-m'+i, stageId, title, type: type || 'career', sortOrder:i
    });
    const milestones = [
      mkM(SEED_STAGE_IDS.bcba, 0, 'Complete Temple ABA program', 'career'),
      mkM(SEED_STAGE_IDS.bcba, 1, 'Complete supervised fieldwork', 'career'),
      mkM(SEED_STAGE_IDS.bcba, 2, 'Pass the BCBA examination', 'career'),
      mkM(SEED_STAGE_IDS.bcba, 3, 'Secure a stable BCBA position', 'career'),
      mkM(SEED_STAGE_IDS.bcba, 4, 'Maintain the position long enough to confirm income stability', 'financial'),
      mkM(SEED_STAGE_IDS.bcba, 5, 'Complete emergency fund', 'financial'),
      mkM(SEED_STAGE_IDS.bcba, 6, 'Settle housing plan', 'housing'),
      mkM(SEED_STAGE_IDS.bcba, 7, 'Purchase or move into a home', 'housing'),
      mkM(SEED_STAGE_IDS.bcba, 8, 'Stabilize housing expenses', 'housing'),
      mkM(SEED_STAGE_IDS.director, 0, 'Demonstrate strong BCBA clinical judgment', 'career'),
      mkM(SEED_STAGE_IDS.director, 1, 'Mentor RBTs and future BCBAs', 'leadership'),
      mkM(SEED_STAGE_IDS.director, 2, 'Build team systems', 'leadership'),
      mkM(SEED_STAGE_IDS.director, 3, 'Lead difficult conversations well', 'leadership'),
      mkM(SEED_STAGE_IDS.director, 4, 'Manage performance and culture', 'leadership'),
      mkM(SEED_STAGE_IDS.director, 5, 'Maintain sustainable boundaries', 'health'),
      mkM(SEED_STAGE_IDS.director, 6, 'Secure a Clinical Director role', 'career'),
      mkM(SEED_STAGE_IDS.director, 7, 'Stabilize Clinical Director income', 'financial')
    ];
    return { stages, milestones };
  }
  function runTrajectoryV1(){
    if(data.meta.migrations.trajectoryV1) return false;
    const seed = seedStages();
    let added = 0;
    seed.stages.forEach(s=>{
      if(!data.stages.some(x=>x.id===s.id)){ data.stages.push(s); added++; }
    });
    seed.milestones.forEach(m=>{
      if(!data.milestones.some(x=>x.id===m.id)){ data.milestones.push(m); }
    });
    data.meta.migrations.trajectoryV1 = { version:1, migratedAt: nowIso(), seededStages: added };
    return true;
  }

  /* ── persistence ───────────────────────────────────────────── */
  async function load(){
    try{
      const raw = await root.storage?.get(STORAGE_KEY);
      data = normalize(raw?.value ? JSON.parse(raw.value) : null);
    }catch(e){
      console.warn('[TrajectoryStore] load failed, starting fresh', e);
      data = blankData();
    }
    loaded = true;
    if(runTrajectoryV1()) await persistNow();
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
    if(!loaded) return;
    try{ await root.storage?.set(STORAGE_KEY, JSON.stringify(data)); }
    catch(e){ console.warn('[TrajectoryStore] save failed', e); }
    if(typeof root.scheduleCloudPush === 'function') root.scheduleCloudPush([STORAGE_KEY]);
  }
  function emitChange(){
    try{ root.dispatchEvent?.(new CustomEvent('withlittle:trajectory-changed')); }catch(e){}
  }
  function save(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, SAVE_DELAY);
    emitChange();
  }
  function touch(obj){ if(obj) obj.updatedAt = nowIso(); save(); }

  /* ── north star ────────────────────────────────────────────── */
  function getNorthStar(){ return data.northStar; }
  function updateNorthStar(patch){
    Object.assign(data.northStar, patch || {});
    save(); return data.northStar;
  }

  /* ── stages ────────────────────────────────────────────────── */
  function sortStages(list){ return list.slice().sort((a,b)=>a.order-b.order); }
  function getStages(opts){
    let list = sortStages(data.stages);
    if(!opts?.includeArchived) list = list.filter(s=>!s.archived);
    return list;
  }
  function getStage(id){ return data.stages.find(s=>s.id===id) || null; }
  function createStage(p){
    const s = normStage(Object.assign({}, p, {
      order: data.stages.length ? Math.max(...data.stages.map(x=>x.order))+1 : 0
    }));
    if(!s.title) s.title = 'New stage';
    data.stages.push(s); save(); return s;
  }
  function updateStage(id, p){
    const s = getStage(id); if(!s) return null;
    Object.assign(s, normStage(Object.assign({}, s, p)), { id: s.id, createdAt: s.createdAt });
    touch(s); return s;
  }
  function archiveStage(id, archived){
    const s = getStage(id); if(!s) return null;
    s.archived = archived !== false; touch(s); return s;
  }
  function releaseStage(id){ return updateStage(id, { status:'Released' }); }
  function completeStage(id){ return updateStage(id, { status:'Completed' }); }
  function deleteStage(id){
    data.stages = data.stages.filter(s=>s.id!==id);
    data.milestones = data.milestones.filter(m=>m.stageId!==id);
    data.assets.forEach(a=>{ if(a.stageId===id) a.stageId = null; });
    data.stages.forEach(s=>{ if(s.unlockRules.dependsOnStageId===id) s.unlockRules.dependsOnStageId = null; });
    save();
  }
  function moveStage(id, dir){
    const list = sortStages(data.stages);
    const i = list.findIndex(s=>s.id===id);
    const j = i + (dir < 0 ? -1 : 1);
    if(i < 0 || j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((s,k)=>{ s.order = k; });
    save(); return true;
  }
  /** The stage currently being lived in — Active first, else first not-finished. */
  function currentStage(){
    const list = getStages();
    return list.find(s=>s.status==='Active')
      || list.find(s=>!['Completed','Stewarding','Released'].includes(s.status))
      || list[0] || null;
  }
  function nextStage(){
    const list = getStages();
    const cur = currentStage();
    if(!cur) return null;
    return list.find(s=>s.order > cur.order && !['Completed','Stewarding','Released'].includes(s.status)) || null;
  }

  /* ── milestones ────────────────────────────────────────────── */
  function getMilestones(stageId){
    let list = data.milestones.slice().sort((a,b)=>a.sortOrder-b.sortOrder);
    if(stageId) list = list.filter(m=>m.stageId===stageId);
    return list;
  }
  function getMilestone(id){ return data.milestones.find(m=>m.id===id) || null; }
  function createMilestone(p){
    const list = getMilestones(p?.stageId);
    const m = normMilestone(Object.assign({}, p, {
      sortOrder: list.length ? Math.max(...list.map(x=>x.sortOrder))+1 : 0
    }));
    if(!m.title) m.title = 'New milestone';
    data.milestones.push(m); save(); return m;
  }
  function updateMilestone(id, p){
    const m = getMilestone(id); if(!m) return null;
    Object.assign(m, normMilestone(Object.assign({}, m, p)), { id: m.id });
    save(); return m;
  }
  function deleteMilestone(id){
    data.milestones = data.milestones.filter(m=>m.id!==id);
    save();
  }
  function toggleMilestone(id){
    const m = getMilestone(id); if(!m) return null;
    m.completed = !m.completed; save(); return m;
  }
  function moveMilestone(id, dir){
    const m = getMilestone(id); if(!m) return false;
    const list = getMilestones(m.stageId);
    const i = list.findIndex(x=>x.id===id);
    const j = i + (dir < 0 ? -1 : 1);
    if(i < 0 || j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((x,k)=>{ x.sortOrder = k; });
    save(); return true;
  }
  function milestoneProgress(m){
    if(m.completed) return 100;
    if(m.targetValue != null && m.targetValue > 0 && m.currentValue != null){
      return Math.max(0, Math.min(100, Math.round(m.currentValue / m.targetValue * 100)));
    }
    return 0;
  }

  /* ── assets ────────────────────────────────────────────────── */
  function getAssets(stageId, opts){
    let list = data.assets.slice().sort((a,b)=>a.priority-b.priority);
    if(stageId) list = list.filter(a=>a.stageId===stageId);
    if(!opts?.includeArchived) list = list.filter(a=>!a.archived);
    return list;
  }
  function getAsset(id){ return data.assets.find(a=>a.id===id) || null; }
  function createAsset(p){
    const list = getAssets(p?.stageId, { includeArchived:true });
    const a = normAsset(Object.assign({}, p, {
      priority: list.length ? Math.max(...list.map(x=>x.priority))+1 : 0
    }));
    if(!a.title) a.title = 'New aspiration';
    data.assets.push(a); save(); return a;
  }
  function updateAsset(id, p){
    const a = getAsset(id); if(!a) return null;
    Object.assign(a, normAsset(Object.assign({}, a, p)), { id: a.id });
    save(); return a;
  }
  function deleteAsset(id){ data.assets = data.assets.filter(a=>a.id!==id); save(); }
  function archiveAsset(id, archived){
    const a = getAsset(id); if(!a) return null;
    a.archived = archived !== false; save(); return a;
  }
  function moveAsset(id, dir){
    const a = getAsset(id); if(!a) return false;
    const list = getAssets(a.stageId, { includeArchived:true });
    const i = list.findIndex(x=>x.id===id);
    const j = i + (dir < 0 ? -1 : 1);
    if(i < 0 || j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((x,k)=>{ x.priority = k; });
    save(); return true;
  }

  /* ── stage systems (existing habit references only) ────────── */
  function linkHabit(stageId, habitId){
    const s = getStage(stageId); if(!s) return null;
    habitId = String(habitId);
    if(!s.habitIds.includes(habitId)) s.habitIds.push(habitId);
    touch(s); return s;
  }
  function unlinkHabit(stageId, habitId){
    const s = getStage(stageId); if(!s) return null;
    s.habitIds = s.habitIds.filter(h=>h!==String(habitId));
    touch(s); return s;
  }
  function stagesForHabit(habitId){
    return getStages().filter(s=>s.habitIds.includes(String(habitId)));
  }
  /** Called by the credit layer when a rep lands — a pulse, not a second log. */
  function noteHabitActivity(habitId, dateStr, tier){
    if(!stagesForHabit(habitId).length) return;
    data.activity[String(habitId)] = { lastDate: dateStr, lastTier: tier };
    save();
  }

  /* ── readiness & progress ──────────────────────────────────── */
  function setReadiness(stageId, categoryId, patch){
    const s = getStage(stageId); if(!s || !s.readiness[categoryId]) return null;
    const r = s.readiness[categoryId];
    if(patch.score != null) r.score = clamp01to100(patch.score);
    if(patch.note != null) r.note = String(patch.note);
    if(patch.auto != null) r.auto = !!patch.auto;
    touch(s); return r;
  }
  /**
   * Achievement: how much of the stage's defined work is done
   * (milestones + gates). Readiness: how prepared the person is (averaged
   * category scores, with optional milestone contribution). Kept separate on
   * purpose — one number would lie.
   */
  function stageAchievement(stageId){
    const s = getStage(stageId); if(!s) return { percent:null, done:0, total:0 };
    const ms = getMilestones(stageId);
    const parts = ms.length + s.gates.length;
    if(!parts) return { percent:null, done:0, total:0 };
    const done = ms.filter(m=>m.completed).length + s.gates.filter(g=>g.met).length;
    return { percent: Math.round(done/parts*100), done, total: parts };
  }
  function stageReadiness(stageId){
    const s = getStage(stageId); if(!s) return { percent:0, categories:{} };
    const ach = stageAchievement(stageId);
    let sum = 0, n = 0;
    const categories = {};
    READINESS_CATEGORIES.forEach(c=>{
      const r = s.readiness[c.id];
      // auto: milestone completion lifts (never lowers) the manual rating
      const score = r.auto && ach.percent != null ? Math.max(r.score, ach.percent) : r.score;
      categories[c.id] = { score, note: r.note, auto: r.auto, manual: r.score };
      sum += score; n++;
    });
    return { percent: n ? Math.round(sum/n) : 0, categories };
  }
  /** Every unlock condition for a stage with its current pass/fail state. */
  function stageUnlockState(stageId){
    const s = getStage(stageId); if(!s) return { unlocked:true, checks:[] };
    const u = s.unlockRules;
    const checks = [];
    if(u.dependsOnStageId){
      const dep = getStage(u.dependsOnStageId);
      if(dep) checks.push({
        label:'“'+dep.title+'” completed',
        met: ['Completed','Stewarding','Released'].includes(dep.status)
      });
    }
    const required = getMilestones(stageId).filter(m=>m.required);
    if(required.length) checks.push({
      label:'Required milestones ('+required.filter(m=>m.completed).length+'/'+required.length+')',
      met: required.every(m=>m.completed)
    });
    if(u.minReadiness != null && u.minReadiness !== ''){
      const r = stageReadiness(stageId);
      checks.push({ label:'Readiness ≥ '+u.minReadiness+'%', met: r.percent >= num(u.minReadiness, 0) });
    }
    if(u.minSavings != null && u.minSavings !== ''){
      checks.push({ label:'Savings target $'+u.minSavings+' confirmed', met: !!u.minSavingsMet });
    }
    if(u.credential){
      checks.push({ label:'Credential: '+u.credential, met: !!u.credentialMet });
    }
    if(u.notBefore){
      checks.push({ label:'Not before '+u.notBefore, met: new Date().toISOString().slice(0,10) >= u.notBefore });
    }
    if(u.manualApproval){
      checks.push({ label:'Manual approval', met: !!u.approvedAt });
    }
    return { unlocked: checks.every(c=>c.met), checks };
  }

  root.TrajectoryStore = {
    init, load, reload, save,
    get data(){ return data; },
    STAGE_STATUSES, MILESTONE_TYPES, ASSET_TYPES, ASSET_STATUSES, READINESS_CATEGORIES,
    getNorthStar, updateNorthStar,
    getStages, getStage, createStage, updateStage, deleteStage,
    archiveStage, releaseStage, completeStage, moveStage, currentStage, nextStage,
    getMilestones, getMilestone, createMilestone, updateMilestone, deleteMilestone,
    toggleMilestone, moveMilestone, milestoneProgress,
    getAssets, getAsset, createAsset, updateAsset, deleteAsset, archiveAsset, moveAsset,
    linkHabit, unlinkHabit, stagesForHabit, noteHabitActivity,
    setReadiness, stageAchievement, stageReadiness, stageUnlockState
  };

  /* ── self-tests (run from test-trajectory-rewards.html) ────── */
  root.runTrajectoryStoreTests = async function(){
    const results = [];
    function assert(name, cond, detail){
      results.push({ name, pass: !!cond, detail: detail || '' });
      if(!cond) throw new Error(name+(detail ? ': '+detail : ''));
    }
    const saved = { data, loaded };
    try{
      data = blankData();
      loaded = false;   // block persistence during tests

      // seeding is idempotent
      assert('trajectoryV1 seeds once', runTrajectoryV1() && !runTrajectoryV1());
      assert('five stages seeded', getStages().length === 5, 'got '+getStages().length);
      assert('no duplicate seed on re-normalize', (data = normalize(data), runTrajectoryV1() === false && getStages().length === 5));
      const bcba = getStage('stage-bcba-independence');
      assert('BCBA stage milestones seeded in order', getMilestones(bcba.id).length === 9 &&
        getMilestones(bcba.id)[0].title === 'Complete Temple ABA program');
      assert('GT3 stage gates seeded', getStage('stage-executive-gt3rs').gates.length === 9);
      assert('RBT stage is Active', currentStage().id === 'stage-rbt-foundation');
      assert('next stage follows order', nextStage().id === 'stage-bcba-independence');

      // milestone progress
      const m = createMilestone({ stageId: bcba.id, title:'Emergency fund', type:'financial', targetValue:15000, currentValue:6000, unit:'$' });
      assert('numeric milestone progress', milestoneProgress(m) === 40);
      toggleMilestone(m.id);
      assert('completed milestone is 100%', milestoneProgress(getMilestone(m.id)) === 100);
      moveMilestone(m.id, -1);
      assert('milestones reorder', getMilestones(bcba.id).findIndex(x=>x.id===m.id) === 8);
      deleteMilestone(m.id);
      assert('milestone delete', !getMilestone(m.id));

      // achievement vs readiness stay separate
      const ach0 = stageAchievement(bcba.id);
      assert('achievement counts milestones', ach0.total === 9 && ach0.done === 0);
      setReadiness(bcba.id, 'financial', { score: 70, note:'Savings on plan' });
      const r = stageReadiness(bcba.id);
      assert('readiness averages categories', r.percent === 10 && r.categories.financial.score === 70);

      // unlock rules
      const un0 = stageUnlockState(bcba.id);
      assert('stage locked while dependency open', !un0.unlocked);
      updateStage('stage-rbt-foundation', { status:'Completed' });
      getMilestones(bcba.id).forEach(x=>updateMilestone(x.id, { completed:true }));
      assert('stage unlocks when checks pass', stageUnlockState(bcba.id).unlocked);

      // habit links reference IDs only, no duplication
      linkHabit(bcba.id, 'habit-123'); linkHabit(bcba.id, 'habit-123');
      assert('habit linked once', getStage(bcba.id).habitIds.filter(h=>h==='habit-123').length === 1);
      assert('stagesForHabit finds link', stagesForHabit('habit-123')[0].id === bcba.id);
      unlinkHabit(bcba.id, 'habit-123');
      assert('habit unlink', getStage(bcba.id).habitIds.length === 0);

      // assets
      const a = createAsset({ stageId:'stage-supra', title:'MK5 Supra', type:'Car', estimatedCost:58000, status:'Saving' });
      assert('asset created', getAssets('stage-supra').length === 1 && a.estimatedCost === 58000);
      archiveAsset(a.id);
      assert('asset archived hides by default', getAssets('stage-supra').length === 0 &&
        getAssets('stage-supra',{includeArchived:true}).length === 1);

      // stage lifecycle
      const s = createStage({ title:'Test stage' });
      moveStage(s.id, -1);
      assert('stages reorder', getStages().findIndex(x=>x.id===s.id) === 4);
      releaseStage(s.id);
      assert('stage released', getStage(s.id).status === 'Released');
      deleteStage(s.id);
      assert('stage delete cleans references', !getStage(s.id));

      results.push({ name:'ALL TRAJECTORY STORE TESTS', pass:true, detail: results.length+' checks' });
      return { pass:true, fail:0, results };
    }catch(e){
      results.push({ name:'FAILED', pass:false, detail:e.message });
      return { pass:false, fail:1, results, error:e.message };
    }finally{
      data = saved.data; loaded = saved.loaded;
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
