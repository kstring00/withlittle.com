(() => {
  'use strict';

  const SUPABASE_URL = 'https://lfgukrnfuradrgofzxsz.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_VwhWvbGrfWR7jkJY5QKwyw_Ka14_Y-m';
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const $ = (id) => document.getElementById(id);
  const state = { session: null, rows: {}, deferredInstall: null };

  function localDateKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 11) return 'Build the day from the right source.';
    if (hour < 17) return 'Keep the next faithful agreement.';
    return 'Finish with truth, grace, and order.';
  }

  function isScheduled(habit) {
    const frequency = habit.frequency || 'daily';
    const jsDay = new Date().getDay();
    if (frequency === 'daily') return true;
    if (frequency === 'weekdays') return jsDay >= 1 && jsDay <= 5;
    if (frequency === 'weekly') return (habit.days || []).includes(jsDay);
    return true;
  }

  function isDone(habit, dateKey) {
    const value = (habit.log || {})[dateKey];
    return typeof value === 'object' ? Boolean(value?.done || value?.completed) : Boolean(value);
  }

  function parseNotes(notes='') {
    const full = notes.match(/Full version:\s*(.+)/i)?.[1] || '';
    const minimum = notes.match(/Minimum version:\s*(.+)/i)?.[1] || '';
    const windowText = notes.match(/Window:\s*(.+)/i)?.[1] || '';
    return { full, minimum, windowText };
  }

  async function loadCloud() {
    if (!state.session) return;
    setSync('Syncing');
    const today = localDateKey();
    const keys = ['fs-core', 'fs-stewardship', `fs-day:${today}`, 'fs-credits'];
    const { data, error } = await client
      .from('app_data')
      .select('key,data,updated_at')
      .in('key', keys);

    if (error) {
      console.error('[Kyle OS] cloud load failed', error);
      setSync('Cloud error');
      return;
    }

    state.rows = Object.fromEntries((data || []).map(row => [row.key, row.data || {}]));
    render();
    setSync('Synced');
  }

  function render() {
    const today = localDateKey();
    const stewardship = state.rows['fs-stewardship'] || {};
    const day = state.rows[`fs-day:${today}`] || {};
    const credits = state.rows['fs-credits'] || {};
    const habits = (stewardship.habits || []).filter(isScheduled);
    const doneCount = habits.filter(h => isDone(h, today)).length;
    const percent = habits.length ? Math.round(doneCount / habits.length * 100) : 0;
    const priorities = (((day.faithfulFew || {}).mustDo || {}).items || [])
      .filter(item => !item.released && !item.anchorId);
    const prioritiesDone = priorities.filter(item => item.done).length;
    const nextHabit = habits.find(h => !isDone(h, today));
    const nextPriority = priorities.find(item => !item.done);

    $('habitPercent').textContent = `${percent}%`;
    $('habitScoreText').textContent = `${doneCount} of ${habits.length} scheduled habits complete`;
    $('scoreRing').style.setProperty('--percent', `${percent}%`);
    $('priorityMetric').textContent = `${prioritiesDone} / ${priorities.length}`;
    $('creditBalance').textContent = String(credits.balance || 0);
    $('nextAction').textContent = nextPriority?.text || nextHabit?.title || 'Everything currently scheduled is complete.';

    const list = $('habitList');
    if (!habits.length) {
      list.innerHTML = '<p class="empty">No habits are scheduled today. Configure habits in With Little.</p>';
      return;
    }

    list.innerHTML = habits.map(habit => {
      const done = isDone(habit, today);
      const detail = parseNotes(habit.notes);
      const cue = detail.windowText || (habit.targetTime && habit.targetTime !== 'any' ? habit.targetTime : '') || detail.minimum || 'Daily rep';
      return `<div class="habit-row ${done ? 'done' : ''}">
        <div class="habit-icon">${done ? '✓' : '○'}</div>
        <div><h4>${escapeHtml(habit.title || 'Untitled habit')}</h4><p>${escapeHtml(cue)}</p></div>
        <span class="habit-state">${done ? 'KEPT' : 'OPEN'}</span>
      </div>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
    })[char]);
  }

  function setSync(label) {
    $('syncState').textContent = label;
  }

  async function initAuth() {
    const { data } = await client.auth.getSession();
    state.session = data.session;
    updateAuthUI();
    if (state.session) await loadCloud();

    client.auth.onAuthStateChange(async (_event, session) => {
      state.session = session;
      updateAuthUI();
      if (session) await loadCloud();
    });
  }

  function updateAuthUI() {
    const signedIn = Boolean(state.session);
    $('authCard').hidden = signedIn;
    $('signOutBtn').hidden = !signedIn;
    setSync(signedIn ? 'Connected' : 'Local');
  }

  async function signIn() {
    const email = $('emailInput').value.trim();
    if (!email) {
      $('authMessage').textContent = 'Enter the email connected to With Little.';
      return;
    }
    $('signInBtn').disabled = true;
    $('authMessage').textContent = 'Sending secure sign-in link…';
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/kyle/` }
    });
    $('signInBtn').disabled = false;
    $('authMessage').textContent = error ? error.message : 'Check your email, then return here.';
  }

  function bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === button));
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        $(`${button.dataset.view}View`)?.classList.add('active');
      });
    });
  }

  function bindInstall() {
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      state.deferredInstall = event;
      $('installBtn').hidden = false;
    });
    $('installBtn').addEventListener('click', async () => {
      if (!state.deferredInstall) return;
      state.deferredInstall.prompt();
      await state.deferredInstall.userChoice;
      state.deferredInstall = null;
      $('installBtn').hidden = true;
    });
  }

  $('dayLabel').textContent = new Intl.DateTimeFormat('en-US', { weekday:'long', month:'long', day:'numeric' }).format(new Date()).toUpperCase();
  $('greeting').textContent = greeting();
  $('signInBtn').addEventListener('click', signIn);
  $('signOutBtn').addEventListener('click', () => client.auth.signOut());
  $('openWithLittle').addEventListener('click', () => { location.href = '/'; });
  bindNavigation();
  bindInstall();
  initAuth().catch(error => {
    console.error('[Kyle OS] startup failed', error);
    setSync('Startup error');
  });
})();
