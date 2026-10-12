(function () {
  "use strict";

  var screens = {
    intro: document.getElementById("screen-intro"),
    maps: document.getElementById("screen-maps")
  };
  var grid = document.getElementById("maps-grid");
  var toast = document.getElementById("toast");
  var toastTimer = null;

  // Выбранная карта (понадобится на экране тактик)
  window.state = { selectedMap: null };

  function show(name) {
    if (!screens[name]) name = "intro";
    Object.keys(screens).forEach(function (key) {
      screens[key].classList.toggle("active", key === name);
    });
    window.scrollTo(0, 0);
  }

  function go(name) {
    var hash = name === "intro" ? "" : "#" + name;
    if (location.hash === hash || (hash === "" && location.hash === "")) {
      show(name);
    } else if (hash === "") {
      history.pushState(null, "", location.pathname + location.search);
      show(name);
    } else {
      location.hash = hash; // сработает hashchange
    }
  }

  function currentFromHash() {
    return location.hash.replace("#", "") || "intro";
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
      card.addEventListener("click", function () {
        window.state.selectedMap = map;
        showToast("Выбрана: " + map.name + ". Экран тактик — следующий шаг.");
      });
      frag.appendChild(card);
    });
    grid.appendChild(frag);
  }

  document.getElementById("btn-start").addEventListener("click", function () { go("maps"); });
  document.getElementById("btn-back").addEventListener("click", function () { go("intro"); });
  document.getElementById("brand").addEventListener("click", function (e) {
    e.preventDefault();
    go("intro");
  });
  window.addEventListener("hashchange", function () { show(currentFromHash()); });

  renderMaps();
  show(currentFromHash());
})();
