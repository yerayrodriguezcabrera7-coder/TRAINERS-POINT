(async () => {
  'use strict';
  if (new URLSearchParams(location.search).has('client')) { location.replace('/caja.html'+location.search+'#sales-panel'); return; }
  const $=id=>document.getElementById(id), form=$('product-form');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const eur=v=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(v));
  let products=[], providers=[], me, editing=null, imageData=null, imageVersion=0, readingImage=false, selectedProvider='all';
  async function api(path='',method='GET',body) {
    const response=await fetch('/api/inventory/products'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    const data=await response.json(); if(!response.ok)throw Error(data.error||'No se pudo guardar el producto.'); return data;
  }
  function photo(value,name,large=false) {
    return value && /^data:image\/(png|jpeg|webp);base64,/.test(value) ? `<img class="product-photo${large?' is-large':''}" src="${esc(value)}" alt="${esc(name)}" loading="${large?'eager':'lazy'}">` :
      `<span class="product-placeholder${large?' is-large':''}" role="img" aria-label="Sin imagen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 4 4 3-3 5 6"/></svg></span>`;
  }
  function priceBreakdown(price,cost,rate) {
    const gross=Math.round(Number(price)*100),taxRate=Math.round(Number(rate)*100),costCents=Math.round(Number(cost)*100);
    if(![gross,taxRate,costCents].every(Number.isFinite)||gross<0||costCents<0||taxRate<0||taxRate>10000)return null;
    const base=Math.round(gross*10000/(10000+taxRate));
    return {base:base/100,tax:(gross-base)/100,margin:(base-costCents)/100,percent:base>0?(base-costCents)/base*100:null};
  }
  function renderSupplierFilters() {
    const container = $('supplier-filters');
    if (!container) return;
    const counts = {};
    let noneCount = 0;
    for (const p of products) {
      if (p.providerId) {
        counts[p.providerId] = (counts[p.providerId] || 0) + 1;
      } else {
        noneCount++;
      }
    }
    const pills = [];
    pills.push(`<span class="supplier-filter-label"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm12 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg> Proveedor:</span>`);
    pills.push(`<button type="button" class="supplier-pill${selectedProvider === 'all' ? ' active' : ''}" data-provider="all">Todos <span class="count-badge">${products.length}</span></button>`);
    const seen = new Set();
    for (const prov of providers) {
      seen.add(prov.id);
      const c = counts[prov.id] || 0;
      pills.push(`<button type="button" class="supplier-pill${selectedProvider === prov.id ? ' active' : ''}" data-provider="${esc(prov.id)}">${esc(prov.name)} <span class="count-badge">${c}</span></button>`);
    }
    for (const p of products) {
      if (p.providerId && p.provider?.name && !seen.has(p.providerId)) {
        seen.add(p.providerId);
        const c = counts[p.providerId] || 0;
        pills.push(`<button type="button" class="supplier-pill${selectedProvider === p.providerId ? ' active' : ''}" data-provider="${esc(p.providerId)}">${esc(p.provider.name)} <span class="count-badge">${c}</span></button>`);
      }
    }
    if (noneCount > 0) {
      pills.push(`<button type="button" class="supplier-pill${selectedProvider === 'none' ? ' active' : ''}" data-provider="none">Sin proveedor <span class="count-badge">${noneCount}</span></button>`);
    }
    pills.push(`<a href="/proveedores.html" class="supplier-pill-manage" title="Gestionar proveedores">⚙ Proveedores →</a>`);
    container.innerHTML = pills.join('');
  }
  function render() {
    const q=$('search').value.trim().toLocaleLowerCase('es');
    let filtered = products;
    if (selectedProvider === 'none') {
      filtered = filtered.filter(p => !p.providerId);
    } else if (selectedProvider !== 'all') {
      filtered = filtered.filter(p => p.providerId === selectedProvider);
    }
    $('products').innerHTML=filtered.filter(p=>[p.name,p.description,p.barcode,p.sku,p.provider?.name].join(' ').toLocaleLowerCase('es').includes(q)).map(p=>
      `<tr><td><div class="product-identity">${photo(p.imageData,p.name)}<div><strong>${esc(p.name)}</strong><small>${esc(p.description)}</small>${p.barcode?`<small>Código: ${esc(p.barcode)}</small>`:''}${p.provider?.name?`<small>Proveedor: ${esc(p.provider.name)}</small>`:''}</div></div></td><td>${eur(p.unitPrice)}</td><td><strong>${p.stock}</strong> unidades${p.trackStock===false?'<small>Alerta desactivada</small>':''}</td><td>${p.isActive?'Activo':'Retirado'}</td><td><div class="product-actions"><button type="button" data-detail="${esc(p.id)}">Ver detalle</button>${(me.role==='ADMIN'||(Array.isArray(me.pagePermissions)&&me.pagePermissions.includes('productos.html')))&&p.isActive?`<button type="button" data-edit="${esc(p.id)}">Editar</button><button type="button" data-delete="${esc(p.id)}">Retirar</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="5">No hay productos con este filtro.</td></tr>';
    const count=products.filter(p=>p.isActive&&p.trackStock!==false&&p.stock===0).length;
    $('stats').innerHTML=`<article><span>Sin stock</span><strong>${count}</strong><small>Productos activos con seguimiento de stock</small></article>`;
  }
  async function load(){
    products=(await api()).products||[];
    try {
      const pRes = await fetch('/api/inventory/providers');
      if (pRes.ok) {
        const pData = await pRes.json();
        providers = Array.isArray(pData.providers) ? pData.providers : [];
      }
    } catch (_) {}
    renderSupplierFilters();
    render();
  }
  function pricing(){
    const p=priceBreakdown(form.elements.price.value,form.elements.costPrice.value,form.elements.taxRate.value);
    $('pricing-base').textContent=p?eur(p.base):'—';$('pricing-tax').textContent=p?eur(p.tax):'—';
    $('pricing-margin').textContent=p?eur(p.margin)+(p.percent===null?'':` (${p.percent.toFixed(2)} %)`):'—';
  }
  function preview(){ $('product-image-preview').innerHTML=photo(imageData,'Vista previa del producto',true);$('remove-image').disabled=!imageData; }
  function edit(p){
    editing=p||null;imageVersion++;readingImage=false;imageData=p?.imageData||null;form.reset();
    form.elements.providerId.innerHTML='<option value="">Sin proveedor asignado</option>'+providers.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
    for(const [key,value]of Object.entries({name:p?.name||'',barcode:p?.barcode||'',providerId:p?.providerId||'',description:p?.description||'',price:p?.unitPrice??0,costPrice:p?.costPrice??0,taxRate:p?.taxRate??21,stock:p?.stock??0}))form.elements[key].value=value;
    form.elements.stock.disabled=me.role!=='ADMIN';
    form.elements.trackStock.checked=p?.trackStock!==false;$('save-product').disabled=false;$('product-error').textContent='';$('product-title').textContent=p?'Editar producto':'Nuevo producto';
    preview();pricing();$('product-dialog').showModal();
  }
  $('new-product').onclick=()=>edit();
  for(const key of ['price','costPrice','taxRate'])form.elements[key].addEventListener('input',pricing);
  $('remove-image').onclick=()=>{imageVersion++;imageData=null;readingImage=false;$('product-image').value='';$('save-product').disabled=false;preview();};
  $('product-image').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    const version=++imageVersion;readingImage=true;$('save-product').disabled=true;$('product-error').textContent='';
    try{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Selecciona PNG, JPEG o WebP de hasta 10 MB. La imagen se optimiza antes de guardar.');
      const value=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('No se pudo leer la imagen.'));reader.readAsDataURL(file);});
      const img=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('El archivo no es una imagen válida.'));img.src=value;});
      const canvas=document.createElement('canvas'),scale=Math.min(1,640/Math.max(img.width,img.height));canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
      const context=canvas.getContext('2d');if(!context)throw Error('No se pudo preparar la imagen.');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);
      const result=canvas.toDataURL('image/jpeg',0.82);if(result.length>750000)throw Error('La imagen es demasiado grande. Elige otra más pequeña.');
      if(version===imageVersion){imageData=result;preview();}
    }catch(error){if(version===imageVersion)$('product-error').textContent=error.message;}
    finally{if(version===imageVersion){readingImage=false;$('save-product').disabled=false;}}
  };
  form.onsubmit=async event=>{
    event.preventDefault();if(readingImage)return;const fields=form.elements,button=$('save-product');button.disabled=true;
    try{
      await api(editing?'/'+editing.id:'',editing?'PUT':'POST',{name:fields.name.value,description:fields.description.value,providerId:fields.providerId.value||null,barcode:fields.barcode.value,imageData,trackStock:fields.trackStock.checked,costPrice:Number(fields.costPrice.value),taxRate:Number(fields.taxRate.value),price:Number(fields.price.value),stock:Number(fields.stock.value),revision:editing?.revision});
      $('product-dialog').close();await load();$('notice').textContent='Producto guardado con su imagen, precios y existencias.';
    }catch(error){$('product-error').textContent=error.message;}finally{button.disabled=false;}
  };
  $('products').onclick=async event=>{
    const button=event.target.closest('button');if(!button)return;const p=products.find(p=>p.id===(button.dataset.edit||button.dataset.detail||button.dataset.delete));if(!p)return;
    if(button.dataset.edit)edit(p);
    if(button.dataset.detail){
      $('product-detail-title').textContent=p.name;const pricing=priceBreakdown(p.unitPrice,p.costPrice||0,p.taxRate||0);
      $('product-detail-content').innerHTML=`${photo(p.imageData,p.name,true)}<p>${esc(p.description||'Sin descripción.')}</p><dl class="product-detail-data"><dt>Proveedor</dt><dd>${esc(p.provider?.name||'Sin indicar')}</dd><dt>Código</dt><dd>${esc(p.barcode||'Sin código')}</dd><dt>PVP con IVA</dt><dd>${eur(p.unitPrice)}</dd><dt>Coste sin IVA</dt><dd>${eur(p.costPrice||0)}</dd><dt>Base imponible</dt><dd>${eur(pricing.base)}</dd><dt>IVA (${Number(p.taxRate||0)} %)</dt><dd>${eur(pricing.tax)}</dd><dt>Margen por unidad</dt><dd>${eur(pricing.margin)}</dd><dt>Stock</dt><dd>${p.stock} unidades</dd><dt>Seguimiento de stock</dt><dd>${p.trackStock===false?'Desactivado':'Activado'}</dd></dl>`;
      $('product-detail').showModal();
    }
    if(button.dataset.delete&&confirm('¿Retirar este producto? Se conservará su historial.')){button.disabled=true;try{await api('/'+p.id,'DELETE');await load();}catch(error){$('notice').textContent=error.message;button.disabled=false;}}
  };
  document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
  if ($('supplier-filters')) {
    $('supplier-filters').onclick = event => {
      const btn = event.target.closest('.supplier-pill');
      if (!btn) return;
      selectedProvider = btn.dataset.provider;
      renderSupplierFilters();
      render();
    };
  }
  $('search').oninput=render;$('refresh').onclick=()=>load().catch(error=>$('notice').textContent=error.message);
  try{
    const response=await fetch('/api/me');if(!response.ok)throw Error('Inicia sesión para consultar los productos.');me=await response.json();
    const canProducts=me.role==='ADMIN'||(Array.isArray(me.pagePermissions)?me.pagePermissions.includes('productos.html'):['ADMIN','RECEPTION'].includes(me.role));
    if(!canProducts)throw Error('Tu perfil no permite acceder a productos.');
    const canEditProducts=me.role==='ADMIN'||(Array.isArray(me.pagePermissions)&&me.pagePermissions.includes('productos.html'));
    $('new-product').hidden=!canEditProducts;
    const urlParams = new URLSearchParams(location.search);
    if (urlParams.get('proveedor')) {
      selectedProvider = urlParams.get('proveedor');
    }
    await load();
    if (urlParams.get('nuevo') === '1' && canEditProducts) {
      edit();
      if (urlParams.get('barcode')) form.elements.barcode.value = urlParams.get('barcode');
    }
  }catch(error){$('notice').textContent=error.message;}
})();
