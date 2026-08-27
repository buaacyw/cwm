document.querySelectorAll('[data-placeholder]').forEach(function (link) {
  link.addEventListener('click', function (event) {
    event.preventDefault();
  });
});

function initComparePlayer(player) {
  var stage = player.querySelector('.compare-stage');
  var divider = player.querySelector('.compare-divider');
  var generated = player.querySelector('.compare-generated');
  var proxy = player.querySelector('.compare-proxy');
  var playButton = player.querySelector('.play-control');
  var progress = player.querySelector('.compare-progress');
  var time = player.querySelector('.compare-time');
  var muteButton = player.querySelector('.mute-control');
  var fullscreenButton = player.querySelector('.fullscreen-control');
  var loader = player.querySelector('.compare-loader');
  var split = Number(divider.getAttribute('aria-valuenow')) || 50;
  var draggingDivider = false;
  var frameRequest = 0;
  var loadPromise = null;
  var ready = false;

  function prepareVideo(video) {
    return new Promise(function (resolve, reject) {
      if (video.readyState >= 3) {
        resolve();
        return;
      }

      function cleanup() {
        video.removeEventListener('canplay', loaded);
        video.removeEventListener('error', failed);
      }
      function loaded() {
        cleanup();
        resolve();
      }
      function failed() {
        cleanup();
        reject(new Error('Video failed to load: ' + video.dataset.src));
      }

      video.addEventListener('canplay', loaded);
      video.addEventListener('error', failed);
      video.preload = 'auto';
      if (!video.src && video.dataset.src) video.src = video.dataset.src;
      video.load();
    });
  }

  function load() {
    if (loadPromise) return loadPromise;
    player.classList.add('loading');
    loader.disabled = true;
    loader.textContent = 'Loading video...';
    loader.setAttribute('aria-label', 'Loading video');
    loadPromise = Promise.all([prepareVideo(generated), prepareVideo(proxy)]).then(function () {
      ready = true;
      player.dataset.loaded = 'true';
      player.classList.remove('loading', 'load-error');
      player.classList.add('ready');
      playButton.disabled = false;
      muteButton.disabled = false;
      progress.disabled = false;
      updateControls();
    }).catch(function (error) {
      player.classList.remove('loading');
      player.classList.add('load-error');
      loader.disabled = true;
      loader.textContent = 'Video unavailable';
      loader.setAttribute('aria-label', 'Video unavailable');
      if (window.console) console.error(error);
      throw error;
    });
    return loadPromise;
  }

  function duration() {
    var values = [generated.duration, proxy.duration].filter(function (value) {
      return Number.isFinite(value) && value > 0;
    });
    return values.length ? Math.min.apply(Math, values) : 0;
  }

  function formatTime(value) {
    if (!Number.isFinite(value)) value = 0;
    var minutes = Math.floor(value / 60);
    var seconds = Math.floor(value % 60);
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  function updateControls() {
    var total = duration();
    var current = Math.min(generated.currentTime || 0, total || Infinity);
    time.textContent = formatTime(current) + ' / ' + formatTime(total);
    progress.value = total ? Math.round((current / total) * 1000) : 0;
  }

  function updatePlayState() {
    var playing = !generated.paused && !generated.ended;
    player.classList.toggle('playing', playing);
    playButton.querySelector('span').textContent = playing ? '\u275A\u275A' : '\u25B6';
    playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playButton.title = playing ? 'Pause' : 'Play';
  }

  function syncFollower(force) {
    if (!ready || proxy.readyState < 1 || generated.readyState < 1) return;
    var drift = proxy.currentTime - generated.currentTime;
    if (force || Math.abs(drift) > 0.12) {
      proxy.currentTime = Math.min(generated.currentTime, duration() || generated.currentTime);
      proxy.playbackRate = 1;
    } else if (Math.abs(drift) > 0.025) {
      proxy.playbackRate = Math.max(0.96, Math.min(1.04, 1 - drift * 0.45));
    } else {
      proxy.playbackRate = 1;
    }
  }

  function frameLoop() {
    updateControls();
    syncFollower(false);
    if (!generated.paused && !generated.ended) {
      frameRequest = window.requestAnimationFrame(frameLoop);
    }
  }

  function playBoth() {
    if (!ready) return;
    var total = duration();
    if (total && generated.currentTime >= total - 0.04) {
      generated.currentTime = 0;
      proxy.currentTime = 0;
    }
    syncFollower(true);
    Promise.allSettled([generated.play(), proxy.play()]).then(function () {
      updatePlayState();
      window.cancelAnimationFrame(frameRequest);
      frameLoop();
    });
  }

  function pauseBoth() {
    generated.pause();
    proxy.pause();
    proxy.playbackRate = 1;
    window.cancelAnimationFrame(frameRequest);
    updateControls();
    updatePlayState();
  }

  function togglePlayback() {
    if (generated.paused || generated.ended) playBoth();
    else pauseBoth();
  }

  function setSplit(clientX) {
    var box = stage.getBoundingClientRect();
    split = Math.max(0, Math.min(100, ((clientX - box.left) / box.width) * 100));
    player.style.setProperty('--split', split + '%');
    divider.setAttribute('aria-valuenow', Math.round(split));
  }

  divider.addEventListener('pointerdown', function (event) {
    draggingDivider = true;
    divider.setPointerCapture(event.pointerId);
    setSplit(event.clientX);
    event.preventDefault();
    event.stopPropagation();
  });

  divider.addEventListener('pointermove', function (event) {
    if (draggingDivider) setSplit(event.clientX);
  });

  ['pointerup', 'pointercancel'].forEach(function (type) {
    divider.addEventListener(type, function (event) {
      draggingDivider = false;
      try { divider.releasePointerCapture(event.pointerId); } catch (_) {}
    });
  });

  divider.addEventListener('keydown', function (event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    split = Math.max(0, Math.min(100, split + (event.key === 'ArrowRight' ? 2 : -2)));
    player.style.setProperty('--split', split + '%');
    divider.setAttribute('aria-valuenow', Math.round(split));
    event.preventDefault();
  });

  playButton.addEventListener('click', togglePlayback);

  progress.addEventListener('input', function () {
    var total = duration();
    if (!ready || !total) return;
    var target = total * (+progress.value / 1000);
    generated.currentTime = target;
    proxy.currentTime = target;
    updateControls();
  });

  muteButton.addEventListener('click', function () {
    var muted = !generated.muted;
    generated.muted = muted;
    proxy.muted = muted;
    muteButton.querySelector('span').textContent = muted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
    muteButton.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    muteButton.title = muted ? 'Unmute' : 'Mute';
  });

  loader.addEventListener('click', function (event) {
    event.stopPropagation();
    if (player.classList.contains('gallery-player')) prioritizeGalleryLoad(player);
    load().catch(function () {});
  });

  fullscreenButton.addEventListener('click', function () {
    if (player.classList.contains('gallery-player')) {
      loadGalleryPosters(player);
      prioritizeGalleryLoad(player);
    }
    load().catch(function () {});
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return;
    }
    var enter = player.requestFullscreen || player.webkitRequestFullscreen;
    if (enter) enter.call(player);
  });

  function updateFullscreenState() {
    var active = document.fullscreenElement === player || document.webkitFullscreenElement === player;
    fullscreenButton.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    fullscreenButton.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
  }

  document.addEventListener('fullscreenchange', updateFullscreenState);
  document.addEventListener('webkitfullscreenchange', updateFullscreenState);
  generated.addEventListener('play', updatePlayState);
  generated.addEventListener('pause', updatePlayState);
  generated.addEventListener('ended', pauseBoth);
  generated.addEventListener('seeked', function () { syncFollower(true); updateControls(); });
  updateControls();
  updatePlayState();

  return { load: load, pause: pauseBoth };
}

