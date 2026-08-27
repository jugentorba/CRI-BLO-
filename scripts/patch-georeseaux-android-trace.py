from pathlib import Path

path = Path('plugins/criblo-native-browser/android/src/main/java/com/criblo/nativebrowser/CRIBrowserPlugin.java')
text = path.read_text()

if 'GEORESEAUX_TRACE_SCRIPT' in text:
    raise SystemExit('Android GeoReseaux trace already installed')

constant_anchor = '    private Dialog activeDialog;\n'
if constant_anchor not in text:
    raise SystemExit('Android browser field anchor missing')

trace_constant = r'''    private static final String GEORESEAUX_TRACE_SCRIPT = """
        (function(){
          if(window.__cribloAndroidGeoTraceInstalled)return;
          window.__cribloAndroidGeoTraceInstalled=true;
          var trace={events:[],requests:[],started:Date.now()};
          function trim(list,max){while(list.length>max)list.shift();}
          function targetName(t){
            try{return String((t&&t.tagName)||'')+'#'+String((t&&t.id)||'')+'.'+String((t&&t.className)||'').slice(0,60);}catch(_){return '?';}
          }
          function eventRow(e){
            try{
              var p=e&&e.pointerType?('/'+e.pointerType):'';
              trace.events.push(String(e.type)+p+' trusted='+String(!!e.isTrusted)+' '+targetName(e.target));
              trim(trace.events,36);
            }catch(_){}
          }
          ['pointerdown','touchstart','mousedown','contextmenu','pointerup','touchend','mouseup','auxclick','click','touchcancel','pointercancel'].forEach(function(name){
            try{document.addEventListener(name,eventRow,true);}catch(_){}
          });
          function cleanUrl(raw){
            try{var u=new URL(String(raw||''),location.href);return u.origin+u.pathname;}catch(_){return String(raw||'').split('?')[0].slice(0,180);}
          }
          function addRequest(row){try{trace.requests.push(row);trim(trace.requests,24);}catch(_){} }
          try{
            if(typeof window.fetch==='function'){
              var originalFetch=window.fetch;
              window.fetch=function(input,init){
                var method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
                var raw=(input&&input.url)||input;
                var prefix='fetch '+method+' '+cleanUrl(raw);
                return originalFetch.apply(this,arguments).then(function(response){addRequest(prefix+' -> '+response.status);return response;},function(error){addRequest(prefix+' -> error');throw error;});
              };
            }
          }catch(_){}
          try{
            var originalOpen=XMLHttpRequest.prototype.open;
            var originalSend=XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open=function(method,url){
              try{this.__cribloMethod=String(method||'GET').toUpperCase();this.__cribloURL=cleanUrl(url);}catch(_){}
              return originalOpen.apply(this,arguments);
            };
            XMLHttpRequest.prototype.send=function(){
              try{
                if(!this.__cribloTraceHook){
                  this.__cribloTraceHook=true;
                  this.addEventListener('loadend',function(){addRequest('xhr '+String(this.__cribloMethod||'GET')+' '+String(this.__cribloURL||'')+' -> '+String(this.status||0));});
                }
              }catch(_){}
              return originalSend.apply(this,arguments);
            };
          }catch(_){}
          window.__cribloAndroidGeoTraceText=function(){
            var scripts=[];
            try{
              var nodes=document.scripts||[];
              for(var i=0;i<nodes.length;i++){
                var src=String(nodes[i].src||'');
                if(!src)continue;
                try{var u=new URL(src,location.href);src=u.pathname.split('/').pop()||u.pathname;}catch(_){}
                if(scripts.indexOf(src)<0)scripts.push(src.slice(0,80));
                if(scripts.length>=12)break;
              }
            }catch(_){}
            return [
              'URL: '+String(location.href||'').split('?')[0].slice(0,180),
              'UA: '+String(navigator.userAgent||'').slice(0,180),
              'Platform: '+String(navigator.platform||''),
              'Events: '+(trace.events.join(' > ')||'none'),
              'Requests: '+(trace.requests.join(' | ')||'none'),
              'Scripts: '+(scripts.join(', ')||'none')
            ].join('\n');
          };
        })();
        """;

'''
text = text.replace(constant_anchor, trace_constant + constant_anchor, 1)

finish_anchor = '                view.evaluateJavascript(AUTOFILL_COMPATIBILITY_SCRIPT, null);\n                CookieManager.getInstance().flush();'
if finish_anchor not in text:
    raise SystemExit('Android onPageFinished anchor missing')
text = text.replace(
    finish_anchor,
    '                view.evaluateJavascript(AUTOFILL_COMPATIBILITY_SCRIPT, null);\n                view.evaluateJavascript(GEORESEAUX_TRACE_SCRIPT, null);\n                CookieManager.getInstance().flush();',
    1,
)

old_menu = '''        menu.getMenu().add(0, 1, 0, "History");
        menu.getMenu().add(0, 2, 1, "Share");
        menu.getMenu().add(0, 3, 2, "Open in browser");
        menu.getMenu().add(0, 4, 3, "Close CRI-BLO Browser");
        menu.setOnMenuItemClickListener(item -> {
            if (item.getItemId() == 1) { showHistory(); return true; }
            if (item.getItemId() == 2) { shareCurrentPage(); return true; }
            if (item.getItemId() == 3) { openExternal(); return true; }
            if (item.getItemId() == 4) { if (activeDialog != null) activeDialog.dismiss(); return true; }
            return false;
        });'''
new_menu = '''        menu.getMenu().add(0, 1, 0, "History");
        menu.getMenu().add(0, 2, 1, "Share");
        menu.getMenu().add(0, 5, 2, "Diagnostic GeoReseaux");
        menu.getMenu().add(0, 3, 3, "Open in browser");
        menu.getMenu().add(0, 4, 4, "Close CRI-BLO Browser");
        menu.setOnMenuItemClickListener(item -> {
            if (item.getItemId() == 1) { showHistory(); return true; }
            if (item.getItemId() == 2) { shareCurrentPage(); return true; }
            if (item.getItemId() == 5) { showGeoDiagnostics(); return true; }
            if (item.getItemId() == 3) { openExternal(); return true; }
            if (item.getItemId() == 4) { if (activeDialog != null) activeDialog.dismiss(); return true; }
            return false;
        });'''
if old_menu not in text:
    raise SystemExit('Android More menu anchor missing')
text = text.replace(old_menu, new_menu, 1)

history_anchor = '    private void showHistory() {\n'
if history_anchor not in text:
    raise SystemExit('Android history method anchor missing')
method = r'''    private void showGeoDiagnostics() {
        if (activeWebView == null) return;
        String script = "window.__cribloAndroidGeoTraceText ? window.__cribloAndroidGeoTraceText() : 'Diagnostic GeoReseaux indisponible sur cette page.'";
        activeWebView.evaluateJavascript(script, value -> {
            String message = "Aucune information de diagnostic disponible.";
            try {
                if (value != null) message = new JSONArray("[" + value + "]").getString(0);
            } catch (Exception ignored) {}
            final String display = message;
            getActivity().runOnUiThread(() -> new AlertDialog.Builder(getActivity())
                .setTitle("Diagnostic GeoReseaux Android")
                .setMessage(display)
                .setPositiveButton("OK", null)
                .show());
        });
    }

'''
text = text.replace(history_anchor, method + history_anchor, 1)

path.write_text(text)
print('Android GeoReseaux trace installed')
