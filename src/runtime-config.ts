export function runtimeConfig(env:NodeJS.ProcessEnv=process.env){
 const production=env.NODE_ENV==='production',port=Number(env.PORT||3000);
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT debe ser un puerto válido.');
 let publicOrigin:string|undefined;
 if(env.PUBLIC_ORIGIN){const url=new URL(env.PUBLIC_ORIGIN);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('PUBLIC_ORIGIN debe contener únicamente el origen de la web.');publicOrigin=url.origin;}
 if(production){
  if(!publicOrigin?.startsWith('https://'))throw Error('Configura PUBLIC_ORIGIN con el dominio HTTPS antes de iniciar producción.');
  if(!env.DATABASE_URL)throw Error('Configura DATABASE_URL para producción.');
  if(env.CALENDAR_DATABASE_URL&&env.CALENDAR_DATABASE_URL!==env.DATABASE_URL)throw Error('Calendario y gestión deben compartir DATABASE_URL para guardar las reservas y los bonos de forma atómica.');
  if(!env.CALENDAR_ADMIN_TOKEN||env.CALENDAR_ADMIN_TOKEN.length<32||env.CALENDAR_ADMIN_TOKEN.includes('REEMPLAZAR'))throw Error('Configura una clave de administración de al menos 32 caracteres.');
  if(env.TRAINERS_POINT_DEV_ADMIN==='true')throw Error('La cuenta provisional está deshabilitada en producción.');
 }
 return {production,port,publicOrigin,host:env.HOST||(production?'0.0.0.0':'127.0.0.1')};
}
