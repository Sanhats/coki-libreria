'use client'
import { createClient } from '@/lib/supabase-browser'

export default function LogoutButton(){
  async function logout(){ await createClient().auth.signOut(); window.location.href='/' }
  return <button className="link" onClick={logout}>Cerrar sesión</button>
}
