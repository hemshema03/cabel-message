import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function database(){const jar=await cookies(); return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>jar.getAll(),setAll:items=>{try{items.forEach(({name,value,options})=>jar.set(name,value,options));}catch{}}}});}
export async function authorized(){const db=await database();const {data:{user}}=await db.auth.getUser();if(!user)throw new Error('Unauthorized');const {data}=await db.from('operators').select('id').eq('id',user.id).single();if(!data)throw new Error('Forbidden');return db;}
