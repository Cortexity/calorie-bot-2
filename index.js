// index.js

require('dotenv').config();
console.log('🚀 DEPLOYMENT VERSION: 2.0 - CORS FIXED - ' + new Date().toISOString());


const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { MessagingResponse } = require('twilio').twiml;
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// RAILWAY REQUEST INTERCEPTOR - MUST BE FIRST MIDDLEWARE
app.use((req, res, next) => {
  console.log(`🎯 REQUEST HIT: ${req.method} ${req.path} from ${req.ip} at ${new Date().toISOString()}`);
  console.log(`   Headers: ${JSON.stringify(req.headers).substring(0, 200)}`);
  next();
});

// CORS MIDDLEWARE
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ message: 'CORS preflight successful' });
  }
  next();
});

console.log('✅ CORS middleware configured');

// ============================================================================
// TEST ENDPOINTS
// ============================================================================

// Root endpoint for health checks
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK',
    service: 'calorie-bot-2',
    version: '2.0',
    timestamp: new Date().toISOString()
  });
});

// Simple test endpoint
app.get('/test', (req, res) => {
  console.log('📍 GET /test endpoint hit');
  res.json({ 
    message: 'Server is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// CORS test GET endpoint
app.get('/cors-test', (req, res) => {
  console.log('🧪 GET /cors-test endpoint hit');
  res.json({ 
    message: 'CORS GET test successful',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// CORS test POST endpoint
app.post('/cors-test', (req, res) => {
  console.log('🧪 POST /cors-test endpoint hit');
  console.log('  - Body received:', req.body);
  res.json({ 
    message: 'CORS POST test successful',
    origin: req.headers.origin,
    body: req.body,
    timestamp: new Date().toISOString()
  });
});

// One-time cleanup endpoint to fix existing Stripe data
app.post('/cleanup-stripe-data', async (req, res) => {
  console.log('🧹 Manual cleanup triggered');
  
  try {
    await cleanupExistingStripeData();
    res.json({ 
      success: true, 
      message: 'Stripe data cleanup completed' 
    });
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    res.status(500).json({ 
      error: 'Cleanup failed', 
      details: error.message 
    });
  }
});

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

const OA_KEY = process.env.OPENAI_API_KEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;
const ACC = process.env.ACCOUNT_SID;
const TOK = process.env.AUTH_TOKEN;

console.log('🔌 Connecting to Supabase...');
console.log('  - URL exists:', !!SB_URL);
console.log('  - KEY exists:', !!SB_KEY);

const db = createClient(SB_URL, SB_KEY, {
  global: { headers: { Authorization: `Bearer ${SB_KEY}` } }
});

console.log('✅ Supabase client created');

// ============================================================================
// STRIPE ID CLEANUP UTILITIES
// ============================================================================

// Extract clean IDs from Stripe objects
function extractStripeIds(customer, subscription) {
  const customerId = typeof customer === 'string' ? customer : customer?.id;
  const subscriptionId = typeof subscription === 'string' ? subscription : subscription?.id;
  
  return {
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId
  };
}

// Update user Stripe data with clean IDs
async function updateUserStripeData(userId, customer, subscription) {
  const { stripe_customer_id, stripe_subscription_id } = extractStripeIds(customer, subscription);
  
  const { error } = await db
    .from('users')
    .update({
      stripe_customer_id,
      stripe_subscription_id,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);
    
  if (error) {
    console.error('Error updating user Stripe data:', error);
    throw error;
  }
}

// Clean up existing data (run once to fix current records)
async function cleanupExistingStripeData() {
  console.log('🧹 Starting Stripe data cleanup...');
  
  const { data: users, error } = await db
    .from('users')
    .select('id, stripe_customer_id, stripe_subscription_id')
    .not('stripe_customer_id', 'is', null);
    
  if (error) {
    console.error('Error fetching users:', error);
    return;
  }
  
  for (const user of users) {
    let needsUpdate = false;
    const updates = {};
    
    // Clean customer ID if it's a JSON string or object
    if (user.stripe_customer_id) {
      let cleanId = user.stripe_customer_id;
      
      // If it's a JSON string, parse it and extract ID
      if (typeof cleanId === 'string' && cleanId.startsWith('{"id"')) {
        try {
          const parsed = JSON.parse(cleanId);
          cleanId = parsed.id;
          needsUpdate = true;
        } catch (e) {
          console.log('Could not parse customer ID:', cleanId);
        }
      }
      // If it's already an object
      else if (typeof cleanId === 'object' && cleanId.id) {
        cleanId = cleanId.id;
        needsUpdate = true;
      }
      
      if (needsUpdate) updates.stripe_customer_id = cleanId;
    }
    
    // Clean subscription ID if it's a JSON string or object
    if (user.stripe_subscription_id) {
      let cleanId = user.stripe_subscription_id;
      
      // If it's a JSON string, parse it and extract ID
      if (typeof cleanId === 'string' && cleanId.startsWith('{"id"')) {
        try {
          const parsed = JSON.parse(cleanId);
          cleanId = parsed.id;
          needsUpdate = true;
        } catch (e) {
          console.log('Could not parse subscription ID:', cleanId);
        }
      }
      // If it's already an object
      else if (typeof cleanId === 'object' && cleanId.id) {
        cleanId = cleanId.id;
        needsUpdate = true;
      }
      
      if (needsUpdate) updates.stripe_subscription_id = cleanId;
    }
    
    if (needsUpdate) {
      console.log(`🔧 Cleaning data for user ${user.id}`);
      await db
        .from('users')
        .update(updates)
        .eq('id', user.id);
    }
  }
  
  console.log('✅ Stripe data cleanup completed');
}

const bars = (used, goals) => `
🔥 Calories: ${used.kcal}/${goals.kcal} kcal
🥩 Proteins: ${used.prot}/${goals.prot} g
🥔 Carbs:    ${used.carb}/${goals.carb} g
🧈 Fats:     ${used.fat}/${goals.fat} g`;

// ============================================================================
// WHATSAPP WEBHOOK
// ============================================================================

app.post('/webhook', async (req, res) => {
  console.log('🔥 WEBHOOK HIT - Full request body:', JSON.stringify(req.body, null, 2));
  
  const twiml = new MessagingResponse();
  const from = req.body.From;
  const bodyText = req.body.Body || '';
  
  console.log('📱 Message details:');
  console.log('  - From:', from);
  console.log('  - Body:', bodyText);
  console.log('  - Media URL:', req.body.MediaUrl0 || 'none');
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
      content: `You are *IQCalorie*, a WhatsApp nutrition coach. Always respond in English. Use the following standardized response everytime food is detected:

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
// VOICE VERIFICATION WEBHOOK WITH RECORDING (for Facebook phone call)
// ============================================================================

app.post('/webhook-voice-verification', (req, res) => {
  console.log('📞 VOICE VERIFICATION CALL RECEIVED:');
  console.log('  - Full request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const from = req.body.From || 'unknown';
    const callSid = req.body.CallSid || 'unknown';
    
    console.log('  - From:', from);
    console.log('  - Call SID:', callSid);
    
    // Create TwiML response to RECORD the incoming call
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice">Recording verification call from Facebook</Say>
    <Record 
        timeout="30" 
        maxLength="60" 
        action="https://bass-ethical-piranha.ngrok-free.app/process-recording" 
        method="POST"
        transcribe="true"
        transcribeCallback="https://bass-ethical-piranha.ngrok-free.app/transcription-complete"
    />
    <Say voice="alice">Recording complete</Say>
</Response>`;
    
    console.log('🎙️ Recording Facebook verification call...');
    console.log('📤 TwiML Response sent with recording instructions');
    
    res.type('text/xml').send(twiml);
    
  } catch (error) {
    console.error('❌ Error in voice verification:', error);
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Error occurred</Say></Response>');
  }
});

// ============================================================================
// PROCESS RECORDING WEBHOOK (after recording is done)
// ============================================================================

app.post('/process-recording', (req, res) => {
  console.log('🎵 RECORDING COMPLETED:');
  console.log('  - Full request body:', JSON.stringify(req.body, null, 2));
  
  const recordingUrl = req.body.RecordingUrl;
  const recordingSid = req.body.RecordingSid;
  
  console.log('🔗 Recording URL:', recordingUrl);
  console.log('📁 Recording SID:', recordingSid);
  console.log('👆 You can listen to this recording to hear Facebook\'s verification code');
  
  // End the call
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Hangup/>
</Response>`;
  
  res.type('text/xml').send(twiml);
});

// ============================================================================
// TRANSCRIPTION WEBHOOK (Twilio converts speech to text)
// ============================================================================

app.post('/transcription-complete', (req, res) => {
  console.log('📝 TRANSCRIPTION COMPLETED:');
  console.log('  - Full request body:', JSON.stringify(req.body, null, 2));
  
  const transcriptionText = req.body.TranscriptionText || '';
  const transcriptionStatus = req.body.TranscriptionStatus;
  
  console.log('📄 Transcription Status:', transcriptionStatus);
  console.log('📄 Transcription Text:', transcriptionText);
  
  // Extract verification code from transcription
  const codeMatch = transcriptionText.match(/\d{6}/);
  if (codeMatch) {
    console.log('🔑 FACEBOOK VERIFICATION CODE FOUND:', codeMatch[0]);
    console.log('👆 USE THIS CODE IN FACEBOOK SETUP');
  } else {
    console.log('⚠️ No 6-digit code found in transcription');
    console.log('💡 Check the recording URL to manually listen for the code');
  }
  
  res.status(200).send('OK');
});



// ============================================================================
// TEST VERSION OF COMPLETE USER SETUP (for Postman testing)
// ============================================================================

app.post('/complete-user-setup-test', async (req, res) => {
  console.log('🧪 TEST VERSION - Complete user setup');
  
  try {
    const { checkoutKey, sessionId, userData, testMode } = req.body;
    
    console.log('📦 Test mode received data:');
    console.log('  - checkoutKey:', checkoutKey);
    console.log('  - sessionId:', sessionId);
    console.log('  - testMode:', testMode);
    
    let finalPhoneNumber = userData?.phone_number || null;
    let finalEmail = userData?.email || null;
    let stripeCustomerId = 'test_customer_' + Date.now();
    let stripeSubscriptionId = 'test_sub_' + Date.now();
    
    // If testMode is true, skip Stripe and use provided data
    if (testMode) {
      console.log('🧪 TEST MODE: Skipping Stripe API calls');
      
      // Simulate the "no phone" scenario if phone_number is not provided
      if (!finalPhoneNumber) {
        console.log('⚠️ TEST: Simulating no phone scenario');
        finalPhoneNumber = `+1000${Date.now().toString().slice(-10)}`;
        console.log('📱 Using temporary phone:', finalPhoneNumber);
      }
      
      if (!finalEmail) {
        finalEmail = `test_${Date.now()}@iqcalorie.com`;
      }
      
    } else {
      // Try real Stripe session (original logic)
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        // ... rest of original Stripe logic
        stripeCustomerId = session.customer || 'unknown';
        stripeSubscriptionId = session.subscription || 'unknown';
      } catch (error) {
        console.log('⚠️ Stripe error, using test fallback');
      }
    }
    
    // Format phone if exists
    if (finalPhoneNumber && !finalPhoneNumber.startsWith('+1000')) {
      finalPhoneNumber = finalPhoneNumber.toString().trim().replace(/[^\d+]/g, '');
      if (!finalPhoneNumber.startsWith('+')) {
        finalPhoneNumber = '+' + finalPhoneNumber;
      }
    }
    
    // Prepare user data for Supabase
    const finalUserData = {
      phone_number: finalPhoneNumber,
      email: finalEmail,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      gender: userData?.gender || 'male',
      age: userData?.age || 25,
      height_cm: userData?.height_cm || 175,
      weight_kg: userData?.weight_kg || 70,
      activity_level: userData?.activity_level || 'active',
      kcal_goal: userData?.kcal_goal || 2000,
      prot_goal: userData?.prot_goal || 150,
      carb_goal: userData?.carb_goal || 200,
      fat_goal: userData?.fat_goal || 67,
      created_at: new Date().toISOString()
    };
    
    console.log('🎯 Final user data for Supabase:', finalUserData);
    
    // Insert into Supabase
    const { data, error } = await db.from('users')
      .upsert(finalUserData, { 
        onConflict: 'phone_number',
        returning: 'representation' 
      })
      .select();
    
    if (error) {
      console.error('❌ Supabase insert error:', error);
      return res.status(500).json({ 
        error: 'Failed to create user account', 
        details: error.message 
      });
    }
    
    console.log('✅ TEST USER created in Supabase:', data[0]);
    
    res.json({ 
      success: true, 
      message: 'TEST: User account created successfully',
      user: data[0],
      testMode: true
    });
    
  } catch (error) {
    console.error('❌ Error in test endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});


// ============================================================================
// COMPLETE USER SETUP ROUTE - FIXED VERSION
// ============================================================================

app.post('/complete-user-setup', async (req, res) => {
  console.log('🔄 Complete user setup - REQUEST RECEIVED');
  
  try {
    const { checkoutKey, sessionId, stripeData, userData } = req.body;
    
    console.log('📦 Received data:');
    console.log('  - checkoutKey:', checkoutKey);
    console.log('  - sessionId:', sessionId);
    console.log('  - userData:', userData);
    
    if (!sessionId || sessionId === 'unknown') {
      return res.status(400).json({ 
        error: 'Session ID is required to create user' 
      });
    }
    
    // STEP 1: Get phone from Stripe ONLY (source of truth)
    let finalPhoneNumber = null;
    let finalEmail = null;
    let stripeCustomerId = null;
    let stripeSubscriptionId = null;
    
    try {
      console.log('🔍 Fetching complete Stripe session details...');
      
      // Retrieve session with expanded details
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['customer_details', 'customer', 'subscription']
      });

      console.log('📋 Stripe session retrieved successfully');
      
      // Always use Stripe phone as source of truth, ignore localStorage
      finalPhoneNumber = session.customer_details?.phone;
      // Don't even check userData.phone_number
      
      if (finalPhoneNumber) {
        console.log('✅ Phone from Stripe (source of truth):', finalPhoneNumber);
      } else {
        console.log('⚠️ No phone number in Stripe checkout');
      }
      
      // Get email from Stripe
      if (session.customer_details && session.customer_details.email) {
        finalEmail = session.customer_details.email;
        console.log('✅ Email from Stripe:', finalEmail);
      } else if (session.customer_email) {
        finalEmail = session.customer_email;
        console.log('✅ Email from session:', finalEmail);
      }
      
      // Get clean Stripe IDs using utility function
      const { stripe_customer_id, stripe_subscription_id } = extractStripeIds(
        session.customer, 
        session.subscription
      );
      stripeCustomerId = stripe_customer_id || 'unknown';
      stripeSubscriptionId = stripe_subscription_id || 'unknown';
      
      console.log('🔍 FINAL DATA CHECK:');
      console.log('  - Phone:', finalPhoneNumber || 'NOT FOUND');
      console.log('  - Email:', finalEmail || 'NOT FOUND');
      console.log('  - Customer ID:', stripeCustomerId);
      console.log('  - Subscription ID:', stripeSubscriptionId);
      
    } catch (stripeError) {
      console.error('❌ Error fetching Stripe session:', stripeError);
      return res.status(500).json({ 
        error: 'Failed to retrieve payment information',
        details: stripeError.message 
      });
    }
    
    // STEP 2: Handle missing phone scenario
    if (!finalPhoneNumber) {
      console.log('⚠️ WARNING: No phone number found in Stripe or userData');
      console.log('📧 Will use email-based identifier instead');
      
      // Create a temporary identifier using email or stripe customer ID
      if (finalEmail) {
        // Use email as temporary identifier (Supabase can handle this)
        finalPhoneNumber = `email:${finalEmail}`;
        console.log('📱 Using email-based identifier:', finalPhoneNumber);
      } else {
        // Last resort: use Stripe customer ID
        finalPhoneNumber = `stripe:${stripeCustomerId}`;
        console.log('📱 Using Stripe-based identifier:', finalPhoneNumber);
      }
    } else {
      // Format phone properly if we have it
      finalPhoneNumber = finalPhoneNumber.toString().trim().replace(/[^\d+]/g, '');
      if (!finalPhoneNumber.startsWith('+')) {
        finalPhoneNumber = '+' + finalPhoneNumber;
      }
      console.log('📱 Formatted phone number:', finalPhoneNumber);
    }
    
    // STEP 3: Prepare user data for Supabase (matching YOUR table structure)
    const finalUserData = {
      // Core identifiers
      phone_number: finalPhoneNumber,
      email: finalEmail,
      
      // Stripe data
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      
      // User profile data from onboarding
      gender: userData?.gender || 'male',
      age: userData?.age || 25,
      height_cm: userData?.height_cm || 175,
      weight_kg: userData?.weight_kg || 70,
      activity_level: userData?.activity_level || 'active',
      kcal_goal: userData?.kcal_goal || 2000,
      prot_goal: userData?.prot_goal || 150,
      carb_goal: userData?.carb_goal || 200,
      fat_goal: userData?.fat_goal || 67,
      
      // Timestamp
      created_at: new Date().toISOString()
    };
    
    console.log('🎯 Final user data for Supabase:', finalUserData);
    
    // STEP 4: Insert into Supabase
    const { data, error } = await db.from('users')
      .upsert(finalUserData, { 
        onConflict: 'phone_number',
        returning: 'representation' 
      })
      .select();
    
    if (error) {
      console.error('❌ Supabase insert error:', error);
      return res.status(500).json({ 
        error: 'Failed to create user account', 
        details: error.message 
      });
    }

    if (!data || data.length === 0) {
      console.error('❌ No user data returned from Supabase');
      return res.status(500).json({ 
        error: 'User creation failed', 
        details: 'No user data returned' 
      });
    }
    
    console.log('✅ User successfully created/updated in Supabase:', data[0]);
    
    res.json({ 
      success: true, 
      message: 'User account created successfully',
      user: data[0],
      phoneSource: finalPhoneNumber.startsWith('+') ? 'stripe_or_landing' : 'fallback_identifier'
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
// TRIGGER WHATSAPP WELCOME MESSAGE
// ============================================================================

app.post('/trigger-welcome', async (req, res) => {
  console.log('📱 WhatsApp welcome trigger received');
  
  try {
    const { phone, userData } = req.body;
    
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Format phone number for WhatsApp
    let formattedPhone = phone.toString().trim();
    formattedPhone = formattedPhone.replace(/[^\d+]/g, '');
    
    if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+' + formattedPhone;
    }
    
    console.log('📱 Final formatted phone:', formattedPhone);
    
    // Extract actual values from userData
    let actualCalories = 2000, actualProtein = 150, actualFat = 67, actualCarbs = 200, actualWeight = 70, fitnessGoal = 'maintain_build';
    
    if (userData && userData.fullRawData) {
        const data = userData.fullRawData;
        actualCalories = data.calorieGoal || data.kcal_goal || 2000;
        actualProtein = data.proteinGrams || data.prot_goal || 150;
        actualFat = data.fatGrams || data.fat_goal || 67;
        actualCarbs = data.carbGrams || data.carb_goal || 200;
        actualWeight = data.weightKg || data.weight_kg || 70;
        fitnessGoal = data.fitnessGoal || 'maintain_build';
    } else if (userData && userData.supabaseData) {
        const data = userData.supabaseData;
        actualCalories = data.kcal_goal || 2000;
        actualProtein = data.prot_goal || 150;
        actualFat = data.fat_goal || 67;
        actualCarbs = data.carb_goal || 200;
        actualWeight = data.weight_kg || 70;
        fitnessGoal = actualCalories < 1500 ? 'lose_weight' : actualCalories > 2500 ? 'gain_weight' : 'maintain_build';
    }
    
    // Determine goal text
    let goalText = '*Maintain weight but build muscle*';
    let motivationText = 'If you stay consistent, you will lose fat and gain muscle over time, while keeping your weight stable 💪';
    
    if (fitnessGoal === 'lose_weight') {
      goalText = '*Lose weight*';
      motivationText = 'If you stay consistent, you will lose weight and reach your ideal body type 🧘‍♂️🥗';
    } else if (fitnessGoal === 'gain_weight') {
      goalText = '*Gain weight & muscle*';
      motivationText = 'If you stay consistent, you will gain weight by building muscle over time 🏋️‍♂️🍽️';
    }
    
    // Calculate TDEE
    let actualTDEE = actualCalories;
    if (fitnessGoal === 'lose_weight') actualTDEE = actualCalories + 300;
    else if (fitnessGoal === 'gain_weight') actualTDEE = actualCalories - 300;
    
    const welcomeMessage = `Welcome to *IQCalorie* 🔥

🚀 You're all set and ready to go!

You can start texting me now! 💪✅

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
        from: 'whatsapp:+447888873477',
        to: `whatsapp:${formattedPhone}`,
        body: welcomeMessage
      });
      
      console.log('✅ WhatsApp welcome message sent:', message.sid);
      
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

// CREATE CHECKOUT SESSION WITH 3-DAY TRIAL AND PHONE COLLECTION
app.post('/create-checkout-session', async (req, res) => {
  console.log('🛒 Creating checkout session with 3-day trial');
  
  try {
    const { priceId, checkoutKey, phoneNumber, email } = req.body;
    
    console.log('Creating session for price:', priceId);
    console.log('Checkout key:', checkoutKey);
    console.log('Phone from frontend:', phoneNumber || 'Will collect in checkout');
    console.log('Email from frontend:', email || 'Will collect in checkout');
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        trial_period_days: 3
      },
      success_url: `https://www.iqcalorie.com/confirmation?session_id={CHECKOUT_SESSION_ID}&checkout_key=${checkoutKey}`,
      cancel_url: 'https://www.iqcalorie.com/choose-your-plan',
      
      // COLLECT PHONE (required)
      phone_number_collection: {
        enabled: true
      },
      
      // NO customer_email here - this allows email to be editable
      
      // Store data in metadata for backup
      metadata: {
        phone_number: phoneNumber || '',
        email: email || '',
        checkout_key: checkoutKey
      }
    });
    
    console.log('✅ Session created with phone collection:', session.id);
    res.json({ sessionId: session.id });
    
  } catch (error) {
    console.error('❌ Error creating session:', error);
    res.status(500).json({ error: error.message });
  }
});


// ============================================================================
// STRIPE WEBHOOK
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
      
      const successUrl = session.success_url || '';
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
      }
    }
    
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('❌ Stripe webhook error:', error);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// ============================================================================
// PROXY SETUP (BACKUP ENDPOINT)
// ============================================================================

app.post('/proxy-setup', async (req, res) => {
  console.log('🔄 Proxy endpoint hit');
  
  // Manually set CORS for this specific endpoint
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  try {
    const { checkoutKey, sessionId, stripeData, userData } = req.body;
    console.log('Proxy received data:', { checkoutKey, sessionId });
    
    let actualCustomerId = 'unknown';
    let actualSubscriptionId = 'unknown';
    
    if (sessionId && sessionId !== 'unknown') {
      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        actualCustomerId = session.customer || 'no_customer';
        actualSubscriptionId = session.subscription || 'no_subscription';
      } catch (stripeError) {
        console.error('❌ Error fetching Stripe session:', stripeError);
      }
    }
    
    const finalUserData = {
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
      stripe_customer_id: actualCustomerId,
      stripe_subscription_id: actualSubscriptionId,
      created_at: new Date().toISOString()
    };
    
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
      message: 'User account created successfully via proxy',
      user: data[0]
    });
    
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 404 HANDLER - MUST BE LAST
// ============================================================================

app.use((req, res) => {
  console.log('❌ 404 - Route not found:', req.method, req.path);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method,
    message: 'The requested endpoint does not exist'
  });
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = parseInt(process.env.PORT) || 8080;

const server = require('http').createServer(app).listen(PORT, '0.0.0.0', () => {
  server.keepAliveTimeout = 120000; // 2 minutes
  server.headersTimeout = 120000; // 2 minutes
  console.log(`🚀 IQCalorie bot running on port ${PORT}`);
  console.log(`✅ Server is ready to accept connections`);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
});



process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION:', err);
  process.exit(1);
});