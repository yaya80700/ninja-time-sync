import crypto from "crypto";
import {supabaseAdmin} from "./supabase";
import {trello} from "./trello";
import {translateListName,translateText} from "./translate";

const env=(k,d="")=>process.env[k]||d;
const hash=v=>crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const sourceMarker=id=>`<!-- ninja-time-source:${id} -->`;
const hasMarker=(desc,id)=>String(desc||"").includes(sourceMarker(id));
const normalize=v=>String(v||"").trim().replace(/\s+/g," ").toLowerCase();

async function destinationBoard(s){
  if(env("DEST_BOARD_ID")) return env("DEST_BOARD_ID");
  const {data}=await s.from("sync_config").select("value").eq("key","destination_board_id").maybeSingle();
  if(data?.value) return data.value;
  const b=await trello.post("/boards",{name:env("DEST_BOARD_NAME","Ninja Time — Français"),defaultLists:"false"});
  await s.from("sync_config").upsert({key:"destination_board_id",value:b.id,updated_at:new Date().toISOString()});
  return b.id;
}

async function translateCached(s,text,stats){
  if(!text)return{text:"",created:false};
  const h=hash(text);
  const {data}=await s.from("translation_cache").select("translated_text").eq("source_hash",h).maybeSingle();
  if(data?.translated_text)return{text:data.translated_text,created:false};
  const x=await translateText(text,null);
  if(x.translated){
    await s.from("translation_cache").upsert({source_hash:h,source_text:text,translated_text:x.text,updated_at:new Date().toISOString()});
    stats.translationsCreated++;
  }
  return{text:x.text,created:x.translated};
}

async function ensureList(s,l,dests,bid){
  const {data:m}=await s.from("list_map").select("destination_list_id").eq("source_list_id",l.id).maybeSingle();
  if(m?.destination_list_id)return m.destination_list_id;
  const name=translateListName(l.name);
  let d=dests.find(x=>!x.closed&&x.name===name);
  if(!d)d=await trello.post("/lists",{name,idBoard:bid,pos:l.pos||"bottom"});
  await s.from("list_map").upsert({source_list_id:l.id,destination_list_id:d.id,source_name:l.name,destination_name:name,updated_at:new Date().toISOString()});
  return d.id;
}

async function ensureLabel(s,l,bid){
  const {data:m}=await s.from("label_map").select("destination_label_id").eq("source_label_id",l.id).maybeSingle();
  if(m?.destination_label_id)return m.destination_label_id;
  const d=await trello.post(`/boards/${bid}/labels`,{name:l.name||"",color:l.color||"null"});
  await s.from("label_map").upsert({source_label_id:l.id,destination_label_id:d.id,source_name:l.name||"",color:l.color||"",updated_at:new Date().toISOString()});
  return d.id;
}

async function attachments(s,src,dst,stats){
  const a=await trello.get(`/cards/${src}/attachments`,{fields:"all",limit:1000});
  for(const x of a){
    const {data:m}=await s.from("attachment_map").select("source_attachment_id").eq("source_attachment_id",x.id).maybeSingle();
    if(m||!x.url)continue;
    try{
      const d=await trello.post(`/cards/${dst}/attachments`,{url:x.url,name:x.name||"Pièce jointe"});
      await s.from("attachment_map").insert({source_attachment_id:x.id,destination_attachment_id:d.id,source_card_id:src,destination_card_id:dst,name:x.name||"",url:x.url,updated_at:new Date().toISOString()});
      stats.attachmentsCreated++;
    }catch(e){console.error("Attachment:",e.message)}
    await sleep(80);
  }
}

async function checklists(s,src,dst,stats){
  const cs=await trello.get(`/cards/${src}/checklists`,{checkItems:"all",checkItem_fields:"all",fields:"all"});
  for(const c of cs){
    const {data:m}=await s.from("checklist_map").select("destination_checklist_id").eq("source_checklist_id",c.id).maybeSingle();
    let did=m?.destination_checklist_id;
    if(!did){
      const d=await trello.post(`/cards/${dst}/checklists`,{name:c.name,pos:c.pos||"bottom"});
      did=d.id;
      await s.from("checklist_map").upsert({source_checklist_id:c.id,destination_checklist_id:did,source_card_id:src,destination_card_id:dst,updated_at:new Date().toISOString()});
    }
    for(const i of c.checkItems||[]){
      const {data:im}=await s.from("checkitem_map").select("destination_checkitem_id").eq("source_checkitem_id",i.id).maybeSingle();
      if(!im){
        const d=await trello.post(`/checklists/${did}/checkItems`,{name:i.name,pos:i.pos||"bottom"});
        await s.from("checkitem_map").insert({source_checkitem_id:i.id,destination_checkitem_id:d.id,source_checklist_id:c.id,destination_checklist_id:did,state:i.state||"incomplete",updated_at:new Date().toISOString()});
      }else{
        await trello.put(`/checklists/${did}/checkItems/${im.destination_checkitem_id}`,{name:i.name,state:i.state||"incomplete"});
      }
    }
    stats.checklists++;
  }
}

function findExistingCard(c,translatedName,listCards){
  const marker=sourceMarker(c.id);
  const marked=listCards.find(x=>!x.closed&&hasMarker(x.desc,c.id));
  if(marked)return marked;

  const wanted=normalize(translatedName);
  if(!wanted)return null;

  const sameName=listCards.filter(x=>!x.closed&&normalize(x.name)===wanted);
  if(sameName.length===1)return sameName[0];
  if(sameName.length>1){
    const sourceDesc=normalize(c.desc);
    const exactDesc=sameName.find(x=>sourceDesc&&normalize(x.desc).includes(sourceDesc));
    if(exactDesc)return exactDesc;
    return sameName[0];
  }
  return null;
}

