// index.js

require('dotenv').config();

// Initialize OpenTelemetry + Logfire tracing
require('./tracing');

console.log('🚀 DEPLOYMENT VERSION: 2.1 - MEAL DESCRIPTIONS ADDED - ' + new Date().toISOString());

const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { MessagingResponse } = require('twilio').twiml;
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// Import OpenAI client for LangChain-style operations
const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================================
// REDIS SETUP FOR CONVERSATION MEMORY
// ============================================================================
const redis = require('redis');

let redisClient;
const initializeRedis = async () => {
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    await redisClient.connect();
    console.log('🧠 Redis connected successfully');
    
    // Test Redis functionality
    await redisClient.set('test_key', 'Redis working!');
    const testValue = await redisClient.get('test_key');
    console.log('🔧 Redis test:', testValue);
    
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    console.log('⚠️ Continuing without Redis - bot will be stateless');
    redisClient = null;
  }
};

// Initialize Redis on startup
initializeRedis();

// ============================================================================
// PHONE NUMBER NORMALIZATION
// ============================================================================

// Normalize phone number format for consistent Redis keys
const normalizePhoneNumber = (phone) => {
  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, '');
  
  // Ensure it starts with +
  if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }
  
  console.log('📞 Phone normalized:', phone, '->', normalized);
  return normalized;
};

// ============================================================================
// SESSION MANAGEMENT FUNCTIONS
// ============================================================================

// Generate unique session ID for each user
const generateSessionId = (phone) => {
  return `session:${phone}:${Date.now()}`;
};

// Track what type of question the bot last asked
const QUESTION_TYPES = {
  DESSERT_SUGGESTION: 'dessert_suggestion',
  GENERAL_FOLLOWUP: 'general_followup',
  CLARIFICATION: 'clarification',
  LIST_OFFERING: 'list_offering',
  SELECTION_FROM_LIST: 'selection_from_list',
  YES_NO_QUESTION: 'yes_no_question',
  NONE: 'none'
};

// Enhanced debug logging for conversation history
const debugConversationHistory = (userSession, stage, additionalInfo = {}) => {
  console.log(`\n🔍 CONVERSATION DEBUG - STAGE: ${stage}`);
  console.log(`📞 Phone: ${additionalInfo.phone || 'Unknown'}`);
  console.log(`📝 Current Message: "${additionalInfo.currentMessage || 'N/A'}"`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  
  if (!userSession) {
    console.log(`❌ No user session found`);
    return;
  }
  
  console.log(`📊 Session Info:`);
  console.log(`   - Session ID: ${userSession.sessionId}`);
  console.log(`   - Start Time: ${userSession.startTime}`);
  console.log(`   - Active Intent: ${userSession.activeIntent || 'None'}`);
  
  const history = userSession.conversationHistory || [];
  console.log(`📚 Conversation History Length: ${history.length}`);
  
  if (history.length === 0) {
    console.log(`   - No conversation history`);
  } else {
    console.log(`📜 Full Conversation History:`);
    history.forEach((exchange, index) => {
      console.log(`   [${index + 1}] ${exchange.timestamp}`);
      console.log(`       User: "${exchange.userMessage}"`);
      console.log(`       Bot:  "${exchange.botResponse?.substring(0, 100)}${exchange.botResponse?.length > 100 ? '...' : ''}"`);
      console.log(`       Type: ${exchange.messageType}`);
    });
  }
  
  // Show what the AI would see as context
  if (history.length > 0) {
    console.log(`\n🤖 AI CONTEXT THAT WOULD BE BUILT:`);
    const recentExchanges = history.slice(-3);
    recentExchanges.forEach((exchange, index) => {
      console.log(`   [${recentExchanges.length - index} exchanges ago]`);
      console.log(`   User: "${exchange.userMessage}"`);
      console.log(`   Your response: "${exchange.botResponse?.substring(0, 150)}..."`);
    });
  }
  
  console.log(`\n${'-'.repeat(80)}\n`);
};

// Debug intent classification with conversation context
const debugIntentClassification = (userMessage, contextHistory, classification) => {
  console.log(`\n🎯 INTENT CLASSIFICATION DEBUG`);
  console.log(`📝 User Message: "${userMessage}"`);
  console.log(`📚 Context History Available: ${contextHistory ? 'YES' : 'NO'}`);
  
  if (contextHistory) {
    console.log(`📖 Context Preview: "${contextHistory.substring(0, 200)}..."`);
  }
  
  console.log(`🎯 Classified Intent: ${classification.intent}`);
  console.log(`📊 Confidence: ${classification.confidence}`);
  console.log(`💭 Reasoning: ${classification.reasoning}`);
  console.log(`📋 Extracted Params:`, classification.extracted_params);
  
  // Special check for follow-up responses
  const isLikelyFollowUp = /^(yes|no|sure|okay|yep|nope|maybe|definitely|absolutely)$/i.test(userMessage.trim());
  if (isLikelyFollowUp) {
    console.log(`🚨 FOLLOW-UP DETECTED: "${userMessage}" looks like a response to a previous question`);
    if (!contextHistory) {
      console.log(`❌ BUT NO CONTEXT HISTORY PROVIDED TO CLASSIFIER!`);
    }
  }
  
  console.log(`\n${'-'.repeat(80)}\n`);
};

// Get or create user session
const getUserSession = async (phone) => {
  if (!redisClient) {
    console.log('❌ Redis client not available - no session management');
    return null;
  }
  
  try {
    const sessionKey = `user_session:${phone}`;
    console.log('🔍 Looking for session key:', sessionKey);
    
    const sessionData = await redisClient.get(sessionKey);
    console.log('📦 Raw session data from Redis:', sessionData ? 'Found data' : 'No data found');
    
    if (sessionData) {
      const parsed = JSON.parse(sessionData);
      console.log('📄 Retrieved existing session for:', phone);
      console.log('🔍 Session details:', {
        sessionId: parsed.sessionId,
        historyLength: parsed.conversationHistory?.length || 0,
        activeIntent: parsed.activeIntent,
        startTime: parsed.startTime
      });
      return parsed;
    } else {
      // Create new session
      const newSession = {
        sessionId: generateSessionId(phone),
        phone: phone,
        startTime: new Date().toISOString(),
        conversationHistory: [],
        activeIntent: null,
        pendingDetails: {},
        gatheredParams: {},
        lastBotAssumption: null,
        lastQuestionType: 'none',
        lastQuestionContext: null
      };
      
      // Store session with 2-hour expiry (7200 seconds)
      await redisClient.setEx(sessionKey, 7200, JSON.stringify(newSession));
      console.log('✨ Created new session for:', phone, '(2-hour TTL)');
      return newSession;
    }
  } catch (error) {
    console.error('❌ Error managing user session:', error);
    return null;
  }
};

// Update user session
const updateUserSession = async (phone, sessionData) => {
  if (!redisClient) {
    console.log('❌ Redis client not available - cannot update session');
    return false;
  }
  
  try {
    const sessionKey = `user_session:${phone}`;
    
    // ENFORCE 5-MESSAGE ROLLING WINDOW
    if (sessionData.conversationHistory && sessionData.conversationHistory.length > 5) {
      sessionData.conversationHistory = sessionData.conversationHistory.slice(-5);
      console.log('✂️ Trimmed conversation history to last 5 messages');
    }
    
    const serializedData = JSON.stringify(sessionData);
    
    console.log('💾 Updating session for:', phone);
    console.log('📊 Session data size:', serializedData.length, 'characters');
    console.log('🔍 Conversation history length:', sessionData.conversationHistory?.length || 0);
    
    // Store with 2-hour expiry (7200 seconds)
    await redisClient.setEx(sessionKey, 7200, serializedData);
    
    // Verify the data was stored
    const verification = await redisClient.get(sessionKey);
    if (verification) {
      console.log('✅ Session successfully stored and verified (2-hour TTL)');
      return true;
    } else {
      console.log('❌ Session storage verification failed');
      return false;
    }
  } catch (error) {
    console.error('❌ Error updating session:', error);
    console.error('Error details:', error.message);
    return false;
  }
};

// ============================================================================
// USER PROFILE CACHING SYSTEM
// ============================================================================

// Get cached user profile with fallback to Supabase
const getCachedUserProfile = async (phone) => {
  if (!redisClient) {
    // No Redis - fetch directly from Supabase
    return await fetchUserProfileFromSupabase(phone);
  }
  
  try {
    const profileKey = `user_profile:${phone}`;
    const cachedProfile = await redisClient.get(profileKey);
    
    if (cachedProfile) {
      console.log('⚡ Retrieved cached profile for:', phone);
      return JSON.parse(cachedProfile);
    } else {
      // Cache miss - fetch from Supabase and cache
      const profile = await fetchUserProfileFromSupabase(phone);
      if (profile) {
        // Cache for 2 hours (with auto-invalidation on updates)
        await redisClient.setEx(profileKey, 7200, JSON.stringify(profile));
        console.log('📦 Cached user profile for:', phone);
      }
      return profile;
    }
  } catch (error) {
    console.error('❌ Error with profile caching:', error);
    return await fetchUserProfileFromSupabase(phone);
  }
};

// ============================================================================
// MEAL HISTORY RETRIEVAL SYSTEM
// ============================================================================

// Get user's meal history for TODAY - ALWAYS from Supabase (no permanent caching)
const getUserMealHistory = async (phone, limit = 10) => {
  // REMOVED: Permanent Redis caching
  // Meal data should ONLY be temporarily cached during active LLM requests
  console.log('🎯 Fetching TODAY meal history directly from Supabase (no cache)');
  return await fetchMealHistoryFromSupabase(phone, limit);
};

// Fetch TODAY's meal history from Supabase
const fetchMealHistoryFromSupabase = async (phone, limit = 10) => {
  try {
    console.log('🔍 Fetching TODAY meal history from Supabase for:', phone);
    
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().slice(0, 10);
    const todayStart = `${today}T00:00:00`;
    const todayEnd = `${today}T23:59:59`;
    
    console.log('📅 Filtering meals for date:', today);
    
    const { data, error } = await db
      .from('meal_logs')
      .select('*')
      .eq('user_phone', phone)
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('❌ Error fetching meal history:', error);
      return [];
    }
    
    console.log('✅ Retrieved', data?.length || 0, 'meals from TODAY');
    return data || [];
    
  } catch (error) {
    console.error('❌ Error in fetchMealHistoryFromSupabase:', error);
    return [];
  }
};

// Clean up any temporary meal keys after operations
const cleanupTempMealKeys = async (phone) => {
  if (!redisClient) return;
  
  try {
    const normalizedPhone = normalizePhoneNumber(phone);
    const pattern = `temp:meals:${normalizedPhone}:*`;
    const keys = await redisClient.keys(pattern);
    
    if (keys.length > 0) {
      for (const key of keys) {
        await redisClient.del(key);
      }
      console.log('🧹 Cleaned up', keys.length, 'temporary meal keys for:', normalizedPhone);
    }
  } catch (error) {
    console.error('❌ Error cleaning up temp meal keys:', error);
  }
};

// Fetch user profile from Supabase
const fetchUserProfileFromSupabase = async (phone) => {
  try {
    const { data, error } = await db
      .from('users')
      .select('*')
      .eq('phone_number', phone)
      .single();
    
    if (error || !data) {
      console.log('❌ User profile not found in Supabase:', phone);
      return null;
    }
    
    console.log('✅ User profile fetched from Supabase');
    return data;
  } catch (error) {
    console.error('❌ Error fetching user profile:', error);
    return null;
  }
};

// Invalidate user profile cache (call after profile updates)
const invalidateUserProfileCache = async (phone) => {
  if (!redisClient) return;
  
  try {
    const normalizedPhone = normalizePhoneNumber(phone);
    const profileKey = `user_profile:${normalizedPhone}`;
    
    const deleted = await redisClient.del(profileKey);
    
    if (deleted > 0) {
      console.log('✅ User profile cache invalidated for:', normalizedPhone);
    } else {
      console.log('⚠️ No cache found to invalidate for:', normalizedPhone);
    }
  } catch (error) {
    console.error('❌ Error invalidating cache:', error);
  }
};

// ============================================================================
// STANDARDIZED DAILY PROGRESS SYSTEM
// ============================================================================

