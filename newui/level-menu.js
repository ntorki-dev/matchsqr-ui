// level-menu.js
// Isolated UI helper for question level selection and indicator

export const LevelMenu = {
  __outsideHandlerInstalled: false,

  /**
   * Mounts the top bar content for the host:
   * - Level dropdown (auto / simple / medium / deep)
   * - End game & analyze button
   *
   * @param {Object} opts
   * @param {HTMLElement} opts.container
   * @param {'auto'|'manual'} opts.mode
   * @param {'simple'|'medium'|'deep'} opts.level
   * @param {(state:{mode:string,level:string})=>void} opts.onChange
   * @param {()=>Promise<void>|()=>void} opts.onEndGame
   */
  mountTopBar(opts) {
    const container = opts && opts.container;
    if (!container) return;

    const mode = (opts.mode === 'manual' || opts.mode === 'auto') ? opts.mode : 'auto';
    const level = (opts.level === 'medium' || opts.level === 'deep' || opts.level === 'simple')
      ? opts.level
      : 'simple';

    const label = this._labelFor(mode, level);

    container.innerHTML =
      '<div class="top-actions-inner">' +
        '<div class="level-menu" id="msLevelMenu" data-selected="' + this._escape(label) + '">' +
          '<button class="level-menu-toggle" type="button">' +
            '<span class="level-menu-label">Level:</span>' +
            '<span class="level-menu-value">' + this._escape(label) + '</span>' +
            '<span class="level-menu-icon"></span>' +
          '</button>' +
          '<ul class="level-menu-list">' +
            '<li class="level-menu-item" data-mode="auto" data-level="" data-value="Auto">Auto</li>' +
            '<li class="level-menu-item" data-mode="manual" data-level="simple" data-value="Simple: Icebreaker">Simple: Icebreaker</li>' +
            '<li class="level-menu-item" data-mode="manual" data-level="medium" data-value="Medium: Opening up">Medium: Opening up</li>' +
            '<li class="level-menu-item" data-mode="manual" data-level="deep" data-value="Deep: Honest &amp; real">Deep: Honest &amp; real</li>' +
          '</ul>' +
        '</div>' +
        '<button id="endAnalyzeTop" class="btn danger">End game &amp; analyze</button>' +
      '</div>';

    const menu = container.querySelector('#msLevelMenu');
    const toggle = menu ? menu.querySelector('.level-menu-toggle') : null;
    const valueSpan = menu ? menu.querySelector('.level-menu-value') : null;
    const list = menu ? menu.querySelector('.level-menu-list') : null;
    const items = list ? Array.from(list.querySelectorAll('.level-menu-item')) : [];

    if (toggle && valueSpan && list && items.length) {
      const closeAllMenus = () => {
        const openMenus = document.querySelectorAll('.level-menu.is-open');
        openMenus.forEach(el => el.classList.remove('is-open'));
      };

      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = menu.classList.contains('is-open');
        closeAllMenus();
        if (!isOpen) {
          menu.classList.add('is-open');
        }
      });

      list.addEventListener('click', (e) => {
        const item = e.target.closest('.level-menu-item');
        if (!item) return;
        e.stopPropagation();

        const value = item.getAttribute('data-value') || (item.textContent || '').trim();
        if (valueSpan) valueSpan.textContent = value;
        items.forEach(i => i.classList.remove('is-selected'));
        item.classList.add('is-selected');
        menu.setAttribute('data-selected', value);

        const modeAttr = (item.getAttribute('data-mode') || '').toLowerCase();
        const levelAttr = (item.getAttribute('data-level') || '').toLowerCase();

        let newMode = 'auto';
        let newLevel = 'simple';

        if (modeAttr === 'auto') {
          newMode = 'auto';
          newLevel = 'simple';
        } else {
          newMode = 'manual';
          if (levelAttr === 'medium' || levelAttr === 'deep') {
            newLevel = levelAttr;
          } else {
            newLevel = 'simple';
          }
        }

        try {
          if (typeof opts.onChange === 'function') {
            opts.onChange({ mode: newMode, level: newLevel });
          }
        } catch (e2) {
          console.error('[LevelMenu] onChange error', e2);
        }

        menu.classList.remove('is-open');
      });

      if (!this.__outsideHandlerInstalled) {
        this.__outsideHandlerInstalled = true;
        document.addEventListener('click', () => {
          const openMenus = document.querySelectorAll('.level-menu.is-open');
          openMenus.forEach(el => el.classList.remove('is-open'));
        });
      }

      // Ensure current selection item is highlighted
      const selectedText = label;
      items.forEach(i => {
        const v = i.getAttribute('data-value') || (i.textContent || '').trim();
        if (v === selectedText) {
          i.classList.add('is-selected');
        }
      });
    }

    const endBtn = container.querySelector('#endAnalyzeTop');
    if (endBtn && typeof opts.onEndGame === 'function') {
      endBtn.addEventListener('click', async () => {
        try {
          await opts.onEndGame();
        } catch (e) {
          console.error('[LevelMenu] onEndGame error', e);
        }
      });
    }
  },

  /**
   * Updates or creates the level indicator circle on the question card.
   *
   * @param {Object} opts
   * @param {HTMLElement|null} opts.cardElement
   * @param {string|undefined|null} opts.questionLevel  // 'simple' | 'medium' | 'deep'
   * @param {'auto'|'manual'} opts.mode
   */
  updateIndicator(opts) {
    const card = opts && opts.cardElement;
    if (!card) return;

    const lvlRaw = opts && opts.questionLevel;
    if (!lvlRaw) {
      const old = card.querySelector('.card-level-indicator');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      return;
    }

    const level = String(lvlRaw).toLowerCase();
    let indicator = card.querySelector('.card-level-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'card-level-indicator';
      card.appendChild(indicator);
      const style = card.style;
      if (!style.position || style.position === 'static') {
        style.position = 'relative';
      }
    }

    indicator.classList.remove(
      'card-level-simple',
      'card-level-medium',
      'card-level-deep',
      'card-level-auto'
    );

    if (level === 'medium') {
      indicator.classList.add('card-level-medium');
    } else if (level === 'deep') {
      indicator.classList.add('card-level-deep');
    } else {
      indicator.classList.add('card-level-simple');
    }

    const mode = (opts && opts.mode === 'manual') ? 'manual' : 'auto';
    if (mode === 'auto') {
      indicator.classList.add('card-level-auto');
    }
  },

  _labelFor(mode, level) {
    if (mode === 'manual') {
      if (level === 'medium') return 'Medium: Opening up';
      if (level === 'deep') return 'Deep: Honest & real';
      return 'Simple: Icebreaker';
    }
    return 'Auto';
  },

  _escape(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
};