async function card(s,c,listId,labels,bid,stats,listCards){
  const n=await translateCached(s,c.name||"",stats),d=await translateCached(s,c.desc||"",stats);
  const sig=hash({name:c.name,desc:c.desc,due:c.due,start:c.start,dueComplete:c.dueComplete,pos:c.pos,idLabels:c.idLabels});
  const {data:m}=await s.from("card_map").select("*").eq("source_card_id",c.id).maybeSingle();

  let did=m?.destination_card_id;
  let existing=null;

  if(did){
    existing=listCards.find(x=>x.id===did)||null;
    if(!existing){
      try{existing=await trello.get(`/cards/${did}`,{fields:"id,name,desc,idList,closed"});}catch{existing=null;}
    }
  }

  // Sécurité anti-doublon : si card_map est absent, on cherche d'abord une carte existante.
  if(!did || !existing){
    existing=findExistingCard(c,n.text,listCards);
    if(existing)did=existing.id;
  }

  const marker=sourceMarker(c.id);
  const destinationDesc=d.text ? `${d.text}\n\n${marker}` : marker;
  const body={name:n.text,desc:destinationDesc,pos:c.pos||"bottom"};
  if(c.due){body.due=c.due;body.dueComplete=!!c.dueComplete}
  if(c.start)body.start=c.start;

  if(!did){
    const x=await trello.post("/cards",{...body,idList:listId});
    did=x.id;
    listCards.push({...x,idList:listId,closed:false});
    await s.from("card_map").upsert({source_card_id:c.id,destination_card_id:did,source_list_id:c.idList,destination_list_id:listId,source_hash:sig,updated_at:new Date().toISOString()});
    stats.cardsCreated++;
  }else if(!m){
    // Carte déjà présente dans Trello mais absente de la table de correspondance.
    await trello.put(`/cards/${did}`,{...body,idList:listId});
    await s.from("card_map").upsert({source_card_id:c.id,destination_card_id:did,source_list_id:c.idList,destination_list_id:listId,source_hash:sig,updated_at:new Date().toISOString()});
    stats.cardsUpdated++;
  }else if(m.source_hash!==sig||m.destination_list_id!==listId||!hasMarker(existing?.desc,c.id)){
    await trello.put(`/cards/${did}`,{...body,idList:listId});
    await s.from("card_map").update({source_hash:sig,destination_list_id:listId,updated_at:new Date().toISOString()}).eq("source_card_id",c.id);
    stats.cardsUpdated++;
  }

  const ids=[];
  for(const lid of c.idLabels||[])if(labels[lid])ids.push(await ensureLabel(s,labels[lid],bid));
  if(ids.length)await trello.put(`/cards/${did}`,{idLabels:ids});

  await checklists(s,c.id,did,stats);
  await attachments(s,c.id,did,stats);
  stats.cardsProcessed++;
}

export async function runSync(){
  const s=supabaseAdmin(),started=new Date().toISOString();
  const {data:r,error}=await s.from("sync_runs").insert({status:"running",started_at:started}).select().single();
  if(error)throw error;

  const stats={cardsProcessed:0,cardsCreated:0,cardsUpdated:0,attachmentsCreated:0,translationsCreated:0,checklists:0};

  try{
    const sb=env("SOURCE_BOARD_ID","wvkggmxv"),db=await destinationBoard(s);
    const srcLists=await trello.get(`/boards/${sb}/lists`,{fields:"id,name,closed,pos"});
    const dstLists=await trello.get(`/boards/${db}/lists`,{fields:"id,name,closed,pos"});
    const labs=await trello.get(`/boards/${sb}/labels`,{limit:1000,fields:"all"});
    const labels=Object.fromEntries(labs.map(x=>[x.id,x]));
    const max=Number(env("MAX_CARDS_PER_RUN","300"));
    let count=0;

    outer:for(const l of srcLists){
      if(l.closed)continue;
      const dl=await ensureList(s,l,dstLists,db);
      const cards=await trello.get(`/lists/${l.id}/cards`,{fields:"id,name,desc,closed,pos,due,start,dueComplete,idLabels",limit:1000});
      const listCards=await trello.get(`/lists/${dl}/cards`,{fields:"id,name,desc,closed,pos,due,start,dueComplete,idLabels",limit:1000});

      for(const c of cards){
        if(c.closed)continue;
        if(count>=max)break outer;
        await card(s,{...c,idList:l.id},dl,labels,db,stats,listCards);
        count++;
      }
    }

    await s.from("sync_runs").update({status:"success",finished_at:new Date().toISOString(),cards_processed:stats.cardsProcessed,cards_created:stats.cardsCreated,cards_updated:stats.cardsUpdated,attachments_created:stats.attachmentsCreated,translations_created:stats.translationsCreated,error:null}).eq("id",r.id);
    return{destinationBoardId:db,limitedTo:max,...stats};
  }catch(e){
    await s.from("sync_runs").update({status:"error",finished_at:new Date().toISOString(),cards_processed:stats.cardsProcessed,cards_created:stats.cardsCreated,cards_updated:stats.cardsUpdated,attachments_created:stats.attachmentsCreated,translations_created:stats.translationsCreated,error:e.message}).eq("id",r.id);
    throw e;
  }
}
