import {authorized} from '@/lib/db';
import {redirect} from 'next/navigation';
export default async function Layout({children}:{children:React.ReactNode}){try{await authorized();}catch{redirect('/login');}return children;}
