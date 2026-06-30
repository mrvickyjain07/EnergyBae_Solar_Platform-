import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UploadCloud, FileText, FileImage, Sparkles, Check, FileCheck, HardDrive } from "lucide-react";

interface UploaderProps {
  onFileLoaded: (base64Data: string, fileName: string) => void;
  isLoading: boolean;
  selectedFileName: string | null;
}

export default function Uploader({
  onFileLoaded,
  isLoading,
  selectedFileName
}: UploaderProps) {
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const processFile = (file: File) => {
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target && event.target.result) {
        onFileLoaded(event.target.result as string, file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-5">
      {/* 1. Drag & Drop File Loader Zone */}
      <motion.div 
        whileHover={{ scale: 1.01, translateY: -2 }}
        whileTap={{ scale: 0.99 }}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
        className={`glass-panel rounded-3xl p-6 sm:p-8 md:p-10 border-dashed border-2 cursor-pointer transition-all duration-300 relative text-center flex flex-col items-center justify-center min-h-[200px] sm:min-h-[260px] select-none group focus:outline-none ${
          isDragActive 
            ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10 shadow-[0_0_25px_rgba(16,185,129,0.3)]" 
            : "border-[var(--border-subtle)] hover:border-[var(--accent-green)]/40 hover:bg-[var(--hover-bg)] shadow-lg shadow-black/5"
        }`}
      >
        <input 
          ref={fileInputRef}
          type="file" 
          accept="image/*,application/pdf"
          onChange={handleChange}
          className="hidden"
          disabled={isLoading}
        />

        {/* Ambient background sparkle overlay */}
        <div className="absolute top-4 right-4 text-blue-500/10 group-hover:text-blue-400/30 group-hover:scale-110 transition-all duration-500 pointer-events-none">
          <Sparkles className="w-5 h-5 animate-pulse" />
        </div>
        
        {/* Animated glowing back ring */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/10 to-[var(--accent-green)]/0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

        {/* Dynamic Display based on file loaded status */}
        <AnimatePresence mode="wait">
          {selectedFileName ? (
            <motion.div 
              key="loaded"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4 relative z-10"
            >
              <div className="p-4 bg-[var(--accent-green)]/10 rounded-2xl border border-[var(--accent-green)]/30 text-[var(--accent-green)] inline-flex items-center justify-center shadow-lg shadow-[var(--accent-green)]/5">
                {selectedFileName.toLowerCase().endsWith(".pdf") ? (
                  <FileText className="w-12 h-12" />
                ) : (
                  <FileCheck className="w-12 h-12" />
                )}
              </div>
              <div className="space-y-1.5 px-4">
                <p className="text-base font-bold font-display text-[var(--text-primary)] tracking-tight truncate max-w-[340px] mx-auto flex items-center justify-center gap-2">
                  <Check className="w-4 h-4 text-[var(--accent-green)]" /> {selectedFileName}
                </p>
                <div className="flex items-center justify-center gap-2 mt-0.5">
                  <span className="text-[10px] font-mono bg-[var(--accent-green)]/15 text-[var(--accent-green)] px-2 py-0.5 rounded border border-[var(--accent-green)]/20">READY FOR EXTRACTION</span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">{selectedFileName.split('.').pop()} FILE</span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-5 relative z-10"
            >
              <div className="p-4.5 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-subtle)] text-[var(--text-muted)] group-hover:text-[var(--accent-green)] group-hover:border-[var(--accent-green)]/30 group-hover:shadow-[0_0_20px_rgba(37,99,235,0.15)] inline-flex items-center justify-center transition-all duration-300">
                <UploadCloud className="w-10 h-10 group-hover:scale-105 transition-transform" />
              </div>
              
              <div className="space-y-2 max-w-[320px] mx-auto">
                <h3 className="text-base font-semibold font-display text-[var(--text-primary)] tracking-tight leading-tight">
                  Drag & drop your utility bill here, or <span className="text-[var(--accent-green)] font-bold group-hover:underline">browse files</span>
                </h3>
                <p className="text-[11px] text-[var(--text-muted)] font-mono tracking-wider leading-relaxed">
                  SUPPORTED FOR MSEDCL: PDF, JPEG, PNG • UP TO 50MB
                </p>
              </div>

              {/* Badges */}
              <div className="flex items-center justify-center space-x-2 text-[10px] text-[var(--text-muted)] font-mono">
                <span className="border border-[var(--border-subtle)] px-2.5 py-0.5 rounded">PDF</span>
                <span className="border border-[var(--border-subtle)] px-2.5 py-0.5 rounded">PNG</span>
                <span className="border border-[var(--border-subtle)] px-2.5 py-0.5 rounded">JPG</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
