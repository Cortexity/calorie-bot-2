// index.js

require('dotenv').config();
console.log('🚀 DEPLOYMENT VERSION: 2.1 - MEAL DESCRIPTIONS ADDED - ' + new Date().toISOString());

const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const { MessagingResponse } = require('twilio').twiml;
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// Import OpenAI client for LangChain-style operations
const { OpenAI } = require('openai');
// Import LangSmith wrapper for LLM tracing
const { wrapOpenAI } = require('langsmith/wrappers');

// Initialize OpenAI client with LangSmith tracing
const openai = wrapOpenAI(new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}));

// Import new ReAct agent modules
const { getFunctionDefinitions } = require('./src/functions');
const { buildSystemPrompt } = require('./src/prompts');
const { executeTool } = require('./src/tools');

// Import Meta Business SDK for Conversions API
const bizSdk = require('facebook-nodejs-business-sdk');
const ServerEvent = bizSdk.ServerEvent;
const EventRequest = bizSdk.EventRequest;
const UserData = bizSdk.UserData;
const CustomData = bizSdk.CustomData;

// Initialize Meta Conversions API
const metaPixelId = process.env.META_PIXEL_ID;
const metaAccessToken = process.env.META_CONVERSION_API_TOKEN;

// ============================================================================
// META CONVERSIONS API - PURCHASE EVENT SENDER
// ============================================================================

/**
 * Send Purchase event to Meta via Conversions API
 * @param {Object} userData - User data from Supabase
 * @param {Object} stripeData - Stripe charge/invoice data
 */
