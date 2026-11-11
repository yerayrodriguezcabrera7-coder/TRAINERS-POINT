(async () => {
  'use strict';
  if (new URLSearchParams(location.search).has('client')) { location.replace('/ventas.html'+location.search); return; }
  const $=id=>document.getElementById(id), form=$('product-form');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const eur=v=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(v));
  let products=[], me, editing=null, imageData=null, imageVersion=0, readingImage=false;
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
  function render() {
    const q=$('search').value.trim().toLocaleLowerCase('es');
    $('products').innerHTML=products.filter(p=>[p.name,p.description,p.barcode,p.sku].join(' ').toLocaleLowerCase('es').includes(q)).map(p=>
      `<tr><td><div class="product-identity">${photo(p.imageData,p.name)}<div><strong>${esc(p.name)}</strong><small>${esc(p.description)}</small>${p.barcode?`<small>Código: ${esc(p.barcode)}</small>`:''}</div></div></td><td>${eur(p.unitPrice)}</td><td><strong>${p.stock}</strong> unidades${p.trackStock===false?'<small>Alerta desactivada</small>':''}</td><td>${p.isActive?'Activo':'Retirado'}</td><td><div class="product-actions"><button type="button" data-detail="${esc(p.id)}">Ver detalle</button>${me.role==='ADMIN'&&p.isActive?`<button type="button" data-edit="${esc(p.id)}">Editar</button><button type="button" data-delete="${esc(p.id)}">Retirar</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="5">No hay productos con esta búsqueda.</td></tr>';
    const count=products.filter(p=>p.isActive&&p.trackStock!==false&&p.stock===0).length;
    $('stats').innerHTML=`<article><span>Sin stock</span><strong>${count}</strong><small>Productos activos con seguimiento de stock</small></article>`;
  }
  async function load(){products=(await api()).products;render();}
  function pricing(){
    const p=priceBreakdown(form.elements.price.value,form.elements.costPrice.value,form.elements.taxRate.value);
    $('pricing-base').textContent=p?eur(p.base):'—';$('pricing-tax').textContent=p?eur(p.tax):'—';
    $('pricing-margin').textContent=p?eur(p.margin)+(p.percent===null?'':` (${p.percent.toFixed(2)} %)`):'—';
  }
  function preview(){ $('product-image-preview').innerHTML=photo(imageData,'Vista previa del producto',true);$('remove-image').disabled=!imageData; }
  function edit(p){
    editing=p||null;imageVersion++;readingImage=false;imageData=p?.imageData||null;form.reset();
    for(const [key,value]of Object.entries({name:p?.name||'',barcode:p?.barcode||'',description:p?.description||'',price:p?.unitPrice??0,costPrice:p?.costPrice??0,taxRate:p?.taxRate??21,stock:p?.stock??0}))form.elements[key].value=value;
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
      await api(editing?'/'+editing.id:'',editing?'PUT':'POST',{name:fields.name.value,description:fields.description.value,barcode:fields.barcode.value,imageData,trackStock:fields.trackStock.checked,costPrice:Number(fields.costPrice.value),taxRate:Number(fields.taxRate.value),price:Number(fields.price.value),stock:Number(fields.stock.value),revision:editing?.revision});
      $('product-dialog').close();await load();$('notice').textContent='Producto guardado con su imagen, precios y existencias.';
    }catch(error){$('product-error').textContent=error.message;}finally{button.disabled=false;}
  };
  $('products').onclick=async event=>{
    const button=event.target.closest('button');if(!button)return;const p=products.find(p=>p.id===(button.dataset.edit||button.dataset.detail||button.dataset.delete));if(!p)return;
    if(button.dataset.edit)edit(p);
    if(button.dataset.detail){
      $('product-detail-title').textContent=p.name;const pricing=priceBreakdown(p.unitPrice,p.costPrice||0,p.taxRate||0);
      $('product-detail-content').innerHTML=`${photo(p.imageData,p.name,true)}<p>${esc(p.description||'Sin descripción.')}</p><dl class="product-detail-data"><dt>Código</dt><dd>${esc(p.barcode||'Sin código')}</dd><dt>PVP con IVA</dt><dd>${eur(p.unitPrice)}</dd><dt>Coste sin IVA</dt><dd>${eur(p.costPrice||0)}</dd><dt>Base imponible</dt><dd>${eur(pricing.base)}</dd><dt>IVA (${Number(p.taxRate||0)} %)</dt><dd>${eur(pricing.tax)}</dd><dt>Margen por unidad</dt><dd>${eur(pricing.margin)}</dd><dt>Stock</dt><dd>${p.stock} unidades</dd><dt>Seguimiento de stock</dt><dd>${p.trackStock===false?'Desactivado':'Activado'}</dd></dl>`;
      $('product-detail').showModal();
    }
    if(button.dataset.delete&&confirm('¿Retirar este producto? Se conservará su historial.')){button.disabled=true;try{await api('/'+p.id,'DELETE');await load();}catch(error){$('notice').textContent=error.message;button.disabled=false;}}
  };
  document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>$(button.dataset.close).close());
  $('search').oninput=render;$('refresh').onclick=()=>load().catch(error=>$('notice').textContent=error.message);
  try{
    const response=await fetch('/api/me');if(!response.ok)throw Error('Inicia sesión para consultar los productos.');me=await response.json();
    if(!['ADMIN','RECEPTION'].includes(me.role))throw Error('Tu perfil no permite acceder a productos.');$('new-product').hidden=me.role!=='ADMIN';await load();
  }catch(error){$('notice').textContent=error.message;}
})();
