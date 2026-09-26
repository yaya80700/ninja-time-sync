export const maxDuration = 300;
import {runSync} from "../../../lib/sync";
export const dynamic="force-dynamic"; export const maxDuration=800;
function auth(r){const s=process.env.CRON_SECRET;return !!s&&(r.headers.get("authorization")===`Bearer ${s}`||r.headers.get("x-cron-secret")===s)}
export async function GET(r){if(!auth(r))return Response.json({ok:false,error:"Non autorisé"},{status:401});try{return Response.json({ok:true,...await runSync()})}catch(e){console.error(e);return Response.json({ok:false,error:e.message},{status:500})}}
export async function POST(r){return GET(r)}