const sendMetaPurchaseEvent = async (userData, stripeData) => {
  try {
    console.log('🎯 Preparing Meta Purchase event...');
    console.log('📊 User data:', {
      email: userData.email,
      phone: userData.phone_number,
      plan: userData.trial_plan
    });
    
    // Define plan details
    const planDetails = {
      monthly: {
        name: 'Monthly Plan',
        value: 19.99,
        content_ids: ['monthly_subscription']
      },
      yearly: {
        name: 'Yearly Plan',
        value: 59.88,
        content_ids: ['yearly_subscription']
      }
    };
    
    const plan = planDetails[userData.trial_plan] || planDetails.monthly;
    
    // Create user data for the event
    const metaUserData = new UserData();
    
    if (userData.email) {
      metaUserData.setEmail(userData.email.toLowerCase().trim());
    }
    
    if (userData.phone_number) {
      // Clean phone number (remove spaces, keep +)
      const cleanPhone = userData.phone_number.replace(/\s+/g, '');
      metaUserData.setPhone(cleanPhone);
    }
    
        // Add Facebook browser/click IDs if available (for better attribution)
    if (userData.meta_fbp) {
      metaUserData.setFbp(userData.meta_fbp);
    }

    if (userData.meta_fbc) {
      metaUserData.setFbc(userData.meta_fbc);
    }

        // Add User Agent for better device/browser matching
    if (userData.user_agent) {
      try {
        metaUserData.setClientUserAgent(userData.user_agent);
        console.log('🖥️ User Agent added to Meta event:', userData.user_agent.substring(0, 60) + '...');
      } catch (error) {
        console.error('❌ Failed to set User Agent:', error.message);
        // Try alternative method name
        try {
          metaUserData.client_user_agent = userData.user_agent;
          console.log('🖥️ User Agent set via direct property');
        } catch (e) {
          console.error('❌ All User Agent methods failed');
        }
      }
    }

    // Add IP Address for better location matching  
    if (userData.user_ip) {
      try {
        metaUserData.setClientIpAddress(userData.user_ip);
        console.log('🌐 IP Address added to Meta event:', userData.user_ip);
      } catch (error) {
        console.error('❌ Failed to set IP Address:', error.message);
        // Try alternative method name
        try {
          metaUserData.client_ip_address = userData.user_ip;
          console.log('🌐 IP Address set via direct property');
        } catch (e) {
          console.error('❌ All IP Address methods failed');
        }
      }
    }

    // Create custom data (purchase details)
    const customData = new CustomData()
      .setContentName(plan.name)
      .setContentCategory('Subscription')
      .setContentIds(plan.content_ids)
      .setContentType('product')
      .setValue(plan.value)
      .setCurrency('USD')
      .setNumItems(1);
    
    // Create the server event
    const serverEvent = new ServerEvent()
      .setEventName('Purchase')
      .setEventTime(Math.floor(Date.now() / 1000))
      .setUserData(metaUserData)
      .setCustomData(customData)
      .setEventSourceUrl('https://iqcalorie.com/confirmation')
      .setActionSource('website');
    
    // Add event_id if available (prevents duplicates)
    if (userData.meta_event_id) {
      serverEvent.setEventId(userData.meta_event_id);
    }
    
    // Create event request
    const eventRequest = new EventRequest(metaAccessToken, metaPixelId)
      .setEvents([serverEvent]);
    
    // Debug: Log the exact UserData being sent
    console.log('🔍 DEBUG: UserData object being sent to Meta:', {
      email: userData.email ? 'Present' : 'Missing',
      phone: userData.phone_number ? 'Present' : 'Missing',
      fbp: userData.meta_fbp ? 'Present' : 'Missing',
      fbc: userData.meta_fbc ? 'Present' : 'Missing',
      user_agent: userData.user_agent ? userData.user_agent.substring(0, 50) + '...' : 'Missing',
      user_ip: userData.user_ip ? userData.user_ip : 'Missing'
    });
    
    console.log('📤 Sending Purchase event to Meta...');
    
    // Send the event
    const response = await eventRequest.execute();
    
    console.log('✅ Meta Purchase event sent successfully!');
    console.log('📊 Response:', JSON.stringify(response, null, 2));
    
    // Mark purchase event as sent in Supabase
    const { error: updateError } = await db
      .from('users')
      .update({ purchase_event_sent: true })
      .eq('phone_number', userData.phone_number)
      .select();
    
    if (updateError) {
      console.error('❌ Failed to update purchase_event_sent:', updateError);
    } else {
      console.log('✅ User marked as purchase_event_sent = true');
    }
    
    return { success: true, response };
    
  } catch (error) {
    console.error('❌ Error sending Meta Purchase event:', error);
    console.error('Error details:', error.message);
    return { success: false, error: error.message };
  }
};

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
    
    // ENFORCE 10-MESSAGE ROLLING WINDOW (extended from 5 for better context)
    if (sessionData.conversationHistory && sessionData.conversationHistory.length > 20) {
      sessionData.conversationHistory = sessionData.conversationHistory.slice(-20);
      console.log('✂️ Trimmed conversation history to last 10 messages');
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

There's your progress update!`;
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
function generateDashboardRedirectMessage(fieldToChange, userName, dashboardUrl = null) {
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

  // If dashboard URL is provided, include direct link
  if (dashboardUrl) {
    return `${greeting}I see you want to update your ${fieldName}! 📝

You can update your profile anytime through your personal dashboard—it helps keep your info secure and accurate.

🔗 Access your dashboard here:
${dashboardUrl}

Once you update there, I'll automatically have your new information within seconds!

This ensures your data stays consistent across all systems (WhatsApp, dashboard, and billing). 🔒`;
  }

  // Fallback for cases without URL
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
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+447888873477';
const TWILIO_WHATSAPP_NUMBER = `whatsapp:${TWILIO_PHONE_NUMBER}`;

console.log('🔌 Connecting to Supabase...');
console.log('  - URL exists:', !!SB_URL);
console.log('  - KEY exists:', !!SB_KEY);

const db = createClient(SB_URL, SB_KEY, {
  global: { headers: { Authorization: `Bearer ${SB_KEY}` } }
});

console.log('✅ Supabase client created');

// Initialize Twilio REST API client
const twilio = require('twilio');
const twilioClient = twilio(ACC, TOK);
console.log('✅ Twilio REST API client initialized');
console.log(`📱 WhatsApp number: ${TWILIO_WHATSAPP_NUMBER}`);

// ============================================================================
// WHATSAPP MESSAGE SENDING HELPER (REST API)
// ============================================================================

/**
 * Send a WhatsApp message using Twilio REST API
 * @param {string} toPhone - Phone number with country code (e.g., "+923314074097")
 * @param {string} messageBody - Message content to send
 * @returns {Promise<object>} - Twilio message object
 */
const sendWhatsAppMessage = async (toPhone, messageBody) => {
  try {
    console.log(`📤 Sending WhatsApp message to ${toPhone} (${messageBody.length} chars)`);

    const message = await twilioClient.messages.create({
      body: messageBody,
      from: TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${toPhone}`
    });

    console.log(`✅ Message sent successfully (SID: ${message.sid})`);
    return message;
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
    throw error;
  }
};

/**
 * Send multiple WhatsApp messages with delay between chunks
 * @param {string} toPhone - Phone number
 * @param {string[]} messageChunks - Array of message strings
 * @param {number} delayMs - Delay between messages in milliseconds
 */
const sendWhatsAppMessageChunks = async (toPhone, messageChunks, delayMs = 1000) => {
  console.log(`📦 Sending ${messageChunks.length} message chunk(s) to ${toPhone}`);

  for (let i = 0; i < messageChunks.length; i++) {
    await sendWhatsAppMessage(toPhone, messageChunks[i]);

    // Add delay between chunks (except for last one)
    if (i < messageChunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log('✅ All message chunks sent successfully');
};

/**
 * Sanitize AI messages for WhatsApp formatting
 * Replaces double asterisks (**) with single asterisks (*)
 * because WhatsApp uses single asterisks for bold text
 */
const sanitizeAIMessage = (messageContent) => {
  if (!messageContent || typeof messageContent !== 'string') {
    return messageContent;
  }

  // Replace all occurrences of ** with *
  const sanitized = messageContent.replace(/\*\*/g, '*');

  if (sanitized !== messageContent) {
    console.log('🧹 Sanitized message: replaced double asterisks with single asterisks');
  }

  return sanitized;
};

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
// WHATSAPP WEBHOOK (ASYNC PATTERN - IMMEDIATE RESPONSE)
// ============================================================================

app.post('/webhook', async (req, res) => {
  // Extract request data immediately
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

  // ============================================================================
  // IMMEDIATE RESPONSE - Return 200 OK to Twilio right away
  // ============================================================================
  res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  console.log('✅ 200 OK sent to Twilio immediately - Processing message async...');

  // ============================================================================
  // ASYNC PROCESSING - No timeout constraints
  // ============================================================================
  processMessageAsync(phone, bodyText, mUrl, mType, isImg, isAudio).catch(error => {
    console.error('❌ Fatal error in async processing:', error);
    console.error('📍 Error stack:', error.stack);
  });
});

/**
 * Process WhatsApp message asynchronously (no time constraints)
 */
const processMessageAsync = async (phone, bodyText, mUrl, mType, isImg, isAudio) => {
  try {
    // Check for video and reject
    const isVideo = mType.startsWith('video/');
    if (isVideo) {
      console.log('🚫 Video detected and rejected');
      await sendWhatsAppMessage(phone, 'Sorry, I can only analyze images of food, not videos. Please send a photo instead! 📸');
      return;
    }

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

      // Silent ignore - no message sent to unauthorized users
      return;
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
    const userMsgCount = userSession.conversationHistory.filter(m => m && m.role === 'user').length;
    const toolMsgCount = userSession.conversationHistory.filter(m => m && m.role === 'tool').length;
    const assistantMsgCount = userSession.conversationHistory.filter(m => m && m.role === 'assistant').length;

    userSession.conversationHistory.forEach((message, index) => {
      // Skip invalid messages without a role
      if (!message || !message.role) {
        console.log(`  [${index + 1}/${userSession.conversationHistory.length}] ⚠️ INVALID MESSAGE (no role): ${JSON.stringify(message)}`);
        return;
      }

      const roleEmoji = {
        'user': '👤',
        'assistant': '🤖',
        'tool': '🔧'
      }[message.role] || '📝';

      let contentPreview = '';
      if (typeof message.content === 'string') {
        contentPreview = message.content.substring(0, 50);
      } else if (Array.isArray(message.content)) {
        contentPreview = '[image/complex content]';
      } else if (message.content?.image_url) {
        contentPreview = '[image]';
      } else {
        contentPreview = '[unknown content]';
      }

      console.log(`  [${index + 1}/${userSession.conversationHistory.length}] ${roleEmoji} ${message.role.toUpperCase()}: "${contentPreview}..."`);
    });
    console.log(`✅ Total in cache: ${userSession.conversationHistory.length} messages (👤 ${userMsgCount} user | 🤖 ${assistantMsgCount} assistant | 🔧 ${toolMsgCount} tool)\n`);
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
        await sendWhatsAppMessage(phone, `Available commands:

- */dashboard* - Get your personal dashboard link
- */support* - Get support contact information

Just type any command to use it!`);
        return;
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

          await sendWhatsAppMessage(phone, sanitizeAIMessage(dashboardMessage));
          return;

        } catch (error) {
          console.error('❌ Error generating dashboard link:', error);
          await sendWhatsAppMessage(phone, 'Sorry, I had trouble generating your dashboard link. Please try again later or contact support.');
          return;
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

          await sendWhatsAppMessage(phone, sanitizeAIMessage(supportMessage));
          return;

        } catch (error) {
          console.error('❌ Error getting support info:', error);
          await sendWhatsAppMessage(phone, '📞 Need help? Contact our support team at +1234567890 or reply to this chat!');
          return;
        }
      }

      else {
        // Unknown command
        await sendWhatsAppMessage(phone, `Available commands:
- */dashboard* - Get your personal dashboard link
- */support* - Get support contact information

💡 Tip: Just type / to see available commands, or type any command manually!`);
        return;
      }
    }

    // ============================================================================
    // BUILD CONTEXT-AWARE PROMPT WITH CONVERSATION HISTORY
    // ============================================================================
    
    // Build conversation history context (for logging/context)
    // Note: The actual ReAct agent builds its own messages array from conversationHistory with the new format
    let conversationContext = '';
    if (userSession?.conversationHistory && userSession.conversationHistory.length > 0) {
      conversationContext = '\n\nRECENT CONVERSATION HISTORY (for context and continuity):';

      // Show recent messages (user and assistant only, for readability)
      const recentMessages = userSession.conversationHistory.slice(-6);
      let userMsgCount = 0;

      recentMessages.forEach((message, index) => {
        // Skip invalid messages
        if (!message || !message.role) {
          return;
        }

        if (message.role === 'user') {
          userMsgCount++;
          let preview = '';
          if (typeof message.content === 'string') {
            preview = message.content.substring(0, 100);
          } else {
            preview = '[image or complex content]';
          }
          conversationContext += `\n\n[Message ${index + 1}] User: "${preview}..."`;
        } else if (message.role === 'assistant') {
          let preview = message.content;
          if (typeof preview === 'string') {
            preview = preview.substring(0, 100);
          }
          conversationContext += `\nAssistant: "${preview}..."`;
        }
      });

      conversationContext += '\n\nCONVERSATION RULES:\n- When user says "yes/no/sure/okay" - assume they mean your MOST RECENT question\n- Don\'t ask for clarification unless truly ambiguous\n- Be natural and conversational, not robotic\n- Don\'t say "I\'ll circle back" or "let me clarify" - just continue naturally';

      console.log('🧠 Including conversation history:', userSession.conversationHistory.length, 'total messages');
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
      await sendWhatsAppMessage(phone, '⚠️ Account error. Please contact support.');
      return;
    }

    const goals = { kcal: row.kcal_goal, prot: row.prot_goal, carb: row.carb_goal, fat: row.fat_goal };
    const used = { kcal: row.kcal_used, prot: row.prot_used, carb: row.carb_used, fat: row.fat_used };

    // ============================================================================
    // REACT AGENT WITH MULTI-TURN TOOL CALLING LOOP
    // ============================================================================

    console.log('🧠 STARTING REACT AGENT WITH FUNCTION CALLING LOOP');

    // Build system prompt
    const systemPrompt = buildSystemPrompt(userProfile, userFirstName);

    // Build messages array with conversation history
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];

    // Add conversation history (last 10 USER messages + all intermediate messages)
    if (userSession?.conversationHistory && userSession.conversationHistory.length > 0) {
      // Find indices of the last 10 user messages
      const userMessageIndices = userSession.conversationHistory
        .map((msg, i) => (msg && msg.role === 'user') ? i : -1)
        .filter(i => i !== -1)
        .slice(-10); // Get last 10 user message indices

      if (userMessageIndices.length > 0) {
        // Start from the 10th most recent user message
        const startIndex = userMessageIndices[0];
        const recentMessages = userSession.conversationHistory.slice(startIndex);

        // Filter out invalid messages (without role property)
        const validMessages = recentMessages.filter(msg => msg && msg.role);
        const invalidCount = recentMessages.length - validMessages.length;

        if (invalidCount > 0) {
          console.warn(`⚠️ Filtered out ${invalidCount} invalid message(s) from conversation history`);
        }

        messages.push(...validMessages);
        console.log(`📝 Added ${validMessages.length} messages to context (including ${userMessageIndices.length} user messages and all intermediate tool/assistant messages)`);
      }
    }

    // Record where new messages will start (before adding current user message)
    const messageStartIndex = messages.length;

    // Add current message (text or image)
    if (isImg && mUrl) {
      const auth = { Authorization: 'Basic ' + Buffer.from(`${ACC}:${TOK}`).toString('base64') };
      const img = await axios.get(mUrl, { responseType: 'arraybuffer', headers: auth });
      const b64 = Buffer.from(img.data, 'binary').toString('base64');
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mType};base64,${b64}` } },
          { type: 'text', text: 'Please analyze this food photo and log it as a meal.' }
        ]
      });
    } else if (text) {
      messages.push({
        role: 'user',
        content: text
      });
    } else {
      messages.push({
        role: 'user',
        content: 'Hi'
      });
    }

    // ============================================================================
    // REACT LOOP: Keep calling tools until LLM generates final response
    // ============================================================================

    let reply = '';
    let continueLoop = true;
    let iterations = 0;
    const maxIterations = 10; // Safety limit to prevent infinite loops
    let lastDashboardLink = null; // Track if we need dashboard link handling

    while (continueLoop && iterations < maxIterations) {
      iterations++;
      console.log(`\n🔄 REACT LOOP ITERATION ${iterations}/${maxIterations}`);

      // Make OpenAI API call with function definitions
      console.log('💰 Calling OpenAI with tools...');
      const response = await openai.chat.completions.create({
        model: 'gpt-5-chat-latest',
        messages: messages,
        tools: getFunctionDefinitions(),
        tool_choice: 'auto',
        temperature: 0.3,
        max_tokens: 1024
      });

      const assistantMessage = response.choices[0].message;
      console.log('✅ OpenAI response received');

      // Check if LLM called any functions
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log(`🔧 LLM called ${assistantMessage.tool_calls.length} tool(s)`);

        // Add the assistant's message with tool calls to conversation
        messages.push(assistantMessage);

        // Execute ALL tools returned by the LLM
        const toolResults = [];

        for (const toolCall of assistantMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          console.log(`  📍 Executing: ${functionName}`);

          // Execute the tool
          const toolResult = await executeTool(functionName, functionArgs, {
            phone,
            userProfile,
            userSession,
            db,
            today,
            redisClient
          });

          console.log(`  ✅ ${functionName} completed`);

          // Handle dashboard link generation specially
          if (toolResult.action === 'generate_dashboard_link') {
            lastDashboardLink = toolResult;
            console.log(`  🔗 Dashboard link requested (will handle after loop)`);
          }

          // Add tool result to conversation
          toolResults.push({
            tool_call_id: toolCall.id,
            result: toolResult
          });
        }

        // Add all tool results to messages at once
        for (const { tool_call_id, result } of toolResults) {
          messages.push({
            role: 'tool',
            tool_call_id: tool_call_id,
            content: JSON.stringify(result)
          });
        }

        console.log(`📨 Added ${toolResults.length} tool result(s) to conversation`);
        // Loop continues - LLM will process results in next iteration
      } else {
        // No tool calls - LLM generated final response
        // Sanitize the content before saving and sending
        const sanitizedContent = sanitizeAIMessage(assistantMessage.content);

        // Update the assistant message content with sanitized version
        assistantMessage.content = sanitizedContent;

        // Add the final assistant message to the conversation history
        messages.push(assistantMessage);
        reply = sanitizedContent;
        continueLoop = false;
        console.log(`💬 LLM generated final response (loop complete after ${iterations} iteration(s))`);
      }
    }

    // Safety check: if we hit max iterations, get what we have
    if (iterations >= maxIterations) {
      console.warn('⚠️ REACT loop hit max iterations limit');
      if (!reply) {
        reply = 'I got a bit overwhelmed with that request. Please try again!';
      }
      // Add a final assistant message since we never got one from the loop
      messages.push({
        role: 'assistant',
        content: reply
      });
      console.log('📝 Added fallback assistant message to conversation history');
    }

    // Handle dashboard link if it was requested during the loop
    if (lastDashboardLink) {
      try {
        console.log('🔗 Generating dashboard link...');
        const dashboardResponse = await axios.post(`${process.env.BASE_URL || 'http://localhost:8080'}/api/generate-dashboard-link`, {
          phone_number: phone
        });

        const { dashboard_url, user_name } = dashboardResponse.data;

        // Use generateDashboardRedirectMessage with the URL (generic field for profile updates)
        reply = generateDashboardRedirectMessage('profile', user_name, dashboard_url);

        // Sanitize the dashboard message before sending and saving
        reply = sanitizeAIMessage(reply);

        // Update the last assistant message in the conversation to reflect what was actually sent
        // This ensures conversation history matches what the user saw
        const lastMessageIndex = messages.length - 1;
        if (lastMessageIndex >= 0 && messages[lastMessageIndex].role === 'assistant') {
          messages[lastMessageIndex].content = reply;
          console.log('📝 Updated last assistant message with dashboard link');
        }

        console.log('✅ Dashboard link generated and incorporated');
      } catch (error) {
        console.error('❌ Error generating dashboard link:', error);
        // Still use the LLM response if dashboard link fails
      }
    }

    console.log('🎭 REACT AGENT COMPLETE');
    console.log(`📊 Total iterations: ${iterations}`);
    console.log(`📝 Final response: ${reply.substring(0, 100)}...`);

    // ============================================================================
    // UPDATE CONVERSATION HISTORY WITH CURRENT EXCHANGE
    // ============================================================================

    if (userSession) {
      // Save all messages from this turn (user message + tool calls + results + final response)
      // This preserves the full context including tool interactions
      const newMessages = messages.slice(messageStartIndex);

      if (newMessages.length > 0) {
        userSession.conversationHistory.push(...newMessages);
        console.log(`📝 Saved ${newMessages.length} messages to conversation history (including tool calls and results)`);
        console.log('   - User messages:', newMessages.filter(m => m.role === 'user').length);
        console.log('   - Assistant messages:', newMessages.filter(m => m.role === 'assistant').length);
        console.log('   - Tool messages:', newMessages.filter(m => m.role === 'tool').length);
      }

      console.log('📝 Total conversation history length:', userSession.conversationHistory.length);
    }
    // All conversation and meal handling is now handled by the unified ReAct agent above
    // The LLM decides what functions to call, and the tool execution layer handles all operations

    // ============================================================================
    // SEND RESPONSE VIA REST API (NO TIMEOUT CONSTRAINTS)
    // ============================================================================

    // Check if message exceeds WhatsApp limit (1600 chars)
    if (reply && reply.length > 1500) {
      console.log('📏 Long message detected:', reply.length, 'characters');
      console.log('✂️ Splitting into chunks...');

      // Split message intelligently
      const chunks = splitMessageIntelligently(reply);

      console.log('📦 Created', chunks.length, 'message chunks');

      // Send chunks via REST API
      await sendWhatsAppMessageChunks(phone, chunks, 1000);
    } else {
      // Normal single message via REST API
      await sendWhatsAppMessage(phone, reply);
    }

    // Save updated session to Redis
    if (userSession) {
      await updateUserSession(phone, userSession);
      console.log('💾 Final session save completed');
    }

    console.log('✅ Message processing complete');
  } catch (err) {
    console.error('⚠️ Error in async message processing:', err);
    console.error('📍 Error stack:', err.stack);

    // Send error message to user via REST API
    try {
      await sendWhatsAppMessage(phone, '⚠️ Something went wrong processing your message. Please try again.');
    } catch (sendError) {
      console.error('❌ Failed to send error message to user:', sendError);
    }
  }
};

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
    
    // ============================================================================
    // 🔍 DEBUG: CHECK WHERE USER_AGENT AND USER_IP ARE COMING FROM
    // ============================================================================
    console.log('');
    console.log('🔍 ========== DEBUG: IP & USER AGENT INVESTIGATION ==========');
    console.log('');
    console.log('1️⃣ FROM REQUEST BODY (userData):');
    console.log('   - userData.user_agent:', userData?.user_agent || 'NOT PRESENT');
    console.log('   - userData.user_ip:', userData?.user_ip || 'NOT PRESENT');
    console.log('');
    console.log('2️⃣ FROM REQUEST HEADERS:');
    console.log('   - req.headers["user-agent"]:', req.headers['user-agent'] || 'NOT PRESENT');
    console.log('   - req.headers["x-forwarded-for"]:', req.headers['x-forwarded-for'] || 'NOT PRESENT');
    console.log('   - req.headers["x-real-ip"]:', req.headers['x-real-ip'] || 'NOT PRESENT');
    console.log('');
    console.log('3️⃣ FROM REQUEST OBJECT:');
    console.log('   - req.ip:', req.ip || 'NOT PRESENT');
    console.log('   - req.connection.remoteAddress:', req.connection?.remoteAddress || 'NOT PRESENT');
    console.log('   - req.socket.remoteAddress:', req.socket?.remoteAddress || 'NOT PRESENT');
    console.log('');
    console.log('4️⃣ ALL REQUEST HEADERS:');
    console.log(JSON.stringify(req.headers, null, 2));
    console.log('');
    console.log('🔍 ========== END DEBUG ==========');
    console.log('');
    // ============================================================================
    
    console.log('📦 Received data:');
    console.log('  - checkoutKey:', checkoutKey);
    console.log('  - sessionId:', sessionId);
    console.log('  - userData:', userData);    console.log('🔍 NEW FIELDS DEBUG:');
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
  
  // ============================================================================
  // DUPLICATE PHONE CHECK - Search Stripe's customer database
  // ============================================================================
  
  
  if (finalPhoneNumber && !finalPhoneNumber.startsWith('email:') && !finalPhoneNumber.startsWith('stripe:')) {
    console.log('');
    console.log('🔍 ========== DUPLICATE PHONE CHECK ==========');
    console.log('🔍 Searching Stripe for phone:', finalPhoneNumber);
    
    try {
      // Search ALL Stripe customers for this phone number
      const existingCustomers = await stripe.customers.search({
        query: `phone:'${finalPhoneNumber}'`,
      });
      
      console.log('📊 Total customers found with this phone:', existingCustomers.data.length);
      
      // Filter out:
      // 1. The current customer (the one who just signed up)  
      // 2. Customers with NO active subscriptions (old cancelled/deleted accounts)
      const activeDuplicates = [];
      
      for (const customer of existingCustomers.data) {
        // Skip current customer
        if (customer.id === stripeCustomerId) {
          console.log('   ℹ️  Skipping current customer:', customer.id);
          continue;
        }
        
        // Check if this customer has any active subscriptions
        try {
          const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: 'active',
            limit: 1
          });
          
          if (subscriptions.data.length > 0) {
            console.log('   ⚠️  Found ACTIVE duplicate customer:', customer.id);
            activeDuplicates.push(customer);
          } else {
            console.log('   ℹ️  Ignoring inactive customer:', customer.id);
          }
        } catch (subError) {
          console.log('   ℹ️  Could not check subscriptions for:', customer.id);
        }
      }
      
      console.log('📊 Active duplicate customers with subscriptions:', activeDuplicates.length);
      
      if (activeDuplicates.length > 0) {
        console.log('❌ DUPLICATE PHONE DETECTED!');
        console.log('   - Phone number:', finalPhoneNumber);
        console.log('   - Existing customer(s):', activeDuplicates.map(c => c.id).join(', '));
        console.log('   - Current customer:', stripeCustomerId);
        console.log('');
        console.log('🗑️  Starting cleanup process...');
        
        // STEP 1: Cancel the subscription immediately
        if (stripeSubscriptionId && stripeSubscriptionId !== 'unknown') {
          try {
            await stripe.subscriptions.cancel(stripeSubscriptionId);
            console.log('✅ Subscription cancelled:', stripeSubscriptionId);
          } catch (cancelError) {
            console.error('⚠️  Error cancelling subscription:', cancelError.message);
          }
        }
        
        // STEP 2: Check if there was a charge and refund it
        try {
          const charges = await stripe.charges.list({
            customer: stripeCustomerId,
            limit: 1
          });
          
          if (charges.data.length > 0) {
            const charge = charges.data[0];
            
            if (charge.amount > 0 && charge.status === 'succeeded') {
              // Issue full refund
              const refund = await stripe.refunds.create({
                charge: charge.id,
                reason: 'duplicate'
              });
              
              console.log('💰 Refund issued:');
              console.log('   - Amount:', charge.amount / 100, charge.currency.toUpperCase());
              console.log('   - Charge ID:', charge.id);
              console.log('   - Refund ID:', refund.id);
            } else {
              console.log('ℹ️  No charge to refund (trial period or $0 charge)');
            }
          }
        } catch (refundError) {
          console.error('⚠️  Error processing refund:', refundError.message);
        }
        
        // STEP 3: Delete the duplicate customer from Stripe
        try {
          await stripe.customers.del(stripeCustomerId);
          console.log('✅ Duplicate customer deleted from Stripe:', stripeCustomerId);
        } catch (deleteError) {
          console.error('⚠️  Error deleting customer:', deleteError.message);
        }
        
        console.log('');
        console.log('✅ Cleanup complete - returning error to frontend');
        console.log('========== END DUPLICATE CHECK ==========');
        console.log('');
        
        // Return error to frontend
        return res.status(400).json({
          success: false,
          error: 'duplicate_phone',
          message: 'This phone number is already registered. Your payment has been refunded. Please use a different phone number or contact support for help.',
          phone: finalPhoneNumber,
          refunded: true
        });
      } else {
        console.log('✅ No duplicate found - phone number is unique');
        console.log('========== END DUPLICATE CHECK ==========');
        console.log('');
      }
      
    } catch (searchError) {
      console.error('⚠️  Error searching for duplicates:', searchError.message);
      console.log('⚠️  Continuing with user creation despite search error...');
      console.log('========== END DUPLICATE CHECK ==========');
      console.log('');
      // Continue with user creation even if search fails
    }
  } else {
    console.log('ℹ️  Skipping duplicate check (no valid phone number)');
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
      
      // Meta Tracking Data (Facebook Pixel)
      meta_fbp: userData?.meta_fbp || null,
      meta_fbc: userData?.meta_fbc || null,
      meta_event_id: userData?.meta_event_id || null,
      trial_plan: userData?.trial_plan || 'monthly',
      user_agent: userData?.user_agent || null,
      user_ip: userData?.user_ip || null,

      // Timestamp
      created_at: new Date().toISOString()
    };
    
    console.log('📊 Meta tracking data being saved:', {
      meta_fbp: finalUserData.meta_fbp ? 'Present' : 'Missing',
      meta_fbc: finalUserData.meta_fbc ? 'Present' : 'Missing',
      meta_event_id: finalUserData.meta_event_id ? 'Present' : 'Missing',
      trial_plan: finalUserData.trial_plan,
      user_agent: finalUserData.user_agent ? 'Present' : 'Missing',
      user_ip: finalUserData.user_ip ? 'Present' : 'Missing'
    });
    
    console.log('🎯 Final user data for Supabase:', finalUserData);
    
    // STEP 4: Insert into Supabase (strict - will fail if phone already exists)
    const { data, error } = await db.from('users')
      .insert(finalUserData)
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
    
    // Determine goal text (plain text for template, no asterisks)
    let goalText = 'Maintain weight but build muscle';
    let motivationText = 'If you stay consistent, you will lose fat and gain muscle over time, while keeping your weight stable 💪';

    if (fitnessGoal === 'lose_weight') {
      goalText = 'Lose weight';
      motivationText = 'If you stay consistent, you will lose weight and reach your ideal body type 🧘‍♂️🥗';
    } else if (fitnessGoal === 'gain_weight') {
      goalText = 'Gain weight & muscle';
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

    // Format diet preference for template (handle null case)
    const formattedDiet = dietPreference
      ? dietPreference.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
      : 'No specific diet';

    console.log('👋 Preparing template variables for:', firstName || 'user');
    console.log('📊 Template data:', {
      firstName: firstName || 'there',
      actualCalories,
      actualProtein,
      actualCarbs,
      actualFat,
      actualTDEE,
      actualWeight,
      goalText,
      formattedDiet,
      motivationText
    });

    // Send WhatsApp message using approved template
    try {
      const twilio = require('twilio')(process.env.ACCOUNT_SID, process.env.AUTH_TOKEN);

      const message = await twilio.messages.create({
        from: 'whatsapp:+447888873477',
        to: `whatsapp:${formattedPhone}`,
        contentSid: 'HX0693c71ffe84119d51bfaa8f098c8fc0', // triggerwelcome template
        contentVariables: JSON.stringify({
          '1': firstName || 'there',
          '2': actualCalories.toString(),
          '3': actualProtein.toString(),
          '4': actualCarbs.toString(),
          '5': actualFat.toString(),
          '6': actualTDEE.toString(),
          '7': actualWeight.toString(),
          '8': goalText,
          '9': formattedDiet,
          '10': motivationText
        })
      });
      
      console.log('✅ WhatsApp template message sent successfully');
      console.log('📱 Message SID:', message.sid);

      res.json({
        success: true,
        message: 'Welcome template message sent successfully',
        messageSid: message.sid,
        templateUsed: 'triggerwelcome'
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
      
      // Enable promo code field on Stripe checkout page
      allow_promotion_codes: true,
      
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
      console.log('👤 Customer ID:', session.customer);
      console.log('💳 Subscription ID:', session.subscription);
      
      // Check if a discount/coupon was used
      const discount = session.total_details?.amount_discount || 0;
      const couponUsed = discount > 0;
      let couponCode = null;
      
      if (couponUsed && session.discount) {
        couponCode = session.discount.coupon?.id || null;
        console.log('🎟️ Coupon used:', couponCode, '- Discount amount:', discount / 100);
      }
      
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
          created_at: new Date().toISOString(),
          // NEW: Track coupon usage
          coupon_used: couponUsed,
          coupon_code: couponCode,
          discount_amount: discount
        };
        
        console.log('🎯 STRIPE USER DATA READY FOR SUPABASE:', stripeUserData);
        
        // If coupon was used, add metadata to subscription for easy tracking
        if (couponUsed && session.subscription && couponCode) {
          try {
            console.log('🏷️ Adding coupon metadata to subscription...');
            await stripe.subscriptions.update(session.subscription, {
              metadata: {
                promo_code_used: couponCode,
                is_content_creator: couponCode.includes('100') ? 'true' : 'false',
                discount_applied: `${discount / 100} ${session.currency.toUpperCase()}`
              }
            });
            console.log('✅ Subscription metadata updated with coupon info');
          } catch (metaError) {
            console.error('❌ Error adding metadata to subscription:', metaError);
          }
        }
      }
    }
    
    // Handle subscription cancellation
    else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      console.log('🗑️ Subscription cancelled:', subscription.id);
      
      await handleSubscriptionCancellation(subscription);
    }

    // Handle successful charge after trial (FIRE META PURCHASE EVENT)
    else if (event.type === 'charge.succeeded') {
      const charge = event.data.object;
      console.log('💳 Charge succeeded:', charge.id);
      console.log('💰 Amount charged:', charge.amount / 100, charge.currency.toUpperCase());
      
      // Only fire Purchase event if this is NOT a $0 charge (i.e., actual payment after trial)
      if (charge.amount > 0) {
        console.log('✅ This is a REAL payment (not $0 trial) - firing Meta Purchase event');
        
        try {
          // Get customer ID from charge
          const customerId = charge.customer;
          
          // RETRY LOGIC: User creation might take a few seconds
          let user = null;
          let error = null;
          let attempts = 0;
          const maxAttempts = 5;
          
          while (attempts < maxAttempts && !user) {
            attempts++;
            
            // Wait before each attempt (3s, 5s, 7s, 9s, 11s)
            const waitTime = 1000 + (attempts * 2000);
            console.log(`⏳ Attempt ${attempts}/${maxAttempts}: Waiting ${waitTime/1000}s for user creation...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            // Find user in Supabase by Stripe customer ID
            const result = await db
              .from('users')
              .select('*')
              .eq('stripe_customer_id', customerId)
              .single();
            
            user = result.data;
            error = result.error;
            
            if (user) {
              console.log(`✅ User found on attempt ${attempts}`);
              break;
            }
          }
          
          if (error || !user) {
            console.log('❌ User not found after', maxAttempts, 'attempts. Customer ID:', customerId);
          } else if (user.purchase_event_sent) {
            console.log('⏭️ Purchase event already sent for this user, skipping');
          } else {
            console.log('🎯 Sending Meta Purchase event...');
            
            // Send Meta Purchase event
            const result = await sendMetaPurchaseEvent(user, charge);
            
            if (result.success) {
              console.log('✅ Meta Purchase event sent successfully!');
            } else {
              console.log('❌ Failed to send Meta Purchase event:', result.error);
            }
          }
        } catch (error) {
          console.error('❌ Error handling charge.succeeded for Meta tracking:', error);
        }
      } else {
        console.log('⏭️ Skipping Meta Purchase event - this is a $0 charge (trial start)');
      }
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

// Store Meta tracking data from frontend
app.post('/store-meta-data', async (req, res) => {
  console.log('📦 Received Meta tracking data from frontend');
  
  try {
    const { phone_number, email, meta_fbp, meta_fbc, trial_plan } = req.body;
    
    console.log('📊 Data received:', {
      phone_number,
      email,
      meta_fbp: meta_fbp ? 'Present' : 'Missing',
      meta_fbc: meta_fbc ? 'Present' : 'Missing',
      trial_plan
    });
    
    if (!phone_number) {
      return res.status(400).json({ 
        error: 'phone_number is required' 
      });
    }
    
    // Update user in Supabase with Meta tracking data
    const { data, error } = await db
      .from('users')
      .update({
        meta_fbp: meta_fbp,
        meta_fbc: meta_fbc,
        trial_plan: trial_plan || 'monthly',
        meta_event_id: `${phone_number}_${Date.now()}` // Unique event ID
      })
      .eq('phone_number', phone_number)
      .select();
    
    if (error) {
      console.error('❌ Supabase error:', error);
      return res.status(500).json({ 
        error: 'Failed to store Meta tracking data',
        details: error.message 
      });
    }
    
    if (!data || data.length === 0) {
      console.log('⚠️ User not found with phone:', phone_number);
      return res.status(404).json({ 
        error: 'User not found',
        phone_number 
      });
    }
    
    console.log('✅ Meta tracking data stored successfully for:', phone_number);
    
    res.json({ 
      success: true,
      message: 'Meta tracking data stored successfully',
      user: {
        phone_number: data[0].phone_number,
        email: data[0].email,
        trial_plan: data[0].trial_plan
      }
    });
    
  } catch (error) {
    console.error('❌ Error storing Meta tracking data:', error);
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Test endpoint to manually trigger Meta Purchase event
app.post('/test-meta-purchase', async (req, res) => {
  console.log('🧪 Manual Meta Purchase event test triggered');
  
  try {
    const { phone_number } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ 
        error: 'phone_number is required',
        example: { phone_number: '+96170123456' }
      });
    }
    
    console.log('📞 Looking for user with phone:', phone_number);
    
    // Find user in Supabase
    const { data: user, error } = await db
      .from('users')
      .select('*')
      .eq('phone_number', phone_number)
      .single();
    
    if (error || !user) {
      console.log('❌ User not found');
      return res.status(404).json({ 
        error: 'User not found',
        phone_number: phone_number
      });
    }
    
    console.log('✅ User found:', {
      email: user.email,
      phone: user.phone_number,
      plan: user.trial_plan,
      purchase_event_sent: user.purchase_event_sent
    });
    
    if (user.purchase_event_sent) {
      console.log('⚠️ Purchase event already sent for this user');
      return res.json({
        success: true,
        message: 'Purchase event was already sent for this user',
        already_sent: true,
        user: {
          email: user.email,
          phone: user.phone_number,
          plan: user.trial_plan
        }
      });
    }
    
    // Send Meta Purchase event
    console.log('🎯 Sending Meta Purchase event...');
    const result = await sendMetaPurchaseEvent(user, {
      amount: user.trial_plan === 'yearly' ? 5988 : 1999,
      currency: 'usd',
      id: 'test_charge_' + Date.now()
    });
    
    if (result.success) {
      console.log('✅ Meta Purchase event sent successfully!');
      res.json({
        success: true,
        message: 'Meta Purchase event sent successfully',
        user: {
          email: user.email,
          phone: user.phone_number,
          plan: user.trial_plan
        },
        meta_response: result.response
      });
    } else {
      console.log('❌ Failed to send Meta Purchase event');
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('❌ Test endpoint error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
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

// ============================================================================
// GRACEFUL SHUTDOWN HANDLERS
// ============================================================================

const gracefulShutdown = async (signal) => {
  console.log(`\n⚠️  ${signal} received, starting graceful shutdown...`);

  // Close HTTP server first (stop accepting new connections)
  server.close(() => {
    console.log('✅ HTTP server closed');
  });

  // Close Redis connection
  if (redisClient && redisClient.isOpen) {
    try {
      await redisClient.quit();
      console.log('✅ Redis connection closed');
    } catch (err) {
      console.error('❌ Error closing Redis:', err);
    }
  }

  console.log('👋 Shutdown complete, exiting...');
  process.exit(0);
};

// Handle Ctrl+C
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle termination signal (e.g., from kill command)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
