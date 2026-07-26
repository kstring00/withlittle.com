/**
 * Trajectory UI — cinematic north star, stage roadmap, and stage workspaces.
 *
 * Renders into #trajectoryPanel inside the app shell, plus a compact preview
 * card on the dashboard. All data operations go through TrajectoryStore
 * (fs-trajectory); habit systems reference existing fs-stewardship habits by
 * ID only.
 */
(function(root){
  'use strict';

  const T = ()=> root.TrajectoryStore;
  const S = ()=> root.StewStore;

  let openStageId = null;
  let lastFocus = null;

  function esc(v=''){ return String(v).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function nl2br(v=''){ return esc(v).replace(/\n/g,'<br>'); }
  function money(v){ return '$'+Number(v).toLocaleString(undefined,{maximumFractionDigits:0}); }
  const STATUS_CLASS = {
    Dream:'dream', Exploring:'exploring', Building:'building', Ready:'ready',
    Active:'active', Completed:'completed', Stewarding:'stewarding', Released:'released'
  };

  /* ── modal helper ──────────────────────────────────────────── */
  function escCloseModal(e){ if(e.key==='Escape') closeModal(); }
  function closeModal(){
    document.getElementById('tjModalOverlay')?.remove();
    document.removeEventListener('keydown', escCloseModal);
    if(lastFocus?.focus){ try{ lastFocus.focus(); }catch(e){} lastFocus = null; }
  }
  function openModal(title, bodyHtml, onSubmit){
    lastFocus = document.activeElement;
    closeModal();
    const wrap = document.createElement('div');
    wrap.id = 'tjModalOverlay';
    wrap.className = 'rg-modal-overlay';
    wrap.innerHTML = '<div class="rg-modal" role="dialog" aria-modal="true" aria-labelledby="tjModalTitle">'+
      '<div class="rg-modal-head"><h3 id="tjModalTitle" class="serif">'+esc(title)+'</h3>'+
      '<button type="button" class="rg-close" data-tj-modal="cancel" aria-label="Close">×</button></div>'+
      '<form id="tjModalForm" novalidate>'+
        '<div id="tjModalErrors" class="rg-errors" role="alert" hidden></div>'+
        bodyHtml+
      '</form></div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e=>{
      if(e.target===wrap){ closeModal(); return; }
      if(e.target.closest('[data-tj-modal="cancel"]')) closeModal();
    });
    document.addEventListener('keydown', escCloseModal);
    wrap.querySelector('input,textarea,select')?.focus();
    wrap.querySelector('#tjModalForm').addEventListener('submit', e=>{
      e.preventDefault();
      onSubmit(new FormData(e.target), wrap);
    });
    return wrap;
  }
  function modalErrors(errors){
    const box = document.getElementById('tjModalErrors');
    if(!box) return;
    box.hidden = !errors.length;
    box.innerHTML = errors.map(x=>'<p>'+esc(x)+'</p>').join('');
  }
  function modalActions(extra){
    return '<div class="rg-modal-actions"><button type="submit" class="btn-gold">Save</button>'+
      '<button type="button" data-tj-modal="cancel">Cancel</button>'+(extra||'')+'</div>';
  }
  function imageFields(url, alt){
    return '<label>Image URL (optional)<input name="imageUrl" type="url" value="'+esc(url||'')+'" placeholder="https://…"></label>'+
      '<label>Or upload image<input name="imageFile" type="file" accept="image/*"></label>'+
      '<label>Image description (alt text)<input name="imageAlt" type="text" value="'+esc(alt||'')+'" placeholder="Describe the image"></label>';
  }
  function wireImageUpload(wrap){
    const fileInput = wrap.querySelector('input[name="imageFile"]');
    fileInput?.addEventListener('change', ()=>{
      const f = fileInput.files?.[0];
      if(!f) return;
      if(f.size > 400*1024){ modalErrors(['Image must be under 400 KB — larger images should use an image URL instead.']); fileInput.value=''; return; }
      const reader = new FileReader();
      reader.onload = ()=>{ wrap.querySelector('input[name="imageUrl"]').value = reader.result; };
      reader.readAsDataURL(f);
    });
  }

  /* ── hero ──────────────────────────────────────────────────── */
  function renderHero(){
    const ns = T().getNorthStar();
    const cur = T().currentStage();
    const next = T().nextStage();
    const ach = cur ? T().stageAchievement(cur.id) : { percent:null };
    const ready = cur ? T().stageReadiness(cur.id) : { percent:0 };
    const bg = ns.imageUrl ? 'style="background-image:url(\''+esc(ns.imageUrl)+'\')"' : '';
    return '<header class="tj-hero'+(ns.imageUrl?' has-image':'')+'" '+bg+'>'+
      '<div class="tj-hero-scrim"></div>'+
      '<div class="tj-hero-inner">'+
        '<p class="tj-kicker">NORTH STAR</p>'+
        '<h2 class="tj-north-star serif">'+nl2br(ns.statement)+'</h2>'+
        '<div class="tj-hero-meta">'+
          (cur?'<span class="tj-hero-chip"><small>Current stage</small><b>'+esc(cur.title)+'</b></span>':'')+
          (next?'<span class="tj-hero-chip"><small>Next stage</small><b>'+esc(next.title)+'</b></span>':'')+
          (cur?'<span class="tj-hero-chip"><small>Achievement</small><b>'+(ach.percent==null?'—':ach.percent+'%')+'</b></span>'+
               '<span class="tj-hero-chip"><small>Readiness</small><b>'+ready.percent+'%</b></span>':'')+
        '</div>'+
        '<button type="button" class="tj-hero-edit" data-tj="edit-north-star">Edit north star</button>'+
      '</div>'+
    '</header>';
  }
  function openNorthStarEditor(){
    const ns = T().getNorthStar();
    const wrap = openModal('North star',
      '<div class="rg-form-grid">'+
      '<label class="rg-span2">Statement<textarea name="statement" rows="3" required>'+esc(ns.statement)+'</textarea></label>'+
      imageFields(ns.imageUrl, ns.imageAlt)+
      '</div>'+modalActions(),
      (fd)=>{
        const statement = String(fd.get('statement')||'').trim();
        if(!statement){ modalErrors(['The north star statement is required.']); return; }
        T().updateNorthStar({ statement, imageUrl: String(fd.get('imageUrl')||'').trim()||null, imageAlt: fd.get('imageAlt')||'' });
        closeModal(); renderTrajectory();
      });
    wireImageUpload(wrap);
  }

  /* ── roadmap ───────────────────────────────────────────────── */
  function renderRoadmap(){
    const stages = T().getStages();
    const cards = stages.map((s, i)=>{
      const ach = T().stageAchievement(s.id);
      const ready = T().stageReadiness(s.id);
      const ms = T().getMilestones(s.id);
      const done = ms.filter(m=>m.completed).length;
      const media = s.imageUrl
        ? '<div class="tj-stage-media"><img src="'+esc(s.imageUrl)+'" alt="'+esc(s.imageAlt||s.title)+'" loading="lazy"></div>'
        : '';
      return '<article class="tj-stage-card status-'+(STATUS_CLASS[s.status]||'dream')+'">'+
        media+
        '<div class="tj-stage-body">'+
          '<div class="tj-stage-top"><span class="tj-stage-num">'+String(i+1).padStart(2,'0')+'</span>'+
            '<span class="tj-status">'+esc(s.status)+'</span></div>'+
          '<h3>'+esc(s.title)+'</h3>'+
          '<p class="tj-stage-sub">'+esc(s.subtitle)+'</p>'+
          (s.primaryAspiration?'<p class="tj-aspiration">'+nl2br(s.primaryAspiration)+'</p>':'')+
          '<div class="tj-bars">'+
            '<div class="tj-bar"><small>Achievement '+(ach.percent==null?'—':ach.percent+'%')+'</small><div class="tj-bar-track" role="progressbar" aria-label="Achievement" aria-valuenow="'+(ach.percent||0)+'" aria-valuemin="0" aria-valuemax="100"><span style="width:'+(ach.percent||0)+'%"></span></div></div>'+
            '<div class="tj-bar"><small>Readiness '+ready.percent+'%</small><div class="tj-bar-track tj-bar-ready" role="progressbar" aria-label="Readiness" aria-valuenow="'+ready.percent+'" aria-valuemin="0" aria-valuemax="100"><span style="width:'+ready.percent+'%"></span></div></div>'+
          '</div>'+
          (ms.length?'<p class="tj-ms-count">'+done+' of '+ms.length+' milestones complete</p>':'')+
          '<div class="tj-stage-actions">'+
            '<button type="button" class="btn-gold" data-tj="open-stage" data-id="'+esc(s.id)+'">Open stage</button>'+
            '<span class="rg-order"><button type="button" data-tj="move-stage" data-id="'+esc(s.id)+'" data-dir="-1" aria-label="Move '+esc(s.title)+' earlier">↑</button>'+
            '<button type="button" data-tj="move-stage" data-id="'+esc(s.id)+'" data-dir="1" aria-label="Move '+esc(s.title)+' later">↓</button></span>'+
          '</div>'+
        '</div>'+
      '</article>';
    }).join('<div class="tj-connector" aria-hidden="true"></div>');
    return '<section class="tj-roadmap" aria-label="Stage roadmap">'+cards+
      '<div class="tj-add-wrap"><button type="button" class="tj-add-stage" data-tj="add-stage">+ Add stage</button></div>'+
    '</section>';
  }

  /* ── stage editor modal ────────────────────────────────────── */
  function openStageEditor(stageId){
    const s = stageId ? T().getStage(stageId) : null;
    const statuses = T().STAGE_STATUSES;
    const wrap = openModal(s?'Edit stage':'Add stage',
      '<div class="rg-form-grid">'+
      '<label>Title<input name="title" type="text" required value="'+esc(s?.title||'')+'"></label>'+
      '<label>Status<select name="status">'+statuses.map(x=>'<option'+(s?.status===x?' selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
      '<label class="rg-span2">Subtitle<textarea name="subtitle" rows="2">'+esc(s?.subtitle||'')+'</textarea></label>'+
      '<label class="rg-span2">Primary aspiration<textarea name="primaryAspiration" rows="2">'+esc(s?.primaryAspiration||'')+'</textarea></label>'+
      imageFields(s?.imageUrl, s?.imageAlt)+
      '</div>'+modalActions(),
      (fd)=>{
        const title = String(fd.get('title')||'').trim();
        if(!title){ modalErrors(['A stage title is required.']); return; }
        const patch = {
          title, status: fd.get('status'),
          subtitle: fd.get('subtitle')||'', primaryAspiration: fd.get('primaryAspiration')||'',
          imageUrl: String(fd.get('imageUrl')||'').trim()||null, imageAlt: fd.get('imageAlt')||''
        };
        if(s) T().updateStage(s.id, patch); else openStageId = T().createStage(patch).id;
        closeModal(); renderTrajectory();
      });
    wireImageUpload(wrap);
  }

  /* ── milestone editor modal ────────────────────────────────── */
  function openMilestoneEditor(stageId, milestoneId){
    const m = milestoneId ? T().getMilestone(milestoneId) : null;
    openModal(m?'Edit milestone':'Add milestone',
      '<div class="rg-form-grid">'+
      '<label class="rg-span2">Title<input name="title" type="text" required value="'+esc(m?.title||'')+'"></label>'+
      '<label>Type<select name="type">'+T().MILESTONE_TYPES.map(x=>'<option'+(m?.type===x?' selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
      '<label>Due date<input name="dueDate" type="date" value="'+esc(m?.dueDate||'')+'"></label>'+
      '<label>Target value<input name="targetValue" type="number" step="any" value="'+(m?.targetValue??'')+'"></label>'+
      '<label>Current value<input name="currentValue" type="number" step="any" value="'+(m?.currentValue??'')+'"></label>'+
      '<label>Unit<input name="unit" type="text" value="'+esc(m?.unit||'')+'" placeholder="$, hours, %…"></label>'+
      '<label class="rg-check"><input name="required" type="checkbox"'+(m?(m.required?' checked':''):' checked')+'> Required for stage unlock</label>'+
      '<label class="rg-span2">Notes<textarea name="notes" rows="2">'+esc(m?.notes||'')+'</textarea></label>'+
      '<label class="rg-span2">Description<textarea name="description" rows="2">'+esc(m?.description||'')+'</textarea></label>'+
      '</div>'+modalActions(),
      (fd)=>{
        const title = String(fd.get('title')||'').trim();
        if(!title){ modalErrors(['A milestone title is required.']); return; }
        const patch = {
          stageId, title, type: fd.get('type'), dueDate: fd.get('dueDate')||null,
          targetValue: fd.get('targetValue')===''?null:Number(fd.get('targetValue')),
          currentValue: fd.get('currentValue')===''?null:Number(fd.get('currentValue')),
          unit: String(fd.get('unit')||'').trim()||null,
          required: fd.get('required')==='on',
          notes: fd.get('notes')||'', description: fd.get('description')||''
        };
        if(m) T().updateMilestone(m.id, patch); else T().createMilestone(patch);
        closeModal(); renderTrajectory();
      });
  }

  /* ── asset editor modal ────────────────────────────────────── */
  function openAssetEditor(stageId, assetId){
    const a = assetId ? T().getAsset(assetId) : null;
    const wrap = openModal(a?'Edit aspiration':'Add aspiration',
      '<div class="rg-form-grid">'+
      '<label>Title<input name="title" type="text" required value="'+esc(a?.title||'')+'"></label>'+
      '<label>Type<select name="type">'+T().ASSET_TYPES.map(x=>'<option'+(a?.type===x?' selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
      '<label>Status<select name="status">'+T().ASSET_STATUSES.map(x=>'<option'+(a?.status===x?' selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
      '<label>Estimated cost<input name="estimatedCost" type="number" min="0" step="any" value="'+(a?.estimatedCost??'')+'"></label>'+
      '<label>Target date<input name="targetDate" type="date" value="'+esc(a?.targetDate||'')+'"></label>'+
      imageFields(a?.imageUrl, a?.imageAlt)+
      '<label class="rg-span2">Description<textarea name="description" rows="2">'+esc(a?.description||'')+'</textarea></label>'+
      '<label class="rg-span2">Notes<textarea name="notes" rows="2">'+esc(a?.notes||'')+'</textarea></label>'+
      '</div>'+modalActions(),
      (fd)=>{
        const title = String(fd.get('title')||'').trim();
        if(!title){ modalErrors(['A title is required.']); return; }
        const patch = {
          stageId, title, type: fd.get('type'), status: fd.get('status'),
          estimatedCost: fd.get('estimatedCost')===''?null:Number(fd.get('estimatedCost')),
          targetDate: fd.get('targetDate')||null,
          imageUrl: String(fd.get('imageUrl')||'').trim()||null, imageAlt: fd.get('imageAlt')||'',
          description: fd.get('description')||'', notes: fd.get('notes')||''
        };
        if(a) T().updateAsset(a.id, patch); else T().createAsset(patch);
        closeModal(); renderTrajectory();
      });
    wireImageUpload(wrap);
  }

  /* ── stage workspace ───────────────────────────────────────── */
  function fieldBlock(stageId, label, field, value, placeholder){
    return '<label class="tj-field">'+esc(label)+
      '<textarea rows="2" data-tj-field="'+field+'" data-stage="'+esc(stageId)+'" placeholder="'+esc(placeholder||'')+'">'+esc(value||'')+'</textarea></label>';
  }
  function renderIdentity(s){
    return '<section class="tj-section settings-card"><h3 class="serif">Identity</h3>'+
      fieldBlock(s.id,'Identity statement','identityStatement',s.identityStatement,'Who this stage says you are…')+
      fieldBlock(s.id,'Who I am becoming','becoming',s.becoming,'…')+
      fieldBlock(s.id,'Character qualities','characterQualities',s.characterQualities,'…')+
      fieldBlock(s.id,'Leadership posture','leadershipPosture',s.leadershipPosture,'…')+
      fieldBlock(s.id,'Spiritual alignment','spiritualAlignment',s.spiritualAlignment,'…')+
    '</section>';
  }
  function renderWhy(s){
    return '<section class="tj-section settings-card"><h3 class="serif">Why — the “so that” chain</h3>'+
      '<label class="tj-field">Each line continues the chain'+
      '<textarea rows="5" data-tj-field="whyChain" data-stage="'+esc(s.id)+'" placeholder="I want greater competence\nso that I can carry greater responsibility\nso that…">'+esc(s.whyChain||'')+'</textarea></label>'+
    '</section>';
  }
  function renderFocusAreas(s){
    if(!s.focusAreas.length && !s.gates.length) return '';
    let html = '';
    if(s.focusAreas.length){
      html += '<section class="tj-section settings-card"><h3 class="serif">Focus areas</h3><ul class="tj-focus">'+
        s.focusAreas.map((f,i)=>'<li>'+esc(f)+' <button type="button" class="tj-x" data-tj="remove-focus" data-id="'+esc(s.id)+'" data-idx="'+i+'" aria-label="Remove '+esc(f)+'">×</button></li>').join('')+
        '</ul><div class="tj-inline-add"><input type="text" id="tjNewFocus" placeholder="Add focus area…" aria-label="New focus area"><button type="button" data-tj="add-focus" data-id="'+esc(s.id)+'">Add</button></div></section>';
    }
    return html;
  }
  function renderGates(s){
    const un = T().stageUnlockState(s.id);
    return '<section class="tj-section settings-card"><h3 class="serif">Gates &amp; unlock</h3>'+
      (s.gates.length?'<ul class="tj-gates">'+s.gates.map(g=>
        '<li><label class="tj-gate'+(g.met?' met':'')+'"><input type="checkbox" data-tj="toggle-gate" data-id="'+esc(s.id)+'" data-gate="'+esc(g.id)+'"'+(g.met?' checked':'')+'> <span>'+esc(g.text)+'</span></label>'+
        '<button type="button" class="tj-x" data-tj="remove-gate" data-id="'+esc(s.id)+'" data-gate="'+esc(g.id)+'" aria-label="Remove gate">×</button></li>').join('')+'</ul>':'')+
      '<div class="tj-inline-add"><input type="text" id="tjNewGate" placeholder="Add gate…" aria-label="New gate"><button type="button" data-tj="add-gate" data-id="'+esc(s.id)+'">Add</button></div>'+
      '<div class="tj-unlock-checks"><h4>Unlock conditions</h4>'+
        (un.checks.length? un.checks.map(c=>'<p class="tj-check-row '+(c.met?'met':'unmet')+'"><span aria-hidden="true">'+(c.met?'✓':'○')+'</span> '+esc(c.label)+' <em>'+(c.met?'met':'not yet')+'</em></p>').join('')
          : '<p class="rg-empty">No unlock conditions — this stage opens whenever you choose.</p>')+
        '<p class="tj-check-row '+(un.unlocked?'met':'unmet')+'"><b>'+(un.unlocked?'This stage is unlocked.':'This stage is still locked.')+'</b></p>'+
      '</div>'+
      renderUnlockRules(s)+
    '</section>';
  }
  function renderUnlockRules(s){
    const u = s.unlockRules;
    const others = T().getStages().filter(x=>x.id!==s.id);
    return '<details class="tj-rules"><summary>Edit unlock rules</summary><div class="rg-form-grid">'+
      '<label>Depends on stage<select data-tj-rule="dependsOnStageId" data-stage="'+esc(s.id)+'"><option value="">None</option>'+
        others.map(x=>'<option value="'+esc(x.id)+'"'+(u.dependsOnStageId===x.id?' selected':'')+'>'+esc(x.title)+'</option>').join('')+'</select></label>'+
      '<label>Minimum readiness %<input type="number" min="0" max="100" data-tj-rule="minReadiness" data-stage="'+esc(s.id)+'" value="'+(u.minReadiness??'')+'"></label>'+
      '<label>Minimum savings $<input type="number" min="0" data-tj-rule="minSavings" data-stage="'+esc(s.id)+'" value="'+(u.minSavings??'')+'"></label>'+
      '<label class="rg-check"><input type="checkbox" data-tj-rule="minSavingsMet" data-stage="'+esc(s.id)+'"'+(u.minSavingsMet?' checked':'')+'> Savings target confirmed</label>'+
      '<label>Credential<input type="text" data-tj-rule="credential" data-stage="'+esc(s.id)+'" value="'+esc(u.credential||'')+'" placeholder="e.g. BCBA"></label>'+
      '<label class="rg-check"><input type="checkbox" data-tj-rule="credentialMet" data-stage="'+esc(s.id)+'"'+(u.credentialMet?' checked':'')+'> Credential held</label>'+
      '<label>Not before<input type="date" data-tj-rule="notBefore" data-stage="'+esc(s.id)+'" value="'+esc(u.notBefore||'')+'"></label>'+
      '<label class="rg-check"><input type="checkbox" data-tj-rule="manualApproval" data-stage="'+esc(s.id)+'"'+(u.manualApproval?' checked':'')+'> Requires manual approval</label>'+
      (u.manualApproval?'<label class="rg-check"><input type="checkbox" data-tj-rule="approved" data-stage="'+esc(s.id)+'"'+(u.approvedAt?' checked':'')+'> Approved</label>':'')+
    '</div></details>';
  }
  function renderMilestones(s){
    const ms = T().getMilestones(s.id);
    const rows = ms.map(m=>{
      const pct = T().milestoneProgress(m);
      const numeric = m.targetValue != null;
      return '<li class="tj-ms'+(m.completed?' done':'')+'">'+
        '<label class="tj-ms-main"><input type="checkbox" data-tj="toggle-ms" data-id="'+esc(m.id)+'"'+(m.completed?' checked':'')+' aria-label="Mark '+esc(m.title)+' complete"> '+
          '<span class="tj-ms-title">'+esc(m.title)+'</span></label>'+
        '<span class="tj-ms-meta"><span class="tj-ms-type">'+esc(m.type)+'</span>'+
          (m.required?'<span class="tj-ms-req">required</span>':'<span class="tj-ms-opt">optional</span>')+
          (m.dueDate?'<span>due '+esc(m.dueDate)+'</span>':'')+'</span>'+
        (numeric?'<span class="tj-ms-progress"><input type="number" step="any" data-tj="ms-current" data-id="'+esc(m.id)+'" value="'+(m.currentValue??'')+'" aria-label="Current value for '+esc(m.title)+'"> / '+m.targetValue+' '+esc(m.unit||'')+' — '+pct+'%</span>':'')+
        '<span class="tj-ms-actions"><button type="button" data-tj="move-ms" data-id="'+esc(m.id)+'" data-dir="-1" aria-label="Move up">↑</button>'+
        '<button type="button" data-tj="move-ms" data-id="'+esc(m.id)+'" data-dir="1" aria-label="Move down">↓</button>'+
        '<button type="button" data-tj="edit-ms" data-id="'+esc(m.id)+'">Edit</button>'+
        '<button type="button" class="tj-x" data-tj="del-ms" data-id="'+esc(m.id)+'" aria-label="Delete '+esc(m.title)+'">×</button></span>'+
      '</li>';
    }).join('');
    return '<section class="tj-section settings-card"><h3 class="serif">Milestones</h3>'+
      (rows?'<ul class="tj-ms-list">'+rows+'</ul>':'<p class="rg-empty">No milestones yet.</p>')+
      '<button type="button" class="btn-gold" data-tj="add-ms" data-id="'+esc(s.id)+'">+ Add milestone</button>'+
    '</section>';
  }
  function renderSystems(s){
    const habits = S()?.getHabits?.() || [];
    const linked = habits.filter(h=>s.habitIds.includes(String(h.id)));
    const unlinked = habits.filter(h=>!s.habitIds.includes(String(h.id)));
    const act = T().data.activity || {};
    const rows = linked.map(h=>{
      const a = act[String(h.id)];
      return '<li class="tj-sys">'+
        '<span class="tj-sys-name">'+esc(h.icon||'○')+' '+esc(h.title)+(a?.lastDate?' <small>last rep '+esc(a.lastDate)+'</small>':'')+'</span>'+
        '<span class="tj-sys-credits">'+
          '<label>Full <input type="number" min="0" data-tj="habit-credit" data-id="'+esc(h.id)+'" data-tier="fullRepCredits" value="'+(h.fullRepCredits??'')+'" placeholder="10"></label>'+
          '<label>Min <input type="number" min="0" data-tj="habit-credit" data-id="'+esc(h.id)+'" data-tier="minimumRepCredits" value="'+(h.minimumRepCredits??'')+'" placeholder="4"></label>'+
          '<label>Rec <input type="number" min="0" data-tj="habit-credit" data-id="'+esc(h.id)+'" data-tier="recoveryRepCredits" value="'+(h.recoveryRepCredits??'')+'" placeholder="1"></label>'+
        '</span>'+
        '<button type="button" class="tj-x" data-tj="unlink-habit" data-id="'+esc(s.id)+'" data-habit="'+esc(h.id)+'" aria-label="Unlink '+esc(h.title)+'">×</button>'+
      '</li>';
    }).join('');
    return '<section class="tj-section settings-card"><h3 class="serif">Systems</h3>'+
      '<p class="tj-note">Existing habits linked to this stage — daily reps here compound toward it. Credit overrides are per habit; blank uses the defaults (10 / 4 / 1).</p>'+
      (rows?'<ul class="tj-sys-list">'+rows+'</ul>':'<p class="rg-empty">No habits linked yet.</p>')+
      (unlinked.length?'<div class="tj-inline-add"><select id="tjLinkHabit" aria-label="Link a habit">'+
        unlinked.map(h=>'<option value="'+esc(h.id)+'">'+esc(h.title)+'</option>').join('')+
        '</select><button type="button" data-tj="link-habit" data-id="'+esc(s.id)+'">Link habit</button></div>'
        :(habits.length?'':'<p class="tj-note">Create habits in the daily planner first, then link them here.</p>'))+
    '</section>';
  }
  function renderAssets(s){
    const assets = T().getAssets(s.id, { includeArchived:true });
    const cards = assets.map(a=>'<article class="tj-asset'+(a.archived?' rg-archived':'')+'">'+
      (a.imageUrl?'<div class="tj-asset-media"><img src="'+esc(a.imageUrl)+'" alt="'+esc(a.imageAlt||a.title)+'" loading="lazy"></div>':'')+
      '<div class="tj-asset-body"><div class="tj-stage-top"><b>'+esc(a.title)+'</b><span class="tj-status">'+esc(a.status)+'</span></div>'+
      '<p class="tj-asset-meta">'+esc(a.type)+(a.estimatedCost!=null?' · ~'+money(a.estimatedCost):'')+(a.targetDate?' · target '+esc(a.targetDate):'')+'</p>'+
      (a.description?'<p class="rg-desc">'+esc(a.description)+'</p>':'')+
      (a.notes?'<p class="tj-note">'+esc(a.notes)+'</p>':'')+
      '<div class="rg-card-actions">'+
        '<button type="button" data-tj="edit-asset" data-id="'+esc(a.id)+'" data-stage="'+esc(s.id)+'">Edit</button>'+
        '<span class="rg-order"><button type="button" data-tj="move-asset" data-id="'+esc(a.id)+'" data-dir="-1" aria-label="Move up">↑</button>'+
        '<button type="button" data-tj="move-asset" data-id="'+esc(a.id)+'" data-dir="1" aria-label="Move down">↓</button></span>'+
        '<button type="button" data-tj="archive-asset" data-id="'+esc(a.id)+'">'+(a.archived?'Restore':'Archive')+'</button>'+
        '<button type="button" class="tj-x" data-tj="del-asset" data-id="'+esc(a.id)+'" aria-label="Delete '+esc(a.title)+'">×</button>'+
      '</div></div></article>').join('');
    return '<section class="tj-section settings-card"><h3 class="serif">Assets &amp; aspirations</h3>'+
      (cards?'<div class="tj-asset-grid">'+cards+'</div>':'<p class="rg-empty">Nothing here yet — dreams welcome, disciplined ones especially.</p>')+
      '<button type="button" class="btn-gold" data-tj="add-asset" data-id="'+esc(s.id)+'">+ Add aspiration</button>'+
    '</section>';
  }
  function renderReadiness(s){
    const r = T().stageReadiness(s.id);
    const ach = T().stageAchievement(s.id);
    const rows = T().READINESS_CATEGORIES.map(c=>{
      const cat = r.categories[c.id];
      return '<div class="tj-ready-row">'+
        '<label class="tj-ready-label" for="tjReady-'+c.id+'">'+esc(c.label)+' <b>'+cat.score+'</b></label>'+
        '<input type="range" id="tjReady-'+c.id+'" min="0" max="100" step="5" value="'+cat.manual+'" data-tj="readiness-score" data-id="'+esc(s.id)+'" data-cat="'+c.id+'">'+
        '<label class="rg-check tj-ready-auto"><input type="checkbox" data-tj="readiness-auto" data-id="'+esc(s.id)+'" data-cat="'+c.id+'"'+(cat.auto?' checked':'')+'> auto-lift from milestones</label>'+
        '<input type="text" class="tj-ready-note" placeholder="Note…" value="'+esc(cat.note||'')+'" data-tj="readiness-note" data-id="'+esc(s.id)+'" data-cat="'+c.id+'" aria-label="'+esc(c.label)+' note">'+
      '</div>';
    }).join('');
    return '<section class="tj-section settings-card"><h3 class="serif">Readiness</h3>'+
      '<p class="tj-note">Achievement measures what is done; readiness measures who you are becoming. They are kept separate on purpose.</p>'+
      '<div class="tj-bars tj-bars-wide">'+
        '<div class="tj-bar"><small>Achievement progress '+(ach.percent==null?'—':ach.percent+'%')+'</small><div class="tj-bar-track" role="progressbar" aria-valuenow="'+(ach.percent||0)+'" aria-valuemin="0" aria-valuemax="100" aria-label="Achievement progress"><span style="width:'+(ach.percent||0)+'%"></span></div></div>'+
        '<div class="tj-bar"><small>Readiness progress '+r.percent+'%</small><div class="tj-bar-track tj-bar-ready" role="progressbar" aria-valuenow="'+r.percent+'" aria-valuemin="0" aria-valuemax="100" aria-label="Readiness progress"><span style="width:'+r.percent+'%"></span></div></div>'+
      '</div>'+rows+
    '</section>';
  }
  function renderStageWorkspace(s){
    const banner = s.imageUrl
      ? '<div class="tj-ws-banner"><img src="'+esc(s.imageUrl)+'" alt="'+esc(s.imageAlt||s.title)+'"><div class="tj-hero-scrim"></div></div>' : '';
    return '<div class="tj-workspace">'+
      '<button type="button" class="tj-back" data-tj="back">← Roadmap</button>'+
      banner+
      '<div class="tj-ws-head">'+
        '<div><span class="tj-status">'+esc(s.status)+'</span><h2 class="serif">'+esc(s.title)+'</h2>'+
        '<p class="tj-stage-sub">'+esc(s.subtitle)+'</p>'+
        (s.primaryAspiration?'<p class="tj-aspiration">'+nl2br(s.primaryAspiration)+'</p>':'')+'</div>'+
        '<div class="tj-ws-actions">'+
          '<button type="button" data-tj="edit-stage" data-id="'+esc(s.id)+'">Edit stage</button>'+
          '<button type="button" data-tj="complete-stage" data-id="'+esc(s.id)+'">Mark completed</button>'+
          '<button type="button" data-tj="release-stage" data-id="'+esc(s.id)+'">Release</button>'+
          '<button type="button" data-tj="archive-stage" data-id="'+esc(s.id)+'">'+(s.archived?'Unarchive':'Archive')+'</button>'+
          '<button type="button" class="rg-danger" data-tj="del-stage" data-id="'+esc(s.id)+'">Delete</button>'+
        '</div>'+
      '</div>'+
      '<div class="tj-ws-grid">'+
        renderIdentity(s)+renderWhy(s)+renderFocusAreas(s)+
        renderMilestones(s)+renderSystems(s)+renderAssets(s)+
        renderReadiness(s)+renderGates(s)+
      '</div>'+
    '</div>';
  }

  /* ── page render ───────────────────────────────────────────── */
  function renderTrajectory(){
    const main = document.getElementById('trajectoryMain');
    if(!main || !T()) return;
    const stage = openStageId ? T().getStage(openStageId) : null;
    if(openStageId && !stage) openStageId = null;
    main.innerHTML = stage ? renderStageWorkspace(stage) : renderHero()+renderRoadmap();
  }
  root.renderTrajectory = renderTrajectory;

  async function loadTrajectory(){
    try{ await Promise.all([T()?.init?.(), S()?.init?.()]); }
    catch(e){ console.warn('[Trajectory] init failed', e); }
    renderTrajectory();
  }
  root.loadTrajectory = loadTrajectory;

  /* ── dashboard preview ─────────────────────────────────────── */
  async function renderTrajectoryDashPreview(){
    const box = document.getElementById('trajectoryDashPreview');
    if(!box || !T()) return;
    try{ await T().init(); }catch(e){ return; }
    const cur = T().currentStage();
    if(!cur){ box.innerHTML=''; return; }
    const ach = T().stageAchievement(cur.id);
    const nextMs = T().getMilestones(cur.id).find(m=>!m.completed);
    const habits = (S()?.getHabits?.() || []).filter(h=>cur.habitIds.includes(String(h.id)));
    box.innerHTML = '<div class="tj-dash-card">'+
      '<div class="tj-dash-copy"><p class="tj-kicker">TRAJECTORY</p>'+
        '<b>'+esc(cur.title)+'</b>'+
        (nextMs?'<span class="tj-dash-next">Next: '+esc(nextMs.title)+'</span>':'<span class="tj-dash-next">All milestones complete</span>')+
        (habits[0]?'<span class="tj-dash-sys">System: '+esc(habits[0].title)+'</span>':'')+
      '</div>'+
      '<div class="tj-dash-side"><div class="tj-bar"><small>'+(ach.percent==null?'—':ach.percent+'%')+'</small>'+
        '<div class="tj-bar-track" role="progressbar" aria-valuenow="'+(ach.percent||0)+'" aria-valuemin="0" aria-valuemax="100" aria-label="Stage progress"><span style="width:'+(ach.percent||0)+'%"></span></div></div>'+
      '<button type="button" class="btn-gold" data-tj="view-trajectory">View Trajectory</button></div>'+
    '</div>';
  }
  root.renderTrajectoryDashPreview = renderTrajectoryDashPreview;

  /* ── events ────────────────────────────────────────────────── */
  function saveRule(stageId, rule, value){
    const s = T().getStage(stageId); if(!s) return;
    const u = Object.assign({}, s.unlockRules);
    if(rule==='approved'){ u.approvedAt = value ? new Date().toISOString() : null; }
    else if(rule==='minReadiness' || rule==='minSavings'){ u[rule] = value===''?null:Number(value); }
    else if(rule==='minSavingsMet' || rule==='credentialMet' || rule==='manualApproval'){ u[rule] = !!value; }
    else u[rule] = value || null;
    T().updateStage(stageId, { unlockRules: u });
  }
  function bindTrajectoryEvents(){
    const panel = document.getElementById('trajectoryPanel');
    if(!panel || panel.dataset.tjBound) return;
    panel.dataset.tjBound = '1';

    panel.addEventListener('click', e=>{
      const el = e.target.closest('[data-tj]');
      if(!el) return;
      const act = el.dataset.tj, id = el.dataset.id;
      switch(act){
        case 'edit-north-star': openNorthStarEditor(); break;
        case 'open-stage': openStageId = id; renderTrajectory(); break;
        case 'back': openStageId = null; renderTrajectory(); break;
        case 'add-stage': openStageEditor(null); break;
        case 'edit-stage': openStageEditor(id); break;
        case 'move-stage': T().moveStage(id, Number(el.dataset.dir)); renderTrajectory(); break;
        case 'complete-stage': T().completeStage(id); renderTrajectory(); break;
        case 'release-stage':
          if(confirm('Release this stage? Its status becomes “Released” — held with open hands, not deleted.')){ T().releaseStage(id); renderTrajectory(); }
          break;
        case 'archive-stage': {
          const wasArchived = !!T().getStage(id)?.archived;
          T().archiveStage(id, !wasArchived);
          if(!wasArchived) openStageId = null;   // just archived — return to the roadmap
          renderTrajectory(); break;
        }
        case 'del-stage': {
          const s = T().getStage(id);
          if(s && confirm('Delete “'+s.title+'” and its milestones permanently? Assets are kept but unlinked. This cannot be undone.')){
            T().deleteStage(id); openStageId = null; renderTrajectory();
          }
          break;
        }
        case 'add-ms': openMilestoneEditor(id, null); break;
        case 'edit-ms': openMilestoneEditor(T().getMilestone(id)?.stageId, id); break;
        case 'del-ms': {
          const m = T().getMilestone(id);
          if(m && confirm('Delete milestone “'+m.title+'”?')){ T().deleteMilestone(id); renderTrajectory(); }
          break;
        }
        case 'move-ms': T().moveMilestone(id, Number(el.dataset.dir)); renderTrajectory(); break;
        case 'add-asset': openAssetEditor(id, null); break;
        case 'edit-asset': openAssetEditor(el.dataset.stage, id); break;
        case 'move-asset': T().moveAsset(id, Number(el.dataset.dir)); renderTrajectory(); break;
        case 'archive-asset': {
          const a = T().getAsset(id);
          T().archiveAsset(id, !a.archived); renderTrajectory(); break;
        }
        case 'del-asset': {
          const a = T().getAsset(id);
          if(a && confirm('Delete “'+a.title+'”?')){ T().deleteAsset(id); renderTrajectory(); }
          break;
        }
        case 'link-habit': {
          const sel = document.getElementById('tjLinkHabit');
          if(sel?.value){
            T().linkHabit(id, sel.value);
            const h = S()?.getHabit?.(sel.value);
            if(h){
              const ids = new Set(h.trajectoryStageIds||[]); ids.add(String(id));
              S().updateHabit(h.id, { trajectoryStageIds:[...ids] });
            }
            renderTrajectory();
          }
          break;
        }
        case 'unlink-habit': {
          T().unlinkHabit(id, el.dataset.habit);
          const h = S()?.getHabit?.(el.dataset.habit);
          if(h) S().updateHabit(h.id, { trajectoryStageIds:(h.trajectoryStageIds||[]).filter(x=>x!==String(id)) });
          renderTrajectory(); break;
        }
        case 'add-focus': {
          const inp = document.getElementById('tjNewFocus');
          const v = inp?.value.trim();
          if(v){ const s = T().getStage(id); T().updateStage(id, { focusAreas:[...s.focusAreas, v] }); renderTrajectory(); }
          break;
        }
        case 'remove-focus': {
          const s = T().getStage(id);
          const areas = s.focusAreas.slice(); areas.splice(Number(el.dataset.idx),1);
          T().updateStage(id, { focusAreas: areas }); renderTrajectory(); break;
        }
        case 'add-gate': {
          const inp = document.getElementById('tjNewGate');
          const v = inp?.value.trim();
          if(v){ const s = T().getStage(id); T().updateStage(id, { gates:[...s.gates, { text:v, met:false }] }); renderTrajectory(); }
          break;
        }
        case 'remove-gate': {
          const s = T().getStage(id);
          T().updateStage(id, { gates: s.gates.filter(g=>g.id!==el.dataset.gate) }); renderTrajectory(); break;
        }
      }
    });

    panel.addEventListener('change', e=>{
      const el = e.target.closest('[data-tj],[data-tj-field],[data-tj-rule]');
      if(!el) return;
      if(el.dataset.tjField){
        T().updateStage(el.dataset.stage, { [el.dataset.tjField]: el.value });
        return;
      }
      if(el.dataset.tjRule){
        saveRule(el.dataset.stage, el.dataset.tjRule, el.type==='checkbox'?el.checked:el.value);
        renderTrajectory(); return;
      }
      const act = el.dataset.tj, id = el.dataset.id;
      switch(act){
        case 'toggle-ms': T().toggleMilestone(id); renderTrajectory(); break;
        case 'ms-current': T().updateMilestone(id, { currentValue: el.value===''?null:Number(el.value) }); renderTrajectory(); break;
        case 'toggle-gate': {
          const s = T().getStage(id);
          T().updateStage(id, { gates: s.gates.map(g=>g.id===el.dataset.gate?Object.assign({},g,{met:el.checked}):g) });
          renderTrajectory(); break;
        }
        case 'readiness-score': T().setReadiness(id, el.dataset.cat, { score: el.value }); renderTrajectory(); break;
        case 'readiness-auto': T().setReadiness(id, el.dataset.cat, { auto: el.checked }); renderTrajectory(); break;
        case 'readiness-note': T().setReadiness(id, el.dataset.cat, { note: el.value }); break;
        case 'habit-credit': {
          if(S()?.getHabit?.(id)) S().updateHabit(id, { [el.dataset.tier]: el.value===''?null:Math.max(0,Math.round(Number(el.value))) });
          break;
        }
      }
    });

    // dashboard preview lives outside this panel
    document.getElementById('calendarPanel')?.addEventListener('click', e=>{
      if(e.target.closest('[data-tj="view-trajectory"]')) root.setMode?.('trajectory');
    });
  }
  root.bindTrajectoryEvents = bindTrajectoryEvents;

})(typeof window !== 'undefined' ? window : globalThis);
