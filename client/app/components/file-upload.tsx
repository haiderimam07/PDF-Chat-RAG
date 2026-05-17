'use client'
import React from 'react'
import {Upload} from 'lucide-react'
const FileUploadComponent: React.FC = () => {
  return (
    <div className='bg-slate-900 text-white shadow-2xl flex justify-center item-center p-4'>
      <Upload />
    </div>
  )
}

export default FileUploadComponent
