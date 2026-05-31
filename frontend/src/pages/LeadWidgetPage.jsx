import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';
import { Copy, Globe, ExternalLink, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function LeadWidgetPage() {
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    axios.get(`${API}/widget/token`).then(({ data }) => setToken(data.widget_token)).catch(() => {});
  }, []);

  const apiBase = process.env.REACT_APP_BACKEND_URL;
  const embedCode = `<!-- EduCRM Lead Capture Widget -->
<div id="educrm-lead-form"></div>
<script>
(function(){
  var d=document,s=d.createElement('div');
  s.innerHTML='<form id="ecf" style="max-width:380px;font-family:system-ui,sans-serif;border:1px solid #E2E8F0;border-radius:12px;padding:24px;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.06)">'+
    '<h3 style="margin:0 0 6px;font-size:18px;font-weight:700;color:#0F172A">Get a Callback</h3>'+
    '<p style="margin:0 0 18px;font-size:13px;color:#64748B">We\\'ll get in touch within 1 working hour.</p>'+
    '<input name="name" placeholder="Your name" required style="width:100%;padding:10px 12px;margin-bottom:10px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;box-sizing:border-box"/>'+
    '<input name="mobile" placeholder="Mobile number" required style="width:100%;padding:10px 12px;margin-bottom:10px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;box-sizing:border-box"/>'+
    '<input name="email" type="email" placeholder="Email (optional)" style="width:100%;padding:10px 12px;margin-bottom:10px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;box-sizing:border-box"/>'+
    '<input name="course" placeholder="Course of interest" style="width:100%;padding:10px 12px;margin-bottom:14px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;box-sizing:border-box"/>'+
    '<button type="submit" style="width:100%;padding:12px;background:#7C3AED;color:#fff;border:0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">Request Callback</button>'+
    '<p id="ecm" style="margin:10px 0 0;font-size:12px;color:#10B981;display:none"></p>'+
  '</form>';
  d.getElementById('educrm-lead-form').appendChild(s);
  d.getElementById('ecf').addEventListener('submit',function(e){
    e.preventDefault();
    var f=e.target,m=d.getElementById('ecm');
    fetch('${apiBase}/api/widget/lead/${token}',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:f.name.value,mobile:f.mobile.value,email:f.email.value,course_interested:f.course.value})
    }).then(function(r){return r.json()}).then(function(j){
      m.textContent='Thanks! We\\'ll be in touch shortly.';m.style.display='block';f.reset();
    }).catch(function(){m.textContent='Something went wrong, please try again.';m.style.color='#EF4444';m.style.display='block'});
  });
})();
</script>`;

  const copy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Embed code copied!');
  };

  return (
    <div className="space-y-6 max-w-5xl" data-testid="lead-widget-page">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700 mb-1.5">Lead Capture</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Sora' }}>Lead Capture Widget</h1>
        <p className="text-sm text-slate-500 mt-1">Embed a lead form on your website. Inquiries flow directly into EduCRM.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Embed code */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: 'Sora' }}>
              <Globe className="w-4 h-4 text-violet-600" />
              Embed Code
            </h3>
            <Button size="sm" onClick={copy} className="bg-violet-700 hover:bg-violet-800 text-white" data-testid="copy-embed-btn">
              {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-slate-500 mb-3">Paste this snippet anywhere on your website where you want the form to appear.</p>
          <pre className="bg-slate-900 text-slate-200 text-[10px] p-4 rounded-lg overflow-x-auto max-h-96 leading-relaxed">
            {embedCode}
          </pre>
        </div>

        {/* Preview */}
        <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-slate-200 rounded-xl p-6">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Sora' }}>
            <ExternalLink className="w-4 h-4 text-violet-600" />
            Live Preview
          </h3>
          <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-sm mx-auto shadow-lg">
            <h4 className="text-lg font-bold text-slate-900 mb-1" style={{ fontFamily: 'Sora' }}>Get a Callback</h4>
            <p className="text-xs text-slate-500 mb-4">We'll get in touch within 1 working hour.</p>
            <input className="w-full px-3 py-2.5 mb-2 border border-slate-300 rounded-md text-sm" placeholder="Your name" />
            <input className="w-full px-3 py-2.5 mb-2 border border-slate-300 rounded-md text-sm" placeholder="Mobile number" />
            <input className="w-full px-3 py-2.5 mb-2 border border-slate-300 rounded-md text-sm" placeholder="Email (optional)" />
            <input className="w-full px-3 py-2.5 mb-3 border border-slate-300 rounded-md text-sm" placeholder="Course of interest" />
            <button className="w-full bg-violet-700 text-white py-3 rounded-md text-sm font-semibold">Request Callback</button>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <p className="text-sm text-blue-900">
          <strong>How it works:</strong> Submitted inquiries are auto-imported as new Leads with source "Website Widget". You'll receive a notification in EduCRM and can follow up immediately.
        </p>
      </div>
    </div>
  );
}
