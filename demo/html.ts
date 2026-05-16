export function buildEmailClientHtml(
  subject: string,
  from: string,
  to: string,
  emailBodyHtml: string,
): string {
  // Add target="_top" so clicking links in the iframe navigates the top-level page
  const emailWithTargets = emailBodyHtml.replace(/<a /g, '<a target="_top" ')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#f1f5f9;height:100vh;overflow:hidden}
    .client{display:flex;height:100vh}
    .sidebar{width:200px;background:#1e293b;color:#e2e8f0;display:flex;flex-direction:column;flex-shrink:0}
    .sidebar-header{padding:20px 16px 14px;border-bottom:1px solid #334155}
    .sidebar-header h2{font-size:15px;font-weight:600;color:#f8fafc}
    .sidebar-header p{font-size:11px;color:#94a3b8;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .folder-list{padding:8px 0}
    .folder{padding:8px 16px;font-size:13px;color:#94a3b8;cursor:pointer;display:flex;justify-content:space-between;align-items:center}
    .folder.active{background:#334155;color:#f8fafc;border-radius:6px;margin:0 8px;padding:8px 8px}
    .badge{background:#3b82f6;color:white;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:600}
    .inbox{width:260px;background:#f8fafc;border-right:1px solid #e2e8f0;overflow-y:auto;flex-shrink:0}
    .inbox-header{padding:14px 16px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:600;color:#1e293b}
    .email-item{padding:14px 16px;border-bottom:1px solid #f0f4f8;cursor:pointer;background:white;position:relative}
    .email-item.selected{background:#eff6ff;border-left:3px solid #3b82f6}
    .email-item .sender{font-size:13px;font-weight:700;color:#1e293b}
    .email-item .time{font-size:11px;color:#9ca3af;float:right}
    .email-item .subject{font-size:12px;color:#374151;margin-top:2px;font-weight:500}
    .email-item .preview{font-size:11px;color:#6b7280;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .email-pane{flex:1;display:flex;flex-direction:column;min-width:0;background:white}
    .email-header{padding:24px 28px 18px;border-bottom:1px solid #e5e7eb;flex-shrink:0}
    .email-header .subject{font-size:20px;font-weight:600;color:#111827}
    .email-header .meta{margin-top:8px;font-size:13px;color:#6b7280}
    .email-header .meta span{margin-right:16px}
    .email-iframe{flex:1;border:none;display:block;width:100%}
  </style></head><body>
  <div class="client">
    <div class="sidebar">
      <div class="sidebar-header"><h2>${to.split('@')[0]}</h2><p>${to}</p></div>
      <div class="folder-list">
        <div class="folder active">Inbox <span class="badge">1</span></div>
        <div class="folder">Sent</div>
        <div class="folder">Drafts</div>
        <div class="folder">Trash</div>
      </div>
    </div>
    <div class="inbox">
      <div class="inbox-header">Inbox (1 unread)</div>
      <div class="email-item selected">
        <span class="time">Just now</span>
        <div class="sender">Catalyse</div>
        <div class="subject">${subject}</div>
        <div class="preview">Thanks for applying to join Catalyse...</div>
      </div>
    </div>
    <div class="email-pane">
      <div class="email-header">
        <div class="subject">${subject}</div>
        <div class="meta"><span>From: <strong>${from}</strong></span><span>To: ${to}</span></div>
      </div>
      <iframe id="email-frame" class="email-iframe" title="email" sandbox="allow-same-origin allow-top-navigation"></iframe>
    </div>
  </div>
  <div id="__cover__" style="position:fixed;inset:0;background:#000;z-index:2147483647;pointer-events:none;transition:opacity 500ms ease;"></div>
  <script>
    document.getElementById('email-frame').srcdoc = ${JSON.stringify(emailWithTargets)};
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      var c=document.getElementById('__cover__'); c.style.opacity='0'; setTimeout(function(){ c.remove(); },520);
    }); });
  </script>
  </body></html>`
}

export function buildTitleCardHtml(videoTitle: string): string {
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 616 616" width="144" height="144"><path d="M308 0C478.104 0 616 137.896 616 308C616 478.104 478.104 616 308 616C137.896 616 0 478.104 0 308C0 137.896 137.896 0 308 0ZM194.04 447.681C194.04 448.785 194.935 449.681 196.04 449.681H269.04C270.145 449.681 271.04 448.785 271.04 447.681V177.561C271.04 176.456 270.145 175.561 269.04 175.561H196.04C194.935 175.561 194.04 176.456 194.04 177.561V447.681ZM340.8 175.561C339.695 175.561 338.8 176.456 338.8 177.561V447.681C338.8 448.785 339.695 449.681 340.8 449.681H413.8C414.904 449.681 415.8 448.785 415.8 447.681V177.561C415.8 176.456 414.904 175.561 413.8 175.561H340.8Z" fill="#FF9416"/></svg>`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;height:100vh;display:flex;align-items:center;justify-content:center}
    .brand{display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:18px}
    .brand-name{font-size:108px;font-weight:700;color:#FF9416;letter-spacing:-1px}
    .title{font-size:42px;color:#e2e8f0;font-weight:400;text-align:center;opacity:0.85}
  </style></head><body>
  <div>
    <div class="brand">${logoSvg}<span class="brand-name">Catalyse</span></div>
    <div class="title">${videoTitle}</div>
  </div>
  </body></html>`
}
