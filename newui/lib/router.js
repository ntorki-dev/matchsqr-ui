
/*! Match Square - Tiny Hash Router v0.1 (safe placeholder) */
(function (global) {
  'use strict';

  function TinyRouter(options) {
    this.routes = new Map();
    this.notFound = null;
    this.beforeEach = null;
    this.rootEl = null;
    this.started = false;
    this.options = options || {};
  }

  TinyRouter.prototype.mount = function mount(selector) {
    this.rootEl = document.querySelector(selector);
    // If the mount node doesn't exist yet, router will no-op safely.
    return this;
  };

  TinyRouter.prototype.add = function add(path, handler) {
    this.routes.set(path, handler);
    return this;
  };

  TinyRouter.prototype.setNotFound = function setNotFound(handler) {
    this.notFound = handler;
    return this;
  };

  TinyRouter.prototype.navigate = function navigate(path) {
    if (location.hash !== '#' + path) {
      location.hash = path;
    } else {
      this._render(path);
    }
  };

  TinyRouter.prototype._getPath = function _getPath() {
    return location.hash.replace(/^#/, '') || '/';
  };

  TinyRouter.prototype._render = async function _render(path) {
    try {
      const handler = this.routes.get(path);
      if (!handler) {
        if (typeof this.notFound === 'function') {
          await this.notFound({ path });
        }
        return;
      }
      if (typeof this.beforeEach === 'function') {
        const ok = await this.beforeEach({ path });
        if (ok === false) return;
      }
      if (this.rootEl) {
        // Ensure the mount node is visible only for SPA screens
        this.rootEl.removeAttribute('hidden');
      }
      await handler({ path, el: this.rootEl });
    } catch (err) {
      console.error('Router render error:', err);
    }
  };

  TinyRouter.prototype.start = function start() {
    if (this.started) return this;
    this.started = true;
    window.addEventListener('hashchange', () => this._render(this._getPath()));
    // First render
    this._render(this._getPath());
    return this;
  };

  TinyRouter.prototype.guards = function guards(fn) {
    this.beforeEach = fn;
    return this;
  };

  // Expose
  global.MatchSquareRouter = TinyRouter;
})(window);
