import './globals.css'
import './rebrand.css'
import './dashboard/shell.css'
import './mobile.css'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Escuadra Software · Gestión inteligente', description: 'Sistema inteligente de gestión para negocios' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es"><body>{children}</body></html> }
