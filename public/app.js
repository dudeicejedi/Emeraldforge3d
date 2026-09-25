const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let productCount=0, answered=new Set();
const VOTED_KEY='ef3d_voted';
function getVotedIds(){try{return JSON.parse(localStorage.getItem(VOTED_KEY)||'[]')}catch(e){return []}}
function markVoted(id){try{const v=new Set(getVotedIds());v.add(id);localStorage.setItem(VOTED_KEY,JSON.stringify([...v]))}catch(e){}}
function toast(msg){
  const existing=$('#toast');if(existing)existing.remove();
  const el=document.createElement('div');el.id='toast';el.className='toast';el.textContent=msg;
  document.body.appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),300)},2200);
}
function shareProduct(id){
  const url=location.origin+location.pathname+'#product-'+id;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(()=>toast('Lien copié !')).catch(()=>prompt('Copiez ce lien :',url));
  }else{
    prompt('Copiez ce lien :',url);
  }
}

async function loadProducts(){
  try{const r=await fetch('/api/products');if(!r.ok)throw new Error();const ps=await r.json();productCount=ps.length;$('#loading').classList.add('hidden');$('#progressText').textContent=ps.length?`${ps.length} création${ps.length>1?'s':''} à découvrir`:'Collection en préparation';
    if(!ps.length){$('#products').innerHTML='<div class="thanks"><h2>La forge prépare ses premières créations…</h2><p>Revenez bientôt pour participer à la collection.</p></div>';return}
    $('#products').innerHTML=ps.map((p,i)=>card(p,i)).join('');
    const votedIds=new Set(getVotedIds());
    answered=new Set(ps.filter(p=>votedIds.has(p.id)).map(p=>p.id));
    answered.forEach(id=>{
      const btn=document.querySelector(`#product-${id} .submit`);
      if(btn){btn.disabled=true;btn.textContent='✓ Réponse enregistrée';}
    });
    updateProgress();
    if(location.hash){const target=document.querySelector(location.hash);if(target)setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'start'}),100);}
  }catch(e){$('#loading').innerHTML='Impossible de charger la collection. Réessayez dans quelques instants.';}
}
function card(p,i){
  const prices=[p.price1,p.price2,p.price3,p.price4].filter(x=>x!=null);
  return `<article class="card" id="product-${p.id}"><div class="card-grid"><div class="image-wrap"><img class="product-img" src="${esc(p.image||'/assets/logo.png')}" alt="${esc(p.name)}"></div><div class="content"><div class="content-head"><span class="tag">${esc(p.category||'Création')}</span><button type="button" class="share-btn" onclick="shareProduct(${p.id})">🔗 Partager</button></div><h2>${esc(p.name)}</h2><p class="desc">${esc(p.description||'Une création en préparation chez Emerald Forge 3D.')}</p><div class="specs"><div class="spec">📏 ${p.width||'—'} × ${p.height||'—'} × ${p.depth||'—'} cm</div><div class="spec">⚖️ ${p.weight||'—'} g</div><div class="spec">🖨️ ${p.print_hours||'—'} h d'impression</div><div class="spec">🧵 ${esc(p.material||'PLA')}</div></div><div class="question">À quel prix pourriez-vous envisager cet objet ? <span class="required">*</span></div><div class="choices" id="choices-${p.id}">${prices.map(x=>`<label><input type="radio" name="price-${p.id}" value="${x}"><span>${x} €</span></label>`).join('')}</div><div class="question">Vous l'achèteriez principalement pour…</div><div class="uses">${['Pour moi','Pour offrir','Cosplay','Collection','Décoration','Autre'].map(x=>`<label><input type="checkbox" name="use-${p.id}" value="${x}"><span>${x}</span></label>`).join('')}</div><input class="other" id="other-${p.id}" placeholder="Une autre idée ? (facultatif)"><div class="question">Intérêt pour cet objet <small>— votre ressenti</small></div><div class="range-row"><input type="range" min="1" max="5" value="3" oninput="document.getElementById('val-${p.id}').textContent=this.value" id="interest-${p.id}"><span class="range-value"><span id="val-${p.id}">3</span>/5</span></div><button class="submit" onclick="sendResponse(${p.id},this)">Valider mon avis</button></div></div></article>`
}
function showPriceRequiredPopup(productId){
  const existing=$('#priceRequiredModal');
  if(existing)existing.remove();
  const modal=document.createElement('div');
  modal.id='priceRequiredModal';
  modal.className='popup-overlay';
  modal.innerHTML=`<div class="popup-box"><h3>Prix manquant</h3><p>Merci de sélectionner un prix avant de valider votre avis. Cette information est indispensable pour nous aider à fixer un tarif juste.</p><button class="gold-button" style="width:auto" onclick="closePriceRequiredPopup()">Compris</button></div>`;
  document.body.appendChild(modal);
  document.body.style.overflow='hidden';
  const choicesEl=$(`#choices-${productId}`);
  if(choicesEl)choicesEl.classList.add('shake-error');
  setTimeout(()=>{if(choicesEl)choicesEl.classList.remove('shake-error')},600);
}
function closePriceRequiredPopup(){
  const modal=$('#priceRequiredModal');
  if(modal)modal.remove();
  document.body.style.overflow='';
}
async function sendResponse(id,btn){
  if(answered.has(id))return;
  const price=document.querySelector(`input[name="price-${id}"]:checked`);
  if(!price){showPriceRequiredPopup(id);return;}
  closePriceRequiredPopup();
  const uses=[...document.querySelectorAll(`input[name="use-${id}"]:checked`)].map(x=>x.value);const interest=$(`#interest-${id}`).value;const other=$(`#other-${id}`).value.trim();
  btn.disabled=true;btn.textContent='Enregistrement…';
  try{const r=await fetch('/api/responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product_id:id,price_choice:price.value,uses,interest,other})});if(!r.ok)throw new Error();answered.add(id);markVoted(id);btn.textContent='✓ Réponse enregistrée';btn.scrollIntoView({behavior:'smooth',block:'center'});updateProgress();}
  catch(e){btn.disabled=false;btn.textContent='Réessayer';alert('Votre réponse n’a pas pu être enregistrée.');}
}
function updateProgress(){const n=answered.size;$('#progressText').textContent=`${n}/${productCount} création${productCount>1?'s':''} évaluée${productCount>1?'s':''}`}
function openAdmin(){$('#adminModal').classList.remove('hidden');document.body.style.overflow='hidden';checkAdmin();}
function closeAdmin(){$('#adminModal').classList.add('hidden');document.body.style.overflow='';}
async function checkAdmin(){const r=await fetch('/api/me');const x=await r.json();$('#adminLogin').classList.toggle('hidden',x.admin);$('#adminApp').classList.toggle('hidden',!x.admin);if(x.admin)loadAdmin();else setTimeout(()=>$('#password')?.focus(),50)}
async function login(){const password=$('#password').value;$('#loginError').textContent='';const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});if(r.ok){$('#password').value='';checkAdmin()}else $('#loginError').textContent='Mot de passe incorrect.'}
async function logout(){await fetch('/api/logout',{method:'POST'});checkAdmin()}
function showTab(t){$('#fiches').classList.toggle('hidden',t!=='fiches');$('#stats').classList.toggle('hidden',t!=='stats');$('#tabFiches').classList.toggle('active',t==='fiches');$('#tabStats').classList.toggle('active',t==='stats');if(t==='stats')loadStats()}
async function loadAdmin(){const r=await fetch('/api/admin/products');if(!r.ok)return;const ps=await r.json();$('#fiches').innerHTML=`<button class="gold-button" style="width:auto;margin:0 0 10px" onclick="newForm()">＋ Nouvelle fiche</button><div id="forms"></div>${ps.map(p=>adminCard(p)).join('')}`}
function adminCard(p){return `<div class="admin-card"><div class="row-actions"><strong>${esc(p.name)}</strong><span>${p.active?'🟢 active':'⚪ masqué'}</span><button onclick="editForm(${p.id})">Modifier</button><button onclick="deleteProduct(${p.id})">Supprimer</button></div></div>`}
function formHtml(p={}){return `<div class="admin-card" id="form-${p.id||'new'}"><h3>${p.id?'Modifier':'Nouvelle'} fiche</h3><div class="formgrid"><label>Nom<input id="f-name" value="${esc(p.name||'')}"></label><label>Catégorie<input id="f-category" value="${esc(p.category||'Fantasy')}"></label><label>Description<textarea id="f-description">${esc(p.description||'')}</textarea></label><label>Image<input id="f-image-file" type="file" accept="image/*"><input id="f-image" placeholder="ou URL d'image" value="${esc(p.image||'')}"></label><label>Largeur cm<input id="f-width" type="number" step="0.1" value="${p.width??''}"></label><label>Hauteur cm<input id="f-height" type="number" step="0.1" value="${p.height??''}"></label><label>Profondeur cm<input id="f-depth" type="number" step="0.1" value="${p.depth??''}"></label><label>Poids g<input id="f-weight" type="number" step="1" value="${p.weight??''}"></label><label>Temps d'impression h<input id="f-hours" type="number" step="0.1" value="${p.print_hours??''}"></label><label>Matière<input id="f-material" value="${esc(p.material||'PLA')}"></label><label>Prix 1<input id="f-p1" type="number" step="0.01" value="${p.price1??''}"></label><label>Prix 2<input id="f-p2" type="number" step="0.01" value="${p.price2??''}"></label><label>Prix 3<input id="f-p3" type="number" step="0.01" value="${p.price3??''}"></label><label>Prix 4<input id="f-p4" type="number" step="0.01" value="${p.price4??''}"></label><label>Ordre<input id="f-order" type="number" value="${p.sort_order??0}"></label><label>Visible<select id="f-active"><option value="1" ${p.active!==0?'selected':''}>Oui</option><option value="0" ${p.active===0?'selected':''}>Non</option></select></label></div><button class="gold-button" style="width:auto" onclick="saveForm(${p.id||'null'})">Enregistrer</button> <button onclick="loadAdmin()">Annuler</button></div>`}
function newForm(){$('#forms').innerHTML=formHtml()}
async function editForm(id){const r=await fetch('/api/admin/products');const ps=await r.json();const p=ps.find(x=>x.id===id);$('#forms').innerHTML=formHtml(p);document.querySelector('#forms').scrollIntoView({behavior:'smooth',block:'start'})}
async function saveForm(id){
  const fd=new FormData();

  const vals={
    name:'f-name',
    category:'f-category',
    description:'f-description',
    image:'f-image',
    width:'f-width',
    height:'f-height',
    depth:'f-depth',
    weight:'f-weight',
    print_hours:'f-hours',
    material:'f-material',
    price1:'f-p1',
    price2:'f-p2',
    price3:'f-p3',
    price4:'f-p4',
    sort_order:'f-order',
    active:'f-active'
  };

  for(const [k,s] of Object.entries(vals)){
    fd.append(k,$('#'+s).value);
  }

  const file=$('#f-image-file').files[0];

  if(file){
    fd.delete('image');
    fd.append('image',file);
  }

  const r=await fetch(
    id ? `/api/admin/products/${id}` : '/api/admin/products',
    {
      method:id ? 'PUT' : 'POST',
      body:fd
    }
  );

  if(!r.ok){
    const error=await r.json().catch(()=>({}));

    console.error('ERREUR ENREGISTREMENT:',error);

    alert(
      'Erreur lors de l’enregistrement :\n\n' +
      (error.error || 'Erreur inconnue')
    );

    return;
  }

  loadAdmin();
}
async function deleteProduct(id){if(!confirm('Supprimer cette fiche et conserver ses réponses ?'))return;const r=await fetch('/api/admin/products/'+id,{method:'DELETE'});if(r.ok)loadAdmin();else alert('Suppression impossible.')}
async function loadStats(){
  const r=await fetch('/api/admin/stats');if(!r.ok)return;const ss=await r.json();
  const total=ss.reduce((a,s)=>a+s.responses,0);
  $('#stats').innerHTML=`<a class="gold-button" style="width:auto;display:inline-block;text-decoration:none;margin:0 0 14px" href="/api/admin/export.csv">⬇ Exporter en CSV</a><div class="mini-grid"><div class="mini"><b>${ss.length}</b><span>créations</span></div><div class="mini"><b>${total}</b><span>réponses</span></div><div class="mini"><b>${ss.filter(s=>s.responses>0).length}</b><span>créations évaluées</span></div></div>`
  +(ss.map(s=>{
    const withChoice=s.prices.filter(x=>x.price_choice!=null);
    const priceRespCount=withChoice.reduce((a,x)=>a+x.c,0);
    const avgPrice=priceRespCount?(withChoice.reduce((a,x)=>a+x.price_choice*x.c,0)/priceRespCount).toFixed(2):null;
    const maxPrice=Math.max(...s.prices.map(x=>x.c),1);
    const sortedPrices=[...s.prices].sort((a,b)=>b.c-a.c);
    const usesTotal=s.uses.reduce((a,x)=>a+x.c,0);
    const maxUse=Math.max(...s.uses.map(x=>x.c),1);
    const sortedUses=[...s.uses].sort((a,b)=>b.c-a.c);
    const noPriceCount=s.responses-priceRespCount;
    const interestAvg=s.interest?.avg;
    const interestBadge=interestAvg!=null?`<span class="interest-badge${interestAvg>=4?' good':interestAvg<2.5?' bad':''}">★ ${interestAvg}/5</span>`:'';
    const maxDist=Math.max(...(s.interest?.distribution||[]).map(x=>x.c),1);
    return `<div class="statsbox">
      <h3>${esc(s.product.name)} ${interestBadge}</h3>
      <p><strong>${s.responses}</strong> réponse${s.responses>1?'s':''}${avgPrice?` · prix moyen proposé : <strong>${avgPrice} €</strong>`:''}</p>
      ${(s.interest?.distribution?.length)?`<p><strong>Intérêt</strong> <small>(${s.interest.count} note${s.interest.count>1?'s':''})</small></p>
      ${s.interest.distribution.slice().reverse().map(x=>`<div class="stat-row"><span>${x.score}/5</span><span>${x.c} · ${Math.round(x.c/Math.max(s.interest.count,1)*100)}%</span></div><div class="statline"><i style="width:${Math.round(x.c/maxDist*100)}%"></i></div>`).join('')}`:''}
      <p><strong>Prix proposés</strong>${noPriceCount>0?` <small>(${noPriceCount} sans choix)</small>`:''}</p>
      ${sortedPrices.length?sortedPrices.map(x=>`<div class="stat-row"><span>${x.price_choice==null?'Non choisi':x.price_choice+' €'}</span><span>${x.c} · ${Math.round(x.c/Math.max(s.responses,1)*100)}%</span></div><div class="statline"><i style="width:${Math.round(x.c/maxPrice*100)}%"></i></div>`).join(''):'<p>Aucun prix sélectionné.</p>'}
      <p><strong>Utilisations</strong></p>
      ${sortedUses.length?sortedUses.map(x=>`<div class="stat-row"><span>${esc(x.uses||'Non renseigné')}</span><span>${x.c} · ${Math.round(x.c/Math.max(usesTotal,1)*100)}%</span></div><div class="statline"><i style="width:${Math.round(x.c/maxUse*100)}%"></i></div>`).join(''):'<p>Aucune donnée.</p>'}
      ${(s.comments&&s.comments.length)?`<p><strong>Commentaires libres</strong> <small>(${s.comments.length})</small></p><div class="comments">${s.comments.map(c=>`<div class="comment">“${esc(c)}”</div>`).join('')}</div>`:''}
    </div>`;
  }).join(''))||'<p>Aucune réponse.</p>';
}
loadProducts();