function initAgentControlPlayer(player) {
  var video = player.querySelector('.agent-control-video');
  var loader = player.querySelector('.compare-loader');
  var loadPromise = null;

  function load() {
    if (loadPromise) return loadPromise;
    player.classList.add('loading');
    loader.disabled = true;
    loader.textContent = 'Loading video...';
    loader.setAttribute('aria-label', 'Loading video');

    loadPromise = new Promise(function (resolve, reject) {
      if (video.readyState >= 3) {
        resolve();
        return;
      }

      function cleanup() {
        video.removeEventListener('canplay', loaded);
        video.removeEventListener('error', failed);
      }
      function loaded() {
        cleanup();
        resolve();
      }
      function failed() {
        cleanup();
        reject(new Error('Video failed to load: ' + video.dataset.src));
      }

      video.addEventListener('canplay', loaded);
      video.addEventListener('error', failed);
      video.preload = 'auto';
      if (!video.src && video.dataset.src) video.src = video.dataset.src;
      video.load();
    }).then(function () {
      player.dataset.loaded = 'true';
      player.classList.remove('loading', 'load-error');
      player.classList.add('ready');
    }).catch(function (error) {
      player.classList.remove('loading');
      player.classList.add('load-error');
      loader.disabled = true;
      loader.textContent = 'Video unavailable';
      loader.setAttribute('aria-label', 'Video unavailable');
      if (window.console) console.error(error);
      throw error;
    });

    return loadPromise;
  }

  function pause() {
    video.pause();
  }

  loader.addEventListener('click', function (event) {
    event.stopPropagation();
    prioritizeGalleryLoad(player);
    load().catch(function () {});
  });

  return { load: load, pause: pause };
}

