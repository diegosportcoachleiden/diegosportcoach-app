const STORE = {
  get(k, fallback){ try { return JSON.parse(localStorage.getItem(k)) ?? fallback } catch { return fallback } },
  set(k,v){ localStorage.setItem(k, JSON.stringify(v)) }
};

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmtDate = d => new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long'}).format(new Date(d+'T12:00:00'));
const esc = s => String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const toast = msg => { const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),2200); };

function seed(){
  if(!localStorage.getItem('dsc_lessons')){
    const now = new Date();
    const dates = [2,4,7].map(add=>{
      const d = new Date(now); d.setDate(d.getDate()+add); return d.toISOString().slice(0,10);
    });
    STORE.set('dsc_lessons',[
      {id:crypto.randomUUID(),date:dates[0],time:'19:30',location:'Stevenshof',max:12},
      {id:crypto.randomUUID(),date:dates[1],time:'09:00',location:'Leiden',max:12},
      {id:crypto.randomUUID(),date:dates[2],time:'19:30',location:'Stevenshof',max:12}
    ]);
  }
  if(!localStorage.getItem('dsc_members')) STORE.set('dsc_members',[]);
  if(!localStorage.getItem('dsc_bookings')) STORE.set('dsc_bookings',[]);
  if(!localStorage.getItem('dsc_requests')) STORE.set('dsc_requests',[]);
}
seed();

function getUser(){ return STORE.get('dsc_user', null); }
function getMembers(){ return STORE.get('dsc_members',[]); }
function getLessons(){ return STORE.get('dsc_lessons',[]).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)); }
function getBookings(){ return STORE.get('dsc_bookings',[]); }

function ensureMember(user){
  let members=getMembers();
  let m=members.find(x=>x.email.toLowerCase()===user.email.toLowerCase());
  if(!m){
    m={id:crypto.randomUUID(),name:user.name,email:user.email,rides:1};
    members.push(m); STORE.set('dsc_members',members);
  } else if(m.name!==user.name){ m.name=user.name; STORE.set('dsc_members',members); }
  return m;
}

function currentMember(){
  const u=getUser(); if(!u) return null;
  return getMembers().find(x=>x.email.toLowerCase()===u.email.toLowerCase()) || ensureMember(u);
}

function showApp(){
  $('#loginView').classList.add('hidden'); $('#adminView').classList.add('hidden'); $('#appView').classList.remove('hidden'); $('#logoutBtn').classList.remove('hidden');
  render();
}
function showLogin(){
  $('#appView').classList.add('hidden'); $('#adminView').classList.add('hidden'); $('#loginView').classList.remove('hidden'); $('#logoutBtn').classList.add('hidden');
}
function showAdmin(){
  $('#loginView').classList.add('hidden'); $('#appView').classList.add('hidden'); $('#adminView').classList.remove('hidden'); $('#logoutBtn').classList.add('hidden'); renderAdmin();
}

$('#loginBtn').onclick=()=>{
  const name=$('#nameInput').value.trim(), email=$('#emailInput').value.trim().toLowerCase();
  if(!name || !email || !email.includes('@')) return toast('Vul naam en geldig e-mailadres in');
  STORE.set('dsc_user',{name,email}); ensureMember({name,email}); showApp();
};
$('#logoutBtn').onclick=()=>{ localStorage.removeItem('dsc_user'); showLogin(); };
$('#adminBtn').onclick=()=>{
  const pin=prompt('Beheerders-PIN:');
  if(pin==='2468') showAdmin(); else if(pin!==null) toast('Onjuiste PIN');
};
$('#adminLogout').onclick=()=>showLogin();

$$('.tab').forEach(btn=>btn.onclick=()=>{
  $$('.tab').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  $$('.panel').forEach(p=>p.classList.add('hidden')); $('#'+btn.dataset.tab).classList.remove('hidden');
});

function render(){
  const m=currentMember(); if(!m) return;
  $('#welcomeName').textContent='Hoi '+m.name.split(' ')[0]+'!';
  $('#ridesCount').textContent=m.rides;
  $('#ticketCount').textContent=m.rides+' rit'+(m.rides===1?'':'ten');
  $('#ticketFill').style.width=Math.min(100,(m.rides/12)*100)+'%';
  renderLessons(); renderMine();
}

function renderLessons(){
  const m=currentMember(), lessons=getLessons(), bookings=getBookings();
  const box=$('#lessen');
  if(!lessons.length){ box.innerHTML='<div class="card"><p>Er staan nog geen trainingen gepland.</p></div>'; return; }
  box.innerHTML='<div class="card"><h2>Komende bootcamps</h2>'+lessons.map(l=>{
    const bs=bookings.filter(b=>b.lessonId===l.id);
    const mine=bs.some(b=>b.memberId===m.id);
    const full=bs.length>=Number(l.max);
    return `<div class="lesson">
      <div><h3>${esc(fmtDate(l.date))} • ${esc(l.time)}</h3><div class="meta">📍 ${esc(l.location)} · ${bs.length}/${l.max} deelnemers</div>
      <span class="badge ${mine?'mine':full?'full':''}">${mine?'Ingeschreven':full?'Vol':'Plek beschikbaar'}</span></div>
      <button class="${mine?'secondary':'primary'}" data-book="${l.id}" ${(!mine&&full)?'disabled':''}>${mine?'Uitschrijven':'Inschrijven'}</button>
    </div>`;
  }).join('')+'</div>';
  $$('[data-book]').forEach(b=>b.onclick=()=>toggleBooking(b.dataset.book));
}

