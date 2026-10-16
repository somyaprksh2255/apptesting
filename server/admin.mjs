/* Admin Console API. Every privileged route verifies both the Supabase JWT and an active
 * squado_admins row. The browser never receives the service-role key. */
import { getServerSupabase } from './supabase.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_-]{6,64}$/;
const REASONS = new Set(['Fake or spam','Made me uncomfortable','Inappropriate','Unsafe plan or place','Underage or lying about age','Harassment or bullying','Something else']);
const REPORT_STATUSES = new Set(['new','reviewing','reviewed','dismissed','actioned']);

async function requireAdmin(req,res,next){
  try {
    const {data,error}=await getServerSupabase().from('squado_admins').select('user_id,email,role,active').eq('user_id',req.uid).eq('active',true).maybeSingle();
    if(error){console.error('[admin] role lookup failed:',error.code||'db_error');return res.status(503).json({error:'admin_service_unavailable'});}
    if(!data)return res.status(403).json({error:'forbidden'});
    req.admin=data;return next();
  } catch(e){console.error('[admin] role lookup unavailable:',e?.message||'error');return res.status(503).json({error:'admin_service_unavailable'});}
}
async function audit(req,action,targetType,targetId,reason='',metadata={}){
  const {error}=await getServerSupabase().from('squado_admin_audit_log').insert({admin_uid:req.uid,action,target_type:targetType,target_id:targetId||null,reason:String(reason||'').slice(0,1000),metadata});
  if(error)throw new Error('audit_write_failed');
}
function eventPayload(raw,status){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const p={};for(const k of ['title','category','info','dateISO','startTime','endTime','loc','venue','host','ageGroup','visibility','city','state','locationSource'])p[k]=typeof raw[k]==='string'?raw[k].trim().slice(0,k==='info'?1200:180):'';
  p.locLat=raw.locLat===''||raw.locLat==null?NaN:Number(raw.locLat);
  p.locLng=raw.locLng===''||raw.locLng==null?NaN:Number(raw.locLng);
  p.capacity=raw.capacity===''||raw.capacity==null?null:Number(raw.capacity);p.status=status;
  if(!p.title||!p.category||!p.info||!p.dateISO||!p.startTime||!p.endTime||!p.loc||!p.venue||!p.host)return null;
  /* The browser's hidden fields are not trusted: only a current, selected OSM
     result with a real Indian city and valid coordinates can be persisted. */
  if(p.locationSource!=='openstreetmap-nominatim'||!p.city||!Number.isFinite(p.locLat)||p.locLat < -90||p.locLat > 90||!Number.isFinite(p.locLng)||p.locLng < -180||p.locLng > 180)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.dateISO)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.endTime))return null;
  if(status==='published'&&p.dateISO<new Date().toISOString().slice(0,10))return null;
  if(status==='published'&&p.endTime<=p.startTime)return null;
  if(p.capacity!==null&&(!Number.isInteger(p.capacity)||p.capacity<1||p.capacity>100000))return null;
  if(!['public','area'].includes(p.visibility))p.visibility='public';
  p.date=new Date(p.dateISO+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});p.dateLabel=p.date;p.when=p.startTime+'–'+p.endTime;p.tag=p.category;p.emoji=({garba:'💃',pandal:'🪔',bhandara:'🍛',city:'🗺️',custom:'🎟️'})[p.category]||'🎟️';
  return p;
}
function logFailure(tag,e){console.error(`[${tag}]`,e?.message||'error');}

