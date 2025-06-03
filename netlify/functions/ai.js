// netlify/functions/ai.js

// Ensure you have these installed:
// npm install node-fetch @google/generative-ai

const fetch = require('node-fetch');
const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async function (event, context) {
  // 1) Parse incoming JSON
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    console.error('JSON Parse Error:', e);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON in request body' }),
    };
  }

  const userMessage = body.message;
  const provider = (body.provider || 'gemini').toLowerCase(); // default to 'gemini'

  if (!userMessage) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No message provided in the request' }),
    };
  }

  try {
    let replyText = '';

    if (provider === 'gemini') {
      // ─── GOOGLE GEMINI CALL (Gemini 2.0 Flash) ─────────────────────────────────────────
      if (!process.env.GEMINI_API_KEY) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'GEMINI_API_KEY environment variable not set.' }),
        };
      }

      // Initialize the GoogleGenerativeAI client with your key
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

      // Use “gemini-2.0-flash” model for this example
      const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      console.log('Calling Google Gemini 2.0 Flash with message:', userMessage);
      const geminiResult = await geminiModel.generateContent(userMessage);
      const geminiResponse = await geminiResult.response;
      replyText = geminiResponse.text().trim();
      console.log('Gemini Reply:', replyText);

    } else if (provider === 'deepseek') {
      // ─── OPENROUTER DEEPSEEK CALL (deepseek-chat-v3-0324:free) ──────────────────────────
      if (!process.env.OPENROUTER_API_KEY) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'OPENROUTER_API_KEY environment variable not set.' }),
        };
      }

      // OpenRouter chat-completions endpoint
      const openRouterEndpoint = 'https://api.openrouter.ai/v1/chat/completions';

      console.log('Calling OpenRouter Deepseek (v3-0324:free) with message:', userMessage);
      const deepseekResponse = await fetch(openRouterEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat-v3-0324:free',
          messages: [
            { role: 'user', content: userMessage }
          ],
          // (Optional) you can add temperature, max_tokens, etc. here
        }),
      });

      if (!deepseekResponse.ok) {
        const errText = await deepseekResponse.text();
        console.error('OpenRouter Deepseek API Error (Status:', deepseekResponse.status, '):', errText);
        throw new Error(`Deepseek API returned an error: ${errText}`);
      }

      const deepseekData = await deepseekResponse.json();
      if (
        deepseekData.choices &&
        deepseekData.choices[0] &&
        deepseekData.choices[0].message &&
        deepseekData.choices[0].message.content
      ) {
        replyText = deepseekData.choices[0].message.content.trim();
      } else {
        console.error('Unexpected Deepseek response structure:', deepseekData);
        throw new Error('Unexpected Deepseek API response structure.');
      }
      console.log('Deepseek Reply:', replyText);

    } else {
      // Unknown provider
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Unsupported AI provider: ${provider}. Supported: 'gemini', 'deepseek'`
        }),
      };
    }

    // ─── Return the chosen-provider’s reply ───────────────────────────────────────────
    return {
      statusCode: 200,
      body: JSON.stringify({ reply: replyText }),
    };

  } catch (err) {
    console.error('Netlify Function Handler Error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error during AI API call: ' + err.message }),
    };
  }
};