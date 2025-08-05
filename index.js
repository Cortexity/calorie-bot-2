// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { MessagingResponse } = require('twilio').twiml;
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 👇 ADD THE CORS CODE HERE 👇
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

console.log('🌐 CORS middleware added');
// 👆 ADD THE CORS CODE HERE 👆

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
🥩 Proteins: ${used.prot}/${goals.prot} g
🥔 Carbs:    ${used.carb}/${goals.carb} g
🧈 Fats:     ${used.fat}/${goals.fat} g`;

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

// ============================================================================
// COMPLETE USER SETUP ROUTE
// ============================================================================

app.post('/complete-user-setup', express.json(), async (req, res) => {
  console.log('🔄 Complete user setup request received');
  
  try {
    const { checkoutKey, sessionId, stripeData, userData } = req.body;
    
    console.log('🔍 DEBUGGING SESSION ID:');
    console.log('  - sessionId received:', sessionId);
    console.log('  - sessionId type:', typeof sessionId);
    console.log('  - sessionId length:', sessionId ? sessionId.length : 'null');

    console.log('🔑 Checkout key:', checkoutKey);
    console.log('🎫 Session ID:', sessionId);
    console.log('💳 Stripe data:', stripeData);
    console.log('👤 User data:', userData);
    
    if (!checkoutKey || !userData) {
      return res.status(400).json({ 
        error: 'Missing required data: checkoutKey and userData are required' 
      });
    }
    
    let actualCustomerId = 'unknown';
    let actualSubscriptionId = 'unknown';
    
    // If we have a session ID, fetch actual Stripe data
    if (sessionId && sessionId !== 'unknown') {
      try {
        console.log('🔍 Fetching Stripe session details...');
        
        // Retrieve the checkout session
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        console.log('📋 Session retrieved:', {
          id: session.id,
          customer: session.customer,
          subscription: session.subscription,
          payment_status: session.payment_status
        });
        
        actualCustomerId = session.customer || 'no_customer';
        actualSubscriptionId = session.subscription || 'no_subscription';
        
        console.log('✅ Extracted Stripe IDs:', {
          customer_id: actualCustomerId,
          subscription_id: actualSubscriptionId
        });
        
      } catch (stripeError) {
        console.error('❌ Error fetching Stripe session:', stripeError);
        // Continue with unknown values rather than failing completely
      }
    }
    
    // Prepare final user data for Supabase
    const finalUserData = {
      // User onboarding data
      phone_number: userData.phone_number || null,
      gender: userData.gender || 'male',
      age: userData.age || 25,
      height_cm: userData.height_cm || 175,
      weight_kg: userData.weight_kg || 70,
      activity_level: userData.activity_level || 'active',
      kcal_goal: userData.kcal_goal || 2000,
      prot_goal: userData.prot_goal || 150,
      carb_goal: userData.carb_goal || 200,
      fat_goal: userData.fat_goal || 67,
      
      // Actual Stripe data (not hardcoded)
      stripe_customer_id: actualCustomerId,
      stripe_subscription_id: actualSubscriptionId,
      
      // Timestamps
      created_at: new Date().toISOString()
    };
    
    console.log('🎯 Final user data for Supabase:', finalUserData);
    
    // Insert into Supabase
    const { data, error } = await db.from('users').insert(finalUserData).select();
    
    if (error) {
      console.error('❌ Supabase insert error:', error);
      return res.status(500).json({ 
        error: 'Failed to create user account', 
        details: error.message 
      });
    }
    
    console.log('✅ User successfully created in Supabase:', data[0]);
    
    res.json({ 
      success: true, 
      message: 'User account created successfully',
      user: data[0]
    });
    
  } catch (error) {
    console.error('❌ Error in complete-user-setup:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});

// ============================================================================
// NEW ROUTE: Trigger WhatsApp welcome message
// ============================================================================

app.post('/trigger-welcome', express.json(), async (req, res) => {
  console.log('📱 WhatsApp welcome trigger received');
  
  try {
    const { phone, userData } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Format phone number for WhatsApp (ensure it starts with +)
    let formattedPhone = phone.toString().trim();
    
    // Remove ALL spaces and non-digit characters except +
    formattedPhone = formattedPhone.replace(/[^\d+]/g, '');
    
    // Ensure consistent format: +countrycodenumber (no spaces anywhere)
    if (formattedPhone.startsWith('+')) {
        // Remove any spaces that might exist and ensure clean format
        formattedPhone = '+' + formattedPhone.substring(1).replace(/\D/g, '');
    }
    
    console.log('📱 Final formatted phone (no spaces):', formattedPhone);
    
    // Get actual user data from the request (FIXED: Use the actual data!)
    console.log('🔍 Raw userData received:', userData);
    
    // FIXED: Extract actual values from the userData
    let actualCalories, actualProtein, actualFat, actualCarbs, actualWeight, fitnessGoal;
    
    if (userData && userData.fullRawData) {
        // Use fullRawData if available (most complete)
        const data = userData.fullRawData;
        actualCalories = data.calorieGoal || data.kcal_goal || 2000;
        actualProtein = data.proteinGrams || data.prot_goal || 150;
        actualFat = data.fatGrams || data.fat_goal || 67;
        actualCarbs = data.carbGrams || data.carb_goal || 200;
        actualWeight = data.weightKg || data.weight_kg || 70;
        fitnessGoal = data.fitnessGoal || 'maintain_build';
        
        console.log('📊 Using fullRawData:', {
            calories: actualCalories,
            protein: actualProtein,
            fat: actualFat,
            carbs: actualCarbs,
            weight: actualWeight,
            goal: fitnessGoal
        });
    } else if (userData && userData.supabaseData) {
        // Fallback to supabaseData
        const data = userData.supabaseData;
        actualCalories = data.kcal_goal || 2000;
        actualProtein = data.prot_goal || 150;
        actualFat = data.fat_goal || 67;
        actualCarbs = data.carb_goal || 200;
        actualWeight = data.weight_kg || 70;
        // Note: supabaseData doesn't have fitnessGoal, so we'll determine it from calories
        if (actualCalories < 1500) {
            fitnessGoal = 'lose_weight';
        } else if (actualCalories > 2500) {
            fitnessGoal = 'gain_weight';
        } else {
            fitnessGoal = 'maintain_build';
        }
        
        console.log('📊 Using supabaseData:', {
            calories: actualCalories,
            protein: actualProtein,
            fat: actualFat,
            carbs: actualCarbs,
            weight: actualWeight,
            goal: fitnessGoal
        });
    } else {
        // Last resort: use defaults
        console.log('⚠️ No userData found, using defaults');
        actualCalories = 2000;
        actualProtein = 150;
        actualFat = 67;
        actualCarbs = 200;
        actualWeight = 70;
        fitnessGoal = 'maintain_build';
    }
    
    // Determine goal text based on actual fitness goal
    let goalText = '*Maintain weight but build muscle*';
    let motivationText = 'If you stay consistent, you will lose fat and gain muscle over time, while keeping your weight stable 💪';
    
    if (fitnessGoal === 'lose_weight') {
      goalText = '*Lose weight*';
      motivationText = 'If you stay consistent, you will lose weight and reach your ideal body type 🧘‍♂️🥗';
    } else if (fitnessGoal === 'gain_weight') {
      goalText = '*Gain weight & muscle*';
      motivationText = 'If you stay consistent, you will gain weight by building muscle over time 🏋️‍♂️🍽️';
    }
    
    console.log('🎯 Final goal text:', goalText);
    
    // Calculate TDEE (should match calorie goal for maintain, be higher for lose, lower for gain)
    let actualTDEE;
    if (fitnessGoal === 'lose_weight') {
        actualTDEE = actualCalories + 300; // Add back the deficit
    } else if (fitnessGoal === 'gain_weight') {
        actualTDEE = actualCalories - 300; // Remove the surplus
    } else {
        actualTDEE = actualCalories; // Maintenance
    }
    
    const welcomeMessage = `Welcome to *Calorai* 🔥

