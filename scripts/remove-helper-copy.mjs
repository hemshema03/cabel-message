import fs from 'node:fs';
import ts from 'typescript';
const files=['components/workspace.tsx','components/login-form.tsx','components/area-messaging.tsx','components/import-recipients.tsx','components/message-attachment.tsx'];
for(const file of files){
 let source=fs.readFileSync(file,'utf8');const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const edits=[];
 function visit(node){
  if(ts.isJsxElement(node)){
   const tag=node.openingElement.tagName.getText(tree);const attrs=node.openingElement.attributes.getText(tree);const text=node.getText(tree);
   const parent=ts.isJsxElement(node.parent)?node.parent.openingElement.attributes.getText(tree):'';
   let remove=/className="(sidebar-help|guidance|page-footer)"/.test(attrs);
   if(tag==='p'){
    const keep=/role="(alert|status)"|className="feedback/.test(attrs)||/className="message-preview"/.test(parent)||text.includes('{queueSummary}')||text.includes('{recipients.length} selected recipients')||text.includes('{upload.file_name}')||text.includes('{error||query.error?.message}')||text.includes('Session:')||/Loading recipients|No recipients were added|No areas found/.test(text);
    remove=!keep;
   }
   if(tag==='small'&&(text.includes('{caption}')||text.includes('Paid bills are hidden')))remove=true;
   if(tag==='span'&&(/className="pill"/.test(attrs)||text.includes('Three simple steps')||text.includes('Made for your everyday')||text.includes('Existing customers are updated')))remove=true;
   if(remove){edits.push({start:node.getStart(tree),end:node.end});return;}
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+'<></>'+source.slice(edit.end);
 if(file.endsWith('workspace.tsx')){source=source.replace('([title,value,caption],i)','([title,value],i)').replace('([n,title,text,href,cta])','([n,title,,href,cta])').replace('function Empty({title,text}:','function Empty({title}:');}
 fs.writeFileSync(file,source);console.log(file+': removed '+edits.length+' helper elements');
}
