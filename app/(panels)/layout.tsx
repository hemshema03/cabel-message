import {authorized} from '@/lib/db';
import {redirect} from 'next/navigation';
import QueueContinuation from '@/components/queue-continuation';
export default async function Layout({children}:{children:React.ReactNode}){try{await authorized();}catch{redirect('/login');}return <><QueueContinuation/>{children}</>;}