// Get standardized daily progress directly from Supabase
const getStandardizedDailyProgress = async (phone) => {
  try {
    console.log('📊 Fetching standardized daily progress from Supabase for:', phone);
    
    const today = new Date().toISOString().slice(0, 10);
    
    // Get user data with current daily totals
    const { data, error } = await db.rpc('get_user_data', { 
      p_phone: phone, 
      p_date: today 
    });
    
    if (error) {
      console.error('❌ Error fetching daily progress:', error);
      return null;
    }
    
    const row = data?.[0];
    if (!row) {
      console.log('⚠️ No daily progress data found for user');
      return null;
    }
    
    const goals = { 
      kcal: row.kcal_goal, 
      prot: row.prot_goal, 
      carb: row.carb_goal, 
      fat: row.fat_goal 
    };
    
    const used = { 
      kcal: row.kcal_used || 0, 
      prot: row.prot_used || 0, 
      carb: row.carb_used || 0, 
      fat: row.fat_used || 0 
    };
    
    console.log('📈 Daily progress data:', { used, goals });
    
    // Generate standardized progress display
    const progressDisplay = generateStandardizedProgressDisplay(used, goals);
    
    return {
      used,
      goals,
      progressDisplay,
      userData: row
    };
    
  } catch (error) {
    console.error('❌ Error in getStandardizedDailyProgress:', error);
    return null;
  }
};

// Generate standardized progress display format
function generateStandardizedProgressDisplay(used, goals) {
  // Traffic light function
  function getTrafficLight(percentage) {
    if (percentage >= 95) return '🔴';
    if (percentage > 70) return '🟠';
    return '🟢';
  }
  
  const kcalPct = Math.round((used.kcal / goals.kcal) * 100);
  const protPct = Math.round((used.prot / goals.prot) * 100);
  const carbPct = Math.round((used.carb / goals.carb) * 100);
  const fatPct = Math.round((used.fat / goals.fat) * 100);
  
  return `⏳ *Daily Progress:*

🔥${getTrafficLight(kcalPct)} *Calories:* ${used.kcal}/${goals.kcal} kcal
🥩${getTrafficLight(protPct)} *Proteins:* ${used.prot}/${goals.prot} g
🥔${getTrafficLight(carbPct)} *Carbs:* ${used.carb}/${goals.carb} g
🧈${getTrafficLight(fatPct)} *Fats:* ${used.fat}/${goals.fat} g

There's your progress update! How are you feeling about hitting your targets today?`;
}


// ============================================================================
// DAILY RESET SCHEDULER
// ============================================================================

let cron;
try {
  cron = require('node-cron');
  console.log('✅ node-cron loaded successfully');
} catch (error) {
  console.log('⚠️ node-cron not installed - daily reset disabled');
  cron = null;
}

// Schedule daily reset at midnight (00:00) every day
if (cron) {
  cron.schedule('0 0 * * *', async () => {
    console.log('🕛 DAILY RESET: Starting midnight reset at', new Date().toISOString());
  
    try {
      const today = new Date().toISOString().slice(0, 10);
    
    // Reset all users' daily totals to zero
    const { data, error } = await db
      .from('daily_totals')
      .update({
        kcal: 0,
        prot: 0,
        carb: 0,
        fat: 0,
      })
      .eq('date', today)
      .select('user_phone');
    
    if (error) {
      console.error('❌ Daily reset error:', error);
    } else {
      const resetCount = data ? data.length : 0;
      console.log(`✅ DAILY RESET: Successfully reset ${resetCount} users' daily totals`);
    }
    
  } catch (err) {
    console.error('❌ Daily reset failed:', err);
  }
}, {
  timezone: "Asia/Beirut"
});

console.log('⏰ Daily reset scheduler initialized - will run at midnight UTC');
} else {
console.log('⚠️ Daily reset scheduler disabled - node-cron not available');
}

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
    version: '2.1',
    timestamp: new Date().toISOString()
  });
});

// Simple test endpoint
app.get('/test', (req, res) => {
  console.log('🔍 GET /test endpoint hit');
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
// LANGCHAIN INTENT CLASSIFICATION SYSTEM
// ============================================================================

// Tool schemas for intent classification
const TOOL_SCHEMAS = {
  add_meal: {
    name: "add_meal",
    description: "Log a new meal or food item for the user",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "User's phone number" },
        meal_type: { 
          type: "string", 
          enum: ["breakfast", "lunch", "dinner", "snack"],
          description: "Type of meal" 
        },
        food_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Food item name" },
              quantity: { type: "number", description: "Quantity/amount" },
              unit: { type: "string", description: "Unit of measurement (g, cups, pieces, etc.)" }
            },
            required: ["name"]
          }
        }
      },
      required: ["user_id", "food_items"]
    }
  },
  
  get_daily_progress: {
    name: "get_daily_progress", 
    description: "Show standardized daily nutrition progress with traffic light indicators and goal tracking. Use this when user asks about progress, totals, how they're doing, or hitting their targets.",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "User's phone number" }
      },
      required: ["user_id"]
    }
  },

  get_meal_history: {
    name: "get_meal_history",
    description: "Show user's complete meal list for today with individual meal details. Use this when user asks things similar to 'what did I eat', 'show my meals', 'meal list', or 'food log'. Does NOT include daily progress totals.",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "User's phone number" }
      },
      required: ["user_id"]
    }
  },
  
  update_meal: {
    name: "update_meal",
    description: "Update or modify the most recent meal entry",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "User's phone number" },
        action: { type: "string", enum: ["replace"], description: "Update action" }
      },
      required: ["user_id", "action"]
    }
  },
  
  delete_meal: {
    name: "delete_meal",
    description: "Delete the most recent meal",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "User's phone number" }
      },
      required: ["user_id"]
    }
  },

  profile_change_attempt: {
    name: "profile_change_attempt",
    description: "User trying to change profile settings (diet, goals, weight, etc.)",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "User's phone number" },
        field_to_change: {
          type: "string",
          enum: ["diet_preference", "weight", "goals", "calories", "macros", "activity_level", "height", "age"],
          description: "What the user wants to change"
        },
        new_value: { type: "string", description: "Proposed new value" }
      },
      required: ["user_id", "field_to_change"]
    }
  },

  get_user_profile: {
    name: "get_user_profile", 
    description: "Display user's current profile information",
    parameters: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "User's phone number" },
        specific_field: { 
          type: "string", 
          description: "Specific field requested (optional)" 
        }
      },
      required: ["user_id"]
    }
  },
  
  no_tool_needed: {
    name: "no_tool_needed",
    description: "Respond conversationally without using any tools",
    parameters: {
      type: "object",
      properties: {
        response_type: { type: "string", description: "Type of response" }
      }
    }
  }
};

// Intent classification function
async function classifyIntentAndExtractParams(userMessage, conversationContext, userProfile, mUrl = null, mType = null, userSession = null) {
  // Pass the session context to help AI understand better
  const lastQuestionInfo = userSession?.lastQuestionType ? 
    `\nLAST BOT INTERACTION: The bot just asked a ${userSession.lastQuestionContext} question.` : '';
  
  const systemPrompt = `You are an expert intent classifier for a nutrition tracking app.
${lastQuestionInfo}

CRITICAL CLASSIFICATION PRIORITY:
1. ANY mention of food items (pasta, bread, eggs, cereal, etc.) = ALWAYS classify as add_meal
2. Food with quantities (2 eggs, 200g pasta) = ALWAYS add_meal
3. Past tense eating (had, ate, consumed) + food = ALWAYS add_meal
4. Only use no_tool_needed for actual conversation, NOT for food logging

CONTEXT UNDERSTANDING:
- Short affirmative responses are responding to the bot's last question
- Ordinal selections are selecting from the bot's last provided list
- Short negative responses are declining the bot's last offer

Analyze the user's message and determine which tool/action is needed:

- add_meal: User is logging food they consumed: ANY food mention, even single words like "pasta" or "bread" or other food items 
- update_meal: User is correcting/modifying a recent meal entry  
- delete_meal: User wants to remove a meal entry
- get_daily_progress: User wants to see their daily nutrition totals/progress
- get_meal_history: User wants to see what meals they've logged recently
- profile_change_attempt: User wants to modify their profile settings
- get_user_profile: User asks about their current profile information
- no_tool_needed: General conversation, recipes, meal suggestions, OR responses to bot questions

SEMANTIC CLASSIFICATION RULES:
FOOD ITEMS OVERRIDE: If the message contains ANY food item name, it's add_meal regardless of brevity.
Examples that MUST be add_meal:
- "pasta" → add_meal (don't ask for details)
- "had cereals" → add_meal (don't ask what kind)
- "just ate bread" → add_meal (don't ask how much)
- "2 eggs" → add_meal (has food + quantity)

Use the MEANING and CONTEXT behind the user's request (not just specific words), to determine the intent (VERY IMPORTANT RULE!):

DAILY PROGRESS intent (nutrition totals/goals):
- Any request about overall daily nutrition status and goal tracking
- Questions about hitting targets, daily totals, or progress percentages
- "Progress", "daily progress", "how am I doing", "my numbers", "daily totals", "am I on track"
- Shows traffic light indicators and goal percentages

MEAL HISTORY intent (list of meals):
- Any request about the LIST of foods they logged today
- Questions about seeing their meal entries or food log
- "What did I eat", "show my meals", "meal list", "food log", "what have I logged"
- Shows individual meals with their macros, NOT daily totals

MEAL OPERATIONS:
- Mentions eating/consuming food → add_meal
- Correcting previous entry → update_meal  
- Removing an entry → delete_meal

Default to the user's TRUE INTENT, regardless of exact wording.

USER PROFILE: ${userProfile ? JSON.stringify(userProfile, null, 2) : 'No profile data'}
CONVERSATION: ${conversationContext || 'No previous conversation'}

Respond ONLY with JSON:
{
  "intent": "tool_name",
  "confidence": 0.95,
  "extracted_params": {},
  "reasoning": "Brief explanation"
}`;

  try {
    console.log('🧠 INTENT CLASSIFICATION: Starting analysis...');
console.log('🔍 Analyzing message type - Image:', !!mUrl, 'Text:', userMessage || 'empty');

// Handle image-based messages
const messages = [
  { role: 'system', content: systemPrompt }
];

if (mUrl && mType && mType.startsWith('image/')) {
  console.log('📸 IMAGE DETECTED: Classifying as food image');
  // For food images, always classify as add_meal
  const imageClassification = {
    intent: 'add_meal',
    confidence: 0.95,
    extracted_params: {},
    reasoning: 'Food image detected - automatically classified as meal logging'
  };
  
  console.log('🎯 IMAGE INTENT DETECTED:', imageClassification.intent);
  console.log('📊 Confidence:', imageClassification.confidence);
  console.log('💭 Reasoning:', imageClassification.reasoning);
  
  return imageClassification;
} else {
  messages.push({ role: 'user', content: userMessage });
}

const response = await openai.chat.completions.create({
  model: 'gpt-5-chat-latest',
  messages: messages,
  max_tokens: 300,
  temperature: 0.1
});

    const classification = JSON.parse(response.choices[0].message.content);
    
    console.log('🎯 INTENT DETECTED:', classification.intent);
    console.log('📊 Confidence:', classification.confidence);
    console.log('💭 Reasoning:', classification.reasoning);
    
    return classification;
    
  } catch (error) {
    console.error('❌ Intent classification failed:', error);
    
    // Simple fallback
    const fallbackIntent = simpleIntentFallback(userMessage, conversationContext);
    return {
      intent: fallbackIntent,
      confidence: 0.6,
      extracted_params: {},
      reasoning: 'Fallback classification'
    };
  }
}