document.querySelectorAll('.gallery-item').forEach(function (item) {
  var stage = item.querySelector('.gallery-compare');
  var rgb = item.querySelector('.gallery-rgb');
  var proxy = item.querySelector('.gallery-proxy');
  var rgbLabel = item.querySelector('.gallery-label-rgb');
  var proxyLabel = item.querySelector('.gallery-label-proxy');
  var divider = item.querySelector('.gallery-divider');

  loadGalleryPosters(item);
  item.classList.add('compare-player', 'gallery-player');
  item.style.setProperty('--split', '90%');
  stage.classList.add('compare-stage');
  rgb.classList.add('compare-video', 'compare-generated');
  proxy.classList.add('compare-video', 'compare-proxy');
  rgbLabel.classList.add('compare-label', 'generated-label');
  proxyLabel.classList.add('compare-label', 'proxy-label');
  divider.className = 'compare-divider';
  divider.setAttribute('role', 'slider');
  divider.setAttribute('tabindex', '0');
  divider.setAttribute('aria-label', 'Reveal RGB or proxy video');
  divider.setAttribute('aria-valuemin', '0');
  divider.setAttribute('aria-valuemax', '100');
  divider.setAttribute('aria-valuenow', '90');
  divider.innerHTML = '<span class="compare-grip" aria-hidden="true">&#8596;</span>';
  stage.insertAdjacentHTML('beforeend',
    '<button class="compare-loader" type="button" aria-label="Load video" aria-live="polite">Load video</button>' +
    '<div class="compare-controls">' +
      '<button class="compare-control play-control" type="button" disabled aria-label="Play" title="Play"><span aria-hidden="true">&#9654;</span></button>' +
      '<input class="compare-progress" type="range" disabled min="0" max="1000" value="0" step="1" aria-label="Video progress">' +
      '<span class="compare-time">00:00 / 00:00</span>' +
      '<button class="compare-control mute-control" type="button" disabled aria-label="Unmute" title="Unmute"><span aria-hidden="true">&#128263;</span></button>' +
      '<button class="compare-control fullscreen-control" type="button" aria-label="Enter fullscreen" title="Enter fullscreen"><span aria-hidden="true">&#9974;</span></button>' +
    '</div>'
  );
});

