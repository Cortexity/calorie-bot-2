/*************************************************************************
 *  Calorai WhatsApp Handler – Optimized GPT-4o + Supabase
 *************************************************************************/
const twilio = require('twilio');
const axios = require('axios');
const FormData = require('form-data');
const { createClient } = require('@supabase/supabase-js');

const sq = (c, g) => c/g < 0.4 ? '🟩' : c/g < 0.8 ? '🟧' : '🟥';

exports.handler = async (context, event, cb) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const { 
    ACCOUNT_SID: ACC, 
    AUTH_TOKEN: TOK, 
    OPENAI_API_KEY: OA, 
    SUPABASE_URL: SB_URL, 
    SUPABASE_KEY: SB_KEY 
  } = context;

  // Validate environment variables
  if (!ACC || !TOK || !OA || !SB_URL || !SB_KEY) {
    twiml.message('🚧 Configuration error');
    return cb(null, twiml);
  }

  const client = twilio(ACC, TOK);
  const db = createClient(SB_URL, SB_KEY);
  const phone = event.From.replace('whatsapp:', '');
  
  try {
    // Parallel execution setup
    const [goalsResponse, gptResponse] = await Promise.all([
      // Supabase query with timeout
      Promise.race([
        db.from('users')
          .select('kcal_goal, prot_goal, carb_goal, fat_goal')
          .eq('phone_number', phone)
          .single(),
        new Promise((_, reject) => 
          setTimeout(() => reject('Supabase Timeout'), 3000))
      ]),
      
      // GPT-4o processing
      processOpenAIRequest(context, event)
    ]);

    // Handle Supabase response
    const goals = goalsResponse.data || {
      kcal_goal: 2000,
      prot_goal: 150,
      carb_goal: 250,
      fat_goal: 70
    };

    // Process GPT response
    const reply = processGPTResponse(gptResponse.data, goals);
    
    // Send final message
    if (event.MediaUrl0) {
      await client.messages.create({
        from: event.To,
        to: event.From,
        body: reply
      });
      return cb();
    } else {
      twiml.message(reply);
      return cb(null, twiml);
    }

  } catch (error) {
    console.error('❌ Critical Error:', error);
    twiml.message('⚠️ Service temporary unavailable');
    return cb(null, twiml);
  }
};

// Helper functions
async function processOpenAIRequest(context, event) {
  // ... (existing OpenAI processing logic with 8000ms timeout)
}

function processGPTResponse(gptData, goals) {
  // ... (existing response processing with bars replacement)
}