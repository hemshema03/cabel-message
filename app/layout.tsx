import {Suspense} from 'react';
import './globals.css';
import Providers from './providers';
export const metadata={title:'Cable Â· WhatsApp Manager',description:'Customer billing and service communications'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><Providers><Suspense fallback={<p>Loading...</p>}>{children}</Suspense></Providers></body></html>;}
