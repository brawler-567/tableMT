(function () {
  "use strict";

  var screens = {
    intro: document.getElementById("screen-intro"),
    maps: document.getElementById("screen-maps"),
    tactics: document.getElementById("screen-tactics")
  };
  var grid = document.getElementById("maps-grid");
  var toast = document.getElementById("toast");
  var toastTimer = null;

  function show(name) {
    if (!screens[name]) name = "intro";
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle("active", key === name);
    });
    window.scrollTo(0, 0);
  }

  function findMap(id) {
    var num = Number(id);
    for (var i = 0; i < window.MAPS.length; i++) {
      if (window.MAPS[i].id === num) return window.MAPS[i];
    }
    return null;
  }

  // Маршруты: "" (вступление), "#maps", "#tactics/<id карты>"
  function applyRoute() {
    var parts = (location.hash.replace("#", "") || "intro").split("/");
    if (parts[0] === "tactics") {
      var map = findMap(parts[1]);
      if (!map) { go("maps"); return; }
      show("tactics");
      window.Tactics.open(map);
      return;
    }
    show(parts[0]);
  }

  function go(route) {
    var hash = route === "intro" ? "" : "#" + route;
    if (location.hash === hash) {
      applyRoute();
    } else if (hash === "") {
      history.pushState(null, "", location.pathname + location.search);
      applyRoute();
    } else {
      location.hash = hash; // сработает hashchange
    }
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("visible");
    }, 2600);
  }

  function renderMaps() {
    var frag = document.createDocumentFragment();
    window.MAPS.forEach(function (map) {
      var card = document.createElement("button");
      card.type = "button";
      card.className = "map-card";
      card.setAttribute("data-id", map.id);

      var thumb = document.createElement("div");
      thumb.className = "map-thumb";

      var img = document.createElement("img");
      img.src = map.file;
      img.alt = map.name;
      img.loading = "lazy";
      img.addEventListener("error", function () {
        thumb.classList.add("no-img");
        img.remove();
      });
      thumb.appendChild(img);

      var num = document.createElement("span");
      num.className = "map-num";
      num.textContent = map.id;
      thumb.appendChild(num);

      var name = document.createElement("div");
      name.className = "map-name";
      name.textContent = map.name;

      card.appendChild(thumb);
      card.appendChild(name);
      card.addEventListener("click", function () { go("tactics/" + map.id); });
      frag.appendChild(card);
    });
    grid.appendChild(frag);
  }

  document.getElementById("btn-start").addEventListener("click", function () { go("maps"); });
  document.getElementById("btn-back").addEventListener("click", function () { go("intro"); });
  document.getElementById("tac-back").addEventListener("click", function () { go("maps"); });
  document.getElementById("brand").addEventListener("click", function (e) {
    e.preventDefault();
    go("intro");
  });
  window.addEventListener("hashchange", applyRoute);

  window.App = { go: go, toast: showToast };

  renderMaps();
  applyRoute();
})();
