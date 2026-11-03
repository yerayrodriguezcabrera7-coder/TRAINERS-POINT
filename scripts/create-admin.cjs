require('dotenv/config');
const {PrismaClient}=require('@prisma/client'),{Pool}=require('pg'),{Access}=require('../dist/calendar/access'),{Store}=require('../dist/calendar/store');
(async()=>{
 const username=process.env.ADMIN_USERNAME,password=process.env.ADMIN_PASSWORD,name=process.env.ADMIN_NAME;
 if(!username||!name||!password||password.length<12)throw Error('Indica ADMIN_USERNAME, ADMIN_NAME y ADMIN_PASSWORD (al menos 12 caracteres) mediante variables de entorno.');
 const db=new PrismaClient(),pool=new Pool({connectionString:process.env.DATABASE_URL});
 try{
  let gym=process.env.ADMIN_GYM_ID?await db.gym.findUnique({where:{id:process.env.ADMIN_GYM_ID}}):null;
  if(!gym){if(!process.env.ADMIN_GYM_NAME)throw Error('Indica ADMIN_GYM_ID de un centro existente o ADMIN_GYM_NAME para crear uno.');gym=await db.gym.create({data:{name:process.env.ADMIN_GYM_NAME}});}
  const access=new Access(pool,db),store=new Store(pool,db);await store.migrate();
  if(!await access.needsSetup(gym.id))throw Error('Este centro ya tiene cuentas. Usa la gestión de usuarios para cambiar accesos.');
  const schedule=Array.from({length:7},()=>({open:'09:00',close:'18:00',closed:false}));
  await store.seed(gym.id,{timezone:'Europe/Madrid',schedule,employees:[{id:'initial-admin',name,color:'#ff7f0a',schedule}],rooms:[{id:'main-room',name:'Sala principal'}],services:[{id:'setup-service',name:'Configurar catálogo de servicios',duration:60,capacity:1,active:false}],clients:[]});
  await access.save(gym.id,{employeeId:'initial-admin',username,name,role:'ADMIN',enabled:true,password,mustChangePassword:true});
  console.log('Cuenta de administración creada. Centro: '+gym.id+'. Reinicia la aplicación y configura servicios, trabajadores y horarios.');
 }finally{await pool.end();await db.$disconnect();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
