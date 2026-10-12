// Хранилище: всё лежит в localStorage браузера, отдельно у каждого пользователя.
window.Store = (function () {
  "use strict";

  var KEY = "wotTablet.v1";
  var data = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.maps && typeof parsed.maps === "object") return parsed;
      }
    } catch (e) { /* хранилище недоступно или данные повреждены */ }
    return { version: 1, maps: {} };
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Данные одной карты: { tactics: [...], activeTacticId }
  function map(mapId) {
    var m = data.maps[mapId];
    if (!m || !Array.isArray(m.tactics)) {
      m = data.maps[mapId] = { tactics: [], activeTacticId: null };
    }
    return m;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return { map: map, save: save, uid: uid };
})();
