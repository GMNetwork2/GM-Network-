'use strict';

// --- Global Variables ---
const MY_EASYPAISA = '03082276093';
const SUPABASE_URL = 'https://kgkeyrhjbwcoaiqlrqqd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_15GSe0dxAxr6whvPkNwZsw_fgJ0_tHs';

let sb = null;
let user = null;
let isAdmin = false;
let currentProduct = null;
let myProfile = null;
let totalComm = 0;
let currentOrderId = null;
let exchangeRates = { USD: 1, PKR: 278, INR: 83, EUR: 0.92, GBP: 0.79 };
let currentCurrency = 'USD';

const $ = id => document.getElementById(id);

// --- Helper Functions ---
function status(id, msg, type = '') {
    const el = $(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('error', 'ok', 'hidden');
    if (type) el.classList.add(type);
}

function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function convertMoney(usdAmount) {
    const rate = exchangeRates[currentCurrency] || 1;
    const converted = Number(usdAmount) * rate;
    if (currentCurrency === 'PKR') return '₨ ' + converted.toLocaleString('en-PK', { maximumFractionDigits: 0 });
    if (currentCurrency === 'INR') return '₹ ' + converted.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    if (currentCurrency === 'EUR') return '€' + converted.toLocaleString('de-DE', { maximumFractionDigits: 2 });
    if (currentCurrency === 'GBP') return '£' + converted.toLocaleString('en-GB', { maximumFractionDigits: 2 });
    return '$' + converted.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

async function fetchExchangeRates() {
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        if (data.result === 'success' && data.rates) {
            for (const c of ['PKR', 'INR', 'EUR', 'GBP']) exchangeRates[c] = data.rates[c];
            $('currencyRateInfo').textContent = 'Rates By Exchange Rate API';
        }
    } catch (e) {
        console.warn('Rate fetch failed:', e);
    }
}

function changeCurrency(curr) {
    currentCurrency = curr;
    if (typeof loadProducts === 'function') loadProducts();
    if (myProfile && typeof loadProfile === 'function') loadProfile();
}

function tab(id) {
    if (id === 'admin' && !isAdmin) { alert('Admin access required.'); return; }
    if (['my-account', 'team', 'account'].includes(id) && !user) { alert('Please sign in first.'); id = 'account'; }
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v.id !== id));
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
    
    if (id === 'team' && typeof loadMyTeam === 'function') loadMyTeam();
    if (id === 'account' && user && typeof loadProfile === 'function') loadProfile();
    if (id === 'my-account' && user && typeof loadMyAccountPage === 'function') loadMyAccountPage();
}

// --- Initialization ---
async function init() {
    if (!window.supabase) {
        status('connection', 'Could not load Supabase. Check your internet connection.', 'error');
        return;
    }
    await fetchExchangeRates();
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    try {
        const { data, error } = await sb.auth.getSession();
        if (error) throw error;
        user = data.session?.user || null;
        await updateAuth();

        sb.auth.onAuthStateChange((_event, session) => {
            user = session?.user || null;
            setTimeout(() => updateAuth(), 0);
        });

        if (typeof loadProducts === 'function') await loadProducts();
        status('connection', 'Backend connected.', 'ok');
    } catch (e) {
        status('connection', 'Connection error: ' + e.message, 'error');
    }
}

async function updateAuth() {
    isAdmin = false;
    const adminTab = $('adminTab'), authPanel = $('authPanel'), profileBox = $('loggedInProfile');

    if (!user) {
        adminTab.classList.add('hidden');
        authPanel.querySelector('.auth-box').classList.remove('hidden');
        $('formSignIn').classList.remove('hidden');
        $('formSignUp').classList.add('hidden');
        profileBox.classList.add('hidden');
        myProfile = null;
        status('authStatus', 'Not signed in.');
        return;
    }

    authPanel.querySelector('.auth-box').classList.add('hidden');
    $('formSignIn').classList.add('hidden');
    $('formSignUp').classList.add('hidden');
    profileBox.classList.remove('hidden');
    $('profEmail').textContent = user.email || '';

    const { data, error } = await sb.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
    isAdmin = !!data && !error;
    adminTab.classList.toggle('hidden', !isAdmin);

    if (typeof loadProfile === 'function') await loadProfile();
    status('authStatus', 'Signed in.', 'ok');

    if (isAdmin && typeof loadAdmin === 'function') await loadAdmin();
    if (!$('my-account').classList.contains('hidden') && typeof loadMyAccountPage === 'function') await loadMyAccountPage();
}

