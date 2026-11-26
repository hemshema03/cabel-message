'use client';
import toast from 'react-hot-toast';
import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import ImportRecipients from './import-recipients';
import {accountForm,blankForm,columns,type Account,type Form,type Master} from '@/lib/customer-profiles';

const masterSections = [
      {kind: 'plan', title: 'Monthly plans', field: 'Plan name'},
      {kind: 'channel', title: 'Add-on channels', field: 'Channel name'},
      {kind: 'agent', title: 'Collection agents', field: 'Agent name'},
    ] as const;

const tableColumns = [
  ['select', 'Select'], ['actions', 'Actions'], ...columns,
  ['cin', 'CIN'], ['channels', 'Add-on channels'], ['monthly_total', 'Monthly total'],
] as const;
type ColumnKey = typeof tableColumns[number][0];
const filterColumns = tableColumns.filter(([key]) => key !== 'actions');
type Filters = Partial<Record<ColumnKey,string>>;
function isAmount(key:ColumnKey) {
  return key === 'monthly_rent' || key === 'balance' || key === 'monthly_total';
}
function Popup({title,onClose,busy=false,children}:{title:string;onClose:()=>void;busy?:boolean;children:ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="customer-popup" aria-label={title} onCancel={e=>{
    e.preventDefault();
    if (!busy) onClose();
  }}>{children}</dialog>;
}
const optionalColumns = tableColumns.filter(([key]) => key !== 'select' && key !== 'actions');
const columnKeys = optionalColumns.map(([key]) => key);
const preferenceKey = 'cable.customer-directory.columns.v1';

function savedColumns(): ColumnKey[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(preferenceKey) ?? 'null');
    if (Array.isArray(saved)) {
      const valid = columnKeys.filter(key => saved.includes(key));
      if (valid.length) return valid;
    }
  } catch { /* Use defaults when browser storage is unavailable. */ }
  return columnKeys;
}

