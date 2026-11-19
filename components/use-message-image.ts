'use client';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {resolveMessageImage,type MessageImage} from '@/lib/message-image';
export function useDefaultImage(){return useQuery<{image:MessageImage|null}>({queryKey:['default-message-image'],queryFn:async()=>{const response=await fetch('/api/settings/default-image');const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load default image.');return data;},staleTime:Infinity,retry:1});}
export function useMessageImage(){
 const defaults=useDefaultImage();const [override,setImage]=useState<MessageImage|null|undefined>(undefined);const [reading,setReading]=useState(false);
 return {image:resolveMessageImage(defaults.data?.image??null,override),setImage,resetImage:()=>setImage(undefined),defaultImage:defaults.data?.image??null,usingDefault:override===undefined,loading:defaults.isPending||reading,error:defaults.error,retry:()=>defaults.refetch(),setReading};
}
