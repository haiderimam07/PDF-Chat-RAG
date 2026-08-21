// import { Worker } from "bullmq";
// import {OpenAIEmbeddings } from "@langchain/openai"
// import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
// import { OllamaEmbeddings } from "@langchain/ollama";
// import {QdrantVectorStore} from "@langchain/qdrant"
// import {Document} from "@langchain/core/documents"
// import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
// import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
// import 'dotenv/config'

// const worker= new Worker('file-upload-queue', async (job) =>{
    
//     console.log(`job:`, job.data);
//     const data= JSON.parse(job.data)

//     console.log(`\n========================================`);
//     console.log(`[Job ${job.id}] Started -> Processing: ${data.filename || data.path}`);
//     console.time(`total-job-${job.id}`);
//     //overall job timer
//     console.time(`total-job-${job.id}`);
//     // steps to do now as pdf has reached to the server
//     /*
//         Read the data from the path that we can get form data.path 
//         chunk the pdf
//         call the open AI embedding model for the chunk of the pdf
//         store the chunk in quadrant db
//         load the pdf using langchian pdf loader
//     */
//     // load the pdf 
//     console.time(`parse-${job.id}`);    
//     const loader = new PDFLoader(data.path)
//     const docs = await loader.load()
//     console.timeEnd(`parse-${job.id}`);

//     //chunking
//      console.time(`chunk-${job.id}`);
//     const splitter = new RecursiveCharacterTextSplitter({ 
//         chunkSize: 300,
//         chunkOverlap: 10 });
//     const texts = await splitter.splitDocuments(docs)
//     console.timeEnd(`chunk-${job.id}`);
//     console.log(`  -> produced ${texts.length} chunks`);
//     // console.log(texts)
//     // const embeddings = new OpenAIEmbeddings({
//     //     model: "text-embedding-3-small",
//     //     apiKey: process.env.OPEN_API_KEY
//     // });
//     // const embeddings = new GoogleGenerativeAIEmbeddings({
//     //   model: "gemini-embedding-004",
//     //   apiKey: process.env.GEMINI_API_KEY,
//     //   maxConcurrency: 2, // Limits simultaneous outbound API requests
//     //     maxRetries: 5,
//     // });
//         const embeddings = new OllamaEmbeddings({
//         model: "nomic-embed-text",
//         baseUrl: "http://localhost:11434",
//     });
//     const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
//         url: process.env.QDRANT_URL,
//         collectionName: "langchainjs-gemini",
//     });

//     console.time(`embed-and-store-${job.id}`);
//     await vectorStore.addDocuments(texts);
//     console.timeEnd(`embed-and-store-${job.id}`);

    
//     console.timeEnd(`total-job-${job.id}`);
//     console.log(`  -> job ${job.id} fully indexed and ready to query`);
//     },
//     {
//         concurrency:1,
//         connection:{
//             host:'localhost',
//             port:'6379',
//         },
//     }
// );

//index.js

// import express from 'express'
// import cors from 'cors'
// import multer from 'multer'
// import { Queue } from 'bullmq'
// import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
// import {OpenAIEmbeddings } from "@langchain/openai"
// import { OllamaEmbeddings, ChatOllama } from "@langchain/ollama";

// import {QdrantVectorStore} from "@langchain/qdrant"
// import OpenAI from "openai"
// import 'dotenv/config'; // Add this as line 1

// // const client= new OpenAI({
// //   apiKey: process.env.GROQ_API_KEY,
// //   baseURL: 'https://api.groq.com/openai/v1',

// // })
// const llm = new ChatOllama({
//   model: "llama3.2:1b", // Change to "qwen2.5:0.5b" if you want even faster responses
//   baseUrl: "http://localhost:11434",
//   temperature: 0.1,
// });

// // const embeddings = new GoogleGenerativeAIEmbeddings({
// //     model: "gemini-embedding-001",
// //     apiKey: process.env.GEMINI_API_KEY,
// //     maxConcurrency: 2, // Limits simultaneous outbound API requests
// //     maxRetries: 5,
// //   }); 
//   const embeddings = new OllamaEmbeddings({
//   model: "nomic-embed-text",
//   baseUrl: "http://localhost:11434",
// });
// const queue = new Queue('file-upload-queue',{
//   connection:{
//             host:'localhost',
//             port:'6379',
//         },
// })


// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, 'uploads/')
//   },
//   filename: function (req, file, cb) {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
//     cb(null,   `${uniqueSuffix} - ${file.originalname }`)
//   }
// })

// const upload = multer({ storage: storage })


// const app= express()
// app.use(cors());


// app.get('/',(req,res)=>{
//     return res.json({status: 'All Good'})
// });
// app.post('/upload/pdf', upload.single('pdf') , async (req, res)=>{
//   await queue.add('file-ready', JSON.stringify({
//     filename:req.file.originalname,
//     destination:req.file.destination,
//     path:req.file.path
//   }))
//     res.json({message: 'uploaded'})
// })

// app.get('/chat',async (req,res)=>{
//   const UserQuery=req.query.message;
//   // const embeddings = new OpenAIEmbeddings({
//   //       model: "text-embedding-3-small",
//   //       apiKey: process.env.OPEN_API_KEY
//   //   });
  
//   const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
//         url: process.env.QDRANT_URL,
//         collectionName: "langchainjs-gemini",
//     });
//   const retriever=vectorStore.asRetriever({
//     k:2,
//   })
//   const result=await retriever.invoke(UserQuery);
//   const SYSTEM_PROMPT= `
//   You are an expert AI assistant that answers questions accurately using only the provided context. 

// Strictly adhere to the following rules:
// 1. Rely ONLY on the information given in the "Retrieved Context" section below to answer the user's query. Do not assume, extrapolate, or bring in outside knowledge.
// 2. If the answer cannot be found or logically inferred from the provided context, state clearly: "I cannot find the answer in the provided documents." Do not try to make up an answer.
// 3. Keep your response concise, factual, and directly related to the user's question.
// 4. If the context contains conflicting information, present both sides objectively.
// Context:
// ${JSON.stringify(result)}
//   `
//   // const chatResult=await client.chat.completions.create({
//   //   model:'llama-3.1-8b-instant',
//   //   messages:[
//   //     {"role":"system" , "content": SYSTEM_PROMPT},
//   //     {"role":"user", "content":UserQuery}
//   //   ]

    


//   // })
//   const chatResult = await llm.invoke([
//     ["system", SYSTEM_PROMPT],
//     ["user", UserQuery]
//   ]);
//   // return res.json({message:chatResult.choices[0].message.content,docs: result})
//   return res.json({ message: chatResult.content, docs: result });
// })


// app.listen(8000,()=> console.log(`server running on port ${8000}`)) 