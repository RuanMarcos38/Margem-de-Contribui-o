import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = {title:'Margem de Contribuição',description:'Precificação, custos, margens e análise gerencial'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
