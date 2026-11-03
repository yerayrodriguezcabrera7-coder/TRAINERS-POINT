require('dotenv/config');
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const restore=process.argv[2]==='restore';
try{
 if(!process.env.DATABASE_URL)throw Error('Configura DATABASE_URL.');
 const url=new URL(process.env.DATABASE_URL),env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGSSLMODE:url.searchParams.get('sslmode')||process.env.PGSSLMODE||'prefer'};
 let file,args,command;
 if(restore){file=path.resolve(process.argv[3]||'');if(!process.argv.includes('--confirm-restore')||!fs.statSync(file).isFile())throw Error('Indica el archivo y --confirm-restore. La restauración reemplaza los datos de la base de destino.');command=process.env.PG_RESTORE_BIN||(fs.existsSync('/opt/homebrew/opt/libpq/bin/pg_restore')?'/opt/homebrew/opt/libpq/bin/pg_restore':'pg_restore');args=['--clean','--if-exists','--no-owner','--no-acl','--exit-on-error','--single-transaction','--dbname',env.PGDATABASE,file];}
 else{const dir=path.resolve(process.env.BACKUP_DIR||'backups');fs.mkdirSync(dir,{recursive:true,mode:0o700});file=path.join(dir,'trainers-point-'+new Date().toISOString().replace(/[:.]/g,'-')+'.dump');fs.closeSync(fs.openSync(file,'wx',0o600));command=process.env.PG_DUMP_BIN||(fs.existsSync('/opt/homebrew/opt/libpq/bin/pg_dump')?'/opt/homebrew/opt/libpq/bin/pg_dump':'pg_dump');args=['--format=custom','--no-owner','--no-acl','--file',file];}
 const result=spawnSync(command,args,{env,stdio:['ignore','pipe','pipe']});
 if(result.error||result.status!==0){if(!restore&&fs.existsSync(file))fs.unlinkSync(file);throw Error('No se pudo '+(restore?'restaurar':'guardar')+' la copia. Comprueba PostgreSQL, sus herramientas y los permisos del destino.');}
 if(!restore)fs.chmodSync(file,0o600);
 console.log(restore?'Base restaurada correctamente.':'Copia guardada: '+file);
}catch(error){console.error(error.message);process.exitCode=1;}
