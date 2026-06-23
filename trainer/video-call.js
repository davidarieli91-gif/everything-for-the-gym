/* ============================================================
   video-call.js  —  STUB (safe placeholder)
   ------------------------------------------------------------
   Этот файл является безопасной заглушкой, заменяющей
   отсутствующий внешний video-call.js (BUG-001 из аудита).

   Оригинальный файл не был найден в каталоге приложения,
   поэтому любой код, ожидающий функции видеозвонков, приводил
   к ReferenceError и поломке UI.

   Стратегия заглушки:
   • Определяем все ожидаемые функции как безопасные no-op
   • При вызове показываем пользователю понятное уведомление
     (через showToast если доступно, иначе alert)
   • Логируем вызовы в консоль для отладки
   • Не выбрасываем ошибок — приложение продолжает работать

   Когда появится реальная реализация WebRTC/PeerJS,
   замените этот файл на полноценную версию.
   ============================================================ */
(function () {
    'use strict';

    var VC_STUB = true;
    var VC_NOTICE = 'Видеозвонки временно недоступны. Функция в разработке.';

    function notify(label) {
        try {
            if (typeof window.showToast === 'function') {
                window.showToast('🎥 ' + (label || VC_NOTICE));
            } else if (typeof console !== 'undefined') {
                console.warn('[VideoCall stub]', label || VC_NOTICE);
            }
        } catch (e) { /* silent */ }
    }

    function noop(label) {
        return function () {
            console.log('[VideoCall stub] called:', label, 'args:', Array.prototype.slice.call(arguments));
            notify();
            return false;
        };
    }

    /* === Публичный API видеозвонков ===
       Имена функций охватывают все вероятные варианты,
       которые могут встретиться во внешнем/будущем коде. */
    var api = {
        startVideoCall: noop('startVideoCall'),
        endVideoCall: noop('endVideoCall'),
        initVideoCall: noop('initVideoCall'),
        acceptVideoCall: noop('acceptVideoCall'),
        declineVideoCall: noop('declineVideoCall'),
        toggleMute: noop('toggleMute'),
        toggleCamera: noop('toggleCamera'),
        toggleScreenShare: noop('toggleScreenShare'),
        isVideoCallActive: function () { return false; },
        getCallState: function () { return 'unavailable'; },
        // Поддержка объекта-инстанса если кто-то ожидает new
        VideoCall: function () {
            this.start = noop('VideoCall.start');
            this.end = noop('VideoCall.end');
            this.mute = noop('VideoCall.mute');
            this.unmute = noop('VideoCall.unmute');
            this.shareScreen = noop('VideoCall.shareScreen');
            this.stopScreenShare = noop('VideoCall.stopScreenShare');
            return this;
        }
    };

    // Экспортируем в window все ключи как camelCase
    Object.keys(api).forEach(function (key) {
        if (typeof window[key] === 'undefined') {
            window[key] = api[key];
        } else {
            console.warn('[VideoCall stub] window.' + key + ' already defined, skipping');
        }
    });

    // Пространство имён videoCall.* на случай вызовов через объект
    if (typeof window.videoCall === 'undefined') {
        window.videoCall = {
            start: noop('videoCall.start'),
            end: noop('videoCall.end'),
            accept: noop('videoCall.accept'),
            decline: noop('videoCall.decline'),
            mute: noop('videoCall.mute'),
            unmute: noop('videoCall.unmute'),
            toggleCamera: noop('videoCall.toggleCamera'),
            shareScreen: noop('videoCall.shareScreen'),
            stopScreenShare: noop('videoCall.stopScreenShare'),
            isActive: function () { return false; },
            state: function () { return 'unavailable'; }
        };
    }

    // Опционально: сигнал готовности для других модулей
    window.__videoCallReady = true;
    window.__videoCallStub = true;

    console.log('[VideoCall stub] initialized — все функции являются безопасными no-op');
})();
