// js/app-core.js
// Main application logic extracted from reconstructed v58.
// First modular pass keeps runtime order intact.

// ==================== FIREBASE SETUP ====================

// ==================== STATE ====================
let currentUser = null;
let currentUserData = null;
let kioskScanner = null;
let inlineScanner = null;
let currentRequestForApproval = null;
let allTimelogs = [];
let allEmpMap   = {};
let employeeUsersRef = null;
let employeeUsersListener = null;
let allTsPage = 1;
let myTsPage = 1;
const PAGE_SIZE = window.innerWidth <= 768 ? 6 : 10;

let periodStart = '', periodEnd = '', periodApply = '';
let globalHolidayShifts = {}; // Admin setup: { 'YYYY-MM-DD': {code:'SH'|'LH', name:'...'} }

// ==================== UTILITIES ====================
function toast(msg, type='green') {
  const tc = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<div class="toast-dot"></div><div class="toast-msg">${msg}</div>`;
  tc.appendChild(t);
  requestAnimationFrame(() => { setTimeout(() => t.classList.add('show'), 10); });
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);
}

function fmtDate(d) {
  if(!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-PH',{month:'short',day:'2-digit',year:'numeric'});
}
function fmtTime(ts) {
  if(!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true});
}
function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function getDayName(dateStr) {
  const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return days[new Date(dateStr+'T12:00:00').getDay()];
}
function genId() { return db.ref().push().key; }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function showModal(id) { document.getElementById(id).classList.remove('hidden'); }

const DEFAULT_WORK_SHIFT_CODE = '0830A';
const HOLIDAY_SHIFT_CODES = ['SH','LH']; // SH = Special Holiday, LH = Legal Holiday
function normalizeShiftCode(code) { return String(code || '').trim().toUpperCase(); }
function isHolidayShiftCode(code) { return HOLIDAY_SHIFT_CODES.includes(normalizeShiftCode(code)); }
function isNonWorkingShiftCode(code) { const c = normalizeShiftCode(code); return c === 'RD' || isHolidayShiftCode(c); }
function getShiftLabel(code) {
  const labels = {
    'SH':'SH — Special Holiday','LH':'LH — Legal Holiday','RD':'RD — Rest Day',
    '0800A':'0800A — 8:00am to 5:00pm 60/30',
    '0800A1':'0800A1 — 8am to 5pm 30/60 Snack/Lunch',
    '0830A':'0830A — 8:30am to 5:30pm 60/30',
    '0830A1':'0830A1 — 8:30am to 5:30pm 30/60',
    '0700A':'0700A — 7:00am to 4:00pm 60/30',
    '0600A':'0600A — 6:00am to 3:00pm 60/30',
    '0800A10':'0800A10 — 8:00am to 7:15pm 120/30 nb/sb',
    '0800A11':'0800A11 — 8:00am to 8:45pm 120/30 nb/sb',
    '0800A12':'0800A12 — 8:00am to 9:00pm 120/30 nb/sb',
    '0830A10':'0830A10 — 8:30am to 7:45pm 120/30 nb/sb',
    '0830A11':'0830A11 — 8:30am to 9:15pm 120/30 nb/sb',
    '1200P':'1200P — 12:00pm to 9:00pm 60/30',
    '1400P':'1400P — 2:00pm to 11:00pm 60/30',
    '1500P':'1500P — 3:00pm to 12:00am 60/30',
    '2200N':'2200N — 10:00pm to 7:00am 60/30',
    '2300N':'2300N — 11:00pm to 8:00am 60/30',
    '0000N':'0000N — 12:00am to 9:00am 60/30',
  };
  const c = normalizeShiftCode(code);
  return labels[c] || (c || DEFAULT_WORK_SHIFT_CODE);
}
function getShiftStart(code) {
  const map = {
    '0800A':{h:8,m:0},'0800A1':{h:8,m:0},'0800A10':{h:8,m:0},'0800A11':{h:8,m:0},'0800A12':{h:8,m:0},
    '0830A':{h:8,m:30},'0830A1':{h:8,m:30},'0830A10':{h:8,m:30},'0830A11':{h:8,m:30},
    '0700A':{h:7,m:0},'0600A':{h:6,m:0},
    '1200P':{h:12,m:0},'1400P':{h:14,m:0},'1500P':{h:15,m:0},
    '2200N':{h:22,m:0},'2300N':{h:23,m:0},'0000N':{h:0,m:0},
  };
  return map[normalizeShiftCode(code)] || map[DEFAULT_WORK_SHIFT_CODE];
}
function getShiftEnd(code) {
  const map = {
    '0800A':{h:17,m:0},'0800A1':{h:17,m:0},'0800A10':{h:19,m:15},'0800A11':{h:20,m:45},'0800A12':{h:21,m:0},
    '0830A':{h:17,m:30},'0830A1':{h:17,m:30},'0830A10':{h:19,m:45},'0830A11':{h:21,m:15},
    '0700A':{h:16,m:0},'0600A':{h:15,m:0},
    '1200P':{h:21,m:0},'1400P':{h:23,m:0},'1500P':{h:0,m:0},
    '2200N':{h:7,m:0},'2300N':{h:8,m:0},'0000N':{h:9,m:0},
  };
  return map[normalizeShiftCode(code)] || map[DEFAULT_WORK_SHIFT_CODE];
}

function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }
function hoursBetweenTs(startTs, endTs) {
  if(!startTs || !endTs) return 0;
  const start = new Date(startTs);
  let end = new Date(endTs);
  if(isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  // Support overnight shift if out time is technically next day / less than in time.
  if(end < start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return Math.max(0, (end - start) / 3600000);
}
function getScheduledRegularHours(shiftCode) {
  const c = normalizeShiftCode(shiftCode);
  // Rest day has no scheduled regular hours. All other shift types are treated as 8-hour base duty.
  if(c === 'RD') return 0;
  return 8;
}
function getApprovedOTHoursFromRequests(reqs) {
  // Recalled requests must not count — only truly approved, non-recalled OT is credited
  return (reqs || []).filter(r => r && r.type === 'overtime' && r.status === 'approved'
                                  && r.recalled !== true && String(r.status) !== 'recalled')
    .reduce((sum, r) => sum + Number(r.hours || r.approvedHours || 0), 0);
}
function hasApprovedLeaveForRow(row) {
  // Recalled leave requests must not protect the row from absence marking
  const rowRecalled = row.recalled === true || String(row.status || '').toLowerCase() === 'recalled';
  if(!rowRecalled && (row.leaveType || Number(row.leaveDays || 0) > 0 || row.status === 'leave')) return true;
  return (row._requests || []).some(r =>
    r && r.type === 'leave' && r.status === 'approved'
    && r.recalled !== true && String(r.status) !== 'recalled'
  );
}
function calculateCapturedTotalHours(row) {
  // Rule: timeIn without timeOut = treated as absent (0 hours worked)
  if(!row || !row.timeIn || !row.timeOut) return 0;
  const gross = hoursBetweenTs(row.timeIn, row.timeOut);
  // Rule: noonOut without noonIn = employee never returned from lunch
  // Entire time from noonOut to timeOut is counted as break (not credited)
  const lunchBreak = row.noonOut
    ? (row.noonIn ? hoursBetweenTs(row.noonOut, row.noonIn) : hoursBetweenTs(row.noonOut, row.timeOut))
    : 0;
  // Rule: snackBreakOut without snackBreakIn = same treatment
  const snackBreak = row.snackBreakOut
    ? (row.snackBreakIn ? hoursBetweenTs(row.snackBreakOut, row.snackBreakIn) : hoursBetweenTs(row.snackBreakOut, row.timeOut))
    : 0;
  return round2(Math.max(0, gross - lunchBreak - snackBreak));
}
function calculateLateMinutes(row) {
  if(!row || !row.timeIn) return 0;
  const shiftCode = normalizeShiftCode(row.shiftCode || DEFAULT_WORK_SHIFT_CODE);
  // Holiday/RD rows do not have a normal late computation unless changed to a real shift code.
  if(shiftCode === 'RD' || isHolidayShiftCode(shiftCode)) return 0;
  const inDate = new Date(row.timeIn);
  if(isNaN(inDate.getTime())) return 0;
  const ss = getShiftStart(shiftCode);
  const shiftStartMs = new Date(inDate.toDateString()).setHours(ss.h, ss.m, 0, 0);
  let lateMs = Math.max(0, inDate.getTime() - shiftStartMs);
  // Rule: noonOut without noonIn = late returning from lunch
  // All time from noonOut to timeOut is considered unaccounted/late
  if(row.noonOut && !row.noonIn && row.timeOut) {
    const noonOutMs = new Date(row.noonOut).getTime();
    const timeOutMs = new Date(row.timeOut).getTime();
    if(!isNaN(noonOutMs) && !isNaN(timeOutMs) && timeOutMs > noonOutMs)
      lateMs += (timeOutMs - noonOutMs);
  }
  // Rule: snackBreakOut without snackBreakIn = same
  if(row.snackBreakOut && !row.snackBreakIn && row.timeOut) {
    const snackOutMs = new Date(row.snackBreakOut).getTime();
    const timeOutMs  = new Date(row.timeOut).getTime();
    if(!isNaN(snackOutMs) && !isNaN(timeOutMs) && timeOutMs > snackOutMs)
      lateMs += (timeOutMs - snackOutMs);
  }
  return Math.floor(lateMs / 60000);
}
function calculateTimelogMetrics(row) {
  const regular = getScheduledRegularHours(row?.shiftCode || DEFAULT_WORK_SHIFT_CODE);
  const total = calculateCapturedTotalHours(row || {});
  const excess = round2(Math.max(0, total - regular));
  const approvedOT = round2(Math.min(excess, getApprovedOTHoursFromRequests(row?._requests || [])));
  const hasTimeIn  = !!row?.timeIn;
  const hasTimeOut = !!row?.timeOut;
  const isFuture = row?.date ? row.date > todayStr() : false;
  const isRD = normalizeShiftCode(row?.shiftCode) === 'RD';
  const isHoliday = isHolidayShiftCode(row?.shiftCode);
  const isLeave = hasApprovedLeaveForRow(row || {});
  // Rule: no tap-in OR tap-in without tap-out = absent
  const absence = (!isFuture && !isRD && !isHoliday && !isLeave && regular > 0
                   && (!hasTimeIn || !hasTimeOut)) ? 1 : 0;
  const undertime = (!absence && hasTimeIn && hasTimeOut && !isHoliday && !isRD
                     && regular > 0 && total > 0 && total < regular) ? round2(regular - total) : 0;
  return {
    regularWorkHrs: regular,
    totalWorkHrs: total,
    excessWorkHrs: excess,
    lateMinutes: calculateLateMinutes(row || {}),
    undertimeMinutes: undertime,
    OTHours: approvedOT,
    absence,
    status: absence ? 'absent' : (hasTimeIn ? 'present' : (row?.status || 'no_record'))
  };
}
function applyPayrollRulesToRow(row) {
  const metrics = calculateTimelogMetrics(row || {});
  return {...(row || {}), ...metrics};
}
function computeHours(timeIn, timeOut, shiftCode, row) {
  const metrics = calculateTimelogMetrics({...(row || {}), timeIn, timeOut, shiftCode});
  return {
    reg: metrics.regularWorkHrs,
    total: metrics.totalWorkHrs,
    late: metrics.lateMinutes,
    excess: metrics.excessWorkHrs,
    undertime: metrics.undertimeMinutes,
    ot: metrics.OTHours
  };
}

// ==================== CLOCK ====================
function startClock() {
  function tick() {
    const now = new Date();
    const ts = now.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
    const ds = now.toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    const hc = document.getElementById('header-clock');
    const kc = document.getElementById('kiosk-clock');
    const kd = document.getElementById('kiosk-date');
    if(hc) hc.textContent = ts;
    if(kc) kc.textContent = ts;
    if(kd) kd.textContent = ds;
  }
  tick(); setInterval(tick, 1000);
}
startClock();

// ==================== FIREBASE CONNECTION MONITOR ====================
// Uses .info/connected — built-in Firebase RTDB real-time presence node.
// Updates the header status badge live without polling.
(function initConnectionMonitor() {
  const connRef = db.ref(".info/connected");
  let firstRead = true;
  connRef.on("value", snap => {
    const isOnline = snap.val() === true;
    const el    = document.getElementById("conn-status");
    const dot   = document.getElementById("conn-dot");
    const label = document.getElementById("conn-label");
    if (!el) return;
    if (firstRead && !isOnline) {
      // Still establishing — keep "Connecting..." state for 3s before showing offline
      setTimeout(() => {
        if (el.classList.contains("connecting")) {
          el.className = "offline";
          if (label) label.textContent = "Offline";
          toast("Firebase connection lost. Data may be stale.", "amber");
        }
      }, 3000);
      firstRead = false;
      return;
    }
    firstRead = false;
    el.className = isOnline ? "online" : "offline";
    if (label) label.textContent = isOnline ? "Live" : "Offline";
    if (!isOnline) toast("Firebase disconnected — working offline.", "amber");
  });
})();

// ==================== AUTH ====================
function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('kiosk-screen').classList.add('hidden');
  stopKioskScanner();
}
function showKiosk() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('kiosk-screen').classList.remove('hidden');
  startKioskQRDisplay();
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  if(!email||!pass){toast('Enter email and password','amber');return;}
  const btn = document.getElementById('login-btn');
  btn.textContent='Signing in...'; btn.disabled=true;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(e) {
    console.error('[Login] failed:', e.code, e.message);
    let msg = e.message || 'Login failed';
    if(e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') msg = 'Incorrect email or password.';
    else if(e.code === 'auth/too-many-requests') msg = 'Too many attempts. Try again later.';
    else if(e.code === 'auth/network-request-failed') msg = 'No internet connection.';
    toast(msg, 'red');
    btn.textContent='Sign In'; btn.disabled=false;
  }
}

function doLogout() {
  stopInlineScanner();
  stopEmployeeAutoRefresh();
  auth.signOut();
}

auth.onAuthStateChanged(async user => {
  if(user) {
    currentUser = user;
    try {
      const snap = await db.ref(`users/${user.uid}`).once('value');
      if(!snap.exists()) {
        toast(`User profile not found. UID: ${user.uid}. Ask admin to repair/create this profile in Realtime Database.`, 'red');
        await auth.signOut();
        return;
      }
      currentUserData = snap.val();
      currentUserData.uid = user.uid;
      if(currentUserData.deleted === true) {
        toast('This account has been removed. Please contact admin.', 'red');
        await auth.signOut();
        return;
      }
      if(currentUserData.active === false) {
        toast('This account is inactive. Please contact admin.', 'red');
        await auth.signOut();
        return;
      }
      await loadGlobalHolidayShifts();
      document.getElementById('auth-screen').classList.add('hidden');
      document.getElementById('kiosk-screen').classList.add('hidden');
      document.getElementById('app-screen').classList.remove('hidden');
      initApp();
    } catch(e) {
      toast('Login profile load failed: ' + e.message, 'red');
      console.error('Login profile load failed', e);
      await auth.signOut();
    }
  } else {
    currentUser = null; currentUserData = null;
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('login-btn').textContent='Sign In';
    document.getElementById('login-btn').disabled=false;
  }
});

// ==================== APP INIT ====================

// Hide nav items the user doesn't have permission for
function applyNavPermissions(permissions) {
  if(!permissions || !Array.isArray(permissions)) return;
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    const page = item.getAttribute('data-page');
    if(!page) return;
    // Pages without permission restrictions are always shown
    const alwaysVisible = ['timesheet','my-qr','my-payslip','my-salary-agreement'];
    if(alwaysVisible.includes(page)) return;
    if(!permissions.includes(page)) {
      item.style.display = 'none';
    } else {
      item.style.display = '';
    }
  });
}

function initApp() {
  const u = currentUserData;
  document.getElementById('header-name').textContent = u.name || 'User';
  document.getElementById('header-role').textContent = u.role==='admin'?'Administrator':u.role==='manager'?'Manager':u.role==='supervisor'?'Supervisor':u.role==='hr'?'HR':'Rank & File';
  const av = document.getElementById('user-avatar');
  av.textContent = (u.name||'U').split(' ').map(x=>x[0]).join('').substring(0,2).toUpperCase();

  // Default period: current cut-off (6–20 or 21–5)
  const now = new Date(); now.setHours(12,0,0,0);
  const y = now.getFullYear(), mo = now.getMonth(), day = now.getDate();
  let startDate, endDate;
  if(day >= 6 && day <= 20) { startDate = new Date(y,mo,6,12); endDate = new Date(y,mo,20,12); }
  else if(day >= 21) { startDate = new Date(y,mo,21,12); endDate = new Date(y,mo+1,5,12); }
  else { startDate = new Date(y,mo-1,21,12); endDate = new Date(y,mo,5,12); }
  periodStart = startDate.toISOString().split('T')[0]; periodEnd = endDate.toISOString().split('T')[0];
  const applyDate = new Date(endDate); applyDate.setDate(applyDate.getDate()+5); periodApply = applyDate.toISOString().split('T')[0];
  if(typeof syncAllPeriodControls === 'function') syncAllPeriodControls();

  // Show correct nav — supervisor and hr also get manager nav
  const isAdmin      = u.role === 'admin';
  const isMgrOrAdmin = ['admin','manager','supervisor','hr'].includes(u.role);

  if(isMgrOrAdmin) {
    document.getElementById('nav-employee').classList.add('hidden');
    document.getElementById('nav-manager').classList.remove('hidden');
    // For non-admin managers, hide nav items they don't have permission for
    if(!isAdmin && u.permissions && Array.isArray(u.permissions)) {
      applyNavPermissions(u.permissions);
    }
    initManagerDashboard();
    // Land on first permitted manager page
    const _mgrPerms = Array.isArray(u.permissions) ? u.permissions : [];
    const firstMgrPage = (isAdmin || !_mgrPerms.length) ? 'all-timesheet' :
      (['all-timesheet','approvals','employees','holidays','shift-codes','kiosk','reports'].find(p => _mgrPerms.includes(p)) || 'all-timesheet');
    showPage(firstMgrPage);
  } else {
    document.getElementById('nav-employee').classList.remove('hidden');
    document.getElementById('nav-manager').classList.add('hidden');
    // Apply employee nav permissions if defined
    if(u.permissions && Array.isArray(u.permissions)) {
      applyNavPermissions(u.permissions);
    }
    initEmployeeDashboard();
    const _empPerms = Array.isArray(u.permissions) ? u.permissions : [];
    const firstEmpPage = (!_empPerms.length) ? 'timesheet' :
      (['timesheet','my-qr','time-correction','shift-change','leave','overtime','undertime'].find(p => _empPerms.includes(p)) || 'timesheet');
    showPage(firstEmpPage);
    setTimeout(()=>{ if(typeof checkSalAgreeBadge==='function') checkSalAgreeBadge(); }, 1500);
  }
}

function savePeriod() { saveLegacyTimesheetPeriod(); }

// ==================== PAGE ROUTING ====================
function showPage(page) {
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const panel = document.getElementById(`page-${page}`);
  if(panel) panel.classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(n=>n.classList.add('active'));

  // Lazy load
  if(page==='timesheet') loadMyTimesheet();
  if(page==='my-qr') initMyQR();
  if(page==='time-correction') { loadTCTableRecords(); }
  if(page==='shift-change') loadMyRequests('shift_change','sc-list');
  if(page==='leave') { loadMyRequests('leave','lv-list'); loadLeaveBalances(); }
  if(page==='overtime') loadMyRequests('overtime','ot-list');
  if(page==='undertime') loadMyRequests('undertime','ut-list');
  if(page==='all-timesheet') loadAllTimesheets();
  if(page==='approvals') loadAllRequests();
  if(page==='employees') loadEmployees();
  if(page==='holidays') loadHolidaySetup();
  if(page==='shift-codes') loadShiftCodes();
  if(page==='reports') loadReports();
  if(page==='kiosk') { loadRecentScans(); }
  if(page==='payroll') loadPayrollGrid();
  if(page==='my-payslip') loadMyPayslips();
  if(page==='salary-agreements') setTimeout(()=>{ if(typeof loadSalaryAgreementsMgr==='function') loadSalaryAgreementsMgr(); }, 80);
  if(page==='my-salary-agreement') setTimeout(()=>{ if(typeof loadMySalaryAgreement==='function') loadMySalaryAgreement(); }, 80);
}



// ==================== RECALL COLOR + RANK-FILE PENDING RECALL v10.5 ====================
// Adds gray/line-through color to recalled APP chips in timesheet and request tables.
// Rule: Rank-and-File can recall own Pending requests only. Approved recall = Manager/Admin only.
(function(){
  const APPROVED_STATUSES = ['approved','appr1','apprf'];
  const PENDING_STATUSES  = ['pending','pend1','pendf'];
  const RECALLABLE_STATUSES = ['pending','pend1','pendf','approved','appr1','apprf'];
  const TYPE_BADGE = {time_correction:'badge-blue',shift_change:'badge-purple',leave:'badge-amber',overtime:'badge-green',undertime:'badge-gray'};
  const TYPE_LABELS = {time_correction:'Time Correction',shift_change:'Shift Change',leave:'Leave',overtime:'Overtime',undertime:'Undertime'};

  function uid(){ return currentUserData?.uid || auth?.currentUser?.uid || currentUser?.uid || ''; }
  function role(){ return String(currentUserData?.role || currentUserData?.userRole || currentUserData?.positionRole || '').trim().toLowerCase(); }
  function esc(v){ return String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
  function say(msg,type='green'){ if(typeof toast==='function') toast(msg,type); else if(typeof showToast==='function') showToast(msg,type); else console.log(msg); }
  function isApproved(s){ return APPROVED_STATUSES.includes(String(s||'').toLowerCase()); }
  function isPending(s){ return PENDING_STATUSES.includes(String(s||'').toLowerCase()); }
  function isRecalled(s){ return String(s||'').toLowerCase()==='recalled'; }
  function canRecallStatus(s){ return RECALLABLE_STATUSES.includes(String(s||'').toLowerCase()); }
  function isManagerAdmin(){ return ['admin','manager'].includes(role()); }
  function isApprover(){ return ['admin','manager','supervisor','hr','payroll'].includes(role()); }
  function isRankFile(){ const r=role().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim(); return !r || ['rank','rank and file','rank file','rankfile','employee','staff','user','team member'].includes(r); }
  function fmtDate(s){ return s ? new Date(s+'T12:00:00').toLocaleDateString('en-US') : '—'; }
  function statusBadge(st){
    const s=String(st||'pending').toLowerCase();
    const map={pending:['Pending','badge-pend1'],pend1:['Pending','badge-pend1'],pendf:['Pending','badge-pendf'],approved:['Approved','badge-apprf'],appr1:['Approved','badge-appr1'],apprf:['Approved','badge-apprf'],rejected:['Rejected','badge-disapf'],disap1:['Disapproved (1st)','badge-disap1'],disapf:['Rejected','badge-disapf'],cancelled:['Cancelled','badge-cancel'],recalled:['Recalled','badge-recall']};
    const x=map[s]||[st||'—','badge-gray']; return `<span class="badge ${x[1]}" style="font-size:10px">${x[0]}</span>`;
  }
  function actionOwn(r){
    const requestUid = r.uid || uid();
    const id = r.id || r.reqId;
    const own = String(requestUid) === String(uid());
    if(own && isRankFile() && isPending(r.status)) return `<button class="btn btn-amber btn-xs" onclick="recallRequest('${requestUid}','${id}','employee')">↩ Recall</button>`;
    if(isApproved(r.status)) return '<span style="font-size:10px;color:var(--text3)">Manager/Admin recall only</span>';
    if(isRecalled(r.status)) return '<span style="font-size:10px;color:var(--st-recall);font-weight:700">Recalled</span>';
    return '';
  }
  function refreshType(type){ const map={shift_change:'sc-list',leave:'lv-list',overtime:'ot-list',undertime:'ut-list'}; if(type==='time_correction'){ try{loadTCTableRecords?.()}catch(e){} } else if(map[type]){ try{loadMyRequests?.(type,map[type])}catch(e){} } }

  // Override status class used by APP chips in My Timesheet and Team Timesheets.
  window.getReqStatusClass = function(req){
    const s=String(req?.status||'').toLowerCase();
    const wf=String(req?.workflowStage||'').toLowerCase();
    if(s==='recalled') return 'recall';
    if(s==='cancelled') return 'cancel';
    if(s==='pending') return wf==='final'?'pendf':'pend1';
    if(s==='approved_1'||(s==='approved'&&wf==='first')) return 'appr1';
    if(s==='rejected_1'||(s==='rejected'&&wf==='first')||(s==='disapproved'&&wf==='first')) return 'disap1';
    if(s==='approved') return 'apprf';
    if(s==='rejected'||s==='disapproved') return 'disapf';
    return 'pend1';
  };
  window.getDominantRowClass = function(reqs){
    if(!reqs||!reqs.length) return '';
    const priority=['recall','apprf','disapf','appr1','disap1','pendf','pend1','cancel'];
    const classes=reqs.map(r=>getReqStatusClass(r));
    for(const p of priority){ if(classes.includes(p)) return 'ts-row-'+p; }
    return '';
  };
  window.buildReqTags = function(reqs){
    if(!reqs||!reqs.length) return '';
    return reqs.map(req=>{
      const cls=getReqStatusClass(req);
      const short=({time_correction:'TC',shift_change:'SC',leave:'LV',overtime:'OT',undertime:'UT'}[req.type]||'RQ');
      const title=(req.type||'').replace(/_/g,' ')+' — '+(req.status||'')+(req.recallReason?' — '+req.recallReason:'');
      return `<span class="req-tag req-tag-${cls}" title="${esc(title)}">${short}</span>`;
    }).join('');
  };

  window.recallRequest = async function(requestUid, reqId, mode='employee'){
    const snap=await db.ref(`requests/${requestUid}/${reqId}`).once('value');
    if(!snap.exists()){ say('Request not found.','red'); return; }
    const r={uid:requestUid,reqId,...snap.val()};
    if(!canRecallStatus(r.status)){ say('This request can no longer be recalled.','amber'); return; }
    if(mode==='employee'){
      const own=String(requestUid)===String(uid());
      if(!(own && isRankFile() && isPending(r.status))){ say(isApproved(r.status)?'Approved requests can be recalled by Managers/Admin only.':'Rank-and-File can recall only their own Pending request.','red'); return; }
    } else if(isApproved(r.status) ? !isManagerAdmin() : !isApprover()) { say('Only Manager/Admin can recall approved requests.','red'); return; }
    const reason=prompt('Enter recall reason / remarks:', mode==='employee'?'Recalled by employee':'Recalled by approver')||'';
    if(!confirm(`Recall this request?\nStatus: ${r.status}`)) return;
    try{
      await db.ref(`requests/${requestUid}/${reqId}`).update({status:'recalled',previousStatus:r.status||'',recalled:true,recalledAt:Date.now(),recalledBy:currentUserData?.name||auth?.currentUser?.email||'',recalledByRole:role()||mode,recallReason:reason,remarks:reason||r.remarks||''});
      try{ await db.ref('approvalRecallAudit').push({uid:requestUid,reqId,type:r.type,employeeName:r.employeeName||'',employeeId:r.employeeId||'',previousStatus:r.status||'',reason,recalledBy:currentUserData?.name||auth?.currentUser?.email||'',recalledByRole:role()||mode,recalledAt:Date.now()}); }catch(e){}

      // ── Revert all timelog side-effects via shared helper ────────────────
      await _revertTimelogForRequest(requestUid, reqId, r);
      // ─────────────────────────────────────────────────────────────────────

      say('Request recalled successfully.','green');
      try{loadAllRequests?.()}catch(e){}; refreshType(r.type); try{loadMyTimesheet?.()}catch(e){};
    }catch(e){ say('Recall failed: '+e.message,'red'); }
  };

  window.loadMyRequests = function(type, containerId){
    const requestUid=uid(); const c=document.getElementById(containerId);
    if(c) c.innerHTML='<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--text3)">Loading...</td></tr>';
    if(!requestUid){ if(c)c.innerHTML='<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--red)">User session not ready.</td></tr>'; return; }
    db.ref(`requests/${requestUid}`).once('value').then(snap=>{ const list=[]; snap.forEach(ch=>{ const r=ch.val(); if(r&&r.type===type) list.push({id:ch.key,reqId:ch.key,uid:requestUid,...r}); }); list.sort((a,b)=>(b.submittedAt||0)-(a.submittedAt||0)); renderRequestList(list,containerId); });
  };
  window.submitRequest = async function(type,data,listId){
    const requestUid=uid(); if(!requestUid){ say('Cannot submit: user session not ready.','red'); return; }
    const id=(typeof genId==='function')?genId():db.ref().push().key;
    const payload={type,uid:requestUid,employeeName:currentUserData?.name||auth?.currentUser?.email||'',employeeId:currentUserData?.employeeId||currentUserData?.employeeNo||'',submittedAt:Date.now(),status:'pending',...data};
    try{ await db.ref(`requests/${requestUid}/${id}`).set(payload); say('Request submitted successfully.','green'); refreshType(type); setTimeout(()=>refreshType(type),600); try{updateApprovalBadge?.()}catch(e){} }catch(e){ say('Failed: '+e.message,'red'); }
  };
  function patchFiltersAndHeaders(){
    ['tc-filter','sc-status-filter','lv-status-filter','ot-status-filter','ut-status-filter','req-filter-status'].forEach(id=>{ const sel=document.getElementById(id); if(sel&&!Array.from(sel.options).some(o=>o.value==='recalled')) sel.insertAdjacentHTML('beforeend','<option value="recalled">Recalled</option>'); });
    ['tc-table-body','lv-list','ot-list','ut-list'].forEach(id=>{ const tb=document.getElementById(id); const tr=tb?.closest('table')?.querySelector('thead tr'); if(tr&&!Array.from(tr.children).some(th=>/action/i.test(th.textContent))) tr.insertAdjacentHTML('beforeend','<th style="padding:7px 10px;border-bottom:2px solid var(--border2);text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);font-weight:600;white-space:nowrap">Actions</th>'); });
  }
  document.addEventListener('DOMContentLoaded',()=>setTimeout(patchFiltersAndHeaders,500));
  const oldRenderRequestList=window.renderRequestList;
  window.renderRequestList=function(list,containerId){
    patchFiltersAndHeaders();
    if(containerId==='sc-list') return renderShiftChangeRecallColorList(list,containerId);
    if(!['lv-list','ot-list','ut-list'].includes(containerId)) return oldRenderRequestList?.(list,containerId);
    const c=document.getElementById(containerId); if(!c) return;
    const cols=containerId==='ut-list'?5:7; if(!list.length){c.innerHTML=`<tr><td colspan="${cols}" style="text-align:center;padding:36px;color:var(--text3)">No records yet</td></tr>`;return;}
    c.innerHTML=list.map(r=>{ const act=actionOwn({...r,uid:uid()}); const rowCls=isRecalled(r.status)?' class="recall-muted"':''; if(containerId==='lv-list') return `<tr${rowCls}><td class="mono" style="color:var(--accent);font-weight:600">${esc(r.leaveType||'—')}</td><td>${fmtDate(r.dateFrom)}</td><td>${fmtDate(r.dateTo)}</td><td style="text-align:center" class="mono">${r.days||0}</td><td>${esc(r.reason||'—')}</td><td style="text-align:center">${statusBadge(r.status)}</td><td style="text-align:center">${act}</td></tr>`; if(containerId==='ot-list') return `<tr${rowCls}><td>${fmtDate(r.date)}</td><td class="mono" style="text-align:center">${r.startTime||'—'}</td><td class="mono" style="text-align:center">${r.endTime||'—'}</td><td class="mono" style="text-align:center;color:var(--accent)">${r.hours||0}hrs</td><td>${esc(r.reason||'—')}</td><td style="text-align:center">${statusBadge(r.status)}</td><td style="text-align:center">${act}</td></tr>`; return `<tr${rowCls}><td>${fmtDate(r.date)}</td><td class="mono" style="text-align:center">${r.timeLeftEarly||'—'}</td><td>${esc(r.reason||'—')}</td><td style="text-align:center">${statusBadge(r.status)}</td><td style="text-align:center">${act}</td></tr>`; }).join('');
  };
  window.renderShiftChangeRecallColorList=function(list,containerId){
    window.scLastShiftChangeList=list||[]; const c=document.getElementById(containerId); if(!c) return;
    const f=document.getElementById('sc-status-filter')?.value||''; const q=(document.getElementById('sc-search')?.value||'').toLowerCase().trim();
    let rows=(list||[]).filter(r=>!f||r.status===f); if(q) rows=rows.filter(r=>[r.reason,r.requestedShift,r.date,r.status].join(' ').toLowerCase().includes(q));
    if(!rows.length){c.innerHTML='<tr><td colspan="6" style="text-align:center;padding:28px;color:#555">No records found</td></tr>';return;}
    c.innerHTML=rows.map(r=>`<tr${isRecalled(r.status)?' class="recall-muted"':''}><td><input type="checkbox" class="cos-check"></td><td><span class="cos-doc-chip">${esc(typeof shiftChangeDocumentNo==='function'?shiftChangeDocumentNo(r):(r.id||r.reqId||''))}</span></td><td style="color:var(--text2);max-width:160px;overflow:hidden;text-overflow:ellipsis">${esc(r.reason||'—')}</td><td class="mono" style="color:var(--accent);font-size:12px">${esc(r.requestedShift||'')}</td><td>${fmtDate(r.date)}</td><td style="text-align:center">${statusBadge(r.status)}<div style="margin-top:4px">${actionOwn({...r,uid:uid()})}</div></td></tr>`).join('');
  };
  const oldRenderTCTable=window.renderTCTable;
  window.renderTCTable=function(){
    patchFiltersAndHeaders(); const tbody=document.getElementById('tc-table-body'); if(!tbody||!Array.isArray(window.tcAllRecords)) return oldRenderTCTable?.();
    const f=document.getElementById('tc-filter')?.value||'all', q=(document.getElementById('tc-search')?.value||'').toLowerCase().trim(), ps=parseInt(document.getElementById('tc-page-size')?.value||'10');
    let rows=tcAllRecords.slice(); if(f!=='all') rows=rows.filter(r=>r.status===f); if(q) rows=rows.filter(r=>(r.dateKey||r.date||'').includes(q)||(r.employeeName||'').toLowerCase().includes(q)||(r.reason||'').toLowerCase().includes(q));
    const total=rows.length,pages=Math.max(1,Math.ceil(total/ps)); if(tcTablePage>pages)tcTablePage=pages; const paged=rows.slice((tcTablePage-1)*ps,tcTablePage*ps);
    const fmt=v=>v?`<span style="font-family:var(--mono);font-size:12px">${v}</span>`:'<span style="color:var(--text3)">—</span>'; const doc=d=>typeof _tcDocNo==='function'?_tcDocNo(d):('TC-'+(d||'')); const fd=d=>typeof _fmtDateDisp==='function'?_fmtDateDisp(d):fmtDate(d);
    if(!paged.length) tbody.innerHTML='<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text3)">No correction requests found</td></tr>';
    else tbody.innerHTML=paged.map(r=>{ const dk=r.date||r.dateKey||''; const act=actionOwn({...r,id:r.reqId,uid:uid()}); return `<tr data-reqid="${r.reqId||''}"${isRecalled(r.status)?' class="recall-muted"':''}><td><input type="checkbox" class="tc-row-check"></td><td><span style="background:var(--amber-bg);border:1px solid var(--amber);border-radius:4px;padding:2px 8px;font-family:var(--mono);font-size:12px;font-weight:600;color:var(--amber)">${doc(dk)}</span></td><td style="font-size:13px;font-weight:500">${esc(r.employeeName||currentUserData?.name||'—')}</td><td style="font-size:12px;color:var(--text2)">${fd(dk)}</td><td>${fmt(r.manualTimeIn)}</td><td>${fmt(r.manualNoonOut)}</td><td>${fmt(r.manualNoonIn)}</td><td>${fmt(r.manualBreakOut)}</td><td>${fmt(r.manualBreakIn)}</td><td>${fmt(r.manualTimeOut)}</td><td>${statusBadge(r.status||'pending')}</td><td style="text-align:center">${act}</td></tr>`;}).join('');
    const pi=document.getElementById('tc-page-info'); if(pi) pi.textContent=tcTablePage; const rc=document.getElementById('tc-record-count'); if(rc) rc.textContent=`${total} item${total===1?'':'s'} in ${pages} page${pages===1?'':'s'}`;
  };
  const oldRenderApprovals=window.renderApprovals;
  window.renderApprovals=function(list,c){
    if(!c) return; const countEl=document.getElementById('approval-record-count'); if(!list.length){c.innerHTML='<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">No requests found</td></tr>'; if(countEl)countEl.textContent='0 items'; return;}
    c.innerHTML=list.map(r=>{ let actions=''; if(r.status==='pending') actions+=`<button class="btn btn-success btn-xs" onclick='openApproveModal(${JSON.stringify(r)})'>✓ Approve</button> <button class="btn btn-danger btn-xs" onclick='openRejectModal(${JSON.stringify(r)})'>✕ Reject</button>`; if(canRecallStatus(r.status)&&(isApproved(r.status)?isManagerAdmin():isApprover())) actions+=` <button class="btn btn-amber btn-xs" onclick="recallRequest('${r.uid}','${r.reqId}','manager')">↩ Recall</button>`; if(!actions)actions=r.recallReason?`<span style="font-size:10px;color:var(--text2)">${esc(r.recallReason)}</span>`:'<span style="color:var(--text3)">—</span>'; return `<tr${isRecalled(r.status)?' class="recall-muted"':''}><td><span class="badge ${TYPE_BADGE[r.type]||'badge-gray'}" style="font-size:10px">${TYPE_LABELS[r.type]||r.type}</span></td><td><div style="font-weight:600;font-size:12px">${esc(r.employeeName||'Unknown')}</div><div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${esc(r.employeeId||'')}</div></td><td style="color:var(--text2);font-size:11px;white-space:nowrap">${requestDetail(r)}</td><td style="color:var(--text2);max-width:160px;overflow:hidden;text-overflow:ellipsis">${esc(r.reason||r.recallReason||'—')}</td><td style="color:var(--text3);font-size:10px;white-space:nowrap">${r.submittedAt?new Date(r.submittedAt).toLocaleString('en-PH'):'—'}</td><td style="text-align:center">${statusBadge(r.status)}</td><td style="text-align:center"><div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">${actions}</div></td></tr>`;}).join(''); if(countEl)countEl.textContent=`${list.length} item${list.length===1?'':'s'}`;
  };
})();

// ==================== EMPLOYEE DASHBOARD ====================
function initEmployeeDashboard() { loadMyTimesheet(); }

function getDayKey(dateStr) { return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dateStr+'T12:00:00').getDay()]; }
function isRestDayForUser(emp, dateStr) { const restDays = Array.isArray(emp?.restDays) ? emp.restDays : []; return restDays.includes(getDayKey(dateStr)); }
function getEmployeeShiftForDate(emp, dateStr) {
  // Priority: Admin Holiday Setup (global) > date-specific employee schedule/import > configured rest day > employee default work shift.
  // Example globalHolidayShifts['2026-05-06'] = {code:'SH', name:'Special Holiday'} applies to all employees.
  const holiday = globalHolidayShifts?.[dateStr];
  if(holiday?.code) return normalizeShiftCode(holiday.code);
  const scheduled = emp?.shiftSchedule?.[dateStr] || emp?.schedule?.[dateStr] || emp?.dailyShifts?.[dateStr];
  if(scheduled) return normalizeShiftCode(scheduled);
  if(isRestDayForUser(emp, dateStr)) return 'RD';
  return normalizeShiftCode(emp?.shiftCode || DEFAULT_WORK_SHIFT_CODE);
}
function loadMyTimesheet() {
  const uid = currentUserData.uid;
  updateLegacyPeriodControls();
  Promise.all([
    db.ref(`timelogs/${uid}`).once('value'),
    db.ref(`requests/${uid}`).once('value')
  ]).then(([snap, reqSnap]) => {
    const all = snap.val() || {}, byDate = {};
    Object.values(all).forEach(r => { if(r && r.date) byDate[r.date] = r; });
    const reqsByDate = {};
    reqSnap.forEach(c => {
      const req = c.val(); if(!req) return;
      // Assign to req.date if present
      if(req.date) { if(!reqsByDate[req.date]) reqsByDate[req.date]=[]; reqsByDate[req.date].push({id:c.key,...req}); }
      // Expand leave ranges
      if(req.type==='leave' && req.dateFrom && req.dateTo) {
        const from=new Date(req.dateFrom+'T12:00:00'), to=new Date(req.dateTo+'T12:00:00');
        for(let d=new Date(from);d<=to;d.setDate(d.getDate()+1)) {
          const ds=d.toISOString().split('T')[0];
          if(!reqsByDate[ds]) reqsByDate[ds]=[];
          if(!reqsByDate[ds].find(r=>r.id===c.key)) reqsByDate[ds].push({id:c.key,...req});
        }
      }
    });
    let rows = [];
    if(periodStart && periodEnd) {
      const start = new Date(periodStart + 'T12:00:00'), end = new Date(periodEnd + 'T12:00:00');
      for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split('T')[0];
        const row = byDate[ds] || {date:ds,employeeName:currentUserData?.name||'',employeeId:currentUserData?.employeeId||'',department:currentUserData?.department||'',shiftCode:getEmployeeShiftForDate(currentUserData, ds),timeIn:null,noonOut:null,noonIn:null,snackBreakOut:null,snackBreakIn:null,timeOut:null,regularWorkHrs:0,totalWorkHrs:0,excessWorkHrs:0,lateMinutes:0,undertimeMinutes:0,OTHours:0,absence:0,leaveType:'',leaveDays:0,status:'no_record'};
        row._requests = reqsByDate[ds] || [];
        rows.push(row);
      }
    } else { rows = Object.values(byDate); rows.forEach(r=>{r._requests=reqsByDate[r.date]||[];}); }
    rows.forEach(r => { const h = globalHolidayShifts?.[r.date]; if(h?.code && r.status !== 'leave' && !r.shiftChangeApproved) r.shiftCode = normalizeShiftCode(h.code); });
    rows.sort((a,b)=>a.date.localeCompare(b.date)); renderMyTimesheet(rows);
  });
}
function legacyDateShort(dateStr) { if(!dateStr) return '—'; const d=new Date(dateStr+'T12:00:00'); const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]; return `${day} ${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`; }
function legacyTime(ts) { if(!ts) return ''; const d=new Date(ts); return d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}); }
function num2(v) { return (Number(v || 0)).toFixed(2); }
function getLegacyPageSize() { return parseInt(document.getElementById('legacy-page-size')?.value || PAGE_SIZE || 50, 10); }
function updateLegacyPeriodControls() { const ps=document.getElementById('period-start'); if(ps) ps.value=periodStart||''; const pe=document.getElementById('period-end'); if(pe) pe.value=periodEnd||''; const pa=document.getElementById('period-apply'); if(pa) pa.value=periodApply||''; }
function syncAllPeriodControls() { updateLegacyPeriodControls(); }
function toISODateOnly(d) { const x=new Date(d); x.setHours(12,0,0,0); return x.toISOString().split('T')[0]; }
function buildRange(startDate,endDate) { const applyDate=new Date(endDate); applyDate.setDate(applyDate.getDate()+5); return {start:toISODateOnly(startDate),end:toISODateOnly(endDate),apply:toISODateOnly(applyDate)}; }
function getCurrentCutoffRange(baseDate=new Date()) { const today=new Date(baseDate); today.setHours(12,0,0,0); const y=today.getFullYear(),m=today.getMonth(),day=today.getDate(); if(day>=6&&day<=20) return buildRange(new Date(y,m,6,12),new Date(y,m,20,12)); if(day>=21) return buildRange(new Date(y,m,21,12),new Date(y,m+1,5,12)); return buildRange(new Date(y,m-1,21,12),new Date(y,m,5,12)); }
function getLegacyPresetRange(preset) { const today=new Date(); today.setHours(12,0,0,0); const d=new Date(today); const startOfWeek=(base)=>{const x=new Date(base); const diff=(x.getDay()+6)%7; x.setDate(x.getDate()-diff); x.setHours(12,0,0,0); return x;}; const endOfWeek=(base)=>{const x=startOfWeek(base); x.setDate(x.getDate()+6); return x;};
 if(preset==='today') return buildRange(today,today); if(preset==='yesterday'){d.setDate(d.getDate()-1);return buildRange(d,d);} if(preset==='tomorrow'){d.setDate(d.getDate()+1);return buildRange(d,d);} if(preset==='thisWeek') return buildRange(startOfWeek(today),endOfWeek(today)); if(preset==='lastWeek'){d.setDate(d.getDate()-7);return buildRange(startOfWeek(d),endOfWeek(d));} if(preset==='nextWeek'){d.setDate(d.getDate()+7);return buildRange(startOfWeek(d),endOfWeek(d));}
 if(preset==='thisMonth') return buildRange(new Date(today.getFullYear(),today.getMonth(),1,12),new Date(today.getFullYear(),today.getMonth()+1,0,12)); if(preset==='lastMonth') return buildRange(new Date(today.getFullYear(),today.getMonth()-1,1,12),new Date(today.getFullYear(),today.getMonth(),0,12)); if(preset==='nextMonth') return buildRange(new Date(today.getFullYear(),today.getMonth()+1,1,12),new Date(today.getFullYear(),today.getMonth()+2,0,12));
 if(preset==='thisYear') return buildRange(new Date(today.getFullYear(),0,1,12),new Date(today.getFullYear(),11,31,12)); if(preset==='lastYear') return buildRange(new Date(today.getFullYear()-1,0,1,12),new Date(today.getFullYear()-1,11,31,12)); if(preset==='nextYear') return buildRange(new Date(today.getFullYear()+1,0,1,12),new Date(today.getFullYear()+1,11,31,12));
 const current=getCurrentCutoffRange(today); if(preset==='current') return current; if(preset==='lastCutoff'||preset==='nextCutoff'){const curStart=new Date(current.start+'T12:00:00'); const y=curStart.getFullYear(),m=curStart.getMonth(),day=curStart.getDate(); if(preset==='lastCutoff'){ if(day===6) return buildRange(new Date(y,m-1,21,12),new Date(y,m,5,12)); return buildRange(new Date(y,m,6,12),new Date(y,m,20,12)); } if(day===6) return buildRange(new Date(y,m,21,12),new Date(y,m+1,5,12)); return buildRange(new Date(y,m+1,6,12),new Date(y,m+1,20,12));} return null; }
function saveLegacyTimesheetPeriod(skipPresetApply=false) { const preset=document.getElementById('legacy-period-preset')?.value || 'current'; if(!skipPresetApply && preset !== 'custom') { const range=getLegacyPresetRange(preset); if(range){periodStart=range.start;periodEnd=range.end;periodApply=range.apply;} } else { periodStart=document.getElementById('period-start').value; periodEnd=document.getElementById('period-end').value; periodApply=document.getElementById('period-apply').value; } syncAllPeriodControls(); myTsPage=1; toast('Period saved'); if(currentUserData?.role==='manager'){loadAllTimesheets();loadReports();} else loadMyTimesheet(); }
function applyLegacyPeriodPreset() { const preset=document.getElementById('legacy-period-preset').value; if(preset==='custom') return; const range=getLegacyPresetRange(preset); if(!range) return; periodStart=range.start; periodEnd=range.end; periodApply=range.apply; syncAllPeriodControls(); saveLegacyTimesheetPeriod(true); }
let myLastTimesheetRows = [];
function goMyTimesheetPage(p) { const size=getLegacyPageSize(); const pages=Math.max(1,Math.ceil((myLastTimesheetRows.length||0)/size)); myTsPage=Math.min(Math.max(1,p),pages); renderMyTimesheet(myLastTimesheetRows); }
function printMyTimesheet() { window.print(); }
// ===== STATUS COLOR CODING HELPERS =====
function getReqStatusClass(req) {
  const s = (req.status||'').toLowerCase();
  const wf = (req.workflowStage||'').toLowerCase();
  if(s==='cancelled') return 'cancel';
  if(s==='pending') return wf==='final'?'pendf':'pend1';
  if(s==='approved_1'||(s==='approved'&&wf==='first')) return 'appr1';
  if(s==='rejected_1'||(s==='rejected'&&wf==='first')||(s==='disapproved'&&wf==='first')) return 'disap1';
  if(s==='approved') return 'apprf';
  if(s==='rejected'||s==='disapproved') return 'disapf';
  return 'pend1';
}
function getReqTypeShort(type) {
  return {time_correction:'TC',shift_change:'SC',leave:'LV',overtime:'OT',undertime:'UT'}[type]||'RQ';
}
function getDominantRowClass(reqs) {
  if(!reqs||!reqs.length) return '';
  const priority = ['apprf','disapf','appr1','disap1','pendf','pend1','cancel'];
  const classes = reqs.map(r=>getReqStatusClass(r));
  for(const p of priority){ if(classes.includes(p)) return 'ts-row-'+p; }
  return '';
}
function buildReqTags(reqs) {
  if(!reqs||!reqs.length) return '';
  return reqs.map(req=>{
    const cls=getReqStatusClass(req);
    const short=getReqTypeShort(req.type);
    return '<span class="req-tag req-tag-'+cls+'" title="'+( req.type||'').replace(/_/g,' ')+' \u2014 '+(req.status||'')+'">'+short+'</span>';
  }).join('');
}

function renderMyTimesheet(rows) {
  rows=(rows||[]).map(r=>applyPayrollRulesToRow(r));
  myLastTimesheetRows=rows;
  updateLegacyPeriodControls();
  // Populate enhanced header
  const empNo=currentUserData?.employeeId||''; const empName=currentUserData?.name||'Employee';
  const idEl=document.getElementById('ts-emp-id-label'); if(idEl) idEl.textContent=empNo;
  const nameEl=document.getElementById('ts-emp-name-label'); if(nameEl) nameEl.textContent=empName;
  const periodEl=document.getElementById('ts-period-badge'); if(periodEl) periodEl.textContent=fmtDate(periodStart)+' – '+fmtDate(periodEnd);
  // Legacy title compat
  const title=document.getElementById('legacy-timesheet-title');
  if(title){ title.innerHTML='<b>'+empNo+': '+empName+'</b> &nbsp; '+fmtDate(periodStart)+' - '+fmtDate(periodEnd); }
  const tbody=document.getElementById('my-timesheet-body');
  if(!rows.length){tbody.innerHTML='<tr><td colspan="19" style="text-align:center;padding:40px;color:var(--text3)">No records found</td></tr>'; const rc=document.getElementById('legacy-record-count'); if(rc) rc.textContent='0 items'; return;}
  let regTotal=0,totalHrs=0,excessTotal=0,lateTotal=0,utTotal=0,otTotal=0,absTotal=0,leaveDaysTotal=0;
  rows.forEach(r=>{regTotal+=Number(r.regularWorkHrs||0); totalHrs+=Number(r.totalWorkHrs||0); excessTotal+=Number(r.excessWorkHrs??r.OTHours??0); lateTotal+=Number(r.lateMinutes||0); utTotal+=Number(r.undertimeMinutes||0); otTotal+=Number(r.OTHours||0); absTotal+=r.status==='absent'?1:Number(r.absence||0); leaveDaysTotal+=Number(r.leaveDays||0);});
  // Update summary stats bar
  const setStat=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
  setStat('ts-stat-reg',regTotal.toFixed(2));
  setStat('ts-stat-total',totalHrs.toFixed(2));
  setStat('ts-stat-ot',otTotal.toFixed(2));
  setStat('ts-stat-late',lateTotal.toFixed(0));
  setStat('ts-stat-ut',utTotal.toFixed(0));
  setStat('ts-stat-abs',absTotal.toFixed(2));
  setStat('ts-stat-lv',leaveDaysTotal.toFixed(2));
  setStat('ts-stat-days',rows.length);
  const size=getLegacyPageSize(); const pages=Math.max(1,Math.ceil(rows.length/size)); if(myTsPage>pages) myTsPage=pages; const start=(myTsPage-1)*size, paged=rows.slice(start,start+size);
  const bodyHtml=paged.map(r=>{
    const isRest=(r.shiftCode||'').toUpperCase()==='RD';
    const dayBox=isRest?'N':'W';
    const dateObj=new Date(r.date+'T12:00:00');
    const isWeekend=dateObj.getDay()===0||dateObj.getDay()===6;
    const dateStyle=isRest?'color:var(--text3)':isWeekend?'color:var(--amber);font-weight:600':'color:var(--text2)';
    const absence=r.status==='absent'?'1.00':num2(r.absence||0);
    const leaveType=r.leaveType||''; const leaveDays=r.leaveDays?num2(r.leaveDays):'0.00';
    const reqs=r._requests||[];
    let app='';
    if(leaveType==='VL') app='<span class="ts-app ts-app-vl">VL</span>';
    else if(leaveType) app='<span class="ts-app ts-app-yellow">'+leaveType+'</span>';
    else if(r.corrected) app='<span class="ts-app ts-app-yellow">CS</span>';
    if(r.shiftChangeApproved) app+='<span class="req-tag req-tag-apprf" title="Shift Change Approved">SC</span>';
    app+=buildReqTags(reqs.filter(rq=>!(r.shiftChangeApproved&&rq.type==='shift_change'&&rq.status==='approved')));
    const rowClass=getDominantRowClass(reqs);
    const nz=v=>Number(v||0)>0?'ts-num nonzero':'ts-num';
    const timeCell=v=>v?`<span class="ts-time">${legacyTime(v)}</span>`:'';
    return '<tr class="'+rowClass+(isRest?' ts-restday':'')+'"><td class="ts-center"><span class="ts-daybox ts-daybox-'+dayBox+'">'+dayBox+'</span></td><td><span style="font-size:12px;'+dateStyle+'">'+legacyDateShort(r.date)+'</span></td><td class="ts-center"><span class="ts-shift">'+(r.shiftCode||'')+'</span></td><td class="ts-center">'+timeCell(r.timeIn)+'</td><td class="ts-center">'+timeCell(r.noonOut)+'</td><td class="ts-center">'+timeCell(r.noonIn)+'</td><td class="ts-center">'+timeCell(r.snackBreakOut)+'</td><td class="ts-center">'+timeCell(r.snackBreakIn)+'</td><td class="ts-center">'+timeCell(r.timeOut)+'</td><td class="'+nz(r.regularWorkHrs)+'">'+num2(r.regularWorkHrs)+'</td><td class="'+nz(r.totalWorkHrs)+'">'+num2(r.totalWorkHrs)+'</td><td class="'+nz(r.excessWorkHrs??r.OTHours)+'">'+num2(r.excessWorkHrs??r.OTHours)+'</td><td class="'+nz(r.lateMinutes)+'">'+Number(r.lateMinutes||0).toFixed(2)+'</td><td class="'+nz(r.undertimeMinutes)+'">'+Number(r.undertimeMinutes||0).toFixed(2)+'</td><td class="'+nz(r.OTHours)+'">'+num2(r.OTHours)+'</td><td class="ts-num">'+absence+'</td><td style="font-size:11px;color:var(--text2)">'+leaveType+'</td><td class="ts-num">'+leaveDays+'</td><td class="ts-center" style="min-width:64px">'+app+'</td></tr>';
  }).join('');
  const totalRow='<tr class="legacy-total-row ts-total-row"><td colspan="9"></td><td class="ts-num">'+num2(regTotal)+'</td><td class="ts-num">'+num2(totalHrs)+'</td><td class="ts-num">'+num2(excessTotal)+'</td><td class="ts-num">'+lateTotal.toFixed(2)+'</td><td class="ts-num">'+utTotal.toFixed(2)+'</td><td class="ts-num">'+otTotal.toFixed(2)+'</td><td class="ts-num">'+num2(absTotal)+'</td><td></td><td class="ts-num">'+num2(leaveDaysTotal)+'</td><td></td></tr>';
  tbody.innerHTML=bodyHtml+totalRow;
  const cp=document.getElementById('legacy-current-page'); if(cp) cp.textContent=myTsPage;
  const tp=document.getElementById('legacy-total-pages'); if(tp) tp.textContent='/ '+pages;
  const rc=document.getElementById('legacy-record-count'); if(rc) rc.textContent=rows.length+' items in '+pages+' page'+(pages>1?'s':'');
}
// Store pagination callbacks globally so onclick strings can reference them safely
window.__pgCallbacks = window.__pgCallbacks || {};
function renderPagination(containerId, total, current, onPage) {
  const pages = Math.ceil(total/PAGE_SIZE);
  const c = document.getElementById(containerId);
  if(!c||pages<=1){if(c)c.innerHTML='';return;}
  // Store the callback by containerId so onclick can call it without closure issues
  window.__pgCallbacks[containerId] = onPage;
  const cb = `window.__pgCallbacks['${containerId}']`;
  let html = `<button class="pg-btn" onclick="${cb}(${current-1})" ${current===1?'disabled':''}>‹</button>`;
  for(let i=1;i<=pages;i++) html+=`<button class="pg-btn ${i===current?'active':''}" onclick="${cb}(${i})">${i}</button>`;
  html += `<button class="pg-btn" onclick="${cb}(${current+1})" ${current===pages?'disabled':''}>›</button>`;
  c.innerHTML = html;
}

// ==================== MY QR ====================
function initMyQR() {
  const u = currentUserData;
  document.getElementById('qr-emp-name').textContent = u.name;
  document.getElementById('qr-emp-id').textContent = `ID: ${u.employeeId}`;
  document.getElementById('qr-dept').textContent = u.department;
  document.getElementById('my-shift-display').textContent = u.shiftCode;
  document.getElementById('my-dept-display').textContent = u.department;
  document.getElementById('my-empid-display').textContent = u.employeeId;
  document.getElementById('vl-balance').textContent = u.leaveBalances?.VL ?? '—';
  document.getElementById('ml-balance').textContent = u.leaveBalances?.ML ?? '—';
  const qrDiv = document.getElementById('my-qr-code');
  qrDiv.innerHTML = '';
  new QRCode(qrDiv, { text: u.uid, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.H });
}

function downloadQR() {
  const canvas = document.querySelector('#my-qr-code canvas');
  if(!canvas){toast('QR not ready yet','amber');return;}
  const a = document.createElement('a');
  a.download = `QR_${currentUserData.employeeId}.png`;
  a.href = canvas.toDataURL();
  a.click();
  toast('QR downloaded');
}

// ==================== REQUESTS ====================
function loadMyRequests(type, containerId) {
  const uid = currentUserData.uid;
  db.ref(`requests/${uid}`).orderByChild('type').equalTo(type).once('value').then(snap => {
    const list = [];
    snap.forEach(c=>list.push({id:c.key,...c.val()}));
    list.sort((a,b)=>b.submittedAt-a.submittedAt);
    renderRequestList(list, containerId);
  });
}


function clearShiftChangeLegacyForm() {
 const d=document.getElementById('sc-date'); const r=document.getElementById('sc-reason'); const s=document.getElementById('sc-shift');
 if(d) d.value=''; if(r) r.value=''; if(s) s.selectedIndex=0;
 updateCosShiftPreview();
}
function updateCosShiftPreview() {
 const s=document.getElementById('sc-shift'); const p=document.getElementById('cos-preview-text');
 if(s&&p) p.textContent = s.options[s.selectedIndex]?.text || '';
}
function shiftChangeDocumentNo(r) {
 const raw = String(r.id || r.reqId || r.submittedAt || Date.now()).replace(/[^0-9]/g,'');
 if(raw.length >= 9) return raw.slice(-9);
 let h = 0, src = String(r.id || r.reqId || r.submittedAt || '0');
 for(let i=0;i<src.length;i++) h = ((h*31) + src.charCodeAt(i)) >>> 0;
 return String(250000000 + (h % 90000000));
}
function renderShiftChangeLegacyList(list, containerId) {
 window.scLastShiftChangeList = list || [];
 const c = document.getElementById(containerId); if(!c) return;
 const statusFilter = document.getElementById('sc-status-filter')?.value || '';
 const q = (document.getElementById('sc-search')?.value || '').toLowerCase().trim();
 let rows = (list || []).filter(r => !statusFilter || r.status === statusFilter);
 if(q) rows = rows.filter(r => [shiftChangeDocumentNo(r), r.reason, r.requestedShift, r.date, r.status].join(' ').toLowerCase().includes(q));
 rows.sort((a,b)=>(b.submittedAt||0)-(a.submittedAt||0));
 // Color map for status badges (handled via CSS classes now)
 const statusLabels = {pending:'Pending',approved:'Approved',rejected:'Disapproved',cancelled:'Cancelled'};
 c.innerHTML = !rows.length ? '<tr><td colspan="6" style="text-align:center;padding:28px;color:#555">No records found</td></tr>' :
   rows.map(r => {
     const stLabel = statusLabels[r.status] || r.status || '';
     const statusBadgeClass = {pending:'badge-pend1',approved:'badge-apprf',rejected:'badge-disapf',cancelled:'badge-cancel'}[r.status] || 'badge-gray';
     const statusDotStyle = {pending:'background:var(--st-pend1)',approved:'background:#00C853',rejected:'background:var(--st-disapf)',cancelled:'background:var(--st-cancel)'}[r.status] || 'background:var(--text3)';
     return '<tr><td><input type="checkbox" class="cos-check"></td><td><span class="cos-doc-chip">'+shiftChangeDocumentNo(r)+'</span></td><td style="color:var(--text2);max-width:160px;overflow:hidden;text-overflow:ellipsis">'+(r.reason||'<span style="color:var(--text3)">—</span>')+'</td><td style="font-family:var(--mono);color:var(--accent);font-size:12px">'+(r.requestedShift||'')+'</td><td style="color:var(--text2)">'+(r.date?new Date(r.date+'T12:00:00').toLocaleDateString('en-US'):'')+'</td><td><span class="cos-status badge '+statusBadgeClass+'"><span class="cos-status-dot" style="'+statusDotStyle+'"></span>'+stLabel+'</span></td></tr>';
   }).join('');
 const rc = document.getElementById('sc-record-count'); if(rc) rc.textContent = `${rows.length} item${rows.length===1?'':'s'} in 1 pages`;
}
function exportShiftChangeCSV() {
 const rows = window.scLastShiftChangeList || []; if(!rows.length){ toast('No records to export', 'amber'); return; }
 const csvRows = [['Document','Remarks','New Shift','Shift Date','Status']];
 rows.forEach(r => csvRows.push([shiftChangeDocumentNo(r), r.reason || '', r.requestedShift || '', r.date || '', r.status || '']));
 const csv = csvRows.map(row => row.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
 const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}); const a = document.createElement('a');
 a.href = URL.createObjectURL(blob); a.download = 'change_of_shift_records.csv'; a.click(); URL.revokeObjectURL(a.href); toast('Change of Shift CSV exported');
}

function renderRequestList(list, containerId) {
  if(containerId === 'sc-list') { renderShiftChangeLegacyList(list, containerId); return; }
  const c = document.getElementById(containerId);
  if(!c) return;

  // Status helpers
  const statusLabels = {
    pend1:'Pending', appr1:'Approved', disap1:'Disapproved (1st)',
    pendf:'Pending',    apprf:'Approved',     disapf:'Rejected', cancel:'Cancelled'
  };
  const badgeColors = {
    pend1:'background:#F59E0B;color:#000',  appr1:'background:#7ED321;color:#000',
    disap1:'background:#8B0000;color:#fff', pendf:'background:#E6E600;color:#000',
    apprf:'background:#006400;color:#fff',  disapf:'background:#FF3300;color:#fff',
    cancel:'background:#FF8FAB;color:#000'
  };
  const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('en-US') : '—';

  if(!list.length){
    const cols = containerId==='ut-list'?4:6;
    c.innerHTML=`<tr><td colspan="${cols}" style="text-align:center;padding:36px;color:var(--text3)">No records yet</td></tr>`;
    return;
  }

  // Build table rows depending on type
  const rows = list.map(r => {
    const cls = getReqStatusClass(r);
    const badge = `<span style="display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;${badgeColors[cls]||'background:#555;color:#fff'}">${statusLabels[cls]||r.status}</span>`;
    const remarkCell = `<td style="color:var(--text2);max-width:180px;overflow:hidden;text-overflow:ellipsis">${r.reason||'<span style="color:var(--text3)">—</span>'}</td>`;
    const borderColor = {pend1:'#F59E0B',appr1:'#7ED321',disap1:'#8B0000',pendf:'#E6E600',apprf:'#006400',disapf:'#FF3300',cancel:'#FF8FAB'}[cls]||'#ccc';

    if(containerId === 'lv-list') {
      return `<tr style="border-left:3px solid ${borderColor}">
        <td style="font-family:var(--mono);font-size:11px;color:var(--accent);font-weight:600">${r.leaveType||'—'}</td>
        <td style="color:var(--text2)">${fmtDate(r.dateFrom)}</td>
        <td style="color:var(--text2)">${fmtDate(r.dateTo)}</td>
        <td style="text-align:center;font-family:var(--mono);font-weight:600">${r.days||0}</td>
        ${remarkCell}
        <td style="text-align:center">${badge}</td>
      </tr>`;
    }
    if(containerId === 'ot-list') {
      return `<tr style="border-left:3px solid ${borderColor}">
        <td style="color:var(--text2)">${fmtDate(r.date)}</td>
        <td style="text-align:center;font-family:var(--mono)">${r.startTime||'—'}</td>
        <td style="text-align:center;font-family:var(--mono)">${r.endTime||'—'}</td>
        <td style="text-align:center;font-family:var(--mono);font-weight:600;color:var(--accent)">${r.hours||0}hrs</td>
        ${remarkCell}
        <td style="text-align:center">${badge}</td>
      </tr>`;
    }
    if(containerId === 'ut-list') {
      return `<tr style="border-left:3px solid ${borderColor}">
        <td style="color:var(--text2)">${fmtDate(r.date)}</td>
        <td style="text-align:center;font-family:var(--mono)">${r.timeLeftEarly||'—'}</td>
        ${remarkCell}
        <td style="text-align:center">${badge}</td>
      </tr>`;
    }
    return '';
  }).join('');

  c.innerHTML = rows;

  // Update record count footer
  const countId = containerId.replace('-list','-record-count');
  const countEl = document.getElementById(countId);
  if(countEl) countEl.textContent = `${list.length} item${list.length===1?'':'s'}`;
}

// ==================== APPROVER ASSIGNMENT ====================
let _cachedApprovers = null;

async function loadApproverOptions(selectId, selectedUid = '') {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">— Loading… —</option>';
  try {
    if (!_cachedApprovers) {
      const idToken = await auth.currentUser.getIdToken();
      const resp = await fetch(`${firebaseConfig.databaseURL}/users.json?shallow=true&auth=${idToken}`);
      const shallow = await resp.json();
      const uids = Object.keys(shallow || {});
      const snaps = await Promise.all(uids.map(u => db.ref(`users/${u}`).once('value')));
      _cachedApprovers = snaps
        .filter(s => s.exists())
        .map(s => ({ uid: s.key, ...s.val() }))
        .filter(u => !u.deleted && u.active !== false && ['admin','manager','supervisor'].includes(u.role))
        .sort((a,b) => (a.name||'').localeCompare(b.name||''));
    }
    sel.innerHTML = '<option value="">— No approver assigned —</option>';
    _cachedApprovers.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.uid;
      opt.textContent = `${u.name || u.email} (${({admin:'Admin',manager:'Manager',supervisor:'Supervisor'}[u.role]||u.role)})`;
      if (u.uid === selectedUid) opt.selected = true;
      sel.appendChild(opt);
    });
    onApproverSelectChange(selectId.replace('-approver-uid',''));
  } catch(e) {
    sel.innerHTML = '<option value="">— Could not load approvers —</option>';
    console.warn('loadApproverOptions failed:', e.message);
  }
}

function onApproverSelectChange(prefix) {
  const sel  = document.getElementById(`${prefix}-approver-uid`);
  const prev = document.getElementById(`${prefix}-approver-preview`);
  if (!sel || !prev) return;
  const uid = sel.value;
  if (!uid) { prev.style.display = 'none'; return; }
  const a = (_cachedApprovers||[]).find(x => x.uid === uid);
  if (a) {
    const roleLabel = {admin:'Admin',manager:'Manager',supervisor:'Supervisor'}[a.role]||a.role;
    prev.style.display = '';
    prev.innerHTML = `<b>✓ Approver:</b> ${a.name||a.email} &nbsp;·&nbsp; <span style="opacity:.75">${roleLabel}${a.department?' · '+a.department:''}</span>`;
  } else { prev.style.display = 'none'; }
}

function invalidateApproverCache() { _cachedApprovers = null; }

async function submitRequest(type, data, listId) {
  const uid = currentUserData.uid;
  const id = genId();
  const approverId   = currentUserData.approverId   || '';
  const approverName = currentUserData.approverName || '';
  const payload = {
    type, uid,
    employeeName: currentUserData.name,
    employeeId: currentUserData.employeeId,
    submittedAt: Date.now(),
    status: 'pending',
    workflowStage: 'first',
    ...(approverId   ? { approverId }   : {}),
    ...(approverName ? { approverName } : {}),
    ...data
  };
  try {
    await db.ref(`requests/${uid}/${id}`).set(payload);
    toast('Request submitted successfully');
    loadMyRequests(type, listId);
    if(type==='leave') updateApprovalBadge();
  } catch(e) { toast('Failed: '+e.message,'red'); }
}

// ========= ENHANCED TIME CORRECTION =========
let tcTablePage = 1;
let tcAllRecords = [];   // submitted TC requests only
let tcFormVisible = true;
let tcSelectedDateKey = null;

/* ── helpers ── */
function _tsToHHMM(ts) {
  if (!ts) return '';
  const dt = new Date(ts);
  return String(dt.getHours()).padStart(2,'0') + ':' + String(dt.getMinutes()).padStart(2,'0');
}
function _tsToDisplay(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true});
}
function _fmtDateDisp(d) {
  if (!d) return '—';
  return new Date(d+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
}
function _tcDocNo(dateKey) {
  const raw = String(dateKey||'').replace(/-/g,'') + String(currentUserData?.employeeId||'').slice(-4);
  let h = 0;
  for(let i=0;i<raw.length;i++) h=((h*31)+raw.charCodeAt(i))>>>0;
  return String(2000000000 + (h % 265893321)).slice(1,11);
}

/* ── toggle form open/close ── */
function toggleTCForm() {
  tcFormVisible = !tcFormVisible;
  const body = document.getElementById('tc-app-form-card');
  const icon = document.getElementById('tc-form-toggle-icon');
  if (body) body.style.display = tcFormVisible ? 'flex' : 'none';
  if (icon) icon.textContent = tcFormVisible ? '▼' : '▶';
}

/* ── clear / reset form ── */
function clearTCForm() {
  ['tc-date','tc-timein','tc-noon-out','tc-noon-in','tc-break-out','tc-break-in','tc-timeout','tc-reason'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  const st=document.getElementById('tc-date-status'); if(st) st.innerHTML='';
  tcSelectedDateKey = null;
  document.querySelectorAll('#tc-table-body tr.tc-row-selected').forEach(tr=>tr.classList.remove('tc-row-selected'));
}

/* ── called when user changes the Shift Date in the form ──
   Looks up the TIMESHEET (timelogs) for that date and pre-fills the form fields.
   The table below is NOT affected — it only shows submitted TC requests. ── */
async function onTCDateChange() {
  const date = document.getElementById('tc-date').value;
  const statusEl = document.getElementById('tc-date-status');
  if (!date || !currentUser) { if(statusEl) statusEl.innerHTML=''; return; }

  statusEl.innerHTML = '<span class="spinner" style="width:14px;height:14px"></span> Checking timesheet...';

  try {
    const snap = await db.ref(`timelogs/${currentUser.uid}/${date}`).once('value');
    const d = snap.val();

    if (d && (d.timeIn || d.timeOut || d.noonOut || d.noonIn || d.snackBreakOut || d.snackBreakIn)) {
      // Pre-fill from captured timesheet data
      const set = (id, val) => { const el=document.getElementById(id); if(el) el.value=val||''; };
      set('tc-timein',    _tsToHHMM(d.timeIn));
      set('tc-noon-out',  _tsToHHMM(d.noonOut));
      set('tc-noon-in',   _tsToHHMM(d.noonIn));
      set('tc-break-out', _tsToHHMM(d.snackBreakOut));
      set('tc-break-in',  _tsToHHMM(d.snackBreakIn));
      set('tc-timeout',   _tsToHHMM(d.timeOut));
      statusEl.innerHTML = '<span style="color:var(--green);font-weight:600">✔ Timesheet data loaded — edit to correct, then Submit</span>';
    } else {
      // No captured time — blank for manual TLC
      ['tc-timein','tc-noon-out','tc-noon-in','tc-break-out','tc-break-in','tc-timeout'].forEach(id=>{
        const el=document.getElementById(id); if(el) el.value='';
      });
      statusEl.innerHTML = '<span style="color:var(--amber);font-weight:500">⚠ No captured time for this date — enter manually (manual TLC)</span>';
    }
    tcSelectedDateKey = date;
    if (!tcFormVisible) toggleTCForm();
  } catch(e) {
    statusEl.innerHTML = '<span style="color:var(--red)">Error loading timesheet data</span>';
  }
}

/* ── submit ── */
function submitTimeCorrectionEnhanced() {
  const date   = document.getElementById('tc-date').value;
  const ti     = document.getElementById('tc-timein').value;
  const to     = document.getElementById('tc-timeout').value;
  const nOut   = document.getElementById('tc-noon-out').value;
  const nIn    = document.getElementById('tc-noon-in').value;
  const bOut   = document.getElementById('tc-break-out').value;
  const bIn    = document.getElementById('tc-break-in').value;
  const reason = document.getElementById('tc-reason').value.trim();

  if (!date)      { toast('Select a shift date','amber'); return; }
  if (!ti && !to) { toast('Enter at least Time In or Time Out','amber'); return; }
  if (!reason)    { toast('Please provide a reason / remarks','amber'); return; }

  submitRequest('time_correction', {
    date,
    manualTimeIn:   ti,
    manualTimeOut:  to,
    manualNoonOut:  nOut,
    manualNoonIn:   nIn,
    manualBreakOut: bOut,
    manualBreakIn:  bIn,
    reason
  }, 'tc-list-dummy');

  clearTCForm();
  // Refresh the submitted TC requests table
  setTimeout(loadTCTableRecords, 800);
}

function submitTimeCorrection() { submitTimeCorrectionEnhanced(); }

/* ── load ONLY submitted TC requests into the table ── */
function loadTCTableRecords() {
  if (!currentUser) return;
  const tbody = document.getElementById('tc-table-body');
  if (tbody) tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--text3)"><span class="spinner"></span> Loading...</td></tr>';

  db.ref(`requests/${currentUser.uid}`).orderByChild('type').equalTo('time_correction').once('value').then(snap => {
    const records = [];
    snap.forEach(rSnap => {
      const d = rSnap.val();
      if (d) records.push({ reqId: rSnap.key, dateKey: d.date, ...d });
    });
    records.sort((a,b) => (b.submittedAt||0) - (a.submittedAt||0));
    tcAllRecords = records;
    tcTablePage = 1;
    renderTCTable();
  }).catch(()=>{
    if(tbody) tbody.innerHTML='<tr><td colspan="11" style="text-align:center;padding:24px;color:var(--red)">Failed to load</td></tr>';
  });
}

/* ── render submitted TC requests table ── */
function renderTCTable() {
  const tbody = document.getElementById('tc-table-body');
  if (!tbody) return;

  const filterVal = document.getElementById('tc-filter')?.value || 'all';
  const q         = (document.getElementById('tc-search')?.value || '').toLowerCase().trim();
  const pageSize  = parseInt(document.getElementById('tc-page-size')?.value || '10');

  let rows = tcAllRecords.slice();

  // Filter by status
  if (filterVal === 'pending')  rows = rows.filter(r => r.status === 'pending');
  if (filterVal === 'approved') rows = rows.filter(r => r.status === 'approved');
  if (filterVal === 'rejected') rows = rows.filter(r => r.status === 'rejected');

  // Search
  if (q) rows = rows.filter(r =>
    (r.dateKey||r.date||'').includes(q) ||
    (r.employeeName||'').toLowerCase().includes(q) ||
    (r.reason||'').toLowerCase().includes(q)
  );

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (tcTablePage > pages) tcTablePage = pages;
  const paged = rows.slice((tcTablePage-1)*pageSize, tcTablePage*pageSize);

  // Status badge
  const statusBadge = r => {
    const s = r.status || 'pending';
    const map = {
      pending:  '<span class="badge badge-pend1"  style="font-size:10px">Pending</span>',
      approved: '<span class="badge badge-apprf"  style="font-size:10px">Approved</span>',
      rejected: '<span class="badge badge-disapf" style="font-size:10px">Disapproved</span>',
      cancelled:'<span class="badge badge-cancel" style="font-size:10px">Cancelled</span>',
    };
    return map[s] || `<span class="badge badge-gray" style="font-size:10px">${s}</span>`;
  };

  // Time display from manual fields (these are HH:MM strings from the form)
  const fmtManual = v => v ? `<span style="font-family:var(--mono);font-size:12px">${v}</span>` : '<span style="color:var(--text3)">—</span>';

  if (!paged.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:40px;color:var(--text3)">
      <div style="font-size:32px;margin-bottom:8px">📋</div>
      <div style="font-weight:500;margin-bottom:4px">No correction requests yet</div>
      <div style="font-size:12px">Select a date above and submit a correction to see it here</div>
    </td></tr>`;
  } else {
    tbody.innerHTML = paged.map(r => {
      const dateKey = r.date || r.dateKey || '';
      const docNum = _tcDocNo(dateKey);
      return `<tr data-reqid="${r.reqId||''}" style="cursor:default">
        <td onclick="event.stopPropagation()"><input type="checkbox" class="tc-row-check"></td>
        <td><span style="background:var(--amber-bg);border:1px solid var(--amber);border-radius:4px;padding:2px 8px;font-family:var(--mono);font-size:12px;font-weight:600;color:var(--amber)">${docNum}</span></td>
        <td style="font-size:13px;font-weight:500">${r.employeeName||currentUserData?.name||'—'}</td>
        <td style="font-size:12px;color:var(--text2)">${_fmtDateDisp(dateKey)}</td>
        <td>${fmtManual(r.manualTimeIn)}</td>
        <td>${fmtManual(r.manualNoonOut)}</td>
        <td>${fmtManual(r.manualNoonIn)}</td>
        <td>${fmtManual(r.manualBreakOut)}</td>
        <td>${fmtManual(r.manualBreakIn)}</td>
        <td>${fmtManual(r.manualTimeOut)}</td>
        <td>${statusBadge(r)}</td>
      </tr>`;
    }).join('');
  }

  const pi = document.getElementById('tc-page-info'); if(pi) pi.textContent = tcTablePage;
  const rc = document.getElementById('tc-record-count');
  if(rc) rc.textContent = `${total} item${total===1?'':'s'} in ${pages} page${pages===1?'':'s'}`;
}

function toggleAllTCChecks(cb) {
  document.querySelectorAll('.tc-row-check').forEach(c => c.checked = cb.checked);
}

function exportTCCSV() {
  if (!tcAllRecords.length) { toast('No records to export','amber'); return; }
  const header = 'Shift Date,Employee,Time In,Noon Out,Noon In,Break Out,Break In,Time Out,Status,Reason';
  const rows = tcAllRecords.map(r=>[
    r.date||r.dateKey||'', r.employeeName||currentUserData?.name||'',
    r.manualTimeIn||'', r.manualNoonOut||'', r.manualNoonIn||'',
    r.manualBreakOut||'', r.manualBreakIn||'', r.manualTimeOut||'',
    r.status||'', r.reason||''
  ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  downloadCSV([header,...rows].join('\n'),'time_corrections.csv');
}

function submitShiftChange() {
  const date=document.getElementById('sc-date').value;
  const shift=document.getElementById('sc-shift').value;
  const reason=document.getElementById('sc-reason').value.trim();
  if(!date||!reason){toast('Please fill all fields','amber');return;}
  submitRequest('shift_change',{date,requestedShift:shift,reason},'sc-list');
  document.getElementById('sc-date').value='';document.getElementById('sc-reason').value='';
}

function calcLeaveDays() {
  const from = document.getElementById('lv-from').value;
  const to   = document.getElementById('lv-to').value;
  const daysEl      = document.getElementById('lv-days');
  const breakdownEl = document.getElementById('lv-breakdown');
  const listEl      = document.getElementById('lv-breakdown-list');
  const summaryEl   = document.getElementById('lv-breakdown-summary');

  if (!from || !to) {
    daysEl.value = '';
    if (breakdownEl) breakdownEl.style.display = 'none';
    return;
  }

  const d1 = new Date(from + 'T12:00:00');
  const d2 = new Date(to   + 'T12:00:00');
  if (d2 < d1) {
    daysEl.value = '0';
    if (breakdownEl) breakdownEl.style.display = 'none';
    return;
  }

  // Day name helper (matches restDays array format: 'Sun','Mon',...)
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // Employee's configured rest days
  const empRestDays = Array.isArray(currentUserData?.restDays) ? currentUserData.restDays : [];

  let countedDays = 0;
  let rdDays      = 0;
  let holidayDays = 0;
  const chips     = [];

  // Iterate every date in the range
  const cur = new Date(d1);
  while (cur <= d2) {
    const ds      = cur.toISOString().slice(0, 10); // YYYY-MM-DD
    const dayName = DAY_NAMES[cur.getDay()];

    const isRD      = empRestDays.includes(dayName);
    const holiday   = globalHolidayShifts?.[ds];
    const isHoliday = !!(holiday && (holiday.code === 'SH' || holiday.code === 'LH'));

    const shortDate = cur.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

    if (isRD) {
      rdDays++;
      chips.push(`<span title="Rest Day" style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;background:var(--bg3);border:1px solid var(--border2);color:var(--text3);text-decoration:line-through">${shortDate} <span style="font-size:9px">RD</span></span>`);
    } else if (isHoliday) {
      holidayDays++;
      chips.push(`<span title="${holiday.name||'Holiday'}" style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;background:var(--purple-bg);border:1px solid var(--purple);color:var(--purple);text-decoration:line-through">${shortDate} <span style="font-size:9px">${holiday.code}</span></span>`);
    } else {
      countedDays++;
      chips.push(`<span title="Leave day counted" style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;background:var(--green-bg);border:1px solid var(--accent);color:var(--accent)">${shortDate} <span style="font-size:9px">${dayName}</span></span>`);
    }

    cur.setDate(cur.getDate() + 1);
  }

  // Update fields
  daysEl.value = countedDays;

  // Show breakdown
  if (breakdownEl && listEl && summaryEl) {
    listEl.innerHTML = chips.join('');
    const parts = [];
    if (countedDays > 0) parts.push(`<span style="color:var(--accent);font-weight:600">${countedDays} leave day${countedDays!==1?'s':''} counted</span>`);
    if (rdDays > 0)      parts.push(`<span style="color:var(--text3)">${rdDays} RD excluded</span>`);
    if (holidayDays > 0) parts.push(`<span style="color:var(--purple)">${holidayDays} holiday excluded</span>`);
    summaryEl.innerHTML = parts.join(' &nbsp;·&nbsp; ');
    breakdownEl.style.display = chips.length ? '' : 'none';
  }
}

function loadLeaveBalances() {
  const u = currentUserData;
  document.getElementById('lv-vl-bal').textContent = u.leaveBalances?.VL ?? '—';
  document.getElementById('lv-ml-bal').textContent = u.leaveBalances?.ML ?? '—';
}

function submitLeave() {
  const type   = document.getElementById('lv-type').value;
  const from   = document.getElementById('lv-from').value;
  const to     = document.getElementById('lv-to').value;
  const days   = document.getElementById('lv-days').value;
  const reason = document.getElementById('lv-reason').value.trim();
  if (!from || !to) { toast('Select date range','amber'); return; }
  if (!days || Number(days) <= 0) { toast('No working days in the selected range — all days are RD or Holidays','amber'); return; }
  submitRequest('leave',{leaveType:type,dateFrom:from,dateTo:to,days,reason},'lv-list');
  document.getElementById('lv-from').value='';
  document.getElementById('lv-to').value='';
  document.getElementById('lv-days').value='';
  document.getElementById('lv-reason').value='';
  const breakdownEl = document.getElementById('lv-breakdown');
  if (breakdownEl) breakdownEl.style.display = 'none';
}

function onOTDateChange() {
  // Auto-fill OT Start from the employee's shift end time for that date
  const date = document.getElementById('ot-date').value;
  const startEl = document.getElementById('ot-start');
  const hoursEl = document.getElementById('ot-hours');
  const endEl   = document.getElementById('ot-end');
  hoursEl.value = '';
  if(!date || !currentUserData) { startEl.value = ''; return; }
  // Get shift code for this date (respects shift changes / holidays)
  const shiftCode = (typeof getEmployeeShiftForDate === 'function')
    ? getEmployeeShiftForDate(currentUserData, date)
    : (currentUserData.shiftCode || DEFAULT_WORK_SHIFT_CODE);
  const end = getShiftEnd(shiftCode);
  if(!end) { startEl.value = ''; return; }
  const hh = String(end.h).padStart(2,'0');
  const mm = String(end.m).padStart(2,'0');
  startEl.value = `${hh}:${mm}`;
  // Recalculate if end time already filled
  if(endEl.value) calcOTHours();
}

function calcOTHours() {
  const s = document.getElementById('ot-start').value;
  const e = document.getElementById('ot-end').value;
  const hoursEl = document.getElementById('ot-hours');
  if(!s || !e) { hoursEl.value = ''; return; }
  const [sh,sm] = s.split(':').map(Number);
  const [eh,em] = e.split(':').map(Number);
  let mins = (eh*60+em) - (sh*60+sm);
  if(mins <= 0) mins += 1440; // overnight
  hoursEl.value = (mins/60).toFixed(2) + ' hrs';
}

function submitOT() {
  const date   = document.getElementById('ot-date').value;
  const start  = document.getElementById('ot-start').value;
  const end    = document.getElementById('ot-end').value;
  const hoursRaw = document.getElementById('ot-hours').value;
  const hours  = parseFloat(hoursRaw) || 0;
  const reason = document.getElementById('ot-reason').value.trim();
  if(!date)   { toast('Please select a date','amber'); return; }
  if(!start)  { toast('No shift found for this date — shift end cannot be determined','amber'); return; }
  if(!end)    { toast('Please select OT End Time','amber'); return; }
  if(hours<=0){ toast('OT End Time must be after shift end time','amber'); return; }
  if(!reason) { toast('Please enter a reason','amber'); return; }
  submitRequest('overtime',{date, startTime:start, endTime:end, hours:hours.toFixed(2), reason},'ot-list');
  document.getElementById('ot-date').value='';
  document.getElementById('ot-start').value='';
  document.getElementById('ot-end').value='';
  document.getElementById('ot-hours').value='';
  document.getElementById('ot-reason').value='';
}

function submitUndertime() {
  const date=document.getElementById('ut-date').value;
  const time=document.getElementById('ut-time').value;
  const reason=document.getElementById('ut-reason').value.trim();
  if(!date||!time||!reason){toast('Please fill all fields','amber');return;}
  submitRequest('undertime',{date,timeLeftEarly:time,reason},'ut-list');
  document.getElementById('ut-date').value='';document.getElementById('ut-time').value='';document.getElementById('ut-reason').value='';
}

// ==================== MANAGER DASHBOARD ====================
function initManagerDashboard() {
  loadAllTimesheets();
  updateApprovalBadge();
  loadReports();
  // Pre-load shift codes so all dropdowns are populated with custom shifts
  fetchAllShiftCodes().then(codes => {
    cachedShiftCodes = codes;
    refreshShiftDropdowns(codes);
  });
}

// Real-time approval badge — upgrades from one-time .once() to live .on()
// listener so the badge updates instantly when any request status changes.
let _approvalBadgeListener = null;
function updateApprovalBadge() {
  // Detach any previous listener to avoid duplicates
  if (_approvalBadgeListener) {
    db.ref('requests').off('value', _approvalBadgeListener);
  }
  _approvalBadgeListener = db.ref('requests').on('value', snap => {
    let count = 0;
    snap.forEach(parent => {
      const val = parent.val();
      if (!val || typeof val !== 'object') return;
      // Handle both flat {type,...} and nested {reqId:{type,...}} structures
      if (val.type) {
        if (typeof normalizeApprovalStatus === 'function' ? normalizeApprovalStatus(val.status) === 'pending' : String(val.status||'').toLowerCase() === 'pending') count++;
      } else {
        Object.values(val).forEach(r => {
          if (!r || typeof r !== 'object') return;
          if (typeof normalizeApprovalStatus === 'function' ? normalizeApprovalStatus(r.status) === 'pending' : String(r.status||'').toLowerCase() === 'pending') count++;
        });
      }
    });
    const b = document.getElementById('approval-badge');
    if (!b) return;
    if (count > 0) { b.textContent = count > 99 ? '99+' : count; b.classList.remove('hidden'); }
    else b.classList.add('hidden');
  });
}

/* ── Helper: get all YYYY-MM-DD dates in [from, to] ── */
function _allDatesInRange(from, to) {
  const dates = [];
  const cur = new Date(from + 'T12:00:00');
  const end = new Date(to   + 'T12:00:00');
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function loadAllTimesheets() {
  /* Load timelogs AND users so we can generate a row for every
     employee × every date even if no clock-in exists. */
  Promise.all([
    db.ref('timelogs').once('value'),
    db.ref('users').once('value')
  ]).then(([tlSnap, usersSnap]) => {

    /* Build a map: uid → {name, employeeId, firstName, middleName, lastName, suffix, position} */
    const empMap = {};
    usersSnap.forEach(u => {
      const v = u.val();
      if (!v || !v.name) return;
      // Hide soft-deleted employees everywhere in Team Timesheets.
      // Employee Management uses deleted:true instead of removing the account,
      // so Team Timesheets must exclude those profiles before expanding rows.
      if (v.deleted === true) return;
      // Scope: non-admin approvers only see their assigned employees
      if (_isScopedView() && !_isMyEmployee({...v, uid: u.key})) return;
      // Prefer stored individual fields; fall back to parsing the combined name string.
      // Filipino name order stored by createEmployee: "FirstName MiddleName LastName Suffix"
      let firstName  = v.firstName  || '';
      let middleName = v.middleName || v.middleInitial || '';
      let lastName   = v.lastName   || '';
      let suffix     = v.suffix     || '';
      if (!firstName && !lastName && v.name) {
        // Known suffixes to strip
        const SUFFIXES = ['Jr.','Sr.','II','III','IV','V','Jr','Sr'];
        let parts = v.name.trim().split(/\s+/);
        const lastPart = parts[parts.length - 1];
        if (SUFFIXES.includes(lastPart)) { suffix = lastPart; parts = parts.slice(0,-1); }
        if (parts.length >= 3) {
          firstName  = parts[0];
          middleName = parts[1];
          lastName   = parts.slice(2).join(' ');
        } else if (parts.length === 2) {
          firstName = parts[0];
          lastName  = parts[1];
        } else {
          firstName = v.name;
        }
      }
      empMap[u.key] = {
        name:       v.name,
        employeeId: v.employeeId || v.empId || '',
        firstName, middleName, lastName, suffix,
        position:   v.position || v.jobTitle || ''
      };
    });

    /* Build a map: uid+date → timelog record */
    const logMap = {};
    tlSnap.forEach(uSnap => {
      const uid = uSnap.key;
      // If the employee profile is deleted or outside the current manager scope,
      // empMap will not contain the UID. Skip old timelog records for that UID.
      if (!empMap[uid]) return;
      uSnap.forEach(dSnap => {
        const r = dSnap.val();
        if (!r || !r.date) return;
        const h = globalHolidayShifts?.[r.date];
        if (h?.code && r.status !== 'leave') r.shiftCode = normalizeShiftCode(h.code);
        logMap[uid + '|' + r.date] = { uid, ...r };
      });
    });

    /* Determine the date range to expand */
    const from = periodStart || Object.values(logMap).map(r=>r.date).sort()[0];
    const to   = periodEnd   || Object.values(logMap).map(r=>r.date).sort().slice(-1)[0];

    if (!from || !to) {
      /* Fallback: just use whatever logs exist */
      const all = Object.values(logMap);
      all.sort((a,b)=>a.date.localeCompare(b.date)||(a.employeeName||'').localeCompare(b.employeeName||''));
      allTimelogs = all;
      allEmpMap   = empMap;
      filterAllTimesheets();
      return;
    }

    const dates = _allDatesInRange(from, to);
    const all   = [];

    /* For each employee, produce a row for every date in the range */
    Object.keys(empMap).forEach(uid => {
      const emp = empMap[uid];
      dates.forEach(date => {
        const key = uid + '|' + date;
        if (logMap[key]) {
          // Merge empMap name-part fields into the real log row (Firebase timelogs
          // may not store them; empMap is built from the users node which does)
          const logRow = logMap[key];
          if (!logRow.firstName)  logRow.firstName  = emp.firstName;
          if (!logRow.middleName) logRow.middleName  = emp.middleName;
          if (!logRow.lastName)   logRow.lastName    = emp.lastName;
          if (!logRow.suffix)     logRow.suffix      = emp.suffix;
          if (!logRow.position)   logRow.position    = emp.position;
          all.push(logRow);
        } else {
          /* Synthetic "no-data" row so the date still appears */
          all.push({
            uid,
            date,
            employeeName: emp.name,
            employeeId:   emp.employeeId,
            firstName:    emp.firstName,
            middleName:   emp.middleName,
            lastName:     emp.lastName,
            suffix:       emp.suffix,
            position:     emp.position,
            _noData: true
          });
        }
      });
    });

    all.sort((a,b)=>a.date.localeCompare(b.date)||(a.employeeName||'').localeCompare(b.employeeName||''));
    allTimelogs = all;
    allEmpMap   = empMap;
    filterAllTimesheets();
  });
}

function filterAllTimesheets() {
  const q      = (document.getElementById('ts-search')?.value||'').toLowerCase().trim();
  const status = (document.getElementById('ts-status-filter')?.value||'').toLowerCase();
  let filtered = allTimelogs || [];

  /* Employee name / ID search */
  if (q) {
    filtered = filtered.filter(r =>
      (r.employeeName||'').toLowerCase().includes(q) ||
      (r.employeeId||'').toLowerCase().includes(q)
    );
  }

  /* Status filter — includes "nodata" for empty rows */
  if (status) {
    filtered = filtered.filter(r => {
      if (r._noData) return status === 'nodata';
      const rr = applyPayrollRulesToRow({...r});
      const rowStatus = rr.status==='absent'?'absent':rr.status==='leave'?'leave':rr.lateMinutes>0?'late':'present';
      return rowStatus === status;
    });
  }

  renderAllTimesheets(filtered);
}

function renderAllTimesheets(rows) {
  const tbody = document.getElementById('all-ts-body');

  /* Stats — only real records count toward present/late/absent/leave */
  const realRows = rows.map(r => r._noData ? r : applyPayrollRulesToRow(r));
  const stat = realRows.reduce((a, r) => {
    a.total++;
    if (r._noData) return a;
    const st = r.status==='absent'?'absent':r.status==='leave'?'leave':r.lateMinutes>0?'late':'present';
    a[st]++;
    return a;
  }, {total:0, present:0, late:0, absent:0, leave:0});
  ['total','present','late','absent','leave'].forEach(k => {
    const el = document.getElementById('team-ts-'+k);
    if (el) el.textContent = stat[k] || 0;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="21" style="text-align:center;padding:32px;color:var(--text3)">No records found</td></tr>`;
    document.getElementById('all-ts-pagination').innerHTML = '';
    return;
  }

  const page  = allTsPage;
  const start = (page - 1) * PAGE_SIZE;
  const paged = realRows.slice(start, start + PAGE_SIZE);

  const nz       = v => Number(v||0) > 0 ? 'ts-num nonzero' : 'ts-num';
  const timeCell = v => v ? `<span class="ts-time">${legacyTime(v)}</span>` : '';

  tbody.innerHTML = paged.map(r => {
    const isRest    = (r.shiftCode||'').toUpperCase() === 'RD';
    const dateObj   = new Date((r.date||'2000-01-01') + 'T12:00:00');
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    const dayBox    = (r._noData && !r.shiftCode) ? (isWeekend ? 'N' : 'W') : (isRest ? 'N' : 'W');
    const dateStyle = isRest
      ? 'color:var(--text3)'
      : isWeekend
        ? 'color:var(--amber);font-weight:600'
        : 'color:var(--text2)';

    /* Employee name cell — shared across all row types */
    const empCell = `<td><div class="team-ts-emp-name">${r.employeeName||'—'}</div><div class="team-ts-emp-id">${r.employeeId||''}</div></td>`;

    /* ── No-data row: just show the day badge + dimmed date, rest empty ── */
    if (r._noData) {
      const restClass = isWeekend ? ' ts-restday' : '';
      return `<tr class="${restClass}">
        ${empCell}
        <td class="ts-center"><span class="ts-daybox ts-daybox-${isWeekend?'N':'W'}">${isWeekend?'N':'W'}</span></td>
        <td><span style="font-size:12px;${dateStyle}">${legacyDateShort(r.date)}</span></td>
        <td class="ts-center"></td>
        <td class="ts-center"></td><td class="ts-center"></td><td class="ts-center"></td>
        <td class="ts-center"></td><td class="ts-center"></td><td class="ts-center"></td>
        <td class="ts-num">0.00</td><td class="ts-num">0.00</td><td class="ts-num">0.00</td>
        <td class="ts-num">0.00</td><td class="ts-num">0.00</td><td class="ts-num">0.00</td>
        <td class="ts-num">0.00</td><td></td><td class="ts-num">0.00</td><td class="ts-center"></td>
      </tr>`;
    }

    /* ── Normal record row — mirrors Employee Timesheet exactly ── */
    const reqs      = r._requests || [];
    const absence   = r.status==='absent' ? '1.00' : num2(r.absence||0);
    const leaveType = r.leaveType || '';
    const leaveDays = r.leaveDays ? num2(r.leaveDays) : '0.00';
    let app = '';
    if (leaveType==='VL')      app = '<span class="ts-app ts-app-vl">VL</span>';
    else if (leaveType)        app = '<span class="ts-app ts-app-yellow">'+leaveType+'</span>';
    else if (r.corrected)      app = '<span class="ts-app ts-app-yellow">CS</span>';
    if (r.shiftChangeApproved) app += '<span class="req-tag req-tag-apprf" title="Shift Change Approved">SC</span>';
    if (typeof buildReqTags==='function')
      app += buildReqTags(reqs.filter(rq=>!(r.shiftChangeApproved&&rq.type==='shift_change'&&rq.status==='approved')));
    const rowClass = (typeof getDominantRowClass==='function' ? getDominantRowClass(reqs) : '') + (isRest ? ' ts-restday' : '');

    return `<tr class="${rowClass}">
      ${empCell}
      <td class="ts-center"><span class="ts-daybox ts-daybox-${dayBox}">${dayBox}</span></td>
      <td><span style="font-size:12px;${dateStyle}">${legacyDateShort(r.date)}</span></td>
      <td class="ts-center"><span class="ts-shift">${r.shiftCode||''}</span></td>
      <td class="ts-center">${timeCell(r.timeIn)}</td>
      <td class="ts-center">${timeCell(r.noonOut)}</td>
      <td class="ts-center">${timeCell(r.noonIn)}</td>
      <td class="ts-center">${timeCell(r.snackBreakOut)}</td>
      <td class="ts-center">${timeCell(r.snackBreakIn)}</td>
      <td class="ts-center">${timeCell(r.timeOut)}</td>
      <td class="${nz(r.regularWorkHrs)}">${num2(r.regularWorkHrs)}</td>
      <td class="${nz(r.totalWorkHrs)}">${num2(r.totalWorkHrs)}</td>
      <td class="${nz(r.excessWorkHrs??r.OTHours)}">${num2(r.excessWorkHrs??r.OTHours)}</td>
      <td class="${nz(r.lateMinutes)}">${Number(r.lateMinutes||0).toFixed(2)}</td>
      <td class="${nz(r.undertimeMinutes)}">${Number(r.undertimeMinutes||0).toFixed(2)}</td>
      <td class="${nz(r.OTHours)}">${num2(r.OTHours)}</td>
      <td class="ts-num">${absence}</td>
      <td style="font-size:11px;color:var(--text2)">${leaveType}</td>
      <td class="ts-num">${leaveDays}</td>
      <td class="ts-center" style="min-width:64px">${app}</td>
    </tr>`;
  }).join('');

  renderPagination('all-ts-pagination', rows.length, page, (p)=>{ allTsPage=p; renderAllTimesheets(rows); });
}

// ==================== APPROVALS ====================
function loadAllRequests() {
  const typeFilter = document.getElementById('req-filter-type')?.value||'';
  const statusFilter = document.getElementById('req-filter-status')?.value||'pending';
  const c = document.getElementById('approval-list');
  c.innerHTML = `<div class="empty"><div class="empty-msg">Loading...</div></div>`;
  db.ref('requests').once('value').then(snap => {
    const all = [];
    snap.forEach(uSnap=>uSnap.forEach(rSnap=>{
      const r = rSnap.val();
      if(typeFilter&&r.type!==typeFilter) return;
      if(statusFilter&&r.status!==statusFilter) return;
      all.push({reqId:rSnap.key,uid:uSnap.key,...r});
    }));
    all.sort((a,b)=>b.submittedAt-a.submittedAt);
    renderApprovals(all, c);
    updateApprovalBadge();
  });
}

function renderApprovals(list, c) {
  const countEl = document.getElementById('approval-record-count');
  if(!list.length) {
    c.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">No requests found</td></tr>';
    if(countEl) countEl.textContent = '0 items';
    return;
  }

  const typeLabels = {time_correction:'Time Correction',shift_change:'Shift Change',leave:'Leave',overtime:'Overtime',undertime:'Undertime'};
  const typeBadge  = {time_correction:'badge-blue',shift_change:'badge-purple',leave:'badge-amber',overtime:'badge-green',undertime:'badge-gray'};
  const statusStyle = {
    pending:  'background:#F59E0B;color:#000',
    approved: 'background:#006400;color:#fff',
    rejected: 'background:#FF3300;color:#fff',
    cancelled:'background:#FF8FAB;color:#000'
  };
  const statusLabel = {
    pending:'Pending', approved:'Approved',
    rejected:'Rejected', cancelled:'Cancelled'
  };
  const borderColor = {
    pending:'#F59E0B', approved:'#006400', rejected:'#FF3300', cancelled:'#FF8FAB'
  };
  const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('en-US') : '—';

  const rows = list.map(r => {
    let detail = '—';
    if(r.type==='time_correction') detail = (r.date||'') + ' · ' + (r.manualTimeIn||'') + ' → ' + (r.manualTimeOut||'');
    else if(r.type==='shift_change') detail = fmtDate(r.date) + ' → ' + (r.requestedShift||'');
    else if(r.type==='leave') detail = (r.leaveType||'') + ' · ' + fmtDate(r.dateFrom) + ' – ' + fmtDate(r.dateTo) + ' (' + (r.days||0) + ' days)';
    else if(r.type==='overtime') detail = fmtDate(r.date) + ' · ' + (r.startTime||'') + '–' + (r.endTime||'') + ' (' + (r.hours||0) + ' hrs)';
    else if(r.type==='undertime') detail = fmtDate(r.date) + ' · Left at: ' + (r.timeLeftEarly||'');

    const bc   = borderColor[r.status] || '#ccc';
    const st   = statusStyle[r.status] || 'background:#555;color:#fff';
    const stLbl= statusLabel[r.status] || r.status;
    // BUG 4 FIX: include Recall button for recallable statuses (mirrors acLoadAllRequests logic)
    const recallableStatuses = ['pending','pend1','pendf','approved','appr1','apprf'];
    const approvedStatuses   = ['approved','appr1','apprf'];
    const approverRoleLocal  = String(currentUserData?.role||'').trim().toLowerCase();
    const isManagerAdminLocal = ['admin','manager'].includes(approverRoleLocal);
    const isApproverLocal     = ['admin','manager','supervisor','hr','payroll'].includes(approverRoleLocal);
    const statusStr = String(r.status||'').toLowerCase();
    const canRecall = recallableStatuses.includes(statusStr) &&
                      (approvedStatuses.includes(statusStr) ? isManagerAdminLocal : isApproverLocal);
    let actions = '';
    if(r.status === 'pending') {
      actions = `<div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
           <button class="btn btn-success btn-xs" onclick='openApproveModal(${JSON.stringify(r)})'>✓ Approve</button>
           <button class="btn btn-danger btn-xs" onclick='openRejectModal(${JSON.stringify(r)})'>✕ Reject</button>
           ${canRecall ? `<button class="btn btn-amber btn-xs" onclick="recallRequest('${r.uid}','${r.reqId}','manager')">↩ Recall</button>` : ''}
         </div>`;
    } else if(canRecall) {
      actions = `<div style="display:flex;gap:4px;justify-content:center">
           <button class="btn btn-amber btn-xs" onclick="recallRequest('${r.uid}','${r.reqId}','manager')">↩ Recall</button>
         </div>`;
    } else {
      actions = r.remarks ? `<span style="font-size:10px;color:var(--text2)">${r.remarks}</span>` : '<span style="color:var(--text3)">—</span>';
    }

    return `<tr style="border-left:3px solid ${bc}">
      <td><span class="badge ${typeBadge[r.type]||'badge-gray'}" style="font-size:10px">${typeLabels[r.type]||r.type}</span></td>
      <td>
        <div style="font-weight:600;font-size:12px">${r.employeeName||'Unknown'}</div>
        <div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${r.employeeId||''}</div>
      </td>
      <td style="color:var(--text2);font-size:11px;white-space:nowrap">${detail}</td>
      <td style="color:var(--text2);max-width:160px;overflow:hidden;text-overflow:ellipsis">${r.reason||'<span style="color:var(--text3)">—</span>'}</td>
      <td style="color:var(--text3);font-size:10px;white-space:nowrap">${new Date(r.submittedAt).toLocaleString('en-PH')}</td>
      <td style="text-align:center"><span style="display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;${st}">${stLbl}</span></td>
      <td style="text-align:center">${actions}</td>
    </tr>`;
  }).join('');

  c.innerHTML = rows;
  if(countEl) countEl.textContent = `${list.length} item${list.length===1?'':'s'}`;
}
// ── SHARED TIMELOG REVERT HELPER ─────────────────────────────────────────────
// Called on Recall (all statuses) AND Reject (if the request was previously approved
// and its side-effects were already written to the timelog).
// Covers all 5 request types: time_correction, shift_change, leave, overtime, undertime.
async function _revertTimelogForRequest(empUid, reqId, r) {
  try {
    const empSnap = await db.ref(`users/${empUid}`).once('value');
    const empData = empSnap.val() || {};

    // ── Time Correction ──────────────────────────────────────────────────────
    if(r.type === 'time_correction' && r.date) {
      const logRef = db.ref(`timelogs/${empUid}/${r.date}`);
      const logSnap = await logRef.once('value');
      const existing = logSnap.val() || {};
      // Only revert if this TC was the one that set corrected:true
      if(existing.corrected) {
        // Restore original clock-in/out from before correction (stored as origTimeIn/origTimeOut),
        // or clear the correction fields so the row shows as uncorrected
        const revert = { corrected: false, tcRequestId: null };
        if(existing.origTimeIn != null)  { revert.timeIn  = existing.origTimeIn;  revert.origTimeIn  = null; }
        if(existing.origTimeOut != null) { revert.timeOut = existing.origTimeOut; revert.origTimeOut = null; }
        // Recompute hours if we have clock data
        if(revert.timeIn && revert.timeOut) {
          const hrs = computeHours(revert.timeIn, revert.timeOut, existing.shiftCode || DEFAULT_WORK_SHIFT_CODE);
          revert.regularWorkHrs = hrs.reg; revert.totalWorkHrs = hrs.total;
          revert.lateMinutes = hrs.late;   revert.OTHours = hrs.excess;
        } else {
          revert.timeIn  = null; revert.timeOut = null;
          revert.regularWorkHrs = 0; revert.totalWorkHrs = 0;
          revert.lateMinutes = 0;   revert.OTHours = 0;
        }
        await logRef.update(revert);
      }
    }

    // ── Shift Change ─────────────────────────────────────────────────────────
    if(r.type === 'shift_change' && r.date) {
      const logRef = db.ref(`timelogs/${empUid}/${r.date}`);
      const logSnap = await logRef.once('value');
      const existing = logSnap.val() || {};
      if(existing.shiftChangeApproved &&
         (!existing.shiftChangeRequestId || existing.shiftChangeRequestId === reqId)) {
        await db.ref(`users/${empUid}/shiftSchedule/${r.date}`).remove();
        const holiday = globalHolidayShifts?.[r.date];
        const isRD = Array.isArray(empData.restDays) && empData.restDays.includes(getDayKey(r.date));
        const originalShift = holiday?.code
          ? normalizeShiftCode(holiday.code)
          : (isRD ? 'RD' : normalizeShiftCode(empData.shiftCode || DEFAULT_WORK_SHIFT_CODE));
        const revertUpdate = {
          shiftCode: originalShift, shiftChangeApproved: false,
          shiftChangeRequestId: null, shiftChangeRecalledAt: Date.now()
        };
        if(existing.timeIn && existing.timeOut) {
          const hrs = computeHours(existing.timeIn, existing.timeOut, originalShift, existing);
          revertUpdate.regularWorkHrs = hrs.reg; revertUpdate.totalWorkHrs = hrs.total;
          revertUpdate.excessWorkHrs  = hrs.excess; revertUpdate.OTHours = hrs.excess;
          revertUpdate.lateMinutes    = hrs.late;
        }
        await logRef.update(revertUpdate);
        if(currentUserData && currentUserData.uid === empUid && currentUserData.shiftSchedule)
          delete currentUserData.shiftSchedule[r.date];
      }
    }

    // ── Leave ────────────────────────────────────────────────────────────────
    if(r.type === 'leave' && r.dateFrom && r.dateTo) {
      const from = new Date(r.dateFrom+'T12:00:00'), to = new Date(r.dateTo+'T12:00:00');
      for(let d = new Date(from); d <= to; d.setDate(d.getDate()+1)) {
        const ds = d.toISOString().split('T')[0];
        const logSnap = await db.ref(`timelogs/${empUid}/${ds}`).once('value');
        const existing = logSnap.val() || {};
        if(existing.leaveRequestId === reqId || existing.status === 'leave') {
          const hasRealClockData = !!(existing.timeIn || existing.timeOut);
          if(!hasRealClockData) {
            // Row was created purely by leave approval — delete it entirely so it
            // disappears from the timesheet rather than showing as a ghost row
            await db.ref(`timelogs/${empUid}/${ds}`).remove();
          } else {
            // Row had real clock-in/out — keep the attendance data, just strip leave fields
            const holiday = globalHolidayShifts?.[ds];
            const isRD = Array.isArray(empData.restDays) && empData.restDays.includes(getDayKey(ds));
            const restoredShift = holiday?.code
              ? normalizeShiftCode(holiday.code)
              : (isRD ? 'RD' : normalizeShiftCode(
                  empData.shiftSchedule?.[ds] || empData.shiftCode || DEFAULT_WORK_SHIFT_CODE));
            await db.ref(`timelogs/${empUid}/${ds}`).update({
              status: isRD ? 'rest_day' : 'present',
              leaveType: null, leaveDays: null, leaveRequestId: null,
              shiftCode: restoredShift,
            });
          }
        }
      }
    }

    // ── Overtime ─────────────────────────────────────────────────────────────
    if(r.type === 'overtime' && r.date) {
      const logSnap = await db.ref(`timelogs/${empUid}/${r.date}`).once('value');
      const existing = logSnap.val() || {};
      // Clear OTHours that this request wrote (only if still matching what we set)
      const writtenOT = parseFloat(r.hours) || 0;
      if(Math.abs((existing.OTHours || 0) - writtenOT) < 0.01) {
        await db.ref(`timelogs/${empUid}/${r.date}`).update({ OTHours: 0 });
      }
    }

    // ── Undertime ────────────────────────────────────────────────────────────
    if(r.type === 'undertime' && r.date) {
      const logSnap = await db.ref(`timelogs/${empUid}/${r.date}`).once('value');
      const existing = logSnap.val() || {};
      if(existing.undertimeApproved && existing.undertimeRequestId === reqId) {
        // Restore timeOut to what the shift end should be
        const shiftCode = existing.shiftCode || DEFAULT_WORK_SHIFT_CODE;
        const shift = (typeof getShiftDef === 'function') ? getShiftDef(shiftCode) : null;
        const revert = {
          undertimeApproved: false, undertimeRequestId: null,
          undertimeApprovedAt: null, undertimeApprovedBy: null,
        };
        // If we have the original timeOut before undertime was applied, restore it
        if(existing.origTimeOut != null) {
          revert.timeOut = existing.origTimeOut;
          revert.origTimeOut = null;
          if(existing.timeIn) {
            const hrs = computeHours(existing.timeIn, existing.origTimeOut, shiftCode);
            revert.regularWorkHrs = hrs.reg; revert.totalWorkHrs = hrs.total;
            revert.lateMinutes = hrs.late;   revert.OTHours = hrs.excess;
          }
        } else if(shift?.end && r.date) {
          // Reconstruct expected timeOut from shift definition
          const expectedOut = new Date(`${r.date}T${shift.end}`).getTime();
          if(!isNaN(expectedOut)) {
            revert.timeOut = expectedOut;
            if(existing.timeIn) {
              const hrs = computeHours(existing.timeIn, expectedOut, shiftCode);
              revert.regularWorkHrs = hrs.reg; revert.totalWorkHrs = hrs.total;
              revert.lateMinutes = hrs.late;   revert.OTHours = hrs.excess;
            }
          }
        } else {
          // No shift def available — just clear the undertime flags, leave timeOut as-is
        }
        await db.ref(`timelogs/${empUid}/${r.date}`).update(revert);
      }
    }
  } catch(e) { console.warn('_revertTimelogForRequest failed:', r?.type, e.message); }
}
// ─────────────────────────────────────────────────────────────────────────────

// BUG 3 FIX: build rich detail block so manager sees full request info before deciding
function _buildRequestDetailHTML(r) {
  const typeLabels={time_correction:'Time Correction',shift_change:'Shift Change',leave:'Leave',overtime:'Overtime',undertime:'Undertime'};
  const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : '—';
  let detail = '';
  if(r.type==='time_correction') {
    detail = `<span style="color:var(--text2)">Date:</span> <strong>${fmtDate(r.date)}</strong> &nbsp;·&nbsp; `+
             `<span style="color:var(--text2)">In:</span> <strong>${r.manualTimeIn||'—'}</strong> &nbsp;→&nbsp; `+
             `<span style="color:var(--text2)">Out:</span> <strong>${r.manualTimeOut||'—'}</strong>`;
  } else if(r.type==='shift_change') {
    detail = `<span style="color:var(--text2)">Date:</span> <strong>${fmtDate(r.date)}</strong> &nbsp;·&nbsp; `+
             `<span style="color:var(--text2)">New shift:</span> <strong>${r.requestedShift||'—'}</strong>`;
  } else if(r.type==='leave') {
    detail = `<span style="color:var(--text2)">Type:</span> <strong>${r.leaveType||'—'}</strong> &nbsp;·&nbsp; `+
             `<span style="color:var(--text2)">From:</span> <strong>${fmtDate(r.dateFrom)}</strong> `+
             `<span style="color:var(--text2)">To:</span> <strong>${fmtDate(r.dateTo)}</strong> `+
             `<span style="color:var(--text2)">(${r.days||0} day${r.days===1?'':'s'})</span>`;
  } else if(r.type==='overtime') {
    detail = `<span style="color:var(--text2)">Date:</span> <strong>${fmtDate(r.date)}</strong> &nbsp;·&nbsp; `+
             `<span style="color:var(--text2)">Time:</span> <strong>${r.startTime||'—'} – ${r.endTime||'—'}</strong> `+
             `<span style="color:var(--text2)">(${r.hours||0} hrs)</span>`;
  } else if(r.type==='undertime') {
    detail = `<span style="color:var(--text2)">Date:</span> <strong>${fmtDate(r.date)}</strong> &nbsp;·&nbsp; `+
             `<span style="color:var(--text2)">Left early at:</span> <strong>${r.timeLeftEarly||'—'}</strong>`;
  }
  const stageLabel = String(r.workflowStage||'first').toLowerCase()==='final'
    ? '<span style="background:var(--amber-bg);color:var(--amber);padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700">Pending Final Approval</span>'
    : '<span style="background:var(--blue-bg);color:var(--blue);padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700">Pending 1st Line</span>';
  return `<div style="display:flex;flex-direction:column;gap:6px;font-size:13px">
    <div><strong style="font-size:14px">${r.employeeName||'—'}</strong> &nbsp;<span style="color:var(--text3);font-size:11px;font-family:var(--mono)">${r.employeeId||''}</span></div>
    <div><span style="color:var(--text2)">Type:</span> <strong>${typeLabels[r.type]||r.type}</strong> &nbsp;&nbsp;${stageLabel}</div>
    ${detail ? `<div>${detail}</div>` : ''}
    <div><span style="color:var(--text2)">Reason:</span> ${r.reason||'<span style="color:var(--text3)">—</span>'}</div>
    ${r.submittedAt ? `<div style="font-size:11px;color:var(--text3)">Submitted: ${new Date(r.submittedAt).toLocaleString('en-PH')}</div>` : ''}
  </div>`;
}

function openApproveModal(r) {
  currentRequestForApproval = r;
  document.getElementById('approve-modal-title').textContent = 'Approve Request';
  document.getElementById('approve-btn').classList.remove('hidden');
  document.getElementById('reject-btn').classList.add('hidden');
  document.getElementById('approve-modal-details').innerHTML = _buildRequestDetailHTML(r);
  document.getElementById('approve-remarks').value='';
  showModal('approve-modal');
}

function openRejectModal(r) {
  currentRequestForApproval = r;
  document.getElementById('approve-modal-title').textContent = 'Reject Request';
  document.getElementById('approve-btn').classList.add('hidden');
  document.getElementById('reject-btn').classList.remove('hidden');
  document.getElementById('approve-modal-details').innerHTML = _buildRequestDetailHTML(r);
  document.getElementById('approve-remarks').value='';
  showModal('approve-modal');
}

async function processRequest(decision) {
  const r = currentRequestForApproval;
  if(!r) return;

  const remarksEl = document.getElementById('approve-remarks');
  const remarks = remarksEl ? remarksEl.value.trim() : '';
  const currentStatus = normalizeApprovalStatus(r.status);

  if(decision === 'approved' && currentStatus !== 'pending') {
    toast('Only pending requests can be approved.','amber');
    return;
  }
  if(decision === 'rejected' && currentStatus !== 'pending') {
    toast('Only pending requests can be rejected.','amber');
    return;
  }

  const approverName = currentUserData?.name || auth?.currentUser?.email || 'Approver';
  const now = Date.now();
  const newStatus = decision === 'approved' ? 'approved' : 'rejected';

  const updates = {
    status: newStatus,
    workflowStage: null,
    approvalFlow: 'single',
    lastAction: newStatus,
    lastActionBy: approverName,
    lastActionAt: now,
    remarks
  };

  if(newStatus === 'approved') {
    updates.approvedBy = approverName;
    updates.approvedAt = now;
    updates.rejectedBy = null;
    updates.rejectedAt = null;
  } else {
    updates.rejectedBy = approverName;
    updates.rejectedAt = now;
  }

  try {
    await db.ref(`requests/${r.uid}/${r.reqId}`).update(updates);

    if(newStatus === 'approved') {
      await applySimplifiedRequestToTimelog({...r, ...updates});
    }

    await pushApprovalNotification({...r, ...updates}, newStatus, remarks);

    toast(newStatus === 'approved' ? 'Request approved' : 'Request rejected', newStatus === 'approved' ? 'green' : 'red');
    closeModal('approve-modal');
    try{ loadAllRequests?.(); }catch(e){}
    try{ loadMyTimesheet?.(); }catch(e){}
  } catch(e) {
    toast('Error: '+e.message,'red');
  }
}


// ==================== SHIFT CODES ====================
// Built-in defaults — used when Firebase has no custom shifts yet
const BUILTIN_SHIFTS = [
  {code:'0800A',  name:'8:00am to 5:00pm 60/30',           start:'08:00', end:'17:00', breakMin:60, type:'regular'},
  {code:'0800A1', name:'8am to 5pm 30/60 Snack/Lunch',     start:'08:00', end:'17:00', breakMin:60, type:'regular'},
  {code:'0830A',  name:'8:30am to 5:30pm 60/30',           start:'08:30', end:'17:30', breakMin:60, type:'regular'},
  {code:'0830A1', name:'8:30am to 5:30pm 30/60',           start:'08:30', end:'17:30', breakMin:60, type:'regular'},
  {code:'0700A',  name:'7:00am to 4:00pm 60/30',           start:'07:00', end:'16:00', breakMin:60, type:'regular'},
  {code:'0600A',  name:'6:00am to 3:00pm 60/30',           start:'06:00', end:'15:00', breakMin:60, type:'regular'},
  {code:'0800A10',name:'8:00am to 7:15pm 120/30 nb/sb',    start:'08:00', end:'19:15', breakMin:120,type:'extended'},
  {code:'0800A11',name:'8:00am to 8:45pm 120/30 nb/sb',    start:'08:00', end:'20:45', breakMin:120,type:'extended'},
  {code:'0800A12',name:'8:00am to 9:00pm 120/30 nb/sb',    start:'08:00', end:'21:00', breakMin:120,type:'extended'},
  {code:'0830A10',name:'8:30am to 7:45pm 120/30 nb/sb',    start:'08:30', end:'19:45', breakMin:120,type:'extended'},
  {code:'0830A11',name:'8:30am to 9:15pm 120/30 nb/sb',    start:'08:30', end:'21:15', breakMin:120,type:'extended'},
  {code:'1200P',  name:'12:00pm to 9:00pm 60/30',          start:'12:00', end:'21:00', breakMin:60, type:'regular'},
  {code:'1400P',  name:'2:00pm to 11:00pm 60/30',          start:'14:00', end:'23:00', breakMin:60, type:'regular'},
  {code:'1500P',  name:'3:00pm to 12:00am 60/30',          start:'15:00', end:'00:00', breakMin:60, type:'regular'},
  {code:'2200N',  name:'10:00pm to 7:00am 60/30',          start:'22:00', end:'07:00', breakMin:60, type:'night'},
  {code:'2300N',  name:'11:00pm to 8:00am 60/30',          start:'23:00', end:'08:00', breakMin:60, type:'night'},
  {code:'0000N',  name:'12:00am to 9:00am 60/30',          start:'00:00', end:'09:00', breakMin:60, type:'night'},
];

let cachedShiftCodes = null; // { code: {name, start, end, breakMin, type, remarks, builtin} }

async function loadShiftCodes() {
  const tbody = document.getElementById('shift-codes-body');
  if(tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">Loading...</td></tr>`;
  cachedShiftCodes = await fetchAllShiftCodes();
  renderShiftCodesTable(cachedShiftCodes);
}

async function fetchAllShiftCodes() {
  // Merge built-ins with any custom/overridden codes from Firebase
  const merged = {};
  BUILTIN_SHIFTS.forEach(s => { merged[s.code] = {...s, builtin:true}; });
  try {
    const snap = await db.ref('shiftCodes').once('value');
    if(snap.exists()) {
      snap.forEach(c => {
        merged[c.key] = {...(merged[c.key]||{}), ...c.val(), code:c.key, builtin:false};
      });
    }
  } catch(e) { console.warn('Could not load custom shift codes:', e.message); }
  return merged;
}

function renderShiftCodesTable(codes) {
  const tbody = document.getElementById('shift-codes-body');
  if(!tbody) return;
  const rows = Object.values(codes).sort((a,b) => a.code.localeCompare(b.code));
  if(!rows.length) { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">No shift codes found</td></tr>`; return; }
  const typeBadge = {regular:'badge-blue', night:'badge-purple', extended:'badge-amber', 'non-working':'badge-gray'};
  tbody.innerHTML = rows.map(s => `<tr>
    <td><span class="badge badge-gray" style="font-family:var(--mono);font-size:12px">${s.code}</span></td>
    <td style="max-width:240px">${s.name||'—'}</td>
    <td class="mono" style="font-size:12px">${s.start||'—'}</td>
    <td class="mono" style="font-size:12px">${s.end||'—'}</td>
    <td class="mono" style="font-size:12px;text-align:center">${s.breakMin??60}</td>
    <td><span class="badge ${typeBadge[s.type]||'badge-gray'}">${s.type||'regular'}</span></td>
    <td>
      <button class="btn btn-ghost btn-xs" onclick="openShiftCodeModal('${s.code}')">Edit</button>
      ${!s.builtin?`<button class="btn btn-danger btn-xs" onclick="deleteShiftCode('${s.code}')">Delete</button>`:'<span style="font-size:10px;color:var(--text3);margin-left:4px">built-in</span>'}
    </td>
  </tr>`).join('');
  // Also refresh all shift dropdowns in the app
  refreshShiftDropdowns(codes);
}

function refreshShiftDropdowns(codes) {
  // Rebuild options for emp-shift, edit-emp-shift, sc-shift (shift change request)
  const groups = {regular:[], night:[], extended:[], 'non-working':[]};
  Object.values(codes).sort((a,b)=>a.code.localeCompare(b.code)).forEach(s => {
    const t = s.type||'regular';
    if(groups[t]) groups[t].push(s); else groups.regular.push(s);
  });
  // Always keep non-working for shift-change only
  const nonWorking = [
    {code:'SH',name:'Special Holiday'},{code:'LH',name:'Legal Holiday'},{code:'RD',name:'Rest Day'}
  ];
  function buildOptions(includeNonWorking) {
    let html = '';
    if(groups.regular.length) {
      html += `<optgroup label="— Standard Day Shifts —">` + groups.regular.map(s=>`<option value="${s.code}">${s.code} — ${s.name}</option>`).join('') + `</optgroup>`;
    }
    if(groups.extended.length) {
      html += `<optgroup label="— Extended / Split Shifts —">` + groups.extended.map(s=>`<option value="${s.code}">${s.code} — ${s.name}</option>`).join('') + `</optgroup>`;
    }
    if(groups.night.length) {
      html += `<optgroup label="— Night Shifts —">` + groups.night.map(s=>`<option value="${s.code}">${s.code} — ${s.name}</option>`).join('') + `</optgroup>`;
    }
    if(includeNonWorking) {
      html += `<optgroup label="— Non-Working —">` + nonWorking.map(s=>`<option value="${s.code}">${s.code} — ${s.name}</option>`).join('') + `</optgroup>`;
    }
    return html;
  }
  ['emp-shift','edit-emp-shift'].forEach(id => {
    const el = document.getElementById(id);
    if(el) { const cur = el.value; el.innerHTML = buildOptions(false); el.value = cur; }
  });
  const scShift = document.getElementById('sc-shift');
  if(scShift) { const cur = scShift.value; scShift.innerHTML = buildOptions(true); scShift.value = cur; }
}

function openShiftCodeModal(code) {
  const isEdit = !!code;
  document.getElementById('shift-code-modal-title').textContent = isEdit ? 'Edit Shift Code' : 'Add Shift Code';
  document.getElementById('sc-delete-btn').classList.toggle('hidden', !isEdit);
  document.getElementById('sc-edit-key').value = code || '';
  document.getElementById('sc-preview').style.display = 'none';

  if(isEdit && cachedShiftCodes?.[code]) {
    const s = cachedShiftCodes[code];
    document.getElementById('sc-code').value = s.code;
    document.getElementById('sc-code').disabled = true; // can't rename a code
    document.getElementById('sc-name').value = s.name || '';
    document.getElementById('sc-start').value = s.start || '';
    document.getElementById('sc-end').value = s.end || '';
    document.getElementById('sc-break').value = s.breakMin ?? 60;
    document.getElementById('sc-type').value = s.type || 'regular';
    document.getElementById('sc-remarks').value = s.remarks || '';
  } else {
    document.getElementById('sc-code').value = '';
    document.getElementById('sc-code').disabled = false;
    document.getElementById('sc-name').value = '';
    document.getElementById('sc-start').value = '08:30';
    document.getElementById('sc-end').value = '17:30';
    document.getElementById('sc-break').value = 60;
    document.getElementById('sc-type').value = 'regular';
    document.getElementById('sc-remarks').value = '';
  }

  // Live preview
  ['sc-code','sc-name','sc-start','sc-end','sc-break'].forEach(id => {
    document.getElementById(id).oninput = updateShiftPreview;
  });
  updateShiftPreview();
  showModal('shift-code-modal');
}

function updateShiftPreview() {
  const code  = (document.getElementById('sc-code').value||'').toUpperCase().trim();
  const name  = document.getElementById('sc-name').value.trim();
  const start = document.getElementById('sc-start').value;
  const end   = document.getElementById('sc-end').value;
  const brk   = document.getElementById('sc-break').value;
  const prev  = document.getElementById('sc-preview');
  const txt   = document.getElementById('sc-preview-text');
  if(code || name) {
    prev.style.display = 'block';
    txt.textContent = `${code||'CODE'} — ${name||'Description'} | ${start||'--:--'} – ${end||'--:--'} | Break: ${brk||0}min`;
  } else {
    prev.style.display = 'none';
  }
}

async function saveShiftCode() {
  const editKey = document.getElementById('sc-edit-key').value;
  const rawCode = document.getElementById('sc-code').value.trim().toUpperCase();
  const code    = editKey || rawCode;
  const name    = document.getElementById('sc-name').value.trim();
  const start   = document.getElementById('sc-start').value;
  const end     = document.getElementById('sc-end').value;
  const breakMin= parseInt(document.getElementById('sc-break').value) || 0;
  const type    = document.getElementById('sc-type').value;
  const remarks = document.getElementById('sc-remarks').value.trim();

  if(!code) { toast('Shift Code ID is required','amber'); return; }
  if(!name) { toast('Name / Description is required','amber'); return; }
  if(!start || !end) { toast('Start and End time are required','amber'); return; }

  const btn = document.getElementById('sc-save-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    await db.ref(`shiftCodes/${code}`).set({name, start, end, breakMin, type, remarks, updatedAt:Date.now(), updatedBy:currentUserData?.name||''});
    toast(`Shift ${code} saved`);
    closeModal('shift-code-modal');
    loadShiftCodes();
  } catch(e) { toast('Save failed: '+e.message,'red'); }
  finally { btn.disabled=false; btn.textContent='Save Shift Code'; }
}

async function deleteShiftCode(code) {
  const c = code || document.getElementById('sc-edit-key').value;
  if(!c) return;
  if(!confirm(`Delete shift code "${c}"? This only removes it from custom overrides. Built-in defaults remain.`)) return;
  try {
    await db.ref(`shiftCodes/${c}`).remove();
    toast(`Shift ${c} deleted`,'red');
    closeModal('shift-code-modal');
    loadShiftCodes();
  } catch(e) { toast('Delete failed: '+e.message,'red'); }
}

// Also update getShiftStart/getShiftEnd to use cachedShiftCodes when available
const _origGetShiftStart = getShiftStart;
getShiftStart = function(code) {
  const c = normalizeShiftCode(code);
  if(cachedShiftCodes?.[c]?.start) {
    const [h,m] = cachedShiftCodes[c].start.split(':').map(Number);
    return {h,m};
  }
  return _origGetShiftStart(code);
};
const _origGetShiftEnd = getShiftEnd;
getShiftEnd = function(code) {
  const c = normalizeShiftCode(code);
  if(cachedShiftCodes?.[c]?.end) {
    const [h,m] = cachedShiftCodes[c].end.split(':').map(Number);
    return {h,m};
  }
  return _origGetShiftEnd(code);
};

// ==================== HOLIDAY SETUP ====================
async function loadGlobalHolidayShifts() {
  try {
    const snap = await db.ref('holidayShifts').once('value');
    globalHolidayShifts = snap.val() || {};
  } catch(e) {
    console.warn('Holiday setup load failed', e);
    globalHolidayShifts = {};
  }
}
function renderHolidayCodeBadge(code) {
  const c = normalizeShiftCode(code);
  const cls = c === 'LH' ? 'badge-red' : 'badge-amber';
  return `<span class="badge ${cls}">${c}</span>`;
}
async function loadHolidaySetup() {
  await loadGlobalHolidayShifts();
  const tbody = document.getElementById('holiday-body');
  if(!tbody) return;
  const rows = Object.keys(globalHolidayShifts).sort().map(date => ({date, ...(globalHolidayShifts[date] || {})}));
  if(!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:28px;color:var(--text3)">No holidays added yet</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${r.date}</td>
      <td>${renderHolidayCodeBadge(r.code)}</td>
      <td>${r.name || '—'}</td>
      <td>
        <div class="flex gap4">
          <button class="btn btn-ghost btn-xs" onclick="editHolidayShift('${r.date}')">Edit</button>
          <button class="btn btn-danger btn-xs" onclick="deleteHolidayShift('${r.date}')">Delete</button>
        </div>
      </td>
    </tr>`).join('');
}
async function saveHolidayShift() {
  const date = document.getElementById('holiday-date')?.value;
  const code = normalizeShiftCode(document.getElementById('holiday-code')?.value);
  const name = document.getElementById('holiday-name')?.value.trim() || (code === 'LH' ? 'Legal Holiday' : 'Special Holiday');
  if(!date || !['SH','LH'].includes(code)) { toast('Select holiday date and valid code', 'amber'); return; }
  try {
    await db.ref(`holidayShifts/${date}`).set({code, name, updatedAt: Date.now(), updatedBy: currentUserData?.name || ''});
    toast(`${code} holiday saved and applied to all timesheets`);
    document.getElementById('holiday-date').value = '';
    document.getElementById('holiday-name').value = '';
    await loadHolidaySetup();
    if(currentUserData?.role === 'manager') { loadAllTimesheets(); loadReports(); }
    else loadMyTimesheet();
  } catch(e) { toast('Failed to save holiday: ' + e.message, 'red'); }
}
function editHolidayShift(date) {
  const h = globalHolidayShifts?.[date] || {};
  document.getElementById('holiday-date').value = date;
  document.getElementById('holiday-code').value = normalizeShiftCode(h.code || 'SH');
  document.getElementById('holiday-name').value = h.name || '';
}
async function deleteHolidayShift(date) {
  if(!date) return;
  try {
    await db.ref(`holidayShifts/${date}`).remove();
    toast('Holiday removed');
    await loadHolidaySetup();
    if(currentUserData?.role === 'manager') { loadAllTimesheets(); loadReports(); }
    else loadMyTimesheet();
  } catch(e) { toast('Failed to delete holiday: ' + e.message, 'red'); }
}

// ==================== EMPLOYEES ====================
function showAddEmployeeModal() { showModal('add-emp-modal'); }

/* ===== ADD-EMPLOYEE MULTI-STEP HELPERS ===== */
let _currentEmpStep = 0;
const EMP_TOTAL_STEPS = 5;

function gotoEmpStep(idx) {
  _currentEmpStep = idx;
  document.querySelectorAll('#add-emp-modal .step-panel').forEach((p,i) => p.classList.toggle('active', i===idx));
  document.querySelectorAll('#add-emp-modal .step-tab').forEach((t,i) => t.classList.toggle('active', i===idx));
  document.getElementById('emp-step-indicator').textContent = `Step ${idx+1} of ${EMP_TOTAL_STEPS}`;
  document.getElementById('emp-prev-btn').style.display = idx === 0 ? 'none' : '';
  document.getElementById('emp-next-btn').classList.toggle('hidden', idx === EMP_TOTAL_STEPS-1);
  document.getElementById('emp-submit-btn').classList.toggle('hidden', idx !== EMP_TOTAL_STEPS-1);
  // Scroll modal body to top
  const mb = document.querySelector('#add-emp-modal .modal-body');
  if(mb) mb.scrollTop = 0;
  loadApproverOptions('emp-approver-uid');
}
function empStepNext() {
  if(_currentEmpStep < EMP_TOTAL_STEPS-1) gotoEmpStep(_currentEmpStep+1);
}
function empStepPrev() {
  if(_currentEmpStep > 0) gotoEmpStep(_currentEmpStep-1);
}

function computeAge() {
  const bday = document.getElementById('emp-bday').value;
  const disp = document.getElementById('emp-age-display');
  if(!bday){ disp.textContent='—'; return; }
  const today = new Date();
  const bd = new Date(bday);
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if(m < 0 || (m===0 && today.getDate() < bd.getDate())) age--;
  disp.textContent = age >= 0 ? age + ' yrs' : '—';
}

function computeServiceYears() {
  const hired = document.getElementById('emp-datehired').value;
  const disp = document.getElementById('emp-service-display');
  if(!hired){ disp.textContent='—'; return; }
  const today = new Date();
  const hd = new Date(hired);
  let yrs = today.getFullYear() - hd.getFullYear();
  const m = today.getMonth() - hd.getMonth();
  if(m < 0 || (m===0 && today.getDate() < hd.getDate())) yrs--;
  if(yrs < 0) yrs = 0;
  const months = Math.abs(today.getMonth() - hd.getMonth() + 12*(today.getFullYear()-hd.getFullYear())) % 12;
  disp.textContent = yrs > 0 ? `${yrs} yr${yrs!==1?'s':''} ${months}mo` : `${months} mo`;
}

function onCivilChange() {
  const val = document.getElementById('emp-civil').value;
  const sec = document.getElementById('married-section');
  if(sec) sec.style.display = (val==='Married') ? 'block' : 'none';
}

let _beneCount = 0;
function addBeneficiary() {
  _beneCount++;
  const n = _beneCount;
  const list = document.getElementById('beneficiary-list');
  const div = document.createElement('div');
  div.className = 'beneficiary-row';
  div.id = `bene-row-${n}`;
  div.innerHTML = `
    <button class="remove-bene" onclick="document.getElementById('bene-row-${n}').remove()">✕ Remove</button>
    <div style="font-size:11px;font-weight:700;color:var(--accent);margin-bottom:10px;text-transform:uppercase;letter-spacing:.4px">Beneficiary #${n}</div>
    <div class="form-grid">
      <div class="form-row"><label>First Name</label><input class="input bene-fname" placeholder="Maria"></div>
      <div class="form-row"><label>Middle Name</label><input class="input bene-mname" placeholder="Santos"></div>
    </div>
    <div class="form-grid">
      <div class="form-row"><label>Family Name</label><input class="input bene-lname" placeholder="Dela Cruz"></div>
      <div class="form-row"><label>Date of Birth</label><input type="date" class="input bene-bday"></div>
    </div>
    <div class="form-grid">
      <div class="form-row"><label>Relationship</label>
        <select class="input bene-rel">
          <option>Spouse</option><option>Child</option><option>Parent</option><option>Sibling</option>
          <option>Grandparent</option><option>Grandchild</option><option>Legal Guardian</option><option>Other</option>
        </select>
      </div>
      <div class="form-row"><label>Share (%)</label><input type="number" class="input bene-share" value="100" min="0" max="100"></div>
    </div>
  `;
  list.appendChild(div);
}

function getBeneficiaries() {
  const rows = document.querySelectorAll('#beneficiary-list .beneficiary-row');
  return Array.from(rows).map(row => ({
    firstName: (row.querySelector('.bene-fname')||{}).value||'',
    middleName: (row.querySelector('.bene-mname')||{}).value||'',
    lastName: (row.querySelector('.bene-lname')||{}).value||'',
    dateOfBirth: (row.querySelector('.bene-bday')||{}).value||'',
    relationship: (row.querySelector('.bene-rel')||{}).value||'',
    sharePercent: parseInt((row.querySelector('.bene-share')||{}).value||0)
  }));
}
/* ===== END ADD-EMPLOYEE HELPERS ===== */

async function createEmployee() {
  const firstName = document.getElementById('emp-fname').value.trim();
  const middleName = document.getElementById('emp-mname').value.trim();
  const lastName = document.getElementById('emp-lname').value.trim();
  const suffix = document.getElementById('emp-suffix').value.trim();
  const name = [firstName, middleName, lastName, suffix].filter(Boolean).join(' ');
  const empId=document.getElementById('emp-id').value.trim();
  const email=document.getElementById('emp-email').value.trim();
  const pass=document.getElementById('emp-pass').value;
  const role=document.getElementById('emp-role').value;
  const dept=document.getElementById('emp-dept').value.trim();
  const shift=document.getElementById('emp-shift').value;
  const restDays = Array.from(document.querySelectorAll('.rd-day:checked')).map(x=>x.value);
  const vl=parseInt(document.getElementById('emp-vl').value)||15;
  const ml=parseInt(document.getElementById('emp-ml').value)||60;
  const sl=parseInt(document.getElementById('emp-sl').value)||5;
  const el=parseInt(document.getElementById('emp-el').value)||0;
  if(!firstName||!lastName){toast('First Name and Family Name are required','amber');gotoEmpStep(0);return;}
  if(!empId||!email||!pass){toast('Employee ID, Email and Password are required','amber');gotoEmpStep(2);return;}

  const createBtn = Array.from(document.querySelectorAll('#add-emp-modal .btn-primary')).find(b => (b.textContent||'').includes('Create Employee'));
  if(createBtn){ createBtn.disabled = true; createBtn.textContent = 'Creating...'; }
  let secondAuth = null;

  try {
    // Create a secondary app to avoid signing out the currently logged-in admin.
    let secondApp;
    try { secondApp = firebase.app('secondary'); } catch(e) {
      secondApp = firebase.initializeApp(firebaseConfig,'secondary');
    }
    secondAuth = secondApp.auth();
    const cred = await secondAuth.createUserWithEmailAndPassword(email,pass);
    const uid = cred.user.uid;
    const position = (document.getElementById('emp-position')||{}).value?.trim()||'';
    const payload = {
      name, firstName, middleName, lastName, suffix, position,
      employeeId:empId, email, role, department:dept,
      shiftCode:shift, restDays, active:true,
      leaveBalances:{VL:vl,ML:ml},
      createdAt:Date.now(), createdBy:currentUserData?.uid||'',
      approverId:   (document.getElementById('emp-approver-uid')?.value||null)||undefined,
      approverName: (() => {
        const uid = document.getElementById('emp-approver-uid')?.value||'';
        if(!uid) return undefined;
        const a = (_cachedApprovers||[]).find(x=>x.uid===uid);
        return a ? (a.name||a.email) : undefined;
      })()
    };

    // Save employee profile. Try admin session first; if rules block admin writing another UID,
    // fallback to the newly-created employee session writing its own /users/{uid} node.
    let profileSaved = false;
    let adminWriteError = null;
    try {
      await db.ref(`users/${uid}`).set(payload);
      profileSaved = true;
    } catch(e) {
      adminWriteError = e;
      console.warn('Admin profile write failed; trying employee self-write', e);
    }

    if(!profileSaved) {
      try {
        await secondApp.database().ref(`users/${uid}`).set(payload);
        profileSaved = true;
      } catch(e2) {
        throw new Error(`Auth account was created but profile was NOT saved. New UID: ${uid}. Admin write: ${adminWriteError?.message||'n/a'}; self-write: ${e2.message}`);
      }
    }

    // Verification: if admin cannot read /users because of rules, loadEmployees will also fail.
    try {
      const verifySnap = await db.ref(`users/${uid}`).once('value');
      if(!verifySnap.exists()) throw new Error('Profile verification failed after save.');
    } catch(verifyErr) {
      toast('Employee created, but admin cannot verify/read users. Check Realtime Database rules.', 'amber');
      console.warn('Profile verification/read failed', verifyErr);
    }

    if(secondAuth) await secondAuth.signOut();
    toast(`Employee ${name} created successfully`);
    closeModal('add-emp-modal');
    loadEmployees();
    ['emp-name','emp-id','emp-email','emp-pass','emp-dept'].forEach(id=>document.getElementById(id).value='');
    document.querySelectorAll('.rd-day').forEach(x=>x.checked=false);
  } catch(e) {
    console.error('Create employee failed', e);
    let msg = e.message || String(e);
    if(e.code === 'auth/email-already-in-use') {
      msg = 'Email already exists in Firebase Authentication. If employee is missing in Employee Management, copy that user UID from Firebase Authentication and create/repair the profile under Realtime Database > users > UID.';
    }
    toast('Error: '+msg,'red');
  } finally {
    try { if(secondAuth) await secondAuth.signOut(); } catch(e) {}
    if(createBtn){ createBtn.disabled = false; createBtn.textContent = 'Create Employee'; }
  }
}
function stopEmployeeAutoRefresh() {
  if(employeeUsersRef && employeeUsersListener) {
    employeeUsersRef.off('value', employeeUsersListener);
  }
  employeeUsersRef = null;
  employeeUsersListener = null;
}

function renderEmployeesFromSnapshot(snap) {
  const rows = [];
  if(snap.exists()) snap.forEach(c=>rows.push({uid:c.key,...c.val()}));
  rows.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  _allEmployeeRows = rows;
  _filterAndRenderEmployees();
}

async function loadEmployees() {
  const tbody = document.getElementById('employees-body');
  if(tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text3)">Loading employees...</td></tr>`;

  // Always stop any old listener first — prevents stale single-user results
  stopEmployeeAutoRefresh();

  try {
    // STEP 1: Use REST ?shallow=true to get ALL UIDs regardless of role-based rules.
    // The $uid rule allows any authenticated user to read individual nodes, so
    // we enumerate keys first then fetch each — this works even when the bulk
    // /users read is restricted to managers only.
    const idToken = await auth.currentUser.getIdToken();
    const shallowResp = await fetch(`${firebaseConfig.databaseURL}/users.json?shallow=true&auth=${idToken}`);
    const shallowData = await shallowResp.json();

    if(!shallowData || shallowData.error) {
      // Shallow read failed entirely — fall back to SDK bulk read as last resort
      throw new Error(shallowData?.error || 'Shallow read returned null');
    }

    const uids = Object.keys(shallowData);

    // STEP 2: Fetch every user node in parallel using the SDK ($uid rule allows this)
    const snaps = await Promise.all(uids.map(uid => db.ref(`users/${uid}`).once('value')));

    const rows = [];
    snaps.forEach(s => { if(s.exists()) rows.push({uid: s.key, ...s.val()}); });
    rows.sort((a,b) => (a.name||'').localeCompare(b.name||''));

    renderEmployeeRows(rows);

  } catch(err) {
    console.warn('REST shallow fetch failed, trying SDK bulk read:', err.message);
    // Last resort: SDK bulk read (works if role === "manager" exactly)
    try {
      const snap = await db.ref('users').once('value');
      const rows = [];
      snap.forEach(c => rows.push({uid: c.key, ...c.val()}));
      rows.sort((a,b) => (a.name||'').localeCompare(b.name||''));
      renderEmployeeRows(rows);
    } catch(err2) {
      const tbody = document.getElementById('employees-body');
      if(tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--red)">
        Cannot load employees: ${err2.message}<br>
        <span style="font-size:12px;color:var(--text2)">Go to Firebase Console → Realtime Database → Rules and make sure the manager's <b>role</b> value is exactly <code>"manager"</code> (lowercase).</span>
      </td></tr>`;
      toast('Cannot load employees: ' + err2.message, 'red');
    }
  }
}

let _allEmployeeRows = [];

function _calcAge(dob) {
  if(!dob) return '—';
  const bd = new Date(dob+'T12:00:00'), today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if(m < 0 || (m===0 && today.getDate() < bd.getDate())) age--;
  return age >= 0 ? age : '—';
}
function _calcService(hired) {
  if(!hired) return '—';
  const hd = new Date(hired+'T12:00:00'), today = new Date();
  let yrs = today.getFullYear() - hd.getFullYear();
  const m = today.getMonth() - hd.getMonth();
  if(m < 0||(m===0&&today.getDate()<hd.getDate())) yrs--;
  if(yrs < 0) yrs = 0;
  const months = Math.abs((today.getMonth()- hd.getMonth()+12*(today.getFullYear()-hd.getFullYear()))%12);
  return yrs > 0 ? `${yrs}y ${months}m` : `${months}mo`;
}
function _fmtDOB(d) {
  if(!d) return '—';
  try { return new Date(d+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}); } catch(e){ return d; }
}
function _d(v){ return v||'—'; }
function _esc(v){ return (v||'').toString().replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _buildEmpRow(u) {
  const roleBadge = {manager:'badge-red',supervisor:'badge-purple',admin:'badge-amber'}[u.role]||'badge-blue';
  const roleLabel = {manager:'Manager',supervisor:'Supervisor',admin:'Admin'}[u.role]||'Rank & File';
  const addr = u.address || {};
  const ec   = u.emergencyContact || {};
  const gov  = u.govIds || {};
  const lb   = u.leaveBalances || {};
  const initials = (u.name||'U').split(' ').map(x=>x[0]).join('').substring(0,2).toUpperCase();
  return `<tr>
    <td style="position:sticky;left:0;background:var(--card);z-index:2;min-width:190px">
      <div style="display:flex;align-items:center;gap:9px">
        <div class="user-avatar" style="width:32px;height:32px;font-size:11px;flex-shrink:0">${initials}</div>
        <div>
          <div style="font-weight:600;font-size:13px;white-space:nowrap">${_esc(u.name||'—')}</div>
          <div style="font-size:10px;color:var(--text3);white-space:nowrap">${_esc(u.email||'')}</div>
        </div>
      </div>
    </td>
    <td><span class="mono" style="font-size:12px;color:var(--accent)">${_esc(u.employeeId||'—')}</span></td>
    <td style="font-size:12px;color:var(--text2);white-space:nowrap">${_esc(u.email||'—')}</td>
    <td><span class="badge ${roleBadge}" style="font-size:9px">${roleLabel}</span></td>
    <td><span class="badge ${u.active!==false?'badge-green':'badge-red'}">${u.active!==false?'Active':'Inactive'}</span></td>
    <!-- Personal -->
    <td class="emp-col-personal" style="white-space:nowrap;font-size:12px">${_fmtDOB(u.dateOfBirth)}</td>
    <td class="emp-col-personal" style="text-align:center;font-size:12px;font-family:var(--mono)">${_calcAge(u.dateOfBirth)}</td>
    <td class="emp-col-personal" style="font-size:12px">${_d(u.sex)}</td>
    <td class="emp-col-personal" style="font-size:12px;white-space:nowrap">${_d(u.civilStatus)}</td>
    <td class="emp-col-personal" style="font-size:12px">${_d(u.nationality)}</td>
    <td class="emp-col-personal" style="font-size:12px">${_d(u.religion)}</td>
    <td class="emp-col-personal" style="font-size:12px;text-align:center"><span class="badge badge-gray" style="font-size:10px">${_d(u.bloodType)}</span></td>
    <td class="emp-col-personal" style="font-size:12px">${_esc(u.spouseFname||'—')}</td>
    <td class="emp-col-personal" style="font-size:12px">${_esc(u.spouseLname||'—')}</td>
    <td class="emp-col-personal" style="text-align:center;font-size:12px;font-family:var(--mono)">${u.children??'—'}</td>
    <!-- Contact -->
    <td class="emp-col-contact" style="font-size:12px;max-width:140px;overflow:hidden;text-overflow:ellipsis">${_esc(addr.street||u.street||'—')}</td>
    <td class="emp-col-contact" style="font-size:12px;white-space:nowrap">${_esc(addr.city||u.city||'—')}</td>
    <td class="emp-col-contact" style="font-size:12px;white-space:nowrap">${_esc(addr.province||u.province||'—')}</td>
    <td class="emp-col-contact" style="font-size:12px;font-family:var(--mono);text-align:center">${_esc(addr.zip||u.zip||'—')}</td>
    <td class="emp-col-contact" style="font-size:12px;font-family:var(--mono);white-space:nowrap">${_esc(u.phone||'—')}</td>
    <td class="emp-col-contact" style="font-size:12px;white-space:nowrap">${_esc(ec.name||u.emergName||'—')}</td>
    <td class="emp-col-contact" style="font-size:12px;font-family:var(--mono);white-space:nowrap">${_esc(ec.no||u.emergNo||'—')}</td>
    <td class="emp-col-contact" style="font-size:12px">${_esc(ec.rel||u.emergRel||'—')}</td>
    <!-- Gov IDs -->
    <td class="emp-col-govids" style="font-size:11px;font-family:var(--mono);white-space:nowrap">${_esc(gov.sss||u.sss||'—')}</td>
    <td class="emp-col-govids" style="font-size:11px;font-family:var(--mono);white-space:nowrap">${_esc(gov.philhealth||u.philhealth||'—')}</td>
    <td class="emp-col-govids" style="font-size:11px;font-family:var(--mono);white-space:nowrap">${_esc(gov.pagibig||u.pagibig||'—')}</td>
    <td class="emp-col-govids" style="font-size:11px;font-family:var(--mono);white-space:nowrap">${_esc(gov.tin||u.tin||'—')}</td>
    <!-- Employment -->
    <td class="emp-col-employment" style="font-size:12px;white-space:nowrap">${_esc(u.position||u.jobTitle||'—')}</td>
    <td class="emp-col-employment" style="font-size:12px;white-space:nowrap">${_esc(u.department||'—')}</td>
    <td class="emp-col-employment" style="font-size:12px;white-space:nowrap">${_esc(u.employmentType||u.empType||'—')}</td>
    <td class="emp-col-employment" style="font-size:12px;white-space:nowrap">${_fmtDOB(u.dateHired)}</td>
    <td class="emp-col-employment" style="font-size:11px;font-family:var(--mono);white-space:nowrap;text-align:center">${_calcService(u.dateHired)}</td>
    <td class="emp-col-employment"><span class="badge badge-gray" style="font-size:10px;font-family:var(--mono)">${_esc(u.shiftCode||u.shift||'—')}</span></td>
    <td class="emp-col-employment" style="font-size:11px;color:var(--text2)">${Array.isArray(u.restDays)&&u.restDays.length?u.restDays.join(', '):'—'}</td>
    <!-- Benefits -->
    <td class="emp-col-benefits" style="text-align:center;font-family:var(--mono);font-size:12px">${lb.VL??u.vl??'—'}</td>
    <td class="emp-col-benefits" style="text-align:center;font-family:var(--mono);font-size:12px">${lb.ML??u.ml??'—'}</td>
    <td class="emp-col-benefits" style="text-align:center;font-family:var(--mono);font-size:12px">${lb.SL??u.sl??'—'}</td>
    <td class="emp-col-benefits" style="text-align:center;font-family:var(--mono);font-size:12px">${lb.EL??u.el??'—'}</td>
    <td class="emp-col-benefits" style="font-family:var(--mono);font-size:12px;white-space:nowrap;color:var(--accent)">${u.salary?'₱'+Number(u.salary).toLocaleString('en-PH',{minimumFractionDigits:2}):'—'}</td>
    <td class="emp-col-benefits" style="font-size:11px;white-space:nowrap">${_d(u.payFrequency||u.payFreq)}</td>
    <!-- Actions -->
    <td style="position:sticky;right:0;background:var(--card);z-index:2">
      <div class="flex gap4">
        <button class="btn btn-ghost btn-xs" onclick="editEmployee('${u.uid}')">Edit</button>
        <button class="btn btn-ghost btn-xs" onclick="toggleEmployee('${u.uid}',${u.active!==false})" style="font-size:10px">${u.active!==false?'Deactivate':'Activate'}</button>
      </div>
    </td>
  </tr>`;
}

function filterEmployeeTable() {
  const q = (document.getElementById('emp-search')?.value||'').toLowerCase().trim();
  const st = (document.getElementById('emp-status-filter')?.value||'').toLowerCase();
  let filtered = _allEmployeeRows;
  if(q) filtered = filtered.filter(u =>
    (u.name||'').toLowerCase().includes(q) ||
    (u.employeeId||'').toLowerCase().includes(q) ||
    (u.department||'').toLowerCase().includes(q) ||
    (u.email||'').toLowerCase().includes(q) ||
    (u.position||'').toLowerCase().includes(q)
  );
  if(st === 'active')   filtered = filtered.filter(u => u.active !== false);
  if(st === 'inactive') filtered = filtered.filter(u => u.active === false);
  _filterAndRenderEmployees(filtered);
}

function _filterAndRenderEmployees(filtered) {
  if(!filtered) filtered = _allEmployeeRows;
  const tbody = document.getElementById('employees-body');
  if(!tbody) return;
  const countEl = document.getElementById('emp-record-count');
  if(countEl) countEl.textContent = `${filtered.length} employee${filtered.length===1?'':'s'}`;
  if(!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="40" style="text-align:center;padding:40px;color:var(--text3)">No employees found</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(_buildEmpRow).join('');
}

function toggleEmpColGroup(group) {
  const cols = document.querySelectorAll(`.emp-col-${group}`);
  const chk  = document.querySelector(`input[onchange="toggleEmpColGroup('${group}')"]`);
  const show  = chk ? chk.checked : true;
  cols.forEach(el => el.style.display = show ? '' : 'none');
}

function exportEmployeesCSV() {
  const rows = _allEmployeeRows;
  if(!rows.length){ toast('No employees to export','amber'); return; }
  const header = ['Name','Employee ID','Email','Role','Status','Date of Birth','Sex','Civil Status','Nationality','Religion','Blood Type','Spouse First','Spouse Last','Children','Street','City','Province','ZIP','Phone','Emergency Name','Emergency #','Emergency Rel','SSS','PhilHealth','Pag-IBIG','TIN','Position','Department','Emp Type','Date Hired','Shift','Rest Days','VL','ML','SL','EL','Salary','Pay Freq'];
  const q = v => `"${(v??'').toString().replace(/"/g,'""')}"`;
  const body = rows.map(u => {
    const addr=u.address||{},ec=u.emergencyContact||{},gov=u.govIds||{},lb=u.leaveBalances||{};
    return [u.name,u.employeeId,u.email,u.role,u.active!==false?'Active':'Inactive',u.dateOfBirth,u.sex,u.civilStatus,u.nationality,u.religion,u.bloodType,u.spouseFname,u.spouseLname,u.children,addr.street||u.street,addr.city||u.city,addr.province||u.province,addr.zip||u.zip,u.phone,ec.name||u.emergName,ec.no||u.emergNo,ec.rel||u.emergRel,gov.sss||u.sss,gov.philhealth||u.philhealth,gov.pagibig||u.pagibig,gov.tin||u.tin,u.position||u.jobTitle,u.department,u.employmentType||u.empType,u.dateHired,u.shiftCode||u.shift,(u.restDays||[]).join(';'),lb.VL??u.vl,lb.ML??u.ml,lb.SL??u.sl,lb.EL??u.el,u.salary,u.payFrequency||u.payFreq].map(q).join(',');
  });
  downloadCSV([header.map(q).join(','),...body].join('\n'), 'employees_export.csv');
  toast('CSV exported successfully');
}

function renderEmployeeRows(rows) {
  rows = rows.filter(u => !u.deleted); // exclude soft-deleted employees
  // Scope: non-admin approvers only see their assigned employees
  if (_isScopedView()) {
    rows = rows.filter(u => _isMyEmployee(u));
  }
  rows.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  _allEmployeeRows = rows;
  // Show scoping notice
  const notice = document.getElementById('emp-scope-notice');
  if (notice) {
    if (_isScopedView()) {
      notice.textContent = `Showing ${rows.length} employee${rows.length===1?'':'s'} assigned to you`;
      notice.classList.remove('hidden');
    } else {
      notice.classList.add('hidden');
    }
  }
  _filterAndRenderEmployees();
}

async function toggleEmployee(uid, currentActive) {
  await db.ref(`users/${uid}`).update({active:!currentActive});
  toast('Employee status updated');
  loadEmployees();
}

/* ── Role change handler: show/hide & auto-check permissions ── */
function onEmpRoleChange(prefix) {
  const roleEl = document.getElementById(prefix + '-role');
  if(!roleEl) return;
  const role = roleEl.value;
  const isAdmin   = role === 'admin';
  const isManager = role === 'manager';
  const isSupervisor = role === 'supervisor';

  // Permission checkboxes selector differs between add (emp-perm) and edit (edit-emp-perm)
  const permClass = prefix === 'emp' ? '.emp-perm' : '.edit-emp-perm';
  const hintId    = prefix === 'emp' ? 'emp-perms-hint' : 'edit-emp-perms-hint';
  const hint      = document.getElementById(hintId);

  document.querySelectorAll(permClass).forEach(cb => {
    if(isAdmin) {
      // Admin gets everything, all locked on
      cb.checked = true;
      cb.disabled = true;
    } else if(isManager) {
      // Manager gets everything on by default, but still editable
      cb.checked = true;
      cb.disabled = false;
    } else if(isSupervisor) {
      // Supervisor: employee pages on, manager pages off by default
      const mgrPages = ['all-timesheet','approvals','employees','holidays','shift-codes','kiosk','reports'];
      if(!cb.disabled) cb.checked = !mgrPages.includes(cb.value);
      cb.disabled = false;
    } else {
      // Rank & File: standard employee pages, manager pages off
      const mgrPages = ['all-timesheet','approvals','employees','holidays','shift-codes','kiosk','reports'];
      if(!cb.disabled) cb.checked = !mgrPages.includes(cb.value);
      cb.disabled = false;
    }
  });

  if(hint) {
    if(isAdmin)        hint.textContent = 'Admin role has full access to all pages — permissions are locked on.';
    else if(isManager) hint.textContent = 'Manager role has full access by default. You may restrict individual pages below.';
    else               hint.textContent = 'Select which pages this user can access.';
  }
}


function switchEditTab(idx) {
  document.querySelectorAll('.edit-tab-btn').forEach((b,i) => b.classList.toggle('active', i===idx));
  document.querySelectorAll('.edit-tab-panel').forEach((p,i) => p.classList.toggle('active', i===idx));
}
function editComputeAge() {
  const bday = document.getElementById('edit-emp-bday').value;
  const disp = document.getElementById('edit-emp-age-display');
  if(!bday){ disp.textContent='—'; return; }
  const today = new Date(), bd = new Date(bday+'T12:00:00');
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if(m < 0||(m===0&&today.getDate()<bd.getDate())) age--;
  disp.textContent = age >= 0 ? age + ' yrs' : '—';
}
function editComputeService() {
  const hired = document.getElementById('edit-emp-datehired').value;
  const disp = document.getElementById('edit-emp-service-display');
  if(!hired){ disp.textContent='—'; return; }
  const today = new Date(), hd = new Date(hired+'T12:00:00');
  let yrs = today.getFullYear() - hd.getFullYear();
  const m = today.getMonth() - hd.getMonth();
  if(m < 0||(m===0&&today.getDate()<hd.getDate())) yrs--;
  if(yrs<0) yrs=0;
  const months = Math.abs((today.getMonth()-hd.getMonth()+12*(today.getFullYear()-hd.getFullYear()))%12);
  disp.textContent = yrs>0?`${yrs}y ${months}mo`:`${months} mo`;
}
function editComputeSalary() {
  const sal = parseFloat(document.getElementById('edit-emp-salary').value)||0;
  const info = document.getElementById('edit-sal-info');
  if(sal > 0) {
    const daily = sal/26, hourly = daily/8;
    info.style.display='block';
    info.textContent = `Daily: ₱${daily.toLocaleString('en-PH',{minimumFractionDigits:2})}  |  Hourly: ₱${hourly.toLocaleString('en-PH',{minimumFractionDigits:4})}`;
  } else { info.style.display='none'; }
}
function editOnCivilChange() {
  const val = document.getElementById('edit-emp-civil').value;
  const sec = document.getElementById('edit-married-section');
  if(sec) sec.style.display = (val==='Married') ? '' : 'none';
}

async function editEmployee(uid) {
  try {
    const snap = await db.ref(`users/${uid}`).once('value');
    if(!snap.exists()){ toast('Employee not found','red'); return; }
    const u = snap.val();

    // Reset tabs to first
    switchEditTab(0);

    // Parse name fields
    let editFname = u.firstName || '';
    let editMname = u.middleName || u.middleInitial || '';
    let editLname = u.lastName || '';
    let editSuffix = u.suffix || '';
    if (!editFname && !editLname && u.name) {
      const SUFFIXES = ['Jr.','Sr.','II','III','IV','V','Jr','Sr'];
      let parts = u.name.trim().split(/\s+/);
      const last = parts[parts.length - 1];
      if (SUFFIXES.includes(last)) { editSuffix = last; parts = parts.slice(0,-1); }
      if (parts.length >= 3) { editFname = parts[0]; editMname = parts[1]; editLname = parts.slice(2).join(' '); }
      else if (parts.length === 2) { editFname = parts[0]; editLname = parts[1]; }
      else { editFname = u.name; }
    }

    const set = (id, val) => { const el = document.getElementById(id); if(el) el.value = val||''; };
    const setCheck = (id, val) => { const el = document.getElementById(id); if(el) el.checked = !!val; };

    // TAB 0: Identity
    set('edit-emp-uid', uid);
    set('edit-emp-name', u.name||'');
    set('edit-emp-fname', editFname);
    set('edit-emp-mname', editMname);
    set('edit-emp-lname', editLname);
    set('edit-emp-suffix', editSuffix);
    set('edit-emp-id', u.employeeId||'');
    set('edit-emp-email', u.email||'');
    set('edit-emp-role', u.role||'rank');
    set('edit-emp-active', u.active===false?'false':'true');
    set('edit-emp-pass', '');

    // Banner
    const banner = document.getElementById('edit-emp-banner');
    if(banner) banner.textContent = `${u.name||'Employee'} · ${u.employeeId||'No ID'} · ${u.department||'No Dept'}`;

    // TAB 1: Personal
    const addr = u.address || {};
    const ec   = u.emergencyContact || {};
    const gov  = u.govIds || {};
    const lb   = u.leaveBalances || {};
    set('edit-emp-bday', u.dateOfBirth||'');
    set('edit-emp-sex', u.sex||'');
    set('edit-emp-civil', u.civilStatus||'');
    set('edit-emp-bloodtype', u.bloodType||'');
    set('edit-emp-nationality', u.nationality||'');
    set('edit-emp-religion', u.religion||'');
    set('edit-emp-spouse-fname', u.spouseFname||'');
    set('edit-emp-spouse-lname', u.spouseLname||'');
    set('edit-emp-children', u.children??0);
    editComputeAge();
    editOnCivilChange();

    // TAB 2: Contact
    set('edit-emp-street', addr.street||u.street||'');
    set('edit-emp-city', addr.city||u.city||'');
    set('edit-emp-province', addr.province||u.province||'');
    set('edit-emp-region', addr.region||u.region||'');
    set('edit-emp-zip', addr.zip||u.zip||'');
    set('edit-emp-phone', u.phone||'');
    set('edit-emp-emergency-name', ec.name||u.emergName||'');
    set('edit-emp-emergency-no', ec.no||u.emergNo||'');
    set('edit-emp-emergency-rel', ec.rel||u.emergRel||'');

    // TAB 3: Gov IDs
    set('edit-emp-sss', gov.sss||u.sss||'');
    set('edit-emp-philhealth', gov.philhealth||u.philhealth||'');
    set('edit-emp-pagibig', gov.pagibig||u.pagibig||'');
    set('edit-emp-tin', gov.tin||u.tin||'');

    // TAB 4: Employment
    set('edit-emp-position', u.position||u.jobTitle||'');
    set('edit-emp-dept', u.department||'');
    set('edit-emp-emptype', u.employmentType||u.empType||'Regular');
    set('edit-emp-datehired', u.dateHired||'');
    set('edit-emp-shift', u.shiftCode||u.shift||'0830A');
    loadApproverOptions('edit-emp-approver-uid', u.approverId||'');
    document.querySelectorAll('.edit-rd-day').forEach(cb => {
      cb.checked = Array.isArray(u.restDays) && u.restDays.includes(cb.value);
    });
    editComputeService();

    // TAB 5: Benefits
    set('edit-emp-vl', lb.VL??u.vl??15);
    set('edit-emp-ml', lb.ML??u.ml??60);
    set('edit-emp-sl', lb.SL??u.sl??5);
    set('edit-emp-el', lb.EL??u.el??0);
    set('edit-emp-salary', u.salary||'');
    set('edit-emp-payfreq', u.payFrequency||u.payFreq||'Monthly');
    editComputeSalary();

    // TAB 6: Permissions
    const perms = u.permissions || {};
    document.querySelectorAll('.edit-emp-perm').forEach(cb => {
      cb.checked = !!perms[cb.value];
    });
    onEmpRoleChange('edit-emp');

    showModal('edit-emp-modal');
  } catch(e) { toast('Error loading employee: ' + e.message, 'red'); }
}

async function saveEditEmployee() {
  const uid = document.getElementById('edit-emp-uid').value;
  const firstName  = document.getElementById('edit-emp-fname').value.trim();
  const middleName = document.getElementById('edit-emp-mname').value.trim();
  const lastName   = document.getElementById('edit-emp-lname').value.trim();
  const suffix     = document.getElementById('edit-emp-suffix').value.trim();
  const name = [firstName, middleName, lastName, suffix].filter(Boolean).join(' ');
  const empId = document.getElementById('edit-emp-id').value.trim();
  const role  = document.getElementById('edit-emp-role').value;
  const activeVal = document.getElementById('edit-emp-active')?.value;
  const active = activeVal !== 'false';

  if(!firstName || !lastName){ toast('First Name and Family Name are required','amber'); switchEditTab(0); return; }
  if(!empId){ toast('Employee ID is required','amber'); switchEditTab(0); return; }

  const saveBtn = document.getElementById('edit-emp-save-btn');
  saveBtn.disabled = true; saveBtn.textContent = 'Saving…';

  const g = id => (document.getElementById(id)||{}).value||'';
  const gn = id => parseInt(document.getElementById(id)?.value)||0;
  const gf = id => parseFloat(document.getElementById(id)?.value)||0;

  // Permissions
  const permissions = {};
  document.querySelectorAll('.edit-emp-perm').forEach(cb => { if(cb.checked) permissions[cb.value]=true; });

  try {
    const payload = {
      // Identity
      name, firstName, middleName, lastName, suffix,
      employeeId: empId, role, active,
      // Personal
      dateOfBirth: g('edit-emp-bday'),
      sex: g('edit-emp-sex'),
      civilStatus: g('edit-emp-civil'),
      bloodType: g('edit-emp-bloodtype'),
      nationality: g('edit-emp-nationality'),
      religion: g('edit-emp-religion'),
      spouseFname: g('edit-emp-spouse-fname'),
      spouseLname: g('edit-emp-spouse-lname'),
      children: gn('edit-emp-children'),
      // Contact
      address: {
        street: g('edit-emp-street'),
        city: g('edit-emp-city'),
        province: g('edit-emp-province'),
        region: g('edit-emp-region'),
        zip: g('edit-emp-zip'),
      },
      phone: g('edit-emp-phone'),
      emergencyContact: {
        name: g('edit-emp-emergency-name'),
        no:   g('edit-emp-emergency-no'),
        rel:  g('edit-emp-emergency-rel'),
      },
      // Gov IDs
      govIds: {
        sss:        g('edit-emp-sss'),
        philhealth: g('edit-emp-philhealth'),
        pagibig:    g('edit-emp-pagibig'),
        tin:        g('edit-emp-tin'),
      },
      // Employment
      position:       g('edit-emp-position'),
      department:     g('edit-emp-dept'),
      employmentType: g('edit-emp-emptype'),
      dateHired:      g('edit-emp-datehired'),
      shiftCode:      g('edit-emp-shift'),
      restDays: Array.from(document.querySelectorAll('.edit-rd-day:checked')).map(x=>x.value),
      // Benefits
      leaveBalances: {
        VL: gn('edit-emp-vl'),
        ML: gn('edit-emp-ml'),
        SL: gn('edit-emp-sl'),
        EL: gn('edit-emp-el'),
      },
      salary:       gf('edit-emp-salary') || null,
      payFrequency: g('edit-emp-payfreq'),
      // Permissions
      permissions,
      approverId:   g('edit-emp-approver-uid') || null,
      approverName: (() => {
        const uid = g('edit-emp-approver-uid');
        if (!uid) return null;
        const a = (_cachedApprovers||[]).find(x=>x.uid===uid);
        return a ? (a.name||a.email) : null;
      })(),
      updatedAt: Date.now(),
      updatedBy: currentUserData?.uid || '',
    };

    // Remove null/empty strings to keep DB clean
    Object.keys(payload).forEach(k => { if(payload[k] === '' || payload[k] === null) delete payload[k]; });

    await db.ref(`users/${uid}`).update(payload);

    // Optional password update
    const newPass = document.getElementById('edit-emp-pass').value;
    if(newPass && newPass.length >= 6) {
      toast('Note: Password update requires Admin SDK. Profile saved successfully.', 'amber');
    }

    invalidateApproverCache();
    toast(`${name} updated successfully`);
    closeModal('edit-emp-modal');
    loadEmployees();
  } catch(e) {
    toast('Save failed: ' + e.message, 'red');
  } finally {
    saveBtn.disabled = false; saveBtn.textContent = '💾 Save Changes';
  }
}

function confirmDeleteEmployee() {
  const uid = document.getElementById('edit-emp-uid').value;
  const fname = document.getElementById('edit-emp-fname')?.value || '';
  const lname = document.getElementById('edit-emp-lname')?.value || '';
  const name = document.getElementById('edit-emp-name').value || [fname, lname].filter(Boolean).join(' ');
  const empId = document.getElementById('edit-emp-id').value;
  const email = document.getElementById('edit-emp-email').value;
  document.getElementById('delete-emp-info').innerHTML =
    `<strong>${name}</strong><br>ID: ${empId}<br>Email: ${email}<br>UID: <span style="font-family:var(--mono);font-size:11px">${uid}</span>`;
  closeModal('edit-emp-modal');
  showModal('delete-emp-modal');
}

async function executeDeleteEmployee() {
  const uid = document.getElementById('edit-emp-uid').value;
  const name = document.getElementById('edit-emp-name').value;
  if(!uid){ toast('No employee selected','red'); return; }

  const btn = document.getElementById('delete-emp-confirm-btn');
  btn.disabled = true; btn.textContent = 'Deleting...';

  try {
    // Soft delete: mark as deleted instead of .remove() to avoid
    // PERMISSION_DENIED caused by faceTimeLogs child rule blocking cascade deletes.
    await db.ref(`users/${uid}`).update({
      deleted: true,
      deletedAt: Date.now(),
      deletedBy: currentUserData?.name || auth?.currentUser?.email || ''
    });
    toast(`${name} has been deleted`, 'red');
    closeModal('delete-emp-modal');
    loadEmployees();
    // Keep management screens in sync after soft delete.
    // This immediately removes the deleted employee from Team Timesheets rows.
    if (typeof loadAllTimesheets === 'function') loadAllTimesheets();
    if (typeof loadPayrollGrid === 'function') loadPayrollGrid();
  } catch(e) {
    toast('Delete failed: ' + e.message, 'red');
  } finally {
    btn.disabled = false; btn.textContent = '🗑 Soft Delete / Hide';
  }
}


async function executePermanentDeleteEmployeeData() {
  const uid = document.getElementById('edit-emp-uid').value;
  const name = document.getElementById('edit-emp-name').value || uid;
  if(!uid){ toast('No employee selected','red'); return; }

  const typed = prompt(
    `PERMANENT DELETE WARNING\n\n` +
    `This will permanently delete database records for:\n${name}\n\n` +
    `Deleted paths include users, timelogs, requests, payslips, salary agreements, notifications, and other employee-linked records.\n\n` +
    `This cannot be undone. Type DELETE to continue.`
  );
  if(typed !== 'DELETE') {
    toast('Permanent delete cancelled. Type DELETE exactly to confirm.', 'amber');
    return;
  }

  const btn = document.getElementById('permanent-delete-emp-btn');
  if(btn){ btn.disabled = true; btn.textContent = 'Deleting forever...'; }

  try {
    const updates = {};
    updates[`users/${uid}`] = null;
    updates[`timelogs/${uid}`] = null;
    updates[`requests/${uid}`] = null;
    updates[`payslips/${uid}`] = null;
    updates[`salaryAgreements/${uid}`] = null;
    updates[`notifications/${uid}`] = null;
    updates[`faceTimeLogs/${uid}`] = null;
    updates[`employeeQR/${uid}`] = null;
    updates[`attendance/${uid}`] = null;
    updates[`employeeQRCodes/${uid}`] = null;

    await db.ref().update(updates);

    // Delete the Firebase Authentication account through a secure callable Cloud Function.
    // Required deployed function name: deleteAuthUser
    // Expected payload: { uid }
    try {
      const deleteAuthUser = fbFunctions.httpsCallable('deleteAuthUser');
      const authDeleteResult = await deleteAuthUser({ uid });
      console.warn('[Permanent Delete] Auth delete result:', authDeleteResult?.data || authDeleteResult);
      toast(`${name} database records and Firebase Auth account permanently deleted.`, 'green');
    } catch(authErr) {
      console.error('Firebase Auth delete failed after RTDB delete:', authErr);
      toast(`Database records deleted, but Firebase Auth delete failed: ${authErr.message || authErr}`, 'red');
      toast('Check/deploy Cloud Function deleteAuthUser, or delete the Auth account manually in Firebase Console.', 'amber');
    }

    closeModal('delete-emp-modal');
    if (typeof loadEmployees === 'function') loadEmployees();
    if (typeof loadAllTimesheets === 'function') loadAllTimesheets();
    if (typeof loadPayrollGrid === 'function') loadPayrollGrid();
    if (typeof loadAllRequests === 'function') loadAllRequests();
    console.warn('[Permanent Delete] Removed RTDB records for UID:', uid);
    toast('Permanent delete finished. If Auth deletion failed, delete the Auth user manually or check Cloud Function logs.', 'amber');
  } catch(e) {
    toast('Permanent delete failed: ' + e.message, 'red');
    console.error('Permanent delete failed', e);
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = '🔥 Permanent Delete Data'; }
  }
}

// ==================== REPORTS ====================
async function fetchAllUsersWithFallback() {
  // Try bulk read first; if denied, use shallow REST + per-UID reads
  try {
    const snap = await db.ref('users').once('value');
    const users = {};
    snap.forEach(c => users[c.key] = c.val());
    return users;
  } catch(e) {
    console.warn('Bulk /users read denied in reports, using per-UID fallback:', e.message);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const resp = await fetch(`${firebaseConfig.databaseURL}/users.json?shallow=true&auth=${idToken}`);
      const shallow = await resp.json();
      if(!shallow || shallow.error) return {};
      const uids = Object.keys(shallow);
      const snaps = await Promise.all(uids.map(uid => db.ref(`users/${uid}`).once('value')));
      const users = {};
      snaps.forEach(s => { if(s.exists()) users[s.key] = s.val(); });
      return users;
    } catch(e2) {
      console.error('Per-UID fallback in reports failed:', e2.message);
      return {};
    }
  }
}


/* ─────────────────────────────────────────────────────────────
   APPROVER SCOPING HELPERS
   Admin sees all employees. Manager/Supervisor only sees
   employees whose approverId === their UID.
   ───────────────────────────────────────────────────────────── */
function _approverUid() {
  return (typeof currentUserData !== 'undefined' && currentUserData?.uid) || '';
}
function _isAdminRole() {
  const r = String(currentUserData?.role || '').toLowerCase().trim();
  return r === 'admin';
}
function _isScopedView() {
  // Returns true when the current user is an approver but NOT admin
  const r = String(currentUserData?.role || '').toLowerCase().trim();
  return ['manager','supervisor','hr'].includes(r) && !_isAdminRole();
}
function _isMyEmployee(u) {
  if (!u) return false;
  if (_isAdminRole()) return true;
  const myUid = _approverUid();
  if (!myUid) return true; // fallback: show all if uid unknown
  // Employee is "mine" if their approverId points to me
  return u.approverId === myUid;
}

async function loadReports() {
  const today = todayStr();

  // Show period chip
  const periodChip = document.getElementById('rpt-period-chip');
  if(periodChip) {
    const ps = periodStart || '—', pe = periodEnd || '—';
    periodChip.textContent = ps === '—' ? 'All time' : `${ps} → ${pe}`;
  }

  const users = await fetchAllUsersWithFallback();
  const activeUsers = Object.fromEntries(
    Object.entries(users).filter(([uid,u]) =>
      u.deleted !== true && u.active !== false && _isMyEmployee({...u, uid})
    )
  );
  const total = Object.keys(activeUsers).length;

  const setEl = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  setEl('rpt-total', total);

  db.ref('timelogs').once('value').then(tlSnap=>{
    let present=0, absentToday=0, leave=0, late=0, totalOT=0;
    const summary={};
    Object.keys(activeUsers).forEach(uid=>{
      summary[uid]={name:activeUsers[uid].name,present:0,absent:0,leave:0,late:0,undertime:0,ot:0,reg:0};
    });
    tlSnap.forEach(uSnap=>{
      const uid=uSnap.key;
      if(!summary[uid]) return;
      uSnap.forEach(dSnap=>{
        const r=dSnap.val();
        const inPeriod = !periodStart||!periodEnd||(r.date>=periodStart&&r.date<=periodEnd);
        if(!inPeriod) return;
        if(r.status==='present'||r.timeIn){
          summary[uid].present++;
          if(r.date===today){ present++; if(r.lateMinutes>0) late++; }
        }
        if(r.status==='absent'){ summary[uid].absent++; if(r.date===today) absentToday++; }
        if(r.status==='leave'){ summary[uid].leave++; if(r.date===today) leave++; }
        summary[uid].late   += Number(r.lateMinutes||0);
        summary[uid].undertime += Number(r.undertimeMinutes||r.undertime||0);
        summary[uid].ot     += Number(r.OTHours||0);
        summary[uid].reg    += Number(r.regularWorkHrs||0);
        totalOT             += Number(r.OTHours||0);
      });
    });

    const presentPct  = total > 0 ? Math.round((present/total)*100) : 0;
    const absentPct   = total > 0 ? Math.round((absentToday/total)*100) : 0;

    setEl('rpt-present', present);
    setEl('rpt-absent',  absentToday);
    setEl('rpt-leave',   leave);
    setEl('rpt-late',    late);
    setEl('rpt-ot-total', totalOT.toFixed(1) + 'h');
    setEl('rpt-present-pct', presentPct + '% attendance');
    setEl('rpt-absent-pct',  absentPct  + '% absent');

    const tbody = document.getElementById('report-body');
    const rows  = Object.values(summary).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
    if(!rows.length){ tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text3)">No data for this period</td></tr>`; return; }
    const maxPresent = Math.max(...rows.map(r=>r.present), 1);
    tbody.innerHTML = rows.map(r=>{
      const initials = (r.name||'?').trim().split(/\s+/).map(x=>x[0]).join('').substring(0,2).toUpperCase();
      const attPct = r.present+r.absent+r.leave > 0 ? Math.round((r.present/(r.present+r.absent+r.leave))*100) : 0;
      const barW   = Math.round((r.present/maxPresent)*100);
      const lateClass   = r.late   > 120 ? 'rpt-late-warning'   : 'mono';
      const absentClass = r.absent > 3   ? 'rpt-absent-warning' : 'mono';
      return `<tr>
        <td>
          <div class="rpt-name-cell">
            <div class="rpt-avatar">${initials}</div>
            <div>
              <div style="font-weight:600;font-size:13px">${r.name||'—'}</div>
              <div class="rpt-bar"><div class="rpt-bar-fill" style="width:${barW}%;background:var(--accent)"></div></div>
            </div>
          </div>
        </td>
        <td style="text-align:center" class="mono" style="color:var(--green)">${r.present}</td>
        <td style="text-align:center" class="${absentClass}">${r.absent}</td>
        <td style="text-align:center" class="mono" style="color:var(--blue)">${r.leave}</td>
        <td style="text-align:center" class="${lateClass}">${r.late}</td>
        <td style="text-align:center" class="mono" style="color:var(--amber)">${(r.undertime/60).toFixed(2)}</td>
        <td style="text-align:center" class="mono" style="color:var(--green)">${r.ot.toFixed(2)}</td>
        <td style="text-align:center" class="mono">${r.reg.toFixed(2)}</td>
        <td style="text-align:center">
          <span style="font-size:11px;font-family:var(--mono);font-weight:700;color:${attPct>=90?'var(--green)':attPct>=75?'var(--amber)':'var(--red)'}">${attPct}%</span>
        </td>
      </tr>`;
    }).join('');
  });
}

// ==================== QR TOKEN HELPERS ====================
function generateKioskToken() {
  // Kiosk token = "KIOSK:" + time slot (changes every 10s)
  const slot = Math.floor(Date.now() / 10000);
  return `KIOSK:${slot}`;
}

function parseKioskToken(token) {
  // Returns true if this is a valid unexpired kiosk token
  if(!token.startsWith('KIOSK:')) return false;
  const slot = Number(token.split(':')[1]);
  const currentSlot = Math.floor(Date.now() / 10000);
  return slot >= currentSlot - 1; // accept current or 1 slot behind (~20s grace)
}

// ==================== KIOSK QR DISPLAY (big screen) ====================
let kioskQRInterval = null;
let kioskCountdownInterval = null;

function startKioskQRDisplay() {
  renderKioskQR();

  // Sync rotation to the 10-second clock boundary
  function scheduleRotation() {
    const msUntilNext = 10000 - (Date.now() % 10000);
    setTimeout(() => {
      renderKioskQR();
      kioskQRInterval = setInterval(renderKioskQR, 10000);
    }, msUntilNext);
  }
  scheduleRotation();

  // Countdown bar + number
  function updateCountdown() {
    const remaining = Math.ceil((10000 - (Date.now() % 10000)) / 1000);
    const pct = ((10000 - (Date.now() % 10000)) / 10000) * 100;
    const cd = document.getElementById('kiosk-countdown');
    const bar = document.getElementById('kiosk-progress-bar');
    if(cd) {
      cd.textContent = remaining + 's';
      cd.style.color = remaining <= 3 ? 'var(--red)' : remaining <= 6 ? 'var(--amber)' : 'var(--green)';
    }
    if(bar) {
      bar.style.width = pct + '%';
      bar.style.background = remaining <= 3 ? 'var(--red)' : remaining <= 6 ? 'var(--amber)' : 'var(--accent)';
    }
  }
  updateCountdown();
  kioskCountdownInterval = setInterval(updateCountdown, 250);

  // Listen for timelog events written by employees scanning
  db.ref('kioskScans').limitToLast(1).on('child_added', snap => {
    const data = snap.val();
    if(!data) return;
    // Only show results from last 15 seconds
    if(Date.now() - data.scannedAt > 15000) return;
    showKioskResult(data);
  });
}

function renderKioskQR() {
  const token = generateKioskToken();
  const qrDiv = document.getElementById('kiosk-qr-code');
  if(!qrDiv) return;
  qrDiv.innerHTML = '';
  new QRCode(qrDiv, { text: token, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.H });
}

function showKioskResult(data) {
  const result = document.getElementById('kiosk-result');
  if(!result) return;
  const typeColors = {'TIME IN':'badge-green','TIME OUT':'badge-blue','ALREADY DONE':'badge-gray'};
  document.getElementById('kiosk-type-badge').innerHTML = `<span class="badge ${typeColors[data.type]||'badge-gray'}" style="font-size:14px;padding:6px 16px">${data.type}</span>`;
  document.getElementById('kiosk-emp-name').textContent = data.employeeName || '—';
  document.getElementById('kiosk-emp-id').textContent = `${data.employeeId||''} • ${data.department||''}`;
  document.getElementById('kiosk-time').textContent = fmtTime(data.scannedAt);
  document.getElementById('kiosk-status-msg').textContent =
    data.type==='TIME IN' ? `Welcome! Shift: ${data.shiftCode||''}` :
    data.type==='TIME OUT' ? 'Have a great day!' : 'Already recorded for today.';
  result.style.display = 'block';
  setTimeout(() => { result.style.display = 'none'; }, 5000);
}

// ==================== EMPLOYEE SCANNER (phone scans kiosk QR) ====================
let employeeScanner = null;

function initMyQR() {
  const u = currentUserData;
  document.getElementById('my-shift-display').textContent = u.shiftCode || '—';
  document.getElementById('my-dept-display').textContent = u.department || '—';
  document.getElementById('my-empid-display').textContent = u.employeeId || '—';
  document.getElementById('vl-balance').textContent = u.leaveBalances?.VL ?? '—';
  document.getElementById('ml-balance').textContent = u.leaveBalances?.ML ?? '—';
}

function getCameraErrorMessage(e) {
  const raw = String(e && (e.message || e.name || e) || '');
  const name = String(e && e.name || '');
  // If the error already has a clear human message (set by our catch block), use it directly
  if(e && e.message && e.message.length > 20 && !e.message.includes('DOMException')) return e.message;
  const msg = (name + ' ' + raw).toLowerCase();
  if(name === 'FileProtocolError' || msg.includes('file://') || msg.includes('fileprotocol')) return 'Opened as a local file — camera is blocked. Double-click the file to open it in your browser, not via VS Code preview.';
  if(name === 'VSCodeError' || msg.includes('vscode')) return 'VS Code preview cannot access the camera. Open this file directly in Chrome or Edge.';
  if(name === 'NotAllowedError' || msg.includes('notallowed') || msg.includes('denied')) return 'Camera permission denied. Click the 🔒 lock icon in address bar → Camera → Allow, then refresh the page.';
  if(name === 'NotReadableError' || msg.includes('notreadable') || msg.includes('in use')) return 'Camera is in use by another app (Teams, Zoom, etc.). Close those apps then try again.';
  if(name === 'NotFoundError' || msg.includes('notfound') || msg.includes('no camera')) return 'No camera found. Check Device Manager (Windows) or System Preferences (Mac) to make sure your camera is enabled.';
  if(!window.isSecureContext) return 'Camera needs HTTPS. Open via https:// or localhost — not file://.';
  return 'Camera error: ' + (name || 'Unknown') + '. Try a different browser (Chrome or Edge recommended).';
}
function showCameraFallback(containerId, message, mode='employee') {
  const el = document.getElementById(containerId);
  if(!el) return;
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const ua2 = navigator.userAgent || '';
  const isVSCode2 = ua2.includes('Code') || ua2.includes('Electron') ||
                    location.search.includes('vscode') || location.href.includes('vscode');
  const tip = isVSCode2
    ? '👉 Open this file in Chrome, Edge, or Firefox \u2014 VS Code built-in preview blocks camera access.'
    : isMobile
      ? 'Allow camera access in your browser settings, then tap Try Again.'
      : 'Click Try Again and allow camera access when your browser asks. Make sure no other app is using the camera.';
  const retryFn = mode === 'manager' ? 'startInlineScanner' : 'startEmployeeScanner';
  el.innerHTML = `<div style="width:100%;min-height:190px;display:flex;align-items:center;justify-content:center;padding:18px;background:var(--amber-bg);border:1px solid var(--amber);border-radius:var(--r);text-align:center;color:var(--amber);line-height:1.55">
    <div>
      <div style="font-size:30px;margin-bottom:8px">📷</div>
      <div style="font-weight:700;margin-bottom:6px">Camera not available</div>
      <div style="font-size:12px;max-width:320px">${message}</div>
      <div style="font-size:11px;color:var(--text2);margin-top:10px">${tip}</div>
      <button onclick="${retryFn}()" style="margin-top:12px;padding:8px 20px;background:var(--accent);color:#fff;border:none;border-radius:var(--r);font-size:13px;cursor:pointer;font-family:var(--font);font-weight:500">🔄 Try Again</button>
    </div>
  </div>`;
}
// Requests camera permission via getUserMedia, stops the stream,
// then returns the best camera config for Html5Qrcode.
async function requestCameraPermissionAndGetConfig() {
  // Fail fast inside VS Code Live Preview — it has no camera access
  const ua = navigator.userAgent || '';
  const isVSCode = ua.includes('Code') || ua.includes('Electron') ||
                   location.search.includes('vscode') || location.href.includes('vscode');
  if(isVSCode) {
    throw {name:'VSCodeError', message:'VS Code Live Preview cannot access the camera.'};
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw {name:'NotSupportedError', message:'Camera API not supported in this browser.'};
  }
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const facingPref = isMobile ? 'environment' : 'user';

  // Always call getUserMedia first — this is the ONLY reliable way to trigger
  // the browser permission prompt. enumerateDevices/getCameras will NOT prompt.
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
  } catch(err) {
    console.error('[Camera] getUserMedia failed:', err.name, err.message, location.href);
    const n = String(err && err.name || '').toLowerCase();
    const origin = location.protocol + '//' + location.host;
    const isFile = location.protocol === 'file:';
    const isVSCodeUrl = location.href.includes('vscode');
    if(isFile) throw {name:'FileProtocolError', message:'File opened as file:// — camera blocked. Open in a web server or real browser tab.'};
    if(isVSCodeUrl) throw {name:'VSCodeError', message:'VS Code preview blocks camera. Open file directly in Chrome/Edge.'};
    if(n.includes('notallowed') || n.includes('denied') || n.includes('permission')) {
      throw {name:'NotAllowedError', message:'Camera permission denied for ' + origin + '. Click the lock icon → Camera → Allow, then refresh.'};
    }
    if(n.includes('notfound') || n.includes('devicenotfound')) {
      throw {name:'NotFoundError', message:'No camera hardware found. Check Device Manager or System Settings.'};
    }
    if(n.includes('notreadable') || n.includes('trackstart')) {
      throw {name:'NotReadableError', message:'Camera is in use by another app. Close Teams, Zoom, or other camera apps and try again.'};
    }
    throw {name: err.name || 'UnknownError', message: err.message || 'Unknown camera error'};
  } finally {
    if(stream) stream.getTracks().forEach(t => t.stop());
  }

  // Wait for hardware to fully release before Html5Qrcode re-acquires it
  await new Promise(r => setTimeout(r, 300));

  // Now enumerate with labels visible (permission already granted above)
  let cameras = [];
  try {
    if(window.Html5Qrcode) cameras = await Html5Qrcode.getCameras();
  } catch(e) { cameras = []; }

  if(cameras && cameras.length > 0) {
    // On phones prefer rear camera; on laptops take the first (webcam)
    const preferred = isMobile
      ? cameras.find(c => /back|rear|environment/i.test(c.label || ''))
      : null;
    return { deviceId: { exact: (preferred || cameras[0]).id } };
  }

  // Last resort — facingMode works on most mobile browsers even without a device ID
  return { facingMode: { ideal: facingPref } };
}

async function startEmployeeScanner() {
  const startBtn = document.getElementById('emp-scan-start-btn');
  const stopBtn = document.getElementById('emp-scan-stop-btn');
  const statusDot = document.getElementById('scan-status-dot');
  startBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');
  statusDot.innerHTML = `<div style="width:6px;height:6px;border-radius:50%;background:var(--green);animation:blink 1s infinite"></div> Checking camera...`;

  try {
    const cameraConfig = await requestCameraPermissionAndGetConfig();
    employeeScanner = new Html5Qrcode('employee-qr-reader');
    statusDot.innerHTML = `<div style="width:6px;height:6px;border-radius:50%;background:var(--green);animation:blink 1s infinite"></div> Scanning...`;

    await employeeScanner.start(
      cameraConfig,
      {fps:5, qrbox:{width:180,height:180}, rememberLastUsedCamera:true},
      async token => {
        await stopEmployeeScanner();
        statusDot.innerHTML = `<div style="width:6px;height:6px;border-radius:50%;background:var(--amber)"></div> Processing...`;

        if(!parseKioskToken(token.trim())) {
          toast('Invalid or expired QR — please scan the current kiosk QR', 'red');
          statusDot.innerHTML = `<div style="width:6px;height:6px;border-radius:50%;background:var(--red)"></div> Expired QR`;
          setTimeout(() => {
            statusDot.innerHTML = `<div style="width:6px;height:6px;border-radius:50%;background:var(--text3)"></div> Ready`;
          }, 3000);
          return;
        }

        const result = await recordTimelog(currentUserData.uid, document.getElementById('emp-scan-type')?.value || 'timeIn');
        if(result) {
          showEmployeeScanResult(result);
          await db.ref('kioskScans').push({
            type: result.type,
            message: result.message || '',
            employeeName: result.emp.name,
            employeeId: result.emp.employeeId,
            department: result.emp.department,
            shiftCode: result.emp.shiftCode,
            scannedAt: Date.now()
          });
          loadMyTimesheet();
        }
        statusDot.innerHTML = `<div style="width:6px;height:6px;border-radius:50%;background:var(--text3)"></div> Ready`;
      },
      () => {}
    );
  } catch(e) {
    console.error('[Camera] startEmployeeScanner failed:', e && e.name, e && e.message, e);
    const msg = getCameraErrorMessage(e);
    toast(msg, 'red');
    showCameraFallback('employee-qr-reader', msg, 'employee');
    statusDot.innerHTML = `<div style="width:6px;height:6px;border-radius:50%;background:var(--red)"></div> No Camera`;
    await stopEmployeeScanner();
  }
}

async function stopEmployeeScanner() {
  if(employeeScanner) {
    try { await employeeScanner.stop(); } catch(e) {}
    employeeScanner = null;
  }
  document.getElementById('emp-scan-start-btn')?.classList.remove('hidden');
  document.getElementById('emp-scan-stop-btn')?.classList.add('hidden');
}

function showEmployeeScanResult(result) {
  const card = document.getElementById('emp-scan-result');
  const typeColors = {
    'IN':'badge-green','NOON OUT':'badge-amber','NOON IN':'badge-green','SNACK OUT':'badge-amber','SNACK IN':'badge-green','OUT':'badge-blue',
    'ALREADY RECORDED':'badge-gray','WRONG ORDER':'badge-red','ERROR':'badge-red'
  };
  document.getElementById('emp-result-badge').innerHTML = `<span class="badge ${typeColors[result.type]||'badge-gray'}" style="font-size:15px;padding:7px 20px">${result.type}</span>`;
  document.getElementById('emp-result-name').textContent = result.emp?.name || '—';
  document.getElementById('emp-result-sub').textContent = `${result.emp?.employeeId || ''} • ${result.emp?.department || ''}`;
  document.getElementById('emp-result-time').textContent = result.time ? fmtTime(result.time) : '—';
  document.getElementById('emp-result-msg').textContent = result.message || 'Scan processed.';
  card.style.display = 'block';
}

// ==================== TIMELOG CORE ====================
async function recordTimelog(uid, selectedPunchType) {
  const punchMap = {
    timeIn: {label:'IN', field:'timeIn', prev:null, icon:'🟢'},
    noonOut: {label:'NOON OUT', field:'noonOut', prev:'timeIn', icon:'🍽️'},
    noonIn: {label:'NOON IN', field:'noonIn', prev:'noonOut', icon:'✅'},
    snackBreakOut: {label:'SNACK OUT', field:'snackBreakOut', prev:'noonIn', icon:'☕'},
    snackBreakIn: {label:'SNACK IN', field:'snackBreakIn', prev:'snackBreakOut', icon:'✅'},
    timeOut: {label:'OUT', field:'timeOut', prev:'timeIn', icon:'🔵'}
  };
  const selected = punchMap[selectedPunchType] || punchMap.timeIn;

  const snap = await db.ref(`users/${uid}`).once('value');
  if(!snap.exists()) { toast('Employee not found. Please scan a valid employee QR.', 'red'); return null; }
  const emp = snap.val(); emp.uid = uid;
  const today = todayStr();
  const now = Date.now();
  const todayShiftCode = (typeof getEmployeeShiftForDate==='function'?getEmployeeShiftForDate(emp,today):(emp.shiftCode||DEFAULT_WORK_SHIFT_CODE));
  const logRef = db.ref(`timelogs/${uid}/${today}`);
  const logSnap = await logRef.once('value');
  const existing = logSnap.val() || null;
  const baseLog = {
    date: today, employeeName: emp.name, employeeId: emp.employeeId, department: emp.department||'', shiftCode: todayShiftCode,
    timeIn: null, noonOut: null, noonIn: null, snackBreakOut: null, snackBreakIn: null, timeOut: null,
    status: 'present', regularWorkHrs: 0, totalWorkHrs: 0, excessWorkHrs: 0, lateMinutes: 0, OTHours: 0, undertimeMinutes: 0, absence: 0
  };
  const currentLog = existing ? {...baseLog, ...existing} : {...baseLog};

  if(currentLog[selected.field]) {
    const duplicateMsg = `${selected.icon} ${selected.label} already recorded at ${fmtTime(currentLog[selected.field])}. Use Time Correction if you need to change it.`;
    await db.ref(`scanLogs/${today}/${uid}`).push({type:selected.label,field:selected.field,time:now,status:'duplicate_blocked',message:duplicateMsg,source:'qr',createdAt:firebase.database.ServerValue.TIMESTAMP});
    toast(duplicateMsg, 'amber');
    return {type:'ALREADY RECORDED', emp, time:now, message:duplicateMsg};
  }

  if(selected.prev && !currentLog[selected.prev]) {
    const prevLabel = Object.values(punchMap).find(x => x.field === selected.prev)?.label || selected.prev;
    const wrongOrderMsg = `⚠️ Please scan ${prevLabel} first before ${selected.label}.`;
    await db.ref(`scanLogs/${today}/${uid}`).push({type:selected.label,field:selected.field,time:now,status:'wrong_order_blocked',requiredPreviousField:selected.prev,message:wrongOrderMsg,source:'qr',createdAt:firebase.database.ServerValue.TIMESTAMP});
    toast(wrongOrderMsg, 'red');
    return {type:'WRONG ORDER', emp, time:now, message:wrongOrderMsg};
  }

  const mergedLog = {...currentLog, [selected.field]: now, status:'present'};
  const metrics = calculateTimelogMetrics(mergedLog);
  const updates = existing ? {} : {...baseLog};
  updates[selected.field] = now;
  updates.status = 'present';
  updates.regularWorkHrs = metrics.regularWorkHrs;
  updates.totalWorkHrs = metrics.totalWorkHrs;
  updates.excessWorkHrs = metrics.excessWorkHrs;
  updates.lateMinutes = metrics.lateMinutes;
  updates.undertimeMinutes = metrics.undertimeMinutes;
  updates.OTHours = metrics.OTHours;
  updates.absence = metrics.absence;
  updates.updatedAt = firebase.database.ServerValue.TIMESTAMP;
  await logRef.update(updates);

  const successMsg = `${selected.icon} ${selected.label} saved for ${emp.name} at ${fmtTime(now)}.`;
  await db.ref(`scanLogs/${today}/${uid}`).push({type:selected.label,field:selected.field,time:now,status:'saved',message:successMsg,source:'qr',createdAt:firebase.database.ServerValue.TIMESTAMP});
  toast(successMsg, 'green');
  return {type:selected.label, emp, time:now, message:successMsg};
}

function displayKioskResult(result, container) {
  if(!result) return;
  const typeColors = {
    'IN':'badge-green','NOON OUT':'badge-amber','NOON IN':'badge-green','SNACK OUT':'badge-amber','SNACK IN':'badge-green','OUT':'badge-blue',
    'ALREADY RECORDED':'badge-gray','WRONG ORDER':'badge-red','ERROR':'badge-red'
  };
  document.getElementById(`${container}-type-badge`).innerHTML = `<span class="badge ${typeColors[result.type]||'badge-gray'}" style="font-size:14px;padding:6px 16px">${result.type}</span>`;
  document.getElementById(`${container}-emp-name`).textContent = result.emp?.name || '—';
  document.getElementById(`${container}-emp-id`).textContent = `${result.emp?.employeeId || ''} • ${result.emp?.department||''}`;
  document.getElementById(`${container}-time`).textContent = result.time ? fmtTime(result.time) : '—';
  document.getElementById(`${container}-status-msg`).textContent = result.message || 'Scan processed.';
}

// INLINE SCANNER (Manager kiosk page — still uses camera to scan employee phones if needed)
async function startInlineScanner() {
  const startBtn = document.getElementById('inline-start-btn');
  const stopBtn = document.getElementById('inline-stop-btn');
  startBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');

  try {
    const cameraConfig = await requestCameraPermissionAndGetConfig();
    inlineScanner = new Html5Qrcode('inline-reader');
    await inlineScanner.start(
      cameraConfig,
      {fps:5,qrbox:{width:180,height:180},rememberLastUsedCamera:true},
      async uid => {
        await stopInlineScanner();
        const result = await recordTimelog(uid.trim(), document.getElementById('inline-scan-type')?.value || 'timeIn');
        document.getElementById('inline-result-card').style.display='block';
        displayKioskResult(result,'inline');
        loadRecentScans();
        setTimeout(()=>startInlineScanner(), 3000);
      },
      ()=>{}
    );
  } catch(e) {
    const msg = getCameraErrorMessage(e);
    toast(msg, 'red');
    showCameraFallback('inline-reader', msg, 'manager');
    await stopInlineScanner();
  }
}

async function stopInlineScanner() {
  if(inlineScanner) {
    try { await inlineScanner.stop(); } catch(e){}
    inlineScanner = null;
  }
  document.getElementById('inline-start-btn')?.classList.remove('hidden');
  document.getElementById('inline-stop-btn')?.classList.add('hidden');
}

// Stub — no longer used but kept safe
function startKioskScanner() {}
async function stopKioskScanner() {
 if(kioskQRInterval) { clearInterval(kioskQRInterval); kioskQRInterval = null; }
 if(kioskCountdownInterval) { clearInterval(kioskCountdownInterval); kioskCountdownInterval = null; }
 try { db.ref('kioskScans').off(); } catch(e) {}
}

function loadRecentScans() {
  const today = todayStr();
  db.ref('timelogs').once('value').then(snap=>{
    const scans=[];
    snap.forEach(uSnap=>{
      const d=uSnap.child(today).val();
      if(d&&(d.timeIn||d.timeOut)) scans.push(d);
    });
    scans.sort((a,b)=>Math.max(b.timeOut||0,b.timeIn||0)-Math.max(a.timeOut||0,a.timeIn||0));
    const c=document.getElementById('recent-scans-list');
    if(!scans.length){c.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">No scans today yet</div>`;return;}
    c.innerHTML=scans.slice(0,15).map(r=>`<div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
      <div class="user-avatar" style="width:28px;height:28px;font-size:10px">${(r.employeeName||'?').split(' ').map(x=>x[0]).join('').substring(0,2).toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500">${r.employeeName||'—'}</div>
        <div style="font-size:11px;color:var(--text2)">${r.shiftCode||'—'}</div>
      </div>
      <div style="text-align:right">
        ${r.timeIn?`<div style="font-size:11px;color:var(--green)">IN: ${fmtTime(r.timeIn)}</div>`:''}
        ${r.timeOut?`<div style="font-size:11px;color:var(--accent)">OUT: ${fmtTime(r.timeOut)}</div>`:''}
      </div>
    </div>`).join('');
  });
}

// ==================== EXPORT CSV ====================
function exportMyCSV() {
  const rows=[];
  document.querySelectorAll('#my-timesheet-body tr:not(.legacy-total-row)').forEach(tr=>{
    rows.push(Array.from(tr.querySelectorAll('td')).map(td=>`"${td.innerText.replace(/"/g,'""')}"`).join(','));
  });
  const header='Work/Rest,Date,Shift,In,Noon Out,Noon In,Snack Out,Snack In,Out,Reg Hrs,Total Hrs,Excess Hrs,Late,UT,OT,Absence,Leave,Leave Days,Applications';
  downloadCSV([header,...rows].join('\n'),'my_timesheet.csv');
}
function exportAllCSV() {
  // Build a uid→details lookup from the live allTimelogs data
  const detailMap = {};
  (allTimelogs || []).forEach(r => {
    if (r.uid && !detailMap[r.uid]) {
      detailMap[r.uid] = {
        firstName:  r.firstName  || '',
        middleName: r.middleName || '',
        lastName:   r.lastName   || '',
        suffix:     r.suffix     || '',
        position:   r.position   || '',
        employeeId: r.employeeId || ''
      };
    }
  });

  const csvQ = v => (v||'').toString().includes(',') ? `"${v}"` : (v||'');

  const rows = [];
  document.querySelectorAll('#all-ts-table tbody tr').forEach(tr => {
    const tds = Array.from(tr.querySelectorAll('td'));
    // Get employee display name + ID from the cell
    const nameEl = tds[0] && tds[0].querySelector('.team-ts-emp-name');
    const idEl   = tds[0] && tds[0].querySelector('.team-ts-emp-id');
    const empId  = idEl ? idEl.innerText.trim() : '';

    // Look up name parts from data; fallback to splitting display name
    let det = Object.values(detailMap).find(d => d.employeeId === empId) || {};
    const firstName  = det.firstName  || '';
    const middleName = det.middleName || '';
    const lastName   = det.lastName   || '';
    const suffix     = det.suffix     || '';
    const position   = det.position   || '';

    // Remaining cells — skip td[0] (emp cell) and td[1] (status dot)
    const rest = tds.slice(2).map(td => csvQ(td.innerText.replace(/\n/g,' ').trim()));

    rows.push([
      csvQ(lastName), csvQ(firstName), csvQ(middleName), csvQ(suffix),
      csvQ(empId), csvQ(position),
      ...rest
    ].join(','));
  });

  const header = 'Last Name,First Name,Middle Name/Initial,Suffix,Employee ID,Position,Date,Shift,In,Noon Out,Noon In,Snack Out,Snack In,Out,Reg Hrs,Total Hrs,Excess Hrs,Late,UT,OT,Abs.,Leave,Lv Days,App';
  downloadCSV([header,...rows].join('\n'),'all_timesheets.csv');
}

function downloadCSV(content, filename) {
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(content);
  a.download = filename;
  a.click();
  toast('CSV exported');
}

// Close modals on backdrop click
document.querySelectorAll('.modal-overlay').forEach(o=>{
  o.addEventListener('click',e=>{ if(e.target===o) o.classList.add('hidden'); });
});

// Set today as default for date inputs
document.addEventListener('DOMContentLoaded',()=>{
  const t = todayStr();
  ['tc-date','sc-date','ot-date','ut-date','lv-from','lv-to'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.value=t;
  });
});


// ==================== MOBILE FRIENDLY NAV ====================
(function setupMobileNavigation(){
  function ensureMobileControls(){
    const header = document.querySelector('.app-header');
    const appBody = document.querySelector('.app-body');
    const sidebar = document.querySelector('.sidebar');
    if(!header || !appBody || !sidebar) return;

    if(!document.getElementById('mobile-menu-btn')){
      const btn = document.createElement('button');
      btn.id = 'mobile-menu-btn';
      btn.className = 'mobile-menu-btn';
      btn.type = 'button';
      btn.setAttribute('aria-label','Open menu');
      btn.innerHTML = '☰';
      const toggleMenu = function(e){
        if(e){ e.preventDefault(); e.stopPropagation(); }
        document.body.classList.toggle('sidebar-open');
      };
      btn.addEventListener('click', toggleMenu);
      btn.addEventListener('touchend', toggleMenu, {passive:false});
      header.insertBefore(btn, header.firstChild);
    }

    if(!document.getElementById('mobile-sidebar-backdrop')){
      const backdrop = document.createElement('div');
      backdrop.id = 'mobile-sidebar-backdrop';
      backdrop.className = 'mobile-sidebar-backdrop';
      const closeSidebar = function(e){
        if(e){ e.preventDefault(); e.stopPropagation(); }
        document.body.classList.remove('sidebar-open');
      };
      backdrop.addEventListener('click', closeSidebar);
      backdrop.addEventListener('touchend', closeSidebar, {passive:false});
      document.body.appendChild(backdrop);
    }

    // Only block touchstart/pointerdown bubbling to backdrop.
    // NEVER block 'click' in capture — it prevents onclick="showPage()" from firing.
    ['touchstart','pointerdown'].forEach(function(evt){
      if(sidebar.dataset['bound_'+evt] === '1') return;
      sidebar.dataset['bound_'+evt] = '1';
      sidebar.addEventListener(evt, function(e){ e.stopPropagation(); }, {capture:true, passive:true});
    });

    document.querySelectorAll('.nav-item').forEach(function(item){
      if(item.dataset.mobileBound === '1') return;
      item.dataset.mobileBound = '1';
      item.addEventListener('click', function(e){
        e.stopPropagation();
        if(window.innerWidth <= 768) setTimeout(()=>document.body.classList.remove('sidebar-open'), 120);
      });
      item.addEventListener('touchend', function(e){
        e.stopPropagation();
        e.preventDefault();
        var page = item.getAttribute('data-page');
        if(page && typeof showPage === 'function') showPage(page);
        if(window.innerWidth <= 768) setTimeout(function(){ document.body.classList.remove('sidebar-open'); }, 120);
      }, {passive:false});
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureMobileControls);
  else ensureMobileControls();
  window.addEventListener('load', ensureMobileControls);
  window.addEventListener('resize', function(){ if(window.innerWidth > 768) document.body.classList.remove('sidebar-open'); else ensureMobileControls(); });
  setInterval(function(){ if(window.innerWidth <= 768) ensureMobileControls(); }, 1000);
})();


// ==================== PAYROLL MANAGEMENT ====================

// ---- Salary modal: dual-mode daily/monthly rate computation ----
(function(){
  const WORK_DAYS = 26;

  // Switch between "enter monthly" vs "enter daily rate" modes
  window.onSalModeChange = function(){
    const mode = document.querySelector('input[name="sal-mode"]:checked')?.value || 'monthly';
    const basicEl  = document.getElementById('sal-basic');
    const dailyEl  = document.getElementById('sal-daily');
    const basicLbl = document.getElementById('sal-basic-label');
    const dailyNote= document.getElementById('sal-daily-note');

    if(mode === 'daily'){
      // Daily Rate is the input → Monthly is computed
      dailyEl.readOnly = false;
      dailyEl.style.background = '';
      dailyEl.style.cursor = 'text';
      dailyEl.style.color = 'var(--text)';
      dailyNote.textContent = '(enter here)';
      dailyNote.style.color = 'var(--amber)';

      basicEl.readOnly = true;
      basicEl.style.background = 'var(--bg3)';
      basicEl.style.cursor = 'not-allowed';
      basicEl.style.color = 'var(--accent)';
      basicLbl.innerHTML = 'Basic Monthly Salary <span style="color:var(--text3);font-size:10px">(auto from daily)</span>';
    } else {
      // Monthly is the input → Daily is computed
      basicEl.readOnly = false;
      basicEl.style.background = '';
      basicEl.style.cursor = 'text';
      basicEl.style.color = 'var(--text)';
      basicLbl.innerHTML = 'Basic Monthly Salary *';

      dailyEl.readOnly = true;
      dailyEl.style.background = 'var(--bg3)';
      dailyEl.style.cursor = 'not-allowed';
      dailyEl.style.color = 'var(--accent)';
      dailyNote.textContent = '(auto)';
      dailyNote.style.color = 'var(--accent)';
    }
    computeRates();
  };

  function computeRates(){
    const mode    = document.querySelector('input[name="sal-mode"]:checked')?.value || 'monthly';
    const basicEl = document.getElementById('sal-basic');
    const dailyEl = document.getElementById('sal-daily');
    const hourlyEl= document.getElementById('sal-hourly');
    const infoEl  = document.getElementById('sal-rate-info');

    let basicMonthly = 0, dailyRate = 0, hourlyRate = 0;

    if(mode === 'daily'){
      // User entered daily rate → compute monthly
      dailyRate    = parseFloat(dailyEl?.value) || 0;
      basicMonthly = dailyRate * WORK_DAYS;
      hourlyRate   = dailyRate / 8;
      if(basicEl) { basicEl.value = basicMonthly > 0 ? basicMonthly.toFixed(2) : ''; }
    } else {
      // User entered monthly → compute daily
      basicMonthly = parseFloat(basicEl?.value) || 0;
      dailyRate    = basicMonthly > 0 ? basicMonthly / WORK_DAYS : 0;
      hourlyRate   = dailyRate / 8;
      if(dailyEl) { dailyEl.value = dailyRate > 0 ? dailyRate.toFixed(4) : ''; }
    }

    if(hourlyEl) hourlyEl.value = hourlyRate > 0 ? hourlyRate.toFixed(4) : '';

    // Show info chip
    if(infoEl){
      if(basicMonthly > 0 && dailyRate > 0){
        infoEl.style.display = 'block';
        infoEl.innerHTML =
          `₱${dailyRate.toLocaleString('en-PH',{minimumFractionDigits:2})} / day &nbsp;×&nbsp; ${WORK_DAYS} days &nbsp;=&nbsp; ` +
          `<strong>₱${basicMonthly.toLocaleString('en-PH',{minimumFractionDigits:2})} / month</strong>` +
          `&nbsp;&nbsp;|&nbsp;&nbsp;Hourly: ₱${hourlyRate.toLocaleString('en-PH',{minimumFractionDigits:4})}`;
      } else {
        infoEl.style.display = 'none';
      }
    }
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const basicEl = document.getElementById('sal-basic');
    const dailyEl = document.getElementById('sal-daily');
    const freqEl  = document.getElementById('sal-freq');
    if(basicEl) basicEl.addEventListener('input', computeRates);
    if(dailyEl) dailyEl.addEventListener('input', computeRates);
    if(freqEl)  freqEl.addEventListener('change', computeRates);
  });

  window.computeSalaryRates = computeRates;
})();

// ---- Load Payroll Grid (manager view) ----
async function loadPayrollGrid() {
  const grid = document.getElementById('payroll-emp-grid');
  if(!grid) return;
  grid.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text3);grid-column:1/-1">Loading employees…</div>`;
  try {
    // Load all employees
    let rows = [];
    try {
      const idToken = await auth.currentUser.getIdToken();
      const resp = await fetch(`${firebaseConfig.databaseURL}/users.json?shallow=true&auth=${idToken}`);
      const shallow = await resp.json();
      if(shallow && !shallow.error) {
        const uids = Object.keys(shallow);
        const snaps = await Promise.all(uids.map(uid => db.ref(`users/${uid}`).once('value')));
        snaps.forEach(s => { if(s.exists()) rows.push({uid:s.key,...s.val()}); });
      } else throw new Error('Shallow failed');
    } catch(e) {
      const snap = await db.ref('users').once('value');
      snap.forEach(c => rows.push({uid:c.key,...c.val()}));
    }
    rows.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    allPayrollEmployees = rows;
    renderPayrollGrid(rows);
  } catch(e) {
    grid.innerHTML = `<div style="text-align:center;padding:60px;color:var(--red);grid-column:1/-1">Failed to load: ${e.message}</div>`;
  }
}

let allPayrollEmployees = [];

function filterPayrollList() {
  const q = (document.getElementById('payroll-search')?.value || '').toLowerCase();
  const filtered = q ? allPayrollEmployees.filter(u =>
    (u.name||'').toLowerCase().includes(q) || (u.employeeId||'').toLowerCase().includes(q) || (u.department||'').toLowerCase().includes(q)
  ) : allPayrollEmployees;
  renderPayrollGrid(filtered);
}

function renderPayrollGrid(employees) {
  const grid = document.getElementById('payroll-emp-grid');
  if(!grid) return;
  if(!employees.length) {
    grid.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text3);grid-column:1/-1">No employees found</div>`;
    return;
  }
  grid.innerHTML = employees.map(u => {
    const initials = (u.name||'U').split(' ').map(x=>x[0]).join('').substring(0,2).toUpperCase();
    const hasSalary = u.salaryInfo?.basicMonthly > 0;
    const salaryDisplay = hasSalary
      ? `<div class="payroll-salary-chip">₱ ${Number(u.salaryInfo.basicMonthly).toLocaleString('en-PH',{minimumFractionDigits:2})} / mo</div>`
      : `<div style="font-size:11px;color:var(--text3);margin-top:8px">No salary set</div>`;
    return `<div class="payroll-emp-card">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div class="payroll-emp-avatar">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name||'—'}</div>
          <div style="font-size:11px;color:var(--text3)">${u.employeeId||''} · ${u.department||''}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">${u.shiftCode||'—'}</div>
        </div>
      </div>
      ${salaryDisplay}
      <div style="display:flex;gap:6px;margin-top:12px">
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="openSalaryModal('${u.uid}')">⚙ Salary Setup</button>
        <button class="btn btn-primary btn-sm" style="flex:1" onclick="openGenPayslipModal('${u.uid}')">📄 Payslip</button>
      </div>
    </div>`;
  }).join('');
}

// ---- Open Salary Setup Modal ----
async function openSalaryModal(uid) {
  const snap = await db.ref(`users/${uid}`).once('value');
  if(!snap.exists()){ toast('Employee not found','red'); return; }
  const u = snap.val();
  document.getElementById('salary-uid').value = uid;
  document.getElementById('salary-modal-title').textContent = `💰 Salary Setup — ${u.name}`;
  document.getElementById('salary-emp-name').textContent = u.name || '—';
  document.getElementById('salary-emp-info').textContent = `${u.employeeId||''} · ${u.department||''} · ${u.shiftCode||''}`;
  const initials = (u.name||'U').split(' ').map(x=>x[0]).join('').substring(0,2).toUpperCase();
  document.getElementById('salary-emp-avatar').textContent = initials;

  const si = u.salaryInfo || {};
  document.getElementById('sal-basic').value         = si.basicMonthly || '';
  document.getElementById('sal-freq').value          = si.payFrequency || 'semi-monthly';
  document.getElementById('sal-trans').value         = si.transAllowance || '';
  document.getElementById('sal-meal').value          = si.mealAllowance || '';
  document.getElementById('sal-other-allow').value   = si.otherAllowance || '';
  document.getElementById('sal-other-allow-label').value = si.otherAllowanceLabel || '';
  document.getElementById('sal-sss').value           = si.sssContrib || '';
  document.getElementById('sal-philhealth').value    = si.philhealthContrib || '';
  document.getElementById('sal-pagibig').value       = si.pagibigContrib || '';
  document.getElementById('sal-tax').value           = si.withholdingTax || '';
  document.getElementById('sal-other-ded').value     = si.otherDeduction || '';
  document.getElementById('sal-other-ded-label').value  = si.otherDeductionLabel || '';
  document.getElementById('sal-ot-rate').value       = si.otRateMultiplier || '1.25';
  document.getElementById('sal-nd-rate').value       = si.ndRateMultiplier || '1.10';

  // Reset to monthly-input mode by default when opening
  const modeMonthly = document.getElementById('sal-mode-monthly');
  if(modeMonthly){ modeMonthly.checked = true; if(window.onSalModeChange) window.onSalModeChange(); }
  else if(window.computeSalaryRates) window.computeSalaryRates();
  showModal('salary-modal');
}

// ---- Save Salary Info ----
async function saveSalaryInfo() {
  const uid   = document.getElementById('salary-uid').value;
  const basic = parseFloat(document.getElementById('sal-basic').value);
  if(!uid)    { toast('No employee selected','red'); return; }
  if(!basic || basic <= 0) { toast('Enter a valid Basic Monthly Salary','amber'); return; }

  const workDays   = 26;
  const dailyRate  = basic / workDays;
  const hourlyRate = dailyRate / 8;

  const payload = {
    basicMonthly:       basic,
    payFrequency:       document.getElementById('sal-freq').value,
    dailyRate:          parseFloat(dailyRate.toFixed(4)),
    hourlyRate:         parseFloat(hourlyRate.toFixed(4)),
    transAllowance:     parseFloat(document.getElementById('sal-trans').value)         || 0,
    mealAllowance:      parseFloat(document.getElementById('sal-meal').value)          || 0,
    otherAllowance:     parseFloat(document.getElementById('sal-other-allow').value)   || 0,
    otherAllowanceLabel:document.getElementById('sal-other-allow-label').value.trim(),
    sssContrib:         parseFloat(document.getElementById('sal-sss').value)           || 0,
    philhealthContrib:  parseFloat(document.getElementById('sal-philhealth').value)    || 0,
    pagibigContrib:     parseFloat(document.getElementById('sal-pagibig').value)       || 0,
    withholdingTax:     parseFloat(document.getElementById('sal-tax').value)           || 0,
    otherDeduction:     parseFloat(document.getElementById('sal-other-ded').value)     || 0,
    otherDeductionLabel:document.getElementById('sal-other-ded-label').value.trim(),
    otRateMultiplier:   parseFloat(document.getElementById('sal-ot-rate').value)       || 1.25,
    ndRateMultiplier:   parseFloat(document.getElementById('sal-nd-rate').value)       || 1.10,
    updatedAt: Date.now(), updatedBy: currentUserData?.name || ''
  };

  const btn = document.getElementById('sal-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await db.ref(`users/${uid}/salaryInfo`).set(payload);
    toast('Salary info saved', 'green');
    closeModal('salary-modal');
    loadPayrollGrid();
  } catch(e) { toast('Save failed: '+e.message,'red'); }
  finally { btn.disabled=false; btn.textContent='💾 Save Salary Setup'; }
}

// ---- Open Generate Payslip Modal ----
async function openGenPayslipModal(uid) {
  const snap = await db.ref(`users/${uid}`).once('value');
  if(!snap.exists()){ toast('Employee not found','red'); return; }
  const u = snap.val();
  document.getElementById('gen-payslip-uid').value = uid;
  document.getElementById('gen-payslip-emp-info').innerHTML =
    `<strong>${u.name||'—'}</strong> &nbsp;·&nbsp; ${u.employeeId||''} &nbsp;·&nbsp; ${u.department||''}` +
    (u.salaryInfo?.basicMonthly
      ? `<br><span style="color:var(--accent)">₱ ${Number(u.salaryInfo.basicMonthly).toLocaleString('en-PH',{minimumFractionDigits:2})} / mo &nbsp;(${u.salaryInfo.payFrequency||'semi-monthly'})</span>`
      : `<br><span style="color:var(--red)">⚠ No salary set — please configure Salary Setup first.</span>`);

  // Default to current payroll period
  document.getElementById('gen-ps-start').value = periodStart || '';
  document.getElementById('gen-ps-end').value   = periodEnd   || '';
  document.getElementById('gen-ps-remarks').value = '';
  document.getElementById('gen-payslip-preview').style.display = 'none';
  showModal('gen-payslip-modal');
}

// ---- Compute payslip figures for a period ----
async function computePayslipData(uid, start, end) {
  const userSnap = await db.ref(`users/${uid}`).once('value');
  const u = userSnap.val() || {};
  const si = u.salaryInfo || {};

  if(!si.basicMonthly) return null;

  const freq = si.payFrequency || 'semi-monthly';
  let periodBasic;
  if(freq === 'monthly')      periodBasic = si.basicMonthly;
  else if(freq === 'weekly')  periodBasic = si.basicMonthly / 4;
  else                        periodBasic = si.basicMonthly / 2; // semi-monthly

  const hourlyRate = si.hourlyRate || (si.basicMonthly / 26 / 8);
  const otMult     = si.otRateMultiplier || 1.25;

  // Pull timelogs and requests for the period
  const [tlSnap, reqSnap] = await Promise.all([
    db.ref(`timelogs/${uid}`).once('value'),
    db.ref(`requests/${uid}`).once('value')
  ]);

  // Build date-keyed maps
  const byDate = {};
  tlSnap.forEach(dSnap => { const r = dSnap.val(); if(r && r.date) byDate[r.date] = r; });

  const reqsByDate = {};
  reqSnap.forEach(c => {
    const req = c.val(); if(!req) return;
    if(req.date) { if(!reqsByDate[req.date]) reqsByDate[req.date]=[]; reqsByDate[req.date].push({id:c.key,...req}); }
    if(req.type==='leave' && req.dateFrom && req.dateTo) {
      const from = new Date(req.dateFrom+'T12:00:00'), to = new Date(req.dateTo+'T12:00:00');
      for(let d=new Date(from); d<=to; d.setDate(d.getDate()+1)) {
        const ds = d.toISOString().split('T')[0];
        if(!reqsByDate[ds]) reqsByDate[ds]=[];
        if(!reqsByDate[ds].find(r=>r.id===c.key)) reqsByDate[ds].push({id:c.key,...req});
      }
    }
  });

  // Iterate EVERY date in the period (not just existing timelog entries)
  // so that absent days with no DB record are correctly counted
  let totalOTHours = 0, totalLateMin = 0, totalUTMin = 0, absenceDays = 0, leaveDays = 0;
  const startD = new Date(start+'T12:00:00'), endD = new Date(end+'T12:00:00');
  for(let d = new Date(startD); d <= endD; d.setDate(d.getDate()+1)) {
    const ds = d.toISOString().split('T')[0];
    const shiftCode = getEmployeeShiftForDate(u, ds);
    const row = byDate[ds] || { date:ds, shiftCode, timeIn:null, timeOut:null,
      noonOut:null, noonIn:null, snackBreakOut:null, snackBreakIn:null, status:'no_record' };
    // Apply holiday override to shift code
    const holiday = globalHolidayShifts?.[ds];
    if(holiday?.code && row.status !== 'leave') row.shiftCode = normalizeShiftCode(holiday.code);
    row._requests = reqsByDate[ds] || [];
    const m = applyPayrollRulesToRow(row);
    totalOTHours += m.OTHours           || 0;
    totalLateMin += m.lateMinutes       || 0;
    totalUTMin   += m.undertimeMinutes  || 0;
    absenceDays  += m.absence           || 0;
    if(hasApprovedLeaveForRow(m)) leaveDays++;
  }

  // ── Prior-Period Adjustment Scan ──────────────────────────────────────────
  // Auto-detect requests whose DATE is before this period's start but whose
  // approvedAt timestamp falls WITHIN this pay period window.
  // These represent late filings approved this cutoff → rolled into current payslip.
  const periodStartMs = new Date(start + 'T00:00:00').getTime();
  const periodEndMs   = new Date(end   + 'T23:59:59').getTime();
  const APPROVED_STATUSES_ADJ = ['approved','apprf','appr1'];

  let adjOTHours = 0, adjLateMin = 0, adjUTMin = 0, adjAbsenceDays = 0, adjLeaveDays = 0;
  const adjDetails = []; // for UI display

  reqSnap.forEach(c => {
    const req = c.val(); if (!req) return;
    const reqDate = req.date || req.dateFrom;
    if (!reqDate) return;

    const isBeforePeriod  = reqDate < start;
    const isApprovedAdj   = APPROVED_STATUSES_ADJ.includes(req.status);
    const approvedAt      = req.approvedAt || req.lastActionAt || 0;
    const approvedDuring  = approvedAt >= periodStartMs && approvedAt <= periodEndMs;

    if (isBeforePeriod && isApprovedAdj && approvedDuring) {
      // Re-run payroll rules for that prior date to get exact impact
      const priorRow = byDate[reqDate]
        ? { ...byDate[reqDate] }
        : { date: reqDate, shiftCode: getEmployeeShiftForDate(u, reqDate),
            timeIn: null, timeOut: null, noonOut: null, noonIn: null,
            snackBreakOut: null, snackBreakIn: null, status: 'no_record' };
      priorRow._requests = reqsByDate[reqDate] || [];
      const m = applyPayrollRulesToRow(priorRow);

      adjOTHours    += m.OTHours          || 0;
      adjLateMin    += m.lateMinutes      || 0;
      adjUTMin      += m.undertimeMinutes || 0;
      adjAbsenceDays += m.absence         || 0;
      if (hasApprovedLeaveForRow(m)) adjLeaveDays++;

      adjDetails.push({
        date:      reqDate,
        type:      req.type || 'correction',
        approvedAt,
        otHours:   m.OTHours          || 0,
        lateMin:   m.lateMinutes      || 0,
        utMin:     m.undertimeMinutes || 0,
        absence:   m.absence          || 0,
        leave:     hasApprovedLeaveForRow(m),
      });
    }
  });

  // Merge adjustments into totals so all downstream calcs use unified numbers
  totalOTHours  += adjOTHours;
  totalLateMin  += adjLateMin;
  totalUTMin    += adjUTMin;
  absenceDays   += adjAbsenceDays;
  leaveDays     += adjLeaveDays;
  // ─────────────────────────────────────────────────────────────────────────

  const dailyRate   = si.dailyRate || (si.basicMonthly / 26);
  const lateDeduct  = (totalLateMin / 60) * hourlyRate;
  const utDeduct    = totalUTMin * hourlyRate; // undertimeMinutes is in hours (regular - total, both hrs)
  const absDeduct   = absenceDays * dailyRate;
  const otPay       = totalOTHours * hourlyRate * otMult;

  const grossEarnings = periodBasic
    + (si.transAllowance     || 0)
    + (si.mealAllowance      || 0)
    + (si.otherAllowance     || 0)
    + otPay
    - lateDeduct
    - utDeduct
    - absDeduct;

  const totalDeductions = (si.sssContrib        || 0)
    + (si.philhealthContrib  || 0)
    + (si.pagibigContrib     || 0)
    + (si.withholdingTax     || 0)
    + (si.otherDeduction     || 0);

  const netPay = Math.max(0, grossEarnings - totalDeductions);

  const hasAdjustments = adjDetails.length > 0;

  return { u, si, periodBasic, otPay, lateDeduct, utDeduct, absDeduct,
           grossEarnings, totalDeductions, netPay,
           totalOTHours, totalLateMin, totalUTMin, absenceDays, leaveDays,
           hourlyRate, dailyRate,
           // Prior-period adjustment fields
           hasAdjustments, adjDetails,
           adjOTHours, adjLateMin, adjUTMin, adjAbsenceDays, adjLeaveDays };
}

// ---- Preview Payslip Computation ----
async function previewPayslipComputation() {
  const uid   = document.getElementById('gen-payslip-uid').value;
  const start = document.getElementById('gen-ps-start').value;
  const end   = document.getElementById('gen-ps-end').value;
  if(!start || !end) { toast('Select pay period dates','amber'); return; }

  const prevDiv = document.getElementById('gen-payslip-preview');
  const prevContent = document.getElementById('gen-payslip-preview-content');
  prevDiv.style.display = 'block';
  prevContent.innerHTML = '<div style="color:var(--text3)">Computing…</div>';

  try {
    const d = await computePayslipData(uid, start, end);
    if(!d) { prevContent.innerHTML = '<div style="color:var(--red)">No salary configured for this employee.</div>'; return; }
    const fmt = v => `₱ ${Number(v||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`;
    prevContent.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:12px">
        <div style="color:var(--text3)">Basic (period)</div><div style="text-align:right;font-family:var(--mono)">${fmt(d.periodBasic)}</div>
        <div style="color:var(--text3)">OT Pay (${d.totalOTHours.toFixed(2)} hrs)</div><div style="text-align:right;font-family:var(--mono);color:var(--green)">${fmt(d.otPay)}</div>
        <div style="color:var(--text3)">Late Deduction (${d.totalLateMin} min)</div><div style="text-align:right;font-family:var(--mono);color:var(--red)">−${fmt(d.lateDeduct)}</div>
        <div style="color:var(--text3)">Undertime Deduction (${(d.totalUTMin * 60).toFixed(1)} min)</div><div style="text-align:right;font-family:var(--mono);color:var(--red)">−${fmt(d.utDeduct)}</div>
        <div style="color:var(--text3)">Absence Deduction (${d.absenceDays} day${d.absenceDays!==1?'s':''})</div><div style="text-align:right;font-family:var(--mono);color:var(--red)">−${fmt(d.absDeduct)}</div>
        <div style="color:var(--text3)">Gross Earnings</div><div style="text-align:right;font-family:var(--mono);font-weight:700">${fmt(d.grossEarnings)}</div>
        <div style="color:var(--text3)">Total Deductions</div><div style="text-align:right;font-family:var(--mono);color:var(--red)">−${fmt(d.totalDeductions)}</div>
        <div style="font-weight:700;color:var(--accent)">Net Pay</div><div style="text-align:right;font-family:var(--mono);font-weight:700;color:var(--accent)">${fmt(d.netPay)}</div>
      </div>
      ${d.hasAdjustments ? `<div style="margin-top:10px;padding:8px 10px;background:var(--amber-bg,#FEF3C7);border:1px solid var(--amber,#92580A);border-radius:6px;font-size:11.5px;color:var(--amber,#92580A)">
        <b>&#9679; Prior Period Adjustments included</b> — ${d.adjDetails.length} late-filed record${d.adjDetails.length!==1?'s':''} (approved this cutoff) are rolled into this payslip:<br>
        <span style="opacity:.85">${d.adjDetails.map(a=>{
          const dd=new Date(a.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric'});
          const type=(a.type||'correction').replace(/_/g,' ');
          return dd+' · '+type;
        }).join(' &nbsp;|&nbsp; ')}</span>
      </div>` : ''}`;
  } catch(e) { prevContent.innerHTML = `<div style="color:var(--red)">Error: ${e.message}</div>`; }
}

// ---- Generate & Save Payslip ----
async function generatePayslip() {
  const uid     = document.getElementById('gen-payslip-uid').value;
  const start   = document.getElementById('gen-ps-start').value;
  const end     = document.getElementById('gen-ps-end').value;
  const remarks = document.getElementById('gen-ps-remarks').value.trim();
  if(!start || !end) { toast('Select pay period start and end','amber'); return; }

  const btn = document.getElementById('gen-ps-btn');
  btn.disabled = true; btn.textContent = '⏳ Generating…';
  try {
    const d = await computePayslipData(uid, start, end);
    if(!d) { toast('No salary info set for this employee','red'); return; }

    const payslipData = {
      uid, employeeName: d.u.name || '', employeeId: d.u.employeeId || '',
      department: d.u.department || '', shiftCode: d.u.shiftCode || '',
      periodStart: start, periodEnd: end, remarks,
      payFrequency: d.si.payFrequency || 'semi-monthly',
      basicMonthly: d.si.basicMonthly,
      periodBasic: d.periodBasic,
      transAllowance: d.si.transAllowance || 0,
      mealAllowance: d.si.mealAllowance || 0,
      otherAllowance: d.si.otherAllowance || 0,
      otherAllowanceLabel: d.si.otherAllowanceLabel || '',
      otPay: d.otPay, totalOTHours: d.totalOTHours,
      lateDeduct: d.lateDeduct, totalLateMin: d.totalLateMin,
      utDeduct: d.utDeduct, totalUTMin: d.totalUTMin,
      absDeduct: d.absDeduct, absenceDays: d.absenceDays,
      leaveDays: d.leaveDays,
      grossEarnings: d.grossEarnings,
      hasAdjustments: d.hasAdjustments || false,
      adjDetails: d.adjDetails || [],
      adjOTHours: d.adjOTHours || 0,
      adjLateMin: d.adjLateMin || 0,
      adjUTMin: d.adjUTMin || 0,
      adjAbsenceDays: d.adjAbsenceDays || 0,
      adjLeaveDays: d.adjLeaveDays || 0,
      sssContrib: d.si.sssContrib || 0,
      philhealthContrib: d.si.philhealthContrib || 0,
      pagibigContrib: d.si.pagibigContrib || 0,
      withholdingTax: d.si.withholdingTax || 0,
      otherDeduction: d.si.otherDeduction || 0,
      otherDeductionLabel: d.si.otherDeductionLabel || '',
      totalDeductions: d.totalDeductions,
      netPay: d.netPay,
      generatedAt: Date.now(), generatedBy: currentUserData?.name || ''
    };

    await db.ref(`payslips/${uid}`).push(payslipData);
    toast('Payslip generated and saved!', 'green');
    closeModal('gen-payslip-modal');
  } catch(e) { toast('Generate failed: '+e.message, 'red'); }
  finally { btn.disabled=false; btn.textContent='⚡ Generate & Save'; }
}

// ---- Admin Payslip History (with Regenerate) ----
async function openAdminPayslipHistory(uid, empName) {
  document.getElementById('admin-payslip-history-emp').textContent = empName || uid;
  const listEl = document.getElementById('admin-payslip-history-list');
  listEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text3)">Loading…</div>';
  showModal('admin-payslip-history-modal');

  try {
    const snap = await db.ref(`payslips/${uid}`).orderByChild('generatedAt').once('value');
    const items = [];
    snap.forEach(c => items.push({key:c.key,...c.val()}));
    items.reverse();

    if(!items.length) {
      listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)">No payslips generated yet for this employee.</div>';
      return;
    }

    const fmt   = v => `₱ ${Number(v||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`;
    const fmtD  = s => s ? new Date(s+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : '—';
    const fmtTs = ts => ts ? new Date(ts).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}) : '—';

    listEl.innerHTML = items.map(p => {
      const regenBadge = p.regeneratedAt
        ? `<div style="font-size:10px;color:var(--amber);margin-top:2px">↻ Regenerated ${fmtTs(p.regeneratedAt)} by ${p.regeneratedBy||'—'}${p.previousNetPay!=null?' · was '+fmt(p.previousNetPay):''}</div>`
        : '';
      const bulkBadge = p.isBulkGenerated
        ? `<span style="font-size:10px;background:var(--accent-light);color:var(--accent);padding:1px 6px;border-radius:4px;margin-left:6px">bulk</span>`
        : '';
      return `<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r2);padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px">${fmtD(p.periodStart)} — ${fmtD(p.periodEnd)}${bulkBadge}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">Generated ${fmtTs(p.generatedAt)} by ${p.generatedBy||'—'}</div>
          ${regenBadge}
          ${p.remarks ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;font-style:italic">${p.remarks}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--accent)">${fmt(p.netPay)}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:2px">Net Pay</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
          <button class="btn btn-ghost btn-xs" onclick="viewPayslip('${uid}','${p.key}')">👁 View</button>
          <button class="btn btn-ghost btn-xs" style="color:var(--amber)" onclick="regeneratePayslip('${uid}','${p.key}')">↻ Regenerate</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    listEl.innerHTML = `<div style="text-align:center;padding:32px;color:var(--red)">Failed to load: ${e.message}</div>`;
  }
}

// ---- Open Bulk Payslip Modal ----
function openBulkPayslipModal() {
  document.getElementById('bulk-ps-start').value = periodStart || '';
  document.getElementById('bulk-ps-end').value   = periodEnd   || '';
  document.getElementById('bulk-ps-remarks').value = '';
  document.getElementById('bulk-ps-progress').style.display = 'none';
  document.getElementById('bulk-ps-log').innerHTML = '';
  document.getElementById('bulk-ps-bar').style.width = '0%';
  document.getElementById('bulk-ps-btn').disabled = false;
  document.getElementById('bulk-ps-btn').textContent = '⚡ Generate All';
  showModal('bulk-payslip-modal');
}

// ---- Run Bulk Payslip Generation ----
async function runBulkPayslipGeneration() {
  const start   = document.getElementById('bulk-ps-start').value;
  const end     = document.getElementById('bulk-ps-end').value;
  const remarks = document.getElementById('bulk-ps-remarks').value.trim();
  if(!start || !end) { toast('Select pay period start and end','amber'); return; }

  const btn = document.getElementById('bulk-ps-btn');
  btn.disabled = true; btn.textContent = '⏳ Running…';
  document.getElementById('bulk-ps-progress').style.display = 'block';

  const logEl = document.getElementById('bulk-ps-log');
  const barEl = document.getElementById('bulk-ps-bar');
  const statusEl = document.getElementById('bulk-ps-status');

  const log = (msg, color='var(--text2)') => {
    logEl.innerHTML += `<div style="color:${color}">${msg}</div>`;
    logEl.scrollTop = logEl.scrollHeight;
  };

  // Read from either variable — the override stores in payrollRowsV46, the original in allPayrollEmployees
  let employees = (window.allPayrollEmployees?.length ? window.allPayrollEmployees
    : window.payrollRowsV46?.length ? window.payrollRowsV46
    : []).filter(u => u.active !== false);

  // If still empty, auto-load from Firebase before proceeding
  if(!employees.length) {
    statusEl.textContent = 'Loading employees from Firebase…';
    document.getElementById('bulk-ps-progress').style.display = 'block';
    try {
      const snap = await db.ref('users').once('value');
      const loaded = [];
      snap.forEach(ch => { const u = ch.val()||{}; if(!u.deleted) loaded.push({uid:ch.key,...u}); });
      window.allPayrollEmployees = loaded;
      window.payrollRowsV46 = loaded;
      employees = loaded.filter(u => u.active !== false);
    } catch(e) {
      toast('Failed to load employees: '+e.message, 'red');
      btn.disabled=false; btn.textContent='⚡ Generate All'; return;
    }
  }

  if(!employees.length) { toast('No active employees found in the system','amber'); btn.disabled=false; btn.textContent='⚡ Generate All'; return; }

  let done=0, skipped=0, failed=0;
  statusEl.textContent = `Processing 0 / ${employees.length} employees…`;

  for(const u of employees) {
    const uid = u.uid;
    try {
      const d = await computePayslipData(uid, start, end);
      if(!d) {
        skipped++;
        log(`⊘ Skipped — ${u.name||uid} (no salary configured)`, 'var(--amber)');
      } else {
        const payslipData = {
          uid, employeeName: d.u.name||'', employeeId: d.u.employeeId||'',
          department: d.u.department||'', shiftCode: d.u.shiftCode||'',
          periodStart: start, periodEnd: end, remarks,
          payFrequency: d.si.payFrequency||'semi-monthly',
          basicMonthly: d.si.basicMonthly,
          periodBasic: d.periodBasic,
          transAllowance: d.si.transAllowance||0,
          mealAllowance: d.si.mealAllowance||0,
          otherAllowance: d.si.otherAllowance||0,
          otherAllowanceLabel: d.si.otherAllowanceLabel||'',
          otPay: d.otPay, totalOTHours: d.totalOTHours,
          lateDeduct: d.lateDeduct, totalLateMin: d.totalLateMin,
          utDeduct: d.utDeduct, totalUTMin: d.totalUTMin,
          absDeduct: d.absDeduct, absenceDays: d.absenceDays,
          leaveDays: d.leaveDays,
          grossEarnings: d.grossEarnings,
          hasAdjustments: d.hasAdjustments||false,
          adjDetails: d.adjDetails||[],
          adjOTHours: d.adjOTHours||0, adjLateMin: d.adjLateMin||0,
          adjUTMin: d.adjUTMin||0, adjAbsenceDays: d.adjAbsenceDays||0,
          adjLeaveDays: d.adjLeaveDays||0,
          sssContrib: d.si.sssContrib||0,
          philhealthContrib: d.si.philhealthContrib||0,
          pagibigContrib: d.si.pagibigContrib||0,
          withholdingTax: d.si.withholdingTax||0,
          otherDeduction: d.si.otherDeduction||0,
          otherDeductionLabel: d.si.otherDeductionLabel||'',
          totalDeductions: d.totalDeductions,
          netPay: d.netPay,
          generatedAt: Date.now(), generatedBy: currentUserData?.name||'',
          isBulkGenerated: true
        };
        await db.ref(`payslips/${uid}`).push(payslipData);
        done++;
        const fmt = v => `₱ ${Number(v||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`;
        log(`✓ ${u.name||uid} — Net Pay: ${fmt(d.netPay)}`, 'var(--green)');
      }
    } catch(e) {
      failed++;
      log(`✗ Error — ${u.name||uid}: ${e.message}`, 'var(--red)');
    }
    const pct = Math.round(((done+skipped+failed)/employees.length)*100);
    barEl.style.width = pct + '%';
    statusEl.textContent = `Processing ${done+skipped+failed} / ${employees.length} employees…`;
  }

  barEl.style.width = '100%';
  statusEl.textContent = `Done — ${done} generated · ${skipped} skipped · ${failed} failed`;
  log(`─────────────────────────────────────`, 'var(--border2)');
  log(`✔ Complete: ${done} payslips generated, ${skipped} skipped (no salary), ${failed} errors`, done>0?'var(--green)':'var(--amber)');
  btn.disabled = false; btn.textContent = '⚡ Generate All';
  if(done > 0) toast(`${done} payslip${done!==1?'s':''} generated successfully!`, 'green');
}

// ---- Regenerate a saved payslip (admin only) ----
async function regeneratePayslip(uid, psKey) {
  const snap = await db.ref(`payslips/${uid}/${psKey}`).once('value');
  if(!snap.exists()){ toast('Payslip not found','red'); return; }
  const existing = snap.val();

  const confirmed = confirm(
    `Regenerate payslip for ${existing.employeeName||uid}?
` +
    `Period: ${existing.periodStart} to ${existing.periodEnd}

` +
    `The saved payslip will be overwritten with fresh computation. This cannot be undone.`
  );
  if(!confirmed) return;

  try {
    toast('Recomputing payslip…','amber');
    const d = await computePayslipData(uid, existing.periodStart, existing.periodEnd);
    if(!d){ toast('No salary info found — cannot regenerate','red'); return; }

    const payslipData = {
      ...existing,
      otPay: d.otPay, totalOTHours: d.totalOTHours,
      lateDeduct: d.lateDeduct, totalLateMin: d.totalLateMin,
      utDeduct: d.utDeduct, totalUTMin: d.totalUTMin,
      absDeduct: d.absDeduct, absenceDays: d.absenceDays,
      leaveDays: d.leaveDays,
      periodBasic: d.periodBasic,
      grossEarnings: d.grossEarnings,
      totalDeductions: d.totalDeductions,
      netPay: d.netPay,
      hasAdjustments: d.hasAdjustments||false,
      adjDetails: d.adjDetails||[],
      adjOTHours: d.adjOTHours||0, adjLateMin: d.adjLateMin||0,
      adjUTMin: d.adjUTMin||0, adjAbsenceDays: d.adjAbsenceDays||0,
      adjLeaveDays: d.adjLeaveDays||0,
      regeneratedAt: Date.now(),
      regeneratedBy: currentUserData?.name || '',
      previousNetPay: existing.netPay
    };

    await db.ref(`payslips/${uid}/${psKey}`).set(payslipData);
    toast('Payslip regenerated successfully!','green');

    // Refresh the view modal if it's currently open
    const modalBody = document.getElementById('payslip-modal-body');
    if(modalBody && document.getElementById('payslip-modal') && !document.getElementById('payslip-modal').classList.contains('hidden')) {
      modalBody.innerHTML = buildPayslipHTML(payslipData);
    }
    // Reload the payslip list if on the admin payroll page
    try { loadAdminPayslips?.(uid); } catch(e){}
  } catch(e) {
    toast('Regeneration failed: '+e.message,'red');
  }
}

// ---- Build payslip HTML paper ----
function buildPayslipHTML(p) {
  const fmt   = v => `₱ ${Number(v||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`;
  const fmtD  = s => s ? new Date(s+'T12:00:00').toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'}) : '—';
  const fmtTs = ts => ts ? new Date(ts).toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric'}) : '—';
  const row   = (label, val, cls='') =>
    `<div class="payslip-row"><span class="payslip-row-label">${label}</span><span class="payslip-row-val ${cls}">${val}</span></div>`;

  let earningsHTML = row('Basic Pay (period)', fmt(p.periodBasic));
  if(p.transAllowance)  earningsHTML += row('Transportation Allowance', fmt(p.transAllowance));
  if(p.mealAllowance)   earningsHTML += row('Meal Allowance', fmt(p.mealAllowance));
  if(p.otherAllowance)  earningsHTML += row(p.otherAllowanceLabel || 'Other Allowance', fmt(p.otherAllowance));
  if(p.otPay > 0)       earningsHTML += row(`OT Pay (${(p.totalOTHours||0).toFixed(2)} hrs)`, fmt(p.otPay));
  if(p.lateDeduct > 0)  earningsHTML += row(`Late Deduction (${p.totalLateMin||0} min)`, `−${fmt(p.lateDeduct)}`, 'deduction');
  if(p.utDeduct > 0)    earningsHTML += row(`Undertime Deduction (${((p.totalUTMin||0) * 60).toFixed(1)} min)`, `−${fmt(p.utDeduct)}`, 'deduction');
  if(p.absDeduct > 0)   earningsHTML += row(`Absence Deduction (${p.absenceDays||0} day${p.absenceDays!==1?'s':''})`, `−${fmt(p.absDeduct)}`, 'deduction');

  let deductHTML = '';
  if(p.sssContrib)        deductHTML += row('SSS Contribution', `−${fmt(p.sssContrib)}`, 'deduction');
  if(p.philhealthContrib) deductHTML += row('PhilHealth Contribution', `−${fmt(p.philhealthContrib)}`, 'deduction');
  if(p.pagibigContrib)    deductHTML += row('Pag-IBIG Contribution', `−${fmt(p.pagibigContrib)}`, 'deduction');
  if(p.withholdingTax)    deductHTML += row('Withholding Tax', `−${fmt(p.withholdingTax)}`, 'deduction');
  if(p.otherDeduction)    deductHTML += row(p.otherDeductionLabel || 'Other Deduction', `−${fmt(p.otherDeduction)}`, 'deduction');

  return `<div class="payslip-paper" id="payslip-printable">
    <div class="payslip-header">
      <div>
        <div class="payslip-company">TimeKeep <span style="color:#A7F3C0">Pro</span></div>
        <div class="payslip-title">Payslip / Earnings Statement</div>
      </div>
      <div class="payslip-period">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin-bottom:4px">Pay Period</div>
        <div style="font-weight:600;font-size:13px">${fmtD(p.periodStart)}</div>
        <div style="font-size:12px;color:#555">to ${fmtD(p.periodEnd)}</div>
        <div style="font-size:11px;color:#999;margin-top:4px">Generated: ${fmtTs(p.generatedAt)}</div>
      </div>
    </div>
    <div class="payslip-emp-row">
      <div><div class="payslip-emp-field">Employee Name</div><div class="payslip-emp-val">${p.employeeName||'—'}</div></div>
      <div><div class="payslip-emp-field">Employee ID</div><div class="payslip-emp-val">${p.employeeId||'—'}</div></div>
      <div><div class="payslip-emp-field">Department</div><div class="payslip-emp-val">${p.department||'—'}</div></div>
      <div><div class="payslip-emp-field">Pay Frequency</div><div class="payslip-emp-val" style="text-transform:capitalize">${(p.payFrequency||'').replace('-',' ')}</div></div>
    </div>

    <div class="payslip-section-title">Earnings & Deductions from Attendance</div>
    ${earningsHTML}
    <div class="payslip-row" style="margin-top:6px;border-top:1px solid #ccc;padding-top:8px">
      <span style="font-weight:700">Gross Earnings</span>
      <span class="payslip-row-val" style="font-weight:700">${fmt(p.grossEarnings)}</span>
    </div>

    ${p.hasAdjustments ? `
    <div class="payslip-section-title" style="color:var(--amber,#92580A)">&#9679; Prior Period Adjustments</div>
    <div style="font-size:10.5px;color:var(--text3,#999);margin:-6px 0 8px">Late-filed timesheets approved during this pay period</div>
    ${(p.adjDetails||[]).map(a => {
      const fmtAdj = v => `₱ ${Number(v||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`;
      const d = new Date(a.date+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
      const type = (a.type||'correction').replace(/_/g,' ');
      let lines = `<div class="payslip-row" style="font-size:11px;color:var(--text2,#57534E)"><span class="payslip-row-label" style="font-style:italic">${type} · ${d}</span><span></span></div>`;
      if(a.otHours>0)  lines += `<div class="payslip-row" style="font-size:11px"><span class="payslip-row-label" style="padding-left:12px">↳ OT Pay (${a.otHours.toFixed(2)} hrs)</span><span class="payslip-row-val" style="color:var(--green,#1D5C38)">${fmtAdj(a.otHours * (p.hourlyRate||0) * (p.otMult||1.25))}</span></div>`;
      if(a.lateMin>0)  lines += `<div class="payslip-row" style="font-size:11px"><span class="payslip-row-label" style="padding-left:12px">↳ Late Deduction (${a.lateMin} min)</span><span class="payslip-row-val deduction">−${fmtAdj((a.lateMin/60)*(p.hourlyRate||0))}</span></div>`;
      if(a.utMin>0)    lines += `<div class="payslip-row" style="font-size:11px"><span class="payslip-row-label" style="padding-left:12px">↳ Undertime (${(a.utMin*60).toFixed(1)} min)</span><span class="payslip-row-val deduction">−${fmtAdj(a.utMin*(p.hourlyRate||0))}</span></div>`;
      if(a.absence>0)  lines += `<div class="payslip-row" style="font-size:11px"><span class="payslip-row-label" style="padding-left:12px">↳ Absence Deduction (${a.absence} day${a.absence!==1?'s':''})</span><span class="payslip-row-val deduction">−${fmtAdj(a.absence*(p.dailyRate||0))}</span></div>`;
      if(a.leave)      lines += `<div class="payslip-row" style="font-size:11px"><span class="payslip-row-label" style="padding-left:12px">↳ Leave Applied</span><span class="payslip-row-val" style="color:var(--cyan,#0A6E87)">covered</span></div>`;
      return lines;
    }).join('')}` : ''}

    ${deductHTML ? `<div class="payslip-section-title">Standard Deductions</div>${deductHTML}` : ''}

    <div class="payslip-total-row">
      <span style="font-size:14px;font-weight:600">NET PAY</span>
      <span class="payslip-total-val">${fmt(p.netPay)}</span>
    </div>

    ${p.remarks ? `<div style="margin-top:12px;font-size:12px;color:#666;font-style:italic">Note: ${p.remarks}</div>` : ''}

    <div class="payslip-footer">
      <div>
        <div class="payslip-sig"></div>
        <div>Prepared by</div>
      </div>
      <div style="text-align:right">
        <div class="payslip-sig"></div>
        <div>Received by</div>
      </div>
    </div>
  </div>`;
}

// ---- View a payslip (opens modal) ----
function viewPayslip(uid, psKey) {
  db.ref(`payslips/${uid}/${psKey}`).once('value').then(snap => {
    if(!snap.exists()){ toast('Payslip not found','red'); return; }
    const p = snap.val();
    document.getElementById('payslip-modal-body').innerHTML = buildPayslipHTML(p);
    showModal('payslip-modal');
  });
}

// ---- Print payslip ----
function printPayslip() {
  const el = document.getElementById('payslip-printable');
  if(!el){ toast('No payslip to print','amber'); return; }
  const w = window.open('','_blank','width=800,height=700');
  w.document.write(`<!DOCTYPE html><html><head><title>Payslip</title>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/style.css">
  </head><body>${el.outerHTML}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

// ---- Load My Payslips (employee view) ----
async function loadMyPayslips() {
  const uid  = currentUserData?.uid;
  const list = document.getElementById('my-payslip-list');
  if(!list || !uid) return;
  list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)">Loading payslips…</div>`;
  try {
    const snap = await db.ref(`payslips/${uid}`).orderByChild('generatedAt').once('value');
    const items = [];
    snap.forEach(c => items.push({key:c.key,...c.val()}));
    items.reverse();
    if(!items.length){
      list.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text3)">No payslips found yet.<br><span style="font-size:12px">Your manager will generate payslips here.</span></div>`;
      return;
    }
    const fmt = v => `₱ ${Number(v||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`;
    const fmtD = s => s ? new Date(s+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : '—';
    list.innerHTML = items.map(p => `
      <div class="payslip-list-item" onclick="viewPayslip('${uid}','${p.key}')">
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px">${fmtD(p.periodStart)} — ${fmtD(p.periodEnd)}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px;text-transform:capitalize">${(p.payFrequency||'').replace('-',' ')} payslip</div>
          ${p.remarks ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${p.remarks}</div>` : ''}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-family:var(--mono);font-size:15px;font-weight:700;color:var(--accent)">${fmt(p.netPay)}</div>
          <div style="font-size:11px;color:var(--text3)">Net Pay</div>
          <div style="font-size:11px;color:var(--text3);margin-top:4px">Generated ${new Date(p.generatedAt).toLocaleDateString('en-PH')}</div>
        </div>
        <div style="margin-left:12px;color:var(--text3);font-size:18px">›</div>
      </div>`).join('');
  } catch(e) {
    list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--red)">Failed to load: ${e.message}</div>`;
  }
}

// ==================== LOW-END PHONE PERFORMANCE HELPERS ====================
(function setupLowEndPhonePerformance(){
  const isSmallDevice = () => window.innerWidth <= 768;

  // Close cameras when the app/tab is hidden to reduce battery, heat and lag.
  document.addEventListener('visibilitychange', function(){
    if(document.hidden){
      try{ if(typeof stopEmployeeScanner === 'function') stopEmployeeScanner(); }catch(e){}
      try{ if(typeof stopInlineScanner === 'function') stopInlineScanner(); }catch(e){}
    }
  });

  // Stop active camera scanners before changing pages. This prevents camera streams
  // from running behind the scenes on low-end phones.
  const originalShowPage = window.showPage;
  if(typeof originalShowPage === 'function'){
    window.showPage = function(page){
      try{ if(page !== 'my-qr' && typeof stopEmployeeScanner === 'function') stopEmployeeScanner(); }catch(e){}
      try{ if(page !== 'kiosk' && typeof stopInlineScanner === 'function') stopInlineScanner(); }catch(e){}
      return originalShowPage.apply(this, arguments);
    };
  }

  // Use fewer table rows per page on phones to reduce DOM work.
  const originalRenderPagination = window.renderPagination;
  window.getEffectivePageSize = function(){ return isSmallDevice() ? 6 : PAGE_SIZE; };

  // Patch table renderers to use smaller phone page size without changing desktop behavior.
  const originalRenderMyTimesheet = window.renderMyTimesheet;
  if(typeof originalRenderMyTimesheet === 'function'){
    window.renderMyTimesheet = function(rows){
      const old = window.PAGE_SIZE;
      return originalRenderMyTimesheet.apply(this, arguments);
    };
  }

  // Lightweight reflow hint after orientation changes.
  window.addEventListener('orientationchange', function(){
    document.body.classList.remove('sidebar-open');
    setTimeout(function(){ window.dispatchEvent(new Event('resize')); }, 250);
  });
})();



/* =========================================================
   APPROVAL CENTER EMPTY FINAL FIX v10.17
   Combined final patch:
   - Approval Center will load nested and flat request data
   - If exact path is missing, recall uses full fallback scan
   - Recalled visual indicators appear in APP column and Approval Center
   - Rank-and-File can recall own Pending only
   - Allowed roles can recall Pending/Approved
========================================================= */
(function(){
  const RECALL_ALLOWED_ROLES = ['admin','administrator','admin user','manager','area manager','store manager','supervisor'];

  function acEsc(v){
    if(typeof esc === 'function') return esc(v);
    return String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }
  function acNorm(v){ return String(v || '').toLowerCase().trim().replace(/[_-]+/g,' ').replace(/\s+/g,' '); }
  function acRaw(v){ return String(v || '').toLowerCase().trim(); }
  function acRole(){ return acNorm(typeof role === 'function' ? role() : (currentUserData?.role || '')); }
  function acAllowedRole(){ return RECALL_ALLOWED_ROLES.map(acNorm).includes(acRole()); }
  function acApproved(s){ return ['approved','approved_1','appr1','apprf','final_approved'].includes(acRaw(s)); }
  function acPending(r){
    const s=acRaw(r?.status), wf=acRaw(r?.workflowStage);
    return s==='pending'||s==='pending_1'||s==='pending_first'||s==='approved_1'||s==='pending_final'||s==='for_final_approval'||wf==='first'||wf==='final';
  }
  function acRecalled(r){ const s=acRaw(r?.status); return s==='recalled'||s==='recall'||r?.recalled===true; }
  function acRankFile(){ const r=acRole(); return !r || ['rank','rank and file','rank file','rankfile','employee','staff','user','team member'].includes(r); }
  function acOwnPending(r){
    const requestUid=String(r?.uid||r?.userUid||r?.employeeUid||'');
    const currentUid=String(typeof uid==='function'?uid():(currentUserData?.uid||auth?.currentUser?.uid||''));
    return requestUid && currentUid && requestUid===currentUid && acRankFile() && acPending(r);
  }
  function acStatusGroup(r){
    const s=acRaw(r?.status), wf=acRaw(r?.workflowStage);
    if(acRecalled(r)) return 'recalled';
    if(s==='cancelled'||s==='canceled') return 'cancelled';
    if(s==='rejected'||s==='disapproved'||s==='rejected_1'||s==='disapproved_1') return 'rejected';
    if(s==='approved_1'||s==='pending_final'||s==='for_final_approval'||(s==='pending'&&wf==='final')) return 'pending';
    if(s==='pending'||s==='pending_1'||s==='pending_first'||wf==='first') return 'pending';
    if(acApproved(s)) return 'approved';
    return s || 'pending';
  }
  function acCanManagerRecall(r){
    const s=acRaw(r?.status);
    if(acRecalled(r)||s==='cancelled'||s==='canceled'||acApproved(s)) return false;
    return acAllowedRole() && acPending(r);
  }
  function acCanCancel(r){
    const s=acRaw(r?.status);
    if(acRecalled(r)||s==='cancelled'||s==='canceled') return false;
    return acAllowedRole() && acApproved(s);
  }
  function acActionable(r){
    const s=acRaw(r?.status);
    if(acRecalled(r)||['cancelled','canceled','rejected','disapproved','approved'].includes(s)) return false;
    return acPending(r);
  }
  function acDateRange(r){ return r?.date || (r?.dateFrom ? `${r.dateFrom}${r.dateTo ? ' to ' + r.dateTo : ''}` : '—'); }
  function acDetails(r){
    const range=acDateRange(r);
    if(r?.type==='time_correction') return `Manual Time: ${r.manualTimeIn||r.timeIn||'—'} - ${r.manualTimeOut||r.timeOut||'—'} · ${range}`;
    if(r?.type==='shift_change') return `New Shift: ${r.requestedShift||r.newShift||r.shiftCode||'—'} · ${range}`;
    if(r?.type==='leave') return `${r.leaveType||'Leave'} · ${r.days||r.leaveDays||''} day(s) · ${range}`;
    if(r?.type==='overtime') return `OT: ${r.startTime||r.start||'—'} - ${r.endTime||r.end||'—'} · ${r.hours||''} hr(s) · ${range}`;
    if(r?.type==='undertime') return `Undertime: ${r.timeLeft||r.undertimeTime||r.endTime||'—'} · ${range}`;
    return range;
  }
  function acSetAllStatusDefault(){
    const sel=document.getElementById('req-filter-status');
    if(!sel) return;
    if(!Array.from(sel.options).some(o=>o.value==='')) sel.insertAdjacentHTML('afterbegin','<option value="">All Status</option>');
    if(!sel.dataset.v1017Defaulted){ sel.value=''; sel.dataset.v1017Defaulted='1'; }
  }

  // APP chip status helpers
  window.getReqStatusClass=function(req){
    const s=acRaw(req?.status), wf=acRaw(req?.workflowStage);
    if(acRecalled(req)) return 'recall';
    if(s==='cancelled'||s==='canceled') return 'cancel';
    if(s==='pending') return wf==='final'?'pendf':'pend1';
    if(s==='approved_1'||(s==='approved'&&wf==='first')) return 'appr1';
    if(s==='rejected_1'||(s==='rejected'&&wf==='first')||(s==='disapproved'&&wf==='first')) return 'disap1';
    if(s==='approved') return 'apprf';
    if(s==='rejected'||s==='disapproved') return 'disapf';
    return 'pend1';
  };
  window.getDominantRowClass=function(reqs){
    if(!reqs||!reqs.length) return '';
    const priority=['recall','apprf','disapf','appr1','disap1','pendf','pend1','cancel'];
    const classes=reqs.map(r=>getReqStatusClass(r));
    for(const p of priority){ if(classes.includes(p)) return 'ts-row-'+p; }
    return '';
  };
  window.buildReqTags=function(reqs){
    if(!reqs||!reqs.length) return '';
    return reqs.map(req=>{
      const cls=getReqStatusClass(req);
      const short=({time_correction:'TC',shift_change:'SC',leave:'LV',overtime:'OT',undertime:'UT'}[req.type]||'RQ');
      const title=(req.type||'').replace(/_/g,' ')+' — '+(req.status||'')+(req.recallReason?' — '+req.recallReason:'');
      const icon=cls==='recall'?'<span class="recall-mini-icon">↩</span>':'';
      return `<span class="req-tag req-tag-${cls}${cls==='recall'?' recall-chip':''}" title="${acEsc(title)}">${icon}${short}</span>`;
    }).join('');
  };
  const oldStatusBadge=typeof statusBadge==='function'?statusBadge:null;
  window.statusBadge=function(st){
    const s=acRaw(st||'pending');
    if(s==='recalled'||s==='recall') return '<span class="recall-indicator-pill">Recalled</span>';
    return oldStatusBadge?oldStatusBadge(st):`<span class="badge badge-gray">${acEsc(st||'pending')}</span>`;
  };
  try{ statusBadge=window.statusBadge; }catch(e){}
  window.canRecallStatus=function(s){
    s=acRaw(s);
    return ['pending','pending_1','pending_first','pending_final','for_final_approval','approved','approved_1','appr1','apprf','final_approved'].includes(s);
  };
  try{ canRecallStatus=window.canRecallStatus; }catch(e){}

  function acSameRequest(row,key,uidKey,val){
    if(!row||!val) return false;
    const rowIds=[row.reqId,row.id,row.requestId].filter(Boolean).map(String);
    const valIds=[key,val.reqId,val.id,val.requestId].filter(Boolean).map(String);
    if(rowIds.some(x=>valIds.includes(x))) return true;
    const sameType=row.type&&val.type&&String(row.type)===String(val.type);
    const sameSubmitted=row.submittedAt&&val.submittedAt&&String(row.submittedAt)===String(val.submittedAt);
    const sameEmployee=(row.employeeId&&val.employeeId&&String(row.employeeId)===String(val.employeeId))||(row.uid&&uidKey&&String(row.uid)===String(uidKey));
    const sameDate=(!row.date&&!val.date)||String(row.date||row.dateFrom||'')===String(val.date||val.dateFrom||'');
    return !!(sameType&&sameSubmitted&&sameEmployee&&sameDate);
  }
  async function acFindRequestRef(row){
    row=row||{};
    const requestUid=row.uid||row.userUid||row.employeeUid||'';
    const reqId=row.reqId||row.id||row.requestId||'';
    const paths=[];
    if(requestUid&&reqId) paths.push(`requests/${requestUid}/${reqId}`);
    if(reqId) paths.push(`requests/${reqId}`);
    for(const path of paths){
      const ref=db.ref(path); const snap=await ref.once('value');
      if(snap.exists()) return {ref,snap,path,uid:requestUid,reqId};
    }
    const rootSnap=await db.ref('requests').once('value');
    let found=null;
    rootSnap.forEach(parentSnap=>{
      if(found) return;
      const parentVal=parentSnap.val(); if(!parentVal) return;
      if(parentVal.type){
        if(acSameRequest(row,parentSnap.key,parentVal.uid||parentVal.userUid||parentVal.employeeUid||'',parentVal)) found={path:`requests/${parentSnap.key}`,uid:parentVal.uid||parentVal.userUid||parentVal.employeeUid||'',reqId:parentSnap.key,val:parentVal};
        return;
      }
      Object.keys(parentVal||{}).forEach(childKey=>{
        if(found) return;
        const childVal=parentVal[childKey];
        if(acSameRequest(row,childKey,parentSnap.key,childVal)) found={path:`requests/${parentSnap.key}/${childKey}`,uid:parentSnap.key,reqId:childKey,val:childVal};
      });
    });
    if(found){ const ref=db.ref(found.path); return {ref,snap:{exists:()=>true,val:()=>found.val},path:found.path,uid:found.uid,reqId:found.reqId}; }
    return null;
  }

  window.recallRequest=async function(requestUid,reqId,mode='employee',rowObj=null){
    try{
      const row=rowObj||{uid:requestUid,reqId:reqId};
      const found=await acFindRequestRef(row);
      if(!found){ say('Request not found. Fallback scan failed. Please reload Approval Center and try again.','red'); return; }
      const r={uid:found.uid||requestUid||row.uid||'',reqId:found.reqId||reqId||row.reqId||row.id||'',...found.snap.val()};
      const s=acRaw(r.status);
      if(acRecalled(r)||s==='cancelled'||s==='canceled'){ say('This request is already recalled/cancelled.','amber'); return; }
      if(mode==='employee'){
        if(!acOwnPending(r)){ say('You can only recall your own pending request.','red'); return; }
      }else{
        if(!acAllowedRole()){ say(`Your role (${acRole()||'unknown'}) is not allowed to recall requests.`,'red'); return; }
        if(acApproved(s)){ say('Approved requests cannot be recalled — use the Cancel button instead.','amber'); return; }
        if(!acPending(r)){ say('Only pending requests can be recalled.','amber'); return; }
      }
      const reason=prompt('Enter recall reason / remarks:',mode==='employee'?'Recalled by employee':'Recalled by authorized role')||'';
      if(!confirm(`Recall this request?\nCurrent status: ${r.status||'pending'}`)) return;
      await found.ref.update({status:'recalled',previousStatus:r.status||'',recalled:true,recalledAt:Date.now(),recalledBy:currentUserData?.name||auth?.currentUser?.email||'',recalledByRole:typeof role==='function'?role():mode,recallReason:reason,remarks:reason||r.remarks||''});
      try{ await db.ref('approvalRecallAudit').push({uid:r.uid||'',reqId:r.reqId||'',path:found.path,type:r.type,employeeName:r.employeeName||'',employeeId:r.employeeId||'',previousStatus:r.status||'',reason,recalledBy:currentUserData?.name||auth?.currentUser?.email||'',recalledByRole:typeof role==='function'?role():mode,recalledAt:Date.now()}); }catch(e){}

      // ── Revert all timelog side-effects via shared helper ────────────────
      await _revertTimelogForRequest(requestUid, found.reqId || reqId || r.reqId || '', r);
      // ─────────────────────────────────────────────────────────────────────

      say('Request recalled successfully.','green');
      [100,500,1200].forEach(ms=>setTimeout(()=>{try{loadAllRequests?.();}catch(e){} try{loadMyTimesheet?.();}catch(e){}},ms));
    }catch(e){ console.error('Recall failed:',e); say('Recall failed: '+(e.message||e),'red'); }
  };

  // Employee request pages: Rank-and-File own pending recall.
  try{
    actionOwn=function(r){
      const requestUid=r.uid||(typeof uid==='function'?uid():currentUserData?.uid||'');
      const id=r.id||r.reqId||r.requestId||'';
      const row={uid:requestUid,...r};
      if(acOwnPending(row)) return `<button type="button" class="btn btn-amber btn-xs js-employee-recall" data-uid="${acEsc(requestUid)}" data-reqid="${acEsc(id)}">↩ Recall</button>`;
      if(acApproved(r.status)) return '<span style="font-size:10px;color:var(--text3)">Authorized recall roles only</span>';
      if(acRecalled(r)) return '<span class="recall-indicator-pill">Recalled</span>';
      return '';
    };
  }catch(e){}


  /* ── Cancel approved request (admin/manager only) ── */
  window.cancelRequest = async function(rowIndex) {
    const r = window.__approvalCenterRows?.[rowIndex];
    if (!r) { say('Unable to find request. Please reload.', 'red'); return; }
    if (!acAllowedRole()) { say('Your role is not permitted to cancel approved requests.', 'red'); return; }
    const s = acRaw(r.status);
    if (!acApproved(s)) { say('Only approved requests can be cancelled.', 'amber'); return; }
    const reason = prompt('Enter cancellation reason:', 'Cancelled by approver') || '';
    if (!confirm('Cancel this approved request?\nThis will revert any timelog changes.')) return;
    try {
      const found = await acFindRequestRef(r);
      if (!found) { say('Request not found. Please reload.', 'red'); return; }
      await found.ref.update({
        status: 'cancelled',
        previousStatus: r.status || 'approved',
        cancelled: true,
        cancelledAt: Date.now(),
        cancelledBy: currentUserData?.name || auth?.currentUser?.email || '',
        cancelledByRole: typeof role === 'function' ? role() : (currentUserData?.role || ''),
        cancelReason: reason,
        remarks: reason || r.remarks || ''
      });
      try {
        await db.ref('approvalRecallAudit').push({
          uid: r.uid || '', reqId: r.reqId || r.id || '', path: found.path,
          type: r.type, employeeName: r.employeeName || '', employeeId: r.employeeId || '',
          previousStatus: r.status || 'approved', action: 'cancelled', reason,
          cancelledBy: currentUserData?.name || auth?.currentUser?.email || '',
          cancelledByRole: currentUserData?.role || '', cancelledAt: Date.now()
        });
      } catch(e) {}
      await _revertTimelogForRequest(r.uid || '', found.reqId || r.reqId || r.id || '', r);
      say('Request cancelled successfully.', 'green');
      [100, 500, 1200].forEach(ms => setTimeout(() => {
        try { loadAllRequests?.(); } catch(e) {}
        try { loadMyTimesheet?.(); } catch(e) {}
      }, ms));
    } catch(e) { console.error('Cancel failed:', e); say('Cancel failed: ' + (e.message || e), 'red'); }
  };

  function acRenderApprovals(list,c){
    if(!c) c=document.getElementById('approval-list');
    if(!c) return;
    const countEl=document.getElementById('approval-record-count');
    window.__approvalCenterRows=list||[];
    if(!list||!list.length){ c.innerHTML='<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">No requests found</td></tr>'; if(countEl) countEl.textContent='0 items'; return; }
    const typeLabels={time_correction:'Time Correction',shift_change:'Shift Change',leave:'Leave',overtime:'Overtime',undertime:'Undertime'};
    const typeBadges={time_correction:'badge-blue',shift_change:'badge-purple',leave:'badge-green',overtime:'badge-amber',undertime:'badge-red'};
    c.innerHTML=list.map((r,i)=>{
      let actions='';
      if(acActionable(r)){ actions+=`<button type="button" class="btn btn-success btn-xs" onclick="openApproveModal(window.__approvalCenterRows[${i}])">✓ Approve</button> `; actions+=`<button type="button" class="btn btn-danger btn-xs" onclick="openRejectModal(window.__approvalCenterRows[${i}])">✕ Reject</button>`; }
      if(acCanManagerRecall(r)) actions+=` <button type="button" class="btn btn-amber btn-xs js-recall-request" data-row-index="${i}">↩ Recall</button>`;
      if(acCanCancel(r)) actions+=` <button type="button" class="btn btn-danger btn-xs" style="background:var(--st-cancel);border-color:var(--st-cancel)" onclick="cancelRequest(${i})">✕ Cancel</button>`;
      if(!actions) actions=r.recallReason?`<span style="font-size:10px;color:var(--text2)">${acEsc(r.recallReason)}</span>`:'<span style="color:var(--text3)">—</span>';
      const st=acRecalled(r)?'<span class="recall-indicator-pill">Recalled</span>':(typeof statusBadge==='function'?statusBadge(r.status||'pending'):`<span class="badge badge-gray">${acEsc(r.status||'pending')}</span>`);
      return `<tr${acRecalled(r)?' class="recall-row recall-row-watermark"':''}>
        <td><span class="badge ${typeBadges[r.type]||'badge-gray'}" style="font-size:10px">${typeLabels[r.type]||acEsc(r.type||'Request')}</span></td>
        <td><div style="font-weight:600">${acEsc(r.employeeName||r.name||'—')}</div><div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${acEsc(r.employeeId||'')}</div></td>
        <td style="font-size:11px;color:var(--text2);white-space:normal">${acEsc(acDetails(r))}</td>
        <td style="font-size:11px;color:var(--text2);white-space:normal">${acEsc(r.reason||r.remarks||r.recallReason||'—')}</td>
        <td style="font-size:10px;color:var(--text3);font-family:var(--mono)">${r.submittedAt?new Date(r.submittedAt).toLocaleString():'—'}</td>
        <td>${st}</td>
        <td style="text-align:center;white-space:nowrap">${actions}</td>
      </tr>`;
    }).join('');
    if(countEl) countEl.textContent=`${list.length} item${list.length===1?'':'s'}`;
  }

  function acLoadAllRequests(){
    acSetAllStatusDefault();
    const typeFilter=document.getElementById('req-filter-type')?.value||'';
    const statusFilter=document.getElementById('req-filter-status')?.value||'';
    const c=document.getElementById('approval-list'); if(!c) return;
    const countEl=document.getElementById('approval-record-count');
    c.innerHTML='<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">Loading requests...</td></tr>';
    if(countEl) countEl.textContent='Loading...';
    const timer=setTimeout(()=>{ if(c && /Loading requests/i.test(c.textContent||'')){ c.innerHTML='<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--amber)">Still loading requests. Firebase rules may be blocking read access to /requests, or the browser is offline.</td></tr>'; if(countEl) countEl.textContent='0 items'; } },8000);
    db.ref('requests').once('value').then(snap=>{
      clearTimeout(timer);
      const all=[];
      const pushReq=(reqId,uidKey,raw)=>{ const r=raw||{}; if(!r||typeof r!=='object'||!r.type) return; const row={reqId,uid:r.uid||r.userUid||r.employeeUid||uidKey,...r}; if(typeFilter&&row.type!==typeFilter) return; if(statusFilter&&acStatusGroup(row)!==statusFilter) return; all.push(row); };
      snap.forEach(parent=>{ const val=parent.val(); if(!val) return; if(val.type){ pushReq(parent.key,val.uid||val.userUid||val.employeeUid||'',val); return; } Object.keys(val||{}).forEach(childKey=>pushReq(childKey,parent.key,val[childKey])); });
      all.sort((a,b)=>Number(b.submittedAt||b.createdAt||b.approvedAt||b.recalledAt||0)-Number(a.submittedAt||a.createdAt||a.approvedAt||a.recalledAt||0));
      acRenderApprovals(all,c);
      try{updateApprovalBadge?.();}catch(e){}
    }).catch(err=>{ clearTimeout(timer); console.error('Approval Center load error:',err); c.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--red)">Approval Center cannot read /requests: ${acEsc(err?.message||String(err))}</td></tr>`; if(countEl) countEl.textContent='0 items'; });
  }

  window.renderApprovals=acRenderApprovals;
  window.loadAllRequests=acLoadAllRequests;
  try{renderApprovals=acRenderApprovals;}catch(e){}
  try{loadAllRequests=acLoadAllRequests;}catch(e){}

  if(typeof showPage==='function'&&!window.__approvalCenterShowPagePatchedV1017){
    const oldShowPage=showPage;
    window.showPage=function(page){ const out=oldShowPage.apply(this,arguments); if(page==='approvals') setTimeout(acLoadAllRequests,80); return out; };
    try{showPage=window.showPage;}catch(e){}
    window.__approvalCenterShowPagePatchedV1017=true;
  }

  document.addEventListener('click',function(e){
    const managerBtn=e.target.closest('.js-recall-request');
    if(managerBtn){ e.preventDefault(); e.stopPropagation(); const idx=Number(managerBtn.dataset.rowIndex); const r=window.__approvalCenterRows?.[idx]; if(!r){say('Unable to find selected request row. Please reload Approval Center.','red'); return;} recallRequest(r.uid||r.userUid||r.employeeUid||'',r.reqId||r.id||r.requestId||'','manager',r); return; }
    const empBtn=e.target.closest('.js-employee-recall');
    if(empBtn){ e.preventDefault(); e.stopPropagation(); recallRequest(empBtn.dataset.uid||'',empBtn.dataset.reqid||'','employee'); }
  },true);

  document.addEventListener('DOMContentLoaded',()=>{
    setTimeout(acSetAllStatusDefault,300);
    setInterval(()=>{ const page=document.getElementById('page-approvals'); const list=document.getElementById('approval-list'); if(page&&list&&page.classList.contains('active')&&/Loading requests/i.test(list.textContent||'')) acLoadAllRequests(); },3000);
  });
})();

// ==================== SALARY AGREEMENT WORKFLOW ====================

// --- Offer rate chip auto-compute ---
function computeOfferRates(){
  const basic = parseFloat(document.getElementById('offer-basic')?.value) || 0;
  const daily = basic > 0 ? basic / 26 : 0;
  const dEl = document.getElementById('offer-daily');
  const chip = document.getElementById('offer-rate-chip');
  if(dEl) dEl.value = daily > 0 ? daily.toFixed(2) : '';
  if(chip){
    if(basic > 0){
      chip.style.display = 'block';
      chip.innerHTML = `₱${daily.toLocaleString('en-PH',{minimumFractionDigits:2})} / day &nbsp;×&nbsp; 26 days &nbsp;=&nbsp; <strong>₱${basic.toLocaleString('en-PH',{minimumFractionDigits:2})} / month</strong>`;
    } else { chip.style.display = 'none'; }
  }
}
window.computeOfferRates = computeOfferRates;

// --- Open Send Offer modal from Salary Agreements page ---
async function openSalOfferModal(uid){
  const snap = await db.ref(`users/${uid}`).once('value');
  if(!snap.exists()){ toast('Employee not found','red'); return; }
  const u = snap.val();
  document.getElementById('sal-offer-uid').value = uid;
  document.getElementById('sal-offer-emp-banner').innerHTML =
    `<strong>${u.name||'—'}</strong> &nbsp;·&nbsp; ${u.employeeId||''} &nbsp;·&nbsp; ${u.department||''}`;
  document.getElementById('offer-basic').value   = u.salaryInfo?.basicMonthly || '';
  document.getElementById('offer-freq').value    = u.salaryInfo?.payFrequency  || 'semi-monthly';
  document.getElementById('offer-position').value= u.position || u.role || '';
  document.getElementById('offer-emptype').value = u.employmentType || 'Regular';
  document.getElementById('offer-notes').value   = '';
  document.getElementById('offer-effectiveDate').value = '';
  computeOfferRates();
  showModal('sal-offer-modal');
}
window.openSalOfferModal = openSalOfferModal;

// --- Send Salary Offer (HR saves to Firebase, employee sees it) ---
async function sendSalaryOffer(){
  const uid       = document.getElementById('sal-offer-uid').value;
  const basic     = parseFloat(document.getElementById('offer-basic').value);
  const effDate   = document.getElementById('offer-effectiveDate').value;
  if(!uid)            { toast('No employee selected','red'); return; }
  if(!basic || basic <= 0){ toast('Enter a valid Basic Monthly Salary','amber'); return; }
  if(!effDate)        { toast('Set an Effective Date','amber'); return; }

  const dailyRate  = basic / 26;
  const hourlyRate = dailyRate / 8;
  const payload = {
    uid,
    offeredBy:      currentUserData?.name || auth.currentUser?.email || 'HR',
    offeredByRole:  currentUserData?.role || 'hr',
    offeredAt:      Date.now(),
    effectiveDate:  effDate,
    basicMonthly:   basic,
    dailyRate:      parseFloat(dailyRate.toFixed(4)),
    hourlyRate:     parseFloat(hourlyRate.toFixed(4)),
    payFrequency:   document.getElementById('offer-freq').value,
    position:       document.getElementById('offer-position').value.trim(),
    employmentType: document.getElementById('offer-emptype').value,
    notes:          document.getElementById('offer-notes').value.trim(),
    status:         'pending',   // pending | agreed | disputed
    employeeResponse: '',
    respondedAt:    null
  };

  const btn = document.getElementById('sal-offer-send-btn');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    await db.ref(`salaryAgreements/${uid}`).push(payload);
    toast('Salary offer sent to employee ✓','green');
    closeModal('sal-offer-modal');
    loadSalaryAgreementsMgr();
  } catch(e){ toast('Failed: '+e.message,'red'); }
  finally { btn.disabled=false; btn.textContent='📤 Send Offer to Employee'; }
}
window.sendSalaryOffer = sendSalaryOffer;

// --- Manager: Load all salary agreements ---
async function loadSalaryAgreementsMgr(){
  const el = document.getElementById('sal-agreements-list');
  if(!el) return;
  el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)">Loading…</div>`;

  // Load all employees
  let employees = {};
  try {
    const uSnap = await db.ref('users').once('value');
    uSnap.forEach(c => { employees[c.key] = c.val(); });
  } catch(e){}

  // Load all salary agreements
  let rows = [];
  try {
    const aSnap = await db.ref('salaryAgreements').once('value');
    aSnap.forEach(uidNode => {
      const empUid = uidNode.key;
      uidNode.forEach(offerNode => {
        rows.push({ _key: offerNode.key, _uid: empUid, ...offerNode.val(), _emp: employees[empUid] || {} });
      });
    });
  } catch(e){}

  rows.sort((a,b) => (b.offeredAt||0) - (a.offeredAt||0));

  // Count pending (no response yet) for badge
  const pendingCount = rows.filter(r=>r.status==='pending').length;
  const badge = document.getElementById('sal-agree-mgr-badge');
  if(badge){ badge.textContent = pendingCount; badge.classList.toggle('hidden', pendingCount===0); }

  if(!rows.length){
    el.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--text3)">
        <div style="font-size:40px;margin-bottom:12px">📋</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px">No salary offers sent yet</div>
        <div style="font-size:13px;margin-bottom:24px">Send a salary offer to an employee from the Payroll page, or use the button below.</div>
        <button class="btn btn-primary" onclick="showPage('payroll')">Go to Payroll</button>
      </div>`;
    return;
  }

  const statusLabel = { pending:'⏳ Awaiting Response', agreed:'✅ Agreed', disputed:'⚠ Disputed' };
  const statusBadgeClass = { pending:'badge-amber', agreed:'badge-green', disputed:'badge-red' };

  el.innerHTML = `
    <div class="tbl-wrap">
      <table>
        <thead><tr>
          <th>Employee</th><th>Offered Salary</th><th>Daily Rate</th><th>Effective Date</th>
          <th>Pay Type</th><th>Status</th><th>Employee Response</th><th>Sent</th><th>Action</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => {
            const emp = r._emp;
            const stClass = statusBadgeClass[r.status] || 'badge-gray';
            const stLabel = statusLabel[r.status] || r.status;
            const sentDate = r.offeredAt ? new Date(r.offeredAt).toLocaleDateString('en-PH') : '—';
            const respDate = r.respondedAt ? new Date(r.respondedAt).toLocaleString('en-PH') : '';
            return `<tr>
              <td>
                <div style="font-weight:600">${emp.name||r._uid}</div>
                <div style="font-size:11px;color:var(--text3)">${emp.employeeId||''}</div>
              </td>
              <td style="font-family:var(--mono);color:var(--accent);font-weight:600">₱${Number(r.basicMonthly||0).toLocaleString('en-PH',{minimumFractionDigits:2})}</td>
              <td style="font-family:var(--mono);color:var(--text2)">₱${Number(r.dailyRate||0).toLocaleString('en-PH',{minimumFractionDigits:2})}</td>
              <td style="font-size:12px">${r.effectiveDate||'—'}</td>
              <td><span class="badge badge-blue" style="font-size:10px">${r.payFrequency||'—'}</span></td>
              <td><span class="badge ${stClass}" style="font-size:10px">${stLabel}</span></td>
              <td style="font-size:11px;color:var(--text2);max-width:180px;white-space:normal">
                ${r.employeeResponse ? `"${r.employeeResponse}"` : '<span style="color:var(--text3)">—</span>'}
                ${respDate ? `<div style="font-size:10px;color:var(--text3)">${respDate}</div>` : ''}
              </td>
              <td style="font-size:11px;color:var(--text3)">${sentDate}<div style="font-size:10px">${r.offeredBy||''}</div></td>
              <td>
                ${r.status==='pending'?`<button class="btn btn-ghost btn-xs" onclick="cancelSalOffer('${r._uid}','${r._key}')">✕ Cancel</button>`:''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}
window.loadSalaryAgreementsMgr = loadSalaryAgreementsMgr;

// --- Manager: Cancel a pending offer ---
async function cancelSalOffer(uid, key){
  if(!confirm('Cancel this salary offer?')) return;
  await db.ref(`salaryAgreements/${uid}/${key}`).update({ status:'cancelled', cancelledAt: Date.now(), cancelledBy: currentUserData?.name||'' });
  toast('Offer cancelled','amber');
  loadSalaryAgreementsMgr();
}
window.cancelSalOffer = cancelSalOffer;

// --- Employee: Load their own salary offers ---
async function loadMySalaryAgreement(){
  const el = document.getElementById('my-sal-agreement-content');
  if(!el) return;
  const myUid = auth.currentUser?.uid;
  if(!myUid){ el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text3)">Not logged in.</div>'; return; }
  el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3)">Loading…</div>`;

  let offers = [];
  try {
    const snap = await db.ref(`salaryAgreements/${myUid}`).once('value');
    snap.forEach(c => offers.push({ _key: c.key, ...c.val() }));
  } catch(e){}
  offers.sort((a,b)=>(b.offeredAt||0)-(a.offeredAt||0));

  // Notification badge update
  const pending = offers.filter(o=>o.status==='pending').length;
  const badge = document.getElementById('sal-agree-badge');
  if(badge){ badge.textContent='!'; badge.classList.toggle('hidden', pending===0); }

  if(!offers.length){
    el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text3)">
      <div style="font-size:40px;margin-bottom:12px">📭</div>
      <div style="font-size:15px;font-weight:600">No salary offers yet</div>
      <div style="font-size:13px;margin-top:6px">HR will send you a salary offer here when ready.</div>
    </div>`;
    return;
  }

  el.innerHTML = offers.map(o => {
    const isPending = o.status === 'pending';
    const statusColor = { pending:'var(--amber)', agreed:'var(--green)', disputed:'var(--red)', cancelled:'var(--text3)' }[o.status] || 'var(--text3)';
    const statusLabel = { pending:'⏳ Awaiting Your Response', agreed:'✅ You Agreed', disputed:'⚠ You Disputed', cancelled:'Cancelled' }[o.status] || o.status;
    return `
    <div class="card mb16" style="border-left:4px solid ${statusColor};max-width:680px">
      <div class="card-header">
        <div>
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text3);margin-bottom:3px">Salary Offer from ${o.offeredBy||'HR'}</div>
          <div style="font-family:var(--display);font-size:18px;font-weight:700;color:var(--accent)">
            ₱${Number(o.basicMonthly||0).toLocaleString('en-PH',{minimumFractionDigits:2})} / month
          </div>
        </div>
        <span class="badge" style="background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor};font-size:11px">${statusLabel}</span>
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
          <div style="background:var(--bg3);border-radius:var(--r);padding:10px 12px">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Daily Rate</div>
            <div style="font-family:var(--mono);font-weight:700;color:var(--text);margin-top:3px">₱${Number(o.dailyRate||0).toLocaleString('en-PH',{minimumFractionDigits:2})}</div>
          </div>
          <div style="background:var(--bg3);border-radius:var(--r);padding:10px 12px">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Pay Schedule</div>
            <div style="font-weight:600;color:var(--text);margin-top:3px">${o.payFrequency||'—'}</div>
          </div>
          <div style="background:var(--bg3);border-radius:var(--r);padding:10px 12px">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Effective Date</div>
            <div style="font-weight:600;color:var(--text);margin-top:3px">${o.effectiveDate||'—'}</div>
          </div>
        </div>
        ${o.position ? `<div style="margin-bottom:8px;font-size:13px"><span style="color:var(--text3)">Position:</span> <strong>${o.position}</strong> &nbsp;·&nbsp; ${o.employmentType||''}</div>` : ''}
        ${o.notes ? `<div style="background:var(--blue-bg);border:1px solid #93C5FD;border-radius:var(--r);padding:10px 12px;font-size:13px;color:var(--text2);margin-bottom:14px">💬 ${o.notes}</div>` : ''}
        ${isPending ? `
          <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:14px;margin-top:4px">
            <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text2)">Your Response</div>
            <textarea class="input" id="response-${o._key}" placeholder="Optional: add a remark or comment before agreeing/disputing…" style="min-height:60px;margin-bottom:10px;font-size:13px"></textarea>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary" style="flex:1" onclick="respondSalOffer('${o._key}','agreed')">✅ I Agree to This Salary</button>
              <button class="btn btn-ghost" style="flex:1;border-color:var(--red);color:var(--red)" onclick="respondSalOffer('${o._key}','disputed')">⚠ I Have Concerns</button>
            </div>
          </div>` :
          `<div style="font-size:12px;color:var(--text3);margin-top:4px">
            ${o.employeeResponse ? `Your remark: <em>"${o.employeeResponse}"</em><br>` : ''}
            ${o.respondedAt ? `Responded: ${new Date(o.respondedAt).toLocaleString('en-PH')}` : ''}
          </div>`
        }
      </div>
    </div>`;
  }).join('');
}
window.loadMySalaryAgreement = loadMySalaryAgreement;

// --- Employee responds to a salary offer ---
async function respondSalOffer(offerKey, response){
  const myUid = auth.currentUser?.uid;
  if(!myUid) return;
  const remark = document.getElementById(`response-${offerKey}`)?.value.trim() || '';
  const label = response === 'agreed' ? 'agree to' : 'flag a concern about';
  if(!confirm(`You are about to ${label} this salary offer. Continue?`)) return;
  try {
    await db.ref(`salaryAgreements/${myUid}/${offerKey}`).update({
      status: response,
      employeeResponse: remark,
      respondedAt: Date.now(),
      respondedBy: currentUserData?.name || auth.currentUser?.email || ''
    });
    toast(response === 'agreed' ? 'Salary agreed! HR has been notified ✓' : 'Concern submitted. HR will follow up.', response === 'agreed' ? 'green' : 'amber');
    loadMySalaryAgreement();
  } catch(e){ toast('Failed: '+e.message, 'red'); }
}
window.respondSalOffer = respondSalOffer;

// --- On login: check for pending salary offers for employee badge ---
// Called from the existing auth.onAuthStateChanged in the main auth block
function checkSalAgreeBadge(){
  const myUid = auth.currentUser?.uid;
  if(!myUid) return;
  db.ref(`salaryAgreements/${myUid}`).once('value').then(snap=>{
    let pending = 0;
    snap.forEach(c=>{ if(c.val()?.status==='pending') pending++; });
    const badge = document.getElementById('sal-agree-badge');
    if(badge){ badge.textContent='!'; badge.classList.toggle('hidden', pending===0); }
  }).catch(()=>{});
}
window.checkSalAgreeBadge = checkSalAgreeBadge;

// --- Add "Send Offer" button to payroll employee cards ---
// Deferred so renderPayrollGrid is already defined when this runs
document.addEventListener('DOMContentLoaded', function(){
  const _orig = window.renderPayrollGrid;
  if(!_orig || window.__salOfferGridPatched) return;
  window.__salOfferGridPatched = true;
  window.renderPayrollGrid = function(employees){
    _orig(employees);
    document.querySelectorAll('.payroll-emp-card').forEach((card, i) => {
      const u = employees[i];
      if(!u || !u.uid) return;
      const btnRow = card.querySelector('div[style*="display:flex"][style*="gap:6px"]');
      if(!btnRow || btnRow.querySelector('.sal-offer-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'btn btn-ghost btn-sm sal-offer-btn';
      btn.style.flex = '1';
      btn.innerHTML = '📋 Send Offer';
      btn.onclick = () => openSalOfferModal(u.uid);
      btnRow.appendChild(btn);
    });
  };
});



/* ===== NEXT INLINE SCRIPT BLOCK ===== */


// ==================== IMPORT EMPLOYEES FROM EXCEL (FULL FIELDS) ====================
let importRows = [];

function showImportEmpModal() {
  resetImport();
  showModal('import-emp-modal');
}

function resetImport() {
  importRows = [];
  document.getElementById('import-step-upload').classList.remove('hidden');
  document.getElementById('import-step-preview').classList.add('hidden');
  document.getElementById('import-start-btn').classList.add('hidden');
  document.getElementById('import-progress').classList.add('hidden');
  document.getElementById('import-file-input').value = '';
}

// ── All permission page keys (matches the Add Employee modal checkboxes) ──
const ALL_PERM_KEYS = [
  'timesheet','my-qr','time-correction','shift-change','leave',
  'overtime','undertime','all-timesheet','approvals','employees',
  'holidays','shift-codes','kiosk','reports'
];
const PERM_LABELS = {
  'timesheet':'Timesheet','my-qr':'Scan Kiosk QR','time-correction':'Time Correction',
  'shift-change':'Change of Shift','leave':'Leave Application','overtime':'Overtime (OT)',
  'undertime':'Undertime','all-timesheet':'All Timesheets','approvals':'Approvals',
  'employees':'Employees','holidays':'Holiday Setup','shift-codes':'Shift Codes',
  'kiosk':'QR Kiosk','reports':'Reports'
};
// Default permissions given to rank & file employees (mirrors the modal checkboxes)
const DEFAULT_RANK_PERMS = ['timesheet','my-qr','time-correction','shift-change','leave','overtime','undertime'];

const VALID_ROLES = ['rank','supervisor','manager','admin'];

// ── Column groups for the preview table header ──
const PREVIEW_GROUPS = [
  { label:'',            cls:'',              cols:['#','Status'] },
  { label:'★ Required',  cls:'imp-th-req',    cols:['First Name','Last Name','Emp ID','Email','Password','Role'] },
  { label:'Personal',    cls:'imp-th-personal',cols:['Mid Name','Suffix','Birthdate','Sex','Civil','Nationality','Religion','Blood','Spouse Fname','Spouse Lname','Children'] },
  { label:'Contact',     cls:'imp-th-contact', cols:['Street','City','Province','ZIP','Mobile','Emrg Name','Emrg No','Emrg Rel'] },
  { label:'Gov IDs',     cls:'imp-th-govid',   cols:['SSS','PhilHealth','Pag-IBIG','TIN'] },
  { label:'Employment',  cls:'imp-th-employ',  cols:['Position','Dept','Emp Type','Date Hired','Shift','Rest Days'] },
  { label:'Benefits',    cls:'imp-th-benefit', cols:['VL','ML','SL','EL','Salary','Pay Freq'] },
  { label:'Permissions', cls:'imp-th-perm',    cols:['TS','QR','TC','CoS','LV','OT','UT','ATS','APV','EMP','HOL','SHF','KSK','RPT'] },
  { label:'',            cls:'',              cols:['Issue'] },
];

function downloadEmpTemplate() {
  const wb = XLSX.utils.book_new();

  // ── Row 1: group labels ──
  const groupRow = [];
  PREVIEW_GROUPS.forEach(g => g.cols.forEach((c, i) => {
    groupRow.push(i === 0 ? g.label : '');
  }));

  // ── Row 2: full column headers (must match parseImportRows get() keys) ──
  const headers = [
    // Required
    'First Name','Last Name','Employee ID','Email','Password','Role',
    // Personal
    'Middle Name','Suffix','Date of Birth','Sex','Civil Status','Nationality','Religion','Blood Type',
    'Spouse First Name','Spouse Last Name','No. of Children',
    // Contact
    'Street / House No.','City / Municipality','Province','ZIP Code',
    'Mobile / Phone No.','Emergency Contact Name','Emergency Contact No.','Emergency Contact Rel.',
    // Gov IDs
    'SSS No.','PhilHealth No.','Pag-IBIG / HDMF No.','TIN No.',
    // Employment
    'Position','Department','Employment Type','Date Hired','Shift Code','Rest Days',
    // Benefits
    'VL Balance','ML Balance','SL Balance','EL Balance','Basic Salary','Pay Frequency',
    // Permissions (TRUE/FALSE)
    'Perm: Timesheet','Perm: Scan Kiosk QR','Perm: Time Correction','Perm: Change of Shift',
    'Perm: Leave Application','Perm: Overtime (OT)','Perm: Undertime',
    'Perm: All Timesheets (Mgr)','Perm: Approvals (Mgr)','Perm: Employees (Mgr)',
    'Perm: Holiday Setup (Mgr)','Perm: Shift Codes (Mgr)','Perm: QR Kiosk (Mgr)','Perm: Reports (Mgr)',
  ];

  // ── Row 3: sample data ──
  const sample = [
    'Juan','Dela Cruz','700611001','juan.delacruz@company.com','Password123!','rank',
    'Santos','Jr.','1990-05-15','Male','Single','Filipino','Roman Catholic','O+',
    '','','0',
    '123 Rizal St Brgy San Miguel','Cebu City','Cebu','6000',
    '09171234567','Maria Dela Cruz','09187654321','Mother',
    '34-1234567-8','1234-5678901-2','1234-1234-1234','123-456-789-000',
    'Accounting Staff','Finance','Regular','2022-03-01','0830A','Sat,Sun',
    '15','60','5','0','25000.00','Semi-Monthly',
    'TRUE','TRUE','TRUE','TRUE','TRUE','TRUE','TRUE','FALSE','FALSE','FALSE','FALSE','FALSE','FALSE','FALSE',
  ];

  // ── Row 4: notes ──
  const notes = [
    '* Required','* Required','* Required (unique)','* Required','* Required (min 6 chars)',
    'rank|supervisor|manager|admin',
    'Optional','Jr. Sr. II III IV','YYYY-MM-DD','Male / Female',
    'Single/Married/Widowed/Separated/Divorced','e.g. Filipino','e.g. Roman Catholic',
    'A+/A-/B+/B-/AB+/AB-/O+/O-',
    'If married','If married','Number',
    'House/Unit & Street','','','',
    '09XX XXX XXXX','Full name','09XX XXX XXXX','Spouse/Parent/Sibling',
    'XX-XXXXXXX-X','XXXX-XXXXXXXX-X','XXXX-XXXX-XXXX','XXX-XXX-XXX',
    'Job title','Dept name','Regular/Probationary/Contractual/Part-Time/Project-Based',
    'YYYY-MM-DD','e.g. 0830A','Comma-sep: Sat,Sun',
    'Default:15','Default:60','Default:5','Default:0','e.g. 25000.00',
    'Monthly/Semi-Monthly/Weekly/Daily',
    'TRUE/FALSE (def TRUE)','TRUE/FALSE (def TRUE)','TRUE/FALSE (def TRUE)','TRUE/FALSE (def TRUE)',
    'TRUE/FALSE (def TRUE)','TRUE/FALSE (def TRUE)','TRUE/FALSE (def TRUE)',
    'TRUE/FALSE (def FALSE)','TRUE/FALSE (def FALSE)','TRUE/FALSE (def FALSE)',
    'TRUE/FALSE (def FALSE)','TRUE/FALSE (def FALSE)','TRUE/FALSE (def FALSE)','TRUE/FALSE (def FALSE)',
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, sample, notes]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Employee Import');

  // Reference sheet
  const ref = XLSX.utils.aoa_to_sheet([
    ['ROLE values','','SHIFT CODE examples','','REST DAYS','','PERMISSIONS (TRUE/FALSE)'],
    ['rank','','0830A — 8:30am to 5:30pm','','Sun','','Perm: Timesheet'],
    ['supervisor','','0800A — 8:00am to 5:00pm','','Mon','','Perm: Scan Kiosk QR'],
    ['manager','','0700A — 7:00am to 4:00pm','','Tue','','Perm: Time Correction'],
    ['admin','','0600A — 6:00am to 3:00pm','','Wed','','Perm: Change of Shift'],
    ['','','1200P — 12:00pm to 9:00pm','','Thu','','Perm: Leave Application'],
    ['EMPLOYMENT TYPE','','1400P — 2:00pm to 11:00pm','','Fri','','Perm: Overtime (OT)'],
    ['Regular','','2200N — 10:00pm to 7:00am','','Sat','','Perm: Undertime'],
    ['Probationary','','2300N — 11:00pm to 8:00am','','','','Perm: All Timesheets (Mgr)'],
    ['Contractual','','0000N — 12:00am to 9:00am','','','','Perm: Approvals (Mgr)'],
    ['Part-Time','','','','','','Perm: Employees (Mgr)'],
    ['Project-Based','','','','','','Perm: Holiday Setup (Mgr)'],
    ['','','PAY FREQUENCY','','','','Perm: Shift Codes (Mgr)'],
    ['','','Monthly','','','','Perm: QR Kiosk (Mgr)'],
    ['','','Semi-Monthly','','','','Perm: Reports (Mgr)'],
    ['','','Weekly','','','',''],
    ['','','Daily','','','',''],
  ]);
  ref['!cols'] = [18,2,30,2,12,2,30].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, ref, 'Reference');

  XLSX.writeFile(wb, 'timekeep_employee_import_template.xlsx');
  toast('Full template downloaded!');
}

function handleImportFile(file) {
  if (!file) return;
  if (!file.name.match(/\.xlsx?$/i)) { toast('Please upload an .xlsx file', 'amber'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // Skip rows that look like group-header / notes rows (no Employee ID AND no Email)
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const filtered = raw.filter(row => {
        const vals = Object.values(row).map(v=>v.toString().toLowerCase());
        // Skip obvious header/note rows
        if (vals.some(v => v==='* required' || v==='role values' || v==='rank|supervisor|manager|admin')) return false;
        return true;
      });
      if (!filtered.length) { toast('No employee data rows found in file', 'amber'); return; }
      parseImportRows(filtered);
    } catch(err) {
      toast('Failed to read file: ' + err.message, 'red');
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseImportRows(raw) {
  const norm = k => k.toString().toLowerCase().replace(/[^a-z0-9]/g,'');
  importRows = raw.map((row, idx) => {
    const get = (...keys) => {
      for (const k of keys) {
        for (const rk of Object.keys(row)) {
          if (norm(rk) === norm(k)) return (row[rk]||'').toString().trim();
        }
      }
      return '';
    };
    const getBool = (...keys) => {
      const v = get(...keys).toLowerCase();
      return v === 'false' || v === '0' || v === 'no' ? false : true; // default true
    };
    const getBoolFalse = (...keys) => {
      const v = get(...keys).toLowerCase();
      return v === 'true' || v === '1' || v === 'yes'; // default false
    };

    // ── Required ──
    const firstName  = get('First Name','FirstName','fname');
    const lastName   = get('Last Name','LastName','lname','Family Name');
    const empId      = get('Employee ID','EmployeeID','empid','id');
    const email      = get('Email','EmailAddress');
    const password   = get('Password','Pass');
    const roleRaw    = get('Role').toLowerCase();
    const role       = VALID_ROLES.includes(roleRaw) ? roleRaw : 'rank';

    // ── Personal ──
    const middleName    = get('Middle Name','MiddleName','mname');
    const suffix        = get('Suffix');
    const dateOfBirth   = get('Date of Birth','DateOfBirth','birthday','dob');
    const sex           = get('Sex','Gender');
    const civilStatus   = get('Civil Status','CivilStatus','marital status');
    const nationality   = get('Nationality');
    const religion      = get('Religion');
    const bloodType     = get('Blood Type','BloodType');
    const spouseFname   = get('Spouse First Name','SpouseFirstName');
    const spouseLname   = get('Spouse Last Name','Spouse Family Name','SpouseLastName');
    const children      = parseInt(get('No. of Children','Children','numchildren')) || 0;

    // ── Contact ──
    const street        = get('Street / House No.','Street','address','streethouse');
    const city          = get('City / Municipality','City');
    const province      = get('Province');
    const zip           = get('ZIP Code','ZIP','zipcode');
    const phone         = get('Mobile / Phone No.','Mobile','Phone','phoneno');
    const emergName     = get('Emergency Contact Name','EmergencyContactName');
    const emergNo       = get('Emergency Contact No.','Emergency Contact Number','EmergencyContactNo');
    const emergRel      = get('Emergency Contact Rel.','Emergency Contact Relationship','EmergencyContactRel');

    // ── Government IDs ──
    const sss           = get('SSS No.','SSS','sssno');
    const philhealth    = get('PhilHealth No.','PhilHealth','philhealthno');
    const pagibig       = get('Pag-IBIG / HDMF No.','PagIBIG','pagibig','hdmf');
    const tin           = get('TIN No.','TIN','tinno');

    // ── Employment ──
    const position      = get('Position','Job Title','jobtitle');
    const dept          = get('Department','Dept');
    const empType       = get('Employment Type','EmploymentType','emptype') || 'Regular';
    const dateHired     = get('Date Hired','DateHired','hiredate');
    const shift         = get('Shift Code','ShiftCode','shift') || '0830A';
    const rdRaw         = get('Rest Days','RestDays');
    const restDays      = rdRaw ? rdRaw.split(',').map(s=>s.trim()).filter(Boolean) : [];

    // ── Benefits ──
    const vl            = parseInt(get('VL Balance','VL','vl')) || 15;
    const ml            = parseInt(get('ML Balance','ML','ml')) || 60;
    const sl            = parseInt(get('SL Balance','SL','sl')) || 5;
    const el            = parseInt(get('EL Balance','EL','el')) || 0;
    const salary        = parseFloat(get('Basic Salary','Salary','basicSalary')) || 0;
    const payFreq       = get('Pay Frequency','PayFrequency','payfreq') || 'Semi-Monthly';

    // ── Permissions (default rank gets standard set, mgr/admin gets all) ──
    const isAdminRole   = role === 'admin' || role === 'manager';
    const permTS        = getBool('Perm: Timesheet','Perm Timesheet');
    const permQR        = getBool('Perm: Scan Kiosk QR','Perm Scan Kiosk QR');
    const permTC        = getBool('Perm: Time Correction','Perm Time Correction');
    const permCoS       = getBool('Perm: Change of Shift','Perm Change of Shift');
    const permLV        = getBool('Perm: Leave Application','Perm Leave Application');
    const permOT        = getBool('Perm: Overtime (OT)','Perm Overtime');
    const permUT        = getBool('Perm: Undertime','Perm Undertime');
    const permATS       = isAdminRole || getBoolFalse('Perm: All Timesheets (Mgr)','Perm All Timesheets');
    const permAPV       = isAdminRole || getBoolFalse('Perm: Approvals (Mgr)','Perm Approvals');
    const permEMP       = isAdminRole || getBoolFalse('Perm: Employees (Mgr)','Perm Employees');
    const permHOL       = isAdminRole || getBoolFalse('Perm: Holiday Setup (Mgr)','Perm Holiday Setup');
    const permSHF       = isAdminRole || getBoolFalse('Perm: Shift Codes (Mgr)','Perm Shift Codes');
    const permKSK       = isAdminRole || getBoolFalse('Perm: QR Kiosk (Mgr)','Perm QR Kiosk');
    const permRPT       = isAdminRole || getBoolFalse('Perm: Reports (Mgr)','Perm Reports');

    // Build permissions array
    const permMap = {
      'timesheet':permTS,'my-qr':permQR,'time-correction':permTC,'shift-change':permCoS,
      'leave':permLV,'overtime':permOT,'undertime':permUT,'all-timesheet':permATS,
      'approvals':permAPV,'employees':permEMP,'holidays':permHOL,'shift-codes':permSHF,
      'kiosk':permKSK,'reports':permRPT
    };
    const permissions = Object.entries(permMap).filter(([,v])=>v).map(([k])=>k);

    const name = [firstName, middleName, lastName, suffix].filter(Boolean).join(' ');

    // ── Validation ──
    const errors = [];
    if (!firstName)                    errors.push('Missing First Name');
    if (!lastName)                     errors.push('Missing Last Name');
    if (!empId)                        errors.push('Missing Employee ID');
    if (!email || !email.includes('@')) errors.push('Invalid Email');
    if (!password || password.length < 6) errors.push('Password too short (min 6)');

    return {
      _row: idx+2, name, firstName, middleName, lastName, suffix,
      empId, email, password, role,
      dateOfBirth, sex, civilStatus, nationality, religion, bloodType,
      spouseFname, spouseLname, children,
      street, city, province, zip, phone, emergName, emergNo, emergRel,
      sss, philhealth, pagibig, tin,
      position, dept, empType, dateHired, shift, restDays,
      vl, ml, sl, el, salary, payFreq,
      permissions,
      // raw perm flags for preview display
      _perms: [permTS,permQR,permTC,permCoS,permLV,permOT,permUT,permATS,permAPV,permEMP,permHOL,permSHF,permKSK,permRPT],
      errors
    };
  });

  renderImportPreview();
}

function renderImportPreview() {
  const valid   = importRows.filter(r => !r.errors.length).length;
  const invalid = importRows.length - valid;
  document.getElementById('import-summary').innerHTML =
    `<span style="color:var(--green);font-weight:700">${valid} valid</span> &nbsp;·&nbsp; ` +
    `<span style="color:${invalid?'var(--red)':'var(--text3)'}">${invalid} with issues</span> &nbsp;·&nbsp; ` +
    `<span style="color:var(--text3)">${importRows.length} total rows</span>`;

  // ── Build group header row ──
  const groupTr = document.getElementById('import-preview-group-row');
  groupTr.innerHTML = PREVIEW_GROUPS.map(g => {
    const span = g.cols.length;
    return `<th colspan="${span}" class="${g.cls}" style="text-align:center;padding:4px 6px;border-right:2px solid rgba(0,0,0,.08)">${g.label}</th>`;
  }).join('');

  // ── Build column header row ──
  const colTr = document.getElementById('import-preview-col-row');
  const permShortLabels = ['TS','QR','TC','CoS','LV','OT','UT','ATS','APV','EMP','HOL','SHF','KSK','RPT'];
  const allCols = [
    {l:'#',cls:''},{l:'Status',cls:''},
    {l:'First',cls:'imp-th-req'},{l:'Last',cls:'imp-th-req'},{l:'Emp ID',cls:'imp-th-req'},
    {l:'Email',cls:'imp-th-req'},{l:'Pass',cls:'imp-th-req'},{l:'Role',cls:'imp-th-req'},
    {l:'Mid',cls:'imp-th-personal'},{l:'Suffix',cls:'imp-th-personal'},{l:'Bday',cls:'imp-th-personal'},
    {l:'Sex',cls:'imp-th-personal'},{l:'Civil',cls:'imp-th-personal'},{l:'Nationality',cls:'imp-th-personal'},
    {l:'Religion',cls:'imp-th-personal'},{l:'Blood',cls:'imp-th-personal'},
    {l:'Spouse F',cls:'imp-th-personal'},{l:'Spouse L',cls:'imp-th-personal'},{l:'Kids',cls:'imp-th-personal'},
    {l:'Street',cls:'imp-th-contact'},{l:'City',cls:'imp-th-contact'},{l:'Province',cls:'imp-th-contact'},
    {l:'ZIP',cls:'imp-th-contact'},{l:'Mobile',cls:'imp-th-contact'},
    {l:'Emrg Name',cls:'imp-th-contact'},{l:'Emrg No',cls:'imp-th-contact'},{l:'Emrg Rel',cls:'imp-th-contact'},
    {l:'SSS',cls:'imp-th-govid'},{l:'PhilHlth',cls:'imp-th-govid'},{l:'PagIBIG',cls:'imp-th-govid'},{l:'TIN',cls:'imp-th-govid'},
    {l:'Position',cls:'imp-th-employ'},{l:'Dept',cls:'imp-th-employ'},{l:'Type',cls:'imp-th-employ'},
    {l:'Date Hired',cls:'imp-th-employ'},{l:'Shift',cls:'imp-th-employ'},{l:'Rest Days',cls:'imp-th-employ'},
    {l:'VL',cls:'imp-th-benefit'},{l:'ML',cls:'imp-th-benefit'},{l:'SL',cls:'imp-th-benefit'},
    {l:'EL',cls:'imp-th-benefit'},{l:'Salary',cls:'imp-th-benefit'},{l:'Pay Freq',cls:'imp-th-benefit'},
    ...permShortLabels.map(l=>({l,cls:'imp-th-perm'})),
    {l:'Issue',cls:''},
  ];
  colTr.innerHTML = allCols.map(c=>`<th class="${c.cls}" title="${c.l}">${c.l}</th>`).join('');

  // ── Build preview rows ──
  const tbody = document.getElementById('import-preview-body');
  const esc = s => (s||'').toString().replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const yn = v => v
    ? '<span style="color:var(--green);font-size:10px;font-weight:700">✓</span>'
    : '<span style="color:var(--text3);font-size:10px">–</span>';

  tbody.innerHTML = importRows.map(r => {
    const ok = !r.errors.length;
    const rowBg = ok ? '' : 'background:#fff8f7';
    const cells = [
      `<td style="color:var(--text3);font-family:var(--mono)">${r._row}</td>`,
      `<td>${ok?'<span class="imp-ok-badge">✓ OK</span>':'<span class="imp-err-badge">✗ Err</span>'}</td>`,
      // Required
      `<td style="font-weight:600">${esc(r.firstName)}</td>`,
      `<td style="font-weight:600">${esc(r.lastName)}</td>`,
      `<td style="font-family:var(--mono);color:var(--accent)">${esc(r.empId)}</td>`,
      `<td>${esc(r.email)}</td>`,
      `<td style="color:var(--text3);font-family:var(--mono)">${'•'.repeat(Math.min((r.password||'').length,8))}</td>`,
      `<td><span class="badge badge-${r.role==='admin'?'purple':r.role==='manager'?'blue':r.role==='supervisor'?'amber':'gray'}" style="font-size:9px">${r.role}</span></td>`,
      // Personal
      `<td>${esc(r.middleName)}</td>`,`<td>${esc(r.suffix)}</td>`,`<td>${esc(r.dateOfBirth)}</td>`,
      `<td>${esc(r.sex)}</td>`,`<td>${esc(r.civilStatus)}</td>`,`<td>${esc(r.nationality)}</td>`,
      `<td>${esc(r.religion)}</td>`,`<td>${esc(r.bloodType)}</td>`,
      `<td>${esc(r.spouseFname)}</td>`,`<td>${esc(r.spouseLname)}</td>`,`<td>${r.children||0}</td>`,
      // Contact
      `<td>${esc(r.street)}</td>`,`<td>${esc(r.city)}</td>`,`<td>${esc(r.province)}</td>`,
      `<td>${esc(r.zip)}</td>`,`<td>${esc(r.phone)}</td>`,
      `<td>${esc(r.emergName)}</td>`,`<td>${esc(r.emergNo)}</td>`,`<td>${esc(r.emergRel)}</td>`,
      // Gov IDs
      `<td style="font-family:var(--mono);font-size:10px">${esc(r.sss)}</td>`,
      `<td style="font-family:var(--mono);font-size:10px">${esc(r.philhealth)}</td>`,
      `<td style="font-family:var(--mono);font-size:10px">${esc(r.pagibig)}</td>`,
      `<td style="font-family:var(--mono);font-size:10px">${esc(r.tin)}</td>`,
      // Employment
      `<td>${esc(r.position)}</td>`,`<td>${esc(r.dept)}</td>`,`<td>${esc(r.empType)}</td>`,
      `<td>${esc(r.dateHired)}</td>`,
      `<td style="font-family:var(--mono);color:var(--accent)">${esc(r.shift)}</td>`,
      `<td>${r.restDays.join(',')}</td>`,
      // Benefits
      `<td style="font-family:var(--mono);text-align:center">${r.vl}</td>`,
      `<td style="font-family:var(--mono);text-align:center">${r.ml}</td>`,
      `<td style="font-family:var(--mono);text-align:center">${r.sl}</td>`,
      `<td style="font-family:var(--mono);text-align:center">${r.el}</td>`,
      `<td style="font-family:var(--mono)">${r.salary?r.salary.toLocaleString():''}</td>`,
      `<td>${esc(r.payFreq)}</td>`,
      // Permissions
      ...r._perms.map(v=>`<td style="text-align:center">${yn(v)}</td>`),
      // Issue
      `<td style="color:var(--red);font-size:10px;min-width:120px">${r.errors.join('<br>')}</td>`,
    ];
    return `<tr style="${rowBg}">${cells.join('')}</tr>`;
  }).join('');

  document.getElementById('import-step-upload').classList.add('hidden');
  document.getElementById('import-step-preview').classList.remove('hidden');
  if (valid > 0) document.getElementById('import-start-btn').classList.remove('hidden');
  document.getElementById('import-start-btn').textContent = `✓ Import ${valid} Valid Row${valid===1?'':'s'}`;
}

async function startImport() {
  const validRows = importRows.filter(r => !r.errors.length);
  if (!validRows.length) return;

  const btn  = document.getElementById('import-start-btn');
  const prog = document.getElementById('import-progress');
  btn.disabled = true;
  prog.classList.remove('hidden');

  let done = 0, failed = 0;
  const failedNames = [];

  for (const r of validRows) {
    prog.textContent = `Importing ${done + failed + 1} of ${validRows.length}: ${r.name}…`;
    try {
      let secondApp;
      try { secondApp = firebase.app('secondary'); }
      catch(e) { secondApp = firebase.initializeApp(firebaseConfig, 'secondary'); }

      const secondAuth = secondApp.auth();
      const cred = await secondAuth.createUserWithEmailAndPassword(r.email, r.password);
      const uid  = cred.user.uid;

      const payload = {
        // Core identity
        name: r.name, firstName: r.firstName, middleName: r.middleName,
        lastName: r.lastName, suffix: r.suffix,
        employeeId: r.empId, email: r.email, role: r.role, active: true,
        // Personal
        dateOfBirth: r.dateOfBirth, sex: r.sex, civilStatus: r.civilStatus,
        nationality: r.nationality, religion: r.religion, bloodType: r.bloodType,
        spouseFname: r.spouseFname, spouseLname: r.spouseLname, children: r.children,
        // Contact
        address: { street: r.street, city: r.city, province: r.province, zip: r.zip },
        phone: r.phone,
        emergencyContact: { name: r.emergName, no: r.emergNo, rel: r.emergRel },
        // Government IDs
        govIds: { sss: r.sss, philhealth: r.philhealth, pagibig: r.pagibig, tin: r.tin },
        // Employment
        position: r.position, department: r.dept, employmentType: r.empType,
        dateHired: r.dateHired, shiftCode: r.shift, restDays: r.restDays,
        // Benefits
        leaveBalances: { VL: r.vl, ML: r.ml, SL: r.sl, EL: r.el },
        salary: r.salary, payFrequency: r.payFreq,
        // Permissions
        permissions: r.permissions,
        // Meta
        createdAt: Date.now(), createdBy: currentUserData?.uid || '',
      };

      // Remove empty strings to keep DB clean
      Object.keys(payload).forEach(k => { if (payload[k] === '') delete payload[k]; });

      try { await db.ref(`users/${uid}`).set(payload); }
      catch(e) { await secondApp.database().ref(`users/${uid}`).set(payload); }
      await secondAuth.signOut();
      done++;
    } catch(e) {
      failed++;
      failedNames.push(`${r.name} (${e.message})`);
      console.warn('Import row failed:', r.name, e);
    }
  }

  prog.innerHTML =
    `<span style="color:var(--green);font-weight:700">✓ ${done} imported</span>` +
    (failed ? ` &nbsp;·&nbsp; <span style="color:var(--red)">✗ ${failed} failed</span>` : '');
  btn.textContent = 'Done';
  btn.onclick = () => { closeModal('import-emp-modal'); loadEmployees(); };
  btn.disabled = false;

  if (failed) {
    toast(`${done} imported, ${failed} failed. Check console.`, 'amber');
    console.warn('Failed rows:', failedNames);
  } else {
    toast(`${done} employee${done===1?'':'s'} imported successfully!`);
  }
  loadEmployees();
}

window.showImportEmpModal = showImportEmpModal;
window.downloadEmpTemplate = downloadEmpTemplate;
window.handleImportFile = handleImportFile;
window.startImport = startImport;
window.resetImport = resetImport;


/* =========================================================
   SIMPLIFIED APPROVAL FLOW ENGINE PATCH
   Final model: pending, approved, rejected, recalled, cancelled
   Rules:
   - Only pending can be approved/rejected
   - Only approved can be recalled
   - Rejected/recalled/cancelled are locked
   - Employees should create a new request after rejected/recalled
   ========================================================= */
function normalizeApprovalStatus(status){
  const s = String(status || 'pending').toLowerCase().trim();
  if(['pending','pend1','pendf','pending_1','pending_first','pending_final','for_final_approval'].includes(s)) return 'pending';
  if(['approved','approved_1','appr1','apprf','final_approved'].includes(s)) return 'approved';
  if(['rejected','disapproved','disap1','disapf','rejected_1'].includes(s)) return 'rejected';
  if(['recalled','recall'].includes(s)) return 'recalled';
  if(['cancelled','canceled'].includes(s)) return 'cancelled';
  if(s==='cancel') return 'cancelled';
  return s;
}
function approvalStatusLabel(status){
  return ({pending:'Pending',approved:'Approved',rejected:'Rejected',recalled:'Recalled',cancelled:'Cancelled'}[normalizeApprovalStatus(status)] || status || '—');
}
function approvalBadgeClass(status){
  return 'badge-' + normalizeApprovalStatus(status);
}
function isApprovalPending(status){ return normalizeApprovalStatus(status)==='pending'; }
function isApprovalApproved(status){ return normalizeApprovalStatus(status)==='approved'; }
function isApprovalRejected(status){ return normalizeApprovalStatus(status)==='rejected'; }
function isApprovalRecalled(status){ return normalizeApprovalStatus(status)==='recalled'; }
function isApprovalCancelled(status){ return normalizeApprovalStatus(status)==='cancelled'; }

// Backward-compatible overrides used by existing pages.
window.isPending = isApprovalPending;
window.isApproved = isApprovalApproved;
window.isRecalled = isApprovalRecalled;
window.canRecallStatus = function(status){ return normalizeApprovalStatus(status)==='approved'; };
window.getReqStatusClass = function(req){ return normalizeApprovalStatus(req?.status); };
window.getDominantRowClass = function(reqs){
  if(!reqs || !reqs.length) return '';
  const priority = ['recalled','rejected','approved','pending','cancelled'];
  const classes = reqs.map(r => normalizeApprovalStatus(r?.status));
  for(const p of priority){ if(classes.includes(p)) return 'ts-row-' + p; }
  return '';
};
window.buildReqTags = function(reqs){
  if(!reqs || !reqs.length) return '';
  const shortMap = {time_correction:'TC',shift_change:'SC',leave:'LV',overtime:'OT',undertime:'UT'};
  return reqs.map(req=>{
    const cls = normalizeApprovalStatus(req?.status);
    const short = shortMap[req.type] || 'RQ';
    const title = (req.type || '').replace(/_/g,' ') + ' — ' + approvalStatusLabel(req.status);
    return `<span class="req-tag req-tag-${cls}" title="${escapeApprovalHtml(title)}">${short}</span>`;
  }).join('');
};

function escapeApprovalHtml(v){
  return String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

async function applySimplifiedRequestToTimelog(r){
  if(!r || !r.uid) return;
  const approverName = currentUserData?.name || auth?.currentUser?.email || 'Approver';

  if(r.type === 'time_correction') {
    const today = r.date;
    const snap = await db.ref(`timelogs/${r.uid}/${today}`).once('value');
    const existing = snap.val() || {};
    const inTs = r.manualTimeIn ? new Date(`${today}T${r.manualTimeIn}`).getTime() : existing.timeIn;
    const outTs = r.manualTimeOut ? new Date(`${today}T${r.manualTimeOut}`).getTime() : existing.timeOut;
    const hrs = (inTs && outTs) ? computeHours(inTs, outTs, existing.shiftCode || DEFAULT_WORK_SHIFT_CODE) : {};
    await db.ref(`timelogs/${r.uid}/${today}`).update({
      origTimeIn: existing.origTimeIn ?? (existing.timeIn || null),
      origTimeOut: existing.origTimeOut ?? (existing.timeOut || null),
      timeIn: inTs || null,
      timeOut: outTs || null,
      tcRequestId: r.reqId || r.id || '',
      regularWorkHrs: hrs.reg ?? existing.regularWorkHrs ?? 0,
      totalWorkHrs: hrs.total ?? existing.totalWorkHrs ?? 0,
      lateMinutes: hrs.late ?? existing.lateMinutes ?? 0,
      OTHours: hrs.excess ?? existing.OTHours ?? 0,
      corrected: true
    });
  }

  if(r.type === 'shift_change') {
    const shiftDate = r.date;
    const newShift = normalizeShiftCode(r.requestedShift);
    const logRef = db.ref(`timelogs/${r.uid}/${shiftDate}`);
    const logSnap = await logRef.once('value');
    const existing = logSnap.val() || {};
    const logUpdate = {
      date: shiftDate,
      employeeName: r.employeeName || existing.employeeName || '',
      employeeId: r.employeeId || existing.employeeId || '',
      origShiftCode: existing.origShiftCode ?? (existing.shiftCode || null),
      shiftCode: newShift,
      status: existing.status || 'scheduled',
      shiftChangeApproved: true,
      shiftChangeRequestId: r.reqId || r.id || '',
      shiftChangeApprovedAt: Date.now(),
      shiftChangeApprovedBy: approverName
    };
    if(existing.timeIn && existing.timeOut) {
      const hrs = computeHours(existing.timeIn, existing.timeOut, newShift);
      logUpdate.regularWorkHrs = hrs.reg;
      logUpdate.totalWorkHrs = hrs.total;
      logUpdate.excessWorkHrs = hrs.excess;
      logUpdate.OTHours = hrs.excess;
      logUpdate.lateMinutes = hrs.late;
    }
    await logRef.update(logUpdate);
    await db.ref(`users/${r.uid}/shiftSchedule/${shiftDate}`).set(newShift);
  }

  if(r.type === 'overtime') {
    await db.ref(`timelogs/${r.uid}/${r.date}`).update({
      OTHours: parseFloat(r.hours) || 0,
      overtimeApproved: true,
      overtimeRequestId: r.reqId || r.id || '',
      overtimeApprovedAt: Date.now(),
      overtimeApprovedBy: approverName
    });
  }

  if(r.type === 'leave') {
    const from = new Date(r.dateFrom), to = new Date(r.dateTo);
    for(let d = new Date(from); d <= to; d.setDate(d.getDate()+1)) {
      const ds = d.toISOString().split('T')[0];
      await db.ref(`timelogs/${r.uid}/${ds}`).update({
        status: 'leave',
        leaveType: r.leaveType,
        leaveDays: 1,
        date: ds,
        employeeName: r.employeeName || '',
        employeeId: r.employeeId || '',
        shiftCode: (typeof globalHolidayShifts !== 'undefined' && globalHolidayShifts?.[ds]?.code) || currentUserData?.shiftCode || DEFAULT_WORK_SHIFT_CODE,
        regularWorkHrs: 8,
        leaveRequestId: r.reqId || r.id || ''
      });
    }

    // ── Auto-deduct leave balance ─────────────────────────────────────────
    // Map the leave type code to the leaveBalances key stored on the user node.
    // EL has no dedicated balance key so we skip deduction for it.
    const LEAVE_BALANCE_KEY = { VL:'VL', SL:'SL', ML:'ML' };
    const balKey = LEAVE_BALANCE_KEY[r.leaveType];
    const daysUsed = Number(r.days || r.leaveDays || 0);

    if(balKey && daysUsed > 0) {
      const userRef = db.ref(`users/${r.uid}/leaveBalances/${balKey}`);
      // Use a Firebase transaction so concurrent approvals cannot double-deduct.
      await userRef.transaction(currentBalance => {
        const bal = Number(currentBalance ?? 0);
        // Clamp at 0 — never go negative (admin can correct manually if needed).
        return Math.max(0, bal - daysUsed);
      });
      // Stamp an audit trail on the request itself so the admin can see the deduction.
      await db.ref(`requests/${r.uid}/${r.reqId || r.id}`).update({
        balanceDeducted: daysUsed,
        balanceKey: balKey,
        balanceDeductedAt: Date.now(),
        balanceDeductedBy: approverName
      });
    }
    // ─────────────────────────────────────────────────────────────────────
  }

  if(r.type === 'undertime') {
    const snap = await db.ref(`timelogs/${r.uid}/${r.date}`).once('value');
    const existing = snap.val() || {};
    const earlyOutTs = r.timeLeftEarly ? new Date(`${r.date}T${r.timeLeftEarly}`).getTime() : null;
    const logUpdate = {
      undertimeApproved: true,
      undertimeRequestId: r.reqId || r.id || '',
      undertimeApprovedAt: Date.now(),
      undertimeApprovedBy: approverName,
      origTimeOut: existing.origTimeOut ?? (existing.timeOut || null)
    };
    if(earlyOutTs) {
      logUpdate.timeOut = earlyOutTs;
      if(existing.timeIn) {
        const hrs = computeHours(existing.timeIn, earlyOutTs, existing.shiftCode || DEFAULT_WORK_SHIFT_CODE);
        logUpdate.regularWorkHrs = hrs.reg;
        logUpdate.totalWorkHrs = hrs.total;
        logUpdate.lateMinutes = hrs.late;
        logUpdate.OTHours = hrs.excess;
      }
    }
    await db.ref(`timelogs/${r.uid}/${r.date}`).update(logUpdate);
  }
}

async function pushApprovalNotification(r, status, remarks=''){
  try{
    const typeLabels = {time_correction:'Time Correction',shift_change:'Change of Shift',leave:'Leave',overtime:'Overtime',undertime:'Undertime'};
    const approverName = currentUserData?.name || auth?.currentUser?.email || 'Approver';
    const msg = status === 'approved'
      ? `Your ${typeLabels[r.type] || r.type} request has been approved by ${approverName}.`
      : status === 'recalled'
      ? `Your ${typeLabels[r.type] || r.type} request has been recalled.${remarks ? ' Remarks: '+remarks : ''}`
      : `Your ${typeLabels[r.type] || r.type} request has been rejected by ${approverName}.${remarks ? ' Remarks: '+remarks : ''}`;
    await db.ref(`notifications/${r.uid}`).push({message:msg,type:status==='approved'?'success':status==='recalled'?'warning':'error',requestType:r.type,requestId:r.reqId,status,createdAt:Date.now(),read:false});
    try{ updateApprovalBadge?.(); }catch(e){}
  }catch(e){ console.warn('Notification write failed:', e); }
}

// Single-stage recall: only approved requests can be recalled.
window.recallRequest = async function(requestUid, reqId, mode='employee', rowObj=null){
  try{
    const row = rowObj || {uid:requestUid, reqId:reqId};
    let found = null;
    if(typeof acFindRequestRef === 'function') found = await acFindRequestRef(row);
    if(!found){
      const ref = db.ref(`requests/${requestUid}/${reqId}`);
      const snap = await ref.once('value');
      if(snap.exists()) found = {ref, snap, uid:requestUid, reqId};
    }
    if(!found){ say('Request not found. Please reload and try again.','red'); return; }

    const r = {uid:found.uid || requestUid, reqId:found.reqId || reqId, ...found.snap.val()};
    if(normalizeApprovalStatus(r.status) !== 'approved'){
      say('Only approved requests can be recalled.','amber');
      return;
    }

    const userRole = String(currentUserData?.role || '').toLowerCase();
    const isManagerAdmin = ['admin','manager'].includes(userRole);
    const isOwn = String(r.uid) === String(uid());
    if(!(isManagerAdmin || isOwn)){
      say('You can recall only your own approved request. Managers/Admin can recall team approved requests.','red');
      return;
    }

    const reason = prompt('Reason for recall?') || '';
    const now = Date.now();
    await found.ref.update({
      status:'recalled',
      workflowStage:null,
      approvalFlow:'single',
      recallReason:reason,
      recalledBy:currentUserData?.name || auth?.currentUser?.email || '',
      recalledByRole:userRole || mode,
      recalledAt:now,
      lastAction:'recalled',
      lastActionAt:now
    });

    if(typeof _revertTimelogForRequest === 'function') await _revertTimelogForRequest(r.uid, r.reqId, r);
    await pushApprovalNotification({...r,status:'recalled'}, 'recalled', reason);

    say('Approved request recalled successfully. Employee may submit a new request.','green');
    try{ loadAllRequests?.(); }catch(e){}
    try{ loadMyTimesheet?.(); }catch(e){}
    try{ refreshType?.(r.type); }catch(e){}
  }catch(e){ say('Recall failed: '+e.message,'red'); }
};

// Optional helper for future UI buttons: create a new request version from rejected/recalled record.
window.createReplacementRequestFromOld = async function(oldReq, changes={}){
  const base = {...oldReq, ...changes};
  delete base.id; delete base.reqId;
  const ownerUid = base.uid || uid();
  const ref = db.ref(`requests/${ownerUid}`).push();
  const newReq = {
    ...base,
    uid: ownerUid,
    reqId: ref.key,
    status: 'pending',
    workflowStage: null,
    approvalFlow: 'single',
    referenceId: oldReq.reqId || oldReq.id || '',
    version: (parseInt(oldReq.version || 1, 10) || 1) + 1,
    submittedAt: Date.now(),
    approvedBy: null, approvedAt: null, rejectedBy: null, rejectedAt: null,
    recalledBy: null, recalledAt: null, recallReason: null
  };
  await ref.set(newReq);
  return newReq;
};

// Approval Center override: normalize old statuses and use simple actions.
(function(){
  const oldRenderApprovalsSimple = window.renderApprovals;
  window.renderApprovals = function(list, c){
    if(!c) return;
    const countEl = document.getElementById('approval-record-count');
    if(!list || !list.length){
      c.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">No requests found</td></tr>';
      if(countEl) countEl.textContent='0 items';
      return;
    }
    const typeLabels = {time_correction:'Time Correction',shift_change:'COS',leave:'Leave',overtime:'OT',undertime:'Undertime'};
    const typeBadge = {time_correction:'badge-blue',shift_change:'badge-purple',leave:'badge-green',overtime:'badge-amber',undertime:'badge-red'};
    const rows = list.map(r=>{
      const s = normalizeApprovalStatus(r.status);
      let detail = '';
      if(r.type==='time_correction') detail = `${r.date||''} · ${r.manualTimeIn||''}–${r.manualTimeOut||''}`;
      else if(r.type==='shift_change') detail = `${r.date||''} · ${r.requestedShift||''}`;
      else if(r.type==='leave') detail = `${r.leaveType||''} · ${r.dateFrom||''} – ${r.dateTo||''} (${r.days||r.countedDays||0} days)`;
      else if(r.type==='overtime') detail = `${r.date||''} · ${r.startTime||''}–${r.endTime||''} (${r.hours||0} hrs)`;
      else if(r.type==='undertime') detail = `${r.date||''} · Left at: ${r.timeLeftEarly||''}`;

      let actions = '';
      const payload = JSON.stringify(r).replace(/</g,'\\u003c').replace(/'/g,'&#39;');
      if(s === 'pending'){
        actions = `<div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-success btn-xs" onclick='openApproveModal(${payload})'>✓ Approve</button>
          <button class="btn btn-danger btn-xs" onclick='openRejectModal(${payload})'>✕ Reject</button>
        </div>`;
      }else if(s === 'approved'){
        actions = `<button class="btn btn-amber btn-xs" onclick="recallRequest('${escapeApprovalHtml(r.uid)}','${escapeApprovalHtml(r.reqId||r.id)}','manager')">↩ Recall</button>`;
      }else{
        actions = `<span style="font-size:10px;color:var(--text3)">Locked</span>`;
      }
      return `<tr class="req-item-${s}">
        <td><span class="badge ${typeBadge[r.type]||'badge-gray'}" style="font-size:10px">${typeLabels[r.type]||escapeApprovalHtml(r.type||'Request')}</span></td>
        <td><div style="font-weight:600;font-size:12px">${escapeApprovalHtml(r.employeeName||'Unknown')}</div><div style="font-size:10px;color:var(--text3);font-family:var(--mono)">${escapeApprovalHtml(r.employeeId||'')}</div></td>
        <td style="color:var(--text2);font-size:11px;white-space:nowrap">${escapeApprovalHtml(detail)}</td>
        <td style="color:var(--text2);max-width:160px;overflow:hidden;text-overflow:ellipsis">${escapeApprovalHtml(r.reason||'—')}</td>
        <td style="color:var(--text3);font-size:10px;white-space:nowrap">${r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-PH') : '—'}</td>
        <td style="text-align:center"><span class="badge ${approvalBadgeClass(s)}" style="font-size:10px">${approvalStatusLabel(s)}</span></td>
        <td style="text-align:center">${actions}</td>
      </tr>`;
    }).join('');
    c.innerHTML = rows;
    if(countEl) countEl.textContent = `${list.length} item${list.length===1?'':'s'}`;
  };
})();


/* =========================================================
   MODULE PAGE RESTORE VERIFIED v45
   Ensures actual modules render enhanced update tables.
   ========================================================= */
(function(){
  if(window.__moduleRestoreV45) return; window.__moduleRestoreV45=true;
  function esc(v){return String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
  function who(){return currentUserData?.name || auth?.currentUser?.email || 'User';}
  function at(v){return v?new Date(v).toLocaleString('en-PH'):'—';}
  function dl(filename,rows){const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href);try{toast('CSV exported','green')}catch(e){}}
  function setT(id,v){const el=document.getElementById(id);if(el)el.textContent=v;}
  function hc(v){return (typeof normalizeShiftCode==='function'?normalizeShiftCode(v):String(v||'').trim().toUpperCase());}function ht(c){return hc(c)==='LH'?'Legal Holiday':'Special Holiday';}function hd(d){try{return d?new Date(d+'T12:00:00').toLocaleDateString('en-PH',{weekday:'short'}):'—'}catch(e){return'—'}}function hf(d){try{return d?new Date(d+'T12:00:00').toLocaleDateString('en-PH',{month:'short',day:'2-digit',year:'numeric'}):'—'}catch(e){return d||'—'}}function hb(c){c=hc(c);return `<span class="badge ${c==='LH'?'badge-red':'badge-amber'}" style="font-size:10px">${esc(c||'—')}</span>`}
  window.holidayPreviewV45=function(){const box=document.getElementById('holiday-preview-v45');if(!box)return;const d=document.getElementById('holiday-date')?.value||'',c=hc(document.getElementById('holiday-code')?.value||'SH'),n=(document.getElementById('holiday-name')?.value||'').trim()||ht(c);box.innerHTML=d?`${hf(d)} · ${hd(d)} · ${hb(c)} · ${esc(n)}`:'Select a date…'};
  window.clearHolidayFormV45=function(){['holiday-date','holiday-name'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});const c=document.getElementById('holiday-code');if(c)c.value='SH';holidayPreviewV45()};
  function hrows(){const data=window.globalHolidayShifts||{};return Object.keys(data).sort().map(date=>({date,...(data[date]||{})}))}
  window.renderHolidayTableV45=function(){const tbody=document.getElementById('holiday-body');if(!tbody)return;let rows=hrows();const q=(document.getElementById('holiday-search')?.value||'').toLowerCase().trim(),cf=hc(document.getElementById('holiday-filter-code')?.value||''),yf=document.getElementById('holiday-filter-year')?.value||'';if(cf)rows=rows.filter(r=>hc(r.code)===cf);if(yf)rows=rows.filter(r=>String(r.date).startsWith(yf+'-'));if(q)rows=rows.filter(r=>[r.date,hd(r.date),r.code,ht(r.code),r.name,r.updatedBy,at(r.updatedAt)].join(' ').toLowerCase().includes(q));setT('holiday-record-count',`${rows.length} items`);setT('hol45-total-chip','TOTAL  '+hrows().length);setT('hol45-sh-chip','SH  '+hrows().filter(r=>hc(r.code)==='SH').length);setT('hol45-lh-chip','LH  '+hrows().filter(r=>hc(r.code)==='LH').length);const ys=[...new Set(hrows().map(r=>String(r.date).slice(0,4)).filter(Boolean))],sel=document.getElementById('holiday-filter-year');if(sel&&sel.options.length<=1)sel.innerHTML='<option value="">All Years</option>'+ys.map(y=>`<option value="${esc(y)}">${esc(y)}</option>`).join('');if(!rows.length){tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:38px;color:var(--text3)">No records found</td></tr>';return}tbody.innerHTML=rows.map(r=>`<tr><td class="mono">${hf(r.date)}</td><td>${hd(r.date)}</td><td>${hb(r.code)}</td><td>${ht(r.code)}</td><td>${esc(r.name||'—')}</td><td>${esc(r.updatedBy||'—')}</td><td class="mono" style="font-size:10px;color:var(--text2)">${esc(at(r.updatedAt))}</td><td style="text-align:center"><button class="btn btn-ghost btn-xs" onclick="editHolidayShift('${esc(r.date)}')">Edit</button> <button class="btn btn-danger btn-xs" onclick="deleteHolidayShift('${esc(r.date)}')">Delete</button></td></tr>`).join('')};
  window.loadHolidaySetup=async function(){const tbody=document.getElementById('holiday-body');if(tbody)tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:38px;color:var(--text3)">Loading holidays…</td></tr>';const snap=await db.ref('holidayShifts').once('value');window.globalHolidayShifts=snap.val()||{};renderHolidayTableV45();holidayPreviewV45()};
  window.saveHolidayShift=async function(){const d=document.getElementById('holiday-date')?.value,c=hc(document.getElementById('holiday-code')?.value),n=(document.getElementById('holiday-name')?.value||'').trim()||ht(c);if(!d||!['SH','LH'].includes(c)){try{toast('Select holiday date and valid code','amber')}catch(e){}return}await db.ref(`holidayShifts/${d}`).set({code:c,name:n,updatedAt:Date.now(),updatedBy:who()});try{toast('Holiday saved with update audit','green')}catch(e){}clearHolidayFormV45();await loadHolidaySetup()};
  window.editHolidayShift=function(date){const h=(window.globalHolidayShifts||{})[date]||{};if(document.getElementById('holiday-date'))document.getElementById('holiday-date').value=date;if(document.getElementById('holiday-code'))document.getElementById('holiday-code').value=hc(h.code||'SH');if(document.getElementById('holiday-name'))document.getElementById('holiday-name').value=h.name||'';holidayPreviewV45()};
  window.deleteHolidayShift=async function(date){if(!date||!confirm(`Delete holiday for ${date}?`))return;await db.ref(`holidayShifts/${date}`).remove();await loadHolidaySetup()};
  window.exportHolidayCSVV45=function(){const rows=hrows();if(!rows.length)return;const csv=[['Date','Day','Code','Type','Name / Remarks','Updated By','Updated At']];rows.forEach(r=>csv.push([r.date,hd(r.date),hc(r.code),ht(r.code),r.name||'',r.updatedBy||'',at(r.updatedAt)]));dl('holiday_setup_records_with_updates.csv',csv)};
  const defaults={'0800A':{code:'0800A',name:'8:00 AM to 5:00 PM',start:'08:00',end:'17:00',breakMin:60,type:'regular',remarks:'Default regular shift'},'0830A':{code:'0830A',name:'8:30 AM to 5:30 PM',start:'08:30',end:'17:30',breakMin:60,type:'regular',remarks:'Default regular shift'},'0900A':{code:'0900A',name:'9:00 AM to 6:00 PM',start:'09:00',end:'18:00',breakMin:60,type:'regular',remarks:'Default regular shift'},'1000A':{code:'1000A',name:'10:00 AM to 7:00 PM',start:'10:00',end:'19:00',breakMin:60,type:'regular',remarks:'Default regular shift'},'2200N':{code:'2200N',name:'10:00 PM to 6:00 AM',start:'22:00',end:'06:00',breakMin:60,type:'night',remarks:'Default night differential shift'},'RD':{code:'RD',name:'Rest Day',start:'00:00',end:'00:00',breakMin:0,type:'non-working',remarks:'Default rest day'},'HOL':{code:'HOL',name:'Holiday / Non-working',start:'00:00',end:'00:00',breakMin:0,type:'non-working',remarks:'Default holiday non-working code'}};
  function mn(t){if(!t)return null;const [h,m]=String(t).split(':').map(Number);return isNaN(h)||isNaN(m)?null:h*60+m}function wh(r){let s=mn(r.start),e=mn(r.end);if(s==null||e==null)return 0;if(e<=s)e+=1440;return Math.max(0,(e-s)-(Number(r.breakMin)||0))/60}function tl(t){return ({regular:'Regular',night:'Night Diff',extended:'Extended / Split','non-working':'Non-Working'}[String(t||'regular')])||String(t||'regular')}function srows(){const data=window.cachedShiftCodes||{};return Object.keys(data).sort().map(code=>({code,...(data[code]||{})}))}
  window.renderShiftCodesTableV45=function(){const tbody=document.getElementById('shift-codes-body');if(!tbody)return;let rows=srows();const q=(document.getElementById('sc45-search')?.value||'').toLowerCase().trim(),tf=document.getElementById('sc45-type-filter')?.value||'',sort=document.getElementById('sc45-sort')?.value||'code';if(tf)rows=rows.filter(r=>String(r.type||'regular')===tf);if(q)rows=rows.filter(r=>[r.code,r.name,r.start,r.end,r.breakMin,r.type,r.remarks,r.updatedBy,at(r.updatedAt)].join(' ').toLowerCase().includes(q));rows.sort((a,b)=>sort==='updated'?Number(b.updatedAt||0)-Number(a.updatedAt||0):sort==='hours'?wh(b)-wh(a):sort==='start'?String(a.start||'').localeCompare(String(b.start||'')):String(a.code).localeCompare(String(b.code)));setT('shift-code-record-count',`${rows.length} items`);setT('sc45-total-chip','TOTAL  '+srows().length);setT('sc45-regular-chip','REG  '+srows().filter(r=>(r.type||'regular')==='regular').length);setT('sc45-night-chip','NIGHT  '+srows().filter(r=>r.type==='night').length);if(!rows.length){tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:38px;color:var(--text3)">No shift codes found</td></tr>';return}tbody.innerHTML=rows.map(r=>`<tr><td class="mono"><b>${esc(r.code)}</b></td><td>${esc(r.name||'—')}</td><td class="mono">${esc(r.start||'--:--')} – ${esc(r.end||'--:--')}</td><td>${Number(r.breakMin||0)} min</td><td><b>${wh(r).toFixed(2)}</b></td><td>${esc(tl(r.type))}</td><td>${esc(r.remarks||'—')}</td><td>${esc(r.updatedBy||'—')}</td><td class="mono" style="font-size:10px;color:var(--text2)">${esc(at(r.updatedAt))}</td><td style="text-align:center"><button class="btn btn-ghost btn-xs" onclick="openShiftCodeModal('${esc(r.code)}')">Edit</button> <button class="btn btn-danger btn-xs" onclick="deleteShiftCode('${esc(r.code)}')">Delete</button></td></tr>`).join('')};
  window.loadShiftCodes=async function(){const tbody=document.getElementById('shift-codes-body');if(tbody)tbody.innerHTML='<tr><td colspan="10" style="text-align:center;padding:38px;color:var(--text3)">Loading shift codes…</td></tr>';const snap=await db.ref('shiftCodes').once('value');window.cachedShiftCodes=snap.val()||{};renderShiftCodesTableV45()};
  window.seedDefaultShiftCodesV45=async function(){const snap=await db.ref('shiftCodes').once('value'),ex=snap.val()||{},updates={};Object.keys(defaults).forEach(k=>{if(!ex[k])updates[`shiftCodes/${k}`]={...defaults[k],updatedAt:Date.now(),updatedBy:who()}});if(!Object.keys(updates).length){try{toast('Default shift codes already exist','amber')}catch(e){}return}await db.ref().update(updates);await loadShiftCodes()};
  window.saveShiftCode=async function(){const edit=document.getElementById('sc-edit-key')?.value||'',raw=String(document.getElementById('sc-code')?.value||'').trim().toUpperCase().replace(/\s+/g,''),code=edit||raw,name=document.getElementById('sc-name')?.value.trim()||'',start=document.getElementById('sc-start')?.value||'',end=document.getElementById('sc-end')?.value||'',breakMin=parseInt(document.getElementById('sc-break')?.value)||0,type=document.getElementById('sc-type')?.value||'regular',remarks=document.getElementById('sc-remarks')?.value.trim()||'';if(!code||!name||!start||!end){try{toast('Complete shift code required fields','amber')}catch(e){}return}await db.ref(`shiftCodes/${code}`).set({code,name,start,end,breakMin,type,remarks,workHours:Number(wh({start,end,breakMin}).toFixed(2)),updatedAt:Date.now(),updatedBy:who()});try{toast('Shift code saved with update audit','green');closeModal('shift-code-modal')}catch(e){}await loadShiftCodes()};
  window.exportShiftCodesCSVV45=function(){const rows=srows();if(!rows.length)return;const csv=[['Code','Name / Description','Start','End','Break Min','Work Hours','Type','Remarks','Updated By','Updated At']];rows.forEach(r=>csv.push([r.code||'',r.name||'',r.start||'',r.end||'',r.breakMin||0,wh(r).toFixed(2),tl(r.type),r.remarks||'',r.updatedBy||'',at(r.updatedAt)]));dl('shift_codes_with_updates.csv',csv)};
})();



/* =========================================================
   PAYROLL PAGE RESTORE VERIFIED v46
   ========================================================= */
(function(){
 if(window.__payrollRestoreV46)return;window.__payrollRestoreV46=true;window.payrollRowsV46=[];
 function esc(v){return String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}function money(v){const n=Number(v||0);return n>0?'₱ '+n.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2}):'—'}function si(u){return u.salaryInfo||u.salary||{}}function allow(s){return Number(s.allowanceTotal??(Number(s.transAllowance||0)+Number(s.mealAllowance||0)+Number(s.otherAllowance||0)))}function ded(s){return Number(s.deductionTotal??(Number(s.sssContrib||0)+Number(s.philhealthContrib||0)+Number(s.pagibigContrib||0)+Number(s.withholdingTax||0)+Number(s.otherDeduction||0)))}function at(v){return v?new Date(v).toLocaleString('en-PH'):'—'}function init(n){return String(n||'U').trim().split(/\s+/).map(x=>x[0]).join('').substring(0,2).toUpperCase()||'U'}function setT(id,v){const el=document.getElementById(id);if(el)el.textContent=v}
 function flow(u){const s=si(u),has=Number(s.basicMonthly||0)>0,st=String(u.salaryAgreementStatus||u.offerStatus||u.salaryOfferStatus||'').toLowerCase();if(!has)return{key:'missing_salary',label:'Missing Salary',cls:'pay46-missing'};if(['acknowledged','accepted','signed'].includes(st))return{key:'acknowledged',label:'Acknowledged',cls:'pay46-ack'};if(['pending','sent','for_acknowledgement'].includes(st))return{key:'offer_pending',label:'Offer Pending',cls:'pay46-pending'};return{key:'ready',label:'Ready',cls:'pay46-ready'}}
 function stats(rows){setT('pay46-total-chip','TOTAL  '+rows.length);setT('pay46-ready-chip','READY  '+rows.filter(u=>['ready','acknowledged'].includes(flow(u).key)).length);setT('pay46-missing-chip','MISSING  '+rows.filter(u=>flow(u).key==='missing_salary').length)}
 window.renderPayrollGrid=function(employees){const body=document.getElementById('payroll-table-body');window.payrollRowsV46=Array.isArray(employees)?employees:[];stats(window.payrollRowsV46);if(!body)return;let rows=[...window.payrollRowsV46];const q=(document.getElementById('payroll-search')?.value||'').toLowerCase().trim(),sf=document.getElementById('pay46-status-filter')?.value||'';if(q)rows=rows.filter(u=>{const s=si(u);return[u.name,u.employeeId,u.department,u.position,u.shiftCode,s.payFrequency,flow(u).label,s.updatedBy,at(s.updatedAt)].join(' ').toLowerCase().includes(q)});if(sf)rows=rows.filter(u=>flow(u).key===sf);rows.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));setT('payroll-record-count',`${rows.length} items`);if(!rows.length){body.innerHTML='<tr><td colspan="12" style="text-align:center;padding:38px;color:var(--text3)">No payroll records found</td></tr>';return}body.innerHTML=rows.map(u=>{const s=si(u),f=flow(u),uid=esc(u.uid||u.key||''),disabled=f.key==='missing_salary'?'disabled title="Setup salary first"':'';return`<tr><td><div class="pay46-emp"><div class="pay46-avatar">${esc(init(u.name))}</div><div style="min-width:0"><div class="pay46-name" title="${esc(u.name||'—')}">${esc(u.name||'—')}</div><div class="pay46-sub" title="${esc(u.position||'')}">${esc(u.position||'')}</div></div></div></td><td class="mono">${esc(u.employeeId||'—')}</td><td>${esc(u.department||'—')}</td><td class="mono">${esc(u.shiftCode||'—')}</td><td><span class="pay46-money">${money(s.basicMonthly)}</span></td><td>${esc(s.payFrequency||'—')}</td><td>${allow(s)>0?'<span class="pay46-money">'+money(allow(s))+'</span>':'<span class="pay46-muted">—</span>'}</td><td>${ded(s)>0?'<span class="pay46-money">'+money(ded(s))+'</span>':'<span class="pay46-muted">—</span>'}</td><td><span class="pay46-pill ${f.cls}">${esc(f.label)}</span></td><td>${esc(s.updatedBy||'—')}</td><td class="mono" style="font-size:10px;color:var(--text2)">${esc(at(s.updatedAt))}</td><td style="text-align:center"><button class="btn btn-ghost btn-xs" onclick="openSalaryModal('${uid}')">Salary Setup</button> <button class="btn btn-primary btn-xs" ${disabled} onclick="openGenPayslipModal('${uid}')">Payslip</button> <button class="btn btn-ghost btn-xs" onclick="openSalOfferModal('${uid}')">Send Offer</button> <button class="btn btn-ghost btn-xs" onclick="openAdminPayslipHistory('${uid}', '${esc(u.name||'')}')">📋 History</button></td></tr>`}).join('')};
 window.filterPayrollList=function(){renderPayrollGrid(window.payrollRowsV46||[])};
 window.loadPayrollGrid=async function(){const body=document.getElementById('payroll-table-body');if(body)body.innerHTML='<tr><td colspan="12" style="text-align:center;padding:38px;color:var(--text3)">Loading employees…</td></tr>';let rows=[];try{const snap=await db.ref('users').once('value');snap.forEach(ch=>{const u=ch.val()||{};rows.push({uid:ch.key,...u})});rows=rows.filter(u=>!u.deleted);window.allPayrollEmployees=rows;if(typeof allPayrollEmployees!=='undefined')allPayrollEmployees=rows;renderPayrollGrid(rows)}catch(e){if(body)body.innerHTML=`<tr><td colspan="12" style="text-align:center;padding:38px;color:var(--red)">${esc(e.message)}</td></tr>`}};
 window.exportPayrollTableCSVV46=function(){const rows=window.payrollRowsV46||[];const csv=[['Employee','Employee ID','Department','Position','Shift','Basic Salary','Pay Frequency','Allowances','Deductions','Payroll Flow','Updated By','Updated At']];rows.forEach(u=>{const s=si(u);csv.push([u.name||'',u.employeeId||'',u.department||'',u.position||'',u.shiftCode||'',s.basicMonthly||0,s.payFrequency||'',allow(s),ded(s),flow(u).label,s.updatedBy||'',at(s.updatedAt)])});const blob=new Blob([csv.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n')],{type:'text/csv;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='payroll_management_with_updates.csv';a.click();URL.revokeObjectURL(a.href)};
})();

/* =========================================================
   APPROVER FIXES v49 — safe immediate override
   All helpers read currentUserData at call-time (no closures over stale values).
   No polling, no delayed init — overrides install at parse time and are
   safe to call before or after login.
   ========================================================= */
(function(){

  /* ── helpers: always read live values ── */
  function _myUid(){ return (typeof currentUserData!=='undefined'&&currentUserData?.uid) || (typeof auth!=='undefined'&&auth?.currentUser?.uid) || ''; }
  function _myRole(){ return String((typeof currentUserData!=='undefined'&&currentUserData?.role)||'').trim().toLowerCase(); }
  function _isAdmin(){ return _myRole()==='admin'; }
  function _canApproveReject(){ return ['admin','manager','supervisor'].includes(_myRole()); }
  function _isMyRequest(r){
    if(_isAdmin()) return true;
    if(!_canApproveReject()) return false;
    const uid = _myUid();
    if(!uid) return false;
    // If request has an explicit approverId, only show to that approver
    if(r && r.approverId) return r.approverId === uid;
    // Orphaned requests (no approverId assigned) visible to all managers/supervisors
    return true;
  }

  /* ── Fix #1: scoped Approval Center loader ── */
  window.loadAllRequests = function(){
    const typeFilter   = document.getElementById('req-filter-type')?.value   || '';
    const statusFilter = document.getElementById('req-filter-status')?.value || '';
    const c = document.getElementById('approval-list');
    if(!c) return;
    const countEl = document.getElementById('approval-record-count');
    c.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text3)">Loading requests...</td></tr>';
    if(countEl) countEl.textContent = 'Loading...';
    if(typeof db==='undefined') return;
    db.ref('requests').once('value').then(snap => {
      const all = [];
      snap.forEach(parent => {
        const val = parent.val();
        if(!val) return;
        const push = (reqId, uidKey, raw) => {
          if(!raw||typeof raw!=='object'||!raw.type) return;
          const row = {reqId, uid:raw.uid||raw.userUid||raw.employeeUid||uidKey, ...raw};
          if(!_isMyRequest(row)) return;
          if(typeFilter && row.type!==typeFilter) return;
          const st = typeof acStatusGroup==='function' ? acStatusGroup(row) : String(row.status||'').toLowerCase();
          if(statusFilter && st!==statusFilter) return;
          all.push(row);
        };
        if(val.type){ push(parent.key, val.uid||val.userUid||val.employeeUid||'', val); return; }
        Object.keys(val||{}).forEach(k => push(k, parent.key, val[k]));
      });
      all.sort((a,b)=>Number(b.submittedAt||b.createdAt||0)-Number(a.submittedAt||a.createdAt||0));
      if(typeof window._v49RenderApprovals==='function') window._v49RenderApprovals(all, c);
      _updateScopedBadge();
    }).catch(err=>{
      c.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--red)">Error: ${String(err?.message||err)}</td></tr>`;
      if(countEl) countEl.textContent='0 items';
    });
  };
  try{ loadAllRequests=window.loadAllRequests; }catch(e){}

  /* ── Fix #4: scoped approval badge — re-attaches safely each call ── */
  let _badgeCb = null;
  function _updateScopedBadge(){
    if(typeof db==='undefined') return;
    if(_badgeCb){ try{ db.ref('requests').off('value',_badgeCb); }catch(e){} }
    _badgeCb = db.ref('requests').on('value', snap=>{
      let n=0;
      snap.forEach(parent=>{
        const val=parent.val(); if(!val) return;
        const chk=(raw,uk)=>{
          if(!raw||typeof raw!=='object') return;
          if(!_isMyRequest({uid:raw.uid||raw.userUid||raw.employeeUid||uk,...raw})) return;
          if(typeof normalizeApprovalStatus==='function' ? normalizeApprovalStatus(raw.status)==='pending' : String(raw.status||'').toLowerCase()==='pending') n++;
        };
        if(val.type){ chk(val,parent.key); return; }
        Object.keys(val||{}).forEach(k=>chk(val[k],parent.key));
      });
      const b=document.getElementById('approval-badge');
      if(!b) return;
      if(n>0){b.textContent=n>99?'99+':String(n);b.classList.remove('hidden');}
      else b.classList.add('hidden');
    });
  }
  window.updateApprovalBadge = _updateScopedBadge;
  try{ updateApprovalBadge=_updateScopedBadge; }catch(e){}

  /* ── Fix #2&#3: gate processRequest — wrap original safely ── */
  const _origProcess = typeof processRequest==='function' ? processRequest : null;
  window.processRequest = async function(decision){
    if(!_canApproveReject()){
      if(typeof toast==='function') toast('Your role is not permitted to approve or reject requests.','red');
      return;
    }
    return _origProcess ? _origProcess.apply(this, arguments) : undefined;
  };
  try{ processRequest=window.processRequest; }catch(e){}

  /* ── Fix #2&#3: renderApprovals — wrap to strip buttons for non-eligible ── */
  /* Store the original (set by the Approval Center patch above this block) */
  const _origRender = typeof window.renderApprovals==='function' ? window.renderApprovals : null;
  window._v49RenderApprovals = function(list, c){
    if(_origRender) _origRender.call(this, list, c);
    if(!_canApproveReject()){
      const el=(c&&c.querySelectorAll)?c:document.getElementById('approval-list');
      if(!el) return;
      el.querySelectorAll('.btn-success,.btn-danger').forEach(btn=>{
        const t=(btn.textContent||'').toLowerCase();
        if(t.includes('approve')||t.includes('reject')) btn.remove();
      });
    }
  };
  window.renderApprovals = window._v49RenderApprovals;
  try{ renderApprovals=window.renderApprovals; }catch(e){}

})();
