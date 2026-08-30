import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import LogoutButton from './logout-button'

export default async function Dashboard(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/');const {data:profile}=await supabase.from('profiles').select('full_name,role').eq('id',user.id).single();return <main style={{padding:48}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div className="brand">Coki</div><LogoutButton/></div><h1>Hola, {profile?.full_name||user.email}</h1><p>Panel inicial · Rol: {profile?.role||'pendiente de configurar'}</p><p style={{color:'var(--muted)'}}>Desde acá vamos a construir stock, ventas y cajas.</p></main>}