function toggleBooking(lessonId){
  const m=currentMember(); let members=getMembers(); let bookings=getBookings(); const lessons=getLessons();
  const lesson=lessons.find(l=>l.id===lessonId); const idx=bookings.findIndex(b=>b.lessonId===lessonId && b.memberId===m.id);
  const mi=members.findIndex(x=>x.id===m.id);
  if(idx>=0){
    bookings.splice(idx,1); members[mi].rides += 1; toast('Uitgeschreven • rit teruggezet');
  } else {
    const count=bookings.filter(b=>b.lessonId===lessonId).length;
    if(count>=Number(lesson.max)) return toast('Deze training zit vol');
    if(members[mi].rides<=0) return toast('Je hebt geen ritten meer');
    bookings.push({id:crypto.randomUUID(),lessonId,memberId:m.id,createdAt:new Date().toISOString()});
    members[mi].rides -= 1; toast('Je bent ingeschreven!');
  }
  STORE.set('dsc_bookings',bookings); STORE.set('dsc_members',members); render();
}

function renderMine(){
  const m=currentMember(), lessons=getLessons(), bookings=getBookings().filter(b=>b.memberId===m.id);
  const mine=bookings.map(b=>lessons.find(l=>l.id===b.lessonId)).filter(Boolean);
  $('#mijn').innerHTML=`<div class="card"><h2>Mijn trainingen</h2>${mine.length?mine.map(l=>`<div class="lesson"><div><h3>${esc(fmtDate(l.date))} • ${esc(l.time)}</h3><div class="meta">📍 ${esc(l.location)}</div></div><span class="badge mine">Ingeschreven</span></div>`).join(''):'<p>Je bent nog niet ingeschreven voor een training.</p>'}</div>`;
}

$$('.buy').forEach(btn=>btn.onclick=()=>{
  const m=currentMember(); const rides=Number(btn.dataset.rides); let req=STORE.get('dsc_requests',[]);
  req.push({id:crypto.randomUUID(),memberId:m.id,rides,status:'open',createdAt:new Date().toISOString()}); STORE.set('dsc_requests',req);
  const msg=$('#buyMsg'); msg.textContent=`Aanvraag voor ${rides}-rittenkaart is opgeslagen. Diego kan deze in beheer verwerken.`; msg.classList.remove('hidden');
});

$('#addLesson').onclick=()=>{
  const date=$('#lessonDate').value, time=$('#lessonTime').value, location=$('#lessonLocation').value.trim(), max=Number($('#lessonMax').value);
  if(!date||!time||!location||!max) return toast('Vul alle velden in');
  const lessons=STORE.get('dsc_lessons',[]); lessons.push({id:crypto.randomUUID(),date,time,location,max}); STORE.set('dsc_lessons',lessons);
  $('#lessonLocation').value=''; toast('Training toegevoegd'); renderAdmin();
};

$('#addRides').onclick=()=>{
  const email=$('#ridesEmail').value.trim().toLowerCase(), add=Number($('#ridesAdd').value); let members=getMembers();
  const i=members.findIndex(m=>m.email.toLowerCase()===email);
  if(i<0) return toast('Deelnemer niet gevonden');
  members[i].rides += add; STORE.set('dsc_members',members);
  $('#ridesMsg').textContent=`${add} ritten toegevoegd aan ${members[i].name}.`; $('#ridesMsg').classList.remove('hidden'); renderAdmin();
};

function renderAdmin(){
  const lessons=getLessons(), members=getMembers(), bookings=getBookings();
  $('#adminLessons').innerHTML=lessons.length?lessons.map(l=>{
    const bs=bookings.filter(b=>b.lessonId===l.id);
    const names=bs.map(b=>members.find(m=>m.id===b.memberId)?.name).filter(Boolean);
    return `<div class="lesson"><div><h3>${esc(fmtDate(l.date))} • ${esc(l.time)}</h3><div class="meta">📍 ${esc(l.location)} · ${bs.length}/${l.max}</div><div class="meta">${names.length?'Deelnemers: '+names.map(esc).join(', '):'Nog geen inschrijvingen'}</div></div><button class="mini danger" data-del="${l.id}">Verwijderen</button></div>`;
  }).join(''):'<p>Nog geen trainingen.</p>';
  $$('[data-del]').forEach(b=>b.onclick=()=>deleteLesson(b.dataset.del));

  $('#adminMembers').innerHTML=members.length?`<table class="table"><thead><tr><th>Naam</th><th>E-mail</th><th>Ritten</th></tr></thead><tbody>${members.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.email)}</td><td><strong>${m.rides}</strong></td></tr>`).join('')}</tbody></table>`:'<p>Nog geen deelnemers.</p>';
}

function deleteLesson(id){
  STORE.set('dsc_lessons',getLessons().filter(l=>l.id!==id));
  STORE.set('dsc_bookings',getBookings().filter(b=>b.lessonId!==id));
  renderAdmin(); toast('Training verwijderd');
}

if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
if(getUser()) showApp(); else showLogin();
