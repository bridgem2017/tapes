/* 홈페이지 문의 → 이메일 발송
 * 받는 주소: tapes@tapes.co.kr (Web3Forms 액세스 키를 만들 때 입력한 주소로 도착합니다)
 * 1순위: 서버 모드(server/)에서 SMTP 가 설정되어 있으면 /api/mail 로 직접 발송
 * 2순위: Web3Forms(https://web3forms.com) 무료 메일 전달 서비스로 발송
 *        → https://web3forms.com 에서 tapes@tapes.co.kr 로 Access Key 를 발급받아 아래 WEB3FORMS_KEY 에 붙여넣으세요.
 */
(function(){
const MAIL_TO='tapes@tapes.co.kr';
const WEB3FORMS_KEY='a2c539b4-1fcf-4b90-a0bd-67399fe877c0';
const $=id=>document.getElementById(id);
const say=m=>(typeof toast==='function'?toast(m):alert(m));

async function send(subject,fields){
  const payload={subject,fields,page:location.href};
  // 1) 서버 모드 SMTP
  try{
    const r=await fetch('api/mail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(r.ok)return true;
    if(r.status===429)throw new Error('잠시 후 다시 시도해주세요.');
    if(r.status!==404&&r.status!==503&&r.status!==405){const j=await r.json().catch(()=>({}));throw new Error(j.error||'발송 실패')}
  }catch(e){if(e.message==='잠시 후 다시 시도해주세요.')throw e}
  // 2) Web3Forms
  if(!WEB3FORMS_KEY){console.warn('[mail] assets/mail.js 의 WEB3FORMS_KEY 가 비어 있습니다.');throw new Error('발송 실패')}
  const body={access_key:WEB3FORMS_KEY,subject,from_name:'Tape Solution 홈페이지',botcheck:''};
  Object.entries(fields).forEach(([k,v])=>{if(v)body[k]=v});
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields['이메일']||''))body.replyto=fields['이메일'];
  const r=await fetch('https://api.web3forms.com/submit',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.success!==true)throw new Error(j.message&&/rate|limit|many/i.test(j.message)?'잠시 후 다시 시도해주세요.':'발송 실패');
  return true;
}

function honeypot(form){
  if(form.querySelector('[name="_hp"]'))return;
  const i=document.createElement('input');i.name='_hp';i.tabIndex=-1;i.autocomplete='off';i.setAttribute('aria-hidden','true');
  i.style.cssText='position:absolute;left:-9999px;width:1px;height:1px;opacity:0';form.appendChild(i);
}
function busy(form,on){const b=form.querySelector('button[type="submit"],button:not([type])');if(!b)return;if(on){b.dataset.t=b.textContent;b.textContent='보내는 중…';b.disabled=true}else{b.textContent=b.dataset.t||b.textContent;b.disabled=false}}
const val=(form,n)=>(form.querySelector(`[name="${n}"]`)?.value||'').trim();
const fail=e=>say(`전송하지 못했습니다. ${e.message&&e.message!=='발송 실패'?e.message+' ':''}전화(031-404-9147) 또는 ${MAIL_TO} 로 연락주세요.`);

/* 상담 문의 */
const sf=$('sampleForm');
if(sf){honeypot(sf);sf.onsubmit=async e=>{
  e.preventDefault();if(val(sf,'_hp'))return;
  const f={'구분':'상담 문의','회사명':val(sf,'company'),'담당자':val(sf,'name'),'연락처':val(sf,'phone'),'이메일':val(sf,'email'),
    '현재 사용제품·관심 품번':val(sf,'current'),'피착재':val(sf,'material'),'희망 규격':val(sf,'size'),'예상 사용량':val(sf,'quantity'),'요청 내용':val(sf,'memo')};
  busy(sf,true);
  try{await send(`[홈페이지 상담 문의] ${f['회사명']} ${f['담당자']}`,f);say('상담 문의가 접수되었습니다. 빠르게 연락드리겠습니다.');sf.reset()}
  catch(err){fail(err)}finally{busy(sf,false)}
}}

/* 견적·주문 */
const of=$('orderForm');
if(of){honeypot(of);of.onsubmit=async e=>{
  e.preventDefault();if(val(of,'_hp'))return;
  const list=window.basket||[];
  if(!list.length){say('먼저 제품을 주문목록에 담아주세요.');return}
  const items=list.map((x,i)=>`${i+1}. ${x.p.brand} ${x.p.code} (${x.p.name}) / 규격: ${x.spec||'-'} / 수량: ${x.qty||'-'}`).join('\n');
  const f={'구분':'견적·주문 요청','회사명':val(of,'company'),'담당자':val(of,'name'),'연락처':val(of,'phone'),'이메일':val(of,'email'),'요청 품목':items,'요청사항':val(of,'memo')};
  busy(of,true);
  try{await send(`[홈페이지 견적·주문] ${f['회사명']} ${f['담당자']} (${list.length}품목)`,f);say('견적·주문 요청이 접수되었습니다. 확인 후 연락드리겠습니다.');of.reset();list.splice(0);if(typeof renderOrder==='function')renderOrder()}
  catch(err){fail(err)}finally{busy(of,false)}
}}
})();