export function mountAdminRoutes(app, requireAuth){
  app.get('/api/events',async(req,res)=>{try{const {data,error}=await getServerSupabase().from('squado_events').select('id,payload,status,created_at,updated_at').eq('status','published').order('updated_at',{ascending:false});if(error)throw new Error('events_read_failed');res.json({events:data||[]});}catch(e){logFailure('events-public',e);res.status(503).json({error:'events_unavailable'});}});

  app.post('/api/reports',requireAuth,async(req,res)=>{
    const b=req.body||{},reason=typeof b.reason==='string'?b.reason.trim():'';
    const details=typeof b.details==='string'?b.details.trim().slice(0,1000):'';
    const targetType=['user','plan','message','other'].includes(b.target_type)?b.target_type:'user';
    const targetUid=typeof b.target_uid==='string'&&UUID.test(b.target_uid)?b.target_uid:null;
    const targetReference=typeof b.target_reference==='string'?b.target_reference.trim().slice(0,120):null;
    const targetLabel=typeof b.target_label==='string'?b.target_label.trim().slice(0,160):null;
    const planId=typeof b.plan_id==='string'&&/^[A-Za-z0-9._-]{1,64}$/.test(b.plan_id)?b.plan_id:null;
    if(!REASONS.has(reason)||(!targetReference&&!targetUid&&!targetLabel))return res.status(400).json({error:'bad_request'});
    try{const {data,error}=await getServerSupabase().from('squado_safety_reports').insert({reporter_uid:req.uid,reporter_email:req.authEmail||'',target_uid:targetUid,target_reference:targetReference,target_label:targetLabel,target_type:targetType,plan_id:planId,reason,details}).select('id,status,created_at').single();if(error)throw new Error('report_insert_failed');res.status(201).json({report:data});}catch(e){logFailure('reports-create',e);res.status(503).json({error:'reports_unavailable'});}
  });

  app.get('/api/admin/me',requireAuth,requireAdmin,(req,res)=>res.json({admin:{user_id:req.admin.user_id,email:req.admin.email,role:req.admin.role}}));
  app.get('/api/admin/events',requireAuth,requireAdmin,async(req,res)=>{try{const {data,error}=await getServerSupabase().from('squado_events').select('id,payload,status,created_by,updated_by,created_at,updated_at').order('updated_at',{ascending:false});if(error)throw new Error('events_read_failed');res.json({events:data||[]});}catch(e){logFailure('admin-events-read',e);res.status(503).json({error:'events_unavailable'});}});
  app.post('/api/admin/events',requireAuth,requireAdmin,async(req,res)=>{const status=req.body?.status;if(!['draft','published'].includes(status))return res.status(400).json({error:'bad_request'});const payload=eventPayload(req.body?.payload,status);if(!payload)return res.status(400).json({error:'invalid_event'});const id='ev-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);try{const c=getServerSupabase();const {data,error}=await c.from('squado_events').insert({id,payload,status,created_by:req.uid,updated_by:req.uid}).select('*').single();if(error)throw new Error('event_insert_failed');await audit(req,'event.create','event',id,status==='published'?'Published Event':'Saved Event draft');res.status(201).json({event:data});}catch(e){logFailure('admin-event-create',e);res.status(503).json({error:'event_save_failed'});}});
  app.patch('/api/admin/events/:id',requireAuth,requireAdmin,async(req,res)=>{const id=String(req.params.id||''),status=req.body?.status;if(!ID.test(id)||!['draft','published'].includes(status))return res.status(400).json({error:'bad_request'});const payload=eventPayload(req.body?.payload,status);if(!payload)return res.status(400).json({error:'invalid_event'});try{const c=getServerSupabase();const {data,error}=await c.from('squado_events').update({payload,status,updated_by:req.uid,updated_at:new Date().toISOString()}).eq('id',id).select('*').maybeSingle();if(error)throw new Error('event_update_failed');if(!data)return res.status(404).json({error:'not_found'});await audit(req,'event.update','event',id,status==='published'?'Saved Event as published':'Saved Event draft');res.json({event:data});}catch(e){logFailure('admin-event-update',e);res.status(503).json({error:'event_update_failed'});}});
  app.post('/api/admin/events/:id/cancel',requireAuth,requireAdmin,async(req,res)=>{const id=String(req.params.id||''),reason=typeof req.body?.reason==='string'?req.body.reason.trim().slice(0,1000):'';if(!ID.test(id))return res.status(400).json({error:'bad_request'});try{const c=getServerSupabase();const {data:old,error:readError}=await c.from('squado_events').select('payload').eq('id',id).maybeSingle();if(readError)throw new Error('event_read_failed');if(!old)return res.status(404).json({error:'not_found'});const payload={...(old.payload||{}),status:'cancelled',cancelReason:reason};const {data,error}=await c.from('squado_events').update({payload,status:'cancelled',updated_by:req.uid,updated_at:new Date().toISOString()}).eq('id',id).select('*').single();if(error)throw new Error('event_cancel_failed');await audit(req,'event.cancel','event',id,reason);res.json({event:data});}catch(e){logFailure('admin-event-cancel',e);res.status(503).json({error:'event_cancel_failed'});}});
  app.get('/api/admin/reports',requireAuth,requireAdmin,async(req,res)=>{try{const {data,error}=await getServerSupabase().from('squado_safety_reports').select('*').order('created_at',{ascending:false}).limit(500);if(error)throw new Error('reports_read_failed');res.json({reports:data||[]});}catch(e){logFailure('admin-reports-read',e);res.status(503).json({error:'reports_unavailable'});}});
  app.patch('/api/admin/reports/:id',requireAuth,requireAdmin,async(req,res)=>{const id=String(req.params.id||''),status=req.body?.status,note=typeof req.body?.review_note==='string'?req.body.review_note.trim().slice(0,1000):'';if(!UUID.test(id)||!REPORT_STATUSES.has(status))return res.status(400).json({error:'bad_request'});try{const c=getServerSupabase(),patch={status,review_note:note,updated_at:new Date().toISOString()};if(['reviewed','dismissed','actioned'].includes(status)){patch.reviewed_by=req.uid;patch.reviewed_at=new Date().toISOString();}const {data,error}=await c.from('squado_safety_reports').update(patch).eq('id',id).select('*').maybeSingle();if(error)throw new Error('report_update_failed');if(!data)return res.status(404).json({error:'not_found'});await audit(req,'report.status','report',id,note,{status});res.json({report:data});}catch(e){logFailure('admin-report-update',e);res.status(503).json({error:'report_update_failed'});}});
  app.post('/api/admin/users/:uid/action',requireAuth,requireAdmin,async(req,res)=>{const uid=String(req.params.uid||''),action=req.body?.action,reason=typeof req.body?.reason==='string'?req.body.reason.trim().slice(0,1000):'';if(!UUID.test(uid)||!['warn','suspend','restore'].includes(action)||(action!=='restore'&&!reason))return res.status(400).json({error:'bad_request'});if(uid===req.uid)return res.status(409).json({error:'self_action_forbidden'});try{const c=getServerSupabase(),record={user_id:uid,status:action==='restore'?'active':action==='warn'?'warned':'suspended',reason,expires_at:null,updated_by:req.uid,updated_at:new Date().toISOString()};const {error}=await c.from('squado_account_restrictions').upsert(record,{onConflict:'user_id'});if(error)throw new Error('restriction_update_failed');await audit(req,'user.'+action,'user',uid,reason);res.json({ok:true,status:record.status});}catch(e){logFailure('admin-user-action',e);res.status(503).json({error:'moderation_unavailable'});}});
  app.get('/api/admin/audit',requireAuth,requireAdmin,async(req,res)=>{try{const {data,error}=await getServerSupabase().from('squado_admin_audit_log').select('*').order('created_at',{ascending:false}).limit(200);if(error)throw new Error('audit_read_failed');res.json({entries:data||[]});}catch(e){logFailure('admin-audit-read',e);res.status(503).json({error:'audit_unavailable'});}});
}
