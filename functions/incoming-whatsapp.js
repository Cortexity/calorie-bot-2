/*************************************************************************
 *  Calorai WhatsApp Handler – GPT-4o-mini + Whisper + Supabase (no sharp)
 *************************************************************************/

const twilio  = require('twilio');
const axios   = require('axios');
const FormData            = require('form-data');
const { createClient }    = require('@supabase/supabase-js');

const sq = (c,g)=>c/g<.4?'🟩':c/g<.8?'🟧':'🟥';
const GPT_TIMEOUT   = 12000;      // 12 s hard stop
const HTTP_TIMEOUT  = 12000;      // same for media / whisper

/* helper: progress bar block ------------------------------------------------ */
const bars = (u,g)=>
`🔥 ${sq(u.kcal,g.kcal)} Calories:  ${u.kcal}/${g.kcal} kcal
🥩 ${sq(u.prot,g.prot)} Proteins:  ${u.prot}/${g.prot} g
🥔 ${sq(u.carb,g.carb)} Carbs:     ${u.carb}/${g.carb} g
🧈 ${sq(u.fat ,g.fat )} Fats:      ${u.fat }/${g.fat } g`;

exports.handler = async (context,event,cb)=>{
  const twiml   = new twilio.twiml.MessagingResponse();
  const {ACCOUNT_SID:ACC,AUTH_TOKEN:TOK,OPENAI_API_KEY:OA,
         SUPABASE_URL:SB_URL,SUPABASE_KEY:SB_KEY}=context;
  if(!ACC||!TOK||!OA||!SB_URL||!SB_KEY){
    twiml.message('🚧 Missing env keys – ping admin'); return cb(null,twiml);
  }

  const cli = twilio(ACC,TOK);
  const db  = createClient(SB_URL,SB_KEY);
  const fromPhone = event.From.replace('whatsapp:','');

  /* ─── incoming media / text ---------------------------------------- */
  const mediaURL = event.MediaUrl0;
  const mediaCT  = event.MediaContentType0||'';
  const hasImg   = mediaCT.startsWith('image/');
  const hasAud   = mediaCT.startsWith('audio/');
  let   userText = (event.Body||'').trim();

  if(hasImg)
    await cli.messages.create({from:event.To,to:event.From,body:'🔍 Analyzing your photo…'});

  /* ─── Whisper ------------------------------------------------------- */
  if(hasAud&&mediaURL){
    try{
      const auth = {Authorization:`Basic ${Buffer.from(`${ACC}:${TOK}`).toString('base64')}`};
      const buf  = await axios.get(mediaURL,{responseType:'arraybuffer',headers:auth,timeout:HTTP_TIMEOUT}).then(r=>r.data);

      const fd = new FormData();
      fd.append('file',buf,{filename:'voice.ogg'});
      fd.append('model','whisper-1');

      const wr = await axios.post('https://api.openai.com/v1/audio/transcriptions',
                   fd,{headers:{Authorization:`Bearer ${OA}`,...fd.getHeaders()},timeout:HTTP_TIMEOUT});

      userText = wr.data.text;
      const sec = Math.round(buf.length/1024/1.6);
      console.info(`🎧 Voice ≈${sec}s   💬 Whisper $${((sec/60)*0.006).toFixed(5)}`);
    }catch(e){
      twiml.message('⚠️ Voice not understood – try again'); return cb(null,twiml);
    }
  }

  /* ─── GPT prompt ---------------------------------------------------- */
  const system =
`You are *Calorai*, a WhatsApp nutrition coach. Always respond in English.

✅ *Meal logged successfully!*

🍽️ *<MealType>:* <brief label>

🔥 *Calories:* <kcal> kcal  
🥩 *Proteins:* <g> g  
🥔 *Carbs:* <g> g  
🧈 *Fats:* <g> g

🔔 *Assumptions:* one friendly sentence, comma-separated, end with 🙂

⌛ *Daily Progress:*  
\${progress_bars}

<one motivational sentence + emoji>

**Assumptions policy (strict)** • concrete units • no vague words • use ~150 g if unsure`;

  const msgs=[{role:'system',content:system}];

  if(hasImg){
    msgs.push({
      role:'user',
      content:[
        {type:'image_url',image_url:{url:'attachment'}},
        {type:'text',text:'Identify food, precise assumptions, macros.'}
      ]});
    try{
      const auth={Authorization:`Basic ${Buffer.from(`${ACC}:${TOK}`).toString('base64')}`};
      let imgBuf = await axios.get(mediaURL,{responseType:'arraybuffer',headers:auth,timeout:HTTP_TIMEOUT}).then(r=>r.data);
      /* keep only first 150 kB → ~3 k tokens  */
      if(imgBuf.length>150*1024) imgBuf = imgBuf.slice(0,150*1024);
      msgs[1].content[0].image_url.url = `data:${mediaCT};base64,${Buffer.from(imgBuf,'binary').toString('base64')}`;
    }catch(e){
      twiml.message('⚠️ Picture error – resend'); return cb(null,twiml);
    }
  }else{
    msgs.push({role:'user',content:userText});
  }

  /* ─── Supabase fetch (direct select) -------------------------------- */
  const goalsPromise = db
      .from('users')
      .select('kcal_goal,prot_goal,carb_goal,fat_goal')
      .eq('phone_number',fromPhone)
      .single();

  /* ─── GPT request --------------------------------------------------- */
  const gptPromise = axios.post(
      'https://api.openai.com/v1/chat/completions',
      {model:'gpt-4o-mini',messages:msgs,max_tokens:800,temperature:0.1,top_p:1,
       frequency_penalty:0,presence_penalty:0,seed:42},
      {headers:{Authorization:`Bearer ${OA}`},timeout:GPT_TIMEOUT});

  /* await both in parallel */
  let gptResp, goalsRow;
  try{
    [gptResp, goalsRow] = await Promise.all([gptPromise, goalsPromise]);
  }catch(err){
    /* if GPT time-out, retry once with full gpt-4o */
    if(!gptResp){
      console.warn('mini time-out → retry gpt-4o');
      gptResp = await axios.post('https://api.openai.com/v1/chat/completions',
         {...gptPromise.data, model:'gpt-4o'},
         {headers:{Authorization:`Bearer ${OA}`},timeout:GPT_TIMEOUT});
    }else{
      console.error('Supabase error',err.message);
    }
  }

  /* ─── logging cost -------------------------------------------------- */
  const u = gptResp.data.usage;
  console.info(`[${gptResp.data.model}] ✅ prompt ${u.prompt_tokens} / completion ${u.completion_tokens} → total ${u.total_tokens}`);
  console.info(`💰 ChatGPT cost $${((u.prompt_tokens*0.005+u.completion_tokens*0.015)/1000).toFixed(5)}`);

  /* goals or defaults */
  let goals = {kcal:2000,prot:150,carb:250,fat:70};
  if(goalsRow?.data){
    goals = {kcal:goalsRow.data.kcal_goal,prot:goalsRow.data.prot_goal,
             carb:goalsRow.data.carb_goal,fat:goalsRow.data.fat_goal};
    console.info('✅ Supabase match for',fromPhone);
  }else{
    console.warn('⚠️ Supabase fallback defaults');
  }

  /* TEMP daily totals (replace later) */
  const used = {kcal:300,prot:60,carb:230,fat:40};

  let reply = gptResp.data.choices[0].message.content
                .replace(/\$\{progress_bars\}/g,bars(used,goals))
                .replace(/\$\{bars\}/g,bars(used,goals));

  /* ─── send ---------------------------------------------------------- */
  if(hasImg||aud){
    await cli.messages.create({from:event.To,to:event.From,body:reply});
    return cb();
  }else{
    twiml.message(reply);
    return cb(null,twiml);
  }
};
