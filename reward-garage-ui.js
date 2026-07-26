/**
 * Reward Garage UI — the full management page for Stewardship Credit rewards.
 *
 * Renders into #rewardGarageMain inside the app shell. All data operations go
 * through RewardStore (fs-credits); stage/milestone locks read TrajectoryStore.
 */
(function(root){
  'use strict';

  const R = ()=> root.RewardStore;
  const T = ()=> root.TrajectoryStore;

  let filter = 'all';          // all | unlocked | locked | affordable | one-time | repeatable | archived | cat:<name>
  let lastFocus = null;

  function esc(v=''){ return String(v).replace(/[&<>'"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function money(v){ return '$'+Number(v).toLocaleString(undefined,{maximumFractionDigits:2}); }

  /* ── header ────────────────────────────────────────────────── */
  function renderHeader(){
    const balance = R().getBalance();
    const next = R().nextClosestReward();
    return '<div class="rg-header">'+
      '<div class="rg-head-copy"><h2 class="serif">Reward Garage</h2>'+
      '<p>Credits are earned through faithful reps and spent with permission, never chance. A redemption unlocks spending inside a real budget — it does not create additional money.</p></div>'+
      '<div class="rg-gauges">'+
        '<div class="rg-gauge"><span class="rg-gauge-num">'+balance+'</span><span class="rg-gauge-label">Credit balance</span></div>'+
        '<div class="rg-gauge"><span class="rg-gauge-num">+'+R().earnedToday()+'</span><span class="rg-gauge-label">Earned today</span></div>'+
        '<div class="rg-gauge"><span class="rg-gauge-num">+'+R().earnedThisWeek()+'</span><span class="rg-gauge-label">This week</span></div>'+
        '<div class="rg-gauge rg-gauge-next">'+(next
          ? '<span class="rg-gauge-num">'+Math.max(0,next.creditCost-balance)+'</span><span class="rg-gauge-label">credits to “'+esc(next.name)+'”</span>'
          : '<span class="rg-gauge-num">—</span><span class="rg-gauge-label">Next reward</span>')+'</div>'+
      '</div>'+
      '<button type="button" class="btn-gold rg-add" data-rg="add">+ Add reward</button>'+
    '</div>';
  }

  /* ── filters ───────────────────────────────────────────────── */
  function categories(){
    const set = new Set(R().CATEGORIES);
    R().getRewards({includeArchived:true}).forEach(r=>{ if(r.category) set.add(r.category); });
    return [...set];
  }
  function renderFilters(){
    const chips = [
      ['all','All'],['unlocked','Unlocked'],['locked','Locked'],['affordable','Affordable'],
      ['one-time','One-time'],['repeatable','Repeatable'],['archived','Archived']
    ];
    return '<div class="rg-filters" role="toolbar" aria-label="Reward filters">'+
      chips.map(([id,label])=>'<button type="button" class="rg-chip'+(filter===id?' on':'')+'" data-rg="filter" data-id="'+id+'">'+label+'</button>').join('')+
      '<select class="rg-cat-filter" data-rg="filter-cat" aria-label="Filter by category">'+
        '<option value="">Category…</option>'+
        categories().map(c=>'<option value="cat:'+esc(c)+'"'+(filter==='cat:'+c?' selected':'')+'>'+esc(c)+'</option>').join('')+
      '</select>'+
    '</div>';
  }
  function filteredRewards(){
    const all = R().getRewards({ includeArchived: true });
    return all.filter(r=>{
      if(filter==='archived') return r.archived;
      if(r.archived) return false;
      const blocked = R().redeemBlocker(r);
      switch(filter){
        case 'unlocked': return !blocked || blocked.code==='credits';
        case 'locked': return blocked && ['locked','cooldown','one-time','paused'].includes(blocked.code);
        case 'affordable': return !blocked;
        case 'one-time': return !r.repeatable;
        case 'repeatable': return r.repeatable;
        default: return filter.startsWith('cat:') ? r.category===filter.slice(4) : true;
      }
    });
  }

  /* ── cards ─────────────────────────────────────────────────── */
  function cardMedia(r){
    if(r.imageUrl) return '<div class="rg-card-media"><img src="'+esc(r.imageUrl)+'" alt="'+esc(r.name)+'" loading="lazy" onerror="this.parentNode.classList.add(\'rg-media-fail\')"></div>';
    return '<div class="rg-card-media rg-card-icon" aria-hidden="true">'+esc(r.icon||'🏁')+'</div>';
  }
  function renderCard(r){
    const balance = R().getBalance();
    const blocked = R().redeemBlocker(r);
    const pct = Math.min(100, Math.round(balance / r.creditCost * 100));
    const unlocked = !blocked;
    const cd = R().cooldownRemainingDays(r);
    const state = blocked
      ? '<span class="rg-state rg-state-locked">'+(blocked.code==='credits'?'Saving — '+pct+'%':'Locked')+'</span>'
      : '<span class="rg-state rg-state-open">Unlocked</span>';
    return '<article class="rg-card'+(r.archived?' rg-archived':'')+(unlocked?'':' rg-locked')+'" data-reward-id="'+esc(r.id)+'">'+
      cardMedia(r)+
      '<div class="rg-card-body">'+
        '<div class="rg-card-top"><h3>'+esc(r.name)+'</h3>'+state+'</div>'+
        '<div class="rg-card-meta"><span class="rg-cat">'+esc(r.category)+'</span>'+
          '<span class="rg-cost">'+r.creditCost+' cr</span>'+
          '<span class="rg-flag">'+(r.repeatable?'Repeatable':'One-time')+'</span>'+
          (r.cooldownDays?'<span class="rg-flag">'+(cd>0?'Cooldown: '+cd+'d left':r.cooldownDays+'d cooldown')+'</span>':'')+
        '</div>'+
        (r.description?'<p class="rg-desc">'+esc(r.description)+'</p>':'')+
        (r.moneyCost!=null?'<p class="rg-budget-note">'+money(r.moneyCost)+(r.budgetBucket?' from the '+esc(r.budgetBucket)+' budget':'')+'. This reward permits spending from an existing budget. It does not create additional spending money.</p>':'')+
        (blocked&&blocked.code!=='credits'?'<p class="rg-blocked-note">'+esc(blocked.message)+'</p>':'')+
        '<div class="rg-progress" role="progressbar" aria-valuenow="'+pct+'" aria-valuemin="0" aria-valuemax="100" aria-label="Progress toward '+esc(r.name)+'"><span style="width:'+pct+'%"></span></div>'+
        '<div class="rg-card-actions">'+
          '<button type="button" class="rg-redeem" data-rg="redeem" data-id="'+esc(r.id)+'"'+(blocked?' disabled':'')+'>Redeem</button>'+
          '<button type="button" class="rg-edit" data-rg="edit" data-id="'+esc(r.id)+'">Edit</button>'+
          '<span class="rg-order"><button type="button" data-rg="move" data-id="'+esc(r.id)+'" data-dir="-1" aria-label="Move '+esc(r.name)+' up">↑</button>'+
          '<button type="button" data-rg="move" data-id="'+esc(r.id)+'" data-dir="1" aria-label="Move '+esc(r.name)+' down">↓</button></span>'+
          (r.archived?'<button type="button" class="rg-edit" data-rg="unarchive" data-id="'+esc(r.id)+'">Restore</button>':'')+
        '</div>'+
      '</div>'+
    '</article>';
  }

  /* ── ledger ────────────────────────────────────────────────── */
  function renderLedger(){
    const rows = R().getLedger().slice(0, 30).map(x=>{
      const label = x.reason || x.label || (x.type==='redeem'?'Redemption':'Credits');
      return '<div class="rg-ledger-row"><span class="rg-ledger-date">'+esc(x.date||'')+'</span>'+
        '<span class="rg-ledger-label">'+esc(label)+'</span>'+
        '<b class="'+(x.amount>=0?'rg-pos':'rg-neg')+'">'+(x.amount>=0?'+':'')+x.amount+'</b>'+
        (x.balanceAfter!=null?'<span class="rg-ledger-bal">'+x.balanceAfter+'</span>':'<span class="rg-ledger-bal">—</span>')+
      '</div>';
    }).join('');
    return '<section class="rg-ledger settings-card"><h3 class="serif">Credit ledger</h3>'+
      '<div class="rg-ledger-head"><span>Date</span><span>Entry</span><b>Amount</b><span>Balance</span></div>'+
      (rows||'<p class="rg-empty">Your ledger begins with the first completed rep.</p>')+
      '<p class="rg-budget-note">Earned through Full, Minimum, and Recovery reps — fixed amounts, a daily cap, and no chance mechanics. Prior entries are never rewritten.</p>'+
    '</section>';
  }

  /* ── editor modal ──────────────────────────────────────────── */
  function stageOptions(selected){
    const stages = T()?.getStages?.() || [];
    return '<option value="">No stage lock</option>'+stages.map(s=>'<option value="'+esc(s.id)+'"'+(selected===s.id?' selected':'')+'>'+esc(s.title)+'</option>').join('');
  }
  function milestoneOptions(selected){
    const ms = T()?.getMilestones?.() || [];
    return '<option value="">No milestone lock</option>'+ms.map(m=>{
      const stage = T().getStage(m.stageId);
      return '<option value="'+esc(m.id)+'"'+(selected===m.id?' selected':'')+'>'+esc((stage?stage.title+' — ':'')+m.title)+'</option>';
    }).join('');
  }
  function openEditor(rewardId){
    const r = rewardId ? R().getReward(rewardId) : null;
    lastFocus = document.activeElement;
    closeEditor();
    const wrap = document.createElement('div');
    wrap.id = 'rgEditorOverlay';
    wrap.className = 'rg-modal-overlay';
    wrap.innerHTML = '<div class="rg-modal" role="dialog" aria-modal="true" aria-labelledby="rgEditorTitle">'+
      '<div class="rg-modal-head"><h3 id="rgEditorTitle" class="serif">'+(r?'Edit reward':'Add reward')+'</h3>'+
      '<button type="button" class="rg-close" data-rg="editor-cancel" aria-label="Close">×</button></div>'+
      '<form id="rgEditorForm" novalidate>'+
        '<div id="rgEditorErrors" class="rg-errors" role="alert" hidden></div>'+
        '<div class="rg-form-grid">'+
        '<label>Reward name<input name="name" type="text" required maxlength="80" value="'+esc(r?.name||'')+'"></label>'+
        '<label>Category<input name="category" type="text" list="rgCatList" value="'+esc(r?.category||'')+'" placeholder="Recovery, Vehicle, …">'+
          '<datalist id="rgCatList">'+categories().map(c=>'<option value="'+esc(c)+'">').join('')+'</datalist></label>'+
        '<label class="rg-span2">Description<textarea name="description" rows="2">'+esc(r?.description||'')+'</textarea></label>'+
        '<label>Credit cost<input name="creditCost" type="number" min="1" step="1" required value="'+(r?r.creditCost:25)+'"></label>'+
        '<label>Money cost (optional)<input name="moneyCost" type="number" min="0" step="0.01" value="'+(r&&r.moneyCost!=null?r.moneyCost:'')+'"></label>'+
        '<label>Budget bucket (optional)<input name="budgetBucket" type="text" value="'+esc(r?.budgetBucket||'')+'" placeholder="e.g. Recreation"></label>'+
        '<label>Cooldown days<input name="cooldownDays" type="number" min="0" step="1" value="'+(r?r.cooldownDays:0)+'"></label>'+
        '<label>Image URL (optional)<input name="imageUrl" type="url" value="'+esc(r?.imageUrl||'')+'" placeholder="https://…"></label>'+
        '<label>Or upload image<input name="imageFile" type="file" accept="image/*"></label>'+
        '<label>Fallback icon<input name="icon" type="text" maxlength="4" value="'+esc(r?.icon||'')+'" placeholder="🏁"></label>'+
        '<label>Required stage<select name="requiredStageId">'+stageOptions(r?.requiredStageId)+'</select></label>'+
        '<label>Required milestone<select name="requiredMilestoneId">'+milestoneOptions(r?.requiredMilestoneId)+'</select></label>'+
        '<label class="rg-check"><input name="repeatable" type="checkbox"'+(r?(r.repeatable?' checked':''):' checked')+'> Repeatable</label>'+
        '<label class="rg-check"><input name="active" type="checkbox"'+(r?(r.active?' checked':''):' checked')+'> Active</label>'+
        '</div>'+
        '<p class="rg-budget-note">Money-linked rewards permit spending from an existing real budget. Credits never create additional spending money.</p>'+
        '<div class="rg-modal-actions">'+
          '<button type="submit" class="btn-gold">Save reward</button>'+
          '<button type="button" data-rg="editor-cancel">Cancel</button>'+
          (r?'<span class="rg-modal-spacer"></span>'+
            '<button type="button" class="rg-danger-soft" data-rg="editor-archive" data-id="'+esc(r.id)+'">'+(r.archived?'Unarchive':'Archive')+'</button>'+
            '<button type="button" class="rg-danger" data-rg="editor-delete" data-id="'+esc(r.id)+'">Delete</button>':'')+
        '</div>'+
        (r?'<input type="hidden" name="id" value="'+esc(r.id)+'">':'')+
      '</form></div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e=>{ if(e.target===wrap) closeEditor(); });
    wrap.querySelector('input[name="name"]')?.focus();
    document.addEventListener('keydown', escClose);
    const fileInput = wrap.querySelector('input[name="imageFile"]');
    fileInput?.addEventListener('change', ()=>{
      const f = fileInput.files?.[0];
      if(!f) return;
      if(f.size > 400*1024){ showErrors(['Image must be under 400 KB — larger images should use an image URL instead.']); fileInput.value=''; return; }
      const reader = new FileReader();
      reader.onload = ()=>{ wrap.querySelector('input[name="imageUrl"]').value = reader.result; };
      reader.readAsDataURL(f);
    });
    wrap.querySelector('#rgEditorForm').addEventListener('submit', e=>{
      e.preventDefault();
      saveEditor(new FormData(e.target));
    });
  }
  function escClose(e){ if(e.key==='Escape') closeEditor(); }
  function closeEditor(){
    document.getElementById('rgEditorOverlay')?.remove();
    document.removeEventListener('keydown', escClose);
    if(lastFocus?.focus){ try{ lastFocus.focus(); }catch(e){} lastFocus = null; }
  }
  function showErrors(errors){
    const box = document.getElementById('rgEditorErrors');
    if(!box) return;
    box.hidden = !errors.length;
    box.innerHTML = errors.map(e=>'<p>'+esc(e)+'</p>').join('');
  }
  function saveEditor(fd){
    const patch = {
      name: fd.get('name'),
      category: String(fd.get('category')||'').trim() || 'Lifestyle',
      description: fd.get('description') || '',
      creditCost: Number(fd.get('creditCost')),
      moneyCost: fd.get('moneyCost') === '' ? null : Number(fd.get('moneyCost')),
      budgetBucket: String(fd.get('budgetBucket')||'').trim() || null,
      cooldownDays: Number(fd.get('cooldownDays')||0),
      imageUrl: String(fd.get('imageUrl')||'').trim() || null,
      icon: String(fd.get('icon')||'').trim() || null,
      requiredStageId: fd.get('requiredStageId') || null,
      requiredMilestoneId: fd.get('requiredMilestoneId') || null,
      repeatable: fd.get('repeatable') === 'on',
      active: fd.get('active') === 'on'
    };
    const id = fd.get('id');
    const res = id ? R().updateReward(id, patch) : R().createReward(patch);
    if(!res.ok){ showErrors(res.errors); return; }
    closeEditor();
    renderRewardGarage();
  }

  /* ── page render ───────────────────────────────────────────── */
  function renderRewardGarage(){
    const main = document.getElementById('rewardGarageMain');
    if(!main || !R()) return;
    const cards = filteredRewards().map(renderCard).join('');
    main.innerHTML =
      renderHeader() +
      renderFilters() +
      '<div class="rg-grid">'+(cards||'<p class="rg-empty">No rewards match this filter. Add one with “+ Add reward”.</p>')+'</div>'+
      renderLedger();
  }
  root.renderRewardGarage = renderRewardGarage;

  async function loadRewardGarage(){
    try{ await Promise.all([R()?.init?.(), T()?.init?.(), root.StewStore?.init?.()]); }
    catch(e){ console.warn('[RewardGarage] init failed', e); }
    renderRewardGarage();
  }
  root.loadRewardGarage = loadRewardGarage;

  /* ── events ────────────────────────────────────────────────── */
  function bindRewardGarageEvents(){
    const panel = document.getElementById('rewardsPanel');
    if(!panel || panel.dataset.rgBound) return;
    panel.dataset.rgBound = '1';
    panel.addEventListener('click', e=>{
      const el = e.target.closest('[data-rg]');
      if(!el) return;
      const act = el.dataset.rg, id = el.dataset.id;
      switch(act){
        case 'add': openEditor(null); break;
        case 'edit': openEditor(id); break;
        case 'filter': filter = id; renderRewardGarage(); break;
        case 'move': R().moveReward(id, Number(el.dataset.dir)); renderRewardGarage(); break;
        case 'unarchive': R().archiveReward(id, false); renderRewardGarage(); break;
        case 'redeem': {
          const r = R().getReward(id);
          if(r && confirm('Redeem “'+r.name+'” for '+r.creditCost+' credits?')){
            const res = R().redeem(id);
            if(!res.ok && res.blocked) alert(res.blocked.message);
            renderRewardGarage();
          }
          break;
        }
      }
    });
    panel.addEventListener('change', e=>{
      const sel = e.target.closest('[data-rg="filter-cat"]');
      if(sel){ filter = sel.value || 'all'; renderRewardGarage(); }
    });
    document.addEventListener('click', e=>{
      const el = e.target.closest('#rgEditorOverlay [data-rg]');
      if(!el) return;
      const act = el.dataset.rg, id = el.dataset.id;
      if(act==='editor-cancel') closeEditor();
      else if(act==='editor-archive'){
        const r = R().getReward(id);
        R().archiveReward(id, !r.archived);
        closeEditor(); renderRewardGarage();
      }
      else if(act==='editor-delete'){
        const r = R().getReward(id);
        if(r && confirm('Delete “'+r.name+'” permanently? Its redemption history stays on the ledger. Consider Archive if you may want it back.')){
          R().deleteReward(id);
          closeEditor(); renderRewardGarage();
        }
      }
    });
    root.addEventListener('withlittle:credits-changed', ()=>{
      if(root.isRewards?.() && !document.getElementById('rgEditorOverlay')) renderRewardGarage();
    });
  }
  root.bindRewardGarageEvents = bindRewardGarageEvents;

})(typeof window !== 'undefined' ? window : globalThis);
