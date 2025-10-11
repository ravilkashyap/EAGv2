// Test script to verify Gemini API connectivity
const SUMMARIZER_MODEL = 'gemini-2.5-flash-latest';

// Get API key from Chrome storage (this would need to be run in the extension context)
async function getApiKey() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['geminiApiKey'], (res) => resolve(res.geminiApiKey || ''));
    } else {
      // For testing outside extension, you can set a test key here
      resolve('');
    }
  });
}

async function testGeminiAPI() {
  const apiKey = await getApiKey();
  console.log('API key present:', !!apiKey);
  console.log('API key length:', apiKey ? apiKey.length : 0);

  if (!apiKey) {
    console.error('❌ No API key configured. Please set up your Gemini API key in the extension options.');
    return;
  }

  const testPrompt = `You are a helpful assistant. Test: What is 2+2? Respond with just the number.`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${SUMMARIZER_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = { contents: [ { parts: [{ text: testPrompt }] } ] };

  try {
    console.log('🔄 Testing API connection...');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    console.log('📊 Response status:', resp.status);

    if (!resp.ok) {
      console.error('❌ API request failed:', resp.status, resp.statusText);
      const errorText = await resp.text();
      console.error('Error details:', errorText);
      return;
    }

    const data = await resp.json();
    console.log('📦 Response data:', JSON.stringify(data, null, 2));

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const result = parts.map(p => p?.text || '').filter(Boolean).join('\n');

    if (result) {
      console.log('✅ API test successful! Response:', result);
    } else {
      console.error('❌ Empty response from API');
      console.log('Full response:', data);
    }

  } catch (error) {
    console.error('❌ API call error:', error);
  }
}

// Run the test
testGeminiAPI().then(() => {
  console.log('🏁 Test completed');
});