function loadGalleryPosters(player) {
  player.querySelectorAll('.gallery-rgb, .gallery-proxy').forEach(function (video) {
    if (video.poster) return;
    var source = video.dataset.src || '';
    var match = source.match(/\/gallery_final\/(rgb|proxy)\/(\d{3})\.mp4(?:[?#]|$)/);
    if (!match) return;
    video.poster = 'static/posters/gallery/' + match[1] + '/' + match[2] + '.webp';
  });
}

var comparePlayerElements = Array.prototype.slice.call(
  document.querySelectorAll('.compare-player')
);
var comparePlayers = comparePlayerElements.map(initComparePlayer);

var galleryLoadQueue = [];
var queuedGalleryLoads = new Map();
var activeGalleryLoads = 0;
var maxConcurrentGalleryLoads = 1;
var priorityVideo = document.querySelector('[data-priority-video]');
var priorityVideoReady = !priorityVideo || priorityVideo.readyState >= 3;

function sortGalleryLoadQueue() {
  galleryLoadQueue.sort(function (a, b) { return a.priority - b.priority; });
}

function drainGalleryLoadQueue() {
  if (!priorityVideoReady || activeGalleryLoads >= maxConcurrentGalleryLoads || !galleryLoadQueue.length) return;

  var item = galleryLoadQueue.shift();
  queuedGalleryLoads.delete(item.player);
  if (item.player.dataset.loaded === 'true') {
    drainGalleryLoadQueue();
    return;
  }

  activeGalleryLoads += 1;
  item.controller.load().catch(function () {}).finally(function () {
    activeGalleryLoads -= 1;
    drainGalleryLoadQueue();
  });
}

function releaseGalleryLoadQueue() {
  if (priorityVideoReady) return;
  priorityVideoReady = true;
  drainGalleryLoadQueue();
}

if (priorityVideo && !priorityVideoReady) {
  ['canplay', 'error'].forEach(function (eventName) {
    priorityVideo.addEventListener(eventName, releaseGalleryLoadQueue, { once: true });
  });
}

function queueGalleryLoad(player, controller, priority) {
  if (player.dataset.loaded === 'true') return;

  var queued = queuedGalleryLoads.get(player);
  if (queued) {
    queued.priority = Math.min(queued.priority, priority);
    sortGalleryLoadQueue();
    return;
  }

  var item = { player: player, controller: controller, priority: priority };
  queuedGalleryLoads.set(player, item);
  galleryLoadQueue.push(item);
  sortGalleryLoadQueue();
  drainGalleryLoadQueue();
}

function prioritizeGalleryLoad(player) {
  var queued = queuedGalleryLoads.get(player);
  if (!queued) return;
  queuedGalleryLoads.delete(player);
  var position = galleryLoadQueue.indexOf(queued);
  if (position >= 0) galleryLoadQueue.splice(position, 1);
}

var agentControlElements = Array.prototype.slice.call(
  document.querySelectorAll('.agent-control-player')
);
var agentControlPlayers = agentControlElements.map(initAgentControlPlayer);
var queuedPlayerControllers = new Map();
comparePlayerElements.forEach(function (player, index) {
  queuedPlayerControllers.set(player, comparePlayers[index]);
});
agentControlElements.forEach(function (player, index) {
  queuedPlayerControllers.set(player, agentControlPlayers[index]);
});
var queuedPlayerElements = agentControlElements.concat(comparePlayerElements);

if ('IntersectionObserver' in window) {
  var preloadObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var controller = queuedPlayerControllers.get(entry.target);
      if (!controller) return;
      queueGalleryLoad(entry.target, controller, Math.max(0, entry.boundingClientRect.top));
    });
  }, { rootMargin: '500px 0px', threshold: 0.01 });

  var visibilityObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) return;
      var controller = queuedPlayerControllers.get(entry.target);
      if (controller) controller.pause();
    });
  }, { threshold: 0.01 });

  queuedPlayerElements.forEach(function (player) {
    var controller = queuedPlayerControllers.get(player);
    visibilityObserver.observe(player);

    if (!player.classList.contains('gallery-player') && !player.classList.contains('agent-control-player')) {
      controller.load().catch(function () {});
      return;
    }

    preloadObserver.observe(player);
    ['pointerenter', 'focusin'].forEach(function (eventName) {
      player.addEventListener(eventName, function () {
        queueGalleryLoad(player, controller, -100);
      }, { passive: true });
    });
  });
} else {
  queuedPlayerElements.forEach(function (player, index) {
    var controller = queuedPlayerControllers.get(player);
    if (player.classList.contains('gallery-player') || player.classList.contains('agent-control-player')) {
      queueGalleryLoad(player, controller, index);
    } else {
      controller.load().catch(function () {});
    }
  });
}

document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    comparePlayers.concat(agentControlPlayers).forEach(function (controller) { controller.pause(); });
  }
});

document.querySelectorAll('.media-wipe').forEach(function (wipe) {
  var dragging = false;
  var videos = wipe.querySelectorAll('video');

  function setSplit(clientX) {
    var box = wipe.getBoundingClientRect();
    var ratio = (clientX - box.left) / box.width;
    wipe.style.setProperty('--split', Math.max(0, Math.min(1, ratio)) * 100 + '%');
  }

  wipe.addEventListener('pointerdown', function (event) {
    dragging = true;
    wipe.setPointerCapture(event.pointerId);
    setSplit(event.clientX);
    event.preventDefault();
  });

  wipe.addEventListener('pointermove', function (event) {
    if (dragging) setSplit(event.clientX);
  });

  ['pointerup', 'pointercancel'].forEach(function (type) {
    wipe.addEventListener(type, function (event) {
      dragging = false;
      try { wipe.releasePointerCapture(event.pointerId); } catch (_) {}
    });
  });

  if (videos.length === 2) {
    videos[0].addEventListener('timeupdate', function () {
      if (Math.abs(videos[0].currentTime - videos[1].currentTime) > 0.12) {
        videos[1].currentTime = videos[0].currentTime;
      }
    });
  }
});
