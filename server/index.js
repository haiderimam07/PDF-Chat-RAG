import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { Queue } from 'bullmq'
import {OpenAIEmbeddings } from "@langchain/openai"
import {QdrantVectorStore} from "@langchain/qdrant"
import OpenAI from "openai"

const client= new OpenAI({apiKey: process.env.OPEN_API_KEY})
const queue = new Queue('file-upload-queue',{
  connection:{
            host:'localhost',
            port:'6379',
        },
})


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null,   `${uniqueSuffix} - ${file.originalname }`)
  }
})

const upload = multer({ storage: storage })


const app= express()
app.use(cors());


app.get('/',(req,res)=>{
    return res.json({status: 'All Good'})
});
app.post('/upload/pdf', upload.single('pdf') , async (req, res)=>{
  await queue.add('file-ready', JSON.stringify({
    filename:req.file.originalname,
    destination:req.file.destination,
    path:req.file.path
  }))
    res.json({message: 'uploaded'})
})

app.get('/chat',async (req,res)=>{
  const UserQuery='what is the references used in this pdf'
  const embeddings = new OpenAIEmbeddings({
        model: "text-embedding-3-small",
        apiKey: process.env.OPEN_API_KEY
    });
  const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
        url: process.env.QDRANT_URL,
        collectionName: "langchainjs-testing",
    });
  const retr=vectorStore.asRetriever({
    k=2,
  })
  const result=await retriever.invoke(UserQuery);
  const SYSTEM_PROMPT= `
  You are an expert AI assistant that answers questions accurately using only the provided context. 

Strictly adhere to the following rules:
1. Rely ONLY on the information given in the "Retrieved Context" section below to answer the user's query. Do not assume, extrapolate, or bring in outside knowledge.
2. If the answer cannot be found or logically inferred from the provided context, state clearly: "I cannot find the answer in the provided documents." Do not try to make up an answer.
3. Keep your response concise, factual, and directly related to the user's question.
4. If the context contains conflicting information, present both sides objectively.
Context:
${JSON.stringify(result)}
  `
  const chatResult=await client.chat.completions.create({
    model:'gpt-3.5-turbo-instruct',
    message:[
      {"role":"system" , "content": SYSTEM_PROMPT},
      {"role":"user", "content":UserQuery}
    ]
    


  })
  return res.json({message:chatResult.choices[0].message.content,docs: result})
})

app.listen(8000,()=> console.log(`server running on port ${8000}`))