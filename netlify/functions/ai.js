// netlify/functions/ai.js

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

  const userMessage = body.message; // This will be defined for Gemini/Deepseek calls
  const provider = (body.provider || 'gemini').toLowerCase(); // default to 'gemini'
  const query = body.query; // This will be the actual search query if provider is 'brave'

  console.log(`[ai.js] Received request - Provider: ${provider}, Message: "${userMessage}", Query: "${query}"`);

  if (!userMessage && !query) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No message or query provided in the request' }),
    };
  }

  // --- Get Current Date and Time for AI Context ---
  const currentDate = new Date();
  const formattedDate = currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const currentTime = currentDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });

  // Add current location if available (from context or a hardcoded default)
  const currentLocation = "Dhaka, Dhaka Division, Bangladesh"; // From your context
  const systemPromptContent = `Current date: ${formattedDate}, time: ${currentTime}. Current location: ${currentLocation}.`;
  // --------------------------------------------------

  try {
    let replyText = '';

    if (provider === 'gemini') {
      console.log('[ai.js] Handling Gemini request.');
      if (!process.env.GEMINI_API_KEY) {
        console.error('[ai.js] GEMINI_API_KEY is not set!');
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'GEMINI_API_KEY environment variable not set.' }),
        };
      }

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      // Combine system info with user message for Gemini
      const fullMessage = `${systemPromptContent}\n\nUser: ${userMessage}`;

      console.log('Calling Google Gemini 2.0 Flash with full message:', fullMessage);
      const geminiResult = await geminiModel.generateContent(fullMessage);
      const geminiResponse = await geminiResult.response;
      replyText = geminiResponse.text().trim();
      console.log('Gemini Reply:', replyText);

    } else if (provider === 'deepseek') {
      console.log('[ai.js] Handling Deepseek request.');
      if (!process.env.OPENROUTER_API_KEY) {
        console.error('[ai.js] OPENROUTER_API_KEY is not set!');
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'OPENROUTER_API_KEY environment variable not set.' }),
        };
      }

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
            { role: 'system', content: systemPromptContent }, // Add system prompt
            { role: 'user', content: userMessage }
          ],
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

    } else if (provider === 'brave') {
      console.log('[ai.js] Handling Brave search request. Query:', query);
      if (!process.env.BRAVE_API_KEY) {
        console.error('[ai.js] BRAVE_API_KEY is not set!');
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'BRAVE_API_KEY environment variable not set.' }),
        };
      }
      if (!query) {
        console.error('[ai.js] Brave search: No query provided.');
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'No query provided for Brave search.' }),
        };
      }

      const braveEndpoint = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`;
      console.log('[ai.js] Fetching from Brave API:', braveEndpoint);

      const braveResponse = await fetch(braveEndpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': process.env.BRAVE_API_KEY,
        },
      });

      if (!braveResponse.ok) {
        const errText = await braveResponse.text();
        console.error('[ai.js] Brave API Error (Status:', braveResponse.status, '):', errText);
        throw new Error(`Brave Search API returned an error: ${errText}`);
      }

      const braveData = await braveResponse.json();
      console.log('[ai.js] Brave Search Results received:', JSON.stringify(braveData, null, 2));

      let results = [];
      if (braveData.web && braveData.web.results) {
        results = braveData.web.results.slice(0, 5).map(item => ({
          title: item.title,
          url: item.url,
          snippet: item.description,
        }));
      }

      if (results.length > 0) {
        replyText = "Here are some web search results:\n\n";
        results.forEach((r, index) => {
          replyText += `${index + 1}. **[${r.title}](${r.url})**\n`;
          replyText += `   ${r.snippet}\n\n`;
        });
      } else {
        replyText = "I couldn't find any relevant results for your search query on the web.";
      }

    } else {
      console.warn(`[ai.js] Unsupported AI provider received: ${provider}`);
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Unsupported AI provider: ${provider}. Supported: 'gemini', 'deepseek', 'brave'`
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ reply: replyText }),
    };

  } catch (err) {
    console.error('[ai.js] Netlify Function Handler Error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server error during AI API call: ' + err.message }),
    };
  }
};