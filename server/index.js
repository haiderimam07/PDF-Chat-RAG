import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { Queue } from 'bullmq'
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import { OpenAIEmbeddings } from "@langchain/openai"
import { OllamaEmbeddings, ChatOllama } from "@langchain/ollama";
import { QdrantVectorStore } from "@langchain/qdrant"
import OpenAI from "openai"
import 'dotenv/config';

const llm = new ChatOllama({
  model: "llama3.2:1b",
  baseUrl: "http://localhost:11434",
  temperature: 0.1,
});

const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text",
  baseUrl: "http://localhost:11434",
});

const queue = new Queue('file-upload-queue', {
  connection: {
    host: 'localhost',
    port: '6379',
  },
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, `${uniqueSuffix} - ${file.originalname}`)
  }
});

const upload = multer({ storage: storage });

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  return res.json({ status: 'All Good' })
});

app.post('/upload/pdf', upload.single('pdf'), async (req, res) => {
  await queue.add('file-ready', JSON.stringify({
    filename: req.file.originalname,
    destination: req.file.destination,
    path: req.file.path
  }))
  res.json({ message: 'uploaded' })
});

app.get('/chat', async (req, res) => {
  const UserQuery = req.query.message;

  if (!UserQuery) {
    return res.status(400).json({ error: "Message query is required" });
  }

  const startTime = performance.now();

  // ---------------------------------------------------------
  // 1. Measure Vector Retrieval (Embedding + Qdrant Search)
  // ---------------------------------------------------------
  const retrievalStart = performance.now();
  
  const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
    url: process.env.QDRANT_URL,
    collectionName: "langchainjs-gemini",
  });
  
  const retriever = vectorStore.asRetriever({ k: 2 });
  const result = await retriever.invoke(UserQuery);
  
  const retrievalTime = (performance.now() - retrievalStart).toFixed(2);

  // ---------------------------------------------------------
  // 2. Construct System Prompt
  // ---------------------------------------------------------
  const SYSTEM_PROMPT = `
You are an expert AI assistant that answers questions accurately using only the provided context. 

Strictly adhere to the following rules:
1. Rely ONLY on the information given in the "Retrieved Context" section below to answer the user's query. Do not assume, extrapolate, or bring in outside knowledge.
2. If the answer cannot be found or logically inferred from the provided context, state clearly: "I cannot find the answer in the provided documents." Do not try to make up an answer.
3. Keep your response concise, factual, and directly related to the user's question.
4. If the context contains conflicting information, present both sides objectively.
Context:
${JSON.stringify(result)}
  `;

  // ---------------------------------------------------------
  // 3. Measure LLM Generation Latency
  // ---------------------------------------------------------
  const llmStart = performance.now();
  
  const chatResult = await llm.invoke([
    ["system", SYSTEM_PROMPT],
    ["user", UserQuery]
  ]);
  
  const llmTime = (performance.now() - llmStart).toFixed(2);
  const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
  
  // Calculate throughput estimation (~4 characters per token)
  const responseContent = chatResult.content || "";
  const estimatedTokens = Math.ceil(responseContent.length / 4);
  const tokensPerSec = (estimatedTokens / (parseFloat(llmTime) / 1000)).toFixed(2);

  // ---------------------------------------------------------
  // 4. Log Structured Metrics to Terminal
  // ---------------------------------------------------------
  console.log(`\n==================================================`);
  console.log(`[RETRIEVAL METRICS SUMMARY] Query: "${UserQuery.substring(0, 35)}..."`);
  console.log(`• Chunks Retrieved    : ${result.length}`);
  console.log(`• Qdrant Search Speed : ${retrievalTime} ms`);
  console.log(`• LLM Generation Time : ${llmTime} ms`);
  console.log(`• Response Length     : ~${estimatedTokens} tokens`);
  console.log(`• Generation Rate     : ${tokensPerSec} tokens/sec`);
  console.log(`• End-to-End Latency  : ${totalTime} s`);
  console.log(`==================================================\n`);

  return res.json({ message: chatResult.content, docs: result });
});

app.listen(8000, () => console.log(`server running on port ${8000}`));