// Enhanced fallback intent detection with follow-up support
function simpleIntentFallback(message, contextHistory = '') {
  const msg = message.toLowerCase().trim();
  
  // Check for follow-up responses first
  const isFollowUp = /^(yes|yeah|yep|sure|okay|ok|definitely|absolutely|please|no|nope|nah|not really)$/i.test(msg);
  const isListSelection = /^(first|second|third|fourth|1st|2nd|3rd|4th|option 1|option 2|number one|number two|first one|second one)$/i.test(msg);
  
  if ((isFollowUp || isListSelection) && contextHistory) {
    // If it's a follow-up or list selection and we have context, treat as conversational
    console.log('🔄 FALLBACK: Follow-up or selection response detected with context');
    return 'no_tool_needed';
  }
  
  if (/^progress$|daily progress|show.*progress/.test(msg)) return 'show_progress';
  if (/delete|remove|didn't eat|cancel/.test(msg)) return 'delete_meal';
  if (/actually|instead|correction|meant/.test(msg)) return 'update_meal';
  if (/ate|had|eating|breakfast|lunch|dinner|snack/.test(msg)) return 'add_meal';
  
  return 'no_tool_needed';
}

// Universal context builder for all OpenAI calls
function buildContextAwareSystemPrompt(intent, userProfile, userSession, userFirstName) {
  const nameContext = userFirstName 
    ? `The user's name is ${userFirstName}. Use their name naturally in greetings and when appropriate, but don't overuse it.` 
    : ``;

  let userContext = '';
  if (userProfile) {
    userContext = `\n\nUSER PROFILE:
- Name: ${userProfile.first_name || 'Unknown'}
- Diet Preference: ${userProfile.diet_preference || 'None specified'}
- Fitness Goal: ${userProfile.fitness_goal || 'Not specified'}
- Activity Level: ${userProfile.activity_level || 'Unknown'}
- Age: ${userProfile.age || 'Unknown'}
- Height: ${userProfile.height_cm || 'Unknown'} cm
- Weight: ${userProfile.weight_kg || 'Unknown'} kg
- Target Weight: ${userProfile.target_weight_kg || 'Not set'} kg`;
  }

  let conversationContext = '';
  if (userSession?.conversationHistory && userSession.conversationHistory.length > 0) {
    conversationContext = '\n\nRECENT CONVERSATION HISTORY (for context and continuity):';
    
    const recentExchanges = userSession.conversationHistory.slice(-3);
    recentExchanges.forEach((exchange, index) => {
      conversationContext += `\n\n[${index + 1} exchanges ago]`;
      conversationContext += `\nUser: "${exchange.userMessage}"`;
      // Include MORE context from bot responses to preserve questions
      conversationContext += `\nYour response: "${exchange.botResponse.substring(0, 300)}..."`;
      if (exchange.questionAsked && exchange.questionAsked !== 'none') {
        conversationContext += `\n[Note: You asked a ${exchange.questionAsked} question here]`;
      }
    });
    
    // Add special context for follow-up responses
    if (userSession.lastQuestionType && userSession.lastQuestionType !== 'none') {
      conversationContext += `\n\nIMPORTANT: Your last message contained a ${userSession.lastQuestionContext} question. If the user says yes/no/sure, they are responding to THAT specific question.`;
    }
    
    conversationContext += '\n\nCONVERSATION RULES:\n- When user says "yes/no/sure/okay" - assume they mean your MOST RECENT question\n- Don\'t ask for clarification unless truly ambiguous\n- Be natural and conversational, not robotic\n- Don\'t say "I\'ll circle back" or "let me clarify" - just continue naturally';
  }

  // Base prompt with full context
  const basePrompt = `You are an expert nutrition tracking assistant for the IQ Calorie Whatsapp app. You specialize in analyzing food and providing accurate macro breakdowns. ${nameContext}${userContext}${conversationContext}
  
CONVERSATION STYLE:
- Be natural and conversational, like texting an empathetic friend
- When users say "yes/no/sure/okay" - they usually mean your most recent question
- Don't over-clarify or say "let me circle back" - just continue the conversation
- Use the conversation history to understand context, don't repeatedly ask for clarification
- If something is genuinely unclear, ask once, then assume the most logical interpretation

Core responsibilities:
- Analyze food photos and descriptions to estimate calories and macros
- Help users track their daily nutrition goals
- Answer questions about the user's profile, diet preferences, goals, and fitness data
- Provide supportive, motivational responses
- Always respond in English with a friendly, encouraging tone`;

  // Intent-specific instructions
  const intentInstructions = {
    add_meal: `
When users send meal inputs, create a meal log using this format every time:

✅ *Meal logged successfully!*

🍽️ *<MealType>:* <brief label>

🔥 *Calories:* <kcal> kcal  
🥩 *Proteins:* <g> g  
🥔 *Carbs:* <g> g  
🧈 *Fats:* <g> g

📝 *Assumptions:* give precise size and portion measurements with units in g/oz/mL, comma-separated, end with "Let me know if you'd like any adjustments 🙂"

⏳ *Daily Progress:*  
\${bars}

<one motivational sentence + ask them how they are feeling about their progress + relevant emoji>

!! NEVER use graphical bars manually. Only include the literal string "\${bars}".`,

    show_progress: `
The user is asking for their daily progress. Show them their current nutrition progress in a personalized, encouraging way. Reference their goals and profile when motivating them.`,

    delete_meal: `
The user wants to delete a recent meal. Acknowledge this action in a supportive way, and let them know their totals have been updated. Use their profile context to provide personalized encouragement.`,

    update_meal: `
The user wants to update or correct a recent meal entry. Handle this smoothly and naturally, using their profile context to provide appropriate guidance.`,

    no_tool_needed: `
The user is having a general conversation or asking about their profile/preferences. Use all available profile information to provide helpful, personalized responses. Answer any questions about their diet preferences, goals, stats, or other profile data naturally.`
  };

  return basePrompt + (intentInstructions[intent] || intentInstructions.no_tool_needed);
}

// Enhance parameters with context
function enhanceParametersWithContext(intent, extractedParams, userProfile) {
  console.log('🔧 ENHANCING PARAMETERS for intent:', intent);
  
  const enhanced = { ...extractedParams };
  
  // Add user_id to all tool calls
  if (intent !== 'no_tool_needed') {
    enhanced.user_id = userProfile?.phone_number || 'unknown';
  }
  
  // Auto-detect meal type for add_meal
  if (intent === 'add_meal' && !enhanced.meal_type) {
    const hour = new Date().getHours();
    if (hour < 11) enhanced.meal_type = 'breakfast';
    else if (hour < 16) enhanced.meal_type = 'lunch';  
    else if (hour < 20) enhanced.meal_type = 'dinner';
    else enhanced.meal_type = 'snack';
    
    console.log('🕒 Auto-detected meal type:', enhanced.meal_type);
  }
  
  console.log('✅ ENHANCED PARAMETERS:', JSON.stringify(enhanced, null, 2));
  return enhanced;
}

// Generate dashboard redirect messages for profile changes
function generateDashboardRedirectMessage(fieldToChange, userName) {
  const fieldMessages = {
    diet_preference: "diet preferences",
    weight: "current weight", 
    goals: "fitness goals",
    calories: "calorie targets",
    macros: "macro targets", 
    activity_level: "activity level",
    height: "height",
    age: "age"
  };

  const greeting = userName ? `Hi ${userName}! ` : '';
  const fieldName = fieldMessages[fieldToChange] || 'profile settings';

  return `${greeting}I see you want to update your ${fieldName}! 📝

You can update your profile anytime through your personal dashboard—it helps keep your info secure and accurate.

👉 Type */dashboard* to get your secure link

Once you update there, I'll automatically have your new information within seconds!

This ensures your data stays consistent across all systems (WhatsApp, dashboard, and billing). 🔒`;
}

// Handle profile change attempts with dashboard redirection
async function handleProfileChangeAttempt(intent, params, phone, userFirstName, userSession) {
  console.log('🚫 Profile change attempt blocked - redirecting to dashboard');
  console.log('📝 Field to change:', params.field_to_change);
  console.log('💭 Proposed value:', params.new_value);
  
  // Track attempt in session for analytics
  if (userSession) {
    if (!userSession.profileChangeAttempts) {
      userSession.profileChangeAttempts = [];
    }
    
    userSession.profileChangeAttempts.push({
      timestamp: new Date().toISOString(),
      field: params.field_to_change,
      attempted_value: params.new_value,
      redirected: true
    });
    
    userSession.lastDashboardRedirect = new Date().toISOString();
    userSession.dashboardRedirectCount = (userSession.dashboardRedirectCount || 0) + 1;
    
    console.log('📊 Dashboard redirect count for user:', userSession.dashboardRedirectCount);
  }
  
  // Generate personalized redirect message
  return generateDashboardRedirectMessage(params.field_to_change, userFirstName);
}

// Handle profile information requests
async function handleUserProfileRequest(intent, params, userProfile, userFirstName) {
  console.log('👤 Profile information request detected');
  
  if (!userProfile) {
    return `${userFirstName ? `Hi ${userFirstName}! ` : ''}I don't have your profile information available right now. Please try again in a moment or contact support if this persists.`;
  }

  const greeting = userFirstName ? `Hi ${userFirstName}! ` : '';
  
  // If specific field requested
  if (params.specific_field) {
    const field = params.specific_field.toLowerCase();
    
    if (field.includes('diet')) {
      const diet = userProfile.diet_preference || 'No preference set';
      return `${greeting}Your current diet preference is: **${diet}**

To update this, type */dashboard* for your secure settings panel! 🔧`;
    }
    
    if (field.includes('goal')) {
      const goal = userProfile.fitness_goal || 'No goal set';
      return `${greeting}Your current fitness goal is: **${goal}**

To update this, type */dashboard* for your secure settings panel! 🎯`;
    }
    
    if (field.includes('weight')) {
      const weight = userProfile.weight_kg || 'Not set';
      return `${greeting}Your current weight is: **${weight} kg**

To update this, type */dashboard* for your secure settings panel! ⚖️`;
    }
  }
  
  // Show full profile summary
  return `${greeting}Here's your current profile:

👤 **Name:** ${userProfile.first_name || 'Not set'} ${userProfile.last_name || ''}
🍽️ **Diet:** ${userProfile.diet_preference || 'No preference'}
🎯 **Goal:** ${userProfile.fitness_goal || 'Not set'}
⚖️ **Weight:** ${userProfile.weight_kg || 'Not set'} kg
📏 **Height:** ${userProfile.height_cm || 'Not set'} cm
🏃 **Activity:** ${userProfile.activity_level || 'Not set'}

🔥 **Daily Targets:**
- Calories: ${userProfile.kcal_goal || 'Not set'}
- Protein: ${userProfile.prot_goal || 'Not set'}g
- Carbs: ${userProfile.carb_goal || 'Not set'}g
- Fat: ${userProfile.fat_goal || 'Not set'}g

To update any of these, type */dashboard* for your secure settings panel! 🔧`;
}


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

const bars = (used, goals) => {
  const kcalPct = Math.round((used.kcal / goals.kcal) * 100);
  const protPct = Math.round((used.prot / goals.prot) * 100);
  const carbPct = Math.round((used.carb / goals.carb) * 100);
  const fatPct = Math.round((used.fat / goals.fat) * 100);
  
  // Traffic light function
  function getTrafficLight(percentage) {
    if (percentage >= 95) return '🔴';
    if (percentage > 70) return '🟠';
    return '🟢';
  }
  
  return `🔥${getTrafficLight(kcalPct)} *Calories:* ${used.kcal}/${goals.kcal} kcal
🥩${getTrafficLight(protPct)} *Proteins:* ${used.prot}/${goals.prot} g
🥔${getTrafficLight(carbPct)} *Carbs:* ${used.carb}/${goals.carb} g
🧈${getTrafficLight(fatPct)} *Fats:* ${used.fat}/${goals.fat} g`;
};

// 🔒 SECURITY: Verify user authorization and payment status
async function verifyUserAuthorization(phone) {
  console.log('🔍 Verifying user authorization for:', phone);
  
  try {
    // Check if user exists in database
    const { data: users, error } = await db
      .from('users')
      .select('id, phone_number, stripe_customer_id, stripe_subscription_id, email')
      .eq('phone_number', phone)
      .limit(1);
    
    if (error) {
      console.error('⚠️ Database error during verification:', error);
      return { authorized: false, reason: 'database_error' };
    }
    
    if (!users || users.length === 0) {
      console.log('🚫 UNAUTHORIZED: User not in database:', phone);
      return { authorized: false, reason: 'user_not_found' };
    }
    
    const user = users[0];
    
    // Check for valid Stripe data
    if (!user.stripe_customer_id || !user.stripe_subscription_id) {
      console.log('🚫 UNAUTHORIZED: User missing payment data:', phone);
      return { authorized: false, reason: 'missing_payment', user };
    }
    
    console.log('✅ User authorized:', phone);
    return { authorized: true, user };
    
  } catch (error) {
    console.error('⚠️ Authorization verification failed:', error);
    return { authorized: false, reason: 'verification_error' };
  }
}

// 🛡️ ABUSE PROTECTION: Track unauthorized attempts
const unauthorizedAttempts = new Map();

function trackUnauthorizedAttempt(phone) {
  const now = Date.now();
  const attempts = unauthorizedAttempts.get(phone) || [];
  
  // Clean old attempts (older than 1 hour)
  const recentAttempts = attempts.filter(time => now - time < 3600000);
  recentAttempts.push(now);
  
  unauthorizedAttempts.set(phone, recentAttempts);
  
  console.log(`🚨 Tracking: ${phone} made ${recentAttempts.length} unauthorized attempts in last hour`);
  
  if (recentAttempts.length > 10) {
    console.log(`🚨 HIGH-RISK ABUSER: ${phone} - ${recentAttempts.length} attempts`);
  }
  
  return recentAttempts.length;
}

// Manual daily reset endpoint for testing
app.post('/manual-reset', async (req, res) => {
  console.log('🔧 MANUAL RESET: Triggered at', new Date().toISOString());
  
  try {
    const today = new Date().toISOString().slice(0, 10);
    
    // Reset all users' daily totals to zero
    const { data, error } = await db
      .from('daily_totals')
      .update({
        kcal: 0,
        prot: 0,
        carb: 0,
        fat: 0,
      })
      .eq('date', today)
      .select('user_phone');
    
    if (error) {
      console.error('❌ Manual reset error:', error);
      return res.status(500).json({ error: 'Reset failed', details: error.message });
    }
    
    const resetCount = data ? data.length : 0;
    console.log(`✅ MANUAL RESET: Successfully reset ${resetCount} users' daily totals`);
    
    res.json({ 
      success: true, 
      message: `Successfully reset ${resetCount} users' daily totals`,
      resetAt: new Date().toISOString()
    });
    
  } catch (err) {
    console.error('❌ Manual reset failed:', err);
    res.status(500).json({ error: 'Reset failed', details: err.message });
  }
});

// ============================================================================
// MESSAGE CHUNKING UTILITIES
// ============================================================================

// Intelligently split long messages into WhatsApp-friendly chunks
function splitMessageIntelligently(message, maxLength = 1500) {
  if (message.length <= maxLength) {
    return [message];
  }
  
  const chunks = [];
  let currentChunk = '';
  
  // Split by paragraphs first (double newlines)
  const paragraphs = message.split('\n\n');
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed limit
    if (currentChunk.length + paragraph.length + 2 > maxLength) {
      // Save current chunk if it has content
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // If paragraph itself is too long, split by sentences
      if (paragraph.length > maxLength) {
        const sentences = splitLongParagraph(paragraph, maxLength);
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length + 1 > maxLength) {
            if (currentChunk.trim()) {
              chunks.push(currentChunk.trim());
              currentChunk = '';
            }
          }
          currentChunk += (currentChunk ? ' ' : '') + sentence;
        }
      } else {
        currentChunk = paragraph;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  console.log('📋 Message chunking summary:', {
    originalLength: message.length,
    chunks: chunks.length,
    chunkSizes: chunks.map(chunk => chunk.length)
  });
  
  return chunks;
}

// Split overly long paragraphs by sentences
function splitLongParagraph(paragraph, maxLength) {
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length + 1 > maxLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // If single sentence is still too long, force split
      if (sentence.length > maxLength) {
        const forceSplit = sentence.match(new RegExp(`.{1,${maxLength - 10}}`, 'g')) || [sentence];
        chunks.push(...forceSplit);
      } else {
        currentChunk = sentence;
      }
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// ============================================================================
// WHATSAPP WEBHOOK
// ============================================================================

app.post('/webhook', async (req, res) => {
  const twiml = new MessagingResponse();
  const from = req.body.From;
  const bodyText = req.body.Body || '';
  const mUrl = req.body.MediaUrl0;
  const mType = req.body.MediaContentType0 || '';
  const isImg = mType.startsWith('image/');
  const isAudio = mType.startsWith('audio/');

  console.log('🔥 WEBHOOK HIT:', {
    From: from, Body: bodyText.slice(0, 50), Img: isImg, Audio: isAudio
  });

  const rawPhone = from.replace('whatsapp:', '');
  const phone = normalizePhoneNumber(rawPhone);
  console.log('📞 Phone normalization:', rawPhone, '->', phone);
  
  // 🔒 SECURITY CHECK: Verify user authorization FIRST
  const authResult = await verifyUserAuthorization(phone);
  
  if (!authResult.authorized) {
    // Track this unauthorized attempt
    const attemptCount = trackUnauthorizedAttempt(phone);
    
    console.log('🚫 SILENT BLOCK: Ignoring unauthorized user');
    console.log('   - Phone:', phone);
    console.log('   - Reason:', authResult.reason);
    console.log('   - Attempts:', attemptCount);
    console.log('   - Action: Complete ignore (no response sent)');
    console.log('   - Protection: Saving OpenAI API costs');
    
    // 🚨 IMPORTANT: Return empty TwiML response (no message sent)
    return res.type('text/xml').send('<Response></Response>');
  }
  
  console.log('✅ AUTHORIZED USER - Processing message');
  console.log(`   - Phone: ${phone}`);
  console.log(`   - User ID: ${authResult.user.id}`);

  // ============================================================================
  // INTELLIGENT SESSION & CONTEXT MANAGEMENT WITH CACHING
  // ============================================================================
  
  // Initialize conversation context with cached profile
  let userSession = await getUserSession(phone);
  let userProfile = await getCachedUserProfile(phone);
  
  console.log('🧠 CONTEXT LOADED:', {
    hasSession: !!userSession,
    hasProfile: !!userProfile,
    activeIntent: userSession?.activeIntent,
    conversationLength: userSession?.conversationHistory?.length || 0,
    userName: userProfile?.first_name || 'Unknown'
  });

  // ============================================================================
  // REDIS CACHE VISIBILITY - CLEAN VIEW OF ALL MESSAGES
  // ============================================================================

  if (userSession?.conversationHistory && userSession.conversationHistory.length > 0) {
    console.log('\n📦 REDIS CACHE - ALL MESSAGES:');
    userSession.conversationHistory.forEach((exchange, index) => {
      const userMsg = exchange.userMessage.substring(0, 50);
      const botMsg = exchange.botResponse.substring(0, 50);
      console.log(`  [${index + 1}/${userSession.conversationHistory.length}] User: "${userMsg}..." | Bot: "${botMsg}..."`);
    });
    console.log(`✅ Total in cache: ${userSession.conversationHistory.length}/5 messages\n`);
  } else {
    console.log('📦 REDIS CACHE: Empty (no conversation history)\n');
  }

  // ============================================================================
  // REDIS HEALTH CHECK & SESSION DEBUG
  // ============================================================================
  
  // Check Redis connection health
  if (redisClient) {
    try {
      await redisClient.ping();
      console.log('💚 Redis connection healthy');
      
      // List all session keys for debugging
      const allKeys = await redisClient.keys('user_session:*');
      console.log('🗄️ Total sessions in Redis:', allKeys.length);
      console.log('🔑 Session keys:', allKeys);
      
    } catch (redisError) {
      console.error('💔 Redis connection issue:', redisError);
    }
  } else {
    console.log('💔 Redis client is null - sessions disabled');
  }

  // Get user's first name from cached profile (faster than separate DB query)
  let userFirstName = userProfile?.first_name || null;
  if (userFirstName) {
    console.log('⚡ User first name from cache:', userFirstName);
  } else {
    console.log('🔍 No first name found in cached profile');
  }

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

    // ============================================================================
    // COMMAND DETECTION - Handle WhatsApp commands before OpenAI processing
    // ============================================================================
    
    if (text && text.startsWith('/')) {
      const command = text.toLowerCase().trim();
      
      if (command === '/' || command === '/help') {
        // Show command menu when user types just "/"
        twiml.message(`Available commands:

- */dashboard* - Get your personal dashboard link  
- */support* - Get support contact information

Just type any command to use it!`);
        return res.type('text/xml').send(twiml.toString());
      }
      
      else if (command === '/dashboard') {
        console.log('🔗 Dashboard command received from:', phone);
        
        try {
          // Generate dashboard link
          const dashboardResponse = await axios.post(`${process.env.BASE_URL || 'http://localhost:8080'}/api/generate-dashboard-link`, {
            phone_number: phone
          });
                                                                                                 
          const { dashboard_url, user_name } = dashboardResponse.data;
          
          const dashboardMessage = `Hi ${user_name || 'there'}! 👋

🔗 Access your personal dashboard here:
${dashboard_url}

From your dashboard you can:
- Update your profile information
- Adjust your calorie and macro goals  
- Manage your subscription
- View your account details

This link is personalized for your account. Keep it secure!`;

          twiml.message(dashboardMessage);
          return res.type('text/xml').send(twiml.toString());
          
        } catch (error) {
          console.error('❌ Error generating dashboard link:', error);
          twiml.message('Sorry, I had trouble generating your dashboard link. Please try again later or contact support.');
          return res.type('text/xml').send(twiml.toString());
        }
      }
      
      else if (command === '/support') {
        console.log('📞 Support command received from:', phone);
        
        try {
          const supportResponse = await axios.get(`${process.env.BASE_URL || 'http://localhost:8080'}/api/support-info`);
          const { support_message, support_phone, support_hours } = supportResponse.data;
          
          const supportMessage = `${support_message}

📲💬 WhatsaApp Only: ${support_phone}
🕒 ${support_hours}
`;

          twiml.message(supportMessage);
          return res.type('text/xml').send(twiml.toString());
          
        } catch (error) {
          console.error('❌ Error getting support info:', error);
          twiml.message('📞 Need help? Contact our support team at +1234567890 or reply to this chat!');
          return res.type('text/xml').send(twiml.toString());
        }
      }
      
      else {
        // Unknown command
        twiml.message(`
Available commands:
- */dashboard* - Get your personal dashboard link
- */support* - Get support contact information

💡 Tip: Just type / to see available commands, or type any command manually!`);
        return res.type('text/xml').send(twiml.toString());
      }
    }

    // ============================================================================
    // BUILD CONTEXT-AWARE PROMPT WITH CONVERSATION HISTORY
    // ============================================================================
    
    // Build conversation history context
    let conversationContext = '';
    if (userSession?.conversationHistory && userSession.conversationHistory.length > 0) {
      conversationContext = '\n\nRECENT CONVERSATION HISTORY (for context and continuity):';
      
      // Show last 3 exchanges for context
      const recentExchanges = userSession.conversationHistory.slice(-3);
      recentExchanges.forEach((exchange, index) => {
        conversationContext += `\n\n[${index + 1} exchanges ago]`;
        conversationContext += `\nUser: "${exchange.userMessage}"`;
        conversationContext += `\nYour response: "${exchange.botResponse.substring(0, 150)}..."`;
      });
      
      conversationContext += '\n\nCONVERSATION RULES:\n- When user says "yes/no/sure/okay" - assume they mean your MOST RECENT question\n- Don\'t ask for clarification unless truly ambiguous\n- Be natural and conversational, not robotic\n- Don\'t say "I\'ll circle back" or "let me clarify" - just continue naturally';
      
      console.log('🧠 Including conversation history:', userSession.conversationHistory.length, 'exchanges');
      console.log('📝 Conversation context preview:', conversationContext.substring(0, 300) + '...');
    } else {
      console.log('🔍 No conversation history available');
    }
    
    // Build user profile context
    let userContext = '';
    if (userProfile) {
      userContext = `\n\nUSER PROFILE:
- Name: ${userProfile.first_name || 'Unknown'}
- Diet Preference: ${userProfile.diet_preference || 'None specified'}
- Fitness Goal: ${userProfile.fitness_goal || 'Not specified'}
- Activity Level: ${userProfile.activity_level || 'Unknown'}`;
      console.log('👤 Including user profile context');
    }

    const today = new Date().toISOString().slice(0, 10);

    // User is already verified as authorized, get their data
    let { data, error } = await db.rpc('get_user_data', { p_phone: phone, p_date: today });
    if (error) console.error('⚠️ Supabase RPC error:', error);

    let row = data?.[0];
    if (!row) {
      console.error('⚠️ Authorized user has no data in get_user_data RPC');
      twiml.message('⚠️ Account error. Please contact support.');
      return res.type('text/xml').send(twiml.toString());
    }

    const goals = { kcal: row.kcal_goal, prot: row.prot_goal, carb: row.carb_goal, fat: row.fat_goal };
    const used = { kcal: row.kcal_used, prot: row.prot_used, carb: row.carb_used, fat: row.fat_used };

    // ============================================================================f
    // ENHANCED AI PROCESSING WITH LANGCHAIN INTENT CLASSIFICATION
    // ============================================================================
    
    console.log('🧠 STARTING ENHANCED AI PROCESSING WITH LANGCHAIN');
    
    // Build conversation history context - ENHANCED for better follow-up understanding
    const contextHistory = userSession?.conversationHistory 
      ? userSession.conversationHistory.slice(-3).map(exchange => {
          // For images, use the bot's response to infer what the user asked about
          const userMsg = exchange.userMessage === '[image]' 
            ? 'User sent food image' 
            : exchange.userMessage;
          // Include MORE of the bot response to preserve question context
          return `User: ${userMsg}\nBot: ${exchange.botResponse.substring(0, 250)}`;
        }).join('\n\n')
      : '';
    
    // Check if this is a follow-up response to a specific question type
    const isFollowUpResponse = /^(yes|yeah|yep|sure|okay|ok|no|nope|nah|not really|definitely|absolutely|please)$/i.test(text?.trim() || '');
    
    if (isFollowUpResponse && userSession?.lastQuestionType) {
      console.log('🔄 FOLLOW-UP DETECTED:', {
        response: text,
        lastQuestionType: userSession.lastQuestionType,
        lastQuestionContext: userSession.lastQuestionContext
      });
    }
    
    // Classify intent and extract parameters
    const intentClassification = await classifyIntentAndExtractParams(
      text, 
      contextHistory, 
      userProfile,
      mUrl,
      mType,
      userSession
    );
    
    console.log('🎯 FINAL INTENT:', intentClassification.intent);
    console.log('📊 CONFIDENCE:', intentClassification.confidence);
    
    // Enhance parameters with user context
    const enhancedParams = enhanceParametersWithContext(
      intentClassification.intent,
      intentClassification.extracted_params,
      userProfile
    );
    
    // Execute the appropriate action based on intent
    let reply;
    
    // ============================================================================
    // UNIVERSAL CONTEXT-AWARE RESPONSE GENERATION
    // ============================================================================
    
    console.log('🎭 GENERATING CONTEXT-AWARE RESPONSE for intent:', intentClassification.intent);
    
    // Build context-aware system prompt for this intent
    const contextAwarePrompt = buildContextAwareSystemPrompt(
      intentClassification.intent,
      userProfile,
      userSession,
      userFirstName
    );
    
    // Prepare messages array with full context
    const contextualMsgs = [{
      role: 'system',
      content: contextAwarePrompt
    }];

    if (isImg && mUrl) {
      const auth = { Authorization: 'Basic ' + Buffer.from(`${ACC}:${TOK}`).toString('base64') };
      const img = await axios.get(mUrl, { responseType: 'arraybuffer', headers: auth });
      const b64 = Buffer.from(img.data, 'binary').toString('base64');
      contextualMsgs.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mType};base64,${b64}` } },
          { type: 'text', text: 'Log this meal using the standardized format with 18 words or less strictly of analysis commentary on top of the standardized format. ' }
        ]
      });
    } else if (text) {
      contextualMsgs.push({ role: 'user', content: text });
    } else {
      contextualMsgs.push({ role: 'user', content: 'Hi' });
    }
    
    console.log('💰 MAKING CONTEXT-AWARE OPENAI API CALL for intent:', intentClassification.intent);
    const contextualGpt = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-5-chat-latest',
      messages: contextualMsgs,
      max_tokens: 700,
      temperature: 0.1
    }, { headers: { Authorization: `Bearer ${OA_KEY}` } });
    
    reply = contextualGpt.data.choices[0].message.content;
    console.log('🎭 Context-aware response generated for', intentClassification.intent);
    
    console.log('🎭 FINAL RESPONSE GENERATED:', reply.substring(0, 100) + '...');

    // ============================================================================
    // UPDATE CONVERSATION HISTORY WITH CURRENT EXCHANGE
    // ============================================================================
    
    if (userSession) {
      // Detect if bot asked a question in its response - ENHANCED detection
      let questionType = 'none';
      let questionContext = null;
      let listItems = null;
      
      if (reply) {
        // Check for list offerings first
        if (/do you want me to (put together|create|make|give you) a.*list/i.test(reply) ||
            /would you like me to.*list/i.test(reply)) {
          questionType = QUESTION_TYPES.LIST_OFFERING;
          questionContext = 'offering to create a list';
          console.log('📋 Bot offered to create a list');
        }
        // Check if bot provided numbered/bulleted options
        else if (/\*\*1\.|^1\.|#1/m.test(reply) || /first.*option.*second.*option/i.test(reply)) {
          questionType = QUESTION_TYPES.SELECTION_FROM_LIST;
          questionContext = 'provided list for selection';
          // Try to extract list items
          const listMatches = reply.match(/(?:\*\*|^)(\d+\..*?)(?=\n|$)/gm);
          if (listMatches) {
            listItems = listMatches.map(item => item.trim());
            console.log('📝 Bot provided list with', listItems.length, 'items');
          }
        }
        // Dessert suggestion
        else if (/would you like me to (suggest|recommend) a (dessert|sweet)/i.test(reply)) {
          questionType = QUESTION_TYPES.DESSERT_SUGGESTION;
          questionContext = 'dessert suggestion';
          console.log('🍰 Bot asked about dessert suggestion');
        }
        // Yes/No questions
        else if (/\?[\s]*$/m.test(reply) && /\b(do you want|would you like|shall I|should I|can I)\b/i.test(reply)) {
          questionType = QUESTION_TYPES.YES_NO_QUESTION;
          questionContext = 'yes/no question';
          console.log('❓ Bot asked a yes/no question');
        }
        // General follow-up
        else if (/would you like|do you want|shall I/i.test(reply)) {
          questionType = QUESTION_TYPES.GENERAL_FOLLOWUP;
          questionContext = 'general follow-up';
          console.log('❓ Bot asked a general follow-up question');
        }
      }
      
      // Store the question type and any list items for next interaction
      userSession.lastQuestionType = questionType;
      userSession.lastQuestionContext = questionContext;
      if (listItems) {
        userSession.lastListItems = listItems;
      }
      
      // Store the question type for next interaction
      userSession.lastQuestionType = questionType;
      userSession.lastQuestionContext = questionContext;
      
      // Add this exchange to conversation history
      userSession.conversationHistory.push({
        timestamp: new Date().toISOString(),
        userMessage: text || (isImg ? '[image]' : '[audio]'),
        botResponse: reply,
        messageType: isImg ? 'image' : (isAudio ? 'audio' : 'text'),
        macrosLogged: null,
        questionAsked: questionType  // Track what question was asked
      });
      
     
      // Note: 5-message limit enforced in updateUserSession
      console.log('📝 Conversation history updated with current exchange - Length:', userSession.conversationHistory.length);
    }

    // ============================================================================
    // INTENT-BASED RESPONSE HANDLING
    // ============================================================================

    console.log('🎯 LangChain classified intent:', intentClassification.intent);
    console.log('📊 Confidence level:', intentClassification.confidence);

    // Handle profile change attempts with dashboard redirection
    if (intentClassification.intent === 'profile_change_attempt') {
      console.log('🚫 PROFILE CHANGE BLOCKED - Redirecting to dashboard');
      
      reply = await handleProfileChangeAttempt(
        intentClassification.intent,
        enhancedParams,
        phone,
        userFirstName,
        userSession
      );
      
      // Skip normal AI processing for profile changes
    } 
    // Handle profile information requests
    else if (intentClassification.intent === 'get_user_profile') {
      console.log('👤 PROFILE INFO REQUEST - Showing cached data');
      
      reply = await handleUserProfileRequest(
        intentClassification.intent,
        enhancedParams,
        userProfile,
        userFirstName
      );
      
      // Skip normal AI processing for profile requests
    }
    // Handle meal updates with database modification and temporary injection
    else if (intentClassification.intent === 'update_meal') {
      console.log('🔧 MEAL UPDATE REQUEST - Using temporary meal injection');
      
      // STEP 1: Fetch the most recent meal from Supabase
      const recentMeals = await getUserMealHistory(phone, 1);
      
      if (!recentMeals || recentMeals.length === 0) {
        reply = "I don't see any recent meals to update. Please log a meal first, then I can help you adjust it! 🍽️";
      } else {
        const lastMeal = recentMeals[0];
        console.log('🎯 Updating meal:', lastMeal.meal_description, 'ID:', lastMeal.id);
        
        // STEP 2: Temporarily store in Redis (5-min TTL as safety)
        let tempKey = null;
        if (redisClient) {
          tempKey = `temp:meals:${phone}:${Date.now()}`;
          await redisClient.setEx(tempKey, 300, JSON.stringify([lastMeal]));
          console.log('📦 TEMP: Stored meal data in Redis:', tempKey);
        }
        
        // STEP 3: Generate updated meal with AI using standardized format
        const contextualMsgs = [{
          role: 'system',
          content: buildContextAwareSystemPrompt(intentClassification.intent, userProfile, userSession, userFirstName) + 
          `\n\nCURRENT MEAL TO UPDATE: ${lastMeal.meal_description} (${lastMeal.kcal} kcal, ${lastMeal.prot}g protein, ${lastMeal.carb}g carbs, ${lastMeal.fat}g fat)\n\nUser wants to adjust this meal. Generate the updated version using this EXACT format:

✅ *Meal updated successfully!*

🍽️ *<MealType>:* <updated meal description>
🔥 *Calories:* <kcal> kcal
🥩 *Proteins:* <g> g
🥔 *Carbs:* <g> g
🧈 *Fats:* <g> g

🔔 *Assumptions:* We've updated this to <explain what changed>. Let me know if anything else needs adjusting! 😊

⏳ *Daily Progress:*
\${bars}

<motivational sentence about the update + ask how their day is going + relevant emoji>

!! NEVER use graphical bars manually. Only include the literal string "\${bars}".`
        }];

        if (text) {
          contextualMsgs.push({ role: 'user', content: text });
        }
        
        console.log('💰 MAKING OPENAI API CALL for meal update');
        const updateResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-5-chat-latest',
          messages: contextualMsgs,
          max_tokens: 700,
          temperature: 0.1
        }, { headers: { Authorization: `Bearer ${OA_KEY}` } });
        
        reply = updateResponse.data.choices[0].message.content;
        console.log('🎭 Update response generated');
        
        // Extract NEW macros from the AI response
        const flat = reply.replace(/\n/g, ' ');
        const macroRegex = /Calories[^\d]*(\d+)[^]*?Proteins[^\d]*(\d+)[^]*?Carbs[^\d]*(\d+)[^]*?Fats[^\d]*(\d+)/i;
        const match = flat.match(macroRegex);
        
        if (match) {
          const [_, newKcal, newProt, newCarb, newFat] = match.map(Number);
          
          console.log('🔄 UPDATING DATABASE:', {
            oldValues: { kcal: lastMeal.kcal, prot: lastMeal.prot, carb: lastMeal.carb, fat: lastMeal.fat },
            newValues: { kcal: newKcal, prot: newProt, carb: newCarb, fat: newFat }
          });
          
          // Update meal_logs record
          const { error: updateError } = await db
            .from('meal_logs')
            .update({
              kcal: newKcal,
              prot: newProt,
              carb: newCarb,
              fat: newFat,
            })
            .eq('id', lastMeal.id);
          
          if (updateError) {
            console.error('❌ Failed to update meal_logs:', updateError);
          } else {
            console.log('✅ meal_logs updated successfully');
            
            // Calculate difference for daily totals
            const kcalDiff = newKcal - lastMeal.kcal;
            const protDiff = newProt - lastMeal.prot;
            const carbDiff = newCarb - lastMeal.carb;
            const fatDiff = newFat - lastMeal.fat;
            
            console.log('📊 Daily totals adjustment:', { kcalDiff, protDiff, carbDiff, fatDiff });
            
            // Update daily totals with the difference
            if (kcalDiff !== 0 || protDiff !== 0 || carbDiff !== 0 || fatDiff !== 0) {
              const { error: totalsError } = await db.rpc('increment_daily_totals', {
                p_phone: phone,
                p_date: today,
                p_kcal: kcalDiff,
                p_prot: protDiff,
                p_carb: carbDiff,
                p_fat: fatDiff
              });
              
              if (totalsError) {
                console.error('❌ Failed to update daily totals:', totalsError);
              } else {
                console.log('✅ Daily totals updated with difference');
                
                // Update local used values for progress bars
                used.kcal += kcalDiff;
                used.prot += protDiff;
                used.carb += carbDiff;
                used.fat += fatDiff;
              }
            }
            
            // Clean up any temporary meal keys
            await cleanupTempMealKeys(phone);
            console.log('🧹 Temporary meal keys cleaned after update');
          }
        } else {
          console.log('⚠️ Could not extract macros from update response');
        }
      }
      // Replace progress bars with actual data
      reply = reply.replace(/\$\{(progress_bars|bars)\}/g, bars(used, goals));
      
      // Skip normal AI processing since we handled it above
    }

    // Handle meal deletions with database modification and temporary injection
    else if (intentClassification.intent === 'delete_meal') {
      console.log('🗑️ MEAL DELETE REQUEST - Using temporary meal injection');
      
      // STEP 1: Fetch the most recent meal from Supabase
      const recentMeals = await getUserMealHistory(phone, 1);
      
      if (!recentMeals || recentMeals.length === 0) {
        reply = "I don't see any recent meals to delete. Please log a meal first! 🍽️";
      } else {
        const lastMeal = recentMeals[0];
        console.log('🎯 Deleting meal:', lastMeal.meal_description, 'ID:', lastMeal.id);
        
        // STEP 2: Temporarily store in Redis (5-min TTL as safety)
        let tempKey = null;
        if (redisClient) {
          tempKey = `temp:meals:${phone}:${Date.now()}`;
          await redisClient.setEx(tempKey, 300, JSON.stringify([lastMeal]));
          console.log('📦 TEMP: Stored meal data in Redis:', tempKey);
        }
        console.log('📊 Meal macros to subtract:', { 
          kcal: lastMeal.kcal, 
          prot: lastMeal.prot, 
          carb: lastMeal.carb, 
          fat: lastMeal.fat 
        });
        
        // Delete from meal_logs table
        const { error: deleteError } = await db
          .from('meal_logs')
          .delete()
          .eq('id', lastMeal.id);
        
        if (deleteError) {
          console.error('❌ Failed to delete meal_logs:', deleteError);
          reply = "I had trouble deleting that meal. Please try again in a moment.";
        } else {
          console.log('✅ Meal deleted successfully from meal_logs');
          
          // Subtract the meal's macros from daily totals
          const { error: totalsError } = await db.rpc('increment_daily_totals', {
            p_phone: phone,
            p_date: today,
            p_kcal: -lastMeal.kcal,  // Negative to subtract
            p_prot: -lastMeal.prot,
            p_carb: -lastMeal.carb,
            p_fat: -lastMeal.fat
          });
          
          if (totalsError) {
            console.error('❌ Failed to update daily totals after deletion:', totalsError);
          } else {
            console.log('✅ Daily totals updated after meal deletion');
            
            // Update local used values for progress bars
            used.kcal -= lastMeal.kcal;
            used.prot -= lastMeal.prot;
            used.carb -= lastMeal.carb;
            used.fat -= lastMeal.fat;
          }
          
          // Clean up any temporary meal keys
          await cleanupTempMealKeys(phone);
          console.log('🔄 Meal history cache invalidated after deletion');
          
          // Generate confirmation message using standardized format
          const contextualMsgs = [{
            role: 'system',
            content: buildContextAwareSystemPrompt(intentClassification.intent, userProfile, userSession, userFirstName) + 
            `\n\nDELETED MEAL: ${lastMeal.meal_description} (${lastMeal.kcal} kcal, ${lastMeal.prot}g protein, ${lastMeal.carb}g carbs, ${lastMeal.fat}g fat)\n\nGenerate a confirmation using this EXACT format:

✅ *Meal "${lastMeal.meal_description}" removed from today's log${userFirstName ? `, ${userFirstName}` : ''}.*

⏳ *Daily Progress:*

\${bars}

<brief supportive message asking if they need anything else>

!! NEVER use graphical bars manually. Only include the literal string "\${bars}".`
          }];

          if (text) {
            contextualMsgs.push({ role: 'user', content: text });
          }
          
          console.log('💰 MAKING OPENAI API CALL for delete confirmation');
          const deleteResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-5-chat-latest',
            messages: contextualMsgs,
            max_tokens: 400,
            temperature: 0.1
          }, { headers: { Authorization: `Bearer ${OA_KEY}` } });
          
          reply = deleteResponse.data.choices[0].message.content;
          console.log('🎭 Delete confirmation response generated');
          
          // STEP 4: IMMEDIATELY delete temp data after LLM response
          if (tempKey && redisClient) {
            const deleted = await redisClient.del(tempKey);
            console.log('🗑️ TEMP: Immediately deleted meal data from Redis:', tempKey, '- Deleted:', deleted);
          }
          
          console.log('✅ Temporary injection complete - Redis is clean');
        }
      }

      // Replace progress bars with actual data
      reply = reply.replace(/\$\{(progress_bars|bars)\}/g, bars(used, goals));
      
      // Skip normal AI processing since we handled it above
    }

    // Handle get_meal_history intent - Show today's meals in standardized format
    else if (intentClassification.intent === 'get_meal_history') {
      console.log('🍽️ MEAL HISTORY REQUEST - Fetching today meals');
      
      // Get today's meal history from Supabase
      const todaysMeals = await getUserMealHistory(phone, 20);
      
      if (!todaysMeals || todaysMeals.length === 0) {
        reply = `You haven't logged any meals yet today, ${userFirstName || ''}! 📝

Ready to start tracking? Just send me a photo of your meal or describe what you ate! 📸🍽️`;
      } else {
        // Build standardized meal history format
        let mealHistoryText = `Here's your meal history for today:\n\n`;
        
        todaysMeals.forEach((meal, index) => {
          mealHistoryText += `🍽️ Meal ${index + 1}: ${meal.meal_description}\n`;
          mealHistoryText += `🔥 Calories: ${meal.kcal} kcal\n`;
          mealHistoryText += `🥩 Proteins: ${meal.prot} g\n`;
          mealHistoryText += `🥔 Carbs: ${meal.carb} g\n`;
          mealHistoryText += `🧈 Fats: ${meal.fat} g\n\n`;
        });
        
        // Add friendly closing
        mealHistoryText += `That's everything you've logged today! 📝`;
        
        reply = mealHistoryText;
        console.log('✅ Standardized meal history generated with', todaysMeals.length, 'meals');
      }
      
      // Skip normal AI processing
    }


    // Handle show_progress with TEMPORARY meal data injection
    else if (intentClassification.intent === 'show_progress') {
      console.log('📊 SHOW PROGRESS - Using temporary meal data injection');
      
      // STEP 1: Fetch meal data from Supabase (source of truth)
      const mealHistory = await getUserMealHistory(phone, 10);
      console.log('✅ Fetched', mealHistory.length, 'meals from Supabase');
      
      // STEP 2: Temporarily store in Redis for LLM context (with 5-min TTL as safety)
      let tempKey = null;
      if (redisClient && mealHistory.length > 0) {
        tempKey = `temp:meals:${phone}:${Date.now()}`;
        await redisClient.setEx(tempKey, 300, JSON.stringify(mealHistory));
        console.log('📦 TEMP: Stored meal data in Redis:', tempKey);
      }
      
      // STEP 3: Build context for LLM
      const mealHistoryContext = mealHistory.length > 0 
        ? `Recent meals (ordered newest first): ${mealHistory.map((meal, index) => 
            `${index + 1}. ${meal.meal_description} (${meal.kcal} kcal, ${meal.prot}g protein, ${meal.carb}g carbs, ${meal.fat}g fat) - ${new Date(meal.created_at).toLocaleString()}`
          ).join(' | ')}`
        : 'No recent meals found';
      
      const contextualMsgs = [{
        role: 'system',
        content: buildContextAwareSystemPrompt(intentClassification.intent, userProfile, userSession, userFirstName) + 
        `\n\nUSER'S COMPLETE MEAL HISTORY: ${mealHistoryContext}\n\nIMPORTANT: When user asks about "latest meal" or "last meal", always use the FIRST meal in this list as it's the most recent. The meals are ordered from newest to oldest. Always reference the actual meal data from this history, not from daily totals.`
      }];

      if (text) {
        contextualMsgs.push({ role: 'user', content: text });
      }
      
      console.log('💰 MAKING OPENAI API CALL with temporary meal context');
      const contextualGpt = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-5-chat-latest',
        messages: contextualMsgs,
        max_tokens: 700,
        temperature: 0.1
      }, { headers: { Authorization: `Bearer ${OA_KEY}` } });
      
      reply = contextualGpt.data.choices[0].message.content;
      console.log('🎭 LLM response generated with meal context');
      
      // STEP 4: IMMEDIATELY delete temp data after LLM response
      if (tempKey && redisClient) {
        const deleted = await redisClient.del(tempKey);
        console.log('🗑️ TEMP: Immediately deleted meal data from Redis:', tempKey, '- Deleted:', deleted);
      }
      
      console.log('✅ Temporary injection complete - Redis is clean');
    }
    // Handle standardized daily progress requests with temporary meal injection
    else if (intentClassification.intent === 'get_daily_progress') {
      console.log('📊 DAILY PROGRESS REQUEST - Using temporary meal injection');
      
      // STEP 1: Fetch meal data from Supabase
      const mealHistory = await getUserMealHistory(phone, 10);
      console.log('✅ Fetched', mealHistory.length, 'meals from Supabase for context');
      
      // STEP 2: Temporarily store in Redis (5-min TTL as safety)
      let tempKey = null;
      if (redisClient && mealHistory.length > 0) {
        tempKey = `temp:meals:${phone}:${Date.now()}`;
        await redisClient.setEx(tempKey, 300, JSON.stringify(mealHistory));
        console.log('📦 TEMP: Stored meal data in Redis:', tempKey);
      }
      
      // STEP 3: Get progress data
      const progressData = await getStandardizedDailyProgress(phone);
      
      if (!progressData) {
        reply = "I couldn't fetch your daily progress right now. Please try again in a moment.";
      } else {
        reply = progressData.progressDisplay;
        console.log('✅ Standardized daily progress generated');
      }
      
      // STEP 4: IMMEDIATELY delete temp data
      if (tempKey && redisClient) {
        const deleted = await redisClient.del(tempKey);
        console.log('🗑️ TEMP: Immediately deleted meal data from Redis:', tempKey, '- Deleted:', deleted);
      }
      
      console.log('✅ Temporary injection complete - Redis is clean');
      
      // Skip normal AI processing
    }
    // Process all other intents with context-aware AI
    else {
      console.log('🎭 Processing intent with context-aware AI:', intentClassification.intent);
    }
    
    // Extract macros from the LangChain response and store in database
    const flat = reply.replace(/\n/g, ' ');
    const macroRegex = /Calories[^\d]*(\d+)[^]*?Proteins[^\d]*(\d+)[^]*?Carbs[^\d]*(\d+)[^]*?Fats[^\d]*(\d+)/i;
    const match = flat.match(macroRegex);
    
    if (match && intentClassification.intent === 'add_meal') {
      const [_, kcal, prot, carb, fat] = match.map(Number);
      
      // Extract meal description from GPT response
      let mealDescription = 'meal';
      const mealLabelMatch = reply.match(/🍽️\s*\*([^:]+):\*\s*([^*\n]+)/i);
      if (mealLabelMatch) {
        mealDescription = mealLabelMatch[2].trim();
      } else {
        mealDescription = text.substring(0, 50);
      }
      
      console.log('🏷️ Extracted meal description:', mealDescription);
      console.log('📊 Extracted macros:', { kcal, prot, carb, fat });
      
      // Store in database
      await db.from('meal_logs').insert({ 
        user_phone: phone, 
        kcal, 
        prot, 
        carb, 
        fat, 
        meal_description: mealDescription,
        created_at: new Date() 
      });

      // Clean up any temporary meal keys
      await cleanupTempMealKeys(phone);
      
      // Update daily totals
      const { error: totalsError } = await db.rpc('increment_daily_totals', {
        p_phone: phone,
        p_date: today,
        p_kcal: kcal,
        p_prot: prot,
        p_carb: carb,
        p_fat: fat
      });
      
      if (totalsError) {
        console.error('❌ Totals update error:', totalsError);
      }
      
      // Update local used values for progress bars
      used.kcal += kcal; 
      used.prot += prot; 
      used.carb += carb; 
      used.fat += fat;
      
      console.log('✅ Meal logged and totals updated');
    }

    // Always process the reply and replace progress bars
    reply = reply.replace(/\$\{(progress_bars|bars)\}/g, bars(used, goals));
    
    console.log('📝 Reply variable check:', reply ? 'HAS CONTENT' : 'EMPTY');
    console.log('📝 Reply preview:', reply?.substring(0, 100));

    // ============================================================================
    // INTELLIGENT MESSAGE CHUNKING FOR LONG RESPONSES
    // ============================================================================
    
    // Check if message exceeds WhatsApp limit (1600 chars)
    if (reply && reply.length > 1500) {
      console.log('📏 Long message detected:', reply.length, 'characters');
      console.log('✂️ Splitting into chunks...');
      
      // Split message intelligently
      const chunks = splitMessageIntelligently(reply);
      
      console.log('📦 Created', chunks.length, 'message chunks');
      
      // Send each chunk with small delay
      for (let i = 0; i < chunks.length; i++) {
        console.log(`📤 Sending chunk ${i + 1}/${chunks.length}:`, chunks[i].substring(0, 100) + '...');
        twiml.message(chunks[i]);
        
        // Add small delay between chunks (except for last one)
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log('💬 All message chunks sent successfully');
    } else {
      // Normal single message
      twiml.message(reply);
      console.log('💬 Single message sent:', reply.length, 'characters');
    }
    
    // Save updated session to Redis
    if (userSession) {
      await updateUserSession(phone, userSession);
      console.log('💾 Final session save completed');
    }
    
    res.type('text/xml').send(twiml.toString());;
  } catch (err) {
    console.error('⚠️ Error in webhook:', err);
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
  console.log('🔍 Recording SID:', recordingSid);
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
      // User profile data from onboarding (using existing columns + 6 new ones)
      gender: userData?.gender || 'male',
      age: userData?.age || 25,
      height_cm: userData?.height_cm || 175,
      weight_kg: userData?.weight_kg || 70,
      activity_level: userData?.activity_level || 'active',
      kcal_goal: userData?.kcal_goal || 2000,
      prot_goal: userData?.prot_goal || 150,
      carb_goal: userData?.carb_goal || 200,
      fat_goal: userData?.fat_goal || 67,

      // ONLY the 6 truly missing fields
      target_weight_kg: userData?.target_weight_kg || null,
      fitness_goal: userData?.fitness_goal || null,
      measurement_system: userData?.measurement_system || null,
      diet_preference: userData?.diet_preference || null,
      diet_preference_custom: userData?.diet_preference_custom || null,
      // FIXED: Set weekly_weight_goal to null for maintain_build users
      weekly_weight_goal: userData?.fitness_goal === 'maintain_build' ? null : (userData?.weekly_weight_goal || null),

      // Timestamp
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
  console.log('📄 Complete user setup - REQUEST RECEIVED');
  
  try {
    const { checkoutKey, sessionId, stripeData, userData } = req.body;
    
    console.log('📦 Received data:');
    console.log('  - checkoutKey:', checkoutKey);
    console.log('  - sessionId:', sessionId);
    console.log('  - userData:', userData);
    console.log('🔍 NEW FIELDS DEBUG:');
    console.log('  - target_weight_kg:', userData?.target_weight_kg);
    console.log('  - fitness_goal:', userData?.fitness_goal);
    console.log('  - measurement_system:', userData?.measurement_system);
    console.log('  - diet_preference:', userData?.diet_preference);
    console.log('  - diet_preference_custom:', userData?.diet_preference_custom);
    console.log('  - weekly_weight_goal:', userData?.weekly_weight_goal);
    
    if (!sessionId || sessionId === 'unknown') {
      return res.status(400).json({ 
        error: 'Session ID is required to create user' 
      });
    }
    
    // STEP 1: Get phone, email, and names from Stripe ONLY (source of truth)
    let finalPhoneNumber = null;
    let finalEmail = null;
    let finalFirstName = null;
    let finalLastName = null;
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
      
      // Get names from custom fields
      if (session.custom_fields && session.custom_fields.length > 0) {
        console.log('🔍 Processing custom fields:', session.custom_fields);
        
        session.custom_fields.forEach(field => {
          if (field.key === 'first_name') {
            finalFirstName = field.text?.value || null;
            console.log('✅ First name from Stripe:', finalFirstName);
          }
          if (field.key === 'last_name') {
            finalLastName = field.text?.value || null;
            console.log('✅ Last name from Stripe:', finalLastName);
          }
        });
      } else {
        console.log('⚠️ No custom fields found in session');
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
      console.log('  - First Name:', finalFirstName || 'NOT FOUND');
      console.log('  - Last Name:', finalLastName || 'NOT FOUND');
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
      console.log('🔧 Will use email-based identifier instead');
      
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
      first_name: finalFirstName,
      last_name: finalLastName,
      
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

      // NEW FIELDS - Add the 6 missing columns
      target_weight_kg: userData?.target_weight_kg || null,
      fitness_goal: userData?.fitness_goal || null,
      measurement_system: userData?.measurement_system || null,
      diet_preference: userData?.diet_preference || null,
      diet_preference_custom: userData?.diet_preference_custom || null,
      // FIXED: Set weekly_weight_goal to null for maintain_build users
      weekly_weight_goal: userData?.fitness_goal === 'maintain_build' ? null : (userData?.weekly_weight_goal || null),
      
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

    // Invalidate cache for new/updated users
    await invalidateUserProfileCache(finalPhoneNumber);
    console.log('🔄 Cache invalidated for new/updated user');
    
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
// DASHBOARD API ENDPOINTS
// ============================================================================

// Get user profile data for dashboard
app.get('/api/user/:phone', async (req, res) => {
  console.log('📊 Dashboard: Getting user profile data');
  
  try {
    const phoneNumber = req.params.phone;
    console.log('📱 Looking up user:', phoneNumber);
    
    // Get user data from Supabase
    const { data, error } = await db
      .from('users')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();
    
    if (error || !data) {
      console.error('❌ User not found:', error);
      return res.status(404).json({ 
        error: 'User not found',
        details: error?.message 
      });
    }
    
    console.log('✅ User data retrieved successfully');
    res.json({ 
      success: true, 
      user: data 
    });
    
  } catch (error) {
    console.error('❌ Dashboard API error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve user data',
      details: error.message 
    });
  }
});

// Update user profile data (excluding phone number)
app.put('/api/user/:phone', async (req, res) => {
  console.log('📝 Dashboard: Updating user profile');
  
  try {
    const phoneNumber = req.params.phone;
    console.log('🔧 DEBUG: Raw phone from URL params:', phoneNumber);
    console.log('🔧 DEBUG: Request body received:', req.body);
    const updatedData = req.body;
    
    // Remove phone_number from update data to prevent changes
    delete updatedData.phone_number;
    delete updatedData.created_at;
    delete updatedData.id;
    
    console.log('📱 Updating user:', phoneNumber);
    console.log('📝 Update data:', updatedData);
    
    // Update user in Supabase
    const { data, error } = await db
      .from('users')
      .update(updatedData)
      .eq('phone_number', phoneNumber)
      .select();
    
    if (error) {
      console.error('❌ Update failed:', error);
      return res.status(500).json({ 
        error: 'Failed to update user data',
        details: error.message 
      });
    }
    
    if (!data || data.length === 0) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    
    // Sync email changes to Stripe
    if (updatedData.email && data[0].stripe_customer_id) {
      try {
        console.log('🔄 Syncing email to Stripe customer:', data[0].stripe_customer_id);
        
        await stripe.customers.update(data[0].stripe_customer_id, {
          email: updatedData.email
        });
        
        console.log('✅ Email synced to Stripe successfully');
      } catch (stripeError) {
        console.error('❌ Failed to sync email to Stripe:', stripeError.message);
        // Don't fail the entire request if Stripe sync fails
      }
    }

    // 🔄 INVALIDATE USER PROFILE CACHE AFTER UPDATE
    console.log('🔧 DEBUG: About to invalidate cache for phone:', phoneNumber);
    await invalidateUserProfileCache(phoneNumber);
    console.log('✅ Profile cache invalidated after dashboard update for:', phoneNumber);
    
    console.log('✅ User updated successfully');
    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      user: data[0] 
    });
    
  } catch (error) {
    console.error('❌ Dashboard update error:', error);
    res.status(500).json({ 
      error: 'Failed to update user data',
      details: error.message 
    });
  }
});