// --- Auth Functions ---
function switchAuth(type) {
    if (user) return;
    $('formSignIn').classList.toggle('hidden', type !== 'signin');
    $('formSignUp').classList.toggle('hidden', type !== 'signup');
    $('btnShowSignIn').classList.toggle('active', type === 'signin');
    $('btnShowSignUp').classList.toggle('active', type === 'signup');
}

async function signIn() {
    if (!sb) return alert('Backend is not connected.');
    const email = $('loginEmail').value.trim(), password = $('loginPassword').value;
    if (!email || !password) return alert('Enter email and password.');
    status('authStatus', 'Signing in…');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) status('authStatus', 'Sign-in failed: ' + error.message, 'error');
}

async function signUp() {
    if (!sb) return alert('Backend is not connected.');
    const email = $('regEmail').value.trim(), password = $('regPassword').value, fullName = $('regFullname').value.trim(), refCode = $('regRefCode').value.trim().toUpperCase();
    if (!email || password.length < 6) return alert('Enter a valid email and password of at least 6 characters.');
    if (!refCode) return alert('Referral code is required.');
    
    status('authStatus', 'Creating account…');
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) { status('authStatus', 'Sign-up failed: ' + error.message, 'error'); return; }
    if (!data.user) { status('authStatus', 'No user returned.', 'error'); return; }

    const { data: refData, error: refError } = await sb.rpc('handle_referral_signup', { referrer_code: refCode });
    if (refError || !refData) { status('authStatus', 'Referral code validation failed.', 'error'); return; }

    const memberCode = 'GM' + cryptoRandom(), myRefCode = 'REF' + cryptoRandom();
    const { error: profileError } = await sb.from('profiles').insert({ id: data.user.id, full_name: fullName || 'Member', member_code: memberCode, referral_code: myRefCode, referred_by: refData, points: 0 });
    
    if (profileError) { status('authStatus', 'Profile setup failed: ' + profileError.message, 'error'); return; }
    
    status('authStatus', '✅ Account created! Your Member ID: ' + memberCode + '\n\nNow you can Sign In.', 'ok');
    switchAuth('signin');
}

function cryptoRandom() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function signOut() {
    if (sb) await sb.auth.signOut();
    user = null; isAdmin = false; myProfile = null; totalComm = 0;
    ['nm', 'ns', 'nc'].forEach(id => $(id).textContent = '—');
    tab('home');
    await updateAuth();
}

// --- Profile Functions (Account Number Edit Added) ---
async function loadProfile() {
    if (!user || !sb) return;
    const { data: profile, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) { status('authStatus', 'Profile could not load: ' + error.message, 'error'); return; }
    if (!profile) { myProfile = null; $('profRefCode').textContent = '—'; return; }

    myProfile = profile;
    const { data: userOrders, error: ordersErr } = await sb.from('orders').select('id').eq('buyer_id', user.id).in('status', ['confirmed', 'delivered']).limit(1);
    
    if (!ordersErr && userOrders && userOrders.length > 0) $('profRefCode').textContent = profile.referral_code || '—';
    else $('profRefCode').textContent = '🔒 Locked';

    $('profCoins').textContent = Number(profile.points || 0).toLocaleString();
    $('nm').textContent = Number(profile.points || 0).toLocaleString();
    
    totalComm = Number(profile.total_commission || 0);
    $('profCommission').textContent = convertMoney(Math.floor(totalComm));
    $('nc').textContent = convertMoney(Math.floor(totalComm));

    const { data: sales, error: salesError } = await sb.from('orders').select('id').eq('referrer_id', user.id).in('status', ['confirmed', 'delivered']);
    $('ns').textContent = salesError ? '—' : String(sales?.length ?? 0);
}

