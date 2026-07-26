/**
 * Stewardship Credits launcher — the quick-access cockpit overlay.
 *
 * Thin UI over RewardStore (fs-credits) + StewStore (fs-stewardship): today's
 * habit reps, a peek at the Reward Garage, and the recent ledger. All state
 * changes go through the stores so local-first persistence, cloud sync, and
 * duplicate-award prevention live in exactly one place.
 */
(()=>{
  'use strict';
  const DAY=()=>new Date().toISOString().slice(0,10);
  const R=()=>window.RewardStore;
  const S=()=>window.StewStore;

  function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function escapeAttr(v=''){return escapeHtml(v)}

  function todaysHabits(){
    if(!S()) return [];
    return S().getHabits().filter(h=>S().habitAppliesOn(h, DAY()));
  }
  function tierLabel(t){return ({full:'Full Rep',minimum:'Minimum Rep',recovery:'Recovery Rep'})[t]}

  function habitRows(){
    const rows = todaysHabits().map(h=>{
      const rep = h.reps?.[DAY()];
      return `<div class="wl-habit-rep"><div class="wl-habit-title">${escapeHtml(h.title||h.name||'Habit')}</div><div class="wl-rep-actions">${['full','minimum','recovery'].map(t=>`<button class="wl-rep-btn ${t} ${rep?.tier===t?'done':''}" data-habit="${escapeAttr(h.id)}" data-tier="${t}" ${rep?'disabled':''}>${rep?.tier===t?'✓ ':''}${tierLabel(t)} +${R()?R().tierAmountFor(h,t):0}</button>`).join('')}</div></div>`;
    }).join('');
    return rows||'<p class="wl-budget-note">No habits are scheduled today.</p>';
  }
  function rewardRows(){
    if(!R()) return '';
    const balance = R().getBalance();
    const list = R().getRewards().filter(r=>r.active).slice(0,6);
    const rows = list.map(r=>{
      const blocked = R().redeemBlocker(r);
      return `<div class="wl-reward"><div><strong>${escapeHtml(r.name)}</strong><small>${r.creditCost} credits${blocked&&blocked.code!=='credits'?' · '+escapeHtml(blocked.message):''}</small></div><button class="wl-redeem" data-reward="${escapeAttr(r.id)}" ${blocked?'disabled':''}>Redeem</button></div>`;
    }).join('');
    return (rows||'<p class="wl-budget-note">No active rewards yet.</p>')+
      `<button class="wl-rep-btn full" id="wlOpenGarage" style="margin-top:10px;width:100%">Open the Reward Garage →</button>`+
      `<p class="wl-budget-note">${balance} credits available. A redemption unlocks permission inside a real budget. It does not create additional money.</p>`;
  }
  function ledgerRows(){
    if(!R()) return '';
    return R().getLedger().slice(0,12).map(x=>`<div class="wl-ledger-row"><span>${escapeHtml(x.label||x.reason||'')}</span><b class="${x.amount>=0?'wl-positive':'wl-negative'}">${x.amount>=0?'+':''}${x.amount}</b></div>`).join('')||'<p class="wl-budget-note">Your ledger begins with the first completed rep.</p>';
  }

  function shell(){
    if(document.getElementById('wlCreditsLauncher'))return;
    document.body.insertAdjacentHTML('beforeend',`<button id="wlCreditsLauncher" class="wl-credits-launcher">STEWARDSHIP CREDITS<span id="wlCreditMini">0</span></button><div id="wlCreditsOverlay" class="wl-credits-overlay" hidden><section class="wl-credits-panel" role="dialog" aria-modal="true" aria-label="Stewardship Credits"><div class="wl-credits-head"><div><div class="wl-kicker">STEWARDSHIP</div><h2>Faithfulness, reinforced.</h2><div><span id="wlBalance" class="wl-balance">0</span> <small>credits available</small></div></div><button class="wl-close" id="wlClose" aria-label="Close">×</button></div><div class="wl-credit-grid"><div class="wl-credit-section"><h3>Today’s habit reps</h3><div id="wlHabitRows"></div><p class="wl-budget-note">Full, minimum, and recovery reps prevent all-or-nothing thinking. Credits are fixed, capped, and never random.</p></div><div class="wl-credit-section"><h3>Reward garage</h3><div id="wlRewards"></div></div></div><div class="wl-credit-section wl-ledger"><h3>Credit ledger</h3><div id="wlLedger"></div></div></section></div>`);
    const overlay=document.getElementById('wlCreditsOverlay');
    document.getElementById('wlCreditsLauncher').onclick=()=>{overlay.hidden=false;render()};
    document.getElementById('wlClose').onclick=()=>overlay.hidden=true;
    overlay.onclick=e=>{if(e.target===overlay)overlay.hidden=true};
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden)overlay.hidden=true});
    overlay.addEventListener('click',e=>{
      if(e.target.closest('#wlOpenGarage')){overlay.hidden=true;window.setMode?.('rewards');return}
      const hb=e.target.closest('[data-habit]');
      if(hb&&R()){R().recordRep(hb.dataset.habit,hb.dataset.tier);render();return}
      const rb=e.target.closest('[data-reward]');
      if(rb&&R()){R().redeem(rb.dataset.reward);render()}
    });
  }
  function render(){
    shell();
    const balance=R()?R().getBalance():0;
    document.getElementById('wlCreditMini').textContent=balance;
    document.getElementById('wlBalance').textContent=balance;
    document.getElementById('wlHabitRows').innerHTML=habitRows();
    document.getElementById('wlRewards').innerHTML=rewardRows();
    document.getElementById('wlLedger').innerHTML=ledgerRows();
  }
  async function start(){
    shell();
    try{await Promise.all([R()?.init?.(),S()?.init?.()])}catch(e){console.warn('[Credits] store init failed',e)}
    render();
    window.addEventListener('withlittle:credits-changed',()=>render());
    window.addEventListener('withlittle:trajectory-changed',()=>{
      if(!document.getElementById('wlCreditsOverlay')?.hidden)render();
    });
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
