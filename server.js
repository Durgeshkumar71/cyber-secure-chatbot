require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Groq client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Cyber Secure ChatBot Backend Running!' });
});

// Register route
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, user: data.user });
});

// Login route
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.json({ success: false, error: error.message });
  res.json({ success: true, token: data.session.access_token, user: data.user });
});

// Upload route
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    let content = '';
    
    if (req.file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(req.file.path);
      const pdfData = await pdfParse(dataBuffer);
      content = pdfData.text;
    } else {
      content = fs.readFileSync(req.file.path, 'utf8');
    }
    
    fs.unlinkSync(req.file.path);
    res.json({ success: true, content: content });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Chat route - with history save
app.post('/api/chat', async (req, res) => {
  try {
    const { query, context } = req.body;
    const token = req.headers.authorization?.split(' ')[1];

    // Get user from token
    const { data: { user } } = await supabase.auth.getUser(token);

    const prompt = context 
      ? `You are CyberGuard AI, an expert cybersecurity analyst. Analyze the following document content and answer the query from a cybersecurity perspective. Always mention security implications, vulnerabilities, or threats when relevant.\n\nDOCUMENT CONTENT:\n${context}\n\nQUERY: ${query}`
      : `You are CyberGuard AI, an expert cybersecurity analyst. Answer the following query from a cybersecurity perspective. Always mention security implications, vulnerabilities, or threats when relevant.\n\nQUERY: ${query}`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
    });

    const botResponse = completion.choices[0].message.content;

    // Save to chat history
    await supabase.from('chat_history').insert({
      user_id: user.id,
      user_message: query,
      bot_response: botResponse
    });

    res.json({ response: botResponse });
  } catch (error) {
    res.json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔐 Cyber Secure ChatBot running on port ${PORT}`);
});