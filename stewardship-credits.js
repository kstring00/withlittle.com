(()=>{
  'use strict';
  const DAY=()=>new Date().toISOString().slice(0,10);
  const CREDIT_KEY='fs-credits';
  const STEW_KEYS=['wsrfs-stewardship','fs-stewardship'];
  const defaults={version:1,balance:0,ledger:[],rewards:[
    {id:'coffee',title:'Specialty coffee',cost:25,budgetNote:'Use only from the existing food/reward budget.'},
    {id:'gaming',title:'One guilt-free gaming hour',cost:40,budgetNote:'Time reward; no cash value.'},
    {id:'meal',title:'Restaurant meal',cost:60,budgetNote:'Use only from the existing dining budget.'},
    {id:'fishing-gear',title:'Fishing purchase',cost:80,budgetNote:'Use only from the pre-budgeted recreation amount.'},
    {id:'gym',title:'New gym clothing',cost:120,budgetNote:'Use only from the clothing budget.'},
    {id:'fishing-day',title:'Fishing day',cost:175,budgetNote:'Planned experience; credits create permission, not money.'}
  ],settings:{full:10,minimum:4,recovery:1,dailyCap:60}};
  const parse=v=>{try{return JSON.parse(v)}catch{return null}};
  const findLocalKey=base=>Object.keys(localStorage).find(k=>k===base||k.endsWith(base))||base;
  const load=(base,fallback)=>parse(localStorage.getItem(findLocalKey(base)))||structuredClone(fallback);
  const save=(base,data)=>{
    const key=findLocalKey(base);localStorage.setItem(key,JSON.stringify(data));
    try{window.scheduleCloudPush?.(base,data)}catch(e){console.warn('[Credits] cloud queue unavailable',e)}
    window.dispatchEvent(new CustomEvent('withlittle:data-changed',{detail:{key:base}}));
  };
  const stewardship=()=>{
    for(const key of STEW_KEYS){const data=parse(localStorage.getItem(key));if(data)return {key,data};}
    const dynamic=Object.keys(localStorage).find(k=>k.endsWith('fs-stewardship'));
    return dynamic?{key:dynamic,data:parse(localStorage.getItem(dynamic))||{habits:[]}}:{key:'fs-stewardship',data:{habits:[]}};
  };
  const scheduledToday=h=>{
    const jsDay=new Date().getDay();
    if(h.frequency==='daily')return true;
    if(Array.isArray(h.days))return h.days.includes(jsDay);
    return true;
  };
  const creditState=()=>{const s=load(CREDIT_KEY,defaults);s.rewards??=defaults.rewards;s.settings={...defaults.settings,...(s.settings||{})};s.ledger??=[];s.balance=Number(s.balance||0);return s};
  const earnedToday=s=>s.ledger.filter(x=>x.date===DAY()&&x.type==='earn').reduce((n,x)=>n+x.amount,0);
  const tierAmount=(tier,s)=>({full:s.settings.full,minimum:s.settings.minimum,recovery:s.settings.recovery})[tier]||0;
  const tierLabel=t=>({full:'Full Rep',minimum:'Minimum Rep',recovery:'Recovery Rep'})[t];
  function recordRep(habit,tier){
    const st=stewardship();const h=(st.data.habits||[]).find(x=>String(x.id)===String(habit.id));if(!h)return;
    h.reps??={};if(h.reps[DAY()])return;
    const credits=creditState();const amount=Math.min(tierAmount(tier,credits),Math.max(0,credits.settings.dailyCap-earnedToday(credits)));
    h.reps[DAY()]={tier,completedAt:new Date().toISOString(),credits:amount};
    h.log??={};h.log[DAY()]=true;
    localStorage.setItem(st.key,JSON.stringify(st.data));
    try{window.scheduleCloudPush?.('fs-stewardship',st.data)}catch{}
    if(amount>0){credits.balance+=amount;credits.ledger.unshift({id:crypto.randomUUID(),type:'earn',amount,date:DAY(),at:new Date().toISOString(),label:`${habit.title||habit.name} — ${tierLabel(tier)}`,habitId:habit.id,tier});save(CREDIT_KEY,credits)}
    render();
  }
  function redeem(reward){
    const s=creditState();if(s.balance<reward.cost)return;
    s.balance-=reward.cost;s.ledger.unshift({id:crypto.randomUUID(),type:'redeem',amount:-reward.cost,date:DAY(),at:new Date().toISOString(),label:`Redeemed: ${reward.title}`,rewardId:reward.id});save(CREDIT_KEY,s);render();
  }
  function habitRows(){const st=stewardship();return (st.data.habits||[]).filter(scheduledToday).map(h=>{const rep=h.reps?.[DAY()];return `<div class="wl-habit-rep"><div class="wl-habit-title">${escapeHtml(h.title||h.name||'Habit')}</div><div class="wl-rep-actions">${['full','minimum','recovery'].map(t=>`<button class="wl-rep-btn ${t} ${rep?.tier===t?'done':''}" data-habit="${escapeAttr(h.id)}" data-tier="${t}" ${rep?'disabled':''}>${rep?.tier===t?'✓ ':''}${tierLabel(t)} +${tierAmount(t,creditState())}</button>`).join('')}</div></div>`}).join('')||'<p class="wl-budget-note">No habits are scheduled today.</p>'}
  function rewards(){const s=creditState();return s.rewards.map(r=>`<div class="wl-reward"><div><strong>${escapeHtml(r.title)}</strong><small>${r.cost} credits</small></div><button class="wl-redeem" data-reward="${escapeAttr(r.id)}" ${s.balance<r.cost?'disabled':''}>Redeem</button></div>`).join('')}
  function ledger(){const s=creditState();return s.ledger.slice(0,12).map(x=>`<div class="wl-ledger-row"><span>${escapeHtml(x.label)}</span><b class="${x.amount>=0?'wl-positive':'wl-negative'}">${x.amount>=0?'+':''}${x.amount}</b></div>`).join('')||'<p class="wl-budget-note">Your ledger begins with the first completed rep.</p>'}
  function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function escapeAttr(v=''){return escapeHtml(v)}
  function shell(){
    if(document.getElementById('wlCreditsLauncher'))return;
    document.body.insertAdjacentHTML('beforeend',`<button id="wlCreditsLauncher" class="wl-credits-launcher">STEWARDSHIP CREDITS<span id="wlCreditMini">0</span></button><div id="wlCreditsOverlay" class="wl-credits-overlay" hidden><section class="wl-credits-panel" role="dialog" aria-modal="true" aria-label="Stewardship Credits"><div class="wl-credits-head"><div><div class="wl-kicker">PHASE 2 + 3</div><h2>Faithfulness, reinforced.</h2><div><span id="wlBalance" class="wl-balance">0</span> <small>credits available</small></div></div><button class="wl-close" id="wlClose">×</button></div><div class="wl-credit-grid"><div class="wl-credit-section"><h3>Today’s habit reps</h3><div id="wlHabitRows"></div><p class="wl-budget-note">Full, minimum, and recovery reps prevent all-or-nothing thinking. Credits are fixed, capped, and never random.</p></div><div class="wl-credit-section"><h3>Reward garage</h3><div id="wlRewards"></div><p class="wl-budget-note">A redemption unlocks permission inside a real budget. It does not create additional money.</p></div></div><div class="wl-credit-section wl-ledger"><h3>Credit ledger</h3><div id="wlLedger"></div></div></section></div>`);
    const overlay=document.getElementById('wlCreditsOverlay');
    document.getElementById('wlCreditsLauncher').onclick=()=>{overlay.hidden=false;render()};document.getElementById('wlClose').onclick=()=>overlay.hidden=true;overlay.onclick=e=>{if(e.target===overlay)overlay.hidden=true};
    overlay.addEventListener('click',e=>{const hb=e.target.closest('[data-habit]');if(hb){const st=stewardship();const h=(st.data.habits||[]).find(x=>String(x.id)===hb.dataset.habit);if(h)recordRep(h,hb.dataset.tier)}const rb=e.target.closest('[data-reward]');if(rb){const r=creditState().rewards.find(x=>x.id===rb.dataset.reward);if(r)redeem(r)}});
  }
  function render(){shell();const s=creditState();document.getElementById('wlCreditMini').textContent=s.balance;document.getElementById('wlBalance').textContent=s.balance;document.getElementById('wlHabitRows').innerHTML=habitRows();document.getElementById('wlRewards').innerHTML=rewards();document.getElementById('wlLedger').innerHTML=ledger()}
  const start=()=>{shell();render();setInterval(()=>{if(!document.getElementById('wlCreditsOverlay')?.hidden)render()},30000)};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
