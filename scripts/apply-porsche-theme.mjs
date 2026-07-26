import fs from 'node:fs';

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');
const START = '/* PORSCHE_THEME_START */';
const END = '/* PORSCHE_THEME_END */';

const css = String.raw`
${START}
:root{
  --bg-page:#02050a;
  --bg-sidebar:#050a12;
  --bg-card:#08111d;
  --bg-card-2:#0b1624;
  --bg-hover:#102239;
  --border:#1b3552;
  --text-primary:#f4f8ff;
  --text-secondary:#a8bad0;
  --text-muted:#71859d;
  --gold:#2f8cff;
  --gold-text:#7fc0ff;
  --gold-soft:#246fbd;
  --green:#44d18d;
  --red:#ff3b4f;
  --blue:#2f8cff;
  --purple:#7f7bff;
  --radius-sm:8px;
  --radius-md:10px;
  --radius-lg:14px;
  --radius-xl:18px;
  --overlay-backdrop:rgba(0,3,8,.78);
  --shadow-elevated:rgba(0,0,0,.52);
  --focus-ring:rgba(47,140,255,.62);
  --text-on-gold:#02050a;
  --text-on-green:#02050a;
  --text-on-red:#fff;
  --scroll-track:#02050a;
  --scroll-thumb:#24496f;
  --navy:var(--text-primary);
  --cream-raised:var(--bg-card);
  --ink:var(--text-primary);
  --mist:var(--text-secondary);
  --line:var(--border);
  --line-soft:var(--border);
  --card:var(--bg-card);
  --paper:var(--bg-card-2);
}
html{background:#02050a;color-scheme:dark}
body,body.theme-morning,body.theme-day,body.theme-evening{
  --bg-page:#02050a;
  --bg-sidebar:#050a12;
  --bg-card:#08111d;
  --bg-card-2:#0b1624;
  --bg-hover:#102239;
  --text-secondary:#a8bad0;
  min-height:100vh;
  background:
    radial-gradient(circle at 83% 3%,rgba(47,140,255,.14),transparent 28rem),
    radial-gradient(circle at 8% 92%,rgba(255,59,79,.055),transparent 24rem),
    linear-gradient(135deg,#02050a 0%,#040912 54%,#02050a 100%);
  color:var(--text-primary);
}
body::before{
  content:"";position:fixed;inset:0;pointer-events:none;z-index:-1;opacity:.22;
  background-image:linear-gradient(115deg,transparent 0 49%,rgba(255,255,255,.018) 49.5% 50%,transparent 50.5%),linear-gradient(rgba(47,140,255,.025) 1px,transparent 1px);
  background-size:24px 24px,100% 4px;
}
.serif,.page-head h2,.auth-card h3,.ideas-section-head h2,.pipe-card-title,.daily-planning-date,
.dd-hero-title,.dd-card-title,.dl-rail-journal h4,.stew-wdom,.intake-pick-num{
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
  letter-spacing:-.035em;
}
.sidebar,.app-sidebar,[class*="sidebar"]{
  background:linear-gradient(180deg,rgba(6,12,21,.98),rgba(2,6,12,.98))!important;
  border-right:1px solid rgba(47,140,255,.22)!important;
  box-shadow:18px 0 45px rgba(0,0,0,.32);
}
.topbar,.app-topbar,header{
  background:linear-gradient(180deg,rgba(5,11,19,.94),rgba(4,9,16,.84))!important;
  border-bottom-color:rgba(47,140,255,.2)!important;
  backdrop-filter:blur(22px) saturate(125%);
}
.card,.panel,.auth-card,.pipe-card,.dl-rail-journal,.dd-card,.dd-hero,.stew-week-card,
.intake-agenda,.intake-choice,.stew-mcell,[class*="card"]{
  background:linear-gradient(145deg,rgba(12,25,41,.94),rgba(6,14,24,.96))!important;
  border-color:rgba(74,137,198,.25)!important;
  box-shadow:0 18px 42px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.035)!important;
}
.card:hover,.panel:hover,.pipe-card:hover,.intake-choice:hover{
  border-color:rgba(47,140,255,.44)!important;
}
input,textarea,select,.pipe-inset,.stew-refl-input,.ih-inp,.ih-cl-row textarea,.ih-dev-notes{
  background:linear-gradient(180deg,#07111c,#091522)!important;
  color:var(--text-primary)!important;
  border-color:#1a3856!important;
  box-shadow:inset 0 1px 7px rgba(0,0,0,.24);
}
input:focus,textarea:focus,select:focus{
  border-color:#2f8cff!important;
  box-shadow:0 0 0 3px rgba(47,140,255,.15),inset 0 1px 7px rgba(0,0,0,.2)!important;
  outline:none!important;
}
button,.btn,[role="button"]{
  transition:transform .16s ease,border-color .16s ease,background .16s ease,box-shadow .16s ease,color .16s ease;
}
button:hover,.btn:hover,[role="button"]:hover{transform:translateY(-1px)}
button:active,.btn:active,[role="button"]:active{transform:translateY(0)}
#saveBtn,.intake-btn-primary,.ih-btn-plant,.primary,.primary-btn,[class*="primary"]{
  background:linear-gradient(135deg,#1676dc,#39a2ff)!important;
  border-color:#47aaff!important;
  color:#fff!important;
  box-shadow:0 8px 24px rgba(32,132,236,.25),inset 0 1px 0 rgba(255,255,255,.22)!important;
}
.danger,.danger-full,.ih-danger,.dl-habit-remove:hover{
  color:#ff5b6d!important;
}
.navrow,.day-seg,.weekday-phase-tabs,.tabs,[class*="seg"]{
  background:linear-gradient(180deg,rgba(13,28,45,.92),rgba(6,15,25,.95))!important;
  border-color:rgba(47,140,255,.32)!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.035);
}
.navrow button,.day-seg button,.tab,.nav-item{
  color:#9eb4cc!important;
}
.navrow button:hover,.day-seg button:hover,.tab:hover,.nav-item:hover{
  background:rgba(47,140,255,.1)!important;color:#f5f9ff!important;
}
.day-seg button.on,.tab.on,.tab.active,.nav-item.active,[aria-selected="true"]{
  background:linear-gradient(135deg,rgba(47,140,255,.28),rgba(28,92,164,.2))!important;
  color:#fff!important;
  border-color:rgba(88,170,255,.48)!important;
  box-shadow:0 0 0 1px rgba(47,140,255,.14),0 8px 22px rgba(0,0,0,.22)!important;
}
.score,.chip,.pill,.dl-growth-cat,.dd-pill,.stew-refl-chip,.intake-chip,.intake-mini,.intake-shelf-chip{
  background:linear-gradient(180deg,rgba(14,31,50,.94),rgba(7,17,28,.96))!important;
  border-color:rgba(54,113,171,.38)!important;
}
.score::after,.stew-now-line,.stew-now-line::before{background:#2f8cff!important}
.page-head h2,.daily-planning-date{color:#f7faff!important;text-shadow:0 0 28px rgba(47,140,255,.08)}
.page-head p,.muted,.helper,.hint{color:var(--text-secondary)!important}
a{color:#71baff}
a:hover{color:#a8d7ff}
.day-banner{
  background:linear-gradient(90deg,rgba(47,140,255,.12),rgba(6,15,25,.96),rgba(255,59,79,.07))!important;
  color:#8bc7ff!important;border-bottom-color:rgba(47,140,255,.28)!important;
}
.day-banner.past{background:#091421!important;color:#94a9c0!important}
.app-empty-state,.coming,.empty{
  background:linear-gradient(135deg,rgba(8,19,31,.92),rgba(5,12,21,.92))!important;
  border-color:rgba(61,116,168,.28)!important;
  color:#8ea5bd!important;
}
/* GT3 RS redline: rare, intentional accents */
#saveState.dirty,.auth-msg.err,.danger,.danger-full,.intake-x:hover,.dl-habit-remove:hover{color:#ff5365!important}
body.day-off-today .navrow{border-color:rgba(255,59,79,.5)!important}
body.day-off-today #periodLabel{color:#ff7080!important}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-track{background:#02050a}
::-webkit-scrollbar-thumb{background:linear-gradient(#173655,#244e75);border:2px solid #02050a;border-radius:99px}
::selection{background:rgba(47,140,255,.32);color:#fff}
@media(max-width:760px){
  .board{padding:12px 12px 28px}
  .card,.panel,[class*="card"]{border-radius:14px!important}
  .page-head h2{font-size:24px!important}
}
@media(prefers-reduced-motion:no-preference){
  .card,.panel,[class*="card"]{transition:border-color .2s ease,transform .2s ease,box-shadow .2s ease}
}
${END}
`;

const blockPattern = new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
if (blockPattern.test(html)) {
  html = html.replace(blockPattern, css.trim());
} else {
  const closeStyle = html.indexOf('</style>');
  if (closeStyle < 0) throw new Error('Could not find closing style tag');
  html = html.slice(0, closeStyle) + '\n' + css.trim() + '\n' + html.slice(closeStyle);
}

html = html.replace(/<meta name="theme-color"[^>]*>/, '');
html = html.replace('</head>', '<meta name="theme-color" content="#02050a">\n</head>');
html = html.replace(/fill='%23f6f1e9'/g, "fill='%2302050a'");
html = html.replace(/fill='%23b8892a'/g, "fill='%232f8cff'");

fs.writeFileSync(file, html);
console.log('Applied Porsche GT3 RS black/blue/red visual system to existing With Little.');
