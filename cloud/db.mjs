import postgres from 'postgres';

export const sql=postgres(process.env.DATABASE_URL,{max:3,idle_timeout:20,connect_timeout:20,prepare:false});
const empty=()=>({format:1,documents:[],topics:[]});
const fail=(status,message)=>Object.assign(Error(message),{status});

export function accountRepository(userId){
 return {
  async read(){const rows=await sql`SELECT library FROM torah_libraries WHERE user_id=${userId}`;return rows[0]?.library||empty();},
  async change(fn){return sql.begin(async tx=>{
   await tx`INSERT INTO torah_libraries(user_id,library) VALUES(${userId},${tx.json(empty())}) ON CONFLICT DO NOTHING`;
   const [row]=await tx`SELECT library FROM torah_libraries WHERE user_id=${userId} FOR UPDATE`;
   const result=await fn(row.library);
   row.library.topics=[...new Set([...(row.library.topics||[]),...row.library.documents.filter(d=>d.kind==='topic').map(d=>d.topic)])];
   if(Buffer.byteLength(JSON.stringify(row.library))>25*1024*1024)throw fail(413,'הספרייה בענן הגיעה למגבלת 25MB. הספרייה המקומית אינה מוגבלת.');
   await tx`UPDATE torah_libraries SET library=${tx.json(row.library)},updated_at=now() WHERE user_id=${userId}`;
   return result;
  });},
  async readOriginal(id){const [row]=await sql`SELECT content,complete FROM torah_originals WHERE user_id=${userId} AND document_id=${id}`;if(!row?.complete)throw fail(404,'קובץ המקור לא סונכרן עדיין');return row.content;},
  async writeOriginal(id,buffer){return this.writeChunk(id,0,buffer.length,buffer);},
  async writeChunk(id,offset,total,chunk){
   if(offset+chunk.length>total||!chunk.length)throw fail(400,'גודל מקטע לא תקין');
   return sql.begin(async tx=>{
    await tx`SELECT user_id FROM torah_libraries WHERE user_id=${userId} FOR UPDATE`;
    const [used]=await tx`SELECT coalesce(sum(octet_length(content)),0)::int AS size FROM torah_originals WHERE user_id=${userId} AND document_id<>${id}`;
    if(used.size+total>100*1024*1024)throw fail(413,'קובצי Word בענן מוגבלים יחד ל־100MB לחשבון');
    const [row]=await tx`SELECT content,total FROM torah_originals WHERE user_id=${userId} AND document_id=${id}`;
    let buffer=offset===0?Buffer.alloc(0):row?.content;
    if(!buffer||buffer.length!==offset||(offset>0&&row.total!==total))throw fail(409,'יש להתחיל מחדש את העלאת הקובץ');
    buffer=Buffer.concat([buffer,chunk]);
    await tx`INSERT INTO torah_originals(user_id,document_id,content,total,complete) VALUES(${userId},${id},${buffer},${total},${buffer.length===total}) ON CONFLICT(user_id,document_id) DO UPDATE SET content=EXCLUDED.content,total=EXCLUDED.total,complete=EXCLUDED.complete`;
   });
  }
 };
}
