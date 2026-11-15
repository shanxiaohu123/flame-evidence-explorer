/* Static-first prototype. No tracking, no external assets, no client-side API key. */
'use strict';
function escapeHtml(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const forLanguage=language=>(zh,en)=>language==='en'?en:zh;
const localized=(item,language)=>language==='en'?{...item,...item.en}:item;
function queryNote(q,language='zh') {
 const t=forLanguage(language);
 if (/月球|火星|lunar|\bmoon\b|mars|安全阈值|安全氧|safe oxygen|safety threshold|认证|certif|最安全|safest|最危险|most dangerous|风险概率|risk probability/i.test(q)) return t('证据不足：安全阈值需要与目标环境和材料相匹配的实验。','Insufficient evidence: safety thresholds require tests that match the target environment and materials.');
 if (/\d/.test(q) && !/284/.test(q)) return t('以下文献按关键词匹配。具体数值条件需对照来源中的实验记录。','These abstracts match your keywords. Check the cited experiment records for the exact numerical conditions.');
 return '';
}
function rankSources(data,query='',theme='') {
 const q=query.toLowerCase().trim();
 return data.sources.filter(s=>!theme||s.theme===theme).map(s=>{
  const words=[...new Set([...s.keywords,...data.claims.filter(c=>c.source_id===s.id).flatMap(c=>c.keywords)])];
  const hits=q ? words.filter(w=>q.includes(w.toLowerCase())) : [];
  const exact=q && q.includes(s.name.toLowerCase()) ? 3:0;
  return {source:s,score:hits.length+exact,hits};
 }).filter(r=>!q||r.score>0).sort((a,b)=>b.score-a.score||a.source.id.localeCompare(b.source.id));
}
function rankedClaims(data,query,top=6) {
 const rows=rankSources(data,query); const q=query.toLowerCase();
 const counts=new Map(rows.map(r=>[r.source.id,r.score]));
 return data.claims.filter(c=>counts.has(c.source_id)).map(c=>({claim:c,score:counts.get(c.source_id)+2*c.keywords.filter(k=>q.includes(k.toLowerCase())).length})).sort((a,b)=>b.score-a.score||a.claim.id.localeCompare(b.claim.id)).slice(0,top).map(x=>x.claim);
}
const gasNames={o2:'O₂',n2:'N₂',co2:'CO₂',he:'He'};
const fuelNames={Methanol:'甲醇',Heptane:'庚烷'};
const endNames={Extinction:'熄焰',Disruption:'液滴破裂',Completion:'燃烧完成'};
const metricRoles={observation:'观察结果',condition:'实验条件'};
const metricRolesEn={observation:'Observation',condition:'Experimental condition'};
const ntrsAccessNote='本机访问此 NTRS 原址返回 HTTP 403。';
const ntrsNote=language=>forLanguage(language)(ntrsAccessNote,'This NTRS address returned HTTP 403 in the local access check.');
const flexDataLinkLabel=language=>forLanguage(language)('打开 NASA PSI-69 官方实验表','Open the NASA PSI-69 experiment table');

function externalLink(url,label){
 return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function citationDetails({label,title,locator,originalUrl,reviewUrl,reviewLabel,language,accessNote=ntrsNote(language)}){
 return `<details class="citation"><summary>${escapeHtml(label)}</summary><p><strong>${escapeHtml(title)}</strong></p><p>${externalLink(reviewUrl,reviewLabel+' ↗')}</p><p class="muted">${escapeHtml(locator)}</p><p class="muted citation-url">${forLanguage(language)('NASA NTRS 原始出处','Original NASA NTRS reference')} <code>${escapeHtml(originalUrl)}</code><br>${escapeHtml(accessNote)}</p></details>`;
}

function markdownOriginalAddress(url){
 return '`'+url+'`';
}

function exactPositive(raw){
 const value=Number(raw);
 return Number.isFinite(value)&&value>0?value:null;
}

function numericCell(raw,marker,language='zh'){
 const t=forLanguage(language);
 if(raw==null)return marker?marker+t('（缺值）',' (missing)'):t('未列值','Not reported');
 if(raw.startsWith('~'))return raw+t('（约数）',' (approx.)');
 return exactPositive(raw)==null?raw+t('（待核）',' (unverified)'):raw;
}

function gasKey(record){
 const fractions=Object.keys(gasNames).map(gas=>record.initial_mole_fractions[gas]);
 return fractions.some(value=>value==null)?null:fractions.join('|');
}

function gasLabel(value,language='zh'){
 return value==null?forLanguage(language)('未列值','Not reported'):value.split('|').map((fraction,index)=>Object.values(gasNames)[index]+' '+fraction).join(' / ');
}

const flexFilters=[
 {key:'material',label:'燃料',labelEn:'Fuel',value:row=>row.material,display:(value,language)=>language==='en'?value:fuelNames[value]||value},
 {key:'mixture',label:'初始气体配比（摩尔分数）',labelEn:'Initial gas mixture (mole fractions)',value:gasKey,display:gasLabel},
 {key:'test_end',label:'试验结束分类（结果）',labelEn:'Test end (outcome)',value:row=>row.test_end,display:(value,language)=>language==='en'?value:endNames[value]||value},
];

function selectFlexRecords(records,selection){
 return records.filter(row=>flexFilters.every(filter=>!selection[filter.key]||filter.value(row)===selection[filter.key]));
}

function analyzeFlex(records,metric){
 const points=[];
 let missing=0;
 let excluded=0;
 for(const record of records){
  const raw=record.metrics[metric];
  const value=exactPositive(raw);
  if(raw==null)missing++;
  else if(value==null)excluded++;
  else points.push({record,raw,value});
 }
 const ordered=[...points].sort((a,b)=>a.value-b.value);
 return {points,missing,excluded,min:ordered[0],max:ordered.at(-1)};
}

function flexComparison(records,language='zh'){
 const t=forLanguage(language);
 if(!records.length)return t('当前条件没有匹配记录。','No records match these filters.');
 const conditions=[
  [t('燃料','fuel'),row=>row.material],
  [t('几何','geometry'),row=>row.geometry],
  [t('初始气体配比','initial gas mixture'),gasKey],
  [t('环境压力','ambient pressure'),row=>exactPositive(row.pressure_mmhg)],
  [t('初始液滴直径','initial droplet diameter'),row=>exactPositive(row.metrics.initial_diameter)],
 ];
 const differences=[];
 const missing=[];
 for(const [label,getValue] of conditions){
  const values=records.map(getValue);
  const known=new Set(values.filter(value=>value!=null));
  if(known.size>1)differences.push(label);
  if(values.includes(null))missing.push(label);
 }
 const details=[];
 if(differences.length)details.push(t('筛选结果存在条件差异（'+differences.join('、')+'）。','Selected records differ in '+differences.join(', ')+'.'));
 if(missing.length)details.push(t('部分记录缺少可用于比较的'+missing.join('、')+'。','Some records lack comparable values for '+missing.join(', ')+'.'));
 details.push(t('图表区间按当前筛选记录计算。','The chart shows the range for the selected records.'));
 return details.join(t('',' '));
}

function flexSummary(records,analysis,metricKey,metric,language='zh'){
 const t=forLanguage(language);
 const excluded=analysis.excluded?t(` · ${analysis.excluded} 条为约数或待核零值，留在表格中`,` · ${analysis.excluded} approximate or unverified values kept in the table`):'';
 const coverage=t(`匹配 ${records.length} 条 · 图中 ${analysis.points.length} 条精确值 · ${analysis.missing} 条缺值${excluded}。`,`${records.length} matching records · ${analysis.points.length} plotted values · ${analysis.missing} missing${excluded}.`);
 if(!analysis.min)return coverage;
 const range=t(` ${metricRoles[metric.role]} · ${metric.label}的原表数值范围为 ${analysis.min.raw}–${analysis.max.raw} ${metric.unit}。`,` ${metricRolesEn[metric.role]} · ${metric.label}: ${analysis.min.raw}–${analysis.max.raw} ${metric.unit}.`);
 if(metricKey!=='extinction_diameter')return coverage+range;
 const otherEnds=analysis.points.filter(({record})=>record.test_end==='Disruption'||record.test_end==='Completion').length;
 const note=otherEnds?t(` 图中有 ${otherEnds} 条的结束分类为液滴破裂或燃烧完成。直径与结束分类按原表分别展示。`,` ${otherEnds} plotted records ended in droplet disruption or completion. The diameter and outcome are shown as recorded in the source table.`):'';
 return coverage+range+note;
}

function flexBrief(caseStudy,records,selection,metricKey,language='zh'){
 const t=forLanguage(language);
 const {source,report,fulltext_evidence,metrics}=caseStudy;
 const metric=localized(metrics[metricKey],language);
 const conditions=flexFilters.map(({key,label,labelEn,display})=>'- '+t(label,labelEn)+' · '+(selection[key]?display(selection[key],language):t('全部','All')));
 const includeResult=metric.role==='observation';
 const headers=[
  t('记录 ID','Record ID'),t('试验号','Test ID'),t('FLEX 标识','FLEX identifier'),t('燃料','Fuel'),
  t('初始气体（摩尔分数）','Initial gas (mole fractions)'),t('压力 (mmHg)','Pressure (mmHg)'),
  t('初始直径 (mm)（条件）','Initial diameter (mm, condition)'),t('结束分类（结果）','End classification (outcome)'),
  ...(includeResult?[metric.label+' ('+metric.unit+')']:[]),t('定位','Source location'),
 ];
 const rows=records.map(row=>[
  row.record_id,row.test_id,row.flex_identifier,row.material,gasLabel(gasKey(row),language),
  numericCell(row.pressure_mmhg,null,language),numericCell(row.metrics.initial_diameter,row.original_markers?.initial_diameter,language),row.test_end,
  ...(includeResult?[numericCell(row.metrics[metricKey],row.original_markers?.[metricKey],language)]:[]),
  t('CSV 行 ','CSV row ')+row.locator.csv_line,
 ].join(' | '));
 const table=[headers.join(' | '),headers.map(()=>'---').join(' | '),...rows];
 const localizedCase=localized(caseStudy,language);
 return [
  t('# FLEX 液滴实验简报','# FLEX Droplet Experiment Brief'),
  t('## 当前筛选','## Current filters'),...conditions,'- '+t('图表字段','Chart field')+' · '+t(metricRoles[metric.role],metricRolesEn[metric.role])+' · '+metric.label+' ('+metric.unit+')','',
  t('## 规则生成的说明','## Rule-based summary'),
  flexSummary(records,analyzeFlex(records,metricKey),metricKey,metric,language),flexComparison(records,language),
  localizedCase.missing_notes,'',
  t('## 筛选记录','## Filtered records'),...(rows.length?table:[t('当前条件没有匹配记录。','No records match these filters.')]),'',
  t('## 出处与适用边界','## Sources and limitations'),
  `- [${source.id}] ${source.title} · [${flexDataLinkLabel(language)}](${source.url}) · ${source.original_filename} v${source.file_version} · ${source.license} · SHA-256 ${source.sha256}`,
  '- '+t('数据范围','Dataset scope')+' · '+localizedCase.scope,
  '- '+t('样品为液滴，数值沿用 NASA PSI 汇总表的单位与精度。','The samples are droplets. Values use the units and precision of the NASA PSI summary table.'),
  ...fulltext_evidence.map(item=>{
   const claim=localized(item,language);
   return `- [${claim.id}] ${report.title} · NTRS ${report.document_id} · ${claim.locator}\n  ${claim.text} ${claim.limitation}\n  ${t('报告 PDF 原址','Original report PDF')} ${markdownOriginalAddress(report.url)} (${localized(report,language).access_note})`;
  }),'',
 ].join('\n');
}

function renderFlexCase(caseStudy,download){
 const {source,report,records,metrics,fulltext_evidence}=caseStudy;
 const $=id=>document.getElementById(id);
 const esc=escapeHtml;
 const embeddedCsv=window.FLAME_SOURCE_CSV_BASE64;
 const csvUrl=embeddedCsv
  ?URL.createObjectURL(new Blob([Uint8Array.from(atob(embeddedCsv),byte=>byte.charCodeAt(0))],{type:'text/csv;charset=windows-1252'}))
  :'sources/'+encodeURIComponent(source.original_filename);
 const option=(value,label)=>`<option value="${esc(value)}">${esc(label)}</option>`;
 const field=(id,label,options)=>`<label for="${id}">${esc(label)}<select id="${id}">${options}</select></label>`;
 let language='en';
 function state(){
  const selection=Object.fromEntries(flexFilters.map(filter=>[filter.key,$('flex-'+filter.key).value]));
  const metricKey=$('flex-metric').value;
  return {selection,metricKey,filtered:selectFlexRecords(records,selection)};
 }
 function render(nextLanguage){
  const previous=$('flex-metric')?state():null;
  language=nextLanguage;
  const t=forLanguage(language);
  const copy=localized(caseStudy,language);
  const metricOptions=Object.entries(metricRoles).map(([role,label])=>{
   const options=Object.entries(metrics).filter(([,metric])=>metric.role===role)
    .map(([key,metric])=>option(key,localized(metric,language).label+' ('+metric.unit+')')).join('');
   return `<optgroup label="${t(label,metricRolesEn[role])}">${options}</optgroup>`;
  }).join('');
  function reportCitation(label,locator){
   return citationDetails({label,title:report.title,locator:'NTRS '+report.document_id+' · '+locator,
    originalUrl:report.url,reviewUrl:source.url,reviewLabel:flexDataLinkLabel(language),language,
    accessNote:localized(report,language).access_note});
  }
  $('flexSource').innerHTML=`<strong>${t('NASA PSI 官方实验汇总表','NASA PSI experiment summary table')} · ${records.length} ${t('条','records')}</strong><p>${esc(copy.scope)}</p><p class="muted">${t('数值沿用 CSV v'+source.file_version+' 的单位和精度。','Values use the units and precision of CSV v'+source.file_version+'.')}</p><p>${externalLink(source.url,flexDataLinkLabel(language)+' ↗')} · <a id="flexDownloadCsv" href="${esc(csvUrl)}" download="${esc(source.original_filename)}">${t('下载 NASA 原版 CSV','Download original NASA CSV')}</a></p>`+
   reportCitation(t('查看 FLEX 报告出处','View the FLEX report citation'),t('NASA/TP–2015-216046 · 表 IX，试验号 1–31 对照印刷页 20','NASA/TP–2015-216046 · Table IX, printed page 20 for tests 1–31'));
  $('flexFilters').innerHTML=flexFilters.map(filter=>{
   const values=[...new Set(records.map(filter.value).filter(value=>value!=null))];
   return field('flex-'+filter.key,t(filter.label,filter.labelEn),option('',t('全部','All'))+values.map(value=>option(value,filter.display(value,language))).join(''));
  }).join('')+field('flex-metric',t('图表字段','Chart field'),metricOptions);
  if(previous){
   for(const [key,value] of Object.entries(previous.selection))$('flex-'+key).value=value;
   $('flex-metric').value=previous.metricKey;
  }
  $('flexEvidence').innerHTML=fulltext_evidence.map(item=>{
   const claim=localized(item,language);
   return `<div class="evidence"><strong>[${esc(claim.id)}] ${esc(claim.type)} · ${t('研究层级','Study-level evidence')}</strong><p>${esc(claim.text)}</p><p class="muted">${esc(claim.conditions)} · ${esc(claim.scope)}${t('。','.') } ${esc(claim.limitation)}</p>${reportCitation(t('查看方法出处','View the methods citation'),claim.locator)}</div>`;
  }).join('')+`<p class="muted">${esc(copy.missing_notes)}</p>`;
  update();
 }
 function update(){
  const t=forLanguage(language);
  const {metricKey,filtered}=state();
  const metric=localized(metrics[metricKey],language);
  const analysis=analyzeFlex(filtered,metricKey);
  const scale=analyzeFlex(records,metricKey).max?.value||1;
  $('flexSummary').textContent=t('规则生成 · ','Rule-based summary · ')+flexSummary(filtered,analysis,metricKey,metric,language);
  $('flexComparison').textContent=flexComparison(filtered,language);
  const chartNote=t(`每条横条对应一个试验记录，标尺 0–${scale} ${metric.unit}。点击试验号定位到表格记录。`,`One bar per test record. Scale: 0–${scale} ${metric.unit}. Select a test number to jump to its row.`);
  $('flexChart').innerHTML=`<figcaption><strong>${t(metricRoles[metric.role],metricRolesEn[metric.role])} · ${esc(metric.label)} (${esc(metric.unit)})</strong><p class="muted">${esc(chartNote)}</p></figcaption>`+
   (analysis.points.length?`<div class="flex-bars">${analysis.points.map(({record,raw})=>`<div class="flex-bar" data-record-id="${esc(record.record_id)}"><a href="#${esc(record.record_id)}">FLEX ${esc(record.test_id)}</a><meter min="0" max="${esc(scale)}" value="${esc(raw)}" aria-label="FLEX ${esc(record.test_id)} · ${esc(metric.label)}">${esc(raw)}</meter><span>${esc(raw)} ${esc(metric.unit)}</span></div>`).join('')}</div>`:`<p>${t('当前没有可绘制的数值。','No values to plot for this selection.')}</p>`);
  const headers=[
   t('FLEX 试验 / 标识','FLEX test / identifier'),t('燃料','Fuel'),t('初始气体（摩尔分数）','Initial gas (mole fractions)'),t('压力 (mmHg)','Pressure (mmHg)'),t('结束分类（结果）','End classification (outcome)'),
   ...Object.values(metrics).map(item=>`${localized(item,language).label} (${item.unit})${item.role==='condition'?t('（条件）',' (condition)'):''}`),
   t('原始出处定位','Source location'),
  ];
  const cell=value=>esc(value??t('未列值','Not reported'));
  $('flexTable').innerHTML=filtered.length?`<table><thead><tr>${headers.map(label=>`<th scope="col">${esc(label)}</th>`).join('')}</tr></thead><tbody>${filtered.map(row=>`<tr id="${esc(row.record_id)}"><th scope="row">${esc(row.test_id)}<br><small>${esc(row.flex_identifier)}</small></th><td>${cell(flexFilters[0].display(row.material,language))}</td><td>${cell(gasLabel(gasKey(row),language))}</td><td>${cell(numericCell(row.pressure_mmhg,null,language))}</td><td>${cell(flexFilters[2].display(row.test_end,language))}</td>${Object.keys(metrics).map(key=>`<td>${cell(numericCell(row.metrics[key],row.original_markers?.[key],language))}</td>`).join('')}<td>${externalLink(source.url,t('PSI-69 · CSV 行 ','PSI-69 · CSV row ')+row.locator.csv_line+' ↗')}<br><small>${esc(row.record_id)}</small></td></tr>`).join('')}</tbody></table>`:`<p>${t('筛选后没有记录。','No records match these filters.')}</p>`;
 }
 $('flexFilters').addEventListener('change',update);
 $('flexExportData').addEventListener('click',()=>{
  const {selection,metricKey,filtered}=state();
  const payload={...caseStudy,selection,selected_metric:metricKey,records:filtered};
  download(JSON.stringify(payload,null,2),'flex_filtered_records.json','application/json');
 });
 $('flexExportBrief').addEventListener('click',()=>{
  const {selection,metricKey,filtered}=state();
  download(flexBrief(caseStudy,filtered,selection,metricKey,language),'flex_evidence_brief.md','text/markdown;charset=utf-8');
 });
 return render;
}


if (typeof module!=='undefined') module.exports={
 escapeHtml,queryNote,rankSources,rankedClaims,gasKey,selectFlexRecords,analyzeFlex,flexComparison,flexBrief,
};
if (typeof window!=='undefined') boot();
function boot(){
 const data=window.FLAME_DATA;
 const byId=Object.fromEntries(data.sources.map(s=>[s.id,s]));
 const claimsById=Object.fromEntries(data.claims.map(c=>[c.id,c]));
 const $=id=>document.getElementById(id);
 const esc=escapeHtml;
 let language='en';
 try{if(localStorage.getItem('flame-language')==='zh')language='zh';}catch(_){}
 const t=(zh,en)=>forLanguage(language)(zh,en);
 const staticText=[...document.querySelectorAll('[data-zh]')].map(node=>[node,node.textContent,node.dataset.zh]);
 const staticAttributes=['placeholder','aria-label'].flatMap(attribute=>{
  const source=attribute==='aria-label'?'data-zh-aria':'data-zh-placeholder';
  return [...document.querySelectorAll('['+source+']')].map(node=>[node,attribute,node.getAttribute(attribute),node.getAttribute(source)]);
 });
 const themeNames={'固体燃烧':'Solid fuel combustion','烟雾探测':'Smoke detection','液滴燃烧':'Droplet combustion'};
 const examples={
  zh:['BASS-II 的气体读数是连续时间序列吗？','微重力烟雾粒径应该参考哪些研究？','FLEX 报告的 284 次试验代表什么？','能用这些资料确定月球基地的安全氧浓度吗？'],
  en:['Are the BASS-II gas readings a continuous time series?','Which studies report smoke particle size in microgravity?','What do the 284 tests in the FLEX report represent?','Can these studies establish a safe oxygen level for a Moon base?'],
 };
 let lastBrief='';
 let lastMode='';
 let answerRevision=0;
 let busy=false;
 let apiConfig=null;
 const localApi=/^https?:$/.test(location.protocol)&&['127.0.0.1','localhost','[::1]'].includes(location.hostname);
 const hostedApi=location.origin==='https://shanxiaohu123.github.io'?document.querySelector('meta[name="flame-ai-endpoint"]')?.content:'';
 const caseStudy=data.case_study;
 const renderFlex=renderFlexCase(caseStudy,download);
 $('sourceCount').textContent=new Set([...data.sources,caseStudy.source].map(source=>source.id)).size;
 $('claimCount').textContent=data.claims.length;
 $('fulltextCount').textContent=caseStudy.fulltext_evidence.length;
 $('officialRowsCount').textContent=caseStudy.records.filter(record=>record.data_type==='original_dataset').length;
 $('question').value=examples[language][1];

 function noMatchMessage(){
  return t('未找到匹配的证据。试试研究名称或测量指标。','No matching evidence. Try a study name or a measurement.');
 }
 function sourceLink(item){
  const source=localized(item,language);
  return citationDetails({label:t('查看研究出处','View study source')+' · '+source.document_id,title:source.title,
   locator:t('NTRS 公开摘要','NTRS public abstract')+' · '+source.document_id,originalUrl:source.url,
   reviewUrl:source.alternate_url,reviewLabel:source.alternate_label,language});
 }
 function evidenceHtml(item){
  const c=localized(item,language);
  return `<div class="evidence"><strong><span class="evidence-id">[${esc(c.id)}]</span> ${esc(c.type)}</strong><p>${esc(c.text)}</p><p class="muted">${t('边界','Limitations')} · ${esc(c.limitation)}</p>${sourceLink(byId[c.source_id])}</div>`;
 }
 function renderExplore(){
  const q=$('search').value.trim();
  const rows=rankSources(data,q,$('theme').value);
  const note=queryNote(q,language);
  $('queryWarning').hidden=!note;
  $('queryWarning').textContent=note;
  $('resultCount').textContent=t(rows.length+' 项研究',rows.length+(rows.length===1?' study':' studies'));
  $('results').innerHTML=rows.length?rows.map(({source:item,hits})=>{
   const s=localized(item,language);
   const theme=t(s.theme,themeNames[s.theme]);
   const claims=data.claims.filter(c=>c.source_id===s.id);
   const ranking=hits.join(t('、',', '))||t('研究名称匹配','study name');
   const rankText=t('匹配关键词：'+ranking+'。','Matched keywords: '+ranking+'.');
   return `<article class="card"><div class="cardhead"><h3>${esc(s.name)}</h3><span class="badge">${esc(theme)}</span></div><p>${esc(s.object)} · ${esc(s.platform)}</p><p class="muted">${esc(s.scope)}</p>${sourceLink(s)}${q?`<p class="muted">${esc(rankText)}</p>`:''}<details><summary>${t('查看 '+claims.length+' 条证据及局限','View '+claims.length+' evidence entries and their limitations')}</summary>${claims.map(evidenceHtml).join('')}</details></article>`;
  }).join(''):`<div class="card">${t('未找到匹配研究。可试 BASS、烟雾粒径或 FLEX。','No matching studies. Try BASS, smoke particle size, or FLEX.')}</div>`;
 }
 $('search').addEventListener('input',renderExplore);
 $('theme').addEventListener('change',renderExplore);

 function activateTab(id){
  document.querySelectorAll('[data-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tab===id));
  document.querySelectorAll('.panel').forEach(panel=>panel.hidden=panel.id!==id);
 }
 document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>activateTab(button.dataset.tab)));
 for(const id of ['compareA','compareB']){
  $(id).innerHTML=data.sources.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  $(id).addEventListener('change',renderCompare);
 }
 $('compareB').value='SAFFIRE';
 function renderCompare(){
  const a=localized(byId[$('compareA').value],language);
  const b=localized(byId[$('compareB').value],language);
  const cols=[
   [t('研究对象','Study subject'),'object'],[t('平台','Platform'),'platform'],[t('条件描述','Conditions'),'variables'],
   [t('测量与观察','Measurements and observations'),'observations'],[t('数据范围','Data scope'),'scope'],[t('解读要点','Interpretation notes'),'caution'],
  ];
  const note=a.id===b.id?`<p class="muted">${t('请选择两项不同的研究进行比较。','Select a different study for comparison.')}</p>`:'';
  $('compareResult').innerHTML=`${note}<div class="tablewrap"><table><thead><tr><th>${t('维度','Dimension')}</th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr></thead><tbody>${cols.map(([label,key])=>`<tr><th>${label}</th><td>${esc(a[key])}</td><td>${esc(b[key])}</td></tr>`).join('')}<tr><th>${t('出处','Sources')}</th><td>${sourceLink(a)}</td><td>${sourceLink(b)}</td></tr></tbody></table></div>`;
 }
 function renderExamples(){
  $('examples').innerHTML=examples[language].map((q,i)=>`<button class="example" data-example="${i}">${esc(q)}</button>`).join('');
 }
 $('examples').addEventListener('click',event=>{
  const button=event.target.closest('[data-example]');
  if(!button)return;
  $('question').value=examples[language][Number(button.dataset.example)];
  showEvidence();
 });
 function makeBrief(q,claims,mode,extra=''){
  const citations=claims.map(item=>{
   const c=localized(item,language);
   const source=localized(byId[c.source_id],language);
   return `## [${c.id}] ${source.name}\n${c.text}\n\n${t('边界','Limitations')} · ${c.limitation}\n\n${t('出处','Source')} · ${source.title}\n${t('定位 · NTRS 公开摘要','Location · NTRS public abstract')} · ${source.document_id}\n[${source.alternate_label}](${source.alternate_url})\n${t('NASA NTRS 原址','Original NASA NTRS address')} ${markdownOriginalAddress(source.url)}\n${ntrsNote(language)}\n`;
  });
  const scope=t('资料来源：NASA 文献公开摘要，初始条目由 GPT 辅助整理。','Sources: public NASA abstracts. GPT assisted the initial summaries.');
  return `# Flame Evidence Brief\n\n${t('问题','Question')} · ${q}\n\n${t('模式','Mode')} · ${mode}\n\n${queryNote(q,language)}\n\n${extra}\n\n`+citations.join('\n')+
   `\n---\n${scope}\n`;
 }
 function clearAnswer(){
  answerRevision++;
  lastBrief='';
  lastMode='';
  $('exportBrief').disabled=true;
  $('answerStatus').textContent='';
  $('answer').textContent='';
 }
 function showEvidence(){
  clearAnswer();
  const q=$('question').value.trim();
  if(!q){$('answerStatus').textContent=t('请先输入问题。','Enter a research question.');return;}
  const claims=rankedClaims(data,q);
  const note=queryNote(q,language);
  $('answerStatus').textContent=t('文献证据检索','Literature evidence search');
  $('answer').innerHTML=(note?`<div class="warning">${esc(note)}</div>`:'')+(claims.length?
   `<div class="card"><h3>${t('相关证据','Relevant evidence')}</h3>${claims.map(evidenceHtml).join('')}</div>`:
   `<div class="card">${esc(noMatchMessage())}</div>`);
  lastMode='fixed';
  lastBrief=makeBrief(q,claims,t('文献证据检索','Literature evidence search'),claims.length?'':noMatchMessage());
  $('exportBrief').disabled=false;
 }
 $('question').addEventListener('input',clearAnswer);
 $('askEvidence').addEventListener('click',showEvidence);
 function download(content,name,type){
  const url=URL.createObjectURL(new Blob([content],{type}));
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=name;
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 $('exportBrief').addEventListener('click',()=>download(lastBrief,'flame_evidence_brief.md','text/markdown;charset=utf-8'));
 $('downloadData').addEventListener('click',()=>download(JSON.stringify(data,null,2),'flame_evidence.json','application/json'));

 function providerName(){
  if(apiConfig?.provider==='deepseek')return 'DeepSeek';
  if(apiConfig?.provider==='openai')return 'OpenAI';
  return t('实时模型','live model');
 }
 function renderApi(){
  const enabled=Boolean(apiConfig?.live_enabled);
  const provider=providerName();
  $('askLive').disabled=!enabled||busy;
  $('askLive').textContent=t('调用 '+provider,'Ask '+provider);
  $('askLive').hidden=!enabled;
  $('modeText').textContent=enabled?t('文献检索 · '+provider,'Literature search · '+provider):t('文献检索','Literature search');
 }
 $('askLive').addEventListener('click',async()=>{
  if(busy)return;
  clearAnswer();
  const q=$('question').value.trim();
  if(!q){$('answerStatus').textContent=t('请先输入问题。','Enter a research question.');return;}
  const revision=answerRevision;
  busy=true;
  renderApi();
  $('answerStatus').textContent=t(providerName()+' 正在生成解释…',providerName()+' is preparing an explanation…');
  try{
   const response=await fetch(localApi?'/api/explain':hostedApi,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({question:q,language}),signal:AbortSignal.timeout(45000)});
   const out=await response.json();
   if(revision!==answerRevision)return;
   if(!response.ok)throw new Error('Model request failed');
   const ids=[...new Set(out.claims.flatMap(item=>item.evidence_ids))];
   const evidence=ids.map(id=>claimsById[id]).filter(Boolean);
   const mode=out.mode==='live'?t(providerName()+' 实时输出',providerName()+' live response'):
    t('文献范围检查','Literature scope check');
   $('answerStatus').textContent=mode;
   $('answer').innerHTML=`<div class="card"><h3>${out.status==='insufficient'?t('证据不足','Insufficient evidence'):t('基于当前证据的解释','Evidence-based explanation')}</h3>${out.claims.map(item=>`<p>${esc(item.text)} <span class="evidence-id">${esc(item.evidence_ids.map(id=>'['+id+']').join(' '))}</span></p>`).join('')}${out.limitations.map(value=>`<p class="warning">${esc(value)}</p>`).join('')}<details><summary>${t('展开本次引用','View cited evidence')}</summary>${evidence.map(evidenceHtml).join('')}</details></div>`;
   const extra=out.claims.map(item=>item.text+' '+item.evidence_ids.map(id=>'['+id+']').join(' ')).join('\n\n')+
    '\n\n'+t('限制','Limitations')+' · '+out.limitations.join(t('；','; '));
   lastMode='live';
   lastBrief=makeBrief(q,evidence,mode,extra);
   $('exportBrief').disabled=false;
  }catch{
   if(revision!==answerRevision)return;
   showEvidence();
   $('answerStatus').textContent=t(providerName()+' 暂不可用 · 已显示文献证据',providerName()+' is unavailable · Showing literature evidence');
  }finally{
   busy=false;
   renderApi();
  }
 });
 async function checkApi(){
  if(!localApi&&!hostedApi)return;
  try{
   const response=await fetch(localApi?'/api/config':hostedApi,{signal:AbortSignal.timeout(5000)});
   if(response.ok){apiConfig=await response.json();renderApi();}
  }catch(_){/* Static mode stays available. */}
 }
 function renderLanguage(){
  document.documentElement.lang=t('zh-CN','en');
  $('language').value=language;
  for(const [node,en,zh] of staticText)node.textContent=t(zh,en);
  for(const [node,attribute,en,zh] of staticAttributes)node.setAttribute(attribute,t(zh,en));
  renderExplore();
  renderCompare();
  renderExamples();
  renderFlex(language);
  renderApi();
 }
 $('language').addEventListener('change',event=>{
  const question=$('question');
  const sample=examples[language].indexOf(question.value);
  const mode=lastMode;
  language=event.target.value;
  try{localStorage.setItem('flame-language',language);}catch(_){}
  if(sample>=0)question.value=examples[language][sample];
  clearAnswer();
  renderLanguage();
  if(mode==='fixed')showEvidence();
  else if(mode==='live'||busy)$('answerStatus').textContent=t('已切换语言，可重新生成回答。','Language changed. You can generate a new response.');
 });
 renderLanguage();
 checkApi();
 const recordAnchor=$(location.hash.slice(1));
 if(recordAnchor?.closest('#flexTable')){
  activateTab('flex-case');
  recordAnchor.scrollIntoView();
 }
}

