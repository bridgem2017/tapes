/* 제품 등록 관리
 * - 서버 모드(server/ 실행 시): 저장 즉시 products.json · assets/products.js 에 기록 → 홈페이지 바로 반영
 * - 파일 모드(서버 없이 파일만 올린 경우): 이 브라우저에 임시 저장 → products.js 내려받아 교체 업로드
 */
(function(){
const $=id=>document.getElementById(id);
/* 파일 모드 관리자 비밀번호 (서버 모드에서는 서버의 ADMIN_PASSWORD 가 쓰입니다) */
const STATIC_PASSWORD='arche1234';
const DRAFT_KEY='tsProductDraft', AUTH_KEY='tsAdminAuth';
const FIELDS=['brand','code','name','category','adhesive','carrier','thickness','temp','industries','applications','substrates','alternatives','img','source','sourceUrl'];
const LISTS=['industries','applications','substrates','alternatives'];
const TAPE_RE=/테이프|tape|필름|마스킹|폼|film|ptfe/i;
const BRAND_ORDER=['ARCHE','3M','tesa','Nitto'];

let server=false, pw='', data=[], base=[], touched=new Set(), editing=null, csvRows=[];

const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const ss={get(k){try{return sessionStorage.getItem(k)}catch(e){return null}},set(k,v){try{sessionStorage.setItem(k,v)}catch(e){}},del(k){try{sessionStorage.removeItem(k)}catch(e){}}};
const key=p=>p.brand+'|'+p.code;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uniq=a=>[...new Set(a.flat().filter(Boolean))];
const sortBrands=a=>[...a].sort((x,y)=>((BRAND_ORDER.indexOf(x)+1)||99)-((BRAND_ORDER.indexOf(y)+1)||99)||x.localeCompare(y));
const visible=p=>TAPE_RE.test([p.category,p.name,p.carrier].join(' '));
const splitList=s=>String(s||'').split(/[,，\n]/).map(x=>x.trim()).filter(Boolean);
function toast(m){const t=$('toast');t.textContent=m;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',2600)}

async function api(path,opt={}){
  const r=await fetch(path,{...opt,headers:{'Content-Type':'application/json','X-Admin-Password':pw,...(opt.headers||{})}});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||('서버 오류 '+r.status));
  return j;
}

/* ---------- 시작 ---------- */
async function boot(){
  try{const r=await fetch('api/health',{cache:'no-store'});server=r.ok&&(await r.json()).ok===true}catch(e){server=false}
  $('modeBadge').textContent=server?'서버 모드 · 저장 즉시 반영':'파일 모드 · 내려받아 업로드';
  $('modeBadge').classList.toggle('server',server);
  const saved=ss.get(AUTH_KEY);
  if(saved&&await tryLogin(saved,true))return;
  $('loginView').hidden=false;
}
async function tryLogin(p,silent){
  if(server){try{pw=p;await api('api/login',{method:'POST',body:'{}'})}catch(e){pw='';if(!silent)$('loginErr').textContent='비밀번호가 올바르지 않습니다.';return false}}
  else if(p!==STATIC_PASSWORD){if(!silent)$('loginErr').textContent='비밀번호가 올바르지 않습니다.';return false}
  pw=p;ss.set(AUTH_KEY,p);
  $('loginView').hidden=true;$('listView').hidden=false;$('logoutBtn').hidden=false;
  await load();return true;
}
$('loginForm').onsubmit=e=>{e.preventDefault();$('loginErr').textContent='';tryLogin($('loginPw').value,false)};
$('logoutBtn').onclick=()=>{ss.del(AUTH_KEY);location.reload()};

async function load(){
  if(server){data=(await api('api/products')).products;base=JSON.parse(JSON.stringify(data))}
  else{
    base=JSON.parse(JSON.stringify(typeof products!=='undefined'?products:[]));
    let d=null;try{d=JSON.parse(store.get(DRAFT_KEY)||'null')}catch(e){}
    data=d&&Array.isArray(d.products)?d.products:JSON.parse(JSON.stringify(base));
    touched=new Set(d&&d.touched||[]);
  }
  fillFilters();render();
}
function saveDraft(){
  if(server)return;
  const changed=touched.size>0||data.length!==base.length;
  if(changed)store.set(DRAFT_KEY,JSON.stringify({products:data,touched:[...touched],at:Date.now()}));else store.del(DRAFT_KEY);
}

/* ---------- 목록 ---------- */
function fillFilters(){
  const opt=(id,vals,first)=>{const el=$(id),v=el.value;el.innerHTML=`<option value="">${first}</option>`+vals.map(x=>`<option>${esc(x)}</option>`).join('');el.value=v};
  const brands=sortBrands(uniq(data.map(p=>p.brand))),cats=uniq(data.map(p=>p.category)).sort();
  opt('fBrand',brands,'전체 브랜드');opt('fCat',cats,'전체 제품군');
  $('dlBrand').innerHTML=brands.map(b=>`<option value="${esc(b)}">`).join('');
  $('dlCat').innerHTML=cats.map(c=>`<option value="${esc(c)}">`).join('');
  $('dlAdh').innerHTML=uniq(data.map(p=>p.adhesive)).sort().map(c=>`<option value="${esc(c)}">`).join('');
}
function render(){
  const q=$('q').value.trim().toLowerCase(),b=$('fBrand').value,c=$('fCat').value,s=$('fState').value;
  const list=data.filter(p=>(!b||p.brand===b)&&(!c||p.category===c)&&(!q||JSON.stringify([p.code,p.name,p.brand,p.applications,p.category]).toLowerCase().includes(q))
    &&(!s||(s==='new'&&touched.has(key(p)))||(s==='hidden'&&!visible(p))||(s==='noimg'&&!p.img)));
  $('rows').innerHTML=list.map(p=>{const i=data.indexOf(p);return `<tr data-i="${i}"><td><div class="thumb">${p.img&&!/unsplash\.com/.test(p.img)?`<img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.remove()">`:''}</div></td><td>${esc(p.brand)}</td><td class="code">${esc(p.code)}${touched.has(key(p))?'<span class="pill new">변경</span>':''}</td><td class="nm">${esc(p.name)}</td><td>${esc(p.category)}</td><td>${esc(p.thickness||'-')}</td><td>${visible(p)?'<span class="pill">노출</span>':'<span class="pill off">미노출</span>'}</td><td><button class="editBtn" type="button">수정</button></td></tr>`}).join('');
  $('emptyMsg').hidden=list.length>0;
  const shown=data.filter(visible).length;
  $('statLine').textContent=`등록 제품 ${data.length}개 · 사이트 노출 ${shown}개 · ${sortBrands(uniq(data.map(p=>p.brand))).map(br=>`${br} ${data.filter(p=>p.brand===br).length}`).join(' · ')}`;
  const dirty=!server&&(touched.size>0||data.length!==base.length);
  $('draftBar').hidden=!dirty;$('draftCount').textContent=touched.size;
}
['q','fBrand','fCat','fState'].forEach(id=>$(id).addEventListener('input',render));
$('rows').onclick=e=>{const tr=e.target.closest('tr');if(tr)openForm(+tr.dataset.i)};

/* ---------- 등록/수정 폼 ---------- */
const F=$('pForm');
function openModal(id){$(id).classList.add('show');$(id).setAttribute('aria-hidden','false')}
function closeModal(id){$(id).classList.remove('show');$(id).setAttribute('aria-hidden','true')}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.closest('.adminModal').id));
document.querySelectorAll('.adminModal').forEach(m=>m.addEventListener('mousedown',e=>{if(e.target===m)closeModal(m.id)}));

function openForm(i){
  editing=i==null?null:i;const p=i==null?{}:data[i];
  $('formTitle').textContent=i==null?'새 제품 등록':`${p.brand} ${p.code} 수정`;
  FIELDS.forEach(f=>{const el=F.elements[f];if(el)el.value=LISTS.includes(f)?(p[f]||[]).join(', '):(p[f]||'')});
  $('delBtn').hidden=i==null;$('formErr').textContent='';$('imgFile').value='';
  setPreview(p.img||'');updateVis();openModal('formModal');
  setTimeout(()=>F.elements[i==null?'brand':'name'].focus(),50);
}
$('newBtn').onclick=()=>openForm(null);
function setPreview(src){$('imgPreview').innerHTML=src?`<img src="${esc(src)}" alt="" onerror="this.parentNode.innerHTML='<span>이미지를 불러올 수 없음</span>'">`:'<span>이미지 없음</span>'}
$('imgUrl').addEventListener('input',()=>setPreview($('imgUrl').value.trim()));
$('imgClear').onclick=()=>{$('imgUrl').value='';$('imgFile').value='';setPreview('')};
function updateVis(){
  const p={category:F.elements.category.value,name:F.elements.name.value,carrier:F.elements.carrier.value};
  const ok=visible(p)||!p.category;
  $('visNote').textContent=ok?'제품군·제품명·기재에 테이프/Tape/필름/폼이 들어가면 홈페이지 테이프 목록에 노출됩니다.':'⚠ 제품군·제품명·기재에 테이프/Tape/필름/폼 단어가 없어 홈페이지 테이프 목록에는 노출되지 않습니다. (데이터로는 저장됩니다)';
  $('visNote').classList.toggle('warn',!ok);
}
['category','name','carrier'].forEach(n=>F.elements[n].addEventListener('input',updateVis));

/* 이미지 파일 → 가로 900px JPEG */
function resize(file){return new Promise((res,rej)=>{const r=new FileReader();r.onerror=rej;r.onload=()=>{const im=new Image();im.onerror=()=>rej(new Error('이미지를 읽을 수 없습니다.'));im.onload=()=>{const w=Math.min(900,im.naturalWidth),h=Math.round(im.naturalHeight*w/im.naturalWidth);const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,w,h);g.drawImage(im,0,0,w,h);res(c.toDataURL('image/jpeg',.84))};im.src=r.result};r.readAsDataURL(file)})}
$('imgFile').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{
    const url=await resize(f);
    if(server){const code=(F.elements.brand.value+'-'+F.elements.code.value)||'product';const j=await api('api/upload',{method:'POST',body:JSON.stringify({name:code,dataUrl:url})});$('imgUrl').value=j.path;setPreview(j.path)}
    else{$('imgUrl').value=url;setPreview(url)}
  }catch(err){toast(err.message||'이미지 업로드 실패')}
};

