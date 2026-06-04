import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UploadCloud, FileText, FileImage, Sparkles, Check, FileCheck, HardDrive } from "lucide-react";

interface UploaderProps {
  onFileLoaded: (base64Data: string, fileName: string) => void;
  onRunSample: () => void;
  isLoading: boolean;
  selectedFileName: string | null;
}

export default function Uploader({
  onFileLoaded,
  onRunSample,
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
        className={`glass-panel rounded-3xl p-10 border-dashed border-2 cursor-pointer transition-all duration-300 relative text-center flex flex-col items-center justify-center min-h-[260px] select-none group focus:outline-none ${
          isDragActive 
            ? "border-sky-500 bg-sky-950/20 shadow-[0_0_25px_rgba(14,165,233,0.3)]" 
            : "border-slate-800 hover:border-sky-500/40 hover:bg-slate-900/30 shadow-lg shadow-black/30"
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
        <div className="absolute top-4 right-4 text-sky-500/10 group-hover:text-sky-400/30 group-hover:scale-110 transition-all duration-500 pointer-events-none">
          <Sparkles className="w-5 h-5 animate-pulse" />
        </div>
        
        {/* Animated glowing back ring */}
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-emerald-500/0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

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
              <div className="p-4 bg-sky-900/20 rounded-2xl border border-sky-500/30 text-sky-400 inline-flex items-center justify-center shadow-lg shadow-sky-900/10">
                {selectedFileName.toLowerCase().endsWith(".pdf") ? (
                  <FileText className="w-12 h-12" />
                ) : (
                  <FileCheck className="w-12 h-12" />
                )}
              </div>
              <div className="space-y-1.5 px-4">
                <p className="text-base font-bold font-display text-white tracking-tight truncate max-w-[340px] mx-auto flex items-center justify-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" /> {selectedFileName}
                </p>
                <div className="flex items-center justify-center gap-2 mt-0.5">
                  <span className="text-[10px] font-mono bg-sky-550/15 text-sky-300 px-2 py-0.5 rounded border border-sky-400/20">READY FOR EXTRACTION</span>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">{selectedFileName.split('.').pop()} FILE</span>
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
              <div className="p-4.5 bg-slate-900/80 rounded-2xl border border-slate-800 text-slate-400 group-hover:text-sky-400 group-hover:border-sky-500/30 group-hover:shadow-[0_0_20px_rgba(14,165,233,0.15)] inline-flex items-center justify-center transition-all duration-300">
                <UploadCloud className="w-10 h-10 group-hover:scale-105 transition-transform" />
              </div>
              
              <div className="space-y-2 max-w-[320px] mx-auto">
                <h3 className="text-base font-semibold font-display text-slate-200 tracking-tight leading-tight">
                  Drag & drop your utility bill here, or <span className="text-sky-400 font-bold group-hover:underline">browse files</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-mono tracking-wider leading-relaxed">
                  SUPPORTED FOR MSEDCL: PDF, JPEG, PNG • UP TO 50MB
                </p>
              </div>

              {/* Badges */}
              <div className="flex items-center justify-center space-x-2 text-[10px] text-slate-600 font-mono">
                <span className="border border-slate-800 px-2.5 py-0.5 rounded">PDF</span>
                <span className="border border-slate-800 px-2.5 py-0.5 rounded">PNG</span>
                <span className="border border-slate-800 px-2.5 py-0.5 rounded">JPG</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 2. Interactive Feature Demo Trigger */}
      <div className="glass-panel rounded-2xl p-5 border-slate-800/50 flex flex-col sm:flex-row items-center justify-between gap-4 bg-emerald-950/5 relative overflow-hidden">
        {/* Glow corner inside activator */}
        <div className="absolute right-0 bottom-0 w-24 h-24 rounded-full bg-emerald-500/10 blur-xl pointer-events-none"></div>

        <div className="flex items-start text-left gap-3 relative z-10">
          <div className="p-2.5 bg-emerald-900/20 rounded-xl border border-emerald-900/30 text-emerald-400 shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold font-display text-emerald-300 tracking-wide">Interactive Platform Demo</h4>
            <p className="text-[11px] text-slate-400 leading-normal max-w-[350px] mt-0.5">
              Don't have an electricity bill file ready? Start immediately with a <b className="text-slate-200">sample bill</b> to witness the speed of the cognitive extraction and solar recommendation engine.
            </p>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRunSample();
          }}
          disabled={isLoading}
          className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-xs font-bold font-display text-white shadow-lg shadow-emerald-950/40 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 select-none cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          Run Demo Bill
        </motion.button>
      </div>
    </div>
  );
}
