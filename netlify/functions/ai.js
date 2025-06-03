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

  const userMessage = body.message;
  const provider = (body.provider || 'gemini').toLowerCase(); // default to 'gemini'
  const query = body.query; // New: For Brave search queries

  if (!userMessage && !query) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'No message or query provided in the request' }),
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

    } else if (provider === 'brave') {
      // ─── BRAVE SEARCH API CALL ──────────────────────────────────────────
      if (!process.env.BRAVE_API_KEY) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'BRAVE_API_KEY environment variable not set.' }),
        };
      }
      if (!query) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'No query provided for Brave search.' }),
        };
      }

      const braveEndpoint = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`;
      console.log('Calling Brave Search API with query:', query);

      const braveResponse = await fetch(braveEndpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': process.env.BRAVE_API_KEY,
        },
      });

      if (!braveResponse.ok) {
        const errText = await braveResponse.text();
        console.error('Brave API Error (Status:', braveResponse.status, '):', errText);
        throw new Error(`Brave Search API returned an error: ${errText}`);
      }

      const braveData = await braveResponse.json();
      console.log('Brave Search Results:', braveData);

      // Extract and format relevant search results
      let results = [];
      if (braveData.web && braveData.web.results) {
        results = braveData.web.results.slice(0, 5).map(item => ({ // Take top 5 results
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
      // Unknown provider
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Unsupported AI provider: ${provider}. Supported: 'gemini', 'deepseek', 'brave'`
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