function readForm(){
  const p={};FIELDS.forEach(f=>{const v=(F.elements[f]?.value||'').trim();p[f]=LISTS.includes(f)?splitList(v):v});
  return p;
}
F.onsubmit=async e=>{
  e.preventDefault();$('formErr').textContent='';
  const p=readForm();
  const miss=[['brand','브랜드'],['code','품번'],['name','제품명'],['category','제품군']].filter(([k])=>!p[k]).map(x=>x[1]);
  if(miss.length){$('formErr').textContent=miss.join(', ')+'을(를) 입력해주세요.';return}
  if(p.sourceUrl&&!/^https?:\/\//.test(p.sourceUrl)){$('formErr').textContent='기술자료 링크는 http:// 또는 https:// 로 시작해야 합니다.';return}
  const dup=data.findIndex(x=>key(x).toLowerCase()===key(p).toLowerCase());
  if(dup>-1&&dup!==editing){$('formErr').textContent=`${p.brand} ${p.code} 는 이미 등록되어 있습니다.`;return}
  const prev=editing==null?null:data[editing];
  const rec=Object.assign({},prev||{},p,{verified:prev?.verified&&prev.verified!=='user_requested'&&!touched.has(key(prev))?prev.verified:'admin_registered'});
  if(!rec.img&&prev?.img&&/unsplash\.com/.test(prev.img))rec.img=prev.img;
  $('saveBtn').disabled=true;
  try{
    if(server){
      const j=await api('api/products',{method:editing==null?'POST':'PUT',body:JSON.stringify({key:prev?key(prev):null,product:rec})});
      data=j.products;
    }else{
      if(editing==null){const i=data.findIndex(x=>x.brand===rec.brand);data.splice(i<0?0:i,0,rec)}else data[editing]=rec;
      if(prev)touched.delete(key(prev));
    }
    touched.add(key(rec));saveDraft();fillFilters();render();closeModal('formModal');
    toast(server?'저장했습니다. 홈페이지에 바로 반영됩니다.':'임시 저장했습니다. products.js 내려받기 후 업로드하세요.');
  }catch(err){$('formErr').textContent=err.message}
  finally{$('saveBtn').disabled=false}
};
$('delBtn').onclick=async()=>{
  const p=data[editing];if(!p||!confirm(`${p.brand} ${p.code} 제품을 삭제할까요?`))return;
  try{
    if(server)data=(await api('api/products?key='+encodeURIComponent(key(p)),{method:'DELETE'})).products;
    else{data.splice(editing,1);touched.add(key(p))}
    saveDraft();fillFilters();render();closeModal('formModal');toast('삭제했습니다.');
  }catch(err){$('formErr').textContent=err.message}
};

/* ---------- 파일 모드: 내보내기 ---------- */
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
$('exportBtn').onclick=()=>{
  const json=JSON.stringify(data,null,2);
  download('products.js','const products = '+json+';\n','text/javascript');
  setTimeout(()=>download('products.json',json,'application/json'),400);
  toast('내려받은 products.js 를 assets 폴더에, products.json 을 최상위 폴더에 덮어써 업로드하세요.');
};
$('discardBtn').onclick=()=>{if(!confirm('이 브라우저에 임시 저장된 변경을 모두 취소할까요?'))return;store.del(DRAFT_KEY);touched.clear();data=JSON.parse(JSON.stringify(base));fillFilters();render()};

/* ---------- CSV 일괄 등록 ---------- */
const CSV_HEAD=['브랜드','품번','제품명','제품군','점착제','기재·형태','두께','사용환경','추천용도','적용소재','산업','대체후보','이미지URL','기술자료이름','기술자료링크'];
const CSV_MAP=['brand','code','name','category','adhesive','carrier','thickness','temp','applications','substrates','industries','alternatives','img','source','sourceUrl'];
$('csvBtn').onclick=()=>{csvRows=[];$('csvResult').innerHTML='';$('csvApply').disabled=true;$('csvFile').value='';openModal('csvModal')};
$('tplBtn').onclick=()=>{
  const ex=['3M','4421','3M™ PE 폼 양면테이프 4421','Foam Tape','','PE 폼 · 흰색','1.0mm','장기 65°C / 단기 80°C','사인물 부착, 거울 고정','금속, 유리','General Industrial','','','한국쓰리엠 제품페이지','https://www.3m.co.kr/3M/ko_KR/p/d/v000464379/'];
  const q=v=>/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
  download('제품등록_양식.csv','﻿'+CSV_HEAD.join(',')+'\n'+ex.map(q).join(',')+'\n','text/csv');
};
function parseCSV(t){
  t=t.replace(/^﻿/,'');const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<t.length;i++){const ch=t[i];
    if(q){if(ch==='"'){if(t[i+1]==='"'){cell+='"';i++}else q=false}else cell+=ch}
    else if(ch==='"')q=true;else if(ch===','){row.push(cell);cell=''}else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=ch}
  if(cell||row.length){row.push(cell);rows.push(row)}
  return rows.filter(r=>r.some(c=>c.trim()));
}
$('csvFile').onchange=e=>{
  const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=()=>{
    const rows=parseCSV(r.result);if(!rows.length){$('csvResult').innerHTML='<p class="formErr">빈 파일입니다.</p>';return}
    const head=rows[0].map(h=>h.trim());const idx=CSV_HEAD.map(h=>head.indexOf(h));
    if(idx[0]<0||idx[1]<0){$('csvResult').innerHTML='<p class="formErr">양식의 제목 줄(브랜드, 품번 …)이 없습니다. 양식을 내려받아 사용해주세요.</p>';return}
    const errs=[];let add=0,upd=0;csvRows=[];
    rows.slice(1).forEach((r,n)=>{
      const p={};CSV_MAP.forEach((f,k)=>{const v=idx[k]>-1?(r[idx[k]]||'').trim():'';p[f]=LISTS.includes(f)?splitList(v):v});
      if(!p.brand||!p.code||!p.name||!p.category){errs.push(`${n+2}번째 줄: 브랜드·품번·제품명·제품군은 필수입니다.`);return}
      data.some(x=>key(x).toLowerCase()===key(p).toLowerCase())?upd++:add++;csvRows.push(p);
    });
    $('csvResult').innerHTML=`<div class="csvSummary"><b>새 제품 ${add}개 · 기존 제품 수정 ${upd}개</b>${errs.length?`<p class="formErr">건너뛴 줄 ${errs.length}개</p><ul>${errs.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</div>`;
    $('csvApply').disabled=!csvRows.length;
  };
  r.readAsText(f,'utf-8');
};
$('csvApply').onclick=async()=>{
  $('csvApply').disabled=true;
  try{
    const merged=csvRows.map(p=>{const old=data.find(x=>key(x).toLowerCase()===key(p).toLowerCase());const rec=Object.assign({},old||{},Object.fromEntries(Object.entries(p).filter(([k,v])=>Array.isArray(v)?v.length:v)),{verified:'admin_registered'});if(!rec.alternatives)rec.alternatives=[];LISTS.forEach(l=>rec[l]=rec[l]||[]);return rec});
    if(server)data=(await api('api/products/bulk',{method:'POST',body:JSON.stringify({products:merged})})).products;
    else merged.forEach(rec=>{const i=data.findIndex(x=>key(x).toLowerCase()===key(rec).toLowerCase());if(i>-1)data[i]=rec;else{const j=data.findIndex(x=>x.brand===rec.brand);data.splice(j<0?data.length:j,0,rec)}});
    merged.forEach(r=>touched.add(key(r)));saveDraft();fillFilters();render();closeModal('csvModal');toast(`${merged.length}개 제품을 반영했습니다.`);
  }catch(err){$('csvResult').insertAdjacentHTML('beforeend',`<p class="formErr">${esc(err.message)}</p>`);$('csvApply').disabled=false}
};

document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.adminModal.show').forEach(m=>closeModal(m.id))});
boot();
})();
