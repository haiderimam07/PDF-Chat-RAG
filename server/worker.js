import { Worker } from "bullmq";
import { OllamaEmbeddings } from "@langchain/ollama";
import { QdrantVectorStore } from "@langchain/qdrant";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import fs from "fs";
import 'dotenv/config';

// Instantiated globally to maintain keep-alive TCP connections across jobs
const embeddings = new OllamaEmbeddings({
  model: "nomic-embed-text",
  baseUrl: "http://localhost:11434",
});

const worker = new Worker('file-upload-queue', async (job) => {
    const data = typeof job.data === 'string' ? JSON.parse(job.data) : job.data;
    
    // 1. Gather File Statistics
    const fileStats = fs.existsSync(data.path) ? fs.statSync(data.path) : { size: 0 };
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
    
    console.log(`\n========================================`);
    console.log(`[Job ${job.id}] Processing: ${data.filename || data.path} (${fileSizeMB} MB)`);
    
    const startTime = performance.now();

    // 2. Document Parsing
    const parseStart = performance.now();
    const loader = new PDFLoader(data.path);
    const docs = await loader.load();
    const parseDurationMs = (performance.now() - parseStart).toFixed(2);
    
    // 3. Document Chunking
    const chunkStart = performance.now();
    const splitter = new RecursiveCharacterTextSplitter({ 
        chunkSize: 300,
        chunkOverlap: 10 
    });
    const texts = await splitter.splitDocuments(docs);
    const chunkDurationMs = (performance.now() - chunkStart).toFixed(2);

    // Guard Clause for scanned/image PDFs
    if (texts.length === 0) {
        console.warn(`[Job ${job.id}] Skipped: 0 text chunks extracted.`);
        return;
    }

    // 4. Vector Embedding & Qdrant Ingestion
    const embedStart = performance.now();
    const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
        url: process.env.QDRANT_URL || "http://localhost:6333",
        collectionName: "langchainjs-gemini",
    });

    await vectorStore.addDocuments(texts);
    const embedDurationMs = (performance.now() - embedStart).toFixed(2);

    // 5. Total Latency & Throughput Calculations
    const totalDurationSec = ((performance.now() - startTime) / 1000).toFixed(2);
    const throughputMBps = (fileSizeMB / totalDurationSec).toFixed(2);
    const msPerChunk = (embedDurationMs / texts.length).toFixed(2);

    // Quantifiable Resume Metrics Summary Output
    console.log(`\n📊 [JOB ${job.id} RESUME METRICS SUMMARY]`);
    console.log(`• File Size        : ${fileSizeMB} MB (${docs.length} pages)`);
    console.log(`• Total Chunks     : ${texts.length} chunks`);
    console.log(`• Parse Speed      : ${parseDurationMs} ms`);
    console.log(`• Chunking Speed   : ${chunkDurationMs} ms`);
    console.log(`• Embedding Speed  : ${embedDurationMs} ms (${msPerChunk} ms/chunk)`);
    console.log(`• End-to-End Time  : ${totalDurationSec} s`);
    console.log(`• Processing Rate  : ${throughputMBps} MB/sec`);
    console.log(`========================================\n`);
  },
  {
    concurrency: 1,
    connection: {
      host: 'localhost',
      port: 6379,
    },
  }
);

worker.on('failed', (job, err) => {
  console.error(`[Job ${job?.id} Failed]:`, err.message);
});