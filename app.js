/* Pocket Food Tracker — local-first PWA */
const $ = id => document.getElementById(id);
const DB_NAME = "PocketFoodTrackerDB", DB_VERSION = 1;
let db, currentPhoto = null, currentProduct = null, scanner = null, savedCamera = false;
const NUTRIENTS = [
  ["kcal","Energy","kcal"],["protein","Protein","g"],["carbs","Carbs","g"],["fat","Fat","g"],
  ["fibre","Fibre","g"],["sugars","Sugars","g"],["sodium","Sodium","mg"],["salt","Salt","g"],
  ["calcium","Calcium","mg"],["iron","Iron","mg"],["potassium","Potassium","mg"],
  ["vitaminC","Vitamin C","mg"],["vitaminA","Vitamin A","µg"],["vitaminD","Vitamin D","µg"],["vitaminB12","Vitamin B12","µg"]
];
const MACROS = ["kcal","protein","carbs","fat","fibre"];
const MICRO = ["sugars","sodium","salt","calcium","iron","potassium","vitaminC","vitaminA","vitaminD","vitaminB12"];
const FIELD_IDS = Object.fromEntries(NUTRIENTS.map(([key])=>[key,key]));
const SOUTH_AFRICAN = [
  {name:"Maize meal, cooked (pap) — estimate",nutrients:{kcal:75,protein:1.7,carbs:16.5,fat:0.3,fibre:1.2},source:"Generic estimate; varies with recipe and thickness."},
  {name:"Samp and beans, cooked — estimate",nutrients:{kcal:120,protein:5.5,carbs:22,fat:1.1,fibre:4.5},source:"Generic estimate; varies by ratio and recipe."},
  {name:"Boerewors, cooked — estimate",nutrients:{kcal:300,protein:17,carbs:2,fat:25},source:"Generic estimate; brand and fat content vary."},
  {name:"Chakalaka — estimate",nutrients:{kcal:65,protein:1.5,carbs:10,fat:2,fibre:3},source:"Generic estimate; recipes vary."},
  {name:"Cooked amadumbe — estimate",nutrients:{kcal:120,protein:1.5,carbs:28,fat:0.2,fibre:4},source:"Generic estimate; variety and preparation vary."},
  {name:"Cooked beans, plain — estimate",nutrients:{kcal:127,protein:8.7,carbs:22.8,fat:0.5,fibre:6.4},source:"Generic estimate; type of bean varies."},
  {name:"Brown bread — generic estimate",nutrients:{kcal:247,protein:9,carbs:41,fat:4,fibre:6},source:"Generic estimate; use the package label for accuracy."},
  {name:"Amasi — generic estimate",nutrients:{kcal:65,protein:3.5,carbs:4.5,fat:3.5},source:"Generic estimate; fat content and brand vary."},
  {name:"Cooked white rice — estimate",nutrients:{kcal:130,protein:2.7,carbs:28.2,fat:0.3,fibre:0.4},source:"Generic estimate; cooked water absorption varies."},
  {name:"Boiled egg — estimate",nutrients:{kcal:155,protein:12.6,carbs:1.1,fat:10.6,fibre:0},source:"Generic estimate per 100 g edible portion."}
];
function openDB(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{const d=req.result;["entries","foods","recipes","settings"].forEach(name=>{if(!d.objectStoreNames.contains(name))d.createObjectStore(name,{keyPath:"id"})})};
  req.onsuccess=()=>{db=req.result;resolve(db)};req.onerror=()=>reject(req.error);
 });
}
function store(name,mode="readonly"){return db.transaction(name,mode).objectStore(name)}
function getAll(name){return new Promise((res,rej)=>{const r=store(name).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function put(name,value){return new Promise((res,rej)=>{const tx=db.transaction(name,"readwrite");tx.objectStore(name).put(value);tx.oncomplete=()=>res(value);tx.onerror=()=>rej(tx.error)})}
function del(name,id){return new Promise((res,rej)=>{const tx=db.transaction(name,"readwrite");tx.objectStore(name).delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
function clearStore(name){return new Promise((res,rej)=>{const tx=db.transaction(name,"readwrite");tx.objectStore(name).clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
const uid=()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
const num=v=>v===""||v==null||!Number.isFinite(Number(v))?null:Number(v);
const fmt=v=>v==null||!Number.isFinite(v)?"—":Number(v).toLocaleString(undefined,{maximumFractionDigits:1});
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove("show"),2800)}
function setStatus(id,msg){$(id).textContent=msg}
function dateEntries(entries,date){return entries.filter(e=>e.date===date)}
function addNullable(a,b){if(a==null&&b==null)return null;if(a==null)return b;if(b==null)return a;return a+b}
function totalNutrition(items){
 const out=Object.fromEntries(NUTRIENTS.map(([k])=>[k,null]));
 for(const item of items) for(const [k] of NUTRIENTS) out[k]=addNullable(out[k],item.nutrients?.[k]??null);
 return out;
}
function scaledNutrients(values,amount,basis){
 const ratio=amount/basis;return Object.fromEntries(NUTRIENTS.map(([k])=>[k,values[k]==null?null:values[k]*ratio]));
}
function nutrientValuesFromForm(){
 const out={};for(const [k] of NUTRIENTS)out[k]=num($(k).value);return out;
}
function formValues(){
 const amount=num($("amount").value), basis=num($("basisAmount").value);
 if(!(amount>0)||!(basis>0))throw new Error("Amount eaten and basis amount must be greater than zero.");
 return {amount,basis,nutrients:scaledNutrients(nutrientValuesFromForm(),amount,basis)};
}
function setDataBadge(kind){
 const el=$("dataStatus");el.className="data-badge "+kind;
 el.textContent=kind==="verified"?"Label checked":kind==="estimated"?"Estimate":"Unverified";
}
function setFormNutrients(nutrients={}){
 for(const [k] of NUTRIENTS)$(k).value=nutrients[k]==null?"":nutrients[k];
}
function resetForm(){
 $("foodForm").reset();$("amount").value=100;$("basisAmount").value=100;$("basisType").value="100g";
 $("foodName").value="";$("sourceNote").value="";$("barcodeInput").value="";$("verifiedCheck").checked=false;
 currentPhoto=null;currentProduct=null;$("productPreview").hidden=true;$("photoPreview").hidden=true;setDataBadge("unknown");
}
function displayProduct(p){
 const image=p.image_front_url||p.image_url||"";
 $("productPreview").hidden=false;
 $("productPreview").innerHTML=`${image?`<img src="${esc(image)}" alt="Product photo" loading="lazy">`:`<div class="thumb placeholder">🥫</div>`}<div><strong>${esc(p.product_name||"Product found")}</strong><div class="muted small">${esc(p.brands||"")} ${p.quantity?"· "+esc(p.quantity):""}</div><div class="muted small">Review the values before saving.</div></div>`;
}
function offNutriments(n){
 const get=(...keys)=>{for(const k of keys){const v=n[k];if(v!==undefined&&v!==null&&v!==""&&Number.isFinite(Number(v)))return Number(v)}return null};
 let kcal=get("energy-kcal_100g","energy-kcal_value");
 if(kcal==null){const kj=get("energy-kj_100g");if(kj!=null)kcal=kj/4.184}
 return {
  kcal,protein:get("proteins_100g"),carbs:get("carbohydrates_100g"),fat:get("fat_100g"),fibre:get("fiber_100g","fibers_100g"),
  sugars:get("sugars_100g"),sodium:get("sodium_100g")!=null?get("sodium_100g")*1000:null,
  salt:get("salt_100g"),calcium:get("calcium_100g")!=null?get("calcium_100g")*1000:null,
  iron:get("iron_100g")!=null?get("iron_100g")*1000:null,potassium:get("potassium_100g")!=null?get("potassium_100g")*1000:null,
  vitaminC:get("vitamin-c_100g")!=null?get("vitamin-c_100g")*1000:null,
  vitaminA:get("vitamin-a_100g")!=null?get("vitamin-a_100g")*1000000:null,
  vitaminD:get("vitamin-d_100g")!=null?get("vitamin-d_100g")*1000000:null,
  vitaminB12:get("vitamin-b12_100g")!=null?get("vitamin-b12_100g")*1000000:null
 };
}
async function lookupBarcode(){
 const code=$("barcodeInput").value.trim();
 if(!/^\d{8,14}$/.test(code)){setStatus("lookupStatus","Enter a barcode with 8–14 digits.");return}
 setStatus("lookupStatus","Looking up product online…");
 try{
  const url=`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=code,product_name,brands,quantity,image_front_url,image_url,nutriments,serving_size`;
  const response=await fetch(url);if(!response.ok)throw new Error("The product database could not be reached.");
  const result=await response.json();if(result.status!==1||!result.product)throw new Error("No product found. You can still enter the label values manually.");
  const p=result.product;currentProduct={...p,barcode:code};displayProduct(p);
  $("foodName").value=[p.product_name,p.brands].filter(Boolean).join(" — ")||"Packaged food";
  $("basisType").value="100g";$("basisAmount").value=100;$("amount").value=100;
  setFormNutrients(offNutriments(p.nutriments||{}));$("sourceNote").value="Open Food Facts lookup — compare with package label";
  $("verifiedCheck").checked=false;setDataBadge("unknown");
  const known=Object.values(offNutriments(p.nutriments||{})).filter(v=>v!=null).length;
  setStatus("lookupStatus",`Product found. ${known} of ${NUTRIENTS.length} tracked nutrients have values. Database entries may be user-submitted; verify the label and fill gaps.`);
  toast("Product found — please verify the label.");
 }catch(err){setStatus("lookupStatus",err.message||"Lookup failed. Try manual entry.");}
}
let scannerLibLoading=null;
async function loadScanner(){
 if(window.Html5Qrcode)return;
 if(!scannerLibLoading)scannerLibLoading=new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";s.onload=resolve;s.onerror=()=>reject(new Error("Scanner library unavailable offline. Type the barcode manually."));document.head.appendChild(s)});
 return scannerLibLoading;
}
async function startCamera(){
 if(!window.isSecureContext){setStatus("lookupStatus","Camera scanning requires HTTPS or localhost. Open the installed app through your HTTPS site, or type the barcode manually.");return}
 try{
  await loadScanner();$("cameraReader").hidden=false;$("cameraBtn").hidden=true;$("stopCameraBtn").hidden=false;
  scanner=new Html5Qrcode("cameraReader");
  await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:260,height:130}},async code=>{
   $("barcodeInput").value=code;await stopCamera();await lookupBarcode();
  },()=>{});
  savedCamera=true;setStatus("lookupStatus","Camera ready — hold the barcode inside the frame.");
 }catch(err){await stopCamera();setStatus("lookupStatus",(err.message||"Could not start camera.")+" Check browser camera permissions or enter the barcode manually.");}
}
async function stopCamera(){
 if(scanner){try{if(savedCamera)await scanner.stop();scanner.clear()}catch{}scanner=null}
 savedCamera=false;$("cameraReader").hidden=true;$("cameraBtn").hidden=false;$("stopCameraBtn").hidden=true;
}
function entryCard(e,showActions=true){
 const kcal=e.nutrients?.kcal, p=e.nutrients?.protein,c=e.nutrients?.carbs,f=e.nutrients?.fat;
 return `<article class="entry">${e.photo?`<img class="thumb" src="${esc(e.photo)}" alt="" loading="lazy">`:`<div class="thumb placeholder">🥗</div>`}<div><div class="entry-title">${esc(e.name)}</div><div class="entry-meta">${esc(e.meal||"Saved food")} · ${fmt(e.amount??e.grams)} ${esc(e.unit||"g")} · ${e.verified?"Label checked":e.estimated?"Estimate":"Unverified"}</div><div class="entry-meta">P ${fmt(p)} g · C ${fmt(c)} g · F ${fmt(f)} g · Fibre ${fmt(e.nutrients?.fibre)} g</div>${e.source?`<div class="entry-meta">${esc(e.source)}</div>`:""}</div><div><div class="entry-nutrition">${fmt(kcal)} kcal</div>${showActions?`<div class="entry-actions"><button class="secondary" data-action="reuse" data-id="${esc(e.id)}">Reuse</button><button class="danger" data-action="delete-entry" data-id="${esc(e.id)}">Delete</button></div>`:""}</div></article>`;
}
async function renderDiary(){
 const entries=await getAll("entries"),foods=await getAll("foods"),date=$("diaryDate").value||today(),day=dateEntries(entries,date);
 const totals=totalNutrition(day);$("totalKcal").textContent=fmt(totals.kcal);
 for(const key of ["protein","carbs","fat","fibre"])$("total"+key[0].toUpperCase()+key.slice(1)).textContent=fmt(totals[key]);
 const goals=(await getAll("settings")).find(s=>s.id==="goals")?.value||{};
 const kcalGoal=num(goals.kcal),percent=kcalGoal>0&&totals.kcal!=null?Math.round(totals.kcal/kcalGoal*100):null;
 $("caloriePercent").textContent=percent==null?"—":`${percent}%`;
 $("calorieRing").style.background=`conic-gradient(var(--green) ${Math.min(percent||0,100)*3.6}deg,#d2e4d6 0deg)`;
 $("calorieGoalText").textContent=kcalGoal>0?`${fmt(totals.kcal)} of ${fmt(kcalGoal)} kcal`:"Set a calorie goal in Goals & data";
 for(const key of ["protein","carbs","fat","fibre"]){
  const g=num(goals[key]),v=totals[key],pct=g>0&&v!=null?Math.min(100,v/g*100):0;
  $(""+key+"Bar").style.width=pct+"%";
  $(key+"GoalText").textContent=g>0?`${fmt(v)} / ${fmt(g)} g`:"Goal not set";
 }
 $("microTotals").innerHTML=MICRO.map(k=>{const meta=NUTRIENTS.find(n=>n[0]===k);return `<div class="micro-item"><span>${meta[1]}</span><strong>${fmt(totals[k])} ${meta[2]}</strong></div>`}).join("");
 $("todayEntries").innerHTML=day.length?day.slice().sort((a,b)=>(a.created||0)-(b.created||0)).map(e=>entryCard(e)).join(""):'<div class="empty">No food logged for this date yet. Tap Add food to get started.</div>';
}
async function saveEntry(ev){
 ev.preventDefault();
 try{
  const {amount,basis,nutrients}=formValues(),name=$("foodName").value.trim();
  if(!name)throw new Error("Please enter a food name.");
  const item={id:uid(),date:$("diaryDate").value||today(),name,meal:$("meal").value,amount,unit:$("basisType").value==="100ml"?"ml":"g",basisType:$("basisType").value,basisAmount:basis,nutrients,barcode:currentProduct?.barcode||$("barcodeInput").value.trim()||null,photo:currentPhoto,source:$("sourceNote").value.trim(),verified:$("verifiedCheck").checked,estimated:false,created:Date.now()};
  await put("entries",item);
  const foods=await getAll("foods");const existing=foods.find(f=>f.name.toLowerCase()===name.toLowerCase()&&f.barcode===item.barcode);
  const savedFood={id:existing?.id||uid(),name,barcode:item.barcode,photo:currentPhoto,nutrients:scaledNutrients(nutrients,basis,amount),basisAmount:100,unit:item.unit,source:item.source,verified:item.verified,estimated:false,updated:Date.now()};
  await put("foods",savedFood);resetForm();await renderAll();showPage("diary");toast("Food saved to your diary.");
 }catch(err){toast(err.message||"Could not save this food.");}
}
async function renderFoods(){
 const foods=await getAll("foods"),recipes=await getAll("recipes");
 const builtins=SOUTH_AFRICAN.map((f,i)=>({...f,id:"za-"+i,estimated:true,unit:"g",photo:null}));
 const foodList=[...builtins,...foods];
 $("savedFoods").innerHTML=foodList.length?foodList.map(f=>`<article class="entry">${f.photo?`<img class="thumb" src="${esc(f.photo)}" alt="">`:`<div class="thumb placeholder">🍲</div>`}<div><div class="entry-title">${esc(f.name)}</div><div class="entry-meta">${f.estimated?"Generic estimate — verify/replace with actual values":f.verified?"Label checked":"User saved"} · per 100 g</div><div class="entry-meta">Energy ${fmt(f.nutrients?.kcal)} kcal · Protein ${fmt(f.nutrients?.protein)} g</div></div><div class="entry-actions"><button class="secondary" data-action="use-food" data-id="${esc(f.id)}">Log</button>${!String(f.id).startsWith("za-")?`<button class="danger" data-action="delete-food" data-id="${esc(f.id)}">Delete</button>`:""}</div></article>`).join(""):'<div class="empty">Your saved foods will appear here.</div>';
 $("savedRecipes").innerHTML=recipes.length?recipes.map(r=>`<article class="entry"><div class="thumb placeholder">🍛</div><div><div class="entry-title">${esc(r.name)}</div><div class="entry-meta">${r.servings} portions · ${r.ingredients.length} ingredients</div><div class="entry-meta">Per portion: ${fmt(r.perServing.kcal)} kcal · P ${fmt(r.perServing.protein)} g</div></div><div class="entry-actions"><button class="secondary" data-action="log-recipe" data-id="${esc(r.id)}">Log portion</button><button class="danger" data-action="delete-recipe" data-id="${esc(r.id)}">Delete</button></div></article>`).join(""):'<div class="empty">Create a recipe using foods you have saved.</div>';
 refreshIngredientOptions(foodList);
}
function refreshIngredientOptions(foods){
 document.querySelectorAll(".ingredient-food").forEach(sel=>{
  const selected=sel.value;
  sel.innerHTML='<option value="">Choose saved food…</option>'+foods.map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("");
  if([...sel.options].some(o=>o.value===selected))sel.value=selected;
 });
}
function addIngredientRow(){
 const row=document.createElement("div");row.className="ingredient-row";
 row.innerHTML='<label class="field">Ingredient<select class="ingredient-food" required><option value="">Choose saved food…</option></select></label><label class="field">Amount (g)<input class="ingredient-grams" type="number" min="0.01" step="any" value="100" required></label><button type="button" class="danger remove-ingredient" aria-label="Remove ingredient">×</button>';
 $("recipeIngredients").appendChild(row);
 row.querySelector(".remove-ingredient").addEventListener("click",()=>{row.remove();});
 getAll("foods").then(foods=>refreshIngredientOptions([...SOUTH_AFRICAN.map((f,i)=>({...f,id:"za-"+i})),...foods]));
}
function builtinById(id){const i=Number(String(id).slice(3));return SOUTH_AFRICAN[i]}
async function resolveFood(id){
 if(String(id).startsWith("za-")){const f=builtinById(id);return f?{...f,id}:null}
 return (await getAll("foods")).find(f=>f.id===id)||null;
}
async function saveRecipe(ev){
 ev.preventDefault();
 try{
  const rows=[...document.querySelectorAll(".ingredient-row")];if(!rows.length)throw new Error("Add at least one ingredient.");
  const ingredients=[];
  for(const row of rows){const food=await resolveFood(row.querySelector("select").value),grams=num(row.querySelector(".ingredient-grams").value);if(!food||!(grams>0))throw new Error("Choose a food and enter a valid ingredient amount.");ingredients.push({foodId:food.id,name:food.name,grams,nutrients:scaledNutrients(food.nutrients,grams,100),source:food.source||null,estimated:!!food.estimated})}
  const totals=totalNutrition(ingredients),servings=Math.max(1,Math.floor(num($("recipeServings").value)||1));
  const perServing=Object.fromEntries(NUTRIENTS.map(([k])=>[k,totals[k]==null?null:totals[k]/servings]));
  await put("recipes",{id:uid(),name:$("recipeName").value.trim(),servings,ingredients,totals,perServing,updated:Date.now()});
  $("recipeForm").reset();$("recipeIngredients").innerHTML="";addIngredientRow();await renderFoods();toast("Recipe saved.");
 }catch(err){toast(err.message||"Could not save recipe.");}
}
async function renderReports(){
 const entries=await getAll("entries"),goals=(await getAll("settings")).find(s=>s.id==="goals")?.value||{};
 const end=new Date(($("diaryDate").value||today())+"T12:00:00");const days=[];
 for(let i=6;i>=0;i--){const d=new Date(end);d.setDate(d.getDate()-i);const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;const es=dateEntries(entries,date);days.push({date,label:d.toLocaleDateString(undefined,{weekday:"short"}),totals:totalNutrition(es),count:es.length})}
 drawChart(days);
 const avg=k=>{const known=days.map(d=>d.totals[k]).filter(v=>v!=null);return known.length?known.reduce((a,b)=>a+b,0)/known.length:null};
 $("weeklyStats").innerHTML=[["Avg calories",avg("kcal"),"kcal"],["Avg protein",avg("protein"),"g"],["Days logged",days.filter(d=>d.count>0).length,"of 7"],["Foods logged",days.reduce((a,d)=>a+d.count,0),"entries"]].map(([label,v,u])=>`<div class="report-stat"><small>${label}</small><strong>${fmt(v)} <small>${u}</small></strong></div>`).join("");
 $("dailyBreakdown").innerHTML=days.map(d=>`<article class="entry"><div class="thumb placeholder">${d.count?"🥗":"—"}</div><div><div class="entry-title">${esc(d.label)} · ${d.date}</div><div class="entry-meta">${d.count} food entries</div></div><div class="entry-nutrition">${fmt(d.totals.kcal)} kcal<br><span class="entry-meta">P ${fmt(d.totals.protein)} g</span></div></article>`).join("");
}
function drawChart(days){
 const canvas=$("weeklyChart"),ctx=canvas.getContext("2d"),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
 canvas.width=Math.max(300,rect.width)*dpr;canvas.height=220*dpr;ctx.scale(dpr,dpr);
 const w=canvas.width/dpr,h=220,pad={l:38,r:10,t:15,b:35},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
 ctx.clearRect(0,0,w,h);const values=days.map(d=>d.totals.kcal??0),max=Math.max(500,...values)*1.12;
 ctx.font="11px system-ui";ctx.textBaseline="middle";ctx.strokeStyle="#e3ebe3";ctx.fillStyle="#748277";ctx.lineWidth=1;
 for(let i=0;i<=4;i++){const y=pad.t+ch*i/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.textAlign="right";ctx.fillText(Math.round(max*(1-i/4)),pad.l-7,y)}
 const step=cw/days.length,bw=Math.min(26,step*.55);
 days.forEach((d,i)=>{const v=values[i],bh=v/max*ch,x=pad.l+i*step+(step-bw)/2,y=pad.t+ch-bh;ctx.fillStyle=d.count?"#28794b":"#d6e2d7";ctx.beginPath();ctx.roundRect(x,y,bw,Math.max(2,bh),5);ctx.fill();ctx.fillStyle="#647369";ctx.textAlign="center";ctx.textBaseline="top";ctx.fillText(d.label,pad.l+i*step+step/2,h-pad.b+9)});
}
async function renderAll(){await renderDiary();await renderFoods();await renderReports();await loadGoals()}
function showPage(page){
 document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id==="page-"+page));
 document.querySelectorAll(".tab").forEach(el=>el.classList.toggle("active",el.dataset.page===page));
 if(page==="reports")renderReports();
 if(page==="foods")renderFoods();
 window.scrollTo({top:0,behavior:"smooth"});
}
async function loadGoals(){
 const goals=(await getAll("settings")).find(s=>s.id==="goals")?.value||{};
 for(const k of MACROS)if($("goal"+k[0].toUpperCase()+k.slice(1))) $("goal"+k[0].toUpperCase()+k.slice(1)).value=goals[k]??"";
}
async function saveGoals(ev){
 ev.preventDefault();const value={};for(const k of MACROS){const v=num($("goal"+k[0].toUpperCase()+k.slice(1)).value);value[k]=v!=null&&v>0?v:null}
 await put("settings",{id:"goals",value});await renderAll();toast("Goals saved.");
}
async function useFood(id){
 let food=await resolveFood(id);if(!food)return;
 showPage("add");resetForm();$("foodName").value=food.name;$("basisType").value="100g";$("basisAmount").value=100;$("amount").value=100;setFormNutrients(food.nutrients||{});$("sourceNote").value=food.source||"Saved food";currentPhoto=food.photo||null;currentProduct=food.barcode?{barcode:food.barcode}:null;$("verifiedCheck").checked=!!food.verified;setDataBadge(food.verified?"verified":food.estimated?"estimated":"unknown");
}
async function handleEntryAction(e){
 const b=e.target.closest("button[data-action]");if(!b)return;const {action,id}=b.dataset;
 if(action==="delete-entry"){if(confirm("Delete this diary entry?")){await del("entries",id);await renderAll()}}
 if(action==="reuse"){const e=(await getAll("entries")).find(x=>x.id===id);if(e){showPage("add");resetForm();$("foodName").value=e.name;$("amount").value=e.amount;$("basisAmount").value=e.basisAmount;$("basisType").value=e.basisType||"100g";$("meal").value=e.meal;setFormNutrients(e.basisAmount?scaledNutrients(e.nutrients,e.basisAmount,e.amount):e.nutrients);$("sourceNote").value=e.source||"";currentPhoto=e.photo;currentProduct=e.barcode?{barcode:e.barcode}:null;setDataBadge(e.verified?"verified":"unknown")}}
 if(action==="use-food")await useFood(id);
 if(action==="delete-food"){if(confirm("Delete this saved food? Existing diary entries will stay.")){await del("foods",id);await renderAll()}}
 if(action==="delete-recipe"){if(confirm("Delete this recipe?")){await del("recipes",id);await renderFoods()}}
 if(action==="log-recipe"){
  const r=(await getAll("recipes")).find(x=>x.id===id);if(!r)return;
  const item={id:uid(),date:$("diaryDate").value||today(),name:r.name+" (1 portion)",meal:"Dinner",amount:1,unit:"portion",basisType:"serving",basisAmount:1,nutrients:r.perServing,source:"Homemade recipe; calculated from saved ingredient values",verified:r.ingredients.every(i=>!i.estimated),estimated:r.ingredients.some(i=>i.estimated),created:Date.now()};
  await put("entries",item);await renderAll();showPage("diary");toast("Recipe portion added to diary.");
 }
}
function csvCell(v){return `"${String(v??"").replace(/"/g,'""')}"`}
async function exportCSV(){
 const entries=await getAll("entries"),head=["date","food","meal","amount","unit","barcode","verified","source",...NUTRIENTS.map(n=>n[0])];
 const rows=[head,...entries.map(e=>[e.date,e.name,e.meal,e.amount,e.unit,e.barcode,e.verified,e.source,...NUTRIENTS.map(([k])=>e.nutrients?.[k]??"")])];
 download(new Blob([rows.map(r=>r.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}),"pocket-food-log.csv");
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function backup(){
 const data={app:"PocketFoodTracker",version:1,exportedAt:new Date().toISOString(),entries:await getAll("entries"),foods:await getAll("foods"),recipes:await getAll("recipes"),settings:await getAll("settings")};
 download(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),"pocket-food-backup.json");setStatus("backupStatus","Backup downloaded.");
}
async function restore(file){
 try{
  const data=JSON.parse(await file.text());if(data.app!=="PocketFoodTracker"||!Array.isArray(data.entries)||!Array.isArray(data.foods))throw new Error("This does not look like a valid Pocket Food Tracker backup.");
  if(!confirm("Restore this backup? Existing entries, foods, recipes and settings will be replaced."))return;
  for(const key of ["entries","foods","recipes","settings"]){await clearStore(key);for(const item of (data[key]||[]))await put(key,item)}
  await renderAll();setStatus("backupStatus","Backup restored successfully.");toast("Backup restored.");
 }catch(err){setStatus("backupStatus",err.message||"Could not restore backup.")}
}
async function photoChosen(file){
 if(!file){currentPhoto=null;$("photoPreview").hidden=true;return}
 if(!file.type.startsWith("image/")){toast("Choose an image file.");return}
 // Resize/compress image to keep local browser storage manageable.
 try{
  const bitmap=await createImageBitmap(file),max=600,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
  currentPhoto=canvas.toDataURL("image/jpeg",.78);$("photoPreview").hidden=false;$("photoPreview").innerHTML=`<img src="${currentPhoto}" alt="Selected food photo">`;
 }catch{toast("Could not read that photo.");}
}
function setup(){
 $("diaryDate").value=today();
 document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
 document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.go)));
 $("todayBtn").addEventListener("click",()=>{$("diaryDate").value=today();renderAll()});
 $("diaryDate").addEventListener("change",renderAll);
 $("lookupBtn").addEventListener("click",lookupBarcode);$("barcodeInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();lookupBarcode()}});
 $("cameraBtn").addEventListener("click",startCamera);$("stopCameraBtn").addEventListener("click",stopCamera);
 $("foodForm").addEventListener("submit",saveEntry);$("resetFormBtn").addEventListener("click",resetForm);
 $("basisType").addEventListener("change",()=>{const type=$("basisType").value;$("basisAmount").value=type==="serving"?1:100;$("basisAmountWrap").querySelector("label");$("basisAmountWrap").firstChild.textContent=type==="serving"?"Basis amount (servings)":"Basis amount (g/ml)"});
 $("verifiedCheck").addEventListener("change",()=>setDataBadge($("verifiedCheck").checked?"verified":"unknown"));
 $("photoInput").addEventListener("change",e=>photoChosen(e.target.files?.[0]));
 $("recipeForm").addEventListener("submit",saveRecipe);$("addIngredientBtn").addEventListener("click",addIngredientRow);addIngredientRow();
 $("goalsForm").addEventListener("submit",saveGoals);$("exportBtn").addEventListener("click",exportCSV);
 $("backupBtn").addEventListener("click",backup);$("restoreInput").addEventListener("change",e=>{if(e.target.files?.[0])restore(e.target.files[0]);e.target.value=""});
 $("deleteAllBtn").addEventListener("click",async()=>{if(confirm("Permanently delete ALL local entries, saved foods, recipes and goals? Export a backup first if you want to keep them.")){for(const n of ["entries","foods","recipes","settings"])await clearStore(n);await renderAll();toast("Local data deleted.")}});
 $("todayEntries").addEventListener("click",handleEntryAction);$("savedFoods").addEventListener("click",handleEntryAction);$("savedRecipes").addEventListener("click",handleEntryAction);
 window.addEventListener("resize",()=>{if($("page-reports").classList.contains("active"))renderReports()});
}
(async function init(){
 try{await openDB();setup();await renderAll();
  if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("./sw.js").then(()=>{$("connectionStatus").textContent="Offline app shell ready. New barcode lookups need internet."}).catch(()=>$("connectionStatus").textContent="Offline support could not be enabled.");
  else $("connectionStatus").textContent="Open via HTTPS to install and use offline app caching.";
 }catch(err){document.body.innerHTML="<main><section class='card'><h1>Could not open local database</h1><p>Please open this app from localhost or an HTTPS site in a modern browser.</p><pre>"+esc(err.message)+"</pre></section></main>"}
})();
