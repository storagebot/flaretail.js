/**
 * BriteGrid Utility Library
 * Copyright © 2012 BriteGrid. All rights reserved.
 * Using: ECMAScript Harmony
 * Requires: Firefox 22
 */

'use strict';

let BriteGrid = BriteGrid || {};
BriteGrid.util = {};

/* --------------------------------------------------------------------------
 * Event
 * -------------------------------------------------------------------------- */

BriteGrid.util.event = {};

BriteGrid.util.event.ignore = function (event) {
  event.preventDefault();
  event.stopPropagation();
  return false;
};

// This function allows to set multiple event listeners as once
BriteGrid.util.event.bind = function (that, $target, types, use_capture = false, unbind = false) {
  if (!$target) {
    return false;
  }

  for (let type of types) {
    if (!that['on' + type]) {
      continue; // No such handler
    }

    if (unbind) {
      $target.removeEventListener(type, that, use_capture);
    } else {
      $target.addEventListener(type, that, use_capture);
    }
  }

  return true;
};

BriteGrid.util.event.unbind = function (that, $target, types, use_capture = false) {
  this.bind(that, $target, types, use_capture, true);
};

/* --------------------------------------------------------------------------
 * Request
 * -------------------------------------------------------------------------- */

BriteGrid.util.request = {};

BriteGrid.util.request.build_query = query => {
  let fields = new Set();

  for (let [key, value] of Iterator(query)) {
    for (let val of (Array.isArray(value) ? value : [value])) {
      fields.add(encodeURIComponent(key) + '=' + encodeURIComponent(val));
    }
  }

  return '?' + [...fields].join('&');
};

/* --------------------------------------------------------------------------
 * Preferences
 * -------------------------------------------------------------------------- */

BriteGrid.util.prefs = {};

/* --------------------------------------------------------------------------
 * Storage
 * -------------------------------------------------------------------------- */

BriteGrid.util.Storage = function () {
  let req = this.request = indexedDB.open('MyTestDatabase', 1),
      db = this.db = null;
  req.addEventListener('error', event => {});
  req.addEventListener('success', event => db = request.result);
  db.addEventListener('error', event => {});
};

/* --------------------------------------------------------------------------
 * App
 * -------------------------------------------------------------------------- */

BriteGrid.util.app = {};

BriteGrid.util.app.can_install = (manifest, callback) => {
  let apps = navigator.mozApps;
  if (!apps) {
    callback(false);
    return;
  }

  let request = apps.checkInstalled(manifest);
  request.addEventListener('success', event => {
    // IndexedDB has been deactivated in WebAppRT on Firefox 24 and earlier versions (Bug 827346)
    let idb_enabled = navigator.userAgent.match(/Firefox\/(\d+)/) && parseInt(RegExp.$1) >= 25;
    callback(!request.result && idb_enabled);
  });
  request.addEventListener('error', event => callback(false));
};

BriteGrid.util.app.install = (manifest, callback) => {
  let request = navigator.mozApps.install(manifest);
  request.addEventListener('success', event => callback(event));
  request.addEventListener('error', event => callback(event));
};

BriteGrid.util.app.fullscreen_enabled = () => {
  return document.fullscreenEnabled || document.mozFullScreenEnabled;
}

BriteGrid.util.app.toggle_fullscreen = () => {
  if (document.fullscreenElement === null || document.mozFullScreenElement === null) {
    if (document.body.requestFullscreen) {
      document.body.requestFullscreen();
    } else if (document.body.mozRequestFullScreen) {
      document.body.mozRequestFullScreen();
    }
  } else {
    if (document.cancelFullScreen) {
      document.cancelFullScreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    }
  }
};

BriteGrid.util.app.auth_notification = () => {
  Notification.requestPermission(permission => {});
};

BriteGrid.util.app.show_notification = (title, options = {}) => {
  new Notification(title, {
    dir: options.dir || 'auto',
    lang: options.lang || 'en-US',
    body: options.body || '',
    tag: options.tag || '',
    icon: options.icon || ''
  });
};

/* --------------------------------------------------------------------------
 * Theme
 * -------------------------------------------------------------------------- */

BriteGrid.util.theme = {};

Object.defineProperties(BriteGrid.util.theme, {
  'list': {
    enumerable : true,
    get: () => document.styleSheetSets
  },
  'default': {
    enumerable : true,
    get: () => document.preferredStyleSheetSet
  },
  'selected': {
    enumerable : true,
    // A regression since Firefox 20: selectedStyleSheetSet returns empty (Bug 894874)
    get: () => document.selectedStyleSheetSet ||
               document.lastStyleSheetSet || document.preferredStyleSheetSet,
    set: name => document.selectedStyleSheetSet = name
  }
});

BriteGrid.util.theme.preload_images = callback => {
  let pattern = 'url\\("(.+?)"\\)',
      images = new Set();

  for (let [i, sheet] of Iterator(document.styleSheets)) {
    for (let [i, rule] of Iterator(sheet.cssRules)) {
      let match = rule.style && rule.style.backgroundImage.match(RegExp(pattern, 'g'));
      if (!match) {
        continue;
      }
      // Support for multiple background
      for (let m of match) {
        let src = m.match(RegExp(pattern))[1];
        if (!images.has(src)) {
          images.add(src);
        }
      }
    }
  }

  let total = images.size,
      loaded = 0;

  for (let src of images) {
    let image = new Image();
    image.addEventListener('load', event => {
      loaded++;
      if (loaded === total) {
        callback();
      }
    });
    image.src = src;
  }
};

/* --------------------------------------------------------------------------
 * Network
 * -------------------------------------------------------------------------- */

BriteGrid.util.network = {};

/* --------------------------------------------------------------------------
 * History
 * -------------------------------------------------------------------------- */

BriteGrid.util.history = {};

/* --------------------------------------------------------------------------
 * Localization
 * -------------------------------------------------------------------------- */

BriteGrid.util.l10n = {};

/* --------------------------------------------------------------------------
 * Style
 * -------------------------------------------------------------------------- */

BriteGrid.util.style = {};

BriteGrid.util.style.get = ($element, property) => {
  return window.getComputedStyle($element, null).getPropertyValue(property);
};

/* --------------------------------------------------------------------------
 * Object
 * -------------------------------------------------------------------------- */

BriteGrid.util.object = {};

BriteGrid.util.object.clone = obj => JSON.parse(JSON.stringify(obj));

/* --------------------------------------------------------------------------
 * Array
 * -------------------------------------------------------------------------- */

BriteGrid.util.array = {};

BriteGrid.util.array.clone = array => Array.slice(array);

/* --------------------------------------------------------------------------
 * String
 * -------------------------------------------------------------------------- */

BriteGrid.util.string = {};

BriteGrid.util.string.sanitize = str => {
  let chars = new Map(Iterator({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;'
  }));

  return str.replace(/./g, match => chars.get(match) || match);
};
