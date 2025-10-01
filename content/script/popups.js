function showToast(message, options = {}) {

    if (options.red) {
        window.dispatchEvent(new CustomEvent('popUpBad'));
    } else {
        window.dispatchEvent(new CustomEvent('popUp'));
    }
    const root = document.getElementById('immersive-toasts');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'iu-toast';
    if (options.red) el.classList.add('iu-toast-red');
    el.innerHTML = `<div style="flex:1">${message}</div><button class="iu-close" title="Dismiss">✕</button>`;
    root.appendChild(el);

    const closeBtn = el.querySelector('.iu-close');
    let removed = false;
    const remove = () => { if (removed) return; removed = true; try { el.remove(); } catch(e){} };
    closeBtn.onclick = remove;

    const duration = (typeof options.duration === 'number') ? options.duration : 3500;
    if (duration > 0) setTimeout(remove, duration);

    return { remove };
  }

  function showConfirm(message, opts = {}) {
    // returns Promise<boolean>
    return new Promise(resolve => {
      const modal = document.getElementById('immersive-modal');
      const titleEl = document.getElementById('iu-title');
      const msgEl = document.getElementById('iu-message');
      const btnConfirm = document.getElementById('iu-confirm');
      const btnCancel = document.getElementById('iu-cancel');

      titleEl.textContent = opts.title || 'Confirm';
      msgEl.textContent = message;
      btnConfirm.textContent = opts.confirmText || 'OK';
      btnCancel.textContent = opts.cancelText || 'Cancel';

      function cleanup() {
        modal.classList.add('iu-hidden');
        btnConfirm.removeEventListener('click', onConfirm);
        btnCancel.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey);
      }
      function onConfirm() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }
      function onKey(e) {
        if (e.key === 'Escape') { onCancel(); }
        if (e.key === 'Enter') { onConfirm(); }
      }

      btnConfirm.addEventListener('click', onConfirm);
      btnCancel.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);

      // show and focus confirm button
      modal.classList.remove('iu-hidden');
      btnConfirm.focus();
    });
  }

  function showAlert(message, opts = {}) {
    // One-button modal. Returns Promise when dismissed.
    return new Promise(resolve => {
      const modal = document.getElementById('immersive-modal');
      const titleEl = document.getElementById('iu-title');
      const msgEl = document.getElementById('iu-message');
      const btnConfirm = document.getElementById('iu-confirm');
      const btnCancel = document.getElementById('iu-cancel');

      titleEl.textContent = opts.title || 'Notice';
      msgEl.textContent = message;
      btnConfirm.textContent = opts.okText || 'OK';
      btnCancel.style.display = 'none';

      function cleanup() {
        modal.classList.add('iu-hidden');
        btnConfirm.removeEventListener('click', onOk);
        document.removeEventListener('keydown', onKey);
        btnCancel.style.display = ''; // restore
      }
      function onOk() { cleanup(); resolve(); }
      function onKey(e) { if (e.key === 'Enter' || e.key === 'Escape') { onOk(); } }

      btnConfirm.addEventListener('click', onOk);
      document.addEventListener('keydown', onKey);
      modal.classList.remove('iu-hidden');
      btnConfirm.focus();
    });
  }
