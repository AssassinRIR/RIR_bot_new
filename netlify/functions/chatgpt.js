// netlify/functions/ai.js

// Ensure you have these installed:
// npm install node-fetch @google/generative-ai

const fetch = require('node-fetch'); // Explicitly require for consistency/older Node.js versions
const { GoogleGenerativeAI } = require('@google/generative-ai');

exports.handler = async function (event, context) {
  // 1. Parse incoming JSON
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
      // ─── GOOGLE GEMINI CALL ───────────────────────────────────────────────────
      if (!process.env.GEMINI_API_KEY) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'GEMINI_API_KEY environment variable not set.' }),
        };
      }
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      // Use the "gemini-pro" model for text-based chat
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

      console.log('Calling Google Gemini Pro with message:', userMessage);
      const result = await model.generateContent(userMessage);
      const response = await result.response;
      replyText = response.text().trim();
      console.log('Gemini Reply:', replyText);

    } else if (provider === 'deepseek') {
      // ─── OPENROUTER DEEPSEEK CALL ─────────────────────────────────────────────
      if (!process.env.OPENROUTER_API_KEY) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'OPENROUTER_API_KEY environment variable not set.' }),
        };
      }

      // The endpoint below assumes OpenRouter’s public chat-completions URL.
      // If your OpenRouter domain is different, replace the URL accordingly.
      const openRouterEndpoint = 'https://api.openrouter.ai/v1/chat/completions';

      console.log('Calling OpenRouter Deepseek with message:', userMessage);
      const deepseekResponse = await fetch(openRouterEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Use OPENROUTER_API_KEY to authenticate
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek', // Deepseek model name on OpenRouter
          messages: [
            { role: 'user', content: userMessage }
          ],
          // you can add other parameters here if you need (e.g., temperature, max_tokens, etc.)
        }),
      });

      if (!deepseekResponse.ok) {
        const errText = await deepseekResponse.text();
        console.error('OpenRouter Deepseek API Error (Status:', deepseekResponse.status, '):', errText);
        throw new Error(`Deepseek API returned an error: ${errText}`);
      }

      const deepseekData = await deepseekResponse.json();
      // Expected JSON shape:
      // {
      //   id: "...",
      //   choices: [
      //     {
      //       message: { role: "assistant", content: "..." },
      //       ...
      //     }
      //   ],
      //   ...
      // }
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
