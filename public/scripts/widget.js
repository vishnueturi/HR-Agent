/**
 * HR Agent Chat Widget — embeddable script (aligned with ondesk `widget.blade.php`).
 * Include on any page with a script tag that has hr-agent-id="script-v1" and base-url.
 * Uses a shadow root (like OnDesk) so host-page CSS cannot shrink or break the iframe.
 *
 * Required script attribute: base-url (e.g. https://your-hr-agent-domain.com or /hr-agent)
 * Optional: token (HRMS access_token from verify-local-storage.html), user-data, organization-data
 * Optional layout (host portal chrome): widget-top-offset, widget-bottom-offset — CSS lengths, e.g. 48px / 4.5rem.
 *   Panel height uses 100vh minus these insets so the iframe fills the band (iframes do not size reliably with top+bottom+height:auto).
 *   FAB stays bottom/right; default bottom offset clears ~52px button + small gap.
 */
(function () {
  'use strict';

  var script = document.querySelector('script[hr-agent-id="script-v1"]');
  if (!script) return;

  var baseUrl = (script.getAttribute('base-url') || '').replace(/\/+$/, '');
  if (!baseUrl) return;

  var token = script.getAttribute('token') || '';
  var userData = script.getAttribute('user-data') || '';
  var organizationData = script.getAttribute('organization-data') || '';
  /** Distance from viewport top to iframe top — keeps host HR nav visible above the panel. */
  var widgetTopOffset = (script.getAttribute('widget-top-offset') || '48px').trim();
  /** Distance from viewport bottom to iframe bottom — clears the floating FAB (same bottom/right as toggler). */
  var widgetBottomOffset = (script.getAttribute('widget-bottom-offset') || '64px').trim();

  var division = document.createElement('div');
  var iframe = document.createElement('iframe');
  var toggler = document.createElement('button');
  /** HR Agent app (and SignalR /chathub) load only after the user opens the panel once. */
  var appLoaded = false;

  var chatIcon =
    '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M23.5 6C24.4946 6 25.4484 6.39509 26.1517 7.09835C26.8549 7.80161 27.25 8.75544 27.25 9.75V19.75C27.25 20.7446 26.8549 21.6984 26.1517 22.4016C25.4484 23.1049 24.4946 23.5 23.5 23.5H17.25L11 27.25V23.5H8.5C7.50544 23.5 6.55161 23.1049 5.84835 22.4016C5.14509 21.6984 4.75 20.7446 4.75 19.75V9.75C4.75 8.75544 5.14509 7.80161 5.84835 7.09835C6.55161 6.39509 7.50544 6 8.5 6H23.5Z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.875 12.25H12.8875" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.125 12.25H19.1375" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12.875 17.25C13.2823 17.6657 13.7686 17.996 14.3052 18.2215C14.8418 18.447 15.418 18.5631 16 18.5631C16.582 18.5631 17.1582 18.447 17.6948 18.2215C18.2314 17.996 18.7177 17.6657 19.125 17.25" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var chatColor = '#1976d2';
  var closeIcon =
    '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M23.5 8.5L8.5 23.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.5 8.5L23.5 23.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var closeColor = '#b83a45';

  function buildIframeSrc() {
    var url = baseUrl + '/';
    var params = [];
    if (userData) params.push('user=' + encodeURIComponent(userData));
    if (organizationData) params.push('org=' + encodeURIComponent(organizationData));
    if (params.length) url += (url.indexOf('?') !== -1 ? '&' : '?') + params.join('&');
    if (token) url += '#' + 'access_token=' + encodeURIComponent(token);
    return url;
  }

  function toggle() {
    if (iframe.style.display === 'block') {
      toggler.style.backgroundColor = chatColor;
      toggler.innerHTML = chatIcon;
      iframe.style.display = 'none';
    } else {
      if (!appLoaded) {
        iframe.src = buildIframeSrc();
        appLoaded = true;
      }
      toggler.style.backgroundColor = closeColor;
      toggler.innerHTML = closeIcon;
      iframe.style.display = 'block';
    }
  }

  /* Full-viewport overlay host (pointer-events pass-through except shadow children). */
  division.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:2147483645;margin:0;padding:0;border:0;width:100%;height:100%;';

  document.body.appendChild(division);

  var shadow = division.attachShadow({ mode: 'open' });

  var styleEl = document.createElement('style');
  styleEl.textContent =
    ':host { display: block; width: 100%; height: 100%; position: relative; box-sizing: border-box; }';
  shadow.appendChild(styleEl);

  /* Panel fills viewport band between nav and FAB — explicit height (iframes ignore top+bottom stretch). Toggler unchanged. */
  iframe.style.display = 'none';
  iframe.style.position = 'absolute';
  iframe.style.boxSizing = 'border-box';
  iframe.style.top = 'calc(' + widgetTopOffset + ' + env(safe-area-inset-top, 0px))';
  iframe.style.right = '0';
  iframe.style.bottom = 'auto';
  iframe.style.left = 'auto';
  iframe.style.width = 'min(450px, calc(100vw - env(safe-area-inset-right, 0px)))';
  iframe.style.height =
    'calc(100vh - ' +
    widgetTopOffset +
    ' - ' +
    widgetBottomOffset +
    ' - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))';
  iframe.style.maxHeight =
    'calc(100vh - ' +
    widgetTopOffset +
    ' - ' +
    widgetBottomOffset +
    ' - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))';
  iframe.style.minHeight = '240px';
  iframe.style.border = '1px solid rgba(15, 23, 42, 0.1)';
  iframe.style.borderRadius = '14px';
  iframe.style.boxShadow =
    '-12px 0 56px rgba(0, 0, 0, 0.14), -4px 0 24px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.04) inset';
  iframe.style.pointerEvents = 'auto';

  iframe.setAttribute('title', 'HR Agent chat');
  /** Required for voice input (getUserMedia) inside the embedded app; without it browsers report Permission denied. */
  iframe.setAttribute('allow', 'microphone');
  iframe.setAttribute('width', '450');
  iframe.setAttribute('height', '720');
  /* Defer loading: no REST/SignalR traffic until the user opens the chat (saves /chathub on every portal page view). */
  iframe.src = 'about:blank';

  shadow.appendChild(iframe);

  /* OnDesk toggler placement (above iframe in paint order). */
  toggler.style.position = 'absolute';
  toggler.style.right = '6px';
  toggler.style.bottom = '6px';
  toggler.style.border = 'none';
  toggler.style.padding = '10px';
  toggler.style.outline = 'none';
  toggler.style.backgroundColor = chatColor;
  toggler.innerHTML = chatIcon;
  toggler.style.cursor = 'pointer';
  toggler.style.borderRadius = '100%';
  toggler.style.boxShadow =
    '0 2px 4px rgba(0, 0, 0, 0.12), 0 8px 24px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.12) inset';
  toggler.style.transition = 'all 0.3s ease';
  toggler.style.zIndex = '1';
  toggler.style.pointerEvents = 'auto';
  toggler.setAttribute('aria-label', 'Toggle HR Agent chat');
  toggler.addEventListener('click', function () {
    toggle();

    // Avoid leaving focus on the launcher button because the host portal
    // should retain its normal keyboard and scrollbar behavior.
    if (typeof toggler.blur === 'function') {
      toggler.blur();
    }
  });

  shadow.appendChild(toggler);
})();