async function loadMyAccountPage() {
    if (!user || !sb) return;
    $('accEmail').textContent = user.email || '—';
    $('accName').textContent = myProfile?.full_name || 'Member';
    $('accMemberId').textContent = myProfile?.member_code || '—';
    $('accUuid').textContent = user.id;
    $('accRefCode').textContent = $('profRefCode').textContent || '—';
    
    // Show Account Number here
    $('accBankDetails').textContent = myProfile?.account_details || 'Not Set';
    
    $('accCoins').textContent = Number(myProfile?.points || 0).toLocaleString();
    $('accBalance').textContent = convertMoney(Math.floor(totalComm));
    
    const coins = Number(myProfile?.points || 0);
    const level = coins >= 50000 ? 'Diamond 💎' : coins >= 10000 ? 'Gold 🥇' : coins >= 3000 ? 'Silver 🥈' : 'Bronze 🥉';
    const target = coins >= 50000 ? null : coins >= 10000 ? 50000 : coins >= 3000 ? 10000 : 3000;
    $('accAchievements').innerHTML = `<div class="panel" style="margin-top:15px"><h3>My Level: ${level}</h3>${target ? `<p class="muted">Next level: ${coins}/${target} coins</p><progress value="${coins}" max="${target}" style="width:100%"></progress>` : '<p>You have reached the highest level! 🏆</p>'}</div>`;

    const { data: orders, error } = await sb.from('orders').select('*, products(name)').eq('buyer_id', user.id).order('created_at', { ascending: false });
    if (error) { $('accTransactions').textContent = 'Could not load transactions: ' + error.message; return; }
    
    $('accTransactions').innerHTML = (orders || []).map(o => {
        const date = new Date(o.created_at).toLocaleDateString('en-GB');
        const productName = o.products?.name || 'Unknown Product';
        return `<div class="item" style="flex-direction:column;align-items:flex-start;gap:5px;border-bottom:1px solid var(--line);padding-bottom:10px;">
      <div style="display:flex;justify-content:space-between;width:100%;"><b>Order …${esc(String(o.id || '').slice(-4))}</b><span class="pill">${esc(o.status || 'unknown')}</span></div>
      <div style="font-size:13px;color:var(--muted);width:100%;">
        <b>Product:</b> ${esc(productName)}<br>
        <b>Amount:</b> ${convertMoney(o.unit_price_pkr)}<br>
        <b>Date:</b> ${date}<br>
      </div>
      ${o.status === 'confirmed' ? `<button class="primary small-btn" data-mark-delivered="${esc(o.id)}" style="margin-top:5px;">I Received My Order</button>` : ''}
    </div>`;
    }).join('') || '<p class="muted">No transactions yet.</p>';
    
    $('accTransactions').querySelectorAll('[data-mark-delivered]').forEach(btn => btn.onclick = () => markAsDelivered(btn.dataset.markDelivered));
}

// Edit Bank Details Function
async function editBankDetails() {
    if (!user) return alert('Please sign in first.');
    const current = myProfile?.account_details || '';
    const newAcc = prompt('Enter your Bank / Easypaisa / JazzCash Account Number and Name:', current);
    if (newAcc === null || newAcc.trim() === '') return;

    const { error } = await sb.from('profiles').update({ account_details: newAcc.trim() }).eq('id', user.id);
    if (error) {
        alert('Could not save account details: ' + error.message);
    } else {
        alert('Account details saved successfully!');
        myProfile.account_details = newAcc.trim();
        $('accBankDetails').textContent = newAcc.trim();
    }
}

function copyText(text) {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => alert('Copied: ' + text)).catch(() => prompt('Copy this text:', text));
    else prompt('Copy this text:', text);
}

function copyRefCode() {
    if (myProfile?.referral_code && $('profRefCode').textContent === myProfile.referral_code) copyText(myProfile.referral_code);
    else alert('Referral code is locked. Buy a product to unlock it.');
}

function copyAccount() { copyText(MY_EASYPAISA); }

// Withdraw Functions
function openWithdraw() {
    if (totalComm < 10) return alert('Minimum withdrawal is $10. Available: ' + convertMoney(totalComm));
    $('withdrawModal').classList.remove('hidden');
    $('wdAmount').value = Math.floor(totalComm);
    $('wdStatus').classList.add('hidden');
    // Automatically fill bank details if available
    if (myProfile?.account_details) {
        $('wdAccount').value = myProfile.account_details;
    }
}

async function submitWithdraw() {
    if (!user) return alert('Please sign in first.');
    const amount = Number($('wdAmount').value), acc = $('wdAccount').value.trim();
    if (!amount || !acc) return alert('Please fill in all fields.');
    if (amount < 10) return alert('Minimum withdrawal is $10.');
    if (amount > totalComm) return alert('Amount exceeds your earnings.');
    
    status('wdStatus', 'Submitting…');
    const { error } = await sb.from('withdrawals').insert({ user_id: user.id, amount, account_details: acc, status: 'pending' });
    if (error) status('wdStatus', 'Request failed: ' + error.message, 'error');
    else {
        status('wdStatus', 'Request submitted. Admin will review it.', 'ok');
        setTimeout(() => $('withdrawModal').classList.add('hidden'), 1800);
    }
}

// --- Products & Orders (Rest of functions will be in calc.js) ---
