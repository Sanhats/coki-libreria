import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { createHash, randomBytes } from 'crypto'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()
    const generic = { message: 'Si el correo corresponde a un vendedor, recibirás un enlace de recuperación.' }
    if (!email) return NextResponse.json(generic)
    const admin = createAdminClient()
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (users.error) throw new Error('Supabase Auth: ' + users.error.message)
    const user = users.data.users.find(u => u.email?.toLowerCase() === String(email).toLowerCase())
    if (!user) return NextResponse.json(generic)
    const { data: profile, error: roleError } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (roleError) throw new Error('Perfil: ' + roleError.message)
    if (profile?.role !== 'seller') return NextResponse.json(generic)
    const raw = randomBytes(32).toString('hex')
    const hash = createHash('sha256').update(raw).digest('hex')
    await admin.from('password_reset_tokens').delete().eq('user_id', user.id)
    const { error } = await admin.from('password_reset_tokens').insert({ user_id: user.id, token_hash: hash, expires_at: new Date(Date.now() + 900000).toISOString() })
    if (error) throw new Error('Tokens: ' + error.message)
    const link = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/auth/reset-password?token=' + raw
    const response = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY || '', 'Content-Type': 'application/json' }, body: JSON.stringify({ sender: { name: process.env.BREVO_FROM_NAME || 'Coki', email: process.env.BREVO_FROM_EMAIL }, to: [{ email: user.email }], subject: 'Recuperar contraseña · Coki', htmlContent: '<h2>Recuperación de contraseña</h2><p>Este enlace vence en 15 minutos:</p><p><a href="' + link + '">Cambiar contraseña</a></p>' }) })
    if (!response.ok) throw new Error('Brevo: ' + await response.text())
    return NextResponse.json(generic)
  } catch (error) {
    console.error('[request-reset]', error)
    return NextResponse.json({ error: 'Error del servidor. Revisá la terminal de Next.js para ver el detalle.' }, { status: 500 })
  }
}
