'use client';
import {useEffect,useId,useRef,useState} from 'react';

type Recognition = {
  lang:string; continuous:boolean; interimResults:boolean; maxAlternatives:number; processLocally?:boolean;
  start():void; stop():void; abort():void;
  onaudiostart:(()=>void)|null;
  onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}> & {isFinal:boolean}>})=>void)|null;
  onerror:((event:{error:string})=>void)|null;
  onend:(()=>void)|null;
};
type Engine = {new():Recognition; available?:(options:{langs:string[];processLocally:boolean})=>Promise<string>};
const speechErrors:Record<string,string>={
  'not-allowed':'Microphone access was denied. Allow it in the site permissions and try again.',
  'service-not-allowed':'This browser blocked its speech service. Try the microphone on your Tamil keyboard.',
  'audio-capture':'No microphone input is available. Check the selected microphone and its device permissions.',
  'no-speech':'No speech reached the recognizer. Check your microphone input and speak after “Listening in Tamil” appears.',
  network:'The browser could not reach its speech service. Check your connection or use your Tamil keyboard microphone.',
  'language-not-supported':'This speech service does not support Tamil. Use your Tamil keyboard microphone.',
  'language-unavailable':'Tamil recognition is unavailable on this device. Use your Tamil keyboard microphone.',
  aborted:'Dictation stopped.'
};

export default function TamilNameInput({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const id=useId();
  const session=useRef<Recognition|null>(null);
  const [listening,setListening]=useState(false);
  const [hint,setHint]=useState('');
  const latest=useRef(onChange);
  useEffect(()=>{latest.current=onChange},[onChange]);
  useEffect(()=>()=>{const active=session.current;session.current=null;active?.abort()},[]);

  async function dictate(){
    if(session.current){session.current.stop();return;}
    const browser=window as Window & {SpeechRecognition?:Engine;webkitSpeechRecognition?:Engine};
    const Recognizer=browser.SpeechRecognition??browser.webkitSpeechRecognition;
    if(!Recognizer){setHint('Voice input is unavailable in this browser. Type the name or use your Tamil keyboard microphone.');return;}
    const active=new Recognizer();
    active.lang='ta-IN';
    active.continuous=false;
    active.interimResults=true;
    active.maxAlternatives=3;
    let tentative='';
    let finished=false;
    let failed=false;
    active.onaudiostart=()=>{
      if(session.current===active)setHint('Listening in Tamil…');
    };
    active.onresult=event=>{
      if(session.current!==active)return;
      const results=Array.from(event.results);
      const name=results.map(result=>{
        const choices=Array.from(result);
        return (choices.find(choice=>/[\u0B80-\u0BFF]/u.test(choice.transcript))??result[0])?.transcript.trim();
      }).filter(Boolean).join(' ');
      if(!name)return;
      tentative=name;
      if(results.every(result=>result.isFinal)){
        finished=true;
        latest.current(name);
        setHint('Review the Tamil name before saving.');
      }else setHint(name);
    };
    active.onerror=event=>{
      if(session.current!==active)return;
      failed=true;
      setHint(speechErrors[event.error]??('Speech service error ('+event.error+'). Try the microphone on your Tamil keyboard.'));
    };
    active.onend=()=>{
      if(session.current!==active)return;
      session.current=null;
      setListening(false);
      if(!finished && tentative){
        latest.current(tentative);
        setHint('Partial transcription. Check the name before saving.');
      }else if(!finished && !failed)setHint('The speech service returned no words. Try again or use your Tamil keyboard microphone.');
    };
    try{
      session.current=active;
      setListening(true);
      setHint('Starting Tamil microphone…');
      if(Recognizer.available && 'processLocally' in active){
        try{active.processLocally=await Recognizer.available({langs:['ta-IN'],processLocally:true})==='available';}
        catch{/* Use the browser default if local availability cannot be checked. */}
      }
      if(session.current===active)active.start();
    }
    catch{session.current=null;setListening(false);setHint('Could not start the microphone. Check browser permissions.');}
  }
  return <div className="sv-form-row [&_small]:text-sv-muted sm:[&_small]:col-start-2 [&_small:empty]:hidden">
    <label className="sv-label" htmlFor={id}>CUSTOMER NAME</label>
    <div className="relative [&_input]:pr-10 [&_button]:absolute [&_button]:inset-y-px [&_button]:right-px [&_button]:grid [&_button]:w-9 [&_button]:place-items-center [&_button]:text-sv-primary">
      <input className="sv-field" id={id} required lang="ta-IN" value={value} onChange={event=>onChange(event.target.value)}/>
      <button type="button" onClick={dictate} aria-pressed={listening}
        aria-label={listening?'Stop Tamil dictation':'Dictate customer name in Tamil'} title="Dictate name in Tamil">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0014 0v-1M12 18v4m-4 0h8"/>
        </svg>
      </button>
    </div>
    <small role="status">{hint}</small>
  </div>;
}
