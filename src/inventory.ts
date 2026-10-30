import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { ApiError } from './calendar/model';
import type { Identity } from './calendar/access';
const productInput=z.object({name:z.string().trim().min(1).max(200),description:z.string().trim().max(2000).default(''),price:z.number().min(0).max(1000000).refine(v=>Math.abs(v*100-Math.round(v*100))<1e-6),stock:z.number().int().min(0).max(1000000),revision:z.number().int().positive().optional()});
const saleInput=z.object({requestKey:z.string().uuid(),clientId:z.string().uuid().nullable(),lines:z.array(z.object({productId:z.string().uuid(),quantity:z.number().int().min(1).max(10000)})).min(1).max(100)});
const returnInput=z.object({requestKey:z.string().uuid(),lines:z.array(z.object({lineId:z.string().uuid(),quantity:z.number().int().min(1).max(10000)})).min(1).max(100)});
export class Inventory {
 constructor(private db:PrismaClient){}
 private transaction<T>(gym:string,fn:(tx:Prisma.TransactionClient)=>Promise<T>){return this.db.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${gym}, 0))`;return fn(tx);},{timeout:15000});}
 async products(gym:string){return this.db.product.findMany({where:{gymKey:gym},orderBy:{name:'asc'}});}
 async saveProduct(gym:string,raw:unknown,id?:string){const v=productInput.parse(raw);return this.transaction(gym,async tx=>{
  const old=id?await tx.product.findFirst({where:{id,gymKey:gym}}):null;
  if(id&&!old)throw new ApiError(404,'Producto desconocido.');
  if(old&&v.revision!==old.revision)throw new ApiError(409,'El stock ha cambiado. Actualiza antes de guardar.');
  const product=old?await tx.product.update({where:{id:old.id},data:{name:v.name,description:v.description,unitPrice:v.price,stock:v.stock,revision:{increment:1}}}):await tx.product.create({data:{gymKey:gym,name:v.name,description:v.description,unitPrice:v.price,stock:v.stock}});
  const difference=v.stock-(old?.stock||0);
  if(difference)await tx.stockMovement.create({data:{productId:product.id,type:old?'AJUSTE':'ENTRADA',quantity:difference,reference:'Inventario',notes:old?'Ajuste manual de existencias':'Stock inicial'}});
  return product;
 });}
 async removeProduct(gym:string,id:string){return this.transaction(gym,async tx=>{const p=await tx.product.findFirst({where:{id,gymKey:gym}});if(!p)throw new ApiError(404,'Producto desconocido.');return tx.product.update({where:{id},data:{isActive:false,revision:{increment:1}}});});}
 async sell(gym:string,actor:string,raw:unknown){const v=saleInput.parse(raw);if(new Set(v.lines.map(l=>l.productId)).size!==v.lines.length)throw new ApiError(400,'Agrupa las unidades de cada producto en una sola línea.');
 return this.transaction(gym,async tx=>{
  const existing=await tx.sale.findUnique({where:{requestKey:v.requestKey},include:{lines:true}});if(existing){if(existing.gymKey!==gym || existing.clientId!==v.clientId || existing.lines.length!==v.lines.length || v.lines.some(l=>!existing.lines.some(e=>e.productId===l.productId&&Number(e.quantity)===l.quantity)))throw new ApiError(409,'Identificador de venta ya utilizado.');return existing;}
  if(v.clientId&&!(await tx.client.findFirst({where:{id:v.clientId,gymId:gym}})))throw new ApiError(400,'Selecciona un cliente de este gimnasio.');
  const lines=[];let total=0;
  for(const l of v.lines){const p=await tx.product.findFirst({where:{id:l.productId,gymKey:gym,isActive:true}});if(!p||p.stock<l.quantity)throw new ApiError(409,'Producto no disponible o stock insuficiente.');const cents=Math.round(Number(p.unitPrice)*100),amount=cents*l.quantity;total+=amount;
   lines.push({type:'PRODUCTO' as const,productId:p.id,description:p.name,quantity:l.quantity,unitPrice:p.unitPrice,taxRate:0,lineSubtotal:amount/100,taxAmount:0,lineTotal:amount/100});
  }
  if(total>999999999999)throw new ApiError(400,'El importe de la venta supera el máximo permitido.');
  const sale=await tx.sale.create({data:{gymKey:gym,requestKey:v.requestKey,sellerAccountId:actor,clientId:v.clientId,status:'COMPLETADA',soldAt:new Date(),subtotal:total/100,taxAmount:0,totalAmount:total/100,lines:{create:lines}},include:{lines:true}});
  for(const l of v.lines){await tx.product.update({where:{id:l.productId},data:{stock:{decrement:l.quantity},revision:{increment:1}}});await tx.stockMovement.create({data:{productId:l.productId,type:'VENTA',quantity:-l.quantity,reference:sale.id}});}
  return sale;
 });}
 async reverse(gym:string,id:string,raw:unknown,cancel=false){const requested=cancel?null:returnInput.parse(raw);return this.transaction(gym,async tx=>{
  const sale=await tx.sale.findFirst({where:{id,gymKey:gym},include:{lines:true}});if(!sale)throw new ApiError(404,'Venta desconocida.');
  if((cancel&&sale.status==='CANCELADA')||(!cancel&&sale.returnKeys.includes(requested!.requestKey)))return sale;
  if(sale.status!=='COMPLETADA')throw new ApiError(409,'Esta venta ya está anulada o devuelta.');
  const items=cancel?sale.lines.filter(l=>Number(l.quantity)>l.returnedQuantity).map(l=>({lineId:l.id,quantity:Number(l.quantity)-l.returnedQuantity})):requested!.lines;
  if(new Set(items.map(l=>l.lineId)).size!==items.length)throw new ApiError(400,'Líneas de devolución duplicadas.');
  for(const item of items){const line=sale.lines.find(l=>l.id===item.lineId);if(!line?.productId||item.quantity>Number(line.quantity)-line.returnedQuantity)throw new ApiError(409,'La devolución supera las unidades pendientes.');
   await tx.saleLine.update({where:{id:line.id},data:{returnedQuantity:{increment:item.quantity}}});await tx.product.update({where:{id:line.productId},data:{stock:{increment:item.quantity},revision:{increment:1}}});await tx.stockMovement.create({data:{productId:line.productId,type:'DEVOLUCION',quantity:item.quantity,reference:sale.id,notes:cancel?'Anulación de venta':'Devolución parcial o total'}});
  }
  const lines=await tx.saleLine.findMany({where:{saleId:id}});return tx.sale.update({where:{id},data:{...(!cancel?{returnKeys:{push:requested!.requestKey}}:{}),status:cancel?'CANCELADA':lines.every(l=>l.returnedQuantity===Number(l.quantity))?'REEMBOLSADA':'COMPLETADA'},include:{lines:true}});
 });}
 async sales(gym:string,q:URLSearchParams){const from=q.get('from'),to=q.get('to');const valid=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&DateTime.fromISO(v).isValid;if((from&&!valid(from))||(to&&!valid(to))||(from&&to&&from>to))throw new ApiError(400,'Fechas inválidas.');
 const client=q.get('client');const rows=await this.db.sale.findMany({where:{gymKey:gym,...(client?{clientId:client==='walkin'?null:client}:{}),...(q.get('product')?{lines:{some:{productId:q.get('product')!}}}:{}),...(from||to?{soldAt:{...(from?{gte:DateTime.fromISO(from,{zone:'Europe/Madrid'}).startOf('day').toJSDate()}:{}),...(to?{lt:DateTime.fromISO(to,{zone:'Europe/Madrid'}).plus({days:1}).startOf('day').toJSDate()}:{})}}:{})},include:{client:{select:{firstName:true,lastName:true}},lines:true},orderBy:{soldAt:'desc'},take:500});return rows;}
}
export function inventoryPermission(actor:Identity|undefined,action:string){if(!actor)throw new ApiError(401,'Inicia sesión.');if(actor.role!=='ADMIN'&&!(actor.role==='RECEPTION'&&['read','sell'].includes(action)))throw new ApiError(403,'No tienes permiso para esta operación.');}