// Generate Stripe billing portal URL - IMPROVED VERSION
app.post('/api/billing-portal', async (req, res) => {
  console.log('💳 Dashboard: Creating billing portal session');
  
  try {
    const { phone_number } = req.body;
    
    // Get user's Stripe customer ID
    const { data: userData, error } = await db
      .from('users')
      .select('stripe_customer_id, email, first_name, last_name')
      .eq('phone_number', phone_number)
      .single();
    
    if (error || !userData || !userData.stripe_customer_id) {
      console.error('❌ User or customer ID not found:', error);
      return res.status(404).json({ 
        error: 'Customer not found' 
      });
    }
    
    // For test mode, create a simple portal configuration
    try {
      // Create Stripe billing portal session with minimal config
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: userData.stripe_customer_id,
        return_url: `${process.env.FRONTEND_URL || 'https://your-clickfunnels-dashboard.com'}/dashboard?success=billing`,
      });
      
      console.log('✅ Billing portal created:', portalSession.url);
      res.json({ 
        success: true, 
        url: portalSession.url,
        customer_info: {
          email: userData.email,
          name: `${userData.first_name} ${userData.last_name}`
        }
      });
      
    } catch (stripeError) {
      console.error('❌ Stripe billing portal error:', stripeError);
      
      // Handle billing portal not configured
      if (stripeError.code === 'account_invalid' || stripeError.message.includes('No configuration provided')) {
        return res.status(500).json({
          success: false,
          error: 'billing_portal_not_configured',
          message: 'Billing portal is not set up yet. Please contact support.',
          setup_required: true
        });
      }
      
      throw stripeError;
    }
    
  } catch (error) {
    console.error('❌ Billing portal error:', error);
    res.status(500).json({ 
      error: 'Failed to create billing portal',
      details: error.message 
    });
  }
});

