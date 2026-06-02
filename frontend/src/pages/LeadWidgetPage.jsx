import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { Copy, Globe, ExternalLink, Check, Sparkles, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function LeadWidgetPage() {
  const { user } = useAuth();
  const [token, setToken] = useState('');
  const [config, setConfig] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const apiBase = process.env.REACT_APP_BACKEND_URL;

  // Live preview state
  const [previewState, setPreviewState] = useState('');
  const [previewCity, setPreviewCity] = useState('');
  const [previewCities, setPreviewCities] = useState([]);

  const fetchTokenAndConfig = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data: tokenRes } = await axios.get(`${API}/widget/token`);
      const tok = tokenRes.widget_token;
      setToken(tok);
      const { data: cfgRes } = await axios.get(`${API}/widget/config/${tok}`);
      setConfig(cfgRes);
    } catch (e) {
      const status = e.response?.status;
      const detail = e.response?.data?.detail;
      if (status === 403) {
        setLoadError("Only Org Admin / Super Admin can generate the widget snippet. Ask your admin to do this and share the embed code with you.");
      } else if (status === 404) {
        setLoadError(`Widget config not found (${detail || 'invalid token'}). Try refreshing.`);
      } else if (typeof detail === 'string') {
        setLoadError(detail);
      } else {
        setLoadError(e.message || 'Failed to load widget — please refresh and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokenAndConfig();
  }, []);

  useEffect(() => {
    if (!previewState || !token) { setPreviewCities([]); return; }
    axios.get(`${API}/widget/cities/${token}`, { params: { state: previewState } })
      .then(({ data }) => setPreviewCities(data.cities || []))
      .catch(() => setPreviewCities([]));
  }, [previewState, token]);

  const embedCode = useMemo(() => {
    if (!token || !config) return '';
    // Build the embed snippet that dynamically loads field config from backend
    return `<!-- Leadtrak Lead Capture Widget -->
<div id="leadtrak-form-root"></div>
<script>
(function(){
  var API="${apiBase}", TOKEN="${token}", ROOT=document.getElementById("leadtrak-form-root");
  if(!ROOT) return;
  var brand="#7C3AED", success="#10B981", danger="#EF4444";

  function el(tag,attrs,children){
    var e=document.createElement(tag);
    if(attrs) for(var k in attrs){ if(k==="style") Object.assign(e.style,attrs[k]); else if(k==="html") e.innerHTML=attrs[k]; else e.setAttribute(k,attrs[k]); }
    (children||[]).forEach(function(c){ e.appendChild(typeof c==="string"?document.createTextNode(c):c); });
    return e;
  }
  function input(name,label,type,required,placeholder){
    var wrap=el("div",{style:{marginBottom:"12px"}});
    wrap.appendChild(el("label",{style:{display:"block",fontSize:"12px",fontWeight:"600",color:"#475569",marginBottom:"5px"}},[label+(required?" *":"")]));
    var i=el("input",{name:name,type:type||"text",placeholder:placeholder||"",style:{width:"100%",padding:"11px 13px",border:"1px solid #CBD5E1",borderRadius:"10px",fontSize:"14px",boxSizing:"border-box",outline:"none",transition:"border-color .15s, box-shadow .15s",background:"#fff"}});
    if(required) i.required=true;
    i.addEventListener("focus",function(){ i.style.borderColor=brand; i.style.boxShadow="0 0 0 3px rgba(124,58,237,0.12)"; });
    i.addEventListener("blur",function(){ i.style.borderColor="#CBD5E1"; i.style.boxShadow="none"; });
    wrap.appendChild(i);
    return wrap;
  }
  function selectField(name,label,opts,required){
    var wrap=el("div",{style:{marginBottom:"12px"}});
    wrap.appendChild(el("label",{style:{display:"block",fontSize:"12px",fontWeight:"600",color:"#475569",marginBottom:"5px"}},[label+(required?" *":"")]));
    var s=el("select",{name:name,style:{width:"100%",padding:"11px 13px",border:"1px solid #CBD5E1",borderRadius:"10px",fontSize:"14px",boxSizing:"border-box",outline:"none",background:"#fff",appearance:"auto"}});
    if(required) s.required=true;
    s.appendChild(el("option",{value:""},["Select…"]));
    (opts||[]).forEach(function(o){ s.appendChild(el("option",{value:o},[o])); });
    wrap.appendChild(s);
    return s;
  }

    // Fetch config then render
    var xhr=new XMLHttpRequest();
    xhr.open("GET",API+"/api/widget/config/"+TOKEN,true);
    xhr.onload=function(){
      if(xhr.status!==200) return;
      var cfg=JSON.parse(xhr.responseText);
      brand=cfg.primary_color||brand;
      var serviceNames=(cfg.services||[]).map(function(s){return s.name;});
      var card=el("div",{style:{maxWidth:"420px",margin:"0 auto",border:"1px solid #E2E8F0",borderRadius:"16px",padding:"28px",background:"#fff",boxShadow:"0 8px 30px rgba(15,23,42,0.08)",fontFamily:"-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif"}});
      // Header
      var brandTag=el("div",{style:{display:"inline-block",padding:"4px 10px",background:brand+"15",color:brand,fontSize:"10px",fontWeight:"700",letterSpacing:"1.5px",borderRadius:"100px",marginBottom:"10px",textTransform:"uppercase"}},["Request a Callback"]);
      card.appendChild(brandTag);
      card.appendChild(el("h3",{style:{margin:"0 0 6px",fontSize:"22px",fontWeight:"700",color:"#0F172A",letterSpacing:"-0.3px"}},["Speak with our team"]));
      card.appendChild(el("p",{style:{margin:"0 0 22px",fontSize:"13px",color:"#64748B",lineHeight:"1.5"}},["Drop your details and we'll reach out within 1 working hour to help you with "+(cfg.terms&&cfg.terms.offering?cfg.terms.offering.toLowerCase():"your inquiry")+"."]));
      var form=el("form",{id:"ltf"});
      form.appendChild(input("name","Your name","text",true,"Full name"));
      form.appendChild(input("mobile","Mobile number","tel",true,"10-digit mobile"));
      form.appendChild(input("email","Email","email",false,"name@example.com"));
      // Industry fields
      (cfg.fields||[]).forEach(function(f){
        if(f.type==="service-select"){
          if(serviceNames.length>0){
            var w=el("div",{style:{marginBottom:"12px"}});
            w.appendChild(el("label",{style:{display:"block",fontSize:"12px",fontWeight:"600",color:"#475569",marginBottom:"5px"}},[f.label+(f.required?" *":"")]));
            var s=selectField(f.name,f.label,serviceNames,f.required);
            w.appendChild(s); form.appendChild(w);
          } else {
            form.appendChild(input(f.name,f.label,"text",!!f.required,f.placeholder||""));
          }
        } else if(f.type==="select"){
          var w2=el("div",{style:{marginBottom:"12px"}});
          w2.appendChild(el("label",{style:{display:"block",fontSize:"12px",fontWeight:"600",color:"#475569",marginBottom:"5px"}},[f.label+(f.required?" *":"")]));
          var s2=selectField(f.name,f.label,f.options,f.required);
          w2.appendChild(s2); form.appendChild(w2);
        } else {
          form.appendChild(input(f.name,f.label,f.type||"text",!!f.required,f.placeholder||""));
        }
      });
    // State + City cascading
    var stateRow=el("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"12px"}});
    var stateWrap=el("div"); stateWrap.appendChild(el("label",{style:{display:"block",fontSize:"12px",fontWeight:"600",color:"#475569",marginBottom:"5px"}},["State"]));
    var stateSel=el("select",{name:"state",style:{width:"100%",padding:"11px 13px",border:"1px solid #CBD5E1",borderRadius:"10px",fontSize:"14px",boxSizing:"border-box",outline:"none",background:"#fff"}});
    stateSel.appendChild(el("option",{value:""},["Select state"]));
    (cfg.states||[]).forEach(function(s){ stateSel.appendChild(el("option",{value:s},[s])); });
    stateWrap.appendChild(stateSel);
    var cityWrap=el("div"); cityWrap.appendChild(el("label",{style:{display:"block",fontSize:"12px",fontWeight:"600",color:"#475569",marginBottom:"5px"}},["City"]));
    var citySel=el("select",{name:"city",style:{width:"100%",padding:"11px 13px",border:"1px solid #CBD5E1",borderRadius:"10px",fontSize:"14px",boxSizing:"border-box",outline:"none",background:"#fff",color:"#94A3B8"}});
    citySel.disabled=true; citySel.appendChild(el("option",{value:""},["Select state first"]));
    cityWrap.appendChild(citySel);
    stateSel.addEventListener("change",function(){
      var v=stateSel.value; citySel.innerHTML=""; citySel.disabled=!v;
      citySel.appendChild(el("option",{value:""},[v?"Loading…":"Select state first"]));
      if(!v){ citySel.style.color="#94A3B8"; return; }
      citySel.style.color="#0F172A";
      var x=new XMLHttpRequest();
      x.open("GET",API+"/api/widget/cities/"+TOKEN+"?state="+encodeURIComponent(v),true);
      x.onload=function(){ if(x.status===200){ var d=JSON.parse(x.responseText); citySel.innerHTML=""; citySel.appendChild(el("option",{value:""},["Select city"])); (d.cities||[]).forEach(function(c){ citySel.appendChild(el("option",{value:c},[c])); }); } };
      x.send();
    });
    stateRow.appendChild(stateWrap); stateRow.appendChild(cityWrap);
    form.appendChild(stateRow);

    // Submit
    var btn=el("button",{type:"submit",style:{width:"100%",padding:"13px",background:brand,color:"#fff",border:"0",borderRadius:"10px",fontSize:"14px",fontWeight:"700",cursor:"pointer",letterSpacing:".2px",transition:"opacity .15s"}},["Request a Callback →"]);
    btn.addEventListener("mouseenter",function(){ btn.style.opacity="0.9"; });
    btn.addEventListener("mouseleave",function(){ btn.style.opacity="1"; });
    form.appendChild(btn);
    var msg=el("p",{style:{margin:"12px 0 0",fontSize:"12px",color:success,display:"none",textAlign:"center"}});
    form.appendChild(msg);
    // Powered by
    var footer=el("div",{style:{marginTop:"18px",paddingTop:"14px",borderTop:"1px solid #F1F5F9",textAlign:"center"}});
    footer.appendChild(el("a",{href:"https://leadtrak.com",target:"_blank",rel:"noopener",style:{fontSize:"11px",color:"#94A3B8",textDecoration:"none",letterSpacing:".5px",fontWeight:"500"}},["Powered by ", "Leadtrak"]));
    card.appendChild(form); card.appendChild(footer);
    ROOT.appendChild(card);

    form.addEventListener("submit",function(e){
      e.preventDefault();
      var payload={};
      Array.prototype.forEach.call(form.elements,function(el){ if(el.name) payload[el.name]=el.value; });
      btn.disabled=true; btn.style.opacity="0.6"; btn.textContent="Sending…";
      var p=new XMLHttpRequest();
      p.open("POST",API+"/api/widget/lead/"+TOKEN,true);
      p.setRequestHeader("Content-Type","application/json");
      p.onload=function(){
        btn.disabled=false; btn.style.opacity="1"; btn.textContent="Request a Callback →";
        if(p.status>=200&&p.status<300){
          msg.textContent="✓ Thanks! Our team will reach out shortly.";
          msg.style.color=success; msg.style.display="block";
          form.reset(); citySel.innerHTML=""; citySel.disabled=true; citySel.appendChild(el("option",{value:""},["Select state first"]));
        } else {
          msg.textContent="Something went wrong, please try again."; msg.style.color=danger; msg.style.display="block";
        }
      };
      p.onerror=function(){ btn.disabled=false; btn.style.opacity="1"; btn.textContent="Request a Callback →"; msg.textContent="Network error. Try again."; msg.style.color=danger; msg.style.display="block"; };
      p.send(JSON.stringify(payload));
    });
  };
  xhr.send();
})();
</script>`;
  }, [token, apiBase, config]);

  const copy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Embed code copied to clipboard');
  };

  const previewBrand = config?.primary_color || '#7C3AED';

  return (
    <div className="space-y-6 max-w-[1440px]" data-testid="lead-widget-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 mb-1.5">Lead Capture</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>Lead Capture Widget</h1>
        <p className="text-sm text-slate-500 mt-1">
          Industry-aware form auto-renders <strong>{config?.industry || '…'}</strong>-specific fields. Paste the snippet on any website.
        </p>
        {config && (config.services || []).length === 0 && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium" data-testid="no-services-warning">
            <Sparkles className="w-3 h-3" />
            No services in your catalog yet — the "Service" field will fall back to text. <a href="/services" className="underline font-semibold">Add services</a>
          </div>
        )}
        {config && (config.services || []).length > 0 && (
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium" data-testid="services-connected-pill">
            <Check className="w-3 h-3" />
            Connected to your Services catalog · {(config.services || []).length} item{(config.services || []).length === 1 ? '' : 's'}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Embed code */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: 'Sora' }}>
              <Code2 className="w-4 h-4 text-violet-600" />
              Embed Code
            </h3>
            <Button size="sm" onClick={copy} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="copy-embed-btn">
              {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
              {copied ? 'Copied' : 'Copy code'}
            </Button>
          </div>
          <div className="p-5">
            <p className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-violet-600" />
              Self-configuring snippet — pulls latest field list, brand color and state list from your account at runtime.
            </p>
            <pre className="bg-slate-900 text-slate-200 text-[10px] p-4 rounded-lg overflow-x-auto max-h-[480px] leading-relaxed font-mono" data-testid="widget-embed-code">
              {loading ? '⏳ Loading widget snippet...' : (loadError ? `⚠️ ${loadError}` : (embedCode || '— Generating widget code, hold on...'))}
            </pre>
            {loadError && (
              <button
                type="button"
                onClick={fetchTokenAndConfig}
                className="mt-3 text-xs text-violet-600 hover:text-violet-800 font-semibold"
                data-testid="widget-retry-btn"
              >
                ↻ Retry
              </button>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 border border-slate-200 rounded-xl p-6 lg:p-8">
          <h3 className="font-bold text-slate-900 mb-1 flex items-center gap-2" style={{ fontFamily: 'Sora' }}>
            <ExternalLink className="w-4 h-4 text-violet-600" />
            Live Preview
          </h3>
          <p className="text-xs text-slate-500 mb-5">This is exactly how it will appear on your website.</p>

          <div className="bg-white border border-slate-200 rounded-2xl p-7 max-w-md mx-auto shadow-[0_8px_30px_rgba(15,23,42,0.08)]" data-testid="widget-preview">
            <div className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.15em] uppercase mb-2.5" style={{ backgroundColor: `${previewBrand}15`, color: previewBrand }}>
              Request a Callback
            </div>
            <h4 className="text-xl font-bold text-slate-900 mb-1.5 tracking-tight" style={{ fontFamily: 'Sora' }}>Speak with our team</h4>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Drop your details and we'll reach out within 1 working hour to help you with {config?.terms?.offering?.toLowerCase() || 'your inquiry'}.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Your name *</label>
                <input className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none" placeholder="Full name" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Mobile number *</label>
                <input className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none" placeholder="10-digit mobile" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Email</label>
                <input className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none" placeholder="name@example.com" />
              </div>
              {/* Industry-specific fields */}
              {(config?.fields || []).map((f) => {
                const isServiceSelect = f.type === 'service-select';
                const serviceNames = (config?.services || []).map((s) => s.name);
                const fallbackToText = isServiceSelect && serviceNames.length === 0;
                return (
                  <div key={f.name}>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                      {f.label}{f.required ? ' *' : ''}
                    </label>
                    {(isServiceSelect && !fallbackToText) ? (
                      <select className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none bg-white">
                        <option>Select…</option>
                        {serviceNames.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    ) : f.type === 'select' ? (
                      <select className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none bg-white">
                        <option>Select…</option>
                        {(f.options || []).map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input type={f.type === 'service-select' ? 'text' : (f.type || 'text')} className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none" placeholder={f.placeholder || ''} />
                    )}
                    {fallbackToText && (
                      <p className="text-[10px] text-amber-700 mt-1">No services in catalog yet — falls back to text input. Add services in <strong>Services</strong> page.</p>
                    )}
                  </div>
                );
              })}
              {/* State + City */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">State</label>
                  <Select value={previewState} onValueChange={(v) => { setPreviewState(v); setPreviewCity(''); }}>
                    <SelectTrigger className="h-[42px] text-sm" data-testid="preview-state-select"><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent>
                      {(config?.states || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">City</label>
                  <Select value={previewCity} onValueChange={setPreviewCity} disabled={!previewState}>
                    <SelectTrigger className="h-[42px] text-sm" data-testid="preview-city-select"><SelectValue placeholder={previewState ? 'Select city' : 'Select state first'} /></SelectTrigger>
                    <SelectContent>
                      {previewCities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <button
                className="w-full py-3 rounded-lg text-white text-sm font-bold tracking-wide mt-1 hover:opacity-90 transition-opacity"
                style={{ backgroundColor: previewBrand }}
                data-testid="preview-submit-btn"
              >
                Request a Callback →
              </button>

              <div className="pt-3 border-t border-slate-100 text-center">
                <p className="text-[11px] text-slate-400 tracking-wide font-medium" data-testid="powered-by-leadtrak">
                  Powered by <span className="text-slate-600 font-semibold">Leadtrak</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <p className="text-sm text-blue-900">
          <strong>How it works:</strong> Submitted inquiries flow into your CRM as new Leads with source "Website Widget", auto-assigned by round-robin (if enabled), and you receive an instant notification. The form auto-rebuilds whenever you change your industry or add new cities — no need to re-paste the snippet.
        </p>
      </div>
    </div>
  );
}
