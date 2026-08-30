/* ==========================================================================
   media.js
   Owns the single global media source (idle / uploaded image / uploaded
   video / live camera) and keeps every registered vision panel's <video>
   and <img> elements in sync with it. This is the ONLY module that touches
   URL.createObjectURL()/getUserMedia() lifecycle; detection/tracking/
   overlay never care where the pixels came from, only whether a source is
   active.
   ========================================================================== */

const ASTRA_MEDIA = (() => {

  const panels = []; // { video, img }
  let currentType = 'none'; // 'none' | 'image' | 'video' | 'camera'
  let currentUrl = null;
  let currentStream = null;
  let currentLabel = '';
  const subscribers = [];

  function notify() {
    const s = getState();
    subscribers.forEach(fn => fn(s));
  }

  function subscribe(fn) { subscribers.push(fn); }

  function getState() {
    return { type: currentType, label: currentLabel };
  }

  function applyToPanel(panel) {
    const { video, img } = panel;
    if (currentType === 'camera') {
      video.pause();
      video.removeAttribute('src');
      video.srcObject = currentStream;
      video.muted = true;
      video.hidden = false;
      img.hidden = true;
      video.play().catch(() => {});
    } else if (currentType === 'video') {
      video.srcObject = null;
      video.src = currentUrl;
      video.loop = true;
      video.muted = true;
      video.hidden = false;
      img.hidden = true;
      video.play().catch(() => {});
    } else if (currentType === 'image') {
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
      img.src = currentUrl;
      video.hidden = true;
      img.hidden = false;
    } else {
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
      img.removeAttribute('src');
      video.hidden = true;
      img.hidden = true;
    }
  }

  function applyToAllPanels() {
    panels.forEach(applyToPanel);
  }

  function registerPanel(panel) {
    panels.push(panel);
    applyToPanel(panel);
  }

  function clearPrevious() {
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
    if (currentStream) {
      ASTRA_CAMERA.stopActiveStream();
      currentStream = null;
    }
  }

  async function startCamera(deviceId) {
    clearPrevious();
    const res = await ASTRA_CAMERA.startLiveCamera(deviceId);
    if (!res.ok) {
      currentType = 'none';
      currentLabel = '';
      applyToAllPanels();
      notify();
      return res;
    }
    currentStream = res.stream;
    currentType = 'camera';
    currentLabel = res.deviceLabel || 'Live Camera';
    applyToAllPanels();
    notify();
    return res;
  }

  function loadFile(file) {
    clearPrevious();
    const url = URL.createObjectURL(file);
    currentUrl = url;
    currentType = file.type.startsWith('image/') ? 'image' : 'video';
    currentLabel = file.name;
    applyToAllPanels();
    notify();
    return { ok: true, type: currentType, name: file.name };
  }

  function stop() {
    clearPrevious();
    currentType = 'none';
    currentLabel = '';
    applyToAllPanels();
    notify();
  }

  function isActive() { return currentType !== 'none'; }
  function getType() { return currentType; }

  return { registerPanel, startCamera, loadFile, stop, isActive, getType, getState, subscribe };
})();