// ============================================================================
// WHATSAPP COMMAND ENDPOINTS
// ============================================================================

// Generate dashboard link for user
app.post('/api/generate-dashboard-link', async (req, res) => {
  console.log('🔗 Generating dashboard link');
  
  try {
    const { phone_number } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: 'Phone number required' });
    }
    
    console.log('🔍 Looking up user with phone:', phone_number);
    
    // Verify user exists in database
    const { data: userData, error } = await db
      .from('users')
      .select('phone_number, first_name')
      .eq('phone_number', phone_number)
      .single();
    
    if (error || !userData) {
      console.error('❌ User not found in database:', phone_number);
      console.error('Database error:', error);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('✅ Found user:', userData.first_name, 'with phone:', userData.phone_number);
    
    // Debug: Log the phone_number variable before URL generation
    console.log('🔍 DEBUG: phone_number variable =', phone_number);
    console.log('🔍 DEBUG: userData.phone_number =', userData.phone_number);
    
    // Generate secure dashboard URL using the SAME phone number from the request
    const dashboardUrl = `https://www.iqcalorie.com/user-dashboard?phone=${encodeURIComponent(phone_number)}`;
    
    console.log('🔗 Generated dashboard URL:', dashboardUrl);
    console.log('🔍 DEBUG: URL encoded phone =', encodeURIComponent(phone_number));
    
    res.json({
      success: true,
      dashboard_url: dashboardUrl,
      user_name: userData.first_name
    });
    
  } catch (error) {
    console.error('❌ Error generating dashboard link:', error);
    res.status(500).json({ error: 'Failed to generate link' });
  }
});

