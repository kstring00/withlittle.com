/**
 * Evening Review — guided closure dashboard for Daily Ledger
 */
(function(root){
  'use strict';

  const SCRIPTURE = {
    text: 'Whatever you do, do it from the heart, as something done for the Lord and not for people.',
    ref: 'Colossians 3:23'
  };
  const RELEASE_CHIPS = ['Shame','Overplanning','Avoidance','Distraction','Fear','Frustration','Unfinished work'];

  function H(){ return root.__dailyHelpers || {}; }

  function ensureEveningReview(){
    if(!dayData) return;
    const base = { release:'', releaseTags:[], carryTomorrow:'', gratitude:'', patterns:'' };
    if(!dayData.eveningReview) dayData.eveningReview = {...base};
    else dayData.eveningReview = {...base, ...dayData.eveningReview, releaseTags: [...(dayData.eveningReview.releaseTags||[])]};
  }

  function renderCheckedRow(label){
    return '<div class="dl-cc-check-row done"><span class="dl-cc-check">✓</span><span>'+esc(label)+'</span></div>';
  }

  function renderEveningSummaryRow(){
    const rows = H().getHabitRows?.() || [];
    const kept = rows.filter(r=> H().habitRowDone?.(r)).length;
    const top = H().getTopMustDos?.() || [];
    const done = top.filter(it=> it.done && !it.released).length;
    const rep = dayData?.growthRep;
    const repTxt = rep?.done ? 'Complete' : (rep?.text?.trim() ? 'In progress' : 'Not started');
    const carry = dayData?.eveningReview?.carryTomorrow?.trim();
    const carryTxt = carry ? 'Ready' : '—';
    return '<div class="dl-stat-row">'+
      '<div class="dl-stat-card"><span class="dl-stat-k">Habits Kept</span><span class="dl-stat-v">'+kept+' of '+rows.length+'</span></div>'+
      '<div class="dl-stat-card"><span class="dl-stat-k">Must-Dos Done</span><span class="dl-stat-v">'+done+' of '+top.length+'</span></div>'+
      '<div class="dl-stat-card"><span class="dl-stat-k">Growth Rep</span><span class="dl-stat-v">'+esc(repTxt)+'</span></div>'+
      '<div class="dl-stat-card"><span class="dl-stat-k">Tomorrow\u2019s Carry</span><span class="dl-stat-v">'+esc(carryTxt)+'</span></div>'+
      '</div>';
  }

  function renderKeptCard(){
    const rows = (H().getHabitRows?.() || []).filter(r=> H().habitRowDone?.(r));
    const top = (H().getTopMustDos?.() || []).filter(it=> it.done && !it.released);
    const list = rows.map(r=> renderCheckedRow(r.title)).join('')+
      top.map(it=> renderCheckedRow(H().mustDoDisplay?.(it) || it.text)).join('');
    return '<section class="gr-card dl-cc-card" id="ev-kept">'+
      '<h3 class="dl-cc-title serif">What did I keep?</h3>'+
      '<div class="dl-cc-check-list">'+(list || '<p class="dl-cc-empty">Grace for the day — note what was faithful below.</p>')+'</div>'+
      '<label class="dl-label">Where did faithfulness show up today?</label>'+
      '<input type="text" class="dl-hairline" data-field="track.handledWell" placeholder="Moments, rhythms, choices\u2026"></section>';
  }

  function renderLearnCard(){
    return '<section class="gr-card dl-cc-card" id="ev-learn">'+
      '<h3 class="dl-cc-title serif">What did I learn?</h3>'+
      '<label class="dl-label">What did today reveal about my patterns?</label>'+
      '<input type="text" class="dl-hairline" data-field="learn.reveal" placeholder="One honest line\u2026">'+
      '<label class="dl-label">What needs grace and adjustment tomorrow?</label>'+
      '<input type="text" class="dl-hairline" data-field="track.neglected" placeholder="Release, replan, ask for help\u2026"></section>';
  }

  function renderReleaseCard(){
    ensureEveningReview();
    const tags = dayData.eveningReview.releaseTags || [];
    const chips = RELEASE_CHIPS.map(l=>
      '<button type="button" class="dd-chip'+(tags.includes(l)?' on':'')+'" data-ev-release-tag="'+esc(l)+'">'+esc(l)+'</button>'
    ).join('');
    return '<section class="gr-card dl-cc-card" id="ev-release">'+
      '<h3 class="dl-cc-title serif">Release</h3>'+
      '<p class="dl-cc-q">What do I need to release instead of carry?</p>'+
      '<input type="text" class="dl-hairline" data-field="eveningReview.release" placeholder="Name it gently\u2026">'+
      '<div class="dd-chip-row">'+chips+'</div></section>';
  }

  function renderCarryCard(){
    return '<section class="gr-card dl-cc-card" id="ev-carry">'+
      '<h3 class="dl-cc-title serif">Carry Into Tomorrow</h3>'+
      '<p class="dl-cc-q">What is one wise adjustment for tomorrow?</p>'+
      '<input type="text" class="dl-hairline" data-field="eveningReview.carryTomorrow" placeholder="Start earlier, lower scope, prepare tonight\u2026"></section>';
  }

  function renderGratitudeCard(){
    return '<section class="gr-card dl-cc-card dl-cc-full" id="ev-gratitude">'+
      '<h3 class="dl-cc-title serif">Gratitude</h3>'+
      '<p class="dl-cc-q">What gift from today can I thank God for?</p>'+
      '<input type="text" class="dl-hairline" data-field="eveningReview.gratitude" placeholder="One gift, one line\u2026"></section>';
  }

  function renderUnfinishedCarry(){
    const items = (H().getNonNegItems?.() || []).filter(it=> !it.done && !it.released && !it.eveningAction);
    if(!items.length) return '';
    const rows = items.map(it=>
      '<div class="dl-review-row" data-dl-review="'+it.id+'">'+
      '<span class="dl-review-item">'+esc(it.text)+'</span>'+
      '<div class="dl-review-actions">'+
      '<button type="button" class="dl-btn" data-dl-carry="'+it.id+'">Carry + plan</button>'+
      '<button type="button" class="dl-btn dl-btn-ghost" data-dl-release="'+it.id+'">Release</button></div>'+
      '<div class="dl-carry-field" hidden data-dl-carry-field="'+it.id+'">'+
      '<input type="text" class="dl-hairline" data-dl-carry-plan="'+it.id+'" placeholder="Plan for tomorrow">'+
      '<button type="button" class="dl-btn dl-btn-primary" data-dl-carry-confirm="'+it.id+'">Confirm</button></div></div>'
    ).join('');
    return '<section class="gr-card dl-cc-card dl-cc-full" id="sec-evening-carry">'+
      '<h3 class="dl-cc-title serif">Unfinished Must-Dos</h3>'+
      '<p class="dl-cc-hint">Carry with a plan, or release with grace.</p>'+rows+'</section>';
  }

  function renderEveningDashboard(){
    ensureEveningReview();
    return '<div class="dl-phase-view" id="dl-phase-evening">'+
      '<header class="dl-phase-hero gr-card">'+
      '<div class="dl-phase-kicker">Evening Review</div>'+
      '<h2 class="dl-phase-hero-title serif">Close the day with grace.</h2>'+
      '<p class="dl-phase-hero-sub">Notice what was kept, what was learned, and what needs to be released.</p></header>'+
      renderEveningSummaryRow()+
      '<div class="dl-grid-2">'+renderKeptCard()+renderLearnCard()+'</div>'+
      '<div class="dl-grid-2">'+renderReleaseCard()+renderCarryCard()+'</div>'+
      renderGratitudeCard()+
      renderUnfinishedCarry()+
      '</div>';
  }

  function refreshEveningUI(){
    const main = document.getElementById('dailyMain');
    if(!main || typeof dailyPhase !== 'string' || dailyPhase !== 'evening') return;
    main.innerHTML = renderEveningDashboard();
    populateFields?.(main, dayData);
    markDirty?.();
  }

  function bindEveningEvents(){
    if(document.body.dataset.eveningBound) return;
    document.body.dataset.eveningBound = '1';
    document.getElementById('app')?.addEventListener('click', e=>{
      if(!isDaily?.() || dailyPhase !== 'evening') return;
      const tag = e.target.closest('[data-ev-release-tag]');
      if(tag){
        ensureEveningReview();
        const l = tag.dataset.evReleaseTag;
        const arr = dayData.eveningReview.releaseTags || [];
        const i = arr.indexOf(l);
        if(i >= 0) arr.splice(i, 1); else arr.push(l);
        dayData.eveningReview.releaseTags = arr;
        markDirty?.();
        if(typeof root.refreshDailyUI === 'function') root.refreshDailyUI();
        else refreshEveningUI();
      }
    });
    document.getElementById('app')?.addEventListener('input', e=>{
      if(!isDaily?.() || dailyPhase !== 'evening') return;
      const f = e.target.dataset?.field;
      if(f?.startsWith('eveningReview.')){
        const key = f.split('.')[1];
        ensureEveningReview();
        dayData.eveningReview[key] = e.target.value;
        markDirty?.();
      }
    });
  }

  root.renderEveningDashboard = renderEveningDashboard;
  root.refreshEveningUI = refreshEveningUI;
  root.ensureEveningReview = ensureEveningReview;
  root.bindEveningEvents = bindEveningEvents;

})(typeof window !== 'undefined' ? window : globalThis);
