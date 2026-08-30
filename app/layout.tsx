import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Coki · Gestión de librería', description: 'Control de stock, ventas y cajas' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="es"><body>{children}</body></html> }
