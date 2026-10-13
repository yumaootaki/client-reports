/*
 * AI診断レポートの閲覧計測(全レポート共通)
 * 使い方:レポートの </body> の直前に1行
 *   <script src="../../assets/aio-track.js" data-report-id="aio-xxxxxx" defer></script>
 *
 * - 送信先(個人アカウントの GAS Web アプリ)はこのファイルの ENDPOINT の1か所だけで定義する
 * - 送るのは匿名ID・イベント種別・閲覧秒数・スクロール率・ユーザーエージェントだけ(個人情報は取らない)
 * - 大瀧の閲覧は除外:URL に ?me=1 を付けて一度開いた端末は以後送信しない(?me=0 で解除)
 * - ボット除外:JavaScript が動き、画面に3秒以上表示された後にだけ送る。ボット系のユーザーエージェントは送らない
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwZXDdaLHhUOyGumcd1a88nRA_BXSLeFKLb2Aan9hLR1a43kbCPehWXxDpFddDsCB1-/exec'; // ← GAS Web アプリの /exec URL(ここ1か所だけ)

  var script = document.currentScript || document.querySelector('script[data-report-id]');
  var rid = script && script.getAttribute('data-report-id');
  if (!ENDPOINT || !rid || !navigator.sendBeacon) return;

  // --- 自分の閲覧を除外 ---
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存できない環境 */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* 同上 */ } },
  };
  var params = new URLSearchParams(location.search);
  if (params.get('me') === '1') store.set('aio_me', '1');
  if (params.get('me') === '0') store.del('aio_me');
  if (store.get('aio_me') === '1') return;

  // --- ボット・自動アクセスを除外 ---
  var ua = navigator.userAgent || '';
  if (navigator.webdriver) return;
  if (/bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora|pinterest|vkshare|w3c_validator|whatsapp|line\/|slack|discord|telegram|twitter|skype|bingpreview|headless|lighthouse|pagespeed|google-read-aloud|mediapartners|adsbot|feedfetcher/i.test(ua)) return;

  // --- 匿名ID(ブラウザごと) ---
  var aid = store.get('aio_aid');
  if (!aid || !/^[a-z0-9]{8,40}$/.test(aid)) {
    aid = '';
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < 20; i++) aid += chars.charAt(Math.floor(Math.random() * chars.length));
    store.set('aio_aid', aid);
  }

  function send(ev, sec, scr) {
    var body = JSON.stringify({ rid: rid, aid: aid, ev: ev, sec: sec || 0, scr: scr || 0, ua: ua.slice(0, 300) });
    try { navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' })); } catch (e) { /* 送れなくても表示は続ける */ }
  }

  // --- 実閲覧時間(タブが見えている間だけ数える) ---
  var started = false;      // 3秒表示されて「閲覧開始」を送ったか
  var visibleSince = null;  // 現在の表示区間の開始時刻
  var pendingMs = 0;        // まだ送っていない閲覧ミリ秒

  function startVisible() { if (visibleSince === null) visibleSince = Date.now(); }
  function stopVisible() {
    if (visibleSince !== null) { pendingMs += Date.now() - visibleSince; visibleSince = null; }
  }
  function flush() {
    if (!started) return;
    stopVisible();
    var sec = Math.round(pendingMs / 1000);
    if (sec >= 1) { send('engage', Math.min(sec, 3600), 0); pendingMs = 0; }
    if (document.visibilityState === 'visible') startVisible();
  }

  // 3秒以上表示されたら閲覧開始(プレビューや一瞬のアクセスを数えない)
  var startTimer = null;
  function armStart() {
    if (started || startTimer) return;
    startTimer = setTimeout(function () {
      startTimer = null;
      if (document.visibilityState !== 'visible') return;
      started = true;
      send('view', 0, 0);
      checkScroll();
    }, 3000);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { startVisible(); armStart(); }
    else {
      if (startTimer) { clearTimeout(startTimer); startTimer = null; }
      flush();
    }
  });
  window.addEventListener('pagehide', flush);
  setInterval(function () { if (document.visibilityState === 'visible') flush(); }, 60000);

  // --- 最大スクロール率(25/50/75/90%到達時に1回ずつ) ---
  var marks = [25, 50, 75, 90];
  var sent = {};
  function checkScroll() {
    if (!started) return;
    var doc = document.documentElement;
    var max = Math.max(doc.scrollHeight - window.innerHeight, 1);
    var pct = Math.min(100, Math.round((window.scrollY || doc.scrollTop) / max * 100));
    for (var j = 0; j < marks.length; j++) {
      if (pct >= marks[j] && !sent[marks[j]]) { sent[marks[j]] = true; send('scroll', 0, marks[j]); }
    }
  }
  window.addEventListener('scroll', function () { checkScroll(); }, { passive: true });

  if (document.visibilityState === 'visible') { startVisible(); armStart(); }
})();
