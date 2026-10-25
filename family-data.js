const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const crypto = require('node:crypto');

const DB_URL = 'https://family-gift-list-75dbd-default-rtdb.asia-southeast1.firebasedatabase.app';
const CHILDREN = ['Matthew', 'Abby', 'George'];
const DEFAULT_GIFTS = [
  {id:'m1',child:'Matthew',name:'Building Adventure',description:'A fun building set for creating something amazing.',price:'$30',emoji:'🧩',image:'',link:''},
  {id:'m2',child:'Matthew',name:'Games Night',description:'A new game for plenty of family fun.',price:'$25',emoji:'🎲',image:'',link:''},
  {id:'m3',child:'Matthew',name:'Outdoor Explorer',description:'Something exciting for outdoor adventures.',price:'$35',emoji:'⚽',image:'',link:''},
  {id:'a1',child:'Abby',name:'Creative Craft Kit',description:'Beautiful supplies for making something special.',price:'$25',emoji:'🎨',image:'',link:''},
  {id:'a2',child:'Abby',name:'Cosy Reading Set',description:'A lovely book and a little reading-time treat.',price:'$30',emoji:'📚',image:'',link:''},
  {id:'a3',child:'Abby',name:'Pretty Accessories',description:'A thoughtful little gift to brighten her day.',price:'$20',emoji:'🎀',image:'',link:''},
  {id:'g1',child:'George',name:'Space Explorer',description:'A gift for a curious little space enthusiast.',price:'$30',emoji:'🚀',image:'',link:''},
  {id:'g2',child:'George',name:'Dinosaur Discovery',description:'A prehistoric surprise for hours of fun.',price:'$25',emoji:'🦕',image:'',link:''},
  {id:'g3',child:'George',name:'Little Builder',description:'A hands-on gift for making and creating.',price:'$35',emoji:'🏗️',image:'',link:''}
];

function db() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT || !process.env.FAMILY_PASSWORD || !process.env.FAMILY_SESSION_SECRET) throw new Error('Missing server configuration');
  if (!getApps().length) {
    let serviceAccount;
    try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); }
    catch { throw new Error('FIREBASE_SERVICE_ACCOUNT must be valid JSON'); }
    initializeApp({ credential: cert(serviceAccount), databaseURL: DB_URL });
  }
  return getDatabase();
}
function signature(payload) {
  return crypto.createHmac('sha256', process.env.FAMILY_SESSION_SECRET).update(payload).digest('base64url');
}
function makeToken() {
  const payload = Buffer.from(JSON.stringify({exp: Date.now() + 8 * 60 * 60 * 1000})).toString('base64url');
  return payload + '.' + signature(payload);
}
function isAdmin(event) {
  const auth = event.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const expected = signature(parts[0]);
  const a = Buffer.from(parts[1]); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try { return JSON.parse(Buffer.from(parts[0], 'base64url').toString()).exp > Date.now(); }
  catch { return false; }
}
function response(statusCode, body) {
  return { statusCode, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}, body: JSON.stringify(body) };
}
function cleanText(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
async function currentData() {
  const ref = db().ref('familyGiftList');
  let snap = await ref.get();
  if (!snap.exists()) {
    await ref.set({gifts: DEFAULT_GIFTS, reservations: {}});
    snap = await ref.get();
  }
  const val = snap.val() || {};
  return {gifts: Array.isArray(val.gifts) ? val.gifts : DEFAULT_GIFTS, reservations: val.reservations && typeof val.reservations === 'object' ? val.reservations : {}};
}
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode:204, headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'GET,POST'},body:''};
  if (!['GET','POST'].includes(event.httpMethod)) return response(405,{error:'Method not allowed'});
  try {
    if (event.httpMethod === 'GET') {
      const data = await currentData();
      if (isAdmin(event)) return response(200, data);
      const reserved = {};
      Object.keys(data.reservations).forEach(id => { if (data.reservations[id]) reserved[id] = true; });
      return response(200,{gifts:data.gifts,reservations:reserved});
    }
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return response(400,{error:'Invalid request'}); }
    if (body.action === 'login') {
      const provided = Buffer.from(cleanText(body.password, 200));
      const actual = Buffer.from(process.env.FAMILY_PASSWORD || '');
      if (provided.length !== actual.length || !crypto.timingSafeEqual(provided, actual)) return response(401,{error:'That password is not correct.'});
      return response(200,{token:makeToken()});
    }
    if (body.action === 'reserve') {
      const id = cleanText(body.id, 100), name = cleanText(body.name, 80);
      if (!id || !name) return response(400,{error:'Please provide your name.'});
      const data = await currentData();
      const gift = data.gifts.find(g => g.id === id);
      if (!gift) return response(404,{error:'Gift not found.'});
      const ref = db().ref('familyGiftList/reservations/' + id);
      const result = await ref.transaction(existing => existing ? undefined : {name,child:gift.child,gift:gift.name});
      if (!result.committed) return response(409,{error:'Someone has already reserved this gift. Please refresh the page.'});
      return response(200,{ok:true});
    }
    if (!isAdmin(event)) return response(401,{error:'Please unlock Website Control again.'});
    if (body.action === 'save') {
      if (!Array.isArray(body.gifts) || !body.reservations || typeof body.reservations !== 'object') return response(400,{error:'Invalid gift list.'});
      if (body.gifts.length > 500) return response(400,{error:'Too many gifts.'});
      const gifts = body.gifts.map(g => ({
        id:cleanText(g.id,100), child:CHILDREN.includes(g.child) ? g.child : 'Matthew',
        name:cleanText(g.name,150), description:cleanText(g.description,1000), price:cleanText(g.price,50),
        emoji:cleanText(g.emoji,20) || '🎁', image:cleanText(g.image,1000), link:cleanText(g.link,1000)
      })).filter(g => g.id && g.name);
      const reservations = {};
      for (const [id,r] of Object.entries(body.reservations)) {
        if (gifts.some(g => g.id === id) && r && typeof r === 'object') reservations[id] = {name:cleanText(r.name,80),child:cleanText(r.child,30),gift:cleanText(r.gift,150)};
      }
      await db().ref('familyGiftList').set({gifts,reservations});
      return response(200,{ok:true});
    }
    return response(400,{error:'Unknown action.'});
  } catch (err) {
    console.error('family-data function error:', err && err.message);
    return response(500,{error:'The family gift list could not connect. Please try again later.'});
  }
};
