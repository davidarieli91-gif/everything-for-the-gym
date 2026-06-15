/* ============================================================
   video-call.js — Видеозвонки тренер ↔ клиент (WebRTC + PeerJS)
   ────────────────────────────────────────────────────────────
   PeerJS обеспечивает бесплатный сигналинг через public-сервер.
   Peer-ID детерминирован из ID пользователя, поэтому тренер
   и клиент всегда находят друг друга без обмена контактами.

   ⚠️ Для связи через строгие корпоративные файрволы может
      потребоваться TURN-сервер — добавьте в iceServers ниже.
   ============================================================ */
(function () {
'use strict';

if (!window.RTCPeerConnection) { console.warn('[VC] WebRTC не поддерживается'); return; }

/* ======================== ТЕКСТЫ ======================== */
var VC_T = {
    title:       {ru:'📹 Видеозвонок', en:'📹 Video call', he:'📹 שיחת וידאו'},
    calling:     {ru:'Звоним…', en:'Calling…', he:'מתקשר…'},
    incoming:    {ru:'Входящий звонок', en:'Incoming call', he:'שיחה נכנסת'},
    connecting:  {ru:'Подключение…', en:'Connecting…', he:'מתחבר…'},
    connected:   {ru:'● На связи', en:'● Connected', he:'● מחובר'},
    noAnswer:    {ru:'Нет ответа. Возможно, клиент не в приложении.', en:'No answer. Client may be offline.', he:'אין מענה. ייתכן שהלקוח לא מחובר.'},
    declined:    {ru:'Звонок отклонён', en:'Call declined', he:'השיחה נדחתה'},
    ended:       {ru:'Звонок завершён', en:'Call ended', he:'השיחה הסתיימה'},
    failed:      {ru:'Ошибка соединения', en:'Connection failed', he:'חיבור נכשל'},
    accept:      {ru:'✅ Принять', en:'✅ Accept', he:'✅ קבל'},
    decline:     {ru:'❌ Отклонить', en:'❌ Decline', he:'❌ דחה'},
    cancel:      {ru:'Отменить', en:'Cancel', he:'בטל'},
    endCall:     {ru:'📵 Завершить', en:'📵 End', he:'📵 סיום'},
    mute:        {ru:'Микрофон', en:'Mic', he:'מיקרו'},
    camera:      {ru:'Камера', en:'Camera', he:'מצלמה'},
    switchCam:   {ru:'Сменить камеру', en:'Flip camera', he:'החלף מצלמה'},
    noClient:    {ru:'Сначала выберите клиента', en:'Select a client first', he:'בחרו לקוח'},
    camDenied:   {ru:'Нет доступа к камере/микрофону. Разрешите доступ в браузере.', en:'Camera/mic access denied. Check browser permissions.', he:'גישה למצלמה/מיקרו נדחתה.'},
    serverOff:   {ru:'Сервер звонков недоступен. Проверьте интернет.', en:'Call server unavailable. Check connection.', he:'שרת השיחות לא זמין.'},
    busy:        {ru:'Линия занята', en:'Line busy', he:'קו תפוס'},
    peerInUse:   {ru:'Эта учётка уже в видеозвонке на другом устройстве', en:'This account is already in a call elsewhere', he:'חשבון זה כבר בשיחה'},
    inviteSent:  {ru:'📨 Приглашение отправлено в чат', en:'📨 Invitation sent to chat', he:'📨 ההזמנה נשלחה'},
    videoTab:    {ru:'Видео', en:'Video', he:'וידאו'},
    inviteTrainer:{ru:'📹 Я в видеозвонке. Нажмите 📹 внизу экрана, чтобы присоединиться.', en:'📹 I am in a video call. Tap 📹 at the bottom to join.', he:'📹 אני בשיחת וידאו. לחצו על 📹 בתחתית המסך כדי להצטרף.'}
};
function vt(k){var l=(typeof currentLang!=='undefined')?currentLang:'ru';return (VC_T[k]&&(VC_T[k][l]||VC_T[k].ru))||k;}
function vEsc(s){return (typeof escapeHtml==='function')?escapeHtml(String(s==null?'':s)):String(s);}

/* ======================== КОНФИГ ======================== */
var PEERJS_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
var ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
    // Для строгих NAT добавьте TURN, например:
    // { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' }
];

/* ======================== СОСТОЯНИЕ ======================== */
var peer = null;
var peerReady = false;
var S = {
    status: 'idle',        // idle | calling | incoming | connecting | connected
    call: null,            // MediaConnection
    dc: null,              // DataConnection (сигналинг decline/end)
    localStream: null,
    remoteStream: null,
    partnerName: '',
    partnerAvatar: '📞',
    muted: false,
    camOff: false,
    facingMode: 'user',
    startTime: 0,
    timerInt: null,
    timeoutInt: null,
    incomingCall: null,
    incomingMeta: null
};

/* ======================== ID / ИДЕНТИЧНОСТЬ ======================== */
function hsh(s){ s=String(s||''); var h=5381; for(var i=0;i<s.length;i++){h=((h<<5)+h+s.charCodeAt(i))&0xffffffff;} return (h>>>0).toString(36); }

function getMyId(){
    try{ if(typeof __clientUser!=='undefined'&&__clientUser&&__clientUser.id) return __clientUser.id; }catch(e){}
    try{ if(typeof currentTrainer!=='undefined'&&currentTrainer&&currentTrainer.id) return 'trainer_'+currentTrainer.id; }catch(e){}
    return null;
}
function getMyRole(){
    try{ var cs=document.getElementById('clientSpace'); if(cs&&cs.style.display!=='none'&&typeof __clientUser!=='undefined'&&__clientUser) return 'client'; }catch(e){}
    return 'trainer';
}
function getMyName(){
    try{ if(getMyRole()==='client'&&typeof __clientUser!=='undefined'&&__clientUser) return ((__clientUser.name||'')+' '+(__clientUser.lastName||'')).trim(); }catch(e){}
    try{ if(typeof currentTrainer!=='undefined'&&currentTrainer) return currentTrainer.name||'Тренер'; }catch(e){}
    return 'User';
}
function getMyAvatar(){
    try{ if(typeof __clientUser!=='undefined'&&__clientUser) return __clientUser.avatar||'👤'; }catch(e){}
    return '👨‍🏫';
}
/* peer-id: pg + первая буква роли + хэш */
function peerIdFor(uid, role){ return 'pg'+(role||'c')[0]+'_'+hsh(uid); }
function myPeerId(){ var id=getMyId(), role=getMyRole(); return id?peerIdFor(id,role):null; }
function trainerPeerId(){
    try{ var ts=(typeof getTrainers==='function')?getTrainers():[]; if(ts.length){ var t=ts.find(function(x){return x.role==='owner';})||ts[0]; return peerIdFor('trainer_'+t.id,'trainer'); } }catch(e){}
    return null;
}
function clientPeerId(uid){ return peerIdFor(uid,'client'); }

/* ======================== ЗАГРУЗКА PEERJS ======================== */
function loadPeerJS(cb){
    if(window.Peer){ cb(); return; }
    var ex=document.querySelector('script[src*="peerjs"]');
    if(ex){ if(window.Peer) cb(); else ex.addEventListener('load',cb); return; }
    var s=document.createElement('script');
    s.src=PEERJS_CDN; s.async=true;
    s.onload=function(){ cb(); };
    s.onerror=function(){ console.warn('[VC] Не удалось загрузить PeerJS'); };
    document.head.appendChild(s);
}

/* ======================== ИНИЦИАЛИЗАЦИЯ PEER ======================== */
function initPeer(){
    var pid=myPeerId();
    if(!pid){ return; }
    if(peer){ try{peer.destroy();}catch(e){} peer=null; peerReady=false; }
    loadPeerJS(function(){
        if(!window.Peer){ return; }
        try{
            peer=new Peer(pid,{debug:1,config:{iceServers:ICE_SERVERS}});
            peer.on('open',function(id){ peerReady=true; console.log('[VC] Peer ready:',id); vcUpdateBell(); });
            peer.on('call',onIncomingCall);
            peer.on('connection',function(c){ S.dc=c; c.on('data',onDcData); });
            peer.on('error',onPeerError);
            peer.on('disconnected',function(){ peerReady=false; try{peer.reconnect();}catch(e){} });
            peer.on('close',function(){ peerReady=false; });
        }catch(e){ console.warn('[VC] Peer init error',e); }
    });
}

function onPeerError(err){
    console.warn('[VC] Peer error:',err.type,err.message);
    if(err.type==='unavailable-id'){ peerReady=false; if(typeof showToast==='function') showToast(vt('peerInUse')); }
    else if(err.type==='peer-unavailable'){ if(S.status==='calling'){ vcShowError(vt('noAnswer')); vcReset(3000); } }
    else if(err.type==='network'||err.type==='server-error'||err.type==='socket-error'){ peerReady=false; setTimeout(function(){ if(!peerReady&&getMyId()) initPeer(); },5000); }
}

/* ======================== ВХОДЯЩИЙ ЗВОНОК ======================== */
function onIncomingCall(call){
    if(S.status!=='idle'){ try{call.close();}catch(e){} return; }
    S.incomingCall=call;
    S.incomingMeta=call.metadata||{};
    S.status='incoming';
    S.partnerName=S.incomingMeta.name||'...';
    S.partnerAvatar=S.incomingMeta.avatar||'📞';
    vcBuildDom();
    vcRenderIncoming();
    /* звуковой сигнал */
    vcRing(true);
    /* автоотбой через 40 сек */
    S.timeoutInt=setTimeout(function(){ if(S.status==='incoming') vcDecline(true); },40000);
    /* системное уведомление */
    try{ if(typeof ntfPush==='function') ntfPush('vc_in_'+Date.now(),'📹',vt('incoming'),S.partnerName,''); }catch(e){}
}

function onDcData(d){
    if(!d) return;
    if(d.type==='decline') vcHandleDeclined();
    if(d.type==='end') vcHandleRemoteEnd();
}

/* ======================== ПРИНЯТЬ / ОТКЛОНИТЬ ======================== */
window.vcAccept=function(){
    vcRing(false);
    clearTimeout(S.timeoutInt);
    var call=S.incomingCall;
    if(!call) return;
    S.status='connecting';
    vcRenderConnecting();
    navigator.mediaDevices.getUserMedia({video:{facingMode:S.facingMode},audio:true})
        .then(function(stream){
            S.localStream=stream;
            call.answer(stream);
            S.call=call;
            call.on('stream',function(remote){
                S.remoteStream=remote;
                S.status='connected';
                S.startTime=Date.now();
                vcRenderConnected();
            });
            call.on('close',vcHandleRemoteEnd);
            call.on('error',function(){ vcShowError(vt('failed')); });
        })
        .catch(function(){ vcShowError(vt('camDenied')); vcReset(3000); });
};

window.vcDecline=function(silent){
    vcRing(false);
    clearTimeout(S.timeoutInt);
    if(S.incomingCall){ try{S.incomingCall.close();}catch(e){} }
    /* отправляем decline через data-connection, если есть */
    sendSignal('decline');
    S.incomingCall=null;
    if(!silent) vcShowError(vt('declined'));
    vcReset(silent?0:2000);
};

function sendSignal(type){
    try{ if(S.dc&&S.dc.send) S.dc.send({type:type}); }catch(e){}
    /* fallback: пробуем через peer.connect */
}

/* ======================== ИСХОДЯЩИЙ ЗВОНОК ======================== */
/* Переопределяем openVideoCall из Jitsi-модуля */
window.openVideoCall=function(uid, role){
    role=role||'trainer';
    if(role==='trainer'&&!uid){ if(typeof showToast==='function') showToast(vt('noClient')); return; }
    if(S.status!=='idle'){ if(typeof showToast==='function') showToast(vt('busy')); return; }

    /* имя/аватар партнёра */
    var pn='', pa='📞';
    try{
        if(role==='trainer'){
            var u=(typeof getUsers==='function')?getUsers().find(function(x){return x.id===uid;}):null;
            if(u){ pn=(u.name||'')+(u.lastName?' '+u.lastName:''); pa=u.avatar||'👤'; }
        } else {
            var ts=(typeof getTrainers==='function')?getTrainers():[];
            var t=ts.find(function(x){return x.role==='owner';})||ts[0];
            if(t){ pn=t.name||'Тренер'; pa='👨‍🏫'; }
        }
    }catch(e){}
    S.partnerName=pn; S.partnerAvatar=pa;

    var targetPid = role==='trainer'?clientPeerId(uid):trainerPeerId();
    if(!targetPid){ vcShowError(vt('failed')); vcReset(3000); return; }

    S.status='calling';
    vcBuildDom();
    vcRenderCalling();

    if(!peerReady||!peer){ vcShowError(vt('serverOff')); vcReset(3000); return; }

    navigator.mediaDevices.getUserMedia({video:{facingMode:S.facingMode},audio:true})
        .then(function(stream){
            S.localStream=stream;
            /* data-канал для сигналинга */
            var dc=peer.connect(targetPid,{reliable:true,metadata:{name:getMyName(),avatar:getMyAvatar()}});
            S.dc=dc;
            var callPlaced=false;
            dc.on('open',function(){
                if(callPlaced) return; callPlaced=true;
                var call=peer.call(targetPid,stream,{metadata:{name:getMyName(),avatar:getMyAvatar()}});
                S.call=call;
                call.on('stream',function(remote){
                    S.remoteStream=remote;
                    S.status='connected';
                    S.startTime=Date.now();
                    vcRenderConnected();
                });
                call.on('close',vcHandleRemoteEnd);
                call.on('error',function(){ vcShowError(vt('failed')); });
            });
            dc.on('data',onDcData);
            dc.on('error',function(){ if(S.status==='calling'){ vcShowError(vt('noAnswer')); vcReset(3000); } });
            /* таймаут: нет ответа за 40 сек */
            S.timeoutInt=setTimeout(function(){
                if(S.status==='calling'){ vcShowError(vt('noAnswer')); vcReset(3000); }
            },40000);
        })
        .catch(function(){ vcShowError(vt('camDenied')); vcReset(3000); });
};

/* ======================== ЗАВЕРШЕНИЕ ======================== */
/* Переопределяем closeVideoCall из Jitsi-модуля */
window.closeVideoCall=function(){
    sendSignal('end');
    vcCleanup();
};

function vcCleanup(){
    clearTimeout(S.timeoutInt);
    clearInterval(S.timerInt);
    vcRing(false);
    if(S.localStream){ S.localStream.getTracks().forEach(function(t){t.stop();}); S.localStream=null; }
    if(S.call){ try{S.call.close();}catch(e){} S.call=null; }
    if(S.dc){ try{S.dc.close();}catch(e){} S.dc=null; }
    if(S.incomingCall){ try{S.incomingCall.close();}catch(e){} S.incomingCall=null; }
    S.remoteStream=null;
    S.status='idle';
    S.partnerName='';
    var ov=document.getElementById('vcOverlay');
    if(ov){ ov.classList.remove('open'); }
    document.body.classList.remove('vc-active');
}
function vcReset(delay){
    clearTimeout(S.timeoutInt);
    clearInterval(S.timerInt);
    vcRing(false);
    if(S.localStream){ S.localStream.getTracks().forEach(function(t){t.stop();}); S.localStream=null; }
    if(S.call){ try{S.call.close();}catch(e){} S.call=null; }
    if(S.incomingCall){ try{S.incomingCall.close();}catch(e){} S.incomingCall=null; }
    setTimeout(vcCleanup, delay||0);
}
function vcHandleDeclined(){ vcShowError(vt('declined')); vcReset(2000); }
function vcHandleRemoteEnd(){ vcShowError(vt('ended')); vcReset(1500); }

/* ======================== ЗВУКОВОЙ СИГНАЛ ======================== */
var ringCtx=null, ringOsc=null;
function vcRing(on){
    try{
        if(on){
            if(ringOsc) return;
            ringCtx=new (window.AudioContext||window.webkitAudioContext)();
            function beep(){
                if(!ringOsc&&S.status!=='incoming') return;
                var o=ringCtx.createOscillator(), g=ringCtx.createGain();
                o.frequency.value=880; o.type='sine';
                g.gain.setValueAtTime(0.15,ringCtx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001,ringCtx.currentTime+0.4);
                o.connect(g); g.connect(ringCtx.destination);
                o.start(); o.stop(ringCtx.currentTime+0.4);
            }
            beep(); ringOsc=setInterval(beep,2000);
        } else {
            if(ringOsc){ clearInterval(ringOsc); ringOsc=null; }
            if(ringCtx){ try{ringCtx.close();}catch(e){} ringCtx=null; }
        }
    }catch(e){}
}

/* ======================== УПРАВЛЕНИЕ МЕДИА ======================== */
window.vcToggleMute=function(){
    if(!S.localStream) return;
    S.muted=!S.muted;
    S.localStream.getAudioTracks().forEach(function(t){ t.enabled=!S.muted; });
    var b=document.getElementById('vcMuteBtn'); if(b) b.classList.toggle('active',S.muted);
};
window.vcToggleCam=function(){
    if(!S.localStream) return;
    S.camOff=!S.camOff;
    S.localStream.getVideoTracks().forEach(function(t){ t.enabled=!S.camOff; });
    var b=document.getElementById('vcCamBtn'); if(b) b.classList.toggle('active',S.camOff);
};
window.vcSwitchCam=function(){
    if(!S.localStream) return;
    S.facingMode = S.facingMode==='user'?'environment':'user';
    navigator.mediaDevices.getUserMedia({video:{facingMode:S.facingMode},audio:true})
        .then(function(ns){
            var vt2=S.localStream.getVideoTracks()[0];
            if(vt2){ var sender=S.call.peerConnection.getSenders().find(function(s){return s.track&&s.track.kind==='video';}); if(sender) sender.replaceTrack(ns.getVideoTracks()[0]); vt2.stop(); }
            S.localStream.removeTrack(vt2);
            S.localStream.addTrack(ns.getVideoTracks()[0]);
            var lv=document.getElementById('vcLocal'); if(lv) lv.srcObject=S.localStream;
        })
        .catch(function(){});
};

/* ======================== ПРИГЛАШЕНИЕ ЧЕРЕЗ ЧАТ ======================== */
window.vidInvite=function(){
    var uid=getMyRole()==='trainer'?(typeof currentUserId!=='undefined'?currentUserId:null):null;
    if(!uid&&typeof __clientUser!=='undefined'&&__clientUser) uid=null; /* клиент не приглашает */
    if(getMyRole()!=='trainer') return;
    if(typeof currentUserId==='undefined'||!currentUserId) return;
    try{
        var arr=JSON.parse(localStorage.getItem('chatMessages_'+currentUserId)||'[]');
        arr.push({id:'m'+Date.now()+Math.random().toString(36).slice(2,4),from:'trainer',text:vt('inviteTrainer'),ts:Date.now(),read:false});
        localStorage.setItem('chatMessages_'+currentUserId,JSON.stringify(arr));
    }catch(e){}
    if(typeof showToast==='function') showToast(vt('inviteSent'));
    if(typeof chatOnRemoteUpdate==='function') chatOnRemoteUpdate();
};

/* ======================== СТИЛИ ======================== */
function vcInjectStyles(){
    if(document.getElementById('vcStyles')) return;
    var st=document.createElement('style'); st.id='vcStyles';
    st.textContent=
    'body.vc-active{overflow:hidden;}'+
    '#vcOverlay{display:none;position:fixed;inset:0;z-index:10060;background:#0b0f19;}'+
    '#vcOverlay.open{display:flex;flex-direction:column;}'+
    /* верхняя панель */
    '.vc-top{display:flex;align-items:center;gap:10px;padding:10px 14px;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;flex-shrink:0;z-index:3;}'+
    '.vc-top-name{flex:1;min-width:0;}'+
    '.vc-top-name b{display:block;font-size:1.05em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'+
    '.vc-top-name small{font-size:.76em;opacity:.8;}'+
    '.vc-top-end{background:#EF4444;border:none;color:#fff;border-radius:10px;padding:8px 16px;font-weight:700;cursor:pointer;font-size:.88em;white-space:nowrap;transition:.15s;}'+
    '.vc-top-end:hover{background:#dc2626;}'+
    /* видео-область */
    '.vc-stage{flex:1;position:relative;min-height:0;background:#000;overflow:hidden;}'+
    '#vcRemote{width:100%;height:100%;object-fit:cover;}'+
    '.vc-local-pip{position:absolute;width:30%;max-width:160px;min-width:90px;aspect-ratio:3/4;bottom:80px;right:12px;border-radius:12px;overflow:hidden;border:2px solid rgba(255,255,255,.25);box-shadow:0 4px 16px rgba(0,0,0,.5);z-index:2;background:#1a1a2e;}'+
    '#vcLocal{width:100%;height:100%;object-fit:cover;transform:scaleX(-1);}'+
    /* нижняя панель управления */
    '.vc-ctrls{display:flex;justify-content:center;align-items:center;gap:10px;padding:16px;background:linear-gradient(0deg,#0b0f19,transparent);position:absolute;bottom:0;left:0;right:0;z-index:3;}'+
    '.vc-ctrl{width:52px;height:52px;border-radius:50%;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:1.3em;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.15s;backdrop-filter:blur(8px);}'+
    '.vc-ctrl:hover{background:rgba(255,255,255,.28);}'+
    '.vc-ctrl.active{background:#EF4444;}'+
    '.vc-ctrl.end{background:#EF4444;width:60px;height:60px;font-size:1.5em;}'+
    '.vc-ctrl.end:hover{background:#dc2626;}'+
    /* экраны calling / incoming / connecting */
    '.vc-ring-screen{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:30px;text-align:center;background:linear-gradient(160deg,#1a1a2e,#16213e);}'+
    '.vc-ring-avatar{width:110px;height:110px;border-radius:50%;background:linear-gradient(135deg,#4F46E5,#7C3AED);display:flex;align-items:center;justify-content:center;font-size:3em;color:#fff;box-shadow:0 0 0 0 rgba(124,58,237,.5);animation:vcPulse 1.8s infinite;}'+
    '@keyframes vcPulse{0%{box-shadow:0 0 0 0 rgba(124,58,237,.5);}70%{box-shadow:0 0 0 24px rgba(124,58,237,0);}100%{box-shadow:0 0 0 0 rgba(124,58,237,0);}}'+
    '.vc-ring-name{font-size:1.5em;font-weight:700;color:#fff;}'+
    '.vc-ring-status{font-size:1em;color:#94a3b8;}'+
    '.vc-ring-dots{display:flex;gap:6px;}'+
    '.vc-ring-dots span{width:8px;height:8px;border-radius:50%;background:#818cf8;animation:vcBounce 1.4s infinite;}'+
    '.vc-ring-dots span:nth-child(2){animation-delay:.2s;}'+
    '.vc-ring-dots span:nth-child(3){animation-delay:.4s;}'+
    '@keyframes vcBounce{0%,60%,100%{transform:translateY(0);opacity:.4;}30%{transform:translateY(-10px);opacity:1;}}'+
    '.vc-ring-btns{display:flex;gap:24px;margin-top:10px;}'+
    '.vc-ring-btn{border:none;border-radius:50%;width:64px;height:64px;font-size:1.6em;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;transition:.2s;}'+
    '.vc-ring-btn.accept{background:#10B981;}'+
    '.vc-ring-btn.accept:hover{background:#059669;transform:scale(1.1);}'+
    '.vc-ring-btn.decline{background:#EF4444;}'+
    '.vc-ring-btn.decline:hover{background:#dc2626;transform:scale(1.1);}'+
    '.vc-ring-btn.cancel{background:rgba(255,255,255,.15);width:56px;height:56px;}'+
    '.vc-ring-btn.cancel:hover{background:rgba(255,255,255,.28);}'+
    /* ошибка / завершение */
    '.vc-end-screen{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:30px;text-align:center;background:linear-gradient(160deg,#1a1a2e,#16213e);color:#fff;}'+
    '.vc-end-ico{font-size:3.5em;opacity:.7;}'+
    '.vc-end-txt{font-size:1.2em;font-weight:600;}'+
    /* индикатор подключения */
    '.vc-conn-bar{position:absolute;top:0;left:0;right:0;height:3px;z-index:4;overflow:hidden;}'+
    '.vc-conn-bar::after{content:"";display:block;height:100%;width:40%;background:linear-gradient(90deg,transparent,#818cf8,transparent);animation:vcSlide 1.2s infinite;}'+
    '@keyframes vcSlide{0%{transform:translateX(-100%);}100%{transform:translateX(350%);}}'+
    /* колокольчик статуса */
    '#vcBell{position:fixed;bottom:20px;left:20px;width:40px;height:40px;border-radius:50%;border:none;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;font-size:1em;cursor:pointer;z-index:9000;box-shadow:0 4px 14px rgba(79,70,229,.4);display:none;}'+
    '#vcBell.ready{display:block;}'+
    '#vcBell .vc-dot{position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:#10B981;border:2px solid #0b0f19;}'+
    '@media(max-width:600px){.vc-local-pip{width:25%;bottom:70px;}.vc-ctrl{width:46px;height:46px;font-size:1.1em;}.vc-ctrl.end{width:54px;height:54px;}}'+
    '';
    document.head.appendChild(st);
}

/* ======================== DOM ======================== */
function vcBuildDom(){
    vcInjectStyles();
    if(document.getElementById('vcOverlay')) return;
    var ov=document.createElement('div'); ov.id='vcOverlay';
    document.body.appendChild(ov);
}

/* ======================== РЕНДЕР ======================== */
function vcRenderCalling(){
    var ov=document.getElementById('vcOverlay'); if(!ov) return;
    ov.innerHTML=
        '<div class="vc-ring-screen">'+
            '<div class="vc-ring-avatar">'+vEsc(S.partnerAvatar)+'</div>'+
            '<div class="vc-ring-name">'+vEsc(S.partnerName)+'</div>'+
            '<div class="vc-ring-dots"><span></span><span></span><span></span></div>'+
            '<div class="vc-ring-status">'+vt('calling')+'</div>'+
            (S.localStream?'<div class="vc-local-pip" style="position:relative;bottom:auto;right:auto;margin-top:8px;width:120px;"><video id="vcLocal" autoplay playsinline muted></video></div>':'')+
            '<div class="vc-ring-btns">'+
                '<button class="vc-ring-btn cancel" onclick="closeVideoCall()" title="'+vt('cancel')+'">✕</button>'+
            '</div>'+
        '</div>';
    ov.classList.add('open');
    document.body.classList.add('vc-active');
    vcAttachLocal();
}

function vcRenderIncoming(){
    var ov=document.getElementById('vcOverlay'); if(!ov) return;
    ov.innerHTML=
        '<div class="vc-ring-screen">'+
            '<div class="vc-ring-avatar">'+vEsc(S.partnerAvatar)+'</div>'+
            '<div class="vc-ring-name">'+vEsc(S.partnerName)+'</div>'+
            '<div class="vc-ring-status">'+vt('incoming')+'</div>'+
            '<div class="vc-ring-btns">'+
                '<button class="vc-ring-btn decline" onclick="vcDecline()" title="'+vt('decline')+'">📞</button>'+
                '<button class="vc-ring-btn accept" onclick="vcAccept()" title="'+vt('accept')+'">✅</button>'+
            '</div>'+
        '</div>';
    ov.classList.add('open');
    document.body.classList.add('vc-active');
}

function vcRenderConnecting(){
    var ov=document.getElementById('vcOverlay'); if(!ov) return;
    ov.innerHTML=
        '<div class="vc-ring-screen">'+
            '<div class="vc-conn-bar"></div>'+
            '<div class="vc-ring-avatar" style="animation:none;">'+vEsc(S.partnerAvatar)+'</div>'+
            '<div class="vc-ring-name">'+vEsc(S.partnerName)+'</div>'+
            '<div class="vc-ring-status">'+vt('connecting')+'</div>'+
            (S.localStream?'<div class="vc-local-pip" style="position:relative;bottom:auto;right:auto;margin-top:8px;width:120px;"><video id="vcLocal" autoplay playsinline muted></video></div>':'')+
        '</div>';
    vcAttachLocal();
}

function vcRenderConnected(){
    var ov=document.getElementById('vcOverlay'); if(!ov) return;
    ov.innerHTML=
        '<div class="vc-top">'+
            '<div class="vc-top-name"><b>'+vEsc(S.partnerName)+'</b><small id="vcTimer">'+vt('connected')+'</small></div>'+
            '<button class="vc-top-end" onclick="closeVideoCall()">'+vt('endCall')+'</button>'+
        '</div>'+
        '<div class="vc-stage">'+
            '<video id="vcRemote" autoplay playsinline></video>'+
            '<div class="vc-local-pip"><video id="vcLocal" autoplay playsinline muted></video></div>'+
            '<div class="vc-ctrls">'+
                '<button class="vc-ctrl" id="vcMuteBtn" onclick="vcToggleMute()" title="'+vt('mute')+'">🎙️</button>'+
                '<button class="vc-ctrl" id="vcCamBtn" onclick="vcToggleCam()" title="'+vt('camera')+'">📷</button>'+
                '<button class="vc-ctrl" onclick="vcSwitchCam()" title="'+vt('switchCam')+'">🔄</button>'+
                '<button class="vc-ctrl end" onclick="closeVideoCall()" title="'+vt('endCall')+'">📵</button>'+
            '</div>'+
        '</div>';
    vcAttachLocal();
    vcAttachRemote();
    /* таймер */
    clearInterval(S.timerInt);
    S.timerInt=setInterval(function(){
        var el=document.getElementById('vcTimer'); if(!el) return;
        var s=Math.floor((Date.now()-S.startTime)/1000);
        var m=Math.floor(s/60); s=s%60;
        el.textContent=vt('connected')+' · '+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
    },1000);
}

function vcShowError(msg){
    var ov=document.getElementById('vcOverlay'); if(!ov) return;
    ov.innerHTML=
        '<div class="vc-end-screen">'+
            '<div class="vc-end-ico">📹</div>'+
            '<div class="vc-end-txt">'+vEsc(msg)+'</div>'+
        '</div>';
    ov.classList.add('open');
    document.body.classList.add('vc-active');
}

function vcAttachLocal(){
    if(!S.localStream) return;
    var v=document.getElementById('vcLocal');
    if(v){ v.srcObject=S.localStream; v.play().catch(function(){}); }
}
function vcAttachRemote(){
    if(!S.remoteStream) return;
    var v=document.getElementById('vcRemote');
    if(v){ v.srcObject=S.remoteStream; v.play().catch(function(){}); }
}

/* ======================== ИНДИКАТОР СТАТУСА ======================== */
function vcUpdateBell(){
    if(peerReady){
        if(!document.getElementById('vcBell')){
            var b=document.createElement('div'); b.id='vcBell'; b.innerHTML='📹<span class="vc-dot"></span>';
            b.title=vt('connected');
            document.body.appendChild(b);
        }
        document.getElementById('vcBell').classList.add('ready');
    } else {
        var ex=document.getElementById('vcBell'); if(ex) ex.classList.remove('ready');
    }
}

/* ======================== ИНТЕГРАЦИЯ КНОПОК ======================== */
/* Кнопка тренера уже создаётся Jitsi-модулем (id=vidTrainerBtn).
   Поскольку наш openVideoCall переопределяет window.openVideoCall,
   onclick на существующей кнопке будет вызывать нашу версию.
   Здесь — страховочная повторная вставка, если кнопки ещё нет. */
function vcInjectTrainerBtn(){
    var anchor=document.getElementById('subTrainerBtn')||document.getElementById('chtTrainerBtn')||document.getElementById('bmTrainerBtn');
    if(!anchor||document.getElementById('vidTrainerBtn')) return;
    var b=document.createElement('button');
    b.id='vidTrainerBtn'; b.className='icon-btn'; b.textContent='📹'; b.title=vt('title');
    b.style.cssText='background:rgba(79,70,229,.14);color:#4F46E5;margin-inline-start:6px;width:30px;height:30px;border-radius:8px;vertical-align:middle;';
    b.onclick=function(){
        if(typeof currentUserId!=='undefined'&&currentUserId) openVideoCall(currentUserId,'trainer');
        else if(typeof showToast==='function') showToast(vt('noClient'));
    };
    anchor.parentNode.insertBefore(b,anchor.nextSibling);
}

/* Кнопка 📹 в нижней навигации клиента */
function vcInjectClientNav(){
    var orig=window.csRenderNav;
    if(typeof orig!=='function'||window.__vcNavHook) return;
    window.__vcNavHook=true;
    window.csRenderNav=function(){
        orig.apply(this,arguments);
        try{
            var el=document.getElementById('csNav');
            if(!el||document.getElementById('csVideoNavBtn')) return;
            var moreBtn=el.querySelector('button:last-child');
            var btn=document.createElement('button');
            btn.className='mp-nav-item';
            btn.id='csVideoNavBtn';
            btn.innerHTML='<span class="mp-nav-ico">📹</span><span>'+vt('videoTab')+'</span>';
            btn.onclick=function(){
                if(typeof __clientUser!=='undefined'&&__clientUser) openVideoCall(null,'client');
            };
            el.insertBefore(btn,moreBtn);
        }catch(e){}
    };
}

/* ======================== INIT ======================== */
function vcInit(){
    vcInjectStyles();
    /* инициализируем peer с задержкой, чтобы текущий пользователь был определён */
    setTimeout(function(){
        initPeer();
        /* повторная инициализация при смене пользователя (раз в 15 сек проверяем) */
        var lastId=getMyId();
        setInterval(function(){
            var curId=getMyId();
            if(curId!==lastId){ lastId=curId; initPeer(); }
        },15000);
    },2500);
    vcInjectTrainerBtn();
    vcInjectClientNav();
    /* повторная вставка кнопки после перерисовки главного экрана */
    var origRU=window.renderUsers;
    if(typeof origRU==='function'&&!window.__vcRuHook){
        window.__vcRuHook=true;
        window.renderUsers=function(){var r=origRU.apply(this,arguments);try{vcInjectTrainerBtn();}catch(e){}return r;};
    }
    /* перевод */
    var origAL=window.applyLanguage;
    if(typeof origAL==='function'&&!window.__vcLangHook){
        window.__vcLangHook=true;
        window.applyLanguage=function(){
            var r=origAL.apply(this,arguments);
            try{
                var b=document.getElementById('vidTrainerBtn'); if(b) b.title=vt('title');
                var bt=document.getElementById('vcBell'); if(bt) bt.title=vt('title');
                var cv=document.getElementById('csVideoNavBtn');
                if(cv){ var sp=cv.querySelectorAll('span'); if(sp.length>1) sp[1].textContent=vt('videoTab'); }
            }catch(e){}
            return r;
        };
    }
    /* обработчик кнопки "Назад" на мобильных — закрывает звонок */
    window.addEventListener('popstate',function(){
        if(S.status!=='idle'){ vcCleanup(); }
    });
    /* cleanup при выгрузке */
    window.addEventListener('beforeunload',function(){
        if(S.status!=='idle'){ sendSignal('end'); try{if(peer)peer.destroy();}catch(e){} }
    });
}

if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){ setTimeout(vcInit,1200); });
} else { setTimeout(vcInit,1200); }

})();