type Directory={accounts:Account[];masters:Master[]};
const currency=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'});
function monthlyRent(base: string | number, channelFee: number) {
  return (Math.round(Number(base) * 100) + Math.round(Number(channelFee) * 100)) / 100;
}
const idOrder = new Intl.Collator('en-IN', {numeric: true});
async function request(payload?:unknown){
  const upload=payload instanceof FormData;
  const response=await fetch('/api/customer-accounts',payload===undefined?undefined:{
    method:'POST',headers:upload?undefined:{'Content-Type':'application/json'},body:upload?payload:JSON.stringify(payload)
  });
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'Unable to load customer accounts.');
  return result;
}
function Profile({form,setForm,masters,editing,busy,onSave,onClose}:{
  form:Form;setForm:(f:Form)=>void;masters:Master[];editing:boolean;busy:boolean;onSave:()=>void;onClose:()=>void
}){
  const change=(key:keyof Form,value:string)=>setForm({...form,[key]:value});
  const [channelSearch, setChannelSearch] = useState('');
  const pickerRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function closeOutside(event: PointerEvent | FocusEvent) {
      const picker = pickerRef.current;
      if (picker?.open && event.target instanceof Node && !picker.contains(event.target)) {
        picker.open = false;
      }
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, []);
  const channels = masters.filter(item => item.kind === 'channel');
  const channelFee = channels.reduce((sum, item) => form.channels.includes(item.name) ? sum + Number(item.amount) : sum, 0);
  const matchingChannels = channels.filter(item => item.name.toLowerCase().includes(channelSearch.trim().toLowerCase()));
  return <form className="card" onSubmit={e=>{e.preventDefault();onSave()}}>
    <h2>{editing?'Edit customer':'Add customer'}</h2>
    <fieldset disabled={busy} className="recipient-editor"><div className="mapping-grid">
    {columns.map(([key,label])=><label key={key}>{key === 'monthly_rent' ? 'BASE PLAN AMOUNT' : label}
      {key==='plan'||key==='agent'?<select value={form[key]} onChange={e=>{
        const value=e.target.value;
        const plan=masters.find(m=>m.kind==='plan'&&m.name===value);
        setForm({...form,[key]:value,...(key==='plan'&&plan?{monthly_rent:String(plan.amount)}:{})});
      }}><option value="">None</option>{masters.filter(m=>m.kind===key).map(m=><option key={m.name}>{m.name}</option>)}</select>:
      key==='status'?<select value={form.status} onChange={e=>change(key,e.target.value)}>
        {[...new Set(['Active','Inactive',form.status])].map(v=><option key={v}>{v}</option>)}</select>:
      <input required={key==='customer_code'||key==='name'} value={form[key]} readOnly={editing&&key==='balance'}
        type={key==='monthly_rent'||key==='balance'?'number':'text'} step="0.01" min={key==='monthly_rent'?0:undefined}
        onChange={e=>change(key,e.target.value)}/>}</label>)}
    <label>CIN<input value={form.cin} onChange={e=>change('cin',e.target.value)}/></label></div>
    <details ref={pickerRef} className="account-channels" onToggle={event=>{
      if (!event.currentTarget.open) setChannelSearch('');
    }} onKeyDown={event=>{
      if (event.key === 'Escape' && event.currentTarget.open) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }
    }}>
      <summary>Add-on channels <span>{form.channels.length ? form.channels.join(', ') : 'Select channels'}</span></summary>
      {channels.length ? <div className="channel-picker">
        <input type="search" aria-label="Search add-on channels" placeholder="Search channels" value={channelSearch}
          onChange={event=>setChannelSearch(event.target.value)}
          onKeyDown={event=>{if(event.key==='Enter')event.preventDefault()}} />
        <div className="channel-options">
          {matchingChannels.map(channel=><label key={channel.name}>
            <input type="checkbox" checked={form.channels.includes(channel.name)} onChange={event=>{
              const selected = event.target.checked ? [...form.channels, channel.name] : form.channels.filter(name=>name!==channel.name);
              setForm({...form,channels:selected});
            }}/>
            <span>{channel.name}</span><small>{currency.format(channel.amount)}</small>
          </label>)}
          {!matchingChannels.length && <p>No matching channels.</p>}
        </div>
      </div> : <p>Create channels in Masters to assign them here.</p>}
    </details>
    <p aria-live="polite"><strong>Monthly rent {currency.format(monthlyRent(form.monthly_rent, channelFee))}</strong>
      {' · '}{currency.format(Number(form.monthly_rent))} base + {currency.format(channelFee)} add-ons</p>
    <div className="actions"><button className="button">Save customer</button><button type="button" className="button secondary" onClick={onClose}>Cancel</button></div>
    </fieldset></form>;
}
export default function CustomerAccounts({masterPage,ready}:{masterPage:boolean;ready:boolean}){
  const [category,setCategory]=useState<Master['kind'] | null>(null);
  const [shown, setShown] = useState<ColumnKey[]>(savedColumns);
  function showColumns(keys: ColumnKey[]) {
    setShown(keys);
    try { window.localStorage.setItem(preferenceKey, JSON.stringify(keys)); }
    catch { /* The selection still applies for this visit. */ }
  }
  const cache=useQueryClient();
  const query=useQuery<Directory>({queryKey:['customer-accounts'],queryFn:()=>request(),enabled:!masterPage || category !== null,retry:false});
  const [editor,setEditor]=useState<{id?:string;form:Form}|null>(null);
  const [search,setSearch]=useState('');
  const [filters,setFilters]=useState<Filters>({});
  const [draft,setDraft]=useState<Filters|null>(null);
  const [page,setPage]=useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [descending, setDescending] = useState(false);
  const [selected,setSelected]=useState<string[]>([]);
  const [compose,setCompose]=useState(false);
  const [busy,setBusy]=useState(false);
  
  const [error,setError]=useState('');
  async function save(payload:unknown,done?:()=>void){
    setBusy(true);setError('');
    try{const result=await request(payload);done?.();toast.success(result.message);await cache.invalidateQueries();}
    catch(e){setError(e instanceof Error?e.message:'Unable to save.');}
    finally{setBusy(false);}
  }
  function addMaster(e:FormEvent<HTMLFormElement>, kind:Master['kind']){
    e.preventDefault();const form=e.currentTarget;
    const values=new FormData(form);
    void save({action:'master',kind,name:values.get('name'),amount:Number(values.get('amount')||0)},()=>form.reset());
  }
  function openCategory(next:Master['kind'] | null){
    setCategory(next);
    
    setError('');
  }
  if(masterPage && category === null)return <nav aria-label="Master categories" className="master-options">
    {masterSections.map(section => <button key={section.kind} type="button" className="master-option"
      onClick={() => openCategory(section.kind)}>{section.title}<span aria-hidden="true"> &rarr;</span></button>)}
  </nav>;
  const back = masterPage && <button className="button secondary master-back" disabled={busy} onClick={()=>openCategory(null)}>&larr; Back to Masters</button>;
  if(query.isPending)return <p role="status">Loading customer accounts…</p>;
  if(!query.data)return <>{back}<p className="feedback error" role="alert">{query.error?.message} <button onClick={()=>query.refetch()}>Retry</button></p></>;
  const {accounts,masters}=query.data;
  const terms = filterColumns.filter(([key]) => filters[key]?.trim());
  const filtered=accounts.filter(row => {
    const searchText = search.trim().toLowerCase();
    if (searchText && ![row.customer_code,row.name,row.cin,row.phone,row.area,row.profile.agent].some(v=>v?.toLowerCase().includes(searchText))) return false;
    if (!terms.length) return true;
    const values = accountForm(row);
    return terms.every(([key]) => {
      const term = filters[key]!.trim().toLowerCase();
      if (key === 'select') return selected.includes(row.id) === (term === 'selected');
      if (key === 'actions') return true;
      if (key === 'monthly_total' || key === 'monthly_rent') return monthlyRent(row.monthly_rent, row.channel_fee) === Number(term);
      if (key === 'channels') return values.channels.some(name=>name.toLowerCase().includes(term));
      if (isAmount(key)) return Number(values[key]) === Number(term);
      if (key === 'status') return values.status.toLowerCase() === term;
      return values[key].toLowerCase().includes(term);
    });
  });
  filtered.sort((a, b) => descending
    ? idOrder.compare(b.customer_code, a.customer_code)
    : idOrder.compare(a.customer_code, b.customer_code));
  const last=Math.max(0,Math.ceil(filtered.length/pageSize)-1);
  const current=Math.min(page,last);
  const visible=filtered.slice(current * pageSize, (current + 1) * pageSize);
  const eligible=(r:Account)=>r.is_active&&!r.opted_out&&!!r.phone;
  const chosen=accounts.filter(r=>selected.includes(r.id)&&eligible(r));
  const matchingIds = new Set(filtered.map(row => row.id));
  const feedback=<>{error&&<p role="alert" className="feedback error">{error}</p>}</>;
  if (masterPage) {

    return <>{back}{feedback}{masterSections.filter(section => section.kind === category).map(({kind, title, field}) => {
      const items = masters.filter(item => item.kind === kind);
      const priced = kind !== 'agent';
      return <section className="card" key={kind} aria-labelledby={'master-' + kind}>
        <h2 id={'master-' + kind}>{title}</h2>
        <form onSubmit={event => addMaster(event, kind)}>
          <div className="mapping-grid">
            <label>{field}<input name="name" maxLength={200} required /></label>
            {priced && <label>Monthly amount (INR)<input name="amount" type="number" min="0" step="0.01" required /></label>}
          </div>
          <button className="button" disabled={busy}>Add {kind}</button>
        </form>
        {items.length ? <div className="table-wrap"><table aria-label={title}>
          <thead><tr><th>{field}</th>{priced && <th>Monthly amount</th>}</tr></thead>
          <tbody>{items.map(item => <tr key={item.name}>
            <td>{item.name}</td>{priced && <td>{currency.format(item.amount)}</td>}
          </tr>)}</tbody>
        </table></div> : <p>No {title.toLowerCase()} yet.</p>}
      </section>;
    })}</>;
  }
  return <>{!editor && feedback}{editor&&<Popup title={editor.id?'Edit customer':'Add customer'} busy={busy} onClose={()=>setEditor(null)}>
    {feedback}<Profile form={editor.form} editing={!!editor.id} masters={masters} busy={busy}
    setForm={form=>setEditor({...editor,form})} onClose={()=>setEditor(null)}
    onSave={()=>save({action:'save',...editor},()=>setEditor(null))}/></Popup>}
    {draft && <Popup title="Filter customers" onClose={()=>setDraft(null)}>
      <form className="card" onSubmit={e=>{e.preventDefault();setFilters(draft);setPage(0);setDraft(null)}}>
        <h2>Filter customers</h2>
        <div className="mapping-grid">{filterColumns.map(([key,label])=>{
          const change=(value:string)=>setDraft({...draft,[key]:value});
          const options=key==='select'?['Selected','Unselected']:key==='status'?
            Array.from(new Set(accounts.map(row=>row.profile.status || (row.is_active?'Active':'Inactive')))).sort():null;
          return <label key={key}>{label}{options?
            <select value={draft[key]??''} onChange={e=>change(e.target.value)}>
              <option value="">Any</option>{options.map(value=><option key={value}>{value}</option>)}
            </select>:
            <input type={isAmount(key)?'number':'text'} step={isAmount(key)?'0.01':undefined}
              placeholder={isAmount(key)?'Exact amount':'Contains…'} value={draft[key]??''} onChange={e=>change(e.target.value)}/>}</label>;
        })}</div>
        <div className="actions"><button className="button">Apply filters</button>
          <button type="button" className="button secondary" onClick={()=>setDraft({})}>Clear fields</button>
          <button type="button" className="button secondary" onClick={()=>setDraft(null)}>Cancel</button></div>
      </form></Popup>}
    <section className="card"><div className="section-heading"><h2>Customer directory</h2><div className="actions">
      <button className="button secondary" onClick={()=>setDraft({...filters})}>Filters{terms.length>0 && ' ('+terms.length+')'}</button>
      {terms.length>0 && <button className="text-button" onClick={()=>{setFilters({});setPage(0)}}>Clear filters</button>}
      <button className="button secondary" disabled={busy} onClick={()=>{setError('');setEditor({form:blankForm()})}}>Add customer</button>
      <label className="button file-button">Import customer Excel<input type="file" accept=".xlsx" disabled={busy} onChange={e=>{
        const file=e.target.files?.[0];e.target.value='';if(!file)return;
        if(!window.confirm('Import new customer IDs from '+file.name+' with their opening balances?'))return;
        const data=new FormData();data.set('file',file);void save(data);
      }}/></label></div></div>
      <details className="directory-columns">
        <summary>Choose columns</summary>
        <fieldset><legend>Columns to display</legend>
          {optionalColumns.map(([key, label]) => <label key={key}>
            <input type="checkbox" checked={shown.includes(key)} disabled={shown.length === 1 && shown[0] === key}
              onChange={event => showColumns(event.target.checked ? [...shown, key] : shown.filter(value => value !== key))} />
            {label}
          </label>)}
        </fieldset>
        <button type="button" className="button secondary compact" onClick={() => showColumns(columnKeys)}>Show all columns</button>
      </details>
      <div className="filter-bar"><input aria-label="Search all customers" placeholder="Search ID, name, CIN, area, agent or phone" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}/>

      <button className="button secondary" onClick={()=>{setSelected([...new Set([...selected,...filtered.filter(eligible).map(r=>r.id)])]);setCompose(false)}}>Select all matching</button>
      <button className="button secondary" disabled={!selected.some(id=>matchingIds.has(id))} onClick={()=>{
        setSelected(ids=>ids.filter(id=>!matchingIds.has(id)));
        setCompose(false);
      }}>Deselect all matching</button>
      <button className="button secondary" disabled={!selected.length} onClick={()=>{setSelected([]);setCompose(false)}}>Deselect everyone</button></div>
      <div className="table-wrap"><table className="directory-table"><thead><tr>
        <th scope="col">Select</th>
        {optionalColumns.filter(([key]) => shown.includes(key)).map(([key,label]) =>
          key === 'customer_code' ? <th key={key} scope="col" aria-sort={descending ? 'descending' : 'ascending'}>
            <button type="button" className="directory-sort" aria-label={'Sort by Customer ID ' + (descending ? 'ascending' : 'descending')}
              onClick={()=>{setDescending(value => !value);setPage(0)}}>
              {label}<span aria-hidden="true">{descending ? '\u2193' : '\u2191'}</span>
            </button>
          </th> : <th key={key} scope="col">{label}</th>)}
        <th scope="col" className="directory-actions-cell">Actions</th></tr></thead><tbody>
      {visible.map(row=>{const f=accountForm(row);return <tr key={row.id}><td><input type="checkbox" aria-label={'Select '+row.customer_code} disabled={!eligible(row)} checked={selected.includes(row.id)} onChange={e=>{
        setCompose(false);setSelected(e.target.checked?[...selected,row.id]:selected.filter(id=>id!==row.id));
      }}/></td>
        {columns.filter(([key]) => shown.includes(key)).map(([key])=><td key={key}>{key==='monthly_rent'?currency.format(monthlyRent(row.monthly_rent,row.channel_fee)):key==='balance'?currency.format(Number(f[key])):f[key]||'—'}</td>)}{shown.includes('cin') && <td>{f.cin||'—'}</td>}{shown.includes('channels') && <td>{f.channels.join(', ')||'—'}</td>}{shown.includes('monthly_total') && <td>{currency.format(monthlyRent(row.monthly_rent,row.channel_fee))}</td>}
        <td className="directory-actions-cell"><div className="directory-row-actions">
        <button type="button" title="Edit customer" aria-label={'Edit customer '+row.customer_code} disabled={busy} onClick={()=>{setError('');setEditor({id:row.id,form:f})}}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16l-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4"/></svg></button>
        <button type="button" title="Mark as paid" aria-label={'Mark as paid '+row.customer_code} disabled={busy||row.balance<=0} onClick={()=>{if(confirm('Record '+currency.format(row.balance)+' as paid for '+row.name+'?'))void save({action:'paid',id:row.id,balance:Number(row.balance)})}}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l6 6L21 6"/></svg></button>
        <button type="button" title="Delete customer" aria-label={'Delete customer '+row.customer_code} disabled={busy} onClick={()=>{if(confirm('Delete '+row.name+' ('+row.customer_code+') and their bills?'))void save({action:'delete',id:row.id},()=>setEditor(null))}}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg></button></div></td></tr>})}</tbody></table></div>
      {!visible.length&&<p>No matching customers.</p>}
      <div className="table-footer"><button className="button" disabled={!chosen.length} onClick={()=>{setCompose(true);requestAnimationFrame(()=>document.getElementById('account-compose')?.scrollIntoView())}}>Write WhatsApp message ({chosen.length})</button>
      <div className="actions">
        <label>Rows per page <select value={pageSize} onChange={event => {
          setPageSize(Number(event.target.value));
          setPage(0);
        }}>
          {[50, 100, 500, 1000].map(size => <option key={size} value={size}>{size}</option>)}
        </select></label>
        <button disabled={!current} onClick={()=>setPage(current-1)}>Previous</button>
        Page {current+1} of {last+1}
        <button disabled={current>=last} onClick={()=>setPage(current+1)}>Next</button>
      </div></div>
    </section>{compose&&chosen.length>0&&<div id="account-compose"><ImportRecipients key={chosen.map(r=>r.id).join(',')} rows={chosen} directory unpaid={false} ready={ready}/></div>}</>;
}

