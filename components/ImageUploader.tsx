import React, { useCallback, useState } from 'react';

interface ImageUploaderProps {
  onImagesSelected: (images: Array<{ base64: string, mimeType: string, previewUrl: string }>) => void;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImagesSelected }) => {
  const [isDragging, setIsDragging] = useState(false);

  const processFiles = (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (validFiles.length === 0) return;

    const promises = validFiles.map(file => {
        return new Promise<{ base64: string, mimeType: string, previewUrl: string }>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                // Remove data URL prefix for Gemini API (base64 only)
                const base64 = result.split(',')[1];
                const mimeType = file.type;
                resolve({ base64, mimeType, previewUrl: result });
            };
            reader.readAsDataURL(file);
        });
    });

    Promise.all(promises).then(images => {
        onImagesSelected(images);
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        relative w-full max-w-2xl mx-auto h-80 rounded-3xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer group overflow-hidden
        ${isDragging 
          ? 'border-emerald-400 bg-emerald-950/20' 
          : 'border-slate-700 hover:border-slate-500 bg-slate-900/50 hover:bg-slate-900'}
      `}
    >
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
        </div>

      <input
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />

      <div className="z-0 p-8 pointer-events-none">
        <div className={`w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center transition-transform group-hover:scale-110 ${isDragging ? 'scale-110 bg-emerald-900 text-emerald-400' : 'text-slate-400'}`}>
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
        </div>
        <h3 className="text-xl font-bold text-slate-200 mb-2">
            {isDragging ? 'Drop Intelligence Here' : 'Upload Evidence'}
        </h3>
        <p className="text-slate-400 max-w-sm mx-auto">
          Drag and drop one or more photographs, or click to browse. We support JPG, PNG, and WEBP.
        </p>
      </div>
    </div>
  );
};

export default ImageUploader;