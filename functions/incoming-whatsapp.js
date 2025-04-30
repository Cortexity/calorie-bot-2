const twilio = require('twilio');
const OpenAI = require('openai').default;
const axios  = require('axios');

exports.handler = async function (context, event, callback) {
  const twiml = new twilio.twiml.MessagingResponse();

  const OPENAI_API_KEY = (context.OPENAI_API_KEY || '').trim();
  const ACCOUNT_SID    = context.ACCOUNT_SID;
  const AUTH_TOKEN     = context.AUTH_TOKEN;

  const mediaUrl = event.MediaUrl0;
  const body     = (event.Body || '').trim().toLowerCase();

  try {
    if (mediaUrl) {
      twiml.message('🔍 Analyzing your food photo now…');

      const imgResp = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        auth: { username: ACCOUNT_SID, password: AUTH_TOKEN }
      });
      const base64 = Buffer.from(imgResp.data, 'binary').toString('base64');

      const openai = new OpenAI({
        apiKey : OPENAI_API_KEY,
        project: 'proj_DmcJkr3mXaaqNaFIbf5s5r9V'
      });

      const chat = await openai.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: 'You are a nutritionist assistant. Identify food, estimate macros, respond with friendly emojis.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'What food is in this image? Give calories, protein, carbs, fats.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64}`,
                  detail: 'low'
                }
              }
            ]
          }
        ]
      });

      twiml.message(`✅ Meal logged!\n\n${chat.choices[0].message.content}`);

    } else if (body.startsWith('summary')) {
      twiml.message('📊 Placeholder summary…');
    } else {
      twiml.message('👋 Hi! Send me a food photo or type “summary”.');
    }

  } catch (err) {
    console.error('Vision error detail:', err.response?.data || err.message);
    twiml.message('⚠️ Something went wrong. Try again.');
  }

  callback(null, twiml);
};