🚀 You're all set and ready to go!

You can start texting me now! 💪🍽️

*Here are your Key Numbers:*

*New Targets:*
🔥 Calories: *${actualCalories}kcal*
🥩 Protein: *${actualProtein}g*
🥔 Carbs: *${actualCarbs}g*
🧈 Fats: *${actualFat}g*

*Your Health:*
🔥 TDEE: *${actualTDEE} calories*
⚖️ Current Weight: *${actualWeight}kg*
🎯 Goal: ${goalText}

⚖️ ${motivationText}

I will take these numbers into account when talking to you!`;

    // Send WhatsApp message using Twilio
    try {
      const twilio = require('twilio')(process.env.ACCOUNT_SID, process.env.AUTH_TOKEN);
      
      const message = await twilio.messages.create({
        from: 'whatsapp:+14155238886', // Your Twilio WhatsApp number
        to: `whatsapp:${formattedPhone}`,
        body: welcomeMessage
      });
      
      console.log('✅ WhatsApp welcome message sent:', message.sid);
      console.log('📋 Message content preview:', welcomeMessage.substring(0, 100) + '...');
      
      res.json({
        success: true,
        message: 'Welcome message sent successfully',
        messageSid: message.sid
      });
      
    } catch (twilioError) {
      console.error('❌ Twilio error:', twilioError);
      res.status(500).json({
        error: 'Failed to send WhatsApp message',
        details: twilioError.message
      });
    }
    
  } catch (error) {
    console.error('❌ Error in trigger-welcome:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
});


// ============================================================================
// STRIPE WEBHOOK ROUTE
// ============================================================================

app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('🔔 Stripe webhook received');
  
  try {
    const event = req.body;
    console.log('📦 Event type:', event.type);
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      console.log('✅ Checkout session completed');
      console.log('📋 Session ID:', session.id);
      console.log('👤 Customer ID:', session.customer);
      console.log('💳 Subscription ID:', session.subscription);
      console.log('📧 Customer Email:', session.customer_email);
      console.log('💰 Amount Total:', session.amount_total);
      console.log('💱 Currency:', session.currency);
      
      const successUrl = session.success_url || '';
      console.log('🔗 Success URL:', successUrl);
      
      const checkoutKeyMatch = successUrl.match(/checkout_key=([^&]+)/);
      const checkoutKey = checkoutKeyMatch ? checkoutKeyMatch[1] : null;
      
      console.log('🔑 Extracted checkout key:', checkoutKey);
      
      if (checkoutKey) {
        const stripeUserData = {
          session_id: session.id,
          customer_id: session.customer,
          subscription_id: session.subscription,
          customer_email: session.customer_email,
          amount_paid: session.amount_total,
          currency: session.currency,
          checkout_key: checkoutKey,
          payment_status: session.payment_status,
          created_at: new Date().toISOString()
        };
        
        console.log('🎯 STRIPE USER DATA READY FOR SUPABASE:', stripeUserData);
        console.log('🔄 Next: Frontend needs to call /complete-user-setup with user data');
        
      } else {
        console.warn('⚠️ No checkout key found in success URL');
      }
    } else {
      console.log('⏭️ Ignoring event type:', event.type);
    }
    
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('❌ Stripe webhook error:', error);
    res.status(400).json({ error: 'Webhook error' });
  }
});

console.log('🎣 Updated Stripe webhook route added at /stripe-webhook');
console.log('🛠️ Complete user setup route added at /complete-user-setup');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Calorai bot running at http://localhost:${PORT}`));