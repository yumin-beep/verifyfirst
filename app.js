'use strict';
const $ = id => document.getElementById(id);
const examples = {
  payroll: 'Hi, this is Morgan from payroll. We are updating direct-deposit details before today’s deadline. Open https://payroll-review.invalid/update and enter your bank login and verification code. Please do not call the office; the phones are being upgraded.',
  family: 'Hey, it’s me. My phone broke and this is my new number. I need you to send $480 right now for a replacement. Please keep this between us and text me here when it is done.',
  account: 'I am Alex from account support. Your account will be suspended in 30 minutes. Install the RemoteAssist program and send me the access code so I can fix it. Contact support-agent@example.invalid if you have questions.',
  ordinary: 'Hi team, our study meeting has moved to room 204 at 3 pm. The updated schedule is also on the department noticeboard. No reply is needed. See you there.',
  korean: '엄마 나 휴대폰이 고장 나서 새 번호로 연락해. 지금 수리비 48만 원을 보내줘. 다른 가족에게는 말하지 말고 이 번호로만 답장해.'
};
const clientId = crypto.randomUUID();
const sourceOptions = [
  ['known_contact','A contact I already know','Saved or known before this message.'],
  ['official_site','An official site I find myself','Found separately, not through a link in the message.'],
  ['in_person','An in-person conversation','Speak to the person or organization directly.'],
  ['none','I don’t have a way to check yet','Keep this check pending or record that it is unclear.']
];
const stateOptions = [
  ['pending','I haven’t checked yet','Keep this item pending.'],
  ['confirmed','My independent check confirmed it','This records your observation, not automatic verification.'],
  ['contradicted','My independent check contradicted it','The separate source disagreed with the message.'],
  ['unclear','I still can’t tell','Record uncertainty without treating the message as safe.']
];
const sourceNames = Object.fromEntries(sourceOptions.map(x=>[x[0],x[1]]));
const stateNames = {pending:'Not checked yet',confirmed:'Confirmed by you',contradicted:'Contradicted by you',unclear:'Still unclear'};
const kindCheck = {payment:'payment',credential:'credential',remote_access:'access',software:'install',link:'link',channel_change:'change',secrecy:'secrecy',urgency:'urgency',other:'request'};
let revision=0, epoch=0, controller=null, analysis=null, model=null, manualMode=false, busy=false, checkSaving=false;
let view='editor', checkIndex=0, selectedEvidenceId=null, formOpen=false;
const drafts=new Map();
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function tell(text){$('message-status').textContent=text;}
function focusTitle(){$('view-title').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
async function api(path,body,signal){
  const response=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-VerifyFirst':'1'},body:body?JSON.stringify(body):undefined,signal,cache:'no-store'});
  let value;try{value=await response.json();}catch{throw new Error('The local server returned an unreadable response.');}
  if(!response.ok){const error=new Error(value.error?.message||'The local request could not be completed.');error.code=value.error?.code;throw error;}return value;
}
function counts(){$('counter').textContent=`${$('message').value.length.toLocaleString()} / 2,400`;}
function setBusy(value){busy=value;syncControls();}
function syncControls(){
  const locked=busy||checkSaving;
  for(const id of ['analyze','manual','edit-message','nav-message','check-select','evidence-select','return-message','open-check-form'])$(id).disabled=locked;
  $('nav-record').disabled=!analysis||locked;
  for(const control of $('check-form').querySelectorAll('button,select'))control.disabled=locked;
  for(const button of $('source-text').querySelectorAll('button'))button.disabled=locked;
  for(const button of $('summary-list').querySelectorAll('button'))button.disabled=locked;
  $('next-check').disabled=locked||!analysis||checkIndex===null||checkIndex>=analysis.checks.length-1;
  $('export').disabled=locked||!analysis||!analysis.checks.some(c=>c.state!=='pending');
  if(!locked&&analysis&&checkIndex!==null)syncOutcome();
}
function setView(next,focus=true){
  view=next;const record=next==='record',reading=next==='reader'||next==='loading';
  $('message-view').hidden=record;$('record-view').hidden=!record;$('editor').hidden=next!=='editor';$('document-reading').hidden=!reading;
  $('inspector-placeholder').hidden=next!=='editor';$('loading-panel').hidden=next!=='loading';$('check-panel').hidden=next!=='reader';
  $('edit-message').hidden=next!=='reader';$('nav-message').toggleAttribute('data-active',!record);
  if(record){$('nav-record').setAttribute('aria-current','page');$('nav-message').removeAttribute('aria-current');}
  else{$('nav-message').setAttribute('aria-current','page');$('nav-record').removeAttribute('aria-current');}
  $('view-title').textContent=record?'Your verification record':next==='loading'?'Reading the message':'Review a message';
  $('view-description').textContent=record?'These are your observations. They do not authenticate the sender.':'Find what to check through a source outside the message.';
  $('mode-badge').textContent=analysis?(manualMode?'Manual review · not verified':'Local AI · not verified'):'Not verified';
  $('analyze').textContent=analysis?'Return to review':'Find what to check';
  syncControls();if(focus)focusTitle();
}
function clearRendered(){
  for(const id of ['source-text','summary-list','evidence-select','check-select','analysis-notices'])$(id).replaceChildren();
  for(const id of ['claim-quote','evidence-kind','check-title','check-advice','model-meta','record-description','check-save-note'])$(id).textContent='';
  $('selected-evidence').hidden=true;$('findings-details').open=false;$('findings-details').hidden=true;$('evidence-browser').hidden=true;
  $('nav-count').textContent='0';$('evidence-count').textContent='';$('check-source').value='';$('check-outcome').value='pending';
}
function invalidate(message='',reset=true){
  const hadWork=!!analysis||busy||checkSaving;revision++;epoch++;controller?.abort();controller=null;analysis=null;model=null;manualMode=false;checkSaving=false;
  drafts.clear();checkIndex=0;selectedEvidenceId=null;formOpen=false;clearRendered();setBusy(false);setView('editor',false);counts();tell(message);
  if(hadWork&&reset)api('/api/reset',{client_id:clientId,revision}).catch(()=>{});return hadWork;
}
function loadExample(){invalidate();$('message').value=examples[$('example').value];$('source-label').textContent='Synthetic example';counts();}
function readCheckedResult(value,expectedText){
  if(!value||!Array.isArray(value.claims)||!Array.isArray(value.requests)||!Array.isArray(value.channels)||!Array.isArray(value.checks)||!value.checks.length||typeof value.id!=='string'||typeof value.text!=='string'||(expectedText!==undefined&&value.text!==expectedText))throw new Error('The local server returned an incomplete analysis. No verification was recorded.');
  if(value.checks.some(c=>!c||typeof c.id!=='string'||typeof c.title!=='string'||!Object.hasOwn(stateNames,c.state)))throw new Error('The local server returned an invalid checklist. No verification was recorded.');
  return value;
}
async function analyze(){
  if(busy||checkSaving)return;if(analysis){setView('reader');return;}
  const text=$('message').value;if(!text.trim()){tell('Add a message first, or select a fictional example.');$('message').focus();return;}
  invalidate();const ticket=++epoch,currentRevision=++revision;controller=new AbortController();setBusy(true);
  $('source-text').textContent=text;$('source-hint').textContent='Looking for exact source quotations…';setView('loading');
  try{
    const result=await api('/api/analyze',{text,client_id:clientId,revision:currentRevision},controller.signal);if(ticket!==epoch)return;
    analysis=readCheckedResult(result.analysis,text);model=result.model;manualMode=false;prepareReview();
  }catch(error){if(ticket!==epoch||error.name==='AbortError')return;clearRendered();setView('editor');tell(`${error.message} You can retry or review without AI.`);}
  finally{if(ticket===epoch){setBusy(false);controller=null;}}
}
async function startManual(){
  if(busy||checkSaving)return;const text=$('message').value;if(!text.trim()){tell('Add a message first, or select a fictional example.');$('message').focus();return;}
  invalidate();const ticket=++epoch;controller=new AbortController();setBusy(true);tell('Opening the manual checklist…');
  try{
    const data=await api('/api/manual',undefined,controller.signal);if(ticket!==epoch)return;
    analysis=readCheckedResult({id:`manual-${crypto.randomUUID()}`,text,claims:[],requests:[],channels:[],checks:(data.checks||[]).map(c=>({...c,state:'pending',source_type:null})),notices:data.notices||[]},text);
    manualMode=true;model=null;prepareReview();
  }catch(error){if(ticket===epoch&&error.name!=='AbortError')tell(error.message);}
  finally{if(ticket===epoch){setBusy(false);controller=null;}}
}
function allEvidence(){
  if(!analysis)return[];
  return ['claims','requests','channels'].flatMap(group=>analysis[group].map(item=>({...item,group}))).filter(item=>typeof item.id==='string'&&typeof item.quote==='string'&&item.quote.length>0&&Number.isInteger(item.start)&&Number.isInteger(item.end)&&item.start>=0&&item.end<=analysis.text.length&&item.end>item.start&&analysis.text.slice(item.start,item.end)===item.quote);
}
function checkForEvidence(item){
  if(!item)return null;
  const id=item.group==='channels'?'channel':item.group==='claims'?(['identity','role','relationship'].includes(item.kind)?'identity':null):kindCheck[item.kind];
  const index=analysis.checks.findIndex(c=>c.id===id);return index<0?null:index;
}
function relatedEvidence(check){
  const items=allEvidence();if(check.id==='identity')return items.find(i=>i.group==='claims'&&['identity','role','relationship'].includes(i.kind))||null;
  if(check.id==='channel')return items.find(i=>i.group==='channels')||null;
  if(check.id==='request')return items.find(i=>i.group==='requests')||null;
  return items.find(i=>checkForEvidence(i)!==null&&analysis.checks[checkForEvidence(i)].id===check.id)||null;
}
function renderSource(){
  if(!analysis)return;const source=$('source-text');source.replaceChildren();const items=allEvidence(),chosen=items.find(i=>i.id===selectedEvidenceId);
  // The source remains byte-for-byte equivalent as visible text. Overlapping
  // model spans stay accessible individually through the complete phrase menu.
  const ordered=[...items].sort((a,b)=>a.start-b.start||b.end-a.end);let at=0;
  for(const item of ordered){
    if(item.start<at)continue;source.append(document.createTextNode(analysis.text.slice(at,item.start)));
    const button=node('button','phrase',item.quote);button.type='button';button.dataset.evidenceId=item.id;
    button.setAttribute('aria-pressed',String(!!chosen&&chosen.start<item.end&&chosen.end>item.start));
    button.setAttribute('aria-label',`Inspect ${item.label||item.kind}: ${item.quote}`);button.addEventListener('click',()=>selectEvidence(item.id));source.append(button);at=item.end;
  }
  source.append(document.createTextNode(analysis.text.slice(at)));
  $('source-hint').textContent=manualMode?'Manual review: read the original text while making your own checks.':items.length?'Select an underlined phrase to inspect it.':'No supported quote was extracted. This does not mean the message is safe.';
  $('evidence-count').textContent=manualMode?'No AI call':`${items.length} source quotes`;
  $('evidence-browser').hidden=!items.length;$('evidence-select').replaceChildren();
  const placeholder=node('option','',selectedEvidenceId?'Select an extracted phrase':'Choose a source phrase');placeholder.value='';$('evidence-select').append(placeholder);
  for(const item of items){const label=`${item.label||item.kind} · ${item.quote}`;const option=node('option','',label.length>130?label.slice(0,127)+'…':label);option.value=item.id;$('evidence-select').append(option);}
  $('evidence-select').value=selectedEvidenceId||'';
  $('analysis-notices').replaceChildren();for(const notice of analysis.notices||[])$('analysis-notices').append(node('p','',typeof notice==='string'?notice:notice.message||''));
  $('findings-details').hidden=manualMode;
  $('model-meta').textContent=manualMode?'No model call':`${model?.name||'Local model'} · ${Number.isFinite(model?.elapsed_ms)?(model.elapsed_ms/1000).toFixed(2)+' s':'response received'} · exact-source quotations checked by the app`;
}
function prepareReview(){
  drafts.clear();checkIndex=0;selectedEvidenceId=null;formOpen=false;
  const firstRequest=allEvidence().find(i=>i.group==='requests'&&checkForEvidence(i)!==null);
  if(firstRequest){selectedEvidenceId=firstRequest.id;checkIndex=checkForEvidence(firstRequest);}else selectedEvidenceId=relatedEvidence(analysis.checks[0])?.id||null;
  renderSource();renderCheck();updateRecordCount();setView('reader');tell('');
}
function draftFor(check){if(!drafts.has(check.id))drafts.set(check.id,{source:check.source_type||'',state:check.state});return drafts.get(check.id);}
function isDirty(check){const draft=drafts.get(check.id);return !!draft&&(draft.source!==(check.source_type||'')||draft.state!==check.state);}
function updateRecordCount(){$('nav-count').textContent=analysis?String(analysis.checks.filter(c=>c.state!=='pending').length):'0';}
function selectEvidence(id){
  if(!analysis||busy||checkSaving)return;const item=allEvidence().find(i=>i.id===id);if(!item)return;
  const fromPhrase=$('source-text').contains(document.activeElement);
  selectedEvidenceId=id;checkIndex=checkForEvidence(item);formOpen=false;renderSource();renderCheck();tell('');
  if(window.matchMedia('(max-width:700px)').matches){$('check-title').focus({preventScroll:true});$('check-panel').scrollIntoView({block:'start',behavior:'instant'});}
  else if(fromPhrase){[...$('source-text').querySelectorAll('button')].find(button=>button.dataset.evidenceId===id)?.focus({preventScroll:true});}
}
function selectCheck(index,focus=false){
  if(!analysis||busy||checkSaving||!Number.isInteger(index)||index<0||index>=analysis.checks.length)return;
  checkIndex=index;selectedEvidenceId=relatedEvidence(analysis.checks[index])?.id||null;formOpen=false;renderSource();renderCheck();setView('reader',focus);tell('');
}
function renderCheck(){
  if(!analysis)return;const item=allEvidence().find(i=>i.id===selectedEvidenceId),check=checkIndex===null?null:analysis.checks[checkIndex];
  $('check-select').replaceChildren();if(!check){const option=node('option','','Choose a check to record');option.value='';$('check-select').append(option);}
  analysis.checks.forEach((entry,index)=>{const option=node('option','',`${index+1}. ${entry.title} · ${stateNames[entry.state]}`);option.value=String(index);$('check-select').append(option);});
  $('check-select').value=check?String(checkIndex):'';$('check-position').textContent=check?`${checkIndex+1} of ${analysis.checks.length}`:`${analysis.checks.length} available`;
  $('selected-evidence').hidden=!item;$('claim-quote').textContent=item?.quote||'';$('evidence-kind').textContent=item?.label||item?.kind||'';
  $('check-title').textContent=check?.title||item?.label||'Inspect this phrase';
  $('check-advice').textContent=check?.why||check?.detail||'This is a claim in the message, not an established fact. Use a previously known contact or an official site found separately to ask about its exact wording.';
  $('no-linked-check').hidden=!!check;$('check-form').hidden=!check||!formOpen;$('check-entry').hidden=!check||formOpen;
  $('open-check-form').setAttribute('aria-expanded',String(!!check&&formOpen));$('open-check-form').textContent=check?.source_type?'Update your check':'Record your check';
  $('check-save-note').hidden=!check;
  if(check){const draft=draftFor(check);$('check-source').value=draft.source;$('check-outcome').value=draft.state;syncOutcome();updateSaveNote();}
  syncControls();
}
function syncOutcome(){
  if(!analysis||checkIndex===null)return;const check=analysis.checks[checkIndex],draft=draftFor(check),independent=['known_contact','official_site','in_person'].includes(draft.source);
  for(const option of $('check-outcome').options)if(['confirmed','contradicted'].includes(option.value))option.disabled=!independent;
  $('source-help').textContent=sourceOptions.find(x=>x[0]===draft.source)?.[2]||'Use a route obtained outside this message.';
  $('outcome-help').textContent=independent?'Record only what you actually learned through this source.':'Confirmation or contradiction needs an independent source.';
}
function updateSaveNote(){
  if(!analysis||checkIndex===null)return;const check=analysis.checks[checkIndex],dirty=isDirty(check);$('check-save-note').dataset.dirty=String(dirty);
  $('check-save-note').textContent=dirty?'Unsaved choices. Select “Save check” to add them to your record.':check.source_type?`Saved: ${stateNames[check.state]}. This is your observation.`:'No independent check recorded. Choosing a source alone confirms nothing.';
}
function changeSource(){
  if(!analysis||checkIndex===null||checkSaving)return;const draft=draftFor(analysis.checks[checkIndex]);draft.source=$('check-source').value;
  if(!['known_contact','official_site','in_person'].includes(draft.source)&&['confirmed','contradicted'].includes(draft.state)){draft.state='pending';$('check-outcome').value='pending';tell('Outcome reset to pending because an independent source is required.');}else tell('');
  syncOutcome();updateSaveNote();
}
async function saveCheck(event){
  event.preventDefault();if(!analysis||busy||checkSaving||checkIndex===null)return;const check=analysis.checks[checkIndex],draft=draftFor(check);
  if(!draft.source){tell('Choose the independent source you used, or select “I don’t have a way to check yet”.');$('check-source').focus();return;}
  if(!Object.hasOwn(stateNames,draft.state)){tell('Choose the outcome of your own check.');$('check-outcome').focus();return;}
  if(['confirmed','contradicted'].includes(draft.state)&&!['known_contact','official_site','in_person'].includes(draft.source)){tell('A confirmed or contradicted outcome needs the independent source you actually used. Otherwise keep it pending or unclear.');$('check-source').focus();return;}
  const ticket=epoch,activeId=analysis.id,source=draft.source,state=draft.state,text=analysis.text,saveFocus=document.activeElement;checkSaving=true;controller=new AbortController();syncControls();tell('Saving your check…');
  try{
    if(manualMode){check.state=state;check.source_type=source;}
    else{const response=await api('/api/check',{analysis_id:activeId,check_id:check.id,state,source_type:source,client_id:clientId,revision},controller.signal);if(ticket!==epoch||analysis?.id!==activeId)return;analysis=readCheckedResult(response.analysis,text);}
    if(ticket!==epoch)return;drafts.delete(check.id);formOpen=false;updateRecordCount();renderCheck();tell('Check saved to your record. The message is still not authenticated.');
  }catch(error){if(ticket!==epoch||error.name==='AbortError')return;if(error.code==='stale'){invalidate(`${error.message} Run a new analysis or review without AI.`);focusTitle();}else tell(error.message);}
  finally{if(ticket===epoch){checkSaving=false;controller=null;syncControls();if(document.activeElement===document.body||document.activeElement===saveFocus)$(formOpen?'save-check':'open-check-form').focus({preventScroll:true});}}
}
function showRecord(){
  if(!analysis||busy||checkSaving)return;const saved=analysis.checks.filter(c=>c.state!=='pending'),totals={confirmed:0,contradicted:0,unclear:0};saved.forEach(c=>totals[c.state]++);
  $('record-description').textContent=`${saved.length} of ${analysis.checks.length} checks recorded. ${totals.confirmed} confirmed by you · ${totals.contradicted} contradicted · ${totals.unclear} unclear · ${analysis.checks.length-saved.length} pending.`;
  $('summary-list').replaceChildren();analysis.checks.forEach((check,index)=>{
    const row=node('article','summary-row'),copy=node('div','summary-copy'),action=node('div','summary-action');copy.append(node('h2','',check.title),node('p','',check.source_type&&check.source_type!=='none'?sourceNames[check.source_type]:'No independent source recorded'));
    const badge=node('span','result-badge',stateNames[check.state]);badge.dataset.state=check.state;const edit=node('button','text-button','Change');edit.type='button';edit.setAttribute('aria-label',`Change: ${check.title}`);edit.addEventListener('click',()=>selectCheck(index,true));action.append(badge,edit);row.append(copy,action);$('summary-list').append(row);
  });setView('record');tell(analysis.checks.some(isDirty)?'Unsaved choices are kept while you navigate, but are not included in this record.':'');
}
function showMessage(){if(busy||checkSaving)return;setView(analysis?'reader':'editor');tell('');}
function exportRecord(){
  if(!analysis||!analysis.checks.some(c=>c.state!=='pending'))return;
  const record={tool:'VerifyFirst',version:1,created_at:new Date().toISOString(),mode:manualMode?'manual':'local_ai',model:manualMode?null:model?.name,checks:analysis.checks.map(({id,title,state,source_type})=>({id,title,state,source_type})),meaning:'User-recorded verification steps, not an automated fraud or identity verdict. Original message and extracted quotes are deliberately excluded.'};
  const url=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download='VerifyFirst-verification-record.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);tell('Record export requested. The original message and source quotes are excluded.');
}
for(const [value,label] of sourceOptions){const option=node('option','',label);option.value=value;$('check-source').append(option);}
for(const [value,label] of stateOptions){const option=node('option','',label);option.value=value;$('check-outcome').append(option);}
$('analyze').addEventListener('click',analyze);$('manual').addEventListener('click',startManual);$('export').addEventListener('click',exportRecord);
$('example').addEventListener('change',loadExample);$('check-form').addEventListener('submit',saveCheck);$('check-source').addEventListener('change',changeSource);
$('open-check-form').addEventListener('click',()=>{if(!analysis||checkIndex===null||checkSaving)return;formOpen=true;renderCheck();$('check-source').focus();});
$('close-check-form').addEventListener('click',()=>{if(checkSaving)return;formOpen=false;renderCheck();$('open-check-form').focus();});
$('check-outcome').addEventListener('change',()=>{if(!analysis||checkIndex===null||checkSaving)return;draftFor(analysis.checks[checkIndex]).state=$('check-outcome').value;updateSaveNote();tell('');});
$('check-select').addEventListener('change',()=>{if($('check-select').value!=='')selectCheck(Number($('check-select').value));});
$('evidence-select').addEventListener('change',()=>selectEvidence($('evidence-select').value));$('next-check').addEventListener('click',()=>selectCheck(checkIndex+1));
$('nav-message').addEventListener('click',showMessage);$('nav-record').addEventListener('click',showRecord);$('return-message').addEventListener('click',showMessage);
$('cancel').addEventListener('click',()=>{invalidate('Review cancelled.');focusTitle();});
$('edit-message').addEventListener('click',()=>{if(busy||checkSaving)return;setView('editor');tell('Editing the text will clear earlier analysis and checks.');$('message').focus();});
$('message').addEventListener('input',()=>{invalidate('Message changed. Earlier analysis and checks were cleared.');$('source-label').textContent='Your text';});
$('clear').addEventListener('click',()=>{invalidate('Session cleared.');$('message').value='';$('source-label').textContent='Your text';counts();$('message').focus();});
window.addEventListener('pagehide',()=>{const hadWork=invalidate('',false);$('message').value='';counts();if(hadWork)fetch('/api/reset',{method:'POST',headers:{'Content-Type':'application/json','X-VerifyFirst':'1'},body:JSON.stringify({client_id:clientId,revision}),keepalive:true}).catch(()=>{});});
loadExample();api('/api/health').then(h=>{$('model-status').textContent=h.model_available?'Local model ready':'Local model unavailable';$('model-status').title=h.model||'';}).catch(()=>{$('model-status').textContent='Local server unavailable';});
