import { Worker } from "bullmq";
import {OpenAIEmbeddings } from "@langchain/OpenAi"
import {QdrantVectorStore} from "@langchain/qdrant"
import {Document} from "@langchain/core/documents"
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const worker= new Worker('file-upload-queue', async (job) =>{
    console.log(`job:`, job.data);
    const data= JSON.parse(job.data)
    // steps to do now as pdf has reached to the server
    /*
        Read the data from the path that we can get form data.path 
        chunk the pdf
        call the open AI embedding model for the chunk of the pdf
        store the chunk in quadrant db
        load the pdf using langchian pdf loader
    */
    // load the pdf     
    const loader = new PDFLoader(data.path)
    const docs = await loader.load()
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 300, chunkOverlap: 0 })
    const texts = await splitter.splitDocuments(docs)
    console.log(texts)

    },
    {
        concurrency:100,
        connection:{
            host:'localhost',
            port:'6379',
        },
    }
);
