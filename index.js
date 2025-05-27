// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { MessagingResponse } = require('twilio').twiml;
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const OA_KEY = process.env.OPENAI_API_KEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const ACC = process.env.ACCOUNT_SID;
const TOK = process.env.AUTH_TOKEN;

const db = createClient(SB_URL, SB_KEY, {
  global: { headers: { Authorization: `Bearer ${SB_KEY}` } }
});

const bars = (used, goals) => `
🔥 Calories: ${used.kcal}/${goals.kcal} kcal
🤩 Proteins: ${used.prot}/${goals.prot} g
🥚 Carbs:    ${used.carb}/${goals.carb} g
🥤 Fats:     ${used.fat}/${goals.fat} g`;

app.post('/webhook', async (req, res) => {
  const twiml = new MessagingResponse();
  const from = req.body.From;
  const bodyText = req.body.Body || '';
  const mUrl = req.body.MediaUrl0;
  const mType = req.body.MediaContentType0 || '';
  const isImg = mType.startsWith('image/');
  const isAudio = mType.startsWith('audio/');

  console.log('✅ Webhook received:', {
    From: from, Body: bodyText.slice(0, 50), Img: isImg, Audio: isAudio
  });

  let text = bodyText.trim();

  try {
    if (isAudio && mUrl) {
      const auth = { Authorization: 'Basic ' + Buffer.from(`${ACC}:${TOK}`).toString('base64') };
      const audio = await axios.get(mUrl, { responseType: 'arraybuffer', headers: auth });
      const form = new FormData();
      form.append('file', Buffer.from(audio.data), { filename: 'voice.ogg' });
      form.append('model', 'whisper-1');
      const wr = await axios.post('https://api.openai.com/v1/audio/transcriptions',
        form, { headers: { Authorization: `Bearer ${OA_KEY}`, ...form.getHeaders() } });
      text = wr.data.text;
    }

    const msgs = [{
      role: 'system',
      content: `You are *Calorai*, a WhatsApp nutrition coach. Always respond in English. Use the following standardized response everytime food is detected:

✅ *Meal logged successfully!*

🍽️ *<MealType>:* <brief label>

🔥 *Calories:* <kcal> kcal  
🥩 *Proteins:* <g> g  
🥔 *Carbs:* <g> g  
🧈 *Fats:* <g> g

🔔 *Assumptions:* give precise measurements with units, comma-separated, end with 🙂

⌛ *Daily Progress:*  
\${bars}

<one motivational sentence + ask them how did that meal feel + emoji>

!! NEVER use graphical bars manually. Only include the literal string "\${bars}".`
    }];

    if (isImg && mUrl) {
      const auth = { Authorization: 'Basic ' + Buffer.from(`${ACC}:${TOK}`).toString('base64') };
      const img = await axios.get(mUrl, { responseType: 'arraybuffer', headers: auth });
      const b64 = Buffer.from(img.data, 'binary').toString('base64');
      msgs.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mType};base64,${b64}` } },
          { type: 'text', text: 'What food is this? Estimate quantity, ingredients and macros.' }
        ]
      });
    } else if (text) {
      msgs.push({ role: 'user', content: text });
    } else {
      msgs.push({ role: 'user', content: 'Hi' });
    }

    const phone = from.replace('whatsapp:', '');
    const today = new Date().toISOString().slice(0, 10);

    let { data, error } = await db.rpc('get_user_data', { p_phone: phone, p_date: today });
    if (error) console.error('❌ Supabase RPC error:', error);
    console.log('📦 Supabase RPC result:', data);

    let row = data?.[0];
    if (!row) {
      const { error: insertUserErr } = await db.from('users')
        .upsert({ phone_number: phone }, { onConflict: 'phone_number' });
      if (insertUserErr) {
        console.error('❌ User insert error:', insertUserErr);
        twiml.message('⚠️ Failed to create user. Please try again.');
        return res.type('text/xml').send(twiml.toString());
      }
      ({ data, error } = await db.rpc('get_user_data', { p_phone: phone, p_date: today }));
      row = data?.[0];
    }

    const goals = { kcal: row.kcal_goal, prot: row.prot_goal, carb: row.carb_goal, fat: row.fat_goal };
    const used = { kcal: row.kcal_used, prot: row.prot_used, carb: row.carb_used, fat: row.fat_used };

    const gpt = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: msgs,
      max_tokens: 700,
      temperature: 0.1
    }, { headers: { Authorization: `Bearer ${OA_KEY}` } });

    let reply = gpt.data.choices[0].message.content;
    console.log('🧾 GPT raw reply:\n', reply);

    const flat = reply.replace(/\n/g, ' ');
    const macroRegex = /Calories[^\d]*(\d+)[^]*?Proteins[^\d]*(\d+)[^]*?Carbs[^\d]*(\d+)[^]*?Fats[^\d]*(\d+)/i;
    const match = flat.match(macroRegex);
    console.log('🔎 Regex match:', match);

    if (match) {
      const [_, kcal, prot, carb, fat] = match.map(Number);
      await db.from('meal_logs').insert({ user_phone: phone, kcal, prot, carb, fat, created_at: new Date() });
      await db.rpc('increment_daily_totals', {
        p_phone: phone,
        p_date: today,
        p_kcal: kcal,
        p_prot: prot,
        p_carb: carb,
        p_fat: fat
      });
      used.kcal += kcal; used.prot += prot; used.carb += carb; used.fat += fat;
      console.log('✅ Meal and totals updated.');
    } else {
      console.warn('⚠️ Could not extract macros.');
    }

    reply = reply.replace(/\$\{(progress_bars|bars)\}/g, bars(used, goals));
    twiml.message(reply);
    console.log('💬 Final reply sent.');
    res.type('text/xml').send(twiml.toString());
  } catch (err) {
    console.error('❌ Error in webhook:', err);
    twiml.message('⚠️ Something went wrong. Please try again.');
    res.type('text/xml').send(twiml.toString());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Calorai bot running at http://localhost:${PORT}`));