// Get support contact info
app.get('/api/support-info', (req, res) => {
  res.json({
    success: true,
    support_message: "Need help? Contact our support team:",
    support_phone: "+96170464844", // Your actual support number
    support_hours: "Available 9 AM - 6 PM Beirut time, Monday to Friday"
  });
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
    
        // Get user's first name and diet preference for personalization
    const { data: userRecord, error: userError } = await db
    .from('users')
    .select('first_name, last_name, diet_preference')
    .eq('phone_number', formattedPhone)
    .limit(1);

    const firstName = userRecord && userRecord[0] && userRecord[0].first_name 
          ? userRecord[0].first_name 
          : '';

    const dietPreference = userRecord && userRecord[0] && userRecord[0].diet_preference 
    ? userRecord[0].diet_preference 
    : null;
    
    const personalGreeting = firstName 
      ? `Welcome to *IQCalorie*, ${firstName}! 🔥` 
      : `Welcome to *IQCalorie*! 🔥`;
    
    console.log('👋 Personal greeting:', personalGreeting);

    const welcomeMessage = `${personalGreeting}

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
${dietPreference ? `🍽️ Diet: ${dietPreference.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}` : ''}

⚖️ ${motivationText}

I will take these numbers into account when talking to you!

Now Snap a photo of your most recent meal! 📸🍽️`;

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
  console.log('🛒 Creating checkout session with 3-day trial and name collection');
  
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
      
      // COLLECT CUSTOMER DETAILS including name
      custom_fields: [
        {
          key: 'first_name',
          label: {
            type: 'custom',
            custom: 'First Name'
          },
          type: 'text',
          optional: false
        },
        {
          key: 'last_name',
          label: {
            type: 'custom',
            custom: 'Last Name'
          },
          type: 'text',
          optional: false
        }
      ],
      
      // Store data in metadata for backup
      metadata: {
        phone_number: phoneNumber || '',
        email: email || '',
        checkout_key: checkoutKey
      }
    });
    
    console.log('✅ Session created with phone and name collection:', session.id);
    res.json({ sessionId: session.id });
    
  } catch (error) {
    console.error('❌ Error creating session:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SUBSCRIPTION MANAGEMENT FUNCTIONS
// ============================================================================

// Handle subscription cancellation
async function handleSubscriptionCancellation(subscription) {
  console.log('🗑️ Processing subscription cancellation:', subscription.id);
  
  try {
    // Find user by Stripe subscription ID
    const { data: users, error: findError } = await db
      .from('users')
      .select('*')
      .eq('stripe_subscription_id', subscription.id);
    
    if (findError || !users || users.length === 0) {
      console.error('❌ User not found for cancelled subscription:', subscription.id);
      return;
    }
    
    const user = users[0];
    console.log('👤 Found user to process cancellation:', user.phone_number);
    
    // Delete related data first, then user
    console.log('🗑️ Deleting user data for:', user.phone_number);
    
    // Delete from daily_totals first
    const { error: dailyError } = await db
      .from('daily_totals')
      .delete()
      .eq('user_phone', user.phone_number);
    
    if (dailyError) {
      console.error('❌ Failed to delete daily totals:', dailyError);
    } else {
      console.log('✅ Daily totals deleted');
    }
    
    // Delete from meal_logs
    const { error: mealError } = await db
      .from('meal_logs')
      .delete()
      .eq('user_phone', user.phone_number);
    
    if (mealError) {
      console.error('❌ Failed to delete meal logs:', mealError);
    } else {
      console.log('✅ Meal logs deleted');
    }
    
    // Finally delete user
    const { error: deleteError } = await db
      .from('users')
      .delete()
      .eq('stripe_subscription_id', subscription.id);
    
    if (deleteError) {
      console.error('❌ Failed to delete user:', deleteError);
      return;
    }
    
    console.log('✅ User account deleted due to subscription cancellation:', user.phone_number);
    
    // Optional: Send farewell message via WhatsApp
    await sendFarewellMessage(user.phone_number, user.first_name);
    
  } catch (error) {
    console.error('❌ Error handling subscription cancellation:', error);
  }
}

// Handle trial ending (3 days before cancellation)
async function handleTrialEnding(subscription) {
  console.log('⏰ Processing trial ending warning:', subscription.id);
  
  try {
    // Find user by Stripe subscription ID
    console.log('🔍 Looking for user with subscription ID:', subscription.id);
    
    const { data: users, error } = await db
      .from('users')
      .select('phone_number, first_name, stripe_subscription_id')
      .eq('stripe_subscription_id', subscription.id);
    
    console.log('📊 Database query result:', { users, error });
    
    if (error || !users || users.length === 0) {
      console.error('❌ User not found for trial ending:', subscription.id);
      return;
    }
    
    const user = users[0];
    console.log('👤 Sending trial ending warning to:', user.phone_number);
    
    // Send warning message via WhatsApp
    await sendTrialEndingMessage(user.phone_number, user.first_name);
    
  } catch (error) {
    console.error('❌ Error handling trial ending:', error);
  }
}

// Handle payment failure
async function handlePaymentFailure(invoice) {
  console.log('💳 Processing payment failure for subscription:', invoice.subscription);
  
  try {
    // Find user by Stripe subscription ID
    console.log('🔍 Looking for user with subscription ID:', invoice.subscription);
    
    const { data: users, error } = await db
      .from('users')
      .select('phone_number, first_name, stripe_subscription_id')
      .eq('stripe_subscription_id', invoice.subscription);
    
    console.log('📊 Database query result:', { users, error });
    
    if (error || !users || users.length === 0) {
      console.error('❌ User not found for payment failure:', invoice.subscription);
      return;
    }
    
    const user = users[0];
    console.log('👤 Sending payment failure notice to:', user.phone_number);
    
    // Send payment failure message via WhatsApp
    await sendPaymentFailureMessage(user.phone_number, user.first_name);
    
  } catch (error) {
    console.error('❌ Error handling payment failure:', error);
  }
}

// Send farewell message when subscription is cancelled
async function sendFarewellMessage(phoneNumber, firstName) {
  try {
    const twilio = require('twilio')(process.env.ACCOUNT_SID, process.env.AUTH_TOKEN);
    
    const personalGreeting = firstName ? `${firstName}, ` : '';
    
    const message = `Hi ${personalGreeting}we're sorry to see you go!

Your IQ Calorie subscription has been cancelled and your account access has ended.

If you change your mind, you can always restart your subscription at www.iqcalorie.com

Thank you for trying IQ Calorie!`;

    await twilio.messages.create({
      from: 'whatsapp:+447888873477',
      to: `whatsapp:${phoneNumber}`,
      body: message
    });
    
    console.log('✅ Farewell message sent to:', phoneNumber);
    
  } catch (error) {
    console.error('❌ Error sending farewell message:', error);
  }
}

// Send trial ending warning
async function sendTrialEndingMessage(phoneNumber, firstName) {
  try {
    const twilio = require('twilio')(process.env.ACCOUNT_SID, process.env.AUTH_TOKEN);
    
    const personalGreeting = firstName ? `${firstName}, ` : '';
    
    const message = `Hi ${personalGreeting}your 3-day free trial is ending soon!

To continue using IQ Calorie and keep tracking your nutrition goals, make sure your payment method is set up.

Manage your subscription: Type /dashboard and click "Manage Subscription & Billing"

We hope you're loving your nutrition journey with us!`;

    await twilio.messages.create({
      from: 'whatsapp:+447888873477',
      to: `whatsapp:${phoneNumber}`,
      body: message
    });
    
    console.log('✅ Trial ending message sent to:', phoneNumber);
    
  } catch (error) {
    console.error('❌ Error sending trial ending message:', error);
  }
}

// Send payment failure notice
async function sendPaymentFailureMessage(phoneNumber, firstName) {
  try {
    const twilio = require('twilio')(process.env.ACCOUNT_SID, process.env.AUTH_TOKEN);
    
    const personalGreeting = firstName ? `${firstName}, ` : '';
    
    const message = `Hi ${personalGreeting}we had trouble processing your payment for IQ Calorie.

Please update your payment method to continue your subscription:

Type /dashboard and click "Manage Subscription & Billing"

If not resolved soon, your access may be suspended.`;

    await twilio.messages.create({
      from: 'whatsapp:+447888873477',
      to: `whatsapp:${phoneNumber}`,
      body: message
    });
    
    console.log('✅ Payment failure message sent to:', phoneNumber);
    
  } catch (error) {
    console.error('❌ Error sending payment failure message:', error);
  }
}

// ============================================================================
// STRIPE WEBHOOK
// ============================================================================

app.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('📞 Stripe webhook received');
  
  try {
    const event = req.body;
    console.log('📦 Event type:', event.type);
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      console.log('✅ Checkout session completed');
      console.log('📋 Session ID:', session.id);
      console.log('💤 Customer ID:', session.customer);
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
    
    // Handle subscription cancellation
    else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      console.log('🗑️ Subscription cancelled:', subscription.id);
      
      await handleSubscriptionCancellation(subscription);
    }
    
    // Handle subscription trial ending
    else if (event.type === 'customer.subscription.trial_will_end') {
      const subscription = event.data.object;
      console.log('⏰ Trial ending soon:', subscription.id);
      
      // Optional: Send notification to user about trial ending
      // DISABLED: Trial ending notifications commented out
      // await handleTrialEnding(subscription);
    }
    
    // Handle failed payments (subscription becomes past_due)
    else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      console.log('💳 Payment failed for subscription:', invoice.subscription);
      
      await handlePaymentFailure(invoice);
    }
    
    res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('❌ Stripe webhook error:', error);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// Debug endpoint to test WhatsApp messages
app.post('/test-whatsapp', async (req, res) => {
  try {
    const { phone, message } = req.body;
    
    const twilio = require('twilio')(process.env.ACCOUNT_SID, process.env.AUTH_TOKEN);
    
    const result = await twilio.messages.create({
      from: 'whatsapp:+447888873477',
      to: `whatsapp:${phone}`,
      body: message || 'Test message from backend'
    });
    
    console.log('✅ Test message sent:', result.sid);
    res.json({ success: true, messageSid: result.sid });
    
  } catch (error) {
    console.error('❌ WhatsApp test error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// PROXY SETUP (BACKUP ENDPOINT)
// ============================================================================

app.post('/proxy-setup', async (req, res) => {
  console.log('📄 Proxy endpoint hit');
  
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
// SECURITY MONITORING ENDPOINT
// ============================================================================

app.get('/security-dashboard', (req, res) => {
  console.log('🔍 Security dashboard accessed');
  
  const summary = {
    timestamp: new Date().toISOString(),
    unauthorized_attempts: Object.fromEntries(unauthorizedAttempts),
    total_blocked_numbers: unauthorizedAttempts.size,
    high_risk_numbers: []
  };
  
  // Identify high-risk numbers (more than 5 attempts)
  for (const [phone, attempts] of unauthorizedAttempts) {
    const readableAttempts = attempts.map(timestamp => new Date(timestamp).toISOString());
  
    if (attempts.length > 5) {
      summary.high_risk_numbers.push({
        phone,
        attempts: attempts.length,
        attempt_times: readableAttempts,
        last_attempt: new Date(Math.max(...attempts)).toISOString()
      });
    }
    
    // Add all attempts with readable timestamps
    summary.unauthorized_attempts[phone] = readableAttempts;
  }
  
  res.json(summary);
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